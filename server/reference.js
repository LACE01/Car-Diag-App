/* ============================================================
   reference.js — the rest of the free federal data.

     EPA / fueleconomy.gov  official city/hwy/combined, annual fuel
                            cost, MPGe and range for EVs — the
                            baseline your logged economy is measured
                            against
     NHTSA SafetyRatings    two-step: find the tested variant, then
                            pull its stars
     (investigations and manufacturer communications live in
      ingest.js — NHTSA publishes those as bulk files only)
     DOE AFDC / NREL        alternative fuel stations, gated on the
                            vehicle's actual fuel type
     NWS                    active alerts and forecast, used only for
                            maintenance rules that earn their place

   Every lookup here reports "unavailable" rather than throwing. A
   missing panel is acceptable; a broken page is not.

   Naming differs between all three services for the same vehicle, so
   nothing is sent blind — we pull each service's own make/model list
   and match against it. vPIC says "F-150", EPA says "F150 Pickup 2WD",
   NCAP says "F-150 SUPER CREW".
   ============================================================ */
import { db } from './db.js';

const UA = 'Garage/1.0 (self-hosted vehicle maintenance app; https://github.com/LACE01/Car-Diag-App)';
const DAY = 86400e3;

const TTL = {
  epa: 90 * DAY,
  safety: 30 * DAY,
  stations: 7 * DAY,
  weather: 20 * 60e3      // 20 minutes; alerts go stale fast
};

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

async function getJson(url, ms = 12000) {
  // fueleconomy.gov defaults to XML and only returns JSON when asked — the
  // Accept header is not optional there.
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(ms)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!/json/i.test(ct)) throw new Error(`not JSON (${ct})`);
  return r.json();
}

/** fueleconomy.gov and NHTSA return one object when there is one result. */
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

/**
 * Vehicle naming differs between every one of these services. vPIC says
 * "F-150"; EPA says "F150 Pickup 2WD"; NCAP says "F-150 SUPER CREW". So
 * never send our string blind — pull the service's own list and match
 * against it.
 */
