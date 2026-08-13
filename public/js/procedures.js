/* ============================================================
   procedures.js — illustrated, step-by-step, yours

   The interaction from a professional repair database, with your own
   photographs as the artwork. Tap the photo to drop a numbered pin,
   bind pins to steps, and the pin lights up as you advance through
   the job.

   For one specific truck this beats generic vector art, because it
   shows the bolt you actually have to reach — with the corrosion, the
   aftermarket bracket and the hose that is in the way in real life.
   ============================================================ */
const PROCS = { list: [], current: null, companion: [], loaded: false, editingMedia: null };

const PROC_SYSTEMS = ['engine', 'cooling', 'fuel', 'brakes', 'suspension', 'trans', 'drive',
  'charging', 'hvac', 'tires', 'body', 'diagnostics', 'ev'];
const SAFETY_FLAGS = [['lift', 'Under the vehicle'], ['fuel', 'Fuel system'],
['srs', 'Airbag / SRS'], ['hv', 'High voltage']];

async function loadProcedures(force) {
  if (PROCS.loaded && !force) return;
  try {
    PROCS.list = (await API.get('/procedures' + (state.activeId ? '?vehicle_id=' + state.activeId : ''))).procedures;
    PROCS.loaded = true;
  } catch { PROCS.list = []; }
  await loadTorquePatterns();
}

/* ============================================================
   LIST
   ============================================================ */
function renderProcedures() {
  const el = document.getElementById('s-procedures');
  const v = activeVehicle();
  if (!PROCS.loaded) loadProcedures().then(() => { if (state.screen === 'procedures') renderProcedures(); });

  el.innerHTML =
    '<div class="between wrap" style="margin-bottom:18px"><div>' +
    '<h2 style="font-size:25px">Procedures</h2>' +
    '<p class="note" style="margin:4px 0 0">' +
    (v ? 'Illustrated jobs for your ' + esc(vLabel(v)) + ', built from your own photos.' : 'Add a vehicle to attach procedures to it.') +
    '</p></div>' +
    '<div class="row" style="gap:8px">' +
    '<button class="btn sm ghost" onclick="torqueStudio()">Torque sequence</button>' +
    '<button class="btn sm" onclick="newProcedure()">+ New procedure</button></div></div>' +

    (PROCS.list.length
      ? '<div class="grid g2">' + PROCS.list.map(procCard).join('') + '</div>'
      : '<div class="card empty"><div style="color:var(--primary);opacity:.4;margin-bottom:10px">' + ic('clipboard', 40) + '</div>' +
      '<b style="display:block;color:var(--ink);margin-bottom:6px">No procedures yet</b>' +
      '<p class="note" style="max-width:520px;margin:0 auto 18px">Photograph the job as you do it, drop numbered pins on the photo, and write the steps. Next time — or when you sell the truck — you have an illustrated procedure for <i>your</i> vehicle that no subscription can take away.</p>' +
      '<button class="btn sm" onclick="newProcedure()">Create the first one</button></div>') +

    /* saved torque patterns */
    (TQ.saved.length
      ? '<h3 class="sec-h">Tightening sequences</h3><div class="grid g3">' +
      TQ.saved.map(t => '<div class="card tight">' +
        '<div class="between" style="margin-bottom:8px"><b style="font-weight:600;font-size:14px">' + esc(t.name) + '</b>' +
        '<button class="btn xs ghost" onclick="viewTorquePattern(' + t.id + ')">Open</button></div>' +
        '<div class="note">' + esc(LAYOUTS[t.layout]?.label || t.layout) + ' · ' + t.bolt_count + ' fasteners</div>' +
        (t.stages?.length
          ? '<div class="note" style="margin-top:6px">' + t.stages.map(s =>
            esc(s.label) + ' ' + (s.value != null ? s.value + ' ' + esc(s.unit || '') : '') +
            (s.angle ? ' + ' + s.angle + '°' : '')).join(' → ') + '</div>'
          : '<div class="note" style="margin-top:6px;color:var(--warn)">No torque values yet</div>') +
        (t.source ? '<div class="note" style="margin-top:6px">Source: ' + esc(t.source) + '</div>' : '') +
        '</div>').join('') + '</div>'
      : '') +

    /* companion links */
    (v ? '<h3 class="sec-h">Look it up</h3><div class="card" id="companion-box">' +
      '<p class="note" style="margin:0 0 14px">These open <b>your own</b> subscription or library account at the right vehicle. Garage never fetches or stores their content — the data stays theirs, the tab just lands where you were going.</p>' +
      '<div id="companion-list"><span class="spin"></span></div></div>' : '');

  if (v) loadCompanion();
}

