'use strict';
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
const dialog = electron.dialog;
const shell = electron.shell;
const path = require('path');
const registerIpc = require('./core/register-ipc');
const Logger = require('./core/logger');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1100, minHeight: 700,
    show: false, frame: false, backgroundColor: '#0a0e14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('render-process-gone', (_e, d) => Logger.fatal('renderer', 'gone', d));
}

app.whenReady().then(() => {
  createWindow();
  registerIpc(() => mainWindow);
  Logger.info('app', 'started', { v: app.getVersion(), e: process.versions.electron });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
app.on('before-quit', () => { try { Logger.close(); } catch {} });
process.on('uncaughtException', err => Logger.fatal('process', 'uncaught', { m: err.message, s: err.stack }));
process.on('unhandledRejection', r => Logger.error('process', 'rejection', { m: r && r.message }));

ipcMain.handle('win:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('win:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('win:close', () => mainWindow && mainWindow.close());
ipcMain.handle('win:state', () => mainWindow ? mainWindow.isMaximized() : false);

ipcMain.handle('dlg:folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'], title: 'Выберите корневую папку сборки Minecraft'
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('sh:open',   (_e, p) => shell.openPath(p));
ipcMain.handle('sh:reveal', (_e, p) => shell.showItemInFolder(p));

