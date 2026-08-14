/* ============================================================
   render.test.mjs — does the client actually paint?

   Every other test checks data. This one loads the real
   index.html and every real script into a DOM, signs in against
   a real server, and walks each screen.

   It exists because the two worst bugs in this project so far
   were invisible to data tests: a body class that blanked the
   whole application, and handlers calling functions that had
   been renamed. Both produced a perfectly healthy API and a
   dead page. A test that never renders will never catch that.

   Requires jsdom (dev-only; the app itself has no dependencies
   beyond Express and the runtime's own SQLite).
   ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch {
  console.log('\n  — render test skipped: jsdom not installed (npm i -D jsdom)\n');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-render-'));
const PORT = 2600 + Math.floor(Math.random() * 300);
const BASE = 'http://127.0.0.1:' + PORT;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT) },
  stdio: ['ignore', 'ignore', 'pipe']
});
let srvErr = '';
srv.stderr.on('data', d => { srvErr += d; });

function finish(code) {
  srv.kill('SIGKILL');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { }
  process.exit(code);
}

try {
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    try { await fetch(BASE + '/healthz'); up = true; }
    catch { await new Promise(r => setTimeout(r, 100)); }
  }
  if (!up) { console.error('server did not start\n' + srvErr); finish(1); }

  /* ---------- seed an account with enough data to draw ---------- */
  let cookie = '';
  const api = async (method, url, body) => {
    const r = await fetch(BASE + '/api' + url, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    try { return await r.json(); } catch { return null; }
  };
  const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  await api('POST', '/auth/register', { email: 'r@test.co', password: 'password123', name: 'R' });
  const V = (await api('POST', '/vehicles', {
    year: 2015, make: 'Ford', model: 'F-150', nickname: 'Truck', mileage: 96000
  })).vehicle.id;

  for (const [dt, odo, qty, price, total] of [
    [day(90), 93000, 26.1, 3.29, 85.87], [day(60), 93420, 24.8, 3.41, 84.57],
    [day(30), 93810, 22.0, 3.15, 69.30], [day(10), 94190, 23.4, 3.52, 82.37]
  ]) await api('POST', `/vehicles/${V}/fuel`, { date: dt, odometer: odo, quantity: qty, price_per_unit: price, total, partial: 0 });

  await api('POST', `/vehicles/${V}/service`, { what: 'Engine oil & filter change', category: 'maintenance', system: 'engine', date: day(200), miles: 90000, cost: 72.4, notes: 'Synthetic' });
  await api('POST', `/vehicles/${V}/service`, { what: 'Front brake pads', category: 'repair', date: day(60), miles: 93500, cost: 410, notes: 'Both sides' });
  await api('POST', `/vehicles/${V}/odometer`, { value: 96000, source: 'obd' });
  /* the CRUD routes wrap the row: POST /vehicles/:id/tires -> { tire: {...} } */
  const tset = (await api('POST', `/vehicles/${V}/tires`, { name: 'All-terrains', size: '275/65R18', new_tread_32: 12, active: 1 }))?.tire;
  ok(!!tset?.id, 'tire set created for the render fixture');
  if (tset?.id) {
    await api('POST', `/tires/${tset.id}/measurements`, { date: day(120), odometer: 92000, lf: 9, rf: 9.5, lr: 10, rr: 10, psi_lf: 35, psi_rf: 35, psi_lr: 36, psi_rr: 36 });
    await api('POST', `/tires/${tset.id}/measurements`, { date: day(20), odometer: 95500, lf: 7, rf: 7.5, lr: 8.5, rr: 8.5, psi_lf: 34, psi_rf: 33, psi_lr: 35, psi_rr: 35 });
  }
  await api('POST', `/vehicles/${V}/battery`, { installed_date: day(700), group_size: '65', cca: 750, brand: 'X', test_date: day(10), rest_voltage: 12.55, measured_cca: 690, load_test: 'pass', warranty_months: 36 });
  await api('POST', `/vehicles/${V}/brakes`, { date: day(60), odometer: 93500, lf_pad: 8, rf_pad: 7.5, lr_pad: 6, rr_pad: 6.5 });

  /* ---------- boot the real page ---------- */
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const errors = [];

  /* `dangerously` is required, not optional. The client is classic
     scripts sharing one global lexical scope — a top-level `const` in
     app.js is visible to screens.js. window.eval() does NOT reproduce
     that: eval'd let/const bindings are discarded when the eval
     returns, so every later file fails with "renderers is not
     defined". Injecting real <script> elements is the only way to get
     the semantics the browser actually gives us. */
  const dom = new JSDOM(html, {
    url: BASE + '/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;

  window.addEventListener('error', e => errors.push('window error: ' + e.message));

  /* jsdom has no fetch; hand it the real one, carrying the session cookie */
  window.fetch = (url, opts = {}) => {
    const u = String(url).startsWith('http') ? String(url) : BASE + String(url);
    return fetch(u, { ...opts, headers: { ...(opts.headers || {}), cookie } });
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  window.requestAnimationFrame = fn => setTimeout(fn, 0);
  if (window.HTMLCanvasElement) window.HTMLCanvasElement.prototype.getContext = () => null;

  /* replace each external script with an inline one carrying the same
     source, in document order — exactly what the browser ends up
     executing, minus the network */
  const tags = [...window.document.querySelectorAll('script[src]')];
  ok(tags.length > 5, 'index.html loads the client scripts');

  for (const tag of tags) {
    const src = tag.getAttribute('src');
    const file = path.join(root, 'public', src.replace(/^\//, ''));
    ok(fs.existsSync(file), 'script exists on disk: ' + src);
    if (!fs.existsSync(file)) continue;
    const inline = window.document.createElement('script');
    inline.textContent = fs.readFileSync(file, 'utf8');
    try {
      tag.replaceWith(inline);                      // executes synchronously
    } catch (e) {
      fail++;
      console.error('  ✗ ' + src + ' threw while loading: ' + e.message);
    }
  }
  ok(errors.length === 0, 'no script threw while loading' + (errors.length ? ': ' + errors[0] : ''));
  errors.length = 0;

  /* Top-level `const state` / `function go()` in a classic script are
     global LEXICAL bindings — they never become properties of window.
     That is real browser behaviour, not a jsdom quirk, so the test has
     to reach them the same way a console would: indirect eval. */
  const G = expr => window.eval(expr);

  /* ---------- sign in and boot ---------- */
  G('state').user = { id: 1, name: 'R', email: 'r@test.co', garageId: 1 };
  await G('loadAll()');
  ok(G('state').vehicles.length === 1, 'dashboard loaded the vehicle');
  G('state').activeId = V;
  await G('loadDetail(true)');
  ok(!!G('state').detail, 'vehicle detail loaded');

  /* ---------- walk every screen ---------- */
  const screens = [...window.document.querySelectorAll('.screen')]
    .map(s => s.id.replace(/^s-/, ''));
  ok(screens.length >= 12, 'all screens are present in the shell');

  const renderers = G('renderers');
  for (const id of screens) {
    if (!renderers[id]) { fail++; console.error('  ✗ no renderer for screen: ' + id); continue; }
    try {
      await renderers[id]();
      await new Promise(r => setTimeout(r, 60));       // let async panels settle
      const el = window.document.getElementById('s-' + id);
      const painted = el && el.innerHTML.trim().length > 60;
      ok(painted, `screen "${id}" painted something (${el ? el.innerHTML.length : 0} chars)`);
      ok(!/undefined|NaN|\[object Object\]/.test(el?.innerHTML || ''),
        `screen "${id}" has no undefined/NaN leaking into the markup`);
    } catch (e) {
      fail++;
      console.error(`  ✗ screen "${id}" threw: ${e.message}`);
    }
  }

  /* ---------- the body-class catastrophe, guarded live ---------- */
  G('openModal')('<p>hello</p>');
  const bodyCls = [...window.document.body.classList];
  ok(!bodyCls.includes('modal'), 'opening a modal does NOT put class "modal" on <body>');
  ok(bodyCls.includes('modal-open'), 'it uses the namespaced flag instead');
  ok(window.document.getElementById('mbox').innerHTML.includes('hello'), 'modal content rendered');
  G('closeModal')();

  /* ---------- charts actually drew ---------- */
  await renderers.analytics();
  await new Promise(r => setTimeout(r, 120));
  const an = window.document.getElementById('s-analytics').innerHTML;
  ok(/<svg class="chart"/.test(an), 'analytics rendered at least one chart svg');
  ok(/class="gauge/.test(an), 'analytics rendered gauges');
  ok(/class="metric/.test(an), 'analytics rendered the telemetry strip');
  ok(/donut|empty-chart/.test(an), 'spend breakdown rendered (chart or honest empty state)');
  ok(!/NaN/.test(an), 'no NaN anywhere in the analytics markup');

  /* every path in every chart must be free of NaN — a single bad
     coordinate silently blanks the whole line in a real browser */
  const paths = [...window.document.querySelectorAll('svg.chart path')].map(p => p.getAttribute('d') || '');
  ok(paths.length > 0, 'chart paths exist');
  ok(paths.every(d => !/NaN|Infinity/.test(d)), 'no NaN or Infinity in any chart path');

  /* ---------- wear panels ---------- */
  await renderers.wear();
  await new Promise(r => setTimeout(r, 120));
  const wear = window.document.getElementById('s-wear').innerHTML;
  ok(/class="corner/.test(wear), 'four-corner tire layout rendered');
  ok(/meter|mt-track/.test(wear), 'brake meters rendered');
  ok(!/Reading your measurements/.test(wear), 'the loading placeholder was replaced');

  /* ---------- an empty vehicle must not fabricate ---------- */
  const V2 = (await api('POST', '/vehicles', { year: 2020, make: 'Honda', model: 'Civic', nickname: 'Empty' })).vehicle.id;
  G('state').activeId = V2;
  G('AN').data = null;
  await G('loadAll()');
  await G('loadDetail(true)');
  await renderers.analytics();
  await new Promise(r => setTimeout(r, 120));
  const empty = window.document.getElementById('s-analytics').innerHTML;
  ok(/NO COST DATA|NO FUEL HISTORY/.test(empty), 'a bare vehicle shows honest empty states');
  ok(!/\$0\.00\s*<\/div>\s*<div class="m-sub note">Last 12/.test(empty), 'no fabricated $0.00 headline');

  console.log(fail ? `\n  ✗ ${fail} failed, ${pass} passed\n` : `\n  ✓ render: ${pass} assertions passed\n`);
  finish(fail ? 1 : 0);
} catch (e) {
  console.error('\n  render test crashed:', e);
  console.error(srvErr.slice(-1200));
  finish(1);
}
