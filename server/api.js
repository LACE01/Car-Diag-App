/* ============================================================
   api.js — the REST surface
   ============================================================ */
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, UPLOAD_DIR } from './db.js';
import {
  COOKIE, requireAuth, registerUser, loginUser, createSession, destroySession,
  garagesFor, primaryGarageId, assertVehicle, httpErr, audit
} from './auth.js';
import { nhtsa, normalizeVin, clusterComplaints, LIVE } from './nhtsa.js';
import * as core from './core.js';

export const api = express.Router();

const HUES = ['#EDEAFE,#DCD6FC', '#E4F6EE,#CFEFE0', '#FDEEE0,#FADFC7', '#E3F0FD,#CFE3FB', '#FCE7F1,#F8D3E5'];
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- tiny generic CRUD helpers ---------- */
function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f] === '' ? null : body[f];
  return out;
}
function insert(table, data) {
  const keys = Object.keys(data);
  if (!keys.length) throw httpErr(400, 'Nothing to save.');
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  const info = db.prepare(sql).run(...keys.map(k => data[k]));
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
}
function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  const sql = `UPDATE ${table} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map(k => data[k]), id);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}
/** Verify a child row belongs to a vehicle the user can reach. */
function ownedRow(userId, table, id, write = true) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) throw httpErr(404, 'Not found.');
  assertVehicle(userId, row.vehicle_id, write);
  return row;
}

/* ============================================================
   AUTH
   ============================================================ */
function setCookie(res, token, expires) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    expires: new Date(expires)
  });
}

api.post('/auth/register', wrap(async (req, res) => {
  const user = registerUser(req.body || {});
  const { token, expires } = createSession(user.id);
  setCookie(res, token, expires);
  audit(user.id, null, 'register', user.email);
  res.status(201).json({ user });
}));

api.post('/auth/login', wrap(async (req, res) => {
  const user = loginUser(req.body || {});
  const { token, expires } = createSession(user.id);
  setCookie(res, token, expires);
  audit(user.id, null, 'login', user.email);
  res.json({ user });
}));

api.post('/auth/logout', (req, res) => {
  destroySession(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user, garages: garagesFor(req.user.id) });
});

api.patch('/auth/me', requireAuth, wrap(async (req, res) => {
  const d = pick(req.body || {}, ['name', 'units']);
  if (d.units && !['imperial', 'metric'].includes(d.units)) throw httpErr(400, 'units must be imperial or metric');
  update('users', req.user.id, d);
  res.json({ user: db.prepare('SELECT id,email,name,units,role FROM users WHERE id=?').get(req.user.id) });
}));

/* ---- garage sharing: invite an existing account into your garage ---- */
api.post('/garages/:id/members', requireAuth, wrap(async (req, res) => {
  const gid = +req.params.id;
  const mine = db.prepare('SELECT role FROM memberships WHERE garage_id=? AND user_id=?').get(gid, req.user.id);
  if (!mine || mine.role !== 'owner') throw httpErr(403, 'Only the garage owner can add members.');
  const target = db.prepare('SELECT id,email,name FROM users WHERE email=?').get(req.body?.email || '');
  if (!target) throw httpErr(404, 'No account with that email. They need to register first.');
  const role = ['member', 'viewer'].includes(req.body?.role) ? req.body.role : 'member';
  db.prepare(`INSERT INTO memberships (garage_id,user_id,role) VALUES (?,?,?)
              ON CONFLICT(garage_id,user_id) DO UPDATE SET role=excluded.role`).run(gid, target.id, role);
  audit(req.user.id, null, 'garage.member.add', { gid, target: target.email, role });
  res.status(201).json({ member: { ...target, role } });
}));

api.get('/garages', requireAuth, (req, res) => {
  const gs = garagesFor(req.user.id);
  for (const g of gs) {
    g.members = db.prepare(`SELECT u.id,u.name,u.email,m.role FROM memberships m
                            JOIN users u ON u.id=m.user_id WHERE m.garage_id=?`).all(g.id);
  }
  res.json({ garages: gs });
});

/* ============================================================
   VEHICLES
   ============================================================ */
api.get('/vehicles', requireAuth, wrap(async (req, res) => {
  const rows = db.prepare(`
    SELECT v.* FROM vehicles v
    JOIN memberships m ON m.garage_id = v.garage_id AND m.user_id = ?
    WHERE v.archived = 0 ORDER BY v.id`).all(req.user.id);
  for (const v of rows) {
    v.open_recalls = db.prepare('SELECT COUNT(*) c FROM recall_status WHERE vehicle_id=? AND completed=0 AND dismissed=0').get(v.id).c;
    v.due = dueSummary(v);
  }
  res.json({ vehicles: rows });
}));

api.post('/vehicles', requireAuth, wrap(async (req, res) => {
  const gid = +req.body?.garage_id || primaryGarageId(req.user.id);
  if (!gid) throw httpErr(400, 'No garage available.');

  let data;
  if (req.body?.vin) {
    const vin = String(req.body.vin).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (vin.length !== 17) throw httpErr(400, `A VIN is exactly 17 characters. That one is ${vin.length}.`);
    const r = await nhtsa.decodeVin(vin);
    const raw = r.data?.Results?.[0];
    if (r.source === 'offline') {
      throw httpErr(503, 'Cannot reach the NHTSA vPIC service right now, and this VIN is not in the local cache. Add the vehicle by year / make / model and decode the VIN later from the Ownership screen — nothing is lost.');
    }
    if (!raw || !raw.Make) {
      throw httpErr(422, 'NHTSA decoded that VIN but returned no make. Check it against the driver door jamb — a transposed character is the usual cause — or add the vehicle by year / make / model.');
    }
    raw.VIN = vin;
    data = normalizeVin(raw, 'vin');
  } else {
    const { year, make, model } = req.body || {};
    if (!year || !make || !model) throw httpErr(400, 'Provide a VIN, or year + make + model.');
    data = normalizeVin({ ModelYear: year, Make: make, Model: model }, 'ymm');
  }

  const count = db.prepare('SELECT COUNT(*) c FROM vehicles WHERE garage_id=?').get(gid).c;
  const extra = pick(req.body || {}, ['nickname', 'plate', 'plate_state', 'duty', 'mileage',
    'purchase_date', 'purchase_price', 'purchase_odometer', 'seller', 'estimated_value']);

  const v = insert('vehicles', {
    ...data, ...extra,
    garage_id: gid,
    hue: HUES[count % HUES.length],
    mileage: +(extra.mileage || 0),
    device_id: req.body?.device_id || null
  });

  seedSchedule(v);
  seedWarranties(v);
  if (v.mileage) db.prepare('INSERT INTO odometer_readings (vehicle_id,value,source,note) VALUES (?,?,?,?)')
    .run(v.id, v.mileage, 'manual', 'Initial reading at vehicle creation');

  audit(req.user.id, v.id, 'vehicle.create', `${v.year} ${v.make} ${v.model}`);
  res.status(201).json({ vehicle: v });

  // enrich after the response — the card renders immediately, recalls land a second later
  enrich(v.id).catch(() => {});
}));

api.get('/vehicles/:id', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  res.json(vehicleDetail(v));
}));

api.patch('/vehicles/:id', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  const d = pick(req.body || {}, ['nickname', 'plate', 'plate_state', 'duty', 'mileage', 'vin',
    'purchase_date', 'purchase_price', 'purchase_odometer', 'seller', 'estimated_value',
    'year', 'make', 'model', 'trim', 'engine', 'icon', 'archived']);
  if (d.duty && !['normal', 'severe'].includes(d.duty)) throw httpErr(400, 'duty must be normal or severe');
  d.updated_at = new Date().toISOString();
  const out = update('vehicles', v.id, d);
  audit(req.user.id, v.id, 'vehicle.update', Object.keys(d).join(','));
  res.json({ vehicle: out });
}));

api.delete('/vehicles/:id', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  db.prepare('DELETE FROM vehicles WHERE id=?').run(v.id);
  audit(req.user.id, v.id, 'vehicle.delete', `${v.year} ${v.make} ${v.model}`);
  res.json({ ok: true });
}));

api.post('/vehicles/:id/refresh', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  const r = await enrich(v.id);
  res.json(r);
}));

/* ---- vehicle detail assembly ---- */
function vehicleDetail(v) {
  const service = db.prepare('SELECT * FROM service_records WHERE vehicle_id=? ORDER BY date DESC, id DESC').all(v.id);
  const fuel = db.prepare('SELECT * FROM fuel_logs WHERE vehicle_id=? ORDER BY odometer').all(v.id);
  const expenses = db.prepare('SELECT * FROM expenses WHERE vehicle_id=? ORDER BY date DESC').all(v.id);
  const reminders = db.prepare('SELECT * FROM reminders WHERE vehicle_id=? AND active=1').all(v.id)
    .map(r => core.reminderStatus(r, v));
  const warranties = db.prepare('SELECT * FROM warranties WHERE vehicle_id=?').all(v.id)
    .map(w => core.warrantyStatus(w, v));
  const documents = db.prepare("SELECT * FROM documents WHERE vehicle_id=? ORDER BY COALESCE(expires_date,'9999')").all(v.id);
  const recalls = db.prepare('SELECT * FROM recall_status WHERE vehicle_id=? ORDER BY completed, reported_date DESC').all(v.id);
  const complaints = db.prepare('SELECT * FROM ref_complaints WHERE vehicle_id=? ORDER BY count DESC LIMIT 10').all(v.id);
  const odometer = db.prepare('SELECT * FROM odometer_readings WHERE vehicle_id=? ORDER BY at DESC LIMIT 40').all(v.id);
  const tires = db.prepare('SELECT * FROM tire_sets WHERE vehicle_id=? ORDER BY active DESC, id DESC').all(v.id)
    .map(s => core.tireStatus(s, db.prepare('SELECT * FROM tire_measurements WHERE tire_set_id=? ORDER BY date').all(s.id)));
  const battery = core.batteryStatus(db.prepare('SELECT * FROM battery_records WHERE vehicle_id=? ORDER BY COALESCE(test_date,installed_date) DESC LIMIT 1').get(v.id));
  const brakeRows = db.prepare('SELECT * FROM brake_measurements WHERE vehicle_id=? ORDER BY date DESC').all(v.id);
  const brakes = core.brakeStatus(brakeRows);
  const dtcs = db.prepare('SELECT * FROM dtcs WHERE vehicle_id=? ORDER BY last_seen DESC').all(v.id);
  const sessions = db.prepare('SELECT * FROM diag_sessions WHERE vehicle_id=? ORDER BY started_at DESC LIMIT 20').all(v.id);
  const trips = db.prepare('SELECT * FROM trips WHERE vehicle_id=? ORDER BY date DESC').all(v.id);

  const economy = core.computeEconomy(fuel, !!v.is_ev);
  const tco = core.costOfOwnership({ vehicle: v, service, fuel, expenses });
  const fc = core.forecast12(db.prepare('SELECT * FROM reminders WHERE vehicle_id=? AND active=1').all(v.id), v);

  return {
    vehicle: v,
    reminders: reminders.sort((a, b) => b.pct - a.pct),
    warranties, documents, recalls, complaints, odometer,
    service, fuel, expenses, trips, tires, battery, brakes, brakeRows,
    dtcs, sessions,
    economy, tco, forecast: fc,
    alerts: alertsFor(v, { reminders, warranties, documents, recalls, tires, battery, brakes, dtcs, odometer })
  };
}

function dueSummary(v) {
  const rs = db.prepare('SELECT * FROM reminders WHERE vehicle_id=? AND active=1').all(v.id)
    .map(r => core.reminderStatus(r, v));
  const overdue = rs.filter(r => r.overdue).length;
  const soon = rs.filter(r => !r.overdue && r.cls === 'warn').length;
  return { overdue, soon, next: rs.filter(r => r.cls !== 'grey').sort((a, b) => b.pct - a.pct)[0] || null };
}

/* ---------- the notification board ---------- */
function alertsFor(v, d) {
  const out = [];
  const label = `${v.year} ${v.make} ${v.model}`;
  const today = new Date();

  for (const r of d.recalls || []) {
    if (r.completed || r.dismissed) continue;
    out.push({ level: 'bad', kind: 'recall', vehicle_id: v.id, vehicle: label, title: r.campaign, body: (r.component || '').split(':')[0], action: 'Free remedy at any franchised dealer' });
  }
  for (const r of d.reminders || []) {
    if (r.overdue) out.push({ level: 'bad', kind: 'maintenance', vehicle_id: v.id, vehicle: label, title: r.name, body: `${r.due} — ${r.driver === 'time' ? 'time' : 'mileage'} interval passed${r.severe ? ' (severe duty)' : ''}`, action: r.critical ? 'Interference-engine risk if this is a belt' : null });
    else if (r.cls === 'warn') out.push({ level: 'warn', kind: 'maintenance', vehicle_id: v.id, vehicle: label, title: r.name, body: `${r.due} remaining` });
  }
  for (const w of d.warranties || []) {
    if (w.near) out.push({ level: 'warn', kind: 'warranty', vehicle_id: v.id, vehicle: label, title: `${w.label} expiring`, body: w.summary, action: 'Anything you have been putting off, do it now' });
  }
  for (const doc of d.documents || []) {
    if (!doc.expires_date) continue;
    const days = (new Date(doc.expires_date) - today) / 86400000;
    if (days < 0) out.push({ level: 'bad', kind: 'document', vehicle_id: v.id, vehicle: label, title: `${doc.title} expired`, body: `Expired ${doc.expires_date}` });
    else if (days < 45) out.push({ level: 'warn', kind: 'document', vehicle_id: v.id, vehicle: label, title: `${doc.title} expires soon`, body: `Due ${doc.expires_date} (${Math.round(days)} days)` });
  }
  for (const t of d.tires || []) {
    if (!t.active) continue;
    if (t.cls === 'bad') out.push({ level: 'bad', kind: 'tires', vehicle_id: v.id, vehicle: label, title: 'Tires at the legal minimum', body: t.verdict });
    else if (t.cls === 'warn') out.push({ level: 'warn', kind: 'tires', vehicle_id: v.id, vehicle: label, title: 'Tires getting low', body: t.verdict });
    if (t.age?.aged) out.push({ level: 'warn', kind: 'tires', vehicle_id: v.id, vehicle: label, title: `Tires are ${t.age.years} years old`, body: t.age.note });
  }
  if (d.battery && d.battery.cls !== 'ok') {
    out.push({ level: d.battery.cls, kind: 'battery', vehicle_id: v.id, vehicle: label, title: 'Battery health', body: [d.battery.soc != null ? `${d.battery.soc}% state of charge` : null, d.battery.ccaPct != null ? `${d.battery.ccaPct}% of rated CCA` : null, d.battery.age != null ? `${d.battery.age} yr old` : null].filter(Boolean).join(' · ') });
  }
  if (d.brakes && d.brakes.cls !== 'ok' && d.brakes.cls !== 'grey') {
    out.push({ level: d.brakes.cls, kind: 'brakes', vehicle_id: v.id, vehicle: label, title: 'Brake measurements', body: d.brakes.verdict });
  }
  for (const t of d.dtcs || []) {
    if (t.cleared_at) continue;
    const repeat = t.clear_count >= 2 ? ` — cleared ${t.clear_count} times and it keeps coming back` : '';
    out.push({ level: t.status === 'pending' ? 'warn' : 'bad', kind: 'dtc', vehicle_id: v.id, vehicle: label, title: t.code, body: (t.description || '') + repeat });
  }
  // odometer sanity
  const odo = d.odometer || [];
  for (let i = 0; i < odo.length - 1; i++) {
    if (odo[i].value < odo[i + 1].value) {
      out.push({ level: 'warn', kind: 'odometer', vehicle_id: v.id, vehicle: label, title: 'Odometer went backwards', body: `${odo[i + 1].value.toLocaleString()} on ${odo[i + 1].at.slice(0, 10)} then ${odo[i].value.toLocaleString()} on ${odo[i].at.slice(0, 10)}. Typo, or a cluster swap worth documenting.` });
      break;
    }
  }
  return out;
}

/* ---------- enrichment: recalls + complaints ---------- */
async function enrich(vehicleId) {
  const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(vehicleId);
  if (!v || !v.year || !v.make || !v.model) return { ok: false, reason: 'incomplete vehicle' };
  const out = { recalls: 0, complaints: 0, source: 'offline' };

  try {
    const r = await nhtsa.recalls(v.year, v.make, v.model);
    out.source = r.source;
    const ins = db.prepare(`INSERT INTO recall_status (vehicle_id,campaign,component,summary,consequence,remedy,reported_date)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(vehicle_id,campaign) DO UPDATE SET
      component=excluded.component, summary=excluded.summary, consequence=excluded.consequence,
      remedy=excluded.remedy, reported_date=excluded.reported_date`);
    for (const x of (r.data?.results || [])) {
      ins.run(v.id, x.NHTSACampaignNumber || 'UNKNOWN', x.Component, x.Summary, x.Consequence, x.Remedy, x.ReportReceivedDate);
      out.recalls++;
    }
  } catch { /* keep going */ }

  try {
    const c = await nhtsa.complaints(v.year, v.make, v.model);
    const clusters = clusterComplaints(c.data?.results || []);
    db.prepare('DELETE FROM ref_complaints WHERE vehicle_id=?').run(v.id);
    const ins = db.prepare('INSERT INTO ref_complaints (vehicle_id,component,count) VALUES (?,?,?)');
    for (const x of clusters.slice(0, 25)) { ins.run(v.id, x.component + (x.watchNote ? ` — ${x.watchNote}` : ''), x.count); out.complaints++; }
  } catch { /* keep going */ }

  db.prepare('UPDATE vehicles SET updated_at=? WHERE id=?').run(new Date().toISOString(), v.id);
  return { ok: true, ...out };
}

/* ---------- seeds ---------- */
function seedSchedule(v) {
  const list = v.is_ev ? core.EV_SCHEDULE : core.DEFAULT_SCHEDULE;
  const ins = db.prepare(`INSERT INTO reminders
    (vehicle_id,name,system,interval_miles,interval_months,severe_factor,est_cost,note,last_done_miles,last_done_date,source)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'generic')`);
  const today = new Date().toISOString().slice(0, 10);
  for (const s of list) {
    ins.run(v.id, s.name, s.system, s.miles, s.months, s.severe, s.cost,
      s.note + (s.critical ? '' : ''), v.mileage || 0, today);
  }
}

function seedWarranties(v) {
  if (!v.year) return;
  const start = v.purchase_date || `${v.year}-01-01`;
  const rows = [
    { kind: 'bumper', label: 'Bumper-to-bumper', months: 36, miles: 36000 },
    { kind: 'powertrain', label: 'Powertrain', months: 60, miles: 60000 },
    { kind: 'emissions', label: 'Federal emissions (catalyst & ECM)', months: 96, miles: 80000 },
    ...(v.is_ev ? [{ kind: 'hybrid_hv', label: 'HV battery (federal minimum)', months: 96, miles: 100000 }] : [])
  ];
  const ins = db.prepare(`INSERT INTO warranties (vehicle_id,kind,label,months,miles,start_date,start_miles,note)
                          VALUES (?,?,?,?,?,?,0,?)`);
  for (const r of rows) ins.run(v.id, r.kind, r.label, r.months, r.miles, start,
    'Typical US term — edit to your actual in-service date and the maker\'s published terms.');
}

/* ============================================================
   ODOMETER
   ============================================================ */
api.post('/vehicles/:id/odometer', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  const value = parseInt(req.body?.value, 10);
  if (!Number.isFinite(value) || value < 0) throw httpErr(400, 'Odometer value must be a positive number.');
  const last = db.prepare('SELECT value FROM odometer_readings WHERE vehicle_id=? ORDER BY at DESC LIMIT 1').get(v.id);
  const suspect = last && value < last.value ? 1 : 0;
  const row = insert('odometer_readings', {
    vehicle_id: v.id, value,
    source: req.body?.source || 'manual',
    at: req.body?.at || new Date().toISOString(),
    note: req.body?.note || null,
    suspect
  });
  if (value >= (v.mileage || 0)) db.prepare('UPDATE vehicles SET mileage=?, updated_at=? WHERE id=?').run(value, new Date().toISOString(), v.id);
  res.status(201).json({ reading: row, suspect: !!suspect, warning: suspect ? 'That reading is lower than the previous one. Saved and flagged — check for a typo or document the cluster change.' : null });
}));

api.get('/vehicles/:id/odometer', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  res.json({ readings: db.prepare('SELECT * FROM odometer_readings WHERE vehicle_id=? ORDER BY at DESC').all(v.id) });
}));

/* ============================================================
   GENERIC CHILD COLLECTIONS
   ============================================================ */
const COLLECTIONS = {
  service: { table: 'service_records', order: 'date DESC, id DESC', fields: ['what', 'category', 'date', 'miles', 'performer', 'shop_name', 'labor_hours', 'parts_cost', 'labor_cost', 'cost', 'parts_json', 'notes', 'warranty_claim'] },
  fuel: { table: 'fuel_logs', order: 'odometer DESC, date DESC', fields: ['date', 'odometer', 'kind', 'quantity', 'price_per_unit', 'total', 'partial', 'missed_fill', 'station', 'charge_kind', 'octane', 'note'] },
  expenses: { table: 'expenses', order: 'date DESC', fields: ['date', 'category', 'amount', 'vendor', 'note'] },
  trips: { table: 'trips', order: 'date DESC', fields: ['date', 'miles', 'purpose', 'from_place', 'to_place', 'note', 'rate'] },
  warranties: { table: 'warranties', order: 'id', fields: ['kind', 'label', 'months', 'miles', 'start_date', 'start_miles', 'provider', 'contract_number', 'deductible', 'note'] },
  documents: { table: 'documents', order: "COALESCE(expires_date,'9999')", fields: ['kind', 'title', 'issuer', 'number', 'issued_date', 'expires_date', 'amount', 'note'] },
  tires: { table: 'tire_sets', order: 'active DESC, id DESC', fields: ['name', 'brand', 'model', 'size', 'season', 'dot_date', 'installed_date', 'installed_miles', 'removed_date', 'removed_miles', 'new_tread_32', 'rotation_pattern', 'tpms_ids', 'cost', 'active'] },
  battery: { table: 'battery_records', order: 'id DESC', fields: ['installed_date', 'group_size', 'cca', 'brand', 'test_date', 'rest_voltage', 'cranking_voltage', 'measured_cca', 'load_test', 'note'] },
  brakes: { table: 'brake_measurements', order: 'date DESC', fields: ['date', 'odometer', 'lf_pad', 'rf_pad', 'lr_pad', 'rr_pad', 'lf_rotor', 'rf_rotor', 'lr_rotor', 'rr_rotor', 'fluid_moisture', 'note'] }
};

for (const [name, cfg] of Object.entries(COLLECTIONS)) {
  api.get(`/vehicles/:id/${name}`, requireAuth, wrap(async (req, res) => {
    const v = assertVehicle(req.user.id, +req.params.id);
    res.json({ [name]: db.prepare(`SELECT * FROM ${cfg.table} WHERE vehicle_id=? ORDER BY ${cfg.order}`).all(v.id) });
  }));

  api.post(`/vehicles/:id/${name}`, requireAuth, wrap(async (req, res) => {
    const v = assertVehicle(req.user.id, +req.params.id, true);
    const data = pick(req.body || {}, cfg.fields);
    data.vehicle_id = v.id;
    if (name === 'service' && !data.cost) data.cost = (+data.parts_cost || 0) + (+data.labor_cost || 0);
    if (name === 'fuel') {
      if (!data.total && data.quantity && data.price_per_unit) data.total = +(data.quantity * data.price_per_unit).toFixed(2);
      if (!data.price_per_unit && data.quantity && data.total) data.price_per_unit = +(data.total / data.quantity).toFixed(3);
      if (data.odometer) postOdometer(v, +data.odometer, 'manual', 'From a fuel log');
    }
    if (name === 'trips' && !data.rate) data.rate = core.irsRate(new Date(data.date || Date.now()).getFullYear());
    const row = insert(cfg.table, data);
    if (name === 'service') closeOutReminders(v, row);
    if (name === 'service' && row.miles) postOdometer(v, row.miles, 'receipt', 'From a service record');
    if (name === 'brakes' && data.odometer) postOdometer(v, +data.odometer, 'manual', 'From a brake inspection');
    audit(req.user.id, v.id, `${name}.create`, row.id);
    res.status(201).json({ [name.replace(/s$/, '')]: row });
  }));

  api.patch(`/${name}/:rid`, requireAuth, wrap(async (req, res) => {
    ownedRow(req.user.id, cfg.table, +req.params.rid);
    const row = update(cfg.table, +req.params.rid, pick(req.body || {}, cfg.fields));
    res.json({ row });
  }));

  api.delete(`/${name}/:rid`, requireAuth, wrap(async (req, res) => {
    ownedRow(req.user.id, cfg.table, +req.params.rid);
    db.prepare(`DELETE FROM ${cfg.table} WHERE id=?`).run(+req.params.rid);
    res.json({ ok: true });
  }));
}

function postOdometer(v, value, source, note) {
  if (!Number.isFinite(value) || value <= 0) return;
  db.prepare('INSERT INTO odometer_readings (vehicle_id,value,source,note) VALUES (?,?,?,?)').run(v.id, value, source, note);
  if (value > (v.mileage || 0)) db.prepare('UPDATE vehicles SET mileage=? WHERE id=?').run(value, v.id);
}

/** A service record whose text matches a reminder resets that reminder's baseline. */
function closeOutReminders(v, rec) {
  const text = String(rec.what || '').toLowerCase();
  const rems = db.prepare('SELECT * FROM reminders WHERE vehicle_id=? AND active=1').all(v.id);
  const upd = db.prepare('UPDATE reminders SET last_done_miles=?, last_done_date=?, updated_at=? WHERE id=?');
  const matched = [];
  for (const r of rems) {
    const key = r.name.toLowerCase().split(/[&/(]/)[0].trim();
    const words = key.split(/\s+/).filter(w => w.length > 3);
    const hit = words.length && words.every(w => text.includes(w.replace(/s$/, '')));
    if (hit) {
      upd.run(rec.miles ?? v.mileage, rec.date, new Date().toISOString(), r.id);
      matched.push(r.name);
    }
  }
  return matched;
}

/* ---- tire measurements are nested one level deeper ---- */
api.get('/tires/:sid/measurements', requireAuth, wrap(async (req, res) => {
  const s = db.prepare('SELECT * FROM tire_sets WHERE id=?').get(+req.params.sid);
  if (!s) throw httpErr(404, 'Tire set not found.');
  assertVehicle(req.user.id, s.vehicle_id);
  res.json({ measurements: db.prepare('SELECT * FROM tire_measurements WHERE tire_set_id=? ORDER BY date DESC').all(s.id) });
}));

api.post('/tires/:sid/measurements', requireAuth, wrap(async (req, res) => {
  const s = db.prepare('SELECT * FROM tire_sets WHERE id=?').get(+req.params.sid);
  if (!s) throw httpErr(404, 'Tire set not found.');
  const v = assertVehicle(req.user.id, s.vehicle_id, true);
  const row = insert('tire_measurements', {
    ...pick(req.body || {}, ['date', 'odometer', 'lf', 'rf', 'lr', 'rr', 'psi_lf', 'psi_rf', 'psi_lr', 'psi_rr', 'rotated', 'note']),
    tire_set_id: s.id
  });
  if (row.odometer) postOdometer(v, row.odometer, 'manual', 'From a tire measurement');
  if (row.rotated) {
    const rem = db.prepare("SELECT * FROM reminders WHERE vehicle_id=? AND name LIKE 'Tire rotation%'").get(v.id);
    if (rem) db.prepare('UPDATE reminders SET last_done_miles=?, last_done_date=? WHERE id=?').run(row.odometer ?? v.mileage, row.date, rem.id);
  }
  res.status(201).json({ measurement: row });
}));

/* ============================================================
   REMINDERS
   ============================================================ */
api.get('/vehicles/:id/reminders', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  const rows = db.prepare('SELECT * FROM reminders WHERE vehicle_id=? ORDER BY active DESC, name').all(v.id)
    .map(r => core.reminderStatus(r, v));
  res.json({ reminders: rows, forecast: core.forecast12(rows, v) });
}));

api.post('/vehicles/:id/reminders', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  const d = pick(req.body || {}, ['name', 'system', 'interval_miles', 'interval_months', 'interval_hours', 'severe_factor', 'last_done_miles', 'last_done_date', 'est_cost', 'note', 'active']);
  if (!d.name) throw httpErr(400, 'A reminder needs a name.');
  d.vehicle_id = v.id; d.source = 'custom';
  if (d.last_done_miles == null) d.last_done_miles = v.mileage;
  if (!d.last_done_date) d.last_done_date = new Date().toISOString().slice(0, 10);
  res.status(201).json({ reminder: core.reminderStatus(insert('reminders', d), v) });
}));

api.patch('/reminders/:rid', requireAuth, wrap(async (req, res) => {
  const r = ownedRow(req.user.id, 'reminders', +req.params.rid);
  const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(r.vehicle_id);
  const d = pick(req.body || {}, ['name', 'system', 'interval_miles', 'interval_months', 'interval_hours', 'severe_factor', 'last_done_miles', 'last_done_date', 'est_cost', 'note', 'active']);
  d.updated_at = new Date().toISOString();
  res.json({ reminder: core.reminderStatus(update('reminders', r.id, d), v) });
}));

api.post('/reminders/:rid/done', requireAuth, wrap(async (req, res) => {
  const r = ownedRow(req.user.id, 'reminders', +req.params.rid);
  const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(r.vehicle_id);
  const miles = req.body?.miles ?? v.mileage;
  const date = req.body?.date ?? new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE reminders SET last_done_miles=?, last_done_date=?, updated_at=? WHERE id=?')
    .run(miles, date, new Date().toISOString(), r.id);

  let record = null;
  if (req.body?.log_service !== false) {
    record = insert('service_records', {
      vehicle_id: v.id, what: r.name, category: 'maintenance', date, miles,
      performer: req.body?.performer || 'DIY', cost: req.body?.cost ?? 0,
      notes: 'Logged from the maintenance schedule'
    });
  }
  audit(req.user.id, v.id, 'reminder.done', r.name);
  res.json({ reminder: core.reminderStatus(db.prepare('SELECT * FROM reminders WHERE id=?').get(r.id), v), record });
}));

api.delete('/reminders/:rid', requireAuth, wrap(async (req, res) => {
  ownedRow(req.user.id, 'reminders', +req.params.rid);
  db.prepare('DELETE FROM reminders WHERE id=?').run(+req.params.rid);
  res.json({ ok: true });
}));

/* ============================================================
   RECALLS
   ============================================================ */
api.patch('/recalls/:rid', requireAuth, wrap(async (req, res) => {
  const r = ownedRow(req.user.id, 'recall_status', +req.params.rid);
  const d = pick(req.body || {}, ['completed', 'dismissed']);
  if (d.completed) d.completed_at = new Date().toISOString().slice(0, 10);
  res.json({ recall: update('recall_status', r.id, d) });
}));

/* ============================================================
   DIAGNOSTICS
   ============================================================ */
api.post('/vehicles/:id/scan', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  const { adapter, protocol, monitors, codes = [], datalogs = [], notes, odometer, imported_from } = req.body || {};

  const session = insert('diag_sessions', {
    vehicle_id: v.id,
    adapter: adapter || 'unknown',
    protocol: protocol || null,
    odometer: odometer ?? v.mileage,
    monitors_json: monitors ? JSON.stringify(monitors) : null,
    notes: notes || null,
    imported_from: imported_from || null
  });

  const saved = [];
  for (const c of codes) {
    const dec = core.decodeDTC(c.code);
    const existing = db.prepare('SELECT * FROM dtcs WHERE vehicle_id=? AND code=? AND cleared_at IS NULL').get(v.id, dec.code);
    if (existing) {
      db.prepare("UPDATE dtcs SET last_seen=datetime('now'), status=?, session_id=? WHERE id=?")
        .run(c.status || existing.status, session.id, existing.id);
      saved.push({ ...existing, repeat: true, decoded: dec });
    } else {
      const prior = db.prepare('SELECT COUNT(*) c FROM dtcs WHERE vehicle_id=? AND code=? AND cleared_at IS NOT NULL').get(v.id, dec.code).c;
      const row = insert('dtcs', {
        vehicle_id: v.id, session_id: session.id, code: dec.code,
        description: c.description || dec.description,
        status: c.status || 'stored',
        module: c.module || 'powertrain',
        clear_count: prior,
        freeze_frame_json: c.freeze_frame ? JSON.stringify(c.freeze_frame) : null
      });
      saved.push({ ...row, decoded: dec, returnedAfterClear: prior > 0 });
    }
  }

  for (const dl of datalogs) {
    insert('datalogs', { session_id: session.id, pid: dl.pid, name: dl.name || null, unit: dl.unit || null, samples_json: JSON.stringify(dl.samples || []) });
  }

  if (odometer) postOdometer(v, +odometer, 'obd', 'Read during a diagnostic session');
  audit(req.user.id, v.id, 'scan', { adapter, codes: saved.length });
  res.status(201).json({ session, dtcs: saved });
}));

api.post('/dtcs/:did/clear', requireAuth, wrap(async (req, res) => {
  const t = ownedRow(req.user.id, 'dtcs', +req.params.did);
  db.prepare("UPDATE dtcs SET cleared_at=datetime('now'), clear_count=clear_count+1 WHERE id=?").run(t.id);
  audit(req.user.id, t.vehicle_id, 'dtc.clear', t.code);
  const row = db.prepare('SELECT * FROM dtcs WHERE id=?').get(t.id);
  res.json({
    dtc: row,
    warning: row.clear_count >= 2
      ? `You have now cleared ${row.code} ${row.clear_count} times. Clearing a code does not fix anything — it also wipes the freeze frame and resets every readiness monitor, which will fail you at inspection.`
      : 'Clearing resets all readiness monitors. Expect to need a full drive cycle before an emissions test.'
  });
}));

api.get('/vehicles/:id/dtcs', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  const rows = db.prepare('SELECT * FROM dtcs WHERE vehicle_id=? ORDER BY last_seen DESC').all(v.id)
    .map(r => ({ ...r, decoded: core.decodeDTC(r.code), freeze_frame: r.freeze_frame_json ? JSON.parse(r.freeze_frame_json) : null }));
  res.json({ dtcs: rows });
}));

api.get('/sessions/:sid', requireAuth, wrap(async (req, res) => {
  const s = db.prepare('SELECT * FROM diag_sessions WHERE id=?').get(+req.params.sid);
  if (!s) throw httpErr(404, 'Session not found.');
  assertVehicle(req.user.id, s.vehicle_id);
  res.json({
    session: s,
    dtcs: db.prepare('SELECT * FROM dtcs WHERE session_id=?').all(s.id),
    datalogs: db.prepare('SELECT * FROM datalogs WHERE session_id=?').all(s.id).map(d => ({ ...d, samples: JSON.parse(d.samples_json) }))
  });
}));

api.post('/fuel-trim', requireAuth, wrap(async (req, res) => {
  res.json(core.interpretFuelTrim(req.body || {}));
}));

/* ---- Topdon / generic scanner report import (CSV or text) ---- */
api.post('/vehicles/:id/import-report', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  const text = String(req.body?.text || '');
  if (!text.trim()) throw httpErr(400, 'Paste the text of the report, or upload the CSV.');

  const codes = [];
  const seen = new Set();
  const re = /\b([PCBU][0-3][0-9A-F]{3})\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const code = m[1].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    // grab the rest of the line as the description if the tool wrote one
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const lineEnd = text.indexOf('\n', m.index);
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const desc = line.replace(new RegExp(`.*${code}[\\s:,\\-]*`, 'i'), '').replace(/["|,;]+$/, '').trim();
    const status = /pending/i.test(line) ? 'pending' : /permanent/i.test(line) ? 'permanent' : /history/i.test(line) ? 'history' : 'stored';
    codes.push({ code, description: desc.length > 3 ? desc : null, status });
  }
  if (!codes.length) throw httpErr(422, 'No diagnostic trouble codes found in that text. Codes look like P0420, C0035, U0100.');

  req.body = { adapter: req.body?.adapter || 'Imported report', imported_from: req.body?.source || 'Topdon report', codes, notes: req.body?.notes || null };
  const fake = { params: { id: String(v.id) }, user: req.user, body: req.body };
  // reuse the scan handler logic inline
  const session = insert('diag_sessions', { vehicle_id: v.id, adapter: req.body.adapter, imported_from: req.body.imported_from, odometer: v.mileage, notes: req.body.notes });
  const saved = [];
  for (const c of codes) {
    const dec = core.decodeDTC(c.code);
    const prior = db.prepare('SELECT COUNT(*) c FROM dtcs WHERE vehicle_id=? AND code=?').get(v.id, dec.code).c;
    if (prior) continue;
    saved.push(insert('dtcs', { vehicle_id: v.id, session_id: session.id, code: dec.code, description: c.description || dec.description, status: c.status }));
  }
  audit(req.user.id, v.id, 'import.report', { found: codes.length, added: saved.length });
  res.status(201).json({ session, found: codes.length, added: saved.length, dtcs: saved.map(d => ({ ...d, decoded: core.decodeDTC(d.code) })) });
}));

/* ============================================================
   FILE UPLOADS — documents and attachments
   ============================================================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).slice(0, 10)}`)
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

