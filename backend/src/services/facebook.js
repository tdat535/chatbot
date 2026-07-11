const axios = require('axios');
const FormData = require('form-data');

const GRAPH_API = 'https://graph.facebook.com/v22.0/me/messages';

function getPageAccessToken(pageId) {
  const token2 = process.env.FB_PAGE_ACCESS_TOKEN_2;
  if (pageId && String(pageId) === String(process.env.FB_PAGE_ID_2) && token2 && token2 !== 'your_page_access_token_2_here') {
    return token2;
  }
  const token1 = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token1 || token1 === 'your_page_access_token_here') {
    return null;
  }
  return token1;
}

async function sendFacebookImage(recipientId, buffer, mimetype, filename, pageId) {
  const token = getPageAccessToken(pageId);
  if (!token) {
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
      params: { access_token: token },
      headers: form.getHeaders(),
    });
    return true;
  } catch (err) {
    console.error('[Facebook] Gửi ảnh thất bại:', err.response?.data || err.message);
    return false;
  }
}

async function sendFacebookMessage(recipientId, text, pageId) {
  const token = getPageAccessToken(pageId);
  if (!token) {
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
      { params: { access_token: token } }
    );
    return true;
  } catch (err) {
    console.error('[Facebook] Gửi tin thất bại:', err.response?.data || err.message);
    return false;
  }
}

async function getUserProfile(userId, pageId) {
  const token = getPageAccessToken(pageId);
  if (!token) {
    return null;
  }
  try {
    const res = await axios.get(`https://graph.facebook.com/v22.0/${userId}`, {
      params: {
        fields: 'name,profile_pic',
        access_token: token,
      },
    });
    return res.data;
  } catch (error) {
    console.error('[Facebook] Lỗi khi lấy profile user:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { sendFacebookMessage, sendFacebookImage, getUserProfile };
