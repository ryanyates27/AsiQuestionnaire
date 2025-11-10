// electron/preload.cjs
// Exposes safe IPC bridges for local DB + PocketBase
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('getConfig'),
  setConfig: (newCfg) => ipcRenderer.invoke('setConfig', newCfg),

  // Local auth (SQLite)
  login: (creds) => ipcRenderer.invoke('login', creds),

  // PocketBase (NEW)
  pb: {
    health: () => ipcRenderer.invoke('pb.health'),
    login: (creds) => ipcRenderer.invoke('pb.login', creds), // { identity, password }
    logout: () => ipcRenderer.invoke('pb.logout'),
    upsertVector: (payload) => ipcRenderer.invoke('pb.vectors.upsert', payload), // { questionId, embedding }
    testCreate: (row) => ipcRenderer.invoke('pb.testCreate', row),
  },

  // Search/Manage/CRUD – these switch between 'local' and 'pocketbase' based on config.apiEndpoint
  getQuestions: (query) => ipcRenderer.invoke('getQuestions', query),
  getManageQuestions: (args) => ipcRenderer.invoke('getManageQuestions', args),
  addQuestion: (payload) => ipcRenderer.invoke('addQuestion', payload),
  editQuestion: (payload) => ipcRenderer.invoke('editQuestion', payload),
  removeQuestion: (id) => ipcRenderer.invoke('removeQuestion', id),
  approveQuestion: (id) => ipcRenderer.invoke('approveQuestion', id),

  //session uploads API (front → main)
  addSessionUpload: (row) => ipcRenderer.invoke('addSessionUpload', row),     // CHANGED
  getSessionUploads: () => ipcRenderer.invoke('getSessionUploads'),          // CHANGED
  clearSessionUploads: () => ipcRenderer.invoke('clearSessionUploads'),      // CHANGED

  // Archive (local + PB)
  getArchiveEntries: () => ipcRenderer.invoke('getArchiveEntries'),
  addArchiveEntry: (data) => ipcRenderer.invoke('addArchiveEntry', data), // { siteName, year, tempPath|buffer, filename? }
  openArchivePDF: (args) => ipcRenderer.invoke('openArchivePDF', args),
  removeArchiveEntry: (payload) => ipcRenderer.invoke('removeArchiveEntry', payload),
  downloadArchiveEntry: (payload) => ipcRenderer.invoke('downloadArchiveEntry', payload),
  getArchivePreviewUrl: (payload) => ipcRenderer.invoke('getArchivePreviewUrl', payload), // ADDED
  getArchivePreviewDataUrl: (payload) => ipcRenderer.invoke('getArchivePreviewDataUrl', payload),


  // Maintenance
  maintenanceRebuildFTS: () => ipcRenderer.invoke('maintenance.rebuildFTS'),

  // AI
  aiAsk: (args) => ipcRenderer.invoke('ai:ask', args),
  // ✅ Alias so both spellings work in the renderer
  askAI: (args) => ipcRenderer.invoke('ai:ask', args),

  // ✅ Tiny healthcheck many UIs call before using the bridge
  ping: () => Promise.resolve('pong'),

  sync: {
  getState: () => ipcRenderer.invoke('sync.getState'),
  start: () => ipcRenderer.invoke('sync.start'),
  publish: () => ipcRenderer.invoke('sync.publish'),
  reset:     () => ipcRenderer.invoke('sync.reset'),
  
  pull:      () => ipcRenderer.invoke('sync.pull'),
  onState:   (cb) => {             
     // Subscribe to main's 'sync.state' broadcasts. Returns an unsubscribe fn.                  
    if (typeof cb !== 'function') return () => {};
    const handler = (_evt, state) => cb(state);
    ipcRenderer.on('sync.state', handler);
    // return unsubscribe function
    return () => ipcRenderer.removeListener('sync.state', handler);
  },
  
  },

});
