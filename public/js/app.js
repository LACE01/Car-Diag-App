/* ============================================================
   app.js — state, auth, routing, garage and vehicle health
   ============================================================ */
const state = {
  user: null,
  vehicles: [],
  activeId: null,
  detail: null,      // full payload for the active vehicle
  alerts: [],
  screen: 'garage'
};

function activeVehicle() { return state.vehicles.find(v => v.id === state.activeId) || null; }
function D() { return state.detail || {}; }

/* ============================================================
   AUTH
   ============================================================ */
let authMode = 'login';
function renderAuth(err) {
  document.getElementById('auth').classList.remove('hide');
  document.getElementById('app').classList.add('hide');
  document.getElementById('auth').innerHTML =
    '<div class="box"><div class="logo">' + ic('wrench', 26) + '</div>' +
    '<h2 style="font-size:26px;margin-bottom:5px">' + (authMode === 'login' ? 'Sign in to Garage' : 'Create your garage') + '</h2>' +
    '<p class="note" style="margin:0 0 22px">' + (authMode === 'login'
      ? 'Your vehicles, records and diagnostics live on your own server.'
      : 'One account, one garage. You can add family members or a shop to your garage afterwards.') + '</p>' +
    (err ? '<div class="safety" style="margin-bottom:16px">' + esc(err) + '</div>' : '') +
    (authMode === 'register' ? fld('Your name', inp('a-name', { ph: 'Luis Arce' })) + '<div style="height:14px"></div>' : '') +
    fld('Email', inp('a-email', { type: 'email', ph: 'you@example.com' })) + '<div style="height:14px"></div>' +
    fld('Password', inp('a-pw', { type: 'password', ph: 'at least 8 characters' })) +
    '<div style="height:22px"></div>' +
    '<button class="btn block" id="a-go">' + (authMode === 'login' ? 'Sign in' : 'Create account') + '</button>' +
    '<button class="btn block ghost" style="margin-top:10px" id="a-swap">' +
    (authMode === 'login' ? 'I need an account' : 'I already have an account') + '</button>' +
    '<p class="note" style="margin:20px 0 0;text-align:center">Garage is not a substitute for a qualified technician. Safety-critical work on brakes, SRS, fuel and high-voltage systems carries real risk.</p>' +
    '</div>';

  document.getElementById('a-swap').onclick = () => { authMode = authMode === 'login' ? 'register' : 'login'; renderAuth(); };
  document.getElementById('a-go').onclick = doAuth;
  document.getElementById('auth').querySelectorAll('input').forEach(i => {
    i.addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  });
}

async function doAuth() {
  const btn = document.getElementById('a-go');
  btn.disabled = true;
  try {
    const body = { email: val('a-email').trim(), password: val('a-pw') };
    if (authMode === 'register') body.name = val('a-name').trim();
    const r = await API.post('/auth/' + (authMode === 'login' ? 'login' : 'register'), body);
    state.user = r.user;
    await boot();
  } catch (e) {
    btn.disabled = false;
    renderAuth(e.message);
  }
}

window.__signedOut = () => {
  state.user = null;
  renderAuth();
};

async function signOut() {
  await API.post('/auth/logout');
  localStorage.removeItem('garage.activeId');
  window.__signedOut();
}

function accountSheet() {
  const u = state.user;
  openModal(modalHead('Account', esc(u.email)) +
    fld('Display name', inp('u-name', { value: u.name })) +
    '<div style="height:14px"></div>' +
    fld('Units', sel('u-units', [['imperial', 'Imperial — miles, gallons, °F, lb-ft'], ['metric', 'Metric — km, litres, °C, N·m']], UNITS.metric ? 'metric' : 'imperial')) +
    '<div style="height:20px"></div>' +
    '<button class="btn block" onclick="saveAccount()">Save</button>' +
    '<div style="height:22px"></div><span class="mlabel">Garage sharing</span>' +
    '<p class="note" style="margin:0 0 12px">Add someone who already has a Garage account. Members can edit records; viewers can only read.</p>' +
    '<div class="row" style="gap:8px"><input class="inp" id="m-email" placeholder="their@email.com" style="flex:1">' +
    sel('m-role', [['member', 'Member'], ['viewer', 'Viewer']], 'member') + '</div>' +
    '<button class="btn block ghost" style="margin-top:10px" onclick="addMember()">Add to my garage</button>' +
    '<div style="height:22px"></div>' +
    '<a class="btn block ghost" href="/api/export" download>' + ic('download', 15) + ' Export everything (JSON)</a>' +
    '<p class="note" style="margin:8px 0 0">Full data portability. Every vehicle, record, log, measurement and diagnostic session.</p>' +
    '<button class="btn block danger" style="margin-top:18px" onclick="signOut()">Sign out</button>');
}
async function saveAccount() {
  const units = val('u-units');
  await API.patch('/auth/me', { name: val('u-name'), units });
  localStorage.setItem('garage.metric', units === 'metric' ? '1' : '0');
  applyPrefs();
  closeModal(); toast('Saved', 'ok');
  await loadAll();
}
async function addMember() {
  try {
    const r = await API.post('/garages/' + state.user.garageId + '/members', { email: val('m-email'), role: val('m-role') });
    toast(r.member.name + ' added to your garage', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ============================================================
   ROUTING
   ============================================================ */
const TITLES = {
  garage: 'My Garage', vehicle: 'Vehicle Health', maintenance: 'Maintenance',
  diagnose: 'Diagnose', systems: 'Systems & Diagrams', money: 'Fuel & Money',
  ownership: 'Ownership & Documents', wear: 'Tires, Brakes & Battery',
  parts: 'Find Parts', records: 'Records & Reports'
};
const renderers = {};

async function go(id) {
  state.screen = id;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + id));
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.go === id));
  document.getElementById('ttl').textContent = TITLES[id];
  menu(false);
  if (id !== 'garage' && state.activeId && !state.detail) await loadDetail();
  renderers[id]();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function menu(o) { document.body.classList.toggle('menu', o); }
window.rerender = () => { if (renderers[state.screen]) renderers[state.screen](); renderNav(); };

