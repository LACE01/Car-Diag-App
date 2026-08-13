/* ============================================================
   vehicle-art.js — technical vehicle outlines

   Proper side-profile line art on a 100x46 grid, not glyphs on a
   24x24 icon grid. Every body style carries the details that make a
   silhouette read as a specific vehicle: greenhouse split by a
   B-pillar, door shut lines, mirror, wheel arches cut into the
   rocker, wheels with hub and spokes, and a ground line.

   Drawn in currentColor as strokes, so they inherit the theme and
   scale cleanly from a 26px sidebar chip to a 150px hero.
   ============================================================ */

/* wheel with arch, hub and spokes */
function _wheel(cx, cy, r) {
  const spokes = [0, 60, 120].map(a => {
    const rad = a * Math.PI / 180;
    const x1 = (cx + Math.cos(rad) * (r - 1.2)).toFixed(1), y1 = (cy + Math.sin(rad) * (r - 1.2)).toFixed(1);
    const x2 = (cx - Math.cos(rad) * (r - 1.2)).toFixed(1), y2 = (cy - Math.sin(rad) * (r - 1.2)).toFixed(1);
    return `<path d="M${x1} ${y1}L${x2} ${y2}" opacity=".45"/>`;
  }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${cx}" cy="${cy}" r="${(r * .42).toFixed(1)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="1" fill="currentColor" stroke="none"/>${spokes}`;
}
const _ground = '<path d="M2 44h96" opacity=".28"/>';

const VEHICLE_ART = {
  /* ---- crew-cab heavy-duty pickup: the F-350 shape ---- */
  v_pickup: {
    label: 'Crew cab pickup',
    art:
      /* body outline with the arches cut in */
      '<path d="M4 36 L4 29 Q4 26.5 6.5 26 L12.5 25 L18 15 Q19.2 12.8 21.8 12.8 L50 12.8 Q52.6 12.8 53.8 15 L58.5 25 L61 25 L61 20 L94 20 L94 29 L97 29 L97 36 L88 36' +
      ' A9 9 0 0 0 70 36 L38 36 A9 9 0 0 0 20 36 Z"/>' +
      /* greenhouse: windshield, front door glass, rear door glass */
      '<path d="M22.5 15.2 L19.8 24 L34 24 L34 15.2 Z" opacity=".55"/>' +
      '<path d="M36.5 15.2 L36.5 24 L50 24 L47.5 15.2 Z" opacity=".55"/>' +
      /* door shut lines and handles */
      '<path d="M35.2 24.4 V35.6 M49.5 24.4 V35.6" opacity=".5"/>' +
      '<path d="M30 27.5h4 M44 27.5h4" opacity=".5"/>' +
      /* bed: rail, stake pockets, tailgate */
      '<path d="M61 20 H94" opacity=".6"/>' +
      '<path d="M68 20v2.4 M76 20v2.4 M84 20v2.4" opacity=".35"/>' +
      '<path d="M92.5 20 V29" opacity=".5"/>' +
      /* tow mirror + grille + rocker */
      '<path d="M19.5 16.5 l-4 .8 v3 l4-.6" opacity=".7"/>' +
      '<path d="M4.5 28 h7" opacity=".5"/>' +
      '<path d="M20 36 h18 M70 36 h18" opacity=".35"/>' +
      _wheel(29, 36, 8.4) + _wheel(79, 36, 8.4) + _ground
  },

  /* ---- SUV ---- */
  v_suv: {
    label: 'SUV',
    art:
      '<path d="M5 36 L5 28 Q5 25.5 7.5 25 L13 24 L19 14 Q20.2 12 22.6 12 L76 12 Q78.6 12 79.6 14.2 L84 24 L90 25 Q93 25.6 93 28.2 L93 36 L84 36' +
      ' A9 9 0 0 0 66 36 L38 36 A9 9 0 0 0 20 36 Z"/>' +
      '<path d="M23.5 14.4 L20.8 23.4 L36 23.4 L36 14.4 Z" opacity=".55"/>' +
      '<path d="M38.5 14.4 V23.4 H55 V14.4 Z" opacity=".55"/>' +
      '<path d="M57.5 14.4 V23.4 H72 L69.5 14.4 Z" opacity=".55"/>' +
      '<path d="M37.2 23.8 V35.6 M56.5 23.8 V35.6" opacity=".5"/>' +
      '<path d="M31 27h4 M50 27h4" opacity=".5"/>' +
      '<path d="M20.5 15.5 l-4 .8 v3 l4-.6" opacity=".7"/>' +
      '<path d="M22 11.4 H74" opacity=".35"/>' +
      _wheel(29, 36, 8.4) + _wheel(75, 36, 8.4) + _ground
  },

  /* ---- sedan ---- */
  v_sedan: {
    label: 'Sedan',
    art:
      '<path d="M4 36 L4 30 Q4 27.5 6.5 27 L15 25.5 L26 16.5 Q27.8 15 30.4 15 L64 15 Q67 15 68.8 16.6 L79 25.5 L90 27 Q93.5 27.6 93.5 30.2 L93.5 36 L84 36' +
      ' A8.6 8.6 0 0 0 67 36 L37 36 A8.6 8.6 0 0 0 20 36 Z"/>' +
      '<path d="M31 17.2 L26.4 24.6 L45 24.6 L45 17.2 Z" opacity=".55"/>' +
      '<path d="M47.5 17.2 V24.6 H68 L62.5 17.2 Z" opacity=".55"/>' +
      '<path d="M46.2 25 V35.4" opacity=".5"/>' +
      '<path d="M39 28h4.5 M56 28h4.5" opacity=".5"/>' +
      '<path d="M26 18.4 l-4.5 1 v2.6 l4-.6" opacity=".7"/>' +
      '<path d="M4.6 29.5 h8" opacity=".5"/>' +
      _wheel(28.5, 36, 8) + _wheel(75.5, 36, 8) + _ground
  },

  /* ---- van ---- */
  v_van: {
    label: 'Van',
    art:
      '<path d="M5 36 L5 16 Q5 13 8.4 13 L74 13 Q77 13 78.8 15.2 L90 27 Q93 28.4 93 31 L93 36 L84 36' +
      ' A8.6 8.6 0 0 0 67 36 L34 36 A8.6 8.6 0 0 0 17 36 Z"/>' +
      '<path d="M62 15.4 V25.6 H78 L69 15.4 Z" opacity=".55"/>' +
      '<path d="M42 15.4 V25.6 H58 V15.4 Z" opacity=".55"/>' +
      '<path d="M40.5 15 V35.6" opacity=".5"/>' +
      '<path d="M60.5 15 V35.6" opacity=".5"/>' +
      '<path d="M52 28.5h5" opacity=".5"/>' +
      '<path d="M60 16.6 l-4.5 1 v2.6 l4-.6" opacity=".7"/>' +
      _wheel(25.5, 36, 8) + _wheel(75.5, 36, 8) + _ground
  },

  /* ---- EV: sedan profile, charge port, short hood ---- */
  v_ev: {
    label: 'Electric',
    art:
      '<path d="M4 36 L4 30 Q4 27.4 6.6 27 L14 25.8 L24 16 Q25.8 14.2 28.6 14.2 L66 14.2 Q69 14.2 70.6 16.2 L80 25.8 L90 27 Q93.5 27.6 93.5 30.2 L93.5 36 L84 36' +
      ' A8.6 8.6 0 0 0 67 36 L37 36 A8.6 8.6 0 0 0 20 36 Z"/>' +
      '<path d="M29.5 16.4 L24.6 24.8 L46 24.8 L46 16.4 Z" opacity=".55"/>' +
      '<path d="M48.5 16.4 V24.8 H70 L64 16.4 Z" opacity=".55"/>' +
      '<path d="M47.2 25.2 V35.4" opacity=".5"/>' +
      '<path d="M38 28.4h4.5 M57 28.4h4.5" opacity=".5"/>' +
      /* charge port with a bolt */
      '<circle cx="87" cy="24" r="3.6" opacity=".8"/>' +
      '<path d="M88 22.1 l-1.9 2.5h1.7l-1.2 2.1" opacity=".95"/>' +
      _wheel(28.5, 36, 8) + _wheel(75.5, 36, 8) + _ground
  }
};

/**
 * Render a vehicle outline.
 *   vart('v_pickup', 140)   → detailed art
 * Falls back to the small glyph set for anything not drawn here.
 */
function vart(name, size, extra) {
  const v = VEHICLE_ART[name] || VEHICLE_ART.v_sedan;
  const s = size || 96;
  return '<svg width="' + s + '" height="' + (s * 46 / 100).toFixed(0) + '" viewBox="0 0 100 46" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
    (extra || '') + '>' + v.art + '</svg>';
}

/** Pick the right body style from what the VIN decode told us. */
function artFor(vehicle) {
  if (!vehicle) return 'v_sedan';
  if (vehicle.is_ev) return 'v_ev';
  const b = String(vehicle.body || '').toLowerCase();
  const m = String(vehicle.model || '').toLowerCase();
  if (b.includes('pickup') || /f-?[123]50|silverado|sierra|ram|tacoma|tundra|titan|colorado|canyon|ranger|frontier/.test(m)) return 'v_pickup';
  if (b.includes('van') || b.includes('minivan')) return 'v_van';
  if (b.includes('sport utility') || b.includes('suv') || b.includes('wagon') || b.includes('crossover')) return 'v_suv';
  if (b.includes('sedan') || b.includes('coupe') || b.includes('hatchback') || b.includes('convertible')) return 'v_sedan';
  return VEHICLE_ART[vehicle.icon] ? vehicle.icon : 'v_sedan';
}
