const axios = require('axios');

const CHATBOT_URL = process.env.CHATBOT_URL || 'http://localhost:8000';

async function askChatbot(question) {
  try {
    const response = await axios.get(`${CHATBOT_URL}/ask`, {
      params: { question },
      timeout: 15000,
    });
    return response.data.answer || null;
  } catch (err) {
    console.error('[Chatbot] Error calling chatbot API:', err.message);
    return null;
  }
}

module.exports = { askChatbot };
