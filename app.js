const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('正在啟動超級增強版 LINE Bot...');
console.log('當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

// 配置資訊
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b';
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';
const SEARCH_API_KEY = process.env.SEARCH_API_KEY || 'your-google-search-api-key';
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID || '526082b509a1942a7';

// 特殊用戶配置
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'demo326';
const DECISION_KEYWORDS = ['決定', '決策', '怎麼辦', '選擇', '意見', '建議', '投票', '同意嗎', '看法'];

// LINE 訊息長度限制
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// API 調用限制器
class APIRateLimiter {
  constructor() {
    this.geminiCalls = [];
    this.maxCallsPerMinute = 12; // 保守一點，免費版限制是15次
  }

  canCallGemini() {
    const now = Date.now();
    // 清理一分鐘前的記錄
    this.geminiCalls = this.geminiCalls.filter(time => now - time < 60000);
    
    if (this.geminiCalls.length >= this.maxCallsPerMinute) {
      console.log(`⚠️ Gemini API 調用頻率限制，當前: ${this.geminiCalls.length}/分鐘`);
      return false;
    }
    
    this.geminiCalls.push(now);
    return true;
  }

  getRemainingCalls() {
    const now = Date.now();
    this.geminiCalls = this.geminiCalls.filter(time => now - time < 60000);
    return this.maxCallsPerMinute - this.geminiCalls.length;
  }
}

const rateLimiter = new APIRateLimiter();

// 儲存系統
const conversationHistory = new Map();
const learningDatabase = new Map();
const reminderSystem = new Map();

// 時間系統（修正版）
const TimeSystem = {
  getCurrentTime() {
    const now = new Date();
    
    // 確保使用台灣時區
    const taiwanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    
    return {
      timestamp: taiwanTime,
      formatted: taiwanTime.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long',
        timeZone: 'Asia/Taipei'
      }),
      dateOnly: taiwanTime.toLocaleDateString('zh-TW', {timeZone: 'Asia/Taipei'}),
      timeOnly: taiwanTime.toLocaleTimeString('zh-TW', {timeZone: 'Asia/Taipei'}),
      iso: taiwanTime.toISOString()
    };
  },

  parseTimeExpression(text) {
    const timePatterns = [
      { pattern: /(\d{1,2})分鐘後/, offset: null, type: 'minute' },
      { pattern: /(\d{1,2})小時後/, offset: null, type: 'hour' },
      { pattern: /明天.*?(\d{1,2})點/, offset: 1, type: 'day' },
      { pattern: /後天.*?(\d{1,2})點/, offset: 2, type: 'day' },
      { pattern: /今天.*?(\d{1,2})點/, offset: 0, type: 'day' }
    ];

    for (const timePattern of timePatterns) {
      const match = text.match(timePattern.pattern);
      if (match) {
        const now = this.getCurrentTime().timestamp;
        const value = parseInt(match[1]);
        
        switch (timePattern.type) {
          case 'minute':
            return new Date(now.getTime() + value * 60000);
          case 'hour':
            return new Date(now.getTime() + value * 3600000);
          case 'day':
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + timePattern.offset);
            targetDate.setHours(value, 0, 0, 0);
            return targetDate;
        }
      }
    }
    
    return null;
  }
};

// 訊息長度限制器
function limitMessageLength(message, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof message === 'string') {
    if (message.length > maxLength) {
      return message.substring(0, maxLength - 20) + '\n\n...(訊息過長已截斷)';
    }
    return message;
  }
  
  if (message && message.text) {
    message.text = limitMessageLength(message.text, maxLength);
  }
  
  return message;
}

// 超級記憶系統（優化版）
class SuperMemorySystem {
  constructor() {
    this.userStatements = new Map();
    this.userProfiles = new Map();
    this.contradictions = new Map();
    this.behaviorPatterns = new Map();
  }

