const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('🚀 正在啟動終極進化版 LINE Bot v7.0 - 顧晉瑋的超智能助手...');
console.log('⏰ 當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

// 配置資訊
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b';

// 智能 API 配置
const SMART_AI_CONFIG = {
  apiKey: process.env.BACKUP_AI_KEY || 'sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM',
  baseURL: process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1',
  
  models: {
    premium: {
      'gpt-4o': { limit: 5, priority: 9, cost: 10 },
      'gpt-4.1': { limit: 5, priority: 9, cost: 10 }
    },
    advanced: {
      'deepseek-r1': { limit: 30, priority: 8, cost: 5 },
      'deepseek-v3': { limit: 30, priority: 7, cost: 5 }
    },
    standard: {
      'grok': { limit: 200, priority: 10, cost: 3 },
      'gpt-4o-mini': { limit: 200, priority: 6, cost: 2 },
      'gpt-3.5-turbo': { limit: 200, priority: 5, cost: 1 }
    }
  }
};

// 用戶配置
const MY_LINE_ID = 'U59af77e69411ffb99a49f1f2c3e2afc4'; // 你的LINE ID
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 智能 API 管理系統
class SmartAPIManager {
  constructor() {
    this.dailyUsage = new Map();
    this.lastResetDate = new Date().toDateString();
    this.modelPerformance = new Map();
    this.initializeUsageTracking();
    console.log('🧠 智能 API 管理系統已初始化');
  }

  initializeUsageTracking() {
    ['premium', 'advanced', 'standard'].forEach(tier => {
      Object.keys(SMART_AI_CONFIG.models[tier]).forEach(model => {
        this.dailyUsage.set(model, 0);
        this.modelPerformance.set(model, {
          successRate: 100,
          avgResponseTime: 1000,
          totalRequests: 0,
          successfulRequests: 0
        });
      });
    });
  }

  resetDailyUsageIfNeeded() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyUsage.clear();
      this.initializeUsageTracking();
      this.lastResetDate = today;
    }
  }

  analyzeRequestComplexity(prompt, context = {}) {
    let complexity = 1;
    
    if (prompt.length > 500) complexity += 2;
    else if (prompt.length > 200) complexity += 1;
    
    const complexKeywords = [
      '決策', '分析', '評估', '建議', '策略', '學習', '修改', '程式碼',
      '功能', '開發', '設計', '創作', '重要', '緊急', '問題'
    ];
    
    complexity += complexKeywords.filter(keyword => prompt.includes(keyword)).length;
    
    if (context.isDecision) complexity += 3;
    if (context.isLearning) complexity += 2;
    if (context.isTechnical) complexity += 2;
    
    return Math.min(complexity, 10);
  }

  selectOptimalModel(complexity, context = {}) {
    this.resetDailyUsageIfNeeded();
    
    let selectedTier = 'standard';
    if (complexity >= 8 || context.isDecision) {
      selectedTier = 'premium';
    } else if (complexity >= 5 || context.isLearning || context.isTechnical) {
      selectedTier = 'advanced';
    }
    
    const availableModels = Object.entries(SMART_AI_CONFIG.models[selectedTier])
      .filter(([model, config]) => {
        const usage = this.dailyUsage.get(model) || 0;
        return usage < config.limit;
      })
      .sort((a, b) => b[1].priority - a[1].priority);
    
    if (availableModels.length > 0) {
      const selectedModel = availableModels[0][0];
      return { model: selectedModel, tier: selectedTier, complexity };
    }
    
    // 降級處理
    if (selectedTier !== 'standard') {
      return this.selectOptimalModel(complexity - 2, { ...context, downgraded: true });
    }
    
    return { model: 'grok', tier: 'standard', complexity };
  }

  async callModel(prompt, modelInfo, context = {}) {
    const { model, tier } = modelInfo;
    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${SMART_AI_CONFIG.baseURL}/chat/completions`, {
        model: model,
        messages: [
          {
            role: 'system',
            content: this.generateSystemPrompt(tier, context)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: tier === 'premium' ? 500 : (tier === 'advanced' ? 400 : 300),
        temperature: context.isCreative ? 0.9 : 0.8
      }, {
        headers: {
          'Authorization': `Bearer ${SMART_AI_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      });

      const responseTime = Date.now() - startTime;
      this.recordUsage(model, true, responseTime);
      
      return response.data.choices[0].message.content.trim();
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordUsage(model, false, responseTime);
      throw error;
    }
  }

  recordUsage(model, success, responseTime) {
    const currentUsage = this.dailyUsage.get(model) || 0;
    this.dailyUsage.set(model, currentUsage + 1);
    
    const perf = this.modelPerformance.get(model);
    perf.totalRequests++;
    
    if (success) {
      perf.successfulRequests++;
      perf.avgResponseTime = (perf.avgResponseTime + responseTime) / 2;
    }
    
    perf.successRate = (perf.successfulRequests / perf.totalRequests) * 100;
  }

  generateSystemPrompt(tier, context) {
    let basePrompt = '你是顧晉瑋，靜宜大學資管系學生，對科技AI有高度興趣。說話自然有趣，會用台灣口語。';
    
    if (tier === 'premium') {
      basePrompt += '這是頂級AI模型調用，請發揮專業技術背景，提供最高質量的深度分析。';
    } else if (tier === 'advanced') {
      basePrompt += '這是高級AI模型調用，請用資管系專業知識提供詳細分析。';
    } else {
      basePrompt += '請用親切隨和的語氣回應。';
    }
    
    return basePrompt;
  }

  getUsageReport() {
    this.resetDailyUsageIfNeeded();
    
    const report = { date: new Date().toDateString(), usage: {} };
    
    ['premium', 'advanced', 'standard'].forEach(tier => {
      report.usage[tier] = {};
      Object.entries(SMART_AI_CONFIG.models[tier]).forEach(([model, config]) => {
        const usage = this.dailyUsage.get(model) || 0;
        const perf = this.modelPerformance.get(model);
        
        report.usage[tier][model] = {
          used: usage,
          limit: config.limit,
          percentage: Math.round((usage / config.limit) * 100),
          successRate: Math.round(perf.successRate)
        };
      });
    });
    
    return report;
  }
}

