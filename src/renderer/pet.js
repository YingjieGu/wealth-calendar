// Pet: 随机行为状态机（漫游 walk ↔ 休息 sleep/play/happy/sad）+ 主题动作素材
// 宠物固定在窗口中心，移动完全靠全屏漫游（窗口移动），不再有窗口内小范围走动

const PetState = {
  init() {
    this.petEl = document.getElementById('pet');
    this.zzzEl = document.getElementById('pet-zzz');
    this.stageEl = document.getElementById('pet-stage');
    this.currentState = 'idle';
    this.activityMode = 'active'; // 'active' | 'quiet' | 'clingy'
    // 随机行为状态机：各模式的阶段(active: roam/rest, quiet: quiet, clingy: clingy/sit)
    this._currentPhase = null;      // 'roam' | 'rest' | 'quiet' | 'clingy' | 'sit'
    this._behaviorTimer = null;    // 阶段切换定时器
    this._lastMouseFollow = 0;     // 粘人「跟鼠标」上次跟随时间(冷却 15s)
    // 豆包式玩法状态
    this._theme = 'cat';           // 当前主题（cat/fortune/bagua/custom/cat1/cat2/caishen）
    this._platform = (window.wealthCalendar && window.wealthCalendar.platform) || 'linux';
    this._roaming = false;         // 全屏漫游中（窗口移动 ↔ 宠物走路动画）
    this._idleBucket = undefined;  // 空闲感知上次区间：active/idle/rest/sleep
    this._idleWatchTimer = null;   // 空闲检查定时器
    this._waterTimer = null;       // 喝水提醒定时器
    this._clicks = [];             // 连击计数（1 秒内的点击时间戳）
    this._clickTimer = null;       // 单击反应的延迟定时器（用于区分单击/双击）
  },

  start() {
    this.init();
    this.enterState('idle');
    this.setupInteraction();
    this.startProactive();
    // 豆包式陪伴玩法：时间问候 / 空闲感知 / 喝水提醒
    this.sayTimeGreeting();
    this.startIdleWatch();
    this.startWaterReminder();
    // 全屏漫游：窗口实际移动时宠物持续走路视觉（漫游由下方行为状态机驱动）
    try {
      window.wealthCalendar.onPetRoam((roaming) => {
        this._roaming = !!roaming;
        // 若主进程因面板关闭等原因恢复漫游，且当前处于漫游阶段，确保走路视觉
        if (roaming && this._currentPhase === 'roam' && this.currentState !== 'walk') {
          this.enterState('walk');
        }
      });
    } catch (e) { /* ignore */ }
    // 面板/聊天/日历关闭后，主进程通知恢复行为循环（重新进入当前阶段）
    try {
      window.wealthCalendar.onPetResume(() => this._rearmCurrentPhase());
    } catch (e) { /* ignore */ }
    // 粘人「跟鼠标」：鼠标在工作窗口内快速移动时概率性挪过去互动
    try {
      window.wealthCalendar.onPetMouseFast((evt) => this._handleMouseFast(evt));
    } catch (e) { /* ignore */ }
    // 随机行为状态机启动：active 先休息展示状态；quiet 右下角据点；clingy 右下角/趴窗口
    this._currentPhase = null;
    this._behaviorTimer = null;
    setTimeout(() => {
      const mode = this._activityMode();
      if (mode === 'quiet') this._beginQuietPhase();
      else if (mode === 'clingy') this._beginClingyRest('sleep');
      else this._beginRestPhase();
    }, 1200);
  },

  // 当前宠物模式：active | quiet | clingy(粘人)
  _activityMode() {
    return this.activityMode;
  },

  setActivity(mode) {
    const changed = mode !== this.activityMode;
    this.activityMode = mode;
    if (!changed) return; // 启动默认模式不变时不重排（避免启动即漫游的抖动）
    // 只有活跃模式才漫游；切到安静/粘人先停漫游并停靠右下角据点
    try { window.wealthCalendar.roamStop(); } catch (e) { /* ignore */ }
    if (mode === 'quiet') {
      this._dockCorner();          // 安静：右下角据点
      this._beginQuietPhase();
    } else if (mode === 'clingy') {
      this._dockCorner();          // 粘人：默认右下角据点
      this._beginClingyRest('sleep'); // 先安心在角落睡一轮，再随状态决定是否趴窗
    } else {
      this._beginRoamPhase();      // 活跃：全屏漫游循环
    }
  },

  // ============ 随机行为状态机 ============
  // active: 全屏随机漫游(walk) ↔ 休息(sleep/play/happy/sad)，随机动或不动。
  // quiet: 右下角据点(workArea 右下角留 20px)，状态只 sleep/idle，不漫游；
  //        拖动后停在新位置不再回角（本阶段不重复 dock）。
  // clingy: 默认右下角休息(sleep/sad 等)；抽到 happy/play → 趴到活跃工作窗口
  //        上沿居中(空间不足贴下沿)，玩耍 20-60s 后回右下角；鼠标快速移动时概率性跟随。
  _scheduleNextPhase() {
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    const mode = this._activityMode();
    if (mode === 'quiet') { this._beginQuietPhase(); return; }
    if (mode === 'clingy') {
      if (this._currentPhase === 'sit') {
        this._dockCorner();        // 趴完回右下角
        this._beginClingyRest();
      } else {
        this._beginClingyRest();   // 右下角休息决策：抽到 happy/play → 去趴窗口
      }
      return;
    }
    // active：漫游开关默认开启（关闭则只休息循环，窗口停原位）
    let roamOn = true;
    try {
      roamOn = !(SettingsManager.settings && SettingsManager.settings.petRoam === false);
    } catch (e) { /* ignore */ }
    if (!roamOn) { this._beginRestPhase(); return; }
    if (this._currentPhase === 'roam') this._beginRestPhase();
    else this._beginRoamPhase();
  },

  // 漫游阶段（仅活跃模式）：主进程移动窗口，宠物 walk 动作图，持续 15-45s
  _beginRoamPhase() {
    this._currentPhase = 'roam';
    try { window.wealthCalendar.roamStart(); } catch (e) { /* ignore */ }
    this.enterState('walk');
    const dur = 15000 + Math.random() * 30000;
    this._behaviorTimer = setTimeout(() => this._scheduleNextPhase(), dur);
  },

  // 休息阶段（活跃模式）：停下窗口，随机 sleep/play/happy/sad，10-40s
  _beginRestPhase() {
    this._currentPhase = 'rest';
    try { window.wealthCalendar.roamStop(); } catch (e) { /* ignore */ }
    const pool = ['sleep', 'play', 'happy', 'sad'];
    this.enterState(pool[Math.floor(Math.random() * pool.length)]);
    const dur = 10000 + Math.random() * 30000;
    this._behaviorTimer = setTimeout(() => this._scheduleNextPhase(), dur);
  },

  // 安静模式阶段：右下角据点，状态只 sleep/idle，不漫游；拖动后停新位置（不重复 dock）
  _beginQuietPhase() {
    this._currentPhase = 'quiet';
    try { window.wealthCalendar.roamStop(); } catch (e) { /* ignore */ }
    this.enterState(Math.random() < 0.4 ? 'sleep' : 'idle');
    const dur = 20000 + Math.random() * 20000;
    this._behaviorTimer = setTimeout(() => this._scheduleNextPhase(), dur);
  },

  // 粘人模式阶段：右下角休息(sleep/sad 等)；抽到 happy/play → 去趴工作窗口。
  // forcedState 传入时强制该休息状态（切粘人后先安心在角落睡一轮）。
  _beginClingyRest(forcedState) {
    this._currentPhase = 'clingy';
    try { window.wealthCalendar.roamStop(); } catch (e) { /* ignore */ }
    let state = forcedState;
    if (!state) {
      const pool = ['sleep', 'sad', 'happy', 'play'];
      state = pool[Math.floor(Math.random() * pool.length)];
      if (state === 'happy' || state === 'play') {
        this._beginSitPhase();      // 心情好/玩耍 → 趴到工作窗口玩耍
        return;
      }
    }
    this.enterState(state);
    const dur = 20000 + Math.random() * 20000;
    this._behaviorTimer = setTimeout(() => this._scheduleNextPhase(), dur);
  },

  // 停靠屏幕右下角据点（安静/粘人模式）
  async _dockCorner() {
    try { await window.wealthCalendar.petCorner(); } catch (e) { /* ignore */ }
  },

  // 趴着阶段（粘人）：窗口停到活跃窗口上沿居中（空间不足贴下沿），显示"趴着玩耍"，停留 20-60s。
  // targetRect 传入时直接用于定位（拖动吸附场景）；skipMove 为 true 时窗口已就位不再移动。
  async _beginSitPhase(targetRect, skipMove) {
    this._currentPhase = 'sit';
    try { window.wealthCalendar.roamStop(); } catch (e) { /* ignore */ }
    if (!skipMove) {
      try {
        const t = targetRect || await window.wealthCalendar.getActiveWindowRect();
        if (this._currentPhase !== 'sit') return; // 期间状态被切走（如用户拖动），放弃趴下
        await window.wealthCalendar.petSit(t);    // t 为 null → 主进程随机屏幕位置趴下（降级）
      } catch (e) { /* 定位失败也照常展示趴着状态 */ }
    }
    if (this._currentPhase !== 'sit') return;
    this.enterState('sit');
    const dur = 20000 + Math.random() * 40000;
    this._behaviorTimer = setTimeout(() => this._scheduleNextPhase(), dur);
  },

  // 粘人「跟鼠标」：鼠标在工作窗口内快速移动时, 概率性挪到鼠标上方约 100px 处互动
  async _handleMouseFast(evt) {
    if (this._activityMode() !== 'clingy') return;
    if (!evt || Math.random() > 0.35) return;     // 概率性
    const now = Date.now();
    if (this._lastMouseFollow && now - this._lastMouseFollow < 15000) return; // 冷却 15s
    this._lastMouseFollow = now;
    let rect = null;
    try { rect = await window.wealthCalendar.getActiveWindowRect(); } catch (e) { /* ignore */ }
    if (!rect) return;                            // 检测不到活跃窗口不跟
    if (evt.x < rect.x || evt.x > rect.x + rect.width || evt.y < rect.y || evt.y > rect.y + rect.height) return;
    // 暂停当前阶段，挪到鼠标附近并展示互动状态，短暂停留后继续粘人循环
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    try { await window.wealthCalendar.petFollowMouse(evt.x, evt.y); } catch (e) { /* ignore */ }
    this.enterState(Math.random() < 0.5 ? 'play' : 'happy');
    this._behaviorTimer = setTimeout(() => this._scheduleNextPhase(), 8000);
  },

  // 重新进入当前模式/阶段（面板关闭恢复时调用）
  _rearmCurrentPhase() {
    const mode = this._activityMode();
    if (mode === 'quiet') { this._beginQuietPhase(); return; }
    if (mode === 'clingy') { this._scheduleNextPhase(); return; } // sit→回角, 其他继续循环
    if (this._currentPhase === 'roam') this._beginRoamPhase();
    else this._beginRestPhase();
  },

  // 设置页切换漫游开关：立即按新开关重新调度
  onRoamSettingChange() {
    this._scheduleNextPhase();
  },

  // 拖动中暂停行为状态机（不切阶段），松手时粘人模式做吸附检测
  onDragStart() {
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
  },
  async onDragRelease() {
    // 粘人模式：松手时鼠标在活跃窗口内 → 吸附趴上去；其余恢复当前模式/阶段
    let snapped = false;
    try {
      if (this._activityMode() === 'clingy') {
        const r = await window.wealthCalendar.petSnap();
        snapped = !!(r && r.sitting);
      }
    } catch (e) { /* ignore */ }
    if (snapped) this._beginSitPhase(null, true); // 已吸附趴上，不再移动窗口
    else this._rearmCurrentPhase();
  },

  // ============ 状态展示 ============
  // 宠物固定在窗口中心；移动完全靠全屏漫游（窗口移动），这里不再有 petX/petY
  enterState(state) {
    this.currentState = state;
    this.petEl.className = ''; // clear all state classes
    this.petEl.style.left = '50%';
    this.petEl.style.top = '50%';
    this.petEl.style.transform = 'translate(-50%, -50%)';
    this.zzzEl.classList.remove('show');
    if (state === 'sleep') this.zzzEl.classList.add('show');
    this._applyStateVisual(state);
  },

  // 主题动作映射：各状态 → 动作素材文件名（随机取一张；素材少的状态复用）。
  // 文件名语义分类：sleep(睡觉/困了/躺着舒服) happy(开心/夸赞/音乐/羡慕/野餐)
  // sad(伤心/哭/冷/心疼/安抚/生气/放屁) play(玩耍/捣蛋/挖沙/攻击/请罪/拖地)
  // walk(无专门走路图, 复用 play 中合适动作) sit(粘人趴着: 偷看/挖沙/躺着舒服/户外野餐)
  THEME_ACTIONS: {
    cat1: {
      walk: ['抬头看看.gif', '打屁股.gif'],          // 复用 play 中适合的动作
      sleep: ['睡觉.gif'],
      happy: ['爱了爱了.gif', '哇我真好看.gif', '欧耶.gif', '听音乐.gif', '哇羡慕.gif'], // 随机
      sad: ['伤心.gif', '哭了.gif', '好冷.gif', '心疼你.gif', '别哭别哭.gif', '安抚你.gif'],
      play: ['抓你哦.gif', '打屁股.gif', '抬头看看.gif', '偷看.gif', '捣蛋踢倒水杯.gif', '挖沙.gif', '瞄准准备攻击.gif', '负“鱼”请罪.gif'],
      sit: ['偷看.gif', '挖沙.gif'],
    },
    cat2: {
      walk: ['哈哈哈.gif'],                          // 无专门走路图，复用 play
      sleep: ['困了.gif', '躺着舒服.gif'],
      happy: ['哈哈哈.gif', '欧耶.gif', '太厉害了.gif', '户外野餐.gif'], // 随机
      sad: ['哼生气.gif', '放屁给你吃.webp'],
      play: ['拖地.gif', '哈哈哈.gif'],
      sit: ['户外野餐.gif', '躺着舒服.gif'],
    },
    caishen: {
      walk: ['财神到.webp'],
      sleep: ['马上有钱.webp'],
      happy: ['马上有钱.webp'],
      sad: ['财神到.webp'],
      play: ['财神到.webp'],
      sit: ['财神到.webp'],
    },
  },

  // 按状态展示宠物视觉：素材主题 → 动作动图；其余 → SVG/emoji
  // walk→走跳, sit→趴着玩耍, 其余休息状态→idle 呼吸
  _stateClass(state) {
    if (state === 'walk') return 'walking';
    if (state === 'sit') return 'sit';
    return 'idle';
  },
  _applyStateVisual(state) {
    const theme = this._theme || 'cat';
    const isMaterial = theme === 'cat1' || theme === 'cat2' || theme === 'caishen';
    const svgEl = document.getElementById('pet-svg');
    const cls = this._stateClass(state);
    if (isMaterial) {
      // 加载当前状态的动图素材（SwiftShader 后本机软渲染也能绘制位图；
      // walk/sit 加动画类；素材缺失时 _loadActionImage 内兜底 SVG）
      this.petEl.classList.add(cls);
      this._loadActionImage(state);
      return;
    }
    // 内置 SVG 主题（cat/fortune/bagua/custom 兜底）
    this._showPetElement(svgEl);
    this.petEl.classList.add(cls);
  },

  async _loadActionImage(state) {
    const theme = this._theme || 'cat1';
    const map = PetState.THEME_ACTIONS[theme];
    const list = (map && map[state]) || (map && map.play) || null;
    if (!list) return;
    const file = list[Math.floor(Math.random() * list.length)];
    try {
      const dataUrl = await window.wealthCalendar.themeAsset(theme, file);
      if (!dataUrl) {
        // 素材缺失：退回 SVG 兜底
        this._showPetElement(document.getElementById('pet-svg'));
        return;
      }
      if (this.currentState !== state) return; // 状态已切换，丢弃过期素材
      const img = document.getElementById('pet-action');
      this._showPetElement(img);
      img.src = dataUrl;
      img.alt = file;
    } catch (e) { /* ignore */ }
  },

  // ---- Click / double-click / combo interaction ----
  setupInteraction() {
    const lines = [
      '喵～找小财有什么事呀？',
      '今天也要加油哦！💰',
      '右键小财可以看今日运势哦～',
      '想聊天就点 💬，小财随时在！',
      '偷偷告诉你，今天财神方位在正东～',
      '小财会一直陪着你的！',
    ];

    // 单击：随机触发小反应（蹭蹭/冒爱心/打滚等）。用 300ms 延迟区分双击。
    // 连击彩蛋：1 秒内点击宠物 5 次触发「别戳啦，戳坏了！」
    this.petEl.addEventListener('click', () => {
      const now = Date.now();
      this._clicks = (this._clicks || []).filter((t) => now - t < 1000);
      this._clicks.push(now);

      // 任何一次新点击都取消尚未触发的单击反应（双击或连击时不弹小反应）
      if (this._clickTimer) { clearTimeout(this._clickTimer); this._clickTimer = null; }

      // 1 秒内第 5 次点击 → 彩蛋
      if (this._clicks.length >= 5) {
        this._clicks = [];
        this.say('别戳啦，戳坏了！😤');
        this._resumeIfIdle();
        return;
      }

      // 300ms 内没有第二次点击，才真正触发单击反应
      this._clickTimer = setTimeout(() => this.triggerClickReaction(), 300);
    });

    // 双击：保留原有说话（取消待触发的单击反应）
    this.petEl.addEventListener('dblclick', () => {
      if (this._clickTimer) { clearTimeout(this._clickTimer); this._clickTimer = null; }
      const line = lines[Math.floor(Math.random() * lines.length)];
      this.say(line);
      this._resumeIfIdle();
    });
  },

  // 单击小反应的台词与表情
  clickReactions: [
    { emoji: '🥰', line: '蹭蹭~ 主人摸我啦，好开心！' },
    { emoji: '💗', line: 'biu~ 小财冒爱心啦！' },
    { emoji: '😄', line: '咕噜咕噜~ 打个滚～' },
    { emoji: '🐾', line: '喵呜~ 再来一下嘛！' },
    { emoji: '✨', line: '叮！好运+1，主人的幸运值又涨啦~' },
    { emoji: '🎉', line: '主人戳我，是不是有好消息要分享呀？' },
  ],

  triggerClickReaction() {
    const r = this.clickReactions[Math.floor(Math.random() * this.clickReactions.length)];
    this.say(`${r.emoji} ${r.line}`);
    this._resumeIfIdle();
  },

  // ---- Bubble ----
  say(text) {
    const bubble = document.getElementById('reminder-bubble');
    const el = document.getElementById('reminder-bubble-text');
    el.textContent = `💬 ${text}`;
    bubble.classList.remove('hidden');
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), 8000);
  },

  // ---- 时间感知问候：早安/午安/晚安/深夜，每天每时段只一次 ----
  greetingLines: {
    morning: [
      '☀️ 早安主人！新的一天，财运旺旺，冲鸭！',
      '☀️ 早上好！小财祝你今天顺顺利利，好运连连~',
    ],
    noon: [
      '🌤️ 午安~ 记得好好吃午饭，养足精神！',
      '🌤️ 中午好！小财陪你小憩一下，下午继续加油~',
    ],
    evening: [
      '🌙 晚上好！今天辛苦啦，早点休息哦~',
      '🌙 晚安前的问候~ 今天也要开开心心！',
    ],
    night: [
      '🌃 夜深了，主人早点睡呀，熬夜伤身~',
      '🌃 这么晚还没休息？小财默默陪着你~',
    ],
  },

  getTimeSegment() {
    const h = new Date().getHours();
    if (h >= 7 && h <= 10) return 'morning';   // 早安 7-10
    if (h >= 12 && h <= 14) return 'noon';     // 午安 12-14
    if (h >= 18 && h <= 21) return 'evening';  // 晚安 18-21
    return 'night';                            // 深夜 22-23 / 0-6
  },

  sayTimeGreeting() {
    try {
      const segment = this.getTimeSegment();
      // 用「时段 + 本地日期」做去重 key，保证每天每时段只问候一次
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const key = `wc-greeting-${segment}-${today}`;
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
      } catch (e) { /* localStorage 不可用时也照常问候 */ }
      const arr = this.greetingLines[segment];
      if (arr && arr.length) {
        // 稍微延迟再开口，避免和启动播报/动画重叠
        setTimeout(() => this.say(arr[Math.floor(Math.random() * arr.length)]), 1500 + Math.random() * 3000);
      }
    } catch (e) { /* ignore */ }
  },

  // ---- 空闲感知：主进程 powerMonitor 提供空闲秒数，每 5 分钟检查一次 ----
  startIdleWatch() {
    this._idleWatchTimer = setInterval(() => this.checkIdle(), 5 * 60 * 1000);
    // 首次延迟 1 分钟再检查，避免与启动问候/运势播报抢气泡
    setTimeout(() => this.checkIdle(), 60 * 1000);
  },

  // 空闲区间划分：<1min 在线 / 1-5min 轻度离开 / 5-30min 该休息 / >30min 深度空闲
  getIdleBucket(seconds) {
    if (seconds < 60) return 'active';
    if (seconds < 5 * 60) return 'idle';
    if (seconds < 30 * 60) return 'rest';
    return 'sleep';
  },

  async checkIdle() {
    if (!window.wealthCalendar || !window.wealthCalendar.getIdleTime) return;
    let seconds = 0;
    try {
      const r = await window.wealthCalendar.getIdleTime();
      seconds = (r && typeof r.seconds === 'number') ? r.seconds : 0;
    } catch (e) {
      return; // IPC 失败则跳过本轮检查
    }

    const bucket = this.getIdleBucket(seconds);
    const prev = this._idleBucket;
    this._idleBucket = bucket;

    if (bucket === 'sleep' && prev !== 'sleep') {
      // 深度空闲：让宠物睡一会儿（复用现有 enterState，暂停随机状态机）
      this._pauseStateMachine();
      this.enterState('sleep');
      this.say('😴 主人好久没动静，小财先眯一会儿…');
    } else if (bucket === 'rest' && (prev === 'idle' || prev === 'active' || prev === undefined)) {
      // 首次进入休息区间时提醒一次（prev 判断保证不重复刷屏）
      this.say('主人是不是累了，起来活动一下，顺便喝口水~ 💧');
    } else if (bucket === 'active' && (prev === 'sleep' || prev === 'rest')) {
      // 用户回来了：恢复状态机并打招呼
      this._resumeStateMachine();
      this.say('主人回来啦！小财好想你~ 🥰');
    }
  },

  // 暂停行为状态机（空闲睡觉时保持 sleep：停止阶段切换 + 停下窗口漫游）
  _pauseStateMachine() {
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    try { window.wealthCalendar.roamStop(); } catch (e) { /* ignore */ }
  },

  // 恢复行为状态机（按当前阶段重新调度：rest→继续休息，roam→继续漫游）
  _resumeStateMachine() {
    this._scheduleNextPhase();
  },

  // 用户主动互动时（单击/双击/摇签），若宠物正因空闲睡着则立即恢复活力
  _resumeIfIdle() {
    if (this._roaming) return; // 漫游中保持走路视觉，不切换
    if (this._idleBucket === 'sleep' || this._idleBucket === 'rest') {
      this._idleBucket = 'active';
      this._resumeStateMachine();
    }
  },

  // ---- 财神特色：摇一支签（右键菜单触发） ----
  fortuneSticks: {
    '上上签': [
      '🎋 上上签！财神驾到，今日正东方位有贵人，宜大胆求财！',
      '🎋 上上签！鸿运当头，横财就手，钱包要鼓起来啦~',
      '🎋 上上签！诸事大吉，心想事成，好运正在敲门！',
    ],
    '上签': [
      '🎋 上签！财运渐旺，稳中求进必有回报，别错过良机~',
      '🎋 上签！贵人将至，今天的决定都会有好结果！',
      '🎋 上签！小财掐指一算，努力之人今天运势加身！',
    ],
    '中签': [
      '🎋 中签！运势平平，宜守不宜攻，钱包看紧些~',
      '🎋 中签！财运小有起伏，冲动是魔鬼，三思而后行。',
      '🎋 中签！今日宜静养蓄力，明天再出发也不迟。',
    ],
    '下签': [
      '🎋 下签…诸事宜谨慎，破财消灾，明天会更好！',
      '🎋 下签…财运微滞，莫要投资冲动，早点休息养元气。',
      '🎋 下签…小财提醒：凡事留一线，日后好相见~',
    ],
  },

  drawStick() {
    const types = ['上上签', '上签', '中签', '下签'];
    const type = types[Math.floor(Math.random() * types.length)];
    const arr = this.fortuneSticks[type];
    const line = arr[Math.floor(Math.random() * arr.length)];
    this.say(line); // 签文已带财运提示，直接走气泡
    this._resumeIfIdle();
  },

  // ---- 喝水提醒：每 2 小时提醒一次 ----
  startWaterReminder() {
    if (this._waterTimer) clearInterval(this._waterTimer);
    this._waterTimer = setInterval(() => {
      this.say('💧 小财提醒主人喝水啦！规律补水身体好~');
    }, 2 * 60 * 60 * 1000);
  },

  // ---- Proactive interaction (Doubao-style companion) ----
  proactiveLines: [
    '喵～主人，小财来陪你啦！',
    '工作累了记得起来走走哦～',
    '要不要看看今天的运势？右键小财就行～',
    '小财掐指一算，你今天是潜力股！📈',
    '财神爷今天心情不错，适合谈合作哦！',
    '记得喝水，别熬太晚啦！',
    '想听点啥？小财可以给你讲讲今天的宜忌～',
    '金币金币，滚滚来～💰',
  ],

  startProactive() {
    // 随机 20-40 分钟主动说一句话
    const scheduleNext = () => {
      this._proactiveTimer = setTimeout(() => {
        if (Math.random() < 0.8) {
          const line = this.proactiveLines[Math.floor(Math.random() * this.proactiveLines.length)];
          this.say(line);
        }
        scheduleNext();
      }, (20 + Math.random() * 20) * 60 * 1000);
    };
    scheduleNext();

    // 启动后 30 秒播报今日运势（财神特色播报）
    setTimeout(() => this.sayDailyFortune(), 30000);

    // 吉时提醒：如果当前时间落在运势吉时区间内，提醒一次
    setTimeout(() => this.checkGoodHour(), 40000);
  },

  async sayDailyFortune() {
    try {
      const fortune = await window.wealthCalendar.getDailyFortune();
      if (!fortune || !fortune.overall) return;
      const dir = fortune.caiShenDir || '';
      // 主求方向提示（从设置读取）
      let wishHint = '';
      try {
        const wish = SettingsManager.settings && SettingsManager.settings.mainWish;
        const wishMap = { wealth: '求财', love: '求姻缘', career: '求事业', health: '求健康', study: '求学业', peace: '求平安' };
        wishHint = wishMap[wish] ? `，今天重点：${wishMap[wish]}` : '';
      } catch (e) { /* ignore */ }
      let line = `📅 今日运势 ${fortune.overall} 分`;
      if (dir) line += `，财神方位${dir}`;
      line += wishHint;
      if (fortune.reminderLines && fortune.reminderLines[0]) {
        line += `。${fortune.reminderLines[0]}`;
      }
      this.say(line);
    } catch (e) { /* ignore */ }
  },

  checkGoodHour() {
    try {
      window.wealthCalendar.getDailyFortune().then((fortune) => {
        if (!fortune || !fortune.goodHours || !fortune.goodHours.length) return;
        const now = new Date();
        const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const inGood = fortune.goodHours.some((g) => hm >= g.start && hm <= g.end);
        if (inGood) {
          this.say(`⏰ 现在正是今日吉时（${hm}），适合做重要决定！`);
        }
      });
    } catch (e) { /* ignore */ }
  },

  // ---- 内联 SVG 宠物（软渲染安全：纯矢量 path，不依赖位图/emoji 字体，
  //        彻底规避软渲染下 emoji 灰色剪影/消失的问题） ----
  svgCat() {
    // 可爱橘猫：圆脸 + 尖耳 + 绿眼睛 + 胡须 + 会摇的尾巴
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="104" height="104" aria-hidden="true">
  <g class="tail"><path d="M95 86 C112 82 116 68 110 56 C107 50 100 52 102 60 C106 70 102 78 88 78" stroke="#e89b3f" stroke-width="9" stroke-linecap="round" fill="none"/></g>
  <ellipse class="body" cx="60" cy="92" rx="32" ry="24" fill="#f2a83b"/>
  <ellipse cx="60" cy="96" rx="20" ry="15" fill="#ffe9c9"/>
  <ellipse cx="42" cy="106" rx="9" ry="6" fill="#f7c06a"/>
  <ellipse cx="78" cy="106" rx="9" ry="6" fill="#f7c06a"/>
  <circle class="head" cx="60" cy="52" r="31" fill="#f2a83b"/>
  <path d="M33 37 L27 12 L51 30 Z" fill="#f2a83b"/>
  <path d="M87 37 L93 12 L69 30 Z" fill="#f2a83b"/>
  <path d="M35 34 L30 17 L48 29 Z" fill="#f7b7a3"/>
  <path d="M85 34 L90 17 L72 29 Z" fill="#f7b7a3"/>
  <path d="M52 22 Q60 13 68 22" stroke="#d9802b" stroke-width="4" fill="none" stroke-linecap="round"/>
  <g class="eyes">
    <ellipse cx="48" cy="52" rx="6" ry="8" fill="#2f7d46"/>
    <circle cx="49" cy="53" r="3" fill="#12301e"/>
    <ellipse cx="72" cy="52" rx="6" ry="8" fill="#2f7d46"/>
    <circle cx="73" cy="53" r="3" fill="#12301e"/>
  </g>
  <path d="M58 63 L62 63 L60 66 Z" fill="#e06f5f"/>
  <path d="M60 66 Q54 72 48 70" stroke="#c96a52" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M60 66 Q66 72 72 70" stroke="#c96a52" stroke-width="2" fill="none" stroke-linecap="round"/>
  <g stroke="#f7e9cf" stroke-width="2" stroke-linecap="round" fill="none">
    <path d="M33 57 L13 53"/><path d="M33 64 L13 66"/>
    <path d="M87 57 L107 53"/><path d="M87 64 L107 66"/>
  </g>
  <ellipse cx="33" cy="66" rx="6" ry="4" fill="#f7b7a3" opacity="0.7"/>
  <ellipse cx="87" cy="66" rx="6" ry="4" fill="#f7b7a3" opacity="0.7"/>
</svg>`;
  },

  svgFortune() {
    // Q版财神：红袍 + 金官帽 + 微笑 + 会浮动的金元宝
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="104" height="104" aria-hidden="true">
  <g class="ingot">
    <path d="M42 40 Q60 24 78 40 Q88 45 86 54 L34 54 Q32 45 42 40 Z" fill="#ffd23f"/>
    <ellipse cx="60" cy="54" rx="26" ry="7" fill="#ffc21a"/>
    <ellipse cx="60" cy="53" rx="26" ry="3.5" fill="#ffe488"/>
  </g>
  <path class="body" d="M38 62 Q33 104 45 108 L75 108 Q87 104 82 62 Z" fill="#d8402e"/>
  <path d="M52 58 Q60 66 68 58 L66 50 Q60 54 54 50 Z" fill="#ffe9a8"/>
  <rect x="38" y="86" width="44" height="8" rx="4" fill="#ffd23f"/>
  <circle class="head" cx="60" cy="42" r="23" fill="#ffd9b0"/>
  <path d="M37 38 Q37 12 60 12 Q83 12 83 38 Z" fill="#8e2f28"/>
  <rect x="37" y="31" width="46" height="7" rx="3.5" fill="#ffd23f"/>
  <path d="M43 18 L41 4 Q48 0 55 2 L49 20 Z" fill="#ffd23f"/>
  <circle cx="60" cy="20" r="5" fill="#ffe488"/>
  <g class="eyes">
    <circle cx="52" cy="44" r="3.5" fill="#3a1f14"/>
    <circle cx="68" cy="44" r="3.5" fill="#3a1f14"/>
  </g>
  <path d="M54 52 Q60 58 66 52" stroke="#a34a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="46" cy="50" rx="5" ry="3.5" fill="#f7a58f" opacity="0.8"/>
  <ellipse cx="74" cy="50" rx="5" ry="3.5" fill="#f7a58f" opacity="0.8"/>
  <path d="M42 44 Q34 46 30 42" stroke="#5a3a2a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M78 44 Q86 46 90 42" stroke="#5a3a2a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;
  },

  svgBagua() {
    // 八卦太极：外圈八卦刻度 + 阴阳鱼 + 中央财气金元宝
    const ticks = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * 45) * Math.PI / 180;
      const x1 = 60 + 44 * Math.cos(a);
      const y1 = 60 + 44 * Math.sin(a);
      const x2 = 60 + 52 * Math.cos(a);
      const y2 = 60 + 52 * Math.sin(a);
      ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#7dd3fc" stroke-width="4" stroke-linecap="round"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="104" height="104" aria-hidden="true">
  <circle cx="60" cy="60" r="44" fill="none" stroke="#7dd3fc" stroke-width="5" opacity="0.9"/>
  ${ticks.join('\n  ')}
  <circle cx="60" cy="60" r="34" fill="#f5f7fa"/>
  <path d="M60 26 A34 34 0 0 1 60 94 A17 17 0 0 1 60 60 A17 17 0 0 1 60 26 Z" fill="#2b3a5e"/>
  <circle cx="60" cy="43" r="9" fill="#f5f7fa"/>
  <circle cx="60" cy="77" r="9" fill="#2b3a5e"/>
  <g class="ingot">
    <ellipse cx="60" cy="60" rx="13" ry="9" fill="#ffd23f"/>
    <ellipse cx="60" cy="58" rx="13" ry="4.5" fill="#ffe488"/>
    <rect x="56" y="60" width="8" height="6" rx="2" fill="#d9a51e"/>
  </g>
</svg>`;
  },

  svgPet(theme, customEmoji) {
    // 内置主题 → 对应 SVG；custom 在软渲染 Linux 下兜底为萌猫
    if (theme === 'fortune') return this.svgFortune();
    if (theme === 'bagua') return this.svgBagua();
    return this.svgCat();
  },

  // 隐藏 pet 内除指定元素外的所有子内容（SVG/emoji/img/video/canvas/bg/action 互斥显示）
  _showPetElement(el) {
    ['pet-svg', 'pet-emoji', 'pet-img', 'pet-video', 'pet-canvas', 'pet-bg', 'pet-action'].forEach((id) => {
      const e = document.getElementById(id);
      if (e) e.style.display = 'none';
    });
    if (el) el.style.display = 'block';
  },

  setTheme(theme, customEmoji) {
    // 'cat' | 'fortune' | 'bagua' | 'custom' | 'cat1'(素材) | 'caishen'(素材)
    const appEl = document.getElementById('app');
    appEl.classList.remove('theme-cat', 'theme-fortune', 'theme-bagua');
    this._theme = theme;

    const svgEl = document.getElementById('pet-svg');
    const img = document.getElementById('pet-img');
    const emojiSpan = document.getElementById('pet-emoji');
    const video = document.getElementById('pet-video');

    // 素材主题：显示动作动图（webp/gif）。SwiftShader (use-angle=swiftshader)
    // 已让位图在本机 KVM 软渲染环境也能绘制，统一走素材图；
    // themeAsset 加载失败时 _applyStateVisual 内部自动兜底为 SVG。
    if (theme === 'cat1' || theme === 'cat2' || theme === 'caishen') {
      appEl.classList.add(theme === 'caishen' ? 'theme-fortune' : 'theme-cat');
      this._applyStateVisual(this.currentState || 'idle');
      return;
    }

    // 内置三主题：全平台渲染内联 SVG（软渲染安全，比 emoji 好看且统一，
    // 彻底解决软渲染下 emoji 灰色剪影 / 消失的问题）
    if (theme === 'cat' || theme === 'fortune' || theme === 'bagua') {
      this._showPetElement(svgEl);
      svgEl.innerHTML = this.svgPet(theme);
      appEl.classList.add(theme === 'cat' ? 'theme-cat' : theme === 'fortune' ? 'theme-fortune' : 'theme-bagua');
      this._applyStateVisual(this.currentState || 'idle');
      return;
    }

    // custom：Linux 软渲染位图全灭 → SVG 萌猫兜底（替代灰色 emoji）；
    // 其余平台沿用原「AI 动画视频 → canvas 图片 → emoji」逻辑
    if (theme === 'custom') {
      appEl.classList.add('theme-cat'); // 视觉兜底背景（原来 custom+linux 提前 return 丢了背景）
      if (window.wealthCalendar.platform === 'linux') {
        this._showPetElement(svgEl);
        svgEl.innerHTML = this.svgPet('cat', customEmoji);
        this._applyStateVisual(this.currentState || 'idle');
        return;
      }
      // 优先 AI 生成的动画视频，其次 canvas 绘制的图片，兜底 emoji
      this.tryVideoPet().then(async (usedVideo) => {
        if (usedVideo) return;
        const canvas = document.getElementById('pet-canvas');
        const emojiSpan = document.getElementById('pet-emoji');
        canvas.style.display = 'block';
        img.style.display = 'none';
        emojiSpan.style.display = 'none';
        video.style.display = 'none';
        if (canvas.dataset.customLoaded !== '1') {
          const dataUrl = await window.wealthCalendar.loadCustomPetImage();
          if (!dataUrl) {
            canvas.style.display = 'none';
            emojiSpan.style.display = 'block';
            emojiSpan.textContent = '🐱';
            return;
          }
          // GIF 动图直接用 <img> 显示（保留动画），不转静态 PNG
          if (dataUrl.startsWith('data:image/gif')) {
            img.src = dataUrl;
            img.style.display = 'block';
            canvas.style.display = 'none';
            return;
          }
          // 转 PNG 并绘制（软渲染 Linux 无法绘制 <img>/<canvas>，尝试 background-image）
          const png = await convertToPng(dataUrl);
          const bg = document.getElementById('pet-bg');
          canvas.style.display = 'none';
          bg.style.display = 'block';
          bg.style.backgroundImage = `url(${png})`;
          bg.style.backgroundSize = 'contain';
          bg.style.backgroundRepeat = 'no-repeat';
          bg.style.backgroundPosition = 'center';
          bg.dataset.customLoaded = '1';
        }
      });
    }
  },

  // AI-generated animated pet (mp4 from multimodal API)
  async tryVideoPet() {
    try {
      const has = await window.wealthCalendar.multimodalHasVideo();
      if (!has) return false;
      const dataUrl = await window.wealthCalendar.multimodalVideo();
      if (!dataUrl) return false;
      const video = document.getElementById('pet-video');
      const img = document.getElementById('pet-img');
      const emojiSpan = document.getElementById('pet-emoji');
      video.src = dataUrl;
      video.style.display = 'block';
      img.style.display = 'none';
      emojiSpan.style.display = 'none';
      video.play().catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  },
};
