import React, { useState, useEffect } from 'react';
import { getUsers, createUser, deleteUser, changePassword } from '../api.js';

function Section({ title, children }) {
  return (
    <div style={{
      background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
      marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
        fontWeight: 600, fontSize: 16 }}>{title}</div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function CodeBlock({ code }) {
  return (
    <pre style={{
      background: '#1e293b', color: '#e2e8f0', borderRadius: 8,
      padding: '14px 16px', fontSize: 14, overflowX: 'auto', lineHeight: 1.6,
    }}><code>{code}</code></pre>
  );
}


function UserManager({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', display_name: '', password: '', role: 'staff' });
  const [saving, setSaving] = useState(false);
  const [pwdEdit, setPwdEdit] = useState(null); // {id, value}
  const isAdmin = currentUser?.role === 'admin';

  const load = () => getUsers().then(r => setUsers(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.username.trim() || !form.display_name.trim() || !form.password.trim()) return;
    setSaving(true);
    try {
      await createUser(form);
      setForm({ username: '', display_name: '', password: '', role: 'staff' });
      await load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi tạo tài khoản'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xoá tài khoản này?')) return;
    try { await deleteUser(id); load(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const handleChangePwd = async (id) => {
    if (!pwdEdit?.value || pwdEdit.value.length < 6) return alert('Mật khẩu tối thiểu 6 ký tự');
    try { await changePassword(id, pwdEdit.value); setPwdEdit(null); alert('Đã đổi mật khẩu'); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  return (
    <div>
      {/* Danh sách */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {users.map(u => (
          <div key={u.id} style={{
            background: '#f8fafc', borderRadius: 8, padding: '12px 16px',
            border: '1px solid #e2e8f0', display: 'flex', gap: 12, alignItems: 'center',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: u.role === 'admin' ? '#7c3aed' : '#2563eb',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 16,
            }}>{u.display_name.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
                {u.display_name}
                {u.role === 'admin' && <span style={{ marginLeft: 6, fontSize: 12, background: '#f5f3ff', color: '#7c3aed', borderRadius: 6, padding: '2px 6px', fontWeight: 600 }}>ADMIN</span>}
              </div>
              <div style={{ fontSize: 14, color: '#64748b' }}>@{u.username}</div>
            </div>

            {/* Đổi mật khẩu */}
            {(isAdmin || u.id === currentUser?.id) && (
              pwdEdit?.id === u.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    placeholder="Mật khẩu mới..."
                    value={pwdEdit.value}
                    onChange={e => setPwdEdit(v => ({ ...v, value: e.target.value }))}
                    style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, width: 130 }}
                  />
                  <button onClick={() => handleChangePwd(u.id)} style={{
                    padding: '5px 10px', borderRadius: 6, background: '#2563eb',
                    color: 'white', border: 'none', fontSize: 14, cursor: 'pointer',
                  }}>Lưu</button>
                  <button onClick={() => setPwdEdit(null)} style={{
                    padding: '5px 8px', borderRadius: 6, background: 'white',
                    border: '1px solid #e2e8f0', fontSize: 14, cursor: 'pointer',
                  }}>✕</button>
                </div>
              ) : (
                <button onClick={() => setPwdEdit({ id: u.id, value: '' })} style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                  background: 'white', color: '#64748b', fontSize: 14, cursor: 'pointer',
                }}>Đổi MK</button>
              )
            )}

            {isAdmin && u.id !== currentUser?.id && (
              <button onClick={() => handleDelete(u.id)} style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid #fee2e2',
                background: '#fff5f5', color: '#ef4444', fontSize: 14, cursor: 'pointer',
              }}>Xoá</button>
            )}
          </div>
        ))}
      </div>

      {/* Form thêm mới - chỉ admin */}
      {isAdmin && (
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>Thêm tài khoản mới</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={form.username} onChange={e => setForm(v => ({ ...v, username: e.target.value }))}
              placeholder="Tài khoản (username)"
              style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 15 }} />
            <input value={form.display_name} onChange={e => setForm(v => ({ ...v, display_name: e.target.value }))}
              placeholder="Tên hiển thị"
              style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 15 }} />
            <input type="password" value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))}
              placeholder="Mật khẩu"
              style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 15 }} />
            <select value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))}
              style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 15, background: 'white' }}>
              <option value="staff">Cán bộ tư vấn</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </div>
          <button onClick={handleCreate} disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 6, background: '#2563eb', color: 'white',
              border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}>
            {saving ? 'Đang tạo...' : 'Tạo tài khoản'}
          </button>
        </div>
      )}
    </div>
  );
}


