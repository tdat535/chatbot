const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendFacebookMessage } = require('../services/facebook');
const { sendZaloMessage } = require('../services/zalo');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// POST /api/broadcast
// Body: { message, conversation_ids: [id1, id2, ...], sender_name }
router.post('/', async (req, res) => {
  try {
    const { message, conversation_ids, sender_name } = req.body;
    if (!message || !Array.isArray(conversation_ids) || conversation_ids.length === 0) {
      return res.status(400).json({ error: 'message và conversation_ids (array) là bắt buộc' });
    }

    const io = req.app.get('io');
    const senderName = sender_name || 'Cán bộ tư vấn';
    const results = { success: [], failed: [] };

    for (const convId of conversation_ids) {
      try {
        const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [convId]);
        if (!conv) { results.failed.push({ id: convId, reason: 'Not found' }); continue; }

        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [conv.customer_id]);

        let sent = false;
        if (conv.channel === 'facebook') sent = await sendFacebookMessage(customer.channel_user_id, message);
        else if (conv.channel === 'zalo') sent = await sendZaloMessage(customer.channel_user_id, message);
        else if (conv.channel === 'website') {
          io.emit('website_reply', { sessionId: customer.channel_user_id, message });
          sent = true;
        }

        const result = await db.run(
          "INSERT INTO messages (conversation_id, content, direction, sent_by, sender_name) VALUES (?, ?, 'out', 'agent', ?)",
          [conv.id, message, senderName]
        );
        const msg = await db.get('SELECT * FROM messages WHERE id = ?', [result.insertId]);

        await db.run(
          'UPDATE conversations SET last_message=?, last_message_at=NOW(), updated_at=NOW() WHERE id=?',
          [message, conv.id]
        );

        const updatedConv = await db.get(`
          SELECT c.*, cu.name AS customer_name, cu.channel_user_id, cu.avatar_url, cu.tags,
                 u.display_name AS assigned_name
          FROM conversations c JOIN customers cu ON c.customer_id = cu.id
          LEFT JOIN users u ON c.assigned_to = u.id
          WHERE c.id = ?
        `, [conv.id]);
        io.emit('new_message', { conversation: updatedConv, message: msg });

        results.success.push({ id: convId, sent });
      } catch (e) {
        results.failed.push({ id: convId, reason: e.message });
      }
    }

    res.json({
      total: conversation_ids.length,
      success: results.success.length,
      failed: results.failed.length,
      details: results,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
