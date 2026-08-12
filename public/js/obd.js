/* ============================================================
   obd.js — adapter abstraction, done on day one.

   Every screen renders off `capabilities`, so an adapter that
   cannot do bidirectional control simply does not show those
   controls. Topdon publishes no SDK, so the shipping path is:
     - Elm327BleAdapter   ELM327 / STN11xx over BLE (the recommendation)
     - DemoAdapter        recorded session, invaluable without a car
     - (importer)         Topdon report import lives on the server
   A TopdanAdapter can drop in later behind the same interface.

   Capability ceiling, stated in the UI rather than in a support
   ticket: generic OBD-II modes $01–$0A give powertrain DTCs, live
   PIDs, freeze frame, readiness monitors and Mode $06. It does NOT
   give ABS / SRS / TCM / BCM or bidirectional tests — those need
   manufacturer-specific UDS addressing and DIDs.
   ============================================================ */

/* ---------- SAE J1979 PID decoders ---------- */
const PIDS = {
  '04': { name: 'Calculated engine load', j1930: 'LOAD', unit: '%', bytes: 1, f: a => a[0] * 100 / 255 },
  '05': { name: 'Engine coolant temperature', j1930: 'ECT', unit: '°F', bytes: 1, f: a => (a[0] - 40) * 9 / 5 + 32 },
  '06': { name: 'Short term fuel trim, bank 1', j1930: 'STFT B1', unit: '%', bytes: 1, f: a => (a[0] - 128) * 100 / 128 },
  '07': { name: 'Long term fuel trim, bank 1', j1930: 'LTFT B1', unit: '%', bytes: 1, f: a => (a[0] - 128) * 100 / 128 },
  '08': { name: 'Short term fuel trim, bank 2', j1930: 'STFT B2', unit: '%', bytes: 1, f: a => (a[0] - 128) * 100 / 128 },
  '09': { name: 'Long term fuel trim, bank 2', j1930: 'LTFT B2', unit: '%', bytes: 1, f: a => (a[0] - 128) * 100 / 128 },
  '0A': { name: 'Fuel rail pressure (gauge)', j1930: 'FRP', unit: 'psi', bytes: 1, f: a => a[0] * 3 * 0.145038 },
  '0B': { name: 'Intake manifold absolute pressure', j1930: 'MAP', unit: 'kPa', bytes: 1, f: a => a[0] },
  '0C': { name: 'Engine speed', j1930: 'RPM', unit: 'rpm', bytes: 2, f: a => ((a[0] * 256) + a[1]) / 4 },
  '0D': { name: 'Vehicle speed', j1930: 'VSS', unit: 'mph', bytes: 1, f: a => a[0] * 0.621371 },
  '0E': { name: 'Timing advance', j1930: 'SPARKADV', unit: '°', bytes: 1, f: a => a[0] / 2 - 64 },
  '0F': { name: 'Intake air temperature', j1930: 'IAT', unit: '°F', bytes: 1, f: a => (a[0] - 40) * 9 / 5 + 32 },
  '10': { name: 'Mass air flow rate', j1930: 'MAF', unit: 'g/s', bytes: 2, f: a => ((a[0] * 256) + a[1]) / 100 },
  '11': { name: 'Throttle position', j1930: 'TP', unit: '%', bytes: 1, f: a => a[0] * 100 / 255 },
  '14': { name: 'O2 sensor 1, bank 1 voltage', j1930: 'HO2S11', unit: 'V', bytes: 2, f: a => a[0] / 200 },
  '15': { name: 'O2 sensor 2, bank 1 voltage', j1930: 'HO2S12', unit: 'V', bytes: 2, f: a => a[0] / 200 },
  '1F': { name: 'Run time since engine start', j1930: 'RUNTM', unit: 's', bytes: 2, f: a => (a[0] * 256) + a[1] },
  '21': { name: 'Distance travelled with MIL on', j1930: 'MIL_DIST', unit: 'mi', bytes: 2, f: a => ((a[0] * 256) + a[1]) * 0.621371 },
  '2F': { name: 'Fuel tank level input', j1930: 'FLI', unit: '%', bytes: 1, f: a => a[0] * 100 / 255 },
  '31': { name: 'Distance since codes cleared', j1930: 'CLR_DIST', unit: 'mi', bytes: 2, f: a => ((a[0] * 256) + a[1]) * 0.621371 },
  '33': { name: 'Absolute barometric pressure', j1930: 'BARO', unit: 'kPa', bytes: 1, f: a => a[0] },
  '42': { name: 'Control module voltage', j1930: 'VPWR', unit: 'V', bytes: 2, f: a => ((a[0] * 256) + a[1]) / 1000 },
  '43': { name: 'Absolute load value', j1930: 'LOAD_ABS', unit: '%', bytes: 2, f: a => ((a[0] * 256) + a[1]) * 100 / 255 },
  '46': { name: 'Ambient air temperature', j1930: 'AAT', unit: '°F', bytes: 1, f: a => (a[0] - 40) * 9 / 5 + 32 },
  '5C': { name: 'Engine oil temperature', j1930: 'EOT', unit: '°F', bytes: 1, f: a => (a[0] - 40) * 9 / 5 + 32 }
};

