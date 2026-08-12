/* ============================================================
   auth.js — multi-user accounts, sessions, garage membership
   ============================================================ */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const SESSION_DAYS = 30;
export const COOKIE = 'garage_sid';

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return { token, expires };
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.units, u.role, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?`).get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    destroySession(token);
    return null;
  }
  return row;
}

export function registerUser({ email, name, password }) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpErr(400, 'A valid email address is required.');
  if (!password || password.length < 8) throw httpErr(400, 'Password must be at least 8 characters.');
  if (!name) name = email.split('@')[0];
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) throw httpErr(409, 'An account already exists for that email address.');

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, name, pw_hash) VALUES (?,?,?)').run(email, name, hash);
  const userId = info.lastInsertRowid;

  // every user gets a personal garage
  const g = db.prepare('INSERT INTO garages (name, owner_id) VALUES (?,?)').run(`${name}'s garage`, userId);
  db.prepare('INSERT INTO memberships (garage_id, user_id, role) VALUES (?,?,?)').run(g.lastInsertRowid, userId, 'owner');
  return db.prepare('SELECT id, email, name, units, role FROM users WHERE id = ?').get(userId);
}

export function loginUser({ email, password }) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email || '');
  if (!row || !bcrypt.compareSync(password || '', row.pw_hash)) throw httpErr(401, 'Email or password is incorrect.');
  return { id: row.id, email: row.email, name: row.name, units: row.units, role: row.role };
}

/* ---- garage scoping ---- */
export function garagesFor(userId) {
  return db.prepare(`
    SELECT g.*, m.role AS my_role,
           (SELECT COUNT(*) FROM vehicles v WHERE v.garage_id = g.id AND v.archived = 0) AS vehicle_count
    FROM garages g JOIN memberships m ON m.garage_id = g.id
    WHERE m.user_id = ? ORDER BY g.id`).all(userId);
}

export function primaryGarageId(userId) {
  const r = db.prepare('SELECT garage_id FROM memberships WHERE user_id = ? ORDER BY garage_id LIMIT 1').get(userId);
  return r?.garage_id ?? null;
}

/** Throws unless the user can see this vehicle. Returns the vehicle row. */
export function assertVehicle(userId, vehicleId, needWrite = false) {
  const v = db.prepare(`
    SELECT v.*, m.role AS my_role FROM vehicles v
    JOIN memberships m ON m.garage_id = v.garage_id AND m.user_id = ?
    WHERE v.id = ?`).get(userId, vehicleId);
  if (!v) throw httpErr(404, 'Vehicle not found in any garage you belong to.');
  if (needWrite && v.my_role === 'viewer') throw httpErr(403, 'Your role on this garage is read-only.');
  return v;
}

export function requireAuth(req, res, next) {
  const user = userFromToken(req.cookies?.[COOKIE]);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  req.user = user;
  next();
}

export function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function audit(userId, vehicleId, action, detail) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, vehicle_id, action, detail) VALUES (?,?,?,?)')
      .run(userId ?? null, vehicleId ?? null, action, typeof detail === 'string' ? detail : JSON.stringify(detail ?? null));
  } catch { /* audit must never break a request */ }
}