function needVehicle(el, what) {
  el.innerHTML = '<div class="card empty"><div style="color:var(--primary);opacity:.45;margin-bottom:10px">' + ic('v_sedan', 46) + '</div>' +
    '<b style="display:block;font-size:16px;color:var(--ink);margin-bottom:6px">No vehicle selected</b>' +
    '<p class="note" style="max-width:360px;margin:0 auto 18px">Add a vehicle to ' + what + '.</p>' +
    '<button class="btn sm" onclick="openAdd()">+ Add vehicle</button></div>';
}

/* ============================================================
   DATA LOADING
   ============================================================ */
async function loadAll() {
  const r = await API.get('/dashboard');
  state.vehicles = r.vehicles;
  state.alerts = r.alerts;
  if (!state.activeId || !state.vehicles.some(v => v.id === state.activeId)) {
    const saved = parseInt(localStorage.getItem('garage.activeId'), 10);
    state.activeId = state.vehicles.some(v => v.id === saved) ? saved : (state.vehicles[0]?.id ?? null);
  }
  renderNav();
}

async function loadDetail(force) {
  if (!state.activeId) { state.detail = null; return; }
  if (!force && state.detail && state.detail.vehicle.id === state.activeId) return;
  state.detail = await API.get('/vehicles/' + state.activeId);
}

async function setActive(id) {
  state.activeId = id;
  localStorage.setItem('garage.activeId', id);
  state.detail = null;
  VH.id = null; EPA.id = null; VCONF.loaded = false;   // per-vehicle caches
  await loadDetail();
  renderNav();
  if (renderers[state.screen]) renderers[state.screen]();
}

async function refreshDetail() {
  await loadDetail(true);
  await loadAll();
  if (renderers[state.screen]) renderers[state.screen]();
  loadVehicleExtras(true);   // attention board recomputes in the background
}

/* ============================================================
   NAV
   ============================================================ */
function renderNav() {
  const sel = document.getElementById('navveh');
  if (state.vehicles.length) {
    sel.classList.remove('hide');
    sel.innerHTML = state.vehicles.map(v =>
      '<option value="' + v.id + '"' + (v.id === state.activeId ? ' selected' : '') + '>' +
      esc(v.nickname || vLabel(v)) + '</option>').join('');
  } else sel.classList.add('hide');

  const bad = state.alerts.filter(a => a.level === 'bad').length;
  const b = document.querySelector('.nav a[data-go="garage"] .badge');
  if (b) b.remove();
  if (bad) {
    const a = document.querySelector('.nav a[data-go="garage"]');
    a.insertAdjacentHTML('beforeend', '<span class="badge">' + bad + '</span>');
  }
  const av = document.querySelector('.topbar .avatar');
  if (av && state.user) av.textContent = (state.user.name || state.user.email).slice(0, 2).toUpperCase();
}

/* ============================================================
   ADD VEHICLE
   ============================================================ */
let addMode = 'vin', mYear = null, mMake = null, mModel = null;
function openAdd() {
  addMode = 'vin'; mYear = mMake = mModel = null;
  renderAddModal();
}
function renderAddModal() {
  openModal(modalHead('Add a vehicle') +
    '<div class="seg"><button class="' + (addMode === 'vin' ? 'on' : '') + '" onclick="addMode=\'vin\';renderAddModal()">Decode a VIN</button>' +
    '<button class="' + (addMode === 'ymm' ? 'on' : '') + '" onclick="addMode=\'ymm\';renderAddModal()">Year / Make / Model</button></div>' +
    '<div id="mform">' + (addMode === 'vin' ? vinForm() : ymmForm()) + '</div>');
  if (addMode === 'ymm') loadYears();
}
function vinForm() {
  return '<span class="mlabel">Vehicle identification number</span>' +
    '<input class="inp mono" id="vinin" placeholder="17 characters" maxlength="17" style="letter-spacing:.08em" ' +
    'oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,\'\')">' +
    '<p class="note" style="margin:10px 0 16px">Driver door jamb, base of the windshield, or your registration. Decoded against NHTSA vPIC, then recalls and owner complaints pull automatically. The VIN is what gives you engine displacement and cylinder count — without those, half the torque specs and parts fitments are wrong.</p>' +
    commonAddFields() +
    '<div id="vinerr"></div><button class="btn block" onclick="submitVin()">Decode and add</button>' +
    '<button class="btn block ghost" style="margin-top:10px" onclick="document.getElementById(\'vinin\').value=\'1GCVKREC5EZ123456\'">Use a sample VIN</button>';
}
function ymmForm() {
  return '<div class="grid" style="gap:14px;margin-bottom:14px">' +
    fld('Year', '<select class="inp" id="yr" onchange="pickYear(this.value)"><option>Loading…</option></select>') +
    fld('Make', '<select class="inp" id="mk" disabled onchange="pickMake(this.value)"><option>Pick a year first</option></select>') +
    fld('Model', '<select class="inp" id="md" disabled onchange="mModel=this.value;document.getElementById(\'ymmgo\').disabled=!this.value"><option>Pick a make first</option></select>') +
    '</div>' +
    '<p class="note" style="margin:0 0 16px">Lists load live from NHTSA. Without a VIN there is no engine, drivetrain or trim — the vehicle card will say so rather than pretend.</p>' +
    commonAddFields() +
    '<button class="btn block" id="ymmgo" disabled onclick="submitYmm()">Add vehicle</button>';
}
function commonAddFields() {
  return '<div class="grid g2" style="gap:14px;margin-bottom:16px">' +
    fld('Current odometer', inp('v-miles', { type: 'number', mono: true, ph: '142310' })) +
    fld('Duty cycle', sel('v-duty', [['normal', 'Normal duty'], ['severe', 'Severe duty']], 'normal')) +
    '</div>' +
    '<p class="note" style="margin:-6px 0 16px">Severe duty means short trips under 5 miles, extensive idling, towing, dusty roads, mountains, or extreme heat or cold. It roughly halves most intervals — this is the single setting most apps get wrong.</p>';
}
function loadYears() {
  const s = document.getElementById('yr');
  if (!s) return;
  const now = new Date().getFullYear() + 1;
  let o = '<option value="">Select…</option>';
  for (let y = now; y >= 1981; y--) o += '<option value="' + y + '">' + y + '</option>';
  s.innerHTML = o;
}
async function pickYear(y) {
  mYear = y; mMake = mModel = null;
  const mk = document.getElementById('mk'), md = document.getElementById('md');
  md.disabled = true; md.innerHTML = '<option>Pick a make first</option>';
  document.getElementById('ymmgo').disabled = true;
  if (!y) { mk.disabled = true; return; }
  mk.disabled = true; mk.innerHTML = '<option>Loading…</option>';
  let makes = [];
  try { makes = (await API.get('/ref/makes/' + y)).makes; } catch { }
  mk.innerHTML = '<option value="">Select…</option>' + makes.map(m => '<option>' + esc(m) + '</option>').join('');
  mk.disabled = false;
}
async function pickMake(m) {
  mMake = m; mModel = null;
  const md = document.getElementById('md');
  document.getElementById('ymmgo').disabled = true;
  if (!m) { md.disabled = true; return; }
  md.disabled = true; md.innerHTML = '<option>Loading…</option>';
  let models = [];
  try { models = (await API.get('/ref/models/' + mYear + '/' + encodeURIComponent(m))).models; } catch { }
  md.innerHTML = '<option value="">Select…</option>' + models.map(x => '<option>' + esc(x) + '</option>').join('');
  md.disabled = false;
}
async function submitVin() {
  const vin = val('vinin').trim();
  const err = document.getElementById('vinerr');
  err.innerHTML = '<p class="note" style="margin:0 0 14px"><span class="spin"></span> Decoding with NHTSA vPIC…</p>';
  try {
    await createVehicle({ vin });
  } catch (e) {
    err.innerHTML = '<p class="note" style="color:var(--bad);margin:0 0 14px">' + esc(e.message) + '</p>';
  }
}
async function submitYmm() {
  try { await createVehicle({ year: mYear, make: mMake, model: mModel }); }
  catch (e) { toast(e.message, 'bad'); }
}
async function createVehicle(base) {
  const body = Object.assign({}, base, {
    mileage: intVal('v-miles') || 0,
    duty: val('v-duty') || 'normal'
  });
  const r = await API.post('/vehicles', body);
  closeModal();
  toast('Added ' + vLabel(r.vehicle) + ' — pulling recalls…', 'ok');
  await loadAll();
  await setActive(r.vehicle.id);
  renderGarage();
  setTimeout(async () => { try { await API.post('/vehicles/' + r.vehicle.id + '/refresh'); await refreshDetail(); renderGarage(); } catch { } }, 1600);
}

