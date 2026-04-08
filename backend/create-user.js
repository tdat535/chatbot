// Chạy: node create-user.js <username> <display_name> <password> [role]
// Ví dụ: node create-user.js nguyenvana "Nguyễn Văn A" 123456 staff
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const [,, username, display_name, password, role = 'staff'] = process.argv;

if (!username || !display_name || !password) {
  console.log('Cách dùng: node create-user.js <username> <tên hiển thị> <password> [staff|admin]');
  process.exit(1);
}

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm_mini',
  });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, display_name, hash, role]
    );
    console.log(`✅ Tạo thành công: ${display_name} (@${username}) — role: ${role}`);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') console.error('❌ Username đã tồn tại');
    else console.error('❌ Lỗi:', e.message);
  }
  await pool.end();
})();
