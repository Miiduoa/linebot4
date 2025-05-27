const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const crypto = require('crypto');
const twilio = require('twilio');

// ==================== 環境變數配置 ====================
const config = {
  // LINE Bot 配置
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  
  // AI 配置
  geminiApiKey: process.env.GEMINI_API_KEY,
  backupAiKey: process.env.BACKUP_AI_KEY,
  backupAiUrl: process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1',
  
  // 外部 API
  newsApiKey: process.env.NEWS_API_KEY,
  weatherApiKey: process.env.WEATHER_API_KEY,
  tmdbApiKey: process.env.TMDB_API_KEY,
  searchApiKey: process.env.SEARCH_API_KEY,
  searchEngineId: process.env.SEARCH_ENGINE_ID,
  
  // Twilio 電話鬧鐘
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  
  // 系統配置 - 更新主人ID
  adminUserId: 'U59af77e69411ffb99a49f1f2c3e2afc4',
  port: process.env.PORT || 3000,
  
  // 性能配置
  apiTimeout: 15000,
  maxRetries: 3,
  rateLimitWindow: 60000,
  maxRequestsPerWindow: 50,
  
  // 記憶體配置
  maxPersonalHistory: 200,
  maxGroupHistory: 30,
  maxLearningData: 1000
};

// 初始化服務
const client = new line.Client(config);
const app = express();

// 初始化 AI
let genAI, model, twilioClient;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

// 初始化 Twilio
if (config.twilioAccountSid && config.twilioAuthToken) {
  twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);
}

// ==================== 全域記憶系統 ====================
const Memory = {
  // 用戶對話記憶
  conversations: new Map(),
  
  // 用戶個人檔案
  userProfiles: new Map(),
  
  // 提醒系統
  reminders: new Map(),
  
  // 決策系統
  decisions: new Map(),
  
  // 矛盾記錄
  contradictions: new Map(),
  
  // 訊息歷史（用於收回偵測）
  messageHistory: new Map(),
  
  // 收回訊息追蹤
  recalledMessages: new Map(),
  
  // 系統統計
  stats: {
    totalMessages: 0,
    totalUsers: 0,
    startTime: new Date(),
    errors: 0,
    apiCalls: 0,
    decisionsHandled: 0,
    remindersTriggered: 0,
    contradictionsDetected: 0
  },

  // 學習數據
  learningData: new Map(),
  
  // 頻率限制
  rateLimiter: new Map(),
  
  // 系統健康狀態
  systemHealth: {
    geminiApi: true,
    backupAi: true,
    twilioService: true,
    lastHealthCheck: new Date()
  }
};

// ==================== 工具函數 ====================
class Utils {
  static formatTime(date) {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  }

  static generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static safeJsonParse(str, defaultValue = {}) {
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }

  static truncateText(text, maxLength = 100) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  static checkRateLimit(userId) {
    const now = Date.now();
    const userRequests = Memory.rateLimiter.get(userId) || [];
    
    // 清除過期請求
    const validRequests = userRequests.filter(time => now - time < config.rateLimitWindow);
    
    if (validRequests.length >= config.maxRequestsPerWindow) {
      return false;
    }
    
    validRequests.push(now);
    Memory.rateLimiter.set(userId, validRequests);
    return true;
  }

  static async retryOperation(operation, maxRetries = config.maxRetries) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        console.error(`❌ 操作失敗 (第${i + 1}次嘗試):`, error.message);
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  static createASCIIChart(data, title, maxWidth = 30) {
    const maxValue = Math.max(...data.map(item => item.value));
    const chart = [`📊 ${title}`, '─'.repeat(maxWidth + 10)];
    
    data.forEach(item => {
      const barLength = Math.max(1, Math.floor((item.value / maxValue) * maxWidth));
      const bar = '█'.repeat(barLength);
      const spaces = ' '.repeat(Math.max(0, maxWidth - barLength));
      chart.push(`${item.label.padEnd(8)} │${bar}${spaces}│ ${item.value}`);
    });
    
    chart.push('─'.repeat(maxWidth + 10));
    return chart.join('\n');
  }
}

// ==================== Flex 訊息系統 ====================
class FlexMessageBuilder {
  static createBasicCard(title, content, headerColor = '#4A90E2', actions = null) {
    const bubble = {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: title,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
          wrap: true
        }],
        backgroundColor: headerColor,
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: content,
          wrap: true,
          size: 'md',
          color: '#333333'
        }],
        paddingAll: 'lg'
      }
    };

    if (actions && actions.length > 0) {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: actions,
        paddingAll: 'lg'
      };
    }

    return {
      type: 'flex',
      altText: title,
      contents: bubble
    };
  }

  static createChatResponse(content, emoji = '💬', color = '#4A90E2') {
    return this.createBasicCard(`${emoji} 智能回覆`, content, color);
  }

  static createSystemMessage(content, title = '🤖 系統訊息', color = '#34C759') {
    return this.createBasicCard(title, content, color);
  }

  static createErrorMessage(content, title = '❌ 錯誤訊息') {
    return this.createBasicCard(title, content, '#FF3B30');
  }

  static createWarningMessage(content, title = '⚠️ 警告訊息') {
    return this.createBasicCard(title, content, '#FF9500');
  }

  static createReminderCard(reminderData) {
    const actions = [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: '📋 查看全部',
              text: '/提醒清單'
            },
            style: 'secondary',
            flex: 1
          },
          {
            type: 'button',
            action: {
              type: 'message',
              label: '❌ 取消',
              text: `/取消提醒 ${reminderData.id}`
            },
            color: '#FF3B30',
            flex: 1
          }
        ]
      }
    ];

    const content = `📝 內容：${reminderData.content}\n\n🕐 時間：${Utils.formatTime(reminderData.targetTime)}\n\n🆔 編號：${reminderData.id}${reminderData.isPhoneCall ? '\n\n📞 電話鬧鐘已啟用' : ''}`;

    return this.createBasicCard('⏰ 提醒設定成功', content, '#34C759', actions);
  }

  static createDecisionCard(decisionData) {
    const actions = [
      {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: '✅ 同意',
              text: `決策同意 ${decisionData.id}`
            },
            style: 'primary',
            flex: 1
          },
          {
            type: 'button',
            action: {
              type: 'message',
              label: '❌ 拒絕',
              text: `決策拒絕 ${decisionData.id}`
            },
            color: '#FF3B30',
            flex: 1
          }
        ]
      },
      {
        type: 'button',
        action: {
          type: 'message',
          label: '❓ 需要更多資訊',
          text: `決策詳情 ${decisionData.id}`
        },
        style: 'secondary'
      }
    ];

    const content = `👤 請求者：${decisionData.requesterName || '未知'}\n\n📋 內容：${decisionData.content}\n\n🕐 時間：${decisionData.timestamp}\n\n⏰ 30分鐘後將自動拒絕`;

    return this.createBasicCard('⚖️ 需要您的決策', content, '#FF9500', actions);
  }

  static createStatusCard(stats) {
    const uptime = Math.floor((Date.now() - stats.startTime) / 3600000);
    const memoryUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    const content = `💬 總訊息數：${stats.totalMessages}\n👥 用戶數量：${Memory.userProfiles.size}\n⏰ 活躍提醒：${Memory.reminders.size}\n⚖️ 待決策：${Array.from(Memory.decisions.values()).filter(d => d.status === 'pending').length}\n🕒 運行時間：${uptime}小時\n💾 記憶體：${memoryUsed}MB\n📈 API呼叫：${stats.apiCalls}\n❌ 錯誤次數：${stats.errors}\n⚖️ 處理決策：${stats.decisionsHandled}\n⏰ 觸發提醒：${stats.remindersTriggered}\n⚠️ 偵測矛盾：${stats.contradictionsDetected}`;

    return this.createBasicCard('📊 系統狀態總覽', content, '#4A90E2');
  }

  static createListCard(title, items, icon = '📋', color = '#4A90E2') {
    if (!items || items.length === 0) {
      return this.createSystemMessage('目前沒有任何項目', `${icon} ${title}`);
    }

    const content = items.map((item, index) => `${index + 1}. ${item}`).join('\n\n');
    return this.createBasicCard(`${icon} ${title}`, content, color);
  }

  static createMultiPageCard(title, pages, currentPage = 0, icon = '📋') {
    const page = pages[currentPage];
    const totalPages = pages.length;
    
    const actions = [];
    if (totalPages > 1) {
      const navButtons = [];
      
      if (currentPage > 0) {
        navButtons.push({
          type: 'button',
          action: {
            type: 'message',
            label: '◀️ 上一頁',
            text: `${title.replace(icon, '').trim()} 第${currentPage}頁`
          },
          flex: 1
        });
      }
      
      if (currentPage < totalPages - 1) {
        navButtons.push({
          type: 'button',
          action: {
            type: 'message',
            label: '下一頁 ▶️',
            text: `${title.replace(icon, '').trim()} 第${currentPage + 2}頁`
          },
          flex: 1
        });
      }
      
      if (navButtons.length > 0) {
        actions.push({
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: navButtons
        });
      }
    }

    const headerTitle = totalPages > 1 ? `${title} (第${currentPage + 1}/${totalPages}頁)` : title;
    return this.createBasicCard(headerTitle, page, '#4A90E2', actions);
  }

  static createWeatherCard(weatherData) {
    const content = `🌡️ 溫度：${weatherData.temperature}°C\n☁️ 天氣：${weatherData.condition}\n💨 風速：${weatherData.windSpeed || '未知'} km/h\n💧 濕度：${weatherData.humidity || '未知'}%\n📅 更新：${Utils.formatTime(new Date())}`;

    return this.createBasicCard(`🌤️ ${weatherData.location} 天氣`, content, '#34C759');
  }

  static createChartCard(data, title, type = 'bar') {
    const asciiChart = Utils.createASCIIChart(data, title);
    return this.createBasicCard(`📊 ${title}`, asciiChart, '#FF9500');
  }

  static createMovieCard(movies) {
    if (!movies || movies.length === 0) {
      return this.createSystemMessage('目前沒有電影資料', '🎬 電影推薦');
    }

    const content = movies.map((movie, index) => 
      `${index + 1}. ${movie.title}\n   ⭐ 評分：${movie.rating}/10\n   📅 年份：${movie.year}\n   🎭 類型：${movie.genre}`
    ).join('\n\n');

    return this.createBasicCard('🎬 熱門電影推薦', content, '#8E44AD');
  }

  static createNewsCard(news) {
    if (!news || news.length === 0) {
      return this.createSystemMessage('目前沒有新聞資料', '📰 新聞摘要');
    }

    const content = news.map((item, index) => 
      `${index + 1}. ${item.title}\n   📅 ${item.date}\n   📝 ${item.summary}`
    ).join('\n\n');

    return this.createBasicCard('📰 最新新聞', content, '#E74C3C');
  }

  static createHelpCard() {
    const content = `🤖 超級智能 LINE Bot 使用說明

📱 一般功能：
• 直接聊天 - AI會模擬主人風格回應
• 設定提醒 - "30分鐘後提醒我開會"
• 電話鬧鐘 - "6點叫我起床"（電話喚醒）
• 查詢天氣 - "台中天氣如何"
• 搜尋資訊 - "搜尋 LINE Bot 開發"
• 電影推薦 - "推薦熱門電影"
• 新聞查詢 - "最新新聞"

🔐 主人專用指令：
• /狀態報告 - 查看系統總覽
• /提醒清單 - 查看所有提醒
• /決策待辦 - 查看待處理決策
• /用戶活躍 - 查看用戶活動
• /系統統計 - 查看詳細統計
• /功能列表 - 查看所有功能
• /清除歷史 - 清理對話記錄
• /說明 - 顯示此說明

🎯 特色功能：
• 完全模擬主人的說話風格
• 自動學習對話模式
• 智能決策系統
• 矛盾偵測提醒
• 訊息收回追蹤
• 全圖文回應格式
• 電話鬧鐘功能
• 自我修復機制`;

    return this.createBasicCard('📚 使用說明', content, '#34C759');
  }
}

