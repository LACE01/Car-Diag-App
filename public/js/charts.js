/* ============================================================
   charts.js — the telemetry drawing kit.

   Hand-rolled SVG, no charting library. Three reasons:
   the app has to work in a garage with no internet, every
   kilobyte of CDN is a kilobyte that can fail at the worst
   moment, and a library would fight the design tokens the
   whole way. This is about 700 lines and it owes nobody.

   The rule that matters more than any of the drawing:
   A CHART NEVER INVENTS A POINT. If the data isn't there,
   the chart says so in plain words and offers the button
   that would fix it. A fabricated trend line in a
   maintenance app is not a cosmetic bug — someone plans a
   repair around it.
   ============================================================ */

const CHART_COLORS = {
  cyan:    'var(--primary)',
  violet:  'var(--violet)',
  magenta: 'var(--magenta)',
  green:   'var(--ok)',
  amber:   'var(--warn)',
  red:     'var(--bad)'
};

/* registry of live chart specs, keyed by DOM id */
const CHARTS = new Map();
let CHART_SEQ = 0;
const cid = () => 'ch' + (++CHART_SEQ);

function stillCharts() {
  return document.body.classList.contains('stillcharts') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ============================================================
   NUMBER FORMATTING
   Compact enough for a tick label, exact enough for a tooltip.
   ============================================================ */
function abbrev(n, dp) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1000) return (n / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  if (a >= 100 || dp === 0) return Math.round(n).toString();
  return n.toFixed(dp === undefined ? 1 : dp).replace(/\.0$/, '');
}
const fmtMoney  = n => (n < 0 ? '-$' : '$') + abbrev(Math.abs(n));
const fmtMoneyX = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMiles  = n => abbrev(n, 0) + (UNITS.metric ? ' km' : ' mi');
const fmtMilesX = n => Math.round(n).toLocaleString() + (UNITS.metric ? ' km' : ' mi');

function fmtMonth(iso) {
  const d = new Date(iso.length === 7 ? iso + '-01T12:00:00' : iso);
  return d.toLocaleDateString(undefined, { month: 'short' });
}
function fmtMonthYear(iso) {
  const d = new Date(iso.length === 7 ? iso + '-01T12:00:00' : iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
function fmtDay(iso) {
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ============================================================
   MATHS
   ============================================================ */
function extent(vals) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - (Math.abs(lo) * 0.1 || 1), hi + (Math.abs(hi) * 0.1 || 1)];
  return [lo, hi];
}

/* Nice round tick values — the difference between a chart that
   looks designed and one that looks generated. */
function niceTicks(lo, hi, count) {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) {
    out.push(Math.round(v / step) * step);
  }
  return out;
}

/* Monotone cubic (Fritsch–Carlson). Plain cubic splines overshoot,
   which on a fuel-economy chart draws an MPG figure the vehicle
   never achieved. Monotone can't overshoot — between two points it
   stays between them. That property is why this is here. */
function monotonePath(p) {
  const n = p.length;
  if (!n) return '';
  if (n === 1) return 'M' + p[0].x + ' ' + p[0].y;
  if (n === 2) return 'M' + p[0].x + ' ' + p[0].y + 'L' + p[1].x + ' ' + p[1].y;

  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1].x - p[i].x;
    dy[i] = p[i + 1].y - p[i].y;
    m[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) { t[i] = 0; continue; }
    const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
    t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  }
  t[n - 1] = m[n - 2];

  let d = 'M' + p[0].x + ' ' + p[0].y;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += 'C' + (p[i].x + h) + ' ' + (p[i].y + h * t[i]) +
         ' ' + (p[i + 1].x - h) + ' ' + (p[i + 1].y - h * t[i + 1]) +
         ' ' + p[i + 1].x + ' ' + p[i + 1].y;
  }
  return d;
}

function stepPath(p) {
  if (!p.length) return '';
  let d = 'M' + p[0].x + ' ' + p[0].y;
  for (let i = 1; i < p.length; i++) d += 'H' + p[i].x + 'V' + p[i].y;
  return d;
}