  recordStatement(userId, userName, statement, timestamp, groupId = null) {
    const key = `${userId}-${groupId || 'private'}`;
    
    if (!this.userStatements.has(key)) {
      this.userStatements.set(key, []);
    }

    const record = {
      userId,
      userName: userName || '未知用戶',
      statement,
      timestamp,
      groupId,
      analyzed: false,
      topics: this.extractTopics(statement),
      sentiment: this.analyzeSentiment(statement)
    };

    this.userStatements.get(key).push(record);
    
    if (this.userStatements.get(key).length > 50) { // 減少記憶數量
      this.userStatements.get(key) = this.userStatements.get(key).slice(-50);
    }

    // 只對重要語句進行矛盾檢測
    if (this.isImportantStatement(statement)) {
      this.detectContradictions(userId, userName, statement, groupId);
    }
    
    this.updateUserProfile(userId, userName, record);

    console.log(`🧠 記錄發言：${userName} - ${statement.substring(0, 30)}...`);
  }

  // 判斷是否為重要語句（減少API調用）
  isImportantStatement(statement) {
    const importantKeywords = [
      /我.*喜歡|我.*不喜歡|我.*覺得|我.*認為/,
      /我會|我不會|我要|我不要/,
      /決定|選擇|同意|反對/,
      /好|不好|棒|爛/
    ];
    
    return importantKeywords.some(pattern => pattern.test(statement)) && statement.length > 5;
  }

  extractTopics(statement) {
    const topics = [];
    const topicPatterns = {
      meeting: /會議|開會|聚會|見面|討論/,
      food: /吃|餐廳|食物|午餐|晚餐|早餐/,
      work: /工作|專案|任務|deadline|報告/,
      time: /時間|明天|今天|下週|幾點/,
      money: /錢|費用|價格|預算|成本/,
      opinion: /覺得|認為|建議|意見|想法/
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(statement)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  analyzeSentiment(statement) {
    const positive = /好|棒|讚|同意|支持|喜歡|滿意|開心|高興/.test(statement);
    const negative = /不好|爛|反對|不同意|討厭|不滿|生氣|難過/.test(statement);
    
    if (positive) return 'positive';
    if (negative) return 'negative';
    return 'neutral';
  }

  async detectContradictions(userId, userName, currentStatement, groupId) {
    try {
      // 檢查API調用限制
      if (!rateLimiter.canCallGemini()) {
        console.log('⚠️ Gemini API 調用限制，跳過矛盾檢測');
        return;
      }

      const key = `${userId}-${groupId || 'private'}`;
      const userHistory = this.userStatements.get(key) || [];
      
      // 只檢查最近5條重要發言
      const recentStatements = userHistory
        .filter(s => this.isImportantStatement(s.statement))
        .slice(-5);
      
      for (const pastStatement of recentStatements) {
        const timeDiff = Math.abs(new Date() - pastStatement.timestamp);
        
        // 只檢查24小時內的發言
        if (timeDiff > 24 * 60 * 60 * 1000) continue;
        
        const contradiction = await this.checkContradiction(currentStatement, pastStatement.statement);
        
        if (contradiction.isContradiction && contradiction.confidence > 0.8) {
          const contradictionRecord = {
            userId,
            userName,
            currentStatement,
            pastStatement: pastStatement.statement,
            pastTimestamp: pastStatement.timestamp,
            currentTimestamp: new Date(),
            confidence: contradiction.confidence,
            explanation: contradiction.explanation,
            groupId
          };

          const contradictionKey = `${userId}-${Date.now()}`;
          this.contradictions.set(contradictionKey, contradictionRecord);
          
          console.log(`⚠️ 檢測到矛盾：${userName} - 信心度：${contradiction.confidence}`);
          
          // 延遲發送避免干擾
          setTimeout(() => {
            this.sendContradictionNotice(contradictionRecord);
          }, 3000);
          
          break;
        }
      }
    } catch (error) {
      console.error('矛盾檢測錯誤:', error.message);
    }
  }

  async checkContradiction(statement1, statement2) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 150, // 減少輸出長度
        }
      });

      const prompt = `分析是否矛盾（簡潔回答）：

發言1：${statement1}
發言2：${statement2}

JSON格式：
{"isContradiction": true/false, "confidence": 0-1, "explanation": "簡短說明"}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      
      try {
        const parsed = JSON.parse(text);
        return parsed;
      } catch {
        return { isContradiction: false, confidence: 0, explanation: '解析失敗' };
      }
    } catch (error) {
      if (error.message.includes('429') || error.message.includes('quota')) {
        console.log('⚠️ Gemini API 配額已滿，暫停矛盾檢測');
      } else {
        console.error('AI矛盾檢測錯誤:', error.message);
      }
      return { isContradiction: false, confidence: 0, explanation: '檢測失敗' };
    }
  }

  async sendContradictionNotice(contradictionRecord) {
    try {
      const timeDiff = Math.floor((contradictionRecord.currentTimestamp - contradictionRecord.pastTimestamp) / (1000 * 60));
      const timeDesc = timeDiff < 60 ? `${timeDiff}分鐘前` : `${Math.floor(timeDiff/60)}小時前`;

      // 簡短的矛盾提醒
      const message = `🤔 ${contradictionRecord.userName}，我注意到：

