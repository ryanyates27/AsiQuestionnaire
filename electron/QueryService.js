import Fuse from 'fuse.js';
import {
  getAllQuestions,
  insertQuestion,
  updateQuestion,
  deleteQuestion,
  setQuestionApproval,
  verifyUser,
  ftsReady,                 
  searchApprovedFTS,        
  searchAllFTS,
  attachPocketBaseId            

} from './SQLiteService.js';

// local engine (Ollama)
//|-------------------------------------------------------------------------------------------------------------------------------------------|
import { engineFilesOk, embedAll, chatWithContext } from './BundledAIService.js';
import { upsertVector, getVectorsByIds, getIdsMissingVectors } from './SQLiteService.js';

function dot(a, b){ let s=0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; } 
function minMax(arr){ if(!arr.length) return {min:0,max:1}; let mn=arr[0],mx=arr[0]; for(const v of arr){if(v<mn)mn=v;if(v>mx)mx=v;} return {min:mn,max:mx===mn?mn+1e-6:mx}; } 
const mkText = (r) => [r.siteName, r.tag, r.subtag, r.question, r.answer, r.additionalInfo].filter(Boolean).join(' | '); 

export async function backfillLocalEmbeddings(batch=64) {
  if (!engineFilesOk()) return 0;
  const missing = getIdsMissingVectors(10000);
  if (!missing.length) return 0;
  const all = getAllQuestions(); const map = new Map(all.map(r=>[r.id,r]));
  let done=0;
  for (let i=0; i<missing.length; i+=batch) {
    const slice = missing.slice(i,i+batch);
    const texts = slice.map(id => mkText(map.get(id)));
    const vecs = await embedAll(texts);
    for (let j=0;j<slice.length;j++) upsertVector(slice[j], vecs[j]);
    done += slice.length;
  }
  return done;
}

export async function hybridSearchApprovedSemantic(query, k=8) {                
  const allApproved = getAllQuestions().filter(q=> q.approved === 1);
  if (!allApproved.length || !query?.trim()) return allApproved.slice(0,k);
  const ids = allApproved.map(r=>r.id);
  const vecRows = getVectorsByIds(ids);
  const have = new Set(vecRows.map(v=>v.id));
  const toMake = ids.filter(id => !have.has(id));
  if (toMake.length && engineFilesOk()) {
    const toMakeRows = allApproved.filter(r => toMake.includes(r.id));
    const vecs = await embedAll(toMakeRows.map(mkText));
    for (let i=0;i<toMakeRows.length;i++) upsertVector(toMakeRows[i].id, vecs[i]);
    vecRows.push(...getVectorsByIds(toMake));
  }
  // Query vector
  let qv = null;
  if (engineFilesOk()) qv = (await embedAll(query))[0];
  // Score (semantic if available, otherwise quick keyword signal)
  const bm = (row) => {
    const ql = query.toLowerCase();
    const hay = mkText(row).toLowerCase();
    return (hay.includes(ql) ? 1 : 0) + (row.question?.toLowerCase().includes(ql)?0.5:0);
  };
  const bmVals = allApproved.map(bm); const {min:bmMin,max:bmMax}=minMax(bmVals);
  const vecMap = new Map(vecRows.map(x=>[x.id,x.vec]));
  const scored = allApproved.map(r=>{
    const v = vecMap.get(r.id);
    const semantic = (qv && v) ? (dot(qv,v)+1)/2 : 0;
    const bmN = (bmMax===bmMin)?0.5: (bm(r)-bmMin)/(bmMax-bmMin);
    const final = qv ? (0.6*semantic + 0.4*bmN) : bmN;
    return {...r, score: final};
  }).sort((a,b)=>b.score-a.score).slice(0,k);
  return scored;
}

