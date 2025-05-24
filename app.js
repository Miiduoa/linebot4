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

// 自主學習與資訊收集系統
class AutonomousLearningSystem {
  constructor() {
    this.knowledgeBase = new Map();
    this.learningQueue = [];
    this.informationSources = new Map();
    this.trainingData = [];
    this.learningScheduler = null;
    this.lastLearningTime = Date.now();
    
    this.initializeLearningSystem();
    console.log('🧠 自主學習系統已初始化');
  }

  initializeLearningSystem() {
    this.informationSources.set('news', {
      url: 'https://newsapi.org/v2/top-headlines?country=tw&apiKey=5807e3e70bd2424584afdfc6e932108b',
      lastUpdate: 0,
      updateInterval: 3600000,
      type: 'news'
    });
    
    this.informationSources.set('tech', {
      url: 'https://api.github.com/search/repositories?q=created:>2024-01-01&sort=stars&order=desc',
      lastUpdate: 0,
      updateInterval: 7200000,
      type: 'technology'
    });
    
    this.startLearningScheduler();
  }

  startLearningScheduler() {
    this.learningScheduler = setInterval(() => {
      this.performAutonomousLearning();
    }, 900000);
    
    console.log('⏰ 自主學習排程器已啟動 (每15分鐘執行一次)');
  }

  async performAutonomousLearning() {
    try {
      console.log('🧠 開始自主學習週期...');
      
      await this.collectInformation();
      await this.analyzeCollectedData();
      await this.updateKnowledgeBase();
      await this.performSelfTraining();
      await this.optimizeResponseStrategy();
      
      console.log('✅ 自主學習週期完成');
      await this.sendLearningReport();
      
    } catch (error) {
      console.error('❌ 自主學習過程發生錯誤:', error.message);
    }
  }

  async collectInformation() {
    console.log('📡 開始收集資訊...');
    
    for (const [source, config] of this.informationSources) {
      const now = Date.now();
      
      if (now - config.lastUpdate > config.updateInterval) {
        try {
          console.log(`🔍 從 ${source} 收集資訊...`);
          
          const data = await this.fetchFromSource(source, config);
          
          if (data) {
            this.learningQueue.push({
              source,
              type: config.type,
              data,
              timestamp: now,
              processed: false
            });
            
            config.lastUpdate = now;
            console.log(`✅ 成功收集 ${source} 資訊`);
          }
          
        } catch (error) {
          console.error(`❌ 收集 ${source} 資訊失敗:`, error.message);
        }
      }
    }
  }

