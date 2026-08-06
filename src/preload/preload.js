const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wealthCalendar', {
  // Platform (win32/darwin/linux) for per-platform styling
  platform: process.platform,

  // Custom window drag support
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', { dx, dy }),

  // Settings persistence
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // 开机启动（settings.autostart，默认关）
  setAutoStart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),

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

  // 捣蛋模式：主进程触发吐槽事件 + 手动触发测试
  onPetPrank: (callback) => {
    ipcRenderer.on('pet-prank', (_event, data) => callback && callback(data));
  },
  prankTriggerTest: (mode) => ipcRenderer.invoke('prank:trigger-test', mode),

  // Quit app (from context menu)
  quitApp: () => ipcRenderer.send('app-quit'),
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

  // 位置-阶段模型（猫咪作息）：phase-go 瞬移到按模式权重选出的位置；
  // 设置开关（roam-set，原全屏漫游）；面板开/关暂停/恢复阶段调度
  phaseGo: (mode, forcedType) => ipcRenderer.invoke('phase-go', mode, forcedType),
  roamSet: (enabled) => ipcRenderer.send('roam-set', enabled),
  onPetPanel: (callback) => {
    ipcRenderer.on('pet-panel', () => callback && callback());
  },
  onPetResume: (callback) => {
    ipcRenderer.on('pet-resume', () => callback && callback());
  },

  // 主题素材系统：按主题+动作文件名取动图 data URL（财神 webp / 猫咪 gif）
  themeAsset: (theme, file) => ipcRenderer.invoke('themes:asset', theme, file).then((r) => (r ? r.dataUrl : null)),

  // 粘人模式：活跃工作窗口检测 / 趴窗口 / 拖动松手吸附 / 右下角停靠 / 跟鼠标
  getActiveWindowRect: () => ipcRenderer.invoke('get-active-window-rect'),
  petSit: (target) => ipcRenderer.invoke('pet-sit', target),
  petSnap: () => ipcRenderer.invoke('pet-snap'),
  petCorner: () => ipcRenderer.invoke('pet-corner'),
  petFollowMouse: (mx, my) => ipcRenderer.invoke('pet-follow-mouse', mx, my),
  onPetMouseFast: (callback) => {
    ipcRenderer.on('pet-mouse-fast', (_event, data) => callback && callback(data));
  },

  // Multimodal pet animation
  multimodalGenerate: (imageDataUrl) => ipcRenderer.invoke('multimodal:generate', imageDataUrl),
  multimodalClear: () => ipcRenderer.invoke('multimodal:clear'),
  multimodalHasVideo: () => ipcRenderer.invoke('multimodal:has-video'),
  multimodalVideo: () => ipcRenderer.invoke('multimodal:video-path').then((r) => (r ? r.dataUrl : null)),
});
