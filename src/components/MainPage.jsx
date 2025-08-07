// src/components/MainPage.jsx
import React, { useState, useEffect } from 'react';
import { FiSettings } from 'react-icons/fi';

export default function MainPage({ onNavigate, currentUser }) {
  const tiles = [
    { label: 'Check for a Question', key: 'search' },
    { label: 'System Specs',        key: 'systemSpecs' },
    { label: 'Upload Questions',    key: 'upload' },
    { label: 'Questionnaire Archive', key: 'siteDBs' },
    ...(currentUser.role === 'admin'
      ? [{ label: 'Manage Questions', key: 'manage' }]
      : []),
    { label: 'Documentation',       key: 'documentation' }
  ];

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [apiEndpoint, setApiEndpoint]   = useState('');

  // Load existing config on mount
  useEffect(() => {
    window.api.getConfig().then(cfg => {
      setApiEndpoint(cfg.apiEndpoint);
    });
  }, []);

  const saveSettings = async () => {
    await window.api.setConfig({ apiEndpoint });
    setShowSettings(false);
  };

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      backgroundColor: '#474d7c',
      color: '#fff',
      minHeight: '100vh',
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

      {/* Settings Gear */}
      <FiSettings
        size={28}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          color: '#fff',
          cursor: 'pointer'
        }}
        onClick={() => setShowSettings(true)}
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

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff',
            color: '#000',
            padding: '1.5rem',
            borderRadius: 8,
            width: '90%',
            maxWidth: 400,
            boxSizing: 'border-box'
          }}>
            <h3 style={{ marginTop: 0 }}>Settings</h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: 4 }}>
                API Endpoint:
              </label>
              <input
                type="text"
                value={apiEndpoint}
                onChange={e => setApiEndpoint(e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  padding: '6px 12px',
                  background: '#e2e0e0',
                  border: '1px solid #999',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                style={{
                  padding: '6px 12px',
                  background: '#4caf50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
