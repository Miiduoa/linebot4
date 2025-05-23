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

// API Keys - 修正版本
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b';
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841';

// 初始化 LINE 客戶端
const client = new line.Client(config);

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 儲存對話歷史
const conversationHistory = new Map();

// 健康檢查端點
app.get('/', (req, res) => {
  res.send('LINE Bot is running! All APIs ready.');
});

// Webhook 端點
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const signature = req.get('X-Line-Signature');
  
  if (!signature) {
    console.log('缺少簽名標頭');
    return res.status(401).send('缺少簽名標頭');
  }

  // 驗證簽名
  const body = req.body.toString();
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
  
  console.log('收到訊息:', messageText, '來自用戶:', userId);
  
  // 初始化用戶對話歷史
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  
  // 添加用戶訊息到歷史
  const userHistory = conversationHistory.get(userId);
  userHistory.push({ role: 'user', content: messageText });
  
  // 保持歷史記錄在合理範圍內
  if (userHistory.length > 20) {
    userHistory.splice(0, userHistory.length - 20);
  }

  let replyMessage;

  try {
    // 判斷訊息類型並處理
    if (isGreetingMessage(messageText)) {
      replyMessage = await createWelcomeMessage();
      return client.replyMessage(event.replyToken, replyMessage);
    } else if (isTestQuery(messageText)) {
      console.log('處理測試查詢:', messageText);
      const testResult = await handleTestQuery();
      replyMessage = {
        type: 'text',
        text: testResult
      };
    } else if (isMenuQuery(messageText)) {
      replyMessage = await createMainMenu();
      return client.replyMessage(event.replyToken, replyMessage);
    } else if (isWeatherQuery(messageText)) {
      console.log('處理天氣查詢:', messageText);
      replyMessage = await handleWeatherQuery(messageText);
    } else if (isMovieQuery(messageText)) {
      console.log('處理電影查詢:', messageText);
      replyMessage = await handleMovieQuery(messageText);
    } else if (isNewsQuery(messageText)) {
      console.log('處理新聞查詢:', messageText);
      replyMessage = await handleNewsQuery(messageText);
    } else {
      console.log('處理一般對話:', messageText);
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
    
    console.log('準備回覆:', replyMessage);
    return client.replyMessage(event.replyToken, replyMessage);
  } catch (error) {
    console.error('處理訊息時發生錯誤:', error);
    
    // 友善的錯誤回應
    const errorMessage = {
      type: 'text',
      text: '抱歉，我現在有點忙，請稍後再試或輸入「選單」查看功能。'
    };
    
    return client.replyMessage(event.replyToken, errorMessage);
  }
}

// 判斷是否為歡迎/問候訊息
function isGreetingMessage(text) {
  const greetings = ['嗨', '哈囉', '你好', 'hi', 'hello', '安安', '早安', '午安', '晚安', '開始'];
  return greetings.some(greeting => text.toLowerCase().includes(greeting)) ||
         text.length <= 3 && ['嗨', '你好', 'hi'].includes(text.toLowerCase());
}