// 決策詢問系統
class DecisionInquirySystem {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionHistory = new Map();
    this.awaitingDecisions = new Set();
    console.log('🔐 決策詢問系統已初始化');
  }

  async requestDecision(context, question, originalReplyToken, originalUserId, groupId = null) {
    const decisionId = `decision-${Date.now()}`;
    
    this.pendingDecisions.set(decisionId, {
      context,
      question,
      originalReplyToken,
      originalUserId,
      groupId,
      timestamp: new Date(),
      status: 'pending'
    });

    this.awaitingDecisions.add(originalUserId);

    try {
      const inquiryMessage = {
        type: 'template',
        altText: `🤔 需要你的決策：${question}`,
        template: {
          type: 'buttons',
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop',
          title: '🤔 決策請求',
          text: `${context}\n\n${question}`.substring(0, 160),
          actions: [
            {
              type: 'postback',
              label: '✅ 同意執行',
              data: `decision:${decisionId}:approve`,
              displayText: '我同意這個決策'
            },
            {
              type: 'postback',
              label: '❌ 拒絕執行',
              data: `decision:${decisionId}:reject`,
              displayText: '我拒絕這個決策'
            },
            {
              type: 'postback',
              label: '💬 需要更多資訊',
              data: `decision:${decisionId}:info`,
              displayText: '我需要更多資訊'
            }
          ]
        }
      };

      await client.pushMessage(MY_LINE_ID, inquiryMessage);
      console.log(`📨 決策請求已發送: ${question}`);
      
      // 暫時回覆給原用戶
      if (originalReplyToken && !replyTokenManager.isTokenUsed(originalReplyToken)) {
        await safeReply(originalReplyToken, {
          type: 'text',
          text: '🤔 讓我考慮一下這個請求，稍等片刻...'
        });
      }
      
      return decisionId;
      
    } catch (error) {
      console.error('💥 發送決策請求失敗:', error);
      this.awaitingDecisions.delete(originalUserId);
      return null;
    }
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
        userMessage = '✅ 經過考慮，我決定處理你的請求！';
        // 這裡可以執行實際的決策行動
        break;
      case 'reject':
        responseMessage = '❌ 已拒絕決策';
        userMessage = '❌ 抱歉，經過仔細考慮後我無法處理這個請求。';
        break;
      case 'info':
        responseMessage = '💬 需要更多資訊';
        userMessage = '🤔 我需要更多資訊才能處理，能詳細說明一下嗎？';
        break;
    }

    await safeReply(responseToken, { type: 'text', text: responseMessage });

    // 通知原用戶
    try {
      if (decision.groupId) {
        await client.pushMessage(decision.groupId, { type: 'text', text: userMessage });
      } else if (decision.originalUserId !== MY_LINE_ID) {
        await client.pushMessage(decision.originalUserId, { type: 'text', text: userMessage });
      }
    } catch (error) {
      console.error('💥 通知用戶失敗:', error);
    }

    this.awaitingDecisions.delete(decision.originalUserId);
    this.decisionHistory.set(decisionId, decision);
    this.pendingDecisions.delete(decisionId);

    return responseMessage;
  }

  shouldRequestDecision(message) {
    const decisionKeywords = [
      /刪除.*檔案/, /修改.*程式/, /重啟.*系統/, /更新.*設定/,
      /清空.*資料/, /移除.*所有/, /重置.*/, /格式化/,
      /發送.*所有人/, /群發/, /廣播/, /通知.*所有/,
      /執行.*指令/, /運行.*腳本/, /啟動.*功能/,
      /購買/, /付款/, /轉帳/, /交易/,
      /封鎖/, /解封/, /刪除.*用戶/, /踢出/,
      /公開.*隱私/, /洩露.*資訊/, /分享.*個資/
    ];

    return decisionKeywords.some(pattern => pattern.test(message));
  }
}

// 矛盾檢測系統
class ContradictionDetectionSystem {
  constructor() {
    this.userStatements = new Map();
    this.contradictionHistory = new Map();
    this.sensitiveTopics = ['工作', '學習', '感情', '計畫', '意見', '喜好', '政治', '投資'];
    console.log('🔍 矛盾檢測系統已初始化');
  }

  async analyzeStatement(userId, userName, message) {
    if (!this.userStatements.has(userId)) {
      this.userStatements.set(userId, []);
    }

    const userHistory = this.userStatements.get(userId);
    const currentStatement = {
      message,
      timestamp: new Date(),
      topics: this.extractTopics(message),
      sentiment: this.analyzeSentiment(message),
      stance: this.extractStance(message)
    };

    // 異步檢測矛盾
    setImmediate(async () => {
      try {
        const contradiction = await this.detectContradiction(userHistory, currentStatement);
        
        if (contradiction) {
          await this.handleContradiction(userId, userName, contradiction);
        }
      } catch (error) {
        console.error('矛盾檢測錯誤:', error.message);
      }
    });

    userHistory.push(currentStatement);
    
    // 保持最近20條記錄
    if (userHistory.length > 20) {
      userHistory.shift();
    }
  }

