/* ============================================================
   SYSTEMS & FSM-STYLE ILLUSTRATED DIAGRAMS

   Drawing conventions follow factory service manual practice:
     - Figures titled `Fig. N — SYSTEM, SUBJECT` inside a ruled border
     - Numbered callout balloons with leader lines, keyed to a parts list
     - Standard schematic symbols (fuse, relay, ground, splice, connector)
     - Ladder layout for schematics: B+ top, ground bottom
     - Wire legs carry colour abbreviation, gauge and circuit number
     - Torque in lb-ft with N·m, temperature °F with °C, pressure psi with kPa

   Standards: ISO 2575, SAE J2402, J1930, J2012, J1979, J1962,
   ISO 15765-4, DIN 72552.
   ============================================================ */

/* ---- charging/starting components, keyed into the same KB ---- */
Object.assign(KB, {
  c_alternator: {
    s: 'Charging', n: 'Alternator (GEN)',
    fn: 'Three-phase stator and rotating field, rectified to DC by a six-diode bridge, regulated to hold system voltage. On a modern car the ECM commands the regulator over LIN, which is why "14.4 V always" is no longer the right expectation.',
    specs: [['Output', '150 A rated'], ['Regulated voltage', '13.5–14.7 V at 2,000 rpm'], ['Ripple, AC on DC', 'Under 0.5 V AC'], ['Belt', 'Serpentine, automatic tensioner'], ['Terminal B+', 'Charge output to battery'], ['Terminal L (61)', 'Charge indicator lamp']],
    tq: [['Alternator through bolt', '37 lb-ft (50 N·m)'], ['B+ output nut', '80 lb-in (9 N·m)'], ['Tensioner bolt', '37 lb-ft (50 N·m)']],
    test: [['Voltage at the battery, engine running', '13.5–14.7 V at 2,000 rpm with load off.'], ['AC ripple on DC scale', 'Over 0.5 V AC means a failed diode.'], ['Voltage drop, B+ lead to battery positive', 'Under 0.3 V at full output. Higher and the charge current is being wasted as heat in the cable.'], ['Full-field test', 'Only if the regulator is external or commandable — never jumper a modern regulator blind.']],
    fail: ['One failed diode: charges, but ripple cooks the battery and confuses modules', 'Worn brushes giving intermittent output that comes back when you tap the case', 'Corroded B+ terminal — the alternator is fine, the connection is not', 'Seized bearing that everyone hears as a "water pump whine"'],
    q: 'alternator'
  },
  c_starter: {
    s: 'Charging', n: 'Starter & solenoid',
    fn: 'A series-wound DC motor with a solenoid that both throws the pinion into the ring gear and closes the main contacts. Terminal 50 in DIN 72552 is the solenoid control from the ignition switch.',
    specs: [['Draw, cranking', '150–250 A on a healthy V8'], ['Cranking voltage', 'Must stay above 9.6 V'], ['Terminal 30', 'Battery feed, unswitched'], ['Terminal 50', 'Solenoid control from ignition'], ['Ring gear', 'Inspect teeth whenever the starter is out']],
    tq: [['Starter mounting bolts', '37 lb-ft (50 N·m)'], ['Terminal 30 nut', '106 lb-in (12 N·m)'], ['Terminal 50 nut', '18 lb-in (2 N·m)']],
    test: [['Voltage at terminal 50 while cranking', 'Within 1 V of battery. Low means the switch, relay or wiring, not the starter.'], ['Voltage drop, battery positive to starter terminal 30', 'Under 0.5 V while cranking.'], ['Amp clamp on the battery cable', 'Very high draw = dragging motor or seized engine. Very low with a click = solenoid contacts.']],
    fail: ['Burnt solenoid contacts — single click, no crank, works again after a tap', 'Heat soak: cranks cold, refuses when hot, from a failing field winding', 'Bad ground strap between engine and body, which looks exactly like a dead starter'],
    q: 'starter motor solenoid'
  },
  c_ign_switch: {
    s: 'Charging', n: 'Ignition switch (terminals 15 / 50)',
    fn: 'Distributes battery power to the run circuits (terminal 15) and to the starter solenoid (terminal 50). Terminal 15a is run-only and drops out during cranking so the starter gets the current.',
    specs: [['Terminal 30', 'Feed, unswitched'], ['Terminal 15', 'Run and start'], ['Terminal 15a', 'Run only'], ['Terminal 50', 'Crank output'], ['Contact rating', '30 A typical']],
    tq: [['Lock cylinder screws', '26 lb-in (3 N·m)']],
    test: [['Continuity 30 to 15 in RUN', 'Should be near zero ohms.'], ['Voltage at 50 while cranking', 'Battery voltage minus about 0.5 V.'], ['Wiggle test', 'An intermittent no-crank that follows the key is the switch, not the starter.']],
    fail: ['Worn contacts causing an intermittent no-crank or a stall over bumps', 'Melted housing from a high-current accessory wired into the switch'],
    q: 'ignition switch'
  },
  c_fusible: {
    s: 'Charging', n: 'Fusible link / mega fuse',
    fn: 'The main protection between the battery and the whole distribution system. Sized well above normal load — if it opens, something serious happened.',
    specs: [['Rating', '175 A typical main'], ['Type', 'Bolt-down mega fuse'], ['Location', 'Battery positive junction block']],
    tq: [['Mega fuse nuts', '89 lb-in (10 N·m)']],
    test: [['Voltage both sides', 'Equal to battery on both studs. A difference means it is open.'], ['Thermal check', 'A hot link under normal load means a loose stud, not an overload.']],
    fail: ['Opens after a reverse jump-start', 'Corroded studs producing voltage drop that mimics a weak battery'],
    q: 'mega fuse fusible link'
  }
});

const SYSTEMS = [
  { id: 'brakes', ic: 'brake', n: 'Brakes & ABS' },
  { id: 'cooling', ic: 'temp', n: 'Cooling' },
  { id: 'fuel', ic: 'fuel', n: 'Fuel & EVAP' },
  { id: 'wiring', ic: 'schematic', n: 'Wiring' },
  { id: 'charging', ic: 'battery', n: 'Charging & start' },
  { id: 'engine', ic: 'mil', n: 'Engine mech' },
  { id: 'trans', ic: 'gear', n: 'Transmission' },
  { id: 'hvac', ic: 'ac', n: 'HVAC / A/C' }
];

const DIAGRAMS = {
  brakes: {
    title: 'Fig. 1 — Braking system, hydraulic layout',
    layers: [['comp', 'Components', '#6C5CE7'], ['fluid', 'Hydraulic lines', '#D89B00'], ['elec', 'WSS circuits', '#8B8AA5'], ['spec', 'Spec callout', null]],
    key: C => [[1, 'master_cylinder'], [2, 'booster'], [3, 'prop_valve'], [4, 'abs_module'], [5, 'caliper'],
    [6, C.rear_brakes === 'drum' ? 'drum' : 'caliper']],
    chips: ['Torque specs', 'Test points', 'Bleed sequence', 'Pad & rotor limits', 'Line routing'],
    foot: 'Illustration follows factory service manual convention: numbered callout balloons keyed to the parts list below. Tap a balloon or a list entry.'
  },
  cooling: {
    title: 'Fig. 2 — Engine cooling system, flow circuit',
    layers: [['comp', 'Components', '#6C5CE7'], ['hot', 'Hot side', '#E85D5D'], ['cold', 'Cold side', '#4A90D9'], ['spec', 'Spec callout', null]],
    key: [[1, 'radiator'], [2, 'fan'], [3, 'thermostat'], [4, 'water_pump'], [5, 'heater_core']],
    chips: ['Torque specs', 'Test points', 'Fill & bleed', 'Capacities', 'Thermostat spec'],
    foot: 'Flow arrows follow the standard convention: red for coolant leaving the engine, blue for coolant returning after the radiator.'
  },
  fuel: {
    title: 'Fig. 3 — Fuel delivery and evaporative emission control',
    layers: [['comp', 'Components', '#6C5CE7'], ['fluid', 'Liquid fuel', '#D89B00'], ['vapor', 'Vapour', '#2BB673'], ['spec', 'Spec callout', null]],
    key: [[1, 'fuel_tank'], [2, 'fuel_pump'], [3, 'fuel_filter'], [4, 'injector'], [5, 'evap']],
    chips: ['Torque specs', 'Test points', 'Pressure spec', 'Injector data', 'EVAP monitor'],
    foot: 'Component abbreviations follow SAE J1930. Vapour lines are shown dashed per standard service-manual practice.',
    safety: 'fuel'
  },
  wiring: {
    title: 'Fig. 4 — Fuel pump circuit, power and ground distribution',
    layers: [['comp', 'Components', '#6C5CE7'], ['pwr', 'B+ / switched', '#E85D5D'], ['gnd', 'Ground', '#2B2D42'], ['ctrl', 'Control', '#4A90D9'], ['spec', 'Spec callout', null]],
    key: [[1, 'w_battery'], [2, 'w_fuse'], [3, 'w_relay'], [4, 'w_ecm'], [5, 'w_connector'], [6, 'fuel_pump'], [7, 'w_ground']],
    chips: ['Wire colour codes', 'DIN terminal codes', 'Voltage drop test', 'Torque specs', 'Test points'],
    foot: 'Ladder schematic drawn to normal aftermarket convention: B+ at the top, ground at the bottom, DIN 72552 terminal numbers on the relay, and circuit numbers with wire colour and gauge on every leg.'
  },
  charging: {
    title: 'Fig. 5 — Charging and starting circuit',
    layers: [['comp', 'Components', '#6C5CE7'], ['pwr', 'B+ / charge path', '#E85D5D'], ['gnd', 'Ground', '#2B2D42'], ['ctrl', 'Control', '#4A90D9'], ['spec', 'Spec callout', null]],
    key: [[1, 'w_battery'], [2, 'c_fusible'], [3, 'c_alternator'], [4, 'c_ign_switch'], [5, 'c_starter'], [6, 'w_ground']],
    chips: ['Charging spec', 'Voltage drop test', 'DIN terminal codes', 'Torque specs', 'Test points'],
    foot: 'Heavy conductors drawn thick, control circuits thin — the same weighting a factory schematic uses so you can see the current path at a glance. Terminal numbers per DIN 72552: 30 unswitched B+, 15 ignition switched, 50 crank, 61 charge indicator, 31 ground.'
  }
};

const LAYER_STATE = {};
let SYS_STATE = { system: 'brakes', comp: null, tab: 0, zoom: 1 };

