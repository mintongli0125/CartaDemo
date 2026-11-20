const HOUR_PX = 22;
const DAY_START = 8 * 60;
const VISIBLE_HOURS = 13;
const HOURS_LIMIT = 40; // full bar on the hours meter

function meterHTML(label, valueText, percent, barClass = '') {
  return `
    <div>
      <label><span>${label}</span><span>${valueText}</span></label>
      <div class="bar"><i class="${barClass}" style="width:${Math.min(100, percent)}%"></i></div>
    </div>`;
}

function blockHTML(block, isConflict) {
  const { item, start, end, room, isDiscussion } = block;
  const top = ((Math.max(start, DAY_START) - DAY_START) / 60) * HOUR_PX;
  const height = ((end - start) / 60) * HOUR_PX - 1;
  const classes = ['block', isDiscussion && 'discussion', isConflict && 'conflict'].filter(Boolean).join(' ');

  return `
    <div class="${classes}" data-open="${item.code}"
         style="top:${top}px;height:${height}px;background:${item.color}"
         title="${item.code} ${formatTime(start)}–${formatTime(end)}">
      ${item.code}${isDiscussion ? ' disc.' : ''}${wayTags(findCourse(item.code))}
      <small>${room || 'Room TBA'}</small>
    </div>`;
}

function calendarHTML(blocks, conflicts) {
  const dayHeads = Object.values(DAY_NAMES).map((name) => `<div class="day-head">${name}</div>`).join('');
  const hourLabels = Array.from({ length: VISIBLE_HOURS }, (_, i) =>
    `<div>${formatTime(DAY_START + i * 60).replace(/am|pm/, '')}</div>`
  ).join('');
  const columns = Object.keys(DAY_NAMES).map((day) => {
    const inner = blocks
      .map((block, i) => (block.day === day ? blockHTML(block, conflicts.has(i)) : ''))
      .join('');
    return `<div class="day-col">${inner}</div>`;
  }).join('');

  return `<div class="calendar"><div></div>${dayHeads}<div class="hour-labels">${hourLabels}</div>${columns}</div>`;
}

function courseRowHTML(item, index, quarterId) {
  const course = findCourse(item.code);
  const offering = course.offerings[quarterId];
  const ref = `${quarterId},${index}`;

  const lectureChoices = offering.lectures.length > 1
    ? offering.lectures.map((l, i) => `
        <label>
          <input type="radio" name="lecture-${quarterId}-${index}" data-lecture="${ref},${i}" ${item.lecture === i ? 'checked' : ''}>
          ${l.days} ${formatTime(l.start)}
        </label>`).join('')
    : '';

  const discussionChoices = offering.discussions
    ? `<select data-discussion="${ref}" title="Discussion section">
        ${offering.discussions.map((d, i) => `
          <option value="${i}" ${item.discussion === i ? 'selected' : ''}>
            Disc ${d.days} ${formatTime(d.start)}${d.room ? ' · ' + d.room : ''}
          </option>`).join('')}
      </select>`
    : '';

  const hoursText = course.hours != null ? `~${course.hours} h/wk` : `no hours data (est. ~${effectiveHours(course)} h/wk)`;

  return `
    <div class="row">
      <input type="color" value="${item.color}" data-color="${ref}" title="Change colour">
      <a data-open="${course.code}">${course.code}</a>${wayTags(course)}
      <span class="meta">${course.units}u · ${hoursText}${offering.tba ? ' · times TBA' : ''}</span>
      ${lectureChoices}${discussionChoices}
      <button data-delete="${ref}" title="Remove">✕</button>
    </div>`;
}

