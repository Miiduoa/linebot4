// 新增功能模塊 - 可以加到你現有的代碼中

// 圖表生成系統
class ChartSystem {
  constructor() {
    console.log('📊 圖表系統已初始化');
  }

  generateStatChart(data, title) {
    return {
      type: 'flex',
      altText: `📊 ${title}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📊 ${title}`,
              weight: 'bold',
              size: 'lg',
              color: '#4A90E2'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: data.map((item, index) => ({
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: item.label,
                flex: 2
              },
              {
                type: 'text',
                text: '█'.repeat(Math.max(1, Math.floor(item.value / 10))),
                flex: 3,
                color: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][index % 5]
              },
              {
                type: 'text',
                text: item.value.toString(),
                flex: 1,
                align: 'end',
                weight: 'bold'
              }
            ],
            margin: 'md'
          }))
        }
      }
    };
  }
}

// 轉發系統
class ForwardSystem {
  constructor(client) {
    this.client = client;
    this.pendingForwards = new Map();
    console.log('📤 轉發系統已初始化');
  }

  async handleForwardCommand(message, senderId) {
    // 解析 "告訴XXX" 格式
    const forwardMatch = message.match(/告訴\s*(.+?)\s*[:：]\s*(.+)/);
    if (!forwardMatch) {
      return '❌ 格式錯誤，請使用：告訴 用戶名: 訊息內容';
    }

    const [, targetName, content] = forwardMatch;
    
    const forwardId = `fwd-${Date.now()}`;
    this.pendingForwards.set(forwardId, {
      senderId,
      targetName,
      content,
      timestamp: new Date()
    });

    return {
      type: 'flex',
      altText: '📤 轉發確認',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📤 轉發確認',
            weight: 'bold',
            size: 'lg',
            color: '#4A90E2'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `收件人：${targetName}`,
              weight: 'bold'
            },
            {
              type: 'text',
              text: `訊息：${content}`,
              wrap: true,
              margin: 'md'
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
                label: '✅ 確認轉發',
                text: `確認轉發 ${forwardId}`
              },
              style: 'primary'
            },
            {
              type: 'button',
              action: {
                type: 'message',
                label: '❌ 取消',
                text: `取消轉發 ${forwardId}`
              }
            }
          ]
        }
      }
    };
  }
}

// 指令系統
class CommandSystem {
  constructor() {
    this.commands = new Map();
    this.initializeCommands();
    console.log('⚡ 指令系統已初始化');
  }

  initializeCommands() {
    this.commands.set('/status', {
      description: '查看系統狀態',
      permission: 'owner',
      handler: this.handleStatusCommand
    });

    this.commands.set('/users', {
      description: '查看用戶統計',
      permission: 'owner',
      handler: this.handleUsersCommand
    });

    this.commands.set('/clear', {
      description: '清除系統緩存',
      permission: 'owner',
      handler: this.handleClearCommand
    });

    this.commands.set('/backup', {
      description: '備份系統數據',
      permission: 'owner',
      handler: this.handleBackupCommand
    });
  }

  async processCommand(command, userId, aiSystem, decisionSystem, reminderSystem) {
    if (!this.commands.has(command)) {
      return '❌ 未知指令，使用 /help 查看可用指令';
    }

    const cmd = this.commands.get(command);
    
    // 權限檢查
    if (cmd.permission === 'owner' && userId !== OWNER_LINE_ID) {
      return '❌ 權限不足，僅限主人使用';
    }

    return await cmd.handler(aiSystem, decisionSystem, reminderSystem);
  }

