const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Caminhos dos arquivos de persistência
const configPath = path.join(app.getPath('userData'), 'config.json');
const tablesPath = path.join(app.getPath('userData'), 'tables.json');
const keysPath = path.join(app.getPath('userData'), 'keys.json');

// Configurações padrão
const defaultStoreConfig = {
  storeName: 'Minha Loja',
  storeAddress: '',
  storePhone: ''
};

const defaultKeysConfig = {
  key_ai: '',
  key_tg: '',
  key_mp: '',
  key_maps: ''
};

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

// Handlers IPC para o sistema Ceia
ipcMain.handle('publish-ceia-wp', async () => {
  console.log('Publicando no WordPress...');
  return 'Cardápio publicado com sucesso!';
});

ipcMain.handle('load-config', async () => {
  return readJSON(configPath, defaultStoreConfig);
});

ipcMain.handle('save-config', async (event, config) => {
  const success = writeJSON(configPath, config);
  return success ? 'Configurações salvas!' : 'Erro ao salvar configurações.';
});

ipcMain.handle('get-store-config', async () => {
  return readJSON(configPath, defaultStoreConfig);
});

ipcMain.handle('cashier-close', async () => {
  const now = new Date().toLocaleString();
  console.log(`Caixa fechado em ${now}`);
  return `Caixa fechado com sucesso em ${now}`;
});

ipcMain.handle('tables-save', async (event, tablesData) => {
  const success = writeJSON(tablesPath, tablesData);
  return success ? 'Layout das mesas salvo!' : 'Erro ao salvar layout.';
});

// Handlers para as chaves de API (MULA HUB)
ipcMain.handle('config-load', async () => {
  return readJSON(keysPath, defaultKeysConfig);
});

ipcMain.on('config-save', (event, payload) => {
  writeJSON(keysPath, payload);
});

// Criar janela principal
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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