// Where this quarter's lectures and chosen discussion sections are: one dot per course per building,
// in the course's calendar colour. Filled = a lecture is there, ring = only a discussion section.
function quarterMapHTML(items, quarterId) {
  const byBuilding = new Map();
  const unplaced = [];

  items.forEach((item) => {
    let placed = false;
    selectedMeetings(item, quarterId).forEach((m) => {
      const key = buildingKey(m.room);
      if (!key) return;
      placed = true;
      const pin = BUILDING_PINS[key];
      const building = byBuilding.get(pin.name) || { pin, entries: new Map() };
      const entry = building.entries.get(item.code) || { item, rooms: new Set(), lecture: false };
      entry.rooms.add(m.room);
      if (!m.isDiscussion) entry.lecture = true;
      building.entries.set(item.code, entry);
      byBuilding.set(pin.name, building);
    });
    if (!placed) unplaced.push(item.code);
  });

  if (!byBuilding.size) {
    return `<div class="map-empty muted">No rooms known yet for ${unplaced.join(', ')}, so no map.</div>`;
  }

  const points = [...byBuilding.values()].flatMap(({ pin, entries }) => {
    const list = [...entries.values()];
    return list.map((entry, i) => ({
      x: pin.x,
      y: pin.y,
      color: entry.item.color,
      hollow: !entry.lecture,
      dx: (i - (list.length - 1) / 2) * 12, // courses sharing a building sit side by side
      open: entry.item.code,
      title: `${entry.item.code} · ${pin.name}\n${[...entry.rooms].join(', ')}`,
    }));
  });

  return `<div class="quarter-map">
    ${campusMapHTML(points, { ratio: 4 / 3 })}
    <div class="map-note"><span class="pin on"></span>lecture <span class="pin"></span>discussion${unplaced.length ? ` · no room yet: ${unplaced.join(', ')}` : ''}</div>
    <div class="map-note">${mapCreditHTML()}</div>
  </div>`;
}

function quarterHTML({ id, name }) {
  const items = plan[id];
  const blocks = collectBlocks(items, id);
  const conflicts = findConflicts(blocks);
  const conflictingCourses = new Set([...conflicts].map((i) => blocks[i].itemIndex)).size;

  const units = items.reduce((sum, i) => sum + findCourse(i.code).units, 0);
  const courses = items.map((i) => findCourse(i.code));
  const hours = courses.reduce((sum, c) => sum + effectiveHours(c), 0);
  const estimatedCount = courses.filter(hoursEstimated).length;

  const unitsText = `${units} / ${UNIT_LIMIT}${units > UNIT_LIMIT ? ` (+${units - UNIT_LIMIT})` : ''}`;
  const hoursText = `~${hours.toFixed(1)}${estimatedCount ? ` (${estimatedCount} estimated at ${HOURS_PER_UNIT} h/unit)` : ''}`;

  const status = conflictingCourses
    ? `<span class="conflict-note">⚠ ${conflictingCourses} course${conflictingCourses > 1 ? 's' : ''} in conflict</span>`
    : `<span class="muted">${items.length ? 'No conflicts' : ''}</span>`;

  const mapBlock = items.length ? quarterMapHTML(items, id) : '';
  const dropState = ui.draggingCode
    ? (isOffered(findCourse(ui.draggingCode), id) ? 'accepts' : 'rejects')
    : '';

  return `
    <section class="quarter ${dropState}" data-quarter="${id}">
      <div class="quarter-head"><b>${name}</b>${status}</div>
      <div class="meters">
        ${meterHTML('Units', unitsText, (units / UNIT_LIMIT) * 100, units > UNIT_LIMIT ? 'over' : '')}
        ${meterHTML('Hours / week', hoursText, (hours / HOURS_LIMIT) * 100, hours > HOURS_LIMIT ? 'secondary over' : 'secondary')}
      </div>
      ${calendarHTML(blocks, conflicts)}
      <div class="quarter-lower ${mapBlock.startsWith('<div class="quarter-map"') ? 'with-map' : ''}">
        <div class="rows">
          ${items.map((item, i) => courseRowHTML(item, i, id)).join('') || '<div class="empty">Drag a course here</div>'}
        </div>
        ${mapBlock}
      </div>
    </section>`;
}

function renderWays() {
  const fulfilled = waysFulfilled();
  const chips = ALL_WAYS.map((way) => {
    const codes = fulfilled[way] ? [...fulfilled[way]] : null;
    return `<span class="chip ${codes ? 'met' : ''}" title="${codes ? codes.join(', ') : 'Not yet'}">
      ${way}${codes ? ' · ' + codes.join(', ') : ''}
    </span>`;
  }).join('');

  $('#ways').innerHTML = `<b>WAYS fulfilled: ${Object.keys(fulfilled).length} / ${ALL_WAYS.length}</b><div class="chips">${chips}</div>`;
}

function renderPlanner() {
  $('#quarters').innerHTML = QUARTERS.map(quarterHTML).join('');
  renderWays();
  savePlan();
}
