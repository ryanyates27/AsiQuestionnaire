// src/components/ManagePage.jsx
import React, { useEffect, useState, useMemo } from 'react';
import PageWrapper from './PageWrapper';
import { FiEdit, FiCheckSquare, FiSearch, FiUploadCloud, FiTrash2 } from 'react-icons/fi';

export default function ManagePage({ onBack }) {
  const [filterStatus, setFilterStatus] = useState('unapproved');
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState([]);
  const [editingId, setEditing]         = useState(null);
  const [editVals, setEditVals]         = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [similarFor, setSimilarFor]     = useState(null);
  const [similarList, setSimilarList]   = useState([]);

  const [publishing, setPublishing]     = useState(false);
  const [publishMsg, setPublishMsg]     = useState('');
  const [publishErrs, setPublishErrs]   = useState(null);

  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

  const [syncPhase, setSyncPhase]       = useState('idle');
  const offline = syncPhase === 'offline';
  const canPublish = !publishing && !offline;

  // ADDED: small toast for non-blocking feedback
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg, ms = 2500) => {
    setToastMsg(msg);
    if (ms) setTimeout(() => setToastMsg(''), ms);
  };

  const refresh = async () => {
    const data = await window.api.getManageQuestions({ query, status: filterStatus });
    setResults(data);
  };

  useEffect(() => { refresh(); }, [query, filterStatus]);
  useEffect(() => { setSelectedIds(new Set()); }, [query, filterStatus]);

  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const state = await window.api?.sync?.getState?.();
        if (state?.phase) setSyncPhase(state.phase);
      } catch {}
      if (window.api?.sync?.onState) {
        unsub = window.api.sync.onState((s) => s?.phase && setSyncPhase(s.phase));
      }
    })();
    return () => { try { typeof unsub === 'function' && unsub(); } catch {} };
  }, []);

  const showSimilar = async item => {
    const list = await window.api.findSimilarApproved({ text: item.question, max: 10 });
    setSimilarFor(item);
    setSimilarList(list);
  };

  const startEdit = item => { setEditing(item.id); setEditVals({ ...item }); };
  const cancelEdit = () => { setEditing(null); setEditVals({}); };
  const saveEdit = async () => { await window.api.editQuestion(editVals); cancelEdit(); await refresh(); };
  const handleApprove = async id => { await window.api.approveQuestion(id); await refresh(); };

  const allVisibleIds = useMemo(() => results.map(r => r.id), [results]);
  const allSelected   = useMemo(
    () => allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id)),
    [allVisibleIds, selectedIds]
  );

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      allVisibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;

    // CHANGED: remove blocking confirm()
    const count = selectedIds.size;
    const proceed = window.api?.nonBlockingConfirm
      ? await window.api.nonBlockingConfirm(`Delete ${count} selected item(s)?`)
      : true; // fallback if you add such a helper later
    if (!proceed) return;

    setDeletingBulk(true);
    try {
      await Promise.all([...selectedIds].map(id => window.api.removeQuestion(id)));
      setSelectedIds(new Set());
      if (editingId && selectedIds.has(editingId)) cancelEdit();
      await refresh();
      showToast(`Deleted ${count} question${count > 1 ? 's' : ''}.`); // ADDED
    } catch (err) {
      console.error('Bulk delete failed:', err);
      showToast('Delete failed. Check logs.', 4000); // ADDED
    } finally {
      setDeletingBulk(false);
    }
  };

  const grouped = results.reduce((acc, item) => {
    const main = item.tag, sub = item.subtag || 'Unspecified';
    acc[main] = acc[main] || {};
    acc[main][sub] = acc[main][sub] || [];
    acc[main][sub].push(item);
    return acc;
  }, {});

  const onPublish = async () => {
    if (offline) {
      setPublishMsg('Offline: cannot publish to server until connection is restored.');
      setPublishErrs(null);
      return;
    }

    setPublishing(true);
    setPublishErrs(null);
    setPublishMsg('Publishing to server…');
    try {
      const res = await window.api.sync.publish();
      if (!res?.ok) {
        if (Array.isArray(res?.conflicts) && res.conflicts.length) {
          setPublishErrs(res.conflicts);
          setPublishMsg(`Conflicts: ${res.conflicts.length} record(s) changed on server since your last sync.`);
        } else {
          setPublishMsg('Publish failed. Check logs.');
        }
      } else {
        setPublishMsg(`Published. Created: ${res.created}, Updated: ${res.updated}, Soft-deleted: ${res.deleted}.`);
      }
    } catch (e) {
      setPublishMsg(`Publish failed: ${String(e)}`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <PageWrapper onBack={onBack} title="Manage Questions">
        {/* ADDED: non-blocking toast */}
        {toastMsg && (
          <div style={{
            position: 'absolute', top: 10, right: 20,
            background: '#333', color: '#fff',
            padding: '8px 12px', borderRadius: 6, zIndex: 9999
          }}>
            {toastMsg}
          </div>
        )}
        {/* Controls Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          {/* Filter Buttons */}
          <div>
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
            {/* CHANGED: Select All (visible) */}
            <label style={{ marginLeft: 12, userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ marginRight: 6 }}
              />
              Select all (visible)
            </label>
          </div>

          {/* Search Input */}
          <div>
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

          {/* Right-side actions: Delete Selected + Publish */}
          <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {/* Delete Selected */}
            <button
              onClick={deleteSelected}
              disabled={selectedIds.size === 0 || deletingBulk}
              title={selectedIds.size ? `Delete ${selectedIds.size} selected` : 'Select items to enable'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: (selectedIds.size === 0 || deletingBulk) ? '#d1d1d1' : '#cc3b3b',
                color: (selectedIds.size === 0 || deletingBulk) ? '#777' : '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: (selectedIds.size === 0 || deletingBulk) ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <FiTrash2 />
              {deletingBulk ? 'Deleting…' : 'Delete Selected'}
            </button>

            {/* CHANGED: Publish (disabled when offline or publishing) */}
            <button
              onClick={onPublish}
              disabled={!canPublish}
              title={offline ? 'Unavailable while offline' : 'Publish local changes to PocketBase'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: !canPublish ? '#9db2d6' : '#4377ff',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: !canPublish ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <FiUploadCloud />
              {publishing ? 'Publishing…' : 'Publish to Server'}
            </button>
          </div>
        </div>

        {/* Publish status box */}
        {(publishMsg || publishErrs) && (
          <div style={{
            marginBottom: 12,
            padding: '8px 10px',
            borderRadius: 6,
            background: publishErrs ? '#fff3f3' : '#f3f7ff',
            border: `1px solid ${publishErrs ? '#f0c2c2' : '#c7d6ff'}`,
            color: '#222'
          }}>
            <div>{publishMsg}</div>
            {Array.isArray(publishErrs) && publishErrs.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                IDs with conflicts:<br/>
                <code style={{ whiteSpace: 'pre-wrap' }}>
                  {publishErrs.map(c => c.id).join(', ')}
                </code>
                <div style={{ marginTop: 4 }}>
                  Tip: pull latest (restart or retry sync on login), review, then publish again.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scroll container for the table */}
        <div
          style={{
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 270px)',
            border: '1px solid #ddd',
            borderRadius: 8,
            background: '#fff'
          }}
        >
          {/* Questions Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '43%' }} />
              <col style={{ width: '40%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            {Object.entries(grouped).map(([tag, subs]) => (
              <tbody key={tag}>
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      background: '#000',
                      color: '#fff',
                      padding: 8,
                      fontSize: '1.1rem',
                      position: 'sticky',
                      top: 0,
                      zIndex: 2
                    }}
                  >
                    {tag}
                  </td>
                </tr>
                {Object.entries(subs).map(([sub, items]) => (
                  <React.Fragment key={sub}>
                    <tr>
                      <td style={{ background: '#ccc', padding: 6, fontWeight: 'bold' }} />
                      <td
                        style={{
                          background: '#ccc',
                          padding: 6,
                          fontWeight: 'bold',
                          position: 'sticky',
                          top: 36,
                          zIndex: 1
                        }}
                      >
                        {sub}
                      </td>
                      <td colSpan={3} style={{ background: '#ccc' }} />
                    </tr>
                    {items.map(item => (
                      <tr key={item.id}>
                        {/* Checkbox column */}
                        <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            aria-label={`Select ${item.id}`}
                            style={{ transform: 'scale(1.5)', margin: 4 }}
                          />
                        </td>

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
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </PageWrapper>

      {/* Similar-items Modal */}
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
    </>
  );
}
