/* ============================================================
   nhtsa.js — free reference data, fetched server-side and cached.

   Everything here is free, keyless and public:
     vPIC          VIN decode, ~140 fields
     Recalls       campaign, defect, risk, remedy
     Complaints    owner complaints, clustered into a known-issues board
     Safety        NCAP crash ratings
     fueleconomy   EPA baseline MPG to compare logged economy against

   Caching on the server rather than the client is the point: the
   garage is an RF dead zone, so the app must answer from the
   container even when the phone has no signal.
   ============================================================ */
import { db } from './db.js';

const TTL = {
  vin: 365 * 86400e3,      // a VIN decode never changes
  makes: 30 * 86400e3,
  models: 30 * 86400e3,
  recalls: 1 * 86400e3,
  complaints: 7 * 86400e3,
  safety: 30 * 86400e3,
  epa: 30 * 86400e3
};

const API = {
  vin: v => `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(v)}?format=json`,
  makes: y => `https://api.nhtsa.gov/products/vehicle/makes?modelYear=${y}&issueType=r`,
  models: (y, m) => `https://api.nhtsa.gov/products/vehicle/models?modelYear=${y}&make=${encodeURIComponent(m)}&issueType=r`,
  recalls: (y, mk, md) => `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(mk)}&model=${encodeURIComponent(md)}&modelYear=${y}`,
  complaints: (y, mk, md) => `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(mk)}&model=${encodeURIComponent(md)}&modelYear=${y}`,
  safety: (y, mk, md) => `https://api.nhtsa.gov/SafetyRatings/modelyear/${y}/make/${encodeURIComponent(mk)}/model/${encodeURIComponent(md)}`,
  epaMenu: (y, mk, md) => `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${y}&make=${encodeURIComponent(mk)}&model=${encodeURIComponent(md)}`,
  epaVehicle: id => `https://www.fueleconomy.gov/ws/rest/vehicle/${id}`
};

export let LIVE = null;   // null unknown, true reachable, false offline

function cacheGet(key, ttl) {
  const row = db.prepare('SELECT payload, fetched_at FROM ref_cache WHERE key = ?').get(key);
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at + 'Z').getTime();
  const stale = age > ttl;
  try { return { data: JSON.parse(row.payload), stale, fetchedAt: row.fetched_at }; }
  catch { return null; }
}
function cachePut(key, data) {
  db.prepare(`INSERT INTO ref_cache (key, payload, fetched_at) VALUES (?,?,datetime('now'))
              ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at`)
    .run(key, JSON.stringify(data));
}

async function fetchJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    LIVE = true;
    return j;
  } catch (e) {
    LIVE = false;
    throw e;
  } finally { clearTimeout(t); }
}

/**
 * Cache-first with a stale fallback. If the network is down we serve
 * the stale copy and say so, rather than showing an error.
 */
async function cached(key, ttl, url) {
  const hit = cacheGet(key, ttl);
  if (hit && !hit.stale) return { data: hit.data, source: 'cache', fetchedAt: hit.fetchedAt };
  try {
    const data = await fetchJson(url);
    cachePut(key, data);
    return { data, source: 'live', fetchedAt: new Date().toISOString() };
  } catch (e) {
    if (hit) return { data: hit.data, source: 'stale', fetchedAt: hit.fetchedAt, error: String(e.message || e) };
    return { data: null, source: 'offline', error: String(e.message || e) };
  }
}

export const nhtsa = {
  decodeVin: vin => cached(`vin:${vin}`, TTL.vin, API.vin(vin)),
  makes: y => cached(`makes:${y}`, TTL.makes, API.makes(y)),
  models: (y, m) => cached(`models:${y}:${m}`, TTL.models, API.models(y, m)),
  recalls: (y, mk, md) => cached(`recalls:${y}:${mk}:${md}`, TTL.recalls, API.recalls(y, mk, md)),
  complaints: (y, mk, md) => cached(`complaints:${y}:${mk}:${md}`, TTL.complaints, API.complaints(y, mk, md)),
  safety: (y, mk, md) => cached(`safety:${y}:${mk}:${md}`, TTL.safety, API.safety(y, mk, md)),
  epaMenu: (y, mk, md) => cached(`epa:${y}:${mk}:${md}`, TTL.epa, API.epaMenu(y, mk, md)),
  epaVehicle: id => cached(`epaveh:${id}`, TTL.epa, API.epaVehicle(id))
};

/* ---------- normalise a vPIC payload onto our schema ---------- */
export function normalizeVin(raw, source = 'vin') {
  const year = parseInt(raw.ModelYear || raw.year || 0, 10) || null;
  const fuel = String(raw.FuelTypePrimary || '');
  const model = String(raw.Model || raw.model || '');
  const isEV = /electric|bev/i.test(fuel) || /^MODEL [3SXY]$/i.test(model);
  const body = String(raw.BodyClass || '').toLowerCase();

  let icon = 'v_sedan';
  if (isEV) icon = 'v_ev';
  else if (body.includes('pickup')) icon = 'v_pickup';
  else if (body.includes('sport utility') || body.includes('suv')) icon = 'v_suv';
  else if (body.includes('van')) icon = 'v_van';

  const disp = raw.DisplacementL ? `${(Math.round(raw.DisplacementL * 10) / 10).toFixed(1)}L` : '';
  const cylN = parseInt(raw.EngineCylinders || 0, 10);
  const cyl = cylN ? (cylN >= 8 ? `V${cylN}` : cylN === 6 ? 'V6' : `I${cylN}`) : '';
  const engine = isEV ? (raw.ElectrificationLevel || 'Electric') : [disp, cyl].filter(Boolean).join(' ');

  return {
    vin: raw.VIN || null,
    year,
    make: String(raw.Make || raw.make || '').toUpperCase() || null,
    model: model.toUpperCase() || null,
    trim: raw.Trim || raw.Series || null,
    engine: engine || null,
    hp: raw.EngineHP || null,
    drive: raw.DriveType || null,
    body: raw.BodyClass || null,
    fuel: fuel || null,
    trans: raw.TransmissionStyle || null,
    doors: raw.Doors || null,
    plant: raw.PlantCountry || null,
    gvwr: raw.GVWR || null,
    is_ev: isEV ? 1 : 0,
    icon,
    source,
    spec_json: JSON.stringify(raw)
  };
}

/** Cluster raw complaints into a known-issues board by component + mileage band. */
export function clusterComplaints(results = []) {
  const by = new Map();
  for (const c of results) {
    const key = String(c.components || 'OTHER').split(',')[0].trim().toUpperCase();
    if (!by.has(key)) by.set(key, { component: key, count: 0, miles: [], samples: [] });
    const e = by.get(key);
    e.count++;
    const mi = Number(c.odiNumber && c.mileage) || Number(c.mileage) || 0;
    if (mi > 100 && mi < 500000) e.miles.push(mi);
    if (e.samples.length < 3 && c.summary) e.samples.push(String(c.summary).slice(0, 320));
  }
  return [...by.values()].map(e => {
    e.miles.sort((a, b) => a - b);
    const band = e.miles.length >= 4
      ? { low: e.miles[Math.floor(e.miles.length * 0.25)], high: e.miles[Math.floor(e.miles.length * 0.75)], median: e.miles[Math.floor(e.miles.length / 2)] }
      : null;
    return {
      component: e.component,
      count: e.count,
      band,
      watchNote: band ? `Most reports cluster between ${Math.round(band.low / 1000)}k and ${Math.round(band.high / 1000)}k miles` : null,
      samples: e.samples
    };
  }).sort((a, b) => b.count - a.count);
}
