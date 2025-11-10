// CHANGED: NEW component
import { useState } from 'react';

export default function AskAI() {
  const [q, setQ] = useState("");
  const [resp, setResp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [useLLM, setUseLLM] = useState(false);

  async function onAsk(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await window.electron.invoke('ai:ask', { query: q, k: 5, threshold: 0.55, useLLM });
      setResp(r);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      <h3>Ask AI (Semantic Q/A)</h3>
      <form onSubmit={onAsk} style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask a question in natural language…"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={useLLM} onChange={(e)=>setUseLLM(e.target.checked)} />
          Rewrite with LLM
        </label>
        <button disabled={loading}>{loading ? 'Thinking…' : 'Ask'}</button>
      </form>

      {resp && (
        <div style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
          <div><strong>Confidence:</strong> {resp.confidence.toFixed(2)}</div>
          <p>{resp.answer}</p>
          {resp.citations?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Matched entries:</strong>
              <ol>
                {resp.citations.map(c => (
                  <li key={c.id}><em>Q:</em> {c.question} <small>(sim {c.score.toFixed(2)})</small></li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
