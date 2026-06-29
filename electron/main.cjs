const electron = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const { app, BrowserWindow, Menu, shell } = electron;

let apiServer;
let mainWindow;
let logPath;

app.setName('放疗流程管理系统');

async function writeLog(message) {
  try {
    if (!logPath) {
      logPath = path.join(process.cwd(), 'radiotherapy-workflow.log');
    }

    await fs.appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    // Startup logging is diagnostic only and must not block the workstation.
  }
}

async function readClientConfig() {
  const candidates = [
    process.env.RT_REMOTE_API_URL && { apiBaseUrl: process.env.RT_REMOTE_API_URL },
    path.join(process.cwd(), 'config', 'client-config.json'),
    path.join(process.resourcesPath || process.cwd(), 'config', 'client-config.json'),
    path.join(process.resourcesPath || process.cwd(), 'app', 'config', 'client-config.json')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate === 'object') {
      return candidate;
    }

    try {
      const raw = await fs.readFile(candidate, 'utf8');
      return JSON.parse(raw);
    } catch {
      // Missing config is valid in development; the app starts an embedded API.
    }
  }

  return {};
}

async function startApiServer() {
  const { createApiServer } = await import('../server/app.js');
  const port = Number(process.env.RT_API_PORT || 8750);
  const userDataDir = app.getPath('userData');

  // Keep the same HTTP contract for embedded desktop mode and server mode.
  apiServer = await createApiServer({
    port,
    host: '127.0.0.1',
    dataDir: path.join(userDataDir, 'radiotherapy-workflow-data')
  });

  await writeLog(`Local API started on ${apiServer.port}`);
  return `http://127.0.0.1:${apiServer.port}`;
}

async function createMainWindow(apiBaseUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: '放疗流程管理系统',
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await writeLog(`Loading dev UI ${devUrl}`);
    await mainWindow.loadURL(`${devUrl}?api=${encodeURIComponent(apiBaseUrl)}`);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    await writeLog(`Loading packaged UI ${indexPath}`);
    await mainWindow.loadFile(indexPath, {
      query: { api: apiBaseUrl }
    });
  }
}

function installApplicationMenu() {
  // This clinical workstation uses in-app navigation; the desktop menu would
  // only duplicate shell commands and make the product feel unfinished.
  Menu.setApplicationMenu(null);
}

process.on('uncaughtException', (error) => {
  writeLog(`Uncaught exception: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (error) => {
  writeLog(`Unhandled rejection: ${error?.stack || error}`);
});

app.whenReady().then(async () => {
  logPath = path.join(app.getPath('userData'), 'radiotherapy-workflow.log');
  await writeLog(`App ready. cwd=${process.cwd()} resources=${process.resourcesPath}`);
  installApplicationMenu();

  const config = await readClientConfig();
  const apiBaseUrl = config.apiBaseUrl || await startApiServer();
  await writeLog(`Using API ${apiBaseUrl}`);
  await createMainWindow(apiBaseUrl);

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow(apiBaseUrl);
    }
  });
});

app.on('window-all-closed', async () => {
  if (apiServer?.close) {
    await apiServer.close();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
