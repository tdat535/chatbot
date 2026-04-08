const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { search, channel } = req.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    if (channel && channel !== 'all') { sql += ' AND channel=?'; params.push(channel); }
    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    res.json(await db.query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await db.get('SELECT * FROM customers WHERE id=?', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Not found' });
    res.json(customer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, notes, tags } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name=?'); params.push(name); }
    if (phone !== undefined) { updates.push('phone=?'); params.push(phone); }
    if (email !== undefined) { updates.push('email=?'); params.push(email); }
    if (notes !== undefined) { updates.push('notes=?'); params.push(notes); }
    if (tags !== undefined) { updates.push('tags=?'); params.push(JSON.stringify(tags)); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await db.run(`UPDATE customers SET ${updates.join(',')} WHERE id=?`, params);
    res.json(await db.get('SELECT * FROM customers WHERE id=?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
