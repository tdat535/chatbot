import React, { useEffect } from 'react';

// Inject CSS animation một lần duy nhất
let injected = false;
function injectStyle() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes skeletonPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .skeleton-pulse {
      animation: skeletonPulse 1.4s ease-in-out infinite;
      background: #e2e8f0;
      border-radius: 6px;
    }
  `;
  document.head.appendChild(style);
}

export function Skeleton({ width = '100%', height = 14, radius = 6, style = {} }) {
  useEffect(() => { injectStyle(); }, []);
  return (
    <div className="skeleton-pulse" style={{ width, height, borderRadius: radius, ...style }} />
  );
}

// Skeleton 1 item trong ConversationList
export function ConversationSkeleton() {
  useEffect(() => { injectStyle(); }, []);
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
      <div className="skeleton-pulse" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="skeleton-pulse" style={{ width: '55%', height: 13 }} />
          <div className="skeleton-pulse" style={{ width: '18%', height: 11 }} />
        </div>
        <div className="skeleton-pulse" style={{ width: '30%', height: 11 }} />
        <div className="skeleton-pulse" style={{ width: '80%', height: 11 }} />
      </div>
    </div>
  );
}

// Skeleton 1 tin nhắn
export function MessageSkeleton({ isOut = false }) {
  useEffect(() => { injectStyle(); }, []);
  const w = ['60%', '45%', '70%', '50%'][Math.floor(Math.random() * 4)];
  return (
    <div style={{ display: 'flex', flexDirection: isOut ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6 }}>
      {!isOut && <div className="skeleton-pulse" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />}
      <div className="skeleton-pulse" style={{ width: w, height: 38, borderRadius: 12 }} />
    </div>
  );
}

// Skeleton 1 dòng bảng Customers
export function CustomerRowSkeleton() {
  useEffect(() => { injectStyle(); }, []);
  return (
    <tr>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="skeleton-pulse" style={{ width: 32, height: 32, borderRadius: '50%' }} />
          <div className="skeleton-pulse" style={{ width: 120, height: 13 }} />
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}><div className="skeleton-pulse" style={{ width: 60, height: 20, borderRadius: 10 }} /></td>
      <td style={{ padding: '12px 16px' }}><div className="skeleton-pulse" style={{ width: 90, height: 13 }} /></td>
      <td style={{ padding: '12px 16px' }}><div className="skeleton-pulse" style={{ width: 130, height: 13 }} /></td>
      <td style={{ padding: '12px 16px' }}><div className="skeleton-pulse" style={{ width: 70, height: 13 }} /></td>
    </tr>
  );
}

// Skeleton stat card Dashboard
export function StatCardSkeleton() {
  useEffect(() => { injectStyle(); }, []);
  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div className="skeleton-pulse" style={{ width: 32, height: 32, borderRadius: 8 }} />
      <div className="skeleton-pulse" style={{ width: '50%', height: 28 }} />
      <div className="skeleton-pulse" style={{ width: '70%', height: 13 }} />
      <div className="skeleton-pulse" style={{ width: '40%', height: 11 }} />
    </div>
  );
}
