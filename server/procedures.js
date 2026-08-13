/* ============================================================
   procedures.js — owner-authored illustrated repair procedures

   The content model behind the HaynesPro-style experience, without
   any of HaynesPro's data. Photographs are the user's own, of their
   own vehicle. Specs are transcribed by the user from a source they
   legitimately hold, and the source is stored alongside the number.

   Hotspot coordinates are normalised 0..1 so a pin lands in the same
   place on a phone, a tablet and a printed report.
   ============================================================ */
import { db } from './db.js';
import { httpErr } from './auth.js';

/* ---------- ownership ---------- */
export function ownProcedure(userId, id, write = true) {
  const p = db.prepare('SELECT * FROM procedures WHERE id = ?').get(id);
  if (!p) throw httpErr(404, 'Procedure not found.');
  if (p.user_id !== userId) {
    // shared through a garage the user belongs to?
    const shared = p.vehicle_id && db.prepare(`
      SELECT m.role FROM vehicles v
      JOIN memberships m ON m.garage_id = v.garage_id AND m.user_id = ?
      WHERE v.id = ?`).get(userId, p.vehicle_id);
    if (!shared) throw httpErr(404, 'Procedure not found.');
    if (write && shared.role === 'viewer') throw httpErr(403, 'Your role on this garage is read-only.');
  }
  return p;
}

/* ---------- assembly ---------- */
export function fullProcedure(id) {
  const p = db.prepare('SELECT * FROM procedures WHERE id = ?').get(id);
  if (!p) return null;
  const media = db.prepare('SELECT * FROM procedure_media WHERE procedure_id = ? ORDER BY sort, id').all(id);
  const steps = db.prepare('SELECT * FROM procedure_steps WHERE procedure_id = ? ORDER BY seq, id').all(id);
  const ids = media.map(m => m.id);
  const hotspots = ids.length
    ? db.prepare(`SELECT * FROM procedure_hotspots WHERE media_id IN (${ids.map(() => '?').join(',')}) ORDER BY number, id`).all(...ids)
    : [];
  for (const m of media) m.hotspots = hotspots.filter(h => h.media_id === m.id);

  const patternIds = [...new Set(steps.map(s => s.torque_pattern_id).filter(Boolean))];
  const patterns = patternIds.length
    ? db.prepare(`SELECT * FROM torque_patterns WHERE id IN (${patternIds.map(() => '?').join(',')})`).all(...patternIds)
      .map(t => ({ ...t, stages: safeJson(t.stages, []) }))
    : [];

  const runs = db.prepare('SELECT * FROM procedure_runs WHERE procedure_id = ? ORDER BY started_at DESC LIMIT 10').all(id)
    .map(r => ({ ...r, done_steps: safeJson(r.done_steps, []) }));

  return {
    ...p,
    tool_ids: splitList(p.tool_ids),
    safety_flags: splitList(p.safety_flags),
    media, steps, patterns, runs,
    stepCount: steps.length,
    lastRun: runs[0] || null
  };
}

export function listProcedures(userId, vehicleId) {
  const rows = vehicleId
    ? db.prepare(`SELECT * FROM procedures WHERE archived = 0 AND (vehicle_id = ? OR (vehicle_id IS NULL AND user_id = ?))
                  ORDER BY updated_at DESC`).all(vehicleId, userId)
    : db.prepare('SELECT * FROM procedures WHERE archived = 0 AND user_id = ? ORDER BY updated_at DESC').all(userId);
  for (const p of rows) {
    p.stepCount = db.prepare('SELECT COUNT(*) c FROM procedure_steps WHERE procedure_id = ?').get(p.id).c;
    p.mediaCount = db.prepare('SELECT COUNT(*) c FROM procedure_media WHERE procedure_id = ?').get(p.id).c;
    p.safety_flags = splitList(p.safety_flags);
    p.tool_ids = splitList(p.tool_ids);
    const run = db.prepare('SELECT * FROM procedure_runs WHERE procedure_id = ? ORDER BY started_at DESC LIMIT 1').get(p.id);
    p.lastRun = run ? { ...run, done_steps: safeJson(run.done_steps, []) } : null;
  }
  return rows;
}

/* ---------- step renumbering ----------
   Steps carry an explicit seq so they can be reordered without
   rewriting ids that hotspots point at. */
export function resequence(procedureId) {
  const steps = db.prepare('SELECT id FROM procedure_steps WHERE procedure_id = ? ORDER BY seq, id').all(procedureId);
  const upd = db.prepare('UPDATE procedure_steps SET seq = ? WHERE id = ?');
  steps.forEach((s, i) => upd.run(i + 1, s.id));
  return steps.length;
}

