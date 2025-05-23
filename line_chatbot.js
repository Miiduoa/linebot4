const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 配置資訊
const config = {
  channelAccessToken: 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  channelSecret: 'ff89f01585f2b68301b8f8911174cd87'
};

// API Keys
const GEMINI_API_KEY = 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const NEWS_API_KEY = '5807e3e70bd2424584afdfc6e932108b';
const TMDB_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM';
const WEATHER_API_KEY = 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';

// 初始化 LINE 客戶端
const client = new line.Client(config);

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 儲存對話歷史 (簡單的記憶體儲存)
const conversationHistory = new Map();

// 中間件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康檢查端點
app.get('/', (req, res) => {
  res.send('LINE Bot is running!');
});

// Webhook 端點
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
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
    if (isWeatherQuery(messageText)) {
      replyMessage = await handleWeatherQuery(messageText);
    } else if (isMovieQuery(messageText)) {
      replyMessage = await handleMovieQuery(messageText);
    } else if (isNewsQuery(messageText)) {
      replyMessage = await handleNewsQuery();
    } else {
      // 使用 Gemini 進行一般對話
      replyMessage = await handleGeneralChat(messageText, userHistory, event.source);
    }

    // 添加機器人回覆到歷史
    userHistory.push({ role: 'assistant', content: replyMessage });
    
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyMessage
    });
  } catch (error) {
    console.error('處理訊息時發生錯誤:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '抱歉，我遇到了一些問題，請稍後再試。'
    });
  }
}

// 判斷是否為天氣查詢
function isWeatherQuery(text) {
  const weatherKeywords = ['天氣', '氣溫', '下雨', '晴天', '陰天', '溫度', '濕度', '風速'];
  return weatherKeywords.some(keyword => text.includes(keyword));
}

// 判斷是否為電影查詢
function isMovieQuery(text) {
  const movieKeywords = ['電影', '影片', '上映', '票房', '演員', '導演', '劇情'];
  return movieKeywords.some(keyword => text.includes(keyword));
}

// 判斷是否為新聞查詢
function isNewsQuery(text) {
  const newsKeywords = ['新聞', '時事', '頭條', '報導'];
  return newsKeywords.some(keyword => text.includes(keyword));
}

// 處理天氣查詢
async function handleWeatherQuery(text) {
  try {
    // 從文字中提取城市名稱
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

// 從文字中提取城市名稱
function extractCityFromText(text) {
  const cities = ['台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江'];
  for (const city of cities) {
    if (text.includes(city)) {
      return city;
    }
  }
  return null;
}

// 處理電影查詢
async function handleMovieQuery(text) {
  try {
    const response = await axios.get('https://api.themoviedb.org/3/movie/popular', {
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
    let movieList = '🎬 熱門電影推薦：\n\n';
    
    movies.forEach((movie, index) => {
      movieList += `${index + 1}. ${movie.title}\n`;
      movieList += `⭐ 評分：${movie.vote_average}/10\n`;
      movieList += `📅 上映日期：${movie.release_date}\n`;
      movieList += `📝 簡介：${movie.overview ? movie.overview.substring(0, 80) + '...' : '暫無簡介'}\n\n`;
    });

    return movieList;
  } catch (error) {
    console.error('電影查詢錯誤:', error);
    return '抱歉，無法獲取電影資訊，請稍後再試。';
  }
}

// 處理新聞查詢
async function handleNewsQuery() {
  try {
    const response = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: {
        country: 'tw',
        apiKey: NEWS_API_KEY,
        pageSize: 5
      }
    });

    const articles = response.data.articles;
    let newsList = '📰 今日頭條新聞：\n\n';
    
    articles.forEach((article, index) => {
      newsList += `${index + 1}. ${article.title}\n`;
      if (article.description) {
        newsList += `📄 ${article.description.substring(0, 100)}...\n`;
      }
      newsList += `🔗 ${article.url}\n\n`;
    });

    return newsList;
  } catch (error) {
    console.error('新聞查詢錯誤:', error);
    return '抱歉，無法獲取新聞資訊，請稍後再試。';
  }
}

// 處理一般對話
async function handleGeneralChat(message, history, source) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // 建立對話上下文
    let context = `你是一個友善的LINE聊天機器人，請用繁體中文回答。`;
    
    // 如果是群組對話，加入群組互動的指導
    if (source.type === 'group') {
      context += `你現在在群組對話中，可以適當地參與討論、搭訕或回應其他成員。請保持友善和有趣的語氣。`;
    }
    
    context += `\n\n以下是對話歷史：\n`;
    
    // 添加最近的對話歷史
    const recentHistory = history.slice(-6); // 最近3輪對話
    recentHistory.forEach(msg => {
      context += `${msg.role === 'user' ? '用戶' : '機器人'}：${msg.content}\n`;
    });
    
    context += `\n請回應用戶的最新訊息：${message}`;
    context += `\n\n注意：請直接回答，不要包含任何特殊符號或格式標記，保持自然對話的語氣。`;

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
app.listen(PORT, () => {
  console.log(`伺服器運行在端口 ${PORT}`);
});

module.exports = app;