/* Largest-Triangle-Three-Buckets. A 40-minute live-data log is
   ~50k samples; drawing them all locks up a phone. LTTB keeps the
   visual shape including spikes, unlike naive every-Nth sampling
   which can drop the one frame where the misfire happened.
   The original series is never modified — this is display only. */
function downsample(points, threshold) {
  const n = points.length;
  if (threshold >= n || threshold < 3) return points;
  const every = (n - 2) / (threshold - 2);
  const out = [points[0]];
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const rs = Math.floor((i + 1) * every) + 1;
    const re = Math.min(Math.floor((i + 2) * every) + 1, n);
    let ax = 0, ay = 0;
    for (let j = rs; j < re; j++) { ax += points[j].x; ay += points[j].y; }
    const cnt = Math.max(1, re - rs);
    ax /= cnt; ay /= cnt;

    const rangeFrom = Math.floor(i * every) + 1;
    const rangeTo = Math.floor((i + 1) * every) + 1;
    let best = rangeFrom, bestArea = -1;
    for (let j = rangeFrom; j < Math.min(rangeTo, n); j++) {
      const area = Math.abs((points[a].x - ax) * (points[j].y - points[a].y) -
                            (points[a].x - points[j].x) * (ay - points[a].y));
      if (area > bestArea) { bestArea = area; best = j; }
    }
    out.push(points[best]);
    a = best;
  }
  out.push(points[n - 1]);
  return out;
}

/* ============================================================
   EMPTY STATE
   Not a shrug. A named reason and the button that fixes it.
   ============================================================ */
function chartEmpty(o) {
  return '<div class="empty-chart" style="min-height:' + (o.height || 180) + 'px">' +
    '<svg class="empty-grid" aria-hidden="true"><defs>' +
    '<pattern id="eg' + (++CHART_SEQ) + '" width="26" height="26" patternUnits="userSpaceOnUse">' +
    '<path d="M26 0H0V26" fill="none" stroke="var(--line)" stroke-width=".6" opacity=".5"/></pattern></defs>' +
    '<rect width="100%" height="100%" fill="url(#eg' + CHART_SEQ + ')"/></svg>' +
    '<div class="empty-in">' +
    '<h4>' + esc(o.title || 'NO DATA YET') + '</h4>' +
    (o.body ? '<p class="note" style="max-width:330px;margin:6px auto 0">' + esc(o.body) + '</p>' : '') +
    (o.action ? '<button class="btn xs" style="margin-top:14px" onclick="' + o.action.run + '">' +
      esc(o.action.label) + '</button>' : '') +
    '</div></div>';
}

/* ============================================================
   CHART PANEL SHELL
   Title, period selector, legend, the SVG, and the data table
   that makes the whole thing usable without a mouse or eyes.
   ============================================================ */
function panel(o, inner, extraHead) {
  const id = o.id || cid();
  return '<section class="chartcard' + (o.wide ? ' wide' : '') + '" id="card-' + id + '">' +
    '<header class="charthead">' +
    '<div style="min-width:0">' +
    '<h4 class="chart-title">' + esc(o.title) + (o.sub ? ' <span class="chart-sub">// ' + esc(o.sub) + '</span>' : '') + '</h4>' +
    (o.note ? '<p class="note" style="margin:3px 0 0">' + esc(o.note) + '</p>' : '') +
    '</div>' +
    '<div class="row" style="gap:6px;flex:0 0 auto">' + (extraHead || '') +
    (o.table === false ? '' :
      '<button class="btn xs ghost tblbtn" aria-expanded="false" onclick="chartTable(\'' + id + '\',this)" ' +
      'title="Show the numbers behind this chart">DATA</button>') +
    '</div></header>' +
    inner +
    (o.foot ? '<footer class="chartfoot">' + o.foot + '</footer>' : '') +
    '<div class="charttable hide" id="tbl-' + id + '"></div>' +
    '</section>';
}

/* ============================================================
   LINE CHART
   ============================================================ */
