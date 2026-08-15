# Garage

A vehicle diagnostic and maintenance companion. VIN-accurate records, OBD-II scanning,
maintenance intelligence that understands severe duty, and a sale-ready history report.

Runs in one container on **port 2026**. Data lives in a SQLite file on a Docker volume —
your records stay on your hardware.

---

## Run it

```bash
docker compose up -d --build
```

Then open **http://localhost:2026** and create an account.

```bash
docker compose logs -f garage      # follow logs
docker compose down                # stop (the volume survives)
docker compose down -v             # stop and delete all data
```

Without Docker:

```bash
npm install
DATA_DIR=./data PORT=2026 npm start
```

Requires Node 22.5+ (it uses the runtime's built-in `node:sqlite`, so there is no native
module to compile and no build stage in the image).

### Verify a running instance

```bash
node test/smoke.mjs http://localhost:2026
```

52 assertions covering auth, isolation between accounts, the interval engine, tank-to-tank
fuel economy, DTC decode and clear tracking, wear analysis, cost of ownership, and every report.

---

### Tests

```bash
npm test              # lint, torque, charts, analytics, render, smoke
npm run test:render   # boots the real page in jsdom, walks every screen
npm run smoke -- http://192.168.1.50:2026   # against a running container
```

`npm test` needs no running server — every suite that needs one starts a throwaway on a scratch
database and tears it down. The render test needs `jsdom` (a dev dependency, excluded from the
image); without it, it skips rather than fails.

The render test exists because the two worst bugs in this project were invisible to data tests: a
body class that collided with `.modal{display:none}` and blanked the entire application, and
inline handlers calling functions that had been renamed. Both left a perfectly healthy API and a
dead page. It loads `index.html`, injects every real script, signs in against a real server, walks
each screen and asserts that markup appeared with no `NaN` in it.

## What is in it

### Garage & vehicles
Add a vehicle by **VIN** (NHTSA vPIC, ~140 fields, free and keyless) or by year / make / model.
The VIN is what gives you displacement and cylinder count — without those, "2014 Silverado"
could be a 4.3 V6 or a 6.2 V8 and half the torque specs and parts fitments are wrong.

Recalls and owner complaints pull automatically after the card renders, so nothing waits on a spinner.

### Maintenance intelligence
- **Severe vs. normal duty.** Severe duty is not rare — it is most people: short trips, idling,
  towing, dust, mountains, extreme heat or cold. It roughly halves the mileage leg of every interval.
  Most apps get this wrong; here it is one toggle and the whole schedule moves.
- Triggers on **miles or time, whichever comes first** — and the app tells you which leg is driving it.
- Logging a service record that matches an interval **resets that interval automatically**.
- 12-month cost forecast so you can budget.
- Interference-engine / timing-belt warnings surfaced loudly.

### Diagnostics
- **Adapter abstraction from day one.** Every screen renders off `capabilities`, so an adapter
  that cannot do bidirectional control simply does not show those controls.
  - `Elm327BleAdapter` — ELM327 / STN11xx over Web Bluetooth
  - `DemoAdapter` — a recorded session, so you can develop and demo without a car
  - Topdon publishes no SDK, so **report import** covers that need instead: paste any Topdon,
    Autel or Launch export and every code in it lands in the vehicle's history with its J2012 definition.
- DTC timeline with **clear tracking** — "you have cleared P0420 three times" is the useful fact.
- Freeze frame captured and attached to the code.
- Live data with per-PID sparklines and session recording.
- Readiness monitors and a **drive-cycle assistant**.
- **Fuel trim interpretation**: lean at idle but fine at cruise is a vacuum leak; lean everywhere
  is fuel delivery. The number is not the signal — the difference between idle and cruise is.

### Money
Fuel and charge logs, real economy computed **tank-to-tank from full fills** (never typed in),
partial fills that extend the interval instead of corrupting it, cost per mile, true cost per
mile including depreciation, and a business mileage log at the IRS standard rate.

### Ownership
Warranty tracking (bumper-to-bumper, powertrain, federal 8yr/80k emissions, HV battery, extended
contracts) with expiry alerts, plus a document vault for title, registration, insurance and
emissions certificates — files stored in your own volume, not anyone's cloud.

### Wear tracking
Tire sets with tread depth history, wear-rate projection, rotation logging, DOT date age warnings
and TPMS IDs. Brake pad and rotor measurements over time with guide-pin diagnosis from the
inner/outer spread. Battery state of charge from rest voltage, CCA percentage and load test.

