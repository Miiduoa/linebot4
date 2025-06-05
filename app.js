const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const crypto = require('crypto');

// ==================== 配置設定 ====================
const config = {
  // LINE Bot 配置
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  
  // AI 配置
  geminiApiKey: process.env.GEMINI_API_KEY,
  
  // 主人配置
  masterUserId: 'U59af77e69411ffb99a49f1f2c3e2afc4',
  masterPhone: '+886966198826',
  masterName: '顧晉瑋',
  
  // 系統配置
  port: process.env.PORT || 3000,
  timezone: 'Asia/Taipei'
};

// 初始化服務
const app = express();
const client = new line.Client(config);
let genAI, model;

if (config.geminiApiKey) {
  genAI = new GoogleGenerativeAI(config.geminiApiKey);
  model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

// ==================== 全域記憶系統 ====================
const Memory = {
  // 用戶資料
  users: new Map(),
  
  // 對話歷史
  conversations: new Map(),
  
  // 提醒系統
  reminders: new Map(),
  
  // 決策系統
  decisions: new Map(),
  
  // 矛盾記錄
  contradictions: new Map(),
  
  // 群組設定
  groupSettings: new Map(),
  
  // 學習數據
  learningData: {
    conversations: [],
    patterns: new Map(),
    userBehavior: new Map()
  },
  
  // 系統統計
  stats: {
    totalMessages: 0,
    totalUsers: 0,
    dailyStats: new Map(),
    startTime: new Date()
  }
};

// ==================== 工具類別 ====================
class Utils {
  // 台灣時間格式化
  static formatTaiwanTime(date = new Date()) {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: config.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }

  // 生成ID
  static generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 獲取台灣當前時間
  static getTaiwanNow() {
    return new Date(new Date().toLocaleString("en-US", {timeZone: config.timezone}));
  }

  // 解析時間字串
  static parseTimeString(timeString) {
    const now = this.getTaiwanNow();
    const patterns = [
      // 相對時間
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
      // 絕對時間
      {
        regex: /明天(\d{1,2})[點時]/,
        handler: (match) => {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(parseInt(match[1]), 0, 0, 0);
          return tomorrow;
        }
      },
      {
        regex: /(\d{1,2})[：:](\d{2})/,
        handler: (match) => {
          const target = new Date(now);
          target.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
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

  // 驗證電話號碼
  static validatePhoneNumber(phone) {
    return /^\+886\d{9}$/.test(phone);
  }
}

// ==================== 用戶管理系統 ====================
class UserManager {
  static async getUserInfo(userId) {
    if (!Memory.users.has(userId)) {
      try {
        const profile = await client.getProfile(userId);
        Memory.users.set(userId, {
          id: userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
          firstSeen: Utils.getTaiwanNow(),
          lastSeen: Utils.getTaiwanNow(),
          messageCount: 0,
          settings: {
            groupReplyFrequency: 'medium' // high, medium, low, ai
          }
        });
        Memory.stats.totalUsers++;
      } catch (error) {
        console.error('獲取用戶資訊失敗:', error);
        Memory.users.set(userId, {
          id: userId,
          displayName: userId,
          firstSeen: Utils.getTaiwanNow(),
          lastSeen: Utils.getTaiwanNow(),
          messageCount: 0,
          settings: {
            groupReplyFrequency: 'medium'
          }
        });
      }
    }
    
    const user = Memory.users.get(userId);
    user.lastSeen = Utils.getTaiwanNow();
    user.messageCount = (user.messageCount || 0) + 1;
    
    return user;
  }

  static getDisplayName(userId) {
    const user = Memory.users.get(userId);
    return user ? `${user.displayName}(${userId.substring(0, 8)}...)` : userId;
  }

  static isMaster(userId) {
    return userId === config.masterUserId;
  }
}

// ==================== Flex 訊息建構器 ====================
class FlexBuilder {
  static createQuickReply(items) {
    return {
      items: items.map(item => ({
        type: 'action',
        action: {
          type: 'message',
          label: item.label,
          text: item.value || item.label
        }
      }))
    };
  }

  static createBasicCard(title, content, color = '#4A90E2', actions = null) {
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
        backgroundColor: color,
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

    if (actions) {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        contents: actions,
        spacing: 'sm'
      };
    }

    return {
      type: 'flex',
      altText: title,
      contents: bubble
    };
  }

  static createSystemMessage(content, title = '🤖 系統訊息') {
    return this.createBasicCard(title, content, '#34C759');
  }

  static createErrorMessage(content, title = '❌ 錯誤') {
    return this.createBasicCard(title, content, '#FF3B30');
  }

  static createWarningMessage(content, title = '⚠️ 警告') {
    return this.createBasicCard(title, content, '#FF9500');
  }

  static createChatResponse(content, userName, emoji = '💬') {
    const timestamp = Utils.formatTaiwanTime();
    return this.createBasicCard(
      `${emoji} ${userName}`,
      content,
      '#4A90E2'
    );
  }

  static createReminderCard(reminderData) {
    const actions = [
      {
        type: 'button',
        action: {
          type: 'message',
          label: '查看所有提醒',
          text: '查看我的提醒'
        },
        style: 'secondary'
      },
      {
        type: 'button',
        action: {
          type: 'message',
          label: '取消此提醒',
          text: `取消提醒 ${reminderData.id}`
        },
        color: '#FF3B30'
      }
    ];

    const content = `📝 內容：${reminderData.content}\n` +
                   `⏰ 時間：${Utils.formatTaiwanTime(reminderData.targetTime)}\n` +
                   `👤 設定者：${reminderData.setterName}\n` +
                   `🆔 編號：${reminderData.id}`;

    return this.createBasicCard('⏰ 提醒設定成功', content, '#34C759', actions);
  }

  static createDecisionCard(decisionData) {
    const actions = [
      {
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
        ],
        spacing: 'sm'
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

    const content = `👤 請求者：${decisionData.requesterName}\n` +
                   `📋 內容：${decisionData.content}\n` +
                   `🕐 時間：${Utils.formatTaiwanTime(decisionData.timestamp)}`;

    return this.createBasicCard('⚖️ 需要您的決策', content, '#FF9500', actions);
  }

  static createMovieSelectionMenu(movies) {
    const quickReply = this.createQuickReply(
      movies.map((movie, index) => ({
        label: movie.title,
        value: `電影詳情 ${index}`
      }))
    );

    return {
      message: this.createSystemMessage(
        '請選擇您想查詢的電影：',
        '🎬 電影選擇'
      ),
      quickReply
    };
  }

  static createFrequencySelectionMenu() {
    const quickReply = this.createQuickReply([
      { label: '🔥 高頻回覆', value: '設定回覆頻率 high' },
      { label: '⚡ 中頻回覆', value: '設定回覆頻率 medium' },
      { label: '🌙 低頻回覆', value: '設定回覆頻率 low' },
      { label: '🤖 AI自動判斷', value: '設定回覆頻率 ai' }
    ]);

    return {
      message: this.createSystemMessage(
        '請選擇群組回覆頻率：\n\n🔥 高頻：積極參與對話\n⚡ 中頻：適度參與\n🌙 低頻：只在必要時回覆\n🤖 AI：智能判斷何時回覆',
        '⚙️ 回覆頻率設定'
      ),
      quickReply
    };
  }

  static createReminderTypeMenu() {
    const quickReply = this.createQuickReply([
      { label: '⏰ 一次性提醒', value: '提醒類型 once' },
      { label: '📅 每天提醒', value: '提醒類型 daily' },
      { label: '📆 每週提醒', value: '提醒類型 weekly' },
      { label: '📞 電話鬧鐘', value: '提醒類型 phone' }
    ]);

    return {
      message: this.createSystemMessage(
        '請選擇提醒類型：',
        '⏰ 提醒設定'
      ),
      quickReply
    };
  }
}

// ==================== AI 個性系統 ====================
class AIPersonality {
  constructor() {
    this.personality = {
      name: config.masterName,
      style: '台灣大學生、親切自然、有趣幽默',
      traits: [
        '用短句回覆，不會太長篇大論',
        '會用「欸」、「哈哈」、「對啊」等語助詞',
        '講話直接但溫暖',
        '遇到技術問題會很興奮',
        '對朋友很關心'
      ]
    };
  }

  async generateResponse(message, userContext, conversationHistory) {
    try {
      const prompt = `
你是${this.personality.name}的AI分身，必須完全模擬他的說話風格：

個性特徵：
- ${this.personality.style}
- ${this.personality.traits.join('\n- ')}

用戶資訊：${userContext.displayName}(${userContext.id})
群組設定：回覆頻率 ${userContext.replyFrequency || 'medium'}
對話歷史：${conversationHistory.slice(-5).join('\n')}
當前訊息：${message}

回覆要求：
1. 用${this.personality.name}的口吻回覆
2. 短句為主，自然分段
3. 有情緒有節奏，真人感受
4. 如果是群組且頻率設定為low，只在重要時候回覆
5. 控制在50字以內

回覆：
`;

      const result = await model.generateContent(prompt);
      const response = result.response.text().trim();
      
      // 記錄學習數據
      this.recordLearningData(message, response, userContext);
      
      return response;
    } catch (error) {
      console.error('AI回覆失敗:', error);
      return this.getFallbackResponse(message);
    }
  }

  getFallbackResponse(message) {
    const responses = [
      '哈囉～有什麼我可以幫你的嗎？',
      '欸，你說什麼？',
      '這個問題很有趣欸！',
      '讓我想想...',
      '不錯不錯！'
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  recordLearningData(userMessage, botResponse, userContext) {
    Memory.learningData.conversations.push({
      userId: userContext.id,
      userMessage,
      botResponse,
      timestamp: Utils.getTaiwanNow()
    });

    // 保持最近1000條對話
    if (Memory.learningData.conversations.length > 1000) {
      Memory.learningData.conversations = Memory.learningData.conversations.slice(-1000);
    }
  }

  shouldReplyInGroup(message, groupSettings, userContext) {
    const frequency = groupSettings?.replyFrequency || userContext.replyFrequency || 'medium';
    
    switch (frequency) {
      case 'high':
        return Math.random() > 0.2; // 80% 機率回覆
      case 'medium':
        return Math.random() > 0.5; // 50% 機率回覆
      case 'low':
        return Math.random() > 0.8 || this.isImportantMessage(message); // 20% 機率或重要訊息
      case 'ai':
        return this.aiJudgeReply(message, userContext);
      default:
        return Math.random() > 0.5;
    }
  }

  isImportantMessage(message) {
    const importantKeywords = ['緊急', '重要', '幫忙', '問題', '請問', '謝謝'];
    return importantKeywords.some(keyword => message.includes(keyword));
  }

  aiJudgeReply(message, userContext) {
    // 簡單的AI判斷邏輯，實際可以用更複雜的模型
    const shouldReply = this.isImportantMessage(message) || 
                       message.includes(config.masterName) ||
                       message.includes('bot') ||
                       message.includes('AI');
    return shouldReply;
  }
}

// ==================== 提醒系統 ====================
class ReminderSystem {
  constructor() {
    this.startTimer();
  }

  startTimer() {
    setInterval(() => {
      this.checkReminders();
    }, 10000); // 每10秒檢查一次
  }

  async setReminder(userId, messageText, reminderType = 'once') {
    const user = await UserManager.getUserInfo(userId);
    
    // 解析時間
    const timeMatch = messageText.match(/(\d+秒後|\d+分鐘?後|\d+小時後|明天.*?\d{1,2}[點時]|\d{1,2}[：:]\d{2})/);
    
    if (!timeMatch) {
      return {
        message: FlexBuilder.createErrorMessage(
          '無法識別時間格式。\n\n支援格式：\n• 30秒後\n• 5分鐘後\n• 2小時後\n• 明天8點\n• 14:30',
          '⏰ 時間格式錯誤'
        )
      };
    }

    const timeString = timeMatch[0];
    const targetTime = Utils.parseTimeString(timeString);
    
    if (!targetTime || targetTime <= Utils.getTaiwanNow()) {
      return {
        message: FlexBuilder.createErrorMessage(
          '時間設定錯誤，請設定未來的時間',
          '⏰ 時間錯誤'
        )
      };
    }

    const content = messageText.replace(timeString, '').replace(/提醒|鬧鐘|叫我/, '').trim() || '時間到了！';
    const reminderId = Utils.generateId('reminder');
    
    const reminderData = {
      id: reminderId,
      userId,
      setterName: user.displayName,
      content,
      targetTime,
      type: reminderType,
      isPhoneCall: reminderType === 'phone',
      phone: reminderType === 'phone' ? this.extractPhone(messageText) : null,
      created: Utils.getTaiwanNow(),
      status: 'active'
    };

    Memory.reminders.set(reminderId, reminderData);

    return {
      message: FlexBuilder.createReminderCard(reminderData)
    };
  }

  extractPhone(message) {
    const phoneMatch = message.match(/\+886\d{9}/);
    return phoneMatch ? phoneMatch[0] : null;
  }

  async checkReminders() {
    const now = Utils.getTaiwanNow();
    
    for (const [id, reminder] of Memory.reminders.entries()) {
      if (reminder.status === 'active' && now >= reminder.targetTime) {
        await this.triggerReminder(reminder);
        
        // 根據類型決定是否刪除
        if (reminder.type === 'once') {
          Memory.reminders.delete(id);
        } else {
          // 重複提醒需要重新計算下次時間
          this.rescheduleReminder(reminder);
        }
      }
    }
  }

  async triggerReminder(reminder) {
    try {
      let message;
      
      if (reminder.isPhoneCall && reminder.phone) {
        // 電話鬧鐘功能
        message = FlexBuilder.createWarningMessage(
          `📞 電話鬧鐘提醒！\n\n📝 ${reminder.content}\n👤 設定者：${reminder.setterName}\n📱 電話：${reminder.phone}\n⏰ 台灣時間：${Utils.formatTaiwanTime()}`,
          '📞 電話鬧鐘'
        );
        
        // 這裡可以整合電話服務 API
        console.log(`📞 電話鬧鐘觸發：${reminder.phone} - ${reminder.content}`);
      } else {
        message = FlexBuilder.createSystemMessage(
          `⏰ 提醒時間到！\n\n📝 ${reminder.content}\n👤 設定者：${reminder.setterName}\n🕐 台灣時間：${Utils.formatTaiwanTime()}`,
          '⏰ 提醒通知'
        );
      }
      
      await client.pushMessage(reminder.userId, message);
      console.log(`✅ 提醒已發送：${reminder.id}`);
      
    } catch (error) {
      console.error('❌ 提醒發送失敗:', error);
    }
  }

  rescheduleReminder(reminder) {
    const now = Utils.getTaiwanNow();
    
    switch (reminder.type) {
      case 'daily':
        reminder.targetTime = new Date(reminder.targetTime.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        reminder.targetTime = new Date(reminder.targetTime.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
    }
  }

  listUserReminders(userId) {
    const userReminders = Array.from(Memory.reminders.values())
      .filter(r => r.userId === userId && r.status === 'active')
      .sort((a, b) => a.targetTime - b.targetTime);

    if (userReminders.length === 0) {
      return FlexBuilder.createSystemMessage(
        '您目前沒有設定任何提醒',
        '📋 我的提醒'
      );
    }

    const reminderList = userReminders.map((r, index) => {
      const timeLeft = r.targetTime - Utils.getTaiwanNow();
      const timeString = timeLeft > 0 ? 
        `還有 ${Math.floor(timeLeft / 60000)} 分鐘` : 
        '即將觸發';
      
      return `${index + 1}. ${r.content}\n   ⏰ ${Utils.formatTaiwanTime(r.targetTime)}\n   ⏳ ${timeString}\n   🆔 ${r.id}`;
    }).join('\n\n');

    return FlexBuilder.createBasicCard('📋 我的提醒', reminderList, '#4A90E2');
  }

  async cancelReminder(userId, reminderId) {
    const reminder = Memory.reminders.get(reminderId);
    
    if (!reminder) {
      return FlexBuilder.createErrorMessage(
        '找不到指定的提醒',
        '❌ 取消失敗'
      );
    }

    if (reminder.userId !== userId && !UserManager.isMaster(userId)) {
      return FlexBuilder.createErrorMessage(
        '您沒有權限取消此提醒',
        '🔐 權限不足'
      );
    }

    Memory.reminders.delete(reminderId);
    
    return FlexBuilder.createSystemMessage(
      `✅ 已成功取消提醒：${reminder.content}\n👤 設定者：${reminder.setterName}\n⏰ 原定時間：${Utils.formatTaiwanTime(reminder.targetTime)}`,
      '✅ 取消成功'
    );
  }
}

// ==================== 決策系統 ====================
class DecisionSystem {
  async requestDecision(requesterId, content) {
    const requester = await UserManager.getUserInfo(requesterId);
    const decisionId = Utils.generateId('decision');
    
    const decisionData = {
      id: decisionId,
      requester: requesterId,
      requesterName: requester.displayName,
      content,
      timestamp: Utils.getTaiwanNow(),
      status: 'pending',
      created: Utils.getTaiwanNow()
    };

    Memory.decisions.set(decisionId, decisionData);

    // 30分鐘後自動拒絕
    setTimeout(() => {
      this.autoRejectDecision(decisionId);
    }, 30 * 60 * 1000);

    try {
      const decisionMessage = FlexBuilder.createDecisionCard(decisionData);
      await client.pushMessage(config.masterUserId, decisionMessage);
      
      return FlexBuilder.createSystemMessage(
        `✅ 已向 ${config.masterName} 發送決策請求\n\n📋 內容：${content}\n🆔 決策編號：${decisionId}\n⏰ 30分鐘後將自動拒絕\n🕐 台灣時間：${Utils.formatTaiwanTime()}`,
        '⚖️ 決策請求已發送'
      );
    } catch (error) {
      console.error('❌ 決策請求發送失敗:', error);
      Memory.decisions.delete(decisionId);
      throw error;
    }
  }

  async handleDecisionResponse(decisionId, action, userId, details = '') {
    if (!UserManager.isMaster(userId)) {
      return FlexBuilder.createErrorMessage(
        `只有 ${config.masterName} 可以處理決策請求`,
        '🔐 權限不足'
      );
    }

    const decision = Memory.decisions.get(decisionId);
    if (!decision || decision.status !== 'pending') {
      return FlexBuilder.createErrorMessage(
        '找不到指定的決策請求或已處理',
        '❌ 決策不存在'
      );
    }

    decision.status = action;
    decision.response = details;
    decision.responseTime = Utils.getTaiwanNow();

    try {
      const statusText = action === 'approved' ? '✅ 已同意' : '❌ 已拒絕';
      const resultMessage = FlexBuilder.createSystemMessage(
        `⚖️ 決策結果：${statusText}\n\n📋 原請求：${decision.content}\n🕐 處理時間：${Utils.formatTaiwanTime()}` +
        (details ? `\n💬 ${config.masterName} 回覆：${details}` : ''),
        '⚖️ 決策結果通知'
      );

      await client.pushMessage(decision.requester, resultMessage);
      
      return FlexBuilder.createSystemMessage(
        `✅ 決策已處理並通知 ${decision.requesterName}\n\n🆔 決策編號：${decisionId}\n📋 結果：${statusText}\n🕐 台灣時間：${Utils.formatTaiwanTime()}`,
        '⚖️ 處理完成'
      );
    } catch (error) {
      console.error('❌ 決策結果通知失敗:', error);
      return FlexBuilder.createWarningMessage(
        '決策已處理但通知發送失敗',
        '⚠️ 部分成功'
      );
    }
  }

  async autoRejectDecision(decisionId) {
    const decision = Memory.decisions.get(decisionId);
    if (decision && decision.status === 'pending') {
      decision.status = 'auto_rejected';
      decision.responseTime = Utils.getTaiwanNow();
      
      try {
        const timeoutMessage = FlexBuilder.createWarningMessage(
          `⏰ 決策請求超時自動拒絕\n\n📋 原請求：${decision.content}\n🕐 請求時間：${Utils.formatTaiwanTime(decision.timestamp)}\n⏰ 拒絕時間：${Utils.formatTaiwanTime()}`,
          '⏰ 決策超時'
        );
        
        await client.pushMessage(decision.requester, timeoutMessage);
        console.log(`⏰ 決策自動拒絕：${decisionId}`);
      } catch (error) {
        console.error('❌ 超時通知發送失敗:', error);
      }
    }
  }
}

// ==================== 矛盾偵測系統 ====================
class ContradictionDetector {
  async detectContradiction(userId, newMessage) {
    const conversations = Memory.conversations.get(userId) || [];
    if (conversations.length < 5) return; // 對話太少無法偵測

    try {
      const recentMessages = conversations.slice(-10).map(c => c.message).join('\n');
      
      const prompt = `
分析以下對話，判斷新訊息是否與之前內容有明顯矛盾：

最近對話：
${recentMessages}

新訊息：${newMessage}

如果發現明顯矛盾，回覆格式：
CONTRADICTION: [具體描述矛盾處]

如果沒有矛盾，回覆：
NO_CONTRADICTION

矛盾標準：
1. 事實性矛盾（前後說法相反）
2. 態度矛盾（對同事物態度完全不同）
3. 計劃矛盾（決定前後不一致）
`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      if (response.includes('CONTRADICTION:')) {
        await this.reportContradiction(userId, newMessage, response);
      }
    } catch (error) {
      console.error('❌ 矛盾偵測失敗:', error);
    }
  }

  async reportContradiction(userId, message, analysis) {
    try {
      const user = await UserManager.getUserInfo(userId);
      const contradictionId = Utils.generateId('contradiction');
      
      const contradictionData = {
        id: contradictionId,
        userId,
        userName: user.displayName,
        message,
        analysis: analysis.replace('CONTRADICTION:', '').trim(),
        timestamp: Utils.getTaiwanNow()
      };

      Memory.contradictions.set(contradictionId, contradictionData);
      
      const reportMessage = FlexBuilder.createWarningMessage(
        `⚠️ 偵測到用戶發言矛盾\n\n👤 用戶：${user.displayName}(${userId.substring(0, 8)}...)\n💬 訊息：${message}\n🔍 矛盾分析：${contradictionData.analysis}\n🕐 台灣時間：${Utils.formatTaiwanTime()}`,
        '⚠️ 矛盾偵測警告'
      );

      await client.pushMessage(config.masterUserId, reportMessage);
      console.log(`⚠️ 矛盾偵測：${userId} - ${message}`);
    } catch (error) {
      console.error('❌ 矛盾報告發送失敗:', error);
    }
  }
}

// ==================== 電影搜尋系統 ====================
class MovieSearchSystem {
  async searchMovies(query) {
    // 模擬電影搜尋 - 實際可接入 TMDB API
    const mockMovies = [
      {
        title: `${query} (第一集)`,
        year: '2001',
        director: '導演名稱',
        cast: '主要演員列表',
        poster: 'https://example.com/poster1.jpg',
        plot: '精彩劇情介紹...',
        rating: '8.5/10'
      },
      {
        title: `${query} (第二集)`,
        year: '2002',
        director: '導演名稱',
        cast: '主要演員列表',
        poster: 'https://example.com/poster2.jpg',
        plot: '精彩劇情介紹...',
        rating: '8.7/10'
      }
    ];

    return mockMovies;
  }

  async getMovieDetails(movieIndex, movies) {
    const movie = movies[movieIndex];
    if (!movie) {
      return FlexBuilder.createErrorMessage(
        '找不到指定的電影',
        '🎬 電影錯誤'
      );
    }

    const movieCard = {
      type: 'flex',
      altText: movie.title,
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: movie.poster,
          size: 'full',
          aspectRatio: '2:3',
          aspectMode: 'cover'
        },
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: `🎬 ${movie.title}`,
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF'
          }],
          backgroundColor: '#FF6B6B',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📅 上映年份：${movie.year}`,
              margin: 'md'
            },
            {
              type: 'text',
              text: `🎭 導演：${movie.director}`,
              margin: 'md'
            },
            {
              type: 'text',
              text: `⭐ 評分：${movie.rating}`,
              margin: 'md'
            },
            {
              type: 'text',
              text: `👥 主演：${movie.cast}`,
              margin: 'md',
              wrap: true
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: `📖 劇情：${movie.plot}`,
              margin: 'lg',
              wrap: true,
              size: 'sm'
            },
            {
              type: 'text',
              text: `🕐 查詢時間：${Utils.formatTaiwanTime()}`,
              margin: 'lg',
              size: 'xs',
              color: '#999999'
            }
          ]
        }
      }
    };

    return movieCard;
  }
}

// ==================== 學習系統 ====================
class LearningSystem {
  constructor() {
    this.startLearningProcess();
  }

  startLearningProcess() {
    // 每小時進行一次自我學習
    setInterval(() => {
      this.performSelfLearning();
    }, 60 * 60 * 1000);
  }

  async performSelfLearning() {
    try {
      console.log('🧠 開始自我學習程序...');
      
      // 分析對話模式
      await this.analyzeConversationPatterns();
      
      // 優化回覆策略
      await this.optimizeResponseStrategies();
      
      // 更新用戶行為模型
      this.updateUserBehaviorModels();
      
      console.log('✅ 自我學習完成');
    } catch (error) {
      console.error('❌ 自我學習失敗:', error);
    }
  }

  async analyzeConversationPatterns() {
    const conversations = Memory.learningData.conversations.slice(-100);
    if (conversations.length < 10) return;

    try {
      const prompt = `
分析以下對話數據，提取常見模式和改進建議：

對話數據：
${conversations.map(c => `用戶: ${c.userMessage}\nBot: ${c.botResponse}`).join('\n---\n')}

請分析：
1. 常見話題和關鍵詞
2. 用戶偏好的回覆風格
3. 需要改進的回覆模式
4. 建議的優化方向

格式：JSON
{
  "commonTopics": ["話題1", "話題2"],
  "preferredStyle": "回覆風格描述",
  "improvements": ["改進1", "改進2"],
  "optimization": "優化建議"
}
`;

      const result = await model.generateContent(prompt);
      const analysis = JSON.parse(result.response.text());
      
      // 儲存分析結果
      Memory.learningData.patterns.set('conversation_analysis', {
        analysis,
        timestamp: Utils.getTaiwanNow()
      });
      
    } catch (error) {
      console.error('❌ 對話模式分析失敗:', error);
    }
  }

  async optimizeResponseStrategies() {
    // 根據學習數據優化回覆策略
    const analysis = Memory.learningData.patterns.get('conversation_analysis');
    if (analysis) {
      console.log('📈 根據分析結果優化回覆策略');
      // 這裡可以實作具體的策略調整
    }
  }

  updateUserBehaviorModels() {
    // 更新用戶行為模型
    for (const [userId, user] of Memory.users.entries()) {
      const userConversations = Memory.learningData.conversations
        .filter(c => c.userId === userId)
        .slice(-20);

      if (userConversations.length > 5) {
        const behaviorModel = {
          averageMessageLength: userConversations.reduce((sum, c) => sum + c.userMessage.length, 0) / userConversations.length,
          commonWords: this.extractCommonWords(userConversations.map(c => c.userMessage)),
          conversationFrequency: userConversations.length,
          lastActive: Utils.getTaiwanNow()
        };

        Memory.learningData.userBehavior.set(userId, behaviorModel);
      }
    }
  }

  extractCommonWords(messages) {
    const allWords = messages.join(' ').split(/\s+/);
    const wordCount = {};
    
    allWords.forEach(word => {
      if (word.length > 1) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });

    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}

// ==================== 統計報告系統 ====================
class StatisticsSystem {
  constructor() {
    // 啟動每日報告計時器
    this.startDailyReportTimer();
  }

  startDailyReportTimer() {
    // 計算距離下次早上9點的時間
    const now = Utils.getTaiwanNow();
    const tomorrow9AM = new Date(now);
    tomorrow9AM.setHours(9, 0, 0, 0);
    
    // 如果現在已經過了今天9點，設定為明天9點
    if (now.getHours() >= 9) {
      tomorrow9AM.setDate(tomorrow9AM.getDate() + 1);
    }
    
    const timeUntil9AM = tomorrow9AM.getTime() - now.getTime();
    
    // 設定第一次報告時間
    setTimeout(() => {
      this.sendDailyReport();
      
      // 之後每24小時發送一次
      setInterval(() => {
        this.sendDailyReport();
      }, 24 * 60 * 60 * 1000);
      
    }, timeUntil9AM);
    
    console.log(`📊 每日報告將在 ${Utils.formatTaiwanTime(tomorrow9AM)} 開始發送`);
  }

  async sendDailyReport() {
    try {
      console.log('📊 開始生成每日報告...');
      const report = this.generateDailyReport();
      const reportMessage = this.createReportCard(report);
      
      await client.pushMessage(config.masterUserId, reportMessage);
      console.log(`📊 每日報告已發送給 ${config.masterName}`);
    } catch (error) {
      console.error('❌ 每日報告發送失敗:', error);
      
      // 發送錯誤通知給主人
      try {
        const errorMessage = FlexBuilder.createErrorMessage(
          `每日報告生成失敗\n錯誤時間：${Utils.formatTaiwanTime()}\n錯誤原因：${error.message}`,
          '📊 報告系統錯誤'
        );
        await client.pushMessage(config.masterUserId, errorMessage);
      } catch (notifyError) {
        console.error('❌ 連錯誤通知都發送失敗:', notifyError);
      }
    }
  }

  generateDailyReport() {
    const today = Utils.getTaiwanNow();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    // 計算昨日統計
    const dailyStats = {
      totalMessages: Memory.stats.totalMessages,
      totalUsers: Memory.users.size,
      activeReminders: Memory.reminders.size,
      pendingDecisions: Array.from(Memory.decisions.values()).filter(d => d.status === 'pending').length,
      contradictions: Memory.contradictions.size,
      learningProgress: Memory.learningData.conversations.length,
      topUsers: this.getTopActiveUsers(),
      systemHealth: this.getSystemHealth()
    };

    return dailyStats;
  }

  getTopActiveUsers() {
    return Array.from(Memory.users.values())
      .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
      .slice(0, 5)
      .map(user => ({
        name: user.displayName,
        messages: user.messageCount || 0
      }));
  }

  getSystemHealth() {
    const memoryUsage = process.memoryUsage();
    return {
      memory: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      uptime: Math.floor((Date.now() - Memory.stats.startTime) / 3600000)
    };
  }

  createReportCard(report) {
    const content = `📊 每日系統報告\n🕐 台灣時間：${Utils.formatTaiwanTime()}\n\n` +
                   `💬 總訊息：${report.totalMessages}\n` +
                   `👥 用戶數：${report.totalUsers}\n` +
                   `⏰ 活躍提醒：${report.activeReminders}\n` +
                   `⚖️ 待決策：${report.pendingDecisions}\n` +
                   `⚠️ 矛盾記錄：${report.contradictions}\n` +
                   `🧠 學習進度：${report.learningProgress} 筆對話\n` +
                   `💾 記憶體：${report.systemHealth.memory}MB\n` +
                   `🕒 運行時間：${report.systemHealth.uptime}小時\n\n` +
                   `🏆 活躍用戶 TOP 5：\n` +
                   report.topUsers.map((user, i) => `${i+1}. ${user.name}: ${user.messages}則`).join('\n');

    return FlexBuilder.createBasicCard('📈 每日報告', content, '#4A90E2');
  }
}

// ==================== 主要 Bot 類別 ====================
class SuperIntelligentLineBot {
  constructor() {
    this.aiPersonality = new AIPersonality();
    this.reminderSystem = new ReminderSystem();
    this.decisionSystem = new DecisionSystem();
    this.contradictionDetector = new ContradictionDetector();
    this.movieSearch = new MovieSearchSystem();
    this.learningSystem = new LearningSystem();
    this.statisticsSystem = new StatisticsSystem();
  }

  async handleMessage(event) {
    const { message, source, replyToken } = event;
    const messageText = message.text;
    const userId = source.userId || source.groupId;
    const isGroup = source.type === 'group';

    console.log(`👤 收到訊息 [${userId}]: ${messageText}`);
    Memory.stats.totalMessages++;

    try {
      // 更新用戶資訊
      const user = await UserManager.getUserInfo(userId);
      
      // 記錄對話
      this.recordConversation(userId, messageText, 'user');

      // 矛盾偵測 (異步)
      this.contradictionDetector.detectContradiction(userId, messageText)
        .catch(error => console.error('矛盾偵測失敗:', error));

      // 處理各種指令
      let response;

      // 提醒相關
      if (messageText.includes('提醒') || messageText.includes('鬧鐘')) {
        if (messageText.includes('取消提醒')) {
          response = await this.handleCancelReminder(messageText, userId);
        } else if (messageText === '查看我的提醒') {
          response = { message: this.reminderSystem.listUserReminders(userId) };
        } else {
          response = await this.handleReminderRequest(messageText, userId);
        }
      }
      // 決策相關
      else if (messageText.includes('決策')) {
        response = await this.handleDecisionRequest(messageText, userId);
      }
      // 電影查詢
      else if (messageText.includes('電影') && !messageText.includes('電影詳情')) {
        response = await this.handleMovieSearch(messageText);
      }
      // 電影詳情
      else if (messageText.includes('電影詳情')) {
        response = await this.handleMovieDetails(messageText);
      }
      // 設定回覆頻率
      else if (messageText.includes('設定回覆頻率')) {
        response = await this.handleFrequencySettings(messageText, userId);
      }
      // 傳訊息給其他人
      else if (messageText.startsWith('傳訊息給') || messageText.startsWith('轉發給')) {
        response = await this.handleForwardMessage(messageText, userId);
      }
      // 系統狀態（主人專用）
      else if (messageText === '/狀態' && UserManager.isMaster(userId)) {
        response = { message: this.getSystemStatus() };
      }
      // 一般對話
      else {
        response = await this.handleGeneralConversation(messageText, userId, isGroup);
      }

      if (response) {
        await this.safeReply(replyToken, response.message, response.quickReply);
      }

    } catch (error) {
      console.error('❌ 訊息處理錯誤:', error);
      
      const errorMessage = FlexBuilder.createErrorMessage(
        '哎呀，我遇到一點小問題，讓我重新整理一下思緒...',
        '🤖 系統錯誤'
      );
      await this.safeReply(replyToken, errorMessage);
    }
  }

  async safeReply(replyToken, message, quickReply = null) {
    try {
      const replyMessage = quickReply ? { ...message, quickReply } : message;
      await client.replyMessage(replyToken, replyMessage);
      console.log('✅ 回覆發送成功');
    } catch (error) {
      console.error('❌ 回覆發送失敗:', error);
    }
  }

  recordConversation(userId, message, type) {
    if (!Memory.conversations.has(userId)) {
      Memory.conversations.set(userId, []);
    }
    
    const conversation = Memory.conversations.get(userId);
    conversation.push({
      message,
      type,
      timestamp: Utils.getTaiwanNow()
    });

    // 保持最近50條對話
    if (conversation.length > 50) {
      conversation.splice(0, conversation.length - 50);
    }
  }

  async handleReminderRequest(messageText, userId) {
    // 檢查是否為電話鬧鐘
    if (messageText.includes('電話') || messageText.includes('鬧鐘')) {
      const phone = this.reminderSystem.extractPhone(messageText);
      if (!phone && !messageText.includes('+886')) {
        return {
          message: FlexBuilder.createErrorMessage(
            '電話鬧鐘需要提供 +886 格式的電話號碼\n例如：+886966198826',
            '📞 電話格式錯誤'
          )
        };
      }
      return await this.reminderSystem.setReminder(userId, messageText, 'phone');
    }

    // 一般提醒先顯示類型選單
    return {
      ...FlexBuilder.createReminderTypeMenu()
    };
  }

  async handleCancelReminder(messageText, userId) {
    const reminderIdMatch = messageText.match(/取消提醒\s+(\w+)/);
    if (!reminderIdMatch) {
      return {
        message: FlexBuilder.createErrorMessage(
          '請提供要取消的提醒編號\n例如：取消提醒 reminder_123',
          '❌ 格式錯誤'
        )
      };
    }

    const reminderId = reminderIdMatch[1];
    return {
      message: await this.reminderSystem.cancelReminder(userId, reminderId)
    };
  }

  async handleDecisionRequest(messageText, userId) {
    if (messageText.includes('決策同意') || messageText.includes('決策拒絕')) {
      const match = messageText.match(/決策(同意|拒絕)\s+(\w+)(?:\s+(.+))?/);
      if (!match) {
        return {
          message: FlexBuilder.createErrorMessage(
            '決策格式錯誤\n正確格式：決策同意 decision_123\n或：決策拒絕 decision_123 原因',
            '⚖️ 格式錯誤'
          )
        };
      }

      const [, action, decisionId, details] = match;
      const actionType = action === '同意' ? 'approved' : 'rejected';
      
      return {
        message: await this.decisionSystem.handleDecisionResponse(decisionId, actionType, userId, details || '')
      };
    } else {
      const content = messageText.replace('決策', '').trim();
      return {
        message: await this.decisionSystem.requestDecision(userId, content)
      };
    }
  }

  async handleMovieSearch(messageText) {
    const query = messageText.replace(/電影|查|搜尋/, '').trim();
    const movies = await this.movieSearch.searchMovies(query);
    
    // 暫存電影數據供後續使用
    this.tempMovieData = movies;
    
    return FlexBuilder.createMovieSelectionMenu(movies);
  }

  async handleMovieDetails(messageText) {
    const indexMatch = messageText.match(/電影詳情\s+(\d+)/);
    if (!indexMatch || !this.tempMovieData) {
      return {
        message: FlexBuilder.createErrorMessage(
          '請先搜尋電影',
          '🎬 電影錯誤'
        )
      };
    }

    const movieIndex = parseInt(indexMatch[1]);
    return {
      message: await this.movieSearch.getMovieDetails(movieIndex, this.tempMovieData)
    };
  }

  async handleFrequencySettings(messageText, userId) {
    const frequencyMatch = messageText.match(/設定回覆頻率\s+(high|medium|low|ai)/);
    if (!frequencyMatch) {
      return FlexBuilder.createFrequencySelectionMenu();
    }

    const frequency = frequencyMatch[1];
    const user = Memory.users.get(userId);
    if (user) {
      user.settings.groupReplyFrequency = frequency;
    }

    const frequencyNames = {
      high: '🔥 高頻回覆',
      medium: '⚡ 中頻回覆',
      low: '🌙 低頻回覆',
      ai: '🤖 AI自動判斷'
    };

    return {
      message: FlexBuilder.createSystemMessage(
        `✅ 已設定群組回覆頻率為：${frequencyNames[frequency]}\n👤 設定者：${UserManager.getDisplayName(userId)}\n🕐 台灣時間：${Utils.formatTaiwanTime()}`,
        '⚙️ 設定完成'
      )
    };
  }

  async handleForwardMessage(messageText, userId) {
    if (!UserManager.isMaster(userId)) {
      return {
        message: FlexBuilder.createErrorMessage(
          `只有 ${config.masterName} 可以使用此功能`,
          '🔐 權限不足'
        )
      };
    }

    const match = messageText.match(/傳(?:訊息)?給\s+(\S+)\s+([\s\S]+)/);
    if (!match) {
      return {
        message: FlexBuilder.createErrorMessage(
          '格式錯誤，請使用：傳訊息給 [用戶ID] [內容]',
          '❌ 格式錯誤'
        )
      };
    }

    const targetId = match[1];
    const content = match[2];

    try {
      await client.pushMessage(targetId, { type: 'text', text: content });
      return {
        message: FlexBuilder.createSystemMessage(
          `✅ 已傳送訊息給 ${targetId}\n\n內容：${content}`,
          '📨 傳訊息成功'
        )
      };
    } catch (error) {
      console.error('❌ 傳訊息失敗:', error);
      return {
        message: FlexBuilder.createErrorMessage(
          '訊息傳送失敗，請確認用戶ID是否正確',
          '❌ 傳送失敗'
        )
      };
    }
  }

  async handleGeneralConversation(messageText, userId, isGroup) {
    const user = Memory.users.get(userId);
    const conversationHistory = Memory.conversations.get(userId) || [];

    // 群組回覆頻率判斷
    if (isGroup) {
      const groupSettings = Memory.groupSettings.get(userId);
      if (!this.aiPersonality.shouldReplyInGroup(messageText, groupSettings, user)) {
        return null; // 不回覆
      }
    }

    try {
      const aiResponse = await this.aiPersonality.generateResponse(
        messageText,
        { ...user, replyFrequency: user?.settings?.groupReplyFrequency },
        conversationHistory.map(c => c.message)
      );

      // 記錄AI回覆
      this.recordConversation(userId, aiResponse, 'bot');

      return {
        message: FlexBuilder.createChatResponse(
          aiResponse,
          UserManager.getDisplayName(userId)
        )
      };
    } catch (error) {
      console.error('❌ AI對話失敗:', error);
      return {
        message: FlexBuilder.createErrorMessage(
          '抱歉，我現在有點累了，等等再聊好嗎？',
          '🤖 AI暫時無法回應'
        )
      };
    }
  }

  getSystemStatus() {
    const uptime = Math.floor((Date.now() - Memory.stats.startTime) / 3600000);
    const memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const content = `🤖 系統狀態總覽\n🕐 台灣時間：${Utils.formatTaiwanTime()}\n\n` +
                   `💬 總訊息：${Memory.stats.totalMessages}\n` +
                   `👥 用戶數：${Memory.users.size}\n` +
                   `⏰ 活躍提醒：${Memory.reminders.size}\n` +
                   `⚖️ 待決策：${Array.from(Memory.decisions.values()).filter(d => d.status === 'pending').length}\n` +
                   `⚠️ 矛盾記錄：${Memory.contradictions.size}\n` +
                   `🧠 學習數據：${Memory.learningData.conversations.length} 筆\n` +
                   `💾 記憶體：${memoryUsage}MB\n` +
                   `🕒 運行時間：${uptime}小時`;

    return FlexBuilder.createBasicCard('📊 系統狀態', content, '#4A90E2');
  }
}

// ==================== Express 應用設置 ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const bot = new SuperIntelligentLineBot();

// Webhook 端點
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.get('X-Line-Signature');
    const body = req.body;
    
    if (!signature) {
      return res.status(401).send('Unauthorized');
    }

    const bodyString = Buffer.isBuffer(body) ? body.toString() : JSON.stringify(body);
    const hash = crypto
      .createHmac('SHA256', config.channelSecret)
      .update(bodyString)
      .digest('base64');

    if (hash !== signature) {
      return res.status(401).send('Unauthorized');
    }

    const parsedBody = Buffer.isBuffer(body) ? JSON.parse(body.toString()) : body;
    const events = parsedBody.events || [];
    
    await Promise.all(
      events.map(event => {
        if (event.type === 'message' && event.message.type === 'text') {
          return bot.handleMessage(event);
        }
        return Promise.resolve();
      })
    );

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Webhook 處理失敗:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 健康檢查
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: '🤖 超級智能 LINE Bot v4.0 運行中',
    taiwanTime: Utils.formatTaiwanTime(),
    uptime: Math.floor((Date.now() - Memory.stats.startTime) / 1000),
    stats: {
      totalMessages: Memory.stats.totalMessages,
      totalUsers: Memory.users.size,
      activeReminders: Memory.reminders.size,
      pendingDecisions: Array.from(Memory.decisions.values()).filter(d => d.status === 'pending').length
    }
  });
});

// 配置檢查
function validateConfig() {
  const required = {
    'LINE_CHANNEL_ACCESS_TOKEN': config.channelAccessToken,
    'LINE_CHANNEL_SECRET': config.channelSecret,
    'GEMINI_API_KEY': config.geminiApiKey
  };

  const missing = Object.entries(required)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error('❌ 缺少必要環境變數:', missing.join(', '));
    return false;
  }

  return true;
}

// 啟動伺服器
app.listen(config.port, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 超級智能 LINE Bot v4.0 啟動中...');
  console.log('='.repeat(80));
  
  if (!validateConfig()) {
    console.error('❌ 配置驗證失敗，請檢查環境變數');
    process.exit(1);
  }
  
  console.log(`📡 伺服器端口: ${config.port}`);
  console.log(`👨‍💼 主人: ${config.masterName} (${config.masterUserId})`);
  console.log(`📱 主人電話: ${config.masterPhone}`);
  console.log(`🕐 台灣時間: ${Utils.formatTaiwanTime()}`);
  console.log(`🤖 AI 引擎: ${config.geminiApiKey ? 'Gemini ✅' : '❌'}`);
  console.log('');
  console.log('🎯 核心功能狀態:');
  console.log('  💬 超擬真AI聊天: ✅');
  console.log('  📱 選單互動系統: ✅');
  console.log('  ⏰ 智能提醒系統: ✅');
  console.log('  📞 電話鬧鐘功能: ✅');
  console.log('  ⚖️ 決策管理系統: ✅');
  console.log('  🎬 電影查詢系統: ✅');
  console.log('  ⚠️ 矛盾偵測系統: ✅');
  console.log('  🧠 自我學習系統: ✅');
  console.log('  📊 統計報告系統: ✅');
  console.log('  🏷️ 用戶身份顯示: ✅');
  console.log('  ⚙️ 群組頻率設定: ✅');
  console.log('');
  console.log('💾 記憶體使用情況:');
  const memUsage = process.memoryUsage();
  console.log(`  已使用: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
  console.log(`  總計: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
  console.log('');
  console.log('🎉 系統完全就緒！等待用戶互動...');
  console.log('='.repeat(80) + '\n');
  
  // 發送啟動通知給主人
  setTimeout(async () => {
    try {
      const startupMessage = FlexBuilder.createSystemMessage(
        `🚀 LINE Bot v4.0 已成功啟動！\n\n🕐 啟動時間：${Utils.formatTaiwanTime()}\n📡 伺服器端口：${config.port}\n💾 記憶體：${Math.round(memUsage.heapUsed / 1024 / 1024)}MB\n\n✅ 所有核心功能已就緒\n🎯 等待用戶互動中...`,
        '🚀 系統啟動通知'
      );
      await client.pushMessage(config.masterUserId, startupMessage);
      console.log(`✅ 啟動通知已發送給 ${config.masterName}`);
    } catch (error) {
      console.error('❌ 啟動通知發送失敗:', error);
    }
  }, 2000); // 延遲2秒發送，確保系統完全啟動
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('🔄 收到終止信號，正在關閉服務...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

module.exports = app;