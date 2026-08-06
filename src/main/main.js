const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, powerMonitor } = require('electron');

// Software rendering keeps the internal render buffer healthy on this box
// (without it capturePage turns black). Screen presentation is validated
// separately (xwd / ffmpeg x11grab) — see git history for the rabbit hole.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
// Try Chromium's bundled SwiftShader (pure software) instead of the ancient
// system llvmpipe (Mesa 19.2.6 on this KVM box) — bitmaps may render again.
app.commandLine.appendSwitch('use-angle', 'swiftshader');
// Linux X11 transparent windows historically need this to present content.
app.commandLine.appendSwitch('enable-transparent-visuals');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
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

// 宠物窗口：紧凑贴合宠物的尺寸（宠物固定在中心 ~150px + 顶部气泡 + 底部按钮）
const PET_WIDTH = 200;
const PET_HEIGHT = 250;
const CAL_WIDTH = 420;
const CAL_HEIGHT = 560;

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const SETTINGS_BACKUP_PATH = path.join(app.getPath('userData'), 'settings.backup.json');

// 首次启动（settings 为空）时预填的 DeepSeek 默认模型配置；Key 留空，
// 用户填 Key 后即可启用 AI 命理/对话。baseUrl 不带 /v1（官方兼容两种）。
const DEFAULT_MODEL_CONFIG = {
  llmBaseUrl: 'https://api.deepseek.com',
  llmModel: 'deepseek-v4-flash',
  llmApiKey: '',
};

// --- Settings persistence helpers ---
// 容错读取：settings.json 不存在/损坏/为空时，尝试从 settings.backup.json 恢复
//（每次写盘前 saveSettings 都会生成备份）。恢复成功后把内容写回 settings.json，
// 保证 chatEngine/fortuneEngine 等直接读文件的其他模块也能拿到一致的配置；
// 写回走直接 fs 写入而非 saveSettings，避免把损坏文件再次复制覆盖掉好备份。
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
      // settings.json 为空对象（或空内容）→ 尝试从备份恢复
      console.warn('[settings] settings.json 为空，尝试从备份恢复');
      appendStartupLog('settings.json 为空，尝试从备份恢复');
    }
  } catch (e) {
    console.error('Failed to load settings, trying backup:', e);
    appendStartupLog(`settings.json 损坏(${e.message})，尝试从备份恢复`);
  }
  return recoverFromBackup();
}

function recoverFromBackup() {
  try {
    if (!fs.existsSync(SETTINGS_BACKUP_PATH)) {
      appendStartupLog('无 settings.backup.json，跳过备份恢复');
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_BACKUP_PATH, 'utf-8'));
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      console.warn('[settings] 已从 settings.backup.json 恢复配置');
      appendStartupLog(`已从 settings.backup.json 恢复配置(${Object.keys(parsed).length} 项)`);
      try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
        appendStartupLog('恢复内容已写回 settings.json');
      } catch (e) {
        console.error('[settings] 恢复写回 settings.json 失败:', e.message);
      }
      return parsed;
    }
    appendStartupLog('settings.backup.json 为空/无效，恢复失败');
  } catch (e) {
    console.error('Failed to load backup settings:', e);
    appendStartupLog(`备份恢复失败: ${e.message}`);
  }
  return {};
}

function saveSettings(settings) {
  try {
    // 写前备份：旧 settings.json → settings.backup.json（卸载保留配置 + 损坏恢复用）
    if (fs.existsSync(SETTINGS_PATH)) {
      fs.copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP_PATH);
    }
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// 首次启动（settings 为空）时预填 DeepSeek 默认模型配置并保存进 settings.json。
function ensureDefaultSettings() {
  const s = loadSettings();
  if (!s || Object.keys(s).length === 0) {
    s.modelConfig = { ...DEFAULT_MODEL_CONFIG };
    saveSettings(s);
    console.log('[settings] 首次启动，已预填 DeepSeek 默认模型配置（Key 留空）');
    appendStartupLog('首次启动：已预填 DeepSeek 默认 modelConfig');
  }
  return s;
}

function centerWindow(win, width, height) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  return {
    x: Math.round((screenW - width) / 2),
    y: Math.round((screenH - height) / 2),
  };
}

