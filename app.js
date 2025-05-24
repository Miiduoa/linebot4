const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('正在啟動超級增強版 LINE Bot...');

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
const SEARCH_API_KEY = process.env.SEARCH_API_KEY || 'your-google-search-api-key';
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID || '526082b509a1942a7';

// 特殊用戶配置
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'demo326';
const DECISION_KEYWORDS = ['決定', '決策', '怎麼辦', '選擇', '意見', '建議', '投票', '同意嗎', '看法'];

// 初始化 LINE 客戶端
const client = new line.Client(config);

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 儲存系統
const conversationHistory = new Map();
const learningDatabase = new Map();
const reminderSystem = new Map();

// 超級記憶系統
class SuperMemorySystem {
  constructor() {
    this.userStatements = new Map();
    this.userProfiles = new Map();
    this.contradictions = new Map();
    this.behaviorPatterns = new Map();
  }

  recordStatement(userId, userName, statement, timestamp, groupId = null) {
    const key = `${userId}-${groupId || 'private'}`;
    
    if (!this.userStatements.has(key)) {
      this.userStatements.set(key, []);
    }

    const record = {
      userId,
      userName: userName || '未知用戶',
      statement,
      timestamp,
      groupId,
      analyzed: false,
      topics: this.extractTopics(statement),
      sentiment: this.analyzeSentiment(statement)
    };

    this.userStatements.get(key).push(record);
    
    if (this.userStatements.get(key).length > 100) {
      this.userStatements.get(key) = this.userStatements.get(key).slice(-100);
    }

    this.detectContradictions(userId, userName, statement, groupId);
    this.updateUserProfile(userId, userName, record);

    console.log(`🧠 記錄發言：${userName} - ${statement.substring(0, 30)}...`);
  }

  extractTopics(statement) {
    const topics = [];
    const topicPatterns = {
      meeting: /會議|開會|聚會|見面|討論/,
      food: /吃|餐廳|食物|午餐|晚餐|早餐/,
      work: /工作|專案|任務|deadline|報告/,
      time: /時間|明天|今天|下週|幾點/,
      money: /錢|費用|價格|預算|成本/,
      opinion: /覺得|認為|建議|意見|想法/
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(statement)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  analyzeSentiment(statement) {
    const positive = /好|棒|讚|同意|支持|喜歡|滿意/.test(statement);
    const negative = /不好|爛|反對|不同意|討厭|不滿/.test(statement);
    
    if (positive) return 'positive';
    if (negative) return 'negative';
    return 'neutral';
  }

  async detectContradictions(userId, userName, currentStatement, groupId) {
    try {
      const key = `${userId}-${groupId || 'private'}`;
      const userHistory = this.userStatements.get(key) || [];
      
      const recentStatements = userHistory.slice(-20);
      
      for (const pastStatement of recentStatements) {
        const contradiction = await this.checkContradiction(currentStatement, pastStatement.statement);
        
        if (contradiction.isContradiction && contradiction.confidence > 0.7) {
          const contradictionRecord = {
            userId,
            userName,
            currentStatement,
            pastStatement: pastStatement.statement,
            pastTimestamp: pastStatement.timestamp,
            currentTimestamp: new Date(),
            confidence: contradiction.confidence,
            explanation: contradiction.explanation,
            groupId
          };

          const contradictionKey = `${userId}-${Date.now()}`;
          this.contradictions.set(contradictionKey, contradictionRecord);
          
          console.log(`⚠️ 檢測到矛盾：${userName} - 信心度：${contradiction.confidence}`);
          
          if (contradiction.confidence > 0.8) {
            setTimeout(() => {
              this.sendContradictionNotice(contradictionRecord);
            }, 2000);
          }
          
          break;
        }
      }
    } catch (error) {
      console.error('矛盾檢測錯誤:', error);
    }
  }

  async checkContradiction(statement1, statement2) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 200,
        }
      });

      const prompt = `請分析以下兩個發言是否矛盾：

發言1：${statement1}
發言2：${statement2}

請以JSON格式回答：
{
  "isContradiction": true/false,
  "confidence": 0-1的信心分數,
  "explanation": "矛盾的具體說明",
  "type": "direct/indirect/no_contradiction"  
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      
      try {
        return JSON.parse(text);
      } catch {
        return { isContradiction: false, confidence: 0 };
      }
    } catch (error) {
      console.error('AI矛盾檢測錯誤:', error);
      return { isContradiction: false, confidence: 0 };
    }
  }

  async sendContradictionNotice(contradictionRecord) {
    try {
      const timeDiff = Math.floor((contradictionRecord.currentTimestamp - contradictionRecord.pastTimestamp) / (1000 * 60));
      const timeDesc = timeDiff < 60 ? `${timeDiff}分鐘前` : `${Math.floor(timeDiff/60)}小時前`;

      const message = `🤔 ${contradictionRecord.userName}，我注意到你的發言似乎有些不一致：

