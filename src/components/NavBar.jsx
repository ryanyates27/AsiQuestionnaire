// src/components/NavBar.jsx
import React from 'react';

export default function NavBar({ view, onChange }) {
  const tabs = [
    { key: 'search', label: '🔍 Search' },
    { key: 'upload', label: '⬆️ Upload' },
    { key: 'manage', label: '📝 Manage' }
  ];

  return (
    <div style={{ marginBottom: '1rem' }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            marginRight: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: view === tab.key ? '#4a90e2' : '#eee',
            color: view === tab.key ? '#fff' : '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
