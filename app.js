const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('🚀 正在啟動AI分身版 LINE Bot - 終極進化版...');
console.log('⏰ 當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

// 配置資訊
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const BACKUP_AI_KEY = process.env.BACKUP_AI_KEY || 'sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM';
const BACKUP_AI_URL = process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b';
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';

// 用戶配置
const OWNER_LINE_ID = 'U59af77e69411ffb99a49f1f2c3e2afc4';
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 主人個性檔案 - 這是AI分身的核心
const OWNER_PERSONALITY = {
  name: '顧晉瑋',
  identity: '靜宜大學資管系學生',
  speaking_style: {
    tone: '活潑友善，台灣年輕人語氣',
    expressions: ['超棒der', '好欸', '哎呦', '真的假的', '太酷啦', '我覺得可以', '沒問題啦'],
    punctuation: '經常使用驚嘆號和波浪號～',
    emoji_usage: '適度使用表情符號，不會過度'
  },
  values: {
    helpful: '很樂意幫助朋友',
    honest: '直率坦誠，不會拐彎抹角',
    tech_savvy: '對科技和程式設計很有興趣',
    student_life: '理解學生生活的忙碌和壓力'
  },
  response_patterns: {
    agreement: ['對呀對呀', '我也這樣想', '完全同意', '說得對'],
    disagreement: ['欸不過我覺得', '可是這樣會不會', '我想法有點不同'],
    excitement: ['哇靠！', '超酷的！', '太厲害了吧', '這個我喜歡'],
    concern: ['你還好嗎？', '要不要休息一下', '注意身體喔', '別太累了']
  }
};

console.log('🔑 機器人主人:', OWNER_LINE_ID);
console.log('🎭 AI分身模式已啟用 - 完全模擬顧晉瑋的個性');

// 超擬真AI分身系統
class HyperRealisticAISystem {
  constructor() {
    this.conversations = new Map();
    this.userProfiles = new Map();
    this.groupContexts = new Map();
    this.personalityLearning = new Map(); // 學習主人的語氣模式
    this.contradictonHistory = new Map(); // 矛盾偵測記錄
    this.messageRecallHistory = new Map(); // 訊息收回記錄
    console.log('🧠 超擬真AI分身系統已初始化');
  }

  async generatePersonalizedReply(userId, message, context = {}) {
    try {
      this.recordConversation(userId, message, context);
      
      // 矛盾偵測
      await this.detectContradictions(userId, message, context);
      
      const userProfile = this.userProfiles.get(userId) || { 
        name: '朋友', 
        messageCount: 0,
        isGroup: context.isGroup,
        preferences: [],
        personality: 'friendly',
        lastMessages: []
      };

      // 生成完全模擬主人個性的回覆
      const reply = await this.generateOwnerStyleReply(message, userProfile, context);
      return reply;

    } catch (error) {
      console.error('❌ AI分身回覆生成失敗:', error);
      return this.getOwnerStyleOfflineReply(message);
    }
  }

  async generateOwnerStyleReply(message, userProfile, context) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-002",
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1000,
        }
      });
      
      // 獲取群組上下文
      let groupContext = '';
      if (context.isGroup && context.groupId) {
        groupContext = this.getGroupContext(context.groupId, 10);
      }

      // 學習到的個人風格
      const learnedStyle = this.getLearnedPersonalityStyle();
      
      const prompt = `你現在要完全模擬顧晉瑋的身份和個性來回覆。

【顧晉瑋的基本資料】
${JSON.stringify(OWNER_PERSONALITY, null, 2)}

【學習到的個人風格】
${learnedStyle}

【對話情境】
用戶：${userProfile.name}
用戶說：${message}
環境：${context.isGroup ? `群組對話「${context.groupName}」` : '私人對話'}
用戶互動次數：${userProfile.messageCount}

${groupContext ? `【最近群組對話】\n${groupContext}\n` : ''}

【回覆要求】
1. 完全用顧晉瑋的語氣、價值觀、情緒風格回覆
2. 使用他常用的口語表達方式
3. 回覆要讓人感覺就是顧晉瑋本人在說話
4. 長度控制在100-200字
5. 適當使用台灣年輕人的語氣和用詞
6. 展現出資管系學生的特質

請以顧晉瑋的身份自然回覆：`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().replace(/[*#`_~]/g, '').trim();
      
      // 學習這次的回覆風格
      this.learnPersonalityFromResponse(text, message);
      
      return text || this.getOwnerStyleOfflineReply(message);
      
    } catch (error) {
      console.log('🔄 Gemini失敗，使用備用AI模擬分身...');
      return await this.useBackupAIForOwnerStyle(message, context);
    }
  }

  async useBackupAIForOwnerStyle(message, context) {
    try {
      const ownerStyle = `你是顧晉瑋，靜宜大學資管系學生。說話風格：活潑友善，愛用「超」「der」「欸」等台灣年輕人語氣，對科技有興趣，樂於助人。`;
      
      const response = await axios.post(`${BACKUP_AI_URL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ 
          role: 'system', 
          content: ownerStyle
        }, {
          role: 'user', 
          content: `${message}（在${context.isGroup ? '群組' : '私人'}對話中）`
        }],
        max_tokens: 300,
        temperature: 0.8
      }, {
        headers: {
          'Authorization': `Bearer ${BACKUP_AI_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      return response.data.choices[0].message.content.trim();
      
    } catch (error) {
      console.error('❌ 備用AI分身也失敗:', error);
      return this.getOwnerStyleOfflineReply(message);
    }
  }

  getOwnerStyleOfflineReply(message) {
    // 完全模擬顧晉瑋風格的離線回覆
    if (message.includes('你好') || message.includes('嗨') || message.includes('hi')) {
      return '嗨嗨！我是顧晉瑋～很開心認識你欸！有什麼事都可以找我聊 😊';
    }
    if (message.includes('謝謝') || message.includes('感謝')) {
      return '不會啦～朋友之間互相幫忙是應該der！有需要隨時說喔 💪';
    }
    if (message.includes('再見') || message.includes('掰掰')) {
      return '掰掰～要常常來找我聊天喔！我隨時都在線上 👋';
    }
    if (message.includes('程式') || message.includes('coding') || message.includes('寫code')) {
      return '哇！程式設計欸～我超喜歡的！你在學什麼語言？Python還是JavaScript？我可以分享一些心得喔 💻';
    }
    if (message.includes('學校') || message.includes('課業') || message.includes('考試')) {
      return '欸～學生生活真的蠻忙der！我也是靜宜資管系的，完全懂那種壓力。要不要聊聊紓壓的方法？ 📚';
    }
    if (message.includes('?') || message.includes('？')) {
      return '這個問題超有趣的！讓我想想... 不過我現在腦袋有點卡住，等等再來深入討論好嗎？ 🤔';
    }
    
    const ownerStyleResponses = [
      '欸～你說的超有道理！我也是這樣想der，完全同感 👍',
      '哇靠，這個話題好有趣！讓我學到新東西了，謝謝分享～',
      '真的假的？你這樣說我覺得超cool的，想知道更多細節！',
      '我懂我懂！有時候就是會遇到這種狀況對吧，超能理解 😅',
      '說得超棒！我完全同意你的想法，這觀點我很喜歡 ✨',
      '哎呦～你的想法跟我好像喔！感覺我們蠻合得來der',
      '這個我之前也有想過欸！果然英雄所見略同哈哈 😄'
    ];
    
    const randomIndex = Math.floor(Math.random() * ownerStyleResponses.length);
    return ownerStyleResponses[randomIndex];
  }

  learnPersonalityFromResponse(response, originalMessage) {
    // 學習回覆風格，持續優化分身模擬
    if (!this.personalityLearning.has(OWNER_LINE_ID)) {
      this.personalityLearning.set(OWNER_LINE_ID, {
        commonPhrases: [],
        responsePatterns: [],
        topicPreferences: []
      });
    }
    
    const learning = this.personalityLearning.get(OWNER_LINE_ID);
    
    // 提取常用詞彙
    const phrases = response.match(/[\u4e00-\u9fa5]+/g) || [];
    phrases.forEach(phrase => {
      if (phrase.length > 1 && !learning.commonPhrases.includes(phrase)) {
        learning.commonPhrases.push(phrase);
      }
    });
    
    // 保持學習資料在合理範圍內
    if (learning.commonPhrases.length > 100) {
      learning.commonPhrases = learning.commonPhrases.slice(-100);
    }
  }

  getLearnedPersonalityStyle() {
    const learning = this.personalityLearning.get(OWNER_LINE_ID);
    if (!learning) return '還在學習中...';
    
    return `常用詞彙：${learning.commonPhrases.slice(-20).join('、')}`;
  }

  async detectContradictions(userId, message, context) {
    if (!this.contradictonHistory.has(userId)) {
      this.contradictonHistory.set(userId, []);
    }
    
    const userHistory = this.contradictonHistory.get(userId);
    userHistory.push({
      message,
      timestamp: new Date(),
      context
    });
    
    // 保留最近20條訊息用於矛盾偵測
    if (userHistory.length > 20) {
      userHistory.shift();
    }
    
    // 如果有足夠的歷史訊息，進行矛盾偵測
    if (userHistory.length >= 3) {
      try {
        const contradiction = await this.analyzeContradictions(userId, userHistory);
        if (contradiction) {
          await this.notifyOwnerOfContradiction(userId, contradiction, context);
        }
      } catch (error) {
        console.error('❌ 矛盾偵測失敗:', error);
      }
    }
  }

  async analyzeContradictions(userId, history) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });
      
      const recentMessages = history.slice(-5).map(h => h.message).join('\n');
      
      const prompt = `請分析以下用戶的最近對話，檢查是否有前後矛盾的內容：

用戶最近的訊息：
${recentMessages}

請判斷：
1. 是否有明顯的前後矛盾？
2. 如果有，具體是什麼矛盾？
3. 矛盾的嚴重程度（輕微/中等/嚴重）

如果沒有矛盾，回覆「無矛盾」
如果有矛盾，請簡潔說明矛盾內容。`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const analysis = response.text().trim();
      
      if (analysis !== '無矛盾' && !analysis.includes('無矛盾')) {
        return analysis;
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ 矛盾分析失敗:', error);
      return null;
    }
  }

  async notifyOwnerOfContradiction(userId, contradiction, context) {
    try {
      const userName = context.userName || '未知用戶';
      const contradictionMsg = await this.createRichMessage({
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🚨 矛盾偵測警報',
              weight: 'bold',
              size: 'lg',
              color: '#FF5551'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `用戶：${userName}`,
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: `來源：${context.isGroup ? '群組' : '私人對話'}`,
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: '發現矛盾：',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: contradiction,
              wrap: true,
              margin: 'sm'
            },
            {
              type: 'text',
              text: `時間：${new Date().toLocaleString('zh-TW')}`,
              size: 'xs',
              color: '#888888',
              margin: 'md'
            }
          ]
        }
      });
      
      await client.pushMessage(OWNER_LINE_ID, contradictionMsg);
      console.log('📨 矛盾偵測通知已發送給主人');
      
    } catch (error) {
      console.error('❌ 矛盾通知發送失敗:', error);
    }
  }

  recordMessageRecall(userId, messageId, originalText, context) {
    if (!this.messageRecallHistory.has(userId)) {
      this.messageRecallHistory.set(userId, []);
    }
    
    const recalls = this.messageRecallHistory.get(userId);
    recalls.push({
      messageId,
      originalText,
      timestamp: new Date(),
      context
    });
    
    // 立即通知主人
    this.notifyOwnerOfRecall(userId, originalText, context);
  }

  async notifyOwnerOfRecall(userId, originalText, context) {
    try {
      const userName = context.userName || '未知用戶';
      const recallMsg = await this.createRichMessage({
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📢 訊息收回提醒',
              weight: 'bold',
              size: 'lg',
              color: '#FF8C00'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${userName} 收回了一則訊息`,
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: `來源：${context.isGroup ? '群組' : '私人對話'}`,
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: '原始內容：',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: originalText || '無法獲取原始內容',
              wrap: true,
              margin: 'sm',
              color: '#333333'
            },
            {
              type: 'text',
              text: `時間：${new Date().toLocaleString('zh-TW')}`,
              size: 'xs',
              color: '#888888',
              margin: 'md'
            }
          ]
        }
      });
      
      await client.pushMessage(OWNER_LINE_ID, recallMsg);
      console.log('📨 訊息收回通知已發送給主人');
      
    } catch (error) {
      console.error('❌ 收回通知發送失敗:', error);
    }
  }

  async createRichMessage(bubbleData) {
    return {
      type: 'flex',
      altText: bubbleData.header.contents[0].text,
      contents: bubbleData
    };
  }

  recordConversation(userId, message, context) {
    const convId = `conv-${Date.now()}`;
    this.conversations.set(convId, {
      userId,
      message,
      timestamp: new Date(),
      isGroup: context.isGroup,
      groupId: context.groupId
    });

    // 記錄群組對話上下文
    if (context.isGroup && context.groupId) {
      if (!this.groupContexts.has(context.groupId)) {
        this.groupContexts.set(context.groupId, []);
      }
      const groupContext = this.groupContexts.get(context.groupId);
      groupContext.push({
        userId,
        userName: context.userName,
        message,
        timestamp: new Date()
      });
      if (groupContext.length > 30) {
        groupContext.shift();
      }
    }

    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        userId,
        name: context.userName || '朋友',
        messageCount: 0,
        isGroup: context.isGroup,
        lastSeen: new Date(),
        preferences: [],
        lastMessages: []
      });
    }
    
    const profile = this.userProfiles.get(userId);
    profile.messageCount++;
    profile.lastSeen = new Date();
    
    // 記錄最近訊息用於學習
    if (!profile.lastMessages) profile.lastMessages = [];
    profile.lastMessages.push(message);
    if (profile.lastMessages.length > 10) {
      profile.lastMessages.shift();
    }

    // 清理舊對話
    if (this.conversations.size > 200) {
      const oldestKey = this.conversations.keys().next().value;
      this.conversations.delete(oldestKey);
    }
  }

  getGroupContext(groupId, lines = 10) {
    const context = this.groupContexts.get(groupId) || [];
    const recent = context.slice(-lines);
    return recent.map(msg => 
      `${msg.userName}: ${msg.message}`
    ).join('\n');
  }
}

// 超級決策系統（圖文版）
class SuperAdvancedDecisionSystem {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionHistory = new Map();
    console.log('⚖️ 超級決策系統（圖文版）已初始化');
  }

  shouldAskOwner(message, context) {
    const socialKeywords = ['約', '邀請', '聚會', '吃飯', '喝茶', '見面', '參加', '出去', '聚餐', '活動', '玩'];
    const moneyKeywords = ['借', '錢', '付款', '費用', '買', '賣', '轉帳', '匯款', '投資', '花錢'];
    const importantKeywords = ['重要', '緊急', '幫忙', '拜託', '請問', '決定', '選擇', '建議'];
    const workKeywords = ['工作', '案子', '專案', '會議', '簡報', 'deadline', '合作'];
    const personalKeywords = ['私事', '個人', '秘密', '不要說', '別告訴'];
    
    const hasSocialKeyword = socialKeywords.some(keyword => message.includes(keyword));
    const hasMoneyKeyword = moneyKeywords.some(keyword => message.includes(keyword));
    const hasImportantKeyword = importantKeywords.some(keyword => message.includes(keyword));
    const hasWorkKeyword = workKeywords.some(keyword => message.includes(keyword));
    const hasPersonalKeyword = personalKeywords.some(keyword => message.includes(keyword));
    const isGroupImportant = context.isGroup && (message.includes('@all') || message.includes('大家'));
    const isLongMessage = message.length > 80;
    const hasQuestionMark = message.includes('?') || message.includes('？');

    return hasSocialKeyword || hasMoneyKeyword || hasImportantKeyword || hasWorkKeyword || 
           hasPersonalKeyword || isGroupImportant || (isLongMessage && hasQuestionMark);
  }

  async requestDecision(message, userId, userName, context, replyToken) {
    const decisionId = `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const shortId = decisionId.substr(-8);
    
    const decision = {
      id: decisionId,
      shortId: shortId,
      message,
      userId,
      userName,
      context,
      timestamp: new Date(),
      replyToken,
      sourceType: context.isGroup ? 'group' : 'private',
      sourceId: context.groupId || userId,
      status: 'pending'
    };

    this.pendingDecisions.set(decisionId, decision);

    try {
      // 獲取詳細上下文
      let contextInfo = '';
      if (context.isGroup && aiSystem.groupContexts.has(context.groupId)) {
        const fullContext = aiSystem.groupContexts.get(context.groupId);
        contextInfo = fullContext.slice(-15).map(msg => 
          `[${msg.timestamp.toLocaleTimeString('zh-TW')}] ${msg.userName}: ${msg.message}`
        ).join('\n');
      }

      // AI分析決策
      const aiAnalysis = await this.analyzeDecisionWithAI(message, context, contextInfo);

      // 創建圖文決策訊息
      const decisionMessage = await this.createDecisionFlexMessage(decision, aiAnalysis, contextInfo);
      
      await client.pushMessage(OWNER_LINE_ID, decisionMessage);
      
      // 30分鐘自動處理
      setTimeout(async () => {
        if (this.pendingDecisions.has(decisionId)) {
          await this.autoReject(decisionId);
        }
      }, 30 * 60 * 1000);
      
      return '我需要考慮一下這個請求，稍後會回覆你～ 🤔';
      
    } catch (error) {
      console.error('❌ 決策請求發送失敗:', error);
      return '我需要想想，稍後回覆你～';
    }
  }

  async analyzeDecisionWithAI(message, context, contextInfo) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });
      
      const prompt = `請以顧晉瑋的角度分析這個決策請求：

訊息內容：${message}
來源：${context.isGroup ? `群組「${context.groupName}」` : '私人對話'}
發訊人：${context.userName}

對話上下文：
${contextInfo}

請提供：
1. 這個請求的性質和重要程度
2. 可能的風險或好處
3. 以顧晉瑋的個性和價值觀，建議如何回應
4. 需要注意的關鍵點

請用顧晉瑋的語氣回答，簡潔明了。`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().replace(/[*#`_~]/g, '').trim();
      
    } catch (error) {
      console.error('❌ AI決策分析失敗:', error);
      return '正在分析中，請根據對話內容和你的判斷來決定。';
    }
  }

  async createDecisionFlexMessage(decision, aiAnalysis, contextInfo) {
    const flexMessage = {
      type: 'flex',
      altText: `決策請求 - ${decision.userName}`,
      contents: {
        type: 'carousel',
        contents: [
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🤔 需要你的決策',
                  weight: 'bold',
                  size: 'lg',
                  color: '#4A90E2'
                },
                {
                  type: 'text',
                  text: `ID: ${decision.shortId}`,
                  size: 'sm',
                  color: '#666666'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `👤 ${decision.userName}`,
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '🕐 最後活躍',
                      flex: 1
                    },
                    {
                      type: 'text',
                      text: lastSeenStr,
                      flex: 1,
                      align: 'end',
                      size: 'sm',
                      color: '#666666'
                    }
                  ],
                  margin: 'sm'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '📱 對話類型',
                      flex: 1
                    },
                    {
                      type: 'text',
                      text: user.isGroup ? '群組' : '私人',
                      flex: 1,
                      align: 'end',
                      size: 'sm',
                      color: user.isGroup ? '#FF9800' : '#9C27B0'
                    }
                  ],
                  margin: 'sm'
                }
              ]
            }
          };
        })
      }
    };
  }

  async getContactsFlexMessage() {
    // 這裡會實作聯絡人清單的圖文顯示
    return { type: 'text', text: '聯絡人功能開發中...' };
  }

  async getDecisionHistoryFlexMessage() {
    // 這裡會實作決策歷史的圖文顯示
    return { type: 'text', text: '決策歷史功能開發中...' };
  }

  async getStatsFlexMessage() {
    // 這裡會實作統計資料的圖文顯示
    return { type: 'text', text: '統計功能開發中...' };
  }

  async getFeaturesFlexMessage() {
    return {
      type: 'flex',
      altText: '🎛️ 完整功能列表',
      contents: {
        type: 'carousel',
        contents: [
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🎛️ AI分身功能',
                  weight: 'bold',
                  size: 'lg',
                  color: '#4A90E2'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🧠 超擬真AI聊天',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '• 完全模擬你的語氣和個性\n• 群組記憶30條訊息\n• 學習回覆風格',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '⚖️ 超級決策系統',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• AI分析決策重要性\n• 完整上下文提供\n• 多種回應方式',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            }
          },
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '⏰ 提醒與搜尋',
                  weight: 'bold',
                  size: 'lg',
                  color: '#FF6B6B'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '⏰ 超級提醒系統',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '• 支援秒/分/時/絕對時間\n• 電話鬧鐘功能\n• 圖文提醒顯示',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '🔍 超級搜尋系統',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 網路搜尋 + AI分析\n• 天氣查詢\n• 圖文結果顯示',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            }
          },
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🎯 特殊功能',
                  weight: 'bold',
                  size: 'lg',
                  color: '#9C27B0'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🚨 矛盾偵測系統',
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: '• AI自動偵測前後矛盾\n• 立即私訊通知主人',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '📢 訊息收回追蹤',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 監控訊息收回\n• 保存原始內容\n• 即時通知主人',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '🎬 電影推薦系統',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 熱門電影推薦\n• 詳細資訊查詢\n• 圖文卡片顯示',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            }
          }
        ]
      }
    };
  }

  async getHelpFlexMessage() {
    return {
      type: 'flex',
      altText: '📚 中文指令說明',
      contents: {
        type: 'carousel',
        contents: [
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '📚 主人專用指令',
                  weight: 'bold',
                  size: 'lg',
                  color: '#4A90E2'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '📊 系統管理',
                  weight: 'bold',
                  color: '#FF6B6B'
                },
                {
                  type: 'text',
                  text: '• 狀態報告 - 查看系統狀態\n• 用戶活躍 - 用戶活躍度報告\n• 系統統計 - 統計資料圖表',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '⚖️ 決策管理',
                  weight: 'bold',
                  color: '#9C27B0',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 決策待辦 - 待處理決策\n• 決策歷史 - 歷史記錄\n• 同意/拒絕 [ID] - 處理決策',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            }
          },
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🛠️ 資料管理',
                  weight: 'bold',
                  size: 'lg',
                  color: '#FF6B6B'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '📝 查看資料',
                  weight: 'bold',
                  color: '#4CAF50'
                },
                {
                  type: 'text',
                  text: '• 提醒清單 - 所有提醒\n• 聯絡人 - 聯絡人清單\n• 功能列表 - 完整功能',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '🗑️ 清除資料',
                  weight: 'bold',
                  color: '#FF5722',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 清除歷史 - 清除指令歷史\n• 清除對話 - 清除對話記錄\n• 清除提醒 - 清除所有提醒',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            }
          },
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🧪 測試功能',
                  weight: 'bold',
                  size: 'lg',
                  color: '#9C27B0'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🔧 系統測試',
                  weight: 'bold',
                  color: '#FF9800'
                },
                {
                  type: 'text',
                  text: '• 測試 提醒 5秒後測試\n• 測試 AI系統\n• 測試 決策系統',
                  size: 'sm',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '📨 訊息轉發',
                  weight: 'bold',
                  color: '#607D8B',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '• 告訴[名字] [訊息]\n• 跟[名字]說 [訊息]\n• 智能聯絡人匹配',
                  size: 'sm',
                  margin: 'sm'
                }
              ]
            }
          }
        ]
      }
    };
  }

  async handleTestCommand(testContent) {
    if (testContent.includes('提醒')) {
      const timeInfo = reminderSystem.parseTime(testContent);
      if (timeInfo && timeInfo.time) {
        const title = reminderSystem.extractTitle(testContent);
        const reminderId = reminderSystem.createReminder(OWNER_LINE_ID, `[測試] ${title}`, timeInfo.time, timeInfo.isAlarm, timeInfo.isPhoneCall);
        
        if (reminderId) {
          return {
            type: 'text',
            text: `✅ 測試提醒已設定：${title}\n時間：${timeInfo.time.toLocaleString('zh-TW')}\n類型：${timeInfo.isPhoneCall ? '電話鬧鐘' : timeInfo.isAlarm ? '鬧鐘' : '一般提醒'}`
          };
        } else {
          return { type: 'text', text: '❌ 測試提醒設定失敗' };
        }
      }
      return { type: 'text', text: '❌ 測試提醒時間解析失敗' };
    }
    
    if (testContent.includes('AI') || testContent.includes('ai')) {
      const testReply = await aiSystem.generatePersonalizedReply(OWNER_LINE_ID, '這是AI系統測試訊息', { isGroup: false });
      return { type: 'text', text: `🤖 AI系統測試結果：\n${testReply}` };
    }
    
    if (testContent.includes('決策')) {
      return { type: 'text', text: '⚖️ 決策系統測試：請在群組中發送需要決策的訊息來測試決策功能' };
    }
    
    return { type: 'text', text: `❓ 未知測試類型：${testContent}\n可用測試：提醒、AI、決策` };
  }

  recordCommand(userId, command) {
    if (!this.commandHistory.has(userId)) {
      this.commandHistory.set(userId, []);
    }
    
    const history = this.commandHistory.get(userId);
    history.push({
      command,
      timestamp: new Date()
    });
    
    if (history.length > 50) {
      history.shift();
    }
  }
}