// --- 托盘图标：用 萌宠1 睡觉.gif 首帧转 PNG（python PIL），存 userData/tray-icon.png ---
// win 托盘用 16x16，其余平台用 64x64；生成失败记录日志并返回 null（tray.js 退回占位图）。
function ensureTrayIcon() {
  try {
    const dev = path.join(app.getAppPath(), 'assets', 'themes', 'cat1', '睡觉.gif');
    const gifPath = fs.existsSync(dev)
      ? dev
      : path.join(process.resourcesPath || '', 'themes', 'cat1', '睡觉.gif');
    if (!fs.existsSync(gifPath)) {
      appendStartupLog('tray-icon: 睡觉.gif 不存在', gifPath);
      return null;
    }
    const png64 = path.join(app.getPath('userData'), 'tray-icon.png');
    const png16 = path.join(app.getPath('userData'), 'tray-icon-16.png');
    const need64 = !fs.existsSync(png64);
    const need16 = process.platform === 'win32' && !fs.existsSync(png16);
    if (need64 || need16) {
      const script = [
        'from PIL import Image',
        `im = Image.open(${JSON.stringify(gifPath)})`,
        'im.seek(0)',
        "im = im.convert('RGBA')",
        'im.thumbnail((64, 64))',
        `im.save(${JSON.stringify(png64)}, 'PNG')`,
        `im16 = im.copy(); im16.thumbnail((16, 16)); im16.save(${JSON.stringify(png16)}, 'PNG')`,
      ].join('\n');
      execFileSync('python3', ['-c', script], { timeout: 6000 });
    }
    // win 托盘要求 16x16；其余平台用 64x64
    const usePath = process.platform === 'win32' ? png16 : png64;
    const icon = nativeImage.createFromPath(usePath);
    if (icon.isEmpty()) {
      appendStartupLog('tray-icon: nativeImage 为空', usePath);
      return null;
    }
    appendStartupLog(`tray-icon: ok ${usePath} size=${icon.getSize().width}x${icon.getSize().height}`);
    return icon;
  } catch (e) {
    appendStartupLog('tray-icon: 生成失败', String((e && e.message) || e));
    return null;
  }
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

// --- 开机启动（settings.autostart，默认关） ---
// Windows/macOS 用系统登录项 app.setLoginItemSettings；
// Linux 用 XDG autostart desktop 文件（~/.config/autostart/wealth-calendar.desktop）。
function autostartDesktopPath() {
  return path.join(app.getPath('home'), '.config', 'autostart', 'wealth-calendar.desktop');
}

function applyAutoStart(enabled) {
  const on = !!enabled;
  try {
    if (process.platform === 'linux') {
      const p = autostartDesktopPath();
      if (on) {
        // dev 模式 Exec 需带 app 路径；打包后直接指向可执行文件
        const execLine = app.isPackaged
          ? `Exec="${process.execPath}"`
          : `Exec="${process.execPath}" "${app.getAppPath()}"`;
        const content = [
          '[Desktop Entry]',
          'Type=Application',
          'Name=财神日历',
          'Comment=Wealth Calendar desktop pet',
          execLine,
          'Terminal=false',
          'X-GNOME-Autostart-enabled=true',
          'X-KDE-autostart-after=panel',
        ].join('\n') + '\n';
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, 'utf-8');
        appendStartupLog(`autostart: desktop 文件已创建 -> ${p}`);
      } else if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        appendStartupLog(`autostart: desktop 文件已删除 -> ${p}`);
      }
    } else {
      // Windows / macOS 登录项
      app.setLoginItemSettings({ openAtLogin: on });
      appendStartupLog(`autostart: setLoginItemSettings openAtLogin=${on}`);
    }
    return { ok: true, enabled: on };
  } catch (e) {
    console.error('[autostart] failed:', e.message);
    appendStartupLog(`autostart: 设置失败 ${e.message}`);
    return { ok: false, error: e.message };
  }
}

