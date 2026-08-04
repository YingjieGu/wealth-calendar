const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { createTray } = require('./tray');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

// --- Settings persistence helpers ---
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return {};
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// --- Create the main transparent floating window ---
function createWindow() {
  const saved = loadSettings();
  const savedX = saved.windowX;
  const savedY = saved.windowY;

  const windowOptions = {
    width: 220,
    height: 260,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // Restore saved position if available
  if (typeof savedX === 'number' && typeof savedY === 'number') {
    windowOptions.x = savedX;
    windowOptions.y = savedY;
  } else {
    // Default: center of primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
    windowOptions.x = Math.round((screenW - 220) / 2);
    windowOptions.y = Math.round((screenH - 260) / 2);
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Save window position when moving stops
  let moveTimeout = null;
  mainWindow.on('move', () => {
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      const [x, y] = mainWindow.getPosition();
      const settings = loadSettings();
      settings.windowX = x;
      settings.windowY = y;
      saveSettings(settings);
    }, 500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent the window from being closed, just hide it (unless quitting)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// --- IPC handlers ---
function setupIPC() {
  // Move window by delta (for custom drag)
  ipcMain.on('move-window', (_event, { dx, dy }) => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      mainWindow.setPosition(x + dx, y + dy);
    }
  });

  // Save settings from renderer
  ipcMain.handle('save-settings', (_event, settings) => {
    const current = loadSettings();
    const merged = { ...current, ...settings };
    saveSettings(merged);
    return { success: true };
  });

  // Load settings for renderer
  ipcMain.handle('load-settings', () => {
    return loadSettings();
  });

  // Force-save current window position
  ipcMain.on('save-window-position', () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      const settings = loadSettings();
      settings.windowX = x;
      settings.windowY = y;
      saveSettings(settings);
    }
  });

  // Restore default window position
  ipcMain.handle('restore-default-position', () => {
    if (mainWindow) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
      const defaultX = Math.round((screenW - 220) / 2);
      const defaultY = Math.round((screenH - 260) / 2);
      mainWindow.setPosition(defaultX, defaultY);
      return { x: defaultX, y: defaultY };
    }
    return { x: 0, y: 0 };
  });

  // Show/hide window from tray
  ipcMain.handle('toggle-window', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
        return false;
      } else {
        mainWindow.show();
        return true;
      }
    }
    return false;
  });
}

// --- App lifecycle ---
app.whenReady().then(() => {
  setupIPC();
  createWindow();
  tray = createTray(mainWindow, () => {
    isQuitting = true;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  // Do nothing — tray keeps the app alive
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
