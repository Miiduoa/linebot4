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

console.log('🚀 正在啟動終極進化版 LINE Bot v6.1 - 顧晉瑋的智能助手 (修復版)...');
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

// 智能 API 配置（優先使用 Grok，支持所有主流模型）
const SMART_AI_CONFIG = {
  apiKey: process.env.BACKUP_AI_KEY || 'sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM',
  baseURL: process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1',
  
  // 模型分級配置（優先使用 Grok）
  models: {
    // 頂級模型 - 一天5次（只用於超重要決策）
    premium: {
      'gpt-4o': { limit: 5, priority: 9, cost: 10 },
      'gpt-4.1': { limit: 5, priority: 9, cost: 10 }
    },
    
    // 高級模型 - 一天30次（複雜分析）
    advanced: {
      'deepseek-r1': { limit: 30, priority: 8, cost: 5 },
      'deepseek-v3': { limit: 30, priority: 7, cost: 5 }
    },
    
    // 常用模型 - 一天200次（日常對話）
    standard: {
      'grok': { limit: 200, priority: 10, cost: 3 }, // 優先使用 Grok
      'gpt-4o-mini': { limit: 200, priority: 6, cost: 2 },
      'gpt-3.5-turbo': { limit: 200, priority: 5, cost: 1 },
      'gpt-4.1-mini': { limit: 200, priority: 6, cost: 2 },
      'gpt-4.1-nano': { limit: 200, priority: 4, cost: 1 }
    }
  },
  
  // 支持的所有模型（用於驗證）
  supportedModels: [
    'gpt-4o', 'gpt-4.1', 'deepseek-r1', 'deepseek-v3', 
    'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4.1-mini', 'gpt-4.1-nano',
    'grok', 'claude', 'gemini'
  ]
};

// 特殊用戶配置
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'demo326';
const MY_LINE_ID = 'U59af77e69411ffb99a49f1f2c3e2afc4';
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 智能 API 調用管理系統（優先使用 Grok）
class SmartAPIManager {
  constructor() {
    this.dailyUsage = new Map();
    this.lastResetDate = new Date().toDateString();
    this.requestQueue = [];
    this.modelPerformance = new Map();
    
    this.initializeUsageTracking();
    console.log('🧠 智能 API 管理系統已初始化（優先使用 Grok）');
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
      console.log('📅 重置每日 API 使用量');
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
      '決策', '分析', '評估', '建議', '策略',
      '學習', '訓練', '優化', '改進', '總結',
      '程式', '修復', '開發', '設計', '計畫',
      '創作', '寫作', '故事', '詩歌', '劇本',
      'AI', '機器學習', '資料分析', '系統設計', '程式碼'
    ];
    
    const detectedComplexity = complexKeywords.filter(keyword => 
      prompt.includes(keyword)
    ).length;
    
    complexity += detectedComplexity;
    
    if (context.isDecision) complexity += 3;
    if (context.isLearning) complexity += 2;
    if (context.isCreative) complexity += 2;
    if (context.isTechnical) complexity += 2;
    
