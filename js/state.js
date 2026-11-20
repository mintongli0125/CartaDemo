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
  if (h > H) { h = H; w = h * ratio; }

  const cx = points.length ? (minX + maxX) / 2 : W / 2;
  const cy = points.length ? (minY + maxY) / 2 : H / 2;
  return { x: Math.min(W - w, Math.max(0, cx - w / 2)), y: Math.min(H - h, Math.max(0, cy - h / 2)), w, h };
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

// points: [{ x, y, color?, hollow?, label?, title?, open?, dx? }], x and y in % of the picture.
// Draws the picture zoomed onto the pins and sticks a pin on each. Size and position are set inline on purpose,
// so the map keeps its size and its pins even if styles.css is stale or cached.
function campusMapHTML(points, { ratio = 1.5, minWidth, pad, maxWidth = 340, pinWidth = 22 } = {}) {
  const W = CAMPUS_MAP.width;
  const H = CAMPUS_MAP.height;
  const win = mapWindow(points, ratio, { minWidth, pad });
  const pinHeight = Math.round((pinWidth * 32) / 24);

  // Alternate name tags above and below the pin so neighbours do not sit on top of each other.
  points.filter((p) => p.label).sort((a, b) => a.x - b.x).forEach((p, i) => { p.place = i % 2 ? 'below' : 'above'; });

  const box = `position:relative;overflow:hidden;isolation:isolate;width:100%;max-width:${maxWidth}px;aspect-ratio:${ratio};`
    + 'background:var(--wash,#eee);border:1px solid var(--line,#ddd);border-radius:8px;';
  const img = `position:absolute;display:block;max-width:none;height:auto;width:${((W / win.w) * 100).toFixed(2)}%;`
    + `left:${((-win.x / win.w) * 100).toFixed(2)}%;top:${((-win.y / win.h) * 100).toFixed(2)}%;user-select:none;`;
  const tag = (place) => 'position:absolute;left:50%;transform:translateX(-50%);padding:2px 5px;white-space:nowrap;pointer-events:none;'
    + 'font:600 10px/1.1 var(--font,sans-serif);color:#222;background:#fff;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.35);'
    + (place === 'below' ? 'top:calc(100% + 3px);' : 'bottom:calc(100% + 3px);');

  // Lower pins are drawn on top of higher ones, like a real map.
  const pins = [...points].sort((a, b) => a.y - b.y).map((p, i) => {
    const left = ((((p.x / 100) * W - win.x) / win.w) * 100).toFixed(2);
    const top = ((((p.y / 100) * H - win.y) / win.h) * 100).toFixed(2);
    return `<span class="pin-marker" ${p.open ? `data-open="${attr(p.open)}"` : ''} title="${attr(p.title)}"
        style="position:absolute;left:${left}%;top:${top}%;width:${pinWidth}px;height:${pinHeight}px;z-index:${i + 1};cursor:pointer;`
      + `transform:translate(calc(-50% + ${p.dx || 0}px),-100%)">${pinSVG(p.color || 'var(--accent)', p.hollow, pinWidth)}`
      + `${p.label ? `<b style="${tag(p.place)}">${p.label}</b>` : ''}</span>`;
  }).join('');

  const missing = "this.parentNode.innerHTML='<div style=&quot;display:grid;place-items:center;height:100%;padding:8px;text-align:center;font-size:11px&quot;>Map picture not found: add img/campus-map.webp</div>'";
  return `<div class="campus-map" style="${box}">
    <img src="${CAMPUS_MAP.src}" alt="Stanford campus map" draggable="false" style="${img}" onerror="${missing}">${pins}</div>`;
}

const mapCreditHTML = () =>
  `Map: <a href="${CAMPUS_MAP.source}" target="_blank" rel="noopener">${CAMPUS_MAP.credit}</a>`;
