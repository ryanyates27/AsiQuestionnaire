// electron/main.js
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { searchQuestions, addQuestion /*, editQuestion, removeQuestion */ } from './QueryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL('http://localhost:5173');
  //win.webContents.openDevTools();  // <-- so you can see logs and errors
}

app.whenReady().then(() => {
  createWindow();

  // ─── IPC: Get Questions ─────────────────────────────────
  ipcMain.handle('getQuestions', async (event, query) => {
    console.log('⏳ getQuestions query:', query);
    try {
      const results = await searchQuestions(query);
      console.log('✅ getQuestions returned', results.length, 'items');
      return results;
    } catch (err) {
      console.error('🔥 Error in getQuestions handler:', err);
      throw err;
    }
  });

  // ─── IPC: Add Question ───────────────────────────────────
  ipcMain.handle('addQuestion', async (event, payload) => {
    console.log('⏳ addQuestion payload:', payload);
    try {
      const result = await addQuestion(payload);
      console.log('✅ addQuestion result:', result);
      return result;
    } catch (err) {
      console.error('🔥 Error in addQuestion handler:', err);
      throw err;
    }
  });

  // (Optional) edit/remove handlers if you have them
  // ipcMain.handle('editQuestion', async (e,p) => { ... });
  // ipcMain.handle('removeQuestion', async (e,id) => { ... });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
