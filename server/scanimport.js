/* ============================================================
   scanimport.js — read a scan report from any tool.

   THE PROBLEM THIS SOLVES
   Most Bluetooth dongles sold to consumers are locked to one
   app. The Hyper Tough HT500 is an Innova device and only talks
   to RepairSolutions2. FIXD and BlueDriver are the same story.
   No web page can connect to them on any platform, and on an
   iPhone no web page can use Bluetooth at all — Safari has never
   exposed Web Bluetooth, and every iOS browser is Safari
   underneath.

   So the universal path is not the dongle. It is the report the
   dongle's own app produces. Every one of those apps can export
   or share: a PDF, a CSV, an email, a block of text. This module
   reads all of them.

   THE RULE
   A description is only ever repeated back if the report
   contained one. Where it did not, the code is decoded against
   the SAE J2012 generic table and labelled as a generic
   definition — because P1xxx and many C/B/U codes are
   manufacturer-specific, and a generic gloss on a manufacturer
   code is a wrong answer delivered confidently.
   ============================================================ */
import { pdfToText } from './pdftext.js';

/* ------------------------------------------------------------
   DTC pattern.

   Deliberately not `\b[PCBU][0-3][0-9A-F]{3}\b`. That looks
   right and fails on real reports two ways:

   - PDFs that position words by kerning produce
     "P0301Cylinder1Misfire". A trailing \b never matches, so
     every code in the file is missed.
   - A VIN like 1FTEWC1ABC345 contains something shaped like a
     code. A leading \b happily matches mid-VIN.

   So: the character before must not be alphanumeric (kills the
   VIN case), and the character after must not be a digit or a
   lowercase letter (kills "P04201" while still allowing
   "P0301Cylinder", where an uppercase letter starts a new word).
   ------------------------------------------------------------ */
const DTC_RE = /([PCBU])([0-3])([0-9A-F]{3})/gi;

function isRealMatch(text, m) {
  const before = m.index > 0 ? text[m.index - 1] : ' ';
  const after = text[m.index + m[0].length] || ' ';
  if (/[0-9A-Za-z]/.test(before)) return false;
  if (/[0-9a-z]/.test(after)) return false;
  return true;
}

const STATUS_WORDS = [
  [/\bpermanent\b/i, 'permanent'],
  [/\bpending\b/i, 'pending'],
  [/\bhistor(y|ic)\b/i, 'history'],
  [/\b(stored|confirmed|current|active|present)\b/i, 'stored']
];

/* Words that are part of the report's own furniture rather than a
   description of the fault. */
const NOISE = /^(code|codes|dtc|dtcs|trouble|diagnostic|stored|pending|permanent|history|confirmed|status|description|fault|generic|manufacturer|powertrain|chassis|body|network|:|-|–|—|\||,|\.|\d+)$/i;

function cleanDescription(raw) {
  if (!raw) return null;
  let d = String(raw)
    .replace(/^[\s:,\-–—|>*]+/, '')
    /* Trailing punctuation only. Apostrophes and quotes are left
       alone: OBD descriptions genuinely contain them — "Lost
       Communication With ECM/PCM 'A'" is the SAE wording, and
       stripping the closer turns it into "ECM/PCM 'A". */
    .replace(/[\s:,\-–—|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  /* Tools often append the status to the description line. Keeping it
     duplicates information we already store in its own field, and
     reads as though it were part of the fault name. */
  d = d.replace(/[\s:,\-–—|(\[]*\b(pending|permanent|history|historic|stored|confirmed|current|active)\b[\s.!)\]]*$/i, '').trim();

  /* strip a leading repeat of status or column furniture */
  const words = d.split(' ');
  while (words.length && NOISE.test(words[0])) words.shift();
  d = words.join(' ').trim();

  if (d.length < 4) return null;
  if (/^[\d\s.,%-]+$/.test(d)) return null;       // a value column, not a description
  if (d.length > 220) d = d.slice(0, 220).trim();
  return d;
}

/* ------------------------------------------------------------
   Structured formats first — they carry the description in a
   known place and are worth reading properly.
   ------------------------------------------------------------ */
function splitDelimited(line, delim) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
      continue;
    }
    if (c === delim && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function fromDelimited(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;

  const delim = (lines[0].match(/\t/g) || []).length >= 1 ? '\t'
    : (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';'
    : ',';
  const header = splitDelimited(lines[0], delim).map(h => h.toLowerCase());

  const codeCol = header.findIndex(h => /^(code|dtc|trouble ?code|fault ?code)s?$/.test(h) || /\bcode\b/.test(h));
  if (codeCol === -1) return null;
  const descCol = header.findIndex(h => /desc|definition|meaning|fault|name|detail/.test(h));
  const statusCol = header.findIndex(h => /status|type|state/.test(h));

  const out = [];
  for (const line of lines.slice(1)) {
    const cells = splitDelimited(line, delim);
    const rawCode = (cells[codeCol] || '').toUpperCase().replace(/[^PCBU0-9A-F]/gi, '');
    if (!/^[PCBU][0-3][0-9A-F]{3}$/.test(rawCode)) continue;
    const statusCell = statusCol >= 0 ? cells[statusCol] : '';
    let status = 'stored';
    for (const [re, s] of STATUS_WORDS) if (re.test(statusCell)) { status = s; break; }
    out.push({
      code: rawCode,
      description: cleanDescription(descCol >= 0 ? cells[descCol] : null),
      status
    });
  }
  return out.length ? out : null;
}

function fromJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }

  const found = [];
  const CODE_KEYS = /^(code|dtc|troublecode|faultcode)$/i;
  const DESC_KEYS = /^(description|desc|definition|meaning|name|detail|title)$/i;
  const STAT_KEYS = /^(status|type|state|kind)$/i;

  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }

    let code = null, desc = null, stat = null;
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && CODE_KEYS.test(k) && /^[PCBU][0-3][0-9A-F]{3}$/i.test(v.trim())) code = v.trim().toUpperCase();
      else if (typeof v === 'string' && DESC_KEYS.test(k)) desc = v;
      else if (typeof v === 'string' && STAT_KEYS.test(k)) stat = v;
    }
    if (code) {
      let status = 'stored';
      for (const [re, s] of STATUS_WORDS) if (re.test(stat || '')) { status = s; break; }
      found.push({ code, description: cleanDescription(desc), status });
    }
    Object.values(node).forEach(walk);
  };
  walk(data);
  return found.length ? found : null;
}

