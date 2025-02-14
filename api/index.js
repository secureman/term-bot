// Updated Code Review and Improvements

// 1. index.js (Vercel)

const axios = require('axios');
const cheerio = require('cheerio');
const { TwitterApi } = require('twitter-api-v2');

// Use environment variables for API credentials
const client = new TwitterApi({
  appKey: 'bWMbJrsVEhzeZ4X3yuXGiJ3QC',
  appSecret: '3ILmfne14fhxDRyBYd8MX2HrogwOkh7C4wmHoNPorQhraeN4ac',
  accessToken: '1844768251961921536-Vp266xth1o8jPSOEQD4ZVdUeZDqrs2',
  accessSecret: 'K3BiGt8sIm8fG9gGNfQYA4q0wnC8rUYjp8sHXm8jG18ZP',
});

// In-memory storage (Note: This will reset on each deployment or server restart)
let currentTerm = null;

async function getPageContent(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

async function getRandomTerm() {
  try {
    const mainUrl = "https://en.mo3jam.com/index/%D8%A3";
    console.log('Fetching main page...');
    const mainPageContent = await getPageContent(mainUrl);

    if (!mainPageContent) {
      throw new Error('Failed to fetch main page');
    }

    const $ = cheerio.load(mainPageContent);

    const alphabetLinks = $('.initials-container a').map((i, el) => $(el).attr('href')).get();
    
    if (alphabetLinks.length === 0) {
      throw new Error('No alphabet links found');
    }

    const randomAlphabetUrl = alphabetLinks[Math.floor(Math.random() * alphabetLinks.length)];
    const alphabetPageUrl = `https://en.mo3jam.com${randomAlphabetUrl}`;
    console.log(`Fetching alphabet page: ${alphabetPageUrl}`);
    const alphabetPageContent = await getPageContent(alphabetPageUrl);

    if (!alphabetPageContent) {
      throw new Error('Failed to fetch alphabet page');
    }

    const $alphabetPage = cheerio.load(alphabetPageContent);

    const termUrls = $alphabetPage('.term-list a').map((i, el) => $(el).attr('href')).get();

    if (termUrls.length === 0) {
      throw new Error('No terms found on the alphabet page');
    }

    const randomTermUrl = termUrls[Math.floor(Math.random() * termUrls.length)];
    const termPageUrl = `https://en.mo3jam.com${randomTermUrl}`;
    console.log(`Fetching term page: ${termPageUrl}`);
    const termPageContent = await getPageContent(termPageUrl);

    if (!termPageContent) {
      throw new Error('Failed to fetch term page');
    }

    const $termPage = cheerio.load(termPageContent);

    const termHeading = $termPage('#def-page-heading').text().trim();
    const definition = $termPage('.def-main .def-body').text().trim();
    const example = $termPage('.def-main .example').text().trim() || "No example available";
    const origin = $termPage('.def-main .dialects .dialect').text().trim() || "No origin available";

    if (!termHeading || !definition) {
      throw new Error('Failed to extract term details');
    }

    return `Term: ${termHeading}\nDefinition: ${definition}\nExample: ${example}\nMostly Used (Dialect): ${origin}`;
  } catch (error) {
    console.error('Error in getRandomTerm:', error);
    return `Error: ${error.message}`;
  }
}

async function postToTwitter(term) {
  try {
    const tweet = await client.v2.tweet(term);
    console.log(`Posted to Twitter: ${tweet.data.text}`);
    return tweet.data.id;
  } catch (error) {
    console.error("Error posting to Twitter:", error);
    throw error;
  }
}

async function handleRequest(req, res) {
  console.log('Received request:', req.method);
  if (req.method === 'GET') {
    try {
      if (!currentTerm) {
        console.log('Fetching new random term...');
        currentTerm = await getRandomTerm();
      }
      console.log('Current term:', currentTerm);
      res.status(200).json({ term: currentTerm });
    } catch (error) {
      console.error('Error in handleRequest:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  } else if (req.method === 'POST') {
    try {
      const { action } = req.body;
      if (action === 'approve') {
        if (!currentTerm) {
          return res.status(400).json({ error: 'No term to approve' });
        }
        const tweetId = await postToTwitter(currentTerm);
        const tweetUrl = `https://twitter.com/user/status/${tweetId}`;
        currentTerm = null; // Reset the current term
        res.status(200).json({ success: true, tweetUrl });
      } else if (action === 'disapprove') {
        currentTerm = null; // Reset the current term
        res.status(200).json({ success: true, message: 'Term disapproved' });
      } else {
        res.status(400).json({ error: 'Invalid action' });
      }
    } catch (error) {
      console.error('Error processing action:', error);
      res.status(500).json({ error: 'Failed to process action', message: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

module.exports = handleRequest;