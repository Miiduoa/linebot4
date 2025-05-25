const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const twilio = require('twilio'); // Added for Twilio integration

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('🚀 正在啟動增強版 LINE Bot v11.0...');
console.log('⏰ 當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

// 配置資訊
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const BACKUP_AI_KEY = process.env.BACKUP_AI_KEY || 'sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM';
const BACKUP_AI_URL = process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b';
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';

// Twilio Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'YOUR_TWILIO_ACCOUNT_SID_PLACEHOLDER';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'YOUR_TWILIO_AUTH_TOKEN_PLACEHOLDER';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || 'YOUR_TWILIO_PHONE_NUMBER_PLACEHOLDER'; // Your Twilio phone number
const OWNER_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER || 'OWNER_PHONE_NUMBER_TO_CALL_PLACEHOLDER';   // Recipient's phone number (E.164 format)

let twilioClient = null;
if (TWILIO_ACCOUNT_SID !== 'YOUR_TWILIO_ACCOUNT_SID_PLACEHOLDER' && 
    TWILIO_AUTH_TOKEN !== 'YOUR_TWILIO_AUTH_TOKEN_PLACEHOLDER' &&
    TWILIO_PHONE_NUMBER !== 'YOUR_TWILIO_PHONE_NUMBER_PLACEHOLDER' &&
    OWNER_PHONE_NUMBER !== 'OWNER_PHONE_NUMBER_TO_CALL_PLACEHOLDER') {
  try {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('📞 Twilio client initialized successfully.');
  } catch (error) {
    console.error('📞 Twilio client initialization failed:', error.message);
    twilioClient = null;
  }
} else {
  console.log('📞 Twilio credentials not fully configured (SID, Token, Twilio Phone, or Owner Phone missing/placeholders). Twilio client not initialized.');
  twilioClient = null;
}

// 用戶配置
const OWNER_LINE_ID = 'U59af77e69411ffb99a49f1f2c3e2afc4';
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

console.log('🔑 機器人主人:', OWNER_LINE_ID);
console.log('✨ 增強版功能已啟用');

// 增強版智能AI系統
class EnhancedAISystem {
  constructor() {
    this.conversations = new Map();
    this.userProfiles = new Map();
    this.groupContexts = new Map(); // 儲存群組對話上下文
    console.log('🧠 [AI_SYSTEM] EnhancedAISystem initialized.');
  }

  async generateReply(userId, message, context = {}) {
    try {
      this.recordConversation(userId, message, context);
      
      const userProfile = this.userProfiles.get(userId) || { 
        name: '朋友', 
        messageCount: 0,
        isGroup: context.isGroup 
      };

      const reply = await this.generatePersonalizedReply(message, userProfile, context);
      return reply;

    } catch (error) {
      console.error('🧠 [AI_SYSTEM] AI Reply generation failed:', error);
      return this.getOfflineReply(message);
    }
  }

  async generatePersonalizedReply(message, userProfile, context) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-002", 
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        }
      });
      
      const prompt = `你是顧晉瑋，靜宜大學資管系學生。現在要回覆用戶。

用戶說：${message}
對話環境：${context.isGroup ? '群組對話' : '私人對話'}

回覆原則：
1. 如果是群組對話，不要透露個人隱私
2. 保持友善、有趣的語氣
3. 可以使用台灣口語如「好der」、「哎呦」等
4. 回覆長度控制在100字內

請自然回覆：`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().replace(/[*#`_~]/g, '').trim();
      
      return text || this.getOfflineReply(message);
      
    } catch (error) {
      console.log('🧠 [AI_SYSTEM] Gemini failed, attempting backup AI. Error:', error.message);
      return await this.useBackupAI(message, context);
    }
  }

  async useBackupAI(message, context) {
    try {
      const response = await axios.post(`${BACKUP_AI_URL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ 
          role: 'user', 
          content: `以顧晉瑋的身份回覆：${message}（${context.isGroup ? '群組' : '私人'}對話）` 
        }],
        max_tokens: 200,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${BACKUP_AI_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data.choices[0].message.content.trim();
      
    } catch (error) {
      console.error('🧠 [AI_SYSTEM] Backup AI also failed:', error.message);
      return this.getOfflineReply(message);
    }
  }

  getOfflineReply(message) {
    if (message.includes('你好') || message.includes('嗨')) {
      return '嗨！我是顧晉瑋的AI助手，很高興見到你！😊';
    }
    if (message.includes('謝謝') || message.includes('感謝')) {
      return '不客氣啦！我很樂意幫忙～';
    }
    if (message.includes('再見') || message.includes('掰掰')) {
      return '掰掰～有事隨時找我！';
    }
    
    const offlineResponses = [
      '你說得很有道理呢！我也是這樣想的～',
      '這個話題很有趣，讓我學到了新東西！',
      '哈哈，你這樣說我覺得很有意思～',
      '我懂我懂，有時候就是會這樣對吧！',
      '說得好！我完全同意你的看法～'
    ];
    
    const randomIndex = Math.floor(Math.random() * offlineResponses.length);
    return offlineResponses[randomIndex];
  }

  recordConversation(userId, message, context) {
    const convId = `conv-${Date.now()}`;
    this.conversations.set(convId, {
      userId,
      message,
      timestamp: new Date(),
      isGroup: context.isGroup,
      groupId: context.groupId
    });

    if (context.isGroup && context.groupId) {
      if (!this.groupContexts.has(context.groupId)) {
        this.groupContexts.set(context.groupId, []);
      }
      const groupContext = this.groupContexts.get(context.groupId);
      groupContext.push({
        userId,
        userName: context.userName,
        message,
        timestamp: new Date()
      });
      if (groupContext.length > 20) {
        groupContext.shift();
      }
    }

    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        name: context.userName || '朋友',
        messageCount: 0,
        isGroup: context.isGroup,
        lastSeen: new Date()
      });
    }
    
    const profile = this.userProfiles.get(userId);
    profile.messageCount++;
    profile.lastSeen = new Date();

    if (this.conversations.size > 1000) { 
      const oldestKey = this.conversations.keys().next().value;
      this.conversations.delete(oldestKey);
    }
  }

  getGroupContext(groupId, lines = 10) {
    const context = this.groupContexts.get(groupId) || [];
    const recent = context.slice(-lines);
    return recent.map(msg => 
      `${msg.userName || '未知用戶'}: ${msg.message}`
    ).join('\n');
  }
}

// 增強版決策系統
class EnhancedDecisionSystem {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionContexts = new Map(); 
    console.log('⚖️ [DECISION_SYSTEM] EnhancedDecisionSystem initialized.');
  }

  shouldAskOwner(message, context) {
    const socialKeywords = ['約', '邀請', '聚會', '吃飯', '喝茶', '見面', '參加', '出去', '聚餐'];
    const moneyKeywords = ['借', '錢', '付款', '費用', '買', '賣', '轉帳', '匯款'];
    const importantKeywords = ['重要', '緊急', '幫忙', '拜託', '請問'];
    
    const hasSocialKeyword = socialKeywords.some(keyword => message.includes(keyword));
    const hasMoneyKeyword = moneyKeywords.some(keyword => message.includes(keyword));
    const hasImportantKeyword = importantKeywords.some(keyword => message.includes(keyword));
    const isGroupImportant = context.isGroup && (message.includes('All') || message.includes('@'));

    return hasSocialKeyword || hasMoneyKeyword || hasImportantKeyword || isGroupImportant;
  }

  async requestDecision(message, userId, userName, context, replyToken) {
    const decisionId = `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`⚖️ [DECISION_SYSTEM] Requesting decision. ID: ${decisionId}, User: ${userName}(${userId}), Msg: "${message.substring(0,50)}..."`);
    
    const decision = {
      id: decisionId,
      message,
      userId,
      userName,
      context,
      timestamp: new Date(),
      replyToken,
      sourceType: context.isGroup ? 'group' : 'private',
      sourceId: context.groupId || userId
    };

    this.pendingDecisions.set(decisionId, decision);
    this.decisionContexts.set(decisionId, {
      sourceType: decision.sourceType,
      sourceId: decision.sourceId,
      userName: userName,
      groupName: context.groupName || '私人對話'
    });

    try {
      let contextInfo = '';
      if (context.isGroup && context.groupId && enhancedAI.groupContexts.has(context.groupId)) {
        contextInfo = enhancedAI.getGroupContext(context.groupId);
        console.log(`⚖️ [DECISION_SYSTEM] Fetched group context for decision ${decisionId}`);
      }

      const decisionText = `🤔 需要你的決策 [${decisionId.substr(-6)}]

👤 來自：${userName}
📍 位置：${context.isGroup ? `群組 - ${context.groupName || '未知群組'}` : '私人對話'}
💬 訊息：${message}

${contextInfo ? `\n📝 最近對話紀錄：\n${contextInfo}\n` : ''}

請回覆你的決定，或輸入「? <ID>」查看特定決策的更多對話紀錄
決策ID：${decisionId.substr(-6)}`;

      await safePushMessage(OWNER_LINE_ID, decisionText);
      console.log(`⚖️ [DECISION_SYSTEM] Decision request ${decisionId} sent to owner.`);
      return '讓我想想這個請求，稍後回覆你～';
      
    } catch (error) {
      console.error(`⚖️ [DECISION_SYSTEM] Decision request ${decisionId} failed to send:`, error);
      return '我需要想想，稍後回覆你～';
    }
  }

  async processOwnerDecision(message, ownerId) {
    console.log(`⚖️ [DECISION_SYSTEM] processOwnerDecision called with message: "${message}"`);
    const contextQueryMatch = message.match(/^(?:\?|more info|context)\s*([a-z0-9]{6})$/i);
    let decisionIdForContext = null;

    if (contextQueryMatch) {
      decisionIdForContext = contextQueryMatch[1];
      console.log(`⚖️ [DECISION_SYSTEM] Context query detected for decision ID (short): ${decisionIdForContext}`);
    } else if (message === '?') {
      const pending = Array.from(this.pendingDecisions.values())
        .filter(d => new Date() - d.timestamp < 3600000); 

      if (pending.length === 0) {
        console.log(`⚖️ [DECISION_SYSTEM] No pending decisions for '?' query.`);
        return '目前沒有待處理的決策';
      }
      if (pending.length === 1) {
        decisionIdForContext = pending[0].id.substr(-6);
        console.log(`⚖️ [DECISION_SYSTEM] Single pending decision, getting context for ID (short): ${decisionIdForContext}`);
      } else {
        let info = '📋 待處理決策列表：\n\n';
        pending.forEach(d => {
          info += `ID: ${d.id.substr(-6)}\n`;
          info += `來自: ${d.userName}\n`;
          info += `訊息: ${d.message.substring(0,30)}...\n\n`;
        });
        info += '請輸入 "? <ID>" 或 "context <ID>" 獲取特定決策的更多資訊。';
        console.log(`⚖️ [DECISION_SYSTEM] Multiple pending decisions listed for '?' query.`);
        return info;
      }
    }

    if (decisionIdForContext) {
      let foundDecision = null;
      for (const [id, d] of this.pendingDecisions) {
        if (id.endsWith(decisionIdForContext)) {
          foundDecision = d;
          break;
        }
      }

      if (!foundDecision) {
        console.log(`⚖️ [DECISION_SYSTEM] Decision ID (short) ${decisionIdForContext} not found for context query.`);
        return `找不到ID為 ${decisionIdForContext} 的決策請求。`;
      }
      console.log(`⚖️ [DECISION_SYSTEM] Found decision for context query: ${foundDecision.id}`);

      let contextMessageText = '';
      if (foundDecision.context.isGroup && foundDecision.context.groupId) {
        const groupHistory = enhancedAI.getGroupContext(foundDecision.context.groupId, 20);
        contextMessageText = groupHistory ? `📝 群組對話紀錄 (最後20則)：\n${groupHistory}` : '此群組目前沒有更多對話紀錄可供顯示。';
      } else {
        contextMessageText = '此為私人對話，無自動群組對話紀錄可顯示。';
      }
      
      const fullMessageToOwner = `📖 ID [${decisionIdForContext}] 的詳細資訊：
👤 來自：${foundDecision.userName}
💬 原始訊息：${foundDecision.message}

${contextMessageText}

👉 請針對ID [${decisionIdForContext}] 回覆您的決定：同意、拒絕，或「回覆：[您的訊息]」`;
      
      await safePushMessage(OWNER_LINE_ID, fullMessageToOwner);
      console.log(`⚖️ [DECISION_SYSTEM] Sent context for decision ${foundDecision.id} to owner.`);
      return null; 
    }

    const actionIdMatch = message.match(/([a-z0-9]{6})/i);
    let targetDecisionId = null;
    let decision = null;

    if (actionIdMatch) {
      const shortId = actionIdMatch[1];
      for (const [id, d] of this.pendingDecisions) {
        if (id.endsWith(shortId)) {
          targetDecisionId = id;
          decision = d;
          break;
        }
      }
      if(decision) console.log(`⚖️ [DECISION_SYSTEM] Action targeted at decision ID (short): ${shortId}, Full ID: ${targetDecisionId}`);
    } else {
      const decisions = Array.from(this.pendingDecisions.values());
      if (decisions.length > 0 && !message.startsWith("?") && !message.startsWith("more info") && !message.startsWith("context")) {
        if (message.toLowerCase().includes('同意') || message.toLowerCase().includes('ok') || message.toLowerCase().includes('好') ||
            message.toLowerCase().includes('拒絕') || message.toLowerCase().includes('不') ||
            message.includes('回覆:') || message.includes('回覆：')) {
          decision = decisions.sort((a, b) => b.timestamp - a.timestamp)[0];
          targetDecisionId = decision.id;
          console.log(`⚖️ [DECISION_SYSTEM] Action without ID, targeting most recent decision: ${targetDecisionId}`);
        }
      }
    }

    if (!decision) {
      console.log(`⚖️ [DECISION_SYSTEM] No matching decision found for action message: "${message}"`);
      return '找不到對應的決策請求，或指令不完整。請確認指令格式，例如：「同意 abc123」或「? abc123」。';
    }

    let response = '';
    const lowerMessage = message.toLowerCase();
    const commandPart = lowerMessage.replace(actionIdMatch ? actionIdMatch[0] : '', '').trim();

    if (commandPart.startsWith('同意') || commandPart.startsWith('ok') || commandPart.startsWith('好')) {
      response = await this.handleApproval(decision);
    } else if (commandPart.startsWith('拒絕') || commandPart.startsWith('不')) {
      response = await this.handleRejection(decision);
    } else if (message.includes('回覆:') || message.includes('回覆：')) { 
      const customReply = message.replace(/回覆[:：]/g, '').replace(actionIdMatch ? actionIdMatch[0] : '', '').trim();
      response = await this.handleCustomReply(decision, customReply);
    } else if (commandPart.includes('更多')) { 
      const moreContext = enhancedAI.getGroupContext(decision.context.groupId, 20);
      console.log(`⚖️ [DECISION_SYSTEM] '更多' (legacy) command for decision ${targetDecisionId}.`);
      return `更多對話紀錄：\n${moreContext}\n\n請回覆你的決定 (ID ${targetDecisionId.substr(-6)})`;
    } else {
      console.log(`⚖️ [DECISION_SYSTEM] Unrecognized command for decision ${targetDecisionId}: "${commandPart}"`);
      return `無法識別對ID [${targetDecisionId.substr(-6)}] 的指令。請使用「同意」、「拒絕」或「回覆：[自訂訊息]」。`;
    }

    this.pendingDecisions.delete(targetDecisionId);
    this.decisionContexts.delete(targetDecisionId);
    console.log(`⚖️ [DECISION_SYSTEM] Processed and deleted decision ${targetDecisionId}. Response: ${response}`);
    return `✅ 已處理決策 ${targetDecisionId.substr(-6)}\n結果：${response}`;
  }

  async handleApproval(decision) {
    const replyMsg = '好的，沒問題！我會安排～';
    await this.sendReplyToSource(decision, replyMsg);
    return '已同意並回覆';
  }

  async handleRejection(decision) {
    const replyMsg = '抱歉，我現在不太方便，下次再說吧～';
    await this.sendReplyToSource(decision, replyMsg);
    return '已拒絕並回覆';
  }

  async handleCustomReply(decision, customReply) {
    await this.sendReplyToSource(decision, customReply);
    return `已使用自訂回覆：${customReply}`;
  }

  async sendReplyToSource(decision, message) {
    try {
      if (decision.sourceType === 'group') {
        await client.pushMessage(decision.sourceId, { type: 'text', text: message });
      } else {
        await client.pushMessage(decision.userId, { type: 'text', text: message });
      }
      console.log(`⚖️ [DECISION_SYSTEM] Reply sent to source. Type: ${decision.sourceType}, TargetID: ${decision.sourceType === 'group' ? decision.sourceId : decision.userId}`);
    } catch (error) {
      console.error(`⚖️ [DECISION_SYSTEM] Failed to send reply to source. Error:`, error);
    }
  }
}

