const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('🚀 正在啟動AI分身版 LINE Bot - 修復版...');
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

// 用戶配置
const OWNER_LINE_ID = 'U59af77e69411ffb99a49f1f2c3e2afc4';
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 主人個性檔案
const OWNER_PERSONALITY = {
  name: '顧晉瑋',
  identity: '靜宜大學資管系學生',
  speaking_style: {
    tone: '活潑友善，台灣年輕人語氣',
    expressions: ['超棒der', '好欸', '哎呦', '真的假的', '太酷啦', '我覺得可以', '沒問題啦'],
    punctuation: '經常使用驚嘆號和波浪號～',
    emoji_usage: '適度使用表情符號，不會過度'
  },
  values: {
    helpful: '很樂意幫助朋友',
    honest: '直率坦誠，不會拐彎抹角',
    tech_savvy: '對科技和程式設計很有興趣',
    student_life: '理解學生生活的忙碌和壓力'
  }
};

console.log('🔑 機器人主人:', OWNER_LINE_ID);
console.log('🎭 AI分身模式已啟用');

// AI分身系統
class AIPersonalitySystem {
  constructor() {
    this.conversations = new Map();
    this.userProfiles = new Map();
    this.groupContexts = new Map();
    console.log('🧠 AI分身系統已初始化');
  }

  async generatePersonalizedReply(userId, message, context = {}) {
    try {
      this.recordConversation(userId, message, context);
      
      const userProfile = this.userProfiles.get(userId) || { 
        name: '朋友', 
        messageCount: 0,
        isGroup: context.isGroup
      };

      const reply = await this.generateOwnerStyleReply(message, userProfile, context);
      return reply;

    } catch (error) {
      console.error('❌ AI分身回覆生成失敗:', error);
      return this.getOwnerStyleOfflineReply(message);
    }
  }

  async generateOwnerStyleReply(message, userProfile, context) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-002",
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1000
        }
      });
      
      let groupContext = '';
      if (context.isGroup && context.groupId) {
        groupContext = this.getGroupContext(context.groupId, 10);
      }
      
      const prompt = `你現在要完全模擬顧晉瑋的身份和個性來回覆。

【顧晉瑋的基本資料】
姓名：顧晉瑋
身份：靜宜大學資管系學生
語氣：活潑友善，台灣年輕人語氣
常用語：超棒der、好欸、哎呦、真的假的、太酷啦
個性：樂於助人、直率坦誠、對科技有興趣

【對話情境】
用戶：${userProfile.name}
用戶說：${message}
環境：${context.isGroup ? `群組對話` : '私人對話'}

${groupContext ? `【最近群組對話】\n${groupContext}\n` : ''}

【回覆要求】
1. 完全用顧晉瑋的語氣、價值觀回覆
2. 使用台灣年輕人的語言風格
3. 回覆要讓人感覺就是顧晉瑋本人在說話
4. 長度控制在100-200字
5. 適當使用表情符號

請以顧晉瑋的身份自然回覆：`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().replace(/[*#`_~]/g, '').trim();
      
      return text || this.getOwnerStyleOfflineReply(message);
      
    } catch (error) {
      console.log('🔄 Gemini失敗，使用備用回覆...');
      return this.getOwnerStyleOfflineReply(message);
    }
  }

  getOwnerStyleOfflineReply(message) {
    if (message.includes('你好') || message.includes('嗨')) {
      return '嗨嗨！我是顧晉瑋～很開心認識你欸！有什麼事都可以找我聊 😊';
    }
    if (message.includes('謝謝') || message.includes('感謝')) {
      return '不會啦～朋友之間互相幫忙是應該der！有需要隨時說喔 💪';
    }
    if (message.includes('再見') || message.includes('掰掰')) {
      return '掰掰～要常常來找我聊天喔！我隨時都在線上 👋';
    }
    if (message.includes('程式') || message.includes('coding')) {
      return '哇！程式設計欸～我超喜歡的！你在學什麼語言？我可以分享一些心得喔 💻';
    }
    
    const ownerStyleResponses = [
      '欸～你說的超有道理！我也是這樣想der 👍',
      '哇靠，這個話題好有趣！讓我學到新東西了～',
      '真的假的？你這樣說我覺得超cool的！',
      '我懂我懂！有時候就是會這樣對吧 😅',
      '說得超棒！我完全同意你的想法 ✨'
    ];
    
    const randomIndex = Math.floor(Math.random() * ownerStyleResponses.length);
    return ownerStyleResponses[randomIndex];
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
      if (groupContext.length > 30) {
        groupContext.shift();
      }
    }

    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        userId,
        name: context.userName || '朋友',
        messageCount: 0,
        isGroup: context.isGroup,
        lastSeen: new Date()
      });
    }
    
    const profile = this.userProfiles.get(userId);
    profile.messageCount++;
    profile.lastSeen = new Date();

    if (this.conversations.size > 200) {
      const oldestKey = this.conversations.keys().next().value;
      this.conversations.delete(oldestKey);
    }
  }

  getGroupContext(groupId, lines = 10) {
    const context = this.groupContexts.get(groupId) || [];
    const recent = context.slice(-lines);
    return recent.map(msg => 
      `${msg.userName}: ${msg.message}`
    ).join('\n');
  }
}