api.post('/vehicles/:id/documents/upload', requireAuth, upload.single('file'), wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  const d = pick(req.body || {}, COLLECTIONS.documents.fields);
  d.vehicle_id = v.id;
  if (!d.title) d.title = req.file?.originalname || 'Document';
  if (!d.kind) d.kind = 'other';
  if (req.file) {
    d.file_path = path.basename(req.file.path);
    d.file_name = req.file.originalname;
    d.file_mime = req.file.mimetype;
    d.file_size = req.file.size;
  }
  res.status(201).json({ document: insert('documents', d) });
}));

api.post('/vehicles/:id/attachments', requireAuth, upload.single('file'), wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id, true);
  if (!req.file) throw httpErr(400, 'No file received.');
  const row = insert('attachments', {
    vehicle_id: v.id,
    parent_kind: req.body?.parent_kind || null,
    parent_id: req.body?.parent_id ? +req.body.parent_id : null,
    kind: req.body?.kind || (req.file.mimetype.startsWith('audio') ? 'audio' : req.file.mimetype.startsWith('video') ? 'video' : req.file.mimetype.startsWith('image') ? 'photo' : 'doc'),
    file_path: path.basename(req.file.path),
    file_name: req.file.originalname,
    file_mime: req.file.mimetype,
    file_size: req.file.size,
    caption: req.body?.caption || null
  });
  res.status(201).json({ attachment: row });
}));

