/* ============================================================
   analytics.js — series for the charts, built from records only.

   THE RULE THIS FILE EXISTS TO ENFORCE:
   Every point returned here traces to a row the user recorded.
   Nothing is interpolated, smoothed into existence, back-filled,
   or estimated to make a line look continuous. A month with no
   spending returns 0 because zero was spent — that is a fact.
   A month before the vehicle was added returns nothing at all,
   because we have no claim to make about it.

   Where a figure is derived (cost per mile, compliance percent)
   it carries `source:'calculated'` and states its own basis so
   the UI can label it and the user can disagree with it.
   ============================================================ */
import { db } from './db.js';
import { computeEconomy, reminderStatus, tireStatus, batteryStatus, brakeStatus, U } from './core.js';

/* ---------- month helpers (local dates, no timezone drift) ---------- */
const ym = d => (typeof d === 'string' ? d.slice(0, 7) : d.toISOString().slice(0, 7));
function monthsBack(n, end = new Date()) {
  const out = [];
  const d = new Date(end.getFullYear(), end.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(d.getFullYear(), d.getMonth() - i, 1).toISOString().slice(0, 7));
  }
  return out;
}
const round2 = n => Math.round(n * 100) / 100;

export const PERIODS = {
  '7D':  { days: 7,    label: '7 days' },
  '30D': { days: 30,   label: '30 days' },
  '90D': { days: 90,   label: '90 days' },
  '6M':  { days: 183,  label: '6 months' },
  '1Y':  { days: 365,  label: '12 months' },
  'ALL': { days: null, label: 'all records' }
};

function since(period) {
  const p = PERIODS[period] || PERIODS['1Y'];
  if (!p.days) return null;
  const d = new Date();
  d.setDate(d.getDate() - p.days);
  return d.toISOString().slice(0, 10);
}

/* ============================================================
   COST TREND — monthly, three series
   ============================================================ */
export function costTrend(vehicleId, period = '1Y') {
  const from = since(period);
  const svc = db.prepare(
    'SELECT date, category, cost, parts_cost, labor_cost, what, id FROM service_records WHERE vehicle_id=?' +
    (from ? ' AND date>=?' : '') + ' ORDER BY date'
  ).all(...(from ? [vehicleId, from] : [vehicleId]));
  const exp = db.prepare(
    'SELECT date, category, amount, id FROM expenses WHERE vehicle_id=?' +
    (from ? ' AND date>=?' : '') + ' ORDER BY date'
  ).all(...(from ? [vehicleId, from] : [vehicleId]));
  const fuel = db.prepare(
    'SELECT date, total, id FROM fuel_logs WHERE vehicle_id=?' +
    (from ? ' AND date>=?' : '') + ' ORDER BY date'
  ).all(...(from ? [vehicleId, from] : [vehicleId]));

  if (!svc.length && !exp.length && !fuel.length) {
    return { months: [], series: [], total: 0, empty: 'NO COST DATA IN THIS PERIOD' };
  }

  /* The window starts at the first real record, not at an arbitrary
     "12 months ago" — otherwise a car added last month gets eleven
     months of flat zero, which reads as "spent nothing" rather than
     "wasn't being tracked". Those are very different statements. */
  const dates = [...svc, ...exp, ...fuel].map(r => r.date).filter(Boolean).sort();
  const firstYm = ym(dates[0]);
  const months = monthsBack(24).filter(m => m >= firstYm);
  if (!months.length) months.push(ym(new Date()));

  const zero = () => Object.fromEntries(months.map(m => [m, 0]));
  const maint = zero(), repair = zero(), other = zero(), fuelM = zero();

  for (const r of svc) {
    const m = ym(r.date);
    if (!(m in maint)) continue;
    const amt = r.cost || ((r.parts_cost || 0) + (r.labor_cost || 0));
    if (r.category === 'repair') repair[m] += amt;
    else if (r.category === 'maintenance') maint[m] += amt;
    else other[m] += amt;                       // inspection, recall, modification
  }
  for (const r of exp) { const m = ym(r.date); if (m in other) other[m] += r.amount || 0; }
  for (const r of fuel) { const m = ym(r.date); if (m in fuelM) fuelM[m] += r.total || 0; }

  const pt = (map, m) => ({ x: m, y: round2(map[m]) });
  const totalM = m => round2(maint[m] + repair[m] + other[m] + fuelM[m]);

  const series = [
    { key: 'total',   label: 'Total spend',       color: 'cyan',    points: months.map(m => ({ x: m, y: totalM(m) })) },
    { key: 'maint',   label: 'Maintenance',       color: 'violet',  points: months.map(m => pt(maint, m)) },
    { key: 'repair',  label: 'Repairs',           color: 'magenta', points: months.map(m => pt(repair, m)) }
  ];
  const fuelTotal = months.reduce((s, m) => s + fuelM[m], 0);
  if (fuelTotal > 0) {
    series.push({ key: 'fuel', label: 'Fuel', color: 'green', points: months.map(m => pt(fuelM, m)), fill: false });
  }

  return {
    months,
    series,
    total: round2(months.reduce((s, m) => s + totalM(m), 0)),
    breakdown: {
      maintenance: round2(months.reduce((s, m) => s + maint[m], 0)),
      repair: round2(months.reduce((s, m) => s + repair[m], 0)),
      fuel: round2(fuelTotal),
      other: round2(months.reduce((s, m) => s + other[m], 0))
    },
    source: 'calculated',
    basis: 'Sum of recorded service, expense and fuel entries per calendar month. Months before your first record are not shown.'
  };
}

