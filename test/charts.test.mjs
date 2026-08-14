/* ============================================================
   charts.test.mjs — the drawing maths.

   charts.js is a browser script, not a module, so it is loaded
   into a minimal fake-DOM context and the pure functions are
   pulled out. Everything tested here is arithmetic with a
   correct answer.

   The interpolation test is the one that matters. A cubic
   spline through fuel-economy points overshoots between them,
   drawing an MPG figure the vehicle never achieved. Monotone
   interpolation is mathematically incapable of that, and this
   file proves the implementation actually has that property.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public/js/charts.js'), 'utf8');

/* minimal browser surface — enough for the module to evaluate */
const listeners = [];
const el = () => ({
  className: '', style: {}, dataset: {}, innerHTML: '', offsetWidth: 100, offsetHeight: 40,
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
});
const ctx = {
  document: {
    body: { classList: { contains: () => false } },
    documentElement: el(),
    createElement: el, getElementById: () => null, querySelectorAll: () => [], addEventListener() {}
  },
  window: {
    matchMedia: () => ({ matches: false }),
    addEventListener: (...a) => listeners.push(a),
    innerWidth: 1200, innerHeight: 800,
    MutationObserver: class { observe() {} }
  },
  MutationObserver: class { observe() {} },
  requestAnimationFrame: fn => fn(),
  UNITS: { metric: false },
  esc: s => String(s),
  ic: () => '<svg></svg>',
  console
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m}  (got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)})`);
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}  (got ${a}, wanted ~${b})`);

const { monotonePath, downsample, niceTicks, abbrev, extent, stepPath } = ctx;

/* ============================================================
   1. abbrev — tick labels
   ============================================================ */
console.log('\n  abbrev');
eq(abbrev(1200), '1.2k', '1200 -> 1.2k');
eq(abbrev(245000), '245k', '245000 -> 245k');
eq(abbrev(1500000), '1.5M', '1.5 million');
eq(abbrev(14.23, 1), '14.2', 'one decimal place');
eq(abbrev(0), '0', 'zero is zero, not blank');
eq(abbrev(null), '—', 'null renders as a dash, never as 0');
eq(abbrev(undefined), '—', 'undefined renders as a dash');
eq(abbrev(NaN), '—', 'NaN renders as a dash, never as a number');
eq(abbrev(Infinity), '—', 'Infinity renders as a dash');
eq(abbrev(-1200), '-1.2k', 'negatives keep their sign');

/* ============================================================
   2. extent and ticks
   ============================================================ */
console.log('  scales');
const [lo, hi] = extent([3, 9, 5]);
eq(lo, 3, 'extent low'); eq(hi, 9, 'extent high');
const flat = extent([5, 5, 5]);
ok(flat[0] < 5 && flat[1] > 5, 'a flat series is padded so it does not divide by zero');
const empty = extent([]);
ok(isFinite(empty[0]) && isFinite(empty[1]), 'an empty series still yields a finite domain');

const t = niceTicks(0, 100, 4);
ok(t.every(v => Number.isInteger(v)), 'ticks are round numbers');
ok(t.length >= 3 && t.length <= 7, 'tick count stays near the requested value');
ok(t[0] >= 0 && t[t.length - 1] <= 100, 'ticks stay inside the domain');
const t2 = niceTicks(12.3, 12.9, 4);
ok(t2.length >= 2, 'a narrow domain still produces ticks');

/* ============================================================
   3. monotone interpolation — the important one
   ============================================================ */
console.log('  monotone interpolation (no invented values)');

/* Sample a cubic Bezier segment so the curve can be checked
   between the data points, not just at them. */
function bez(p0, c1, c2, p1, steps = 24) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, m = 1 - u;
    out.push({
      x: m * m * m * p0.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * p1.x,
      y: m * m * m * p0.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * p1.y
    });
  }
  return out;
}
function sampleCurve(pts) {
  const d = monotonePath(pts);
  const nums = d.match(/-?\d+(\.\d+)?(e-?\d+)?/g).map(Number);
  const out = [{ x: nums[0], y: nums[1] }];
  let i = 2;
  let cur = out[0];
  while (i + 5 < nums.length + 1 && i + 5 <= nums.length) {
    const c1 = { x: nums[i], y: nums[i + 1] };
    const c2 = { x: nums[i + 2], y: nums[i + 3] };
    const p1 = { x: nums[i + 4], y: nums[i + 5] };
    out.push(...bez(cur, c1, c2, p1));
    cur = p1; i += 6;
  }
  return out;
}