api.get('/vehicles/:id/attachments', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  res.json({ attachments: db.prepare('SELECT * FROM attachments WHERE vehicle_id=? ORDER BY created_at DESC').all(v.id) });
}));

api.get('/files/:name', requireAuth, wrap(async (req, res) => {
  const name = path.basename(req.params.name);
  const own = db.prepare(`
    SELECT 1 FROM documents d JOIN vehicles v ON v.id=d.vehicle_id
      JOIN memberships m ON m.garage_id=v.garage_id AND m.user_id=? WHERE d.file_path=?
    UNION SELECT 1 FROM attachments a JOIN vehicles v2 ON v2.id=a.vehicle_id
      JOIN memberships m2 ON m2.garage_id=v2.garage_id AND m2.user_id=? WHERE a.file_path=?`)
    .get(req.user.id, name, req.user.id, name);
  if (!own) throw httpErr(404, 'File not found.');
  const p = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(p)) throw httpErr(404, 'File missing from storage.');
  res.sendFile(p);
}));

/* ============================================================
   DASHBOARD + REPORTS + EXPORT
   ============================================================ */
api.get('/dashboard', requireAuth, wrap(async (req, res) => {
  const vehicles = db.prepare(`
    SELECT v.* FROM vehicles v JOIN memberships m ON m.garage_id=v.garage_id AND m.user_id=?
    WHERE v.archived=0 ORDER BY v.id`).all(req.user.id);
  let alerts = [];
  for (const v of vehicles) {
    const d = vehicleDetail(v);
    v.open_recalls = d.recalls.filter(r => !r.completed && !r.dismissed).length;
    v.economy = d.economy.average;
    v.economy_unit = d.economy.unit;
    v.cost_per_mile = d.tco.costPerMile;
    v.due = { overdue: d.reminders.filter(r => r.overdue).length, soon: d.reminders.filter(r => !r.overdue && r.cls === 'warn').length };
    alerts = alerts.concat(d.alerts);
  }
  const rank = { bad: 0, warn: 1, ok: 2 };
  alerts.sort((a, b) => (rank[a.level] ?? 3) - (rank[b.level] ?? 3));
  res.json({ vehicles, alerts, live: LIVE });
}));

