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

  // Calendar: switch views
  openCalendar: () => ipcRenderer.invoke('open-calendar'),
  closeCalendar: () => ipcRenderer.invoke('close-calendar'),

  // Lunar data
  getMonthLunarData: (year, month) => ipcRenderer.invoke('get-month-lunar-data', year, month),
  getDateLunarData: (dateStr) => ipcRenderer.invoke('get-date-lunar-data', dateStr),

  // Schedule CRUD
  calendarList: (dateStr) => ipcRenderer.invoke('calendar:list', dateStr),
  calendarListAll: () => ipcRenderer.invoke('calendar:list-all'),
  calendarAdd: (schedule) => ipcRenderer.invoke('calendar:add', schedule),
  calendarUpdate: (id, updates) => ipcRenderer.invoke('calendar:update', id, updates),
  calendarRemove: (id) => ipcRenderer.invoke('calendar:remove', id),

  // Reminder listener
  onScheduleReminder: (callback) => {
    ipcRenderer.on('schedule-reminder', (_event, schedule) => callback(schedule));
  },
});
