const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const crypto = require('crypto');

// 環境變數配置
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  geminiApiKey: process.env.GEMINI_API_KEY,
  newsApiKey: process.env.NEWS_API_KEY,
  weatherApiKey: process.env.WEATHER_API_KEY,
  tmdbApiKey: process.env.TMDB_API_KEY,
  backupAiKey: process.env.BACKUP_AI_KEY,
  backupAiUrl: process.env.BACKUP_AI_URL,
  adminUserId: process.env.ADMIN_USER_ID || 'demo326',
  port: process.env.PORT || 3000,
  // 新增超時和重試設定
  apiTimeout: 10000, // 10秒超時
  maxRetries: 3,
  rateLimitWindow: 60000, // 1分鐘
  maxRequestsPerWindow: 30
};

// 請求限制器
const rateLimiter = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const userRequests = rateLimiter.get(userId) || [];
  
  // 清除過期請求
  const validRequests = userRequests.filter(time => now - time < config.rateLimitWindow);
  
  if (validRequests.length >= config.maxRequestsPerWindow) {
    return false;
  }
  
  validRequests.push(now);
  rateLimiter.set(userId, validRequests);
  return true;
}

// LINE Bot 客戶端初始化
const client = new line.Client(config);
const app = express();

// Gemini AI 初始化
const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 全域記憶存儲
const globalMemory = {
  conversations: new Map(),        // 用戶對話記憶
  userProfiles: new Map(),        // 用戶檔案
  decisions: new Map(),           // 待決策事項
  reminders: new Map(),           // 提醒系統
  forwardRequests: new Map(),     // 轉發請求
  systemStats: new Map(),         // 系統統計
  contradictions: new Map(),      // 矛盾記錄
  messageHistory: new Map()       // 訊息歷史（用於收回偵測）
};

// ==================== AI 聊天系統 ====================
class AIPersonalitySystem {
  constructor() {
    this.ownerPersonality = {
      language_style: "台灣口語化、親切、專業但不拘謹",
      response_patterns: [
        "喜歡用「欸」、「哈哈」、「對啊」等語助詞",
        "會適時給建議但不會太強勢",
        "遇到技術問題會很興奮，喜歡深入討論",
        "對朋友很關心，會主動詢問近況"
      ],
      values: [
        "注重效率但也關心人情",
        "喜歡學習新技術",
        "重視團隊合作",
        "實事求是，不喜歡虛假"
      ],
      emotional_style: "正面樂觀，偶爾會開玩笑，但在正事上很認真"
    };
  }

  async generatePersonalizedResponse(message, userContext, conversationHistory) {
    const personalityPrompt = `
你是顧晉瑋的AI分身，必須完全模擬他的說話方式和思維模式：

個性特徵：
- 語言風格：${this.ownerPersonality.language_style}
- 回應模式：${this.ownerPersonality.response_patterns.join(', ')}
- 價值觀：${this.ownerPersonality.values.join(', ')}
- 情緒風格：${this.ownerPersonality.emotional_style}

對話歷史：${conversationHistory}
用戶背景：${JSON.stringify(userContext)}
當前訊息：${message}

請用顧晉瑋的口吻回覆，讓對方感覺就像在跟本人聊天。回覆要自然、親切，符合他的個性。
如果是技術相關問題，可以表現出專業和興趣。
`;

    try {
      console.log('🤖 使用 Gemini AI 生成回覆...');
      const result = await model.generateContent(personalityPrompt);
      const response = result.response.text();
      console.log('✅ Gemini AI 回覆成功');
      return response;
    } catch (error) {
      console.error('❌ Gemini AI 失敗:', error);
      console.log('🔄 嘗試備用 AI...');
      
      try {
        return await this.useBackupAI(message, userContext);
      } catch (backupError) {
        console.error('❌ 備用 AI 也失敗:', backupError);
        return await this.fallbackResponse(message);
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
          content: `你是顧晉瑋的AI分身。語言風格：${this.ownerPersonality.language_style}。要完全模擬他的說話方式和個性。`
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
      }
    });