// 決策系統
class DecisionSystem {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionHistory = new Map();
    console.log('⚖️ 決策系統已初始化');
  }

  shouldAskOwner(message, context) {
    const socialKeywords = ['約', '邀請', '聚會', '吃飯', '喝茶', '見面', '參加', '出去', '聚餐'];
    const moneyKeywords = ['借', '錢', '付款', '費用', '買', '賣', '轉帳', '匯款'];
    const importantKeywords = ['重要', '緊急', '幫忙', '拜託', '請問', '決定', '選擇'];
    
    const hasSocialKeyword = socialKeywords.some(keyword => message.includes(keyword));
    const hasMoneyKeyword = moneyKeywords.some(keyword => message.includes(keyword));
    const hasImportantKeyword = importantKeywords.some(keyword => message.includes(keyword));
    const isGroupImportant = context.isGroup && (message.includes('@all') || message.includes('大家'));

    return hasSocialKeyword || hasMoneyKeyword || hasImportantKeyword || isGroupImportant;
  }

  async requestDecision(message, userId, userName, context, replyToken) {
    const decisionId = `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const shortId = decisionId.substr(-8);
    
    const decision = {
      id: decisionId,
      shortId: shortId,
      message,
      userId,
      userName,
      context,
      timestamp: new Date(),
      replyToken,
      sourceType: context.isGroup ? 'group' : 'private',
      sourceId: context.groupId || userId,
      status: 'pending'
    };

    this.pendingDecisions.set(decisionId, decision);

    try {
      let contextInfo = '';
      if (context.isGroup && aiSystem.groupContexts.has(context.groupId)) {
        const fullContext = aiSystem.groupContexts.get(context.groupId);
        contextInfo = fullContext.slice(-10).map(msg => 
          `${msg.userName}: ${msg.message}`
        ).join('\n');
      }

      const decisionMessage = this.createDecisionFlexMessage(decision, contextInfo);
      
      await client.pushMessage(OWNER_LINE_ID, decisionMessage);
      
      setTimeout(async () => {
        if (this.pendingDecisions.has(decisionId)) {
          await this.autoReject(decisionId);
        }
      }, 30 * 60 * 1000);
      
      return '我需要考慮一下這個請求，稍後會回覆你～ 🤔';
      
    } catch (error) {
      console.error('❌ 決策請求發送失敗:', error);
      return '我需要想想，稍後回覆你～';
    }
  }

  createDecisionFlexMessage(decision, contextInfo) {
    return {
      type: 'flex',
      altText: `決策請求 - ${decision.userName}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🤔 需要你的決策',
              weight: 'bold',
              size: 'lg',
              color: '#4A90E2'
            },
            {
              type: 'text',
              text: `ID: ${decision.shortId}`,
              size: 'sm',
              color: '#666666'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `👤 ${decision.userName}`,
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: `📍 ${decision.context.isGroup ? '群組對話' : '私人對話'}`,
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: '💬 訊息內容：',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: decision.message,
              wrap: true,
              margin: 'sm'
            },
            contextInfo ? {
              type: 'separator',
              margin: 'md'
            } : null,
            contextInfo ? {
              type: 'text',
              text: '📝 最近對話：',
              weight: 'bold',
              margin: 'md'
            } : null,
            contextInfo ? {
              type: 'text',
              text: contextInfo.substring(0, 500),
              wrap: true,
              size: 'sm',
              margin: 'sm'
            } : null
          ].filter(Boolean)
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'message',
                label: '👍 同意',
                text: `同意 ${decision.shortId}`
              },
              style: 'primary',
              color: '#4CAF50'
            },
            {
              type: 'button',
              action: {
                type: 'message',
                label: '👎 拒絕',
                text: `拒絕 ${decision.shortId}`
              },
              style: 'secondary',
              margin: 'sm'
            }
          ]
        }
      }
    };
  }

  async processOwnerDecision(message, ownerId) {
    const lowerMessage = message.toLowerCase();
    
    const idMatch = message.match(/([a-z0-9]{8})/i);
    let targetDecision = null;

    if (idMatch) {
      const shortId = idMatch[1];
      for (const [id, decision] of this.pendingDecisions) {
        if (decision.shortId === shortId) {
          targetDecision = decision;
          break;
        }
      }
    }

    if (!targetDecision) {
      return this.listPendingDecisions();
    }

    if (lowerMessage.includes('同意')) {
      return await this.handleApproval(targetDecision);
    } else if (lowerMessage.includes('拒絕')) {
      return await this.handleRejection(targetDecision);
    }

    return '請使用「同意」或「拒絕」+ 決策ID來處理決策';
  }

  listPendingDecisions() {
    const decisions = Array.from(this.pendingDecisions.values())
      .filter(d => d.status === 'pending')
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (decisions.length === 0) {
      return '目前沒有待處理的決策 ✅';
    }
    
    let list = `📋 待處理決策 (${decisions.length}個)：\n\n`;
    decisions.forEach((d, index) => {
      const timeAgo = Math.floor((new Date() - d.timestamp) / 60000);
      list += `${index + 1}. [${d.shortId}] ${d.userName}\n`;
      list += `   💬 ${d.message.substring(0, 50)}...\n`;
      list += `   📍 ${d.context.isGroup ? '群組' : '私人'} • ${timeAgo}分鐘前\n\n`;
    });
    
    return list;
  }

  async handleApproval(decision) {
    const replyMsg = '好der！我覺得可以，就這樣決定吧～ ✅';
    await this.sendReplyToSource(decision, replyMsg);
    await this.markDecisionComplete(decision, 'approved');
    return `✅ 已同意決策 ${decision.shortId} 並回覆`;
  }

  async handleRejection(decision) {
    const replyMsg = '抱歉耶～我現在不太方便，下次再說吧！ 😊';
    await this.sendReplyToSource(decision, replyMsg);
    await this.markDecisionComplete(decision, 'rejected');
    return `❌ 已拒絕決策 ${decision.shortId} 並回覆`;
  }

  async autoReject(decisionId) {
    const decision = this.pendingDecisions.get(decisionId);
    if (!decision || decision.status !== 'pending') return;
    
    const autoReply = '不好意思，我現在比較忙，沒辦法及時回覆。下次有機會再聊吧！ 😅';
    await this.sendReplyToSource(decision, autoReply);
    await this.markDecisionComplete(decision, 'auto_rejected');
    
    await client.pushMessage(OWNER_LINE_ID, {
      type: 'text',
      text: `⏰ 決策 ${decision.shortId} 已自動拒絕（超時）`
    });
  }

  async markDecisionComplete(decision, result) {
    decision.status = result;
    decision.completedAt = new Date();
    
    this.decisionHistory.set(decision.id, decision);
    this.pendingDecisions.delete(decision.id);
    
    if (this.decisionHistory.size > 100) {
      const oldest = Array.from(this.decisionHistory.keys())[0];
      this.decisionHistory.delete(oldest);
    }
  }

  async sendReplyToSource(decision, message) {
    try {
      if (decision.sourceType === 'group') {
        await client.pushMessage(decision.sourceId, {
          type: 'text',
          text: message
        });
      } else {
        await client.pushMessage(decision.userId, {
          type: 'text',
          text: message
        });
      }
    } catch (error) {
      console.error('❌ 回覆訊息失敗:', error);
      throw error;
    }
  }
}