api.get('/vehicles/:id/report/:kind', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  const d = vehicleDetail(v);
  const kind = req.params.kind;
  const base = {
    kind,
    generated_at: new Date().toISOString(),
    vehicle: v,
    disclaimer: 'Prepared from owner-entered records and free public data (NHTSA vPIC, Recalls, Complaints). Not a substitute for inspection by a qualified technician. No licensed repair-data content is reproduced in this document.'
  };

  if (kind === 'history') {
    res.json({
      report: {
        ...base,
        title: 'Vehicle history packet',
        summary: {
          records: d.service.length,
          lifetime_spend: d.tco.service,
          odometer: v.mileage,
          open_recalls: d.recalls.filter(r => !r.completed).length,
          completed_recalls: d.recalls.filter(r => r.completed).length,
          spec_source: v.source === 'vin' ? 'NHTSA vPIC VIN decode' : 'Manual entry',
          economy: d.economy.average ? `${d.economy.average} ${d.economy.unit} over ${d.economy.count} tanks` : null,
          duty: v.duty
        },
        service: d.service,
        odometer_history: d.odometer,
        recalls: d.recalls,
        tires: d.tires,
        brakes: d.brakes,
        battery: d.battery,
        documents: d.documents.map(x => ({ kind: x.kind, title: x.title, expires_date: x.expires_date })),
        maintenance: d.reminders.map(r => ({ name: r.name, due: r.due, status: r.cls }))
      }
    });
  } else if (kind === 'handoff') {
    const open = d.dtcs.filter(t => !t.cleared_at);
    res.json({
      report: {
        ...base,
        title: 'Mechanic hand-off packet',
        symptoms: req.query.symptoms || null,
        codes: open.map(t => ({ ...t, decoded: core.decodeDTC(t.code), freeze_frame: t.freeze_frame_json ? JSON.parse(t.freeze_frame_json) : null })),
        repeat_offenders: open.filter(t => t.clear_count >= 1).map(t => ({ code: t.code, cleared: t.clear_count })),
        sessions: d.sessions,
        recent_service: d.service.slice(0, 10),
        already_tried: d.service.slice(0, 10).map(s => s.what),
        vehicle_notes: `${v.duty === 'severe' ? 'Owner reports severe-duty use. ' : ''}${v.mileage ? `${v.mileage.toLocaleString()} miles on the clock.` : ''}`
      }
    });
  } else if (kind === 'cost') {
    const year = +(req.query.year || new Date().getFullYear());
    const inYear = a => (a.date || '').startsWith(String(year));
    const trips = d.trips.filter(inYear);
    const businessMiles = trips.filter(t => t.purpose === 'business').reduce((s, t) => s + t.miles, 0);
    res.json({
      report: {
        ...base,
        title: `Cost summary — ${year}`,
        year,
        totals: d.tco,
        economy: d.economy,
        by_category: {
          service: d.service.filter(inYear).reduce((s, r) => s + (r.cost || 0), 0),
          fuel: d.fuel.filter(inYear).reduce((s, r) => s + (r.total || 0), 0),
          other: d.expenses.filter(inYear).reduce((s, r) => s + (r.amount || 0), 0)
        },
        business_mileage: {
          miles: +businessMiles.toFixed(1),
          rate: core.irsRate(year),
          deduction: +(businessMiles * core.irsRate(year)).toFixed(2),
          trips: trips.length,
          note: 'Standard mileage rate. You cannot also deduct actual operating costs for the same miles — pick one method.'
        },
        forecast: d.forecast
      }
    });
  } else if (kind === 'ppi') {
    res.json({ report: { ...base, title: 'Pre-purchase inspection checklist', checklist: PPI_CHECKLIST, recalls: d.recalls, complaints: d.complaints } });
  } else if (kind === 'warranty') {
    res.json({
      report: {
        ...base, title: 'Warranty claim packet',
        warranties: d.warranties,
        supporting_service: d.service,
        codes: d.dtcs.filter(t => !t.cleared_at),
        note: 'Attach receipts showing that required maintenance was performed on schedule — that is what a denial usually turns on.'
      }
    });
  } else {
    throw httpErr(404, 'Unknown report type. Try: history, handoff, cost, ppi, warranty.');
  }
}));

