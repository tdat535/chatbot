const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');
router.use(requireAuth);

// GET /api/stats - Dashboard tổng quan
router.get('/', async (req, res) => {
  try {
    const [convTotal] = await db.query('SELECT COUNT(*) AS count FROM conversations');
    const [convOpen] = await db.query("SELECT COUNT(*) AS count FROM conversations WHERE status='open'");
    const [convClosed] = await db.query("SELECT COUNT(*) AS count FROM conversations WHERE status='closed'");
    const [unread] = await db.query('SELECT COALESCE(SUM(unread_count),0) AS count FROM conversations');
    const [custTotal] = await db.query('SELECT COUNT(*) AS count FROM customers');
    const [msgToday] = await db.query(
      "SELECT COUNT(*) AS count FROM messages WHERE DATE(created_at) = CURDATE()"
    );
    const [msgBot] = await db.query(
      "SELECT COUNT(*) AS count FROM messages WHERE sent_by='bot' AND direction='out'"
    );
    const [msgAgent] = await db.query(
      "SELECT COUNT(*) AS count FROM messages WHERE sent_by='agent' AND direction='out'"
    );

    // Tin nhắn 7 ngày gần nhất (mỗi ngày)
    const msgByDay = await db.query(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM messages
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Cuộc hội thoại theo kênh
    const convByChannel = await db.query(
      'SELECT channel, COUNT(*) AS count FROM conversations GROUP BY channel'
    );

    // Khách hàng mới 7 ngày
    const newCustByDay = await db.query(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM customers
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Thống kê theo CBTV
    const byAgent = await db.query(`
      SELECT
        u.id,
        u.display_name,
        COUNT(DISTINCT c.id)                                          AS total_convs,
        SUM(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END)         AS closed_convs,
        COUNT(DISTINCT CASE WHEN c.status = 'open' THEN c.id END)    AS open_convs,
        COALESCE(SUM(m.msg_count), 0)                                 AS total_messages
      FROM users u
      LEFT JOIN conversations c ON c.assigned_to = u.id
      LEFT JOIN (
        SELECT conversation_id, COUNT(*) AS msg_count
        FROM messages
        WHERE sent_by = 'agent' AND direction = 'out'
        GROUP BY conversation_id
      ) m ON m.conversation_id = c.id
      GROUP BY u.id, u.display_name
      ORDER BY total_convs DESC
    `);

    // Thống kê theo nhãn
    const byLabel = await db.query(`
      SELECT
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(labels, '$[0]')), 'Chưa có nhãn') AS label,
        COUNT(*) AS count
      FROM conversations
      GROUP BY label
      ORDER BY count DESC
    `);

    // Giờ cao điểm (tin nhắn đến theo giờ trong ngày)
    const byHour = await db.query(`
      SELECT HOUR(created_at) AS hour, COUNT(*) AS count
      FROM messages
      WHERE direction = 'in'
      GROUP BY HOUR(created_at)
      ORDER BY hour ASC
    `);

    res.json({
      conversations: {
        total: convTotal.count,
        open: convOpen.count,
        closed: convClosed.count,
        unread: unread.count,
      },
      customers: {
        total: custTotal.count,
        newByDay: newCustByDay,
      },
      messages: {
        today: msgToday.count,
        botReplies: msgBot.count,
        agentReplies: msgAgent.count,
        byDay: msgByDay,
      },
      byChannel: convByChannel,
      byAgent,
      byLabel,
      byHour,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
