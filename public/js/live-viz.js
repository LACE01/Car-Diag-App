/* ============================================================
   live-viz.js — the live-data trace viewer.

   Reads a recorded diagnostic session and plots up to three PIDs
   against a shared clock, with zoom and user annotations.

   What it deliberately does NOT do: tell you a value is normal.
   A "normal range" for coolant temperature, fuel trim or MAP is
   engine-specific, and the app has no manufacturer data. Drawing
   a green band from a plausible-sounding number would make a
   guess look like a specification. If you have a spec, you can
   enter it as a reference band and it will be labelled as yours.
   ============================================================ */
const LIVE = { session: null, id: null, primary: null, secondary: null, compare: null, zoom: 'all', notes: [] };

const ZOOMS = {
  all:  { label: 'FULL', ms: null },
  m5:   { label: '5 MIN', ms: 5 * 60000 },
  s60:  { label: '60 SEC', ms: 60000 },
  s10:  { label: '10 SEC', ms: 10000 }
};

async function openSession(id) {
  const r = await API.get('/sessions/' + id);
  LIVE.session = r; LIVE.id = id;
  LIVE.notes = await API.get('/sessions/' + id + '/notes').catch(() => []);
  const logs = r.datalogs || [];
  LIVE.primary = logs[0]?.pid || null;
  LIVE.secondary = logs[1]?.pid || null;
  LIVE.compare = null;
  LIVE.zoom = 'all';
  drawSession();
}

function drawSession() {
  const r = LIVE.session;
  if (!r) return;
  const box = document.getElementById('livebox');
  if (!box) return;
  box.innerHTML = sessionHeader(r) + liveChart(r) + freezeGrid(r) + noteList();
}

/* ---------- header ---------- */
function sessionHeader(r) {
  const s = r.session;
  const v = activeVehicle() || {};
  return '<div class="card tight" style="margin-bottom:14px"><div class="sesshead">' +
    hcell('Vehicle', esc(v.nickname || vLabel(v))) +
    hcell('Session', esc(fmtDay(s.started_at)) + ' ' + esc((s.started_at.slice(11, 16)) || '')) +
    hcell('Odometer', s.odometer ? s.odometer.toLocaleString() : '—') +
    hcell('Source', esc(s.imported_from || s.adapter || 'Unknown')) +
    hcell('Protocol', esc(s.protocol || '—')) +
    hcell('Codes', String((r.dtcs || []).length)) +
    '</div></div>';
}
const hcell = (k, v) => '<div><span class="mlabel">' + k + '</span><b class="mono">' + v + '</b></div>';

/* ---------- the trace ---------- */
function liveChart(r) {
  const logs = r.datalogs || [];
  if (!logs.length) {
    return panel({ title: 'DIAG', sub: 'LIVE DATA', table: false },
      chartEmpty({
        title: 'NO LIVE DATA IN THIS SESSION',
        body: 'This session recorded codes but no PID trace. Start a live recording with an adapter connected, or import a scan-tool log.',
        action: { label: '+ IMPORT SCAN', run: 'importReport()' }, height: 220
      }));
  }

  const byPid = Object.fromEntries(logs.map(l => [l.pid, l]));
  const slots = [
    { key: 'primary', label: 'PRIMARY', color: 'cyan' },
    { key: 'secondary', label: 'SECOND', color: 'violet' },
    { key: 'compare', label: 'COMPARE', color: 'magenta' }
  ];

  /* zoom window is measured from the END of the trace, which is
     where the interesting part usually is — you notice the misfire
     and then look at what just happened. */
  const maxT = Math.max(...logs.flatMap(l => l.samples.map(s => s[0])), 0);
  const win = ZOOMS[LIVE.zoom].ms;
  const from = win ? Math.max(0, maxT - win) : 0;

  const series = slots.map(sl => {
    const pid = LIVE[sl.key];
    const log = pid && byPid[pid];
    if (!log) return null;
    const pts = log.samples
      .filter(([t]) => t >= from)
      .map(([t, y]) => ({
        x: t, y,
        text: y + (log.unit ? ' ' + log.unit : ''),
        note: log.name || log.pid,
        source: 'IMPORTED'
      }));
    if (!pts.length) return null;
    return { key: sl.key, label: (log.name || log.pid) + (log.unit ? ' (' + log.unit + ')' : ''),
             color: CHART_COLORS[sl.color], points: pts, fill: sl.key === 'primary' };
  }).filter(Boolean);

  /* user annotations become thin markers, never blocking overlays */
  const markers = LIVE.notes.filter(n => n.t_ms >= from).map(n => ({
    x: n.t_ms, label: n.text,
    color: n.severity === 'critical' ? CHART_COLORS.red : n.severity === 'warn' ? CHART_COLORS.amber : CHART_COLORS.green
  }));

  const pidSel = slots.map(sl =>
    '<label class="pidpick"><span class="mono" style="color:' + CHART_COLORS[sl.color] + '">' + sl.label + '</span>' +
    sel('pid-' + sl.key,
      [['', '—'], ...logs.map(l => [l.pid, (l.name || l.pid)])],
      LIVE[sl.key] || '',
      { onchange: "setPid('" + sl.key + "',this.value)", aria: sl.label + ' PID' }) +
    '</label>').join('');

  const zoomBar = '<div class="periods" role="group" aria-label="Time window">' +
    Object.entries(ZOOMS).map(([k, z]) =>
      '<button class="' + (LIVE.zoom === k ? 'on' : '') + '" aria-pressed="' + (LIVE.zoom === k) + '" ' +
      'onclick="setZoom(\'' + k + '\')">' + z.label + '</button>').join('') + '</div>';

  const chart = series.length
    ? lineChart({
        id: 'live', title: 'DIAG', sub: 'LIVE DATA', wide: true,
        series, height: 260, xLabel: 'Time',
        markers,
        maxPoints: 600,
        yFmt: v => abbrev(v, 1),
        xFmt: t => (t / 1000).toFixed(0) + 's',
        xFmtFull: t => (t / 1000).toFixed(1) + ' s into the session',
        onPoint: p => addLiveNote(p.x),
        head: zoomBar,
        foot: srcChip('IMPORTED') +
          '<button class="btn xs ghost" onclick="addLiveNote()">+ ADD A MARKER</button>' +
          '<span>Click any point to mark it. Garage does not label readings normal or abnormal — ' +
          'that judgement needs a specification for your engine, which it does not have.</span>'
      })
    : panel({ title: 'DIAG', sub: 'LIVE DATA', wide: true, table: false },
        chartEmpty({ title: 'SELECT A PID TO PLOT', body: 'Pick one from the selectors above.', height: 240 }), zoomBar);

  return '<div class="pidbar">' + pidSel + '</div>' + chart;
}

