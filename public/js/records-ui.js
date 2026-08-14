/* ============================================================
   records-ui.js — auto-save, torque module, timeline, search palette
   ============================================================ */

/* ============================================================
   AUTO-SAVE

   Text debounces at 750ms after typing stops. Toggles, ticks and
   confirmations save immediately. Failures queue to localStorage and
   replay when the connection comes back, and the state is always
   visible — silent loss is the one outcome not allowed.
   ============================================================ */
const SAVE = { state: 'idle', at: null, pending: 0, queue: [], timers: new Map() };
const QUEUE_KEY = 'garage.savequeue';

function loadQueue() {
  try { SAVE.queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { SAVE.queue = []; }
}
function persistQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(SAVE.queue.slice(-200))); } catch { }
}

function saveState(state, extra) {
  SAVE.state = state;
  if (state === 'saved') SAVE.at = new Date();
  const el = document.getElementById('savepill');
  if (!el) return;
  const map = {
    idle: ['', '', ''],
    saving: ['warn', 'SAVING…', ''],
    saved: ['ok', 'SAVED', SAVE.at ? ' • ' + SAVE.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''],
    offline: ['warn', 'OFFLINE — CHANGES STORED LOCALLY', ''],
    failed: ['bad', 'SAVE FAILED — RETRY', '']
  };
  const [tone, label, suffix] = map[state] || map.idle;
  if (!label) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.className = 'savepill ' + tone;
  el.innerHTML = '<span class="dot"></span>' + label + suffix +
    (SAVE.queue.length ? ' <span class="chip grey" style="font-size:9px">' + SAVE.queue.length + ' QUEUED</span>' : '') +
    (state === 'failed' ? ' <button class="btn xs ghost" onclick="flushQueue()">RETRY</button>' : '');
}

/**
 * Save now. On network failure the write is queued rather than lost.
 * `key` collapses repeated saves of the same field.
 */
async function saveNow(method, url, body, key) {
  SAVE.pending++;
  saveState('saving');
  try {
    const r = await API.req(method, url, body);
    SAVE.pending--;
    if (!SAVE.pending) saveState(SAVE.queue.length ? 'offline' : 'saved');
    return r;
  } catch (e) {
    SAVE.pending--;
    SAVE.queue.push({ method, url, body, key, at: Date.now(), error: String(e.message) });
    persistQueue();
    saveState(navigator.onLine ? 'failed' : 'offline');
    throw e;
  }
}

/** Debounced field save — 750ms after typing stops. */
function saveField(key, method, url, body, ms) {
  saveState('saving');
  clearTimeout(SAVE.timers.get(key));
  SAVE.timers.set(key, setTimeout(() => {
    SAVE.timers.delete(key);
    saveNow(method, url, body, key).catch(() => { });
  }, ms ?? 750));
}

async function flushQueue() {
  if (!SAVE.queue.length) return saveState('saved');
  saveState('saving');
  const pending = [...SAVE.queue];
  SAVE.queue = [];
  persistQueue();
  const failed = [];
  for (const item of pending) {
    try { await API.req(item.method, item.url, item.body); }
    catch { failed.push(item); }
  }
  SAVE.queue = failed;
  persistQueue();
  saveState(failed.length ? (navigator.onLine ? 'failed' : 'offline') : 'saved');
  if (!failed.length) {
    toast('Queued changes synced', 'ok');
    if (window.refreshDetail) refreshDetail();
  }
}

window.addEventListener('online', () => { toast('Back online — syncing'); flushQueue(); });
window.addEventListener('offline', () => saveState('offline'));
window.addEventListener('beforeunload', e => {
  if (SAVE.pending || SAVE.timers.size) { e.preventDefault(); e.returnValue = ''; }
});