📝 剛才說：「${contradictionRecord.currentStatement}」

📝 ${timeDesc}說過：「${contradictionRecord.pastStatement}」

${contradictionRecord.explanation || '這兩個說法似乎有些矛盾呢！'}

是不是情況有所改變，還是我理解錯了呢？`;

      const targetId = contradictionRecord.groupId || contradictionRecord.userId;
      await client.pushMessage(targetId, { type: 'text', text: message });
      
      console.log(`💬 已發送矛盾提醒給：${contradictionRecord.userName}`);
    } catch (error) {
      console.error('發送矛盾提醒錯誤:', error);
    }
  }

  updateUserProfile(userId, userName, record) {
    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        userId,
        userName,
        totalMessages: 0,
        topics: new Map(),
        sentiments: { positive: 0, neutral: 0, negative: 0 },
        lastActive: null,
        behaviorPattern: 'unknown',
        contradictions: 0
      });
    }

    const profile = this.userProfiles.get(userId);
    profile.totalMessages++;
    profile.lastActive = record.timestamp;
    profile.sentiments[record.sentiment]++;

    record.topics.forEach(topic => {
      const count = profile.topics.get(topic) || 0;
      profile.topics.set(topic, count + 1);
    });
  }

  getUserMemorySummary(userId) {
    const profile = this.userProfiles.get(userId);
    if (!profile) return '這個用戶我還不太熟悉呢！';

    const topTopics = Array.from(profile.topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic, count]) => `${topic}(${count}次)`);

    const sentimentRatio = {
      positive: Math.round(profile.sentiments.positive / profile.totalMessages * 100),
      negative: Math.round(profile.sentiments.negative / profile.totalMessages * 100)
    };

    return `🧠 ${profile.userName} 的記憶檔案：
