// main.js - New application entry point
const express = require('express');
const { app, client, validateSignature, appConfig } = require('./src/core/server_setup'); 
const { generateChatReply, recordMessage } = require('./src/features/ai_chat');
const reminderModule = require('./src/features/reminder_module');
const flexMessages = require('./src/ui/flex_messages');
const { createErrorReply, createTextMessage } = require('./src/ui/flex_messages'); // Also import createTextMessage

// Make client available globally for reminder_module callbacks
global.lineClient = client;

// Define a global handler for executed reminders (called by reminder_module)
global.handleExecutedReminder = async (reminder) => {
  console.log(`🤖 [MAIN] Handling executed reminder ${reminder.id} for user ${reminder.userId}`);
  if (reminder.fallbackMessage) { 
    // This means Twilio call failed and a fallback LINE message should be sent
    await client.pushMessage(reminder.userId, createTextMessage(reminder.fallbackMessage));
  } else if (reminder.reminderMethod === 'line') {
    const lineNotification = flexMessages.createReminderNotificationCard(reminder);
    await client.pushMessage(reminder.userId, lineNotification);
  }
  // For 'twilio' method, if successful, the call is made by reminder_module (stubbed), no LINE message here unless it's a fallback.
};


// Set timezone
process.env.TZ = 'Asia/Taipei';

// Function to determine if a text message is a reminder-related query
function isReminderQuery(text) {
  const lowerText = text.toLowerCase();
  const reminderKeywords = ['提醒我', '鬧鐘', '叫我起床', 'call alarm', '打電話提醒', '用電話叫我'];
  return reminderKeywords.some(keyword => lowerText.includes(keyword));
}


app.post('/webhook', express.raw({type: 'application/json'}), validateSignature, async (req, res) => {
  const events = req.body.events; 

  if (!events || !Array.isArray(events)) { 
    console.log('🤖 [MAIN] Webhook received no events array or body was not parsed correctly.');
    return res.status(200).json({ status: 'ok', message: 'No events array processed.' });
  }

  console.log('🤖 [MAIN] Received events:', JSON.stringify(events, null, 2));

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const sourceId = event.source.groupId || userId; // For group or direct chat context
      const isGroup = !!event.source.groupId;
      const messageText = event.message.text.trim();
      let userName = '使用者'; // Default

      // Basic user name fetching (can be expanded)
      try {
        if (isGroup && userId) {
           userName = `群組中的使用者 (${userId.slice(-6)})`;
        } else if (userId) {
          // const profile = await client.getProfile(userId); userName = profile.displayName;
        }
      } catch (err) {
        console.error(`🤖 [MAIN] Error fetching profile for ${userId}:`, err.message);
      }
      
      console.log(`🤖 [MAIN] Processing text message from ${userName} (ID: ${sourceId}) in ${isGroup ? 'group' : 'private chat'}: "${messageText}"`);

      // Reminder Commands
      if (isReminderQuery(messageText)) {
        const reminderDetails = reminderModule.parseReminderText(messageText); // userId not strictly needed here now
        if (reminderDetails) {
          const reminder = await reminderModule.setReminder(userId, sourceId, reminderDetails);
          if (reminder) {
            const confirmationMsg = flexMessages.createReminderSetConfirmation(reminder);
            await safeReply(event.replyToken, confirmationMsg);
          } else {
            await safeReply(event.replyToken, createTextMessage("提醒設定失敗，可能是時間格式無法解析或時間已過。"));
          }
        } else {
          await safeReply(event.replyToken, createTextMessage("無法理解您的提醒時間，請試試如「提醒我明天早上9點開會」或「10分鐘後叫我起床」。"));
        }
        continue; // Skip other handlers if it's a reminder command
      } else if (messageText.toLowerCase() === '/reminders' || messageText === '我的提醒') {
        const userReminders = reminderModule.listUserReminders(userId);
        const listMsg = flexMessages.createRemindersList(userReminders, userId);
        await safeReply(event.replyToken, listMsg);
        continue;
      } else if (messageText.toLowerCase().startsWith('/取消提醒 ')) {
        const reminderIdToCancel = messageText.substring('/取消提醒 '.length).trim();
        if (reminderIdToCancel) {
          const success = await reminderModule.clearReminder(reminderIdToCancel);
          if (success) {
            await safeReply(event.replyToken, createTextMessage(`提醒 ID: ${reminderIdToCancel} 已取消。`));
          } else {
            await safeReply(event.replyToken, createTextMessage(`找不到提醒 ID: ${reminderIdToCancel}，或它已被觸發。`));
          }
        } else {
          await safeReply(event.replyToken, createTextMessage("請提供要取消的提醒ID，格式： /取消提醒 [ID]"));
        }
        continue;
      }

      // AI Chat (if not a reminder command)
      recordMessage(sourceId, userName, messageText, false);
      try {
        const replyText = await generateChatReply(sourceId, userName, messageText, isGroup);
        if (replyText) {
          recordMessage(sourceId, 'AI小幫手', replyText, true);
          console.log(`🤖 [MAIN] Sending AI reply to ${sourceId}: "${replyText.substring(0, 50)}..."`);
          await safeReply(event.replyToken, { type: 'text', text: replyText });
        } else {
          console.log(`🤖 [MAIN] No AI reply generated for ${sourceId}.`);
        }
      } catch (error) {
        console.error(`🤖 [MAIN] Error during AI reply generation or sending for ${sourceId}:`, error);
        const errorReplyMessage = createErrorReply('AI處理您的請求時發生問題。', `EVT-${event.timestamp}`);
        await safeReply(event.replyToken, errorReplyMessage);
      }

    } else {
      console.log(`🤖 [MAIN] Non-text message event type "${event.type}" received, or message type "${event.message?.type}". Skipping.`);
    }
  }

  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simplified safeReply for this context
