const STORAGE_KEYS = { plan: 'fq_plan', theme: 'fq_th' };

// plan[quarterId] = [{ code, color, lecture, discussion }]
const plan = { A: [], W: [], S: [], U: [], ...store.get(STORAGE_KEYS.plan, {}) };

// Transient UI state shared across files
const ui = { draggingCode: null, openCourse: null };

const savePlan = () => store.set(STORAGE_KEYS.plan, plan);
const findCourse = (code) => COURSES.find((c) => c.code === code);
const findQuarter = (id) => QUARTERS.find((q) => q.id === id);
const isOffered = (course, quarterId) => Boolean(course.offerings[quarterId]);
const latestRating = (course) => (course.ratings.length ? course.ratings.at(-1) : null);
// Real hours when we have them, otherwise units x HOURS_PER_UNIT. Display code still shows 'n/a'.
// Unrated courses count as DEFAULT_RATING in the comparison meters; everywhere else they stay "unrated".
const ratingEstimated = (course) => latestRating(course) == null;
const effectiveRating = (course) => latestRating(course) ?? DEFAULT_RATING;
const hoursEstimated = (course) => course.hours == null;
const effectiveHours = (course) => course.hours ?? course.units * HOURS_PER_UNIT;
const wayTags = (course) => (course.ways || []).map((w) => `<span class="way-tag">${w}</span>`).join('');
// Rating drawn as five stars, the last one partly filled (4.3 -> four stars and a bit).
// Styled inline on purpose: grey stars underneath, gold copy on top clipped to the rating's width.
// It needs nothing from styles.css, so a stale or cached stylesheet can't turn every star gold.
const starsHTML = (rating) => {
  if (rating == null) return '';
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100)).toFixed(1);
  const base = 'position:relative;display:inline-block;white-space:nowrap;line-height:1;vertical-align:-1px;color:var(--line,#d8d8d8);-webkit-text-fill-color:currentColor;';
  const fill = `position:absolute;left:0;top:0;width:${pct}%;overflow:hidden;white-space:nowrap;color:var(--star,#d98e04);-webkit-text-fill-color:currentColor;`;
  return `<span class="rating-stars" role="img" aria-label="${rating} out of 5" style="${base}">★★★★★<span aria-hidden="true" style="${fill}">★★★★★</span></span>`;
};
const dayList = (days) => [...days].map((d) => DAY_NAMES[d]).join('/');

// Lecture + chosen discussion for a planned course, tagged so discussions render differently
function selectedMeetings(item, quarterId) {
  const offering = findCourse(item.code).offerings[quarterId];
  if (!offering) return [];
  const lecture = offering.lectures[item.lecture];
  const discussion = offering.discussions?.[item.discussion];
  return [
    lecture && { ...lecture, isDiscussion: false },
    discussion && { ...discussion, isDiscussion: true },
  ].filter(Boolean);
}

// One block per meeting per weekday
function collectBlocks(items, quarterId) {
  return items.flatMap((item, itemIndex) =>
    selectedMeetings(item, quarterId).flatMap((m) =>
      [...m.days].map((day) => ({ ...m, day, item, itemIndex }))
    )
  );
}

// Returns the set of block indexes that overlap another course's block
function findConflicts(blocks) {
  const conflicted = new Set();
  blocks.forEach((a, i) => {
    blocks.forEach((b, j) => {
      const overlaps = a.day === b.day && a.itemIndex !== b.itemIndex && a.start < b.end && b.start < a.end;
      if (i < j && overlaps) { conflicted.add(i); conflicted.add(j); }
    });
  });
  return conflicted;
}

