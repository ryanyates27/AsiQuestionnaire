// src/components/ManagePage.jsx
import React, { useEffect, useState } from 'react';
import PageWrapper from './PageWrapper';
import { FiEdit, FiTrash2, FiCheckSquare, FiSearch } from 'react-icons/fi';

export default function ManagePage({ onBack }) {
  const [filterStatus, setFilterStatus] = useState('unapproved'); // 'unapproved' | 'approved'
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState([]);
  const [editingId, setEditing]         = useState(null);
  const [editVals, setEditVals]         = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  // NEW: state for similar lookup
  const [similarFor, setSimilarFor]     = useState(null);
  const [similarList, setSimilarList]   = useState([]);

  // refresh helper
  const refresh = async () => {
    const data = await window.api.getManageQuestions({ query, status: filterStatus });
    setResults(data);
  };

  useEffect(() => {
    refresh();
  }, [query, filterStatus]);

  // show similar approved Q&As for a given item
  const showSimilar = async item => {
    const list = await window.api.findSimilarApproved({ text: item.question, max: 10 });
    setSimilarFor(item);
    setSimilarList(list);
  };

  // Edit / save
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
    await refresh();
  };

  // Delete
  const handleDelete = id => setDeleteTarget(id);
  const confirmDelete = async () => {
    await window.api.removeQuestion(deleteTarget);
    setDeleteTarget(null);
    await refresh();
  };

  // Approve
  const handleApprove = async id => {
    await window.api.approveQuestion(id);
    await refresh();
  };

  // Group by tag → subtag
  const grouped = results.reduce((acc, item) => {
    const main = item.tag, sub = item.subtag || 'Unspecified';
    acc[main] = acc[main] || {};
    acc[main][sub] = acc[main][sub] || [];
    acc[main][sub].push(item);
    return acc;
  }, {});

  return (
    <>
      <PageWrapper onBack={onBack} title="Manage Questions">
        {/* Filter Buttons */}
        <div style={{ marginBottom: 16 }}>
          {['unapproved','approved'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                marginRight: 8,
                padding: '6px 12px',
                background: filterStatus === status ? '#ccc' : '#e2e0e0',
                border: '1px solid #999',
                borderRadius: 4,
                fontWeight: filterStatus === status ? 'bold' : 'normal',
                cursor: 'pointer'
              }}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Filter questions..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              fontSize: 16,
              border: '1px solid #ccc',
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Questions Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '45%' }} />
            <col style={{ width: '40%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
          </colgroup>
          {Object.entries(grouped).map(([tag, subs]) => (
            <tbody key={tag}>
              <tr>
                <td colSpan={5} style={{ background: '#000', color: '#fff', padding: 8, fontSize: '1.1rem' }}>
                  {tag}
                </td>
              </tr>
              {Object.entries(subs).map(([sub, items]) => (
                <React.Fragment key={sub}>
                  <tr>
                    <td style={{ background: '#ccc', padding: 6, fontWeight: 'bold' }}>{sub}</td>
                    <td colSpan={4} style={{ background: '#ccc' }} />
                  </tr>
                  {items.map(item => (
                    <tr key={item.id}>
                      {/* Question */}
                      <td style={{ border: '1px solid #999', padding: 6, whiteSpace: 'pre-wrap' }}>
                        {editingId === item.id
                          ? <textarea
                              style={{ width: '100%', minHeight: 60, resize: 'vertical', boxSizing: 'border-box' }}
                              value={editVals.question}
                              onChange={e => setEditVals(prev => ({ ...prev, question: e.target.value }))}
                            />
                          : item.question
                        }
                      </td>

                      {/* Answer */}
                      <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center', whiteSpace: 'pre-wrap' }}>
                        {editingId === item.id
                          ? <textarea
                              style={{ width: '100%', minHeight: 60, resize: 'vertical', boxSizing: 'border-box' }}
                              value={editVals.answer}
                              onChange={e => setEditVals(prev => ({ ...prev, answer: e.target.value }))}
                            />
                          : item.answer
                        }
                      </td>

                      {/* Find Similar + Approve */}
                      <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center' }}>
                        {item.approved === 0 && editingId !== item.id && (
                          <>
                            <FiSearch
                              size={18}
                              style={{ cursor: 'pointer', marginRight: 8 }}
                              onClick={() => showSimilar(item)}
                            />
                            <FiCheckSquare
                              size={18}
                              style={{ cursor: 'pointer', color: 'green' }}
                              onClick={() => handleApprove(item.id)}
                            />
                          </>
                        )}
                      </td>

                      {/* Edit / Save */}
                      <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center' }}>
                        {editingId === item.id
                          ? <button onClick={saveEdit}>Save</button>
                          : <FiEdit
                              size={18}
                              style={{ cursor: 'pointer' }}
                              onClick={() => startEdit(item)}
                            />
                        }
                      </td>

                      {/* Delete / Cancel */}
                      <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center' }}>
                        {editingId === item.id
                          ? <button onClick={cancelEdit}>Cancel</button>
                          : <FiTrash2
                              size={18}
                              style={{ cursor: 'pointer', color: 'crimson' }}
                              onClick={() => handleDelete(item.id)}
                            />
                        }
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          ))}
        </table>
      </PageWrapper>

      {/* Similar‑items Modal */}
      {similarFor && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, width: '90%', maxWidth: 500 }}>
            <h4>Similar approved Q&As to:</h4>
            <p style={{ fontStyle: 'italic' }}>"{similarFor.question}"</p>
            <ul>
              {similarList.map(s => (
                <li key={s.id} style={{ marginBottom: 12 }}>
                  <strong>Q:</strong> {s.question}<br/>
                  <strong>A:</strong> {s.answer}
                </li>
              ))}
              {similarList.length === 0 && <li>No similar approved items found.</li>}
            </ul>
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setSimilarFor(null)} style={{ padding: '6px 12px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, width: '90%', maxWidth: 300 }}>
            <p>Are you sure you want to delete this question?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '6px 12px' }}>
                No
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '6px 12px',
                  background: 'crimson',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
