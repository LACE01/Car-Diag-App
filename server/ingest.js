/* ============================================================
   ingest.js — NHTSA bulk datasets

   Verified against NHTSA's own documentation, not guessed:

     Recalls        API  ✓  api.nhtsa.gov/recalls/recallsByVehicle
     Complaints     API  ✓  api.nhtsa.gov/complaints/complaintsByVehicle
     Ratings        API  ✓  api.nhtsa.gov/SafetyRatings/... (two-step)
     Investigations API  ✗  DOWNLOAD ONLY — static.nhtsa.gov/odi/ffdd/inv/FLAT_INV.zip
     Mfr comms      API  ✗  DOWNLOAD ONLY — static.nhtsa.gov/odi/ffdd/tsbs/TSBS_RECEIVED_*.zip

   There is no per-vehicle JSON endpoint for the last two. Every path
   that looked like one returns API Gateway's "Missing Authentication
   Token", and products/vehicle/makes?issueType=i returns zero rows.
   So we do what the data actually supports: pull the flat files once,
   parse them into reference tables, and query locally after that.

   This is also the better architecture. It works in a garage with no
   signal, it costs NHTSA one request instead of thousands, and the
   reference tables can be wiped and re-ingested without touching a
   single user record.

   File layouts are from the published dictionaries:
     INV.txt   tab-delimited, 11 fields, dates YYYYMMDD
     TSBS.txt  tab-delimited, 14 fields (schema revised May 2024)
   ============================================================ */
import zlib from 'node:zlib';
import { db } from './db.js';

const UA = 'Garage/1.0 (self-hosted vehicle maintenance app; https://github.com/LACE01/Car-Diag-App)';
const BASE_INV = 'https://static.nhtsa.gov/odi/ffdd/inv/';
const BASE_TSB = 'https://static.nhtsa.gov/odi/ffdd/tsbs/';

/* ------------------------------------------------------------
   Minimal ZIP reader.

   These archives are plain deflate with no encryption, so a full
   zip library is unnecessary weight and a system `unzip` would be
   one more thing to install in the image. Parse the central
   directory, seek to the local header, inflateRaw.
   ------------------------------------------------------------ */
function unzipFirstEntry(buf) {
  // End of Central Directory: signature 0x06054b50, scan backwards
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (no end-of-central-directory record)');

  const entries = buf.readUInt16LE(eocd + 10);
  let cd = buf.readUInt32LE(eocd + 16);
  const files = [];

  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(cd) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cd + 10);
    const compSize = buf.readUInt32LE(cd + 20);
    const uncompSize = buf.readUInt32LE(cd + 24);
    const nameLen = buf.readUInt16LE(cd + 28);
    const extraLen = buf.readUInt16LE(cd + 30);
    const commentLen = buf.readUInt16LE(cd + 32);
    const localOff = buf.readUInt32LE(cd + 42);
    const name = buf.toString('utf8', cd + 46, cd + 46 + nameLen);
    files.push({ name, method, compSize, uncompSize, localOff });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  if (!files.length) throw new Error('ZIP contains no entries');

  // biggest entry is the data file; the others are readmes
  const f = files.sort((a, b) => b.uncompSize - a.uncompSize)[0];

  if (buf.readUInt32LE(f.localOff) !== 0x04034b50) throw new Error('Bad local file header');
  const lNameLen = buf.readUInt16LE(f.localOff + 26);
  const lExtraLen = buf.readUInt16LE(f.localOff + 28);
  const start = f.localOff + 30 + lNameLen + lExtraLen;
  const data = buf.subarray(start, start + f.compSize);

  if (f.method === 0) return { name: f.name, buf: data };
  if (f.method === 8) return { name: f.name, buf: zlib.inflateRawSync(data, { maxOutputLength: 1024 * 1024 * 1024 }) };
  throw new Error(`Unsupported ZIP compression method ${f.method}`);
}

async function download(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(240000) });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Tab-delimited, one record per line, no quoting in these files. */
function* rows(text) {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    start = end + 1;
    if (!line.trim()) continue;
    yield line.split('\t');
  }
}

