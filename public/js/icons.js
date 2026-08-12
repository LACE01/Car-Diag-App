/* ============================================================
   ICON SET
   ISO 2575 / SAE J2402 tell-tales plus workshop glyphs.
   Stroke paths on a 24x24 grid, currentColor, no emoji anywhere
   in this application. A technician should read every symbol
   without translating it.
   ============================================================ */
const ICONS = {
  /* --- ISO 2575 tell-tales --- */
  oil: '<path d="M4 12.2h8l5.6-3.1v2.1L13 13.7v2.4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M6.9 12.2v-2.1h3.1v2.1"/><path d="M16.2 14.7l1.6 2.7a1.9 1.9 0 1 1-3.2 0z" fill="currentColor"/>',
  temp: '<path d="M13.9 13.4V5.5a1.9 1.9 0 0 0-3.8 0v7.9a3.6 3.6 0 1 0 3.8 0z"/><path d="M2.5 20.6q1.6-1.9 3.2 0t3.2 0 3.2 0 3.2 0 3.2 0 3.2 0"/>',
  battery: '<rect x="2.6" y="7.6" width="18.8" height="9.6" rx="1.6"/><path d="M7 7.6V5.6h3.1v2M13.9 7.6v-2H17v2"/><path d="M6.1 12.4h3.4M7.8 10.7v3.4M14.5 12.4h3.4"/>',
  brake: '<circle cx="12" cy="12" r="5.1"/><path d="M12 9.2v3.4" stroke-width="2"/><path d="M12 15.1v.5" stroke-width="2"/><path d="M4.7 7.7a8.5 8.5 0 0 0 0 8.6M19.3 7.7a8.5 8.5 0 0 1 0 8.6"/>',
  abs: '<circle cx="12" cy="12" r="5.1"/><path d="M4.7 7.7a8.5 8.5 0 0 0 0 8.6M19.3 7.7a8.5 8.5 0 0 1 0 8.6"/><text x="12" y="13.9" text-anchor="middle" font-size="5" font-weight="700" fill="currentColor" stroke="none" font-family="Inter,sans-serif">ABS</text>',
  mil: '<path d="M3.3 12.6a1.8 1.8 0 0 1 1.8-1.8h1V8.6h3.2v2.2h1.9l2-2.2h2.3v2.2h1.2a2.6 2.6 0 0 1 2.6 2.6h1.5v2.4h-1.5a2.6 2.6 0 0 1-2.6 2.6H9.3l-2.1-2.1H5.1a1.8 1.8 0 0 1-1.8-1.8z"/>',
  tpms: '<path d="M4.9 19.1v-6.5a7.1 7.1 0 0 1 14.2 0v6.5"/><path d="M12 9.5v3.5" stroke-width="2"/><path d="M12 15.3v.5" stroke-width="2"/><path d="M2.7 21.5l2-1.7 2 1.7 2-1.7 2 1.7 2-1.7 2 1.7 2-1.7 2 1.7"/>',
  srs: '<circle cx="7.6" cy="6.6" r="2.1"/><path d="M4.6 19.4v-4.7a3.1 3.1 0 0 1 3.1-3.1h1.4l2.5 3.3"/><path d="M4.6 19.4h6.1"/><circle cx="16.8" cy="14.6" r="3.5"/>',
  fuel: '<path d="M4.2 20V6a2 2 0 0 1 2-2h4.4a2 2 0 0 1 2 2v14"/><path d="M2.8 20h11.2"/><rect x="6.1" y="6.6" width="4.6" height="3.6" rx=".6"/><path d="M12.6 9.4h3.1a1.6 1.6 0 0 1 1.6 1.6v5.1a1.6 1.6 0 0 0 3.2 0v-5.9l-1.9-1.9"/>',
  ac: '<path d="M12 2.8v18.4M4.1 7.4l15.8 9.2M19.9 7.4L4.1 16.6"/><path d="M9.7 5.1L12 7.4l2.3-2.3M9.7 18.9L12 16.6l2.3 2.3"/><path d="M4.5 11.1l.1-3.1 3.1-.9M19.5 12.9l-.1 3.1-3.1.9M19.5 11.1l-.1-3.1-3.1-.9M4.5 12.9l.1 3.1 3.1.9"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  /* --- workshop glyphs --- */
  wrench: '<path d="M20.4 4.5a5.4 5.4 0 0 1-6.7 6.7l-7.3 7.3a2.1 2.1 0 1 1-3-3l7.3-7.3a5.4 5.4 0 0 1 6.7-6.7l-2.9 2.9.8 2.9 2.9.8z"/>',
  dlc: '<path d="M3.4 8.4h17.2a1 1 0 0 1 1 1v3.5a2.1 2.1 0 0 1-2.1 2.1h-3.2l-1.4 2.4H9.1L7.7 15H4.5a2.1 2.1 0 0 1-2.1-2.1V9.4a1 1 0 0 1 1-1z"/><path d="M5.4 10.6h13.2M5.4 12.9h9.6" stroke-dasharray="1.1 1.5"/>',
  schematic: '<rect x="2.6" y="4.4" width="18.8" height="15.2" rx="2"/><path d="M6.2 9.4h3.3M14.5 9.4h3.3"/><rect x="9.5" y="7.7" width="5" height="3.4" rx=".5"/><path d="M6.2 15.2h11.6M12 11.1v4.1"/><circle cx="6.2" cy="15.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="17.8" cy="15.2" r="1.1" fill="currentColor" stroke="none"/>',
  hex: '<path d="M12 2.7l8.1 4.7v9.2L12 21.3l-8.1-4.7V7.4z"/><circle cx="12" cy="12" r="3.5"/>',
  clipboard: '<rect x="4.6" y="4.4" width="14.8" height="17" rx="2"/><path d="M9 4.4V3.2a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 3.2v1.2z"/><path d="M8.4 10.4h7.2M8.4 14h7.2M8.4 17.4h4"/>',
  garage: '<path d="M2.6 10.4L12 4l9.4 6.4V21H2.6z"/><path d="M6.6 21v-6.2h10.8V21M6.6 17.6h10.8"/>',
  menu: '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
  pin: '<path d="M12 21.5s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10.4" r="2.7"/>',
  alert: '<path d="M12 3.4l9.4 16.2H2.6z"/><path d="M12 9.7v4.2" stroke-width="2"/><path d="M12 16.4v.5" stroke-width="2"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  factory: '<path d="M2.8 21V11l6 3.6V11l6 3.6V7l6.4 3.7V21z"/><path d="M6.4 17.4h1.8M11.6 17.4h1.8M16.8 17.4h1.8"/>',
  money: '<circle cx="12" cy="12" r="9.2"/><path d="M12 6.4v11.2"/><path d="M14.9 9.1a3 3 0 0 0-2.9-1.4c-1.8 0-2.9.9-2.9 2.2s1 1.9 2.9 2.3 3 1 3 2.3-1.2 2.2-3 2.2a3.2 3.2 0 0 1-3.1-1.6"/>',
  doc: '<path d="M13.6 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.2z"/><path d="M13.6 2.8v5.4H19"/><path d="M8.6 13h6.8M8.6 16.4h4.4"/>',
  shield: '<path d="M12 2.6l7.6 3v5.6c0 4.8-3.1 8.6-7.6 10.2-4.5-1.6-7.6-5.4-7.6-10.2V5.6z"/><path d="M8.7 12.1l2.3 2.3 4.3-4.6"/>',
  tire: '<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="3.6"/><path d="M12 2.8v5.6M12 15.6v5.6M2.8 12h5.6M15.6 12h5.6"/>',
  chart: '<path d="M3.4 20.6h17.2"/><path d="M6.6 20.6V12M11 20.6V6.4M15.4 20.6v-5.8M19.8 20.6V9.2"/>',
  bell: '<path d="M18 8.6a6 6 0 1 0-12 0c0 6-2.4 7.8-2.4 7.8h16.8S18 14.6 18 8.6z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
  bolt: '<path d="M13.4 2.6L4.8 13.4h6L10.6 21.4 19.2 10.6h-6z"/>',
  bluetooth: '<path d="M7.2 7.4l9.6 9.2L12 21.4V2.6l4.8 4.8L7.2 16.6"/>',
  download: '<path d="M12 3.4v12"/><path d="M7.2 10.6L12 15.4l4.8-4.8"/><path d="M4 19.6h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  moon: '<path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.4 20.6a7.6 7.6 0 0 1 15.2 0"/>',
  /* --- vehicle body types (side profile) --- */
  v_sedan: '<path d="M2.4 16.2v-2.6a1.4 1.4 0 0 1 1.1-1.4l1.6-.3 2.4-3.2a2 2 0 0 1 1.6-.8h5.2a2 2 0 0 1 1.5.7l2.9 3.3 2.4.5a1.4 1.4 0 0 1 1.1 1.4v2.4z"/><path d="M7.2 11.9h9.6"/><circle cx="7.4" cy="16.6" r="2.2" fill="#fff"/><circle cx="16.6" cy="16.6" r="2.2" fill="#fff"/>',
  v_suv: '<path d="M2.4 16.2v-4.1a1.5 1.5 0 0 1 1.2-1.5l1.4-.3 2.2-2.7a2 2 0 0 1 1.5-.7h6.6a2 2 0 0 1 1.5.7l2.2 2.7 1.4.3a1.5 1.5 0 0 1 1.2 1.5v4.1z"/><path d="M6.4 10.4h11.2"/><circle cx="7.4" cy="16.6" r="2.2" fill="#fff"/><circle cx="16.6" cy="16.6" r="2.2" fill="#fff"/>',
  v_pickup: '<path d="M2.4 16.2v-3.4l1.3-.2 2.3-3.5a1.8 1.8 0 0 1 1.5-.8h4v4h9a1.5 1.5 0 0 1 1.5 1.5v2.4z"/><path d="M6.1 12.5h5.4"/><circle cx="7" cy="16.6" r="2.2" fill="#fff"/><circle cx="17" cy="16.6" r="2.2" fill="#fff"/>',
  v_van: '<path d="M2.4 16.2V9.8a1.6 1.6 0 0 1 1.6-1.6h13a2 2 0 0 1 1.6.8l2.6 3.4a1.6 1.6 0 0 1 .4 1v2.8z"/><path d="M12.2 8.2v4h9.2"/><circle cx="7" cy="16.6" r="2.2" fill="#fff"/><circle cx="17" cy="16.6" r="2.2" fill="#fff"/>',
  v_ev: '<path d="M2.4 16.2v-2.6a1.4 1.4 0 0 1 1.1-1.4l1.6-.3 2.4-3.2a2 2 0 0 1 1.6-.8h5.2a2 2 0 0 1 1.5.7l2.9 3.3 2.4.5a1.4 1.4 0 0 1 1.1 1.4v2.4z"/><circle cx="7.4" cy="16.6" r="2.2" fill="#fff"/><circle cx="16.6" cy="16.6" r="2.2" fill="#fff"/><path d="M12.9 8.6l-2.4 3.4h2.2l-1.4 2.6" stroke-width="1.4"/>'
};

function ic(name, size, extra) {
  const p = ICONS[name];
  if (!p) return '';
  const s = size || 20;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' + (extra || '') + '>' + p + '</svg>';
}
