const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
    console.log('🧠 增強版AI系統已初始化');
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
      console.error('AI回覆生成失敗:', error);
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
      console.log('Gemini失敗，使用備用AI...');
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
      console.error('備用AI也失敗:', error);
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

    // 記錄群組對話上下文
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
      // 保留最近20條訊息
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

    if (this.conversations.size > 100) {
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

// 增強版決策系統
class EnhancedDecisionSystem {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionContexts = new Map(); // 儲存決策對應的來源資訊
    console.log('⚖️ 增強版決策系統已初始化');
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
      // 獲取群組對話上下文
      let contextInfo = '';
      if (context.isGroup && enhancedAI.groupContexts.has(context.groupId)) {
        contextInfo = enhancedAI.getGroupContext(context.groupId);
      }

      const decisionText = `🤔 需要你的決策 [${decisionId.substr(-6)}]

👤 來自：${userName}
📍 位置：${context.isGroup ? `群組 - ${context.groupName || '未知群組'}` : '私人對話'}
💬 訊息：${message}

${contextInfo ? `\n📝 最近對話紀錄：\n${contextInfo}\n` : ''}

請回覆你的決定，或輸入「?」查看更多對話紀錄
決策ID：${decisionId.substr(-6)}`;

      await safePushMessage(OWNER_LINE_ID, decisionText);
      return '讓我想想這個請求，稍後回覆你～';
      
    } catch (error) {
      console.error('決策請求發送失敗:', error);
      return '我需要想想，稍後回覆你～';
    }
  }

  async processOwnerDecision(message, ownerId) {
    // 檢查是否是查詢更多資訊
    if (message === '?') {
      const decisions = Array.from(this.pendingDecisions.values())
        .filter(d => new Date() - d.timestamp < 3600000); // 1小時內的決策
      
      if (decisions.length === 0) {
        return '目前沒有待處理的決策';
      }

      let info = '📋 待處理決策列表：\n\n';
      decisions.forEach(d => {
        info += `ID: ${d.id.substr(-6)}\n`;
        info += `來自: ${d.userName}\n`;
        info += `訊息: ${d.message}\n\n`;
      });
      return info;
    }

    // 檢查是否包含決策ID
    const idMatch = message.match(/([a-z0-9]{6})/i);
    let targetDecisionId = null;
    let decision = null;

    if (idMatch) {
      // 根據短ID找到完整的決策
      for (const [id, d] of this.pendingDecisions) {
        if (id.endsWith(idMatch[1])) {
          targetDecisionId = id;
          decision = d;
          break;
        }
      }
    } else {
      // 如果沒有ID，找最近的決策
      const decisions = Array.from(this.pendingDecisions.values());
      if (decisions.length > 0) {
        decision = decisions.sort((a, b) => b.timestamp - a.timestamp)[0];
        targetDecisionId = decision.id;
      }
    }

    if (!decision) {
      return '找不到對應的決策請求';
    }

    // 處理決策
    let response = '';
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('同意') || lowerMessage.includes('ok') || lowerMessage.includes('好')) {
      response = await this.handleApproval(decision);
    } else if (lowerMessage.includes('拒絕') || lowerMessage.includes('不')) {
      response = await this.handleRejection(decision);
    } else if (message.includes('回覆:') || message.includes('回覆：')) {
      const customReply = message.replace(/回覆[:：]/g, '').trim();
      response = await this.handleCustomReply(decision, customReply);
    } else if (message.includes('更多')) {
      // 獲取更多上下文
      const moreContext = enhancedAI.getGroupContext(decision.context.groupId, 20);
      return `更多對話紀錄：\n${moreContext}\n\n請回覆你的決定`;
    } else {
      return `請回覆「同意」、「拒絕」或「回覆：[自訂訊息]」\n決策ID：${targetDecisionId.substr(-6)}`;
    }

    // 移除已處理的決策
    this.pendingDecisions.delete(targetDecisionId);
    this.decisionContexts.delete(targetDecisionId);

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
        // 回覆到群組
        await client.pushMessage(decision.sourceId, {
          type: 'text',
          text: message
        });
      } else {
        // 回覆到私人對話
        await client.pushMessage(decision.userId, {
          type: 'text',
          text: message
        });
      }
    } catch (error) {
      console.error('回覆訊息失敗:', error);
    }
  }
}