### Systems & diagrams
Five fully drawn, layered, clickable figures — brakes, cooling, fuel/EVAP, fuel-pump wiring,
and charging/starting. Toggle layers, zoom, tap a numbered callout balloon or the parts list
to open the component inspector with specs, torque, test procedure, common failures and part links.

### What needs attention

The differentiator is not another VIN decoder. It is a per-vehicle timeline that joins VIN facts,
federal safety data, scan data, maintenance evidence and real operating cost — **with the source
and confidence attached to every line**.

Four levels, sorted worst-first:

| Level | What lands here |
|---|---|
| **Critical** | Unremedied safety recall · open federal investigation · fault on a brake / steering / airbag / fire path · tires at 2/32 |
| **High** | Pending or permanent DTC · overdue on both time and mileage · failed battery test · pads under 3 mm |
| **Medium** | Repeated complaint cluster · TSB cluster on one component · economy far below EPA · warranty about to lapse |
| **Info** | Routine upcoming maintenance · broad patterns · rating context |

Every item shows `SOURCE` and `CONFIDENCE`. "31 owner complaints mention steering" is tagged
**LOW — unverified reports about the vehicle line, not a finding about your VIN**. A DTC read off
the car is tagged as the highest-confidence data in the app. That distinction is the product.

### Recall completion, modelled honestly

The free recalls API tells you a campaign **applies to a year/make/model**. It cannot tell you
whether **your VIN** was remedied. So those are separate facts:

```
campaign_applies      always true if it came back from NHTSA
completion_status     unknown | owner_marked_complete | verified
verification_method   nhtsa_vin_lookup | dealer_paperwork | service_record | owner_recollection
verified_at
evidence_note
```

Marking something `verified` **requires** a method, and the API rejects the attempt without one.
"Owner recollection" is explicitly not verification. A history report that says "verified" when it
means "the seller ticked a box" is worth nothing to a buyer, so the app refuses to blur them.

### Federal data on Vehicle Health

- **NHTSA investigations** — open and closed defect investigations for the vehicle line, shown as
  *Active federal investigation* with component, opening date and status. Often the earliest public
  signal that something systemic exists. Labelled as not-a-recall and not-a-finding.
- **Manufacturer communications (TSBs)** — bulletins, service campaigns, dealer notices and warranty
  extensions, clustered by component. Presented as **subject lines and context, not free repair
  instructions** — the full document is the manufacturer's copyrighted material, and a TSB does not
  mean the repair is covered.
- **NCAP safety ratings** — two-step lookup (find the tested variant, then pull its stars), clearly
  labelled as coverage for the *tested configuration*, not a VIN-specific assessment.
- **EPA fuel economy** — official city/highway/combined, annual fuel cost, CO₂, MPGe and range,
  matched by year/make/model/trim after the vPIC decode, and compared against your tank-to-tank
  average with an interpretation of the gap.
- **NWS weather rules** — only prompts that earn their place: freezing forecast against a marginal
  battery, a 25 °F swing against tire pressure, hail and flood alerts, rain forecast against tires
  already at 4/32.
- **DOE AFDC stations** — alt-fuel and charging stations, and only for vehicles that can use them.
  Runs on NREL's shared `DEMO_KEY`; set `AFDC_API_KEY` for a free personal key.

Every one of these caches server-side and degrades to "unavailable" rather than throwing. NHTSA's
non-vPIC endpoint paths are not formally documented, so each lookup tries a list of candidates and
remembers whichever works.

### Engine hours

Miles are the wrong unit for a diesel, a work truck, or anything that idles for a living. Log hours
and any interval can trigger on hours as well as miles and time — first leg to arrive wins. The app
computes your lifetime miles-per-hour and tells you when a mileage-only schedule is under-servicing
the engine (one hour of idle ≈ 25–33 miles of wear).

### Tools for the job

Every service and every diagram component has a tool list, grouped by kind — safety, lifting, hand,
power, measurement, specialty, fluids, consumables. Brand preference is **ICON** (hand tools) and
**Milwaukee** (cordless, lighting, test & measure), because that split is real rather than marketing.

Where neither makes the tool — spring compressors, smoke machines, ball joint presses, HV gloves —
the entry says **"Neither ICON nor Milwaukee makes this"** and names what to look for instead.
Several of those are free to borrow from a parts store loaner programme, which is usually the right
answer for a tool you will use twice. Tool *types*, never part numbers: brand line-ups change and a
stale SKU is worse than none. Tap any tool to record that you own it.

