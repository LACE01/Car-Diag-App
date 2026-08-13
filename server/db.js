/* ============================================================
   db.js — SQLite schema and migration runner
   Two rules from the framework, enforced here:
     1. every user-owned row carries updated_at + device_id for sync
     2. reference data (recalls, complaints, DTC defs, NHTSA cache)
        lives in its own tables so a provider can be wiped and
        re-ingested without touching anyone's records
   ============================================================ */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/data';
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

/* ------------------------------------------------------------
   Thin wrapper over node:sqlite.

   Using the runtime's own SQLite rather than a native npm module
   means there is no compile step, no node-gyp, no prebuild
   mismatch, and the container image is a single stage. The cost
   is that node:sqlite only binds null, number, bigint, string and
   Uint8Array — so booleans, undefined, Dates and plain objects are
   normalised here rather than at every call site.
   ------------------------------------------------------------ */
function norm(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v;
}
const plain = r => (r ? { ...r } : r);

class Stmt {
  constructor(s) { this.s = s; }
  run(...a) { return this.s.run(...a.map(norm)); }
  get(...a) { return plain(this.s.get(...a.map(norm))); }
  all(...a) { return this.s.all(...a.map(norm)).map(plain); }
}
class DB {
  constructor(file) { this.raw = new DatabaseSync(file); }
  exec(sql) { return this.raw.exec(sql); }
  prepare(sql) { return new Stmt(this.raw.prepare(sql)); }
  close() { return this.raw.close(); }
}

