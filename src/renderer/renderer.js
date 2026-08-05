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

// Convert any image data URL (webp/jpeg) to PNG via canvas.
// Software-rendered Linux fails to paint WebP <img>, but canvas works.
function convertToPng(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 200;
          canvas.height = img.naturalHeight || 200;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          resolve(dataUrl); // fallback: keep original
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch (e) {
      resolve(dataUrl);
    }
  });
}

// --- Click-through management (transparent pet window) ---
// Main process polls the cursor and sends 'cursor-state' (interactive/transparent/outside).
// We just mirror it: interactive -> show hover buttons; outside -> hide.
(function setupClickThrough() {
  // Tag platform for CSS (Windows can do true see-through pets)
  try {
    document.body.classList.add('platform-' + (window.wealthCalendar.platform || 'linux'));
  } catch (e) { /* ignore */ }

  function panelOpen() {
    return (
      !document.getElementById('settings-panel').classList.contains('hidden') ||
      !document.getElementById('chat-panel').classList.contains('hidden') ||
      document.getElementById('calendar-view').style.display !== 'none'
    );
  }

  // Notify main process when a panel opens/closes (forces interactive mode)
  const notifyPanel = () => window.wealthCalendar.setPanelOpen(panelOpen());
  const observer = new MutationObserver(notifyPanel);
  ['settings-panel', 'chat-panel', 'context-menu'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  const calView = document.getElementById('calendar-view');
  if (calView) observer.observe(calView, { attributes: true, attributeFilter: ['style'] });

  // Cursor state drives hover button visibility
  const hoverButtons = document.getElementById('hover-buttons');
  window.wealthCalendar.onCursorState((mode) => {
    if (mode === 'interactive') {
      hoverButtons.classList.add('visible');
    } else {
      hoverButtons.classList.remove('visible');
    }
  });

  notifyPanel();
})();

// --- Custom window drag (drag anywhere on the pet stage) ---
(function setupDrag() {
  const stage = document.getElementById('pet-stage');
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  stage.addEventListener('mousedown', (e) => {
    // Don't drag when clicking buttons or inside panels
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;
    isDragging = true;
    lastX = e.screenX;
    lastY = e.screenY;
    stage.style.cursor = 'grabbing';
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
      stage.style.cursor = '';
      window.wealthCalendar.saveWindowPosition();
    }
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
    // Enlarge window like chat/calendar panels
    window.wealthCalendar.openChatPanel();
  });

  btnClose.addEventListener('click', () => {
    panel.classList.add('hidden');
    // Restore hover buttons (settings open hid them)
    hoverButtons.classList.remove('hidden');
    window.wealthCalendar.closeChatPanel();
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

// --- Chat toggle ---
(function setupChatButton() {
  const btnChat = document.getElementById('btn-chat');
  btnChat.addEventListener('click', () => {
    ChatPanel.open();
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
      case 'stick':
        // 财神特色：随机抽一支签，用气泡显示签文
        PetState.drawStick();
        break;
      case 'calendar':
        await window.wealthCalendar.openCalendar();
        CalendarView.open();
        break;
      case 'settings':
        document.getElementById('settings-panel').classList.remove('hidden');
        document.getElementById('hover-buttons').classList.add('hidden');
        await window.wealthCalendar.openChatPanel();
        break;
      case 'hide':
        window.wealthCalendar.hideWindow();
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

  // Doubao-style: hotkey summons the pet -> say hi
  try {
    window.wealthCalendar.onPetSummoned(() => {
      PetState.say('喵～主人叫我啦！有什么吩咐？');
    });
  } catch (e) { /* ignore */ }

  // Doubao-style: click the speech bubble to open chat
  const bubble = document.getElementById('reminder-bubble');
  bubble.addEventListener('click', () => {
    bubble.classList.add('hidden');
    if (window.ChatPanel) {
      ChatPanel.open();
    }
  });
});
