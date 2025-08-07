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

// === MIGRATION: ensure `approved` column exists ===
const cols = db
  .prepare("PRAGMA table_info(questions);")
  .all()
  .map(r => r.name);
if (cols.length && !cols.includes('approved')) {
  // existing table without approved → add it
  db.exec("ALTER TABLE questions ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;");
}

// === On fresh install, create questions (with approved) if missing ===
if (!cols.length) {
  db.exec(`
    CREATE TABLE questions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      siteName       TEXT    NOT NULL,
      tag            TEXT    NOT NULL,
      subtag         TEXT    NOT NULL,
      question       TEXT    NOT NULL,
      answer         TEXT    NOT NULL,
      additionalInfo TEXT,
      approved       INTEGER NOT NULL DEFAULT 0
    );
  `);
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

export function insertQuestion({ siteName, tag, subtag, question, answer, additionalInfo }) {
  const stmt = db.prepare(`
    INSERT INTO questions (siteName, tag, subtag, question, answer, additionalInfo)
    VALUES (?, ?, ?, ?, ?, ?);
  `);
  const info = stmt.run(siteName, tag, subtag, question, answer, additionalInfo);
  return { id: info.lastInsertRowid };
}

export function updateQuestion({ id, siteName, tag, subtag, question, answer, additionalInfo }) {
  const stmt = db.prepare(`
    UPDATE questions
    SET siteName = ?, tag = ?, subtag = ?, question = ?, answer = ?, additionalInfo = ?
    WHERE id = ?;
  `);
  const info = stmt.run(siteName, tag, subtag, question, answer, additionalInfo, id);
  return info.changes;
}

export function deleteQuestion(id) {
  const stmt = db.prepare('DELETE FROM questions WHERE id = ?;');
  const info = stmt.run(id);
  return info.changes;
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
