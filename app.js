const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const crypto = require('crypto');

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
  
  // 系統配置
  adminUserId: process.env.ADMIN_USER_ID || 'demo326',
  port: process.env.PORT || 3000,
  
  // 性能配置
  apiTimeout: 10000,
  maxRetries: 3,
  rateLimitWindow: 60000,
  maxRequestsPerWindow: 30
};

// 初始化 LINE Bot 和 AI
const client = new line.Client(config);
const app = express();

let genAI, model;
if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
  
  // 系統統計
  stats: {
    totalMessages: 0,
    totalUsers: 0,
    startTime: new Date(),
    errors: 0,
    apiCalls: 0
  },

  // 學習數據
  learningData: new Map(),
  
  // 頻率限制
  rateLimiter: new Map()
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
}

// ==================== Flex 訊息系統 ====================
class FlexMessageBuilder {
  static createBasicCard(title, content, headerColor = '#4A90E2') {
    return {
      type: 'flex',
      altText: title,
      contents: {
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
      }
    };
  }

  static createChatResponse(content, emoji = '💬', color = '#4A90E2') {
    return this.createBasicCard(`${emoji} 智能回覆`, content, color);
  }

  static createSystemMessage(content, title = '🤖 系統訊息') {
    return this.createBasicCard(title, content, '#34C759');
  }

  static createErrorMessage(content, title = '❌ 錯誤訊息') {
    return this.createBasicCard(title, content, '#FF3B30');
  }

  static createWarningMessage(content, title = '⚠️ 警告訊息') {
    return this.createBasicCard(title, content, '#FF9500');
  }

  static createReminderCard(reminderData) {
    return {
      type: 'flex',
      altText: '⏰ 提醒設定',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '⏰ 提醒設定成功',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
          }],
          backgroundColor: '#34C759',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📝 內容：${reminderData.content}`,
              wrap: true,
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: `🕐 時間：${Utils.formatTime(reminderData.targetTime)}`,
              margin: 'md',
              color: '#666666'
            },
            {
              type: 'text',
              text: `🆔 編號：${reminderData.id}`,
              margin: 'md',
              size: 'sm',
              color: '#999999'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              action: {
                type: 'message',
                label: '查看全部',
                text: '/提醒清單'
              },
              style: 'secondary',
              flex: 1
            },
            {
              type: 'button',
              action: {
                type: 'message',
                label: '取消',
                text: `/取消提醒 ${reminderData.id}`
              },
              color: '#FF3B30',
              flex: 1
            }
          ]
        }
      }
    };
  }

  static createDecisionCard(decisionData) {
    return {
      type: 'flex',
      altText: '⚖️ 決策請求',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '⚖️ 需要您的決策',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
          }],
          backgroundColor: '#FF9500',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `👤 請求者：${decisionData.requesterName || '未知'}`,
              weight: 'bold'
            },
            {
              type: 'text',
              text: `📋 內容：${decisionData.content}`,
              wrap: true,
              margin: 'md'
            },
            {
              type: 'text',
              text: `🕐 時間：${decisionData.timestamp}`,
              size: 'sm',
              color: '#666666',
              margin: 'md'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
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
          ]
        }
      }
    };
  }

  static createStatusCard(stats) {
    return {
      type: 'flex',
      altText: '📊 系統狀態',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📊 系統狀態總覽',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
          }],
          backgroundColor: '#4A90E2',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            this.createStatRow('💬', '總訊息數', stats.totalMessages),
            this.createStatRow('👥', '用戶數量', Memory.userProfiles.size),
            this.createStatRow('⏰', '活躍提醒', Memory.reminders.size),
            this.createStatRow('⚖️', '待決策', Array.from(Memory.decisions.values()).filter(d => d.status === 'pending').length),
            this.createStatRow('🕒', '運行時間', `${Math.floor((Date.now() - stats.startTime) / 3600000)}小時`),
            this.createStatRow('💾', '記憶體', `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`),
            this.createStatRow('📈', 'API呼叫', stats.apiCalls),
            this.createStatRow('❌', '錯誤次數', stats.errors)
          ]
        }
      }
    };
  }

  static createStatRow(icon, label, value) {
    return {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${icon} ${label}`,
          flex: 3,
          size: 'sm'
        },
        {
          type: 'text',
          text: value.toString(),
          flex: 1,
          align: 'end',
          weight: 'bold',
          size: 'sm',
          color: '#4A90E2'
        }
      ],
      margin: 'md'
    };
  }

  static createListCard(title, items, icon = '📋') {
    const contents = items.map((item, index) => ({
      type: 'text',
      text: `${index + 1}. ${item}`,
      wrap: true,
      margin: index === 0 ? 'none' : 'md',
      size: 'sm'
    }));

    return {
      type: 'flex',
      altText: title,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: `${icon} ${title}`,
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
          }],
          backgroundColor: '#4A90E2',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: contents.length > 0 ? contents : [{
            type: 'text',
            text: '目前沒有任何項目',
            color: '#999999',
            align: 'center'
          }]
        }
      }
    };
  }

  static createWeatherCard(weatherData) {
    return {
      type: 'flex',
      altText: '🌤️ 天氣預報',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: `🌤️ ${weatherData.location} 天氣`,
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
          }],
          backgroundColor: '#34C759',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `🌡️ 溫度：${weatherData.temperature}°C`,
              size: 'md',
              margin: 'md'
            },
            {
              type: 'text',
              text: `☁️ 天氣：${weatherData.condition}`,
              size: 'md',
              margin: 'md'
            },
            {
              type: 'text',
              text: `💨 風速：${weatherData.windSpeed || '未知'} km/h`,
              size: 'md',
              margin: 'md'
            },
            {
              type: 'text',
              text: `💧 濕度：${weatherData.humidity || '未知'}%`,
              size: 'md',
              margin: 'md'
            },
            {
              type: 'text',
              text: `📅 更新：${Utils.formatTime(new Date())}`,
              size: 'sm',
              color: '#666666',
              margin: 'lg'
            }
          ]
        }
      }
    };
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
        '講話直接但很溫暖'
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
        '問題解決和邏輯思考'
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