async function removeVehicle(id, e) {
  if (e) e.stopPropagation();
  const v = state.vehicles.find(x => x.id === id);
  confirmDo('Remove ' + vLabel(v) + '?',
    'This deletes every service record, fuel log, measurement and diagnostic session attached to it. Export first if you want a copy.',
    async () => {
      await API.del('/vehicles/' + id);
      state.detail = null;
      await loadAll();
      if (state.vehicles.length) await setActive(state.vehicles[0].id); else state.activeId = null;
      renderGarage();
      toast('Vehicle removed');
    }, true);
}

/* ============================================================
   ODOMETER
   ============================================================ */
function logOdometer(id, e) {
  if (e) e.stopPropagation();
  const v = state.vehicles.find(x => x.id === id) || activeVehicle();
  openModal(modalHead('Log odometer', 'Stored with a timestamp and a source, so intervals stay accurate and a rollback is detectable.') +
    fld('Current reading', inp('miin', { type: 'number', mono: true, value: v.mileage || '', ph: '142310' })) +
    '<div style="height:14px"></div>' +
    fld('Source', sel('misrc', [['manual', 'Manual entry'], ['obd', 'Read from OBD'], ['receipt', 'From a receipt'], ['photo', 'From a photo of the cluster']], 'manual')) +
    '<div style="height:20px"></div>' +
    '<button class="btn block" onclick="saveOdometer(' + v.id + ')">Save reading</button>');
}
async function saveOdometer(id) {
  const r = await API.post('/vehicles/' + id + '/odometer', { value: intVal('miin'), source: val('misrc') });
  closeModal();
  toast(r.warning || 'Odometer logged', r.warning ? 'bad' : 'ok');
  await refreshDetail();
  renderGarage();
}

/* ============================================================
   SCREEN: MY GARAGE
   ============================================================ */
function renderGarage() {
  const g = document.getElementById('veh-grid');
  const openR = state.vehicles.reduce((n, v) => n + (v.open_recalls || 0), 0);
  const overdue = state.vehicles.reduce((n, v) => n + (v.due?.overdue || 0), 0);
  document.getElementById('garagesub').textContent = state.vehicles.length
    ? `${state.vehicles.length} vehicle${state.vehicles.length > 1 ? 's' : ''} · ${openR} open recall${openR === 1 ? '' : 's'} · ${overdue} item${overdue === 1 ? '' : 's'} overdue`
    : 'No vehicles yet — add one to begin';

  g.innerHTML = state.vehicles.map(v => {
    const rc = v.open_recalls || 0;
    const od = v.due?.overdue || 0;
    const badge = rc
      ? '<span class="chip bad"><span class="dot"></span>' + rc + ' recall' + (rc > 1 ? 's' : '') + '</span>'
      : od ? '<span class="chip warn"><span class="dot"></span>' + od + ' overdue</span>'
        : '<span class="chip ok"><span class="dot"></span>All clear</span>';
    return '<div class="veh"><div class="hero" style="background:linear-gradient(135deg,' + (v.hue || '#EDEAFE,#DCD6FC') + ')" onclick="setActive(' + v.id + ').then(()=>go(\'vehicle\'))">' +
      ic(v.icon, 70, 'stroke-width="1.2"') + '<div style="position:absolute;top:12px;right:12px">' + badge + '</div>' +
      '<button class="x" onclick="removeVehicle(' + v.id + ',event)" title="Remove">&times;</button></div>' +
      '<div class="body"><h3 onclick="setActive(' + v.id + ').then(()=>go(\'vehicle\'))">' + esc(v.nickname || vLabel(v)) + '</h3>' +
      '<div class="sub">' + (esc([v.trim, v.engine, String(v.drive || '').split('/')[0]].filter(Boolean).join(' · ')) || 'Decode a VIN for full specs') +
      (v.duty === 'severe' ? ' · <b style="color:var(--warn)">severe duty</b>' : '') + '</div>' +
      '<div class="stats"><div><span class="mlabel">Odometer</span><div class="field mono" style="cursor:pointer" onclick="logOdometer(' + v.id + ',event)">' +
      (v.mileage ? dist(v.mileage) : '<small style="font-family:Inter">Tap to log</small>') + '</div></div>' +
      '<div><span class="mlabel">Economy</span><div class="field mono">' +
      (v.economy ? v.economy + ' <small style="font-family:Inter">' + v.economy_unit + '</small>' : '<small style="font-family:Inter">Log fuel</small>') + '</div></div>' +
      '</div></div></div>';
  }).join('') +
    '<div class="addveh" onclick="openAdd()"><div><div style="font-size:34px;margin-bottom:8px;line-height:1">+</div>Add a vehicle<div class="note" style="margin-top:5px">VIN or year / make / model</div></div></div>';

  renderAlerts();
}

