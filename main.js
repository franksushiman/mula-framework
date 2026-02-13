const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs-extra');

// Caminhos dos arquivos de persistência
const configPath = path.join(app.getPath('userData'), 'config.json');

// Configurações padrão
const defaultConfig = {
  googleMapsKey: '',
  openAIKey: '',
  telegramToken: '',
  restaurantAddress: '',
  adminNumber: '',
  goldenRules: '',
  botPaused: false,
  fleet: [],
  menu: [],
  areas: [],
  printers: [],
  pendingOrders: [],
  driverLastSeen: {}
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

// Carregar configuração
function loadConfig() {
  return readJSON(configPath, defaultConfig);
}

// Salvar configuração
function saveConfig(data) {
  return writeJSON(configPath, data);
}

// Handlers IPC
ipcMain.handle('load-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-config', async (event, config) => {
  const success = saveConfig(config);
  return success ? 'Configurações salvas!' : 'Erro ao salvar configurações.';
});

ipcMain.handle('get-fleet-status', async () => {
  const config = loadConfig();
  return config.fleet || [];
});

ipcMain.handle('dispatch-fleet', async (event, { order, drivers }) => {
  // Simulação de envio para frota
  console.log('Dispatching order:', order, 'to drivers:', drivers);
  return { success: true, message: 'Pedido enviado para a frota' };
});

ipcMain.handle('get-printers', async () => {
  // Em um sistema real, listaria impressoras disponíveis
  return ['Impressora Padrão', 'Impressora Térmica 1', 'Impressora Térmica 2'];
});

ipcMain.handle('print-job', async (event, { printer, html }) => {
  console.log('Printing to', printer, 'with HTML:', html.substring(0, 50) + '...');
  return { success: true };
});

ipcMain.handle('ai-parse-menu', async (event, text) => {
  // Simulação de parsing de IA
  console.log('Parsing menu with AI:', text.substring(0, 100) + '...');
  // Retornar itens estruturados simulados
  return [
    { category: 'Entradas', name: 'Bruschetta', ingredients: 'Pão, tomate, manjericão', price: 25.90, printer: 'Cozinha', paused: false },
    { category: 'Pratos Principais', name: 'Filé Mignon', ingredients: 'Carne, batatas, legumes', price: 89.90, printer: 'Cozinha', paused: false }
  ];
});

ipcMain.handle('export-backup', async () => {
  const config = loadConfig();
  const backupPath = path.join(app.getPath('userData'), 'backup.json');
  writeJSON(backupPath, config);
  return backupPath;
});

ipcMain.handle('import-backup', async (event, backupData) => {
  saveConfig(backupData);
  return true;
});

// Eventos MAIN -> RENDERER (serão enviados via webContents.send)
// Estes são apenas placeholders, a implementação real dependerá de integrações externas

// Criar janela principal com preload e contextIsolation habilitado
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Descomente para depuração

  // Simular envio de eventos para o renderer (para demonstração)
  setInterval(() => {
    const config = loadConfig();
    if (config.fleet && config.fleet.length > 0) {
      const randomDriver = config.fleet[Math.floor(Math.random() * config.fleet.length)];
      mainWindow.webContents.send('driver-pos', { phone: randomDriver.phone });
    }
  }, 30000);
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