/* ============================================================
   FUEL — three views over the same tank-to-tank calculation
   ============================================================ */
export function fuelSeries(vehicleId, isEV, period = 'ALL') {
  const from = since(period);
  const logs = db.prepare(
    'SELECT * FROM fuel_logs WHERE vehicle_id=?' + (from ? ' AND date>=?' : '') + ' ORDER BY date'
  ).all(...(from ? [vehicleId, from] : [vehicleId]));

  const econ = computeEconomy(logs, isEV);
  const raw = logs.length;

  /* A full tank-to-tank pair is the only honest MPG. Say how far off
     they are rather than averaging whatever happens to be there. */
  if (!econ.points.length) {
    return {
      empty: raw === 0 ? 'NO FUEL HISTORY YET' : 'NOT ENOUGH FULL TANKS',
      hint: raw === 0
        ? 'Log a fill-up to start tracking. Economy needs two consecutive full tanks with odometer readings.'
        : 'You have ' + raw + ' fill-up' + (raw === 1 ? '' : 's') +
          ' but no pair of consecutive full tanks with odometer readings. Partial fills and skipped fills break the chain.',
      unit: econ.unit, records: raw, series: []
    };
  }

  const P = econ.points;

  /* Plausibility band. NOT a judgement about this vehicle — we have no
     manufacturer figure to compare against and will not invent one.
     This is a physics floor and ceiling: no road-going petrol vehicle
     returns 3 mpg or 300 mpg over a full tank. A figure outside the
     band almost always means a missed fill-up, a partial marked full,
     or a mistyped odometer.

     The point is still plotted and still counted. It is flagged, with
     the likely cause named, so the owner can check the entry. Dropping
     it would quietly rewrite their history; leaving it unmarked would
     let one typo drag the average somewhere meaningless. */
  const BAND = isEV ? [0.4, 12] : [4, 120];
  const implausible = p => p.economy < BAND[0] || p.economy > BAND[1];

  const series = {
    economy: [{
      key: 'mpg', label: econ.unit, color: 'cyan',
      points: P.map(p => ({
        x: p.date, y: p.economy, text: p.economy + ' ' + econ.unit,
        note: implausible(p)
          ? 'Outside the plausible range — check for a missed fill-up, a partial marked as full, or an odometer typo'
          : 'Full-tank calculation over ' + Math.round(p.distance) + ' ' + (U && U.dist ? U.dist : 'mi'),
        flag: implausible(p) ? 'warn' : null,
        source: implausible(p) ? 'NEEDS VERIFICATION' : 'CALCULATED', ref: p.id
      }))
    }],
    price: [{
      key: 'price', label: 'Price per unit', color: 'violet',
      points: P.filter(p => p.pricePerUnit != null).map(p => ({
        x: p.date, y: p.pricePerUnit, text: '$' + p.pricePerUnit.toFixed(3),
        source: 'USER ENTERED', ref: p.id
      }))
    }],
    cpm: [{
      key: 'cpm', label: 'Cost per mile', color: 'magenta',
      points: P.filter(p => p.costPerMile != null).map(p => ({
        x: p.date, y: p.costPerMile, text: '$' + p.costPerMile.toFixed(3) + '/mi',
        source: 'CALCULATED', ref: p.id
      }))
    }]
  };

  return {
    unit: econ.unit, records: raw, valid: P.length,
    average: econ.average, best: econ.best, worst: econ.worst, last: econ.last,
    series,
    quality: { usable: P.length, total: raw, pct: raw ? P.length / raw : null },
    source: 'calculated',
    basis: 'Distance between consecutive full fills divided by fuel added. Partial and missed fills are excluded, not estimated.'
  };
}

