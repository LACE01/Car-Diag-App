/* ============================================================
   reference.js — the rest of the free federal data.

     EPA / fueleconomy.gov  official city/hwy/combined, annual fuel
                            cost, MPGe and range for EVs — the
                            baseline your logged economy is measured
                            against
     NHTSA SafetyRatings    two-step: find the tested variant, then
                            pull its stars
     NHTSA investigations   open/closed federal defect investigations
                            for the vehicle line. More urgent than a
                            complaint cluster and often the earliest
                            public warning of a systemic problem
     NHTSA manufacturer     TSBs, service campaigns, dealer notices,
       communications       warranty extensions. Presented as context,
                            NOT as free repair instructions and NOT as
                            a promise that the work is covered
     DOE AFDC / NREL        alternative fuel stations, gated on the
                            vehicle's actual fuel type
     NWS                    active alerts and forecast, used only for
                            maintenance rules that earn their place

   Endpoint paths on api.nhtsa.gov are not versioned or formally
   documented for every product, so each lookup takes a list of
   candidate URLs and uses the first that returns usable JSON. When
   all of them fail the feature reports "unavailable" instead of
   throwing — a missing panel is acceptable, a broken page is not.
   ============================================================ */
import { db } from './db.js';

const UA = 'Garage/1.0 (self-hosted vehicle maintenance app; https://github.com/LACE01/Car-Diag-App)';
const DAY = 86400e3;

const TTL = {
  epa: 90 * DAY,
  safety: 30 * DAY,
  investigations: 2 * DAY,
  communications: 7 * DAY,
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
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(ms)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!/json/i.test(ct)) throw new Error(`not JSON (${ct})`);
  return r.json();
}

/**
 * Try each candidate URL in order; first usable response wins, and we
 * remember which one worked so later calls go straight to it.
 */
const workingUrl = new Map();
async function firstWorking(family, urls, accept = () => true) {
  const ordered = workingUrl.has(family)
    ? [urls[workingUrl.get(family)], ...urls.filter((_, i) => i !== workingUrl.get(family))]
    : urls;
  const errors = [];
  for (const url of ordered) {
    try {
      const j = await getJson(url);
      if (accept(j)) {
        workingUrl.set(family, urls.indexOf(url));
        return { data: j, url };
      }
      errors.push(`${url} → shape not recognised`);
    } catch (e) { errors.push(`${url} → ${e.message}`); }
  }
  const err = new Error(`No working endpoint for ${family}`);
  err.attempts = errors;
  throw err;
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
    return { available: false, source: 'unavailable', error: String(e.message), attempts: e.attempts || null };
  }
}

/* ============================================================
   EPA fuel economy
   ============================================================ */
export async function epaEconomy({ year, make, model, trim }) {
  const key = `epa:${year}:${make}:${model}:${trim || ''}`.toLowerCase();
  return cached(key, TTL.epa, async () => {
    const base = 'https://www.fueleconomy.gov/ws/rest/vehicle';
    const menu = await getJson(`${base}/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`);
    let options = menu?.menuItem ? (Array.isArray(menu.menuItem) ? menu.menuItem : [menu.menuItem]) : [];
    if (!options.length) throw new Error('EPA has no record for that year/make/model');

    // If we know the trim, prefer the option whose text mentions it.
    let chosen = options[0];
    if (trim) {
      const t = String(trim).toLowerCase();
      const better = options.find(o => String(o.text || '').toLowerCase().includes(t));
      if (better) chosen = better;
    }

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
    const list = await getJson(
      `https://api.nhtsa.gov/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`);
    const variants = list?.Results || [];
    if (!variants.length) throw new Error('No rated variant for that year/make/model');

    const rated = [];
    for (const v of variants.slice(0, 4)) {
      try {
        const d = await getJson(`https://api.nhtsa.gov/SafetyRatings/VehicleId/${v.VehicleId}`);
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
   NHTSA investigations
   ============================================================ */
export async function investigations({ year, make, model }) {
  const key = `inv:${year}:${make}:${model}`.toLowerCase();
  return cached(key, TTL.investigations, async () => {
    const mk = encodeURIComponent(make), md = encodeURIComponent(model);
    const { data } = await firstWorking('investigations', [
      `https://api.nhtsa.gov/investigations/investigationsByVehicle?make=${mk}&model=${md}&modelYear=${year}`,
      `https://api.nhtsa.gov/products/vehicle/investigations?make=${mk}&model=${md}&modelYear=${year}`,
      `https://api.nhtsa.gov/investigation/investigationsByVehicle?make=${mk}&model=${md}&modelYear=${year}`
    ], j => Array.isArray(j?.results) || Array.isArray(j?.Results));

    const rows = data.results || data.Results || [];
    const items = rows.map(x => ({
      number: x.nhtsaActionNumber || x.actionNumber || x.NHTSAActionNumber || null,
      type: x.actionType || x.type || null,
      component: x.component || x.components || null,
      summary: x.summary || x.subject || null,
      openDate: x.openDate || x.dateOpened || null,
      closeDate: x.closeDate || x.dateClosed || null,
      status: (x.closeDate || x.dateClosed) ? 'closed' : 'open'
    }));
    return {
      available: true,
      open: items.filter(i => i.status === 'open'),
      closed: items.filter(i => i.status === 'closed'),
      total: items.length,
      caveat: 'A federal investigation is not a finding of a defect and is not a recall. It means NHTSA is looking at a pattern on this vehicle line — which is often the earliest public signal that something systemic exists.'
    };
  });
}

/* ============================================================
   NHTSA manufacturer communications (TSBs)
   ============================================================ */
export async function communications({ year, make, model }) {
  const key = `mc:${year}:${make}:${model}`.toLowerCase();
  return cached(key, TTL.communications, async () => {
    const mk = encodeURIComponent(make), md = encodeURIComponent(model);
    const { data } = await firstWorking('communications', [
      `https://api.nhtsa.gov/manufacturer-communications/manufacturerCommunicationsByVehicle?make=${mk}&model=${md}&modelYear=${year}`,
      `https://api.nhtsa.gov/products/vehicle/manufacturerCommunications?make=${mk}&model=${md}&modelYear=${year}`,
      `https://api.nhtsa.gov/manufacturerCommunications/manufacturerCommunicationsByVehicle?make=${mk}&model=${md}&modelYear=${year}`
    ], j => Array.isArray(j?.results) || Array.isArray(j?.Results));

    const rows = data.results || data.Results || [];
    const items = rows.map(x => ({
      number: x.communicationNumber || x.bulletinNumber || x.nhtsaItemNumber || null,
      date: x.communicationDate || x.date || x.dateAdded || null,
      component: x.component || x.components || null,
      subject: x.summary || x.subject || x.description || null,
      documents: x.documents || null
    })).filter(i => i.subject || i.number);

    // cluster by component so a wall of bulletins becomes a shortlist
    const byComponent = {};
    for (const i of items) {
      const c = String(i.component || 'OTHER').split(/[,:]/)[0].trim().toUpperCase();
      (byComponent[c] ||= []).push(i);
    }

    return {
      available: true,
      items,
      total: items.length,
      byComponent: Object.entries(byComponent)
        .map(([component, list]) => ({ component, count: list.length, latest: list[0]?.date || null }))
        .sort((a, b) => b.count - a.count),
      caveat: 'These are manufacturer communications filed with NHTSA — bulletins, service campaigns and dealer notices. A TSB is diagnostic context or a procedure reference. It is NOT a recall, it does NOT mean the repair is free, and the full text is the manufacturer\'s copyrighted document, which is why only the subject line is shown here.'
    };
  });
}

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
