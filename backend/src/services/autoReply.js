const db = require('../db');
const { askChatbot } = require('./chatbot');
const { sendFacebookMessage } = require('./facebook');
const { sendZaloMessage } = require('./zalo');

// Track trạng thái thu thập thông tin: customerId -> 'waiting_name' | 'waiting_phone'
const collectionState = new Map();

// Timer re-enable bot sau khi agent không reply trong 3 phút
const reEnableTimers = new Map();
const pendingMessages = new Map(); // conversationId -> { channel, channelUserId, contextualQuestion }
const RE_ENABLE_DELAY_MS = 3 * 60 * 1000;

function scheduleReEnable(conversationId, io, pendingData) {
  if (reEnableTimers.has(conversationId)) {
    clearTimeout(reEnableTimers.get(conversationId));
  }
  if (pendingData) {
    pendingMessages.set(conversationId, pendingData);
  }
  const timer = setTimeout(async () => {
    reEnableTimers.delete(conversationId);
    await db.run('UPDATE conversations SET auto_reply = 1 WHERE id = ? AND auto_reply = 0', [conversationId]);
    console.log(`[AutoReply] Re-enabled bot for conversation ${conversationId} after 1 min inactivity`);
    if (io) io.emit('auto_reply_changed', { conversationId, auto_reply: true });

    // Trả lời luôn tin nhắn đang chờ
    const pending = pendingMessages.get(conversationId);
    pendingMessages.delete(conversationId);
    if (pending) {
      try {
        let answer = await askChatbot(pending.contextualQuestion);
        if (answer) {
          try { const p = JSON.parse(answer); if (p?.text) answer = p.text; } catch {}
          await sendBotReply(pending.channel, pending.channelUserId, conversationId, answer, io, pending.pageId);
        }
      } catch (e) {
        console.error('[AutoReply] Error replying to pending message:', e);
      }
    }
  }, RE_ENABLE_DELAY_MS);
  reEnableTimers.set(conversationId, timer);
}

function cancelReEnable(conversationId) {
  if (reEnableTimers.has(conversationId)) {
    clearTimeout(reEnableTimers.get(conversationId));
    reEnableTimers.delete(conversationId);
  }
  pendingMessages.delete(conversationId);
}

async function sendBotReply(channel, channelUserId, conversationId, text, io, pageId) {
  if (channel === 'facebook') await sendFacebookMessage(channelUserId, text, pageId);
  else if (channel === 'zalo') await sendZaloMessage(channelUserId, text);

  const result = await db.run(
    "INSERT INTO messages (conversation_id, content, direction, sent_by) VALUES (?, ?, 'out', 'bot')",
    [conversationId, text]
  );
  const msg = await db.get('SELECT * FROM messages WHERE id = ?', [result.insertId]);
  await db.run(
    'UPDATE conversations SET last_message = ?, last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
    [text, conversationId]
  );
  const conv = await getConversationWithCustomer(conversationId);
  if (io) io.emit('new_message', { conversation: conv, message: msg });
  return { conv, msg };
}