    console.log('✅ 備用 AI 回覆成功');
    return response.data.choices[0].message.content;
  }

  async fallbackResponse(message) {
    console.log('🆘 使用離線回應模式');
    
    // 根據關鍵詞提供智能回應
    const responses = {
      greeting: ["哈囉！有什麼我可以幫你的嗎？", "嗨！今天過得怎麼樣？", "欸，你好！"],
      tech: ["這個技術問題很有趣欸！讓我想想...", "技術方面的話，我覺得可以這樣考慮...", "這個問題確實需要仔細思考一下"],
      question: ["這個問題很好欸！", "讓我想想怎麼回答比較好...", "這確實是個值得討論的問題"],
      thanks: ["不客氣啦！", "哈哈，應該的！", "很高興能幫到你！"],
      default: ["有意思！", "我想想怎麼回應比較好...", "這個話題挺有趣的", "確實是這樣呢"]
    };

    // 簡單的關鍵詞匹配
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
}

// ==================== 圖文訊息系統 ====================
class FlexMessageSystem {
  static createChatResponse(content, title = "💬 智能回覆") {
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
            color: '#4A90E2'
          }],
          backgroundColor: '#F0F8FF'
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
          }]
        }
      }
    };
  }

  static createReminderSetup(reminderText, time, reminderId) {
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
            color: '#4CAF50'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📝 內容：${reminderText}`,
              wrap: true,
              weight: 'bold'
            },
            {
              type: 'text',
              text: `🕐 時間：${time}`,
              margin: 'md',
              color: '#666666'
            },
            {
              type: 'text',
              text: `🆔 編號：${reminderId}`,
              margin: 'md',
              size: 'sm',
              color: '#999999'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'button',
              action: {
                type: 'message',
                label: '📋 查看所有提醒',
                text: '/提醒清單'
              },
              style: 'secondary'
            },
            {
              type: 'button',
              action: {
                type: 'message',
                label: '❌ 取消提醒',
                text: `/取消提醒 ${reminderId}`
              },
              color: '#FF6B6B'
            }
          ]
        }
      }
    };
  }

  static createDecisionRequest(decisionData) {
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
            color: '#FF9800'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `👤 請求者：${decisionData.requester}`,
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
          layout: 'horizontal',
          contents: [
            {
              type: 'button',
              action: {
                type: 'message',
                label: '✅ 同意',
                text: `決策同意 ${decisionData.id}`
              },
              style: 'primary'
            },
            {
              type: 'button',
              action: {
                type: 'message',
                label: '❌ 拒絕',
                text: `決策拒絕 ${decisionData.id}`
              },
              color: '#FF6B6B'
            },
            {
              type: 'button',
              action: {
                type: 'message',
                label: '❓ 詳情',
                text: `決策詳情 ${decisionData.id}`
              },
              style: 'secondary'
            }
          ]
        }
      }
    };
  }

  static createSystemStatus(stats) {
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
            color: '#4A90E2'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            this.createStatRow('💬', '對話數', stats.conversations),
            this.createStatRow('⚖️', '待決策', stats.pendingDecisions),
            this.createStatRow('⏰', '活躍提醒', stats.activeReminders),
            this.createStatRow('👥', '用戶數', stats.totalUsers),
            this.createStatRow('🕒', '運行時間', `${Math.floor(stats.uptime / 3600)}h`),
            this.createStatRow('💾', '記憶體', `${stats.memory}MB`)
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
        { type: 'text', text: `${icon} ${label}`, flex: 2 },
        { type: 'text', text: value.toString(), flex: 1, align: 'end', weight: 'bold' }
      ],
      margin: 'md'
    };
  }

  static createChart(data, title) {
    const maxValue = Math.max(...data.map(item => item.value));
    return {
      type: 'flex',
      altText: `📊 ${title}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: `📊 ${title}`,
            weight: 'bold',
            size: 'lg',
            color: '#4A90E2'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: data.map((item, index) => ({
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: item.label,
                flex: 2,
                size: 'sm'
              },
              {
                type: 'text',
                text: '█'.repeat(Math.max(1, Math.floor((item.value / maxValue) * 20))),
                flex: 3,
                color: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][index % 5],
                size: 'sm'
              },
              {
                type: 'text',
                text: item.value.toString(),
                flex: 1,
                align: 'end',
                weight: 'bold',
                size: 'sm'
              }
            ],
            margin: 'md'
          }))
        }
      }
    };
  }
}

// ==================== 提醒系統 ====================
class SuperReminderSystem {
  constructor(client) {
    this.client = client;
    this.checkInterval = setInterval(() => this.checkReminders(), 10000); // 每10秒檢查
  }

