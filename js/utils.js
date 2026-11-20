const $ = (selector) => document.querySelector(selector);

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));

function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 || 12}${min ? ':' + String(min).padStart(2, '0') : ''}${suffix}`;
}

// days is a string like "MW" or "TR" (R = Thursday)
const meeting = (days, start, end, room, instructor) => ({
  days,
  start: toMinutes(start),
  end: toMinutes(end),
  room,
  instructor,
});

// { W: [['0830', '200-107'], ...], R: [...] } -> one-hour discussion meetings
function discussions(byDay) {
  return Object.entries(byDay).flatMap(([day, slots]) =>
    slots.map(([start, room]) => {
      const end = String(Number(start) + 100).padStart(4, '0');
      return meeting(day, start, end, room, 'Section TA');
    })
  );
}

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2600);
}
