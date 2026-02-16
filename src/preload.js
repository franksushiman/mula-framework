const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer no objeto window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  // Prova de vida
  healthPing: () => ipcRenderer.invoke('health:ping'),

  // Funções existentes
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDrivers: () => ipcRenderer.invoke('get-drivers'),
  onFleetUpdate: (callback) => ipcRenderer.on('fleet-update', (event, ...args) => callback(...args)),

  // --- Novas APIs da camada de dados ---
  // Config
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Menu
  getMenu: () => ipcRenderer.invoke('get-menu'),
  saveMenu: (menuData) => ipcRenderer.invoke('save-menu', menuData),
  updateItemAvailability: (id, isAvailable) => ipcRenderer.invoke('update-item-availability', { id, isAvailable }),

  // Orders
  getOpenOrders: () => ipcRenderer.invoke('get-open-orders'),
  createOrder: (orderData) => ipcRenderer.invoke('create-order', orderData),
  updateOrderStatus: (id, status) => ipcRenderer.invoke('update-order-status', { id, status }),

  // WhatsApp
  initializeWhatsApp: (config) => ipcRenderer.invoke('initialize-whatsapp', config),
  getWhatsAppStatus: () => ipcRenderer.invoke('get-whatsapp-status'),
  sendWhatsAppMessage: (phone, message) => ipcRenderer.invoke('send-whatsapp-message', { phone, message }),
});
