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

// In-memory storage
let currentTerm = null;
let lastTweetTime = null;
const TWEET_COOLDOWN = 60000; // 1 minute cooldown between tweets

// Constants
const STATIC_HASHTAGS = '#linguistics #languages #arabic #arabic_dialects';

// Enhanced error logging function
function logError(context, error) {
  const errorDetails = {
    context,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    twitterError: error.data ? {
      code: error.code,
      data: error.data
    } : undefined
  };
  
  console.error('Detailed Error Log:', JSON.stringify(errorDetails, null, 2));
  return errorDetails;
}

// Rate limit check function
function checkRateLimit() {
  if (!lastTweetTime) return true;
  const timeSinceLastTweet = Date.now() - lastTweetTime;
  return timeSinceLastTweet >= TWEET_COOLDOWN;
}

function extractDialectHashtag(origin) {
  if (!origin || origin === "No origin available") return "";
  
  // Clean up the origin text and convert to hashtag
  const dialect = origin.split(/[,\s]/)[0].trim(); // Take first word of dialect
  return dialect ? `#${dialect}` : "";
}

async function getPageContent(url) {
  try {
    console.log(`Fetching content from: ${url}`);
    const response = await axios.get(url);
    console.log(`Successfully fetched content from: ${url}`);
    return response.data;
  } catch (error) {
    const errorDetails = logError(`Failed to fetch content from ${url}`, error);
    throw new Error(`Failed to fetch content: ${errorDetails.message}`);
  }
}

async function getRandomTerm() {
  try {
    const mainUrl = "https://en.mo3jam.com/index/%D8%A3";
    console.log('Starting random term fetch process...');
    const mainPageContent = await getPageContent(mainUrl);

    if (!mainPageContent) {
      throw new Error('Main page content is empty');
    }

    const $ = cheerio.load(mainPageContent);
    const alphabetLinks = $('.initials-container a').map((i, el) => $(el).attr('href')).get();
    
    if (alphabetLinks.length === 0) {
      throw new Error('No alphabet links found on main page');
    }

    const randomAlphabetUrl = alphabetLinks[Math.floor(Math.random() * alphabetLinks.length)];
    const alphabetPageUrl = `https://en.mo3jam.com${randomAlphabetUrl}`;
    console.log(`Selected random alphabet page: ${alphabetPageUrl}`);
    
    const alphabetPageContent = await getPageContent(alphabetPageUrl);
    const $alphabetPage = cheerio.load(alphabetPageContent);
    const termUrls = $alphabetPage('.term-list a').map((i, el) => $(el).attr('href')).get();

    if (termUrls.length === 0) {
      throw new Error(`No terms found on alphabet page: ${alphabetPageUrl}`);
    }

    const randomTermUrl = termUrls[Math.floor(Math.random() * termUrls.length)];
    const termPageUrl = `https://en.mo3jam.com${randomTermUrl}`;
    console.log(`Selected random term page: ${termPageUrl}`);
    
    const termPageContent = await getPageContent(termPageUrl);
    const $termPage = cheerio.load(termPageContent);

    const termHeading = $termPage('#def-page-heading').text().trim();
    const definition = $termPage('.def-main .def-body').text().trim();
    const example = $termPage('.def-main .example').text().trim() || "No example available";
    const origin = $termPage('.def-main .dialects .dialect').text().trim() || "No origin available";

    if (!termHeading || !definition) {
      throw new Error(`Failed to extract term details from ${termPageUrl}`);
    }

    return {
      content: `Term: ${termHeading}\nDefinition: ${definition}\nExample: ${example}\nMostly Used (Dialect): ${origin}`,
      origin: origin
    };
  } catch (error) {
    const errorDetails = logError('Error in getRandomTerm', error);
    throw new Error(`Failed to get random term: ${errorDetails.message}`);
  }
}

