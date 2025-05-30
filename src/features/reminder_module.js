// src/features/reminder_module.js
const fs = require('fs'); // Stub for future use
const path = require('path'); // Stub for future use

// Stub for appConfig, replace with actual import from `../core/line_config` if that file is created and contains ownerLineId
const appConfig = { 
  ownerLineId: process.env.OWNER_LINE_ID || 'U59af77e69411ffb99a49f1f2c3e2afc4' // Example, ensure this is available if needed
};


console.log("⏰ [REMINDER_MODULE] reminder_module.js loaded.");

let reminders = new Map(); // reminderId -> reminderObject
let activeTimers = new Map(); // reminderId -> timeoutId

const MAX_SETTIMEOUT_DELAY = 2147483647; // Max delay for setTimeout (approx 24.8 days)

/**
 * Generates a unique reminder ID.
 * @returns {string} A unique ID for the reminder.
 */
const generateReminderId = () => `rem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Parses text to extract reminder details.
 * @param {string} text - The input text from the user.
 * @param {string} userId - The ID of the user setting the reminder. (Currently unused in this simplified parser)
 * @returns {object|null} An object with { title, targetTime, isAlarm, reminderMethod, originalQuery } or null.
 */
function parseReminderText(text, userId) {
  console.log(`⏰ [REMINDER_MODULE] parseReminderText called with text: "${text}" for userId: ${userId}`);
  let reminderMethod = 'line';
  let titleText = text; 

  const lowerText = text.toLowerCase();
  const twilioKeywords = ['打電話提醒', '用電話叫我', 'call alarm'];
  if (twilioKeywords.some(keyword => lowerText.includes(keyword))) {
    reminderMethod = 'twilio';
    console.log(`⏰ [REMINDER_MODULE] Twilio reminder method detected for userId: ${userId}.`);
  }

  // Keywords to strip for title extraction
  const keywordsToStrip = [
    /提醒我/gi, /叫我/gi, /起床/gi, /鬧鐘/gi, /幫我設/gi, /設定一個/gi,
    /打電話提醒/gi, /用電話叫我/gi, /call alarm/gi,
    /\d+\s*分(?:鐘)?後/gi, /\d+\s*(?:個)?(?:小)?時後/gi, // Added optional "個" for小時後
    /\d{1,2}:\d{2}/gi, /\d{1,2}\s*點(?:鐘)?/gi, // Added optional "鐘" for 點
    /明天/gi, /今天/gi, /稍後/gi, // Added 今天, 稍後
    /請?/gi // Optional 請
  ];
  
  keywordsToStrip.forEach(pattern => {
    titleText = titleText.replace(pattern, '');
  });
  titleText = titleText.replace(/的$/,'').replace(/^的/,'').trim(); 

  let targetTime = null;
  const now = new Date();

  if (lowerText.includes('分鐘後') || lowerText.includes('分後')) {
    const match = lowerText.match(/(\d+)\s*分(?:鐘)?後/);
    if (match) targetTime = new Date(now.getTime() + parseInt(match[1]) * 60000);
  } else if (lowerText.includes('小時後') || lowerText.includes('時後')) {
    const match = lowerText.match(/(\d+)\s*(?:個)?(?:小)?時後/); // Added optional "個"
    if (match) targetTime = new Date(now.getTime() + parseInt(match[1]) * 3600000);
  } else {
    const timeMatch = lowerText.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1]);
      const minute = parseInt(timeMatch[2]);
      if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
        targetTime = new Date();
        targetTime.setHours(hour, minute, 0, 0);
        if (targetTime <= now) targetTime.setDate(targetTime.getDate() + 1);
      }
    } else {
      const hourMatch = lowerText.match(/(\d{1,2})\s*點(?:鐘)?/); // Added optional "鐘"
      if (hourMatch) {
        const hour = parseInt(hourMatch[1]);
        if (hour >= 0 && hour < 24) {
          targetTime = new Date();
          targetTime.setHours(hour, 0, 0, 0);
          if (targetTime <= now) targetTime.setDate(targetTime.getDate() + 1);
        }
      }
    }
    if (lowerText.includes('明天')) {
      if (!targetTime) { 
        targetTime = new Date(now); 
        targetTime.setHours(9,0,0,0); // Default to 9 AM for "明天" if no specific time
      }
      // Ensure it's tomorrow relative to current 'now' date, even if time was parsed for today
      if (targetTime.getDate() === now.getDate()) {
          targetTime.setDate(now.getDate() + 1);
      }
    }
  }

  if (!targetTime) {
    console.log(`⏰ [REMINDER_MODULE] Could not parse time from text: "${text}"`);
    return null;
  }
  
  const title = titleText || (reminderMethod === 'twilio' ? '電話提醒' : '提醒事項');
  const isAlarm = lowerText.includes('叫我起床') || lowerText.includes('鬧鐘') || reminderMethod === 'twilio';
  
  console.log(`⏰ [REMINDER_MODULE] Parsed reminder: Title="${title}", TargetTime=${targetTime.toISOString()}, IsAlarm=${isAlarm}, Method=${reminderMethod}`);
  return { title, targetTime, isAlarm, reminderMethod, originalQuery: text };
}

/**
 * Sets a new reminder.
 * @param {string} userId - The user's ID.
 * @param {string} sourceId - The source of the event (userId or groupId).
 * @param {object} reminderDetails - Object from parseReminderText.
 * @returns {object|null} The created reminder object or null.
 */
async function setReminder(userId, sourceId, reminderDetails) {
  const { title, targetTime, isAlarm, reminderMethod, originalQuery } = reminderDetails;
  const reminderId = generateReminderId();
  
  const reminder = {
    id: reminderId,
    userId,
    sourceId, 
    title,
    targetTime: targetTime.toISOString(), // Store as ISO string for consistency
    isAlarm,
    reminderMethod,
    originalQuery,
    isActive: true, // isActive is true when set
    created: new Date().toISOString()
  };

  const delay = new Date(reminder.targetTime).getTime() - Date.now();

  if (delay < 0) { 
    console.warn(`⏰ [REMINDER_MODULE] Reminder ${reminderId} for "${title}" is in the past. Delay: ${delay}ms. Not scheduling.`);
    return null; 
  }
  if (delay > MAX_SETTIMEOUT_DELAY) {
    console.warn(`⏰ [REMINDER_MODULE] Reminder ${reminderId} for "${title}" has delay > MAX_SETTIMEOUT_DELAY (${delay}ms). Not scheduling.`);
    return null;
  }

  reminders.set(reminderId, reminder);
  
  const timerId = setTimeout(() => {
    // Use module.exports to ensure the correct function is called, especially in modules
    module.exports.executeReminder(reminderId); 
  }, delay);
  activeTimers.set(reminderId, timerId);
  
  console.log(`⏰ [REMINDER_MODULE] Set reminder ${reminderId}: "${title}" at ${new Date(reminder.targetTime).toLocaleString('zh-TW')} via ${reminderMethod}. Delay: ${delay}ms.`);
  // File saving can be added here later if persistence is fully implemented
  return reminder;
}

/**
 * Clears an active reminder.
 * @param {string} reminderId - The ID of the reminder to clear.
 * @returns {boolean} True if found and cleared, false otherwise.
 */
async function clearReminder(reminderId) {
  const timerId = activeTimers.get(reminderId);
  if (timerId) {
    clearTimeout(timerId);
    activeTimers.delete(reminderId);
  }
  const reminder = reminders.get(reminderId);
  if (reminder) {
    reminders.delete(reminderId); 
    console.log(`⏰ [REMINDER_MODULE] Cleared reminder ${reminderId}: "${reminder.title}"`);
    // File saving can be added here later
    return true;
  } else {
    console.log(`⏰ [REMINDER_MODULE] clearReminder: Reminder ${reminderId} not found in main list.`);
    return false;
  }
}

/**
 * Executes a reminder by delegating to a global handler.
 * @param {string} reminderId - The ID of the reminder to execute.
 */
async function executeReminder(reminderId) {
  console.log(`⏰ [REMINDER_MODULE] Attempting to execute reminder ${reminderId}.`);
  const reminder = reminders.get(reminderId);
  
  if (!reminder) {
    console.warn(`⏰ [REMINDER_MODULE] Execute: Reminder ${reminderId} not found in map. Clearing stray timer if any.`);
    const timerId = activeTimers.get(reminderId);
    if (timerId) {
      clearTimeout(timerId);
      activeTimers.delete(reminderId);
    }
    return; // Return here as there's no reminder to process
  }

  // Mark as processed by removing it from internal state BEFORE delegation
  // This also handles deleting from activeTimers map via clearReminder
  await clearReminder(reminderId); 

  console.log(`⏰ [REMINDER_MODULE] Delegating execution of reminder ${reminderId}: "${reminder.title}" for user ${reminder.userId}.`);
  if (typeof global.handleExecutedReminder === 'function') {
    try {
      // Pass the original reminder object which now includes isActive: false (implicitly, as it's removed)
      global.handleExecutedReminder(reminder);
    } catch (e) {
      console.error(`🚨 [REMINDER_MODULE] Error in global.handleExecutedReminder for ${reminderId}:`, e);
    }
  } else {
    console.error(`🚨 [REMINDER_MODULE] global.handleExecutedReminder is not defined! Cannot process reminder ${reminderId}. Reminder details: ${JSON.stringify(reminder)}`);
  }
}

/**
 * Lists active reminders for a given user.
 * @param {string} userId - The ID of the user.
 * @returns {Array<object>} An array of reminder objects.
 */
function listUserReminders(userId) {
  const userReminders = [];
  for (const reminder of reminders.values()) {
    // Since reminders are deleted upon execution/cancellation, all reminders in the map are considered "active" or pending.
    if (reminder.userId === userId) { 
      userReminders.push(reminder);
    }
  }
  console.log(`⏰ [REMINDER_MODULE] Found ${userReminders.length} reminders for user ${userId}.`);
  return userReminders.sort((a, b) => new Date(a.targetTime) - new Date(b.targetTime));
}


// Placeholder for file persistence logic if it were to be fully re-enabled
// async function saveRemindersToFile() { /* ... */ }
// async function loadRemindersFromFile() { /* ... */ }
// loadRemindersFromFile(); // Call on module load

module.exports = {
  parseReminderText,
  setReminder,
  clearReminder,
  executeReminder, 
  listUserReminders,
  // For testing/debugging:
  _reminders: reminders, 
  _activeTimers: activeTimers,
};