function syncHistory() {
  openModal(modalHead('Save & sync', 'Everything queued or failed, so a problem is visible rather than silent.') +
    '<div class="kv"><span>State</span><b>' + esc(SAVE.state.toUpperCase()) + '</b></div>' +
    '<div class="kv"><span>Last saved</span><b>' + (SAVE.at ? SAVE.at.toLocaleString() : 'not yet this session') + '</b></div>' +
    '<div class="kv"><span>Queued writes</span><b class="mono">' + SAVE.queue.length + '</b></div>' +
    '<div class="kv"><span>Connection</span><b>' + (navigator.onLine ? 'online' : 'offline') + '</b></div>' +
    (SAVE.queue.length
      ? '<div style="margin-top:14px"><span class="mlabel">Waiting to sync</span>' +
      SAVE.queue.slice(-12).map(q => '<div class="rowitem"><div class="ico warn mono" style="font-size:10px">' +
        esc(q.method) + '</div><div class="txt"><b class="mono" style="font-size:12px">' + esc(q.url) + '</b>' +
        '<span>' + new Date(q.at).toLocaleString() + (q.error ? ' · ' + esc(q.error) : '') + '</span></div></div>').join('') +
      '<button class="btn block" style="margin-top:14px" onclick="flushQueue();closeModal()">Retry all</button>' +
      '<button class="btn block ghost" style="margin-top:8px" onclick="discardQueue()">Discard queued changes</button></div>'
      : '<p class="note" style="margin-top:14px">Nothing waiting. Every change has been written to the server.</p>'));
}
function discardQueue() {
  confirmDo('Discard ' + SAVE.queue.length + ' queued change(s)?',
    'They have not reached the server and will be lost. Only do this if you know they are wrong.',
    () => { SAVE.queue = []; persistQueue(); saveState('saved'); closeModal(); toast('Queue cleared'); }, true);
}

/* ============================================================
   TORQUE MODULE — sourced, verifiable, confirmable
   ============================================================ */
const TORQUE_SOURCE_UI = {
  manufacturer_spec: ['MANUFACTURER SPEC', 'ok'],
  manual_verified: ['MANUAL VERIFIED', 'ok'],
  user_entered: ['USER ENTERED', 'warn'],
  needs_verification: ['NEEDS VERIFICATION', 'warn']
};

async function loadTorque(scopeKind, scopeId) {
  try { return (await API.get('/torque?scope_kind=' + scopeKind + '&scope_id=' + scopeId)).specs; }
  catch { return []; }
}

function torqueModule(specs, scopeKind, scopeId) {
  return '<div class="card tight" id="torque-mod">' +
    '<div class="between" style="margin-bottom:10px">' +
    '<span class="mlabel" style="margin:0">Torque <span class="sep">//</span> ' +
    (specs.length ? String(specs.filter(s => s.confirmed).length).padStart(2, '0') + ' OF ' +
      String(specs.length).padStart(2, '0') + ' CONFIRMED' : 'NONE ON FILE') + '</span>' +
    '<button class="btn xs ghost" onclick="addTorqueSpec(\'' + scopeKind + '\',' + scopeId + ')">+ ADD SPEC</button></div>' +

    (specs.length
      ? specs.map(s => torqueRow(s)).join('')
      : '<div class="safety" style="border-color:var(--warn);background:var(--warn-l);color:var(--warn)">' +
      '<b>No verified torque spec on file</b>' +
      'Add a specification from the service manual before confirming this step. Garage will not generate, infer or estimate a torque value.</div>');
}

function torqueRow(s) {
  const [label, tone] = TORQUE_SOURCE_UI[s.source] || TORQUE_SOURCE_UI.user_entered;
  const hasValue = s.value != null;
  return '<div class="rowitem" style="align-items:flex-start">' +
    '<button class="ico ' + (s.confirmed ? 'ok' : hasValue ? '' : 'warn') + '" style="cursor:pointer" ' +
    'onclick="confirmTorque(' + s.id + ',' + (s.confirmed ? 'true' : 'false') + ')" ' +
    'title="' + (s.confirmed ? 'Confirmed — click to undo' : 'Confirm torqued') + '">' +
    ic(s.confirmed ? 'check' : 'wrench', 17) + '</button>' +
    '<div class="txt">' +
    '<b>' + esc(s.component) + '</b>' +
    (hasValue
      ? '<span class="mono" style="color:var(--ink);font-size:15px;font-weight:700">' + esc(s.display.primary) +
      ' <span style="color:var(--dim);font-weight:500">/ ' + esc(s.display.secondary) + '</span>' +
      (s.angle ? ' <span style="color:var(--warn)">+ ' + s.angle + '°</span>' : '') + '</span>'
      : '<span style="color:var(--warn)">NO VALUE ON FILE</span>') +
    '<div class="row wrap" style="gap:6px;margin-top:6px">' +
    '<span class="chip ' + tone + '" style="font-size:9px">' + label + '</span>' +
    (s.confirmed
      ? '<span class="chip ok" style="font-size:9px">CONFIRMED ' + esc(String(s.confirmed_at).slice(0, 10)) + '</span>'
      : '') +
    (s.source_ref ? '<span class="chip grey" style="font-size:9px">' + esc(s.source_ref) + '</span>' : '') +
    '</div>' +
    (s.sequence_note ? '<span>' + esc(s.sequence_note) + '</span>' : '') +
    (s.note ? '<span>' + esc(s.note) + '</span>' : '') +
    (s.confirmed_by ? '<span>Confirmed by ' + esc(s.confirmed_by) + '</span>' : '') +
    '</div>' +
    '<div class="row" style="gap:4px">' +
    (s.photo_path ? '<a class="btn xs ghost" href="/api/photo/' + encodeURIComponent(s.photo_path) + '" target="_blank">VIEW SOURCE</a>' : '') +
    '<button class="btn xs ghost" onclick=\'editTorqueSpec(' + JSON.stringify(JSON.stringify(s)) + ')\'>EDIT</button>' +
    '<button class="btn xs ghost" onclick="delTorqueSpec(' + s.id + ')">×</button></div></div>';
}