const PPI_CHECKLIST = [
  { section: 'Paperwork', items: ['VIN on dash, door jamb and title all match', 'Title in the seller\'s name, no lien', 'Odometer on title matches the cluster', 'Open recalls checked by VIN at nhtsa.gov/recalls', 'Service records present and consistent with the mileage'] },
  { section: 'Cold start', items: ['Engine started genuinely cold — a warm engine hides a lot', 'Blue smoke at start (valve seals), white after warm-up (head gasket)', 'Rattle for the first 2 seconds (timing chain tensioner)', 'MIL illuminates at key-on then goes out — a bulb removed to hide a code is a walk-away'] },
  { section: 'Scan', items: ['All readiness monitors complete — incomplete means codes were recently cleared', 'Stored, pending AND permanent codes read', 'Freeze frame captured', 'Fuel trims at idle and 2,500 rpm', 'Misfire counters per cylinder'] },
  { section: 'Body & structure', items: ['Panel gaps even, paint depth consistent', 'Overspray on trim and weatherstrip', 'Frame rails and inner fenders straight, no wrinkles', 'Trunk floor and spare well for rear-impact repair', 'Underbody rust: rockers, subframe mounts, brake and fuel lines'] },
  { section: 'Drivetrain', items: ['Transmission shifts at part and full throttle', 'No driveline vibration at 45–70 mph', 'Clutch bite point (manual)', 'AWD/4WD engages and disengages without binding'] },
  { section: 'Chassis', items: ['Tire tread depths at all four and DOT dates', 'Brake pad and rotor measurements', 'Bounce test each corner', 'Steering play, no clunk over bumps', 'Wheel bearing noise on a curve'] },
  { section: 'Fluids', items: ['Oil level and colour, no coolant emulsion under the cap', 'Coolant colour and level in the reservoir, no oil film', 'ATF colour and smell — burnt is burnt', 'Brake fluid clarity and moisture test'] },
  { section: 'Electrical', items: ['Every window, lock, mirror, seat and light', 'HVAC hot and cold, all blower speeds', 'Battery rest voltage and load test', 'Charging voltage 13.5–14.7 V at idle'] }
];