### Configuration-aware diagrams

The figures are drawn from the decoded VIN plus a configuration you confirm once:

- cylinder count sets the number of injectors on the fuel rail and the bores in the block
- V vs inline changes the block layout
- rear disc vs drum swaps the entire rear axle in the brake figure, and the parts list with it
- injection type relabels the rail: port, direct, or common-rail diesel
- EV relabels the cooling loop as battery and power electronics

vPIC does not report rear brake type, aspiration or injection, so the app asks instead of guessing,
and shows which fields came from the VIN versus from you. **These are representative of your
configuration, not VIN-exact factory illustrations** — that is licensed data. The footer says so and
points at ChiltonLibrary and EBSCO Auto Repair Source, free with a library card.

### Parts

**Store locator.** Real nearby AutoZone, O'Reilly, NAPA, Advance and Carquest — address, phone,
opening hours and distance — from OpenStreetMap via Overpass, cached server-side for two weeks.
Pin the ones you actually use; every part search then gives you a one-tap link into that chain's
catalogue with your vehicle prefilled, a `tel:` link and directions. Location comes from the
browser on `https`/`localhost`, or from a ZIP code anywhere else, and is remembered.

**Your own price history.** Log what you paid, where, and the part number. The app shows
low/average/high per part, and surfaces it the moment you search that part again. This is the
only parts-pricing data you own outright — no vendor can deprecate it.

**On live inventory, honestly:** AutoZone publishes no developer API. O'Reilly's First Call and
NAPA's PROLink do return real local stock, but both require a Professional account and integrate
through EDI or an aggregator such as PartsTech, whose base tier is free. If you get commercial
accounts, that connector slots in behind this screen without changing the UI. Scraping their
sites is not implemented and won't be — it breaks their terms and breaks constantly.

### Service catalogue

Logging work uses a picker of **190 services across 16 systems** — oil and engine, cooling, fuel
and air, ignition, emissions and exhaust, transmission and driveline, brakes, suspension and
steering, tires and wheels, electrical and charging, HVAC, body and glass, diagnostics, EV and
hybrid, modifications, and recall/warranty admin. Picking one sets the record's category
automatically. It's a `datalist` plus a grouped select, so you can type freely or browse — free
text is never blocked.

### Records & reports
- **Vehicle history packet** — the sale document. Service, odometer history with sources,
  recall status, tire and brake measurements.
- **Mechanic hand-off packet** — symptoms, codes, freeze frame, and what you already ruled out.
- **Annual cost summary** — spend by category, cost per mile, business mileage deduction, forecast.
- **Pre-purchase inspection checklist** — paperwork, cold start, scan, structure, drivetrain, fluids, electrics.
- **Warranty claim packet** — coverage plus the maintenance evidence a denial usually turns on.

Full JSON export of everything, always available. Data portability is not a feature request.

---

## Getting codes in from any scanner

Most consumer Bluetooth dongles are locked to one app and do not implement the generic ELM327
command set, so no web page can read from them on any platform. The Hyper Tough HT500 is an Innova
device and talks only to RepairSolutions2; BlueDriver, FIXD and Carly are the same arrangement.
Separately, **iOS has never exposed Web Bluetooth to any browser** — Chrome and Firefox on iPhone
are Safari underneath, so there is no browser workaround, only a native shell.

Rather than leave that as a dead end, the Diagnose screen carries three ways in:

| Route | Works with | Notes |
|---|---|---|
| **Type the codes** | anything with a screen | Decodes live as you type. About ten seconds. |
| **Upload the export** | PDF, CSV, TSV, JSON, XML, HTML, text | RepairSolutions2, Topdon, Autel, Launch, BlueDriver, Torque, Car Scanner, OBD Fusion |
| **Paste the text** | an emailed report, a share sheet | Finds codes in any layout |

PDF text extraction is hand-rolled in `server/pdftext.js` — content-stream parsing with
Flate, ASCII85, ASCIIHex and LZW filters. It follows the same reasoning as the ZIP reader in
`ingest.js`: a PDF library is tens of megabytes and a CVE feed to do a job that is a few hundred
lines when all you need is text. Nothing from the document is executed.

Two details that took more care than they look:

- The DTC pattern is **not** `\b[PCBU][0-3][0-9A-F]{3}\b`. That obvious version fails both ways —
  a VIN like `1FTEWC1ABC345XYZ7` contains a code-shaped substring and matches, while a PDF that
  positions words by kerning produces `P0301Cylinder1Misfire` where the trailing `\b` never
  matches and every code in the file is missed. Both cases are in the tests.