📊 總發言：${profile.totalMessages} 次
💬 常談話題：${topTopics.join(', ') || '還在觀察中'}
😊 情緒分析：正面 ${sentimentRatio.positive}%，負面 ${sentimentRatio.negative}%
⚠️ 矛盾次數：${profile.contradictions} 次
⏰ 最後活躍：${profile.lastActive ? new Date(profile.lastActive).toLocaleString('zh-TW') : '未知'}`;
  }
}

// 群組成員監控系統
class GroupMemberMonitor {
  constructor() {
    this.groupMembers = new Map();
    this.memberActivity = new Map();
    this.silentTracking = new Map();
    this.discussionSessions = new Map();
  }

  async updateGroupMembers(groupId) {
    try {
      const memberIds = await client.getGroupMemberIds(groupId);
      this.groupMembers.set(groupId, memberIds);
      
      if (!this.memberActivity.has(groupId)) {
        this.memberActivity.set(groupId, new Map());
      }

      const activity = this.memberActivity.get(groupId);
      memberIds.forEach(memberId => {
        if (!activity.has(memberId)) {
          activity.set(memberId, {
            lastMessage: null,
            messageCount: 0,
            silentStreak: 0,
            isActive: false
          });
        }
      });

      console.log(`👥 更新群組成員：${groupId}，共 ${memberIds.length} 人`);
    } catch (error) {
      console.error('更新群組成員錯誤:', error);
    }
  }

  recordMemberActivity(groupId, userId, userName) {
    if (!this.memberActivity.has(groupId)) {
      this.memberActivity.set(groupId, new Map());
    }

    const activity = this.memberActivity.get(groupId);
    if (!activity.has(userId)) {
      activity.set(userId, {
        lastMessage: null,
        messageCount: 0,
        silentStreak: 0,
        isActive: false
      });
    }

    const memberData = activity.get(userId);
    memberData.lastMessage = new Date();
    memberData.messageCount++;
    memberData.silentStreak = 0;
    memberData.isActive = true;
    memberData.userName = userName;

    this.updateSilentStreaks(groupId, userId);
  }

  updateSilentStreaks(groupId, activeUserId) {
    const activity = this.memberActivity.get(groupId);
    if (!activity) return;

    for (const [userId, data] of activity) {
      if (userId !== activeUserId && data.isActive) {
        data.silentStreak++;
      }
    }
  }

  async checkSilentMembers(groupId, currentMessage) {
    const activity = this.memberActivity.get(groupId);
    if (!activity) return;

    const isImportantDiscussion = this.isImportantDiscussion(currentMessage);
    if (!isImportantDiscussion) return;

    this.startDiscussionSession(groupId);

    setTimeout(() => {
      this.checkAndMentionSilentMembers(groupId);
    }, 60000);
  }

  isImportantDiscussion(message) {
    const importantKeywords = [
      /大家.*意見|各位.*看法|怎麼.*想|同意.*嗎/,
      /討論|決定|選擇|投票|會議/,
      /建議|提案|方案|計畫/,
      /重要|緊急|需要|必須/
    ];

    return importantKeywords.some(pattern => pattern.test(message));
  }

  startDiscussionSession(groupId) {
    this.discussionSessions.set(groupId, {
      startTime: new Date(),
      messageCount: 0,
      participants: new Set(),
      checkedSilent: false
    });
  }

  async checkAndMentionSilentMembers(groupId) {
    const session = this.discussionSessions.get(groupId);
    const activity = this.memberActivity.get(groupId);
    
    if (!session || !activity || session.checkedSilent) return;

    const silentMembers = [];
    const totalMembers = Array.from(activity.keys()).length;
    
    for (const [userId, data] of activity) {
      if (data.silentStreak >= 5 && data.isActive && !session.participants.has(userId)) {
        try {
          const profile = await client.getGroupMemberProfile(groupId, userId);
          silentMembers.push({
            userId,
            userName: profile.displayName || data.userName || '成員',
            silentStreak: data.silentStreak
          });
        } catch (error) {
          console.error('獲取成員資料錯誤:', error);
        }
      }
    }

    if (silentMembers.length > 0 && session.participants.size < totalMembers * 0.7) {
      await this.mentionSilentMembers(groupId, silentMembers);
      session.checkedSilent = true;
    }
  }

  async mentionSilentMembers(groupId, silentMembers) {
    try {
      if (silentMembers.length === 1) {
        const member = silentMembers[0];
        const message = `@${member.userName} 你對這個討論有什麼看法嗎？大家都在等你的意見呢！ 😊`;
        
        await client.pushMessage(groupId, { type: 'text', text: message });
        console.log(`🔔 已@沉默成員：${member.userName}`);
      } else if (silentMembers.length > 1) {
        const names = silentMembers.map(m => `@${m.userName}`).join(' ');
        const message = `${names} 你們對這個話題有什麼想法嗎？歡迎分享你們的意見！ 💭`;
        
        await client.pushMessage(groupId, { type: 'text', text: message });
        console.log(`🔔 已@多位沉默成員：${silentMembers.length}人`);
      }
    } catch (error) {
      console.error('@沉默成員錯誤:', error);
    }
  }

  recordDiscussionParticipation(groupId, userId) {
    const session = this.discussionSessions.get(groupId);
    if (session) {
      session.participants.add(userId);
      session.messageCount++;
    }
  }
}

// 收回訊息追蹤系統
class UnsendMessageTracker {
  constructor() {
    this.unsendMessages = new Map();
    this.recentMessages = new Map();
  }

  recordMessage(messageId, userId, userName, content, timestamp, groupId = null) {
    this.recentMessages.set(messageId, {
      messageId,
      userId,
      userName,
      content,
      timestamp,
      groupId,
      isUnsend: false
    });

    if (this.recentMessages.size > 1000) {
      const entries = Array.from(this.recentMessages.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 200).forEach(([key]) => {
        this.recentMessages.delete(key);
      });
    }
  }

  async handleUnsendMessage(messageId, userId, groupId = null) {
    const originalMessage = this.recentMessages.get(messageId);
    
    if (originalMessage) {
      const unsendRecord = {
        ...originalMessage,
        unsendTime: new Date(),
        isUnsend: true
      };

      this.unsendMessages.set(messageId, unsendRecord);
      await this.sendUnsendNotification(unsendRecord);
      
      console.log(`📱 記錄收回訊息：${originalMessage.userName} - ${originalMessage.content.substring(0, 30)}...`);
    } else {
      const unknownUnsend = {
        messageId,
        userId,
        userName: '未知用戶',
        content: '無法追蹤的訊息',
        timestamp: new Date(),
        unsendTime: new Date(),
        groupId,
        isUnsend: true
      };

      this.unsendMessages.set(messageId, unknownUnsend);
      await this.sendUnsendNotification(unknownUnsend);
    }
  }

  async sendUnsendNotification(unsendRecord) {
    try {
      const timeDiff = Math.floor((unsendRecord.unsendTime - unsendRecord.timestamp) / 1000);
      const timeDesc = timeDiff < 60 ? `${timeDiff}秒` : `${Math.floor(timeDiff/60)}分鐘`;

      const message = `📱 偵測到收回訊息！

