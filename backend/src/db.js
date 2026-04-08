const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'crm_mini',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

// Helper: query nhiều rows
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Helper: lấy 1 row
async function get(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
}

// Helper: INSERT/UPDATE/DELETE
async function run(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

async function initSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL DEFAULT 'Khách hàng',
      phone VARCHAR(50),
      email VARCHAR(255),
      channel VARCHAR(50) NOT NULL,
      channel_user_id VARCHAR(255) NOT NULL,
      avatar_url TEXT,
      notes TEXT,
      tags JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_channel_user (channel, channel_user_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      channel VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'open',
      auto_reply TINYINT(1) DEFAULT 1,
      last_message TEXT,
      last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unread_count INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      content TEXT NOT NULL,
      type VARCHAR(20) DEFAULT 'text',
      direction ENUM('in','out') NOT NULL,
      sent_by ENUM('bot','agent','user') DEFAULT 'bot',
      channel_message_id VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','staff') DEFAULT 'staff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  // Migrations - kiểm tra qua information_schema để tương thích MySQL 5.7+
  const [[labelsCol]] = await pool.execute(`
    SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'labels'
  `);
  if (!labelsCol.cnt) await pool.execute('ALTER TABLE conversations ADD COLUMN labels JSON DEFAULT NULL');

  const [[senderCol]] = await pool.execute(`
    SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'sender_name'
  `);
  if (!senderCol.cnt) await pool.execute('ALTER TABLE messages ADD COLUMN sender_name VARCHAR(255) DEFAULT NULL');

  // Migration: assigned_to trong conversations
  const [[assignedCol]] = await pool.execute(`
    SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'assigned_to'
  `);
  if (!assignedCol.cnt) {
    await pool.execute('ALTER TABLE conversations ADD COLUMN assigned_to INT NULL DEFAULT NULL');
    await pool.execute('ALTER TABLE conversations ADD CONSTRAINT fk_conv_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL');
  }

  // Bảng chatbot_flows
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS chatbot_flows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      trigger_keywords JSON DEFAULT NULL,
      nodes JSON NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  // Tạo tài khoản admin mặc định nếu chưa có user nào
  const [existing] = await pool.execute('SELECT id FROM users LIMIT 1');
  if (!existing.length) {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('admin123', 10);
    await pool.execute(
      "INSERT INTO users (username, display_name, password_hash, role) VALUES ('admin', 'Quản trị viên', ?, 'admin')",
      [hash]
    );
    console.log('[DB] Tạo tài khoản admin mặc định: admin / admin123');
  }

  console.log('[DB] Schema MySQL OK');
}

module.exports = { pool, query, get, run, initSchema };
