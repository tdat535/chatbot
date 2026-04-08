import React, { useState, useEffect, useCallback } from 'react';
import { getConversations, getStats } from '../api.js';
import ChannelBadge from './ChannelBadge.jsx';
import socket from '../socket.js';
import { ConversationSkeleton } from './Skeleton.jsx';

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n;
}

const LABELS = [
  { id: 'chua-tu-van', text: 'Chưa tư vấn',  color: '#7c3aed', bg: '#f5f3ff' },
  { id: 'dang-tu-van', text: 'Đang tư vấn',   color: '#dc2626', bg: '#fef2f2' },
  { id: 'da-tu-van',   text: 'Đã xong',        color: '#64748b', bg: '#f8fafc' },
];

const CHANNELS = [
  { id: 'all',      label: 'Tất cả', icon: null },
  { id: 'facebook', label: 'FB',     icon: '📘' },
  { id: 'zalo',     label: 'Zalo',   icon: '🔵' },
  { id: 'website',  label: 'Web',    icon: '🌐' },
];

const STATUSES = [
  { value: 'all',    label: 'Tất cả'  },
  { value: 'open',   label: 'Đang mở' },
  { value: 'closed', label: 'Đã đóng' }
];

function Avatar({ name, size = 38 }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#059669', '#0891b2'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}g`;
  return `${Math.floor(h / 24)}d`;
}

function getConvLabels(conv) {
  try {
    const lbls = typeof conv.labels === 'string' ? JSON.parse(conv.labels) : (conv.labels || []);
    return Array.isArray(lbls) ? lbls : [];
  } catch { return []; }
}

let notifAudio = null;
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  notifAudio = new Audio('/notification.wav');
  notifAudio.volume = 0.6;
  // silent play để unlock autoplay policy
  notifAudio.play().then(() => { notifAudio.pause(); notifAudio.currentTime = 0; }).catch(() => {});
}

function playBeep() {
  if (!notifAudio) return;
  try {
    notifAudio.currentTime = 0;
    notifAudio.play().catch(() => {});
  } catch {}
}

