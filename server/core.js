/* ============================================================
   core.js — pure domain logic. No I/O, no express, no sqlite.
   Intervals, unit math, fuel economy, warranty status, DTC decode.
   This is the packages/core of the framework spec.
   ============================================================ */

/* ---------- units ---------- */
export const U = {
  galToL: g => g * 3.785411784,
  miToKm: m => m * 1.609344,
  mpgToL100: mpg => 235.214583 / mpg,
  lbftToNm: t => t * 1.3558179483,
  fToC: f => (f - 32) * 5 / 9,
  psiToKpa: p => p * 6.89475729
};

export const IRS_MILEAGE_RATE = {           // USD per mile, business use
  2023: 0.655, 2024: 0.67, 2025: 0.70, 2026: 0.70
};
export function irsRate(year) {
  const y = Number(year);
  return IRS_MILEAGE_RATE[y] ?? IRS_MILEAGE_RATE[Math.max(...Object.keys(IRS_MILEAGE_RATE).map(Number))];
}

/* ---------- default maintenance schedule ----------
   Generic intervals. `severe` halves (or applies severe_factor to)
   the mileage leg — the single thing most apps get wrong.
   Triggers fire on miles OR time, whichever comes first.
   -------------------------------------------------------------- */
export const DEFAULT_SCHEDULE = [
  { name: 'Engine oil & filter',        system: 'engine',   miles: 5000,   months: 6,   severe: 0.5,  cost: 65,  note: 'Check the door jamb or manual for viscosity and the API/ILSAC spec. Oil-life % from the ECU overrides this when available.' },
  { name: 'Tire rotation',              system: 'tires',    miles: 7500,   months: 6,   severe: 0.7,  cost: 25,  note: 'Log tread depth at the same time — that is what turns this into a real inspection record.' },
  { name: 'Engine air filter',          system: 'engine',   miles: 30000,  months: 36,  severe: 0.5,  cost: 30,  note: 'Halve it on dusty, gravel or heavy-idle duty.' },
  { name: 'Cabin air filter',           system: 'hvac',     miles: 20000,  months: 12,  severe: 0.6,  cost: 25,  note: 'Restricted airflow shows up first as weak defrost.' },
  { name: 'Brake fluid',                system: 'brakes',   miles: 45000,  months: 36,  severe: 0.7,  cost: 110, note: 'Time-based more than mileage-based. DOT 3/4 is hygroscopic — over 3% water and the boiling point falls off a cliff.' },
  { name: 'Transmission fluid',         system: 'trans',    miles: 60000,  months: 60,  severe: 0.5,  cost: 240, note: 'Severe duty roughly halves this. Towing, mountains, or stop-and-go all count as severe.' },
  { name: 'Coolant',                    system: 'cooling',  miles: 100000, months: 60,  severe: 0.6,  cost: 130, note: 'Use the specified chemistry — mixing OAT and IAT drops it out of suspension.' },
  { name: 'Spark plugs',                system: 'engine',   miles: 100000, months: 96,  severe: 0.6,  cost: 180, note: 'Iridium/platinum long-life figure. Copper plugs are a third of this.' },
  { name: 'Serpentine belt',            system: 'engine',   miles: 90000,  months: 84,  severe: 0.7,  cost: 140, note: 'Inspect for glazing and cracks at every oil change once past 60k.' },
  { name: 'Differential / transfer case', system: 'drive',  miles: 60000,  months: 60,  severe: 0.5,  cost: 160, note: 'Anything towing or wading is severe duty here, no argument.' },
  { name: 'Timing belt',                system: 'engine',   miles: 100000, months: 84,  severe: 0.85, cost: 900, note: 'INTERFERENCE ENGINE RISK: on an interference design, a snapped belt bends valves. Verify whether yours is belt or chain before ignoring this.', critical: true },
  { name: 'Brake inspection',           system: 'brakes',   miles: 15000,  months: 12,  severe: 0.6,  cost: 0,   note: 'Measure pad thickness and rotor thickness and log the numbers, not "looks fine".' },
  { name: 'State inspection / emissions', system: 'legal',  miles: null,   months: 12,  severe: 1,    cost: 40,  note: 'All readiness monitors must be complete or you will fail before they even look at the car.' }
];

export const EV_SCHEDULE = [
  { name: 'Tire rotation',       system: 'tires',   miles: 7500,   months: 6,  severe: 0.7, cost: 25,  note: 'EVs are heavy and torque-rich; rotation matters more, not less.' },
  { name: 'Cabin air filter',    system: 'hvac',    miles: 20000,  months: 12, severe: 0.6, cost: 25,  note: '' },
  { name: 'Brake fluid',         system: 'brakes',  miles: 45000,  months: 36, severe: 0.7, cost: 110, note: 'Regen means the pads barely wear — which is exactly why the fluid and the calipers get neglected.' },
  { name: 'Brake caliper service', system: 'brakes', miles: 25000, months: 24, severe: 0.7, cost: 90, note: 'Low friction use lets guide pins seize. Clean and lubricate on a schedule.' },
  { name: 'Coolant (battery / power electronics)', system: 'cooling', miles: 100000, months: 60, severe: 0.7, cost: 200, note: 'HV SAFETY: thermal loop work can route near orange HV cabling. Service disconnect procedure applies.' , critical: true },
  { name: 'Reduction gear fluid', system: 'drive',  miles: 100000, months: 96, severe: 0.6, cost: 150, note: '' },
  { name: 'State inspection',    system: 'legal',   miles: null,   months: 12, severe: 1,   cost: 40,  note: '' }
];

