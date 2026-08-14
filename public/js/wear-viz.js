/* ============================================================
   wear-viz.js — tires, brakes and battery as instruments.

   Measurements only. Every threshold shown here is a published
   legal or engineering minimum (2/32" tread, 3 mm pad, DOT age),
   not a Garage opinion — and each one says where it comes from.

   Nothing in this file decides whether a vehicle is safe to
   drive. It shows you your own numbers next to the published
   limit and leaves the judgement where it belongs.
   ============================================================ */

/* ---------- thresholds, with their sources named ---------- */
const WEAR_LIMITS = {
  tread: { legal: 2, caution: 4, unit: '/32"',
           note: '2/32" is the federal minimum in most US states. Wet stopping distance degrades well before that — 4/32" is the common advisory figure.' },
  pad:   { legal: 3, caution: 5, unit: ' mm',
           note: '3 mm is the widely published minimum friction thickness. Below it, backing plate contact and rotor damage follow quickly.' },
  dotAge: { years: 6,
           note: 'Rubber degrades with age regardless of tread. Six years is the common advisory; ten is the usual hard limit.' }
};

const CORNERS = [
  { k: 'lf', psi: 'psi_lf', label: 'LEFT FRONT', axle: 'front' },
  { k: 'rf', psi: 'psi_rf', label: 'RIGHT FRONT', axle: 'front' },
  { k: 'lr', psi: 'psi_lr', label: 'LEFT REAR', axle: 'rear' },
  { k: 'rr', psi: 'psi_rr', label: 'RIGHT REAR', axle: 'rear' }
];

/* ============================================================
   FOUR-CORNER LAYOUT
   ============================================================ */
function cornerModule(w) {
  if (!w || !w.tires) {
    return chartEmpty({
      title: 'NO TIRE SET ON THE VEHICLE',
      body: 'Add the set that is currently fitted, then log tread depths at each rotation.',
      action: { label: '+ ADD A SET', run: 'addTireSet()' }, height: 220
    });
  }
  const m = w.tires.latest;
  const set = w.tires.set;

  if (!m) {
    return chartEmpty({
      title: 'ADD TREAD MEASUREMENTS TO TRACK WEAR',
      body: 'Four numbers at each rotation is all it takes. It is also the single most useful thing to hand a buyer.',
      action: { label: '+ ADD MEASUREMENT', run: 'addTireMeasurement(' + set.id + ')' }, height: 220
    });
  }

  const cell = c => {
    const tread = m[c.k], psi = m[c.psi];
    const known = tread != null;
    const cls = !known ? '' : tread <= WEAR_LIMITS.tread.legal ? 'bad'
      : tread <= WEAR_LIMITS.tread.caution ? 'warn' : '';
    const status = !known ? 'NOT MEASURED'
      : tread <= WEAR_LIMITS.tread.legal ? 'AT LEGAL MINIMUM'
      : tread <= WEAR_LIMITS.tread.caution ? 'WET GRIP REDUCED' : 'SERVICEABLE';

    return '<div class="corner ' + cls + '" tabindex="0" role="button" ' +
      'onclick="cornerDetail(\'' + c.k + '\')" onkeydown="if(event.key===\'Enter\'){cornerDetail(\'' + c.k + '\')}">' +
      '<div class="pos">' + c.label + '</div>' +
      (known
        ? '<div class="big">' + tread + '<small style="font-size:11px;color:var(--dim)">/32"</small></div>'
        : '<div class="big none">NOT MEASURED</div>') +
      '<div class="sub">' + (psi != null ? psi + ' psi · ' : '') + status + '</div>' +
      '</div>';
  };

  const rowFor = axle => CORNERS.filter(c => c.axle === axle);

  return '<div class="corners">' +
      cell(rowFor('front')[0]) +
      '<div class="axis"><span>FRONT</span><div class="axle"></div><span>REAR</span></div>' +
      cell(rowFor('front')[1]) +
      cell(rowFor('rear')[0]) + '<div class="axis"><div class="axle"></div></div>' + cell(rowFor('rear')[1]) +
    '</div>' +
    '<p class="note" style="margin:16px 0 0;text-align:center">Measured ' + esc(fmtDay(m.date)) +
    (m.odometer ? ' at ' + m.odometer.toLocaleString() + ' mi' : '') + '. ' + srcChip('USER ENTERED') + '</p>';
}