/* ============================================================
   ODOMETER — every reading, with where it came from
   ============================================================ */
const ODO_SOURCE = {
  manual: { label: 'Manual', flag: null },
  obd: { label: 'Scan tool', flag: 'ok' },
  receipt: { label: 'Service', flag: 'ok' },
  photo: { label: 'Photo', flag: null },
  import: { label: 'Imported', flag: null },
  fuel: { label: 'Fuel log', flag: null }
};

export function odometerSeries(vehicleId, period = 'ALL') {
  const from = since(period);
  const rows = db.prepare(
    'SELECT id, value, source, at, note, suspect FROM odometer_readings WHERE vehicle_id=?' +
    (from ? ' AND at>=?' : '') + ' ORDER BY at'
  ).all(...(from ? [vehicleId, from] : [vehicleId]));

  if (!rows.length) {
    return { empty: 'NO ODOMETER HISTORY', hint: 'Readings are recorded automatically when you log fuel or service.', series: [] };
  }

  /* Out-of-sequence detection. A later date with a lower reading is
     either a typo or something that matters a great deal on resale.
     We flag it and say which — we do not silently sort it away. */
  let high = -Infinity;
  const points = rows.map(r => {
    const back = r.value < high;
    high = Math.max(high, r.value);
    const s = ODO_SOURCE[r.source] || { label: r.source, flag: null };
    return {
      x: r.at.slice(0, 10), y: r.value, id: r.id,
      text: r.value.toLocaleString(),
      flag: r.suspect || back ? 'warn' : s.flag,
      note: back ? 'Lower than an earlier reading — check for a typo' : (r.note || null),
      source: (s.label || 'Manual').toUpperCase(),
      outOfSequence: back || !!r.suspect
    };
  });

  const flagged = points.filter(p => p.outOfSequence);
  const span = rows.length > 1 ? rows[rows.length - 1].value - rows[0].value : 0;
  const days = rows.length > 1
    ? Math.max(1, (new Date(rows[rows.length - 1].at) - new Date(rows[0].at)) / 86400000)
    : 0;

  return {
    series: [{ key: 'odo', label: 'Odometer', color: 'cyan', shape: 'monotone', points }],
    readings: rows.length,
    flagged: flagged.length,
    perYear: days > 30 ? Math.round((span / days) * 365) : null,
    perYearBasis: days > 30
      ? 'From ' + rows.length + ' readings over ' + Math.round(days) + ' days.'
      : 'Not enough history yet to state an annual rate.',
    source: 'user_entered'
  };
}

/* ============================================================
   SPEND BY SYSTEM
   Records logged before the system field existed are counted as
   UNCATEGORISED. Assigning them is a user decision, not ours.
   ============================================================ */
const SYSTEM_LABEL = {
  engine: 'Engine', brakes: 'Brakes', tires: 'Tires & wheels', charging: 'Electrical',
  cooling: 'Cooling', fuel: 'Fuel system', hvac: 'Climate', trans: 'Transmission',
  suspension: 'Suspension & steering', drive: 'Driveline', diagnostics: 'Diagnostics',
  body: 'Body & interior', ev: 'EV system', legal: 'Registration & legal'
};