  extractTopics(message) {
    const topics = [];
    this.sensitiveTopics.forEach(topic => {
      if (message.includes(topic)) {
        topics.push(topic);
      }
    });
    return topics;
  }

  analyzeSentiment(message) {
    const positiveWords = ['喜歡', '愛', '好', '棒', '讚', '開心', '滿意', '同意', '支持'];
    const negativeWords = ['討厭', '恨', '壞', '爛', '不好', '難過', '不滿', '反對', '不同意'];
    
    let score = 0;
    positiveWords.forEach(word => {
      if (message.includes(word)) score += 1;
    });
    negativeWords.forEach(word => {
      if (message.includes(word)) score -= 1;
    });
    
    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
  }

  extractStance(message) {
    if (message.includes('支持') || message.includes('贊成')) return 'support';
    if (message.includes('反對') || message.includes('不同意')) return 'oppose';
    if (message.includes('喜歡') || message.includes('愛')) return 'like';
    if (message.includes('討厭') || message.includes('不喜歡')) return 'dislike';
    return 'neutral';
  }

  async detectContradiction(userHistory, currentStatement) {
    for (const pastStatement of userHistory.slice(-10)) {
      const commonTopics = currentStatement.topics.filter(topic => 
        pastStatement.topics.includes(topic)
      );

      if (commonTopics.length > 0) {
        if (this.isContradictory(pastStatement, currentStatement)) {
          const timeDiff = currentStatement.timestamp - pastStatement.timestamp;
          
          // 在1小時內的矛盾才報告
          if (timeDiff < 3600000) {
            return {
              type: 'stance_change',
              topic: commonTopics[0],
              pastStatement: pastStatement.message,
              currentStatement: currentStatement.message,
              timeDiff: Math.round(timeDiff / 60000)
            };
          }
        }
      }
    }
    return null;
  }

  isContradictory(past, current) {
    // 情感矛盾
    if ((past.sentiment === 'positive' && current.sentiment === 'negative') ||
        (past.sentiment === 'negative' && current.sentiment === 'positive')) {
      return true;
    }

    // 立場矛盾
    const contradictoryStances = {
      'support': 'oppose',
      'oppose': 'support',
      'like': 'dislike',
      'dislike': 'like'
    };

    if (contradictoryStances[past.stance] === current.stance) {
      return true;
    }

    return false;
  }

  async handleContradiction(userId, userName, contradiction) {
    const contradictionId = `contra-${Date.now()}`;
    
    this.contradictionHistory.set(contradictionId, {
      userId,
      userName,
      contradiction,
      timestamp: new Date()
    });

    const reportMessage = `🔍 偵測到矛盾發言

👤 用戶：${userName}
📝 話題：${contradiction.topic}
⏰ 時間間隔：${contradiction.timeDiff} 分鐘

📜 之前說：「${contradiction.pastStatement}」

🆕 現在說：「${contradiction.currentStatement}」

💡 這可能表示用戶改變了想法，或需要進一步了解。`;

    try {
      await client.pushMessage(MY_LINE_ID, {
        type: 'text',
        text: reportMessage
      });

      console.log(`🔍 矛盾檢測報告已發送: ${userName} - ${contradiction.topic}`);
      
    } catch (error) {
      console.error('💥 發送矛盾報告失敗:', error.message);
    }
  }
}

// 天氣系統（修復版）
class WeatherSystem {
  constructor() {
    this.apiKey = WEATHER_API_KEY;
    console.log('🌤️ 天氣查詢系統已初始化');
  }

  async getWeather(cityName) {
    try {
      console.log(`🌤️ 查詢天氣: ${cityName}`);
      
      // 使用中央氣象署API
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
        // 如果找不到城市，嘗試模糊搜尋
        return await this.searchWeatherByFuzzyMatch(cityName);
      }
    } catch (error) {
      console.error('💥 天氣查詢錯誤:', error.message);
      return this.getFallbackWeather(cityName);
    }
  }

  async searchWeatherByFuzzyMatch(cityName) {
    try {
      // 獲取所有可用地點
      const response = await axios.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001', {
        params: {
          Authorization: this.apiKey
        },
        timeout: 10000
      });

      if (response.data.success === 'true') {
        const locations = response.data.records.location;
        
        // 模糊搜尋
        const matchedLocation = locations.find(location => 
          location.locationName.includes(cityName) || 
          cityName.includes(location.locationName)
        );

        if (matchedLocation) {
          return this.formatWeatherData(matchedLocation);
        }
      }
      
      throw new Error('找不到匹配的城市');
    } catch (error) {
      return this.getFallbackWeather(cityName);
    }
  }

  formatWeatherData(locationData) {
    const weather = locationData.weatherElement;
    
    const minTemp = weather.find(el => el.elementName === 'MinT');
    const maxTemp = weather.find(el => el.elementName === 'MaxT');
    const wx = weather.find(el => el.elementName === 'Wx');
    const pop = weather.find(el => el.elementName === 'PoP');
    const ci = weather.find(el => el.elementName === 'CI');

    return {
      location: locationData.locationName,
      minTemp: minTemp?.time[0]?.parameter?.parameterName || 'N/A',
      maxTemp: maxTemp?.time[0]?.parameter?.parameterName || 'N/A',
      weather: wx?.time[0]?.parameter?.parameterName || 'N/A',
      rainChance: pop?.time[0]?.parameter?.parameterName || 'N/A',
      comfort: ci?.time[0]?.parameter?.parameterName || 'N/A',
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
      comfort: '舒適',
      updateTime: new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}),
      isFallback: true
    };
  }

  extractCityFromText(text) {
    const cities = [
      '台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', 
      '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', 
      '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江',
      '臺北', '臺中', '臺南', '臺東'
    ];
    
    for (const city of cities) {
      if (text.includes(city)) {
        return city;
      }
    }
    return '台北'; // 預設台北
  }
}

