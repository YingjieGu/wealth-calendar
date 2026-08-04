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

  // Fortune sidecar
  paipan: (birth, gender) => ipcRenderer.invoke('fortune:paipan', birth, gender),
  natalChart: (birth) => ipcRenderer.invoke('fortune:chart', birth),
  todayAlmanac: (dateStr) => ipcRenderer.invoke('fortune:almanac', dateStr),
  getDailyFortune: (dateStr, force) => ipcRenderer.invoke('fortune:daily', dateStr, force),

  // Reminder listener
  onScheduleReminder: (callback) => {
    ipcRenderer.on('schedule-reminder', (_event, schedule) => callback(schedule));
  },
  onFortuneReminder: (callback) => {
    ipcRenderer.on('fortune-reminder', (_event, data) => callback(data));
  },

  // Quit app (from context menu)
  quitApp: () => ipcRenderer.send('app-quit'),

  // Chat
  chatSend: (message) => ipcRenderer.invoke('chat:send', message),
  chatClear: () => ipcRenderer.invoke('chat:clear'),

  // Speech
  asrTranscribe: (audioArrayBuffer, language) => ipcRenderer.invoke('asr:transcribe', audioArrayBuffer, language),
  ttsSynthesize: (text) => ipcRenderer.invoke('tts:synthesize', text),
  modelsStatus: () => ipcRenderer.invoke('models:status'),

  // Custom pet image
  saveCustomPetImage: (dataUrl) => ipcRenderer.invoke('pet:save-image', dataUrl),
  loadCustomPetImage: () => ipcRenderer.invoke('pet:load-image').then((r) => (r ? r.dataUrl : null)),
});
