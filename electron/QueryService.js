import Fuse from 'fuse.js';
import {
  getAllQuestions,
  insertQuestion,
  updateQuestion,
  deleteQuestion,
  setQuestionApproval,
  verifyUser
} from './SQLiteService.js';

// (A) All questions, regardless of approved state
export function searchAllQuestions(query) {
  const all = getAllQuestions();
  if (!query?.trim()) return all;
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
export function addQuestion(p) {
  return insertQuestion(p);
}

// UPDATE
export function editQuestion(p) {
  return updateQuestion(p);
}

// DELETE
export function removeQuestion(id) {
  return deleteQuestion(id);
}

// MARK APPROVED
export function approveQuestion(id) {
  return setQuestionApproval(id, true);
}

export function loginUser({ username, password }) {
  return verifyUser(username, password);
}