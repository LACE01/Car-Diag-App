/* ============================================================
   torque.js — tightening sequence generator

   A tightening sequence is geometry, not authorship. Centre-out on a
   head, star on a wheel, criss-cross on a circular flange: these follow
   from how a clamped joint distributes load, and they are the same fact
   whoever prints them. So this generates them rather than copying them.

   What this does NOT do is invent torque VALUES. A number pulled from
   nowhere and torqued into an aluminium head is how you buy a head. The
   value fields are yours to fill from a source you actually hold, and the
   source is stored next to the number.
   ============================================================ */

const LAYOUTS = {
  'head-inline': {
    label: 'Cylinder head — inline',
    hint: 'Two rows of bolts down the head. Always centre-out, alternating side to side, so the gasket is squeezed from the middle outward and never trapped.',
    defaults: { bolt_count: 10 }
  },
  'head-v': {
    label: 'Cylinder head — V bank',
    hint: 'Same principle per bank. Do one bank completely before starting the other unless the manual says otherwise.',
    defaults: { bolt_count: 8 }
  },
  rect: {
    label: 'Rectangular cover or pan',
    hint: 'Valve covers, oil pans, intake manifolds, transmission pans. Centre-out spiral. These are almost always inch-pounds — reach for the small wrench, not the big one.',
    defaults: { bolt_count: 12 }
  },
  circular: {
    label: 'Circular flange',
    hint: 'Thermostat housings, water pumps, pressure plates, driveshaft flanges. Criss-cross across the diameter, never round the clock.',
    defaults: { bolt_count: 6 }
  },
  wheel: {
    label: 'Wheel / lug nuts',
    hint: 'Star pattern. Torque cold, in stages, with the wheel off the ground but not hanging, then re-check after 50 to 100 miles — alloy wheels relax as they seat.',
    defaults: { bolt_count: 8 }
  },
  linear: {
    label: 'Single row',
    hint: 'Exhaust manifolds, thermostat necks, anything in a line. Centre-out.',
    defaults: { bolt_count: 6 }
  }
};

/* ---------- ordering ---------- */

/**
 * Star / criss-cross on a circle.
 *
 * Even counts have true opposites, so the sequence is built from
 * opposite PAIRS, and the pairs themselves are visited in a star.
 * That reproduces the sequences printed in every manual:
 *   4  → 1,3,2,4      6  → 1,4,2,5,3,6
 *   8  → 1,5,3,7,2,6,4,8
 *   10 → 1,6,3,8,5,10,2,7,4,9
 * Odd counts have no opposite, so step by floor(n/2):
 *   5  → 1,3,5,2,4
 */
function circularOrder(n) {
  if (n % 2 === 0 && n >= 4) {
    const half = n / 2;
    const pairOrder = circularOrder(half);          // star across the pairs
    const order = [];
    for (const p of pairOrder) { order.push(p); order.push(p + half); }
    return order;
  }
  const step = Math.max(1, Math.floor(n / 2));
  const order = [];
  const seen = new Set();
  let i = 0;
  for (let k = 0; k < n; k++) {
    while (seen.has(i)) i = (i + 1) % n;
    order.push(i);
    seen.add(i);
    i = (i + step) % n;
  }
  return order;
}

/**
 * Centre-out: the head, pan and cover rule.
 *
 * Work strictly outward from the middle so the gasket is squeezed from
 * the centre and air is pushed out rather than trapped. Fasteners at the
 * same radius are taken in a fixed row-then-column order, which naturally
 * alternates side to side as the ring expands — a 10-bolt two-row head
 * comes out as the two centre bolts, then left, right, left, right.
 */
function centreOutOrder(positions) {
  const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
  const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
  return positions
    .map((p, i) => ({ i, d: Math.round(Math.hypot(p.x - cx, p.y - cy) * 10) / 10, x: p.x, y: p.y }))
    .sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x)
    .map(p => p.i);
}