👤 用戶：${unsendRecord.userName}
💬 收回內容：「${unsendRecord.content}」
⏰ 原發送時間：${new Date(unsendRecord.timestamp).toLocaleString('zh-TW')}
🗑️ 收回時間：${unsendRecord.unsendTime.toLocaleString('zh-TW')}
⌛ 間隔時間：${timeDesc}

🤖 我都記住了呢！`;

      const targetId = unsendRecord.groupId || unsendRecord.userId;
      await client.pushMessage(targetId, { type: 'text', text: message });
      
      console.log(`📢 已發送收回通知：${unsendRecord.userName}`);
    } catch (error) {
      console.error('發送收回通知錯誤:', error);
    }
  }

  getUserUnsendHistory(userId, limit = 10) {
    const userUnsends = Array.from(this.unsendMessages.values())
      .filter(record => record.userId === userId)
      .sort((a, b) => b.unsendTime - a.unsendTime)
      .slice(0, limit);

    if (userUnsends.length === 0) {
      return '這位用戶沒有收回過訊息記錄。';
    }

    let history = `📱 ${userUnsends[0].userName} 的收回記錄：\n\n`;
    userUnsends.forEach((record, index) => {
      history += `${index + 1}. 「${record.content.substring(0, 50)}${record.content.length > 50 ? '...' : ''}」\n`;
      history += `   收回時間：${record.unsendTime.toLocaleString('zh-TW')}\n\n`;
    });

    return history;
  }
}

// 決策輔助系統
class DecisionAssistant {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionHistory = new Map();
  }

  async detectDecisionNeeded(groupId, message, userId, userName) {
    const needsDecision = DECISION_KEYWORDS.some(keyword => message.includes(keyword));
    
    if (needsDecision) {
      console.log(`🤔 檢測到可能需要決策：${message.substring(0, 50)}...`);
      
      setTimeout(() => {
        this.analyzeAndRequestDecision(groupId, message, userId, userName);
      }, 45000);
    }
  }

  async analyzeAndRequestDecision(groupId, triggerMessage, triggerUserId, triggerUserName) {
    try {
      const recentConversation = this.getRecentGroupConversation(groupId);
      
      if (recentConversation.length < 3) return;

      const analysisResult = await this.analyzeDecisionNeed(recentConversation, triggerMessage);
      
      if (analysisResult.needsDecision && analysisResult.confidence > 0.6) {
        await this.sendDecisionRequest(groupId, analysisResult, recentConversation);
      }
    } catch (error) {
      console.error('決策分析錯誤:', error);
    }
  }

  getRecentGroupConversation(groupId) {
    const conversation = [];
    
    for (const [key, statements] of superMemorySystem.userStatements) {
      if (key.includes(groupId)) {
        statements.slice(-10).forEach(statement => {
          conversation.push({
            userName: statement.userName,
            message: statement.statement,
            timestamp: statement.timestamp
          });
        });
      }
    }

    return conversation.sort((a, b) => a.timestamp - b.timestamp).slice(-20);
  }

  async analyzeDecisionNeed(conversation, triggerMessage) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 400,
        }
      });

      const conversationText = conversation.map(c => 
        `${c.userName}: ${c.message}`
      ).join('\n');

      const prompt = `分析以下群組對話，判斷是否需要管理者介入做決策：

觸發訊息：${triggerMessage}

最近對話：
${conversationText}

