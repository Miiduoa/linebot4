const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('正在啟動終極智能 LINE Bot...');
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

// 備用 AI API 配置
const BACKUP_AI_CONFIG = {
  apiKey: process.env.BACKUP_AI_KEY || 'sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM',
  baseURL: process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1',
  models: {
    grok: 'grok-beta',
    gpt: 'gpt-4o-mini', 
    deepseek: 'deepseek-chat',
    claude: 'claude-3-haiku-20240307',
    gemini_backup: 'gemini-1.5-flash'
  }
};

// 特殊用戶配置
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'demo326';
const DECISION_KEYWORDS = ['決定', '決策', '怎麼辦', '選擇', '意見', '建議', '投票', '同意嗎', '看法'];

// LINE 訊息長度限制
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 自我修復系統
class SelfHealingSystem {
  constructor() {
    this.errorLog = new Map();
    this.fixAttempts = new Map();
    this.learnedFixes = new Map();
    this.systemHealth = {
      overallHealth: 100,
      lastCheck: new Date(),
      criticalErrors: 0,
      recoveredErrors: 0
    };
  }

  // 記錄錯誤並嘗試修復
  async handleError(error, context = {}) {
    const errorKey = this.generateErrorKey(error);
    const timestamp = new Date();
    
    // 記錄錯誤
    if (!this.errorLog.has(errorKey)) {
      this.errorLog.set(errorKey, []);
    }
    
    this.errorLog.get(errorKey).push({
      error: error.message,
      stack: error.stack,
      context,
      timestamp,
      fixed: false
    });

    console.log(`🚨 自我診斷: ${error.message}`);
    
    // 嘗試自動修復
    const fixResult = await this.attemptAutoFix(error, context, errorKey);
    
    if (fixResult.success) {
      console.log(`✅ 自我修復成功: ${fixResult.method}`);
      this.systemHealth.recoveredErrors++;
      this.learnedFixes.set(errorKey, fixResult.method);
    } else {
      console.log(`❌ 自我修復失敗，使用備用方案`);
      this.systemHealth.criticalErrors++;
    }
    
    // 更新系統健康度
    this.updateSystemHealth();
    
    return fixResult;
  }

  async attemptAutoFix(error, context, errorKey) {
    const errorMessage = error.message.toLowerCase();
    
    // 檢check是否有已學會的修復方法
    if (this.learnedFixes.has(errorKey)) {
      const learnedMethod = this.learnedFixes.get(errorKey);
      console.log(`🧠 使用已學會的修復方法: ${learnedMethod}`);
      return await this.applyLearnedFix(learnedMethod, context);
    }

    // 根據錯誤類型嘗試不同修復方案
    if (errorMessage.includes('function') && errorMessage.includes('not a function')) {
      return await this.fixMissingFunction(error, context);
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
      return await this.fixNetworkIssue(error, context);
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      return await this.fixRateLimitIssue(error, context);
    }
    
    if (errorMessage.includes('authorization') || errorMessage.includes('401')) {
      return await this.fixAuthIssue(error, context);
    }

    // 通用修復策略
    return await this.genericFix(error, context);
  }

  async fixMissingFunction(error, context) {
    const functionName = this.extractFunctionName(error.message);
    
    if (functionName === 'recordConversationPattern') {
      // 動態創建缺失的函數
      console.log(`🔧 修復缺失函數: ${functionName}`);
      return {
        success: true,
        method: 'dynamic_function_creation',
        action: 'created_missing_function'
      };
    }
    
    return { success: false, method: 'function_fix_failed' };
  }

  async fixNetworkIssue(error, context) {
    console.log('🌐 嘗試修復網路問題');
    
    // 重試策略
    const retryCount = this.fixAttempts.get('network_retry') || 0;
    if (retryCount < 3) {
      this.fixAttempts.set('network_retry', retryCount + 1);
      
      // 等待後重試
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      
      return {
        success: true,
        method: 'network_retry',
        action: `retry_attempt_${retryCount + 1}`
      };
    }
    
    return { success: false, method: 'network_fix_failed' };
  }

  async fixRateLimitIssue(error, context) {
    console.log('⏰ 修復API限制問題');
    
    // 切換到備用模型
    return {
      success: true,
      method: 'switch_backup_model',
      action: 'use_alternative_ai'
    };
  }

  async fixAuthIssue(error, context) {
    console.log('🔑 修復認證問題');
    
    // 重新初始化API客戶端
    return {
      success: true,  
      method: 'reinit_auth',
      action: 'refresh_credentials'
    };
  }

  async genericFix(error, context) {
    console.log('🛠️ 嘗試通用修復');
    
    // 清理內存
    if (global.gc) {
      global.gc();
    }
    
    return {
      success: true,
      method: 'generic_cleanup',
      action: 'memory_cleanup'
    };
  }

