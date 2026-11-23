const QUARTERS = [
  { id: 'A', name: 'Autumn 2021', label: 'A', termId: 1222 },
  { id: 'W', name: 'Winter 2022', label: 'W', termId: 1224 },
  { id: 'S', name: 'Spring 2022', label: 'S', termId: 1226 },
  { id: 'U', name: 'Summer 2022', label: 'Su', termId: 1228 },
];

const DAY_NAMES = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };
const ALL_WAYS = ['A-II', 'AQR', 'CE', 'EDP', 'ER', 'FR', 'SI', 'SMA'];
const COLORS = ['#8c1515', '#00697d', '#175e54', '#b26f16', '#620059', '#4d4f53', '#c2412d', '#6b7a1f'];
const UNIT_LIMIT = 20;
const HOURS_PER_UNIT = 3; // stand-in workload when a course has no hours data
const DEFAULT_RATING = 2.5; // stand-in rating for unrated courses in the comparison meters only

// The picture behind every map: a crop of Stanford Maps & Records' visitor map (Jan 2022), saved as img/campus-map.webp.
// Pins are positions on that picture in % of its width and height, so no coordinates are needed anywhere.
const CAMPUS_MAP = {
  src: 'img/campus-map.webp', width: 2403, height: 1201,
  credit: 'Stanford Maps & Records',
  source: 'https://visit.stanford.edu/pdf/explore-campus/general_campus_self-guided_tour_map.pdf',
};
const LATHROP = { name: 'Lathrop Library (home of Bishop Auditorium)', short: 'Lathrop', x: 61.95, y: 37.24 };
// Keys are how rooms are recognised: a number matches the part before the dash ("460-334"), a word matches anywhere ("Hewlett 200").
const BUILDING_PINS = {
  '460': { name: 'Margaret Jacks Hall (Building 460)', short: 'Bldg 460', x: 40.43, y: 50.24 },
  '200': { name: 'Lane History Corner (Building 200)', short: 'Bldg 200', x: 53.07, y: 60.64 },
  '160': { name: 'Wallenberg Hall (Building 160)', short: 'Bldg 160', x: 49.82, y: 54.87 },
  '260': { name: 'Pigott Hall (Building 260)', short: 'Bldg 260', x: 48.09, y: 89.83 },
  '320': { name: 'Braun Corner (Building 320)', short: 'Bldg 320', x: 28.95, y: 78.7 },
  '80': { name: 'Building 80, Inner Quad', short: 'Bldg 80', x: 32.63, y: 67.43 },
  '30': { name: 'Building 30, Inner Quad', short: 'Bldg 30', x: 47.8, y: 77.83 },
  '50': { name: 'Building 50, Inner Quad', short: 'Bldg 50', x: 43.03, y: 78.27 },
  Bishop: LATHROP,
  Lathrop: LATHROP,
  Hewlett: { name: 'Hewlett Teaching Center', short: 'Hewlett', x: 22.74, y: 39.26 },
  Cemex: { name: 'CEMEX Auditorium (Knight Management Center, GSB)', short: 'Cemex', x: 93.86, y: 48.65 },
  STLC: { name: 'Science Teaching and Learning Center (STLC)', short: 'STLC', x: 32.49, y: 10.66 },
  Shriram: { name: 'Shriram Center for Bioengineering & Chemical Engineering', short: 'Shriram', x: 5.05, y: 40.71 },
};

/* ---------- Course info: loaded from the course data file, not typed in here ---------- */

// GitHub's page for this file is .../blob/main/course-data.json, which is an HTML viewer.
// This is the same file served as plain JSON (and with CORS open, so any site can fetch it).
const COURSE_DATA_URL = 'https://raw.githubusercontent.com/Stanford-Carta/eng-challenge/main/course-data.json';
const COURSE_CACHE_KEY = 'fq_courses_cache';

/*
  COURSES is filled by loadCourses() before anything is drawn. Each course looks like:
    { code, title, units, hours, grading, ratings, ratingTerms, description, offerings,
      ways?, ger?, alsoListedAs?, prereqs?, application? }
  offerings: { [quarterId]: { lectures: [meeting], discussions?: [meeting], tba?: true } }
  A course with no offerings can't be dropped into any quarter.
  ratings: oldest to newest average rating. ratingTerms: the quarter of each one (same order), e.g. 'W19' = Winter 2019.
*/
let COURSES = [];

// Fetches the file, converts it, and keeps a copy on this device so the app still opens if GitHub can't be reached.
// Resolves to { fromCache }. Rejects if there is neither a connection nor a saved copy.
async function loadCourses() {
  let raw;
  let fromCache = false;
  try {
    const response = await fetch(COURSE_DATA_URL); // plain GET: no custom headers, so no CORS preflight
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    raw = await response.json();
    store.set(COURSE_CACHE_KEY, raw);
  } catch (error) {
    raw = store.get(COURSE_CACHE_KEY, null);
    if (!raw) throw error;
    fromCache = true;
  }
  COURSES = raw.map(courseFromJson).filter(Boolean);
  return { fromCache };
}

const WEEKDAY = { Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'R', Friday: 'F' };
const TERM_LETTER = { Autumn: 'A', Winter: 'W', Spring: 'S', Summer: 'Su' };

// "5:30:00 PM" -> "1730"
function toHHMM(time) {
  const m = /^(\d{1,2}):(\d\d)(?::\d\d)?\s*(AM|PM)$/i.exec(time || '');
  if (!m) return null;
  const hour = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return String(hour).padStart(2, '0') + m[2];
}

