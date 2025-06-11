// src/components/UploadPage.jsx
import React, { useState, useEffect } from 'react';
import PageWrapper from './PageWrapper';

const subtypeOptions = {
  Database: ['Logs', 'Transfers', 'Backups', 'Fill Later'],
  Business: ['Assessment', 'Employee', 'Procedures', 'Security'],
  Software: ['Patches', 'Logs', 'Access', 'Connectivity'],
  System: ['Security', 'Design', 'Logs', 'Users']
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
  const [successMsg, setSuccessMsg] = useState('');
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await window.api.getQuestions('');
        setQuestions(data);
      } catch (err) {
        console.error('Error loading questions:', err);
      }
    })();
  }, []);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleTypeChange = (newType) => {
    setForm(prev => ({ ...prev, type: newType, subtype: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const created = await window.api.addQuestion({
        siteName: form.siteName,
        tag: form.type,
        subtag: form.subtype,
        question: form.question,
        answer: form.answer,
        additionalInfo: form.additionalInfo
      });
      setSuccessMsg(`✅ Question #${created.id} saved!`);
      const updated = await window.api.getQuestions('');
      setQuestions(updated);
      setForm({ siteName: '', type: 'Database', subtype: '', question: '', answer: '', additionalInfo: '' });
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save question');
    }
  };

  return (
    <PageWrapper onBack={onBack} title="Upload Questions">
      {successMsg && (
        <div style={{ backgroundColor: '#e0ffe0', border: '1px solid #4caf50', padding: '10px', marginBottom: '1rem', borderRadius: '4px' }}>
          {successMsg}
        </div>
      )}

      <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '2rem', marginBottom: '1.5rem' }}>
            <div>
              {/* Site Name */}
              <label style={{ display: 'block', marginBottom: '0.5rem' }}><strong>Site Name:</strong></label>
              <input
                type="text"
                required
                value={form.siteName}
                onChange={e => handleChange('siteName', e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              />

              {/* Type & Subtype boxed */}
              <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0 0.5rem' }}>
                {/* Type box */}
                <div style={{ border: '1px solid #ccc', padding: '0.75rem', borderRadius: '4px' }}>
                  <strong>Type:</strong>
                  {Object.keys(subtypeOptions).map(opt => (
                    <label key={opt} style={{ display: 'block', margin: '0.25rem 0' }}>
                      <input
                        type="radio"
                        name="type"
                        value={opt}
                        checked={form.type === opt}
                        onChange={() => handleTypeChange(opt)}
                        style={{ marginRight: '4px' }}
                      />
                      {opt}
                    </label>
                  ))}
                </div>

                {/* Subtype box */}
                <div style={{ border: '1px solid #ccc', padding: '0.75rem', borderRadius: '4px' }}>
                  <strong>Subtype:</strong>
                  {subtypeOptions[form.type].map(sub => (
                    <label key={sub} style={{ display: 'block', margin: '0.25rem 0' }}>
                      <input
                        type="radio"
                        name="subtype"
                        value={sub}
                        checked={form.subtype === sub}
                        onChange={() => handleChange('subtype', sub)}
                        style={{ marginRight: '4px' }}
                      />
                      {sub}
                    </label>
                  ))}
                </div>
              </div>

              {/* Question & Answer */}
              <label style={{ display: 'block', margin: '1rem 0 0.5rem' }}><strong>Question:</strong></label>
              <input
                type="text"
                required
                value={form.question}
                onChange={e => handleChange('question', e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              />

              <label style={{ display: 'block', margin: '1rem 0 0.5rem' }}><strong>Answer:</strong></label>
              <input
                type="text"
                required
                value={form.answer}
                onChange={e => handleChange('answer', e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              />
            </div>

            {/* Additional Information */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}><strong>Additional Information:</strong></label>
              <textarea
                value={form.additionalInfo}
                onChange={e => handleChange('additionalInfo', e.target.value)}
                style={{ width: '99%', height: '200px', padding: '8px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{ backgroundColor: '#4caf50', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Submit Question
          </button>
        </form>
      </div>

      <div style={{ marginTop: '20px', backgroundColor: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3>Current List</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#ddd' }}>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>Question</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>Answer</th>
            </tr>
          </thead>
          <tbody>
            {questions.map(q => (
              <tr key={q.id}>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{q.question}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{q.answer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrapper>
  );
}
