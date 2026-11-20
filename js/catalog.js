const SORTERS = {
  code: (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }),
  rating: (a, b) => (latestRating(b) || 0) - (latestRating(a) || 0),
  hours: (a, b) => (a.hours ?? Infinity) - (b.hours ?? Infinity),
};

function statsText(course) {
  const rating = latestRating(course);
  return [
    `${course.units} unit${course.units > 1 ? 's' : ''}`,
    course.hours != null ? `~${course.hours} h/wk` : 'hours n/a',
    rating ? `${starsHTML(rating)} ${rating}` : 'unrated',
    course.application && 'application',
  ].filter(Boolean).join(' · ');
}

const quarterTagsHTML = (course) => QUARTERS.map((q) =>
  `<span class="qtag ${isOffered(course, q.id) ? 'on' : ''}">${q.label}</span>`
).join('');

function cardHTML(course) {
  const available = Object.keys(course.offerings).length > 0;
  const stats = statsText(course);
  const quarterTags = quarterTagsHTML(course);

  return `
    <div class="card ${available ? '' : 'unavailable'}" draggable="${available}"
         data-code="${course.code}" data-open="${course.code}">
      <h3>${course.code}: ${course.title}${wayTags(course)}</h3>
      <div class="meta">${stats}</div>
      <div class="meta">${quarterTags}${available ? '' : ' Not offered in 2021–22'}</div>
    </div>`;
}

function renderCatalog() {
  const query = $('#search').value.toLowerCase();
  const quarterId = $('#filter-quarter').value;
  const sortBy = $('#sort').value;

  const matches = COURSES
    .filter((c) => !query || `${c.code} ${c.title} ${c.description}`.toLowerCase().includes(query))
    .filter((c) => !quarterId || isOffered(c, quarterId))
    .sort(SORTERS[sortBy]);

  $('#catalog').innerHTML = matches.map(cardHTML).join('') || '<div class="empty">No courses match.</div>';
}
