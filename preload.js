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
  
  // Nota: APIs de pagamento removidas da interface do restaurante
  // Essas funcionalidades estão disponíveis apenas no painel administrativo
  
  // IA
  aiParseMenu: (text) => ipcRenderer.invoke('ai-parse-menu', text),
  
  // Backup
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  
  // Telegram
  sendTelegramMessage: (data) => ipcRenderer.invoke('send-telegram-message', data),
  getTelegramUpdates: (botToken) => ipcRenderer.invoke('get-telegram-updates', botToken),
  
  // Pagamentos
  getPaymentStatus: () => ipcRenderer.invoke('get-payment-status'),
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  
  // WhatsApp
  whatsappSend: (data) => ipcRenderer.invoke('whatsapp-send', data),
  whatsappGetStatus: () => ipcRenderer.invoke('whatsapp-get-status'),
  whatsappRestart: () => ipcRenderer.invoke('whatsapp-restart'),
  whatsappGetQr: () => ipcRenderer.invoke('whatsapp-get-qr'),
  
  // Cardápio - Grupos de Complementos
  menuAddonGroupSave: (groupData) => ipcRenderer.invoke('menu-addon-group-save', groupData),
  menuAddonGroupDelete: (groupId) => ipcRenderer.invoke('menu-addon-group-delete', groupId),
  menuAddonGroupList: () => ipcRenderer.invoke('menu-addon-group-list'),
  
  // WhatsApp - Limpar sessão
  whatsappClearSession: () => ipcRenderer.invoke('whatsapp-clear-session'),
  
  // Enviar convite para entregador
  enviarConviteEntregador: (phoneNumber) => ipcRenderer.invoke('enviar-convite-entregador', phoneNumber),
  
  // Importação de cardápio via IA
  openMenuImport: () => ipcRenderer.invoke('open-menu-import'),
  
  // Processamento de áudio
  processAudio: (audioData, mimeType) => ipcRenderer.invoke('process-audio', { audioData, mimeType }),
  processWhatsAppAudioMessage: (messageId, audioData, mimeType) => 
    ipcRenderer.invoke('whatsapp-process-audio-message', { messageId, audioData, mimeType }),
  
  // Processamento de localização
  processLocation: (latitude, longitude, contextMessage) => 
    ipcRenderer.invoke('process-location', { latitude, longitude, contextMessage }),
  processWhatsAppLocationMessage: (messageId, latitude, longitude, contextMessage) => 
    ipcRenderer.invoke('whatsapp-process-location-message', { messageId, latitude, longitude, contextMessage }),
  
  // Chave do Google Maps
  saveMapsKey: (mapsKey) => ipcRenderer.invoke('save-maps-key', mapsKey),
  
  // Eventos do main para renderer
  onDriverPos: (callback) => ipcRenderer.on('driver-pos', callback),
  onDriverAccepted: (callback) => ipcRenderer.on('driver-accepted', callback),
  onDriverRegisteredAck: (callback) => ipcRenderer.on('driver-registered-ack', callback),
  onShowQR: (callback) => ipcRenderer.on('show-qr', callback),
  onBotStatus: (callback) => ipcRenderer.on('bot-status', callback), // General bot status (can be WhatsApp or Telegram)
  onTelegramBotStatus: (callback) => ipcRenderer.on('telegram-bot-status', callback), // Specific for Telegram
  onConfigUpdated: (callback) => ipcRenderer.on('config-updated', callback),
  onTelegramLocation: (callback) => ipcRenderer.on('telegram-location', callback),
  onWhatsappQrUpdated: (callback) => ipcRenderer.on('whatsapp-qr-updated', callback),
  onWhatsappAudioReceived: (callback) => ipcRenderer.on('whatsapp-audio-received', callback),
  onAudioProcessed: (callback) => ipcRenderer.on('audio-processed', callback),
  onWhatsappOrderDetected: (callback) => ipcRenderer.on('whatsapp-order-detected', callback),
  onWhatsappLocationReceived: (callback) => ipcRenderer.on('whatsapp-location-received', callback),
  onLocationProcessed: (callback) => ipcRenderer.on('location-processed', callback),
  onWhatsappDeliveryAddressDetected: (callback) => ipcRenderer.on('whatsapp-delivery-address-detected', callback),
  
  // Frota - Convites
  getFleetInvites: () => ipcRenderer.invoke('get-fleet-invites'),
  deleteFleetInvite: (inviteId) => ipcRenderer.invoke('delete-fleet-invite', inviteId),
  
  // Abrir links externos
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Envio de eventos para o main
  notifyMotoboyApproved: (data) => ipcRenderer.send('notify-motoboy-approved', data),
  restartWhatsapp: () => ipcRenderer.send('restart-whatsapp'),
  whatsappBroadcast: (data) => ipcRenderer.send('whatsapp-broadcast', data),
  sendDriverPos: (data) => ipcRenderer.send('driver-pos', data),

  // Telegram Bot specific actions
  restartTelegramBot: () => ipcRenderer.invoke('restartTelegramBot')
});