const MS_DAY = 86400000;

function monthsBetween(fromIso, toDate) {
  if (!fromIso) return null;
  const a = new Date(fromIso), b = toDate;
  if (isNaN(a)) return null;
  return (b - a) / (MS_DAY * 30.4375);
}

/**
 * Compute due status for one reminder.
 * Returns whichever leg (miles or time) is furthest along — "first to trigger wins".
 */
export function reminderStatus(rem, vehicle, today = new Date()) {
  const severe = vehicle.duty === 'severe';
  const factor = severe ? (rem.severe_factor ?? 0.5) : 1;
  const intMiles = rem.interval_miles ? Math.round(rem.interval_miles * factor) : null;
  const intMonths = rem.interval_months ? Math.round(rem.interval_months * (severe ? Math.max(factor, 0.6) : 1)) : null;

  const legs = [];

  if (intMiles && vehicle.mileage) {
    const base = rem.last_done_miles ?? 0;
    const done = Math.max(0, vehicle.mileage - base);
    legs.push({
      leg: 'miles',
      pct: Math.min(200, Math.round(done / intMiles * 100)),
      remaining: intMiles - done,
      label: intMiles - done >= 0 ? `${fmt(intMiles - done)} mi` : `${fmt(Math.abs(intMiles - done))} mi over`,
      interval: `${fmt(intMiles)} mi`
    });
  }
  if (intMonths) {
    const since = monthsBetween(rem.last_done_date, today);
    if (since != null) {
      const rem_m = intMonths - since;
      legs.push({
        leg: 'time',
        pct: Math.min(200, Math.round(since / intMonths * 100)),
        remaining: rem_m,
        label: rem_m >= 0 ? `${Math.round(rem_m)} mo` : `${Math.round(Math.abs(rem_m))} mo over`,
        interval: `${intMonths} mo`
      });
    }
  }

  // Engine hours — the interval that actually governs a diesel, a work
  // truck that idles, or anything used like equipment. 1 hour of idle is
  // roughly 25–33 miles of engine wear, which is why hour-metered service
  // exists at all.
  if (rem.interval_hours && vehicle.engine_hours) {
    const intHours = Math.round(rem.interval_hours * factor);
    const base = rem.last_done_hours ?? 0;
    const done = Math.max(0, vehicle.engine_hours - base);
    legs.push({
      leg: 'hours',
      pct: Math.min(200, Math.round(done / intHours * 100)),
      remaining: intHours - done,
      label: intHours - done >= 0 ? `${Math.round(intHours - done)} hr` : `${Math.round(Math.abs(intHours - done))} hr over`,
      interval: `${intHours} hr`
    });
  }

  if (!legs.length) {
    return { ...rem, pct: 0, due: 'Needs a baseline', cls: 'grey', driver: null, severe, intMiles, intMonths };
  }

  const driver = legs.reduce((a, b) => (b.pct > a.pct ? b : a));
  const cls = driver.pct >= 100 ? 'bad' : driver.pct >= 85 ? 'warn' : 'ok';
  return {
    ...rem,
    pct: Math.min(100, driver.pct),
    overdue: driver.pct >= 100,
    due: driver.label,
    driver: driver.leg,
    legs,
    cls,
    severe,
    intMiles,
    intMonths
  };
}

function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

/* ---------- warranty ---------- */
export function warrantyStatus(w, vehicle, today = new Date()) {
  const startMiles = w.start_miles || 0;
  const milesUsed = Math.max(0, (vehicle.mileage || 0) - startMiles);
  const milesLeft = w.miles ? w.miles - milesUsed : null;
  let monthsLeft = null;
  if (w.months && w.start_date) {
    const since = monthsBetween(w.start_date, today);
    if (since != null) monthsLeft = w.months - since;
  }
  const expired = (milesLeft != null && milesLeft <= 0) || (monthsLeft != null && monthsLeft <= 0);
  const near = !expired && ((milesLeft != null && milesLeft < 5000) || (monthsLeft != null && monthsLeft < 6));
  return {
    ...w,
    milesLeft, monthsLeft,
    expired, near,
    cls: expired ? 'grey' : near ? 'warn' : 'ok',
    summary: expired
      ? 'Expired'
      : [milesLeft != null ? `${fmt(milesLeft)} mi left` : null,
         monthsLeft != null ? `${Math.round(monthsLeft)} mo left` : null].filter(Boolean).join(' · ') || 'Active'
  };
}

/* ---------- fuel economy ----------
   Tank-to-tank, full-fill method. A partial fill or a flagged missed
   fill breaks the chain: distance accumulates but the volume is only
   counted once a full fill closes the interval. This is the only way
   to get an honest number out of manual entries.
   -------------------------------------------------------------- */