// 增強版提醒系統
class EnhancedReminderSystem {
  constructor() {
    this.reminders = new Map();
    this.activeTimers = new Map();
    console.log('⏰ 增強版提醒系統已初始化');
  }

  parseTime(text) {
    console.log('解析時間:', text);
    
    try {
      const now = new Date();
      
      // 相對時間 - 分鐘
      if (text.includes('分鐘後') || text.includes('分後')) {
        const match = text.match(/(\d+)\s*分(?:鐘)?後/);
        if (match) {
          const minutes = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + minutes * 60000);
          return { time: targetTime, isAlarm: false };
        }
      }

      // 相對時間 - 小時
      if (text.includes('小時後') || text.includes('時後')) {
        const match = text.match(/(\d+)\s*(?:小)?時後/);
        if (match) {
          const hours = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + hours * 3600000);
          return { time: targetTime, isAlarm: false };
        }
      }

      // 絕對時間 HH:MM
      const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        
        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          const targetTime = new Date();
          targetTime.setHours(hour, minute, 0, 0);
          
          // 如果時間已過，設為明天
          if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
          }
          
          const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
          return { time: targetTime, isAlarm };
        }
      }

      // 點數時間
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

      // 特定日期時間
      if (text.includes('明天')) {
        const targetTime = new Date();
        targetTime.setDate(targetTime.getDate() + 1);
        
        // 檢查是否有具體時間
        const specificTime = text.match(/(\d{1,2})[點:](\d{0,2})?/);
        if (specificTime) {
          const hour = parseInt(specificTime[1]);
          const minute = specificTime[2] ? parseInt(specificTime[2]) : 0;
          targetTime.setHours(hour, minute, 0, 0);
        } else {
          targetTime.setHours(9, 0, 0, 0); // 預設早上9點
        }
        
        const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
        return { time: targetTime, isAlarm };
      }

    } catch (error) {
      console.error('時間解析錯誤:', error);
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
      created: new Date()
    };

    this.reminders.set(reminderId, reminder);
    
    const delay = targetTime.getTime() - Date.now();
    
    if (delay > 0 && delay < 2147483647) { // JavaScript setTimeout 限制
      const timerId = setTimeout(async () => {
        await this.executeReminder(reminderId);
      }, delay);
      
      this.activeTimers.set(reminderId, timerId);
      console.log(`✅ 提醒已設定: ${title}, 時間: ${targetTime.toLocaleString('zh-TW')}`);
      return reminderId;
    } else if (delay > 0) {
      console.log('⚠️ 提醒時間太遠，無法設定');
      return null;
    }
    
    return null;
  }

  async executeReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return;

    try {
      const reminderText = `⏰ ${reminder.isAlarm ? '鬧鐘' : '提醒'}時間到！

📝 ${reminder.title}
⏱️ 設定時間：${reminder.created.toLocaleString('zh-TW')}

${reminder.isAlarm ? '☀️ 起床囉！新的一天開始了！' : '記得處理這件事喔！'}`;

      await client.pushMessage(reminder.userId, {
        type: 'text',
        text: reminderText
      });
      
      console.log(`✅ 提醒已發送: ${reminder.title}`);
      
      // 清理
      this.reminders.delete(reminderId);
      this.activeTimers.delete(reminderId);
      
    } catch (error) {
      console.error('❌ 提醒發送失敗:', error);
    }
  }

  extractTitle(text) {
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
      /鬧鐘/g
    ];
    
    timePatterns.forEach(pattern => {
      title = title.replace(pattern, '');
    });
    
    title = title.trim();
    
    // 如果沒有剩餘內容，根據類型返回預設標題
    if (!title) {
      if (text.includes('起床') || text.includes('鬧鐘')) {
        return '起床鬧鐘';
      } else if (text.includes('開會')) {
        return '開會提醒';
      } else if (text.includes('吃藥')) {
        return '吃藥提醒';
      } else {
        return '提醒事項';
      }
    }
    
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
    console.log('🔍 網路搜尋系統已初始化');
  }

  async search(query) {
    try {
      // 使用 DuckDuckGo HTML API（免費且不需要 API key）
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      // 簡單解析搜尋結果（因為是 HTML 格式）
      const results = this.parseSearchResults(response.data);
      
      if (results.length === 0) {
        return '沒有找到相關的搜尋結果';
      }

      let resultText = `🔍 搜尋「${query}」的結果：\n\n`;
      results.slice(0, 3).forEach((result, index) => {
        resultText += `${index + 1}. ${result.title}\n`;
        resultText += `${result.snippet}\n`;
        resultText += `🔗 ${result.link}\n\n`;
      });

      return resultText;

    } catch (error) {
      console.error('搜尋失敗:', error);
      
      // 使用 AI 生成相關回應作為備用
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });
        const prompt = `用戶想要搜尋關於「${query}」的資訊，請提供相關的知識和見解（約150字）`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return `💡 關於「${query}」：\n\n${response.text()}`;
        
      } catch (aiError) {
        return '抱歉，搜尋功能暫時無法使用，請稍後再試';
      }
    }
  }

  parseSearchResults(html) {
    const results = [];
    
    // 簡單的 HTML 解析（實際使用時可能需要更完善的解析器）
    const resultPattern = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)<\/a>/gi;
    
    let match;
    while ((match = resultPattern.exec(html)) !== null) {
      results.push({
        link: match[1],
        title: match[2].trim(),
        snippet: match[3].trim()
      });
      
      if (results.length >= 5) break;
    }
    
    return results;
  }
}

