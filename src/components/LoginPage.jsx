// src/components/LoginPage.jsx
import React, { useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    // Ask main process for login; it returns null on failure
    const user = await window.api.login({ username, password });
    if (!user) {
      setError('Invalid username or password');
    } else {
      onLogin(user);
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

      <form onSubmit={handleSubmit} style={{
        background: '#fff',
        color: '#000',
        padding: '2rem',
        borderRadius: 8,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: 400,
        boxSizing: 'border-box',
      }}>
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
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 4,
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '8px 50px 8px 8px',
              borderRadius: 4,
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
          />
          <div
            onClick={() => setShowPassword(v => !v)}
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(15%)',
              cursor: 'pointer',
              color: '#666',
            }}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </div>
        </div>

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#4caf50',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Log In
        </button>
      </form>
    </div>
  );
}
