const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();
const dataManager = require('./services/dataManager');
const FleetService = require('./services/FleetService');

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
    const config = await dataManager.getConfig();
    const menu = await dataManager.getMenu();
    // Combina config e menu para manter compatibilidade com o renderer
    return {
      ...config,
      menuItems: menu.items || [],
    };
  });

  ipcMain.handle('save-config', async (event, config) => {
    const { menuItems, ...restOfConfig } = config;
    await dataManager.saveMenu({ items: menuItems || [] });
    await dataManager.saveConfig(restOfConfig);
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

  // IPC para obter a lista de motoristas (lógica em memória existente)
  ipcMain.handle('get-drivers', () => {
    return FleetService.getAllDrivers();
  });

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