/* ------------------------------------------------------------
   Free text — the format everything degrades to. Also what a PDF
   becomes, and what a forwarded email is.
   ------------------------------------------------------------ */
function fromText(text) {
  const out = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    DTC_RE.lastIndex = 0;
    let m;
    const inLine = [];
    while ((m = DTC_RE.exec(line))) {
      if (!isRealMatch(line, m)) continue;
      inLine.push({ code: m[0].toUpperCase(), at: m.index, len: m[0].length });
    }
    if (!inLine.length) continue;

    let status = 'stored';
    for (const [re, s] of STATUS_WORDS) if (re.test(line)) { status = s; break; }

    for (let i = 0; i < inLine.length; i++) {
      const c = inLine[i];
      /* description = text between this code and the next one on the
         line. With several codes on one line (a summary row) there is
         usually no description at all, and we must not borrow the
         neighbour's. */
      const from = c.at + c.len;
      const to = i + 1 < inLine.length ? inLine[i + 1].at : line.length;
      out.push({ code: c.code, description: cleanDescription(line.slice(from, to)), status });
    }
  }

  /* Some tools print the code on one line and the description on the
     next. Fill only where the following line has no code of its own
     and reads like prose. */
  const withCodes = new Set();
  lines.forEach((l, i) => {
    DTC_RE.lastIndex = 0;
    let m;
    while ((m = DTC_RE.exec(l))) if (isRealMatch(l, m)) withCodes.add(i);
  });
  for (const entry of out) {
    if (entry.description) continue;
    const idx = lines.findIndex(l => l.includes(entry.code));
    const next = lines[idx + 1];
    if (idx === -1 || !next || withCodes.has(idx + 1)) continue;
    const d = cleanDescription(next);
    if (d && /[a-z]{3}/.test(d)) entry.description = d;
  }
  return out;
}

/* ------------------------------------------------------------
   Context worth capturing: odometer, VIN, monitors.
   Each is only reported when the document actually stated it.
   ------------------------------------------------------------ */
function readContext(text) {
  const ctx = { odometer: null, vin: null, monitors: null, scannedAt: null };

  const odo = text.match(/\b(?:odometer|mileage|miles|odo)\b[\s:=]*([0-9][0-9,\s]{2,9})\s*(?:mi|miles|km)?/i);
  if (odo) {
    const n = parseInt(odo[1].replace(/[,\s]/g, ''), 10);
    if (n > 0 && n < 2000000) ctx.odometer = n;
  }

  /* ISO 3779 VIN: 17 chars, no I O Q */
  const vin = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  if (vin && /\d/.test(vin[1]) && /[A-Z]/.test(vin[1])) ctx.vin = vin[1].toUpperCase();

  const when = text.match(/\b(?:scan(?:ned)?|report|test)\s*(?:date|on|at)?[\s:]*(\d{1,4}[-/]\d{1,2}[-/]\d{1,4})/i);
  if (when) {
    const d = new Date(when[1]);
    if (!isNaN(d)) ctx.scannedAt = d.toISOString().slice(0, 10);
  }

  const mon = [];
  const MONITORS = ['misfire', 'fuel system', 'components', 'catalyst', 'heated catalyst',
    'evap', 'secondary air', 'a/c refrigerant', 'oxygen sensor', 'o2 sensor heater',
    'egr', 'nmhc', 'nox'];
  for (const name of MONITORS) {
    const re = new RegExp(name.replace(/[/]/g, '.') + '[^\\n:]{0,12}[:\\s]+(not ready|incomplete|ready|complete|n/a|not supported)', 'i');
    const m = text.match(re);
    if (m) mon.push({ name, state: /not ready|incomplete/i.test(m[1]) ? 'incomplete' : /n\/a|not supported/i.test(m[1]) ? 'unsupported' : 'ready' });
  }
  if (mon.length) ctx.monitors = mon;

  return ctx;
}

