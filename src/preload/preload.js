const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wealthCalendar', {
  // Platform (win32/darwin/linux) for per-platform styling
  platform: process.platform,

  // Custom window drag support
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', { dx, dy }),

  // Settings persistence
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // Window position
  saveWindowPosition: () => ipcRenderer.send('save-window-position'),
  restoreDefaultPosition: () => ipcRenderer.invoke('restore-default-position'),

  // 空闲感知：系统空闲秒数（主进程 powerMonitor.getSystemIdleTime）
  getIdleTime: () => ipcRenderer.invoke('get-idle-time'),

  // Calendar: switch views
  openCalendar: () => ipcRenderer.invoke('open-calendar'),
  closeCalendar: () => ipcRenderer.invoke('close-calendar'),
  openChatPanel: () => ipcRenderer.invoke('open-chat-panel'),
  closeChatPanel: () => ipcRenderer.invoke('close-chat-panel'),

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
  quitApp: () => ipcRenderer.send('quit-app'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  onPetSummoned: (cb) => {
    ipcRenderer.on('pet-summoned', () => cb && cb());
  },

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

  // Built-in pet assets
  petsList: () => ipcRenderer.invoke('pets:list'),
  petsImage: (name) => ipcRenderer.invoke('pets:image', name).then((r) => (r ? r.dataUrl : null)),
  petsApply: (name) => ipcRenderer.invoke('pets:apply', name),

  // Wallpaper calendar
  applyWallpaper: () => ipcRenderer.invoke('wallpaper:apply'),
  setWallpaperAutoRefresh: (enabled) => ipcRenderer.invoke('wallpaper:refresh-timer', enabled),

  // Click-through (transparent pet window)
  setClickThrough: (value) => ipcRenderer.send('set-click-through', value),
  setPanelOpen: (value) => ipcRenderer.send('set-panel-open', value),
  onCursorState: (callback) => {
    ipcRenderer.on('cursor-state', (_event, state) => callback(state));
  },

  // 全屏漫游：行为状态机驱动（roam-start/roam-stop），拖动暂停/恢复，设置开关，
  // 监听漫游状态（窗口移动↔宠物走路）与面板关闭恢复（pet-resume）
  roamStart: () => ipcRenderer.send('roam-start'),
  roamStop: () => ipcRenderer.send('roam-stop'),
  roamPause: () => ipcRenderer.send('roam-pause'),
  roamResume: () => ipcRenderer.send('roam-resume'),
  roamSet: (enabled) => ipcRenderer.send('roam-set', enabled),
  onPetRoam: (callback) => {
    ipcRenderer.on('pet-roam', (_event, roaming) => callback(roaming));
  },
  onPetResume: (callback) => {
    ipcRenderer.on('pet-resume', () => callback && callback());
  },

  // 主题素材系统：按主题+动作文件名取动图 data URL（财神 webp / 猫咪 gif）
  themeAsset: (theme, file) => ipcRenderer.invoke('themes:asset', theme, file).then((r) => (r ? r.dataUrl : null)),

  // 粘人模式：活跃工作窗口检测 / 趴窗口 / 拖动松手吸附
  getActiveWindowRect: () => ipcRenderer.invoke('get-active-window-rect'),
  petSit: (target) => ipcRenderer.invoke('pet-sit', target),
  petSnap: () => ipcRenderer.invoke('pet-snap'),

  // Multimodal pet animation
  multimodalGenerate: (imageDataUrl) => ipcRenderer.invoke('multimodal:generate', imageDataUrl),
  multimodalClear: () => ipcRenderer.invoke('multimodal:clear'),
  multimodalHasVideo: () => ipcRenderer.invoke('multimodal:has-video'),
  multimodalVideo: () => ipcRenderer.invoke('multimodal:video-path').then((r) => (r ? r.dataUrl : null)),
});
