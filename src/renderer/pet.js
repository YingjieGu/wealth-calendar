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
      const bubble = document.getElementById('reminder-bubble');
      const text = document.getElementById('reminder-bubble-text');
      text.textContent = `💬 ${line}`;
      bubble.classList.remove('hidden');
      clearTimeout(this._bubbleTimer);
      this._bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), 3500);
    });
  },

  setTheme(theme) {
    // 'cat' | 'fortune' | 'bagua' | 'custom'
    const emojiMap = { cat: '🐱', fortune: '🧧', bagua: '☯️' };
    const appEl = document.getElementById('app');
    appEl.classList.remove('theme-cat', 'theme-fortune', 'theme-bagua');

    const img = document.getElementById('pet-img');
    const emojiSpan = document.getElementById('pet-emoji');
    const video = document.getElementById('pet-video');

    if (theme === 'custom') {
      // 优先 AI 生成的动画视频，其次上传图片，兜底 emoji
      this.tryVideoPet().then((usedVideo) => {
        if (usedVideo) return;
        img.style.display = 'block';
        emojiSpan.style.display = 'none';
        video.style.display = 'none';
        if (!img.src || img.dataset.customLoaded !== '1') {
          window.wealthCalendar.loadCustomPetImage().then((dataUrl) => {
            if (dataUrl) {
              img.src = dataUrl;
              img.dataset.customLoaded = '1';
            } else {
              img.style.display = 'none';
              emojiSpan.style.display = 'block';
              emojiSpan.textContent = '🐱';
            }
          });
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