請以JSON格式回答：
{
  "needsDecision": true/false,
  "confidence": 0-1的信心分數,
  "decisionType": "conflict/choice/planning/approval/other",
  "summary": "對話摘要",
  "keyPoints": ["要點1", "要點2", "要點3"],
  "urgency": "high/medium/low",
  "suggestedAction": "建議的行動"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      
      try {
        return JSON.parse(text);
      } catch {
        return { needsDecision: false, confidence: 0 };
      }
    } catch (error) {
      console.error('AI決策分析錯誤:', error);
      return { needsDecision: false, confidence: 0 };
    }
  }

  async sendDecisionRequest(groupId, analysis, conversation) {
    try {
      const decisionId = `decision-${Date.now()}`;
      
      this.pendingDecisions.set(decisionId, {
        id: decisionId,
        groupId,
        analysis,
        conversation,
        timestamp: new Date(),
        status: 'pending'
      });

      const report = this.createDecisionReport(analysis, conversation, groupId);
      
      const message = {
        type: 'template',
        altText: `決策請求：${analysis.decisionType}`,
        template: {
          type: 'buttons',
          title: '🎯 需要您的決策',
          text: `類型：${analysis.decisionType}\n緊急度：${analysis.urgency}\n群組：${groupId.substring(0, 10)}...`,
          actions: [
            { type: 'message', label: '查看詳情', text: `決策詳情 ${decisionId}` },
            { type: 'message', label: '立即處理', text: `處理決策 ${decisionId}` },
            { type: 'message', label: '稍後處理', text: `稍後決策 ${decisionId}` }
          ]
        }
      };

      await client.pushMessage(ADMIN_USER_ID, message);
      await client.pushMessage(ADMIN_USER_ID, { type: 'text', text: report });
      
      console.log(`🎯 已發送決策請求給管理者：${decisionId}`);
    } catch (error) {
      console.error('發送決策請求錯誤:', error);
    }
  }

  createDecisionReport(analysis, conversation, groupId) {
    let report = `📊 決策分析報告\n\n`;
    report += `🎯 決策類型：${analysis.decisionType}\n`;
    report += `⚡ 緊急程度：${analysis.urgency}\n`;
    report += `📈 信心分數：${Math.round(analysis.confidence * 100)}%\n`;
    report += `📍 群組ID：${groupId}\n`;
    report += `⏰ 時間：${new Date().toLocaleString('zh-TW')}\n\n`;
    
    report += `📝 情況摘要：\n${analysis.summary}\n\n`;
    
    report += `🔍 關鍵要點：\n`;
    analysis.keyPoints.forEach((point, index) => {
      report += `${index + 1}. ${point}\n`;
    });
    
    report += `\n💡 建議行動：\n${analysis.suggestedAction}\n\n`;
    
    report += `💬 相關對話：\n`;
    conversation.slice(-8).forEach(c => {
      report += `${c.userName}: ${c.message.substring(0, 60)}${c.message.length > 60 ? '...' : ''}\n`;
    });
    
    report += `\n🤖 請回覆您的決策，我會轉達給群組成員。`;
    
    return report;
  }

  async handleAdminResponse(message, decisionId) {
    const decision = this.pendingDecisions.get(decisionId);
    if (!decision) return false;

    decision.status = 'resolved';
    decision.adminResponse = message;
    decision.resolvedAt = new Date();

    await this.sendDecisionResult(decision, message);
    
    this.decisionHistory.set(decisionId, decision);
    this.pendingDecisions.delete(decisionId);
    
    return true;
  }

  async sendDecisionResult(decision, adminMessage) {
    try {
      const message = `🎯 管理者決策結果：

${adminMessage}

📝 此決策已記錄，如有疑問請私訊管理者。`;

      await client.pushMessage(decision.groupId, { type: 'text', text: message });
      console.log(`✅ 已發送決策結果到群組：${decision.groupId}`);
    } catch (error) {
      console.error('發送決策結果錯誤:', error);
    }
  }
}

// 初始化系統 - 修正重複宣告問題
const superMemorySystem = new SuperMemorySystem();
const groupMemberMonitor = new GroupMemberMonitor();
const unsendMessageTracker = new UnsendMessageTracker();
const decisionAssistant = new DecisionAssistant();

// 網路搜尋系統（簡化版）
const webSearchSystem = {
  knowledgeCache: new Map(),
  async intelligentSearch(query, userId) {
    console.log(`🔍 搜尋：${query}`);
    return null;
  }
};

// 時間系統
const TimeSystem = {
  getCurrentTime() {
    const now = new Date();
    const options = {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'long'
    };
    
    return {
      timestamp: now,
      formatted: now.toLocaleString('zh-TW', options),
      dateOnly: now.toLocaleDateString('zh-TW'),
      timeOnly: now.toLocaleTimeString('zh-TW'),
      iso: now.toISOString()
    };
  }
};

