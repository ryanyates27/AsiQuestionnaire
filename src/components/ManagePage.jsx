// src/components/ManagePage.jsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import PageWrapper from './PageWrapper';
import { FiEdit, FiCheckSquare, FiUploadCloud, FiTrash2 } from 'react-icons/fi';

export default function ManagePage({ onBack }) {
  const [filterStatus, setFilterStatus] = useState('unapproved');
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState([]);
  const [editingId, setEditing]         = useState(null);
  const [editVals, setEditVals]         = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [infoModal, setInfoModal]       = useState(null);
  const [editingInfo, setEditingInfo]   = useState(false);
  const [infoDraft, setInfoDraft]       = useState('');

  const questionEditRef = useRef(null);
  const answerEditRef = useRef(null);
  const infoEditRef = useRef(null);

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

  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const refresh = async () => {
    const data = await window.api.getManageQuestions({ query, status: filterStatus });
    setResults(data);
  };

  useEffect(() => { refresh(); }, [query, filterStatus]);
  useEffect(() => { setSelectedIds(new Set()); }, [query, filterStatus]);

  useEffect(() => { autoResize(questionEditRef.current); }, [editingId, editVals.question]);
  useEffect(() => { autoResize(answerEditRef.current); }, [editingId, editVals.answer]);
  useEffect(() => { if (editingInfo) autoResize(infoEditRef.current); }, [editingInfo, infoDraft]);

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

  const startEdit = item => { setEditing(item.id); setEditVals({ ...item }); };
  const cancelEdit = () => { setEditing(null); setEditVals({}); };
  const saveEdit = async () => { await window.api.editQuestion(editVals); cancelEdit(); await refresh(); };
  const handleApprove = async id => { await window.api.approveQuestion(id); await refresh(); };

   const openInfoModal = (item) => {
    setInfoModal({ id: item.id, text: item.additionalInfo || '' });
    setInfoDraft(item.additionalInfo || '');
    setEditingInfo(false);
  };

  const closeInfoModal = () => {
    setInfoModal(null);
    setEditingInfo(false);
    setInfoDraft('');
  };

  const cancelInfoEdit = () => {
    setEditingInfo(false);
    setInfoDraft(infoModal?.text || '');
  };

  const saveInfoEdit = async () => {
    if (!infoModal) return;

    const current = results.find(r => r.id === infoModal.id);
    const payload = current
      ? { ...current, additionalInfo: infoDraft }
      : { id: infoModal.id, additionalInfo: infoDraft };

    try {
      await window.api.editQuestion(payload);
      await refresh();
      setInfoModal(prev => (prev ? { ...prev, text: infoDraft } : prev));
      setEditingInfo(false);
      showToast('Additional information updated.');
    } catch (err) {
      console.error('Failed to update additional information:', err);
      showToast('Unable to save additional information.', 4000);
    }
  };


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

  const showUnapprovedLayout = filterStatus === 'unapproved';

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
              Select all
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
              <col style={{ width: showUnapprovedLayout ? '41%' : '43%' }} />
              <col style={{ width: showUnapprovedLayout ? '37%' : '40%' }} />
              <col style={{ width: '6%' }} />
              {showUnapprovedLayout && <col style={{ width: '5%' }} />}
              <col style={{ width: '7%' }} />
            </colgroup>
            {Object.entries(grouped).map(([tag, subs]) => (
              <tbody key={tag}>
                <tr>
                  <td
                    colSpan={showUnapprovedLayout ? 6 : 5}
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
                      <td
                        colSpan={showUnapprovedLayout ? 6 : 5}
                        style={{
                          background: '#ccc',
                          padding: 6,
                          fontWeight: 'bold',
                          position: 'sticky',
                          top: 36,
                          zIndex: 1,
                          boxShadow: '0 1px 0 rgba(0,0,0,0.08)'
                        }}
                      >
                        {sub}
                      </td>
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
                                style={{ width: '100%', minHeight: 60, resize: 'vertical', boxSizing: 'border-box', overflow: 'hidden' }}
                                ref={questionEditRef}
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
                                style={{ width: '100%', minHeight: 60, resize: 'vertical', boxSizing: 'border-box', overflow: 'hidden' }}
                                ref={answerEditRef}
                                value={editVals.answer}
                                onChange={e => setEditVals(prev => ({ ...prev, answer: e.target.value }))}
                              />
                            : item.answer
                          }
                        </td>

                        {/* Approve */}
                       {showUnapprovedLayout ? (
                          <>
                            <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center' }}>
                              {item.additionalInfo && (
                                <button
                                  onClick={() => openInfoModal(item)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                  aria-label="Show additional information"
                                >
                                  ℹ️
                                </button>
                              )}
                            </td>
                            <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center' }}>
                              {item.approved === 0 && editingId !== item.id && (
                                <FiCheckSquare
                                  size={18}
                                  style={{ cursor: 'pointer', color: 'green' }}
                                  onClick={() => handleApprove(item.id)}
                                />
                              )}
                            </td>
                          </>
                        ) : (
                          <td style={{ border: '1px solid #999', padding: 6, textAlign: 'center' }}>
                            {item.additionalInfo && (
                              <button
                                onClick={() => openInfoModal(item)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                aria-label="Show additional information"
                              >
                                ℹ️
                              </button>
                            )}
                          </td>
                        )}

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

         {infoModal && (
          <div
          onClick={closeInfoModal}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#fff',
                color: '#000',
                padding: '1rem',
                borderRadius: 8,
                width: 'min(900px, 80vw)',
                maxWidth: '80%',
                maxHeight: '70%',
                overflow: 'auto',
                boxSizing: 'border-box'
              }}
            >
              <button
                onClick={closeInfoModal}
                style={{
                  float: 'right',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
              >
                ✖
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Additional Information</h3>
                {!editingInfo && (
                  <button
                    onClick={() => setEditingInfo(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}
                    aria-label="Edit additional information"
                    title="Edit additional information"
                  >
                    <FiEdit size={16} />
                  </button>
                )}
              </div>

              {editingInfo ? (
                <>
                  <textarea
                    value={infoDraft}
                    onChange={e => setInfoDraft(e.target.value)}
                    style={{ width: '100%', minHeight: 140, resize: 'vertical', boxSizing: 'border-box', overflow: 'hidden', display: 'block' }}
                    ref={infoEditRef}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={saveInfoEdit}>Save</button>
                    <button onClick={cancelInfoEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <p style={{ whiteSpace: 'pre-wrap', width: '100%', boxSizing: 'border-box' }}>{infoModal.text}</p>
              )}
            </div>
          </div>
        )}

      </PageWrapper>
    </>
  );
}
