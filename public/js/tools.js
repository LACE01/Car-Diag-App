/* ============================================================
   tools.js — what you need to do the job

   Brand preference is yours: ICON (Harbor Freight's professional
   hand-tool line) and Milwaukee. The split between them is real,
   not marketing:

     ICON        hand tools — ratchets, sockets, wrenches, pliers,
                 screwdrivers, torque wrenches, pry bars, punches
     Milwaukee   cordless power, lighting, test & measure, plus a
                 competent hand-tool range

   Neither makes every specialty tool a job needs, and pretending
   otherwise would send you to a store for something that is not
   there. Where that happens the entry says so and names the kind of
   tool to look for instead.

   Nothing here is a part number. Tool lines change constantly and a
   stale SKU is worse than none — these are tool types with a
   prefilled search at each brand.
   ============================================================ */

const TOOL = (name, kind, brands, extra = {}) => ({ name, kind, brands, ...extra });

const TOOL_LIBRARY = {
  /* --- the baseline kit --- */
  socket_set_38: TOOL('3/8" drive socket set, metric + SAE', 'hand', ['icon', 'milwaukee']),
  socket_set_12: TOOL('1/2" drive socket set, deep + shallow', 'hand', ['icon', 'milwaukee']),
  socket_set_14: TOOL('1/4" drive socket set', 'hand', ['icon', 'milwaukee']),
  ratchet_38: TOOL('3/8" ratchet, 72-tooth or finer', 'hand', ['icon', 'milwaukee'],
    { note: 'Tooth count matters in tight quarters — 72-tooth swings 5°, a 36-tooth needs 10°.' }),
  breaker_bar: TOOL('1/2" breaker bar, 24"', 'hand', ['icon'],
    { note: 'Never use a torque wrench to break a fastener loose. It ruins the calibration.' }),
  extensions: TOOL('Extension set + wobble/universal joint', 'hand', ['icon', 'milwaukee']),
  wrench_set: TOOL('Combination wrench set, metric + SAE', 'hand', ['icon', 'milwaukee']),
  ratcheting_wrenches: TOOL('Ratcheting combination wrenches', 'hand', ['icon', 'milwaukee']),
  screwdrivers: TOOL('Screwdriver set, Phillips / flat / Torx', 'hand', ['icon', 'milwaukee']),
  pliers: TOOL('Plier set — slip joint, needle nose, diagonal', 'hand', ['icon', 'milwaukee']),
  locking_pliers: TOOL('Locking pliers (Vise-Grip type)', 'hand', ['icon', 'milwaukee']),
  hex_torx: TOOL('Hex and Torx bit sockets', 'hand', ['icon', 'milwaukee']),
  pry_bar: TOOL('Pry bar set', 'hand', ['icon']),
  dead_blow: TOOL('Dead blow hammer', 'hand', ['icon']),
  punch_chisel: TOOL('Punch and chisel set', 'hand', ['icon']),

  /* --- torque and measurement --- */
  torque_38: TOOL('3/8" torque wrench, 10–100 lb-ft', 'measure', ['icon'],
    { note: 'Store it wound back to its lowest setting or the spring takes a set.' }),
  torque_12: TOOL('1/2" torque wrench, 25–250 lb-ft', 'measure', ['icon']),
  torque_inlb: TOOL('1/4" inch-pound torque wrench', 'measure', ['icon'],
    { note: 'Anything specified in lb-in — valve covers, oil pans, plastic — needs this, not a foot-pound wrench at the bottom of its range.' }),
  torque_angle: TOOL('Torque angle gauge', 'measure', [],
    { alt: 'Torque-to-yield fasteners need this. Generic brands are fine — it is a protractor.' }),
  dial_indicator: TOOL('Dial indicator + magnetic base', 'measure', [],
    { alt: 'Rotor runout and endplay. Look for a general measuring-tool brand.' }),
  micrometer: TOOL('Micrometer, 0–1"', 'measure', [], { alt: 'Rotor thickness measured properly. Any machinist brand.' }),
  caliper_digital: TOOL('Digital caliper', 'measure', ['icon']),
  feeler_gauges: TOOL('Feeler gauge set', 'measure', ['icon']),
  tread_depth: TOOL('Tire tread depth gauge', 'measure', [], { alt: 'Any dial or digital depth gauge. A quarter works in a pinch — Washington\'s head is about 4/32.' }),
  tire_gauge: TOOL('Tire pressure gauge, dial or digital', 'measure', ['milwaukee']),

  /* --- power --- */
  impact_12: TOOL('1/2" cordless impact wrench', 'power', ['milwaukee'],
    { note: 'Loosening only. Never run a wheel or a suspension fastener to final torque with an impact.' }),
  impact_38: TOOL('3/8" cordless impact or impact ratchet', 'power', ['milwaukee']),
  drill_driver: TOOL('Cordless drill / driver', 'power', ['milwaukee']),
  angle_grinder: TOOL('Angle grinder', 'power', ['milwaukee'], { safety: true }),
  recip_saw: TOOL('Reciprocating saw', 'power', ['milwaukee']),
  work_light: TOOL('Rechargeable work light', 'power', ['milwaukee'],
    { note: 'Underrated. Most misdiagnoses start with not being able to see the part.' }),
  heat_gun: TOOL('Heat gun', 'power', ['milwaukee']),

  /* --- electrical test --- */
  multimeter: TOOL('Digital multimeter, auto-ranging', 'measure', ['milwaukee'],
    { note: 'Voltage-drop testing is what actually finds bad grounds — resistance readings lie under load.' }),
  clamp_meter: TOOL('DC clamp meter', 'measure', ['milwaukee'],
    { note: 'Parasitic draw and starter current, without breaking the circuit.' }),
  test_light: TOOL('Test light or power probe', 'measure', ['icon'],
    { warn: 'Never use a test light on an SRS or a low-current CAN circuit.' }),
  battery_tester: TOOL('Battery / charging system tester', 'measure', [],
    { alt: 'A conductance tester gives you measured CCA. Most parts stores will do this free at the counter.' }),
  backprobe: TOOL('Back-probe pin set', 'measure', [], { alt: 'Cheap and specific. Never pierce insulation — it invites corrosion later.' }),

  /* --- lifting and support --- */
  floor_jack: TOOL('Floor jack, rated above vehicle weight', 'lift', ['icon'], { safety: true }),
  jack_stands: TOOL('Jack stands, rated pair', 'lift', ['icon'],
    { safety: true, warn: 'Never work under a vehicle on a jack alone. Stands on hard level ground, chocks on the wheels that stay down, and shake it before you go under.' }),
  wheel_chocks: TOOL('Wheel chocks', 'lift', ['icon'], { safety: true }),
  creeper: TOOL('Creeper', 'lift', ['icon']),

  /* --- fluids --- */
  drain_pan: TOOL('Oil drain pan', 'fluid', ['icon']),
  oil_filter_wrench: TOOL('Oil filter wrench or cap socket', 'fluid', ['icon'],
    { note: 'Cap-style sized to your filter is worth it — band wrenches crush a spin-on filter and make it worse.' }),
  funnel: TOOL('Funnel set', 'fluid', ['icon']),
  fluid_pump: TOOL('Fluid transfer / suction pump', 'fluid', ['icon']),
  coolant_tester: TOOL('Cooling system pressure tester', 'fluid', [],
    { alt: 'Loanable free at most parts stores. Buy only if you do this often.' }),
  brake_bleeder: TOOL('Brake bleeder — vacuum or pressure', 'fluid', [],
    { alt: 'A one-man pressure bleeder is the usual choice. Motive and similar. A helper and a hose also works.' }),
  fuel_pressure_gauge: TOOL('Fuel pressure gauge with adapters', 'fluid', [], { alt: 'Often loanable. Diesel needs a different, much higher range.', safety: true }),
  grease_gun: TOOL('Grease gun', 'fluid', ['milwaukee'], { note: 'Milwaukee makes a cordless one; a hand gun is fine for a few zerks.' }),

  /* --- specialty --- */
  brake_caliper_tool: TOOL('Caliper piston compressor / wind-back', 'specialty', ['icon'],
    { note: 'Rear calipers with an integrated parking brake must be wound in, not pressed — pressing destroys the mechanism.' }),
  brake_line_wrench: TOOL('Flare nut (line) wrenches', 'specialty', ['icon'],
    { note: 'A regular open-end wrench rounds a brake line fitting. This is not optional.' }),
  spring_compressor: TOOL('Coil spring compressor', 'specialty', [],
    { alt: 'Loanable at most parts stores.', safety: true, warn: 'A loaded coil spring stores enough energy to kill. Use a proper compressor, cage style if you can, and keep your body out of the line of travel.' }),
  ball_joint_press: TOOL('Ball joint / press kit', 'specialty', [], { alt: 'Loanable. C-frame press with adapters.' }),
  hub_puller: TOOL('Hub / bearing puller set', 'specialty', [], { alt: 'Loanable. A slide hammer with a hub adapter covers most of it.' }),
  serpentine_tool: TOOL('Serpentine belt tensioner tool', 'specialty', ['icon']),
  spark_plug_socket: TOOL('Spark plug socket with rubber insert', 'specialty', ['icon']),
  gap_gauge: TOOL('Spark plug gap gauge', 'specialty', [], { alt: 'A wire-style gapper; feeler blades damage the fine-wire electrode on iridium plugs.' }),
  compression_tester: TOOL('Compression tester', 'specialty', [], { alt: 'Loanable. Diesel needs a high-range kit.' }),
  leakdown_tester: TOOL('Cylinder leak-down tester', 'specialty', [], { alt: 'Needs a compressor. Tells you where the compression went, which compression alone cannot.' }),
  smoke_machine: TOOL('EVAP / intake smoke machine', 'specialty', [], { alt: 'The only reliable way to find an EVAP or vacuum leak. Budget units work fine.' }),
  obd_scanner: TOOL('OBD-II adapter (BLE, ELM327/STN)', 'specialty', [],
    { alt: 'OBDLink CX or MX+, Veepeak BLE+, Vgate iCar Pro. This is what pairs with the Diagnose screen.' }),
  trim_tools: TOOL('Trim and panel removal set', 'specialty', ['icon']),
  hose_clamp_pliers: TOOL('Hose clamp pliers', 'specialty', ['icon']),
  o2_socket: TOOL('Oxygen sensor socket', 'specialty', ['icon']),
  tap_die: TOOL('Tap and die set', 'specialty', ['icon']),
  ext_removal: TOOL('Bolt extractor / stud remover set', 'specialty', ['icon'],
    { note: 'Assume at least one exhaust or suspension fastener will snap. Have these before you start, not after.' }),
  torque_multiplier: TOOL('Torque multiplier', 'specialty', ['icon'], { note: 'Axle nuts and crank bolts past 300 lb-ft.' }),

  /* --- consumables and PPE --- */
  penetrating_oil: TOOL('Penetrating oil', 'consumable', [], { alt: 'Any decent brand. Apply the night before, not the moment you need it.' }),
  brake_cleaner: TOOL('Brake parts cleaner', 'consumable', [], { alt: 'Non-chlorinated if there is any chance of a spark or flame nearby.' }),
  brake_grease: TOOL('High-temp silicone caliper grease', 'consumable', [], { alt: 'For guide pins and pad ears. Not regular chassis grease.' }),
  anti_seize: TOOL('Anti-seize compound', 'consumable', []),
  threadlocker: TOOL('Threadlocker, blue and red', 'consumable', []),
  shop_rags: TOOL('Shop towels / rags', 'consumable', []),
  gloves: TOOL('Nitrile gloves', 'ppe', ['milwaukee']),
  safety_glasses: TOOL('Safety glasses', 'ppe', ['milwaukee'], { safety: true }),
  hv_gloves: TOOL('Class 0 insulating gloves + CAT III meter', 'ppe', [],
    { alt: 'Specialist electrical-safety suppliers. Not a hardware-store item.', safety: true, warn: 'Required before any work on orange high-voltage cable. This is not optional PPE.' })
};