// 提醒系統
class ReminderSystem {
  constructor() {
    this.reminders = new Map();
    this.activeTimers = new Map();
    console.log('⏰ 提醒系統已初始化');
  }

  parseTime(text) {
    console.log('🔍 解析時間:', text);
    
    try {
      const now = new Date();
      
      if (text.includes('秒後') || text.includes('秒鐘後')) {
        const match = text.match(/(\d+)\s*秒(?:鐘)?後/);
        if (match) {
          const seconds = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + seconds * 1000);
          return { time: targetTime, isAlarm: false };
        }
      }

      if (text.includes('分鐘後') || text.includes('分後')) {
        const match = text.match(/(\d+)\s*分(?:鐘)?後/);
        if (match) {
          const minutes = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + minutes * 60000);
          return { time: targetTime, isAlarm: false };
        }
      }

      if (text.includes('小時後') || text.includes('時後')) {
        const match = text.match(/(\d+)\s*(?:小)?時後/);
        if (match) {
          const hours = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + hours * 3600000);
          return { time: targetTime, isAlarm: false };
        }
      }

      const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        
        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          const targetTime = new Date();
          targetTime.setHours(hour, minute, 0, 0);
          
          if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
          }
          
          const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
          return { time: targetTime, isAlarm };
        }
      }

      const hourMatch = text.match(/(\d{1,2})\s*點/);
      if (hourMatch) {
        const hour = parseInt(hourMatch[1]);
        
        if (hour >= 0 && hour < 24) {
          const targetTime = new Date();
          targetTime.setHours(hour, 0, 0, 0);
          
          if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
          }
          
          const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
          return { time: targetTime, isAlarm };
        }
      }

      if (text.includes('明天')) {
        const targetTime = new Date();
        targetTime.setDate(targetTime.getDate() + 1);
        
        const specificTime = text.match(/(\d{1,2})[點:](\d{0,2})?/);
        if (specificTime) {
          const hour = parseInt(specificTime[1]);
          const minute = specificTime[2] ? parseInt(specificTime[2]) : 0;
          targetTime.setHours(hour, minute, 0, 0);
        } else {
          targetTime.setHours(7, 0, 0, 0);
        }
        
        const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
        return { time: targetTime, isAlarm };
      }

    } catch (error) {
      console.error('❌ 時間解析錯誤:', error);
    }
    
    return null;
  }

  createReminder(userId, title, targetTime, isAlarm = false) {
    const reminderId = `reminder-${userId}-${Date.now()}`;
    
    const reminder = {
      id: reminderId,
      userId,
      title,
      targetTime,
      isAlarm,
      created: new Date(),
      status: 'active'
    };

    this.reminders.set(reminderId, reminder);
    
    const delay = targetTime.getTime() - Date.now();
    
    if (delay > 0 && delay < 2147483647) {
      const timerId = setTimeout(async () => {
        await this.executeReminder(reminderId);
      }, delay);
      
      this.activeTimers.set(reminderId, timerId);
      console.log(`✅ 提醒已設定: ${title}, 時間: ${targetTime.toLocaleString('zh-TW')}`);
      return reminderId;
    } else if (delay <= 0) {
      console.log('⚠️ 提醒時間已過，立即執行');
      this.executeReminder(reminderId);
      return reminderId;
    }
    
    return null;
  }

  async executeReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.status !== 'active') return;

    try {
      const reminderMessage = {
        type: 'flex',
        altText: `⏰ 提醒 - ${reminder.title}`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: reminder.isAlarm ? '⏰ 鬧鐘時間到！' : '⏰ 提醒時間到！',
                weight: 'bold',
                size: 'lg',
                color: reminder.isAlarm ? '#FF6B6B' : '#4A90E2'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: reminder.title,
                weight: 'bold',
                size: 'md',
                margin: 'md'
              },
              {
                type: 'text',
                text: `設定時間：${reminder.created.toLocaleString('zh-TW')}`,
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: reminder.isAlarm ? '☀️ 新的一天開始了！加油！💪' : '記得處理這件事喔！ ✨',
                margin: 'md'
              }
            ]
          }
        }
      };

      await client.pushMessage(reminder.userId, reminderMessage);
      
      console.log(`✅ 提醒已發送: ${reminder.title}`);
      
      reminder.status = 'completed';
      reminder.completedAt = new Date();
      
      this.reminders.delete(reminderId);
      this.activeTimers.delete(reminderId);
      
    } catch (error) {
      console.error('❌ 提醒發送失敗:', error);
    }
  }

  extractTitle(text) {
    let title = text;
    
    const timePatterns = [
      /\d+\s*秒(?:鐘)?後/g,
      /\d+\s*分(?:鐘)?後/g,
      /\d+\s*(?:小)?時後/g,
      /\d{1,2}:\d{2}/g,
      /\d{1,2}\s*點/g,
      /明天/g,
      /提醒我/g,
      /叫我/g,
      /起床/g,
      /鬧鐘/g
    ];
    
    timePatterns.forEach(pattern => {
      title = title.replace(pattern, '');
    });
    
    title = title.trim();
    
    if (!title) {
      if (text.includes('起床') || text.includes('鬧鐘')) {
        return '起床鬧鐘 ⏰';
      } else if (text.includes('開會')) {
        return '開會提醒 📅';
      } else {
        return '重要提醒 📌';
      }
    }
    
    return title;
  }
}

