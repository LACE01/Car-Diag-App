/* ============================================================
   diagnose.js — the scanner screen
   ============================================================ */
let liveTimer = null;
let liveData = {};       // pid -> {def, samples:[[t,v]]}
let liveRecording = false;
let liveStart = 0;
let lastMonitors = null;
let PLAY_SCAN = false;   // drives the sweeping scan line while a read is in flight

function renderDiagnose() {
  const el = document.getElementById('s-diagnose');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'run a scan and read trouble codes');
  const d = D();
  const open = (d.dtcs || []).filter(t => !t.cleared_at);
  const cleared = (d.dtcs || []).filter(t => t.cleared_at);
  const connected = adapter && adapter.connected;

  el.innerHTML =
    /* ---- scan bay: a vehicle outline with a cyan line sweeping it ---- */
    (connected
      ? '<div class="scanbay" style="margin-bottom:16px">' +
      (liveTimer || PLAY_SCAN ? '<div class="scanline"></div>' : '') +
      vart(artFor(v), 300, 'stroke-width="1"') +
      '<div style="position:absolute;left:16px;top:14px" class="mono">' +
      '<span class="chip ok"><span class="dot"></span>DIAG // READY</span></div>' +
      '<div style="position:absolute;right:16px;bottom:14px" class="note mono">' +
      esc(adapter.protocol || 'AUTO') + '</div></div>'
      : '') +

    /* adapter header */
    '<div class="card">' +
    '<div class="between wrap" style="gap:16px"><div class="row" style="gap:16px;align-items:flex-start">' +
    '<div style="color:var(--primary);flex:0 0 auto">' + ic('dlc', 36) + '</div><div>' +
    '<span class="mlabel">SAE J1962 <span class="sep">//</span> ISO 15765-4 CAN</span>' +
    '<h3 style="font-size:17px">' + (connected ? esc(adapter.label) : 'NO ADAPTER CONNECTED') + '</h3>' +
    '<p class="note" style="margin:5px 0 0;max-width:520px">' +
    (connected
      ? 'Protocol ' + esc(adapter.protocol || 'auto') + '. Capabilities: ' + [...adapter.capabilities].join(', ') + '. Generic OBD-II modes $01–$0A, powertrain only — ABS, SRS and TCM need manufacturer-specific UDS addressing, so those controls are hidden rather than shown broken.'
      : 'Connect an ELM327 or STN11xx-compatible BLE dongle, or run the demo adapter to see how the screen behaves without a car in front of you.') +
    '</p></div></div>' +
    '<div class="row" style="gap:22px">' +
    '<div style="text-align:right"><div class="mono" style="font-weight:700;font-size:23px;color:' +
    (open.length ? 'var(--bad)' : 'var(--ok)') + '">' + String(open.length).padStart(2, '0') + '</div>' +
    '<div class="mono" style="font-size:9px;letter-spacing:.14em;color:var(--dim)">DTCS</div></div>' +
    '<div style="text-align:right"><div class="mono" style="font-weight:700;font-size:23px;color:var(--primary)">' + monitorSummary() + '</div>' +
    '<div class="mono" style="font-size:9px;letter-spacing:.14em;color:var(--dim)">MONITORS</div></div></div></div>' +
    '<div class="row wrap" style="gap:10px;margin-top:18px">' +
    (connected
      ? '<button class="btn ghost" onclick="scanNow()">Read codes</button>' +
      '<button class="btn ghost" onclick="startLive()">' + (liveTimer ? 'Stop live data' : 'Live data') + '</button>' +
      '<button class="btn ghost" onclick="readMonitors()">Readiness</button>' +
      '<button class="btn ghost" onclick="disconnectAdapter()">Disconnect</button>'
      : '<button class="btn ghost" onclick="connectAdapter(\'elm327-ble\')">' + ic('bluetooth', 15) + ' Connect BLE dongle</button>' +
      '<button class="btn ghost" onclick="connectAdapter(\'demo\')">Run demo adapter</button>') +
    '</div></div>' +

    (!Elm327BleAdapter.supported ?
      '<div class="card" style="margin-top:16px"><span class="mlabel">Adapter support on this device</span>' +
      '<p class="note" style="margin:0">This browser does not expose Web Bluetooth, so live scanning is unavailable here. Chrome or Edge on Windows, macOS, Linux or Android works. Safari and iPadOS never expose it to web pages — on iPad the native Capacitor shell uses the same IAdapter interface via <span class="mono">@capacitor-community/bluetooth-le</span>. In the meantime, import a scanner report from the Records screen: it produces the same DTC history from a Topdon, Autel or Launch export.</p></div>' : '') +

    (window.isSecureContext ? '' :
      '<div class="card" style="margin-top:16px"><span class="mlabel">Web Bluetooth needs a secure context</span>' +
      '<p class="note" style="margin:0">You are on <span class="mono">' + esc(location.origin) + '</span>. Browsers only allow Bluetooth on https:// or on http://localhost. Open Garage at <span class="mono">http://localhost:2026</span> on the machine running the container, or put it behind a reverse proxy with a certificate, and the Connect button will work.</p></div>') +

    /* live data */
    '<div id="livepane"></div>' +

    /* DTCs */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Diagnostic trouble codes</h3>' +
    '<span class="src sample">SAE J2012</span></div><div class="card">' +
    (open.length ? open.map(t => dtcRow(t)).join('')
      : '<p class="note" style="margin:0">No stored codes. An empty list is not the same as a healthy car — pending codes and incomplete monitors are where the useful information usually is.</p>') +
    '</div>' +

    (cleared.length ? '<h3 class="sec-h">Code history <span class="chip grey">' + cleared.length + ' cleared</span></h3><div class="card">' +
      cleared.map(t => '<div class="rowitem"><div class="ico grey mono" style="font-size:11px">' + esc(t.code) + '</div>' +
        '<div class="txt"><b>' + esc(t.description || '') + '</b><span>First seen ' + dateShort(t.first_seen) + ' · cleared ' + dateShort(t.cleared_at) +
        (t.clear_count > 1 ? ' · cleared ' + t.clear_count + ' times total' : '') + '</span></div></div>').join('') +
      (cleared.some(t => t.clear_count >= 2) ? '<div class="safety" style="margin-top:14px"><b>A code that keeps coming back</b>Clearing a trouble code does not fix anything. It wipes the freeze frame — the single most useful piece of evidence you had — and resets every readiness monitor, which will fail you at an emissions test. If the same code has returned more than twice, stop clearing it and start testing.</div>' : '') +
      '</div>' : '') +

    /* readiness */
    '<h3 class="sec-h">Readiness monitors <span class="src sample">SAE J1979 Mode $01 PID $01</span></h3>' +
    '<div class="card" id="monpane">' + monitorPane() + '</div>' +

    /* fuel trim tool */
    '<h3 class="sec-h">Fuel trim analysis</h3><div class="card">' +
    '<p class="note" style="margin:0 0 14px">Total trim is STFT plus LTFT. The useful signal is not the number — it is the <b>difference between idle and cruise</b>. A vacuum leak is a large fraction of airflow at idle and a small one at cruise; a fuel delivery problem is the other way round.</p>' +
    '<div class="grid g4" style="gap:14px">' +
    fld('STFT at idle', inp('ft-si', { type: 'number', step: '0.1', mono: true, ph: '+3.9' })) +
    fld('LTFT at idle', inp('ft-li', { type: 'number', step: '0.1', mono: true, ph: '+11.7' })) +
    fld('STFT at cruise', inp('ft-sc', { type: 'number', step: '0.1', mono: true, ph: '+1.2' })) +
    fld('LTFT at cruise', inp('ft-lc', { type: 'number', step: '0.1', mono: true, ph: '+4.0' })) + '</div>' +
    '<button class="btn sm" style="margin-top:14px" onclick="analyseTrim()">Interpret</button>' +
    '<div id="ftout"></div></div>' +

    /* drive cycle */
    '<h3 class="sec-h">Drive cycle assistant</h3><div class="card">' +
    '<p class="note" style="margin:0 0 14px">Run this after clearing codes or replacing an emissions component, before you go anywhere near an inspection station. Most states fail a vehicle with more than one incomplete monitor regardless of whether the light is on.</p>' +
    '<button class="btn sm ghost" onclick="showDriveCycle()">Open the drive cycle</button></div>' +

    /* sessions */
    (d.sessions?.length ? '<h3 class="sec-h">Session history</h3><div class="card">' +
      d.sessions.map(s => '<div class="rowitem"><div class="ico">' + ic('dlc', 19) + '</div>' +
        '<div class="txt"><b>' + esc(s.adapter || 'Session') + '</b><span>' + dateShort(s.started_at) +
        (s.protocol ? ' · ' + esc(s.protocol) : '') + (s.odometer ? ' · ' + num(s.odometer) + ' mi' : '') +
        (s.imported_from ? ' · imported from ' + esc(s.imported_from) : '') + '</span></div></div>').join('') + '</div>' : '');

  if (liveTimer) renderLivePane();
}

