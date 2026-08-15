/* ============================================================
   import-ui.js — getting codes in from any scanner.

   Placed on the Diagnose screen, where the disappointment
   happens. Telling someone "import a report from the Records
   screen" at the exact moment their dongle failed to connect is
   a dead end with extra steps.

   Three routes in, in order of how likely they are to work:
     1. Type the codes.       Always works. Ten seconds.
     2. Upload the export.    PDF, CSV, JSON, TXT, HTML.
     3. Paste the text.       From an email or a share sheet.
   ============================================================ */

/* Dongles that are locked to their own app. This list is here so
   the answer to "why won't it connect" is on the screen instead
   of being something the user has to work out over an evening. */
const LOCKED_DONGLES = [
  { name: 'Hyper Tough HT500 / HT300', app: 'RepairSolutions2', maker: 'Innova' },
  { name: 'Innova 3100 / 5610 and similar', app: 'RepairSolutions2', maker: 'Innova' },
  { name: 'BlueDriver', app: 'BlueDriver', maker: 'Lemur' },
  { name: 'FIXD', app: 'FIXD', maker: 'FIXD' },
  { name: 'Carly', app: 'Carly', maker: 'Carly' }
];

function importPanel() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return '<div class="card" style="margin-top:16px" id="importcard">' +
    '<span class="mlabel">Import codes from any scanner</span>' +
    '<p class="note" style="margin:0 0 16px;max-width:640px">' +
    'Most consumer Bluetooth dongles only talk to their own app, and no web page can reach them — ' +
    'that is the dongle\'s design, not a fault here. ' +
    (ios ? 'On iPhone and iPad no browser can use Bluetooth at all. ' : '') +
    'What every one of those apps can do is export a report. Bring it here and the codes land in your history exactly as a live scan would.' +
    '</p>' +

    '<div class="importgrid">' +

    '<button class="importway" onclick="typeCodes()">' +
    '<span class="iw-ic">' + ic('mil', 20) + '</span>' +
    '<b>Type the codes</b>' +
    '<span>Read them off the scanner screen. Always works, takes ten seconds.</span>' +
    '</button>' +

    '<label class="importway" tabindex="0" ' +
    'onkeydown="if(event.key===\'Enter\'){this.querySelector(\'input\').click()}">' +
    '<span class="iw-ic">' + ic('download', 20) + '</span>' +
    '<b>Upload the export</b>' +
    '<span>PDF, CSV, JSON or text from RepairSolutions2, Topdon, BlueDriver, Torque and others.</span>' +
    '<input type="file" style="display:none" ' +
    'accept=".pdf,.csv,.tsv,.txt,.json,.xml,.html,.htm,application/pdf,text/plain,text/csv,application/json" ' +
    'onchange="uploadReport(this)">' +
    '</label>' +

    '<button class="importway" onclick="pasteReport()">' +
    '<span class="iw-ic">' + ic('clipboard', 20) + '</span>' +
    '<b>Paste the text</b>' +
    '<span>From an emailed report or your scanner app\'s share sheet.</span>' +
    '</button>' +

    '</div>' +

    '<details class="lockedlist"><summary>Which dongles will never connect to a browser?</summary>' +
    '<p class="note" style="margin:10px 0">These are locked to their manufacturer\'s app. They are not broken and neither is Garage — ' +
    'they simply do not speak the generic ELM327 protocol that a web page can use. Import their report instead.</p>' +
    '<ul class="lockul">' + LOCKED_DONGLES.map(d =>
      '<li><b>' + esc(d.name) + '</b><span>' + esc(d.maker) + ' — use the ' + esc(d.app) + ' app, then export</span></li>').join('') +
    '</ul>' +
    '<p class="note" style="margin:12px 0 0">Dongles that <b>do</b> work over Web Bluetooth on Chrome or Edge: ' +
    'Veepeak BLE+, Vgate iCar Pro BLE, OBDLink CX and MX+, and most generic ELM327 BLE clones. ' +
    'Bluetooth Classic and Wi-Fi dongles cannot be reached from a browser on any platform.</p>' +
    '</details>' +
    '</div>';
}

/* ============================================================
   1. TYPE THE CODES
   Decodes as you type so a typo is obvious before saving.
   ============================================================ */