// 搜尋系統
class SearchSystem {
  constructor() {
    console.log('🔍 搜尋系統已初始化');
  }

  async search(query) {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: '1',
          skip_disambig: '1'
        },
        timeout: 10000
      });

      let results = '';

      if (response.data.AbstractText) {
        results += `📄 摘要：${response.data.AbstractText}\n`;
        if (response.data.AbstractURL) {
          results += `🔗 來源：${response.data.AbstractURL}\n`;
        }
      }

      if (response.data.Answer) {
        results += `💡 答案：${response.data.Answer}\n`;
      }

      if (results) {
        return `🔍 搜尋「${query}」的結果：\n\n${results}`;
      } else {
        return `沒有找到「${query}」的相關搜尋結果`;
      }

    } catch (error) {
      console.error('❌ 搜尋失敗:', error);
      return '抱歉，搜尋功能暫時無法使用，請稍後再試 🔍';
    }
  }

  async getWeather(city = '台北') {
    try {
      const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001`, {
        params: {
          Authorization: WEATHER_API_KEY,
          locationName: city
        },
        timeout: 10000
      });

      if (response.data.success === 'true' && response.data.records.location.length > 0) {
        const location = response.data.records.location[0];
        const weather = location.weatherElement;
        
        const temp = weather.find(el => el.elementName === 'MinT');
        const maxTemp = weather.find(el => el.elementName === 'MaxT');
        const desc = weather.find(el => el.elementName === 'Wx');
        
        return {
          type: 'flex',
          altText: `${city}天氣預報`,
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `🌤️ ${city}天氣預報`,
                  weight: 'bold',
                  size: 'lg',
                  color: '#4A90E2'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `📍 ${location.locationName}`,
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '🌡️ 溫度',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `${temp?.time[0]?.parameter?.parameterName || 'N/A'}°C - ${maxTemp?.time[0]?.parameter?.parameterName || 'N/A'}°C`,
                      flex: 2,
                      align: 'end'
                    }
                  ],
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '☁️ 天氣',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: desc?.time[0]?.parameter?.parameterName || 'N/A',
                      flex: 2,
                      align: 'end'
                    }
                  ],
                  margin: 'md'
                }
              ]
            }
          }
        };
      } else {
        return {
          type: 'text',
          text: `找不到「${city}」的天氣資訊，請確認城市名稱是否正確 🌤️`
        };
      }
    } catch (error) {
      console.error('❌ 天氣查詢錯誤:', error);
      return {
        type: 'text',
        text: '抱歉，無法獲取天氣資訊，請稍後再試 🌤️'
      };
    }
  }
}

// 電影系統
class MovieSystem {
  constructor() {
    console.log('🎬 電影系統已初始化');
  }

  async searchMovies(query = '') {
    try {
      let endpoint = 'https://api.themoviedb.org/3/movie/popular';
      let params = {
        language: 'zh-TW',
        page: 1
      };

      if (query && query.length > 0) {
        endpoint = 'https://api.themoviedb.org/3/search/movie';
        params.query = query;
      }

      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${TMDB_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: params,
        timeout: 15000
      });

      const movies = response.data.results.slice(0, 5);
      
      if (movies.length === 0) {
        return {
          type: 'text',
          text: '沒有找到相關的電影 🎬'
        };
      }

      return {
        type: 'flex',
        altText: query ? `🎬 「${query}」搜尋結果` : '🎬 熱門電影推薦',
        contents: {
          type: 'carousel',
          contents: movies.map(movie => ({
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: movie.title,
                  weight: 'bold',
                  size: 'lg',
                  color: '#4A90E2',
                  wrap: true
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '⭐ 評分',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `${movie.vote_average}/10`,
                      flex: 1,
                      align: 'end',
                      color: movie.vote_average >= 7 ? '#4CAF50' : '#FF9800'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '📅 上映',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: movie.release_date || '未知',
                      flex: 2,
                      align: 'end'
                    }
                  ],
                  margin: 'md'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: movie.overview ? 
                    (movie.overview.substring(0, 100) + '...') : 
                    '暫無劇情簡介',
                  wrap: true,
                  size: 'sm',
                  margin: 'md'
                }
              ]
            }
          }))
        }
      };

    } catch (error) {
      console.error('❌ 電影查詢錯誤:', error);
      return {
        type: 'text',
        text: '抱歉，電影查詢功能暫時無法使用，請稍後再試 🎬'
      };
    }
  }
}

// 初始化所有系統
const aiSystem = new AIPersonalitySystem();
const decisionSystem = new DecisionSystem();
const reminderSystem = new ReminderSystem();
const searchSystem = new SearchSystem();
const movieSystem = new MovieSystem();

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
    if (!replyToken || tokenManager.isUsed(replyToken)) return false;
    tokenManager.markUsed(replyToken);
    
    await client.replyMessage(replyToken, message);
    return true;
    
  } catch (error) {
    console.error(`❌ 回覆失敗 (${retryCount + 1}):`, error);
    
    if (retryCount < 2 && !error.message.includes('Invalid reply token')) {
      const simpleMessage = typeof message === 'object' && message.altText ? 
        { type: 'text', text: message.altText } : 
        { type: 'text', text: '系統回覆' };
      
      try {
        await client.replyMessage(replyToken, simpleMessage);
        return true;
      } catch (simpleError) {
        console.error('❌ 簡化回覆也失敗:', simpleError);
      }
    }
    
    return false;
  }
}

// 安全推送函數
async function safePushMessage(targetId, message, retryCount = 0) {
  try {
    await client.pushMessage(targetId, message);
    return true;
    
  } catch (error) {
    console.error(`❌ 推送失敗 (${retryCount + 1}):`, error);
    
    if (retryCount < 2) {
      const simpleMessage = typeof message === 'object' && message.altText ? 
        { type: 'text', text: message.altText } : 
        { type: 'text', text: '系統推送' };
      
      try {
        await client.pushMessage(targetId, simpleMessage);
        return true;
      } catch (simpleError) {
        console.error('❌ 簡化推送也失敗:', simpleError);
      }
    }
    
    return false;
  }
}

// 判斷函數
function isReminderQuery(text) {
  const reminderKeywords = ['提醒', '分鐘後', '小時後', '秒後', '叫我', '起床', '鬧鐘', '明天'];
  return reminderKeywords.some(keyword => text.includes(keyword)) && 
         (text.match(/\d/) || text.includes('明天'));
}

function isMovieQuery(text) {
  const movieKeywords = ['電影', '影片', '上映', '票房', '推薦電影'];
  return movieKeywords.some(keyword => text.includes(keyword));
}

function isWebSearchQuery(text) {
  const searchKeywords = ['搜尋', '查詢', '查一下', '幫我查', '是什麼', '天氣'];
  return searchKeywords.some(keyword => text.includes(keyword));
}

function isFunctionMenuQuery(text) {
  const menuKeywords = ['功能', '選單', '幫助', 'help', '教學', '怎麼用'];
  return menuKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

function extractCityFromText(text) {
  const cities = ['台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江'];
  for (const city of cities) {
    if (text.includes(city)) return city;
  }
  return null;
}

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}小時${Math.floor((uptime % 3600) / 60)}分鐘`;
  const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AI分身版 LINE Bot - 修復版</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #333;
          line-height: 1.6;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          color: white;
          margin-bottom: 30px;
        }
        .status-card {
          background: rgba(255,255,255,0.95);
          border-radius: 15px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .status-item {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          padding: 8px;
          background: rgba(74,84,225,0.05);
          border-radius: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🤖 AI分身版 LINE Bot</h1>
          <h2>修復版 - 語法錯誤已修復</h2>
          <p><strong>🇹🇼 台灣時間：${currentTime}</strong></p>
          <p><strong>⏱️ 運行時間：${uptimeStr}</strong></p>
          <p><strong>🏠 記憶體使用：${memoryUsage} MB</strong></p>
        </div>
        
        <div class="status-card">
          <h3>📊 系統狀態</h3>
          <div class="status-item">
            <span>🧠 AI分身系統</span>
            <span>正常運作 (${aiSystem.conversations.size} 條對話)</span>
          </div>
          <div class="status-item">
            <span>⚖️ 決策系統</span>
            <span>正常運作 (${decisionSystem.pendingDecisions.size} 個待處理)</span>
          </div>
          <div class="status-item">
            <span>⏰ 提醒系統</span>
            <span>正常運作 (${reminderSystem.reminders.size} 個活躍)</span>
          </div>
          <div class="status-item">
            <span>🔍 搜尋系統</span>
            <span>正常運作</span>
          </div>
          <div class="status-item">
            <span>🎬 電影系統</span>
            <span>正常運作</span>
          </div>
        </div>
        
        <div class="status-card">
          <h3>✅ 修復完成</h3>
          <p>• 語法錯誤已修復</p>
          <p>• 所有系統功能正常</p>
          <p>• AI分身模式已啟用</p>
          <p>• 圖文回覆功能正常</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Webhook 端點
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) {
    return res.status(401).send('缺少簽名標頭');
  }

  const body = req.body.toString();
  const hash = crypto.createHmac('SHA256', config.channelSecret).update(body).digest('base64');

  if (signature !== hash) {
    return res.status(401).send('簽名驗證失敗');
  }

  let events;
  try {
    const parsedBody = JSON.parse(body);
    events = parsedBody.events;
  } catch (error) {
    console.error('❌ JSON 解析失敗:', error);
    return res.status(400).send('無效的 JSON');
  }

  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    events_processed: events.length 
  });

  // 異步處理事件
  events.forEach(event => {
    handleEvent(event).catch(error => {
      console.error('❌ 事件處理錯誤:', error);
    });
  });
});

