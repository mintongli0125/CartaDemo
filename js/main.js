/* ---------- Themes ---------- */

const THEMES = [
  { name: 'cardinal', swatch: '#8c1515' },
  { name: 'cozy', swatch: '#b5651d' },
  { name: 'midnight', swatch: '#101830' },
  { name: 'minimal', swatch: '#ffffff' },
];

function setTheme(name) {
  document.documentElement.dataset.theme = name;
  store.set(STORAGE_KEYS.theme, name);
  renderThemeButtons();
}

function renderThemeButtons() {
  const current = document.documentElement.dataset.theme;
  $('#themes').innerHTML = THEMES.map((t) => `
    <button data-theme-choice="${t.name}" title="${t.name}"
            class="${t.name === current ? 'active' : ''}" style="background:${t.swatch}"></button>`
  ).join('');
}

function loadInitialTheme() {
  const saved = store.get(STORAGE_KEYS.theme, null);
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved || (prefersDark ? 'midnight' : 'cardinal');
}

/* ---------- Clicks and changes ---------- */

document.addEventListener('click', (e) => {
  const target = e.target;
  const closest = (attr) => target.closest(`[${attr}]`);

  if (closest('data-delete')) {
    const [quarterId, index] = parseRef(closest('data-delete').dataset.delete);
    return removeCourse(quarterId, index);
  }
  if (closest('data-add')) {
    addCourse(ui.openCourse.code, closest('data-add').dataset.add);
    return closeOverview();
  }
  if (closest('data-compare')) return showComparison(ui.openCourse, findCourse(closest('data-compare').dataset.compare));
  if (target.id === 'compare-btn') return showComparePicker();
  if (target.id === 'close-overlay' || target.id === 'overlay') return closeOverview();
  if (closest('data-theme-choice')) return setTheme(closest('data-theme-choice').dataset.themeChoice);

  const opener = closest('data-open');
  if (opener && !target.closest('input, select, button')) openOverview(opener.dataset.open);
});

document.addEventListener('change', (e) => {
  const el = e.target;

  if (el.dataset.color) {
    const [quarterId, index] = parseRef(el.dataset.color);
    updatePlanItem(quarterId, index, { color: el.value });
  }
  if (el.dataset.lecture) {
    const [quarterId, index, lecture] = parseRef(el.dataset.lecture);
    updatePlanItem(quarterId, index, { lecture });
  }
  if (el.dataset.discussion) {
    const [quarterId, index] = parseRef(el.dataset.discussion);
    updatePlanItem(quarterId, index, { discussion: Number(el.value) });
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'compare-search') renderCompareResults();
});

/* ---------- Drag and drop ---------- */

function endDrag() {
  ui.draggingCode = null;
  document.body.classList.remove('dragging');
}

$('#catalog').addEventListener('dragstart', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  ui.draggingCode = card.dataset.code;
  e.dataTransfer.setData('text/plain', ui.draggingCode);
  document.body.classList.add('dragging');
  renderPlanner(); // highlights quarters that accept this course
});

document.addEventListener('dragend', () => {
  endDrag();
  renderPlanner();
});

$('#quarters').addEventListener('dragover', (e) => {
  const quarter = e.target.closest('.quarter');
  if (quarter && ui.draggingCode && isOffered(findCourse(ui.draggingCode), quarter.dataset.quarter)) {
    e.preventDefault(); // marks this as a valid drop target
  }
});

$('#quarters').addEventListener('drop', (e) => {
  e.preventDefault();
  const quarter = e.target.closest('.quarter');
  const code = ui.draggingCode;
  endDrag();

  if (quarter && code) addCourse(code, quarter.dataset.quarter);
  else renderPlanner();
});

/* ---------- Boot ---------- */

['search', 'filter-quarter', 'sort'].forEach((id) => $('#' + id).addEventListener('input', renderCatalog));

document.documentElement.style.setProperty('--hour', `${HOUR_PX}px`);
loadInitialTheme();
renderThemeButtons();
renderCatalog();
renderPlanner();
