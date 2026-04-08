const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// GET /api/chatbot/flows
router.get('/flows', async (req, res) => {
  try {
    const flows = await db.query('SELECT * FROM chatbot_flows ORDER BY created_at DESC');
    res.json(flows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chatbot/flows
router.post('/flows', async (req, res) => {
  try {
    const { name, trigger_keywords, nodes, is_active = 1 } = req.body;
    if (!name || !nodes) return res.status(400).json({ error: 'name và nodes là bắt buộc' });
    const result = await db.run(
      'INSERT INTO chatbot_flows (name, trigger_keywords, nodes, is_active) VALUES (?, ?, ?, ?)',
      [name, JSON.stringify(trigger_keywords || []), JSON.stringify(nodes), is_active ? 1 : 0]
    );
    const flow = await db.get('SELECT * FROM chatbot_flows WHERE id = ?', [result.insertId]);
    res.status(201).json(flow);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/chatbot/flows/:id
router.put('/flows/:id', async (req, res) => {
  try {
    const { name, trigger_keywords, nodes, is_active } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name=?'); params.push(name); }
    if (trigger_keywords !== undefined) { updates.push('trigger_keywords=?'); params.push(JSON.stringify(trigger_keywords)); }
    if (nodes !== undefined) { updates.push('nodes=?'); params.push(JSON.stringify(nodes)); }
    if (is_active !== undefined) { updates.push('is_active=?'); params.push(is_active ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.run(`UPDATE chatbot_flows SET ${updates.join(',')} WHERE id=?`, params);
    const flow = await db.get('SELECT * FROM chatbot_flows WHERE id = ?', [req.params.id]);
    res.json(flow);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/chatbot/flows/:id
router.delete('/flows/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM chatbot_flows WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
