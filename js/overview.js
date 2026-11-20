/* ---------- Small visual helpers ---------- */

function sparkline(ratings) {
  if (ratings.length < 2) return '';
  const points = ratings.map((value, i) => {
    const x = (i / (ratings.length - 1)) * 96 + 2;
    const y = 26 - ((value - 2.5) / 2.5) * 24;
    return `${x},${y}`;
  }).join(' ');
  return `<svg viewBox="0 0 100 28" width="100%" height="34">
    <polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${points}"/></svg>`;
}

function pinFor(room) {
  if (!room) return null;
  const key = Object.keys(BUILDING_PINS).find((k) =>
    /^\d/.test(k) ? room.split('-')[0] === k : room.includes(k)
  );
  return key ? BUILDING_PINS[key] : null;
}

function mapHTML(course) {
  const pins = new Map();
  Object.values(course.offerings).forEach((o) => {
    [...o.lectures, ...(o.discussions || [])].forEach((m) => {
      const pin = pinFor(m.room);
      if (pin) pins.set(m.room, pin);
    });
  });
  if (!pins.size) return '<div class="detail muted">No room locations on file, so no map.</div>';

  const markers = [...pins].map(([room, [x, y]]) => `
    <circle cx="${x}" cy="${y}" r="2.4" fill="var(--accent)"/>
    <text x="${x + 3.5}" y="${y + 1.5}" font-size="3.6" fill="var(--ink)">${room.length > 14 ? room.slice(0, 14) + '…' : room}</text>`
  ).join('');

  return `
    <h4>Where on campus <span class="muted">(schematic sketch, not to scale)</span></h4>
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
      <div class="stat"><b>${rating ? '★ ' + rating : 'n/a'}</b>latest rating${course.ratings.length > 1 ? ` (${course.ratings.length} terms)` : ''}</div>
      <div class="stat"><b>${course.ways ? course.ways.map((w) => 'WAY-' + w).join(', ') : 'None'}</b>${course.ger ? 'GER:' + course.ger : 'requirements'}</div>
    </div>

    <p>${course.description}</p>
    ${course.prereqs ? `<div class="detail"><b>Prerequisites:</b> ${course.prereqs}</div>` : ''}
    ${course.application ? '<div class="detail"><b>Application required</b> for enrollment.</div>' : ''}
    ${sparkline(course.ratings) ? '<h4>Rating history</h4>' + sparkline(course.ratings) : ''}

    <h4>Add to a quarter</h4><div>${addButtons}</div>
    <h4>Sections</h4>${sectionsHTML(course)}
    ${mapHTML(course)}`;

  $('#overlay').hidden = false;
}

const closeOverview = () => ($('#overlay').hidden = true);

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
  $('#compare-results').innerHTML = matches.map(comparePickHTML).join('') || '<div class="empty">No courses match.</div>';
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
// estA / estB: the value is a stand-in (shown as "n/a (≈ x est.)", bar striped)
function compareBars(label, a, b, max, format, estA = false, estB = false) {
  const show = (v, est) => (v == null ? 'n/a' : est ? `n/a (≈ ${format(v)} est.)` : format(v));
  const width = (v) => Math.min(100, ((v || 0) / max) * 100);
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
  const quarterCount = (c) => Object.keys(c.offerings).length;
  const history = (c) => sparkline(c.ratings) || '<span class="muted">no rating history</span>';

  $('#compare-slot').innerHTML = `
    <div class="stat compare">
      <div class="cmp-head">
        <div class="cmp-course left"><b>${a.code}</b><span>${a.title}</span></div>
        <div class="cmp-course right"><b>${b.code}</b><span>${b.title}</span></div>
      </div>
      ${compareBars('Units', a.units, b.units, 5, plain)}
      ${compareBars('Hours per week', effectiveHours(a), effectiveHours(b), 10, fixed1, hoursEstimated(a), hoursEstimated(b))}
      ${compareBars('Latest rating', latestRating(a), latestRating(b), 5, fixed1)}
      ${compareBars('Quarters offered', quarterCount(a), quarterCount(b), 4, plain)}
      <div class="cmp-row">
        <div class="cmp-label">Rating history</div>
        <div class="cmp-side left">${history(a)}</div>
        <div class="cmp-side right">${history(b)}</div>
      </div>
      <div class="cmp-comments">
        ${compareComments(a, b).map((text) => `<div class="comment">${text}</div>`).join('')}
      </div>
    </div>`;
}
