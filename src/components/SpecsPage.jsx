// src/components/SpecsPage.jsx
import React, { useState, useEffect } from 'react';
import PageWrapper from './PageWrapper';

import AchitectureAnywhereImg      from '../assets/AchitectureAnywhere.png';
import AntivirusExclClientImg      from '../assets/AntivirusExclClient.png';
import AntivirusExclDBImg          from '../assets/AntivirusExclDB.png';
import ArchitecturePhysicalImg     from '../assets/ArchitecturePhysical.png';
import NetworkRequirementsImg      from '../assets/NetworkRequirements.png';
import PermissionsImg              from '../assets/Permissions.png';
import ServerComponentsImg         from '../assets/ServerComponents.png';
import ServerConfigImg             from '../assets/ServerConfig.png';
import ServerConfigPhysicalImg     from '../assets/ServerConfigPhysical.png';
import ServerSchemesImg            from '../assets/ServerSchemes.png';
import WorkstationsImg             from '../assets/Workstations.png';

// Configuration for each top-level view and its subtabs
const specConfig = {
  server: {
    'Server Components': {
      img: ServerComponentsImg,
      boxes: [
        'Database: ',
        'Application: ',
        'File Server:'
      ]
    },
    'Architecture (Physical)': {
      img: ArchitecturePhysicalImg,
      boxes: [
        "The scanner/s write the digital slides directly to the File Server. All metadata associated with the digital slides is kept on the SQL database server.",
        'Client workstations view the digital slides and metadata by connecting to the Application Server and File Server.',
        'Physical arch detail C'
      ]
    },
    'Architecture (AnyWhere)': {
      img: AchitectureAnywhereImg,
      boxes: [
        'Solution requires a Citrix/ VMware VDI/ RDS virtualized working environment ',
        'For more details about specs of the different components, see DOC-462 GenASIs Anywhere Hardware and Licenses specifications ',
        '…'
      ]
    },
    'Server/s Configurations': {
      img: ServerConfigImg,
      boxes: [
        'SQL Express is supported on Standalone scanner only! As for SQL Express limitations, it cannot be used on virtual server configurations. ',
        'Config B',
        'Config C'
      ]
    },
    'Server Schemes': {
      img: ServerSchemesImg,
      boxes: [
        'Database: ',
        'Application: ',
        'File Server:'
      ]
    },
    'Storage Capacity': {
      img: ServerConfigPhysicalImg,
      boxes: [
        'Database: ',
        'Application: ',
        'File Server:'
      ]
    },
    'Network requirements': {
      img: NetworkRequirementsImg,
      boxes: [
        'Req 1',
        'Req 2',
        'Req 3'
      ]
    },
    'Antivirus Excl.': {
      img: AntivirusExclDBImg,
      boxes: [
        'Exclusion rule 1',
        '…',
        '…'
      ]
    }
  },
  system: {
    'Workstations': {
      img: WorkstationsImg,
      boxes: [
        'Workstation OS',
        'Specs',
        'Notes'
      ]
    },
    'Antivirus Excl.': {
      img: AntivirusExclClientImg,
      boxes: [
        'Exclusion path A',
        '…',
        '…'
      ]
    },
    'Users and Perm.': {
      img: PermissionsImg,
      boxes: [
        'User group A perms',
        'User group B perms',
        '…'
      ]
    }
  }
};

export default function SpecsPage({ onBack }) {
  const [view, setView]     = useState('server');
  const viewConfig          = specConfig[view] || {};
  const subTabs             = Object.keys(viewConfig);
  const [subTab, setSubTab] = useState(subTabs[0] || '');
  const [boxes, setBoxes]   = useState(viewConfig[subTab]?.boxes?.slice() || ['', '', '']);
  const [imageModal, setImageModal] = useState(null);

  useEffect(() => {
    if (!imageModal) return;
    const onKey = (e) => { if (e.key === 'Escape') setImageModal(null); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [imageModal]);

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
    <>
      <PageWrapper onBack={onBack} title="System Specifications">
        {/* Top-level tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', rowGap: '8px', border: '1px solid #000', borderRadius: 4, padding: '8px', marginBottom: '1rem', width: 'fit-content' }}>
          {['server','system'].map(key => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{ backgroundColor: view === key ? '#ccc' : '#E2E0E0', padding: '8px 12px', fontWeight: view === key ? 'bold' : 'normal' }}
            >
              {key === 'server' ? 'Server Specs' : 'System Specs'}
            </button>
          ))}
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', rowGap: '8px', border: '1px solid #000', borderRadius: 4, padding: '6px', marginBottom: '1rem', width: 'fit-content' }}>
          {subTabs.map(label => (
            <button
              key={label}
              onClick={() => setSubTab(label)}
              style={{ backgroundColor: subTab === label ? '#ccc' : '#E2E0E0', padding: '6px 10px', fontWeight: subTab === label ? 'bold' : 'normal' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Image side */}
          <div style={{ flex: 1 }}>
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={subTab}
                style={{ width: '100%', height: 'auto', borderRadius: 4, cursor: 'pointer' }}
                onClick={() => setImageModal(imgSrc)}
              />
            ) : (
              <div style={{ padding: 16, background: '#eee', textAlign: 'center', borderRadius: 4 }}>
                No image available
              </div>
            )}
          </div>

          {/* Text boxes */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {boxes.map((txt, i) => (
              <textarea
                key={i}
                value={txt}
                readOnly
                style={{ width: '100%', padding: 8, minHeight: 80, resize: 'none', boxSizing: 'border-box', background: '#f9f9f9' }}
              />
            ))}
          </div>
        </div>
      </PageWrapper>

      {/* Image Modal Overlay */}
      {imageModal && (
        <div
          onClick={() => setImageModal(null)} 
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999 
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()} 
            style={{
              backgroundColor: '#fff', padding: '1rem', borderRadius: 8,
              maxWidth: '90%', maxHeight: '90%', overflow: 'auto'
            }}
          >
            <button
              onClick={() => setImageModal(null)}
              style={{ float: 'right', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
              aria-label="Close image"
            >
              ✖
            </button>
            {/* Optional tiny hint */}
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Click outside or press Esc to close.</div>
            <img src={imageModal} alt="Enlarged spec diagram" style={{ width: '100%', height: 'auto', borderRadius: 4 }} />
          </div>
        </div>
      )}
    </>
  );
}