const BASE_KIT = ['socket_set_38', 'ratchet_38', 'wrench_set', 'extensions', 'screwdrivers', 'pliers',
  'safety_glasses', 'gloves', 'work_light', 'shop_rags'];
const LIFT_KIT = ['floor_jack', 'jack_stands', 'wheel_chocks', 'breaker_bar', 'torque_12'];

/* ---------- system → tools ---------- */
const SYSTEM_TOOLS = {
  engine: ['socket_set_38', 'torque_38', 'torque_inlb', 'hex_torx', 'ext_removal', 'penetrating_oil', 'threadlocker'],
  cooling: ['socket_set_38', 'hose_clamp_pliers', 'drain_pan', 'funnel', 'coolant_tester', 'torque_38'],
  fuel: ['socket_set_38', 'fuel_pressure_gauge', 'smoke_machine', 'brake_cleaner', 'torque_38'],
  brakes: [...LIFT_KIT, 'brake_caliper_tool', 'brake_line_wrench', 'brake_cleaner', 'brake_grease', 'micrometer', 'torque_12'],
  suspension: [...LIFT_KIT, 'ball_joint_press', 'hub_puller', 'pry_bar', 'ext_removal', 'penetrating_oil', 'torque_multiplier'],
  trans: [...LIFT_KIT, 'drain_pan', 'fluid_pump', 'funnel', 'torque_38'],
  drive: [...LIFT_KIT, 'drain_pan', 'fluid_pump', 'hex_torx', 'torque_12'],
  charging: ['multimeter', 'clamp_meter', 'socket_set_38', 'test_light', 'battery_tester', 'backprobe'],
  hvac: ['socket_set_38', 'trim_tools', 'screwdrivers', 'multimeter'],
  tires: [...LIFT_KIT, 'tread_depth', 'tire_gauge', 'torque_12', 'anti_seize'],
  body: ['trim_tools', 'screwdrivers', 'socket_set_14'],
  diagnostics: ['obd_scanner', 'multimeter', 'backprobe', 'work_light'],
  ev: ['hv_gloves', 'multimeter', 'obd_scanner'],
  legal: ['obd_scanner']
};