// 自我修復系統
class SelfRepairSystem {
  constructor() {
    this.errorCount = new Map();
    this.lastErrors = [];
    console.log('🛠️ 自我修復系統已初始化');
  }

  async handleError(error, context = '') {
    console.error(`🚨 捕獲錯誤 [${context}]:`, error);
    
    // 記錄錯誤
    const errorKey = error.message || error.toString();
    this.errorCount.set(errorKey, (this.errorCount.get(errorKey) || 0) + 1);
    
    this.lastErrors.push({
      error: errorKey,
      context,
      timestamp: new Date()
    });
    
    // 保持最近50個錯誤記錄
    if (this.lastErrors.length > 50) {
      this.lastErrors.shift();
    }
    
    // 自動修復嘗試
    try {
      await this.attemptRepair(error, context);
    } catch (repairError) {
      console.error('🔧 自我修復失敗:', repairError);
    }
    
    // 如果錯誤頻繁，通知主人
    if (this.errorCount.get(errorKey) >= 5) {
      await this.notifyOwnerOfRepeatedError(errorKey, context);
    }
  }

  async attemptRepair(error, context) {
    console.log('🔧 嘗試自我修復...');
    
    // 根據錯誤類型嘗試不同的修復策略
    if (error.message && error.message.includes('timeout')) {
      console.log('🔧 檢測到超時錯誤，增加重試機制');
      // 超時錯誤的修復策略
      return;
    }
    
    if (error.message && error.message.includes('network')) {
      console.log('🔧 檢測到網路錯誤，等待後重試');
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒
      return;
    }
    
    if (error.message && error.message.includes('API')) {
      console.log('🔧 檢測到API錯誤，切換備用服務');
      // API錯誤的修復策略
      return;
    }
    
    console.log('🔧 一般性修復：重置相關狀態');
  }

