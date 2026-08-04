// Settings management for the renderer process

const SettingsManager = {
  async init() {
    this.settings = await window.wealthCalendar.loadSettings();
    this.applyAll();
    this.bindUI();
  },

  applyAll() {
    // Theme
    const theme = this.settings.theme || 'cat';
    PetState.setTheme(theme);

    // Activity
    const activity = this.settings.activity || 'active';
    PetState.setActivity(activity);

    // Update UI buttons
    this.updateThemeUI(theme);
    this.updateActivityUI(activity);
  },

  updateThemeUI(theme) {
    document.querySelectorAll('.theme-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  },

  updateActivityUI(activity) {
    document.querySelectorAll('.activity-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.activity === activity);
    });
  },

  bindUI() {
    // Theme selection
    document.getElementById('theme-options').addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-option');
      if (!btn) return;
      const theme = btn.dataset.theme;
      this.settings.theme = theme;
      this.updateThemeUI(theme);
      PetState.setTheme(theme);
      this.save();
    });

    // Activity selection
    document.getElementById('activity-options').addEventListener('click', (e) => {
      const btn = e.target.closest('.activity-option');
      if (!btn) return;
      const activity = btn.dataset.activity;
      this.settings.activity = activity;
      this.updateActivityUI(activity);
      PetState.setActivity(activity);
      this.save();
    });

    // Restore default position
    document.getElementById('btn-restore-position').addEventListener('click', async () => {
      await window.wealthCalendar.restoreDefaultPosition();
      showToast('已恢复默认位置');
    });
  },

  async save() {
    await window.wealthCalendar.saveSettings(this.settings);
  },
};
