// scrapeAndPost.js
const axios = require('axios');
const cheerio = require('cheerio');
const { TwitterApi } = require('twitter-api-v2');
const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

// Twitter API Client
const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Database setup
const clientDB = new MongoClient(process.env.DATABASE_URL);
let dbDB;

async function connectDB() {
    try {
        await clientDB.connect();
        dbDB = clientDB.db('termBotDB');
        console.log('Connected to Database');
    } catch (error) {
        console.error('Database connection error:', error);
    }
}

connectDB();

// Function to fetch the HTML content of a page
async function getPageContent(url) {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Error fetching URL: ${url}`, error);
        return null;
    }
}

// Function to scrape a random term
async function getRandomTerm() {
    const mainUrl = "https://en.mo3jam.com/index/%D8%A3";
    const mainPageContent = await getPageContent(mainUrl);

    if (mainPageContent) {
        const $ = cheerio.load(mainPageContent);

        // Get the alphabet links
        const alphabetLinks = [];
        $('.initials-container a').each((i, elem) => {
            const link = $(elem).attr('href');
            if (link) alphabetLinks.push(link);
        });

        if (alphabetLinks.length === 0) {
            throw new Error('No alphabet links found.');
        }

        // Randomly choose one alphabet link and fetch its page
        const randomAlphabetUrl = alphabetLinks[Math.floor(Math.random() * alphabetLinks.length)];
        const alphabetPageUrl = `https://en.mo3jam.com${randomAlphabetUrl}`;
        const alphabetPageContent = await getPageContent(alphabetPageUrl);

        if (alphabetPageContent) {
            const $alphabetPage = cheerio.load(alphabetPageContent);

            // Get a list of terms from the grid
            const termUrls = [];
            $alphabetPage('ul.term-list a').each((i, elem) => {
                const link = $alphabetPage(elem).attr('href');
                if (link) termUrls.push(link);
            });

            if (termUrls.length === 0) {
                throw new Error('No term links found.');
            }

            // Randomly choose a term and fetch its page
            const randomTermUrl = termUrls[Math.floor(Math.random() * termUrls.length)];
            const termPageUrl = `https://en.mo3jam.com${randomTermUrl}`;
            const termPageContent = await getPageContent(termPageUrl);

            if (termPageContent) {
                const $termPage = cheerio.load(termPageContent);

                // Extract term and its definition
                const termHeading = $termPage('h1#def-page-heading').text().trim();
                const definitionSection = $termPage('.def-main');
                const definition = definitionSection.find('.def-body').text().trim();
                const example = definitionSection.find('.example').text().trim() || "No example available";

                // Extract the "phrase in" and origin (dialect) information
                const dialect = definitionSection.find('.dialects .dialect').text().trim() || "No origin available";

                // Format the term details
                return `📚 *Term:* ${termHeading}\n\n📝 *Definition:* ${definition}\n\n💬 *Example:* ${example}\n\n🌍 *Dialect:* ${dialect}`;
            } else {
                throw new Error('Failed to fetch term details.');
            }
        } else {
            throw new Error('Failed to fetch alphabet page.');
        }
    } else {
        throw new Error('Failed to fetch main page.');
    }
}

// Function to send term to Telegram for approval
async function sendToTelegram(termDetails, messageId = null) {
    try {
        // Store the term in the database
        const termEntry = {
            term: termDetails,
            status: 'pending',
            messageId,
            timestamp: new Date(),
        };
        const result = await dbDB.collection('pendingTerms').insertOne(termEntry);
        // Send to Telegram
        const sentMessage = await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, termDetails, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Approve', callback_data: 'approve' },
                        { text: '❌ Reject', callback_data: 'reject' }
                    ]
                ]
            }
        });
        // Update the database with the message ID
        await dbDB.collection('pendingTerms').updateOne(
            { _id: result.insertedId },
            { $set: { messageId: sentMessage.message_id } }
        );
        return sentMessage.message_id;
    } catch (error) {
        console.error('Error sending message to Telegram:', error);
    }
}

// Function to post on Twitter
async function postToTwitter(term) {
    try {
        const response = await twitterClient.v2.tweet(term);
        if (response.data) {
            console.log(`Posted to Twitter: ${response.data.text}`);
        } else {
            console.log('Failed to post tweet.');
        }
    } catch (error) {
        console.error(`Error posting to Twitter: ${error.message}`);
    }
}

// Exported function to initiate the process
async function scrapeAndSendToTelegram() {
    try {
        const termDetails = await getRandomTerm();
        console.log("Scraped Term Details:", termDetails);
        const messageId = await sendToTelegram(termDetails);
        return messageId;
    } catch (error) {
        console.error('Error in scrapeAndSendToTelegram:', error);
        return null;
    }
}

module.exports = {
    scrapeAndSendToTelegram,
    postToTwitter,
};
