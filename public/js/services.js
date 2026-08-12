/* ============================================================
   services.js — the service catalogue

   Every entry: [label, category, system]
     category  drives the record's category field
     system    lets a logged service reset the matching interval
               and file itself under the right diagram

   Free text still wins — this is a picker, not a straitjacket.
   Names follow SAE J1930 component terminology where one exists,
   so "HO2S" and "MAF" appear as a technician would write them.
   ============================================================ */
const SERVICES = [
  {
    g: 'Oil & engine',
    items: [
      ['Engine oil & filter change', 'maintenance', 'engine'],
      ['Engine oil & filter — high mileage', 'maintenance', 'engine'],
      ['Oil leak diagnosis', 'inspection', 'engine'],
      ['Valve cover gasket', 'repair', 'engine'],
      ['Oil pan gasket', 'repair', 'engine'],
      ['Front crankshaft seal', 'repair', 'engine'],
      ['Rear main seal', 'repair', 'engine'],
      ['Timing belt replacement', 'maintenance', 'engine'],
      ['Timing belt, water pump & tensioner', 'maintenance', 'engine'],
      ['Timing chain, tensioner & guides', 'repair', 'engine'],
      ['Head gasket replacement', 'repair', 'engine'],
      ['Cylinder head rebuild', 'repair', 'engine'],
      ['Engine replacement', 'repair', 'engine'],
      ['Engine mounts', 'repair', 'engine'],
      ['Intake manifold gasket', 'repair', 'engine'],
      ['Exhaust manifold gasket & studs', 'repair', 'engine'],
      ['PCV valve', 'maintenance', 'engine'],
      ['Serpentine belt', 'maintenance', 'engine'],
      ['Belt tensioner / idler pulley', 'repair', 'engine'],
      ['Harmonic balancer', 'repair', 'engine'],
      ['Compression test', 'inspection', 'engine'],
      ['Cylinder leak-down test', 'inspection', 'engine'],
      ['Carbon cleaning / walnut blast (GDI)', 'maintenance', 'engine']
    ]
  },
  {
    g: 'Cooling',
    items: [
      ['Coolant flush & fill', 'maintenance', 'cooling'],
      ['Thermostat', 'repair', 'cooling'],
      ['Water pump', 'repair', 'cooling'],
      ['Radiator', 'repair', 'cooling'],
      ['Upper radiator hose', 'repair', 'cooling'],
      ['Lower radiator hose', 'repair', 'cooling'],
      ['Heater core', 'repair', 'cooling'],
      ['Cooling fan / fan clutch', 'repair', 'cooling'],
      ['Engine coolant temperature sensor (ECT)', 'repair', 'cooling'],
      ['Radiator cap', 'maintenance', 'cooling'],
      ['Coolant recovery tank', 'repair', 'cooling'],
      ['Cooling system pressure test', 'inspection', 'cooling']
    ]
  },
  {
    g: 'Fuel & air',
    items: [
      ['Engine air filter', 'maintenance', 'engine'],
      ['Cabin air filter', 'maintenance', 'hvac'],
      ['Fuel filter', 'maintenance', 'fuel'],
      ['Fuel pump module', 'repair', 'fuel'],
      ['Fuel injectors — cleaning', 'maintenance', 'fuel'],
      ['Fuel injectors — replacement', 'repair', 'fuel'],
      ['Fuel pressure regulator', 'repair', 'fuel'],
      ['Fuel pressure test', 'inspection', 'fuel'],
      ['Throttle body cleaning', 'maintenance', 'fuel'],
      ['Mass air flow sensor (MAF)', 'repair', 'fuel'],
      ['Fuel tank / sending unit', 'repair', 'fuel'],
      ['EVAP purge solenoid', 'repair', 'fuel'],
      ['EVAP vent valve', 'repair', 'fuel'],
      ['Fuel cap', 'maintenance', 'fuel'],
      ['EVAP smoke test', 'inspection', 'fuel']
    ]
  },
  {
    g: 'Ignition',
    items: [
      ['Spark plugs', 'maintenance', 'engine'],
      ['Ignition coils', 'repair', 'engine'],
      ['Spark plug wires', 'maintenance', 'engine'],
      ['Distributor cap & rotor', 'maintenance', 'engine'],
      ['Knock sensor', 'repair', 'engine'],
      ['Crankshaft position sensor (CKP)', 'repair', 'engine'],
      ['Camshaft position sensor (CMP)', 'repair', 'engine']
    ]
  },
  {
    g: 'Emissions & exhaust',
    items: [
      ['Catalytic converter', 'repair', 'engine'],
      ['Oxygen sensor (HO2S) — upstream', 'repair', 'engine'],
      ['Oxygen sensor (HO2S) — downstream', 'repair', 'engine'],
      ['EGR valve', 'repair', 'engine'],
      ['EGR cooler', 'repair', 'engine'],
      ['Muffler', 'repair', 'engine'],
      ['Exhaust pipe / flex pipe', 'repair', 'engine'],
      ['DPF regeneration or cleaning (diesel)', 'maintenance', 'engine'],
      ['DEF system service (diesel)', 'maintenance', 'engine'],
      ['State inspection / emissions test', 'inspection', 'legal'],
      ['Drive cycle completed', 'inspection', 'legal']
    ]
  },
  {
    g: 'Transmission & driveline',
    items: [
      ['Transmission fluid & filter', 'maintenance', 'trans'],
      ['Transmission fluid flush', 'maintenance', 'trans'],
      ['Transmission rebuild / replacement', 'repair', 'trans'],
      ['Shift solenoid', 'repair', 'trans'],
      ['Transmission mount', 'repair', 'trans'],
      ['Torque converter', 'repair', 'trans'],
      ['Clutch replacement', 'repair', 'trans'],
      ['Flywheel resurface / replacement', 'repair', 'trans'],
      ['Clutch master / slave cylinder', 'repair', 'trans'],
      ['Transfer case fluid', 'maintenance', 'drive'],
      ['Front differential fluid', 'maintenance', 'drive'],
      ['Rear differential fluid', 'maintenance', 'drive'],
      ['Driveshaft / U-joint', 'repair', 'drive'],
      ['CV axle replacement', 'repair', 'drive'],
      ['CV boot replacement', 'repair', 'drive']
    ]
  },
  {
    g: 'Brakes',
    items: [
      ['Front brake pads & rotors', 'repair', 'brakes'],
      ['Rear brake pads & rotors', 'repair', 'brakes'],
      ['Front brake pads only', 'repair', 'brakes'],
      ['Rear brake shoes & drums', 'repair', 'brakes'],
      ['Brake fluid flush', 'maintenance', 'brakes'],
      ['Brake caliper replacement', 'repair', 'brakes'],
      ['Caliper guide pin service', 'maintenance', 'brakes'],
      ['Brake hose replacement', 'repair', 'brakes'],
      ['Brake hard line repair', 'repair', 'brakes'],
      ['Master cylinder', 'repair', 'brakes'],
      ['Brake booster', 'repair', 'brakes'],
      ['ABS module', 'repair', 'brakes'],
      ['Wheel speed sensor', 'repair', 'brakes'],
      ['Parking brake adjustment / cable', 'maintenance', 'brakes'],
      ['Brake inspection & measurement', 'inspection', 'brakes']
    ]
  },
  {
    g: 'Suspension & steering',
    items: [
      ['Struts / shocks — front', 'repair', 'suspension'],
      ['Struts / shocks — rear', 'repair', 'suspension'],
      ['Coil springs', 'repair', 'suspension'],
      ['Control arm / bushings', 'repair', 'suspension'],
      ['Ball joints', 'repair', 'suspension'],
      ['Tie rod ends', 'repair', 'suspension'],
      ['Sway bar links / bushings', 'repair', 'suspension'],
      ['Wheel bearing / hub assembly', 'repair', 'suspension'],
      ['Strut mount / bearing', 'repair', 'suspension'],
      ['Wheel alignment', 'maintenance', 'suspension'],
      ['Power steering fluid flush', 'maintenance', 'suspension'],
      ['Power steering pump', 'repair', 'suspension'],
      ['Steering rack / gearbox', 'repair', 'suspension'],
      ['Idler / pitman arm', 'repair', 'suspension'],
      ['Suspension inspection', 'inspection', 'suspension']
    ]
  },
  {
    g: 'Tires & wheels',
    items: [
      ['Tire rotation', 'tires', 'tires'],
      ['New tires — full set', 'tires', 'tires'],
      ['Tire replacement — single', 'tires', 'tires'],
      ['Tire balance', 'tires', 'tires'],
      ['Flat repair / patch', 'tires', 'tires'],
      ['TPMS sensor replacement', 'tires', 'tires'],
      ['TPMS relearn', 'tires', 'tires'],
      ['Seasonal tire changeover', 'tires', 'tires'],
      ['Wheel / rim repair', 'tires', 'tires'],
      ['Tread depth measurement', 'inspection', 'tires']
    ]
  },
  {
    g: 'Electrical & charging',
    items: [
      ['Battery replacement', 'repair', 'charging'],
      ['Battery & charging system test', 'inspection', 'charging'],
      ['Alternator', 'repair', 'charging'],
      ['Starter', 'repair', 'charging'],
      ['Battery terminals / cables', 'maintenance', 'charging'],
      ['Ground strap repair', 'repair', 'charging'],
      ['Fuse / relay replacement', 'repair', 'charging'],
      ['Wiring harness repair', 'repair', 'charging'],
      ['Parasitic draw diagnosis', 'inspection', 'charging'],
      ['Headlight bulb / assembly', 'repair', 'charging'],
      ['Taillight / brake light', 'repair', 'charging'],
      ['Module programming / relearn', 'repair', 'charging']
    ]
  },
  {
    g: 'HVAC & A/C',
    items: [
      ['A/C evacuate & recharge', 'maintenance', 'hvac'],
      ['A/C compressor', 'repair', 'hvac'],
      ['A/C condenser', 'repair', 'hvac'],
      ['A/C evaporator', 'repair', 'hvac'],
      ['Expansion valve / orifice tube', 'repair', 'hvac'],
      ['A/C leak test', 'inspection', 'hvac'],
      ['Receiver drier / accumulator', 'repair', 'hvac'],
      ['Blower motor', 'repair', 'hvac'],
      ['Blower motor resistor', 'repair', 'hvac'],
      ['Blend door actuator', 'repair', 'hvac']
    ]
  },
  {
    g: 'Body, glass & interior',
    items: [
      ['Windshield wipers', 'maintenance', 'body'],
      ['Windshield chip repair', 'bodywork', 'body'],
      ['Windshield replacement', 'bodywork', 'body'],
      ['Door lock actuator', 'repair', 'body'],
      ['Window regulator / motor', 'repair', 'body'],
      ['Mirror replacement', 'bodywork', 'body'],
      ['Collision repair', 'bodywork', 'body'],
      ['Paint / touch-up', 'bodywork', 'body'],
      ['Rust repair', 'bodywork', 'body'],
      ['Undercoating / rustproofing', 'maintenance', 'body'],
      ['Sunroof drain cleaning', 'maintenance', 'body'],
      ['Interior trim repair', 'bodywork', 'body'],
      ['Key fob battery / programming', 'maintenance', 'body']
    ]
  },
  {
    g: 'Diagnostics & inspection',
    items: [
      ['Check engine light diagnosis', 'inspection', 'diagnostics'],
      ['Scan / trouble code read', 'inspection', 'diagnostics'],
      ['Multi-point inspection', 'inspection', 'diagnostics'],
      ['Pre-purchase inspection', 'inspection', 'diagnostics'],
      ['Noise / vibration diagnosis', 'inspection', 'diagnostics'],
      ['Electrical diagnosis', 'inspection', 'diagnostics'],
      ['Smoke test', 'inspection', 'diagnostics'],
      ['Road test', 'inspection', 'diagnostics'],
      ['Fluid leak inspection', 'inspection', 'diagnostics']
    ]
  },
  {
    g: 'EV & hybrid',
    items: [
      ['HV battery diagnostic / state of health', 'inspection', 'ev'],
      ['HV battery coolant service', 'maintenance', 'cooling'],
      ['Inverter coolant service', 'maintenance', 'cooling'],
      ['Reduction gear fluid', 'maintenance', 'drive'],
      ['Charge port / cable service', 'repair', 'ev'],
      ['12 V auxiliary battery', 'repair', 'charging'],
      ['Brake caliper service (low-regen wear)', 'maintenance', 'brakes'],
      ['Software / OTA update', 'maintenance', 'ev']
    ]
  },
  {
    g: 'Modifications & accessories',
    items: [
      ['Lift / leveling kit', 'modification', 'suspension'],
      ['Suspension upgrade', 'modification', 'suspension'],
      ['ECU tune / flash', 'modification', 'engine'],
      ['Intake upgrade', 'modification', 'engine'],
      ['Exhaust upgrade', 'modification', 'engine'],
      ['Hitch / towing package', 'modification', 'body'],
      ['Roof rack', 'modification', 'body'],
      ['Lighting upgrade', 'modification', 'charging'],
      ['Audio install', 'modification', 'body'],
      ['Window tint', 'modification', 'body']
    ]
  },
  {
    g: 'Recall, warranty & admin',
    items: [
      ['Recall remedy performed', 'recall', 'legal'],
      ['TSB procedure performed', 'repair', 'legal'],
      ['Warranty repair', 'repair', 'legal'],
      ['Registration renewal', 'inspection', 'legal'],
      ['Detailing / wash', 'maintenance', 'body']
    ]
  }
];

