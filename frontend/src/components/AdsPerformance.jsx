import React, { useState, useEffect } from 'react';
import { getCampaigns, createCampaign, updateCampaign, deleteCampaign } from '../api';

export default function AdsPerformance() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', tracking_ref: '', budget_spent: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCampaigns();
      setCampaigns(res.data.data);
    } catch (e) {
      setError('Lỗi khi tải dữ liệu chiến dịch');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateCampaign(editingId, formData);
      } else {
        await createCampaign({ ...formData, platform: 'facebook' });
      }
      setIsModalOpen(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Có lỗi xảy ra');
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setFormData({ name: '', tracking_ref: '', budget_spent: 0 });
    setIsModalOpen(true);
  };

  const openEdit = (camp) => {
    setEditingId(camp.id);
    setFormData({ name: camp.name, tracking_ref: camp.tracking_ref, budget_spent: camp.budget_spent });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc muốn xóa chiến dịch này?')) return;
    try {
      await deleteCampaign(id);
      load();
    } catch (err) {
      alert('Lỗi xóa chiến dịch');
    }
  };

  const formatMoney = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📈 Báo cáo Hiệu suất Ads</h2>
          <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Theo dõi CPL (Cost per Lead) từ quảng cáo Facebook</div>
        </div>
        <button onClick={openAdd} style={{
          padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: 'white',
          border: 'none', fontWeight: 600, cursor: 'pointer',
        }}>+ Thêm Chiến dịch</button>
      </div>

      {loading ? (
        <div style={{ color: '#94a3b8' }}>Đang tải dữ liệu...</div>
      ) : error ? (
        <div style={{ color: '#ef4444' }}>{error}</div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600 }}>Tên chiến dịch</th>
                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600 }}>Tracking Ref / Ad ID</th>
                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, textAlign: 'center' }}>Số KH (Leads)</th>
                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, textAlign: 'right' }}>Chi phí (VND)</th>
                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, textAlign: 'right' }}>CPL</th>
                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: 600, textAlign: 'center' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Chưa có chiến dịch nào</td></tr>
              )}
              {campaigns.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 14 }}><code>{c.tracking_ref}</code></td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                      {c.leads_count}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500, color: '#dc2626' }}>
                    {formatMoney(c.budget_spent)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                    {formatMoney(c.cpl)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginRight: 10 }}>Sửa</button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 12, width: 400, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px' }}>{editingId ? 'Sửa chiến dịch' : 'Thêm chiến dịch mới'}</h3>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Tên chiến dịch</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Tracking Ref / Ad ID</label>
                <input required value={formData.tracking_ref} onChange={e => setFormData({...formData, tracking_ref: e.target.value})} placeholder="VD: ad_xet_tuyen_1" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Nhập tham số ref hoặc ad_id từ Facebook</div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Chi phí đã chạy (VND)</label>
                <input type="number" value={formData.budget_spent} onChange={e => setFormData({...formData, budget_spent: Number(e.target.value)})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}>Hủy</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Lưu lại</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