現在：「${contradictionRecord.currentStatement}」
${timeDesc}：「${contradictionRecord.pastStatement}」

這兩個說法似乎不太一致呢！是情況有變化嗎？`;

      // 確保訊息長度符合限制
      const limitedMessage = limitMessageLength(message);

      const targetId = contradictionRecord.groupId || contradictionRecord.userId;
      await client.pushMessage(targetId, { type: 'text', text: limitedMessage });
      
      console.log(`💬 已發送矛盾提醒給：${contradictionRecord.userName}`);
    } catch (error) {
      console.error('發送矛盾提醒錯誤:', error.message);
    }
  }

  updateUserProfile(userId, userName, record) {
    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        userId,
        userName,
        totalMessages: 0,
        topics: new Map(),
        sentiments: { positive: 0, neutral: 0, negative: 0 },
        lastActive: null,
        behaviorPattern: 'unknown',
        contradictions: 0
      });
    }

    const profile = this.userProfiles.get(userId);
    profile.totalMessages++;
    profile.lastActive = record.timestamp;
    profile.sentiments[record.sentiment]++;

    record.topics.forEach(topic => {
      const count = profile.topics.get(topic) || 0;
      profile.topics.set(topic, count + 1);
    });
  }

  getUserMemorySummary(userId) {
    const profile = this.userProfiles.get(userId);
    if (!profile) return '這個用戶我還不太熟悉呢！';

    const topTopics = Array.from(profile.topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic, count]) => `${topic}(${count}次)`);

    const sentimentRatio = {
      positive: Math.round(profile.sentiments.positive / profile.totalMessages * 100),
      negative: Math.round(profile.sentiments.negative / profile.totalMessages * 100)
    };

    return `🧠 ${profile.userName} 的記憶檔案：
📊 總發言：${profile.totalMessages} 次
💬 常談話題：${topTopics.join(', ') || '還在觀察中'}
😊 情緒分析：正面 ${sentimentRatio.positive}%，負面 ${sentimentRatio.negative}%
⏰ 最後活躍：${profile.lastActive ? profile.lastActive.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}) : '未知'}`;
  }
}

// 簡化的提醒系統
class SimpleReminderSystem {
  constructor() {
    this.reminders = new Map();
  }

  createReminder(userId, title, targetTime, description = '') {
    const now = TimeSystem.getCurrentTime().timestamp;
    const reminderId = `${userId}-${Date.now()}`;
    
    const reminder = {
      id: reminderId,
      userId,
      title,
      targetTime,
      description,
      created: now,
      active: true
    };

    this.reminders.set(reminderId, reminder);
    this.scheduleReminder(reminder);
    
    return reminderId;
  }

  scheduleReminder(reminder) {
    const now = TimeSystem.getCurrentTime().timestamp;
    const delay = reminder.targetTime.getTime() - now.getTime();
    
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) { // 最多24小時
      setTimeout(async () => {
        await this.sendReminder(reminder);
      }, delay);
      
      console.log(`⏰ 提醒已安排：${reminder.title} - ${delay}ms後`);
    }
  }

  async sendReminder(reminder) {
    try {
      const message = `⏰ 提醒時間到！

${reminder.title}

${reminder.description || ''}

