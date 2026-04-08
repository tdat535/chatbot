import React, { useState, useEffect } from 'react';
import { getConversations, broadcast } from '../api.js';
import ChannelBadge from './ChannelBadge.jsx';

export default function BroadcastModal({ currentUser, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState('');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = { channel: filterChannel, status: filterStatus, search };
      const res = await getConversations(params);
      setConversations(res.data.data || res.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterChannel, filterStatus, search]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === conversations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(conversations.map(c => c.id)));
    }
  };

  const handleSend = async () => {
    if (!message.trim() || selected.size === 0) return;
    if (!window.confirm(`Gửi tin nhắn cho ${selected.size} cuộc hội thoại?`)) return;
    setSending(true);
    try {
      const res = await broadcast({
        message: message.trim(),
        conversation_ids: Array.from(selected),
        sender_name: currentUser?.display_name,
      });
      setResult(res.data);
    } catch (e) {
      setResult({ error: e.response?.data?.error || 'Lỗi gửi tin' });
    }
    setSending(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'white', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,.2)',
        width: 680, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>📣</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Gửi hàng loạt</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>Chọn cuộc hội thoại và soạn tin nhắn</div>
          </div>
          <button onClick={onClose} style={{
            border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1,
          }}>×</button>
        </div>

        {result ? (
          /* Kết quả */
          <div style={{ padding: 24, textAlign: 'center' }}>
            {result.error ? (
              <div style={{ color: '#dc2626', fontSize: 16 }}>❌ {result.error}</div>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Đã gửi xong!</div>
                <div style={{ fontSize: 16, color: '#64748b' }}>
                  Thành công: <strong>{result.success}</strong> / {result.total} cuộc hội thoại
                  {result.failed > 0 && <span style={{ color: '#dc2626' }}> — Lỗi: {result.failed}</span>}
                </div>
              </>
            )}
            <button onClick={onClose} style={{
              marginTop: 20, padding: '9px 24px', borderRadius: 8,
              background: '#2563eb', color: 'white', border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            }}>Đóng</button>
          </div>
        ) : (
          <>
            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left: conversation selector */}
              <div style={{ width: 340, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                {/* Filters */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
                  <input
                    placeholder="🔍 Tìm học sinh..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {['all', 'facebook', 'zalo', 'website'].map(ch => (
                      <button key={ch} onClick={() => setFilterChannel(ch)} style={{
                        padding: '3px 8px', borderRadius: 12, border: '1px solid',
                        borderColor: filterChannel === ch ? '#2563eb' : '#e2e8f0',
                        background: filterChannel === ch ? '#eff6ff' : 'white',
                        color: filterChannel === ch ? '#2563eb' : '#64748b',
                        fontSize: 13, cursor: 'pointer',
                      }}>
                        {ch === 'all' ? 'Tất cả' : ch === 'facebook' ? '📘' : ch === 'zalo' ? '🔵' : '🌐'}
                      </button>
                    ))}
                    <button onClick={() => setFilterStatus(s => s === 'open' ? 'all' : 'open')} style={{
                      marginLeft: 'auto', padding: '3px 8px', borderRadius: 12, border: '1px solid',
                      borderColor: filterStatus === 'open' ? '#2563eb' : '#e2e8f0',
                      background: filterStatus === 'open' ? '#eff6ff' : 'white',
                      color: filterStatus === 'open' ? '#2563eb' : '#64748b',
                      fontSize: 13, cursor: 'pointer',
                    }}>Đang mở</button>
                  </div>
                </div>

                {/* Select all */}
                <div style={{
                  padding: '8px 12px', borderBottom: '1px solid #e2e8f0',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <input type="checkbox"
                    checked={conversations.length > 0 && selected.size === conversations.length}
                    onChange={selectAll}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14, color: '#64748b' }}>
                    Chọn tất cả ({selected.size}/{conversations.length})
                  </span>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {loading ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>Đang tải...</div>
                  ) : conversations.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 15 }}>Không có kết quả</div>
                  ) : conversations.map(conv => (
                    <div key={conv.id} onClick={() => toggleSelect(conv.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                      background: selected.has(conv.id) ? '#eff6ff' : 'white',
                    }}
                    onMouseEnter={e => { if (!selected.has(conv.id)) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (!selected.has(conv.id)) e.currentTarget.style.background = 'white'; }}>
                      <input type="checkbox" checked={selected.has(conv.id)} onChange={() => toggleSelect(conv.id)}
                        onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {conv.customer_name}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                          <ChannelBadge channel={conv.channel} />
                          <span style={{ fontSize: 13, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {conv.last_message || '...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: message compose */}
              <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#1e293b' }}>
                    Nội dung tin nhắn
                  </div>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Nhập nội dung gửi đến tất cả học sinh đã chọn..."
                    rows={8}
                    style={{
                      width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0',
                      borderRadius: 8, fontSize: 16, resize: 'vertical', outline: 'none',
                      lineHeight: 1.5, boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ fontSize: 14, color: '#94a3b8' }}>
                  {message.length} ký tự
                </div>

                {selected.size > 0 && message.trim() && (
                  <div style={{
                    padding: '10px 14px', background: '#eff6ff',
                    borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 15, color: '#1e40af',
                  }}>
                    Sẽ gửi đến <strong>{selected.size}</strong> cuộc hội thoại
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              background: '#f8fafc',
            }}>
              <button onClick={onClose} style={{
                padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: 'white', color: '#64748b', fontSize: 16, cursor: 'pointer',
              }}>Huỷ</button>
              <button
                onClick={handleSend}
                disabled={sending || selected.size === 0 || !message.trim()}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: selected.size > 0 && message.trim() ? '#7c3aed' : '#e2e8f0',
                  color: selected.size > 0 && message.trim() ? 'white' : '#94a3b8',
                  fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  opacity: sending ? 0.6 : 1,
                }}
              >
                {sending ? 'Đang gửi...' : `📣 Gửi cho ${selected.size} hội thoại`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