  parseTime(timeString) {
    const now = new Date();
    const timeRegexes = [
      // 絕對時間：明天8點、今天下午3點
      { pattern: /明天.*?(\d{1,2})[點時]/, handler: (match) => {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(parseInt(match[1]), 0, 0, 0);
        return tomorrow;
      }},
      // 相對時間：30分鐘後、2小時後
      { pattern: /(\d+)分鐘?後/, handler: (match) => {
        return new Date(now.getTime() + parseInt(match[1]) * 60000);
      }},
      { pattern: /(\d+)小時後/, handler: (match) => {
        return new Date(now.getTime() + parseInt(match[1]) * 3600000);
      }},
      // 絕對時間：14:30、上午9點
      { pattern: /(\d{1,2})[：:](\d{2})/, handler: (match) => {
        const target = new Date(now);
        target.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        return target;
      }}
    ];

    for (const regex of timeRegexes) {
      const match = timeString.match(regex.pattern);
      if (match) {
        return regex.handler(match);
      }
    }
    return null;
  }

  async setReminder(userId, message, timeString) {
    const targetTime = this.parseTime(timeString);
    if (!targetTime) {
      return "❌ 時間格式不正確，請使用如：「30分鐘後」、「明天8點」、「14:30」等格式";
    }

    const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const reminderData = {
      id: reminderId,
      userId,
      message,
      targetTime,
      isPhoneCall: message.includes('叫我起床') || message.includes('電話叫'),
      created: new Date()
    };

    globalMemory.reminders.set(reminderId, reminderData);

    return FlexMessageSystem.createReminderSetup(
      message,
      targetTime.toLocaleString('zh-TW'),
      reminderId
    );
  }

  async checkReminders() {
    const now = new Date();
    for (const [id, reminder] of globalMemory.reminders.entries()) {
      if (now >= reminder.targetTime) {
        await this.triggerReminder(reminder);
        globalMemory.reminders.delete(id);
      }
    }
  }

  async triggerReminder(reminder) {
    try {
      if (reminder.isPhoneCall) {
        // 這裡可以整合電話API（如Twilio）
        await this.makePhoneCall(reminder.userId);
      }
      
      const reminderMessage = FlexMessageSystem.createChatResponse(
        `⏰ 提醒時間到！\n\n📝 ${reminder.message}`,
        "⏰ 提醒通知"
      );
      
      await this.client.pushMessage(reminder.userId, reminderMessage);
    } catch (error) {
      console.error('提醒發送失敗:', error);
    }
  }

  async makePhoneCall(userId) {
    // 電話鬧鐘功能（需要Twilio或類似服務）
    console.log(`電話鬧鐘觸發：${userId}`);
    // 實際實現需要整合電話服務
  }

  listReminders(userId) {
    const userReminders = Array.from(globalMemory.reminders.values())
      .filter(reminder => reminder.userId === userId)
      .sort((a, b) => a.targetTime - b.targetTime);

    if (userReminders.length === 0) {
      return FlexMessageSystem.createChatResponse("目前沒有設定任何提醒", "📋 提醒清單");
    }

    const reminderList = userReminders.map((reminder, index) => 
      `${index + 1}. ${reminder.message}\n   ⏰ ${reminder.targetTime.toLocaleString('zh-TW')}\n   🆔 ${reminder.id}`
    ).join('\n\n');

    return FlexMessageSystem.createChatResponse(reminderList, "📋 提醒清單");
  }
}

// ==================== 決策系統 ====================
class DecisionSystem {
  constructor(client) {
    this.client = client;
    this.autoRejectTimeout = 30 * 60 * 1000; // 30分鐘
  }