function lineChart(o) {
  const id = o.id || cid();
  const series = (o.series || []).filter(s => s.points && s.points.length);
  const height = o.height || 240;

  if (!series.length) return panel({ ...o, id, table: false }, chartEmpty({ ...(o.empty || {}), height }), o.head);

  /* one point can't be a line; say so rather than draw a dot and call it a trend */
  const drawable = series.filter(s => s.points.length >= 2);
  if (!drawable.length && o.needTwo !== false) {
    return panel({ ...o, id, table: false }, chartEmpty({
      title: (o.empty && o.empty.oneTitle) || 'ONLY ONE READING',
      body: (o.empty && o.empty.oneBody) || 'A trend needs at least two records. Log one more and this chart appears.',
      action: o.empty && o.empty.action, height
    }), o.head);
  }

  const W = 100, H = 100;                     // viewBox units; CSS handles real size
  const PAD = { l: 8, r: 3, t: 6, b: 12 };
  const all = series.flatMap(s => s.points);

  /* X values arrive in two shapes. Live data gives milliseconds — a
     real continuous axis where the gaps between samples mean something.
     Cost and fuel give date strings ("2026-08", "2026-08-13"), which
     are ordered categories.
     `+p.x` on a date string is NaN, and a single NaN coordinate makes
     the browser discard the entire path — the chart silently vanishes
     with no error. So: detect which kind we have, and map strings onto
     evenly spaced slots while keeping the original value for labels
     and tooltips. */
  const isNumericX = all.every(p =>
    typeof p.x === 'number' ? isFinite(p.x) : /^-?\d+(\.\d+)?$/.test(String(p.x)));

  let xOf;
  if (isNumericX) {
    xOf = p => +p.x;
  } else {
    const keys = [...new Set(all.map(p => String(p.x)))].sort();
    const slot = new Map(keys.map((k, i) => [k, i]));
    xOf = p => slot.get(String(p.x));
  }

  const xs = all.map(xOf), ys = all.map(p => +p.y);
  let [ylo, yhi] = o.yDomain || extent(ys);
  if (o.yZero && ylo > 0) ylo = 0;
  const [xlo, xhi] = extent(xs);
  const sx = v => PAD.l + ((v - xlo) / (xhi - xlo || 1)) * (W - PAD.l - PAD.r);
  const sy = v => PAD.t + (1 - (v - ylo) / (yhi - ylo || 1)) * (H - PAD.t - PAD.b);

  const yTicks = niceTicks(ylo, yhi, o.yTickCount || 4);
  const yFmt = o.yFmt || (v => abbrev(v));
  const xFmt = o.xFmt || (v => String(v));

  let g = '';
  for (const t of yTicks) {
    const y = sy(t);
    if (y < PAD.t - 1 || y > H - PAD.b + 1) continue;
    g += '<line class="grid" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + y + '" y2="' + y + '"/>' +
         '<text class="tick ytick" x="' + (PAD.l - 1.6) + '" y="' + (y + 1.1) + '">' + esc(yFmt(t)) + '</text>';
  }

  /* x labels thin out on narrow screens via CSS class, not by dropping data */
  /* one label per distinct x, thinned by stride — and always formatted
     from the ORIGINAL value, never the internal slot index */
  const seenX = new Map();
  for (const p of all) { const k = xOf(p); if (!seenX.has(k)) seenX.set(k, p.x); }
  const uniqX = [...seenX.keys()].sort((a, b) => a - b);
  const maxLabels = o.xLabelCount || 6;
  const stride = Math.max(1, Math.ceil(uniqX.length / maxLabels));
  uniqX.forEach((v, i) => {
    if (i % stride && i !== uniqX.length - 1) return;
    g += '<text class="tick xtick" x="' + sx(v) + '" y="' + (H - PAD.b + 4.6) + '">' + esc(xFmt(seenX.get(v))) + '</text>';
  });

  let paths = '', marks = '';
  const plotted = [];
  series.forEach((s, si) => {
    const pts = downsample(
        s.points.slice().sort((a, b) => xOf(a) - xOf(b)).map(p => ({ x: xOf(p), y: +p.y, raw: p })),
        o.maxPoints || 400
      ).map(p => ({ x: sx(p.x), y: sy(p.y), raw: p.raw }));
    plotted.push({ ...s, plot: pts });
    if (pts.length < 2) {
      if (pts.length === 1) marks += '<circle class="dot solo" cx="' + pts[0].x + '" cy="' + pts[0].y + '" r="1.5" style="--c:' + (s.color || CHART_COLORS.cyan) + '"/>';
      return;
    }
    const d = s.shape === 'step' ? stepPath(pts) : monotonePath(pts);
    const gid = id + 'f' + si;

    if (s.fill !== false && si === 0 && !s.dash) {
      paths += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + (s.color || CHART_COLORS.cyan) + '" stop-opacity=".22"/>' +
        '<stop offset="100%" stop-color="' + (s.color || CHART_COLORS.cyan) + '" stop-opacity="0"/>' +
        '</linearGradient></defs>' +
        '<path class="area" d="' + d + 'L' + pts[pts.length - 1].x + ' ' + (H - PAD.b) + 'L' + pts[0].x + ' ' + (H - PAD.b) + 'Z" fill="url(#' + gid + ')"/>';
    }
    paths += '<path class="line' + (s.dash ? ' forecast' : '') + (stillCharts() ? '' : ' draw') + '" d="' + d + '" ' +
      'style="--c:' + (s.color || CHART_COLORS.cyan) + '"/>';

    /* sparse series get permanent dots — with five fill-ups you want to see five points */
    if (pts.length <= (o.dotBelow || 14)) {
      marks += pts.map(p => '<circle class="dot" cx="' + p.x + '" cy="' + p.y + '" r="1.15" style="--c:' + (s.color || CHART_COLORS.cyan) + '"/>').join('');
    }
    /* flagged points: the out-of-sequence odometer reading, the failed test */
    marks += pts.filter(p => p.raw.flag).map(p =>
      '<circle class="dot flag ' + esc(p.raw.flag) + '" cx="' + p.x + '" cy="' + p.y + '" r="1.9"/>').join('');
  });

  const bands = (o.bands || []).filter(b => isFinite(xOf({ x: b.from })) && isFinite(xOf({ x: b.to }))).map(b =>
    '<rect class="band" x="' + sx(xOf(b.from === undefined ? b : { x: b.from })) + '" y="' + PAD.t +
    '" width="' + Math.max(0.4, sx(xOf({ x: b.to })) - sx(xOf({ x: b.from }))) +
    '" height="' + (H - PAD.t - PAD.b) + '" style="--c:' + (b.color || CHART_COLORS.amber) + '"><title>' + esc(b.label || '') + '</title></rect>').join('');

  const notes = (o.markers || []).filter(m => isFinite(xOf(m))).map(m =>
    '<g class="cmarker" style="--c:' + (m.color || CHART_COLORS.amber) + '">' +
    '<line x1="' + sx(xOf(m)) + '" x2="' + sx(xOf(m)) + '" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>' +
    '<circle cx="' + sx(xOf(m)) + '" cy="' + PAD.t + '" r="1.4"><title>' + esc(m.label || '') + '</title></circle></g>').join('');

  const legend = series.length > 1 || o.forceLegend
    ? '<div class="legend">' + series.map(s =>
        '<span class="lg' + (s.dash ? ' dash' : '') + '" style="--c:' + (s.color || CHART_COLORS.cyan) + '">' +
        '<i></i>' + esc(s.label) + '</span>').join('') + '</div>'
    : '';

  const svg =
    '<div class="chartwrap" style="--ch:' + height + 'px">' +
    '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
    'role="img" tabindex="0" aria-label="' + esc(o.title + '. ' + describeSeries(series, yFmt)) + '" ' +
    'data-chart="' + id + '">' +
    '<g class="plotbg"><rect x="' + PAD.l + '" y="' + PAD.t + '" width="' + (W - PAD.l - PAD.r) +
    '" height="' + (H - PAD.t - PAD.b) + '" rx="1"/></g>' +
    bands + g + paths + notes + marks +
    '<line class="guide hide" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>' +
    '<g class="hovpts"></g>' +
    '</svg></div>';

  CHARTS.set(id, {
    kind: 'line', spec: o, series: plotted, sx, sy, PAD, W, H, xlo, xhi, xOf,
    yFmt: o.yFmtFull || yFmt, xFmt: o.xFmtFull || xFmt
  });

  return panel({ ...o, id }, legend + svg, o.head);
}