export default function Settings({ currentUser }) {
  const backendUrl = 'http://YOUR_SERVER:3001';

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto', background: '#f8fafc' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>⚙️ Cài đặt & Hướng dẫn tích hợp</h2>

        <Section title="👥 Quản lý tài khoản cán bộ tư vấn">
          <UserManager currentUser={currentUser} />
        </Section>


        <Section title="📘 Facebook Messenger">
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 12, lineHeight: 1.6 }}>
            Để kết nối Facebook Fanpage, làm theo các bước sau:
          </p>
          <ol style={{ fontSize: 15, color: '#1e293b', lineHeight: 2, paddingLeft: 20 }}>
            <li>Vào <strong>developers.facebook.com</strong> → tạo App</li>
            <li>Thêm sản phẩm <strong>Messenger</strong></li>
            <li>Tạo <strong>Page Access Token</strong> cho Fanpage của bạn</li>
            <li>Cấu hình Webhook với URL: <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{backendUrl}/webhook/facebook</code></li>
            <li>Verify Token: <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>crm_mini_verify_123</code> (trong file .env)</li>
            <li>Subscribe events: <strong>messages</strong></li>
            <li>Cập nhật <code>.env</code> file với token của bạn</li>
          </ol>
        </Section>

        <Section title="🔵 Zalo OA">
          <ol style={{ fontSize: 15, color: '#1e293b', lineHeight: 2, paddingLeft: 20 }}>
            <li>Vào <strong>developers.zalo.me</strong> → tạo ứng dụng Zalo</li>
            <li>Liên kết <strong>Official Account (OA)</strong></li>
            <li>Lấy <strong>OA Access Token</strong></li>
            <li>Cấu hình Webhook URL: <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{backendUrl}/webhook/zalo</code></li>
            <li>Cập nhật <code>.env</code> file với token của bạn</li>
          </ol>
        </Section>

        <Section title="🌐 Website Chat Widget">
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 12 }}>
            Nhúng đoạn code sau vào website của bạn (trước thẻ <code>&lt;/body&gt;</code>):
          </p>
          <CodeBlock code={`<!-- CRM Mini Chat Widget -->
<script src="${backendUrl}/webhook/website-widget.js?host=${backendUrl}"></script>`} />
          <p style={{ fontSize: 15, color: '#64748b', marginTop: 12 }}>
            Widget sẽ hiện nút chat góc phải màn hình. Tin nhắn tự động kết nối vào CRM và được chatbot trả lời.
          </p>
        </Section>

        <Section title="🤖 Chatbot Python">
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 12 }}>
            Chatbot hiện đang chạy tại <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>
              {window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'http://YOUR_SERVER:8000'}
            </code>. Để khởi động:
          </p>
          <CodeBlock code={`# Di chuyển vào thư mục chatbot
cd chatbot-python

# Kích hoạt virtual environment
venv\\Scripts\\activate    # Windows
source venv/bin/activate   # Linux/Mac

# Chạy chatbot server
python -m uvicorn demo_main:app --reload --port 8000`} />
        </Section>

        <Section title="🚀 Khởi động hệ thống">
          <CodeBlock code={`# Terminal 1 - Chatbot Python (port 8000)
cd chatbot-python && uvicorn demo_main:app --port 8000

# Terminal 2 - Backend CRM (port 3001)
cd backend && npm install && npm run dev

# Terminal 3 - Frontend (port 5173)
cd frontend && npm install && npm run dev`} />
        </Section>

        <Section title="📁 File cấu hình (.env)">
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 12 }}>
            File <code>backend/.env</code>:
          </p>
          <CodeBlock code={`PORT=3001
CHATBOT_URL=http://localhost:8000

# Facebook
FB_PAGE_ACCESS_TOKEN=your_page_access_token
FB_VERIFY_TOKEN=crm_mini_verify_123
FB_APP_SECRET=your_app_secret

# Zalo OA
ZALO_OA_ACCESS_TOKEN=your_oa_access_token

# Auto Reply (true/false)
AUTO_REPLY_ENABLED=true`} />
        </Section>
      </div>
    </div>
  );
}
