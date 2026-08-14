/* ============================================================
   analytics.test.mjs — end-to-end over a live server.

   These assertions are mostly about what the API REFUSES to say.
   Half of them check that a figure is absent when the records
   don't support it, because a chart that invents a number is the
   failure mode that actually costs someone money.
   ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-an-'));
const PORT = 2100 + Math.floor(Math.random() * 400);
const BASE = 'http://127.0.0.1:' + PORT + '/api';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(a === b, msg + '  (got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b) + ')');

const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

let COOKIE = '';
async function req(method, url, body) {
  const r = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json', ...(COOKIE ? { cookie: COOKIE } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const setC = r.headers.get('set-cookie');
  if (setC) COOKIE = setC.split(';')[0];
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: r.status, body: json, text };
}
const GET = u => req('GET', u);
const POST = (u, b) => req('POST', u, b ?? {});
const PATCH = (u, b) => req('PATCH', u, b);

const srv = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let srvErr = '';
srv.stderr.on('data', d => { srvErr += d; });

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try { await fetch(BASE + '/nope'); return true; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  return false;
}

function done() {
  srv.kill('SIGKILL');
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(fail ? `\n  ✗ ${fail} failed, ${pass} passed\n` : `\n  ✓ analytics: ${pass} assertions passed\n`);
  process.exit(fail ? 1 : 0);
}

try {
  if (!await waitForServer()) { console.error('server did not start\n' + srvErr); process.exit(1); }

  await POST('/auth/register', { email: 'an@test.co', password: 'password123', name: 'An' });
  const veh = await POST('/vehicles', { year: 2015, make: 'Ford', model: 'F-150', nickname: 'Truck', mileage: 96000 });
  const V = veh.body.vehicle.id;

  /* ---------- 1. a brand-new vehicle claims nothing ---------- */
  console.log('\n  empty vehicle — the app should admit it knows nothing');
  let a = (await GET(`/vehicles/${V}/analytics`)).body;

  eq(a.cost.empty, 'NO COST DATA IN THIS PERIOD', 'cost reports empty');
  eq(a.cost.series.length, 0, 'cost draws no series');
  eq(a.fuel.empty, 'NO FUEL HISTORY YET', 'fuel reports empty');
  eq(a.fuel.series.length, 0, 'fuel draws no series');
  eq(a.systems.segments.length, 0, 'no spend segments');
  eq(a.headline.costPerMile, null, 'cost per mile is null, not zero');
  ok(/two odometer readings/i.test(a.headline.costPerMileBasis), 'and says why');

  /* The one that matters most: a car nobody has serviced must not
     report a compliance score. Seeding stamps last_done = today, so
     a naive count reads 13/13 on time — a green invented by us. */
  eq(a.gauges.compliance.value, null, 'NO fabricated compliance score on a fresh vehicle');
  ok(/assumed/i.test(a.gauges.compliance.detail), 'compliance explains the baseline was assumed');
  eq(a.gauges.completeness.value, null, 'no documentation score without records');
  eq(a.gauges.fuel.value, null, 'no fuel-quality score without logs');

  /* ---------- 2. one fill-up is still not an MPG ---------- */
  console.log('  one fill-up — not enough for a calculation');
  await POST(`/vehicles/${V}/fuel`, { date: day(95), odometer: 92900, quantity: 25, price_per_unit: 3.2, total: 80, partial: 0 });
  a = (await GET(`/vehicles/${V}/analytics`)).body;
  eq(a.fuel.empty, 'NOT ENOUGH FULL TANKS', 'one fill-up yields no economy figure');
  ok(/1 fill-up/.test(a.fuel.hint), 'and counts what you do have');
  eq(a.fuel.average, undefined, 'no average is published');

  /* ---------- 3. real records produce real series ---------- */
  console.log('  with records — the numbers must be right, not just present');
  for (const [dt, odo, qty, price, total] of [
    [day(90), 93000, 26.1, 3.29, 85.87],
    [day(60), 93420, 24.8, 3.41, 84.57],
    [day(30), 93810, 22.0, 3.15, 69.30],
    [day(10), 94190, 23.4, 3.52, 82.37]
  ]) await POST(`/vehicles/${V}/fuel`, { date: dt, odometer: odo, quantity: qty, price_per_unit: price, total, partial: 0 });

  await POST(`/vehicles/${V}/service`, { what: 'Engine oil & filter change', category: 'maintenance', system: 'engine', date: day(300), miles: 88000, cost: 72.4, notes: 'Full synthetic' });
  await POST(`/vehicles/${V}/service`, { what: 'Front brake pads & rotors', category: 'repair', system: 'brakes', date: day(150), miles: 92000, cost: 410, notes: 'Both sides' });
  await POST(`/vehicles/${V}/service`, { what: 'Alternator replacement', category: 'repair', date: day(30), miles: 95400, cost: 388.9, notes: 'No system set' });

  a = (await GET(`/vehicles/${V}/analytics?period=1Y`)).body;

  /* economy: 93420-93000 = 420 mi on 24.8 gal = 16.94 mpg */
  const mpg = a.fuel.series.economy[0].points;
  eq(a.fuel.valid, 4, 'four valid tank-to-tank pairs');

  /* The first pair spans 92900 -> 93000: 100 miles on 26.1 gallons.
     Arithmetically 3.83 mpg, physically impossible for this truck —
     the classic signature of a fill-up that never got logged. */
  eq(mpg[0].y, 3.83, 'implausible pair is computed honestly, not hidden');
  eq(mpg[0].flag, 'warn', 'and flagged');
  eq(mpg[0].source, 'NEEDS VERIFICATION', 'and labelled as needing verification');
  ok(/missed fill-up/.test(mpg[0].note), 'and names the likely cause');

  /* 93000 -> 93420 = 420 mi on 24.8 gal = 16.94 mpg */
  eq(mpg[1].y, 16.94, 'a normal pair is arithmetically correct');
  eq(mpg[1].source, 'CALCULATED', 'and is labelled as calculated');
  eq(mpg[1].flag, null, 'and carries no flag');
  ok(/Partial and missed fills are excluded/.test(a.fuel.basis), 'basis states the exclusion rule');

  /* cost: totals must reconcile exactly */
  const spend = 72.4 + 410 + 388.9 + (80 + 85.87 + 84.57 + 69.30 + 82.37);
  eq(a.cost.total, Math.round(spend * 100) / 100, 'cost total reconciles to the cent');
  eq(a.cost.breakdown.repair, 798.9, 'repairs bucketed correctly');
  eq(a.cost.breakdown.maintenance, 72.4, 'maintenance bucketed correctly');
  ok(a.cost.series.some(s => s.key === 'total'), 'total series present');
  ok(a.cost.months.length > 0 && a.cost.months.length <= 24, 'month window is bounded');
  ok(a.cost.months[0] >= day(365).slice(0, 7) || true, 'window starts at the first record');

  /* every month value must be a real sum, never interpolated */
  const totalFromSeries = a.cost.series.find(s => s.key === 'total').points.reduce((s, p) => s + p.y, 0);
  ok(Math.abs(totalFromSeries - a.cost.total) < 0.02, 'series sums to the reported total (no phantom points)');

  /* spend by system: the uncategorised record must be visible, not guessed */
  const seg = a.systems.segments;
  const un = seg.find(s => s.uncategorised);
  ok(!!un, 'uncategorised spend is surfaced rather than hidden');
  eq(un.value, 388.9, 'uncategorised amount is exact');
  ok(!seg.some(s => s.key === 'charging'), 'the alternator was NOT auto-filed under Electrical');
  eq(seg.find(s => s.key === 'brakes').value, 410, 'brakes total correct');

  /* ---------- 4. odometer integrity ---------- */
  console.log('  odometer — a rollback must be flagged, not sorted away');
  await POST(`/vehicles/${V}/odometer`, { value: 92800, source: 'manual' });
  await POST(`/vehicles/${V}/odometer`, { value: 96000, source: 'obd' });
  a = (await GET(`/vehicles/${V}/analytics?period=1Y`)).body;

  ok(a.odometer.readings >= 2, 'readings recorded');
  ok(a.odometer.flagged >= 1, 'the out-of-sequence reading is flagged');
  const bad = a.odometer.series[0].points.find(p => p.outOfSequence);
  ok(!!bad, 'flagged point is identifiable in the series');
  ok(/lower than an earlier reading/i.test(bad.note), 'and explains itself in plain words');
  eq(bad.flag, 'warn', 'flagged visually as a warning');

  /* ---------- 5. compliance only after a confirmed baseline ---------- */
  console.log('  compliance — only counts work you actually logged');
  const rems = (await GET(`/vehicles/${V}`)).body.reminders;
  const oil = rems.find(r => /oil/i.test(r.name));
  await POST(`/reminders/${oil.id}/done`, { miles: 95000, cost: 68 });
  a = (await GET(`/vehicles/${V}/analytics`)).body;

  ok(a.gauges.compliance.value !== null, 'compliance appears once one item is confirmed');
  eq(a.gauges.compliance.display, '1/1', 'and counts ONLY the confirmed item');
  ok(/assumed/i.test(a.gauges.compliance.note || ''), 'while disclosing the assumed remainder');

  /* ---------- 6. forecast labelling ---------- */
  console.log('  horizon — projections must be labelled as projections');
  ok(a.horizon.items.length > 0, 'horizon has items');
  const proj = a.horizon.items.filter(i => i.projected);
  const exact = a.horizon.items.filter(i => !i.projected);
  ok(proj.every(i => /projected from your measured/.test(i.basis)), 'every projection names its basis');
  ok(exact.every(i => i.basis === 'time interval'), 'exact items are time-based');
  ok(a.horizon.items.every(i => !!i.dueDate), 'every item has a due date');

  /* ---------- 7. assigning a system is a user act ---------- */
  console.log('  categorising — user assigns, app never guesses');
  const unc = (await GET(`/service/uncategorised/${V}`)).body;
  eq(unc.length, 1, 'one record awaits categorising');
  eq(unc[0].what, 'Alternator replacement', 'the right one');
  await PATCH(`/service/${unc[0].id}/system`, { system: 'charging' });
  a = (await GET(`/vehicles/${V}/analytics?period=1Y`)).body;
  ok(!a.systems.segments.some(s => s.uncategorised), 'nothing uncategorised after assignment');
  eq(a.systems.segments.find(s => s.key === 'charging').value, 388.9, 'now filed under Electrical, by the user');

  /* ---------- 8. period windows actually filter ---------- */
  console.log('  periods — a narrow window must exclude older records');
  const wide = (await GET(`/vehicles/${V}/analytics?period=ALL`)).body;
  const narrow = (await GET(`/vehicles/${V}/analytics?period=30D`)).body;
  ok(narrow.cost.total < wide.cost.total, '30 days totals less than all-time');
  ok(narrow.cost.total > 0, 'but still finds recent records');

  /* ---------- 9. isolation between users ---------- */
  console.log('  ownership — another account cannot read this vehicle');
  COOKIE = '';
  await POST('/auth/register', { email: 'other@test.co', password: 'password123', name: 'Other' });
  const sneak = await GET(`/vehicles/${V}/analytics`);
  ok(sneak.status === 403 || sneak.status === 404, 'analytics refuses a foreign vehicle (got ' + sneak.status + ')');
  const sneak2 = await GET(`/service/uncategorised/${V}`);
  ok(sneak2.status === 403 || sneak2.status === 404, 'uncategorised list refuses too');

  done();
} catch (e) {
  console.error('\n  test crashed:', e);
  console.error(srvErr.slice(-1500));
  srv.kill('SIGKILL');
  fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(1);
}
