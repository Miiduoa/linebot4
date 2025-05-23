const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('正在啟動 LINE Bot...');

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

// 初始化 LINE 客戶端
const client = new line.Client(config);

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 儲存對話歷史 (簡單的記憶體儲存)
const conversationHistory = new Map();

// 健康檢查端點
app.get('/', (req, res) => {
  res.send('LINE Bot is running!');
});

// Webhook 端點 - 先處理原始數據
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) {
    console.log('缺少簽名標頭');
    return res.status(401).send('缺少簽名標頭');
  }

  // 驗證簽名
  const body = req.body.toString();
  const crypto = require('crypto');
  const hash = crypto
    .createHmac('SHA256', config.channelSecret)
    .update(body)
    .digest('base64');

  if (signature !== hash) {
    console.log('簽名驗證失敗');
    return res.status(401).send('簽名驗證失敗');
  }

  // 解析 JSON
  let events;
  try {
    const parsedBody = JSON.parse(body);
    events = parsedBody.events;
  } catch (error) {
    console.error('JSON 解析錯誤:', error);
    return res.status(400).send('無效的 JSON');
  }

  // 處理事件
  Promise
    .all(events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('處理事件錯誤:', err);
      res.status(500).end();
    });
});

// 處理事件
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const messageText = event.message.text.trim();
  
  // 初始化用戶對話歷史
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  
  // 添加用戶訊息到歷史
  const userHistory = conversationHistory.get(userId);
  userHistory.push({ role: 'user', content: messageText });
  
  // 保持歷史記錄在合理範圍內 (最近10條對話)
  if (userHistory.length > 20) {
    userHistory.splice(0, userHistory.length - 20);
  }

  let replyMessage;

  try {
    // 判斷訊息類型並處理
    if (isMenuQuery(messageText)) {
      replyMessage = await createMainMenu();
      return client.replyMessage(event.replyToken, replyMessage);
    } else if (isWeatherQuery(messageText)) {
      replyMessage = await handleWeatherQuery(messageText);
    } else if (isMovieQuery(messageText)) {
      replyMessage = await handleMovieQuery(messageText);
    } else if (isNewsQuery(messageText)) {
      replyMessage = await handleNewsQuery();
    } else {
      // 使用 Gemini 進行一般對話
      const textReply = await handleGeneralChat(messageText, userHistory, event.source);
      replyMessage = {
        type: 'text',
        text: textReply
      };
    }

    // 添加機器人回覆到歷史
    const replyText = typeof replyMessage === 'string' ? replyMessage : 
                     (replyMessage.text || '已處理您的請求');
    userHistory.push({ role: 'assistant', content: replyText });
    
    // 如果回覆是字串，轉換為訊息物件
    if (typeof replyMessage === 'string') {
      replyMessage = {
        type: 'text',
        text: replyMessage
      };
    }
    
    return client.replyMessage(event.replyToken, replyMessage);
  } catch (error) {
    console.error('處理訊息時發生錯誤:', error);
    
    // 更友善的錯誤回應
    const errorMessage = {
      type: 'template',
      altText: '系統暫時忙碌中',
      template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=400&h=300&fit=crop',
        title: '系統暫時忙碌中',
        text: '抱歉，我現在有點忙，請稍後再試或使用以下功能：',
        actions: [
          { type: 'message', label: '功能選單', text: '選單' },
          { type: 'message', label: '天氣查詢', text: '天氣' },
          { type: 'message', label: '電影推薦', text: '電影' }
        ]
      }
    };
    
    return client.replyMessage(event.replyToken, errorMessage);
  }
}

// 判斷是否為天氣查詢
function isWeatherQuery(text) {
  const weatherKeywords = ['天氣', '氣溫', '下雨', '晴天', '陰天', '溫度', '濕度', '風速', '預報', '氣候', '降雨', '多雲'];
  return weatherKeywords.some(keyword => text.includes(keyword)) || 
         /天氣|溫度|下雨|晴|陰|熱|冷|風/.test(text);
}

// 判斷是否為電影查詢
function isMovieQuery(text) {
  const movieKeywords = ['電影', '影片', '上映', '票房', '演員', '導演', '劇情', '推薦', '好看', '院線', '戲院'];
  return movieKeywords.some(keyword => text.includes(keyword)) ||
         /電影|影片|上映|好看|推薦.*電影/.test(text);
}

