// bot.js
const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const { postToTwitter, scrapeAndSendToTelegram, sendToTelegram } = require('./scrapeAndPost');
const { MongoClient } = require('mongodb'); // If using MongoDB

dotenv.config();

// Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Database setup (optional: use MongoDB or any other DB)
const client = new MongoClient(process.env.DATABASE_URL);
let db;

// Connect to the database
async function connectDB() {
    try {
        await client.connect();
        db = client.db('termBotDB');
        console.log('Connected to Database');
    } catch (error) {
        console.error('Database connection error:', error);
    }
}

connectDB();

// Handle callback queries (Approve or Reject)
bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const messageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.callbackQuery.message.chat.id;
    const messageText = ctx.callbackQuery.message.text;

    if (callbackData === 'approve') {
        // Post to Twitter
        await postToTwitter(messageText);
        // Optionally, notify the user
        await ctx.answerCbQuery('Approved and posted to Twitter!');
        // Optionally, update the message to indicate approval
        await sendToTelegram(messageText + '\n\n✅ *Approved and posted to Twitter!*', messageId);
    } else if (callbackData === 'reject') {
        // Send another term
        const newTermId = await scrapeAndSendToTelegram();
        // Optionally, notify the user
        await ctx.answerCbQuery('Rejected. Fetching a new term...');
        // Optionally, update the message to indicate rejection
        await sendToTelegram('❌ *Term Rejected.* Fetching a new term...', messageId);
    }
});

// Start the bot
bot.launch();

console.log('Telegram bot is running');

// Handle graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