/* ============================================================
   CONFIGURATION

   A diagram is only useful if it matches the vehicle in front of
   you. The VIN gets us most of the way — displacement, cylinder
   count, drivetrain — but vPIC does not report rear disc vs drum,
   aspiration, or injection type, and those change the figure.

   So: infer everything we can from the decode, let the owner
   confirm the rest once, and then draw to that configuration.
   The figures below are representative of YOUR configuration.
   They are still not a VIN-exact factory illustration — that is
   licensed data, and the app says so rather than implying more
   precision than it has.
   ============================================================ */
let VCONF = { loaded: false, confirmed: null, inferred: null };

async function loadVehicleConfig(force) {
  const v = activeVehicle();
  if (!v) { VCONF = { loaded: true, confirmed: null, inferred: null }; return; }
  if (VCONF.loaded && VCONF.vehicleId === v.id && !force) return;
  try {
    const r = await API.get('/vehicles/' + v.id + '/config');
    VCONF = { loaded: true, vehicleId: v.id, confirmed: r.config, inferred: r.inferred };
  } catch { VCONF = { loaded: true, vehicleId: v.id, confirmed: null, inferred: null }; }
}

/** Merged view: owner-confirmed wins, VIN inference fills gaps, then sane defaults. */
function vconf() {
  const v = activeVehicle();
  const c = VCONF.confirmed || {}, i = VCONF.inferred || {};
  const pick = (k, d) => (c[k] != null && c[k] !== '' ? c[k] : (i[k] != null && i[k] !== '' ? i[k] : d));
  const isEV = !!v?.is_ev;
  const cyl = Number(pick('cylinders', isEV ? 0 : 4)) || (isEV ? 0 : 4);
  return {
    isEV,
    cylinders: Math.max(0, Math.min(12, cyl)),
    layout: pick('layout', isEV ? 'Electric' : (cyl >= 6 ? 'V' : 'I')),
    aspiration: pick('aspiration', 'na'),
    injection: pick('injection', 'port'),
    rear_brakes: pick('rear_brakes', 'disc'),
    front_brakes: pick('front_brakes', 'disc'),
    drive: pick('drive', 'RWD'),
    trans_type: pick('trans_type', isEV ? 'ev-single' : 'auto'),
    fan: pick('fan', 'electric'),
    fuel_delivery: pick('fuel_delivery', 'returnless'),
    confirmed: !!VCONF.confirmed?.confirmed_at,
    confirmedFields: Object.keys(c).filter(k => c[k] != null && c[k] !== '' && !['vehicle_id', 'updated_at', 'confirmed_at'].includes(k))
  };
}

function renderSystems() {
  const v = activeVehicle();
  if (!VCONF.loaded || VCONF.vehicleId !== v?.id) {
    loadVehicleConfig().then(() => { if (state.screen === 'systems') renderSystems(); });
  }
  const C = vconf();
  const sv = document.getElementById('sysvehicle');
  sv.innerHTML = v
    ? '<div class="between wrap" style="gap:10px">' +
    '<div>Diagrams drawn for <b style="color:var(--ink)">' + esc(vLabel(v)) + '</b> — ' +
    esc([
      C.isEV ? 'electric drive' : (C.cylinders ? C.layout + C.cylinders : null),
      C.aspiration !== 'na' ? C.aspiration : null,
      C.drive,
      C.front_brakes === 'disc' && C.rear_brakes === 'drum' ? 'front disc / rear drum' : C.rear_brakes === 'disc' ? 'four-wheel disc' : null
    ].filter(Boolean).join(' · ')) +
    '<div class="note" style="margin-top:3px">' +
    (C.confirmed
      ? 'Configuration confirmed by you. ' + C.confirmedFields.length + ' fields set.'
      : 'Configuration inferred from the VIN decode. Confirm it and the figures redraw to match — rear drum vs disc and cylinder count both change what you see.') +
    '</div></div>' +
    '<button class="btn sm ghost" onclick="editConfig()">' + (C.confirmed ? 'Edit configuration' : 'Confirm configuration') + '</button></div>'
    : 'Showing generic reference diagrams. Add a vehicle and the figures redraw to its configuration.';
  document.getElementById('sysgrid').innerHTML = SYSTEMS.map(s =>
    '<div class="sys ' + (s.id === SYS_STATE.system ? 'on' : '') + '" onclick="pickSystem(\'' + s.id + '\')">' +
    ic(s.ic, 26) + '<b>' + s.n + '</b><span>' + (DIAGRAMS[s.id] ? 'drawn · clickable' : 'from data feed') + '</span></div>').join('');
  drawSystem();
}
function pickSystem(id) { SYS_STATE.system = id; SYS_STATE.zoom = 1; renderSystems(); }

function drawSystem() {
  const bar = document.getElementById('layerbar'), cv = document.getElementById('canvas');
  const kl = document.getElementById('keylist'), rc = document.getElementById('refchips'), ft = document.getElementById('dgfoot');
  const d = DIAGRAMS[SYS_STATE.system], sys = SYSTEMS.find(s => s.id === SYS_STATE.system);
  document.getElementById('dgtitle').textContent = d ? d.title : sys.n;

  if (!d) {
    bar.innerHTML = '<span class="mlabel" style="margin:0">Not drawn yet</span>';
    cv.innerHTML = '<div style="padding:26px"><p class="note" style="margin:0 0 18px">This system\'s illustration comes from a licensed feed in production. The five below are fully drawn so you can see how the interaction works — layers, callouts, torque and test data all behave identically for every system.</p>' +
      '<div class="grid g2" style="gap:12px">' + SYSTEMS.filter(s => DIAGRAMS[s.id]).map(s =>
        '<button class="card row" style="text-align:left;gap:14px" onclick="pickSystem(\'' + s.id + '\')">' +
        '<span style="color:var(--primary)">' + ic(s.ic, 26) + '</span><span><b style="font-weight:600">' + s.n + '</b>' +
        '<p class="note" style="margin:2px 0 0">Drawn and clickable</p></span></button>').join('') + '</div></div>';
    kl.innerHTML = ''; rc.innerHTML = ''; ft.textContent = '';
    return;
  }

  if (!LAYER_STATE[SYS_STATE.system]) {
    LAYER_STATE[SYS_STATE.system] = {};
    d.layers.forEach(l => { LAYER_STATE[SYS_STATE.system][l[0]] = l[0] !== 'spec'; });
  }
  const ls = LAYER_STATE[SYS_STATE.system];
  bar.innerHTML = '<span class="mlabel" style="margin:0 8px 0 0">Layers</span>' +
    d.layers.map(l => '<button class="layer ' + (ls[l[0]] ? 'on' : '') + '" onclick="toggleLayer(\'' + l[0] + '\')">' +
      (l[2] ? '<span class="sw" style="background:' + l[2] + '"></span>' : '') + l[1] + '</button>').join('') +
    '<span style="flex:1"></span>' +
    (SYS_STATE.system === 'brakes' ? '<button class="layer" onclick="explode()">Exploded view</button>' : '');

  const C = vconf();
  cv.innerHTML = '<div class="zoomctl"><button onclick="zoomD(1.25)">+</button><button onclick="zoomD(.8)">&minus;</button><button onclick="zoomD(0)" style="font-size:12px">&#10226;</button></div>' + SVGS[SYS_STATE.system](C);

  const key = typeof d.key === 'function' ? d.key(C) : d.key;
  kl.innerHTML = key.map(k =>
    '<button class="keyrow" data-k="' + k[1] + '" onclick="inspect(\'' + k[1] + '\')"><span class="n">' + k[0] + '</span><span>' + KB[k[1]].n + '</span></button>').join('');
  applyLayers(); bindHotspots(); applyZoom();
  rc.innerHTML = d.chips.map(c => '<button class="chip" onclick="refPanel(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</button>').join('');
  ft.innerHTML = esc(d.foot) +
    '<br><b>Drawn for this vehicle:</b> ' + esc(configNoteFor(SYS_STATE.system, C)) +
    ' <span class="src ' + (C.confirmed ? '' : 'sample') + '">' + (C.confirmed ? 'Owner-confirmed configuration' : 'Inferred from VIN') + '</span>' +
    '<br>Representative of your configuration, not a VIN-exact factory illustration — that is licensed data. For the exact figure, ChiltonLibrary and EBSCO Auto Repair Source are free with a library card, and your make\'s service portal sells day passes.';
}

function configNoteFor(system, C) {
  if (system === 'fuel') return C.isEV ? 'no fuel system on an EV' :
    `${C.cylinders} injectors on the rail, ${C.injection === 'direct' ? 'direct injection' : C.injection === 'diesel-cr' ? 'common-rail diesel' : 'port injection'}, ${C.fuel_delivery} delivery`;
  if (system === 'brakes') return `${C.front_brakes} front, ${C.rear_brakes} rear`;
  if (system === 'cooling') return C.isEV ? 'battery and power-electronics loop' :
    `${C.layout}${C.cylinders} block, ${C.fan} fan`;
  if (system === 'charging') return `${C.isEV ? '12 V auxiliary system shown; HV side is not drawn' : 'belt-driven alternator, series-wound starter'}`;
  if (system === 'wiring') return 'fuel pump circuit — terminal numbers are universal, the circuit numbers are representative';
  return '';
}
function toggleLayer(k) { LAYER_STATE[SYS_STATE.system][k] = !LAYER_STATE[SYS_STATE.system][k]; drawSystem(); }
function applyLayers() {
  const ls = LAYER_STATE[SYS_STATE.system];
  Object.keys(ls).forEach(k => {
    document.querySelectorAll('#canvas .L-' + k).forEach(g => { g.style.display = ls[k] ? '' : 'none'; });
  });
}
function bindHotspots() {
  document.querySelectorAll('#canvas .hot').forEach(g => {
    g.addEventListener('click', () => inspect(g.getAttribute('data-c')));
  });
}
function zoomD(f) { SYS_STATE.zoom = f === 0 ? 1 : Math.min(3, Math.max(.6, SYS_STATE.zoom * f)); applyZoom(); }
function applyZoom() {
  const s = document.querySelector('#canvas svg');
  if (!s) return;
  s.style.transformOrigin = 'center center';
  s.style.transition = 'transform .2s ease';
  s.style.transform = 'scale(' + SYS_STATE.zoom + ')';
}

