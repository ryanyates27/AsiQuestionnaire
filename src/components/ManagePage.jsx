// src/components/ManagePage.jsx
import React, { useEffect, useState } from 'react';
import PageWrapper from './PageWrapper';

export default function ManagePage({ onBack }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [editingId, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});

  // Fetch (with fuzzy) on query change
  useEffect(() => {
    (async () => {
      const data = await window.api.getQuestions(query);
      setResults(data);
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
    await window.api.editQuestion(editVals);
    cancelEdit();
    const data = await window.api.getQuestions(query);
    setResults(data);
  };
  const handleDelete = async id => {
    if (!confirm('Delete this question?')) return;
    await window.api.removeQuestion(id);
    const data = await window.api.getQuestions(query);
    setResults(data);
  };

  return (
    <PageWrapper onBack={onBack} title="Manage Questions">
      {/* Fuzzy Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Filter questions..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '98%',
            padding: 8,
            fontSize: 16,
            border: '1px solid #ccc',
            borderRadius: 4
          }}
        />
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed'
        }}
      >
        {/* 45/45/5/7 split */}
        <colgroup>
          <col style={{ width: '45%' }} />
          <col style={{ width: '43%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '7%' }} />
        </colgroup>

        {Object.entries(grouped).map(([tag, subs]) => (
          <tbody key={tag}>
            {/* Main tag row */}
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

            {Object.entries(subs).map(([sub, items]) => (
              <React.Fragment key={sub}>
                {/* Subtag header row */}
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
                  {/* span the other three columns */}
                  <td colSpan={3} style={{ backgroundColor: '#ccc', padding: 6 }} />
                </tr>

                {/* Item rows */}
                {items.map(item => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #000', padding: 6 }}>
                      {editingId === item.id ? (
                        <textarea
                          style={{
                            width: '100%',
                            minHeight: 60,
                            boxSizing: 'border-box',
                            resize: 'vertical'
                          }}
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
                          style={{
                            width: '100%',
                            minHeight: 60,
                            boxSizing: 'border-box',
                            resize: 'vertical'
                          }}
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
                    <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>
                      {editingId === item.id ? (
                        <button onClick={saveEdit}>Save</button>
                      ) : (
                        <button onClick={() => startEdit(item)}>Edit</button>
                      )}
                    </td>
                    <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>
                      {editingId === item.id ? (
                        <button onClick={cancelEdit}>Cancel</button>
                      ) : (
                        <button
                          style={{ color: 'crimson' }}
                          onClick={() => handleDelete(item.id)}
                        >
                          Delete
                        </button>
                      )}
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
