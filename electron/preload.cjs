const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getQuestions:   (query)   => ipcRenderer.invoke('getQuestions', query),
  addQuestion:    (payload) => ipcRenderer.invoke('addQuestion', payload),
  editQuestion:   (payload) => ipcRenderer.invoke('editQuestion', payload),
  removeQuestion: (id)      => ipcRenderer.invoke('removeQuestion', id)
});
