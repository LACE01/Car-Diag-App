/* ============================================================
   pdftext.js — pull the text out of a PDF, with no dependencies.

   Why this exists: the scan tools people actually own export a
   PDF. RepairSolutions2 (Innova, and therefore the Hyper Tough
   HT500), BlueDriver, Topdon and Autel all do. If Garage cannot
   read a PDF, "import your report" is a dead end for most of the
   dongles on a shelf at Walmart.

   Why it is hand-rolled: same reasoning as the ZIP reader in
   ingest.js. A PDF text-extraction library drags in tens of
   megabytes and a CVE feed, to do a job that is a few hundred
   lines when you only need text. Nothing here executes anything
   from the document — no JavaScript, no external references, no
   embedded file handling. It walks streams, inflates them, and
   reads string operators.

   What it does NOT do: OCR. A PDF that is a photograph of a
   screen has no text objects in it, and this returns nothing
   rather than guessing. The caller reports that honestly.
   ============================================================ */
import zlib from 'node:zlib';

/* ------------------------------------------------------------
   PDF strings appear as (literal) or <hex>. Literals use
   backslash escapes and may contain balanced parentheses, which
   is the detail a naive regex always gets wrong — a description
   like "Bank 1 (Sensor 1)" ends the string early and the rest of
   the page turns to noise.
   ------------------------------------------------------------ */
const OCTAL = /^[0-7]$/;

function readLiteral(buf, i) {
  // buf[i] === '('
  let depth = 1, out = '';
  i++;
  while (i < buf.length && depth > 0) {
    const ch = buf[i];
    if (ch === '\\') {
      const n = buf[i + 1];
      i += 2;
      switch (n) {
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case '(': out += '('; break;
        case ')': out += ')'; break;
        case '\\': out += '\\'; break;
        case '\n': break;                       // line continuation
        case '\r': if (buf[i] === '\n') i++; break;
        default:
          if (OCTAL.test(n)) {                  // \ddd character code
            let oct = n;
            while (oct.length < 3 && OCTAL.test(buf[i])) oct += buf[i++];
            out += String.fromCharCode(parseInt(oct, 8));
          } else {
            out += n;
          }
      }
      continue;
    }
    if (ch === '(') { depth++; out += ch; i++; continue; }
    if (ch === ')') { depth--; if (depth > 0) out += ch; i++; continue; }
    out += ch; i++;
  }
  return [out, i];
}

function readHex(buf, i) {
  // buf[i] === '<'
  let j = buf.indexOf('>', i);
  if (j === -1) j = buf.length;
  const hex = buf.slice(i + 1, j).replace(/[^0-9a-fA-F]/g, '');
  let out = '';

  /* Two-byte codes are usually UTF-16BE from a composite font. The
     giveaway is a leading byte of 0 on ASCII-range characters. */
  const looksWide = hex.length >= 4 && hex.length % 4 === 0 && /^00/.test(hex);
  const step = looksWide ? 4 : 2;
  for (let k = 0; k + step <= hex.length; k += step) {
    const code = parseInt(hex.slice(k, k + step), 16);
    if (code) out += String.fromCharCode(code);
  }
  return [out, j + 1];
}

/* ------------------------------------------------------------
   Walk a decoded content stream and collect the text-showing
   operators: Tj, TJ, ' and ". Positioning operators (Td, TD, T*,
   TL) become line breaks so a table does not collapse into one
   long run — which matters, because the code and its description
   are usually on the same visual line and we key on that.
   ------------------------------------------------------------ */
