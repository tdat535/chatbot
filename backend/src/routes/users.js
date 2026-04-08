const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const rows = await db.query('SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, display_name, password, role = 'staff' } = req.body;
    if (!username || !display_name || !password) return res.status(400).json({ error: 'Thiếu thông tin' });

    const exists = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (exists) return res.status(400).json({ error: 'Username đã tồn tại' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, display_name, hash, role]
    );
    const user = await db.get('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?', [result.insertId]);
    res.status(201).json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/users/:id/password
router.put('/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    const hash = await bcrypt.hash(password, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