// 判斷是否為新聞查詢
function isNewsQuery(text) {
  const newsKeywords = ['新聞', '時事', '頭條', '報導', '消息', '資訊', '最新'];
  return newsKeywords.some(keyword => text.includes(keyword)) ||
         /新聞|時事|頭條|最新.*消息/.test(text);
}

// 判斷是否為歡迎/問候訊息
function isGreetingMessage(text) {
  const greetings = ['嗨', '哈囉', '你好', 'hi', 'hello', '安安', '早安', '午安', '晚安', '開始'];
  return greetings.some(greeting => text.toLowerCase().includes(greeting)) ||
         text.length <= 3 && ['嗨', '哈囉', '你好', 'hi'].includes(text.toLowerCase());
}

// 創建歡迎訊息
async function createWelcomeMessage() {
  return {
    type: 'template',
    altText: '歡迎使用小助手機器人！',
    template: {
      type: 'buttons',
      thumbnailImageUrl: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=300&fit=crop',
      title: '歡迎使用小助手！👋',
      text: '我是你的專屬小助手，可以幫你查詢天氣、電影、新聞，還能陪你聊天呢！',
      actions: [
        { type: 'message', label: '🌤️ 天氣查詢', text: '天氣' },
        { type: 'message', label: '🎬 電影推薦', text: '電影' },
        { type: 'message', label: '📰 新聞資訊', text: '新聞' },
        { type: 'message', label: '📋 功能選單', text: '選單' }
      ]
    }
  };
}
function isMenuQuery(text) {
  const menuKeywords = ['選單', '菜單', '功能', '幫助', '說明', '指令', '可以做什麼', 'help', '功能表'];
  return menuKeywords.some(keyword => text.includes(keyword)) ||
         text === '?' || text === '！' || text === 'menu';
}