const norm = s => String(s || '').trim().toUpperCase();

/* ============================================================
   Investigations — FLAT_INV.zip, ~4 MB, all of them since 1972
   ============================================================ */
export async function ingestInvestigations() {
  const url = BASE_INV + 'FLAT_INV.zip';
  const zip = await download(url);
  const { buf, name } = unzipFirstEntry(zip);
  const text = buf.toString('latin1');

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM ref_investigations').run();
    const ins = db.prepare(`INSERT INTO ref_investigations
      (action_number, make, model, year, component, mfr, opened, closed, campaign, subject, summary)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    let n = 0;
    for (const f of rows(text)) {
      if (f.length < 10) continue;
      ins.run(f[0], norm(f[1]), norm(f[2]), f[3], f[4], f[5], f[6], f[7], f[8], f[9], (f[10] || '').slice(0, 2000));
      n++;
    }
    db.prepare(`INSERT INTO ref_ingest (source, url, file, rows, bytes, at)
                VALUES ('investigations',?,?,?,?,datetime('now'))
                ON CONFLICT(source) DO UPDATE SET url=excluded.url, file=excluded.file,
                  rows=excluded.rows, bytes=excluded.bytes, at=excluded.at`)
      .run(url, name, n, zip.length);
    db.exec('COMMIT');
    return { source: 'investigations', rows: n, bytes: zip.length, file: name };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ============================================================
   Manufacturer communications — TSBS_RECEIVED_{range}.zip

   Split into five-year blocks by date received, so we only pull the
   blocks that can possibly cover the user's vehicles. Each block is
   4–31 MB.
   ============================================================ */
export const TSB_BLOCKS = [
  '1995-1999', '2000-2004', '2005-2009', '2010-2014', '2015-2019', '2020-2024', '2025-2026'
];

/** A bulletin is normally published after the model year, so bias forward. */
export function blocksForYears(years) {
  const want = new Set();
  for (const y of years) {
    for (const b of TSB_BLOCKS) {
      const [lo, hi] = b.split('-').map(Number);
      if (hi >= y && lo <= y + 12) want.add(b);
    }
  }
  return [...want];
}

export async function ingestCommunications(blocks) {
  const list = (blocks?.length ? blocks : ['2015-2019', '2020-2024']).filter(b => TSB_BLOCKS.includes(b));
  const done = [];
  for (const block of list) {
    const url = `${BASE_TSB}TSBS_RECEIVED_${block}.zip`;
    const zip = await download(url);
    const { buf, name } = unzipFirstEntry(zip);
    const text = buf.toString('latin1');

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM ref_communications WHERE block = ?').run(block);
      const ins = db.prepare(`INSERT INTO ref_communications
        (block, nhtsa_id, doc_id, comm_date, comm_type, make, model, year, components, mfr_system, summary)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      let n = 0;
      for (const f of rows(text)) {
        // 14-field layout (May 2024 revision):
        // 1 NHTSA ID | 2 replacement | 3 date added | 4 TSB/Doc ID | 5 mfr comm date
        // 6 internal campaign | 7 comm type | 8 make | 9 model | 10 model year
        // 11 NHTSA components | 12 mfr system | 13 mfr subsystem | 14 summary
        if (f.length < 10) continue;
        ins.run(block, f[0], f[3], f[4], f[6], norm(f[7]), norm(f[8]), f[9],
          f[10] || null, f[11] || null, (f[13] || '').slice(0, 1500));
        n++;
      }
      db.prepare(`INSERT INTO ref_ingest (source, url, file, rows, bytes, at)
                  VALUES (?,?,?,?,?,datetime('now'))
                  ON CONFLICT(source) DO UPDATE SET url=excluded.url, file=excluded.file,
                    rows=excluded.rows, bytes=excluded.bytes, at=excluded.at`)
        .run('communications:' + block, url, name, n, zip.length);
      db.exec('COMMIT');
      done.push({ block, rows: n, bytes: zip.length });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return { source: 'communications', blocks: done };
}

/* ============================================================
   Local queries — this is what the app hits once ingest has run
   ============================================================ */
function modelMatch(model) {
  const m = norm(model);
  // "F-150" should also find "F-150 SUPER CREW" and "F150"
  return { exact: m, like: m + '%', loose: '%' + m.replace(/[-\s]/g, '') + '%' };
}

export function investigationsFor({ year, make, model }) {
  const status = ingestStatus('investigations');
  if (!status) return { available: false, needsIngest: true };
  const m = modelMatch(model);
  const rowsOut = db.prepare(`
    SELECT * FROM ref_investigations
    WHERE make = ? AND year = ? AND (model = ? OR model LIKE ?)
    ORDER BY opened DESC`).all(norm(make), String(year), m.exact, m.like);

  const map = r => ({
    number: r.action_number, component: r.component, summary: r.subject,
    detail: r.summary, openDate: fmtDate(r.opened), closeDate: fmtDate(r.closed),
    campaign: r.campaign || null, status: r.closed ? 'closed' : 'open'
  });
  const items = rowsOut.map(map);
  return {
    available: true,
    open: items.filter(i => i.status === 'open'),
    closed: items.filter(i => i.status === 'closed'),
    total: items.length,
    ingestedAt: status.at,
    caveat: 'A federal investigation is not a finding of a defect and is not a recall. It means NHTSA is examining a pattern on this vehicle line — often the earliest public signal that something systemic exists. Where an investigation led to a recall, the campaign number is shown.'
  };
}

export function communicationsFor({ year, make, model }) {
  const any = db.prepare("SELECT COUNT(*) c FROM ref_ingest WHERE source LIKE 'communications:%'").get().c;
  if (!any) return { available: false, needsIngest: true };
  const m = modelMatch(model);
  const rowsOut = db.prepare(`
    SELECT * FROM ref_communications
    WHERE make = ? AND year = ? AND (model = ? OR model LIKE ?)
    ORDER BY comm_date DESC`).all(norm(make), String(year), m.exact, m.like);

  // one physical row per component, so collapse to one per document
  const byDoc = new Map();
  for (const r of rowsOut) {
    const key = r.doc_id || r.nhtsa_id;
    if (!byDoc.has(key)) {
      byDoc.set(key, {
        number: r.doc_id, nhtsaId: r.nhtsa_id, date: fmtDate(r.comm_date),
        type: r.comm_type || null, subject: r.summary, components: new Set()
      });
    }
    for (const c of String(r.components || '').split(',')) {
      const t = c.trim().toUpperCase();
      if (t) byDoc.get(key).components.add(t);
    }
  }
  const items = [...byDoc.values()].map(d => ({ ...d, components: [...d.components] }));

  const counts = {};
  for (const d of items) for (const c of d.components) counts[c] = (counts[c] || 0) + 1;

  const typeCounts = {};
  for (const d of items) if (d.type) typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;

  return {
    available: true,
    items,
    total: items.length,
    byComponent: Object.entries(counts).map(([component, count]) => ({ component, count }))
      .sort((a, b) => b.count - a.count),
    byType: Object.entries(typeCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    warrantyExtensions: items.filter(d => /warranty/i.test(d.type || '')),
    caveat: 'Manufacturer communications filed with NHTSA — service bulletins, service campaigns, warranty extensions and emissions notices. Only the concise summary NHTSA publishes is shown; the full bulletin is the manufacturer\'s copyrighted document. A TSB is diagnostic context, NOT a recall, and NOT a promise that the repair is free — except where the type is a warranty extension, which is worth reading closely.'
  };
}

export function ingestStatus(source) {
  return db.prepare('SELECT * FROM ref_ingest WHERE source = ?').get(source) || null;
}
export function allIngestStatus() {
  return db.prepare('SELECT * FROM ref_ingest ORDER BY source').all();
}

function fmtDate(s) {
  const t = String(s || '').trim();
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : (t || null);
}