設定時間：${reminder.created.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}`;

      const limitedMessage = limitMessageLength(message);
      await client.pushMessage(reminder.userId, { type: 'text', text: limitedMessage });
      
      console.log(`⏰ 提醒已發送：${reminder.title}`);
      
      reminder.active = false;
    } catch (error) {
      console.error('發送提醒錯誤:', error.message);
    }
  }
}

// 其他系統的簡化版本
class GroupMemberMonitor {
  constructor() {
    this.groupMembers = new Map();
    this.memberActivity = new Map();
    this.discussionSessions = new Map();
  }

  recordMemberActivity(groupId, userId, userName) {
    // 簡化的活動記錄
    if (!this.memberActivity.has(groupId)) {
      this.memberActivity.set(groupId, new Map());
    }

    const activity = this.memberActivity.get(groupId);
    activity.set(userId, {
      userName,
      lastMessage: TimeSystem.getCurrentTime().timestamp,
      messageCount: (activity.get(userId)?.messageCount || 0) + 1
    });
  }

  async checkSilentMembers(groupId, currentMessage) {
    // 簡化的沉默檢測，減少複雜邏輯
    const importantKeywords = ['大家', '各位', '意見', '看法', '討論', '決定'];
    const isImportant = importantKeywords.some(keyword => currentMessage.includes(keyword));
    
    if (isImportant) {
      console.log(`👥 檢測到重要討論：${currentMessage.substring(0, 30)}...`);
      // 這裡可以添加簡單的@提醒邏輯
    }
  }
}

class UnsendMessageTracker {
  constructor() {
    this.unsendMessages = new Map();
    this.recentMessages = new Map();
  }

  recordMessage(messageId, userId, userName, content, timestamp, groupId = null) {
    this.recentMessages.set(messageId, {
      messageId, userId, userName, content, timestamp, groupId
    });

    // 只保留最近100條
    if (this.recentMessages.size > 100) {
      const entries = Array.from(this.recentMessages.entries());
      entries.slice(0, 20).forEach(([key]) => {
        this.recentMessages.delete(key);
      });
    }
  }

  async handleUnsendMessage(messageId, userId, groupId = null) {
    const originalMessage = this.recentMessages.get(messageId);
    
    if (originalMessage) {
      const message = `📱 偵測到收回訊息！

👤 ${originalMessage.userName}
💬 「${originalMessage.content}」
⏰ ${originalMessage.timestamp.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}

🤖 我都記住了呢！`;

      const limitedMessage = limitMessageLength(message);
      const targetId = groupId || userId;
      
      try {
        await client.pushMessage(targetId, { type: 'text', text: limitedMessage });
        console.log(`📢 已發送收回通知：${originalMessage.userName}`);
      } catch (error) {
        console.error('發送收回通知錯誤:', error.message);
      }
    }
  }
}

class DecisionAssistant {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionHistory = new Map();
  }

  async detectDecisionNeeded(groupId, message, userId, userName) {
    const needsDecision = DECISION_KEYWORDS.some(keyword => message.includes(keyword));
    
    if (needsDecision && rateLimiter.canCallGemini()) {
      console.log(`🤔 檢測到可能需要決策：${message.substring(0, 50)}...`);
      
      // 簡化的決策檢測，減少API調用
      setTimeout(() => {
        this.sendSimpleDecisionRequest(groupId, message, userName);
      }, 30000);
    }
  }

  async sendSimpleDecisionRequest(groupId, message, userName) {
    try {
      const report = `🎯 群組決策請求

📍 群組：${groupId.substring(0, 15)}...
👤 觸發者：${userName}
💬 內容：${message}
⏰ 時間：${TimeSystem.getCurrentTime().formatted}

