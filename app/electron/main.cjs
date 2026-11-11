const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');


const ROOT = path.join(__dirname, '..');
app.setName('GGPoker Clone');
app.setPath('userData', require('node:path').join(app.getPath('appData'), 'GGPoker Clone'));
try { require('node:fs').mkdirSync(app.getPath('userData'), { recursive: true }); } catch {}

const DEV = process.env.GGPOKER_DEV === '1';
const PORT = Number(process.env.GGPOKER_PORT || 5198);
const URL = DEV ? 'http://localhost:5199' : `http://127.0.0.1:${PORT}`;

app.commandLine.appendSwitch('remote-debugging-port', '9333');

let win = null;
let serverProc = null;

function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/lobby`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('server did not start'));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

async function startServer() {
  if (DEV) return;
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  serverProc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      GGPOKER_DATA: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => console.log('[server]', String(d).trim()));
  serverProc.stderr.on('data', (d) => console.error('[server]', String(d).trim()));
  await waitForServer();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 961,
    minWidth: 980,
    minHeight: 720,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0b',
    hasShadow: true,
    resizable: true,
    show: true,
    center: true,
    title: 'GGPoker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadURL(URL);
  win.setPosition(80, 60);
  win.show();
  win.setAlwaysOnTop(true);
  win.focus();
  app.focus({ steal: true });
  setTimeout(() => { win?.setAlwaysOnTop(false); console.log('bounds', win?.getBounds(), 'visible', win?.isVisible()); }, 1500);
  win.webContents.on('did-fail-load', (e, code, desc) => console.error('load failed', code, desc));
  win.webContents.on('render-process-gone', (e, d) => console.error('renderer gone', d));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.GGPOKER_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  win.on('closed', () => { win = null; });
}

ipcMain.handle('win:close', () => { win?.close(); });
ipcMain.handle('win:minimize', () => { win?.minimize(); });
ipcMain.handle('win:maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.handle('win:isMaximized', () => win?.isMaximized() ?? false);

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    console.error('Failed to start local server', e);
  }
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
          { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ]));
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc) {
    try { serverProc.kill(); } catch { /* ignore */ }
  }
});