function describeSeries(series, yFmt) {
  return series.map(s => {
    const ys = s.points.map(p => +p.y);
    const first = ys[0], last = ys[ys.length - 1];
    const dir = last > first ? 'rising' : last < first ? 'falling' : 'flat';
    return s.label + ': ' + s.points.length + ' readings, ' +
      yFmt(Math.min(...ys)) + ' to ' + yFmt(Math.max(...ys)) + ', ' + dir + '.';
  }).join(' ');
}

/* ============================================================
   HOVER — one shared tooltip, a guide line, keyboard stepping
   ============================================================ */
let TIP = null;
function tipEl() {
  if (!TIP) {
    TIP = document.createElement('div');
    TIP.className = 'charttip hide';
    TIP.setAttribute('role', 'status');
    document.body.appendChild(TIP);
  }
  return TIP;
}

function chartAt(svg, clientX) {
  const c = CHARTS.get(svg.dataset.chart);
  if (!c) return null;
  const r = svg.getBoundingClientRect();
  const vx = ((clientX - r.left) / r.width) * c.W;
  const hits = [];
  for (const s of c.series) {
    let best = null, bd = Infinity;
    for (const p of s.plot) {
      const d = Math.abs(p.x - vx);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) hits.push({ s, p: best, d: bd });
  }
  if (!hits.length) return null;
  const anchor = hits.reduce((a, b) => (a.d <= b.d ? a : b));
  return { c, hits: hits.filter(h => Math.abs(h.p.x - anchor.p.x) < 1.2), anchor, r };
}