export function moveStep(procedureId, stepId, direction) {
  const steps = db.prepare('SELECT id, seq FROM procedure_steps WHERE procedure_id = ? ORDER BY seq, id').all(procedureId);
  const i = steps.findIndex(s => s.id === stepId);
  if (i < 0) throw httpErr(404, 'Step not found.');
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= steps.length) return resequence(procedureId);
  const upd = db.prepare('UPDATE procedure_steps SET seq = ? WHERE id = ?');
  upd.run(steps[j].seq, steps[i].id);
  upd.run(steps[i].seq, steps[j].id);
  return resequence(procedureId);
}

/* ---------- runs ---------- */
export function startRun(userId, procedureId, vehicleId, odometer) {
  const open = db.prepare(`SELECT * FROM procedure_runs
    WHERE procedure_id = ? AND user_id = ? AND finished_at IS NULL
    ORDER BY started_at DESC LIMIT 1`).get(procedureId, userId);
  if (open) return { ...open, done_steps: safeJson(open.done_steps, []), resumed: true };

  const info = db.prepare(`INSERT INTO procedure_runs (procedure_id, vehicle_id, user_id, odometer)
                           VALUES (?,?,?,?)`).run(procedureId, vehicleId ?? null, userId, odometer ?? null);
  const row = db.prepare('SELECT * FROM procedure_runs WHERE id = ?').get(info.lastInsertRowid);
  return { ...row, done_steps: [], resumed: false };
}

export function updateRun(runId, { done, notes, finish, odometer }) {
  const row = db.prepare('SELECT * FROM procedure_runs WHERE id = ?').get(runId);
  if (!row) throw httpErr(404, 'Run not found.');
  const d = {};
  if (Array.isArray(done)) d.done_steps = JSON.stringify([...new Set(done)]);
  if (notes !== undefined) d.notes = notes;
  if (odometer !== undefined) d.odometer = odometer;
  if (finish) d.finished_at = new Date().toISOString();
  const keys = Object.keys(d);
  if (keys.length) {
    db.prepare(`UPDATE procedure_runs SET ${keys.map(k => k + '=?').join(',')} WHERE id = ?`)
      .run(...keys.map(k => d[k]), runId);
  }
  const out = db.prepare('SELECT * FROM procedure_runs WHERE id = ?').get(runId);
  return { ...out, done_steps: safeJson(out.done_steps, []) };
}

/* ---------- companion deep links ----------
   These open the user's OWN subscription at the right vehicle. No
   content is fetched, scraped or stored — the tab simply lands where
   they already were going. */
export function companionLinks(vehicle, system, title) {
  const v = vehicle || {};
  const q = encodeURIComponent([v.year, v.make, v.model, title].filter(Boolean).join(' '));
  const ymm = encodeURIComponent([v.year, v.make, v.model].filter(Boolean).join(' '));
  return [
    {
      id: 'mitchell1',
      label: 'Mitchell1 DIY',
      note: 'eautorepair.net — about $29.95 a year for one vehicle, or $44.95 for four years. Colour wiring diagrams and OEM procedures.',
      url: 'https://www.eautorepair.net/',
      search: `https://www.google.com/search?q=site:eautorepair.net+${q}`,
      paid: true
    },
    {
      id: 'alldata',
      label: 'ALLDATAdiy',
      note: 'About $19.99 a month or $60 a year per vehicle. Actual OEM documentation — the same procedure a dealer technician reads.',
      url: 'https://www.alldatadiy.com/',
      paid: true
    },
    {
      id: 'chilton',
      label: 'ChiltonLibrary',
      note: 'Free with a library card at thousands of US library systems. Wiring diagrams, torque specs and TSBs included.',
      url: `https://www.google.com/search?q=${encodeURIComponent('ChiltonLibrary library card remote access ' + (v.make || ''))}`,
      paid: false
    },
    {
      id: 'ebsco',
      label: 'EBSCO Auto Repair Source',
      note: 'Also free with a library card. Hundreds of thousands of drawings and step-by-step photographs.',
      url: `https://www.google.com/search?q=${encodeURIComponent('"Auto Repair Source" EBSCO library card')}`,
      paid: false
    },
    {
      id: 'oem',
      label: `${v.make || 'OEM'} service portal`,
      note: 'Under the right-to-repair MOU every automaker publishes service information to independents. Day passes are typically $20–30. NASTF maintains the pricing matrix for all of them.',
      url: 'https://www.nastf.org/',
      search: `https://www.google.com/search?q=${encodeURIComponent((v.make || '') + ' technical service information subscription independent')}`,
      paid: true
    },
    {
      id: 'youtube',
      label: 'Video walkthrough',
      url: `https://www.youtube.com/results?search_query=${q}`,
      note: 'Community experience, not an authoritative procedure. Useful for seeing the awkward part; never for a torque value.',
      paid: false
    },
    {
      id: 'forum',
      label: 'Owner forums',
      url: `https://www.google.com/search?q=${q}+forum`,
      note: 'Label anything from here as community experience and keep it separate from OEM specs.',
      paid: false
    }
  ].filter(x => x.id !== 'oem' || v.make);
}

function splitList(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function safeJson(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