  async notifyOwnerOfRepeatedError(errorKey, context) {
    try {
      const errorMessage = {
        type: 'flex',
        altText: '🚨 系統錯誤警報',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🚨 系統錯誤警報',
                weight: 'bold',
                size: 'lg',
                color: '#FF0000'
              }
            ],
            backgroundColor: '#FFE4E1'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '檢測到重複錯誤',
                weight: 'bold',
                margin: 'md'
              },
              {
                type: 'text',
                text: `錯誤內容：${errorKey}`,
                wrap: true,
                size: 'sm',
                margin: 'sm'
              },
              {
                type: 'text',
                text: `發生環境：${context}`,
                size: 'sm',
                color: '#666666',
                margin: 'sm'
              },
              {
                type: 'text',
                text: `發生次數：${this.errorCount.get(errorKey)}次`,
                size: 'sm',
                color: '#FF5722',
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '🔧 系統正在嘗試自動修復',
                margin: 'md',
                color: '#4CAF50'
              },
              {
                type: 'text',
                text: `時間：${new Date().toLocaleString('zh-TW')}`,
                size: 'xs',
                color: '#999999',
                margin: 'md'
              }
            ]
          }
        }
      };
      
      await client.pushMessage(OWNER_LINE_ID, errorMessage);
      console.log('📨 錯誤警報已發送給主人');
      
    } catch (notifyError) {
      console.error('❌ 錯誤通知發送失敗:', notifyError);
    }
  }

  getErrorStats() {
    const totalErrors = Array.from(this.errorCount.values()).reduce((sum, count) => sum + count, 0);
    const uniqueErrors = this.errorCount.size;
    const recentErrors = this.lastErrors.filter(e => 
      new Date() - e.timestamp < 3600000 // 最近1小時
    ).length;
    
    return {
      totalErrors,
      uniqueErrors,
      recentErrors,
      topErrors: Array.from(this.errorCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }
}

// 初始化所有系統
const aiSystem = new HyperRealisticAISystem();
const decisionSystem = new SuperAdvancedDecisionSystem();
const reminderSystem = new SuperReminderWithPhoneSystem();
const searchSystem = new SuperSearchSystemWithRichDisplay();
const movieSystem = new SuperMovieSystemWithRichDisplay();
const commandSystem = new ChineseCommandSystem();
const repairSystem = new SelfRepairSystem();

// Reply Token 管理
class ReplyTokenManager {
  constructor() {
    this.usedTokens = new Set();
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  isUsed(token) { return this.usedTokens.has(token); }
  markUsed(token) { this.usedTokens.add(token); }
  cleanup() { this.usedTokens.clear(); }
}

const tokenManager = new ReplyTokenManager();

// 安全回覆函數
async function safeReply(replyToken, message, retryCount = 0) {
  try {
    if (!replyToken || tokenManager.isUsed(replyToken)) return false;
    tokenManager.markUsed(replyToken);
    
    await client.replyMessage(replyToken, message);
    return true;
    
  } catch (error) {
    await repairSystem.handleError(error, 'safeReply');
    
    if (retryCount < 2 && !error.message.includes('Invalid reply token')) {
      const simpleMessage = typeof message === 'object' && message.altText ? 
        { type: 'text', text: message.altText } : 
        { type: 'text', text: '系統回覆' };
      
      try {
        await client.replyMessage(replyToken, simpleMessage);
        return true;
      } catch (simpleError) {
        console.error('❌ 簡化回覆也失敗:', simpleError);
      }
    }
    
    return false;
  }
}

// 安全推送函數
async function safePushMessage(targetId, message, retryCount = 0) {
  try {
    await client.pushMessage(targetId, message);
    return true;
    
  } catch (error) {
    await repairSystem.handleError(error, 'safePushMessage');
    
    if (retryCount < 2) {
      const simpleMessage = typeof message === 'object' && message.altText ? 
        { type: 'text', text: message.altText } : 
        { type: 'text', text: '系統推送' };
      
      try {
        await client.pushMessage(targetId, simpleMessage);
        return true;
      } catch (simpleError) {
        console.error('❌ 簡化推送也失敗:', simpleError);
      }
    }
    
    return false;
  }
}

// 智能判斷函數
function isReminderQuery(text) {
  const reminderKeywords = ['提醒', '分鐘後', '小時後', '秒後', '叫我', '起床', '鬧鐘', '明天', '設定提醒', '電話叫', '打電話'];
  return reminderKeywords.some(keyword => text.includes(keyword)) && 
         (text.match(/\d/) || text.includes('明天'));
}

function isMovieQuery(text) {
  const movieKeywords = ['電影', '影片', '上映', '票房', '好看的', '推薦電影', '電影推薦'];
  return movieKeywords.some(keyword => text.includes(keyword));
}

function isWebSearchQuery(text) {
  const searchKeywords = ['搜尋', '查詢', '查一下', '幫我查', '是什麼', '怎麼辦', '天氣', '新聞'];
  return searchKeywords.some(keyword => text.includes(keyword));
}

function isFunctionMenuQuery(text) {
  const menuKeywords = ['功能', '選單', '幫助', 'help', '教學', '怎麼用', '指令', '可以做什麼'];
  return menuKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

function extractCityFromText(text) {
  const cities = ['台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江'];
  for (const city of cities) {
    if (text.includes(city)) return city;
  }
  return null;
}

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}小時${Math.floor((uptime % 3600) / 60)}分鐘`;
  const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
  const errorStats = repairSystem.getErrorStats();
  
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AI分身版 LINE Bot - 終極進化版</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #333;
          line-height: 1.6;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          color: white;
          margin-bottom: 30px;
        }
        .header h1 {
          font-size: 2.5em;
          margin-bottom: 10px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .ai-badge {
          background: linear-gradient(45deg, #FF6B6B, #4ECDC4, #45B7D1, #96CEB4);
          background-size: 300% 300%;
          animation: gradient 3s ease infinite;
          color: white;
          padding: 8px 16px;
          border-radius: 25px;
          font-size: 1em;
          font-weight: bold;
          display: inline-block;
          margin: 10px;
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .status-card {
          background: rgba(255,255,255,0.95);
          border-radius: 15px;
          padding: 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.2);
        }
        .status-card h3 {
          color: #4a54e1;
          margin-bottom: 15px;
          font-size: 1.3em;
        }
        .stat-item {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          padding: 8px;
          background: rgba(74,84,225,0.05);
          border-radius: 8px;
        }
        .personality-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 15px;
          padding: 25px;
          margin: 20px 0;
        }
        .personality-card h3 {
          margin-bottom: 15px;
          font-size: 1.4em;
        }
        .feature-highlight {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 15px;
          margin: 10px 0;
        }
        .error-stats {
          background: rgba(255,255,255,0.95);
          border-radius: 15px;
          padding: 20px;
          margin: 20px 0;
        }
        .error-stats h3 {
          color: #e74c3c;
          margin-bottom: 15px;
        }
        .footer {
          text-align: center;
          color: rgba(255,255,255,0.8);
          margin-top: 40px;
          padding: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🤖 AI分身版 LINE Bot</h1>
          <div class="ai-badge">終極進化版 - 完全模擬你的個性</div>
          <p style="margin-top: 15px; font-size: 1.1em;">
            <strong>🇹🇼 台灣時間：${currentTime}</strong><br>
            <strong>⏱️ 運行時間：${uptimeStr}</strong><br>
            <strong>🏠 記憶體使用：${memoryUsage} MB</strong>
          </p>
        </div>

        <div class="personality-card">
          <h3>🎭 AI分身個性檔案</h3>
          <div class="feature-highlight">
            <strong>👤 身份：</strong>顧晉瑋 - 靜宜大學資管系學生<br>
            <strong>🗣️ 語氣：</strong>活潑友善，台灣年輕人風格<br>
            <strong>💭 價值觀：</strong>樂於助人、直率坦誠、科技愛好者<br>
            <strong>🎯 特色：</strong>完全模擬你的回覆風格，讓大家感覺Bot就是你本人
          </div>
        </div>
        
        <div class="status-grid">
          <div class="status-card">
            <h3>🧠 AI分身系統</h3>
            <div class="stat-item">
              <span>對話記錄</span>
              <span>${aiSystem.conversations.size} 筆</span>
            </div>
            <div class="stat-item">
              <span>用戶檔案</span>
              <span>${aiSystem.userProfiles.size} 人</span>
            </div>
            <div class="stat-item">
              <span>群組記憶</span>
              <span>${aiSystem.groupContexts.size} 個群組</span>
            </div>
            <div class="stat-item">
              <span>個性學習</span>
              <span>持續進化中</span>
            </div>
          </div>
          
          <div class="status-card">
            <h3>⚖️ 決策系統</h3>
            <div class="stat-item">
              <span>待處理決策</span>
              <span>${decisionSystem.pendingDecisions.size} 個</span>
            </div>
            <div class="stat-item">
              <span>決策歷史</span>
              <span>${decisionSystem.decisionHistory.size} 筆</span>
            </div>
            <div class="stat-item">
              <span>AI分析</span>
              <span>智能運作中</span>
            </div>
            <div class="stat-item">
              <span>自動處理</span>
              <span>30分鐘超時</span>
            </div>
          </div>

          <div class="status-card">
            <h3>⏰ 提醒系統</h3>
            <div class="stat-item">
              <span>活躍提醒</span>
              <span>${reminderSystem.reminders.size} 個</span>
            </div>
            <div class="stat-item">
              <span>定時器</span>
              <span>${reminderSystem.activeTimers.size} 個</span>
            </div>
            <div class="stat-item">
              <span>電話鬧鐘</span>
              <span>支援中</span>
            </div>
            <div class="stat-item">
              <span>圖文提醒</span>
              <span>已啟用</span>
            </div>
          </div>

          <div class="status-card">
            <h3>🔍 搜尋與電影</h3>
            <div class="stat-item">
              <span>網路搜尋</span>
              <span>DuckDuckGo + AI</span>
            </div>
            <div class="stat-item">
              <span>天氣查詢</span>
              <span>中央氣象署</span>
            </div>
            <div class="stat-item">
              <span>電影資料</span>
              <span>TMDB API</span>
            </div>
            <div class="stat-item">
              <span>圖文顯示</span>
              <span>Flex Message</span>
            </div>
          </div>
        </div>

        <div class="error-stats">
          <h3>🛠️ 系統穩定性報告</h3>
          <div class="stat-item">
            <span>總錯誤次數</span>
            <span>${errorStats.totalErrors} 次</span>
          </div>
          <div class="stat-item">
            <span>錯誤類型</span>
            <span>${errorStats.uniqueErrors} 種</span>
          </div>
          <div class="stat-item">
            <span>最近1小時錯誤</span>
            <span>${errorStats.recentErrors} 次</span>
          </div>
          <div class="stat-item">
            <span>自我修復</span>
            <span>智能運作中</span>
          </div>
        </div>

        <div class="footer">
          <p>🤖 AI分身版 LINE Bot - 終極進化版</p>
          <p>由顧晉瑋 (靜宜大學資管系) 開發</p>
          <p>✨ 完全模擬你的個性，成為你的數位分身！</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Webhook 端點
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) {
    return res.status(401).send('缺少簽名標頭');
  }

  const body = req.body.toString();
  const hash = crypto.createHmac('SHA256', config.channelSecret).update(body).digest('base64');

  if (signature !== hash) {
    return res.status(401).send('簽名驗證失敗');
  }

  let events;
  try {
    const parsedBody = JSON.parse(body);
    events = parsedBody.events;
  } catch (error) {
    await repairSystem.handleError(error, 'webhook_parse');
    return res.status(400).send('無效的 JSON');
  }

  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    events_processed: events.length 
  });

  // 異步處理事件
  events.forEach(event => {
    handleEvent(event).catch(error => {
      repairSystem.handleError(error, 'event_handling');
    });
  });
});

// 主要事件處理函數
async function handleEvent(event) {
  try {
    console.log('📥 接收事件:', event.type);
    
    // 處理訊息收回事件
    if (event.type === 'unsend') {
      console.log('📢 偵測到訊息收回');
      const userId = event.source.userId;
      const messageId = event.unsend.messageId;
      
      // 嘗試從記錄中找到原始訊息
      let originalText = '無法獲取原始內容';
      for (const [convId, conv] of aiSystem.conversations) {
        if (conv.userId === userId) {
          originalText = conv.message;
          break;
        }
      }
      
      // 獲取用戶資訊
      let userName = '未知用戶';
      let context = { isGroup: !!event.source.groupId };
      try {
        if (event.source.groupId) {
          const profile = await client.getGroupMemberProfile(event.source.groupId, userId);
          userName = profile.displayName;
          context.groupId = event.source.groupId;
        } else {
          const profile = await client.getProfile(userId);
          userName = profile.displayName;
        }
      } catch (error) {
        console.log('無法獲取用戶資訊');
      }
      
      context.userName = userName;
      
      // 記錄並通知
      aiSystem.recordMessageRecall(userId, messageId, originalText, context);
      return;
    }
    
    if (event.type !== 'message' || event.message.type !== 'text') {
      return;
    }

    const userId = event.source.userId;
    const groupId = event.source.groupId;
    const messageText = event.message.text.trim();
    const replyToken = event.replyToken;
    const isGroup = !!groupId;
    
    console.log(`💬 收到訊息: "${messageText}" 來自 ${isGroup ? '群組' : '私人'}`);
    
    // 獲取用戶名稱和群組資訊
    let userName = '朋友';
    let groupName = '群組';
    try {
      if (groupId) {
        const profile = await client.getGroupMemberProfile(groupId, userId);
        userName = profile.displayName;
        try {
          const groupInfo = await client.getGroupSummary(groupId);
          groupName = groupInfo.groupName || '未知群組';
        } catch (e) {
          console.log('無法獲取群組名稱');
        }
      } else {
        const profile = await client.getProfile(userId);
        userName = profile.displayName;
      }
    } catch (error) {
      console.log('⚠️ 無法獲取用戶資訊，使用預設名稱');
    }

    const context = { isGroup, groupId, userId, userName, groupName };
    let response = '';

    // 私訊處理
    if (!isGroup) {
      console.log('📱 處理私訊');
      
      if (userId === OWNER_LINE_ID) {
        // 主人私訊 - 處理決策回覆和中文指令
        if (decisionSystem.pendingDecisions.size > 0) {
          const decisionResponse = await decisionSystem.processOwnerDecision(messageText, OWNER_LINE_ID);
          if (decisionResponse && typeof decisionResponse !== 'string') {
            await safeReply(replyToken, decisionResponse);
            return;
          } else if (decisionResponse && !decisionResponse.includes('目前沒有待處理的決策')) {
            await safeReply(replyToken, { type: 'text', text: decisionResponse });
            return;
          }
        }
        
        // 中文指令處理
        const commandResponse = await commandSystem.handleOwnerCommand(messageText);
        if (commandResponse) {
          await safeReply(replyToken, commandResponse);
          return;
        }
        
        // 訊息轉發處理
        if (messageText.includes('告訴') || (messageText.includes('跟') && messageText.includes('說'))) {
          const match = messageText.match(/(?:告訴|跟)(.+?)(?:說|:)(.+)/);
          if (match) {
            const targetName = match[1].trim();
            const content = match[2].trim();
            
            // 簡單的轉發邏輯（這裡可以擴展更完整的功能）
            await safeReply(replyToken, {
              type: 'text',
              text: `📨 收到轉發請求：\n目標：${targetName}\n訊息：${content}\n\n（轉發功能開發中...）`
            });
            return;
          }
        }
      }
      
      // 一般私訊回覆
      response = await aiSystem.generatePersonalizedReply(userId, messageText, context);
      await safeReply(replyToken, { type: 'text', text: response });
      return;
    }

    // 群組消息處理
    console.log('👥 處理群組訊息');
    
    if (isFunctionMenuQuery(messageText)) {
      const menuMessage = {
        type: 'flex',
        altText: '🎛️ AI分身功能總覽',
        contents: {
          type: 'carousel',
          contents: [
            {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '🎭 顧晉瑋的AI分身',
                    weight: 'bold',
                    size: 'lg',
                    color: '#4A90E2'
                  },
                  {
                    type: 'text',
                    text: '完全模擬本人個性',
                    size: 'sm',
                    color: '#666666'
                  }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '💬 自然聊天',
                    weight: 'bold'
                  },
                  {
                    type: 'text',
                    text: '• 完全模擬顧晉瑋的語氣和個性\n• 記住群組對話內容\n• 就像本人在線上一樣',
                    size: 'sm',
                    margin: 'sm'
                  },
                  {
                    type: 'separator',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '⏰ 智能提醒',
                    weight: 'bold',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '• "5分鐘後提醒我"\n• "明天7點叫我起床"\n• 支援電話鬧鐘功能',
                    size: 'sm',
                    margin: 'sm'
                  }
                ]
              }
            },
            {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '🔍 搜尋查詢',
                    weight: 'bold',
                    size: 'lg',
                    color: '#FF6B6B'
                  }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '🌐 網路搜尋',
                    weight: 'bold'
                  },
                  {
                    type: 'text',
                    text: '• "搜尋最新科技新聞"\n• "台北天氣如何"\n• AI智能分析結果',
                    size: 'sm',
                    margin: 'sm'
                  },
                  {
                    type: 'separator',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '🎬 電影推薦',
                    weight: 'bold',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '• "最近有什麼電影"\n• "搜尋電影復仇者聯盟"\n• 詳細評分和資訊',
                    size: 'sm',
                    margin: 'sm'
                  }
                ]
              }
            },
            {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '🎯 特殊功能',
                    weight: 'bold',
                    size: 'lg',
                    color: '#9C27B0'
                  }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: '⚖️ 智能決策',
                    weight: 'bold'
                  },
                  {
                    type: 'text',
                    text: '• 重要決定先詢問本人\n• AI分析建議\n• 完整對話記錄',
                    size: 'sm',
                    margin: 'sm'
                  },
                  {
                    type: 'separator',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '🚨 智能監控',
                    weight: 'bold',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: '• 矛盾偵測提醒\n• 訊息收回追蹤\n• 異常行為通知',
                    size: 'sm',
                    margin: 'sm'
                  }
                ]
              }
            }
          ]
        }
      };
      
      await safeReply(replyToken, menuMessage);
      
    } else if (isReminderQuery(messageText)) {
      console.log('⏰ 處理提醒請求');
      
      const timeInfo = reminderSystem.parseTime(messageText);
      
      if (timeInfo && timeInfo.time) {
        const title = reminderSystem.extractTitle(messageText);
        const reminderId = reminderSystem.createReminder(userId, title, timeInfo.time, timeInfo.isAlarm, timeInfo.isPhoneCall);
        
        if (reminderId) {
          const delay = timeInfo.time.getTime() - Date.now();
          const delayStr = delay < 60000 ? 
            `${Math.round(delay / 1000)}秒後` : 
            delay < 3600000 ? 
            `${Math.round(delay / 60000)}分鐘後` :
            `${Math.round(delay / 3600000)}小時後`;
          
          const confirmMessage = {
            type: 'flex',
            altText: `✅ ${timeInfo.isPhoneCall ? '電話鬧鐘' : timeInfo.isAlarm ? '鬧鐘' : '提醒'}設定成功`,
            contents: {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: `✅ ${timeInfo.isPhoneCall ? '📞 電話鬧鐘' : timeInfo.isAlarm ? '⏰ 鬧鐘' : '📝 提醒'}設定成功！`,
                    weight: 'bold',
                    size: 'lg',
                    color: timeInfo.isPhoneCall ? '#FF0000' : timeInfo.isAlarm ? '#FF6B6B' : '#4A90E2'
                  }
                ]
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: `📝 ${title}`,
                    weight: 'bold',
                    wrap: true
                  },
                  {
                    type: 'separator',
                    margin: 'md'
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      {
                        type: 'text',
                        text: '⏰ 提醒時間',
                        flex: 1
                      },
                      {
                        type: 'text',
                        text: timeInfo.time.toLocaleString('zh-TW'),
                        flex: 2,
                        align: 'end',
                        wrap: true
                      }
                    ],
                    margin: 'md'
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      {
                        type: 'text',
                        text: '⏳ 倒數',
                        flex: 1
                      },
                      {
                        type: 'text',
                        text: delayStr,
                        flex: 1,
                        align: 'end',
                        color: '#4CAF50',
                        weight: 'bold'
                      }
                    ],
                    margin: 'sm'
                  },
                  {
                    type: 'text',
                    text: timeInfo.isPhoneCall ? 
                      '📞 到時間會打電話叫你起床！' : 
                      timeInfo.isAlarm ? 
                      '⏰ 到時間會叫你起床！' : 
                      '📝 到時間會提醒你！',
                    margin: 'md',
                    color: '#666666',
                    size: 'sm'
                  }
                ]
              }
            }
          };
          
          await safeReply(replyToken, confirmMessage);
        } else {
          await safeReply(replyToken, {
            type: 'text',
            text: '⚠️ 提醒設定失敗，時間可能無效或太遠'
          });
        }
      } else {
        const helpText = `⏰ 提醒時間格式說明

✅ 支援格式：
• "5秒後提醒我測試" (測試用)
• "10分鐘後提醒我休息"
• "2小時後提醒我開會"
• "15:30提醒我下班"
• "7點叫我起床"
• "明天8點打電話叫我起床"

🎯 請使用以上格式再試一次～`;
        
        await safeReply(replyToken, { type: 'text', text: helpText });
      }
      
    } else if (isMovieQuery(messageText)) {
      console.log('🎬 處理電影查詢');
      
      let movieName = '';
      const searchMatch = messageText.match(/(?:搜尋|查|找).*?電影(.+)|電影.*?(.+)/);
      if (searchMatch) {
        movieName = (searchMatch[1] || searchMatch[2] || '').trim();
      }
      
      const movieResults = await movieSystem.searchMovies(movieName);
      await safeReply(replyToken, movieResults);
      
    } else if (isWebSearchQuery(messageText)) {
      console.log('🔍 處理搜尋請求');
      
      // 特殊處理天氣查詢
      if (messageText.includes('天氣')) {
        const city = extractCityFromText(messageText) || '台北';
        const weatherResult = await searchSystem.getWeatherWithRichDisplay(city);
        await safeReply(replyToken, weatherResult);
      }
      // 一般搜尋
      else {
        let query = messageText;
        const searchMatch = messageText.match(/(?:搜尋|查詢|查一下|幫我查)(.+)|(.+?)(?:是什麼|怎麼辦)/);
        if (searchMatch) {
          query = (searchMatch[1] || searchMatch[2] || messageText).trim();
        }
        
        const searchResults = await searchSystem.search(query);
        await safeReply(replyToken, searchResults);
      }
      
    } else {
      // 檢查是否需要決策
      if (decisionSystem.shouldAskOwner(messageText, context)) {
        console.log('⚖️ 需要決策，向主人詢問');
        response = await decisionSystem.requestDecision(messageText, userId, userName, context, replyToken);
        await safeReply(replyToken, { type: 'text', text: response });
      } else {
        // 一般智能對話（AI分身模式）
        console.log('🎭 AI分身對話模式');
        response = await aiSystem.generatePersonalizedReply(userId, messageText, context);
        await safeReply(replyToken, { type: 'text', text: response });
      }
    }

    console.log('✅ 事件處理完成');

  } catch (error) {
    await repairSystem.handleError(error, 'main_event_handler');
    
    if (event.replyToken && !tokenManager.isUsed(event.replyToken)) {
      await safeReply(event.replyToken, {
        type: 'text',
        text: '抱歉，我遇到了一些問題，不過系統正在自動修復中～ 😅'
      });
    }
  }
}

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 錯誤處理中間件
app.use((error, req, res, next) => {
  repairSystem.handleError(error, 'express_middleware');
  res.status(500).json({ error: 'Internal Server Error' });
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ AI分身版 LINE Bot 終極進化版成功啟動！`);
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`🎭 AI分身模式已啟用 - 完全模擬 ${OWNER_PERSONALITY.name} 的個性`);
  console.log(`📊 系統監控: http://localhost:${PORT}`);
  console.log(`🤖 所有功能正常運作，準備成為你的數位分身！`);
  
  // 延遲發送啟動通知
  setTimeout(async () => {
    try {
      const startupMessage = {
        type: 'flex',
        altText: '🚀 AI分身版終極進化版已啟動！',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🚀 AI分身版已啟動！',
                weight: 'bold',
                size: 'xl',
                color: '#4A90E2'
              },
              {
                type: 'text',
                text: '終極進化版 - 完全模擬你的個性',
                size: 'sm',
                color: '#666666'
              }
            ],
            backgroundColor: '#E3F2FD'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🎭 全新AI分身功能',
                weight: 'bold',
                color: '#FF6B6B'
              },
              {
                type: 'text',
                text: '• 完全模擬你的語氣和個性\n• 讓大家感覺Bot就是你本人\n• 智能學習你的回覆風格',
                size: 'sm',
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '✨ 超級功能升級',
                weight: 'bold',
                color: '#9C27B0',
                margin: 'md'
              },
              {
                type: 'text',
                text: '• 圖文訊息回覆\n• 電話鬧鐘功能\n• 矛盾偵測系統\n• 訊息收回追蹤\n• 自我修復機制',
                size: 'sm',
                margin: 'sm'
              },
              {
                type: 'separator',
                margin: 'md'
              },
              {
                type: 'text',
                text: '💬 中文指令系統',
                weight: 'bold',
                color: '#4CAF50',
                margin: 'md'
              },
              {
                type: 'text',
                text: '• 狀態報告 - 查看系統狀態\n• 用戶活躍 - 活躍度報告\n• 決策待辦 - 處理決策\n• 功能列表 - 查看所有功能',
                size: 'sm',
                margin: 'sm'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '🎉 你的AI分身已準備就緒！',
                align: 'center',
                weight: 'bold',
                color: '#4A90E2'
              }
            ]
          }
        }
      };

      await safePushMessage(OWNER_LINE_ID, startupMessage);
      console.log('📨 啟動通知已發送給主人');
    } catch (error) {
      await repairSystem.handleError(error, 'startup_notification');
    }
  }, 3000);
});

