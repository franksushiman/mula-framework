const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();
const FleetService = require('./services/FleetService');
const TelegramService = require('./services/TelegramService');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  // IPC para obter a versão do app
  ipcMain.handle('get-app-version', () => {
    const { version } = require('../package.json');
    return version;
  });

  // IPC para obter a lista de motoristas
  ipcMain.handle('get-drivers', () => {
    return FleetService.getAllDrivers();
  });

  // Inicializa os serviços
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
  } else {
    console.error('TELEGRAM_BOT_TOKEN não encontrado no .env. O serviço do Telegram não será iniciado.');
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
