const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendFacebookMessage } = require('../services/facebook');
const { sendZaloMessage } = require('../services/zalo');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// GET /api/conversations
router.get('/', async (req, res) => {
  try {
    const { channel, status, search, assigned_to } = req.query;
    let sql = `
      SELECT c.*, cu.name AS customer_name, cu.phone AS customer_phone,
             cu.email AS customer_email, cu.channel_user_id, cu.avatar_url, cu.tags, cu.notes,
             u.display_name AS assigned_name
      FROM conversations c
      JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];
    if (channel && channel !== 'all') { sql += ' AND c.channel = ?'; params.push(channel); }
    if (status && status !== 'all') { sql += ' AND c.status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (cu.name LIKE ? OR cu.phone LIKE ? OR c.last_message LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.label) {
      sql += ' AND JSON_CONTAINS(c.labels, ?)';
      params.push(JSON.stringify(req.query.label));
    }
    if (assigned_to) {
      sql += ' AND c.assigned_to = ?';
      params.push(assigned_to);
    }
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;

    // Đếm tổng riêng
    let countSql = `SELECT COUNT(*) AS total FROM conversations c JOIN customers cu ON c.customer_id = cu.id WHERE 1=1`;
    if (req.query.channel && req.query.channel !== 'all') countSql += ' AND c.channel = ?';
    if (req.query.status && req.query.status !== 'all') countSql += ' AND c.status = ?';
    if (req.query.search) countSql += ' AND (cu.name LIKE ? OR cu.phone LIKE ? OR c.last_message LIKE ?)';
    if (req.query.label) countSql += ' AND JSON_CONTAINS(c.labels, ?)';
    if (req.query.assigned_to) countSql += ' AND c.assigned_to = ?';

    const [countRow] = await db.query(countSql, [...params]);
    const total = countRow?.total || 0;

    sql += ` ORDER BY c.last_message_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const data = await db.query(sql, params);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/conversations/stats
router.get('/stats', async (req, res) => {
  try {
    const [total] = await db.query('SELECT COUNT(*) AS count FROM conversations');
    const [open] = await db.query("SELECT COUNT(*) AS count FROM conversations WHERE status='open'");
    const [unread] = await db.query('SELECT COALESCE(SUM(unread_count),0) AS count FROM conversations');
    const byChannel = await db.query('SELECT channel, COUNT(*) AS count FROM conversations GROUP BY channel');
    res.json({ total: total.count, open: open.count, unread: unread.count, byChannel });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/conversations/:id
router.get('/:id', async (req, res) => {
  try {
    const conv = await db.get(`
      SELECT c.*, cu.name AS customer_name, cu.phone AS customer_phone,
             cu.email AS customer_email, cu.channel_user_id, cu.avatar_url, cu.tags, cu.notes,
             u.display_name AS assigned_name
      FROM conversations c JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE c.id = ?
    `, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', async (req, res) => {
  try {
    await db.run('UPDATE conversations SET unread_count = 0 WHERE id = ?', [req.params.id]);
    const messages = await db.query(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/conversations/:id/export  — tải về CSV
router.get('/:id/export', async (req, res) => {
  try {
    const conv = await db.get(`
      SELECT c.*, cu.name AS customer_name, cu.channel
      FROM conversations c JOIN customers cu ON c.customer_id = cu.id WHERE c.id = ?
    `, [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Not found' });

    const messages = await db.query(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );

    const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const header = ['Thời gian', 'Chiều', 'Người gửi', 'Loại', 'Nội dung'];
    const rows = messages.map(m => [
      escape(new Date(m.created_at).toLocaleString('vi-VN')),
      escape(m.direction === 'in' ? 'Học sinh → CRM' : 'CRM → Học sinh'),
      escape(m.sent_by === 'bot' ? 'Chatbot' : m.sender_name || conv.customer_name),
      escape(m.type === 'note' ? 'Ghi chú nội bộ' : 'Tin nhắn'),
      escape(m.type === 'flow'
        ? (() => { try { return JSON.parse(m.content).text || m.content; } catch { return m.content; } })()
        : m.content),
    ]);

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const filename = `chat_${conv.customer_name.replace(/[^a-z0-9]/gi, '_')}_${conv.id}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent); // BOM cho Excel UTF-8
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/conversations/:id/messages
router.post('/:id/messages', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Not found' });
    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [conv.customer_id]);

    let sent = false;
    if (conv.channel === 'facebook') sent = await sendFacebookMessage(customer.channel_user_id, content);
    else if (conv.channel === 'zalo') sent = await sendZaloMessage(customer.channel_user_id, content);
    else if (conv.channel === 'website') {
      req.app.get('io').emit('website_reply', { sessionId: customer.channel_user_id, message: content });
      sent = true;
    }

    const senderName = req.body.sender_name || 'Cán bộ tư vấn';
    const result = await db.run(
      "INSERT INTO messages (conversation_id, content, direction, sent_by, sender_name) VALUES (?, ?, 'out', 'agent', ?)",
      [conv.id, content, senderName]
    );
    const msg = await db.get('SELECT * FROM messages WHERE id = ?', [result.insertId]);

    await db.run(
      'UPDATE conversations SET last_message=?, last_message_at=NOW(), updated_at=NOW() WHERE id=?',
      [content, conv.id]
    );

    const updatedConv = await db.get(`
      SELECT c.*, cu.name AS customer_name, cu.channel_user_id, cu.avatar_url, cu.tags,
             u.display_name AS assigned_name
      FROM conversations c JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE c.id = ?
    `, [conv.id]);
    req.app.get('io').emit('new_message', { conversation: updatedConv, message: msg });

    res.json({ message: msg, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/conversations/:id/notes
router.post('/:id/notes', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });

    const conv = await db.get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
    if (!conv) return res.status(404).json({ error: 'Not found' });

    const senderName = req.body.sender_name || 'Cán bộ tư vấn';
    const result = await db.run(
      "INSERT INTO messages (conversation_id, content, type, direction, sent_by, sender_name) VALUES (?, ?, 'note', 'out', 'agent', ?)",
      [conv.id, content, senderName]
    );
    const msg = await db.get('SELECT * FROM messages WHERE id = ?', [result.insertId]);

    req.app.get('io').emit('new_message', { conversation: { id: conv.id }, message: msg });
    res.status(201).json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/conversations/:id
router.put('/:id', async (req, res) => {
  try {
    const { status, auto_reply, labels, assigned_to } = req.body;
    const updates = [];
    const params = [];
    if (status !== undefined) { updates.push('status=?'); params.push(status); }
    if (auto_reply !== undefined) { updates.push('auto_reply=?'); params.push(auto_reply ? 1 : 0); }
    if (labels !== undefined) { updates.push('labels=?'); params.push(JSON.stringify(labels)); }
    if (assigned_to !== undefined) { updates.push('assigned_to=?'); params.push(assigned_to || null); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.run(`UPDATE conversations SET ${updates.join(',')} WHERE id=?`, params);
    const conv = await db.get(`
      SELECT c.*, cu.name AS customer_name, cu.channel_user_id, cu.avatar_url, cu.tags,
             u.display_name AS assigned_name
      FROM conversations c JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE c.id = ?
    `, [req.params.id]);
    res.json(conv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