const DEFAULT_PIDS = ['0C', '0D', '05', '04', '06', '07', '10', '11', '0F', '42'];

/* ---------- DTC byte-pair decoding, SAE J2012 ---------- */
function dtcFromBytes(hi, lo) {
  if (hi === 0 && lo === 0) return null;
  const letter = ['P', 'C', 'B', 'U'][(hi >> 6) & 0x03];
  const d1 = (hi >> 4) & 0x03;
  const d2 = hi & 0x0F;
  const d3 = (lo >> 4) & 0x0F;
  const d4 = lo & 0x0F;
  return letter + d1 + d2.toString(16).toUpperCase() + d3.toString(16).toUpperCase() + d4.toString(16).toUpperCase();
}

/* ============================================================
   Base adapter
   ============================================================ */
class BaseAdapter {
  constructor() {
    this.id = 'base';
    this.label = 'Adapter';
    this.capabilities = new Set();
    this.connected = false;
    this.protocol = null;
    this.onLog = () => { };
  }
  can(c) { return this.capabilities.has(c); }
  log(s) { try { this.onLog(s); } catch { } }
  async connect() { throw new Error('not implemented'); }
  async disconnect() { }
  async readDTCs() { return []; }
  async readPID() { return null; }
  async readMonitors() { return null; }
  async readFreezeFrame() { return null; }
  async clearDTCs() { throw new Error('not supported'); }
}

/* ============================================================
   ELM327 / STN11xx over Bluetooth Low Energy

   iPadOS only allows BLE for third-party accessories — Bluetooth
   Classic SPP needs MFi certification, so classic ELM327 clones
   are out. Wi-Fi dongles work but hijack the network interface,
   which kills sync mid-session. BLE is the right target.
   ============================================================ */
const BLE_SERVICES = [
  0xfff0,                                          // Vgate iCar Pro, many generic clones
  0xffe0,                                          // HM-10 style modules
  0xfff1,
  '00001101-0000-1000-8000-00805f9b34fb',          // SPP UUID some modules advertise
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2'           // OBDLink-style vendor service
];