function addTorqueSpec(scopeKind, scopeId, existing) {
  const s = existing || {};
  openModal(modalHead(s.id ? 'Edit torque spec' : 'Add torque spec',
    'Enter the value <b>from a source you hold</b>. Garage never generates a torque figure — a wrong number torqued into an aluminium head is how you buy a head.') +
    fld('Component or fastener', inp('tq-comp', { value: s.component || '', ph: 'Oil drain plug' })) +
    '<div style="height:12px"></div><div class="grid g3" style="gap:12px">' +
    fld('Value', inp('tq-val', { type: 'number', step: '0.1', mono: true, value: s.value ?? '' })) +
    fld('Unit', sel('tq-unit', ['lb-ft', 'lb-in', 'N·m'], s.source_unit || 'lb-ft')) +
    fld('Extra angle', inp('tq-angle', { type: 'number', mono: true, value: s.angle ?? '', ph: '° (TTY)' })) +
    '</div>' +
    '<div style="height:12px"></div><div class="grid g2" style="gap:12px">' +
    fld('Source', sel('tq-source', [
      ['manufacturer_spec', 'Manufacturer spec'], ['manual_verified', 'Manual — verified'],
      ['user_entered', 'User entered'], ['needs_verification', 'Needs verification']], s.source || 'manual_verified')) +
    fld('Reference', inp('tq-ref', { value: s.source_ref || '', ph: 'FSM 303-01A p.44' })) +
    '</div>' +
    '<div style="height:12px"></div>' +
    fld('Sequence / pattern note', inp('tq-seq', { value: s.sequence_note || '', ph: 'Centre-out, three stages' })) +
    '<div style="height:12px"></div>' +
    fld('Note', inp('tq-note', { value: s.note || '' })) +
    '<p class="note" style="margin:14px 0 16px">A value entered as lb-in stays lb-in. The other units shown alongside are conversions for reading only — the sourced figure is never rewritten.</p>' +
    '<button class="btn block" onclick="saveTorqueSpec(' + (s.id || 0) + ',\'' + (s.scope_kind || scopeKind) + '\',' + (s.scope_id || scopeId) + ')">Save spec</button>');
}
function editTorqueSpec(json) { addTorqueSpec(null, null, typeof json === 'string' ? JSON.parse(json) : json); }

