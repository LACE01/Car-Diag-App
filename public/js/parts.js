/* ============================================================
   parts.js — the Find Parts screen

   What is real here: store locations, addresses, phone numbers,
   opening hours and distances, from OpenStreetMap via the server.
   Plus your own purchase price history, which is the one form of
   parts pricing that needs no vendor cooperation and never breaks.

   What is NOT here, and cannot honestly be: live shelf counts for
   AutoZone, O'Reilly or NAPA. None of them publish a public
   inventory API. O'Reilly's First Call and NAPA's PROLink are real
   and do return local stock, but both require a Professional
   account; AutoZone has no developer programme at all. Scraping
   their sites would violate their terms and break constantly, so
   this screen deep-links instead and says so plainly.
   ============================================================ */
const PARTS = {
  term: '',
  loaded: false,
  saved: [],
  home: null,
  nearby: null,
  radius: 25,
  prices: null,
  busy: false
};

const BRAND_ACCENT = {
  autozone: '#F5A623', oreilly: '#2BB673', napa: '#4A90D9',
  advance: '#E85D5D', carquest: '#8B7CF8', other: '#8B8AA5'
};
const PART_SUGGESTIONS = [
  'front brake pads', 'brake rotors', 'water pump', 'alternator', 'starter',
  'oil filter', 'air filter', 'cabin air filter', 'HO2S oxygen sensor',
  'spark plugs', 'ignition coil', 'radiator', 'thermostat', 'battery',
  'serpentine belt', 'wheel bearing', 'shocks', 'struts', 'CV axle',
  'fuel pump', 'fuel filter', 'wiper blades', 'headlight bulb'
];

/* ---------- data ---------- */
async function loadPartsData(force) {
  if (PARTS.loaded && !force) return;
  try {
    const [s, p] = await Promise.all([API.get('/stores'), API.get('/part-prices')]);
    PARTS.saved = s.stores; PARTS.home = s.home;
    PARTS.prices = p;
    PARTS.loaded = true;
  } catch (e) { /* offline: render what we have */ }
}

function renderParts() {
  const el = document.getElementById('s-parts');
  if (!PARTS.loaded) {
    loadPartsData().then(() => { if (state.screen === 'parts') renderParts(); });
  }
  const v = activeVehicle();

  el.innerHTML =
    /* ---- what am I looking for ---- */
    '<div class="card" style="margin-bottom:22px">' +
    (v
      ? '<span class="mlabel">Fitment locked to this vehicle</span>' +
      '<div class="grid g3" style="gap:14px;margin-bottom:16px">' +
      '<div class="field mono"><small style="font-family:Inter">' + esc(v.vin || 'No VIN on file') + '</small></div>' +
      '<div class="field">' + esc(vLabel(v)) + '</div>' +
      '<div class="field">' + esc(v.engine || '—') + ' <small>' + esc(String(v.drive || '').split('/')[0]) + '</small></div></div>'
      : '<div class="note" style="margin-bottom:14px">No vehicle selected — searches will not be filtered to a fitment. Add a vehicle for that.</div>') +
    '<span class="mlabel">What are you looking for?</span><div class="row wrap" style="gap:10px">' +
    '<input class="inp" id="partq" list="part-list" autocomplete="off" value="' + esc(PARTS.term) + '" ' +
    'placeholder="brake pads, water pump, HO2S…" style="flex:1;min-width:200px" ' +
    'onkeydown="if(event.key===\'Enter\')searchParts()">' +
    '<datalist id="part-list">' + PART_SUGGESTIONS.map(t => '<option value="' + t + '">').join('') + '</datalist>' +
    '<button class="btn" onclick="searchParts()">Search</button></div>' +
    '<div class="row wrap" style="gap:8px;margin-top:14px">' +
    PART_SUGGESTIONS.slice(0, 9).map(t =>
      '<button class="chip" onclick="document.getElementById(\'partq\').value=\'' + t + '\';searchParts()">' + t + '</button>').join('') +
    '</div></div>' +

    /* ---- my stores ---- */
    '<div class="between wrap" style="margin:0 0 14px"><h3 style="font-size:19px">My stores</h3>' +
    '<div class="row" style="gap:8px">' +
    (PARTS.home ? '<span class="chip grey">' + ic('pin', 12) + ' ' + esc(PARTS.home.home_label || 'location set') + '</span>' : '') +
    '<button class="btn sm ghost" onclick="findStores()">' + ic('pin', 14) + ' Find stores near me</button></div></div>' +
    '<div id="mystores">' + myStoresHtml() + '</div>' +

    '<div id="nearbyout">' + (PARTS.nearby ? nearbyHtml() : '') + '</div>' +

    /* ---- search results ---- */
    '<div id="partout">' + (PARTS.term ? searchHtml() : '') + '</div>' +

    /* ---- price history ---- */
    '<div class="between" style="margin:30px 0 14px"><h3 style="font-size:19px">What I actually paid</h3>' +
    '<button class="btn sm" onclick="logPartPrice()">+ Log a price</button></div>' +
    '<div id="priceout">' + priceHtml() + '</div>';
}

