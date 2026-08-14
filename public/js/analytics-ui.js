/* ============================================================
   analytics-ui.js — the telemetry dashboard

   Everything here reads /api/vehicles/:id/analytics, which reads
   the user's own records. If a panel has nothing to draw it says
   what's missing and offers the button that fixes it, because
   "no data" plus a dead end is how a feature gets abandoned.
   ============================================================ */
const AN = { data: null, id: null, period: '1Y', fuelView: 'economy', loading: false };

const PERIOD_KEYS = ['30D', '90D', '6M', '1Y', 'ALL'];

async function loadAnalytics(force) {
  if (!state.activeId) { AN.data = null; return; }
  if (!force && AN.data && AN.id === state.activeId) return;
  AN.loading = true;
  try {
    AN.data = await API.get('/vehicles/' + state.activeId + '/analytics?period=' + AN.period);
    AN.id = state.activeId;
  } finally { AN.loading = false; }
}

async function setPeriod(p) {
  AN.period = p;
  await loadAnalytics(true);
  renderAnalytics();
}
function setFuelView(v) { AN.fuelView = v; renderAnalytics(); }

function periodBar() {
  return '<div class="periods" role="group" aria-label="Time range">' +
    PERIOD_KEYS.map(p => '<button class="' + (AN.period === p ? 'on' : '') + '" ' +
      'aria-pressed="' + (AN.period === p) + '" onclick="setPeriod(\'' + p + '\')">' + p + '</button>').join('') +
    '</div>';
}

/* ============================================================
   SCREEN
   ============================================================ */
async function renderAnalytics() {
  const el = document.getElementById('s-analytics');
  const v = activeVehicle();
  if (!v) return needVehicle(el, 'see cost, fuel and maintenance analytics');

  if (!AN.data || AN.id !== state.activeId) {
    el.innerHTML = '<div class="card"><p class="note">Reading your records…</p></div>';
    await loadAnalytics();
  }
  const a = AN.data;
  if (!a) return;

  el.innerHTML =
    '<div class="between wrap" style="margin-bottom:16px;gap:12px">' +
    '<div><h2 style="font-size:23px">Analytics</h2>' +
    '<p class="note" style="margin:4px 0 0">' + esc(v.nickname || vLabel(v)) +
    ' — built from your records only. Nothing here is estimated unless it says so.</p></div>' +
    periodBar() + '</div>' +

    telemetryStrip(a, v) +

    '<div class="analytics">' +
      costPanel(a) +
      statusPanel(a) +
      fuelPanel(a) +
      odoPanel(a) +
      systemPanel(a) +
      horizonPanel(a) +
    '</div>';
}
renderers.analytics = renderAnalytics;

/* ============================================================
   TELEMETRY STRIP
   ============================================================ */
function telemetryStrip(a, v) {
  const h = a.headline;
  const d = D();
  const recalls = (d.recalls || []).filter(r => !r.completed && !r.dismissed).length;
  const dueSoon = (d.reminders || []).filter(r => r.overdue || r.cls === 'warn').length;
  const openDtc = (d.dtcs || []).filter(x => !x.cleared_at).length;

  /* Sparklines only where there is genuine history behind them. A
     flat invented line under a metric is worse than no line. */
  const costSpark = a.cost.series?.[0]?.points.map(p => p.y) || [];
  const mpgSpark = a.fuel.series?.economy?.[0]?.points.map(p => p.y) || [];

  return '<div class="metricstrip">' +
    metric({
      label: 'Total spend', icon: 'money', tone: 'primary',
      value: h.totalSpend ? fmtMoneyX(h.totalSpend) : null,
      sub: h.totalSpend ? PERIODS_LABEL[AN.period] : 'No costs recorded',
      spark: costSpark, sparkColor: CHART_COLORS.cyan,
      onClick: "go('money')"
    }) +
    metric({
      label: 'Cost per mile', icon: 'chart', tone: 'violet',
      value: h.costPerMile ? '$' + h.costPerMile.toFixed(3) : null,
      sub: h.costPerMile ? 'CALCULATED' : 'Needs 2 odometer readings'
    }) +
    metric({
      label: 'Odometer', icon: 'gear', tone: 'muted',
      value: h.odometer ? h.odometer.toLocaleString() : null,
      sub: a.odometer.perYear ? Math.round(a.odometer.perYear).toLocaleString() + ' mi/yr' : 'Rate not established',
      onClick: "logOdometer(state.activeId)"
    }) +
    metric({
      label: 'Open recalls', icon: 'alert', tone: recalls ? 'bad' : 'ok',
      value: recalls, sub: recalls ? 'Not marked complete' : 'None outstanding',
      onClick: "go('vehicle')"
    }) +
    metric({
      label: 'Maintenance due', icon: 'bell', tone: dueSoon ? 'warn' : 'ok',
      value: dueSoon, sub: dueSoon ? 'Overdue or due soon' : 'Nothing pressing',
      onClick: "go('maintenance')"
    }) +
    metric({
      label: 'Open codes', icon: 'mil', tone: openDtc ? 'warn' : 'ok',
      value: openDtc, sub: openDtc ? 'Stored, not cleared' : 'No stored codes',
      onClick: "go('diagnose')"
    }) +
    '</div>';
}
const PERIODS_LABEL = { '30D': 'Last 30 days', '90D': 'Last 90 days', '6M': 'Last 6 months', '1Y': 'Last 12 months', 'ALL': 'All records' };