// 判斷是否為選單請求
function isMenuQuery(text) {
  const menuKeywords = ['選單', '菜單', '功能', '幫助', '說明', '指令', '可以做什麼', 'help', '功能表'];
  return menuKeywords.some(keyword => text.includes(keyword)) ||
         text === '?' || text === '！' || text === 'menu';
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

// 創建歡迎訊息
async function createWelcomeMessage() {
  return {
    type: 'template',
    altText: '歡迎使用小助手機器人！',
    template: {
      type: 'buttons',
      thumbnailImageUrl: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=300&fit=crop',
      title: '歡迎使用小助手！',
      text: '我是你的專屬小助手，可以幫你查詢天氣、電影、新聞，還能陪你聊天呢！',
      actions: [
        { type: 'message', label: '天氣查詢', text: '天氣' },
        { type: 'message', label: '電影推薦', text: '電影' },
        { type: 'message', label: '新聞資訊', text: '新聞' },
        { type: 'message', label: '功能選單', text: '選單' }
      ]
    }
  };
}

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
            { type: 'message', label: '台北天氣', text: '台北天氣' },
            { type: 'message', label: '高雄天氣', text: '高雄天氣' },
            { type: 'message', label: '台中天氣', text: '台中天氣' }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1489599504095-7e17c1989ca9?w=300&h=200&fit=crop',
          title: '電影推薦',
          text: '最新熱門電影資訊',
          actions: [
            { type: 'message', label: '熱門電影', text: '推薦熱門電影' },
            { type: 'message', label: '即將上映', text: '即將上映的電影' },
            { type: 'message', label: '高評分電影', text: '高評分電影推薦' }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop',
          title: '新聞資訊',
          text: '最新時事新聞頭條',
          actions: [
            { type: 'message', label: '今日頭條', text: '今日新聞頭條' },
            { type: 'message', label: '科技新聞', text: '科技新聞' },
            { type: 'message', label: '娛樂新聞', text: '娛樂新聞' }
          ]
        },
        {
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=300&h=200&fit=crop',
          title: '系統功能',
          text: '測試診斷與其他功能',
          actions: [
            { type: 'message', label: '系統測試', text: '測試' },
            { type: 'message', label: '聊天對話', text: '你好' },
            { type: 'message', label: '使用說明', text: '可以做什麼' }
          ]
        }
      ]
    }
  };
}

// 處理天氣查詢 - 修正版本
async function handleWeatherQuery(text) {
  try {
    console.log('天氣查詢開始，文字:', text);
    let city = extractCityFromText(text);
    console.log('提取到的城市:', city);
    
    if (!city) {
      return {
        type: 'template',
        altText: '請選擇要查詢天氣的城市',
        template: {
          type: 'buttons',
          thumbnailImageUrl: 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=400&h=300&fit=crop',
          title: '天氣查詢',
          text: '請選擇要查詢的城市',
          actions: [
            { type: 'message', label: '台北', text: '台北天氣' },
            { type: 'message', label: '台中', text: '台中天氣' },
            { type: 'message', label: '台南', text: '台南天氣' },
            { type: 'message', label: '高雄', text: '高雄天氣' }
          ]
        }
      };
    }

    // 城市名稱對應（API 需要完整名稱）
    const cityMapping = {
      '台北': '臺北市',
      '新北': '新北市', 
      '桃園': '桃園市',
      '台中': '臺中市',
      '台南': '臺南市',
      '高雄': '高雄市',
      '基隆': '基隆市',
      '新竹': '新竹市',
      '嘉義': '嘉義市'
    };
    
    const apiCityName = cityMapping[city] || city;
    console.log('API 城市名稱:', apiCityName);

    // 使用修正的 API endpoint
    console.log('準備請求天氣 API，城市:', apiCityName);
    const response = await axios.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001', {
      params: {
        Authorization: WEATHER_API_KEY,
        locationName: apiCityName
      },
      timeout: 15000
    });

    console.log('天氣 API 回應狀態:', response.status);
    console.log('天氣 API 回應 success:', response.data.success);
    console.log('location 數量:', response.data.records?.location?.length || 0);

    if (response.data.success === 'true' && response.data.records?.location?.length > 0) {
      const location = response.data.records.location[0];
      const weather = location.weatherElement;
      
      console.log('找到天氣資料，位置:', location.locationName);
      console.log('weatherElement 數量:', weather.length);
      
      // 根據實際API結構提取資料
      const wxData = weather.find(el => el.elementName === 'Wx');
      const popData = weather.find(el => el.elementName === 'PoP');
      const minTData = weather.find(el => el.elementName === 'MinT');
      const maxTData = weather.find(el => el.elementName === 'MaxT');
      
      // 取得最近時間的資料
      const weatherDesc = wxData?.time?.[0]?.parameter?.parameterName || '晴時多雲';
      const rainProb = popData?.time?.[0]?.parameter?.parameterName || '0';
      const minTemp = minTData?.time?.[0]?.parameter?.parameterName || '--';
      const maxTemp = maxTData?.time?.[0]?.parameter?.parameterName || '--';

      console.log('天氣資料:', { weatherDesc, rainProb, minTemp, maxTemp });

      let weatherImage = 'https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=400&h=300&fit=crop';
      if (weatherDesc.includes('晴')) {
        weatherImage = 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?w=400&h=300&fit=crop';
      } else if (weatherDesc.includes('雨')) {
        weatherImage = 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=400&h=300&fit=crop';
      } else if (weatherDesc.includes('雲') || weatherDesc.includes('陰')) {
        weatherImage = 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=400&h=300&fit=crop';
      }

      return {
        type: 'template',
        altText: `${city}天氣：${weatherDesc} ${minTemp}-${maxTemp}°C`,
        template: {
          type: 'buttons',
          thumbnailImageUrl: weatherImage,
          title: `${location.locationName} 天氣預報`,
          text: `🌡️ 溫度：${minTemp}°C - ${maxTemp}°C\n☁️ 天氣：${weatherDesc}\n🌧️ 降雨機率：${rainProb}%`,
          actions: [
            { type: 'message', label: '其他城市', text: '天氣查詢' },
            { type: 'message', label: '返回選單', text: '選單' }
          ]
        }
      };
    } else {
      console.log('天氣 API 沒有找到資料，回應內容:', JSON.stringify(response.data, null, 2));
      return `抱歉，找不到 ${city} 的天氣資訊。請嘗試：台北天氣、台中天氣、高雄天氣等。`;
    }
  } catch (error) {
    console.error('天氣查詢錯誤:', error.message);
    console.error('錯誤詳情:', error.response?.data || error);
    return `抱歉，無法獲取天氣資訊，請稍後再試。`;
  }
}