/* ---------- job-specific overrides, keyed to the service catalogue ---------- */
const JOB_TOOLS = {
  'Engine oil & filter change': [...BASE_KIT, 'drain_pan', 'oil_filter_wrench', 'funnel', 'floor_jack', 'jack_stands', 'wheel_chocks', 'torque_38'],
  'Engine oil & filter — high mileage': [...BASE_KIT, 'drain_pan', 'oil_filter_wrench', 'funnel', 'floor_jack', 'jack_stands', 'wheel_chocks', 'torque_38'],
  'Front brake pads & rotors': [...BASE_KIT, ...LIFT_KIT, 'brake_caliper_tool', 'brake_cleaner', 'brake_grease', 'micrometer', 'pry_bar', 'impact_12'],
  'Rear brake pads & rotors': [...BASE_KIT, ...LIFT_KIT, 'brake_caliper_tool', 'brake_cleaner', 'brake_grease', 'micrometer', 'pry_bar'],
  'Front brake pads only': [...BASE_KIT, ...LIFT_KIT, 'brake_caliper_tool', 'brake_cleaner', 'brake_grease'],
  'Rear brake shoes & drums': [...BASE_KIT, ...LIFT_KIT, 'brake_cleaner', 'locking_pliers', 'pry_bar', 'dead_blow'],
  'Brake fluid flush': [...BASE_KIT, ...LIFT_KIT, 'brake_bleeder', 'brake_line_wrench', 'drain_pan'],
  'Brake caliper replacement': [...BASE_KIT, ...LIFT_KIT, 'brake_line_wrench', 'brake_bleeder', 'brake_cleaner', 'torque_12'],
  'Spark plugs': [...BASE_KIT, 'spark_plug_socket', 'gap_gauge', 'torque_38', 'extensions', 'anti_seize'],
  'Serpentine belt': [...BASE_KIT, 'serpentine_tool', 'work_light'],
  'Battery replacement': ['socket_set_38', 'wrench_set', 'multimeter', 'safety_glasses', 'gloves', 'battery_tester'],
  'Alternator': [...BASE_KIT, 'serpentine_tool', 'multimeter', 'clamp_meter', 'torque_38', 'ext_removal'],
  'Starter': [...BASE_KIT, ...LIFT_KIT, 'multimeter', 'clamp_meter', 'work_light'],
  'Coolant flush & fill': [...BASE_KIT, 'drain_pan', 'funnel', 'coolant_tester', 'hose_clamp_pliers'],
  'Thermostat': [...BASE_KIT, 'drain_pan', 'hose_clamp_pliers', 'torque_38', 'coolant_tester'],
  'Water pump': [...BASE_KIT, 'serpentine_tool', 'drain_pan', 'hose_clamp_pliers', 'torque_38', 'coolant_tester'],
  'Radiator': [...BASE_KIT, 'drain_pan', 'hose_clamp_pliers', 'funnel', 'coolant_tester'],
  'Fuel filter': [...BASE_KIT, ...LIFT_KIT, 'fuel_pressure_gauge', 'brake_cleaner'],
  'Fuel pump module': [...BASE_KIT, ...LIFT_KIT, 'fuel_pressure_gauge', 'multimeter', 'dead_blow', 'punch_chisel'],
  'Oxygen sensor (HO2S) — upstream': [...BASE_KIT, 'o2_socket', 'penetrating_oil', 'anti_seize', 'torque_38', 'heat_gun'],
  'Oxygen sensor (HO2S) — downstream': [...BASE_KIT, 'o2_socket', 'penetrating_oil', 'anti_seize', 'torque_38'],
  'EVAP smoke test': ['smoke_machine', 'obd_scanner', 'work_light'],
  'Struts / shocks — front': [...BASE_KIT, ...LIFT_KIT, 'spring_compressor', 'ext_removal', 'penetrating_oil', 'impact_12'],
  'Struts / shocks — rear': [...BASE_KIT, ...LIFT_KIT, 'spring_compressor', 'ext_removal', 'penetrating_oil'],
  'Ball joints': [...BASE_KIT, ...LIFT_KIT, 'ball_joint_press', 'dead_blow', 'penetrating_oil', 'torque_12'],
  'Wheel bearing / hub assembly': [...BASE_KIT, ...LIFT_KIT, 'hub_puller', 'torque_multiplier', 'penetrating_oil', 'impact_12'],
  'Tie rod ends': [...BASE_KIT, ...LIFT_KIT, 'ball_joint_press', 'penetrating_oil', 'torque_12'],
  'Tire rotation': ['socket_set_12', 'floor_jack', 'jack_stands', 'wheel_chocks', 'torque_12', 'tread_depth', 'tire_gauge'],
  'CV axle replacement': [...BASE_KIT, ...LIFT_KIT, 'torque_multiplier', 'pry_bar', 'dead_blow', 'penetrating_oil'],
  'Transmission fluid & filter': [...BASE_KIT, ...LIFT_KIT, 'drain_pan', 'fluid_pump', 'funnel', 'torque_38'],
  'Engine air filter': ['screwdrivers', 'socket_set_14'],
  'Cabin air filter': ['screwdrivers', 'trim_tools'],
  'Check engine light diagnosis': ['obd_scanner', 'multimeter', 'backprobe', 'work_light', 'smoke_machine'],
  'Parasitic draw diagnosis': ['clamp_meter', 'multimeter', 'test_light'],
  'Battery & charging system test': ['multimeter', 'clamp_meter', 'battery_tester'],
  'Compression test': ['compression_tester', 'spark_plug_socket', 'socket_set_38'],
  'Cylinder leak-down test': ['leakdown_tester', 'spark_plug_socket', 'socket_set_38'],
  'HV battery diagnostic / state of health': ['hv_gloves', 'multimeter', 'obd_scanner'],
  'HV battery coolant service': ['hv_gloves', 'drain_pan', 'funnel', 'socket_set_38']
};

