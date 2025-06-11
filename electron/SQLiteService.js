// electron/SQLiteService.js
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const dbPath     = path.join(__dirname, 'questions.db');

// Remove old DB file so schema is always fresh
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new Database(dbPath);

// Create table with the exact columns your UI is sending
db.exec(`
  CREATE TABLE questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    siteName       TEXT    NOT NULL,
    tag            TEXT    NOT NULL,
    subtag         TEXT    NOT NULL,  
    question       TEXT    NOT NULL,
    answer         TEXT    NOT NULL,
    additionalInfo TEXT
  );
`);  

export function getAllQuestions() {
  return db.prepare('SELECT * FROM questions').all();
}

export function insertQuestion({ siteName, tag, subtag, question, answer, additionalInfo }) {
  console.log('🗄️ insertQuestion called with:', { siteName, tag, subtag, question, answer, additionalInfo });
  const stmt = db.prepare(`
    INSERT INTO questions
      (siteName, tag, subtag, question, answer, additionalInfo)
    VALUES (?, ?, ?, ?, ?, ?);
  `);

  try {
    const info = stmt.run(
      siteName,
      tag,
      subtag,
      question,
      answer,
      additionalInfo || ''
    );
    console.log('🗄️ insertQuestion succeeded, new id:', info.lastInsertRowid);
    return {
      id:             info.lastInsertRowid,
      siteName,
      tag,
      subtag,
      question,
      answer,
      additionalInfo
    };
  } catch (dbErr) {
    console.error('🛑 insertQuestion DB error:', dbErr);
    throw dbErr;
  }
}

export function updateQuestion({ id, siteName, tag, subtag, question, answer, additionalInfo }) {
  const stmt = db.prepare(`
    UPDATE questions
       SET siteName = ?, tag = ?, subtag = ?, question = ?, answer = ?, additionalInfo = ?
     WHERE id = ?;
  `);

  try {
    const info = stmt.run(
      siteName,
      tag,
      subtag,
      question,
      answer,
      additionalInfo || '',
      id
    );
    console.log('🗄️ updateQuestion changed rows:', info.changes);
    return info.changes;
  } catch (dbErr) {
    console.error('🛑 updateQuestion DB error:', dbErr);
    throw dbErr;
  }
}

export function deleteQuestion(id) {
  const stmt = db.prepare(`DELETE FROM questions WHERE id = ?;`);
  try {
    const info = stmt.run(id);
    console.log('🗄️ deleteQuestion changed rows:', info.changes);
    return info.changes;
  } catch (dbErr) {
    console.error('🛑 deleteQuestion DB error:', dbErr);
    throw dbErr;
  }
}