// 處理天氣查詢
async function handleWeatherQuery(text) {
  try {
    // 創建主選單
async function createMainMenu() {
  return {
    type: 'template',
    altText: '功能選單',
    template: {
      type: 'carousel',
      columns: [
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=300&h=200&fit=crop',
          title: '天氣查詢',
          text: '查詢全台各地即時天氣',
          actions: [
            {
              type: 'message',
              label: '台北天氣',
              text: '台北天氣'
            },
            {
              type: 'message',
              label: '高雄天氣',
              text: '高雄天氣'
            },
            {
              type: 'message',
              label: '台中天氣',
              text: '台中天氣'
            }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1489599504095-7e17c1989ca9?w=300&h=200&fit=crop',
          title: '電影推薦',
          text: '最新熱門電影資訊',
          actions: [
            {
              type: 'message',
              label: '熱門電影',
              text: '推薦熱門電影'
            },
            {
              type: 'message',
              label: '即將上映',
              text: '即將上映的電影'
            },
            {
              type: 'message',
              label: '高評分電影',
              text: '高評分電影推薦'
            }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop',
          title: '新聞資訊',
          text: '最新時事新聞頭條',
          actions: [
            {
              type: 'message',
              label: '今日頭條',
              text: '今日新聞頭條'
            },
            {
              type: 'message',
              label: '科技新聞',
              text: '科技新聞'
            },
            {
              type: 'message',
              label: '娛樂新聞',
              text: '娛樂新聞'
            }
          ]
        }
      ]
    }
  };
}
    let city = extractCityFromText(text);
    if (!city) city = '台北'; // 預設城市

    const response = await axios.get(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001`, {
      params: {
        Authorization: WEATHER_API_KEY,
        locationName: city
      }
    });

    if (response.data.success === 'true' && response.data.records.location.length > 0) {
      const location = response.data.records.location[0];
      const weather = location.weatherElement;
      
      const temp = weather.find(el => el.elementName === 'MinT');
      const maxTemp = weather.find(el => el.elementName === 'MaxT');
      const desc = weather.find(el => el.elementName === 'Wx');
      
      return `${city}的天氣預報：
📍 地點：${location.locationName}
🌡️ 溫度：${temp?.time[0]?.parameter?.parameterName || 'N/A'}°C - ${maxTemp?.time[0]?.parameter?.parameterName || 'N/A'}°C
☁️ 天氣：${desc?.time[0]?.parameter?.parameterName || 'N/A'}`;
    } else {
      return '抱歉，找不到該城市的天氣資訊，請確認城市名稱是否正確。';
    }
  } catch (error) {
    console.error('天氣查詢錯誤:', error);
    return '抱歉，無法獲取天氣資訊，請稍後再試。';
  }
}

// 從文字中提取城市名稱 - 改進版
function extractCityFromText(text) {
  const cities = [
    '台北', '新北', '桃園', '台中', '台南', '高雄', 
    '基隆', '新竹', '苗栗', '彰化', '南投', '雲林', 
    '嘉義', '屏東', '宜蘭', '花蓮', '台東', '澎湖', 
    '金門', '連江', '馬祖'
  ];
  
  // 精確匹配城市名稱
  for (const city of cities) {
    if (text.includes(city)) {
      return city;
    }
  }
  
  // 檢查常見的城市別名
  const cityAliases = {
    '北部': '台北',
    '中部': '台中', 
    '南部': '高雄',
    '東部': '花蓮'
  };
  
  for (const [alias, city] of Object.entries(cityAliases)) {
    if (text.includes(alias)) {
      return city;
    }
  }
  
  return null;
}

// 處理電影查詢 - 回傳圖文訊息
async function handleMovieQuery(text) {
  try {
    let endpoint = 'movie/popular';
    let title = '🎬 熱門電影推薦';
    
    // 根據關鍵字決定查詢類型
    if (text.includes('即將上映') || text.includes('即將')) {
      endpoint = 'movie/upcoming';
      title = '🎬 即將上映電影';
    } else if (text.includes('高評分') || text.includes('推薦') || text.includes('好看')) {
      endpoint = 'movie/top_rated';
      title = '🎬 高評分電影推薦';
    }

    const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        language: 'zh-TW',
        page: 1
      }
    });

    const movies = response.data.results.slice(0, 5);
    
    if (movies.length === 0) {
      return '抱歉，目前無法獲取電影資訊。';
    }

    // 創建 Carousel 模板
    const columns = movies.map(movie => {
      const imageUrl = movie.poster_path 
        ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
        : 'https://images.unsplash.com/photo-1489599504095-7e17c1989ca9?w=300&h=200&fit=crop';
      
      const overview = movie.overview 
        ? (movie.overview.length > 50 ? movie.overview.substring(0, 50) + '...' : movie.overview)
        : '精彩電影，值得一看！';

      return {
        thumbnailImageUrl: imageUrl,
        title: movie.title.length > 40 ? movie.title.substring(0, 37) + '...' : movie.title,
        text: `⭐ ${movie.vote_average}/10\n📅 ${movie.release_date}\n${overview}`,
        actions: [
          {
            type: 'uri',
            label: '查看詳情',
            uri: `https://www.themoviedb.org/movie/${movie.id}`
          },
          {
            type: 'message',
            label: '更多推薦',
            text: '推薦更多電影'
          }
        ]
      };
    });

    return {
      type: 'template',
      altText: title,
      template: {
        type: 'carousel',
        columns: columns
      }
    };
  } catch (error) {
    console.error('電影查詢錯誤:', error);
    return '抱歉，無法獲取電影資訊，請稍後再試。';
  }
}

// 處理新聞查詢 - 回傳圖文訊息
async function handleNewsQuery(text) {
  try {
    let category = '';
    let title = '📰 今日頭條新聞';
    
    // 根據關鍵字決定新聞類別
    if (text.includes('科技')) {
      category = 'technology';
      title = '📱 科技新聞';
    } else if (text.includes('娛樂')) {
      category = 'entertainment';
      title = '🎭 娛樂新聞';
    } else if (text.includes('體育') || text.includes('運動')) {
      category = 'sports';
      title = '⚽ 體育新聞';
    }

    const params = {
      country: 'tw',
      apiKey: NEWS_API_KEY,
      pageSize: 5
    };
    
    if (category) {
      params.category = category;
    }

    const response = await axios.get('https://newsapi.org/v2/top-headlines', { params });

    const articles = response.data.articles.filter(article => 
      article.title && article.description && !article.title.includes('[Removed]')
    ).slice(0, 5);
    
    if (articles.length === 0) {
      return '抱歉，目前無法獲取新聞資訊。';
    }

    // 創建 Carousel 模板
    const columns = articles.map(article => {
      const imageUrl = article.urlToImage || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop';
      const description = article.description.length > 60 
        ? article.description.substring(0, 57) + '...' 
        : article.description;
      
      return {
        thumbnailImageUrl: imageUrl,
        title: article.title.length > 40 ? article.title.substring(0, 37) + '...' : article.title,
        text: description,
        actions: [
          {
            type: 'uri',
            label: '閱讀全文',
            uri: article.url
          },
          {
            type: 'message',
            label: '更多新聞',
            text: '今日新聞頭條'
          }
        ]
      };
    });

    return {
      type: 'template',
      altText: title,
      template: {
        type: 'carousel',
        columns: columns
      }
    };
  } catch (error) {
    console.error('新聞查詢錯誤:', error);
    return '抱歉，無法獲取新聞資訊，請稍後再試。';
  }
}