- A PDF that is a photograph of a scanner screen has no text objects. It says so and offers the
  manual route, rather than reporting "no codes found" as though it had read the file.

Descriptions are only ever repeated back when the report contained them. Where it did not, the
code is decoded against the SAE J2012 generic table and **labelled** — because P1xxx and most B, C
and U codes are manufacturer-specific, and a generic definition against one of those is a
plausible sentence describing a different fault.

Uploaded reports are parsed and discarded; the file is not retained.

## Charts, and the rule behind them

The analytics screen draws from your records and nothing else. There is no seeded demo data, no
interpolation to make a line continuous, and no forecast that is not labelled as one.

Four decisions are worth knowing about, because they cost something and were made deliberately:

**No charting library.** `charts.js` is hand-rolled SVG. The app has to work on a phone in a
garage with no signal, and a CDN is one more thing that can be unavailable at the worst moment.

**Monotone interpolation, not splines.** A plain cubic spline overshoots between data points. On a
fuel-economy chart that draws an MPG figure the vehicle never achieved; on an odometer chart it
can draw a dip that reads as a rollback. Monotone cubic interpolation is mathematically incapable
of leaving the range of its endpoints, and `charts.test.mjs` samples the curve between points to
prove the implementation actually has that property.

**No vehicle health score.** The gauges measure how complete *your records* are, and say so. A
single number purporting to describe a vehicle's condition would need inspection data the app
does not have. Related: a newly added vehicle reports **no** maintenance compliance figure rather
than 100%, because seeding the schedule stamps "last done today" — counting that as compliance
would be a green invented by the app about work nobody has done. Log one item and the number
starts meaning something.

**Implausible figures are flagged, never dropped or corrected.** A tank-to-tank calculation
outside a physics band (under 4 mpg, over 120) almost always means a missed fill-up or a typo. The
point is still plotted and still counted — it is marked `NEEDS VERIFICATION` with the likely cause
named. Dropping it would quietly rewrite your history; hiding it would let one typo drag the
average somewhere meaningless. Odometer readings lower than an earlier one get the same treatment.

Where a figure is derived rather than recorded it carries a source chip — `USER ENTERED`,
`IMPORTED`, `MANUAL VERIFIED`, `MANUFACTURER SPEC`, `CALCULATED`, `NHTSA REFERENCE`,
`NEEDS VERIFICATION` — and states its own basis in the panel footer.

Every chart is keyboard-reachable, carries an accessible summary, exposes a `DATA` button that
renders the same numbers as a table, and honours `prefers-reduced-motion`.

## Standards

No emoji, no generic app icons. Every symbol conforms to a published standard, so a technician
reads it without translating and the output matches a factory service manual.

| Standard | Where it shows up |
|---|---|
| **ISO 2575** | Tell-tale glyphs — oil, coolant, battery, brake, ABS, MIL, TPMS, SRS |
| **SAE J2402** | US adoption of the same tell-tale set |
| **SAE J1930** | Component names and acronyms — ECM, HO2S, ECT, CKP, MAF, EVAP, FP, TCM |
| **SAE J2012** | DTC format and definitions, including generic vs. manufacturer-specific scope |
| **SAE J1979** | OBD-II modes and PIDs — the live data panel shows the actual PID number |
| **SAE J1962** | 16-pin diagnostic link connector (the DLC glyph) |
| **ISO 15765-4** | Diagnostics over CAN, used for adapter capability labelling |
| **DIN 72552** | Terminal numbers on relays and switches — 30 / 31 / 15 / 50 / 61 / 85 / 86 / 87 |

Drawing conventions: numbered callout balloons keyed to a parts list, ladder layout with B+ on top
and ground on the bottom, wire legs annotated `PNK 16 GA · CKT 439`, and dual-unit specifications
throughout — lb-ft with N·m, °F with °C, psi with kPa.

---

## Data sources

Everything wired up is free, keyless and public. Server-side caching means the app answers from
your container even when the phone has no signal — garages are RF dead zones.

| Data | Source | Cost |
|---|---|---|
| VIN decode, ~140 fields | NHTSA vPIC | Free |
| Recalls (campaign, defect, risk, remedy) | NHTSA Recalls API | Free |
| Owner complaints, clustered by component and mileage band | NHTSA Complaints API | Free |
| Crash test ratings | NHTSA SafetyRatings | Free |
| EPA baseline fuel economy | fueleconomy.gov | Free |
| Generic DTC definitions | SAE J2012 generic set | Public |
| Terminal codes, tell-tale symbols | DIN 72552, ISO 2575 | Published standards |