function currentAutoStart() {
  try {
    if (process.platform === 'linux') {
      return fs.existsSync(autostartDesktopPath());
    }
    return app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
}

// --- TTS 诊断日志（tts-error.log，位于 userData/debug/） ---
function appendTtsLog(...parts) {
  try {
    const stamp = new Date().toISOString();
    fs.appendFileSync(path.join(diagnosticsDir(), 'tts-error.log'), `[${stamp}] ${parts.join(' ')}\n`);
  } catch (e) { /* ignore */ }
}

// edge-tts 不可用/网络失败时的降级合成：
// - win32: PowerShell System.Speech（本地离线，不依赖网络，输出 wav）
// - 通用: 系统 python3 + edge-tts（若系统已装）
// 返回 { buffer, engine } 或 null。
async function synthesizeFallbackTTS(text) {
  if (process.platform === 'win32') {
    try {
      const tmpWav = path.join(app.getPath('temp'), `wc-tts-${Date.now()}.wav`);
      const script = [
        'Add-Type -AssemblyName System.Speech',
        'try {',
        '  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        '  $s.Rate = 1',
        `  $s.SetOutputToWaveFile(${JSON.stringify(tmpWav)})`,
        `  $s.Speak(${JSON.stringify(text)})`,
        '  $s.Dispose()',
        '} catch { Write-Error $_; exit 1 }',
      ].join('\n');
      execFileSync('powershell', ['-NoProfile', '-Command', script], { timeout: 30000 });
      const buf = fs.readFileSync(tmpWav);
      try { fs.unlinkSync(tmpWav); } catch (e) { /* ignore */ }
      if (buf.length > 0) return { buffer: buf, engine: 'system-speech' };
    } catch (e) {
      appendTtsLog(`降级 system-speech 失败: ${e.message}`);
    }
  }
  // 通用回退：系统 python3 跑 edge-tts（需系统已 pip install edge-tts）
  try {
    const script = [
      'import asyncio, io, sys',
      'import edge_tts',
      'async def main():',
      '    c = edge_tts.Communicate(sys.argv[1], "zh-CN-XiaoxiaoNeural")',
      '    buf = io.BytesIO()',
      '    async for ch in c.stream():',
      '        if ch["type"] == "audio": buf.write(ch["data"])',
      '    sys.stdout.buffer.write(buf.getvalue())',
      'asyncio.run(main())',
    ].join('\n');
    const buf = execFileSync('python3', ['-c', script, text], { timeout: 30000 });
    if (buf.length > 0) return { buffer: buf, engine: 'edge-tts-system-python' };
  } catch (e) {
    appendTtsLog(`降级 系统 python edge-tts 失败: ${e.message}`);
  }
  return null;
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
    // win32: 真透明桌宠（DWM 合成正常, 已验证完美）
    // Linux KVM + SwiftShader: 透明窗口内容不上屏(实测壁纸透过无内容) → 保持不透明调试模式
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
      // 阶段瞬移/面板期间移动不保存位置（避免瞬移与面板移动写盘）
      if (isCalendarMode || isPhaseTeleport) return;
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

// ============ 猫咪生活作息式「位置-阶段」模型 ============
// 旧的平滑漫游（40ms tick 逐帧移动）已移除；位置切换全部改为「瞬移」：
// 阶段到点后直接 setPosition 跳到下一个位置，无移动动画。
// 位置池：homeBase(右下角据点) / workEdge(活跃窗口上沿或下沿) /
//         taskbar(屏幕底部任务栏上方) / random(桌面随机避开边缘)。
// 权重(按模式)：quiet homeBase 100%；clingy homeBase 75%+workEdge 25%；
//               active homeBase 55%+workEdge 15%+taskbar 15%+random 15%。
const PHASE_MIN_MS = 600000; // 每阶段停留 10-20 分钟（猫咪作息）
const PHASE_MAX_MS = 1200000;

let isPhaseTeleport = false; // 阶段瞬移中：move 处理器不保存瞬移位置

function clampPos(x, y) {
  try {
    const wa = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
    return {
      x: Math.max(wa.x + 4, Math.min(x, wa.x + wa.width - PET_WIDTH - 4)),
      y: Math.max(wa.y + 4, Math.min(y, wa.y + wa.height - PET_HEIGHT - 4)),
    };
  } catch (e) {
    return { x, y };
  }
}

// 把 w×h 窗口摆到 anchor 附近并 clamp 到所在显示器 workArea 内。
// 优先保持左上角可见(尽量贴近 anchor 但不出界); 若窗口比 workArea 大则居中。
// 用于面板打开(放大到 420x560)与关闭(恢复宠物尺寸)时防止窗口超出桌面。
function clampWindowInWorkArea(win, w, h, anchorX, anchorY) {
  if (!win || win.isDestroyed()) return null;
  let wa;
  try {
    wa = screen.getDisplayNearestPoint({ x: Math.round(anchorX), y: Math.round(anchorY) }).workArea;
  } catch (e) {
    wa = screen.getPrimaryDisplay().workArea;
  }
  let x = anchorX;
  let y = anchorY;
  if (w > wa.width || h > wa.height) {
    x = wa.x + (wa.width - w) / 2;
    y = wa.y + (wa.height - h) / 2;
  } else {
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));
  }
  win.setPosition(Math.round(x), Math.round(y));
  return { x: Math.round(x), y: Math.round(y) };
}

