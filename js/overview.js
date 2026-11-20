/* ---------- Small visual helpers ---------- */

/* ---------- Rating history chart ---------- */

const TERM_NAMES = { A: 'Autumn', W: 'Winter', S: 'Spring', Su: 'Summer' };
const TERM_ORDER = { A: 0, W: 1, S: 2, Su: 3 };
const TERM_CODE = /^(Su|A|W|S)(\d\d)$/;

// "W19" -> a position in time (Autumn 2016 = 0, Winter 2017 = 1, ...). Academic years start in Autumn.
function termIndex(code) {
  const m = TERM_CODE.exec(code || '');
  if (!m) return null;
  const year = 2000 + Number(m[2]);
  return ((m[1] === 'A' ? year : year - 1) - 2000) * 4 + TERM_ORDER[m[1]];
}

function termName(code) {
  const m = TERM_CODE.exec(code || '');
  return m ? `${TERM_NAMES[m[1]]} 20${m[2]}` : (code || '');
}

// Average rating per quarter on a fixed 2-5 scale, so two courses can be compared by eye.
// Points sit at their real position in time, so a missing quarter shows up as a gap.
function ratingChartHTML(course, { compact = false, color = 'var(--accent)' } = {}) {
  const ratings = course.ratings;
  if (!ratings.length) return '';

  const W = compact ? 300 : 640;
  const H = compact ? 120 : 160;
  const pad = { l: 26, r: 22, t: 16, b: 24 };
  const yMin = 2;
  const yMax = 5;

  const indexes = ratings.map((_, i) => termIndex(course.ratingTerms?.[i]));
  const positions = indexes.every((v) => v != null) ? indexes : ratings.map((_, i) => i);
  const lo = Math.min(...positions);
  const hi = Math.max(...positions);
  const x0 = pad.l + 8;
  const x1 = W - pad.r;
  const xAt = (p) => (hi === lo ? (x0 + x1) / 2 : x0 + ((p - lo) / (hi - lo)) * (x1 - x0));
  const yAt = (v) => pad.t + (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  const pts = ratings.map((v, i) => ({ v, x: xAt(positions[i]), y: yAt(v), code: course.ratingTerms?.[i] }));
  const last = pts[pts.length - 1];

  const grid = [2, 3, 4, 5].map((v) => `
    <line x1="${pad.l}" x2="${W - 8}" y1="${yAt(v)}" y2="${yAt(v)}" stroke="var(--line)" stroke-width="1"/>
    <text x="${pad.l - 6}" y="${yAt(v) + 3.5}" font-size="10" text-anchor="end" fill="var(--muted)">${v}</text>`).join('');

  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const base = yAt(yMin);
  const area = pts.length > 1
    ? `<path d="M${pts[0].x.toFixed(1)},${base} L${line.replaceAll(' ', ' L')} L${last.x.toFixed(1)},${base} Z" fill="${color}" fill-opacity=".12"/>
       <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    : '';

  const dots = pts.map((p, i) => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3.4}"
            fill="${i === pts.length - 1 ? color : 'var(--panel)'}" stroke="${color}" stroke-width="2">
      <title>${termName(p.code) || 'Rating ' + (i + 1)}: ${p.v}</title>
    </circle>`).join('');

  // Quarter codes under the dots; skip any that would collide, but always keep the first and the last.
  const gap = compact ? 30 : 34;
  const labelled = [];
  pts.forEach((p) => { if (p.code && (!labelled.length || p.x - labelled[labelled.length - 1].x >= gap)) labelled.push(p); });
  if (last.code && labelled[labelled.length - 1] !== last) {
    if (labelled.length && last.x - labelled[labelled.length - 1].x < gap) labelled.pop();
    labelled.push(last);
  }
  const xLabels = labelled.map((p) =>
    `<text x="${p.x.toFixed(1)}" y="${H - 7}" font-size="10" text-anchor="middle" fill="var(--muted)">${p.code}</text>`).join('');

  const latest = `<text x="${last.x.toFixed(1)}" y="${(last.y - 9).toFixed(1)}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink)">${last.v}</text>`;

  return `<svg class="rating-chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Rating history: ${ratings.length} quarter${ratings.length > 1 ? 's' : ''}, latest ${last.v} out of 5">
    ${grid}${area}${dots}${latest}${xLabels}
  </svg>`;
}