/* ============================================================
   COST TREND
   ============================================================ */
function costPanel(a) {
  const c = a.cost;
  if (c.empty || !c.series.length) {
    return panel({ title: 'OWNERSHIP COST', sub: PERIODS_LABEL[AN.period], wide: true, table: false },
      chartEmpty({
        title: c.empty || 'NO COST DATA IN THIS PERIOD',
        body: 'Log a service or an expense and this chart fills in. Try a wider period if your records are older.',
        action: { label: '+ ADD SERVICE', run: "go('money')" }, height: 240
      }));
  }

  const series = c.series.map(s => ({
    key: s.key, label: s.label, color: CHART_COLORS[s.color], fill: s.fill,
    points: s.points.map(p => ({
      x: p.x, y: p.y, text: fmtMoneyX(p.y), month: p.x,
      note: p.y === 0 ? 'Nothing recorded this month' : null
    }))
  }));

  return lineChart({
    id: 'cost', title: 'OWNERSHIP COST', sub: PERIODS_LABEL[AN.period], wide: true,
    series, height: 250, yZero: true,
    xLabel: 'Month',
    yFmt: v => fmtMoney(v), yFmtFull: v => fmtMoneyX(v),
    xFmt: fmtMonth, xFmtFull: fmtMonthYear,
    onPoint: p => openMonth(p.x),
    foot: srcChip('CALCULATED') + '<span>' + esc(c.basis) + '</span>',
    empty: { title: 'NO COST DATA IN THIS PERIOD' }
  });
}

function openMonth(m) {
  const d = D();
  const svc = (d.service || []).filter(r => r.date.slice(0, 7) === m);
  const exp = (d.expenses || []).filter(r => r.date.slice(0, 7) === m);
  const fuel = (d.fuel || []).filter(r => r.date.slice(0, 7) === m);
  const total = [...svc, ...exp, ...fuel].reduce((s, r) => s + (r.cost || r.amount || r.total || 0), 0);

  openModal(modalHead(fmtMonthYear(m), fmtMoneyX(total) + ' across ' + (svc.length + exp.length + fuel.length) + ' record(s)') +
    (svc.length ? '<span class="mlabel">Service</span>' + svc.map(r =>
      '<div class="kv"><span style="flex:1;text-align:left">' + esc(r.what) + '</span>' +
      '<b class="mono">' + fmtMoneyX(r.cost || 0) + '</b></div>').join('') : '') +
    (exp.length ? '<span class="mlabel" style="margin-top:14px">Expenses</span>' + exp.map(r =>
      '<div class="kv"><span style="flex:1;text-align:left">' + esc(r.category) + (r.vendor ? ' — ' + esc(r.vendor) : '') + '</span>' +
      '<b class="mono">' + fmtMoneyX(r.amount) + '</b></div>').join('') : '') +
    (fuel.length ? '<span class="mlabel" style="margin-top:14px">Fuel</span>' + fuel.map(r =>
      '<div class="kv"><span style="flex:1;text-align:left">' + esc(r.date) + (r.station ? ' — ' + esc(r.station) : '') + '</span>' +
      '<b class="mono">' + fmtMoneyX(r.total || 0) + '</b></div>').join('') : '') +
    (svc.length + exp.length + fuel.length === 0
      ? '<p class="note">Nothing was recorded in this month.</p>' : '') +
    '<button class="btn block ghost" style="margin-top:18px" onclick="closeModal();go(\'money\')">Open fuel &amp; money</button>');
}

/* ============================================================
   STATUS GAUGES
   These describe RECORD QUALITY, not vehicle health. The heading
   says so, because a big percentage next to a car gets read as a
   health score no matter what we intended it to mean.
   ============================================================ */
