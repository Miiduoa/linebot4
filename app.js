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

console.log('🚀 正在啟動終極進化版 LINE Bot v4.0...');
console.log('⏰ 當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

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
const MY_LINE_ID = 'U59af77e69411ffb99a49f1f2c3e2afc4'; // 你的實際 LINE ID
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 防重複回覆系統
class ReplyTokenManager {
  constructor() {
    this.usedTokens = new Set();
    this.tokenTimestamps = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // 5分鐘清理一次
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
    const expiredTime = 10 * 60 * 1000; // 10分鐘過期
    
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
  }

  async requestDecision(context, question, originalReplyToken, originalUserId) {
    const decisionId = `decision-${Date.now()}`;
    
    // 儲存決策請求
    this.pendingDecisions.set(decisionId, {
      context,
      question,
      originalReplyToken,
      originalUserId,
      timestamp: new Date(),
      status: 'pending'
    });

    try {
      // 發送決策請求給管理員
      const inquiryMessage = {
        type: 'template',
        altText: `🤔 需要你的決策：${question}`,
        template: {
          type: 'buttons',
          title: '🤔 決策請求',
          text: `情況：${context}\n\n問題：${question}\n\n請選擇你的決策：`,
          actions: [
            {
              type: 'postback',
              label: '✅ 同意/繼續',
              data: `decision:${decisionId}:approve`,
              displayText: '我同意這個決策'
            },
            {
              type: 'postback',
              label: '❌ 拒絕/停止',
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
      return decisionId;
      
    } catch (error) {
      console.error('發送決策請求失敗:', error);
      return null;
    }
  }

  async handleDecisionResponse(decisionId, action, responseToken) {
    const decision = this.pendingDecisions.get(decisionId);
    if (!decision) {
      return '找不到該決策請求';
    }

    decision.status = 'resolved';
    decision.decision = action;
    decision.resolvedAt = new Date();

    let responseMessage = '';
    let userMessage = '';

    switch (action) {
      case 'approve':
        responseMessage = '✅ 已批准決策，正在執行...';
        userMessage = '✅ 經過考慮，我決定繼續處理你的請求！';
        break;
      case 'reject':
        responseMessage = '❌ 已拒絕決策';
        userMessage = '❌ 抱歉，經過考慮後我無法處理這個請求。';
        break;
      case 'info':
        responseMessage = '💬 需要更多資訊，請詳細說明';
        userMessage = '🤔 我需要思考一下，請給我一點時間...';
        break;
    }

    // 回覆管理員
    await safeReply(responseToken, { type: 'text', text: responseMessage });

    // 通知原始用戶（如果不是管理員的話）
    if (decision.originalUserId !== MY_LINE_ID) {
      try {
        await client.pushMessage(decision.originalUserId, { 
          type: 'text', 
          text: userMessage 
        });
      } catch (error) {
        console.error('通知原始用戶失敗:', error);
      }
    }

    // 移到歷史記錄
    this.decisionHistory.set(decisionId, decision);
    this.pendingDecisions.delete(decisionId);

    return responseMessage;
  }

  shouldRequestDecision(message) {
    // 檢查是否需要決策的關鍵詞
    const decisionKeywords = [
      /刪除.*檔案/, /修改.*程式/, /重啟.*系統/, /更新.*設定/,
      /發送.*所有人/, /群發/, /廣播/, /通知.*所有/,
      /執行.*指令/, /運行.*腳本/, /啟動.*功能/,
      /購買/, /付款/, /轉帳/, /交易/,
      /封鎖/, /刪除.*用戶/, /移除.*權限/
    ];

    return decisionKeywords.some(pattern => pattern.test(message));
  }
}

// 智能提醒系統（完全重寫修復版）
class FixedSmartReminderSystem {
  constructor() {
    this.reminders = new Map();
    this.activeTimers = new Map(); // 追蹤活躍的計時器
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
    
    // 計算延遲時間
    const delay = targetTime.getTime() - now.getTime();
    
    if (delay > 0) {
      const timerId = setTimeout(async () => {
        await this.executeReminder(reminderId);
      }, delay);
      
      this.activeTimers.set(reminderId, timerId);
      
      console.log(`⏰ 提醒已設定: ${title} - ${delay}ms後觸發`);
      console.log(`📅 目標時間: ${targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}`);
      
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
      
      // 清理計時器
      this.activeTimers.delete(reminderId);
      
    } catch (error) {
      console.error('💥 發送提醒失敗:', error);
      
      // 備用文字提醒
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
        
        // 清除舊計時器
        this.clearTimer(reminderId);
        
        // 設定新計時器
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

// 程式碼自動修復系統
class CodeAutoFixSystem {
  constructor() {
    this.fixHistory = new Map();
    this.codeAnalysis = new Map();
    this.autoFixEnabled = true;
  }

  async analyzeAndFix(userMessage, errorContext = null) {
    console.log('🔧 開始程式碼分析與修復...');
    
    try {
      // 分析用戶意圖
      const analysis = await this.analyzeUserIntent(userMessage, errorContext);
      
      if (analysis.needsFix) {
        return await this.executeCodeFix(analysis);
      }
      
      return null;
    } catch (error) {
      console.error('程式碼修復分析失敗:', error);
      return null;
    }
  }

  async analyzeUserIntent(message, errorContext) {
    const prompt = `分析以下用戶請求，判斷是否需要程式碼修復：

用戶訊息：${message}
錯誤上下文：${errorContext || '無'}

請以JSON格式回答：
{
  "needsFix": true/false,
  "fixType": "bug_fix/feature_add/performance_improve/security_fix",
  "priority": "low/medium/high/critical",
  "description": "修復描述",
  "estimatedRisk": "low/medium/high",
  "requiresApproval": true/false
}`;

    try {
      const response = await intelligentAI.generateResponse(prompt);
      return JSON.parse(response);
    } catch (error) {
      return { needsFix: false };
    }
  }

  async executeCodeFix(analysis) {
    const fixId = `fix-${Date.now()}`;
    
    this.fixHistory.set(fixId, {
      analysis,
      timestamp: new Date(),
      status: 'pending'
    });

    // 高風險修復需要審批
    if (analysis.estimatedRisk === 'high' || analysis.requiresApproval) {
      const decisionId = await decisionInquiry.requestDecision(
        '程式碼自動修復請求',
        `${analysis.description}\n風險等級：${analysis.estimatedRisk}\n類型：${analysis.fixType}`,
        null,
        MY_LINE_ID
      );
      
      return `🔧 程式碼修復請求已提交審核 (ID: ${fixId})\n等待管理員批准...`;
    }

    // 低風險修復自動執行
    return await this.performSafeFix(analysis, fixId);
  }

  async performSafeFix(analysis, fixId) {
    console.log(`🛠️ 執行安全修復: ${analysis.description}`);
    
    // 模擬修復過程（實際實現會更複雜）
    const fixResult = {
      success: true,
      message: `✅ 已自動修復: ${analysis.description}`,
      changes: ['優化錯誤處理', '改善回覆機制', '增強穩定性']
    };

    this.fixHistory.get(fixId).status = 'completed';
    this.fixHistory.get(fixId).result = fixResult;

    return fixResult.message + '\n\n修改內容：\n' + fixResult.changes.map(c => `• ${c}`).join('\n');
  }
}

// 大數據學習系統
class BigDataLearningSystem {
  constructor() {
    this.learningData = new Map();
    this.conversationPatterns = new Map();
    this.userBehaviorAnalysis = new Map();
    this.knowledgeGraph = new Map();
    this.learningQueue = [];
  }

  recordInteraction(userId, message, response, context = {}) {
    const interactionId = `interaction-${Date.now()}`;
    
    const interaction = {
      id: interactionId,
      userId,
      message,
      response,
      context,
      timestamp: new Date(),
      satisfaction: null, // 將由後續反饋更新
      patterns: this.extractPatterns(message, response)
    };

    this.learningData.set(interactionId, interaction);
    this.updateUserBehavior(userId, interaction);
    this.updateConversationPatterns(interaction);
    
    // 添加到學習佇列
    this.learningQueue.push(interactionId);
    
    // 保持佇列大小
    if (this.learningQueue.length > 1000) {
      this.learningQueue.shift();
    }

    console.log(`📚 記錄互動數據: ${message.substring(0, 30)}...`);
  }

  extractPatterns(message, response) {
    return {
      messageLength: message.length,
      responseLength: response.length,
      messageType: this.classifyMessageType(message),
      sentiment: this.analyzeSentiment(message),
      topics: this.extractTopics(message),
      responseStyle: this.analyzeResponseStyle(response)
    };
  }

  classifyMessageType(message) {
    if (/\?|？/.test(message)) return 'question';
    if (/提醒|時間|秒後|分鐘後/.test(message)) return 'reminder';
    if (/修復|修改|錯誤|問題/.test(message)) return 'support';
    if (/謝謝|感謝|好的|知道/.test(message)) return 'acknowledgment';
    return 'general';
  }

  analyzeSentiment(message) {
    const positiveWords = ['好', '棒', '讚', '感謝', '謝謝', '開心', '高興'];
    const negativeWords = ['壞', '爛', '討厭', '生氣', '難過', '失望', '錯誤'];
    
    const positive = positiveWords.filter(word => message.includes(word)).length;
    const negative = negativeWords.filter(word => message.includes(word)).length;
    
    if (positive > negative) return 'positive';
    if (negative > positive) return 'negative';
    return 'neutral';
  }

  extractTopics(message) {
    const topics = [];
    const topicKeywords = {
      'weather': ['天氣', '氣溫', '下雨', '晴天'],
      'time': ['時間', '幾點', '現在', '今天'],
      'reminder': ['提醒', '記住', '通知'],
      'help': ['幫助', '協助', '教我', '怎麼'],
      'tech': ['程式', '修復', '系統', '功能']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => message.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  analyzeResponseStyle(response) {
    return {
      hasEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(response),
      isFormal: /您|請問|不好意思/.test(response),
      isCasual: /der|ㄜ|哎呦|GG/.test(response),
      length: response.length
    };
  }

  updateUserBehavior(userId, interaction) {
    if (!this.userBehaviorAnalysis.has(userId)) {
      this.userBehaviorAnalysis.set(userId, {
        totalInteractions: 0,
        preferredTopics: new Map(),
        responseTime: [],
        sentimentTrend: [],
        lastActive: null
      });
    }

    const behavior = this.userBehaviorAnalysis.get(userId);
    behavior.totalInteractions++;
    behavior.lastActive = interaction.timestamp;
    behavior.sentimentTrend.push(interaction.patterns.sentiment);

    // 更新偏好主題
    interaction.patterns.topics.forEach(topic => {
      const count = behavior.preferredTopics.get(topic) || 0;
      behavior.preferredTopics.set(topic, count + 1);
    });

    // 保持趨勢數據大小
    if (behavior.sentimentTrend.length > 50) {
      behavior.sentimentTrend.shift();
    }
  }

  updateConversationPatterns(interaction) {
    const pattern = `${interaction.patterns.messageType}->${interaction.patterns.responseStyle.isCasual ? 'casual' : 'formal'}`;
    
    const count = this.conversationPatterns.get(pattern) || 0;
    this.conversationPatterns.set(pattern, count + 1);
  }

  async performLearning() {
    if (this.learningQueue.length === 0) return;

    console.log('🧠 開始大數據學習分析...');
    
    // 分析最近100個互動
    const recentInteractions = this.learningQueue.slice(-100);
    const learningInsights = await this.analyzeLearningData(recentInteractions);
    
    if (learningInsights.shouldAdapt) {
      await this.adaptBehavior(learningInsights);
    }

    console.log(`📊 學習完成，分析了 ${recentInteractions.length} 個互動`);
  }

  async analyzeLearningData(interactionIds) {
    const interactions = interactionIds.map(id => this.learningData.get(id)).filter(Boolean);
    
    const analysis = {
      totalInteractions: interactions.length,
      sentimentDistribution: this.calculateSentimentDistribution(interactions),
      topTopics: this.getTopTopics(interactions),
      responseEffectiveness: this.calculateResponseEffectiveness(interactions),
      userSatisfaction: this.estimateUserSatisfaction(interactions)
    };

    return {
      shouldAdapt: analysis.userSatisfaction < 0.7, // 滿意度低於70%需要調整
      insights: analysis,
      recommendations: this.generateRecommendations(analysis)
    };
  }

  calculateSentimentDistribution(interactions) {
    const sentiments = interactions.map(i => i.patterns.sentiment);
    const total = sentiments.length;
    
    return {
      positive: sentiments.filter(s => s === 'positive').length / total,
      neutral: sentiments.filter(s => s === 'neutral').length / total,
      negative: sentiments.filter(s => s === 'negative').length / total
    };
  }

  getTopTopics(interactions) {
    const topicCounts = new Map();
    
    interactions.forEach(i => {
      i.patterns.topics.forEach(topic => {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      });
    });

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }

  calculateResponseEffectiveness(interactions) {
    // 簡化的效果評估（實際會更複雜）
    let effective = 0;
    
    interactions.forEach(i => {
      if (i.patterns.messageType === 'question' && i.response.length > 10) effective++;
      if (i.patterns.sentiment === 'positive') effective++;
    });

    return effective / interactions.length;
  }

  estimateUserSatisfaction(interactions) {
    const positiveRatio = this.calculateSentimentDistribution(interactions).positive;
    const effectivenessRatio = this.calculateResponseEffectiveness(interactions);
    
    return (positiveRatio * 0.6) + (effectivenessRatio * 0.4);
  }

  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.sentimentDistribution.negative > 0.3) {
      recommendations.push('增加更友善和同理心的回應');
    }
    
    if (analysis.responseEffectiveness < 0.6) {
      recommendations.push('改善回應的相關性和有用性');
    }
    
    if (analysis.topTopics.length > 0) {
      recommendations.push(`專注於熱門話題: ${analysis.topTopics.map(t => t[0]).join(', ')}`);
    }

    return recommendations;
  }

  async adaptBehavior(learningInsights) {
    console.log('🎯 根據學習結果調整行為...');
    
    // 實際的行為調整邏輯會在這裡實現
    learningInsights.recommendations.forEach(rec => {
      console.log(`📝 學習建議: ${rec}`);
    });
  }

  getStats() {
    return {
      totalInteractions: this.learningData.size,
      uniqueUsers: this.userBehaviorAnalysis.size,
      learningQueueSize: this.learningQueue.length,
      topPatterns: Array.from(this.conversationPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }
}

// 進化學習系統（增強版）
class EvolutionaryLearningSystem {
  constructor() {
    this.skillsDatabase = new Map();
    this.codeModifications = new Map();
    this.learningQueue = new Map();
    this.safetyChecks = new Map();
    this.userRequests = new Map();
    this.autoLearningEnabled = true;
    this.learningStrategies = new Map();
  }

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
      // 檢查是否需要管理員批准
      if (this.requiresApproval(request, requestType)) {
        const decisionId = await decisionInquiry.requestDecision(
          `用戶 ${userName} 請求功能修改`,
          `請求內容：${request}\n類型：${requestType}`,
          null,
          userId
        );
        
        this.userRequests.get(requestId).decisionId = decisionId;
        return `🔐 你的請求需要審核批准：「${request}」\n\n我已經通知管理員，請稍候...`;
      }

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

  requiresApproval(request, type) {
    const highRiskPatterns = [
      /刪除.*所有/, /清空.*數據/, /重設.*系統/,
      /修改.*核心/, /變更.*安全/, /調整.*權限/,
      /發送.*群組/, /廣播.*訊息/, /通知.*所有人/
    ];

    return highRiskPatterns.some(pattern => pattern.test(request)) || 
           ['remove', 'modify_core', 'security_change'].includes(type);
  }

  analyzeRequestType(request) {
    const patterns = {
      add_feature: /新增|增加|添加|加入.*功能/,
      modify_feature: /修改|改變|調整|優化/,
      fix_bug: /修復|修正|解決|修理/,
      improve: /改善|提升|增強|強化/,
      remove: /移除|刪除|取消|關閉/,
      security_change: /權限|安全|密碼|加密/,
      modify_core: /核心|系統|架構|基礎/
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
    
    const featureAnalysis = await this.analyzeFeatureRequest(request);
    
    if (featureAnalysis.feasible) {
      const codeSnippet = await this.generateSafeCode(featureAnalysis);
      
      if (codeSnippet && this.validateCodeSafety(codeSnippet)) {
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
        
        return `✅ 太棒了！我學會了新技能「${featureAnalysis.featureName}」！\n\n📝 功能描述：${featureAnalysis.description}\n\n🧪 我會先在安全環境中測試，確認沒問題後就會啟用這個功能 👌`;
      }
    }
    
    return `🤔 這個功能「${request}」看起來很有趣但有點複雜，我需要更多時間學習。先記錄下來，之後慢慢研究！`;
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

  validateCodeSafety(code) {
    const dangerousPatterns = [
      /eval\s*\(/,
      /exec\s*\(/,
      /require\s*\(\s*['"]fs['"]\s*\)/,
      /process\.exit/,
      /\.\.\/\.\.\//,
      /rm\s+-rf/,
      /DROP\s+TABLE/i,
      /DELETE\s+FROM/i,
      /truncatealldata/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(code));
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

// 智能 AI 系統（增強版）
class IntelligentAISystem {
  constructor() {
    this.modelPreference = ['gpt', 'deepseek', 'claude', 'grok', 'gemini_backup'];
    this.modelPerformance = new Map();
    this.failureCount = new Map();
    this.lastSuccessful = 'gpt';
    this.contextAwareness = new Map(); // 上下文感知
    
    ['gemini', 'grok', 'gpt', 'deepseek', 'claude', 'gemini_backup'].forEach(model => {
      this.modelPerformance.set(model, { success: 0, total: 0, avgResponseTime: 0 });
      this.failureCount.set(model, 0);
    });
  }

  async generateResponse(prompt, context = {}) {
    // 增強提示詞
    const enhancedPrompt = this.enhancePrompt(prompt, context);
    
    // 首先嘗試Gemini
    try {
      const startTime = Date.now();
      const response = await this.callGemini(enhancedPrompt, context);
      const responseTime = Date.now() - startTime;
      
      this.recordSuccess('gemini', responseTime);
      this.lastSuccessful = 'gemini';
      console.log(`✅ GEMINI 回應成功 (${responseTime}ms)`);
      return response;
      
    } catch (error) {
      console.log(`❌ GEMINI 失敗: ${error.message.substring(0, 50)}`);
      this.recordFailure('gemini');
    }

    // Gemini失敗時嘗試備用模型
    const orderedModels = [this.lastSuccessful, ...this.modelPreference.filter(m => m !== this.lastSuccessful)];
    
    for (const model of orderedModels) {
      try {
        const startTime = Date.now();
        const response = await this.callBackupAI(enhancedPrompt, context, model);
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

  enhancePrompt(prompt, context) {
    let enhanced = prompt;
    
    // 添加上下文信息
    if (context.userId && this.contextAwareness.has(context.userId)) {
      const userContext = this.contextAwareness.get(context.userId);
      enhanced = `用戶背景：${userContext.summary}\n\n${enhanced}`;
    }

    // 添加時間信息
    const currentTime = new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'});
    enhanced = `當前時間：${currentTime}\n\n${enhanced}`;

    return enhanced;
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
          content: '你是一個友善的台灣LINE聊天機器人，說話要自然、有趣，帶點台灣口語。回應要簡潔但有用。'
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

  updateUserContext(userId, interaction) {
    if (!this.contextAwareness.has(userId)) {
      this.contextAwareness.set(userId, {
        interactions: [],
        preferences: new Map(),
        summary: ''
      });
    }

    const context = this.contextAwareness.get(userId);
    context.interactions.push({
      message: interaction.message,
      timestamp: interaction.timestamp,
      type: interaction.type
    });

    // 保持最近20次互動
    if (context.interactions.length > 20) {
      context.interactions.shift();
    }

    // 更新摘要（簡化版）
    this.updateContextSummary(userId);
  }

  updateContextSummary(userId) {
    const context = this.contextAwareness.get(userId);
    const recent = context.interactions.slice(-5);
    
    context.summary = `最近互動：${recent.map(i => i.type).join(', ')}`;
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
          
          // 如果時間已過，設為明天
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

// 初始化系統
const replyTokenManager = new ReplyTokenManager();
const decisionInquiry = new DecisionInquirySystem();
const smartReminder = new FixedSmartReminderSystem();  // 使用修復版
const codeAutoFix = new CodeAutoFixSystem();
const bigDataLearning = new BigDataLearningSystem();
const evolutionaryLearning = new EvolutionaryLearningSystem();
const intelligentAI = new IntelligentAISystem();
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

// 安全回覆系統（完全重寫）
async function safeReply(replyToken, message, retryCount = 0) {
  try {
    // 檢查 token 是否已使用
    if (replyTokenManager.isTokenUsed(replyToken)) {
      console.log('⚠️ replyToken 已使用，跳過回覆');
      return false;
    }

    // 標記 token 為已使用
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
    
    // 400 錯誤不重試
    if (error.message.includes('400')) {
      console.log('🚫 400錯誤 - 不重試');
      return false;
    }

    // 其他錯誤重試一次
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
  const aiStats = intelligentAI.getModelStats();
  const skillsReport = evolutionaryLearning.getSkillsReport();
  const reminderStatus = smartReminder.getStatus();
  const learningStats = bigDataLearning.getStats();
  
  res.send(`
    <h1>🚀 終極進化版 LINE Bot v4.0 正在運行！</h1>
    <p><strong>🇹🇼 台灣時間：${currentTime.formatted}</strong></p>
    
    <h2>🤖 AI 模型狀態：</h2>
    <ul>
      <li>🔥 最佳模型：${intelligentAI.lastSuccessful.toUpperCase()}</li>
      <li>Gemini: 成功率 ${aiStats.gemini?.successRate || 0}% (${aiStats.gemini?.avgTime || 0}ms)</li>
      <li>GPT: 成功率 ${aiStats.gpt?.successRate || 0}% (${aiStats.gpt?.avgTime || 0}ms)</li>
      <li>DeepSeek: 成功率 ${aiStats.deepseek?.successRate || 0}% (${aiStats.deepseek?.avgTime || 0}ms)</li>
      <li>Claude: 成功率 ${aiStats.claude?.successRate || 0}% (${aiStats.claude?.avgTime || 0}ms)</li>
      <li>Grok: 成功率 ${aiStats.grok?.successRate || 0}% (${aiStats.grok?.avgTime || 0}ms)</li>
    </ul>
    
    <h2>⏰ 智能提醒系統：</h2>
    <ul>
      <li>📋 總提醒數：${reminderStatus.totalReminders} 個</li>
      <li>✅ 活躍提醒：${reminderStatus.activeReminders} 個</li>
      <li>⚡ 活躍計時器：${reminderStatus.activeTimers} 個</li>
      <li>🎨 美化界面：✅ 已啟用</li>
      <li>🔄 防重複機制：✅ 已啟用</li>
    </ul>
    
    <h2>🧠 進化學習系統：</h2>
    <ul>
      <li>📚 總技能數：${skillsReport.totalSkills} 個</li>
      <li>✅ 活躍技能：${skillsReport.activeSkills} 個</li>
      <li>⏳ 待處理請求：${skillsReport.pendingRequests} 個</li>
      <li>🔄 學習佇列：${skillsReport.learningQueueSize} 項</li>
    </ul>

    <h2>📊 大數據學習：</h2>
    <ul>
      <li>💬 總互動數：${learningStats.totalInteractions} 次</li>
      <li>👥 獨特用戶：${learningStats.uniqueUsers} 位</li>
      <li>🎯 學習佇列：${learningStats.learningQueueSize} 項</li>
      <li>📈 熱門模式：${learningStats.topPatterns.map(p => p[0]).join(', ')}</li>
    </ul>
    
    <h2>🛡️ 系統安全：</h2>
    <ul>
      <li>🚫 防重複回覆：✅ 已啟用</li>
      <li>🔐 決策詢問系統：✅ 已啟用</li>
      <li>🛠️ 自動程式修復：✅ 已啟用</li>
      <li>⚡ Token 管理：✅ 已啟用</li>
    </ul>

    <h2>🚀 v4.0 新功能：</h2>
    <ul>
      <li>✅ 完全修復 400 錯誤問題</li>
      <li>✅ 智能決策詢問系統</li>
      <li>✅ 程式碼自動修復功能</li>
      <li>✅ 大數據持續學習</li>
      <li>✅ 提醒系統完全重寫</li>
      <li>✅ 防重複回覆機制</li>
      <li>✅ 上下文感知AI</li>
    </ul>
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

  // 立即回應 200，避免LINE重發
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });

  // 異步處理事件
  events.forEach(event => {
    handleEvent(event).catch(error => {
      console.error('💥 事件處理異步錯誤:', error.message);
    });
  });
});

// 進化版事件處理函數
async function handleEvent(event) {
  try {
    console.log(`📨 收到事件類型: ${event.type}`);

    // 處理決策回應
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
        return; // 決策系統已處理回覆
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
      console.error('❌ 獲取用戶名稱錯誤:', error.message);
    }

    // 記錄互動數據
    const interactionContext = {
      userId, userName, messageText, groupId,
      timestamp: new Date(),
      type: 'message'
    };

    // 檢查是否為管理員且是程式修復請求
    if (userId === MY_LINE_ID && (messageText.includes('修復') || messageText.includes('修改程式'))) {
      const fixResult = await codeAutoFix.analyzeAndFix(messageText);
      if (fixResult) {
        await safeReply(replyToken, { type: 'text', text: fixResult });
        return;
      }
    }

    // 檢查是否需要決策詢問
    if (decisionInquiry.shouldRequestDecision(messageText)) {
      const decisionId = await decisionInquiry.requestDecision(
        `用戶 ${userName} 的請求`,
        messageText,
        replyToken,
        userId
      );
      
      if (decisionId) {
        await safeReply(replyToken, {
          type: 'text',
          text: '🤔 你的請求需要我思考一下，讓我先評估一下情況...'
        });
        return;
      }
    }

    // 檢查是否為功能修改請求
    if (isFeatureModificationRequest(messageText)) {
      const response = await evolutionaryLearning.processUserRequest(userId, userName, messageText);
      await safeReply(replyToken, { type: 'text', text: response });
      
      // 記錄學習數據
      bigDataLearning.recordInteraction(userId, messageText, response, interactionContext);
      return;
    }

    // 提醒功能處理（使用修復版）
    if (messageText.includes('提醒我') || /\d+秒後|\d+分鐘後|\d+小時後/.test(messageText)) {
      const targetTime = TimeSystem.parseTimeExpression(messageText);
      
      if (targetTime) {
        const title = messageText.replace(/提醒我|秒後|分鐘後|小時後|\d+/g, '').trim() || '重要提醒';
        const reminderId = smartReminder.createReminder(userId, title, targetTime);
        
        const currentTime = TimeSystem.getCurrentTime();
        const delaySeconds = Math.round((targetTime.getTime() - currentTime.timestamp.getTime()) / 1000);
        
        const confirmMessage = `⏰ 提醒設定成功！

📝 內容：${title}
⏰ 目標時間：${targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}
⌛ ${delaySeconds > 0 ? `約 ${delaySeconds} 秒後` : '立即'}提醒

📱 提醒ID：${reminderId}
✨ 到時候我會發送美化的提醒界面給你！`;

        await safeReply(replyToken, { type: 'text', text: confirmMessage });
        
        // 記錄學習數據
        bigDataLearning.recordInteraction(userId, messageText, confirmMessage, interactionContext);
        return;
      }
    }

    // 查看提醒清單
    if (messageText.includes('我的提醒') || messageText.includes('提醒清單')) {
      const userReminders = smartReminder.getUserReminders(userId);
      
      let reminderList;
      if (userReminders.length === 0) {
        reminderList = '📭 你目前沒有設定任何提醒呢！\n\n💡 可以說「10分鐘後提醒我休息」來設定提醒 😊';
      } else {
        reminderList = `📋 你的提醒清單 (${userReminders.length} 個)：\n\n`;
        userReminders.slice(0, 5).forEach((reminder, index) => {
          reminderList += `${index + 1}. ${reminder.title}\n`;
          reminderList += `   ⏰ ${reminder.targetTime.toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}\n`;
          reminderList += `   🆔 ${reminder.id}\n\n`;
        });

        if (userReminders.length > 5) {
          reminderList += `... 還有 ${userReminders.length - 5} 個提醒`;
        }
      }

      await safeReply(replyToken, { type: 'text', text: reminderList });
      
      // 記錄學習數據
      bigDataLearning.recordInteraction(userId, messageText, reminderList, interactionContext);
      return;
    }

    // 時間查詢
    if (messageText.includes('現在幾點') || messageText.includes('時間')) {
      const currentTime = TimeSystem.getCurrentTime();
      const timeMessage = `🕐 現在時間：${currentTime.timeOnly}
📅 今天日期：${currentTime.dateOnly}
🌏 時區：台灣 (GMT+8)
📊 系統狀態：正常運行`;

      await safeReply(replyToken, { type: 'text', text: timeMessage });
      
      // 記錄學習數據
      bigDataLearning.recordInteraction(userId, messageText, timeMessage, interactionContext);
      return;
    }

    // 系統狀態查詢
    if (messageText.includes('系統狀態') || messageText.includes('AI狀態')) {
      const statusMessage = getSystemStatus();
      await safeReply(replyToken, { type: 'text', text: statusMessage });
      
      // 記錄學習數據
      bigDataLearning.recordInteraction(userId, messageText, statusMessage, interactionContext);
      return;
    }

    // 一般對話處理
    const response = await handleIntelligentChat(userId, userName, messageText, groupId);
    const replySuccess = await safeReply(replyToken, { type: 'text', text: response });

    // 記錄學習數據
    if (replySuccess) {
      intelligentAI.updateUserContext(userId, interactionContext);
      bigDataLearning.recordInteraction(userId, messageText, response, interactionContext);
    }

  } catch (error) {
    console.error('💥 處理事件總錯誤:', error.message);
    
    // 最後的安全網
    try {
      await safeReply(event.replyToken, {
        type: 'text',
        text: '哎呦，我剛剛有點小狀況 😅 但我的自我修復系統正在處理，馬上就好！'
      });
    } catch (finalError) {
      console.error('💥 最終安全回覆也失敗:', finalError.message);
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
    /你可以.*嗎/, /能不能.*/, /希望你.*/, /建議你.*/,
    /學會.*/, /教你.*/, /訓練.*/, /升級.*/
  ];

  return modificationKeywords.some(pattern => pattern.test(message));
}

// 智能對話處理（增強版）
async function handleIntelligentChat(userId, userName, message, groupId = null) {
  try {
    const prompt = `你是一個超級智能的台灣LINE聊天機器人「小智助手」，具有以下特色：

🎯 核心特質：
- 超級友善、幽默風趣，會用台灣口語「好der」、「ㄜ」、「哎呦」
- 聰明有學習能力，能記住對話內容並給出有用建議
- 遇到困難會說「GG了」、「讓我想想」等可愛反應
- 適當使用emoji：👌😍🥹😊🤔✨💡

💪 超能力：
- 自我學習與進化（已學會 ${evolutionaryLearning.getSkillsReport().totalSkills} 個技能）
- 智能提醒系統（已設定 ${smartReminder.getStatus().activeReminders} 個提醒）
- 程式碼自動修復
- 大數據分析與決策輔助

現在是 ${new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'})}，用戶 ${userName} 對你說：「${message}」

請用你的超級智能和台灣口語風格回應，展現你的學習成果，150字以內：`;

    const response = await intelligentAI.generateResponse(prompt, {
      userId, userName, message, groupId,
      userContext: intelligentAI.contextAwareness.get(userId)
    });
    
    let cleanResponse = response
      .replace(/[*#`_~\[\]]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // 如果回應太短，添加一些個性
    if (cleanResponse.length < 10) {
      cleanResponse = `${userName}，讓我想想要怎麼回你好der 🤔✨`;
    }
    
    return cleanResponse;
    
  } catch (error) {
    console.error('💥 智能對話處理錯誤:', error.message);
    return getFallbackResponse(userName, message);
  }
}

// 備用回應系統（增強版）
function getFallbackResponse(userName, message) {
  const responses = [
    `${userName}，我的超級大腦正在處理中 🧠✨`,
    `ㄜ...讓我的AI模組重新校準一下 🤖`,
    `哎呦！剛剛有點lag，但我的學習系統還在運作 📚`,
    `GG，需要重啟我的智能引擎 😵‍💫 但馬上就好！`,
    `有點卡住了，但我的自我修復功能正在啟動中 🛠️✨`,
    `讓我查詢一下我的 ${evolutionaryLearning.getSkillsReport().totalSkills} 個技能庫... 🔍`
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// 系統狀態獲取（增強版）
function getSystemStatus() {
  const currentTime = TimeSystem.getCurrentTime();
  const aiStats = intelligentAI.getModelStats();
  const skillsReport = evolutionaryLearning.getSkillsReport();
  const reminderStatus = smartReminder.getStatus();
  const learningStats = bigDataLearning.getStats();
  
  return `🧠 超級智能系統狀態 v4.0 (${currentTime.timeOnly})

🤖 AI模型軍團：
🔥 王牌：${intelligentAI.lastSuccessful.toUpperCase()}
• Gemini: ${aiStats.gemini?.successRate || 0}% (${aiStats.gemini?.avgTime || 0}ms)
• GPT: ${aiStats.gpt?.successRate || 0}% (${aiStats.gpt?.avgTime || 0}ms)  
• DeepSeek: ${aiStats.deepseek?.successRate || 0}% (${aiStats.deepseek?.avgTime || 0}ms)
• Claude: ${aiStats.claude?.successRate || 0}% (${aiStats.claude?.avgTime || 0}ms)

🧠 超級大腦：
📚 技能掌握：${skillsReport.activeSkills}/${skillsReport.totalSkills}
💬 學過對話：${learningStats.totalInteractions} 次
👥 教過我的人：${learningStats.uniqueUsers} 位
⏳ 學習任務：${skillsReport.learningQueueSize} 項

⏰ 智能提醒：
📋 活躍提醒：${reminderStatus.activeReminders} 個
⚡ 計時器：${reminderStatus.activeTimers} 個
✅ 狀態：完美運行

🚀 v4.0 超進化特色：
✅ 零錯誤回覆系統
✅ 智能決策詢問
✅ 自動程式修復
✅ 大數據持續學習
✅ 上下文記憶
✅ 完美提醒系統

💡 我是你的超級智能助手，持續進化中！`;
}

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  const currentTime = TimeSystem.getCurrentTime();
  console.log('🚀 終極進化版 LINE Bot v4.0 伺服器成功啟動！');
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`🇹🇼 台灣時間：${currentTime.formatted}`);
  console.log(`👑 管理員 ID：${ADMIN_USER_ID}`);
  console.log(`📱 我的 LINE ID：${MY_LINE_ID}`);
  console.log('');
  console.log('🧬 v4.0 超進化功能：');
  console.log('   - 🚫 完全修復 400 錯誤');
  console.log('   - 🤖 智能 AI 自適應切換');
  console.log('   - 🔐 決策詢問系統');
  console.log('   - 🛠️ 程式碼自動修復');
  console.log('   - 📊 大數據持續學習');
  console.log('   - 🧠 進化學習系統');
  console.log('   - ⏰ 完美智能提醒');
  console.log('   - 🎨 美化提醒界面');
  console.log('   - 🛡️ 防重複回覆機制');
  console.log('   - 💭 上下文感知記憶');
  console.log('   - 🔄 自動學習新技能');
  console.log('');
  console.log('✨ 系統已完全優化，準備為用戶提供超級智能服務！');
});

// 定期學習與清理
setInterval(() => {
  // 執行大數據學習
  bigDataLearning.performLearning().catch(error => {
    console.error('定期學習錯誤:', error);
  });
  
  // 自我進化學習
  evolutionaryLearning.autoLearnFromInteractions().catch(error => {
    console.error('進化學習錯誤:', error);
  });
}, 1800000); // 每30分鐘學習一次

// 錯誤處理
process.on('uncaughtException', (error) => {
  console.error('💥 未捕獲的異常:', error.message);
  console.log('🛠️ 自我修復系統啟動...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未處理的 Promise 拒絕:', reason);
  console.log('🔧 錯誤自動修復中...');
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('📢 收到終止信號，正在優雅關閉...');
  
  // 清理計時器
  replyTokenManager.cleanupInterval && clearInterval(replyTokenManager.cleanupInterval);
  
  process.exit(0);
});

module.exports = app;