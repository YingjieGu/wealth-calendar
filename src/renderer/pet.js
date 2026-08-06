// Pet: 随机行为状态机（漫游 walk ↔ 休息 sleep/play/happy/sad）+ 主题动作素材
// 宠物固定在窗口中心，移动完全靠全屏漫游（窗口移动），不再有窗口内小范围走动

const PetState = {
  init() {
    this.petEl = document.getElementById('pet');
    this.zzzEl = document.getElementById('pet-zzz');
    this.stageEl = document.getElementById('pet-stage');
    this.currentState = 'idle';
    this.activityMode = 'active'; // 'active' | 'quiet' | 'clingy'
    // 位置-阶段模型（猫咪作息）：阶段计时器在渲染进程，位置池/瞬移在主进程
    this._currentPhase = null;      // 保留阶段名（信息用途）
    this._behaviorTimer = null;    // 阶段切换定时器（位置停留 10-20 分钟/阶段）
    this._actionTimer = null;      // 动作切换定时器（位置阶段内每 30-90s 随机换动作，与阶段计时器分离）
    this._currentPosType = 'homeBase'; // 当前所在位置类型（跟鼠标互动后恢复用）
    this._firstSleep = false;      // 切粘人首轮在 homeBase 睡一轮
    this._phaseBooted = false;     // 阶段循环是否已由 setActivity 启动
    this._phaseGen = 0;            // 阶段代数：异步 _beginPhase 期间被唤醒/新阶段打断则放弃
    this._lastMouseFollow = 0;     // 粘人「跟鼠标」上次跟随时间(冷却 15s)
    // 豆包式玩法状态
    this._theme = 'cat1';          // 当前主题（默认素材主题 cat1；内置 cat/fortune/bagua 仅作素材失败兜底）
    this._platform = (window.wealthCalendar && window.wealthCalendar.platform) || 'linux';
    this._roaming = false;         // 全屏漫游中（窗口移动 ↔ 宠物走路动画）
    this._idleBucket = undefined;  // 空闲感知上次区间：active/idle/rest/sleep
    this._idleWatchTimer = null;   // 空闲检查定时器
    this._waterTimer = null;       // 喝水提醒定时器
    this._clicks = [];             // 连击计数（1 秒内的点击时间戳）
    this._clickTimer = null;       // 单击反应的延迟定时器（用于区分单击/双击）
    // ---- 养成与情绪价值系统 ----
    this._petAffinity = 0;         // 亲密度 0-100（settings.petAffinity）
    this._petCoins = 0;            // 金币（settings.petCoins，远期解锁装扮）
    this._petName = '小财';         // 宠物名字（settings.petName，气泡台词替换）
    this._petDailyTask = null;     // 今日任务进度（settings.petDailyTask，按日期重置）
    this._interactionLog = [];     // 互动时间戳（24h 内用于计算心情）
    this._mood = 'normal';         // happy / normal / sad / excited
  },

  // 加载时恢复互动时间戳（settings.petInteractions，24h 窗口内）
  _restoreInteractions(log) {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    this._interactionLog = (Array.isArray(log) ? log : []).filter((t) => typeof t === 'number' && t > cutoff);
    this._recomputeMood();
  },

  start() {
    this.init();
    this.enterState('idle');
    this.setupInteraction();
    this.startProactive();
    this._loadPetGrowth(); // 养成系统：亲密度/金币/每日任务/心情 初始化
    // 豆包式陪伴玩法：时间问候 / 空闲感知 / 喝水提醒 / 每日运势分段播报
    this.sayTimeGreeting();
    this.startIdleWatch();
    this.startWaterReminder();
    this.startFortuneSlots();
    // 面板打开：暂停阶段调度与动作切换（避免面板期间瞬移挪动面板窗口）
    try {
      window.wealthCalendar.onPetPanel(() => {
        if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
        if (this._actionTimer) { clearTimeout(this._actionTimer); this._actionTimer = null; }
      });
    } catch (e) { /* ignore */ }
    // 面板关闭：从当前位置继续阶段循环（下个阶段再瞬移）
    try {
      window.wealthCalendar.onPetResume(() => this._rearmPhase());
    } catch (e) { /* ignore */ }
    // 粘人「跟鼠标」：鼠标在工作窗口内快速移动时概率性挪过去互动
    try {
      window.wealthCalendar.onPetMouseFast((evt) => this._handleMouseFast(evt));
    } catch (e) { /* ignore */ }
    // 捣蛋模式（主进程触发）：吐槽进气泡 + 聊天对话框
    try {
      window.wealthCalendar.onPetPrank((data) => {
        if (!data || !data.text) return;
        this._broadcast(data.text);
      });
    } catch (e) { /* ignore */ }
    // 伙伴模式：主进程剪贴板总结结果 → 气泡 + 聊天对话框
    try {
      window.wealthCalendar.onPartnerSummary((data) => {
        if (!data || !data.text) return;
        this._broadcast(data.text);
      });
    } catch (e) { /* ignore */ }
    // 伙伴模式：窗口感知（60s 轮询活跃窗口标题，切换时概率主动提供帮助）
    this.startPartnerWatch();
    // 启动阶段循环：若 SettingsManager.init 已按保存模式调 setActivity 并启动阶段循环，
    // 则此处跳过（_phaseBooted）；默认 active 在此启动
    this._currentPhase = null;
    this._behaviorTimer = null;
    this._currentPosType = 'homeBase';
    setTimeout(() => {
      if (this._phaseBooted) return;
      this._firstSleep = (this._activityMode() === 'clingy');
      this._beginPhase();
    }, 1500);
  },

  // ---- 伙伴模式 L1：窗口感知 ----
  // 每 60s 拉取活跃窗口标题，标题变化（用户切换工作）时 20% 概率主动提供帮助；
  // 每次切换冷却 10 分钟。仅在 settings.partnerMode 开启时工作（隐私：不上传任何窗口内容）。
  PARTNER_POLL_MS: 60000,
  PARTNER_COOLDOWN_MS: 10 * 60 * 1000,
  PARTNER_TRIGGER_CHANCE: 0.2,
  // 标题关键词 → 主动提供帮助文案（伙伴模式，甜系友好）
  PARTNER_LINES: [
    { keywords: ['代码', 'code', 'vscode', 'idea', 'clion', 'pycharm', 'terminal', 'git', 'npm', '编译', '开发', '编程'], line: '需要我帮你查个 API 吗？或者一起理理思路~' },
    { keywords: ['word', 'doc', '文档', 'office', 'ppt', 'excel', '报表', 'pdf'], line: '需要我帮忙总结这段文档吗？扔给我就好~' },
    { keywords: ['chrome', 'edge', 'firefox', '浏览器', '搜索', '知乎', 'bilibili', '微博'], line: '在看什么好玩的？要我帮你解析一下吗？' },
  ],
  PARTNER_FALLBACK: '需要帮忙随时叫我～',

  startPartnerWatch() {
    this._lastPartnerTitle = null;
    this._lastPartnerOfferAt = 0;
    if (this._partnerWatchTimer) clearInterval(this._partnerWatchTimer);
    this._partnerWatchTimer = setInterval(() => this._partnerCheck(), this.PARTNER_POLL_MS);
    // 启动后先探测一次（若开关已开启）
    setTimeout(() => this._partnerCheck(), 3000);
  },

  async _partnerCheck() {
    if (!window.wealthCalendar || !window.wealthCalendar.getActiveWindowTitle) return;
    try {
      const s = await window.wealthCalendar.loadSettings();
      if (s.partnerMode !== true) return; // 隐私：默认关，只在开启时工作
      const title = await window.wealthCalendar.getActiveWindowTitle();
      if (!title) return; // 标题获取失败 → 不触发
      // 自家宠物窗口（用户正在和小财互动）不算"切换工作"
      if (/财神日历|Wealth Calendar|财富日历/.test(title)) return;
      const changed = title !== this._lastPartnerTitle;
      this._lastPartnerTitle = title;
      if (!changed) return;
      const now = Date.now();
      if (now - this._lastPartnerOfferAt < this.PARTNER_COOLDOWN_MS) return; // 10 分钟冷却
      if (Math.random() >= this.PARTNER_TRIGGER_CHANCE) return; // 20% 概率
      this._lastPartnerOfferAt = now;
      this.say(this._partnerLine(title));
    } catch (e) { /* ignore */ }
  },

  // 标题关键词 → 主动文案（通用兜底）
  _partnerLine(title) {
    const t = (title || '').toLowerCase();
    for (const group of this.PARTNER_LINES) {
      if (group.keywords.some((kw) => t.includes(kw.toLowerCase()))) return group.line;
    }
    return this.PARTNER_FALLBACK;
  },

  // 当前宠物模式：active | quiet | clingy(粘人)
  _activityMode() {
    return this.activityMode;
  },

  setActivity(mode) {
    const changed = mode !== this.activityMode;
    this.activityMode = mode;
    if (!changed) return; // 启动默认模式不变时不重排
    this._phaseBooted = true;
    // 粘人进入：先在 homeBase 睡一轮再开始阶段循环，避免瞬间跳位置
    this._firstSleep = (mode === 'clingy');
    this._beginPhase();
  },

  // ============ 位置-阶段模型（猫咪生活作息） ============
  // 主进程定义位置池与权重(quiet: homeBase 100% / clingy: homeBase 75%+workEdge 25% /
  // active: homeBase 55%+workEdge 15%+taskbar 15%+random 15%)，主进程负责瞬移(setPosition)；
  // 渲染进程负责阶段调度：每阶段停留 10-20 分钟随机，到点后按权重瞬移到下一个位置。
  // 位置类型→状态动作: homeBase→sleep/idle(睡觉发呆), workEdge→play/happy(趴窗玩耍),
  //   taskbar→play/idle(挖沙捣蛋), random→idle/play
  POSITION_STATES: {
    homeBase: ['sleep', 'idle'],
    workEdge: ['play', 'happy'],
    taskbar: ['play'],             // 搞怪（挖沙/捣蛋等，play 池内随机）
    random: ['idle', 'play'],
  },

  // 动作切换时长：位置阶段内每 30-90 秒随机换一个动作（与 10-20 分钟位置时长解耦）
  _actionDuration() {
    return 30000 + Math.random() * 60000;
  },

  // 武装动作计时器（位置阶段内按当前位置类型随机切动作）
  _armActionTimer() {
    if (this._actionTimer) { clearTimeout(this._actionTimer); this._actionTimer = null; }
    this._actionTimer = setTimeout(() => this._switchAction(), this._actionDuration());
  },

  // 按当前位置类型从对应动作池随机切换动作（与当前不同），并切换动作图
  // 心情影响动作池权重：happy/excited → 高兴动作占比提高；sad → 伤心动作占比提高
  _switchAction() {
    const pool = PetState.POSITION_STATES[this._currentPosType] || PetState.POSITION_STATES.homeBase;
    let next = pool[Math.floor(Math.random() * pool.length)];
    // 心情加权：30% 概率优先播与心情匹配的动作（happy/sad/excited→happy，sad→sad）
    const moodPrefer = { happy: 'happy', excited: 'happy', sad: 'sad' }[this._mood];
    if (moodPrefer && Math.random() < 0.3) {
      next = moodPrefer;
    } else if (pool.length > 1 && next === this.currentState) {
      // 与当前不同（单元素池保持原动作，让 play 池内的 GIF 随机）
      next = pool[(pool.indexOf(next) + 1) % pool.length];
    }
    this.enterState(next); // 素材主题播对应 GIF，内置主题切对应 SVG 动画
    this._armActionTimer();
  },

  // 每阶段停留时长：5-10 分钟随机
  _phaseDuration() {
    return 300000 + Math.random() * 300000;
  },

  // 进入新阶段：按模式权重瞬移到下一个位置，并按位置类型展示状态动作。
  // forcedType: 强制瞬移到指定位置类型（如点击唤醒后 'workEdge' 趴窗玩）；
  // _firstSleep 时强制 homeBase（粘人切模式先睡一轮再进入正常权重循环）。
  async _beginPhase(forcedType) {
    const gen = ++this._phaseGen;
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    if (this._actionTimer) { clearTimeout(this._actionTimer); this._actionTimer = null; }
    const mode = this._activityMode();
    const firstSleep = this._firstSleep;
    this._firstSleep = false;
    // 位置切换开关（原全屏漫游开关）：关闭时原地状态循环，不瞬移
    let roamOn = true;
    try {
      roamOn = !(SettingsManager.settings && SettingsManager.settings.petRoam === false);
    } catch (e) { /* ignore */ }
    let type = 'homeBase';
    if (roamOn) {
      try {
        const force = forcedType || (firstSleep ? 'homeBase' : null);
        const r = await window.wealthCalendar.phaseGo(mode, force);
        if (gen !== this._phaseGen) return; // 期间被唤醒/新阶段打断，放弃本次瞬移结果
        if (r && r.type) { type = r.type; this._currentPosType = r.type; }
      } catch (e) { /* 瞬移失败也照常展示状态 */ }
    }
    if (firstSleep) type = 'homeBase'; // 粘人首轮: 停 homeBase 睡觉
    this._setStateForPosition(type);
    // 阶段到点瞬移后：重置动作计时器，按新位置类型开始动作切换
    this._armActionTimer();
    const dur = firstSleep ? 60000 : this._phaseDuration();
    this._behaviorTimer = setTimeout(() => this._beginPhase(), dur);
  },

  // 瞬移到指定位置并强制展示玩耍状态（点击唤醒后趴窗玩/换新位置）。
  // forcedType 为 null 时按当前模式权重选位置。
  async _teleportAndPlay(forcedType) {
    const gen = ++this._phaseGen;
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    if (this._actionTimer) { clearTimeout(this._actionTimer); this._actionTimer = null; }
    let type = 'homeBase';
    try {
      const r = await window.wealthCalendar.phaseGo(this._activityMode(), forcedType || null);
      if (gen !== this._phaseGen) return; // 期间被再次打断，放弃
      if (r && r.type) type = r.type;
    } catch (e) { /* 瞬移失败也照常展示玩耍状态 */ }
    this._currentPosType = type;
    this.enterState('play'); // 醒着玩耍动作
    this._armActionTimer(); // 重置动作计时器
    this._behaviorTimer = setTimeout(() => this._beginPhase(), this._phaseDuration());
  },

  // 重新武装阶段计时器 + 动作计时器（拖动松手/面板关闭后从当前位置继续）
  _rearmPhase() {
    ++this._phaseGen; // 使在途 _beginPhase 的 await 结果失效
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    this._behaviorTimer = setTimeout(() => this._beginPhase(), this._phaseDuration());
    this._armActionTimer(); // 动作计时器同步重排
  },

  // 按位置类型展示状态动作（随机取该位置对应的动作池）
  _setStateForPosition(type) {
    const pool = PetState.POSITION_STATES[type] || PetState.POSITION_STATES.homeBase;
    this.enterState(pool[Math.floor(Math.random() * pool.length)]);
  },

  // 设置页切换位置切换开关：立即按新开关调度（开→瞬移循环，关→原地状态循环）
  onRoamSettingChange() {
    this._beginPhase();
  },

  // 粘人「跟鼠标」：鼠标在工作窗口内快速移动时, 概率性挪到鼠标上方约 100px 处互动。
  // 互动 8s 后恢复当前阶段位置的状态并重新武装阶段计时器。
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
    // 暂停阶段与动作计时器，挪到鼠标附近展示互动状态，短暂停留后恢复
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    if (this._actionTimer) { clearTimeout(this._actionTimer); this._actionTimer = null; }
    try { await window.wealthCalendar.petFollowMouse(evt.x, evt.y); } catch (e) { /* ignore */ }
    this.enterState(Math.random() < 0.5 ? 'play' : 'happy');
    setTimeout(() => {
      this._setStateForPosition(this._currentPosType || 'homeBase');
      this._rearmPhase();
    }, 8000);
  },

  // 拖动中暂停阶段调度与动作切换（不切阶段），松手后从当前位置继续
  onDragStart() {
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    if (this._actionTimer) { clearTimeout(this._actionTimer); this._actionTimer = null; }
  },
  onDragRelease() {
    this._rearmPhase(); // 拖动位置作为临时停靠，下个阶段按权重瞬移
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
    const theme = this._theme || 'cat1';
    const isMaterial = theme === 'cat1' || theme === 'cat2' || theme === 'caishen';
    const svgEl = document.getElementById('pet-svg');
    const cls = this._stateClass(state);
    // 素材主题：先备好内联 SVG 兜底内容（素材缺失/加载失败时显示对应 SVG），
    // 再加载当前状态的动图素材（SwiftShader 后本机软渲染也能绘制位图）
    if (isMaterial) {
      svgEl.innerHTML = this.svgPet(theme);
      this.petEl.classList.add(cls);
      this._loadActionImage(state);
      return;
    }
    // 内置 SVG 主题（cat/fortune/bagua/custom 兜底，素材主题失败时也复用）
    this._showPetElement(svgEl);
    svgEl.innerHTML = this.svgPet(theme);
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

  // ==================== 养成系统：亲密度/等级/金币/每日任务/心情 ====================
  // 称号：按等级映射（1学徒/3小管家/5招财猫/7财神童子/10财神爷）
  AFFINITY_TITLES: { 1: '学徒', 2: '学徒', 3: '小管家', 4: '小管家', 5: '招财猫', 6: '招财猫', 7: '财神童子', 8: '财神童子', 9: '财神童子', 10: '财神爷' },
  // 每日任务定义：key → {名称, 目标次数}
  DAILY_TASKS: {
    pet: { label: '摸摸', target: 3 },
    fortune: { label: '查看运势', target: 1 },
    stick: { label: '摇签', target: 1 },
    chat: { label: '聊天', target: 1 },
  },
  // 心情 emoji：happy/normal/sad/excited
  MOOD_EMOJI: { happy: '😊', normal: '😐', sad: '😢', excited: '🤩' },

  // 从 settings 加载养成状态并初始化（petAffinity/petCoins/petName/petDailyTask）
  async _loadPetGrowth() {
    try {
      const s = await window.wealthCalendar.loadSettings();
      this._petAffinity = Math.min(100, Math.max(0, Number(s.petAffinity) || 0));
      this._petCoins = Number(s.petCoins) || 0;
      this._petName = (s.petName && s.petName.trim()) || '小财';
      this._petDailyTask = this._normalizeDailyTask(s.petDailyTask);
      this._restoreInteractions(s.petInteractions); // 恢复互动时间戳（心情）
    } catch (e) {
      this._petDailyTask = this._normalizeDailyTask(null);
      this._recomputeMood();
    }
    this._updateHeart();
  },

  // 今日任务进度结构（按日期重置）: { date:'YYYY-MM-DD', pet, fortune, stick, chat }
  _normalizeDailyTask(raw) {
    const today = this._todayStr();
    if (raw && typeof raw === 'object' && raw.date === today) {
      return { date: today, pet: raw.pet || 0, fortune: raw.fortune || 0, stick: raw.stick || 0, chat: raw.chat || 0 };
    }
    return { date: today, pet: 0, fortune: 0, stick: 0, chat: 0 };
  },

  _todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 持久化养成字段到 settings（只写本模块字段，避免覆盖其它配置）
  async _savePetGrowth() {
    try {
      // 只保存 24h 窗口内的互动时间戳（心情来源，避免无限增长）
      const cutoff = Date.now() - 24 * 3600 * 1000;
      const recentLog = (this._interactionLog || []).filter((t) => t > cutoff);
      await window.wealthCalendar.saveSettings({
        petAffinity: this._petAffinity,
        petCoins: this._petCoins,
        petName: this._petName,
        petDailyTask: this._petDailyTask,
        petInteractions: recentLog,
      });
      // 同步 SettingsManager 内存副本，避免后续整份保存覆盖
      if (typeof SettingsManager !== 'undefined' && SettingsManager.settings) {
        SettingsManager.settings.petAffinity = this._petAffinity;
        SettingsManager.settings.petCoins = this._petCoins;
        SettingsManager.settings.petName = this._petName;
        SettingsManager.settings.petDailyTask = this._petDailyTask;
        SettingsManager.settings.petInteractions = recentLog;
      }
    } catch (e) { /* ignore */ }
  },

  // ---- 亲密度 ----
  _affinityLevel(affinity) {
    // 每 10 分一级：0→Lv1, 10→Lv2, ..., 90→Lv10；上限 100
    return Math.min(10, Math.floor((affinity || 0) / 10) + 1);
  },
  _affinityTitle(level) {
    return this.AFFINITY_TITLES[level] || '学徒';
  },
  affinityText() {
    const lv = this._affinityLevel(this._petAffinity);
    return `亲密度: ${this._petAffinity}/100 (Lv.${lv} ${this._affinityTitle(lv)})`;
  },
  // 右键菜单顶部刷新亲密度显示；同步设置面板「财宠名字」板块的亲密度/心情展示
  refreshAffinityMenu() {
    try {
      const el = document.getElementById('context-menu-affinity');
      if (el) el.textContent = `💗 ${this.affinityText()}`;
    } catch (e) { /* ignore */ }
    try {
      const d = document.getElementById('affinity-display');
      if (d) {
        const lv = this._affinityLevel(this._petAffinity);
        const title = this._affinityTitle(lv);
        const moodText = { happy: '开心', normal: '平静', sad: '低落', excited: '兴奋' }[this._mood] || '平静';
        d.textContent = `💗 亲密度：${this._petAffinity}/100（Lv.${lv} ${title}）｜心情：${this.MOOD_EMOJI[this._mood] || '😐'} ${moodText}`;
      }
    } catch (e) { /* ignore */ }
  },

  // 增加亲密度（0-100 封顶），升级时气泡庆祝
  async addAffinity(points) {
    const before = this._petAffinity;
    const beforeLv = this._affinityLevel(before);
    this._petAffinity = Math.min(100, before + (points || 0));
    const afterLv = this._affinityLevel(this._petAffinity);
    await this._savePetGrowth();
    this._updateHeart();
    if (afterLv > beforeLv) {
      this.say(`🎉 ${this._petName}升级啦! Lv.${afterLv} ${this._affinityTitle(afterLv)}！`);
    }
  },

  // ---- 心情：由 24h 内互动次数计算 ----
  _recomputeMood() {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    this._interactionLog = (this._interactionLog || []).filter((t) => t > cutoff);
    const n = this._interactionLog.length;
    this._mood = n >= 8 ? 'excited' : (n >= 4 ? 'happy' : (n >= 1 ? 'normal' : 'sad'));
    return this._mood;
  },
  // 左上角粉色爱心：显示亲密度数值（如 ♥42），并同步刷新亲密度/心情展示
  _updateHeart() {
    try {
      const el = document.getElementById('pet-heart');
      if (el) el.textContent = `♥${this._petAffinity}`;
    } catch (e) { /* ignore */ }
    this.refreshAffinityMenu();
  },
  // 记录一次互动（时间戳）并刷新心情
  _recordInteraction() {
    this._interactionLog.push(Date.now());
    this._recomputeMood();
  },

  // ---- 每日任务：登记一次任务进度，达标时 +10 金币 +10 亲密度并气泡提示 ----
  async _bumpTask(key) {
    const def = this.DAILY_TASKS[key];
    if (!def) return;
    if (!this._petDailyTask || this._petDailyTask.date !== this._todayStr()) {
      this._petDailyTask = this._normalizeDailyTask(this._petDailyTask);
    }
    const t = this._petDailyTask;
    const before = t[key] || 0;
    t[key] = before + 1;
    const justDone = before < def.target && t[key] >= def.target;
    if (justDone) {
      // 任务完成：+10 金币 +10 亲密度
      this._petCoins = Number(this._petCoins) || 0;
      this._petCoins += 10;
      await this.addAffinity(10);
      await this._savePetGrowth();
      this.say(`✅ 今日任务「${def.label}」完成! +10金币 +10亲密度`);
    } else {
      await this._savePetGrowth();
    }
  },

  // ---- 今日任务状态气泡（右键菜单“今日任务”触发） ----
  showDailyTasks() {
    if (!this._petDailyTask || this._petDailyTask.date !== this._todayStr()) {
      this._petDailyTask = this._normalizeDailyTask(this._petDailyTask);
    }
    const t = this._petDailyTask;
    const lines = Object.entries(this.DAILY_TASKS).map(([k, def]) => {
      const done = (t[k] || 0) >= def.target;
      return `${done ? '✅' : '⬜'} ${def.label} ${Math.min(t[k] || 0, def.target)}/${def.target}`;
    });
    this.say(`📋 今日任务\n${lines.join('\n')}`);
  },

  // ---- 深夜安慰：22:00-05:00 首次互动 50% 触发 ----
  _maybeLateNightComfort() {
    try {
      const h = new Date().getHours();
      if (h >= 22 || h < 5) {
        const key = `wc-late-${this._todayStr()}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1'); // 每天只触发一次
          if (Math.random() < 0.5) {
            this.say(`这么晚还在忙, ${this._petName}心疼你, 早点休息呀 🥺`);
          }
        }
      }
    } catch (e) { /* ignore */ }
  },

  // ---- 节日彩蛋：元旦/春节/中秋/用户生日，当日首次互动触发 ----
  async _maybeFestival() {
    try {
      const key = `wc-festival-${this._todayStr()}`;
      if (localStorage.getItem(key)) return;
      // 检测节日类型（农历需要走 IPC 黄历）
      let festival = '';
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      // 用户生日（设置里的出生月日）
      try {
        const s = await window.wealthCalendar.loadSettings();
        const birth = (s.userInfo && s.userInfo.birth) || '';
        const b = birth.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (b && b[2] === mm && b[3] === dd) festival = 'birthday';
      } catch (e) { /* ignore */ }
      if (mm === '01' && dd === '01') festival = 'newyear';
      if (!festival) {
        try {
          const lunar = await window.wealthCalendar.getDateLunarData(this._todayStr());
          // 春节：农历正月初一；中秋：农历八月十五
          const isSpring = lunar && lunar.lunarMonth === 1 && lunar.lunarDay === '初一';
          const isMidAutumn = lunar && lunar.lunarMonth === 8 && lunar.lunarDay === '十五';
          if (isSpring) festival = 'spring';
          else if (isMidAutumn) festival = 'midautumn';
        } catch (e) { /* ignore */ }
      }
      if (!festival) return;
      localStorage.setItem(key, '1');
      const msg = {
        newyear: `🎉 元旦快乐! ${this._petName}祝主人新的一年财源滚滚~`,
        spring: `🎉 春节快乐! ${this._petName}给主人拜年啦，恭喜发财~`,
        midautumn: `🎉 中秋快乐! ${this._petName}祝主人月圆人团圆，好运连连~`,
        birthday: `🎉 生日快乐! ${this._petName}祝主人愿望成真，财运亨通~`,
      }[festival];
      if (msg) this.say(msg);
    } catch (e) { /* ignore */ }
  },

  // ---- 统一互动入口：单击/双击/聊天/运势/摇签 加分 + 每日任务 + 深夜安慰 + 节日彩蛋 ----
  async onInteract(type, affinityPoints) {
    this._recordInteraction();          // 心情
    this._maybeLateNightComfort();      // 深夜安慰（仅深夜+概率）
    if (this.DAILY_TASKS[type]) await this._bumpTask(type); // 每日任务进度
    if (affinityPoints) await this.addAffinity(affinityPoints); // 亲密度
    await this._maybeFestival();        // 节日彩蛋（每日首次互动）
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

    // 双击：保留原有说话（取消待触发的单击反应），亲密度 +2
    this.petEl.addEventListener('dblclick', () => {
      if (this._clickTimer) { clearTimeout(this._clickTimer); this._clickTimer = null; }
      const line = lines[Math.floor(Math.random() * lines.length)];
      this.say(line);
      this._resumeIfIdle();
      this.onInteract('pet', 2);
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
    // 单击：亲密度 +1（点按互动）
    this.onInteract('pet', 1);
    // 睡梦中被戳醒：唤醒 + 模式位置联动
    if (this.currentState === 'sleep') {
      this._wakeUp();
      return;
    }
    // 非 sleep：立即随机切换到另一个动作（play/happy/idle，与当前不同），素材图随之切换
    const candidates = ['play', 'happy', 'idle'].filter((s) => s !== this.currentState);
    this.enterState(candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : 'idle');
    // 保留现有随机小反应（台词+表情）
    const r = this.clickReactions[Math.floor(Math.random() * this.clickReactions.length)];
    this.say(`${r.emoji} ${r.line}`);
    // 重置动作计时器（点击立即切动作后重新计时）
    this._armActionTimer();
    this._resumeIfIdle();
  },

  // 点击唤醒睡梦中的宠物：切清醒/玩耍动作 + 互动气泡 + 重置阶段计时器 + 模式位置联动
  _wakeUp() {
    ++this._phaseGen; // 使在途 _beginPhase 的 await 结果失效，避免其覆盖唤醒状态
    this.enterState(Math.random() < 0.5 ? 'play' : 'idle'); // 切换动作图（素材主题播玩耍/清醒动作，内置主题切对应SVG动画）
    const lines = ['喵?主人叫我~', '睡醒啦!', '唔...刚梦到主人给小鱼干~'];
    this.say(lines[Math.floor(Math.random() * lines.length)]);
    this._idleBucket = 'active';
    // e) 重置阶段计时器（刚醒重新计时 10-20 分钟，避免立刻又瞬移）+ 重置动作计时器
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    this._behaviorTimer = setTimeout(() => this._beginPhase(), this._phaseDuration());
    this._armActionTimer();
    // b) 唤醒后按当前模式触发位置联动（1-2s 后；若期间模式已切换则放弃联动）
    const mode = this._activityMode();
    if (mode === 'clingy') {
      setTimeout(() => {
        if (this._activityMode() !== mode) return;
        this._teleportAndPlay('workEdge'); // 瞬移到工作窗口上沿趴着玩
      }, 1200 + Math.random() * 800);
    } else if (mode === 'active') {
      setTimeout(() => {
        if (this._activityMode() !== mode) return;
        this._teleportAndPlay(); // 按权重瞬移新位置
      }, 1200 + Math.random() * 800);
    }
    // quiet：原地不动，状态已切 idle/play 玩耍动作
  },

  // ---- Bubble ----
  say(text) {
    const bubble = document.getElementById('reminder-bubble');
    const el = document.getElementById('reminder-bubble-text');
    // 宠物命名：气泡台词中的“小财”替换为用户设置的名字（默认小财）
    let finalText = text;
    try {
      if (this._petName && this._petName !== '小财') {
        finalText = String(text || '').split('小财').join(this._petName);
      }
    } catch (e) { /* ignore */ }
    el.textContent = `💬 ${finalText}`;
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

  // 暂停阶段调度与动作切换（空闲睡觉时保持 sleep：停止位置瞬移与动作切换）
  _pauseStateMachine() {
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    if (this._actionTimer) { clearTimeout(this._actionTimer); this._actionTimer = null; }
  },

  // 恢复阶段调度（重新武装阶段计时器，从当前位置继续，下个阶段再瞬移）
  _resumeStateMachine() {
    this._rearmPhase();
  },

  // 用户主动互动时（单击/双击/摇签），若宠物正因空闲睡着则立即恢复活力
  _resumeIfIdle() {
    if (this._idleBucket === 'sleep' || this._idleBucket === 'rest') {
      this._idleBucket = 'active';
      this._resumeStateMachine(); // 恢复阶段调度，从当前位置继续
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
    this.onInteract('stick', 2); // 摇签：亲密度 +2
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
      const result = await window.wealthCalendar.getDailyFortune();
      if (!result || !result.data) return;
      const fortune = result.data;
      const dir = (fortune.directions && fortune.directions.wealth) || '';
      // 主求方向提示（从设置读取）
      let wishHint = '';
      try {
        const wish = SettingsManager.settings && SettingsManager.settings.mainWish;
        const wishMap = { wealth: '求财', love: '求姻缘', career: '求事业', health: '求健康', study: '求学业', peace: '求平安' };
        wishHint = wishMap[wish] ? `，今天重点：${wishMap[wish]}` : '';
      } catch (e) { /* ignore */ }
      let line = `📅 今日运势 ${fortune.overall} 分`;
      if (dir) line += `，财神方位${dir}`;
      // 意外财运 / 幸运数字 / 彩票建议元素
      if (fortune.luckyNumber && fortune.luckyNumber.length) line += `，幸运数字 ${fortune.luckyNumber.join(' ')}`;
      if (fortune.lotteryTip) line += `。${fortune.lotteryTip}`;
      line += wishHint;
      if (fortune.reminderLines && fortune.reminderLines[0]) {
        line += `。${fortune.reminderLines[0]}`;
      }
      // 运势类播报：先"叮~"提示音再语音播报
      this._broadcast(line, { speech: true });
    } catch (e) { /* ignore */ }
  },

  // ---- 每日运势分段播报（上午/中午/下午/晚上 四时段, 每时段 4-6 条, 每天 16-24 条）----
  // 时段内均匀铺开(间隔 23-35 分钟), 每条同时发到聊天框(只追加不打断);
  // 内容池: 主求方向约一半, 另一半轮换 幸运数字/彩票建议/最强维度/吉时。
  startFortuneSlots() {
    this._scheduleNextFortuneBroadcast();
  },

  _scheduleNextFortuneBroadcast() {
    if (this._fortuneSlotTimer) { clearTimeout(this._fortuneSlotTimer); this._fortuneSlotTimer = null; }
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    // 四时段: 上午 9:00-11:30 / 中午 12:00-14:30 / 下午 15:00-17:30 / 晚上 19:00-21:30
    const slots = [
      { start: 9 * 60, end: 11 * 60 + 30 },
      { start: 12 * 60, end: 14 * 60 + 30 },
      { start: 15 * 60, end: 17 * 60 + 30 },
      { start: 19 * 60, end: 21 * 60 + 30 },
    ];
    // 每时段 4-6 条（按日期做轻微变化）, 均匀铺在时段前 140 分钟内（间隔约 23-35 分钟）
    const daySeed = now.getDate();
    const times = [];
    for (const s of slots) {
      const n = 4 + ((daySeed * 7 + s.start) % 3);
      for (let i = 0; i < n; i++) {
        times.push(s.start + 8 + i * Math.floor(140 / n));
      }
    }
    const future = times.filter((t) => t > nowMin);
    if (!future.length) {
      // 今天播完，明天凌晨再排
      this._fortuneSlotTimer = setTimeout(() => this.startFortuneSlots(), 6 * 3600 * 1000);
      return;
    }
    const wait = (future[0] - nowMin) * 60000;
    this._fortuneSlotTimer = setTimeout(() => {
      this._doFortuneBroadcast();
      this._scheduleNextFortuneBroadcast();
    }, wait);
  },

  async _doFortuneBroadcast() {
    try {
      const result = await window.wealthCalendar.getDailyFortune();
      if (!result || !result.data) return;
      const line = this._buildFortuneLine(result.data);
      // 运势类播报：先"叮~"提示音再语音播报
      if (line) this._broadcast(line, { speech: true });
    } catch (e) { /* ignore */ }
  },

  // 播报：宠物气泡说话 + 同步追加到聊天对话框（只追加，不打断用户对话）
  // opts.speech=true 时额外语音播报（运势类：先"叮~"提示音再播报）；普通交互台词不播报
  _broadcast(line, opts) {
    this.say(line);
    if (opts && opts.speech) this.speakFortune(line);
    try {
      if (typeof ChatPanel !== 'undefined' && ChatPanel && ChatPanel.addMessage) {
        ChatPanel.addMessage('assistant', line);
      }
    } catch (e) { /* ignore */ }
  },

  // ---- 运势类语音播报：先"叮~"提示音再"小财帮你瞄了一眼：..."语音 ----
  // 提示音与 TTS 均走现有 sidecar /tts/synthesize；交互类台词不播报
  async speakFortune(line) {
    try {
      const s = await window.wealthCalendar.loadSettings();
      if (s.ttsEnabled === false) return;
      const chime = await window.wealthCalendar.ttsSynthesize('叮～');
      if (chime && chime.audioBase64) await this._playAudio(chime.audioBase64);
      const full = `小财帮你瞄了一眼：${String(line || '')}`;
      const r = await window.wealthCalendar.ttsSynthesize(full);
      if (r && r.audioBase64) await this._playAudio(r.audioBase64);
    } catch (e) { console.warn('[tts] speakFortune:', e.message); }
  },
  // 播放 base64 音频，等待播完或超时（15s 兜底，避免阻塞后续播报）
  _playAudio(base64) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
        setTimeout(resolve, 15000);
      } catch (e) { resolve(); }
    });
  },

  _buildFortuneLine(fortune) {
    // 内容池轮换：推荐动态播报 / 主求方向 / 幸运数字+彩票 / 最强维度 / 吉时，约占一半的多样性
    const roll = Math.random();
    const dimLabels = { wealth: '财运', career: '事业', love: '桃花', health: '健康', study: '学业', travel: '出行', signing: '签约' };
    const dims = fortune.dimensions || {};
    const dir = (fortune.directions && fortune.directions.wealth) || '';
    let wish = '';
    try { wish = (SettingsManager.settings && SettingsManager.settings.mainWish) || ''; } catch (e) { /* ignore */ }

    // 0) ✨推荐模式（未设主求=推荐，默认）：按当天运势动态播报，
    //    财运/桃花/事业哪个旺(≥75分)就都播，提醒更详细含注意事项避忌
    if (!wish) {
      const recLabels = { wealth: '财运', love: '桃花', career: '事业' };
      const hot = Object.keys(recLabels).filter((k) => (dims[k] && dims[k].score) >= 75);
      if (hot.length) {
        let s = `✨ 今日推荐：${hot.map((k) => `${recLabels[k]}${dims[k].score}分`).join('、')}${hot.length === 3 ? '，三路全旺' : ''}，都可以好好把握~`;
        if (fortune.reminderLines && fortune.reminderLines[0]) s += ` 小财提醒：${fortune.reminderLines[0]}`;
        return s;
      }
    }

    // 1) 幸运数字 + 彩票建议（新元素）
    if (fortune.luckyNumber && fortune.luckyNumber.length && roll < 0.3) {
      let s = `🍀 今日幸运数字 ${fortune.luckyNumber.join(' ')}，多留意带这些数字的事物~`;
      if (fortune.lotteryTip) s += `。${fortune.lotteryTip}`;
      if (dir) s += `，财神在${dir}方位~`;
      return s;
    }
    // 2) 主求方向（约占 1/3）
    if (roll < 0.63) {
      const wishMap = { wealth: '求财', love: '求姻缘', career: '求事业', health: '求健康', study: '求学业', peace: '求平安' };
      if (wish && wishMap[wish] && this._wishTips[wish]) {
        const tips = this._wishTips[wish];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        return `🎯 主求${wishMap[wish]}：${tip}` + (dir ? `，财神方位${dir}` : '');
      }
    }
    // 3) 吉时播报
    if (fortune.luckyTime && fortune.luckyTime.length && roll < 0.8) {
      return `⏰ 今日吉时 ${fortune.luckyTime.join('、')}，重要的事安排在这个时间段更顺~`;
    }
    // 4) 当天最强两维度
    const scored = Object.keys(dimLabels)
      .map((k) => ({ label: dimLabels[k], score: (dims[k] && dims[k].score) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    if (scored.length && scored[0].score > 0) {
      return `✨ 今日最旺：${scored.map((d) => `${d.label}${d.score}分`).join('、')}，把握住好运气~`;
    }
    // 兜底
    return `📅 今日运势 ${fortune.overall} 分` + (dir ? `，财神方位${dir}` : '');
  },

  // 主求方向播报文案池
  _wishTips: {
    wealth: ['求财宜进不宜守，大胆开口机会多~', '正财稳偏财旺，今天适合谈钱~', '钱包鼓鼓的一天，理性消费更旺财~'],
    love: ['主动联系一下喜欢的人吧，桃花正旺~', '今天适合赴约，魅力值拉满~', '真诚最动人，姻缘自会来~'],
    career: ['事业小高峰，重要任务今天处理~', '职场贵人运不错，多请教多协作~', '稳扎稳打，升职加薪在路上~'],
    health: ['早睡早起身体好，今天宜养生~', '起来动一动，活力满满一整天~', '按时吃饭别熬夜，健康是本钱~'],
    study: ['学习黄金期，抓住专注力~', '温故知新效率高，今天宜刷题~', '新知识吸收快，适合学点新技能~'],
    peace: ['平安是福，出行慢一点稳一点~', '遇事放宽心，好运自然来~', '今日宜静心，诸事皆顺~'],
  },

  checkGoodHour() {
    try {
      window.wealthCalendar.getDailyFortune().then((result) => {
        const fortune = result && result.data;
        if (!fortune || !fortune.luckyTime || !fortune.luckyTime.length) return;
        const now = new Date();
        const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        // luckyTime 格式 "HH:mm-HH:mm"
        const inGood = fortune.luckyTime.some((g) => {
          if (typeof g === 'string' && g.includes('-')) {
            const [s, e] = g.split('-');
            return hm >= s && hm <= e;
          }
          return hm >= g.start && hm <= g.end;
        });
        if (inGood) {
          // 吉时属运势类播报：先"叮~"提示音再语音播报
          this._broadcast(`⏰ 现在正是今日吉时（${hm}），适合做重要决定！`, { speech: true });
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
    // 内置主题 → 对应 SVG；素材主题失败兜底时也按主题匹配（caishen→财神，cat1/cat2→萌猫）；
    // custom 在软渲染 Linux 下兜底为萌猫
    if (theme === 'fortune' || theme === 'caishen') return this.svgFortune();
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
    // 素材主题 cat1/cat2/caishen（设置面板可选）；内置 cat/fortune/bagua 保留渲染
    // 逻辑仅作素材主题加载失败时的 SVG 兜底；custom 走自定义图/AI 视频
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
