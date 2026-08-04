const { Notification } = require('electron');
const store = require('./calendarStore');

let reminderTimer = null;
let mainWindow = null;

function startReminder(window) {
  mainWindow = window;
  if (reminderTimer) clearInterval(reminderTimer);

  // Check every 30 seconds
  reminderTimer = setInterval(checkReminders, 30000);
  // Also check immediately on start
  checkReminders();
}

function stopReminder() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

function checkReminders() {
  const now = new Date();
  const unreminded = store.getAllUnreminded();

  for (const schedule of unreminded) {
    // Skip if no time set (all-day events fire at 00:00 on the date, but we skip them for now)
    if (!schedule.time) continue;

    // Build the target datetime
    const [year, month, day] = schedule.date.split('-').map(Number);
    const [hour, minute] = schedule.time.split(':').map(Number);

    const targetDate = new Date(year, month - 1, day, hour, minute, 0);

    // Calculate remind time
    const remindBefore = schedule.remindBeforeMin || 0;
    const remindTime = new Date(targetDate.getTime() - remindBefore * 60000);

    // Reminder window: fire only if now is in [remindTime, eventStart + 1h].
    // Events long past are marked reminded and skipped silently (no spam on startup).
    const eventEnd = new Date(targetDate.getTime() + 60 * 60000);
    if (now >= remindTime && now <= eventEnd) {
      // Fire reminder
      fireReminder(schedule);
      store.markReminded(schedule.id);
    } else if (now > eventEnd) {
      // Event is long past — skip without notifying
      store.markReminded(schedule.id);
    }
  }
}

function fireReminder(schedule) {
  const timeStr = schedule.time ? ` ${schedule.time}` : '';
  const body = `📅 ${schedule.title}${timeStr}\n${schedule.note || ''}`.trim();

  // System notification
  if (Notification.isSupported()) {
    try {
      new Notification({ title: '财神日历', body }).show();
    } catch (e) {
      console.error('Notification failed:', e);
    }
  }

  // Send to renderer for pet bubble
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('schedule-reminder', {
      id: schedule.id,
      title: schedule.title,
      date: schedule.date,
      time: schedule.time,
      note: schedule.note,
    });
  }
}

module.exports = { startReminder, stopReminder };
