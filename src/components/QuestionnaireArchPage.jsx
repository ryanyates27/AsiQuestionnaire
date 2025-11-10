// src/components/QuestionnaireArchivePage.jsx
// UPDATED: PDF.js viewer + Drag-and-Drop only (removed plain <input type="file"> button)

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import PageWrapper from './PageWrapper';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// -----------------------------------------------------------------------------
// Lightweight PDF.js canvas renderer
// -----------------------------------------------------------------------------
function PDFCanvasViewer({ dataUrl }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!dataUrl || !containerRef.current) return;

    (async () => {
      try {
        containerRef.current.innerHTML = '';
        const pdf = await pdfjsLib.getDocument({ url: dataUrl }).promise;
        const pageCount = pdf.numPages;
        for (let p = 1; p <= pageCount; p++) {
          if (cancelled) break;
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 1.0 });
          const targetWidth = containerRef.current.clientWidth || 900;
          const scale = targetWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 12px auto';
          canvas.width = Math.floor(scaledViewport.width);
          canvas.height = Math.floor(scaledViewport.height);

          await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
          containerRef.current.appendChild(canvas);
        }
      } catch (err) {
        console.error('PDF render failed', err);
        containerRef.current.innerHTML = '<div style="padding:12px;color:#900;">Unable to render PDF.</div>';
      }
    })();

    return () => { cancelled = true; };
  }, [dataUrl]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: '#f7f7f7',
        padding: 8,
        boxSizing: 'border-box'
      }}
    />
  );
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function QuestionnaireArchivePage({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ siteName: '', year: '', file: null });
  const [error, setError] = useState('');

  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg, ms = 2500) => {
    setToastMsg(msg);
    if (ms) setTimeout(() => setToastMsg(''), ms);
  };

  const [previewing, setPreviewing] = useState(false);
  const [selected, setSelected] = useState(null);

  // Drag-and-drop helpers
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const rows = await window.api.getArchiveEntries();
        setEntries(rows || []);
      } catch (e) {
        console.error('Failed to load archive entries', e);
        showToast('Failed to load archive entries.', 3000);
      }
    }
    load();
  }, []);

  const sites = useMemo(
    () => Array.from(new Set(entries.map(e => e.siteName))).map(name => ({ name })),
    [entries]
  );

  const fuse = useMemo(() => new Fuse(sites, { keys: ['name'], threshold: 0.3 }), [sites]);
  const filteredSites = query ? fuse.search(query).map(r => r.item) : sites;

  const grouped = useMemo(
    () =>
      entries.reduce((acc, e) => {
        (acc[e.siteName] = acc[e.siteName] || []).push(e);
        return acc;
      }, {}),
    [entries]
  );

  const openPDF = (filePath) => {
    window.api.openArchivePDF({ filePath });
  };

  const handleFileChange = (e) => {
    const file = e?.target?.files?.[0] || e?.file || null;
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf) {
      setError('Please choose a PDF file.');
      return;
    }
    setError('');
    setForm(f => ({ ...f, file }));
  };

  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    handleFileChange({ file });
  };

  const resetForm = () => {
    setForm({ siteName: '', year: '', file: null });
    setError('');
    setDragActive(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.siteName.trim() || !form.year || !form.file) {
      setError('All fields are required.');
      return;
    }
    const yearNum = Number(form.year);
    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum) || yearNum < 1990 || yearNum > currentYear + 1) {
      setError('Enter a valid year.');
      return;
    }

    try {
      const arrayBuf = await form.file.arrayBuffer();
      const newRow = await window.api.addArchiveEntry({
        siteName: form.siteName.trim(),
        year: yearNum,
        filename: form.file.name,
        buffer: Array.from(new Uint8Array(arrayBuf))
      });
      setEntries(prev => [...prev, newRow]);
      setShowCreate(false);
      resetForm();
      showToast('PDF saved to archive.');
    } catch (err) {
      console.error(err);
      setError('Failed to save entry.');
      showToast('Failed to save entry.', 3000);
    }
  };

  useEffect(() => {
    if (!showCreate) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowCreate(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate]);

  const handlePreview = async (entry) => {
    setSelected(entry);
    setPreviewing(true);
    try {
      const r2 = await window.api.getArchivePreviewDataUrl({ id: entry.id });
      if (r2?.ok && r2?.dataUrl) {
        setSelected(prev => ({ ...prev, previewDataUrl: r2.dataUrl }));
        return;
      }
    } catch {}
    try {
      const r = await window.api.getArchivePreviewUrl({ id: entry.id });
      if (r?.ok && r?.href) {
        setSelected(prev => ({ ...prev, previewHref: r.href }));
      }
    } catch {}
  };

  const handleOpenFull = () => {
    if (selected?.filePath) openPDF(selected.filePath);
  };

  const handleDownload = async () => {
    if (!selected) return;
    try {
      await window.api.downloadArchiveEntry({ id: selected.id });
      showToast('Download started.');
    } catch (e) {
      console.error('Download failed', e);
      showToast('Download failed.', 3000);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    const ok = window.confirm(`Delete "${selected.siteName} - ${selected.year}" from archive?`);
    if (!ok) return;
    try {
      await window.api.removeArchiveEntry({ id: selected.id });
      setEntries(prev => prev.filter(e => e.id !== selected.id));
      setPreviewing(false);
      setSelected(null);
      showToast('Entry deleted.');
    } catch (e) {
      console.error('Delete failed', e);
      showToast('Delete failed.', 3000);
    }
  };

  useEffect(() => {
    if (!previewing) return;
    const onKey = (e) => { if (e.key === 'Escape') { setPreviewing(false); setSelected(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewing]);

  return (
    <PageWrapper onBack={onBack} title="Questionnaire Archive">
      {toastMsg && (
        <div style={{
          position: 'absolute', top: 10, right: 20, zIndex: 9999,
          background: '#333', color: '#fff', padding: '8px 12px', borderRadius: 6
        }}>
          {toastMsg}
        </div>
      )}

      {/* Search + Create */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search sites..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1, padding: '8px', fontSize: '1rem', boxSizing: 'border-box', borderRadius: 4, border: '1px solid #ccc' }}
        />
        <button onClick={() => { resetForm(); setShowCreate(true); }} style={{ padding: '8px 12px' }}>Create</button>
      </div>

      {/* Sites + Years */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredSites.map(site => (
          <div key={site.name} style={{ border: '1px solid #ccc', borderRadius: 4, padding: '8px', background: '#F5F4F4' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{site.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(grouped[site.name] || []).sort((a, b) => b.year - a.year).map(entry => (
                <button
                  key={entry.id}
                  onClick={() => handlePreview(entry)}
                  title="Preview PDF"
                  style={{ padding: '6px 10px', background: '#E2E0E0', border: '1px solid #bbb', borderRadius: 4, cursor: 'pointer' }}
                >
                  {entry.year}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 8, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>New Questionnaire PDF</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="Site Name"
                value={form.siteName}
                onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))}
                style={{ padding: 6 }}
              />
              <input
                type="number"
                placeholder="Year"
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                style={{ padding: 6 }}
              />

              {/* Hidden file input only used programmatically */}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              {/* Drag & Drop Zone (also opens file dialog on click) */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                  marginTop: 6,
                  padding: '16px',
                  borderRadius: 8,
                  border: `2px dashed ${dragActive ? '#3b82f6' : '#bbb'}`,
                  background: dragActive ? 'rgba(59,130,246,0.06)' : '#fafafa',
                  color: '#444',
                  textAlign: 'center',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                title="Drop a PDF here or click to choose"
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Drag & drop your PDF here</div>
                <div style={{ fontSize: '0.9rem' }}>or click to choose a file</div>
              </div>

              {form.file && (
                <div style={{ fontSize: '0.9rem', color: '#333' }}>
                  Selected: <strong>{form.file.name}</strong>
                </div>
              )}

              {error && <div style={{ color: 'red', fontSize: '0.85rem' }}>{error}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" style={{ padding: '6px 12px' }}>Save</button>
                <button type="button" onClick={() => { setShowCreate(false); resetForm(); }} style={{ padding: '6px 12px' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewing && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', width: '95%', maxWidth: 1000, height: '90vh', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #eee' }}>
              <div style={{ fontWeight: 600, flex: 1 }}>
                {selected.siteName} • {selected.year}
              </div>
              <button onClick={handleDownload} style={{ padding: '6px 10px' }}>Download</button>
              <button onClick={handleDelete} style={{ padding: '6px 10px', background: '#ffe9e9', border: '1px solid #f2b3b3' }}>Delete</button>
              <button onClick={handleOpenFull} style={{ padding: '6px 10px' }}>Open</button>
              <button onClick={() => { setPreviewing(false); setSelected(null); }} style={{ padding: '6px 10px' }}>Close</button>
            </div>
      
            {/* CHANGED: make the preview area scrollable */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',    // <-- enables scrolling
                background: '#f7f7f7',
                padding: '8px 0'
              }}
            >
              {selected.previewDataUrl ? (
                <PDFCanvasViewer dataUrl={selected.previewDataUrl} />
              ) : selected.previewHref ? (
                <embed
                  key={`href-${selected.id}`}
                  src={selected.previewHref}
                  type="application/pdf"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              ) : (
                <div style={{ padding: 16, color: '#555' }}>Loading preview…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