export default function ConversationList({ selectedId, onSelect, currentUser }) {
  const [conversations, setConversations] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState({ channel: 'all', status: 'all', search: '', label: '', myOnly: false });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('crm_sound') !== 'off');

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    window.addEventListener('click', unlockAudio, { once: true });
    return () => window.removeEventListener('click', unlockAudio);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { channel: filter.channel, status: filter.status, search: filter.search, page, limit: 30 };
      if (filter.label) params.label = filter.label;
      if (filter.myOnly && currentUser?.id) params.assigned_to = currentUser.id;
      const [convRes, statsRes] = await Promise.all([
        getConversations(params),
        getStats(),
      ]);
      setConversations(convRes.data.data || []);
      setPagination({ total: convRes.data.total || 0, pages: convRes.data.pages || 1 });
      setStats(statsRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filter, page, currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = ({ conversation, message }) => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === conversation.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...prev[idx], ...conversation };
          return updated.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
        }
        return [conversation, ...prev];
      });
      if (message?.direction === 'in') {
        if (soundOn) playBeep();
        if ('Notification' in window && Notification.permission === 'granted') {
          const name = conversation.customer_name || 'Học sinh';
          const ch = conversation.channel === 'facebook' ? '📘 Facebook'
            : conversation.channel === 'zalo' ? '🔵 Zalo' : '🌐 Website';
          new Notification(`${name} — ${ch}`, {
            body: message.content?.slice(0, 100) || '',
            icon: '/favicon.ico',
            tag: `conv-${conversation.id}`,
          });
        }
      }
    };
    socket.on('new_message', handler);
    return () => socket.off('new_message', handler);
  }, []);

  const setF = (key, val) => { setPage(1); setFilter(f => ({ ...f, [key]: val })); };

  return (
    <div style={{
      width: 300, background: '#fff', borderRight: '1px solid #e8edf2',
      display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
    }}>

      {/* ── Header: title + stats ── */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f4f8' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Hội thoại</span>
          <button onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            localStorage.setItem('crm_sound', next ? 'on' : 'off');
          }} title={soundOn ? 'Tắt âm thanh' : 'Bật âm thanh'} style={{
            background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
            padding: '3px 8px', cursor: 'pointer', fontSize: 15, color: soundOn ? '#2563eb' : '#94a3b8',
          }}>
            {soundOn ? '🔔' : '🔕'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
          {[
            { label: 'Đang mở',   value: stats.open   || 0, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
            { label: 'Chưa đọc', value: stats.unread || 0, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: 'Tổng',     value: stats.total  || 0, color: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, border: `1px solid ${s.border}`,
              borderRadius: 10, padding: '8px 10px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1 }}>{fmtNum(s.value)}</div>
              <div style={{ fontSize: 12, color: s.color, opacity: 0.8, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 10 }} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            fontSize: 15, color: '#94a3b8', pointerEvents: 'none',
          }}>🔍</span>
          <input
            placeholder="Tìm học sinh, tin nhắn..."
            value={filter.search}
            onChange={e => setF('search', e.target.value)}
            style={{
              width: '100%', padding: '7px 10px 7px 28px',
              border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 15, outline: 'none', boxSizing: 'border-box',
              background: '#f8fafc', color: '#1e293b',
            }}
            onFocus={e => e.target.style.borderColor = '#2563eb'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>
      </div>

      {/* ── Channel pills ── */}
      <div style={{
        display: 'flex', gap: 4, padding: '8px 14px',
        borderBottom: '1px solid #f0f4f8', overflowX: 'auto',
      }}>
        {CHANNELS.map(ch => {
          const active = filter.channel === ch.id;
          return (
            <button key={ch.id} onClick={() => setF('channel', ch.id)} style={{
              padding: '4px 11px', borderRadius: 20, border: 'none',
              background: active ? '#2563eb' : '#f1f5f9',
              color: active ? 'white' : '#64748b',
              fontSize: 14, fontWeight: active ? 600 : 500,
              whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all .12s',
            }}>
              {ch.icon && <span style={{ marginRight: 3 }}>{ch.icon}</span>}
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* ── Label pills ── */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 14px',
        borderBottom: '1px solid #f0f4f8', overflowX: 'auto', alignItems: 'center',
      }}>
        <button
          onClick={() => setF('label', '')}
          style={{
            padding: '3px 10px', borderRadius: 20, border: 'none',
            background: !filter.label ? '#1e293b' : '#f1f5f9',
            color: !filter.label ? 'white' : '#64748b',
            fontSize: 13, fontWeight: !filter.label ? 600 : 400,
            whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all .12s',
          }}
        >Tất cả</button>
        {LABELS.map(lbl => {
          const active = filter.label === lbl.id;
          return (
            <button key={lbl.id} onClick={() => setF('label', active ? '' : lbl.id)} style={{
              padding: '3px 10px', borderRadius: 20, border: 'none',
              background: active ? lbl.color : '#f1f5f9',
              color: active ? 'white' : '#64748b',
              fontSize: 13, fontWeight: active ? 600 : 400,
              whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all .12s',
            }}>{lbl.text}</button>
          );
        })}
      </div>

      {/* ── Status tabs + Của tôi ── */}
      <div style={{
        display: 'flex', borderBottom: '2px solid #f0f4f8',
        background: '#fafbfc',
      }}>
        {STATUSES.map(s => {
          const active = filter.status === s.value && !filter.myOnly;
          return (
            <button key={s.value} onClick={() => { setF('status', s.value); setFilter(f => ({ ...f, status: s.value, myOnly: false })); }} style={{
              flex: 1, padding: '9px 0', border: 'none', background: 'transparent',
              borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
              color: active ? '#2563eb' : '#94a3b8',
              fontSize: 14, fontWeight: active ? 700 : 400, cursor: 'pointer',
              transition: 'all .12s',
            }}>
              {s.label}
            </button>
          );
        })}
        <button
          onClick={() => setFilter(f => ({ ...f, myOnly: !f.myOnly, status: 'all' }))}
          style={{
            flex: 1, padding: '9px 0', border: 'none', background: 'transparent',
            borderBottom: filter.myOnly ? '2px solid #059669' : '2px solid transparent',
            marginBottom: -2,
            color: filter.myOnly ? '#059669' : '#94a3b8',
            fontSize: 14, fontWeight: filter.myOnly ? 700 : 400, cursor: 'pointer',
            transition: 'all .12s',
          }}
        >👤 Của tôi</button>
      </div>

      {/* ── Conversation list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && Array.from({ length: 5 }).map((_, i) => <ConversationSkeleton key={i} />)}

        {!loading && conversations.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 16 }}>Không có hội thoại nào</div>
          </div>
        )}

        {conversations.map(conv => {
          const isSelected = selectedId === conv.id;
          const convLabels = getConvLabels(conv).map(id => LABELS.find(l => l.id === id)).filter(Boolean);
          const hasUnread = conv.unread_count > 0;

          return (
            <div
              key={conv.id}
              onClick={() => onSelect(conv)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '11px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid #f4f6f8',
                borderLeft: `3px solid ${isSelected ? '#2563eb' : 'transparent'}`,
                background: isSelected ? '#eff6ff' : 'white',
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white'; }}
            >
              {/* Avatar + unread badge */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar name={conv.customer_name} size={38} />
                {hasUnread && (
                  <span style={{
                    position: 'absolute', top: -3, right: -3,
                    background: '#dc2626', color: 'white',
                    borderRadius: 10, fontSize: 12, fontWeight: 700,
                    padding: '1px 4px', minWidth: 15, textAlign: 'center',
                    border: '1.5px solid white',
                  }}>{conv.unread_count}</span>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Row 1: name + time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                  <span style={{
                    fontWeight: hasUnread ? 700 : 600, fontSize: 15.5, color: '#1e293b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
                  }}>
                    {conv.customer_name}
                  </span>
                  <span style={{ fontSize: 12.5, color: '#94a3b8', flexShrink: 0, marginLeft: 6 }}>
                    {timeAgo(conv.last_message_at)}
                  </span>
                </div>

                {/* Row 2: channel badge + assigned */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: convLabels.length ? 4 : 3 }}>
                  <ChannelBadge channel={conv.channel} />
                  {conv.assigned_name && (
                    <span style={{
                      fontSize: 12, color: '#059669', background: '#f0fdf4',
                      borderRadius: 6, padding: '1px 5px', fontWeight: 500,
                    }}>👤 {conv.assigned_name}</span>
                  )}
                </div>

                {/* Row 3: labels */}
                {convLabels.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 3 }}>
                    {convLabels.map(lbl => (
                      <span key={lbl.id} style={{
                        background: lbl.bg, color: lbl.color,
                        borderRadius: 6, padding: '1px 6px', fontSize: 12.5, fontWeight: 600,
                      }}>{lbl.text}</span>
                    ))}
                  </div>
                )}

                {/* Row 4: last message */}
                <div style={{
                  fontSize: 14, color: hasUnread ? '#475569' : '#94a3b8',
                  fontWeight: hasUnread ? 500 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {conv.last_message || '...'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderTop: '1px solid #f0f4f8', flexShrink: 0,
          background: 'white',
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: page === 1 ? '#f8fafc' : 'white', cursor: page === 1 ? 'default' : 'pointer',
              fontSize: 13, color: page === 1 ? '#cbd5e1' : '#475569',
            }}
          >← Trước</button>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {page} / {pagination.pages}
            <span style={{ color: '#94a3b8', marginLeft: 4 }}>({pagination.total})</span>
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            style={{
              padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: page === pagination.pages ? '#f8fafc' : 'white',
              cursor: page === pagination.pages ? 'default' : 'pointer',
              fontSize: 13, color: page === pagination.pages ? '#cbd5e1' : '#475569',
            }}
          >Sau →</button>
        </div>
      )}
    </div>
  );
}
