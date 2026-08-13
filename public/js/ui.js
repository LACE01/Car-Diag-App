/* ============================================================
   ui.js — API client, formatting, modals, drawer, toasts.
   Offline-first: every GET is mirrored into localStorage so the
   app still renders in a garage with no signal.
   ============================================================ */

/* ---------- formatting ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function num(n, d) {
  if (n == null || n === '' || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d ?? 0 });
}
function money(n, d) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 });
}
function dateShort(s) {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function today() { return new Date().toISOString().slice(0, 10); }
function vLabel(v) { return v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : ''; }

/* unit conversion for display only — storage is always imperial */
const UNITS = { metric: false };
function dist(mi, withUnit) {
  if (mi == null) return '—';
  return UNITS.metric ? num(mi * 1.609344) + (withUnit ? ' km' : '') : num(mi) + (withUnit ? ' mi' : '');
}
function distUnit() { return UNITS.metric ? 'km' : 'mi'; }

/* ---------- API ---------- */
const CACHE_PREFIX = 'garage.cache.';
const API = {
  async req(method, url, body, isForm) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    let r;
    try {
      r = await fetch('/api' + url, opts);
    } catch (e) {
      if (method === 'GET') {
        const cached = API.readCache(url);
        if (cached) { setNet('cache'); return cached; }
      }
      setNet('offline');
      throw new Error('Cannot reach the Garage server. Check the container is running.');
    }
    let data = null;
    try { data = await r.json(); } catch { data = {}; }
    if (r.status === 401) { window.__signedOut && window.__signedOut(); throw new Error(data.error || 'Not signed in'); }
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    setNet('online');
    if (method === 'GET') API.writeCache(url, data);
    return data;
  },
  get: (u) => API.req('GET', u),
  post: (u, b) => API.req('POST', u, b === undefined ? {} : b),
  patch: (u, b) => API.req('PATCH', u, b),
  del: (u) => API.req('DELETE', u),
  form: (u, fd) => API.req('POST', u, fd, true),

  writeCache(url, data) {
    try { localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ at: Date.now(), data })); } catch { }
  },
  readCache(url) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + url);
      if (!raw) return null;
      return JSON.parse(raw).data;
    } catch { return null; }
  },
  cacheAge(url) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + url);
      return raw ? Date.now() - JSON.parse(raw).at : null;
    } catch { return null; }
  }
};

let NET = 'unknown';
function setNet(s) {
  if (NET === s) return;
  NET = s;
  const p = document.getElementById('netpill');
  if (!p) return;
  const map = {
    online: ['var(--ok)', 'LINK // LIVE'],
    cache: ['var(--warn)', 'LINK // CACHED'],
    offline: ['var(--bad)', 'LINK // DOWN']
  };
  const [c, t] = map[s] || ['var(--dim)', 'LINK // …'];
  p.innerHTML = '<span class="dot" style="background:' + c + '"></span> ' + t;
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, kind) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'on ' + (kind || '');
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.className = kind || ''; }, kind === 'bad' ? 6500 : 3200);
}

/* ---------- modal ---------- */
function openModal(html, wide) {
  const box = document.getElementById('mbox');
  box.className = 'mbox' + (wide ? ' wide' : '');
  box.innerHTML = html;
  // `modal-open`, not `modal` — see the note in app.css. A body flag must never
  // share a name with an element class.
  document.body.classList.add('modal-open');
  const first = box.querySelector('input:not([type=hidden]),select,textarea');
  if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 60);
}
function closeModal() { document.body.classList.remove('modal-open'); }
function modalHead(title, sub) {
  return '<div class="between" style="margin-bottom:' + (sub ? '2px' : '18px') + '">' +
    '<h3 style="font-size:20px">' + esc(title) + '</h3>' +
    '<button onclick="closeModal()" style="font-size:24px;color:var(--muted);line-height:1">&times;</button></div>' +
    (sub ? '<p class="note" style="margin:0 0 18px">' + sub + '</p>' : '');
}