// homeBase：workArea 右下角据点，留 20px 边距
function homeBasePos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(wa.x + wa.width - PET_WIDTH - 20),
    y: Math.round(wa.y + wa.height - PET_HEIGHT - 20),
  };
}

// workEdge：活跃窗口上沿居中（顶部空间不足贴下沿）；检测不到活跃窗口返回 null
function workEdgePos() {
  const rect = getActiveWindowRect();
  if (!rect) return null;
  let x = rect.x + (rect.width - PET_WIDTH) / 2;
  let y = rect.y - PET_HEIGHT + 10;
  try {
    const wa = screen.getDisplayNearestPoint({ x: Math.round(rect.x), y: Math.round(rect.y) }).workArea;
    if (y < wa.y) y = rect.y + rect.height + 10; // 顶部空间不足 → 贴下沿
  } catch (e) { /* ignore */ }
  return clampPos(x, y);
}

// taskbar：屏幕底部任务栏上方（约 workArea 底部），水平随机避开边缘
function taskbarPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(wa.x + 20 + Math.random() * Math.max(0, wa.width - PET_WIDTH - 40)),
    y: Math.round(wa.y + wa.height - PET_HEIGHT - 8),
  };
}

// random：桌面随机位置，四周留 20px 避开屏幕边缘
function randomPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(wa.x + 20 + Math.random() * Math.max(0, wa.width - PET_WIDTH - 40)),
    y: Math.round(wa.y + 20 + Math.random() * Math.max(0, wa.height - PET_HEIGHT - 40)),
  };
}

// 模式 → 位置池权重（active 出去溜达 70%，clingy 出去 50%）
const POSITION_WEIGHTS = {
  quiet: { homeBase: 100 },
  clingy: { homeBase: 50, workEdge: 50 },
  active: { homeBase: 30, workEdge: 20, taskbar: 25, random: 25 },
};

function pickPositionType(mode) {
  const w = POSITION_WEIGHTS[mode] || POSITION_WEIGHTS.active;
  let total = 0;
  for (const k in w) total += w[k];
  let roll = Math.random() * total;
  for (const k in w) {
    roll -= w[k];
    if (roll < 0) return k;
  }
  return 'homeBase';
}

// 按类型解析实际坐标并返回真实类型；workEdge 检测不到活跃窗口时回退 homeBase
function resolvePosition(type) {
  switch (type) {
    case 'workEdge': {
      const p = workEdgePos();
      if (p) return { type: 'workEdge', x: p.x, y: p.y };
      const hb = homeBasePos();
      return { type: 'homeBase', x: hb.x, y: hb.y };
    }
    case 'taskbar': {
      const p = taskbarPos();
      return { type: 'taskbar', x: p.x, y: p.y };
    }
    case 'random': {
      const p = randomPos();
      return { type: 'random', x: p.x, y: p.y };
    }
    case 'homeBase':
    default: {
      const p = homeBasePos();
      return { type: 'homeBase', x: p.x, y: p.y };
    }
  }
}

