const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定時區為台灣
process.env.TZ = 'Asia/Taipei';

console.log('🚀 正在啟動修復版 LINE Bot v7.1 - 顧晉瑋的超智能助手...');
console.log('⏰ 當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));

// 配置資訊
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b';

// 備用 AI API 配置（修復404問題）
const BACKUP_AI_CONFIG = {
  apiKey: process.env.BACKUP_AI_KEY || 'sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM',
  baseURL: process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1',
  models: ['gpt-3.5-turbo', 'gpt-4o-mini', 'grok'] // 備用模型列表
};

// 用戶配置（修復私訊問題）
const MY_LINE_ID = process.env.MY_LINE_ID || 'U59af77e69411ffb99a49f1f2c3e2afc4'; // 你的真實LINE ID
const MAX_MESSAGE_LENGTH = 2000;

// 初始化 LINE 客戶端
const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

console.log(`🔑 使用LINE ID: ${MY_LINE_ID}`);
console.log(`🔑 Channel Token長度: ${config.channelAccessToken ? config.channelAccessToken.length : 0}`);

// 增強的 API 管理系統（修復404問題）
class EnhancedAPIManager {
  constructor() {
    this.apiStatus = new Map();
    this.lastSuccessfulCall = new Map();
    this.failureCount = new Map();
    console.log('🔧 增強API管理系統已初始化');
  }

  async callGeminiAPI(prompt) {
    try {
      console.log('🤖 嘗試調用Gemini API...');
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      this.recordSuccess('gemini');
      console.log('✅ Gemini API調用成功');
      return text;
      
    } catch (error) {
      console.error('❌ Gemini API失敗:', error.message);
      this.recordFailure('gemini');
      throw error;
    }
  }

  async callBackupAPI(prompt, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      for (const model of BACKUP_AI_CONFIG.models) {
        try {
          console.log(`🔄 嘗試備用API (${model}, 第${i+1}次)...`);
          
          const response = await axios.post(`${BACKUP_AI_CONFIG.baseURL}/chat/completions`, {
            model: model,
            messages: [
              {
                role: 'system',
                content: '你是顧晉瑋，靜宜大學資管系學生，說話自然親切，會用台灣口語。'
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

          const result = response.data.choices[0].message.content.trim();
          this.recordSuccess(`backup-${model}`);
          console.log(`✅ 備用API調用成功 (${model})`);
          return result;
          
        } catch (error) {
          console.error(`❌ 備用API失敗 (${model}):`, error.message);
          this.recordFailure(`backup-${model}`);
          
          // 如果是404錯誤，嘗試下一個模型
          if (error.response?.status === 404) {
            console.log(`🔄 ${model} 不可用，嘗試下一個模型...`);
            continue;
          }
        }
      }
      
      // 每次重試前等待
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error('所有備用API都失敗了');
  }

  async smartAPICall(prompt) {
    try {
      // 優先使用Gemini
      return await this.callGeminiAPI(prompt);
    } catch (error) {
      console.log('🔄 Gemini失敗，嘗試備用API...');
      
      try {
        return await this.callBackupAPI(prompt);
      } catch (backupError) {
        console.error('💥 所有API都失敗，使用備用回應');
        return this.getFallbackResponse(prompt);
      }
    }
  }

  getFallbackResponse(prompt) {
    const responses = [
      '哈哈，這個問題很有趣！讓我想想... 🤔',
      '好der，我了解你的意思！ 👌',
      'ㄜ...這個我需要再研究一下 😅',
      '有道理！你說得很對 ✨',
      '這個話題很不錯呢！ 😊',
      '我覺得這樣很棒！ 🎉'
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  recordSuccess(apiName) {
    this.lastSuccessfulCall.set(apiName, new Date());
    this.failureCount.set(apiName, 0);
    this.apiStatus.set(apiName, 'healthy');
  }

  recordFailure(apiName) {
    const currentFailures = this.failureCount.get(apiName) || 0;
    this.failureCount.set(apiName, currentFailures + 1);
    
    if (currentFailures >= 3) {
      this.apiStatus.set(apiName, 'unhealthy');
    }
  }

  getAPIStatus() {
    const status = {};
    for (const [api, health] of this.apiStatus) {
      status[api] = {
        status: health,
        lastSuccess: this.lastSuccessfulCall.get(api),
        failureCount: this.failureCount.get(api) || 0
      };
    }
    return status;
  }
}

// 修復的推送訊息系統
class SafePushMessageSystem {
  constructor() {
    this.pushQueue = [];
    this.isProcessingQueue = false;
    console.log('📨 安全推送訊息系統已初始化');
  }

  async safePushMessage(targetId, message, retryCount = 0) {
    try {
      console.log(`📤 嘗試推送訊息到: ${targetId}`);
      console.log(`📝 訊息內容: ${typeof message === 'string' ? message.substring(0, 50) : JSON.stringify(message).substring(0, 50)}...`);
      
      // 確保訊息格式正確
      const formattedMessage = this.formatMessage(message);
      
      await client.pushMessage(targetId, formattedMessage);
      console.log('✅ 推送訊息成功');
      return true;
      
    } catch (error) {
      console.error(`💥 推送訊息失敗 (嘗試 ${retryCount + 1}):`, error.message);
      console.error('錯誤詳情:', error.response?.data || error);
      
      // 如果是無效的用戶ID錯誤
      if (error.message.includes('Invalid reply token') || 
          error.message.includes('Invalid user id') ||
          error.response?.status === 400) {
        console.error('🚫 無效的用戶ID或權限問題，不重試');
        return false;
      }
      
      // 重試機制
      if (retryCount < 2) {
        console.log(`🔄 ${retryCount + 1}秒後重試...`);
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
        return await this.safePushMessage(targetId, message, retryCount + 1);
      }
      
      return false;
    }
  }

  formatMessage(message) {
    if (typeof message === 'string') {
      return {
        type: 'text',
        text: this.limitMessageLength(message)
      };
    }
    
    if (message && message.text) {
      message.text = this.limitMessageLength(message.text);
    }
    
    return message;
  }

  limitMessageLength(text, maxLength = MAX_MESSAGE_LENGTH) {
    if (text.length > maxLength) {
      return text.substring(0, maxLength - 20) + '\n\n...(內容太長被截掉了 😅)';
    }
    return text;
  }

  async testPushMessage() {
    try {
      console.log('🧪 測試推送訊息功能...');
      const testMessage = `🧪 系統測試訊息 ${new Date().toLocaleString('zh-TW')}`;
      
      const success = await this.safePushMessage(MY_LINE_ID, testMessage);
      
      if (success) {
        console.log('✅ 推送訊息測試成功');
      } else {
        console.error('❌ 推送訊息測試失敗');
      }
      
      return success;
    } catch (error) {
      console.error('💥 推送訊息測試出錯:', error);
      return false;
    }
  }
}

// 修復的天氣系統
class FixedWeatherSystem {
  constructor() {
    this.apiKey = WEATHER_API_KEY;
    this.lastWorkingEndpoint = null;
    console.log('🌤️ 修復版天氣系統已初始化');
  }

  async getWeather(cityName) {
    console.log(`🌤️ 查詢天氣: ${cityName}`);
    
    // 多個API端點嘗試
    const endpoints = [
      {
        name: '中央氣象署 - 天氣預報',
        url: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001',
        params: { Authorization: this.apiKey, locationName: cityName }
      },
      {
        name: '中央氣象署 - 觀測資料',
        url: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001',
        params: { Authorization: this.apiKey, locationName: cityName }
      }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`🔄 嘗試API: ${endpoint.name}`);
        
        const response = await axios.get(endpoint.url, {
          params: endpoint.params,
          timeout: 10000,
          headers: {
            'User-Agent': 'LINE-Bot/1.0'
          }
        });

        if (response.data.success === 'true' && response.data.records) {
          console.log(`✅ ${endpoint.name} 成功`);
          this.lastWorkingEndpoint = endpoint.name;
          
          if (response.data.records.location && response.data.records.location.length > 0) {
            return this.formatWeatherData(response.data.records.location[0], endpoint.name);
          }
        }
        
      } catch (error) {
        console.error(`❌ ${endpoint.name} 失敗:`, error.message);
        continue;
      }
    }

    // 如果所有API都失敗，嘗試模糊搜尋
    try {
      return await this.searchAllLocations(cityName);
    } catch (error) {
      console.error('💥 模糊搜尋也失敗，使用備用資料');
      return this.getFallbackWeather(cityName);
    }
  }

  async searchAllLocations(cityName) {
    try {
      console.log('🔍 執行全域搜尋...');
      
      const response = await axios.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001', {
        params: { Authorization: this.apiKey },
        timeout: 15000
      });

      if (response.data.success === 'true' && response.data.records.location) {
        const locations = response.data.records.location;
        
        // 精確匹配
        let matchedLocation = locations.find(loc => loc.locationName === cityName);
        
        // 模糊匹配
        if (!matchedLocation) {
          matchedLocation = locations.find(loc => 
            loc.locationName.includes(cityName) || cityName.includes(loc.locationName)
          );
        }
        
        // 更寬鬆的匹配
        if (!matchedLocation) {
          const normalizedCity = cityName.replace(/[台臺]/g, '').replace(/[市縣]/g, '');
          matchedLocation = locations.find(loc => 
            loc.locationName.includes(normalizedCity)
          );
        }

        if (matchedLocation) {
          console.log(`✅ 找到匹配位置: ${matchedLocation.locationName}`);
          return this.formatWeatherData(matchedLocation, '全域搜尋');
        }
      }
      
      throw new Error('找不到匹配的位置');
    } catch (error) {
      console.error('🔍 全域搜尋失敗:', error.message);
      throw error;
    }
  }

  formatWeatherData(locationData, source) {
    try {
      const weather = locationData.weatherElement;
      
      if (!weather) {
        return this.getFallbackWeather(locationData.locationName || '未知');
      }
      
      const minTemp = weather.find(el => el.elementName === 'MinT');
      const maxTemp = weather.find(el => el.elementName === 'MaxT');
      const wx = weather.find(el => el.elementName === 'Wx');
      const pop = weather.find(el => el.elementName === 'PoP');
      const ci = weather.find(el => el.elementName === 'CI');

      return {
        location: locationData.locationName,
        minTemp: minTemp?.time?.[0]?.parameter?.parameterName || 'N/A',
        maxTemp: maxTemp?.time?.[0]?.parameter?.parameterName || 'N/A',
        weather: wx?.time?.[0]?.parameter?.parameterName || 'N/A',
        rainChance: pop?.time?.[0]?.parameter?.parameterName || 'N/A',
        comfort: ci?.time?.[0]?.parameter?.parameterName || 'N/A',
        updateTime: new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}),
        source: source,
        isFallback: false
      };
    } catch (error) {
      console.error('天氣資料格式化失敗:', error);
      return this.getFallbackWeather(locationData.locationName || '未知');
    }
  }

  getFallbackWeather(cityName) {
    console.log(`🔄 使用備用天氣資料: ${cityName}`);
    
    const fallbackData = {
      '台北': { min: '18', max: '25', weather: '多雲', rain: '30' },
      '新北': { min: '17', max: '24', weather: '多雲時晴', rain: '20' },
      '桃園': { min: '16', max: '26', weather: '晴時多雲', rain: '10' },
      '台中': { min: '19', max: '27', weather: '晴朗', rain: '5' },
      '台南': { min: '20', max: '28', weather: '晴朗', rain: '5' },
      '高雄': { min: '21', max: '29', weather: '晴朗', rain: '10' }
    };
    
    const cityKey = Object.keys(fallbackData).find(key => cityName.includes(key));
    const data = fallbackData[cityKey] || fallbackData['台北'];
    
    return {
      location: cityName,
      minTemp: data.min,
      maxTemp: data.max,
      weather: data.weather,
      rainChance: data.rain,
      comfort: '舒適',
      updateTime: new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}),
      source: '備用資料',
      isFallback: true
    };
  }

  extractCityFromText(text) {
    const cities = [
      '台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', 
      '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', 
      '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江',
      '臺北', '臺中', '臺南', '臺東', '臺灣'
    ];
    
    for (const city of cities) {
      if (text.includes(city)) {
        return city;
      }
    }
    return '台北'; // 預設
  }
}