class Elm327BleAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'elm327-ble';
    this.label = 'ELM327 / STN11xx over BLE';
    this.capabilities = new Set(['dtc', 'live', 'freeze', 'mode06', 'clear', 'monitors']);
    // deliberately absent: 'bidirectional', 'nonPowertrain'
    this.device = null;
    this.rx = null;
    this.tx = null;
    this.buffer = '';
    this.pending = null;
  }

  static get supported() { return typeof navigator !== 'undefined' && !!navigator.bluetooth; }

  async connect() {
    if (!Elm327BleAdapter.supported) {
      throw new Error('This browser has no Web Bluetooth. Chrome or Edge on Windows/Android works; Safari and iPadOS do not expose it, so use the native shell or the report importer there.');
    }
    if (!window.isSecureContext) {
      throw new Error('Web Bluetooth needs a secure context. Open Garage on https://, or on http://localhost — a plain LAN IP over http will be blocked by the browser.');
    }
    this.log('Requesting device…');
    this.device = await navigator.bluetooth.requestDevice({
      filters: BLE_SERVICES.map(s => ({ services: [s] }))
        .concat([{ namePrefix: 'OBD' }, { namePrefix: 'VEEPEAK' }, { namePrefix: 'Vgate' }, { namePrefix: 'IOS-Vlink' }]),
      optionalServices: BLE_SERVICES
    });
    this.device.addEventListener('gattserverdisconnected', () => {
      this.connected = false;
      this.log('Adapter disconnected.');
      if (window.onAdapterState) window.onAdapterState();
    });

    const server = await this.device.gatt.connect();
    this.log('GATT connected, discovering services…');

    const services = await server.getPrimaryServices();
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      for (const c of chars) {
        if ((c.properties.notify || c.properties.indicate) && !this.rx) this.rx = c;
        if ((c.properties.write || c.properties.writeWithoutResponse) && !this.tx) this.tx = c;
      }
      if (this.rx && this.tx) break;
    }
    if (!this.rx || !this.tx) throw new Error('Found the adapter but not a readable/writable characteristic pair. This dongle may use a proprietary protocol.');

    await this.rx.startNotifications();
    this.rx.addEventListener('characteristicvaluechanged', e => this._onData(e.target.value));

    // ELM327 init sequence
    await this.cmd('ATZ', 2500);        // reset
    await this.cmd('ATE0');             // echo off
    await this.cmd('ATL0');             // linefeeds off
    await this.cmd('ATS0');             // spaces off
    await this.cmd('ATH0');             // headers off
    await this.cmd('ATSP0');            // auto protocol
    const proto = await this.cmd('ATDP', 3000);
    this.protocol = String(proto || '').replace(/[\r>]/g, '').trim() || 'auto';
    this.connected = true;
    this.log('Ready. Protocol: ' + this.protocol);
    return { protocol: this.protocol, name: this.device.name };
  }

  _onData(dv) {
    let s = '';
    for (let i = 0; i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(i));
    this.buffer += s;
    if (this.buffer.includes('>')) {
      const out = this.buffer.split('>')[0];
      this.buffer = '';
      if (this.pending) { const p = this.pending; this.pending = null; p.resolve(out); }
    }
  }

  async cmd(text, timeout) {
    if (!this.tx) throw new Error('Not connected.');
    const enc = new TextEncoder().encode(text + '\r');
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending = null; reject(new Error('Adapter timed out on ' + text)); }, timeout || 4000);
      this.pending = { resolve: v => { clearTimeout(t); resolve(v); }, reject };
      const write = this.tx.writeValueWithoutResponse
        ? this.tx.writeValueWithoutResponse(enc)
        : this.tx.writeValue(enc);
      write.catch(e => { clearTimeout(t); this.pending = null; reject(e); });
    });
  }

  _hexBytes(raw, expectMode) {
    const clean = String(raw || '').replace(/[\s\r\n>]/g, '').toUpperCase();
    if (/NODATA|UNABLETOCONNECT|STOPPED|ERROR|\?/.test(clean)) return null;
    const idx = clean.indexOf(expectMode);
    const body = idx >= 0 ? clean.slice(idx + expectMode.length) : clean;
    const out = [];
    for (let i = 0; i + 1 < body.length; i += 2) {
      const b = parseInt(body.substr(i, 2), 16);
      if (isNaN(b)) return out;
      out.push(b);
    }
    return out;
  }

  async readDTCs(kind) {
    const mode = { stored: '03', pending: '07', permanent: '0A' }[kind || 'stored'];
    const raw = await this.cmd(mode, 6000);
    const resp = { '03': '43', '07': '47', '0A': '4A' }[mode];
    const bytes = this._hexBytes(raw, resp);
    if (!bytes) return [];
    const codes = [];
    // Some ELMs prefix a count byte on CAN. Detect a plausible count.
    let start = 0;
    if (bytes.length % 2 === 1) start = 1;
    for (let i = start; i + 1 < bytes.length; i += 2) {
      const c = dtcFromBytes(bytes[i], bytes[i + 1]);
      if (c) codes.push({ code: c, status: kind || 'stored' });
    }
    return codes;
  }

  async readPID(pid) {
    const def = PIDS[pid];
    if (!def) return null;
    const raw = await this.cmd('01' + pid);
    const bytes = this._hexBytes(raw, '41' + pid);
    if (!bytes || bytes.length < def.bytes) return null;
    const value = def.f(bytes);
    return { pid, name: def.name, j1930: def.j1930, unit: def.unit, value: Math.round(value * 100) / 100 };
  }

  async readMonitors() {
    const raw = await this.cmd('0101');
    const b = this._hexBytes(raw, '4101');
    if (!b || b.length < 4) return null;
    const milOn = !!(b[0] & 0x80);
    const count = b[0] & 0x7F;
    const B = b[1], C = b[2], D = b[3];
    const st = (supported, incomplete) => supported ? (incomplete ? 'incomplete' : 'complete') : 'n/a';
    return {
      mil: milOn,
      dtcCount: count,
      monitors: [
        { id: 'misfire', name: 'Misfire', status: st(B & 0x01, B & 0x10) },
        { id: 'fuel', name: 'Fuel system', status: st(B & 0x02, B & 0x20) },
        { id: 'components', name: 'Comprehensive components', status: st(B & 0x04, B & 0x40) },
        { id: 'catalyst', name: 'Catalyst', status: st(C & 0x01, D & 0x01) },
        { id: 'heated_catalyst', name: 'Heated catalyst', status: st(C & 0x02, D & 0x02) },
        { id: 'evap', name: 'EVAP system', status: st(C & 0x04, D & 0x04) },
        { id: 'secondary_air', name: 'Secondary air', status: st(C & 0x08, D & 0x08) },
        { id: 'o2_sensor', name: 'Oxygen sensor', status: st(C & 0x20, D & 0x20) },
        { id: 'o2_heater', name: 'Oxygen sensor heater', status: st(C & 0x40, D & 0x40) },
        { id: 'egr', name: 'EGR / VVT', status: st(C & 0x80, D & 0x80) }
      ]
    };
  }

  async readFreezeFrame() {
    const out = {};
    for (const pid of ['0C', '0D', '05', '04', '11', '06', '07', '0B', '0F']) {
      try {
        const raw = await this.cmd('02' + pid + '00');
        const bytes = this._hexBytes(raw, '42' + pid);
        const def = PIDS[pid];
        if (bytes && def && bytes.length >= def.bytes) {
          out[def.j1930] = Math.round(def.f(bytes.slice(1)) * 100) / 100 + ' ' + def.unit;
        }
      } catch { /* a missing frame is normal */ }
    }
    return Object.keys(out).length ? out : null;
  }

  async clearDTCs() {
    await this.cmd('04', 6000);
    return true;
  }

  async disconnect() {
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch { }
    this.connected = false;
  }
}

