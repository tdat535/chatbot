import React, { useState, useEffect } from 'react';
import { getDashboardStats } from '../api.js';
import { StatCardSkeleton } from '../components/Skeleton.jsx';

function StatCard({ label, value, sub, color = '#2563eb', icon }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value ?? '—'}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{label}</div>
      {sub && <div style={{ fontSize: 14, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, color = '#2563eb', label = 'count' }) {
  if (!data || data.length === 0) return <div style={{ color: '#94a3b8', fontSize: 15 }}>Chưa có dữ liệu</div>;
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
      {data.map((d, i) => {
        const height = Math.max((d.count / max) * 80, 2);
        const dateStr = d.date ? new Date(d.date).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' }) : '';
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{d.count}</div>
            <div style={{
              width: '100%', height, background: color, borderRadius: '4px 4px 0 0',
              minHeight: 2,
            }} />
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, textAlign: 'center' }}>{dateStr}</div>
          </div>
        );
      })}
    </div>
  );
}

const CHANNEL_LABEL = { facebook: '📘 Facebook', zalo: '🔵 Zalo', website: '🌐 Website' };
const CHANNEL_COLOR = { facebook: '#1d4ed8', zalo: '#0ea5e9', website: '#16a34a' };

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDashboardStats();
      setStats(res.data);
    } catch (e) {
      setError('Không thể tải dữ liệu thống kê');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', background: '#f8fafc', padding: 24 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ width: 160, height: 26, background: '#e2e8f0', borderRadius: 6, marginBottom: 8, animation: 'skeletonPulse 1.4s ease-in-out infinite' }} />
            <div style={{ width: 220, height: 14, background: '#e2e8f0', borderRadius: 6, animation: 'skeletonPulse 1.4s ease-in-out infinite' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div style={{ background: '#e2e8f0', borderRadius: 12, padding: 20, border: '1px solid #f1f5f9', height: 160, animation: 'skeletonPulse 1.4s ease-in-out infinite' }} />
            <div style={{ background: '#e2e8f0', borderRadius: 12, padding: 20, border: '1px solid #f1f5f9', height: 160, animation: 'skeletonPulse 1.4s ease-in-out infinite' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#ef4444' }}>{error}</div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer' }}>
          Thử lại
        </button>
      </div>
    );
  }

  const totalReplies = (stats.messages.botReplies || 0) + (stats.messages.agentReplies || 0);
  const botPct = totalReplies > 0 ? Math.round((stats.messages.botReplies / totalReplies) * 100) : 0;
  const agentPct = totalReplies > 0 ? Math.round((stats.messages.agentReplies / totalReplies) * 100) : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#f8fafc', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Tổng quan</h1>
            <div style={{ fontSize: 15, color: '#64748b', marginTop: 4 }}>
              {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <button onClick={load} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: 'white', color: '#64748b', fontSize: 15, cursor: 'pointer',
          }}>
            Làm mới
          </button>
        </div>

        {/* Stat Cards - hàng 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard
            icon="💬" label="Tổng hội thoại"
            value={stats.conversations.total}
            sub={`${stats.conversations.open} đang mở`}
            color="#2563eb"
          />
          <StatCard
            icon="🔴" label="Chưa đọc"
            value={stats.conversations.unread}
            sub="Cần xử lý"
            color="#ef4444"
          />
          <StatCard
            icon="👥" label="Học sinh / Sinh viên"
            value={stats.customers.total}
            sub="Đã liên hệ"
            color="#7c3aed"
          />
          <StatCard
            icon="📨" label="Câu hỏi hôm nay"
            value={stats.messages.today}
            sub="Tất cả kênh"
            color="#0891b2"
          />
        </div>

        {/* Row 2: Biểu đồ tin nhắn + Kênh */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* Tin nhắn 7 ngày */}
          <div style={{
            background: 'white', borderRadius: 12, padding: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>
              Tin nhắn trao đổi 7 ngày gần nhất
            </div>
            <BarChart data={stats.messages.byDay} color="#2563eb" />
          </div>

          {/* Theo kênh */}
          <div style={{
            background: 'white', borderRadius: 12, padding: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>
              Hội thoại theo kênh
            </div>
            {stats.byChannel.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 15 }}>Chưa có dữ liệu</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.byChannel.map(ch => {
                  const pct = stats.conversations.total > 0
                    ? Math.round((ch.count / stats.conversations.total) * 100)
                    : 0;
                  const color = CHANNEL_COLOR[ch.channel] || '#94a3b8';
                  return (
                    <div key={ch.channel}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 15, color: '#1e293b' }}>{CHANNEL_LABEL[ch.channel] || ch.channel}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color }}>{ch.count} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Row 3: Bot vs Agent + Khách hàng mới */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 24 }}>

          {/* Bot vs Agent */}
          <div style={{
            background: 'white', borderRadius: 12, padding: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>
              Tỷ lệ phản hồi
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 15 }}>🤖 Chatbot tự động</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#2563eb' }}>{stats.messages.botReplies} ({botPct}%)</span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
                  <div style={{ height: '100%', width: `${botPct}%`, background: '#2563eb', borderRadius: 4 }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 15 }}>👨‍💼 Cán bộ tư vấn</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#16a34a' }}>{stats.messages.agentReplies} ({agentPct}%)</span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
                  <div style={{ height: '100%', width: `${agentPct}%`, background: '#16a34a', borderRadius: 4 }} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, fontSize: 14, color: '#94a3b8' }}>
              Tổng {totalReplies} phản hồi từ hệ thống
            </div>
          </div>

          {/* Học sinh mới 7 ngày */}
          <div style={{
            background: 'white', borderRadius: 12, padding: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>
              Học sinh liên hệ mới 7 ngày
            </div>
            <BarChart data={stats.customers.newByDay} color="#7c3aed" />
          </div>
        </div>

        {/* Row 4: Thống kê theo CBTV */}
        <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9', marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Thống kê theo cán bộ tư vấn</div>
          {!stats.byAgent || stats.byAgent.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 15 }}>Chưa có dữ liệu</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Cán bộ tư vấn', 'Được phân công', 'Đang xử lý', 'Đã xong', 'Tin nhắn đã gửi'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Cán bộ tư vấn' ? 'left' : 'center', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.byAgent.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                            {a.display_name.charAt(0).toUpperCase()}
                          </div>
                          {a.display_name}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#1e293b', fontWeight: 600 }}>{a.total_convs}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ background: '#fef3c7', color: '#d97706', borderRadius: 20, padding: '2px 10px', fontWeight: 600, fontSize: 14 }}>{a.open_convs}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 20, padding: '2px 10px', fontWeight: 600, fontSize: 14 }}>{a.closed_convs}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>{a.total_messages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Row 5: Nhãn + Giờ cao điểm */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>

          {/* Theo nhãn */}
          <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Hội thoại theo nhãn</div>
            {!stats.byLabel || stats.byLabel.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 15 }}>Chưa có dữ liệu</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.byLabel.map(item => {
                  const total = stats.byLabel.reduce((s, x) => s + Number(x.count), 0);
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  const COLOR = {
                    'Chưa tư vấn': '#ef4444',
                    'Đang tư vấn': '#f59e0b',
                    'Đã tư vấn xong': '#16a34a',
                    'Chưa có nhãn': '#94a3b8',
                  };
                  const color = COLOR[item.label] || '#64748b';
                  return (
                    <div key={item.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 15, color: '#1e293b' }}>{item.label}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color }}>{item.count} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Giờ cao điểm */}
          <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Giờ cao điểm (tin nhắn đến)</div>
            {!stats.byHour || stats.byHour.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 15 }}>Chưa có dữ liệu</div>
            ) : (() => {
              const full = Array.from({ length: 24 }, (_, h) => {
                const found = stats.byHour.find(x => Number(x.hour) === h);
                return { hour: h, count: found ? Number(found.count) : 0 };
              });
              const max = Math.max(...full.map(d => d.count), 1);
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
                  {full.map(d => {
                    const height = Math.max((d.count / max) * 70, d.count > 0 ? 4 : 0);
                    const hot = d.count === max && d.count > 0;
                    return (
                      <div key={d.hour} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }} title={`${d.hour}:00 — ${d.count} tin`}>
                        <div style={{ width: '100%', height, background: hot ? '#ef4444' : '#2563eb', borderRadius: '3px 3px 0 0', minHeight: d.count > 0 ? 2 : 0, opacity: d.count === 0 ? 0.15 : 1 }} />
                        {d.hour % 6 === 0 && (
                          <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 3 }}>{d.hour}h</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>Cột đỏ = giờ cao điểm nhất. Hover để xem chi tiết.</div>
          </div>

        </div>

      </div>
    </div>
  );
}
