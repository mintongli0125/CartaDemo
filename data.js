// Raw file: https://github.com/Stanford-Carta/eng-challenge/blob/main/course-data.json
const DATA_URL = 'https://raw.githubusercontent.com/Stanford-Carta/eng-challenge/main/course-data.json';

const QUARTERS = [
  { id: 'A', name: 'Autumn 2021', label: 'A' },
  { id: 'W', name: 'Winter 2022', label: 'W' },
  { id: 'S', name: 'Spring 2022', label: 'S' },
  { id: 'U', name: 'Summer 2022', label: 'Su' },
];

const TERM_TO_QUARTER = { 1222: 'A', 1224: 'W', 1226: 'S', 1228: 'U' }; // stanford_term_id
const DAY_CODES = { Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'R', Friday: 'F' };
const DAY_NAMES = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };
const ALL_WAYS = ['A-II', 'AQR', 'CE', 'EDP', 'ER', 'FR', 'SI', 'SMA'];
const COLORS = ['#8c1515', '#2a6f97', '#2e7d32', '#b8860b', '#6a4c93', '#c2185b', '#00838f', '#e65100'];
const UNIT_LIMIT = 20;

// Schematic campus positions (x, y on a 100x80 grid). Not real coordinates.
const BUILDING_PINS = {
  '460': [24, 40], '200': [40, 32], '160': [34, 26], '260': [38, 48],
  '320': [50, 58], '80': [30, 50], '30': [44, 42], '50': [20, 56],
  Bishop: [56, 20], Hewlett: [64, 40], Cemex: [86, 14],
  STLC: [14, 66], Shriram: [72, 58], Lathrop: [22, 24],
};

/*
  App model (built from the raw JSON by normalizeCourse):
  {
    code, title, units, hours, grading, ratings: [oldest..newest], description,
    prereqs?, application?, ways?, ger?, alsoListedAs?,
    offerings: { [quarterId]: { lectures: [meeting], discussions?: [meeting], tba?: true } }
  }
  meeting = { days: 'MW', start: minutes, end: minutes, room, instructor }
*/
let COURSES = [];

function parseClock(text) {
  const [, hour, min, period] = text.match(/(\d+):(\d+):\d+\s*(AM|PM)/);
  return ((Number(hour) % 12) + (period === 'PM' ? 12 : 0)) * 60 + Number(min);
}

// Discussion rooms live in the notes field ("Room 160-318." / "Rm Lathrop 290.")
const roomFromNotes = (notes) => notes?.match(/^R(?:oom|m)\s+(.+?)\.?$/)?.[1] ?? null;
const personNames = (people) => people.map((p) => p.name).join(', ');

function toMeetings(offering) {
  return offering.schedules
    .filter((s) => s.start_time && s.end_time)
    .map((s) => ({
      days: s.days.map((d) => DAY_CODES[d]).filter(Boolean).join(''),
      start: parseClock(s.start_time),
      end: parseClock(s.end_time),
      room: s.location || roomFromNotes(offering.notes),
      instructor: personNames(s.primary_instructors.length ? s.primary_instructors : s.instructors) || null,
    }));
}

const byDayThenTime = (a, b) =>
  'MTWRF'.indexOf(a.days[0]) - 'MTWRF'.indexOf(b.days[0]) || a.start - b.start;

function buildOfferings(rawOfferings) {
  const result = {};
  rawOfferings.forEach((o) => {
    const quarterId = TERM_TO_QUARTER[o.term.stanford_term_id];
    if (!quarterId || /cancelled/i.test(o.notes || '')) return;

    const slot = (result[quarterId] ||= { lectures: [] });
    const meetings = toMeetings(o);
    if (o.component === 'DIS') (slot.discussions ||= []).push(...meetings);
    else slot.lectures.push(...meetings);
  });

  Object.values(result).forEach((slot) => {
    slot.discussions?.sort(byDayThenTime);
    if (!slot.lectures.length) slot.tba = true;
  });
  return result;
}

// One rating per term (co-instructors share the same score in the raw data)
function ratingHistory(ratings) {
  const byTerm = new Map();
  ratings.forEach((r) => byTerm.set(r.term.stanford_term_id, Number(r.average_rating)));
  return [...byTerm].sort((a, b) => a[0] - b[0]).map(([, rating]) => rating);
}

function normalizeCourse(raw) {
  const code = raw.course_codes.find((c) => c.startsWith('CS ')) ?? raw.course_codes[0];
  const others = raw.course_codes.filter((c) => c !== code);
  const ways = raw.general_requirements.filter((r) => r.startsWith('WAY-')).map((r) => r.slice(4));
  const ger = raw.general_requirements.find((r) => r.startsWith('GER:'))?.slice(4).replace(/,$/, '');
  const notes = raw.offerings.map((o) => o.notes || '').join(' ');

  return {
    code,
    title: raw.title,
    units: raw.min_units,
    hours: raw.average_hours_spent ? Number(raw.average_hours_spent) : null,
    grading: raw.grading.replace('Satisfactory/No Credit', 'S/NC').replace('Credit/No Credit', 'CR/NC'),
    ratings: ratingHistory(raw.ratings),
    description: raw.description,
    prereqs: raw.description.match(/Prerequisites?:\s*(.+?)(?:\.\s|\.$|$)/)?.[1],
    application: /\bapplication\b|\bto apply\b/i.test(raw.description + ' ' + notes),
    ways: ways.length ? ways : undefined,
    ger,
    alsoListedAs: others.length ? others.join(', ') : undefined,
    offerings: buildOfferings(raw.offerings),
  };
}

async function loadCourses() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  COURSES = (await response.json()).map(normalizeCourse);
}