export function computeEconomy(logs, isEV = false) {
  const rows = [...logs]
    .filter(l => l.odometer && l.quantity > 0)
    .sort((a, b) => a.odometer - b.odometer);

  const points = [];
  let carryQty = 0, anchor = null, brokenChain = false;

  for (const l of rows) {
    if (anchor == null) {
      if (!l.partial) { anchor = l; carryQty = 0; }
      continue;
    }
    carryQty += l.quantity;
    if (l.missed_fill) { brokenChain = true; }
    if (l.partial) continue;

    const dist = l.odometer - anchor.odometer;
    if (dist > 0 && carryQty > 0 && !brokenChain) {
      points.push({
        id: l.id,
        date: l.date,
        odometer: l.odometer,
        distance: dist,
        quantity: +carryQty.toFixed(3),
        economy: +(dist / carryQty).toFixed(2),      // mpg, or mi/kWh
        costPerMile: l.total ? +(l.total / dist).toFixed(3) : null,
        pricePerUnit: l.price_per_unit ?? (l.total && l.quantity ? +(l.total / l.quantity).toFixed(3) : null)
      });
    }
    anchor = l; carryQty = 0; brokenChain = false;
  }

  const vals = points.map(p => p.economy);
  const totalDist = points.reduce((s, p) => s + p.distance, 0);
  const totalQty = points.reduce((s, p) => s + p.quantity, 0);
  const spend = rows.reduce((s, l) => s + (l.total || 0), 0);

  return {
    unit: isEV ? 'mi/kWh' : 'mpg',
    points,
    count: points.length,
    average: totalQty ? +(totalDist / totalQty).toFixed(2) : null,
    best: vals.length ? Math.max(...vals) : null,
    worst: vals.length ? Math.min(...vals) : null,
    last: vals.length ? vals[vals.length - 1] : null,
    totalDistance: totalDist,
    totalQuantity: +totalQty.toFixed(2),
    fuelSpend: +spend.toFixed(2),
    trend: trendOf(vals)
  };
}

function trendOf(v) {
  if (v.length < 4) return null;
  const half = Math.floor(v.length / 2);
  const a = avg(v.slice(0, half)), b = avg(v.slice(half));
  const delta = b - a;
  return { delta: +delta.toFixed(2), pct: +(delta / a * 100).toFixed(1), direction: delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'flat' };
}
function avg(a) { return a.reduce((s, x) => s + x, 0) / a.length; }

/* ---------- cost of ownership ---------- */
export function costOfOwnership({ vehicle, service, fuel, expenses, today = new Date() }) {
  const svc = service.reduce((s, r) => s + (r.cost || 0), 0);
  const fue = fuel.reduce((s, r) => s + (r.total || 0), 0);
  const exp = expenses.reduce((s, r) => s + (r.amount || 0), 0);
  const purchase = vehicle.purchase_price || 0;
  const milesOwned = Math.max(0, (vehicle.mileage || 0) - (vehicle.purchase_odometer || 0));
  const running = svc + fue + exp;
  const total = running + purchase - (vehicle.estimated_value || 0);

  let monthsOwned = null;
  if (vehicle.purchase_date) monthsOwned = Math.max(1, monthsBetween(vehicle.purchase_date, today));

  return {
    service: +svc.toFixed(2),
    fuel: +fue.toFixed(2),
    other: +exp.toFixed(2),
    purchase: +purchase.toFixed(2),
    depreciationToDate: vehicle.estimated_value != null ? +(purchase - vehicle.estimated_value).toFixed(2) : null,
    running: +running.toFixed(2),
    total: +total.toFixed(2),
    milesOwned,
    monthsOwned: monthsOwned ? +monthsOwned.toFixed(1) : null,
    costPerMile: milesOwned > 0 ? +(running / milesOwned).toFixed(3) : null,
    trueCostPerMile: milesOwned > 0 ? +(total / milesOwned).toFixed(3) : null,
    costPerMonth: monthsOwned ? +(running / monthsOwned).toFixed(2) : null
  };
}

/* ---------- forecast: next 12 months of scheduled maintenance ---------- */
export function forecast12(reminders, vehicle, milesPerYear = 12000) {
  const today = new Date();
  const out = [];
  for (const r of reminders) {
    const st = reminderStatus(r, vehicle, today);
    if (!st.intMiles && !st.intMonths) continue;
    let hits = 0;
    if (st.intMiles) {
      const doneMiles = Math.max(0, (vehicle.mileage || 0) - (r.last_done_miles ?? 0));
      const untilNext = st.intMiles - doneMiles;
      if (untilNext <= milesPerYear) hits = Math.max(hits, 1 + Math.floor((milesPerYear - Math.max(0, untilNext)) / st.intMiles));
    }
    if (st.intMonths && st.intMonths <= 12) hits = Math.max(hits, Math.floor(12 / st.intMonths));
    else if (st.intMonths && st.overdue) hits = Math.max(hits, 1);
    if (hits > 0) out.push({ name: r.name, times: hits, unit: r.est_cost || 0, cost: +((r.est_cost || 0) * hits).toFixed(2) });
  }
  return { items: out, total: +out.reduce((s, x) => s + x.cost, 0).toFixed(2), assumedMiles: milesPerYear };
}