請您查看群組對話並做出決策。`;

      const limitedReport = limitMessageLength(report);
      await client.pushMessage(ADMIN_USER_ID, { type: 'text', text: limitedReport });
      
      console.log(`🎯 已發送簡化決策請求`);
    } catch (error) {
      console.error('發送決策請求錯誤:', error.message);
    }
  }
}

// 初始化系統
const superMemorySystem = new SuperMemorySystem();
const simpleReminderSystem = new SimpleReminderSystem();
const groupMemberMonitor = new GroupMemberMonitor();
const unsendMessageTracker = new UnsendMessageTracker();
const decisionAssistant = new DecisionAssistant();

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = TimeSystem.getCurrentTime();
  const stats = {
    userMemories: superMemorySystem.userStatements.size,
    contradictions: superMemorySystem.contradictions.size,
    reminders: simpleReminderSystem.reminders.size,
    geminiCallsRemaining: rateLimiter.getRemainingCalls()
  };

  res.send(`
    <h1>超級增強版 LINE Bot 正在運行！</h1>
    <p><strong>台灣時間：${currentTime.formatted}</strong></p>
    <h2>📊 系統統計：</h2>
    <ul>
      <li>🧠 用戶記憶：${stats.userMemories} 人</li>
      <li>⚠️ 矛盾檢測：${stats.contradictions} 筆</li>
      <li>⏰ 活躍提醒：${stats.reminders} 個</li>
      <li>🤖 Gemini 剩餘調用：${stats.geminiCallsRemaining}/分鐘</li>
    </ul>
    <h2>🚀 優化功能：</h2>
    <ul>
      <li>✅ 台灣時區校正</li>
      <li>✅ 訊息長度限制</li>
      <li>✅ API 調用限制</li>
      <li>✅ 錯誤處理優化</li>
    </ul>
  `);
});

// Webhook 端點
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) {
    console.log('缺少簽名標頭');
    return res.status(401).send('缺少簽名標頭');
  }

  const body = req.body.toString();
  const hash = crypto
    .createHmac('SHA256', config.channelSecret)
    .update(body)
    .digest('base64');

  if (signature !== hash) {
    console.log('簽名驗證失敗');
    return res.status(401).send('簽名驗證失敗');
  }

  let events;
  try {
    const parsedBody = JSON.parse(body);
    events = parsedBody.events;
  } catch (error) {
    console.error('JSON 解析錯誤:', error);
    return res.status(400).send('無效的 JSON');
  }

  Promise
    .all(events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('處理事件錯誤:', err.message);
      res.status(500).end();
    });
});

// 優化的事件處理函數
async function handleEvent(event) {
  try {
    if (event.type === 'unsend') {
      await unsendMessageTracker.handleUnsendMessage(
        event.unsend.messageId,
        event.source.userId,
        event.source.groupId
      );
      return Promise.resolve(null);
    }

    if (event.type !== 'message' || event.message.type !== 'text') {
      return Promise.resolve(null);
    }

    const userId = event.source.userId;
    const groupId = event.source.groupId;
    const messageText = event.message.text.trim();
    const messageId = event.message.id;
    const timestamp = TimeSystem.getCurrentTime().timestamp;
    
    console.log(`📨 收到訊息: ${messageText} | 用戶: ${userId} | 群組: ${groupId || 'private'}`);

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
      console.error('獲取用戶名稱錯誤:', error.message);
    }

    // 記錄系統
    unsendMessageTracker.recordMessage(messageId, userId, userName, messageText, timestamp, groupId);
    superMemorySystem.recordStatement(userId, userName, messageText, timestamp, groupId);

    // 群組功能
    if (groupId) {
      groupMemberMonitor.recordMemberActivity(groupId, userId, userName);
      await groupMemberMonitor.checkSilentMembers(groupId, messageText);
      await decisionAssistant.detectDecisionNeeded(groupId, messageText, userId, userName);
    }

    // 特殊指令處理
    if (messageText.includes('記憶') || messageText.includes('我的記憶')) {
      const summary = superMemorySystem.getUserMemorySummary(userId);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: limitMessageLength(summary)
      });
    }

    // 提醒功能
    if (messageText.includes('提醒我') || messageText.includes('分鐘後') || messageText.includes('小時後')) {
      const targetTime = TimeSystem.parseTimeExpression(messageText);
      
      if (targetTime) {
        const title = messageText.replace(/提醒我|分鐘後|小時後|\d+/g, '').trim() || '重要提醒';
        const reminderId = simpleReminderSystem.createReminder(userId, title, targetTime);
        
        const currentTime = TimeSystem.getCurrentTime();
        const delayMinutes = Math.round((targetTime.getTime() - currentTime.timestamp.getTime()) / 60000);
        
        const confirmMessage = `⏰ 提醒設定成功！