// 處理電影查詢 - 完全修復版本
async function handleMovieQuery(text) {
  try {
    console.log('電影查詢開始，文字:', text);
    
    let endpoint = 'movie/popular';
    let title = '熱門電影推薦';
    
    if (text.includes('即將上映') || text.includes('即將')) {
      endpoint = 'movie/upcoming';
      title = '即將上映電影';
    } else if (text.includes('高評分') || text.includes('推薦') || text.includes('好看')) {
      endpoint = 'movie/top_rated';
      title = '高評分電影推薦';
    }

    console.log('準備請求電影 API，endpoint:', endpoint);
    const response = await axios.get('https://api.themoviedb.org/3/' + endpoint, {
      headers: {
        'Authorization': 'Bearer ' + TMDB_API_KEY,
        'Content-Type': 'application/json'
      },
      params: {
        language: 'zh-TW',
        page: 1
      },
      timeout: 15000
    });

    console.log('電影 API 回應狀態:', response.status);
    const movies = response.data.results?.slice(0, 3) || []; // 只取3部電影
    console.log('找到電影數量:', movies.length);
    
    if (movies.length === 0) {
      return '抱歉，目前無法獲取電影資訊。';
    }

    // 如果只有一部電影，使用 buttons 模板
    if (movies.length === 1) {
      const movie = movies[0];
      const cleanTitle = cleanText(movie.title || '未知電影', 20);
      const cleanOverview = cleanText(movie.overview || '精彩電影值得一看', 50);
      const rating = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
      const releaseDate = movie.release_date || 'TBA';
      const imageUrl = movie.poster_path 
        ? 'https://image.tmdb.org/t/p/w300' + movie.poster_path
        : 'https://images.unsplash.com/photo-1489599504095-7e17c1989ca9?w=300&h=200&fit=crop';

      return {
        type: 'template',
        altText: title + '：' + cleanTitle,
        template: {
          type: 'buttons',
          thumbnailImageUrl: imageUrl,
          title: cleanTitle,
          text: '評分：' + rating + '/10\n上映：' + releaseDate + '\n' + cleanOverview,
          actions: [
            { type: 'message', label: '更多推薦', text: '推薦更多電影' },
            { type: 'message', label: '返回選單', text: '選單' }
          ]
        }
      };
    }

    // 多部電影使用 carousel，但要非常小心格式
    const columns = movies.map((movie, index) => {
      console.log('處理電影 ' + (index + 1) + ':', movie.title);
      
      const cleanTitle = cleanText(movie.title || '電影' + (index + 1), 15);
      const cleanOverview = cleanText(movie.overview || '精彩電影', 35);
      const rating = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
      const releaseDate = movie.release_date ? movie.release_date.substring(0, 4) : 'TBA';
      
      // 使用安全的預設圖片
      const imageUrl = movie.poster_path 
        ? 'https://image.tmdb.org/t/p/w300' + movie.poster_path
        : 'https://images.unsplash.com/photo-1489599504095-7e17c1989ca9?w=300&h=200&fit=crop';

      const safeText = '評分 ' + rating + '\n年份 ' + releaseDate + '\n' + cleanOverview;
      
      console.log('電影', index + 1, '處理完成:', {
        title: cleanTitle,
        textLength: safeText.length,
        imageUrl: imageUrl.substring(0, 50) + '...'
      });

      return {
        thumbnailImageUrl: imageUrl,
        title: cleanTitle,
        text: safeText,
        actions: [
          { type: 'message', label: '更多電影', text: '推薦更多電影' },
          { type: 'message', label: '返回選單', text: '選單' }
        ]
      };
    });

    console.log('準備建立電影 Carousel，columns 數量:', columns.length);
    
    const carouselMessage = {
      type: 'template',
      altText: title,
      template: {
        type: 'carousel',
        columns: columns
      }
    };
    
    // 驗證訊息大小
    const messageSize = JSON.stringify(carouselMessage).length;
    console.log('Carousel 訊息大小:', messageSize, 'bytes');
    
    if (messageSize > 50000) { // LINE 限制約 50KB
      console.log('訊息太大，改用簡單回應');
      return createSimpleMovieList(movies, title);
    }

    return carouselMessage;
  } catch (error) {
    console.error('電影查詢錯誤:', error.message);
    console.error('錯誤詳情:', error.response?.data || error);
    return '抱歉，無法獲取電影資訊，請稍後再試。';
  }
}

