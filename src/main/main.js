const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { createTray } = require('./tray');
const calendarStore = require('./calendarStore');
const { startReminder, stopReminder } = require('./reminder');
const sidecar = require('./sidecar');
const fortuneEngine = require('./fortuneEngine');
const chatEngine = require('./chatEngine');

// lunar-javascript (runs in main process)
const { Solar } = require('lunar-javascript');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isCalendarMode = false;

const PET_WIDTH = 220;
const PET_HEIGHT = 260;
const CAL_WIDTH = 420;
const CAL_HEIGHT = 560;

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

function centerWindow(win, width, height) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  return {
    x: Math.round((screenW - width) / 2),
    y: Math.round((screenH - height) / 2),
  };
}

// --- Create the main transparent floating window ---
function createWindow() {
  const saved = loadSettings();
  const savedX = saved.windowX;
  const savedY = saved.windowY;

  const windowOptions = {
    width: PET_WIDTH,
    height: PET_HEIGHT,
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

  if (typeof savedX === 'number' && typeof savedY === 'number') {
    windowOptions.x = savedX;
    windowOptions.y = savedY;
  } else {
    const pos = centerWindow(null, PET_WIDTH, PET_HEIGHT);
    windowOptions.x = pos.x;
    windowOptions.y = pos.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  let moveTimeout = null;
  mainWindow.on('move', () => {
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      if (!isCalendarMode) {
        const [x, y] = mainWindow.getPosition();
        const settings = loadSettings();
        settings.windowX = x;
        settings.windowY = y;
        saveSettings(settings);
      }
    }, 500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// --- Lunar data helpers ---
function getDateLunarInfo(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  try {
    const solar = Solar.fromYmd(y, m, d);
    const lunar = solar.getLunar();
    const festivals = lunar.getFestivals() || [];
    const solarFestivals = solar.getFestivals() || [];
    const combined = [...festivals, ...solarFestivals];
    return {
      lunarYear: lunar.getYear(),
      lunarMonth: lunar.getMonth(),
      lunarDay: lunar.getDayInChinese(),
      jieQi: lunar.getJieQi() || '',
      yi: lunar.getDayYi() || [],
      ji: lunar.getDayJi() || [],
      festivals: combined,
      festival: combined.length > 0 ? combined[0] : '',
    };
  } catch (e) {
    console.error('Lunar error for', dateStr, e);
    return { lunarDay: '', jieQi: '', yi: [], ji: [], festivals: [], solarFestivals: [] };
  }
}

// --- IPC handlers ---
function setupIPC() {
  // Move window by delta
  ipcMain.on('move-window', (_event, { dx, dy }) => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      mainWindow.setPosition(x + dx, y + dy);
    }
  });

  // Settings
  ipcMain.handle('save-settings', (_event, settings) => {
    const current = loadSettings();
    saveSettings({ ...current, ...settings });
    return { success: true };
  });

  ipcMain.handle('load-settings', () => loadSettings());

  ipcMain.on('save-window-position', () => {
    if (mainWindow && !isCalendarMode) {
      const [x, y] = mainWindow.getPosition();
      const settings = loadSettings();
      settings.windowX = x;
      settings.windowY = y;
      saveSettings(settings);
    }
  });

  ipcMain.handle('restore-default-position', () => {
    if (mainWindow) {
      const pos = centerWindow(mainWindow, PET_WIDTH, PET_HEIGHT);
      mainWindow.setPosition(pos.x, pos.y);
      return pos;
    }
    return { x: 0, y: 0 };
  });

  // Toggle window (tray)
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

  // --- Calendar: resize to calendar view ---
  ipcMain.handle('open-calendar', () => {
    if (!mainWindow) return false;
    isCalendarMode = true;
    mainWindow.setResizable(true);
    mainWindow.setSize(CAL_WIDTH, CAL_HEIGHT);
    const pos = centerWindow(mainWindow, CAL_WIDTH, CAL_HEIGHT);
    mainWindow.setPosition(pos.x, pos.y);
    return true;
  });

  ipcMain.handle('close-calendar', () => {
    if (!mainWindow) return false;
    isCalendarMode = false;
    mainWindow.setSize(PET_WIDTH, PET_HEIGHT);
    mainWindow.setResizable(false);
    const saved = loadSettings();
    const sx = saved.windowX;
    const sy = saved.windowY;
    if (typeof sx === 'number' && typeof sy === 'number') {
      mainWindow.setPosition(sx, sy);
    } else {
      const pos = centerWindow(mainWindow, PET_WIDTH, PET_HEIGHT);
      mainWindow.setPosition(pos.x, pos.y);
    }
    return true;
  });

  // --- Lunar data for calendar ---
  ipcMain.handle('get-month-lunar-data', (_event, year, month) => {
    const data = {};
    const totalDays = new Date(year, month, 0).getDate();
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      data[d] = getDateLunarInfo(dateStr);
    }
    return data;
  });

  ipcMain.handle('get-date-lunar-data', (_event, dateStr) => {
    return getDateLunarInfo(dateStr);
  });

  // --- Calendar schedule CRUD ---
  ipcMain.handle('calendar:list', (_event, dateStr) => {
    return calendarStore.listByDate(dateStr);
  });

  ipcMain.handle('calendar:list-all', () => {
    try {
      const p = path.join(app.getPath('userData'), 'calendar.json');
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8')).schedules || [];
      }
    } catch (e) {
      console.error('Failed to list all schedules:', e);
    }
    return [];
  });

  ipcMain.handle('calendar:add', (_event, schedule) => {
    return calendarStore.add(schedule);
  });

  ipcMain.handle('calendar:update', (_event, id, updates) => {
    return calendarStore.update(id, updates);
  });

  ipcMain.handle('calendar:remove', (_event, id) => {
    return calendarStore.remove(id);
  });

  // --- Fortune sidecar ---
  ipcMain.handle('fortune:paipan', async (_event, birth, gender) => {
    try {
      const r = await sidecar.requestSidecar('POST', '/bazi/paipan', { birth, gender });
      return r.data;
    } catch (e) {
      console.error('[fortune] paipan failed:', e.message);
      return { error: e.message };
    }
  });

  ipcMain.handle('fortune:chart', async (_event, birth) => {
    try {
      const r = await sidecar.requestSidecar('POST', '/chart/natal', { birth });
      return r.data;
    } catch (e) {
      console.error('[fortune] chart failed:', e.message);
      return { error: e.message };
    }
  });

  ipcMain.handle('fortune:almanac', async (_event, dateStr) => {
    try {
      const q = dateStr ? `?date=${encodeURIComponent(dateStr)}` : '';
      const r = await sidecar.requestSidecar('GET', `/almanac/today${q}`);
      return r.data;
    } catch (e) {
      console.error('[fortune] almanac failed:', e.message);
      return { error: e.message };
    }
  });

  // --- Daily fortune pipeline ---
  ipcMain.handle('fortune:daily', (_event, dateStr, force) => {
    return fortuneEngine.getDailyFortune(dateStr, !!force, { requestSidecar: (m, p, b) => sidecar.requestSidecar(m, p, b) });
  });

  // Quit from renderer context menu
  ipcMain.on('app-quit', () => {
    isQuitting = true;
    app.quit();
  });

  // --- Chat ---
  const executeTool = async (action, params) => {
    switch (action) {
      case 'add_schedule': {
        const s = calendarStore.add({
          title: params.title || '未命名日程',
          date: params.date,
          time: params.time || null,
          remindBeforeMin: params.remindBeforeMin || null,
          note: params.note || '',
        });
        return { ok: true, id: s.id, title: s.title, date: s.date, time: s.time };
      }
      case 'query_schedule': {
        const date = params.date || new Date().toISOString().slice(0, 10);
        const list = calendarStore.listByDate(date);
        return { date, schedules: list.map(({ id, title, time, note }) => ({ id, title, time, note })) };
      }
      case 'delete_schedule': {
        const ok = calendarStore.remove(parseInt(params.id, 10));
        return { ok, id: params.id };
      }
      case 'query_fortune': {
        const r = await fortuneEngine.getDailyFortune(new Date().toISOString().slice(0, 10), false, {
          requestSidecar: (m, p, b) => sidecar.requestSidecar(m, p, b),
        });
        if (r.error) return { error: r.message };
        const d = r.data;
        const dims = d.dimensions || {};
        return {
          date: d.date,
          overall: d.overall,
          wealth: dims.wealth && dims.wealth.score,
          career: dims.career && dims.career.score,
          love: dims.love && dims.love.score,
          luckyTime: d.luckyTime,
          reminder: (d.reminderLines && d.reminderLines[0]) || '',
        };
      }
      default:
        return { error: `unknown action: ${action}` };
    }
  };

  ipcMain.handle('chat:send', (_event, message) => {
    return chatEngine.chatSend(String(message || '').slice(0, 500), { executeTool });
  });

  ipcMain.handle('chat:clear', () => {
    chatEngine.clearHistory();
    return { ok: true };
  });

  // --- Speech (ASR / TTS via sidecar) ---
  ipcMain.handle('asr:transcribe', async (_event, arrayBuffer, language) => {
    try {
      const buf = Buffer.from(arrayBuffer);
      const r = await sidecar.requestSidecarBinary('POST', '/asr/transcribe', buf, 'audio/webm');
      return JSON.parse(r.buffer.toString('utf-8'));
    } catch (e) {
      console.error('[asr] failed:', e.message);
      return { error: e.message };
    }
  });

  ipcMain.handle('tts:synthesize', async (_event, text) => {
    try {
      const body = Buffer.from(JSON.stringify({ text: String(text || '').slice(0, 500) }), 'utf-8');
      const r = await sidecar.requestSidecarBinary('POST', '/tts/synthesize', body, 'application/json');
      if (r.status !== 200) {
        return { error: r.buffer.toString('utf-8') };
      }
      return { audioBase64: r.buffer.toString('base64') };
    } catch (e) {
      console.error('[tts] failed:', e.message);
      return { error: e.message };
    }
  });

  // --- Model status ---
  ipcMain.handle('models:status', async () => {
    try {
      const r = await sidecar.requestSidecar('GET', '/models/status');
      return r.data;
    } catch (e) {
      return { error: e.message };
    }
  });

  // --- Custom pet image ---
  const CUSTOM_PET_PATH = path.join(app.getPath('userData'), 'pet-custom.png');

  ipcMain.handle('pet:save-image', (_event, dataUrl) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(CUSTOM_PET_PATH, Buffer.from(base64, 'base64'));
      return { ok: true, path: CUSTOM_PET_PATH };
    } catch (e) {
      console.error('[pet] save image failed:', e.message);
      return { error: e.message };
    }
  });

  ipcMain.handle('pet:load-image', () => {
    try {
      if (fs.existsSync(CUSTOM_PET_PATH)) {
        const buf = fs.readFileSync(CUSTOM_PET_PATH);
        return { dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
      }
    } catch (e) {
      console.error('[pet] load image failed:', e.message);
    }
    return { dataUrl: null };
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
  startReminder(mainWindow);
  // Start fortune sidecar (non-blocking on failure)
  sidecar.startSidecar().then((ok) => {
    console.log('[main] sidecar ready:', ok);
    if (ok) {
      // Startup fortune reminder (5s delay, only if userInfo exists)
      fortuneEngine.maybeSendStartupFortune(mainWindow, (d, f) =>
        fortuneEngine.getDailyFortune(d, f, { requestSidecar: (m, p, b) => sidecar.requestSidecar(m, p, b) })
      );
    }
  });
});

app.on('window-all-closed', () => {
  // Do nothing — tray keeps the app alive
});

app.on('before-quit', () => {
  isQuitting = true;
  stopReminder();
  sidecar.stopSidecar();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