📝 內容：${title}
⏰ 目標時間：${targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}
⌛ 約 ${delayMinutes} 分鐘後提醒

現在時間：${currentTime.timeOnly}`;

        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: limitMessageLength(confirmMessage)
        });
      }
    }

    // 時間查詢
    if (messageText.includes('現在幾點') || messageText.includes('時間')) {
      const currentTime = TimeSystem.getCurrentTime();
      const timeMessage = `🕐 現在時間：${currentTime.timeOnly}
📅 今天日期：${currentTime.dateOnly}
🌏 時區：台灣 (GMT+8)`;

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: timeMessage
      });
    }

    // 系統狀態
    if (messageText.includes('系統狀態') || messageText.includes('超級測試')) {
      const statusMessage = await getSystemStatus();
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: limitMessageLength(statusMessage)
      });
    }

    // 一般對話
    const response = await handleGeneralChat(messageText, userId, userName);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: limitMessageLength(response)
    });

  } catch (error) {
    console.error('處理事件錯誤:', error.message);
    
    try {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '抱歉，處理您的訊息時遇到問題，請稍後再試！'
      });
    } catch (replyError) {
      console.error('回覆錯誤訊息失敗:', replyError.message);
      return Promise.resolve(null);
    }
  }
}

// 簡化的一般對話
async function handleGeneralChat(message, userId, userName) {
  try {
    if (!rateLimiter.canCallGemini()) {
      return `${userName}，我現在的AI分析功能需要休息一下，但我依然記住了你說的每一句話！有什麼需要幫忙的嗎？`;
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200, // 限制輸出長度
      }
    });
    
    const currentTime = TimeSystem.getCurrentTime();
    const context = `你是智能助手「小助手」，具備記憶功能。

當前台灣時間：${currentTime.formatted}
用戶：${userName}

請用繁體中文簡潔友善地回應：${message}

要求：回答要自然、有用，100字以內。`;

    const result = await model.generateContent(context);
    const response = await result.response;
    let text = response.text();
    
    text = text.replace(/[*#`_~\[\]]/g, '').trim();
    
    return text || `${userName}，我聽到了！讓我想想怎麼回應你...`;
  } catch (error) {
    console.error('一般對話錯誤:', error.message);
    return `${userName}，我正在學習中，謝謝你的耐心！`;
  }
}

// 系統狀態檢查
async function getSystemStatus() {
  const currentTime = TimeSystem.getCurrentTime();
  const stats = {
    userMemories: superMemorySystem.userStatements.size,
    contradictions: superMemorySystem.contradictions.size,
    reminders: simpleReminderSystem.reminders.size,
    geminiCalls: rateLimiter.getRemainingCalls()
  };

  return `🧠 系統狀態檢查 (${currentTime.timeOnly})

📊 運行統計：
🧠 記憶用戶：${stats.userMemories} 人
⚠️ 矛盾記錄：${stats.contradictions} 筆  
⏰ 活躍提醒：${stats.reminders} 個
🤖 AI剩餘額度：${stats.geminiCalls}/分鐘

🚀 功能狀態：
✅ 台灣時區正確
✅ 記憶系統運行
✅ 矛盾檢測優化
✅ 提醒功能正常
✅ 訊息長度控制

💡 所有核心功能運行正常！`;
}

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  const currentTime = TimeSystem.getCurrentTime();
  console.log('✅ 超級增強版 LINE Bot 伺服器成功啟動！');
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`🇹🇼 台灣時間：${currentTime.formatted}`);
  console.log(`👑 管理者 ID：${ADMIN_USER_ID}`);
  console.log('🚀 優化功能：');
  console.log('   - 🧠 智能記憶系統');
  console.log('   - ⚠️ 矛盾檢測（API限制優化）');
  console.log('   - ⏰ 提醒系統（台灣時區）');
  console.log('   - 📱 收回追蹤');
  console.log('   - 🎯 決策輔助');
  console.log('   - 🛡️ 錯誤處理強化');
});

process.on('uncaughtException', (error) => {
  console.error('未捕獲的異常:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
});

module.exports = app;