// src/components/SpecsPage.jsx
import React, { useState, useEffect } from 'react';
import PageWrapper from './PageWrapper';

// Configuration for each top‑level view and its subtabs
const specConfig = {
  server: {
    'Server Components': {
      img: '/server-components.png',
      boxes: ['Component 1 details…', 'Component 2 details…', 'Component 3 details…']
    },
    'Architecture (Physical)': {
      img: '/architecture-physical.png',
      boxes: ['Physical arch detail A', 'Physical arch detail B', 'Physical arch detail C']
    },
    'Architecture (AnyWhere)': {
      img: '/architecture-anywhere.png',
      boxes: ['AnyWhere arch detail A', '…', '…']
    },
    'Server/s Configurations': {
      img: '/server-configs.png',
      boxes: ['Config A', 'Config B', 'Config C']
    },
    'Network requirements': {
      img: '/network-reqs.png',
      boxes: ['Req 1', 'Req 2', 'Req 3']
    },
    'Antivirus Excl.': {
      img: '/antivirus-excl.png',
      boxes: ['Exclusion rule 1', '…', '…']
    },
  },
  system: {
    'Workstations': {
      img: '/workstations.png',
      boxes: ['Workstation OS', 'Specs', 'Notes']
    },
    'Antivirus Excl.': {
      img: '/system-antivirus-excl.png',
      boxes: ['Exclusion path A', '…', '…']
    },
    'Users and Perm.': {
      img: '/users-perms.png',
      boxes: ['User group A perms', 'User group B perms', '…']
    },
  }
};

export default function SpecsPage({ onBack }) {
  const [view, setView]     = useState('server');
  const viewConfig          = specConfig[view] || {};
  const subTabs             = Object.keys(viewConfig);
  const [subTab, setSubTab] = useState(subTabs[0] || '');
  const [boxes, setBoxes]   = useState(viewConfig[subTab]?.boxes?.slice() || ['', '', '']);

  // Reset subTab and boxes when view changes
  useEffect(() => {
    const newSubTabs = Object.keys(specConfig[view] || {});
    const first      = newSubTabs[0] || '';
    setSubTab(first);
    setBoxes((specConfig[view]?.[first]?.boxes || ['', '', '']).slice());
  }, [view]);

  // Update boxes when subTab changes
  useEffect(() => {
    setBoxes((specConfig[view]?.[subTab]?.boxes || ['', '', '']).slice());
  }, [view, subTab]);

  const imgSrc = specConfig[view]?.[subTab]?.img || '';

  const handleBoxChange = (i, val) =>
    setBoxes(prev => prev.map((b, idx) => idx === i ? val : b));

  return (
    <PageWrapper onBack={onBack} title="System Specifications">
      {/* Top-level tabs container */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        rowGap: '8px',
        border: '1px solid #000',
        borderRadius: 4,
        padding: '8px',
        marginBottom: '1rem',
        width: 'fit-content'
      }}>
        {['server','system'].map(key => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              backgroundColor: view === key ? '#ccc' : '#E2E0E0',
              padding: '8px 12px',
              fontWeight: view === key ? 'bold' : 'normal'
            }}
          >
            {key === 'server' ? 'Server Specs' : 'System Specs'}
          </button>
        ))}
      </div>

      {/* Sub-tabs container */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        rowGap: '8px',
        border: '1px solid #000',
        borderRadius: 4,
        padding: '6px',
        marginBottom: '1rem',
        width: 'fit-content'
      }}>
        {subTabs.map(label => (
          <button
            key={label}
            onClick={() => setSubTab(label)}
            style={{
              backgroundColor: subTab === label ? '#ccc' : '#E2E0E0',
              padding: '6px 10px',
              fontWeight: subTab === label ? 'bold' : 'normal'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Image on the left */}
        <div style={{ flex: 1 }}>
          {imgSrc
            ? <img src={imgSrc} alt={subTab} style={{ width: '100%', height: 'auto', borderRadius: 4 }} />
            : <div style={{ padding: 16, background: '#eee', textAlign: 'center', borderRadius: 4 }}>
                No image available
              </div>
          }
        </div>

        {/* Three textboxes on the right */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {boxes.map((txt, i) => (
            <textarea
              key={i}
              value={txt}
              onChange={e => handleBoxChange(i, e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                minHeight: 80,
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