/* ------------------------------------------------------------
   Which tool wrote this? Only used for labelling the session, so
   an unrecognised tool is fine — it says so.
   ------------------------------------------------------------ */
const TOOLS = [
  [/repairsolutions|innova|hyper ?tough|ht\s?5\d\d/i, 'RepairSolutions2 (Innova / Hyper Tough)'],
  [/bluedriver|lemur/i, 'BlueDriver'],
  [/\bfixd\b/i, 'FIXD'],
  [/topdon/i, 'Topdon'],
  [/autel|maxi(check|sys|com)/i, 'Autel'],
  [/launch\s|creader|x431/i, 'Launch'],
  [/torque\s?(pro|lite)/i, 'Torque'],
  [/car\s?scanner/i, 'Car Scanner ELM OBD2'],
  [/obd\s?fusion/i, 'OBD Fusion'],
  [/obdlink|scantool\.net/i, 'OBDLink'],
  [/veepeak/i, 'Veepeak'],
  [/carly/i, 'Carly'],
  [/foxwell/i, 'Foxwell'],
  [/ancel/i, 'ANCEL'],
  [/thinkdiag|thinkcar/i, 'ThinkDiag'],
  [/vgate|icar/i, 'Vgate'],
  [/\bobd2?\b|elm327/i, 'Generic OBD-II tool']
];

function detectTool(text) {
  for (const [re, name] of TOOLS) if (re.test(text)) return name;
  return null;
}

/* ============================================================
   ENTRY POINT
   buffer | string  ->  { codes, context, tool, format, notes }
   ============================================================ */
export function parseScanReport(input, filename = '') {
  const isBuf = Buffer.isBuffer(input);
  const head = isBuf ? input.subarray(0, 5).toString('latin1') : String(input).slice(0, 5);

  let text = '';
  let format = 'text';
  let warning = null;

  if (head === '%PDF-') {
    const pdf = pdfToText(isBuf ? input : Buffer.from(input, 'latin1'));
    format = 'pdf';
    text = pdf.text;
    if (pdf.encrypted && !text) {
      return { error: 'That PDF is password-protected, so its text cannot be read. Open it in your PDF viewer, remove the password or export an unprotected copy, and try again — or paste the codes in by hand.' };
    }
    if (pdf.imageOnly || (!text && pdf.decoded)) {
      return { error: 'That PDF has no text in it — it is a scan or a screenshot saved as a PDF. Garage does not guess at codes from an image. Type the codes in directly instead; it takes about ten seconds.' };
    }
    if (!text) {
      return { error: 'Could not read any text out of that PDF. If your app also offers CSV or "share as text", those import more reliably. Otherwise type the codes in directly.' };
    }
  } else {
    text = isBuf ? input.toString('utf8') : String(input);
    if (/^\s*[[{]/.test(text)) format = 'json';
    else if (/<\/?(html|table|tr|td|div)\b/i.test(text)) {
      format = 'html';
      /* strip tags but keep row/cell boundaries as separators, so a
         table does not collapse into one line */
      text = text
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(tr|div|p|h[1-6]|li)>/gi, '\n')
        .replace(/<\/t[dh]>/gi, '  ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
    else if (/[,;\t]/.test(text.split('\n')[0] || '')) format = 'delimited';
  }

  if (!text.trim()) {
    return { error: 'That file appears to be empty.' };
  }

  /* Try the structured readers, then fall back to free text. Merge
     rather than choose: a CSV can still have a header block above it,
     and a PDF often has a table AND a summary line. */
  let codes = (format === 'json' && fromJson(text))
    || (format === 'delimited' && fromDelimited(text))
    || null;

  const textCodes = fromText(text);

  if (!codes) codes = textCodes;
  else {
    const have = new Set(codes.map(c => c.code));
    for (const c of textCodes) if (!have.has(c.code)) { codes.push(c); have.add(c.code); }
  }

  /* de-duplicate, preferring the entry that carries a description */
  const byCode = new Map();
  for (const c of codes) {
    const prev = byCode.get(c.code);
    if (!prev) { byCode.set(c.code, c); continue; }
    if (!prev.description && c.description) prev.description = c.description;
    if (prev.status === 'stored' && c.status !== 'stored') prev.status = c.status;
  }
  const list = [...byCode.values()];

  if (!list.length) {
    return {
      error: 'No trouble codes found in that file. Codes look like P0420, C0035, B1318 or U0100. ' +
        'If your report definitely has some, paste its text in directly — some apps export a layout Garage cannot read yet.',
      format, tool: detectTool(text), textLength: text.length
    };
  }

  return {
    codes: list,
    context: readContext(text),
    tool: detectTool(text) || (filename ? 'Report: ' + filename : null),
    format,
    warning
  };
}