/* ---------- saved stores ---------- */
function myStoresHtml() {
  if (!PARTS.saved.length) {
    return '<div class="card empty"><div style="color:var(--primary);opacity:.4;margin-bottom:10px">' + ic('pin', 40) + '</div>' +
      '<b style="display:block;color:var(--ink);margin-bottom:6px">No stores saved yet</b>' +
      '<p class="note" style="max-width:460px;margin:0 auto 16px">Find the AutoZone, O\'Reilly and NAPA nearest you and pin them here. Then every part search gives you a one-tap link into that chain\'s catalogue, their phone number, and directions.</p>' +
      '<button class="btn sm" onclick="findStores()">Find stores near me</button></div>';
  }
  return '<div class="grid g2">' + PARTS.saved.map(s => storeCard(s, true)).join('') + '</div>';
}

function storeCard(s, saved) {
  const accent = BRAND_ACCENT[s.brand] || BRAND_ACCENT.other;
  const term = PARTS.term || '';
  return '<div class="card tight" style="border-left:4px solid ' + accent + '">' +
    '<div class="between wrap" style="gap:10px;margin-bottom:8px">' +
    '<div style="min-width:0"><b style="font-weight:600;font-size:15px">' + esc(s.brand_label || s.name) + '</b>' +
    '<div class="note">' + esc(s.address || s.name) + '</div></div>' +
    (s.distance != null ? '<span class="chip grey mono">' + s.distance + ' mi</span>' : '') + '</div>' +
    (s.hours ? '<div class="note" style="margin-bottom:8px">' + ic('bell', 11) + ' ' + esc(s.hours) + '</div>' : '') +
    (s.commercial_account ? '<div class="note" style="margin-bottom:8px">Account: <span class="mono">' + esc(s.commercial_account) + '</span></div>' : '') +
    '<div class="row wrap" style="gap:7px">' +
    (s.phone ? '<a class="btn xs ghost" href="tel:' + esc(String(s.phone).replace(/[^\d+]/g, '')) + '">Call</a>' : '') +
    '<a class="btn xs ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lon + '">Directions</a>' +
    (term ? '<a class="btn xs" target="_blank" rel="noopener" href="' + brandSearchUrl(s.brand, term) + '">Search ' + esc(term) + '</a>' : '') +
    (saved
      ? '<button class="btn xs ghost" onclick="editStore(' + s.id + ')">Edit</button>' +
      '<button class="btn xs ghost" onclick="unsaveStore(' + s.id + ')">Remove</button>'
      : '<button class="btn xs" onclick=\'saveStore(' + JSON.stringify(JSON.stringify(s)) + ')\'>Save</button>') +
    '</div></div>';
}

function brandSearchUrl(brand, term) {
  const v = activeVehicle();
  const q = encodeURIComponent([v?.year, v?.make, v?.model, term].filter(Boolean).join(' '));
  const t = encodeURIComponent(term);
  return {
    autozone: 'https://www.autozone.com/searchresult?searchText=' + q,
    oreilly: 'https://www.oreillyauto.com/search?q=' + q,
    napa: 'https://www.napaonline.com/en/search?text=' + q,
    advance: 'https://shop.advanceautoparts.com/web/SearchResults?searchTerm=' + q,
    carquest: 'https://www.carquest.com/search?q=' + q
  }[brand] || ('https://www.google.com/search?q=' + q);
}