// 阶段瞬移：按模式权重选位置池类型 → 解析坐标 → 直接 setPosition（无平滑动画）
function teleportTo(mode, forcedType) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const type = forcedType || pickPositionType(mode || 'active');
  const res = resolvePosition(type);
  isPhaseTeleport = true;
  mainWindow.setPosition(res.x, res.y);
  setTimeout(() => { isPhaseTeleport = false; }, 120);
  return res; // { type, x, y }
}

// --- 活跃工作窗口检测（粘人模式平台适配器） ---
// 返回当前用户工作窗口的 {x,y,width,height}（屏幕绝对坐标），检测失败返回 null。
// - Linux: 优先 xdotool getactivewindow getwindowgeometry --shell；缺失时退化到
//   xprop -root _NET_ACTIVE_WINDOW + xwininfo -stats
// - Windows: PowerShell GetForegroundWindow + GetWindowRect
// - macOS: osascript System Events（需辅助功能权限）
// 任一步骤失败都返回 null，调用方据此降级（随机屏幕位置趴下）。
function getActiveWindowRect() {
  const selfGuard = (rect) => {
    // 排除宠物窗口自身（粘人模式下它可能拿到焦点，不能趴在"自己"上）
    if (!rect || !mainWindow || mainWindow.isDestroyed()) return null;
    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    if (Math.abs(rect.x - wx) < 8 && Math.abs(rect.y - wy) < 8 &&
        Math.abs(rect.width - ww) < 8 && Math.abs(rect.height - wh) < 8) return null;
    return rect;
  };
  try {
    if (process.platform === 'win32') {
      const script = [
        "Add-Type -TypeDefinition @\"",
        "using System;",
        "using System.Runtime.InteropServices;",
        "public class WcWin {",
        "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
        "  [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr h, out RECT r);",
        "  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }",
        "}",
        "\"@",
        "$h = [WcWin]::GetForegroundWindow()",
        "$r = New-Object WcWin+RECT",
        "[WcWin]::GetWindowRect($h, [ref]$r) | Out-Null",
        "Write-Output (\"$($r.Left) $($r.Top) $($r.Right - $r.Left) $($r.Bottom - $r.Top)\")",
      ].join('\n');
      const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 4000 });
      const parts = String(out).trim().split(/\s+/).map(Number);
      if (parts.length >= 4 && parts.every((n) => Number.isFinite(n))) {
        return selfGuard({ x: parts[0], y: parts[1], width: parts[2], height: parts[3] });
      }
      return null;
    }
    if (process.platform === 'darwin') {
      const script = 'tell application "System Events" to tell (first application process whose frontmost is true) to get {position, size} of front window';
      const out = execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 4000 });
      // 输出形如 "100, 200, 800, 600"（逗号分隔）
      const m = String(out).match(/(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)[,\s]+(-?\d+)/);
      if (!m) return null;
      return selfGuard({ x: +m[1], y: +m[2], width: +m[3], height: +m[4] });
    }
    // Linux
    try {
      const out = execFileSync('xdotool', ['getactivewindow', 'getwindowgeometry', '--shell'], { encoding: 'utf8', timeout: 3000 });
      const nums = {};
      String(out).split('\n').forEach((line) => {
        const kv = line.match(/^([A-Z]+)=(\d+)/);
        if (kv && ['X', 'Y', 'WIDTH', 'HEIGHT'].includes(kv[1])) nums[kv[1]] = parseInt(kv[2], 10);
      });
      if (nums.X !== undefined && nums.Y !== undefined && nums.WIDTH && nums.HEIGHT) {
        return selfGuard({ x: nums.X, y: nums.Y, width: nums.WIDTH, height: nums.HEIGHT });
      }
    } catch (e) { /* xdotool 缺失 → 退化到 xprop+xwininfo */ }
    try {
      const wprop = execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], { encoding: 'utf8', timeout: 3000 });
      const wid = String(wprop).match(/0x[0-9a-fA-F]+/);
      if (!wid) return null;
      const info = execFileSync('xwininfo', ['-id', wid[0], '-stats'], { encoding: 'utf8', timeout: 3000 });
      const get = (label) => {
        const line = String(info).split('\n').find((l) => l.includes(label));
        const m = line && line.match(/(-?\d+)/);
        return m ? parseInt(m[1], 10) : NaN;
      };
      const rect = { x: get('Absolute upper-left X'), y: get('Absolute upper-left Y'), width: get('Width'), height: get('Height') };
      if ([rect.x, rect.y, rect.width, rect.height].every((n) => Number.isFinite(n))) return selfGuard(rect);
    } catch (e) { /* ignore */ }
    return null;
  } catch (e) {
    return null;
  }
}