/* ---------- geometry ---------- */
function positionsFor(layout, n, rows, cols) {
  const P = [];
  if (layout === 'circular' || layout === 'wheel') {
    const r = 150;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      P.push({ x: 220 + r * Math.cos(a), y: 200 + r * Math.sin(a) });
    }
  } else if (layout === 'linear') {
    for (let i = 0; i < n; i++) P.push({ x: 60 + i * (360 / Math.max(1, n - 1)), y: 200 });
  } else if (layout === 'rect') {
    // bolts around the perimeter of a cover
    const w = 340, h = 220, x0 = 50, y0 = 90;
    const per = [];
    const perim = 2 * (w + h);
    for (let i = 0; i < n; i++) {
      let d = (i / n) * perim;
      if (d < w) per.push({ x: x0 + d, y: y0 });
      else if (d < w + h) per.push({ x: x0 + w, y: y0 + (d - w) });
      else if (d < 2 * w + h) per.push({ x: x0 + w - (d - w - h), y: y0 + h });
      else per.push({ x: x0, y: y0 + h - (d - 2 * w - h) });
    }
    P.push(...per);
  } else {
    // head: two rows (or `rows` rows) evenly spaced
    const R = rows || 2;
    const C = cols || Math.ceil(n / R);
    let k = 0;
    for (let r = 0; r < R && k < n; r++) {
      for (let c = 0; c < C && k < n; c++, k++) {
        P.push({ x: 70 + c * (320 / Math.max(1, C - 1)), y: 130 + r * (140 / Math.max(1, R - 1)) });
      }
    }
  }
  return P;
}

/** The whole thing: positions + the order to tighten them in. */
function buildPattern({ layout = 'head-inline', bolt_count = 10, rows, cols }) {
  const n = Math.max(2, Math.min(40, +bolt_count || 2));
  const positions = positionsFor(layout, n, rows, cols);
  const order = (layout === 'circular' || layout === 'wheel')
    ? circularOrder(n)
    : centreOutOrder(positions);
  // number[i] = the position of bolt i in the tightening order (1-based)
  const number = new Array(n);
  order.forEach((posIndex, seq) => { number[posIndex] = seq + 1; });
  return { layout, n, positions, order, number, hint: LAYOUTS[layout]?.hint || '' };
}

/* ---------- render ---------- */
function torqueSvg(pattern, opts = {}) {
  const { positions, number, layout, n } = pattern;
  const upTo = opts.upTo ?? n;           // for animation: how many are tightened
  const title = opts.title || (LAYOUTS[layout]?.label || 'Tightening sequence');

  const body = (() => {
    if (layout === 'circular' || layout === 'wheel') {
      return '<circle cx="220" cy="200" r="175" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.8"/>' +
        '<circle cx="220" cy="200" r="62" fill="#EFEDFB" stroke="#2B2D42" stroke-width="1.4"/>' +
        (layout === 'wheel' ? '<circle cx="220" cy="200" r="196" fill="none" stroke="#8B8AA5" stroke-width="10" opacity=".5"/>' : '');
    }
    if (layout === 'rect') return '<rect x="50" y="90" width="340" height="220" rx="10" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.8"/>';
    if (layout === 'linear') return '<rect x="40" y="170" width="360" height="60" rx="8" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.8"/>';
    return '<rect x="40" y="90" width="360" height="220" rx="10" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.8"/>' +
      '<path d="M40 200h360" stroke="#8B8AA5" stroke-width="1" stroke-dasharray="5 5"/>';
  })();

  // leader line following the sequence, drawn only as far as `upTo`
  const path = pattern.order.slice(0, upTo).map((pi, i) =>
    (i ? 'L' : 'M') + positions[pi].x.toFixed(1) + ' ' + positions[pi].y.toFixed(1)).join('');

  const bolts = positions.map((p, i) => {
    const seq = number[i];
    const done = seq <= upTo;
    const current = seq === upTo;
    const fill = current ? '#6C5CE7' : done ? '#DDD8FA' : '#fff';
    const txt = current ? '#fff' : '#2B2D42';
    return '<g>' +
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (current ? 17 : 14) + '" ' +
      'fill="' + fill + '" stroke="#2B2D42" stroke-width="' + (current ? 2.4 : 1.5) + '"/>' +
      '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 4.5).toFixed(1) + '" text-anchor="middle" ' +
      'font-family="Inter,sans-serif" font-size="13" font-weight="700" fill="' + txt + '">' + seq + '</text></g>';
  }).join('');

  return '<svg viewBox="0 0 440 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#fff;border-radius:14px">' +
    '<rect x="4" y="4" width="432" height="392" rx="10" fill="#fff" stroke="#2B2D42" stroke-width="1.2"/>' +
    '<rect x="4" y="4" width="432" height="30" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.2"/>' +
    '<text x="18" y="24" font-family="Poppins,Inter,sans-serif" font-size="12" font-weight="700" fill="#2B2D42">' +
    esc(title.toUpperCase()) + '</text>' +
    '<text x="422" y="24" text-anchor="end" font-family="Inter" font-size="9" fill="#8B8AA5">' + n + ' FASTENERS</text>' +
    body +
    '<path d="' + path + '" fill="none" stroke="#6C5CE7" stroke-width="2" stroke-dasharray="6 4" opacity=".55"/>' +
    bolts +
    '<text x="18" y="386" font-family="Inter" font-size="9" fill="#8B8AA5">Numbers are the tightening ORDER, not fastener identifiers. Loosen in reverse.</text>' +
    '</svg>';
}