// 任務管理系統
class TaskManagementSystem {
  constructor() {
    this.tasks = new Map();
    this.scheduledTasks = new Map();
    this.taskHistory = new Map();
    console.log('📋 任務管理系統已初始化');
  }

  createTask(userId, taskType, schedule, content, target = null) {
    const taskId = `task-${userId}-${Date.now()}`;
    
    const task = {
      id: taskId,
      userId,
      taskType,
      schedule,
      content,
      target: target || userId,
      created: new Date(),
      active: true,
      lastExecuted: null,
      executionCount: 0
    };

    this.tasks.set(taskId, task);
    this.scheduleTask(task);
    
    console.log(`📋 新任務已創建: ${taskType} - ${schedule}`);
    return taskId;
  }

  scheduleTask(task) {
    try {
      let nextExecution = this.calculateNextExecution(task.schedule);
      
      if (nextExecution) {
        const delay = nextExecution.getTime() - Date.now();
        
        if (delay > 0) {
          const timerId = setTimeout(async () => {
            await this.executeTask(task.id);
          }, delay);
          
          this.scheduledTasks.set(task.id, {
            timerId,
            nextExecution
          });
          
          console.log(`⏰ 任務已排程: ${task.id} - ${nextExecution.toLocaleString('zh-TW')}`);
        }
      }
    } catch (error) {
      console.error('任務排程錯誤:', error);
    }
  }

  calculateNextExecution(schedule) {
    const now = new Date();
    
    // 解析 "每天早上9點" 這種格式
    if (schedule.includes('每天') && schedule.includes('點')) {
      const hourMatch = schedule.match(/(\d{1,2})點/);
      if (hourMatch) {
        const hour = parseInt(hourMatch[1]);
        const nextExecution = new Date(now);
        nextExecution.setHours(hour, 0, 0, 0);
        
        // 如果今天的時間已過，設定為明天
        if (nextExecution <= now) {
          nextExecution.setDate(nextExecution.getDate() + 1);
        }
        
        return nextExecution;
      }
    }
    
    // 可以擴展更多時間格式
    return null;
  }

  async executeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || !task.active) {
      console.log(`⚠️ 任務 ${taskId} 已失效或被取消`);
      return;
    }

    console.log(`🔄 正在執行任務: ${task.taskType}`);

    try {
      let message = null;

      switch (task.taskType) {
        case 'daily_news':
          message = await this.generateDailyNews();
          break;
        case 'weather_report':
          message = await this.generateWeatherReport();
          break;
        case 'custom_message':
          message = { type: 'text', text: task.content };
          break;
        default:
          message = { type: 'text', text: `📋 定時任務：${task.content}` };
      }

      if (message) {
        await client.pushMessage(task.target, message);

        // 更新任務狀態
        task.lastExecuted = new Date();
        task.executionCount++;

        console.log(`✅ 任務執行成功: ${task.taskType}`);

        // 重新排程下次執行
        this.scheduleTask(task);
      }

    } catch (error) {
      console.error(`💥 任務執行失敗 (${taskId}):`, error.message);
    }
  }

  async generateDailyNews() {
    try {
      const newsResponse = await axios.get('https://newsapi.org/v2/top-headlines', {
        params: {
          country: 'tw',
          apiKey: NEWS_API_KEY,
          pageSize: 5
        },
        timeout: 10000
      });

      if (newsResponse.data.articles && newsResponse.data.articles.length > 0) {
        let newsText = `🗞️ 每日新聞摘要 ${new Date().toLocaleDateString('zh-TW')}\n\n`;
        
        newsResponse.data.articles.slice(0, 3).forEach((article, index) => {
          newsText += `${index + 1}. ${article.title}\n`;
          if (article.description) {
            newsText += `📄 ${article.description.substring(0, 80)}...\n`;
          }
          newsText += `\n`;
        });

        newsText += `\n📱 以上是今日重要新聞，祝你有美好的一天！`;

        return { type: 'text', text: newsText };
      }
    } catch (error) {
      console.error('新聞獲取失敗:', error);
    }

    return { 
      type: 'text', 
      text: `🗞️ 每日新聞摘要\n\n抱歉，今日新聞獲取暫時有問題，請稍後查看其他新聞來源 📰` 
    };
  }

  async generateWeatherReport() {
    try {
      const weatherData = await weatherSystem.getWeather('台北');
      return {
        type: 'text',
        text: `🌤️ 今日天氣報告\n\n📍 ${weatherData.location}\n🌡️ ${weatherData.minTemp}°C - ${weatherData.maxTemp}°C\n☁️ ${weatherData.weather}\n☔ 降雨機率 ${weatherData.rainChance}%\n\n記得根據天氣調整穿著！`
      };
    } catch (error) {
      return {
        type: 'text',
        text: '🌤️ 今日天氣報告\n\n天氣查詢暫時無法使用，請查看天氣App獲取最新資訊 📱'
      };
    }
  }

  getUserTasks(userId) {
    return Array.from(this.tasks.values())
      .filter(task => task.userId === userId && task.active)
      .sort((a, b) => b.created - a.created);
  }

  deleteTask(taskId, userId) {
    const task = this.tasks.get(taskId);
    if (task && task.userId === userId) {
      task.active = false;
      
      // 清除排程
      const scheduled = this.scheduledTasks.get(taskId);
      if (scheduled) {
        clearTimeout(scheduled.timerId);
        this.scheduledTasks.delete(taskId);
      }
      
      console.log(`🗑️ 任務已刪除: ${taskId}`);
      return true;
    }
    return false;
  }

  parseTaskRequest(message) {
    const taskPatterns = [
      {
        pattern: /每天.*?(\d{1,2})點.*?給我.*?新聞/,
        type: 'daily_news',
        extract: (match) => ({ schedule: `每天${match[1]}點`, content: '新聞' })
      },
      {
        pattern: /每天.*?(\d{1,2})點.*?天氣/,
        type: 'weather_report',
        extract: (match) => ({ schedule: `每天${match[1]}點`, content: '天氣' })
      },
      {
        pattern: /每天.*?(\d{1,2})點.*?提醒我(.+)/,
        type: 'custom_message',
        extract: (match) => ({ schedule: `每天${match[1]}點`, content: match[2].trim() })
      }
    ];

    for (const taskPattern of taskPatterns) {
      const match = message.match(taskPattern.pattern);
      if (match) {
        const extracted = taskPattern.extract(match);
        return {
          taskType: taskPattern.type,
          schedule: extracted.schedule,
          content: extracted.content
        };
      }
    }
    
    return null;
  }
}

