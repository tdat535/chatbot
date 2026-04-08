import React, { useState, useEffect, useRef } from 'react';
import { getConversations } from './api.js';
import Login from './pages/Login.jsx';
import Inbox from './pages/Inbox.jsx';
import Customers from './pages/Customers.jsx';
import Settings from './pages/Settings.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BotTraining from './pages/BotTraining.jsx';
import QuickReplies from './pages/QuickReplies.jsx';

const NAV = [
  { id: 'dashboard',    label: 'Tổng quan',        icon: '📊' },
  { id: 'inbox',        label: 'Hộp thư',          icon: '💬' },
  { id: 'customers',    label: 'Học sinh',         icon: '👥' },
  { id: 'bot-training', label: 'Huấn luyện Bot',   icon: '🧠' },
  { id: 'quick-replies',label: 'Tin nhắn mẫu',     icon: '⚡' },
  { id: 'settings',     label: 'Cài đặt',          icon: '⚙️' },
];

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('crm_user')); } catch { return null; }
}

function Avatar({ name, size = 32 }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#059669', '#0891b2'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function GlobalSearch({ onSelectConv, collapsed }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const CHANNEL_ICON = { facebook: '📘', zalo: '🔵', website: '🌐' };

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await getConversations({ search: query.trim(), limit: 10 });
        setResults(res.data.data || []);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Tìm kiếm toàn cục (Ctrl+K)"
        style={{
          display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '11px 0' : '10px 12px',
          borderRadius: 8, border: 'none', background: 'transparent',
          color: '#94a3b8', fontSize: 16, cursor: 'pointer', width: '100%',
          transition: 'all .12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#cbd5e1'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
      >
        <span style={{ fontSize: 17, flexShrink: 0 }}>🔎</span>
        {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>Tìm kiếm</span>}
        {!collapsed && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', background: '#1e293b', borderRadius: 4, padding: '1px 5px' }}>Ctrl K</span>}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: 14, width: 520, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f1f5f9', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🔎</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Tìm học sinh, nội dung tin nhắn..."
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: '#1e293b' }}
              />
              {searching && <span style={{ fontSize: 13, color: '#94a3b8' }}>...</span>}
              <kbd onClick={() => setOpen(false)} style={{ fontSize: 12, color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>Esc</kbd>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {results.length === 0 && query.trim() && !searching && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Không tìm thấy kết quả</div>
              )}
              {!query.trim() && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Nhập tên học sinh hoặc nội dung để tìm</div>
              )}
              {results.map(conv => (
                <div key={conv.id} onClick={() => { onSelectConv(conv); setOpen(false); }} style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                  display: 'flex', gap: 12, alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{CHANNEL_ICON[conv.channel] || '💬'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{conv.customer_name}</div>
                    <div style={{ fontSize: 13, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.last_message || '—'}
                    </div>
                  </div>
                  {conv.unread_count > 0 && (
                    <span style={{ background: '#dc2626', color: 'white', borderRadius: 10, fontSize: 12, padding: '1px 6px', fontWeight: 700 }}>{conv.unread_count}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [page, setPage] = useState('inbox');
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [collapsed, setCollapsed] = useState(false);
  const [globalSelectedConv, setGlobalSelectedConv] = useState(null);

  const handleSelectConv = (conv) => {
    setGlobalSelectedConv(conv);
    setPage('inbox');
  };

  const handleLogin = (user) => setCurrentUser(user);

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setCurrentUser(null);
  };

  if (!currentUser) return <Login onLogin={handleLogin} />;

  const W = collapsed ? 60 : 220;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Left Sidebar ── */}
      <aside style={{
        width: W, flexShrink: 0,
        background: '#0f172a',
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #1e293b',
        transition: 'width .2s ease',
        overflow: 'hidden',
      }}>

        {/* Logo + collapse toggle */}
        <div style={{
          padding: collapsed ? '18px 0' : '16px 14px',
          borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8, flexShrink: 0,
        }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9, background: '#2563eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, flexShrink: 0,
              }}>💬</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'white', lineHeight: 1.2, whiteSpace: 'nowrap' }}>CRM Mini</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 1 }}>Viễn Đông</div>
              </div>
            </div>
          )}

          {collapsed && (
            <div style={{
              width: 34, height: 34, borderRadius: 9, background: '#2563eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
            }}>💬</div>
          )}

          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Mở rộng' : 'Thu gọn'}
            style={{
              flexShrink: 0, background: '#1e293b', border: 'none',
              color: '#94a3b8', cursor: 'pointer',
              width: 30, height: 30, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, lineHeight: 1, transition: 'all .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          <GlobalSearch onSelectConv={handleSelectConv} collapsed={collapsed} />
          {NAV.map(n => {
            const active = page === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                title={collapsed ? n.label : undefined}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: collapsed ? 0 : 10,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: collapsed ? '11px 0' : '10px 12px',
                  borderRadius: 8, border: 'none',
                  background: active ? '#1e3a5f' : 'transparent',
                  color: active ? '#60a5fa' : '#94a3b8',
                  fontSize: 16, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', width: '100%',
                  transition: 'all .12s',
                  boxShadow: active ? 'inset 3px 0 0 #2563eb' : 'none',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#cbd5e1'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; } }}
              >
                <span style={{ fontSize: 17, flexShrink: 0, lineHeight: 1 }}>{n.icon}</span>
                {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{n.label}</span>}
                {!collapsed && n.id === 'inbox' && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 12, background: '#2563eb',
                    color: 'white', borderRadius: 8, padding: '2px 6px', fontWeight: 700,
                  }}>LIVE</span>
                )}
                {collapsed && n.id === 'inbox' && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#2563eb', border: '1.5px solid #0f172a',
                  }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* User card */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
          {collapsed ? (
            /* Thu gọn: chỉ avatar, tooltip tên */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div title={currentUser.display_name} style={{ cursor: 'default' }}>
                <Avatar name={currentUser.display_name} size={34} />
              </div>
              <button
                onClick={handleLogout}
                title="Đăng xuất"
                style={{
                  background: 'transparent', border: 'none', color: '#475569',
                  cursor: 'pointer', fontSize: 16, padding: 4, borderRadius: 4, lineHeight: 1,
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#475569'}
              >⏏</button>
            </div>
          ) : (
            /* Mở rộng: full user card */
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', borderRadius: 8, background: '#1e293b',
            }}>
              <Avatar name={currentUser.display_name} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: 'white',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{currentUser.display_name}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                  {currentUser.role === 'admin' ? '👑 Admin' : '👨‍💼 Tư vấn'}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Đăng xuất"
                style={{
                  flexShrink: 0, background: 'transparent', border: 'none',
                  color: '#475569', cursor: 'pointer', fontSize: 16,
                  padding: 4, borderRadius: 4, lineHeight: 1, transition: 'color .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#475569'}
              >⏏</button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Page Content ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {page === 'dashboard'    && <Dashboard />}
        {page === 'inbox'        && <Inbox currentUser={currentUser} initialConv={globalSelectedConv} onConvConsumed={() => setGlobalSelectedConv(null)} />}
        {page === 'customers'    && <Customers />}
        {page === 'bot-training'  && <BotTraining />}
        {page === 'quick-replies' && <QuickReplies />}
        {page === 'settings'      && <Settings currentUser={currentUser} />}
      </div>
    </div>
  );
}