/* ---------- tires ---------- */
export function tireStatus(set, measurements) {
  const m = [...measurements].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!m) return { ...set, worst: null, cls: 'grey', verdict: 'No measurements logged' };
  const depths = [m.lf, m.rf, m.lr, m.rr].filter(x => x != null);
  if (!depths.length) return { ...set, worst: null, cls: 'grey', verdict: 'No tread depths logged' };
  const worst = Math.min(...depths);
  const spread = Math.max(...depths) - worst;
  const cls = worst <= 2 ? 'bad' : worst <= 4 ? 'warn' : 'ok';
  const verdict = worst <= 2 ? 'At or below the 2/32 legal minimum — replace'
    : worst <= 4 ? '4/32 or less: wet-weather stopping distance is already degraded'
      : spread >= 3 ? 'Uneven wear across the set — check alignment and rotation interval'
        : 'Serviceable';
  // wear rate
  let milesPer32 = null, milesLeft = null;
  const sorted = [...measurements].filter(x => x.odometer).sort((a, b) => a.odometer - b.odometer);
  if (sorted.length >= 2) {
    const f = sorted[0], l = sorted[sorted.length - 1];
    const fw = Math.min(...[f.lf, f.rf, f.lr, f.rr].filter(x => x != null));
    const lw = Math.min(...[l.lf, l.rf, l.lr, l.rr].filter(x => x != null));
    const used = fw - lw, dist = l.odometer - f.odometer;
    if (used > 0 && dist > 0) {
      milesPer32 = Math.round(dist / used);
      milesLeft = Math.round((lw - 2) * milesPer32);
    }
  }
  return { ...set, worst, spread: +spread.toFixed(1), cls, verdict, milesPer32, milesLeft, lastMeasured: m.date, age: dotAge(set.dot_date) };
}

export function dotAge(dot) {
  if (!dot || !/^\d{4}$/.test(String(dot))) return null;
  const s = String(dot);
  const week = +s.slice(0, 2), yy = +s.slice(2);
  const year = yy > 50 ? 1900 + yy : 2000 + yy;
  const made = new Date(year, 0, 1 + (week - 1) * 7);
  const years = (Date.now() - made) / (MS_DAY * 365.25);
  return { year, week, years: +years.toFixed(1), aged: years >= 6, note: years >= 6 ? 'Over six years old — rubber degrades regardless of tread' : null };
}

/* ---------- battery ---------- */
export function batteryStatus(rec) {
  if (!rec) return null;
  const v = rec.rest_voltage;
  let soc = null;
  if (v != null) {
    const table = [[12.66, 100], [12.45, 75], [12.24, 50], [12.06, 25], [11.89, 0]];
    if (v >= 12.66) soc = 100;
    else if (v <= 11.89) soc = 0;
    else {
      for (let i = 0; i < table.length - 1; i++) {
        if (v <= table[i][0] && v > table[i + 1][0]) {
          const [hv, hs] = table[i], [lv, ls] = table[i + 1];
          soc = Math.round(ls + (v - lv) / (hv - lv) * (hs - ls));
          break;
        }
      }
    }
  }
  const ccaPct = rec.cca && rec.measured_cca ? Math.round(rec.measured_cca / rec.cca * 100) : null;
  let age = null;
  if (rec.installed_date) age = +((Date.now() - new Date(rec.installed_date)) / (MS_DAY * 365.25)).toFixed(1);
  const cls = rec.load_test === 'fail' || (ccaPct != null && ccaPct < 65) ? 'bad'
    : rec.load_test === 'marginal' || (ccaPct != null && ccaPct < 80) || (age != null && age >= 4) ? 'warn' : 'ok';
  return { ...rec, soc, ccaPct, age, cls };
}

/* ---------- brakes ---------- */
export function brakeStatus(rows) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted[0];
  const pads = [['LF', last.lf_pad], ['RF', last.rf_pad], ['LR', last.lr_pad], ['RR', last.rr_pad]].filter(x => x[1] != null);
  if (!pads.length) return { last, cls: 'grey', verdict: 'No pad measurements' };
  const worst = pads.reduce((a, b) => (b[1] < a[1] ? b : a));
  const spread = Math.max(...pads.map(p => p[1])) - worst[1];
  const cls = worst[1] <= 3 ? 'bad' : worst[1] <= 5 ? 'warn' : 'ok';
  let verdict = worst[1] <= 3 ? `${worst[0]} at ${worst[1]} mm — at or below the 3 mm minimum`
    : worst[1] <= 5 ? `${worst[0]} at ${worst[1]} mm — plan the job` : 'Serviceable';
  if (spread >= 2) verdict += '. Inner-to-outer spread over 2 mm points at a seized guide pin.';
  // wear rate
  let milesLeft = null;
  const withOdo = [...rows].filter(r => r.odometer).sort((a, b) => a.odometer - b.odometer);
  if (withOdo.length >= 2) {
    const f = withOdo[0], l = withOdo[withOdo.length - 1];
    const fmin = Math.min(...[f.lf_pad, f.rf_pad, f.lr_pad, f.rr_pad].filter(x => x != null));
    const lmin = Math.min(...[l.lf_pad, l.rf_pad, l.lr_pad, l.rr_pad].filter(x => x != null));
    const used = fmin - lmin, dist = l.odometer - f.odometer;
    if (used > 0 && dist > 0) milesLeft = Math.round((lmin - 3) * (dist / used));
  }
  return { last, worst: worst[1], worstCorner: worst[0], spread: +spread.toFixed(1), cls, verdict, milesLeft };
}