// 自學系統
class SelfLearningSystem {
  constructor() {
    this.learningHistory = new Map();
    this.codeModificationHistory = new Map();
    this.backupCode = '';
    console.log('🧠 自學系統已初始化');
  }

  async analyzeFeatureRequest(userId, request) {
    try {
      const complexity = smartAPIManager.analyzeRequestComplexity(request, { isLearning: true, isTechnical: true });
      const modelInfo = smartAPIManager.selectOptimalModel(complexity, { isLearning: true, isTechnical: true });
      
      const analysisPrompt = `分析這個功能需求並提供實現方案：

用戶需求：${request}

請分析：
1. 功能的可行性 (1-10分)
2. 實現難度 (1-10分)
3. 需要的技術組件
4. 可能的風險
5. 簡單的實現思路

以JSON格式回答：
{
  "feasibility": 8,
  "difficulty": 6,
  "components": ["API", "資料庫", "排程器"],
  "risks": ["資料安全", "效能問題"],
  "implementation": "詳細實現步驟...",
  "canImplement": true,
  "estimatedTime": "2小時"
}`;

      const analysis = await smartAPIManager.callModel(analysisPrompt, modelInfo, { isLearning: true, isTechnical: true });
      
      try {
        const parsedAnalysis = JSON.parse(analysis);
        
        // 記錄學習歷史
        this.learningHistory.set(`learning-${Date.now()}`, {
          userId,
          request,
          analysis: parsedAnalysis,
          timestamp: new Date()
        });
        
        return parsedAnalysis;
      } catch (parseError) {
        console.error('分析結果解析失敗:', parseError);
        return null;
      }
    } catch (error) {
      console.error('功能分析失敗:', error);
      return null;
    }
  }

  async implementFeature(userId, request, analysis) {
    try {
      if (!analysis || !analysis.canImplement) {
        return {
          success: false,
          message: '抱歉，這個功能太複雜或風險太高，我無法安全地實現。'
        };
      }

      // 備份當前代碼
      this.backupCode = await this.getCurrentCode();
      
      const complexity = smartAPIManager.analyzeRequestComplexity(request, { isLearning: true, isTechnical: true });
      const modelInfo = smartAPIManager.selectOptimalModel(complexity, { isLearning: true, isTechnical: true });
      
      const implementationPrompt = `基於分析結果，生成安全的代碼實現：

功能需求：${request}
分析結果：${JSON.stringify(analysis)}

請生成：
1. 安全的代碼實現
2. 詳細的實現說明
3. 測試方法
4. 回滾計畫

重要：代碼必須安全，不能破壞現有功能！

以JSON格式回答：
{
  "code": "// 新增的代碼...",
  "explanation": "實現說明...",
  "testMethod": "測試方法...",
  "rollbackPlan": "回滾計畫...",
  "safetyLevel": 9
}`;

      const implementation = await smartAPIManager.callModel(implementationPrompt, modelInfo, { isLearning: true, isTechnical: true });
      
      try {
        const parsedImplementation = JSON.parse(implementation);
        
        if (parsedImplementation.safetyLevel >= 7) {
          // 記錄代碼修改歷史
          const modificationId = `mod-${Date.now()}`;
          this.codeModificationHistory.set(modificationId, {
            userId,
            request,
            implementation: parsedImplementation,
            timestamp: new Date(),
            applied: false,
            backupCode: this.backupCode
          });
          
          // 發送實現報告給用戶
          await this.sendImplementationReport(userId, request, parsedImplementation);
          
          return {
            success: true,
            message: '功能分析完成！我已經設計了實現方案，但為了安全起見，我不會直接修改代碼。實現方案已發送給你參考。'
          };
        } else {
          return {
            success: false,
            message: '這個實現方案的安全等級不夠高，為了保護系統穩定性，我不建議實現。'
          };
        }
      } catch (parseError) {
        console.error('實現結果解析失敗:', parseError);
        return {
          success: false,
          message: '代碼生成過程出現問題，請稍後再試。'
        };
      }
    } catch (error) {
      console.error('功能實現失敗:', error);
      return {
        success: false,
        message: '功能實現過程中出現錯誤，請稍後再試。'
      };
    }
  }