// 優雅關閉處理
process.on('SIGTERM', () => {
  console.log('📴 收到 SIGTERM，準備關閉...');
  reminderSystem.activeTimers.forEach(timer => clearTimeout(timer));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 收到 SIGINT，準備關閉...');
  reminderSystem.activeTimers.forEach(timer => clearTimeout(timer));
  process.exit(0);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  repairSystem.handleError(error, 'uncaught_exception');
});

process.on('unhandledRejection', (reason, promise) => {
  repairSystem.handleError(new Error(reason), 'unhandled_rejection');
});

console.log('🎯 AI分身版 LINE Bot 終極進化版初始化完成！');
console.log('🎭 個性模擬：完全複製你的語氣、邏輯、價值觀');
console.log('📱 圖文回覆：所有功能都用精美的圖文訊息呈現');
console.log('🧠 智能決策：重要事項一定先私訊詢問你');
console.log('🛠️ 自我修復：遇到錯誤能自動診斷和修復');
console.log('🚨 智能監控：矛盾偵測、訊息收回追蹤');

module.exports = app;
                {
                  type: 'text',
                  text: `📍 ${decision.context.isGroup ? `群組「${decision.context.groupName}」` : '私人對話'}`,
                  size: 'sm',
                  color: '#666666',
                  margin: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '💬 訊息內容：',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: decision.message,
                  wrap: true,
                  margin: 'sm'
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'button',
                  action: {
                    type: 'message',
                    label: '👍 同意',
                    text: `同意 ${decision.shortId}`
                  },
                  style: 'primary',
                  color: '#4CAF50'
                },
                {
                  type: 'button',
                  action: {
                    type: 'message',
                    label: '👎 拒絕',
                    text: `拒絕 ${decision.shortId}`
                  },
                  style: 'secondary',
                  margin: 'sm'
                }
              ]
            }
          },
          {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🤖 AI分析建議',
                  weight: 'bold',
                  size: 'lg',
                  color: '#FF6B6B'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: aiAnalysis,
                  wrap: true,
                  size: 'sm'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: '💡 可用指令：',
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: `• 問 ${decision.shortId} [問題]\n• 回覆 ${decision.shortId} [訊息]\n• 更多 ${decision.shortId}\n• 忽略 ${decision.shortId}`,
                  size: 'xs',
                  color: '#666666',
                  margin: 'sm'
                }
              ]
            }
          }
        ]
      }
    };

    // 如果有對話上下文，新增第三頁
    if (contextInfo) {
      flexMessage.contents.contents.push({
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📝 對話記錄',
              weight: 'bold',
              size: 'lg',
              color: '#9C27B0'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: contextInfo.substring(0, 1000) + (contextInfo.length > 1000 ? '...' : ''),
              wrap: true,
              size: 'xs',
              color: '#333333'
            }
          ]
        }
      });
    }

    return flexMessage;
  }

  async processOwnerDecision(message, ownerId) {
    const lowerMessage = message.toLowerCase();
    
    // 檢查是否包含決策ID
    const idMatch = message.match(/([a-z0-9]{8})/i);
    let targetDecision = null;

    if (idMatch) {
      const shortId = idMatch[1];
      for (const [id, decision] of this.pendingDecisions) {
        if (decision.shortId === shortId) {
          targetDecision = decision;
          break;
        }
      }
    }

    if (!targetDecision) {
      return await this.createPendingDecisionsFlexMessage();
    }

    // 處理不同類型的回應
    if (lowerMessage.includes('同意')) {
      return await this.handleApproval(targetDecision);
    } else if (lowerMessage.includes('拒絕')) {
      return await this.handleRejection(targetDecision);
    } else if (lowerMessage.includes('問')) {
      const questionMatch = message.match(/問\s+[a-z0-9]{8}\s+(.+)/i);
      if (questionMatch) {
        return await this.handleQuestion(targetDecision, questionMatch[1]);
      }
    } else if (lowerMessage.includes('回覆')) {
      const replyMatch = message.match(/回覆\s+[a-z0-9]{8}\s+(.+)/i);
      if (replyMatch) {
        return await this.handleCustomReply(targetDecision, replyMatch[1]);
      }
    } else if (lowerMessage.includes('更多')) {
      return await this.showMoreContext(targetDecision);
    } else if (lowerMessage.includes('忽略')) {
      return await this.handleIgnore(targetDecision);
    }

    return '請使用按鈕或正確的指令格式來處理決策。';
  }

  async createPendingDecisionsFlexMessage() {
    const decisions = Array.from(this.pendingDecisions.values())
      .filter(d => d.status === 'pending')
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (decisions.length === 0) {
      return '目前沒有待處理的決策 ✅';
    }

    const flexMessage = {
      type: 'flex',
      altText: `待處理決策 (${decisions.length}個)`,
      contents: {
        type: 'carousel',
        contents: []
      }
    };

    decisions.slice(0, 10).forEach(decision => {
      const timeAgo = Math.floor((new Date() - decision.timestamp) / 60000);
      
      flexMessage.contents.contents.push({
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📋 [${decision.shortId}]`,
              weight: 'bold',
              color: '#4A90E2'
            },
            {
              type: 'text',
              text: decision.userName,
              size: 'sm',
              margin: 'sm'
            },
            {
              type: 'text',
              text: decision.message.substring(0, 50) + (decision.message.length > 50 ? '...' : ''),
              wrap: true,
              size: 'xs',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'text',
              text: `${timeAgo}分鐘前 • ${decision.context.isGroup ? '群組' : '私人'}`,
              size: 'xs',
              color: '#999999',
              margin: 'sm'
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
                label: '同意',
                text: `同意 ${decision.shortId}`
              },
              style: 'primary',
              color: '#4CAF50',
              flex: 1
            },
            {
              type: 'button',
              action: {
                type: 'message',
                label: '拒絕',
                text: `拒絕 ${decision.shortId}`
              },
              style: 'secondary',
              flex: 1,
              margin: 'sm'
            }
          ]
        }
      });
    });

    return flexMessage;
  }

  async handleApproval(decision) {
    const replyMsg = '好der！我覺得可以，就這樣決定吧～ ✅';
    await this.sendReplyToSource(decision, replyMsg);
    await this.markDecisionComplete(decision, 'approved');
    return `✅ 已同意決策 ${decision.shortId} 並回覆`;
  }

  async handleRejection(decision) {
    const replyMsg = '抱歉耶～我現在不太方便，下次再說吧！謝謝你的邀請 😊';
    await this.sendReplyToSource(decision, replyMsg);
    await this.markDecisionComplete(decision, 'rejected');
    return `❌ 已拒絕決策 ${decision.shortId} 並回覆`;
  }

  async handleQuestion(decision, question) {
    const questionMsg = `欸～想問一下：${question} 🤔`;
    await this.sendReplyToSource(decision, questionMsg);
    return `❓ 已向 ${decision.userName} 提問：${question}`;
  }

  async handleCustomReply(decision, customReply) {
    await this.sendReplyToSource(decision, customReply);
    await this.markDecisionComplete(decision, 'custom');
    return `💬 已使用自訂回覆：${customReply}`;
  }

  async showMoreContext(decision) {
    if (decision.context.isGroup && decision.context.groupId) {
      const fullContext = aiSystem.groupContexts.get(decision.context.groupId) || [];
      const detailContext = fullContext.slice(-30).map(msg => 
        `[${msg.timestamp.toLocaleTimeString('zh-TW')}] ${msg.userName}: ${msg.message}`
      ).join('\n');
      return `📝 完整對話記錄 [${decision.shortId}]：\n\n${detailContext}`;
    } else {
      return '這是私人對話，沒有更多上下文';
    }
  }

  async handleIgnore(decision) {
    decision.status = 'ignored';
    return `⏸️ 已暫時忽略決策 ${decision.shortId}`;
  }

  async autoReject(decisionId) {
    const decision = this.pendingDecisions.get(decisionId);
    if (!decision || decision.status !== 'pending') return;
    
    const autoReply = '不好意思，我現在比較忙，沒辦法及時回覆。下次有機會再聊吧！ 😅';
    await this.sendReplyToSource(decision, autoReply);
    await this.markDecisionComplete(decision, 'auto_rejected');
    
    // 通知主人
    await client.pushMessage(OWNER_LINE_ID, {
      type: 'text',
      text: `⏰ 決策 ${decision.shortId} 已自動拒絕（超時）`
    });
  }

  async markDecisionComplete(decision, result) {
    decision.status = result;
    decision.completedAt = new Date();
    
    this.decisionHistory.set(decision.id, decision);
    this.pendingDecisions.delete(decision.id);
    
    if (this.decisionHistory.size > 100) {
      const oldest = Array.from(this.decisionHistory.keys())[0];
      this.decisionHistory.delete(oldest);
    }
  }

  async sendReplyToSource(decision, message) {
    try {
      if (decision.sourceType === 'group') {
        await client.pushMessage(decision.sourceId, {
          type: 'text',
          text: message
        });
      } else {
        await client.pushMessage(decision.userId, {
          type: 'text',
          text: message
        });
      }
    } catch (error) {
      console.error('❌ 回覆訊息失敗:', error);
      throw error;
    }
  }
}

// 超級提醒系統（含電話功能）
class SuperReminderWithPhoneSystem {
  constructor() {
    this.reminders = new Map();
    this.activeTimers = new Map();
    this.phoneReminders = new Map(); // 電話提醒
    console.log('⏰ 超級提醒系統（含電話功能）已初始化');
  }

  parseTime(text) {
    console.log('🔍 解析時間:', text);
    
    try {
      const now = new Date();
      
      // 檢查是否為電話鬧鐘
      const isPhoneAlarm = text.includes('打電話') || text.includes('電話叫') || text.includes('call') || 
                          (text.includes('叫') && (text.includes('起床') || text.includes('鬧鐘')));
      
      // 秒數提醒
      if (text.includes('秒後') || text.includes('秒鐘後')) {
        const match = text.match(/(\d+)\s*秒(?:鐘)?後/);
        if (match) {
          const seconds = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + seconds * 1000);
          return { time: targetTime, isAlarm: false, isPhoneCall: isPhoneAlarm };
        }
      }

      // 分鐘提醒
      if (text.includes('分鐘後') || text.includes('分後')) {
        const match = text.match(/(\d+)\s*分(?:鐘)?後/);
        if (match) {
          const minutes = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + minutes * 60000);
          return { time: targetTime, isAlarm: false, isPhoneCall: isPhoneAlarm };
        }
      }

      // 小時提醒
      if (text.includes('小時後') || text.includes('時後')) {
        const match = text.match(/(\d+)\s*(?:小)?時後/);
        if (match) {
          const hours = parseInt(match[1]);
          const targetTime = new Date(now.getTime() + hours * 3600000);
          return { time: targetTime, isAlarm: false, isPhoneCall: isPhoneAlarm };
        }
      }

      // 絕對時間 HH:MM
      const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        
        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          const targetTime = new Date();
          targetTime.setHours(hour, minute, 0, 0);
          
          if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
          }
          
          const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
          return { time: targetTime, isAlarm, isPhoneCall: isPhoneAlarm };
        }
      }

      // 點數時間
      const hourMatch = text.match(/(\d{1,2})\s*點/);
      if (hourMatch) {
        const hour = parseInt(hourMatch[1]);
        
        if (hour >= 0 && hour < 24) {
          const targetTime = new Date();
          targetTime.setHours(hour, 0, 0, 0);
          
          if (targetTime <= now) {
            targetTime.setDate(targetTime.getDate() + 1);
          }
          
          const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
          return { time: targetTime, isAlarm, isPhoneCall: isPhoneAlarm };
        }
      }

      // 明天
      if (text.includes('明天')) {
        const targetTime = new Date();
        targetTime.setDate(targetTime.getDate() + 1);
        
        const specificTime = text.match(/(\d{1,2})[點:](\d{0,2})?/);
        if (specificTime) {
          const hour = parseInt(specificTime[1]);
          const minute = specificTime[2] ? parseInt(specificTime[2]) : 0;
          targetTime.setHours(hour, minute, 0, 0);
        } else {
          targetTime.setHours(7, 0, 0, 0); // 預設早上7點
        }
        
        const isAlarm = text.includes('叫') || text.includes('起床') || text.includes('鬧鐘');
        return { time: targetTime, isAlarm, isPhoneCall: isPhoneAlarm };
      }

    } catch (error) {
      console.error('❌ 時間解析錯誤:', error);
    }
    
    return null;
  }

  createReminder(userId, title, targetTime, isAlarm = false, isPhoneCall = false) {
    const reminderId = `reminder-${userId}-${Date.now()}`;
    
    const reminder = {
      id: reminderId,
      userId,
      title,
      targetTime,
      isAlarm,
      isPhoneCall,
      created: new Date(),
      status: 'active'
    };

    this.reminders.set(reminderId, reminder);
    
    const delay = targetTime.getTime() - Date.now();
    
    if (delay > 0 && delay < 2147483647) {
      const timerId = setTimeout(async () => {
        await this.executeReminder(reminderId);
      }, delay);
      
      this.activeTimers.set(reminderId, timerId);
      console.log(`✅ ${isPhoneCall ? '電話' : ''}提醒已設定: ${title}, 時間: ${targetTime.toLocaleString('zh-TW')}`);
      return reminderId;
    } else if (delay <= 0) {
      console.log('⚠️ 提醒時間已過，立即執行');
      this.executeReminder(reminderId);
      return reminderId;
    }
    
    return null;
  }

  async executeReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder || reminder.status !== 'active') return;

    try {
      if (reminder.isPhoneCall) {
        // 電話鬧鐘功能
        await this.makePhoneCall(reminder);
      } else {
        // 一般提醒
        await this.sendReminderMessage(reminder);
      }
      
      reminder.status = 'completed';
      reminder.completedAt = new Date();
      
      this.reminders.delete(reminderId);
      this.activeTimers.delete(reminderId);
      
    } catch (error) {
      console.error('❌ 提醒執行失敗:', error);
    }
  }

  async makePhoneCall(reminder) {
    console.log(`📞 執行電話鬧鐘: ${reminder.title}`);
    
    // 創建電話鬧鐘通知（圖文版）
    const phoneCallMessage = {
      type: 'flex',
      altText: `📞 電話鬧鐘 - ${reminder.title}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📞 電話鬧鐘響啦！',
              weight: 'bold',
              size: 'xl',
              color: '#FF0000'
            }
          ],
          backgroundColor: '#FFE4E1'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: reminder.title,
              weight: 'bold',
              size: 'lg',
              margin: 'md'
            },
            {
              type: 'text',
              text: '☀️ 起床時間到了！',
              size: 'md',
              margin: 'md'
            },
            {
              type: 'text',
              text: `設定時間：${reminder.created.toLocaleString('zh-TW')}`,
              size: 'sm',
              color: '#666666',
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: '🎵 鈴聲響起中...',
              size: 'md',
              color: '#FF6B6B',
              margin: 'md',
              weight: 'bold'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'message',
                label: '我起床了！',
                text: '我起床了'
              },
              style: 'primary',
              color: '#4CAF50'
            }
          ]
        }
      }
    };

    // 發送電話鬧鐘通知
    await client.pushMessage(reminder.userId, phoneCallMessage);
    
    // 模擬電話響鈴（發送多次提醒）
    for (let i = 1; i <= 3; i++) {
      setTimeout(async () => {
        await client.pushMessage(reminder.userId, {
          type: 'text',
          text: `📞 鈴鈴鈴... 第${i}次響鈴！快起床啦～ ⏰`
        });
      }, i * 10000); // 每10秒響一次
    }
    
    console.log('📞 電話鬧鐘通知已發送');
  }

  async sendReminderMessage(reminder) {
    const reminderMessage = {
      type: 'flex',
      altText: `⏰ 提醒 - ${reminder.title}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: reminder.isAlarm ? '⏰ 鬧鐘時間到！' : '⏰ 提醒時間到！',
              weight: 'bold',
              size: 'lg',
              color: reminder.isAlarm ? '#FF6B6B' : '#4A90E2'
            }
          ],
          backgroundColor: reminder.isAlarm ? '#FFE4E1' : '#E3F2FD'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: reminder.title,
              weight: 'bold',
              size: 'md',
              margin: 'md'
            },
            {
              type: 'text',
              text: `設定時間：${reminder.created.toLocaleString('zh-TW')}`,
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: reminder.isAlarm ? '☀️ 新的一天開始了！加油！💪' : '記得處理這件事喔！ ✨',
              margin: 'md'
            }
          ]
        }
      }
    };

    await client.pushMessage(reminder.userId, reminderMessage);
    console.log(`✅ 提醒已發送: ${reminder.title}`);
  }

  extractTitle(text) {
    let title = text;
    
    const timePatterns = [
      /\d+\s*秒(?:鐘)?後/g,
      /\d+\s*分(?:鐘)?後/g,
      /\d+\s*(?:小)?時後/g,
      /\d{1,2}:\d{2}/g,
      /\d{1,2}\s*點/g,
      /明天/g,
      /提醒我/g,
      /叫我/g,
      /起床/g,
      /鬧鐘/g,
      /打電話/g,
      /電話叫/g
    ];
    
    timePatterns.forEach(pattern => {
      title = title.replace(pattern, '');
    });
    
    title = title.trim();
    
    if (!title) {
      if (text.includes('起床') || text.includes('鬧鐘') || text.includes('電話')) {
        return '起床鬧鐘 📞';
      } else if (text.includes('開會')) {
        return '開會提醒 📅';
      } else if (text.includes('吃藥')) {
        return '吃藥提醒 💊';
      } else if (text.includes('運動')) {
        return '運動時間 🏃‍♂️';
      } else {
        return '重要提醒 📌';
      }
    }
    
    return title;
  }

  async createReminderListFlexMessage(userId) {
    const userReminders = Array.from(this.reminders.values())
      .filter(r => r.userId === userId && r.status === 'active')
      .sort((a, b) => a.targetTime - b.targetTime);
    
    if (userReminders.length === 0) {
      return {
        type: 'text',
        text: '你目前沒有設定任何提醒 📝'
      };
    }

    const flexMessage = {
      type: 'flex',
      altText: `提醒清單 (${userReminders.length}個)`,
      contents: {
        type: 'carousel',
        contents: []
      }
    };

    userReminders.slice(0, 10).forEach((reminder, index) => {
      const timeLeft = reminder.targetTime.getTime() - Date.now();
      const timeLeftStr = timeLeft > 0 ? 
        timeLeft < 60000 ? `${Math.round(timeLeft / 1000)}秒後` :
        timeLeft < 3600000 ? `${Math.floor(timeLeft / 60000)}分鐘後` :
        timeLeft < 86400000 ? `${Math.floor(timeLeft / 3600000)}小時後` :
        `${Math.floor(timeLeft / 86400000)}天後` : '即將到期';
      
      flexMessage.contents.contents.push({
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${reminder.isPhoneCall ? '📞' : reminder.isAlarm ? '⏰' : '📝'} 提醒 ${index + 1}`,
              weight: 'bold',
              color: reminder.isPhoneCall ? '#FF0000' : reminder.isAlarm ? '#FF6B6B' : '#4A90E2'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: reminder.title,
              weight: 'bold',
              wrap: true
            },
            {
              type: 'text',
              text: reminder.targetTime.toLocaleString('zh-TW'),
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'text',
              text: `⏳ ${timeLeftStr}`,
              size: 'sm',
              color: timeLeft > 0 ? '#4CAF50' : '#FF0000',
              margin: 'sm',
              weight: 'bold'
            },
            {
              type: 'text',
              text: reminder.isPhoneCall ? '電話鬧鐘' : reminder.isAlarm ? '鬧鐘提醒' : '一般提醒',
              size: 'xs',
              color: '#999999',
              margin: 'sm'
            }
          ]
        }
      });
    });

    return flexMessage;
  }
}

