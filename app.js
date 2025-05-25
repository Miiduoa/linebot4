const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('🚀 正在啟動超級進化版 LINE Bot v8.0 - 顧晉瑋的全方位智能助手...');
console.log('⏰ 當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

// 配置資訊
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
const MY_PHONE_NUMBER = process.env.MY_PHONE_NUMBER || '+886912345678'; // 你的電話號碼

// 用戶配置
const MY_LINE_ID = process.env.MY_LINE_ID || 'U59af77e69411ffb99a49f1f2c3e2afc4';
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

console.log(`🔑 使用LINE ID: ${MY_LINE_ID}`);
console.log(`📞 電話功能: ${TWILIO_ACCOUNT_SID ? '已啟用' : '未啟用'}`);

// 增強的決策詢問系統
class EnhancedDecisionSystem {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionHistory = new Map();
    this.socialDecisions = new Map(); // 新增：社交決策
    console.log('🔐 增強版決策系統已初始化');
  }

  async requestDecision(context, question, originalReplyToken, originalUserId, groupId = null, decisionType = 'general') {
    const decisionId = `decision-${Date.now()}`;
    
    this.pendingDecisions.set(decisionId, {
      context,
      question,
      originalReplyToken,
      originalUserId,
      groupId,
      decisionType,
      timestamp: new Date(),
      status: 'pending'
    });

    try {
      console.log(`🔐 發送${decisionType}決策請求到: ${MY_LINE_ID}`);
      
      const inquiryMessage = this.createDecisionMessage(decisionId, context, question, decisionType);

      const success = await pushMessageSystem.safePushMessage(MY_LINE_ID, inquiryMessage);
      
      if (success) {
        console.log(`✅ 決策請求已發送: ${decisionId}`);
        
        // 暫時回覆給原用戶
        if (originalReplyToken && !replyTokenManager.isTokenUsed(originalReplyToken)) {
          await safeReply(originalReplyToken, {
            type: 'text',
            text: '🤔 讓我考慮一下這個請求，稍等片刻...'
          });
        }
        
        return decisionId;
      } else {
        console.error('💥 決策請求發送失敗');
        return null;
      }
      
    } catch (error) {
      console.error('💥 發送決策請求失敗:', error);
      return null;
    }
  }

  createDecisionMessage(decisionId, context, question, decisionType) {
    const typeEmoji = {
      'social': '🤝',
      'appointment': '📅',
      'work': '💼',
      'general': '🤔'
    };

    const emoji = typeEmoji[decisionType] || '🤔';

    return {
      type: 'template',
      altText: `${emoji} 需要你的決策：${question}`,
      template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop',
        title: `${emoji} 決策請求 - ${this.getTypeText(decisionType)}`,
        text: `${context}\n\n${question}`.substring(0, 160),
        actions: [
          {
            type: 'postback',
            label: '✅ 同意',
            data: `decision:${decisionId}:approve`,
            displayText: '我同意這個決策'
          },
          {
            type: 'postback',
            label: '❌ 拒絕',
            data: `decision:${decisionId}:reject`,
            displayText: '我拒絕這個決策'
          },
          {
            type: 'postback',
            label: '💬 需要詳情',
            data: `decision:${decisionId}:info`,
            displayText: '我需要更多資訊'
          },
          {
            type: 'postback',
            label: '⏰ 稍後決定',
            data: `decision:${decisionId}:later`,
            displayText: '我稍後再決定'
          }
        ]
      }
    };
  }

  getTypeText(type) {
    const typeTexts = {
      'social': '社交邀請',
      'appointment': '約會安排',
      'work': '工作事務',
      'general': '一般決策'
    };
    return typeTexts[type] || '一般決策';
  }

  async handleDecisionResponse(decisionId, action, responseToken) {
    const decision = this.pendingDecisions.get(decisionId);
    if (!decision) {
      return '❌ 找不到該決策請求';
    }

    decision.status = 'resolved';
    decision.decision = action;
    decision.resolvedAt = new Date();

    let responseMessage = '';
    let userMessage = '';

    switch (action) {
      case 'approve':
        responseMessage = '✅ 已批准決策，正在執行...';
        userMessage = '✅ 經過考慮，我同意你的提案！';
        break;
      case 'reject':
        responseMessage = '❌ 已拒絕決策';
        userMessage = '❌ 抱歉，我無法接受這個提案。';
        break;
      case 'info':
        responseMessage = '💬 需要更多資訊';
        userMessage = '🤔 我需要更多資訊才能決定，能詳細說明一下嗎？';
        break;
      case 'later':
        responseMessage = '⏰ 稍後決定';
        userMessage = '⏰ 讓我再想想，稍後回覆你。';
        break;
    }

    await safeReply(responseToken, { type: 'text', text: responseMessage });

    // 通知原用戶
    try {
      if (decision.groupId) {
        await pushMessageSystem.safePushMessage(decision.groupId, userMessage);
      } else if (decision.originalUserId !== MY_LINE_ID) {
        await pushMessageSystem.safePushMessage(decision.originalUserId, userMessage);
      }
    } catch (error) {
      console.error('💥 通知用戶失敗:', error);
    }

    this.decisionHistory.set(decisionId, decision);
    this.pendingDecisions.delete(decisionId);

    return responseMessage;
  }

  shouldRequestDecision(message) {
    // 原有的敏感操作關鍵詞
    const sensitiveKeywords = [
      /刪除.*檔案/, /修改.*程式/, /重啟.*系統/, /更新.*設定/,
      /清空.*資料/, /移除.*所有/, /重置.*/, /格式化/,
      /發送.*所有人/, /群發/, /廣播/, /通知.*所有/,
      /執行.*指令/, /運行.*腳本/, /啟動.*功能/,
      /購買/, /付款/, /轉帳/, /交易/,
      /封鎖/, /解封/, /刪除.*用戶/, /踢出/
    ];

    // 新增：社交和約會相關關鍵詞
    const socialKeywords = [
      /約.*吃飯/, /約.*喝茶/, /約.*看電影/, /約.*出去/,
      /明天.*見面/, /後天.*聚會/, /週末.*約/,
      /一起.*吃/, /一起.*玩/, /一起.*去/,
      /邀請.*參加/, /請.*來/, /歡迎.*加入/,
      /報告.*時間/, /會議.*時間/, /簡報.*安排/,
      /工作.*討論/, /專案.*會議/, /開會.*時間/
    ];

    // 檢查敏感操作
    if (sensitiveKeywords.some(pattern => pattern.test(message))) {
      return { needDecision: true, type: 'general' };
    }

    // 檢查社交邀約
    if (socialKeywords.some(pattern => pattern.test(message))) {
      return { needDecision: true, type: 'social' };
    }

    return { needDecision: false };
  }
}