  async sendImplementationReport(userId, request, implementation) {
    try {
      const reportMessage = `🧠 自學功能實現報告

📝 功能需求：${request}

🔧 實現方案：
${implementation.explanation}

💡 測試方法：
${implementation.testMethod}

⚠️ 安全等級：${implementation.safetyLevel}/10

🔄 回滾計畫：
${implementation.rollbackPlan}

📋 代碼片段：
\`\`\`javascript
${implementation.code.substring(0, 500)}...
\`\`\`

為了系統安全，我沒有直接修改程式碼，但提供了完整的實現方案供你參考。如果你需要實際應用，請手動檢查後再執行。`;

      await client.pushMessage(userId, {
        type: 'text',
        text: reportMessage
      });

      console.log(`📨 實現報告已發送給用戶: ${userId}`);
      
    } catch (error) {
      console.error('💥 發送實現報告失敗:', error);
    }
  }

  async getCurrentCode() {
    try {
      // 這裡可以實現讀取當前代碼的邏輯
      // 為了安全起見，這裡只返回一個簡單的備份標記
      return `// 代碼備份 - ${new Date().toISOString()}`;
    } catch (error) {
      console.error('獲取當前代碼失敗:', error);
      return '';
    }
  }

  isFeatureRequest(message) {
    const featureKeywords = [
      '新增功能', '新功能', '加入功能', '實現', '開發',
      '我想要', '能不能', '可以做', '幫我做', '自動',
      '新增一個', '建立一個', '創建一個', '設計一個'
    ];

    return featureKeywords.some(keyword => message.includes(keyword));
  }
}

// 訊息報告系統
class MessageReportSystem {
  constructor() {
    this.messageBuffer = [];
    this.reportThreshold = 20;
    this.lastReportTime = Date.now();
    this.reportInterval = 2 * 60 * 60 * 1000; // 2小時
    console.log('📊 訊息報告系統已初始化');
  }

  addMessage(userId, userName, message, groupId, groupName) {
    const messageData = {
      userId,
      userName,
      message,
      groupId,
      groupName,
      timestamp: new Date(),
      messageLength: message.length,
      hasEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]/u.test(message),
      isQuestion: /\?|？/.test(message),
      topics: this.extractTopics(message)
    };

    this.messageBuffer.push(messageData);

    if (this.shouldGenerateReport()) {
      this.generateAndSendReport();
    }
  }

  extractTopics(message) {
    const topics = [];
    const topicKeywords = {
      '工作': ['工作', '上班', '公司', '老闆', '同事'],
      '娛樂': ['電影', '遊戲', '音樂', '動漫', '追劇'],
      '美食': ['吃', '餐廳', '料理', '美食', '飲料'],
      '生活': ['天氣', '交通', '購物', '家庭', '健康'],
      '學習': ['讀書', '考試', '學校', '課程', '學習'],
      '科技': ['手機', '電腦', '網路', 'AI', '程式']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => message.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  async generateAndSendReport() {
    if (this.messageBuffer.length === 0) return;

    try {
      const report = this.createReport();

      await client.pushMessage(MY_LINE_ID, {
        type: 'text',
        text: report
      });

      console.log(`📊 已發送訊息報告，包含 ${this.messageBuffer.length} 則訊息`);

      this.messageBuffer = [];
      this.lastReportTime = Date.now();

    } catch (error) {
      console.error('💥 發送報告失敗:', error.message);
    }
  }

  createReport() {
    const totalMessages = this.messageBuffer.length;
    const timeRange = this.getTimeRange();
    const topUsers = this.getTopUsers();
    const topTopics = this.getTopTopics();

    return `📊 訊息總結報告

⏰ 時間範圍：${timeRange}
💬 總訊息數：${totalMessages} 則

👥 活躍用戶：
${topUsers.slice(0, 3).map((user, index) => 
  `${index + 1}. ${user.userName}: ${user.count} 則`
).join('\n')}

🎯 熱門話題：
${topTopics.slice(0, 3).map((topic, index) => 
  `${index + 1}. ${topic.topic}: ${topic.count} 次`
).join('\n')}

📈 統計數據：
• 平均訊息長度：${Math.round(this.messageBuffer.reduce((sum, msg) => sum + msg.messageLength, 0) / totalMessages)} 字
• 問句比例：${Math.round(this.messageBuffer.filter(msg => msg.isQuestion).length / totalMessages * 100)}%
• 表情符號使用：${Math.round(this.messageBuffer.filter(msg => msg.hasEmoji).length / totalMessages * 100)}%

這是我為你整理的對話摘要報告 📋`;
  }

  getTopUsers() {
    const userCounts = new Map();
    
    this.messageBuffer.forEach(msg => {
      const count = userCounts.get(msg.userId) || 0;
      userCounts.set(msg.userId, count + 1);
    });

    return Array.from(userCounts.entries())
      .map(([userId, count]) => {
        const userName = this.messageBuffer.find(msg => msg.userId === userId)?.userName || '未知用戶';
        return { userId, userName, count };
      })
      .sort((a, b) => b.count - a.count);
  }

  getTopTopics() {
    const topicCounts = new Map();
    
    this.messageBuffer.forEach(msg => {
      msg.topics.forEach(topic => {
        const count = topicCounts.get(topic) || 0;
        topicCounts.set(topic, count + 1);
      });
    });

    return Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }

  getTimeRange() {
    if (this.messageBuffer.length === 0) return '無';
    
    const oldest = this.messageBuffer[0].timestamp;
    const newest = this.messageBuffer[this.messageBuffer.length - 1].timestamp;
    
    return `${oldest.toLocaleString('zh-TW')} - ${newest.toLocaleString('zh-TW')}`;
  }

  shouldGenerateReport() {
    const now = Date.now();
    return this.messageBuffer.length >= this.reportThreshold || 
           (now - this.lastReportTime) >= this.reportInterval;
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

// 時間系統
const TimeSystem = {
  getCurrentTime() {
    const now = new Date();
    const taiwanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Taipei"}));
    
    return {
      timestamp: taiwanTime,
      formatted: taiwanTime.toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'long', timeZone: 'Asia/Taipei'
      })
    };
  }
};

// 初始化系統
const replyTokenManager = new ReplyTokenManager();
const smartAPIManager = new SmartAPIManager();
const decisionInquiry = new DecisionInquirySystem();
const contradictionDetection = new ContradictionDetectionSystem();
const weatherSystem = new WeatherSystem();
const taskManagement = new TaskManagementSystem();
const selfLearning = new SelfLearningSystem();
const messageReport = new MessageReportSystem();
const conversationHistory = new Map();

// 訊息長度限制器
function limitMessageLength(message, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof message === 'string') {
    if (message.length > maxLength) {
      return message.substring(0, maxLength - 20) + '\n\n...(內容太長被截掉了 😅)';
    }
    return message;
  }
  
  if (message && message.text) {
    message.text = limitMessageLength(message.text, maxLength);
  }
  
  return message;
}