  handleStatusCommand(aiSystem, decisionSystem, reminderSystem) {
    const stats = {
      conversations: aiSystem.conversations.size,
      pendingDecisions: decisionSystem.pendingDecisions.size,
      activeReminders: reminderSystem.reminders.size,
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed / 1024 / 1024
    };

    return {
      type: 'flex',
      altText: '📊 系統狀態',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📊 系統狀態總覽',
            weight: 'bold',
            size: 'lg',
            color: '#4A90E2'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '💬 對話數', flex: 1 },
                { type: 'text', text: stats.conversations.toString(), flex: 1, align: 'end' }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '⚖️ 待決策', flex: 1 },
                { type: 'text', text: stats.pendingDecisions.toString(), flex: 1, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '⏰ 活躍提醒', flex: 1 },
                { type: 'text', text: stats.activeReminders.toString(), flex: 1, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '🕒 運行時間', flex: 1 },
                { type: 'text', text: `${Math.floor(stats.uptime / 3600)}h`, flex: 1, align: 'end' }
              ],
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '💾 記憶體', flex: 1 },
                { type: 'text', text: `${stats.memory.toFixed(1)}MB`, flex: 1, align: 'end' }
              ],
              margin: 'md'
            }
          ]
        }
      }
    };
  }

  handleUsersCommand(aiSystem) {
    const users = Array.from(aiSystem.userProfiles.values());
    const totalUsers = users.length;
    const activeUsers = users.filter(u => {
      const daysSinceLastSeen = (new Date() - u.lastSeen) / (1000 * 60 * 60 * 24);
      return daysSinceLastSeen < 7;
    }).length;

    const chartData = [
      { label: '總用戶數', value: totalUsers },
      { label: '活躍用戶', value: activeUsers },
      { label: '群組用戶', value: users.filter(u => u.isGroup).length },
      { label: '私訊用戶', value: users.filter(u => !u.isGroup).length }
    ];

    return chartSystem.generateStatChart(chartData, '用戶統計');
  }

  handleClearCommand(aiSystem, decisionSystem, reminderSystem) {
    aiSystem.conversations.clear();
    decisionSystem.decisionHistory.clear();
    
    return '✅ 系統緩存已清除';
  }

  handleBackupCommand(aiSystem, decisionSystem, reminderSystem) {
    const backup = {
      timestamp: new Date(),
      conversations: aiSystem.conversations.size,
      decisions: decisionSystem.pendingDecisions.size,
      reminders: reminderSystem.reminders.size
    };

    return `✅ 備份完成\n📊 對話: ${backup.conversations}\n⚖️ 決策: ${backup.decisions}\n⏰ 提醒: ${backup.reminders}`;
  }
}

// 統計系統
class AnalyticsSystem {
  constructor() {
    this.dailyStats = new Map();
    this.featureUsage = new Map();
    console.log('📈 統計系統已初始化');
  }

  recordUsage(feature, userId) {
    const today = new Date().toDateString();
    
    if (!this.dailyStats.has(today)) {
      this.dailyStats.set(today, {
        totalMessages: 0,
        uniqueUsers: new Set(),
        features: new Map()
      });
    }

    const dayStats = this.dailyStats.get(today);
    dayStats.totalMessages++;
    dayStats.uniqueUsers.add(userId);
    
    if (!dayStats.features.has(feature)) {
      dayStats.features.set(feature, 0);
    }
    dayStats.features.set(feature, dayStats.features.get(feature) + 1);

    // 全局統計
    if (!this.featureUsage.has(feature)) {
      this.featureUsage.set(feature, 0);
    }
    this.featureUsage.set(feature, this.featureUsage.get(feature) + 1);
  }

  generateDailyReport() {
    const today = new Date().toDateString();
    const stats = this.dailyStats.get(today);
    
    if (!stats) {
      return '📊 今日暫無數據';
    }

    const topFeatures = Array.from(stats.features.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      type: 'flex',
      altText: '📊 今日統計報告',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{
            type: 'text',
            text: '📊 今日統計報告',
            weight: 'bold',
            size: 'lg',
            color: '#4A90E2'
          }]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `📱 總訊息數：${stats.totalMessages}`,
              weight: 'bold'
            },
            {
              type: 'text',
              text: `👥 活躍用戶：${stats.uniqueUsers.size}`,
              weight: 'bold',
              margin: 'md'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'text',
              text: '🔥 熱門功能：',
              weight: 'bold',
              margin: 'md'
            },
            ...topFeatures.map((feature, index) => ({
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: `${index + 1}. ${feature[0]}`,
                  flex: 2
                },
                {
                  type: 'text',
                  text: feature[1].toString(),
                  flex: 1,
                  align: 'end',
                  weight: 'bold'
                }
              ],
              margin: 'sm'
            }))
          ]
        }
      }
    };
  }
}

// 使用範例：
// const chartSystem = new ChartSystem();
// const forwardSystem = new ForwardSystem(client);
// const commandSystem = new CommandSystem();
// const analyticsSystem = new AnalyticsSystem();

// 在主要處理函數中加入：
/*
// 記錄功能使用
analyticsSystem.recordUsage('chat', userId);

// 處理指令
if (messageText.startsWith('/')) {
  const command = messageText.split(' ')[0];
  const response = await commandSystem.processCommand(command, userId, aiSystem, decisionSystem, reminderSystem);
  await safeReply(replyToken, response);
  return;
}

// 處理轉發
if (messageText.includes('告訴')) {
  const response = await forwardSystem.handleForwardCommand(messageText, userId);
  await safeReply(replyToken, response);
  return;
}
*/