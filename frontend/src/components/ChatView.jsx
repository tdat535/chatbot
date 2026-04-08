import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { getMessages, sendMessage, updateConversation, sendNote, getTemplates, getUsers } from '../api.js';
import ChannelBadge from './ChannelBadge.jsx';
import socket from '../socket.js';
import { MessageSkeleton } from './Skeleton.jsx';

const LABELS = [
  { id: 'chua-tu-van',  text: 'Chưa tư vấn',      color: '#7c3aed', bg: '#f5f3ff' },
  { id: 'dang-tu-van',  text: 'Đang tư vấn',       color: '#dc2626', bg: '#fef2f2' },
  { id: 'da-tu-van',    text: 'Đã tư vấn xong',    color: '#64748b', bg: '#f8fafc' },
];

function LabelChip({ label, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: label.bg, color: label.color,
      border: `1px solid ${label.color}30`,
      borderRadius: 12, padding: '2px 8px', fontSize: 13, fontWeight: 600,
    }}>
      {label.text}
      {onRemove && (
        <span onClick={onRemove} style={{ cursor: 'pointer', fontSize: 15, lineHeight: 1, opacity: 0.7 }}>×</span>
      )}
    </span>
  );
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN');
}

export default function ChatView({ conversation, onUpdate, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [autoReply, setAutoReply] = useState(true);
  const [inputMode, setInputMode] = useState('reply');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [activeLabels, setActiveLabels] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [users, setUsers] = useState([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assignedTo, setAssignedTo] = useState(null);
  const [assignedName, setAssignedName] = useState('');
  const bottomRef = useRef(null);
  const templateRef = useRef(null);
  const labelRef = useRef(null);
  const assignRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!conversation) return;
    setLoadingMessages(true);
    const res = await getMessages(conversation.id);
    setMessages(res.data);
    setLoadingMessages(false);
    setAutoReply(conversation.auto_reply !== 0);
    setAssignedTo(conversation.assigned_to || null);
    setAssignedName(conversation.assigned_name || '');
    try {
      const lbls = typeof conversation.labels === 'string'
        ? JSON.parse(conversation.labels)
        : (conversation.labels || []);
      setActiveLabels(Array.isArray(lbls) ? lbls : []);
    } catch { setActiveLabels([]); }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
  }, [conversation?.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    getTemplates().then(r => setTemplates(r.data)).catch(() => {});
    getUsers().then(r => setUsers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = ({ conversation: conv, message }) => {
      if (conversation && conv.id === conversation.id) {
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        if (onUpdate) onUpdate(conv);
      }
    };
    socket.on('new_message', handler);
    return () => socket.off('new_message', handler);
  }, [conversation?.id, onUpdate]);

  useEffect(() => {
    const handler = (e) => {
      if (templateRef.current && !templateRef.current.contains(e.target)) setShowTemplates(false);
      if (labelRef.current && !labelRef.current.contains(e.target)) setShowLabelPicker(false);
      if (assignRef.current && !assignRef.current.contains(e.target)) setShowAssignPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSend = async (overrideContent) => {
    const content = overrideContent || input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const name = currentUser?.display_name;
      if (inputMode === 'note' && !overrideContent) await sendNote(conversation.id, content, name);
      else await sendMessage(conversation.id, content, name);
      if (!overrideContent) setInput('');
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const applyTemplate = (tpl) => {
    setInput(tpl.content);
    setShowTemplates(false);
    setInputMode('reply');
  };

  const toggleLabel = async (labelId) => {
    const next = activeLabels.includes(labelId)
      ? activeLabels.filter(l => l !== labelId)
      : [...activeLabels, labelId];
    setActiveLabels(next);
    await updateConversation(conversation.id, { labels: next });
  };

  const toggleAutoReply = async () => {
    const newVal = !autoReply;
    setAutoReply(newVal);
    await updateConversation(conversation.id, { auto_reply: newVal });
  };

  const toggleStatus = async () => {
    const newStatus = conversation.status === 'open' ? 'closed' : 'open';
    await updateConversation(conversation.id, { status: newStatus });
    if (onUpdate) onUpdate({ ...conversation, status: newStatus });
  };

  const assignUser = async (userId, displayName) => {
    setAssignedTo(userId);
    setAssignedName(displayName || '');
    setShowAssignPicker(false);
    const updated = await updateConversation(conversation.id, { assigned_to: userId });
    if (onUpdate) onUpdate(updated.data);
  };

  const handleExport = () => {
    const name = conversation.customer_name || 'khach';
    const rows = messages.map(m => ({
      'Thời gian': new Date(m.created_at).toLocaleString('vi-VN'),
      'Chiều': m.direction === 'in' ? 'Học sinh → CRM' : 'CRM → Học sinh',
      'Người gửi': m.sent_by === 'bot' ? 'Chatbot' : (m.sender_name || name),
      'Loại': m.type === 'note' ? 'Ghi chú nội bộ' : 'Tin nhắn',
      'Nội dung': m.type === 'flow'
        ? (() => { try { return JSON.parse(m.content).text || m.content; } catch { return m.content; } })()
        : m.content,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lịch sử chat');
    XLSX.writeFile(wb, `chat_${name.replace(/\s+/g, '_')}_${conversation.id}.xlsx`);
  };

  if (!conversation) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', flexDirection: 'column', gap: 12, color: '#94a3b8',
      }}>
        <div style={{ fontSize: 64 }}>💬</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Chọn cuộc hội thoại</div>
        <div style={{ fontSize: 16 }}>để xem tin nhắn</div>
      </div>
    );
  }

  const allMessages = messages;
  const filteredMessages = searchQuery.trim()
    ? allMessages.filter(m =>
        (m.content || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allMessages;

  const grouped = [];
  let lastDate = null;
  for (const msg of filteredMessages) {
    const d = formatDate(msg.created_at);
    if (d !== lastDate) { grouped.push({ type: 'date', date: d }); lastDate = d; }
    grouped.push({ type: 'msg', ...msg });
  }

  const chipLabels = LABELS.filter(l => activeLabels.includes(l.id));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* Chat Header */}
      <div style={{
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '10px 16px', flexShrink: 0, overflow: 'visible',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conversation.customer_name || 'Khách hàng'}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
              <ChannelBadge channel={conversation.channel} />
              {conversation.customer_phone && (
                <span style={{ fontSize: 14, color: '#64748b' }}>📱 {conversation.customer_phone}</span>
              )}
              {assignedName && (
                <span style={{ fontSize: 13, color: '#059669', background: '#f0fdf4',
                  border: '1px solid #bbf7d0', borderRadius: 8, padding: '1px 6px', fontWeight: 500 }}>
                  👤 {assignedName}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons - cuộn ngang nếu hẹp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

          {/* Assign CBTV */}
          <div ref={assignRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowAssignPicker(v => !v)} style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid',
              borderColor: assignedTo ? '#bbf7d0' : '#e2e8f0',
              background: assignedTo ? '#f0fdf4' : 'white',
              color: assignedTo ? '#059669' : '#64748b', fontSize: 14, cursor: 'pointer',
            }}>👤 Giao cho CBTV</button>
            {showAssignPicker && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 200, zIndex: 100, overflow: 'hidden',
              }}>
                <div style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
                  GIAO CHO PHỤ TRÁCH
                </div>
                {currentUser && (
                  <div onClick={() => assignUser(currentUser.id, currentUser.display_name)} style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 15, fontWeight: 600,
                    color: '#2563eb', background: '#eff6ff', borderBottom: '1px solid #e2e8f0',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                  onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}>
                    ⚡ Gán cho tôi
                  </div>
                )}
                {users.filter(u => u.id !== currentUser?.id).map(u => (
                  <div key={u.id} onClick={() => assignUser(u.id, u.display_name)} style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 15,
                    background: assignedTo === u.id ? '#f0fdf4' : 'white',
                    color: assignedTo === u.id ? '#059669' : '#1e293b',
                  }}
                  onMouseEnter={e => { if (assignedTo !== u.id) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (assignedTo !== u.id) e.currentTarget.style.background = 'white'; }}>
                    {assignedTo === u.id && <span style={{ marginRight: 4 }}>✓</span>}
                    {u.display_name}
                    <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 6 }}>@{u.username}</span>
                  </div>
                ))}
                {assignedTo && (
                  <div onClick={() => assignUser(null, '')} style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: 15, color: '#ef4444',
                    borderTop: '1px solid #fee2e2', background: '#fff5f5',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff5f5'}>
                    ✕ Bỏ chọn
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Label Picker */}
          <div ref={labelRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowLabelPicker(v => !v)} style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: 'white', color: '#64748b', fontSize: 14, cursor: 'pointer',
            }}>🏷️ Nhãn</button>
            {showLabelPicker && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 180, zIndex: 100, overflow: 'hidden',
              }}>
                <div style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
                  GẮN NHÃN
                </div>
                {LABELS.map(lbl => (
                  <div key={lbl.id} onClick={() => toggleLabel(lbl.id)} style={{
                    padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    background: activeLabels.includes(lbl.id) ? lbl.bg : 'white',
                  }}
                  onMouseEnter={e => { if (!activeLabels.includes(lbl.id)) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (!activeLabels.includes(lbl.id)) e.currentTarget.style.background = 'white'; }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: activeLabels.includes(lbl.id) ? lbl.color : '#e2e8f0',
                    }} />
                    <span style={{ fontSize: 15, color: activeLabels.includes(lbl.id) ? lbl.color : '#1e293b', fontWeight: activeLabels.includes(lbl.id) ? 600 : 400 }}>
                      {lbl.text}
                    </span>
                    {activeLabels.includes(lbl.id) && <span style={{ marginLeft: 'auto', color: lbl.color, fontSize: 14 }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search toggle */}
          <button onClick={() => { setShowSearch(v => !v); setSearchQuery(''); }} style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid',
            borderColor: showSearch ? '#2563eb' : '#e2e8f0',
            background: showSearch ? '#eff6ff' : 'white',
            color: showSearch ? '#2563eb' : '#64748b', fontSize: 14, cursor: 'pointer',
          }}>🔍</button>

          {/* Export Excel */}
          <button onClick={handleExport} title="Xuất lịch sử chat (Excel)" style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
            background: 'white', color: '#64748b', fontSize: 14, cursor: 'pointer',
          }}>📥 Excel</button>

          {/* Auto Reply Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Tự động</span>
            <div onClick={toggleAutoReply} style={{
              width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
              background: autoReply ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background .2s',
            }}>
              <div style={{
                position: 'absolute', top: 2, left: autoReply ? 18 : 2, width: 16, height: 16,
                borderRadius: '50%', background: 'white', transition: 'left .2s',
                boxShadow: '0 1px 3px rgba(0,0,0,.2)',
              }} />
            </div>
          </div>

          {/* Status Button */}
          <button onClick={toggleStatus} style={{
            padding: '5px 12px', borderRadius: 8, border: '1px solid',
            borderColor: conversation.status === 'open' ? '#e2e8f0' : '#bbf7d0',
            background: conversation.status === 'open' ? 'white' : '#f0fdf4',
            color: conversation.status === 'open' ? '#64748b' : '#15803d',
            fontSize: 14, fontWeight: 600, flexShrink: 0,
          }}>
            {conversation.status === 'open' ? 'Đóng' : '✓ Đã đóng'}
          </button>
          </div>{/* end action buttons */}
        </div>{/* end header row */}

        {chipLabels.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chipLabels.map(lbl => (
              <LabelChip key={lbl.id} label={lbl} onRemove={() => toggleLabel(lbl.id)} />
            ))}
          </div>
        )}

        {showSearch && (
          <div style={{ marginTop: 8 }}>
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm trong hội thoại này..."
              style={{
                width: '100%', padding: '7px 12px', border: '1px solid #2563eb',
                borderRadius: 8, fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
            />
            {searchQuery && (
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Tìm thấy {filteredMessages.length} tin nhắn
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {loadingMessages && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MessageSkeleton isOut={false} />
            <MessageSkeleton isOut={true} />
            <MessageSkeleton isOut={false} />
            <MessageSkeleton isOut={true} />
            <MessageSkeleton isOut={false} />
          </div>
        )}
        {!loadingMessages && grouped.map((item, idx) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${idx}`} style={{ textAlign: 'center', margin: '8px 0' }}>
                <span style={{ background: '#e2e8f0', color: '#64748b', fontSize: 13, borderRadius: 10, padding: '3px 10px' }}>
                  {item.date}
                </span>
              </div>
            );
          }

          const isNote = item.type === 'note';
          const isOut = item.direction === 'out';
          const isBot = item.sent_by === 'bot';

          const highlight = (text) => {
            if (!searchQuery.trim() || !text) return text;
            const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            const parts = String(text).split(regex);
            return parts.map((part, i) =>
              regex.test(part)
                ? <mark key={i} style={{ background: '#fef08a', borderRadius: 2 }}>{part}</mark>
                : part
            );
          };

          if (isNote) {
            return (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                <div style={{
                  background: '#fefce8', border: '1px dashed #fbbf24',
                  borderRadius: 8, padding: '6px 12px', maxWidth: '70%',
                  fontSize: 15, color: '#92400e',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#b45309', marginRight: 6 }}>📝 Ghi chú nội bộ</span>
                  {highlight(item.content)}
                  <span style={{ fontSize: 12, color: '#d97706', marginLeft: 8 }}>{formatTime(item.created_at)}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={item.id} style={{
              display: 'flex', flexDirection: isOut ? 'row-reverse' : 'row',
              alignItems: 'flex-end', gap: 6,
            }}>
              {!isOut && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>👤</div>
              )}
              <div style={{ maxWidth: '68%' }}>
                <div style={{
                  background: isOut ? (isBot ? '#2563eb' : '#1e40af') : 'white',
                  color: isOut ? 'white' : '#1e293b',
                  borderRadius: 12,
                  borderBottomRightRadius: isOut ? 4 : 12,
                  borderBottomLeftRadius: isOut ? 12 : 4,
                  padding: '8px 12px', fontSize: 16, lineHeight: 1.5,
                  boxShadow: '0 1px 2px rgba(0,0,0,.08)',
                  border: isOut ? 'none' : '1px solid #e2e8f0',
                }}>
                  {highlight(item.content)}
                </div>
                <div style={{
                  fontSize: 12, color: '#94a3b8', marginTop: 2,
                  textAlign: isOut ? 'right' : 'left',
                  display: 'flex', gap: 4, justifyContent: isOut ? 'flex-end' : 'flex-start',
                }}>
                  {formatTime(item.created_at)}
                  {isOut && <span style={{ color: isBot ? '#93c5fd' : '#86efac' }}>
                    {isBot ? '🤖 Chatbot' : `👨‍💼 ${item.sender_name || 'Cán bộ tư vấn'}`}
                  </span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '10px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <button onClick={() => setInputMode('reply')} style={{
            padding: '4px 12px', borderRadius: 6, border: '1px solid',
            borderColor: inputMode === 'reply' ? '#2563eb' : '#e2e8f0',
            background: inputMode === 'reply' ? '#eff6ff' : 'white',
            color: inputMode === 'reply' ? '#2563eb' : '#64748b',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>💬 Trả lời</button>
          <button onClick={() => setInputMode('note')} style={{
            padding: '4px 12px', borderRadius: 6, border: '1px solid',
            borderColor: inputMode === 'note' ? '#f59e0b' : '#e2e8f0',
            background: inputMode === 'note' ? '#fffbeb' : 'white',
            color: inputMode === 'note' ? '#b45309' : '#64748b',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>📝 Ghi chú</button>

          <div ref={templateRef} style={{ marginLeft: 'auto', position: 'relative' }}>
            <button onClick={() => setShowTemplates(v => !v)} style={{
              padding: '4px 12px', borderRadius: 6, border: '1px solid #e2e8f0',
              background: 'white', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>⚡ Mẫu {templates.length > 0 && <span style={{ color: '#2563eb' }}>({templates.length})</span>}</button>
            {showTemplates && (
              <div style={{
                position: 'absolute', bottom: '100%', right: 0, marginBottom: 6,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,.12)', minWidth: 280, maxWidth: 360,
                zIndex: 100, overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 14, color: '#64748b', fontWeight: 600 }}>
                  Tin nhắn mẫu
                </div>
                {templates.length === 0 ? (
                  <div style={{ padding: '16px 12px', fontSize: 15, color: '#94a3b8', textAlign: 'center' }}>
                    Chưa có mẫu. Thêm trong Cài đặt.
                  </div>
                ) : (
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {templates.map(tpl => (
                      <div key={tpl.id} onClick={() => applyTemplate(tpl)} style={{
                        padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{tpl.title}</div>
                        <div style={{ fontSize: 14, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {tpl.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={inputMode === 'note'
              ? 'Ghi chú nội bộ... (chỉ cán bộ tư vấn thấy)'
              : 'Nhập nội dung tư vấn... (Enter gửi, Shift+Enter xuống dòng)'
            }
            rows={2}
            style={{
              flex: 1, borderRadius: 8, padding: '8px 12px', fontSize: 16,
              resize: 'none', outline: 'none', lineHeight: 1.4,
              border: `1px solid ${inputMode === 'note' ? '#fbbf24' : '#e2e8f0'}`,
              background: inputMode === 'note' ? '#fefce8' : 'white',
            }}
          />
          <button onClick={() => handleSend()} disabled={sending || !input.trim()} style={{
            background: inputMode === 'note' ? '#f59e0b' : '#2563eb',
            color: 'white', border: 'none', borderRadius: 8,
            padding: '0 20px', fontWeight: 600, fontSize: 16,
            opacity: (sending || !input.trim()) ? 0.5 : 1,
          }}>
            {sending ? '...' : (inputMode === 'note' ? 'Lưu' : 'Gửi')}
          </button>
        </div>
      </div>
    </div>
  );
}