/* A spike: 16, 17, 31, 18. A plain cubic spline dips well below 16
   on the way in and overshoots past 31 on the way out. */
const spike = [{ x: 0, y: 16 }, { x: 1, y: 17 }, { x: 2, y: 31 }, { x: 3, y: 18 }];
const curve = sampleCurve(spike);
const yMin = Math.min(...curve.map(p => p.y));
const yMax = Math.max(...curve.map(p => p.y));
ok(yMax <= 31 + 1e-6, 'curve never rises above the highest real reading (no invented peak)');
ok(yMin >= 16 - 1e-6, 'curve never falls below the lowest real reading (no invented trough)');

/* Between any two adjacent points the curve must stay within their
   values — that is what "monotone" buys and why it is used here. */
let violations = 0;
for (let i = 0; i < spike.length - 1; i++) {
  const a = spike[i], b = spike[i + 1];
  const lo2 = Math.min(a.y, b.y) - 1e-6, hi2 = Math.max(a.y, b.y) + 1e-6;
  for (const p of curve) {
    if (p.x > a.x + 1e-9 && p.x < b.x - 1e-9 && (p.y < lo2 || p.y > hi2)) violations++;
  }
}
eq(violations, 0, 'every segment stays between its two endpoints');

/* a monotone rising series must produce a monotone rising curve —
   an odometer chart that dips would imply a rollback that never happened */
const odo = [{ x: 0, y: 88000 }, { x: 1, y: 92000 }, { x: 2, y: 92100 }, { x: 3, y: 96000 }];
const oc = sampleCurve(odo);
let dips = 0;
for (let i = 1; i < oc.length; i++) if (oc[i].y < oc[i - 1].y - 1e-6) dips++;
eq(dips, 0, 'a rising odometer series never dips (would imply a rollback)');

/* endpoints must be exact — the curve has to pass through the data */
near(curve[0].y, 16, 1e-6, 'curve starts exactly on the first reading');
near(curve[curve.length - 1].y, 18, 1e-6, 'curve ends exactly on the last reading');

/* degenerate inputs */
eq(monotonePath([]), '', 'no points yields no path');
ok(monotonePath([{ x: 1, y: 2 }]).startsWith('M'), 'one point yields a move');
ok(monotonePath([{ x: 0, y: 0 }, { x: 1, y: 1 }]).includes('L'), 'two points draw a straight line, not a curve');
ok(!monotonePath([{ x: 0, y: 0 }, { x: 1, y: 1 }]).includes('NaN'), 'no NaN in the path');

/* duplicate x values must not produce NaN via divide-by-zero */
const dup = monotonePath([{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 3 }]);
ok(!dup.includes('NaN'), 'duplicate x coordinates do not produce NaN');

/* ---------- stepped ---------- */
const sp = stepPath([{ x: 0, y: 0 }, { x: 1, y: 5 }]);
ok(sp.includes('H') && sp.includes('V'), 'stepped path uses horizontal then vertical');

/* ============================================================
   4. downsampling — must preserve the extremes
   ============================================================ */
console.log('  downsampling (spikes must survive)');
const big = [];
for (let i = 0; i < 5000; i++) big.push({ x: i, y: Math.sin(i / 90) * 40 + 50 });
big[2500] = { x: 2500, y: 250 };          // the misfire frame
big[1200] = { x: 1200, y: -40 };          // a dropout

const small = downsample(big, 300);
ok(small.length <= 300, 'downsampled to the requested size');
ok(small.length > 200, 'and not over-reduced');
ok(small.some(p => p.y === 250), 'the spike survived — this is the frame that shows the fault');
ok(small.some(p => p.y === -40), 'the dropout survived');
eq(small[0].x, big[0].x, 'first sample kept');
eq(small[small.length - 1].x, big[big.length - 1].x, 'last sample kept');
let ordered = true;
for (let i = 1; i < small.length; i++) if (small[i].x < small[i - 1].x) ordered = false;
ok(ordered, 'output stays in chronological order');

/* the source array must never be mutated — it is the user's record */
eq(big.length, 5000, 'source series untouched');
eq(big[2500].y, 250, 'source values untouched');

eq(downsample(big, 6000).length, 5000, 'no downsampling when under threshold');
eq(downsample([{ x: 0, y: 1 }], 100).length, 1, 'a single point survives');
eq(downsample([], 100).length, 0, 'an empty series stays empty');

console.log(fail ? `\n  ✗ ${fail} failed, ${pass} passed\n` : `\n  ✓ charts: ${pass} assertions passed\n`);
process.exit(fail ? 1 : 0);