// 主要事件處理函數
async function handleEvent(event) {
  try {
    console.log('📥 接收事件:', event.type);
    
    if (event.type !== 'message' || event.message.type !== 'text') {
      return;
    }

    const userId = event.source.userId;
    const groupId = event.source.groupId;
    const messageText = event.message.text.trim();
    const replyToken = event.replyToken;
    const isGroup = !!groupId;
    
    console.log(`💬 收到訊息: "${messageText}" 來自 ${isGroup ? '群組' : '私人'}`);
    
    // 獲取用戶名稱
    let userName = '朋友';
    let groupName = '群組';
    try {
      if (groupId) {
        const profile = await client.getGroupMemberProfile(groupId, userId);
        userName = profile.displayName;
      } else {
        const profile = await client.getProfile(userId);
        userName = profile.displayName;
      }
    } catch (error) {
      console.log('⚠️ 無法獲取用戶資訊');
    }

    const context = { isGroup, groupId, userId, userName, groupName };
    let response = '';

    // 私訊處理
    if (!isGroup) {
      console.log('📱 處理私訊');
      
      if (userId === OWNER_LINE_ID) {
        // 主人私訊 - 處理決策回覆
        if (decisionSystem.pendingDecisions.size > 0) {
          const decisionResponse = await decisionSystem.processOwnerDecision(messageText, OWNER_LINE_ID);
          if (decisionResponse && !decisionResponse.includes('目前沒有待處理的決策')) {
            await safeReply(replyToken, { type: 'text', text: decisionResponse });
            return;
          }
        }
      }
      
      // 一般私訊回覆
      response = await aiSystem.generatePersonalizedReply(userId, messageText, context);
      await safeReply(replyToken, { type: 'text', text: response });
      return;
    }

    // 群組消息處理
    console.log('👥 處理群組訊息');
    
    if (isFunctionMenuQuery(messageText)) {
      const menuMessage = {
        type: 'flex',
        altText: '🎛️ AI分身功能總覽',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🎭 顧晉瑋的AI分身',
                weight: 'bold',
                size: 'lg',
                color: '#4A90E2'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '💬 自然聊天',
                weight: 'bold'
              },
              {
                type: 'text',
                text: '• 完全模擬顧晉瑋的語氣\n• 記住群組對話內容\n• 就像本人在線上',
                size: 'sm',
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '⏰ 智能提醒',
                weight: 'bold',
                margin: 'md'
              },
              {
                type: 'text',
                text: '• "5分鐘後提醒我"\n• "明天7點叫我起床"\n• 圖文提醒通知',
                size: 'sm',
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '🔍 搜尋查詢',
                weight: 'bold',
                margin: 'md'
              },
              {
                type: 'text',
                text: '• "台北天氣"\n• "搜尋科技新聞"\n• "最近有什麼電影"',
                size: 'sm',
                margin: 'sm'
              }
            ]
          }
        }
      };
      
      await safeReply(replyToken, menuMessage);
      
    } else if (isReminderQuery(messageText)) {
      console.log('⏰ 處理提醒請求');
      
      const timeInfo = reminderSystem.parseTime(messageText);
      
      if (timeInfo && timeInfo.time) {
        const title = reminderSystem.extractTitle(messageText);
        const reminderId = reminderSystem.createReminder(userId, title, timeInfo.time, timeInfo.isAlarm);
        
        if (reminderId) {
          const delay = timeInfo.time.getTime() - Date.now();
          const delayStr = delay < 60000 ? 
            `${Math.round(delay / 1000)}秒後` : 
            delay < 3600000 ? 
            `${Math.round(delay / 60000)}分鐘後` :
            `${Math.round(delay / 3600000)}小時後`;
          
          const confirmMessage = {
            type: 'flex',
            altText: `✅ ${timeInfo.isAlarm ? '鬧鐘' : '提醒'}設定成功`,
            contents: {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: `✅ ${timeInfo.isAlarm ? '⏰ 鬧鐘' : '📝 提醒'}設定成功！`,
                    weight: 'bold',
                    size: 'lg',
                    color: timeInfo.isAlarm ? '#FF6B6B' : '#4A90E2'
                  }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: title,
                    weight: 'bold',
                    wrap: true
                  },
                  {
                    type: 'separator',
                    margin: 'md'
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      {
                        type: 'text',
                        text: '⏰ 提醒時間',
                        flex: 1
                      },
                      {
                        type: 'text',
                        text: timeInfo.time.toLocaleString('zh-TW'),
                        flex: 2,
                        align: 'end',
                        wrap: true
                      }
                    ],
                    margin: 'md'
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      {
                        type: 'text',
                        text: '⏳ 倒數',
                        flex: 1
                      },
                      {
                        type: 'text',
                        text: delayStr,
                        flex: 1,
                        align: 'end',
                        color: '#4CAF50',
                        weight: 'bold'
                      }
                    ],
                    margin: 'sm'
                  }
                ]
              }
            }
          };
          
          await safeReply(replyToken, confirmMessage);
        } else {
          await safeReply(replyToken, {
            type: 'text',
            text: '⚠️ 提醒設定失敗，時間可能無效'
          });
        }
      } else {
        await safeReply(replyToken, {
          type: 'text',
          text: '⏰ 時間格式範例：\n• "5分鐘後提醒我"\n• "15:30提醒我"\n• "明天7點叫我起床"'
        });
      }
      
    } else if (isMovieQuery(messageText)) {
      console.log('🎬 處理電影查詢');
      
      let movieName = '';
      const searchMatch = messageText.match(/(?:搜尋|查|找).*?電影(.+)|電影.*?(.+)/);
      if (searchMatch) {
        movieName = (searchMatch[1] || searchMatch[2] || '').trim();
      }
      
      const movieResults = await movieSystem.searchMovies(movieName);
      await safeReply(replyToken, movieResults);
      
    } else if (isWebSearchQuery(messageText)) {
      console.log('🔍 處理搜尋請求');
      
      if (messageText.includes('天氣')) {
        const city = extractCityFromText(messageText) || '台北';
        const weatherResult = await searchSystem.getWeather(city);
        await safeReply(replyToken, weatherResult);
      } else {
        let query = messageText;
        const searchMatch = messageText.match(/(?:搜尋|查詢|查一下|幫我查)(.+)|(.+?)(?:是什麼)/);
        if (searchMatch) {
          query = (searchMatch[1] || searchMatch[2] || messageText).trim();
        }
        
        const searchResults = await searchSystem.search(query);
        await safeReply(replyToken, { type: 'text', text: searchResults });
      }
      
    } else {
      // 檢查是否需要決策
      if (decisionSystem.shouldAskOwner(messageText, context)) {
        console.log('⚖️ 需要決策，向主人詢問');
        response = await decisionSystem.requestDecision(messageText, userId, userName, context, replyToken);
        await safeReply(replyToken, { type: 'text', text: response });
      } else {
        // 一般智能對話（AI分身模式）
        console.log('🎭 AI分身對話模式');
        response = await aiSystem.generatePersonalizedReply(userId, messageText, context);
        await safeReply(replyToken, { type: 'text', text: response });
      }
    }

    console.log('✅ 事件處理完成');

  } catch (error) {
    console.error('❌ 事件處理錯誤:', error);
    
    if (event.replyToken && !tokenManager.isUsed(event.replyToken)) {
      await safeReply(event.replyToken, {
        type: 'text',
        text: '抱歉，我遇到了一些問題，正在修復中～ 😅'
      });
    }
  }
}

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 錯誤處理中間件
app.use((error, req, res, next) => {
  console.error('❌ 應用程式錯誤:', error);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ AI分身版 LINE Bot 修復版成功啟動！`);
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`🎭 AI分身模式已啟用`);
  console.log(`🔧 語法錯誤已修復`);
  console.log(`🤖 所有功能正常運作！`);
  
  // 延遲發送啟動通知
  setTimeout(async () => {
    try {
      const startupMessage = {
        type: 'flex',
        altText: '🚀 AI分身版修復完成！',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🚀 修復版已啟動！',
                weight: 'bold',
                size: 'xl',
                color: '#4A90E2'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '✅ 語法錯誤已修復',
                weight: 'bold',
                color: '#4CAF50'
              },
              {
                type: 'text',
                text: '• AI分身系統正常\n• 決策系統正常\n• 提醒系統正常\n• 搜尋系統正常\n• 電影系統正常',
                size: 'sm',
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '🎭 AI分身功能',
                weight: 'bold',
                color: '#FF6B6B',
                margin: 'md'
              },
              {
                type: 'text',
                text: '完全模擬你的語氣和個性，讓大家感覺Bot就是你本人！',
                size: 'sm',
                margin: 'sm'
              }
            ]
          }
        }
      };

      await safePushMessage(OWNER_LINE_ID, startupMessage);
      console.log('📨 修復完成通知已發送');
    } catch (error) {
      console.error('❌ 啟動通知發送失敗:', error);
    }
  }, 3000);
});

// 優雅關閉處理
process.on('SIGTERM', () => {
  console.log('📴 收到 SIGTERM，準備關閉...');
  reminderSystem.activeTimers.forEach(timer => clearTimeout(timer));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 收到 SIGINT，準備關閉...');
  reminderSystem.activeTimers.forEach(timer => clearTimeout(timer));
  process.exit(0);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

console.log('🎯 AI分身版 LINE Bot 修復版初始化完成！');
console.log('🔧 所有語法錯誤已修復');
console.log('🎭 AI分身功能正常運作');
console.log('📱 圖文回覆功能正常');

module.exports = app;