// 清理文字函數
function cleanText(text, maxLength) {
  if (!text) return '無資料';
  
  // 移除或替換有問題的字符
  let cleaned = text
    .replace(/[^\w\s\u4e00-\u9fff\u3400-\u4dbf\-\[\]()（）]/g, '') // 只保留安全字符
    .replace(/\s+/g, ' ') // 合併多個空格
    .trim();
  
  // 限制長度
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength - 3) + '...';
  }
  
  return cleaned || '資料處理中';
}

// 創建簡單電影列表（備用方案）
function createSimpleMovieList(movies, title) {
  let movieList = title + '：\n\n';
  
  movies.forEach((movie, index) => {
    const cleanTitle = cleanText(movie.title || '未知電影', 20);
    const rating = movie.vote_average ? parseFloat(movie.vote_average).toFixed(1) : '0.0';
    const year = movie.release_date ? movie.release_date.substring(0, 4) : 'TBA';
    
    movieList += (index + 1) + '. ' + cleanTitle + '\n';
    movieList += '⭐ ' + rating + '/10  📅 ' + year + '\n\n';
  });
  
  movieList += '輸入「推薦更多電影」查看其他推薦';
  
  return movieList;
}

// 處理新聞查詢 - 完全修復版本
async function handleNewsQuery(text) {
  try {
    console.log('新聞查詢開始，文字:', text);
    
    let category = '';
    let title = '今日頭條新聞';
    
    if (text.includes('科技')) {
      category = 'technology';
      title = '科技新聞';
    } else if (text.includes('娛樂')) {
      category = 'entertainment';
      title = '娛樂新聞';
    } else if (text.includes('體育') || text.includes('運動')) {
      category = 'sports';
      title = '體育新聞';
    } else if (text.includes('商業') || text.includes('財經')) {
      category = 'business';
      title = '商業新聞';
    }

    // 先嘗試台灣新聞
    let params = {
      country: 'tw',
      apiKey: NEWS_API_KEY,
      pageSize: 10 // 增加數量以確保有足夠新聞
    };
    
    if (category) {
      params.category = category;
    }

    console.log('準備請求新聞 API (台灣)，參數:', params);
    
    let response;
    let articles = [];
    
    try {
      response = await axios.get('https://newsapi.org/v2/top-headlines', { 
        params,
        timeout: 15000
      });
      
      console.log('台灣新聞 API 回應狀態:', response.status);
      console.log('台灣新聞 API 總數:', response.data.totalResults);
      
      if (response.data.articles && response.data.articles.length > 0) {
        // 放寬過濾條件
        articles = response.data.articles.filter(article => 
          article.title && 
          article.title !== '[Removed]' &&
          article.title.trim() !== '' &&
          article.url &&
          article.url.startsWith('http')
        );
        
        console.log('台灣新聞過濾後數量:', articles.length);
      }
    } catch (error) {
      console.log('台灣新聞 API 錯誤:', error.message);
    }
    
    // 如果台灣新聞不足，嘗試其他來源
    if (articles.length < 3) {
      console.log('台灣新聞數量不足，嘗試其他來源...');
      
      try {
        // 嘗試香港新聞 (繁體中文)
        const hkParams = {
          country: 'hk',
          apiKey: NEWS_API_KEY,
          pageSize: 5
        };
        
        const hkResponse = await axios.get('https://newsapi.org/v2/top-headlines', { 
          params: hkParams,
          timeout: 10000
        });
        
        console.log('香港新聞 API 回應狀態:', hkResponse.status);
        console.log('香港新聞 API 總數:', hkResponse.data.totalResults);
        
        if (hkResponse.data.articles && hkResponse.data.articles.length > 0) {
          const hkArticles = hkResponse.data.articles.filter(article => 
            article.title && 
            article.title !== '[Removed]' &&
            article.title.trim() !== '' &&
            article.url &&
            article.url.startsWith('http')
          );
          
          articles = [...articles, ...hkArticles];
          console.log('加入香港新聞後總數:', articles.length);
        }
      } catch (error) {
        console.log('香港新聞 API 錯誤:', error.message);
      }
    }
    
    // 如果還是不足，嘗試全球新聞搜尋
    if (articles.length < 3) {
      console.log('新聞數量仍不足，嘗試全球搜尋...');
      
      try {
        const searchParams = {
          q: 'Taiwan OR 台灣',
          apiKey: NEWS_API_KEY,
          pageSize: 5,
          sortBy: 'publishedAt',
          language: 'en'
        };
        
        const searchResponse = await axios.get('https://newsapi.org/v2/everything', { 
          params: searchParams,
          timeout: 10000
        });
        
        console.log('全球搜尋 API 回應狀態:', searchResponse.status);
        console.log('全球搜尋 API 總數:', searchResponse.data.totalResults);
        
        if (searchResponse.data.articles && searchResponse.data.articles.length > 0) {
          const searchArticles = searchResponse.data.articles.filter(article => 
            article.title && 
            article.title !== '[Removed]' &&
            article.title.trim() !== '' &&
            article.url &&
            article.url.startsWith('http')
          );
          
          articles = [...articles, ...searchArticles];
          console.log('加入搜尋結果後總數:', articles.length);
        }
      } catch (error) {
        console.log('全球搜尋 API 錯誤:', error.message);
      }
    }
    
    // 最終檢查
    if (articles.length === 0) {
      console.log('所有方法都無法獲取新聞，回傳備用內容');
      return createFallbackNews();
    }
    
    // 取前3則新聞
    articles = articles.slice(0, 3);
    console.log('最終新聞數量:', articles.length);

    // 如果只有一則新聞，使用 buttons 模板
    if (articles.length === 1) {
      const article = articles[0];
      const cleanTitle = cleanText(article.title, 25);
      const cleanDescription = cleanText(article.description || '點擊閱讀完整新聞內容', 60);
      const imageUrl = article.urlToImage || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop';

      return {
        type: 'template',
        altText: title + '：' + cleanTitle,
        template: {
          type: 'buttons',
          thumbnailImageUrl: imageUrl,
          title: cleanTitle,
          text: cleanDescription,
          actions: [
            { type: 'uri', label: '閱讀全文', uri: article.url },
            { type: 'message', label: '更多新聞', text: '今日新聞頭條' },
            { type: 'message', label: '返回選單', text: '選單' }
          ]
        }
      };
    }

    // 多則新聞使用 carousel
    const columns = articles.map((article, index) => {
      console.log('處理新聞 ' + (index + 1) + ':', article.title?.substring(0, 20) + '...');
      
      const cleanTitle = cleanText(article.title, 20);
      const cleanDescription = cleanText(article.description || '點擊閱讀完整內容', 45);
      const imageUrl = article.urlToImage || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop';
      
      console.log('新聞', index + 1, '處理完成:', {
        title: cleanTitle,
        descLength: cleanDescription.length,
        hasImage: !!article.urlToImage
      });

      return {
        thumbnailImageUrl: imageUrl,
        title: cleanTitle,
        text: cleanDescription,
        actions: [
          { type: 'uri', label: '閱讀全文', uri: article.url },
          { type: 'message', label: '更多新聞', text: '今日新聞頭條' }
        ]
      };
    });

    console.log('準備建立新聞 Carousel，columns 數量:', columns.length);
    
    const carouselMessage = {
      type: 'template',
      altText: title,
      template: {
        type: 'carousel',
        columns: columns
      }
    };
    
    // 驗證訊息大小
    const messageSize = JSON.stringify(carouselMessage).length;
    console.log('Carousel 訊息大小:', messageSize, 'bytes');
    
    if (messageSize > 50000) {
      console.log('訊息太大，改用簡單回應');
      return createSimpleNewsList(articles, title);
    }

    return carouselMessage;
  } catch (error) {
    console.error('新聞查詢總錯誤:', error.message);
    console.error('錯誤詳情:', error.response?.data || error);
    return createFallbackNews();
  }
}

