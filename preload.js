const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Configurações
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Frota
  getFleetStatus: () => ipcRenderer.invoke('get-fleet-status'),
  dispatchFleet: (order, drivers) => ipcRenderer.invoke('dispatch-fleet', { order, drivers }),
  
  // Impressoras
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printJob: (printer, html) => ipcRenderer.invoke('print-job', { printer, html }),
  
  // Cardápio IA
  aiParseMenu: (text) => ipcRenderer.invoke('ai-parse-menu', text),
  
  // Backup
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: (backupData) => ipcRenderer.invoke('import-backup', backupData),
  
  // Eventos do main para renderer
  onDriverPos: (callback) => ipcRenderer.on('driver-pos', callback),
  onDriverAccepted: (callback) => ipcRenderer.on('driver-accepted', callback),
  onShowQR: (callback) => ipcRenderer.on('show-qr', callback),
  onBotStatus: (callback) => ipcRenderer.on('bot-status', callback)
});