function typeCodes() {
  openModal(modalHead('Type the codes',
    'Read them off your scanner. One per line, or separated by spaces or commas.') +
    '<textarea class="inp mono" id="tc-in" rows="4" style="resize:vertical;letter-spacing:.08em" ' +
    'placeholder="P0420&#10;P0171 C0035" oninput="previewCodes()" ' +
    'autocapitalize="characters" autocorrect="off" spellcheck="false"></textarea>' +
    '<div id="tc-preview" style="margin-top:14px"></div>' +
    '<div style="height:14px"></div>' +
    fld('Status', sel('tc-status', [
      ['stored', 'Stored — the light is on'],
      ['pending', 'Pending — not yet confirmed'],
      ['permanent', 'Permanent — cannot be cleared'],
      ['history', 'History — previously set']
    ], 'stored')) +
    '<div style="height:14px"></div>' +
    fld('Odometer now (optional)', inp('tc-odo', { type: 'number', mono: true, ph: 'e.g. 96142' })) +
    '<p class="note" style="margin:14px 0 16px">Garage decodes generic codes from the SAE J2012 table. ' +
    'Manufacturer-specific codes — P1xxx and most B, C and U codes — are stored exactly as you typed them and ' +
    'labelled as needing your manual, because a generic definition for one of those is often simply wrong.</p>' +
    '<button class="btn block" id="tc-save" onclick="saveTypedCodes()" disabled>Add codes</button>');
  setTimeout(() => document.getElementById('tc-in')?.focus(), 60);
}

function parseTypedCodes(raw) {
  const out = [], bad = [], seen = new Set();
  for (const tok of String(raw).toUpperCase().split(/[^A-Z0-9]+/)) {
    if (!tok) continue;
    if (/^[PCBU][0-3][0-9A-F]{3}$/.test(tok)) {
      if (!seen.has(tok)) { seen.add(tok); out.push(tok); }
    } else if (tok.length >= 3) bad.push(tok);
  }
  return { good: out, bad };
}

async function previewCodes() {
  const { good, bad } = parseTypedCodes(val('tc-in'));
  const box = document.getElementById('tc-preview');
  const btn = document.getElementById('tc-save');
  if (!box) return;
  if (btn) btn.disabled = !good.length;

  if (!good.length && !bad.length) { box.innerHTML = ''; return; }

  const rows = await Promise.all(good.map(async c => {
    let dec = null;
    try { dec = await API.get('/decode/' + c); } catch { }
    const generic = dec && dec.generic !== false && dec.description;
    return '<div class="kv"><span class="mono" style="flex:0 0 58px;text-align:left;color:var(--primary)">' + c + '</span>' +
      '<span style="flex:1;text-align:left">' + esc(dec?.description || 'Manufacturer-specific — check your manual') + '</span>' +
      srcChip(generic ? 'CALCULATED' : 'NEEDS VERIFICATION') + '</div>';
  }));

  box.innerHTML =
    (good.length ? '<span class="mlabel">' + good.length + ' code' + (good.length === 1 ? '' : 's') + ' recognised</span>' + rows.join('') : '') +
    (bad.length
      ? '<p class="note" style="margin:10px 0 0;color:var(--warn)">Not a code: <span class="mono">' +
        bad.map(esc).join(', ') + '</span>. A code is P, C, B or U then four characters — for example P0420.</p>'
      : '');
}

async function saveTypedCodes() {
  const { good } = parseTypedCodes(val('tc-in'));
  if (!good.length) return;
  const status = val('tc-status');
  const odo = intVal('tc-odo');
  const btn = document.getElementById('tc-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    const r = await API.post('/vehicles/' + state.activeId + '/codes', {
      codes: good.map(c => ({ code: c, status })),
      odometer: odo, tool: 'Typed in by hand'
    });
    closeModal();
    await afterImport(r);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Add codes'; }
    toast(e.message, 'bad');
  }
}

/* ============================================================
   2. UPLOAD THE EXPORT
   ============================================================ */
