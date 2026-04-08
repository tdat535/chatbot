import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getCustomers } from '../api.js';
import ChannelBadge from '../components/ChannelBadge.jsx';
import { CustomerRowSkeleton } from '../components/Skeleton.jsx';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCustomers({ search, channel }).then(res => {
      setCustomers(res.data);
      setLoading(false);
    });
  }, [search, channel]);

  const initial = (name) => (name || '?').charAt(0).toUpperCase();
  const colors = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#059669', '#0891b2'];
  const avatarColor = (name) => colors[(name || '?').charCodeAt(0) % colors.length];
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '';

  const exportXLSX = () => {
    const rows = customers.map(c => ({
      'Tên học sinh': c.name || '',
      'Kênh': c.channel || '',
      'Số điện thoại': c.phone || '',
      'Email': c.email || '',
      'Ngày liên hệ': fmtDate(c.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Học sinh');
    XLSX.writeFile(wb, `hoc-sinh-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div style={{ padding: 24, height: '100%', overflowY: 'auto', background: '#f8fafc' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>👥 Học sinh / Sinh viên</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 15, color: '#64748b' }}>{customers.length} học sinh</span>
            <button onClick={exportXLSX} disabled={customers.length === 0} style={{
              padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0',
              background: 'white', fontSize: 14, color: '#475569', cursor: 'pointer', fontWeight: 500,
            }}>📥 Xuất Excel</button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            placeholder="🔍 Tìm tên học sinh, SĐT, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 15, outline: 'none', background: 'white',
            }}
          />
          {['all', 'facebook', 'zalo', 'website'].map(ch => (
            <button key={ch} onClick={() => setChannel(ch)} style={{
              padding: '9px 14px', border: '1px solid', borderRadius: 8,
              borderColor: channel === ch ? '#2563eb' : '#e2e8f0',
              background: channel === ch ? '#eff6ff' : 'white',
              color: channel === ch ? '#2563eb' : '#64748b',
              fontSize: 15, fontWeight: 500,
            }}>
              {ch === 'all' ? 'Tất cả' : ch === 'facebook' ? '📘 FB' : ch === 'zalo' ? '🔵 Zalo' : '🌐 Web'}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Học sinh / Sinh viên', 'Kênh', 'Số điện thoại', 'Email', 'Ngày liên hệ'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 14,
                    fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: .5,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => <CustomerRowSkeleton key={i} />)}
              {!loading && customers.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Chưa có học sinh nào</td></tr>
              )}
              {customers.map((c, i) => (
                <tr key={c.id} style={{
                  borderBottom: '1px solid #f1f5f9',
                  background: i % 2 === 0 ? 'white' : '#fafafa',
                }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: avatarColor(c.name),
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 15, flexShrink: 0,
                      }}>{initial(c.name)}</div>
                      <span style={{ fontSize: 16, fontWeight: 500 }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><ChannelBadge channel={c.channel} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 15, color: '#64748b' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 15, color: '#64748b' }}>{c.email || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 15, color: '#64748b' }}>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