async function handleIncomingMessage({ channel, channelUserId, senderName, message, avatarUrl, pageId }, io) {
  // 1. Upsert customer
  await db.run(`
    INSERT INTO customers (name, channel, channel_user_id, avatar_url)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = IF(name = 'Khách hàng', VALUES(name), name),
      updated_at = CURRENT_TIMESTAMP
  `, [senderName || 'Khách hàng', channel, channelUserId, avatarUrl || null]);

  const customer = await db.get(
    'SELECT id, name, phone FROM customers WHERE channel = ? AND channel_user_id = ?',
    [channel, channelUserId]
  );
  const customerId = customer.id;

  // 2. Get or create conversation
  let conversation = await db.get(
    'SELECT * FROM conversations WHERE customer_id = ? AND channel = ? ORDER BY id DESC LIMIT 1',
    [customerId, channel]
  );

  if (!conversation) {
    const result = await db.run(
      'INSERT INTO conversations (customer_id, channel, last_message, last_message_at) VALUES (?, ?, ?, NOW())',
      [customerId, channel, message]
    );
    conversation = await db.get('SELECT * FROM conversations WHERE id = ?', [result.insertId]);
  } else {
    await db.run(`
      UPDATE conversations SET
        last_message = ?, last_message_at = NOW(),
        unread_count = unread_count + 1, updated_at = NOW()
      WHERE id = ?
    `, [message, conversation.id]);
    conversation = await db.get('SELECT * FROM conversations WHERE id = ?', [conversation.id]);
  }

  // 3. Save incoming message
  const inResult = await db.run(
    "INSERT INTO messages (conversation_id, content, direction, sent_by) VALUES (?, ?, 'in', 'user')",
    [conversation.id, message]
  );
  const incomingMsg = await db.get('SELECT * FROM messages WHERE id = ?', [inResult.insertId]);

  const fullConversation = await getConversationWithCustomer(conversation.id);
  if (io) io.emit('new_message', { conversation: fullConversation, message: incomingMsg });

  // 4. Thu thập tên + SĐT
  const autoReplyGlobal = process.env.AUTO_REPLY_ENABLED !== 'false';
  const autoReplyConv = conversation.auto_reply !== 0;

  // Build contextual question (dùng cho cả bot on và pending khi bot off)
  const recentMsgs = await db.query(
    "SELECT content, direction FROM messages WHERE conversation_id = ? AND type = 'text' ORDER BY id DESC LIMIT 4",
    [conversation.id]
  );
  const contextLines = recentMsgs.reverse().slice(0, -1)
    .map(m => m.direction === 'in' ? `Học sinh: ${m.content}` : `Bot: ${m.content}`)
    .join('\n');
  const contextualQuestion = contextLines ? `${contextLines}\nHọc sinh: ${message}` : message;

  // Nếu bot đang tắt (agent đã takeover), đặt timer 1 phút rồi trả lời sau
  if (autoReplyGlobal && !autoReplyConv) {
    scheduleReEnable(conversation.id, io, { channel, channelUserId, contextualQuestion, pageId });
  }

  if (autoReplyGlobal && autoReplyConv) {
    const phoneRegex = /^(0|\+84)[0-9]{8,9}$/;
    const state = collectionState.get(customerId);
    let phoneJustSaved = false;

    // Website: hỏi tên trước (blocking vì không thể tự đoán tên)
    if (channel === 'website' && (!customer.name || customer.name === 'Khách hàng')) {
      if (!state) {
        collectionState.set(customerId, 'waiting_name');
        const { conv, msg } = await sendBotReply(channel, channelUserId, conversation.id,
          'Xin chào! Mình là trợ lý tư vấn tuyển sinh Cao đẳng Viễn Đông 😊 Cho mình biết tên bạn với nhé?', io, pageId);
        return { conversation: conv, incomingMsg, replyMsg: msg };
      }
      if (state === 'waiting_name') {
        const name = message.trim();
        await db.run('UPDATE customers SET name = ? WHERE id = ?', [name, customerId]);
        customer.name = name;
        collectionState.delete(customerId);
      }
    }

    // SĐT: lưu passively nếu user tự nhắn vào, không chủ động hỏi
    if (!customer.phone) {
      const phoneMatch = message.match(/(0|\+84)[0-9]{8,9}/);
      if (phoneMatch && phoneRegex.test(phoneMatch[0])) {
        await db.run('UPDATE customers SET phone = ? WHERE id = ?', [phoneMatch[0], customerId]);
        customer.phone = phoneMatch[0];
        phoneJustSaved = true;

        // Nếu tin nhắn chỉ có SĐT → xác nhận ngắn rồi thôi
        if (phoneRegex.test(message.trim())) {
          const displayName = customer.name && !customer.name.startsWith('FB_') ? customer.name : 'bạn';
          const { conv, msg } = await sendBotReply(channel, channelUserId, conversation.id,
            `Cảm ơn ${displayName}! Mình đã lưu SĐT của bạn rồi 😊 Cứ hỏi thêm gì về tuyển sinh nhé!`, io, pageId);
          return { conversation: conv, incomingMsg, replyMsg: msg };
        }
      }
    }

    // 5. Auto-reply via AI chatbot

    let answer = await askChatbot(contextualQuestion);
    if (answer) {
      // Nếu chatbot trả về JSON (flow format cũ), lấy trường .text
      try {
        const parsed = JSON.parse(answer);
        if (parsed && parsed.text) answer = parsed.text;
      } catch {}
    }
    if (answer) {
      const displayName = customer.name && !customer.name.startsWith('FB_') ? customer.name : 'bạn';
      if (phoneJustSaved) {
        answer = `Cảm ơn bạn đã cho mình SĐT rồi nhé! 😊\n\n${answer}`;
      }

      if (channel === 'facebook') await sendFacebookMessage(channelUserId, answer, pageId);
      else if (channel === 'zalo') await sendZaloMessage(channelUserId, answer);

      const outResult = await db.run(
        "INSERT INTO messages (conversation_id, content, direction, sent_by) VALUES (?, ?, 'out', 'bot')",
        [conversation.id, answer]
      );
      const replyMsg = await db.get('SELECT * FROM messages WHERE id = ?', [outResult.insertId]);

      await db.run(
        'UPDATE conversations SET last_message = ?, last_message_at = NOW(), updated_at = NOW() WHERE id = ?',
        [answer, conversation.id]
      );

      const updatedConv = await getConversationWithCustomer(conversation.id);
      if (io) io.emit('new_message', { conversation: updatedConv, message: replyMsg });

      return { conversation: updatedConv, incomingMsg, replyMsg };
    }
  }

  return { conversation: fullConversation, incomingMsg, replyMsg: null };
}

async function getConversationWithCustomer(convId) {
  return db.get(`
    SELECT c.*, cu.name AS customer_name, cu.phone AS customer_phone,
           cu.email AS customer_email, cu.channel_user_id, cu.avatar_url, cu.tags, cu.notes,
           u.display_name AS assigned_name
    FROM conversations c
    JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN users u ON c.assigned_to = u.id
    WHERE c.id = ?
  `, [convId]);
}

module.exports = { handleIncomingMessage, getConversationWithCustomer, cancelReEnable };
