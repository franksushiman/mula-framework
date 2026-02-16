const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  healthPing: () => ipcRenderer.invoke('health:ping'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