/** Flat lookup: label -> [category, system] */
const SERVICE_INDEX = (() => {
  const m = new Map();
  for (const grp of SERVICES) for (const [label, cat, sys] of grp.items) m.set(label, { cat, sys, group: grp.g });
  return m;
})();

function serviceCount() { return SERVICE_INDEX.size; }

/** Grouped <select> that fills a text field and its category select. */
function serviceSelect(id, textId, catId) {
  return '<select class="inp" id="' + id + '" onchange="applyService(this.value,\'' + textId + '\',\'' + catId + '\')">' +
    '<option value="">Browse ' + serviceCount() + ' services…</option>' +
    SERVICES.map(g => '<optgroup label="' + esc(g.g) + '">' +
      g.items.map(i => '<option value="' + esc(i[0]) + '">' + esc(i[0]) + '</option>').join('') +
      '</optgroup>').join('') + '</select>';
}

/** Type-ahead over every service name, so free text and the list coexist. */
function serviceDatalist(id) {
  return '<datalist id="' + id + '">' +
    SERVICES.flatMap(g => g.items.map(i => '<option value="' + esc(i[0]) + '">' + esc(g.g) + '</option>')).join('') +
    '</datalist>';
}

function applyService(label, textId, catId) {
  if (!label) return;
  const t = document.getElementById(textId);
  if (t) t.value = label;
  const meta = SERVICE_INDEX.get(label);
  const c = catId && document.getElementById(catId);
  if (c && meta) {
    const opt = [...c.options].find(o => o.value === meta.cat);
    if (opt) c.value = meta.cat;
  }
  const hint = document.getElementById(textId + '-hint');
  if (hint && meta) hint.textContent = meta.group + ' · files as ' + meta.cat;
}
