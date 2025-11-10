// src/components/LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function LoginPage({ onLogin }) {
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPwd]  = useState(false);
  const [error, setError]           = useState('');

  // CHANGED: sync state comes from main process (single source of truth)
  const [sync, setSync]             = useState({ phase: 'idle', message: '' }); // CHANGED

  // CHANGED: subscribe to sync state + get initial value (no polling)
  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const s = await window.api?.sync?.getState?.();
        if (s) setSync(s);
      } catch {}
      if (window.api?.sync?.onState) {
        unsub = window.api.sync.onState((state) => setSync(state || { phase: 'idle', message: '' }));
      }
    })();
    return () => unsub?.();
  }, []); // CHANGED

  // CHANGED: block login while checking/syncing
  const isBlocked = sync.phase === 'checking' || sync.phase === 'syncing'; // CHANGED

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isBlocked) return; // CHANGED: do nothing while busy

    const user = await window.api.login({ username, password });
    if (!user) setError('Invalid username or password');
    else onLogin(user);
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
        style={{ width: 200, position: 'absolute', top: 0, left: 0 }}
      />

      {/* Sync status banner (purely presentational) */}
      <div style={{ position: 'absolute', top: 100, maxWidth: 600, width: 'calc(100% - 100px)' }}>
        {sync.phase === 'checking' && (
          <div style={{ background: '#2a2f57', padding: '10px 14px', borderRadius: 6 }}>
            Checking server…
          </div>
        )}
        {sync.phase === 'syncing' && (
          <div style={{ background: '#2a2f57', padding: '10px 14px', borderRadius: 6 }}>
            Syncing… please wait. {sync.message}
          </div>
        )}
        {sync.phase === 'offline' && (
          <div style={{ background: '#7d4b12', padding: '10px 14px', borderRadius: 6 }}>
            {sync.message}
          </div>
        )}
        {sync.phase === 'ok' && (
          <div style={{ background: '#2b6b2b', padding: '10px 14px', borderRadius: 6 }}>
            {sync.message}
          </div>
        )}
        {sync.phase === 'error' && (
          <div style={{ background: '#7a1f1f', padding: '10px 14px', borderRadius: 6 }}>
            {sync.message}{' '}
            <button
              onClick={() => window.api.sync.start()}
              style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 4, border: 'none', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          color: '#000',
          padding: '2rem',
          borderRadius: 8,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: 400,
          boxSizing: 'border-box',
          opacity: isBlocked ? 0.6 : 1,              // CHANGED: visual cue
          pointerEvents: isBlocked ? 'none' : 'auto', // CHANGED: block interactions while busy
        }}
      >
        <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Log In</h2>

        {error && (
          <div style={{ color: 'crimson', textAlign: 'center', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Username</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px 50px 8px 8px', borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
          <div
            onClick={() => setShowPwd(v => !v)}
            style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(15%)', cursor: 'pointer', color: '#666' }}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </div>
        </div>

        <button
          type="submit"
          disabled={isBlocked} // CHANGED
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: isBlocked ? '#8abf8d' : '#4caf50', // CHANGED
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: isBlocked ? 'not-allowed' : 'pointer', // CHANGED
            fontSize: '1rem',
          }}
        >
          {isBlocked ? 'Syncing…' : 'Log In'} {/* CHANGED */}
        </button>
      </form>
    </div>
  );
}