function dtcRow(t) {
  const dec = t.decoded || {};
  const cls = t.status === 'pending' ? 'warn' : t.status === 'permanent' ? 'grey' : 'bad';
  const kbKey = 'dtc_' + t.code;
  return '<div class="rowitem"><div class="ico mono" style="font-size:12px">' + esc(t.code) + '</div>' +
    '<div class="txt"><b>' + esc(t.description || dec.description || '') + '</b>' +
    '<span>' + esc(dec.scope || '') + (dec.subsystem ? ' · ' + esc(dec.subsystem) : '') +
    ' · first seen ' + dateShort(t.first_seen) +
    (t.clear_count ? ' · returned after ' + t.clear_count + ' clear' + (t.clear_count > 1 ? 's' : '') : '') + '</span></div>' +
    '<span class="chip ' + cls + '">' + esc(t.status) + '</span>' +
    (t.freeze_frame ? '<button class="btn xs ghost" onclick="showFreeze(' + t.id + ')">Freeze frame</button>' : '') +
    (KB[kbKey] ? '<button class="btn xs ghost" onclick="inspect(\'' + kbKey + '\')">Diagnose</button>' : '') +
    '<button class="btn xs ghost" onclick="clearOne(' + t.id + ')">Clear</button></div>';
}

function monitorSummary() {
  if (!lastMonitors) return '—';
  const m = lastMonitors.monitors.filter(x => x.status !== 'n/a');
  return m.filter(x => x.status === 'complete').length + '/' + m.length;
}
function monitorPane() {
  if (!lastMonitors) {
    return '<p class="note" style="margin:0">Not read yet. Connect an adapter and hit Readiness. Incomplete monitors after a recent code clear are normal; incomplete monitors on a car nobody has touched point at a fault that is stopping the test from running.</p>';
  }
  return (lastMonitors.mil ? '<div class="row" style="gap:10px;margin-bottom:14px;color:var(--warn)">' + ic('mil', 26) + '<b style="color:var(--ink)">MIL commanded on · ' + lastMonitors.dtcCount + ' code' + (lastMonitors.dtcCount === 1 ? '' : 's') + ' stored</b></div>' : '') +
    '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">' +
    lastMonitors.monitors.map(m => {
      const cls = m.status === 'complete' ? 'ok' : m.status === 'incomplete' ? 'warn' : 'grey';
      return '<div class="row" style="gap:9px;padding:9px 12px;border:1.5px solid var(--line);border-radius:14px">' +
        '<span class="dot" style="color:var(--' + (cls === 'ok' ? 'ok' : cls === 'warn' ? 'warn' : 'muted') + ')"></span>' +
        '<div style="min-width:0"><b style="font-weight:600;font-size:13px">' + esc(m.name) + '</b>' +
        '<div class="note" style="font-size:11px">' + (m.status === 'n/a' ? 'not supported' : m.status) + '</div></div></div>';
    }).join('') + '</div>' +
    '<p class="note" style="margin:14px 0 0">Continuous monitors (misfire, fuel, comprehensive components) run whenever the engine does. The rest are trip monitors with specific entry conditions — the drive cycle below is how you make them run.</p>';
}

