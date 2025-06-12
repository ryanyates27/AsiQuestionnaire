import Fuse from 'fuse.js';
import {
  getAllQuestions,
  insertQuestion,
  updateQuestion,
  deleteQuestion
} from './SQLiteService.js';

// Full-text search over all fields, including subtag
export function searchQuestions(query) {
  const all = getAllQuestions();
  if (!query?.trim()) return all;
  const fuse = new Fuse(all, {
    keys: ['siteName', 'tag', 'subtag', 'question', 'answer', 'additionalInfo'],
    threshold: 0.4,
  });
  return fuse.search(query).map(r => r.item);
}

// CREATE
export function addQuestion({ siteName, tag, subtag, question, answer, additionalInfo }) {
  return insertQuestion({ siteName, tag, subtag, question, answer, additionalInfo });
}

// UPDATE
export function editQuestion({ id, siteName, tag, subtag, question, answer, additionalInfo }) {
  return updateQuestion({ id, siteName, tag, subtag, question, answer, additionalInfo });
}

// DELETE
export function removeQuestion(id) {
  return deleteQuestion(id);
}
