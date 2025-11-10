// electron/AISemanticQA.js
// Semantic retrieval over your SQLite Q/A, with optional LLM rewrite.
// Reuses SQLiteService (questions.db) so there’s no second DB handle.
// Embeddings are stored as Float32 BLOBs in qa_vectors.

import { getAllQuestions, getVectorsByIds } from './SQLiteService.js';
import { embedAll, chatWithContext, engineFilesOk } from './BundledAIService.js';

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// CHANGED: safer askSemantic
export async function askSemantic(query, k = 5, threshold = 0.55, useLLM = false) {
  const q = (query || '').trim();
  if (!q) return { answer: '', citations: [], confidence: 0 };

  // 1) Fetch Q/A and vectors
  const rows = await getAllQuestions();           // [{ id, question, answer, ... }]
  if (!rows?.length) {
    return { answer: 'No data yet. Add questions first.', citations: [], confidence: 0 };
  }

  // keep k sensible
  k = Math.max(1, Math.min(k, rows.length));

  // 2) Ensure embedding engine is available
  const engineOk = await engineFilesOk(); // from BundledAIService
  if (!engineOk) {
    return {
      answer: 'Local models are not installed yet. See “models” folder notes.',
      citations: [],
      confidence: 0
    };
  }

  // 3) Build corpus
  const corpus = rows.map(r => ({ id: r.id, text: `${r.question}\n${r.answer || ''}`.trim(), question: r.question, answer: r.answer || '' }));
  const queryVecs = await embedAll([q]);                // Float32Array[dim]
  const corpusVecs = await embedAll(corpus.map(c => c.text));

  const qv = queryVecs?.[0];
  if (!qv || !corpusVecs?.length) {
    return { answer: 'Embeddings unavailable (empty vectors).', citations: [], confidence: 0 };
  }

  // 4) Cosine similarity
  const scored = corpus.map((c, i) => {
    const v = corpusVecs[i];
    if (!v || v.length !== qv.length) return { ...c, score: -1 };
    // dot / (||q|| * ||v||)
    let dot = 0, nq = 0, nv = 0;
    for (let j = 0; j < qv.length; j++) { dot += qv[j] * v[j]; nq += qv[j]*qv[j]; nv += v[j]*v[j]; }
    const sim = (nq && nv) ? (dot / (Math.sqrt(nq) * Math.sqrt(nv))) : -1;
    return { ...c, score: sim };
  })
  .filter(x => x.score >= 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, k);

  if (!scored.length || scored[0].score < Math.max(0.0, Math.min(threshold, 0.9))) {
    // Low confidence fallback
    const best = scored[0];
    return {
      answer: best ? best.answer : 'I don’t have a confident answer yet.',
      citations: scored.map(({ id, question, score }) => ({ id, question, score })),
      confidence: best ? best.score : 0
    };
  }

  // 5) Optional LLM rewrite
  let finalText = scored[0].answer;
  if (useLLM) {
    const context = scored.map(s => `Q: ${s.question}\nA: ${s.answer}`).join('\n---\n');
    const system = 'You are a helpful assistant. Only answer from the provided context.';
    const user = `Question: ${q}\n\nContext:\n${context}`;
    try {
      finalText = (await chatWithContext(system, user))?.trim() || finalText;
    } catch (e) {
      // Fallback silently to exact answer
    }
  }

  return {
    answer: finalText,
    citations: scored.map(({ id, question, score }) => ({ id, question, score })),
    confidence: scored[0].score
  };
}