/* ============================================================
   records.js — torque specifications, the unified timeline,
   and global search.

   Provenance is the theme. Every row that leaves this file carries
   where it came from and how much it should be trusted:

     MANUFACTURER SPEC   from an OEM document
     MANUAL VERIFIED     from a service manual the owner holds
     USER ENTERED        typed in, unverified
     NEEDS VERIFICATION  present but explicitly not trusted yet
     NHTSA REFERENCE     federal data about the vehicle LINE
     CALCULATED          derived by this app from the above
     IMPORTED            came in from a file

   Torque values are never generated here. Not defaults, not
   "typical" figures, not an average of similar vehicles. A wrong
   torque figure presented confidently is how someone strips a head.
   ============================================================ */
import { db } from './db.js';
import { httpErr } from './auth.js';

/* ============================================================
   TORQUE SPECIFICATIONS
   ============================================================ */
export const TORQUE_SOURCES = {
  manufacturer_spec: { label: 'MANUFACTURER SPEC', verified: true },
  manual_verified: { label: 'MANUAL VERIFIED', verified: true },
  user_entered: { label: 'USER ENTERED', verified: false },
  needs_verification: { label: 'NEEDS VERIFICATION', verified: false }
};

const LBFT_PER_NM = 0.737562149;
const LBIN_PER_LBFT = 12;

/** Convert for DISPLAY only. The sourced value and unit never change. */
export function torqueDisplay(spec) {
  const v = spec.value;
  if (v == null) return { primary: null, secondary: null };
  const u = spec.source_unit || 'lb-ft';
  let lbft, nm, lbin;
  if (u === 'N·m') { nm = v; lbft = v * LBFT_PER_NM; lbin = lbft * LBIN_PER_LBFT; }
  else if (u === 'lb-in') { lbin = v; lbft = v / LBIN_PER_LBFT; nm = lbft / LBFT_PER_NM; }
  else { lbft = v; nm = v / LBFT_PER_NM; lbin = v * LBIN_PER_LBFT; }

  const r = n => Math.round(n * 10) / 10;
  // small fasteners read better in lb-in, big ones in lb-ft
  const primary = u === 'lb-in' || lbft < 10
    ? `${r(lbin)} lb-in`
    : `${r(lbft)} lb-ft`;
  const secondary = `${r(nm)} N·m`;
  return {
    primary, secondary,
    asSourced: `${v} ${u}`,
    lbft: r(lbft), nm: r(nm), lbin: r(lbin)
  };
}

export function decorateTorque(s) {
  const src = TORQUE_SOURCES[s.source] || TORQUE_SOURCES.user_entered;
  return {
    ...s,
    source_label: src.label,
    verified: s.verification === 'verified',
    confirmed: !!s.confirmed_at,
    display: torqueDisplay(s),
    tone: s.verification === 'verified' ? (s.confirmed_at ? 'ok' : 'primary') : 'warn'
  };
}

export function torqueFor(scopeKind, scopeId) {
  return db.prepare('SELECT * FROM torque_specs WHERE scope_kind=? AND scope_id=? ORDER BY id')
    .all(scopeKind, scopeId).map(decorateTorque);
}

export function assertTorqueOwner(userId, id, write = true) {
  const s = db.prepare('SELECT * FROM torque_specs WHERE id=?').get(id);
  if (!s) throw httpErr(404, 'Torque specification not found.');
  if (s.user_id !== userId) {
    const shared = s.vehicle_id && db.prepare(`
      SELECT m.role FROM vehicles v JOIN memberships m ON m.garage_id=v.garage_id AND m.user_id=?
      WHERE v.id=?`).get(userId, s.vehicle_id);
    if (!shared) throw httpErr(404, 'Torque specification not found.');
    if (write && shared.role === 'viewer') throw httpErr(403, 'Your role on this garage is read-only.');
  }
  return s;
}

/* ============================================================
   UNIFIED TIMELINE

   One chronological stream across every record type. Each event
   carries a kind, a source label, and enough identity to open the
   underlying record.
   ============================================================ */
