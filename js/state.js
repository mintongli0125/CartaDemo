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
