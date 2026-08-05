const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, powerMonitor } = require('electron');

// Software rendering keeps the internal render buffer healthy on this box
// (without it capturePage turns black). Screen presentation is validated
// separately (xwd / ffmpeg x11grab) — see git history for the rabbit hole.
app.disableHardwareAcceleration();
// Force Chromium's compositor to pure software as well. A broken GPU stack
// (this Linux dev box, and some Win11 boxes with flaky GPU drivers) can create
// the window fine but never present its content to the screen — exactly the
// "starts without error, window never shows" symptom the user hits. These
// switches were removed in 2da9e08 after a Linux-only measurement false-negative
// (xwd can't read KWin's composited layer); they remain the right call on Win.
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('enable-features', 'UseSoftwareCompositor');
const path = require('path');
const fs = require('fs');
const { createTray } = require('./tray');
const calendarStore = require('./calendarStore');
const { startReminder, stopReminder } = require('./reminder');
const sidecar = require('./sidecar');
const fortuneEngine = require('./fortuneEngine');
const chatEngine = require('./chatEngine');
const wallpaper = require('./wallpaper');
const multimodal = require('./multimodal');

// lunar-javascript (runs in main process)
const { Solar } = require('lunar-javascript');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let isCalendarMode = false;

// 宠物窗口：紧凑贴合宠物的尺寸（给宠物走动 + 气泡 + 底部按钮留空间）
const PET_WIDTH = 200;
const PET_HEIGHT = 220;
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

// --- Startup diagnostics: logs + auto screenshots for remote debugging ---
// Everything here is best-effort and never throws; a broken diagnostic path
// must not take the app down.
function diagnosticsDir() {
  const dir = path.join(app.getPath('userData'), 'debug');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
  return dir;
}

function appendStartupLog(...parts) {
  try {
    const stamp = new Date().toISOString();
    fs.appendFileSync(path.join(diagnosticsDir(), 'startup.log'), `[${stamp}] ${parts.join(' ')}\n`);
  } catch (e) { /* ignore */ }
}

function logDisplayLayout() {
  try {
    return JSON.stringify(screen.getAllDisplays().map((d) => ({
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      primary: d.id === screen.getPrimaryDisplay().id,
    })));
  } catch (e) {
    return `screen error: ${e.message}`;
  }
}

// True when the window's centre lands inside some display's work area.
// Used to reject stale saved coordinates that would park the frameless,
// skip-taskbar window off-screen (invisible, with no taskbar entry).
function positionVisible(x, y, w, h) {
  try {
    const cx = x + w / 2;
    const cy = y + h / 2;
    return screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return cx >= wa.x && cx <= wa.x + wa.width && cy >= wa.y && cy <= wa.y + wa.height;
    });
  } catch (e) {
    return true; // if the screen API fails, don't block window creation
  }
}

async function saveWindowScreenshot(label) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const image = await mainWindow.webContents.capturePage();
    const size = image.getSize();
    if (image.isEmpty()) {
      appendStartupLog(`screenshot(${label}) EMPTY (${size.width}x${size.height})`);
      return;
    }
    const p = path.join(diagnosticsDir(), `window-${label}.png`);
    fs.writeFileSync(p, image.toPNG());
    appendStartupLog(`screenshot(${label}) saved ${size.width}x${size.height} -> ${p}`);
  } catch (e) {
    appendStartupLog(`screenshot(${label}) failed: ${e.message}`);
  }
}

// Surface previously-silent main-process failures into the startup log so
// "starts without error but no window" reports become debuggable.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
  appendStartupLog('uncaughtException:', String((err && err.stack) || err));
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
  appendStartupLog('unhandledRejection:', String((reason && reason.stack) || reason));
});

