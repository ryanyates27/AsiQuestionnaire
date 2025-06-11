// src/components/ManagePage.jsx
import React, { useEffect, useState } from 'react';
import PageWrapper from './PageWrapper';

export default function ManagePage({ onBack }) {
  const [results, setResults]   = useState([]);
  const [editingId, setEditing] = useState(null);
  const [editVals, setEditVals] = useState({});

  // Load all questions on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await window.api.getQuestions('');
        setResults(data);
      } catch (err) {
        console.error('Error loading questions:', err);
      }
    }
    load();
  }, []);

  // Refresh helper
  const refresh = async () => {
    const data = await window.api.getQuestions('');
    setResults(data);
  };

  // Group by tag → innertag
  const grouped = results.reduce((acc, item) => {
    acc[item.tag] = acc[item.tag] || {};
    acc[item.tag][item.innertag] = acc[item.tag][item.innertag] || [];
    acc[item.tag][item.innertag].push(item);
    return acc;
  }, {});

  // Edit handlers
  const startEdit = (item) => {
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
      refresh();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save changes');
    }
  };
  const handleDelete = async (id) => {
    if (!confirm('Delete this question?')) return;
    try {
      await window.api.removeQuestion(id);
      refresh();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete question');
    }
  };

  return (
    <PageWrapper onBack={onBack} title="📝 Manage Questions">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {Object.entries(grouped).map(([tag, inners]) => (
          <tbody key={tag}>
            {/* Tag Row */}
            <tr>
              <td
                colSpan={4}
                style={{
                  backgroundColor: '#000',
                  color: '#fff',
                  padding: '8px',
                  fontSize: '1.1rem'
                }}
              >
                {tag}
              </td>
            </tr>

            {Object.entries(inners).map(([innerTag, items]) => (
              <React.Fragment key={innerTag}>
                {/* Innertag Subheader */}
                <tr>
                  <td
                    style={{
                      backgroundColor: '#ccc',
                      padding: '6px',
                      fontWeight: 'bold'
                    }}
                  >
                    {innerTag}
                  </td>
                  <td colSpan={3} style={{ backgroundColor: '#ccc', padding: '6px' }} />
                </tr>

                {/* Question Rows */}
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {editingId === item.id ? (
                        <input
                          style={{ width: '100%' }}
                          value={editVals.question}
                          onChange={(e) =>
                            setEditVals((prev) => ({ ...prev, question: e.target.value }))
                          }
                        />
                      ) : (
                        item.question
                      )}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '6px' }}>
                      {editingId === item.id ? (
                        <input
                          style={{ width: '100%' }}
                          value={editVals.answer}
                          onChange={(e) =>
                            setEditVals((prev) => ({ ...prev, answer: e.target.value }))
                          }
                        />
                      ) : (
                        item.answer
                      )}
                    </td>
                    <td
                      style={{
                        border: '1px solid #000',
                        padding: '6px',
                        textAlign: 'center'
                      }}
                    >
                      {editingId === item.id ? (
                        <button onClick={saveEdit}>Save</button>
                      ) : (
                        <button onClick={() => startEdit(item)}>Edit</button>
                      )}
                    </td>
                    <td
                      style={{
                        border: '1px solid #000',
                        padding: '6px',
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
