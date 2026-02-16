const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();
const dataManager = require('./services/dataManager');
const FleetService = require('./services/FleetService');
const TelegramService = require('./services/TelegramService');
const whatsapp = require('./whatsapp');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Abre o DevTools para depuração.
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  // Inicializa a camada de dados
  await dataManager.initializeDatabase();

  // --- Handlers IPC para a camada de dados ---

  // Config
  ipcMain.handle('load-config', async () => {
    return dataManager.getConfig();
  });

  ipcMain.handle('save-config', async (event, config) => {
    // O dataManager.saveConfig já é inteligente e salva apenas os campos de config
    await dataManager.saveConfig(config);
    
    // Se houver configuração do WhatsApp, inicializa
    if (config.tech && config.tech.whatsapp_session_id) {
      try {
        // Atualiza a configuração no módulo WhatsApp
        whatsapp.updateConfig(config);
        
        // Inicializa o WhatsApp em segundo plano
        setTimeout(async () => {
          try {
            await whatsapp.initializeWhatsApp(config);
            console.log('WhatsApp inicializado automaticamente após salvar configuração');
          } catch (whatsappError) {
            console.warn('Não foi possível inicializar WhatsApp automaticamente:', whatsappError.message);
          }
        }, 1000);
      } catch (error) {
        console.warn('Erro ao configurar WhatsApp:', error.message);
      }
    }
    
    return { success: true };
  });

  // Menu
  ipcMain.handle('get-menu', dataManager.getMenu);
  ipcMain.handle('save-menu', async (event, menuData) => {
    return dataManager.saveMenu(menuData);
  });
  ipcMain.handle('update-item-availability', async (event, { id, isAvailable }) => {
    return dataManager.updateItemAvailability(id, isAvailable);
  });

  // Orders
  ipcMain.handle('get-open-orders', dataManager.getOpenOrders);
  ipcMain.handle('create-order', async (event, orderData) => {
    return dataManager.createOrder(orderData);
  });
  ipcMain.handle('update-order-status', async (event, { id, status }) => {
    return dataManager.updateOrderStatus(id, status);
  });

  // --- Outros Handlers IPC ---

  // IPC para obter a versão do app
  ipcMain.handle('get-app-version', () => {
    const { version } = require('../package.json');
    return version;
  });

  // IPC para inicializar o WhatsApp
  ipcMain.handle('initialize-whatsapp', async (event, config) => {
    try {
      console.log('Inicializando WhatsApp com configuração...');
      await whatsapp.initializeWhatsApp(config);
      return { success: true, message: 'WhatsApp inicializado com sucesso' };
    } catch (error) {
      console.error('Erro ao inicializar WhatsApp:', error);
      return { success: false, message: error.message };
    }
  });

  // IPC para obter status do WhatsApp
  ipcMain.handle('get-whatsapp-status', () => {
    return whatsapp.getWhatsAppStatus();
  });

  // IPC para enviar mensagem via WhatsApp
  ipcMain.handle('send-whatsapp-message', async (event, { phone, message }) => {
    try {
      const result = await whatsapp.sendWhatsAppMessage(phone, message);
      return { success: true, result };
    } catch (error) {
      console.error('Erro ao enviar mensagem WhatsApp:', error);
      return { success: false, message: error.message };
    }
  });

  // IPC para obter a lista de motoristas (lógica em memória existente)
  ipcMain.handle('get-drivers', () => {
    return FleetService.getAllDrivers();
  });

  // Inicializa o bot do Telegram com tratamento de erro
  try {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    if (telegramToken) {
      const telegramService = new TelegramService(telegramToken);
      telegramService.start();

      // Ouve por atualizações de localização do Telegram
      telegramService.on('location', (ctx) => {
        const { from, message } = ctx;
        const driverData = {
          id: from.id,
          firstName: from.first_name,
          lastName: from.last_name,
          username: from.username,
          location: message.location,
          lastUpdate: new Date().toISOString(),
        };
        FleetService.addOrUpdateDriver(driverData);
        
        // Envia atualização para todas as janelas abertas
        const updatedDrivers = FleetService.getAllDrivers();
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('fleet-update', updatedDrivers);
        });
      });
      console.log('🤖 Serviço do Telegram iniciado com sucesso.');
    } else {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN não encontrado no .env. O serviço do Telegram não será iniciado.');
    }
  } catch (error) {
    console.error('❌ Falha ao inicializar o serviço do Telegram:', error.message);
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