/* ---------- DTC decode: SAE J2012 generic set ---------- */
const DTC_SYSTEM = { P: 'Powertrain', C: 'Chassis', B: 'Body', U: 'Network' };
const DTC_SUB = {
  P0: 'Fuel and air metering / auxiliary emission controls',
  P1: 'Fuel and air metering',
  P2: 'Injector circuit / fuel and air metering',
  P3: 'Ignition system or misfire',
  P4: 'Auxiliary emission controls',
  P5: 'Vehicle speed, idle control, auxiliary inputs',
  P6: 'Computer output circuit',
  P7: 'Transmission',
  P8: 'Transmission'
};
export const DTC_LIBRARY = {
  P0011: 'Camshaft position — timing over-advanced or system performance, bank 1',
  P0016: 'Crankshaft / camshaft position correlation, bank 1 sensor A',
  P0101: 'Mass or volume air flow circuit range/performance',
  P0106: 'Manifold absolute pressure / barometric pressure circuit range/performance',
  P0113: 'Intake air temperature sensor 1 circuit high',
  P0128: 'Coolant thermostat — temperature below regulating temperature',
  P0131: 'O2 sensor circuit low voltage, bank 1 sensor 1',
  P0135: 'O2 sensor heater circuit, bank 1 sensor 1',
  P0171: 'System too lean, bank 1',
  P0172: 'System too rich, bank 1',
  P0174: 'System too lean, bank 2',
  P0300: 'Random / multiple cylinder misfire detected',
  P0301: 'Cylinder 1 misfire detected',
  P0302: 'Cylinder 2 misfire detected',
  P0303: 'Cylinder 3 misfire detected',
  P0304: 'Cylinder 4 misfire detected',
  P0325: 'Knock sensor 1 circuit, bank 1',
  P0335: 'Crankshaft position sensor A circuit',
  P0340: 'Camshaft position sensor A circuit, bank 1',
  P0401: 'Exhaust gas recirculation flow insufficient',
  P0420: 'Catalyst system efficiency below threshold, bank 1',
  P0430: 'Catalyst system efficiency below threshold, bank 2',
  P0440: 'Evaporative emission system',
  P0442: 'Evaporative emission system leak detected (small leak)',
  P0455: 'Evaporative emission system leak detected (gross leak)',
  P0456: 'Evaporative emission system leak detected (very small leak)',
  P0500: 'Vehicle speed sensor A',
  P0505: 'Idle air control system',
  P0507: 'Idle air control system RPM higher than expected',
  P0605: 'Internal control module read only memory error',
  P0700: 'Transmission control system (MIL request)',
  P0740: 'Torque converter clutch circuit malfunction',
  C0035: 'Left front wheel speed sensor circuit',
  C0040: 'Right front wheel speed sensor circuit',
  C0045: 'Left rear wheel speed sensor circuit',
  C0050: 'Right rear wheel speed sensor circuit',
  B0001: 'Driver frontal stage 1 deployment control',
  U0100: 'Lost communication with ECM/PCM A',
  U0101: 'Lost communication with TCM',
  U0121: 'Lost communication with ABS control module'
};

export function decodeDTC(code) {
  const c = String(code || '').toUpperCase().trim();
  if (!/^[PCBU][0-3][0-9A-F]{3}$/.test(c)) return { code: c, valid: false, description: 'Unrecognised code format (expected e.g. P0420)' };
  const sys = DTC_SYSTEM[c[0]];
  const generic = c[1] === '0' || c[1] === '2' || (c[0] === 'P' && c[1] === '3');
  return {
    code: c,
    valid: true,
    system: sys,
    scope: generic ? 'Generic (SAE J2012)' : 'Manufacturer-specific',
    subsystem: DTC_SUB[c.slice(0, 2)] || null,
    description: DTC_LIBRARY[c] || (generic
      ? `${sys} code, ${DTC_SUB[c.slice(0, 2)] || 'subsystem'} — full text is in the SAE J2012 generic set`
      : `${sys} manufacturer-specific code — definition comes from the OEM, not the generic set`),
    severity: /^P03/.test(c) ? 'high' : /^(B0001|B00)/.test(c) ? 'safety' : /^P04(2|3)/.test(c) ? 'medium' : 'normal',
    safetyNote: c.startsWith('B') ? 'SRS/airbag content — never probe or command SRS circuits without disabling the system and waiting the specified discharge time.' : null
  };
}