function procCard(p) {
  const run = p.lastRun;
  const inProgress = run && !run.finished_at;
  const pct = run && p.stepCount ? Math.round((run.done_steps.length / p.stepCount) * 100) : 0;
  return '<div class="card">' +
    '<div class="between wrap" style="margin-bottom:8px"><div style="min-width:0">' +
    '<b style="font-weight:600;font-size:15.5px">' + esc(p.title) + '</b>' +
    '<div class="note">' + esc([p.system, p.category].filter(Boolean).join(' · ')) +
    ' · ' + p.stepCount + ' step' + (p.stepCount === 1 ? '' : 's') +
    (p.mediaCount ? ' · ' + p.mediaCount + ' photo' + (p.mediaCount === 1 ? '' : 's') : '') +
    (p.est_minutes ? ' · ~' + p.est_minutes + ' min' : '') + '</div></div>' +
    (p.difficulty ? '<span class="chip grey">' + '●'.repeat(p.difficulty) + '○'.repeat(5 - p.difficulty) + '</span>' : '') +
    '</div>' +
    (p.safety_flags?.length
      ? '<div class="row wrap" style="gap:6px;margin-bottom:8px">' +
      p.safety_flags.map(f => '<span class="chip bad" style="font-size:9px">' +
        esc((SAFETY_FLAGS.find(s => s[0] === f) || [, f])[1]) + '</span>').join('') + '</div>'
      : '') +
    (p.summary ? '<p class="note" style="margin:0 0 12px">' + esc(String(p.summary).slice(0, 160)) + '</p>' : '') +
    (inProgress ? '<div class="bar" style="margin-bottom:10px"><i class="warn" style="width:' + pct + '%"></i></div>' +
      '<div class="note" style="margin-bottom:10px">In progress — ' + run.done_steps.length + ' of ' + p.stepCount + ' done</div>' : '') +
    '<div class="row wrap" style="gap:8px">' +
    '<button class="btn xs" onclick="playProcedure(' + p.id + ')">' + (inProgress ? 'Resume' : 'Start job') + '</button>' +
    '<button class="btn xs ghost" onclick="editProcedure(' + p.id + ')">Edit</button>' +
    '<button class="btn xs ghost" onclick="delProcedure(' + p.id + ')">×</button></div></div>';
}

async function loadCompanion() {
  try {
    const r = await API.get('/vehicles/' + state.activeId + '/companion');
    PROCS.companion = r.links;
    const box = document.getElementById('companion-list');
    if (box) box.innerHTML = r.links.map(l =>
      '<div class="rowitem"><div class="ico">' + ic(l.paid ? 'money' : 'doc', 19) + '</div>' +
      '<div class="txt"><b>' + esc(l.label) + (l.paid ? ' <span class="chip grey" style="font-size:9px">PAID</span>' : ' <span class="chip ok" style="font-size:9px">FREE</span>') + '</b>' +
      '<span>' + esc(l.note || '') + '</span></div>' +
      '<a class="btn xs ghost" href="' + l.url + '" target="_blank" rel="noopener">Open</a>' +
      (l.search ? '<a class="btn xs ghost" href="' + l.search + '" target="_blank" rel="noopener">Search</a>' : '') +
      '</div>').join('');
  } catch { }
}
renderers.procedures = renderProcedures;