/* ---------- finding stores ---------- */
async function findStores() {
  const secure = window.isSecureContext && navigator.geolocation;
  openModal(modalHead('Find parts stores near you',
    'Locations come from OpenStreetMap, which tags every AutoZone, O\'Reilly, NAPA, Advance and Carquest with address, phone and hours. Free, no account, no tracking.') +
    (secure
      ? '<button class="btn block" onclick="useGeolocation()">' + ic('pin', 15) + ' Use my current location</button>' +
      '<div class="note" style="text-align:center;margin:12px 0">or</div>'
      : '<div class="safety" style="margin-bottom:16px"><b>Browser location is unavailable here</b>' +
      'You are on <span class="mono">' + esc(location.origin) + '</span>. Browsers only hand out GPS coordinates on https:// or on http://localhost, so the "use my location" button cannot work over a plain LAN address. Enter a ZIP code instead — it is one-time, and Garage remembers it. Put the app behind a reverse proxy with a certificate and the button comes back.</div>') +
    fld('ZIP code, or city and state', inp('geo-q', { ph: '78660  ·  or  Pflugerville, TX', value: PARTS.home?.home_label || '' })) +
    '<div style="height:14px"></div>' +
    fld('Search radius', sel('geo-r', [[10, '10 miles'], [25, '25 miles'], [40, '40 miles'], [60, '60 miles']], PARTS.radius)) +
    '<div style="height:18px"></div>' +
    '<button class="btn block" onclick="searchByZip()">Find stores</button>' +
    '<p class="note" style="margin:14px 0 0">Store data © OpenStreetMap contributors, ODbL. Hours and phone numbers are community-maintained, so call before you drive across town.</p>');
}

async function useGeolocation() {
  closeModal();
  toast('Asking your browser for a location…');
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      await API.req('PUT', '/me/location', { lat, lon, label: 'Current location' });
      await runNearby({ lat, lon });
    },
    err => toast('Location refused or unavailable (' + err.message + '). Enter a ZIP code instead.', 'bad'),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
  );
}

async function searchByZip() {
  const q = val('geo-q').trim();
  PARTS.radius = +val('geo-r') || 25;
  if (!q) return toast('Enter a ZIP code or city', 'bad');
  closeModal();
  toast('Looking up ' + q + '…');
  try {
    const g = await API.get('/geocode?q=' + encodeURIComponent(q));
    await API.req('PUT', '/me/location', { lat: g.lat, lon: g.lon, label: g.label });
    await runNearby({ lat: g.lat, lon: g.lon, label: g.label });
  } catch (e) { toast(e.message, 'bad'); }
}

async function runNearby(origin) {
  PARTS.busy = true;
  const out = document.getElementById('nearbyout');
  if (out) out.innerHTML = '<div class="card"><span class="spin"></span> Searching OpenStreetMap within ' + PARTS.radius + ' miles…</div>';
  try {
    const qs = new URLSearchParams({ lat: origin.lat, lon: origin.lon, radius: PARTS.radius });
    if (origin.label) qs.set('label', origin.label);
    PARTS.nearby = await API.get('/stores/nearby?' + qs);
    await loadPartsData(true);
    renderParts();
    const n = PARTS.nearby.stores.length;
    toast(n ? n + ' parts stores found' : 'No parts stores mapped within that radius — try a wider one', n ? 'ok' : 'bad');
  } catch (e) {
    toast(e.message, 'bad');
    if (out) out.innerHTML = '<div class="card"><p class="note" style="margin:0">' + esc(e.message) + '</p></div>';
  } finally { PARTS.busy = false; }
}

function nearbyHtml() {
  const n = PARTS.nearby;
  if (!n) return '';
  const known = n.stores.filter(s => s.brand !== 'other');
  const other = n.stores.filter(s => s.brand === 'other');
  const savedIds = new Set(PARTS.saved.map(s => s.osm_type + ':' + s.osm_id));
  const list = [...known, ...other].filter(s => !savedIds.has(s.osm_type + ':' + s.osm_id)).slice(0, 24);

  return '<h3 class="sec-h">Nearby ' +
    '<span class="chip grey">' + esc(n.origin.label || 'your location') + ' · ' + n.radius + ' mi</span>' +
    '<span class="src ' + (n.source === 'live' ? '' : 'cachetag') + '">' +
    (n.source === 'live' ? 'Live · OpenStreetMap' : n.source === 'cache' ? 'Cached' : 'Stale cache') + '</span>' +
    '<button class="btn xs ghost" onclick="PARTS.nearby=null;renderParts()">Hide</button></h3>' +
    (list.length
      ? '<div class="grid g2">' + list.map(s => storeCard(s, false)).join('') + '</div>'
      : '<div class="card"><p class="note" style="margin:0">Everything nearby is already in My stores.</p></div>') +
    '<p class="note" style="margin-top:12px">' + esc(n.attribution) + '</p>';
}

