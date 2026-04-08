import React, { useState, useCallback, useEffect } from 'react';
import ConversationList from '../components/ConversationList.jsx';
import ChatView from '../components/ChatView.jsx';
import CustomerPanel from '../components/CustomerPanel.jsx';
import BroadcastModal from '../components/BroadcastModal.jsx';

export default function Inbox({ currentUser, initialConv, onConvConsumed }) {
  const [selected, setSelected] = useState(null);
  const [showBroadcast, setShowBroadcast] = useState(false);

  useEffect(() => {
    if (initialConv) {
      setSelected(initialConv);
      onConvConsumed?.();
    }
  }, [initialConv]);

  const handleSelect = useCallback((conv) => setSelected(conv), []);

  const handleConvUpdate = useCallback((conv) => {
    setSelected(prev => prev?.id === conv.id ? { ...prev, ...conv } : prev);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: 300, height: '100%', flexShrink: 0 }}>
        <ConversationList
          selectedId={selected?.id}
          onSelect={handleSelect}
          currentUser={currentUser}
        />
        {/* Broadcast button below list */}
        <div style={{
          padding: '10px 12px', borderTop: '1px solid #e2e8f0',
          background: 'white', flexShrink: 0,
        }}>
          <button
            onClick={() => setShowBroadcast(true)}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 8,
              background: '#7c3aed', color: 'white', border: 'none',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            📣 Gửi hàng loạt
          </button>
        </div>
      </div>

      <ChatView conversation={selected} onUpdate={handleConvUpdate} currentUser={currentUser} />
      <CustomerPanel conversation={selected} onUpdate={handleConvUpdate} />

      {showBroadcast && (
        <BroadcastModal
          currentUser={currentUser}
          onClose={() => setShowBroadcast(false)}
        />
      )}
    </div>
  );
}