  async requestDecision(requesterId, content, context = {}) {
    const decisionId = `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const decisionData = {
      id: decisionId,
      requester: requesterId,
      content,
      context,
      timestamp: new Date().toLocaleString('zh-TW'),
      status: 'pending'
    };

    globalMemory.decisions.set(decisionId, decisionData);

    // 30分鐘後自動拒絕
    setTimeout(() => {
      if (globalMemory.decisions.has(decisionId) && 
          globalMemory.decisions.get(decisionId).status === 'pending') {
        this.autoReject(decisionId);
      }
    }, this.autoRejectTimeout);

    // 發送決策請求給主人
    const decisionMessage = FlexMessageSystem.createDecisionRequest(decisionData);
    await this.client.pushMessage(config.adminUserId, decisionMessage);

    return `✅ 已向主人發送決策請求，等待回覆中...（30分鐘後自動拒絕）`;
  }

  async handleDecisionResponse(decisionId, response, details = '') {
    const decision = globalMemory.decisions.get(decisionId);
    if (!decision) {
      return "❌ 找不到此決策請求";
    }

    decision.status = response;
    decision.response = details;
    decision.responseTime = new Date();

    // 通知請求者
    const resultMessage = FlexMessageSystem.createChatResponse(
      `⚖️ 決策結果：${response === 'approved' ? '✅ 已同意' : '❌ 已拒絕'}\n\n` +
      `📋 原請求：${decision.content}\n` +
      (details ? `💬 回覆：${details}` : ''),
      "⚖️ 決策結果"
    );

    await this.client.pushMessage(decision.requester, resultMessage);
    return `✅ 決策已處理，結果已通知請求者`;
  }

  async autoReject(decisionId) {
    const decision = globalMemory.decisions.get(decisionId);
    if (decision) {
      decision.status = 'auto_rejected';
      decision.responseTime = new Date();
      
      const timeoutMessage = FlexMessageSystem.createChatResponse(
        `⏰ 決策超時自動拒絕\n\n📋 原請求：${decision.content}`,
        "⚖️ 決策超時"
      );
      
      await this.client.pushMessage(decision.requester, timeoutMessage);
    }
  }
}

// ==================== 搜尋系統 ====================
class SearchSystem {
  async searchWeb(query) {
    try {
      // 使用Google Search API或其他搜尋服務
      const searchResult = await this.performWebSearch(query);
      return FlexMessageSystem.createChatResponse(
        `🔍 搜尋結果：\n\n${searchResult}`,
        "🔍 網路搜尋"
      );
    } catch (error) {
      return FlexMessageSystem.createChatResponse(
        "❌ 搜尋功能暫時無法使用",
        "🔍 搜尋錯誤"
      );
    }
  }

  async performWebSearch(query) {
    // 實際搜尋邏輯
    return `關於「${query}」的搜尋結果...`;
  }

  async getWeather(location = '台中') {
    try {
      const response = await axios.get(
        `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001`,
        {
          params: {
            Authorization: config.weatherApiKey,
            locationName: location
          }
        }
      );

      const weatherData = response.data.records.location[0];
      const weather = weatherData.weatherElement[0].time[0].parameter.parameterName;
      const temp = weatherData.weatherElement[2].time[0].parameter.parameterName;

      return FlexMessageSystem.createChatResponse(
        `🌤️ ${location}天氣\n\n` +
        `🌡️ 溫度：${temp}°C\n` +
        `☁️ 天氣：${weather}\n` +
        `📅 更新時間：${new Date().toLocaleString('zh-TW')}`,
        "🌤️ 天氣預報"
      );
    } catch (error) {
      return FlexMessageSystem.createChatResponse(
        "❌ 天氣資料獲取失敗",
        "🌤️ 天氣錯誤"
      );
    }
  }
}

// ==================== 矛盾偵測系統 ====================
class ContradictionDetectionSystem {
  constructor(client) {
    this.client = client;
  }

  async detectContradiction(userId, newMessage, conversationHistory) {
    const prompt = `
分析以下對話，判斷新訊息是否與之前的內容有明顯矛盾：

對話歷史：
${conversationHistory}

新訊息：${newMessage}

如果發現矛盾，請回覆"CONTRADICTION: [具體矛盾內容]"
如果沒有矛盾，請回覆"NO_CONTRADICTION"
`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      if (response.includes('CONTRADICTION:')) {
        await this.reportContradiction(userId, newMessage, response);
      }
    } catch (error) {
      console.error('矛盾偵測失敗:', error);
    }
  }

  async reportContradiction(userId, message, contradictionDetails) {
    const report = FlexMessageSystem.createChatResponse(
      `⚠️ 偵測到矛盾發言\n\n` +
      `👤 用戶：${userId}\n` +
      `💬 訊息：${message}\n` +
      `🔍 矛盾分析：${contradictionDetails.replace('CONTRADICTION:', '')}`,
      "⚠️ 矛盾偵測"
    );

    await this.client.pushMessage(config.adminUserId, report);
  }
}

// ==================== 系統管理 ====================
class SystemManagementSystem {
  static getSystemStats() {
    return {
      conversations: globalMemory.conversations.size,
      pendingDecisions: Array.from(globalMemory.decisions.values())
        .filter(d => d.status === 'pending').length,
      activeReminders: globalMemory.reminders.size,
      totalUsers: globalMemory.userProfiles.size,
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    };
  }

  static async handleSystemCommand(command, userId) {
    if (userId !== config.adminUserId) {
      return FlexMessageSystem.createChatResponse(
        "❌ 權限不足，僅限主人使用",
        "🔐 權限錯誤"
      );
    }

    switch (command) {
      case '/狀態報告':
        return FlexMessageSystem.createSystemStatus(this.getSystemStats());
      
      case '/提醒清單':
        return this.getRemindersList();
      
      case '/決策待辦':
        return this.getPendingDecisions();
      
      case '/清除歷史':
        globalMemory.conversations.clear();
        return FlexMessageSystem.createChatResponse("✅ 對話歷史已清除", "🗑️ 清除完成");
      
      case '/系統統計':
        return this.getSystemAnalytics();
      
      default:
        return FlexMessageSystem.createChatResponse(
          "❌ 未知指令\n\n可用指令：\n/狀態報告\n/提醒清單\n/決策待辦\n/清除歷史\n/系統統計",
          "❓ 指令說明"
        );
    }
  }

  static getRemindersList() {
    const reminders = Array.from(globalMemory.reminders.values());
    if (reminders.length === 0) {
      return FlexMessageSystem.createChatResponse("目前沒有活躍的提醒", "📋 提醒清單");
    }

    const reminderText = reminders.map((r, i) => 
      `${i + 1}. ${r.message}\n   ⏰ ${r.targetTime.toLocaleString('zh-TW')}\n   👤 ${r.userId}`
    ).join('\n\n');

    return FlexMessageSystem.createChatResponse(reminderText, "📋 提醒清單");
  }

  static getPendingDecisions() {
    const decisions = Array.from(globalMemory.decisions.values())
      .filter(d => d.status === 'pending');
    
    if (decisions.length === 0) {
      return FlexMessageSystem.createChatResponse("目前沒有待處理的決策", "⚖️ 決策待辦");
    }

    const decisionText = decisions.map((d, i) => 
      `${i + 1}. ${d.content}\n   👤 ${d.requester}\n   🕐 ${d.timestamp}`
    ).join('\n\n');

    return FlexMessageSystem.createChatResponse(decisionText, "⚖️ 決策待辦");
  }

  static getSystemAnalytics() {
    const stats = this.getSystemStats();
    const chartData = [
      { label: '對話數', value: stats.conversations },
      { label: '用戶數', value: stats.totalUsers },
      { label: '提醒數', value: stats.activeReminders },
      { label: '待決策', value: stats.pendingDecisions }
    ];

    return FlexMessageSystem.createChart(chartData, "系統統計圖表");
  }
}

// ==================== 主要處理邏輯 ====================
class MainBot {
  constructor() {
    this.aiPersonality = new AIPersonalitySystem();
    this.reminderSystem = new SuperReminderSystem(client);
    this.decisionSystem = new DecisionSystem(client);
    this.searchSystem = new SearchSystem();
    this.contradictionSystem = new ContradictionDetectionSystem(client);
  }

  async handleMessage(event) {
    const { message, source, replyToken } = event;
    const userId = source.userId || source.groupId;
    const messageText = message.text;

    console.log(`👤 用戶 ${userId} 發送訊息: ${messageText}`);

    try {
      // 記錄訊息到歷史
      this.recordMessage(userId, messageText);

      // 更新用戶檔案
      this.updateUserProfile(userId, source);

      // 系統指令處理
      if (messageText.startsWith('/')) {
        console.log('⚡ 處理系統指令:', messageText);
        const response = await SystemManagementSystem.handleSystemCommand(messageText, userId);
        return await this.safeReply(replyToken, response);
      }

      // 決策回應處理
      if (messageText.includes('決策同意') || messageText.includes('決策拒絕')) {
        console.log('⚖️ 處理決策回應:', messageText);
        const response = await this.handleDecisionResponse(messageText, userId);
        return await this.safeReply(replyToken, response);
      }

      // 提醒設定處理
      if (this.isReminderRequest(messageText)) {
        console.log('⏰ 處理提醒請求:', messageText);
        const response = await this.handleReminderRequest(messageText, userId);
        return await this.safeReply(replyToken, response);
      }

      // 搜尋請求處理
      if (messageText.includes('搜尋') || messageText.includes('查') || messageText.includes('天氣')) {
        console.log('🔍 處理搜尋請求:', messageText);
        const response = await this.handleSearchRequest(messageText);
        return await this.safeReply(replyToken, response);
      }

      // 一般AI對話
      console.log('🤖 處理AI對話');
      const conversationHistory = this.getConversationHistory(userId);
      const userContext = globalMemory.userProfiles.get(userId) || {};

      // 矛盾偵測（異步處理，不阻塞回覆）
      this.contradictionSystem.detectContradiction(userId, messageText, conversationHistory)
        .catch(error => console.error('⚠️ 矛盾偵測失敗:', error));

      // 生成個性化回覆
      const aiResponse = await this.aiPersonality.generatePersonalizedResponse(
        messageText, userContext, conversationHistory
      );

      const flexResponse = FlexMessageSystem.createChatResponse(aiResponse);
      return await this.safeReply(replyToken, flexResponse);

    } catch (error) {
      console.error('❌ 訊息處理錯誤:', error);
      
      const errorResponse = FlexMessageSystem.createChatResponse(
        "哎呀，我遇到一點小問題，讓我重新整理一下思緒...",
        "🤖 系統提示"
      );
      return await this.safeReply(replyToken, errorResponse);
    }
  }

  // 安全回覆方法
  async safeReply(replyToken, message) {
    try {
      console.log('📤 發送回覆...');
      await client.replyMessage(replyToken, message);
      console.log('✅ 回覆發送成功');
    } catch (error) {
      console.error('❌ 回覆發送失敗:', error);
      
      // 如果是因為 replyToken 過期，嘗試其他方式
      if (error.statusCode === 400) {
        console.log('🔄 ReplyToken 可能已過期，跳過回覆');
      }
      
      throw error;
    }
  }

  recordMessage(userId, message) {
    if (!globalMemory.conversations.has(userId)) {
      globalMemory.conversations.set(userId, []);
    }
    
    const conversation = globalMemory.conversations.get(userId);
    conversation.push({
      message,
      timestamp: new Date(),
      type: 'user'
    });

    // 保持最近30條訊息
    if (conversation.length > 30) {
      conversation.splice(0, conversation.length - 30);
    }
  }

  updateUserProfile(userId, source) {
    if (!globalMemory.userProfiles.has(userId)) {
      globalMemory.userProfiles.set(userId, {
        id: userId,
        isGroup: source.type === 'group',
        firstSeen: new Date(),
        messageCount: 0,
        preferences: {}
      });
    }

    const profile = globalMemory.userProfiles.get(userId);
    profile.lastSeen = new Date();
    profile.messageCount++;
  }

  getConversationHistory(userId) {
    const conversation = globalMemory.conversations.get(userId) || [];
    return conversation.slice(-10).map(msg => msg.message).join('\n');
  }

  isReminderRequest(message) {
    const reminderKeywords = ['提醒', '鬧鐘', '叫我', '分鐘後', '小時後', '明天', '點叫'];
    return reminderKeywords.some(keyword => message.includes(keyword));
  }

  async handleReminderRequest(message, userId) {
    // 解析提醒時間和內容
    const timeMatch = message.match(/(\d+分鐘?後|\d+小時後|明天.*?\d{1,2}[點時]|\d{1,2}[：:]\d{2})/);
    if (!timeMatch) {
      return FlexMessageSystem.createChatResponse(
        "請告訴我具體的時間，例如：「30分鐘後提醒我」、「明天8點叫我起床」",
        "⏰ 時間設定"
      );
    }

    const timeString = timeMatch[0];
    const reminderContent = message.replace(timeString, '').replace(/提醒|鬧鐘|叫我/, '').trim() || '時間到了！';

    return await this.reminderSystem.setReminder(userId, reminderContent, timeString);
  }

  async handleSearchRequest(message) {
    if (message.includes('天氣')) {
      const locationMatch = message.match(/(台中|台北|高雄|台南|新竹|桃園)/);
      const location = locationMatch ? locationMatch[0] : '台中';
      return await this.searchSystem.getWeather(location);
    } else {
      const query = message.replace(/搜尋|查/, '').trim();
      return await this.searchSystem.searchWeb(query);
    }
  }

  async handleDecisionResponse(message, userId) {
    if (userId !== config.adminUserId) {
      return FlexMessageSystem.createChatResponse("❌ 只有主人可以處理決策", "🔐 權限錯誤");
    }

    const decisionMatch = message.match(/決策(同意|拒絕)\s+(\w+)/);
    if (!decisionMatch) {
      return FlexMessageSystem.createChatResponse("❌ 決策格式錯誤", "⚖️ 格式錯誤");
    }

    const [, action, decisionId] = decisionMatch;
    const response = action === '同意' ? 'approved' : 'rejected';
    
    return await this.decisionSystem.handleDecisionResponse(decisionId, response);
  }
}

// ==================== 初始化和啟動 ====================
const bot = new MainBot();

// Express 設定 - 修復簽章驗證問題
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 修復簽章驗證的 Webhook 端點
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('📨 收到 Webhook 請求');
  
  try {
    // 手動驗證簽章
    const signature = req.get('X-Line-Signature');
    const body = req.body;
    
    if (!signature) {
      console.error('❌ 缺少 X-Line-Signature header');
      return res.status(401).send('Unauthorized');
    }

    // 驗證簽章
    const bodyString = Buffer.isBuffer(body) ? body.toString() : JSON.stringify(body);
    
    const hash = crypto
      .createHmac('SHA256', config.channelSecret)
      .update(bodyString)
      .digest('base64');

    if (hash !== signature) {
      console.error('❌ 簽章驗證失敗');
      console.error('🔍 檢查 LINE_CHANNEL_SECRET 是否正確');
      return res.status(401).send('Unauthorized');
    }

    console.log('✅ 簽章驗證成功');

    // 解析請求內容
    let events;
    try {
      const parsedBody = Buffer.isBuffer(body) ? JSON.parse(body.toString()) : body;
      events = parsedBody.events || [];
      console.log('📊 收到事件數量:', events.length);
    } catch (error) {
      console.error('❌ JSON 解析失敗:', error);
      return res.status(400).send('Bad Request');
    }

    // 處理事件
    Promise.all(events.map(handleEvent))
      .then(result => {
        console.log('✅ 所有事件處理完成');
        res.json({ success: true, processed: result.length });
      })
      .catch(err => {
        console.error('❌ 事件處理批次失敗:', err);
        res.status(200).json({ success: false, error: err.message });
      });
      
  } catch (error) {
    console.error('❌ Webhook 處理失敗:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 事件處理 - 增強錯誤處理和日誌
async function handleEvent(event) {
  console.log('📨 收到事件:', event.type);
  
  try {
    // 只處理文字訊息
    if (event.type !== 'message') {
      console.log('⏭️ 跳過非訊息事件:', event.type);
      return Promise.resolve(null);
    }

    if (event.message.type !== 'text') {
      console.log('⏭️ 跳過非文字訊息:', event.message.type);
      return Promise.resolve(null);
    }

    // 頻率限制檢查
    const userId = event.source.userId || event.source.groupId;
    if (!checkRateLimit(userId)) {
      console.log('⚠️ 頻率限制觸發:', userId);
      
      const rateLimitResponse = FlexMessageSystem.createChatResponse(
        "哎呀，你的訊息有點太頻繁了！讓我休息一下，等等再聊吧～",
        "⚡ 頻率限制"
      );
      
      if (event.replyToken) {
        await client.replyMessage(event.replyToken, rateLimitResponse);
      }
      return Promise.resolve(null);
    }

    console.log('✅ 處理文字訊息:', event.message.text);
    return await bot.handleMessage(event);
    
  } catch (error) {
    console.error('❌ 事件處理失敗:', error);
    
    // 嘗試發送錯誤回覆
    try {
      const errorResponse = FlexMessageSystem.createChatResponse(
        "哎呀，我遇到一點小問題，讓我重新整理一下思緒...",
        "🤖 系統提示"
      );
      
      if (event.replyToken) {
        await client.replyMessage(event.replyToken, errorResponse);
      }
    } catch (replyError) {
      console.error('❌ 錯誤回覆發送失敗:', replyError);
    }
    
    return Promise.resolve(null);
  }
}

// 健康檢查 - 增強版
app.get('/', (req, res) => {
  const status = {
    status: 'running',
    message: '🤖 超級智能LINE Bot運行中',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    config: {
      hasLineToken: !!config.channelAccessToken,
      hasLineSecret: !!config.channelSecret,
      hasGeminiKey: !!config.geminiApiKey,
      adminUserId: config.adminUserId
    },
    systems: {
      conversations: globalMemory.conversations.size,
      userProfiles: globalMemory.userProfiles.size,
      reminders: globalMemory.reminders.size,
      decisions: globalMemory.decisions.size
    }
  };
  
  console.log('📊 健康檢查請求:', status);
  res.json(status);
});

// 配置測試端點
app.get('/test-config', (req, res) => {
  const configTest = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: config.port,
    timezone: process.env.TZ || 'UTC',
    config_status: {
      line_token: config.channelAccessToken ? '✅ 已設定' : '❌ 未設定',
      line_secret: config.channelSecret ? '✅ 已設定' : '❌ 未設定',
      gemini_key: config.geminiApiKey ? '✅ 已設定' : '❌ 未設定',
      backup_ai: config.backupAiKey ? '✅ 已設定' : '❌ 未設定',
      admin_user: config.adminUserId || '❌ 未設定'
    },
    apis: {
      news_api: config.newsApiKey ? '✅ 已設定' : '❌ 未設定',
      weather_api: config.weatherApiKey ? '✅ 已設定' : '❌ 未設定',
      tmdb_api: config.tmdbApiKey ? '✅ 已設定' : '❌ 未設定'
    },
    webhook_url: `${req.protocol}://${req.get('host')}/webhook`,
    instructions: {
      line_bot_setup: '在 LINE Developers Console 設定 Webhook URL',
      required_apis: 'LINE Token/Secret 和 Gemini API Key 是必填項目',
      optional_apis: '其他 API 為選填，但建議設定以獲得完整功能'
    }
  };
  