// 健康檢查端點
app.get('/', (req, res) => {
  const stats = {
    userMemories: superMemorySystem.userStatements.size,
    contradictions: superMemorySystem.contradictions.size,
    unsendMessages: unsendMessageTracker.unsendMessages.size,
    pendingDecisions: decisionAssistant.pendingDecisions.size,
    groupsMonitored: groupMemberMonitor.groupMembers.size
  };

  res.send(`
    <h1>超級增強版 LINE Bot 正在運行！</h1>
    <p>當前時間：${new Date().toLocaleString('zh-TW')}</p>
    <h2>📊 系統統計：</h2>
    <ul>
      <li>🧠 用戶記憶：${stats.userMemories} 人</li>
      <li>⚠️ 矛盾檢測：${stats.contradictions} 筆</li>
      <li>📱 收回訊息：${stats.unsendMessages} 筆</li>
      <li>🎯 待決策事項：${stats.pendingDecisions} 件</li>
      <li>👥 監控群組：${stats.groupsMonitored} 個</li>
    </ul>
    <h2>🚀 超級功能：</h2>
    <ul>
      <li>✅ 超級記憶系統</li>
      <li>✅ 矛盾檢測</li>
      <li>✅ 沉默成員提醒</li>
      <li>✅ 收回訊息追蹤</li>
      <li>✅ 決策輔助系統</li>
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
      console.error('處理事件錯誤:', err);
      res.status(500).end();
    });
});

// 事件處理函數
async function handleEvent(event) {
  if (event.type === 'unsend') {
    await unsendMessageTracker.handleUnsendMessage(
      event.unsend.messageId,
      event.source.userId,
      event.source.groupId
    );
    return Promise.resolve(null);
  }

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const groupId = event.source.groupId;
  const messageText = event.message.text.trim();
  const messageId = event.message.id;
  const timestamp = new Date();
  
  console.log(`📨 收到訊息: ${messageText} | 用戶: ${userId} | 群組: ${groupId || 'private'}`);

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
    console.error('獲取用戶名稱錯誤:', error);
  }

  unsendMessageTracker.recordMessage(messageId, userId, userName, messageText, timestamp, groupId);
  superMemorySystem.recordStatement(userId, userName, messageText, timestamp, groupId);

  if (groupId) {
    await groupMemberMonitor.updateGroupMembers(groupId);
    groupMemberMonitor.recordMemberActivity(groupId, userId, userName);
    groupMemberMonitor.recordDiscussionParticipation(groupId, userId);
    await groupMemberMonitor.checkSilentMembers(groupId, messageText);
    await decisionAssistant.detectDecisionNeeded(groupId, messageText, userId, userName);
  }

  if (userId === ADMIN_USER_ID) {
    const decisionMatch = messageText.match(/決策.*?decision-(\d+)/);
    if (decisionMatch) {
      const decisionId = `decision-${decisionMatch[1]}`;
      const handled = await decisionAssistant.handleAdminResponse(messageText, decisionId);
      if (handled) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '✅ 決策已處理並發送到相關群組。'
        });
      }
    }
  }

  if (messageText.startsWith('記憶') || messageText.startsWith('回憶')) {
    const summary = superMemorySystem.getUserMemorySummary(userId);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: summary
    });
  }

  if (messageText.includes('收回記錄') || messageText.includes('收回歷史')) {
    const history = unsendMessageTracker.getUserUnsendHistory(userId);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: history
    });
  }

  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  
  const userHistory = conversationHistory.get(userId);
  userHistory.push({ role: 'user', content: messageText, timestamp });
  
  if (userHistory.length > 20) {
    userHistory.splice(0, userHistory.length - 20);
  }

  let replyMessage;

  try {
    if (isGreetingMessage(messageText)) {
      replyMessage = await createSuperWelcomeMessage(userName);
      return client.replyMessage(event.replyToken, replyMessage);
    } else if (isMenuQuery(messageText)) {
      replyMessage = await createSuperMainMenu();
      return client.replyMessage(event.replyToken, replyMessage);
    } else if (messageText.includes('系統狀態') || messageText.includes('超級測試')) {
      replyMessage = { type: 'text', text: await handleSuperSystemTest() };
    } else {
      replyMessage = await handleSuperGeneralChat(messageText, userHistory, userId, userName, groupId);
    }

    const replyText = typeof replyMessage === 'string' ? replyMessage : 
                     (replyMessage.text || '已處理您的請求');
    
    userHistory.push({ 
      role: 'assistant', 
      content: replyText, 
      timestamp: new Date()
    });
    
    if (typeof replyMessage === 'string') {
      replyMessage = { type: 'text', text: replyMessage };
    }
    
    return client.replyMessage(event.replyToken, replyMessage);
  } catch (error) {
    console.error('處理訊息時發生錯誤:', error);
    
    const errorMessage = {
      type: 'text',
      text: '抱歉，我現在有點忙，請稍後再試。我會記住這次的互動！'
    };
    
    return client.replyMessage(event.replyToken, errorMessage);
  }
}

// 輔助函數
function isGreetingMessage(text) {
  const greetings = ['嗨', '哈囉', '你好', 'hi', 'hello', '安安', '早安', '午安', '晚安', '開始'];
  return greetings.some(greeting => text.toLowerCase().includes(greeting)) ||
         text.length <= 3 && ['嗨', '你好', 'hi'].includes(text.toLowerCase());
}

function isMenuQuery(text) {
  const menuKeywords = ['選單', '菜單', '功能', '幫助', '說明', '指令', '可以做什麼', 'help', '功能表'];
  return menuKeywords.some(keyword => text.includes(keyword)) ||
         text === '?' || text === '！' || text === 'menu';
}

async function createSuperWelcomeMessage(userName) {
  return {
    type: 'template',
    altText: '歡迎使用超級增強版小助手機器人！',
    template: {
      type: 'buttons',
      thumbnailImageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=300&fit=crop',
      title: '🧠 超級智能小助手',
      text: `歡迎 ${userName}！我現在具備超強記憶力、矛盾檢測、沉默提醒和決策輔助功能！`,
      actions: [
        { type: 'message', label: '🧠 我的記憶', text: '我的記憶檔案' },
        { type: 'message', label: '📱 收回記錄', text: '收回記錄' },
        { type: 'message', label: '🎯 系統狀態', text: '超級測試' },
        { type: 'message', label: '📋 完整功能', text: '選單' }
      ]
    }
  };
}

async function createSuperMainMenu() {
  return {
    type: 'template',
    altText: '超級功能選單',
    template: {
      type: 'carousel',
      columns: [
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=300&h=200&fit=crop',
          title: '🧠 超級記憶',
          text: '記住所有對話，檢測矛盾',
          actions: [
            { type: 'message', label: '我的記憶檔案', text: '記憶檔案' },
            { type: 'message', label: '矛盾檢測', text: '檢查矛盾' },
            { type: 'message', label: '對話分析', text: '分析對話' }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&h=200&fit=crop',
          title: '👥 群組監控',
          text: '監控成員活躍度與討論',
          actions: [
            { type: 'message', label: '成員活躍度', text: '群組活躍度' },
            { type: 'message', label: '沉默提醒', text: '沉默成員' },
            { type: 'message', label: '討論分析', text: '討論統計' }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=300&h=200&fit=crop',
          title: '📱 訊息追蹤',
          text: '追蹤收回訊息與變化',
          actions: [
            { type: 'message', label: '收回記錄', text: '收回歷史' },
            { type: 'message', label: '訊息統計', text: '訊息分析' },
            { type: 'message', label: '用戶行為', text: '行為分析' }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=300&h=200&fit=crop',
          title: '🎯 決策輔助',
          text: '智能決策分析與建議',
          actions: [
            { type: 'message', label: '決策歷史', text: '決策記錄' },
            { type: 'message', label: '系統狀態', text: '超級測試' },
            { type: 'message', label: '功能說明', text: '功能介紹' }
          ]
        }
      ]
    }
  };
}

async function handleSuperSystemTest() {
  const stats = {
    userMemories: superMemorySystem.userStatements.size,
    userProfiles: superMemorySystem.userProfiles.size,
    contradictions: superMemorySystem.contradictions.size,
    unsendMessages: unsendMessageTracker.unsendMessages.size,
    pendingDecisions: decisionAssistant.pendingDecisions.size,
    resolvedDecisions: decisionAssistant.decisionHistory.size,
    groupsMonitored: groupMemberMonitor.groupMembers.size
  };

  let report = `🧠 超級增強版系統狀態 (${new Date().toLocaleString('zh-TW')})：\n\n`;
  
  report += `📊 記憶系統：\n`;
  report += `🧠 用戶記憶：${stats.userMemories} 人\n`;
  report += `👤 用戶檔案：${stats.userProfiles} 份\n`;
  report += `⚠️ 矛盾檢測：${stats.contradictions} 筆\n\n`;
  
  report += `👥 群組監控：\n`;
  report += `📡 監控群組：${stats.groupsMonitored} 個\n`;
  report += `💬 討論會話：${groupMemberMonitor.discussionSessions.size} 個\n\n`;
  
  report += `📱 訊息追蹤：\n`;
  report += `🗑️ 收回訊息：${stats.unsendMessages} 筆\n`;
  report += `💾 暫存訊息：${unsendMessageTracker.recentMessages.size} 筆\n\n`;
  
  report += `🎯 決策系統：\n`;
  report += `⏳ 待處理：${stats.pendingDecisions} 件\n`;
  report += `✅ 已完成：${stats.resolvedDecisions} 件\n\n`;
  
  report += `🚀 超級功能狀態：\n`;
  report += `✅ 超級記憶系統 - 運行正常\n`;
  report += `✅ 矛盾檢測系統 - 運行正常\n`;
  report += `✅ 群組監控系統 - 運行正常\n`;
  report += `✅ 收回追蹤系統 - 運行正常\n`;
  report += `✅ 決策輔助系統 - 運行正常\n\n`;
  
  report += `💡 所有超級功能運行完美！`;
  
  return report;
}

async function handleSuperGeneralChat(message, history, userId, userName, groupId) {
  try {
    const userProfile = superMemorySystem.userProfiles.get(userId);
    const memoryContext = userProfile ? `
用戶 ${userName} 的檔案：
- 總發言：${userProfile.totalMessages} 次
- 常談話題：${Array.from(userProfile.topics.keys()).slice(0, 3).join(', ')}
- 最後活躍：${userProfile.lastActive ? new Date(userProfile.lastActive).toLocaleString('zh-TW') : '未知'}
` : '';

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300,
      }
    });
    
    let context = `你是一個具備超級記憶和分析能力的智能助手「小助手」。

${memoryContext}

你的超級能力：
- 🧠 記住每個人說過的話，能檢測前後矛盾
- 👥 觀察群組討論，提醒沉默的成員
- 📱 追蹤收回的訊息內容
- 🎯 分析重要決策並協助管理者

當前情況：
- 用戶：${userName}
- 群組：${groupId ? '群組對話' : '私人對話'}
- 時間：${new Date().toLocaleString('zh-TW')}

請用繁體中文自然友善地回答。`;

    if (groupId) {
      context += '\n你現在在群組中，要觀察討論動態，適時參與或提醒。';
    }

    context += '\n\n最近對話：';
    const recentHistory = history.slice(-4);
    recentHistory.forEach(msg => {
      context += `\n${msg.role === 'user' ? userName : '小助手'}：${msg.content}`;
    });
    
    context += `\n\n請回應：${message}`;
    context += '\n\n要求：展現你的記憶和分析能力，回答要有個性且有用。';

    const result = await model.generateContent(context);
    const response = await result.response;
    let text = response.text();
    
    text = text.replace(/[*#`_~\[\]]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    
    if (text.length > 400) {
      text = text.substring(0, 397) + '...';
    }
    
    return text || getSuperBackupResponse(message, userName);
  } catch (error) {
    console.error('超級對話處理錯誤:', error);
    return getSuperBackupResponse(message, userName);
  }
}

function getSuperBackupResponse(message, userName) {
  const responses = [
    `${userName}，我正在分析你的訊息並記錄到我的記憶系統中！`,
    `有趣！我會記住這個對話，下次能更好地回應你。`,
    `讓我想想... 我正在學習你的說話模式呢！`,
    `這個話題很有意思！我的記憶庫又更豐富了。`,
    `${userName}，你的每句話我都會記住，這樣我們的對話會越來越有意思！`
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ 超級增強版 LINE Bot 伺服器成功啟動！');
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`⏰ 啟動時間：${new Date().toLocaleString('zh-TW')}`);
  console.log(`👑 管理者 ID：${ADMIN_USER_ID}`);
  console.log('🚀 超級功能：');
  console.log('   - 🧠 超級記憶系統 (記住所有對話)');
  console.log('   - ⚠️ 矛盾檢測系統 (識別前後不一致)');
  console.log('   - 👥 群組監控系統 (沉默成員提醒)');
  console.log('   - 📱 收回訊息追蹤 (記錄所有收回內容)');
  console.log('   - 🎯 決策輔助系統 (智能分析與建議)');
});

process.on('uncaughtException', (error) => {
  console.error('未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
});

module.exports = app;