// 把宠物窗口摆到目标窗口顶边居中趴着；target 为 null 时用随机屏幕位置（降级）。
// 粘人趴窗口: 顶边 y = 工作窗口 y - 宠物高 + 10, 水平居中; 若顶部空间不足(超出屏幕顶)
// 则贴下沿 y = 工作窗口 y + 高 + 10; 结果 clamp 到显示器 workArea。
function sitWindowOn(target) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  let x;
  let y;
  if (target && [target.x, target.y, target.width, target.height].every((n) => typeof n === 'number')) {
    x = target.x + (target.width - PET_WIDTH) / 2;
    y = target.y - PET_HEIGHT + 10;
    try {
      const wa = screen.getDisplayNearestPoint({ x: Math.round(target.x), y: Math.round(target.y) }).workArea;
      if (y < wa.y) {
        // 顶部空间不足 → 贴到工作窗口下沿
        y = target.y + target.height + 10;
      }
    } catch (e) { /* ignore */ }
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + Math.random() * Math.max(0, wa.width - PET_WIDTH);
    y = wa.y + Math.random() * Math.max(0, wa.height - PET_HEIGHT);
  }
  try {
    const nearest = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
    x = Math.max(nearest.x + 4, Math.min(x, nearest.x + nearest.width - PET_WIDTH - 4));
    y = Math.max(nearest.y + 4, Math.min(y, nearest.y + nearest.height - PET_HEIGHT - 4));
  } catch (e) { /* ignore */ }
  mainWindow.setPosition(Math.round(x), Math.round(y));
  return { x: Math.round(x), y: Math.round(y) };
}

