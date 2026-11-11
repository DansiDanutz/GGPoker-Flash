const { app, BrowserWindow, ipcMain, Menu, shell, dialog, session } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { URL: NodeURL } = require('node:url');


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
// GGPOKER_USER_DATA points a test or second instance at its own profile and database.
app.setPath('userData', process.env.GGPOKER_USER_DATA || path.join(app.getPath('appData'), 'GGPoker Clone'));
try { require('node:fs').mkdirSync(app.getPath('userData'), { recursive: true }); } catch {}

const DEV = process.env.GGPOKER_DEV === '1';
const REMOTE_SERVER = String(process.env.GGPOKER_SERVER_URL || '').replace(/\/$/, '');
const REMOTE = !DEV && !!REMOTE_SERVER;
if (REMOTE && !/^https?:\/\//.test(REMOTE_SERVER)) {
  throw new Error('GGPOKER_SERVER_URL must start with https:// (or http:// for local testing)');
}
const PORT = Number(process.env.GGPOKER_PORT || 5198);
let URL = REMOTE ? REMOTE_SERVER : (DEV ? 'http://localhost:5199' : `http://127.0.0.1:${PORT}`);

if (DEV || process.env.GGPOKER_CDP === '1') {
  app.commandLine.appendSwitch('remote-debugging-port', '9333');
}

let win = null;
let serverProc = null;

function buildCsp() {
  const target = new NodeURL(URL);
  const wsOrigin = `${target.protocol === 'https:' ? 'wss:' : 'ws:'}//${target.host}`;
  const connect = ["'self'", target.origin, wsOrigin];
  if (!REMOTE) {
    connect.push('http://127.0.0.1:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'ws://localhost:*');
  }
  return `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; child-src 'self' blob:; connect-src ${connect.join(' ')}; font-src 'self' data:;`;
}

function installCsp() {
  if (DEV) return;
  const csp = buildCsp();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
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
  if (DEV || REMOTE) return;
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
  setTimeout(() => { win?.setAlwaysOnTop(false); }, 1500);
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
    openExternalSafely(url);
    return { action: 'deny' };
  });
  if (process.env.GGPOKER_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  win.on('closed', () => { win = null; });
}

// Only real web links may leave the app; file:, javascript: and custom schemes are dropped.
function openExternalSafely(url) {
  try {
    const { protocol } = new globalThis.URL(url);
    if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url);
  } catch { /* not a URL */ }
}

// Window controls act on the window that sent them, so a popped-out table closes itself
// rather than the lobby.
const senderWindow = (event) => BrowserWindow.fromWebContents(event.sender);
ipcMain.handle('win:close', (event) => { senderWindow(event)?.close(); });
ipcMain.handle('win:minimize', (event) => { senderWindow(event)?.minimize(); });
ipcMain.handle('win:maximize', (event) => {
  const target = senderWindow(event);
  if (!target) return;
  if (target.isMaximized()) target.unmaximize();
  else target.maximize();
});
ipcMain.handle('win:isMaximized', (event) => senderWindow(event)?.isMaximized() ?? false);

// The app only ever shows its own local server: block navigation anywhere else and deny
// every permission request (camera, microphone, notifications…).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, target) => {
    if (target.startsWith(URL)) return;
    event.preventDefault();
    openExternalSafely(target);
  });
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
});

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

// SIGTERM lets the server cash every seated player out at their real stack before it exits.
app.on('before-quit', () => {
  if (serverProc) {
    try { serverProc.kill('SIGTERM'); } catch { /* ignore */ }
  }
});