/* ============================================================
   CREATE / EDIT
   ============================================================ */
function newProcedure() {
  openModal(modalHead('New procedure', 'Give it a name now; add photos and steps next.') +
    fld('Title', inp('np-title', { ph: 'Front brake pads and rotors' })) +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('System', sel('np-system', PROC_SYSTEMS, 'brakes')) +
    fld('Category', sel('np-cat', ['maintenance', 'repair', 'inspection', 'modification'], 'repair')) +
    fld('Difficulty', sel('np-diff', [[1, '1 — easy'], [2, '2'], [3, '3 — moderate'], [4, '4'], [5, '5 — hard']], 3)) +
    '</div><div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Estimated minutes', inp('np-min', { type: 'number', mono: true, ph: '90' })) +
    fld('Estimated parts cost', inp('np-cost', { type: 'number', mono: true, ph: '180' })) +
    '</div><div style="height:14px"></div>' +
    fld('Summary', inp('np-summary', { ph: 'What this job covers and anything unusual about it' })) +
    '<div style="height:14px"></div>' +
    '<span class="mlabel">Safety</span><div class="row wrap" style="gap:14px;margin-bottom:14px">' +
    SAFETY_FLAGS.map(([k, label]) =>
      '<label class="row" style="gap:7px"><input type="checkbox" id="np-sf-' + k + '" style="width:17px;height:17px;accent-color:var(--primary)"> <span style="font-size:13.5px">' + label + '</span></label>').join('') +
    '</div>' +
    '<div class="grid g2" style="gap:14px">' +
    fld('Spec source', sel('np-source', ['', 'Mitchell1 DIY', 'ALLDATAdiy', 'ChiltonLibrary', 'EBSCO Auto Repair Source', 'Factory service manual', 'OEM service portal', 'Own experience'], '')) +
    fld('Reference', inp('np-ref', { ph: 'Section / page' })) + '</div>' +
    '<p class="note" style="margin:14px 0 16px">Recording where a spec came from is what separates a procedure you can trust in three years from a note you no longer believe.</p>' +
    '<button class="btn block" onclick="saveNewProcedure()">Create</button>');
}

async function saveNewProcedure() {
  if (!val('np-title')) return toast('Give it a title', 'bad');
  const flags = SAFETY_FLAGS.map(([k]) => k).filter(k => document.getElementById('np-sf-' + k)?.checked);
  try {
    const r = await API.post('/procedures', {
      vehicle_id: state.activeId, title: val('np-title'), system: val('np-system'),
      category: val('np-cat'), difficulty: intVal('np-diff'), est_minutes: intVal('np-min'),
      est_cost: numVal('np-cost'), summary: val('np-summary'), safety_flags: flags,
      source: val('np-source'), source_ref: val('np-ref')
    });
    closeModal();
    await loadProcedures(true);
    editProcedure(r.procedure.id);
  } catch (e) { toast(e.message, 'bad'); }
}

async function editProcedure(id) {
  try {
    const r = await API.get('/procedures/' + id);
    PROCS.current = r.procedure;
    PROCS.companion = r.companion;
    renderEditor();
  } catch (e) { toast(e.message, 'bad'); }
}