export const db = new DB(path.join(DATA_DIR, 'garage.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

/* ---------- migrations ---------- */
const MIGRATIONS = [
  {
    id: '001_core',
    sql: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      pw_hash TEXT NOT NULL,
      units TEXT NOT NULL DEFAULT 'imperial',
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);

    -- a garage is the sharing boundary: family, or a shop
    CREATE TABLE IF NOT EXISTS garages (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memberships (
      garage_id INTEGER NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',      -- owner | member | viewer
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (garage_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY,
      garage_id INTEGER NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
      nickname TEXT,
      vin TEXT, plate TEXT, plate_state TEXT,
      year INTEGER, make TEXT, model TEXT, trim TEXT,
      engine TEXT, hp TEXT, drive TEXT, body TEXT, fuel TEXT, trans TEXT,
      doors TEXT, plant TEXT, gvwr TEXT,
      is_ev INTEGER NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT 'v_sedan',
      hue TEXT,
      source TEXT NOT NULL DEFAULT 'ymm',        -- vin | ymm
      duty TEXT NOT NULL DEFAULT 'normal',       -- normal | severe
      mileage INTEGER NOT NULL DEFAULT 0,
      purchase_date TEXT, purchase_price REAL, purchase_odometer INTEGER,
      seller TEXT, estimated_value REAL,
      spec_json TEXT,                            -- raw vPIC payload
      archived INTEGER NOT NULL DEFAULT 0,
      device_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_vehicles_garage ON vehicles(garage_id);

    CREATE TABLE IF NOT EXISTS odometer_readings (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      value INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',     -- manual | obd | receipt | photo | import
      at TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT,
      suspect INTEGER NOT NULL DEFAULT 0,        -- outlier / rollback flag
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_odo_vehicle ON odometer_readings(vehicle_id, at);

    CREATE TABLE IF NOT EXISTS service_records (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      what TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'maintenance',
      date TEXT NOT NULL,
      miles INTEGER,
      performer TEXT NOT NULL DEFAULT 'DIY',     -- DIY | Independent shop | Dealer
      shop_name TEXT,
      labor_hours REAL,
      parts_cost REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      parts_json TEXT,                           -- [{name, number, brand, qty, price}]
      notes TEXT,
      warranty_claim INTEGER NOT NULL DEFAULT 0,
      device_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_svc_vehicle ON service_records(vehicle_id, date);

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      system TEXT,
      interval_miles INTEGER,
      interval_months INTEGER,
      interval_hours INTEGER,
      severe_factor REAL NOT NULL DEFAULT 0.5,   -- severe duty multiplies interval by this
      last_done_miles INTEGER,
      last_done_date TEXT,
      est_cost REAL,
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'generic',    -- generic | oem | custom
      device_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_rem_vehicle ON reminders(vehicle_id);

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER,
      kind TEXT NOT NULL DEFAULT 'fuel',         -- fuel | charge
      quantity REAL NOT NULL,                    -- gallons or kWh
      price_per_unit REAL,
      total REAL,
      partial INTEGER NOT NULL DEFAULT 0,
      missed_fill INTEGER NOT NULL DEFAULT 0,
      station TEXT,
      charge_kind TEXT,                          -- ac | dc
      octane TEXT,
      note TEXT,
      device_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_fuel_vehicle ON fuel_logs(vehicle_id, odometer);

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',    -- insurance|registration|tax|parking|toll|wash|loan|other
      amount REAL NOT NULL,
      vendor TEXT,
      note TEXT,
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_exp_vehicle ON expenses(vehicle_id, date);

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      miles REAL NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'business',  -- business | medical | charity | personal
      from_place TEXT, to_place TEXT, note TEXT,
      rate REAL,                                 -- IRS cents-per-mile at time of trip
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_trip_vehicle ON trips(vehicle_id, date);

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,                        -- title|registration|insurance|loan|emissions|inspection|other
      title TEXT NOT NULL,
      issuer TEXT, number TEXT,
      issued_date TEXT, expires_date TEXT,
      amount REAL,
      note TEXT,
      file_path TEXT, file_name TEXT, file_mime TEXT, file_size INTEGER,
      device_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_doc_vehicle ON documents(vehicle_id, expires_date);

    CREATE TABLE IF NOT EXISTS warranties (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,                        -- bumper|powertrain|emissions|corrosion|hybrid_hv|extended
      label TEXT NOT NULL,
      months INTEGER, miles INTEGER,
      start_date TEXT, start_miles INTEGER NOT NULL DEFAULT 0,
      provider TEXT, contract_number TEXT, deductible REAL,
      note TEXT,
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_war_vehicle ON warranties(vehicle_id);

    CREATE TABLE IF NOT EXISTS tire_sets (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      brand TEXT, model TEXT, size TEXT,
      season TEXT NOT NULL DEFAULT 'all-season',
      dot_date TEXT,                             -- WWYY
      installed_date TEXT, installed_miles INTEGER,
      removed_date TEXT, removed_miles INTEGER,
      new_tread_32 REAL NOT NULL DEFAULT 10,
      rotation_pattern TEXT,
      tpms_ids TEXT,
      cost REAL,
      active INTEGER NOT NULL DEFAULT 1,
      device_id TEXT
    );

    CREATE TABLE IF NOT EXISTS tire_measurements (
      id INTEGER PRIMARY KEY,
      tire_set_id INTEGER NOT NULL REFERENCES tire_sets(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER,
      lf REAL, rf REAL, lr REAL, rr REAL,        -- tread depth, 32nds
      psi_lf REAL, psi_rf REAL, psi_lr REAL, psi_rr REAL,
      rotated INTEGER NOT NULL DEFAULT 0,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS battery_records (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      installed_date TEXT, group_size TEXT, cca INTEGER, brand TEXT,
      test_date TEXT, rest_voltage REAL, cranking_voltage REAL,
      measured_cca INTEGER, load_test TEXT,      -- pass | marginal | fail
      note TEXT,
      device_id TEXT
    );

    CREATE TABLE IF NOT EXISTS brake_measurements (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER,
      lf_pad REAL, rf_pad REAL, lr_pad REAL, rr_pad REAL,
      lf_rotor REAL, rf_rotor REAL, lr_rotor REAL, rr_rotor REAL,
      fluid_moisture REAL,
      note TEXT,
      device_id TEXT
    );

    CREATE TABLE IF NOT EXISTS diag_sessions (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      adapter TEXT,
      protocol TEXT,
      odometer INTEGER,
      monitors_json TEXT,
      notes TEXT,
      imported_from TEXT,
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_diag_vehicle ON diag_sessions(vehicle_id, started_at);

    CREATE TABLE IF NOT EXISTS dtcs (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES diag_sessions(id) ON DELETE SET NULL,
      code TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'stored',     -- stored | pending | permanent | history
      module TEXT NOT NULL DEFAULT 'powertrain',
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      cleared_at TEXT,
      clear_count INTEGER NOT NULL DEFAULT 0,
      freeze_frame_json TEXT,
      note TEXT,
      device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_dtc_vehicle ON dtcs(vehicle_id, code);

    CREATE TABLE IF NOT EXISTS datalogs (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES diag_sessions(id) ON DELETE CASCADE,
      pid TEXT NOT NULL,
      name TEXT,
      unit TEXT,
      samples_json TEXT NOT NULL                 -- [[tMs, value], ...]
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      parent_kind TEXT, parent_id INTEGER,
      kind TEXT NOT NULL DEFAULT 'photo',        -- photo | video | audio | doc
      file_path TEXT NOT NULL, file_name TEXT, file_mime TEXT, file_size INTEGER,
      caption TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recall_status (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      campaign TEXT NOT NULL,
      component TEXT, summary TEXT, consequence TEXT, remedy TEXT, reported_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      dismissed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(vehicle_id, campaign)
    );

    -- ===== reference data: wipeable, never mixed with user rows =====
    CREATE TABLE IF NOT EXISTS ref_cache (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ref_complaints (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      component TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      vehicle_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    `
  },
  {
    id: '002_stores',
    sql: `
    -- where the user searches from, so they do not re-enter a ZIP every visit
    ALTER TABLE users ADD COLUMN home_lat REAL;
    ALTER TABLE users ADD COLUMN home_lon REAL;
    ALTER TABLE users ADD COLUMN home_label TEXT;

    -- saved parts stores. Locations come from OpenStreetMap (ODbL); this table
    -- is the user's own shortlist, not a copy of the OSM database.
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand TEXT NOT NULL,
      name TEXT NOT NULL,
      osm_type TEXT, osm_id TEXT,
      lat REAL, lon REAL,
      address TEXT, phone TEXT, website TEXT, hours TEXT,
      note TEXT,
      commercial_account TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, osm_type, osm_id)
    );
    CREATE INDEX IF NOT EXISTS ix_stores_user ON stores(user_id);

    -- what you actually paid, so you know whether a quote is fair.
    -- This is the part of "parts pricing" that needs no vendor API at all.
    CREATE TABLE IF NOT EXISTS part_prices (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      part_name TEXT NOT NULL,
      part_number TEXT,
      brand TEXT,
      vendor TEXT,
      store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
      price REAL NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      core_charge REAL,
      warranty TEXT,
      purchased_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_pp_user ON part_prices(user_id, part_name);
    `
  },
  {
    id: '003_evidence_hours_config',
    sql: `
    -- Recall completion, modelled honestly.
    -- The year/make/model recall API tells you a campaign APPLIES to the
    -- vehicle line. It cannot tell you whether THIS VIN was remedied. So
    -- "applies" and "completed" are separate facts with separate evidence,
    -- and the UI must never let a self-marked tick look like a dealer record.
    ALTER TABLE recall_status ADD COLUMN completion_status TEXT NOT NULL DEFAULT 'unknown';
      -- unknown | owner_marked_complete | verified
    ALTER TABLE recall_status ADD COLUMN verified_at TEXT;
    ALTER TABLE recall_status ADD COLUMN verification_method TEXT;
      -- nhtsa_vin_lookup | dealer_paperwork | service_record | owner_recollection
    ALTER TABLE recall_status ADD COLUMN evidence_attachment_id INTEGER;
    ALTER TABLE recall_status ADD COLUMN evidence_note TEXT;

    -- Engine hours: the interval that actually matters on a diesel,
    -- anything that idles for a living, or equipment-style use.
    ALTER TABLE vehicles ADD COLUMN engine_hours REAL;
    ALTER TABLE vehicles ADD COLUMN hours_source TEXT;
    ALTER TABLE vehicles ADD COLUMN annual_miles INTEGER;

    CREATE TABLE IF NOT EXISTS hour_readings (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      hours REAL NOT NULL,
      odometer INTEGER,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL DEFAULT 'manual',
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_hours_vehicle ON hour_readings(vehicle_id, at);

    -- Configuration the VIN cannot tell us, confirmed by the owner.
    -- This is what makes a diagram match the vehicle in front of you
    -- instead of a generic one.
    CREATE TABLE IF NOT EXISTS vehicle_config (
      vehicle_id INTEGER PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
      cylinders INTEGER,
      layout TEXT,                 -- I | V | Flat | Rotary | Electric
      aspiration TEXT,             -- na | turbo | supercharged | twin-turbo
      injection TEXT,              -- port | direct | both | diesel-cr | carb
      rear_brakes TEXT,            -- disc | drum
      front_brakes TEXT,           -- disc | drum
      abs INTEGER,
      drive TEXT,                  -- FWD | RWD | AWD | 4WD
      trans_type TEXT,             -- auto | manual | cvt | dct | ev-single
      cooling TEXT,                -- crossflow | downflow
      fan TEXT,                    -- electric | clutch
      fuel_delivery TEXT,          -- returnless | return | diesel
      battery_location TEXT,       -- engine bay | trunk | under seat
      notes TEXT,
      confirmed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Tool ownership, so a job list can say what you already have.
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL,
      owned INTEGER NOT NULL DEFAULT 1,
      brand TEXT,
      model TEXT,
      note TEXT,
      acquired_at TEXT,
      UNIQUE(user_id, tool_id)
    );

    ALTER TABLE users ADD COLUMN preferred_brands TEXT NOT NULL DEFAULT 'icon,milwaukee';

    -- baseline for the engine-hour leg of an interval
    ALTER TABLE reminders ADD COLUMN last_done_hours REAL;
    `
  },
  {
    id: '004_nhtsa_bulk',
    sql: `
    -- NHTSA publishes investigations and manufacturer communications as bulk
    -- flat files only — there is no per-vehicle API for either, verified against
    -- their own documentation. These tables hold the parsed files. They are pure
    -- reference data: wipe and re-ingest freely, no user row is affected.
    CREATE TABLE IF NOT EXISTS ref_investigations (
      id INTEGER PRIMARY KEY,
      action_number TEXT, make TEXT, model TEXT, year TEXT,
      component TEXT, mfr TEXT, opened TEXT, closed TEXT,
      campaign TEXT, subject TEXT, summary TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_inv_lookup ON ref_investigations(make, year, model);

    CREATE TABLE IF NOT EXISTS ref_communications (
      id INTEGER PRIMARY KEY,
      block TEXT, nhtsa_id TEXT, doc_id TEXT, comm_date TEXT, comm_type TEXT,
      make TEXT, model TEXT, year TEXT, components TEXT, mfr_system TEXT, summary TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_mc_lookup ON ref_communications(make, year, model);
    CREATE INDEX IF NOT EXISTS ix_mc_block ON ref_communications(block);

    -- which EPA variant the owner confirmed, when the VIN is not enough
    ALTER TABLE vehicles ADD COLUMN epa_id TEXT;

    CREATE TABLE IF NOT EXISTS ref_ingest (
      source TEXT PRIMARY KEY,
      url TEXT, file TEXT, rows INTEGER, bytes INTEGER,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    `
  },
  {
    id: '005_procedures',
    sql: `
    -- Illustrated, step-by-step procedures the OWNER authors.
    --
    -- Deliberately not a copy of anyone's licensed repair database. The
    -- illustrations are the user's own photographs of their own vehicle,
    -- which for a specific truck beats generic artwork anyway: it shows
    -- the bolt they actually have to reach, with the corrosion and the
    -- aftermarket bracket in the way.
    --
    -- Specs transcribed from a source the user legitimately holds
    -- (Mitchell1 DIY, ALLDATAdiy, a factory manual, a library terminal)
    -- are stored WITH that source, so provenance travels with the number
    -- instead of decaying into folklore.
    CREATE TABLE IF NOT EXISTS procedures (
      id INTEGER PRIMARY KEY,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      system TEXT,
      category TEXT NOT NULL DEFAULT 'repair',
      difficulty INTEGER,
      est_minutes INTEGER,
      est_cost REAL,
      summary TEXT,
      safety_flags TEXT,
      source TEXT,
      source_ref TEXT,
      tool_ids TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_proc_vehicle ON procedures(vehicle_id);
    CREATE INDEX IF NOT EXISTS ix_proc_user ON procedures(user_id);

    CREATE TABLE IF NOT EXISTS procedure_media (
      id INTEGER PRIMARY KEY,
      procedure_id INTEGER NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'photo',
      file_path TEXT, file_name TEXT, file_mime TEXT, file_size INTEGER,
      svg TEXT,
      caption TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_pmedia_proc ON procedure_media(procedure_id, sort);

    CREATE TABLE IF NOT EXISTS procedure_steps (
      id INTEGER PRIMARY KEY,
      procedure_id INTEGER NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      media_id INTEGER REFERENCES procedure_media(id) ON DELETE SET NULL,
      torque_value TEXT,
      torque_pattern_id INTEGER,
      warning TEXT,
      tool_ids TEXT,
      part_note TEXT,
      is_check INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_pstep_proc ON procedure_steps(procedure_id, seq);

    -- Coordinates are NORMALISED 0..1 against the image, so a hotspot
    -- survives resizing, re-cropping and any display size.
    CREATE TABLE IF NOT EXISTS procedure_hotspots (
      id INTEGER PRIMARY KEY,
      media_id INTEGER NOT NULL REFERENCES procedure_media(id) ON DELETE CASCADE,
      step_id INTEGER REFERENCES procedure_steps(id) ON DELETE CASCADE,
      number INTEGER,
      label TEXT,
      note TEXT,
      component_key TEXT,
      x REAL NOT NULL, y REAL NOT NULL,
      w REAL, h REAL,
      shape TEXT NOT NULL DEFAULT 'pin'
    );
    CREATE INDEX IF NOT EXISTS ix_phot_media ON procedure_hotspots(media_id);

    CREATE TABLE IF NOT EXISTS procedure_runs (
      id INTEGER PRIMARY KEY,
      procedure_id INTEGER NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      odometer INTEGER,
      done_steps TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      service_record_id INTEGER REFERENCES service_records(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS ix_prun_proc ON procedure_runs(procedure_id);

    -- Tightening patterns. A sequence is geometry, not authorship: a
    -- centre-out spiral on a ten-bolt head is the same fact whoever prints it.
    CREATE TABLE IF NOT EXISTS torque_patterns (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      layout TEXT NOT NULL,
      bolt_count INTEGER NOT NULL,
      rows INTEGER, cols INTEGER,
      spec TEXT,
      stages TEXT NOT NULL DEFAULT '[]',
      source TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_tp_user ON torque_patterns(user_id);
    `
  },
  {
    id: '006_task_detail',
    sql: `
    -- A scheduled job is more than a due date. These are the fields you
    -- actually need in your hand while doing it, and they belong on the
    -- task rather than in a note somewhere else.
    ALTER TABLE reminders ADD COLUMN fluid_spec TEXT;
    ALTER TABLE reminders ADD COLUMN capacity TEXT;
    ALTER TABLE reminders ADD COLUMN torque_specs TEXT;   -- json [{name,value}]
    ALTER TABLE reminders ADD COLUMN part_numbers TEXT;
    ALTER TABLE reminders ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
    ALTER TABLE reminders ADD COLUMN spec_source TEXT;
    ALTER TABLE reminders ADD COLUMN deferred_until TEXT;
    ALTER TABLE reminders ADD COLUMN not_applicable INTEGER NOT NULL DEFAULT 0;

    -- Per-step checklist, each with its own note, so "did I actually
    -- reset the oil life monitor" has an answer six months later.
    CREATE TABLE IF NOT EXISTS reminder_checklist (
      id INTEGER PRIMARY KEY,
      reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      detail TEXT,
      torque TEXT,
      part TEXT,
      note TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      done_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_rck_rem ON reminder_checklist(reminder_id, seq);
    `
  }
];

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')))`);
const applied = new Set(db.prepare('SELECT id FROM _migrations').all().map(r => r.id));
for (const m of MIGRATIONS) {
  if (applied.has(m.id)) continue;
  db.exec('BEGIN');
  try {
    db.exec(m.sql);
    db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(m.id);
    db.exec('COMMIT');
    console.log(`[db] migration applied: ${m.id}`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function now() { return new Date().toISOString(); }