// 創建備用新聞內容
function createFallbackNews() {
  const fallbackNews = [
    {
      title: '台灣科技業持續發展',
      description: '台灣在半導體和科技產業方面持續保持領先地位，為全球科技發展做出重要貢獻。',
      url: 'https://www.taiwannews.com.tw/'
    },
    {
      title: '台灣觀光業蓬勃發展',
      description: '台灣以其豐富的文化heritage和美麗的自然景觀吸引了眾多國際遊客。',
      url: 'https://www.taiwannews.com.tw/'
    },
    {
      title: '台灣美食文化享譽國際',
      description: '台灣夜市文化和特色小吃在國際間獲得高度評價，成為觀光一大亮點。',
      url: 'https://www.taiwannews.com.tw/'
    }
  ];
  
  const columns = fallbackNews.map((news, index) => ({
    thumbnailImageUrl: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=300&h=200&fit=crop',
    title: news.title,
    text: news.description,
    actions: [
      { type: 'uri', label: '了解更多', uri: news.url },
      { type: 'message', label: '返回選單', text: '選單' }
    ]
  }));

  return {
    type: 'template',
    altText: '台灣新聞資訊',
    template: {
      type: 'carousel',
      columns: columns
    }
  };
}

// 創建簡單新聞列表（備用方案）
function createSimpleNewsList(articles, title) {
  let newsList = title + '：\n\n';
  
  articles.forEach((article, index) => {
    const cleanTitle = cleanText(article.title || '新聞標題', 30);
    
    newsList += (index + 1) + '. ' + cleanTitle + '\n';
    if (article.description) {
      const cleanDesc = cleanText(article.description, 50);
      newsList += '📄 ' + cleanDesc + '\n';
    }
    newsList += '🔗 ' + article.url + '\n\n';
  });
  
  newsList += '輸入「今日新聞頭條」查看更多新聞';
  
  return newsList;
}

