// src/components/MainPage.jsx
import React from 'react';

export default function MainPage({ onNavigate }) {
  const tiles = [
    { label: 'Check for a Question', key: 'search' },
    { label: 'System Specs',        key: 'systemSpecs' },
    { label: 'Upload Questions',    key: 'upload' },
    { label: "Site DB's",           key: 'siteDBs' },
    { label: 'Manage Questions',    key: 'manage' },
    { label: 'Documentation',       key: 'documentation' }
  ];

  return (
    <div style={{
      position: 'relative',       // allow absolute children
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      backgroundColor: '#474d7c',
      color: '#fff',
      minHeight: '100vh',
      /* ensure the grid is pushed down */
      paddingTop: '150px',        
      paddingRight: '50px',
      paddingLeft: '50px',
      boxSizing: 'border-box',
    }}>
      {/* ASI Logo */}
      <img
        src="logo.png"
        alt="Applied Spectral Imaging"
        style={{
          width: 200,
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      />

      {/* Tile Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '5rem',
        maxWidth: '1000px',
        width: '100%',
        marginBottom: '3rem'
      }}>
        {tiles.map(tile => (
          <button
            key={tile.key}
            onClick={() => onNavigate(tile.key)}
            style={{
              padding: '1rem 2rem',
              backgroundColor: '#fff',
              color: '#000',
              fontSize: '1rem',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            {tile.label}
          </button>
        ))}
      </div>
    </div>
  );
}
