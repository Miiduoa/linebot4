// src/ui/flex_messages.js

console.log("🎨 [FLEX_MSG] src/ui/flex_messages.js loaded");

/**
 * Creates a LINE text message object.
 * @param {string} text - The text content of the message.
 * @returns {object} LINE text message JSON object.
 */
function createTextMessage(text) {
  const logText = typeof text === 'string' ? text.substring(0, 50) : 'undefined';
  console.log(`🎨 [FLEX_MSG] createTextMessage called with text: "${logText}..."`);
  if (typeof text !== 'string') {
    console.error("🎨 [FLEX_MSG] createTextMessage: text parameter must be a string. Received:", typeof text);
    return { type: 'text', text: "錯誤：訊息內容格式不正確。" }; 
  }
  return {
    type: 'text',
    text: text,
  };
}

/**
 * Creates a single Flex Message bubble.
 * @param {string} title - The title for the header.
 * @param {string} textContent - The text content for the body.
 * @param {string} buttonLabel - The label for the button in the footer.
 * @param {string} buttonActionText - The text sent when the button is clicked.
 * @returns {object} Flex Message bubble JSON object.
 */
function createSimpleCard(title, textContent, buttonLabel, buttonActionText) {
  console.log(`🎨 [FLEX_MSG] createSimpleCard called with title: "${title}", buttonLabel: "${buttonLabel}"`);
  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: title || '訊息', 
          weight: 'bold',
          size: 'xl',
          color: '#1DB446', 
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: textContent || ' ', 
          wrap: true,
          size: 'sm',
        },
      ],
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
          action: {
            type: 'message',
            label: buttonLabel,
            text: buttonActionText,
          },
        },
      ],
    },
  };
}

/**
 * Creates a Flex Message carousel.
 * @param {Array<object>} bubbles - An array of Flex Message bubble JSON objects.
 * @param {string} [altText='訊息已卡片輪播呈現'] - Alt text for the carousel.
 * @returns {object} Flex Message carousel JSON object.
 */
