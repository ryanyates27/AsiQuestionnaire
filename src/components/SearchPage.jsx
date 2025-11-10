// src/components/SearchPage.jsx
import React, { useEffect, useState } from 'react';
import PageWrapper from './PageWrapper';

export default function SearchPage({ onBack }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showSites, setShowSites] = useState(false);
  const [showTypes, setShowTypes] = useState(true);
  const [infoModal, setInfoModal] = useState(null);

  // --- AI modal state ---
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQ, setAiQ] = useState('');
  const [aiUseLLM, setAiUseLLM] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResp, setAiResp] = useState(null);
  const [aiError, setAiError] = useState(null);

  // Show which citation is currently selected & an override answer
  const [aiSelectedIdx, setAiSelectedIdx] = useState(0);     
  const [aiOverrideAnswer, setAiOverrideAnswer] = useState(null);

  // ADDED: tiny toast (non-blocking)
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg, ms = 2500) => {
    setToastMsg(msg);
    if (ms) setTimeout(() => setToastMsg(''), ms);
  };

  // --- Load questions based on search query ---
  useEffect(() => {
    (async () => {
      try {
        const data = await window.api.getQuestions(query);
        setResults(data);
      } catch (err) {
        console.error('Error fetching questions:', err);
        showToast('Failed to load questions.', 3000); // ADDED
      }
    })();
  }, [query]);

  // --- Group questions by type/subtype ---
  const grouped = results.reduce((acc, item) => {
    const main = item.tag;
    const sub = item.subtag || 'Unspecified';
    if (!acc[main]) acc[main] = {};
    if (!acc[main][sub]) acc[main][sub] = [];
    acc[main][sub].push(item);
    return acc;
  }, {});

  const widths = showSites
    ? { q: '40%', a: '45%', i: '5%', s: '10%' }
    : { q: '45%', a: '45%', i: '10%' };

  // CHANGED: sticky offsets for headers inside the scroll container
  const TYPE_HEADER_TOP = 0;     // Black TYPE header sticks to the top
  const SUBTYPE_HEADER_TOP = 36; // Grey SUBTYPE header sits just below TYPE (approx height)

  // Which answer should be displayed in the modal: user-selected override or the AI's original
  const shownAnswer = aiOverrideAnswer ?? aiResp?.answer; // CHANGED