async function saveTorqueSpec(id, scopeKind, scopeId) {
  if (!val('tq-comp')) return toast('Name the fastener', 'bad');
  const body = {
    component: val('tq-comp'), value: numVal('tq-val'), source_unit: val('tq-unit'),
    angle: numVal('tq-angle'), source: val('tq-source'), source_ref: val('tq-ref'),
    sequence_note: val('tq-seq'), note: val('tq-note'),
    scope_kind: scopeKind, scope_id: scopeId, vehicle_id: state.activeId
  };
  try {
    if (id) await saveNow('PATCH', '/torque/' + id, body);
    else await saveNow('POST', '/torque', body);
    closeModal();
    if (window.TASK) await openTask(TASK.task.id);
    toast('Spec saved', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

async function confirmTorque(id, undo) {
  try {
    const r = await saveNow('POST', '/torque/' + id + '/confirm', { undo: !!undo });
    if (window.TASK) await openTask(TASK.task.id);
    toast(r.note, 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}
async function delTorqueSpec(id) {
  await saveNow('DELETE', '/torque/' + id);
  if (window.TASK) await openTask(TASK.task.id);
}

/* ============================================================
   VEHICLE HEALTH TIMELINE
   ============================================================ */
const TL = { data: null, kinds: [], loaded: false };
const TL_ICON = {
  service: 'wrench', fuel: 'fuel', odometer: 'chart', diagnostic: 'dlc', dtc: 'mil',
  recall: 'alert', document: 'doc', tire: 'tire', battery: 'battery', brakes: 'brake',
  expense: 'money', hours: 'gear', procedure: 'clipboard', photo: 'garage', trip: 'pin'
};

async function loadTimeline(force) {
  if (!state.activeId) return;
  if (TL.loaded && !force) return;
  const qs = TL.kinds.length ? '?kinds=' + TL.kinds.join(',') : '';
  try { TL.data = await API.get('/vehicles/' + state.activeId + '/timeline' + qs); TL.loaded = true; }
  catch { TL.data = null; }
}

function renderTimeline() {
  const el = document.getElementById('s-timeline');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'build a history timeline');
  if (!TL.loaded) loadTimeline().then(() => { if (state.screen === 'timeline') renderTimeline(); });
  const d = TL.data;

  el.innerHTML =
    '<div class="between wrap" style="margin-bottom:16px"><div>' +
    '<h2 style="font-size:24px">Vehicle health timeline</h2>' +
    '<p class="note" style="margin:4px 0 0"><span class="mono">' +
    (d ? 'EVENTS // ' + String(d.total).padStart(3, '0') + '<span class="sep">//</span>' + esc(vLabel(v)) : 'LOADING…') +
    '</span></p></div>' +
    (d ? '<span class="chip grey mono">' + money(d.spend, 0) + ' RECORDED</span>' : '') + '</div>' +

    (d
      ? '<div class="row wrap" style="gap:6px;margin-bottom:16px">' +
      '<button class="chip' + (TL.kinds.length ? '' : ' ok') + '" onclick="filterTimeline(null)">ALL</button>' +
      d.kinds.filter(k => d.counts[k] || TL.kinds.includes(k)).map(k =>
        '<button class="chip' + (TL.kinds.includes(k) ? ' ok' : ' grey') + '" onclick="filterTimeline(\'' + k + '\')">' +
        k.toUpperCase() + (d.counts[k] ? ' ' + d.counts[k] : '') + '</button>').join('') + '</div>'
      : '') +

    (d && d.events.length
      ? '<div class="card">' + d.events.map(timelineRow).join('') + '</div>'
      : d
        ? '<div class="card empty"><div class="empty-in"><h4>NO EVENTS RECORDED</h4>' +
        '<p class="note" style="margin:0">Log a service, a fill or an odometer reading and it appears here.</p></div></div>'
        : '<div class="card"><span class="spin"></span> Building the timeline…');
}

function timelineRow(e) {
  const tone = e.flag === 'bad' ? 'bad' : e.flag === 'warn' ? 'warn' : e.flag === 'ok' ? 'ok' : '';
  return '<div class="rowitem" style="cursor:pointer" onclick=\'openTimelineEvent(' + JSON.stringify(JSON.stringify(e)) + ')\'>' +
    '<div class="ico ' + tone + '">' + ic(TL_ICON[e.kind] || 'clipboard', 18) + '</div>' +
    '<div class="txt"><b>' + esc(e.title) + '</b>' +
    (e.body ? '<span>' + esc(e.body) + '</span>' : '') +
    '<span class="mono" style="font-size:10px;color:var(--dim)">' +
    String(dateShort(e.at)).toUpperCase() + '<span class="sep">//</span>' + esc(e.source || 'USER ENTERED') + '</span></div>' +
    (e.amount ? '<b class="mono">' + money(e.amount) + '</b>' : '') + '</div>';
}

function filterTimeline(kind) {
  if (!kind) TL.kinds = [];
  else if (TL.kinds.includes(kind)) TL.kinds = TL.kinds.filter(k => k !== kind);
  else TL.kinds.push(kind);
  TL.loaded = false;
  loadTimeline(true).then(renderTimeline);
}

function openTimelineEvent(json) {
  const e = typeof json === 'string' ? JSON.parse(json) : json;
  const dest = { service: 'records', fuel: 'money', odometer: 'records', diagnostic: 'diagnose', dtc: 'diagnose', recall: 'vehicle', document: 'ownership', tire: 'wear', battery: 'wear', brakes: 'wear', expense: 'money', hours: 'maintenance', procedure: 'procedures', photo: 'garage' }[e.kind];
  openModal(modalHead(e.title, esc(String(dateShort(e.at)))) +
    (e.body ? '<div class="card tight" style="margin-bottom:14px"><div style="color:var(--ink)">' + esc(e.body) + '</div></div>' : '') +
    '<div class="grid g2" style="gap:12px;margin-bottom:14px">' +
    '<div class="card tight"><span class="mlabel mute">Type</span><div class="note" style="color:var(--ink)">' + esc(e.kind) + '</div></div>' +
    '<div class="card tight"><span class="mlabel mute">Source</span><div class="note" style="color:var(--ink)">' + esc(e.source || 'USER ENTERED') + '</div></div></div>' +
    (e.amount ? '<div class="kv"><span>Amount</span><b class="mono">' + money(e.amount) + '</b></div>' : '') +
    (e.ref?.type === 'task' || e.kind === 'service'
      ? '' : '') +
    (dest ? '<button class="btn block" style="margin-top:14px" onclick="closeModal();go(\'' + dest + '\')">Open ' + TITLES[dest] + '</button>' : ''));
}
renderers.timeline = renderTimeline;

/* ============================================================
   COMMAND PALETTE — Cmd/Ctrl + K
   ============================================================ */
const PALETTE = { open: false, results: null, timer: null };
const RESULT_ICON = {
  vehicle: 'garage', service: 'wrench', dtc: 'mil', document: 'doc', part: 'hex',
  fuel: 'fuel', procedure: 'clipboard', task: 'bell', torque: 'gear', recall: 'alert', odometer: 'chart'
};

function openPalette() {
  PALETTE.open = true;
  openModal(
    '<div class="row" style="gap:10px;margin-bottom:12px">' +
    '<span style="color:var(--primary)">' + ic('arrow', 18) + '</span>' +
    '<input class="inp" id="pal-q" autocomplete="off" placeholder="Search vehicles, services, codes, parts, documents, fuel…" ' +
    'style="flex:1;border:0;background:transparent;font-size:16px;padding:6px 0" oninput="paletteSearch()">' +
    '<span class="chip grey">ESC</span></div>' +
    '<div id="pal-out"><p class="note" style="margin:0">Type at least two characters. Results group by record type, and opening one takes you to the underlying record.</p></div>');
  setTimeout(() => document.getElementById('pal-q')?.focus(), 40);
}

function paletteSearch() {
  const q = val('pal-q').trim();
  clearTimeout(PALETTE.timer);
  if (q.length < 2) {
    document.getElementById('pal-out').innerHTML = '<p class="note" style="margin:0">Type at least two characters.</p>';
    return;
  }
  PALETTE.timer = setTimeout(async () => {
    try {
      const r = await API.get('/search?q=' + encodeURIComponent(q));
      PALETTE.results = r;
      const box = document.getElementById('pal-out');
      if (!box) return;
      if (!r.total) {
        box.innerHTML = '<p class="note" style="margin:0">Nothing matched “' + esc(q) + '”.</p>';
        return;
      }
      box.innerHTML = '<div class="note" style="margin-bottom:10px">' + r.total + ' result' + (r.total === 1 ? '' : 's') + '</div>' +
        Object.entries(r.groups).map(([type, rows]) =>
          '<div style="margin-bottom:12px"><span class="mlabel mute">' + type.toUpperCase() + ' <span class="sep">//</span> ' + rows.length + '</span>' +
          rows.slice(0, 6).map(x =>
            '<div class="rowitem" style="cursor:pointer;padding:9px 0" onclick=\'openResult(' + JSON.stringify(JSON.stringify(x)) + ')\'>' +
            '<div class="ico">' + ic(RESULT_ICON[type] || 'clipboard', 16) + '</div>' +
            '<div class="txt"><b>' + esc(x.title) + '</b>' +
            '<span>' + [x.sub, x.vehicle, x.at ? dateShort(x.at) : null].filter(Boolean).map(esc).join(' · ') + '</span></div>' +
            (x.amount ? '<b class="mono">' + money(x.amount) + '</b>' : '') + '</div>').join('') + '</div>').join('');
    } catch (e) { toast(e.message, 'bad'); }
  }, 220);
}

async function openResult(json) {
  const x = typeof json === 'string' ? JSON.parse(json) : json;
  closeModal();
  if (x.ref?.vehicle_id && x.ref.vehicle_id !== state.activeId) await setActive(x.ref.vehicle_id);
  const map = {
    vehicle: 'vehicle', service: 'records', dtc: 'diagnose', document: 'ownership',
    part: 'parts', fuel: 'money', procedure: 'procedures', task: 'maintenance',
    torque: 'maintenance', recall: 'vehicle', odometer: 'records'
  };
  if (x.ref?.type === 'vehicle') { await setActive(x.ref.id); return go('vehicle'); }
  if (x.ref?.type === 'task') { go('maintenance'); return setTimeout(() => openTask(x.ref.id), 250); }
  if (x.ref?.type === 'procedure') { go('procedures'); return setTimeout(() => editProcedure(x.ref.id), 250); }
  go(map[x.type] || 'garage');
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
});

loadQueue();
if (SAVE.queue.length) setTimeout(() => { saveState('offline'); flushQueue(); }, 1500);

/* ============================================================
   VEHICLE PHOTOS — a real photo of the real car beats any drawing.
   Line art stays as the fallback so a vehicle is never faceless.
   ============================================================ */
async function vehiclePhotos(vehicleId) {
  const id = vehicleId || state.activeId;
  if (!id) return toast('Pick a vehicle first', 'bad');
  const photos = await API.get('/vehicles/' + id + '/photos');
  openModal(modalHead('Vehicle photos', 'The first photo becomes the banner. Photos stay on your server.') +
    '<div id="photolist">' + photoList(photos, id) + '</div>' +
    '<div style="height:14px"></div>' +
    '<label class="btn block ghost" style="cursor:pointer">' + ic('camera', 15) + ' Add photo' +
    '<input type="file" accept="image/*" capture="environment" style="display:none" ' +
    'onchange="uploadPhoto(' + id + ',this)"></label>' +
    '<p class="note" style="margin:10px 0 0">Camera capture needs HTTPS or localhost. Over plain LAN the picker still works.</p>');
}

function photoList(photos, vid) {
  if (!photos.length) {
    return '<div class="empty-chart" style="min-height:150px"><div class="empty-in">' +
      vart(artFor(activeVehicle() || {}), 150, 'stroke-width=".9"') +
      '<h4 style="margin-top:6px">NO PHOTOS YET</h4>' +
      '<p class="note" style="margin:4px 0 0">Line art is standing in for now.</p></div></div>';
  }
  return '<div class="photogrid">' + photos.map(p =>
    '<figure class="photo' + (p.is_primary ? ' primary' : '') + '">' +
    '<img src="/api/photo/' + encodeURIComponent(p.file_path) + '" alt="' + esc(p.caption || 'Vehicle photo') + '" loading="lazy">' +
    (p.is_primary ? '<span class="tag ok">BANNER</span>' : '') +
    '<figcaption>' +
    '<input class="inp xs" value="' + esc(p.caption || '') + '" placeholder="Caption" ' +
    'oninput="saveField(\'ph' + p.id + '\',\'PATCH\',\'/photos/' + p.id + '\',{caption:this.value})">' +
    '<div class="row" style="gap:6px;margin-top:6px">' +
    (p.is_primary ? '' : '<button class="btn xs ghost" onclick="makePrimary(' + p.id + ',' + vid + ')">Use as banner</button>') +
    '<button class="btn xs danger" onclick="delPhoto(' + p.id + ',' + vid + ')">Delete</button>' +
    '</div></figcaption></figure>').join('') + '</div>';
}

async function uploadPhoto(vid, input) {
  const f = input.files?.[0];
  if (!f) return;
  if (f.size > 12 * 1024 * 1024) return toast('That photo is over 12 MB', 'bad');
  saveState('saving');
  const fd = new FormData();
  fd.append('file', f);
  try {
    await API.form('/vehicles/' + vid + '/photos', fd);
    saveState('saved');
    await refreshPhotos(vid);
    await loadAll(); await loadDetail(true); rerender();
  } catch (e) { saveState('error'); toast(e.message, 'bad'); }
  input.value = '';
}
async function makePrimary(pid, vid) {
  await API.post('/photos/' + pid + '/primary');
  await refreshPhotos(vid);
  await loadAll(); await loadDetail(true); rerender();
  toast('Banner updated', 'ok');
}
function delPhoto(pid, vid) {
  confirmDo('Delete this photo?', 'The image file is removed from your server. This cannot be undone.', async () => {
    await API.del('/photos/' + pid);
    await refreshPhotos(vid);
    await loadAll(); await loadDetail(true); rerender();
  }, true);
}
async function refreshPhotos(vid) {
  const el = document.getElementById('photolist');
  if (el) el.innerHTML = photoList(await API.get('/vehicles/' + vid + '/photos'), vid);
}