function cornerDetail(k) {
  const w = AN.data?.wear;
  const c = CORNERS.find(x => x.k === k);
  const m = w?.tires?.latest;
  if (!c || !m) return;
  const tread = m[c.k], psi = m[c.psi];
  const st = w.tires.status || {};

  openModal(modalHead(c.label, 'From your last logged measurement') +
    '<div class="kv"><span>Tread depth</span><b class="mono">' +
      (tread != null ? tread + '/32"' : 'NOT MEASURED') + '</b></div>' +
    '<div class="kv"><span>Pressure</span><b class="mono">' + (psi != null ? psi + ' psi' : 'NOT MEASURED') + '</b></div>' +
    '<div class="kv"><span>Measured</span><b class="mono">' + esc(m.date) + '</b></div>' +
    (st.milesPer32 ? '<div class="kv"><span>Wear rate</span><b class="mono">' +
      st.milesPer32.toLocaleString() + ' mi per 1/32"</b></div>' : '') +
    '<div class="safety" style="margin-top:14px">' + esc(WEAR_LIMITS.tread.note) +
    ' Garage reports your measurement against that published figure. It does not certify a tire as safe or unsafe — ' +
    'tread depth is one input, and condition, age and damage are not visible in a number.</div>' +
    '<button class="btn block ghost" style="margin-top:16px" onclick="closeModal();addTireMeasurement(' +
      w.tires.set.id + ')">Log a new measurement</button>');
}

/* ============================================================
   TREAD AND PRESSURE TRENDS
   ============================================================ */
function treadChart(w) {
  const t = w?.tires;
  if (!t || !t.tread.length || t.measurements < 2) {
    return panel({ title: 'TREAD', sub: 'WEAR HISTORY', table: false },
      chartEmpty({
        title: t && t.measurements === 1 ? 'ONE MEASUREMENT ON FILE' : 'NO TREAD HISTORY',
        body: 'Two or more measurements are needed before a wear trend means anything.',
        action: t ? { label: '+ ADD MEASUREMENT', run: 'addTireMeasurement(' + t.set.id + ')' } : null,
        height: 200
      }));
  }

  return lineChart({
    id: 'tread', title: 'TREAD', sub: 'WEAR HISTORY',
    series: t.tread.map(s => ({ key: s.key, label: s.label, color: CHART_COLORS[s.color], points: s.points, fill: false })),
    height: 200, xLabel: 'Date', forceLegend: true,
    yFmt: v => v + '/32', xFmt: fmtDay,
    yDomain: [0, Math.max(t.set.new_tread_32 || 10, 10)],
    bands: [{ from: -Infinity, to: Infinity }].slice(0, 0),
    markers: [],
    foot: srcChip('USER ENTERED') +
      '<span>Legal minimum ' + WEAR_LIMITS.tread.legal + '/32". ' + esc(WEAR_LIMITS.tread.note) + '</span>'
  });
}

function pressureChart(w) {
  const t = w?.tires;
  if (!t || !t.pressure.length) {
    return panel({ title: 'PRESSURE', sub: 'HISTORY', table: false },
      chartEmpty({
        title: 'NO PRESSURE READINGS',
        body: 'Log pressures alongside tread and this fills in. Cold pressures only — hot readings run several psi high.',
        action: t ? { label: '+ ADD MEASUREMENT', run: 'addTireMeasurement(' + t.set.id + ')' } : null,
        height: 200
      }));
  }
  return lineChart({
    id: 'psi', title: 'PRESSURE', sub: 'HISTORY',
    series: t.pressure.map(s => ({ key: s.key, label: s.label, color: CHART_COLORS[s.color], points: s.points, fill: false })),
    height: 200, xLabel: 'Date', forceLegend: true,
    yFmt: v => v + ' psi', xFmt: fmtDay,
    foot: srcChip('USER ENTERED') +
      '<span>Compare against the placard on the driver door jamb, not the number moulded into the sidewall — ' +
      'that one is the tire\'s maximum, not your vehicle\'s specification.</span>'
  });
}

