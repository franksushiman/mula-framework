const { contextBridge } = require('electron');

// Expor APIs seguras para o renderer no objeto window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  // As funções para comunicação entre main e renderer serão adicionadas aqui.
});
