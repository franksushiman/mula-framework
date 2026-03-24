const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Adicionado para corrigir problemas de renderização de GPU no Linux
app.disableHardwareAcceleration();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  const appUrl = 'http://localhost:3000';

  // Tenta carregar a URL com retentativas para aguardar o servidor Bun iniciar.
  const loadApp = () => {
    mainWindow.loadURL(appUrl).catch(err => {
      console.log('Servidor ainda não está pronto, tentando novamente em 1 segundo...');
      setTimeout(loadApp, 1000);
    });
  };

  loadApp();

  // Abrir links externos no navegador padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
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