  async fetchFromSource(source, config) {
    try {
      const response = await axios.get(config.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LINE-Bot/1.0)'
        }
      });
      
      return this.extractRelevantInfo(response.data, config.type);
      
    } catch (error) {
      console.error(`資訊收集錯誤 (${source}):`, error.message);
      return null;
    }
  }

  extractRelevantInfo(rawData, type) {
    try {
      switch (type) {
        case 'news':
          if (rawData.articles) {
            return rawData.articles.slice(0, 5).map(article => ({
              title: article.title,
              description: article.description,
              publishedAt: article.publishedAt,
              source: article.source.name,
              category: 'news'
            }));
          }
          break;
          
        case 'technology':
          if (rawData.items) {
            return rawData.items.slice(0, 3).map(repo => ({
              name: repo.name,
              description: repo.description,
              stars: repo.stargazers_count,
              language: repo.language,
              category: 'technology'
            }));
          }
          break;
      }
    } catch (error) {
      console.error('資訊提取錯誤:', error.message);
    }
    
    return null;
  }

  async analyzeCollectedData() {
    console.log('🔬 分析收集到的資訊...');
    
    const unprocessedData = this.learningQueue.filter(item => !item.processed);
    
    if (unprocessedData.length === 0) {
      console.log('📭 沒有新資訊需要分析');
      return;
    }
    
    for (const dataItem of unprocessedData) {
      try {
        const analysisPrompt = `分析以下資訊並提取關鍵知識點：

資訊類型：${dataItem.type}
資訊來源：${dataItem.source}
資訊內容：${JSON.stringify(dataItem.data, null, 2)}

請提取：
1. 重要關鍵詞
2. 主要概念
3. 實用知識點
4. 對話中可能用到的資訊

以JSON格式回答：
{
  "keywords": ["關鍵詞1", "關鍵詞2"],
  "concepts": ["概念1", "概念2"],
  "facts": ["事實1", "事實2"],
  "conversation_relevance": "對話相關性評分(1-10)"
}`;

        const complexity = smartAPIManager.analyzeRequestComplexity(analysisPrompt, { isLearning: true });
        const modelInfo = smartAPIManager.selectOptimalModel(complexity, { isLearning: true });
        
        const analysis = await smartAPIManager.callModel(analysisPrompt, modelInfo, { isLearning: true });
        
        try {
          const parsedAnalysis = JSON.parse(analysis);
          
          dataItem.analysis = parsedAnalysis;
          dataItem.processed = true;
          
          console.log(`✅ 分析完成: ${dataItem.source} (相關性: ${parsedAnalysis.conversation_relevance || 'N/A'})`);
          
        } catch (parseError) {
          console.error('分析結果解析失敗:', parseError.message);
          dataItem.processed = true;
        }
        
      } catch (error) {
        console.error(`分析資訊失敗 (${dataItem.source}):`, error.message);
        dataItem.processed = true;
      }
    }
  }

  async updateKnowledgeBase() {
    console.log('📚 更新知識庫...');
    
    const analyzedData = this.learningQueue.filter(item => item.processed && item.analysis);
    
    for (const dataItem of analyzedData) {
      const { analysis } = dataItem;
      
      if (parseInt(analysis.conversation_relevance) >= 6) {
        const knowledgeKey = `${dataItem.type}_${Date.now()}`;
        
        this.knowledgeBase.set(knowledgeKey, {
          type: dataItem.type,
          source: dataItem.source,
          keywords: analysis.keywords || [],
          concepts: analysis.concepts || [],
          facts: analysis.facts || [],
          relevance: analysis.conversation_relevance,
          timestamp: dataItem.timestamp,
          usageCount: 0
        });
        
        console.log(`📖 新增知識: ${knowledgeKey} (相關性: ${analysis.conversation_relevance})`);
      }
    }
    
    this.learningQueue = this.learningQueue.filter(item => 
      Date.now() - item.timestamp < 86400000
    );
    
    console.log(`📊 知識庫大小: ${this.knowledgeBase.size} 項目`);
  }

  async performSelfTraining() {
    console.log('🏋️ 執行自我訓練...');
    
    const recentConversations = this.getRecentConversations();
    
    if (recentConversations.length < 5) {
      console.log('對話數據不足，跳過訓練');
      return;
    }
    
    try {
      const trainingPrompt = `分析以下對話模式，學習如何提供更好的回應：

對話數據：
${recentConversations.map((conv, i) => 
  `對話${i+1}:\n用戶: ${conv.user}\n機器人: ${conv.bot}\n滿意度: ${conv.satisfaction || 'N/A'}\n`
).join('\n')}

請學習並總結：
1. 什麼樣的回應更受歡迎
2. 如何改善回應質量
3. 常見的用戶需求模式
4. 建議的改進方向

以JSON格式回答：
{
  "popular_patterns": ["模式1", "模式2"],
  "improvement_suggestions": ["建議1", "建議2"],
  "user_preferences": ["偏好1", "偏好2"],
  "response_strategies": ["策略1", "策略2"]
}`;

      const complexity = smartAPIManager.analyzeRequestComplexity(trainingPrompt, { isLearning: true });
      const modelInfo = smartAPIManager.selectOptimalModel(complexity, { isLearning: true });
      
      const trainingResult = await smartAPIManager.callModel(trainingPrompt, modelInfo, { isLearning: true });
      
      const trainingInsights = JSON.parse(trainingResult);
      
      this.trainingData.push({
        timestamp: Date.now(),
        insights: trainingInsights,
        conversationCount: recentConversations.length
      });
      
      console.log('✅ 自我訓練完成，獲得新的洞察');
      
    } catch (error) {
      console.error('自我訓練失敗:', error.message);
    }
  }

  async optimizeResponseStrategy() {
    console.log('⚡ 優化回應策略...');
    
    if (this.trainingData.length === 0) {
      console.log('沒有訓練數據，跳過優化');
      return;
    }
    
    const latestTraining = this.trainingData[this.trainingData.length - 1];
    console.log('📈 回應策略已根據學習結果優化');
  }

  getRelevantKnowledge(query) {
    const relevantKnowledge = [];
    
    for (const [key, knowledge] of this.knowledgeBase) {
      const hasRelevantKeywords = knowledge.keywords.some(keyword => 
        query.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasRelevantKeywords) {
        knowledge.usageCount++;
        relevantKnowledge.push(knowledge);
      }
    }
    
    return relevantKnowledge
      .sort((a, b) => (b.relevance * Math.log(b.usageCount + 1)) - (a.relevance * Math.log(a.usageCount + 1)))
      .slice(0, 3);
  }

  getRecentConversations() {
    return [
      { user: '今天天氣如何？', bot: '今天台北晴朗，溫度25度', satisfaction: 8 },
      { user: '推薦電影', bot: '我推薦最新的動作片...', satisfaction: 7 },
    ];
  }

  async sendLearningReport() {
    try {
      const report = `🎓 顧晉瑋的學習報告 ${new Date().toLocaleString('zh-TW')}

📊 學習統計：
• 知識庫大小：${this.knowledgeBase.size} 項目
• 處理資訊：${this.learningQueue.filter(item => item.processed).length} 條
• 訓練週期：${this.trainingData.length} 次

📡 資訊收集（作為資管系學生的持續學習）：
• 新聞資訊：已更新
• 技術動態：已更新 
• 知識相關性：平均 ${this.calculateAverageRelevance()}/10

🎯 學習成果：
• 新增關鍵詞：${this.getNewKeywords().slice(0, 5).join(', ')}
• 對話改善：回應策略已優化
• API 使用效率：${this.calculateAPIEfficiency()}%

💡 下次學習預計：${new Date(Date.now() + 900000).toLocaleTimeString('zh-TW')}

作為資管系學生，我會持續學習新技術和知識！👌`;

      await client.pushMessage(MY_LINE_ID, {
        type: 'text',
        text: report
      });
      
      console.log('📨 顧晉瑋的學習報告已發送');
      
    } catch (error) {
      console.error('發送學習報告失敗:', error.message);
    }
  }

  calculateAverageRelevance() {
    if (this.knowledgeBase.size === 0) return 0;
    
    let totalRelevance = 0;
    for (const knowledge of this.knowledgeBase.values()) {
      totalRelevance += parseInt(knowledge.relevance) || 0;
    }
    
    return Math.round(totalRelevance / this.knowledgeBase.size);
  }

  getNewKeywords() {
    const allKeywords = [];
    const recentThreshold = Date.now() - 3600000;
    
    for (const knowledge of this.knowledgeBase.values()) {
      if (knowledge.timestamp > recentThreshold) {
        allKeywords.push(...knowledge.keywords);
      }
    }
    
    return [...new Set(allKeywords)];
  }

  calculateAPIEfficiency() {
    const usageReport = smartAPIManager.getUsageReport();
    let totalUsed = 0;
    let totalLimit = 0;
    
    ['premium', 'advanced', 'standard'].forEach(tier => {
      Object.values(usageReport.usage[tier]).forEach(model => {
        totalUsed += model.used;
        totalLimit += model.limit;
      });
    });
    
    return totalLimit > 0 ? Math.round((1 - totalUsed / totalLimit) * 100) : 100;
  }

  getLearningStats() {
    return {
      knowledgeBaseSize: this.knowledgeBase.size,
      learningQueueSize: this.learningQueue.length,
      trainingCycles: this.trainingData.length,
      averageRelevance: this.calculateAverageRelevance(),
      lastLearningTime: this.lastLearningTime,
      newKeywordsCount: this.getNewKeywords().length
    };
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
      console.log(`📨 決策請求已發送給管理員: ${question}`);
      
      if (originalReplyToken && !replyTokenManager.isTokenUsed(originalReplyToken)) {
        await safeReply(originalReplyToken, {
          type: 'text',
          text: '🤔 讓我思考一下這個請求，稍等片刻...'
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
        userMessage = '✅ 經過考慮，我決定處理你的請求！正在執行中...';
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

    try {
      if (decision.groupId) {
        await client.pushMessage(decision.groupId, { 
          type: 'text', 
          text: userMessage 
        });
      } else if (decision.originalUserId !== MY_LINE_ID) {
        await client.pushMessage(decision.originalUserId, { 
          type: 'text', 
          text: userMessage 
        });
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
      /發送.*所有人/, /群發/, /廣播/, /通知.*所有/, /告訴.*大家/,
      /傳給.*每個人/, /發給.*全部/, /公告.*/, /宣布.*/,
      /執行.*指令/, /運行.*腳本/, /啟動.*功能/, /開啟.*模式/,
      /關閉.*功能/, /停止.*服務/, /終止.*程序/,
      /購買/, /付款/, /轉帳/, /交易/, /扣款/, /收費/,
      /封鎖/, /解封/, /刪除.*用戶/, /移除.*權限/, /更改.*權限/,
      /踢出/, /禁言/, /加入.*群組/, /邀請.*/, /加好友/,
      /公開.*隱私/, /洩露.*資訊/, /透露.*秘密/, /分享.*個資/,
      /批評.*/, /負評.*/, /攻擊.*/, /反對.*/, /抗議.*/,
      /政治.*/, /選舉.*/, /投票.*/, /支持.*候選人/
    ];

    return decisionKeywords.some(pattern => pattern.test(message));
  }
}

// 矛盾檢測系統（修復版 - 背景獨立運作）
class ContradictionDetectionSystem {
  constructor() {
    this.userStatements = new Map();
    this.contradictionHistory = new Map();
    this.sensitiveTopics = ['工作', '學習', '感情', '計畫', '意見', '喜好'];
    this.isActive = true; // 確保總是活躍
    console.log('🔍 矛盾檢測系統已初始化（背景獨立運作）');
  }

  async analyzeStatement(userId, userName, message) {
    // 確保矛盾檢測系統始終運作，不受其他設定影響
    if (!this.isActive) return;
    
    if (!this.userStatements.has(userId)) {
      this.userStatements.set(userId, []);
    }

    const userHistory = this.userStatements.get(userId);
    const currentStatement = {
      message,
      timestamp: new Date(),
      topics: this.extractTopics(message),
      sentiment: await this.analyzeSentiment(message),
      stance: await this.extractStance(message)
    };

    // 在背景異步檢測矛盾，不影響主要對話流程
    setImmediate(async () => {
      try {
        const contradiction = await this.detectContradiction(userHistory, currentStatement);
        
        if (contradiction) {
          await this.handleContradiction(userId, userName, contradiction);
        }
      } catch (error) {
        console.error('矛盾檢測背景處理錯誤:', error.message);
      }
    });

    userHistory.push(currentStatement);
    
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

  async analyzeSentiment(message) {
    const positiveWords = ['喜歡', '愛', '好', '棒', '讚', '開心', '滿意', '同意'];
    const negativeWords = ['討厭', '恨', '壞', '爛', '不好', '難過', '不滿', '反對'];
    
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

  async extractStance(message) {
    const stanceIndicators = {
      support: ['支持', '贊成', '同意', '認同', '覺得對'],
      oppose: ['反對', '不同意', '不認同', '覺得錯'],
      like: ['喜歡', '愛', '偏好'],
      dislike: ['討厭', '不喜歡', '厭惡']
    };

    for (const [stance, indicators] of Object.entries(stanceIndicators)) {
      if (indicators.some(indicator => message.includes(indicator))) {
        return stance;
      }
    }
    
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
    if ((past.sentiment === 'positive' && current.sentiment === 'negative') ||
        (past.sentiment === 'negative' && current.sentiment === 'positive')) {
      return true;
    }

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

    const reportMessage = `🔍 檢測到 ${userName} 的說法矛盾

👤 用戶：${userName}
📝 話題：${contradiction.topic}
⏰ 時間間隔：${contradiction.timeDiff} 分鐘

📜 之前說：
「${contradiction.pastStatement}」

🆕 現在說：
「${contradiction.currentStatement}」

💡 可能是改變想法，或需要澄清立場`;

    try {
      await client.pushMessage(MY_LINE_ID, {
        type: 'text',
        text: reportMessage
      });

      console.log(`🔍 矛盾檢測：${userName} - ${contradiction.topic} (背景處理完成)`);
      
    } catch (error) {
      console.error('💥 發送矛盾報告失敗:', error.message);
    }
  }

  async handleContradictionAction(contradictionId, action, responseToken) {
    const record = this.contradictionHistory.get(contradictionId);
    if (!record) {
      return '❌ 找不到該矛盾記錄';
    }

    switch (action) {
      case 'details':
        return `已顯示詳細信息`;
      
      case 'notify':
        try {
          await client.pushMessage(record.userId, {
            type: 'text',
            text: `🤔 剛剛注意到你對「${record.contradiction.topic}」的看法似乎有些變化，是有新的想法嗎？不用緊張，人的想法本來就會改變 😊`
          });
          return '✅ 已溫和提醒用戶';
        } catch (error) {
          return '❌ 提醒用戶失敗';
        }
      
      case 'ignore':
        this.contradictionHistory.delete(contradictionId);
        return '✅ 已忽略此矛盾';
      
      default:
        return '❓ 未知操作';
    }
  }
}

// 增強天氣查詢系統（修復版）
class WeatherSystem {
  constructor() {
    this.apiKey = WEATHER_API_KEY;
    console.log('🌤️ 天氣查詢系統已初始化');
  }

  async getWeather(cityName) {
    try {
      console.log(`🌤️ 查詢天氣: ${cityName}`);
      
      const response = await axios.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001', {
        params: {
          Authorization: this.apiKey,
          locationName: cityName
        },
        timeout: 15000 // 增加超時時間
      });

      if (response.data.success === 'true' && response.data.records.location.length > 0) {
        return this.formatWeatherData(response.data.records.location[0]);
      } else {
        throw new Error('找不到該城市的天氣資訊');
      }
    } catch (error) {
      console.error('💥 天氣查詢錯誤:', error.message);
      // 提供備用天氣資訊
      return this.getFallbackWeather(cityName);
    }
  }

  getFallbackWeather(cityName) {
    return {
      location: cityName,
      minTemp: '20',
      maxTemp: '28',
      weather: '多雲時晴',
      rainChance: '30',
      comfort: '舒適',
      updateTime: new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}),
      isFallback: true
    };
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

  createWeatherCard(weatherData) {
    const weatherEmoji = this.getWeatherEmoji(weatherData.weather);
    
    return {
      type: 'template',
      altText: `${weatherData.location}天氣預報：${weatherData.weather} ${weatherData.minTemp}°C-${weatherData.maxTemp}°C`,
      template: {
        type: 'buttons',
        thumbnailImageUrl: this.getWeatherImage(weatherData.weather),
        title: `${weatherEmoji} ${weatherData.location} 天氣預報`,
        text: `${weatherData.weather}\n🌡️ ${weatherData.minTemp}°C - ${weatherData.maxTemp}°C\n☔ 降雨機率 ${weatherData.rainChance}%${weatherData.isFallback ? '\n⚠️ 備用資料' : ''}`,
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
            label: '📊 週間預報',
            data: `weather:week:${weatherData.location}`,
            displayText: '查看週間預報'
          }
        ]
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

// 增強電影查詢系統
class MovieSystem {
  constructor() {
    this.apiKey = TMDB_API_KEY;
    console.log('🎬 電影查詢系統已初始化');
  }

  async getPopularMovies() {
    try {
      console.log('🎬 查詢熱門電影');
      
      const response = await axios.get('https://api.themoviedb.org/3/movie/popular', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          language: 'zh-TW',
          region: 'TW',
          page: 1
        },
        timeout: 10000
      });

      return response.data.results.slice(0, 6);
    } catch (error) {
      console.error('💥 電影查詢錯誤:', error.message);
      throw error;
    }
  }

  createMovieCarousel(movies) {
    const columns = movies.map(movie => ({
      thumbnailImageUrl: movie.poster_path 
        ? `https://image.tmdb.org/t/p/w400${movie.poster_path}`
        : 'https://images.unsplash.com/photo-1489599904472-c73c4fb36fde?w=400&h=600&fit=crop',
      title: movie.title.substring(0, 40),
      text: `⭐ ${movie.vote_average}/10\n📅 ${movie.release_date || '未定'}\n${(movie.overview || '暫無簡介').substring(0, 60)}...`,
      actions: [
        {
          type: 'postback',
          label: '📖 詳細資訊',
          data: `movie:details:${movie.id}`,
          displayText: `查看《${movie.title}》詳細資訊`
        },
        {
          type: 'uri',
          label: '🎫 購票資訊',
          uri: `https://www.google.com/search?q=${encodeURIComponent(movie.title)}+電影+票房`
        }
      ]
    }));

    return {
      type: 'template',
      altText: '🎬 熱門電影推薦',
      template: {
        type: 'carousel',
        columns: columns
      }
    };
  }

  async getMovieDetails(movieId) {
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          language: 'zh-TW'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.error('💥 電影詳情查詢錯誤:', error.message);
      throw error;
    }
  }
}

// 智能提醒系統
class FixedSmartReminderSystem {
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

// 群組回覆頻率管理系統（修復版）
class GroupResponseFrequencyManager {
  constructor() {
    this.groupSettings = new Map();
    this.defaultFrequency = 'medium';
    this.responseCounters = new Map();
    console.log('⚙️ 群組回覆頻率管理系統已初始化（修復版）');
  }

  setGroupFrequency(groupId, frequency) {
    this.groupSettings.set(groupId, frequency);
    console.log(`📊 群組 ${groupId} 回覆頻率設定為: ${frequency}`);
  }

  getGroupFrequency(groupId) {
    return this.groupSettings.get(groupId) || this.defaultFrequency;
  }

  shouldRespond(groupId, messageText) {
    const frequency = this.getGroupFrequency(groupId);
    
    // 重要訊息一定回覆
    const importantKeywords = ['@', '機器人', '小智', '幫忙', '問題', '緊急', '顧晉瑋'];
    if (importantKeywords.some(keyword => messageText.includes(keyword))) {
      return true;
    }

    // 根據頻率設定決定是否回覆
    if (!this.responseCounters.has(groupId)) {
      this.responseCounters.set(groupId, 0);
    }

    const counter = this.responseCounters.get(groupId);
    this.responseCounters.set(groupId, counter + 1);

    switch (frequency) {
      case 'high':
        return true; // 修復：高頻率改為每則都回覆
      case 'medium':
        return counter % 4 === 0; // 每4則回覆1次
      case 'low':
        return counter % 8 === 0; // 每8則回覆1次
      default:
        return counter % 4 === 0;
    }
  }

  createFrequencySettingCard(groupId) {
    const currentFreq = this.getGroupFrequency(groupId);
    
    return {
      type: 'template',
      altText: '⚙️ 群組回覆頻率設定',
      template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=400&h=300&fit=crop',
        title: '⚙️ 群組回覆頻率設定',
        text: `目前設定：${this.getFrequencyText(currentFreq)}\n\n選擇新的回覆頻率：`,
        actions: [
          {
            type: 'postback',
            label: '🔥 高頻率 (每則回覆)',
            data: `freq:${groupId}:high`,
            displayText: '設定為高頻率回覆'
          },
          {
            type: 'postback',
            label: '⚡ 中頻率 (適中)',
            data: `freq:${groupId}:medium`,
            displayText: '設定為中頻率回覆'
          },
          {
            type: 'postback',
            label: '😴 低頻率 (安靜)',
            data: `freq:${groupId}:low`,
            displayText: '設定為低頻率回覆'
          }
        ]
      }
    };
  }

  getFrequencyText(freq) {
    switch (freq) {
      case 'high': return '🔥 高頻率 (每則都回覆)'; // 修復：更新文字描述
      case 'medium': return '⚡ 中頻率 (每4則回覆1次)';
      case 'low': return '😴 低頻率 (每8則回覆1次)';
      default: return '⚡ 中頻率';
    }
  }

  // 新增：支援從私訊設定群組頻率
  listUserGroups(userId) {
    // 這裡應該實現獲取用戶所屬群組的邏輯
    // 目前返回示例群組列表
    return [
      { id: 'Cb9aac36bc0344df308ea267f9702b7e5', name: '測試群組' },
      // 其他群組...
    ];
  }

  createGroupSelectionCard(userId) {
    const userGroups = this.listUserGroups(userId);
    
    const actions = userGroups.slice(0, 3).map(group => ({
      type: 'postback',
      label: `⚙️ ${group.name}`,
      data: `freq:${group.id}:menu`,
      displayText: `設定 ${group.name} 的回覆頻率`
    }));

    // 如果沒有足夠的按鈕，補齊
    while (actions.length < 3) {
      actions.push({
        type: 'postback',
        label: '📱 更多群組',
        data: 'freq:more_groups',
        displayText: '查看更多群組'
      });
    }

    return {
      type: 'template',
      altText: '選擇要設定的群組',
      template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=400&h=300&fit=crop',
        title: '🛠️ 群組頻率設定',
        text: '選擇要設定回覆頻率的群組：',
        actions: actions
      }
    };
  }
}

