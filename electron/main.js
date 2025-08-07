// electron/main.js
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  searchAllQuestions,
  searchApprovedQuestions,
  addQuestion,
  editQuestion,
  removeQuestion,
  approveQuestion,
  findSimilarApproved,
  loginUser
} from './QueryService.js';

import {
  getAllArchiveEntries,
  insertArchiveEntry
} from './SQLiteService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load or initialize user config (stores apiEndpoint)
const configPath = path.join(app.getPath('userData'), 'config.json');
let config = { apiEndpoint: 'local' };
try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(raw);
} catch {
  // no config yet, use defaults
}

// Expose config via IPC
ipcMain.handle('getConfig', () => config);
ipcMain.handle('setConfig', (_e, newCfg) => {
  config = { ...config, ...newCfg };
  fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');
  return config;
});

// In-memory session uploads (cleared on app close)
let sessionUploads = [];
ipcMain.handle('getSessionUploads',   () => sessionUploads);
ipcMain.handle('addSessionUpload',    (_e, row) => { sessionUploads.push(row); return true; });
ipcMain.handle('clearSessionUploads', () => { sessionUploads = []; return true; });

// Helpers for PDF archive storage
function ensureArchiveDir() {
  const dir = path.join(app.getPath('userData'), 'questionnaire_pdfs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function safeName(str) {
  return str.replace(/[^a-z0-9-_ ]/gi, '').trim();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL('http://localhost:5173');

  // LOGIN
  ipcMain.handle('login', (_e, { username, password }) => {
    const user = loginUser({ username, password });
    return user || null;
  });

  // SEARCHPAGE: approved only
  ipcMain.handle('getQuestions', async (_e, query) => {
    if (config.apiEndpoint === 'local') {
      return searchApprovedQuestions(query);
    } else {
      const url = `${config.apiEndpoint}/api/questions?approved=true&q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      return res.ok ? res.json() : [];
    }
  });

  // MANAGEPAGE: all/approved/unapproved
  ipcMain.handle('getManageQuestions', async (_e, { query, status }) => {
    if (config.apiEndpoint === 'local') {
      switch (status) {
        case 'approved':   return searchApprovedQuestions(query);
        case 'unapproved': return searchAllQuestions(query).filter(q => q.approved === 0);
        default:           return searchAllQuestions(query);
      }
    } else {
      const url = `${config.apiEndpoint}/api/manage?status=${status}&q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      return res.ok ? res.json() : [];
    }
  });

  // CREATE
  ipcMain.handle('addQuestion', async (_e, payload) => {
    if (config.apiEndpoint === 'local') {
      return addQuestion(payload);
    } else {
      const res = await fetch(`${config.apiEndpoint}/api/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok ? res.json() : { error: 'Failed' };
    }
  });

  // UPDATE
  ipcMain.handle('editQuestion', async (_e, payload) => {
    if (config.apiEndpoint === 'local') {
      return editQuestion(payload);
    } else {
      await fetch(`${config.apiEndpoint}/api/questions/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return true;
    }
  });

  // DELETE
  ipcMain.handle('removeQuestion', async (_e, id) => {
    if (config.apiEndpoint === 'local') {
      return removeQuestion(id);
    } else {
      await fetch(`${config.apiEndpoint}/api/questions/${id}`, { method: 'DELETE' });
      return true;
    }
  });

  // APPROVE
  ipcMain.handle('approveQuestion', async (_e, id) => {
    if (config.apiEndpoint === 'local') {
      return approveQuestion(id);
    } else {
      await fetch(`${config.apiEndpoint}/api/questions/${id}/approve`, { method: 'POST' });
      return true;
    }
  });

  // FIND SIMILAR
  ipcMain.handle('findSimilarApproved', async (_e, { text, max }) => {
    if (config.apiEndpoint === 'local') {
      return findSimilarApproved(text, max);
    } else {
      const res = await fetch(`${config.apiEndpoint}/api/questions/similar?max=${max}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      return res.ok ? res.json() : [];
    }
  });

  // ARCHIVE LIST
  ipcMain.handle('getArchiveEntries', async () => {
    if (config.apiEndpoint === 'local') {
      return getAllArchiveEntries();
    } else {
      const res = await fetch(`${config.apiEndpoint}/api/archive`);
      return res.ok ? res.json() : [];
    }
  });

  // ARCHIVE UPLOAD
  ipcMain.handle('addArchiveEntry', async (_e, data) => {
    if (config.apiEndpoint === 'local') {
      const dir       = ensureArchiveDir();
      const clean     = safeName(data.siteName);
      const baseName  = data.filename
        ? path.parse(data.filename).name
        : `${clean}__${data.year}`;
      const finalName = `${baseName}.pdf`;
      const dest      = path.join(dir, finalName);

      if (data.tempPath) {
        fs.copyFileSync(data.tempPath, dest);
      } else {
        fs.writeFileSync(dest, Buffer.from(data.buffer));
      }
      return insertArchiveEntry({ siteName: clean, year: data.year, filePath: dest });
    } else {
      // TODO: implement remote PDF upload
      return { error: 'Remote archive upload not implemented yet' };
    }
  });

  // OPEN ARCHIVE PDF
  ipcMain.handle('openArchivePDF', (_e, { filePath }) => {
    const full = fs.existsSync(filePath)
      ? filePath
      : path.join(app.getPath('userData'), filePath);
    if (!fs.existsSync(full)) throw new Error('File not found');
    shell.openPath(full);
    return true;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