function showTip(svg, clientX) {
  const h = chartAt(svg, clientX);
  if (!h) return;
  const { c, hits, anchor, r } = h;
  const t = tipEl();

  t.innerHTML =
    '<div class="tt-x mono">' + esc(c.xFmt(anchor.p.raw.x)) + '</div>' +
    (anchor.p.raw.vehicle ? '<div class="tt-v">' + esc(anchor.p.raw.vehicle) + '</div>' : '') +
    hits.map(x =>
      '<div class="tt-r"><i style="--c:' + (x.s.color || CHART_COLORS.cyan) + '"></i>' +
      '<span>' + esc(x.s.label) + '</span>' +
      '<b class="mono">' + esc(x.p.raw.text || c.yFmt(x.p.raw.y)) + '</b></div>').join('') +
    (anchor.p.raw.note ? '<div class="tt-n">' + esc(anchor.p.raw.note) + '</div>' : '') +
    (anchor.p.raw.source ? '<div class="tt-s mono">' + esc(anchor.p.raw.source) + '</div>' : '');
  t.classList.remove('hide');

  const px = r.left + (anchor.p.x / c.W) * r.width;
  const py = r.top + (anchor.p.y / c.H) * r.height;
  const tw = t.offsetWidth, th = t.offsetHeight;
  let L = px + 14;
  if (L + tw > window.innerWidth - 8) L = px - tw - 14;
  let T = py - th / 2;
  T = Math.max(8, Math.min(T, window.innerHeight - th - 8));
  t.style.left = Math.max(8, L) + 'px';
  t.style.top = T + 'px';

  const guide = svg.querySelector('.guide');
  if (guide) { guide.setAttribute('x1', anchor.p.x); guide.setAttribute('x2', anchor.p.x); guide.classList.remove('hide'); }
  const hv = svg.querySelector('.hovpts');
  if (hv) hv.innerHTML = hits.map(x =>
    '<circle class="hov" cx="' + x.p.x + '" cy="' + x.p.y + '" r="1.9" style="--c:' + (x.s.color || CHART_COLORS.cyan) + '"/>').join('');
  svg.__hit = anchor;
}

function hideTip(svg) {
  tipEl().classList.add('hide');
  if (!svg) return;
  svg.querySelector('.guide')?.classList.add('hide');
  const hv = svg.querySelector('.hovpts');
  if (hv) hv.innerHTML = '';
}

/* ============================================================
   MOUNTING
   Screens re-render by replacing innerHTML, so charts have to
   find themselves. An observer beats remembering to call a
   mount function from fourteen render paths.
   ============================================================ */