/* ---------- fuel trim interpretation ---------- */
export function interpretFuelTrim({ stftIdle, ltftIdle, stftCruise, ltftCruise }) {
  const idle = (stftIdle ?? 0) + (ltftIdle ?? 0);
  const cruise = (stftCruise ?? 0) + (ltftCruise ?? 0);
  const out = { idle: +idle.toFixed(1), cruise: +cruise.toFixed(1), findings: [] };
  const lean = v => v > 10, rich = v => v < -10;

  if (lean(idle) && !lean(cruise)) out.findings.push({ verdict: 'Vacuum leak', why: 'Lean at idle but normal at cruise. A fixed-size leak is a big fraction of airflow at idle and a small one at cruise. Smoke-test the intake, check the PCV and brake booster hose.' });
  else if (lean(idle) && lean(cruise)) out.findings.push({ verdict: 'Fuel delivery or unmetered air upstream', why: 'Lean everywhere. Check fuel pressure under load, a dirty MAF, or a leak upstream of the sensor.' });
  else if (!lean(idle) && lean(cruise)) out.findings.push({ verdict: 'Fuel volume shortfall under load', why: 'Fine at idle, lean at cruise. A weak pump or restricted filter can hold pressure at idle and fall short at demand.' });
  else if (rich(idle) || rich(cruise)) out.findings.push({ verdict: 'Rich condition', why: 'Negative trims mean the ECM is pulling fuel out. Look at leaking injectors, high fuel pressure, or a contaminated MAF reading high.' });
  else out.findings.push({ verdict: 'Trims within normal range', why: 'Total trim inside ±10% at both idle and cruise is normal on a healthy engine.' });

  if (Math.abs(idle - cruise) > 15) out.findings.push({ verdict: 'Load-dependent fault', why: 'Large split between idle and cruise trims. The fault changes with airflow — that is the useful clue.' });
  return out;
}

/* ============================================================
   ATTENTION MODEL

   The point of this app is not to list everything it knows. It is to
   sort what it knows by whether it can hurt you, and to keep the
   source and the confidence attached to every line so the user can
   tell the difference between "NHTSA opened an investigation into
   this exact component" and "31 strangers mentioned steering".

     critical  unremedied safety recall, open federal investigation,
               or a fault on a brake / steering / airbag / fire path
     high      pending or permanent DTC, overdue on time AND mileage,
               failed battery test, tires at the legal limit
     medium    repeated complaint cluster, TSB matching a live symptom,
               economy trend falling hard, warranty about to lapse
     info      routine upcoming maintenance, broad complaint patterns,
               safety-rating context

   Confidence is deliberately separate from severity. A high-severity
   item with low confidence is still worth showing — it just must not
   be phrased as fact.
   ============================================================ */
export const SAFETY_CRITICAL = /brake|steering|air ?bag|srs|restraint|fuel|fire|throttle|accelerat|tire|wheel|suspension|seat belt|structure/i;

const RANK = { critical: 0, high: 1, medium: 2, info: 3 };