// 處理一般對話 - 改進智能度
async function handleGeneralChat(message, history, source) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // 建立更詳細的對話上下文
    let context = `你是一個友善且聪明的LINE聊天機器人，名字叫做「小助手」。請用繁體中文回答，語氣要自然、友善且有趣。

重要指引：
- 如果用戶詢問天氣、電影、新聞相關問題，請建議他們使用相應的功能選單
- 對於不確定的資訊，請誠實說不知道，並提供其他幫助方式
- 保持回覆簡潔但有用，通常在1-3句話內
- 可以適當使用emoji讓對話更生動
- 如果是群組對話，可以更活潑一些，適當參與討論`;
    
    // 如果是群組對話，加入群組互動的指導
    if (source.type === 'group') {
      context += `\n\n你現在在群組對話中，可以：
- 適當回應其他成員的話題
- 偶爾主動參與討論
- 保持友善和幽默的語氣
- 不要過於頻繁回應，除非被直接問到`;
    }
    
    // 檢查是否詢問功能相關
    if (message.includes('可以') && (message.includes('做') || message.includes('幫'))) {
      return `我可以幫你做很多事情呢！😊

🌤️ 天氣查詢 - 全台即時天氣預報
🎬 電影推薦 - 熱門電影資訊  
📰 新聞資訊 - 最新時事頭條
💬 聊天對話 - 陪你聊天解悶

輸入「選單」可以看到完整功能喔！`;
    }
    
    context += `\n\n最近的對話歷史：`;
    
    // 添加最近的對話歷史
    const recentHistory = history.slice(-4); // 最近2輪對話
    recentHistory.forEach(msg => {
      context += `\n${msg.role === 'user' ? '用戶' : '小助手'}：${msg.content}`;
    });
    
    context += `\n\n請回應用戶的訊息：${message}`;
    context += `\n\n注意：回覆要自然、簡潔，不要包含任何特殊符號或格式標記。如果用戶問的是天氣、電影或新聞，建議他們輸入相關關鍵字或「選單」來使用專門功能。`;

    const result = await model.generateContent(context);
    const response = await result.response;
    let text = response.text();
    
    // 清理回應文字
    text = text.replace(/[*#`_~\[\]]/g, '').trim();
    
    return text || '我現在有點忙，稍後再聊！😅';
  } catch (error) {
    console.error('Gemini API 錯誤:', error);
    
    // 更智能的備用回應
    const smartResponses = [
      '這個問題很有趣耶！不過我需要想一下 🤔',
      '說得對！我也是這麼想的 👍',
      '哈哈，你說的很有道理 😄',
      '嗯嗯，我懂你的意思！',
      '真的嗎？聽起來很不錯呢！',
      '我也覺得是這樣！你很有想法 💡',
      '這個話題很有意思，可以聊更多嗎？',
      '你說得很對，我學到了新東西！'
    ];
    
    // 根據訊息長度和內容選擇更合適的回應
    if (message.length > 20) {
      return smartResponses[0]; // 較複雜的問題
    } else if (message.includes('？') || message.includes('?')) {
      return smartResponses[2]; // 問句
    } else {
      return smartResponses[Math.floor(Math.random() * smartResponses.length)];
    }
  }
}記，保持自然對話的語氣。`;

    const result = await model.generateContent(context);
    const response = await result.response;
    let text = response.text();
    
    // 清理回應文字，移除可能的特殊符號
    text = text.replace(/[*#`_~]/g, '').trim();
    
    return text || '我現在有點忙，稍後再聊！';
  } catch (error) {
    console.error('Gemini API 錯誤:', error);
    
    // 簡單的備用回應
    const simpleResponses = [
      '哈哈，有趣！',
      '我懂你的意思',
      '說得對呢！',
      '真的嗎？告訴我更多',
      '這個話題很有意思',
      '我也這麼想',
      '有道理！'
    ];
    
    return simpleResponses[Math.floor(Math.random() * simpleResponses.length)];
  }
}

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ LINE Bot 伺服器成功啟動！`);
  console.log(`🌐 伺服器運行在端口 ${PORT}`);
  console.log(`📍 Webhook URL: /webhook`);
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
});

module.exports = app;