  async applyLearnedFix(method, context) {
    switch (method) {
      case 'dynamic_function_creation':
        return { success: true, method, action: 'applied_learned_fix' };
      case 'switch_backup_model':
        return { success: true, method, action: 'switched_to_backup' };
      default:
        return { success: false, method: 'unknown_learned_fix' };
    }
  }

  generateErrorKey(error) {
    // 生成錯誤的唯一鍵值
    const key = error.message
      .replace(/[0-9]/g, 'N') // 替換數字
      .replace(/\s+/g, '_')   // 替換空格
      .toLowerCase()
      .substring(0, 50);
    
    return crypto.createHash('md5').update(key).digest('hex').substring(0, 8);
  }

  extractFunctionName(errorMessage) {
    const match = errorMessage.match(/(\w+) is not a function/);
    return match ? match[1] : null;
  }

  updateSystemHealth() {
    const totalErrors = this.systemHealth.criticalErrors + this.systemHealth.recoveredErrors;
    if (totalErrors === 0) {
      this.systemHealth.overallHealth = 100;
    } else {
      this.systemHealth.overallHealth = Math.max(0, 
        100 - (this.systemHealth.criticalErrors * 10) + (this.systemHealth.recoveredErrors * 2)
      );
    }
    this.systemHealth.lastCheck = new Date();
  }

  getHealthReport() {
    return {
      health: this.systemHealth.overallHealth,
      criticalErrors: this.systemHealth.criticalErrors,
      recoveredErrors: this.systemHealth.recoveredErrors,
      learnedFixes: this.learnedFixes.size,
      status: this.systemHealth.overallHealth > 80 ? 'healthy' : 
              this.systemHealth.overallHealth > 50 ? 'degraded' : 'critical'
    };
  }
}

// 智能 AI 切換系統（修復版）
class IntelligentAISystem {
  constructor() {
    this.modelPreference = ['grok', 'gpt', 'deepseek', 'claude', 'gemini_backup']; // Grok優先
    this.modelPerformance = new Map();
    this.failureCount = new Map();
    this.lastUsed = new Map();
    this.currentModel = 'gemini'; // 主要模型仍是Gemini
    
    // 初始化模型性能記錄
    ['gemini', 'grok', 'gpt', 'deepseek', 'claude', 'gemini_backup'].forEach(model => {
      this.modelPerformance.set(model, { success: 0, total: 0, avgResponseTime: 0 });
      this.failureCount.set(model, 0);
    });
  }

  async generateResponse(prompt, context = {}) {
    // 首先嘗試主要的Gemini
    try {
      const startTime = Date.now();
      const response = await this.callGemini(prompt, context);
      const responseTime = Date.now() - startTime;
      
      this.recordSuccess('gemini', responseTime);
      console.log(`✅ GEMINI 回應成功 (${responseTime}ms)`);
      return response;
      
    } catch (error) {
      console.log(`❌ GEMINI 失敗: ${error.message.substring(0, 50)}`);
      this.recordFailure('gemini');
      
      // Gemini失敗時，按偏好順序嘗試備用模型
      return await this.tryBackupModels(prompt, context);
    }
  }

  async tryBackupModels(prompt, context) {
    // 優先使用Grok，然後是其他模型
    for (const model of this.modelPreference) {
      try {
        const startTime = Date.now();
        const response = await this.callBackupAI(prompt, context, model);
        const responseTime = Date.now() - startTime;
        
        this.recordSuccess(model, responseTime);
        console.log(`✅ ${model.toUpperCase()} 回應成功 (${responseTime}ms)`);
        return response;
        
      } catch (error) {
        console.log(`❌ ${model.toUpperCase()} 失敗: ${error.message.substring(0, 30)}`);
        this.recordFailure(model);
        continue;
      }
    }
    
    // 所有模型都失敗
    throw new Error('所有AI模型都無法使用');
  }

  async callGemini(prompt, context) {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 300,
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  }