async function saveStore(json) {
  const s = typeof json === 'string' ? JSON.parse(json) : json;
  try {
    await API.post('/stores', {
      brand: s.brand, name: s.name, osm_type: s.osm_type, osm_id: s.osm_id,
      lat: s.lat, lon: s.lon, address: s.address, phone: s.phone,
      website: s.website, hours: s.hours
    });
    await loadPartsData(true);
    renderParts();
    toast(s.brand_label + ' saved', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

async function unsaveStore(id) {
  await API.del('/stores/' + id);
  await loadPartsData(true);
  renderParts();
  toast('Removed');
}

function editStore(id) {
  const s = PARTS.saved.find(x => x.id === id);
  if (!s) return;
  openModal(modalHead(s.brand_label || s.name, esc(s.address || '')) +
    fld('Label', inp('st-name', { value: s.name })) +
    '<div style="height:14px"></div>' +
    fld('Phone', inp('st-phone', { value: s.phone || '', mono: true })) +
    '<div style="height:14px"></div>' +
    fld('Hours', inp('st-hours', { value: s.hours || '', ph: 'Mo-Sa 07:30-21:00; Su 09:00-19:00' })) +
    '<div style="height:14px"></div>' +
    fld('Commercial / pro account number', inp('st-acct', { value: s.commercial_account || '', mono: true, ph: 'if you have one' })) +
    '<p class="note" style="margin:8px 0 0">A commercial account is the only route to real-time stock at these chains — O\'Reilly First Call and NAPA PROLink both return local inventory, and both require one. Record the number here so it is with the store.</p>' +
    '<div style="height:14px"></div>' +
    fld('Note', inp('st-note', { value: s.note || '', ph: 'Good machine shop · has the loaner tools' })) +
    '<div style="height:20px"></div>' +
    '<button class="btn block" onclick="saveStoreEdit(' + id + ')">Save</button>');
}
async function saveStoreEdit(id) {
  await API.patch('/stores/' + id, {
    name: val('st-name'), phone: val('st-phone'), hours: val('st-hours'),
    commercial_account: val('st-acct'), note: val('st-note')
  });
  closeModal();
  await loadPartsData(true);
  renderParts();
  toast('Saved', 'ok');
}

/* ---------- search results ---------- */
function searchParts() {
  PARTS.term = (val('partq') || '').trim();
  renderParts();
  const out = document.getElementById('partout');
  if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function searchHtml() {
  const v = activeVehicle();
  const term = PARTS.term;
  if (!term) return '';
  const q = encodeURIComponent((v ? vLabel(v) + ' ' : '') + term);

  const mine = PARTS.saved.filter(s => s.brand !== 'other');
  const online = [
    ['RockAuto', 'Catalogue pricing, usually the cheapest online. No public API, so this is a link by design.', 'https://www.rockauto.com/en/partsearch/?partname=' + encodeURIComponent(term)],
    ['eBay Motors', 'New, used and OEM take-offs. Their Browse API has a free tier if you want real listings in-app later.', 'https://www.ebay.com/sch/i.html?_nkw=' + q],
    ['Google Shopping', 'Price comparison across every seller at once', 'https://www.google.com/search?tbm=shop&q=' + q],
    ['Amazon', 'Fast delivery, but verify fitment yourself — their compatibility data is not ACES', 'https://www.amazon.com/s?k=' + q]
  ];

  const history = (PARTS.prices?.summary || []).find(s => s.part_name.toLowerCase().includes(term.toLowerCase()));

  return '<h3 class="sec-h">Where to buy <span class="chip grey">' + esc(term) + '</span>' +
    (v ? '<span class="chip">' + esc(vLabel(v)) + '</span>' : '') + '</h3>' +

    (history
      ? '<div class="card" style="margin-bottom:18px"><span class="mlabel">You have bought this before</span>' +
      '<div class="grid g3" style="gap:14px">' +
      '<div><span class="mlabel mute">Lowest</span><div class="field mono">' + money(history.low) + '</div></div>' +
      '<div><span class="mlabel mute">Average</span><div class="field mono">' + money(history.avg) + '</div></div>' +
      '<div><span class="mlabel mute">Highest</span><div class="field mono">' + money(history.high) + '</div></div></div>' +
      '<p class="note" style="margin:12px 0 0">Across ' + history.times + ' purchase' + (history.times > 1 ? 's' : '') + '. This is the only price signal here that is genuinely yours — no vendor can take it away or change the terms on it.</p></div>'
      : '') +

    (mine.length
      ? '<span class="mlabel">Your stores</span><div class="grid g2" style="margin-bottom:20px">' +
      mine.map(s => storeCard(s, true)).join('') + '</div>'
      : '<div class="card" style="margin-bottom:18px"><p class="note" style="margin:0">Pin your AutoZone, O\'Reilly and NAPA above and they show up here with one-tap search links and phone numbers.</p></div>') +

    '<span class="mlabel">Online</span><div class="grid g4" style="margin-bottom:20px">' +
    online.map(x => '<a class="card" href="' + x[2] + '" target="_blank" rel="noopener" style="text-decoration:none;display:block">' +
      '<b style="font-weight:600;font-size:15px">' + x[0] + '</b>' +
      '<p class="note" style="margin:6px 0 14px">' + x[1] + '</p>' +
      '<span class="btn xs ghost">Open search ' + ic('arrow', 12) + '</span></a>').join('') + '</div>' +

    '<div class="card">' +
    (v ? '<div class="rowitem"><div class="ico">' + ic('factory', 20) + '</div><div class="txt"><b>' + esc(v.make) + ' dealer parts counter</b>' +
      '<span>For OEM-only parts, and anything still under warranty</span></div>' +
      '<a class="btn xs ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/' + encodeURIComponent(v.make + ' dealer parts near me') + '">Find one</a></div>' : '') +
    '<div class="rowitem"><div class="ico">' + ic('doc', 20) + '</div><div class="txt"><b>Look up the procedure at your library</b>' +
    '<span>ChiltonLibrary and EBSCO Auto Repair Source are free with a library card — wiring diagrams, torque specs and TSBs included</span></div>' +
    '<a class="btn xs ghost" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent('ChiltonLibrary OR "Auto Repair Source" library card') + '">Find it</a></div>' +
    '<div class="rowitem"><div class="ico">' + ic('money', 20) + '</div><div class="txt"><b>Log what you paid</b>' +
    '<span>Builds your own price history so the next quote has something to be measured against</span></div>' +
    '<button class="btn xs" onclick="logPartPrice(\'' + esc(term).replace(/'/g, "\\'") + '\')">Log a price</button></div></div>' +

    '<p class="note" style="margin-top:14px"><b>On live inventory:</b> AutoZone publishes no developer API at all. O\'Reilly\'s First Call and NAPA\'s PROLink do return real local stock, but both require a Professional account, and integration runs through EDI or an aggregator such as PartsTech — whose base tier is free and reaches around 20,000 parts stores. If you ever get commercial accounts, that is the door, and the connector slots in behind this screen without changing anything you see here.</p>';
}

/* ---------- price history ---------- */
function priceHtml() {
  const p = PARTS.prices;
  if (!p || !p.prices.length) {
    return '<div class="card"><p class="note" style="margin:0">Nothing logged. Every time you buy a part, record what you paid and where. After a couple of years this is the only parts-pricing data you own outright — it tells you whether $118 for an alternator is a deal, and it does not depend on any retailer keeping an API alive.</p></div>';
  }
  return '<div class="card">' +
    '<div class="scrollx"><table class="tbl"><thead><tr>' +
    '<th>Part</th><th>Number</th><th>Where</th><th>When</th><th class="num">Price</th><th></th></tr></thead><tbody>' +
    p.prices.slice(0, 40).map(r => '<tr>' +
      '<td>' + esc(r.part_name) + (r.brand ? '<div class="note">' + esc(r.brand) + '</div>' : '') + '</td>' +
      '<td class="mono" style="font-size:12px">' + esc(r.part_number || '—') + '</td>' +
      '<td>' + esc(r.vendor || '—') + '</td>' +
      '<td>' + dateShort(r.purchased_at || r.created_at) + '</td>' +
      '<td class="num">' + money(r.price) + (r.core_charge ? '<div class="note">+' + money(r.core_charge) + ' core</div>' : '') + '</td>' +
      '<td class="num"><button class="btn xs ghost" onclick="delPartPrice(' + r.id + ')">×</button></td></tr>').join('') +
    '</tbody></table></div>' +
    (p.summary.length > 1
      ? '<div style="margin-top:18px"><span class="mlabel">Spread by part</span>' +
      p.summary.slice(0, 8).map(s => '<div class="kv"><span style="flex:1;text-align:left">' + esc(s.part_name) + ' <span class="note">×' + s.times + '</span></span>' +
        '<b class="mono">' + money(s.low) + ' – ' + money(s.high) + '</b></div>').join('') + '</div>'
      : '') + '</div>';
}

function logPartPrice(term) {
  const v = activeVehicle();
  const vendorOptions = ['', ...PARTS.saved.map(s => s.brand_label + (s.address ? ' — ' + String(s.address).split(',')[0] : '')),
    'RockAuto', 'eBay', 'Amazon', 'Dealer', 'Other'];
  openModal(modalHead('Log a part price', 'What you actually paid, so future quotes have a benchmark.') +
    '<div class="grid g2" style="gap:14px">' +
    fld('Part', inp('pp-name', { value: term || PARTS.term || '', ph: 'Front brake pads' })) +
    fld('Part number', inp('pp-num', { mono: true, ph: 'ACDelco 17D1367CH' })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g3" style="gap:14px">' +
    fld('Brand', inp('pp-brand', { ph: 'ACDelco' })) +
    fld('Where', sel('pp-vendor', vendorOptions.map(x => [x, x || 'Select…']), '')) +
    fld('Date', inp('pp-date', { type: 'date', value: today() })) + '</div>' +
    '<div style="height:14px"></div><div class="grid g4" style="gap:14px">' +
    fld('Price', inp('pp-price', { type: 'number', step: '0.01', mono: true })) +
    fld('Qty', inp('pp-qty', { type: 'number', step: '1', mono: true, value: '1' })) +
    fld('Core charge', inp('pp-core', { type: 'number', step: '0.01', mono: true })) +
    fld('Warranty', inp('pp-warranty', { ph: '2 yr / lifetime' })) + '</div>' +
    '<div style="height:14px"></div>' + fld('Note', inp('pp-note')) +
    '<div style="height:20px"></div><button class="btn block" onclick="savePartPrice()">Save</button>');
}
async function savePartPrice() {
  if (!val('pp-name') || numVal('pp-price') == null) return toast('A part name and a price are required', 'bad');
  await API.post('/part-prices', {
    vehicle_id: state.activeId, part_name: val('pp-name'), part_number: val('pp-num'),
    brand: val('pp-brand'), vendor: val('pp-vendor'), price: numVal('pp-price'),
    quantity: numVal('pp-qty') || 1, core_charge: numVal('pp-core'),
    warranty: val('pp-warranty'), purchased_at: val('pp-date'), note: val('pp-note')
  });
  closeModal();
  await loadPartsData(true);
  renderParts();
  toast('Price logged', 'ok');
}
async function delPartPrice(id) {
  await API.del('/part-prices/' + id);
  await loadPartsData(true);
  renderParts();
  toast('Deleted');
}

/* used by the component inspector on the Systems screen */
function partLinks(term) {
  const v = activeVehicle();
  const q = encodeURIComponent((v ? vLabel(v) + ' ' : '') + term);
  const mine = PARTS.saved.filter(s => s.brand !== 'other')
    .map(s => [s.brand_label + (s.distance != null ? ' · ' + s.distance + ' mi' : ''), brandSearchUrl(s.brand, term)]);
  const rest = [
    ['RockAuto', 'https://www.rockauto.com/en/partsearch/?partname=' + encodeURIComponent(term)],
    ['eBay Motors', 'https://www.ebay.com/sch/i.html?_nkw=' + q],
    ['Google Shopping', 'https://www.google.com/search?tbm=shop&q=' + q]
  ];
  return [...mine, ...rest].map(x =>
    '<a class="rowitem" href="' + x[1] + '" target="_blank" rel="noopener" style="text-decoration:none">' +
    '<div class="ico">' + ic('arrow', 18) + '</div><div class="txt"><b>' + esc(x[0]) + '</b>' +
    '<span>Opens a prefilled search</span></div></a>').join('');
}

renderers.parts = renderParts;