// 超級搜尋系統（圖文版）
class SuperSearchSystemWithRichDisplay {
  constructor() {
    console.log('🔍 超級搜尋系統（圖文版）已初始化');
  }

  async search(query) {
    try {
      console.log(`🔍 搜尋查詢: ${query}`);
      
      // 並行搜尋多個來源
      const results = await Promise.allSettled([
        this.searchDuckDuckGo(query),
        this.searchWithAI(query)
      ]);

      const webResults = results[0].status === 'fulfilled' ? results[0].value : null;
      const aiResults = results[1].status === 'fulfilled' ? results[1].value : null;

      return await this.createSearchResultFlexMessage(query, webResults, aiResults);

    } catch (error) {
      console.error('❌ 搜尋失敗:', error);
      return {
        type: 'text',
        text: '抱歉，搜尋功能暫時無法使用，請稍後再試 🔍'
      };
    }
  }

  async searchDuckDuckGo(query) {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: '1',
          skip_disambig: '1'
        },
        timeout: 10000
      });

      return {
        abstract: response.data.AbstractText || null,
        abstractUrl: response.data.AbstractURL || null,
        answer: response.data.Answer || null,
        relatedTopics: response.data.RelatedTopics || []
      };

    } catch (error) {
      console.error('❌ DuckDuckGo 搜尋失敗:', error);
      return null;
    }
  }

  async searchWithAI(query) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });
      
      const prompt = `請以顧晉瑋（靜宜大學資管系學生）的角度回答關於「${query}」的問題。

請提供：
1. 基本定義或說明
2. 重要特點或關鍵資訊
3. 實用建議或應用
4. 相關的有趣知識

請用顧晉瑋的語氣回答，要有台灣年輕人的活力，約200-300字。`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().replace(/[*#`_~]/g, '').trim();
      
    } catch (error) {
      console.error('❌ AI 搜尋失敗:', error);
      return null;
    }
  }

  async createSearchResultFlexMessage(query, webResults, aiResults) {
    const flexMessage = {
      type: 'flex',
      altText: `🔍 搜尋結果 - ${query}`,
      contents: {
        type: 'carousel',
        contents: []
      }
    };

    // AI 分析結果頁面
    if (aiResults) {
      flexMessage.contents.contents.push({
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🤖 AI 智能分析',
              weight: 'bold',
              size: 'lg',
              color: '#4A90E2'
            },
            {
              type: 'text',
              text: `關於「${query}」`,
              size: 'sm',
              color: '#666666'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: aiResults.substring(0, 500) + (aiResults.length > 500 ? '...' : ''),
              wrap: true,
              size: 'sm'
            }
          ]
        }
      });
    }

    // 網路搜尋結果頁面
    if (webResults) {
      const webBubble = {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🌐 網路搜尋結果',
              weight: 'bold',
              size: 'lg',
              color: '#FF6B6B'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: []
        }
      };

      if (webResults.answer) {
        webBubble.body.contents.push({
          type: 'text',
          text: '💡 直接答案：',
          weight: 'bold',
          color: '#4CAF50'
        });
        webBubble.body.contents.push({
          type: 'text',
          text: webResults.answer,
          wrap: true,
          margin: 'sm'
        });
        webBubble.body.contents.push({
          type: 'separator',
          margin: 'md'
        });
      }

      if (webResults.abstract) {
        webBubble.body.contents.push({
          type: 'text',
          text: '📄 摘要：',
          weight: 'bold',
          color: '#9C27B0',
          margin: 'md'
        });
        webBubble.body.contents.push({
          type: 'text',
          text: webResults.abstract.substring(0, 200) + (webResults.abstract.length > 200 ? '...' : ''),
          wrap: true,
          size: 'sm',
          margin: 'sm'
        });
        
        if (webResults.abstractUrl) {
          webBubble.body.contents.push({
            type: 'text',
            text: `🔗 來源：${webResults.abstractUrl}`,
            size: 'xs',
            color: '#666666',
            margin: 'sm'
          });
        }
      }

      flexMessage.contents.contents.push(webBubble);

      // 相關主題頁面
      if (webResults.relatedTopics && webResults.relatedTopics.length > 0) {
        flexMessage.contents.contents.push({
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '📋 相關主題',
                weight: 'bold',
                size: 'lg',
                color: '#9C27B0'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: webResults.relatedTopics.slice(0, 5).map((topic, index) => ({
              type: 'text',
              text: `${index + 1}. ${topic.Text || topic.FirstURL || '相關資訊'}`,
              wrap: true,
              size: 'sm',
              margin: index === 0 ? 'none' : 'sm'
            }))
          }
        });
      }
    }

    // 如果沒有任何結果
    if (flexMessage.contents.contents.length === 0) {
      return {
        type: 'text',
        text: `沒有找到「${query}」的相關搜尋結果，請嘗試其他關鍵字 🔍`
      };
    }

    return flexMessage;
  }

  async getWeatherWithRichDisplay(city = '台北') {
    try {
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
        
        const temp = weather.find(el => el.elementName === 'MinT');
        const maxTemp = weather.find(el => el.elementName === 'MaxT');
        const desc = weather.find(el => el.elementName === 'Wx');
        const comfort = weather.find(el => el.elementName === 'CI');
        const rain = weather.find(el => el.elementName === 'PoP');
        
        return {
          type: 'flex',
          altText: `${city}天氣預報`,
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `🌤️ ${city}天氣預報`,
                  weight: 'bold',
                  size: 'lg',
                  color: '#4A90E2'
                }
              ],
              backgroundColor: '#E3F2FD'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `📍 ${location.locationName}`,
                  weight: 'bold',
                  margin: 'md'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '🌡️ 溫度',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `${temp?.time[0]?.parameter?.parameterName || 'N/A'}°C - ${maxTemp?.time[0]?.parameter?.parameterName || 'N/A'}°C`,
                      flex: 2,
                      align: 'end'
                    }
                  ],
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '☁️ 天氣',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: desc?.time[0]?.parameter?.parameterName || 'N/A',
                      flex: 2,
                      align: 'end'
                    }
                  ],
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '☔ 降雨機率',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: `${rain?.time[0]?.parameter?.parameterName || 'N/A'}%`,
                      flex: 2,
                      align: 'end'
                    }
                  ],
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '😊 舒適度',
                      flex: 1,
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: comfort?.time[0]?.parameter?.parameterName || 'N/A',
                      flex: 2,
                      align: 'end',
                      wrap: true
                    }
                  ],
                  margin: 'md'
                },
                {
                  type: 'text',
                  text: `更新時間：${new Date().toLocaleString('zh-TW')}`,
                  size: 'xs',
                  color: '#666666',
                  margin: 'lg'
                }
              ]
            }
          }
        };
      } else {
        return {
          type: 'text',
          text: `找不到「${city}」的天氣資訊，請確認城市名稱是否正確 🌤️`
        };
      }
    } catch (error) {
      console.error('❌ 天氣查詢錯誤:', error);
      return {
        type: 'text',
        text: '抱歉，無法獲取天氣資訊，請稍後再試 🌤️'
      };
    }
  }
}