function statusPanel(a) {
  const g = a.gauges;
  const G = (key, label, tone) => {
    const x = g[key];
    return gauge({
      label, value: x.value, display: x.display, sub: x.sub,
      tone: x.tone || tone, detail: esc(x.detail || ''),
      aria: x.detail || '',
      onClick: GAUGE_GO[key]
    });
  };

  const notes = Object.values(g).map(x => x.note).filter(Boolean);

  return panel({
    title: 'RECORD STATUS', sub: 'CURRENT', table: false,
    note: 'How complete your records are — not a measure of the vehicle\'s condition.'
  },
    '<div class="gaugerow">' +
    G('compliance', 'Maintenance', 'primary') +
    G('completeness', 'Documentation', 'primary') +
    G('fuel', 'Fuel data', 'primary') +
    G('documents', 'Documents', 'primary') +
    '</div>' +
    (notes.length ? '<p class="note" style="margin:16px 0 0">' + notes.map(esc).join(' ') + '</p>' : '') +
    '<div class="safety" style="margin-top:14px">' +
    'These are completeness figures for your own records. Garage does not calculate a vehicle health score — ' +
    'that would require inspection data it does not have.</div>'
  );
}
const GAUGE_GO = {
  compliance: "go('maintenance')", completeness: "go('records')",
  fuel: "go('money')", documents: "go('ownership')"
};

/* ============================================================
   FUEL
   ============================================================ */
const FUEL_VIEWS = {
  economy: { label: 'MPG', title: 'FUEL ECONOMY', sub: 'FULL TANK DATA' },
  price:   { label: 'PRICE', title: 'FUEL PRICE', sub: 'PER UNIT PAID' },
  cpm:     { label: 'COST / MI', title: 'FUEL COST', sub: 'PER MILE' }
};

function fuelPanel(a) {
  const f = a.fuel;
  const head = '<div class="periods" role="group" aria-label="Fuel view">' +
    Object.entries(FUEL_VIEWS).map(([k, x]) =>
      '<button class="' + (AN.fuelView === k ? 'on' : '') + '" aria-pressed="' + (AN.fuelView === k) + '" ' +
      'onclick="setFuelView(\'' + k + '\')">' + x.label + '</button>').join('') + '</div>';

  const view = FUEL_VIEWS[AN.fuelView];

  if (f.empty) {
    return panel({ title: view.title, sub: view.sub, table: false },
      chartEmpty({
        title: f.empty,
        body: f.hint,
        action: { label: '+ LOG FUEL', run: 'addFuel()' }, height: 210
      }), head);
  }

  const raw = f.series[AN.fuelView] || [];
  const series = raw.map(s => ({
    key: s.key, label: s.label, color: CHART_COLORS[s.color],
    points: s.points
  }));

  const unitFmt = {
    economy: v => abbrev(v, 1) + ' ' + f.unit,
    price: v => '$' + v.toFixed(2),
    cpm: v => '$' + v.toFixed(2)
  }[AN.fuelView];

  return lineChart({
    id: 'fuel-' + AN.fuelView, title: view.title, sub: view.sub,
    series, height: 210, xLabel: 'Fill-up',
    yFmt: unitFmt, xFmt: fmtDay, xFmtFull: fmtDay,
    onPoint: p => p.ref && openFuelRecord(p.ref),
    foot: srcChip(AN.fuelView === 'price' ? 'USER ENTERED' : 'CALCULATED') +
      (AN.fuelView === 'economy' && f.average
        ? '<span class="mono">AVG ' + f.average + ' ' + f.unit + '</span>' +
          '<span class="mono" style="color:var(--ok)">BEST ' + f.best + '</span>' +
          '<span class="mono" style="color:var(--warn)">WORST ' + f.worst + '</span>'
        : '') +
      '<span>' + esc(f.basis) + '</span>',
    empty: {
      title: 'NOT ENOUGH DATA FOR THIS VIEW',
      body: 'This view needs values you have not entered on your fill-ups yet.',
      action: { label: '+ LOG FUEL', run: 'addFuel()' }
    },
    head
  });
}