api.get('/export', requireAuth, wrap(async (req, res) => {
  const vehicles = db.prepare(`
    SELECT v.* FROM vehicles v JOIN memberships m ON m.garage_id=v.garage_id AND m.user_id=?`).all(req.user.id);
  const out = { exported_at: new Date().toISOString(), user: req.user.email, vehicles: [] };
  const tables = ['odometer_readings', 'service_records', 'reminders', 'fuel_logs', 'expenses', 'trips',
    'documents', 'warranties', 'tire_sets', 'battery_records', 'brake_measurements',
    'diag_sessions', 'dtcs', 'recall_status', 'attachments'];
  for (const v of vehicles) {
    const bundle = { vehicle: v };
    for (const t of tables) bundle[t] = db.prepare(`SELECT * FROM ${t} WHERE vehicle_id=?`).all(v.id);
    bundle.tire_measurements = bundle.tire_sets.flatMap(s => db.prepare('SELECT * FROM tire_measurements WHERE tire_set_id=?').all(s.id));
    out.vehicles.push(bundle);
  }
  res.setHeader('Content-Disposition', `attachment; filename="garage-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(out);
}));

/* ============================================================
   REFERENCE (free public data + standards)
   ============================================================ */
api.get('/ref/makes/:year', requireAuth, wrap(async (req, res) => {
  const r = await nhtsa.makes(+req.params.year);
  res.json({ makes: (r.data?.results || []).map(x => x.make), source: r.source });
}));

api.get('/ref/models/:year/:make', requireAuth, wrap(async (req, res) => {
  const r = await nhtsa.models(+req.params.year, req.params.make);
  res.json({ models: (r.data?.results || []).map(x => x.model), source: r.source });
}));

api.get('/ref/vin/:vin', requireAuth, wrap(async (req, res) => {
  const r = await nhtsa.decodeVin(req.params.vin);
  const raw = r.data?.Results?.[0];
  res.json({ decoded: raw ? normalizeVin({ ...raw, VIN: req.params.vin }) : null, raw, source: r.source });
}));

api.get('/ref/dtc/:code', requireAuth, (req, res) => res.json(core.decodeDTC(req.params.code)));
api.get('/ref/monitors', requireAuth, (req, res) => res.json({ monitors: core.MONITORS, driveCycle: core.DRIVE_CYCLE }));
api.get('/ref/irs-rate/:year', requireAuth, (req, res) => res.json({ year: +req.params.year, rate: core.irsRate(req.params.year) }));

api.get('/vehicles/:id/epa', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  const r = await nhtsa.epaMenu(v.year, v.make, v.model);
  res.json({ options: r.data ?? null, source: r.source, note: 'EPA combined figures are the baseline your logged economy is compared against.' });
}));

api.get('/vehicles/:id/safety', requireAuth, wrap(async (req, res) => {
  const v = assertVehicle(req.user.id, +req.params.id);
  const r = await nhtsa.safety(v.year, v.make, v.model);
  res.json({ ratings: r.data?.Results ?? [], source: r.source });
}));

/* ---------- error handler ---------- */
api.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Server error' });
});