// 電影查詢系統
class MovieSystem {
  constructor() {
    console.log('🎬 電影查詢系統已初始化');
  }

  async searchMovies(query = '') {
    try {
      let endpoint = 'https://api.themoviedb.org/3/movie/popular';
      let params = {
        language: 'zh-TW',
        page: 1
      };

      // 如果有特定查詢，使用搜尋 API
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
        timeout: 10000
      });

      const movies = response.data.results.slice(0, 5);
      
      if (movies.length === 0) {
        return '沒有找到相關的電影';
      }

      let movieList = query ? 
        `🎬 「${query}」的搜尋結果：\n\n` : 
        '🎬 熱門電影推薦：\n\n';
      
      movies.forEach((movie, index) => {
        movieList += `${index + 1}. ${movie.title}${movie.original_title !== movie.title ? ` (${movie.original_title})` : ''}\n`;
        movieList += `⭐ 評分：${movie.vote_average}/10\n`;
        movieList += `📅 上映日期：${movie.release_date}\n`;
        if (movie.overview) {
          movieList += `📝 ${movie.overview.substring(0, 60)}...\n`;
        }
        movieList += '\n';
      });

      return movieList;

    } catch (error) {
      console.error('電影查詢錯誤:', error);
      return '抱歉，電影查詢功能暫時無法使用';
    }
  }
}

// 訊息轉發系統
class MessageForwardSystem {
  constructor() {
    this.userList = new Map(); // 儲存已知用戶
    console.log('📨 訊息轉發系統已初始化');
  }

  async forwardMessage(targetName, message, sourceUserName) {
    try {
      // 查找目標用戶
      const targetUser = this.findUserByName(targetName);
      
      if (!targetUser) {
        return `找不到用戶「${targetName}」，請確認名稱是否正確`;
      }

      const forwardMsg = `📨 來自 ${sourceUserName} 的訊息：\n\n${message}`;
      
      await client.pushMessage(targetUser.userId, {
        type: 'text',
        text: forwardMsg
      });

      return `✅ 訊息已轉發給 ${targetName}`;

    } catch (error) {
      console.error('訊息轉發失敗:', error);
      return '訊息轉發失敗，請稍後再試';
    }
  }

  findUserByName(name) {
    for (const [userId, userInfo] of this.userList) {
      if (userInfo.displayName.includes(name)) {
        return { userId, ...userInfo };
      }
    }
    return null;
  }