function openFuelRecord(id) {
  const r = (D().fuel || []).find(x => x.id === id);
  if (!r) return go('money');
  openModal(modalHead('Fill-up', fmtDay(r.date)) +
    '<div class="kv"><span>Odometer</span><b class="mono">' + (r.odometer ? r.odometer.toLocaleString() : '—') + '</b></div>' +
    '<div class="kv"><span>Quantity</span><b class="mono">' + r.quantity + '</b></div>' +
    '<div class="kv"><span>Price/unit</span><b class="mono">' + (r.price_per_unit ? '$' + r.price_per_unit : '—') + '</b></div>' +
    '<div class="kv"><span>Total</span><b class="mono">' + (r.total ? fmtMoneyX(r.total) : '—') + '</b></div>' +
    '<div class="kv"><span>Full tank</span><b class="mono">' + (r.partial ? 'NO — PARTIAL' : 'YES') + '</b></div>' +
    (r.station ? '<div class="kv"><span>Station</span><b>' + esc(r.station) + '</b></div>' : '') +
    '<button class="btn block ghost" style="margin-top:18px" onclick="closeModal();go(\'money\')">Open fuel log</button>');
}

/* ============================================================
   ODOMETER
   ============================================================ */
function odoPanel(a) {
  const o = a.odometer;
  if (o.empty) {
    return panel({ title: 'ODO', sub: 'READING HISTORY', table: false },
      chartEmpty({ title: o.empty, body: o.hint, action: { label: '+ ADD READING', run: 'logOdometer(state.activeId)' }, height: 210 }));
  }

  const series = o.series.map(s => ({
    key: s.key, label: s.label, color: CHART_COLORS[s.color], points: s.points
  }));

  return lineChart({
    id: 'odo', title: 'ODO', sub: 'READING HISTORY',
    series, height: 210, xLabel: 'Date',
    yFmt: v => abbrev(v, 0), yFmtFull: v => Math.round(v).toLocaleString(),
    xFmt: fmtDay, onPoint: p => openOdoReading(p),
    foot: '<span class="lg" style="--c:var(--ok)"><i></i>Verified source</span>' +
      (o.flagged ? '<span class="lg" style="--c:var(--warn)"><i></i>' + o.flagged + ' out of sequence</span>' : '') +
      '<span>' + esc(o.perYearBasis) + '</span>'
  });
}

function openOdoReading(p) {
  openModal(modalHead(Math.round(p.y).toLocaleString() + (UNITS.metric ? ' km' : ' mi'), fmtDay(p.x)) +
    '<div class="kv"><span>Source</span><b class="mono">' + esc(p.source) + '</b></div>' +
    (p.outOfSequence
      ? '<div class="safety" style="margin-top:12px"><b>Out of sequence.</b> This reading is lower than an earlier one. ' +
        'That is usually a typo, but on a vehicle you plan to sell it is worth resolving — a buyer pulling a history ' +
        'report will see the same discrepancy. Correct it in the odometer log if it was a mistake.</div>'
      : '') +
    (p.note && !p.outOfSequence ? '<p class="note" style="margin-top:12px">' + esc(p.note) + '</p>' : '') +
    '<button class="btn block ghost" style="margin-top:18px" onclick="closeModal();logOdometer(state.activeId)">Add a reading</button>');
}

/* ============================================================
   SPEND BY SYSTEM
   ============================================================ */
function systemPanel(a) {
  const s = a.systems;
  if (s.empty) {
    return panel({ title: 'SPEND BY SYSTEM', sub: PERIODS_LABEL[AN.period], table: false },
      chartEmpty({
        title: s.empty,
        body: 'Costed service records break down here by area of the vehicle.',
        action: { label: '+ ADD SERVICE', run: "go('money')" }, height: 210
      }));
  }

  const segments = s.segments.map(x => ({
    label: x.label, value: x.value,
    color: x.uncategorised ? 'var(--dim)' : undefined,
    onClick: x.uncategorised ? 'assignSystems()' : "drillSystem('" + x.key + "')"
  }));

  const un = s.segments.find(x => x.uncategorised);

  return panel({
    title: 'SPEND BY SYSTEM', sub: PERIODS_LABEL[AN.period], table: false,
    foot: srcChip('USER ENTERED') +
      (un ? '<button class="btn xs ghost" onclick="assignSystems()">Assign ' + fmtMoneyX(un.value) + ' of uncategorised work</button>'
          : '<span>Every costed record is categorised.</span>')
  }, donut({ segments, title: 'Spend by system' }));
}

function drillSystem(key) {
  const rows = (D().service || []).filter(r => r.system === key);
  openModal(modalHead(key.toUpperCase(), rows.length + ' record(s)') +
    (rows.length ? rows.map(r =>
      '<div class="kv"><span style="flex:1;text-align:left">' + esc(r.what) +
      '<br><small class="note">' + esc(r.date) + '</small></span>' +
      '<b class="mono">' + fmtMoneyX(r.cost || 0) + '</b></div>').join('')
      : '<p class="note">No records.</p>') +
    '<button class="btn block ghost" style="margin-top:18px" onclick="closeModal();go(\'records\')">Open records</button>');
}

