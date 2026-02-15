const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer no objeto window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
