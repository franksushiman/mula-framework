const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Configurações
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Frota
  getFleetStatus: () => ipcRenderer.invoke('get-fleet-status'),
  fleetInviteCreate: (data) => ipcRenderer.invoke('fleet-invite-create', data),
  requestDriverLocation: (data) => ipcRenderer.invoke('request-driver-location', data),
  dispatchFleet: (order, drivers) => ipcRenderer.invoke('dispatch-fleet', { order, drivers }),
  
  // Pedidos
  getPersistedOrders: () => ipcRenderer.invoke('get-persisted-orders'),
  saveOrders: (orders) => ipcRenderer.invoke('save-orders', orders),
  orderEdit: (data) => ipcRenderer.invoke('order-edit', data),
  orderEditConfirmDeltaPaid: (orderId) => ipcRenderer.invoke('order-edit-confirm-delta-paid', orderId),
  
  // Financeiro
  cashierClose: (data) => ipcRenderer.invoke('cashier-close', data),
  getDashboardSummary: (orders) => ipcRenderer.invoke('get-dashboard-summary', orders),
  
  // Mesas e Reservas
  tablesSave: (tables) => ipcRenderer.invoke('tables-save', tables),
  reservationCreate: (data) => ipcRenderer.invoke('reservation-create', data),
  reservationMarkNotificationSeen: (reservationId) => ipcRenderer.invoke('reservation-mark-notification-seen', reservationId),
  
  // WhatsApp e Telegram
  whatsappGetStatus: () => ipcRenderer.invoke('whatsapp-get-status'),
  whatsappGetQr: () => ipcRenderer.invoke('whatsapp-get-qr'),
  validateTelegramToken: (token) => ipcRenderer.invoke('validate-telegram-token', token),
  
  // Impressoras
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printJob: (printer, html) => ipcRenderer.send('print-job', { printer, html }),
  
  // Pagamentos
  paymentCreatePix: (data) => ipcRenderer.invoke('payment-create-pix', data),
  paymentCreateCard: (data) => ipcRenderer.invoke('payment-create-card', data),
  paymentCheckStatus: (paymentId) => ipcRenderer.invoke('payment-check-status', paymentId),
  paymentConfigsList: () => ipcRenderer.invoke('payment-configs-list'),
  paymentValidateAndSave: (data) => ipcRenderer.invoke('payment-validate-and-save', data),
  
  // IA
  aiParseMenu: (text) => ipcRenderer.invoke('ai-parse-menu', text),
  
  // Backup
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  
  // Telegram
  sendTelegramMessage: (data) => ipcRenderer.invoke('send-telegram-message', data),
  getTelegramUpdates: (botToken) => ipcRenderer.invoke('get-telegram-updates', botToken),
  
  // Bayleis
  testBayleisConnection: (data) => ipcRenderer.invoke('test-bayleis-connection', data),
  createBayleisPayment: (data) => ipcRenderer.invoke('create-bayleis-payment', data),
  
  // Eventos do main para renderer
  onDriverPos: (callback) => ipcRenderer.on('driver-pos', callback),
  onDriverAccepted: (callback) => ipcRenderer.on('driver-accepted', callback),
  onShowQR: (callback) => ipcRenderer.on('show-qr', callback),
  onBotStatus: (callback) => ipcRenderer.on('bot-status', callback),
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', callback),
  onTelegramLocation: (callback) => ipcRenderer.on('telegram-location', callback),
  
  // Envio de eventos para o main
  notifyMotoboyApproved: (data) => ipcRenderer.send('notify-motoboy-approved', data),
  restartWhatsapp: () => ipcRenderer.send('restart-whatsapp'),
  whatsappBroadcast: (data) => ipcRenderer.send('whatsapp-broadcast', data),
  sendDriverPos: (data) => ipcRenderer.send('driver-pos', data)
});