/* ---------- configuration editor ---------- */
function editConfig() {
  const v = activeVehicle();
  if (!v) return toast('Add a vehicle first', 'bad');
  const c = VCONF.confirmed || {}, i = VCONF.inferred || {};
  const cur = k => (c[k] != null && c[k] !== '' ? c[k] : (i[k] ?? ''));
  const hint = k => (c[k] == null || c[k] === '') && i[k] ? ' <span class="chip grey" style="font-size:9px">from VIN</span>' : '';

  openModal(modalHead('Configuration for ' + vLabel(v),
    'The VIN gives us displacement, cylinders and drivetrain. It does not report rear disc vs drum, aspiration or injection type — and those change what the diagrams should show. Confirm once and the figures redraw.') +
    '<div class="grid g3" style="gap:14px">' +
    fld('Cylinders' + hint('cylinders'), sel('cf-cyl', [['', '—'], 3, 4, 5, 6, 8, 10, 12], cur('cylinders'))) +
    fld('Layout' + hint('layout'), sel('cf-layout', [['', '—'], ['I', 'Inline'], ['V', 'V'], ['Flat', 'Flat / boxer'], ['Rotary', 'Rotary'], ['Electric', 'Electric']], cur('layout'))) +
    fld('Aspiration', sel('cf-asp', [['na', 'Naturally aspirated'], ['turbo', 'Turbocharged'], ['twin-turbo', 'Twin-turbo'], ['supercharged', 'Supercharged']], cur('aspiration') || 'na')) +
    '</div><div style="height:14px"></div>' +
    '<div class="grid g3" style="gap:14px">' +
    fld('Injection', sel('cf-inj', [['port', 'Port injection'], ['direct', 'Direct injection'], ['both', 'Port + direct'], ['diesel-cr', 'Diesel common rail'], ['carb', 'Carburettor']], cur('injection') || 'port')) +
    fld('Front brakes', sel('cf-fb', [['disc', 'Disc'], ['drum', 'Drum']], cur('front_brakes') || 'disc')) +
    fld('Rear brakes', sel('cf-rb', [['disc', 'Disc'], ['drum', 'Drum']], cur('rear_brakes') || 'disc')) +
    '</div><div style="height:14px"></div>' +
    '<div class="grid g3" style="gap:14px">' +
    fld('Drivetrain' + hint('drive'), sel('cf-drive', [['', '—'], 'FWD', 'RWD', 'AWD', '4WD'], cur('drive'))) +
    fld('Transmission' + hint('trans_type'), sel('cf-trans', [['', '—'], ['auto', 'Automatic'], ['manual', 'Manual'], ['cvt', 'CVT'], ['dct', 'Dual clutch'], ['ev-single', 'EV single speed']], cur('trans_type'))) +
    fld('Cooling fan', sel('cf-fan', [['electric', 'Electric'], ['clutch', 'Mechanical / clutch']], cur('fan') || 'electric')) +
    '</div><div style="height:14px"></div>' +
    '<div class="grid g2" style="gap:14px">' +
    fld('Fuel delivery', sel('cf-fd', [['returnless', 'Returnless'], ['return', 'Return style'], ['diesel', 'Diesel']], cur('fuel_delivery') || 'returnless')) +
    fld('Battery location', sel('cf-batt', [['engine bay', 'Engine bay'], ['trunk', 'Trunk / cargo'], ['under seat', 'Under a seat']], cur('battery_location') || 'engine bay')) +
    '</div><div style="height:14px"></div>' +
    fld('Notes', inp('cf-notes', { value: c.notes || '', ph: 'Anything the figures should reflect' })) +
    '<p class="note" style="margin:14px 0 16px">Not sure about rear brakes? Look through the wheel: a shiny machined disc with a caliper over it is disc; a plain cast drum with no caliper is drum. It is visible from outside on almost every vehicle.</p>' +
    '<button class="btn block" onclick="saveConfig()">Save and redraw</button>', true);
}

async function saveConfig() {
  const v = activeVehicle();
  await API.req('PUT', '/vehicles/' + v.id + '/config', {
    cylinders: intVal('cf-cyl'), layout: val('cf-layout'), aspiration: val('cf-asp'),
    injection: val('cf-inj'), front_brakes: val('cf-fb'), rear_brakes: val('cf-rb'),
    drive: val('cf-drive'), trans_type: val('cf-trans'), fan: val('cf-fan'),
    fuel_delivery: val('cf-fd'), battery_location: val('cf-batt'), notes: val('cf-notes')
  });
  closeModal();
  await loadVehicleConfig(true);
  renderSystems();
  toast('Configuration saved — figures redrawn', 'ok');
}

/* ---------- reference panels ---------- */
function kbFor() {
  const map = { brakes: 'Brakes', cooling: 'Cooling', fuel: 'Fuel', wiring: 'Wiring', charging: 'Charging' };
  return Object.values(KB).filter(c => c.s === map[SYS_STATE.system]);
}
const REF = {
  'Torque specs': () => { const b = []; kbFor().forEach(c => c.tq.forEach(t => b.push([c.n + ' — ' + t[0], t[1]]))); return { t: 'Torque specs', b }; },
  'Test points': () => { const b = []; kbFor().forEach(c => c.test.forEach(t => b.push([c.n + ' — ' + t[0], t[1]]))); return { t: 'Test points', b }; },
  'Bleed sequence': () => ({ t: 'Bleed sequence', b: [['1. Right rear', 'Furthest from the master cylinder'], ['2. Left rear', ''], ['3. Right front', ''], ['4. Left front', 'Closest, done last'], ['Fluid', 'DOT 3 — never reuse what you bled out'], ['Watch', 'Keep the reservoir above MIN the whole time or you start again']] }),
  'Pad & rotor limits': () => ({ t: 'Pad & rotor limits', b: [['Pad minimum', '3 mm friction material'], ['New rotor thickness', '1.06 in (26.9 mm)'], ['Discard thickness', '0.98 in (24.9 mm)'], ['Max lateral runout', '0.002 in (0.05 mm)'], ['Max thickness variation', '0.001 in (0.025 mm)'], ['Drum max diameter', '10.06 in']] }),
  'Line routing': () => ({ t: 'Line routing', b: [['Front circuit', 'Master cylinder primary port to the combination valve, then splits left and right'], ['Rear circuit', 'Secondary port through the proportioning valve to the rear axle tee'], ['Flex line length', 'Check at full droop and full lock before cutting anything'], ['Clip spacing', 'Every 12 in on hard line to stop fatigue cracking'], ['Line material', '3/16 in double-flare, ISO or SAE flare to match the master']] }),
  'Fill & bleed': () => ({ t: 'Fill & bleed', b: [['1', 'Fill cold at the radiator with the heater set to full hot'], ['2', 'Open the bleeder on the thermostat housing until coolant runs clear of air'], ['3', 'Run to operating temperature with the front raised and the cap off'], ['4', 'Top up, cap, then recheck cold the next morning'], ['Warning', 'Never open a hot system — it will scald you']] }),
  'Capacities': () => ({ t: 'Capacities', b: [['Cooling system', '~14.0 qt (13.2 L)'], ['Coolant type', 'OAT, orange, 50/50 with distilled water'], ['Radiator cap', '15 psi (103 kPa)'], ['Engine oil', '8.0 qt (7.6 L) with filter'], ['Note', 'Sample values. Production returns exact per-VIN capacities from the licensed feed.']] }),
  'Thermostat spec': () => ({ t: 'Thermostat spec', b: [['Opens at', '187 °F (86 °C)'], ['Fully open', '207 °F (97 °C)'], ['Normal running', '195–220 °F'], ['Fan engages', '~210 °F'], ['P0128 sets', 'Below 160 °F after the warm-up timer']] }),
  'Pressure spec': () => ({ t: 'Fuel pressure spec', b: [['Key on, engine off', '55–62 psi (379–427 kPa)'], ['Idle', '55–62 psi, steady'], ['Leak-down', 'No more than 5 psi over 5 min'], ['Under load', 'Must not fall below 50 psi'], ['Regulated by', 'In-tank regulator, returnless system']] }),
  'Injector data': () => ({ t: 'Injector data', b: [['Flow rate', '~30 lb/hr'], ['Coil resistance', '11.4–12.6 Ω'], ['Idle pulse width', '2.0–3.5 ms'], ['Balance tolerance', '±10% cylinder to cylinder'], ['Rail bolt torque', '89 lb-in (10 N·m)']] }),
  'EVAP monitor': () => ({ t: 'EVAP monitor conditions', b: [['Fuel level', '15% to 85%'], ['ECT at start', 'Within 10 °F of IAT'], ['Ambient', '40 °F to 100 °F'], ['Drive', 'Steady cruise, minimal throttle changes'], ['Note', 'Permanent codes will not clear until this monitor runs and passes']] }),
  'Wire colour codes': () => ({ t: 'Wire colour abbreviations', b: [['BLK', 'Black — ground, terminal 31'], ['RED', 'Red — unswitched B+, terminal 30'], ['PNK', 'Pink — ignition switched, terminal 15'], ['DK GRN', 'Dark green'], ['LT BLU', 'Light blue'], ['ORN', 'Orange'], ['YEL', 'Yellow'], ['BRN', 'Brown'], ['VIO', 'Violet'], ['GRY', 'Grey'], ['TAN', 'Tan'], ['WHT', 'White'], ['Tracer', 'A slash means base/tracer, e.g. RED/BLK is red with a black stripe'], ['Gauge', 'Shown after the colour, e.g. 12 GA. Smaller number = thicker wire.']] }),
  'DIN terminal codes': () => ({ t: 'DIN 72552 terminal designations', b: [['30', 'Battery positive, unswitched'], ['31', 'Ground / return'], ['15', 'Ignition switched, run and start'], ['15a', 'Switched, run only'], ['50', 'Starter solenoid control'], ['85', 'Relay coil, ground side'], ['86', 'Relay coil, feed side'], ['87', 'Relay contact, normally open'], ['87a', 'Relay contact, normally closed'], ['1', 'Ignition coil, primary negative'], ['4', 'Ignition coil, high tension'], ['61', 'Alternator charge indicator'], ['Why it matters', 'These numbers are moulded into the relay housing itself, so a diagram using them works on any brand.']] }),
  'Voltage drop test': () => ({ t: 'Voltage drop test', b: [['Why', 'Resistance readings lie on high-current circuits. Voltage drop tests the circuit under actual load.'], ['Setup', 'Meter on DC volts, circuit energised and loaded.'], ['Positive side', 'Probe battery positive to the component feed terminal. Max 0.2 V.'], ['Ground side', 'Probe component ground terminal to battery negative. Max 0.1 V.'], ['Each connection', 'Max 0.1 V across any single connector or splice.'], ['Starter circuit', 'Max 0.5 V total on the feed while cranking, 0.2 V on the ground.'], ['Reading high', 'The drop is happening between your two probes. Move one probe closer until it disappears.']] }),
  'Charging spec': () => ({ t: 'Charging system specification', b: [['Battery rested, key off', '12.6 V = 100%, 12.45 V = 75%, 12.24 V = 50%'], ['Charging voltage', '13.5–14.7 V at 2,000 rpm'], ['AC ripple', 'Under 0.5 V AC — more means a failed diode'], ['Output test', 'At least 90% of rated amps with headlights and blower on'], ['Parasitic draw', 'Under 50 mA after all modules sleep, typically 20–45 min'], ['Cranking voltage', 'Must not drop below 9.6 V at 70 °F'], ['Smart charging note', 'Many 2010+ vehicles vary voltage on purpose. 13.1 V at cruise can be normal — check the commanded value with a scan tool before condemning the alternator.']] })
};
function refPanel(name) {
  const fn = REF[name] || (() => ({ t: name, b: [['Not loaded', 'This reference set comes from the licensed data feed in production.']] }));
  const r = fn();
  openModal('<div class="between" style="margin-bottom:4px"><span class="mlabel" style="margin:0">' + ((DIAGRAMS[SYS_STATE.system] || {}).title || '') + '</span>' +
    '<button onclick="closeModal()" style="font-size:24px;color:var(--muted)">&times;</button></div>' +
    '<h3 style="font-size:19px;margin-bottom:14px">' + esc(r.t) + '</h3>' +
    r.b.map(x => '<div class="kv"><span style="flex:1;text-align:left">' + esc(x[0]) + '</span><b class="' +
      (/^[0-9]{1,3}[a-z]?$/.test(x[0]) || /^[A-Z ]{2,7}$/.test(x[0]) ? 'mono' : '') + '" style="max-width:56%">' + esc(x[1]) + '</b></div>').join('') +
    '<p class="note" style="margin-top:18px">Sample values for a representative vehicle. Production values are VIN-specific and come from a licensed repair-data provider.</p>');
}