export function spendBySystem(vehicleId, period = '1Y') {
  const from = since(period);
  const rows = db.prepare(
    'SELECT system, category, cost, parts_cost, labor_cost FROM service_records WHERE vehicle_id=?' +
    (from ? ' AND date>=?' : '') + ' ORDER BY date'
  ).all(...(from ? [vehicleId, from] : [vehicleId]));

  const by = new Map();
  let uncategorised = 0;
  for (const r of rows) {
    const amt = r.cost || ((r.parts_cost || 0) + (r.labor_cost || 0));
    if (amt <= 0) continue;
    if (!r.system) { uncategorised += amt; continue; }
    by.set(r.system, (by.get(r.system) || 0) + amt);
  }

  const segments = [...by.entries()]
    .map(([k, v]) => ({ key: k, label: SYSTEM_LABEL[k] || k, value: round2(v) }))
    .sort((a, b) => b.value - a.value);
  if (uncategorised > 0) {
    segments.push({ key: null, label: 'Uncategorised', value: round2(uncategorised), uncategorised: true });
  }

  return {
    segments,
    total: round2(segments.reduce((s, x) => s + x.value, 0)),
    empty: segments.length ? null : 'NO COSTED SERVICE RECORDS IN THIS PERIOD',
    source: 'user_entered'
  };
}

/* ============================================================
   SERVICE HORIZON — next 12 months from intervals that exist
   ============================================================ */
export function serviceHorizon(vehicleId, vehicle, milesPerYear) {
  const rems = db.prepare('SELECT * FROM reminders WHERE vehicle_id=? AND active=1').all(vehicleId);
  const rate = milesPerYear || null;
  const out = [];
  let noInterval = 0;

  const today = new Date();
  const addDays = n => {
    const d = new Date(today); d.setDate(d.getDate() + Math.round(n));
    return d.toISOString().slice(0, 10);
  };

  for (const r of rems) {
    const st = reminderStatus(r, vehicle);
    const legs = st.legs || [];
    if (!legs.length) { noInterval++; continue; }   // no interval, or no baseline to count from

    /* Each leg gives a due date by a different route. The one that
       lands first is the one that governs — that's what "due" means
       when a job has both a mileage and a time interval. */
    const candidates = [];
    for (const leg of legs) {
      if (leg.leg === 'time') {
        candidates.push({ date: addDays(leg.remaining * 30.44), basis: 'time interval', projected: false, leg });
      } else if (leg.leg === 'miles' && rate) {
        /* Only project a mileage interval into a date when we have a
           MEASURED rate from this vehicle's own odometer history.
           Assuming a national-average 12,000 mi/yr for someone who
           drives 3,000 puts a brake job on the calendar that isn't
           due for three years. */
        candidates.push({
          date: addDays((leg.remaining / rate) * 365),
          basis: 'projected from your measured ' + Math.round(rate).toLocaleString() + ' mi/yr',
          projected: true, leg
        });
      } else if (leg.leg === 'hours') {
        continue;                                   // no measured hours-per-day rate to project from
      }
    }
    if (!candidates.length) { noInterval++; continue; }

    candidates.sort((a, b) => a.date.localeCompare(b.date));
    const win = candidates[0];

    out.push({
      id: r.id, name: r.name, system: r.system,
      dueDate: win.date,
      basis: win.basis,
      projected: win.projected,
      due: st.due,
      milesLeft: legs.find(l => l.leg === 'miles')?.remaining ?? null,
      estCost: r.est_cost ?? null,
      cls: st.overdue ? 'bad' : st.cls === 'warn' ? 'warn' : 'ok',
      overdue: !!st.overdue
    });
  }

  out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const horizon = new Date(); horizon.setFullYear(horizon.getFullYear() + 1);
  const cut = horizon.toISOString().slice(0, 10);

  return {
    items: out.filter(x => x.dueDate <= cut),
    later: out.filter(x => x.dueDate > cut).length,
    noInterval,
    rateKnown: !!rate,
    empty: out.length ? null : 'NO SCHEDULED ITEMS WITH INTERVALS',
    source: 'calculated',
    basis: rate
      ? 'Time intervals are exact. Mileage intervals are projected from your own driving rate and are marked as forecast.'
      : 'Only time-based intervals are shown. Log more odometer readings and mileage-based items can be projected too.'
  };
}

/* ============================================================
   DATA-QUALITY GAUGES
   These measure the completeness of YOUR RECORDS, not the health
   of the vehicle. That distinction is in every label, because a
   "94%" next to a car is read as a health score whatever we meant.
   ============================================================ */
