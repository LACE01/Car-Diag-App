/* ============================================================
   screens.js — maintenance, money, ownership, wear, records, parts
   ============================================================ */

function statCard(label, value, sub, cls) {
  return '<div class="stat"><span class="mlabel mute">' + esc(label) + '</span>' +
    '<div class="v ' + (String(value).length > 9 ? 'sm' : '') + '"' + (cls ? ' style="color:var(--' + cls + ')"' : '') + '>' + value + '</div>' +
    '<div class="note">' + esc(sub || '') + '</div></div>';
}
function sectionEmpty(text, btn) {
  return '<div class="card empty"><p class="note" style="margin:0 0 ' + (btn ? '16px' : '0') + '">' + text + '</p>' + (btn || '') + '</div>';
}

/* ============================================================
   SCREEN: MAINTENANCE
   ============================================================ */
function renderMaintenance() {
  const el = document.getElementById('s-maintenance');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'track its service schedule');
  const d = D();
  const rems = d.reminders || [];
  const fc = d.forecast || { items: [], total: 0 };

  el.innerHTML =
    '<div class="grid g4" style="margin-bottom:8px">' +
    statCard('Overdue', rems.filter(r => r.overdue).length, 'items past interval', rems.some(r => r.overdue) ? 'bad' : null) +
    statCard('Due soon', rems.filter(r => !r.overdue && r.cls === 'warn').length, 'within 15% of interval') +
    statCard('Next 12 mo', money(fc.total, 0), 'forecast at 12k mi/yr') +
    statCard('Duty', v.duty === 'severe' ? 'SEVERE' : 'NORMAL', v.duty === 'severe' ? 'intervals roughly halved' : 'standard intervals') +
    '</div>' +

    /* ---- engine hours ---- */
    '<div class="card" style="margin-top:18px"><div class="between wrap" style="margin-bottom:12px">' +
    '<div><span class="mlabel" style="margin:0">Engine hours</span>' +
    '<div class="note">' + (v.engine_hours
      ? num(v.engine_hours, 1) + ' hours recorded' + (v.mileage ? ' · ' + (v.mileage / v.engine_hours).toFixed(1) + ' mi per hour lifetime average' : '')
      : 'Not tracked. On a diesel, a work truck, or anything that idles for a living, hours are the honest interval — the odometer stops counting while the engine does not.') + '</div></div>' +
    '<button class="btn sm ghost" onclick="logHours()">Log hours</button></div>' +
    (v.engine_hours && v.mileage && (v.mileage / v.engine_hours) < 25
      ? '<p class="note" style="margin:0">A lifetime average under 25 mi/hr means substantial idle time. One hour of idling is roughly 25–33 miles of engine wear, so a mileage-only schedule is under-servicing this engine. Add hour intervals to the items that matter — oil, fuel filters, coolant.</p>'
      : '<p class="note" style="margin:0">Any interval can trigger on hours as well as miles and time — set an hour interval on a custom item and whichever leg arrives first drives it.</p>') +
    '</div>' +

    (v.duty === 'normal' ? '<div class="card" style="margin-top:18px"><span class="mlabel">Is this really normal duty?</span>' +
      '<p class="note" style="margin:0 0 12px">Severe duty is not rare — it is most people. Short trips under 5 miles, extensive idling, stop-and-go, towing, dusty or gravel roads, mountains, or sustained temperatures above 90 °F or below freezing all count. Getting this wrong is the difference between a 5,000 and a 2,500 mile oil change.</p>' +
      '<button class="btn sm ghost" onclick="toggleDuty()">Switch to severe duty</button></div>' : '') +

    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Service schedule</h3>' +
    '<button class="btn sm ghost" onclick="addReminder()">+ Custom interval</button></div>' +
    '<div class="card">' +
    (rems.length ? rems.map(r =>
      '<div style="margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--line)">' +
      '<div class="between wrap" style="margin-bottom:8px">' +
      '<div><b style="font-weight:600">' + esc(r.name) + '</b>' +
      (r.severe ? ' <span class="chip warn" style="font-size:9px;padding:2px 8px">SEVERE</span>' : '') +
      (/timing belt/i.test(r.name) ? ' <span class="chip bad" style="font-size:9px;padding:2px 8px">INTERFERENCE RISK</span>' : '') +
      '<div class="note" style="margin-top:2px">Every ' + [r.intMiles ? dist(r.intMiles, true) : null, r.intMonths ? r.intMonths + ' mo' : null].filter(Boolean).join(' or ') +
      (r.last_done_date ? ' · last done ' + dateShort(r.last_done_date) + (r.last_done_miles ? ' at ' + dist(r.last_done_miles, true) : '') : '') + '</div></div>' +
      '<div class="row" style="gap:8px"><span class="chip ' + r.cls + ' mono">' + esc(r.due) + '</span>' +
      '<button class="btn xs ghost" onclick="showTools(\'' + esc(r.name).replace(/'/g, "\\'") + '\',\'' + esc(r.system || '') + '\')">Tools</button>' +
      '<button class="btn xs ghost" onclick="markDone(' + r.id + ')">Mark done</button></div></div>' +
      '<div class="bar"><i class="' + (r.cls === 'grey' ? '' : r.cls) + '" style="width:' + r.pct + '%"></i></div>' +
      '<p class="note" style="margin:7px 0 0">' + esc(r.note || '') + (r.driver ? ' <b>Driven by the ' + (r.driver === 'time' ? 'time' : 'mileage') + ' interval.</b>' : '') + '</p>' +
      '</div>').join('') : '<p class="note" style="margin:0">No intervals set.</p>') +
    '<p class="note" style="margin:4px 0 0">Generic intervals seeded on vehicle creation, adjusted for your duty cycle. Whichever leg — miles or time — is furthest along drives the status, because that is how a real schedule works. Production pulls the OEM schedule keyed to your VIN from a licensed provider and replaces these values wholesale.</p></div>' +

    '<h3 class="sec-h">Next 12 months, forecast</h3><div class="card">' +
    (fc.items.length
      ? barsChart(fc.items.map(x => [x.name + (x.times > 1 ? ' ×' + x.times : ''), x.cost]), { fmt: n => money(n, 0) }) +
      '<div class="kv" style="margin-top:12px"><span>Total, assuming ' + num(fc.assumedMiles) + ' miles</span><b class="mono">' + money(fc.total, 0) + '</b></div>' +
      '<p class="note" style="margin:12px 0 0">Rough parts-and-labour estimates so you can budget, not quotes. Edit the estimated cost on any interval to sharpen this.</p>'
      : '<p class="note" style="margin:0">Nothing scheduled in the next twelve months at your current mileage.</p>') + '</div>' +

    '<h3 class="sec-h">Fluid and capacity reference <span class="src sample">Sample</span></h3><div class="card">' +
    [['Engine oil', '8.0 qt (7.6 L) with filter · check the cap for viscosity and the API/ILSAC spec'],
    ['Cooling system', '~14.0 qt (13.2 L) · OAT, 50/50 with distilled water'],
    ['Brake fluid', 'DOT 3 · hygroscopic, replace on time not mileage'],
    ['Transmission', 'Check the maker\'s exact spec — "universal" ATF causes more shudder complaints than any other single thing'],
    ['Differential', '75W-90 GL-5 · limited-slip needs the friction modifier']]
      .map(x => '<div class="kv"><span style="flex:0 0 34%;text-align:left">' + x[0] + '</span><b style="font-weight:500;max-width:64%;text-align:right">' + x[1] + '</b></div>').join('') +
    '<p class="note" style="margin:14px 0 0">Sample values. Per-VIN capacities and specifications come from a licensed repair-data provider in production.</p></div>';
}

