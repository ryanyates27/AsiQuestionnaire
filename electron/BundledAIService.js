// BundledAIService.js – local/offline AI engine for Ask AI
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pipeline, env as txEnv } from '@xenova/transformers';
import gpt4all from 'gpt4all';

const { Gpt4All } = gpt4all;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------
// Resolve models path (works for both dev and packaged app)
// ---------------------------------------------------------
function pickModelRoot() {
  const candidates = [
    path.join(process.cwd(), 'models'),                // dev run
    path.join(__dirname, '..', 'models'),              // alt dev structure
    path.join(process.resourcesPath || '', 'models'),  // packaged app
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return path.join(process.cwd(), 'models');
}

export const MODEL_ROOT = pickModelRoot();
console.log('[AI] MODEL_ROOT =', MODEL_ROOT);

// Disable downloads and set transformers local path
txEnv.allowRemoteModels = false;
txEnv.localModelPath = MODEL_ROOT;

// ---------------------------------------------------------
// Embedding model (Xenova bge-small-en-v1.5)
// ---------------------------------------------------------
const EMBED_REPO = path.join('embeddings', 'Xenova-bge-small-en-v1.5');
export const EMBED_DIR = path.join(MODEL_ROOT, EMBED_REPO);
console.log('[AI] EMBED_DIR  =', EMBED_DIR);

// ---------------------------------------------------------
// LLM model (Phi-3-mini-4k-instruct-q4.gguf)
// ---------------------------------------------------------
const DEFAULT_LLM_CANDIDATES = [
  path.join(MODEL_ROOT, 'llm', 'Phi-3-mini-4k-instruct-q4.gguf'),
  path.join(MODEL_ROOT, 'llm', 'phi-3-mini-4k-instruct.Q4_0.gguf'),
  path.join(MODEL_ROOT, 'llm', 'phi-3-mini-4k-instruct-q4_0.gguf'),
];
const LLM_FILE = process.env.LOCAL_LLM_PATH || DEFAULT_LLM_CANDIDATES.find(p => fs.existsSync(p)) || null;
console.log('[AI] LLM_FILE   =', LLM_FILE);

// ---------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------
function fileExists(p) {
  try { fs.accessSync(p, fs.constants.R_OK); return true; }
  catch { return false; }
}

// Verify models exist
export function engineFilesOk() {
  const required = [
    path.join(EMBED_DIR, 'config.json'),
    path.join(EMBED_DIR, 'tokenizer.json'),
    [ // any ONNX form accepted
      path.join(EMBED_DIR, 'onnx', 'model.onnx'),
      path.join(EMBED_DIR, 'onnx', 'model_quantized.onnx'),
      path.join(EMBED_DIR, 'model.onnx'),
      path.join(EMBED_DIR, 'model_quantized.onnx'),
    ],
  ];

  const missing = [];
  for (const req of required) {
    if (Array.isArray(req)) {
      if (!req.some(p => fileExists(p))) missing.push(`One of: ${req.join(' OR ')}`);
    } else if (!fileExists(req)) {
      missing.push(req);
    }
  }

  const okEmb = missing.length === 0;
  const okLLM = !!LLM_FILE && fileExists(LLM_FILE);

  if (!okEmb || !okLLM) {
    if (!okEmb) {
      console.warn('[AI] Embedding model files missing:\n - ' + missing.join('\n - '));
      console.warn('[AI] Checked under:', EMBED_DIR);
    }
    if (!okLLM) {
      console.warn('[AI] LLM file not found. Looked for:\n - ' + DEFAULT_LLM_CANDIDATES.join('\n - '));
    }
    return false;
  }
  return true;
}

// ---------------------------------------------------------
// Embedding pipeline (feature-extraction)
// ---------------------------------------------------------
let extractor = null;
export async function initEmbeddings() {
  if (extractor) return extractor;
  // Use absolute path to local folder
  extractor = await pipeline('feature-extraction', EMBED_REPO, { quantized: false });
  return extractor;
}

export async function embedAll(texts) {
  const arr = Array.isArray(texts) ? texts : [texts];
  const pipe = await initEmbeddings();
  const out = [];

  for (const t of arr) {
    const res = await pipe(t, { pooling: 'mean' }); // returns 1×d mean vector
    const v = Float32Array.from(res.data);

    // L2 normalize
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    const n = Math.sqrt(s) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;

    out.push(v);
  }

  return out;
}

// ---------------------------------------------------------
// GPT4All LLM (Phi-3-mini-4k-instruct-q4.gguf)
// ---------------------------------------------------------
let gpt = null;
let gptOpened = false;

export async function initLLM() {
  if (gpt && gptOpened) return gpt;
  if (!LLM_FILE) throw new Error('Local LLM file not found. Place Phi-3-mini-4k-instruct-q4.gguf in models/llm/');
  const modelPath = path.dirname(LLM_FILE);
  const modelName = path.basename(LLM_FILE);

  gpt = new Gpt4All(modelName, {
    modelPath,
    verbose: false,
    allowDownload: false,
  });

  await gpt.init();
  await gpt.open();
  gptOpened = true;
  return gpt;
}

export async function chatWithContext(system, user) {
  const gpt = await initLLM();
  return gpt.prompt(user, { systemPrompt: system, temp: 0.2 });
}

export async function shutdownLLM() {
  try {
    if (gpt && gptOpened) {
      await gpt.close();
      gptOpened = false;
    }
  } catch (e) {
    console.warn('[AI] shutdownLLM:', e);
  }
}