Paid feeds — TecRMI / HaynesPro / MOTOR for per-VIN procedures, torque, fluids and wiring;
TecDoc or PartsTech for parts fitment — are deliberately **not** wired in. Where their data would
go, the app shows clearly-labelled sample values with a `SAMPLE` tag. Swapping a stub for a real
licensed feed means changing the tag and the source of one array; nothing else moves.

PartsTech has a genuine free tier and is the cheapest credible path to real part numbers when
you want them.

---

## Architecture

```
server/
  index.js     express app, static hosting, SPA fallback, healthcheck
  db.js        schema + migration runner, node:sqlite wrapper
  core.js      PURE domain logic — intervals, economy, warranty, DTC decode, fuel trim
  auth.js      accounts, sessions, garage membership, per-vehicle authorisation
  nhtsa.js     free reference data with cache-first / stale-fallback fetching
  api.js       the REST surface
public/
  index.html   app shell
  css/app.css  design tokens: light, dark, and garage mode from one variable set
  js/icons.js  ISO 2575 tell-tales + workshop glyphs, drawn as stroke paths
  js/ui.js     API client with offline mirror, formatting, modals, inline charts
  js/kb.js     component knowledge base (SAE J1930 names)
  js/obd.js    IAdapter, ELM327 BLE driver, demo adapter, J1979 PID decoders
  js/app.js    state, auth, routing, garage, vehicle health
  js/screens.js maintenance, money, ownership, wear, parts, records, reports
  js/diagrams.js systems, the five figures, symbol legend, component inspector
  js/diagnose.js the scanner screen
  js/charts.js   the telemetry drawing kit — line, gauge, donut, sparkline
  js/analytics-ui.js  the analytics dashboard
  js/wear-viz.js four-corner tires, brake meters, battery panel
  js/live-viz.js live-data trace viewer with zoom and annotations
  js/records-ui.js auto-save, torque module, timeline, command palette
server/
  analytics.js series builders — cost, fuel, odometer, spend, horizon, gauges
  records.js   torque specs, timeline, global search
test/
  lint.mjs     six static checks, each mapped to a bug that already shipped
  torque.test.mjs   tightening sequences against printed patterns
  charts.test.mjs   interpolation, downsampling, tick maths
  analytics.test.mjs  what the API refuses to claim
  render.test.mjs   boots the real page in jsdom and walks every screen
  smoke.mjs    end-to-end assertions (spawns its own server if none is given)
```

`analytics.js` sits beside `core.js`: it reads the database but makes no claim the records do not
support. `core.js` has no I/O, no express and no sqlite — it is the `packages/core` of the original
framework spec, and it is what the smoke test exercises hardest.

Two rules the schema enforces: every user-owned row carries `updated_at` and `device_id` so a
sync engine can be added without a migration, and reference data lives in separate tables from
user data so a provider can be wiped and re-ingested without touching anyone's records.

---

## Capability ceiling — stated here rather than in a support ticket

Generic OBD-II modes `$01`–`$0A` give you powertrain DTCs, live PIDs, freeze frame, readiness
monitors and Mode `$06` on every 1996+ vehicle. They do **not** give you ABS, SRS, TCM or BCM
modules, and they do not give you bidirectional tests. Those need manufacturer-specific UDS/KWP
addressing and DIDs — which is exactly the proprietary database you would be paying Autel or
Topdon for. The UI hides those controls rather than showing them broken.

**Web Bluetooth needs a secure context.** Chrome and Edge only allow it on `https://` or on
`http://localhost`. On the machine running the container, `http://localhost:2026` works. From
another device on your LAN you will need a reverse proxy with a certificate. Safari and iPadOS
never expose Web Bluetooth — on iPad the native Capacitor shell uses the same `IAdapter` interface
via `@capacitor-community/bluetooth-le`, and the report importer covers the gap in the meantime.

## Safety

This is repair guidance touching brakes, airbags, fuel and high-voltage systems. The app carries
safety interstitials on SRS, HV, fuel and vehicle-support content, refuses to implement any
bidirectional command that can move a component or deploy a device, and keeps an audit log of
what it told you and when. It is not a substitute for a qualified technician.

## Licence

Private project. Reference data from NHTSA and fueleconomy.gov is US Government work in the
public domain. No licensed repair-data content is reproduced anywhere in this codebase.