async function uploadReport(input) {
  const f = input.files?.[0];
  if (!f) return;
  input.value = '';
  if (f.size > 25 * 1024 * 1024) return toast('That file is over 25 MB', 'bad');

  saveState('saving');
  toast('Reading ' + f.name + '…');
  const fd = new FormData();
  fd.append('file', f);
  try {
    const r = await API.form('/vehicles/' + state.activeId + '/import-file', fd);
    saveState('saved');
    await afterImport(r);
  } catch (e) {
    saveState('error');
    importFailed(e.message, f.name);
  }
}

/* ============================================================
   3. PASTE THE TEXT
   ============================================================ */
function pasteReport() {
  openModal(modalHead('Paste the report',
    'Open the report in your scanner app, select all, copy, and paste it here. An emailed report works too.') +
    '<textarea class="inp" id="pr-in" rows="9" style="resize:vertical;font-size:13px" ' +
    'placeholder="Paste anything that contains the codes — Garage will find them."></textarea>' +
    '<p class="note" style="margin:12px 0 16px">Nothing is uploaded anywhere. The text is parsed on your own server and only the codes are kept.</p>' +
    '<button class="btn block" onclick="savePasted()">Find the codes</button>');
  setTimeout(() => document.getElementById('pr-in')?.focus(), 60);
}

async function savePasted() {
  const text = val('pr-in');
  if (!text.trim()) return toast('Paste the report text first', 'bad');
  try {
    const r = await API.post('/vehicles/' + state.activeId + '/import-report', { text });
    closeModal();
    await afterImport(r);
  } catch (e) { toast(e.message, 'bad'); }
}

/* ============================================================
   RESULT
   ============================================================ */
async function afterImport(r) {
  await loadDetail(true);
  await loadAll();
  rerender();

  const dupe = (r.duplicates || []).length;
  openModal(modalHead(
    r.added ? r.added + ' code' + (r.added === 1 ? '' : 's') + ' added' : 'Nothing new to add',
    (r.tool ? 'Read from ' + esc(r.tool) + '. ' : '') +
    r.found + ' code' + (r.found === 1 ? '' : 's') + ' found in the report.') +

    (r.dtcs?.length
      ? r.dtcs.map(d => '<div class="kv">' +
          '<span class="mono" style="flex:0 0 58px;text-align:left;color:var(--primary)">' + esc(d.code) + '</span>' +
          '<span style="flex:1;text-align:left">' + esc(d.description || '—') + '</span>' +
          srcChip(d.source === 'imported' ? 'IMPORTED' : 'NEEDS VERIFICATION') + '</div>').join('')
      : '') +

    (dupe
      ? '<p class="note" style="margin:14px 0 0">' + dupe + ' code' + (dupe === 1 ? ' was' : 's were') +
        ' already open on this vehicle, so ' + (dupe === 1 ? 'it was' : 'they were') +
        ' left alone rather than duplicated: <span class="mono">' + r.duplicates.map(esc).join(', ') + '</span>.</p>'
      : '') +

    (r.context?.odometer
      ? '<p class="note" style="margin:10px 0 0">Odometer ' + r.context.odometer.toLocaleString() +
        ' was recorded from the report as a scan-tool reading.</p>'
      : '') +

    (r.context?.monitors?.length
      ? '<p class="note" style="margin:10px 0 0">Readiness monitors captured: ' +
        r.context.monitors.map(m => esc(m.name) + ' (' + esc(m.state) + ')').join(', ') + '.</p>'
      : '') +

    '<div class="safety" style="margin-top:16px">A trouble code names a circuit or a symptom, not a broken part. ' +
    'P0420 is the classic example — it reports catalyst efficiency below threshold, and the cause is an exhaust leak ' +
    'or a lazy upstream sensor at least as often as it is the converter. Garage will not tell you what to replace.</div>' +

    '<button class="btn block ghost" style="margin-top:16px" onclick="closeModal();go(\'diagnose\')">See the codes</button>');
}

/* A failed import should say what to try next, not just fail. */
function importFailed(message, filename) {
  openModal(modalHead('Could not read that file', esc(filename || '')) +
    '<p class="note" style="margin:0 0 16px">' + esc(message) + '</p>' +
    '<div class="row" style="gap:10px">' +
    '<button class="btn ghost" style="flex:1" onclick="closeModal();typeCodes()">Type the codes instead</button>' +
    '<button class="btn ghost" style="flex:1" onclick="closeModal();pasteReport()">Paste the text</button>' +
    '</div>');
}
