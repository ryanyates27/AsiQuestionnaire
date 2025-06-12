// electron/main.js
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  searchQuestions,
  addQuestion,
  editQuestion,
  removeQuestion
} from './QueryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

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

  // ← Here’s the path fix:
  win.loadURL('http://localhost:5173')

  // IPC handlers
  ipcMain.handle('getQuestions',    (_e, q) => searchQuestions(q));
  ipcMain.handle('addQuestion',     (_e, p) => addQuestion(p));
  ipcMain.handle('editQuestion',    (_e, p) => editQuestion(p));
  ipcMain.handle('removeQuestion',  (_e, id) => removeQuestion(id));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
