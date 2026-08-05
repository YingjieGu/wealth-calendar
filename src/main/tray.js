const { Tray, Menu, nativeImage } = require('electron');

function createTray(mainWindow, onQuit, providedIcon) {
  // 优先用主进程生成的托盘图标（睡觉.gif 首帧 PNG）；否则退回金色硬币占位图
  let trayIcon = providedIcon;
  if (!trayIcon || trayIcon.isEmpty()) {
    // A simple 16x16 icon using nativeImage from a data URL (gold coin)
    const iconDataUrl =
      'data:image/png;base64,' +
      'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA' +
      'AXNSR0IArs4c6QAAAMZJREFUWEft1jEKwjAYhmH4f9Ksbl7B' +
      'M3gKj+Dm4OI5vIDewUt4AjuIYKdO0g4uLoWSoG0Twg8hgdDk' +
      'e/P/JV+IyMQrMnkBN7AHOxAGMAMbsAAr0IEGVrADV1DADazB' +
      'EXyCyb9mzxvoQC3SL2uhBiuwABuwA1+gAs9ioAZnMAUbnqDn' +
      'zgWcwB5s09avYH0BG9CBC3gHC/CvzA4sQAPuwAZsweHyD3Ry' +
      'AAAAAElFTkSuQmCC';
    try {
      trayIcon = nativeImage.createFromDataURL(iconDataUrl);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } catch (e) {
      trayIcon = nativeImage.createEmpty();
    }
  }

  const tray = new Tray(trayIcon);
  tray.setToolTip('财神日历');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        if (onQuit) onQuit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click tray icon to toggle window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });

  return tray;
}

module.exports = { createTray };
