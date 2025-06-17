// src/components/QuestionnaireArchivePage.jsx
import React, { useState, useEffect } from 'react';
import Fuse from 'fuse.js';
import PageWrapper from './PageWrapper';

export default function QuestionnaireArchivePage({ onBack, onNavigate }) {
  const [sites, setSites] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    // TODO: Replace with real IPC call to fetch archive sites
    // Example: window.api.invoke('getArchiveSites')
    const mockSites = [
      { id: 1, name: 'Lab A' },
      { id: 2, name: 'Lab B' },
      { id: 3, name: 'Lab C' }
    ];
    setSites(mockSites);
  }, []);

  // Configure Fuse.js for fuzzy searching of site names
  const fuse = new Fuse(sites, {
    keys: ['name'],
    threshold: 0.3
  });

  const filteredSites = query
    ? fuse.search(query).map(result => result.item)
    : sites;

  return (
    <PageWrapper onBack={onBack} title="Questionnaire Archive">
      {/* Search input */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search sites..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '1rem',
            boxSizing: 'border-box',
            borderRadius: 4,
            border: '1px solid #ccc'
          }}
        />
      </div>

      {/* List of sites */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredSites.map(site => (
          <button
            key={site.id}
            onClick={() => onNavigate('QuestionnaireArchiveSitePage', { siteId: site.id, siteName: site.name })}
            style={{
              textAlign: 'left',
              padding: '10px 12px',
              backgroundColor: '#E2E0E0',
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {site.name}
          </button>
        ))}
      </div>
    </PageWrapper>
  );
}
