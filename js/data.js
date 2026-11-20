const QUARTERS = [
  { id: 'A', name: 'Autumn 2021', label: 'A' },
  { id: 'W', name: 'Winter 2022', label: 'W' },
  { id: 'S', name: 'Spring 2022', label: 'S' },
  { id: 'U', name: 'Summer 2022', label: 'Su' },
];

const DAY_NAMES = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };
const ALL_WAYS = ['A-II', 'AQR', 'CE', 'EDP', 'ER', 'FR', 'SI', 'SMA'];
const COLORS = ['#8c1515', '#00697d', '#175e54', '#b26f16', '#620059', '#4d4f53', '#c2412d', '#6b7a1f'];
const UNIT_LIMIT = 20;
const HOURS_PER_UNIT = 3; // stand-in workload when a course has no hours data

// Schematic campus positions (x, y on a 100x80 grid). Not real coordinates.
const BUILDING_PINS = {
  '460': [24, 40], '200': [40, 32], '160': [34, 26], '260': [38, 48],
  '320': [50, 58], '80': [30, 50], '30': [44, 42], '50': [20, 56],
  Bishop: [56, 20], Hewlett: [64, 40], Cemex: [86, 14],
  STLC: [14, 66], Shriram: [72, 58], Lathrop: [22, 24],
};