function textFromContent(s) {
  let out = '';
  let i = 0;
  const stack = [];

  while (i < s.length) {
    const ch = s[i];

    if (ch === '(') {
      const [str, ni] = readLiteral(s, i);
      stack.push(str); i = ni; continue;
    }
    if (ch === '<' && s[i + 1] !== '<') {
      const [str, ni] = readHex(s, i);
      stack.push(str); i = ni; continue;
    }
    if (ch === '%') {                            // comment to end of line
      const nl = s.indexOf('\n', i);
      i = nl === -1 ? s.length : nl + 1; continue;
    }

    /* Numbers inside a TJ array are kerning adjustments in thousandths
       of an em. Most are small letter-spacing tweaks, but a large
       negative value is how many generators encode a SPACE — they move
       the pen instead of emitting a space character.

       Ignoring them is why LaTeX-style output arrives as
       "P0301Cylinder1Misfire": no spaces, and worse, no word boundary
       after the code, so the DTC pattern stops matching entirely. */
    if (/[-.0-9]/.test(ch)) {
      let j = i;
      while (j < s.length && /[-.0-9]/.test(s[j])) j++;
      const num = parseFloat(s.slice(i, j));
      i = j;
      if (stack.length && num <= -100) stack.push(' ');
      continue;
    }

    /* operator token */
    if (/[A-Za-z'"*]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9'"*]/.test(s[j])) j++;
      const op = s.slice(i, j);
      i = j;

      if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
        if (op === "'" || op === '"') out += '\n';
        out += stack.join('');
        stack.length = 0;
      } else if (op === 'Td' || op === 'TD' || op === 'T' || op === 'TL' || op === 'ET' || op === 'BT') {
        /* A new text position almost always means a new line or a
           new column. A space keeps columns apart; the newline
           heuristic below turns big vertical moves into breaks. */
        out += op === 'ET' || op === 'BT' ? '\n' : ' ';
        stack.length = 0;
      } else if (op === 'Tm') {
        out += '\n';
        stack.length = 0;
      } else {
        stack.length = 0;
      }
      continue;
    }
    i++;
  }
  return out;
}

/* ------------------------------------------------------------
   Find every stream, inflate the ones we can, keep the ones that
   look like content.

   We do not resolve the page tree. A diagnostic report is a
   handful of pages and we want all of their text anyway, so
   walking every stream in file order is both simpler and more
   robust against the slightly-malformed PDFs that consumer apps
   produce.
   ------------------------------------------------------------ */
/* ASCII85. Generators chain this in front of Flate — reportlab and
   several scan-tool exporters do — so a Flate-only reader sees
   printable noise, fails to inflate, and reports "no codes found"
   on a report that plainly has codes in it. */
function ascii85(buf) {
  let s = buf.toString('latin1');
  const start = s.indexOf('<~');
  if (start !== -1) s = s.slice(start + 2);
  const end = s.indexOf('~>');
  if (end !== -1) s = s.slice(0, end);
  s = s.replace(/\s/g, '');

  const out = [];
  let tuple = [], i = 0;
  while (i < s.length) {
    const c = s[i++];
    if (c === 'z' && tuple.length === 0) { out.push(0, 0, 0, 0); continue; }
    const v = c.charCodeAt(0) - 33;
    if (v < 0 || v > 84) continue;
    tuple.push(v);
    if (tuple.length === 5) {
      let n = 0;
      for (const t of tuple) n = n * 85 + t;
      out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      tuple = [];
    }
  }
  if (tuple.length > 1) {                       // partial group
    const k = tuple.length;
    for (let j = k; j < 5; j++) tuple.push(84);
    let n = 0;
    for (const t of tuple) n = n * 85 + t;
    const bytes = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...bytes.slice(0, k - 1));
  }
  return Buffer.from(out);
}

function asciiHex(buf) {
  const hex = buf.toString('latin1').split('>')[0].replace(/[^0-9a-fA-F]/g, '');
  return Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex');
}

/* LZW as PDF uses it (variable code width, early change). Still turns
   up in PDFs written by older tooling. */
function lzw(buf) {
  const out = [];
  let dict = [], next = 258, width = 9, prev = null;
  const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict[i] = [i]; next = 258; width = 9; prev = null; };
  reset();

  let bitBuf = 0, bitCnt = 0;
  for (const byte of buf) {
    bitBuf = (bitBuf << 8) | byte; bitCnt += 8;
    while (bitCnt >= width) {
      const code = (bitBuf >> (bitCnt - width)) & ((1 << width) - 1);
      bitCnt -= width;
      if (code === 256) { reset(); continue; }
      if (code === 257) { bitCnt = 0; break; }
      let entry;
      if (dict[code]) entry = dict[code];
      else if (prev) entry = prev.concat(prev[0]);
      else continue;
      out.push(...entry);
      if (prev) dict[next++] = prev.concat(entry[0]);
      prev = entry;
      if (next + 1 >= (1 << width) && width < 12) width++;
    }
  }
  return Buffer.from(out);
}

