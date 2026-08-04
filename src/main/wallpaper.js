// Wallpaper calendar: render a wallpaper HTML to PNG via capturePage,
// then set it as desktop background through a per-platform adapter.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

let wallpaperWin = null;
let refreshTimer = null;

function wallpaperPath() {
  return path.join(app.getPath('userData'), 'wallpaper.png');
}

async function renderWallpaperImage({ dateStr, schedules, fortune }) {
  const disp = screen.getPrimaryDisplay();
  const { width, height } = disp.size;
  const scale = disp.scaleFactor || 1;

  wallpaperWin = new BrowserWindow({
    width: Math.round(width / scale),
    height: Math.round(height / scale),
    show: false,
    frame: false,
    transparent: false,
    webPreferences: { offscreen: true },
  });

  try {
    await wallpaperWin.loadFile(path.join(__dirname, '..', 'renderer', 'wallpaper.html'));
    await wallpaperWin.webContents.executeJavaScript(
      `window.__renderWallpaper(${JSON.stringify({ dateStr, schedules, fortune })})`
    );
    // Give the DOM a moment to paint
    await new Promise((r) => setTimeout(r, 400));
    const image = await wallpaperWin.webContents.capturePage();
    fs.writeFileSync(wallpaperPath(), image.toPNG());
    return wallpaperPath();
  } finally {
    if (wallpaperWin) {
      wallpaperWin.destroy();
      wallpaperWin = null;
    }
  }
}

// --- Platform adapter: set desktop wallpaper ---
function setWallpaperPlatform(pngPath) {
  return new Promise((resolve) => {
    const p = process.platform;
    const uri = `file://${pngPath}`;

    if (p === 'win32') {
      // Windows: SystemParametersInfo via PowerShell (no extra deps)
      const ps = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }'; [W]::SystemParametersInfo(20, 0, '${pngPath.replace(/'/g, "''")}', 3)`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], (err) => {
        if (err) console.error('[wallpaper] win32 set failed:', err.message);
        resolve(!err);
      });
    } else if (p === 'darwin') {
      // macOS: osascript
      const script = `tell application "System Events" to set picture of every desktop to "${pngPath}"`;
      execFile('osascript', ['-e', script], (err) => {
        if (err) console.error('[wallpaper] darwin set failed:', err.message);
        resolve(!err);
      });
    } else {
      // Linux: try gsettings (GNOME), then feh
      execFile('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri', uri], (err1) => {
        if (!err1) return resolve(true);
        execFile('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri], (err2) => {
          if (!err2) return resolve(true);
          execFile('feh', ['--bg-scale', pngPath], (err3) => {
            if (err3) console.error('[wallpaper] linux set failed:', err3.message);
            resolve(!err3);
          });
        });
      });
    }
  });
}

async function applyWallpaper({ dateStr, schedules, fortune }) {
  try {
    const png = await renderWallpaperImage({ dateStr, schedules, fortune });
    const ok = await setWallpaperPlatform(png);
    return { ok, path: png };
  } catch (e) {
    console.error('[wallpaper] apply failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// --- Auto refresh (hourly) ---
function startAutoRefresh(getDataFn) {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    try {
      const data = await getDataFn();
      if (data) await applyWallpaper(data);
    } catch (e) {
      console.error('[wallpaper] auto refresh failed:', e.message);
    }
  }, 60 * 60 * 1000); // every hour
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

module.exports = { applyWallpaper, startAutoRefresh, stopAutoRefresh, renderWallpaperImage, wallpaperPath };
