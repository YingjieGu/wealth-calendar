const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CALENDAR_PATH = path.join(app.getPath('userData'), 'calendar.json');

function loadData() {
  try {
    if (fs.existsSync(CALENDAR_PATH)) {
      return JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load calendar data:', e);
  }
  return { schedules: [] };
}

function saveData(data) {
  try {
    fs.writeFileSync(CALENDAR_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save calendar data:', e);
  }
}

let _nextId = 0;
function nextId(data) {
  if (_nextId === 0) {
    for (const s of data.schedules) {
      if (s.id >= _nextId) _nextId = s.id + 1;
    }
  }
  return ++_nextId;
}

function listByDate(dateStr) {
  const data = loadData();
  return data.schedules.filter(s => s.date === dateStr);
}

function add(schedule) {
  const data = loadData();
  const s = {
    id: nextId(data),
    title: schedule.title,
    date: schedule.date,           // "YYYY-MM-DD"
    time: schedule.time || null,   // "HH:mm" or null
    remindBeforeMin: schedule.remindBeforeMin || null,
    note: schedule.note || '',
    reminded: false,
  };
  data.schedules.push(s);
  saveData(data);
  return s;
}

function update(id, updates) {
  const data = loadData();
  const idx = data.schedules.findIndex(s => s.id === id);
  if (idx === -1) return null;
  const s = data.schedules[idx];
  if (updates.title !== undefined) s.title = updates.title;
  if (updates.date !== undefined) s.date = updates.date;
  if (updates.time !== undefined) s.time = updates.time;
  if (updates.remindBeforeMin !== undefined) s.remindBeforeMin = updates.remindBeforeMin;
  if (updates.note !== undefined) s.note = updates.note;
  saveData(data);
  return s;
}

function remove(id) {
  const data = loadData();
  const idx = data.schedules.findIndex(s => s.id === id);
  if (idx === -1) return false;
  data.schedules.splice(idx, 1);
  saveData(data);
  return true;
}

/** Mark a schedule as reminded (to prevent duplicate reminders) */
function markReminded(id) {
  const data = loadData();
  const s = data.schedules.find(s => s.id === id);
  if (!s) return false;
  s.reminded = true;
  saveData(data);
  return true;
}

/** Get all schedules that haven't been reminded (for the reminder check) */
function getAllUnreminded() {
  const data = loadData();
  return data.schedules.filter(s => !s.reminded);
}

module.exports = { listByDate, add, update, remove, markReminded, getAllUnreminded };
