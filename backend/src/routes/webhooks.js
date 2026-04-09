const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { handleIncomingMessage } = require('../services/autoReply');
const { getUserProfile } = require('../services/facebook');
const db = require('../db');

// ===================== FACEBOOK =====================

// Verification challenge
router.get('/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    console.log('[Facebook] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Receive messages
router.post('/facebook', async (req, res) => {
  // Verify signature if APP_SECRET is set
  const appSecret = process.env.FB_APP_SECRET;
  if (appSecret && appSecret !== 'your_app_secret_here') {
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) return res.sendStatus(401);
    const expected = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(req.rawBody)
      .digest('hex');
    if (sig !== expected) return res.sendStatus(401);
  }

  const body = req.body;
  if (body.object !== 'page') return res.sendStatus(404);

  res.sendStatus(200); // respond immediately

  const io = req.app.get('io');
  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message) continue;
      const text = event.message.text;
      if (!text) continue;

      // Echo: page tự reply trực tiếp trên Facebook
      if (event.message.is_echo) {
        const recipientId = event.recipient.id;
        const conv = await db.get(
          "SELECT c.id FROM conversations c JOIN customers cu ON c.customer_id = cu.id WHERE cu.channel = 'facebook' AND cu.channel_user_id = ?",
          [recipientId]
        );
        if (!conv) continue;
        const result = await db.run(
          "INSERT INTO messages (conversation_id, content, direction, sent_by, sender_name) VALUES (?, ?, 'out', 'agent', 'Facebook Page')",
          [conv.id, text]
        );
        const msg = await db.get('SELECT * FROM messages WHERE id = ?', [result.insertId]);
        await db.run(
          'UPDATE conversations SET last_message = ?, last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
          [text, conv.id]
        );
        if (io) io.emit('new_message', { conversation: await db.get('SELECT * FROM conversations WHERE id = ?', [conv.id]), message: msg });
        continue;
      }

      const senderId = event.sender.id;
      // Try to get user's name from FB
      let senderName = `FB_${senderId.slice(-6)}`;
      let avatarUrl = null;
      const profile = await getUserProfile(senderId);
      if (profile) {
        senderName = profile.name || senderName;
        avatarUrl = profile.profile_pic || null;
      }

      await handleIncomingMessage(
        { channel: 'facebook', channelUserId: senderId, senderName, message: text, avatarUrl },
        io
      );
    }
  }
});

// ===================== ZALO OA =====================

router.post('/zalo', async (req, res) => {
  const body = req.body;
  res.sendStatus(200);

  const io = req.app.get('io');

  // Zalo webhook event types
  if (body.event_name === 'user_send_text') {
    const senderId = body.sender?.id;
    const message = body.message?.text;
    const senderName = body.sender?.display_name || 'Khách Zalo';
    const avatarUrl = body.sender?.avatar || null;

    if (!senderId || !message) return;

    await handleIncomingMessage(
      { channel: 'zalo', channelUserId: senderId, senderName, message, avatarUrl },
      io
    );
  }
});

