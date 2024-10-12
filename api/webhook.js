// api/webhook.js
const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const { postToTwitter, scrapeAndSendToTelegram } = require('../scrapeAndPost');

dotenv.config();

// Initialize Telegraf with the token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Handle callback queries (Approve or Reject)
bot.on('callback_query', async (