function renderEditor() {
  const p = PROCS.current;
  openModal(
    '<div class="between" style="margin-bottom:6px"><div>' +
    '<span class="mlabel" style="margin:0">Editing</span>' +
    '<h3 style="font-size:20px">' + esc(p.title) + '</h3></div>' +
    '<button onclick="closeModal();loadProcedures(true).then(renderProcedures)" style="font-size:24px;color:var(--muted)">&times;</button></div>' +
    '<p class="note" style="margin:0 0 16px">' + p.media.length + ' photo' + (p.media.length === 1 ? '' : 's') +
    ' · ' + p.steps.length + ' step' + (p.steps.length === 1 ? '' : 's') + '</p>' +

    /* photos */
    '<span class="mlabel">Photos of your vehicle</span>' +
    '<div class="grid g3" style="gap:12px;margin-bottom:12px">' +
    p.media.map(m => '<div class="card tight" style="padding:8px">' +
      mediaThumb(m) +
      '<div class="note" style="margin-top:6px">' + esc(m.caption || m.file_name || 'Figure') +
      ' · ' + (m.hotspots?.length || 0) + ' pin' + ((m.hotspots?.length || 0) === 1 ? '' : 's') + '</div>' +
      '<div class="row" style="gap:6px;margin-top:6px">' +
      '<button class="btn xs" onclick="openHotspotEditor(' + m.id + ')">Pins</button>' +
      '<button class="btn xs ghost" onclick="delMedia(' + m.id + ')">×</button></div></div>').join('') +
    '</div>' +
    '<div class="row wrap" style="gap:8px;margin-bottom:20px">' +
    '<input type="file" id="pm-file" accept="image/*" capture="environment" style="display:none" onchange="uploadProcedureMedia()">' +
    '<button class="btn sm" onclick="document.getElementById(\'pm-file\').click()">' + ic('plus', 14) + ' Add photo</button>' +
    '<button class="btn sm ghost" onclick="attachTorqueFigure()">Add torque figure</button></div>' +

    /* steps */
    '<span class="mlabel">Steps</span>' +
    (p.steps.length ? '<div style="margin-bottom:12px">' + p.steps.map(stepEditRow).join('') + '</div>'
      : '<p class="note" style="margin:0 0 12px">No steps yet. Each step gets a title, an optional photo, a torque value and its own tools.</p>') +
    '<button class="btn sm block ghost" onclick="addStep()">+ Add step</button>' +

    '<div class="row wrap" style="gap:8px;margin-top:20px">' +
    '<button class="btn" style="flex:1" onclick="playProcedure(' + p.id + ')">Run this job</button>' +
    '<button class="btn ghost" onclick="closeModal();loadProcedures(true).then(renderProcedures)">Done</button></div>',
    true);
}

function mediaThumb(m) {
  if (m.kind === 'torque' && m.svg) return '<div style="max-height:150px;overflow:hidden">' + m.svg + '</div>';
  return '<img src="/api/procedure-files/' + encodeURIComponent(m.file_path) + '" alt="" ' +
    'style="width:100%;height:110px;object-fit:cover;border-radius:10px">';
}

function stepEditRow(s) {
  const p = PROCS.current;
  const media = p.media.find(m => m.id === s.media_id);
  return '<div class="rowitem" style="align-items:flex-start">' +
    '<div class="ico">' + s.seq + '</div>' +
    '<div class="txt"><b>' + esc(s.title) + '</b>' +
    (s.body ? '<span>' + esc(String(s.body).slice(0, 120)) + '</span>' : '') +
    '<span>' + [media ? 'photo' : null, s.torque_value ? 'torque ' + esc(s.torque_value) : null,
    s.warning ? 'warning' : null].filter(Boolean).join(' · ') + '</span></div>' +
    '<div class="row" style="gap:4px">' +
    '<button class="btn xs ghost" onclick="moveStepUi(' + s.id + ',\'up\')">↑</button>' +
    '<button class="btn xs ghost" onclick="moveStepUi(' + s.id + ',\'down\')">↓</button>' +
    '<button class="btn xs ghost" onclick="editStep(' + s.id + ')">Edit</button>' +
    '<button class="btn xs ghost" onclick="delStep(' + s.id + ')">×</button></div></div>';
}

