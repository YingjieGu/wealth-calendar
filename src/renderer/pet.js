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
    // Remove CSS transition during walk for smooth movement
    if (this.currentState === 'walk') {
      this.petEl.style.transition = 'none';
    } else {
      this.petEl.style.transition = 'left 0.8s ease-in-out, top 0.3s ease';
    }
    this.petEl.style.left = `calc(50% + ${this.petX}px)`;
    this.petEl.style.top = `calc(50% + ${this.petY}px)`;
  },

  setTheme(theme) {
    // 'cat' or 'fortune'
    if (theme === 'fortune') {
      this.petEl.textContent = '🧧';
      document.getElementById('app').classList.remove('theme-cat');
      document.getElementById('app').classList.add('theme-fortune');
    } else {
      this.petEl.textContent = '🐱';
      document.getElementById('app').classList.add('theme-cat');
      document.getElementById('app').classList.remove('theme-fortune');
    }
  },
};
