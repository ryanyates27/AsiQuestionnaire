// src/components/UploadPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import PageWrapper from './PageWrapper';

const subtypeOptions = {
  Database: ['Logs', 'Transfers', 'Backups', 'Fill Later'],
  Business: ['Assessment', 'Employee', 'Procedures', 'Security'],
  Software: ['Patches', 'Logs', 'Access', 'Connectivity'],
  System:   ['Security', 'Design', 'Logs', 'Users'],
};

export default function UploadPage({ onBack }) {
  const [form, setForm] = useState({
    siteName: '',
    type: 'Database',
    subtype: '',
    question: '',
    answer: '',
    additionalInfo: ''
  });
  const [siteLock, setSiteLock] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const [saving, setSaving]         = useState(false); 

  const [sessionUploads, setSessionUploads] = useState([]);

  const questionRef = useRef(null);
  const answerRef   = useRef(null);
  const infoRef     = useRef(null);                   

  // Load from main process memory once
  useEffect(() => {
    (async () => {
      try {
        const list = await window.api.getSessionUploads();
        if (Array.isArray(list)) setSessionUploads(list);
      } catch (e) {
        console.error('Failed to load session uploads', e);
      }
    })();
  }, []);

  // Resize helpers
  const autoResize = el => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => { autoResize(questionRef.current); }, [form.question]);
  useEffect(() => { autoResize(answerRef.current);   }, [form.answer]);
  useEffect(() => { autoResize(infoRef.current);     }, [form.additionalInfo]); 

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };
  const handleTypeChange = newType => {
    setForm(prev => ({ ...prev, type: newType, subtype: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;         
    setSaving(true);            
    try {
      const payload = {
        siteName:       form.siteName,
        tag:            form.type,
        subtag:         form.subtype,
        question:       form.question,
        answer:         form.answer,
        additionalInfo: form.additionalInfo
      };

      const created = await window.api.addQuestion(payload);
      setSuccessMsg(`✅ Question #${created.id} saved!`);
      setErrorMsg(''); // CHANGED: clear any prior error

      const newRow = { id: created.id, ...payload };

      // Update local state + persist
      setSessionUploads(prev => [...prev, newRow]);
      await window.api.addSessionUpload(newRow);

      // Reset form (respect site lock)
      setForm({
        siteName:       siteLock ? form.siteName : '',
        type:           'Database',
        subtype:        '',
        question:       '',
        answer:         '',
        additionalInfo: ''
      });

      // Auto-clear success after a bit
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      setErrorMsg('Failed to save question'); 
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSaving(false);         
    }
  };

  return (
    <PageWrapper onBack={onBack} title="Upload Questions">
      {/* Inline success/error banners (non-blocking) */}
      {successMsg && (
        <div style={{
          backgroundColor: '#e0ffe0',
          border: '1px solid #4caf50',
          padding: 10,
          marginBottom: '1rem',
          borderRadius: 4
        }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{
          background:'#ffecec',
          border:'1px solid #f3c2c2',
          padding:'8px 12px',
          borderRadius:6,
          marginBottom:12
        }}>
          {errorMsg}
        </div>
      )}

      <div style={{
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 8,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 3fr',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div>
              {/* Site Name + lock */}
              <label style={{ display: 'block', marginBottom: 4 }}><strong>Site Name:</strong></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  required
                  disabled={siteLock}
                  value={form.siteName}
                  onChange={e => handleChange('siteName', e.target.value)}
                  style={{ flexGrow: 1, padding: 8 }}
                />
                <button
                  type="button"
                  onClick={() => setSiteLock(l => !l)}
                  title={siteLock ? 'Unlock site name' : 'Lock site name'}
                  style={{
                    background: 'none',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    height: 32,
                    width: 32,
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 0
                  }}
                >
                  {siteLock ? '🔒' : '🔓'}
                </button>
              </div>

              {/* Type & Subtype */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
                <div style={{ border: '1px solid #ccc', padding: '0.75rem', borderRadius: 4 }}>
                  <strong>Type:</strong>
                  {Object.keys(subtypeOptions).map(opt => (
                    <label key={opt} style={{ display: 'block', margin: '0.25rem 0' }}>
                      <input
                        type="radio"
                        name="type"
                        value={opt}
                        checked={form.type === opt}
                        onChange={() => handleTypeChange(opt)}
                        style={{ marginRight: 4 }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
                <div style={{ border: '1px solid #ccc', padding: '0.75rem', borderRadius: 4 }}>
                  <strong>Subtype:</strong>
                  {subtypeOptions[form.type].map(sub => (
                    <label key={sub} style={{ display: 'block', margin: '0.25rem 0' }}>
                      <input
                        type="radio"
                        name="subtype"
                        value={sub}
                        checked={form.subtype === sub}
                        onChange={() => handleChange('subtype', sub)}
                        style={{ marginRight: 4 }}
                      />
                      {sub}
                    </label>
                  ))}
                </div>
              </div>

              {/* Question & Answer */}
              <label style={{ display: 'block', margin: '1rem 0 0.5rem' }}><strong>Question:</strong></label>
              <textarea
                ref={questionRef}
                required
                value={form.question}
                onChange={e => handleChange('question', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  overflow: 'hidden',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />

              <label style={{ display: 'block', margin: '1rem 0 0.5rem' }}><strong>Answer:</strong></label>
              <textarea
                ref={answerRef}
                required
                value={form.answer}
                onChange={e => handleChange('answer', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  overflow: 'hidden',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Additional Info */}
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}><strong>Additional Information:</strong></label>
              <textarea
                ref={infoRef}                                         
                value={form.additionalInfo}
                onChange={e => handleChange('additionalInfo', e.target.value)}
                style={{
                  width: '99%',
                  minHeight: 120,                                     
                  padding: 8,
                  overflow: 'hidden',
                  resize: 'none',                                     
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}                                         
            style={{
              backgroundColor: saving ? '#8abf8d' : '#4caf50',       
              color: '#fff',
              padding: '10px 20px',
              border: 'none',
              borderRadius: 4,
              cursor: saving ? 'not-allowed' : 'pointer'             
            }}
          >
            {saving ? 'Saving…' : 'Submit Question'}                  
          </button>
        </form>
      </div>

      {/* Current List (session only) */}
      <div style={{
        marginTop: 20,
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 8,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3>Current List</h3>
        {sessionUploads.length === 0 ? (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            No questions uploaded this session.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#ddd' }}>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Question</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Answer</th>
              </tr>
            </thead>
            <tbody>
              {sessionUploads.map(q => (
                <tr key={q.id}>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{q.question}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{q.answer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageWrapper>
  );
}