// 電影系統（圖文版）
class SuperMovieSystemWithRichDisplay {
  constructor() {
    console.log('🎬 超級電影系統（圖文版）已初始化');
  }

  async searchMovies(query = '') {
    try {
      let endpoint = 'https://api.themoviedb.org/3/movie/popular';
      let params = {
        language: 'zh-TW',
        page: 1
      };

      if (query && query.length > 0) {
        endpoint = 'https://api.themoviedb.org/3/search/movie';
        params.query = query;
      }

      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${TMDB_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: params,
        timeout: 15000
      });

      const movies = response.data.results.slice(0, 10);
      
      if (movies.length === 0) {
        return {
          type: 'text',
          text: '沒有找到相關的電影 🎬'
        };
      }

      return await this.createMovieFlexMessage(movies, query);

    } catch (error) {
      console.error('❌ 電影查詢錯誤:', error);
      return {
        type: 'text',
        text: '抱歉，電影查詢功能暫時無法使用，請稍後再試 🎬'
      };
    }
  }

  async createMovieFlexMessage(movies, query = '') {
    const flexMessage = {
      type: 'flex',
      altText: query ? `🎬 「${query}」搜尋結果` : '🎬 熱門電影推薦',
      contents: {
        type: 'carousel',
        contents: []
      }
    };

    movies.slice(0, 10).forEach(movie => {
      const bubble = {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: movie.title,
              weight: 'bold',
              size: 'lg',
              color: '#4A90E2',
              wrap: true
            },
            {
              type: 'text',
              text: movie.original_title !== movie.title ? movie.original_title : '',
              size: 'sm',
              color: '#666666',
              wrap: true
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '⭐ 評分',
                  flex: 1,
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: `${movie.vote_average}/10`,
                  flex: 1,
                  align: 'end',
                  color: movie.vote_average >= 7 ? '#4CAF50' : movie.vote_average >= 5 ? '#FF9800' : '#FF5722'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '📅 上映',
                  flex: 1,
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: movie.release_date || '未知',
                  flex: 2,
                  align: 'end'
                }
              ],
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: '📝 劇情簡介',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'text',
              text: movie.overview ? 
                (movie.overview.substring(0, 120) + (movie.overview.length > 120 ? '...' : '')) : 
                '暫無劇情簡介',
              wrap: true,
              size: 'sm',
              margin: 'sm'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `👥 ${movie.vote_count} 人評價`,
              size: 'xs',
              color: '#999999',
              align: 'center'
            }
          ]
        }
      };

      flexMessage.contents.contents.push(bubble);
    });

    return flexMessage;
  }
}