function setPid(slot, pid) { LIVE[slot] = pid || null; drawSession(); }
function setZoom(z) { LIVE.zoom = z; drawSession(); }

/* ---------- annotations ---------- */
function addLiveNote(tMs) {
  const t = tMs != null ? Math.round(tMs) : 0;
  openModal(modalHead('Mark this moment', 'At ' + (t / 1000).toFixed(1) + ' seconds into the session') +
    fld('What did you observe?', inp('n-text', { ph: 'Stumble under load, felt through the seat' })) +
    '<div style="height:14px"></div>' +
    fld('Severity', sel('n-sev', [['note', 'Note'], ['warn', 'Worth watching'], ['critical', 'Serious']], 'note')) +
    '<p class="note" style="margin:12px 0 16px">Markers are yours. They record what you noticed, not a diagnosis.</p>' +
    '<button class="btn block" onclick="saveLiveNote(' + t + ')">Save marker</button>');
}

async function saveLiveNote(t) {
  const text = val('n-text').trim();
  if (!text) return toast('Add a short description', 'bad');
  await API.post('/sessions/' + LIVE.id + '/notes', { t_ms: t, text, severity: val('n-sev') });
  LIVE.notes = await API.get('/sessions/' + LIVE.id + '/notes');
  closeModal(); drawSession(); toast('Marker saved', 'ok');
}

function noteList() {
  if (!LIVE.notes.length) return '';
  return '<div class="card tight" style="margin-top:14px"><span class="mlabel">Your markers</span>' +
    LIVE.notes.map(n =>
      '<div class="kv"><span class="mono" style="flex:0 0 62px;text-align:left;color:var(--dim)">' +
      (n.t_ms / 1000).toFixed(1) + 's</span>' +
      '<span style="flex:1;text-align:left">' + esc(n.text) + '</span>' +
      '<span class="srcchip tone-' + (n.severity === 'critical' ? 'bad' : n.severity === 'warn' ? 'warn' : 'muted') + '">' +
      esc(n.severity.toUpperCase()) + '</span>' +
      '<button class="btn xs ghost" onclick="delLiveNote(' + n.id + ')">×</button></div>').join('') +
    '</div>';
}
async function delLiveNote(id) {
  await API.del('/notes/' + id);
  LIVE.notes = LIVE.notes.filter(n => n.id !== id);
  drawSession();
}

/* ---------- freeze frame ---------- */
function freezeGrid(r) {
  const withFF = (r.dtcs || []).filter(d => d.freeze_frame);
  if (!withFF.length) return '';

  return withFF.map(d => {
    let ff = d.freeze_frame;
    if (typeof ff === 'string') { try { ff = JSON.parse(ff); } catch { return ''; } }
    const rows = Object.entries(ff);
    return '<div style="height:16px"></div>' + panel({
      title: 'FREEZE FRAME', sub: d.code, table: false,
      note: 'The operating conditions the ECM recorded at the moment this code set.',
      foot: srcChip('IMPORTED') +
        '<span>Reproduce these conditions and you reproduce the fault. Values are as reported by the ' +
        'module — Garage does not convert, normalise or judge them.</span>'
    },
      '<div class="ffgrid">' + rows.map(([k, v]) =>
        '<div class="ffcell"><span class="mlabel">' + esc(k) + '</span><b class="mono">' + esc(String(v)) + '</b></div>'
      ).join('') + '</div>');
  }).join('');
}