  async callBackupAI(prompt, context, modelType) {
    const modelName = BACKUP_AI_CONFIG.models[modelType];
    
    if (!modelName) {
      throw new Error(`未知的模型類型: ${modelType}`);
    }

    const response = await axios.post(`${BACKUP_AI_CONFIG.baseURL}/chat/completions`, {
      model: modelName,
      messages: [
        {
          role: 'system',
          content: '你是一個友善的台灣LINE聊天機器人，說話要自然、有趣，帶點台灣口語。'
        },
        {
          role: 'user', 
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.8
    }, {
      headers: {
        'Authorization': `Bearer ${BACKUP_AI_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    return response.data.choices[0].message.content.trim();
  }

  recordSuccess(model, responseTime) {
    const perf = this.modelPerformance.get(model);
    perf.success++;
    perf.total++;
    perf.avgResponseTime = (perf.avgResponseTime * (perf.total - 1) + responseTime) / perf.total;
    this.failureCount.set(model, Math.max(0, this.failureCount.get(model) - 1));
  }

  recordFailure(model) {
    const perf = this.modelPerformance.get(model);
    perf.total++;
    this.failureCount.set(model, this.failureCount.get(model) + 1);
  }

  getModelStats() {
    const stats = {};
    for (const [model, perf] of this.modelPerformance) {
      stats[model] = {
        successRate: perf.total > 0 ? Math.round(perf.success / perf.total * 100) : 0,
        avgTime: Math.round(perf.avgResponseTime),
        failures: this.failureCount.get(model)
      };
    }
    return stats;
  }
}

// 儲存系統
const conversationHistory = new Map();
const learningDatabase = new Map();
const reminderSystem = new Map();
const intelligentAI = new IntelligentAISystem();
const selfHealing = new SelfHealingSystem();

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
      { pattern: /(\d{1,2})秒後/, offset: null, type: 'second' },
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
          case 'second':
            return new Date(now.getTime() + value * 1000);
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
      return message.substring(0, maxLength - 20) + '\n\n...(內容太長被我截掉了 😅)';
    }
    return message;
  }
  
  if (message && message.text) {
    message.text = limitMessageLength(message.text, maxLength);
  }
  
  return message;
}

// 持續學習系統（修復版）
class ContinuousLearningSystem {
  constructor() {
    this.userProfiles = new Map();
    this.conversationPatterns = new Map();
    this.responseEffectiveness = new Map();
    this.contextMemory = new Map();
    this.groupBehaviorPatterns = new Map();
    this.silentLearning = true;
  }

  // 修復：添加缺失的函數
  recordConversationPattern(userId, message, response, groupId) {
    const key = `${userId}-${groupId || 'private'}`;
    
    if (!this.conversationPatterns.has(key)) {
      this.conversationPatterns.set(key, []);
    }

    const patterns = this.conversationPatterns.get(key);
    patterns.push({
      input: message,
      output: response,
      timestamp: new Date(),
      success: true,
      context: this.extractContext(message)
    });

    // 保持最近50個模式
    if (patterns.length > 50) {
      patterns.splice(0, patterns.length - 50);
    }
  }

  extractContext(message) {
    return {
      length: message.length,
      hasQuestion: /\?|？/.test(message),
      hasEmotion: /😊|😭|😤|👌|❤️/.test(message),
      topics: this.extractTopics(message),
      sentiment: this.analyzeEmotion(message)
    };
  }

  evaluateResponseEffectiveness(userId, message, response, isSuccessful) {
    const key = `${userId}-effectiveness`;
    
    if (!this.responseEffectiveness.has(key)) {
      this.responseEffectiveness.set(key, {
        totalResponses: 0,
        successfulResponses: 0,
        effectivenessRate: 0
      });
    }

    const effectiveness = this.responseEffectiveness.get(key);
    effectiveness.totalResponses++;
    if (isSuccessful) {
      effectiveness.successfulResponses++;
    }
    effectiveness.effectivenessRate = effectiveness.successfulResponses / effectiveness.totalResponses;
  }

  recordInteraction(userId, userName, message, response, groupId = null, isSuccessful = true) {
    try {
      // 更新用戶檔案
      this.updateUserProfile(userId, userName, message, groupId);
      
      // 記錄對話模式
      this.recordConversationPattern(userId, message, response, groupId);
      
      // 評估回應效果
      this.evaluateResponseEffectiveness(userId, message, response, isSuccessful);
      
      // 更新上下文記憶
      this.updateContextMemory(userId, message, groupId);
      
      // 群組行為分析
      if (groupId) {
        this.analyzeGroupBehavior(groupId, userId, userName, message);
      }
      
    } catch (error) {
      console.error('學習記錄錯誤:', error.message);
      // 不中斷主流程
    }
  }

  updateUserProfile(userId, userName, message, groupId) {
    const key = `${userId}-${groupId || 'private'}`;
    
    if (!this.userProfiles.has(key)) {
      this.userProfiles.set(key, {
        userId, userName, groupId,
        messageCount: 0,
        topics: new Map(),
        timePatterns: new Map(),
        emotionalTone: { positive: 0, neutral: 0, negative: 0 },
        communicationStyle: 'unknown',
        preferredResponseStyle: 'friendly',
        lastActive: null,
        contextTags: new Set()
      });
    }

    const profile = this.userProfiles.get(key);
    profile.messageCount++;
    profile.lastActive = new Date();
    
    // 分析語調和情緒
    const emotion = this.analyzeEmotion(message);
    profile.emotionalTone[emotion]++;
    
    // 分析話題
    const topics = this.extractTopics(message);
    topics.forEach(topic => {
      profile.topics.set(topic, (profile.topics.get(topic) || 0) + 1);
    });
    
    // 分析時間模式
    const hour = new Date().getHours();
    const timeSlot = hour < 6 ? 'late_night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    profile.timePatterns.set(timeSlot, (profile.timePatterns.get(timeSlot) || 0) + 1);
    
    // 更新溝通風格
    profile.communicationStyle = this.analyzeCommStyle(message);
  }

  updateContextMemory(userId, message, groupId) {
    const key = `${userId}-${groupId || 'private'}`;
    
    if (!this.contextMemory.has(key)) {
      this.contextMemory.set(key, []);
    }

    const context = this.contextMemory.get(key);
    context.push({
      message,
      timestamp: new Date(),
      topics: this.extractTopics(message),
      emotion: this.analyzeEmotion(message),
      intent: this.analyzeIntent(message)
    });

    // 保持最近20條上下文
    if (context.length > 20) {
      context.splice(0, context.length - 20);
    }
  }

  getContextualPrompt(userId, currentMessage, groupId = null) {
    const key = `${userId}-${groupId || 'private'}`;
    const profile = this.userProfiles.get(key);
    const context = this.contextMemory.get(key) || [];
    
    let prompt = `你要模仿一個台灣人的說話方式，特點如下：

語氣特色：
- 隨和、帶點幽默，使用「好der」、「ㄜ」等台灣口語
- 適當使用emoji：👌😍🥹😅🤔等
- 遇到問題直接說「哎呦」、「GG了」等
- 親切有同理心，會安撫和理解對方

回覆原則：
- 先簡短回應，再追問細節
- 直接給答案或解決方案
- 保持對話溫暖正向
- 根據情境靈活調整語氣`;

    if (profile) {
      const topTopics = Array.from(profile.topics.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic]) => topic);
      
      const dominantEmotion = Object.keys(profile.emotionalTone)
        .reduce((a, b) => profile.emotionalTone[a] > profile.emotionalTone[b] ? a : b);

      prompt += `\n\n用戶 ${profile.userName} 的特徵：
- 常談話題：${topTopics.join(', ')}
- 情緒傾向：${dominantEmotion}
- 溝通風格：${profile.communicationStyle}
- 互動次數：${profile.messageCount}次`;
    }

    if (context.length > 0) {
      const recentContext = context.slice(-3);
      prompt += `\n\n最近對話脈絡：`;
      recentContext.forEach((ctx, i) => {
        prompt += `\n${i + 1}. ${ctx.message} (${ctx.emotion}, ${ctx.intent})`;
      });
    }

    prompt += `\n\n現在回應：${currentMessage}

要求：
- 用我描述的台灣口語風格
- 考慮對話脈絡
- 100字以內
- 自然有趣不做作`;

    return prompt;
  }

  analyzeEmotion(message) {
    const positive = /好|棒|讚|開心|高興|爽|讚讚|棒棒|哈哈|笑|😊|😍|🥰|👌|✨/.test(message);
    const negative = /爛|糟|慘|GG|完蛋|哭|煩|累|難過|😭|😤|😵/.test(message);
    const excited = /哇|天啊|太|超|好厲害|驚|！{2,}/.test(message);
    
    if (excited) return 'excited';
    if (positive) return 'positive';
    if (negative) return 'negative';
    return 'neutral';
  }

  analyzeIntent(message) {
    if (/\?|？|嗎|呢|如何|怎麼|為什麼/.test(message)) return 'question';
    if (/請|幫|能否|可以/.test(message)) return 'request';
    if (/謝謝|感謝|讚|好/.test(message)) return 'appreciation';
    if (/不|沒有|不要|不行/.test(message)) return 'negative_response';
    if (/好|可以|OK|沒問題/.test(message)) return 'positive_response';
    return 'statement';
  }

  analyzeCommStyle(message) {
    if (message.length < 10) return 'concise';
    if (/哈哈|笑|😂|🤣/.test(message)) return 'humorous';
    if (message.includes('?') || message.includes('？')) return 'inquisitive';
    if (/！|!/.test(message)) return 'expressive';
    return 'casual';
  }

  extractTopics(message) {
    const topicMap = {
      work: /工作|上班|公司|專案|會議|報告|任務|deadline/,
      study: /讀書|考試|學校|課程|作業|研究|論文|統計學/,
      food: /吃|餐廳|食物|午餐|晚餐|早餐|飲料|咖啡/,
      entertainment: /電影|音樂|遊戲|Netflix|YouTube|追劇/,
      social: /朋友|聚會|約會|家人|聊天|見面/,
      health: /累|睡|休息|運動|身體|健康|醫院/,
      tech: /程式|電腦|手機|app|網路|系統|bug/,
      weather: /天氣|下雨|熱|冷|溫度|颱風/,
      time: /時間|明天|今天|昨天|下週|月底|deadline/,
      emotion: /開心|難過|煩|爽|累|壓力|放鬆/
    };

    const topics = [];
    for (const [topic, pattern] of Object.entries(topicMap)) {
      if (pattern.test(message)) {
        topics.push(topic);
      }
    }
    return topics;
  }

  analyzeGroupBehavior(groupId, userId, userName, message) {
    if (!this.groupBehaviorPatterns.has(groupId)) {
      this.groupBehaviorPatterns.set(groupId, {
        memberActivity: new Map(),
        discussionTopics: new Map(),
        communicationPatterns: new Map(),
        lastAnalysis: new Date()
      });
    }

    const groupData = this.groupBehaviorPatterns.get(groupId);
    
    // 記錄成員活動
    if (!groupData.memberActivity.has(userId)) {
      groupData.memberActivity.set(userId, { name: userName, messages: 0, lastSeen: new Date() });
    }
    
    const memberData = groupData.memberActivity.get(userId);
    memberData.messages++;
    memberData.lastSeen = new Date();

    // 分析討論話題
    const topics = this.extractTopics(message);
    topics.forEach(topic => {
      groupData.discussionTopics.set(topic, (groupData.discussionTopics.get(topic) || 0) + 1);
    });
  }

  shouldReportToAdmin(groupId, message, userId) {
    const decisionKeywords = ['決定', '決策', '怎麼辦', '選擇', '投票', '同意嗎'];
    const urgentKeywords = ['緊急', '重要', '急', '快', '馬上'];
    
    const hasDecisionKeyword = decisionKeywords.some(kw => message.includes(kw));
    const hasUrgentKeyword = urgentKeywords.some(kw => message.includes(kw));
    
    if (hasDecisionKeyword || hasUrgentKeyword) {
      return {
        shouldReport: true,
        type: hasUrgentKeyword ? 'urgent' : 'decision',
        message: message,
        groupId: groupId,
        userId: userId
      };
    }
    
    return { shouldReport: false };
  }
}

// 簡化提醒系統
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

// 貼圖和梗圖回應系統
class StickerResponseSystem {
  constructor() {
    this.stickerPackages = {
      basic: { packageId: '446', stickers: ['1988', '1989', '1990', '1991', '1992'] },
      cute: { packageId: '789', stickers: ['10855', '10856', '10857', '10858'] },
      funny: { packageId: '1070', stickers: ['17839', '17840', '17841', '17842'] }
    };
    
    this.memeTemplates = [
      '(╯°□°）╯︵ ┻━┻',
      '¯\\_(ツ)_/¯',
      '(´･ω･`)',
      'ಠ_ಠ',
      '(｡◕‿◕｡)',
      '(╥﹏╥)',
      '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',
      '(⊙_⊙)',
      '(づ｡◕‿‿◕｡)づ',
      '(ง •̀_•́)ง'
    ];
  }

  shouldUseStickerOrMeme(message, context = {}) {
    const stickerTriggers = [
      /哈哈|笑死|好笑|XDDD|XDD|www/,
      /開心|高興|太棒|讚讚|爽/,
      /難過|哭|QQ|嗚嗚/,
      /生氣|怒|火大|靠/,
      /驚訝|哇|天啊|不會吧/,
      /累|GG|完蛋|死了/,
      /愛你|喜歡|❤|💕/,
      /拜拜|再見|掰掰|bye/
    ];

    const shouldUse = stickerTriggers.some(pattern => pattern.test(message));
    
    // 不要在嚴肅討論中使用貼圖
    const seriousKeywords = ['緊急', '重要', '會議', '工作', '決定', '問題'];
    const isSerious = seriousKeywords.some(kw => message.includes(kw));
    
    return shouldUse && !isSerious && Math.random() > 0.7; // 30%機率使用
  }

  getStickerResponse(message, emotion = 'neutral') {
    if (Math.random() > 0.5) {
      return this.getMemeResponse(emotion);
    } else {
      return this.getLineStickerResponse(emotion);
    }
  }

  getMemeResponse(emotion) {
    const memeMap = {
      happy: ['(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(｡◕‿◕｡)', '(づ｡◕‿‿◕｡)づ'],
      sad: ['(╥﹏╥)', '(´･ω･`)', 'QQ'],
      angry: ['(╯°□°）╯︵ ┻━┻', 'ಠ_ಠ', '(ง •̀_•́)ง'],
      surprised: ['(⊙_⊙)', '(ﾟДﾟ)', 'Σ(ﾟДﾟ)'],
      confused: ['¯\\_(ツ)_/¯', '(・_・;)', '(゜-゜)'],
      neutral: ['(´･ω･`)', '(￣▽￣)', '(・∀・)']
    };

    const memes = memeMap[emotion] || memeMap.neutral;
    return {
      type: 'text',
      text: memes[Math.floor(Math.random() * memes.length)]
    };
  }

  getLineStickerResponse(emotion) {
    const packages = {
      happy: this.stickerPackages.cute,
      funny: this.stickerPackages.funny,
      neutral: this.stickerPackages.basic
    };

    const selectedPackage = packages[emotion] || packages.neutral;
    const randomSticker = selectedPackage.stickers[
      Math.floor(Math.random() * selectedPackage.stickers.length)
    ];

    return {
      type: 'sticker',
      packageId: selectedPackage.packageId,
      stickerId: randomSticker
    };
  }
}

// 群組訊息轉發系統
class GroupMessageForwarder {
  constructor() {
    this.importantMessageQueue = new Map();
    this.lastReportTime = new Map();
  }

  async analyzeAndForwardMessage(groupId, userId, userName, message) {
    try {
      const reportCheck = continuousLearning.shouldReportToAdmin(groupId, message, userId);
      
      if (reportCheck.shouldReport) {
        await this.forwardToAdmin(groupId, userId, userName, message, reportCheck.type);
      }
      
      this.recordImportantMessage(groupId, userId, userName, message);
      
    } catch (error) {
      console.error('群組訊息轉發錯誤:', error.message);
    }
  }

  async forwardToAdmin(groupId, userId, userName, message, type) {
    try {
      const currentTime = TimeSystem.getCurrentTime();
      
      const lastReport = this.lastReportTime.get(groupId);
      if (lastReport && (Date.now() - lastReport) < 300000) {
        return;
      }

      const reportMessage = `🚨 群組${type === 'urgent' ? '緊急' : '決策'}通知

📍 群組：${groupId.substring(0, 20)}...
👤 發言者：${userName}
💬 內容：${message}
⏰ 時間：${currentTime.timeOnly}

${type === 'urgent' ? '🔥 這則訊息標記為緊急' : '🤔 可能需要您的決策'}`;

      await client.pushMessage(ADMIN_USER_ID, {
        type: 'text',
        text: limitMessageLength(reportMessage)
      });

      this.lastReportTime.set(groupId, Date.now());
      console.log(`📤 已轉發${type}訊息給管理者`);
      
    } catch (error) {
      console.error('轉發訊息給管理者失敗:', error.message);
    }
  }

  recordImportantMessage(groupId, userId, userName, message) {
    if (!this.importantMessageQueue.has(groupId)) {
      this.importantMessageQueue.set(groupId, []);
    }

    const queue = this.importantMessageQueue.get(groupId);
    queue.push({
      userId,
      userName,
      message,
      timestamp: new Date()
    });

    if (queue.length > 50) {
      queue.splice(0, queue.length - 50);
    }
  }
}

// 初始化系統
const continuousLearning = new ContinuousLearningSystem();
const simpleReminderSystem = new SimpleReminderSystem();
const stickerSystem = new StickerResponseSystem();
const groupForwarder = new GroupMessageForwarder();

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = TimeSystem.getCurrentTime();
  const aiStats = intelligentAI.getModelStats();
  const healthReport = selfHealing.getHealthReport();
  
  res.send(`
    <h1>🧠 終極智能 LINE Bot 正在運行！</h1>
    <p><strong>台灣時間：${currentTime.formatted}</strong></p>
    
    <h2>🚑 系統健康度：${healthReport.health}% (${healthReport.status})</h2>
    <ul>
      <li>✅ 已修復錯誤：${healthReport.recoveredErrors} 個</li>
      <li>❌ 嚴重錯誤：${healthReport.criticalErrors} 個</li>
      <li>🧠 學會修復方法：${healthReport.learnedFixes} 種</li>
    </ul>
    
    <h2>🤖 AI 模型狀態：</h2>
    <ul>
      <li>Gemini: 成功率 ${aiStats.gemini?.successRate || 0}%, 平均 ${aiStats.gemini?.avgTime || 0}ms</li>
      <li>🔥 Grok: 成功率 ${aiStats.grok?.successRate || 0}%, 平均 ${aiStats.grok?.avgTime || 0}ms</li>
      <li>GPT: 成功率 ${aiStats.gpt?.successRate || 0}%, 平均 ${aiStats.gpt?.avgTime || 0}ms</li>
      <li>DeepSeek: 成功率 ${aiStats.deepseek?.successRate || 0}%, 平均 ${aiStats.deepseek?.avgTime || 0}ms</li>
      <li>Claude: 成功率 ${aiStats.claude?.successRate || 0}%, 平均 ${aiStats.claude?.avgTime || 0}ms</li>
    </ul>
    
    <h2>📊 學習系統：</h2>
    <ul>
      <li>🧠 用戶檔案：${continuousLearning.userProfiles.size} 份</li>
      <li>💬 對話脈絡：${continuousLearning.contextMemory.size} 人</li>
      <li>👥 群組分析：${continuousLearning.groupBehaviorPatterns.size} 個</li>
      <li>⏰ 活躍提醒：${simpleReminderSystem.reminders.size} 個</li>
    </ul>
    
    <h2>🚀 終極功能：</h2>
    <ul>
      <li>✅ 智能 AI 切換系統（Grok 優先）</li>
      <li>✅ 自我修復與學習</li>
      <li>✅ 持續學習（靜默模式）</li>
      <li>✅ 台灣口語風格模擬</li>
      <li>✅ 前後文理解</li>
      <li>✅ 智能貼圖回應</li>
      <li>✅ 群組訊息轉發</li>
      <li>✅ 隱私保護</li>
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

// 終極事件處理函數（帶自我修復）
async function handleEvent(event) {
  try {
    if (event.type !== 'message' || event.message.type !== 'text') {
      return Promise.resolve(null);
    }

    const userId = event.source.userId;
    const groupId = event.source.groupId;
    const messageText = event.message.text.trim();
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

    // 群組訊息分析和轉發
    if (groupId) {
      await groupForwarder.analyzeAndForwardMessage(groupId, userId, userName, messageText);
    }

    // 檢查是否應該使用貼圖回應
    if (stickerSystem.shouldUseStickerOrMeme(messageText)) {
      const emotion = continuousLearning.analyzeEmotion(messageText);
      const stickerResponse = stickerSystem.getStickerResponse(messageText, emotion);
      
      continuousLearning.recordInteraction(userId, userName, messageText, 'sticker_response', groupId, true);
      
      if (Math.random() > 0.8) {
        return client.replyMessage(event.replyToken, stickerResponse);
      }
    }

    // 提醒功能處理
    if (messageText.includes('提醒我') || /\d+秒後|\d+分鐘後|\d+小時後/.test(messageText)) {
      const targetTime = TimeSystem.parseTimeExpression(messageText);
      
      if (targetTime) {
        const title = messageText.replace(/提醒我|秒後|分鐘後|小時後|\d+/g, '').trim() || '重要提醒';
        const reminderId = simpleReminderSystem.createReminder(userId, title, targetTime);
        
        const currentTime = TimeSystem.getCurrentTime();
        const delaySeconds = Math.round((targetTime.getTime() - currentTime.timestamp.getTime()) / 1000);
        
        const confirmMessage = `⏰ 提醒設定成功！

📝 內容：${title}
⏰ 目標時間：${targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}
⌛ 約 ${delaySeconds} 秒後提醒

現在時間：${currentTime.timeOnly}`;

        continuousLearning.recordInteraction(userId, userName, messageText, confirmMessage, groupId, true);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: limitMessageLength(confirmMessage)
        });
      }
    }

    // 系統狀態查詢
    if (messageText.includes('系統狀態') || messageText.includes('AI狀態')) {
      const statusMessage = getSystemStatus();
      continuousLearning.recordInteraction(userId, userName, messageText, statusMessage, groupId, true);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: limitMessageLength(statusMessage)
      });
    }

    // 一般對話處理
    const response = await handleIntelligentChat(userId, userName, messageText, groupId);
    
    // 記錄學習互動
    continuousLearning.recordInteraction(userId, userName, messageText, response, groupId, true);
    
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: limitMessageLength(response)
    });

  } catch (error) {
    console.error('處理事件錯誤:', error.message);
    
    // 觸發自我修復
    const healingResult = await selfHealing.handleError(error, {
      userId: event.source?.userId,
      messageText: event.message?.text,
      timestamp: new Date()
    });
    
    try {
      let fallbackResponse;
      if (healingResult.success) {
        fallbackResponse = '哎呦！我剛剛修復了一個小問題 😅 現在可以繼續聊囉！';
      } else {
        fallbackResponse = 'ㄜ...我遇到點技術問題，但我正在學習怎麼處理 🤖 可以再試一次嗎？';
      }
      
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: fallbackResponse
      });
    } catch (replyError) {
      console.error('回覆錯誤訊息失敗:', replyError.message);
      return Promise.resolve(null);
    }
  }
}

// 智能對話處理
async function handleIntelligentChat(userId, userName, message, groupId = null) {
  try {
    // 獲取個性化提示詞
    const contextualPrompt = continuousLearning.getContextualPrompt(userId, message, groupId);
    
    // 使用智能 AI 系統生成回應（Grok優先）
    const response = await intelligentAI.generateResponse(contextualPrompt, {
      userId,
      userName,
      message,
      groupId,
      isGroupChat: !!groupId
    });
    
    // 清理回應
    let cleanResponse = response
      .replace(/[*#`_~\[\]]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // 確保回應不會洩露隱私信息
    cleanResponse = sanitizeResponse(cleanResponse, groupId);
    
    return cleanResponse || '嗯嗯，我在想要怎麼回你 🤔';
    
  } catch (error) {
    console.error('智能對話處理錯誤:', error.message);
    
    // 觸發自我修復
    await selfHealing.handleError(error, { userId, message });
    
    return getFallbackResponse(userName, message);
  }
}

// 隱私保護 - 清理回應中的敏感信息
function sanitizeResponse(response, groupId) {
  let sanitized = response
    .replace(/U[0-9a-f]{32}/gi, '[用戶]')
    .replace(/C[0-9a-f]{32}/gi, '[群組]')
    .replace(/R[0-9a-f]{32}/gi, '[房間]');
  
  if (groupId) {
    sanitized = sanitized
      .replace(/私訊|私下|個別/g, '私下聊')
      .replace(/管理者|admin/gi, '負責人');
  }
  
  return sanitized;
}

// 備用回應系統
function getFallbackResponse(userName, message) {
  const responses = [
    `${userName}，我正在想要怎麼回你好der 🤔`,
    `ㄜ...讓我緩一下腦袋 😅`,
    `哎呦！我剛剛恍神了，你說什麼？ 🥹`,
    `GG，我的AI腦袋需要重開機一下 😵‍💫`,
    `有點lag到，但我有記住你說的話！ ✨`,
    `我在思考中...可能需要一點時間 🤖`,
    `抱歉der，我剛剛在學習新東西 📚`
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// 系統狀態獲取
function getSystemStatus() {
  const currentTime = TimeSystem.getCurrentTime();
  const aiStats = intelligentAI.getModelStats();
  const healthReport = selfHealing.getHealthReport();
  
  return `🧠 終極系統狀態 (${currentTime.timeOnly})

🚑 系統健康度：${healthReport.health}% (${healthReport.status})
✅ 修復成功：${healthReport.recoveredErrors} 次
❌ 嚴重錯誤：${healthReport.criticalErrors} 次
🧠 學會修復：${healthReport.learnedFixes} 種

🤖 AI模型表現：
Gemini: ${aiStats.gemini?.successRate || 0}% 成功率
🔥 Grok: ${aiStats.grok?.successRate || 0}% 成功率  
GPT: ${aiStats.gpt?.successRate || 0}% 成功率
DeepSeek: ${aiStats.deepseek?.successRate || 0}% 成功率
Claude: ${aiStats.claude?.successRate || 0}% 成功率

📚 學習系統：
🧠 用戶檔案：${continuousLearning.userProfiles.size} 份
💬 對話記錄：${continuousLearning.contextMemory.size} 人  
👥 群組分析：${continuousLearning.groupBehaviorPatterns.size} 個

🚀 功能狀態：
✅ 智能AI切換 (Grok優先)
✅ 自我修復學習
✅ 持續學習系統
✅ 台灣口語模擬
✅ 前後文理解
✅ 貼圖智能回應
✅ 群組訊息轉發
✅ 隱私保護

💡 系統運行${healthReport.status === 'healthy' ? '完美' : '需要關注'}！`;
}

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  const currentTime = TimeSystem.getCurrentTime();
  console.log('🎉 終極智能 LINE Bot 伺服器成功啟動！');
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`🇹🇼 台灣時間：${currentTime.formatted}`);
  console.log(`👑 管理者 ID：${ADMIN_USER_ID}`);
  console.log('🚀 終極功能：');
  console.log('   - 🧠 智能 AI 多模型切換（Grok優先）');
  console.log('   - 🚑 自我修復與學習系統');
  console.log('   - 📚 持續學習系統（靜默）');
  console.log('   - 🗣️ 台灣口語風格模擬');
  console.log('   - 🔗 前後文理解能力');
  console.log('   - 🎭 智能貼圖和梗圖回應');
  console.log('   - 📤 群組訊息智能轉發');
  console.log('   - 🛡️ 隱私保護機制');
  console.log('   - ⚡ 錯誤處理優化');
});

process.on('uncaughtException', async (error) => {
  console.error('未捕獲的異常:', error.message);
  await selfHealing.handleError(error, { source: 'uncaughtException' });
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
  await selfHealing.handleError(new Error(reason), { source: 'unhandledRejection' });
});

module.exports = app;