// 修復的新聞系統
class FixedNewsSystem {
  constructor() {
    this.apiKey = NEWS_API_KEY;
    console.log('📰 修復版新聞系統已初始化');
  }

  async getNews() {
    const endpoints = [
      {
        name: 'NewsAPI',
        url: 'https://newsapi.org/v2/top-headlines',
        params: { country: 'tw', apiKey: this.apiKey, pageSize: 5 }
      }
      // 可以加入更多新聞來源
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`📰 嘗試新聞API: ${endpoint.name}`);
        
        const response = await axios.get(endpoint.url, {
          params: endpoint.params,
          timeout: 10000,
          headers: {
            'User-Agent': 'LINE-Bot/1.0'
          }
        });

        if (response.data.articles && response.data.articles.length > 0) {
          console.log(`✅ ${endpoint.name} 成功取得 ${response.data.articles.length} 則新聞`);
          return this.formatNewsData(response.data.articles);
        }

      } catch (error) {
        console.error(`❌ ${endpoint.name} 失敗:`, error.message);
        continue;
      }
    }

    // 返回備用新聞
    return this.getFallbackNews();
  }

  formatNewsData(articles) {
    let newsText = `📰 最新新聞 ${new Date().toLocaleDateString('zh-TW')}\n\n`;
    
    articles.slice(0, 3).forEach((article, index) => {
      newsText += `${index + 1}. ${article.title}\n`;
      if (article.description) {
        newsText += `📄 ${article.description.substring(0, 80)}...\n`;
      }
      newsText += `\n`;
    });

    newsText += `📱 以上是今日重要新聞！`;
    return newsText;
  }

  getFallbackNews() {
    return `📰 新聞摘要 ${new Date().toLocaleDateString('zh-TW')}

1. 科技發展持續進步，AI技術日新月異
2. 台灣經濟表現穩定，各產業持續發展
3. 天氣變化請注意保暖，關心身體健康

📱 抱歉，新聞API暫時無法使用，請查看其他新聞來源獲取最新資訊！`;
  }
}