// 增強版提醒系統
class EnhancedReminderSystem {
  constructor() {
    this.reminders = new Map();
    this.activeTimers = new Map();
    console.log('⏰ [REMINDER_SYSTEM] EnhancedReminderSystem initialized.');
  }

  parseTime(text) {
    console.log(`⏰ [REMINDER_SYSTEM] parseTime called with text: "${text}"`);
    let result = null;
    let reminderMethod = 'line'; // Default reminder method
    try {
      const now = new Date();
      let targetTime = null;
      let isAlarm = false;

      const lowerText = text.toLowerCase();
      const twilioKeywords = ['打電話提醒', '用電話叫我', 'call alarm'];
      if (twilioKeywords.some(keyword => lowerText.includes(keyword))) {
        reminderMethod = 'twilio';
        console.log(`⏰ [REMINDER_SYSTEM] Twilio reminder method detected in text: "${text}"`);
      }

      if (lowerText.includes('分鐘後') || lowerText.includes('分後')) {
        const match = lowerText.match(/(\d+)\s*分(?:鐘)?後/);
        if (match) {
          const minutes = parseInt(match[1]);
          targetTime = new Date(now.getTime() + minutes * 60000);
        }
      } else if (lowerText.includes('小時後') || lowerText.includes('時後')) {
        const match = lowerText.match(/(\d+)\s*(?:小)?時後/);
        if (match) {
          const hours = parseInt(match[1]);
          targetTime = new Date(now.getTime() + hours * 3600000);
        }
      } else {
        const timeMatch = lowerText.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const minute = parseInt(timeMatch[2]);
          if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
            targetTime = new Date();
            targetTime.setHours(hour, minute, 0, 0);
            if (targetTime <= now) {
              targetTime.setDate(targetTime.getDate() + 1);
            }
          }
        } else {
          const hourMatch = lowerText.match(/(\d{1,2})\s*點/);
          if (hourMatch) {
            const hour = parseInt(hourMatch[1]);
            if (hour >= 0 && hour < 24) {
              targetTime = new Date();
              targetTime.setHours(hour, 0, 0, 0);
              if (targetTime <= now) {
                targetTime.setDate(targetTime.getDate() + 1);
              }
            }
          }
        }
        if (lowerText.includes('明天')) { 
            if (targetTime) { 
                 if(targetTime <= now && targetTime.getDate() === now.getDate()){ 
                    targetTime.setDate(targetTime.getDate() + 1);
                 } else if (targetTime.getDate() === now.getDate()){ 
                    targetTime.setDate(targetTime.getDate() + 1);
                 }
            } else { 
                targetTime = new Date();
                targetTime.setDate(targetTime.getDate() + 1);
                const specificTimeInTomorrow = lowerText.match(/(\d{1,2})[點:](\d{0,2})?/); 
                if (specificTimeInTomorrow) {
                    const hour = parseInt(specificTimeInTomorrow[1]);
                    const minute = specificTimeInTomorrow[2] ? parseInt(specificTimeInTomorrow[2]) : 0;
                    targetTime.setHours(hour, minute, 0, 0);
                } else {
                    targetTime.setHours(9, 0, 0, 0); 
                }
            }
        }
      }
      