// 視覺化回覆系統
class VisualResponseSystem {
  constructor() {
    console.log('🎨 視覺化回覆系統已初始化');
  }

  createWeatherCard(weatherData) {
    const weatherEmoji = this.getWeatherEmoji(weatherData.weather);
    
    return {
      type: 'template',
      altText: `${weatherData.location}天氣預報：${weatherData.weather} ${weatherData.minTemp}°C-${weatherData.maxTemp}°C`,
      template: {
        type: 'buttons',
        thumbnailImageUrl: this.getWeatherImage(weatherData.weather),
        title: `${weatherEmoji} ${weatherData.location} 天氣預報`,
        text: `${weatherData.weather}\n🌡️ ${weatherData.minTemp}°C - ${weatherData.maxTemp}°C\n☔ 降雨機率 ${weatherData.rainChance}%`,
        actions: [
          {
            type: 'postback',
            label: '🔄 更新天氣',
            data: `weather:update:${weatherData.location}`,
            displayText: '更新天氣資訊'
          },
          {
            type: 'postback',
            label: '📍 其他城市',
            data: 'weather:other',
            displayText: '查詢其他城市天氣'
          },
          {
            type: 'postback',
            label: '📊 一週預報',
            data: `weather:week:${weatherData.location}`,
            displayText: '查看一週預報'
          }
        ]
      }
    };
  }

  createNewsCarousel(articles) {
    const columns = articles.slice(0, 10).map((article, index) => ({
      thumbnailImageUrl: article.urlToImage || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&h=300&fit=crop',
      title: article.title.substring(0, 40),
      text: (article.description || '').substring(0, 60) + '...',
      actions: [
        {
          type: 'uri',
          label: '📖 閱讀全文',
          uri: article.url
        },
        {
          type: 'postback',
          label: '📰 更多新聞',
          data: 'news:more',
          displayText: '看更多新聞'
        }
      ]
    }));

    return {
      type: 'template',
      altText: '📰 最新新聞',
      template: {
        type: 'carousel',
        columns: columns
      }
    };
  }

  createFunctionMenu() {
    return {
      type: 'template',
      altText: '🎛️ 功能選單',
      template: {
        type: 'carousel',
        columns: [
          {
            thumbnailImageUrl: 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=400&h=300&fit=crop',
            title: '🌤️ 天氣查詢',
            text: '查詢全台各地天氣資訊',
            actions: [
              {
                type: 'postback',
                label: '🌤️ 台北天氣',
                data: 'weather:taipei',
                displayText: '台北天氣'
              },
              {
                type: 'postback',
                label: '🌦️ 其他城市',
                data: 'weather:other',
                displayText: '其他城市天氣'
              }
            ]
          },
          {
            thumbnailImageUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&h=300&fit=crop',
            title: '📰 新聞資訊',
            text: '獲取最新新聞頭條',
            actions: [
              {
                type: 'postback',
                label: '📰 最新新聞',
                data: 'news:latest',
                displayText: '最新新聞'
              },
              {
                type: 'postback',
                label: '🔥 熱門新聞',
                data: 'news:hot',
                displayText: '熱門新聞'
              }
            ]
          },
          {
            thumbnailImageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=300&fit=crop',
            title: '⏰ 提醒鬧鐘',
            text: '設定提醒和鬧鐘功能',
            actions: [
              {
                type: 'postback',
                label: '⏰ 設定提醒',
                data: 'reminder:set',
                displayText: '設定提醒'
              },
              {
                type: 'postback',
                label: '📞 設定鬧鐘',
                data: 'alarm:set',
                displayText: '設定鬧鐘'
              }
            ]
          },
          {
            thumbnailImageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=300&fit=crop',
            title: '🛠️ 系統功能',
            text: '查看系統狀態和設定',
            actions: [
              {
                type: 'postback',
                label: '📊 系統狀態',
                data: 'system:status',
                displayText: '系統狀態'
              },
              {
                type: 'postback',
                label: '📋 我的提醒',
                data: 'reminder:list',
                displayText: '我的提醒'
              }
            ]
          }
        ]
      }
    };
  }