/* ---------- resolution ---------- */
function toolsForJob(label, system) {
  let ids = JOB_TOOLS[label];
  if (!ids) {
    // fall back on the system kit, plus the base kit for anything hands-on
    const sys = SYSTEM_TOOLS[system] || [];
    ids = sys.length ? [...new Set([...BASE_KIT, ...sys])] : BASE_KIT;
  }
  const seen = new Set();
  return ids.filter(id => TOOL_LIBRARY[id] && !seen.has(id) && seen.add(id))
    .map(id => ({ id, ...TOOL_LIBRARY[id] }));
}

const KIND_ORDER = ['ppe', 'lift', 'hand', 'power', 'measure', 'specialty', 'fluid', 'consumable'];
const KIND_LABEL = {
  ppe: 'Safety', lift: 'Lifting & support', hand: 'Hand tools', power: 'Power tools',
  measure: 'Measurement & test', specialty: 'Specialty', fluid: 'Fluids & service', consumable: 'Consumables'
};

const BRAND_INFO = {
  icon: { label: 'ICON', url: t => 'https://www.harborfreight.com/catalogsearch/result?q=' + encodeURIComponent('ICON ' + t) },
  milwaukee: { label: 'Milwaukee', url: t => 'https://www.milwaukeetool.com/Products?search=' + encodeURIComponent(t) }
};

