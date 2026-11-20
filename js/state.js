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
// Rating drawn as five stars, the last one partly filled (4.3 -> four stars and a bit)
const starsHTML = (rating) => (rating == null ? '' :
  `<span class="stars" style="--fill:${Math.min(100, (rating / 5) * 100).toFixed(1)}%" role="img" aria-label="${rating} out of 5">★★★★★</span>`);
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
