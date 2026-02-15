const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer no objeto window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDrivers: () => ipcRenderer.invoke('get-drivers'),
  onFleetUpdate: (callback) => ipcRenderer.on('fleet-update', (event, ...args) => callback(...args)),
});