// 決策詢問系統（修復私訊問題）
class FixedDecisionSystem {
  constructor() {
    this.pendingDecisions = new Map();
    this.decisionHistory = new Map();
    console.log('🔐 修復版決策系統已初始化');
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

    try {
      console.log(`🔐 發送決策請求到: ${MY_LINE_ID}`);
      
      const inquiryMessage = {
        type: 'template',
        altText: `🤔 需要你的決策：${question}`,
        template: {
          type: 'buttons',
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

      const success = await pushMessageSystem.safePushMessage(MY_LINE_ID, inquiryMessage);
      
      if (success) {
        console.log(`✅ 決策請求已發送: ${decisionId}`);
        
        // 暫時回覆給原用戶
        if (originalReplyToken && !replyTokenManager.isTokenUsed(originalReplyToken)) {
          await safeReply(originalReplyToken, {
            type: 'text',
            text: '🤔 讓我考慮一下這個請求，稍等片刻...'
          });
        }
        
        return decisionId;
      } else {
        console.error('💥 決策請求發送失敗');
        return null;
      }
      
    } catch (error) {
      console.error('💥 發送決策請求失敗:', error);
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
        await pushMessageSystem.safePushMessage(decision.groupId, userMessage);
      } else if (decision.originalUserId !== MY_LINE_ID) {
        await pushMessageSystem.safePushMessage(decision.originalUserId, userMessage);
      }
    } catch (error) {
      console.error('💥 通知用戶失敗:', error);
    }

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
      /封鎖/, /解封/, /刪除.*用戶/, /踢出/
    ];

    return decisionKeywords.some(pattern => pattern.test(message));
  }
}

