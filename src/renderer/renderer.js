// Main renderer logic: custom drag, hover buttons, settings toggle, toast,
// calendar integration, reminder bubble

// --- Toast helper ---
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2000);
}

// --- Custom window drag ---
(function setupDrag() {
  const app = document.getElementById('app');
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  app.addEventListener('mousedown', (e) => {
    // Don't drag when clicking buttons, inputs, or settings/calendar panels
    if (e.target.closest('button') ||
        e.target.closest('input') ||
        e.target.closest('textarea') ||
        e.target.closest('#settings-panel') ||
        e.target.closest('#schedule-detail') ||
        e.target.closest('#schedule-form-modal') ||
        e.target.closest('#context-menu') ||
        e.target.closest('.cal-cell')) return;
    isDragging = true;
    lastX = e.screenX;
    lastY = e.screenY;
    app.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.screenX - lastX;
    const dy = e.screenY - lastY;
    lastX = e.screenX;
    lastY = e.screenY;

    if (dx !== 0 || dy !== 0) {
      window.wealthCalendar.moveWindow(dx, dy);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      app.style.cursor = '';
      window.wealthCalendar.saveWindowPosition();
    }
  });
})();

// --- Hover button visibility ---
(function setupHoverButtons() {
  const app = document.getElementById('app');
  const hoverButtons = document.getElementById('hover-buttons');
  let hoverTimeout = null;

  app.addEventListener('mousemove', () => {
    hoverButtons.classList.add('visible');
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      hoverButtons.classList.remove('visible');
    }, 2000);
  });
})();

// --- Settings toggle ---
(function setupSettingsToggle() {
  const btnSettings = document.getElementById('btn-settings');
  const btnClose = document.getElementById('btn-close-settings');
  const panel = document.getElementById('settings-panel');
  const hoverButtons = document.getElementById('hover-buttons');

  btnSettings.addEventListener('click', () => {
    panel.classList.remove('hidden');
    hoverButtons.classList.add('hidden');
  });

  btnClose.addEventListener('click', () => {
    panel.classList.add('hidden');
  });
})();

// --- Calendar toggle ---
(function setupCalendarButton() {
  const btnCalendar = document.getElementById('btn-calendar');

  btnCalendar.addEventListener('click', async () => {
    await window.wealthCalendar.openCalendar();
    CalendarView.open();
  });
})();

// --- Reminder listener ---
(function setupReminderListener() {
  let bubbleTimer = null;
  const bubble = document.getElementById('reminder-bubble');
  const bubbleText = document.getElementById('reminder-bubble-text');

  function showBubble(text, ms) {
    bubbleText.textContent = text;
    bubble.classList.remove('hidden');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.classList.add('hidden');
    }, ms || 5000);
  }

  window.wealthCalendar.onScheduleReminder((schedule) => {
    const timeStr = schedule.time ? ` ${schedule.time}` : '';
    showBubble(`🔔 ${schedule.title}${timeStr}`);
  });

  window.wealthCalendar.onFortuneReminder((data) => {
    showBubble(`🔮 ${data.line || ''}`);
  });
})();

// --- Context menu (right-click pet) ---
(function setupContextMenu() {
  const menu = document.getElementById('context-menu');
  const pet = document.getElementById('pet');
  const petStage = document.getElementById('pet-stage');

  pet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = petStage.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    // Clamp inside window
    x = Math.max(4, Math.min(x, rect.width - 110));
    y = Math.max(4, Math.min(y, rect.height - 170));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
  });

  // Hide on click elsewhere
  document.addEventListener('mousedown', (e) => {
    if (!menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  menu.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    menu.classList.add('hidden');

    switch (action) {
      case 'fortune':
        await window.wealthCalendar.openCalendar();
        CalendarView.open();
        break;
      case 'calendar':
        await window.wealthCalendar.openCalendar();
        CalendarView.open();
        break;
      case 'settings':
        document.getElementById('settings-panel').classList.remove('hidden');
        document.getElementById('hover-buttons').classList.add('hidden');
        break;
      case 'quit':
        window.wealthCalendar.quitApp();
        break;
    }
  });
})();

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  PetState.start();
  SettingsManager.init();
  CalendarView.init();
});
