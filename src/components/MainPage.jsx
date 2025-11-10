// src/components/MainPage.jsx
import React, { useState, useEffect } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

export default function MainPage({ onNavigate, currentUser }) {
  const tiles = [
    { label: 'Check for a Question',   key: 'search' },
    { label: 'System Specs',           key: 'systemSpecs' },
    { label: 'Upload Questions',       key: 'upload' },
    { label: 'Questionnaire Archive',  key: 'siteDBs' },
    ...(currentUser.role === 'admin' ? [{ label: 'Manage Questions', key: 'manage' }] : []),
  ];

  // Config (kept if other code reads it)
  const [apiEndpoint, setApiEndpoint] = useState('');

  // Sync UI
  const [syncing, setSyncing]     = useState(false); // CHANGED
  const [syncMsg, setSyncMsg]     = useState('');    // CHANGED
  const [syncState, setSyncState] = useState(null);  // CHANGED
  const offline = (syncState?.phase === 'offline');  // CHANGED

  // Toast (non-blocking banner)
  const [toast, setToast] = useState('');            // ADDED
  const showToast = (msg, ms = 3000) => {            // ADDED
    setToast(msg);
    if (ms) setTimeout(() => setToast(''), ms);
  };

  useEffect(() => {
    if (window.api?.getConfig) {
      window.api.getConfig().then(cfg => {
        if (cfg?.apiEndpoint) setApiEndpoint(cfg.apiEndpoint);
      }).catch(() => {});
    }
  }, []);

  // Subscribe to sync state
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const initial = await window.api?.sync?.getState?.();
        if (initial) setSyncState(initial);
      } catch {}
      if (window.api?.sync?.onState) {
        unsub = window.api.sync.onState((state) => setSyncState(state));
      }
    })();
    return () => unsub?.();
  }, []);

  // Manual Sync (non-blocking)
  const runManualSync = async () => {
    if (syncing) return; // CHANGED: ignore double-clicks

    if (offline) {
      // CHANGED: replace alert with toast
      showToast('You are offline. Connect to the network to sync.');
      return;
    }

    setSyncing(true);
    setSyncMsg('Syncing from server…');

    try {
      if (window.api?.sync?.pull) {
        await window.api.sync.pull();
      } else if (window.api?.syncNow) {
        await window.api.syncNow({ silent: false });
      } else if (window.api?.runInitialSync) {
        await window.api.runInitialSync({ silent: false });
      } else if (window.api?.invoke) {
        await window.api.invoke('sync.pull');
      } else {
        console.warn('[MainPage] No sync bridge exposed on window.api.');
        // CHANGED: toast instead of alert
        showToast('Sync not available: missing IPC bridge. Ask IT to expose sync.pull.', 5000);
        setSyncMsg(''); // CHANGED
        return;
      }

      setSyncMsg('Sync complete.');
      setTimeout(() => setSyncMsg(''), 1500);
    } catch (e) {
      console.error('[MainPage] Manual sync failed:', e);
      setSyncMsg('Sync failed.');
      setTimeout(() => setSyncMsg(''), 2500);
      // CHANGED: toast instead of alert
      showToast('Sync failed. Check console for details.', 4000);
    } finally {
      setSyncing(false);
    }
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
      <img src="logo.png" alt="Applied Spectral Imaging"
           style={{ width: 200, position: 'absolute', top: 0, left: 0 }} />

      {/* Toast (top-right) — non-blocking, auto-clears */}
      {toast && ( // ADDED
        <div style={{
          position: 'absolute', top: 16, right: 16 + 140, // keep away from sync icon
          background: '#333', color: '#fff',
          padding: '8px 12px', borderRadius: 6, maxWidth: 320
        }}>
          {toast}
        </div>
      )}

      {/* Spin keyframes */}
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>

      {/* Manual Sync Icon (disabled when offline) */}
      <div
        title={offline ? 'Offline' : (syncing ? 'Syncing…' : 'Manual Sync')}
        onClick={runManualSync}
        style={{
          position: 'absolute', top: 16, right: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: (syncing || offline) ? 'not-allowed' : 'pointer',
          opacity: offline ? 0.4 : (syncing ? 0.7 : 1),
          userSelect: 'none'
        }}
        aria-disabled={(syncing || offline) ? 'true' : 'false'}
      >
        <FiRefreshCw
          size={28}
          style={{
            color: '#fff',
            animation: syncing ? 'spin 1s linear infinite' : 'none',
            filter: offline ? 'grayscale(100%)' : 'none',
          }}
        />
        <span style={{ fontSize: 12, color: '#fff' }}>
          {offline ? 'Offline' : (syncMsg || 'Sync')}
        </span>
      </div>

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
