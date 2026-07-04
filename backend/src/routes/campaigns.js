const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');

// Get all campaigns with performance stats
router.get('/', requireAuth, async (req, res) => {
  try {
    const campaigns = await db.query('SELECT * FROM campaigns ORDER BY id DESC');
    
    // For each campaign, count how many customers match its tracking_ref
    // In our logic, customers have `ref` or `ad_id`. Let's match if `customers.ref = campaigns.tracking_ref` OR `customers.ad_id = campaigns.tracking_ref`
    const statsPromises = campaigns.map(async (camp) => {
      const row = await db.get(
        "SELECT COUNT(*) as leads_count FROM customers WHERE source = 'facebook_ads' AND (ref = ? OR ad_id = ?)",
        [camp.tracking_ref, camp.tracking_ref]
      );
      const leadsCount = row ? row.leads_count : 0;
      const cpl = leadsCount > 0 ? (camp.budget_spent / leadsCount) : 0;
      return { ...camp, leads_count: leadsCount, cpl: Math.round(cpl) };
    });

    const enrichedCampaigns = await Promise.all(statsPromises);
    res.json({ data: enrichedCampaigns });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create a new campaign
router.post('/', requireAuth, async (req, res) => {
  const { name, platform, tracking_ref, budget_spent } = req.body;
  if (!name || !tracking_ref) {
    return res.status(400).json({ error: 'Thiếu tên chiến dịch hoặc tracking ref' });
  }

  try {
    const result = await db.run(
      'INSERT INTO campaigns (name, platform, tracking_ref, budget_spent, start_date) VALUES (?, ?, ?, ?, NOW())',
      [name, platform || 'facebook', tracking_ref, budget_spent || 0]
    );
    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [result.insertId]);
    res.json(campaign);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi tạo chiến dịch' });
  }
});

// Update a campaign
router.put('/:id', requireAuth, async (req, res) => {
  const { name, tracking_ref, budget_spent } = req.body;
  try {
    await db.run(
      'UPDATE campaigns SET name = ?, tracking_ref = ?, budget_spent = ?, updated_at = NOW() WHERE id = ?',
      [name, tracking_ref, budget_spent, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi cập nhật chiến dịch' });
  }
});

// Delete a campaign
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi xóa chiến dịch' });
  }
});

module.exports = router;
