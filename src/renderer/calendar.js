// Calendar view manager
// Uses lunar-javascript for lunar/黄历 data (library loaded via preload)

const CalendarView = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1-based
  selectedDate: null,
  schedules: [],

  init() {
    this.bindEvents();
  },

  _todayStr() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  },

  bindEvents() {
    document.getElementById('btn-calendar-close').addEventListener('click', () => {
      this.close();
    });

    document.getElementById('btn-prev-month').addEventListener('click', () => {
      this.prevMonth();
    });

    document.getElementById('btn-next-month').addEventListener('click', () => {
      this.nextMonth();
    });

    document.getElementById('btn-today').addEventListener('click', () => {
      const today = new Date();
      this.currentYear = today.getFullYear();
      this.currentMonth = today.getMonth() + 1;
      this.render();
    });

    document.getElementById('btn-add-schedule').addEventListener('click', () => {
      this.showScheduleForm();
    });

    // Close schedule detail on click outside
    document.getElementById('schedule-detail').addEventListener('click', (e) => {
      if (e.target === document.getElementById('schedule-detail')) {
        this.closeScheduleDetail();
      }
    });

    document.getElementById('btn-close-detail').addEventListener('click', () => {
      this.closeScheduleDetail();
    });

    document.getElementById('btn-refresh-fortune').addEventListener('click', () => {
      // 刷新当前展示日期的运势（默认今日）
      this.loadFortuneForDate(this._fortuneDate || this._todayStr(), true);
    });

    // 🔮 星盘（懒加载）：点击加载/切换
    document.getElementById('btn-view-star-chart').addEventListener('click', () => {
      this.toggleStarChart();
    });
  },

  async open() {
    document.getElementById('pet-view').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'flex';
    this.currentYear = new Date().getFullYear();
    this.currentMonth = new Date().getMonth() + 1;
    await this.render();
    this.loadFortuneForDate(this._todayStr(), false);
  },

  async close() {
    document.getElementById('calendar-view').style.display = 'none';
    document.getElementById('pet-view').style.display = 'flex';
    this.closeScheduleDetail();
    await window.wealthCalendar.closeCalendar();
  },

  prevMonth() {
    this.currentMonth--;
    if (this.currentMonth < 1) {
      this.currentMonth = 12;
      this.currentYear--;
    }
    this.render();
  },

  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 12) {
      this.currentMonth = 1;
      this.currentYear++;
    }
    this.render();
  },

  async render() {
    // Update header
    document.getElementById('cal-month-label').textContent =
      `${this.currentYear}年${this.currentMonth}月`;

    // Load schedules for this month range
    await this.loadSchedulesForMonth();

    // Build grid
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const firstDay = new Date(this.currentYear, this.currentMonth - 1, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth, 0);
    const totalDays = lastDay.getDate();

    // Day of week for first day (0=Sun, 1=Mon, ...)
    let startDow = firstDay.getDay();
    // Pad empty cells before first day
    for (let i = 0; i < startDow; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell cal-cell-empty';
      grid.appendChild(cell);
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    // We need lunar data for all days - fetch all at once
    // lunar-javascript runs in main process. We'll need IPC.
    // For now, we pass data via IPC call for the whole month.
    const monthData = await window.wealthCalendar.getMonthLunarData(this.currentYear, this.currentMonth);

    for (let d = 1; d <= totalDays; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';

      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cell.dataset.date = dateStr;

      if (dateStr === todayStr) {
        cell.classList.add('cal-cell-today');
      }

      if (dateStr === this.selectedDate) {
        cell.classList.add('cal-cell-selected');
      }

      // Lunar info
      const lunarInfo = monthData[d] || {};

      // Solar date number
      const dateNum = document.createElement('div');
      dateNum.className = 'cal-date-num';
      dateNum.textContent = d;
      cell.appendChild(dateNum);

      // Lunar day (small)
      const lunarDay = document.createElement('div');
      lunarDay.className = 'cal-lunar-day';
      lunarDay.textContent = lunarInfo.lunarDay || '';
      cell.appendChild(lunarDay);

      // JieQi or festival
      if (lunarInfo.jieQi || lunarInfo.festival) {
        const mark = document.createElement('div');
        mark.className = 'cal-mark';
        mark.textContent = lunarInfo.jieQi || lunarInfo.festival;
        cell.appendChild(mark);
      }

      // Yi/Ji indicator
      if (lunarInfo.yi && lunarInfo.yi.length > 0) {
        const yi = document.createElement('div');
        yi.className = 'cal-yi';
        yi.textContent = '宜:' + lunarInfo.yi.slice(0, 1).join('、');
        cell.appendChild(yi);
      }

      // Schedule dot
      const daySchedules = this.schedules.filter(s => s.date === dateStr);
      if (daySchedules.length > 0) {
        const dot = document.createElement('div');
        dot.className = 'cal-dot';
        dot.textContent = '●';
        cell.appendChild(dot);
      }

      // Click to select
      cell.addEventListener('click', () => {
        this.selectDate(dateStr);
      });

      grid.appendChild(cell);
    }
  },

  selectDate(dateStr) {
    this.selectedDate = dateStr;
    // Re-render grid to update selection highlight
    document.querySelectorAll('.cal-cell-selected').forEach(el => el.classList.remove('cal-cell-selected'));
    const cell = document.querySelector(`.cal-cell[data-date="${dateStr}"]`);
    if (cell) cell.classList.add('cal-cell-selected');

    this.showScheduleDetail(dateStr);
    // 点击任意日期 → 查询该日期运势（含日期标签）
    this.loadFortuneForDate(dateStr, false);
  },

  async showScheduleDetail(dateStr) {
    const detail = document.getElementById('schedule-detail');
    const listEl = document.getElementById('schedule-list');
    const detailTitle = document.getElementById('detail-date-label');

    detailTitle.textContent = dateStr;
    detail.classList.remove('hidden');

    // Load schedules
    const schedules = await window.wealthCalendar.calendarList(dateStr);
    this._currentDetailDate = dateStr;

    listEl.innerHTML = '';
    if (schedules.length === 0) {
      listEl.innerHTML = '<div class="schedule-empty">暂无日程</div>';
    } else {
      for (const s of schedules) {
        const item = document.createElement('div');
        item.className = 'schedule-item';

        const info = document.createElement('div');
        info.className = 'schedule-info';
        const timeStr = s.time ? ` ${s.time}` : ' 全天';
        info.innerHTML = `<span class="schedule-title">${this.escapeHtml(s.title)}</span><span class="schedule-time">${timeStr}</span>`;
        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'schedule-actions';
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.title = '编辑';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showScheduleForm(s);
        });
        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.title = '删除';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.wealthCalendar.calendarRemove(s.id);
          this.showScheduleDetail(dateStr);
          await this.render();
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(actions);

        if (s.note) {
          const noteEl = document.createElement('div');
          noteEl.className = 'schedule-note';
          noteEl.textContent = s.note;
          item.appendChild(noteEl);
        }

        listEl.appendChild(item);
      }
    }

    // Load lunar almanac for this date
    const lunarData = await window.wealthCalendar.getDateLunarData(dateStr);
    const almanacEl = document.getElementById('detail-almanac');
    if (lunarData) {
      let almanacHtml = '';
      if (lunarData.lunarDay) almanacHtml += `农历${lunarData.lunarMonth}月${lunarData.lunarDay} `;
      if (lunarData.jieQi) almanacHtml += `<span class="almanac-jieqi">${lunarData.jieQi}</span> `;
      if (lunarData.yi && lunarData.yi.length) almanacHtml += `<div class="almanac-yi">宜：${lunarData.yi.join('、')}</div>`;
      if (lunarData.ji && lunarData.ji.length) almanacHtml += `<div class="almanac-ji">忌：${lunarData.ji.join('、')}</div>`;
      almanacEl.innerHTML = almanacHtml || '无黄历信息';
    } else {
      almanacEl.innerHTML = '';
    }
  },

  // 纯 SVG 7 维运势雷达图（财运/事业/桃花/健康/学业/出行/签约），金色渐变，全平台渲染安全
  buildRadarSVG(dims) {
    const keys = ['wealth', 'career', 'love', 'health', 'study', 'travel', 'signing'];
    const labels = { wealth: '财运', career: '事业', love: '桃花', health: '健康', study: '学业', travel: '出行', signing: '签约' };
    const cx = 130, cy = 112, R = 78;
    const N = keys.length;
    const angle = (i) => (-90 + i * (360 / N)) * Math.PI / 180;
    const pt = (i, r) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) });

    let hasData = false;
    const score = (k) => {
      const d = dims[k] || {};
      const s = parseInt(d.score, 10) || 0;
      if (s > 0) hasData = true;
      return Math.max(0, Math.min(100, s));
    };
    const scores = keys.map(score);
    if (!hasData) return '<div class="fortune-empty">暂无维度数据</div>';

    // 同心七边形网格
    let grid = '';
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const pts = keys.map((_, i) => pt(i, R * f)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      grid += `<polygon points="${pts}" fill="none" stroke="rgba(255,215,0,0.14)" stroke-width="1"/>`;
    }
    // 轴线 + 维度标签
    let axes = '';
    for (let i = 0; i < N; i++) {
      const p = pt(i, R);
      axes += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(255,215,0,0.16)" stroke-width="1"/>`;
      const lp = pt(i, R + 17);
      const anchor = lp.x > cx + 5 ? 'start' : (lp.x < cx - 5 ? 'end' : 'middle');
      axes += `<text x="${lp.x.toFixed(1)}" y="${(lp.y + 4).toFixed(1)}" font-size="11" fill="var(--accent)" text-anchor="${anchor}" dominant-baseline="middle">${labels[keys[i]]}</text>`;
    }
    // 数据多边形（金色渐变）+ 顶点（radar-fill/radar-dots 触发生长动画）
    const dataPts = keys.map((k, i) => pt(i, R * (score(k) / 100))).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots = keys.map((k, i) => {
      const p = pt(i, R * (score(k) / 100));
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#ffd700"/>`;
    }).join('');

    return `<svg viewBox="0 0 260 230" width="100%" height="230" role="img" aria-label="今日运势雷达图">
  <defs>
    <linearGradient id="radarGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd700" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#f0a830" stop-opacity="0.32"/>
    </linearGradient>
  </defs>
  ${grid}
  ${axes}
  <polygon class="radar-fill" points="${dataPts}" fill="url(#radarGold)" stroke="#ffd700" stroke-width="2" stroke-linejoin="round"/>
  <g class="radar-dots">${dots}</g>
</svg>`;
  },

  // 查询并展示指定日期的运势（日历点击任意日期 / 刷新）；日期标签如 "8月15日运势"
  async loadFortuneForDate(dateStr, force) {
    const section = document.getElementById('fortune-section');
    const body = document.getElementById('fortune-body');
    section.classList.remove('hidden');
    this._fortuneDate = dateStr;

    // 日期标签：今天 → 今日运势；其它日期 → "M月D日运势"
    const dateObj = new Date(String(dateStr || this._todayStr()) + 'T00:00:00');
    const isToday = dateStr === this._todayStr();
    const label = isToday ? '今日运势' : `${dateObj.getMonth() + 1}月${dateObj.getDate()}日运势`;
    const titleEl = document.getElementById('fortune-title');
    if (titleEl) titleEl.textContent = `✨ ${label}`;

    body.innerHTML = `<div class="fortune-loading">🔮 正在推算${label}...</div>`;

    const result = await window.wealthCalendar.getFortuneByDate(dateStr || this._todayStr(), !!force);
    if (result && result.error) {
      if (result.error === 'noUserInfo') {
        body.innerHTML = '<div class="fortune-empty">⚠️ 请先在设置中填写出生信息，才能生成专属运势</div>';
      } else {
        body.innerHTML = `<div class="fortune-empty">❌ ${result.message || '运势生成失败，请稍后重试'}</div>`;
      }
      return;
    }

    const f = result.data;
    // 查看运势互动：亲密度 +5 + 每日任务(查看运势)（仅查看今日运势时计入；历史日期不计）
    if (isToday) {
      try { if (typeof PetState !== 'undefined' && PetState.onInteract) PetState.onInteract('fortune', 5); } catch (e) { /* ignore */ }
    }
    const dims = f.dimensions || {};
    const dimLabels = {
      wealth: '💰 财运', career: '💼 事业', love: '💘 桃花',
      health: '💪 健康', study: '📚 学业', travel: '🚗 出行', signing: '✍️ 签约',
    };

    let dimHtml = '';
    for (const [key, label] of Object.entries(dimLabels)) {
      const d = dims[key] || { score: '-', summary: '' };
      dimHtml += `<div class="fortune-dim">
        <span class="fortune-dim-label">${label}</span>
        <span class="fortune-dim-score">${d.score}</span>
        <span class="fortune-dim-summary">${this.escapeHtml(d.summary || '')}</span>
      </div>`;
    }

    const luckyTime = (f.luckyTime || []).join('、') || '—';
    const dirWealth = (f.directions && f.directions.wealth) || '—';
    const luckyNum = Array.isArray(f.luckyNumber) ? f.luckyNumber.join('、') : (f.luckyNumber || '—');
    const sourceTag = result.source === 'llm' ? '✨ AI 命理' : '📜 模板推算';
    const reminderLine = (f.reminderLines && f.reminderLines[0]) || '';
    const briefReason = f.briefReason || '';   // 推理依据（LLM 推理链 / 模板降级推理性文案）
    const overall = Number(f.overall) || 0;

    body.innerHTML = `
      <div class="fortune-card">
        <div class="fortune-score-head">
          <span class="fortune-score-label">${this.escapeHtml(label)}</span>
          <span class="fortune-source">${sourceTag}</span>
        </div>
        <div class="fortune-score-num-row">
          <span class="fortune-score-num" id="fortune-score-value">0</span>
          <span class="fortune-score-total">/ 100</span>
        </div>
        ${briefReason ? `<div class="fortune-line fortune-brief">🔍 ${this.escapeHtml(briefReason)}</div>` : ''}
        ${reminderLine ? `<div class="fortune-line">💬 ${this.escapeHtml(reminderLine)}</div>` : ''}
        <div class="fortune-radar">${this.buildRadarSVG(dims)}</div>
        <div class="fortune-minicards">
          <div class="mini-card"><span class="mini-icon">🍀</span><span class="mini-label">幸运数字</span><span class="mini-value">${this.escapeHtml(String(luckyNum))}</span></div>
          <div class="mini-card"><span class="mini-icon">🧭</span><span class="mini-label">财神方位</span><span class="mini-value">${this.escapeHtml(dirWealth)}</span></div>
          <div class="mini-card"><span class="mini-icon">🕐</span><span class="mini-label">吉时</span><span class="mini-value">${this.escapeHtml(luckyTime)}</span></div>
        </div>
        <div class="fortune-dims">${dimHtml}</div>
        <div class="fortune-disclaimer">${this.escapeHtml(f.disclaimer || '')}</div>
      </div>`;
    this._animateNumber(document.getElementById('fortune-score-value'), overall);
  },

  // 运势分数数字滚动动画（0 → 目标分，easeOutCubic，仅 transform/opacity 无关——数字滚动用 rAF）
  _animateNumber(el, target) {
    if (!el) return;
    const dur = 900;
    const start = performance.now();
    const from = 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (target - from) * ease);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  closeScheduleDetail() {
    document.getElementById('schedule-detail').classList.add('hidden');
    this.selectedDate = null;
    document.querySelectorAll('.cal-cell-selected').forEach(el => el.classList.remove('cal-cell-selected'));
  },

  async loadSchedulesForMonth() {
    this.schedules = await window.wealthCalendar.calendarListAll();
  },

  showScheduleForm(existing) {
    // Simple modal form for add/edit
    const modal = document.getElementById('schedule-form-modal');
    const form = document.getElementById('schedule-form');
    const title = document.getElementById('form-title');

    if (existing) {
      title.textContent = '编辑日程';
      form.dataset.editId = existing.id;
      document.getElementById('form-schedule-title').value = existing.title;
      document.getElementById('form-schedule-date').value = existing.date;
      document.getElementById('form-schedule-time').value = existing.time || '';
      document.getElementById('form-schedule-remind').value = existing.remindBeforeMin || '';
      document.getElementById('form-schedule-note').value = existing.note || '';
    } else {
      title.textContent = '添加日程';
      delete form.dataset.editId;
      document.getElementById('form-schedule-title').value = '';
      document.getElementById('form-schedule-date').value = this._currentDetailDate || this.selectedDate || `${this.currentYear}-${String(this.currentMonth).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
      document.getElementById('form-schedule-time').value = '';
      document.getElementById('form-schedule-remind').value = '';
      document.getElementById('form-schedule-note').value = '';
    }
    modal.classList.remove('hidden');
  },

  hideScheduleForm() {
    document.getElementById('schedule-form-modal').classList.add('hidden');
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // ---- 🔮 星盘（懒加载）：首次点击请求 natal chart 数据渲染，之后点击切换显隐 ----
  _starChartLoaded: false,
  async toggleStarChart() {
    const body = document.getElementById('star-chart-body');
    const btn = document.getElementById('btn-view-star-chart');
    if (!body || !btn) return;
    if (this._starChartLoaded) {
      const hidden = body.classList.contains('hidden');
      body.classList.toggle('hidden', !hidden);
      btn.textContent = hidden ? '🔮 收起星盘' : '🔮 点击查看星盘';
      return;
    }
    btn.textContent = '🔮 加载星盘中…';
    try {
      const s = await window.wealthCalendar.loadSettings();
      const birth = (s.userInfo && s.userInfo.birth) || '';
      if (!birth) {
        body.innerHTML = '<div class="star-chart-empty">请先在设置中填写出生信息，再查看星盘</div>';
      } else {
        const chart = await window.wealthCalendar.natalChart(birth);
        this._renderStarChart(chart, birth);
      }
      this._starChartLoaded = true;
      body.classList.remove('hidden');
      btn.textContent = '🔮 收起星盘';
    } catch (e) {
      body.innerHTML = '<div class="star-chart-empty">星盘数据加载失败，请稍后重试</div>';
      body.classList.remove('hidden');
      btn.textContent = '🔮 收起星盘';
      this._starChartLoaded = true;
    }
  },

  _renderStarChart(chart, birth) {
    const body = document.getElementById('star-chart-body');
    if (!body) return;
    const d = (chart && chart.data) || chart || {};
    const planets = d.planets || {};
    const ascendant = d.ascendant || '';
    let html = '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || ''));
    if (m) html += `<div class="star-chart-sub">${m[1]}年${Number(m[2])}月${Number(m[3])}日 本命星盘</div>`;
    if (ascendant) html += `<div class="star-chart-line"><span class="star-chart-name">上升</span><span class="star-chart-val">${this.escapeHtml(String(ascendant))}</span></div>`;
    const nameMap = { sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星', pluto: '冥王星' };
    const entries = Object.entries(planets);
    for (const [key, p] of entries) {
      const label = (p && (p.planetLabel || nameMap[key] || key)) || key;
      const sign = (p && p.sign) || '';
      const degree = (p && p.degree) != null ? String(p.degree) : '';
      html += `<div class="star-chart-line"><span class="star-chart-name">${this.escapeHtml(String(label))}</span><span class="star-chart-val">${this.escapeHtml(sign)}${degree ? ` ${degree}°` : ''}</span></div>`;
    }
    if (!entries.length && !ascendant) {
      html = '<div class="star-chart-empty">暂无星盘数据</div>';
    } else {
      // 相位摘要（简表，纯文字安全）
      const aspects = d.aspects;
      if (Array.isArray(aspects) && aspects.length) {
        const labels = aspects.slice(0, 5).map((a) => (typeof a === 'string' ? a : (a && (a.label || a.type)) || '')).filter(Boolean);
        if (labels.length) html += `<div class="star-chart-phases">相位：${this.escapeHtml(labels.join('、'))}</div>`;
      }
    }
    body.innerHTML = html;
  }
};

// Form submission handler
document.getElementById('schedule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = e.target.dataset.editId;
  const data = {
    title: document.getElementById('form-schedule-title').value.trim(),
    date: document.getElementById('form-schedule-date').value,
    time: document.getElementById('form-schedule-time').value || null,
    remindBeforeMin: parseInt(document.getElementById('form-schedule-remind').value) || null,
    note: document.getElementById('form-schedule-note').value.trim(),
  };

  if (!data.title) {
    showToast('请输入日程标题');
    return;
  }

  if (editId) {
    await window.wealthCalendar.calendarUpdate(parseInt(editId), data);
  } else {
    await window.wealthCalendar.calendarAdd(data);
  }

  CalendarView.hideScheduleForm();
  if (CalendarView._currentDetailDate) {
    CalendarView.showScheduleDetail(CalendarView._currentDetailDate);
  }
  await CalendarView.render();
});

document.getElementById('btn-cancel-form').addEventListener('click', () => {
  CalendarView.hideScheduleForm();
});

// Close modal on backdrop click
document.getElementById('schedule-form-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('schedule-form-modal')) {
    CalendarView.hideScheduleForm();
  }
});