async function uploadProcedureMedia() {
  const f = document.getElementById('pm-file').files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('file', f);
  fd.append('kind', 'photo');
  try {
    await API.form('/procedures/' + PROCS.current.id + '/media', fd);
    await editProcedure(PROCS.current.id);
    toast('Photo added — now drop pins on it', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

async function attachTorqueFigure() {
  if (!TQ.pattern) { torqueStudio(); return toast('Build a pattern, then add it'); }
  const svg = torqueSvg(TQ.pattern, {});
  await API.post('/procedures/' + PROCS.current.id + '/media', { svg, kind: 'torque', caption: 'Tightening sequence' });
  await editProcedure(PROCS.current.id);
  toast('Torque figure attached', 'ok');
}

async function delMedia(id) {
  await API.del('/media/' + id);
  await editProcedure(PROCS.current.id);
}

/* ---------- steps ---------- */
function addStep(existing) {
  const p = PROCS.current;
  const s = existing || {};
  openModal(modalHead(s.id ? 'Edit step ' + s.seq : 'Step ' + (p.steps.length + 1)) +
    fld('What to do', inp('st-title', { value: s.title || '', ph: 'Compress the caliper piston' })) +
    '<div style="height:14px"></div>' +
    fld('Detail', '<textarea class="inp" id="st-body" placeholder="How, and what to watch for.">' + esc(s.body || '') + '</textarea>') +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Photo', sel('st-media', [['', 'None']].concat(p.media.map(m => [m.id, m.caption || m.file_name || ('Figure ' + m.id)])), s.media_id || '')) +
    fld('Torque', inp('st-torque', { value: s.torque_value || '', ph: '31 lb-ft (42 N·m)' })) + '</div>' +
    '<div style="height:14px"></div>' +
    fld('Tightening sequence', sel('st-pattern', [['', 'None']].concat(TQ.saved.map(t => [t.id, t.name])), s.torque_pattern_id || '')) +
    '<div style="height:14px"></div>' +
    fld('Warning', inp('st-warning', { value: s.warning || '', ph: 'Anything that can hurt you or destroy a part' })) +
    '<div style="height:14px"></div>' +
    fld('Parts / part numbers', inp('st-part', { value: s.part_note || '', ph: 'ACDelco 17D1367CH' })) +
    '<div style="height:14px"></div>' +
    '<label class="row" style="gap:9px"><input type="checkbox" id="st-check" ' + (s.is_check ? 'checked' : '') +
    ' style="width:18px;height:18px;accent-color:var(--primary)"> <span style="font-size:14px">This is a measurement or verification step</span></label>' +
    '<p class="note" style="margin:12px 0 16px">Torque values are yours to enter from a source you hold. Garage will never invent one — a fabricated number torqued into an aluminium head is how you buy a head.</p>' +
    '<button class="btn block" onclick="saveStep(' + (s.id || 0) + ')">Save step</button>');
}
function editStep(id) { addStep(PROCS.current.steps.find(s => s.id === id)); }

async function saveStep(id) {
  if (!val('st-title')) return toast('Give the step a title', 'bad');
  const body = {
    title: val('st-title'), body: val('st-body'),
    media_id: intVal('st-media'), torque_value: val('st-torque'),
    torque_pattern_id: intVal('st-pattern'), warning: val('st-warning'),
    part_note: val('st-part'), is_check: document.getElementById('st-check').checked ? 1 : 0
  };
  try {
    if (id) await API.patch('/steps/' + id, body);
    else await API.post('/procedures/' + PROCS.current.id + '/steps', body);
    await editProcedure(PROCS.current.id);
  } catch (e) { toast(e.message, 'bad'); }
}
async function moveStepUi(id, dir) {
  await API.post('/steps/' + id + '/move', { direction: dir });
  await editProcedure(PROCS.current.id);
}
async function delStep(id) {
  await API.del('/steps/' + id);
  await editProcedure(PROCS.current.id);
}
async function delProcedure(id) {
  const p = PROCS.list.find(x => x.id === id);
  confirmDo('Delete "' + (p?.title || 'procedure') + '"?', 'Its photos, pins and steps go with it.', async () => {
    await API.del('/procedures/' + id);
    await loadProcedures(true);
    renderProcedures();
    toast('Deleted');
  }, true);
}

/* ============================================================
   HOTSPOT EDITOR — tap the photo to drop a numbered pin
   ============================================================ */
function openHotspotEditor(mediaId) {
  const p = PROCS.current;
  const m = p.media.find(x => x.id === mediaId);
  if (!m) return;
  PROCS.editingMedia = mediaId;
  openModal(modalHead('Pins on ' + (m.caption || m.file_name || 'figure'),
    'Tap the photo where a component is. The pin gets the next number, and you can bind it to a step so it lights up when you reach that step.') +
    '<div id="hs-stage" style="position:relative;user-select:none;touch-action:manipulation">' + hotspotStage(m) + '</div>' +
    '<div id="hs-list" style="margin-top:14px">' + hotspotList(m) + '</div>' +
    '<p class="note" style="margin:14px 0 0">Pin positions are stored as a fraction of the image, so they stay put on a phone, a tablet and in a printed report.</p>',
    true);
  bindHotspotStage();
}

function hotspotStage(m, activeStep) {
  const inner = m.kind === 'torque' && m.svg
    ? '<div style="pointer-events:none">' + m.svg + '</div>'
    : '<img id="hs-img" src="/api/procedure-files/' + encodeURIComponent(m.file_path) + '" ' +
    'style="width:100%;display:block;border-radius:14px;pointer-events:none" alt="">';
  const pins = (m.hotspots || []).map(h => {
    const active = activeStep && h.step_id === activeStep;
    return '<div class="hs-pin' + (active ? ' on' : '') + '" data-h="' + h.id + '" ' +
      'style="left:' + (h.x * 100).toFixed(2) + '%;top:' + (h.y * 100).toFixed(2) + '%">' +
      (h.number || '•') + '</div>';
  }).join('');
  return '<div id="hs-wrap" style="position:relative;display:inline-block;width:100%">' + inner + pins + '</div>';
}

function hotspotList(m) {
  const p = PROCS.current;
  if (!m.hotspots?.length) return '<p class="note" style="margin:0">No pins yet — tap the photo.</p>';
  return m.hotspots.map(h =>
    '<div class="rowitem"><div class="ico">' + (h.number || '•') + '</div>' +
    '<div class="txt" style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<input class="inp" style="flex:1;min-width:140px;padding:7px 12px;font-size:13px" value="' + esc(h.label || '') +
    '" placeholder="What is this?" onchange="patchHotspot(' + h.id + ',{label:this.value})">' +
    '<select class="inp" style="flex:0 0 150px;padding:7px 12px;font-size:13px" onchange="patchHotspot(' + h.id + ',{step_id:this.value||null})">' +
    '<option value="">No step</option>' +
    p.steps.map(s => '<option value="' + s.id + '"' + (s.id === h.step_id ? ' selected' : '') + '>Step ' + s.seq + '</option>').join('') +
    '</select></div>' +
    '<button class="btn xs ghost" onclick="delHotspot(' + h.id + ')">×</button></div>').join('');
}

function bindHotspotStage() {
  const wrap = document.getElementById('hs-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', async e => {
    if (e.target.classList.contains('hs-pin')) return;
    const r = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    try {
      await API.post('/media/' + PROCS.editingMedia + '/hotspots', { x, y, shape: 'pin' });
      await refreshHotspots();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

async function refreshHotspots() {
  const r = await API.get('/procedures/' + PROCS.current.id);
  PROCS.current = r.procedure;
  const m = PROCS.current.media.find(x => x.id === PROCS.editingMedia);
  document.getElementById('hs-stage').innerHTML = hotspotStage(m);
  document.getElementById('hs-list').innerHTML = hotspotList(m);
  bindHotspotStage();
}
async function patchHotspot(id, body) {
  await API.patch('/hotspots/' + id, body);
  await refreshHotspots();
}
async function delHotspot(id) {
  await API.del('/hotspots/' + id);
  await refreshHotspots();
}

/* ============================================================
   PLAYER — one step at a time, gloves on, screen awake
   ============================================================ */
const PLAY = { proc: null, run: null, i: 0, done: new Set() };

async function playProcedure(id) {
  try {
    const r = await API.get('/procedures/' + id);
    PLAY.proc = r.procedure;
    if (!PLAY.proc.steps.length) { toast('Add a step first', 'bad'); return editProcedure(id); }
    const run = (await API.post('/procedures/' + id + '/run', { odometer: activeVehicle()?.mileage })).run;
    PLAY.run = run;
    PLAY.done = new Set(run.done_steps);
    PLAY.i = Math.min(PLAY.proc.steps.findIndex(s => !PLAY.done.has(s.id)) + 0, PLAY.proc.steps.length - 1);
    if (PLAY.i < 0) PLAY.i = 0;
    closeModal();
    document.getElementById('player').classList.remove('hide');
    keepAwake(true);
    drawPlayer();
    if (run.resumed) toast('Resumed where you left off — ' + PLAY.done.size + ' steps already done');
  } catch (e) { toast(e.message, 'bad'); }
}

function drawPlayer() {
  const p = PLAY.proc, s = p.steps[PLAY.i];
  const media = p.media.find(m => m.id === s.media_id);
  const pattern = s.torque_pattern_id ? p.patterns.find(t => t.id === s.torque_pattern_id) : null;
  const tools = [...new Set((String(s.tool_ids || '') + ',' + String(p.tool_ids || '')).split(',').map(x => x.trim()).filter(Boolean))];

  document.getElementById('player').innerHTML =
    '<div class="pl-top">' +
    '<button class="btn xs ghost" onclick="exitPlayer()">Close</button>' +
    '<div class="pl-title">' + esc(p.title) + '</div>' +
    '<div class="pl-count mono">' + (PLAY.i + 1) + ' / ' + p.steps.length + '</div></div>' +
    '<div class="bar" style="border-radius:0"><i class="' + (PLAY.done.size === p.steps.length ? 'ok' : '') +
    '" style="width:' + Math.round((PLAY.done.size / p.steps.length) * 100) + '%"></i></div>' +

    '<div class="pl-body">' +
    (p.safety_flags?.length && PLAY.i === 0
      ? p.safety_flags.map(f => safetyBox(f)).join('') : '') +

    '<h2 class="pl-step">' + esc(s.title) + '</h2>' +
    (s.warning ? '<div class="safety" style="margin-bottom:14px"><b>Warning</b>' + esc(s.warning) + '</div>' : '') +
    (media ? '<div style="position:relative;margin-bottom:16px">' + hotspotStage(media, s.id) + '</div>' : '') +
    (s.body ? '<p class="pl-text">' + esc(s.body) + '</p>' : '') +

    (s.torque_value
      ? '<div class="card" style="background:var(--elevated);border-color:var(--primary);margin:16px 0">' +
      '<span class="mlabel">Torque</span>' +
      '<div class="mono" style="font-size:26px;font-weight:700;color:var(--primary)">' + esc(s.torque_value) + '</div>' +
      (p.source ? '<div class="note" style="margin-top:4px">Source: ' + esc(p.source) + (p.source_ref ? ' · ' + esc(p.source_ref) : '') + '</div>' : '') +
      '</div>' : '') +

    (pattern
      ? '<div style="margin:16px 0">' + torqueSvg(buildPattern(pattern), { title: pattern.name }) +
      (pattern.stages?.length
        ? '<div class="row wrap" style="gap:8px;margin-top:10px">' + pattern.stages.map(st =>
          '<span class="chip">' + esc(st.label) + ': ' + (st.value != null ? st.value + ' ' + esc(st.unit || '') : '') +
          (st.angle ? ' + ' + st.angle + '°' : '') + '</span>').join('') + '</div>' : '') +
      '</div>' : '') +

    (s.part_note ? '<div class="kv"><span>Parts</span><b class="mono">' + esc(s.part_note) + '</b></div>' : '') +
    (tools.length ? '<div style="margin-top:16px">' + toolsPanel(p.title, p.system, { flat: true }) + '</div>' : '') +
    '</div>' +

    '<div class="pl-foot">' +
    '<button class="btn ghost" onclick="stepBy(-1)" ' + (PLAY.i === 0 ? 'disabled' : '') + '>Back</button>' +
    '<button class="btn ' + (PLAY.done.has(s.id) ? 'ghost' : '') + '" style="flex:1" onclick="toggleStepDone()">' +
    (PLAY.done.has(s.id) ? 'Done ✓' : 'Mark done') + '</button>' +
    (PLAY.i === p.steps.length - 1
      ? '<button class="btn" onclick="finishRun()">Finish</button>'
      : '<button class="btn" onclick="stepBy(1)">Next</button>') +
    '</div>';
}

function stepBy(d) {
  PLAY.i = Math.max(0, Math.min(PLAY.proc.steps.length - 1, PLAY.i + d));
  drawPlayer();
}

async function toggleStepDone() {
  const s = PLAY.proc.steps[PLAY.i];
  if (PLAY.done.has(s.id)) PLAY.done.delete(s.id); else PLAY.done.add(s.id);
  drawPlayer();
  try { await API.patch('/runs/' + PLAY.run.id, { done: [...PLAY.done] }); } catch { }
  if (PLAY.done.has(s.id) && PLAY.i < PLAY.proc.steps.length - 1) setTimeout(() => stepBy(1), 220);
}

async function finishRun() {
  const remaining = PLAY.proc.steps.length - PLAY.done.size;
  const go = async () => {
    try {
      const r = await API.patch('/runs/' + PLAY.run.id, {
        finish: true, done: [...PLAY.done], odometer: activeVehicle()?.mileage
      });
      exitPlayer();
      await loadProcedures(true);
      await refreshDetail();
      renderProcedures();
      toast(r.record ? 'Job finished and logged to service history' : 'Job finished', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  };
  if (remaining > 0) {
    confirmDo('Finish with ' + remaining + ' step' + (remaining === 1 ? '' : 's') + ' unticked?',
      'The run is recorded either way, and a service record is written against the vehicle.', go);
  } else await go();
}

function exitPlayer() {
  document.getElementById('player').classList.add('hide');
  document.getElementById('player').innerHTML = '';
  keepAwake(false);
}

function viewTorquePattern(id) {
  const t = TQ.saved.find(x => x.id === id);
  if (!t) return;
  const p = buildPattern(t);
  openModal(modalHead(t.name, esc([LAYOUTS[t.layout]?.label, t.bolt_count + ' fasteners', t.source].filter(Boolean).join(' · '))) +
    torqueSvg(p, { title: t.name }) +
    (t.stages?.length
      ? '<div style="margin-top:14px"><span class="mlabel">Stages</span>' +
      t.stages.map(s => '<div class="kv"><span style="flex:1;text-align:left">' + esc(s.label) + '</span><b class="mono">' +
        (s.value != null ? s.value + ' ' + esc(s.unit || '') : '') + (s.angle ? ' + ' + s.angle + '°' : '') + '</b></div>').join('') + '</div>'
      : '<p class="note" style="margin-top:14px;color:var(--warn)">No torque values recorded yet — add them from a source you hold.</p>') +
    '<p class="note" style="margin-top:14px">' + esc(LAYOUTS[t.layout]?.hint || '') + '</p>' +
    '<button class="btn block danger" style="margin-top:16px" onclick="delTorquePattern(' + t.id + ')">Delete pattern</button>');
}
async function delTorquePattern(id) {
  await API.del('/torque-patterns/' + id);
  await loadTorquePatterns();
  closeModal();
  renderProcedures();
}
