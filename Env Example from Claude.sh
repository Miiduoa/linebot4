# ==================== 超級智能LINE Bot 環境變數配置 ====================

# 📱 LINE Bot API 設定（必填）
LINE_CHANNEL_ACCESS_TOKEN=G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=
LINE_CHANNEL_SECRET=ff89f01585f2b68301b8f8911174cd87

# 🤖 AI API 設定（必填）
# 主要 AI 引擎 - Google Gemini
GEMINI_API_KEY=AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE

# 備用 AI 引擎 - GPT-3.5（建議設定）
BACKUP_AI_KEY=sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM
BACKUP_AI_URL=https://api.chatanywhere.org/v1

# 🌐 外部服務 API（可選，但建議設定以獲得完整功能）
# 新聞 API - 用於新聞查詢功能
NEWS_API_KEY=5807e3e70bd2424584afdfc6e932108b

# 電影資料庫 API - 用於電影推薦功能
TMDB_API_KEY=eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM

# 天氣 API - 用於天氣查詢功能（台灣中央氣象署）
WEATHER_API_KEY=CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841

# 🔍 搜尋功能 API（需要申請）
# Google Custom Search API - 用於網路搜尋功能
SEARCH_API_KEY=your-google-search-api-key
SEARCH_ENGINE_ID=526082b509a1942a7

# 📞 電話鬧鐘功能 API（需要申請 Twilio 服務）
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone-number

# 👨‍💼 系統管理員設定（必填）
ADMIN_USER_ID=demo326
OWNER_LINE_ID=demo326

# 🚀 系統設定
NODE_ENV=production
TZ=Asia/Taipei
PORT=3000

# 💾 效能優化設定
NODE_OPTIONS=--max-old-space-size=1024 --optimize-for-size
UV_THREADPOOL_SIZE=16

# 🎛️ 功能開關（true/false）
ENABLE_CONTRADICTION_DETECTION=true
ENABLE_MESSAGE_RECALL_TRACKING=true
ENABLE_PHONE_ALARM=false
ENABLE_AUTO_LEARNING=true
ENABLE_DECISION_SYSTEM=true

# 📊 記憶體和效能設定
MAX_CONVERSATION_HISTORY=30
MAX_PERSONAL_HISTORY=200
REMINDER_CHECK_INTERVAL=10000
DECISION_TIMEOUT=1800000
API_RATE_LIMIT=100
MAX_MESSAGE_LENGTH=2000

# ==================== 申請說明 ====================

# 📝 如何申請各種 API Key：

# 1. Google Gemini API:
#    - 前往：https://ai.google.dev/
#    - 註冊 Google 帳號並申請 API Key

# 2. News API:
#    - 前往：https://newsapi.org/
#    - 免費註冊可獲得 API Key

# 3. TMDB API:
#    - 前往：https://www.themoviedb.org/documentation/api
#    - 註冊並申請 API Key

# 4. Google Custom Search API:
#    - 前往：https://developers.google.com/custom-search/v1/introduction
#    - 申請 API Key 和建立 Search Engine

# 5. Twilio API（電話鬧鐘功能）:
#    - 前往：https://www.twilio.com/
#    - 註冊並獲得 Account SID 和 Auth Token

# ==================== 部署說明 ====================

# 🚀 Render.com 部署步驟：
# 1. 將代碼上傳到 GitHub
# 2. 在 Render.com 創建新的 Web Service
# 3. 連接 GitHub 倉庫
# 4. 設定環境變數（將此檔案的值複製到 Render 環境變數中）
# 5. 選擇 Standard 方案以獲得更好的效能
# 6. 點擊部署

# 🔧 本地開發步驟：
# 1. 複製 .env.example 為 .env
# 2. 填入你的 API Keys
# 3. 執行：npm install
# 4. 執行：npm run dev

# ==================== 功能說明 ====================

# 🤖 核心功能：
# ✅ 超擬真人AI聊天（模擬你的語氣和個性）
# ✅ 圖文訊息回覆（所有回覆都是漂亮的卡片格式）
# ✅ 超級提醒/鬧鐘系統（支援電話鬧鐘）
# ✅ 智能搜尋（網路、天氣、新聞、電影）
# ✅ 決策系統（重要決定會私訊問你）
# ✅ 矛盾偵測（AI自動偵測用戶前後不一致的話）
# ✅ 訊息轉發系統
# ✅ 系統管理指令（全中文指令）
# ✅ 自我學習系統（越用越像你）
# ✅ 記憶系統（群組30條，個人200條）

# 🎯 進階功能：
# ✅ 自我修復功能
# ✅ 雙AI引擎（Gemini + GPT-3.5備用）
# ✅ 效能監控
# ✅ 安全機制
# ✅ 優雅降級

# ==================== 支援說明 ====================

# 💡 如果遇到問題：
# 1. 檢查所有必填的環境變數是否已設定
# 2. 確認 API Keys 是否有效
# 3. 查看 Render.com 的部署日誌
# 4. 檢查 LINE Bot 的 Webhook URL 設定

# 📞 技術支援：
# 作者：顧晉瑋（靜宜大學資管系）
# 版本：2.0.0 超級智能版