    return Math.min(complexity, 10);
  }

  selectOptimalModel(complexity, context = {}) {
    this.resetDailyUsageIfNeeded();
    
    let selectedModel = null;
    let selectedTier = null;
    
    if (complexity >= 8 || context.isDecision) {
      selectedTier = 'premium';
    } else if (complexity >= 5 || context.isLearning || context.isTechnical) {
      selectedTier = 'advanced';
    } else {
      selectedTier = 'standard';
    }
    
    const availableModels = Object.entries(SMART_AI_CONFIG.models[selectedTier])
      .filter(([model, config]) => {
        const usage = this.dailyUsage.get(model) || 0;
        return usage < config.limit;
      })
      .sort((a, b) => {
        const perfA = this.modelPerformance.get(a[0]);
        const perfB = this.modelPerformance.get(b[0]);
        
        const scoreA = (perfA.successRate / 100) * a[1].priority;
        const scoreB = (perfB.successRate / 100) * b[1].priority;
        
        return scoreB - scoreA;
      });
    
    if (availableModels.length > 0) {
      selectedModel = availableModels[0][0];
    } else {
      console.log(`⚠️ ${selectedTier} 層級無可用模型，正在降級...`);
      
      if (selectedTier === 'premium') {
        return this.selectOptimalModel(complexity - 2, { ...context, downgraded: true });
      } else if (selectedTier === 'advanced') {
        selectedTier = 'standard';
        const standardModels = Object.keys(SMART_AI_CONFIG.models.standard)
          .filter(model => (this.dailyUsage.get(model) || 0) < SMART_AI_CONFIG.models.standard[model].limit);
        
        if (standardModels.length > 0) {
          selectedModel = standardModels.includes('grok') ? 'grok' : standardModels[0];
        }
      }
    }
    
    console.log(`🎯 選擇模型: ${selectedModel} (${selectedTier} tier, 複雜度: ${complexity})`);
    
    return { model: selectedModel, tier: selectedTier, complexity };
  }

  async callModel(prompt, modelInfo, context = {}) {
    const { model, tier } = modelInfo;
    
    if (!model) {
      throw new Error('無可用的 API 模型');
    }
    
    const startTime = Date.now();
    
    try {
      console.log(`🚀 調用 ${model} 模型...`);
      
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
      
      console.log(`✅ ${model} 回應成功 (${responseTime}ms)`);
      
      return response.data.choices[0].message.content.trim();
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordUsage(model, false, responseTime);
      
      console.error(`❌ ${model} 失敗: ${error.message}`);
      
      if (model === 'grok' && tier === 'standard') {
        console.log('🔄 Grok 失敗，嘗試備用模型...');
        const backupModels = ['gpt-4o-mini', 'gpt-3.5-turbo'];
        
        for (const backupModel of backupModels) {
          const backupUsage = this.dailyUsage.get(backupModel) || 0;
          if (backupUsage < SMART_AI_CONFIG.models.standard[backupModel].limit) {
            console.log(`🔄 嘗試備用模型: ${backupModel}`);
            return await this.callModel(prompt, { model: backupModel, tier }, context);
          }
        }
      }
      
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
    
    console.log(`📊 ${model} 使用量: ${this.dailyUsage.get(model)} (成功率: ${Math.round(perf.successRate)}%)`);
  }

  generateSystemPrompt(tier, context) {
    let basePrompt = '你是顧晉瑋，靜宜大學資管系學生，對科技AI有高度興趣。說話自然有趣，會用台灣口語「好der」、「ㄜ」、「哎呦」等。';
    
    if (tier === 'premium') {
      basePrompt += '這是頂級AI模型調用，請發揮我的專業技術背景，提供最高質量的深度分析。';
    } else if (tier === 'advanced') {
      basePrompt += '這是高級AI模型調用，請用我的資管系專業知識提供詳細分析。';
    } else {
      basePrompt += '請用我親切隨和的語氣回應，保持友善自然。';
    }
    
    if (context.isDecision) {
      basePrompt += '這是重要決策相關問題，請以我的技術背景謹慎分析並提供專業建議。';
    }
    
    if (context.isLearning) {
      basePrompt += '這是學習相關問題，請發揮我對科技AI的興趣，提供教育性詳細解答。';
    }
    
    if (context.isTechnical) {
      basePrompt += '這是技術相關問題，請運用我的資管系專業知識快速提供解決方案。';
    }
    
    return basePrompt;
  }

  getUsageReport() {
    this.resetDailyUsageIfNeeded();
    
    const report = {
      date: new Date().toDateString(),
      usage: {},
      recommendations: [],
      preferredModel: 'grok'
    };
    
    ['premium', 'advanced', 'standard'].forEach(tier => {
      report.usage[tier] = {};
      
      Object.entries(SMART_AI_CONFIG.models[tier]).forEach(([model, config]) => {
        const usage = this.dailyUsage.get(model) || 0;
        const perf = this.modelPerformance.get(model);
        
        report.usage[tier][model] = {
          used: usage,
          limit: config.limit,
          percentage: Math.round((usage / config.limit) * 100),
          successRate: Math.round(perf.successRate),
          avgTime: Math.round(perf.avgResponseTime),
          priority: config.priority
        };
        
        if (usage >= config.limit * 0.8) {
          report.recommendations.push(`⚠️ ${model} 使用量接近上限 (${usage}/${config.limit})`);
        }
        
        if (model === 'grok') {
          report.recommendations.push(`🚀 Grok 主力模型使用狀況：${usage}/${config.limit} (${Math.round((usage/config.limit)*100)}%)`);
        }
      });
    });
    
    return report;
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
    console.log(`💨 清理過期 token，剩餘: ${this.usedTokens.size}`);
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
      }),
      dateOnly: taiwanTime.toLocaleDateString('zh-TW', {timeZone: 'Asia/Taipei'}),
      timeOnly: taiwanTime.toLocaleTimeString('zh-TW', {timeZone: 'Asia/Taipei'}),
      iso: taiwanTime.toISOString()
    };
  },

  parseTimeExpression(text) {
    const timePatterns = [
      { pattern: /(\d{1,2})秒後/, multiplier: 1000, type: 'relative' },
      { pattern: /(\d{1,2})分鐘後/, multiplier: 60000, type: 'relative' },
      { pattern: /(\d{1,2})小時後/, multiplier: 3600000, type: 'relative' },
      { pattern: /明天.*?(\d{1,2})點/, offset: 1, type: 'absolute' },
      { pattern: /後天.*?(\d{1,2})點/, offset: 2, type: 'absolute' },
      { pattern: /今天.*?(\d{1,2})點/, offset: 0, type: 'absolute' }
    ];

    for (const timePattern of timePatterns) {
      const match = text.match(timePattern.pattern);
      if (match) {
        const now = this.getCurrentTime().timestamp;
        const value = parseInt(match[1]);
        
        if (timePattern.type === 'relative') {
          return new Date(now.getTime() + value * timePattern.multiplier);
        } else if (timePattern.type === 'absolute') {
          const targetDate = new Date(now);
          targetDate.setDate(now.getDate() + timePattern.offset);
          targetDate.setHours(value, 0, 0, 0);
          
          if (timePattern.offset === 0 && targetDate <= now) {
            targetDate.setDate(targetDate.getDate() + 1);
          }
          
          return targetDate;
        }
      }
    }
    
    return null;
  }
};