  createReminderCard(reminders) {
    if (reminders.length === 0) {
      return {
        type: 'text',
        text: '📭 你目前沒有任何提醒呢！\n\n💡 試試說「10分鐘後提醒我休息」來設定提醒 😊'
      };
    }

    const reminderButtons = reminders.slice(0, 3).map((reminder, index) => ({
      type: 'postback',
      label: `${index + 1}. ${reminder.title.substring(0, 15)}`,
      data: `reminder:detail:${reminder.id}`,
      displayText: `查看提醒：${reminder.title}`
    }));

    return {
      type: 'template',
      altText: '📋 我的提醒清單',
      template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=300&fit=crop',
        title: '📋 我的提醒清單',
        text: `共有 ${reminders.length} 個提醒`,
        actions: reminderButtons
      }
    };
  }

  getWeatherEmoji(weather) {
    if (weather.includes('晴')) return '☀️';
    if (weather.includes('雲')) return '☁️';
    if (weather.includes('雨')) return '🌧️';
    if (weather.includes('雷')) return '⛈️';
    if (weather.includes('雪')) return '🌨️';
    return '🌤️';
  }

  getWeatherImage(weather) {
    if (weather.includes('晴')) return 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?w=400&h=300&fit=crop';
    if (weather.includes('雲')) return 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=400&h=300&fit=crop';
    if (weather.includes('雨')) return 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=400&h=300&fit=crop';
    return 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?w=400&h=300&fit=crop';
  }
}

// 收回訊息偵測系統
class UnsendMessageDetectionSystem {
  constructor() {
    this.messageHistory = new Map();
    this.unsendHistory = new Map();
    console.log('🔍 收回訊息偵測系統已初始化');
  }

  recordMessage(userId, userName, messageId, content, timestamp) {
    this.messageHistory.set(messageId, {
      userId,
      userName,
      content,
      timestamp,
      unsent: false
    });

    // 保持最近1000條記錄
    if (this.messageHistory.size > 1000) {
      const oldestKey = this.messageHistory.keys().next().value;
      this.messageHistory.delete(oldestKey);
    }
  }

  async handleUnsendEvent(event) {
    const messageId = event.unsend.messageId;
    const userId = event.source.userId;

    console.log(`🔍 偵測到收回訊息: ${messageId} by ${userId}`);

    const originalMessage = this.messageHistory.get(messageId);
    
    if (originalMessage) {
      originalMessage.unsent = true;
      originalMessage.unsendTime = new Date();

      // 記錄收回歷史
      const unsendId = `unsend-${Date.now()}`;
      this.unsendHistory.set(unsendId, {
        ...originalMessage,
        unsendId,
        unsendTime: new Date()
      });

      // 發送通知給管理員
      await this.notifyUnsendMessage(originalMessage);
    } else {
      console.log('⚠️ 找不到原始訊息記錄');
      
      // 發送未知收回通知
      await this.notifyUnknownUnsend(userId);
    }
  }

  async notifyUnsendMessage(messageData) {
    try {
      const reportMessage = `🔍 收回訊息偵測

👤 用戶：${messageData.userName}
⏰ 原發送時間：${messageData.timestamp.toLocaleString('zh-TW')}
🗑️ 收回時間：${messageData.unsendTime.toLocaleString('zh-TW')}

📝 收回的內容：
「${messageData.content}」

💡 用戶可能想要隱藏或修改這個訊息。`;

      const success = await pushMessageSystem.safePushMessage(MY_LINE_ID, reportMessage);
      
      if (success) {
        console.log(`✅ 收回訊息通知已發送: ${messageData.userName}`);
      }
      
    } catch (error) {
      console.error('💥 發送收回訊息通知失敗:', error);
    }
  }

  async notifyUnknownUnsend(userId) {
    try {
      const reportMessage = `🔍 收回訊息偵測

👤 用戶ID：${userId}
⏰ 收回時間：${new Date().toLocaleString('zh-TW')}

❓ 收回了未知內容（可能是圖片、貼圖或其他媒體）

💡 建議關注該用戶的後續行為。`;

      await pushMessageSystem.safePushMessage(MY_LINE_ID, reportMessage);
      
    } catch (error) {
      console.error('💥 發送未知收回通知失敗:', error);
    }
  }

  getUnsendHistory(limit = 10) {
    return Array.from(this.unsendHistory.values())
      .sort((a, b) => b.unsendTime - a.unsendTime)
      .slice(0, limit);
  }
}

// 修復的提醒系統
class FixedReminderSystem {
  constructor() {
    this.reminders = new Map();
    this.activeTimers = new Map();
    this.reminderHistory = new Map();
    console.log('⏰ 修復版提醒系統已初始化');
  }

  createReminder(userId, title, targetTime, description = '', isAlarm = false) {
    const reminderId = `${isAlarm ? 'alarm' : 'reminder'}-${userId}-${Date.now()}`;
    const now = new Date();
    
    const reminder = {
      id: reminderId,
      userId,
      title,
      targetTime,
      description,
      created: now,
      active: true,
      completed: false,
      isAlarm,
      type: isAlarm ? 'alarm' : 'reminder'
    };

    this.reminders.set(reminderId, reminder);
    
    const delay = targetTime.getTime() - now.getTime();
    
    if (delay > 0) {
      const timerId = setTimeout(async () => {
        await this.executeReminder(reminderId);
      }, delay);
      
      this.activeTimers.set(reminderId, timerId);
      
      console.log(`⏰ ${reminder.type}已設定: ${title} - ${delay}ms後觸發`);
      
      return reminderId;
    } else {
      console.log('⚠️ 時間已過，立即觸發');
      this.executeReminder(reminderId);
      return reminderId;
    }
  }