/* ---------- symbol legend ---------- */
function symbolLegend() {
  const syms = [
    ['<circle cx="18" cy="14" r="9" fill="#fff" stroke="#2B2D42" stroke-width="1.6"/><text x="18" y="18" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter">3</text>', 'Callout balloon', 'Keyed to the parts list under the figure'],
    ['<path d="M4 14h10M22 14h10" stroke="#2B2D42" stroke-width="1.6"/><rect x="14" y="9" width="8" height="10" rx="1" fill="#fff" stroke="#2B2D42" stroke-width="1.6"/><path d="M15.5 18l5-8" stroke="#2B2D42" stroke-width="1.4"/>', 'Fuse', 'Rating in amps written alongside'],
    ['<rect x="6" y="5" width="24" height="18" rx="2" fill="none" stroke="#2B2D42" stroke-width="1.4" stroke-dasharray="3 2.5"/><rect x="9" y="9" width="7" height="10" rx="1" fill="#fff" stroke="#2B2D42" stroke-width="1.5"/><path d="M20 19v-6l7-3" stroke="#2B2D42" stroke-width="1.5" fill="none"/><circle cx="20" cy="19" r="1.4" fill="#2B2D42"/><circle cx="27" cy="10" r="1.4" fill="#2B2D42"/>', 'Relay', 'Coil left, contacts right. Terminals per DIN 72552'],
    ['<path d="M18 4v11" stroke="#2B2D42" stroke-width="1.6"/><path d="M11 15h14M13.5 18.5h9M16 22h4" stroke="#2B2D42" stroke-width="1.6"/>', 'Chassis ground', 'G-number identifies the physical stud'],
    ['<path d="M5 14h26" stroke="#2B2D42" stroke-width="1.6"/><circle cx="18" cy="14" r="2.6" fill="#2B2D42"/>', 'Splice', 'S-number. Two or more circuits joined in the harness'],
    ['<path d="M4 14h9M23 14h9" stroke="#2B2D42" stroke-width="1.6"/><path d="M13 8v12M23 8v12" stroke="#2B2D42" stroke-width="1.6"/>', 'Connector', 'C-number. A serviceable break in the harness'],
    ['<circle cx="18" cy="14" r="8" fill="#fff" stroke="#2B2D42" stroke-width="1.6"/><text x="18" y="18" text-anchor="middle" font-size="10" font-weight="700" font-family="Inter">M</text>', 'Motor', 'Fuel pump, blower, wiper — any motor load'],
    ['<circle cx="18" cy="14" r="8" fill="#fff" stroke="#2B2D42" stroke-width="1.6"/><text x="18" y="18" text-anchor="middle" font-size="9" font-weight="700" font-family="Inter">G</text>', 'Generator', 'Alternator. B+ output, L terminal to the charge lamp'],
    ['<path d="M5 14h8M23 14h8" stroke="#D89B00" stroke-width="3.5" stroke-linecap="round"/><path d="M13 14h10" stroke="#D89B00" stroke-width="3.5" stroke-dasharray="4 3"/>', 'Fluid line', 'Solid = pressure, dashed = return or vapour'],
    ['<path d="M6 14h18" stroke="#E85D5D" stroke-width="3.5" stroke-linecap="round"/><path d="M24 14l-5-3.5v7z" fill="#E85D5D"/>', 'Flow arrow', 'Direction of coolant, fuel or air']
  ];
  openModal('<div class="between" style="margin-bottom:4px"><span class="mlabel" style="margin:0">Reference</span>' +
    '<button onclick="closeModal()" style="font-size:24px;color:var(--muted)">&times;</button></div>' +
    '<h3 style="font-size:19px;margin-bottom:6px">Symbol legend</h3>' +
    '<p class="note" style="margin:0 0 16px">These follow the drawing conventions used across factory service manuals and aftermarket repair data.</p>' +
    syms.map(s => '<div class="symrow"><svg width="36" height="28" viewBox="0 0 36 28">' + s[0] + '</svg>' +
      '<div><b style="font-weight:600;font-size:14px">' + s[1] + '</b><div class="note">' + s[2] + '</div></div></div>').join('') +
    '<div style="margin-top:20px"><span class="mlabel">Standards referenced</span>' +
    [['ISO 2575', 'Symbols for controls, indicators and tell-tales'],
    ['SAE J2402', 'US adoption of the ISO 2575 tell-tale set'],
    ['SAE J1930', 'Standard component names, acronyms and abbreviations'],
    ['SAE J2012', 'Diagnostic trouble code definitions and format'],
    ['SAE J1979', 'OBD-II diagnostic test modes and PIDs'],
    ['SAE J1962', '16-pin diagnostic link connector'],
    ['DIN 72552', 'Terminal designations in motor vehicles'],
    ['ISO 15765-4', 'Diagnostics over CAN']]
      .map(x => '<div class="kv"><span class="mono" style="flex:0 0 auto;color:var(--primary);font-weight:600">' + x[0] + '</span><b style="font-weight:500;max-width:70%">' + x[1] + '</b></div>').join('') + '</div>');
}

/* ---------- component inspector ---------- */
const TABS = ['Overview', 'Specs', 'Torque', 'Testing', 'Failures', 'Tools', 'Parts'];
const KB_SYSTEM = {
  Brakes: 'brakes', Cooling: 'cooling', Fuel: 'fuel', Wiring: 'charging',
  Charging: 'charging', Diagnosis: 'diagnostics'
};
function inspect(id) {
  const c = KB[id];
  if (!c) return;
  SYS_STATE.comp = id; SYS_STATE.tab = 0;
  document.getElementById('i-sys').textContent = c.s;
  document.getElementById('i-name').textContent = c.n;
  document.getElementById('i-tabs').innerHTML = TABS.map((t, i) => '<button class="tab ' + (i === 0 ? 'on' : '') + '" onclick="setTab(' + i + ')">' + t + '</button>').join('');
  document.body.classList.add('insp');
  setTab(0);
  document.querySelectorAll('#canvas .hot').forEach(g => g.classList.toggle('sel', g.getAttribute('data-c') === id));
  document.querySelectorAll('.keyrow').forEach(g => g.classList.toggle('sel', g.getAttribute('data-k') === id));
}
function setTab(i) {
  SYS_STATE.tab = i;
  document.querySelectorAll('#i-tabs .tab').forEach((t, j) => t.classList.toggle('on', i === j));
  const c = KB[SYS_STATE.comp];
  const kv = a => a.map(x => '<div class="kv"><span style="flex:1;text-align:left">' + esc(x[0]) + '</span><b class="mono" style="max-width:56%">' + esc(x[1]) + '</b></div>').join('');
  const out = [
    '<p style="font-size:14.5px;margin:0 0 16px">' + esc(c.fn) + '</p>' + (c.safety ? safetyBox(c.safety) : '') +
    '<span class="mlabel">At a glance</span>' + kv(c.specs.slice(0, 3)) +
    '<div style="margin-top:20px"><button class="btn sm block" onclick="setTab(3)">Jump to testing</button></div>',
    '<span class="mlabel">Specification</span>' + kv(c.specs) + '<p class="note" style="margin-top:16px">Sample values. Production returns VIN-specific figures from the licensed feed.</p>',
    '<span class="mlabel">Torque values</span>' + kv(c.tq) + '<p class="note" style="margin-top:16px">Torque in the specified sequence and use new fasteners wherever the maker calls for them. Values are lb-ft with N·m in parentheses.</p>',
    '<span class="mlabel">How to test it</span>' + (c.safety ? safetyBox(c.safety) : '') + c.test.map(t => '<div class="bullet"><span class="n">' + ic('check', 12) + '</span><div><b style="font-weight:600">' + esc(t[0]) + '</b>' +
      '<div class="note" style="margin-top:2px">' + esc(t[1]) + '</div></div></div>').join(''),
    '<span class="mlabel">What usually goes wrong</span>' + c.fail.map((f, n) => '<div class="bullet"><span class="n">' + (n + 1) + '</span><div>' + esc(f) + '</div></div>').join('') +
    '<p class="note" style="margin-top:16px">Ranked by how often it turns out to be the cause, not by severity.</p>',
    toolsPanel(c.n, KB_SYSTEM[c.s] || 'diagnostics', { flat: true }),
    '<span class="mlabel">Find this part</span><p class="note" style="margin:0 0 16px">Searches prefilled with ' +
    (activeVehicle() ? 'your ' + esc(vLabel(activeVehicle())) : 'your vehicle') + ' and this component.</p>' + partLinks(c.q)
  ][i];
  document.getElementById('i-body').innerHTML = out;
}