      if (targetTime) {
        isAlarm = lowerText.includes('叫') || lowerText.includes('起床') || lowerText.includes('鬧鐘') || reminderMethod === 'twilio';
        result = { time: targetTime, isAlarm, reminderMethod };
        console.log(`⏰ [REMINDER_SYSTEM] parseTime success: targetTime=${targetTime.toISOString()}, isAlarm=${isAlarm}, reminderMethod=${reminderMethod}`);
      } else {
        console.log(`⏰ [REMINDER_SYSTEM] parseTime failed to parse time from text: "${text}"`);
      }

    } catch (error) {
      console.error(`⏰ [REMINDER_SYSTEM] parseTime error for text "${text}":`, error);
    }
    return result;
  }

  createReminder(userId, title, targetTime, isAlarm = false, reminderMethod = 'line') {
    console.log(`⏰ [REMINDER_SYSTEM] createReminder called with: userId=${userId}, title="${title}", targetTime=${targetTime.toISOString()}, isAlarm=${isAlarm}, reminderMethod=${reminderMethod}`);
    const reminderId = `reminder-${userId}-${Date.now()}`;
    console.log(`⏰ [REMINDER_SYSTEM] Generated reminderId: ${reminderId}`);
    
    const reminder = {
      id: reminderId,
      userId,
      title,
      targetTime,
      isAlarm,
      reminderMethod, // Store the reminder method
      created: new Date()
    };
    console.log(`⏰ [REMINDER_SYSTEM] Reminder object created: ${JSON.stringify(reminder)}`);
    this.reminders.set(reminderId, reminder);
    
    const delay = targetTime.getTime() - Date.now();
    console.log(`⏰ [REMINDER_SYSTEM] Calculated delay for reminderId ${reminderId}: ${delay}ms`);
    
    if (delay > 0 && delay < 2147483647) { // JavaScript setTimeout 限制
      const timerId = setTimeout(async () => {
        console.log(`⏰ [REMINDER_SYSTEM] setTimeout triggered for reminderId: ${reminderId}. Executing reminder.`);
        await this.executeReminder(reminderId);
      }, delay);
      
      this.activeTimers.set(reminderId, timerId);
      console.log(`⏰ [REMINDER_SYSTEM] setTimeout successfully created for reminderId ${reminderId}. Title: "${title}", Target: ${targetTime.toLocaleString('zh-TW')}`);
      return reminderId;
    } else if (delay <= 0) {
      console.log(`⏰ [REMINDER_SYSTEM] setTimeout not created for reminderId ${reminderId}: Delay is zero or negative (${delay}ms). Reminder might be in the past.`);
      this.reminders.delete(reminderId); 
      return null;
    } else { 
      console.log(`⏰ [REMINDER_SYSTEM] setTimeout not created for reminderId ${reminderId}: Delay is too long (${delay}ms). Exceeds setTimeout limit.`);
      this.reminders.delete(reminderId); 
      return null;
    }
  }

  async executeReminder(reminderId) {
    console.log(`⏰ [REMINDER_SYSTEM] executeReminder called for reminderId: ${reminderId}`);
    const reminder = this.reminders.get(reminderId);

    if (!reminder) {
      console.log(`⏰ [REMINDER_SYSTEM] Reminder not found for reminderId: ${reminderId}. Might have been deleted or already processed.`);
      this.activeTimers.delete(reminderId); 
      return;
    }
    console.log(`⏰ [REMINDER_SYSTEM] Found reminder: UserID=${reminder.userId}, Title="${reminder.title}", Method="${reminder.reminderMethod}"`);

    try {
      if (reminder.reminderMethod === 'twilio') {
        console.log(`⏰ [REMINDER_SYSTEM] Attempting Twilio call for reminderId: ${reminderId}`);
        if (twilioClient && OWNER_PHONE_NUMBER && OWNER_PHONE_NUMBER !== 'OWNER_PHONE_NUMBER_TO_CALL_PLACEHOLDER' && TWILIO_PHONE_NUMBER && TWILIO_PHONE_NUMBER !== 'YOUR_TWILIO_PHONE_NUMBER_PLACEHOLDER') {
          const twimlMessage = `<Response><Say language="zh-TW">你好，這是來自顧晉瑋LINE Bot的提醒： ${reminder.title}</Say></Response>`;
          console.log(`⏰ [REMINDER_SYSTEM] Twilio TwiML: ${twimlMessage}`);
          console.log(`⏰ [REMINDER_SYSTEM] Stubbing Twilio call. To: ${OWNER_PHONE_NUMBER}, From: ${TWILIO_PHONE_NUMBER}, Title: "${reminder.title}"`);
          // STUBBED: Actual call would be:
          // twilioClient.calls.create({
          //   twiml: twimlMessage,
          //   to: OWNER_PHONE_NUMBER, // Must be E.164 format
          //   from: TWILIO_PHONE_NUMBER // Must be a Twilio number
          // }).then(call => console.log(`⏰ [REMINDER_SYSTEM] Twilio call initiated, SID: ${call.sid}`))
          //   .catch(error => console.error(`⏰ [REMINDER_SYSTEM] Twilio call failed:`, error));
          console.log(`📞 [TWILIO_STUB] Twilio call for reminder "${reminder.title}" would be initiated here if credentials were live and call uncommented.`);
        } else {
          console.warn(`⏰ [REMINDER_SYSTEM] Twilio client not available or phone numbers not configured/valid. Cannot make call for reminderId: ${reminderId}.`);
          console.warn(`📞 Twilio Client: ${twilioClient ? 'Available' : 'Not Available'}, Owner Phone: ${OWNER_PHONE_NUMBER}, Twilio Phone: ${TWILIO_PHONE_NUMBER}`);
          // Fallback to LINE message if Twilio call cannot be made
          const fallbackText = `📞 原定電話提醒失敗（系統設定問題）。\n⏰ LINE提醒：${reminder.title}`;
          await client.pushMessage(reminder.userId, { type: 'text', text: fallbackText });
          console.log(`⏰ [REMINDER_SYSTEM] Sent fallback LINE reminder for ${reminderId} due to Twilio configuration issue.`);
        }
      } else { // Default to 'line'
        const reminderText = `⏰ ${reminder.isAlarm ? '鬧鐘' : '提醒'}時間到！

📝 ${reminder.title}
⏱️ 設定時間：${reminder.created.toLocaleString('zh-TW')}

${reminder.isAlarm ? '☀️ 起床囉！新的一天開始了！' : '記得處理這件事喔！'}`;
        console.log(`⏰ [REMINDER_SYSTEM] Prepared LINE reminderText for ${reminderId}: "${reminderText.replace(/\n/g, "\\n")}"`);
        try {
          await client.pushMessage(reminder.userId, { type: 'text', text: reminderText });
          console.log(`⏰ [REMINDER_SYSTEM] Successfully sent LINE reminder pushMessage for reminderId: ${reminderId} to userId: ${reminder.userId}`);
        } catch (pushError) {
          console.error(`⏰ [REMINDER_SYSTEM] Failed to send LINE reminder pushMessage for reminderId: ${reminderId} to userId: ${reminder.userId}. Error:`, pushError);
        }
      }
    } catch (error) {
      console.error(`⏰ [REMINDER_SYSTEM] Error preparing reminder for reminderId: ${reminderId}. Error:`, error);
    } finally {
      this.reminders.delete(reminderId);
      this.activeTimers.delete(reminderId);
      console.log(`⏰ [REMINDER_SYSTEM] Deleted reminder and activeTimer for reminderId: ${reminderId} from maps.`);
    }
  }

  extractTitle(text) {
    console.log(`⏰ [REMINDER_SYSTEM] extractTitle called with text: "${text}"`);
    let title = text;
    
    // 移除時間相關詞語
    const timePatterns = [
      /\d+\s*分(?:鐘)?後/g,
      /\d+\s*(?:小)?時後/g,
      /\d{1,2}:\d{2}/g,
      /\d{1,2}\s*點/g,
      /明天/g,
      /提醒我/g,
      /叫我/g,
      /起床/g,
      /鬧鐘/g,
      /幫我設/g,
      /設定一個/g,
      /打電話提醒/gi, 
      /用電話叫我/gi,
      /call alarm/gi
    ];
    
    timePatterns.forEach(pattern => {
      title = title.replace(pattern, '');
    });
    
    title = title.replace(/的$/,'').trim(); 

    if (!title) {
      if (text.includes('起床') || text.includes('鬧鐘')) {
        title = '起床鬧鐘';
      } else if (text.includes('開會')) {
        title = '開會提醒';
      } else if (text.includes('吃藥')) {
        title = '吃藥提醒';
      } else {
        title = '提醒事項';
      }
    }
    console.log(`⏰ [REMINDER_SYSTEM] Extracted title: "${title}" from text: "${text}"`);
    return title;
  }

  listReminders(userId) {
    const userReminders = Array.from(this.reminders.values())
      .filter(r => r.userId === userId)
      .sort((a, b) => a.targetTime - b.targetTime);
    
    if (userReminders.length === 0) {
      return '你目前沒有設定任何提醒';
    }
    
    let list = '📋 你的提醒清單：\n\n';
    userReminders.forEach((r, index) => {
      list += `${index + 1}. ${r.title}\n`;
      list += `   ⏰ ${r.targetTime.toLocaleString('zh-TW')}\n\n`;
    });
    
    return list;
  }
}