function mountCharts(root) {
  (root || document).querySelectorAll('svg.chart:not([data-mounted])').forEach(svg => {
    svg.dataset.mounted = '1';
    const move = e => showTip(svg, e.clientX);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', e => { showTip(svg, e.clientX); });
    svg.addEventListener('pointerleave', () => hideTip(svg));
    svg.addEventListener('blur', () => hideTip(svg));
    svg.addEventListener('click', () => {
      const hit = svg.__hit;
      const c = CHARTS.get(svg.dataset.chart);
      if (hit && c && c.spec.onPoint) c.spec.onPoint(hit.p.raw);
    });
    svg.addEventListener('keydown', e => {
      const c = CHARTS.get(svg.dataset.chart);
      if (!c) return;
      const pts = c.series[0]?.plot || [];
      if (!pts.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const cur = svg.__kbi === undefined ? -1 : svg.__kbi;
        svg.__kbi = Math.max(0, Math.min(pts.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
        const r = svg.getBoundingClientRect();
        showTip(svg, r.left + (pts[svg.__kbi].x / c.W) * r.width);
      } else if (e.key === 'Escape') { hideTip(svg); }
      else if (e.key === 'Enter' && svg.__hit && c.spec.onPoint) { c.spec.onPoint(svg.__hit.raw); }
    });
  });

  /* gauge and donut sweeps animate once, on the frame after mount */
  (root || document).querySelectorAll('.gauge-arc:not([data-swept]),.donut-seg:not([data-swept])').forEach(el => {
    el.dataset.swept = '1';
    if (stillCharts()) { el.style.strokeDashoffset = el.dataset.to; return; }
    requestAnimationFrame(() => { el.style.strokeDashoffset = el.dataset.to; });
  });
}

/* the app rebuilds screens wholesale; watch for it */
if (typeof window !== 'undefined' && window.MutationObserver) {
  new MutationObserver(() => mountCharts()).observe(document.documentElement, { childList: true, subtree: true });
}

/* ============================================================
   ACCESSIBLE DATA TABLE — the same numbers, no chart required
   ============================================================ */
function chartTable(id, btn) {
  const c = CHARTS.get(id);
  const box = document.getElementById('tbl-' + id);
  if (!c || !box) return;
  const open = box.classList.contains('hide');
  btn.setAttribute('aria-expanded', String(open));
  box.classList.toggle('hide', !open);
  if (!open || box.dataset.built) return;
  box.dataset.built = '1';

  const xs = [...new Set(c.series.flatMap(s => s.plot.map(p => p.raw.x)))]
    .sort((a, b) => c.xOf({ x: a }) - c.xOf({ x: b }));
  box.innerHTML = '<table class="dtable"><caption class="mlabel">' + esc(c.spec.title) + '</caption>' +
    '<thead><tr><th scope="col">' + esc(c.spec.xLabel || 'Point') + '</th>' +
    c.series.map(s => '<th scope="col">' + esc(s.label) + '</th>').join('') + '</tr></thead><tbody>' +
    xs.map(x => '<tr><th scope="row" class="mono">' + esc(c.xFmt(x)) + '</th>' +
      c.series.map(s => {
        const p = s.plot.find(q => q.raw.x === x);
        return '<td class="mono">' + (p ? esc(p.raw.text || c.yFmt(p.raw.y)) : '—') + '</td>';
      }).join('') + '</tr>').join('') +
    '</tbody></table>';
}

/* ============================================================
   CIRCULAR GAUGE
   value: 0..1, or null meaning "we don't know" — which it will
   say out loud instead of drawing a confident zero.
   ============================================================ */
function gauge(o) {
  const size = o.size || 132;
  const R = 42, C = 2 * Math.PI * R;
  const gap = 0.22;                       // open at the bottom, like an instrument cluster
  const arc = C * (1 - gap);
  const known = o.value !== null && o.value !== undefined && isFinite(o.value);
  const v = known ? Math.max(0, Math.min(1, o.value)) : 0;
  const tone = o.tone || 'primary';
  const gid = 'gg' + (++CHART_SEQ);

  const body = known
    ? '<div class="g-val">' + esc(o.display !== undefined ? o.display : Math.round(v * 100) + '%') + '</div>' +
      (o.sub ? '<div class="g-sub mono">' + esc(o.sub) + '</div>' : '')
    : '<div class="g-val none">—</div><div class="g-sub mono">NO DATA</div>';

  return '<div class="gauge tone-' + tone + (known ? '' : ' unknown') + '"' +
    (o.onClick ? ' role="button" tabindex="0" onclick="' + o.onClick + '" onkeydown="if(event.key===\'Enter\'){' + o.onClick + '}"' : '') + '>' +
    '<div class="g-ring" style="width:' + size + 'px;height:' + size + 'px">' +
    '<svg viewBox="0 0 100 100" role="img" aria-label="' + esc(o.label + ': ' + (known ? (o.display || Math.round(v * 100) + '%') : 'no data') + '. ' + (o.aria || '')) + '">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="1" x2="1" y2="0">' +
    '<stop offset="0%" stop-color="var(--g1)"/><stop offset="100%" stop-color="var(--g2)"/>' +
    '</linearGradient></defs>' +
    '<circle class="g-track" cx="50" cy="50" r="' + R + '" ' +
    'stroke-dasharray="' + arc + ' ' + C + '" transform="rotate(' + (90 + gap * 180) + ' 50 50)"/>' +
    (known ? '<circle class="gauge-arc" cx="50" cy="50" r="' + R + '" stroke="url(#' + gid + ')" ' +
      'stroke-dasharray="' + arc + ' ' + C + '" stroke-dashoffset="' + arc + '" data-to="' + (arc * (1 - v)) + '" ' +
      'transform="rotate(' + (90 + gap * 180) + ' 50 50)"/>' : '') +
    '<circle class="g-hub" cx="50" cy="50" r="' + (R - 9) + '"/>' +
    '</svg><div class="g-center">' + body + '</div></div>' +
    '<div class="g-label">' + esc(o.label) + '</div>' +
    (o.detail ? '<div class="g-detail note">' + o.detail + '</div>' : '') +
    '</div>';
}

/* ============================================================
   DONUT — spend by system, and nothing it can't account for
   ============================================================ */
function donut(o) {
  const segs = (o.segments || []).filter(s => s.value > 0);
  if (!segs.length) return chartEmpty(o.empty || { title: 'NOTHING CATEGORISED YET', height: 200 });
  const total = segs.reduce((a, s) => a + s.value, 0);
  const R = 38, C = 2 * Math.PI * R;
  const PALETTE = [CHART_COLORS.cyan, CHART_COLORS.violet, CHART_COLORS.magenta, CHART_COLORS.green,
                   CHART_COLORS.amber, '#4B8FE8', '#B06CD6', 'var(--dim)'];
  let acc = 0;
  const ring = segs.map((s, i) => {
    const frac = s.value / total;
    const dash = C * frac - 1.2;
    const off = -C * acc;
    acc += frac;
    return '<circle class="donut-seg" cx="50" cy="50" r="' + R + '" ' +
      'stroke="' + (s.color || PALETTE[i % PALETTE.length]) + '" ' +
      'stroke-dasharray="' + Math.max(0, dash) + ' ' + C + '" ' +
      'stroke-dashoffset="' + C + '" data-to="' + off + '" ' +
      (s.onClick ? 'tabindex="0" role="button" onclick="' + s.onClick + '" ' : '') +
      'transform="rotate(-90 50 50)"><title>' + esc(s.label + ' — ' + fmtMoneyX(s.value)) + '</title></circle>';
  }).join('');

  return '<div class="donutwrap">' +
    '<div class="donut"><svg viewBox="0 0 100 100" role="img" aria-label="' +
    esc(o.aria || (o.title || 'Breakdown') + '. ' + segs.map(s => s.label + ' ' + fmtMoneyX(s.value)).join(', ')) + '">' +
    '<circle class="donut-track" cx="50" cy="50" r="' + R + '"/>' + ring + '</svg>' +
    '<div class="donut-center"><b class="mono">' + esc(o.centerValue || fmtMoney(total)) + '</b>' +
    '<span class="mono">' + esc(o.centerLabel || 'TOTAL') + '</span></div></div>' +
    '<ul class="donutkey">' + segs.map((s, i) =>
      '<li' + (s.onClick ? ' tabindex="0" role="button" onclick="' + s.onClick + '"' : '') + '>' +
      '<i style="background:' + (s.color || PALETTE[i % PALETTE.length]) + '"></i>' +
      '<span>' + esc(s.label) + '</span>' +
      '<b class="mono">' + esc(fmtMoneyX(s.value)) + '</b>' +
      '<em class="mono">' + Math.round((s.value / total) * 100) + '%</em></li>').join('') +
    '</ul></div>';
}

/* ============================================================
   MICRO SPARKLINE — no axes, no lies. Nothing at all if there
   isn't enough history to have a shape.
   ============================================================ */
function spark(points, color, o) {
  const pts = (points || []).filter(p => isFinite(p));
  if (pts.length < 3) return '';
  const [lo, hi] = extent(pts);
  const W = 100, H = 28;
  const d = monotonePath(pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * W,
    y: H - ((v - lo) / (hi - lo || 1)) * (H - 4) - 2
  })));
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="' + d + '" style="--c:' + (color || CHART_COLORS.cyan) + '"/>' +
    (o && o.dot !== false ? '<circle class="tipdot" cx="' + W + '" cy="' +
      (H - ((pts[pts.length - 1] - lo) / (hi - lo || 1)) * (H - 4) - 2) + '" r="2" style="--c:' + (color || CHART_COLORS.cyan) + '"/>' : '') +
    '</svg>';
}

