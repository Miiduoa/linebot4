#!/usr/bin/env node

/**
 * 🔧 LINE Bot 配置檢查腳本
 * 使用方法：node config-check.js
 */

console.log('\n' + '='.repeat(60));
console.log('🔧 LINE Bot 配置檢查工具');
console.log('='.repeat(60));

// 檢查必填環境變數
const requiredVars = {
  'LINE_CHANNEL_ACCESS_TOKEN': {
    description: 'LINE Bot 存取權杖',
    required: true,
    length: 150
  },
  'LINE_CHANNEL_SECRET': {
    description: 'LINE Bot 頻道密鑰',
    required: true,
    length: 32
  },
  'GEMINI_API_KEY': {
    description: 'Google Gemini AI API 金鑰',
    required: true,
    length: 30
  },
  'ADMIN_USER_ID': {
    description: '管理員 LINE ID',
    required: true,
    length: 5
  }
};

// 檢查可選環境變數
const optionalVars = {
  'BACKUP_AI_KEY': {
    description: '備用 AI API 金鑰',
    required: false
  },
  'BACKUP_AI_URL': {
    description: '備用 AI API 網址',
    required: false
  },
  'NEWS_API_KEY': {
    description: '新聞 API 金鑰',
    required: false
  },
  'WEATHER_API_KEY': {
    description: '天氣 API 金鑰',
    required: false
  },
  'TMDB_API_KEY': {
    description: '電影資料庫 API 金鑰',
    required: false
  }
};

let hasErrors = false;
let warnings = 0;

console.log('\n📋 必填環境變數檢查：');
console.log('-'.repeat(60));

for (const [varName, config] of Object.entries(requiredVars)) {
  const value = process.env[varName];
  
  if (!value) {
    console.log(`❌ ${varName}`);
    console.log(`   描述：${config.description}`);
    console.log(`   狀態：未設定`);
    console.log(`   影響：功能無法正常運作`);
    hasErrors = true;
  } else if (value.length < config.length) {
    console.log(`⚠️  ${varName}`);
    console.log(`   描述：${config.description}`);
    console.log(`   狀態：已設定但長度可能不正確`);
    console.log(`   長度：${value.length} (預期至少 ${config.length})`);
    warnings++;
  } else {
    console.log(`✅ ${varName}`);
    console.log(`   描述：${config.description}`);
    console.log(`   狀態：已正確設定`);
  }
  console.log('');
}

console.log('\n📋 可選環境變數檢查：');
console.log('-'.repeat(60));

for (const [varName, config] of Object.entries(optionalVars)) {
  const value = process.env[varName];
  
  if (!value) {
    console.log(`⚪ ${varName}`);
    console.log(`   描述：${config.description}`);
    console.log(`   狀態：未設定（可選功能）`);
  } else {
    console.log(`✅ ${varName}`);
    console.log(`   描述：${config.description}`);
    console.log(`   狀態：已設定`);
  }
  console.log('');
}

// 檢查系統環境變數
console.log('\n📋 系統環境變數檢查：');
console.log('-'.repeat(60));

const systemVars = {
  'NODE_ENV': process.env.NODE_ENV || 'development',
  'PORT': process.env.PORT || '3000',
  'TZ': process.env.TZ || 'UTC'
};

for (const [varName, value] of Object.entries(systemVars)) {
  console.log(`✅ ${varName}: ${value}`);
}

// 生成報告
console.log('\n' + '='.repeat(60));
console.log('📊 檢查結果摘要');
console.log('='.repeat(60));

if (hasErrors) {
  console.log('❌ 發現嚴重錯誤！');
  console.log('🚨 必填環境變數未設定，Bot 無法正常運作');
  console.log('\n💡 解決方法：');
  console.log('1. 檢查 .env 檔案（本地開發）');
  console.log('2. 檢查 Render.com 環境變數設定（部署）');
  console.log('3. 參考 .env.example 檔案');
  process.exit(1);
} else if (warnings > 0) {
  console.log('⚠️  發現警告！');
  console.log(`🔍 ${warnings} 個環境變數可能有問題`);
  console.log('\n💡 建議：');
  console.log('1. 檢查變數值的格式和長度');
  console.log('2. 確認 API 金鑰是否有效');
  console.log('3. 測試相關功能是否正常');
} else {
  console.log('✅ 所有檢查通過！');
  console.log('🎉 環境配置正確，可以開始部署');
}

console.log('\n📚 相關資源：');
console.log('• LINE Developers Console: https://developers.line.biz/');
console.log('• Google AI Studio: https://ai.google.dev/');
console.log('• Render.com 部署指南: https://render.com/docs');

console.log('\n🔧 如需協助：');
console.log('1. 檢查修復說明 README.md');
console.log('2. 查看部署日誌');
console.log('3. 訪問 /test-config 端點');

console.log('\n' + '='.repeat(60) + '\n');

// 如果沒有錯誤，提供下一步指導
if (!hasErrors) {
  console.log('🚀 下一步：');
  console.log('1. 部署到 Render.com');
  console.log('2. 設定 LINE Bot Webhook URL');
  console.log('3. 測試基本功能');
  console.log('4. 享受你的 AI 分身！');
  console.log('');
}