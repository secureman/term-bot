// 2. telegram-bot-worker.js (Cloudflare Worker) OLD

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
  })
  
  const BOT_TOKEN = '7768373298:AAHwVlVUqI2HEpRpWHdeOdqjAxh3FWCfulU' // Use Cloudflare Worker's secret
  const CHAT_ID = '6644529421' // Use Cloudflare Worker's secret
  const VERCEL_API_URL = 'https://term-scraper-secureman-orsteds-projects.vercel.app/api' // Update this
  
  async function handleRequest(request) {
    if (request.method === 'POST') {
      try {
        const payload = await request.json()
        
        if (payload.message && payload.message.text) {
          const chatId = payload.message.chat.id
          const text = payload.message.text
  
          if (text === '/start') {
            return sendTermForApproval(chatId)
          } else if (text === '/approve') {
            return approveTerm(chatId)
          } else if (text === '/disapprove') {
            return disapproveTerm(chatId)
          }
        }
      } catch (error) {
        console.error('Error processing request:', error)
        return new Response('Internal Server Error', { status: 500 })
      }
    }
  
    return new Response('OK')
  }
  
  async function sendTermForApproval(chatId) {
    try {
      const response = await fetch(`${VERCEL_API_URL}`)
      const data = await response.json()
      const term = data.term
  
      await sendTelegramMessage(chatId, `Do you approve this term?\n${term}\n\nReply with /approve or /disapprove`)
      return new Response('OK')
    } catch (error) {
      console.error('Error sending term for approval:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
  
  async function approveTerm(chatId) {
    try {
      const postResponse = await fetch(`${VERCEL_API_URL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'approve' }),
      })
  
      const postResult = await postResponse.json()
  
      if (postResult.success) {
        await sendTelegramMessage(chatId, `Term approved and posted to Twitter! Tweet URL: ${postResult.tweetUrl}`)
      } else {
        await sendTelegramMessage(chatId, 'Failed to post to Twitter. Please try again later.')
      }
  
      return new Response('OK')
    } catch (error) {
      console.error('Error approving term:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
  
  async function disapproveTerm(chatId) {
    try {
      const postResponse = await fetch(`${VERCEL_API_URL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'disapprove' }),
      })
  
      const postResult = await postResponse.json()
  
      if (postResult.success) {
        await sendTelegramMessage(chatId, 'Term disapproved. Fetching a new term...')
        return sendTermForApproval(chatId)
      } else {
        await sendTelegramMessage(chatId, 'Failed to process disapproval. Please try again later.')
      }
  
      return new Response('OK')
    } catch (error) {
      console.error('Error disapproving term:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
  
  async function sendTelegramMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
    const body = JSON.stringify({
      chat_id: chatId,
      text: text
    })
  
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body
    })
  
    return response
  }