function addCourse(code, quarterId) {
  const course = findCourse(code);
  const quarter = findQuarter(quarterId);

  if (!isOffered(course, quarterId)) return toast(`${code} isn’t offered in ${quarter.name}`);
  if (plan[quarterId].some((i) => i.code === code)) return toast(`${code} is already in this quarter`);

  const elsewhere = QUARTERS.find((q) => q.id !== quarterId && plan[q.id].some((i) => i.code === code));
  if (elsewhere && !confirm(`${code} is already planned in ${elsewhere.name}. Add it here too?`)) return;

  const color = COLORS[Object.values(plan).flat().length % COLORS.length];
  plan[quarterId].push({ code, color, lecture: 0, discussion: 0 });
  renderPlanner();
}

function removeCourse(quarterId, index) {
  plan[quarterId].splice(index, 1);
  renderPlanner();
}

function updatePlanItem(quarterId, index, changes) {
  Object.assign(plan[quarterId][index], changes);
  renderPlanner();
}

// WAYS -> Set of course codes that satisfy it, across all quarters
function waysFulfilled() {
  const fulfilled = {};
  Object.values(plan).flat().forEach((item) => {
    (findCourse(item.code).ways || []).forEach((way) => {
      (fulfilled[way] ||= new Set()).add(item.code);
    });
  });
  return fulfilled;
}

// "A,0,2" -> ['A', 0, 2]  (used by data attributes)
const parseRef = (ref) => ref.split(',').map((part, i) => (i === 0 ? part : Number(part)));

/* ---------- Similar courses ---------- */
// The export's similar_courses lists are all empty, so similarity is worked out from the text
// (title + description) plus shared lecture instructors. A course can still pin its own list
// with `similar: ['CS 12SI']` in data.js; those come first.

const STOPWORDS = new Set(('about after also and any are because been before being both but can class classes course courses ' +
  'each for from give have how including include includes intro introduction into its learn many make may more most new not one other ' +
  'over part real students such than that the their them then these they this through topics use using want weekly what when where ' +
  'which while who will with within without work world you your final project projects build built apply').split(' '));
const MIN_SIMILARITY = 0.08;

// Short descriptions rarely share exact words, so related words also count as one topic.
// Edit freely: word lists in, readable label out.
const TOPICS = {
  ai:      { label: 'AI & machine learning', words: 'ai artificial intelligence intelligent machine machines learning neural deep transformer transformers nlp' },
  xr:      { label: 'VR/AR with Unity', words: 'unity virtual augmented reality oculus immersive' },
  vcs:     { label: 'version control', words: 'git version revision repository branches merge' },
  code:    { label: 'programming', words: 'python haskell programming coding software code functional shell unix linux' },
  society: { label: 'AI & society', words: 'society societal social economic economy ethical ethics bias justice democracy impact policy warfare government' },
  career:  { label: 'careers & industry', words: 'interview internship career compensation finance financial startup entrepreneurship venture' },
};
const topicOfWord = {};
Object.entries(TOPICS).forEach(([key, { words }]) => words.split(' ').forEach((w) => { topicOfWord[w] = key; }));