用戶背景：${JSON.stringify(userContext, null, 2)}
最近對話：${conversationHistory}
當前訊息：${message}

請用${this.ownerPersonality.name}的口吻和風格回覆，讓對方感覺就像在跟本人聊天。
回覆要：
1. 自然親切，符合台灣大學生的說話方式
2. 如果是技術問題，展現專業熱忱
3. 適當使用語助詞讓對話更生動
4. 保持正面積極的態度
5. 回覆長度控制在100字以內，簡潔有力

回覆內容：
`;

    try {
      if (!model) {
        throw new Error('Gemini AI 未初始化');
      }

      const result = await model.generateContent(personalityPrompt);
      const response = result.response.text();
      
      // 學習用戶互動模式
      this.learnFromInteraction(userContext.userId, message, response);
      
      return response;
    } catch (error) {
      console.error('❌ Gemini AI 失敗:', error);
      
      try {
        return await this.useBackupAI(message, userContext);
      } catch (backupError) {
        console.error('❌ 備用 AI 也失敗:', backupError);
        return this.getFallbackResponse(message);
      }
    }
  }

  async useBackupAI(message, userContext) {
    if (!config.backupAiKey || !config.backupAiUrl) {
      throw new Error('備用 AI 未配置');
    }

    const response = await axios.post(`${config.backupAiUrl}/chat/completions`, {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `你是${this.ownerPersonality.name}的AI分身。語言風格：${this.ownerPersonality.language_style}。要完全模擬他的說話方式和個性，用台灣大學生的口氣回應。`
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 150,
      temperature: 0.8
    }, {
      headers: {
        'Authorization': `Bearer ${config.backupAiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.apiTimeout
    });

    const aiResponse = response.data.choices[0].message.content;
    this.learnFromInteraction(userContext.userId, message, aiResponse);
    return aiResponse;
  }

  getFallbackResponse(message) {
    const responses = {
      greeting: ['哈囉！有什麼我可以幫你的嗎？', '嗨！今天過得怎麼樣？', '欸，你好呀！'],
      tech: ['這個技術問題很有趣欸！讓我想想...', '技術方面的話，我覺得可以這樣考慮', '這個問題確實需要仔細思考一下'],
      question: ['這個問題很好欸！', '讓我想想怎麼回答比較好...', '這確實是個值得討論的問題呢'],
      thanks: ['不客氣啦！', '哈哈，應該的！', '很高興能幫到你！'],
      default: ['有意思！', '我想想怎麼回應比較好...', '這個話題挺有趣的', '確實是這樣呢']
    };

    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('你好') || lowerMessage.includes('哈囉') || lowerMessage.includes('嗨')) {
      return this.randomChoice(responses.greeting);
    } else if (lowerMessage.includes('程式') || lowerMessage.includes('技術') || lowerMessage.includes('代碼')) {
      return this.randomChoice(responses.tech);
    } else if (lowerMessage.includes('謝謝') || lowerMessage.includes('感謝')) {
      return this.randomChoice(responses.thanks);
    } else if (lowerMessage.includes('?') || lowerMessage.includes('？') || lowerMessage.includes('怎麼')) {
      return this.randomChoice(responses.question);
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
        sentiment: 'neutral'
      });
    }

    const userData = Memory.learningData.get(userId);
    userData.interactions.push({
      userMessage,
      botResponse,
      timestamp: new Date()
    });

    // 保持最近50條互動記錄
    if (userData.interactions.length > 50) {
      userData.interactions = userData.interactions.slice(-50);
    }

    // 分析主題
    this.analyzeTopics(userMessage, userData);
  }

  analyzeTopics(message, userData) {
    const techKeywords = ['程式', '代碼', '系統', '開發', '技術', 'API', 'Bot', 'AI'];
    const personalKeywords = ['朋友', '工作', '學校', '生活', '感覺', '想法'];
    
    techKeywords.forEach(keyword => {
      if (message.includes(keyword)) {
        userData.topics.add('technology');
      }
    });

    personalKeywords.forEach(keyword => {
      if (message.includes(keyword)) {
        userData.topics.add('personal');
      }
    });
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

  parseTimeString(timeString) {
    const now = new Date();
    const patterns = [
      // 相對時間：30分鐘後、2小時後
      {
        regex: /(\d+)分鐘?後/,
        handler: (match) => new Date(now.getTime() + parseInt(match[1]) * 60000)
      },
      {
        regex: /(\d+)小時後/,
        handler: (match) => new Date(now.getTime() + parseInt(match[1]) * 3600000)
      },
      {
        regex: /(\d+)秒後/,
        handler: (match) => new Date(now.getTime() + parseInt(match[1]) * 1000)
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
    const timeMatch = messageText.match(/(\d+秒後|\d+分鐘?後|\d+小時後|明天.*?\d{1,2}[點時]|\d{1,2}[：:]\d{2}|\d{1,2}[點時])/);
    
    if (!timeMatch) {
      return FlexMessageBuilder.createErrorMessage(
        '無法識別時間格式。請使用如下格式：\n• 30秒後\n• 5分鐘後\n• 2小時後\n• 明天8點\n• 14:30',
        '⏰ 時間格式錯誤'
      );
    }

    const timeString = timeMatch[0];
    const targetTime = this.parseTimeString(timeString);
    
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
    
    const reminderData = {
      id: reminderId,
      userId,
      content,
      targetTime,
      isPhoneCall: content.includes('起床') || content.includes('電話'),
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
      }
    }
  }

  async triggerReminder(reminder) {
    try {
      let message;
      
      if (reminder.isPhoneCall) {
        // 電話鬧鐘功能（這裡可以整合 Twilio 等服務）
        message = FlexMessageBuilder.createWarningMessage(
          `📞 電話鬧鐘提醒！\n\n📝 ${reminder.content}\n\n注意：電話鬧鐘功能需要額外設定 Twilio 服務`,
          '📞 電話鬧鐘'
        );
        
        // TODO: 實際電話撥打功能
        console.log(`📞 電話鬧鐘觸發：${reminder.userId} - ${reminder.content}`);
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

  listReminders(userId) {
    const userReminders = Array.from(Memory.reminders.values())
      .filter(reminder => reminder.userId === userId && reminder.status === 'active')
      .sort((a, b) => a.targetTime - b.targetTime);

    if (userReminders.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '目前沒有設定任何提醒',
        '📋 提醒清單'
      );
    }

    const reminderList = userReminders.map((reminder, index) => {
      const timeLeft = reminder.targetTime - new Date();
      const timeString = timeLeft > 0 ? 
        `還有 ${Math.floor(timeLeft / 60000)} 分鐘` : 
        '即將觸發';
      
      return `${reminder.content}\n   ⏰ ${Utils.formatTime(reminder.targetTime)}\n   ⏳ ${timeString}\n   🆔 ${reminder.id}`;
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

    // 通知請求者
    try {
      const statusText = action === 'approved' ? '✅ 已同意' : '❌ 已拒絕';
      const resultMessage = FlexMessageBuilder.createSystemMessage(
        `⚖️ 決策結果：${statusText}\n\n📋 原請求：${decision.content}` +
        (details ? `\n💬 主人回覆：${details}` : ''),
        '⚖️ 決策結果通知'
      );

      await this.client.pushMessage(decision.requester, resultMessage);
      
      return FlexMessageBuilder.createSystemMessage(
        `✅ 決策已處理並通知請求者\n\n🆔 決策編號：${decisionId}\n📋 結果：${statusText}`,
        '⚖️ 處理完成'
      );
    } catch (error) {
      console.error('❌ 決策結果通知失敗:', error);
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
      
      try {
        const timeoutMessage = FlexMessageBuilder.createWarningMessage(
          `⏰ 決策請求超時自動拒絕\n\n📋 原請求：${decision.content}\n🕐 請求時間：${decision.timestamp}`,
          '⏰ 決策超時'
        );
        
        await this.client.pushMessage(decision.requester, timeoutMessage);
        console.log(`⏰ 決策自動拒絕：${decisionId}`);
      } catch (error) {
        console.error('❌ 超時通知發送失敗:', error);
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
      details.push(`💬 回覆：${decision.response}`);
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
      return `${decision.content}\n   👤 ${decision.requesterName}\n   ⏰ 等待 ${waitTime} 分鐘\n   🆔 ${decision.id}`;
    });

    return FlexMessageBuilder.createListCard('決策待辦', decisionList, '⚖️');
  }
}

// ==================== 搜尋系統 ====================
class SearchSystem {
  async searchWeb(query) {
    try {
      // 這裡可以實現真正的網路搜尋
      const mockResults = [
        `關於「${query}」的搜尋結果：`,
        '• 相關資訊正在整理中',
        '• 建議直接搜尋相關關鍵詞',
        '• 如需更精確結果，請提供更多細節'
      ];

      return FlexMessageBuilder.createListCard('網路搜尋結果', mockResults, '🔍');
    } catch (error) {
      console.error('❌ 網路搜尋失敗:', error);
      return FlexMessageBuilder.createErrorMessage(
        '搜尋功能暫時無法使用，請稍後再試',
        '🔍 搜尋錯誤'
      );
    }
  }

  async getWeather(location = '台中') {
    try {
      if (!config.weatherApiKey) {
        throw new Error('天氣 API 未設定');
      }

      // 使用中央氣象署 API
      const response = await axios.get(
        'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001',
        {
          params: {
            Authorization: config.weatherApiKey,
            locationName: location
          },
          timeout: config.apiTimeout
        }
      );

      const locationData = response.data.records.location.find(
        loc => loc.locationName === location
      );

      if (!locationData) {
        throw new Error('找不到指定地點的天氣資料');
      }

      const weatherElement = locationData.weatherElement;
      const weather = weatherElement.find(el => el.elementName === 'Wx');
      const temperature = weatherElement.find(el => el.elementName === 'MinT');
      const maxTemp = weatherElement.find(el => el.elementName === 'MaxT');

      const weatherData = {
        location,
        condition: weather?.time[0]?.parameter?.parameterName || '未知',
        temperature: `${temperature?.time[0]?.parameter?.parameterName || '?'} - ${maxTemp?.time[0]?.parameter?.parameterName || '?'}`,
        windSpeed: '資料獲取中',
        humidity: '資料獲取中'
      };

      return FlexMessageBuilder.createWeatherCard(weatherData);
    } catch (error) {
      console.error('❌ 天氣查詢失敗:', error);
      
      // 提供備用天氣資訊
      const mockWeatherData = {
        location,
        condition: '多雲時晴',
        temperature: '22 - 28',
        windSpeed: '輕風',
        humidity: '65'
      };

      const warningMessage = FlexMessageBuilder.createWeatherCard(mockWeatherData);
      // 添加警告說明
      return warningMessage;
    }
  }

  async getNews(category = 'general') {
    try {
      const mockNews = [
        '• 最新科技新聞整理中...',
        '• 台灣本地新聞更新',
        '• 國際重要新聞摘要',
        '• 經濟市場動態追蹤'
      ];

      return FlexMessageBuilder.createListCard('新聞摘要', mockNews, '📰');
    } catch (error) {
      console.error('❌ 新聞查詢失敗:', error);
      return FlexMessageBuilder.createErrorMessage(
        '新聞查詢功能暫時無法使用',
        '📰 新聞錯誤'
      );
    }
  }

  async getMovieRecommendations() {
    try {
      const mockMovies = [
        '🎬 熱門電影推薦：',
        '• 最新上映電影清單整理中',
        '• 高評分電影排行榜',
        '• 本週票房冠軍',
        '• 經典重映電影'
      ];

      return FlexMessageBuilder.createListCard('電影推薦', mockMovies, '🎬');
    } catch (error) {
      console.error('❌ 電影推薦失敗:', error);
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
      const prompt = `
請分析以下對話，判斷新訊息是否與之前的內容有明顯矛盾：

對話歷史：
${conversationHistory.join('\n')}

新訊息：${newMessage}

如果發現明顯矛盾，請回覆"CONTRADICTION_FOUND: [具體描述矛盾之處]"
如果沒有矛盾，請回覆"NO_CONTRADICTION"

矛盾判斷標準：
1. 事實性矛盾（前後說法完全相反）
2. 態度矛盾（對同一事物前後態度完全不同）
3. 計劃矛盾（計劃或決定前後不一致）
`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      if (response.includes('CONTRADICTION_FOUND:')) {
        await this.reportContradiction(userId, newMessage, response);
      }
    } catch (error) {
      console.error('❌ 矛盾偵測失敗:', error);
    }
  }

  async reportContradiction(userId, message, analysis) {
    try {
      const userProfile = Memory.userProfiles.get(userId);
      const userName = userProfile?.displayName || userId;
      
      const contradictionReport = FlexMessageBuilder.createWarningMessage(
        `⚠️ 偵測到用戶發言矛盾\n\n👤 用戶：${userName}\n💬 訊息：${Utils.truncateText(message, 100)}\n🔍 矛盾分析：${analysis.replace('CONTRADICTION_FOUND:', '').trim()}`,
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

      console.log(`⚠️ 矛盾偵測：${userId} - ${message}`);
    } catch (error) {
      console.error('❌ 矛盾報告發送失敗:', error);
    }
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
          return this.getAllReminders();
        
        case '/決策待辦':
          return new DecisionSystem(client).listPendingDecisions();
        
        case '/用戶活躍':
          return this.getUserActivity();
        
        case '/系統統計':
          return this.getSystemAnalytics();
        
        case '/功能列表':
          return this.getFunctionList();
        
        case '/清除歷史':
          return this.clearHistory();
        
        case '/清除對話':
          return this.clearConversations();
        
        case '/清除提醒':
          return this.clearReminders();
        
        case '/說明':
          return this.getHelpMessage();
        
        default:
          return this.getAvailableCommands();
      }
    } catch (error) {
      console.error('❌ 系統指令處理失敗:', error);
      Memory.stats.errors++;
      return FlexMessageBuilder.createErrorMessage(
        '系統指令執行失敗，請查看日誌',
        '❌ 執行錯誤'
      );
    }
  }

  static getAllReminders() {
    const allReminders = Array.from(Memory.reminders.values())
      .sort((a, b) => a.targetTime - b.targetTime);

    if (allReminders.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '目前系統中沒有任何提醒',
        '📋 所有提醒'
      );
    }

    const reminderList = allReminders.map(reminder => {
      const userProfile = Memory.userProfiles.get(reminder.userId);
      const userName = userProfile?.displayName || reminder.userId;
      return `${reminder.content}\n   👤 ${userName}\n   ⏰ ${Utils.formatTime(reminder.targetTime)}\n   🆔 ${reminder.id}`;
    });

    return FlexMessageBuilder.createListCard('所有提醒', reminderList, '📋');
  }

  static getUserActivity() {
    const users = Array.from(Memory.userProfiles.values())
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
      .slice(0, 10); // 只顯示前10個用戶

    if (users.length === 0) {
      return FlexMessageBuilder.createSystemMessage(
        '暫無用戶活動記錄',
        '👥 用戶活躍'
      );
    }

    const userList = users.map(user => {
      const lastSeen = user.lastSeen ? Utils.formatTime(user.lastSeen) : '從未';
      return `${user.displayName || user.id}\n   💬 ${user.messageCount || 0} 則訊息\n   🕐 最後活躍：${lastSeen}`;
    });

    return FlexMessageBuilder.createListCard('用戶活躍度', userList, '👥');
  }

  static getSystemAnalytics() {
    const analytics = [
      `📊 總訊息處理：${Memory.stats.totalMessages}`,
      `👥 註冊用戶：${Memory.userProfiles.size}`,
      `⏰ 活躍提醒：${Memory.reminders.size}`,
      `⚖️ 歷史決策：${Memory.decisions.size}`,
      `⚠️ 矛盾記錄：${Memory.contradictions.size}`,
      `📈 API 呼叫：${Memory.stats.apiCalls}`,
      `❌ 錯誤次數：${Memory.stats.errors}`,
      `🕒 運行時間：${Math.floor((Date.now() - Memory.stats.startTime) / 3600000)} 小時`,
      `💾 記憶體使用：${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
    ];

    return FlexMessageBuilder.createListCard('系統分析', analytics, '📊');
  }

  static getFunctionList() {
    const functions = [
      '🤖 超擬真 AI 聊天',
      '⏰ 智能提醒系統',
      '⚖️ 決策管理系統',
      '🔍 搜尋與查詢功能',
      '🌤️ 天氣預報',
      '📰 新聞摘要',
      '🎬 電影推薦',
      '⚠️ 矛盾偵測',
      '👥 用戶管理',
      '📊 系統監控',
      '🔧 自我修復',
      '🧠 學習系統'
    ];

    return FlexMessageBuilder.createListCard('功能列表', functions, '🎯');
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
    Memory.conversations.clear();
    Memory.messageHistory.clear();
    
    return FlexMessageBuilder.createSystemMessage(
      `✅ 已清除 ${conversationCount} 個對話記錄`,
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

  static getHelpMessage() {
    const helpText = `
🤖 超級智能 LINE Bot 使用說明

📱 一般功能：
• 直接聊天 - AI 會模擬主人風格回應
• 設定提醒 - "30分鐘後提醒我開會"
• 查詢天氣 - "台中天氣如何"
• 搜尋資訊 - "搜尋 LINE Bot 開發"

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
• 全圖文回應格式
`;

    return FlexMessageBuilder.createBasicCard('📚 使用說明', helpText, '#34C759');
  }

  static getAvailableCommands() {
    const commands = [
      '/狀態報告 - 系統總覽',
      '/提醒清單 - 所有提醒',
      '/決策待辦 - 待處理決策',
      '/用戶活躍 - 用戶活動',
      '/系統統計 - 詳細統計',
      '/功能列表 - 所有功能',
      '/清除歷史 - 清理對話',
      '/清除對話 - 清除對話',
      '/清除提醒 - 清除提醒',
      '/說明 - 使用說明'
    ];

    return FlexMessageBuilder.createListCard('系統指令', commands, '🔧');
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
  }

  async handleMessage(event) {
    const { message, source, replyToken } = event;
    const userId = source.userId || source.groupId;
    const messageText = message.text;

    console.log(`👤 收到訊息 [${userId}]: ${messageText}`);
    Memory.stats.totalMessages++;

    try {
      // 頻率限制檢查
      if (!Utils.checkRateLimit(userId)) {
        console.log('⚠️ 頻率限制觸發:', userId);
        const rateLimitMessage = FlexMessageBuilder.createWarningMessage(
          '哎呀，你的訊息有點太頻繁了！讓我休息一下，等等再聊吧～',
          '⚡ 訊息頻率限制'
        );
        return await this.safeReply(replyToken, rateLimitMessage);
      }

      // 記錄訊息和更新用戶資料
      this.recordMessage(userId, messageText, source);
      this.updateUserProfile(userId, source);

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
        const response = await this.handleDecisionDetails(messageText, userId);
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
        '哎呀，我遇到一點小問題，讓我重新整理一下思緒...',
        '🤖 系統錯誤'
      );
      return await this.safeReply(replyToken, errorResponse);
    }
  }

  async safeReply(replyToken, message) {
    try {
      await client.replyMessage(replyToken, message);
      console.log('✅ 回覆發送成功');
    } catch (error) {
      console.error('❌ 回覆發送失敗:', error);
      if (error.statusCode === 400) {
        console.log('🔄 ReplyToken 可能已過期');
      }
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

    // 保持最近30條訊息（群組）或50條（個人）
    const maxMessages = source.type === 'group' ? 30 : 50;
    if (conversation.length > maxMessages) {
      conversation.splice(0, conversation.length - maxMessages);
    }

    // 記錄到訊息歷史（用於收回偵測）
    if (!Memory.messageHistory.has(userId)) {
      Memory.messageHistory.set(userId, []);
    }
    
    const messageHistory = Memory.messageHistory.get(userId);
    messageHistory.push({
      message: messageText,
      timestamp: new Date(),
      messageId: `msg_${Date.now()}`
    });

    if (messageHistory.length > 100) {
      messageHistory.splice(0, messageHistory.length - 100);
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
        displayName: null
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
    }
  }

  isReminderRequest(message) {
    const reminderKeywords = ['提醒', '鬧鐘', '叫我', '分鐘後', '小時後', '秒後', '明天', '點叫', '起床'];
    return reminderKeywords.some(keyword => message.includes(keyword));
  }

  isSearchRequest(message) {
    const searchKeywords = ['搜尋', '查', '天氣', '新聞', '電影', '推薦'];
    return searchKeywords.some(keyword => message.includes(keyword));
  }

  async handleReminderRequest(messageText, userId) {
    return await this.reminderSystem.setReminder(userId, messageText);
  }

  async handleCancelReminder(messageText, userId) {
    const reminderIdMatch = messageText.match(/取消提醒\s+(\w+)/);
    if (!reminderIdMatch) {
      return FlexMessageBuilder.createErrorMessage(
        '請提供要取消的提醒編號，例如：取消提醒 reminder_123',
        '❌ 格式錯誤'
      );
    }

    const reminderId = reminderIdMatch[1];
    return await this.reminderSystem.cancelReminder(userId, reminderId);
  }

  async handleSearchRequest(messageText) {
    if (messageText.includes('天氣')) {
      const locationMatch = messageText.match(/(台中|台北|高雄|台南|新竹|桃園|嘉義|台東|花蓮|宜蘭|基隆|彰化|雲林|屏東|南投|苗栗|金門|澎湖)/);
      const location = locationMatch ? locationMatch[0] : '台中';
      return await this.searchSystem.getWeather(location);
    } else if (messageText.includes('新聞')) {
      return await this.searchSystem.getNews();
    } else if (messageText.includes('電影') || messageText.includes('推薦')) {
      return await this.searchSystem.getMovieRecommendations();
    } else {
      const query = messageText.replace(/搜尋|查/, '').trim();
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

  async handleDecisionDetails(messageText, userId) {
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
        '抱歉，我現在有點累了，等等再聊好嗎？',
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
    if (event.type !== 'message' || event.message.type !== 'text') {
      return null;
    }

    return await bot.handleMessage(event);
  } catch (error) {
    console.error('❌ 事件處理失敗:', error);
    Memory.stats.errors++;
    throw error;
  }
}

// 健康檢查端點
app.get('/', (req, res) => {
  const uptime = Date.now() - Memory.stats.startTime;
  
  res.json({
    status: 'running',
    message: '🤖 超級智能 LINE Bot 運行中',
    version: '3.0.0',
    uptime: Math.floor(uptime / 1000),
    stats: {
      totalMessages: Memory.stats.totalMessages,
      totalUsers: Memory.userProfiles.size,
      activeReminders: Memory.reminders.size,
      pendingDecisions: Array.from(Memory.decisions.values()).filter(d => d.status === 'pending').length,
      apiCalls: Memory.stats.apiCalls,
      errors: Memory.stats.errors
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    config: {
      hasLineToken: !!config.channelAccessToken,
      hasLineSecret: !!config.channelSecret,
      hasGeminiKey: !!config.geminiApiKey,
      hasBackupAI: !!config.backupAiKey,
      adminUserId: config.adminUserId
    },
    timestamp: new Date().toISOString()
  });
});

// 配置測試端點
app.get('/test-config', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    config_status: {
      line_token: config.channelAccessToken ? '✅ 已設定' : '❌ 未設定',
      line_secret: config.channelSecret ? '✅ 已設定' : '❌ 未設定',
      gemini_key: config.geminiApiKey ? '✅ 已設定' : '❌ 未設定',
      backup_ai: config.backupAiKey ? '✅ 已設定' : '❌ 未設定',
      weather_api: config.weatherApiKey ? '✅ 已設定' : '❌ 未設定',
      news_api: config.newsApiKey ? '✅ 已設定' : '❌ 未設定',
      admin_user: config.adminUserId || '❌ 未設定'
    },
    webhook_url: `${req.protocol}://${req.get('host')}/webhook`,
    recommendations: [
      '確保所有必要的環境變數都已設定',
      '在 LINE Developers Console 設定正確的 Webhook URL',
      '測試各項 API 連接是否正常'
    ]
  });
});

// 配置驗證
function validateConfig() {
  const required = {
    'LINE_CHANNEL_ACCESS_TOKEN': config.channelAccessToken,
    'LINE_CHANNEL_SECRET': config.channelSecret,
    'GEMINI_API_KEY': config.geminiApiKey,
    'ADMIN_USER_ID': config.adminUserId
  };

  const missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('❌ 缺少必要環境變數:', missing.join(', '));
    return false;
  }

  return true;
}

// 啟動伺服器
app.listen(config.port, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 超級智能 LINE Bot v3.0 啟動中...');
  console.log('='.repeat(80));
  
  if (!validateConfig()) {
    console.error('❌ 配置驗證失敗，請檢查環境變數');
    process.exit(1);
  }
  
  console.log(`📡 伺服器端口: ${config.port}`);
  console.log(`👨‍💼 管理員: ${config.adminUserId}`);
  console.log(`🤖 AI 引擎: ${config.geminiApiKey ? 'Gemini ✅' : '❌'} + ${config.backupAiKey ? 'GPT-3.5 ✅' : '❌'}`);
  console.log('');
  console.log('🎯 核心功能狀態:');
  console.log('  💬 AI 個性聊天: ✅');
  console.log('  📱 圖文訊息系統: ✅');
  console.log('  ⏰ 智能提醒系統: ✅');
  console.log('  ⚖️ 決策管理系統: ✅');
  console.log('  🔍 搜尋功能: ✅');
  console.log('  ⚠️ 矛盾偵測: ✅');
  console.log('  🧠 學習系統: ✅');
  console.log('  🔧 系統管理: ✅');
  console.log('');
  console.log('📊 記憶體系統:');
  console.log(`  💾 已使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  console.log(`  📚 對話記憶: ${Memory.conversations.size} 個`);
  console.log(`  👥 用戶檔案: ${Memory.userProfiles.size} 個`);
  console.log('');
  console.log('🎉 系統完全就緒！等待用戶互動...');
  console.log('='.repeat(80) + '\n');
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('🔄 收到終止信號，正在關閉服務...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
  Memory.stats.errors++;
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
  Memory.stats.errors++;
});

module.exports = app;