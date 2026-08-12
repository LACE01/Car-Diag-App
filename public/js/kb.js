/* ============================================================
   COMPONENT KNOWLEDGE BASE
   Component names and abbreviations follow SAE J1930 so they match
   what is printed in a factory service manual. Torque values are
   given in lb-ft with N·m in parentheses, per normal FSM practice.

   These are sample values for a representative full-size truck.
   In production the per-VIN figures come from a licensed provider
   (TecRMI / HaynesPro / MOTOR) and replace the `specs` and `tq`
   arrays wholesale — nothing else about this file changes.
   ============================================================ */
const KB = {
  master_cylinder: {
    s: 'Brakes', n: 'Master cylinder', safety: 'lift',
    fn: 'Converts pedal force into hydraulic pressure and splits it across two independent circuits, so a leak in one still leaves you braking on the other.',
    specs: [['Bore', '1.00 in'], ['Circuits', 'Dual, diagonal split'], ['Fluid', 'DOT 3'], ['Reservoir', 'Two chambers, translucent']],
    tq: [['MC to booster nuts', '21 lb-ft (28 N·m)'], ['Brake line fittings', '13 lb-ft (18 N·m)'], ['Reservoir bolt', '9 lb-ft (12 N·m)']],
    test: [['Hold the pedal 30 seconds', 'It should not sink. A slow drop means internal bypass.'], ['Bench bleed before install', 'Required — air trapped in the bore will not come out on the car.'], ['Inspect the booster face', 'Fluid there means the rear seal has failed.']],
    fail: ['Internal seal bypass — pedal slowly sinks under steady foot pressure with no visible leak', 'Fluid weeping into the booster, usually blamed on the booster itself', 'Reservoir grommets harden and seep at the base'],
    q: 'brake master cylinder'
  },
  booster: {
    s: 'Brakes', n: 'Vacuum booster',
    fn: 'Multiplies pedal effort using engine vacuum acting on a large diaphragm.',
    specs: [['Type', 'Dual diaphragm'], ['Vacuum required', '17–21 in-Hg at idle'], ['Check valve', 'One-way, at the vacuum port']],
    tq: [['Booster to firewall nuts', '21 lb-ft (28 N·m)'], ['Pushrod clevis nut', '18 lb-ft (24 N·m)']],
    test: [['Engine off, pump the pedal 5 times', 'Pedal should go firm and stay firm.'], ['Hold the pedal down, then start the engine', 'It should drop noticeably. If not, there is no assist.'], ['Listen for a hiss at the pedal', 'Points at a leaking diaphragm or check valve.']],
    fail: ['Hard pedal with normal fluid — usually the check valve, not the booster', 'Engine stumbles when you brake, from a diaphragm leak pulling air into the intake'],
    q: 'brake booster'
  },
  caliper: {
    s: 'Brakes', n: 'Front caliper & rotor', safety: 'lift',
    fn: 'Clamps the pads onto the rotor. A floating caliper lets one piston squeeze both sides by sliding on greased guide pins.',
    specs: [['Piston', 'Single, floating'], ['Rotor diameter', '13.0 in'], ['New thickness', '1.06 in (26.9 mm)'], ['Discard thickness', '0.98 in (24.9 mm)'], ['Max lateral runout', '0.002 in (0.05 mm)'], ['Pad minimum', '3 mm']],
    tq: [['Guide pin bolts', '31 lb-ft (42 N·m)'], ['Caliper bracket to knuckle', '129 lb-ft (175 N·m)'], ['Banjo bolt', '37 lb-ft (50 N·m)'], ['Wheel nuts', '140 lb-ft (190 N·m)']],
    test: [['Rotor thickness', 'Measure at four points, an inch in from the edge.'], ['Lateral runout', 'Dial indicator against the friction face.'], ['Pad taper', 'More than 2 mm inner-to-outer difference means a seized guide pin.']],
    fail: ['Seized guide pins — the inner pad wears at twice the rate of the outer', 'Torn piston boot, corrosion behind it, caliper drags and the wheel runs hot', 'Rust jacking under the pad backing plate on salted roads'],
    q: 'front brake caliper rotor'
  },
  drum: {
    s: 'Brakes', n: 'Rear drum assembly', safety: 'lift',
    fn: 'Two shoes forced outward against the inside of a spinning drum. Self-energising, which is why the parking brake usually lives here.',
    specs: [['Drum diameter', '10.0 in'], ['Max diameter', '10.06 in'], ['Lining minimum', '0.03 in above the rivets'], ['Adjustment', 'Self-adjusting on reverse stops']],
    tq: [['Wheel cylinder bolts', '13 lb-ft (18 N·m)'], ['Backing plate bolts', '133 lb-ft (180 N·m)'], ['Bleeder screw', '9 lb-ft (12 N·m)']],
    test: [['Drum inside diameter', 'Measure at three points to catch out-of-round.'], ['Wheel cylinder', 'Peel the boot back — any fluid behind it and it is finished.'], ['Shoe contact pattern', 'Even wear across the lining, no glazing.']],
    fail: ['Wheel cylinder weeps and soaks the linings, giving a pull under braking', 'Self-adjuster seizes, pedal travel gets long and the parking brake goes slack'],
    q: 'rear brake drum shoes'
  },
  prop_valve: {
    s: 'Brakes', n: 'Combination / proportioning valve',
    fn: 'Limits pressure to the rear brakes above a set point so the light rear end does not lock before the front. Also carries the pressure-differential switch that lights the brake tell-tale.',
    specs: [['Split point', '~450 psi'], ['Slope after split', '0.30'], ['Type', 'Load-sensing on some trims']],
    tq: [['Mounting bolts', '18 lb-ft (24 N·m)'], ['Line fittings', '13 lb-ft (18 N·m)']],
    test: [['Gauges front and rear', 'Rear pressure should flatten above the split point.'], ['Hard stop on dry pavement', 'The rear should never lock before the front.']],
    fail: ['Stuck open — the rear locks early and the back end steps out under hard braking', 'Corroded fittings that round off the moment a flare wrench touches them'],
    q: 'brake proportioning valve'
  },
  abs_module: {
    s: 'Brakes', n: 'EBCM / ABS hydraulic unit',
    fn: 'Pulses individual wheel circuits when a wheel speed sensor sees a wheel slowing faster than the vehicle.',
    specs: [['Channels', '4'], ['WSS type', 'Active, two-wire'], ['Air gap', '0.020–0.043 in'], ['Comms', 'CAN to the ECM']],
    tq: [['Modulator bracket bolts', '16 lb-ft (22 N·m)'], ['Brake pipe fittings', '13 lb-ft (18 N·m)'], ['WSS bolt', '13 lb-ft (18 N·m)']],
    test: [['WSS output', '0.4–1.2 V AC while spinning the wheel by hand.'], ['Scan tool at a steady 20 mph', 'Compare all four wheel speeds — the one reading zero is your corner.'], ['Connector', 'Check for green corrosion, worse after washing.']],
    fail: ['Rusted tone ring under a press-fit bearing, giving an intermittent low-speed fault', 'Connector corrosion at the sensor', 'Module internal valve sticking after long storage'],
    q: 'ABS module wheel speed sensor'
  },

  radiator: {
    s: 'Cooling', n: 'Radiator',
    fn: 'Moves heat from the coolant into the air. Hot coolant enters the top tank, falls through the core, and leaves the bottom cooler.',
    specs: [['Core', 'Aluminium, two-row'], ['Cap pressure', '15 psi (103 kPa)'], ['Coolant', 'OAT, orange, 50/50'], ['System capacity', '~14.0 qt (13.2 L)']],
    tq: [['Radiator mounting bolts', '89 lb-in (10 N·m)'], ['Trans cooler fittings', '20 lb-ft (27 N·m)'], ['Drain cock', 'hand tight']],
    test: [['Pressure test', '15 psi held for 15 minutes with no drop.'], ['Infrared scan', 'Even top-to-bottom gradient. Cold patches mean blocked tubes.'], ['Cap', 'Should release within 10% of its rating.']],
    fail: ['Plastic end tank cracks at the crimp, almost always on the hot side', 'Internal trans cooler failure mixing ATF into the coolant — a pink milkshake in the reservoir', 'Fins packed with bugs and debris: fine at speed, overheats in traffic'],
    q: 'radiator'
  },
  thermostat: {
    s: 'Cooling', n: 'Thermostat',
    fn: 'Blocks flow to the radiator until the engine reaches operating temperature, then opens progressively.',
    specs: [['Opens at', '187 °F (86 °C)'], ['Fully open', '207 °F (97 °C)'], ['Normal running', '195–220 °F']],
    tq: [['Housing bolts', '18 lb-ft (24 N·m)'], ['ECT sensor', '15 lb-ft (20 N·m)']],
    test: [['Pan of water on a stove', 'Should crack open within a few degrees of its rating.'], ['Two-hose feel test', 'The upper hose stays cold until it opens, then goes hot quickly.'], ['Scan tool ECT PID', 'Should climb steadily and hold, not sawtooth.']],
    fail: ['Stuck closed — rapid overheat with a cold upper hose', 'Stuck open — never reaches temperature, weak heat, and a P0128', 'Installed backwards, or with the jiggle valve at the bottom trapping air'],
    q: 'thermostat'
  },
  water_pump: {
    s: 'Cooling', n: 'Water pump',
    fn: 'Circulates coolant through the block, heads, heater core and radiator. Driven off the crank by the serpentine belt.',
    specs: [['Drive', 'Serpentine belt'], ['Impeller', 'Cast, six vane'], ['Weep hole', 'Bottom of the housing']],
    tq: [['Pump to block bolts', '22 lb-ft (30 N·m)'], ['Pulley bolts', '18 lb-ft (24 N·m)'], ['Tensioner bolt', '37 lb-ft (50 N·m)']],
    test: [['Weep hole', 'Any crust or drip means the seal is done.'], ['Shaft play', 'Rock the pulley. Any wobble and the bearing is going.'], ['Flow', 'Squeeze the upper hose at idle when warm — you should feel pulses.']],
    fail: ['Seal seeps at the weep hole long before it fails outright — that stain is your warning', 'Bearing whine that rises with engine speed, easily blamed on the alternator', 'Eroded impeller on engines run with plain water: flow drops with no leak at all'],
    q: 'water pump'
  },
  heater_core: {
    s: 'Cooling', n: 'Heater core',
    fn: 'A small radiator inside the HVAC case. Cabin air passes over it and picks up engine heat.',
    specs: [['Location', 'Behind the dash, passenger side'], ['Hose sizes', '5/8 in and 3/4 in'], ['Flow', 'Always live, controlled by a blend door']],
    tq: [['Hose clamps', '35 lb-in (4 N·m)'], ['Case screws', '15 lb-in (1.7 N·m)']],
    test: [['Both hoses hot at idle', 'A cold outlet hose means the core is plugged.'], ['Sweet smell in the cabin', 'Coolant leaking inside the case.'], ['Greasy film on the windscreen', 'Same cause.']],
    fail: ['Plugged with stop-leak or scale — heat drops off but nothing leaks', 'Leaks into the passenger footwell, usually noticed first as a damp carpet'],
    q: 'heater core'
  },
  fan: {
    s: 'Cooling', n: 'Cooling fan & shroud',
    fn: 'Pulls air through the radiator when there is not enough natural airflow — idling, crawling, towing.',
    specs: [['Type', 'Clutch driven or electric'], ['Engages at', '~210 °F'], ['Draw', '25–40 A on electric setups']],
    tq: [['Fan clutch to hub', '41 lb-ft (55 N·m)'], ['Shroud bolts', '53 lb-in (6 N·m)']],
    test: [['Cold engine, engine off', 'The fan should turn with moderate drag, not freewheel.'], ['Electric fan', 'Command it on with a scan tool and check current draw.'], ['Constant roar', 'A clutch locked solid.']],
    fail: ['Clutch freewheels — overheats at idle and in traffic but is fine on the highway', 'Relay contacts weld closed on electric setups', 'Cracked or missing shroud, which quietly costs a lot of airflow'],
    q: 'cooling fan clutch'
  },

  fuel_pump: {
    s: 'Fuel', n: 'Fuel pump module (FP)', safety: 'fuel',
    fn: 'In-tank pump, level sender and strainer in one assembly. Feeds the rail at regulated pressure.',
    specs: [['Rail pressure, KOEO', '55–62 psi (379–427 kPa)'], ['Leak-down', 'No more than 5 psi over 5 min'], ['Running draw', '4–8 A'], ['Strainer', 'Serviceable, in tank']],
    tq: [['Lock ring', 'Tap to spec — never a power tool'], ['Quick-connects', 'Snap fit'], ['Tank strap bolts', '33 lb-ft (45 N·m)']],
    test: [['Pressure at the rail', 'KOEO, then again at idle.'], ['Voltage at the FP connector', 'Within 0.5 V of battery under load.'], ['Amp clamp on the pump feed', 'Rising draw means a worn armature.']],
    fail: ['Hot restart failure — starts fine cold, cranks and cranks when warm', 'Pressure fine at idle but drops under load, so the fault only shows on a hill', 'Strainer blocked by tank rust on vehicles run low on fuel for years'],
    q: 'fuel pump assembly'
  },
  fuel_filter: {
    s: 'Fuel', n: 'Filter / pressure regulator', safety: 'fuel',
    fn: 'Filters the supply and holds rail pressure constant, returning surplus fuel to the tank.',
    specs: [['Regulated pressure', '58 psi (400 kPa)'], ['Micron rating', '10'], ['Interval', 'Generic: 30,000 mi']],
    tq: [['Bracket bolt', '89 lb-in (10 N·m)'], ['Quick-connect', 'Snap fit']],
    test: [['Pressure before and after', 'A large drop across the filter means it is blocked.'], ['Vacuum line at the regulator', 'Wet with fuel means a ruptured diaphragm.']],
    fail: ['Blocked filter — fine at idle, falls flat under load', 'Regulator diaphragm leaking fuel into the vacuum line, causing a rich run and hard hot starts'],
    q: 'fuel filter regulator'
  },
  injector: {
    s: 'Fuel', n: 'Fuel injectors', safety: 'fuel',
    fn: 'Solenoid valves that meter fuel into the port or cylinder on a signal from the ECM.',
    specs: [['Flow rate', '~30 lb/hr'], ['Coil resistance', '11.4–12.6 Ω'], ['Idle pulse width', '2.0–3.5 ms'], ['Balance tolerance', '±10% cylinder to cylinder']],
    tq: [['Fuel rail bolts', '89 lb-in (10 N·m)'], ['Retaining clips', 'By hand']],
    test: [['Resistance across each', 'Compare all eight — the outlier is your cylinder.'], ['Injector balance', 'Pressure drop should match within 10% across cylinders.'], ['Stethoscope', 'Even ticking, no silent injector.']],
    fail: ['Clogged tip giving a lean misfire on one cylinder, which shows up as a random misfire code', 'Leaking pintle causing a rich cylinder and hard hot starts', 'Shrunken O-rings letting unmetered air into a port-injected engine'],
    q: 'fuel injectors'
  },
  evap: {
    s: 'Fuel', n: 'EVAP canister & purge solenoid', safety: 'fuel',
    fn: 'Traps fuel vapour from the tank in activated charcoal, then feeds it to the intake when the purge solenoid opens.',
    specs: [['Media', 'Activated charcoal'], ['Purge solenoid', 'Normally closed'], ['Vent valve', 'Normally open'], ['Monitor', 'Cold start, tank 15–85% full']],
    tq: [['Canister bracket', '89 lb-in (10 N·m)'], ['Purge solenoid bracket', '53 lb-in (6 N·m)']],
    test: [['Smoke the system at the service port', 'The only reliable way to find the leak.'], ['Purge solenoid', 'Should hold vacuum closed and flow when commanded.'], ['Fuel cap', 'Cheapest possible cause. Check it first.']],
    fail: ['Loose or cracked fuel cap seal — the classic P0455', 'Purge solenoid stuck open, giving a rough idle and a fuel smell', 'Canister saturated by repeatedly topping off at the pump'],
    q: 'EVAP canister purge valve'
  },
  fuel_tank: {
    s: 'Fuel', n: 'Fuel tank & sender', safety: 'fuel',
    fn: 'Stores fuel and houses the pump module, level sender and vapour lines.',
    specs: [['Capacity', '26 gal (98 L)'], ['Material', 'Steel'], ['Sender output', '40 Ω empty to 250 Ω full']],
    tq: [['Strap bolts', '33 lb-ft (45 N·m)'], ['Shield bolts', '89 lb-in (10 N·m)']],
    test: [['Sender sweep', 'Watch the scan tool as the float arm moves through its range.'], ['Strap corrosion', 'A tank that drops on the highway is somebody\'s very bad day.']],
    fail: ['Sender contacts wear at the level you park at most, so the gauge sticks in one spot', 'Straps rust through on salted roads', 'Internal rust in steel tanks that keeps eating strainers'],
    q: 'fuel tank sending unit'
  },

  w_battery: {
    s: 'Wiring', n: 'Battery (terminal 30)',
    fn: 'Source of unswitched B+ for the whole vehicle. Terminal 30 is the DIN 72552 designation for permanent battery positive; terminal 31 is chassis ground.',
    specs: [['Nominal', '12.6 V at rest, fully charged'], ['Group size', '48'], ['Cold cranking amps', '760 CCA'], ['Terminal 30', 'Permanent B+'], ['Terminal 31', 'Ground / return']],
    tq: [['Terminal clamp nuts', '11 lb-ft (15 N·m)'], ['Hold-down bolt', '13 lb-ft (18 N·m)']],
    test: [['Open circuit voltage', '12.6 V rested = 100%. 12.2 V = 50%.'], ['Load test', 'Hold above 9.6 V for 15 s at half CCA, 70 °F.'], ['Voltage drop, positive cable', 'Below 0.2 V under crank.']],
    fail: ['Corroded terminals causing a voltage drop that looks like a dead starter', 'Internal shorted cell, giving 10.5 V that will not rise on charge', 'Loose hold-down letting the case flex and crack a plate'],
    q: 'car battery group 48'
  },
  w_fuse: {
    s: 'Wiring', n: 'Fuse F12, 15 A',
    fn: 'Sacrificial link sized to the wire, not the load. It protects the harness from melting when a circuit shorts to ground.',
    specs: [['Rating', '15 A'], ['Type', 'ATO / blade'], ['Location', 'Underhood fuse block, position F12'], ['Feeds', 'FP relay contact, terminal 30']],
    tq: [['Fuse block cover', 'hand tight'], ['Block mounting bolts', '89 lb-in (10 N·m)']],
    test: [['Voltage on both blade test points', 'Both should read B+ with the key on. One live, one dead = blown.'], ['Never upsize a fuse', 'A 20 A fuse in a 15 A circuit melts the harness instead of the fuse.'], ['Repeated failures', 'Find the short. A fuse that blows twice is telling you something.']],
    fail: ['Blows on a chafed wire rubbing a bracket, usually intermittent over bumps', 'Corroded blade contacts causing high resistance and a hot fuse block', 'Someone before you fitted the wrong rating'],
    q: 'ATO blade fuse assortment'
  },
  w_relay: {
    s: 'Wiring', n: 'Fuel pump relay',
    fn: 'An electromagnetic switch. A small ECM-controlled current through the coil (terminals 85 and 86) closes the high-current contact between terminals 30 and 87, feeding the pump.',
    specs: [['Terminal 30', 'Common, from fuse F12'], ['Terminal 87', 'Normally open output, to FP'], ['Terminal 85', 'Coil ground, ECM controlled'], ['Terminal 86', 'Coil feed, ignition terminal 15'], ['Coil resistance', '70–120 Ω'], ['Contact rating', '30 A']],
    tq: [['Relay block bolts', '53 lb-in (6 N·m)']],
    test: [['Coil resistance across 85 and 86', '70–120 Ω. Open circuit = failed coil.'], ['Jumper 30 to 87', 'Pump should run. If it does, the fault is upstream of the relay.'], ['Voltage drop across 30 and 87 closed', 'Below 0.2 V. Higher means burnt contacts.']],
    fail: ['Burnt contacts from arcing — works cold, drops out hot', 'Coil open circuit, so nothing happens at all when the key turns', 'Corroded socket terminals spreading and losing contact pressure'],
    q: 'fuel pump relay'
  },
  w_ground: {
    s: 'Wiring', n: 'Ground G104',
    fn: 'The circuit return path to the chassis. Terminal 31 in DIN 72552. Bad grounds cause more phantom electrical faults than any other single thing.',
    specs: [['Designation', 'G104'], ['Location', 'Left frame rail, behind the crossmember'], ['Circuits', 'FP, tank sender, EVAP vent'], ['Max drop', '0.1 V under load']],
    tq: [['Ground stud nut', '13 lb-ft (18 N·m)']],
    test: [['Voltage drop test', 'Meter from the component ground pin to the battery negative post while the circuit is loaded. Over 0.1 V means clean it.'], ['Never test a ground with resistance alone', 'A corroded ground can read 0.3 Ω and still fail under 8 A.'], ['Visual', 'Paint, undercoating or rust under the ring terminal is the usual culprit.']],
    fail: ['Corrosion under the ring terminal from road salt and washing', 'Painted mounting surface never scraped at assembly', 'Loose stud after somebody stacked three more grounds on it'],
    q: 'ground strap ring terminal'
  },
  w_ecm: {
    s: 'Wiring', n: 'ECM (engine control module)',
    fn: 'Controls the relay coil ground on terminal 85. It runs the pump for two seconds at key-on to prime the rail, then only while it sees a crank position signal — which is what stops the pump running after a crash.',
    specs: [['SAE J1930 term', 'ECM'], ['Prime duration', '~2 s at key on'], ['Run condition', 'CKP signal present'], ['Control side', 'Low side, terminal 85']],
    tq: [['ECM bracket bolts', '89 lb-in (10 N·m)'], ['Connector lever', 'Until it clicks fully home']],
    test: [['Back-probe terminal 85', 'Should pull to near 0 V when the ECM commands the pump on.'], ['Scan tool bidirectional', 'Command the FP relay and listen at the filler neck.'], ['Never disconnect the ECM with the key on', 'You will damage drivers.']],
    fail: ['Failed low-side driver — coil never grounds and the pump never runs', 'Water intrusion into the connector, usually from a leaking cowl drain', 'Corroded pins from a previous jump-start done backwards'],
    q: 'engine control module'
  },
  w_connector: {
    s: 'Wiring', n: 'Connector C201',
    fn: 'A serviceable break in the harness. Connector and terminal numbers let a diagram tell you exactly where to put your probe.',
    specs: [['Designation', 'C201'], ['Cavities', '4'], ['Location', 'Left frame rail, forward of the tank'], ['Seal', 'Weather-pack, silicone']],
    tq: [['Locking tab', 'Push until it clicks']],
    test: [['Back-probe, never pierce', 'Piercing the insulation invites corrosion later.'], ['Drag test', 'Pull each terminal with a matching pin. Loose = spread terminal.'], ['Look for green', 'Any verdigris means the seal has failed and both halves need attention.']],
    fail: ['Spread female terminals losing contact pressure over time', 'Failed weather seal letting water wick down the wire', 'Broken lock tab so the halves back out over bumps'],
    q: 'weather pack connector repair kit'
  },

  dtc_P0420: {
    s: 'Diagnosis', n: 'P0420 — Catalyst efficiency',
    fn: 'The downstream HO2S is tracking the upstream sensor too closely, which means the converter is not storing and releasing oxygen the way it should. In most cases the converter is a victim rather than the culprit.',
    specs: [['Monitor', 'Two-trip, catalyst'], ['Trigger', 'Post-HO2S switching mirrors pre-HO2S'], ['Typical freeze frame', '41 mph, 2,180 rpm, 194 °F']],
    tq: [['HO2S', '31 lb-ft (42 N·m)'], ['Converter flange nuts', '37 lb-ft (50 N·m)']],
    test: [['Post-HO2S voltage at steady cruise', 'Should sit near 0.6–0.7 V and barely move.'], ['Compare pre and post waveforms', 'Similar switching rates confirm the converter is not working.'], ['Exhaust backpressure', 'Over 3 psi at 2,500 rpm means it is physically blocked.']],
    fail: ['An upstream misfire cooking the converter — fix the misfire first or you will buy two converters', 'An exhaust leak ahead of the sensor pulling in fresh air', 'A lazy downstream sensor reporting a converter fault that does not exist'],
    q: 'catalytic converter oxygen sensor'
  },
  dtc_P0300: {
    s: 'Diagnosis', n: 'P0300 — Random misfire',
    fn: 'The CKP sensor detected uneven acceleration between firing events on more than one cylinder. Random means the ECM could not pin it to a single cylinder, which usually points at something feeding several at once.',
    specs: [['Threshold', '2% misfire rate over 200 revolutions'], ['Look at', 'Per-cylinder misfire counters'], ['Companion data', 'Fuel trims at idle vs cruise']],
    tq: [['Spark plugs', '11 lb-ft (15 N·m)'], ['Coil bolts', '89 lb-in (10 N·m)'], ['Intake manifold', '44 lb-in (5 N·m) in sequence']],
    test: [['Fuel trims at idle versus 2,500 rpm', 'High at idle only points at a vacuum leak. High everywhere points at fuel delivery.'], ['Compression, all cylinders', 'Within 15% of each other.'], ['Cylinder balance', 'Kill each injector in turn and watch the rpm drop.']],
    fail: ['Vacuum leak at the intake gasket, worst at idle when manifold vacuum is highest', 'A weak fuel pump that only falls short under load', 'On cylinder-deactivation engines, a collapsed lifter'],
    q: 'spark plugs ignition coils intake gasket'
  },
  dtc_P0455: {
    s: 'Diagnosis', n: 'P0455 — Large EVAP leak', safety: 'fuel',
    fn: 'The EVAP monitor could not hold vacuum in the sealed fuel system. Gross leak means roughly a 0.040 in orifice or bigger.',
    specs: [['Monitor conditions', 'Cold start, tank 15–85%'], ['Leak size', '0.040 in or larger'], ['Status', 'Permanent until the monitor passes']],
    tq: [['Fuel cap', 'Click three times'], ['Vent valve bracket', '53 lb-in (6 N·m)']],
    test: [['Smoke the system at the service port', 'The only reliable way to find it.'], ['Fuel cap seal', 'Check for cracking and a missing tether.'], ['Vent valve', 'Should close on command and hold.']],
    fail: ['The fuel cap — check it before you buy anything', 'A cracked vapour line where it runs over the frame rail', 'Vent valve held open by debris, common on trucks that see dirt roads'],
    q: 'EVAP gas cap vent valve'
  }
};
