// src/components/PageWrapper.jsx
import React from 'react';

export default function PageWrapper({ onBack, title, children }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100%',
      backgroundColor: '#474d7c',
      color: '#fff',
      boxSizing: 'border-box'
    }}>
      <header style={{ padding: '1rem' }}>
        <button
          onClick={onBack}
          style={{
            backgroundColor: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer'
          }}
        >
          ← Back
        </button>
      </header>
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '1rem',
        boxSizing: 'border-box'
      }}>
        <div style={{
          backgroundColor: '#fff',
          color: '#000',
          borderRadius: '8px',
          flex: 1,
          marginBottom: '20px', // keep 20px gap to bottom
          paddingTop: '1rem',
          paddingLeft: '2rem',
          paddingRight: '2rem',
          paddingBottom: '2rem',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {title && <h2 style={{ marginBottom: '1rem' }}>{title}</h2>}
          {/* children will expand inside this container */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