/* ---------- Where on campus ---------- */

// Which building a room string belongs to. "460-334" matches by building number, "Hewlett 200" by name.
const buildingKey = (room) => (room
  ? Object.keys(BUILDING_GEO).find((k) => (/^\d/.test(k) ? room.split('-')[0] === k : room.includes(k)))
  : null);

// Buildings used by a course, with the rooms in each and whether they are lectures or discussions.
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
      const geo = BUILDING_GEO[key];
      const group = groups.get(geo.name) || { geo, rooms: new Map() };
      if (!group.rooms.has(m.room) || kind === 'lecture') group.rooms.set(m.room, kind);
      groups.set(geo.name, group);
    });
  });
  return [...groups.values()];
}

function mapSectionHTML(course) {
  const buildings = buildingsFor(course);
  if (!buildings.length) {
    return '<h4>Where on campus</h4><div class="detail muted">No room locations on file yet, so no map.</div>';
  }
  const kinds = new Set(buildings.flatMap((b) => [...b.rooms.values()]));
  const legend = [
    kinds.has('lecture') && '<span class="pin on"></span>lecture',
    kinds.has('discussion') && '<span class="pin"></span>discussion sections',
  ].filter(Boolean).join(' ');
  const missingRoom = Object.values(course.offerings).some((o) => o.lectures.some((m) => !m.room));

  return `<h4>Where on campus</h4>
    <div id="course-map" class="course-map" role="region" aria-label="Map of this course’s rooms"></div>
    <div class="map-note">${legend} · click a pin for rooms and walking directions${missingRoom ? ' · some meetings have no room yet' : ''}</div>`;
}

// ---- Live map: Leaflet + OpenStreetMap data, loaded only when a map is first needed ----

const LEAFLET = {
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  jsHash: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  cssHash: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
// Tile style follows the theme. Swap for https://tile.openstreetmap.org/{z}/{x}/{y}.png if you prefer plain OSM.
const TILE_STYLE = { midnight: 'dark_all', cozy: 'rastertiles/voyager' };

let leafletReady = null;
let courseMap = null;
let mapToken = 0;

function loadLeaflet() {
  leafletReady ||= new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = document.createElement('link');
    Object.assign(css, { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssHash, crossOrigin: 'anonymous' });
    document.head.append(css);
    const script = document.createElement('script');
    Object.assign(script, { src: LEAFLET.js, integrity: LEAFLET.jsHash, crossOrigin: 'anonymous' });
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet missing')));
    script.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.append(script);
  }).catch((error) => { leafletReady = null; throw error; });
  return leafletReady;
}

const stanfordMapUrl = (query) => `https://campus-map.stanford.edu/?srch=${encodeURIComponent(query)}`;
const walkingUrl = ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

function popupHTML({ geo, rooms }) {
  const list = [...rooms];
  const rows = list.slice(0, 8).map(([room, kind]) =>
    `<a href="${stanfordMapUrl(room)}" target="_blank" rel="noopener">${room}</a> <span class="muted">${kind}</span>`
  ).join('<br>');
  const more = list.length > 8 ? `<br><span class="muted">+${list.length - 8} more rooms</span>` : '';
  return `<b>${geo.name}</b><br>${rows}${more}<br>
    <a href="${walkingUrl(geo)}" target="_blank" rel="noopener">Walking directions ↗</a>`;
}

function destroyCourseMap() {
  mapToken += 1; // anything still loading belongs to a screen that is gone
  if (courseMap) { courseMap.remove(); courseMap = null; }
}