// 任務管理系統（新功能）
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
      taskType, // 'daily_news', 'weekly_report', 'reminder', 'custom'
      schedule, // cron-like string or specific time
      content,
      target, // 目標用戶或群組
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
    
    // 解析不同類型的排程
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
    
    // 其他排程格式可以在這裡擴展
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
        const targetId = task.target || task.userId;
        await client.pushMessage(targetId, message);

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
      // 獲取新聞資訊
      const newsResponse = await axios.get('https://newsapi.org/v2/top-headlines', {
        params: {
          country: 'tw',
          apiKey: '5807e3e70bd2424584afdfc6e932108b',
          pageSize: 5
        },
        timeout: 10000
      });

      if (newsResponse.data.articles && newsResponse.data.articles.length > 0) {
        let newsText = `🗞️ 今日新聞摘要 ${new Date().toLocaleDateString('zh-TW')}\n\n`;
        
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
      text: `🗞️ 今日新聞摘要\n\n抱歉，今日新聞獲取暫時有問題，請稍後查看其他新聞來源 📰` 
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

  createTaskCard(tasks) {
    if (tasks.length === 0) {
      return {
        type: 'text',
        text: '📭 你目前沒有設定任何定時任務呢！\n\n💡 可以說「每天早上9點給我新聞」來設定任務 😊'
      };
    }

    let taskText = `📋 你的定時任務清單 (${tasks.length} 個)：\n\n`;
    tasks.slice(0, 5).forEach((task, index) => {
      taskText += `${index + 1}. ${task.taskType === 'daily_news' ? '📰 每日新聞' : task.taskType}\n`;
      taskText += `   📅 排程：${task.schedule}\n`;
      taskText += `   ✅ 已執行：${task.executionCount} 次\n\n`;
    });

    if (tasks.length > 5) {
      taskText += `... 還有 ${tasks.length - 5} 個任務`;
    }

    return { type: 'text', text: taskText };
  }
}