const surfaceForm = {}; // term -> readable text for "both mention …"
const stem = (w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

function termsOf(course) {
  const terms = [];
  (`${course.title} ${course.title} ${course.description}`.toLowerCase().match(/[a-z]{2,}/g) || [])
    .filter((w) => !STOPWORDS.has(w) && (w.length > 2 || topicOfWord[w]))
    .forEach((w) => {
      const s = stem(w);
      surfaceForm[s] ||= w;
      terms.push(s);
      const topic = topicOfWord[w] || topicOfWord[s];
      if (topic) { terms.push('~' + topic); surfaceForm['~' + topic] = TOPICS[topic].label; }
    });
  return terms;
}

const lectureInstructors = (course) => new Set(
  Object.values(course.offerings).flatMap((o) =>
    o.lectures.flatMap((l) => (l.instructor || '').split(',').map((n) => n.trim()).filter(Boolean)))
);

let similarityVectors = null; // TF-IDF vector per course, same order as COURSES

function buildSimilarityVectors() {
  const counts = COURSES.map((c) => {
    const tf = {};
    termsOf(c).forEach((t) => { tf[t] = (tf[t] || 0) + 1; });
    return tf;
  });
  const docFreq = {};
  counts.forEach((tf) => Object.keys(tf).forEach((t) => { docFreq[t] = (docFreq[t] || 0) + 1; }));

  return counts.map((tf) => {
    const vec = {};
    let norm = 0;
    for (const t in tf) {
      vec[t] = (1 + Math.log(tf[t])) * Math.log(1 + COURSES.length / docFreq[t]);
      norm += vec[t] ** 2;
    }
    norm = Math.sqrt(norm) || 1;
    for (const t in vec) vec[t] /= norm;
    return vec;
  });
}

// -> [{ course, score, why }], best first
function similarCourses(course, limit = 3) {
  similarityVectors ||= buildSimilarityVectors();
  const mine = similarityVectors[COURSES.indexOf(course)];
  const myInstructors = lectureInstructors(course);

  const pinned = (course.similar || []).map(findCourse).filter(Boolean)
    .map((c) => ({ course: c, score: 1, why: 'picked by hand' }));

  const computed = COURSES.map((other, i) => {
    if (other === course || pinned.some((p) => p.course === other)) return null;

    let score = 0;
    const shared = [];
    for (const t in mine) {
      const w = mine[t] * (similarityVectors[i][t] || 0);
      if (w) { score += w; shared.push([t, w]); }
    }
    const sameInstructor = [...lectureInstructors(other)].find((n) => myInstructors.has(n));
    if (sameInstructor && score > 0.03) score += 0.05;

    shared.sort((a, b) => b[1] - a[1]);
    const topic = shared.find(([t]) => t.startsWith('~'));
    const words = shared.filter(([t]) => !t.startsWith('~')).slice(0, 2).map(([t]) => surfaceForm[t]);
    const why = [topic ? `both about ${surfaceForm[topic[0]]}` : words.length && `both mention ${words.join(', ')}`,
                 sameInstructor && score > 0.08 && `same instructor (${sameInstructor})`].filter(Boolean).join(' · ');
    return { course: other, score, why };
  }).filter((x) => x && x.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score);

  return [...pinned, ...computed].slice(0, limit);
}

/* ---------- Campus map picture ---------- */

// Which building a room belongs to. "460-334" matches by building number, "Hewlett 200" by name.
const buildingKey = (room) => (room
  ? Object.keys(BUILDING_PINS).find((k) => (/^\d/.test(k) ? room.split('-')[0] === k : room.includes(k)))
  : null);

// Buildings a course uses: [{ pin, rooms: Map(room -> 'lecture' | 'discussion') }]
function buildingsFor(course) {
  const groups = new Map();
  Object.values(course.offerings).forEach((offering) => {
    const meetings = [
      ...offering.lectures.map((m) => [m, 'lecture']),
      ...(offering.discussions || []).map((m) => [m, 'discussion']),
    ];
    meetings.forEach(([m, kind]) => {
      const key = buildingKey(m.room);
      if (!key) return;
      const pin = BUILDING_PINS[key];
      const group = groups.get(pin.name) || { pin, rooms: new Map() };
      if (!group.rooms.has(m.room) || kind === 'lecture') group.rooms.set(m.room, kind);
      groups.set(pin.name, group);
    });
  });
  return [...groups.values()];
}

// The part of the picture to show: tight around the pins, never closer than `minWidth` of the picture.
function mapWindow(points, ratio, { minWidth = 0.2, pad = 0.06 } = {}) {
  const W = CAMPUS_MAP.width;
  const H = CAMPUS_MAP.height;
  const xs = points.map((p) => (p.x / 100) * W);
  const ys = points.map((p) => (p.y / 100) * H);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  let w = points.length ? Math.max(maxX - minX + 2 * pad * W, minWidth * W) : W;
  let h = points.length ? Math.max(maxY - minY + 2 * pad * W, (minWidth * W) / ratio) : H;
  if (w / h < ratio) w = h * ratio; else h = w / ratio;
  if (w > W) { w = W; h = w / ratio; }

  // A window taller than the picture (pins far apart) just shows blank bands above and below.
  const cx = points.length ? (minX + maxX) / 2 : W / 2;
  const cy = points.length ? (minY + maxY) / 2 : H / 2;
  return {
    x: w >= W ? 0 : Math.min(W - w, Math.max(0, cx - w / 2)),
    y: h >= H ? (H - h) / 2 : Math.min(H - h, Math.max(0, cy - h / 2)),
    w,
    h,
  };
}

const attr = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

// A teardrop map pin with its tip at the bottom centre. Filled = lecture, white with a coloured rim = discussion.
function pinSVG(color = 'var(--accent)', hollow = false, width = 22) {
  const height = Math.round((width * 32) / 24);
  return `<svg viewBox="0 0 24 32" width="${width}" height="${height}" aria-hidden="true"
      style="display:block;overflow:visible;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55))">
    <path d="M12 30.5C12 30.5 2 19 2 11.5a10 10 0 0 1 20 0C22 19 12 30.5 12 30.5Z"
          fill="${hollow ? '#fff' : color}" stroke="${hollow ? color : '#fff'}" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="12" cy="11.5" r="4" fill="${hollow ? color : '#fff'}"/>
  </svg>`;
}

// Tiny pin for the "lecture / discussion" key under a map.
const legendPin = (hollow) =>
  `<span style="display:inline-block;margin:0 3px 0 7px;vertical-align:-2px">${pinSVG('var(--accent)', hollow, 9)}</span>`;

// Zoom and pan of each map ({ sig, cx, cy, w }, in picture pixels), so a map keeps its view when the planner redraws.
const mapViews = {};

function clampMapView(view, ratio) {
  const W = CAMPUS_MAP.width;
  const H = CAMPUS_MAP.height;
  const w = Math.min(W, Math.max(W * 0.12, view.w)); // zoom in to 12% of the picture, out to all of it
  const h = w / ratio;
  return {
    w,
    cx: w >= W ? W / 2 : Math.min(W - w / 2, Math.max(w / 2, view.cx)),
    cy: h >= H ? H / 2 : Math.min(H - h / 2, Math.max(h / 2, view.cy)),
  };
}

// points: [{ x, y, color?, hollow?, label?, title?, open?, dx? }], x and y in % of the picture.
// Draws the picture zoomed onto the pins, with a pin on each and zoom buttons. Drag to pan; +/- or Ctrl+scroll to zoom.
// Size, picture and pins are styled inline on purpose, so the map keeps its look even if styles.css is stale or cached.
// `id` lets a map remember its zoom between redraws.
function campusMapHTML(points, { id = '', ratio = 1.5, minWidth, pad, maxWidth = 340, pinWidth = 22 } = {}) {
  const W = CAMPUS_MAP.width;
  const H = CAMPUS_MAP.height;
  const auto = mapWindow(points, ratio, { minWidth, pad });
  const autoView = clampMapView({ cx: auto.x + auto.w / 2, cy: auto.y + auto.h / 2, w: auto.w }, ratio);
  const sig = points.map((p) => `${p.x},${p.y}`).join('|');
  const saved = id && mapViews[id] && mapViews[id].sig === sig ? mapViews[id] : null;
  const view = saved ? clampMapView(saved, ratio) : autoView;
  const h = view.w / ratio;
  const x0 = view.cx - view.w / 2;
  const y0 = view.cy - h / 2;
  const pinHeight = Math.round((pinWidth * 32) / 24);

  // Alternate name tags above and below the pin so neighbours do not sit on top of each other.
  points.filter((p) => p.label).sort((a, b) => a.x - b.x).forEach((p, i) => { p.place = i % 2 ? 'below' : 'above'; });

  const box = `position:relative;overflow:hidden;isolation:isolate;width:100%;max-width:${maxWidth}px;aspect-ratio:${ratio};`
    + 'touch-action:none;cursor:grab;background:var(--wash,#eee);border:1px solid var(--line,#ddd);border-radius:8px;';
  const img = `position:absolute;display:block;max-width:none;height:auto;width:${((W / view.w) * 100).toFixed(2)}%;`
    + `left:${((-x0 / view.w) * 100).toFixed(2)}%;top:${((-y0 / h) * 100).toFixed(2)}%;user-select:none;`;
  const tag = (place) => 'position:absolute;left:50%;transform:translateX(-50%);padding:2px 5px;white-space:nowrap;pointer-events:none;'
    + 'font:600 10px/1.1 var(--font,sans-serif);color:#222;background:#fff;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.35);'
    + (place === 'below' ? 'top:calc(100% + 3px);' : 'bottom:calc(100% + 3px);');
  const size = maxWidth <= 220 ? 20 : 26; // smaller buttons on the small planner maps
  const button = `width:${size}px;height:${size}px;padding:0;display:grid;place-items:center;font:700 ${size > 20 ? 15 : 13}px/1 var(--font,sans-serif);color:#222;`
    + 'background:#fff;border:1px solid rgba(0,0,0,.25);border-radius:5px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3);';

  // Lower pins are drawn on top of higher ones, like a real map.
  const pins = [...points].sort((a, b) => a.y - b.y).map((p, i) => {
    const px = (p.x / 100) * W;
    const py = (p.y / 100) * H;
    return `<span class="pin-marker" ${p.open ? `data-open="${attr(p.open)}"` : ''} title="${attr(p.title)}"
        data-px="${px.toFixed(1)}" data-py="${py.toFixed(1)}"
        style="position:absolute;left:${(((px - x0) / view.w) * 100).toFixed(2)}%;top:${(((py - y0) / h) * 100).toFixed(2)}%;`
      + `width:${pinWidth}px;height:${pinHeight}px;z-index:${i + 1};cursor:pointer;`
      + `transform:translate(calc(-50% + ${p.dx || 0}px),-100%)">${pinSVG(p.color || 'var(--accent)', p.hollow, pinWidth)}`
      + `${p.label ? `<b style="${tag(p.place)}">${p.label}</b>` : ''}</span>`;
  }).join('');

  const missing = "this.parentNode.innerHTML='<div style=&quot;display:grid;place-items:center;height:100%;padding:8px;text-align:center;font-size:11px&quot;>Map picture not found: add img/campus-map.webp</div>'";
  return `<div class="campus-map" style="${box}" data-map-id="${attr(id)}" data-ratio="${ratio}" data-sig="${attr(sig)}"
      data-auto="${attr(JSON.stringify(autoView))}" data-view="${attr(JSON.stringify(view))}">
    <img src="${CAMPUS_MAP.src}" alt="Stanford campus map" draggable="false" style="${img}" onerror="${missing}">${pins}
    <div style="position:absolute;top:5px;right:5px;z-index:1000;display:flex;flex-direction:column;gap:3px">
      <button type="button" data-map-zoom="in" title="Zoom in (or Ctrl + scroll)" aria-label="Zoom in" style="${button}">+</button>
      <button type="button" data-map-zoom="out" title="Zoom out" aria-label="Zoom out" style="${button}">−</button>
      <button type="button" data-map-zoom="fit" title="Back to the pins" aria-label="Fit the map to the pins" style="${button}font-size:${size > 20 ? 9 : 8}px;font-weight:600;">Fit</button>
    </div></div>`;
}

const mapCreditHTML = () =>
  `Map: <a href="${CAMPUS_MAP.source}" target="_blank" rel="noopener">${CAMPUS_MAP.credit}</a> · drag to pan, +/− to zoom`;

/* ---------- Map zoom and pan (works on any .campus-map, even after the planner redraws) ---------- */
(function enableMapInteractions() {
  const viewOf = (map) => JSON.parse(map.dataset.view);

  // Update the picture and the pins in place, so a drag never has to redraw anything.
  function setView(map, wanted) {
    const ratio = Number(map.dataset.ratio);
    const v = clampMapView(wanted, ratio);
    const h = v.w / ratio;
    const x0 = v.cx - v.w / 2;
    const y0 = v.cy - h / 2;
    const img = map.querySelector('img');
    if (img) {
      img.style.width = `${(CAMPUS_MAP.width / v.w) * 100}%`;
      img.style.left = `${(-x0 / v.w) * 100}%`;
      img.style.top = `${(-y0 / h) * 100}%`;
    }
    map.querySelectorAll('.pin-marker').forEach((pin) => {
      pin.style.left = `${((Number(pin.dataset.px) - x0) / v.w) * 100}%`;
      pin.style.top = `${((Number(pin.dataset.py) - y0) / h) * 100}%`;
    });
    map.dataset.view = JSON.stringify(v);
    if (map.dataset.mapId) mapViews[map.dataset.mapId] = { sig: map.dataset.sig, ...v };
  }

  // Zoom keeping the spot under (ax, ay), given as fractions of the map box, where it is.
  function zoomBy(map, factor, ax = 0.5, ay = 0.5) {
    const v = viewOf(map);
    const ratio = Number(map.dataset.ratio);
    const h = v.w / ratio;
    const px = v.cx - v.w / 2 + ax * v.w;
    const py = v.cy - h / 2 + ay * h;
    const w = v.w / factor;
    const nh = w / ratio;
    setView(map, { w, cx: px - ax * w + w / 2, cy: py - ay * nh + nh / 2 });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-map-zoom]');
    if (!btn) return;
    const map = btn.closest('.campus-map');
    const action = btn.dataset.mapZoom;
    if (action === 'fit') {
      setView(map, JSON.parse(map.dataset.auto));
      if (map.dataset.mapId) delete mapViews[map.dataset.mapId];
    } else {
      zoomBy(map, action === 'in' ? 1.6 : 1 / 1.6);
    }
  });

  // Ctrl/Cmd + scroll (also what a trackpad pinch sends) zooms; a plain scroll still scrolls the page.
  document.addEventListener('wheel', (e) => {
    const map = e.target.closest?.('.campus-map');
    if (!map || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = map.getBoundingClientRect();
    zoomBy(map, Math.exp(-e.deltaY * 0.01), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });

  // Drag to pan, two fingers to pinch. A drag that ends on a pin must not count as a click on it.
  const pointers = new Map();
  let gesture = null;
  let swallowClick = false;

  document.addEventListener('pointerdown', (e) => {
    const map = e.target.closest?.('.campus-map');
    if (!map || e.target.closest('button')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) gesture = { map, x: e.clientX, y: e.clientY, view: viewOf(map), moved: false };
    else if (gesture && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, view: viewOf(map) };
      gesture.moved = true;
    }
  });

  document.addEventListener('pointermove', (e) => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { map } = gesture;
    if (pointers.size >= 2 && gesture.pinch) {
      const [a, b] = [...pointers.values()];
      const scale = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / gesture.pinch.dist;
      setView(map, { ...gesture.pinch.view, w: gesture.pinch.view.w / scale });
      return;
    }
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) > 4) {
      gesture.moved = true;
      map.setPointerCapture?.(e.pointerId); // only once it is really a drag, so plain clicks on pins still work
      map.style.cursor = 'grabbing';
    }
    if (gesture.moved) {
      const perPx = gesture.view.w / map.getBoundingClientRect().width;
      setView(map, { w: gesture.view.w, cx: gesture.view.cx - dx * perPx, cy: gesture.view.cy - dy * perPx });
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (!gesture || pointers.size) return;
    if (gesture.moved) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 60); }
    gesture.map.style.cursor = 'grab';
    gesture = null;
  };
  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', endPointer);
  document.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
})();