const EVENT_KINDS = ['service', 'fuel', 'odometer', 'diagnostic', 'dtc', 'recall',
  'document', 'tire', 'battery', 'brakes', 'expense', 'trip', 'procedure', 'hours', 'photo'];

export function timelineFor(vehicleId, opts = {}) {
  const ev = [];
  const push = (o) => ev.push(o);

  db.prepare('SELECT * FROM service_records WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'service', at: r.date, title: r.what,
    body: [r.performer, r.shop_name, r.miles ? r.miles.toLocaleString() + ' mi' : null].filter(Boolean).join(' · '),
    amount: r.cost, system: r.category, source: 'USER ENTERED', ref: { type: 'service', id: r.id }
  }));

  db.prepare('SELECT * FROM fuel_logs WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'fuel', at: r.date, title: (r.kind === 'charge' ? 'Charge' : 'Fuel') + ' · ' + r.quantity + (r.kind === 'charge' ? ' kWh' : ' gal'),
    body: [r.station, r.odometer ? r.odometer.toLocaleString() + ' mi' : null, r.partial ? 'partial fill' : 'full tank'].filter(Boolean).join(' · '),
    amount: r.total, system: 'fuel', source: 'USER ENTERED', ref: { type: 'fuel', id: r.id }
  }));

  db.prepare('SELECT * FROM odometer_readings WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'odometer', at: r.at, title: 'Odometer ' + r.value.toLocaleString(),
    body: 'source: ' + r.source + (r.suspect ? ' · OUT OF SEQUENCE' : ''),
    system: 'records', flag: r.suspect ? 'bad' : null,
    source: String(r.source || 'manual').toUpperCase(), ref: { type: 'odometer', id: r.id }
  }));

  db.prepare('SELECT * FROM diag_sessions WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'diagnostic', at: r.started_at, title: 'Scan · ' + (r.adapter || 'session'),
    body: [r.protocol, r.imported_from, r.odometer ? r.odometer.toLocaleString() + ' mi' : null].filter(Boolean).join(' · '),
    system: 'diagnostics', source: r.imported_from ? 'IMPORTED' : 'OBD SCAN', ref: { type: 'session', id: r.id }
  }));

  db.prepare('SELECT * FROM dtcs WHERE vehicle_id=?').all(vehicleId).forEach(r => {
    push({
      kind: 'dtc', at: r.first_seen, title: r.code + ' detected', body: r.description,
      system: 'diagnostics', flag: 'warn', source: 'OBD SCAN', ref: { type: 'dtc', id: r.id }
    });
    if (r.cleared_at) push({
      kind: 'dtc', at: r.cleared_at, title: r.code + ' cleared',
      body: r.clear_count > 1 ? 'cleared ' + r.clear_count + ' times total' : null,
      system: 'diagnostics', source: 'USER ENTERED', ref: { type: 'dtc', id: r.id }
    });
  });

  db.prepare('SELECT * FROM recall_status WHERE vehicle_id=?').all(vehicleId).forEach(r => {
    if (r.completed_at) push({
      kind: 'recall', at: r.completed_at,
      title: 'Recall ' + r.campaign + ' — ' + (r.completion_status === 'verified' ? 'verified complete' : 'marked complete'),
      body: String(r.component || '').split(':')[0],
      system: 'safety', flag: r.completion_status === 'verified' ? 'ok' : 'warn',
      source: r.completion_status === 'verified' ? 'MANUAL VERIFIED' : 'USER ENTERED',
      ref: { type: 'recall', id: r.id }
    });
  });

  db.prepare('SELECT * FROM documents WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'document', at: r.issued_date || r.created_at, title: r.title,
    body: [r.kind, r.expires_date ? 'expires ' + r.expires_date : null].filter(Boolean).join(' · '),
    amount: r.amount, system: 'documents', source: 'USER ENTERED', ref: { type: 'document', id: r.id }
  }));

  db.prepare('SELECT * FROM tire_sets WHERE vehicle_id=?').all(vehicleId).forEach(r => {
    if (r.installed_date) push({
      kind: 'tire', at: r.installed_date, title: 'Tires fitted · ' + r.name,
      body: [r.brand, r.size, r.dot_date ? 'DOT ' + r.dot_date : null].filter(Boolean).join(' · '),
      amount: r.cost, system: 'tires', source: 'USER ENTERED', ref: { type: 'tires', id: r.id }
    });
    db.prepare('SELECT * FROM tire_measurements WHERE tire_set_id=?').all(r.id).forEach(m => push({
      kind: 'tire', at: m.date, title: m.rotated ? 'Tire rotation' : 'Tread measured',
      body: ['LF ' + (m.lf ?? '—'), 'RF ' + (m.rf ?? '—'), 'LR ' + (m.lr ?? '—'), 'RR ' + (m.rr ?? '—')].join(' · ') + ' /32',
      system: 'tires', source: 'USER ENTERED', ref: { type: 'tires', id: r.id }
    }));
  });

  db.prepare('SELECT * FROM battery_records WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'battery', at: r.test_date || r.installed_date, title: r.test_date ? 'Battery tested' : 'Battery fitted',
    body: [r.brand, r.cca ? r.cca + ' CCA' : null, r.rest_voltage ? r.rest_voltage + ' V' : null, r.load_test].filter(Boolean).join(' · '),
    system: 'charging', flag: r.load_test === 'fail' ? 'bad' : r.load_test === 'marginal' ? 'warn' : null,
    source: 'USER ENTERED', ref: { type: 'battery', id: r.id }
  }));

  db.prepare('SELECT * FROM brake_measurements WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'brakes', at: r.date, title: 'Brake inspection',
    body: ['LF ' + (r.lf_pad ?? '—'), 'RF ' + (r.rf_pad ?? '—'), 'LR ' + (r.lr_pad ?? '—'), 'RR ' + (r.rr_pad ?? '—')].join(' · ') + ' mm pad',
    system: 'brakes', source: 'USER ENTERED', ref: { type: 'brakes', id: r.id }
  }));

  db.prepare('SELECT * FROM expenses WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'expense', at: r.date, title: r.category, body: [r.vendor, r.note].filter(Boolean).join(' · '),
    amount: r.amount, system: 'cost', source: 'USER ENTERED', ref: { type: 'expense', id: r.id }
  }));

  db.prepare('SELECT * FROM hour_readings WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'hours', at: r.at, title: 'Engine hours ' + r.hours,
    body: r.odometer ? 'at ' + r.odometer.toLocaleString() + ' mi' : null,
    system: 'records', source: String(r.source || 'manual').toUpperCase(), ref: { type: 'hours', id: r.id }
  }));

  db.prepare(`SELECT r.*, p.title FROM procedure_runs r JOIN procedures p ON p.id=r.procedure_id
              WHERE r.vehicle_id=?`).all(vehicleId).forEach(r => push({
                kind: 'procedure', at: r.finished_at || r.started_at,
                title: (r.finished_at ? 'Completed' : 'Started') + ' · ' + r.title,
                body: r.odometer ? r.odometer.toLocaleString() + ' mi' : null,
                system: 'procedures', source: 'USER ENTERED', ref: { type: 'procedure', id: r.procedure_id }
              }));

  db.prepare('SELECT * FROM vehicle_photos WHERE vehicle_id=?').all(vehicleId).forEach(r => push({
    kind: 'photo', at: r.captured_at || r.created_at, title: r.caption || 'Photo added',
    system: 'records', source: 'USER ENTERED', ref: { type: 'photo', id: r.id }
  }));

  let out = ev.filter(e => e.at);
  if (opts.kinds?.length) out = out.filter(e => opts.kinds.includes(e.kind));
  if (opts.system) out = out.filter(e => e.system === opts.system);
  if (opts.from) out = out.filter(e => String(e.at) >= opts.from);
  if (opts.to) out = out.filter(e => String(e.at) <= opts.to + '￿');

  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const counts = {};
  for (const e of out) counts[e.kind] = (counts[e.kind] || 0) + 1;

  return {
    events: out.slice(0, opts.limit || 400),
    total: out.length,
    counts,
    kinds: EVENT_KINDS,
    spend: +out.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2)
  };
}

