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
// Main process polls the cursor, sends {mode, x, y} (window-relative coords),
// and we do the hit-test here: only interactive elements (pet/buttons/bubble/
// panels) are clickable; on win32 everything else clicks through.
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

  // 可交互元素：宠物本体 / 悬浮按钮 / 气泡 / 右键菜单 / 各面板
  const INTERACTIVE_SELECTOR =
    '#pet, #pet-svg, #pet-emoji, #pet-img, #pet-video, #pet-canvas, #pet-bg, #pet-zzz, #pet-action, ' +
    '#hover-buttons, .hover-btn, #reminder-bubble, #context-menu, ' +
    '#chat-panel, #settings-panel, #calendar-view';

  function hitInteractive(x, y) {
    if (x < 0 || y < 0) return false;
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest(INTERACTIVE_SELECTOR));
  }

  const hoverButtons = document.getElementById('hover-buttons');
  window.wealthCalendar.onCursorState((state) => {
    const mode = (typeof state === 'string') ? state : state.mode;
    const x = (typeof state === 'string') ? -1 : state.x;
    const y = (typeof state === 'string') ? -1 : state.y;
    const hit = mode === 'hit' && hitInteractive(x, y);
    const interactive = mode === 'interactive' || hit;
    hoverButtons.classList.toggle('visible', interactive);
    // win32 真透明窗口：透明区域点击穿透，交互元素不穿透
    if (window.wealthCalendar.platform === 'win32') {
      window.wealthCalendar.setClickThrough(mode === 'hit' && !hit);
    }
  });

  notifyPanel();
})();

// --- Custom window drag (drag pet to move the window) ---
(function setupDrag() {
  const stage = document.getElementById('pet-stage');
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  stage.addEventListener('mousedown', (e) => {
    // Don't drag when clicking buttons or inside panels
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;
    isDragging = true;
    // 拖动时暂停阶段调度（阶段计时器在渲染进程 pet.js），拖动中不瞬移/不切阶段
    if (typeof PetState !== 'undefined' && PetState.onDragStart) PetState.onDragStart();
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
      // 松手：拖动位置作为临时停靠，从当前位置继续阶段循环（下个阶段瞬移走）
      if (typeof PetState !== 'undefined' && PetState.onDragRelease) PetState.onDragRelease();
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
// 提醒类消息统一走 PetState 优先级队列（气泡串行显示、高优先级插队、语音走 TTS FIFO），
// 队列不可用时兜底为本地纯气泡显示
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

  function queue(text, opts) {
    if (typeof PetState !== 'undefined' && PetState.enqueueMsg) {
      PetState.enqueueMsg(text, opts);
      return true;
    }
    return false;
  }

  window.wealthCalendar.onScheduleReminder((schedule) => {
    const timeStr = schedule.time ? ` ${schedule.time}` : '';
    const text = `🔔 ${schedule.title}${timeStr}`;
    // ⑤ 日程提醒类：最高类别优先级(5)，不被日常/运势消息淹没
    if (!queue(text, { priority: 5, category: 'schedule', chat: false })) showBubble(text);
  });

  // v0.4.22 启动运势播报统一由 sayDailyFortune（渲染层 30s 一条通道）负责，
  // 主进程已不再推送 fortune-reminder，此处监听一并移除（避免重复播报残留路径）

  // ⑥ 即时通讯类（主进程推送，预留未来渠道）：优先级(4)
  try {
    window.wealthCalendar.onImReminder((data) => {
      const text = (data && data.text) || (data && data.type === 'mail' && data.count ? `📮 主人有 ${data.count} 封未读邮件，记得查收哦~` : '');
      if (!text) return;
      if (!queue(text, { priority: 4, category: 'im' })) showBubble(text);
    });
  } catch (e) { /* ignore */ }
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
    // 悬浮窗内保证全部菜单项可见（3 项菜单约 130px 高，clamp 到底部留白）
    x = Math.max(4, Math.min(x, rect.width - 112));
    y = Math.max(4, Math.min(y, rect.height - 140));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');
    // 右键菜单顶部显示亲密度（每次打开刷新）
    if (typeof PetState !== 'undefined' && PetState.refreshAffinityMenu) PetState.refreshAffinityMenu();
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
      case 'tasks':
        // 今日任务：气泡展示完成情况
        PetState.showDailyTasks();
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