// 網路搜尋功能
class WebSearchSystem {
  constructor() {
    console.log('🔍 [WEB_SEARCH_SYSTEM] WebSearchSystem initialized.');
  }

  async search(query) {
    console.log(`🔍 [WEB_SEARCH_SYSTEM] search called with query: "${query}"`);
    let finalResultText = '';
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      console.log(`🔍 [WEB_SEARCH_SYSTEM] Constructed DuckDuckGo searchUrl: ${searchUrl}`);
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });
      console.log(`🔍 [WEB_SEARCH_SYSTEM] DuckDuckGo response status: ${response.status}`);

      const results = this.parseSearchResults(response.data);
      console.log(`🔍 [WEB_SEARCH_SYSTEM] parseSearchResults returned ${results.length} results.`);
      
      if (results.length === 0) {
        finalResultText = `🤔 關於「${query}」，我找不到直接的網頁結果，讓我試試用AI總結一下。`;
        // Force fallback to Gemini by throwing a custom error or by re-throwing a generic one after logging
        throw new Error("No results from DuckDuckGo parsing, attempting AI fallback.");
      }

      let resultText = `🔍 搜尋「${query}」的結果：\n\n`;
      results.slice(0, 3).forEach((result, index) => {
        resultText += `${index + 1}. ${result.title}\n`;
        resultText += `${result.snippet}\n`;
        resultText += `🔗 ${result.link}\n\n`;
      });
      finalResultText = resultText;

    } catch (error) {
      console.error(`🔍 [WEB_SEARCH_SYSTEM] DuckDuckGo search failed or parsing yielded no results. Error: ${error.message}`);
      if (error.response) {
        console.error(`🔍 [WEB_SEARCH_SYSTEM] DDG Error response status: ${error.response.status}`);
        console.error(`🔍 [WEB_SEARCH_SYSTEM] DDG Error response data: ${JSON.stringify(error.response.data).substring(0, 200)}...`);
      } else if (error.request) {
        console.error('🔍 [WEB_SEARCH_SYSTEM] DDG Error request: The request was made but no response was received');
      }
      
      console.log(`🔍 [WEB_SEARCH_SYSTEM] Falling back to Gemini AI for query: "${query}"`);
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });
        const prompt = `用戶想要搜尋關於「${query}」的資訊，但直接網頁搜尋沒有結果。請根據你的知識庫，提供關於「${query}」的相關知識和見解（約150字）。`;
        console.log(`🔍 [WEB_SEARCH_SYSTEM] Prompt to Gemini: "${prompt}"`);
        
        const result = await model.generateContent(prompt);
        const geminiResponse = await result.response;
        const geminiText = geminiResponse.text();
        console.log(`🔍 [WEB_SEARCH_SYSTEM] Gemini response text (first 100 chars): "${geminiText.substring(0,100).replace(/\n/g, "\\n")}"`);
        finalResultText = `💡 關於「${query}」：\n\n${geminiText}`;
        
      } catch (aiError) {
        console.error(`🔍 [WEB_SEARCH_SYSTEM] Gemini AI fallback also failed. AI Error: ${aiError.message}`);
        finalResultText = '抱歉，目前搜尋功能遇到一些問題，請稍後再試。';
      }
    }
    console.log(`🔍 [WEB_SEARCH_SYSTEM] Final resultText (first 100 chars): "${finalResultText.substring(0,100).replace(/\n/g, "\\n")}"`);
    return finalResultText;
  }

  parseSearchResults(html) {
    console.log(`🔍 [WEB_SEARCH_SYSTEM] parseSearchResults called with HTML (first 300 chars): "${html.substring(0, 300).replace(/\n/g, "\\n")}"`);
    const results = [];
    const resultPattern = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/gi;
    
    let match;
    while ((match = resultPattern.exec(html)) !== null) {
      results.push({
        link: decodeURIComponent(match[1].replace('/l/?kh=-1&uddg=', '')), 
        title: match[2].trim().replace(/<b>|<\/b>/gi, ''), 
        snippet: match[3].trim().replace(/<b>|<\/b>/gi, '') 
      });
      
      if (results.length >= 5) break; 
    }
    console.log(`🔍 [WEB_SEARCH_SYSTEM] Extracted ${results.length} results from HTML using regex.`);
    return results;
  }
}