// The file spells rooms a few ways ("STLC111", "Hewlett Teaching Center 200", "Shriram Ctr BioChemE 104").
const tidyRoom = (room) => (room
  ? room.trim()
    .replace(/^Hewlett Teaching Center/i, 'Hewlett')
    .replace(/^Shriram Ctr\b/i, 'Shriram')
    .replace(/^([A-Za-z]{2,})(\d)/, '$1 $2')
  : null);

// Discussion sections have no location of their own; the room is in the note ("Room 460-334.", "Rm Lathrop 290.").
function roomOf(schedule, offering) {
  if (schedule.location) return tidyRoom(schedule.location);
  if (offering.component !== 'DIS') return null;
  const note = /\bR(?:oo)?m\.?\s+([^.]+?)\s*\.?\s*$/i.exec(offering.notes || '');
  return note ? tidyRoom(note[1]) : null;
}

// One meeting pattern -> the { days, start, end, room, instructor } the planner works with. Weekend-only meetings are skipped.
function meetingOf(schedule, offering, fallbackName) {
  const days = schedule.days.map((d) => WEEKDAY[d]).filter(Boolean).join('');
  const start = toHHMM(schedule.start_time);
  const end = toHHMM(schedule.end_time);
  if (!days || !start || !end) return null;
  const people = schedule.primary_instructors?.length ? schedule.primary_instructors : (schedule.instructors || []);
  return meeting(days, start, end, roomOf(schedule, offering), people.map((p) => p.name).join(', ') || fallbackName);
}

// The file's sections for the four quarters of the year -> { A: { lectures, discussions?, tba? }, ... }.
// Cancelled sections don't count. Everything that isn't a discussion section (LEC, SEM, ACT, LAB, ISF) is a "lecture".
function offeringsOf(sections) {
  const byDayThenTime = (a, b) => ('MTWRF'.indexOf(a.days[0]) - 'MTWRF'.indexOf(b.days[0])) || (a.start - b.start);
  const result = {};
  QUARTERS.forEach((q) => {
    const live = sections.filter((s) => s.term.stanford_term_id === q.termId && !/cancel/i.test(s.notes || ''));
    if (!live.length) return;
    const meetingsOf = (list, name) => list.flatMap((s) => s.schedules.map((sc) => meetingOf(sc, s, name))).filter(Boolean);
    const lectures = meetingsOf(live.filter((s) => s.component !== 'DIS'), null);
    const discussions = meetingsOf(live.filter((s) => s.component === 'DIS'), 'Section TA').sort(byDayThenTime);
    result[q.id] = { lectures };
    if (discussions.length) result[q.id].discussions = discussions;
    if (!lectures.length) result[q.id].tba = true;
  });
  return result;
}

// One average per quarter, oldest first. The file repeats a quarter once per instructor, so those are merged.
function ratingsOf(rows) {
  const byTerm = new Map();
  rows.forEach((row) => { if (!byTerm.has(row.term.stanford_term_id)) byTerm.set(row.term.stanford_term_id, row); });
  return [...byTerm.values()]
    .sort((a, b) => a.term.stanford_term_id - b.term.stanford_term_id)
    .map(({ term, average_rating: value }) => ({
      value: Number(value),
      // Autumn belongs to the year it starts in; the other quarters to the year they end in: A16, W17, S17, Su17, A17 ...
      term: TERM_LETTER[term.season] + String(term.season === 'Autumn' ? term.start_year : term.end_year).slice(-2),
    }));
}

// The file has stray encoding damage ("¿what if¿") and soft hyphens in a few descriptions.
const cleanText = (text) => (text || '').replace(/\u00ad/g, '').replace(/¿/g, '"').trim();

function courseFromJson(raw) {
  const [code, ...alsoListed] = raw.course_codes || [];
  if (!code) return null;
  const description = cleanText(raw.description);
  const requirements = raw.general_requirements || [];
  const strip = (text, prefix) => text.replace(prefix, '').replace(/[,\s]+$/, '');
  const ways = requirements.filter((r) => /^WAY-/.test(r)).map((r) => strip(r, /^WAY-/));
  const gers = requirements.filter((r) => /^GER:/.test(r)).map((r) => strip(r, /^GER:/));
  const history = ratingsOf(raw.ratings || []);
  const prereqs = /Prerequisites?:\s*(.+?)\.(?:\s|$)/i.exec(description);
  const notes = (raw.offerings || []).map((o) => o.notes || '').join(' ');

  return {
    code,
    title: cleanText(raw.title),
    units: raw.max_units,
    hours: raw.average_hours_spent == null ? null : Number(raw.average_hours_spent),
    grading: (raw.grading || '').replace('Satisfactory/No Credit', 'S/NC').replace('Credit/No Credit', 'CR/NC'),
    ratings: history.map((h) => h.value),
    ratingTerms: history.map((h) => h.term),
    description,
    offerings: offeringsOf(raw.offerings || []),
    // optional fields stay undefined when empty, because the screens treat "missing" and "empty" differently
    ways: ways.length ? ways : undefined,
    ger: gers.length ? gers.join(', ') : undefined,
    alsoListedAs: alsoListed.length ? alsoListed.join(', ') : undefined,
    prereqs: prereqs ? prereqs[1] : undefined,
    application: /\bapplication\b/i.test(`${description} ${notes}`) || undefined,
  };
}
