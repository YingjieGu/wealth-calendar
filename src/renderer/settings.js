// Settings management for the renderer process

const SettingsManager = {
  async init() {
    this.settings = await window.wealthCalendar.loadSettings();
    this.applyAll();
    this.bindUI();
  },

  applyAll() {
    // Theme（默认素材主题 cat1）
    const theme = this.settings.theme || 'cat1';
    PetState.setTheme(theme, this.settings.petEmoji);

    // 宠物名字（默认小财；同步到 PetState 供气泡替换）
    const petName = (this.settings.petName && this.settings.petName.trim()) || '小财';
    const nameInput = document.getElementById('pet-name');
    if (nameInput) nameInput.value = petName;
    if (PetState) PetState._petName = petName;

    // Activity（默认粘人 clingy）
    const activity = this.settings.activity || 'clingy';
    PetState.setActivity(activity);

    // 界面主题（默认深色）
    const uiTheme = this.settings.uiTheme || 'dark';
    this.applyUiTheme(uiTheme);

    // Update UI buttons
    this.updateThemeUI(theme);
    this.updateActivityUI(activity);
    this.applyUserInfo();
    this.applyPrank();
    this.applyPartner();
    this.applyMemory();
    this.applySkills();
    this.applyMail();
    // 亲密度/心情展示（财宠名字板块）+ 技能配置卡片初始收起
    this.applyAffinity();
    this.hideSkillConfigCard();
    // 元宝卡片 + 财神金主兑换解锁状态
    this.applyCoins();
    this.applyGoldUnlock();
    // v0.4.18 生肖收集宫格 + 解锁按钮 + 进度
    this.applyZodiac();
  },

  // ---- 元宝系统：卡片展示 + 兑换解锁「财神金主」限定主题 ----
  // 元宝数量（settings.petCoins）；兑换解锁条件：元宝 >= 10，解锁写入 settings.unlockedThemes
  applyCoins() {
    const coins = (typeof PetState !== 'undefined' && PetState._petCoins != null)
      ? Number(PetState._petCoins) || 0
      : (Number(this.settings.petCoins) || 0);
    const el = document.getElementById('coin-count');
    if (el) el.textContent = String(coins);
    const unlocked = (this.settings.unlockedThemes || []).includes('gold');
    const btn = document.getElementById('btn-unlock-gold');
    if (btn) {
      if (unlocked) {
        btn.textContent = '✅ 财神金主已解锁';
        btn.disabled = true;
      } else if (coins >= 10) {
        btn.textContent = '👑 兑换解锁财神金主（10 元宝）';
        btn.disabled = false;
      } else {
        btn.textContent = `🔒 兑换解锁（还差${Math.max(0, 10 - coins)}个元宝）`;
        btn.disabled = true;
      }
    }
    const hint = document.getElementById('coin-unlock-hint');
    if (hint) {
      hint.textContent = unlocked
        ? '👑 已解锁「财神金主」限定主题，可到上方主题板块选用（金色边框 + 金色称号 + 特殊气泡）'
        : `累计 10 元宝可兑换解锁「👑 财神金主」限定主题（当前 ${coins} 元宝，${coins >= 10 ? '可以兑换啦！' : `还差 ${Math.max(0, 10 - coins)} 元宝`}）`;
    }
  },
  // 元宝获得后实时刷新卡片（pet.js 领取元宝时调用）
  refreshCoinUI() {
    this.applyCoins();
  },
  // 财神金主主题按钮：解锁后显示在主题板块可选
  applyGoldUnlock() {
    const btn = document.getElementById('theme-option-gold');
    if (!btn) return;
    const unlocked = (this.settings.unlockedThemes || []).includes('gold');
    btn.style.display = unlocked ? '' : 'none';
  },

  // v0.4.18 生肖收集：渲染 4x3 十二宫格（固定鼠牛虎兔龙蛇马羊猴鸡狗猪）+ 元宝余额 + 解锁按钮 + 进度
  applyZodiac() {
    if (typeof MsgCore === 'undefined') return;
    const unlocked = Array.isArray(this.settings.zodiacUnlocked) ? this.settings.zodiacUnlocked : [];
    const grid = document.getElementById('zodiac-grid');
    if (!grid) return;
    const cur = this.settings.theme;
    grid.innerHTML = MsgCore.zodiacEntries().map((t) => {
      const s = MsgCore.zodiacCellState(t, unlocked);
      return `<div class="zodiac-cell ${s.cls}${s.isUnlocked && cur === t.id ? ' active' : ''}" data-theme="${t.id}" title="${t.name}">` +
        `<span class="zodiac-emoji">${s.emoji}</span><span>${s.label}</span></div>`;
    }).join('');
    const coins = (typeof PetState !== 'undefined' && PetState._petCoins != null)
      ? Number(PetState._petCoins) || 0
      : (Number(this.settings.petCoins) || 0);
    const bal = document.getElementById('zodiac-coin-balance');
    if (bal) bal.textContent = `🪙 ${coins} 元宝`;
    const pool = MsgCore.zodiacPool(unlocked);
    const complete = MsgCore.isCollectionComplete(unlocked);
    const btn = document.getElementById('btn-unlock-zodiac');
    if (btn) {
      if (complete) {
        btn.textContent = '🏆 已集齐 12 生肖！';
        btn.disabled = true;
      } else if (MsgCore.canUnlockZodiac(coins, pool)) {
        btn.textContent = `🎲 随机解锁生肖（3 元宝 · 剩 ${pool.length} 个）`;
        btn.disabled = false;
      } else if (coins < MsgCore.ZODIAC_COST) {
        btn.textContent = `🎲 随机解锁生肖（还差 ${MsgCore.ZODIAC_COST - coins} 元宝）`;
        btn.disabled = true;
      } else {
        btn.textContent = '🎲 随机解锁生肖（素材筹备中）';
        btn.disabled = true;
      }
    }
    const prog = document.getElementById('zodiac-progress');
    if (prog) {
      const p = MsgCore.zodiacProgress(unlocked);
      prog.textContent = complete
        ? `已收集 ${p.collected}/${p.total} 🎉 集齐彩蛋：十二生肖收藏家！`
        : `已收集 ${p.collected}/${p.total}`;
    }
    // 同步「收藏家」称号状态：集齐 + 当前生肖主题时 pet.js 显示徽标
    if (typeof PetState !== 'undefined') {
      PetState._zodiacComplete = complete;
      if (PetState._updateZodiacBadge) {
        PetState._updateZodiacBadge(MsgCore.isZodiac(this.settings.theme) && complete);
      }
    }
  },

  // 亲密度/心情展示（财宠名字板块；由 PetState.refreshAffinityMenu 实时刷新）
  applyAffinity() {
    try {
      if (typeof PetState !== 'undefined' && PetState.refreshAffinityMenu) PetState.refreshAffinityMenu();
    } catch (e) { /* ignore */ }
  },

  // 收起技能配置卡片（双击展开 / 保存/清除后收起）
  hideSkillConfigCard() {
    const card = document.getElementById('skill-config-card');
    if (card) card.classList.add('hidden');
  },

  // 技能开关（settings.skills，默认全开）
  applySkills() {
    const def = { calculator: true, weather: true, translate: true, luckyNumber: true, mail: true };
    const s = this.settings.skills || {};
    document.querySelectorAll('#skills-options .activity-option').forEach((b) => {
      const key = b.dataset.skill;
      b.classList.toggle('active', key ? (s[key] !== undefined ? s[key] : def[key]) : false);
    });
  },

  // 邮件服务配置（settings.mail，可选；未配置时聊天触发「收邮件/发邮件」会提示先配置）
  applyMail() {
    const m = this.settings.mail || {};
    document.getElementById('mail-imap-server').value = m.imapServer || '';
    document.getElementById('mail-imap-port').value = m.imapPort || '';
    document.getElementById('mail-smtp-server').value = m.smtpServer || '';
    document.getElementById('mail-smtp-port').value = m.smtpPort || '';
    document.getElementById('mail-email').value = m.email || '';
    document.getElementById('mail-password').value = m.password || '';
    this.applyMailStatus();
  },

  applyMailStatus() {
    const el = document.getElementById('mail-skill-status');
    if (!el) return;
    const m = this.settings.mail || {};
    const ok = !!(m.email && m.imapServer && m.smtpServer);
    el.textContent = ok
      ? `✅ 邮件技能已配置（${m.email}），聊天框输入「收邮件」或「发邮件: 主题|收件人|正文」`
      : '📮 邮件技能：未配置（双击 📮 邮件展开配置后自动启用「收邮件」「发邮件」）';
  },

  // 捣蛋模式开关（settings.prankMode，默认关闭）
  applyPrank() {
    const on = this.settings.prankMode === true;
    document.querySelectorAll('#prank-options .activity-option').forEach((b) => {
      b.classList.toggle('active', (b.dataset.prank === '1') === on);
    });
  },

  // 伙伴模式开关（settings.partnerMode，默认关闭）
  applyPartner() {
    const on = this.settings.partnerMode === true;
    document.querySelectorAll('#partner-options .activity-option').forEach((b) => {
      b.classList.toggle('active', (b.dataset.partner === '1') === on);
    });
  },

  // v0.4.20 用户记忆体开关（settings.userMemoryEnabled，默认开启；关掉停止采集）
  applyMemory() {
    const on = this.settings.userMemoryEnabled !== false;
    document.querySelectorAll('#memory-options .activity-option').forEach((b) => {
      b.classList.toggle('active', (b.dataset.memory === '1') === on);
    });
  },

  // 界面主题：深色(默认) / 浅色 / 青涩 / 手绘涂鸦(doodle)
  applyUiTheme(uiTheme) {
    document.body.classList.toggle('theme-light', uiTheme === 'light');
    document.body.classList.toggle('theme-teal', uiTheme === 'teal');
    document.body.classList.toggle('theme-doodle', uiTheme === 'doodle');
    document.querySelectorAll('#ui-theme-options .activity-option').forEach((b) => {
      b.classList.toggle('active', b.dataset.uiTheme === uiTheme);
    });
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
      // 生肖：手动设置优先，否则按出生年份自动计算
      const zSel = document.getElementById('user-zodiac-select');
      if (zSel) {
        if (ui.zodiac) {
          zSel.value = ui.zodiac;
        } else {
          zSel.value = ui.birth
            ? this.getChineseZodiac(new Date(ui.birth.replace(' ', 'T')).getFullYear())
            : '';
        }
      }
    }
  },

  // 生肖：鼠=0 起点，(year-4)%12（如 2020 鼠）
  getChineseZodiac(year) {
    const arr = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
    if (!year) return '';
    return arr[(((year - 4) % 12) + 12) % 12];
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

  // 全屏漫游开关（settings.petRoam，默认开启）
  applyRoam() {
    const on = this.settings.petRoam !== false;
    document.querySelectorAll('#roam-options .activity-option').forEach((b) => {
      b.classList.toggle('active', (b.dataset.roam === '1') === on);
    });
  },

  // 开机启动开关（settings.autostart，默认关闭）
  applyAutoStart() {
    const on = this.settings.autostart === true;
    document.querySelectorAll('#autostart-options .activity-option').forEach((b) => {
      b.classList.toggle('active', (b.dataset.autostart === '1') === on);
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
      PetState.setTheme(theme, this.settings.petEmoji);
      this.save();
    });

    // 元宝兑换解锁「财神金主」主题：元宝 >= 10 可点，兑换实时扣减 10 元宝并写入 unlockedThemes
    document.getElementById('btn-unlock-gold').addEventListener('click', async () => {
      const coins = (typeof PetState !== 'undefined' && PetState._petCoins != null)
        ? Number(PetState._petCoins) || 0
        : (Number(this.settings.petCoins) || 0);
      if (coins < 10) {
        showToast(`还差 ${10 - coins} 个元宝才能兑换「财神金主」`);
        return;
      }
      this.settings.unlockedThemes = Array.from(new Set([...(this.settings.unlockedThemes || []), 'gold']));
      this.settings.petCoins = coins - 10;
      if (typeof PetState !== 'undefined') PetState._petCoins = this.settings.petCoins;
      await this.save();
      this.applyCoins();
      this.applyGoldUnlock();
      this.updateThemeUI(this.settings.theme);
      showToast('👑 已解锁「财神金主」限定主题！可到主题板块选用');
    });

    // v0.4.18 生肖随机解锁：扣 3 元宝 → 从 assetsReady 且未解锁池随机抽 1 个 → 写 zodiacUnlocked
    document.getElementById('btn-unlock-zodiac').addEventListener('click', async () => {
      if (typeof MsgCore === 'undefined') return;
      const unlocked = Array.isArray(this.settings.zodiacUnlocked) ? this.settings.zodiacUnlocked : [];
      const pool = MsgCore.zodiacPool(unlocked);
      const coins = (typeof PetState !== 'undefined' && PetState._petCoins != null)
        ? Number(PetState._petCoins) || 0
        : (Number(this.settings.petCoins) || 0);
      if (!MsgCore.canUnlockZodiac(coins, pool)) {
        showToast(MsgCore.isCollectionComplete(unlocked)
          ? '🏆 十二生肖已全部集齐！'
          : `元宝不足（随机解锁需 ${MsgCore.ZODIAC_COST} 元宝），或素材筹备中`);
        return;
      }
      const picked = MsgCore.randomZodiacFromPool(pool);
      if (!picked) return;
      this.settings.petCoins = coins - MsgCore.ZODIAC_COST;
      if (typeof PetState !== 'undefined') PetState._petCoins = this.settings.petCoins;
      this.settings.zodiacUnlocked = [...unlocked, picked.id];
      await this.save();
      const emoji = MsgCore.zodiacEmoji(picked.zodiacIndex);
      const msg = `${emoji} 解锁了${picked.name}！`;
      showToast(`${msg}（消耗 3 元宝）`);
      if (typeof PetState !== 'undefined' && PetState.say) PetState.say(`${msg} 去主题板块选它当宠物吧～`);
      this.applyCoins();
      this.applyZodiac();
      // 集齐彩蛋：气泡庆祝 + 「🐲 十二生肖收藏家」称号徽标 + 自动切到刚解锁生肖
      if (MsgCore.isCollectionComplete(this.settings.zodiacUnlocked)) {
        setTimeout(() => {
          showToast('🎉 集齐 12 生肖！获得称号「🐲 十二生肖收藏家」');
          if (typeof PetState !== 'undefined' && PetState.say) PetState.say('🐲 我集齐了十二生肖！主人太棒啦，收藏家称号到手～');
          if (typeof PetState !== 'undefined') {
            this.settings.theme = picked.id;
            this.updateThemeUI(picked.id);
            PetState.setTheme(picked.id, this.settings.petEmoji);
            this.applyZodiac();
          }
        }, 1500);
      }
    });

    // v0.4.18 生肖宫格：点已解锁格 = 切换主题
    document.getElementById('zodiac-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.zodiac-cell');
      if (!cell || !cell.classList.contains('unlocked')) return;
      const theme = cell.dataset.theme;
      this.settings.theme = theme;
      this.updateThemeUI(theme);
      PetState.setTheme(theme, this.settings.petEmoji);
      this.save();
      this.applyZodiac();
    });

    // 宠物名字保存：同步 PetState + settings.petName 持久化
    document.getElementById('btn-save-petname').addEventListener('click', async () => {
      const name = (document.getElementById('pet-name').value || '').trim() || '小财';
      this.settings.petName = name;
      if (PetState) PetState._petName = name;
      await this.save();
      showToast(`✅ 财宠名字已设为：${name}`);
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
          PetState.setTheme('custom', this.settings.petEmoji);
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

    // 界面主题：深色 / 浅色（settings.uiTheme 持久化）
    document.getElementById('ui-theme-options').addEventListener('click', (e) => {
      const btn = e.target.closest('.activity-option');
      if (!btn) return;
      const uiTheme = btn.dataset.uiTheme;
      this.settings.uiTheme = uiTheme;
      this.applyUiTheme(uiTheme);
      this.save();
      showToast(uiTheme === 'light' ? '☀️ 已切换浅色主题' : (uiTheme === 'teal' ? '🍃 已切换青涩主题' : (uiTheme === 'doodle' ? '🎨 已切换手绘涂鸦主题' : '🌙 已切换深色主题')));
    });

    // 全屏漫游开关（settings.petRoam，默认开启）
    this.applyRoam();
    document.querySelectorAll('#roam-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const on = btn.dataset.roam === '1';
        this.settings.petRoam = on;
        document.querySelectorAll('#roam-options .activity-option').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        await this.save();
        if (window.wealthCalendar.roamSet) window.wealthCalendar.roamSet(on);
        // 位置阶段切换开关：开启→瞬移循环，关闭→原地状态循环
        if (typeof PetState !== 'undefined' && PetState.onRoamSettingChange) PetState.onRoamSettingChange(on);
        showToast(on ? '🚶 已开启位置阶段切换' : '🚫 已关闭位置阶段切换');
      });
    });

    // Restore default position
    document.getElementById('btn-restore-position').addEventListener('click', async () => {
      await window.wealthCalendar.restoreDefaultPosition();
      showToast('已恢复默认位置');
    });

    // 开机启动开关（settings.autostart，默认关）
    this.applyAutoStart();
    document.querySelectorAll('#autostart-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const on = btn.dataset.autostart === '1';
        this.settings.autostart = on;
        document.querySelectorAll('#autostart-options .activity-option').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        await this.save();
        const r = await window.wealthCalendar.setAutoStart(on);
        showToast(r && r.ok
          ? (on ? '🚀 已开启开机启动' : '🚫 已关闭开机启动')
          : `❌ 开机启动设置失败：${(r && r.error) || '未知错误'}`);
      });
    });

    // 捣蛋模式开关（settings.prankMode，默认关；保存后主进程即时重排引擎）
    this.applyPrank();
    document.querySelectorAll('#prank-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const on = btn.dataset.prank === '1';
        this.settings.prankMode = on;
        document.querySelectorAll('#prank-options .activity-option').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        await this.save();
        showToast(on ? '😜 捣蛋模式已开启（活跃度 60%，小财会偶尔调皮一下~）' : '🙂 捣蛋模式已关闭');
      });
    });

    // 伙伴模式开关（settings.partnerMode，默认关；开启后小财感知你在做什么）
    this.applyPartner();
    document.querySelectorAll('#partner-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const on = btn.dataset.partner === '1';
        this.settings.partnerMode = on;
        document.querySelectorAll('#partner-options .activity-option').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        await this.save();
        // 立即唤醒窗口感知探测一次（无需等 60s 轮询）
        if (on && typeof PetState !== 'undefined' && PetState._partnerCheck) PetState._partnerCheck();
        const ph = document.getElementById('partner-hint');
        if (ph) {
          ph.textContent = on
            ? '🔓 已打开技能权限：小财可感知你在做什么，选中内容按 Ctrl+Alt+S 总结，聊天框发链接可解析文章（🔒 仅本机处理，不上传窗口内容）'
            : '开启后「🔓 已打开技能权限」：小财可感知你在做什么，选中内容按 Ctrl+Alt+S 总结，聊天框发链接可解析文章（🔒 仅本机处理，不上传窗口内容）';
        }
        showToast(on ? '🤝 伙伴模式已开启，🔓 已打开技能权限' : '🙈 伙伴模式已关闭');
      });
    });

    // v0.4.20 用户记忆体开关（settings.userMemoryEnabled，默认开；关掉停止采集）
    this.applyMemory();
    document.querySelectorAll('#memory-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const on = btn.dataset.memory === '1';
        this.settings.userMemoryEnabled = on;
        document.querySelectorAll('#memory-options .activity-option').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        await this.save();
        showToast(on ? '🧠 用户记忆体已开启（仅存本机，让提醒更贴心）' : '🧠 用户记忆体已关闭（停止采集习惯与情绪）');
      });
    });

    // 「📖 查看记忆」：主进程读取 userData/MEMORY.md 显示在预览框（样式从简）
    document.getElementById('btn-view-memory').addEventListener('click', async () => {
      const pre = document.getElementById('memory-preview');
      try {
        const r = await window.wealthCalendar.memoryView();
        if (pre) {
          pre.textContent = (r && r.ok && r.md) ? r.md : '（暂无记忆，先和小财多互动一会儿吧～）';
          pre.hidden = false;
        }
      } catch (e) {
        if (pre) { pre.textContent = '（读取记忆失败）'; pre.hidden = false; }
      }
    });

    // User info: birth datetime change -> update zodiac preview + auto 生肖
    document.getElementById('user-birth').addEventListener('change', (e) => {
      this.updateZodiac(e.target.value ? e.target.value.replace('T', ' ') : null);
      const zSel = document.getElementById('user-zodiac-select');
      if (zSel && e.target.value) {
        zSel.value = this.getChineseZodiac(new Date(e.target.value).getFullYear());
      }
    });

    // 生肖手动选择：立即保存 settings.userInfo.zodiac
    document.getElementById('user-zodiac-select').addEventListener('change', (e) => {
      this.settings.userInfo = { ...(this.settings.userInfo || {}), zodiac: e.target.value };
      this.save();
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
      const zSel = document.getElementById('user-zodiac-select');
      if (zSel) this.settings.userInfo.zodiac = zSel.value;
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
        llmBaseUrl: document.getElementById('llm-base-url').value.trim() || 'https://api.deepseek.com',
        llmModel: document.getElementById('llm-model').value.trim() || 'deepseek-v4-flash',
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

    // 技能开关（计算器/天气/翻译/数字吉凶/邮件，默认全开；双击=展开配置卡片）
    this.applySkills();
    const skillsBox = document.getElementById('skills-options');
    skillsBox.addEventListener('click', async (e) => {
      const btn = e.target.closest('.activity-option');
      if (!btn || !btn.dataset.skill) return;
      const key = btn.dataset.skill;
      // 双击会先触发 click：延迟 220ms 执行切换，双击时取消（改为展开配置卡片）
      if (btn._skillDbl) { clearTimeout(btn._skillDbl); btn._skillDbl = null; return; }
      btn._skillDbl = setTimeout(async () => {
        btn._skillDbl = null;
        this.settings.skills = { ...(this.settings.skills || {}) };
        const on = !btn.classList.contains('active');
        this.settings.skills[key] = on;
        btn.classList.toggle('active', on);
        await this.save();
        showToast(on ? `✅ ${btn.textContent.trim()} 已开启` : `⏸ ${btn.textContent.trim()} 已关闭`);
      }, 220);
    });
    skillsBox.addEventListener('dblclick', async (e) => {
      const btn = e.target.closest('.activity-option');
      if (!btn || !btn.dataset.skill) return;
      const key = btn.dataset.skill;
      if (btn._skillDbl) { clearTimeout(btn._skillDbl); btn._skillDbl = null; }
      const card = document.getElementById('skill-config-card');
      if (!card) return;
      // 再双击同一技能 → 收起；否则展开该技能配置卡片
      if (card.dataset.skill === key && !card.classList.contains('hidden')) {
        card.classList.add('hidden');
        return;
      }
      card.dataset.skill = key;
      card.classList.remove('hidden');
      showToast(`📂 已展开「${btn.textContent.trim()}」配置卡片`);
    });

    // 邮件服务保存 / 清除（配置卡片内；保存/清除后收起卡片）
    this.applyMail();
    document.getElementById('btn-save-mail').addEventListener('click', async () => {
      this.settings.mail = {
        imapServer: document.getElementById('mail-imap-server').value.trim(),
        imapPort: parseInt(document.getElementById('mail-imap-port').value, 10) || 993,
        smtpServer: document.getElementById('mail-smtp-server').value.trim(),
        smtpPort: parseInt(document.getElementById('mail-smtp-port').value, 10) || 465,
        email: document.getElementById('mail-email').value.trim(),
        password: document.getElementById('mail-password').value,
      };
      await this.save();
      this.applyMailStatus();
      this.hideSkillConfigCard();
      showToast(this.settings.mail.imapServer && this.settings.mail.email && this.settings.mail.smtpServer
        ? '✅ 邮件配置已保存，可在聊天框收/发邮件'
        : '⚠️ 邮件配置不完整，请填全 IMAP/SMTP/账号');
    });
    document.getElementById('btn-clear-mail').addEventListener('click', async () => {
      this.settings.mail = {};
      ['mail-imap-server', 'mail-imap-port', 'mail-smtp-server', 'mail-smtp-port', 'mail-email', 'mail-password']
        .forEach((id) => { document.getElementById(id).value = ''; });
      await this.save();
      this.applyMailStatus();
      this.hideSkillConfigCard();
      showToast('🗑️ 邮件配置已清除');
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
          const detail = (r && r.error) ? ` (${r.error})` : '';
          status.textContent = `❌ 生成失败${detail}。请检查凭证（即梦用 AK/SK，可灵用 API Key）和网络`;
          console.error('[mm] generate failed:', r);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
    document.getElementById('btn-mm-clear').addEventListener('click', async () => {
      await window.wealthCalendar.multimodalClear();
      document.getElementById('mm-status').textContent = '已清除动画宠物';
      PetState.setTheme(this.settings.theme === 'custom' ? 'custom' : this.settings.theme || 'cat', this.settings.petEmoji);
      showToast('🗑️ 动画宠物已清除');
    });

    // Main wish (主求方向；✨推荐 默认)
    this.applyWish();
    document.querySelectorAll('#wish-options .activity-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const wish = btn.dataset.wish;
        // ✨推荐 用空值表示（与旧版未设主求兼容）
        this.settings.mainWish = wish === 'recommend' ? '' : wish;
        this.applyWish();
        await this.save();
        showToast(wish === 'recommend'
          ? '✨ 已设为推荐模式：按当天运势动态播报财运/桃花/事业'
          : `🎯 主求方向已设为：${btn.textContent.trim()}`);
      });
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

  // --- Main wish (主求方向；✨推荐=未设主求/空值，默认) ---
  applyWish() {
    const wish = this.settings.mainWish || '';
    document.querySelectorAll('#wish-options .activity-option').forEach((b) => {
      b.classList.toggle('active', b.dataset.wish === 'recommend' ? wish === '' : b.dataset.wish === wish);
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
    document.getElementById('llm-base-url').value = mc.llmBaseUrl || 'https://api.deepseek.com';
    document.getElementById('llm-model').value = mc.llmModel || 'deepseek-v4-flash';
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
      const tts = r.tts || {};
      const ttsText = tts.available
        ? `✅ edge-tts${tts.version ? ` ${tts.version}` : ''}`
        : `⚠️ edge-tts 不可用（${tts.version || '未知'}，语音播报会走本地降级）`;
      el.textContent = `语音识别(ASR)：${loaded}${asr.size ? ` (${asr.size})` : ''}｜语音合成(TTS)：${ttsText}`;
    } catch (e) {
      el.textContent = '❌ 获取失败';
    }
  },

  async save() {
    await window.wealthCalendar.saveSettings(this.settings);
  },
};