// --- Ask AI handler (REPLACED) ---
async function onAskAI(e) {
  e?.preventDefault?.();
  setAiError(null);

  const q = aiQ?.trim();
  if (!q) return;

  if (!window.api?.askAI) {
    setAiError('IPC bridge is missing. Ensure preload exposes window.api.askAI.');
    return;
  }

  // If we're in rewrite mode, tell the backend exactly what to rewrite:
  // prefer the user-selected citation's answer; else whatever is currently shown.
  const rewriteFrom = (aiUseLLM ? (aiOverrideAnswer ?? aiResp?.answer ?? null) : null); // CHANGED

  setAiLoading(true);
  try {
    const res = await window.api.askAI({
      query: q,
      k: 3,
      threshold: 0.40,
      useLLM: !!aiUseLLM,
      rewriteFrom,                                 // CHANGED: explicit text to paraphrase
    });

    if (res?.error) {
      console.debug('[AskAI] details:', res.details);
      setAiError(res.message || 'AI failed.');
      return;
    }

    setAiResp(res);
    setAiSelectedIdx(0);        // CHANGED: default to top match for the list
    if (aiUseLLM) {
      // When rewriting, ensure we display the LLM output (don’t keep an old override)
      setAiOverrideAnswer(null); // CHANGED
    }
  } catch (err) {
    console.error('[AskAI] exception:', err);
    setAiError('Ask failed. See console for details.');
  } finally {
    setAiLoading(false);
  }
}

  // CHANGED: Re-run Ask AI in rewrite mode and clear any citation override
  async function handleRewriteWithLLM() {
    try {
      setAiUseLLM(true);           // flip the flag the API reads
      setAiOverrideAnswer(null);   // important: don't let a selected citation hide LLM output
      await onAskAI();             // reuse your existing ask flow
    } catch (e) {
      console.error('[AskAI] rewrite failed:', e);
    }
  }


  // ADDED: allow closing modals with Escape (no focus trap lingering)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (aiOpen) setAiOpen(false);
      if (infoModal) setInfoModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aiOpen, infoModal]);

  // CHANGED: When a user clicks a citation, show that item’s answer.
  // We try, in order: (a) answer included in citation (if backend provides it),
  // (b) answer from current results cache, (c) optional IPC fetch by id.
  async function chooseCitation(i) {                              // CHANGED
    setAiSelectedIdx(i);
    if (!aiResp?.citations?.[i]) return;
    const cit = aiResp.citations[i];

    // (a) use embedded answer if present
    if (cit.answer) {
      setAiOverrideAnswer(cit.answer);
      return;
    }

    // (b) try to find it from current result set (ids should match)
    const local = results.find((r) => r.id === cit.id);
    if (local?.answer) {
      setAiOverrideAnswer(local.answer);
      return;
    }

    // (c) optional IPC to fetch by id if your preload exposes it
    try {
      if (window.api?.getQuestionById) {
        const rec = await window.api.getQuestionById(cit.id);
        if (rec?.answer) {
          setAiOverrideAnswer(rec.answer);
          return;
        }
      }
    } catch (e) {
      console.debug('getQuestionById failed (non-fatal):', e);
    }

    // Fallback: if nothing resolved, clear override so we keep the LLM’s answer
    setAiOverrideAnswer(null);
  }

  return (
    <PageWrapper onBack={onBack} title="Search Questions">
      {/* ADDED: Toast */}
      {toastMsg && (
        <div style={{
          position: 'absolute', top: 10, right: 20, zIndex: 9999,
          background: '#333', color: '#fff', padding: '8px 12px', borderRadius: 6
        }}>
          {toastMsg}
        </div>
      )}

      {/* --- Search Bar + Toggles + Ask AI button --- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 16,
          position: 'sticky',
          top: 0,
          background: '#f5f5f5',
          zIndex: 3,
          paddingBottom: 8,
        }}
      >
        <input
          type="text"
          placeholder="Search questions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flexGrow: 1,
            padding: 8,
            fontSize: 16,
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />
        <div style={{ marginLeft: 16, color: '#000' }}>
          <label>
            <input
              type="checkbox"
              checked={showSites}
              onChange={() => setShowSites((s) => !s)}
              style={{ marginRight: 4 }}
            />
            Sites
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={showTypes}
              onChange={() => setShowTypes((t) => !t)}
              style={{ marginRight: 4 }}
            />
            Types
          </label>
        </div>

        {/* Ask AI button (top-right) */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => {
              setAiQ(query || '');
              setAiOpen(true);
              setAiSelectedIdx(0);
              setAiOverrideAnswer(null);
            }}
            style={{
              marginLeft: 12,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #000',
              background: '#f7f7f7',
              cursor: 'pointer',
            }}
            title="Ask the AI assistant"
          >
            Ask AI
          </button>
        </div>
      </div>

      {/* --- SCROLLABLE RESULTS SECTION --- */}
      <div
        style={{
          maxHeight: '70vh',
          overflowY: 'auto',
          border: '1px solid #ccc',
          backgroundColor: '#fff',
          position: 'relative',
        }}
      >
        <table
          style={{
            width: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            color: '#000',
          }}
        >
          <colgroup>
            <col style={{ width: widths.q }} />
            <col style={{ width: widths.a }} />
            <col style={{ width: widths.i }} />
            {showSites && <col style={{ width: widths.s }} />}
          </colgroup>

          {Object.entries(grouped).map(([type, subs]) => (
            <tbody key={type}>
              {/* Main type header (sticky) */}
              <tr>
                <td
                  colSpan={showSites ? 4 : 3}
                  style={{
                    backgroundColor: '#000',
                    color: '#fff',
                    padding: 8,
                    fontSize: 18,
                    position: 'sticky',
                    top: TYPE_HEADER_TOP,
                    zIndex: 2,
                    boxShadow: '0 2px 0 rgba(0,0,0,0.15)',
                  }}
                  role="rowheader"
                >
                  {type}
                </td>
              </tr>

              {showTypes
                ? Object.entries(subs).map(([sub, items]) => (
                    <React.Fragment key={sub}>
                      {/* Subtype header (sticky just under Type) */}
                      <tr>
                        <td
                          colSpan={showSites ? 4 : 3}
                          style={{
                            backgroundColor: '#e5e5e5',
                            padding: 6,
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: SUBTYPE_HEADER_TOP,
                            zIndex: 1,
                            boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
                          }}
                          role="rowheader"
                          aria-level={2}
                        >
                          {sub}
                        </td>
                      </tr>

                      {/* Question rows */}
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td style={{ border: '1px solid #000', padding: 6 }}>{item.question}</td>
                          <td
                            style={{
                              border: '1px solid #000',
                              padding: 6,
                              textAlign: 'center',
                            }}
                          >
                            {item.answer}
                          </td>
                          <td
                            style={{
                              border: '1px solid #000',
                              padding: 6,
                              textAlign: 'center',
                            }}
                          >
                            {item.additionalInfo && (
                              <button
                                onClick={() => setInfoModal(item.additionalInfo)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: 16,
                                }}
                                aria-label="Show additional information"
                              >
                                ℹ️
                              </button>
                            )}
                          </td>
                          {showSites && (
                            <td style={{ border: '1px solid #000', padding: 6 }}>
                              {item.siteName || '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                : // Flat list (types off)
                  Object.values(subs)
                    .flat()
                    .map((item) => (
                      <tr key={item.id}>
                        <td style={{ border: '1px solid #000', padding: 6 }}>{item.question}</td>
                        <td
                          style={{
                            border: '1px solid #000',
                            padding: 6,
                            textAlign: 'center',
                          }}
                        >
                          {item.answer}
                        </td>
                        <td
                          style={{
                            border: '1px solid #000',
                            padding: 6,
                            textAlign: 'center',
                          }}
                        >
                          {item.additionalInfo && (
                            <button
                              onClick={() => setInfoModal(item.additionalInfo)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 16,
                              }}
                              aria-label="Show additional information"
                            >
                              ℹ️
                            </button>
                          )}
                        </td>
                        {showSites && (
                          <td style={{ border: '1px solid #000', padding: 6 }}>
                            {item.siteName || '—'}
                          </td>
                        )}
                      </tr>
                    ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* --- Modal: Additional Info --- */}
      {infoModal && (
        <div
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
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              color: '#000',
              padding: '1rem',
              borderRadius: 8,
              maxWidth: '80%',
              maxHeight: '70%',
              overflow: 'auto',
            }}
          >
            <button
              onClick={() => setInfoModal(null)}
              style={{
                float: 'right',
                background: 'none',
                border: 'none',
                fontSize: '1.2rem',
                cursor: 'pointer',
              }}
            >
              ✖
            </button>
            <h3>Additional Information</h3>
            <p>{infoModal}</p>
          </div>
        </div>
      )}

      {/* --- Modal: Ask AI --- */}
      {aiOpen && (
        <div
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
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              color: '#000',
              padding: '1rem',
              borderRadius: 8,
              maxWidth: 720,
              width: '90%',
              maxHeight: '80%',
              overflow: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0 }}>Ask AI</h3>
              <button
                onClick={() => setAiOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                }}
                aria-label="Close"
              >
                ✖
              </button>
            </div>

            {/* Ask form */}
            <form
              onSubmit={onAskAI}
              style={{ display: 'flex', gap: 8, marginTop: 12 }}
            >
              <input
                value={aiQ}
                onChange={(e) => setAiQ(e.target.value)}
                placeholder="Ask a question in natural language…"
                style={{
                  flex: 1,
                  padding: 8,
                  fontSize: 16,
                  border: '1px solid #ccc',
                  borderRadius: 4,
                }}
              />

              {/* Keep the checkbox if you still want the mode toggle */}
              <label style={{ display: 'none', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={aiUseLLM}
                  onChange={(e) => setAiUseLLM(e.target.checked)}
                />
                Rewrite with LLM
              </label>
              
              {/* CHANGED: add a real rewrite button that re-runs Ask with LLM and clears override */}
              {/* <button
                type="button"                         // CHANGED: don't submit the form
                onClick={handleRewriteWithLLM}        // CHANGED
                disabled={aiLoading || !aiResp}       // CHANGED: only active when we have an answer to rewrite
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #000',
                  background: '#eef3ff',
                  cursor: aiLoading || !aiResp ? 'not-allowed' : 'pointer',
                }}
                title="Rephrase the current answer with the LLM"
              >
                {aiLoading ? 'Rewriting…' : 'Rewrite with LLM'}  {/* CHANGED 
              </form></button> */}
              
              <button
                disabled={aiLoading}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #000',
                  background: '#f7f7f7',
                  cursor: 'pointer',
                }}
              >
                {aiLoading ? 'Thinking…' : 'Ask'}
              </button>
            </form>

            {/* AI output */}
            {aiError && (
              <p style={{ color: 'crimson', marginTop: 8 }}>{aiError}</p>
            )}
            {aiResp && (
              <div style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                <div>
                  <strong>Confidence:</strong> {aiResp.confidence?.toFixed?.(2) ?? '—'}
                  {aiUseLLM && <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
                    (LLM rewrite)
                  </span>}
                </div>
                <p style={{ marginTop: 8 }}>{shownAnswer}</p>
            
                {/* Clickable, highlightable matched entries */}
                {Array.isArray(aiResp.citations) && aiResp.citations.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>Matched entries:</strong>
                    <ol style={{ paddingLeft: 18, marginTop: 6 }}>
                      {aiResp.citations.map((c, idx) => {
                        const isActive = idx === aiSelectedIdx; // CHANGED
                        return (
                          <li key={c.id} style={{ marginBottom: 6 }}>
                            <button
                              onClick={() => chooseCitation(idx)}       // CHANGED
                              style={{
                                display: 'inline',
                                cursor: 'pointer',
                                background: 'none',
                                border: 'none',
                                textAlign: 'left',
                                padding: 0,
                                font: 'inherit',
                                color: isActive ? '#0b57d0' : '#000',   // CHANGED
                                fontWeight: isActive ? 600 : 400,       // CHANGED
                                textDecoration: isActive ? 'underline' : 'none', // CHANGED
                              }}
                              title="Show this answer"
                            >
                              <em>Q:</em> {c.question}{' '}
                              <small>(sim {c.score?.toFixed?.(2) ?? '—'})</small>
                              {isActive && <small> • selected</small>}   {/* CHANGED */}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