/* ============================================================
   BRAKES — pad thickness by axle
   ============================================================ */
function brakePanel(w) {
  const b = w?.brakes;
  if (!b || !b.latest) {
    return panel({ title: 'BRAKES', sub: 'PAD THICKNESS', table: false },
      chartEmpty({
        title: 'NO PAD MEASUREMENTS',
        body: 'Measure at the next wheel-off and log four numbers. "Looks fine" is not a record.',
        action: { label: '+ ADD MEASUREMENT', run: 'addBrakeMeasurement()' }, height: 200
      }));
  }

  const L = b.latest;
  const lim = WEAR_LIMITS.pad;
  const axle = (label, keys) =>
    '<div class="axlegroup"><span class="mlabel">' + label + '</span>' +
    keys.map(([k, name]) => {
      const v = L[k];
      const tone = v == null ? 'primary' : v <= lim.legal ? 'bad' : v <= lim.caution ? 'warn' : 'ok';
      return meter({
        label: name, value: v, max: 12, threshold: lim.legal, tone,
        display: v != null ? v + ' mm' : null,
        foot: v == null ? 'Not measured at the last inspection'
          : v <= lim.legal ? 'At or below the ' + lim.legal + ' mm published minimum'
          : v <= lim.caution ? 'Plan the job' : 'Serviceable'
      });
    }).join('') + '</div>';

  return panel({
    title: 'BRAKES', sub: 'PAD THICKNESS', table: false,
    foot: srcChip('USER ENTERED') + '<span>' + esc(lim.note) + '</span>'
  },
    '<div class="axles">' +
    axle('Front axle', [['lf_pad', 'Left front'], ['rf_pad', 'Right front']]) +
    axle('Rear axle', [['lr_pad', 'Left rear'], ['rr_pad', 'Right rear']]) +
    '</div>' +
    '<div class="kv" style="margin-top:14px"><span>Last measured</span><b class="mono">' + esc(L.date) +
      (L.odometer ? ' · ' + L.odometer.toLocaleString() + ' mi' : '') + '</b></div>' +
    (b.status?.milesLeft != null
      ? '<div class="kv"><span>Wear rate suggests</span><b class="mono">~' +
        Math.max(0, b.status.milesLeft).toLocaleString() + ' mi to ' + lim.legal + ' mm</b></div>' +
        '<p class="note" style="margin:8px 0 0">' + srcChip('CALCULATED') +
        ' Projected from your own measurements. Driving that changes — towing, hills, city traffic — changes the rate.</p>'
      : '') +
    (b.status?.verdict ? '<p class="note" style="margin:10px 0 0">' + esc(b.status.verdict) + '</p>' : '')
  );
}

/* ============================================================
   BATTERY
   ============================================================ */