// ==================== AI 個性系統 ====================
class AIPersonalitySystem {
  constructor() {
    this.ownerPersonality = {
      name: '顧晉瑋',
      school: '靜宜大學資管系',
      language_style: '台灣口語化、親切、專業但不拘謹',
      response_patterns: [
        '喜歡用「欸」、「哈哈」、「對啊」、「這樣啊」等語助詞',
        '會適時給建議但不會太強勢',
        '遇到技術問題會很興奮，喜歡深入討論',
        '對朋友很關心，會主動詢問近況',
        '講話直接但很溫暖，有時會開玩笑'
      ],
      values: [
        '注重效率但也關心人情',
        '喜歡學習新技術和分享知識',
        '重視團隊合作和互助',
        '實事求是，不喜歡虛假',
        '追求完美但也務實'
      ],
      emotional_style: '正面樂觀，偶爾會開玩笑，但在正事上很認真',
      expertise: [
        '程式設計和系統開發',
        'LINE Bot 和 AI 技術',
        '資訊管理和數據分析',
        '問題解決和邏輯思考',
        '軟體架構設計'
      ]
    };
  }

  async generatePersonalizedResponse(message, userContext, conversationHistory) {
    Memory.stats.apiCalls++;
    
    const personalityPrompt = `
你是${this.ownerPersonality.name}的AI分身，來自${this.ownerPersonality.school}。
你必須完全模擬他的說話方式、思維模式和個性特徵：

個性設定：
- 語言風格：${this.ownerPersonality.language_style}
- 回應特色：${this.ownerPersonality.response_patterns.join('、')}
- 核心價值：${this.ownerPersonality.values.join('、')}
- 情緒風格：${this.ownerPersonality.emotional_style}
- 專業領域：${this.ownerPersonality.expertise.join('、')}

用戶背景：
- ID: ${userContext.userId}
- 是否群組: ${userContext.isGroup ? '是' : '否'}
- 互動次數: ${userContext.profile?.messageCount || 0}
- 學習數據: ${userContext.learningData ? '已建立' : '新用戶'}

最近對話歷史：
${conversationHistory}

當前訊息：${message}

請用${this.ownerPersonality.name}的口吻和風格回覆，讓對方感覺就像在跟本人聊天。
回覆要求：
1. 自然親切，符合台灣大學生的說話方式
2. 如果是技術問題，展現專業熱忱
3. 適當使用語助詞讓對話更生動
4. 保持正面積極的態度
5. 回覆長度控制在150字以內，簡潔有力
6. 根據對話歷史調整回應風格

回覆內容：
`;

    try {
      if (!model) {
        throw new Error('Gemini AI 未初始化');
      }

      const result = await Utils.retryOperation(async () => {
        return await model.generateContent(personalityPrompt);
      });

      const response = result.response.text();
      
      // 學習用戶互動模式
      this.learnFromInteraction(userContext.userId, message, response);
      
      Memory.systemHealth.geminiApi = true;
      return response;
      
    } catch (error) {
      console.error('❌ Gemini AI 失敗:', error);
      Memory.systemHealth.geminiApi = false;
      
      try {
        const backupResponse = await this.useBackupAI(message, userContext);
        Memory.systemHealth.backupAi = true;
        return backupResponse;
      } catch (backupError) {
        console.error('❌ 備用 AI 也失敗:', backupError);
        Memory.systemHealth.backupAi = false;
        Memory.stats.errors++;
        return this.getFallbackResponse(message);
      }
    }
  }

