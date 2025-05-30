// src/services/twilio_service.js
const appConfig = require('../core/line_config'); 

/**
 * Sends a voice call reminder via Twilio (Stubbed).
 * @param {string} targetPhoneNumber - The phone number to call (owner's number).
 * @param {string} fromPhoneNumber - The Twilio phone number to call from.
 * @param {string} messageText - The text to be read out in the call.
 * @param {string} reminderId - The ID of the reminder for logging.
 * @returns {Promise<object>} Object with success status and message.
 */
async function sendTwilioCall(targetPhoneNumber, fromPhoneNumber, messageText, reminderId) {
  console.log(`📞 [TWILIO_STUB] Attempting to send Twilio call for reminder ${reminderId}:`);
  console.log(`  To: ${targetPhoneNumber}, From: ${fromPhoneNumber}`);
  console.log(`  Message: "${messageText}"`);
  
  // More robust check against various placeholder strings, including the original generic ones
  const isPlaceholder = (value, ...placeholders) => {
    if (!value) return true; // Treat empty or null as a placeholder problem
    const upperValue = value.toUpperCase();
    return placeholders.some(p => upperValue.includes(p.toUpperCase()));
  };

  if (isPlaceholder(appConfig.twilioAccountSid, 'PLACEHOLDER', 'YOUR_TWILIO_ACCOUNT_SID') ||
      isPlaceholder(appConfig.twilioAuthToken, 'PLACEHOLDER', 'YOUR_TWILIO_AUTH_TOKEN') ||
      isPlaceholder(appConfig.twilioPhoneNumber, 'PLACEHOLDER', 'YOUR_TWILIO_PHONE_NUMBER') ||
      isPlaceholder(appConfig.ownerPhoneNumber, 'PLACEHOLDER', 'OWNER_PHONE_NUMBER_TO_CALL')) {
    console.warn("📞 [TWILIO_STUB] Twilio credentials or phone numbers appear to be placeholders or are not fully configured. Stubbed call will not simulate actual API interaction due to missing/placeholder configuration.");
    return Promise.resolve({ success: false, message: "Twilio not configured with actual (non-placeholder) credentials." });
  }

  // Actual Twilio client initialization and call would go here.
  // const twilioClient = require('twilio')(appConfig.twilioAccountSid, appConfig.twilioAuthToken);
  // try {
  //   const call = await twilioClient.calls.create({
  //     twiml: `<Response><Say language='zh-TW'>${messageText}</Say></Response>`,
  //     to: targetPhoneNumber,
  //     from: fromPhoneNumber,
  //   });
  //   console.log(`📞 [TWILIO_SERVICE] Live Twilio call initiated. SID: ${call.sid}`); // Changed log prefix for live call
  //   return Promise.resolve({ success: true, message: "Twilio call initiated successfully.", sid: call.sid });
  // } catch (error) {
  //   console.error(`📞 [TWILIO_SERVICE] Error during actual Twilio call attempt:`, error); // Changed log prefix
  //   return Promise.resolve({ success: false, message: `Twilio call failed: ${error.message}` });
  // }
  console.log("📞 [TWILIO_STUB] Twilio appears configured with actual values. If un-stubbed, a real call would be attempted here.");
  return Promise.resolve({ success: true, message: "Twilio call stubbed (simulated success)." });
}

console.log("src/services/twilio_service.js loaded");
module.exports = { sendTwilioCall };