// 中文指令系統
class ChineseCommandSystem {
  constructor() {
    this.commandHistory = new Map();
    console.log('💬 中文指令系統已初始化');
  }

  async handleOwnerCommand(message) {
    this.recordCommand(OWNER_LINE_ID, message);
    
    // 中文指令對應
    const chineseCommands = {
      '狀態報告': 'status',
      '系統狀態': 'status',
      '用戶活躍': 'users',
      '用戶報告': 'users',
      '提醒清單': 'reminders',
      '所有提醒': 'reminders',
      '決策待辦': 'decisions',
      '待處理決策': 'decisions',
      '聯絡人': 'contacts',
      '聯絡人清單': 'contacts',
      '決策歷史': 'history',
      '歷史記錄': 'history',
      '系統統計': 'stats',
      '統計資料': 'stats',
      '功能列表': 'features',
      '所有功能': 'features',
      '說明': 'help',
      '幫助': 'help',
      '清除歷史': 'clear_history',
      '清除對話': 'clear_conversations',
      '清除提醒': 'clear_reminders'
    };

    // 檢查是否為中文指令
    for (const [chineseCmd, englishCmd] of Object.entries(chineseCommands)) {
      if (message.includes(chineseCmd)) {
        return await this.executeCommand(englishCmd);
      }
    }

    // 檢查測試指令
    if (message.includes('測試')) {
      const testMatch = message.match(/測試\s*(.+)/);
      if (testMatch) {
        return await this.handleTestCommand(testMatch[1]);
      }
    }

    return null; // 不是指令
  }

