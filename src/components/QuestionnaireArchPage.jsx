// src/components/QuestionnaireArchivePage.jsx
import React, { useState, useEffect } from 'react';
import Fuse from 'fuse.js';
import PageWrapper from './PageWrapper';

/**
 * Questionnaire Archive Page
 * - Lists sites with historical questionnaire PDFs (grouped by year)
 * - Fuzzy search on site name
 * - Create modal to add a new PDF (siteName + year + file)
 *
 * The main process must implement IPC handlers:
 *   getArchiveEntries() -> [{ id, siteName, year, filePath }]
 *   addArchiveEntry({ siteName, year, tempPath }) -> inserted row
 *   openArchivePDF({ filePath }) -> opens file with OS
 */
export default function QuestionnaireArchivePage({ onBack }) {
  const [entries, setEntries] = useState([]); // [{id, siteName, year, filePath}]
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ siteName: '', year: '', file: null });
  const [error, setError] = useState('');

  // Load existing entries
  useEffect(() => {
    async function load() {
      try {
        const rows = await window.api.getArchiveEntries();
        setEntries(rows);
      } catch (e) {
        console.error('Failed to load archive entries', e);
      }
    }
    load();
  }, []);

  // Unique site list
  const sites = Array.from(new Set(entries.map(e => e.siteName))).map(name => ({ name }));

  // Fuzzy search
  const fuse = new Fuse(sites, { keys: ['name'], threshold: 0.3 });
  const filteredSites = query ? fuse.search(query).map(r => r.item) : sites;

  // Group entries by site
  const grouped = entries.reduce((acc, e) => {
    (acc[e.siteName] = acc[e.siteName] || []).push(e);
    return acc;
  }, {});

  const openPDF = (filePath) => {
    window.api.openArchivePDF({ filePath });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setForm(f => ({ ...f, file }));
  };

  const resetForm = () => {
    setForm({ siteName: '', year: '', file: null });
    setError('');
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
      // Electron's <input type="file"> provides .path so we can hand it to the main process
      const arrayBuf = await form.file.arrayBuffer();
      const newRow = await window.api.addArchiveEntry({
        siteName: form.siteName.trim(),
        year: yearNum,
        filename: form.file.name,
        buffer: Array.from(new Uint8Array(arrayBuf)) //serialize to plain array
      });
      setEntries(prev => [...prev, newRow]);
      setShowCreate(false);
      resetForm();
    } catch (err) {
      console.error(err);
      setError('Failed to save entry.');
    }
  };

  return (
    <PageWrapper onBack={onBack} title="Questionnaire Archive">
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
                  onClick={() => openPDF(entry.filePath)}
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
          <div style={{ background: '#fff', padding: '1rem', borderRadius: 8, width: '100%', maxWidth: 400 }}>
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
              <input type="file" accept="application/pdf" onChange={handleFileChange} />
              {error && <div style={{ color: 'red', fontSize: '0.85rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" style={{ padding: '6px 12px' }}>Save</button>
                <button type="button" onClick={() => { setShowCreate(false); resetForm(); }} style={{ padding: '6px 12px' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
