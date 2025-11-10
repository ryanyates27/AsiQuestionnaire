// electron/SQLiteService.js
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, 'questions.db');

// Open (or create) the database file
const db = new Database(dbPath);

// === MIGRATION: schema introspection ===
const cols = db
  .prepare("PRAGMA table_info(questions);")
  .all()
  .map(r => r.name);

// (A) If table exists and is missing 'approved' → add it
if (cols.length && !cols.includes('approved')) {
  db.exec("ALTER TABLE questions ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;");
}

// (B) If table exists and is missing 'pb_id' → add it (no UNIQUE in ALTER)
if (cols.length && !cols.includes('pb_id')) {
  db.exec("ALTER TABLE questions ADD COLUMN pb_id TEXT;");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_pb_id ON questions(pb_id);");
}

// === On fresh install (no table) → create full schema with pb_id + approved ===
if (!cols.length) {
  db.exec(`
    CREATE TABLE questions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      pb_id          TEXT UNIQUE,
      siteName       TEXT    NOT NULL,
      tag            TEXT    NOT NULL,
      subtag         TEXT    NOT NULL,
      question       TEXT    NOT NULL,
      answer         TEXT    NOT NULL,
      additionalInfo TEXT,
      approved       INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_pb_id ON questions(pb_id);");
}


// === Archive table (unchanged) ===
db.exec(`
  CREATE TABLE IF NOT EXISTS questionnaire_archive (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    siteName TEXT    NOT NULL,
    year     INTEGER NOT NULL,
    filePath TEXT    NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT    NOT NULL UNIQUE,
    password TEXT    NOT NULL,
    role     TEXT    NOT NULL
  );
`);

// ===== FTS5: Ranked keyword search index (question/answer/tags/site) =====  
let __ftsReady = true;                                                        
try {                                                                          
  db.exec(`                                                                   
    CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(              
      siteName, tag, subtag, question, answer, additionalInfo,                
      content='questions', content_rowid='id'                                 
    );                                                                        
                                                                               
    CREATE TRIGGER IF NOT EXISTS questions_ai AFTER INSERT ON questions BEGIN 
      INSERT INTO questions_fts(rowid, siteName, tag, subtag, question, answer, additionalInfo)
      VALUES (new.id, new.siteName, new.tag, new.subtag, new.question, new.answer, new.additionalInfo);
    END;                                                                      
    CREATE TRIGGER IF NOT EXISTS questions_ad AFTER DELETE ON questions BEGIN 
      INSERT INTO questions_fts(questions_fts, rowid) VALUES('delete', old.id);
    END;                                                                      
    CREATE TRIGGER IF NOT EXISTS questions_au AFTER UPDATE ON questions BEGIN 
      INSERT INTO questions_fts(questions_fts, rowid) VALUES('delete', old.id);
      INSERT INTO questions_fts(rowid, siteName, tag, subtag, question, answer, additionalInfo)
      VALUES (new.id, new.siteName, new.tag, new.subtag, new.question, new.answer, new.additionalInfo);
    END;                                                                      
  `);

  // Vectors table for semantic search
db.exec(`
  CREATE TABLE IF NOT EXISTS qa_vectors (
    id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,
    dim INTEGER NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
                                                                           
  // One-time backfill (if FTS is empty)                                      
  const ftsCount = db.prepare('SELECT count(*) AS c FROM questions_fts;').get().c; 
  if (ftsCount === 0) {                                                       
    db.exec(`                                                                  
      INSERT INTO questions_fts(rowid, siteName, tag, subtag, question, answer, additionalInfo)
      SELECT id, siteName, tag, subtag, question, answer, additionalInfo FROM questions;
    `);                                                                       
  }                                                                           
} catch (e) {                                                                  
  __ftsReady = false; // library built without FTS5 → fallback to Fuse        
}                                                                              

export function ftsReady() { return __ftsReady; }

// ===== FTS5: Query Sanitizer (NEW) =====
// CHANGED: sanitize input so punctuation (like :, ?, ') doesn't break FTS5 parsing.
// Produces an ANDed list of token* terms for forgiving prefix matches.
function buildFtsQuery(userInput) {
  if (!userInput) return '';

  // Prefer Unicode letters/digits; fall back to ASCII if engine lacks \p{}.
  let tokens = [];
  try {
    tokens = userInput.match(/[\p{L}\p{N}]+/gu) || [];
  } catch {
    tokens = userInput.match(/[A-Za-z0-9]+/g) || [];
  }

  tokens = tokens.map(t => t.toLowerCase());
  if (tokens.length === 0) return '';

  // AND all tokens; prefix-search each
  return tokens.map(t => `${t}*`).join(' AND ');
}

// Approved-only ranked search via FTS5                                       
export function searchApprovedFTS(query) {
  if (!__ftsReady) return null;

  // CHANGED: sanitize the user input before MATCH to avoid FTS5 syntax errors
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return []; // nothing searchable (only punctuation/spaces)

  return db.prepare(`
    SELECT q.*, bm25(questions_fts) AS score
    FROM questions_fts
    JOIN questions q ON q.id = questions_fts.rowid
    WHERE q.approved = 1
      AND questions_fts MATCH ?
    ORDER BY score ASC
    LIMIT 100;
  `).all(ftsQuery);
}


// All-questions ranked search via FTS5                                       
export function searchAllFTS(query) {
  if (!__ftsReady) return null;

  // CHANGED: sanitize the user input before MATCH to avoid FTS5 syntax errors
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return []; // nothing searchable (only punctuation/spaces)

  return db.prepare(`
    SELECT q.*, bm25(questions_fts) AS score
    FROM questions_fts
    JOIN questions q ON q.id = questions_fts.rowid
    WHERE questions_fts MATCH ?
    ORDER BY score ASC
    LIMIT 100;
  `).all(ftsQuery);
}
const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users;').get().cnt;
if (userCount === 0) {
  const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?);');
  stmt.run('admin',  '12345', 'admin');
  stmt.run('normal', '23456', 'user');
}

// === VERIFY HELPER ===
export function verifyUser(username, password) {
  return db
    .prepare('SELECT id, username, role FROM users WHERE username = ? AND password = ?;')
    .get(username, password) || null;
}

// ===== Question Helpers =====
export function getAllQuestions() {
  return db.prepare('SELECT * FROM questions').all();
}

export function insertQuestion({ /* id (ignored here) */ pb_id, siteName, tag, subtag, question, answer, additionalInfo, approved = 0 }) {
  // Always let SQLite autogenerate `id`; store PB id in `pb_id`
  const stmt = db.prepare(`
    INSERT INTO questions (pb_id, siteName, tag, subtag, question, answer, additionalInfo, approved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const info = stmt.run(pb_id ?? null, siteName, tag, subtag, question, answer, additionalInfo, approved ? 1 : 0);
  return { id: info.lastInsertRowid };
}

// CHANGED: safer, partial update using named params + COALESCE
export function updateQuestion(partial) {
  const {
    id,
    pb_id,
    siteName,
    tag,
    subtag,
    question,
    answer,
    additionalInfo,
    approved,
  } = partial;

  if (id == null) {
    throw new Error('updateQuestion requires an id');
  }

  // Note: COALESCE(x, col) keeps the existing column when x is NULL.
  // We bind undefined → NULL so only provided keys update.
  const stmt = db.prepare(`
    UPDATE questions SET
      siteName       = COALESCE(@siteName,       siteName),
      tag            = COALESCE(@tag,            tag),
      subtag         = COALESCE(@subtag,         subtag),
      question       = COALESCE(@question,       question),
      answer         = COALESCE(@answer,         answer),
      additionalInfo = COALESCE(@additionalInfo, additionalInfo),
      approved       = COALESCE(@approved,       approved),
      pb_id          = COALESCE(@pb_id,          pb_id)
    WHERE id = @id;
  `);

  // Important: leave values as NULL when not provided; keep 0/false for approved.
  const bind = {
    id,
    siteName:       siteName       ?? null,
    tag:            tag            ?? null,
    subtag:         subtag         ?? null,
    question:       question       ?? null,
    answer:         answer         ?? null,
    additionalInfo: additionalInfo ?? null,
    approved:       (approved === undefined) ? null : (approved ? 1 : 0),
    pb_id:          (pb_id === undefined) ? null : pb_id ?? null,
  };

  const info = stmt.run(bind);
  return info.changes;
}

// OPTIONAL: look up a local row by PocketBase id (used by PB→Local sync upserts)
export function getQuestionByPocketBaseId(pb_id) {
  return db.prepare(`SELECT * FROM questions WHERE pb_id = ?`).get(pb_id);
}

// CHANGED: narrow helper for sync pipeline to attach PocketBase id only
export function attachPocketBaseId({ id, pb_id }) {
  if (id == null) throw new Error('attachPocketBaseId requires id');
  const stmt = db.prepare(`
    UPDATE questions
       SET pb_id = @pb_id
     WHERE id = @id;
  `);
  const info = stmt.run({ id, pb_id });
  return info.changes;
}


// In electron/SQLiteService.js
export function deleteQuestion(id) {
  const stmt = db.prepare('DELETE FROM questions WHERE id = ?;');
  try {
    const info = stmt.run(id);
    return info.changes;
  } catch (e) {
    if (String(e.code) === 'SQLITE_CORRUPT_VTAB') {
      rebuildFTS(); // from step 2
      const info = stmt.run(id); // retry once
      return info.changes;
    }
    throw e;
  }
}


// ===== Approval Helper =====
export function setQuestionApproval(id, approved) {
  const stmt = db.prepare('UPDATE questions SET approved = ? WHERE id = ?;');
  const info = stmt.run(approved ? 1 : 0, id);
  return info.changes;
}

// ===== Archive Helpers =====
export function getAllArchiveEntries() {
  return db
    .prepare('SELECT id, siteName, year, filePath FROM questionnaire_archive ORDER BY siteName ASC, year DESC;')
    .all();
}

export function insertArchiveEntry({ siteName, year, filePath }) {
  const stmt = db.prepare(`
    INSERT INTO questionnaire_archive (siteName, year, filePath)
    VALUES (?, ?, ?);
  `);
  const info = stmt.run(siteName, year, filePath);
  return { id: info.lastInsertRowid, siteName, year, filePath };
}

// ADDED: fetch one archive entry by id
export function getArchiveEntryById(id) {
  return db.prepare(
    `SELECT id, siteName, year, filePath
       FROM questionnaire_archive
      WHERE id = ?`
  ).get(id) || null;
}

// ADDED: hard-delete archive entry by id
export function deleteArchiveEntryById(id) {
  const info = db.prepare(
    `DELETE FROM questionnaire_archive WHERE id = ?`
  ).run(id);
  return info.changes;
}


export function upsertVector(id, float32) {                                    
  const buf = Buffer.from(new Uint8Array(float32.buffer));
  db.prepare(`
    REPLACE INTO qa_vectors (id, embedding, dim, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(id, buf, float32.length);
  return true;
}

export function getVectorsByIds(ids = []) {                                   
  if (!ids.length) return [];
  const marks = ids.map(()=>'?').join(',');
  const rows = db.prepare(`SELECT id, embedding, dim FROM qa_vectors WHERE id IN (${marks})`).all(...ids);
  return rows.map(r => {
    const b = Buffer.from(r.embedding);
    const v = new Float32Array(b.buffer, b.byteOffset, b.byteLength/4);
    return { id: r.id, vec: v, dim: r.dim };
  });
}

export function getIdsMissingVectors(limit = 1000) {                          
  return db.prepare(`
    SELECT q.id
    FROM questions q LEFT JOIN qa_vectors v ON v.id = q.id
    WHERE v.id IS NULL
    ORDER BY q.id ASC
    LIMIT ?
  `).all(limit).map(r => r.id);
}

// Add to electron/SQLiteService.js (bottom of file or near other exports)
export function rebuildFTS() {
  db.exec(`
    DROP TRIGGER IF EXISTS questions_ai;
    DROP TRIGGER IF EXISTS questions_ad;
    DROP TRIGGER IF EXISTS questions_au;
    DROP TABLE IF EXISTS questions_fts;
  `);

  // Recreate FTS + triggers (same as on startup)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS questions_fts USING fts5(
      siteName, tag, subtag, question, answer, additionalInfo,
      content='questions', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS questions_ai AFTER INSERT ON questions BEGIN
      INSERT INTO questions_fts(rowid, siteName, tag, subtag, question, answer, additionalInfo)
      VALUES (new.id, new.siteName, new.tag, new.subtag, new.question, new.answer, new.additionalInfo);
    END;
    CREATE TRIGGER IF NOT EXISTS questions_ad AFTER DELETE ON questions BEGIN
      INSERT INTO questions_fts(questions_fts, rowid) VALUES('delete', old.id);
    END;
    CREATE TRIGGER IF NOT EXISTS questions_au AFTER UPDATE ON questions BEGIN
      INSERT INTO questions_fts(questions_fts, rowid) VALUES('delete', old.id);
      INSERT INTO questions_fts(rowid, siteName, tag, subtag, question, answer, additionalInfo)
      VALUES (new.id, new.siteName, new.tag, new.subtag, new.question, new.answer, new.additionalInfo);
    END;
  `);

  // Full repopulate from canonical table
  db.exec(`
    INSERT INTO questions_fts(rowid, siteName, tag, subtag, question, answer, additionalInfo)
    SELECT id, siteName, tag, subtag, question, answer, additionalInfo FROM questions;
  `);
  return true;
}

