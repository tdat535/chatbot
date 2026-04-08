import React from 'react';

const CHANNEL_CONFIG = {
  facebook: { label: 'Facebook', color: '#1877f2', bg: '#e7f0fd', emoji: '📘' },
  zalo: { label: 'Zalo', color: '#0068ff', bg: '#e5f0ff', emoji: '🔵' },
  website: { label: 'Website', color: '#059669', bg: '#d1fae5', emoji: '🌐' },
};

export default function ChannelBadge({ channel, size = 'sm' }) {
  const cfg = CHANNEL_CONFIG[channel] || { label: channel, color: '#64748b', bg: '#f1f5f9', emoji: '💬' };
  const pad = size === 'sm' ? '2px 7px' : '3px 10px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
      borderRadius: 10, padding: pad, fontSize: fs, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

export { CHANNEL_CONFIG };
