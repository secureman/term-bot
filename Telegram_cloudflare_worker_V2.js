// NEW
import { TwitterApi } from 'twitter-api-v2';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const BOT_TOKEN = '7768373298:AAHwVlVUqI2HEpRpWHdeOdqjAxh3FWCfulU'
const CHAT_ID = '6644529421'
const VERCEL_API_URL = 'https://your-vercel-api-url.vercel.app' // Replace with your actual Vercel API URL

// Twitter API credentials
const twitterClient = new TwitterApi({
  appKey: 'bWMbJrsVEhzeZ4X3yuXGiJ3QC',
  appSecret: '3ILmfne14fhxDRyBYd8MX2HrogwOkh7C4wmHoNPorQhraeN4ac',
  accessToken: '1844768251961921536-Vp266xth1o8jPSOEQD4ZVdUeZDqrs2',
  accessSecret: 'K3BiGt8sIm8fG9gGNfQYA4q0wnC8rUYjp8sHXm8jG18ZP',
});

// Object to store the current term for each chat
const currentTerms = {};

async function handleRequest(request) {
  try {
    if (request.method === 'POST') {
      const payload = await request.json()
      
      if (payload.message && payload.message.text) {
        const chatId = payload.message.chat.id
        const text = payload.message.text

        console.log(`Received message: ${text} from chat ID: ${chatId}`)

        if (text === '/start') {
          return sendTermForApproval(chatId)
        } else if (text === '/approve') {
          return approveTerm(chatId)
        } else if (text === '/disapprove') {
          return sendTermForApproval(chatId)
        }
      }
    }

    return new Response('OK')
  } catch (error) {
    console.error('Error in handleRequest:', error)
    const errorDetails = `
Error Type: ${error.name}
Message: ${error.message}
Stack: ${error.stack || 'No stack trace available'}
`
    console.error(errorDetails)
    return new Response('Error', { status: 500 })
  }
}

async function sendTermForApproval(chatId) {
  try {
    console.log('Fetching term from Vercel API')
    const response = await fetch(VERCEL_API_URL)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    console.log('Received data from Vercel API:', data)

    if (!data.term) {
      throw new Error('No term received from API')
    }

    const term = data.term
    // Store the current term for this chat
    currentTerms[chatId] = term
    console.log(`Stored term for chat ${chatId}:`, term)
    await sendTelegramMessage(chatId, `Do you approve this term?\n${term}\n\nReply with /approve or /disapprove`)
    return new Response('OK')
  } catch (error) {
    console.error('Error in sendTermForApproval:', error)
    const errorMessage = `Error fetching term:\nType: ${error.name}\nDetails: ${error.message}`
    await sendTelegramMessage(chatId, errorMessage)
    return new Response('Error', { status: 500 })
  }
}

async function approveTerm(chatId) {
  try {
    console.log(`Attempting to approve term for chat ${chatId}`)
    const term = currentTerms[chatId]
    if (!term) {
      throw new Error('No term found for approval. Please fetch a new term using /start')
    }

    console.log(`Retrieved stored term for chat ${chatId}:`, term)
    await sendTelegramMessage(chatId, `Term found! Attempting to post to Twitter...\n${term}`)
    
    // Post to Twitter
    try {
      console.log('Initiating Twitter API call...')
      const tweetResult = await postToTwitter(term)
      console.log('Twitter API response:', tweetResult)
      await sendTelegramMessage(chatId, `Success! Term posted to Twitter!\nTweet ID: ${tweetResult.data.id}`)
    } catch (twitterError) {
      console.error('Twitter posting error:', twitterError)
      let errorMessage = 'Error posting to Twitter:\n'
      errorMessage += `Type: ${twitterError.name}\n`
      errorMessage += `Message: ${twitterError.message}\n`
      
      // Check for specific Twitter API errors
      if (twitterError.code) {
        errorMessage += `Twitter Error Code: ${twitterError.code}\n`
      }
      
      if (twitterError.data) {
        errorMessage += `Twitter API Response: ${JSON.stringify(twitterError.data)}\n`
      }

      // Check for rate limiting
      if (twitterError.rateLimitError) {
        errorMessage += 'Rate limit exceeded. Please try again later.\n'
      }

      // Check for authentication errors
      if (twitterError.message.includes('auth')) {
        errorMessage += 'Authentication failed. Please check Twitter credentials.\n'
      }

      await sendTelegramMessage(chatId, errorMessage)
      throw twitterError
    }

    // Clear the stored term after successful posting
    delete currentTerms[chatId]
    console.log(`Cleared stored term for chat ${chatId}`)

    return new Response('OK')
  } catch (error) {
    console.error('Error in approveTerm:', error)
    const errorDetails = `
Error approving term:
Type: ${error.name}
Message: ${error.message}
${error.stack ? `Stack Trace: ${error.stack}` : ''}
Current Term: ${currentTerms[chatId] || 'No term stored'}
`
    await sendTelegramMessage(chatId, errorDetails)
    return new Response('Error', { status: 500 })
  }
}

async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  const body = JSON.stringify({
    chat_id: chatId,
    text: text
  })

  try {
    console.log(`Sending Telegram message to chat ID ${chatId}:`, text)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log('Telegram API response:', result)
    return result
  } catch (error) {
    console.error('Error sending Telegram message:', error)
    throw error
  }
}

async function postToTwitter(term) {
  try {
    console.log('Attempting to post tweet:', term)
    const tweet = await twitterClient.v2.tweet(term);
    console.log('Twitter API response:', tweet)
    return tweet
  } catch (error) {
    console.error("Detailed Twitter error:", {
      name: error.name,
      message: error.message,
      code: error.code,
      data: error.data,
      stack: error.stack
    })
    throw error
  }
}