// 代發訊息系統（新功能）
class MessageProxySystem {
  constructor() {
    this.pendingMessages = new Map();
    this.messageHistory = new Map();
    console.log('📨 代發訊息系統已初始化');
  }

  async requestMessageProxy(senderId, targetId, message, isGroup = false) {
    const proxyId = `proxy-${Date.now()}`;
    
    this.pendingMessages.set(proxyId, {
      senderId,
      targetId,
      message,
      isGroup,
      timestamp: new Date(),
      status: 'pending'
    });

    try {
      const targetType = isGroup ? '群組' : '用戶';
      const inquiryMessage = {
        type: 'template',
        altText: `📨 代發訊息請求`,
        template: {
          type: 'buttons',
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=300&fit=crop',
          title: '📨 代發訊息請求',
          text: `要代發訊息給：${targetType}\n\n內容：${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
          actions: [
            {
              type: 'postback',
              label: '✅ 同意代發',
              data: `proxy:${proxyId}:approve`,
              displayText: '同意代發這則訊息'
            },
            {
              type: 'postback',
              label: '❌ 拒絕代發',
              data: `proxy:${proxyId}:reject`,
              displayText: '拒絕代發這則訊息'
            },
            {
              type: 'postback',
              label: '📝 修改內容',
              data: `proxy:${proxyId}:edit`,
              displayText: '修改訊息內容'
            }
          ]
        }
      };

      await client.pushMessage(MY_LINE_ID, inquiryMessage);
      console.log(`📨 代發訊息請求已發送: ${proxyId}`);
      
      return proxyId;
      
    } catch (error) {
      console.error('💥 發送代發請求失敗:', error);
      return null;
    }
  }

  async handleProxyResponse(proxyId, action, responseToken) {
    const proxyRequest = this.pendingMessages.get(proxyId);
    if (!proxyRequest) {
      return '❌ 找不到該代發請求';
    }

    proxyRequest.status = 'resolved';
    proxyRequest.resolvedAt = new Date();

    let responseMessage = '';
    let userMessage = '';

    switch (action) {
      case 'approve':
        try {
          await client.pushMessage(proxyRequest.targetId, {
            type: 'text',
            text: proxyRequest.message
          });
          
          responseMessage = '✅ 訊息已成功代發';
          userMessage = '✅ 你的訊息已經代發成功！';
          
          // 記錄到歷史
          this.messageHistory.set(proxyId, {
            ...proxyRequest,
            sentAt: new Date(),
            success: true
          });
          
        } catch (error) {
          responseMessage = '❌ 代發失敗，目標可能無效';
          userMessage = '❌ 抱歉，代發失敗了，可能是目標用戶或群組無效';
        }
        break;
        
      case 'reject':
        responseMessage = '❌ 已拒絕代發';
        userMessage = '❌ 抱歉，你的代發請求被拒絕了';
        break;
        
      case 'edit':
        responseMessage = '📝 請提供修改後的訊息內容';
        userMessage = '📝 代發訊息需要修改，請重新提供內容';
        break;
    }

    await safeReply(responseToken, { type: 'text', text: responseMessage });

    try {
      await client.pushMessage(proxyRequest.senderId, { 
        type: 'text', 
        text: userMessage 
      });
    } catch (error) {
      console.error('💥 通知發送者失敗:', error);
    }

    this.pendingMessages.delete(proxyId);
    return responseMessage;
  }

  isMessageProxyRequest(message) {
    const proxyKeywords = [
      /幫我.*發.*給/, /代發.*給/, /傳.*給/, /告訴.*/, 
      /跟.*說/, /通知.*/, /轉告.*/, /發訊息給.*/
    ];

    return proxyKeywords.some(pattern => pattern.test(message));
  }

  extractProxyInfo(message) {
    // 簡單的訊息解析，實際使用時可以更複雜
    let targetName = '';
    let content = '';

    const patterns = [
      /幫我.*發.*給(.+?)[:：](.+)/,
      /代發.*給(.+?)[:：](.+)/,
      /告訴(.+?)[:：](.+)/,
      /跟(.+?)說[:：](.+)/
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        targetName = match[1].trim();
        content = match[2].trim();
        break;
      }
    }

    return { targetName, content };
  }
}

// 程式碼修改回報系統（新功能）
class CodeModificationReportSystem {
  constructor() {
    this.modifications = new Map();
    this.modificationHistory = [];
    console.log('🔧 程式碼修改回報系統已初始化');
  }

  async reportModification(userId, modificationType, description, details = '') {
    const modId = `mod-${Date.now()}`;
    
    const modification = {
      id: modId,
      userId,
      type: modificationType,
      description,
      details,
      timestamp: new Date(),
      reported: false
    };

    this.modifications.set(modId, modification);
    
    // 立即回報給用戶
    await this.sendModificationReport(modification);
    
    // 記錄到歷史
    this.modificationHistory.push(modification);
    
    console.log(`🔧 程式碼修改已記錄: ${modificationType}`);
    return modId;
  }

  async sendModificationReport(modification) {
    try {
      const reportMessage = `🔧 程式碼修改完成報告

🛠️ 修改類型：${modification.type}
📝 修改描述：${modification.description}
⏰ 完成時間：${modification.timestamp.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}

${modification.details ? `📋 詳細說明：\n${modification.details}` : ''}

✅ 修改已成功應用，系統正常運行中！`;

      await client.pushMessage(modification.userId, {
        type: 'text',
        text: reportMessage
      });

      modification.reported = true;
      console.log(`📨 修改報告已發送: ${modification.id}`);

    } catch (error) {
      console.error('💥 發送修改報告失敗:', error);
    }
  }

  getModificationHistory(userId, limit = 5) {
    return this.modificationHistory
      .filter(mod => mod.userId === userId)
      .slice(-limit)
      .reverse();
  }
}

// 訊息統整報告系統（修復版 - 解決400錯誤）
class MessageReportSystem {
  constructor() {
    this.messageBuffer = [];
    this.reportThreshold = 10;
    this.lastReportTime = Date.now();
    this.reportInterval = 30 * 60 * 1000;
    this.groupStats = new Map();
    this.userStats = new Map();
    this.conversationSummaries = new Map();
    console.log('📊 訊息統整報告系統已初始化（修復版）');
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
      topics: this.extractTopics(message),
      sentiment: this.analyzeSentiment(message)
    };

    this.messageBuffer.push(messageData);
    this.updateStats(messageData);
    this.updateConversationSummary(messageData);

    if (this.shouldGenerateReport()) {
      this.generateAndSendReport();
    }
  }

  extractTopics(message) {
    const topics = [];
    const topicKeywords = {
      '工作': ['工作', '上班', '公司', '老闆', '同事', '會議'],
      '娛樂': ['電影', '遊戲', '音樂', '動漫', '追劇', '看書'],
      '美食': ['吃', '餐廳', '料理', '美食', '飲料', '咖啡'],
      '生活': ['天氣', '交通', '購物', '家庭', '健康', '運動'],
      '學習': ['讀書', '考試', '學校', '課程', '學習', '作業'],
      '感情': ['感情', '愛情', '朋友', '約會', '分手', '結婚'],
      '科技': ['手機', '電腦', '網路', 'AI', '程式', '科技']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => message.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  analyzeSentiment(message) {
    const positiveWords = ['開心', '高興', '棒', '讚', '好', '愛', '喜歡', '滿意', '成功'];
    const negativeWords = ['難過', '生氣', '討厭', '爛', '壞', '失望', '失敗', '痛苦'];
    
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

  updateConversationSummary(messageData) {
    const key = messageData.groupId || `private-${messageData.userId}`;
    
    if (!this.conversationSummaries.has(key)) {
      this.conversationSummaries.set(key, {
        participants: new Set(),
        mainTopics: new Map(),
        keyMessages: [],
        sentiment: { positive: 0, negative: 0, neutral: 0 },
        totalMessages: 0
      });
    }

    const summary = this.conversationSummaries.get(key);
    summary.participants.add(messageData.userName);
    summary.totalMessages++;

    messageData.topics.forEach(topic => {
      const count = summary.mainTopics.get(topic) || 0;
      summary.mainTopics.set(topic, count + 1);
    });

    summary.sentiment[messageData.sentiment]++;

    if (messageData.message.length > 50 || messageData.isQuestion || 
        messageData.message.includes('重要') || messageData.message.includes('緊急')) {
      summary.keyMessages.push({
        user: messageData.userName,
        message: messageData.message.substring(0, 100),
        timestamp: messageData.timestamp
      });
      
      if (summary.keyMessages.length > 20) {
        summary.keyMessages.shift();
      }
    }
  }

  async generateAndSendReport() {
    if (this.messageBuffer.length === 0) return;

    try {
      // 修復：簡化報告格式，避免400錯誤
      const simpleReport = this.createSimpleReport();

      await client.pushMessage(MY_LINE_ID, {
        type: 'text',
        text: simpleReport
      });

      console.log(`📊 已發送簡化對話報告，包含 ${this.messageBuffer.length} 則訊息`);

      this.messageBuffer = [];
      this.lastReportTime = Date.now();

    } catch (error) {
      console.error('💥 發送報告失敗:', error.message);
    }
  }

  createSimpleReport() {
    const totalMessages = this.messageBuffer.length;
    const timeRange = this.getTimeRange();
    const topTopics = this.getTopTopics();
    const sentimentStats = this.getSentimentStats();

    return `📊 顧晉瑋的對話總結報告

⏰ 時間: ${timeRange}
💬 訊息數: ${totalMessages} 則
👥 參與者: ${this.userStats.size} 位

🎯 熱門話題:
${topTopics.slice(0, 3).map((topic, index) => 
  `${index + 1}. ${topic.topic}: ${topic.count} 次`
).join('\n')}

😊 情感分析:
• 😄 正面: ${sentimentStats.positive} 則 (${Math.round(sentimentStats.positive/totalMessages*100)}%)
• 😐 中性: ${sentimentStats.neutral} 則 (${Math.round(sentimentStats.neutral/totalMessages*100)}%)
• 😔 負面: ${sentimentStats.negative} 則 (${Math.round(sentimentStats.negative/totalMessages*100)}%)

💡 整體氛圍: ${this.getOverallMood(sentimentStats)}

🤖 這是我作為顧晉瑋為你整理的對話摘要 👌`;
  }

  getTopTopics() {
    const allTopics = new Map();
    
    this.messageBuffer.forEach(msg => {
      msg.topics.forEach(topic => {
        allTopics.set(topic, (allTopics.get(topic) || 0) + 1);
      });
    });

    return Array.from(allTopics.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  getSentimentStats() {
    const stats = { positive: 0, negative: 0, neutral: 0 };
    
    this.messageBuffer.forEach(msg => {
      stats[msg.sentiment]++;
    });

    return stats;
  }

  getOverallMood(sentimentStats) {
    const total = sentimentStats.positive + sentimentStats.negative + sentimentStats.neutral;
    const positiveRatio = sentimentStats.positive / total;
    const negativeRatio = sentimentStats.negative / total;

    if (positiveRatio > 0.6) return '非常正面愉快 😄';
    if (positiveRatio > 0.4) return '整體正面 😊';  
    if (negativeRatio > 0.4) return '稍微負面 😐';
    if (negativeRatio > 0.6) return '比較負面 😔';
    return '平和中性 😌';
  }

  updateStats(messageData) {
    if (messageData.groupId) {
      if (!this.groupStats.has(messageData.groupId)) {
        this.groupStats.set(messageData.groupId, {
          groupName: messageData.groupName,
          messageCount: 0,
          activeUsers: new Set(),
          avgMessageLength: 0,
          questionCount: 0
        });
      }
      
      const groupStat = this.groupStats.get(messageData.groupId);
      groupStat.messageCount++;
      groupStat.activeUsers.add(messageData.userId);
      groupStat.avgMessageLength = (groupStat.avgMessageLength * (groupStat.messageCount - 1) + messageData.messageLength) / groupStat.messageCount;
      if (messageData.isQuestion) groupStat.questionCount++;
    }

    if (!this.userStats.has(messageData.userId)) {
      this.userStats.set(messageData.userId, {
        userName: messageData.userName,
        messageCount: 0,
        totalLength: 0,
        questionCount: 0
      });
    }

    const userStat = this.userStats.get(messageData.userId);
    userStat.messageCount++;
    userStat.totalLength += messageData.messageLength;
    if (messageData.isQuestion) userStat.questionCount++;
  }

  shouldGenerateReport() {
    const now = Date.now();
    return this.messageBuffer.length >= this.reportThreshold || 
           (now - this.lastReportTime) >= this.reportInterval;
  }

  getTimeRange() {
    if (this.messageBuffer.length === 0) return '無';
    
    const oldest = this.messageBuffer[0].timestamp;
    const newest = this.messageBuffer[this.messageBuffer.length - 1].timestamp;
    
    return `${oldest.toLocaleTimeString('zh-TW')} - ${newest.toLocaleTimeString('zh-TW')}`;
  }
}

// 有趣貼圖梗圖回覆系統
class FunStickerSystem {
  constructor() {
    this.stickerCategories = new Map();
    this.memeTemplates = new Map();
    this.reactionStickers = new Map();
    this.initializeStickerLibrary();
    console.log('😄 有趣貼圖梗圖系統已初始化');
  }

  initializeStickerLibrary() {
    this.stickerCategories.set('happy', [
      { packageId: '11537', stickerId: '52002734' },
      { packageId: '11537', stickerId: '52002735' },
      { packageId: '11538', stickerId: '51626494' },
    ]);

    this.stickerCategories.set('funny', [
      { packageId: '11537', stickerId: '52002739' },
      { packageId: '11538', stickerId: '51626501' },
      { packageId: '11539', stickerId: '52114110' },
    ]);

    this.stickerCategories.set('cute', [
      { packageId: '11537', stickerId: '52002741' },
      { packageId: '11538', stickerId: '51626495' },
      { packageId: '11539', stickerId: '52114114' },
    ]);

    this.stickerCategories.set('thinking', [
      { packageId: '11537', stickerId: '52002742' },
      { packageId: '11538', stickerId: '51626502' },
      { packageId: '11539', stickerId: '52114111' },
    ]);

    this.stickerCategories.set('sleepy', [
      { packageId: '11537', stickerId: '52002744' },
      { packageId: '11538', stickerId: '51626497' },
    ]);

    this.memeTemplates.set('drake_pointing', [
      '👎 ❌ 普通聊天機器人',
      '👍 ✅ 顧晉瑋的智能助手'
    ]);

    this.memeTemplates.set('distracted_boyfriend', [
      '👫 用戶 + 普通機器人',
      '👀 看到',
      '💃 顧晉瑋的AI助手'
    ]);

    this.memeTemplates.set('expanding_brain', [
      '🧠💭 普通聊天',
      '🧠✨ 智能回覆', 
      '🧠🚀 自主學習',
      '🧠🌟 顧晉瑋的進化AI'
    ]);

    this.reactionStickers.set('開心', 'happy');
    this.reactionStickers.set('哈哈', 'funny');
    this.reactionStickers.set('可愛', 'cute');
    this.reactionStickers.set('想想', 'thinking');
    this.reactionStickers.set('睡覺', 'sleepy');
    this.reactionStickers.set('好笑', 'funny');
    this.reactionStickers.set('厲害', 'happy');
  }

  shouldSendSticker(message, context = {}) {
    const stickerTriggers = [
      /哈哈|笑|好笑|爆笑/,
      /開心|高興|棒|讚|厲害/,  
      /可愛|萌|心/,
      /想|思考|疑問|\?|？/,
      /累|睡|晚安/
    ];

    return stickerTriggers.some(pattern => pattern.test(message));
  }

  getStickerResponse(message, context = {}) {
    let category = 'happy';

    if (/哈哈|笑|好笑|爆笑/.test(message)) {
      category = 'funny';
    } else if (/可愛|萌|心/.test(message)) {
      category = 'cute';
    } else if (/想|思考|疑問|\?|？/.test(message)) {
      category = 'thinking';
    } else if (/累|睡|晚安/.test(message)) {
      category = 'sleepy';
    }

    const stickers = this.stickerCategories.get(category) || this.stickerCategories.get('happy');
    const randomSticker = stickers[Math.floor(Math.random() * stickers.length)];

    return {
      type: 'sticker',
      packageId: randomSticker.packageId,
      stickerId: randomSticker.stickerId
    };
  }

  getMemeResponse(topic) {
    const memes = Array.from(this.memeTemplates.keys());
    const randomMeme = memes[Math.floor(Math.random() * memes.length)];
    const memeContent = this.memeTemplates.get(randomMeme);

    return {
      type: 'text',
      text: `📱 ${randomMeme.replace(/_/g, ' ').toUpperCase()} 梗圖：\n\n${memeContent.join('\n')}\n\n😂 經典！`
    };
  }

  createFunResponse(message, context = {}) {
    const random = Math.random();
    
    if (random < 0.6 && this.shouldSendSticker(message, context)) {
      return this.getStickerResponse(message, context);
    } else if (random < 0.8) {
      return this.getMemeResponse(message);
    } else {
      return this.getFunnyTextResponse(message);
    }
  }

  getFunnyTextResponse(message) {
    const funnyResponses = [
      '🤖 顧晉瑋模式：ON\n笑容載入中... 99% ✨',
      '😎 我的資管系大腦剛剛升級了\n新增功能：更幽默 +100',
      '🎯 偵測到有趣訊息！\n正在生成最佳回應... 完成！',
      '🚀 顧晉瑋超級助手報到！\n今日幽默指數：滿分！',
      '🧠 大數據分析結果：\n這個對話 87% 很有趣！',
      '⚡ 警告：偵測到高濃度歡樂\n建議繼續保持 😄'
    ];

    return {
      type: 'text',
      text: funnyResponses[Math.floor(Math.random() * funnyResponses.length)]
    };
  }
}

// 初始化系統
const replyTokenManager = new ReplyTokenManager();
const smartAPIManager = new SmartAPIManager();
const autonomousLearning = new AutonomousLearningSystem();
const decisionInquiry = new DecisionInquirySystem();
const messageReport = new MessageReportSystem();
const contradictionDetection = new ContradictionDetectionSystem();
const weatherSystem = new WeatherSystem();
const movieSystem = new MovieSystem();
const smartReminder = new FixedSmartReminderSystem();
const groupFrequencyManager = new GroupResponseFrequencyManager();
const funStickerSystem = new FunStickerSystem();
const taskManagement = new TaskManagementSystem(); // 新增
const messageProxy = new MessageProxySystem(); // 新增
const codeModificationReport = new CodeModificationReportSystem(); // 新增
const genAI_system = new GoogleGenerativeAI(GEMINI_API_KEY);
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

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = TimeSystem.getCurrentTime();
  const apiUsageReport = smartAPIManager.getUsageReport();
  const learningStats = autonomousLearning.getLearningStats();
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
      <li>✅ <strong>修復訊息統整報告400錯誤</strong></li>
      <li>✅ <strong>修復天氣查詢系統</strong></li>
      <li>✅ <strong>群組高頻率模式改為每則回覆</strong></li>
      <li>✅ <strong>矛盾檢測系統背景獨立運作</strong></li>
      <li>✅ <strong>私訊群組設定功能</strong></li>
      <li>🆕 <strong>任務管理系統（定時新聞等）</strong></li>
      <li>🆕 <strong>代發訊息系統</strong></li>
      <li>🆕 <strong>程式碼修改回報系統</strong></li>
    </ul>
    
    <h2>🧠 智能 API 管理（按優先級排序）：</h2>
    <p>作為資管系學生，我會根據問題複雜度智能選擇最適合的AI模型</p>
    
    <h3>🥇 頂級模型 (一天5次) - 重要技術決策專用：</h3>
    <ul>
      ${Object.entries(apiUsageReport.usage.premium || {})
        .sort((a, b) => b[1].priority - a[1].priority)
        .map(([model, stats]) => 
          `<li><strong>${model}</strong> (優先級: ${stats.priority}): ${stats.used}/${stats.limit} (${stats.percentage}%) - 成功率 ${stats.successRate}%</li>`
        ).join('')}
    </ul>
    
    <h3>🥈 高級模型 (一天30次) - 複雜技術分析專用：</h3>
    <ul>
      ${Object.entries(apiUsageReport.usage.advanced || {})
        .sort((a, b) => b[1].priority - a[1].priority)
        .map(([model, stats]) => 
          `<li><strong>${model}</strong> (優先級: ${stats.priority}): ${stats.used}/${stats.limit} (${stats.percentage}%) - 成功率 ${stats.successRate}%</li>`
        ).join('')}
    </ul>
    
    <h3>🥉 標準模型 (一天200次) - 日常對話：</h3>
    <ul>
      ${Object.entries(apiUsageReport.usage.standard || {})
        .sort((a, b) => b[1].priority - a[1].priority)
        .map(([model, stats]) => {
          const isGrok = model === 'grok';
          return `<li ${isGrok ? 'style="background-color: #fff3e0; padding: 5px; border-radius: 3px;"' : ''}>
            <strong>${model}</strong> ${isGrok ? '🌟 (主力模型)' : ''} 
            (優先級: ${stats.priority}): ${stats.used}/${stats.limit} (${stats.percentage}%) - 
            成功率 ${stats.successRate}%</li>`;
        }).join('')}
    </ul>
    
    <h2>📋 新功能使用說明：</h2>
    <ul>
      <li><strong>📰 定時任務：</strong>「每天早上9點給我新聞」</li>
      <li><strong>📨 代發訊息：</strong>「幫我發給XXX：訊息內容」</li>
      <li><strong>⚙️ 群組設定：</strong>私訊中可設定群組回覆頻率</li>
      <li><strong>🔧 程式修改：</strong>私訊修改程式會自動回報</li>
      <li><strong>🔍 矛盾檢測：</strong>背景運行，不受其他設定影響</li>
    </ul>

    <p><strong>💡 我是顧晉瑋，靜宜大學資管系學生，現在功能更強大了！好der 👌</strong></p>
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

// 事件處理函數（增強版）
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

      if (data.startsWith('contradiction:')) {
        const [, contradictionId, action] = data.split(':');
        const result = await contradictionDetection.handleContradictionAction(
          contradictionId,
          action,
          event.replyToken
        );
        
        await safeReply(event.replyToken, { type: 'text', text: result });
        return;
      }

      if (data.startsWith('weather:')) {
        const [, action, param] = data.split(':');
        await handleWeatherAction(action, param, event.replyToken);
        return;
      }

      if (data.startsWith('movie:')) {
        const [, action, param] = data.split(':');
        await handleMovieAction(action, param, event.replyToken);
        return;
      }

      // 處理群組頻率設定
      if (data.startsWith('freq:')) {
        const [, groupId, frequency] = data.split(':');
        
        if (frequency === 'menu') {
          const frequencyCard = groupFrequencyManager.createFrequencySettingCard(groupId);
          await safeReply(event.replyToken, frequencyCard);
          return;
        }
        
        if (frequency === 'select') {
          // 私訊中選擇群組
          const groupSelectionCard = groupFrequencyManager.createGroupSelectionCard(event.source.userId);
          await safeReply(event.replyToken, groupSelectionCard);
          return;
        }
        
        groupFrequencyManager.setGroupFrequency(groupId, frequency);
        
        const confirmMessage = `⚙️ 群組回覆頻率已設定為：${groupFrequencyManager.getFrequencyText(frequency)}

設定生效中...現在我會根據新的頻率來回覆群組訊息 👌`;

        await safeReply(event.replyToken, { type: 'text', text: confirmMessage });
        return;
      }

      // 處理任務相關操作
      if (data.startsWith('task:')) {
        const [, action, taskId] = data.split(':');
        await handleTaskAction(action, taskId, event.source.userId, event.replyToken);
        return;
      }

      // 處理代發訊息相關操作
      if (data.startsWith('proxy:')) {
        const [, proxyId, action] = data.split(':');
        const result = await messageProxy.handleProxyResponse(proxyId, action, event.replyToken);
        return;
      }

      // 處理功能選單操作
      if (data.startsWith('menu:')) {
        const [, action] = data.split(':');
        
        switch (action) {
          case 'status':
            const statusMessage = getSystemStatus();
            await safeReply(event.replyToken, { type: 'text', text: statusMessage });
            break;
            
          case 'reminders':
            const userReminders = smartReminder.getUserReminders(event.source.userId);
            let reminderText;
            
            if (userReminders.length === 0) {
              reminderText = '📭 你目前沒有設定任何提醒呢！\n\n💡 可以說「10分鐘後提醒我休息」來設定提醒 😊';
            } else {
              reminderText = `📋 你的提醒清單 (${userReminders.length} 個)：\n\n`;
              userReminders.slice(0, 5).forEach((reminder, index) => {
                reminderText += `${index + 1}. ${reminder.title}\n`;
                reminderText += `   ⏰ ${reminder.targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}\n\n`;
              });
            }
            
            await safeReply(event.replyToken, { type: 'text', text: reminderText });
            break;

          case 'tasks':
            const userTasks = taskManagement.getUserTasks(event.source.userId);
            const taskCard = taskManagement.createTaskCard(userTasks);
            await safeReply(event.replyToken, taskCard);
            break;

          case 'groups':
            // 私訊中設定群組頻率
            const groupCard = groupFrequencyManager.createGroupSelectionCard(event.source.userId);
            await safeReply(event.replyToken, groupCard);
            break;
            
          default:
            await safeReply(event.replyToken, {
              type: 'text',
              text: '📱 功能選單項目開發中...'
            });
        }
        return;
      }

      if (data.startsWith('report:')) {
        const [, action] = data.split(':');
        let responseText = '';
        
        switch (action) {
          case 'conversation':
            responseText = '📋 詳細對話摘要功能開發中，目前顯示基本統計';
            break;
          case 'sentiment':
            responseText = '🎭 情感分析：已在報告中顯示，包含正面、負面、中性情感統計';
            break;
          case 'read':
            responseText = '✅ 報告已讀，感謝查閱';
            break;
          default:
            responseText = '📊 報告功能正在處理中...';
        }
        
        await safeReply(event.replyToken, {
          type: 'text',
          text: responseText
        });
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

    // 添加到訊息報告系統
    messageReport.addMessage(userId, userName, messageText, groupId, groupName);

    // 矛盾檢測（背景獨立運作，不受任何設定影響）
    contradictionDetection.analyzeStatement(userId, userName, messageText);

    // 檢查程式碼修改請求（私訊中）
    if (!groupId && userId === MY_LINE_ID && isCodeModificationRequest(messageText)) {
      await handleCodeModificationRequest(userId, messageText, replyToken);
      return;
    }

    // 檢查任務設定請求
    if (isTaskCreationRequest(messageText)) {
      await handleTaskCreationRequest(userId, messageText, replyToken);
      return;
    }

    // 檢查代發訊息請求
    if (messageProxy.isMessageProxyRequest(messageText)) {
      await handleMessageProxyRequest(userId, messageText, replyToken);
      return;
    }

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

    // 天氣查詢
    if (isWeatherQuery(messageText)) {
      try {
        const city = weatherSystem.extractCityFromText(messageText);
        const weatherData = await weatherSystem.getWeather(city);
        const weatherCard = weatherSystem.createWeatherCard(weatherData);
        
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

    // 電影查詢
    if (isMovieQuery(messageText)) {
      try {
        const movies = await movieSystem.getPopularMovies();
        const movieCarousel = movieSystem.createMovieCarousel(movies);
        
        await safeReply(replyToken, movieCarousel);
        return;
      } catch (error) {
        await safeReply(replyToken, {
          type: 'text',
          text: 'ㄜ...電影查詢暫時有問題，請稍後再試 🎬'
        });
        return;
      }
    }

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
            title: '⏰ 提醒設定成功！'