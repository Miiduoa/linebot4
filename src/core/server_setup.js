// src/core/server_setup.js
const express = require('express');
const line = require('@line/bot-sdk');
const crypto = require('crypto');
const appConfig = require('./line_config'); // Corrected variable name

const app = express();

const client = new line.Client({
  channelAccessToken: appConfig.lineChannelAccessToken,
  channelSecret: appConfig.lineChannelSecret
});

// Middleware for signature validation
// This assumes that express.raw({type: 'application/json'}) is applied before this middleware in main.js for the webhook route
const validateSignature = (req, res, next) => {
  // Ensure body is available as a string for validation.
  // If express.raw middleware was used, req.body is a Buffer.
  // If express.json middleware was used (and then this fails), that's an issue.
  // For this setup, we expect the raw body to be passed if this middleware is used directly after it.
  
  let requestBodyString;
  if (Buffer.isBuffer(req.body)) {
    requestBodyString = req.body.toString();
  } else if (typeof req.body === 'string') {
    // This case might occur if body-parser's text middleware was used, or if no parsing middleware was used yet.
    requestBodyString = req.body;
  } else if (typeof req.body === 'object' && Object.keys(req.body).length === 0) {
    // This can happen if express.json() ran but the body was empty, or if express.raw() resulted in an empty buffer.
    // An empty body string is valid for signature generation in some cases, but often indicates an issue upstream.
    requestBodyString = ''; 
  }
  else {
    // If req.body is an object from express.json(), this validation will fail as it needs the raw string.
    console.error('validateSignature: req.body is already parsed as JSON. Raw body needed for signature validation.');
    return res.status(400).send('Invalid body type for signature validation. Requires raw body.');
  }

  const signature = req.get('X-Line-Signature');
  if (!signature) {
    console.warn('validateSignature: Missing X-Line-Signature header');
    return res.status(401).send('Missing signature header');
  }

  try {
    const hash = crypto.createHmac('SHA256', appConfig.lineChannelSecret)
                     .update(requestBodyString)
                     .digest('base64');
    
    if (signature !== hash) {
      console.warn('validateSignature: Signature validation failed. Received:', signature, 'Expected:', hash);
      return res.status(401).send('Signature validation failed');
    }
  } catch (error) {
    console.error('validateSignature: Error during hash generation or comparison:', error);
    return res.status(500).send('Internal server error during signature validation.');
  }
  
  // If validation is successful, parse the JSON body for downstream handlers
  // This is to make req.body.events available as an object
  // This might be redundant if express.json() is also used globally,
  // but ensures it's available if only express.raw() was used before this.
  try {
    if(requestBodyString){
      req.body = JSON.parse(requestBodyString);
    } else {
      req.body = { events: [] }; // Handle empty body case
    }
  } catch (e) {
    console.error('validateSignature: Failed to parse JSON body after signature validation:', e);
    return res.status(400).send('Invalid JSON body.');
  }

  next();
};

console.log("src/core/server_setup.js loaded. LINE Client initialized.");
console.log("Note: `validateSignature` middleware expects `express.raw({type: 'application/json'})` to be used on the webhook route BEFORE it.");


module.exports = { app, client, validateSignature, appConfig };
