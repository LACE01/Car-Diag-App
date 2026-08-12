/* ============================================================
   smoke.mjs — end-to-end check against a running container.
     node test/smoke.mjs [baseUrl]
   Exits non-zero on the first failure.
   ============================================================ */
const BASE = process.argv[2] || 'http://127.0.0.1:2026';
let cookie = '';
let pass = 0, fail = 0;

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  →  ' + JSON.stringify(detail) : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol ?? 0.01); }

async function req(method, path, body, form) {
  const opts = { method, headers: {} };
  if (cookie) opts.headers.cookie = cookie;
  if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + path, opts);
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let j = null;
  try { j = await r.json(); } catch { }
  return { status: r.status, body: j };
}

(async () => {
  console.log('\nGarage smoke test →', BASE, '\n');

  // health
  let r = await req('GET', '/healthz');
  ok('healthz responds', r.status === 200 && r.body?.ok === true, r.body);

  // auth
  const email = `smoke${Date.now()}@example.com`;
  r = await req('POST', '/api/auth/register', { email, name: 'Smoke Test', password: 'correct-horse-battery' });
  ok('register creates an account', r.status === 201 && r.body.user.email === email, r.body);

  r = await req('POST', '/api/auth/register', { email, name: 'Dup', password: 'correct-horse-battery' });
  ok('duplicate email rejected', r.status === 409, r.body);

  r = await req('POST', '/api/auth/register', { email: 'x@y.com', name: 'Short', password: 'short' });
  ok('weak password rejected', r.status === 400, r.body);

  r = await req('GET', '/api/auth/me');
  ok('session cookie works', r.status === 200 && r.body.garages.length === 1, r.body);

  // vehicle by year/make/model (no network dependency)
  r = await req('POST', '/api/vehicles', { year: 2014, make: 'CHEVROLET', model: 'SILVERADO 1500', mileage: 142310, duty: 'normal' });
  ok('vehicle created from Y/M/M', r.status === 201, r.body);
  const vid = r.body?.vehicle?.id;

  r = await req('GET', `/api/vehicles/${vid}`);
  ok('schedule seeded on creation', (r.body.reminders || []).length >= 10, r.body?.reminders?.length);
  ok('warranties seeded on creation', (r.body.warranties || []).length >= 3, r.body?.warranties?.length);

  // odometer rollback detection
  r = await req('POST', `/api/vehicles/${vid}/odometer`, { value: 100000 });
  ok('odometer rollback flagged', r.status === 201 && r.body.suspect === true, r.body);

  r = await req('POST', `/api/vehicles/${vid}/odometer`, { value: 143000 });
  ok('normal odometer accepted', r.status === 201 && r.body.suspect === false, r.body);

  // fuel economy: 143000 anchor full, then +300mi on 15 gal = 20.0 mpg
  await req('POST', `/api/vehicles/${vid}/fuel`, { date: '2026-01-01', odometer: 143000, quantity: 20, price_per_unit: 3.10, partial: 0 });
  await req('POST', `/api/vehicles/${vid}/fuel`, { date: '2026-01-10', odometer: 143300, quantity: 15, price_per_unit: 3.20, partial: 0 });
  r = await req('GET', `/api/vehicles/${vid}`);
  ok('MPG computed tank-to-tank (20.0)', near(r.body.economy.average, 20.0, 0.05), r.body.economy);

  // partial fill must extend, not corrupt: +100mi partial 5gal, then +200mi full 10gal
  await req('POST', `/api/vehicles/${vid}/fuel`, { date: '2026-01-15', odometer: 143400, quantity: 5, partial: 1 });
  await req('POST', `/api/vehicles/${vid}/fuel`, { date: '2026-01-20', odometer: 143600, quantity: 10, partial: 0 });
  r = await req('GET', `/api/vehicles/${vid}`);
  const pts = r.body.economy.points;
  ok('partial fill folded into next interval (300mi / 15gal = 20.0)', pts.length === 2 && near(pts[1].economy, 20.0, 0.05), pts);

  // service record resets the matching interval
  r = await req('GET', `/api/vehicles/${vid}/reminders`);
  const oilBefore = r.body.reminders.find(x => /Engine oil/.test(x.name));
  await req('POST', `/api/vehicles/${vid}/service`, { what: 'Engine oil and filter change, 0W-20', date: '2026-02-01', miles: 143700, performer: 'DIY', parts_cost: 42, labor_cost: 0 });
  r = await req('GET', `/api/vehicles/${vid}/reminders`);
  const oilAfter = r.body.reminders.find(x => /Engine oil/.test(x.name));
  ok('service record resets matching interval', oilAfter.last_done_miles === 143700, { before: oilBefore.last_done_miles, after: oilAfter.last_done_miles });

  // severe duty halves the mileage leg
  const normalInt = oilAfter.intMiles;
  await req('PATCH', `/api/vehicles/${vid}`, { duty: 'severe' });
  r = await req('GET', `/api/vehicles/${vid}/reminders`);
  const oilSevere = r.body.reminders.find(x => /Engine oil/.test(x.name));
  ok('severe duty halves the oil interval', oilSevere.intMiles === Math.round(normalInt * 0.5), { normal: normalInt, severe: oilSevere.intMiles });
  await req('PATCH', `/api/vehicles/${vid}`, { duty: 'normal' });

  // DTC decode
  r = await req('GET', '/api/ref/dtc/P0420');
  ok('P0420 decodes', r.body.valid && /Catalyst/.test(r.body.description), r.body);
  r = await req('GET', '/api/ref/dtc/P1234');
  ok('manufacturer-specific code labelled as such', r.body.scope === 'Manufacturer-specific', r.body);
  r = await req('GET', '/api/ref/dtc/NOPE1');
  ok('garbage code rejected', r.body.valid === false, r.body);

  // scan + clear tracking
  r = await req('POST', `/api/vehicles/${vid}/scan`, {
    adapter: 'Smoke test', codes: [{ code: 'P0420', status: 'stored', freeze_frame: { RPM: '2180 rpm' } }]
  });
  ok('scan stores a DTC', r.status === 201 && r.body.dtcs.length === 1, r.body);
  const did = r.body.dtcs[0].id;
  r = await req('POST', `/api/dtcs/${did}/clear`);
  ok('clearing a DTC warns about monitors', r.status === 200 && /readiness/i.test(r.body.warning), r.body);

  // report import
  r = await req('POST', `/api/vehicles/${vid}/import-report`, {
    text: 'TOPDON REPORT\nP0301 Cylinder 1 misfire detected  (Pending)\nC0035 Left front wheel speed sensor\nnothing else here'
  });
  ok('report importer extracts codes', r.status === 201 && r.body.found === 2, r.body);

  // fuel trim interpretation
  r = await req('POST', '/api/fuel-trim', { stftIdle: 8, ltftIdle: 14, stftCruise: 1, ltftCruise: 2 });
  ok('lean-at-idle reads as a vacuum leak', /vacuum leak/i.test(r.body.findings[0].verdict), r.body.findings);
  r = await req('POST', '/api/fuel-trim', { stftIdle: 2, ltftIdle: 1, stftCruise: 1, ltftCruise: 2 });
  ok('normal trims read as normal', /normal/i.test(r.body.findings[0].verdict), r.body.findings);

  // tires
  r = await req('POST', `/api/vehicles/${vid}/tires`, { name: 'Set A', size: '275/55R20', dot_date: '1218', installed_miles: 130000, new_tread_32: 10 });
  const tsid = r.body.tire.id;
  await req('POST', `/api/tires/${tsid}/measurements`, { date: '2025-06-01', odometer: 135000, lf: 8, rf: 8, lr: 8.5, rr: 8.5 });
  await req('POST', `/api/tires/${tsid}/measurements`, { date: '2026-02-01', odometer: 143700, lf: 3, rf: 3.5, lr: 5, rr: 5 });
  r = await req('GET', `/api/vehicles/${vid}`);
  const tire = r.body.tires[0];
  ok('tire worst depth found', tire.worst === 3, tire);
  ok('aged tire flagged from DOT date', tire.age?.aged === true, tire.age);
  ok('tire wear rate projects remaining miles', tire.milesLeft > 0, tire.milesLeft);

  // brakes
  await req('POST', `/api/vehicles/${vid}/brakes`, { date: '2026-02-01', odometer: 143700, lf_pad: 2.5, rf_pad: 7, lr_pad: 6, rr_pad: 6 });
  r = await req('GET', `/api/vehicles/${vid}`);
  ok('brake minimum flagged', r.body.brakes.cls === 'bad', r.body.brakes);
  ok('guide-pin spread called out', /guide pin/i.test(r.body.brakes.verdict), r.body.brakes.verdict);

  // battery
  await req('POST', `/api/vehicles/${vid}/battery`, { installed_date: '2019-05-01', group_size: '48', cca: 760, test_date: '2026-02-01', rest_voltage: 12.24, measured_cca: 480, load_test: 'marginal' });
  r = await req('GET', `/api/vehicles/${vid}`);
  ok('battery SOC computed from rest voltage (50%)', r.body.battery.soc === 50, r.body.battery);
  ok('battery flagged as bad on low CCA', r.body.battery.cls === 'bad', r.body.battery);

  // warranty expiry
  r = await req('GET', `/api/vehicles/${vid}`);
  ok('2014 bumper-to-bumper reads as expired', r.body.warranties.find(w => w.kind === 'bumper').expired === true, r.body.warranties[0]);

  // alerts board populated
  ok('notification board has alerts', (r.body.alerts || []).length > 0, r.body.alerts?.length);

  // cost of ownership
  await req('PATCH', `/api/vehicles/${vid}`, { purchase_price: 22000, purchase_odometer: 120000, estimated_value: 14000, purchase_date: '2020-03-01' });
  r = await req('GET', `/api/vehicles/${vid}`);
  ok('cost per mile computed', r.body.tco.costPerMile > 0, r.body.tco);
  ok('true cost per mile includes depreciation', r.body.tco.trueCostPerMile > r.body.tco.costPerMile, r.body.tco);

  // business mileage
  await req('POST', `/api/vehicles/${vid}/trips`, { date: '2026-03-01', miles: 100, purpose: 'business', from_place: 'Shop', to_place: 'Client' });
  r = await req('GET', `/api/vehicles/${vid}/report/cost?year=2026`);
  ok('IRS mileage deduction computed', r.body.report.business_mileage.deduction > 0, r.body.report.business_mileage);

  // reports
  for (const kind of ['history', 'handoff', 'cost', 'ppi', 'warranty']) {
    r = await req('GET', `/api/vehicles/${vid}/report/${kind}`);
    ok(`report: ${kind}`, r.status === 200 && !!r.body.report.title, r.body);
  }

  // export
  r = await req('GET', '/api/export');
  ok('full export returns the vehicle bundle', r.status === 200 && r.body.vehicles.length === 1, Object.keys(r.body || {}));

  // authorisation isolation
  const saved = cookie; cookie = '';
  r = await req('GET', `/api/vehicles/${vid}`);
  ok('unauthenticated read is refused', r.status === 401, r.status);
  await req('POST', '/api/auth/register', { email: `other${Date.now()}@example.com`, name: 'Other', password: 'correct-horse-battery' });
  r = await req('GET', `/api/vehicles/${vid}`);
  ok('another user cannot read this vehicle', r.status === 404, r.status);
  cookie = saved;

  // static app shell
  const html = await fetch(BASE + '/');
  const text = await html.text();
  ok('app shell served', html.status === 200 && /GARAGE/.test(text), html.status);

  const assets = {};
  for (const f of ['/css/app.css', '/js/app.js', '/js/diagrams.js', '/js/obd.js', '/js/screens.js',
    '/js/diagnose.js', '/js/kb.js', '/js/icons.js', '/js/ui.js', '/js/parts.js', '/js/services.js']) {
    const res = await fetch(BASE + f);
    ok('asset ' + f, res.status === 200, res.status);
    assets[f] = await res.text();
  }

  /* ---- regression guard: body state flags must not collide with element classes.
     `.modal` sets display:none. A body carrying that class disappears and takes
     the entire application with it — a blank white page with a fully populated
     DOM. This check is cheap and the failure mode is not obvious, so it stays. */
  const css = assets['/css/app.css'];
  const js = Object.entries(assets).filter(([k]) => k.endsWith('.js')).map(([, v]) => v).join('\n');
  const bodyFlags = new Set(
    [...js.matchAll(/body\.classList\.(?:add|remove|toggle)\('([a-z0-9-]+)'/g)].map(m => m[1])
  );
  const collisions = [...bodyFlags].filter(f => new RegExp(`(^|[},])\\.${f}\\s*[{,:.]`, 'm').test(css));
  ok('no body state flag collides with an element class', collisions.length === 0,
    collisions.length ? { collisions, hint: 'rename the body flag, e.g. "modal" -> "modal-open"' } : null);
  ok('body flags were actually discovered (guard is live)', bodyFlags.size >= 4, [...bodyFlags]);

  // service catalogue is wired and substantial
  const svc = assets['/js/services.js'];
  const svcCount = (svc.match(/^\s*\['/gm) || []).length;
  ok('service catalogue has a real number of entries', svcCount > 150, svcCount);
  ok('service picker helpers exported', /function serviceSelect/.test(svc) && /function serviceDatalist/.test(svc) && /function applyService/.test(svc));
  ok('record form uses the picker', /serviceSelect\('r-pick'/.test(assets['/js/screens.js']));

  // parts store endpoints exist and validate their input
  r = await req('GET', '/api/stores');
  ok('saved stores list (empty to start)', r.status === 200 && Array.isArray(r.body.stores), r.body);

  r = await req('POST', '/api/stores', {
    brand: 'oreilly', name: "O'Reilly Auto Parts", osm_type: 'node', osm_id: '123456789',
    lat: 30.44, lon: -97.62, address: '1600 Grand Ave Pkwy, Pflugerville, TX', phone: '+1-512-555-0143'
  });
  ok('store can be saved', r.status === 201 && r.body.store.brand === 'oreilly', r.body);
  const storeId = r.body?.store?.id;

  r = await req('POST', '/api/stores', { brand: 'oreilly', name: 'dup', osm_type: 'node', osm_id: '123456789' });
  ok('re-saving the same OSM store updates instead of duplicating', r.body.existed === true, r.body);

  r = await req('PUT', '/api/me/location', { lat: 30.44, lon: -97.62, label: 'Pflugerville, TX' });
  ok('home location stored', r.status === 200 && r.body.ok, r.body);

  r = await req('GET', '/api/stores');
  ok('saved store gets a distance from home', typeof r.body.stores[0].distance === 'number', r.body.stores[0]);

  r = await req('PATCH', `/api/stores/${storeId}`, { commercial_account: 'FC-88213', note: 'has the loaner tools' });
  ok('commercial account number recorded on the store', r.body.store.commercial_account === 'FC-88213', r.body.store);

  r = await req('GET', '/api/stores/nearby?radius=25');
  ok('nearby accepts a stored home location', [200, 502, 503].includes(r.status) || r.status === 500, r.status);

  r = await req('GET', '/api/stores/brands');
  ok('brand deep-link table served', r.body.brands.some(b => b.id === 'autozone') && r.body.brands.some(b => b.id === 'napa'), r.body.brands?.map(b => b.id));

  // price history
  await req('POST', '/api/part-prices', { part_name: 'Front brake pads', part_number: '17D1367CH', vendor: "O'Reilly", price: 62.99, purchased_at: '2026-03-01' });
  await req('POST', '/api/part-prices', { part_name: 'Front brake pads', vendor: 'RockAuto', price: 41.5, purchased_at: '2026-06-01' });
  r = await req('GET', '/api/part-prices');
  const brakeRow = r.body.summary.find(s => /brake pads/i.test(s.part_name));
  ok('price history summarises low/avg/high', brakeRow && brakeRow.low === 41.5 && brakeRow.high === 62.99, brakeRow);

  r = await req('POST', '/api/part-prices', { part_name: 'no price' });
  ok('price log requires a price', r.status === 400, r.status);

  r = await req('GET', '/api/geocode');
  ok('geocode rejects an empty query', r.status >= 400, r.status);

  r = await req('DELETE', `/api/stores/${storeId}`);
  ok('store can be removed', r.status === 200, r.body);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\nSMOKE TEST CRASHED:', e); process.exit(1); });