/* ---------- exploded view ---------- */
function explode() {
  openModal('<div class="between" style="margin-bottom:6px"><span class="mlabel" style="margin:0">Exploded assembly</span>' +
    '<button onclick="closeModal()" style="font-size:24px;color:var(--muted)">&times;</button></div>' +
    '<h3 style="font-size:19px;margin-bottom:14px">Front brake corner</h3>' + EXPLODED() +
    '<div style="margin:16px 0 6px"><span class="mlabel">Separation</span>' +
    '<input class="slider" type="range" min="0" max="100" value="35" oninput="setExplode(this.value)"></div>' +
    '<p class="note" style="margin:0">Drag to separate the stack, the way an exploded parts illustration works in a factory manual. Production swaps this SVG for a glTF model in three.js using the same callout and hotspot model.</p>');
  setExplode(35);
}
function setExplode(v) {
  const f = (+v) / 100;
  [['x-rotor', 1], ['x-pads', 1.9], ['x-caliper', 2.9], ['x-shield', -1.1]].forEach(p => {
    const el = document.getElementById(p[0]);
    if (el) el.setAttribute('transform', 'translate(' + (f * 70 * p[1]) + ',0)');
  });
}
function EXPLODED() {
  return '<svg viewBox="0 0 480 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;background:#FCFBFF;border-radius:14px">' +
    '<path d="M40 120h380" stroke="#D6D3EC" stroke-width="1" stroke-dasharray="6 5"/>' +
    '<g id="x-shield"><ellipse cx="118" cy="112" rx="24" ry="72" fill="#F0EFF7" stroke="#8B8AA5" stroke-width="1.8"/>' +
    '<circle cx="118" cy="205" r="9" fill="#fff" stroke="#2B2D42" stroke-width="1.4"/><text x="118" y="209" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter">4</text></g>' +
    '<g id="x-rotor"><ellipse cx="152" cy="112" rx="30" ry="80" fill="#E7E3FE" stroke="#6C5CE7" stroke-width="2.2"/>' +
    '<ellipse cx="152" cy="112" rx="14" ry="38" fill="#DDD8FA" stroke="#6C5CE7" stroke-width="1.8"/>' +
    '<ellipse cx="152" cy="112" rx="5" ry="13" fill="#6C5CE7"/>' +
    '<circle cx="152" cy="214" r="9" fill="#fff" stroke="#2B2D42" stroke-width="1.4"/><text x="152" y="218" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter">3</text></g>' +
    '<g id="x-pads"><rect x="178" y="62" width="13" height="52" rx="4" fill="#C9C2F7" stroke="#6C5CE7" stroke-width="1.8"/>' +
    '<rect x="178" y="118" width="13" height="52" rx="4" fill="#C9C2F7" stroke="#6C5CE7" stroke-width="1.8"/>' +
    '<circle cx="184" cy="192" r="9" fill="#fff" stroke="#2B2D42" stroke-width="1.4"/><text x="184" y="196" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter">2</text></g>' +
    '<g id="x-caliper"><path d="M210 60h34a14 14 0 0 1 14 14v76a14 14 0 0 1-14 14h-34z" fill="#E85D5D" stroke="#C33A3A" stroke-width="2.2"/>' +
    '<circle cx="234" cy="112" r="13" fill="#F5B4B4" stroke="#C33A3A" stroke-width="1.8"/>' +
    '<circle cx="234" cy="186" r="9" fill="#fff" stroke="#2B2D42" stroke-width="1.4"/><text x="234" y="190" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter">1</text></g>' +
    '<g font-family="Inter" font-size="11" fill="#2B2D42">' +
    '<text x="310" y="70">1 &middot; Caliper assembly</text><text x="310" y="90">2 &middot; Pad set, inner &amp; outer</text>' +
    '<text x="310" y="110">3 &middot; Rotor, vented</text><text x="310" y="130">4 &middot; Splash shield</text></g></svg>';
}

/* ============================================================
   THE FIGURES
   ============================================================ */
const SVGS = {};
function rep(n, f) { let s = ''; for (let i = 0; i < n; i++) s += f(i); return s; }
function cal(n, key, x, y, lx, ly) {
  return '<g class="hot" data-c="' + key + '">' +
    (lx !== undefined ? '<path class="lead" d="M' + lx + ' ' + ly + 'L' + x + ' ' + y + '"/>' : '') +
    '<circle class="cal-c" cx="' + x + '" cy="' + y + '" r="10.5" fill="#fff" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<text class="cal-t" x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-family="Inter" font-size="12" font-weight="700" fill="#2B2D42">' + n + '</text></g>';
}
function frame(title, fig) {
  return '<rect x="8" y="8" width="904" height="524" rx="10" fill="#fff" stroke="#2B2D42" stroke-width="1.2"/>' +
    '<rect x="8" y="8" width="904" height="34" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.2"/>' +
    '<text class="ttl" x="24" y="30">' + title + '</text>' +
    '<text class="lbl s" x="896" y="30" text-anchor="end">' + fig + '</text>';
}

/* A disc corner and a drum corner, drawn at an arbitrary centre so the
   rear axle can be either without duplicating the whole figure. */
function discCorner(cx, cy) {
  return '<g><circle cx="' + cx + '" cy="' + cy + '" r="70" fill="#F4F3FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="51" fill="#fff" stroke="#2B2D42" stroke-width="1.3"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="26" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="#6C5CE7"/>' +
    '<g stroke="#B9B3EC" stroke-width="1"><path d="M' + cx + ' ' + (cy - 50) + 'v24M' + cx + ' ' + (cy + 26) + 'v24M' +
    (cx - 50) + ' ' + cy + 'h24M' + (cx + 26) + ' ' + cy + 'h24"/></g>' +
    '<path d="M' + (cx + 26) + ' ' + (cy - 36) + 'a56 56 0 0 1 0 72h30a12 12 0 0 0 12-12v-48a12 12 0 0 0-12-12z" ' +
    'fill="#E85D5D" stroke="#C33A3A" stroke-width="1.6"/>' +
    '<rect x="' + (cx + 22) + '" y="' + (cy - 22) + '" width="7" height="44" rx="2" fill="#8B8AA5"/></g>';
}
function drumCorner(cx, cy) {
  return '<g><circle cx="' + cx + '" cy="' + cy + '" r="64" fill="#F4F3FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="47" fill="#fff" stroke="#2B2D42" stroke-width="1.2" stroke-dasharray="4 3"/>' +
    '<path d="M' + (cx - 28) + ' ' + (cy - 35) + 'a44 44 0 0 0 0 70" fill="none" stroke="#6C5CE7" stroke-width="6.5" stroke-linecap="round"/>' +
    '<path d="M' + (cx + 28) + ' ' + (cy - 35) + 'a44 44 0 0 1 0 70" fill="none" stroke="#6C5CE7" stroke-width="6.5" stroke-linecap="round"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="13" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.6"/></g>';
}

SVGS.brakes = function (C) {
  C = C || vconf();
  const rearDisc = C.rear_brakes === 'disc';
  const rear = rearDisc ? discCorner : drumCorner;
  return '<svg viewBox="0 0 920 540" xmlns="http://www.w3.org/2000/svg">' +
    frame('BRAKING SYSTEM — HYDRAULIC LAYOUT', 'FIG. 1') +
    '<g class="L-fluid" stroke="#D89B00" stroke-width="4" fill="none" stroke-linecap="round">' +
    '<path d="M368 156C312 154 262 166 244 170"/>' +
    '<path d="M368 178C332 198 324 268 302 300 276 336 254 350 240 356"/>' +
    '<path d="M480 168h44v82h40"/><path d="M640 250h94v-82h6"/><path d="M734 250v102h6"/></g>' +
    '<g class="L-fluid" fill="#D89B00"><circle cx="524" cy="250" r="4"/><circle cx="734" cy="250" r="4"/></g>' +
    '<g class="L-elec" stroke="#8B8AA5" stroke-width="1.8" stroke-dasharray="7 5" fill="none">' +
    '<path d="M214 200C258 228 300 334 400 392h122"/><path d="M214 382C280 402 340 406 400 406h122"/>' +
    '<path d="M762 200C718 234 668 334 606 392"/><path d="M762 378C718 400 656 404 606 406"/></g>' +
    '<g class="L-comp">' +
    '<g><circle cx="164" cy="168" r="70" fill="#F4F3FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<circle cx="164" cy="168" r="51" fill="#fff" stroke="#2B2D42" stroke-width="1.3"/>' +
    '<circle cx="164" cy="168" r="26" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<circle cx="164" cy="168" r="9" fill="#6C5CE7"/>' +
    '<g stroke="#B9B3EC" stroke-width="1"><path d="M164 118v24M164 194v24M114 168h24M190 168h24"/></g>' +
    '<path d="M190 132a56 56 0 0 1 0 72h30a12 12 0 0 0 12-12v-48a12 12 0 0 0-12-12z" fill="#E85D5D" stroke="#C33A3A" stroke-width="1.6"/>' +
    '<rect x="186" y="146" width="7" height="44" rx="2" fill="#8B8AA5"/></g>' +
    '<g><circle cx="164" cy="384" r="70" fill="#F4F3FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<circle cx="164" cy="384" r="51" fill="#fff" stroke="#2B2D42" stroke-width="1.3"/>' +
    '<circle cx="164" cy="384" r="26" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<circle cx="164" cy="384" r="9" fill="#6C5CE7"/>' +
    '<g stroke="#B9B3EC" stroke-width="1"><path d="M164 334v24M164 410v24M114 384h24M190 384h24"/></g>' +
    '<path d="M190 348a56 56 0 0 1 0 72h30a12 12 0 0 0 12-12v-48a12 12 0 0 0-12-12z" fill="#E85D5D" stroke="#C33A3A" stroke-width="1.6"/>' +
    '<rect x="186" y="362" width="7" height="44" rx="2" fill="#8B8AA5"/></g>' +
    rear(812, 168) + rear(812, 384) +
    '<g><circle cx="428" cy="116" r="45" fill="#E3DEFC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<circle cx="428" cy="116" r="29" fill="#fff" stroke="#2B2D42" stroke-width="1.2"/>' +
    '<rect x="392" y="108" width="10" height="16" rx="3" fill="#6C5CE7"/>' +
    '<path d="M473 108h26a6 6 0 0 1 0 12h-26" fill="none" stroke="#2B2D42" stroke-width="2"/></g>' +
    '<g><rect x="368" y="150" width="112" height="42" rx="8" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="376" y="116" width="44" height="34" rx="6" fill="#E3DEFC" stroke="#2B2D42" stroke-width="1.5"/>' +
    '<rect x="428" y="116" width="44" height="34" rx="6" fill="#E3DEFC" stroke="#2B2D42" stroke-width="1.5"/>' +
    '<path d="M380 133h36M432 133h36" stroke="#8B8AA5" stroke-width="1" stroke-dasharray="3 2"/>' +
    '<circle cx="380" cy="160" r="4.5" fill="#D89B00" stroke="#A87A00" stroke-width="1"/>' +
    '<circle cx="380" cy="180" r="4.5" fill="#D89B00" stroke="#A87A00" stroke-width="1"/></g>' +
    '<g><rect x="564" y="228" width="76" height="44" rx="7" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="576" y="240" width="52" height="20" rx="4" fill="#E3DEFC" stroke="#2B2D42" stroke-width="1"/>' +
    '<circle cx="602" cy="250" r="5.5" fill="#6C5CE7"/></g>' +
    '<g><rect x="522" y="376" width="84" height="54" rx="7" fill="#F4F3FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="534" y="388" width="58" height="11" rx="3" fill="#C9C2F7"/>' +
    '<rect x="534" y="406" width="58" height="11" rx="3" fill="#C9C2F7"/>' +
    '<rect x="598" y="388" width="14" height="30" rx="3" fill="#8B8AA5"/></g></g>' +
    '<g class="L-comp">' +
    cal(1, 'master_cylinder', 330, 206, 368, 178) +
    cal(2, 'booster', 428, 58, 428, 71) +
    cal(3, 'prop_valve', 676, 214, 640, 238) +
    cal(4, 'abs_module', 492, 458, 522, 424) +
    cal(5, 'caliper', 264, 168, 234, 168) +
    cal(6, rearDisc ? 'caliper' : 'drum', 886, 120, 860, 142) +
    '<text class="lbl" x="700" y="86">REAR — ' + (rearDisc ? 'DISC' : 'DRUM') + '</text>' +
    '<text class="lbl" x="120" y="86">FRONT — DISC</text>' +
    '<text class="lbl s" x="24" y="518">Hydraulic lines shown solid amber &middot; wheel speed sensor circuits shown grey dashed &middot; numbered balloons keyed to parts list</text></g>' +
    '<g class="L-spec"><rect x="286" y="288" width="200" height="70" rx="4" fill="#2B2D42"/>' +
    '<text x="304" y="311" font-family="Inter" font-size="10" fill="#B9B6D6">PAD MINIMUM THICKNESS</text>' +
    '<text x="304" y="335" font-family="Roboto Mono,monospace" font-size="17" font-weight="700" fill="#fff">3 mm</text>' +
    '<text x="304" y="351" font-family="Inter" font-size="9" fill="#8B8AA5">Rotor discard 0.98 in &middot; runout 0.002 in</text></g></svg>';
};