/* ---------- UI ---------- */
let TQ = { layout: 'head-inline', bolt_count: 10, rows: 2, cols: null, upTo: null, timer: null, saved: [] };

async function loadTorquePatterns() {
  try { TQ.saved = (await API.get('/torque-patterns')).patterns; } catch { TQ.saved = []; }
}

function torqueStudio(preset) {
  Object.assign(TQ, { layout: 'head-inline', bolt_count: 10, rows: 2, upTo: null }, preset || {});
  openModal(torqueStudioHtml(), true);
  drawTorque();
}

function torqueStudioHtml() {
  return modalHead('Tightening sequence',
    'Pick the joint and the fastener count and the pattern is generated. Sequences are geometry — the same fact whoever prints them. The torque <b>values</b> are yours to enter from a source you hold.') +
    '<div class="grid g3" style="gap:14px">' +
    fld('Joint', sel('tq-layout', Object.entries(LAYOUTS).map(([k, v]) => [k, v.label]), TQ.layout)) +
    fld('Fasteners', inp('tq-n', { type: 'number', mono: true, min: 2, value: TQ.bolt_count })) +
    fld('Rows (heads)', inp('tq-rows', { type: 'number', mono: true, min: 1, value: TQ.rows })) +
    '</div>' +
    '<div id="tq-out" style="margin-top:16px"></div>' +
    '<div class="row wrap" style="gap:8px;margin-top:12px">' +
    '<button class="btn sm ghost" onclick="animateTorque()">Play sequence</button>' +
    '<button class="btn sm ghost" onclick="TQ.upTo=null;drawTorque()">Show all</button>' +
    '<button class="btn sm" onclick="saveTorquePattern()">Save to this vehicle</button>' +
    '</div>' +
    '<div id="tq-hint" class="note" style="margin-top:12px"></div>' +
    '<div style="height:16px"></div>' +
    '<span class="mlabel">Stages — enter the values from your own source</span>' +
    '<div id="tq-stages">' + stageRow(0, { label: 'Stage 1', value: '', unit: 'lb-ft' }) +
    stageRow(1, { label: 'Stage 2', value: '', unit: 'lb-ft' }) +
    stageRow(2, { label: 'Final', value: '', unit: 'lb-ft', angle: '' }) + '</div>' +
    '<div class="grid g2" style="gap:14px;margin-top:14px">' +
    fld('Where the spec came from', sel('tq-source', [
      ['', 'Select…'], ['Mitchell1 DIY', 'Mitchell1 DIY'], ['ALLDATAdiy', 'ALLDATAdiy'],
      ['ChiltonLibrary', 'ChiltonLibrary'], ['EBSCO Auto Repair Source', 'EBSCO Auto Repair Source'],
      ['Factory service manual', 'Factory service manual'], ['OEM service portal', 'OEM service portal'],
      ['Other', 'Other']], '')) +
    fld('Reference', inp('tq-ref', { ph: 'Section / page / document number' })) +
    '</div>' +
    '<div style="height:14px"></div>' + fld('Name', inp('tq-name', { ph: 'Valve cover — 6.7 Powerstroke' })) +
    '<p class="note" style="margin:14px 0 0"><b>Torque-to-yield fasteners are single use.</b> Head bolts on most modern engines stretch permanently and must be replaced, not re-torqued. If your spec ends in a degrees-of-rotation stage, assume TTY until the manual says otherwise.</p>';
}

