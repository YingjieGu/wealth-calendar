const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wealthCalendar', {
  // Custom window drag support
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', { dx, dy }),

  // Settings persistence
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // Window position
  saveWindowPosition: () => ipcRenderer.send('save-window-position'),
  restoreDefaultPosition: () => ipcRenderer.invoke('restore-default-position'),
});