SVGS.cooling = function (C) {
  C = C || vconf();
  const cyl = Math.max(0, C.cylinders || 0);
  const vee = C.layout === 'V' && cyl >= 6;
  // lay the bores out inside the block: two banks for a V, one for an inline
  const bores = (() => {
    if (!cyl) return '';
    const perBank = vee ? Math.ceil(cyl / 2) : cyl;
    const banks = vee ? 2 : 1;
    let out = '';
    for (let b = 0; b < banks; b++) {
      for (let i = 0; i < (b === 1 ? cyl - perBank : perBank); i++) {
        const x = 436 + i * (150 / Math.max(1, perBank));
        const y = vee ? (b === 0 ? 228 : 320) : 274;
        out += '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="11" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.2"/>' +
          '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="4" fill="#8B8AA5"/>';
      }
    }
    return out;
  })();
  return '<svg viewBox="0 0 920 540" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="radg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#F2B7B7"/><stop offset="55%" stop-color="#CDCEF0"/><stop offset="100%" stop-color="#ABCDF2"/></linearGradient></defs>' +
    frame('ENGINE COOLING SYSTEM — FLOW CIRCUIT', 'FIG. 2') +
    '<g class="L-hot" stroke="#E85D5D" stroke-width="7" fill="none" stroke-linecap="round">' +
    '<path d="M480 156C430 120 292 114 200 146"/><path d="M600 222c48-6 78 0 88 18"/></g>' +
    '<g class="L-hot" fill="#E85D5D"><path d="M322 112l-15-7v14z"/><path d="M660 216l15-6v13z"/></g>' +
    '<g class="L-cold" stroke="#4A90D9" stroke-width="7" fill="none" stroke-linecap="round">' +
    '<path d="M200 398c86 34 172 8 214-30"/><path d="M688 312c-28 24-72 20-88-6"/></g>' +
    '<g class="L-cold" fill="#4A90D9"><path d="M326 418l15 6v-13z"/><path d="M642 332l-14 5v-13z"/></g>' +
    '<path class="L-cold" d="M186 126C226 104 296 106 296 376" stroke="#4A90D9" stroke-width="3" fill="none" stroke-dasharray="7 5"/>' +
    '<g class="L-comp">' +
    '<g><rect x="58" y="142" width="132" height="264" rx="4" fill="url(#radg)" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="58" y="142" width="132" height="26" rx="3" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.5"/>' +
    '<rect x="58" y="380" width="132" height="26" rx="3" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.5"/>' +
    '<g stroke="#fff" stroke-width="1.5" opacity=".85">' + rep(15, i => '<path d="M' + (68 + i * 8.3) + ' 172v202"/>') + '</g>' +
    '<g stroke="#8B8AA5" stroke-width=".6" opacity=".4">' + rep(9, i => '<path d="M60 ' + (182 + i * 22) + 'h128"/>') + '</g>' +
    '<rect x="106" y="124" width="36" height="20" rx="3" fill="#6C5CE7"/><rect x="114" y="115" width="20" height="10" rx="2" fill="#8B8AA5"/></g>' +
    '<g><rect x="206" y="198" width="146" height="152" rx="6" fill="none" stroke="#2B2D42" stroke-width="1.4" stroke-dasharray="6 4"/>' +
    '<circle cx="279" cy="274" r="59" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    rep(7, i => {
      const a = i * 51.4, r = 51;
      const x1 = (279 + r * Math.cos((a - 16) * Math.PI / 180)).toFixed(1), y1 = (274 + r * Math.sin((a - 16) * Math.PI / 180)).toFixed(1);
      const x2 = (279 + r * Math.cos((a + 16) * Math.PI / 180)).toFixed(1), y2 = (274 + r * Math.sin((a + 16) * Math.PI / 180)).toFixed(1);
      return '<path d="M279 274L' + x1 + ' ' + y1 + 'A' + r + ' ' + r + ' 0 0 1 ' + x2 + ' ' + y2 + 'Z" fill="#C9C2F7" stroke="#2B2D42" stroke-width="1"/>';
    }) +
    '<circle cx="279" cy="274" r="16" fill="#6C5CE7"/><circle cx="279" cy="274" r="6" fill="#fff"/></g>' +
    '<g><rect x="414" y="196" width="186" height="154" rx="6" fill="#F4F3FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<g stroke="#8B8AA5" stroke-width="1" opacity=".35"><path d="M414 242h186M414 306h186"/></g>' +
    bores +
    '<text class="lbl s" x="507" y="' + (vee ? 278 : 214) + '" text-anchor="middle">' +
    (C.isEV ? 'DRIVE UNIT &amp; BATTERY LOOP' : 'ENGINE BLOCK — ' + (cyl ? C.layout + cyl : 'CONFIGURATION UNSET')) + '</text>' +
    '<circle cx="414" cy="300" r="29" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<circle cx="414" cy="300" r="14" fill="#fff" stroke="#2B2D42" stroke-width="1.5"/><circle cx="414" cy="300" r="4.5" fill="#6C5CE7"/>' +
    rep(6, i => {
      const a = i * 60 * Math.PI / 180;
      return '<path d="M' + (414 + 15 * Math.cos(a)).toFixed(1) + ' ' + (300 + 15 * Math.sin(a)).toFixed(1) + 'L' + (414 + 27 * Math.cos(a)).toFixed(1) + ' ' + (300 + 27 * Math.sin(a)).toFixed(1) + '" stroke="#2B2D42" stroke-width="1.6"/>';
    }) + '</g>' +
    '<g><rect x="464" y="138" width="76" height="40" rx="6" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<circle cx="502" cy="158" r="12.5" fill="#E3DEFC" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<path d="M494 158h16" stroke="#2B2D42" stroke-width="2.2"/><rect x="534" y="145" width="12" height="13" rx="2" fill="#8B8AA5"/></g>' +
    '<g><rect x="684" y="216" width="130" height="104" rx="4" fill="#F8EEF0" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<g stroke="#D9A0A0" stroke-width="1.4" opacity=".85">' + rep(11, i => '<path d="M' + (694 + i * 10.8) + ' 228v80"/>') + '</g>' +
    '<rect x="684" y="216" width="130" height="14" rx="3" fill="#E3DEFC" stroke="#2B2D42" stroke-width="1.2"/>' +
    '<rect x="684" y="306" width="130" height="14" rx="3" fill="#E3DEFC" stroke="#2B2D42" stroke-width="1.2"/></g>' +
    '<g><rect x="252" y="390" width="92" height="98" rx="5" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<path d="M252 452q23-9 46 0t46 0v22a14 14 0 0 1-14 14h-64a14 14 0 0 1-14-14z" fill="#8FBEEA" opacity=".55"/>' +
    '<rect x="280" y="378" width="30" height="16" rx="3" fill="#6C5CE7"/>' +
    '<path d="M252 424h92" stroke="#2B2D42" stroke-width=".9" stroke-dasharray="3 3"/>' +
    '<text class="lbl s" x="348" y="428">MAX</text></g></g>' +
    '<g class="L-comp">' +
    cal(1, 'radiator', 30, 274, 58, 274) +
    cal(2, 'fan', 279, 368, 279, 334) +
    cal(3, 'thermostat', 502, 100, 502, 138) +
    cal(4, 'water_pump', 368, 300, 385, 300) +
    cal(5, 'heater_core', 749, 180, 749, 216) +
    '<text class="lbl" x="318" y="102">UPPER RADIATOR HOSE</text>' +
    '<text class="lbl" x="330" y="452">LOWER RADIATOR HOSE</text>' +
    '<text class="lbl" x="618" y="196">HEATER HOSES</text>' +
    '<text class="lbl" x="360" y="470">COOLANT RECOVERY TANK</text>' +
    '<text class="lbl s" x="24" y="518">Red = coolant leaving the engine &middot; Blue = coolant returning from the radiator &middot; numbered balloons keyed to parts list</text></g>' +
    '<g class="L-spec"><rect x="620" y="392" width="214" height="72" rx="4" fill="#2B2D42"/>' +
    '<text x="638" y="415" font-family="Inter" font-size="10" fill="#B9B6D6">THERMOSTAT OPENS AT</text>' +
    '<text x="638" y="439" font-family="Roboto Mono,monospace" font-size="17" font-weight="700" fill="#fff">187 °F / 86 °C</text>' +
    '<text x="638" y="455" font-family="Inter" font-size="9" fill="#8B8AA5">Fully open 207 °F &middot; cap 15 psi &middot; 14.0 qt</text></g></svg>';
};