function bestMatches(candidates, want, { all = false } = {}) {
  const squash = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const w = squash(want);
  if (!w) return [];
  const scored = candidates.map(c => {
    const s = squash(c.label ?? c);
    let score = 0;
    if (s === w) score = 100;
    else if (s.startsWith(w)) score = 80 - Math.min(20, s.length - w.length);
    else if (s.includes(w)) score = 60;
    else if (w.includes(s) && s.length >= 3) score = 40;
    return { c, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return all ? scored.map(x => x.c) : scored.slice(0, 1).map(x => x.c);
}

async function cached(key, ttl, loader) {
  const hit = cacheGet(key, ttl);
  if (hit && !hit.stale) return { ...hit.data, source: 'cache', fetchedAt: hit.fetchedAt };
  try {
    const fresh = await loader();
    cachePut(key, fresh);
    return { ...fresh, source: 'live', fetchedAt: new Date().toISOString() };
  } catch (e) {
    if (hit) return { ...hit.data, source: 'stale', fetchedAt: hit.fetchedAt, warning: String(e.message) };
    return { available: false, source: 'unavailable', error: String(e.message) };
  }
}

/* ============================================================
   EPA fuel economy
   ============================================================ */
export async function epaEconomy({ year, make, model, trim, engine, drive }) {
  const key = `epa:${year}:${make}:${model}:${trim || ''}`.toLowerCase();
  return cached(key, TTL.epa, async () => {
    const base = 'https://www.fueleconomy.gov/ws/rest/vehicle';

    // 1. EPA's make list — "FORD" from vPIC has to become "Ford"
    const makes = arr((await getJson(`${base}/menu/make?year=${year}`))?.menuItem)
      .map(m => ({ label: m.text, value: m.value }));
    const epaMake = bestMatches(makes, make)[0];
    if (!epaMake) throw new Error(`EPA lists no make matching "${make}" for ${year}`);

    // 2. EPA's model list — "F-150" has to become "F150 Pickup 2WD" (or 4WD)
    const models = arr((await getJson(`${base}/menu/model?year=${year}&make=${encodeURIComponent(epaMake.value)}`))?.menuItem)
      .map(m => ({ label: m.text, value: m.value }));
    let epaModels = bestMatches(models, model, { all: true });
    if (!epaModels.length) throw new Error(`EPA lists no model matching "${model}" under ${epaMake.label} ${year}`);

    // 3. Prefer the drivetrain we know about — EPA encodes 2WD/4WD in the name
    if (drive) {
      const d = /4|AWD|ALL/i.test(drive) ? '4WD' : '2WD';
      const better = epaModels.filter(m => m.label.toUpperCase().includes(d));
      if (better.length) epaModels = better;
    }
    const epaModel = epaModels[0];

    // 4. Engine/transmission variants under that model
    const options = arr((await getJson(
      `${base}/menu/options?year=${year}&make=${encodeURIComponent(epaMake.value)}&model=${encodeURIComponent(epaModel.value)}`))?.menuItem);
    if (!options.length) throw new Error(`EPA has no variants for ${epaMake.label} ${epaModel.label} ${year}`);

    // 5. Match the engine if we know it — the option text carries "6 cyl, 3.5 L"
    let chosen = options[0];
    const displ = String(engine || '').match(/(\d\.\d)\s*L/i)?.[1];
    const cyl = String(engine || '').match(/[IV](\d+)/i)?.[1];
    const scoreOpt = o => {
      const t = String(o.text || '');
      let s = 0;
      if (displ && t.includes(displ)) s += 10;
      if (cyl && new RegExp(`\\b${cyl} cyl`).test(t)) s += 6;
      if (trim && t.toLowerCase().includes(String(trim).toLowerCase())) s += 3;
      return s;
    };
    const ranked = options.map(o => ({ o, s: scoreOpt(o) })).sort((a, b) => b.s - a.s);
    if (ranked[0].s > 0) chosen = ranked[0].o;

    const v = await getJson(`${base}/${chosen.value}`);
    const n = x => (x == null || x === '' ? null : Number(x));
    const isEV = String(v.fuelType1 || '').toLowerCase().includes('electric');

    return {
      available: true,
      epaId: chosen.value,
      variant: chosen.text,
      variants: options.map(o => ({ id: o.value, label: o.text })),
      fuelType: v.fuelType || v.fuelType1 || null,
      vehicleClass: v.VClass || null,
      isEV,
      combined: n(v.comb08),
      city: n(v.city08),
      highway: n(v.highway08),
      combinedMpge: isEV ? n(v.comb08) : null,
      kwh100: n(v.combE),
      rangeElectric: n(v.range) || null,
      annualFuelCost: n(v.fuelCost08),
      co2GramsPerMile: n(v.co2TailpipeGpm),
      ghgScore: n(v.ghgScore),
      youSaveSpend: n(v.youSaveSpend),
      cylinders: n(v.cylinders),
      displacement: n(v.displ),
      drive: v.drive || null,
      transmission: v.trany || null,
      note: 'EPA combined is a laboratory figure on a standard test cycle. Real-world economy 10–20% below it is normal; a persistent gap far wider than that is worth investigating.'
    };
  });
}

/** Compare logged economy against the EPA baseline. */
export function economyVsEpa(loggedAvg, epa) {
  if (!loggedAvg || !epa?.combined) return null;
  const delta = loggedAvg - epa.combined;
  const pct = +(delta / epa.combined * 100).toFixed(1);
  let verdict, level;
  if (pct >= 5) { verdict = 'Beating the EPA combined figure. Gentle right foot, favourable routes, or both.'; level = 'ok'; }
  else if (pct >= -12) { verdict = 'Within the normal band for real-world driving.'; level = 'ok'; }
  else if (pct >= -25) { verdict = 'Noticeably below the EPA figure. Short trips, cold weather, roof racks, low tire pressure and a heavy foot all live in this range — but so does a dragging brake or a lazy thermostat.'; level = 'warn'; }
  else { verdict = 'Far below the EPA figure. Worth chasing: tire pressure, a dragging caliper, a thermostat stuck open, fuel trims drifting lean or rich, or a clogged air filter.'; level = 'bad'; }
  return { epaCombined: epa.combined, logged: loggedAvg, delta: +delta.toFixed(2), pct, verdict, level };
}

/* ============================================================
   NHTSA safety ratings — two-step
   ============================================================ */
export async function safetyRatings({ year, make, model }) {
  const key = `safety:${year}:${make}:${model}`.toLowerCase();
  return cached(key, TTL.safety, async () => {
    const B = 'https://api.nhtsa.gov/SafetyRatings';

    // NCAP names its own models: vPIC "F-150" is "F-150 SUPER CREW",
    // "F-150 SUPERCAB" and "F-150 REGULAR CAB" here. Ask, then match.
    const modelList = ((await getJson(`${B}/modelyear/${year}/make/${encodeURIComponent(make)}`))?.Results || [])
      .map(r => ({ label: r.Model, value: r.Model }));
    if (!modelList.length) throw new Error(`NCAP has no models for ${make} ${year}`);

    const matched = bestMatches(modelList, model, { all: true }).slice(0, 4);
    if (!matched.length) throw new Error(`NCAP rated no variant matching "${model}" for ${make} ${year}`);

    const variants = [];
    for (const m of matched) {
      const res = (await getJson(`${B}/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(m.value)}`))?.Results || [];
      variants.push(...res);
    }
    if (!variants.length) throw new Error('Model matched but NCAP returned no tested variant');

    const rated = [];
    for (const v of variants.slice(0, 6)) {
      if (!v.VehicleId) continue;
      try {
        const d = await getJson(`${B}/VehicleId/${v.VehicleId}`);
        const r = d?.Results?.[0];
        if (!r) continue;
        rated.push({
          vehicleId: v.VehicleId,
          description: r.VehicleDescription || v.VehicleDescription,
          overall: star(r.OverallRating),
          frontal: star(r.OverallFrontCrashRating),
          frontalDriver: star(r.FrontCrashDriversideRating),
          frontalPassenger: star(r.FrontCrashPassengersideRating),
          side: star(r.OverallSideCrashRating),
          sideBarrier: star(r.SideCrashDriversideRating),
          sidePole: star(r.SidePoleCrashRating),
          rollover: star(r.RolloverRating),
          rolloverPossibility: r.RolloverPossibility != null ? +r.RolloverPossibility : null,
          complaintsCount: r.ComplaintsCount ?? null,
          recallsCount: r.RecallsCount ?? null,
          investigationCount: r.InvestigationCount ?? null
        });
      } catch { /* one variant failing is not fatal */ }
    }
    if (!rated.length) throw new Error('Variants found but no ratings returned');

    return {
      available: true,
      variants: rated,
      caveat: 'NCAP tests one configuration per model line. These stars describe the tested variant — body style, drivetrain and restraint package can differ from yours, and this is not a VIN-specific assessment of your vehicle.'
    };
  });
}
function star(v) {
  if (v == null || v === '' || v === 'Not Rated') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/* ============================================================
   NHTSA investigations and manufacturer communications

   Both moved to server/ingest.js — they are DOWNLOAD ONLY. NHTSA
   publishes no per-vehicle JSON endpoint for either; every candidate
   path returns API Gateway's "Missing Authentication Token", and
   products/vehicle/makes?issueType=i returns zero rows. Confirmed
   against nhtsa.gov/nhtsa-datasets-and-apis, which lists an API
   section for ratings, recalls and complaints and a Download-Data
   section only for investigations and manufacturer communications.
   ============================================================ */

/* ============================================================
   DOE AFDC alternative fuel stations
   ============================================================ */
const AFDC_KEY = process.env.AFDC_API_KEY || 'DEMO_KEY';

/** Map a vPIC fuel string onto AFDC fuel codes. */
export function afdcFuelCodes(fuel, isEV) {
  const f = String(fuel || '').toLowerCase();
  const out = [];
  if (isEV || f.includes('electric')) out.push('ELEC');
  if (f.includes('e85') || f.includes('flex') || f.includes('ethanol')) out.push('E85');
  if (f.includes('diesel')) out.push('BD', 'RD');
  if (f.includes('cng') || f.includes('natural gas')) out.push('CNG');
  if (f.includes('lpg') || f.includes('propane')) out.push('LPG');
  if (f.includes('hydrogen') || f.includes('fuel cell')) out.push('HY');
  return [...new Set(out)];
}

export async function altFuelStations({ lat, lon, radius = 25, fuelCodes }) {
  if (!fuelCodes?.length) {
    return { available: false, reason: 'This vehicle runs on gasoline, so there is nothing alternative-fuel to find. The station finder appears for EV, hybrid, flex-fuel, diesel, CNG, propane and hydrogen vehicles.' };
  }
  const key = `afdc:${lat.toFixed(2)}:${lon.toFixed(2)}:${radius}:${fuelCodes.join(',')}`;
  return cached(key, TTL.stations, async () => {
    const url = `https://developer.nrel.gov/api/alt-fuel-stations/v1/nearest.json` +
      `?api_key=${encodeURIComponent(AFDC_KEY)}&latitude=${lat}&longitude=${lon}` +
      `&radius=${radius}&fuel_type=${fuelCodes.join(',')}&status=E&access=public&limit=25`;
    const j = await getJson(url, 15000);
    if (j.error) throw new Error(j.error.message || 'AFDC rejected the request');
    return {
      available: true,
      usingDemoKey: AFDC_KEY === 'DEMO_KEY',
      stations: (j.fuel_stations || []).map(s => ({
        id: s.id,
        name: s.station_name,
        fuel: s.fuel_type_code,
        network: s.ev_network || s.e85_blender_pump || null,
        address: [s.street_address, s.city, s.state, s.zip].filter(Boolean).join(', '),
        phone: s.station_phone || null,
        distance: s.distance != null ? +Number(s.distance).toFixed(1) : null,
        lat: s.latitude, lon: s.longitude,
        access: s.access_days_time || null,
        level2: s.ev_level2_evse_num || null,
        dcfast: s.ev_dc_fast_num || null,
        connectors: s.ev_connector_types || null,
        pricing: s.ev_pricing || s.cards_accepted || null,
        updatedAt: s.updated_at || null
      })),
      note: AFDC_KEY === 'DEMO_KEY'
        ? 'Running on NREL\'s shared DEMO_KEY, which is heavily rate-limited. A free personal key from developer.nrel.gov/signup takes a minute and removes the limit — set AFDC_API_KEY in docker-compose.yml.'
        : null
    };
  });
}

/* ============================================================
   NWS weather → maintenance rules
   ============================================================ */
export async function weatherContext({ lat, lon }) {
  const key = `wx:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  return cached(key, TTL.weather, async () => {
    const [alerts, points] = await Promise.all([
      getJson(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`).catch(() => null),
      getJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`).catch(() => null)
    ]);

    let periods = [];
    if (points?.properties?.forecast) {
      const fc = await getJson(points.properties.forecast).catch(() => null);
      periods = (fc?.properties?.periods || []).slice(0, 8).map(p => ({
        name: p.name, isDaytime: p.isDaytime,
        temp: p.temperature, unit: p.temperatureUnit,
        wind: p.windSpeed, short: p.shortForecast,
        precip: p.probabilityOfPrecipitation?.value ?? null
      }));
    }

    const active = (alerts?.features || []).map(f => ({
      event: f.properties.event,
      severity: f.properties.severity,
      urgency: f.properties.urgency,
      headline: f.properties.headline,
      onset: f.properties.onset,
      ends: f.properties.ends
    }));

    return { available: true, alerts: active, forecast: periods, office: points?.properties?.gridId || null };
  });
}

/**
 * Turn weather into maintenance prompts — only the ones that earn
 * their place. No "it is sunny, wash your car".
 */
export function weatherRules(wx, { battery, tires, vehicle } = {}) {
  const out = [];
  if (!wx?.available) return out;

  const temps = (wx.forecast || []).map(p => p.temp).filter(t => typeof t === 'number');
  const low = temps.length ? Math.min(...temps) : null;
  const high = temps.length ? Math.max(...temps) : null;

  if (low != null && low <= 32) {
    const weak = battery && battery.cls !== 'ok';
    out.push({
      level: weak ? 'bad' : 'warn',
      kind: 'weather',
      title: `Freezing weather coming — low of ${low} °F`,
      body: weak
        ? 'Your battery is already logged as marginal or failing. A lead-acid battery loses roughly a third of its cranking power at freezing and about half at 0 °F, while the engine needs more to turn over. This is the combination that strands people.'
        : 'Cold cuts available cranking amps sharply — roughly a third at freezing. Worth a rest-voltage check and clean terminals before it hits.',
      action: 'Log a battery test'
    });
  }

  if (low != null && high != null && (high - low) >= 25) {
    out.push({
      level: 'warn', kind: 'weather',
      title: `Large temperature swing forecast (${low}–${high} °F)`,
      body: 'Tire pressure moves about 1 psi for every 10 °F. A 25-degree drop takes roughly 2–3 psi out of every tire, which is enough to light the TPMS lamp and enough to hurt wet grip and economy.',
      action: 'Check cold pressures'
    });
  }

  for (const a of wx.alerts || []) {
    const e = String(a.event || '').toLowerCase();
    if (/hail|severe thunderstorm|tornado/.test(e)) {
      out.push({
        level: 'bad', kind: 'weather',
        title: a.event, body: (a.headline || '') + ' — get the vehicle under cover if you can. Hail damage is a comprehensive claim and a permanent mark on the history.',
        action: null
      });
    } else if (/winter storm|ice|freeze|blizzard/.test(e)) {
      out.push({
        level: 'warn', kind: 'weather',
        title: a.event, body: (a.headline || '') + ' — check wiper condition, washer fluid rating and tire tread before you drive on it.',
        action: 'Log tread depths'
      });
    } else if (/flood/.test(e)) {
      out.push({
        level: 'warn', kind: 'weather',
        title: a.event, body: (a.headline || '') + ' — do not drive through standing water. Hydrolock destroys an engine in one second and is almost never covered as a mechanical failure.',
        action: null
      });
    } else if (/excessive heat|heat advisory/.test(e)) {
      out.push({
        level: 'warn', kind: 'weather',
        title: a.event, body: (a.headline || '') + ' — heat is what finds a marginal cooling system. Check coolant level cold, and look at the radiator fins and fan operation before a long drive.',
        action: null
      });
    }
  }

  const worstTire = (tires || []).filter(t => t.active).sort((a, b) => (a.worst ?? 99) - (b.worst ?? 99))[0];
  if (worstTire?.worst != null && worstTire.worst <= 4 && (wx.forecast || []).some(p => (p.precip ?? 0) >= 50)) {
    out.push({
      level: 'bad', kind: 'weather',
      title: 'Rain forecast and your tires are down to ' + worstTire.worst + '/32',
      body: 'Below about 4/32 the tread cannot clear water fast enough and wet stopping distance climbs steeply. This is the specific combination that causes hydroplaning crashes.',
      action: null
    });
  }

  return out;
}
