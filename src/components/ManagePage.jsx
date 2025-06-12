// src/components/ManagePage.jsx
import React, { useEffect, useState } from 'react';
import PageWrapper from './PageWrapper';

export default function ManagePage({ onBack }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [editingId, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});

  // Fetch questions whenever query changes
  useEffect(() => {
    (async () => {
      try {
        const data = await window.api.getQuestions(query);
        setResults(data);
      } catch (err) {
        console.error('Error loading questions:', err);
      }
    })();
  }, [query]);

  // Group by tag → subtag
  const grouped = results.reduce((acc, item) => {
    const main = item.tag;
    const sub  = item.subtag || 'Unspecified';
    if (!acc[main])      acc[main]      = {};
    if (!acc[main][sub]) acc[main][sub] = [];
    acc[main][sub].push(item);
    return acc;
  }, {});

  const startEdit = item => {
    setEditing(item.id);
    setEditVals({ ...item });
  };
  const cancelEdit = () => {
    setEditing(null);
    setEditVals({});
  };
  const saveEdit = async () => {
    try {
      await window.api.editQuestion(editVals);
      cancelEdit();
      // re-fetch with current query
      const data = await window.api.getQuestions(query);
      setResults(data);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save changes');
    }
  };
  const handleDelete = async id => {
    if (!confirm('Delete this question?')) return;
    try {
      await window.api.removeQuestion(id);
      const data = await window.api.getQuestions(query);
      setResults(data);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete question');
    }
  };

  return (
    <PageWrapper onBack={onBack} title="Manage Questions">
      {/* Fuzzy Search Bar */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Filter questions..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '16px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
      </div>

      {/* Questions Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {Object.entries(grouped).map(([tag, subs]) => (
          <tbody key={tag}>
            {/* Main type header */}
            <tr>
              <td
                colSpan={4}
                style={{
                  backgroundColor: '#000',
                  color: '#fff',
                  padding: 8,
                  fontSize: '1.1rem'
                }}
              >
                {tag}
              </td>
            </tr>

            {/* Subtype sections */}
            {Object.entries(subs).map(([sub, items]) => (
              <React.Fragment key={sub}>
                <tr>
                  <td
                    style={{
                      backgroundColor: '#ccc',
                      padding: 6,
                      fontWeight: 'bold'
                    }}
                  >
                    {sub}
                  </td>
                  <td colSpan={3} style={{ backgroundColor: '#ccc', padding: 6 }} />
                </tr>

                {items.map(item => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #000', padding: 6 }}>
                      {editingId === item.id ? (
                        <textarea
                          style={{ width: '100%', minHeight: '60px' }}
                          value={editVals.question}
                          onChange={e =>
                            setEditVals(prev => ({ ...prev, question: e.target.value }))
                          }
                        />
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{item.question}</div>
                      )}
                    </td>
                    <td style={{ border: '1px solid #000', padding: 6 }}>
                      {editingId === item.id ? (
                        <textarea
                          style={{ width: '100%', minHeight: '60px' }}
                          value={editVals.answer}
                          onChange={e =>
                            setEditVals(prev => ({ ...prev, answer: e.target.value }))
                          }
                        />
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap', textAlign: 'center' }}>
                          {item.answer}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        border: '1px solid #000',
                        padding: 6,
                        textAlign: 'center'
                      }}
                    >
                      {editingId === item.id ? (
                        <>
                          <button onClick={saveEdit}>Save</button>{' '}
                          <button onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(item)}>Edit</button>
                      )}
                    </td>
                    <td
                      style={{
                        border: '1px solid #000',
                        padding: 6,
                        textAlign: 'center'
                      }}
                    >
                      <button
                        style={{ color: 'crimson' }}
                        onClick={() => handleDelete(item.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        ))}
      </table>
    </PageWrapper>
  );
}
