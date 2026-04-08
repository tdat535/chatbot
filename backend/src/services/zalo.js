const axios = require('axios');

const OA_ACCESS_TOKEN = process.env.ZALO_OA_ACCESS_TOKEN;
const ZALO_API = 'https://openapi.zalo.me/v2.0/oa/message';

async function sendZaloMessage(recipientId, text) {
  if (!OA_ACCESS_TOKEN || OA_ACCESS_TOKEN === 'your_oa_access_token_here') {
    console.log('[Zalo] Token chưa cấu hình, bỏ qua gửi tin.');
    return false;
  }
  try {
    await axios.post(
      ZALO_API,
      {
        recipient: { user_id: recipientId },
        message: { text },
      },
      {
        headers: {
          access_token: OA_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
    return true;
  } catch (err) {
    console.error('[Zalo] Gửi tin thất bại:', err.response?.data || err.message);
    return false;
  }
}

module.exports = { sendZaloMessage };