  async useBackupAI(message, userContext) {
    if (!config.backupAiKey || !config.backupAiUrl) {
      throw new Error('備用 AI 未配置');
    }

    const response = await Utils.retryOperation(async () => {
      return await axios.post(`${config.backupAiUrl}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是${this.ownerPersonality.name}的AI分身。語言風格：${this.ownerPersonality.language_style}。要完全模擬他的說話方式和個性，用台灣大學生的口氣回應。保持親切、專業但不拘謹的風格。`
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 200,
        temperature: 0.8
      }, {
        headers: {
          'Authorization': `Bearer ${config.backupAiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: config.apiTimeout
      });
    });

    const aiResponse = response.data.choices[0].message.content;
    this.learnFromInteraction(userContext.userId, message, aiResponse);
    return aiResponse;
  }

  getFallbackResponse(message) {
    const responses = {
      greeting: ['哈囉！有什麼我可以幫你的嗎？', '嗨！今天過得怎麼樣？', '欸，你好呀！最近還好嗎？'],
      tech: ['這個技術問題很有趣欸！讓我想想...', '技術方面的話，我覺得可以這樣考慮', '哦這個問題確實需要仔細思考一下'],
      question: ['這個問題很好欸！', '讓我想想怎麼回答比較好...', '這確實是個值得討論的問題呢'],
      thanks: ['不客氣啦！', '哈哈，應該的！', '很高興能幫到你！'],
      problem: ['哎呀，我現在有點累，讓我休息一下再回你好嗎？', '系統有點忙，等等再跟你聊～', '抱歉，剛剛有點當機，現在好了！'],
      default: ['有意思！', '我想想怎麼回應比較好...', '這個話題挺有趣的', '確實是這樣呢', '對啊對啊！']
    };

    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('你好') || lowerMessage.includes('哈囉') || lowerMessage.includes('嗨')) {
      return this.randomChoice(responses.greeting);
    } else if (lowerMessage.includes('程式') || lowerMessage.includes('技術') || lowerMessage.includes('代碼') || lowerMessage.includes('bot')) {
      return this.randomChoice(responses.tech);
    } else if (lowerMessage.includes('謝謝') || lowerMessage.includes('感謝')) {
      return this.randomChoice(responses.thanks);
    } else if (lowerMessage.includes('?') || lowerMessage.includes('？') || lowerMessage.includes('怎麼') || lowerMessage.includes('什麼')) {
      return this.randomChoice(responses.question);
    } else if (lowerMessage.includes('錯誤') || lowerMessage.includes('壞了') || lowerMessage.includes('當機')) {
      return this.randomChoice(responses.problem);
    } else {
      return this.randomChoice(responses.default);
    }
  }

  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  learnFromInteraction(userId, userMessage, botResponse) {
    if (!Memory.learningData.has(userId)) {
      Memory.learningData.set(userId, {
        interactions: [],
        preferences: {},
        topics: new Set(),
        sentiment: 'neutral',
        responsePatterns: new Map(),
        lastInteraction: new Date()
      });
    }

    const userData = Memory.learningData.get(userId);
    userData.interactions.push({
      userMessage,
      botResponse,
      timestamp: new Date()
    });

    userData.lastInteraction = new Date();

    // 保持合理的記憶體使用量
    if (userData.interactions.length > config.maxLearningData) {
      userData.interactions = userData.interactions.slice(-Math.floor(config.maxLearningData * 0.8));
    }

    // 分析用戶偏好
    this.analyzeUserPreferences(userMessage, userData);
  }

  analyzeUserPreferences(message, userData) {
    // 分析技術相關興趣
    const techKeywords = ['程式', '代碼', '系統', '開發', '技術', 'API', 'Bot', 'AI', 'python', 'javascript', 'node.js'];
    const personalKeywords = ['朋友', '工作', '學校', '生活', '感覺', '想法', '心情'];
    const timeKeywords = ['提醒', '鬧鐘', '時間', '明天', '小時', '分鐘'];
    
    techKeywords.forEach(keyword => {
      if (message.toLowerCase().includes(keyword.toLowerCase())) {
        userData.topics.add('technology');
        userData.preferences.technology = (userData.preferences.technology || 0) + 1;
      }
    });

    personalKeywords.forEach(keyword => {
      if (message.includes(keyword)) {
        userData.topics.add('personal');
        userData.preferences.personal = (userData.preferences.personal || 0) + 1;
      }
    });

    timeKeywords.forEach(keyword => {
      if (message.includes(keyword)) {
        userData.topics.add('scheduling');
        userData.preferences.scheduling = (userData.preferences.scheduling || 0) + 1;
      }
    });

    // 分析情緒傾向
    if (message.includes('哈哈') || message.includes('😂') || message.includes('笑')) {
      userData.sentiment = 'positive';
    } else if (message.includes('生氣') || message.includes('煩') || message.includes('😡')) {
      userData.sentiment = 'negative';
    }
  }
}

// ==================== 提醒系統 ====================
class ReminderSystem {
  constructor(lineClient) {
    this.client = lineClient;
    this.startCheckingReminders();
  }

  startCheckingReminders() {
    setInterval(() => {
      this.checkAndTriggerReminders();
    }, 10000); // 每10秒檢查一次
  }

  parseTimeString(timeString, message) {
    const now = new Date();
    const patterns = [
      // 相對時間：30分鐘後、2小時後、10秒後
      {
        regex: /(\d+)秒後/,
        handler: (match) => new Date(now.getTime() + parseInt(match[1]) * 1000)
      },
      {
        regex: /(\d+)分鐘?後/,
        handler: (match) => new Date(now.getTime() + parseInt(match[1]) * 60000)
      },
      {
        regex: /(\d+)小時後/,
        handler: (match) => new Date(now.getTime() + parseInt(match[1]) * 3600000)
      },
      // 絕對時間：明天8點、今天下午3點
      {
        regex: /明天.*?(\d{1,2})[點時]/,
        handler: (match) => {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(parseInt(match[1]), 0, 0, 0);
          return tomorrow;
        }
      },
      {
        regex: /今天.*?(\d{1,2})[點時]/,
        handler: (match) => {
          const today = new Date(now);
          today.setHours(parseInt(match[1]), 0, 0, 0);
          if (today <= now) today.setDate(today.getDate() + 1);
          return today;
        }
      },
      // 具體時間：14:30、上午9點
      {
        regex: /(\d{1,2})[：:](\d{2})/,
        handler: (match) => {
          const target = new Date(now);
          target.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
          if (target <= now) target.setDate(target.getDate() + 1);
          return target;
        }
      },
      {
        regex: /上午(\d{1,2})[點時]/,
        handler: (match) => {
          const target = new Date(now);
          const hour = parseInt(match[1]);
          target.setHours(hour < 12 ? hour : hour, 0, 0, 0);
          if (target <= now) target.setDate(target.getDate() + 1);
          return target;
        }
      },
      {
        regex: /下午(\d{1,2})[點時]/,
        handler: (match) => {
          const target = new Date(now);
          const hour = parseInt(match[1]);
          target.setHours(hour === 12 ? 12 : hour + 12, 0, 0, 0);
          if (target <= now) target.setDate(target.getDate() + 1);
          return target;
        }
      },
      {
        regex: /(\d{1,2})[點時]/,
        handler: (match) => {
          const target = new Date(now);
          target.setHours(parseInt(match[1]), 0, 0, 0);
          if (target <= now) target.setDate(target.getDate() + 1);
          return target;
        }
      }
    ];

    for (const pattern of patterns) {
      const match = timeString.match(pattern.regex);
      if (match) {
        try {
          return pattern.handler(match);
        } catch (error) {
          console.error('時間解析錯誤:', error);
          continue;
        }
      }
    }
    
    return null;
  }

  async setReminder(userId, messageText) {
    const timeMatch = messageText.match(/(\d+秒後|\d+分鐘?後|\d+小時後|明天.*?\d{1,2}[點時]|今天.*?\d{1,2}[點時]|上午\d{1,2}[點時]|下午\d{1,2}[點時]|\d{1,2}[：:]\d{2}|\d{1,2}[點時])/);
    
    if (!timeMatch) {
      return FlexMessageBuilder.createErrorMessage(
        '無法識別時間格式。請使用如下格式：\n• 30秒後\n• 5分鐘後\n• 2小時後\n• 明天8點\n• 今天下午3點\n• 14:30',
        '⏰ 時間格式錯誤'
      );
    }

    const timeString = timeMatch[0];
    const targetTime = this.parseTimeString(timeString, messageText);
    
    if (!targetTime) {
      return FlexMessageBuilder.createErrorMessage(
        '時間解析失敗，請檢查時間格式',
        '⏰ 解析錯誤'
      );
    }

    if (targetTime <= new Date()) {
      return FlexMessageBuilder.createErrorMessage(
        '設定的時間已經過去了，請設定未來的時間',
        '⏰ 時間錯誤'
      );
    }

    const content = messageText.replace(timeString, '').replace(/提醒|鬧鐘|叫我/, '').trim() || '時間到了！';
    const reminderId = Utils.generateId('reminder');
    
    // 判斷是否為電話鬧鐘
    const isPhoneCall = content.includes('起床') || content.includes('電話') || messageText.includes('叫我起床') || messageText.includes('打電話');
    
    const reminderData = {
      id: reminderId,
      userId,
      content,
      targetTime,
      isPhoneCall,
      created: new Date(),
      status: 'active'
    };

    Memory.reminders.set(reminderId, reminderData);

    return FlexMessageBuilder.createReminderCard(reminderData);
  }

  async checkAndTriggerReminders() {
    const now = new Date();
    
    for (const [id, reminder] of Memory.reminders.entries()) {
      if (reminder.status === 'active' && now >= reminder.targetTime) {
        await this.triggerReminder(reminder);
        Memory.reminders.delete(id);
        Memory.stats.remindersTriggered++;
      }
    }
  }

  async triggerReminder(reminder) {
    try {
      let message;
      
      if (reminder.isPhoneCall && twilioClient && config.twilioPhoneNumber) {
        // 電話鬧鐘功能
        try {
          await this.makePhoneCall(reminder);
          message = FlexMessageBuilder.createSystemMessage(
            `📞 電話鬧鐘已觸發！\n\n📝 ${reminder.content}\n\n🕐 設定時間：${Utils.formatTime(reminder.targetTime)}\n\n✅ 電話已撥出`,
            '📞 電話鬧鐘'
          );
        } catch (phoneError) {
          console.error('電話撥打失敗:', phoneError);
          message = FlexMessageBuilder.createWarningMessage(
            `📞 電話鬧鐘觸發失敗\n\n📝 ${reminder.content}\n\n❌ 電話撥打失敗：${phoneError.message}`,
            '📞 電話鬧鐘錯誤'
          );
        }
      } else {
        message = FlexMessageBuilder.createSystemMessage(
          `⏰ 提醒時間到！\n\n📝 ${reminder.content}\n\n🕐 設定時間：${Utils.formatTime(reminder.targetTime)}`,
          '⏰ 提醒通知'
        );
      }
      
      await this.client.pushMessage(reminder.userId, message);
      console.log(`✅ 提醒已發送：${reminder.id}`);
      
    } catch (error) {
      console.error('❌ 提醒發送失敗:', error);
      Memory.stats.errors++;
    }
  }

  async makePhoneCall(reminder) {
    if (!twilioClient || !config.twilioPhoneNumber) {
      throw new Error('Twilio 服務未配置');
    }

    // 獲取用戶電話號碼（這裡需要實現獲取用戶電話的邏輯）
    const userProfile = Memory.userProfiles.get(reminder.userId);
    const phoneNumber = userProfile?.phoneNumber || '+886912345678'; // 預設號碼，實際應用需要用戶提供

    const call = await twilioClient.calls.create({
      twiml: `<Response><Say voice="alice" language="zh-TW">起床時間到了！${reminder.content}</Say><Pause length="2"/><Say voice="alice" language="zh-TW">這是您設定的鬧鐘提醒</Say></Response>`,
      to: phoneNumber,
      from: config.twilioPhoneNumber
    });

    console.log(`📞 電話鬧鐘已撥出：${call.sid}`);
    Memory.systemHealth.twilioService = true;
    return call;
  }

  listReminders(userId, isAdmin = false) {
    let reminders;
    
    if (isAdmin) {
      // 主人可以看到所有提醒
      reminders = Array.from(Memory.reminders.values())
        .filter(reminder => reminder.status === 'active')
        .sort((a, b) => a.targetTime - b.targetTime);
    } else {
      // 一般用戶只能看到自己的提醒
      reminders = Array.from(Memory.reminders.values())
        .filter(reminder => reminder.userId === userId && reminder.status === 'active')
        .sort((a, b) => a.targetTime - b.targetTime);
    }

    if (reminders.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        isAdmin ? '目前系統中沒有任何提醒' : '目前沒有設定任何提醒',
        '📋 提醒清單'
      );
    }

    const reminderList = reminders.map(reminder => {
      const timeLeft = reminder.targetTime - new Date();
      const timeString = timeLeft > 0 ? 
        `還有 ${Math.floor(timeLeft / 60000)} 分鐘` : 
        '即將觸發';
      
      let itemText = `${reminder.content}\n   ⏰ ${Utils.formatTime(reminder.targetTime)}\n   ⏳ ${timeString}`;
      
      if (reminder.isPhoneCall) {
        itemText += '\n   📞 電話鬧鐘';
      }
      
      if (isAdmin) {
        const userProfile = Memory.userProfiles.get(reminder.userId);
        const userName = userProfile?.displayName || reminder.userId;
        itemText += `\n   👤 ${userName}`;
      }
      
      itemText += `\n   🆔 ${reminder.id}`;
      
      return itemText;
    });

    return FlexMessageBuilder.createListCard('提醒清單', reminderList, '📋');
  }

  async cancelReminder(userId, reminderId) {
    const reminder = Memory.reminders.get(reminderId);
    
    if (!reminder) {
      return FlexMessageBuilder.createErrorMessage(
        '找不到指定的提醒',
        '❌ 取消失敗'
      );
    }

    if (reminder.userId !== userId && userId !== config.adminUserId) {
      return FlexMessageBuilder.createErrorMessage(
        '您沒有權限取消此提醒',
        '🔐 權限不足'
      );
    }

    Memory.reminders.delete(reminderId);
    
    return FlexMessageBuilder.createSystemMessage(
      `已成功取消提醒：${reminder.content}`,
      '✅ 取消成功'
    );
  }
}

// ==================== 決策系統 ====================
class DecisionSystem {
  constructor(lineClient) {
    this.client = lineClient;
    this.autoRejectTimeout = 30 * 60 * 1000; // 30分鐘
  }

  async requestDecision(requesterId, content, context = {}) {
    const decisionId = Utils.generateId('decision');
    
    // 獲取請求者資訊
    const requesterProfile = Memory.userProfiles.get(requesterId);
    const requesterName = requesterProfile?.displayName || requesterId;
    
    const decisionData = {
      id: decisionId,
      requester: requesterId,
      requesterName,
      content,
      context,
      timestamp: Utils.formatTime(new Date()),
      status: 'pending',
      created: new Date()
    };

    Memory.decisions.set(decisionId, decisionData);

    // 設定30分鐘後自動拒絕
    setTimeout(() => {
      this.autoRejectDecision(decisionId);
    }, this.autoRejectTimeout);

    // 發送決策請求給主人
    try {
      const decisionMessage = FlexMessageBuilder.createDecisionCard(decisionData);
      await this.client.pushMessage(config.adminUserId, decisionMessage);
      
      return FlexMessageBuilder.createSystemMessage(
        `✅ 已向主人發送決策請求\n\n📋 內容：${content}\n🆔 決策編號：${decisionId}\n⏰ 30分鐘後將自動拒絕`,
        '⚖️ 決策請求已發送'
      );
    } catch (error) {
      console.error('❌ 決策請求發送失敗:', error);
      Memory.decisions.delete(decisionId);
      Memory.stats.errors++;
      throw error;
    }
  }

  async handleDecisionResponse(decisionId, action, userId, details = '') {
    if (userId !== config.adminUserId) {
      return FlexMessageBuilder.createErrorMessage(
        '只有主人可以處理決策請求',
        '🔐 權限不足'
      );
    }

    const decision = Memory.decisions.get(decisionId);
    if (!decision) {
      return FlexMessageBuilder.createErrorMessage(
        '找不到指定的決策請求，可能已經過期或已處理',
        '❌ 決策不存在'
      );
    }

    if (decision.status !== 'pending') {
      return FlexMessageBuilder.createWarningMessage(
        `此決策已經處理過了，狀態：${decision.status}`,
        '⚠️ 重複處理'
      );
    }

    decision.status = action;
    decision.response = details;
    decision.responseTime = new Date();
    Memory.stats.decisionsHandled++;

    // 通知請求者
    try {
      const statusText = action === 'approved' ? '✅ 已同意' : '❌ 已拒絕';
      const resultMessage = FlexMessageBuilder.createSystemMessage(
        `⚖️ 決策結果：${statusText}\n\n📋 原請求：${decision.content}` +
        (details ? `\n💬 主人回覆：${details}` : '') +
        `\n🕐 處理時間：${Utils.formatTime(decision.responseTime)}`,
        '⚖️ 決策結果通知'
      );

      await this.client.pushMessage(decision.requester, resultMessage);
      
      return FlexMessageBuilder.createSystemMessage(
        `✅ 決策已處理並通知請求者\n\n🆔 決策編號：${decisionId}\n📋 結果：${statusText}\n👤 請求者：${decision.requesterName}`,
        '⚖️ 處理完成'
      );
    } catch (error) {
      console.error('❌ 決策結果通知失敗:', error);
      Memory.stats.errors++;
      return FlexMessageBuilder.createWarningMessage(
        '決策已處理但通知發送失敗',
        '⚠️ 部分成功'
      );
    }
  }

  async autoRejectDecision(decisionId) {
    const decision = Memory.decisions.get(decisionId);
    if (decision && decision.status === 'pending') {
      decision.status = 'auto_rejected';
      decision.responseTime = new Date();
      Memory.stats.decisionsHandled++;
      
      try {
        const timeoutMessage = FlexMessageBuilder.createWarningMessage(
          `⏰ 決策請求超時自動拒絕\n\n📋 原請求：${decision.content}\n🕐 請求時間：${decision.timestamp}\n⏰ 超時時間：${Utils.formatTime(decision.responseTime)}`,
          '⏰ 決策超時'
        );
        
        await this.client.pushMessage(decision.requester, timeoutMessage);
        console.log(`⏰ 決策自動拒絕：${decisionId}`);
      } catch (error) {
        console.error('❌ 超時通知發送失敗:', error);
        Memory.stats.errors++;
      }
    }
  }

  getDecisionDetails(decisionId) {
    const decision = Memory.decisions.get(decisionId);
    if (!decision) {
      return FlexMessageBuilder.createErrorMessage(
        '找不到指定的決策',
        '❌ 決策不存在'
      );
    }

    const statusMap = {
      'pending': '⏳ 等待處理',
      'approved': '✅ 已同意',
      'rejected': '❌ 已拒絕',
      'auto_rejected': '⏰ 超時拒絕'
    };

    const details = [
      `🆔 編號：${decision.id}`,
      `👤 請求者：${decision.requesterName}`,
      `📋 內容：${decision.content}`,
      `📊 狀態：${statusMap[decision.status]}`,
      `🕐 請求時間：${decision.timestamp}`
    ];

    if (decision.responseTime) {
      details.push(`⏰ 處理時間：${Utils.formatTime(decision.responseTime)}`);
    }

    if (decision.response) {
      details.push(`💬 主人回覆：${decision.response}`);
    }

    if (decision.context && Object.keys(decision.context).length > 0) {
      details.push(`📄 附加資訊：${JSON.stringify(decision.context, null, 2)}`);
    }

    return FlexMessageBuilder.createListCard('決策詳情', details, '⚖️');
  }

  listPendingDecisions() {
    const pendingDecisions = Array.from(Memory.decisions.values())
      .filter(d => d.status === 'pending')
      .sort((a, b) => a.created - b.created);

    if (pendingDecisions.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '目前沒有待處理的決策',
        '⚖️ 決策待辦'
      );
    }

    const decisionList = pendingDecisions.map(decision => {
      const waitTime = Math.floor((Date.now() - decision.created) / 60000);
      const remainingTime = Math.max(0, 30 - waitTime);
      
      return `${decision.content}\n   👤 ${decision.requesterName}\n   ⏰ 等待 ${waitTime} 分鐘\n   ⏳ 剩餘 ${remainingTime} 分鐘\n   🆔 ${decision.id}`;
    });

    return FlexMessageBuilder.createListCard('決策待辦', decisionList, '⚖️');
  }

  getDecisionHistory(limit = 10) {
    const allDecisions = Array.from(Memory.decisions.values())
      .filter(d => d.status !== 'pending')
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, limit);

    if (allDecisions.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '目前沒有決策歷史',
        '📋 決策歷史'
      );
    }

    const statusMap = {
      'approved': '✅ 已同意',
      'rejected': '❌ 已拒絕',
      'auto_rejected': '⏰ 超時拒絕'
    };

    const historyList = allDecisions.map((decision, index) => {
      return `${decision.content}\n   👤 ${decision.requesterName}\n   📊 ${statusMap[decision.status]}\n   🕐 ${Utils.formatTime(decision.responseTime)}\n   🆔 ${decision.id}`;
    });

    return FlexMessageBuilder.createListCard('決策歷史', historyList, '📋');
  }
}

// ==================== 搜尋系統 ====================
class SearchSystem {
  async searchWeb(query) {
    try {
      Memory.stats.apiCalls++;
      
      if (config.searchApiKey && config.searchEngineId) {
        const response = await Utils.retryOperation(async () => {
          return await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
              key: config.searchApiKey,
              cx: config.searchEngineId,
              q: query,
              num: 5
            },
            timeout: config.apiTimeout
          });
        });

        const items = response.data.items || [];
        const results = items.map((item, index) => 
          `${item.title}\n   🔗 ${item.link}\n   📝 ${Utils.truncateText(item.snippet, 80)}`
        );

        return FlexMessageBuilder.createListCard(`網路搜尋：${query}`, results, '🔍');
      } else {
        // 模擬搜尋結果
        const mockResults = [
          `關於「${query}」的相關資訊：`,
          '• 建議使用更具體的關鍵詞',
          '• 可以嘗試不同的搜尋角度',
          '• 搜尋功能需要設定 Google API'
        ];

        return FlexMessageBuilder.createListCard(`搜尋結果：${query}`, mockResults, '🔍');
      }
    } catch (error) {
      console.error('❌ 網路搜尋失敗:', error);
      Memory.stats.errors++;
      return FlexMessageBuilder.createErrorMessage(
        '搜尋功能暫時無法使用，請稍後再試',
        '🔍 搜尋錯誤'
      );
    }
  }

  async getWeather(location = '台中') {
    try {
      Memory.stats.apiCalls++;
      
      if (!config.weatherApiKey) {
        throw new Error('天氣 API 未設定');
      }

      const response = await Utils.retryOperation(async () => {
        return await axios.get(
          'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001',
          {
            params: {
              Authorization: config.weatherApiKey,
              locationName: location
            },
            timeout: config.apiTimeout
          }
        );
      });

      const locationData = response.data.records.location.find(
        loc => loc.locationName === location
      );

      if (!locationData) {
        throw new Error('找不到指定地點的天氣資料');
      }

      const weatherElement = locationData.weatherElement;
      const weather = weatherElement.find(el => el.elementName === 'Wx');
      const minTemp = weatherElement.find(el => el.elementName === 'MinT');
      const maxTemp = weatherElement.find(el => el.elementName === 'MaxT');
      const pop = weatherElement.find(el => el.elementName === 'PoP');

      const weatherData = {
        location,
        condition: weather?.time[0]?.parameter?.parameterName || '未知',
        temperature: `${minTemp?.time[0]?.parameter?.parameterName || '?'} - ${maxTemp?.time[0]?.parameter?.parameterName || '?'}`,
        windSpeed: '微風',
        humidity: `${pop?.time[0]?.parameter?.parameterName || '?'}%`
      };

      return FlexMessageBuilder.createWeatherCard(weatherData);
      
    } catch (error) {
      console.error('❌ 天氣查詢失敗:', error);
      Memory.stats.errors++;
      
      // 提供備用天氣資訊
      const mockWeatherData = {
        location,
        condition: '多雲時晴',
        temperature: '22 - 28',
        windSpeed: '輕風',
        humidity: '65'
      };

      return FlexMessageBuilder.createWeatherCard(mockWeatherData);
    }
  }

  async getNews(category = 'general') {
    try {
      Memory.stats.apiCalls++;
      
      if (config.newsApiKey) {
        const response = await Utils.retryOperation(async () => {
          return await axios.get('https://newsapi.org/v2/top-headlines', {
            params: {
              apiKey: config.newsApiKey,
              country: 'tw',
              category: category,
              pageSize: 5
            },
            timeout: config.apiTimeout
          });
        });

        const articles = response.data.articles || [];
        const newsList = articles.map(article => ({
          title: article.title,
          date: new Date(article.publishedAt).toLocaleDateString('zh-TW'),
          summary: Utils.truncateText(article.description || '無摘要', 100)
        }));

        return FlexMessageBuilder.createNewsCard(newsList);
      } else {
        const mockNews = [
          { title: '科技新聞 - AI技術突破', date: '今天', summary: '人工智能領域又有重大進展...' },
          { title: '台灣經濟 - 半導體產業', date: '今天', summary: '台灣半導體產業持續成長...' },
          { title: '國際新聞 - 氣候變遷', date: '昨天', summary: '全球氣候議題受到關注...' }
        ];

        return FlexMessageBuilder.createNewsCard(mockNews);
      }
    } catch (error) {
      console.error('❌ 新聞查詢失敗:', error);
      Memory.stats.errors++;
      return FlexMessageBuilder.createErrorMessage(
        '新聞查詢功能暫時無法使用',
        '📰 新聞錯誤'
      );
    }
  }

  async getMovieRecommendations() {
    try {
      Memory.stats.apiCalls++;
      
      if (config.tmdbApiKey) {
        const response = await Utils.retryOperation(async () => {
          return await axios.get('https://api.themoviedb.org/3/movie/popular', {
            params: {
              api_key: config.tmdbApiKey,
              language: 'zh-TW',
              page: 1
            },
            timeout: config.apiTimeout
          });
        });

        const movies = response.data.results.slice(0, 5).map(movie => ({
          title: movie.title,
          rating: movie.vote_average,
          year: new Date(movie.release_date).getFullYear(),
          genre: '動作/劇情' // 簡化處理
        }));

        return FlexMessageBuilder.createMovieCard(movies);
      } else {
        const mockMovies = [
          { title: '復仇者聯盟：終局之戰', rating: 8.4, year: 2019, genre: '動作/科幻' },
          { title: '寄生上流', rating: 8.6, year: 2019, genre: '劇情/驚悚' },
          { title: '你的名字', rating: 8.2, year: 2016, genre: '動畫/愛情' },
          { title: '玩具總動員4', rating: 7.7, year: 2019, genre: '動畫/家庭' },
          { title: '小丑', rating: 8.4, year: 2019, genre: '劇情/犯罪' }
        ];

        return FlexMessageBuilder.createMovieCard(mockMovies);
      }
    } catch (error) {
      console.error('❌ 電影推薦失敗:', error);
      Memory.stats.errors++;
      return FlexMessageBuilder.createErrorMessage(
        '電影推薦功能暫時無法使用',
        '🎬 電影錯誤'
      );
    }
  }
}

// ==================== 矛盾偵測系統 ====================
class ContradictionDetector {
  constructor(lineClient) {
    this.client = lineClient;
  }

  async detectContradiction(userId, newMessage, conversationHistory) {
    if (!model || conversationHistory.length < 3) {
      return; // 對話太少，無法偵測矛盾
    }

    try {
      Memory.stats.apiCalls++;
      
      const prompt = `
請分析以下對話，判斷新訊息是否與之前的內容有明顯矛盾：

對話歷史：
${conversationHistory.join('\n')}

新訊息：${newMessage}

分析要求：
1. 只關注明顯的事實性矛盾或態度矛盾
2. 不要把正常的意見變化當作矛盾
3. 重點關注關鍵決定或重要事實的前後不一致

如果發現明顯矛盾，請回覆"CONTRADICTION_FOUND: [具體描述矛盾之處，不超過50字]"
如果沒有矛盾，請回覆"NO_CONTRADICTION"

矛盾判斷標準：
1. 事實性矛盾（前後說法完全相反）
2. 重要決定的矛盾（先說要做A，後來說不做A）
3. 身份資訊矛盾（工作、學校等基本資訊前後不符）
`;

      const result = await Utils.retryOperation(async () => {
        return await model.generateContent(prompt);
      });

      const response = result.response.text();
      
      if (response.includes('CONTRADICTION_FOUND:')) {
        await this.reportContradiction(userId, newMessage, response);
        Memory.stats.contradictionsDetected++;
      }
    } catch (error) {
      console.error('❌ 矛盾偵測失敗:', error);
      Memory.stats.errors++;
    }
  }

  async reportContradiction(userId, message, analysis) {
    try {
      const userProfile = Memory.userProfiles.get(userId);
      const userName = userProfile?.displayName || userId;
      
      const contradictionReport = FlexMessageBuilder.createWarningMessage(
        `⚠️ 偵測到用戶發言矛盾\n\n👤 用戶：${userName}\n💬 最新訊息：${Utils.truncateText(message, 80)}\n🔍 矛盾分析：${analysis.replace('CONTRADICTION_FOUND:', '').trim()}\n🕐 偵測時間：${Utils.formatTime(new Date())}`,
        '⚠️ 矛盾偵測警告'
      );

      await this.client.pushMessage(config.adminUserId, contradictionReport);
      
      // 記錄矛盾
      const contradictionId = Utils.generateId('contradiction');
      Memory.contradictions.set(contradictionId, {
        id: contradictionId,
        userId,
        userName,
        message,
        analysis,
        timestamp: new Date()
      });

      console.log(`⚠️ 矛盾偵測：${userId} - ${Utils.truncateText(message, 50)}`);
    } catch (error) {
      console.error('❌ 矛盾報告發送失敗:', error);
      Memory.stats.errors++;
    }
  }

  getContradictionHistory(limit = 10) {
    const contradictions = Array.from(Memory.contradictions.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    if (contradictions.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '目前沒有矛盾記錄',
        '⚠️ 矛盾歷史'
      );
    }

    const contradictionList = contradictions.map(contradiction => {
      return `${contradiction.userName}\n   💬 ${Utils.truncateText(contradiction.message, 60)}\n   🔍 ${contradiction.analysis.replace('CONTRADICTION_FOUND:', '').trim()}\n   🕐 ${Utils.formatTime(contradiction.timestamp)}`;
    });

    return FlexMessageBuilder.createListCard('矛盾偵測歷史', contradictionList, '⚠️');
  }
}

// ==================== 訊息收回追蹤系統 ====================
class MessageRecallTracker {
  constructor(lineClient) {
    this.client = lineClient;
  }

  trackMessage(event) {
    const userId = event.source.userId || event.source.groupId;
    const messageId = event.message.id;
    const messageText = event.message.text;
    const timestamp = new Date(event.timestamp);

    if (!Memory.messageHistory.has(userId)) {
      Memory.messageHistory.set(userId, []);
    }

    const userHistory = Memory.messageHistory.get(userId);
    userHistory.push({
      messageId,
      messageText,
      timestamp,
      recalled: false
    });

    // 保持最近100條訊息
    if (userHistory.length > 100) {
      userHistory.splice(0, userHistory.length - 100);
    }
  }

  async handleUnsendEvent(event) {
    const userId = event.source.userId || event.source.groupId;
    const messageId = event.unsend.messageId;

    const userHistory = Memory.messageHistory.get(userId);
    if (!userHistory) return;

    const recalledMessage = userHistory.find(msg => msg.messageId === messageId);
    if (!recalledMessage) return;

    recalledMessage.recalled = true;
    recalledMessage.recallTime = new Date();

    // 記錄收回事件
    const recallId = Utils.generateId('recall');
    Memory.recalledMessages.set(recallId, {
      id: recallId,
      userId,
      messageId,
      originalText: recalledMessage.messageText,
      originalTime: recalledMessage.timestamp,
      recallTime: recalledMessage.recallTime
    });

    // 通知主人
    try {
      const userProfile = Memory.userProfiles.get(userId);
      const userName = userProfile?.displayName || userId;

      const recallNotification = FlexMessageBuilder.createWarningMessage(
        `📱 用戶收回了一則訊息\n\n👤 用戶：${userName}\n💬 原始內容：「${recalledMessage.messageText}」\n🕐 發送時間：${Utils.formatTime(recalledMessage.timestamp)}\n⏰ 收回時間：${Utils.formatTime(recalledMessage.recallTime)}`,
        '📱 訊息收回通知'
      );

      await this.client.pushMessage(config.adminUserId, recallNotification);
      console.log(`📱 訊息收回追蹤：${userId} - ${Utils.truncateText(recalledMessage.messageText, 50)}`);
    } catch (error) {
      console.error('❌ 訊息收回通知發送失敗:', error);
      Memory.stats.errors++;
    }
  }

  getRecallHistory(limit = 10) {
    const recalls = Array.from(Memory.recalledMessages.values())
      .sort((a, b) => b.recallTime - a.recallTime)
      .slice(0, limit);

    if (recalls.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '目前沒有訊息收回記錄',
        '📱 收回歷史'
      );
    }

    const recallList = recalls.map(recall => {
      const userProfile = Memory.userProfiles.get(recall.userId);
      const userName = userProfile?.displayName || recall.userId;
      
      return `${userName}\n   💬 「${Utils.truncateText(recall.originalText, 60)}」\n   🕐 發送：${Utils.formatTime(recall.originalTime)}\n   ⏰ 收回：${Utils.formatTime(recall.recallTime)}`;
    });

    return FlexMessageBuilder.createListCard('訊息收回歷史', recallList, '📱');
  }
}

// ==================== 系統管理 ====================
class SystemManager {
  static async handleSystemCommand(command, userId) {
    if (userId !== config.adminUserId) {
      return FlexMessageBuilder.createErrorMessage(
        '此功能僅限主人使用',
        '🔐 權限不足'
      );
    }

    try {
      switch (command) {
        case '/狀態報告':
          return FlexMessageBuilder.createStatusCard(Memory.stats);
        
        case '/提醒清單':
          return bot.reminderSystem.listReminders(userId, true);
        
        case '/決策待辦':
          return bot.decisionSystem.listPendingDecisions();
        
        case '/決策歷史':
          return bot.decisionSystem.getDecisionHistory();
        
        case '/用戶活躍':
          return this.getUserActivity();
        
        case '/系統統計':
          return this.getSystemAnalytics();
        
        case '/功能列表':
          return this.getFunctionList();
        
        case '/矛盾歷史':
          return bot.contradictionDetector.getContradictionHistory();
        
        case '/收回歷史':
          return bot.messageRecallTracker.getRecallHistory();
        
        case '/系統健康':
          return this.getSystemHealth();
        
        case '/清除歷史':
          return this.clearHistory();
        
        case '/清除對話':
          return this.clearConversations();
        
        case '/清除提醒':
          return this.clearReminders();
        
        case '/系統重啟':
          return this.restartSystem();
        
        case '/說明':
          return FlexMessageBuilder.createHelpCard();
        
        default:
          return this.getAvailableCommands();
      }
    } catch (error) {
      console.error('❌ 系統指令處理失敗:', error);
      Memory.stats.errors++;
      return FlexMessageBuilder.createErrorMessage(
        `系統指令執行失敗：${error.message}`,
        '❌ 執行錯誤'
      );
    }
  }

  static getUserActivity() {
    const users = Array.from(Memory.userProfiles.values())
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
      .slice(0, 15); // 顯示前15個用戶

    if (users.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '暫無用戶活動記錄',
        '👥 用戶活躍度'
      );
    }

    const userList = users.map((user, index) => {
      const lastSeen = user.lastSeen ? Utils.formatTime(user.lastSeen) : '從未';
      const isActive = user.lastSeen && (Date.now() - user.lastSeen) < 24 * 60 * 60 * 1000;
      const statusIcon = isActive ? '🟢' : '🔴';
      
      return `${statusIcon} ${user.displayName || user.id}\n   💬 ${user.messageCount || 0} 則訊息\n   🕐 最後活躍：${lastSeen}\n   📊 類型：${user.isGroup ? '群組' : '個人'}`;
    });

    return FlexMessageBuilder.createListCard('用戶活躍度排行', userList, '👥');
  }

  static getSystemAnalytics() {
    const uptime = Math.floor((Date.now() - Memory.stats.startTime) / 3600000);
    const memoryUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const memoryTotal = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
    
    const analytics = [
      `📊 總訊息處理：${Memory.stats.totalMessages} 則`,
      `👥 註冊用戶：${Memory.userProfiles.size} 人`,
      `⏰ 活躍提醒：${Memory.reminders.size} 個`,
      `⚖️ 歷史決策：${Memory.decisions.size} 個`,
      `⚠️ 矛盾記錄：${Memory.contradictions.size} 次`,
      `📱 收回追蹤：${Memory.recalledMessages.size} 次`,
      `📈 API 呼叫：${Memory.stats.apiCalls} 次`,
      `❌ 錯誤次數：${Memory.stats.errors} 次`,
      `⚖️ 處理決策：${Memory.stats.decisionsHandled} 個`,
      `⏰ 觸發提醒：${Memory.stats.remindersTriggered} 次`,
      `⚠️ 偵測矛盾：${Memory.stats.contradictionsDetected} 次`,
      `🕒 運行時間：${uptime} 小時`,
      `💾 記憶體使用：${memoryUsed}/${memoryTotal} MB`,
      `🧠 學習數據：${Memory.learningData.size} 個用戶`,
      `📚 平均對話長度：${Memory.conversations.size > 0 ? Math.round(Array.from(Memory.conversations.values()).reduce((sum, conv) => sum + conv.length, 0) / Memory.conversations.size) : 0} 則`
    ];

    return FlexMessageBuilder.createListCard('系統分析報告', analytics, '📊');
  }

  static getFunctionList() {
    const functions = [
      '🤖 超擬真 AI 聊天（完全模擬主人風格）',
      '📱 全圖文訊息回覆（視覺化介面）',
      '⏰ 智能提醒系統（秒/分/時/日期）',
      '📞 電話鬧鐘功能（Twilio整合）',
      '⚖️ 決策管理系統（私訊確認）',
      '🔍 搜尋與查詢功能（網路/天氣/新聞）',
      '🎬 電影推薦系統（評分排行）',
      '📰 新聞摘要服務（即時更新）',
      '⚠️ 矛盾偵測系統（AI分析）',
      '📱 訊息收回追蹤（完整記錄）',
      '👥 用戶管理系統（活躍度分析）',
      '📊 系統監控面板（即時統計）',
      '🔧 自我修復機制（錯誤恢復）',
      '🧠 學習系統（個性優化）',
      '🛡️ 安全防護（頻率限制）',
      '💾 記憶體管理（智能清理）'
    ];

    return FlexMessageBuilder.createListCard('完整功能列表', functions, '🎯');
  }

  static getSystemHealth() {
    const health = Memory.systemHealth;
    const statusIcon = (status) => status ? '✅' : '❌';
    
    const healthReport = [
      `${statusIcon(health.geminiApi)} Gemini AI 服務`,
      `${statusIcon(health.backupAi)} 備用 AI 服務`,
      `${statusIcon(health.twilioService)} Twilio 電話服務`,
      `${statusIcon(config.weatherApiKey)} 天氣 API 服務`,
      `${statusIcon(config.newsApiKey)} 新聞 API 服務`,
      `${statusIcon(config.tmdbApiKey)} 電影 API 服務`,
      `${statusIcon(config.searchApiKey)} 搜尋 API 服務`,
      `📊 系統負載：${Memory.stats.errors < 10 ? '正常' : '偏高'}`,
      `💾 記憶體狀態：${process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? '正常' : '偏高'}`,
      `🕐 最後檢查：${Utils.formatTime(health.lastHealthCheck)}`
    ];

    return FlexMessageBuilder.createListCard('系統健康狀態', healthReport, '🏥');
  }

  static clearHistory() {
    const historyCount = Memory.conversations.size;
    Memory.conversations.clear();
    
    return FlexMessageBuilder.createSystemMessage(
      `✅ 已清除 ${historyCount} 個用戶的對話歷史`,
      '🗑️ 清除完成'
    );
  }

  static clearConversations() {
    const conversationCount = Memory.conversations.size;
    const messageCount = Memory.messageHistory.size;
    
    Memory.conversations.clear();
    Memory.messageHistory.clear();
    Memory.recalledMessages.clear();
    
    return FlexMessageBuilder.createSystemMessage(
      `✅ 已清除 ${conversationCount} 個對話記錄和 ${messageCount} 個訊息歷史`,
      '🗑️ 清除對話'
    );
  }

  static clearReminders() {
    const reminderCount = Memory.reminders.size;
    Memory.reminders.clear();
    
    return FlexMessageBuilder.createSystemMessage(
      `✅ 已清除 ${reminderCount} 個提醒`,
      '🗑️ 清除提醒'
    );
  }

  static async restartSystem() {
    try {
      // 清理部分記憶體
      Memory.rateLimiter.clear();
      
      // 重新檢查系統健康
      Memory.systemHealth.lastHealthCheck = new Date();
      
      // 重置錯誤計數
      Memory.stats.errors = 0;
      
      return FlexMessageBuilder.createSystemMessage(
        '✅ 系統已重新啟動\n\n🔄 已清理頻率限制\n🏥 已重置健康檢查\n📊 已重置錯誤計數',
        '🔄 系統重啟'
      );
    } catch (error) {
      console.error('❌ 系統重啟失敗:', error);
      return FlexMessageBuilder.createErrorMessage(
        `系統重啟失敗：${error.message}`,
        '❌ 重啟錯誤'
      );
    }
  }

  static getAvailableCommands() {
    const commands = [
      '/狀態報告 - 系統運行總覽',
      '/提醒清單 - 所有用戶提醒',
      '/決策待辦 - 待處理決策',
      '/決策歷史 - 決策處理記錄',
      '/用戶活躍 - 用戶活動排行',
      '/系統統計 - 詳細分析報告',
      '/功能列表 - 完整功能清單',
      '/矛盾歷史 - 矛盾偵測記錄',
      '/收回歷史 - 訊息收回記錄',
      '/系統健康 - 服務狀態檢查',
      '/清除歷史 - 清理對話記錄',
      '/清除對話 - 清除所有對話',
      '/清除提醒 - 清除所有提醒',
      '/系統重啟 - 重新啟動系統',
      '/說明 - 使用說明手冊'
    ];

    return FlexMessageBuilder.createListCard('系統管理指令', commands, '🔧');
  }
}

// ==================== 主要 Bot 類別 ====================
class SuperIntelligentLineBot {
  constructor() {
    this.aiPersonality = new AIPersonalitySystem();
    this.reminderSystem = new ReminderSystem(client);
    this.decisionSystem = new DecisionSystem(client);
    this.searchSystem = new SearchSystem();
    this.contradictionDetector = new ContradictionDetector(client);
    this.messageRecallTracker = new MessageRecallTracker(client);
  }

  async handleMessage(event) {
    const { message, source, replyToken } = event;
    const userId = source.userId || source.groupId;
    const messageText = message.text;

    console.log(`👤 收到訊息 [${userId.substring(0, 8)}...]: ${Utils.truncateText(messageText, 50)}`);
    Memory.stats.totalMessages++;

    try {
      // 頻率限制檢查
      if (!Utils.checkRateLimit(userId)) {
        console.log('⚠️ 頻率限制觸發:', userId.substring(0, 8));
        const rateLimitMessage = FlexMessageBuilder.createWarningMessage(
          '哎呀，你的訊息有點太頻繁了！讓我休息一下，等等再聊吧～ 😅',
          '⚡ 訊息頻率限制'
        );
        return await this.safeReply(replyToken, rateLimitMessage);
      }

      // 記錄訊息和更新用戶資料
      this.recordMessage(userId, messageText, source);
      this.updateUserProfile(userId, source);
      
      // 追蹤訊息（用於收回偵測）
      this.messageRecallTracker.trackMessage(event);

      // 系統指令處理
      if (messageText.startsWith('/')) {
        console.log('⚡ 處理系統指令:', messageText);
        const response = await SystemManager.handleSystemCommand(messageText, userId);
        return await this.safeReply(replyToken, response);
      }

      // 決策回應處理
      if (messageText.includes('決策同意') || messageText.includes('決策拒絕')) {
        console.log('⚖️ 處理決策回應:', messageText);
        const response = await this.handleDecisionResponse(messageText, userId);
        return await this.safeReply(replyToken, response);
      }

      // 決策詳情查詢
      if (messageText.includes('決策詳情')) {
        console.log('📋 查詢決策詳情:', messageText);
        const response = await this.handleDecisionDetails(messageText);
        return await this.safeReply(replyToken, response);
      }

      // 提醒相關處理
      if (this.isReminderRequest(messageText)) {
        console.log('⏰ 處理提醒請求:', messageText);
        const response = await this.handleReminderRequest(messageText, userId);
        return await this.safeReply(replyToken, response);
      }

      // 取消提醒處理
      if (messageText.includes('取消提醒')) {
        console.log('❌ 處理取消提醒:', messageText);
        const response = await this.handleCancelReminder(messageText, userId);
        return await this.safeReply(replyToken, response);
      }

      // 搜尋請求處理
      if (this.isSearchRequest(messageText)) {
        console.log('🔍 處理搜尋請求:', messageText);
        const response = await this.handleSearchRequest(messageText);
        return await this.safeReply(replyToken, response);
      }

      // 一般 AI 對話
      console.log('🤖 處理 AI 對話');
      const response = await this.handleAIConversation(messageText, userId, source);
      return await this.safeReply(replyToken, response);

    } catch (error) {
      console.error('❌ 訊息處理錯誤:', error);
      Memory.stats.errors++;
      
      const errorResponse = FlexMessageBuilder.createErrorMessage(
        '哎呀，我遇到一點小問題，讓我重新整理一下思緒... 🤔',
        '🤖 系統錯誤'
      );
      return await this.safeReply(replyToken, errorResponse);
    }
  }

  async handleUnsendEvent(event) {
    console.log('📱 處理訊息收回事件');
    await this.messageRecallTracker.handleUnsendEvent(event);
  }

  async safeReply(replyToken, message) {
    try {
      await client.replyMessage(replyToken, message);
      console.log('✅ 回覆發送成功');
    } catch (error) {
      console.error('❌ 回覆發送失敗:', error);
      if (error.statusCode === 400) {
        console.log('🔄 ReplyToken 可能已過期或已使用');
      }
      Memory.stats.errors++;
      throw error;
    }
  }

  recordMessage(userId, messageText, source) {
    if (!Memory.conversations.has(userId)) {
      Memory.conversations.set(userId, []);
    }
    
    const conversation = Memory.conversations.get(userId);
    conversation.push({
      message: messageText,
      timestamp: new Date(),
      type: 'user',
      isGroup: source.type === 'group'
    });

    // 根據群組或個人聊天設定不同的記憶長度
    const maxMessages = source.type === 'group' ? config.maxGroupHistory : config.maxPersonalHistory;
    if (conversation.length > maxMessages) {
      conversation.splice(0, conversation.length - maxMessages);
    }
  }

  updateUserProfile(userId, source) {
    if (!Memory.userProfiles.has(userId)) {
      Memory.userProfiles.set(userId, {
        id: userId,
        isGroup: source.type === 'group',
        firstSeen: new Date(),
        messageCount: 0,
        preferences: {},
        displayName: null,
        phoneNumber: null
      });
      Memory.stats.totalUsers++;
    }

    const profile = Memory.userProfiles.get(userId);
    profile.lastSeen = new Date();
    profile.messageCount = (profile.messageCount || 0) + 1;
    
    // 如果是第一次交互，嘗試獲取用戶資訊
    if (!profile.displayName && source.userId) {
      this.fetchUserProfile(source.userId).catch(console.error);
    }
  }

  async fetchUserProfile(userId) {
    try {
      const profile = await client.getProfile(userId);
      const userProfile = Memory.userProfiles.get(userId);
      if (userProfile) {
        userProfile.displayName = profile.displayName;
        userProfile.pictureUrl = profile.pictureUrl;
      }
    } catch (error) {
      console.error('❌ 獲取用戶資料失敗:', error);
      Memory.stats.errors++;
    }
  }

  isReminderRequest(message) {
    const reminderKeywords = ['提醒', '鬧鐘', '叫我', '分鐘後', '小時後', '秒後', '明天', '今天', '點叫', '起床', '電話叫'];
    return reminderKeywords.some(keyword => message.includes(keyword));
  }

  isSearchRequest(message) {
    const searchKeywords = ['搜尋', '查', '天氣', '新聞', '電影', '推薦', '找'];
    return searchKeywords.some(keyword => message.includes(keyword));
  }

  async handleReminderRequest(messageText, userId) {
    return await this.reminderSystem.setReminder(userId, messageText);
  }

  async handleCancelReminder(messageText, userId) {
    const reminderIdMatch = messageText.match(/取消提醒\s+(\w+)/);
    if (!reminderIdMatch) {
      return FlexMessageBuilder.createErrorMessage(
        '請提供要取消的提醒編號，例如：\n取消提醒 reminder_123',
        '❌ 格式錯誤'
      );
    }

    const reminderId = reminderIdMatch[1];
    return await this.reminderSystem.cancelReminder(userId, reminderId);
  }

  async handleSearchRequest(messageText) {
    if (messageText.includes('天氣')) {
      const locationMatch = messageText.match(/(台中|台北|高雄|台南|新竹|桃園|嘉義|台東|花蓮|宜蘭|基隆|彰化|雲林|屏東|南投|苗栗|金門|澎湖|新北|台灣)/);
      const location = locationMatch ? locationMatch[0] : '台中';
      return await this.searchSystem.getWeather(location);
    } else if (messageText.includes('新聞')) {
      return await this.searchSystem.getNews();
    } else if (messageText.includes('電影') || messageText.includes('推薦')) {
      return await this.searchSystem.getMovieRecommendations();
    } else {
      const query = messageText.replace(/搜尋|查|找/, '').trim();
      return await this.searchSystem.searchWeb(query);
    }
  }

  async handleDecisionResponse(messageText, userId) {
    const decisionMatch = messageText.match(/決策(同意|拒絕)\s+(\w+)(?:\s+(.+))?/);
    if (!decisionMatch) {
      return FlexMessageBuilder.createErrorMessage(
        '決策格式錯誤。正確格式：\n決策同意 decision_123\n決策拒絕 decision_123 原因',
        '⚖️ 格式錯誤'
      );
    }

    const [, action, decisionId, details] = decisionMatch;
    const actionType = action === '同意' ? 'approved' : 'rejected';
    
    return await this.decisionSystem.handleDecisionResponse(decisionId, actionType, userId, details || '');
  }

  async handleDecisionDetails(messageText) {
    const detailsMatch = messageText.match(/決策詳情\s+(\w+)/);
    if (!detailsMatch) {
      return FlexMessageBuilder.createErrorMessage(
        '請提供決策編號，例如：決策詳情 decision_123',
        '❌ 格式錯誤'
      );
    }

    const decisionId = detailsMatch[1];
    return this.decisionSystem.getDecisionDetails(decisionId);
  }

  async handleAIConversation(messageText, userId, source) {
    const conversationHistory = this.getConversationHistory(userId);
    const userContext = {
      userId,
      profile: Memory.userProfiles.get(userId) || {},
      isGroup: source.type === 'group',
      learningData: Memory.learningData.get(userId)
    };

    // 異步矛盾偵測（不阻塞回覆）
    if (conversationHistory.length > 2) {
      this.contradictionDetector.detectContradiction(userId, messageText, conversationHistory)
        .catch(error => console.error('⚠️ 矛盾偵測失敗:', error));
    }

    try {
      // 生成個性化回覆
      const aiResponse = await this.aiPersonality.generatePersonalizedResponse(
        messageText, userContext, conversationHistory.join('\n')
      );

      // 記錄 AI 回覆
      const conversation = Memory.conversations.get(userId);
      if (conversation) {
        conversation.push({
          message: aiResponse,
          timestamp: new Date(),
          type: 'bot'
        });
      }

      return FlexMessageBuilder.createChatResponse(aiResponse);
    } catch (error) {
      console.error('❌ AI 對話處理失敗:', error);
      Memory.stats.errors++;
      
      return FlexMessageBuilder.createErrorMessage(
        '抱歉，我現在有點累了，等等再聊好嗎？ 😴',
        '🤖 AI 暫時無法回應'
      );
    }
  }

  getConversationHistory(userId) {
    const conversation = Memory.conversations.get(userId) || [];
    return conversation.slice(-10).map(msg => `${msg.type === 'user' ? '用戶' : 'Bot'}: ${msg.message}`);
  }
}

// ==================== Express 應用設置 ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 初始化 Bot
const bot = new SuperIntelligentLineBot();

// Webhook 端點
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('📨 收到 Webhook 請求');
  
  try {
    // 驗證簽章
    const signature = req.get('X-Line-Signature');
    const body = req.body;
    
    if (!signature) {
      console.error('❌ 缺少簽章');
      return res.status(401).send('Unauthorized');
    }

    const bodyString = Buffer.isBuffer(body) ? body.toString() : JSON.stringify(body);
    const hash = crypto
      .createHmac('SHA256', config.channelSecret)
      .update(bodyString)
      .digest('base64');

    if (hash !== signature) {
      console.error('❌ 簽章驗證失敗');
      return res.status(401).send('Unauthorized');
    }

    // 解析事件
    const parsedBody = Buffer.isBuffer(body) ? JSON.parse(body.toString()) : body;
    const events = parsedBody.events || [];
    
    console.log(`📊 收到 ${events.length} 個事件`);

    // 處理事件
    const results = await Promise.allSettled(
      events.map(event => handleEvent(event))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ 處理完成：成功 ${successful}，失敗 ${failed}`);
    res.json({ success: true, processed: successful, failed });

  } catch (error) {
    console.error('❌ Webhook 處理失敗:', error);
    Memory.stats.errors++;
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 事件處理函數
async function handleEvent(event) {
  try {
    console.log(`📨 處理事件類型: ${event.type}`);
    
    // 處理文字訊息
    if (event.type === 'message' && event.message.type === 'text') {
      return await bot.handleMessage(event);
    }
    
    // 處理訊息收回事件
    if (event.type === 'unsend') {
      return await bot.handleUnsendEvent(event);
    }
    
    // 其他事件類型
    console.log(`⏭️ 跳過事件類型: ${event.type}`);
    return null;
    
  } catch (error) {
    console.error('❌ 事件處理失敗:', error);
    Memory.stats.errors++;
    throw error;
  }
}

// 健康檢查端點
app.get('/', (req, res) => {
  const uptime = Date.now() - Memory.stats.startTime;
  const memoryUsage = process.memoryUsage();
  
  res.json({
    status: 'running',
    message: '🤖 超級智能 LINE Bot v3.0 運行中',
    version: '3.0.0',
    uptime: Math.floor(uptime / 1000),
    author: {
      name: '顧晉瑋',
      school: '靜宜大學資管系'
    },
    stats: {
      totalMessages: Memory.stats.totalMessages,
      totalUsers: Memory.userProfiles.size,
      activeReminders: Memory.reminders.size,
      pendingDecisions: Array.from(Memory.decisions.values()).filter(d => d.status === 'pending').length,
      apiCalls: Memory.stats.apiCalls,
      errors: Memory.stats.errors,
      decisionsHandled: Memory.stats.decisionsHandled,
      remindersTriggered: Memory.stats.remindersTriggered,
      contradictionsDetected: Memory.stats.contradictionsDetected
    },
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024)
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    config: {
      hasLineToken: !!config.channelAccessToken,
      hasLineSecret: !!config.channelSecret,
      hasGeminiKey: !!config.geminiApiKey,
      hasBackupAI: !!config.backupAiKey,
      hasTwilio: !!config.twilioAccountSid,
      hasWeatherApi: !!config.weatherApiKey,
      hasNewsApi: !!config.newsApiKey,
      hasTmdbApi: !!config.tmdbApiKey,
      hasSearchApi: !!config.searchApiKey,
      adminUserId: config.adminUserId
    },
    services: {
      geminiApi: Memory.systemHealth.geminiApi,
      backupAi: Memory.systemHealth.backupAi,
      twilioService: Memory.systemHealth.twilioService
    },
    timestamp: new Date().toISOString()
  });
});

// 配置測試端點
app.get('/test-config', (req, res) => {
  const configStatus = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    webhook_url: `${req.protocol}://${req.get('host')}/webhook`,
    config_status: {
      // 必填項目
      line_token: config.channelAccessToken ? '✅ 已設定' : '❌ 未設定 (必填)',
      line_secret: config.channelSecret ? '✅ 已設定' : '❌ 未設定 (必填)',
      gemini_key: config.geminiApiKey ? '✅ 已設定' : '❌ 未設定 (必填)',
      admin_user: config.adminUserId ? '✅ 已設定' : '❌ 未設定 (必填)',
      
      // 可選項目
      backup_ai: config.backupAiKey ? '✅ 已設定' : '⚪ 未設定 (建議)',
      twilio_service: config.twilioAccountSid ? '✅ 已設定' : '⚪ 未設定 (電話鬧鐘)',
      weather_api: config.weatherApiKey ? '✅ 已設定' : '⚪ 未設定 (天氣查詢)',
      news_api: config.newsApiKey ? '✅ 已設定' : '⚪ 未設定 (新聞查詢)',
      tmdb_api: config.tmdbApiKey ? '✅ 已設定' : '⚪ 未設定 (電影推薦)',
      search_api: config.searchApiKey ? '✅ 已設定' : '⚪ 未設定 (網路搜尋)'
    },
    system_info: {
      node_version: process.version,
      memory_usage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      uptime: `${Math.floor(process.uptime() / 3600)}小時`,
      timezone: process.env.TZ || 'UTC'
    },
    recommendations: [
      '✅ 確保所有必填的環境變數都已設定',
      '🔗 在 LINE Developers Console 設定正確的 Webhook URL',
      '🧪 使用 /test-config 和 / 端點測試系統狀態',
      '📱 建議設定備用 AI 以提高穩定性',
      '📞 設定 Twilio 以啟用電話鬧鐘功能',
      '🌤️ 設定天氣 API 以提供完整的天氣查詢服務'
    ],
    next_steps: [
      '1. 檢查所有環境變數是否正確設定',
      '2. 在 LINE Bot 控制台設定 Webhook URL',
      '3. 測試基本聊天功能',
      '4. 測試提醒和決策功能',
      '5. 確認所有 API 服務正常運作'
    ]
  };
  
  res.json(configStatus);
});

// API 狀態檢查端點
app.get('/api-status', async (req, res) => {
  const apiTests = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // 測試 Gemini AI
  try {
    if (config.geminiApiKey && model) {
      const testResult = await model.generateContent('測試');
      apiTests.tests.gemini = { status: '✅ 正常', response: '已回應' };
    } else {
      apiTests.tests.gemini = { status: '❌ 未配置', response: 'API Key 未設定' };
    }
  } catch (error) {
    apiTests.tests.gemini = { status: '❌ 錯誤', response: error.message };
  }

  // 測試天氣 API
  try {
    if (config.weatherApiKey) {
      await axios.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001', {
        params: { Authorization: config.weatherApiKey, locationName: '台中' },
        timeout: 5000
      });
      apiTests.tests.weather = { status: '✅ 正常', response: '連接成功' };
    } else {
      apiTests.tests.weather = { status: '⚪ 未配置', response: 'API Key 未設定' };
    }
  } catch (error) {
    apiTests.tests.weather = { status: '❌ 錯誤', response: error.message };
  }

  // 測試 Twilio
  try {
    if (config.twilioAccountSid && twilioClient) {
      await twilioClient.api.accounts(config.twilioAccountSid).fetch();
      apiTests.tests.twilio = { status: '✅ 正常', response: '認證成功' };
    } else {
      apiTests.tests.twilio = { status: '⚪ 未配置', response: 'Twilio 未設定' };
    }
  } catch (error) {
    apiTests.tests.twilio = { status: '❌ 錯誤', response: error.message };
  }

  res.json(apiTests);
});

// 配置驗證函數
function validateConfig() {
  const required = {
    'LINE_CHANNEL_ACCESS_TOKEN': config.channelAccessToken,
    'LINE_CHANNEL_SECRET': config.channelSecret,
    'GEMINI_API_KEY': config.geminiApiKey
  };

  const missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('❌ 缺少必要環境變數:', missing.join(', '));
    console.error('💡 請檢查 .env 檔案或部署平台的環境變數設定');
    return false;
  }