async function safeReply(replyToken, message) {
    try {
        await client.replyMessage(replyToken, message);
        return true;
    } catch (error) {
        console.error(`🤖 [MAIN] safeReply failed:`, error.message);
        if (error.originalError && error.originalError.response) {
            console.error("LINE API Error Details:", error.originalError.response.data);
        }
        return false;
    }
}


app.get('/', (req, res) => {
  const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  res.send(\`
    <h1>New Bot Core Running!</h1>
    <p>Welcome to the refactored LINE Bot.</p>
    <p>Current Server Time (Asia/Taipei): \${currentTime}</p>
    <p>Port: \${appConfig.port}</p>
    <p>Owner LINE ID (from config): \${appConfig.ownerLineId ? 'Configured' : 'Not Configured'}</p>
    <p>Gemini API Key (from config): \${appConfig.geminiApiKey && !appConfig.geminiApiKey.includes('AIzaSy') && !appConfig.geminiApiKey.includes('YOUR_GEMINI_API_KEY_PLACEHOLDER') ? 'Configured' : 'Using Default/Placeholder'}</p>
    <p>Twilio Client (from config): \${appConfig.twilioAccountSid && !appConfig.twilioAccountSid.includes('PLACEHOLDER') ? 'Configured' : 'Using Default/Placeholder or Not Initialized'}</p>
    <p>Webhook is at /webhook</p>
  \`);
});

app.use((err, req, res, next) => { 
  console.error("🤖 [MAIN] Unhandled error in Express chain:", err);
  if (res.headersSent) {
    return next(err); 
  }
  const errorReply = createErrorReply("伺服器發生內部錯誤，請稍後再試。", "GLOBAL-ERR");
  // Cannot use LINE reply here as we don't have replyToken. Send generic HTTP error.
  res.status(500).json({ error: "Internal Server Error", details: errorReply.text }); 
});


app.listen(appConfig.port, '0.0.0.0', () => {
  console.log(\`🚀 New Bot Server listening on port \${appConfig.port}\`);
  console.log(\`⏰ Current time: \${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\`);
  console.log(\`🔗 Webhook URL should be configured to: /webhook\`);
  if (appConfig.nodeEnv === 'development') {
    console.log(\`🛠️  Running in development mode.\`);
  }
});

module.exports = app; 
console.log("main.js loaded and server configured. Listener started.");