// 智能提醒系統
class SmartReminderSystem {
  constructor() {
    this.reminders = new Map();
    this.activeTimers = new Map();
    this.reminderHistory = new Map();
    console.log('⏰ 智能提醒系統已初始化');
  }

  createReminder(userId, title, targetTime, description = '') {
    const reminderId = `reminder-${userId}-${Date.now()}`;
    const now = new Date();
    
    const reminder = {
      id: reminderId,
      userId,
      title,
      targetTime,
      description,
      created: now,
      active: true,
      completed: false
    };

    this.reminders.set(reminderId, reminder);
    
    const delay = targetTime.getTime() - now.getTime();
    
    if (delay > 0) {
      const timerId = setTimeout(async () => {
        await this.executeReminder(reminderId);
      }, delay);
      
      this.activeTimers.set(reminderId, timerId);
      
      console.log(`⏰ 提醒已設定: ${title} - ${delay}ms後觸發`);
      
      return reminderId;
    } else {
      console.log('⚠️ 時間已過，立即觸發提醒');
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

    console.log(`🔔 正在執行提醒: ${reminder.title}`);

    try {
      const message = {
        type: 'template',
        altText: `⏰ 提醒：${reminder.title}`,
        template: {
          type: 'buttons',
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=300&fit=crop',
          title: '⏰ 提醒時間到！',
          text: `${reminder.title}\n\n設定時間：${reminder.created.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}`,
          actions: [
            {
              type: 'postback',
              label: '✅ 已完成',
              data: `reminder_complete:${reminder.id}`,
              displayText: '已完成這個提醒'
            },
            {
              type: 'postback',
              label: '⏰ 5分鐘後再提醒',
              data: `reminder_snooze:${reminder.id}:5`,
              displayText: '5分鐘後再提醒我'
            },
            {
              type: 'postback',
              label: '🗑️ 取消提醒',
              data: `reminder_cancel:${reminder.id}`,
              displayText: '取消這個提醒'
            }
          ]
        }
      };

      await client.pushMessage(reminder.userId, message);
      console.log(`✅ 提醒已成功發送: ${reminder.title}`);
      
      this.activeTimers.delete(reminderId);
      
    } catch (error) {
      console.error('💥 發送提醒失敗:', error);
      
      try {
        const backupMessage = `⏰ 提醒時間到！\n\n${reminder.title}\n\n(備用提醒模式)`;
        await client.pushMessage(reminder.userId, { type: 'text', text: backupMessage });
        console.log('✅ 備用提醒發送成功');
      } catch (backupError) {
        console.error('💥 備用提醒也失敗:', backupError);
      }
    }
  }

  async handleReminderAction(userId, action, reminderId, params = null) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) {
      return '❌ 找不到該提醒';
    }