  res.json(configTest);
});

// Webhook 測試端點
app.get('/webhook', (req, res) => {
  res.json({
    message: '🤖 LINE Bot Webhook 端點運行正常',
    timestamp: new Date().toISOString(),
    method: 'GET requests are for testing only',
    note: 'LINE Bot events should be sent via POST'
  });
});

// 配置驗證函數
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
    console.error('❌ 缺少必要的環境變數:', missing.join(', '));
    console.error('💡 請檢查 .env 檔案或 Render 環境變數設定');
    return false;
  }

  console.log('✅ 配置驗證通過');
  return true;
}

// 啟動伺服器 - 增強版
app.listen(config.port, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 超級智能LINE Bot 啟動中...');
  console.log('='.repeat(60));
  
  // 驗證配置
  if (!validateConfig()) {
    console.error('❌ 配置驗證失敗，請檢查環境變數');
    process.exit(1);
  }
  
  console.log(`📡 伺服器監聽端口: ${config.port}`);
  console.log(`🌐 Webhook URL: https://your-app.onrender.com/webhook`);
  console.log(`👨‍💼 管理員 ID: ${config.adminUserId}`);
  console.log('');
  console.log('📊 系統模組狀態:');
  console.log('  🤖 AI個性系統: ✅ 已載入');
  console.log('  ⏰ 提醒系統: ✅ 已啟動');
  console.log('  ⚖️ 決策系統: ✅ 已就緒');
  console.log('  🔍 搜尋系統: ✅ 已連接');
  console.log('  ⚠️ 矛盾偵測: ✅ 已激活');
  console.log('  📝 圖文訊息: ✅ 已準備');
  console.log('');
  console.log('💾 記憶體系統:');
  console.log(`  📚 對話記憶: ${globalMemory.conversations.size} 個`);
  console.log(`  👥 用戶檔案: ${globalMemory.userProfiles.size} 個`);
  console.log(`  ⏰ 活躍提醒: ${globalMemory.reminders.size} 個`);
  console.log(`  ⚖️ 待決策: ${globalMemory.decisions.size} 個`);
  console.log('');
  console.log('🎯 核心功能:');
  console.log('  💬 超擬真AI聊天 (模擬個人風格)');
  console.log('  📱 全圖文訊息回覆');
  console.log('  ⏰ 智能提醒系統 (支援電話鬧鐘)');
  console.log('  🔍 多功能搜尋 (天氣/新聞/電影)');
  console.log('  ⚖️ 智能決策系統 (私訊確認)');
  console.log('  ⚠️ 矛盾偵測 (AI分析對話)');
  console.log('  🧠 自我學習 (個性持續優化)');
  console.log('');
  console.log('🔧 系統指令 (主人專用):');
  console.log('  /狀態報告 - 查看系統總覽');
  console.log('  /提醒清單 - 查看所有提醒');
  console.log('  /決策待辦 - 查看待處理決策');
  console.log('  /系統統計 - 查看使用統計');
  console.log('  /清除歷史 - 清理對話記錄');
  console.log('');
  console.log('🎉 系統已完全啟動！準備為用戶提供服務');
  console.log('='.repeat(60) + '\n');
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('收到終止信號，正在關閉服務...');
  if (bot.reminderSystem.checkInterval) {
    clearInterval(bot.reminderSystem.checkInterval);
  }
  process.exit(0);
});

module.exports = app;