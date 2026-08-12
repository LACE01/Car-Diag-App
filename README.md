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
test/smoke.mjs end-to-end assertions
```

`core.js` has no I/O, no express and no sqlite — it is the `packages/core` of the original
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