// 處理一般對話 - 修正版本
async function handleGeneralChat(message, history, source) {
  try {
    console.log('一般對話開始，訊息:', message);
    
    // 檢查 Gemini API Key
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-api-key') {
      console.log('Gemini API Key 未設定，使用備用回應');
      return getBackupResponse(message);
    }
    
    // 使用最新的 Gemini 模型
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 200,
      }
    });
    
    let context = '你是一個友善的LINE聊天機器人，名字叫做「小助手」。請用繁體中文回答，語氣要自然、友善且簡潔。';
    
    if (source.type === 'group') {
      context += '你現在在群組對話中，可以適當參與討論，保持友善和幽默的語氣。';
    }
    
    if (message.includes('可以') && (message.includes('做') || message.includes('幫'))) {
      return '我可以幫你做很多事情呢！😊\n\n🌤️ 天氣查詢 - 全台即時天氣預報\n🎬 電影推薦 - 熱門電影資訊\n📰 新聞資訊 - 最新時事頭條\n💬 聊天對話 - 陪你聊天解悶\n\n輸入「選單」可以看到完整功能喔！';
    }
    
    context += '\n\n最近的對話歷史：';
    
    const recentHistory = history.slice(-4);
    recentHistory.forEach(msg => {
      context += '\n' + (msg.role === 'user' ? '用戶' : '小助手') + '：' + msg.content;
    });
    
    context += '\n\n請回應用戶的訊息：' + message;
    context += '\n\n注意：回覆要自然、簡潔（100字以內），不要包含特殊符號。要有趣且貼心。';

    console.log('準備請求 Gemini API，模型: gemini-1.5-flash');
    const result = await model.generateContent(context);
    const response = await result.response;
    let text = response.text();
    
    console.log('收到 Gemini 回應長度:', text.length);
    
    // 清理回應文字，確保符合 LINE 格式
    text = text
      .replace(/[*#`_~\[\]]/g, '') // 移除 markdown 符號
      .replace(/\n{3,}/g, '\n\n') // 限制連續換行
      .trim();
    
    // 限制回應長度
    if (text.length > 300) {
      text = text.substring(0, 297) + '...';
    }
    
    console.log('清理後回應:', text);
    return text || getBackupResponse(message);
  } catch (error) {
    console.error('Gemini API 錯誤:', error.message);
    console.error('錯誤類型:', error.name);
    console.error('錯誤詳情:', error.status || 'Unknown');
    
    return getBackupResponse(message);
  }
}