async function postToTwitter(term, origin) {
  try {
    if (!checkRateLimit()) {
      const waitTime = Math.ceil((TWEET_COOLDOWN - (Date.now() - lastTweetTime)) / 1000);
      throw new Error(`Rate limit exceeded. Please wait ${waitTime} seconds before posting again.`);
    }

    console.log('Preparing tweet content...');
    
    const dialectHashtag = extractDialectHashtag(origin);
    let tweetContent = `${term}\n\n${STATIC_HASHTAGS}`;
    if (dialectHashtag) {
      tweetContent += ` ${dialectHashtag}`;
    }
    
    if (tweetContent.length > 280) {
      console.log('Tweet content too long, truncating...');
      const hashtagsLength = (STATIC_HASHTAGS + ' ' + dialectHashtag).length;
      const maxContentLength = 277 - hashtagsLength;
      tweetContent = `${term.substring(0, maxContentLength)}...\n\n${STATIC_HASHTAGS}`;
      if (dialectHashtag) {
        tweetContent += ` ${dialectHashtag}`;
      }
    }
    
    console.log('Posting tweet:', tweetContent);
    
    // Implement exponential backoff for Twitter API calls
    let attempts = 0;
    const maxAttempts = 3;
    const baseDelay = 1000; // 1 second

    while (attempts < maxAttempts) {
      try {
        const tweet = await client.v2.tweet(tweetContent);
        lastTweetTime = Date.now();
        console.log('Successfully posted tweet:', tweet.data);
        return tweet.data.id;
      } catch (twitterError) {
        attempts++;
        if (twitterError.code === 429) { // Rate limit error
          if (attempts === maxAttempts) throw twitterError;
          const delay = baseDelay * Math.pow(2, attempts);
          console.log(`Rate limited. Waiting ${delay}ms before retry ${attempts}/${maxAttempts}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw twitterError;
        }
      }
    }
  } catch (error) {
    const errorDetails = logError('Error posting to Twitter', error);
    throw new Error(`Twitter post failed: ${error.message}`);
  }
}

async function handleRequest(req, res) {
  console.log(`Handling ${req.method} request`);
  
  if (req.method === 'GET') {
    try {
      if (!currentTerm) {
        console.log('No current term, fetching new one...');
        const termData = await getRandomTerm();
        currentTerm = termData;
      }
      console.log('Returning current term');
      res.status(200).json({ term: currentTerm.content, origin: currentTerm.origin });
    } catch (error) {
      const errorDetails = logError('Error handling GET request', error);
      res.status(500).json({
        error: 'Failed to get term',
        details: errorDetails,
        userMessage: 'Failed to fetch a new term. Please try again.'
      });
    }
  } else if (req.method === 'POST') {
    try {
      const { action } = req.body;
      console.log('Processing POST request with action:', action);

      if (!action) {
        throw new Error('No action specified in request');
      }

      if (action === 'approve') {
        if (!currentTerm) {
          console.log('Approve action failed: No current term');
          return res.status(400).json({
            error: 'No term to approve',
            userMessage: 'No term is currently available for approval. Please fetch a new term first.'
          });
        }

        if (!checkRateLimit()) {
          const waitTime = Math.ceil((TWEET_COOLDOWN - (Date.now() - lastTweetTime)) / 1000);
          return res.status(429).json({
            error: 'Rate limit exceeded',
            userMessage: `Please wait ${waitTime} seconds before posting another tweet.`
          });
        }

        console.log('Approving current term for Twitter posting');
        const tweetId = await postToTwitter(currentTerm.content, currentTerm.origin);
        const tweetUrl = `https://twitter.com/user/status/${tweetId}`;
        console.log('Successfully posted to Twitter:', tweetUrl);
        
        currentTerm = null;
        res.status(200).json({
          success: true,
          tweetUrl,
          userMessage: 'Term successfully posted to Twitter!'
        });

      } else if (action === 'disapprove') {
        console.log('Disapproving current term');
        currentTerm = null;
        res.status(200).json({
          success: true,
          message: 'Term disapproved',
          userMessage: 'Term was disapproved. You can now fetch a new term.'
        });

      } else {
        throw new Error(`Invalid action: ${action}`);
      }

    } catch (error) {
      const errorDetails = logError('Error processing POST request', error);
      res.status(500).json({
        error: 'Action processing failed',
        details: errorDetails,
        userMessage: `Failed to process your request: ${error.message}`
      });
    }
  } else {
    console.log(`Rejected ${req.method} request: Method not allowed`);
    res.status(405).json({
      error: 'Method not allowed',
      userMessage: 'This type of request is not supported.'
    });
  }
}

module.exports = handleRequest;