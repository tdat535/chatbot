import React, { useState, useEffect } from 'react';
import { updateCustomer } from '../api.js';
import ChannelBadge from './ChannelBadge.jsx';
import { Skeleton } from './Skeleton.jsx';

export default function CustomerPanel({ conversation, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (conversation) {
      setPanelLoading(true);
      setTimeout(() => setPanelLoading(false), 300);
      setForm({
        name: conversation.customer_name || '',
        phone: conversation.customer_phone || '',
        email: conversation.customer_email || '',
        notes: conversation.notes || '',
      });
      try {
        const t = typeof conversation.tags === 'string'
          ? JSON.parse(conversation.tags || '[]')
          : (conversation.tags || []);
        setTags(Array.isArray(t) ? t : []);
      } catch { setTags([]); }
    }
  }, [conversation?.customer_id]);

  const addTag = async () => {
    const val = tagInput.trim();
    if (!val || tags.includes(val)) return;
    const next = [...tags, val];
    setTags(next);
    setTagInput('');
    await updateCustomer(conversation.customer_id, { tags: next });
  };

  const removeTag = async (tag) => {
    const next = tags.filter(t => t !== tag);
    setTags(next);
    await updateCustomer(conversation.customer_id, { tags: next });
  };

  if (!conversation) return (
    <div style={{
      width: 260, background: 'white', borderLeft: '1px solid #e2e8f0',
      padding: 16, color: '#94a3b8', fontSize: 15, textAlign: 'center',
    }}>
      Chọn hội thoại để xem thông tin học sinh
    </div>
  );

  if (panelLoading) return (
    <div style={{ width: 260, background: 'white', borderLeft: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
        <Skeleton width={56} height={56} radius="50%" />
        <Skeleton width="70%" height={16} />
        <Skeleton width={60} height={20} radius={10} />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width="35%" height={10} />
          <Skeleton width="80%" height={14} />
        </div>
      ))}
    </div>
  );

  const initial = (conversation.customer_name || '?').charAt(0).toUpperCase();
  const colors = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#059669', '#0891b2'];
  const avatarColor = colors[initial.charCodeAt(0) % colors.length];

  const handleSave = async () => {
    setSaving(true);
    await updateCustomer(conversation.customer_id, form);
    setSaving(false);
    setEditing(false);
    if (onUpdate) onUpdate({ ...conversation, customer_name: form.name, customer_phone: form.phone });
  };

  const renderField = (label, value, field) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 3,
        textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      {editing ? (
        <input
          value={form[field] || ''}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          style={{
            width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
            padding: '6px 8px', fontSize: 15, outline: 'none',
          }}
        />
      ) : (
        <div style={{ fontSize: 15, color: value ? '#1e293b' : '#cbd5e1' }}>
          {value || 'Chưa có'}
        </div>
      )}
    </div>
  );

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '';

  return (
    <div style={{
      width: 260, background: 'white', borderLeft: '1px solid #e2e8f0',
      display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto',
    }}>
      {/* Avatar + Name */}
      <div style={{
        padding: '20px 16px', borderBottom: '1px solid #e2e8f0', textAlign: 'center',
        background: '#f8fafc',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: avatarColor,
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 22, margin: '0 auto 10px',
        }}>{initial}</div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
          {conversation.customer_name}
        </div>
        <ChannelBadge channel={conversation.channel} size="sm" />
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
          ID: {conversation.channel_user_id?.slice(0, 12)}...
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: 16, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Thông tin học sinh</span>
          <button onClick={() => editing ? handleSave() : setEditing(true)} style={{
            padding: '4px 12px', borderRadius: 6, border: '1px solid',
            borderColor: editing ? '#2563eb' : '#e2e8f0',
            background: editing ? '#eff6ff' : 'white',
            color: editing ? '#2563eb' : '#64748b', fontSize: 14, fontWeight: 600,
          }}>
            {saving ? '...' : editing ? 'Lưu' : '✏️ Sửa'}
          </button>
        </div>

        {renderField('Tên', conversation.customer_name, 'name')}
        {renderField('Số điện thoại', conversation.customer_phone, 'phone')}
        {renderField('Email', conversation.customer_email, 'email')}

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 3,
            textTransform: 'uppercase', letterSpacing: .5 }}>Ghi chú</div>
          {editing ? (
            <textarea
              value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              style={{
                width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '6px 8px', fontSize: 15, outline: 'none', resize: 'vertical',
              }}
            />
          ) : (
            <div style={{ fontSize: 15, color: form.notes ? '#1e293b' : '#cbd5e1' }}>
              {form.notes || 'Chưa có ghi chú'}
            </div>
          )}
        </div>

        {editing && (
          <button onClick={() => setEditing(false)} style={{
            width: '100%', padding: '7px 0', border: '1px solid #e2e8f0',
            borderRadius: 6, background: 'white', color: '#64748b', fontSize: 15,
          }}>Hủy</button>
        )}

        {/* Tags */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: .5 }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {tags.map(tag => (
              <span key={tag} style={{
                background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                borderRadius: 20, padding: '3px 10px', fontSize: 13, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {tag}
                <span onClick={() => removeTag(tag)} style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 700, lineHeight: 1 }}>×</span>
              </span>
            ))}
            {tags.length === 0 && <span style={{ fontSize: 13, color: '#cbd5e1' }}>Chưa có tag</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Thêm tag..."
              style={{
                flex: 1, padding: '5px 8px', border: '1px solid #e2e8f0',
                borderRadius: 6, fontSize: 13, outline: 'none',
              }}
            />
            <button onClick={addTag} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none',
              background: '#2563eb', color: 'white', fontSize: 13, cursor: 'pointer',
            }}>+</button>
          </div>
        </div>
      </div>

      {/* Conversation Info */}
      <div style={{ padding: 16, borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: .5 }}>Hội thoại</div>
        {[
          { label: 'Trạng thái', value: conversation.status === 'open' ? '🟢 Đang mở' : '⚫ Đã đóng' },
          // { label: 'Tự động trả lời', value: conversation.auto_reply !== 0 ? '🤖 Bật' : '⭕ Tắt' },
          { label: 'Tạo lúc', value: formatDate(conversation.created_at) },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
            <span style={{ color: '#64748b' }}>{r.label}</span>
            <span style={{ color: '#1e293b', fontWeight: 500 }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