// 右下角停靠位置(安静/粘人模式的默认据点): workArea 右下角, 留 20px 边距
function cornerPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(wa.x + wa.width - PET_WIDTH - 20),
    y: Math.round(wa.y + wa.height - PET_HEIGHT - 20),
  };
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

  // --- 开机启动（settings.autostart，默认关） ---
  ipcMain.handle('autostart:set', (_event, enabled) => {
    const s = loadSettings();
    s.autostart = !!enabled;
    saveSettings(s);
    return applyAutoStart(!!enabled);
  });

  ipcMain.handle('autostart:get', () => currentAutoStart());

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
      // 记录宠物当前位置作为面板锚点（放大后优先保持左上角可见）
      const [px, py] = mainWindow.getPosition();
      mainWindow.setResizable(true);
      mainWindow.setSize(CAL_WIDTH, CAL_HEIGHT);
      // 面板位置 clamp 到所在显示器 workArea，防止放大后超出桌面显示范围
      clampWindowInWorkArea(mainWindow, CAL_WIDTH, CAL_HEIGHT, px, py);
      // 面板打开：通知渲染进程暂停阶段调度（避免瞬移挪动面板窗口）
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pet-panel');
      }
    } else {
      isCalendarMode = false;
      mainWindow.setSize(PET_WIDTH, PET_HEIGHT);
      mainWindow.setResizable(false);
      // 面板关闭后通知渲染进程恢复阶段调度（从当前位置继续，下个阶段瞬移）
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pet-resume');
      }
      // 恢复宠物尺寸后位置也 clamp（防止停在屏幕边缘/越界）
      const saved = loadSettings();
      const sx = saved.windowX;
      const sy = saved.windowY;
      if (typeof sx === 'number' && typeof sy === 'number') {
        clampWindowInWorkArea(mainWindow, PET_WIDTH, PET_HEIGHT, sx, sy);
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
    const t = String(text || '').slice(0, 500);
    // 主路径：sidecar edge-tts（在线）
    try {
      const body = Buffer.from(JSON.stringify({ text: t }), 'utf-8');
      const r = await sidecar.requestSidecarBinary('POST', '/tts/synthesize', body, 'application/json', 30000);
      if (r.status === 200 && r.buffer.length > 0) {
        return { audioBase64: r.buffer.toString('base64'), engine: 'edge-tts' };
      }
      const errMsg = r.status === 200 ? '空音频(0 字节)' : (r.buffer.toString('utf-8') || `HTTP ${r.status}`);
      appendTtsLog(`edge-tts sidecar 失败: ${errMsg}`);
      appendStartupLog(`tts sidecar 失败: ${errMsg}`);
    } catch (e) {
      appendTtsLog(`edge-tts sidecar 异常: ${e.message}`);
      appendStartupLog(`tts sidecar 异常: ${e.message}`);
    }
    // 降级合成（win 本地 System.Speech / 系统 python edge-tts）
    try {
      const fb = await synthesizeFallbackTTS(t);
      if (fb) {
        appendTtsLog(`降级成功 engine=${fb.engine} bytes=${fb.buffer.length}`);
        return { audioBase64: fb.buffer.toString('base64'), engine: fb.engine };
      }
    } catch (e) {
      appendTtsLog(`降级异常: ${e.message}`);
    }
    appendTtsLog(`TTS 最终失败 text_len=${t.length}`);
    return { error: 'TTS 合成失败（详见 userData/debug/tts-error.log）' };
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

  // --- 主题素材系统（assets/themes/<theme>，打包 extraResources → resources/themes）---
  // 财神素材（webp 动图）与 Q版猫咪素材（gif 动图）按状态动作映射，由渲染进程
  // 按「当前状态」请求对应文件渲染成 <img> 动图（Windows/macOS 位图正常）；
  // Linux 软渲染位图全灭，渲染进程用内联 SVG 兜底，不走本 IPC 的图片。
  function themesDir(theme) {
    const dev = path.join(app.getAppPath(), 'assets', 'themes', String(theme || ''));
    try {
      if (fs.existsSync(dev)) return dev;
    } catch (e) { /* ignore */ }
    return path.join(process.resourcesPath || '', 'themes', String(theme || ''));
  }

  const THEME_EXT_MIME = { '.gif': 'image/gif', '.webp': 'image/webp', '.png': 'image/png' };

  ipcMain.handle('themes:asset', (_event, theme, file) => {
    try {
      const dir = themesDir(theme);
      const base = path.resolve(dir);
      const target = path.resolve(dir, String(file || ''));
      if (!target.startsWith(base + path.sep)) return { dataUrl: null }; // 防目录穿越
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return { dataUrl: null };
      const buf = fs.readFileSync(target);
      const ext = path.extname(target).toLowerCase();
      const mime = THEME_EXT_MIME[ext] || 'image/webp';
      return { dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (e) {
      return { dataUrl: null };
    }
  });

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
  // 粘人「跟鼠标」：追踪光标速度，快速移动时向渲染进程发 pet-mouse-fast 事件(限流)
  let lastCursorPt = null;
  let lastCursorTs = 0;
  let lastMouseFastSent = 0;

  function updateCursorState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const now = Date.now();
    // 光标快速移动检测（粘人跟鼠标事件；渲染进程按模式+概率决定是否跟随）
    if (lastCursorPt && now - lastCursorTs > 0) {
      const dist = Math.hypot(cursor.x - lastCursorPt.x, cursor.y - lastCursorPt.y);
      const speed = dist / ((now - lastCursorTs) / 1000); // px/s
      if (speed > 600 && now - lastMouseFastSent > 800) {
        lastMouseFastSent = now;
        mainWindow.webContents.send('pet-mouse-fast', { x: cursor.x, y: cursor.y });
      }
    }
    lastCursorPt = cursor;
    lastCursorTs = now;
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

  // --- 位置-阶段 IPC（猫咪作息） ---
  // 阶段调度（10-20 分钟计时）在渲染进程 pet.js；主进程负责位置池与瞬移。
  // phase-go：按模式权重选位置类型 → 解析坐标 → 直接 setPosition 瞬移。
  ipcMain.handle('phase-go', (_event, mode, forcedType) => {
    return teleportTo(mode, forcedType);
  });

  // 位置切换开关（原「全屏漫游」）：关闭时渲染进程不瞬移，原地状态循环
  ipcMain.on('roam-set', (_event, enabled) => {
    const s = loadSettings();
    s.petRoam = !!enabled;
    saveSettings(s);
  });

  // --- 粘人模式：活跃窗口检测 + 趴窗口 + 拖动吸附 ---
  ipcMain.handle('get-active-window-rect', () => getActiveWindowRect());

  // 趴到目标窗口顶部居中；target 为 null → 随机屏幕位置趴下（平台检测降级）
  ipcMain.handle('pet-sit', (_event, target) => {
    const pos = sitWindowOn(target);
    return { ok: !!pos, ...(pos || {}) };
  });

  // 拖动松手吸附：鼠标在当前活跃窗口内 → 自动趴上去
  ipcMain.handle('pet-snap', () => {
    const rect = getActiveWindowRect();
    if (!rect) return { sitting: false };
    const c = screen.getCursorScreenPoint();
    if (c.x >= rect.x && c.x <= rect.x + rect.width &&
        c.y >= rect.y && c.y <= rect.y + rect.height) {
      sitWindowOn(rect);
      return { sitting: true, target: rect };
    }
    return { sitting: false };
  });

  // 停靠到屏幕右下角（安静/粘人模式的默认据点，workArea 右下角留 20px 边距）
  ipcMain.handle('pet-corner', () => {
    const p = cornerPosition();
    mainWindow.setPosition(p.x, p.y);
    return { ok: true, x: p.x, y: p.y };
  });

  // 粘人「跟鼠标」：把宠物窗口移到鼠标上方约 100px 处（clamp 到显示器 workArea）
  ipcMain.handle('pet-follow-mouse', (_event, mx, my) => {
    let x = Number(mx) - PET_WIDTH / 2;
    let y = Number(my) - PET_HEIGHT - 100;
    try {
      const wa = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
      x = Math.max(wa.x + 4, Math.min(x, wa.x + wa.width - PET_WIDTH - 4));
      y = Math.max(wa.y + 4, Math.min(y, wa.y + wa.height - PET_HEIGHT - 4));
    } catch (e) { /* ignore */ }
    mainWindow.setPosition(Math.round(x), Math.round(y));
    return { ok: true, x: Math.round(x), y: Math.round(y) };
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
  // 首次启动预填 DeepSeek 默认模型配置（Key 留空）；已存在配置则原样保留
  ensureDefaultSettings();
  // 启动时应用保存的开机启动设置（默认关）：settings.autostart=true 时确保自启动项存在
  try {
    const s0 = loadSettings();
    if (s0.autostart === true) {
      const ar = applyAutoStart(true);
      appendStartupLog(`autostart: 启动时应用保存设置 ${ar.ok ? 'ok' : '失败'}`);
    } else {
      appendStartupLog(`autostart: 默认关闭 (settings.autostart=${s0.autostart})`);
    }
  } catch (e) { /* ignore */ }
  setupIPC();
  createWindow();
  // 位置-阶段模型：阶段调度（10-20 分钟计时 + 状态动作）在渲染进程 pet.js，
  // 主进程负责位置池与瞬移（phase-go）。启动时渲染进程按保存模式开始阶段循环
  tray = createTray(mainWindow, () => {
    isQuitting = true;
    app.quit();
  }, ensureTrayIcon()); // 托盘图标：睡觉.gif 首帧 PNG（PIL 转换）
  startReminder(mainWindow);
  // Start fortune sidecar (non-blocking on failure)
  sidecar.startSidecar().then((ok) => {
    console.log('[main] sidecar ready:', ok);
    appendStartupLog(`sidecar ready=${ok}`);
    // 记录 TTS 引擎状态到 startup.log（诊断语音播报失效）
    try {
      sidecar.requestSidecar('GET', '/models/status').then((r) => {
        appendStartupLog(`tts status: ${JSON.stringify((r.data && r.data.tts) || {})}`);
      }).catch((e) => appendStartupLog(`tts status 获取失败: ${e.message}`));
    } catch (e) { /* ignore */ }
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