// 備用智能回應
function getBackupResponse(message) {
  // 根據訊息內容提供更智能的回應
  if (message.includes('？') || message.includes('?')) {
    const questionResponses = [
      '這是個好問題！讓我想想...',
      '嗯，關於這個問題，我覺得...',
      '你問得很有意思耶！',
      '這個問題值得深思呢！'
    ];
    return questionResponses[Math.floor(Math.random() * questionResponses.length)];
  }
  
  if (message.includes('謝謝') || message.includes('感謝')) {
    return '不客氣！很高興能幫到你 😊';
  }
  
  if (message.includes('再見') || message.includes('拜拜')) {
    return '再見！有需要隨時找我聊天喔 👋';
  }
  
  if (message.length > 20) {
    return '你說得很有道理！我需要再想想這個問題 🤔';
  }
  
  const generalResponses = [
    '哈哈，有趣！',
    '說得對呢！',
    '我懂你的意思 😊',
    '真的嗎？聽起來不錯！',
    '這個話題很有意思',
    '我也這麼想！',
    '有道理！'
  ];
  
  return generalResponses[Math.floor(Math.random() * generalResponses.length)];
}

// 判斷是否為測試請求
function isTestQuery(text) {
  const testKeywords = ['測試', 'test', '檢測', '診斷', 'debug'];
  return testKeywords.some(keyword => text.includes(keyword));
}