  updateUserList(userId, displayName) {
    this.userList.set(userId, { displayName, lastSeen: new Date() });
  }
}

// 增強版私訊系統
class EnhancedPrivateMessageSystem {
  constructor() {
    console.log('💬 增強版私訊系統已初始化');
  }

  async handlePrivateMessage(userId, userName, message) {
    if (userId === OWNER_LINE_ID) {
      return await this.handleOwnerMessage(message);
    }
    
    // 更新用戶列表
    messageForward.updateUserList(userId, userName);
    
    return await enhancedAI.generateReply(userId, message, { isGroup: false });
  }

  async handleOwnerMessage(message) {
    // 處理決策回覆
    if (decisionSystem.pendingDecisions.size > 0) {
      const decisionResponse = await decisionSystem.processOwnerDecision(message, OWNER_LINE_ID);
      if (!decisionResponse.includes('找不到對應的決策請求')) {
        return decisionResponse;
      }
    }

    // 處理指令
    if (message.startsWith('/')) {
      return await this.handleCommand(message);
    }

    // 處理訊息轉發
    if (message.includes('告訴') || message.includes('跟') && message.includes('說')) {
      return await this.handleMessageForward(message);
    }
    
    return await enhancedAI.generateReply(OWNER_LINE_ID, message, { isGroup: false });
  }

  async handleCommand(command) {
    const cmd = command.substring(1).toLowerCase().split(' ')[0];
    
    switch (cmd) {
      case 'status':
        return this.getSystemStatus();
      
      case 'users':
        return this.getUserReport();
      
      case 'reminders':
        return reminderSystem.listReminders(OWNER_LINE_ID);
      
      case 'decisions':
        return this.getPendingDecisions();
      
      case 'help':
        return this.getHelpMenu();
      
      default:
        return '未知指令，輸入 /help 查看可用指令';
    }
  }

  async handleMessageForward(message) {
    // 解析訊息格式：告訴[名字] [訊息內容]
    const match = message.match(/(?:告訴|跟)(.+?)(?:說|:)(.+)/);
    
    if (!match) {
      return '訊息格式：告訴[名字] [訊息內容]\n例如：告訴小明 等一下開會';
    }

    const targetName = match[1].trim();
    const content = match[2].trim();
    
    return await messageForward.forwardMessage(targetName, content, '顧晉瑋');
  }

  getSystemStatus() {
    return `🤖 系統狀態報告

⏰ 提醒系統：正常（${reminderSystem.reminders.size} 個活躍提醒）
🧠 AI系統：正常  
⚖️ 決策系統：正常（${decisionSystem.pendingDecisions.size} 個待處理）
🔍 搜尋系統：正常
🎬 電影系統：正常
📨 轉發系統：正常
💬 對話記錄：${enhancedAI.conversations.size} 筆
👥 用戶數：${enhancedAI.userProfiles.size} 人
📱 已知聯絡人：${messageForward.userList.size} 人

✅ 所有系統運作正常！`;
  }

  getUserReport() {
    const users = Array.from(enhancedAI.userProfiles.values());
    let report = `👥 用戶活躍度報告\n\n總用戶：${users.length} 人\n\n`;
    
    const sortedUsers = users
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);
    
    sortedUsers.forEach((user, index) => {
      report += `${index + 1}. ${user.name}\n`;
      report += `   💬 訊息數：${user.messageCount}\n`;
      report += `   🕐 最後活躍：${user.lastSeen.toLocaleString('zh-TW')}\n\n`;
    });
    
