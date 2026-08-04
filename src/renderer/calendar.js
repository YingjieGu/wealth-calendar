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
  },

  async open() {
    document.getElementById('pet-view').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'flex';
    this.currentYear = new Date().getFullYear();
    this.currentMonth = new Date().getMonth() + 1;
    await this.render();
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
