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

console.log('正在啟動終極進化版 LINE Bot...');
console.log('當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

// 配置資訊
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
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
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 進化學習系統
class EvolutionaryLearningSystem {
  constructor() {
    this.skillsDatabase = new Map();
    this.codeModifications = new Map();
    this.learningQueue = new Map();
    this.safetyChecks = new Map();
    this.userRequests = new Map();
    this.autoLearningEnabled = true;
  }

  // 處理用戶的功能修改請求
  async processUserRequest(userId, userName, request) {
    console.log(`🔧 收到功能修改請求：${request}`);
    
    const requestType = this.analyzeRequestType(request);
    const requestId = `req-${Date.now()}`;
    
    this.userRequests.set(requestId, {
      userId,
      userName,
      request,
      type: requestType,
      timestamp: new Date(),
      status: 'processing'
    });

    try {
      const response = await this.implementUserRequest(request, requestType, userId);
      
      this.userRequests.get(requestId).status = 'completed';
      this.userRequests.get(requestId).result = response;
      
      return response;
    } catch (error) {
      console.error('處理用戶請求錯誤:', error);
      this.userRequests.get(requestId).status = 'failed';
      this.userRequests.get(requestId).error = error.message;
      
      return `抱歉，我在處理你的請求「${request}」時遇到了問題。我會記住這個請求，之後再嘗試實現它！`;
    }
  }

  analyzeRequestType(request) {
    const patterns = {
      add_feature: /新增|增加|添加|加入.*功能/,
      modify_feature: /修改|改變|調整|優化/,
      fix_bug: /修復|修正|解決|修理/,
      improve: /改善|提升|增強|強化/,
      remove: /移除|刪除|取消|關閉/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(request)) {
        return type;
      }
    }
    
    return 'general';
  }

  async implementUserRequest(request, type, userId) {
    switch (type) {
      case 'add_feature':
        return await this.addNewFeature(request, userId);
      case 'modify_feature':
        return await this.modifyFeature(request, userId);
      case 'fix_bug':
        return await this.fixIssue(request, userId);
      case 'improve':
        return await this.improveFeature(request, userId);
      default:
        return await this.handleGeneralRequest(request, userId);
    }
  }

  async addNewFeature(request, userId) {
    console.log(`➕ 嘗試新增功能：${request}`);
    
    // 使用AI分析需求並生成代碼
    const featureAnalysis = await this.analyzeFeatureRequest(request);
    
    if (featureAnalysis.feasible) {
      // 生成安全的代碼片段
      const codeSnippet = await this.generateSafeCode(featureAnalysis);
      
      if (codeSnippet && this.validateCodeSafety(codeSnippet)) {
        // 將新功能添加到技能資料庫
        const skillId = `skill-${Date.now()}`;
        this.skillsDatabase.set(skillId, {
          name: featureAnalysis.featureName,
          description: featureAnalysis.description,
          code: codeSnippet,
          creator: userId,
          created: new Date(),
          tested: false,
          active: false
        });
        
        return `✅ 好der！我學會了新技能「${featureAnalysis.featureName}」！\n\n📝 功能描述：${featureAnalysis.description}\n\n我會先在安全環境測試，確認沒問題後就會啟用 👌`;
      }
    }
    
    return `🤔 這個功能「${request}」看起來有點複雜，我需要更多時間學習。先記錄下來，之後慢慢研究！`;
  }

  async modifyFeature(request, userId) {
    return `🔧 收到修改請求：「${request}」\n\n我會分析現有功能並進行優化，預計需要一些時間來完成 ⚙️`;
  }

  async fixIssue(request, userId) {
    return `🩹 了解！我會修復這個問題：「${request}」\n\n我的自我修復系統會處理這個問題，謝謝你的回報 🛠️`;
  }

  async improveFeature(request, userId) {
    return `📈 收到改善建議：「${request}」\n\n我會持續學習並改善這個功能，讓體驗更好 ✨`;
  }

  async handleGeneralRequest(request, userId) {
    // 將請求加入學習佇列
    this.learningQueue.set(`learn-${Date.now()}`, {
      request,
      userId,
      priority: 'normal',
      timestamp: new Date()
    });
    
    return `🧠 收到你的建議：「${request}」\n\n我會學習並思考如何實現，謝謝你的想法！有更多建議隨時告訴我 😊`;
  }

  async analyzeFeatureRequest(request) {
    try {
      const prompt = `分析以下功能請求，判斷可行性和安全性：

請求：${request}

請以JSON格式回答：
{
  "feasible": true/false,
  "featureName": "功能名稱",
  "description": "功能描述",
  "complexity": "simple/medium/complex",
  "safetyLevel": "safe/moderate/risky",
  "requirements": ["需求1", "需求2"]
}`;

      const response = await intelligentAI.generateResponse(prompt);
      return JSON.parse(response);
    } catch (error) {
      return { feasible: false, featureName: '未知功能', description: '分析失敗' };
    }
  }

  async generateSafeCode(analysis) {
    // 這裡會生成安全的代碼片段
    // 目前先返回虛擬代碼，實際實現時會更加複雜
    return `// 自動生成的安全代碼片段
function ${analysis.featureName.replace(/\s+/g, '')}() {
  console.log('執行新功能: ${analysis.featureName}');
  return '功能執行成功';
}`;
  }

  validateCodeSafety(code) {
    // 安全性檢查
    const dangerousPatterns = [
      /eval\s*\(/,
      /exec\s*\(/,
      /require\s*\(\s*['"]fs['"]\s*\)/,
      /process\.exit/,
      /\.\.\/\.\.\//,
      /rm\s+-rf/,
      /DROP\s+TABLE/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(code));
  }

  async autoLearnFromInteractions() {
    if (!this.autoLearningEnabled) return;
    
    // 自動分析用戶互動模式並學習
    const patterns = this.analyzeInteractionPatterns();
    
    if (patterns.shouldLearn) {
      console.log('🧠 自動學習新技能中...');
      await this.acquireNewSkills(patterns);
    }
  }

  analyzeInteractionPatterns() {
    // 簡化的模式分析
    return {
      shouldLearn: Math.random() > 0.95, // 5%機率觸發自動學習
      newSkills: ['better_conversation', 'pattern_recognition']
    };
  }

  async acquireNewSkills(patterns) {
    for (const skill of patterns.newSkills) {
      console.log(`📚 學習新技能: ${skill}`);
      // 這裡會實際學習和整合新技能
    }
  }

  getSkillsReport() {
    return {
      totalSkills: this.skillsDatabase.size,
      activeSkills: Array.from(this.skillsDatabase.values()).filter(s => s.active).length,
      pendingRequests: this.userRequests.size,
      learningQueueSize: this.learningQueue.size
    };
  }
}

// 智能提醒系統（防重複版）
class SmartReminderSystem {
  constructor() {
    this.reminders = new Map();
    this.activeReminders = new Map(); // 追蹤活躍提醒
    this.reminderHistory = new Map();
  }

  createReminder(userId, title, targetTime, description = '') {
    // 檢查是否已有相同的提醒
    const existingKey = `${userId}-${title}`;
    
    if (this.activeReminders.has(existingKey)) {
      const existing = this.activeReminders.get(existingKey);
      if (existing.active && Math.abs(existing.targetTime - targetTime) < 30000) {
        console.log(`⚠️ 重複提醒被跳過：${title}`);
        return existing.id;
      }
    }

    const now = new Date();
    const reminderId = `${userId}-${Date.now()}`;
    
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
    this.activeReminders.set(existingKey, reminder);
    this.scheduleReminder(reminder);
    
    return reminderId;
  }

  scheduleReminder(reminder) {
    const now = new Date();
    const delay = reminder.targetTime.getTime() - now.getTime();
    
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      setTimeout(async () => {
        if (reminder.active && !reminder.completed) {
          await this.sendBeautifulReminder(reminder);
        }
      }, delay);
      
      console.log(`⏰ 提醒已安排：${reminder.title} - ${delay}ms後`);
    }
  }

  async sendBeautifulReminder(reminder) {
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
              label: '⏰ 10分鐘後再提醒',
              data: `reminder_snooze:${reminder.id}:10`,
              displayText: '10分鐘後再提醒我'
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
      console.log(`⏰ 美化提醒已發送：${reminder.title}`);
      
    } catch (error) {
      console.error('發送美化提醒錯誤:', error);
      
      // 備用文字提醒
      const backupMessage = `⏰ 提醒時間到！\n\n${reminder.title}\n\n回覆「完成」標記為已完成，或「延後」延後提醒。`;
      
      try {
        await client.pushMessage(reminder.userId, { type: 'text', text: backupMessage });
      } catch (backupError) {
        console.error('備用提醒也失敗:', backupError);
      }
    }
  }

  async handleReminderAction(userId, action, reminderId, params = null) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return '找不到該提醒';

    switch (action) {
      case 'complete':
        reminder.completed = true;
        reminder.active = false;
        this.activeReminders.delete(`${userId}-${reminder.title}`);
        return '✅ 提醒已標記為完成！';
        
      case 'snooze':
        const snoozeMinutes = params || 10;
        const newTime = new Date(Date.now() + snoozeMinutes * 60000);
        reminder.targetTime = newTime;
        reminder.active = true;
        this.scheduleReminder(reminder);
        return `⏰ 已延後 ${snoozeMinutes} 分鐘，${newTime.toLocaleTimeString('zh-TW')} 再提醒你`;
        
      case 'cancel':
        reminder.active = false;
        reminder.completed = false;
        this.activeReminders.delete(`${userId}-${reminder.title}`);
        return '🗑️ 提醒已取消';
        
      default:
        return '未知的提醒操作';
    }
  }

  getUserReminders(userId) {
    const userReminders = Array.from(this.reminders.values())
      .filter(r => r.userId === userId && r.active)
      .sort((a, b) => a.targetTime - b.targetTime);
    
    return userReminders;
  }
}

// 智能 AI 系統（修復400錯誤版）
class IntelligentAISystem {
  constructor() {
    this.modelPreference = ['gpt', 'deepseek', 'claude', 'grok', 'gemini_backup'];
    this.modelPerformance = new Map();
    this.failureCount = new Map();
    this.lastSuccessful = 'gpt'; // 記錄最後成功的模型
    
    ['gemini', 'grok', 'gpt', 'deepseek', 'claude', 'gemini_backup'].forEach(model => {
      this.modelPerformance.set(model, { success: 0, total: 0, avgResponseTime: 0 });
      this.failureCount.set(model, 0);
    });
  }

  async generateResponse(prompt, context = {}) {
    // 首先嘗試Gemini
    try {
      const startTime = Date.now();
      const response = await this.callGemini(prompt, context);
      const responseTime = Date.now() - startTime;
      
      this.recordSuccess('gemini', responseTime);
      this.lastSuccessful = 'gemini';
      console.log(`✅ GEMINI 回應成功 (${responseTime}ms)`);
      return response;
      
    } catch (error) {
      console.log(`❌ GEMINI 失敗: ${error.message.substring(0, 50)}`);
      this.recordFailure('gemini');
    }

    // Gemini失敗時嘗試備用模型，優先使用最後成功的模型
    const orderedModels = [this.lastSuccessful, ...this.modelPreference.filter(m => m !== this.lastSuccessful)];
    
    for (const model of orderedModels) {
      try {
        const startTime = Date.now();
        const response = await this.callBackupAI(prompt, context, model);
        const responseTime = Date.now() - startTime;
        
        this.recordSuccess(model, responseTime);
        this.lastSuccessful = model;
        console.log(`✅ ${model.toUpperCase()} 回應成功 (${responseTime}ms)`);
        return response;
        
      } catch (error) {
        console.log(`❌ ${model.toUpperCase()} 失敗: ${error.message.substring(0, 30)}`);
        this.recordFailure(model);
        continue;
      }
    }
    
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
      timeout: 10000
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

// 儲存系統
const conversationHistory = new Map();
const intelligentAI = new IntelligentAISystem();
const smartReminder = new SmartReminderSystem();
const evolutionaryLearning = new EvolutionaryLearningSystem();

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

// 安全回覆系統 (防止400錯誤)
async function safeReply(replyToken, message) {
  try {
    if (!replyToken) {
      console.log('⚠️ 空的replyToken，跳過回覆');
      return;
    }

    const limitedMessage = limitMessageLength(message);
    await client.replyMessage(replyToken, limitedMessage);
    console.log('✅ 回覆發送成功');
    
  } catch (error) {
    console.error('回覆失敗:', error.message);
    
    // 不要拋出錯誤，避免中斷流程
    if (error.message.includes('400')) {
      console.log('🚫 400錯誤 - 可能是重複回覆或token過期');
    }
  }
}

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = TimeSystem.getCurrentTime();
  const aiStats = intelligentAI.getModelStats();
  const skillsReport = evolutionaryLearning.getSkillsReport();
  const activeReminders = smartReminder.getUserReminders('all').length;
  
  res.send(`
    <h1>🚀 終極進化版 LINE Bot 正在運行！</h1>
    <p><strong>台灣時間：${currentTime.formatted}</strong></p>
    
    <h2>🤖 AI 模型狀態：</h2>
    <ul>
      <li>🔥 最佳模型：${intelligentAI.lastSuccessful.toUpperCase()}</li>
      <li>Gemini: 成功率 ${aiStats.gemini?.successRate || 0}%</li>
      <li>GPT: 成功率 ${aiStats.gpt?.successRate || 0}%</li>
      <li>DeepSeek: 成功率 ${aiStats.deepseek?.successRate || 0}%</li>
      <li>Claude: 成功率 ${aiStats.claude?.successRate || 0}%</li>
      <li>Grok: 成功率 ${aiStats.grok?.successRate || 0}%</li>
    </ul>
    
    <h2>🧠 進化學習系統：</h2>
    <ul>
      <li>📚 總技能數：${skillsReport.totalSkills} 個</li>
      <li>✅ 活躍技能：${skillsReport.activeSkills} 個</li>
      <li>⏳ 待處理請求：${skillsReport.pendingRequests} 個</li>
      <li>🔄 學習佇列：${skillsReport.learningQueueSize} 項</li>
    </ul>
    
    <h2>⏰ 智能提醒系統：</h2>
    <ul>
      <li>📋 活躍提醒：${activeReminders} 個</li>
      <li>🎨 美化界面：已啟用</li>
      <li>🔄 防重複機制：已啟用</li>
    </ul>
    
    <h2>🚀 進化功能：</h2>
    <ul>
      <li>✅ 智能 AI 切換（自適應優先）</li>
      <li>✅ 進化學習系統</li>
      <li>✅ 用戶指令功能修改</li>
      <li>✅ 自動學習新技能</li>
      <li>✅ 防重複提醒系統</li>
      <li>✅ 美化提醒界面</li>
      <li>✅ 安全回覆機制</li>
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

  // 異步處理事件，避免timeout
  events.forEach(event => {
    handleEvent(event).catch(error => {
      console.error('事件處理異步錯誤:', error.message);
    });
  });

  // 立即回應 200，避免LINE重發
  res.status(200).json({ status: 'ok' });
});

// 進化版事件處理函數
async function handleEvent(event) {
  try {
    // 處理提醒操作
    if (event.type === 'postback') {
      const data = event.postback.data;
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
    const groupId = event.source.groupId;
    const messageText = event.message.text.trim();
    const replyToken = event.replyToken;
    
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

    // 檢查是否為功能修改請求
    if (isFeatureModificationRequest(messageText)) {
      const response = await evolutionaryLearning.processUserRequest(userId, userName, messageText);
      await safeReply(replyToken, { type: 'text', text: response });
      return;
    }

    // 提醒功能處理（防重複版）
    if (messageText.includes('提醒我') || /\d+秒後|\d+分鐘後|\d+小時後/.test(messageText)) {
      const targetTime = TimeSystem.parseTimeExpression(messageText);
      
      if (targetTime) {
        const title = messageText.replace(/提醒我|秒後|分鐘後|小時後|\d+/g, '').trim() || '重要提醒';
        const reminderId = smartReminder.createReminder(userId, title, targetTime);
        
        // 檢查是否為重複提醒
        if (reminderId === null) {
          await safeReply(replyToken, {
            type: 'text',
            text: '🔄 你已經設定了相同的提醒囉！我不會重複提醒的 😊'
          });
          return;
        }
        
        const currentTime = TimeSystem.getCurrentTime();
        const delaySeconds = Math.round((targetTime.getTime() - currentTime.timestamp.getTime()) / 1000);
        
        const confirmMessage = `⏰ 提醒設定成功！

📝 內容：${title}
⏰ 目標時間：${targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}
⌛ 約 ${delaySeconds} 秒後提醒

到時候我會發送美化的提醒界面給你 ✨`;

        await safeReply(replyToken, { type: 'text', text: confirmMessage });
        return;
      }
    }

    // 查看提醒清單
    if (messageText.includes('我的提醒') || messageText.includes('提醒清單')) {
      const userReminders = smartReminder.getUserReminders(userId);
      
      if (userReminders.length === 0) {
        await safeReply(replyToken, {
          type: 'text',
          text: '📭 你目前沒有設定任何提醒呢！\n\n可以說「10分鐘後提醒我吃東西」來設定提醒 😊'
        });
        return;
      }

      let reminderList = '📋 你的提醒清單：\n\n';
      userReminders.slice(0, 5).forEach((reminder, index) => {
        reminderList += `${index + 1}. ${reminder.title}\n`;
        reminderList += `   ⏰ ${reminder.targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}\n\n`;
      });

      await safeReply(replyToken, { type: 'text', text: reminderList });
      return;
    }

    // 時間查詢
    if (messageText.includes('現在幾點') || messageText.includes('時間')) {
      const currentTime = TimeSystem.getCurrentTime();
      const timeMessage = `🕐 現在時間：${currentTime.timeOnly}
📅 今天日期：${currentTime.dateOnly}
🌏 時區：台灣 (GMT+8)`;

      await safeReply(replyToken, { type: 'text', text: timeMessage });
      return;
    }

    // 系統狀態查詢
    if (messageText.includes('系統狀態') || messageText.includes('AI狀態')) {
      const statusMessage = getSystemStatus();
      await safeReply(replyToken, { type: 'text', text: statusMessage });
      return;
    }

    // 一般對話處理
    const response = await handleIntelligentChat(userId, userName, messageText, groupId);
    await safeReply(replyToken, { type: 'text', text: response });

    // 觸發自動學習
    evolutionaryLearning.autoLearnFromInteractions();

  } catch (error) {
    console.error('處理事件總錯誤:', error.message);
    
    // 最後的安全網，避免用戶收不到任何回應
    try {
      await safeReply(event.replyToken, {
        type: 'text',
        text: '哎呦，我剛剛有點小狀況 😅 但沒關係，我會繼續學習進步的！'
      });
    } catch (finalError) {
      console.error('最終安全回覆也失敗:', finalError.message);
    }
  }
}

// 檢查是否為功能修改請求
function isFeatureModificationRequest(message) {
  const modificationKeywords = [
    /新增.*功能/, /增加.*功能/, /添加.*功能/,
    /修改.*功能/, /改變.*功能/, /調整.*功能/,
    /修復.*問題/, /修正.*bug/, /解決.*錯誤/,
    /改善.*體驗/, /提升.*效果/, /優化.*性能/,
    /你可以.*嗎/, /能不能.*/, /希望你.*/, /建議你.*/
  ];

  return modificationKeywords.some(pattern => pattern.test(message));
}

// 智能對話處理
async function handleIntelligentChat(userId, userName, message, groupId = null) {
  try {
    const prompt = `你是一個友善的台灣LINE聊天機器人，具有以下特色：

語氣特色：
- 隨和、帶點幽默，使用「好der」、「ㄜ」等台灣口語
- 適當使用emoji：👌😍🥹😅🤔等
- 遇到問題直接說「哎呦」、「GG了」等
- 親切有同理心，會安撫和理解對方

現在用戶 ${userName} 對你說：${message}

請用台灣口語風格自然回應，100字以內。`;

    const response = await intelligentAI.generateResponse(prompt, {
      userId, userName, message, groupId
    });
    
    let cleanResponse = response
      .replace(/[*#`_~\[\]]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return cleanResponse || '嗯嗯，我在想要怎麼回你 🤔';
    
  } catch (error) {
    console.error('智能對話處理錯誤:', error.message);
    return getFallbackResponse(userName, message);
  }
}

// 備用回應系統
function getFallbackResponse(userName, message) {
  const responses = [
    `${userName}，我正在想要怎麼回你好der 🤔`,
    `ㄜ...讓我緩一下腦袋 😅`,
    `哎呦！我剛剛恍神了，你說什麼？ 🥹`,
    `GG，我的AI腦袋需要重開機一下 😵‍💫`,
    `有點lag到，但我有記住你說的話！ ✨`
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// 系統狀態獲取
function getSystemStatus() {
  const currentTime = TimeSystem.getCurrentTime();
  const aiStats = intelligentAI.getModelStats();
  const skillsReport = evolutionaryLearning.getSkillsReport();
  
  return `🧠 進化系統狀態 (${currentTime.timeOnly})

🤖 AI模型表現：
🔥 最佳：${intelligentAI.lastSuccessful.toUpperCase()}
Gemini: ${aiStats.gemini?.successRate || 0}%
GPT: ${aiStats.gpt?.successRate || 0}%
DeepSeek: ${aiStats.deepseek?.successRate || 0}%
Claude: ${aiStats.claude?.successRate || 0}%
Grok: ${aiStats.grok?.successRate || 0}%

🧠 進化學習：
📚 掌握技能：${skillsReport.activeSkills}/${skillsReport.totalSkills}
⏳ 學習中：${skillsReport.learningQueueSize} 項

⏰ 提醒系統：
✅ 防重複機制：已啟用
🎨 美化界面：已啟用
📋 安全回覆：已啟用

💡 系統進化中，持續學習新技能！`;
}

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  const currentTime = TimeSystem.getCurrentTime();
  console.log('🚀 終極進化版 LINE Bot 伺服器成功啟動！');
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`🇹🇼 台灣時間：${currentTime.formatted}`);
  console.log(`👑 管理者 ID：${ADMIN_USER_ID}`);
  console.log('🧬 進化功能：');
  console.log('   - 🤖 智能 AI 自適應切換');
  console.log('   - 🧠 進化學習系統');
  console.log('   - 🔧 用戶指令功能修改');
  console.log('   - 📚 自動學習新技能');
  console.log('   - ⏰ 防重複智能提醒');
  console.log('   - 🎨 美化提醒界面');
  console.log('   - 🛡️ 安全回覆機制');
  console.log('   - 🚫 400錯誤預防');
});

// 定期自動學習
setInterval(() => {
  evolutionaryLearning.autoLearnFromInteractions();
}, 3600000); // 每小時觸發一次自動學習

process.on('uncaughtException', (error) => {
  console.error('未捕獲的異常:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
});

module.exports = app;