  console.log('✅ 必要配置驗證通過');
  return true;
}

// 系統健康檢查
function performHealthCheck() {
  setInterval(() => {
    Memory.systemHealth.lastHealthCheck = new Date();
    
    // 檢查記憶體使用量
    const memUsage = process.memoryUsage();
    if (memUsage.heapUsed > 800 * 1024 * 1024) { // 超過 800MB
      console.warn('⚠️ 記憶體使用量偏高:', Math.round(memUsage.heapUsed / 1024 / 1024), 'MB');
    }
    
    // 檢查錯誤率
    if (Memory.stats.errors > 50) {
      console.warn('⚠️ 錯誤次數過多:', Memory.stats.errors);
    }
    
    // 清理過期的學習數據
    const now = Date.now();
    for (const [userId, userData] of Memory.learningData.entries()) {
      if (userData.lastInteraction && (now - userData.lastInteraction) > 7 * 24 * 60 * 60 * 1000) { // 7天
        Memory.learningData.delete(userId);
      }
    }
    
  }, 5 * 60 * 1000); // 每5分鐘檢查一次
}

// 啟動伺服器
app.listen(config.port, () => {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 超級智能 LINE Bot v3.0 正在啟動...');
  console.log('='.repeat(100));
  
  // 驗證配置
  if (!validateConfig()) {
    console.error('❌ 配置驗證失敗，請檢查環境變數設定');
    console.error('💡 執行 npm run config-check 來檢查配置');
    process.exit(1);
  }
  
  console.log('📋 系統資訊:');
  console.log(`   📡 伺服器端口: ${config.port}`);
  console.log(`   👨‍💼 管理員 ID: ${config.adminUserId}`);
  console.log(`   🌐 環境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   🕐 時區: ${process.env.TZ || 'UTC'}`);
  console.log(`   📦 Node.js: ${process.version}`);
  console.log('');
  
  console.log('🤖 AI 引擎狀態:');
  console.log(`   🧠 Gemini AI: ${config.geminiApiKey ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   🔄 備用 AI: ${config.backupAiKey ? '✅ 已配置' : '⚪ 未配置'}`);
  console.log('');
  
  console.log('🛠️ 外部服務狀態:');
  console.log(`   📞 Twilio 電話: ${config.twilioAccountSid ? '✅ 已配置' : '⚪ 未配置'}`);
  console.log(`   🌤️ 天氣 API: ${config.weatherApiKey ? '✅ 已配置' : '⚪ 未配置'}`);
  console.log(`   📰 新聞 API: ${config.newsApiKey ? '✅ 已配置' : '⚪ 未配置'}`);
  console.log(`   🎬 電影 API: ${config.tmdbApiKey ? '✅ 已配置' : '⚪ 未配置'}`);
  console.log(`   🔍 搜尋 API: ${config.searchApiKey ? '✅ 已配置' : '⚪ 未配置'}`);
  console.log('');
  
  console.log('🎯 核心功能狀態:');
  console.log('   💬 AI 個性聊天: ✅ 已載入');
  console.log('   📱 圖文訊息系統: ✅ 已就緒');
  console.log('   ⏰ 智能提醒系統: ✅ 已啟動');
  console.log('   📞 電話鬧鐘功能: ✅ 已整合');
  console.log('   ⚖️ 決策管理系統: ✅ 已就緒');
  console.log('   🔍 搜尋查詢功能: ✅ 已連接');
  console.log('   ⚠️ 矛盾偵測系統: ✅ 已激活');
  console.log('   📱 訊息收回追蹤: ✅ 已啟用');
  console.log('   👥 用戶管理系統: ✅ 已準備');
  console.log('   📊 系統監控面板: ✅ 已運行');
  console.log('   🔧 自我修復機制: ✅ 已部署');
  console.log('   🧠 學習記憶系統: ✅ 已初始化');
  console.log('');
  
  console.log('💾 記憶體系統:');
  console.log(`   📚 對話記憶: ${Memory.conversations.size} 個會話`);
  console.log(`   👥 用戶檔案: ${Memory.userProfiles.size} 個檔案`);
  console.log(`   ⏰ 活躍提醒: ${Memory.reminders.size} 個提醒`);
  console.log(`   ⚖️ 待處理決策: ${Memory.decisions.size} 個決策`);
  console.log(`   🧠 學習數據: ${Memory.learningData.size} 個用戶`);
  console.log(`   💾 記憶體使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  console.log('');
  
  console.log('🔧 系統指令（主人專用）:');
  console.log('   /狀態報告 - 查看系統運行總覽');
  console.log('   /提醒清單 - 查看所有用戶提醒');
  console.log('   /決策待辦 - 查看待處理決策');
  console.log('   /用戶活躍 - 查看用戶活動排行');
  console.log('   /系統統計 - 查看詳細分析報告');
  console.log('   /矛盾歷史 - 查看矛盾偵測記錄');
  console.log('   /收回歷史 - 查看訊息收回記錄');
  console.log('   /系統健康 - 查看服務狀態');
  console.log('   /說明 - 查看完整使用說明');
  console.log('');
  
  console.log('🌐 API 端點:');
  console.log(`   📱 Webhook: ${config.port === 80 || config.port === 443 ? '' : ':' + config.port}/webhook`);
  console.log(`   🏥 健康檢查: ${config.port === 80 || config.port === 443 ? '' : ':' + config.port}/`);
  console.log(`   🔧 配置測試: ${config.port === 80 || config.port === 443 ? '' : ':' + config.port}/test-config`);
  console.log(`   📊 API 狀態: ${config.port === 80 || config.port === 443 ? '' : ':' + config.port}/api-status`);
  console.log('');
  
  console.log('🎉 系統完全就緒！超級智能分身正在等待互動...');
  console.log('💡 建議設定步驟：');
  console.log('   1. 在 LINE Developers Console 設定 Webhook URL');
  console.log('   2. 測試基本聊天功能');
  console.log('   3. 測試提醒和決策功能');
  console.log('   4. 享受你的 AI 分身！');
  console.log('='.repeat(100) + '\n');
  
  // 啟動健康檢查
  performHealthCheck();
});

// 優雅關閉處理
process.on('SIGTERM', () => {
  console.log('🔄 收到終止信號，正在優雅關閉服務...');
  
  // 清理定時器
  if (bot.reminderSystem.checkInterval) {
    clearInterval(bot.reminderSystem.checkInterval);
  }
  
  console.log('👋 系統已關閉，感謝使用！');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🔄 收到中斷信號，正在關閉服務...');
  process.exit(0);
});

// 未處理異常捕獲
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
  Memory.stats.errors++;
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
  console.error('   Promise:', promise);
  Memory.stats.errors++;
});

// 導出應用（用於測試）
module.exports = { app, bot, Memory, config };
      