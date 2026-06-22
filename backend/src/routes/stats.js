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

// GET /api/stats/export?from=YYYY-MM-DD&to=YYYY-MM-DD - Chi tiết tin nhắn theo ngày
function parseDate(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

router.get('/export', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required' });
    }

    const fromDate = parseDate(from);
    const toDate = parseDate(to);

    // Lọc tương tự conversations
    const { channel, status, search, assigned_to, label } = req.query;

    // Lấy danh sách messages trong khoảng thời gian, kèm thông tin conversation + customer
    // Chỉ lấy thông tin liên quan đến tin nhắn trong khoảng ngày chọn
    let sql = `
      SELECT m.id, m.conversation_id, m.content, m.type, m.direction, m.sent_by, m.sender_name, m.created_at,
          c.status, c.channel, c.labels, c.auto_reply,
          cu.name AS customer_name, cu.phone AS customer_phone, cu.email AS customer_email,
          u.display_name AS assigned_name
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE DATE(m.created_at) >= ? AND DATE(m.created_at) <= ?
    `;
    const params = [fromDate, toDate];

    if (channel && channel !== 'all') { sql += ' AND c.channel = ?'; params.push(channel); }
    if (status && status !== 'all') { sql += ' AND c.status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (cu.name LIKE ? OR cu.phone LIKE ? OR m.content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (assigned_to) { sql += ' AND c.assigned_to = ?'; params.push(assigned_to); }
    if (label) { sql += ' AND JSON_CONTAINS(c.labels, ?)'; params.push(JSON.stringify(label)); }

    sql += ' ORDER BY m.created_at ASC';

    const messages = await db.query(sql, params);

    res.json({
      from: fromDate,
      to: toDate,
      count: messages.length,
      data: messages,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
