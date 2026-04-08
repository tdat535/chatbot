import React, { useState, useEffect, useRef } from 'react';
import { trainChatbot, trainChatbotUrl, getChunks } from '../api.js';

function ChunkItem({ chunk }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = chunk.full && chunk.full.length > 120;
  return (
    <div style={{
      padding: '9px 14px', borderRadius: 8,
      border: '1px solid #e2e8f0', background: '#f8fafc',
      transition: 'border-color .12s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#bfdbfe'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: chunk.full ? 3 : 0 }}>
        {chunk.heading}
      </div>
      {chunk.full && (
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {expanded ? chunk.full : chunk.full.slice(0, 120) + (hasMore ? '...' : '')}
        </div>
      )}
      {hasMore && (
        <button onClick={() => setExpanded(v => !v)} style={{
          marginTop: 4, fontSize: 13, color: '#2563eb', background: 'none',
          border: 'none', cursor: 'pointer', padding: 0,
        }}>
          {expanded ? 'Thu gọn' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}

export default function BotTraining() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [chunksLoading, setChunksLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const fileRef = useRef(null);

  const loadChunks = async () => {
    setChunksLoading(true);
    try {
      const res = await getChunks();
      setChunks(res.data.chunks || []);
    } catch {
      setChunks([]);
    }
    setChunksLoading(false);
  };

  useEffect(() => { loadChunks(); }, []);

  const handleTrainUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setResult(null);
    try {
      const res = await trainChatbotUrl(urlInput.trim());
      setResult({ ok: true, ...res.data });
      setUrlInput('');
      await loadChunks();
    } catch (e) {
      setResult({ ok: false, error: e.response?.data?.detail || e.message });
    }
    setUrlLoading(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await trainChatbot(form);
      setResult({ ok: true, ...res.data });
      await loadChunks();
    } catch (e) {
      setResult({ ok: false, error: e.response?.data?.detail || e.message });
    }
    setUploading(false);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const filtered = chunks.filter(c =>
    !search ||
    c.heading.toLowerCase().includes(search.toLowerCase()) ||
    (c.full || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' }}>

      {/* Top: upload area - fixed height */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: '#0f172a' }}>Huấn luyện Bot</h2>

          <div style={{
            background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
            padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  flex: 1, minWidth: 220, padding: '12px 16px',
                  border: `2px dashed ${file ? '#86efac' : '#e2e8f0'}`,
                  borderRadius: 10, background: file ? '#f0fdf4' : '#f8fafc',
                  textAlign: 'center', cursor: 'pointer', transition: 'all .15s',
                }}
              >
                <input ref={fileRef} type="file" accept=".txt,.pdf" style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0] || null)} />
                <div style={{ fontSize: 22, marginBottom: 4 }}>{file ? '📄' : '📁'}</div>
                <div style={{ fontSize: 15, color: file ? '#16a34a' : '#64748b', fontWeight: file ? 600 : 400 }}>
                  {file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : 'Nhấn để chọn file .txt hoặc .pdf'}
                </div>
              </div>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                style={{
                  padding: '11px 22px', borderRadius: 10, fontSize: 16, fontWeight: 600,
                  border: 'none', cursor: file && !uploading ? 'pointer' : 'not-allowed',
                  background: file && !uploading ? '#2563eb' : '#e2e8f0',
                  color: file && !uploading ? 'white' : '#94a3b8',
                  flexShrink: 0,
                }}
              >
                {uploading ? 'Đang huấn luyện...' : 'Upload & Train'}
              </button>
            </div>

            {/* Train từ URL */}
            <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                Hoặc train từ link trang web
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTrainUrl()}
                  placeholder="https://www.viendong.edu.vn/"
                  style={{
                    flex: 1, padding: '9px 12px', border: '1px solid #e2e8f0',
                    borderRadius: 8, fontSize: 15, outline: 'none',
                  }}
                />
                <button
                  onClick={handleTrainUrl}
                  disabled={!urlInput.trim() || urlLoading}
                  style={{
                    padding: '9px 18px', borderRadius: 8, fontSize: 15, fontWeight: 600,
                    border: 'none', cursor: urlInput.trim() && !urlLoading ? 'pointer' : 'not-allowed',
                    background: urlInput.trim() && !urlLoading ? '#0ea5e9' : '#e2e8f0',
                    color: urlInput.trim() && !urlLoading ? 'white' : '#94a3b8',
                    flexShrink: 0,
                  }}
                >
                  {urlLoading ? 'Đang scrape...' : 'Train từ URL'}
                </button>
              </div>
            </div>

            {result && (
              <div style={{
                marginTop: 12, padding: '9px 14px', borderRadius: 8,
                background: result.ok ? '#f0fdf4' : '#fff5f5',
                border: `1px solid ${result.ok ? '#bbf7d0' : '#fee2e2'}`,
                fontSize: 15, color: result.ok ? '#15803d' : '#dc2626',
              }}>
                {result.ok ? result.message : `Lỗi: ${result.error}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: chunks list - fill remaining height */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px 20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#f8fafc',
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                Nội dung đã huấn luyện
                {!chunksLoading && (
                  <span style={{
                    marginLeft: 8, fontSize: 13, fontWeight: 500,
                    background: '#dbeafe', color: '#1d4ed8',
                    borderRadius: 20, padding: '2px 8px',
                  }}>{chunks.length} đoạn</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm kiếm..."
                  style={{
                    padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 8,
                    fontSize: 14, width: 180, outline: 'none',
                  }}
                />
                <button onClick={loadChunks} title="Làm mới" style={{
                  padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 8,
                  background: 'white', cursor: 'pointer', fontSize: 15, color: '#64748b',
                }}>↻</button>
              </div>
            </div>

            {/* Scrollable list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chunksLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', padding: '40px 0' }}>Đang tải...</div>
              ) : filtered.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', padding: '40px 0' }}>
                  {search ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu huấn luyện'}
                </div>
              ) : filtered.map(chunk => (
                <ChunkItem key={chunk.id} chunk={chunk} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