// ===================== WEBSITE CHAT =====================
// Website chat is handled via Socket.io in app.js
// This route just returns the embed script
router.get('/website-widget.js', (req, res) => {
  const host = req.query.host || `http://localhost:3001`;
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function() {
  const CRM_HOST = '${host}';
  const script = document.createElement('script');
  script.src = CRM_HOST + '/socket.io/socket.io.js';
  script.onload = function() { initCRMWidget(CRM_HOST); };
  document.head.appendChild(script);

  function initCRMWidget(host) {
    const socket = io(host, { transports: ['websocket', 'polling'] });
    const sessionKey = 'crm_session_' + Math.random().toString(36).slice(2);
    let sessionId = localStorage.getItem('crm_chat_session') || sessionKey;
    localStorage.setItem('crm_chat_session', sessionId);
    let senderName = localStorage.getItem('crm_chat_name') || '';

    const style = document.createElement('style');
    style.textContent = \`
      #crm-widget-btn { position:fixed; bottom:24px; right:24px; width:56px; height:56px;
        background:#2563eb; border-radius:50%; cursor:pointer; display:flex;
        align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(37,99,235,.4);
        z-index:9999; border:none; transition:transform .15s; }
      #crm-widget-btn:hover { transform:scale(1.08); }
      #crm-widget-btn svg { width:28px; height:28px; fill:white; }
      #crm-widget-box { position:fixed; bottom:90px; right:24px; width:340px; height:500px;
        background:white; border-radius:16px; box-shadow:0 8px 40px rgba(0,0,0,.18);
        display:none; flex-direction:column; z-index:9999; overflow:hidden;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
      #crm-widget-box.open { display:flex; }
      #crm-widget-header { background:linear-gradient(135deg,#2563eb,#1d4ed8); color:white;
        padding:16px 16px 14px; display:flex; align-items:center; gap:10px; flex-shrink:0; }
      #crm-widget-header-avatar { width:36px; height:36px; border-radius:50%;
        background:rgba(255,255,255,.2); display:flex; align-items:center;
        justify-content:center; flex-shrink:0; font-size:18px; }
      #crm-widget-header-info { flex:1; }
      #crm-widget-header-title { font-size:15px; font-weight:700; line-height:1.2; }
      #crm-widget-header-sub { font-size:11px; opacity:.8; margin-top:2px; }
      #crm-widget-close { background:none; border:none; color:white; cursor:pointer;
        opacity:.7; font-size:20px; line-height:1; padding:0; }
      #crm-widget-close:hover { opacity:1; }

      /* Name screen */
      #crm-name-screen { flex:1; display:flex; flex-direction:column; align-items:center;
        justify-content:center; padding:28px 24px; gap:0; }
      #crm-name-screen.hidden { display:none; }
      #crm-name-avatar { width:64px; height:64px; border-radius:50%; background:#eff6ff;
        display:flex; align-items:center; justify-content:center; font-size:32px; margin-bottom:16px; }
      #crm-name-title { font-size:17px; font-weight:700; color:#1e293b;
        margin-bottom:6px; text-align:center; }
      #crm-name-desc { font-size:13px; color:#64748b; text-align:center;
        margin-bottom:20px; line-height:1.5; }
      #crm-name-input { width:100%; padding:11px 14px; border:2px solid #e2e8f0;
        border-radius:10px; font-size:14px; outline:none; box-sizing:border-box;
        transition:border-color .15s; margin-bottom:12px; }
      #crm-name-input:focus { border-color:#2563eb; }
      #crm-name-btn { width:100%; padding:12px; background:#2563eb; color:white;
        border:none; border-radius:10px; font-size:14px; font-weight:700;
        cursor:pointer; transition:background .15s; }
      #crm-name-btn:hover { background:#1d4ed8; }

      /* Chat screen */
      #crm-chat-screen { flex:1; display:flex; flex-direction:column; min-height:0; }
      #crm-chat-screen.hidden { display:none; }
      #crm-widget-messages { flex:1; overflow-y:auto; padding:14px 12px; display:flex;
        flex-direction:column; gap:8px; background:#f8fafc; }
      .crm-msg-wrap { display:flex; flex-direction:column; }
      .crm-msg-wrap-out { align-items:flex-end; }
      .crm-msg-wrap-in  { align-items:flex-start; }
      .crm-msg { max-width:82%; padding:9px 13px; border-radius:14px;
        font-size:14px; line-height:1.45; word-break:break-word; }
      .crm-msg-in  { background:white; color:#1e293b; border:1px solid #e2e8f0;
        border-bottom-left-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,.06); }
      .crm-msg-out { background:#2563eb; color:white; border-bottom-right-radius:4px; }
      .crm-msg-time { font-size:10px; color:#94a3b8; margin-top:3px; padding:0 2px; }
      #crm-widget-input-area { display:flex; padding:10px 10px 12px; border-top:1px solid #e2e8f0;
        gap:8px; flex-shrink:0; background:white; }
      #crm-widget-input { flex:1; border:1.5px solid #e2e8f0; border-radius:10px;
        padding:9px 13px; font-size:14px; outline:none; font-family:inherit;
        transition:border-color .15s; resize:none; }
      #crm-widget-input:focus { border-color:#2563eb; }
      #crm-widget-send { background:#2563eb; color:white; border:none; border-radius:10px;
        width:40px; height:40px; cursor:pointer; font-size:18px; display:flex;
        align-items:center; justify-content:center; flex-shrink:0; transition:background .15s; }
      #crm-widget-send:hover { background:#1d4ed8; }
    \`;
    document.head.appendChild(style);

    // ── Toggle button
    const btn = document.createElement('button');
    btn.id = 'crm-widget-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

    // ── Widget box
    const box = document.createElement('div');
    box.id = 'crm-widget-box';
    box.innerHTML = \`
      <div id="crm-widget-header">
        <div id="crm-widget-header-avatar">💬</div>
        <div id="crm-widget-header-info">
          <div id="crm-widget-header-title">Hỗ trợ trực tuyến</div>
          <div id="crm-widget-header-sub">● Phản hồi trong vài phút</div>
        </div>
        <button id="crm-widget-close" title="Đóng">✕</button>
      </div>

      <div id="crm-name-screen">
        <div id="crm-name-avatar">👋</div>
        <div id="crm-name-title">Xin chào!</div>
        <div id="crm-name-desc">Vui lòng cho chúng tôi biết tên của bạn để được hỗ trợ tốt hơn.</div>
        <input id="crm-name-input" placeholder="Nhập tên của bạn..." maxlength="50" />
        <button id="crm-name-btn">Bắt đầu chat →</button>
      </div>

      <div id="crm-chat-screen" class="hidden">
        <div id="crm-widget-messages"></div>
        <div id="crm-widget-input-area">
          <input id="crm-widget-input" placeholder="Nhập tin nhắn..." />
          <button id="crm-widget-send">➤</button>
        </div>
      </div>
    \`;

    document.body.appendChild(btn);
    document.body.appendChild(box);

    const nameScreen  = document.getElementById('crm-name-screen');
    const chatScreen  = document.getElementById('crm-chat-screen');
    const nameInput   = document.getElementById('crm-name-input');
    const nameBtn     = document.getElementById('crm-name-btn');
    const messagesEl  = document.getElementById('crm-widget-messages');
    const inputEl     = document.getElementById('crm-widget-input');
    const sendBtn     = document.getElementById('crm-widget-send');
    const closeBtn    = document.getElementById('crm-widget-close');

    function showChat() {
      nameScreen.classList.add('hidden');
      chatScreen.classList.remove('hidden');
      setTimeout(() => inputEl.focus(), 50);
    }

    // Nếu đã có tên → vào thẳng chat
    if (senderName) showChat();

    btn.onclick = () => {
      box.classList.toggle('open');
      if (box.classList.contains('open') && !senderName) {
        setTimeout(() => nameInput.focus(), 50);
      }
    };
    closeBtn.onclick = () => box.classList.remove('open');

    function submitName() {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      senderName = name;
      localStorage.setItem('crm_chat_name', senderName);
      showChat();
    }
    nameBtn.onclick = submitName;
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });

    function formatTime() {
      return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    function addMessage(text, direction) {
      const wrap = document.createElement('div');
      wrap.className = 'crm-msg-wrap crm-msg-wrap-' + direction;
      const msg = document.createElement('div');
      msg.className = 'crm-msg crm-msg-' + direction;
      msg.textContent = text;
      const time = document.createElement('div');
      time.className = 'crm-msg-time';
      time.textContent = formatTime();
      wrap.appendChild(msg);
      wrap.appendChild(time);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    socket.on('connect', () => socket.emit('website_join', { sessionId }));
    socket.on('website_reply', (data) => {
      if (data.sessionId === sessionId) {
        addMessage(data.message, 'in');
        if (!box.classList.contains('open')) box.classList.add('open');
      }
    });

    function sendMessage() {
      const text = inputEl.value.trim();
      if (!text || !senderName) return;
      socket.emit('website_message', { sessionId, senderName, message: text });
      addMessage(text, 'out');
      inputEl.value = '';
    }

    sendBtn.onclick = sendMessage;
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
  }
})();
  `);
});

module.exports = router;
