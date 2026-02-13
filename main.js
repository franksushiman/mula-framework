const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { loadConfig, saveConfig } = require('./core/config');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

/* -------- CONFIG -------- */

// carregar tudo ao abrir
ipcMain.handle('config-load', () => {
  return loadConfig();
});

// salvar chaves
ipcMain.on('config-save', (_, payload) => {
  saveConfig(payload);
});
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Configurações padrão
const defaultConfig = {
  storeName: 'Minha Loja',
  storeAddress: '',
  storePhone: ''
};

// Caminhos dos arquivos de persistência
const configPath = path.join(app.getPath('userData'), 'config.json');
const tablesPath = path.join(app.getPath('userData'), 'tables.json');

// Funções auxiliares para ler/escrever JSON
function readJSON(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Erro ao escrever ${filePath}:`, err);
    return false;
  }
}

// Handlers IPC
ipcMain.handle('publish-ceia-wp', async (event) => {
  // Simulação de publicação
  console.log('Publicando no WordPress...');
  return 'Cardápio publicado com sucesso!';
});

ipcMain.handle('load-config', async (event) => {
  return readJSON(configPath, defaultConfig);
});

ipcMain.handle('save-config', async (event, config) => {
  const success = writeJSON(configPath, config);
  return success ? 'Configurações salvas!' : 'Erro ao salvar configurações.';
});

ipcMain.handle('get-store-config', async (event) => {
  return readJSON(configPath, defaultConfig);
});

ipcMain.handle('cashier-close', async (event) => {
  // Lógica de fechamento de caixa
  const now = new Date().toLocaleString();
  console.log(`Caixa fechado em ${now}`);
  return `Caixa fechado com sucesso em ${now}`;
});

ipcMain.handle('tables-save', async (event, tablesData) => {
  const success = writeJSON(tablesPath, tablesData);
  return success ? 'Layout das mesas salvo!' : 'Erro ao salvar layout.';
});

// Criar janela principal
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Descomente para depuração
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
