const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
router.use(requireAuth);

// GET /api/templates
router.get('/', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM templates ORDER BY created_at ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/templates
router.post('/', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title và content là bắt buộc' });
    const result = await db.run(
      'INSERT INTO templates (title, content) VALUES (?, ?)',
      [title, content]
    );
    const row = await db.get('SELECT * FROM templates WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/templates/:id
router.put('/:id', async (req, res) => {
  try {
    const { title, content } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title=?'); params.push(title); }
    if (content !== undefined) { updates.push('content=?'); params.push(content); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.run(`UPDATE templates SET ${updates.join(',')} WHERE id=?`, params);
    const row = await db.get('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