export function qualityGauges(vehicleId, vehicle) {
  /* --- maintenance compliance --- */
  const rems = db.prepare('SELECT * FROM reminders WHERE vehicle_id=? AND active=1').all(vehicleId);
  /* Judgeable = has an interval, a baseline to count from, AND that
     baseline is one the owner confirmed rather than one we assumed
     when the vehicle was added.

     Both directions of the error matter. Counting an unknown item as
     overdue makes a well-kept vehicle look neglected. Counting an
     ASSUMED baseline as on-time is worse — it reports a car nobody
     has ever serviced as 100% compliant, which is a claim we made up. */
  const assumed = rems.filter(r => r.baseline === 'assumed').length;
  const states = rems
    .filter(r => r.baseline !== 'assumed')
    .map(r => reminderStatus(r, vehicle))
    .filter(s => s.legs && s.legs.length);
  const known = states;
  const onTime = states.filter(s => !s.overdue).length;
  const overdue = states.filter(s => s.overdue).length;

  const compliance = known.length
    ? {
        value: onTime / known.length,
        display: onTime + '/' + known.length,
        sub: 'ON TIME',
        tone: overdue === 0 ? 'ok' : overdue > 2 ? 'bad' : 'warn',
        detail: overdue ? overdue + ' overdue' : 'Nothing overdue',
        assumed,
        note: rems.length - known.length
          ? (rems.length - known.length) + ' item(s) are not counted' +
            (assumed ? ' — ' + assumed + ' still use the start date assumed when the vehicle was added.' : '.')
          : null
      }
    : { value: null, detail: rems.length
          ? (assumed === rems.length
              ? 'All ' + rems.length + ' items still use the start date assumed at setup — log one to start measuring'
              : 'No item has both an interval and a confirmed last-done date')
          : 'No scheduled items yet',
        assumed };

  /* --- service record completeness --- */
  const svc = db.prepare('SELECT miles, cost, parts_cost, labor_cost, notes, id FROM service_records WHERE vehicle_id=?').all(vehicleId);
  const docd = svc.filter(r =>
    r.miles != null && ((r.cost || 0) + (r.parts_cost || 0) + (r.labor_cost || 0)) > 0 && r.notes && r.notes.trim());
  const completeness = svc.length
    ? {
        value: docd.length / svc.length,
        display: Math.round((docd.length / svc.length) * 100) + '%',
        sub: 'COMPLETE',
        tone: docd.length === svc.length ? 'ok' : 'primary',
        detail: docd.length + ' of ' + svc.length + ' have mileage, cost and notes',
        missing: svc.length - docd.length
      }
    : { value: null, detail: 'No service records yet' };

  /* --- fuel data quality --- */
  const logs = db.prepare('SELECT * FROM fuel_logs WHERE vehicle_id=?').all(vehicleId);
  const econ = computeEconomy(logs, !!vehicle.is_ev);
  const fuelQ = logs.length
    ? {
        value: econ.points.length / logs.length,
        display: econ.points.length + '/' + logs.length,
        sub: 'USABLE',
        tone: econ.points.length ? 'primary' : 'warn',
        detail: econ.points.length
          ? econ.points.length + ' fill-ups yield an economy figure'
          : 'No consecutive full tanks yet'
      }
    : { value: null, detail: 'No fuel logs yet' };

  /* --- documents current --- */
  const docs = db.prepare("SELECT kind, expires_date FROM documents WHERE vehicle_id=?").all(vehicleId);
  const withExpiry = docs.filter(d => d.expires_date);
  const today = new Date().toISOString().slice(0, 10);
  const current = withExpiry.filter(d => d.expires_date >= today);
  const documents = withExpiry.length
    ? {
        value: current.length / withExpiry.length,
        display: current.length + '/' + withExpiry.length,
        sub: 'CURRENT',
        tone: current.length === withExpiry.length ? 'ok' : 'bad',
        detail: withExpiry.length - current.length
          ? (withExpiry.length - current.length) + ' expired'
          : 'All in date',
        note: docs.length - withExpiry.length
          ? (docs.length - withExpiry.length) + ' document(s) have no expiry date recorded.'
          : null
      }
    : { value: null, detail: docs.length ? 'No expiry dates recorded' : 'No documents yet' };

  return { compliance, completeness, fuel: fuelQ, documents };
}

/* ============================================================
   WEAR SERIES — tread, pressure, voltage over time
   ============================================================ */
