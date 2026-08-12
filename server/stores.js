/* ============================================================
   stores.js — nearby parts stores from OpenStreetMap.

   Why OSM and not the retailers' own store locators: AutoZone,
   O'Reilly and NAPA publish no public API, and their locator pages
   are not licensed for programmatic use. OSM tags every one of
   these as shop=car_parts with brand, address, phone and hours,
   under ODbL, and Overpass serves it for free.

   That gives real locations, real phone numbers and real distances.
   It does NOT give shelf counts — nothing free does, for these
   chains. Stock requires a commercial account with each retailer
   aggregated through something like PartsTech.

   Both upstreams are volunteer-funded, so: identify ourselves with
   a real User-Agent, cache hard, and never hammer them.
   ============================================================ */
import { db } from './db.js';

const UA = 'Garage/1.0 (self-hosted vehicle maintenance app; https://github.com/LACE01/Car-Diag-App)';
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';

const TTL_STORES = 14 * 86400e3;   // shops do not move often
const TTL_GEOCODE = 180 * 86400e3; // a ZIP centroid moves even less

/* ---------- the chains we know how to deep-link ---------- */
export const BRANDS = {
  autozone: {
    label: 'AutoZone',
    match: /autozone/i,
    accent: '#F5A623',
    search: (q) => `https://www.autozone.com/searchresult?searchText=${q}`,
    locator: 'https://www.autozone.com/locations'
  },
  oreilly: {
    label: "O'Reilly",
    match: /o\s*'?\s*reilly/i,
    accent: '#2BB673',
    search: (q) => `https://www.oreillyauto.com/search?q=${q}`,
    locator: 'https://locations.oreillyauto.com'
  },
  napa: {
    label: 'NAPA',
    match: /\bnapa\b/i,
    accent: '#4A90D9',
    search: (q) => `https://www.napaonline.com/en/search?text=${q}`,
    locator: 'https://www.napaonline.com/en/auto-parts-stores-near-me'
  },
  advance: {
    label: 'Advance Auto Parts',
    match: /advance auto/i,
    accent: '#E85D5D',
    search: (q) => `https://shop.advanceautoparts.com/web/SearchResults?searchTerm=${q}`,
    locator: 'https://stores.advanceautoparts.com'
  },
  carquest: {
    label: 'Carquest',
    match: /carquest/i,
    accent: '#8B7CF8',
    search: (q) => `https://www.carquest.com/search?q=${q}`,
    locator: 'https://stores.carquest.com'
  },
  oreilly_pro: { label: "O'Reilly First Call", match: /first call/i, accent: '#2BB673', search: (q) => `https://www.oreillyauto.com/search?q=${q}`, locator: 'https://www.firstcallonline.com' }
};

export function brandOf(tags) {
  const hay = [tags.brand, tags.name, tags.operator, tags['brand:wikidata']].filter(Boolean).join(' ');
  for (const [id, b] of Object.entries(BRANDS)) {
    if (b.match.test(hay)) return id;
  }
  return 'other';
}

/* ---------- geometry ---------- */
export function haversineMiles(aLat, aLon, bLat, bLon) {
  const R = 3958.7613;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* ---------- cache ---------- */
function cacheGet(key, ttl) {
  const row = db.prepare('SELECT payload, fetched_at FROM ref_cache WHERE key = ?').get(key);
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at + 'Z').getTime();
  try { return { data: JSON.parse(row.payload), stale: age > ttl, fetchedAt: row.fetched_at }; }
  catch { return null; }
}
function cachePut(key, data) {
  db.prepare(`INSERT INTO ref_cache (key, payload, fetched_at) VALUES (?,?,datetime('now'))
              ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at`)
    .run(key, JSON.stringify(data));
}

/* ---------- polite rate limiting: one upstream call per second ---------- */
let lastCall = 0;
async function polite() {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

/* ---------- geocode a ZIP, city or address ---------- */
export async function geocode(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Enter a ZIP code, city or address.');
  const key = `geo:${q.toLowerCase()}`;
  const hit = cacheGet(key, TTL_GEOCODE);
  if (hit && !hit.stale) return { ...hit.data, source: 'cache' };

  await polite();
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&limit=1&addressdetails=1&countrycodes=us,ca`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' } });
  if (!r.ok) {
    if (hit) return { ...hit.data, source: 'stale' };
    throw new Error(`Geocoding service returned ${r.status}.`);
  }
  const j = await r.json();
  if (!j.length) throw new Error(`Could not find "${q}". Try a ZIP code, or "city, state".`);
  const out = {
    lat: +j[0].lat,
    lon: +j[0].lon,
    label: j[0].display_name.split(',').slice(0, 3).join(',').trim()
  };
  cachePut(key, out);
  return { ...out, source: 'live' };
}

/* ---------- nearby parts stores ---------- */
export async function nearbyStores({ lat, lon, radiusMiles = 25 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('A latitude and longitude are required.');
  const radiusM = Math.round(Math.min(60, Math.max(2, radiusMiles)) * 1609.344);

  // round the cache key so two searches from the same neighbourhood share a result
  const key = `stores:${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusM}`;
  const hit = cacheGet(key, TTL_STORES);
  let elements, source;

  if (hit && !hit.stale) {
    elements = hit.data; source = 'cache';
  } else {
    const q = `[out:json][timeout:25];
nwr["shop"="car_parts"](around:${radiusM},${lat},${lon});
out center tags;`;
    try {
      await polite();
      const r = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(30000)
      });
      if (!r.ok) throw new Error(`Overpass returned ${r.status}`);
      const j = await r.json();
      elements = j.elements || [];
      cachePut(key, elements);
      source = 'live';
    } catch (e) {
      if (hit) { elements = hit.data; source = 'stale'; }
      else throw new Error(`Could not reach the OpenStreetMap Overpass service (${e.message}). It is volunteer-run and occasionally busy — try again in a minute.`);
    }
  }

  const stores = elements.map(el => {
    const t = el.tags || {};
    const la = el.lat ?? el.center?.lat, lo = el.lon ?? el.center?.lon;
    if (la == null || lo == null) return null;
    const brand = brandOf(t);
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const address = [street, t['addr:city'], [t['addr:state'], t['addr:postcode']].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
    return {
      osm_type: el.type,
      osm_id: String(el.id),
      brand,
      brand_label: BRANDS[brand]?.label || (t.brand || t.name || 'Parts store'),
      name: t.name || t.brand || 'Parts store',
      lat: la, lon: lo,
      address: address || null,
      phone: t.phone || t['contact:phone'] || null,
      website: t.website || t['contact:website'] || null,
      hours: t.opening_hours || null,
      distance: +haversineMiles(lat, lon, la, lo).toFixed(1)
    };
  }).filter(Boolean);

  stores.sort((a, b) => a.distance - b.distance);
  return {
    stores,
    source,
    attribution: 'Store locations © OpenStreetMap contributors, ODbL. Hours and phone numbers are community-maintained — call ahead before driving.',
    counts: stores.reduce((acc, s) => { acc[s.brand] = (acc[s.brand] || 0) + 1; return acc; }, {})
  };
}

/* ---------- deep link builder ---------- */
export function partLinksFor(brandId, vehicle, term) {
  const b = BRANDS[brandId];
  const q = encodeURIComponent([vehicle?.year, vehicle?.make, vehicle?.model, term].filter(Boolean).join(' '));
  const termOnly = encodeURIComponent(term || '');
  return {
    search: b ? b.search(q) : `https://www.google.com/search?q=${q}`,
    locator: b?.locator || null,
    termOnly
  };
}
