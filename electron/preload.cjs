// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getQuestions:   (q) => ipcRenderer.invoke('getQuestions', q),
  addQuestion:    (p) => ipcRenderer.invoke('addQuestion', p),
  // editQuestion:   (p) => ipcRenderer.invoke('editQuestion', p),
  // removeQuestion:(id)=> ipcRenderer.invoke('removeQuestion', id),
});
