// Test: Hidden project state management
// Run: node frontend/test-hide-project.mjs

// --- Mock localStorage ---
const store = {};
globalThis.localStorage = {
  getItem(k) { return store[k] ?? null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
};

// --- Load functions under test (inline, same logic as app.js) ---
// These will be copy-pasted here after implementation to verify behavior.
// For now, we import via a shared module pattern.

// Since app.js is a browser script, we eval the relevant functions.
import { readFileSync } from 'fs';
const appJs = readFileSync(new URL('./app.js', import.meta.url), 'utf-8');

// Extract the hidden project functions by evaluating them in this context
const fnMatch = appJs.match(
  /\/\/ ===== 2c\. Hidden Projects =====[\s\S]*?(?=\/\/ ===== \d)/
);
if (!fnMatch) {
  console.error('FAIL: Hidden Projects section not found in app.js');
  process.exit(1);
}
// Indirect eval runs in global scope (not strict-mode ESM scope)
(0, eval)(fnMatch[0]);

// --- Tests ---
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function reset() {
  delete store.hiddenProjects;
}

// Test 1: getHiddenProjects returns empty array when nothing stored
reset();
assert(
  JSON.stringify(getHiddenProjects()) === '[]',
  'getHiddenProjects() returns [] when empty'
);

// Test 2: hideProject adds a path
reset();
hideProject('/path/to/A');
assert(
  JSON.stringify(getHiddenProjects()) === '["/path/to/A"]',
  'hideProject() adds path to list'
);

// Test 3: hideProject is idempotent
reset();
hideProject('/path/to/A');
hideProject('/path/to/A');
assert(
  getHiddenProjects().length === 1,
  'hideProject() is idempotent (no duplicates)'
);

// Test 4: hideProject multiple paths
reset();
hideProject('/path/to/A');
hideProject('/path/to/B');
assert(
  getHiddenProjects().length === 2,
  'hideProject() can hide multiple projects'
);

// Test 5: unhideProject removes a path
reset();
hideProject('/path/to/A');
hideProject('/path/to/B');
unhideProject('/path/to/A');
const after5 = getHiddenProjects();
assert(
  after5.length === 1 && after5[0] === '/path/to/B',
  'unhideProject() removes only the specified path'
);

// Test 6: unhideProject on non-existent path is no-op
reset();
hideProject('/path/to/A');
unhideProject('/path/to/X');
assert(
  getHiddenProjects().length === 1,
  'unhideProject() on non-existent path is no-op'
);

// Test 7: filterVisibleProjects filters hidden projects
reset();
hideProject('/B');
const projects = [
  { name: 'A', path: '/A' },
  { name: 'B', path: '/B' },
  { name: 'C', path: '/C' },
];
const visible = filterVisibleProjects(projects);
assert(
  visible.length === 2 && visible.every(p => p.path !== '/B'),
  'filterVisibleProjects() excludes hidden projects'
);

// Test 8: filterVisibleProjects returns all when nothing hidden
reset();
const all = filterVisibleProjects(projects);
assert(
  all.length === 3,
  'filterVisibleProjects() returns all when nothing hidden'
);

// Test 9: renderProjectCards HTML contains close button markup
{
  const cardSection = appJs.match(/function renderProjectCards[\s\S]*?^}/m);
  const html = cardSection ? cardSection[0] : '';
  assert(
    html.includes('project-card-close'),
    'renderProjectCards() HTML contains .project-card-close button'
  );
  assert(
    html.includes('filterVisibleProjects'),
    'renderProjectCards() calls filterVisibleProjects()'
  );
}

// Test 10: renderSidebar HTML contains close button markup
{
  const sidebarSection = appJs.match(/function renderSidebar[\s\S]*?^}/m);
  const html = sidebarSection ? sidebarSection[0] : '';
  assert(
    html.includes('sidebar-project-close'),
    'renderSidebar() HTML contains .sidebar-project-close button'
  );
  assert(
    html.includes('filterVisibleProjects'),
    'renderSidebar() calls filterVisibleProjects()'
  );
}

// Test 11: loadProjectCards contains unhideProject for hash auto-unhide
{
  const loadSection = appJs.match(/function loadProjectCards[\s\S]*?^}/m);
  const code = loadSection ? loadSection[0] : '';
  assert(
    code.includes('unhideProject'),
    'loadProjectCards() calls unhideProject() for hash auto-unhide'
  );
  assert(
    code.includes('getHiddenProjects'),
    'loadProjectCards() checks hidden list before auto-select'
  );
}

// Test 12: unhideProject then filterVisibleProjects shows the project
reset();
hideProject('/B');
unhideProject('/B');
{
  const result = filterVisibleProjects(projects);
  assert(
    result.length === 3,
    'After unhideProject, filterVisibleProjects includes the project'
  );
}

// Test 13: localStorage persistence
reset();
hideProject('/persist');
const raw = JSON.parse(store.hiddenProjects);
assert(
  raw.length === 1 && raw[0] === '/persist',
  'Hidden list persists in localStorage'
);

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