  async executeReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || !reminder.active) {
      console.log(`⚠️ 提醒 ${reminderId} 已失效或被取消`);
      return;
    }

    console.log(`🔔 正在執行${reminder.type}: ${reminder.title}`);

    try {
      if (reminder.isAlarm) {
        // 鬧鐘功能：發送訊息 + 打電話
        await this.executeAlarm(reminder);
      } else {
        // 一般提醒：只發送訊息
        await this.executeNormalReminder(reminder);
      }
      
      this.activeTimers.delete(reminderId);
      
    } catch (error) {
      console.error('💥 執行提醒失敗:', error);
    }
  }

  async executeNormalReminder(reminder) {
    const message = visualResponse.createReminderExecuteCard(reminder);
    await client.pushMessage(reminder.userId, message);
    console.log(`✅ 提醒已發送: ${reminder.title}`);
  }

  async executeAlarm(reminder) {
    // 發送LINE訊息
    const alarmMessage = {
      type: 'template',
      altText: `🔔 鬧鐘：${reminder.title}`,
      template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=300&fit=crop',
        title: '🔔 鬧鐘時間到！',
        text: `${reminder.title}\n\n現在時間：${new Date().toLocaleString('zh-TW')}`,
        actions: [
          {
            type: 'postback',
            label: '✅ 我醒了',
            data: `alarm_stop:${reminder.id}`,
            displayText: '我醒了'
          },
          {
            type: 'postback',
            label: '😴 再睡5分鐘',
            data: `alarm_snooze:${reminder.id}:5`,
            displayText: '再睡5分鐘'
          },
          {
            type: 'postback',
            label: '😴 再睡10分鐘',
            data: `alarm_snooze:${reminder.id}:10`,
            displayText: '再睡10分鐘'
          }
        ]
      }
    };

    await client.pushMessage(reminder.userId, alarmMessage);
    console.log(`✅ 鬧鐘訊息已發送: ${reminder.title}`);

    // 打電話（如果有設定Twilio）
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      await this.makePhoneCall(reminder);
    } else {
      console.log('📞 電話功能未設定，跳過撥號');
    }
  }

  async makePhoneCall(reminder) {
    try {
      console.log(`📞 正在撥打電話: ${MY_PHONE_NUMBER}`);
      
      // 這裡使用 Twilio API 撥打電話
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
      
      const callData = {
        From: TWILIO_PHONE_NUMBER,
        To: MY_PHONE_NUMBER,
        Url: `${process.env.BASE_URL || 'https://your-app.com'}/twiml/alarm`,
        Method: 'GET'
      };

      const response = await axios.post(twilioUrl, new URLSearchParams(callData), {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`✅ 電話撥打成功: ${response.data.sid}`);
      
    } catch (error) {
      console.error('💥 撥打電話失敗:', error.message);
    }
  }

  parseTimeExpression(text) {
    const timePatterns = [
      { pattern: /(\d{1,2})秒後/, multiplier: 1000, type: 'relative' },
      { pattern: /(\d{1,2})分鐘後/, multiplier: 60000, type: 'relative' },
      { pattern: /(\d{1,2})小時後/, multiplier: 3600000, type: 'relative' },
      { pattern: /明天.*?(\d{1,2})點/, offset: 1, type: 'absolute' },
      { pattern: /後天.*?(\d{1,2})點/, offset: 2, type: 'absolute' },
      { pattern: /今天.*?(\d{1,2})點/, offset: 0, type: 'absolute' },
      { pattern: /(\d{1,2})點.*?叫我/, offset: 0, type: 'alarm' }, // 新增：鬧鐘模式
      { pattern: /(\d{1,2})點.*?起床/, offset: 0, type: 'alarm' }
    ];

    for (const timePattern of timePatterns) {
      const match = text.match(timePattern.pattern);
      if (match) {
        const now = new Date();
        const value = parseInt(match[1]);
        
        if (timePattern.type === 'relative') {
          return {
            time: new Date(now.getTime() + value * timePattern.multiplier),
            isAlarm: false
          };
        } else if (timePattern.type === 'absolute' || timePattern.type === 'alarm') {
          const targetDate = new Date(now);
          targetDate.setHours(value, 0, 0, 0);
          
          if (timePattern.offset === 0 && targetDate <= now) {
            targetDate.setDate(targetDate.getDate() + 1);
          } else if (timePattern.offset > 0) {
            targetDate.setDate(targetDate.getDate() + timePattern.offset);
          }
          
          return {
            time: targetDate,
            isAlarm: timePattern.type === 'alarm'
          };
        }
      }
    }
    
    return null;
  }

  async handleReminderAction(userId, action, reminderId, params = null) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) {
      return '❌ 找不到該提醒';
    }

    console.log(`🔧 處理提醒操作: ${action} for ${reminderId}`);

    switch (action) {
      case 'stop':
        reminder.completed = true;
        reminder.active = false;
        this.clearTimer(reminderId);
        return reminder.isAlarm ? '✅ 鬧鐘已關閉！起床囉！' : '✅ 提醒已完成！';
        
      case 'snooze':
        const snoozeMinutes = parseInt(params) || 5;
        const newTime = new Date(Date.now() + snoozeMinutes * 60000);
        
        this.clearTimer(reminderId);
        
        const delay = newTime.getTime() - Date.now();
        const timerId = setTimeout(async () => {
          await this.executeReminder(reminderId);
        }, delay);
        
        this.activeTimers.set(reminderId, timerId);
        reminder.targetTime = newTime;
        
        console.log(`⏰ ${reminder.type}延後 ${snoozeMinutes} 分鐘`);
        return `😴 已延後 ${snoozeMinutes} 分鐘，${newTime.toLocaleTimeString('zh-TW')} 再${reminder.isAlarm ? '叫你' : '提醒你'}`;
        
      case 'cancel':
        reminder.active = false;
        this.clearTimer(reminderId);
        return `🗑️ ${reminder.isAlarm ? '鬧鐘' : '提醒'}已取消`;
        
      default:
        return '❓ 未知的操作';
    }
  }

  clearTimer(reminderId) {
    const timerId = this.activeTimers.get(reminderId);
    if (timerId) {
      clearTimeout(timerId);
      this.activeTimers.delete(reminderId);
      console.log(`🧹 清除計時器: ${reminderId}`);
    }
  }

  getUserReminders(userId) {
    const userReminders = Array.from(this.reminders.values())
      .filter(r => r.userId === userId && r.active)
      .sort((a, b) => a.targetTime - b.targetTime);
    
    return userReminders;
  }

  getStatus() {
    return {
      totalReminders: this.reminders.size,
      activeReminders: Array.from(this.reminders.values()).filter(r => r.active).length,
      activeTimers: this.activeTimers.size,
      activeAlarms: Array.from(this.reminders.values()).filter(r => r.active && r.isAlarm).length
    };
  }
}