function createCarousel(bubbles, altText = '訊息已卡片輪播呈現') {
  console.log(`🎨 [FLEX_MSG] createCarousel called with ${bubbles ? bubbles.length : 0} bubbles. AltText: "${altText}"`);
  if (!Array.isArray(bubbles) || bubbles.length === 0) {
    console.error("🎨 [FLEX_MSG] createCarousel: bubbles parameter must be a non-empty array.");
    return createTextMessage("無法顯示卡片訊息：內容為空。"); 
  }
  return {
    type: 'flex',
    altText: altText,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

/**
 * Creates an error reply message using a simple text format.
 * @param {string} errorMessage - The main error message.
 * @param {string|null} [incidentId=null] - Optional incident ID for tracking.
 * @returns {object} LINE text message object.
 */
function createErrorReply(errorMessage, incidentId = null) {
  console.log(`🎨 [FLEX_MSG] createErrorReply called with message: "${errorMessage}", incidentId: ${incidentId}`);
  let fullErrorMessage = `😥 處理您的請求時遇到問題：\n${errorMessage || '未知的錯誤'}`;
  if (incidentId) {
    fullErrorMessage += `\n\n如果您需要回報此問題，請提供此錯誤代碼： ${incidentId}`;
  }
  fullErrorMessage += "\n\n請稍後再試一次，或嘗試其他指令。";
  
  return createTextMessage(fullErrorMessage.substring(0, 5000)); 
}

/**
 * Creates a Flex Message card to confirm a reminder has been set.
 * @param {object} reminder - The reminder object.
 * @returns {object} LINE Flex Message.
 */
function createReminderSetConfirmation(reminder) {
  console.log(`🎨 [FLEX_MSG] createReminderSetConfirmation for reminder ID: ${reminder.id}`);
  const targetTime = new Date(reminder.targetTime); 
  const timeString = targetTime.toLocaleString('zh-TW', { 
    year: 'numeric', month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit', hour12: false 
  });
  
  let methodText = reminder.reminderMethod === 'twilio' ? '📞 電話語音' : '📱 LINE訊息';

  return {
    type: 'flex',
    altText: `提醒設定成功！標題：${reminder.title}`, 
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '✅ 提醒已設定', weight: 'bold', size: 'lg', color: '#1DB446' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: reminder.title, weight: 'bold', size: 'md', wrap: true },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: [
              { 
                type: 'box', layout: 'baseline', 
                contents: [
                  { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                  { type: 'text', text: timeString, color: '#666666', size: 'sm', flex: 5, wrap: true }
                ]
              },
              { 
                type: 'box', layout: 'baseline', 
                contents: [
                  { type: 'text', text: '方式', color: '#aaaaaa', size: 'sm', flex: 2 },
                  { type: 'text', text: methodText, color: '#666666', size: 'sm', flex: 5 }
                ]
              },
               { 
                type: 'box', layout: 'baseline', 
                contents: [
                  { type: 'text', text: 'ID', color: '#aaaaaa', size: 'xxs', flex: 2 },
                  { type: 'text', text: reminder.id, color: '#aaaaaa', size: 'xxs', flex: 5 }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm', 
        contents: [
          { 
            type: 'text', 
            text: '我會準時提醒您！', 
            size: 'sm', 
            align: 'center', 
            color: '#888888',
            margin: 'md'
          },
          {
            type: 'button',
            style: 'link', 
            height: 'sm',
            action: {
              type: 'message',
              label: '查看我的提醒',
              text: '/myreminders' 
            }
          }
        ]
      }
    }
  };
}

/**
 * Creates a Flex Message card for a LINE reminder notification.
 * @param {object} reminder - The reminder object.
 * @returns {object} LINE Flex Message.
 */
function createReminderNotificationCard(reminder) {
  console.log(`🎨 [FLEX_MSG] createReminderNotificationCard for reminder ID: ${reminder.id}`);
  const createdTime = new Date(reminder.created); 
  const createdString = createdTime.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  return {
    type: 'flex',
    altText: `提醒：${reminder.title}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `⏰ ${reminder.isAlarm ? '鬧鐘時間到！' : '提醒時間到！'}`, weight: 'bold', size: 'xl', color: reminder.isAlarm ? '#FF6B6E' : '#1DB446' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: reminder.title, weight: 'bold', size: 'lg', wrap: true },
          { 
            type: 'text', 
            text: `(設定於 ${createdString})`, 
            size: 'xs', 
            color: '#aaaaaa',
            margin: 'md'
          },
          { 
            type: 'text', 
            text: reminder.isAlarm ? '☀️ 起床囉！新的一天開始了！' : '記得處理這件事喔！', 
            wrap: true, 
            margin: 'lg' 
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
            style: 'link',
            height: 'sm',
            action: {
              type: 'message',
              label: '我知道了',
              text: `知道了提醒 ${reminder.title.substring(0,10)}...` 
            }
          }
        ]
      }
    }
  };
}

/**
 * Creates a Flex Message carousel for listing reminders.
 * @param {Array<object>} remindersArray - An array of reminder objects.
 * @param {string} userId - The user ID, to create specific dismiss actions.
 * @returns {object} Flex Message carousel or a text message if no reminders.
 */
function createRemindersList(remindersArray, userId) {
  console.log(`🎨 [FLEX_MSG] createRemindersList called for user ${userId} with ${remindersArray ? remindersArray.length : 0} reminders.`);
  if (!remindersArray || remindersArray.length === 0) {
    return createTextMessage("您目前沒有設定任何有效的提醒。");
  }

  const bubbles = remindersArray.slice(0, 10).map(reminder => { 
    const targetTime = new Date(reminder.targetTime);
    const timeString = targetTime.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const methodText = reminder.reminderMethod === 'twilio' ? '📞 電話' : '📱 LINE';

    return {
      type: 'bubble',
      size: 'kilo', 
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { 
            type: 'text', 
            text: reminder.title.substring(0, 40), 
            weight: 'bold', 
            size: 'md',
            color: '#1DB446'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box', layout: 'baseline', spacing: 'sm',
            contents: [
              { type: 'text', text: '時間', color: '#aaaaaa', size: 'xs', flex: 2 },
              { type: 'text', text: timeString, color: '#666666', size: 'xs', flex: 4, wrap: true }
            ]
          },
          {
            type: 'box', layout: 'baseline', spacing: 'sm',
            contents: [
              { type: 'text', text: '方式', color: '#aaaaaa', size: 'xs', flex: 2 },
              { type: 'text', text: methodText, color: '#666666', size: 'xs', flex: 4 }
            ]
          },
           {
            type: 'box', layout: 'baseline', spacing: 'sm',
            contents: [
              { type: 'text', text: 'ID', color: '#aaaaaa', size: 'xxs', flex: 2 },
              { type: 'text', text: reminder.id, color: '#aaaaaa', size: 'xxs', flex: 4 }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        contents: [
          {
            type: 'button',
            style: 'primary', 
            color: '#FF6B6E', 
            height: 'sm',
            action: { type: 'message', label: '取消此提醒', text: `/取消提醒 ${reminder.id}` }
          }
        ]
      }
    };
  });

  return createCarousel(bubbles, `您的提醒清單 (${remindersArray.length}則)`);
}


module.exports = {
  createTextMessage,
  createSimpleCard,
  createCarousel,
  createErrorReply,
  createReminderSetConfirmation,
  createReminderNotificationCard,
  createRemindersList
};