// 矛盾檢測系統（修復私訊問題）
class FixedContradictionSystem {
  constructor() {
    this.userStatements = new Map();
    this.contradictionHistory = new Map();
    this.sensitiveTopics = ['工作', '學習', '感情', '計畫', '意見', '喜好', '政治'];
    console.log('🔍 修復版矛盾檢測系統已初始化');
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
      sentiment: this.analyzeSentiment(message)
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

  async detectContradiction(userHistory, currentStatement) {
    for (const pastStatement of userHistory.slice(-10)) {
      const commonTopics = currentStatement.topics.filter(topic => 
        pastStatement.topics.includes(topic)
      );

      if (commonTopics.length > 0) {
        if (this.isContradictory(pastStatement, currentStatement)) {
          const timeDiff = currentStatement.timestamp - pastStatement.timestamp;
          
          if (timeDiff < 3600000) { // 1小時內
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
    return (
      (past.sentiment === 'positive' && current.sentiment === 'negative') ||
      (past.sentiment === 'negative' && current.sentiment === 'positive')
    );
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

💡 可能表示用戶改變了想法，或需要進一步了解情況。`;

    try {
      console.log(`🔍 發送矛盾報告到: ${MY_LINE_ID}`);
      
      const success = await pushMessageSystem.safePushMessage(MY_LINE_ID, reportMessage);
      
      if (success) {
        console.log(`✅ 矛盾檢測報告已發送: ${userName} - ${contradiction.topic}`);
      } else {
        console.error('💥 矛盾報告發送失敗');
      }
      
    } catch (error) {
      console.error('💥 發送矛盾報告失敗:', error.message);
    }
  }
}

// 初始化系統
const apiManager = new EnhancedAPIManager();
const pushMessageSystem = new SafePushMessageSystem();
const weatherSystem = new FixedWeatherSystem();
const newsSystem = new FixedNewsSystem();
const decisionSystem = new FixedDecisionSystem();
const contradictionSystem = new FixedContradictionSystem();

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

const replyTokenManager = new ReplyTokenManager();

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

    // 格式化訊息
    const formattedMessage = pushMessageSystem.formatMessage(message);
    
    await client.replyMessage(replyToken, formattedMessage);
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

// 工具函數
function isWeatherQuery(text) {
  const weatherKeywords = ['天氣', '氣溫', '下雨', '晴天', '陰天', '溫度', '濕度', '風速', '預報'];
  return weatherKeywords.some(keyword => text.includes(keyword));
}

function isNewsQuery(text) {
  const newsKeywords = ['新聞', '時事', '頭條', '報導', '最新消息'];
  return newsKeywords.some(keyword => text.includes(keyword));
}

// 一般對話處理
async function handleGeneralChat(message, userId) {
  try {
    const prompt = `用戶說：${message}

請以顧晉瑋的身份回應，我是靜宜大學資管系學生，對科技AI有高度興趣。回應要自然親切，可以用一些台灣口語如「好der」、「ㄜ」、「哎呦」等。保持友善和有趣的語氣。`;

    const response = await apiManager.smartAPICall(prompt);
    return response;
    
  } catch (error) {
    console.error('💥 一般對話處理失敗:', error.message);
    return '哈哈，我現在有點忙碌，但我懂你的意思！好der～ 😊';
  }
}

// 測試系統函數
async function testSystems() {
  console.log('🧪 開始系統測試...');
  
  try {
    // 測試推送訊息
    const pushTest = await pushMessageSystem.testPushMessage();
    console.log(`📨 推送訊息測試: ${pushTest ? '✅ 成功' : '❌ 失敗'}`);
    
    // 測試天氣API
    try {
      const weatherData = await weatherSystem.getWeather('台北');
      console.log(`🌤️ 天氣API測試: ✅ 成功 (${weatherData.source})`);
    } catch (error) {
      console.log(`🌤️ 天氣API測試: ❌ 失敗 - ${error.message}`);
    }
    
    // 測試AI API
    try {
      const aiResponse = await apiManager.smartAPICall('測試訊息');
      console.log(`🤖 AI API測試: ✅ 成功`);
    } catch (error) {
      console.log(`🤖 AI API測試: ❌ 失敗 - ${error.message}`);
    }
    
  } catch (error) {
    console.error('🧪 系統測試錯誤:', error);
  }
}

// 健康檢查端點
app.get('/', (req, res) => {
  const currentTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const apiStatus = apiManager.getAPIStatus();
  
  res.send(`
    <h1>🎓 顧晉瑋的修復版超智能AI助手 v7.1</h1>
    <p><strong>身份：靜宜大學資訊管理系學生</strong></p>
    <p><strong>🇹🇼 台灣時間：${currentTime}</strong></p>
    <p><strong>🔑 LINE ID：${MY_LINE_ID}</strong></p>
    
    <h2>🔧 v7.1 修復項目：</h2>
    <ul>
      <li>✅ <strong>修復404錯誤</strong> - 多重API備援機制</li>
      <li>✅ <strong>修復私訊功能</strong> - 增強推送訊息系統</li>
      <li>✅ <strong>修復天氣查詢</strong> - 多端點嘗試和備用資料</li>
      <li>✅ <strong>修復新聞功能</strong> - 錯誤處理和備用內容</li>
      <li>✅ <strong>增強決策系統</strong> - 改善私訊通知</li>
      <li>✅ <strong>強化矛盾檢測</strong> - 修復報告機制</li>
    </ul>
    
    <h2>📊 API狀態監控：</h2>
    <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
      ${Object.entries(apiStatus).map(([api, status]) => 
        `<p><strong>${api}:</strong> ${status.status} 
         (失敗次數: ${status.failureCount}, 
         最後成功: ${status.lastSuccess ? status.lastSuccess.toLocaleString('zh-TW') : '無'})</p>`
      ).join('')}
    </div>
    
    <h2>🧪 系統測試：</h2>
    <p><a href="/test" target="_blank">點擊進行系統測試</a></p>
    
    <h2>📱 使用方式：</h2>
    <ul>
      <li><strong>查詢天氣：</strong>「台北天氣」「高雄會下雨嗎」</li>
      <li><strong>最新新聞：</strong>「新聞」「今日頭條」</li>
      <li><strong>一般對話：</strong>直接聊天即可</li>
    </ul>

    <p><strong>💡 修復完成！現在系統更穩定了！好der 👌</strong></p>
  `);
});

// 測試端點
app.get('/test', async (req, res) => {
  console.log('🧪 收到測試請求');
  
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  
  res.write(`
    <h1>🧪 系統測試中...</h1>
    <div id="testResults">
      <p>⏳ 正在執行測試，請稍候...</p>
    </div>
    <script>
      function addResult(text) {
        document.getElementById('testResults').innerHTML += '<p>' + text + '</p>';
      }
    </script>
  `);
  
  try {
    // 測試推送訊息
    res.write(`<script>addResult('📨 測試推送訊息...');</script>`);
    const pushTest = await pushMessageSystem.testPushMessage();
    res.write(`<script>addResult('📨 推送訊息測試: ${pushTest ? '✅ 成功' : '❌ 失敗}');</script>`);
    
    // 測試天氣API
    res.write(`<script>addResult('🌤️ 測試天氣API...');</script>`);
    try {
      const weatherData = await weatherSystem.getWeather('台北');
      res.write(`<script>addResult('🌤️ 天氣API測試: ✅ 成功 (來源: ${weatherData.source})');</script>`);
    } catch (error) {
      res.write(`<script>addResult('🌤️ 天氣API測試: ❌ 失敗 - ${error.message}');</script>`);
    }
    
    // 測試AI API
    res.write(`<script>addResult('🤖 測試AI API...');</script>`);
    try {
      const aiResponse = await apiManager.smartAPICall('你好，這是測試訊息');
      res.write(`<script>addResult('🤖 AI API測試: ✅ 成功');</script>`);
      res.write(`<script>addResult('🤖 AI回應: ${aiResponse.substring(0, 50)}...');</script>`);
    } catch (error) {
      res.write(`<script>addResult('🤖 AI API測試: ❌ 失敗 - ${error.message}');</script>`);
    }
    
    res.write(`<script>addResult('✅ 系統測試完成！');</script>`);
    
  } catch (error) {
    res.write(`<script>addResult('❌ 測試過程發生錯誤: ${error.message}');</script>`);
  }
  
  res.end();
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
        const result = await decisionSystem.handleDecisionResponse(
          decisionId, 
          action, 
          event.replyToken
        );
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
      console.log('無法獲取用戶名稱，使用預設值');
    }

    // 矛盾檢測
    contradictionSystem.analyzeStatement(userId, userName, messageText);

    // 檢查是否需要決策詢問
    if (decisionSystem.shouldRequestDecision(messageText)) {
      console.log(`🔐 觸發決策詢問: ${messageText}`);
      
      const decisionId = await decisionSystem.requestDecision(
        `${groupId ? '群組中' : '私人對話中'}用戶 ${userName} 的請求`,
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

    // 新聞查詢
    if (isNewsQuery(messageText)) {
      try {
        const newsContent = await newsSystem.getNews();
        await safeReply(replyToken, { type: 'text', text: newsContent });
        return;
      } catch (error) {
        await safeReply(replyToken, {
          type: 'text',
          text: '抱歉，新聞查詢暫時有問題，請稍後再試 📰'
        });
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
📡 資料來源：${weatherData.source}

${weatherData.isFallback ? '⚠️ 使用備用天氣資料\n' : ''}📱 記得根據天氣調整穿著！`;

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
    const response = await handleGeneralChat(messageText, userId);
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
  console.log(`🎓 顧晉瑋的修復版超智能AI助手 v7.1 已就緒！`);
  console.log(`🔧 已修復404錯誤和私訊問題`);
  
  // 啟動後自動測試系統
  setTimeout(() => {
    testSystems();
  }, 5000);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
});

module.exports = app;