/* ============================================================
   Demo adapter — a recorded session.
   Testing a scanner UI without a car in front of you is the
   difference between shipping and not shipping.
   ============================================================ */
class DemoAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'demo';
    this.label = 'Demo adapter (recorded session)';
    this.capabilities = new Set(['dtc', 'live', 'freeze', 'clear', 'monitors']);
    this.t = 0;
  }
  async connect() {
    await new Promise(r => setTimeout(r, 700));
    this.connected = true;
    this.protocol = 'ISO 15765-4 (CAN 11/500)';
    this.log('Demo adapter connected — replaying a recorded 2014 5.3L session.');
    return { protocol: this.protocol, name: 'Demo' };
  }
  async readDTCs(kind) {
    await new Promise(r => setTimeout(r, 400));
    if (kind === 'pending') return [{ code: 'P0300', status: 'pending' }];
    if (kind === 'permanent') return [{ code: 'P0455', status: 'permanent' }];
    return [{ code: 'P0420', status: 'stored' }, { code: 'P0171', status: 'stored' }];
  }
  async readPID(pid) {
    const def = PIDS[pid];
    if (!def) return null;
    this.t += 0.08;
    const wobble = Math.sin(this.t * (1 + pid.charCodeAt(1) % 5));
    const base = {
      '0C': 720 + wobble * 40, '0D': 0, '05': 197 + wobble * 2, '04': 21 + wobble * 3,
      '06': 3.9 + wobble * 2, '07': 11.7 + wobble * 0.6, '10': 4.2 + wobble * 0.5,
      '11': 14.5 + wobble, '0F': 88 + wobble, '42': 14.1 + wobble * 0.08,
      '0B': 38 + wobble * 2, '2F': 62, '33': 101, '1F': Math.round(this.t * 12)
    }[pid];
    return { pid, name: def.name, j1930: def.j1930, unit: def.unit, value: Math.round((base ?? 0) * 100) / 100 };
  }
  async readMonitors() {
    return {
      mil: true, dtcCount: 2,
      monitors: [
        { id: 'misfire', name: 'Misfire', status: 'complete' },
        { id: 'fuel', name: 'Fuel system', status: 'complete' },
        { id: 'components', name: 'Comprehensive components', status: 'complete' },
        { id: 'catalyst', name: 'Catalyst', status: 'complete' },
        { id: 'heated_catalyst', name: 'Heated catalyst', status: 'n/a' },
        { id: 'evap', name: 'EVAP system', status: 'incomplete' },
        { id: 'secondary_air', name: 'Secondary air', status: 'n/a' },
        { id: 'o2_sensor', name: 'Oxygen sensor', status: 'complete' },
        { id: 'o2_heater', name: 'Oxygen sensor heater', status: 'complete' },
        { id: 'egr', name: 'EGR / VVT', status: 'complete' }
      ]
    };
  }
  async readFreezeFrame() {
    return { RPM: '2180 rpm', VSS: '41 mph', ECT: '194 °F', LOAD: '38 %', 'STFT B1': '+4.7 %', 'LTFT B1': '+11.7 %', MAP: '46 kPa', IAT: '91 °F' };
  }
  async clearDTCs() { await new Promise(r => setTimeout(r, 500)); return true; }
  async disconnect() { this.connected = false; }
}

/* ---------- registry ---------- */
const ADAPTERS = {
  'elm327-ble': Elm327BleAdapter,
  'demo': DemoAdapter
};
let adapter = null;