// --- Create the main transparent floating window ---
function createWindow() {
  const saved = loadSettings();
  const savedX = saved.windowX;
  const savedY = saved.windowY;

  // win32: 真透明桌宠窗口（豆包式，Windows 用户主用）；Linux 本机软渲染
  // 透明窗口不上屏，保留不透明背景调试模式
  const IS_WIN32 = process.platform === 'win32';
  const windowOptions = {
    width: PET_WIDTH,
    height: PET_HEIGHT,
    frame: false,
    transparent: IS_WIN32,
    backgroundColor: IS_WIN32 ? '#00000000' : '#1a142e',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // Restore the saved position only if it lands the window on a visible
  // display. Stale coordinates (monitor unplugged, DPI/scale or resolution
  // change) park the frameless, skip-taskbar window off-screen — it looks like
  // the app "never launched", with no taskbar entry to find. This is the top
  // cause of "no window, no error" on Windows.
  if (typeof savedX === 'number' && typeof savedY === 'number' && positionVisible(savedX, savedY, PET_WIDTH, PET_HEIGHT)) {
    windowOptions.x = savedX;
    windowOptions.y = savedY;
  } else {
    if (typeof savedX === 'number' && typeof savedY === 'number') {
      appendStartupLog(`saved position (${savedX},${savedY}) is off-screen — centering instead`);
      console.warn(`[main] saved window position (${savedX},${savedY}) is off-screen — centering`);
    }
    const pos = centerWindow(null, PET_WIDTH, PET_HEIGHT);
    windowOptions.x = pos.x;
    windowOptions.y = pos.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  appendStartupLog(
    `createWindow bounds=${JSON.stringify(mainWindow.getBounds())} visibleAtCreate=${mainWindow.isVisible()}`,
    `displays=${logDisplayLayout()}`,
    `savedPos=${typeof savedX === 'number' ? savedX : 'none'},${typeof savedY === 'number' ? savedY : 'none'}`
  );

  // Forward renderer console + errors to stdout for debugging
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] process gone:', JSON.stringify(details));
    appendStartupLog(`render-process-gone ${JSON.stringify(details)}`);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[main] did-fail-load:', code, desc, url);
    appendStartupLog(`did-fail-load code=${code} desc=${desc} url=${url}`);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    appendStartupLog(`did-finish-load visible=${mainWindow.isVisible()}`);
    // Explicitly show + re-assert topmost: some Win11 setups drop a just-created
    // frameless always-on-top window, leaving it effectively invisible.
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      appendStartupLog('window was hidden after load — called show()');
    }
    mainWindow.setAlwaysOnTop(true);
    if (process.platform === 'win32') mainWindow.focus();
    // Auto-screenshot for remote debugging — saved to <userData>/debug/ so the
    // user can send it back whenever "window didn't appear".
    setTimeout(() => saveWindowScreenshot('loaded'), 1500);
    setTimeout(() => saveWindowScreenshot('settled'), 5000);
  });
  mainWindow.once('ready-to-show', () => {
    appendStartupLog(`ready-to-show visible=${mainWindow.isVisible()}`);
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      appendStartupLog('ready-to-show: window was hidden — called show()');
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  let moveTimeout = null;
  mainWindow.on('move', () => {
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      // 漫游/面板期间移动不保存位置（避免漫游频繁写盘）
      if (isCalendarMode || roamTimer) return;
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// --- 全屏漫游器（豆包式：窗口随机方向匀速移动，碰到屏幕边缘反弹） ---
const ROAM_TICK_MS = 40;   // 每 40ms 移动一次
const ROAM_SPEED = 1.6;    // px/tick ≈ 40px/s，匀速漫游
let roamTimer = null;
let roamAngle = Math.random() * Math.PI * 2;
let roamPaused = false;    // 用户拖动时暂停移动（保持宠物走路视觉）
let lastRoamState = null;

function roamEnabled() {
  // 可配置开关：settings.petRoam，默认开启
  return loadSettings().petRoam !== false;
}

// 通知渲染进程漫游状态（窗口移动 ↔ 宠物走路动画同步）
function notifyRoam(roaming) {
  if (roaming === lastRoamState) return;
  lastRoamState = roaming;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet-roam', roaming);
  }
}

function stopRoaming() {
  if (roamTimer) { clearInterval(roamTimer); roamTimer = null; }
  notifyRoam(false);
}

function startRoaming() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!roamEnabled() || isCalendarMode || roamPaused) {
    stopRoaming();
    return;
  }
  if (roamTimer) return;
  roamAngle = Math.random() * Math.PI * 2;
  roamTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // 面板打开：完全停漫游
    if (isCalendarMode) { stopRoaming(); return; }
    // 拖动中：暂停移动，但保持宠物走路视觉（不 stopRoaming）
    if (roamPaused) return;

    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    const wa = screen.getDisplayNearestPoint({ x: wx, y: wy }).workArea;
    const margin = 10;
    let nx = wx + Math.cos(roamAngle) * ROAM_SPEED;
    let ny = wy + Math.sin(roamAngle) * ROAM_SPEED;

    // 碰到屏幕边缘反弹（镜像角度）
    if (nx <= wa.x + margin) { nx = wa.x + margin; roamAngle = Math.PI - roamAngle; }
    else if (nx + ww >= wa.x + wa.width - margin) { nx = wa.x + wa.width - ww - margin; roamAngle = Math.PI - roamAngle; }
    if (ny <= wa.y + margin) { ny = wa.y + margin; roamAngle = -roamAngle; }
    else if (ny + wh >= wa.y + wa.height - margin) { ny = wa.y + wa.height - wh - margin; roamAngle = -roamAngle; }

    mainWindow.setPosition(Math.round(nx), Math.round(ny));
    notifyRoam(true);
  }, ROAM_TICK_MS);
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

  // 空闲感知：返回系统空闲秒数（powerMonitor 各平台均支持；失败按 0 处理，
  // 视为“用户在线”，避免误触发休息/睡觉逻辑）
  ipcMain.handle('get-idle-time', () => {
    try {
      const seconds = powerMonitor.getSystemIdleTime();
      return { seconds: typeof seconds === 'number' ? seconds : 0 };
    } catch (e) {
      return { seconds: 0, error: e.message };
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

  // --- Panel window mode (calendar/chat share a larger window) ---
  function setWindowMode(mode) {
    if (!mainWindow) return false;
    if (mode === 'panel') {
      isCalendarMode = true;
      stopRoaming(); // 面板模式固定窗口
      mainWindow.setResizable(true);
      mainWindow.setSize(CAL_WIDTH, CAL_HEIGHT);
      const pos = centerWindow(mainWindow, CAL_WIDTH, CAL_HEIGHT);
      mainWindow.setPosition(pos.x, pos.y);
    } else {
      isCalendarMode = false;
      mainWindow.setSize(PET_WIDTH, PET_HEIGHT);
      mainWindow.setResizable(false);
      startRoaming(); // 回到宠物模式恢复漫游
      const saved = loadSettings();
      const sx = saved.windowX;
      const sy = saved.windowY;
      if (typeof sx === 'number' && typeof sy === 'number') {
        mainWindow.setPosition(sx, sy);
      } else {
        const pos = centerWindow(mainWindow, PET_WIDTH, PET_HEIGHT);
        mainWindow.setPosition(pos.x, pos.y);
      }
    }
    return true;
  }

  ipcMain.handle('open-calendar', () => setWindowMode('panel'));

  ipcMain.handle('close-calendar', () => setWindowMode('pet'));

  ipcMain.handle('open-chat-panel', () => setWindowMode('panel'));

  ipcMain.handle('close-chat-panel', () => setWindowMode('pet'));

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
    if (tray) tray.destroy();
    app.quit();
  });

  // Hide pet window (context menu) — Ctrl+Alt+W to show again
  ipcMain.on('hide-window', () => {
    if (mainWindow) mainWindow.hide();
  });

  // Doubao-style summon: global hotkey toggles the pet window
  try {
    const { globalShortcut } = require('electron');
    globalShortcut.register('CommandOrControl+Alt+W', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('pet-summoned');
      }
    });
  } catch (e) {
    console.error('[main] global shortcut failed:', e.message);
  }

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

  // Built-in pet assets (bundled transparent PNGs)
  function petsDir() {
    const dev = path.join(app.getAppPath(), 'assets', 'pets');
    try {
      if (fs.existsSync(dev)) return dev;
    } catch (e) { /* ignore */ }
    return path.join(process.resourcesPath || '', 'pets');
  }

  // 内置素材支持 PNG 与 GIF（GIF 动图主要用于 Windows 上作为会动的宠物，
  // Linux 软渲染位图全灭，设置页用 emoji 兜底展示）
  const PET_EXTS = ['.png', '.gif'];

  ipcMain.handle('pets:list', () => {
    try {
      const names = new Set();
      fs.readdirSync(petsDir())
        .filter((f) => PET_EXTS.some((ext) => f.toLowerCase().endsWith(ext)))
        .forEach((f) => names.add(f.replace(/\.(png|gif)$/i, '')));
      return Array.from(names);
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('pets:image', (_event, name) => {
    try {
      const base = String(name).replace(/[^\w-]/g, '');
      for (const ext of PET_EXTS) {
        const p = path.join(petsDir(), `${base}${ext}`);
        if (fs.existsSync(p)) {
          const buf = fs.readFileSync(p);
          const mime = ext === '.gif' ? 'image/gif' : 'image/png';
          return { dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
        }
      }
    } catch (e) { /* ignore */ }
    return { dataUrl: null };
  });

  ipcMain.handle('pets:apply', (_event, name) => {
    try {
      const p = path.join(petsDir(), `${String(name).replace(/[^\w-]/g, '')}.png`);
      if (fs.existsSync(p)) {
        fs.copyFileSync(p, CUSTOM_PET_PATH);
        return { ok: true };
      }
    } catch (e) {
      return { error: e.message };
    }
    return { error: '素材不存在' };
  });

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
        // Detect real format by magic bytes (saved file may be webp/jpeg/png/gif)
        let mime = 'image/png';
        if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
          mime = 'image/webp';
        } else if (buf[0] === 0xff && buf[1] === 0xd8) {
          mime = 'image/jpeg';
        } else if (buf[0] === 0x89 && buf[1] === 0x50) {
          mime = 'image/png';
        } else if (buf.length > 4 && buf.toString('ascii', 0, 4) === 'GIF8') {
          mime = 'image/gif';
        }
        return { dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
      }
    } catch (e) {
      console.error('[pet] load image failed:', e.message);
    }
    return { dataUrl: null };
  });

  // --- Wallpaper calendar ---
  const buildWallpaperPayload = async (dateStr) => {
    const today = dateStr || new Date().toISOString().slice(0, 10);
    const schedules = calendarStore.listByDate(today);
    const fortune = await fortuneEngine.getDailyFortune(today, false, {
      requestSidecar: (m, p, b) => sidecar.requestSidecar(m, p, b),
    });
    let almanac = null;
    try {
      const r = await sidecar.requestSidecar('GET', `/almanac/today?date=${encodeURIComponent(today)}`);
      almanac = r.data;
    } catch (e) { /* optional */ }
    return {
      dateStr: today,
      schedules,
      fortune: { data: fortune.data || null, almanac },
    };
  };

  ipcMain.handle('wallpaper:apply', async () => {
    const payload = await buildWallpaperPayload();
    const result = await wallpaper.applyWallpaper(payload);
    if (result.ok) {
      const settings = loadSettings();
      settings.calendarMode = 'wallpaper';
      saveSettings(settings);
    }
    return result;
  });

  ipcMain.handle('wallpaper:refresh-timer', (_event, enabled) => {
    if (enabled) {
      wallpaper.startAutoRefresh(() => buildWallpaperPayload());
    } else {
      wallpaper.stopAutoRefresh();
    }
    return { ok: true };
  });

  // --- 点击穿透（win32 透明桌宠）---
  // 主进程轮询光标位置，把「窗口内相对坐标」发给渲染进程，由渲染进程判断
  // 该点是否命中交互元素（宠物/按钮/气泡），再回传 set-click-through 驱动
  // 真穿透。非 win32 平台（透明不上屏）保持整窗交互。
  let cursorTimer = null;
  let panelOpen = false;
  let currentClickThrough = null;
  let lastSentMode = null;
  let lastRelX = null;
  let lastRelY = null;

  function updateCursorState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const b = mainWindow.getBounds();
    const inWin =
      cursor.x >= b.x && cursor.x <= b.x + b.width &&
      cursor.y >= b.y && cursor.y <= b.y + b.height;

    let mode;
    let relX = -1;
    let relY = -1;
    if (!inWin) {
      mode = 'outside';
    } else {
      relX = cursor.x - b.x;
      relY = cursor.y - b.y;
      if (panelOpen || isCalendarMode) {
        mode = 'interactive';
      } else if (process.platform === 'win32') {
        // 透明桌宠：光标在窗口内，交给渲染进程做命中测试
        mode = 'hit';
      } else {
        // Linux/macOS：整窗交互
        mode = 'interactive';
      }
    }

    // 非 win32：透明不上屏，穿透无意义，强制整窗交互
    if (process.platform !== 'win32' && currentClickThrough !== false) {
      currentClickThrough = false;
      mainWindow.setIgnoreMouseEvents(false);
    }
    if (mode !== lastSentMode || relX !== lastRelX || relY !== lastRelY) {
      lastSentMode = mode;
      lastRelX = relX;
      lastRelY = relY;
      mainWindow.webContents.send('cursor-state', { mode, x: relX, y: relY });
    }
  }

  function startCursorWatch() {
    if (cursorTimer) clearInterval(cursorTimer);
    cursorTimer = setInterval(updateCursorState, 120);
    updateCursorState();
  }

  ipcMain.on('set-panel-open', (_event, value) => {
    panelOpen = !!value;
    updateCursorState();
  });

  ipcMain.on('set-click-through', (_event, value) => {
    // 仅 win32 真透明窗口启用穿透；forward:true 让穿透时鼠标移动仍转发
    // 给渲染进程（悬停/光标状态用）
    if (process.platform !== 'win32') return;
    const v = !!value;
    if (v !== currentClickThrough && mainWindow) {
      currentClickThrough = v;
      mainWindow.setIgnoreMouseEvents(v, { forward: true });
    }
  });

  // --- 漫游 IPC：拖动暂停/恢复、设置开关 ---
  ipcMain.on('roam-pause', () => {
    roamPaused = true; // 只暂停移动，保持宠物走路视觉
  });
  ipcMain.on('roam-resume', () => {
    roamPaused = false;
    if (!isCalendarMode && roamEnabled()) startRoaming();
  });
  ipcMain.on('roam-set', (_event, enabled) => {
    const s = loadSettings();
    s.petRoam = !!enabled;
    saveSettings(s);
    if (enabled) startRoaming();
    else stopRoaming();
  });

  // Start cursor watch (guarded until mainWindow exists)
  startCursorWatch();

  // --- Multimodal pet animation (image -> video) ---
  ipcMain.handle('multimodal:generate', (_event, imageDataUrl) => {
    return multimodal.generatePetAnimation(String(imageDataUrl || '').slice(0, 10_000_000));
  });
  ipcMain.handle('multimodal:clear', () => multimodal.clearPetAnimation());
  ipcMain.handle('multimodal:has-video', () => multimodal.hasPetVideo());
  ipcMain.handle('multimodal:video-path', () => {
    try {
      const p = multimodal.petVideoPath();
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        return { dataUrl: `data:video/mp4;base64,${buf.toString('base64')}` };
      }
    } catch (e) {
      console.error('[multimodal] load video failed:', e.message);
    }
    return { dataUrl: null };
  });
}

