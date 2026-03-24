// Electron main process — starts Express backend then opens React window
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let backendProcess;

const BACKEND_PORT = 3001;
const DEV_URL = `http://localhost:5173`;
const PROD_URL = `http://localhost:${BACKEND_PORT}`;

function startBackend() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'backend', 'index.js');
    backendProcess = fork(serverPath, [], {
      env: { ...process.env, PORT: BACKEND_PORT },
      silent: true,
    });

    let settled = false;

    backendProcess.stdout?.on('data', (data) => {
      const msg = data.toString();
      console.log('[backend]', msg);
      if (!settled && (msg.includes('listening') || msg.includes('running'))) {
        settled = true;
        resolve();
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      const errText = data.toString();
      console.error('[backend:err]', errText);
      if (!settled && errText.includes('EADDRINUSE')) {
        settled = true;
        reject(new Error('Backend port 3001 is already in use'));
      }
    });

    backendProcess.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Backend exited early with code ${code}`));
      }
    });

    // Fail fast if startup logs are never emitted.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Backend startup timed out'));
      }
    }, 10000);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'RyFlow',
    backgroundColor: '#1A1A1A',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    frame: process.platform !== 'darwin',
  });

  const isDev = !app.isPackaged;
  const url = isDev ? DEV_URL : PROD_URL;
  await mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    await startBackend();
    createWindow();
  } catch (err) {
    console.error('[electron] Failed to start backend:', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