/* ============================================================
   METRIC TILE — the telemetry strip
   ============================================================ */
function metric(o) {
  return '<div class="metric' + (o.onClick ? ' tapme' : '') + '"' +
    (o.onClick ? ' role="button" tabindex="0" onclick="' + o.onClick + '" onkeydown="if(event.key===\'Enter\'){' + o.onClick + '}"' : '') + '>' +
    '<div class="m-top"><span class="m-ic tone-' + (o.tone || 'muted') + '">' + ic(o.icon || 'chart', 14) + '</span>' +
    '<span class="mlabel" style="margin:0">' + esc(o.label) + '</span></div>' +
    '<div class="m-val mono' + (o.value === null ? ' none' : '') + '">' + (o.value === null ? '—' : esc(String(o.value))) + '</div>' +
    (o.sub ? '<div class="m-sub note">' + esc(o.sub) + '</div>' : '') +
    (o.spark ? '<div class="m-spark">' + spark(o.spark, o.sparkColor) + '</div>' : '') +
    '</div>';
}

/* ---------- linear meter, for pad thickness and tread ---------- */
function meter(o) {
  const known = o.value !== null && o.value !== undefined && isFinite(o.value);
  const pct = known ? Math.max(0, Math.min(100, (o.value / (o.max || 1)) * 100)) : 0;
  return '<div class="meter tone-' + (o.tone || 'primary') + (known ? '' : ' unknown') + '">' +
    '<div class="mt-head"><span>' + esc(o.label) + '</span>' +
    '<b class="mono">' + (known ? esc(o.display || String(o.value)) : 'NOT MEASURED') + '</b></div>' +
    '<div class="mt-track" role="img" aria-label="' + esc(o.label + ': ' + (known ? (o.display || o.value) : 'not measured')) + '">' +
    (known ? '<div class="mt-fill" style="width:' + pct + '%"></div>' : '') +
    (o.threshold ? '<span class="mt-thr" style="left:' + Math.min(100, (o.threshold / (o.max || 1)) * 100) + '%" title="Threshold"></span>' : '') +
    '</div>' + (o.foot ? '<div class="mt-foot note">' + o.foot + '</div>' : '') + '</div>';
}

/* ---------- source / confidence chip ---------- */
const SOURCE_TONE = {
  'USER ENTERED': 'muted', 'IMPORTED': 'violet', 'MANUAL VERIFIED': 'ok',
  'MANUFACTURER SPEC': 'ok', 'CALCULATED': 'primary', 'NHTSA REFERENCE': 'violet',
  'NEEDS VERIFICATION': 'warn', 'FORECAST': 'warn', 'ESTIMATE': 'warn'
};
function srcChip(label) {
  if (!label) return '';
  const up = String(label).toUpperCase();
  return '<span class="srcchip tone-' + (SOURCE_TONE[up] || 'muted') + '">' + esc(up) + '</span>';
}