let OWNED_TOOLS = new Set();
let PREFERRED_BRANDS = ['icon', 'milwaukee'];

async function loadTools() {
  try {
    const r = await API.get('/tools');
    OWNED_TOOLS = new Set(r.tools.filter(t => t.owned).map(t => t.tool_id));
    PREFERRED_BRANDS = r.preferredBrands?.length ? r.preferredBrands : PREFERRED_BRANDS;
  } catch { /* offline */ }
}

/** The panel shown on a job, a component, or an overdue interval. */
function toolsPanel(label, system, opts = {}) {
  const list = toolsForJob(label, system);
  const groups = KIND_ORDER.map(k => [k, list.filter(t => t.kind === k)]).filter(([, l]) => l.length);
  const missing = list.filter(t => !OWNED_TOOLS.has(t.id));
  const warns = list.filter(t => t.warn);

  return '<div class="card"' + (opts.flat ? ' style="box-shadow:none;padding:0"' : '') + '>' +
    '<div class="between wrap" style="margin-bottom:12px">' +
    '<div><span class="mlabel" style="margin:0">Tools for this job</span>' +
    '<div class="note">' + list.length + ' items · ' + missing.length + ' you have not marked as owned</div></div>' +
    '<div class="row" style="gap:6px">' + PREFERRED_BRANDS.map(b =>
      '<span class="chip">' + esc(BRAND_INFO[b]?.label || b) + '</span>').join('') + '</div></div>' +

    warns.map(t => '<div class="safety" style="margin-bottom:12px"><b>' + esc(t.name) + '</b>' + esc(t.warn) + '</div>').join('') +

    groups.map(([kind, items]) =>
      '<div style="margin-bottom:14px"><span class="mlabel mute">' + KIND_LABEL[kind] + '</span>' +
      items.map(t => toolRow(t)).join('') + '</div>').join('') +

    '<p class="note" style="margin:6px 0 0">Tool <i>types</i>, not part numbers — brand line-ups change and a stale SKU is worse than none. Anything marked "neither" is a tool ICON and Milwaukee do not make; several of those are free to borrow from a parts store\'s loaner programme, which is usually the right answer for a tool you will use twice.</p>' +
    '</div>';
}

