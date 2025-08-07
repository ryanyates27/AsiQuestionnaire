// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

  // get/set config (endpoint)
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setConfig: (cfg) => ipcRenderer.invoke('setConfig', cfg),

  // Existing question APIs
  getQuestions: (q) => ipcRenderer.invoke('getQuestions', q),           // approved only
  getManageQuestions: (opts) => ipcRenderer.invoke('getManageQuestions', opts),
  approveQuestion: (id) => ipcRenderer.invoke('approveQuestion', id),
  findSimilarApproved: (opts)    => ipcRenderer.invoke('findSimilarApproved', opts),
  addQuestion: (p) => ipcRenderer.invoke('addQuestion', p),
  editQuestion: (p) => ipcRenderer.invoke('editQuestion', p),
  removeQuestion: (id) => ipcRenderer.invoke('removeQuestion', id),

  // Login
  login: (creds) => ipcRenderer.invoke('login', creds),

  // New archive APIs
  getArchiveEntries: () => ipcRenderer.invoke('getArchiveEntries'),
  addArchiveEntry: (data) => ipcRenderer.invoke('addArchiveEntry', data),
  openArchivePDF: (data) => ipcRenderer.invoke('openArchivePDF', data),

  // NEW session upload APIs
  getSessionUploads: () => ipcRenderer.invoke('getSessionUploads'),
  addSessionUpload: (row) => ipcRenderer.invoke('addSessionUpload', row),
  clearSessionUploads: () => ipcRenderer.invoke('clearSessionUploads')
});
