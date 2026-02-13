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