SVGS.fuel = function (C) {
  C = C || vconf();
  const cyl = Math.max(1, C.cylinders || 4);
  const railX = 566, railW = 212;
  const step = railW / (cyl + 0.6);              // spread the injectors across the rail
  const injX = i => railX + step * (i + 0.6);
  const injLabel = C.injection === 'direct' ? 'DIRECT INJECTORS'
    : C.injection === 'diesel-cr' ? 'COMMON-RAIL INJECTORS' : 'PORT INJECTORS';
  return '<svg viewBox="0 0 920 540" xmlns="http://www.w3.org/2000/svg">' +
    frame('FUEL DELIVERY AND EVAPORATIVE EMISSION CONTROL', 'FIG. 3') +
    '<g class="L-fluid" stroke="#D89B00" stroke-width="5.5" fill="none" stroke-linecap="round">' +
    '<path d="M234 222c42 0 62-4 100-4"/><path d="M436 214c64-8 86-36 130-52"/></g>' +
    '<g class="L-fluid" fill="#D89B00"><path d="M300 218l-13-6v12z"/><path d="M518 186l-11-9v13z"/></g>' +
    '<g class="L-vapor" stroke="#2BB673" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-dasharray="9 5">' +
    '<path d="M190 300c0 104 414 114 446 114v-32"/><path d="M722 382v-78c0-60-36-90-66-98"/></g>' +
    '<g class="L-comp">' +
    '<g><path d="M56 250h212a14 14 0 0 1 14 14v82a14 14 0 0 1-14 14H56a14 14 0 0 1-14-14v-82a14 14 0 0 1 14-14z" fill="#EFEDFB" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<path d="M44 316q40-10 79 0t79 0 80 0v30a14 14 0 0 1-14 14H58a14 14 0 0 1-14-14z" fill="#F3D77A" opacity=".7"/>' +
    '<rect x="100" y="142" width="26" height="110" rx="4" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.5"/>' +
    '<rect x="92" y="130" width="42" height="16" rx="4" fill="#6C5CE7"/>' +
    '<text class="lbl s" x="224" y="290">26 GAL / 98 L</text></g>' +
    '<g><rect x="168" y="192" width="66" height="114" rx="5" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="180" y="206" width="42" height="46" rx="4" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.4"/>' +
    '<circle cx="201" cy="229" r="12" fill="#fff" stroke="#2B2D42" stroke-width="1.4"/>' +
    '<text x="201" y="233" text-anchor="middle" font-family="Inter" font-size="11" font-weight="700" fill="#2B2D42">M</text>' +
    '<rect x="180" y="268" width="42" height="24" rx="3" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.2"/>' +
    '<g stroke="#8B8AA5" stroke-width=".9">' + rep(6, i => '<path d="M' + (184 + i * 6.6) + ' 270v20"/>') + '</g></g>' +
    '<g><rect x="334" y="192" width="102" height="52" rx="5" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="348" y="204" width="74" height="28" rx="3" fill="#EFEDFB" stroke="#2B2D42" stroke-width="1"/>' +
    '<g stroke="#8B8AA5" stroke-width="1.2">' + rep(8, i => '<path d="M' + (354 + i * 8.8) + ' 206v24"/>') + '</g>' +
    '<circle cx="385" cy="185" r="8" fill="#8B8AA5"/></g>' +
    '<g><rect x="566" y="128" width="212" height="42" rx="5" fill="#EFEDFB" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="578" y="140" width="188" height="18" rx="3" fill="#fff" opacity=".7"/>' +
    rep(cyl, i => '<g><rect x="' + injX(i).toFixed(1) + '" y="170" width="13" height="30" rx="2" fill="#6C5CE7"/>' +
      '<rect x="' + (injX(i) + 2).toFixed(1) + '" y="200" width="9" height="12" rx="2" fill="#8B8AA5"/>' +
      '<text class="lbl s" x="' + (injX(i) + 6.5).toFixed(1) + '" y="224" text-anchor="middle">' + (i + 1) + '</text></g>') +
    '<text class="lbl s" x="672" y="153" text-anchor="middle">FUEL RAIL — ' + cyl + ' ' + injLabel + '</text></g>' +
    '<g><path d="M558 212h228v56a12 12 0 0 1-12 12H570a12 12 0 0 1-12-12z" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<text class="lbl s" x="672" y="250" text-anchor="middle">INTAKE MANIFOLD</text></g>' +
    '<g><rect x="590" y="382" width="92" height="90" rx="5" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="602" y="398" width="68" height="58" rx="3" fill="#DEEFE6" stroke="#2BB673" stroke-width="1.3"/>' +
    '<g fill="#2BB673" opacity=".55">' + rep(18, i => '<circle cx="' + (610 + (i % 6) * 11) + '" cy="' + (408 + Math.floor(i / 6) * 17) + '" r="3.3"/>') + '</g>' +
    '<rect x="630" y="371" width="14" height="12" rx="2" fill="#2BB673"/></g>' +
    '<g><rect x="696" y="288" width="52" height="34" rx="5" fill="#fff" stroke="#2BB673" stroke-width="1.8"/>' +
    '<circle cx="722" cy="305" r="7.5" fill="#2BB673"/></g></g>' +
    '<g class="L-comp">' +
    cal(1, 'fuel_tank', 52, 392) +
    cal(2, 'fuel_pump', 120, 190, 168, 224) +
    cal(3, 'fuel_filter', 385, 300, 385, 244) +
    cal(4, 'injector', 826, 110, 778, 144) +
    cal(5, 'evap', 746, 428, 682, 428) +
    '<text class="lbl" x="70" y="96">FILLER NECK &amp; CAP</text>' +
    '<text class="lbl" x="770" y="326">PURGE SOLENOID</text>' +
    '<text class="lbl s" x="24" y="512">Amber solid = liquid fuel under pressure &middot; green dashed = fuel vapour &middot; abbreviations per SAE J1930</text></g>' +
    '<g class="L-spec"><rect x="272" y="392" width="216" height="72" rx="4" fill="#2B2D42"/>' +
    '<text x="290" y="415" font-family="Inter" font-size="10" fill="#B9B6D6">RAIL PRESSURE — KOEO</text>' +
    '<text x="290" y="439" font-family="Roboto Mono,monospace" font-size="17" font-weight="700" fill="#fff">55–62 psi</text>' +
    '<text x="290" y="455" font-family="Inter" font-size="9" fill="#8B8AA5">Leak-down max 5 psi over 5 min</text></g></svg>';
};

SVGS.wiring = function () {
  return '<svg viewBox="0 0 920 540" xmlns="http://www.w3.org/2000/svg">' +
    frame('FUEL PUMP CIRCUIT — POWER AND GROUND DISTRIBUTION', 'FIG. 4') +
    '<g class="L-pwr" stroke="#E85D5D" stroke-width="2.4" fill="none">' +
    '<path d="M150 96h620"/>' +
    '<path d="M226 96v40"/><path d="M226 178v46"/>' +
    '<path d="M470 96v52"/>' +
    '<path d="M226 262v40"/>' +
    '<path d="M600 224v-64"/></g>' +
    '<g class="L-ctrl" stroke="#4A90D9" stroke-width="2.2" fill="none">' +
    '<path d="M330 268h96"/><path d="M330 268v82"/><path d="M600 268h96v82"/></g>' +
    '<g class="L-gnd" stroke="#2B2D42" stroke-width="2.4" fill="none">' +
    '<path d="M226 386v64"/><path d="M226 450h330"/><path d="M556 450v-18"/>' +
    '<path d="M696 432v18h-140"/></g>' +
    '<g class="L-comp">' +
    '<g><rect x="86" y="70" width="128" height="76" rx="4" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="104" y="58" width="22" height="14" rx="2" fill="#E85D5D"/><rect x="174" y="58" width="22" height="14" rx="2" fill="#2B2D42"/>' +
    '<text class="term" x="115" y="52" text-anchor="middle">30</text>' +
    '<text class="term" x="185" y="52" text-anchor="middle">31</text>' +
    '<g stroke="#2B2D42" stroke-width="1.5"><path d="M108 100v20M98 110h20M172 110h20"/></g>' +
    '<text class="lbl s" x="150" y="138" text-anchor="middle">12 V &middot; 760 CCA &middot; GROUP 48</text>' +
    '<path d="M196 96v-24" stroke="#E85D5D" stroke-width="2.4" fill="none"/>' +
    '<path d="M104 146v18" stroke="#2B2D42" stroke-width="2.2" fill="none"/>' +
    '<path d="M96 164h16M99 169h10M102 174h4" stroke="#2B2D42" stroke-width="1.8"/></g>' +
    '<g><rect x="204" y="136" width="44" height="42" rx="3" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<path d="M212 172l24-30" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<text class="wlbl" x="256" y="152">F12</text><text class="wlbl" x="256" y="166">15 A</text></g>' +
    '<g><rect x="176" y="224" width="180" height="162" rx="4" fill="#FBFAFF" stroke="#2B2D42" stroke-width="1.4" stroke-dasharray="6 4"/>' +
    '<text class="lbl s" x="266" y="244" text-anchor="middle">FUEL PUMP RELAY</text>' +
    '<rect x="288" y="256" width="42" height="94" rx="3" fill="#fff" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<g stroke="#2B2D42" stroke-width="1.2">' + rep(5, i => '<path d="M294 ' + (268 + i * 16) + 'h30"/>') + '</g>' +
    '<text class="term" x="336" y="264">86</text><text class="term" x="336" y="352">85</text>' +
    '<circle cx="226" cy="302" r="3.6" fill="#2B2D42"/><circle cx="226" cy="262" r="3.6" fill="#2B2D42"/>' +
    '<path d="M226 302l44-30" stroke="#2B2D42" stroke-width="2"/>' +
    '<circle cx="270" cy="272" r="3.6" fill="#2B2D42"/>' +
    '<text class="term" x="196" y="258">30</text><text class="term" x="278" y="266">87</text>' +
    '<text class="term" x="196" y="316">87</text></g>' +
    '<g><rect x="426" y="238" width="174" height="62" rx="4" fill="#EFEDFB" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<text x="513" y="266" text-anchor="middle" font-family="Inter" font-size="15" font-weight="700" fill="#2B2D42">ECM</text>' +
    '<text class="lbl s" x="513" y="284" text-anchor="middle">ENGINE CONTROL MODULE</text>' +
    '<g stroke="#2B2D42" stroke-width="1.2">' + rep(6, i => '<path d="M' + (440 + i * 26) + ' 300v8"/>') + '</g></g>' +
    '<g><path d="M690 106v34M702 106v34" stroke="#2B2D42" stroke-width="2"/>' +
    '<text class="wlbl" x="712" y="128">C201</text></g>' +
    '<path class="L-pwr" d="M696 96v10M696 140v20" stroke="#E85D5D" stroke-width="2.4" fill="none"/>' +
    '<g><circle cx="696" cy="196" r="34" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<text x="696" y="203" text-anchor="middle" font-family="Inter" font-size="19" font-weight="700" fill="#2B2D42">M</text>' +
    '<text class="lbl s" x="696" y="248" text-anchor="middle">FUEL PUMP &middot; FP</text></g>' +
    '<path class="L-gnd" d="M696 230v202" stroke="#2B2D42" stroke-width="2.4" fill="none"/>' +
    '<g><path d="M556 432v-14" stroke="#2B2D42" stroke-width="2.2" fill="none"/>' +
    '<g stroke="#2B2D42" stroke-width="2.2"><path d="M534 418h44M541 426h30M549 434h14"/></g>' +
    '<text class="wlbl" x="586" y="428">G104</text></g>' +
    '<circle cx="556" cy="450" r="4.2" fill="#2B2D42"/>' +
    '<text class="wlbl" x="562" y="470">S212</text>' +
    '<g class="wlbl">' +
    '<text x="150" y="88">RED 12 GA &middot; CKT 2</text>' +
    '<text x="234" y="212">PNK 16 GA &middot; CKT 439</text>' +
    '<text x="234" y="296">DK GRN 16 GA &middot; CKT 120</text>' +
    '<text x="344" y="262">PNK 20 GA &middot; CKT 439</text>' +
    '<text x="608" y="262">BLK/WHT 20 GA &middot; CKT 1465</text>' +
    '<text x="608" y="152">GRY 16 GA &middot; CKT 120</text>' +
    '<text x="240" y="444">BLK 16 GA &middot; CKT 150</text>' +
    '<text x="706" y="330">BLK 16 GA &middot; CKT 150</text></g></g>' +
    '<g class="L-comp">' +
    cal(1, 'w_battery', 66, 108) +
    cal(2, 'w_fuse', 226, 116, 226, 136) +
    cal(3, 'w_relay', 162, 244) +
    cal(4, 'w_ecm', 612, 250, 600, 258) +
    cal(5, 'w_connector', 744, 116, 712, 116) +
    cal(6, 'fuel_pump', 748, 196, 730, 196) +
    cal(7, 'w_ground', 508, 418, 534, 420) +
    '<text class="lbl s" x="24" y="518">B+ shown red &middot; control circuits blue &middot; ground black &middot; terminal numbers per DIN 72552 &middot; circuit numbers with colour and gauge on every leg</text></g>' +
    '<g class="L-spec"><rect x="404" y="336" width="240" height="76" rx="4" fill="#2B2D42"/>' +
    '<text x="422" y="359" font-family="Inter" font-size="10" fill="#B9B6D6">MAX VOLTAGE DROP UNDER LOAD</text>' +
    '<text x="422" y="383" font-family="Roboto Mono,monospace" font-size="16" font-weight="700" fill="#fff">0.2 V feed &middot; 0.1 V gnd</text>' +
    '<text x="422" y="400" font-family="Inter" font-size="9" fill="#8B8AA5">Relay coil 70–120 Ω &middot; contact rating 30 A</text></g></svg>';
};