// --- App lifecycle ---
app.whenReady().then(() => {
  appendStartupLog(
    `app ready userData=${app.getPath('userData')} platform=${process.platform}`,
    `electron=${process.versions.electron} chrome=${process.versions.chrome} node=${process.versions.node}`
  );
  setupIPC();
  createWindow();
  // 豆包式全屏漫游（settings.petRoam 默认开启；面板/拖动时自动暂停）
  startRoaming();
  tray = createTray(mainWindow, () => {
    isQuitting = true;
    app.quit();
  });
  startReminder(mainWindow);
  // Start fortune sidecar (non-blocking on failure)
  sidecar.startSidecar().then((ok) => {
    console.log('[main] sidecar ready:', ok);
    appendStartupLog(`sidecar ready=${ok}`);
    if (ok) {
      // Startup fortune reminder (5s delay, only if userInfo exists)
      fortuneEngine.maybeSendStartupFortune(mainWindow, (d, f) =>
        fortuneEngine.getDailyFortune(d, f, { requestSidecar: (m, p, b) => sidecar.requestSidecar(m, p, b) })
      );

      // Apply wallpaper calendar mode if previously enabled
      const settings = loadSettings();
      if (settings.calendarMode === 'wallpaper') {
        setTimeout(async () => {
          try {
            const payload = await (async () => {
              const today = new Date().toISOString().slice(0, 10);
              const schedules = calendarStore.listByDate(today);
              const fortune = await fortuneEngine.getDailyFortune(today, false, {
                requestSidecar: (m, p, b) => sidecar.requestSidecar(m, p, b),
              });
              let almanac = null;
              try {
                const r = await sidecar.requestSidecar('GET', `/almanac/today?date=${today}`);
                almanac = r.data;
              } catch (e) { /* optional */ }
              return { dateStr: today, schedules, fortune: { data: fortune.data || null, almanac } };
            })();
            await wallpaper.applyWallpaper(payload);
            wallpaper.startAutoRefresh(async () => {
              const t = new Date().toISOString().slice(0, 10);
              const s = calendarStore.listByDate(t);
              const f = await fortuneEngine.getDailyFortune(t, false, {
                requestSidecar: (m, p, b) => sidecar.requestSidecar(m, p, b),
              });
              let alm = null;
              try {
                const r = await sidecar.requestSidecar('GET', `/almanac/today?date=${t}`);
                alm = r.data;
              } catch (e) { /* optional */ }
              return { dateStr: t, schedules: s, fortune: { data: f.data || null, almanac: alm } };
            });
          } catch (e) {
            console.error('[main] wallpaper startup failed:', e.message);
          }
        }, 8000);
      }
  }
  });
});

app.on('window-all-closed', () => {
  // Do nothing — tray keeps the app alive
});

app.on('before-quit', () => {
  try {
    const { globalShortcut } = require('electron');
    globalShortcut.unregisterAll();
  } catch (e) { /* ignore */ }
  isQuitting = true;
  stopReminder();
  sidecar.stopSidecar();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