/* ---------- Share the plan as a link ---------- */
// The plan lives in the part of the URL after "#", so the link needs no server and works on any device.

const toBase64Url = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => new TextDecoder().decode(
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

function planToLink() {
  const items = [];
  QUARTERS.forEach((q) => plan[q.id].forEach((i) => items.push([q.id, i.code, i.lecture, i.discussion, i.color.replace('#', '')])));
  const payload = toBase64Url(JSON.stringify({ v: 1, p: items }));
  return { count: items.length, url: `${location.href.split('#')[0]}#plan=${payload}` };
}

// null: no plan in the address; { error: true }: a plan that can't be read; otherwise { plan, count }.
// Every item is checked against the course data, so a hand-edited link can't put anything odd into the planner.
function readPlanLink(hash = location.hash) {
  if (!hash.startsWith('#plan=')) return null;
  const match = /^#plan=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!match) return { error: true };
  try {
    const data = JSON.parse(fromBase64Url(match[1]));
    if (data.v !== 1 || !Array.isArray(data.p)) return { error: true };

    const result = { A: [], W: [], S: [], U: [] };
    let count = 0;
    data.p.forEach(([quarterId, code, lecture, discussion, color]) => {
      const course = findCourse(code);
      if (!course || !result[quarterId] || !isOffered(course, quarterId)) return;
      if (result[quarterId].some((i) => i.code === code)) return;
      const offering = course.offerings[quarterId];
      const index = (value, list) => (Number.isInteger(value) && value >= 0 && value < (list?.length || 0) ? value : 0);
      result[quarterId].push({
        code,
        color: /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : COLORS[count % COLORS.length],
        lecture: index(lecture, offering.lectures),
        discussion: index(discussion, offering.discussions),
      });
      count += 1;
    });
    return count ? { plan: result, count } : { error: true };
  } catch {
    return { error: true };
  }
}

// Returns true when the planner changed. Always clears the "#plan=…" part so a refresh doesn't ask again.
function importPlanFromLink() {
  const link = readPlanLink();
  if (!link) return false;
  history.replaceState(null, '', location.pathname + location.search);
  if (link.error) { toast('That plan link looks damaged, so nothing was imported.'); return false; }

  const current = Object.values(plan).flat().length;
  if (current && !confirm(`Replace the ${current} course${current > 1 ? 's' : ''} in your plan with the ${link.count} from this link?`)) return false;
  QUARTERS.forEach((q) => { plan[q.id] = link.plan[q.id]; });
  toast(`Imported ${link.count} course${link.count > 1 ? 's' : ''} from the link`);
  return true;
}

async function copyPlanLink() {
  const { count, url } = planToLink();
  if (!count) return toast('Add a few courses first, then copy the link.');
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Older browsers, or a page that isn't https: fall back to a temporary text box.
    const box = Object.assign(document.createElement('textarea'), { value: url });
    box.style.cssText = 'position:fixed;opacity:0';
    document.body.append(box);
    box.select();
    const copied = document.execCommand('copy');
    box.remove();
    if (!copied) { prompt('Copy this link:', url); return; }
  }
  toast(`Link copied (${count} course${count > 1 ? 's' : ''}). Paste it on your other device.`);
}

/* ---------- After the course data has loaded ---------- */

// A saved plan can mention courses or sections that are no longer in the data (the file changed). Drop or repair those.
function prunePlan() {
  QUARTERS.forEach((q) => {
    plan[q.id] = (Array.isArray(plan[q.id]) ? plan[q.id] : []).filter((item) => {
      const course = findCourse(item.code);
      return course && isOffered(course, q.id);
    }).map((item) => {
      const offering = findCourse(item.code).offerings[q.id];
      const inRange = (n, list) => (Number.isInteger(n) && n >= 0 && n < (list?.length || 0) ? n : 0);
      return { ...item, lecture: inRange(item.lecture, offering.lectures), discussion: inRange(item.discussion, offering.discussions) };
    });
  });
}

// Anything computed from the course list has to be redone when the list changes.
function afterCoursesLoaded() {
  similarityVectors = null;
  prunePlan();
}