/* ---------- adapter control ---------- */
async function connectAdapter(kind) {
  const Cls = ADAPTERS[kind];
  adapter = new Cls();
  adapter.onLog = s => toast(s);
  window.onAdapterState = () => renderDiagnose();
  try {
    await adapter.connect();
    toast('Connected · ' + adapter.protocol, 'ok');
    renderDiagnose();
    if (adapter.can('monitors')) readMonitors();
  } catch (e) {
    adapter = null;
    toast(e.message, 'bad');
    renderDiagnose();
  }
}
async function disconnectAdapter() {
  stopLive();
  if (adapter) await adapter.disconnect();
  adapter = null;
  renderDiagnose();
}

async function scanNow() {
  if (!adapter?.connected) return toast('Connect an adapter first', 'bad');
  toast('Reading stored, pending and permanent codes…');
  PLAY_SCAN = true; renderDiagnose();
  try {
    const stored = await adapter.readDTCs('stored');
    const pending = await adapter.readDTCs('pending');
    const permanent = await adapter.readDTCs('permanent');
    let monitors = null;
    try { monitors = await adapter.readMonitors(); lastMonitors = monitors; } catch { }
    let freeze = null;
    try { freeze = await adapter.readFreezeFrame(); } catch { }

    const codes = [...stored, ...pending, ...permanent];
    if (freeze && codes.length) codes[0].freeze_frame = freeze;

    const r = await API.post('/vehicles/' + state.activeId + '/scan', {
      adapter: adapter.label, protocol: adapter.protocol, monitors, codes,
      odometer: activeVehicle().mileage
    });
    await refreshDetail(); await loadAll();
    renderDiagnose();
    const returned = r.dtcs.filter(x => x.returnedAfterClear);
    toast(codes.length
      ? codes.length + ' code' + (codes.length > 1 ? 's' : '') + ' read' + (returned.length ? ' — ' + returned.map(x => x.code).join(', ') + ' has returned after a previous clear' : '')
      : 'No trouble codes stored', codes.length ? 'bad' : 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  finally { PLAY_SCAN = false; renderDiagnose(); }
}

async function readMonitors() {
  if (!adapter?.connected) return toast('Connect an adapter first', 'bad');
  try {
    lastMonitors = await adapter.readMonitors();
    document.getElementById('monpane').innerHTML = monitorPane();
    renderDiagnose();
  } catch (e) { toast(e.message, 'bad'); }
}

async function clearOne(id) {
  const t = (D().dtcs || []).find(x => x.id === id);
  confirmDo('Clear ' + t.code + '?',
    'Clearing a code does not repair anything. It erases the freeze frame — the recorded conditions when the fault occurred, which is often the only useful evidence you have — and resets every readiness monitor. If you are going for an emissions test, you will need a full drive cycle first.' +
    (adapter?.connected ? ' The adapter will also send Mode $04 to the vehicle.' : ' No adapter is connected, so this only updates your records.'),
    async () => {
      if (adapter?.connected && adapter.can('clear')) {
        try { await adapter.clearDTCs(); } catch (e) { toast('Adapter clear failed: ' + e.message, 'bad'); }
      }
      const r = await API.post('/dtcs/' + id + '/clear');
      await refreshDetail(); await loadAll();
      renderDiagnose();
      toast(r.warning, 'bad');
    }, true);
}

function showFreeze(id) {
  const t = (D().dtcs || []).find(x => x.id === id);
  const ff = t?.freeze_frame;
  if (!ff) return;
  openModal(modalHead('Freeze frame — ' + t.code,
    'The exact operating conditions the ECM recorded the moment the fault set. Reproduce these conditions and you reproduce the fault.') +
    Object.entries(ff).map(([k, v]) => '<div class="kv"><span style="flex:1;text-align:left">' + esc(k) + '</span><b class="mono">' + esc(v) + '</b></div>').join(''));
}

/* ---------- live data ---------- */
function startLive() {
  if (liveTimer) return stopLive();
  if (!adapter?.connected) return toast('Connect an adapter first', 'bad');
  liveData = {};
  liveStart = Date.now();
  DEFAULT_PIDS.forEach(p => { liveData[p] = { samples: [], last: null }; });
  liveTimer = setInterval(pollLive, 700);
  renderDiagnose();
}
function stopLive() {
  clearInterval(liveTimer);
  liveTimer = null;
  renderDiagnose();
}
async function pollLive() {
  if (!adapter?.connected) return stopLive();
  for (const pid of DEFAULT_PIDS) {
    try {
      const r = await adapter.readPID(pid);
      if (!r) continue;
      const slot = liveData[pid];
      slot.last = r;
      slot.samples.push([Date.now() - liveStart, r.value]);
      if (slot.samples.length > 400) slot.samples.shift();
    } catch { /* one dropped frame is not an error worth showing */ }
  }
  renderLivePane();
}
function renderLivePane() {
  const pane = document.getElementById('livepane');
  if (!pane) return;
  if (!liveTimer) { pane.innerHTML = ''; return; }
  const tiles = DEFAULT_PIDS.map(pid => {
    const s = liveData[pid];
    if (!s?.last) return '';
    const d = s.last;
    let warn = '';
    if (d.j1930 === 'ECT' && d.value > 230) warn = 'bad';
    if ((d.j1930 === 'LTFT B1' || d.j1930 === 'LTFT B2') && Math.abs(d.value) > 10) warn = 'warn';
    if (d.j1930 === 'VPWR' && (d.value < 13.2 || d.value > 14.9)) warn = 'warn';
    return '<div class="pid"><span class="pidno">PID $' + pid + '</span>' +
      '<span class="mlabel mute" style="margin-bottom:4px">' + esc(d.j1930) + '</span>' +
      '<div class="v"' + (warn ? ' style="color:var(--' + (warn === 'bad' ? 'bad' : 'warn') + ')"' : '') + '>' + d.value + '</div>' +
      '<div class="note">' + esc(d.unit) + '</div>' +
      '<div style="margin-top:6px">' + (s.samples.length > 3 ? sparkline(s.samples.slice(-40).map(x => x[1]), { color: warn ? 'var(--warn)' : 'var(--primary)' }) : '') + '</div></div>';
  }).join('');

  pane.innerHTML = '<h3 class="sec-h">Live data <span class="src sample">SAE J1979 · names per SAE J1930</span>' +
    '<button class="btn xs" onclick="saveLiveSession()">Save session</button></h3>' +
    '<div class="grid g5" style="gap:12px">' + tiles + '</div>' +
    '<p class="note" style="margin-top:12px">Parameter names follow SAE J1930 standard acronyms so they match what is printed in any factory service manual, and each tile shows the actual PID number. Values are polled sequentially, so the effective sample rate is roughly one full set per second — fine for trims and temperatures, not fast enough for waveform work.</p>';
}
async function saveLiveSession() {
  const logs = Object.entries(liveData).filter(([, s]) => s.samples.length).map(([pid, s]) => ({
    pid, name: s.last?.name, unit: s.last?.unit, samples: s.samples
  }));
  if (!logs.length) return toast('Nothing recorded yet', 'bad');
  await API.post('/vehicles/' + state.activeId + '/scan', {
    adapter: adapter.label, protocol: adapter.protocol, datalogs: logs, codes: [],
    notes: 'Live data recording, ' + logs[0].samples.length + ' samples per PID'
  });
  await refreshDetail();
  toast('Session saved with ' + logs.length + ' channels', 'ok');
}

/* ---------- fuel trim ---------- */
async function analyseTrim() {
  const body = {
    stftIdle: numVal('ft-si'), ltftIdle: numVal('ft-li'),
    stftCruise: numVal('ft-sc'), ltftCruise: numVal('ft-lc')
  };
  const r = await API.post('/fuel-trim', body);
  document.getElementById('ftout').innerHTML =
    '<div style="margin-top:16px"><div class="grid g2" style="gap:14px;margin-bottom:14px">' +
    '<div><span class="mlabel mute">Total trim at idle</span><div class="field mono"' +
    (Math.abs(r.idle) > 10 ? ' style="border-color:var(--warn)"' : '') + '>' + (r.idle > 0 ? '+' : '') + r.idle + ' %</div></div>' +
    '<div><span class="mlabel mute">Total trim at cruise</span><div class="field mono"' +
    (Math.abs(r.cruise) > 10 ? ' style="border-color:var(--warn)"' : '') + '>' + (r.cruise > 0 ? '+' : '') + r.cruise + ' %</div></div></div>' +
    r.findings.map((f, i) => '<div class="bullet"><span class="n">' + (i + 1) + '</span><div><b style="font-weight:600">' + esc(f.verdict) + '</b>' +
      '<div class="note" style="margin-top:2px">' + esc(f.why) + '</div></div></div>').join('') + '</div>';
}

/* ---------- drive cycle ---------- */
async function showDriveCycle() {
  const r = await API.get('/ref/monitors');
  openModal(modalHead('Generic OBD-II drive cycle',
    'Conditions vary by manufacturer — this is the generic pattern that satisfies most vehicles. Do it somewhere safe and legal; several steps need steady highway speed.') +
    '<div class="safety" style="margin:0 0 16px"><b>Safety</b>Several steps need sustained highway speed and a deceleration with your foot completely off the throttle. Have a passenger read the steps, or pull over between them. Do not run a drive cycle while looking at a phone.</div>' +
    r.driveCycle.map(s => '<div class="bullet"><span class="n">' + s.step + '</span><div><b style="font-weight:600">' + esc(s.title) + '</b>' +
      '<div class="note" style="margin-top:2px">' + esc(s.detail) + '</div></div></div>').join('') +
    '<p class="note" style="margin-top:16px">A permanent code — one you cannot clear at all — only goes away when its monitor actually runs and passes. That is deliberate: it stops a code being cleared in the car park outside the inspection station.</p>', true);
}

renderers.diagnose = renderDiagnose;
renderers.systems = renderSystems;