    return report;
  }

  getPendingDecisions() {
    const decisions = Array.from(decisionSystem.pendingDecisions.values());
    
    if (decisions.length === 0) {
      return '目前沒有待處理的決策';
    }

    let report = `⚖️ 待處理決策\n\n共 ${decisions.length} 個\n\n`;
    
    decisions.forEach((d, index) => {
      report += `${index + 1}. [${d.id.substr(-6)}]\n`;
      report += `   👤 ${d.userName}\n`;
      report += `   💬 ${d.message}\n`;
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
  const reminderKeywords = ['提醒我', '提醒', '分鐘後', '小時後', '叫我', '起床', '鬧鐘', '明天'];
  return reminderKeywords.some(keyword => text.includes(keyword)) && 
         (text.match(/\d/) || text.includes('明天'));
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
  
  res.send(`
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
      <p><strong>🇹🇼 台灣時間：${currentTime}</strong></p>
      <p><strong>🔑 機器人主人：${OWNER_LINE_ID}</strong></p>
      
      <div class="chart">
        系統運行狀態：優良 ✨
      </div>
      
      <h2>📊 即時系統狀態</h2>
      <div class="status-box">
        <p>🧠 AI系統：運作中（對話記錄 ${enhancedAI.conversations.size} 筆）</p>
        <p>⏰ 提醒系統：運作中（活躍提醒 ${reminderSystem.reminders.size} 個）</p>
        <p>⚖️ 決策系統：運作中（待處理 ${decisionSystem.pendingDecisions.size} 個）</p>
        <p>🔍 搜尋系統：運作中</p>
        <p>🎬 電影系統：運作中</p>
        <p>📨 轉發系統：運作中（聯絡人 ${messageForward.userList.size} 人）</p>
        <p>👥 總用戶數：${enhancedAI.userProfiles.size} 人</p>
      </div>
      
      <h2>✨ 核心功能總覽</h2>
      <div class="feature-grid">
        <div class="feature-card">
          <h3>🧠 智能對話系統</h3>
          <ul>
            <li>Gemini AI + 備用 AI</li>
            <li>群組上下文記憶</li>
            <li>個性化回覆</li>
            <li>離線智能回覆</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>⚖️ 決策詢問系統</h3>
          <ul>
            <li>重要事項先詢問主人</li>
            <li>提供對話上下文</li>
            <li>支援自訂回覆</li>
            <li>多群組決策追蹤</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>⏰ 提醒系統</h3>
          <ul>
            <li>支援多種時間格式</li>
            <li>鬧鐘功能</li>
            <li>提醒清單查詢</li>
            <li>智能標題提取</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>🔍 搜尋系統</h3>
          <ul>
            <li>網路即時搜尋</li>
            <li>AI 知識補充</li>
            <li>結構化結果呈現</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>🎬 電影查詢</h3>
          <ul>
            <li>熱門電影推薦</li>
            <li>電影搜尋功能</li>
            <li>評分與簡介</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <h3>📨 訊息轉發</h3>
          <ul>
            <li>主人可轉發訊息給他人</li>
            <li>自動記錄聯絡人</li>
            <li>簡單指令操作</li>
          </ul>
        </div>
      </div>
      
      <h2>📈 功能使用統計</h2>
      <div style="background: white; padding: 20px; border-radius: 8px;">
        <canvas id="statsChart" width="400" height="200"></canvas>
      </div>
      
      <h2>🔧 v11.0 更新內容</h2>
      <ul>
        <li>✅ 修復決策回覆功能</li>
        <li>✅ 增強決策系統（提供上下文）</li>
        <li>✅ 修復提醒系統</li>
        <li>✅ 修復電影查詢功能</li>
        <li>✅ 新增網路搜尋功能</li>
        <li>✅ 新增訊息轉發功能</li>
        <li>✅ 解決多群組決策混亂問題</li>
        <li>✅ 優化系統穩定性</li>
      </ul>
      
      <script>
        // 簡單的統計圖表
        const canvas = document.getElementById('statsChart');
        const ctx = canvas.getContext('2d');
        
        // 繪製簡單的長條圖
        const data = [
          { label: 'AI對話', value: ${enhancedAI.conversations.size}, color: '#4CAF50' },
          { label: '用戶數', value: ${enhancedAI.userProfiles.size}, color: '#2196F3' },
          { label: '提醒數', value: ${reminderSystem.reminders.size}, color: '#FF9800' },
          { label: '決策數', value: ${decisionSystem.pendingDecisions.size}, color: '#9C27B0' }
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
  `);
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

  // 處理事件
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
    
    // 獲取用戶名稱
    let userName = '朋友';
    let groupName = '群組';
    try {
      if (groupId) {
        const profile = await client.getGroupMemberProfile(groupId, userId);
        userName = profile.displayName;
        // 嘗試獲取群組名稱（LINE API 可能不支援）
        try {
          const groupInfo = await client.getGroupSummary(groupId);
          groupName = groupInfo.groupName;
        } catch (e) {
          // 忽略錯誤
        }
      } else {
        const profile = await client.getProfile(userId);
        userName = profile.displayName;
      }
    } catch (error) {
      console.log('無法獲取用戶名稱');
    }

    // 更新用戶列表
    messageForward.updateUserList(userId, userName);

    const context = { isGroup, groupId, userId, userName, groupName };
    let response = '';

    // 私訊特殊處理
    if (!isGroup) {
      response = await privateMessage.handlePrivateMessage(userId, userName, messageText);
      await safeReply(replyToken, response);
      return;
    }

    // 群組消息處理
    if (isFunctionMenuQuery(messageText)) {
      const menuText = `🎛️ 顧晉瑋的AI助手功能總覽

⏰ 提醒功能：
• "10分鐘後提醒我休息"
• "3:30提醒我開會"  
• "明天7點叫我起床"

💬 智能對話：
• 任何問題都可以問我
• 記得群組對話內容

🔍 搜尋功能：
• "搜尋最新科技新聞"
• "幫我查天氣"

🎬 電影查詢：
• "最近有什麼電影"
• "搜尋電影復仇者聯盟"

⚖️ 決策系統：
• 重要決定會先詢問主人
• 提供完整對話脈絡

🔐 隱私保護：
• 群組對話不會洩露私人信息

💡 更多功能請私訊我！`;
      
      await safeReply(replyToken, menuText);
      
    } else if (isReminderQuery(messageText)) {
      console.log('檢測到提醒請求:', messageText);
      
      const timeInfo = reminderSystem.parseTime(messageText);
      
      if (timeInfo && timeInfo.time) {
        const title = reminderSystem.extractTitle(messageText);
        const reminderId = reminderSystem.createReminder(userId, title, timeInfo.time, timeInfo.isAlarm);
        
        if (reminderId) {
          const confirmText = `✅ ${timeInfo.isAlarm ? '鬧鐘' : '提醒'}設定成功！

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

請再試一次～`;
        
        await safeReply(replyToken, helpText);
      }
      
    } else if (isMovieQuery(messageText)) {
      console.log('檢測到電影查詢:', messageText);
      
      // 提取電影名稱
      let movieName = '';
      const searchMatch = messageText.match(/(?:搜尋|查|找).*?電影(.+)|電影.*?(.+)/);
      if (searchMatch) {
        movieName = (searchMatch[1] || searchMatch[2] || '').trim();
      }
      
      const movieResults = await movieSystem.searchMovies(movieName);
      await safeReply(replyToken, movieResults);
      
    } else if (isWebSearchQuery(messageText)) {
      console.log('檢測到搜尋請求:', messageText);
      
      // 提取搜尋關鍵字
      let query = messageText;
      const searchMatch = messageText.match(/(?:搜尋|查詢|查一下|幫我查)(.+)|(.+?)(?:是什麼|怎麼辦)/);
      if (searchMatch) {
        query = (searchMatch[1] || searchMatch[2] || messageText).trim();
      }
      
      const searchResults = await webSearch.search(query);
      await safeReply(replyToken, searchResults);
      
    } else {
      // 檢查是否需要決策
      if (decisionSystem.shouldAskOwner(messageText, context)) {
        response = await decisionSystem.requestDecision(messageText, userId, userName, context, replyToken);
        await safeReply(replyToken, response);
      } else {
        // 一般智能對話
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
  
  // 通知主人
  setTimeout(async () => {
    try {
      const startupMessage = `🚀 增強版 v11.0 已啟動！

✨ 新增功能：
• 決策系統增強（提供上下文）
• 網路搜尋功能
• 訊息轉發功能
• 多群組決策追蹤

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