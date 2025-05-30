// src/core/line_config.js

// For local development, you might use a .env file
// require('dotenv').config(); 

const appConfig = {
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'G5/Jatw/Mm7gpHjRnVG89Mxp+6QWXINk4mGkga8o3g9TRa96NXiOed5ylkNZjuUtGHXFKCV46xX1t73PZkYdjlqIFoJHe0XiPUP4EyRy/jwJ6sqRtXivrQNA0WH+DK9pLUKg/ybSZ1mvGywuK8upBAdB04t89/1O/w1cDnyilFU=',
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || 'ff89f01585f2b68301b8f8911174cd87',
  
  geminiApiKey: process.env.GEMINI_API_KEY || 'AIzaSyBWCitsjkm7DPe_aREubKIZjqmgXafVKNE',
  backupAiKey: process.env.BACKUP_AI_KEY || 'sk-U8sgp8YW0jX3flzFCM1azu85GS6WbHlMyqU7L0ZDer9n8aUM',
  backupAiUrl: process.env.BACKUP_AI_URL || 'https://api.chatanywhere.org/v1',
  
  newsApiKey: process.env.NEWS_API_KEY || '5807e3e70bd2424584afdfc6e932108b',
  tmdbApiKey: process.env.TMDB_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyMzI4YmU1YzdhNDA1OTczZDdjMjA0NDlkYmVkOTg4OCIsIm5iZiI6MS43NDYwNzg5MDI5MTgwMDAyZSs5LCJzdWIiOiI2ODEzMGNiNjgyODI5Y2NhNzExZmJkNDkiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.FQlIdfWlf4E0Tw9sYRF7txbWymAby77KnHjTVNFSpdM',
  weatherApiKey: process.env.WEATHER_API_KEY || 'CWA-C80C73F3-7042-4D8D-A88A-D39DD2CFF841',

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || 'YOUR_TWILIO_ACCOUNT_SID_PLACEHOLDER',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || 'YOUR_TWILIO_AUTH_TOKEN_PLACEHOLDER',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || 'YOUR_TWILIO_PHONE_NUMBER_PLACEHOLDER',
  ownerPhoneNumber: process.env.OWNER_PHONE_NUMBER || 'OWNER_PHONE_NUMBER_TO_CALL_PLACEHOLDER',

  ownerLineId: process.env.OWNER_LINE_ID || 'U59af77e69411ffb99a49f1f2c3e2afc4',
  maxMessageLength: process.env.MAX_MESSAGE_LENGTH || 2000,
  port: process.env.PORT || 3000,
  
  nodeEnv: process.env.NODE_ENV || 'development'
};

console.log("src/core/line_config.js loaded. Port from config:", appConfig.port);

module.exports = appConfig;