const DECODERS = {
  FlateDecode: b => {
    try { return zlib.inflateSync(b); } catch { }
    return zlib.inflateRawSync(b);
  },
  ASCII85Decode: ascii85,
  ASCIIHexDecode: asciiHex,
  LZWDecode: lzw
};

/* Apply the /Filter chain in the order the document declares it. */
function inflate(raw, dict) {
  const fm = dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
  const names = fm
    ? (fm[1].match(/\/([A-Za-z0-9]+)/g) || []).map(s => s.slice(1))
    : [];

  let data = raw;
  if (!names.length) {
    /* no declared filter: it may still be raw deflate from a
       generator that omitted it, so try, then fall back to plain */
    for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
      try { const o = fn(data); if (o && o.length) return o; } catch { }
    }
    return data;
  }

  for (const n of names) {
    const fn = DECODERS[n];
    if (!fn) return null;                       // DCTDecode etc — an image, not text
    try {
      data = fn(data);
      if (!data || !data.length) return null;
    } catch { return null; }
  }
  return data;
}

export function pdfToText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 5 || buf.slice(0, 5).toString('latin1') !== '%PDF-') {
    return { text: '', pages: 0, encrypted: false, error: 'Not a PDF file.' };
  }

  /* An encrypted PDF will inflate to noise. Say so rather than
     returning gibberish and claiming no codes were found. */
  const head = buf.toString('latin1', 0, Math.min(buf.length, 4096));
  const encrypted = /\/Encrypt\b/.test(buf.toString('latin1', Math.max(0, buf.length - 4096)))
    || /\/Encrypt\b/.test(head);

  const hay = buf.toString('latin1');
  let out = '';
  let streams = 0, decoded = 0;
  let pos = 0;

  while (true) {
    const sIdx = hay.indexOf('stream', pos);
    if (sIdx === -1) break;
    streams++;

    /* dictionary immediately before this stream keyword */
    const dictStart = hay.lastIndexOf('<<', sIdx);
    const dict = dictStart === -1 ? '' : hay.slice(dictStart, sIdx);

    /* data begins after CRLF / LF following "stream" */
    let d = sIdx + 6;
    if (hay[d] === '\r') d++;
    if (hay[d] === '\n') d++;

    const eIdx = hay.indexOf('endstream', d);
    if (eIdx === -1) break;
    pos = eIdx + 9;

    /* skip things that are definitely not page content */
    if (/\/Subtype\s*\/(Image|Type1C|CIDFontType0C|OpenType)|\/Type\s*\/(XObject|Font|Metadata)/.test(dict)
        && !/\/Subtype\s*\/Form/.test(dict)) continue;

    let raw = buf.subarray(d, eIdx);
    /* trim a trailing EOL that belongs to the keyword, not the data */
    while (raw.length && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) {
      raw = raw.subarray(0, raw.length - 1);
    }
    if (!raw.length) continue;

    const inf = inflate(raw, dict);
    if (!inf) continue;
    decoded++;

    const s = inf.toString('latin1');
    /* only content streams carry text operators */
    if (!/\bT[jJdmf*]|\bBT\b/.test(s)) continue;
    out += textFromContent(s) + '\n';
  }

  /* tidy: collapse runs of blanks, keep line structure */
  const text = out
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter(l => l.length)
    .join('\n');

  return {
    text,
    pages: (hay.match(/\/Type\s*\/Page\b/g) || []).length,
    streams,
    decoded,
    encrypted,
    /* A PDF with streams we could read but no text objects is a
       scan or a screenshot. That is a different problem from a
       corrupt file and deserves a different message. */
    imageOnly: decoded > 0 && text.length < 20
  };
}
