const axios = require('axios');
const FormData = require('form-data');

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const GRAPH_API = 'https://graph.facebook.com/v22.0/me/messages';

async function sendFacebookImage(recipientId, buffer, mimetype, filename) {
  if (!PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN === 'your_page_access_token_here') {
    console.log('[Facebook] Token chưa cấu hình, bỏ qua gửi ảnh.');
    return false;
  }
  try {
    const form = new FormData();
    form.append('recipient', JSON.stringify({ id: recipientId }));
    form.append('message', JSON.stringify({
      attachment: { type: 'image', payload: { is_reusable: true } },
    }));
    form.append('filedata', buffer, { filename, contentType: mimetype });
    await axios.post(GRAPH_API, form, {
      params: { access_token: PAGE_ACCESS_TOKEN },
      headers: form.getHeaders(),
    });
    return true;
  } catch (err) {
    console.error('[Facebook] Gửi ảnh thất bại:', err.response?.data || err.message);
    return false;
  }
}

async function sendFacebookMessage(recipientId, text) {
  if (!PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN === 'your_page_access_token_here') {
    console.log('[Facebook] Token chưa cấu hình, bỏ qua gửi tin.');
    return false;
  }
  try {
    await axios.post(
      GRAPH_API,
      {
        recipient: { id: recipientId },
        message: { text },
        messaging_type: 'RESPONSE',
      },
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
    return true;
  } catch (err) {
    console.error('[Facebook] Gửi tin thất bại:', err.response?.data || err.message);
    return false;
  }
}

async function getUserProfile(userId) {
  if (!PAGE_ACCESS_TOKEN || PAGE_ACCESS_TOKEN === 'your_page_access_token_here') {
    return null;
  }
  try {
    const res = await axios.get(`https://graph.facebook.com/v22.0/${userId}`, {
      params: {
        fields: 'name,profile_pic',
        access_token: PAGE_ACCESS_TOKEN,
      },
    });
    return res.data;
  } catch {
    return null;
  }
}

module.exports = { sendFacebookMessage, sendFacebookImage, getUserProfile };
