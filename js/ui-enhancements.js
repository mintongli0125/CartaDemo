/* ---------- Responsive pane splitter ---------- */
const PANE_WIDTH_KEY = 'carta-planner-percent';
const mainLayout = document.querySelector('main');
const paneResizer = document.querySelector('#pane-resizer');

function setPanePercent(percent, persist = false) {
  if (window.matchMedia('(max-width: 820px)').matches) return;
  const clamped = Math.max(25, Math.min(75, percent));
  document.documentElement.style.setProperty('--planner-fr', `${clamped}fr`);
  document.documentElement.style.setProperty('--catalog-fr', `${100 - clamped}fr`);
  paneResizer.setAttribute('aria-valuenow', String(Math.round(clamped)));
  if (persist) localStorage.setItem(PANE_WIDTH_KEY, String(clamped));
}

const saved = Number(localStorage.getItem(PANE_WIDTH_KEY));
if (Number.isFinite(saved) && saved > 0) setPanePercent(saved);

paneResizer.addEventListener('pointerdown', (event) => {
  if (window.matchMedia('(max-width: 820px)').matches) return;
  event.prevent.preventDefault?.();
  event.preventDefault();
  paneResizer.setPointerCapture(event.pointerId);
  document.body.classList.add('resizing-panes');
});

paneResizer.addEventListener('pointermove', (event) => {
  if (!paneResizer.hasPointerCapture(event.pointerId)) return;
  const bounds = mainLayout.getBoundingClientRect();
  setPanePercent(((event.clientX - bounds.left) / bounds.width) * 100, true);
});

function stopResize(event) {
  if (paneResizer.hasPointerCapture(event.pointerId)) paneResizer.releasePointerCapture(event.pointerId);
  document.body.classList.remove('resizing-panes');
}
paneResizer.addEventListener('pointerup', stopResize);
paneResizer.addEventListener('pointercancel', stopResize);

paneResizer.addEventListener('keydown', (event) => {
  if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const current = Number(localStorage.getItem(PANE_WIDTH_KEY)) || 50;
  setPanePercent(current + (event.key === 'ArrowRight' ? 2 : -2), true);
});

/* Searchable course comparison catalogue */
function showComparePicker() {
  $('#compare-slot').innerHTML = `
    <div class="compare-picker">
      <label for="compare-search">Find a course to compare</label>
      <input id="compare-search" type="search" placeholder="Search course code or title" autocomplete="off">
      <div id="compare-results" class="compare-results" role="listbox" aria-label="Courses to compare"></div>
    </div>`;
  renderCompareLookup();
  $('#compare-search').focus();
}

function renderCompareLookup() {
  const input = $('#compare-search');
  const results = $('#compare-results');
  if (!input || !results) return;
  const query = input.value.trim().toLowerCase();
  const matches = COURSES
    .filter((course) => course.code !== ui.openCourse.code)
    .filter((course) => !query || `${course.code} ${course.title}`.toLowerCase().includes(query))
    .slice(0, 30);
  results.innerHTML = matches.map((course) => `
    <button class="compare-result" type="button" role="option" data-compare-code="${course.code}">
      <strong>${course.code}</strong><small>${course.title}</small>
    </button>`).join('') || '<div class="empty">No matching courses.</div>';
}

document.addEventListener('input', (event) => {
  if (event.target.id === 'compare-search') renderCompareLookup();
});

document.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-compare-code]');
  if (choice) showComparison(ui.openCourse, findCourse(choice.dataset.compareCode));
});
