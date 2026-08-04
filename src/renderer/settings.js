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

    // Custom pet image upload
    document.getElementById('btn-upload-pet').addEventListener('click', () => {
      document.getElementById('pet-upload').click();
    });
    document.getElementById('pet-upload').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        // webp/jpeg -> png before saving (webp <img> fails on software-rendered Linux)
        const pngDataUrl = await convertToPng(dataUrl);
        const r = await window.wealthCalendar.saveCustomPetImage(pngDataUrl);
        if (r && r.ok) {
          this.settings.theme = 'custom';
          this.updateThemeUI('custom');
          PetState.setTheme('custom');
          await this.save();
          showToast('✅ 自定义宠物已保存，试试走动效果～');
        } else {
          showToast('❌ 图片保存失败');
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
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

    // Wake word
    this.applyWakeWord();
    document.getElementById('btn-save-wakeword').addEventListener('click', async () => {
      const w = document.getElementById('wake-word').value.trim();
      this.settings.wakeWord = w || '小财小财';
      await this.save();
      showToast(`✅ 唤醒口令：${this.settings.wakeWord}`);
    });

    this.applyModelStatus();

    // Multimodal pet animation
    this.applyMultimodal();
    document.getElementById('mm-auth-type').addEventListener('change', () => this.toggleMmAuthFields());
    document.getElementById('btn-mm-upload').addEventListener('click', () => {
      document.getElementById('mm-upload').click();
    });
    document.getElementById('mm-upload').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      // Save provider/auth first
      this.settings.multimodalConfig = {
        provider: document.getElementById('mm-provider').value,
        authType: document.getElementById('mm-auth-type').value,
        accessKeyId: document.getElementById('mm-access-key').value.trim(),
        secretAccessKey: document.getElementById('mm-secret-key').value.trim(),
        apiKey: document.getElementById('mm-api-key').value.trim(),
      };
      await this.save();
      const reader = new FileReader();
      reader.onload = async () => {
        const status = document.getElementById('mm-status');
        status.textContent = '⏳ 正在生成动画（约 1-3 分钟），请稍候…';
        const r = await window.wealthCalendar.multimodalGenerate(reader.result);
        if (r && r.ok) {
          status.textContent = '✅ 动画宠物已生成并应用！';
          this.settings.theme = 'custom';
          this.updateThemeUI('custom');
          await PetState.tryVideoPet();
          showToast('🎬 动画宠物已应用！');
        } else {
          status.textContent = `❌ ${r && r.message ? r.message : '生成失败，请检查 API Key 和网络'}`;
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
    document.getElementById('btn-mm-clear').addEventListener('click', async () => {
      await window.wealthCalendar.multimodalClear();
      document.getElementById('mm-status').textContent = '已清除动画宠物';
      PetState.setTheme(this.settings.theme === 'custom' ? 'custom' : this.settings.theme || 'cat');
      showToast('🗑️ 动画宠物已清除');
    });

    // Main wish (主求方向)
    this.applyWish();
    document.querySelectorAll('#wish-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const wish = btn.dataset.wish;
        this.settings.mainWish = wish;
        document.querySelectorAll('#wish-options .activity-option').forEach((b) =>
          b.classList.toggle('active', b.dataset.wish === wish)
        );
        await this.save();
        showToast(`🎯 主求方向已设为：${btn.textContent.trim()}`);
      });
    });
    document.getElementById('btn-clear-wish').addEventListener('click', async () => {
      this.settings.mainWish = '';
      document.querySelectorAll('#wish-options .activity-option').forEach((b) => b.classList.remove('active'));
      await this.save();
      showToast('✖️ 已清除主求，全面提醒');
    });

    // Calendar mode
    this.applyCalendarMode();
    document.querySelectorAll('#calendar-mode-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.mode;
        this.settings.calendarMode = mode;
        document.querySelectorAll('#calendar-mode-options .activity-option').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        await this.save();
        if (mode === 'wallpaper') {
          await window.wealthCalendar.applyWallpaper();
          await window.wealthCalendar.setWallpaperAutoRefresh(true);
          showToast('🖼️ 桌面背景日历已应用');
        } else {
          await window.wealthCalendar.setWallpaperAutoRefresh(false);
          showToast('🪟 已切换为悬浮日历');
        }
      });
    });
    document.getElementById('btn-apply-wallpaper').addEventListener('click', async () => {
      const r = await window.wealthCalendar.applyWallpaper();
      showToast(r && r.ok ? '🖼️ 壁纸已更新' : '❌ 壁纸生成失败');
    });
  },

  applyCalendarMode() {
    const mode = this.settings.calendarMode || 'floating';
    document.querySelectorAll('#calendar-mode-options .activity-option').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  },

  // --- Main wish (主求方向) ---
  applyWish() {
    const wish = this.settings.mainWish || '';
    document.querySelectorAll('#wish-options .activity-option').forEach((b) => {
      b.classList.toggle('active', b.dataset.wish === wish);
    });
  },

  // --- Multimodal config ---
  applyMultimodal() {
    const mc = this.settings.multimodalConfig || {};
    document.getElementById('mm-provider').value = mc.provider || 'jimeng';
    document.getElementById('mm-auth-type').value = mc.authType || 'aksk';
    document.getElementById('mm-access-key').value = mc.accessKeyId || '';
    document.getElementById('mm-secret-key').value = mc.secretAccessKey || '';
    document.getElementById('mm-api-key').value = mc.apiKey || '';
    this.toggleMmAuthFields();
  },

  toggleMmAuthFields() {
    const isAksk = document.getElementById('mm-auth-type').value === 'aksk';
    document.getElementById('mm-access-key').style.display = isAksk ? '' : 'none';
    document.getElementById('mm-secret-key').style.display = isAksk ? '' : 'none';
    document.getElementById('mm-api-key').style.display = isAksk ? 'none' : '';
  },

  applyModelConfig() {
    const mc = this.settings.modelConfig || {};
    document.getElementById('llm-api-key').value = mc.llmApiKey || '';
    document.getElementById('llm-base-url').value = mc.llmBaseUrl || 'https://api.deepseek.com/v1';
    document.getElementById('llm-model').value = mc.llmModel || 'deepseek-chat';
    document.getElementById('fortune-reminder-enabled').checked = this.settings.fortuneReminderEnabled !== false;
  },

  applyWakeWord() {
    document.getElementById('wake-word').value = this.settings.wakeWord || '小财小财';
  },

  async applyModelStatus() {
    const el = document.getElementById('model-status');
    try {
      const r = await window.wealthCalendar.modelsStatus();
      if (r && r.error) {
        el.textContent = `❌ 服务不可用：${r.error}`;
        return;
      }
      const asr = r.asr || {};
      const loaded = asr.loaded ? '✅ 已加载' : '🕐 按需加载（首次语音输入自动下载）';
      el.textContent = `语音识别(ASR)：${loaded}${asr.size ? ` (${asr.size})` : ''}｜语音合成(TTS)：✅ edge-tts 在线`;
    } catch (e) {
      el.textContent = '❌ 获取失败';
    }
  },

  async save() {
    await window.wealthCalendar.saveSettings(this.settings);
  },
};
