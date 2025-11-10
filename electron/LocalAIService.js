// CHANGED: NEW FILE - LocalAIService.js (Ollama backend)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const CHAT_MODEL = process.env.LOCAL_LLM_MODEL || 'llama3.2:3b-instruct';
const EMBED_MODEL = process.env.LOCAL_EMBED_MODEL || 'nomic-embed-text';

async function http(path, body) {
  const res = await fetch(`${OLLAMA_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Ollama ${path} failed: ${res.status} ${await res.text().catch(()=> '')}`);
  return res.json();
}

export async function isOllamaUp() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch { return false; }
}

export async function ensureModels() {
  // Optional: try pulling if online; otherwise assume already present
  return true;
}

export async function embedAll(texts) {
  const input = Array.isArray(texts) ? texts : [texts];
  const out = await http('/api/embeddings', { model: EMBED_MODEL, input });
  // Normalize (L2)
  return out.embeddings.map(arr => {
    const v = Float32Array.from(arr);
    let s=0; for (let i=0;i<v.length;i++) s += v[i]*v[i];
    const n = Math.sqrt(s) || 1; for (let i=0;i<v.length;i++) v[i]/=n;
    return v;
  });
}

export async function chatWithContext(system, user) {
  const resp = await http('/api/chat', {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    options: { temperature: 0.2 }
  });
  return resp.message?.content || '';
}