SVGS.charging = function () {
  return '<svg viewBox="0 0 920 540" xmlns="http://www.w3.org/2000/svg">' +
    frame('CHARGING AND STARTING CIRCUIT', 'FIG. 5') +
    /* heavy current path — drawn thick, the way a factory schematic weights it */
    '<g class="L-pwr" stroke="#E85D5D" fill="none" stroke-linecap="round">' +
    '<path d="M226 108h214" stroke-width="6"/>' +          /* battery + to junction */
    '<path d="M470 108h286" stroke-width="6"/>' +          /* junction to alternator B+ */
    '<path d="M455 128v170" stroke-width="6"/>' +          /* junction down to starter 30 */
    '<path d="M455 108v20" stroke-width="6"/>' +
    '<path d="M470 96v-42h180" stroke-width="2.4"/></g>' + /* ignition feed tap */
    '<g class="L-ctrl" stroke="#4A90D9" stroke-width="2.2" fill="none">' +
    '<path d="M650 96v128h-92"/>' +                        /* term 50 to starter solenoid */
    '<path d="M758 148v54h-46"/></g>' +                    /* alt L terminal to lamp/ECM */
    '<g class="L-gnd" stroke="#2B2D42" stroke-width="5" fill="none" stroke-linecap="round">' +
    '<path d="M150 160v250h430"/>' +
    '<path d="M498 356v54"/>' +
    '<path d="M786 210v200h-206"/></g>' +
    '<g class="L-comp">' +
    /* battery */
    '<g><rect x="86" y="76" width="140" height="84" rx="4" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<rect x="106" y="64" width="24" height="14" rx="2" fill="#E85D5D"/><rect x="182" y="64" width="24" height="14" rx="2" fill="#2B2D42"/>' +
    '<text class="term" x="118" y="58" text-anchor="middle">30</text><text class="term" x="194" y="58" text-anchor="middle">31</text>' +
    '<g stroke="#2B2D42" stroke-width="1.6">' + rep(3, i => '<path d="M' + (116 + i * 30) + ' 100v34"/><path d="M' + (131 + i * 30) + ' 110v14"/>') + '</g>' +
    '<text class="lbl s" x="156" y="152" text-anchor="middle">12 V &middot; 760 CCA &middot; GROUP 48</text></g>' +
    /* mega fuse */
    '<g><rect x="418" y="88" width="52" height="40" rx="4" fill="#fff" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<path d="M428 122l32-26" stroke="#2B2D42" stroke-width="2"/>' +
    '<text class="wlbl" x="418" y="82">MEGA FUSE 175 A</text></g>' +
    /* alternator */
    '<g><circle cx="786" cy="148" r="46" fill="#fff" stroke="#2B2D42" stroke-width="1.9"/>' +
    '<text x="786" y="156" text-anchor="middle" font-family="Inter" font-size="22" font-weight="700" fill="#2B2D42">G</text>' +
    '<text class="lbl s" x="786" y="212" text-anchor="middle">ALTERNATOR &middot; GEN</text>' +
    '<text class="term" x="742" y="120">B+</text><text class="term" x="742" y="196">L / 61</text>' +
    /* rectifier hint */
    '<g stroke="#8B8AA5" stroke-width="1.1" fill="none">' + rep(3, i => '<path d="M' + (766 + i * 14) + ' 126v-10"/>') + '</g></g>' +
    /* ignition switch */
    '<g><rect x="600" y="34" width="120" height="42" rx="6" fill="#EFEDFB" stroke="#2B2D42" stroke-width="1.8"/>' +
    '<text x="660" y="60" text-anchor="middle" font-family="Inter" font-size="12" font-weight="700" fill="#2B2D42">IGN SWITCH</text>' +
    '<text class="term" x="586" y="52">30</text><text class="term" x="726" y="52">15</text>' +
    '<text class="term" x="654" y="92">50</text></g>' +
    /* starter */
    '<g><rect x="410" y="298" width="148" height="58" rx="8" fill="#fff" stroke="#2B2D42" stroke-width="1.9"/>' +
    '<circle cx="450" cy="327" r="20" fill="#DDD8FA" stroke="#2B2D42" stroke-width="1.6"/>' +
    '<text x="450" y="333" text-anchor="middle" font-family="Inter" font-size="15" font-weight="700" fill="#2B2D42">M</text>' +
    '<rect x="482" y="308" width="64" height="24" rx="5" fill="#F6F5FC" stroke="#2B2D42" stroke-width="1.4"/>' +
    '<g stroke="#2B2D42" stroke-width="1.1">' + rep(5, i => '<path d="M' + (488 + i * 12) + ' 310v20"/>') + '</g>' +
    '<text class="lbl s" x="514" y="348" text-anchor="middle">SOLENOID</text>' +
    '<text class="lbl s" x="484" y="374" text-anchor="middle">STARTER MOTOR</text>' +
    '<text class="term" x="392" y="302">30</text><text class="term" x="566" y="322">50</text></g>' +
    /* ground symbols */
    '<g><g stroke="#2B2D42" stroke-width="2.4"><path d="M558 410h44M566 419h28M574 428h12"/></g>' +
    '<text class="wlbl" x="610" y="418">G101 ENGINE</text></g>' +
    '<g><path d="M150 160v10" stroke="#2B2D42" stroke-width="2.4"/>' +
    '<g stroke="#2B2D42" stroke-width="2.2"><path d="M130 172h40M137 180h26M144 188h12"/></g>' +
    '<text class="wlbl" x="176" y="180">G100 BODY</text></g>' +
    /* wire labels */
    '<g class="wlbl">' +
    '<text x="248" y="100">RED 4 GA &middot; CKT 2 &middot; MAIN B+</text>' +
    '<text x="500" y="100">RED 6 GA &middot; CKT 2</text>' +
    '<text x="466" y="230">RED 4 GA &middot; CKT 6 &middot; STARTER FEED</text>' +
    '<text x="560" y="216">PPL 18 GA &middot; CKT 5 &middot; CRANK</text>' +
    '<text x="700" y="240">BRN 18 GA &middot; CKT 25 &middot; CHARGE IND</text>' +
    '<text x="240" y="404">BLK 4 GA &middot; CKT 150 &middot; NEGATIVE</text>' +
    '<text x="640" y="404">BLK 4 GA &middot; ENGINE-TO-BODY STRAP</text></g></g>' +
    '<g class="L-comp">' +
    cal(1, 'w_battery', 66, 118) +
    cal(2, 'c_fusible', 444, 60, 444, 88) +
    cal(3, 'c_alternator', 862, 148, 832, 148) +
    cal(4, 'c_ign_switch', 660, 16, 660, 34) +
    cal(5, 'c_starter', 380, 380, 420, 356) +
    cal(6, 'w_ground', 646, 452, 580, 428) +
    '<text class="lbl s" x="24" y="518">Heavy conductors drawn thick &middot; control circuits thin &middot; DIN 72552 terminal numbers &middot; every leg carries colour, gauge and circuit number</text></g>' +
    '<g class="L-spec"><rect x="96" y="230" width="252" height="88" rx="4" fill="#2B2D42"/>' +
    '<text x="114" y="253" font-family="Inter" font-size="10" fill="#B9B6D6">CHARGING VOLTAGE AT 2,000 RPM</text>' +
    '<text x="114" y="278" font-family="Roboto Mono,monospace" font-size="18" font-weight="700" fill="#fff">13.5 – 14.7 V</text>' +
    '<text x="114" y="296" font-family="Inter" font-size="9" fill="#8B8AA5">AC ripple under 0.5 V &middot; cranking above 9.6 V</text>' +
    '<text x="114" y="310" font-family="Inter" font-size="9" fill="#8B8AA5">Parasitic draw under 50 mA once modules sleep</text></g></svg>';
};