export function scoreAttention({ vehicle, recalls = [], investigations = [], reminders = [], dtcs = [],
  battery, brakes, tires = [], warranties = [], documents = [], complaints = [],
  communications = [], economy, epaCompare, weather = [] }) {
  const items = [];
  const add = (o) => items.push({ vehicle_id: vehicle.id, ...o });

  /* ---- critical ---- */
  for (const r of recalls) {
    if (r.completion_status === 'verified' || r.dismissed) continue;
    const owner = r.completion_status === 'owner_marked_complete';
    add({
      level: 'critical', kind: 'recall',
      title: `Safety recall ${r.campaign}`,
      body: String(r.component || '').split(':')[0] +
        (owner ? ' — you marked this done, but it has not been verified against your VIN.' : ' — no remedy recorded.'),
      why: 'A recall is the manufacturer conceding a safety defect. The remedy is free at any franchised dealer regardless of age, mileage or where the vehicle was bought.',
      source: 'NHTSA recalls API',
      confidence: 'campaign applies to this year/make/model — VIN-level completion is unverified',
      action: 'Verify by VIN at nhtsa.gov/recalls',
      ref: { type: 'recall', id: r.id }
    });
  }

  for (const inv of investigations) {
    add({
      level: 'critical', kind: 'investigation',
      title: `Active federal investigation ${inv.number || ''}`.trim(),
      body: [inv.component, inv.summary].filter(Boolean).join(' — ').slice(0, 300),
      why: 'NHTSA opened this because a pattern showed up across the vehicle line. It is not a finding of a defect and not a recall, but it is usually the earliest public warning that something systemic exists.',
      source: 'NHTSA investigations',
      confidence: 'vehicle line, not your specific VIN',
      action: null,
      ref: { type: 'investigation', id: inv.number }
    });
  }

  /* ---- high ---- */
  for (const t of dtcs) {
    if (t.cleared_at) continue;
    const safety = SAFETY_CRITICAL.test(t.description || '') || /^[BC]/.test(t.code);
    add({
      level: safety ? 'critical' : 'high', kind: 'dtc',
      title: `${t.code} — ${t.status}`,
      body: (t.description || '') + (t.clear_count >= 2
        ? ` You have cleared this ${t.clear_count} times and it keeps returning.` : ''),
      why: t.status === 'permanent'
        ? 'A permanent code cannot be cleared with a scan tool. It only goes away when its monitor runs and passes — which is exactly why it exists.'
        : 'A stored code means the ECM recorded a fault it could confirm. The freeze frame attached to it is the most useful diagnostic evidence you have.',
      source: 'OBD-II scan, SAE J2012',
      confidence: 'read directly from the vehicle — this is the highest-confidence data in the app',
      action: 'Open Diagnose',
      ref: { type: 'dtc', id: t.id }
    });
  }

  for (const r of reminders) {
    if (!r.overdue) continue;
    const bothLegs = (r.legs || []).filter(l => l.pct >= 100).length >= 2;
    const critical = /timing belt/i.test(r.name) || /brake/i.test(r.name);
    add({
      level: critical || bothLegs ? 'high' : 'medium', kind: 'maintenance',
      title: `${r.name} overdue`,
      body: `${r.due} past the ${r.driver === 'time' ? 'time' : r.driver === 'hours' ? 'engine-hour' : 'mileage'} interval` +
        (r.severe ? ', on the severe-duty schedule' : '') +
        (bothLegs ? '. Both the time and mileage legs have passed.' : '.'),
      why: /timing belt/i.test(r.name)
        ? 'On an interference engine a snapped belt drives pistons into open valves. The repair bill is an engine, not a belt.'
        : 'Intervals exist because the failure mode past them is expensive, not because the manufacturer wanted the shop visit.',
      source: r.source === 'generic' ? 'generic interval, adjusted for your duty cycle' : 'your own interval',
      confidence: r.source === 'generic'
        ? 'generic schedule — the OEM figure for your VIN may differ' : 'set by you',
      action: 'Mark done',
      ref: { type: 'reminder', id: r.id }
    });
  }

  if (battery && battery.cls === 'bad') {
    add({
      level: 'high', kind: 'battery',
      title: 'Battery failed its last test',
      body: [battery.soc != null ? `${battery.soc}% state of charge` : null,
      battery.ccaPct != null ? `${battery.ccaPct}% of rated CCA` : null,
      battery.age != null ? `${battery.age} years old` : null].filter(Boolean).join(' · '),
      why: 'A weak battery does not just fail to start the car. Low system voltage makes modules behave erratically and produces trouble codes that lead people to replace expensive parts that were never faulty.',
      source: 'your logged test',
      confidence: 'measured',
      action: 'Log a new test',
      ref: { type: 'battery' }
    });
  }

  for (const t of tires) {
    if (!t.active) continue;
    if (t.worst != null && t.worst <= 2) {
      add({
        level: 'critical', kind: 'tires',
        title: `Tires at ${t.worst}/32 — at or below the legal minimum`,
        body: t.verdict,
        why: 'At 2/32 the tread can no longer clear water. Wet braking distance and hydroplaning resistance are both far past the point of being recoverable by careful driving.',
        source: 'your measurement', confidence: 'measured', action: null, ref: { type: 'tires', id: t.id }
      });
    } else if (t.worst != null && t.worst <= 4) {
      add({
        level: 'high', kind: 'tires', title: `Tires down to ${t.worst}/32`, body: t.verdict,
        why: 'Wet stopping distance degrades sharply below 4/32, well before the legal limit.',
        source: 'your measurement', confidence: 'measured', action: null, ref: { type: 'tires', id: t.id }
      });
    }
    if (t.age?.aged) {
      add({
        level: 'medium', kind: 'tires', title: `Tires are ${t.age.years} years old`,
        body: t.age.note, why: 'Rubber oxidises and hardens regardless of tread depth. Sidewall failure on an old tire at highway speed is a different kind of event from a slow puncture.',
        source: 'DOT date code', confidence: 'from the sidewall', action: null, ref: { type: 'tires', id: t.id }
      });
    }
  }

  if (brakes && brakes.cls === 'bad') {
    add({
      level: 'critical', kind: 'brakes', title: 'Brake pads at or below minimum',
      body: brakes.verdict,
      why: 'Below 3 mm there is very little friction material left before the backing plate reaches the rotor, and the rotor is the expensive part.',
      source: 'your measurement', confidence: 'measured', action: null, ref: { type: 'brakes' }
    });
  }

  /* ---- medium ---- */
  for (const w of warranties) {
    if (w.near) add({
      level: 'medium', kind: 'warranty', title: `${w.label} expires soon`, body: w.summary,
      why: 'Anything you have been putting off is cheaper now than the week after this lapses.',
      source: 'your recorded terms', confidence: 'as entered — check your actual in-service date',
      action: 'Review coverage', ref: { type: 'warranty', id: w.id }
    });
  }

  for (const doc of documents) {
    if (!doc.expires_date) continue;
    const days = Math.round((new Date(doc.expires_date) - Date.now()) / 86400000);
    if (days < 0) add({
      level: 'high', kind: 'document', title: `${doc.title} expired`,
      body: `Expired ${doc.expires_date}`, why: 'Driving on expired registration or insurance turns a routine stop into an expensive one.',
      source: 'your records', confidence: 'as entered', action: null, ref: { type: 'document', id: doc.id }
    });
    else if (days < 45) add({
      level: 'medium', kind: 'document', title: `${doc.title} expires in ${days} days`,
      body: `Due ${doc.expires_date}`, why: null,
      source: 'your records', confidence: 'as entered', action: null, ref: { type: 'document', id: doc.id }
    });
  }

  if (epaCompare && epaCompare.level === 'bad') {
    add({
      level: 'medium', kind: 'economy',
      title: `Economy ${Math.abs(epaCompare.pct)}% below the EPA figure`,
      body: `Logging ${epaCompare.logged} against an EPA combined of ${epaCompare.epaCombined}. ${epaCompare.verdict}`,
      why: 'A widening gap against a fixed baseline is one of the few whole-vehicle health signals available without a scan tool.',
      source: 'EPA fueleconomy.gov vs your fuel log',
      confidence: 'EPA is a lab cycle; your driving is not — treat the trend as the signal, not the absolute number',
      action: 'Open Fuel & money', ref: { type: 'economy' }
    });
  } else if (economy?.trend?.direction === 'down' && Math.abs(economy.trend.pct) > 8) {
    add({
      level: 'medium', kind: 'economy', title: `Fuel economy trending down ${Math.abs(economy.trend.pct)}%`,
      body: `${economy.trend.delta} ${economy.unit} across the second half of your log.`,
      why: 'A steady decline with no change in how you drive points at tire pressure, a dragging brake, a thermostat stuck open, or fuel trims drifting.',
      source: 'your fuel log', confidence: 'computed tank-to-tank from full fills',
      action: 'Open Fuel & money', ref: { type: 'economy' }
    });
  }

  const topComplaint = complaints[0];
  if (topComplaint && topComplaint.count >= 25) {
    add({
      level: 'medium', kind: 'complaints',
      title: `${topComplaint.count} owner complaints about ${String(topComplaint.component).split(' — ')[0]}`,
      body: String(topComplaint.component).split(' — ')[1] || 'Filed with NHTSA for this year, make and model.',
      why: 'Complaints are unverified owner reports and one of the inputs NHTSA uses to spot possible safety issues. Volume tells you where to look — it is not evidence that your vehicle has the fault.',
      source: 'NHTSA complaints, clustered by component and mileage band',
      confidence: 'LOW — unverified reports about the vehicle line, not a finding about your VIN',
      action: null, ref: { type: 'complaints' }
    });
  }

  for (const c of (communications?.byComponent || []).slice(0, 2)) {
    if (c.count < 3) continue;
    add({
      level: 'medium', kind: 'tsb',
      title: `${c.count} manufacturer bulletins on ${c.component}`,
      body: 'Filed with NHTSA for this vehicle line.',
      why: 'A cluster of bulletins on one component usually means the manufacturer knows about a recurring condition and has published a diagnostic or a revised part. Worth quoting the bulletin number to a shop.',
      source: 'NHTSA manufacturer communications',
      confidence: 'subject lines only — the full document is the manufacturer\'s copyrighted material, and a TSB does not mean the repair is free',
      action: null, ref: { type: 'tsb', component: c.component }
    });
  }

  for (const w of weather) {
    add({
      level: w.level === 'bad' ? 'high' : 'medium', kind: 'weather',
      title: w.title, body: w.body,
      why: null, source: 'National Weather Service', confidence: 'forecast', action: w.action, ref: { type: 'weather' }
    });
  }

  /* ---- info ---- */
  for (const r of reminders) {
    if (r.overdue || r.cls !== 'warn') continue;
    add({
      level: 'info', kind: 'maintenance', title: `${r.name} due soon`, body: `${r.due} remaining`,
      why: null, source: 'your schedule', confidence: r.source === 'generic' ? 'generic interval' : 'set by you',
      action: 'Mark done', ref: { type: 'reminder', id: r.id }
    });
  }

  items.sort((a, b) => (RANK[a.level] ?? 4) - (RANK[b.level] ?? 4));
  return {
    items,
    counts: items.reduce((a, i) => { a[i.level] = (a[i.level] || 0) + 1; return a; }, {}),
    worst: items[0]?.level || null
  };
}