function batteryPanel(w) {
  const b = w?.battery;
  if (!b || !b.record) {
    return panel({ title: 'BATTERY', sub: 'STATE & WARRANTY', table: false },
      chartEmpty({
        title: 'NO BATTERY RECORD',
        body: 'Record the install date, group size and CCA off the label. It is what a warranty claim needs.',
        action: { label: '+ ADD BATTERY', run: 'addBattery()' }, height: 200
      }));
  }

  const r = b.record, st = b.status || {};

  /* Warranty ring: only where the label figures were entered. We do
     not know what warranty came with a given battery, and guessing a
     "typical 3 years" would put a claim date on the calendar that the
     retailer will not honour. */
  let ring;
  if (r.installed_date && r.warranty_months) {
    const start = new Date(r.installed_date);
    const end = new Date(start); end.setMonth(end.getMonth() + r.warranty_months);
    const total = end - start, left = end - new Date();
    const frac = Math.max(0, Math.min(1, left / total));
    const monthsLeft = Math.max(0, Math.round(left / (30.44 * 86400000)));
    ring = gauge({
      label: 'Free-replacement warranty',
      value: frac,
      display: monthsLeft > 0 ? monthsLeft + 'mo' : 'ENDED',
      sub: monthsLeft > 0 ? 'REMAINING' : 'EXPIRED',
      tone: frac <= 0 ? 'bad' : frac < 0.2 ? 'warn' : 'ok',
      detail: 'Ends ' + end.toISOString().slice(0, 10),
      size: 128
    });
  } else {
    ring = gauge({
      label: 'Free-replacement warranty', value: null, size: 128,
      detail: r.installed_date
        ? 'Add the warranty period from the label'
        : 'Add the install date and warranty period'
    });
  }

  /* State of charge is a published voltage/SoC relationship for a
     flooded lead-acid battery at rest. It is NOT a health test — a
     failing battery reads 12.6 V until you put a load on it. */
  const soc = st.soc != null
    ? gauge({
        label: 'State of charge', value: st.soc / 100, display: st.soc + '%',
        sub: 'AT REST', tone: st.soc >= 75 ? 'ok' : st.soc >= 50 ? 'warn' : 'bad',
        detail: 'From ' + r.rest_voltage + ' V resting', size: 128
      })
    : gauge({ label: 'State of charge', value: null, size: 128, detail: 'Add a resting voltage reading' });

  const cca = st.ccaPct != null
    ? gauge({
        label: 'Measured CCA', value: Math.min(1, st.ccaPct / 100), display: st.ccaPct + '%',
        sub: 'OF RATED', tone: st.ccaPct >= 80 ? 'ok' : st.ccaPct >= 65 ? 'warn' : 'bad',
        detail: r.measured_cca + ' of ' + r.cca + ' rated', size: 128
      })
    : gauge({ label: 'Measured CCA', value: null, size: 128, detail: 'Needs a tester reading and the rated CCA' });

  const chart = b.series.length
    ? lineChart({
        id: 'batv', title: 'RESTING VOLTAGE', sub: 'TEST HISTORY',
        series: b.series.map(s => ({ key: s.key, label: s.label, color: CHART_COLORS[s.color], points: s.points })),
        height: 170, xFmt: fmtDay, yFmt: v => v.toFixed(2) + ' V', xLabel: 'Test date',
        foot: srcChip('USER ENTERED') + '<span>Resting voltage, measured at least a few hours after the engine was last run.</span>'
      })
    : '';

  return panel({
    title: 'BATTERY', sub: 'STATE & WARRANTY', table: false,
    foot: srcChip('USER ENTERED') +
      '<span>Load test result: <b class="mono">' + esc((r.load_test || 'not tested').toUpperCase()) + '</b>' +
      (r.test_date ? ' on ' + esc(r.test_date) : '') + '</span>'
  },
    '<div class="gaugerow">' + soc + cca + ring + '</div>' +
    '<div class="safety" style="margin-top:16px">' +
    'State of charge is read from resting voltage using the standard flooded lead-acid relationship. ' +
    'It is not a health test — a battery about to fail can show a full charge and still collapse under cranking load. ' +
    'Only a load or conductance test tells you that, and Garage reports the result you enter rather than deriving one.' +
    '</div>' +
    (st.age != null ? '<div class="kv" style="margin-top:12px"><span>Age</span><b class="mono">' + st.age + ' years</b></div>' : '')
  ) + (chart ? '<div style="height:16px"></div>' + chart : '');
}

/* ============================================================
   SCREEN SECTION — appended to the existing wear screen so all
   the current controls, forms and history views keep working.
   ============================================================ */
async function wearVisuals() {
  await loadAnalytics();
  const w = AN.data?.wear;
  return '<div class="between wrap" style="margin:6px 0 14px">' +
      '<h3 style="font-size:19px">Condition at a glance</h3>' +
      srcChip('USER ENTERED') + '</div>' +
    panel({ title: 'TIRES', sub: 'BY POSITION', table: false,
      foot: srcChip('USER ENTERED') + '<span>' + esc(WEAR_LIMITS.tread.note) + '</span>' },
      cornerModule(w)) +
    '<div class="analytics" style="margin-top:16px">' +
      treadChart(w) + pressureChart(w) + brakePanel(w) + batteryPanel(w) +
    '</div>';
}