function renderAlerts() {
  const a = document.getElementById('alerts');
  if (!state.alerts.length) {
    a.innerHTML = state.vehicles.length
      ? '<h3 class="sec-h">Notification board</h3><div class="card empty"><div style="color:var(--ok);margin-bottom:8px">' + ic('check', 34) + '</div><b style="color:var(--ink)">Nothing needs your attention</b><p class="note" style="margin:6px 0 0">No open recalls, nothing overdue, no stored codes.</p></div>'
      : '';
    return;
  }
  const icons = { recall: 'alert', maintenance: 'wrench', warranty: 'shield', document: 'doc', tires: 'tire', battery: 'battery', brakes: 'brake', dtc: 'mil', odometer: 'chart' };
  const cols = { bad: ['#FBE1E1', '#C33A3A'], warn: ['#FDF0D8', '#A9700A'], ok: ['#DEF5EA', '#188752'] };
  a.innerHTML = '<h3 class="sec-h">Notification board <span class="chip ' + (state.alerts.some(x => x.level === 'bad') ? 'bad' : 'warn') + '">' + state.alerts.length + '</span>' +
    '<span class="src">Live · NHTSA + your records</span></h3><div class="card">' +
    state.alerts.slice(0, 30).map(x => {
      const c = cols[x.level] || cols.warn;
      return '<div class="rowitem"><div class="ico" style="background:' + c[0] + ';color:' + c[1] + '">' + ic(icons[x.kind] || 'alert', 20) + '</div>' +
        '<div class="txt"><b>' + esc(x.title) + '</b><span>' + esc(x.body || '') + (x.action ? ' — ' + esc(x.action) : '') + '</span>' +
        '<span style="font-size:11px;opacity:.75">' + esc(x.vehicle) + '</span></div>' +
        '<button class="btn xs ghost" onclick="jumpToAlert(' + x.vehicle_id + ',\'' + x.kind + '\')">Open</button></div>';
    }).join('') + '</div>';
}

async function jumpToAlert(vid, kind) {
  await setActive(vid);
  const map = { recall: 'vehicle', maintenance: 'maintenance', warranty: 'ownership', document: 'ownership', tires: 'wear', battery: 'wear', brakes: 'wear', dtc: 'diagnose', odometer: 'records' };
  go(map[kind] || 'vehicle');
}
renderers.garage = renderGarage;

/* ============================================================
   SCREEN: VEHICLE HEALTH
   ============================================================ */
/* Federal reference data loads after the page renders, so a slow or
   missing upstream never blocks the vehicle card. */
const VH = { id: null, attention: null, safety: null, loading: false };

async function loadVehicleExtras(force) {
  const v = activeVehicle();
  if (!v) return;
  if (VH.id === v.id && !force) return;
  VH.id = v.id; VH.loading = true; VH.attention = null; VH.safety = null;
  try {
    VH.attention = await API.get('/vehicles/' + v.id + '/attention');
  } catch (e) { VH.attention = { error: e.message }; }
  try {
    VH.safety = await API.get('/vehicles/' + v.id + '/safety');
  } catch (e) { VH.safety = { available: false }; }
  VH.loading = false;
  if (state.screen === 'vehicle') renderVehicle();
}

const LEVEL_STYLE = {
  critical: ['bad', 'CRITICAL', '#FBE1E1', '#C33A3A'],
  high: ['bad', 'HIGH', '#FBE1E1', '#C33A3A'],
  medium: ['warn', 'MEDIUM', '#FDF0D8', '#A9700A'],
  info: ['grey', 'INFO', '#F0EFF7', '#8B8AA5']
};

function attentionHtml() {
  if (VH.loading || !VH.attention) {
    return '<div class="card"><span class="spin"></span> Checking recalls, federal investigations, manufacturer bulletins, EPA economy and weather…</div>';
  }
  if (VH.attention.error) {
    return '<div class="card"><p class="note" style="margin:0">Could not build the attention board: ' + esc(VH.attention.error) + '</p></div>';
  }
  const { items, counts } = VH.attention;
  if (!items.length) {
    return '<div class="card empty"><div style="color:var(--ok);margin-bottom:8px">' + ic('check', 34) + '</div>' +
      '<b style="color:var(--ink)">Nothing needs your attention</b>' +
      '<p class="note" style="margin:6px 0 0">No unremedied recalls, no open federal investigation, nothing overdue, no stored codes.</p></div>';
  }
  const icons = { recall: 'alert', investigation: 'alert', dtc: 'mil', maintenance: 'wrench', battery: 'battery', tires: 'tire', brakes: 'brake', warranty: 'shield', document: 'doc', economy: 'chart', complaints: 'user', tsb: 'doc', weather: 'temp' };

  return '<div class="row wrap" style="gap:8px;margin-bottom:14px">' +
    ['critical', 'high', 'medium', 'info'].filter(l => counts[l]).map(l =>
      '<span class="chip ' + LEVEL_STYLE[l][0] + '">' + counts[l] + ' ' + LEVEL_STYLE[l][1] + '</span>').join('') +
    '</div><div class="card">' +
    items.map(x => {
      const st = LEVEL_STYLE[x.level] || LEVEL_STYLE.info;
      return '<div style="padding:14px 0;border-bottom:1px solid var(--line)">' +
        '<div class="row" style="gap:14px;align-items:flex-start">' +
        '<div class="ico" style="background:' + st[2] + ';color:' + st[3] + '">' + ic(icons[x.kind] || 'alert', 20) + '</div>' +
        '<div style="flex:1;min-width:0">' +
        '<div class="between wrap" style="gap:8px"><b style="font-weight:600;font-size:15px">' + esc(x.title) + '</b>' +
        '<span class="chip ' + st[0] + '" style="font-size:9px">' + st[1] + '</span></div>' +
        '<div class="note" style="margin-top:3px;color:var(--ink)">' + esc(x.body || '') + '</div>' +
        (x.why ? '<div class="note" style="margin-top:6px">' + esc(x.why) + '</div>' : '') +
        '<div class="row wrap" style="gap:6px;margin-top:8px">' +
        '<span class="chip grey" style="font-size:9px">SOURCE · ' + esc(x.source || 'unknown') + '</span>' +
        (x.confidence ? '<span class="chip ' + (/^LOW/.test(x.confidence) ? 'warn' : 'grey') + '" style="font-size:9px">CONFIDENCE · ' + esc(x.confidence) + '</span>' : '') +
        '</div></div></div></div>';
    }).join('') +
    '<p class="note" style="margin:14px 0 0">Sorted by what can hurt you, not by what arrived most recently. Every line carries its source and how much confidence it deserves — "31 owner complaints mention steering" is a reason to inspect, not evidence that your truck has a steering defect.</p></div>';
}

