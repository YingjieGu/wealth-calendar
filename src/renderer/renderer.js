// Main renderer logic: custom drag, hover buttons, settings toggle, toast

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
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  app.addEventListener('mousedown', (e) => {
    // Don't drag when clicking buttons or settings
    if (e.target.closest('button') || e.target.closest('#settings-panel')) return;
    isDragging = true;
    startX = e.screenX;
    startY = e.screenY;
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
      // Keep pet animations running smoothly during drag by preventing text selection
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

  // Show buttons on mousemove within window
  app.addEventListener('mousemove', () => {
    hoverButtons.classList.add('visible');
    if (hoverTimeout) clearTimeout(hoverTimeout);
    // Keep visible for 1.5s after last movement
    hoverTimeout = setTimeout(() => {
      // Only hide if mouse is not over buttons
      if (!hoverButtons.matches(':hover')) {
        hoverButtons.classList.remove('visible');
      }
    }, 1500);
  });

  // Hide immediately on mouse leave
  app.addEventListener('mouseleave', () => {
    hoverButtons.classList.remove('visible');
  });

  // Keep visible when hovering over buttons
  hoverButtons.addEventListener('mouseenter', () => {
    hoverButtons.classList.add('visible');
    if (hoverTimeout) clearTimeout(hoverTimeout);
  });

  hoverButtons.addEventListener('mouseleave', () => {
    hoverButtons.classList.remove('visible');
  });

  // Button actions
  document.getElementById('btn-chat').addEventListener('click', (e) => {
    e.stopPropagation();
    showToast('💬 对话 — 开发中...');
  });

  document.getElementById('btn-calendar').addEventListener('click', (e) => {
    e.stopPropagation();
    showToast('📅 日历 — 开发中...');
  });

  document.getElementById('btn-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    openSettings();
  });
})();

// --- Settings panel toggle ---
function openSettings() {
  document.getElementById('settings-panel').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
}

document.getElementById('btn-close-settings').addEventListener('click', () => {
  closeSettings();
});

// Click outside settings to close
document.getElementById('settings-panel').addEventListener('click', (e) => {
  if (e.target === document.getElementById('settings-panel')) {
    closeSettings();
  }
});

// --- Initialization ---
async function init() {
  // NOTE: PetState.start() must run BEFORE SettingsManager.init() because
  // applyAll() → PetState.setTheme()/setActivity() need this.petEl to exist.
  PetState.start();
  await SettingsManager.init();
}

init();
