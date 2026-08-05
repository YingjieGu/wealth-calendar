// Pet state machine: idle, walk, sleep
// Uses DOM + CSS animation for the pet emoji

const PetState = {
  init() {
    this.petEl = document.getElementById('pet');
    this.zzzEl = document.getElementById('pet-zzz');
    this.stageEl = document.getElementById('pet-stage');
    this.currentState = 'idle';
    this.activityMode = 'active'; // 'active' or 'quiet'
    this.walkTimer = null;
    this.stateTimer = null;
    this.walkDir = 1; // 1 = right, -1 = left
    this.walkSpeed = 0.5; // px per frame
    this.petX = 0; // current logical x relative to center
    this.petY = 0;
    this.rafId = null;
    this._walking = false;
  },

  start() {
    this.init();
    this.enterState(this.currentState);
    this.walkLoop();
    this.scheduleStateChange();
    this.setupInteraction();
    this.startProactive();
  },

  setActivity(mode) {
    this.activityMode = mode;
    // If switching to quiet, transition to idle
    if (mode === 'quiet' && this.currentState === 'walk') {
      this.enterState('idle');
    }
  },

  scheduleStateChange() {
    if (this.stateTimer) clearTimeout(this.stateTimer);
    // Active: switch every 3-7s; Quiet: switch every 10-20s
    const min = this.activityMode === 'active' ? 3000 : 10000;
    const max = this.activityMode === 'active' ? 7000 : 20000;
    const delay = min + Math.random() * (max - min);
    this.stateTimer = setTimeout(() => {
      this.pickNextState();
      this.scheduleStateChange();
    }, delay);
  },

  pickNextState() {
    if (this.activityMode === 'quiet') {
      // In quiet mode, only idle or sleep
      this.enterState(Math.random() < 0.3 ? 'sleep' : 'idle');
    } else {
      const roll = Math.random();
      if (roll < 0.35) this.enterState('idle');
      else if (roll < 0.75) this.enterState('walk');
      else this.enterState('sleep');
    }
  },

  enterState(state) {
    this.currentState = state;
    this.petEl.className = ''; // clear all state classes
    this.zzzEl.classList.remove('show');

    switch (state) {
      case 'idle':
        this.petEl.classList.add('idle');
        // Center the pet
        this.petX = 0;
        this.petY = 0;
        this.updatePetPosition();
        break;
      case 'walk':
        // Start walking from current position
        this.petEl.classList.add('walking');
        break;
      case 'sleep':
        // Sleep: still position, show Zzz
        this.petEl.classList.add('idle');
        this.zzzEl.classList.add('show');
        this.petX = 0;
        this.petY = 0;
        this.updatePetPosition();
        break;
    }
  },

  walkLoop() {
    const loop = () => {
      if (this.currentState === 'walk') {
        this.doWalkStep();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  },

  doWalkStep() {
    const stageW = this.stageEl.clientWidth;
    const petW = 64;
    const maxX = (stageW - petW) / 2;
    const speed = 0.6;

    this.petX += speed * this.walkDir;

    // Bounce at edges
    if (this.petX >= maxX) {
      this.petX = maxX;
      this.walkDir = -1;
    } else if (this.petX <= -maxX) {
      this.petX = -maxX;
      this.walkDir = 1;
    }

    // Add slight vertical bob
    this.petY = Math.sin(Date.now() / 300) * 4;

    this.updatePetPosition();
  },

  updatePetPosition() {
    if (!this.petEl) return;
    // Walk: smooth follow + face the direction of travel; else gentle transition
    if (this.currentState === 'walk') {
      this.petEl.style.transition = 'left 0.06s linear, top 0.2s ease';
      this.petEl.style.transform = `translate(-50%, -50%) rotateY(${this.walkDir < 0 ? 180 : 0}deg)`;
    } else {
      this.petEl.style.transition = 'left 0.8s ease-in-out, top 0.3s ease';
      this.petEl.style.transform = 'translate(-50%, -50%)';
    }
    this.petEl.style.left = `calc(50% + ${this.petX}px)`;
    this.petEl.style.top = `calc(50% + ${this.petY}px)`;
  },

  // ---- Double-click interaction ----
  setupInteraction() {
    const lines = [
      '喵～找小财有什么事呀？',
      '今天也要加油哦！💰',
      '右键小财可以看今日运势哦～',
      '想聊天就点 💬，小财随时在！',
      '偷偷告诉你，今天财神方位在正东～',
      '小财会一直陪着你的！',
    ];
    this.petEl.addEventListener('dblclick', () => {
      const line = lines[Math.floor(Math.random() * lines.length)];
      this.say(line);
    });
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

  setTheme(theme, customEmoji) {
    // 'cat' | 'fortune' | 'bagua' | 'custom'
    const emojiMap = { cat: '🐱', fortune: '🧧', bagua: '☯️' };
    const appEl = document.getElementById('app');
    appEl.classList.remove('theme-cat', 'theme-fortune', 'theme-bagua');

    const img = document.getElementById('pet-img');
    const emojiSpan = document.getElementById('pet-emoji');
    const video = document.getElementById('pet-video');

    if (theme === 'custom') {
      // 本机 Linux 软渲染无法绘制任何位图（实测 img/canvas/background-image 全灭）→ emoji 兜底
      if (window.wealthCalendar.platform === 'linux') {
        emojiSpan.textContent = customEmoji || '🐱';
        emojiSpan.style.display = 'block';
        img.style.display = 'none';
        video.style.display = 'none';
        document.getElementById('pet-canvas').style.display = 'none';
        document.getElementById('pet-bg').style.display = 'none';
        return;
      }
      // 优先 AI 生成的动画视频，其次 canvas 绘制的图片，兜底 emoji
      this.tryVideoPet().then(async (usedVideo) => {
        if (usedVideo) return;
        const canvas = document.getElementById('pet-canvas');
        const img = document.getElementById('pet-img');
        const emojiSpan = document.getElementById('pet-emoji');
        const video = document.getElementById('pet-video');
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
          // 如果 background-image 也不渲染（软渲染限制），回退 emoji
          setTimeout(() => {
            if (bg.dataset.customLoaded === '1' && !bg.dataset.checked) {
              bg.dataset.checked = '1';
            }
          }, 0);
        }
      });
      appEl.classList.add('theme-cat');
    } else {
      video.style.display = 'none';
      video.pause();
      img.style.display = 'none';
      emojiSpan.style.display = 'block';
      emojiSpan.textContent = emojiMap[theme] || '🐱';
      appEl.classList.add(theme === 'fortune' ? 'theme-fortune' : theme === 'bagua' ? 'theme-bagua' : 'theme-cat');
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