const TELLTALES = [
  ['oil', 'Oil pressure'], ['temp', 'Coolant temp'], ['battery', 'Charging'],
  ['brake', 'Brake system'], ['abs', 'ABS'], ['mil', 'MIL / check engine'],
  ['tpms', 'Tire pressure'], ['srs', 'Airbag / SRS']
];

function renderVehicle() {
  const el = document.getElementById('s-vehicle');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'see its specification, schedule and recall status');
  if (VH.id !== v.id) loadVehicleExtras();
  const d = D();
  const ctx = VH.attention?.context || {};
  const specs = [['Engine', v.engine], ['Horsepower', v.hp ? v.hp + ' hp' : '—'], ['Drive', v.drive], ['Body', v.body],
  ['Fuel', v.fuel], ['Transmission', v.trans], ['Doors', v.doors], ['Built in', v.plant], ['GVWR', v.gvwr], ['VIN', v.vin]];
  const openR = (d.recalls || []).filter(r => !r.completed && !r.dismissed);
  const openDtc = (d.dtcs || []).filter(t => !t.cleared_at);

  el.innerHTML =
    '<div class="stage"><div class="art" style="background:linear-gradient(150deg,' + (v.hue || '#EDEAFE,#DCD6FC') + ')">' + ic(v.icon, 150, 'stroke-width="1"') +
    (v.vin ? '<span class="chip mono" style="position:absolute;top:16px;left:16px">' + esc(v.vin) + '</span>' : '') +
    '<span class="chip ' + (openR.length ? 'bad' : 'ok') + '" style="position:absolute;top:16px;right:16px"><span class="dot"></span>' +
    (openR.length ? openR.length + ' open recall' + (openR.length > 1 ? 's' : '') : 'No open recalls') + '</span></div>' +
    '<div class="sheet"><div class="handle"></div><div class="between wrap" style="margin-bottom:18px"><div>' +
    '<h2 style="font-size:22px">' + esc(v.nickname || (vLabel(v) + ' ' + (v.trim || ''))) + '</h2>' +
    '<p class="note" style="margin:3px 0 0">' + esc([v.engine, v.drive, v.trans].filter(Boolean).join(' · ')) + '</p></div>' +
    '<span class="src ' + (v.source === 'vin' ? '' : 'sample') + '">' + (v.source === 'vin' ? 'vPIC decoded' : 'Manual entry') + '</span></div>' +
    '<div class="grid g4" style="gap:14px;margin-bottom:20px">' +
    fld('Odometer', '<div class="field mono" style="cursor:pointer" onclick="logOdometer(' + v.id + ')">' + (v.mileage ? dist(v.mileage) : 'Log') + ' <small style="font-family:Inter">' + distUnit() + '</small></div>') +
    fld('Duty cycle', '<div class="field" style="cursor:pointer" onclick="toggleDuty()"><small>' + (v.duty === 'severe' ? 'Severe' : 'Normal') + ' — tap to change</small></div>') +
    fld('Economy', '<div class="field mono">' + (d.economy?.average ? d.economy.average + ' <small style="font-family:Inter">' + d.economy.unit + '</small>' : '<small style="font-family:Inter">Log fuel</small>') + '</div>') +
    fld('Cost per mile', '<div class="field mono">' + (d.tco?.costPerMile ? money(d.tco.costPerMile, 3) : '<small style="font-family:Inter">—</small>') + '</div>') +
    '</div>' +
    '<div class="row wrap" style="gap:10px"><button class="btn" style="flex:1;min-width:180px" onclick="go(\'diagnose\')">Start diagnostic scan</button>' +
    '<button class="btn ghost" onclick="refreshNhtsa()">Refresh NHTSA data</button></div></div></div>' +

    /* ---- what needs attention ---- */
    '<h3 class="sec-h">What needs attention</h3>' + attentionHtml() +

    /* ---- bulk datasets need a one-time pull ---- */
    '<h3 class="sec-h">NHTSA bulk datasets</h3><div class="card">' +
    '<div class="grid g2" style="gap:14px;margin-bottom:14px">' +
    [['investigations', 'Investigations', ctx.investigations, 'a single 4 MB file, every investigation since 1972'],
    ['communications', 'Manufacturer bulletins', ctx.communications, 'five-year blocks, only the ones covering your vehicle years']]
      .map(([src, label, obj, sub]) => {
        const done = obj && !obj.needsIngest;
        return '<div style="border:1.5px solid ' + (done ? 'var(--ok)' : 'var(--line)') + ';border-radius:16px;padding:14px">' +
          '<div class="between" style="margin-bottom:6px"><b style="font-weight:600">' + label + '</b>' +
          '<span class="chip ' + (done ? 'ok' : 'grey') + '">' + (done ? 'LOADED' : 'NOT PULLED') + '</span></div>' +
          '<div class="note" style="margin-bottom:10px">' + (done
            ? (obj.total != null ? '<b>' + num(obj.total) + '</b> entries match this vehicle' : 'ready') +
            (obj.ingestedAt ? ' · pulled ' + esc(String(obj.ingestedAt).slice(0, 10)) : '')
            : sub) + '</div>' +
          '<button class="btn xs ' + (done ? 'ghost' : '') + '" onclick="runIngest(\'' + src + '\')">' +
          (done ? 'Refresh' : 'Pull now') + '</button></div>';
      }).join('') + '</div>' +
    '<p class="note" style="margin:0">NHTSA serves recalls, complaints and crash ratings as APIs — those are live above with no setup. <b>Investigations and manufacturer communications are download-only</b>, so Garage pulls the published flat files once and answers from your own database afterwards. One request to NHTSA instead of thousands, and it keeps working with no signal.</p></div>' +

    /* ---- federal investigations ---- */
    (ctx.investigations?.available
      ? '<h3 class="sec-h" id="sec-investigations">Federal investigations ' +
      '<span class="chip ' + (ctx.investigations.open.length ? 'bad' : 'grey') + '">' +
      ctx.investigations.open.length + ' open</span>' +
      '<span class="chip grey">' + ctx.investigations.closed.length + ' closed</span>' +
      '<span class="src">NHTSA bulk dataset' + (ctx.investigations.ingestedAt ? ' · ' + esc(String(ctx.investigations.ingestedAt).slice(0, 10)) : '') + '</span></h3><div class="card">' +
      (ctx.investigations.open.length
        ? ctx.investigations.open.map(i => '<div style="padding:14px 0;border-bottom:1px solid var(--line)">' +
          '<div class="row" style="gap:14px;align-items:flex-start">' +
          '<div class="ico" style="background:#FBE1E1;color:#C33A3A">' + ic('alert', 20) + '</div>' +
          '<div style="flex:1;min-width:0"><div class="between wrap">' +
          '<b class="mono" style="font-size:13px">' + esc(i.number || 'Investigation') + '</b>' +
          '<span class="chip bad">OPEN</span></div>' +
          '<div style="font-weight:600;margin-top:3px">' + esc(i.summary || '') + '</div>' +
          '<div class="note">' + esc(i.component || '') + ' · opened ' + esc(i.openDate || '—') + '</div>' +
          (i.detail ? '<div class="note" style="margin-top:6px">' + esc(String(i.detail).slice(0, 600)) + '</div>' : '') +
          '</div></div></div>').join('')
        : '<p class="note" style="margin:0 0 12px">No <b>open</b> investigation on this vehicle line right now.</p>') +

      (ctx.investigations.closed.length
        ? '<div style="margin-top:14px"><span class="mlabel">Closed investigations — the history of what NHTSA has already looked at</span>' +
        ctx.investigations.closed.slice(0, 12).map(i =>
          '<div class="kv"><span style="flex:1;text-align:left">' +
          '<b class="mono" style="font-size:11.5px;color:var(--ink)">' + esc(i.number || '') + '</b> ' +
          esc(String(i.summary || i.component || '').slice(0, 90)) +
          (i.campaign ? ' <span class="chip bad" style="font-size:9px">→ recall ' + esc(i.campaign) + '</span>' : '') +
          '</span><b style="font-size:12px">' + esc(i.openDate || '') + ' → ' + esc(i.closeDate || '') + '</b></div>').join('') +
        '<p class="note" style="margin:10px 0 0">Where an investigation produced a recall, the campaign number is shown — that is the chain from "NHTSA noticed a pattern" to "the manufacturer had to fix it".</p></div>'
        : '') +
      '<p class="note" style="margin:14px 0 0">' + esc(ctx.investigations.caveat) + '</p></div>'
      : '') +

    /* ---- manufacturer communications ---- */
    (ctx.communications?.available
      ? '<h3 class="sec-h">Manufacturer communications <span class="chip grey">' + ctx.communications.total + '</span>' +
      '<span class="src">NHTSA bulk dataset</span></h3><div class="card">' +
      ((ctx.communications.warrantyExtensions || []).length
        ? '<div class="safety" style="background:#DEF5EA;border-color:var(--ok);color:#0F5A38;margin-bottom:14px">' +
        '<b>Warranty extensions — read these</b>' +
        ctx.communications.warrantyExtensions.slice(0, 3).map(w =>
          esc(w.number || '') + ' · ' + esc(String(w.subject || '').slice(0, 180))).join('<br>') +
        '<br>A warranty extension is the manufacturer quietly agreeing to cover a known failure past the normal term. Unlike an ordinary bulletin, this one can genuinely mean the repair is free.</div>'
        : '') +
      ((ctx.communications.byType || []).length
        ? '<div class="row wrap" style="gap:7px;margin-bottom:14px">' +
        ctx.communications.byType.map(t => '<span class="chip grey">' + esc(t.type) + ' · ' + t.count + '</span>').join('') + '</div>'
        : '') +
      (ctx.communications.byComponent.slice(0, 8).map(c =>
        '<div class="rowitem"><div class="ico mono">' + c.count + '</div><div class="txt"><b>' + esc(c.component) + '</b>' +
        '<span>bulletins on file' + (c.latest ? ' · latest ' + esc(String(c.latest).slice(0, 10)) : '') + '</span></div></div>').join('') || '<p class="note" style="margin:0">None on file.</p>') +
      (ctx.communications.items.length
        ? '<div style="margin-top:14px"><span class="mlabel">Most recent subjects</span>' +
        ctx.communications.items.slice(0, 6).map(i => '<div class="kv"><span style="flex:1;text-align:left">' +
          esc(String(i.subject || '').slice(0, 150)) + '</span><b class="mono" style="font-size:11px">' + esc(i.number || '') + '</b></div>').join('') + '</div>'
        : '') +
      '<p class="note" style="margin:14px 0 0">' + esc(ctx.communications.caveat) + '</p></div>'
      : '') +

    /* ---- safety ratings ---- */
    (VH.safety?.available
      ? '<h3 class="sec-h">NCAP safety ratings <span class="src">NHTSA</span></h3><div class="card">' +
      VH.safety.variants.map(r => '<div style="padding:12px 0;border-bottom:1px solid var(--line)">' +
        '<b style="font-weight:600">' + esc(r.description) + '</b>' +
        '<div class="grid g5" style="gap:10px;margin-top:10px">' +
        [['Overall', r.overall], ['Frontal', r.frontal], ['Side', r.side], ['Rollover', r.rollover],
        ['Rollover risk', r.rolloverPossibility != null ? (r.rolloverPossibility * 100).toFixed(1) + '%' : null]]
          .map(x => '<div><span class="mlabel mute">' + x[0] + '</span><div class="field mono">' +
            (x[1] == null ? '—' : (typeof x[1] === 'number' ? stars(x[1]) : x[1])) + '</div></div>').join('') +
        '</div></div>').join('') +
      '<p class="note" style="margin:14px 0 0">' + esc(VH.safety.caveat) + '</p></div>'
      : '') +

    /* tell-tales */
    '<h3 class="sec-h">Tell-tale reference <span class="src sample">ISO 2575 / SAE J2402</span></h3>' +
    '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:12px">' +
    TELLTALES.map(t => {
      const active = t[0] === 'mil' && openDtc.length;
      return '<div class="tell" style="color:' + (active ? 'var(--warn)' : 'var(--muted)') + '">' + ic(t[0], 28) +
        '<b style="color:var(--ink)">' + t[1] + '</b><span>' + (active ? 'Codes stored' : 'No fault logged') + '</span></div>';
    }).join('') + '</div>' +
    '<p class="note" style="margin-top:10px">Symbols conform to ISO 2575, the international standard for road-vehicle controls, indicators and tell-tales; SAE J2402 adopts the same set for the US market. These are the exact glyphs on your cluster. Status reflects what is logged in Garage, not a live feed from the car — connect an adapter on the Diagnose screen for that.</p>' +

    /* recalls */
    (d.recalls?.length ? '<h3 class="sec-h">Recalls <span class="src">Live · NHTSA</span></h3><div class="card">' +
      d.recalls.map(r => {
        const st = r.completion_status || (r.completed ? 'owner_marked_complete' : 'unknown');
        const badge = st === 'verified' ? ['ok', 'VERIFIED'] : st === 'owner_marked_complete' ? ['warn', 'SELF-REPORTED'] : ['bad', 'NO REMEDY RECORDED'];
        return '<div class="rowitem"><div class="ico" style="background:' + (st === 'verified' ? '#DEF5EA' : st === 'owner_marked_complete' ? '#FDF0D8' : '#FBE1E1') +
          ';color:' + (st === 'verified' ? '#188752' : st === 'owner_marked_complete' ? '#A9700A' : '#C33A3A') + '">' +
          ic(st === 'verified' ? 'check' : 'alert', 20) + '</div>' +
          '<div class="txt"><b class="mono" style="font-size:13px">' + esc(r.campaign) + '</b>' +
          '<span>' + esc(String(r.component || '').split(':')[0]) + '</span>' +
          (r.verification_method ? '<span>Verified by ' + esc(r.verification_method.replace(/_/g, ' ')) + '</span>' : '') + '</div>' +
          '<span class="chip ' + badge[0] + '" style="font-size:9px">' + badge[1] + '</span>' +
          '<button class="btn xs ghost" onclick="showRecall(' + r.id + ')">Read</button>' +
          '<button class="btn xs ghost" onclick="recallStatus(' + r.id + ')">Status</button></div>';
      }).join('') +
      '<p class="note" style="margin:14px 0 0">The free recalls API tells you a campaign <b>applies to this year, make and model</b>. It cannot tell you whether <b>your VIN</b> was remedied — only NHTSA\'s VIN lookup or dealer paperwork can. That is why "self-reported" and "verified" are different states here, and why a buyer should never treat a tick in an app as proof.</p></div>' : '') +

    /* spec */
    '<h3 class="sec-h">Specification <span class="src ' + (v.source === 'vin' ? '' : 'sample') + '">' + (v.source === 'vin' ? 'Live · NHTSA vPIC' : 'Manual') + '</span></h3>' +
    '<div class="card"><div class="grid g2" style="gap:0 30px">' +
    specs.filter(s => s[1]).map(s => '<div class="kv"><span>' + s[0] + '</span><b class="' + (s[0] === 'VIN' ? 'mono' : '') + '">' + esc(s[1]) + '</b></div>').join('') + '</div></div>' +

    /* known issues */
    '<h3 class="sec-h">What owners report <span class="src">Live · NHTSA complaints</span></h3><div class="card">' +
    (d.complaints?.length
      ? d.complaints.map(c => '<div class="rowitem"><div class="ico mono">' + c.count + '</div><div class="txt"><b>' + esc(c.component.split(' — ')[0]) + '</b>' +
        '<span>' + esc(c.component.split(' — ')[1] || 'complaints filed with NHTSA for this year, make and model') + '</span></div></div>').join('')
      : '<p class="note" style="margin:0">No complaint data returned for this vehicle yet. Hit "Refresh NHTSA data" above.</p>') +
    '<p class="note" style="margin:14px 0 0">Complaints are unverified owner reports, clustered here by component and mileage band. Volume tells you where to look, not what is wrong with your specific car.</p></div>';
}