/* Assigning a system to legacy records — one at a time, by the person
   who was there. We do not guess from the description text. */
async function assignSystems() {
  const rows = await API.get('/service/uncategorised/' + state.activeId);
  openModal(modalHead('Assign a system', 'These records were logged before spend was broken down by system. ' +
    'Garage will not guess which system they belong to — a misfiled transmission rebuild would skew every figure derived from it.') +
    (rows.length
      ? '<div class="assignlist">' + rows.map(r =>
          '<div class="assignrow"><div style="min-width:0"><b>' + esc(r.what) + '</b>' +
          '<div class="note mono">' + esc(r.date) + ' — ' + fmtMoneyX(r.cost || (r.parts_cost || 0) + (r.labor_cost || 0)) + '</div></div>' +
          sel('sys' + r.id, [['', 'Choose…'], ...SYSTEM_OPTS], '', { onchange: 'assignOne(' + r.id + ',this.value)' }) +
          '</div>').join('') + '</div>'
      : '<p class="note">Nothing left to assign.</p>'));
}

const SYSTEM_OPTS = [
  ['engine', 'Engine'], ['brakes', 'Brakes'], ['tires', 'Tires & wheels'],
  ['charging', 'Electrical'], ['cooling', 'Cooling'], ['fuel', 'Fuel system'],
  ['hvac', 'Climate'], ['trans', 'Transmission'], ['suspension', 'Suspension & steering'],
  ['drive', 'Driveline'], ['diagnostics', 'Diagnostics'], ['body', 'Body & interior'],
  ['ev', 'EV system'], ['legal', 'Registration & legal']
];

async function assignOne(id, sys) {
  if (!sys) return;
  saveState('saving');
  try {
    await API.patch('/service/' + id + '/system', { system: sys });
    saveState('saved');
    await loadDetail(true);
    await loadAnalytics(true);
    document.querySelector('[id="sys' + id + '"]')?.closest('.assignrow')?.classList.add('done');
  } catch (e) { saveState('error'); toast(e.message, 'bad'); }
}

/* ============================================================
   SERVICE HORIZON
   ============================================================ */
function horizonPanel(a) {
  const h = a.horizon;
  if (h.empty || !h.items.length) {
    return panel({ title: 'SERVICE HORIZON', sub: 'NEXT 12 MONTHS', table: false },
      chartEmpty({
        title: h.empty || 'NOTHING DUE IN THE NEXT 12 MONTHS',
        body: h.noInterval
          ? h.noInterval + ' scheduled item(s) have no interval or no last-done date, so nothing can be projected for them.'
          : 'Add a maintenance item with an interval and it appears here.',
        action: { label: '+ MAINTENANCE', run: "go('maintenance')" }, height: 210
      }));
  }

  const today = new Date().toISOString().slice(0, 10);
  return panel({
    title: 'SERVICE HORIZON', sub: 'NEXT 12 MONTHS', table: false,
    foot: srcChip(h.rateKnown ? 'CALCULATED' : 'USER ENTERED') + '<span>' + esc(h.basis) + '</span>'
  },
    '<ul class="horizon">' + h.items.map(i =>
      '<li class="hz ' + i.cls + '" tabindex="0" role="button" onclick="openTaskFromHorizon(' + i.id + ')" ' +
      'onkeydown="if(event.key===\'Enter\'){openTaskFromHorizon(' + i.id + ')}">' +
      '<span class="hz-when mono">' + (i.dueDate < today ? 'OVERDUE' : fmtDay(i.dueDate)) + '</span>' +
      '<span class="hz-name">' + esc(i.name) +
      (i.projected ? ' <span class="srcchip tone-warn">FORECAST</span>' : '') + '</span>' +
      '<span class="hz-cost mono">' + (i.estCost ? fmtMoneyX(i.estCost) : '—') + '</span>' +
      '</li>').join('') + '</ul>' +
    (h.later ? '<p class="note" style="margin:12px 0 0">' + h.later + ' more item(s) fall beyond 12 months.</p>' : '') +
    (h.noInterval ? '<p class="note" style="margin:6px 0 0">' + h.noInterval +
      ' item(s) cannot be projected — no interval, or no last-done date to count from.</p>' : '')
  );
}

function openTaskFromHorizon(id) {
  if (typeof openTask === 'function') openTask(id);
  else go('maintenance');
}