// API 管理系統
class EnhancedAPIManager {
  constructor() {
    this.apiStatus = new Map();
    this.lastSuccessfulCall = new Map();
    this.failureCount = new Map();
    console.log('🔧 增強API管理系統已初始化');
  }

  async smartAPICall(prompt) {
    try {
      console.log('🤖 嘗試調用Gemini API...');
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      this.recordSuccess('gemini');
      console.log('✅ Gemini API調用成功');
      return text;
      
    } catch (error) {
      console.error('❌ Gemini API失敗:', error.message);
      this.recordFailure('gemini');
      return this.getFallbackResponse(prompt);
    }
  }

  getFallbackResponse(prompt) {
    const responses = [
      '哈哈，這個問題很有趣！讓我想想... 🤔',
      '好der，我了解你的意思！ 👌',
      'ㄜ...這個我需要再研究一下 😅',
      '有道理！你說得很對 ✨',
      '這個話題很不錯呢！ 😊',
      '我覺得這樣很棒！ 🎉'
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  recordSuccess(apiName) {
    this.lastSuccessfulCall.set(apiName, new Date());
    this.failureCount.set(apiName, 0);
    this.apiStatus.set(apiName, 'healthy');
  }

  recordFailure(apiName) {
    const currentFailures = this.failureCount.get(apiName) || 0;
    this.failureCount.set(apiName, currentFailures + 1);
    
    if (currentFailures >= 3) {
      this.apiStatus.set(apiName, 'unhealthy');
    }
  }

  getAPIStatus() {
    const status = {};
    for (const [api, health] of this.apiStatus) {
      status[api] = {
        status: health,
        lastSuccess: this.lastSuccessfulCall.get(api),
        failureCount: this.failureCount.get(api) || 0
      };
    }
    return status;
  }
}

// 安全推送系統
class SafePushMessageSystem {
  constructor() {
    this.pushQueue = [];
    this.isProcessingQueue = false;
    console.log('📨 安全推送訊息系統已初始化');
  }

  async safePushMessage(targetId, message, retryCount = 0) {
    try {
      console.log(`📤 嘗試推送訊息到: ${targetId}`);
      
      const formattedMessage = this.formatMessage(message);
      
      await client.pushMessage(targetId, formattedMessage);
      console.log('✅ 推送訊息成功');
      return true;
      
    } catch (error) {
      console.error(`💥 推送訊息失敗 (嘗試 ${retryCount + 1}):`, error.message);
      
      if (error.response?.status === 400 || retryCount >= 2) {
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
      return await this.safePushMessage(targetId, message, retryCount + 1);
    }
  }

  formatMessage(message) {
    if (typeof message === 'string') {
      return {
        type: 'text',
        text: this.limitMessageLength(message)
      };
    }
    
    if (message && message.text) {
      message.text = this.limitMessageLength(message.text);
    }
    
    return message;
  }

  limitMessageLength(text, maxLength = MAX_MESSAGE_LENGTH) {
    if (text.length > maxLength) {
      return text.substring(0, maxLength - 20) + '\n\n...(內容太長被截掉了 😅)';
    }
    return text;
  }

  async testPushMessage() {
    try {
      console.log('🧪 測試推送訊息功能...');
      const testMessage = `🧪 系統測試訊息 ${new Date().toLocaleString('zh-TW')}`;
      
      const success = await this.safePushMessage(MY_LINE_ID, testMessage);
      
      if (success) {
        console.log('✅ 推送訊息測試成功');
      } else {
        console.error('❌ 推送訊息測試失敗');
      }
      
      return success;
    } catch (error) {
      console.error('💥 推送訊息測試出錯:', error);
      return false;
    }
  }
}

// 天氣系統
class WeatherSystem {
  constructor() {
    this.apiKey = WEATHER_API_KEY;
    console.log('🌤️ 天氣系統已初始化');
  }

  async getWeather(cityName) {
    try {
      console.log(`🌤️ 查詢天氣: ${cityName}`);
      
      const response = await axios.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001', {
        params: {
          Authorization: this.apiKey,
          locationName: cityName
        },
        timeout: 10000
      });

      if (response.data.success === 'true' && response.data.records.location.length > 0) {
        return this.formatWeatherData(response.data.records.location[0]);
      } else {
        return this.getFallbackWeather(cityName);
      }
    } catch (error) {
      console.error('💥 天氣查詢錯誤:', error.message);
      return this.getFallbackWeather(cityName);
    }
  }

  formatWeatherData(locationData) {
    const weather = locationData.weatherElement;
    
    const minTemp = weather.find(el => el.elementName === 'MinT');
    const maxTemp = weather.find(el => el.elementName === 'MaxT');
    const wx = weather.find(el => el.elementName === 'Wx');
    const pop = weather.find(el => el.elementName === 'PoP');

    return {
      location: locationData.locationName,
      minTemp: minTemp?.time?.[0]?.parameter?.parameterName || 'N/A',
      maxTemp: maxTemp?.time?.[0]?.parameter?.parameterName || 'N/A',
      weather: wx?.time?.[0]?.parameter?.parameterName || 'N/A',
      rainChance: pop?.time?.[0]?.parameter?.parameterName || 'N/A',
      updateTime: new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}),
      isFallback: false
    };
  }

  getFallbackWeather(cityName) {
    return {
      location: cityName,
      minTemp: '18',
      maxTemp: '25',
      weather: '多雲時晴',
      rainChance: '30',
      updateTime: new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}),
      isFallback: true
    };
  }

  extractCityFromText(text) {
    const cities = [
      '台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', 
      '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', 
      '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江'
    ];
    
    for (const city of cities) {
      if (text.includes(city)) {
        return city;
      }
    }
    return '台北';
  }
}