export function wearSeries(vehicleId) {
  const set = db.prepare('SELECT * FROM tire_sets WHERE vehicle_id=? AND active=1 ORDER BY id DESC LIMIT 1').get(vehicleId);
  const out = { tires: null, battery: null, brakes: null };

  if (set) {
    const ms = db.prepare('SELECT * FROM tire_measurements WHERE tire_set_id=? ORDER BY date').all(set.id);
    const corner = (k, label, color) => ({
      key: k, label, color,
      points: ms.filter(m => m[k] != null).map(m => ({
        x: m.date, y: m[k], text: m[k] + '/32"', source: 'USER ENTERED', ref: m.id
      }))
    });
    const psi = (k, label, color) => ({
      key: k, label, color,
      points: ms.filter(m => m[k] != null).map(m => ({
        x: m.date, y: m[k], text: m[k] + ' psi', source: 'USER ENTERED', ref: m.id
      }))
    });
    out.tires = {
      set,
      status: tireStatus(set, ms),
      measurements: ms.length,
      latest: ms[ms.length - 1] || null,
      tread: [corner('lf', 'Left front', 'cyan'), corner('rf', 'Right front', 'violet'),
              corner('lr', 'Left rear', 'magenta'), corner('rr', 'Right rear', 'green')]
              .filter(s => s.points.length),
      pressure: [psi('psi_lf', 'Left front', 'cyan'), psi('psi_rf', 'Right front', 'violet'),
                 psi('psi_lr', 'Left rear', 'magenta'), psi('psi_rr', 'Right rear', 'green')]
                 .filter(s => s.points.length)
    };
  }

  const bat = db.prepare('SELECT * FROM battery_records WHERE vehicle_id=? ORDER BY id DESC LIMIT 1').get(vehicleId);
  if (bat) {
    const all = db.prepare('SELECT * FROM battery_records WHERE vehicle_id=? AND rest_voltage IS NOT NULL AND test_date IS NOT NULL ORDER BY test_date').all(vehicleId);
    out.battery = {
      record: bat,
      status: batteryStatus(bat),
      series: all.length >= 2 ? [{
        key: 'v', label: 'Rest voltage', color: 'cyan',
        points: all.map(r => ({ x: r.test_date, y: r.rest_voltage, text: r.rest_voltage.toFixed(2) + ' V', source: 'USER ENTERED' }))
      }] : []
    };
  }

  const brk = db.prepare('SELECT * FROM brake_measurements WHERE vehicle_id=? ORDER BY date').all(vehicleId);
  if (brk.length) {
    out.brakes = { rows: brk, latest: brk[brk.length - 1], status: brakeStatus(brk) };
  }

  return out;
}

/* ============================================================
   TOP-LEVEL BUNDLE
   ============================================================ */
export function analyticsFor(vehicle, period = '1Y') {
  const id = vehicle.id;
  const isEV = !!vehicle.is_ev;
  const odo = odometerSeries(id, 'ALL');
  const cost = costTrend(id, period);
  const fuel = fuelSeries(id, isEV, period);

  const totalMiles = odo.series.length && odo.series[0].points.length > 1
    ? odo.series[0].points[odo.series[0].points.length - 1].y - odo.series[0].points[0].y
    : null;

  return {
    period,
    cost,
    fuel,
    odometer: odo,
    systems: spendBySystem(id, period),
    horizon: serviceHorizon(id, vehicle, odo.perYear),
    gauges: qualityGauges(id, vehicle),
    wear: wearSeries(id),
    headline: {
      totalSpend: cost.total,
      /* cost per mile only where BOTH numbers are real */
      /* three decimals: at typical spend a per-mile figure rounded to
         cents collapses several very different vehicles onto "$0.23" */
      costPerMile: totalMiles && totalMiles > 0 && cost.total > 0
        ? Math.round((cost.total / totalMiles) * 1000) / 1000
        : null,
      costPerMileBasis: totalMiles && totalMiles > 0
        ? 'Recorded spend over ' + Math.round(totalMiles).toLocaleString() + ' recorded miles in this period.'
        : 'Needs at least two odometer readings in the period.',
      milesTracked: totalMiles,
      odometer: odo.series.length ? odo.series[0].points[odo.series[0].points.length - 1].y : (vehicle.mileage ?? null)
    }
  };
}
