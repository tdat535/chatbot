import React, { useState, useEffect } from 'react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api.js';

export default function QuickReplies() {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ title: '', content: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => getTemplates().then(r => setTemplates(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      if (editId) await updateTemplate(editId, form);
      else await createTemplate(form);
      setForm({ title: '', content: '' });
      setEditId(null);
      await load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleEdit = (tpl) => { setEditId(tpl.id); setForm({ title: tpl.title, content: tpl.content }); };
  const handleDelete = async (id) => { if (!window.confirm('Xoá mẫu này?')) return; await deleteTemplate(id); load(); };
  const handleCancel = () => { setEditId(null); setForm({ title: '', content: '' }); };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>

      {/* Form - fixed top */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: '#0f172a' }}>Tin nhắn mẫu</h2>

          <div style={{
            background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
            padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: '#1e293b' }}>
              {editId ? 'Chỉnh sửa mẫu' : 'Thêm mẫu mới'}
            </div>
            <input
              value={form.title}
              onChange={e => setForm(v => ({ ...v, title: e.target.value }))}
              placeholder="Tên mẫu (vd: Chào học sinh)"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 15, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <textarea
              value={form.content}
              onChange={e => setForm(v => ({ ...v, content: e.target.value }))}
              placeholder="Nội dung tin nhắn mẫu..."
              rows={3}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 15, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.content.trim()} style={{
                padding: '7px 16px', borderRadius: 8, background: '#2563eb', color: 'white',
                border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Đang lưu...' : (editId ? 'Cập nhật' : 'Thêm mẫu')}
              </button>
              {editId && (
                <button onClick={handleCancel} style={{
                  padding: '7px 14px', borderRadius: 8, background: 'white',
                  border: '1px solid #e2e8f0', color: '#64748b', fontSize: 15, cursor: 'pointer',
                }}>Huỷ</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* List - fill remaining height */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px 20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                Danh sách mẫu
                <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '2px 8px' }}>
                  {templates.length}
                </span>
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', padding: '40px 0' }}>
                  Chưa có mẫu nào. Thêm mẫu ở trên để dùng nhanh trong hộp thư.
                </div>
              ) : templates.map(tpl => (
                <div key={tpl.id} style={{
                  background: '#f8fafc', borderRadius: 8, padding: '12px 16px',
                  border: '1px solid #e2e8f0', display: 'flex', gap: 12, alignItems: 'flex-start',
                  transition: 'border-color .12s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#bfdbfe'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{tpl.title}</div>
                    <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>{tpl.content}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleEdit(tpl)} style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
                      background: 'white', color: '#2563eb', fontSize: 14, cursor: 'pointer',
                    }}>Sửa</button>
                    <button onClick={() => handleDelete(tpl.id)} style={{
                      padding: '4px 10px', borderRadius: 6, border: '1px solid #fee2e2',
                      background: '#fff5f5', color: '#ef4444', fontSize: 14, cursor: 'pointer',
                    }}>Xoá</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
