const { app, BrowserWindow, ipcMain, Menu, shell, dialog, session } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');


const ROOT = path.join(__dirname, '..');
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}
app.setName('DanGG.ro');
app.setPath('userData', require('node:path').join(app.getPath('appData'), 'GGPoker Clone'));
try { require('node:fs').mkdirSync(app.getPath('userData'), { recursive: true }); } catch {}

const DEV = process.env.GGPOKER_DEV === '1';
const PORT = Number(process.env.GGPOKER_PORT || 5198);
let URL = DEV ? 'http://localhost:5199' : `http://127.0.0.1:${PORT}`;

if (DEV || process.env.GGPOKER_CDP === '1') {
  app.commandLine.appendSwitch('remote-debugging-port', '9333');
}

let win = null;
let serverProc = null;

const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*; font-src 'self' data:;";

function installCsp() {
  if (DEV) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } });
  });
}

function waitForListening(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      clearTimeout(timer);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onData = (chunk) => {
      buffer += String(chunk);
      const match = buffer.match(/LISTENING (\d+)/);
      if (match) finish(resolve, Number(match[1]));
    };
    const onExit = (code) => finish(reject, new Error(`server exited before listening (code ${code})`));
    const timer = setTimeout(() => finish(reject, new Error('server did not report a listening port')), timeoutMs);
    child.stdout.on('data', onData);
    child.once('exit', onExit);
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
  try {
    const port = await waitForListening(serverProc);
    URL = `http://127.0.0.1:${port}`;
  } catch (e) {
    try { serverProc.kill(); } catch { /* ignore */ }
    throw e;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 961,
    minWidth: 360,
    minHeight: 640,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0b',
    hasShadow: true,
    resizable: true,
    show: true,
    center: true,
    title: 'DanGG.ro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
    if (url.startsWith(URL)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1200, height: 961, minWidth: 360, minHeight: 640,
          frame: false, transparent: false, backgroundColor: '#0a0a0b',
          hasShadow: true, title: 'DanGG.ro',
          webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
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
    dialog.showErrorBox('DanGG.ro could not start', `The local server failed to start.\n\nData: ${app.getPath('userData')}\n\n${e && e.message ? e.message : e}`);
    app.quit();
    return;
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
  installCsp();
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
