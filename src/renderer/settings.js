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
    this.applyUserInfo();
  },

  applyUserInfo() {
    const ui = this.settings.userInfo || {};
    const birthInput = document.getElementById('user-birth');
    if (birthInput) {
      if (ui.birth) {
        // "YYYY-MM-DD HH:mm" -> datetime-local "YYYY-MM-DDTHH:mm"
        birthInput.value = ui.birth.replace(' ', 'T');
      } else {
        birthInput.value = '';
      }
      // gender buttons
      document.getElementById('gender-male').classList.toggle('active', ui.gender === 'male');
      document.getElementById('gender-female').classList.toggle('active', ui.gender === 'female');
      this.updateZodiac(ui.birth);
    }
  },

  updateZodiac(birth) {
    const el = document.getElementById('user-zodiac');
    if (!el) return;
    const z = this.getZodiac(birth);
    el.textContent = z ? `星座：${z}` : '星座：—';
  },

  getZodiac(birth) {
    if (!birth) return null;
    const m = birth.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const signs = [
      ['摩羯', 19], ['水瓶', 18], ['双鱼', 20], ['白羊', 20], ['金牛', 20],
      ['双子', 21], ['巨蟹', 22], ['狮子', 22], ['处女', 22], ['天秤', 23],
      ['天蝎', 23], ['射手', 21], ['摩羯', 22],
    ];
    const idx = month - 1;
    const sign = day <= signs[idx][1] ? signs[idx][0] : signs[idx + 1][0];
    return sign + '座';
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

    // User info: birth datetime change -> update zodiac preview
    document.getElementById('user-birth').addEventListener('change', (e) => {
      this.updateZodiac(e.target.value ? e.target.value.replace('T', ' ') : null);
    });

    // Gender selection
    document.getElementById('gender-male').addEventListener('click', () => {
      this.settings.userInfo = { ...(this.settings.userInfo || {}), gender: 'male' };
      document.getElementById('gender-male').classList.add('active');
      document.getElementById('gender-female').classList.remove('active');
    });
    document.getElementById('gender-female').addEventListener('click', () => {
      this.settings.userInfo = { ...(this.settings.userInfo || {}), gender: 'female' };
      document.getElementById('gender-female').classList.add('active');
      document.getElementById('gender-male').classList.remove('active');
    });

    // Save user info
    document.getElementById('btn-save-userinfo').addEventListener('click', async () => {
      const raw = document.getElementById('user-birth').value;
      const birth = raw ? raw.replace('T', ' ') : null; // datetime-local -> "YYYY-MM-DD HH:mm"
      this.settings.userInfo = { ...(this.settings.userInfo || {}), birth };
      await this.save();
      this.updateZodiac(birth);
      showToast(birth ? '✅ 用户信息已保存' : '⚠️ 未填写出生时间');
    });

    // Model config
    this.applyModelConfig();
    document.getElementById('btn-save-modelconfig').addEventListener('click', async () => {
      const key = document.getElementById('llm-api-key').value.trim();
      this.settings.modelConfig = {
        llmApiKey: key || '',
        llmBaseUrl: document.getElementById('llm-base-url').value.trim() || 'https://api.deepseek.com/v1',
        llmModel: document.getElementById('llm-model').value.trim() || 'deepseek-chat',
      };
      this.settings.fortuneReminderEnabled = document.getElementById('fortune-reminder-enabled').checked;
      await this.save();
      showToast(key ? '✅ 模型配置已保存（AI 命理已启用）' : '✅ 已保存（未填 Key，使用本地模板推算）');
    });
  },

  applyModelConfig() {
    const mc = this.settings.modelConfig || {};
    document.getElementById('llm-api-key').value = mc.llmApiKey || '';
    document.getElementById('llm-base-url').value = mc.llmBaseUrl || 'https://api.deepseek.com/v1';
    document.getElementById('llm-model').value = mc.llmModel || 'deepseek-chat';
    document.getElementById('fortune-reminder-enabled').checked = this.settings.fortuneReminderEnabled !== false;
  },

  async save() {
    await window.wealthCalendar.saveSettings(this.settings);
  },
};
