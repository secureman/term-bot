// api/trigger.js
const { scrapeAndSendToTelegram } = require('../scrapeAndPost');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const messageId = await scrapeAndSendToTelegram();
        if (messageId) {
            res.status(200).json({ message: 'Term sent to Telegram for approval.', messageId });
        } else {
            res.status(500).json({ message: 'Failed to send term to Telegram.' });
        }
    } catch (error) {
        console.error('Error in trigger endpoint:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