/* ---------- form helpers ---------- */
function fld(label, inner) {
  return '<div><span class="mlabel">' + esc(label) + '</span>' + inner + '</div>';
}
function inp(id, opts) {
  const o = opts || {};
  return '<input class="inp ' + (o.mono ? 'mono' : '') + '" id="' + id + '" type="' + (o.type || 'text') + '"' +
    (o.value != null ? ' value="' + esc(o.value) + '"' : '') +
    (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
    (o.step ? ' step="' + o.step + '"' : '') +
    (o.min != null ? ' min="' + o.min + '"' : '') + '>';
}
function sel(id, options, value) {
  return '<select class="inp" id="' + id + '">' + options.map(o => {
    const val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
    return '<option value="' + esc(val) + '"' + (String(val) === String(value) ? ' selected' : '') + '>' + esc(lab) + '</option>';
  }).join('') + '</select>';
}
function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
function numVal(id) { const v = parseFloat(val(id)); return isNaN(v) ? null : v; }
function intVal(id) { const v = parseInt(val(id), 10); return isNaN(v) ? null : v; }

/* ---------- drawer ---------- */
function closeInsp() {
  document.body.classList.remove('insp');
  document.querySelectorAll('.hot.sel,.keyrow.sel').forEach(g => g.classList.remove('sel'));
}

/* ---------- telemetry ----------
   Metric modules read like an instrument cluster: mono numerals with
   tabular figures so they do not jitter while counting, a technical
   label, and colour only where it means something. */
function telemetry(cells) {
  return '<div class="telem">' + cells.map(c =>
    '<div class="cell ' + (c.tone || '') + '">' +
    '<div class="lab">' + (c.icon ? ic(c.icon, 12) : '') + esc(c.label) + '</div>' +
    '<div class="v ' + (String(c.value).length > 9 ? 'sm' : '') + '"' +
    (c.count ? ' data-count="' + c.count + '"' + (c.prefix ? ' data-prefix="' + esc(c.prefix) + '"' : '') + '' : '') +
    '>' + c.value + '</div>' +
    (c.unit ? '<div class="u">' + esc(c.unit) + '</div>' : '') +
    '</div>').join('') + '</div>';
}

/* Numbers count in once on load — the way a cluster sweeps at key-on.
   Skipped entirely under prefers-reduced-motion. */
function runCounters(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  (root || document).querySelectorAll('[data-count]').forEach(el => {
    const target = parseFloat(el.dataset.count);
    if (!isFinite(target)) return;
    const prefix = el.dataset.prefix || '';
    const dec = (el.dataset.count.split('.')[1] || '').length;
    if (reduce) { el.textContent = prefix + num(target, dec); return; }
    const dur = 560, t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = prefix + num(target * eased, dec);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/* ---------- small charts, drawn inline (no chart library) ---------- */
function sparkline(values, opts) {
  const o = opts || {};
  if (!values || values.length < 2) return '<p class="note" style="margin:0">Not enough data points yet.</p>';
  const w = 300, h = 64, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || 1;
  const pts = values.map((v, i) => [
    pad + i * (w - pad * 2) / (values.length - 1),
    h - pad - (v - min) / span * (h - pad * 2)
  ]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const area = d + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + h + 'L' + pts[0][0].toFixed(1) + ' ' + h + 'Z';
  const col = o.color || 'var(--primary)';
  const ticks = [0, .25, .5, .75, 1].map(f =>
    '<line x1="0" x2="' + w + '" y1="' + (pad + f * (h - pad * 2)).toFixed(1) + '" y2="' + (pad + f * (h - pad * 2)).toFixed(1) +
    '" stroke="var(--line)" stroke-width=".5" opacity=".7"/>').join('');
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + ticks +
    '<path d="' + area + '" fill="' + col + '" opacity=".10"/>' +
    '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
    pts.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="1.8" fill="' + col + '"/>').join('') +
    '</svg>';
}

function barsChart(rows, opts) {
  const o = opts || {};
  if (!rows.length) return '<p class="note" style="margin:0">Nothing logged yet.</p>';
  const max = Math.max(...rows.map(r => r[1])) || 1;
  return rows.map(r =>
    '<div style="margin-bottom:11px"><div class="between" style="margin-bottom:5px">' +
    '<span style="font-size:13px;font-weight:500">' + esc(r[0]) + '</span>' +
    '<b class="mono" style="font-size:12.5px">' + (o.fmt ? o.fmt(r[1]) : num(r[1])) + '</b></div>' +
    '<div class="bar"><i style="width:' + Math.max(2, r[1] / max * 100).toFixed(1) + '%;background:' + (r[2] || 'var(--primary)') + '"></i></div></div>'
  ).join('');
}

/* ---------- generic confirm ---------- */
function confirmDo(question, detail, fn, danger) {
  openModal(modalHead(question, detail) +
    '<div class="row" style="gap:10px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Cancel</button>' +
    '<button class="btn ' + (danger ? 'danger' : '') + '" style="flex:1" id="cfmbtn">Confirm</button></div>');
  document.getElementById('cfmbtn').onclick = async () => { closeModal(); await fn(); };
}

/* ---------- safety interstitial ---------- */
const SAFETY = {
  srs: { title: 'Supplemental restraint system', body: 'SRS circuits can deploy an airbag or pretensioner with enough force to kill you. Disconnect the battery and wait the manufacturer-specified discharge time — typically 10 minutes — before probing anything yellow. Never apply power or ground to a squib circuit, and never use a test light on SRS wiring.' },
  hv: { title: 'High-voltage system', body: 'Orange cable carries several hundred volts DC at currents that will stop your heart. Only work on HV systems with proper class-0 gloves, an insulated tool set, and after removing the service disconnect and waiting the specified capacitor discharge time. Verify zero volts with a CAT III meter before touching anything.' },
  fuel: { title: 'Fuel system', body: 'Relieve fuel pressure before opening any line. Fuel spray at rail pressure atomises and ignites readily. No open flame, no droplights with hot bulbs, ventilate the area, and keep an extinguisher within reach.' },
  lift: { title: 'Vehicle support', body: 'Never work under a vehicle supported only by a jack. Use rated stands on a hard level surface at the manufacturer\'s lift points, chock the wheels that stay on the ground, and shake the vehicle before you go under it.' }
};
function safetyBox(kind) {
  const s = SAFETY[kind];
  if (!s) return '';
  return '<div class="safety" style="margin:14px 0"><b>Safety — ' + esc(s.title) + '</b>' + esc(s.body) + '</div>';
}

/* ---------- boot preferences ---------- */
function applyPrefs() {
  // The app is dark by default — it is an instrument panel. "Daylight"
  // is the high-contrast light variant for reading it outside at noon.
  const day = localStorage.getItem('garage.daylight') === '1';
  const gm = localStorage.getItem('garage.garagemode') === '1';
  const metric = localStorage.getItem('garage.metric') === '1';
  document.body.classList.toggle('daylight', day);
  document.body.classList.toggle('garagemode', gm);
  UNITS.metric = metric;
  const set = (id, on) => { const e = document.getElementById(id); if (e) e.classList.toggle('on', on); };
  set('t-day', day); set('t-gm', gm); set('t-metric', metric);
}
function togglePref(key, cls) {
  const cur = localStorage.getItem('garage.' + key) === '1';
  localStorage.setItem('garage.' + key, cur ? '0' : '1');
  applyPrefs();
  if (key === 'garagemode' && !cur) {
    toast('Garage mode on — bigger targets, screen stays awake');
    keepAwake(true);
  } else if (key === 'garagemode') keepAwake(false);
  if (window.rerender) window.rerender();
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch { /* not supported, not important */ }
}