// 新聞系統
class NewsSystem {
  constructor() {
    this.apiKey = NEWS_API_KEY;
    console.log('📰 新聞系統已初始化');
  }

  async getNews() {
    try {
      console.log('📰 獲取最新新聞');
      
      const response = await axios.get('https://newsapi.org/v2/top-headlines', {
        params: {
          country: 'tw',
          apiKey: this.apiKey,
          pageSize: 10
        },
        timeout: 10000
      });

      if (response.data.articles && response.data.articles.length > 0) {
        return response.data.articles;
      } else {
        return this.getFallbackNews();
      }
    } catch (error) {
      console.error('💥 新聞查詢錯誤:', error.message);
      return this.getFallbackNews();
    }
  }

  getFallbackNews() {
    return [
      {
        title: '科技發展持續進步',
        description: 'AI技術日新月異，帶來更多可能性',
        url: 'https://example.com',
        urlToImage: null
      },
      {
        title: '台灣經濟表現穩定',
        description: '各產業持續發展，展現韌性',
        url: 'https://example.com',
        urlToImage: null
      }
    ];
  }
}

// 防重複回覆系統
class ReplyTokenManager {
  constructor() {
    this.usedTokens = new Set();
    this.tokenTimestamps = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  isTokenUsed(replyToken) {
    return this.usedTokens.has(replyToken);
  }

  markTokenUsed(replyToken) {
    this.usedTokens.add(replyToken);
    this.tokenTimestamps.set(replyToken, Date.now());
  }

  cleanup() {
    const now = Date.now();
    const expiredTime = 10 * 60 * 1000;
    
    for (const [token, timestamp] of this.tokenTimestamps) {
      if (now - timestamp > expiredTime) {
        this.usedTokens.delete(token);
        this.tokenTimestamps.delete(token);
      }
    }
  }
}

// 初始化系統
const apiManager = new EnhancedAPIManager();
const pushMessageSystem = new SafePushMessageSystem();
const decisionSystem = new EnhancedDecisionSystem();
const visualResponse = new VisualResponseSystem();
const unsendDetection = new UnsendMessageDetectionSystem();
const reminderSystem = new FixedReminderSystem();
const weatherSystem = new WeatherSystem();
const newsSystem = new NewsSystem();
const replyTokenManager = new ReplyTokenManager();

// 輔助函數
async function safeReply(replyToken, message, retryCount = 0) {
  try {
    if (replyTokenManager.isTokenUsed(replyToken)) {
      console.log('⚠️ replyToken 已使用，跳過回覆');
      return false;
    }

    replyTokenManager.markTokenUsed(replyToken);

    if (!replyToken) {
      console.log('⚠️ 空的replyToken，跳過回覆');
      return false;
    }

    const formattedMessage = pushMessageSystem.formatMessage(message);
    
    await client.replyMessage(replyToken, formattedMessage);
    console.log('✅ 回覆發送成功');
    return true;
    
  } catch (error) {
    console.error(`💥 回覆失敗 (嘗試 ${retryCount + 1}):`, error.message);
    
    if (error.message.includes('400') || retryCount >= 1) {
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    return await safeReply(replyToken, message, retryCount + 1);
  }
}

function isWeatherQuery(text) {
  const weatherKeywords = ['天氣', '氣溫', '下雨', '晴天', '陰天', '溫度', '濕度', '風速', '預報'];
  return weatherKeywords.some(keyword => text.includes(keyword));
}

function isNewsQuery(text) {
  const newsKeywords = ['新聞', '時事', '頭條', '報導', '最新消息'];
  return newsKeywords.some(keyword => text.includes(keyword));
}

function isReminderQuery(text) {
  return text.includes('提醒我') || /\d+秒後|\d+分鐘後|\d+小時後|\d+點.*叫我|\d+點.*起床/.test(text);
}

function isFunctionMenuQuery(text) {
  const menuKeywords = ['功能', '選單', '菜單', '幫助', 'help', '功能列表'];
  return menuKeywords.some(keyword => text.includes(keyword));
}

async function handleGeneralChat(message, userId) {
  try {
    const prompt = `用戶說：${message}

請以顧晉瑋的身份回應，我是靜宜大學資管系學生，對科技AI有高度興趣。回應要自然親切，可以用一些台灣口語如「好der」、「ㄜ」、「哎呦」等。保持友善和有趣的語氣。`;

    const response = await apiManager.smartAPICall(prompt);
    return response;
    
  } catch (error) {
    console.error('💥 一般對話處理失敗:', error.message);
    return '哈哈，我現在有點忙碌，但我懂你的意思！好der～ 😊';
  }
}

// TwiML端點（用於電話鬧鐘）
app.get('/twiml/alarm', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="zh-TW">早安！鬧鐘時間到了！該起床了！</Say>
    <Pause length="2"/>
    <Say voice="alice" language="zh-TW">這是你的專屬鬧鐘提醒，請盡快起床開始美好的一天！</Say>
    <Pause length="1"/>
    <Say voice="alice" language="zh-TW">祝你有個美好的一天！</Say>
</Response>`);
});

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const reminderStatus = reminderSystem.getStatus();
  
  res.send(`
    <h1>🎓 顧晉瑋的超級進化版AI助手 v8.0</h1>
    <p><strong>身份：靜宜大學資訊管理系學生</strong></p>
    <p><strong>🇹🇼 台灣時間：${currentTime}</strong></p>
    <p><strong>🔑 LINE ID：${MY_LINE_ID}</strong></p>
    <p><strong>📞 電話功能：${TWILIO_ACCOUNT_SID ? '✅ 已啟用' : '❌ 未啟用'}</strong></p>
    
    <h2>🆕 v8.0 全新功能：</h2>
    <ul>
      <li>✅ <strong>擴展決策系統</strong> - 約會、報告都會先詢問</li>
      <li>✅ <strong>視覺化回覆</strong> - 豐富的圖表和選單</li>
      <li>✅ <strong>收回訊息偵測</strong> - 監控用戶收回的內容</li>
      <li>✅ <strong>功能選單</strong> - 完整的互動式選單</li>
      <li>✅ <strong>修復提醒系統</strong> - 更穩定的提醒功能</li>
      <li>✅ <strong>電話鬧鐘</strong> - 六點叫你起床會打電話！</li>
    </ul>
    
    <h2>📊 系統狀態：</h2>
    <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
      <p><strong>⏰ 活躍提醒：</strong> ${reminderStatus.activeReminders} 個</p>
      <p><strong>📞 活躍鬧鐘：</strong> ${reminderStatus.activeAlarms} 個</p>
      <p><strong>📋 總提醒數：</strong> ${reminderStatus.totalReminders} 個</p>
      <p><strong>🔧 計時器：</strong> ${reminderStatus.activeTimers} 個</p>
    </div>
    
    <h2>📱 使用方式：</h2>
    <ul>
      <li><strong>功能選單：</strong>「功能」「選單」「幫助」</li>
      <li><strong>天氣查詢：</strong>「台北天氣」</li>
      <li><strong>新聞查詢：</strong>「最新新聞」</li>
      <li><strong>設定提醒：</strong>「10分鐘後提醒我休息」</li>
      <li><strong>設定鬧鐘：</strong>「明天6點叫我起床」</li>
      <li><strong>約會決策：</strong>「約明天吃飯」（會先私訊問你）</li>
    </ul>

    <p><strong>💡 全新功能上線！現在更智能、更實用了！好der 👌</strong></p>
    
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
      h1, h2 { color: #333; }
      ul li { margin: 5px 0; }
      .status-healthy { color: green; }
      .status-unhealthy { color: red; }
    </style>
  `);
});

// Webhook 端點
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) {
    return res.status(401).send('缺少簽名標頭');
  }

  const body = req.body.toString();
  const hash = crypto
    .createHmac('SHA256', config.channelSecret)
    .update(body)
    .digest('base64');

  if (signature !== hash) {
    return res.status(401).send('簽名驗證失敗');
  }

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
      console.error('💥 事件處理異步錯誤:', error.message);
    });
  });
});

// 事件處理函數
async function handleEvent(event) {
  try {
    console.log(`📨 收到事件類型: ${event.type}`);

    // 處理收回訊息事件
    if (event.type === 'unsend') {
      await unsendDetection.handleUnsendEvent(event);
      return;
    }

    // 處理 postback 事件
    if (event.type === 'postback') {
      const data = event.postback.data;
      console.log(`📤 處理 postback: ${data}`);
      
      if (data.startsWith('decision:')) {
        const [, decisionId, action] = data.split(':');
        const result = await decisionSystem.handleDecisionResponse(
          decisionId, 
          action, 
          event.replyToken
        );
        return;
      }

      if (data.startsWith('reminder_') || data.startsWith('alarm_')) {
        const [actionType, action, reminderId, ...params] = data.split(':');
        const result = await reminderSystem.handleReminderAction(
          event.source.userId, 
          action, 
          reminderId, 
          params[0]
        );
        
        await safeReply(event.replyToken, { type: 'text', text: result });
        return;
      }

      if (data.startsWith('weather:')) {
        const [, action, param] = data.split(':');
        await handleWeatherAction(action, param, event.replyToken);
        return;
      }

      if (data.startsWith('news:')) {
        const [, action] = data.split(':');
        await handleNewsAction(action, event.replyToken);
        return;
      }

      if (data === 'menu:functions') {
        const functionMenu = visualResponse.createFunctionMenu();
        await safeReply(event.replyToken, functionMenu);
        return;
      }

      if (data === 'reminder:list') {
        const userReminders = reminderSystem.getUserReminders(event.source.userId);
        const reminderCard = visualResponse.createReminderCard(userReminders);
        await safeReply(event.replyToken, reminderCard);
        return;
      }
    }

    if (event.type !== 'message' || event.message.type !== 'text') {
      return;
    }

    const userId = event.source.userId;
    const groupId = event.source.groupId;
    const messageText = event.message.text.trim();
    const replyToken = event.replyToken;
    const messageId = event.message.id;
    
    console.log(`📨 收到訊息: ${messageText} | 用戶: ${userId} | 訊息ID: ${messageId}`);

    // 獲取用戶名稱
    let userName = '未知用戶';
    try {
      if (groupId) {
        const profile = await client.getGroupMemberProfile(groupId, userId);
        userName = profile.displayName;
      } else {
        const profile = await client.getProfile(userId);
        userName = profile.displayName;
      }
    } catch (error) {
      console.log('無法獲取用戶名稱，使用預設值');
    }

    // 記錄訊息（用於收回偵測）
    unsendDetection.recordMessage(userId, userName, messageId, messageText, new Date());

    // 檢查是否需要決策詢問
    const decisionCheck = decisionSystem.shouldRequestDecision(messageText);
    if (decisionCheck.needDecision) {
      console.log(`🔐 觸發${decisionCheck.type}決策詢問: ${messageText}`);
      
      const decisionId = await decisionSystem.requestDecision(
        `${groupId ? '群組中' : '私人對話中'}用戶 ${userName} 的請求`,
        messageText,
        replyToken,
        userId,
        groupId,
        decisionCheck.type
      );
      
      if (decisionId) {
        console.log(`✅ 決策請求已發送，ID: ${decisionId}`);
        return;
      }
    }

    // 功能選單查詢
    if (isFunctionMenuQuery(messageText)) {
      const functionMenu = visualResponse.createFunctionMenu();
      await safeReply(replyToken, functionMenu);
      return;
    }

    // 提醒/鬧鐘設定
    if (isReminderQuery(messageText)) {
      const timeInfo = reminderSystem.parseTimeExpression(messageText);
      
      if (timeInfo) {
        const title = messageText.replace(/提醒我|秒後|分鐘後|小時後|\d+點.*叫我|\d+點.*起床|\d+/g, '').trim() || 
                     (timeInfo.isAlarm ? '起床鬧鐘' : '重要提醒');
        
        const reminderId = reminderSystem.createReminder(userId, title, timeInfo.time, '', timeInfo.isAlarm);
        
        const confirmMessage = {
          type: 'template',
          altText: `${timeInfo.isAlarm ? '📞 鬧鐘' : '⏰ 提醒'}設定成功：${title}`,
          template: {
            type: 'buttons',
            thumbnailImageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=300&fit=crop',
            title: `${timeInfo.isAlarm ? '📞 鬧鐘' : '⏰ 提醒'}設定成功！`,
            text: `${title}\n\n將在 ${timeInfo.time.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})} ${timeInfo.isAlarm ? '叫你起床' : '提醒你'}${timeInfo.isAlarm ? '\n\n📞 會打電話給你！' : ''}`,
            actions: [
              {
                type: 'postback',
                label: '📋 查看提醒',
                data: 'reminder:list',
                displayText: '查看我的提醒'
              },
              {
                type: 'postback',
                label: '🗑️ 取消',
                data: `${timeInfo.isAlarm ? 'alarm' : 'reminder'}_cancel:${reminderId}`,
                displayText: '取消這個提醒'
              },
              {
                type: 'text',
                label: '👌 了解',
                text: '了解'
              }
            ]
          }
        };
        
        await safeReply(replyToken, confirmMessage);
        return;
      }
    }

    // 新聞查詢
    if (isNewsQuery(messageText)) {
      try {
        const articles = await newsSystem.getNews();
        const newsCarousel = visualResponse.createNewsCarousel(articles);
        await safeReply(replyToken, newsCarousel);
        return;
      } catch (error) {
        await safeReply(replyToken, {
          type: 'text',
          text: '抱歉，新聞查詢暫時有問題，請稍後再試 📰'
        });
        return;
      }
    }

    // 天氣查詢
    if (isWeatherQuery(messageText)) {
      try {
        const city = weatherSystem.extractCityFromText(messageText);
        const weatherData = await weatherSystem.getWeather(city);
        const weatherCard = visualResponse.createWeatherCard(weatherData);
        
        await safeReply(replyToken, weatherCard);
        return;
      } catch (error) {
        await safeReply(replyToken, {
          type: 'text',
          text: 'ㄜ...天氣查詢暫時有問題，請稍後再試 🌤️'
        });
        return;
      }
    }

    // 一般對話處理
    const response = await handleGeneralChat(messageText, userId);
    await safeReply(replyToken, { type: 'text', text: response });

  } catch (error) {
    console.error('💥 事件處理錯誤:', error.message);
    
    if (event.replyToken && !replyTokenManager.isTokenUsed(event.replyToken)) {
      await safeReply(event.replyToken, {
        type: 'text',
        text: '抱歉，我遇到了一些問題，請稍後再試 😅'
      });
    }
  }
}

// 天氣操作處理
async function handleWeatherAction(action, param, replyToken) {
  try {
    switch (action) {
      case 'update':
        const weatherData = await weatherSystem.getWeather(param);
        const weatherCard = visualResponse.createWeatherCard(weatherData);
        await safeReply(replyToken, weatherCard);
        break;
        
      case 'other':
        await safeReply(replyToken, {
          type: 'text',
          text: '請輸入想查詢的城市名稱，例如：「高雄天氣」、「台中氣溫」'
        });
        break;
        
      case 'week':
        await safeReply(replyToken, {
          type: 'text',
          text: `📊 ${param}一週天氣預報功能開發中，敬請期待！`
        });
        break;
        
      case 'taipei':
        const taipeiWeather = await weatherSystem.getWeather('台北');
        const taipeiCard = visualResponse.createWeatherCard(taipeiWeather);
        await safeReply(replyToken, taipeiCard);
        break;
    }
  } catch (error) {
    await safeReply(replyToken, {
      type: 'text',
      text: '天氣查詢發生錯誤，請稍後再試 🌤️'
    });
  }
}

// 新聞操作處理
async function handleNewsAction(action, replyToken) {
  try {
    const articles = await newsSystem.getNews();
    const newsCarousel = visualResponse.createNewsCarousel(articles);
    await safeReply(replyToken, newsCarousel);
  } catch (error) {
    await safeReply(replyToken, {
      type: 'text',
      text: '新聞查詢發生錯誤，請稍後再試 📰'
    });
  }
}

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ LINE Bot 伺服器成功啟動！`);
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`📍 Webhook URL: /webhook`);
  console.log(`📞 TwiML URL: /twiml/alarm`);
  console.log(`🎓 顧晉瑋的超級進化版AI助手 v8.0 已就緒！`);
  console.log(`🆕 新功能：決策擴展、視覺化回覆、收回偵測、電話鬧鐘`);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

module.exports = app;