/* ---------- readiness monitors / drive cycle ---------- */
export const MONITORS = [
  { id: 'misfire', name: 'Misfire', continuous: true },
  { id: 'fuel', name: 'Fuel system', continuous: true },
  { id: 'components', name: 'Comprehensive components', continuous: true },
  { id: 'catalyst', name: 'Catalyst', continuous: false },
  { id: 'heated_catalyst', name: 'Heated catalyst', continuous: false },
  { id: 'evap', name: 'EVAP system', continuous: false },
  { id: 'secondary_air', name: 'Secondary air system', continuous: false },
  { id: 'o2_sensor', name: 'Oxygen sensor', continuous: false },
  { id: 'o2_heater', name: 'Oxygen sensor heater', continuous: false },
  { id: 'egr', name: 'EGR / VVT system', continuous: false }
];

export const DRIVE_CYCLE = [
  { step: 1, title: 'Cold soak', detail: 'Park at least 8 hours. Coolant temp must start within about 10 °F of ambient or the EVAP monitor will not even attempt to run.' },
  { step: 2, title: 'Fuel level 15–85%', detail: 'The EVAP monitor is inhibited outside this band. Check before you start, not after.' },
  { step: 3, title: 'Idle 2.5 minutes with A/C and rear defrost on', detail: 'Runs the O2 heater and secondary air monitors.' },
  { step: 4, title: 'Accelerate to 55 mph at half throttle', detail: 'Then hold steady for 3 minutes. Catalyst and O2 sensor monitors run here.' },
  { step: 5, title: 'Decelerate to 20 mph without braking', detail: 'Foot fully off the throttle. This is the closed-throttle portion the EGR monitor needs.' },
  { step: 6, title: 'Accelerate back to 55–60 mph at three-quarter throttle', detail: 'Hold 5 minutes at steady cruise.' },
  { step: 7, title: 'Decelerate to a stop without braking', detail: 'Coast down. Then idle 2 minutes.' },
  { step: 8, title: 'Re-scan', detail: 'Most monitors set in one cycle. Catalyst and EVAP often need two or three. A permanent code (like P0455) will not clear until its monitor actually passes.' }
];