function stageRow(i, s) {
  return '<div class="grid g4" style="gap:10px;margin-bottom:8px" data-stage="' + i + '">' +
    inp('tq-s' + i + '-label', { value: s.label }) +
    inp('tq-s' + i + '-value', { type: 'number', step: '0.1', mono: true, ph: 'value' }) +
    sel('tq-s' + i + '-unit', ['lb-ft', 'lb-in', 'N·m'], s.unit || 'lb-ft') +
    inp('tq-s' + i + '-angle', { type: 'number', mono: true, ph: '° angle' }) +
    '</div>';
}

function drawTorque() {
  TQ.layout = val('tq-layout') || TQ.layout;
  TQ.bolt_count = intVal('tq-n') || TQ.bolt_count;
  TQ.rows = intVal('tq-rows') || 2;
  const p = buildPattern(TQ);
  const out = document.getElementById('tq-out');
  if (out) out.innerHTML = torqueSvg(p, { upTo: TQ.upTo ?? p.n });
  const hint = document.getElementById('tq-hint');
  if (hint) hint.textContent = p.hint;
  TQ.pattern = p;
}

function animateTorque() {
  clearInterval(TQ.timer);
  const p = TQ.pattern || buildPattern(TQ);
  let i = 1;
  TQ.upTo = 1; drawTorque();
  TQ.timer = setInterval(() => {
    i++;
    if (i > p.n) { clearInterval(TQ.timer); TQ.upTo = null; drawTorque(); return; }
    TQ.upTo = i; drawTorque();
  }, 420);
}

async function saveTorquePattern() {
  const stages = [0, 1, 2].map(i => ({
    label: val('tq-s' + i + '-label'),
    value: numVal('tq-s' + i + '-value'),
    unit: val('tq-s' + i + '-unit'),
    angle: numVal('tq-s' + i + '-angle')
  })).filter(s => s.value != null || s.angle != null);

  try {
    const r = await API.post('/torque-patterns', {
      vehicle_id: state.activeId, name: val('tq-name') || (LAYOUTS[TQ.layout]?.label || 'Pattern'),
      layout: TQ.layout, bolt_count: TQ.bolt_count, rows: TQ.rows,
      stages, source: val('tq-source'), note: val('tq-ref')
    });
    await loadTorquePatterns();
    closeModal();
    toast('Pattern saved' + (stages.length ? ' with ' + stages.length + ' stages' : ' — add the torque values when you have them'), 'ok');
    if (window.rerender) window.rerender();
  } catch (e) { toast(e.message, 'bad'); }
}

/* re-render on any input change */
document.addEventListener('input', e => {
  if (e.target && /^tq-(layout|n|rows)$/.test(e.target.id)) { TQ.upTo = null; drawTorque(); }
});
document.addEventListener('change', e => {
  if (e.target && e.target.id === 'tq-layout') { TQ.upTo = null; drawTorque(); }
});