/* ============================================================
   GLOBAL SEARCH
   ============================================================ */
export function searchAll(userId, q, opts = {}) {
  const term = String(q || '').trim();
  if (term.length < 2) return { results: [], groups: {}, term };
  const like = '%' + term + '%';

  const vehicleIds = db.prepare(`
    SELECT v.id FROM vehicles v JOIN memberships m ON m.garage_id=v.garage_id AND m.user_id=?`)
    .all(userId).map(r => r.id);
  if (!vehicleIds.length) return { results: [], groups: {}, term };
  const inV = `(${vehicleIds.map(() => '?').join(',')})`;

  const vname = {};
  db.prepare(`SELECT id, nickname, year, make, model FROM vehicles WHERE id IN ${inV}`).all(...vehicleIds)
    .forEach(v => { vname[v.id] = v.nickname || [v.year, v.make, v.model].filter(Boolean).join(' '); });

  const out = [];
  const add = (type, rows, map) => rows.forEach(r => out.push({ type, ...map(r) }));

  add('vehicle', db.prepare(`SELECT * FROM vehicles WHERE id IN ${inV} AND
      (COALESCE(nickname,'') LIKE ? OR COALESCE(make,'') LIKE ? OR COALESCE(model,'') LIKE ?
       OR COALESCE(vin,'') LIKE ? OR COALESCE(plate,'') LIKE ?)`)
    .all(...vehicleIds, like, like, like, like, like),
    r => ({ title: r.nickname || [r.year, r.make, r.model].join(' '), sub: r.vin ? 'VIN ' + r.vin : '', vehicle: vname[r.id], at: r.created_at, ref: { type: 'vehicle', id: r.id } }));

  add('service', db.prepare(`SELECT * FROM service_records WHERE vehicle_id IN ${inV} AND
      (what LIKE ? OR COALESCE(notes,'') LIKE ? OR COALESCE(shop_name,'') LIKE ? OR COALESCE(parts_json,'') LIKE ?)
      ORDER BY date DESC LIMIT 40`).all(...vehicleIds, like, like, like, like),
    r => ({ title: r.what, sub: [r.performer, r.miles ? r.miles.toLocaleString() + ' mi' : null].filter(Boolean).join(' · '), vehicle: vname[r.vehicle_id], at: r.date, amount: r.cost, ref: { type: 'service', id: r.id, vehicle_id: r.vehicle_id } }));

  add('dtc', db.prepare(`SELECT * FROM dtcs WHERE vehicle_id IN ${inV} AND
      (code LIKE ? OR COALESCE(description,'') LIKE ?) ORDER BY last_seen DESC LIMIT 30`)
    .all(...vehicleIds, like, like),
    r => ({ title: r.code, sub: r.description, vehicle: vname[r.vehicle_id], at: r.first_seen, ref: { type: 'dtc', id: r.id, vehicle_id: r.vehicle_id } }));

  add('document', db.prepare(`SELECT * FROM documents WHERE vehicle_id IN ${inV} AND
      (title LIKE ? OR COALESCE(issuer,'') LIKE ? OR COALESCE(number,'') LIKE ? OR COALESCE(note,'') LIKE ?) LIMIT 30`)
    .all(...vehicleIds, like, like, like, like),
    r => ({ title: r.title, sub: [r.kind, r.expires_date ? 'expires ' + r.expires_date : null].filter(Boolean).join(' · '), vehicle: vname[r.vehicle_id], at: r.issued_date, ref: { type: 'document', id: r.id, vehicle_id: r.vehicle_id } }));

  add('part', db.prepare(`SELECT * FROM part_prices WHERE user_id=? AND
      (part_name LIKE ? OR COALESCE(part_number,'') LIKE ? OR COALESCE(brand,'') LIKE ? OR COALESCE(vendor,'') LIKE ?) LIMIT 30`)
    .all(userId, like, like, like, like),
    r => ({ title: r.part_name, sub: [r.part_number, r.brand, r.vendor].filter(Boolean).join(' · '), vehicle: vname[r.vehicle_id] || '', at: r.purchased_at, amount: r.price, ref: { type: 'part', id: r.id, vehicle_id: r.vehicle_id } }));

  add('fuel', db.prepare(`SELECT * FROM fuel_logs WHERE vehicle_id IN ${inV} AND
      (COALESCE(station,'') LIKE ? OR COALESCE(note,'') LIKE ?) ORDER BY date DESC LIMIT 20`)
    .all(...vehicleIds, like, like),
    r => ({ title: r.quantity + (r.kind === 'charge' ? ' kWh' : ' gal') + (r.station ? ' · ' + r.station : ''), sub: r.odometer ? r.odometer.toLocaleString() + ' mi' : '', vehicle: vname[r.vehicle_id], at: r.date, amount: r.total, ref: { type: 'fuel', id: r.id, vehicle_id: r.vehicle_id } }));

  add('procedure', db.prepare(`SELECT * FROM procedures WHERE user_id=? AND
      (title LIKE ? OR COALESCE(summary,'') LIKE ?) LIMIT 20`).all(userId, like, like),
    r => ({ title: r.title, sub: [r.system, r.category].filter(Boolean).join(' · '), vehicle: vname[r.vehicle_id] || '', at: r.updated_at, ref: { type: 'procedure', id: r.id, vehicle_id: r.vehicle_id } }));

  add('task', db.prepare(`SELECT * FROM reminders WHERE vehicle_id IN ${inV} AND
      (name LIKE ? OR COALESCE(note,'') LIKE ? OR COALESCE(fluid_spec,'') LIKE ?) LIMIT 25`)
    .all(...vehicleIds, like, like, like),
    r => ({ title: r.name, sub: r.system || '', vehicle: vname[r.vehicle_id], at: r.last_done_date, ref: { type: 'task', id: r.id, vehicle_id: r.vehicle_id } }));

  add('torque', db.prepare(`SELECT * FROM torque_specs WHERE user_id=? AND
      (component LIKE ? OR COALESCE(source_ref,'') LIKE ?) LIMIT 20`).all(userId, like, like),
    r => ({ title: r.component, sub: (r.value != null ? r.value + ' ' + r.source_unit : 'no value') + ' · ' + r.source, vehicle: vname[r.vehicle_id] || '', at: r.created_at, ref: { type: 'torque', id: r.id, vehicle_id: r.vehicle_id } }));

  add('recall', db.prepare(`SELECT * FROM recall_status WHERE vehicle_id IN ${inV} AND
      (campaign LIKE ? OR COALESCE(component,'') LIKE ? OR COALESCE(summary,'') LIKE ?) LIMIT 20`)
    .all(...vehicleIds, like, like, like),
    r => ({ title: 'Recall ' + r.campaign, sub: String(r.component || '').split(':')[0], vehicle: vname[r.vehicle_id], at: r.reported_date, ref: { type: 'recall', id: r.id, vehicle_id: r.vehicle_id } }));

  add('odometer', /^\d[\d,]*$/.test(term)
    ? db.prepare(`SELECT * FROM odometer_readings WHERE vehicle_id IN ${inV} AND CAST(value AS TEXT) LIKE ? LIMIT 15`)
      .all(...vehicleIds, term.replace(/,/g, '') + '%')
    : [],
    r => ({ title: r.value.toLocaleString() + ' mi', sub: 'source: ' + r.source, vehicle: vname[r.vehicle_id], at: r.at, ref: { type: 'odometer', id: r.id, vehicle_id: r.vehicle_id } }));

  const groups = {};
  for (const r of out) (groups[r.type] ||= []).push(r);
  return { term, results: out.slice(0, 120), groups, total: out.length };
}