async function runIngest(source) {
  toast('Downloading from NHTSA — a few MB, this can take a minute…');
  try {
    const r = await API.post('/ingest/' + source, {});
    const n = r.rows ?? (r.blocks || []).reduce((s, b) => s + b.rows, 0);
    await loadVehicleExtras(true);

    // say what it actually found for THIS vehicle, not just that it downloaded
    const ctx = VH.attention?.context || {};
    const obj = source === 'investigations' ? ctx.investigations : ctx.communications;
    const mine = source === 'investigations'
      ? (obj?.available ? `${obj.open.length} open and ${obj.closed.length} closed on your ${vLabel(activeVehicle())}` : 'nothing matched this vehicle')
      : (obj?.available ? `${obj.total} bulletins on your ${vLabel(activeVehicle())}` : 'nothing matched this vehicle');

    openModal(modalHead('Pulled ' + num(n) + ' records',
      'Downloaded from NHTSA and parsed into your own database. It answers instantly from here on, with or without a network.') +
      '<div class="card" style="box-shadow:none;border:1.5px solid var(--ok);margin-bottom:16px">' +
      '<b style="font-weight:600">' + esc(mine) + '</b></div>' +
      (source === 'investigations' && obj?.open?.length
        ? '<span class="mlabel">Open right now</span>' + obj.open.map(i =>
          '<div class="bullet"><span class="n mono" style="width:auto;padding:0 5px">' + esc(i.number || '') + '</span>' +
          '<div><b style="font-weight:600">' + esc(i.summary || '') + '</b><div class="note">' + esc(i.component || '') +
          ' · opened ' + esc(i.openDate || '') + '</div></div></div>').join('')
        : '') +
      '<button class="btn block" style="margin-top:18px" onclick="closeModal();document.getElementById(\'sec-investigations\')?.scrollIntoView({behavior:\'smooth\'})">Show me</button>');
  } catch (e) { toast(e.message, 'bad'); }
}

