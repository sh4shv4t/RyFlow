// Electron main process — starts backend/frontend then opens native shell window.
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

let mainWindow = null;
let tray = null;
let backendProcess = null;
let frontendProcess = null;
let ownsBackendProcess = false;
let ownsFrontendProcess = false;
let isQuitting = false;

const BACKEND_PORT = 3001;
const FRONTEND_PORT = 5173;

function ensureOllamaFromElectron() {
  try {
    execSync('ollama list', { stdio: 'ignore', timeout: 3000 });
    console.log('[ollama] already running');
    return;
  } catch {
    console.log('[ollama] not running, attempting auto-start...');
  }

  try {
    const child = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    console.log('[ollama] auto-start launched');
  } catch (err) {
    console.warn('[ollama] auto-start failed:', err.message);
    console.warn('[ollama] Start manually: ollama serve');
  }
}

Menu.setApplicationMenu(null);

function getLogoPath(isDev) {
  const candidates = [
    'RyFlow_squarelogo.png',
    'ryflow_squarelogo.png',
    'ryflow_squarelogo.ico',
    'ryflow_logo.png',
    'logo.png',
    'icon.png'
  ];
  const assetsDir = isDev
    ? path.join(__dirname, '..', 'assets')
    : path.join(process.resourcesPath, 'assets');

  for (const name of candidates) {
    const p = path.join(assetsDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const response = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (response.ok || response.status < 500) return true;
    } catch {
      // Keep polling until timeout.
    }
    await sleep(250);
  }
  return false;
}

async function waitForBackendHealth(timeoutMs = 12000) {
  const ok = await waitForUrl(`http://127.0.0.1:${BACKEND_PORT}/api/health`, timeoutMs);
  if (!ok) {
    throw new Error(`Backend health check failed on port ${BACKEND_PORT}`);
  }
}

function startFrontendDevServer() {
  return new Promise((resolve, reject) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const frontendCwd = path.join(__dirname, '..', 'frontend');
    frontendProcess = spawn(
      npmCmd,
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT)],
      {
        cwd: frontendCwd,
        env: { ...process.env },
        stdio: 'pipe'
      }
    );
    ownsFrontendProcess = true;

    let settled = false;

    frontendProcess.stdout?.on('data', (data) => {
      const msg = data.toString();
      console.log('[frontend]', msg);
      if (!settled && (msg.includes('Local:') || msg.includes('ready in'))) {
        settled = true;
        resolve();
      }
    });

    frontendProcess.stderr?.on('data', (data) => {
      console.error('[frontend:err]', data.toString());
    });

    frontendProcess.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Frontend dev server exited early with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Frontend dev server startup timed out'));
      }
    }, 15000);
  });
}

async function resolveFrontendUrl() {
  const isDev = !app.isPackaged;
  const devUrl = `http://localhost:${FRONTEND_PORT}`;

  if (!isDev) {
    return `file://${path.join(__dirname, '..', 'frontend', 'dist', 'index.html')}`;
  }

  if (await waitForUrl(devUrl, 1500)) {
    return devUrl;
  }

  try {
    await startFrontendDevServer();
    const ready = await waitForUrl(devUrl, 15000);
    if (!ready) throw new Error('Frontend did not become reachable');
    return devUrl;
  } catch {
    const fallbackIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
    if (fs.existsSync(fallbackIndex)) {
      console.warn('[electron] Frontend dev server unavailable, falling back to frontend/dist');
      return `file://${fallbackIndex}`;
    }
    throw new Error(`Frontend unavailable at ${devUrl}. Start it with "npm --prefix frontend run dev".`);
  }
}

async function startBackend() {
  if (await waitForUrl(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 1200)) {
    ownsBackendProcess = false;
    return;
  }

  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    const backendPath = isDev
      ? path.join(__dirname, '..', 'backend', 'index.js')
      : path.join(process.resourcesPath, 'backend', 'index.js');
    const backendCwd = isDev
      ? path.join(__dirname, '..', 'backend')
      : path.join(process.resourcesPath, 'backend');

    backendProcess = spawn('node', [backendPath], {
      cwd: backendCwd,
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        OLLAMA_HOST: 'http://localhost:11434',
        RYFLOW_DATA_DIR: path.join(app.getPath('userData'), 'workspaces')
      },
      stdio: 'pipe'
    });
    ownsBackendProcess = true;

    let settled = false;

    backendProcess.stdout?.on('data', (data) => {
      const msg = data.toString();
      console.log('[backend]', msg);
      if (!settled && msg.includes('listening')) {
        settled = true;
        resolve();
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      const errText = data.toString();
      console.error('[backend:err]', errText);
      if (!settled && errText.includes('EADDRINUSE')) {
        settled = true;
        ownsBackendProcess = false;
        waitForBackendHealth(12000)
          .then(resolve)
          .catch(() => reject(new Error('Backend port 3001 is in use and not healthy')));
      }
    });

    backendProcess.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Backend exited early with code ${code}`));
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Backend startup timed out'));
      }
    }, 10000);
  });
}

function createTray(logoPath) {
  if (!logoPath || tray) return;

  try {
    let trayIcon = nativeImage.createFromPath(logoPath);
    const traySize = process.platform === 'darwin' ? 22 : 16;
    trayIcon = trayIcon.resize({ width: traySize, height: traySize });

    tray = new Tray(trayIcon);
    tray.setToolTip('RyFlow');

    const trayMenu = Menu.buildFromTemplate([
      {
        label: 'Open RyFlow',
        click: () => {
          if (!mainWindow) return;
          mainWindow.show();
          mainWindow.focus();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(trayMenu);
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.focus();
      else mainWindow.show();
    });
  } catch (err) {
    console.error('[Tray] Failed to create:', err.message);
  }
}

async function createWindow() {
  const isDev = !app.isPackaged;
  const logoPath = getLogoPath(isDev);
  const startUrl = await resolveFrontendUrl();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32'
      ? { color: '#1A1A1A', symbolColor: '#F0F0F0', height: 40 }
      : false,
    backgroundColor: '#111111',
    show: false,
    icon: logoPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  // Show window gracefully when ready — no white flash.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.platform !== 'darwin') {
      mainWindow.setOpacity(0);
      let opacity = 0;
      const fadeIn = setInterval(() => {
        opacity = Math.min(opacity + 0.1, 1);
        mainWindow.setOpacity(opacity);
        if (opacity >= 1) clearInterval(fadeIn);
      }, 16);
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('maximize-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('maximize-changed', false);
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && process.platform !== 'darwin' && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  try {
    await mainWindow.loadURL(startUrl);
  } catch (err) {
    console.error('[electron] Failed to load frontend URL:', err.message);
    throw err;
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  createTray(logoPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on('window-close', () => {
  if (!mainWindow) return;
  if (process.platform !== 'darwin' && tray) mainWindow.hide();
  else mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

app.whenReady().then(async () => {
  try {
    ensureOllamaFromElectron();
    await createWindow();
    startBackend().catch((err) => {
      console.error('[electron] Backend startup failed:', err.message);
    });
  } catch (err) {
    console.error('[electron] Startup failed:', err.message);
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow().catch((err) => {
      console.error('[electron] Failed to re-open window:', err.message);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
  }
  if (ownsBackendProcess && backendProcess && backendProcess.exitCode === null && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
  }
  if (ownsFrontendProcess && frontendProcess && frontendProcess.exitCode === null && !frontendProcess.killed) {
    frontendProcess.kill('SIGTERM');
  }
});