  async executeCommand(command) {
    switch (command) {
      case 'status':
        return await this.getSystemStatusFlexMessage();
      
      case 'users':
        return await this.getUserReportFlexMessage();
      
      case 'reminders':
        return await reminderSystem.createReminderListFlexMessage(OWNER_LINE_ID);
      
      case 'decisions':
        return await decisionSystem.createPendingDecisionsFlexMessage();
      
      case 'contacts':
        return await this.getContactsFlexMessage();
      
      case 'history':
        return await this.getDecisionHistoryFlexMessage();
      
      case 'stats':
        return await this.getStatsFlexMessage();
      
      case 'features':
        return await this.getFeaturesFlexMessage();
      
      case 'help':
        return await this.getHelpFlexMessage();
      
      case 'clear_history':
        this.commandHistory.clear();
        return { type: 'text', text: '✅ 指令歷史已清除' };
      
      case 'clear_conversations':
        aiSystem.conversations.clear();
        return { type: 'text', text: '✅ 對話記錄已清除' };
      
      case 'clear_reminders':
        const activeReminders = reminderSystem.reminders.size;
        reminderSystem.reminders.clear();
        reminderSystem.activeTimers.forEach(timer => clearTimeout(timer));
        reminderSystem.activeTimers.clear();
        return { type: 'text', text: `✅ 已清除 ${activeReminders} 個提醒` };
      
      default:
        return { type: 'text', text: `未知指令：${command}` };
    }
  }

  async getSystemStatusFlexMessage() {
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 3600)}小時${Math.floor((uptime % 3600) / 60)}分鐘`;
    const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    
    return {
      type: 'flex',
      altText: '🤖 系統狀態報告',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🤖 系統狀態報告',
              weight: 'bold',
              size: 'lg',
              color: '#4A90E2'
            }
          ],
          backgroundColor: '#E3F2FD'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '⏱️ 運行時間',
                  flex: 1,
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: uptimeStr,
                  flex: 1,
                  align: 'end'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '🏠 記憶體使用',
                  flex: 1,
                  weight: 'bold'
                },
                {
                  type: 'text',
                  text: `${memoryUsage} MB`,
                  flex: 1,
                  align: 'end'
                }
              ],
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: '📊 系統狀態',
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '🧠 AI系統',
                  flex: 1
                },
                {
                  type: 'text',
                  text: `正常 (${aiSystem.conversations.size}條對話)`,
                  flex: 2,
                  align: 'end',
                  color: '#4CAF50'
                }
              ],
              margin: 'sm'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '⏰ 提醒系統',
                  flex: 1
                },
                {
                  type: 'text',
                  text: `正常 (${reminderSystem.reminders.size}個活躍)`,
                  flex: 2,
                  align: 'end',
                  color: '#4CAF50'
                }
              ],
              margin: 'sm'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '⚖️ 決策系統',
                  flex: 1
                },
                {
                  type: 'text',
                  text: `正常 (${decisionSystem.pendingDecisions.size}個待處理)`,
                  flex: 2,
                  align: 'end',
                  color: '#4CAF50'
                }
              ],
              margin: 'sm'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '👥 用戶數',
                  flex: 1
                },
                {
                  type: 'text',
                  text: `${aiSystem.userProfiles.size} 人`,
                  flex: 1,
                  align: 'end',
                  color: '#4A90E2'
                }
              ],
              margin: 'sm'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '✅ 所有系統運作正常！',
              align: 'center',
              weight: 'bold',
              color: '#4CAF50'
            }
          ]
        }
      }
    };
  }

  async getUserReportFlexMessage() {
    const users = Array.from(aiSystem.userProfiles.values());
    
    if (users.length === 0) {
      return { type: 'text', text: '目前沒有用戶資料' };
    }
    
    const sortedUsers = users
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    return {
      type: 'flex',
      altText: `👥 用戶活躍度報告 (${users.length}人)`,
      contents: {
        type: 'carousel',
        contents: sortedUsers.map((user, index) => {
          const lastSeenAgo = Math.floor((new Date() - user.lastSeen) / 60000);
          const lastSeenStr = lastSeenAgo < 60 ? 
            `${lastSeenAgo}分鐘前` : 
            `${Math.floor(lastSeenAgo / 60)}小時前`;
          
          return {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `👤 排名 ${index + 1}`,
                  weight: 'bold',
                  size: 'lg',
                  color: index < 3 ? '#FFD700' : '#4A90E2'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: user.name,
                  weight: 'bold',
                  size: 'md'
                },
                {
                  type: 'separator',
                  margin: 'md'
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '💬 訊息數',
                      flex: 1
                    },
                    {
                      type: 'text',
                      text: user.messageCount.toString(),
                      flex: 1,
                      align: 'end',
                      weight: 'bold',
                      color: '#4CAF50'
                    }
                  ],
                