async function renderCourseMap(course) {
  const box = $('#course-map');
  if (!box) return;
  const token = ++mapToken;
  const buildings = buildingsFor(course);

  try {
    const L = await loadLeaflet();
    if (token !== mapToken || !box.isConnected) return;

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#8c1515';
    const panel = styles.getPropertyValue('--panel').trim() || '#ffffff';
    const tiles = TILE_STYLE[document.documentElement.dataset.theme] || 'light_all';

    courseMap = L.map(box, { scrollWheelZoom: false, dragging: !L.Browser.mobile, zoomSnap: 0.5 });
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${tiles}/{z}/{x}/{y}{r}.png`, {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(courseMap);

    courseMap.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

    const markers = buildings.map((b) => {
      const hasLecture = [...b.rooms.values()].includes('lecture');
      const marker = L.circleMarker([b.geo.lat, b.geo.lng], {
        radius: 9, weight: 3, color: accent, fillColor: hasLecture ? accent : panel, fillOpacity: 1,
      }).addTo(courseMap).bindPopup(popupHTML(b));
      return { marker, label: b.geo.short, at: [b.geo.lat, b.geo.lng] };
    });

    // Names sit on the pins when there is room for them. In a crowded cluster they would overlap,
    // so there they show on hover until the map is zoomed in far enough.
    let labelsShown = null;
    const syncLabels = () => {
      const show = markers.length <= 5 || courseMap.getZoom() >= 17.5;
      if (show === labelsShown) return;
      labelsShown = show;
      markers.forEach(({ marker, label }) => {
        marker.unbindTooltip().bindTooltip(label, { permanent: show, direction: 'top', offset: [0, -8], className: 'map-label' });
      });
    };

    const points = markers.map((m) => m.at);
    if (points.length === 1) courseMap.setView(points[0], 17);
    else courseMap.fitBounds(points, { padding: [44, 44], maxZoom: 17 });
    syncLabels();
    courseMap.on('zoomend', syncLabels);
    setTimeout(() => courseMap?.invalidateSize(), 0);
  } catch {
    if (token !== mapToken || !box.isConnected) return;
    box.classList.add('offline');
    box.innerHTML = `<div class="detail muted">Couldn’t load the live map (are you offline?), so here is a rough sketch instead.</div>${schematicMapHTML(course)}`;
  }
}

// Offline fallback: the old hand-drawn sketch. Positions are made up, not real.
function pinFor(room) {
  const key = buildingKey(room);
  return key ? BUILDING_PINS[key] : null;
}

function schematicMapHTML(course) {
  const pins = new Map();
  Object.values(course.offerings).forEach((o) => {
    [...o.lectures, ...(o.discussions || [])].forEach((m) => {
      const pin = pinFor(m.room);
      if (pin) pins.set(m.room, pin);
    });
  });
  if (!pins.size) return '';

  const markers = [...pins].map(([room, [x, y]]) => `
    <circle cx="${x}" cy="${y}" r="2.4" fill="var(--accent)"/>
    <text x="${x + 3.5}" y="${y + 1.5}" font-size="3.6" fill="var(--ink)">${room.length > 14 ? room.slice(0, 14) + '…' : room}</text>`
  ).join('');

  return `
    <svg viewBox="0 0 100 80" width="100%" style="border:1px solid var(--line);border-radius:6px;background:var(--wash)">
      <rect x="16" y="20" width="36" height="34" rx="3" fill="var(--line)"/>
      <text x="34" y="37" font-size="4" fill="var(--muted)" text-anchor="middle">Main Quad</text>
      <ellipse cx="40" cy="72" rx="16" ry="5" fill="var(--line)"/>
      ${markers}
    </svg>`;
}

/* ---------- Overview ---------- */

function sectionsHTML(course) {
  const rows = QUARTERS.filter((q) => isOffered(course, q.id)).map((q) => {
    const { lectures, discussions: discs } = course.offerings[q.id];
    const times = lectures
      .map((m) => `${dayList(m.days)} ${formatTime(m.start)}–${formatTime(m.end)}, ${m.room || 'room TBA'}, ${m.instructor || 'TBA'}`)
      .join('; ') || 'Times TBA';
    return `<div class="detail"><b>${q.name}:</b> ${times}${discs ? ` · ${discs.length} discussion sections` : ''}</div>`;
  });
  return rows.join('') || '<div class="detail muted">None</div>';
}

function openOverview(code) {
  const course = findCourse(code);
  ui.openCourse = course;
  destroyCourseMap();
  const rating = latestRating(course);

  const addButtons = QUARTERS
    .filter((q) => isOffered(course, q.id))
    .map((q) => `<button data-add="${q.id}">+ ${q.name}</button> `)
    .join('') || '<span class="muted">Not offered in 2021–22.</span>';

  $('#overlay-body').innerHTML = `
    <h2>${course.code}: ${course.title}${wayTags(course)}
      <button id="compare-btn" title="Compare with another course">⚖ Compare</button></h2>
    <div class="muted">${course.alsoListedAs ? 'Also listed as ' + course.alsoListedAs : ''}</div>
    <div id="compare-slot"></div>

    <div class="grid-2" style="margin:10px 0">
      <div class="stat"><b>${course.units}</b>units · ${course.grading}</div>
      <div class="stat"><b>${course.hours != null ? `~${course.hours} h/wk` : 'n/a'}</b>average weekly workload</div>
      <div class="stat"><b>${rating ? starsHTML(rating) + ' ' + rating : 'n/a'}</b>latest rating${course.ratings.length > 1 ? ` (${course.ratings.length} terms)` : ''}</div>
      <div class="stat"><b>${course.ways ? course.ways.map((w) => 'WAY-' + w).join(', ') : 'None'}</b>${course.ger ? 'GER:' + course.ger : 'requirements'}</div>
    </div>

    <p>${course.description}</p>
    ${course.prereqs ? `<div class="detail"><b>Prerequisites:</b> ${course.prereqs}</div>` : ''}
    ${course.application ? '<div class="detail"><b>Application required</b> for enrollment.</div>' : ''}
    ${course.ratings.length ? '<h4>Rating history <span class="muted">by quarter, out of 5</span></h4>' + ratingChartHTML(course) : ''}

    ${similarHTML(course)}

    <h4>Add to a quarter</h4><div>${addButtons}</div>
    <h4>Sections</h4>${sectionsHTML(course)}
    ${mapSectionHTML(course)}`;

  $('#overlay').hidden = false;
  $('#overlay-card').scrollTop = 0;
  renderCourseMap(course);
}

function closeOverview() {
  $('#overlay').hidden = true;
  destroyCourseMap();
}

function similarHTML(course) {
  const list = similarCourses(course);
  if (!list.length) return '';
  return `<h4>Similar courses</h4>
    <div class="similar">${list.map(({ course: c, why }) => `
      <div class="pick" data-open="${c.code}" tabindex="0">
        <span class="pick-title"><b>${c.code}</b> ${c.title}</span>
        <span class="pick-meta">${why ? why + ' · ' : ''}${statsText(c)}</span>
        <button data-compare="${c.code}" title="Compare with ${c.code}">⚖ Compare</button>
      </div>`).join('')}
    </div>`;
}

/* ---------- Compare ---------- */

function comparePickHTML(course) {
  return `
    <button class="pick" data-compare="${course.code}">
      <span class="pick-title"><b>${course.code}</b> ${course.title}</span>
      <span class="pick-meta">${statsText(course)} <span class="pick-q">${quarterTagsHTML(course)}</span></span>
    </button>`;
}

function renderCompareResults() {
  const query = ($('#compare-search')?.value || '').trim().toLowerCase();
  const matches = COURSES
    .filter((c) => c !== ui.openCourse)
    .filter((c) => !query || `${c.code} ${c.title} ${c.description}`.toLowerCase().includes(query))
    .sort(SORTERS.code);

  const similar = similarCourses(ui.openCourse).map((s) => s.course);
  const top = similar.filter((c) => matches.includes(c)); // keeps best-match-first order
  const rest = matches.filter((c) => !similar.includes(c));

  const group = (label, list) => `<div class="pick-group">${label}</div>${list.map(comparePickHTML).join('')}`;
  $('#compare-results').innerHTML = !matches.length
    ? '<div class="empty">No courses match.</div>'
    : top.length && rest.length
      ? group(`Similar to ${ui.openCourse.code}`, top) + group('All other courses', rest)
      : matches.map(comparePickHTML).join('');
}

function showComparePicker() {
  $('#compare-slot').innerHTML = `
    <div class="compare-picker">
      <input type="search" id="compare-search" placeholder="Compare with… search title, code or topic" autocomplete="off">
      <div id="compare-results"></div>
    </div>`;
  renderCompareResults();
  $('#compare-search').focus();
}

// One row, one course per side, bars growing out from a centre line.
// estA / estB: the value is a stand-in (shown as "n/a (≈ x est.)", bar striped).
// invert: a bigger value gives a SHORTER bar (used for hours: lighter is longer).
function compareBars(label, a, b, max, format, estA = false, estB = false, invert = false) {
  const show = (v, est) => (v == null ? 'n/a' : est ? `n/a (≈ ${format(v)} est.)` : format(v));
  const width = (v) => {
    if (v == null) return 0;
    const share = Math.min(1, Math.max(0, v / max));
    return (invert ? Math.max(0.03, 1 - share) : share) * 100;
  };
  return `
    <div class="cmp-row">
      <div class="cmp-label">${label}</div>
      <div class="cmp-side left">
        <span class="cmp-val">${show(a, estA)}</span>
        <div class="bar"><i class="${estA ? 'est' : ''}" style="width:${width(a)}%"></i></div>
      </div>
      <div class="cmp-side right">
        <span class="cmp-val">${show(b, estB)}</span>
        <div class="bar"><i class="secondary ${estB ? 'est' : ''}" style="width:${width(b)}%"></i></div>
      </div>
    </div>`;
}

function compareComments(a, b) {
  const comments = [];
  const [ra, rb] = [latestRating(a), latestRating(b)];

  const [ha, hb] = [effectiveHours(a), effectiveHours(b)];
  const guessed = [a, b].filter(hoursEstimated).map((c) => c.code);
  if (Math.abs(ha - hb) < 0.05) {
    comments.push('Workload looks about the same.');
  } else {
    const heavier = ha > hb ? a : b;
    comments.push(`${heavier.code} is the heavier lift by about ${Math.abs(ha - hb).toFixed(1)} h/wk.`);
  }
  if (guessed.length) {
    comments.push(`No hours data for ${guessed.join(' and ')}, so ${guessed.length > 1 ? 'they are' : 'it is'} estimated at ${HOURS_PER_UNIT} h/wk per unit.`);
  }

  if (ra && rb) {
    comments.push(`${ra >= rb ? a.code : b.code} is rated higher (${Math.max(ra, rb)} vs ${Math.min(ra, rb)}).`);
  }

  const shared = QUARTERS.filter((q) => isOffered(a, q.id) && isOffered(b, q.id));
  comments.push(shared.length
    ? `Both run in ${shared.map((q) => q.name).join(', ')}.`
    : 'They never run in the same quarter, so you can’t take them together this year.');

  shared.forEach((q) => {
    const x = a.offerings[q.id].lectures[0];
    const y = b.offerings[q.id].lectures[0];
    const sameDay = x && y && [...x.days].some((d) => y.days.includes(d));
    if (sameDay && x.start < y.end && y.start < x.end) {
      comments.push(`⚠ Default lecture times overlap in ${q.name}.`);
    }
  });

  comments.push(`Together: ${a.units + b.units} units.`);
  return comments;
}

function showComparison(a, b) {
  const fixed1 = (v) => v.toFixed(1);
  const plain = (v) => v;
  const rated = (v) => `${starsHTML(v)} ${v.toFixed(1)}`;
  const quarterCount = (c) => Object.keys(c.offerings).length;
  const history = (c, color) => (c.ratings.length
    ? ratingChartHTML(c, { compact: true, color })
    : '<span class="muted">no rating history</span>');

  $('#compare-slot').innerHTML = `
    <div class="stat compare">
      <div class="cmp-head">
        <div class="cmp-course left"><b>${a.code}</b><span>${a.title}</span></div>
        <div class="cmp-course right"><b>${b.code}</b><span>${b.title}</span></div>
      </div>
      ${compareBars('Units', a.units, b.units, 5, plain)}
      ${compareBars('Hours per week <span class="cmp-hint">longer bar = lighter</span>', effectiveHours(a), effectiveHours(b), 12, fixed1, hoursEstimated(a), hoursEstimated(b), true)}
      ${compareBars('Latest rating', latestRating(a), latestRating(b), 5, rated)}
      ${compareBars('Quarters offered', quarterCount(a), quarterCount(b), 4, plain)}
      <div class="cmp-row">
        <div class="cmp-label">Rating history <span class="cmp-hint">same 2–5 scale</span></div>
        <div class="cmp-side left">${history(a, 'var(--accent)')}</div>
        <div class="cmp-side right">${history(b, 'var(--accent-2)')}</div>
      </div>
      <div class="cmp-comments">
        ${compareComments(a, b).map((text) => `<div class="comment">${text}</div>`).join('')}
      </div>
    </div>`;
  $('#compare-slot').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