// 創建測試診斷功能
async function handleTestQuery() {
  console.log('執行系統測試...');
  
  let testResults = '🔧 系統診斷結果：\n\n';
  
  // 測試天氣 API
  try {
    const weatherResponse = await axios.get('https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001', {
      params: {
        Authorization: WEATHER_API_KEY,
        locationName: '臺北市'
      },
      timeout: 5000
    });
    testResults += '🌤️ 天氣 API：✅ 正常\n';
  } catch (error) {
    testResults += '🌤️ 天氣 API：❌ 異常\n';
  }
  
  // 測試電影 API
  try {
    const movieResponse = await axios.get('https://api.themoviedb.org/3/movie/popular', {
      headers: {
        'Authorization': 'Bearer ' + TMDB_API_KEY
      },
      params: {
        language: 'zh-TW',
        page: 1
      },
      timeout: 5000
    });
    testResults += '🎬 電影 API：✅ 正常\n';
  } catch (error) {
    testResults += '🎬 電影 API：❌ 異常\n';
  }
  
  // 測試新聞 API
  try {
    const newsResponse = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: {
        country: 'tw',
        apiKey: NEWS_API_KEY,
        pageSize: 1
      },
      timeout: 5000
    });
    
    console.log('新聞 API 測試回應:', {
      status: newsResponse.status,
      totalResults: newsResponse.data.totalResults,
      articlesCount: newsResponse.data.articles?.length || 0
    });
    
    if (newsResponse.data.articles && newsResponse.data.articles.length > 0) {
      testResults += '📰 新聞 API：✅ 正常\n';
    } else {
      testResults += '📰 新聞 API：⚠️ 無內容\n';
    }
  } catch (error) {
    console.error('新聞 API 測試錯誤:', error.message);
    testResults += '📰 新聞 API：❌ 異常 (' + error.message + ')\n';
  }
  
  // 測試 Gemini API
  try {
    if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your-api-key') {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          maxOutputTokens: 50,
        }
      });
      const result = await model.generateContent('測試回應：你好');
      const response = await result.response;
      const text = response.text();
      console.log('Gemini 測試回應:', text);
      testResults += '🤖 AI 對話：✅ 正常\n';
    } else {
      testResults += '🤖 AI 對話：⚠️ 未配置\n';
    }
  } catch (error) {
    console.error('Gemini 測試錯誤:', error);
    testResults += '🤖 AI 對話：❌ 異常 (' + error.message + ')\n';
  }
  
  testResults += '\n💡 如果有 API 異常，請檢查網路連線或 API 金鑰設定。';
  
  return testResults;
}
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
      console.log('找到城市:', city, '在文字:', text);
      return city;
    }
  }
  
  // 檢查常見的城市別名
  const cityAliases = {
    '北部': '台北',
    '中部': '台中', 
    '南部': '高雄',
    '東部': '花蓮',
    '臺北': '台北',
    '臺中': '台中', 
    '臺南': '台南'
  };
  
  for (const [alias, city] of Object.entries(cityAliases)) {
    if (text.includes(alias)) {
      console.log('找到城市別名:', alias, '對應:', city);
      return city;
    }
  }
  
  console.log('未找到城市，文字:', text);
  return null;
}

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ LINE Bot 伺服器成功啟動！');
  console.log('🌐 伺服器運行在端口 ' + PORT);
  console.log('📍 Webhook URL: /webhook');
  console.log('🔑 API Keys 設定完成');
});

// 處理未捕獲的異常
process.on('uncaughtException', (error) => {
  console.error('未捕獲的異常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', reason);
});

module.exports = app;