function toolRow(t) {
  const owned = OWNED_TOOLS.has(t.id);
  const brands = t.brands.filter(b => PREFERRED_BRANDS.includes(b));
  return '<div class="rowitem" style="padding:10px 0">' +
    '<button class="ico" style="cursor:pointer;background:' + (owned ? '#DEF5EA' : 'var(--primary-l)') +
    ';color:' + (owned ? '#188752' : 'var(--primary)') + '" onclick="toggleTool(\'' + t.id + '\')" ' +
    'title="' + (owned ? 'You own this' : 'Mark as owned') + '">' + ic(owned ? 'check' : 'plus', 18) + '</button>' +
    '<div class="txt"><b>' + esc(t.name) + (t.safety ? ' <span class="chip bad" style="font-size:9px;padding:1px 7px">SAFETY</span>' : '') + '</b>' +
    (t.note ? '<span>' + esc(t.note) + '</span>' : '') +
    (t.alt ? '<span><b style="color:var(--warn)">Neither ICON nor Milwaukee makes this.</b> ' + esc(t.alt) + '</span>' : '') +
    '</div>' +
    '<div class="row" style="gap:6px">' +
    (brands.length
      ? brands.map(b => '<a class="btn xs ghost" target="_blank" rel="noopener" href="' +
        BRAND_INFO[b].url(t.name) + '">' + BRAND_INFO[b].label + '</a>').join('')
      : '<a class="btn xs ghost" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=shop&q=' +
      encodeURIComponent(t.name) + '">Find one</a>') +
    '</div></div>';
}

async function toggleTool(id) {
  const owned = OWNED_TOOLS.has(id);
  if (owned) OWNED_TOOLS.delete(id); else OWNED_TOOLS.add(id);
  try {
    await API.post('/tools', { tool_id: id, owned: owned ? 0 : 1 });
    toast(owned ? 'Removed from your tool list' : TOOL_LIBRARY[id].name + ' marked as owned', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  if (window.rerender) window.rerender();
}

/** Standalone modal, used from the maintenance and records screens. */
function showTools(label, system) {
  openModal(modalHead('Tools — ' + label,
    'Grouped by kind, with your preferred brands first. Tap the circle to record what you already own.') +
    toolsPanel(label, system, { flat: true }), true);
}
