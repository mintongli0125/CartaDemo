const $ = (selector) => document.querySelector(selector);

function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12 || 12}${min ? ':' + String(min).padStart(2, '0') : ''}${suffix}`;
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