    console.log(`🔧 處理提醒操作: ${action} for ${reminderId}`);

    switch (action) {
      case 'complete':
        reminder.completed = true;
        reminder.active = false;
        this.clearTimer(reminderId);
        return '✅ 提醒已標記為完成！';
        
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
        
        console.log(`⏰ 提醒延後 ${snoozeMinutes} 分鐘`);
        return `⏰ 已延後 ${snoozeMinutes} 分鐘，${newTime.toLocaleTimeString('zh-TW')} 再提醒你`;
        
      case 'cancel':
        reminder.active = false;
        this.clearTimer(reminderId);
        return '🗑️ 提醒已取消';
        
      default:
        return '❓ 未知的提醒操作';
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
      activeTimers: this.activeTimers.size
    };
  }
}

// 初始化系統
const replyTokenManager = new ReplyTokenManager();
const smartAPIManager = new SmartAPIManager();
const smartReminder = new SmartReminderSystem();
const conversationHistory = new Map();

// 訊息長度限制器
function limitMessageLength(message, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof message === 'string') {
    if (message.length > maxLength) {
      return message.substring(0, maxLength - 20) + '\n\n...(內容太長被我截掉了 😅)';
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
    
    if (error.message.includes('400')) {
      console.log('🚫 400錯誤 - 不重試');
      return false;
    }

    if (retryCount === 0) {
      console.log('🔄 1秒後重試...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await safeReply(replyToken, message, retryCount + 1);
    }

    return false;
  }
}

// 天氣查詢檢測
function isWeatherQuery(text) {
  const weatherKeywords = ['天氣', '氣溫', '下雨', '晴天', '陰天', '溫度', '濕度', '風速', '預報'];
  return weatherKeywords.some(keyword => text.includes(keyword));
}

// 天氣查詢處理
async function handleWeatherQuery(text, replyToken) {
  try {
    // 從文字中提取城市名稱
    let city = extractCityFromText(text);
    if (!city) city = '台北'; // 預設城市

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
      
      const minTemp = weather.find(el => el.elementName === 'MinT');
      const maxTemp = weather.find(el => el.elementName === 'MaxT');
      const desc = weather.find(el => el.elementName === 'Wx');
      const pop = weather.find(el => el.elementName === 'PoP');
      
      const weatherMessage = `🌤️ ${city}的天氣預報：

📍 地點：${location.locationName}
🌡️ 溫度：${minTemp?.time[0]?.parameter?.parameterName || 'N/A'}°C - ${maxTemp?.time[0]?.parameter?.parameterName || 'N/A'}°C
☁️ 天氣：${desc?.time[0]?.parameter?.parameterName || 'N/A'}
☔ 降雨機率：${pop?.time[0]?.parameter?.parameterName || 'N/A'}%

📱 記得根據天氣調整穿著！`;

      await safeReply(replyToken, { type: 'text', text: weatherMessage });
    } else {
      await safeReply(replyToken, { 
        type: 'text', 
        text: '抱歉，找不到該城市的天氣資訊，請確認城市名稱是否正確。' 
      });
    }
  } catch (error) {
    console.error('天氣查詢錯誤:', error);
    await safeReply(replyToken, { 
      type: 'text', 
      text: '抱歉，無法獲取天氣資訊，請稍後再試。' 
    });
  }
}