function stars(n) {
  if (n == null) return '—';
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
}

async function toggleDuty() {
  const v = activeVehicle();
  const next = v.duty === 'severe' ? 'normal' : 'severe';
  await API.patch('/vehicles/' + v.id, { duty: next });
  toast(next === 'severe'
    ? 'Severe duty — mileage intervals roughly halved'
    : 'Normal duty — standard intervals restored', 'ok');
  await refreshDetail();
}

async function refreshNhtsa() {
  toast('Pulling recalls and complaints…');
  try {
    const r = await API.post('/vehicles/' + state.activeId + '/refresh');
    await refreshDetail();
    toast(r.recalls + ' recalls, ' + r.complaints + ' complaint clusters (' + r.source + ')', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

function showRecall(id) {
  const r = (D().recalls || []).find(x => x.id === id);
  if (!r) return;
  openModal('<div class="between" style="margin-bottom:6px"><span class="chip bad mono">' + esc(r.campaign) + '</span>' +
    '<button onclick="closeModal()" style="font-size:24px;color:var(--muted)">&times;</button></div>' +
    '<h3 style="font-size:18px;margin-bottom:16px">' + esc(r.component || '') + '</h3>' +
    '<span class="mlabel">The defect</span><p style="margin:0 0 16px;font-size:14px">' + esc(r.summary || '—') + '</p>' +
    '<span class="mlabel">The risk</span><p style="margin:0 0 16px;font-size:14px">' + esc(r.consequence || '—') + '</p>' +
    '<span class="mlabel">The remedy</span><p style="margin:0 0 20px;font-size:14px">' + esc(r.remedy || '—') + '</p>' +
    '<a class="btn block" href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener">Check completion by VIN at NHTSA</a>' +
    '<button class="btn block ghost" style="margin-top:10px" onclick="recallStatus(' + r.id + ')">Record completion status</button>');
}

function recallStatus(id) {
  const r = (D().recalls || []).find(x => x.id === id);
  if (!r) return;
  const st = r.completion_status || 'unknown';
  openModal(modalHead('Completion status — ' + r.campaign,
    'The recalls API says this campaign applies to your year, make and model. It cannot say whether your VIN was remedied. Record what you actually know, and how you know it.') +
    fld('Status', sel('rc-status', [
      ['unknown', 'Unknown — no remedy recorded'],
      ['owner_marked_complete', 'I believe it was done (self-reported)'],
      ['verified', 'Verified — I have proof']], st)) +
    '<div style="height:14px"></div>' +
    fld('If verified, how?', sel('rc-method', [
      ['nhtsa_vin_lookup', 'NHTSA VIN lookup showed no open recall'],
      ['dealer_paperwork', 'Dealer repair order or recall completion letter'],
      ['service_record', 'Service record in this app'],
      ['owner_recollection', 'Owner recollection only']], r.verification_method || 'nhtsa_vin_lookup')) +
    '<div style="height:14px"></div>' +
    fld('Evidence note', inp('rc-note', { value: r.evidence_note || '', ph: 'RO #48213, Champion Chevrolet, 14 Mar 2024' })) +
    '<p class="note" style="margin:14px 0 16px">"Owner recollection" is not verification — if that is all you have, choose self-reported. The distinction is the entire point: a vehicle history report that says "verified" when it means "the seller ticked a box" is worth nothing to a buyer.</p>' +
    '<button class="btn block" onclick="saveRecallStatus(' + id + ')">Save</button>');
}

async function saveRecallStatus(id) {
  const status = val('rc-status');
  try {
    const r = await API.post('/recalls/' + id + '/status', {
      completion_status: status,
      verification_method: val('rc-method'),
      evidence_note: val('rc-note')
    });
    closeModal();
    await refreshDetail();
    toast(r.note, status === 'verified' ? 'ok' : '');
  } catch (e) { toast(e.message, 'bad'); }
}
renderers.vehicle = renderVehicle;

/* ============================================================
   BOOT
   ============================================================ */
async function boot() {
  document.getElementById('auth').classList.add('hide');
  document.getElementById('app').classList.remove('hide');
  applyPrefs();
  await loadAll();
  await loadTools();
  if (state.activeId) await loadDetail();
  const start = location.hash.replace('#', '');
  await go(TITLES[start] ? start : 'garage');
}

(async function start() {
  applyPrefs();
  // nav icons
  document.querySelectorAll('.nav a').forEach(a => {
    a.insertAdjacentHTML('afterbegin', '<span style="display:flex;flex:0 0 auto">' + ic(a.dataset.ic, 19) + '</span>');
    a.addEventListener('click', e => { e.preventDefault(); location.hash = a.dataset.go; go(a.dataset.go); });
  });
  document.getElementById('brandmark').innerHTML = ic('wrench', 20);
  document.getElementById('burgerbtn').innerHTML = ic('menu', 22);
  document.getElementById('navveh').addEventListener('change', e => setActive(+e.target.value));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { menu(false); closeInsp(); closeModal(); } });
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  try {
    const me = await API.get('/auth/me');
    state.user = me.user;
    state.user.garageId = me.garages[0]?.id;
    await boot();
  } catch {
    renderAuth();
  }
})();