function logHours() {
  const v = activeVehicle();
  openModal(modalHead('Log engine hours',
    'From the cluster, a scan tool PID, or an aftermarket hour meter. Recorded with the odometer so the app can work out how much of the life was idle.') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Engine hours', inp('eh-hours', { type: 'number', step: '0.1', mono: true, value: v.engine_hours || '' })) +
    fld('Odometer', inp('eh-odo', { type: 'number', mono: true, value: v.mileage || '' })) + '</div>' +
    '<div style="height:14px"></div>' +
    fld('Source', sel('eh-src', [['manual', 'Read from the cluster'], ['obd', 'Scan tool PID'], ['meter', 'Aftermarket hour meter']], 'manual')) +
    '<div style="height:20px"></div><button class="btn block" onclick="saveHours()">Save</button>');
}
async function saveHours() {
  try {
    const r = await API.post('/vehicles/' + state.activeId + '/hours', {
      hours: numVal('eh-hours'), odometer: intVal('eh-odo'), source: val('eh-src')
    });
    closeModal(); await refreshDetail();
    toast(r.note || 'Engine hours logged', r.note ? 'bad' : 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

function addReminder() {
  openModal(modalHead('Custom interval', 'Triggers on miles or time, whichever comes first.') +
    fld('Name', inp('r-name', { ph: 'Fuel filter' })) + '<div style="height:14px"></div>' +
    '<div class="grid g2" style="gap:14px">' +
    fld('Every (miles)', inp('r-mi', { type: 'number', mono: true, ph: '30000' })) +
    fld('Every (months)', inp('r-mo', { type: 'number', mono: true, ph: '36' })) + '</div>' +
    '<div style="height:14px"></div>' +
    fld('Every (engine hours)', inp('r-hr', { type: 'number', mono: true, ph: '250' })) +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Severe-duty factor', inp('r-sf', { type: 'number', step: '0.05', mono: true, value: '0.5' })) +
    fld('Estimated cost', inp('r-cost', { type: 'number', mono: true, ph: '80' })) + '</div>' +
    '<div style="height:14px"></div>' + fld('Note', inp('r-note', { ph: 'Why it matters' })) +
    '<div style="height:20px"></div><button class="btn block" onclick="saveReminder()">Add interval</button>');
}
async function saveReminder() {
  try {
    await API.post('/vehicles/' + state.activeId + '/reminders', {
      name: val('r-name'), interval_miles: intVal('r-mi'), interval_months: intVal('r-mo'),
      interval_hours: intVal('r-hr'),
      severe_factor: numVal('r-sf') ?? 0.5, est_cost: numVal('r-cost'), note: val('r-note')
    });
    closeModal(); await refreshDetail(); toast('Interval added', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}
function markDone(id) {
  const v = activeVehicle();
  const r = (D().reminders || []).find(x => x.id === id);
  openModal(modalHead('Mark done: ' + (r?.name || ''), 'This resets the interval and writes a service record.') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Date', inp('md-date', { type: 'date', value: today() })) +
    fld('Odometer', inp('md-miles', { type: 'number', mono: true, value: v.mileage || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Who', sel('md-who', ['DIY', 'Independent shop', 'Dealer'], 'DIY')) +
    fld('Cost', inp('md-cost', { type: 'number', mono: true, ph: '0.00', step: '0.01' })) + '</div>' +
    '<div style="height:20px"></div><button class="btn block" onclick="saveDone(' + id + ')">Save</button>');
}
async function saveDone(id) {
  await API.post('/reminders/' + id + '/done', {
    date: val('md-date'), miles: intVal('md-miles'), performer: val('md-who'), cost: numVal('md-cost') || 0
  });
  closeModal(); await refreshDetail(); await loadAll(); toast('Interval reset and logged', 'ok');
}
renderers.maintenance = renderMaintenance;

/* ============================================================
   SCREEN: FUEL & MONEY
   ============================================================ */
const EPA = { id: null, data: null };
async function loadEpa(force) {
  const v = activeVehicle();
  if (!v || (EPA.id === v.id && !force)) return;
  EPA.id = v.id;
  try { EPA.data = await API.get('/vehicles/' + v.id + '/epa'); }
  catch { EPA.data = null; }
  if (state.screen === 'money') renderMoney();
}

function epaHtml() {
  const e = EPA.data;
  if (!e) return '<div class="card"><span class="spin"></span> Looking up the EPA rating…</div>';
  if (!e.epa?.available) {
    return '<div class="card"><p class="note" style="margin:0">No EPA record matched this year, make and model' +
      (e.epa?.error ? ' (' + esc(e.epa.error) + ')' : '') +
      '. fueleconomy.gov covers 1984 onward for US-market vehicles; heavy-duty trucks over 8,500 lb GVWR were never rated.</p></div>';
  }
  const p = e.epa, c = e.compare;
  return '<div class="card">' +
    '<div class="between wrap" style="margin-bottom:14px"><div>' +
    '<b style="font-weight:600;font-size:15px">' + esc(p.variant) + '</b>' +
    '<div class="note">' + esc([p.vehicleClass, p.transmission, p.drive].filter(Boolean).join(' · ')) + '</div></div>' +
    '<span class="src">EPA · fueleconomy.gov</span></div>' +
    '<div class="grid g4" style="gap:14px;margin-bottom:14px">' +
    ['City', 'Highway', 'Combined', 'Annual fuel cost'].map((lab, i) => {
      const val = [p.city, p.highway, p.combined, p.annualFuelCost != null ? money(p.annualFuelCost, 0) : null][i];
      return '<div><span class="mlabel mute">' + lab + '</span><div class="field mono">' +
        (val == null ? '—' : (i === 3 ? val : val + ' <small style="font-family:Inter">' + (p.isEV ? 'MPGe' : 'mpg') + '</small>')) + '</div></div>';
    }).join('') + '</div>' +
    (c
      ? '<div class="bar" style="margin-bottom:10px"><i class="' + (c.level === 'bad' ? 'bad' : c.level === 'warn' ? 'warn' : 'ok') + '" style="width:' +
      Math.max(4, Math.min(100, (c.logged / c.epaCombined) * 100)).toFixed(0) + '%"></i></div>' +
      '<div class="between wrap"><b style="font-weight:600">You are logging ' + c.logged + ' against an EPA ' + c.epaCombined + '</b>' +
      '<span class="chip ' + (c.level === 'bad' ? 'bad' : c.level === 'warn' ? 'warn' : 'ok') + '">' + (c.pct > 0 ? '+' : '') + c.pct + '%</span></div>' +
      '<p class="note" style="margin:8px 0 0">' + esc(c.verdict) + '</p>'
      : '<p class="note" style="margin:0">Log two full fills and your real economy gets measured against this baseline.</p>') +
    (p.co2GramsPerMile ? '<div class="kv" style="margin-top:12px"><span>Tailpipe CO₂</span><b class="mono">' + num(p.co2GramsPerMile) + ' g/mi</b></div>' : '') +
    (p.rangeElectric ? '<div class="kv"><span>EPA range</span><b class="mono">' + num(p.rangeElectric) + ' mi</b></div>' : '') +
    '<p class="note" style="margin:12px 0 0">' + esc(p.note) + '</p></div>';
}

function renderMoney() {
  const el = document.getElementById('s-money');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'track fuel, charging and running costs');
  if (EPA.id !== v.id) loadEpa();
  const d = D();
  const e = d.economy || { points: [], unit: 'mpg' };
  const t = d.tco || {};
  const isEV = !!v.is_ev;
  const trips = d.trips || [];
  const bizMiles = trips.filter(x => x.purpose === 'business').reduce((s, x) => s + x.miles, 0);
  const bizRate = trips[0]?.rate || 0.70;

  el.innerHTML =
    '<div class="grid g4" style="margin-bottom:8px">' +
    statCard(isEV ? 'Avg mi/kWh' : 'Avg MPG', e.average ?? '—', e.count ? 'over ' + e.count + ' full fills' : 'needs two full fills') +
    statCard('Cost per mile', t.costPerMile ? money(t.costPerMile, 3) : '—', 'running costs only') +
    statCard('Lifetime spend', money(t.running, 0), 'service + fuel + other') +
    statCard('Total cost', money(t.total, 0), t.depreciationToDate != null ? 'incl. ' + money(t.depreciationToDate, 0) + ' depreciation' : 'set purchase price for TCO') +
    '</div>' +

    '<h3 class="sec-h">Against the EPA rating</h3>' + epaHtml() +

    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">' + (isEV ? 'Charging' : 'Fuel') + ' economy</h3>' +
    '<button class="btn sm" onclick="addFuel()">+ Log a ' + (isEV ? 'charge' : 'fill') + '</button></div>' +

    '<div class="grid g2">' +
    '<div class="card"><span class="mlabel">' + (isEV ? 'mi/kWh' : 'MPG') + ' by fill</span>' +
    sparkline(e.points.map(p => p.economy)) +
    '<div class="grid g3" style="gap:10px;margin-top:12px">' +
    '<div><span class="mlabel mute">Best</span><b class="mono">' + (e.best ?? '—') + '</b></div>' +
    '<div><span class="mlabel mute">Worst</span><b class="mono">' + (e.worst ?? '—') + '</b></div>' +
    '<div><span class="mlabel mute">Last</span><b class="mono">' + (e.last ?? '—') + '</b></div></div>' +
    (e.trend ? '<p class="note" style="margin:12px 0 0">Trend: <b style="color:var(--' + (e.trend.direction === 'down' ? 'bad' : e.trend.direction === 'up' ? 'ok' : 'muted') + ')">' +
      (e.trend.direction === 'down' ? 'falling' : e.trend.direction === 'up' ? 'improving' : 'flat') + '</b> — ' +
      (e.trend.delta > 0 ? '+' : '') + e.trend.delta + ' ' + e.unit + ' (' + e.trend.pct + '%) over the second half of your log. A steady drop with no driving change is worth chasing: tire pressure, a dragging brake, a lazy thermostat, or fuel trims drifting.</p>' : '') +
    '<p class="note" style="margin:12px 0 0">Computed tank-to-tank from full fills, never entered by hand. A partial fill extends the interval rather than corrupting it.</p></div>' +

    '<div class="card"><span class="mlabel">Where the money goes</span>' +
    barsChart([
      ['Service & repair', t.service || 0, 'var(--primary)'],
      [isEV ? 'Charging' : 'Fuel', t.fuel || 0, '#D89B00'],
      ['Insurance, tax, other', t.other || 0, '#4A90D9']
    ], { fmt: n => money(n, 0) }) +
    '<div class="kv" style="margin-top:8px"><span>Miles owned</span><b class="mono">' + (t.milesOwned ? dist(t.milesOwned, true) : '—') + '</b></div>' +
    '<div class="kv"><span>Per month</span><b class="mono">' + (t.costPerMonth ? money(t.costPerMonth, 0) : '—') + '</b></div>' +
    '<div class="kv"><span>True cost per mile</span><b class="mono">' + (t.trueCostPerMile ? money(t.trueCostPerMile, 3) : '—') + '</b></div>' +
    '<p class="note" style="margin:12px 0 0">True cost per mile includes depreciation, which is usually the largest number and the one nobody counts. Set purchase price and current estimated value on the Ownership screen.</p></div></div>' +

    /* fuel log table */
    '<h3 class="sec-h">' + (isEV ? 'Charge' : 'Fuel') + ' log</h3><div class="card">' +
    (d.fuel?.length ? '<div class="scrollx"><table class="tbl"><thead><tr>' +
      ['Date', 'Odometer', isEV ? 'kWh' : 'Gallons', '$/unit', 'Total', 'Economy', ''].map(h => '<th class="' + (h === 'Date' || h === '' ? '' : 'num') + '">' + h + '</th>').join('') +
      '</tr></thead><tbody>' +
      d.fuel.slice().sort((a, b) => (b.odometer || 0) - (a.odometer || 0)).map(f => {
        const pt = e.points.find(p => p.id === f.id);
        return '<tr><td>' + dateShort(f.date) + (f.partial ? ' <span class="chip grey" style="font-size:9px;padding:1px 7px">partial</span>' : '') +
          (f.station ? '<div class="note">' + esc(f.station) + '</div>' : '') + '</td>' +
          '<td class="num">' + (f.odometer ? num(f.odometer) : '—') + '</td>' +
          '<td class="num">' + num(f.quantity, 2) + '</td>' +
          '<td class="num">' + (f.price_per_unit ? money(f.price_per_unit, 3) : '—') + '</td>' +
          '<td class="num">' + (f.total ? money(f.total) : '—') + '</td>' +
          '<td class="num">' + (pt ? '<b>' + pt.economy + '</b>' : '—') + '</td>' +
          '<td class="num"><button class="btn xs ghost" onclick="delRow(\'fuel\',' + f.id + ')">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<p class="note" style="margin:0">Nothing logged yet. Two consecutive full fills give you your first real economy number.</p>') + '</div>' +

    /* expenses */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Other expenses</h3>' +
    '<button class="btn sm ghost" onclick="addExpense()">+ Log expense</button></div><div class="card">' +
    (d.expenses?.length ? d.expenses.map(x =>
      '<div class="rowitem"><div class="ico">' + ic('money', 19) + '</div><div class="txt"><b>' + esc(x.category) + '</b>' +
      '<span>' + dateShort(x.date) + (x.vendor ? ' · ' + esc(x.vendor) : '') + (x.note ? ' · ' + esc(x.note) : '') + '</span></div>' +
      '<b class="mono">' + money(x.amount) + '</b>' +
      '<button class="btn xs ghost" onclick="delRow(\'expenses\',' + x.id + ')">×</button></div>').join('')
      : '<p class="note" style="margin:0">Insurance, registration, tolls, parking, wash, loan payments — everything that is not a repair or a fill.</p>') + '</div>' +

    /* business mileage */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Business mileage</h3>' +
    '<button class="btn sm ghost" onclick="addTrip()">+ Log a trip</button></div><div class="card">' +
    '<div class="grid g3" style="gap:14px;margin-bottom:16px">' +
    '<div><span class="mlabel mute">Business miles</span><div class="field mono">' + num(bizMiles, 1) + '</div></div>' +
    '<div><span class="mlabel mute">IRS rate</span><div class="field mono">' + money(bizRate, 3) + '<small style="font-family:Inter">/mi</small></div></div>' +
    '<div><span class="mlabel mute">Deduction</span><div class="field mono">' + money(bizMiles * bizRate, 2) + '</div></div></div>' +
    (trips.length ? '<div class="scrollx"><table class="tbl"><thead><tr><th>Date</th><th>Route</th><th>Purpose</th><th class="num">Miles</th><th class="num">Value</th><th></th></tr></thead><tbody>' +
      trips.map(x => '<tr><td>' + dateShort(x.date) + '</td><td>' + esc([x.from_place, x.to_place].filter(Boolean).join(' → ') || x.note || '—') + '</td>' +
        '<td>' + esc(x.purpose) + '</td><td class="num">' + num(x.miles, 1) + '</td><td class="num">' + money(x.miles * (x.rate || bizRate)) + '</td>' +
        '<td class="num"><button class="btn xs ghost" onclick="delRow(\'trips\',' + x.id + ')">×</button></td></tr>').join('') +
      '</tbody></table></div>' : '<p class="note" style="margin:0">No trips logged.</p>') +
    '<p class="note" style="margin:14px 0 0">Standard mileage rate method. You cannot also deduct actual operating costs for the same miles — pick one method and stay with it for the vehicle. This is record-keeping, not tax advice; check the current-year rate and your eligibility with a tax professional.</p></div>';
}

function addFuel() {
  const v = activeVehicle();
  const isEV = !!v.is_ev;
  openModal(modalHead(isEV ? 'Log a charge' : 'Log a fill') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Date', inp('f-date', { type: 'date', value: today() })) +
    fld('Odometer', inp('f-odo', { type: 'number', mono: true, value: v.mileage || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld(isEV ? 'kWh' : 'Gallons', inp('f-qty', { type: 'number', step: '0.001', mono: true })) +
    fld('Price per unit', inp('f-ppu', { type: 'number', step: '0.001', mono: true })) +
    fld('Total', inp('f-total', { type: 'number', step: '0.01', mono: true })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld(isEV ? 'Charger' : 'Station', inp('f-station', { ph: isEV ? 'Home L2 / Electrify America' : 'Shell, Main St' })) +
    fld('Fill type', sel('f-partial', [['0', 'Filled to full'], ['1', 'Partial fill'], ['2', 'Full, but I missed a previous fill']], '0')) +
    '</div>' +
    (isEV ? '<div style="height:14px"></div>' + fld('Charge type', sel('f-ck', [['ac', 'AC — Level 1 or 2'], ['dc', 'DC fast charge']], 'ac')) +
      '<p class="note" style="margin:8px 0 0">DC fast-charge count matters at resale on most EVs — logging it here builds that history.</p>' : '') +
    '<p class="note" style="margin:14px 0 16px">Economy is computed between full fills. Marking a fill partial extends the interval rather than producing a wrong number. "Missed a previous fill" breaks the chain honestly instead of averaging in a phantom tank.</p>' +
    '<button class="btn block" onclick="saveFuel()">Save</button>');
  ['f-qty', 'f-ppu'].forEach(id => document.getElementById(id).addEventListener('input', () => {
    const q = numVal('f-qty'), p = numVal('f-ppu');
    if (q && p) document.getElementById('f-total').value = (q * p).toFixed(2);
  }));
}
async function saveFuel() {
  const pt = val('f-partial');
  try {
    await API.post('/vehicles/' + state.activeId + '/fuel', {
      date: val('f-date'), odometer: intVal('f-odo'),
      kind: activeVehicle().is_ev ? 'charge' : 'fuel',
      quantity: numVal('f-qty'), price_per_unit: numVal('f-ppu'), total: numVal('f-total'),
      partial: pt === '1' ? 1 : 0, missed_fill: pt === '2' ? 1 : 0,
      station: val('f-station'), charge_kind: val('f-ck') || null
    });
    closeModal(); await refreshDetail(); await loadAll(); toast('Logged', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

function addExpense() {
  openModal(modalHead('Log an expense') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Date', inp('x-date', { type: 'date', value: today() })) +
    fld('Category', sel('x-cat', ['insurance', 'registration', 'tax', 'inspection', 'parking', 'toll', 'wash', 'loan', 'storage', 'other'], 'insurance')) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Amount', inp('x-amt', { type: 'number', step: '0.01', mono: true })) +
    fld('Vendor', inp('x-vendor')) + '</div>' +
    '<div style="height:14px"></div>' + fld('Note', inp('x-note')) +
    '<div style="height:20px"></div><button class="btn block" onclick="saveExpense()">Save</button>');
}
async function saveExpense() {
  await API.post('/vehicles/' + state.activeId + '/expenses', {
    date: val('x-date'), category: val('x-cat'), amount: numVal('x-amt'), vendor: val('x-vendor'), note: val('x-note')
  });
  closeModal(); await refreshDetail(); toast('Logged', 'ok');
}

function addTrip() {
  openModal(modalHead('Log a trip', 'For the business mileage deduction. The IRS rate for the trip year is applied automatically.') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Date', inp('t-date', { type: 'date', value: today() })) +
    fld('Miles', inp('t-miles', { type: 'number', step: '0.1', mono: true })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('From', inp('t-from')) + fld('To', inp('t-to')) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Purpose', sel('t-purpose', ['business', 'medical', 'charity', 'personal'], 'business')) +
    fld('Note', inp('t-note', { ph: 'Client name — the IRS wants the business purpose' })) + '</div>' +
    '<div style="height:20px"></div><button class="btn block" onclick="saveTrip()">Save</button>');
}
async function saveTrip() {
  await API.post('/vehicles/' + state.activeId + '/trips', {
    date: val('t-date'), miles: numVal('t-miles'), from_place: val('t-from'),
    to_place: val('t-to'), purpose: val('t-purpose'), note: val('t-note')
  });
  closeModal(); await refreshDetail(); toast('Trip logged', 'ok');
}

async function delRow(kind, id) {
  await API.del('/' + kind + '/' + id);
  await refreshDetail(); await loadAll();
  toast('Deleted');
}
renderers.money = renderMoney;

/* ============================================================
   SCREEN: OWNERSHIP & DOCUMENTS
   ============================================================ */
function renderOwnership() {
  const el = document.getElementById('s-ownership');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'track ownership, warranty and documents');
  const d = D();
  const docs = d.documents || [];
  const wars = d.warranties || [];

  const daysTo = s => s ? Math.round((new Date(s) - new Date()) / 86400000) : null;

  el.innerHTML =
    '<div class="card"><div class="between wrap" style="margin-bottom:16px"><h3 style="font-size:19px">Ownership</h3>' +
    '<button class="btn sm ghost" onclick="editOwnership()">Edit</button></div>' +
    '<div class="grid g4" style="gap:14px">' +
    fld('Purchased', '<div class="field"><small>' + dateShort(v.purchase_date) + '</small></div>') +
    fld('Purchase price', '<div class="field mono">' + (v.purchase_price ? money(v.purchase_price, 0) : '—') + '</div>') +
    fld('Odometer at purchase', '<div class="field mono">' + (v.purchase_odometer ? num(v.purchase_odometer) : '—') + '</div>') +
    fld('Estimated value now', '<div class="field mono">' + (v.estimated_value ? money(v.estimated_value, 0) : '—') + '</div>') +
    '</div>' +
    '<div class="grid g4" style="gap:14px;margin-top:14px">' +
    fld('Plate', '<div class="field mono">' + (v.plate ? esc(v.plate) + (v.plate_state ? ' <small style="font-family:Inter">' + esc(v.plate_state) + '</small>' : '') : '—') + '</div>') +
    fld('VIN', '<div class="field mono" style="font-size:12px">' + (v.vin ? esc(v.vin) : '—') + '</div>') +
    fld('Seller', '<div class="field"><small>' + (v.seller ? esc(v.seller) : '—') + '</small></div>') +
    fld('Miles owned', '<div class="field mono">' + (d.tco?.milesOwned ? num(d.tco.milesOwned) : '—') + '</div>') +
    '</div>' +
    (v.purchase_price && v.estimated_value ?
      '<p class="note" style="margin:14px 0 0">Depreciation to date ' + money(v.purchase_price - v.estimated_value, 0) +
      (d.tco?.milesOwned ? ', or ' + money((v.purchase_price - v.estimated_value) / d.tco.milesOwned, 3) + ' per mile owned' : '') +
      '. Update the estimated value a couple of times a year and the true cost of ownership stays honest.</p>' : '') +
    '</div>' +

    /* warranties */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Warranty coverage</h3>' +
    '<button class="btn sm ghost" onclick="addWarranty()">+ Add coverage</button></div><div class="card">' +
    (wars.length ? wars.map(w =>
      '<div class="rowitem"><div class="ico" style="background:' + (w.expired ? '#F0EFF7' : w.near ? '#FDF0D8' : '#DEF5EA') + ';color:' + (w.expired ? '#8B8AA5' : w.near ? '#A9700A' : '#188752') + '">' + ic('shield', 20) + '</div>' +
      '<div class="txt"><b>' + esc(w.label) + '</b><span>' +
      [w.months ? w.months + ' months' : null, w.miles ? num(w.miles) + ' miles' : null].filter(Boolean).join(' / ') +
      (w.start_date ? ' from ' + dateShort(w.start_date) : '') + (w.provider ? ' · ' + esc(w.provider) : '') + '</span></div>' +
      '<span class="chip ' + w.cls + '">' + esc(w.summary) + '</span>' +
      '<button class="btn xs ghost" onclick="editWarranty(' + w.id + ')">Edit</button></div>').join('')
      : '<p class="note" style="margin:0">No coverage recorded.</p>') +
    '<p class="note" style="margin:14px 0 0">Terms seeded with typical US figures from the model year — <b>edit the start date to your actual in-service date</b>, which is when the first owner took delivery, not the model year. Federal emissions coverage on the catalytic converter and ECM runs 8 years / 80,000 miles on most 1995+ light vehicles regardless of what the brochure says.</p></div>' +

    /* documents */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Document vault</h3>' +
    '<button class="btn sm" onclick="addDocument()">+ Add document</button></div><div class="card">' +
    (docs.length ? docs.map(x => {
      const dd = daysTo(x.expires_date);
      const cls = dd == null ? 'grey' : dd < 0 ? 'bad' : dd < 45 ? 'warn' : 'ok';
      return '<div class="rowitem"><div class="ico">' + ic('doc', 19) + '</div>' +
        '<div class="txt"><b>' + esc(x.title) + '</b><span>' + esc(x.kind) + (x.number ? ' · ' + esc(x.number) : '') + (x.issuer ? ' · ' + esc(x.issuer) : '') +
        (x.file_name ? ' · ' + esc(x.file_name) : '') + '</span></div>' +
        (x.expires_date ? '<span class="chip ' + cls + '">' + (dd < 0 ? 'expired ' + dateShort(x.expires_date) : dd + ' days') + '</span>' : '') +
        (x.file_path ? '<a class="btn xs ghost" href="/api/files/' + encodeURIComponent(x.file_path) + '" target="_blank">Open</a>' : '') +
        '<button class="btn xs ghost" onclick="delRow(\'documents\',' + x.id + ')">×</button></div>';
    }).join('')
      : '<p class="note" style="margin:0">Title, registration, insurance card, loan payoff letter, emissions certificate, extended-warranty contract. The things you cannot find when you need them.</p>') +
    '<p class="note" style="margin:14px 0 0">Files are stored on your own server in the container volume, not in anyone\'s cloud. Anything with an expiry date shows up on the notification board 45 days out.</p></div>';
}

function editOwnership() {
  const v = activeVehicle();
  openModal(modalHead('Ownership details') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Nickname', inp('o-nick', { value: v.nickname || '', ph: 'The truck' })) +
    fld('Purchase date', inp('o-pdate', { type: 'date', value: v.purchase_date || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Purchase price', inp('o-price', { type: 'number', mono: true, value: v.purchase_price || '' })) +
    fld('Odometer then', inp('o-podo', { type: 'number', mono: true, value: v.purchase_odometer || '' })) +
    fld('Estimated value', inp('o-val', { type: 'number', mono: true, value: v.estimated_value || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Plate', inp('o-plate', { value: v.plate || '', mono: true })) +
    fld('State', inp('o-state', { value: v.plate_state || '', ph: 'TX' })) +
    fld('Seller', inp('o-seller', { value: v.seller || '' })) + '</div>' +
    '<div style="height:14px"></div>' + fld('VIN', inp('o-vin', { value: v.vin || '', mono: true, ph: '17 characters' })) +
    '<div style="height:20px"></div><button class="btn block" onclick="saveOwnership()">Save</button>');
}
async function saveOwnership() {
  await API.patch('/vehicles/' + state.activeId, {
    nickname: val('o-nick'), purchase_date: val('o-pdate'), purchase_price: numVal('o-price'),
    purchase_odometer: intVal('o-podo'), estimated_value: numVal('o-val'),
    plate: val('o-plate').toUpperCase(), plate_state: val('o-state').toUpperCase(),
    seller: val('o-seller'), vin: val('o-vin').toUpperCase()
  });
  closeModal(); await refreshDetail(); await loadAll(); toast('Saved', 'ok');
}

function addWarranty(existing) {
  const w = existing || {};
  openModal(modalHead(w.id ? 'Edit coverage' : 'Add coverage') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Type', sel('w-kind', [['bumper', 'Bumper-to-bumper'], ['powertrain', 'Powertrain'], ['emissions', 'Emissions'], ['corrosion', 'Corrosion / perforation'], ['hybrid_hv', 'Hybrid / HV battery'], ['extended', 'Extended service contract']], w.kind || 'extended')) +
    fld('Label', inp('w-label', { value: w.label || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Months', inp('w-mo', { type: 'number', mono: true, value: w.months || '' })) +
    fld('Miles', inp('w-mi', { type: 'number', mono: true, value: w.miles || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('In-service date', inp('w-start', { type: 'date', value: w.start_date || '' })) +
    fld('Odometer at start', inp('w-smiles', { type: 'number', mono: true, value: w.start_miles || 0 })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Provider', inp('w-prov', { value: w.provider || '' })) +
    fld('Contract #', inp('w-num', { value: w.contract_number || '', mono: true })) +
    fld('Deductible', inp('w-ded', { type: 'number', mono: true, value: w.deductible || '' })) + '</div>' +
    '<div style="height:20px"></div><button class="btn block" onclick="saveWarranty(' + (w.id || 0) + ')">Save</button>' +
    (w.id ? '<button class="btn block ghost" style="margin-top:10px" onclick="delRow(\'warranties\',' + w.id + ');closeModal()">Delete</button>' : ''));
}
function editWarranty(id) { addWarranty((D().warranties || []).find(x => x.id === id)); }
async function saveWarranty(id) {
  const body = {
    kind: val('w-kind'), label: val('w-label') || val('w-kind'), months: intVal('w-mo'), miles: intVal('w-mi'),
    start_date: val('w-start'), start_miles: intVal('w-smiles') || 0,
    provider: val('w-prov'), contract_number: val('w-num'), deductible: numVal('w-ded')
  };
  if (id) await API.patch('/warranties/' + id, body);
  else await API.post('/vehicles/' + state.activeId + '/warranties', body);
  closeModal(); await refreshDetail(); await loadAll(); toast('Saved', 'ok');
}

function addDocument() {
  openModal(modalHead('Add a document', 'Optionally attach the file — it is stored in your container\'s volume.') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Type', sel('dc-kind', [['title', 'Title'], ['registration', 'Registration'], ['insurance', 'Insurance'], ['inspection', 'Inspection'], ['emissions', 'Emissions certificate'], ['loan', 'Loan / payoff'], ['warranty', 'Warranty contract'], ['other', 'Other']], 'registration')) +
    fld('Title', inp('dc-title', { ph: '2026 registration' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Issuer', inp('dc-issuer', { ph: 'Texas DMV' })) +
    fld('Number', inp('dc-number', { mono: true })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Issued', inp('dc-issued', { type: 'date' })) +
    fld('Expires', inp('dc-expires', { type: 'date' })) +
    fld('Amount', inp('dc-amount', { type: 'number', mono: true })) + '</div>' +
    '<div style="height:14px"></div>' +
    fld('File (optional)', '<input class="inp" type="file" id="dc-file" style="padding:9px 14px">') +
    '<div style="height:20px"></div><button class="btn block" onclick="saveDocument()">Save</button>');
}
async function saveDocument() {
  const fd = new FormData();
  ['kind', 'title', 'issuer', 'number', 'issued', 'expires', 'amount'].forEach(k => {
    const map = { issued: 'issued_date', expires: 'expires_date' };
    const v = val('dc-' + k);
    if (v) fd.append(map[k] || k, v);
  });
  const f = document.getElementById('dc-file').files[0];
  if (f) fd.append('file', f);
  try {
    await API.form('/vehicles/' + state.activeId + '/documents/upload', fd);
    closeModal(); await refreshDetail(); await loadAll(); toast('Document saved', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}
renderers.ownership = renderOwnership;

/* ============================================================
   SCREEN: TIRES, BRAKES & BATTERY
   ============================================================ */
function renderWear() {
  const el = document.getElementById('s-wear');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'track tire, brake and battery condition');
  const d = D();
  const tires = d.tires || [];
  const bat = d.battery;
  const br = d.brakes;

  el.innerHTML =
    '<div class="between" style="margin-bottom:14px"><h3 style="font-size:19px">Tires</h3>' +
    '<button class="btn sm" onclick="addTireSet()">+ Add a set</button></div>' +
    (tires.length ? tires.map(t =>
      '<div class="card" style="margin-bottom:16px"><div class="between wrap" style="margin-bottom:14px">' +
      '<div><b style="font-weight:600;font-size:15.5px">' + esc(t.name) + '</b>' +
      (t.active ? ' <span class="chip ok" style="font-size:9px;padding:2px 8px">ON THE CAR</span>' : ' <span class="chip grey" style="font-size:9px;padding:2px 8px">STORED</span>') +
      '<div class="note" style="margin-top:2px">' + esc([t.brand, t.model, t.size, t.season].filter(Boolean).join(' · ')) +
      (t.dot_date ? ' · DOT ' + esc(t.dot_date) : '') + (t.installed_miles ? ' · fitted at ' + num(t.installed_miles) + ' mi' : '') + '</div></div>' +
      '<span class="chip ' + t.cls + '">' + (t.worst != null ? t.worst + '/32 worst' : 'no data') + '</span></div>' +
      (t.worst != null ? '<div class="bar" style="margin-bottom:12px"><i class="' + t.cls + '" style="width:' +
        Math.max(3, Math.min(100, ((t.worst - 2) / ((t.new_tread_32 || 10) - 2)) * 100)).toFixed(0) + '%"></i></div>' : '') +
      '<p class="note" style="margin:0 0 12px">' + esc(t.verdict) +
      (t.milesLeft != null ? ' Wear rate suggests roughly ' + num(Math.max(0, t.milesLeft)) + ' miles to the 2/32 limit.' : '') +
      (t.age ? ' Manufactured week ' + t.age.week + ' of ' + t.age.year + ', ' + t.age.years + ' years ago.' + (t.age.aged ? ' ' + t.age.note + '.' : '') : '') + '</p>' +
      (t.tpms_ids ? '<div class="kv"><span>TPMS sensor IDs</span><b class="mono" style="font-size:11.5px">' + esc(t.tpms_ids) + '</b></div>' : '') +
      '<div class="row wrap" style="gap:8px;margin-top:10px">' +
      '<button class="btn xs" onclick="addTireMeasurement(' + t.id + ')">Log tread depths</button>' +
      '<button class="btn xs ghost" onclick="viewTireHistory(' + t.id + ')">History</button>' +
      '<button class="btn xs ghost" onclick="delRow(\'tires\',' + t.id + ')">Remove set</button></div></div>').join('')
      : sectionEmpty('No tire sets recorded. Logging tread depth at every rotation turns Garage into a real inspection record — and it is the single easiest thing to hand a buyer.',
        '<button class="btn sm" onclick="addTireSet()">Add a set</button>')) +

    '<p class="note" style="margin:0 0 8px">2/32 in is the legal minimum in most US states, but wet stopping distance is already badly degraded by 4/32. A penny test tells you when you have run out of options; a depth gauge tells you when to start planning. More than 3/32 spread across a set points at alignment or a missed rotation.</p>' +

    /* brakes */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Brake measurements</h3>' +
    '<button class="btn sm" onclick="addBrakeMeasurement()">+ Log an inspection</button></div>' +
    '<div class="card">' +
    (br && br.cls !== 'grey'
      ? '<div class="between wrap" style="margin-bottom:14px"><div><b style="font-weight:600">Last inspection ' + dateShort(br.last.date) + '</b>' +
      '<div class="note">' + esc(br.verdict) + (br.milesLeft != null ? ' Wear rate suggests about ' + num(Math.max(0, br.milesLeft)) + ' miles of pad left.' : '') + '</div></div>' +
      '<span class="chip ' + br.cls + '">' + br.worst + ' mm worst</span></div>' +
      '<div class="scrollx"><table class="tbl"><thead><tr><th>Date</th><th class="num">Odo</th>' +
      ['LF', 'RF', 'LR', 'RR'].map(c => '<th class="num">' + c + ' pad</th>').join('') +
      ['LF', 'RF', 'LR', 'RR'].map(c => '<th class="num">' + c + ' rotor</th>').join('') + '<th></th></tr></thead><tbody>' +
      (d.brakeRows || []).map(m => '<tr><td>' + dateShort(m.date) + '</td><td class="num">' + (m.odometer ? num(m.odometer) : '—') + '</td>' +
        ['lf_pad', 'rf_pad', 'lr_pad', 'rr_pad'].map(k => '<td class="num"' + (m[k] != null && m[k] <= 3 ? ' style="color:var(--bad);font-weight:700"' : '') + '>' + (m[k] ?? '—') + '</td>').join('') +
        ['lf_rotor', 'rf_rotor', 'lr_rotor', 'rr_rotor'].map(k => '<td class="num">' + (m[k] ?? '—') + '</td>').join('') +
        '<td class="num"><button class="btn xs ghost" onclick="delRow(\'brakes\',' + m.id + ')">×</button></td></tr>').join('') +
      '</tbody></table></div>'
      : '<p class="note" style="margin:0">Nothing measured yet. Pad thickness in millimetres and rotor thickness at four points, an inch in from the edge — write the numbers down, not "looks fine". Minimum pad is 3 mm; a rotor below its stamped discard thickness gets replaced, not machined.</p>') +
    '</div>' +

    /* battery */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Battery</h3>' +
    '<button class="btn sm" onclick="addBattery()">+ Log a test</button></div><div class="card">' +
    (bat
      ? '<div class="grid g4" style="gap:14px;margin-bottom:16px">' +
      fld('State of charge', '<div class="field mono">' + (bat.soc != null ? bat.soc + '%' : '—') + '</div>') +
      fld('Rest voltage', '<div class="field mono">' + (bat.rest_voltage != null ? bat.rest_voltage + ' V' : '—') + '</div>') +
      fld('Measured CCA', '<div class="field mono">' + (bat.measured_cca ? bat.measured_cca + (bat.ccaPct ? ' (' + bat.ccaPct + '%)' : '') : '—') + '</div>') +
      fld('Age', '<div class="field mono">' + (bat.age != null ? bat.age + ' yr' : '—') + '</div>') + '</div>' +
      '<span class="chip ' + bat.cls + '">' + (bat.cls === 'bad' ? 'Replace' : bat.cls === 'warn' ? 'Watch it' : 'Healthy') + '</span>' +
      '<p class="note" style="margin:12px 0 0">12.6 V rested is 100%, 12.45 V is 75%, 12.24 V is 50%. A battery below 80% of its rated CCA, or past four years in a hot climate, is living on borrowed time — and a weak battery causes electrical faults that look like anything but a battery. Cranking voltage must stay above 9.6 V.</p>'
      : '<p class="note" style="margin:0">No battery record. Log the install date, group size and rated CCA once, then a rest voltage and load test twice a year. Most "dead alternator" diagnoses are a four-year-old battery.</p>') + '</div>' +

    /* HV note for EVs */
    (v.is_ev ? '<h3 class="sec-h">High-voltage battery</h3><div class="card">' +
      safetyBox('hv') +
      '<p class="note" style="margin:12px 0 0">Garage records HV pack state of health, charge sessions and DC fast-charge count from what you log, but it will never command anything on the HV side. Contactor control, pack balancing and isolation testing need manufacturer tooling and training — read-only is the correct scope here, not a limitation to work around.</p></div>' : '');
}

function addTireSet() {
  const v = activeVehicle();
  openModal(modalHead('Add a tire set') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Name', inp('ts-name', { ph: 'All-season set' })) +
    fld('Season', sel('ts-season', ['all-season', 'summer', 'winter', 'all-terrain', 'mud-terrain'], 'all-season')) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Brand', inp('ts-brand')) + fld('Model', inp('ts-model')) + fld('Size', inp('ts-size', { ph: '275/55R20', mono: true })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('DOT date (WWYY)', inp('ts-dot', { ph: '2324', mono: true })) +
    fld('Fitted date', inp('ts-idate', { type: 'date', value: today() })) +
    fld('Fitted at odometer', inp('ts-imiles', { type: 'number', mono: true, value: v.mileage || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('New tread (32nds)', inp('ts-new', { type: 'number', step: '0.5', mono: true, value: '10' })) +
    fld('Cost', inp('ts-cost', { type: 'number', mono: true })) +
    fld('Rotation pattern', sel('ts-rot', ['forward cross', 'rearward cross', 'X pattern', 'side to side', 'front to rear'], 'rearward cross')) + '</div>' +
    '<div style="height:14px"></div>' + fld('TPMS sensor IDs', inp('ts-tpms', { mono: true, ph: 'LF 4A2C91 · RF 4A2C93 · LR … ' })) +
    '<p class="note" style="margin:10px 0 16px">DOT date is the four digits at the end of the DOT code on the sidewall: week then year. Rubber ages out around six years whatever the tread looks like — recording it now saves an argument later.</p>' +
    '<button class="btn block" onclick="saveTireSet()">Add set</button>');
}
async function saveTireSet() {
  await API.post('/vehicles/' + state.activeId + '/tires', {
    name: val('ts-name') || 'Tire set', season: val('ts-season'), brand: val('ts-brand'), model: val('ts-model'),
    size: val('ts-size'), dot_date: val('ts-dot'), installed_date: val('ts-idate'), installed_miles: intVal('ts-imiles'),
    new_tread_32: numVal('ts-new') || 10, cost: numVal('ts-cost'), rotation_pattern: val('ts-rot'), tpms_ids: val('ts-tpms'), active: 1
  });
  closeModal(); await refreshDetail(); toast('Tire set added', 'ok');
}

function addTireMeasurement(sid) {
  const v = activeVehicle();
  openModal(modalHead('Log tread depths', 'In 32nds of an inch. Measure the inner, centre and outer groove and record the shallowest.') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Date', inp('tm-date', { type: 'date', value: today() })) +
    fld('Odometer', inp('tm-odo', { type: 'number', mono: true, value: v.mileage || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g4" style="gap:14px">' +
    fld('LF', inp('tm-lf', { type: 'number', step: '0.5', mono: true })) +
    fld('RF', inp('tm-rf', { type: 'number', step: '0.5', mono: true })) +
    fld('LR', inp('tm-lr', { type: 'number', step: '0.5', mono: true })) +
    fld('RR', inp('tm-rr', { type: 'number', step: '0.5', mono: true })) + '</div>' +
    '<div style="height:14px"></div><span class="mlabel">Cold pressure (psi), optional</span><div class="grid g4" style="gap:14px">' +
    inp('tm-plf', { type: 'number', mono: true, ph: 'LF' }) + inp('tm-prf', { type: 'number', mono: true, ph: 'RF' }) +
    inp('tm-plr', { type: 'number', mono: true, ph: 'LR' }) + inp('tm-prr', { type: 'number', mono: true, ph: 'RR' }) + '</div>' +
    '<div style="height:14px"></div>' +
    '<label class="row" style="gap:9px"><input type="checkbox" id="tm-rot" style="width:18px;height:18px;accent-color:var(--primary)"> <span style="font-size:14px">I rotated them at the same time</span></label>' +
    '<div style="height:18px"></div><button class="btn block" onclick="saveTireMeasurement(' + sid + ')">Save</button>');
}
async function saveTireMeasurement(sid) {
  await API.post('/tires/' + sid + '/measurements', {
    date: val('tm-date'), odometer: intVal('tm-odo'),
    lf: numVal('tm-lf'), rf: numVal('tm-rf'), lr: numVal('tm-lr'), rr: numVal('tm-rr'),
    psi_lf: numVal('tm-plf'), psi_rf: numVal('tm-prf'), psi_lr: numVal('tm-plr'), psi_rr: numVal('tm-prr'),
    rotated: document.getElementById('tm-rot').checked ? 1 : 0
  });
  closeModal(); await refreshDetail(); await loadAll(); toast('Tread depths logged', 'ok');
}
async function viewTireHistory(sid) {
  const r = await API.get('/tires/' + sid + '/measurements');
  openModal(modalHead('Tread history') +
    (r.measurements.length
      ? '<div class="scrollx"><table class="tbl"><thead><tr><th>Date</th><th class="num">Odo</th><th class="num">LF</th><th class="num">RF</th><th class="num">LR</th><th class="num">RR</th><th></th></tr></thead><tbody>' +
      r.measurements.map(m => '<tr><td>' + dateShort(m.date) + '</td><td class="num">' + (m.odometer ? num(m.odometer) : '—') + '</td>' +
        ['lf', 'rf', 'lr', 'rr'].map(k => '<td class="num">' + (m[k] ?? '—') + '</td>').join('') +
        '<td class="num">' + (m.rotated ? '<span class="chip grey" style="font-size:9px">rotated</span>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>'
      : '<p class="note">Nothing logged for this set.</p>'), true);
}

function addBrakeMeasurement() {
  const v = activeVehicle();
  openModal(modalHead('Brake inspection', 'Pad thickness in mm, rotor thickness in mm measured at four points an inch in from the edge.') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Date', inp('bm-date', { type: 'date', value: today() })) +
    fld('Odometer', inp('bm-odo', { type: 'number', mono: true, value: v.mileage || '' })) + '</div>' +
    '<div style="height:16px"></div><span class="mlabel">Pad thickness (mm)</span><div class="grid g4" style="gap:12px">' +
    inp('bm-lfp', { type: 'number', step: '0.1', mono: true, ph: 'LF' }) + inp('bm-rfp', { type: 'number', step: '0.1', mono: true, ph: 'RF' }) +
    inp('bm-lrp', { type: 'number', step: '0.1', mono: true, ph: 'LR' }) + inp('bm-rrp', { type: 'number', step: '0.1', mono: true, ph: 'RR' }) + '</div>' +
    '<div style="height:16px"></div><span class="mlabel">Rotor thickness (mm)</span><div class="grid g4" style="gap:12px">' +
    inp('bm-lfr', { type: 'number', step: '0.01', mono: true, ph: 'LF' }) + inp('bm-rfr', { type: 'number', step: '0.01', mono: true, ph: 'RF' }) +
    inp('bm-lrr', { type: 'number', step: '0.01', mono: true, ph: 'LR' }) + inp('bm-rrr', { type: 'number', step: '0.01', mono: true, ph: 'RR' }) + '</div>' +
    '<div style="height:16px"></div><div class="grid g2" style="gap:14px">' +
    fld('Fluid moisture %', inp('bm-moist', { type: 'number', step: '0.1', mono: true })) +
    fld('Note', inp('bm-note')) + '</div>' +
    '<p class="note" style="margin:12px 0 16px">Pad minimum is 3 mm. More than 2 mm difference inner to outer on the same corner means a seized guide pin, not worn pads — replacing the pads without freeing the pins just wastes a set. Brake fluid over 3% moisture should be replaced regardless of mileage.</p>' +
    '<button class="btn block" onclick="saveBrakeMeasurement()">Save</button>');
}
async function saveBrakeMeasurement() {
  await API.post('/vehicles/' + state.activeId + '/brakes', {
    date: val('bm-date'), odometer: intVal('bm-odo'),
    lf_pad: numVal('bm-lfp'), rf_pad: numVal('bm-rfp'), lr_pad: numVal('bm-lrp'), rr_pad: numVal('bm-rrp'),
    lf_rotor: numVal('bm-lfr'), rf_rotor: numVal('bm-rfr'), lr_rotor: numVal('bm-lrr'), rr_rotor: numVal('bm-rrr'),
    fluid_moisture: numVal('bm-moist'), note: val('bm-note')
  });
  closeModal(); await refreshDetail(); await loadAll(); toast('Inspection logged', 'ok');
}

function addBattery() {
  const b = D().battery || {};
  openModal(modalHead('Battery record') +
    '<div class="grid g3" style="gap:14px">' +
    fld('Installed', inp('b-inst', { type: 'date', value: b.installed_date || '' })) +
    fld('Group size', inp('b-grp', { value: b.group_size || '', ph: '48', mono: true })) +
    fld('Rated CCA', inp('b-cca', { type: 'number', mono: true, value: b.cca || '' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g2" style="gap:14px">' +
    fld('Brand', inp('b-brand', { value: b.brand || '' })) +
    fld('Test date', inp('b-tdate', { type: 'date', value: today() })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Rest voltage', inp('b-rv', { type: 'number', step: '0.01', mono: true, ph: '12.62' })) +
    fld('Cranking voltage', inp('b-cv', { type: 'number', step: '0.01', mono: true, ph: '10.1' })) +
    fld('Measured CCA', inp('b-mcca', { type: 'number', mono: true })) + '</div>' +
    '<div style="height:14px"></div>' + fld('Load test', sel('b-load', [['pass', 'Pass'], ['marginal', 'Marginal'], ['fail', 'Fail']], 'pass')) +
    '<p class="note" style="margin:12px 0 16px">Measure rest voltage after the car has sat at least four hours — a surface charge right after driving reads high and tells you nothing.</p>' +
    '<button class="btn block" onclick="saveBattery()">Save</button>');
}
async function saveBattery() {
  await API.post('/vehicles/' + state.activeId + '/battery', {
    installed_date: val('b-inst'), group_size: val('b-grp'), cca: intVal('b-cca'), brand: val('b-brand'),
    test_date: val('b-tdate'), rest_voltage: numVal('b-rv'), cranking_voltage: numVal('b-cv'),
    measured_cca: intVal('b-mcca'), load_test: val('b-load')
  });
  closeModal(); await refreshDetail(); await loadAll(); toast('Battery record saved', 'ok');
}
renderers.wear = renderWear;

/* ============================================================
   SCREEN: FIND PARTS lives in parts.js — store locator,
   deep links and your own price history.
   ============================================================ */

/* ============================================================
   SCREEN: RECORDS & REPORTS
   ============================================================ */
function renderRecords() {
  const el = document.getElementById('s-records');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'keep its service history and generate reports');
  const d = D();
  const svc = d.service || [];
  const odo = d.odometer || [];

  el.innerHTML =
    '<div class="grid g4" style="margin-bottom:8px">' +
    statCard('Records', svc.length, 'service entries') +
    statCard('Spent', money(d.tco?.service, 0), 'on service & repair') +
    statCard('Odometer', v.mileage ? num(v.mileage) : '—', 'current reading') +
    statCard('Sessions', (d.sessions || []).length, 'diagnostic scans') +
    '</div>' +

    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">Service history</h3>' +
    '<button class="btn sm" onclick="addRecord()">+ Log service</button></div><div class="card">' +
    (svc.length ? svc.map(r =>
      '<div class="rowitem"><div class="ico">' + ic('wrench', 19) + '</div>' +
      '<div class="txt"><b>' + esc(r.what) + '</b><span>' + dateShort(r.date) + ' · ' + (r.miles ? num(r.miles) + ' mi' : 'no odometer') +
      ' · ' + esc(r.performer) + (r.shop_name ? ' (' + esc(r.shop_name) + ')' : '') +
      (r.labor_hours ? ' · ' + r.labor_hours + ' hr' : '') + '</span>' +
      (r.notes ? '<span style="font-size:11.5px">' + esc(r.notes) + '</span>' : '') + '</div>' +
      '<b class="mono" style="font-weight:600">' + money(r.cost, 2) + '</b>' +
      '<button class="btn xs ghost" onclick="delRow(\'service\',' + r.id + ')">×</button></div>').join('')
      : '<p class="note" style="margin:0;text-align:center;padding:20px">Nothing logged yet. Every entry feeds the reports below — and a documented history is worth real money at resale.</p>') + '</div>' +

    '<h3 class="sec-h">Odometer history</h3><div class="card">' +
    (odo.length
      ? sparkline(odo.slice().reverse().map(o => o.value)) +
      '<div class="scrollx" style="margin-top:12px"><table class="tbl"><thead><tr><th>When</th><th class="num">Reading</th><th>Source</th><th></th></tr></thead><tbody>' +
      odo.slice(0, 12).map(o => '<tr><td>' + dateShort(o.at) + '</td><td class="num">' + num(o.value) + '</td><td>' + esc(o.source) + '</td>' +
        '<td>' + (o.suspect ? '<span class="chip warn" style="font-size:9px">flagged</span>' : '') + '</td></tr>').join('') +
      '</tbody></table></div>'
      : '<p class="note" style="margin:0">No readings yet.</p>') +
    '<p class="note" style="margin:12px 0 0">Every reading carries a source and a timestamp. A reading lower than the one before it gets flagged rather than silently accepted — that is what makes this record worth something to a buyer.</p></div>' +

    '<h3 class="sec-h">Generate a report</h3><div class="grid g3">' +
    [['For a buyer', 'history', 'Vehicle history packet', 'Every service, odometer reading, recall status, tire and brake measurement. The thing that gets you your asking price.'],
    ['For a shop', 'handoff', 'Mechanic hand-off packet', 'Symptoms, stored and pending codes, freeze frame, and what you already ruled out. Saves an hour of shop diag time.'],
    ['For yourself', 'cost', 'Annual cost summary', 'Spend by category, cost per mile, business mileage at the IRS rate, and next year\'s forecast.'],
    ['Before you buy', 'ppi', 'Pre-purchase inspection', 'A structured checklist covering paperwork, cold start, scan, structure, drivetrain, chassis, fluids and electrics.'],
    ['For a claim', 'warranty', 'Warranty claim packet', 'Coverage status plus the maintenance records that a denial usually turns on.']]
      .map(x => '<div class="card"><span class="mlabel">' + x[0] + '</span>' +
        '<b style="font-weight:600;font-size:15px">' + x[2] + '</b><p class="note" style="margin:6px 0 16px">' + x[3] + '</p>' +
        '<button class="btn sm block" onclick="makeReport(\'' + x[1] + '\')">Build report</button></div>').join('') + '</div>' +

    '<h3 class="sec-h">Import a scanner report</h3><div class="card">' +
    '<p class="note" style="margin:0 0 14px">Topdon publishes no developer SDK, so rather than reverse-engineer their BLE protocol, Garage imports the reports their app exports. Paste the text or CSV of any scan report — Topdon, Autel, Launch, a shop printout — and every trouble code in it lands in this vehicle\'s history with its J2012 definition.</p>' +
    '<textarea class="inp" id="imp-text" placeholder="Paste the report text here…" style="min-height:120px"></textarea>' +
    '<button class="btn block" style="margin-top:12px" onclick="importReport()">Extract codes and import</button></div>';
}

function addRecord() {
  const v = activeVehicle();
  openModal(modalHead('Log a service') +
    fld('Pick a service', serviceSelect('r-pick', 'r-what', 'r-cat')) +
    '<div style="height:14px"></div>' +
    fld('What was done', '<input class="inp" id="r-what" list="r-svc-list" autocomplete="off" ' +
      'placeholder="Start typing, or pick from the list above">' + serviceDatalist('r-svc-list') +
      '<div class="note" id="r-what-hint" style="margin-top:6px">' + serviceCount() +
      ' services across ' + SERVICES.length + ' systems. Free text is fine too — type anything.</div>' +
      '<button class="btn xs ghost" style="margin-top:8px" onclick="showTools(val(\'r-what\')||\'General service\', serviceSystem(val(\'r-what\')))">What tools do I need?</button>') +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Date', inp('r-date', { type: 'date', value: today() })) +
    fld('Odometer', inp('r-miles', { type: 'number', mono: true, value: v.mileage || '' })) +
    fld('Category', sel('r-cat', ['maintenance', 'repair', 'inspection', 'recall', 'modification', 'tires', 'bodywork'], 'maintenance')) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Who', sel('r-who', ['DIY', 'Independent shop', 'Dealer'], 'DIY')) +
    fld('Shop name', inp('r-shop')) +
    fld('Labour hours', inp('r-hours', { type: 'number', step: '0.1', mono: true })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Parts cost', inp('r-parts', { type: 'number', step: '0.01', mono: true })) +
    fld('Labour cost', inp('r-labor', { type: 'number', step: '0.01', mono: true })) +
    fld('Total', inp('r-cost', { type: 'number', step: '0.01', mono: true })) + '</div>' +
    '<div style="height:14px"></div>' + fld('Notes / part numbers', '<textarea class="inp" id="r-notes" placeholder="ACDelco PF63E filter, torque 25 lb-ft. Also found the serpentine belt glazed."></textarea>') +
    '<p class="note" style="margin:12px 0 16px">If the description matches a scheduled interval, that interval resets automatically. Writing the actual part numbers here is what makes the record useful in three years.</p>' +
    '<button class="btn block" onclick="saveRecord()">Save record</button>');
  ['r-parts', 'r-labor'].forEach(id => document.getElementById(id).addEventListener('input', () => {
    document.getElementById('r-cost').value = ((numVal('r-parts') || 0) + (numVal('r-labor') || 0)).toFixed(2);
  }));
}
async function saveRecord() {
  if (!val('r-what')) return toast('Describe what was done', 'bad');
  await API.post('/vehicles/' + state.activeId + '/service', {
    what: val('r-what'), date: val('r-date'), miles: intVal('r-miles'), category: val('r-cat'),
    performer: val('r-who'), shop_name: val('r-shop'), labor_hours: numVal('r-hours'),
    parts_cost: numVal('r-parts') || 0, labor_cost: numVal('r-labor') || 0,
    cost: numVal('r-cost') || 0, notes: val('r-notes')
  });
  closeModal(); await refreshDetail(); await loadAll(); toast('Service logged — matching intervals reset', 'ok');
}

async function importReport() {
  const text = val('imp-text');
  if (!text.trim()) return toast('Paste the report text first', 'bad');
  try {
    const r = await API.post('/vehicles/' + state.activeId + '/import-report', { text });
    await refreshDetail(); await loadAll();
    toast(r.found + ' codes found, ' + r.added + ' new added to history', 'ok');
    go('diagnose');
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------- reports ---------- */
async function makeReport(kind) {
  const r = (await API.get('/vehicles/' + state.activeId + '/report/' + kind)).report;
  const v = r.vehicle;
  const head = '<div style="border-bottom:2px solid var(--primary);padding-bottom:12px;margin-bottom:18px">' +
    '<span class="mlabel">Garage report</span><h3 style="font-size:21px;margin-bottom:3px">' + esc(r.title) + '</h3>' +
    '<p class="note" style="margin:0">' + esc(vLabel(v)) + (v.vin ? ' · VIN ' + esc(v.vin) : '') +
    (v.mileage ? ' · ' + num(v.mileage) + ' mi' : '') + ' · generated ' + dateShort(r.generated_at) + '</p></div>';

  let body = '';
  const kvBlock = obj => Object.entries(obj).filter(([, x]) => x != null && x !== '').map(([k, x]) =>
    '<div class="kv"><span style="flex:1;text-align:left">' + esc(k.replace(/_/g, ' ')) + '</span><b>' + esc(typeof x === 'number' ? num(x, x % 1 ? 2 : 0) : x) + '</b></div>').join('');

  if (kind === 'history') {
    body = kvBlock(r.summary) +
      '<h4 style="margin:20px 0 8px;font-size:15px">Service history</h4>' +
      (r.service.length ? '<table class="tbl"><thead><tr><th>Date</th><th class="num">Miles</th><th>Work</th><th>By</th><th class="num">Cost</th></tr></thead><tbody>' +
        r.service.map(s => '<tr><td>' + dateShort(s.date) + '</td><td class="num">' + (s.miles ? num(s.miles) : '—') + '</td><td>' + esc(s.what) + '</td><td>' + esc(s.performer) + '</td><td class="num">' + money(s.cost) + '</td></tr>').join('') +
        '</tbody></table>' : '<p class="note">No service records.</p>') +
      '<h4 style="margin:20px 0 8px;font-size:15px">Recall status</h4>' +
      (r.recalls.length ? r.recalls.map(x => '<div class="kv"><span style="flex:1;text-align:left">' + esc(x.campaign) + ' — ' + esc(String(x.component || '').split(':')[0]) + '</span><b>' + (x.completed ? 'Remedied' : 'OPEN') + '</b></div>').join('') : '<p class="note">No recalls on record.</p>') +
      (r.brakes && r.brakes.worst != null ? '<h4 style="margin:20px 0 8px;font-size:15px">Brakes</h4><div class="kv"><span style="flex:1;text-align:left">Worst pad measurement</span><b>' + r.brakes.worst + ' mm (' + r.brakes.worstCorner + ')</b></div>' : '') +
      (r.tires?.length ? '<h4 style="margin:20px 0 8px;font-size:15px">Tires</h4>' + r.tires.map(t => '<div class="kv"><span style="flex:1;text-align:left">' + esc(t.name) + '</span><b>' + (t.worst != null ? t.worst + '/32' : '—') + '</b></div>').join('') : '');
  } else if (kind === 'handoff') {
    body = '<span class="mlabel">Symptoms as described by the owner</span>' +
      '<textarea class="inp" id="hoff-sym" placeholder="When it happens, what it sounds like, what makes it better or worse. Be specific — this is the single most useful thing you can give a technician." style="margin-bottom:18px"></textarea>' +
      '<h4 style="margin:0 0 8px;font-size:15px">Stored codes</h4>' +
      (r.codes.length ? r.codes.map(c => '<div class="bullet"><span class="n mono" style="width:auto;padding:0 5px">' + esc(c.code) + '</span><div><b style="font-weight:600">' + esc(c.description || c.decoded.description) + '</b>' +
        '<div class="note">' + esc(c.status) + ' · ' + esc(c.decoded.scope) + (c.clear_count ? ' · cleared ' + c.clear_count + ' time' + (c.clear_count > 1 ? 's' : '') + ' previously' : '') + '</div>' +
        (c.freeze_frame ? '<div class="note mono" style="margin-top:4px">Freeze frame: ' + esc(Object.entries(c.freeze_frame).map(([k, x]) => k + ' ' + x).join(' · ')) + '</div>' : '') + '</div></div>').join('')
        : '<p class="note">No stored codes.</p>') +
      '<h4 style="margin:20px 0 8px;font-size:15px">Already done — do not repeat this work</h4>' +
      (r.already_tried.length ? r.already_tried.map((x, i) => '<div class="bullet"><span class="n">' + (i + 1) + '</span><div>' + esc(x) + '</div></div>').join('') : '<p class="note">Nothing recent.</p>');
  } else if (kind === 'cost') {
    body = kvBlock({
      'Total running cost': money(r.totals.running, 2),
      'Service & repair': money(r.by_category.service, 2),
      'Fuel / charging': money(r.by_category.fuel, 2),
      'Insurance, tax, other': money(r.by_category.other, 2),
      'Cost per mile': r.totals.costPerMile ? money(r.totals.costPerMile, 3) : '—',
      'True cost per mile (incl. depreciation)': r.totals.trueCostPerMile ? money(r.totals.trueCostPerMile, 3) : '—',
      'Average economy': r.economy.average ? r.economy.average + ' ' + r.economy.unit : '—'
    }) +
      '<h4 style="margin:20px 0 8px;font-size:15px">Business mileage</h4>' +
      kvBlock({ 'Business miles': num(r.business_mileage.miles, 1), 'IRS rate': money(r.business_mileage.rate, 3), 'Deduction': money(r.business_mileage.deduction, 2), 'Trips': r.business_mileage.trips }) +
      '<p class="note" style="margin-top:8px">' + esc(r.business_mileage.note) + '</p>' +
      '<h4 style="margin:20px 0 8px;font-size:15px">Next 12 months</h4>' +
      (r.forecast.items.length ? r.forecast.items.map(x => '<div class="kv"><span style="flex:1;text-align:left">' + esc(x.name) + (x.times > 1 ? ' ×' + x.times : '') + '</span><b>' + money(x.cost, 0) + '</b></div>').join('') +
        '<div class="kv"><span style="flex:1;text-align:left"><b>Total</b></span><b>' + money(r.forecast.total, 0) + '</b></div>' : '<p class="note">Nothing scheduled.</p>');
  } else if (kind === 'ppi') {
    body = r.checklist.map(sec => '<h4 style="margin:18px 0 8px;font-size:15px">' + esc(sec.section) + '</h4>' +
      sec.items.map(i => '<div class="bullet"><span class="n">' + ic('check', 11) + '</span><div>' + esc(i) + '</div></div>').join('')).join('');
  } else if (kind === 'warranty') {
    body = '<h4 style="margin:0 0 8px;font-size:15px">Coverage</h4>' +
      r.warranties.map(w => '<div class="kv"><span style="flex:1;text-align:left">' + esc(w.label) + '</span><b>' + esc(w.summary) + '</b></div>').join('') +
      '<h4 style="margin:20px 0 8px;font-size:15px">Maintenance evidence</h4>' +
      (r.supporting_service.length ? '<table class="tbl"><thead><tr><th>Date</th><th class="num">Miles</th><th>Work</th></tr></thead><tbody>' +
        r.supporting_service.map(s => '<tr><td>' + dateShort(s.date) + '</td><td class="num">' + (s.miles ? num(s.miles) : '—') + '</td><td>' + esc(s.what) + '</td></tr>').join('') + '</tbody></table>'
        : '<p class="note">No records — this is the problem a claim usually dies on.</p>') +
      '<p class="note" style="margin-top:12px">' + esc(r.note) + '</p>';
  }

  openModal(head + body +
    '<p class="note" style="margin:22px 0 18px;padding-top:14px;border-top:1px solid var(--line)">' + esc(r.disclaimer) + '</p>' +
    '<div class="row" style="gap:10px"><button class="btn ghost" style="flex:1" onclick="closeModal()">Close</button>' +
    '<button class="btn" style="flex:1" onclick="window.print()">Print / save as PDF</button></div>', true);
}
renderers.records = renderRecords;