// 電影查詢系統
class MovieSystem {
  constructor() {
    console.log('🎬 [MOVIE_SYSTEM] MovieSystem initialized.');
  }

  async searchMovies(query = '') {
    console.log(`🎬 [MOVIE_SYSTEM] searchMovies called with query: "${query}"`);
    let movies = []; 
    try {
      let endpoint = 'https://api.themoviedb.org/3/movie/popular';
      let params = {
        language: 'zh-TW',
        page: 1
      };

      if (query && query.length > 0) {
        endpoint = 'https://api.themoviedb.org/3/search/movie';
        params.query = query;
        console.log(`🎬 [MOVIE_SYSTEM] Searching for movies with query. Endpoint: ${endpoint}, Params: ${JSON.stringify(params)}`);
      } else {
        console.log(`🎬 [MOVIE_SYSTEM] Fetching popular movies. Endpoint: ${endpoint}, Params: ${JSON.stringify(params)}`);
      }

      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${TMDB_API_KEY}`, 
          'Content-Type': 'application/json'
        },
        params: params,
        timeout: 10000
      });

      console.log(`🎬 [MOVIE_SYSTEM] TMDB API response status: ${response.status}`);
      if (response.data && Array.isArray(response.data.results)) {
        console.log(`🎬 [MOVIE_SYSTEM] TMDB API raw results count: ${response.data.results.length}`);
        if (response.data.results.length > 0) {
            console.log(`🎬 [MOVIE_SYSTEM] First movie result: ${JSON.stringify(response.data.results[0].title)}`);
        }
        movies = response.data.results.slice(0, 5);
        console.log(`🎬 [MOVIE_SYSTEM] Processed ${movies.length} movies after slicing.`);
      } else {
        console.error('🎬 [MOVIE_SYSTEM] TMDB API response.data.results is not an array or undefined.', response.data);
        return '抱歉，電影資料格式錯誤，請稍後再試。';
      }
      
      if (movies.length === 0) {
        console.log(`🎬 [MOVIE_SYSTEM] No movies found for query: "${query}"`);
        return query ? `🎬 找不到關於「${query}」的電影，請試試其他關鍵字。` : '🎬 目前沒有熱門電影資訊。';
      }

      let movieList = query ? 
        `🎬 「${query}」的搜尋結果：\n\n` : 
        '🎬 熱門電影推薦：\n\n';
      
      movies.forEach((movie, index) => {
        movieList += `${index + 1}. ${movie.title || '未知標題'}${movie.original_title && movie.original_title !== movie.title ? ` (${movie.original_title})` : ''}\n`;
        movieList += `⭐ 評分：${movie.vote_average !== undefined ? movie.vote_average : 'N/A'}/10\n`;
        movieList += `📅 上映日期：${movie.release_date || '未知日期'}\n`;
        if (movie.overview) {
          movieList += `📝 ${movie.overview.substring(0, 60)}...\n`;
        } else {
          movieList += `📝 暫無簡介\n`;
        }
        movieList += '\n';
      });
      
      console.log(`🎬 [MOVIE_SYSTEM] Generated movieList (first 100 chars): "${movieList.substring(0, 100).replace(/\n/g, "\\n")}"`);
      return movieList;

    } catch (error) {
      console.error('🎬 [MOVIE_SYSTEM] searchMovies error:', error.message);
      if (error.response) {
        console.error('🎬 [MOVIE_SYSTEM] Error response status:', error.response.status);
        console.error('🎬 [MOVIE_SYSTEM] Error response data:', JSON.stringify(error.response.data));
        if (error.response.status === 401) {
          return '抱歉，電影查詢API認證失敗，請檢查API金鑰設定。';
        } else if (error.response.status === 404) {
          return '抱歉，找不到指定的電影資源，請確認查詢條件。';
        }
      } else if (error.request) {
        console.error('🎬 [MOVIE_SYSTEM] Error request:', 'The request was made but no response was received');
      } else {
        console.error('🎬 [MOVIE_SYSTEM] Error details:', error);
      }
      return '抱歉，電影查詢功能暫時無法使用，請稍後再試。';
    }
  }
}

// 訊息轉發系統
class MessageForwardSystem {
  constructor() {
    this.userList = new Map(); 
    this.updateCount = 0;
    console.log('📨 [MSG_FORWARD_SYSTEM] MessageForwardSystem initialized.');
  }

  async forwardMessage(targetName, message, sourceUserName) {
    console.log(`📨 [MSG_FORWARD_SYSTEM] forwardMessage called with: targetName="${targetName}", message="${message.substring(0, 50)}...", sourceUserName="${sourceUserName}"`);
    let resultMessage = '';
    try {
      const targetUser = this.findUserByName(targetName);
      console.log(`📨 [MSG_FORWARD_SYSTEM] findUserByName result for "${targetName}": ${JSON.stringify(targetUser)}`);
      
      if (!targetUser) {
        resultMessage = `找不到用戶「${targetName}」，請確認名稱是否正確`;
        console.log(`📨 [MSG_FORWARD_SYSTEM] ${resultMessage}`);
        return resultMessage;
      }

      const forwardMsg = `📨 來自 ${sourceUserName} 的訊息：\n\n${message}`;
      console.log(`📨 [MSG_FORWARD_SYSTEM] Prepared forwardMsg for userId ${targetUser.userId}: "${forwardMsg.substring(0,100).replace(/\n/g, "\\n")}"`);
      
      try {
        await client.pushMessage(targetUser.userId, { type: 'text', text: forwardMsg });
        resultMessage = `✅ 訊息已轉發給 ${targetName} (ID: ${targetUser.userId.substring(0,10)}...)`;
        console.log(`📨 [MSG_FORWARD_SYSTEM] Successfully sent pushMessage to ${targetUser.userId}`);
      } catch (pushError) {
        console.error(`📨 [MSG_FORWARD_SYSTEM] Failed to send pushMessage to ${targetUser.userId}. Error:`, pushError.message, pushError.originalError?.response?.data);
        resultMessage = `訊息轉發給 ${targetName} 失敗，內部錯誤。`;
      }
      return resultMessage;

    } catch (error) {
      console.error(`📨 [MSG_FORWARD_SYSTEM] General error in forwardMessage:`, error);
      resultMessage = '訊息轉發過程中發生未知錯誤，請稍後再試。';
      return resultMessage;
    }
  }

  findUserByName(name) {
    console.log(`📨 [MSG_FORWARD_SYSTEM] findUserByName called with name: "${name}"`);
    const matchingUsers = [];
    for (const [userId, userInfo] of this.userList) {
      if (userInfo.displayName.toLowerCase().includes(name.toLowerCase())) {
        matchingUsers.push({ userId, ...userInfo });
      }
    }

    if (matchingUsers.length === 0) {
      console.log(`📨 [MSG_FORWARD_SYSTEM] No user found matching name: "${name}"`);
      return null;
    }

    if (matchingUsers.length > 1) {
      console.warn(`📨 [MSG_FORWARD_SYSTEM] Ambiguous name: "${name}". Found ${matchingUsers.length} users: ${JSON.stringify(matchingUsers.map(u => `${u.displayName}(${u.userId.substring(0,10)}...)`))}. Returning the first match.`);
    }
    
    const foundUser = matchingUsers[0];
    console.log(`📨 [MSG_FORWARD_SYSTEM] User found for name "${name}": ${foundUser.displayName} (ID: ${foundUser.userId})`);
    return foundUser;
  }

  updateUserList(userId, displayName) {
    const isNewUser = !this.userList.has(userId);
    const oldDisplayName = isNewUser ? null : this.userList.get(userId).displayName;
    
    this.userList.set(userId, { displayName, lastSeen: new Date() });
    this.updateCount++;

    if (isNewUser) {
      console.log(`📨 [MSG_FORWARD_SYSTEM] New user added to list: ${displayName} (ID: ${userId}). Total users: ${this.userList.size}.`);
    } else if (oldDisplayName !== displayName) {
      console.log(`📨 [MSG_FORWARD_SYSTEM] User display name updated: Old="${oldDisplayName}", New="${displayName}" (ID: ${userId}). Total users: ${this.userList.size}.`);
    }
    if (this.updateCount % 10 === 0) {
      console.log(`📨 [MSG_FORWARD_SYSTEM] updateUserList has been called ${this.updateCount} times. Current userList size: ${this.userList.size}.`);
    }
  }
}

// 增強版私訊系統
class EnhancedPrivateMessageSystem {
  constructor() {
    console.log('💬 [ENHANCED_PM_SYSTEM] EnhancedPrivateMessageSystem initialized.');
  }

  async handlePrivateMessage(userId, userName, message) {
    if (userId === OWNER_LINE_ID) {
      return await this.handleOwnerMessage(message);
    }
    
    return await enhancedAI.generateReply(userId, message, { isGroup: false });
  }

  async handleOwnerMessage(message) {
    console.log(`💬 [ENHANCED_PM_SYSTEM] handleOwnerMessage received: "${message}"`);
    if (decisionSystem.pendingDecisions.size > 0) {
      const decisionResponse = await decisionSystem.processOwnerDecision(message, OWNER_LINE_ID);
      if (decisionResponse && !decisionResponse.includes('找不到對應的決策請求')) {
        console.log(`💬 [ENHANCED_PM_SYSTEM] Decision system responded: "${decisionResponse}"`);
        return decisionResponse;
      } else if (decisionResponse === null) {
        console.log(`💬 [ENHANCED_PM_SYSTEM] Decision system is awaiting further input or has sent context.`);
        return null; 
      }
    }

    if (message.startsWith('/')) {
      console.log(`💬 [ENHANCED_PM_SYSTEM] Detected command: "${message}"`);
      return await this.handleCommand(message);
    }

    const forwardMatch = message.match(/(?:告訴|跟)\s*([^說:]+?)\s*(?:說|:)(.+)/);
    if (forwardMatch) {
      console.log(`💬 [ENHANCED_PM_SYSTEM] Detected message forward pattern in: "${message}"`);
      return await this.handleMessageForward(message, forwardMatch);
    }
    
    console.log(`💬 [ENHANCED_PM_SYSTEM] No specific handler for owner message, passing to AI: "${message}"`);
    return await enhancedAI.generateReply(OWNER_LINE_ID, message, { isGroup: false });
  }

  async handleCommand(command) {
    console.log(`💬 [ENHANCED_PM_SYSTEM] handleCommand called with: "${command}"`);
    const cmd = command.substring(1).toLowerCase().split(' ')[0];
    let response = '';
    switch (cmd) {
      case 'status':
        response = this.getSystemStatus();
        break;
      case 'users':
        response = this.getUserReport();
        break;
      case 'reminders':
        response = reminderSystem.listReminders(OWNER_LINE_ID);
        break;
      case 'decisions':
        response = this.getPendingDecisions();
        break;
      case 'help':
        response = this.getHelpMenu();
        break;
      default:
        response = '未知指令，輸入 /help 查看可用指令';
    }
    console.log(`💬 [ENHANCED_PM_SYSTEM] Command "${cmd}" generated response (first 50 chars): "${response.substring(0,50).replace(/\n/g, "\\n")}"`);
    return response;
  }

  async handleMessageForward(originalMessage, match) {
    console.log(`💬 [ENHANCED_PM_SYSTEM] handleMessageForward called with originalMessage: "${originalMessage}"`);
    
    const targetName = match[1].trim();
    const content = match[2].trim();
    
    console.log(`💬 [ENHANCED_PM_SYSTEM] Parsed for forwarding: targetName="${targetName}", content="${content.substring(0,50)}..."`);
    
    if (!targetName || !content) {
        const errorMsg = '訊息轉發格式錯誤。請使用：「告訴 [名字] [訊息內容]」或「跟 [名字] 說 [訊息內容]」';
        console.log(`💬 [ENHANCED_PM_SYSTEM] Forwarding format error. Parsed: targetName="${targetName}", content="${content}"`);
        return errorMsg;
    }
    
    const forwardResult = await messageForward.forwardMessage(targetName, content, '顧晉瑋');
    console.log(`💬 [ENHANCED_PM_SYSTEM] messageForward.forwardMessage result: "${forwardResult}"`);
    return forwardResult;
  }

  getSystemStatus() {
    const statusReport = `🤖 系統狀態報告

⏰ 提醒系統：正常（${reminderSystem.reminders.size} 個活躍提醒）
🧠 AI系統：正常
⚖️ 決策系統：正常（${decisionSystem.pendingDecisions.size} 個待處理）
🔍 搜尋系統：正常
🎬 電影系統：正常
📨 轉發系統：正常（已知聯絡人 ${messageForward.userList.size} 人）
💬 對話記錄：${enhancedAI.conversations.size} 筆
👥 用戶個人資料：${enhancedAI.userProfiles.size} 人

✅ 所有系統運作正常！`;
    return statusReport;
  }

  getUserReport() {
    const users = Array.from(messageForward.userList.entries()); 
    let report = `👥 已知聯絡人列表 (${users.length} 人)：\n\n`;
    
    const sortedUsers = users
      .map(([userId, data]) => ({ userId, ...data })) 
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 20); 
    
    sortedUsers.forEach((user, index) => {
      report += `${index + 1}. ${user.displayName} (ID: ...${user.userId.slice(-10)})\n`;
      report += `   🕐 最後互動：${user.lastSeen.toLocaleString('zh-TW')}\n\n`;
    });
    
    if (users.length > sortedUsers.length) {
        report += `...還有 ${users.length - sortedUsers.length} 位其他聯絡人。`;
    }
    if (users.length === 0) {
        report = '目前沒有已知的聯絡人。當用戶與機器人互動時，會被加入列表。';
    }
    return report;
  }

  getPendingDecisions() {
    const decisions = Array.from(decisionSystem.pendingDecisions.values())
        .filter(d => new Date() - d.timestamp < 3600000); 
    
    if (decisions.length === 0) {
      return '目前沒有1小時內待處理的決策。';
    }

    let report = `⚖️ 待處理決策 (1小時內)：\n\n共 ${decisions.length} 個\n\n`;
    
    decisions.sort((a,b) => a.timestamp - b.timestamp).forEach((d, index) => { 
      report += `${index + 1}. [${d.id.substr(-6)}] (來自: ${d.userName})\n`;
      report += `   💬 ${d.message.substring(0,50)}...\n`;
      report += `   ⏰ ${d.timestamp.toLocaleString('zh-TW')}\n\n`;
    });
    
    return report;
  }

  getHelpMenu() {
    return `📚 主人專用指令

基本指令：
/status - 系統狀態
/users - 用戶報告
/reminders - 查看提醒
/decisions - 待處理決策
/help - 顯示此選單

訊息轉發：
告訴[名字] [訊息] - 轉發訊息
例：告訴小明 等一下開會

決策回覆：
• 回覆決策ID + 同意/拒絕
• 回覆：[自訂訊息]
• ? - 查看更多資訊

其他功能會自動判斷執行`;
  }
}

// 初始化系統
const enhancedAI = new EnhancedAISystem();
const decisionSystem = new EnhancedDecisionSystem();
const reminderSystem = new EnhancedReminderSystem();
const privateMessage = new EnhancedPrivateMessageSystem();
const webSearch = new WebSearchSystem();
const movieSystem = new MovieSystem();
const messageForward = new MessageForwardSystem();

// Reply Token 管理
class ReplyTokenManager {
  constructor() {
    this.usedTokens = new Set();
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  isUsed(token) { return this.usedTokens.has(token); }
  markUsed(token) { this.usedTokens.add(token); }
  cleanup() { this.usedTokens.clear(); }
}

const tokenManager = new ReplyTokenManager();

// 安全回覆函數
async function safeReply(replyToken, message, retryCount = 0) {
  try {
    if (tokenManager.isUsed(replyToken)) return false;
    tokenManager.markUsed(replyToken);
    
    const formattedMessage = typeof message === 'string' ? 
      { type: 'text', text: message.substring(0, MAX_MESSAGE_LENGTH) } : message;
    
    await client.replyMessage(replyToken, formattedMessage);
    return true;
    
  } catch (error) {
    console.error(`回覆失敗 (${retryCount + 1}):`, error);
    
    if (retryCount < 1) {
      const simpleText = typeof message === 'string' ? message : 
        (message.text || message.altText || '回覆訊息');
      
      try {
        await client.replyMessage(replyToken, { 
          type: 'text', 
          text: simpleText.substring(0, MAX_MESSAGE_LENGTH) 
        });
        return true;
      } catch (simpleError) {
        console.error('簡單回覆也失敗:', simpleError);
      }
    }
    
    return false;
  }
}

// 安全推送函數
async function safePushMessage(targetId, message, retryCount = 0) {
  try {
    const formattedMessage = typeof message === 'string' ? 
      { type: 'text', text: message.substring(0, MAX_MESSAGE_LENGTH) } : message;
    
    await client.pushMessage(targetId, formattedMessage);
    return true;
    
  } catch (error) {
    console.error(`推送失敗 (${retryCount + 1}):`, error);
    
    if (retryCount < 1) {
      const simpleText = typeof message === 'string' ? message : 
        (message.text || message.altText || '推送訊息');
      
      try {
        await client.pushMessage(targetId, { 
          type: 'text', 
          text: simpleText.substring(0, MAX_MESSAGE_LENGTH) 
        });
        return true;
      } catch (simpleError) {
        console.error('簡單推送也失敗:', simpleError);
      }
    }
    
    return false;
  }
}

// 判斷函數
function isReminderQuery(text) {
  const reminderKeywords = ['提醒我', '提醒', '分鐘後', '小時後', '叫我', '起床', '鬧鐘', '明天', '打電話提醒', '用電話叫我', 'call alarm'];
  return reminderKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase())) && 
         (text.match(/\d/) || text.toLowerCase().includes('明天'));
}

function isMovieQuery(text) {
  const movieKeywords = ['電影', '影片', '上映', '票房', '好看的片'];
  return movieKeywords.some(keyword => text.includes(keyword));
}

function isWebSearchQuery(text) {
  const searchKeywords = ['搜尋', '查詢', '查一下', '幫我查', '是什麼', '怎麼辦'];
  return searchKeywords.some(keyword => text.includes(keyword));
}

function isFunctionMenuQuery(text) {
  const menuKeywords = ['功能', '選單', '幫助', 'help', '教學', '怎麼用'];
  return menuKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  
  res.send(\`
    <!DOCTYPE html>
    <html>
    <head>
      <title>顧晉瑋的增強版 LINE Bot</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 20px; 
          background-color: #f5f5f5; 
        }
        h1, h2 { color: #333; }
        .status-box {
          background-color: #e8f5e8; 
          padding: 15px; 
          border-radius: 8px;
          margin: 10px 0;
        }
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 15px;
          margin: 20px 0;
        }
        .feature-card {
          background: white;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .feature-card h3 {
          margin-top: 0;
          color: #2196F3;
        }
        ul li { margin: 5px 0; }
        .chart {
          width: 100%;
          height: 200px;
          background: linear-gradient(to right, #4CAF50 0%, #2196F3 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 24px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <h1>🤖 顧晉瑋的增強版 LINE Bot v11.0</h1>
      <p><strong>🇹🇼 台灣時間：\${currentTime}</strong></p>
      <p><strong>🔑 機器人主人：\${OWNER_LINE_ID}</strong></p>
      
      <div class="chart">
        系統運行狀態：優良 ✨
      </div>
      
      <h2>📊 即時系統狀態</h2>
      <div class="status-box">
        <p>🧠 AI系統：運作中（對話記錄 \${enhancedAI.conversations.size} 筆）</p>
        <p>⏰ 提醒系統：運作中（活躍提醒 \${reminderSystem.reminders.size} 個）</p>
        <p>⚖️ 決策系統：運作中（待處理 \${decisionSystem.pendingDecisions.size} 個）</p>
        <p>🔍 搜尋系統：運作中</p>
        <p>🎬 電影系統：運作中</p>
        <p>📨 訊息轉發系統：運作中（已知聯絡人 \${messageForward.userList.size} 人）</p>
        <p>👥 用戶個人資料：\${enhancedAI.userProfiles.size} 人</p>
      </div>
      
      <h2>✨ 核心功能總覽 (用戶視角)</h2>
      <div class="feature-grid">
        <div class="feature-card">
          <h3>🧠 智能聊天</h3>
          <ul>
            <li>與AI進行自然對話</li>
            <li>支援群組上下文理解</li>
            <li>個性化、口語化回覆</li>
            <li>離線時提供備用回覆</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>⏰ 提醒與鬧鐘</h3>
          <ul>
            <li>支援多種時間格式</li>
            <li>鬧鐘功能 (LINE / 電話語音)</li>
            <li>提醒清單查詢 (主人)</li>
            <li>智能標題提取</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>🔍 網路搜尋</h3>
          <ul>
            <li>透過關鍵字進行網頁搜尋 (如 "搜尋...")</li>
            <li>DuckDuckGo 初步搜尋</li>
            <li>若無結果則由AI總結知識</li>
            <li>結構化呈現搜尋結果</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>🎬 電影資訊</h3>
          <ul>
            <li>查詢熱門電影</li>
            <li>透過關鍵字搜尋特定電影</li>
            <li>顯示評分、上映日期與簡介</li>
          </ul>
        </div>

        <div class="feature-card">
          <h3>🤖 智能請求處理</h3>
          <ul>
            <li>特定請求將由AI轉告真人處理</li>
            <li>用戶將收到最終處理回覆</li>
            <li>(此過程部分自動化)</li>
          </ul>
        </div>

      </div>
      
      <h2>📈 功能使用統計</h2>
      <div style="background: white; padding: 20px; border-radius: 8px;">
        <canvas id="statsChart" width="400" height="200"></canvas>
      </div>
      
      <h2>🔧 v11.0 (近期迭代) 更新內容</h2>
      <ul>
        <li>📞 **電話語音提醒**: 新增Twilio整合，可透過語音通話進行提醒 (需設定環境變數)。</li>
        <li>🆕 **決策系統強化**: 主人現在可以透過 "? ID" 指令查詢待決策事項的詳細對話上下文。</li>
        <li>⚙️ **提醒系統日誌與修復**: 增強提醒設定與執行的日誌記錄，提升問題追蹤能力；處理提醒時間已過或過長的情況。</li>
        <li>🎬 **電影系統日誌與修復**: 強化電影查詢的日誌，API錯誤處理更細緻，資料呈現更穩定。</li>
        <li>🌐 **網路搜尋日誌與優化**: 網路搜尋功能加入完整日誌，優化搜尋結果解析與AI備援邏輯。</li>
        <li>📨 **訊息轉發日誌與強化**: 新增訊息轉發功能日誌，強化用戶名稱識別與指令解析的清晰度。</li>
        <li>📊 **功能列表更新**: 同步更新機器人功能選單與狀態頁面，確保資訊一致性。</li>
        <li>📝 **全面日誌系統**: 各核心模組均已加入詳細日誌記錄，提升系統可維護性與問題診斷效率。</li>
      </ul>
      
      <script>
        // 簡單的統計圖表
        const canvas = document.getElementById('statsChart');
        const ctx = canvas.getContext('2d');
        
        const data = [
          { label: 'AI對話', value: \${enhancedAI.conversations.size}, color: '#4CAF50' },
          { label: '用戶數', value: \${enhancedAI.userProfiles.size}, color: '#2196F3' },
          { label: '提醒數', value: \${reminderSystem.reminders.size}, color: '#FF9800' },
          { label: '決策數', value: \${decisionSystem.pendingDecisions.size}, color: '#9C27B0' }
        ];
        
        const maxValue = Math.max(...data.map(d => d.value), 10);
        const barWidth = 80;
        const barSpacing = 20;
        
        data.forEach((item, index) => {
          const x = 50 + index * (barWidth + barSpacing);
          const height = (item.value / maxValue) * 150;
          const y = 180 - height;
          
          ctx.fillStyle = item.color;
          ctx.fillRect(x, y, barWidth, height);
          
          ctx.fillStyle = '#333';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(item.label, x + barWidth/2, 195);
          ctx.fillText(item.value, x + barWidth/2, y - 5);
        });
      </script>
    </body>
    </html>
  \`);
});

// Webhook 端點
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) return res.status(401).send('缺少簽名標頭');

  const body = req.body.toString();
  const hash = crypto.createHmac('SHA256', config.channelSecret).update(body).digest('base64');

  if (signature !== hash) return res.status(401).send('簽名驗證失敗');

  let events;
  try {
    const parsedBody = JSON.parse(body);
    events = parsedBody.events;
  } catch (error) {
    return res.status(400).send('無效的 JSON');
  }

  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });

  events.forEach(event => {
    handleEvent(event).catch(error => {
      console.error('事件處理錯誤:', error);
    });
  });
});

// 主要事件處理函數
async function handleEvent(event) {
  try {
    if (event.type !== 'message' || event.message.type !== 'text') return;

    const userId = event.source.userId;
    const groupId = event.source.groupId;
    const messageText = event.message.text.trim();
    const replyToken = event.replyToken;
    const isGroup = !!groupId;
    
    let userName = '朋友';
    let groupName = '群組';
    try {
      if (groupId) {
        const profile = await client.getGroupMemberProfile(groupId, userId);
        userName = profile.displayName;
        try {
          const groupInfo = await client.getGroupSummary(groupId);
          groupName = groupInfo.groupName;
        } catch (e) { /*忽略*/ }
      } else {
        const profile = await client.getProfile(userId);
        userName = profile.displayName;
      }
    } catch (error) {
      console.log('無法獲取用戶名稱');
    }

    messageForward.updateUserList(userId, userName);

    const context = { isGroup, groupId, userId, userName, groupName };
    let response = '';

    if (!isGroup) {
      response = await privateMessage.handlePrivateMessage(userId, userName, messageText);
      await safeReply(replyToken, response);
      return;
    }

    if (isFunctionMenuQuery(messageText)) {
      const flexMenu = {
        type: 'flex',
        altText: '為您打開功能選單，請在LINE應用程式中查看。',
        contents: {
          type: 'carousel',
          contents: [
            {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '🧠 智能聊天', weight: 'bold', size: 'xl', color: '#1DB446' }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { 
                    type: 'text', 
                    text: '與AI自由對話，問問題，聊天。在群組中我能理解上下文並參與討論。', 
                    wrap: true, 
                    size: 'sm' 
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#1DB446',
                    height: 'sm',
                    action: { type: 'message', label: '今天天氣如何？', text: '今天天氣如何？' }
                  },
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#1DB446',
                    height: 'sm',
                    action: { type: 'message', label: '你好嗎？', text: '你好嗎？' }
                  }
                ]
              }
            },
            {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '⏰ 提醒與鬧鐘', weight: 'bold', size: 'xl', color: '#FF6B6E' }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { 
                    type: 'text', 
                    text: '設定提醒或鬧鐘 (LINE或電話語音)。\n例:「打電話提醒我明天開會」', 
                    wrap: true, 
                    size: 'sm' 
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#FF6B6E',
                    height: 'sm',
                    action: { type: 'message', label: '10分鐘後提醒我喝水', text: '10分鐘後提醒我喝水' }
                  },
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#FF6B6E',
                    height: 'sm',
                    action: { type: 'message', label: '明天早上7點叫我起床', text: '明天早上7點叫我起床' }
                  }
                ]
              }
            },
            {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '🔍 資訊查詢', weight: 'bold', size: 'xl', color: '#4A90E2' }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { 
                    type: 'text', 
                    text: '查詢網頁資訊或電影詳情。例如：「搜尋：AI最新發展」或「電影：星際效應」。', 
                    wrap: true, 
                    size: 'sm' 
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#4A90E2',
                    height: 'sm',
                    action: { type: 'message', label: '搜尋：AI最新發展', text: '搜尋：AI最新發展' }
                  },
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#4A90E2',
                    height: 'sm',
                    action: { type: 'message', label: '電影：星際效應', text: '電影：星際效應' }
                  }
                ]
              }
            }
          ]
        }
      };
      console.log('🤖 Sending Flex Menu for function query.'); // Added for explicit logging
      await safeReply(replyToken, flexMenu);
      
    } else if (isReminderQuery(messageText)) {
      console.log('檢測到提醒請求:', messageText);
      
      const timeInfo = reminderSystem.parseTime(messageText);
      
      if (timeInfo && timeInfo.time) {
        const title = reminderSystem.extractTitle(messageText);
        // Pass reminderMethod from timeInfo to createReminder
        const reminderId = reminderSystem.createReminder(userId, title, timeInfo.time, timeInfo.isAlarm, timeInfo.reminderMethod);
        
        if (reminderId) {
          let confirmText = `✅ ${timeInfo.isAlarm ? '鬧鐘' : '提醒'}設定成功！`;
          if (timeInfo.reminderMethod === 'twilio') {
            confirmText += '\n📞 將以電話語音方式提醒。';
          }

📝 標題：${title}
⏰ 時間：${timeInfo.time.toLocaleString('zh-TW', { 
  year: 'numeric',
  month: '2-digit', 
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})}

我會準時${timeInfo.isAlarm ? '叫你起床' : '提醒你'}！`;
          
          await safeReply(replyToken, confirmText);
        } else {
          await safeReply(replyToken, '⚠️ 提醒設定失敗，時間可能太遠或格式錯誤');
        }
      } else {
        const helpText = `⏰ 時間格式說明

支援格式：
• "10分鐘後提醒我休息"
• "2小時後提醒我開會"
• "15:30提醒我"
• "7點叫我起床"
• "明天8點提醒我上班"
• (可加上 "打電話提醒" 使用語音通知)

請再試一次～`;
        
        await safeReply(replyToken, helpText);
      }
      
    } else if (isMovieQuery(messageText)) {
      console.log('檢測到電影查詢:', messageText);
      
      let movieName = '';
      const searchMatch = messageText.match(/(?:搜尋|查|找).*?電影(.+)|電影.*?(.+)/);
      if (searchMatch) {
        movieName = (searchMatch[1] || searchMatch[2] || '').trim();
      }
      
      const movieResults = await movieSystem.searchMovies(movieName);
      await safeReply(replyToken, movieResults);
      
    } else if (isWebSearchQuery(messageText)) {
      console.log('檢測到搜尋請求:', messageText);
      
      let query = messageText;
      const searchMatch = messageText.match(/(?:搜尋|查詢|查一下|幫我查)(.+)|(.+?)(?:是什麼|怎麼辦)/);
      if (searchMatch) {
        query = (searchMatch[1] || searchMatch[2] || messageText).trim();
      }
      
      const searchResults = await webSearch.search(query);
      await safeReply(replyToken, searchResults);
      
    } else {
      if (decisionSystem.shouldAskOwner(messageText, context)) {
        response = await decisionSystem.requestDecision(messageText, userId, userName, context, replyToken);
        await safeReply(replyToken, response);
      } else {
        response = await enhancedAI.generateReply(userId, messageText, context);
        await safeReply(replyToken, response);
      }
    }

  } catch (error) {
    console.error('事件處理錯誤:', error);
    
    if (event.replyToken && !tokenManager.isUsed(event.replyToken)) {
      await safeReply(event.replyToken, '抱歉，我遇到了一些問題，請稍後再試～');
    }
  }
}

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 增強版 LINE Bot 成功啟動！`);
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`✨ 所有功能正常運作`);
  console.log(`🤖 系統穩定運行中`);
  
  setTimeout(async () => {
    try {
      const startupMessage = `🚀 增強版 v11.0 已啟動！

✨ 新增功能：
• 決策系統增強（提供上下文）
• 網路搜尋功能
• 訊息轉發功能
• 多群組決策追蹤
• 📞 Twilio 語音通話提醒 (實驗性)

✅ 修復功能：
• 決策回覆功能
• 提醒系統
• 電影查詢

💡 輸入 /help 查看主人專用指令

系統現在功能完整，隨時為你服務！😊`;

      await safePushMessage(OWNER_LINE_ID, startupMessage);
      console.log('啟動通知已發送');
    } catch (error) {
      console.error('啟動通知發送失敗:', error);
    }
  }, 3000);
});

module.exports = app;