export async function askAIWithRAG(question, k=6) {                             
  const top = await hybridSearchApprovedSemantic(question, k);
  const snippets = top.map(r => ({ id:r.id, siteName:r.siteName, tag:r.tag, subtag:r.subtag, question:r.question, answer:r.answer }));
  if (!engineFilesOk()) {
    // Offline engine not available → deterministic extractive fallback
    const body = snippets.slice(0,3).map(s=>`• ${s.answer?.trim()}`).join('\n');
    return { answer: `Based on local entries:\n${body}\n\nSources: ${snippets.slice(0,3).map(s=>`[id:${s.id}]`).join(' ')}`, sources: snippets, offline:true };
  }
  const system = `You are a local compliance Q&A assistant. Use ONLY provided context. Answer concisely (4–8 sentences). Cite [id:X]. If unsure, say you need more info.`;
  const ctx = snippets.map(s=>`[id:${s.id}] site=${s.siteName||''} tag=${s.tag||''} sub=${s.subtag||''}\nQ: ${s.question}\nA: ${s.answer}`).join('\n\n');
  const user = `Question:\n${question}\n\nContext:\n${ctx}`;
  const answer = await chatWithContext(system, user);
  return { answer, sources: snippets };
}

//|-------------------------------------------------------------------------------------------------------------------------------------------|

// (A) All questions, regardless of approved state
export function searchAllQuestions(query) {
  const all = getAllQuestions();                     
  if (!query?.trim()) return all;                    
  const ftsRows = searchAllFTS(query);               
  if (ftsRows) return ftsRows;                       
  const fuse = new Fuse(all, {
    keys: ['siteName','tag','subtag','question','answer','additionalInfo'],
    threshold: 0.4
  });
  return fuse.search(query).map(r => r.item);
}

// (B) Only approved questions
export function searchApprovedQuestions(query) {
  const all = getAllQuestions().filter(q => q.approved === 1); 
  if (!query?.trim()) return all;                              
  const ftsRows = searchApprovedFTS(query);                    
  if (ftsRows) return ftsRows;                                 
  const fuse = new Fuse(all, {
    keys: ['siteName','tag','subtag','question','answer','additionalInfo'],
    threshold: 0.4
  });
  return fuse.search(query).map(r => r.item);
}

export function findSimilarApproved(text, max = 10) {
  const all = getAllQuestions().filter(q => q.approved === 1);
  const fuse = new Fuse(all, {
    keys: ['question','answer'],
    threshold: 0.4,
    includeScore: true
  });
  return fuse.search(text).slice(0, max).map(r => r.item);
}

// CREATE
// CHANGED: pass through approved (normalize to 0/1) and, if needed,
//          also force it via setQuestionApproval after insert.
export function addQuestion(p) {
  const payload = {
    ...p,
    ...(p.hasOwnProperty('approved')
      ? { approved: (p.approved === 1 || p.approved === true) ? 1 : 0 }
      : {} ),
  };
  const res = insertQuestion(payload);
  // In case SQLiteService.insertQuestion ignores 'approved', force it:
  try {
    if (p.hasOwnProperty('approved')) {
      const id = (res && res.id) || p.id;   // insert may return new id or we supplied PB id
      if (id != null) setQuestionApproval(id, !!p.approved);
    }
  } catch { /* ignore */ }
  return res;
}

// UPDATE
// CHANGED: pass through approved (normalize) and force via setter if needed
export function editQuestion(p) {
  if (!p || p.id == null) {
    throw new Error('editQuestion requires an object with a valid id');
  }

  const payload = {
    ...p,
    ...(p.hasOwnProperty('approved')
      ? { approved: (p.approved === 1 || p.approved === true) ? 1 : 0 }
      : {} ),
  };

  const ok = updateQuestion(payload);
  try {
    if (p.hasOwnProperty('approved') && p.id != null) {
      setQuestionApproval(p.id, !!p.approved);
    }
  } catch { /* ignore */ }
  return ok;
}

// DELETE
export function removeQuestion(id) {
  return deleteQuestion(id);
}

// MARK APPROVED
export function approveQuestion(id) {
  return setQuestionApproval(id, true);
}

// NEW: explicit unapprove / generic setter (handy for sync code)
export function unapproveQuestion(id) {
  return setQuestionApproval(id, false);
}

export function setApproval(id, approved) {
  return setQuestionApproval(id, !!approved);
}

export function loginUser({ username, password }) {
  return verifyUser(username, password);
}