// 安全回覆系統
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

    const limitedMessage = limitMessageLength(message);
    
    await client.replyMessage(replyToken, limitedMessage);
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

// 天氣查詢檢測
function isWeatherQuery(text) {
  const weatherKeywords = ['天氣', '氣溫', '下雨', '晴天', '陰天', '溫度', '濕度', '風速', '預報'];
  return weatherKeywords.some(keyword => text.includes(keyword));
}

// 任務創建檢測
function isTaskCreationRequest(text) {
  return taskManagement.parseTaskRequest(text) !== null;
}

// 一般對話處理
async function handleGeneralChat(message, userId, replyToken) {
  try {
    const complexity = smartAPIManager.analyzeRequestComplexity(message);
    const modelInfo = smartAPIManager.selectOptimalModel(complexity);
    
    const prompt = `用戶說：${message}

請以顧晉瑋的身份回應，我是靜宜大學資管系學生，對科技AI有高度興趣。回應要自然親切，可以用一些台灣口語如「好der」、「ㄜ」、「哎呦」等。保持友善和有趣的語氣。`;

    const response = await smartAPIManager.callModel(prompt, modelInfo);
    
    return response;
    
  } catch (error) {
    console.error('💥 一般對話處理失敗:', error.message);
    
    const simpleResponses = [
      '哈哈，有趣！😄',
      '我懂你的意思～',
      '說得對呢！👌',
      '真的嗎？告訴我更多',
      '這個話題很有意思 🤔',
      '我也這麼想',
      '有道理！好der～'
    ];
    
    return simpleResponses[Math.floor(Math.random() * simpleResponses.length)];
  }
}

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = TimeSystem.getCurrentTime();
  const apiUsageReport = smartAPIManager.getUsageReport();
  
  res.send(`
    <h1>🎓 顧晉瑋的超智能AI助手系統 v7.0</h1>
    <p><strong>身份：靜宜大學資訊管理系學生</strong></p>
    <p><strong>🇹🇼 台灣時間：${currentTime.formatted}</strong></p>
    
    <h2>🆕 v7.0 新功能：</h2>
    <ul>
      <li>✅ <strong>決策詢問系統</strong> - 重要決策會先私訊詢問</li>
      <li>✅ <strong>矛盾檢測系統</strong> - 偵測用戶矛盾發言並報告</li>
      <li>✅ <strong>修復天氣查詢</strong> - 支援模糊搜尋和備用資料</li>
      <li>✅ <strong>任務管理系統</strong> - 支援定時新聞、天氣等任務</li>
      <li>✅ <strong>自學功能</strong> - 分析功能需求並提供實現方案</li>
      <li>✅ <strong>訊息報告系統</strong> - 定期提供對話摘要</li>
    </ul>
    
    <h2>🧠 智能功能：</h2>
    <ul>
      <li>🔐 <strong>決策保護</strong>：敏感操作會先徵求同意</li>
      <li>🔍 <strong>矛盾偵測</strong>：自動分析用戶發言一致性</li>
      <li>🌤️ <strong>天氣查詢</strong>：支援全台灣各縣市天氣</li>
      <li>📋 <strong>任務排程</strong>：每天定時提供新聞、天氣等</li>
      <li>🧠 <strong>自主學習</strong>：分析新功能需求並設計實現</li>
      <li>📊 <strong>智能報告</strong>：定期彙整對話重點</li>
    </ul>
    
    <h2>📊 使用方式：</h2>
    <ul>
      <li><strong>設定任務：</strong>「每天早上9點給我新聞」</li>
      <li><strong>查詢天氣：</strong>「台北天氣」、「高雄氣溫」</li>
      <li><strong>功能需求：</strong>「我想要新增一個功能...」</li>
      <li><strong>取消任務：</strong>「取消我的新聞任務」</li>
    </ul>

    <p><strong>💡 我是顧晉瑋，現在更智能了！好der 👌</strong></p>
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

    // 處理 postback 事件
    if (event.type === 'postback') {
      const data = event.postback.data;
      console.log(`📤 處理 postback: ${data}`);
      
      if (data.startsWith('decision:')) {
        const [, decisionId, action] = data.split(':');
        const result = await decisionInquiry.handleDecisionResponse(
          decisionId, 
          action, 
          event.replyToken
        );
        return;
      }
      
      if (data.startsWith('task:')) {
        const [, action, taskId] = data.split(':');
        if (action === 'cancel') {
          const success = taskManagement.deleteTask(taskId, event.source.userId);
          const message = success ? '✅ 任務已取消' : '❌ 找不到該任務';
          await safeReply(event.replyToken, { type: 'text', text: message });
        }
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
    
    console.log(`📨 收到訊息: ${messageText} | 用戶: ${userId} | 群組: ${groupId || 'private'}`);

    // 獲取用戶名稱
    let userName = '未知用戶';
    let groupName = null;
    try {
      if (groupId) {
        const profile = await client.getGroupMemberProfile(groupId, userId);
        userName = profile.displayName;
        
        try {
          const groupSummary = await client.getGroupSummary(groupId);
          groupName = groupSummary.groupName;
        } catch (error) {
          console.log('無法獲取群組名稱');
        }
      } else {
        const profile = await client.getProfile(userId);
        userName = profile.displayName;
      }
    } catch (error) {
      console.error('❌ 獲取用戶名稱錯誤:', error.message);
    }

    // 添加到報告系統
    messageReport.addMessage(userId, userName, messageText, groupId, groupName);

    // 矛盾檢測
    contradictionDetection.analyzeStatement(userId, userName, messageText);

    // 檢查是否需要決策詢問
    if (decisionInquiry.shouldRequestDecision(messageText)) {
      console.log(`🔐 觸發決策詢問: ${messageText}`);
      
      const decisionId = await decisionInquiry.requestDecision(
        `${groupId ? `群組「${groupName || '未知群組'}」中` : '私人對話中'}用戶 ${userName} 的請求`,
        messageText,
        replyToken,
        userId,
        groupId
      );
      
      if (decisionId) {
        console.log(`✅ 決策請求已發送，ID: ${decisionId}`);
        return;
      }
    }

    // 自學功能處理
    if (selfLearning.isFeatureRequest(messageText)) {
      console.log(`🧠 處理功能需求: ${messageText}`);
      
      const analysis = await selfLearning.analyzeFeatureRequest(userId, messageText);
      
      if (analysis) {
        const implementation = await selfLearning.implementFeature(userId, messageText, analysis);
        await safeReply(replyToken, { type: 'text', text: implementation.message });
        return;
      }
    }

    // 任務創建處理
    if (isTaskCreationRequest(messageText)) {
      const taskInfo = taskManagement.parseTaskRequest(messageText);
      
      if (taskInfo) {
        const taskId = taskManagement.createTask(userId, taskInfo.taskType, taskInfo.schedule, taskInfo.content);
        
        const confirmMessage = {
          type: 'template',
          altText: '✅ 任務設定成功',
          template: {
            type: 'buttons',
            title: '✅ 任務設定成功！',
            text: `${taskInfo.content}任務已設定\n排程：${taskInfo.schedule}`,
            actions: [
              {
                type: 'postback',
                label: '🗑️ 取消任務',
                data: `task:cancel:${taskId}`,
                displayText: '取消這個任務'
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

    // 天氣查詢
    if (isWeatherQuery(messageText)) {
      try {
        const city = weatherSystem.extractCityFromText(messageText);
        const weatherData = await weatherSystem.getWeather(city);
        
        const weatherMessage = `🌤️ ${weatherData.location}的天氣預報：

📍 地點：${weatherData.location}
🌡️ 溫度：${weatherData.minTemp}°C - ${weatherData.maxTemp}°C
☁️ 天氣：${weatherData.weather}
☔ 降雨機率：${weatherData.rainChance}%
😊 舒適度：${weatherData.comfort}
⏰ 更新時間：${weatherData.updateTime}

${weatherData.isFallback ? '⚠️ 使用備用天氣資料' : ''}
📱 記得根據天氣調整穿著！`;

        await safeReply(replyToken, { type: 'text', text: weatherMessage });
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
    const response = await handleGeneralChat(messageText, userId, replyToken);
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

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ LINE Bot 伺服器成功啟動！`);
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`📍 Webhook URL: /webhook`);
  console.log(`🎓 顧晉瑋的超智能AI助手 v7.0 已就緒！`);
  console.log(`🔐 決策系統、🔍 矛盾檢測、📋 任務管理、🧠 自學功能已啟用`);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

module.exports = app;