/*
  offerings: { [quarterId]: { lectures: [meeting], discussions?: [meeting], tba?: true } }
  A course with no offerings can't be dropped into any quarter.
  ratings: oldest to newest average rating.
*/
const COURSES = [
  {
    code: 'CS 1C', title: 'Introduction to Computing at Stanford',
    units: 1, hours: 1.38, grading: 'S/NC', ratings: [4.3, 4.3, 4.2, 4.3],
    description: 'Computer maintenance, security, internet privacy and copyright. Weekly dorm talks by Student Technology. Not a programming course.',
    offerings: {},
  },
  {
    code: 'CS 1U', title: 'Practical Unix',
    units: 1, hours: 2.7, grading: 'S/NC', ratings: [3.3, 3.6, 3.8, 3.5, 3.7, 3.9, 3.4, 3.6],
    description: 'Linux command line: grep, regex, ZSH, Vim/Emacs, GDB, permissions, revision control, Python scripting. The 2021–22 sections were cancelled.',
    offerings: {},
  },
  {
    code: 'CS 7', title: 'Personal Finance for Engineers',
    units: 1, hours: 1.63, grading: 'S/NC', ratings: [4.7, 4.7, 4.8],
    description: 'Budgeting, debt, compensation, stock options, investing and real estate using real tech-company data. No finance background needed.',
    offerings: { A: { lectures: [meeting('T', '1730', '1900', 'STLC 111', 'Adam Nash')] } },
  },
  {
    code: 'CS 9', title: 'Problem-Solving for the CS Technical Interview',
    units: 1, hours: null, grading: 'S/NC', ratings: [4.3, 4.1], prereqs: 'CS 106B or X',
    description: 'Prepare for coding interviews: problem-solving strategy and oral/written-oral communication.',
    offerings: { A: { lectures: [meeting('T', '1730', '1930', 'Shriram BioChemE 104', 'Ian Tullis, Andrew Benson')] } },
  },
  {
    code: 'CS 11SI', title: 'How to Make VR',
    units: 2, hours: null, grading: 'S/NC', ratings: [], prereqs: 'CS 106A', application: true,
    description: 'Design and build VR apps in Unity for Oculus Go. Group final project. Application only.',
    offerings: { S: { lectures: [meeting('MW', '1600', '1700', null, 'Gabriel Mukobi')] } },
  },
  {
    code: 'CS 12SI', title: 'Intro to Mobile Augmented Reality',
    units: 1, hours: null, grading: 'S/NC', ratings: [], prereqs: 'CS 106A', application: true,
    description: 'Mobile AR with Unity and AR Foundation: plane detection, object placement, image/face tracking. Build your own AR app.',
    offerings: { A: { lectures: [meeting('MW', '2000', '2100', '320-109', 'Jay Borenstein')] } },
  },
  {
    code: 'CS 13SI', title: 'Intro to Version Control with Git',
    units: 1, hours: null, grading: 'S/NC', ratings: [],
    description: 'Use git for modular changes, branches, merges and collaboration on software teams.',
    offerings: { W: { lectures: [meeting('R', '1330', '1530', null, 'Andrew Benson')] } },
  },
  {
    code: 'CS 21SI', title: 'AI for Social Good',
    units: 2, hours: null, grading: 'S/NC', ratings: [], prereqs: 'CS 107, MATH 51, CS 109', application: true,
    description: 'Apply ML and deep learning (CNNs, RNNs) to healthcare, government, education and environment. Weekly coding assignments.',
    offerings: { S: { lectures: [meeting('W', '1730', '1930', null, 'Chris Piech')] } },
  },
  {
    code: 'CS 22A', title: 'The Social & Economic Impact of AI',
    units: 1, hours: 1.84, grading: 'S/NC', ratings: [4.2, 4.3, 4.2],
    description: 'Jobs, bias, justice, democracy and warfare in an age of intelligent machines.',
    offerings: { W: { lectures: [meeting('R', '1330', '1430', 'Cemex Auditorium', 'Samuel Kaplan')] } },
  },
  {
    code: 'CS 24', title: 'Minds and Machines',
    units: 4, hours: 8.73, grading: 'Letter or CR/NC', ratings: [3.4, 3.3, 2.9, 4.2, 3.5, 4.3, 4.4],
    ways: ['FR'], ger: 'DB-SocSci', alsoListedAs: 'SYMSYS 1, PHIL 99, PSYCH 35, LINGUIST 35',
    description: 'Interdisciplinary study of cognition, computation, rationality and language. Required before declaring Symbolic Systems.',
    offerings: {
      A: {
        lectures: [meeting('F', '1215', '1315', 'Bishop Auditorium', 'Daniel Lassiter, Erica Yoon')],
        discussions: discussions({
          W: [['0830', '200-107'], ['0945', '460-334'], ['1100', '460-334'], ['1215', '460-334'],
              ['1330', '260-012'], ['1445', '260-012'], ['1600', '200-107'], ['1730', '460-334']],
          R: [['0830', '200-107'], ['0945', '160-319'], ['1100', '160-319'], ['1215', '160-318'],
              ['1330', '460-331'], ['1445', '200-202'], ['1600', '460-334'], ['1845', '200-107']],
        }),
      },
      W: {
        lectures: [meeting('F', '1215', '1315', 'Hewlett 200', 'Noah Goodman, Erica Yoon')],
        discussions: discussions({
          W: [['0945', '30-102'], ['1100', '80-115'], ['1215', '80-115'], ['1330', 'Lathrop 290'],
              ['1445', 'Lathrop 290'], ['1600', '50-52H'], ['1730', '50-52H']],
          R: [['0830', '200-107'], ['0945', '460-334'], ['1100', '260-004'], ['1215', '200-202'],
              ['1330', '260-011'], ['1445', 'STLC 119'], ['1600', '160-315'], ['1730', '160-318'],
              ['1845', '160-315']],
        }),
      },
    },
  },
  {
    code: 'CS 25', title: 'Transformers United',
    units: 1, hours: null, grading: 'S/NC', ratings: [], prereqs: 'Deep learning basics (attention)', application: true,
    description: 'How transformers work and where they apply: NLP, vision, RL, speech, biology. Guest lectures from researchers.',
    offerings: { A: { lectures: [meeting('M', '0945', '1145', '460-334', 'Christopher Manning')] } },
  },
  {
    code: 'CS 28', title: 'AI, Entrepreneurship and Society',
    units: 2, hours: 2.15, grading: 'S/NC', ratings: [4.2],
    description: 'Co-taught by a professor and a VC: AI capabilities, startup opportunities and long-term societal impact.',
    offerings: {},
  },
  {
    code: 'CS 31N', title: 'Counterfactuals: The Science of What Ifs?',
    units: 3, hours: 6.38, grading: 'Letter or CR/NC', ratings: [4.4],
    description: 'Quantitative counterfactual reasoning applied to climate change, healthcare and economics. No probability background needed.',
    offerings: { U: { lectures: [], tba: true } },
  },
  {
    code: 'CS 41', title: 'Hap.py Code: The Python Programming Language',
    units: 2, hours: 5.29, grading: 'S/NC', ratings: [4.7, 4.7, 4.5], prereqs: 'CS 106B or X',
    description: 'Pythonic conventions, comprehensions, iterables, built-ins and libraries, ending in a significant Python project.',
    offerings: { S: { lectures: [meeting('TR', '1515', '1645', null, 'Jerry Cain')] } },
  },
  {
    code: 'CS 43', title: 'Functional Programming Abstractions',
    units: 2, hours: null, grading: 'S/NC', ratings: [], prereqs: 'CS 107, CS 103',
    description: 'Haskell, algebraic types, lenses, effect systems, concurrency and dependent types.',
    offerings: {},
  },
];