// 從文字中提取城市名稱
function extractCityFromText(text) {
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
  return null;
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
    
    // 簡單的備用回應
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
  const reminderStatus = smartReminder.getStatus();
  
  res.send(`
    <h1>🎓 顧晉瑋的AI助手系統 v6.1 - 修復版正在運行！</h1>
    <p><strong>身份：靜宜大學資訊管理系學生</strong></p>
    <p><strong>專長：科技與AI、程式設計、系統開發</strong></p>
    <p><strong>🇹🇼 台灣時間：${currentTime.formatted}</strong></p>
    
    <h2>🚀 主力模型 - Grok (優先使用)：</h2>
    <div style="background-color: #e8f5e8; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
      <p><strong>🌟 Grok 使用狀況：</strong> 
        ${apiUsageReport.usage.standard?.grok ? 
          `${apiUsageReport.usage.standard.grok.used}/${apiUsageReport.usage.standard.grok.limit} 
           (${apiUsageReport.usage.standard.grok.percentage}%) - 
           成功率 ${apiUsageReport.usage.standard.grok.successRate}%` : 
          '尚未使用'
        }
      </p>
      <p>💡 作為主力模型，Grok 會優先處理大部分對話請求</p>
    </div>
    
    <h2>🆕 v6.1 修復與新功能：</h2>
    <ul>
      <li>✅ <strong>修復語法錯誤</strong></li>
      <li>✅ <strong>修復文件完整性</strong></li>
      <li>✅ <strong>優化天氣查詢系統</strong></li>
      <li>✅ <strong>智能提醒系統</strong></li>
      <li>✅ <strong>多層級AI模型選擇</strong></li>
      <li>🚀 <strong>主力使用Grok模型</strong></li>
    </ul>
    
    <h2>📊 系統狀態：</h2>
    <ul>
      <li>⏰ 活躍提醒：${reminderStatus.activeReminders} 個</li>
      <li>📋 總提醒數：${reminderStatus.totalReminders} 個</li>
      <li>🤖 API使用效率：良好</li>
    </ul>

    <p><strong>💡 我是顧晉瑋，靜宜大學資管系學生，現在系統已修復並正常運行！好der 👌</strong></p>
  `);
});

// Webhook 端點
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) {
    console.log('❌ 缺少簽名標頭');
    return res.status(401).send('缺少簽名標頭');
  }

  const body = req.body.toString();
  const hash = crypto
    .createHmac('SHA256', config.channelSecret)
    .update(body)
    .digest('base64');

  if (signature !== hash) {
    console.log('❌ 簽名驗證失敗');
    return res.status(401).send('簽名驗證失敗');
  }

  let events;
  try {
    const parsedBody = JSON.parse(body);
    events = parsedBody.events;
  } catch (error) {
    console.error('❌ JSON 解析錯誤:', error);
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
      
      if (data.startsWith('reminder_')) {
        const [, action, reminderId, ...params] = data.split(':');
        const result = await smartReminder.handleReminderAction(
          event.source.userId, 
          action, 
          reminderId, 
          params[0]
        );
        
        await safeReply(event.replyToken, { type: 'text', text: result });
        return;
      }
    }

    if (event.type !== 'message' || event.message.type !== 'text') {
      return;
    }

    const userId = event.source.userId;
    const messageText = event.message.text.trim();
    const replyToken = event.replyToken;
    
    console.log(`📨 收到訊息: ${messageText} | 用戶: ${userId}`);

    // 提醒功能處理
    if (messageText.includes('提醒我') || /\d+秒後|\d+分鐘後|\d+小時後/.test(messageText)) {
      const targetTime = TimeSystem.parseTimeExpression(messageText);
      
      if (targetTime) {
        const title = messageText.replace(/提醒我|秒後|分鐘後|小時後|\d+/g, '').trim() || '重要提醒';
        const reminderId = smartReminder.createReminder(userId, title, targetTime);
        
        const confirmMessage = {
          type: 'template',
          altText: `⏰ 提醒設定成功：${title}`,
          template: {
            type: 'buttons',
            thumbnailImageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=300&fit=crop',
            title: '⏰ 提醒設定成功！',
            text: `${title}\n\n將在 ${targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})} 提醒你`,
            actions: [
              {
                type: 'postback',
                label: '📋 查看我的提醒',
                data: 'menu:reminders',
                displayText: '查看我的提醒清單'
              },
              {
                type: 'postback',
                label: '🗑️ 取消這個提醒',
                data: `reminder_cancel:${reminderId}`,
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

    // 天氣查詢
    if (isWeatherQuery(messageText)) {
      await handleWeatherQuery(messageText, replyToken);
      return;
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
  console.log(`🎓 顧晉瑋的AI助手 v6.1 修復版已就緒！`);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

module.exports = app;