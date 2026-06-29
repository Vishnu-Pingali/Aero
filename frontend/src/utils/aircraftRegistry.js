// ─── utils/aircraftRegistry.js ────────────────────────────────────────────────
//
// Aircraft marker SVG registry for Aero flight tracker.
//
// ATTRIBUTION & LICENSE:
//   SVG silhouettes are sourced verbatim from dump1090-fa by FlightAware
//   (https://github.com/flightaware/dump1090), licensed under the BSD 3-Clause
//   License. The ICAO type-designator mapping table is also derived from that
//   project's markers.js.
//
//   © FlightAware LLC — https://github.com/flightaware/dump1090/blob/master/LICENSE
//
// OVERVIEW:
//   The SVG shapes use placeholder tokens that are replaced at render time:
//     - `aircraft_color_fill`   → CSS fill color (phase color or selected)
//     - `aircraft_color_stroke` → CSS stroke/outline color
//     - `add_stroke_selected`   → extra attrs when aircraft is selected
//
//   getSvgForFlight(flight) is the primary export. It resolves the ICAO type
//   code to a shape using a three-tier lookup (exact designator → type class →
//   category code) and injects the current render colors.
// ──────────────────────────────────────────────────────────────────────────────

// ─── Raw SVG shapes (verbatim from dump1090-fa markers.js, BSD-3-Clause) ──────
// Colors use placeholder tokens replaced by renderSvg() below.
const SHAPES = {
  // Standard commercial airliner (narrowbody with swept wings, e.g. B737, A320)
  airliner: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 26" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M12.51,25.75c-.26,0-.74-.71-.86-1.41l-3.33.86L8,25.29l.08-1.41.11-.07c1.13-.68,2.68-1.64,3.2-2-.37-1.06-.51-3.92-.43-8.52v0L8,13.31C5.37,14.12,1.2,15.39,1,15.5a.5.5,0,0,1-.21,0,.52.52,0,0,1-.49-.45,1,1,0,0,1,.52-1l1.74-.91c1.36-.71,3.22-1.69,4.66-2.43a4,4,0,0,1,0-.52c0-.69,0-1,0-1.14l.25-.13H7.16A1.07,1.07,0,0,1,8.24,7.73,1.12,1.12,0,0,1,9.06,8a1.46,1.46,0,0,1,.26.87L9.08,9h.25c0,.14,0,.31,0,.58l1.52-.84c0-1.48,0-7.06,1.1-8.25a.74.74,0,0,1,1.13,0c1.15,1.19,1.13,6.78,1.1,8.25l1.52.84c0-.32,0-.48,0-.58l.25-.13H15.7A1.46,1.46,0,0,1,16,8a1.11,1.11,0,0,1,.82-.28,1.06,1.06,0,0,1,1.08,1.16V9c0,.19,0,.48,0,1.17a4,4,0,0,1,0,.52c1.75.9,4.4,2.29,5.67,3l.73.38a.9.9,0,0,1,.5,1,.55.55,0,0,1-.5.47h0l-.11,0c-.28-.11-4.81-1.49-7.16-2.2H14.06v0c.09,4.6-.06,7.46-.43,8.52.52.33,2.07,1.29,3.2,2l.11.07L17,25.29l-.33-.09-3.33-.86c-.12.7-.6,1.41-.86,1.41h0Z"/><path class="cls-2" d="M12.51.5C13.93.5,14,7,13.93,8.91c.3.16,1.64.91,2,1.1,0-.6,0-.85,0-1s0-.09,0-.13a1.18,1.18,0,0,1,.19-.7A.88.88,0,0,1,16.78,8h0a.82.82,0,0,1,.83.91s0,.07,0,.13,0,.44,0,1.17a3.21,3.21,0,0,1-.06.66c2.33,1.19,6.51,3.39,6.56,3.42.59.3.4,1,.11,1h-.07c-.37-.14-7.18-2.21-7.18-2.21l-3.18,0c0,.22.22,7.56-.48,8.91,0,0,2,1.26,3.39,2.08l.06.93L13.15,24a2.14,2.14,0,0,1-.64,1.47A2.14,2.14,0,0,1,11.87,24L8.26,25,8.31,24c1.38-.82,3.39-2.08,3.39-2.08-.7-1.35-.48-8.69-.48-8.91L8,13.06S1.17,15.13.86,15.27l-.11,0c-.32,0-.43-.73.14-1S5.13,12,7.46,10.85a3.21,3.21,0,0,1-.06-.66c0-.73,0-1,0-1.17s0-.09,0-.13A.82.82,0,0,1,8.24,8h0a.88.88,0,0,1,.65.21,1.18,1.18,0,0,1,.19.7s0,.07,0,.13,0,.39,0,1c.36-.19,1.71-.94,2-1.1C11.05,7,11.09.5,12.51.5Z"/></g></g></svg>`,

  // Wide-body heavy twin-engine (e.g. B767, B777, B787, A330, A350)
  heavy_2e: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 29" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M9,28.35c0-.16-.17-1,.23-1.36.65-.59,2.82-2.38,3.4-2.86-.51-1.33-.59-5.15-.57-8.22L10,16,.25,19v-.34a1.78,1.78,0,0,1,.82-1.5l7.78-5.07a4.87,4.87,0,0,1-.51-3l0-.22.23,0h2.26l0,.22a8.32,8.32,0,0,1,0,1.81l1.21-.81c0-6.79.18-9.58,1.91-9.87,1.7.14,2,3,2,9.85L17.3,11a8.3,8.3,0,0,1,0-1.8l0-.22h2.51v.24a4.87,4.87,0,0,1-.51,3l7.66,5a1.77,1.77,0,0,1,.8,1.5V19L18,16l-2-.06c0,3.06-.06,6.88-.57,8.21a28.87,28.87,0,0,1,3.5,3A2,2,0,0,1,19,28.34l-.05.31L14.6,26.71c-.14,1.85-.41,1.85-.6,1.85s-.47,0-.6-1.84L9,28.66Z"/><path class="cls-2" d="M14,.5c1.43.13,1.69,3,1.69,9.73l2.06,1.39a5.43,5.43,0,0,1-.24-2.39h2s.26,2.07-.62,3c0,0,7.84,5.12,7.9,5.15a1.54,1.54,0,0,1,.68,1.28l-9.46-3-2.35-.08c0,.23.13,7.12-.62,8.54a34.46,34.46,0,0,1,3.59,3.08,1.86,1.86,0,0,1,.1,1l-4.39-2c-.07,1.16-.21,2-.38,2s-.31-.81-.38-2l-4.4,2s-.17-.84.16-1.13c.74-.67,3.54-3,3.54-3-.75-1.43-.62-8.31-.62-8.54L10,15.73l-9.46,3a1.54,1.54,0,0,1,.68-1.28c.06,0,8-5.24,8-5.24-.88-1-.62-3-.62-3h2a5.43,5.43,0,0,1-.24,2.39l1.91-1.28c0-6.74.17-9.5,1.7-9.76Z"/></g></g></svg>`,

  // Quad-engine heavy (e.g. B747, A380, B-52, A340)
  heavy_4e: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 30" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M14,29.62c-.23,0-.52-.16-.71-1.33L8.82,29.58V28l3.56-3.52c-.41-1.51-.4-7.57-.4-9.11L8.46,16.59,1.27,20.76l-1,1.68,0-.91c0-2.28.23-2.45.3-2.52s.59-.51,3.5-3.09A10.47,10.47,0,0,1,4,13l0-.22.23,0H6.16v.23a11.63,11.63,0,0,1,0,1.26c.74-.68,1.36-1.28,1.69-1.61a9.54,9.54,0,0,1-.16-3.15l0-.22.23-.05H9.87v.23a11.49,11.49,0,0,1,0,1.31l.87-.84c.67-.66,1.06-1,1.27-1.19,0-6.24.53-8.46,2-8.46,1.23,0,2,1.42,2,8.46.21.17.59.53,1.27,1.19l.88.85a11.45,11.45,0,0,1,0-1.32V9.19h2.18v.24a9.53,9.53,0,0,1-.15,3.18c.33.32.95.93,1.69,1.61a11.5,11.5,0,0,1,0-1.27v-.23H24V13a10.49,10.49,0,0,1-.1,3L27.4,19c.09.09.28.26.32,2.54l0,.91-1-1.68L19.5,16.57,16,15.34c0,1.53.07,7.49-.39,9.11L19.18,28v1.61l-4.46-1.29C14.52,29.46,14.23,29.62,14,29.62Z"/><path class="cls-2" d="M14,.49c1.08,0,1.75,1.61,1.75,8.34.27.14,2.06,2,2.73,2.54a9,9,0,0,1-.11-1.94h1.7a9.4,9.4,0,0,1-.19,3.25c.37.37,1.26,1.24,2.3,2.17a9.25,9.25,0,0,1-.1-1.89h1.7A10.3,10.3,0,0,1,23.66,16c1.81,1.61,3.57,3.16,3.6,3.18a11.25,11.25,0,0,1,.22,2.35l-.57-1-7.28-4.22L15.76,15s.15,8-.41,9.52l3.59,3.55v1.18L14.51,28c-.11.85-.3,1.4-.51,1.4s-.4-.55-.51-1.39L9.06,29.26V28.07l3.59-3.55c-.51-1.28-.43-9.52-.43-9.52L8.37,16.36,1.1,20.58l-.57,1a11.25,11.25,0,0,1,.22-2.35S2.53,17.61,4.35,16a10.32,10.32,0,0,1-.12-3h1.7a9.29,9.29,0,0,1-.1,1.88c1-.93,1.93-1.8,2.3-2.17a9.43,9.43,0,0,1-.19-3.24h1.7a9,9,0,0,1-.11,1.93C10.21,10.8,12,9,12.25,8.83c0-6.73.62-8.34,1.75-8.34Z"/></g></g></svg>`,

  // Business jet with swept wings (e.g. CRJ, E145, Gulfstream)
  jet_swept: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 24" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M9.44,23c-.1.6-.35.6-.44.6s-.34,0-.44-.6l-3,.67V22.6A.54.54,0,0,1,6,22.05l2.38-1.12L8,19.33H6.69l0-.2a8.23,8.23,0,0,1-.14-3.85l.06-.18H7.73V13.19h-2L.26,14.29v-.93c0-.28.07-.46.22-.53l7.25-3.6V3.85A4.47,4.47,0,0,1,8.83.49L9,.34l.17.15a4.47,4.47,0,0,1,1.1,3.36V9.23l7.25,3.6c.14.07.22.25.22.53v.93l-5.51-1.1h-2V15.1h1.17l.06.18a8.24,8.24,0,0,1-.15,3.84l0,.2H10l-.36,1.6,2.43,1.14a.52.52,0,0,1,.35.53v1.08Z"/><path class="cls-2" d="M9,.68a4.25,4.25,0,0,1,1,3.16V9.39l7.4,3.67s.07,0,.07.3V14l-5.2-1H10v2.42h1.24a8,8,0,0,1-.15,3.72H9.79l-.45,2L12,22.3a.28.28,0,0,1,.2.3v.76l-3-.66s0,.66-.21.66-.21-.66-.21-.66l-3,.66V22.6a.28.28,0,0,1,.2-.3l2.62-1.23-.45-2H6.9a8,8,0,0,1-.15-3.72H8V12.93H5.71L.52,14v-.62c0-.26.07-.3.07-.3L8,9.39V3.85A4.25,4.25,0,0,1,9,.68Z"/></g></g></svg>`,

  // Business/regional jet with non-swept (straight) wings (e.g. Cessna Citation, Learjet)
  jet_nonswept: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M9,17.09l-3.51.61v-.3c0-.65.11-1,.33-1.09L8.5,15a5.61,5.61,0,0,1-.28-1.32l-.53-.41-.1-.69H7.12l0-.21a7.19,7.19,0,0,1-.15-2.19L.24,9.05V8.84c0-1.1.51-1.15.61-1.15L7.8,7.18V2.88C7.8.64,8.89.3,8.93.28L9,.26l.07,0s1.13.36,1.13,2.6v4.3l7,.51c.09,0,.59.06.59,1.15v.21l-6.69,1.16a7.17,7.17,0,0,1-.15,2.19l0,.21h-.47l-.1.69-.53.41A5.61,5.61,0,0,1,9.5,15l2.74,1.28c.2.07.31.43.31,1.08v.3Z"/><path class="cls-2" d="M9,.53s1,.28,1,2.35V7.41l7.19.53h0s.36,0,.36.9L10.78,10a5,5,0,0,1-.1,2.35H10.2l-.12.8-.54.42a4.88,4.88,0,0,1-.35,1.59l2.95,1.38s.16.06.17.85L9,16.84l-3.31.56c0-.79.17-.85.17-.85l2.95-1.38a4.88,4.88,0,0,1-.35-1.59l-.54-.42-.12-.8H7.32A5,5,0,0,1,7.22,10L.49,8.84c0-.88.33-.9.36-.9h0L8,7.41V2.88C8,.81,9,.53,9,.53Z"/></g></g></svg>`,

  // High-performance military jet / supersonic (e.g. F-15, F-22, Concorde)
  hi_perf: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 21" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M3.14,20.76v-1.6l2.57-1.7V16.1H.26V12.25H1.61v1.17L5.28,9.9c.14-1.16,1-8.19,2-9.3L7.5.38l.2.22c1,1.12,1.89,8.14,2,9.3l3.67,3.52V12.25h1.35V16.1H9.29v1.35l2.57,1.7v1.6Z"/><path class="cls-2" d="M7.5.76c1,1.12,2,9.26,2,9.26l4.17,4V12.5h.84v3.36H9v1.72l2.57,1.7v1.23H3.4V19.28L6,17.58V15.86H.51V12.5h.84V14l4.17-4s1-8.13,2-9.26Z"/></g></g></svg>`,

  // Helicopter / rotorcraft
  helicopter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 18" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M8,17.75c-1.38,0-2.46-.63-2.46-1.43,0-.6.58-1.1,1.49-1.32V12.06A5.27,5.27,0,0,1,6,9.53L1.1,13.6l-.75-1L5.78,8.09c0-.25,0-.51,0-.77a12.28,12.28,0,0,1,.09-1.49L.38,1.24l.7-.89,5,4.2C6.48,3,7.17,2.1,8,2.1s1.52,1,1.91,2.57l5-4.21.75,1L10.1,6.07a12.4,12.4,0,0,1,.06,1.24c0,.22,0,.44,0,.65l5.47,4.59-.7.89L10,9.31a8.44,8.44,0,0,1-.35,1.4,3.83,3.83,0,0,1-.55,1.11L9,12v3c.91.22,1.49.72,1.49,1.32C10.46,17.12,9.38,17.75,8,17.75Z"/><path class="cls-2" d="M1.12.71,6.23,5c.33-1.57,1-2.65,1.73-2.65S9.4,3.48,9.72,5.12L14.87.82l.45.57L9.84,6a12.18,12.18,0,0,1,.08,1.35c0,.26,0,.51,0,.76l5.38,4.51-.39.5L9.82,8.84a8.75,8.75,0,0,1-.41,1.78,3.58,3.58,0,0,1-.52,1l-.18.22V15.2c.87.16,1.49.6,1.49,1.11S9.22,17.5,8,17.5,5.78,17,5.78,16.32s.62-1,1.49-1.11V12A5.26,5.26,0,0,1,6.13,9.07l-5,4.18-.45-.57L6,8.2c0-.29,0-.58,0-.89a12,12,0,0,1,.1-1.59L.73,1.21Z"/></g></g></svg>`,

  // Light piston / single-engine (e.g. Cessna 172, Piper)
  cessna: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 13" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M8.51,12.75c-.17,0-2-.27-2.56-.35A.41.41,0,0,1,5.6,12V10.87a.41.41,0,0,1,.32-.4l1.81-.37L7.36,6.64H4.75L.6,6a.41.41,0,0,1-.35-.41V4a.41.41,0,0,1,.38-.41l4.09-.28h2.6v-.4l.25,0-.24-.08c0-.21.1-.76.12-1.06A.9.9,0,0,1,8,.94L8.12.54A.41.41,0,0,1,8.5.25a.4.4,0,0,1,.39.29L9,.95a.91.91,0,0,1,.53.75c0,.33.11,1,.13,1.11v.46h2.57l4.12.28a.41.41,0,0,1,.38.41V5.63A.41.41,0,0,1,16.4,6l-4.1.59H9.64L9.26,10.1l1.81.36a.41.41,0,0,1,.32.4V12a.41.41,0,0,1-.34.41c-.56.08-2.37.35-2.55.35Z"/><path class="cls-2" d="M8.5.5a.15.15,0,0,1,.15.11l.16.52a.68.68,0,0,1,.49.58c0,.34.11,1,.13,1.12a.16.16,0,0,1,0,0v.65h2.83l4.09.28A.16.16,0,0,1,16.5,4V5.63a.16.16,0,0,1-.13.16l-4.1.59H9.41L9,10.3l2,.41a.16.16,0,0,1,.12.16V12a.16.16,0,0,1-.13.16s-2.33.35-2.51.35h0c-.17,0-2.53-.35-2.53-.35A.16.16,0,0,1,5.85,12V10.87A.16.16,0,0,1,6,10.71l2-.41L7.59,6.39H4.73L.63,5.79A.16.16,0,0,1,.5,5.63V4A.16.16,0,0,1,.64,3.8l4.09-.28H7.57V2.87a.21.21,0,0,1,0,0c0-.15.1-.79.13-1.12a.68.68,0,0,1,.49-.58L8.36.61A.16.16,0,0,1,8.5.5Z"/></g></g></svg>`,

  // Twin-engine turboprop (large) — e.g. ATR-72, Q400, Hercules
  twin_large: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 20" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M10.1,18.34H7l0-.21c-.08-.54,0-.87.11-1L7.19,17l.2,0,2.35-.33c-.16-.82-.42-2.9-.42-3.14s0-2.71,0-3.51H8c-.12,1.34-.41,1.36-.55,1.37h0c-.19,0-.46,0-.6-1.55L.27,9.52l0-.25c.06-.73.31-.9.45-.93l6-.48a3.65,3.65,0,0,1,.3-2,.45.45,0,0,1,.32-.16h0a.39.39,0,0,1,.3.12A3.67,3.67,0,0,1,8,7.77l1.26-.07c0-.71,0-2.92,0-4.48A3.84,3.84,0,0,1,10.1.4a.4.4,0,0,1,.28-.16h.23A.4.4,0,0,1,10.9.4a3.84,3.84,0,0,1,.87,2.81c0,1.55,0,3.77,0,4.48L13,7.77a3.67,3.67,0,0,1,.29-1.94.38.38,0,0,1,.28-.12.46.46,0,0,1,.34.16,3.66,3.66,0,0,1,.3,2l6,.48c.18,0,.43.21.49.94l0,.25-6.53.3c-.14,1.55-.42,1.55-.59,1.55s-.45,0-.57-1.37H11.74c0,.8,0,3.27,0,3.51s-.26,2.32-.42,3.14l2.38.34h.11l.13.13c.15.18.19.51.11,1l0,.21H10.9l-.4,1Z"/><path class="cls-2" d="M10.61.49a3.28,3.28,0,0,1,.91,2.72c0,1.89,0,4.71,0,4.71l1.76.1s-.1-2.08.32-2.08h0c.52,0,.37,2.13.37,2.13l6.22.49s.21.05.26.71l-6.5.3s-.11,1.54-.36,1.54h0c-.25,0-.34-1.37-.34-1.37l-1.78,0s-.05,3.48-.05,3.76A33,33,0,0,1,11,16.84l2.65.37h0s.26,0,.14.89h-3l-.23.58-.23-.58h-3c-.12-.85.1-.89.14-.89h0L10,16.84a33,33,0,0,1-.47-3.35c0-.28-.05-3.76-.05-3.76l-1.78,0s-.09,1.35-.34,1.37h0C7.14,11.13,7,9.58,7,9.58l-6.5-.3c.05-.66.26-.71.26-.71L7,8.08S6.87,6,7.38,5.95h0c.42,0,.32,2.08.32,2.08l1.76-.1s.06-2.82,0-4.71A3.28,3.28,0,0,1,10.39.49Z"/></g></g></svg>`,

  // Twin-engine turboprop (small) — e.g. ATR-42, C208, King Air
  twin_small: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19 16" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M9.5,15.75c-.21,0-.34-.17-.41-.51l-2.88.23v-.27c0-.78,0-1.11.28-1.13L9,13.1c-.31-1.86-.55-5-.59-5.55l-.08-.09H6.08L.25,6.54v-1A.43.43,0,0,1,.67,5l3.75-.27L5,4.45V3.53H4.73V2.7a.35.35,0,0,1,.34-.35h.07c.12-.52.26-.83.54-.83s.42.31.53.83h.07a.35.35,0,0,1,.34.35v.83H6.36v1l2-.08C8.42.81,9.09.25,9.49.25s1.09.55,1.12,4.21l2,.08v-1h-.25V2.7a.35.35,0,0,1,.34-.35h.07c.12-.52.26-.83.53-.83s.42.31.54.83h.07a.35.35,0,0,1,.34.35v.83H14v.92l.57.32L18.32,5a.42.42,0,0,1,.43.46v1L13,7.46H10.71l-.08.09c0,.56-.27,3.68-.59,5.55l2.46,1c.28,0,.28.35.28,1.13v.27l-2.88-.23C9.84,15.58,9.71,15.75,9.5,15.75Z"/><path class="cls-2" d="M9.51.5c.08,0,.86.11.86,4.2l2.51.1V3.28h-.26V2.7a.1.1,0,0,1,.09-.1H13c.08-.4.2-.83.33-.83s.26.43.34.83h.27a.1.1,0,0,1,.09.1v.57h-.25V4.6h0l.75.42,3.79.28h0c.06,0,.17,0,.17.22v.82l-5.58.89H10.6l-.21.24s-.26,3.8-.63,5.81l2.71,1.05h0s.06.08.06.88L9.7,15s0,.53-.2.53S9.3,15,9.3,15l-2.84.22c0-.8,0-.88.06-.88h0l2.71-1.05c-.36-2-.63-5.81-.63-5.81L8.4,7.21H6.08L.49,6.33V5.51c0-.19.11-.22.17-.22h0L4.49,5l.75-.42V3.28H5V2.7a.1.1,0,0,1,.09-.1h.27c.08-.4.2-.83.34-.83s.25.43.33.83h.27a.1.1,0,0,1,.09.1v.57H6.12V4.8l2.51-.1c0-4.09.78-4.2.86-4.2Z"/></g></g></svg>`,

  // Generic / unknown aircraft (fallback)
  unknown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" class="aircraft-svg"><defs><style>.cls-1{fill:aircraft_color_fill;}.cls-2{fill:aircraft_color_stroke;}</style></defs><g><g><path class="cls-1" d="M5.25,16.76c-.92,0-1.33-.46-1.39-.86a1,1,0,0,1,.79-1.11c.25-.08,1.22-.43,2.63-1V10.65h-6c-.68,0-1-.35-1-.66a.81.81,0,0,1,.6-.86C1.14,9,4.8,7,7.28,5.63V3c0-1.11.44-2.71,1.23-2.71S9.77,1.84,9.77,3V5.63C12.22,7,15.87,9,16.14,9.13a.8.8,0,0,1,.61.86c-.05.31-.36.67-1.05.67H9.77v3.19l1.61.59,1,.36a1.05,1.05,0,0,1,.8,1.11c-.07.39-.47.86-1.39.86Z"/><path class="cls-2" d="M8.54.48c.55,0,1,1.36,1,2.47V5.77s6.15,3.45,6.53,3.59c.72.25.61,1.06-.36,1.06H9.53V14c1.44.52,2.5.93,2.76,1,1,.36.85,1.5-.52,1.5H5.25c-1.38,0-1.52-1.14-.52-1.5.26-.08,1.33-.47,2.78-1V10.41H1.29c-1,0-1-.81-.36-1.06.4-.13,6.59-3.59,6.59-3.59V3c0-1.11.44-2.47,1-2.47Z"/></g></g></svg>`,
};

// ─── Render helper ─────────────────────────────────────────────────────────────
// Replaces dump1090-fa color placeholder tokens with actual CSS color values.
// fill   = primary body color (e.g. '#00dbe7')
// stroke = outline/edge color (slightly darker/lighter for contrast)
function renderSvg(svgTemplate, fill, stroke) {
  return svgTemplate
    .replace(/aircraft_color_fill/g, fill)
    .replace(/aircraft_color_stroke/g, stroke);
}

// ─── ICAO type designator → shape key ─────────────────────────────────────────
// Sourced verbatim from dump1090-fa markers.js (BSD-3-Clause, FlightAware).
// Maps specific ICAO 4-letter type codes to a shape key.
const TYPE_DESIGNATOR_MAP = {
  // ── Airliners / Narrow-body ────────────────────────────────────────────────
  A318: 'airliner', A319: 'airliner', A320: 'airliner', A321: 'airliner',
  A20N: 'airliner', A21N: 'airliner', A19N: 'airliner', A318: 'airliner',
  B731: 'airliner', B732: 'airliner', B733: 'airliner', B734: 'airliner',
  B735: 'airliner', B736: 'airliner', B737: 'airliner', B738: 'airliner',
  B739: 'airliner', B37M: 'airliner', B38M: 'airliner', B39M: 'airliner',
  B3XM: 'airliner',
  B721: 'airliner', B722: 'airliner',
  MD81: 'jet_swept', MD82: 'jet_swept', MD83: 'jet_swept', MD87: 'jet_swept',
  MD88: 'jet_swept', MD90: 'jet_swept',
  DC10: 'heavy_2e',
  T154: 'airliner',
  // ── Wide-body twin-engine ──────────────────────────────────────────────────
  B762: 'heavy_2e', B763: 'heavy_2e', B764: 'heavy_2e',
  B772: 'heavy_2e', B773: 'heavy_2e', B77L: 'heavy_2e', B77W: 'heavy_2e',
  B778: 'heavy_2e', B779: 'heavy_2e',
  B788: 'heavy_2e', B789: 'heavy_2e', B78X: 'heavy_2e',
  A332: 'heavy_2e', A333: 'heavy_2e', A338: 'heavy_2e', A339: 'heavy_2e',
  A359: 'heavy_2e', A35K: 'heavy_2e',
  MD11: 'heavy_2e',
  L101: 'heavy_2e',
  // ── Quad-engine heavies ────────────────────────────────────────────────────
  B741: 'heavy_4e', B742: 'heavy_4e', B743: 'heavy_4e', B744: 'heavy_4e',
  B748: 'heavy_4e',
  A342: 'heavy_4e', A343: 'heavy_4e', A345: 'heavy_4e', A346: 'heavy_4e',
  A380: 'heavy_4e', A388: 'heavy_4e',
  A225: 'heavy_4e',
  B52:  'heavy_4e', SLCH: 'heavy_4e',
  // ── Regional swept-wing jets (CRJ, ERJ/E-Jet, MD80 rear-engine) ───────────
  CRJ1: 'jet_swept', CRJ2: 'jet_swept', CRJ7: 'jet_swept', CRJ9: 'jet_swept',
  CRJX: 'jet_swept',
  E135: 'jet_swept', E145: 'jet_swept', E45X: 'jet_swept', E545: 'jet_swept',
  E170: 'jet_swept', E175: 'jet_swept', E190: 'jet_swept', E195: 'jet_swept',
  E275: 'jet_swept', E290: 'jet_swept',
  F100: 'jet_swept',
  B712: 'jet_swept',
  // ── Business jets (swept) ──────────────────────────────────────────────────
  C650: 'jet_swept', C750: 'jet_swept',
  CL30: 'jet_swept', CL35: 'jet_swept', CL60: 'jet_swept',
  GLF2: 'jet_swept', GLF3: 'jet_swept', GLF4: 'jet_swept', GLF5: 'jet_swept', GLF6: 'jet_swept',
  GL5T: 'jet_swept', GLEX: 'jet_swept', G150: 'jet_swept',
  F2TH: 'jet_swept', F900: 'jet_swept', FA50: 'jet_swept', FA5X: 'jet_swept',
  FA7X: 'jet_swept', FA8X: 'jet_swept',
  H25A: 'jet_swept', H25B: 'jet_swept', H25C: 'jet_swept',
  // ── Business jets (non-swept / straight wing) ─────────────────────────────
  C500: 'jet_nonswept', C501: 'jet_nonswept', C510: 'jet_nonswept',
  C525: 'jet_nonswept', C526: 'jet_nonswept', C550: 'jet_nonswept',
  C551: 'jet_nonswept', C55B: 'jet_nonswept', C560: 'jet_nonswept',
  C56X: 'jet_nonswept', C680: 'jet_nonswept', C68A: 'jet_nonswept',
  LJ23: 'jet_nonswept', LJ24: 'jet_nonswept', LJ25: 'jet_nonswept',
  LJ28: 'jet_nonswept', LJ31: 'jet_nonswept', LJ35: 'jet_nonswept',
  LJ40: 'jet_nonswept', LJ45: 'jet_nonswept', LJ55: 'jet_nonswept',
  LJ60: 'jet_nonswept', LJ70: 'jet_nonswept', LJ75: 'jet_nonswept',
  SF50: 'jet_nonswept', PRM1: 'jet_nonswept', E50P: 'jet_nonswept',
  // ── Turboprop airliners ────────────────────────────────────────────────────
  AT43: 'twin_large', AT45: 'twin_large', AT72: 'twin_large', AT75: 'twin_large', AT76: 'twin_large',
  DH8A: 'twin_large', DH8B: 'twin_large', DH8C: 'twin_large', DH8D: 'twin_large',
  // ── Twin turboprop (medium / large) ───────────────────────────────────────
  F27:  'twin_large', SF34: 'twin_large', JS41: 'twin_large',
  DC3:  'twin_large', DC3S: 'twin_large', DHC4: 'twin_large',
  // ── Twin turboprop (small) ─────────────────────────────────────────────────
  BE20: 'twin_small', BE30: 'twin_small', BE32: 'twin_small',
  D228: 'twin_small', DHC6: 'twin_small', AN28: 'twin_small',
  C212: 'twin_small', SW4:  'twin_small',
  MU2:  'twin_small', P180: 'twin_small',
  JS31: 'twin_small', JS32: 'twin_small',
  // ── Military / Hi-Performance ──────────────────────────────────────────────
  F15:  'hi_perf', F14:  'hi_perf', F22:  'hi_perf', F35:  'hi_perf',
  MG29: 'hi_perf', MG25: 'hi_perf', SU27: 'hi_perf', SU24: 'hi_perf',
  SR71: 'hi_perf', A10:  'hi_perf',
  // ── Helicopter ────────────────────────────────────────────────────────────
  B06:  'helicopter', B212: 'helicopter', B412: 'helicopter',
  EC35: 'helicopter', EC45: 'helicopter', EC25: 'helicopter',
  H60:  'helicopter', H53:  'helicopter', H64:  'helicopter',
  R22:  'helicopter', R44:  'helicopter', R66:  'helicopter',
  MI8:  'helicopter', AS32: 'helicopter', AW13: 'helicopter',
  AW16: 'helicopter', AW19: 'helicopter', CH7B: 'helicopter',
};

// ─── ICAO type-class description → shape key ─────────────────────────────────
// Fallback when exact designator not found. Keys are:
//   single char = basic type (H=helicopter)
//   3-char = L2J (landplane, 2 engines, jet), etc.
//   5-char = L2J-M (with wake turbulence category)
const TYPE_DESCRIPTION_MAP = {
  H:     'helicopter',
  L1P:   'cessna',     // landplane, 1 piston
  L1T:   'cessna',     // landplane, 1 turboprop
  L1J:   'hi_perf',    // landplane, 1 jet
  L2P:   'twin_small', // landplane, 2 piston
  L2T:   'twin_large', // landplane, 2 turboprop
  'L2J-L': 'jet_swept',   // 2 jet, light
  'L2J-M': 'airliner',    // 2 jet, medium
  'L2J-H': 'heavy_2e',    // 2 jet, heavy
  L4T:   'heavy_4e',
  'L4J-H': 'heavy_4e',
};

// ─── ADS-B Category code → shape key ─────────────────────────────────────────
// Used as a third-tier fallback via the ADS-B emitter category (e.g. "A3").
const CATEGORY_MAP = {
  A1: 'cessna',      // light (< 15 500 lb)
  A2: 'jet_nonswept',// small (15 500 to 75 000 lb)
  A3: 'airliner',    // large (75 000 to 300 000 lb)
  A4: 'heavy_2e',    // high vortex large (e.g. B757)
  A5: 'heavy_2e',    // heavy (> 300 000 lb)
  A6: 'hi_perf',     // high performance
  A7: 'helicopter',  // rotorcraft
  B1: 'cessna',      // glider / sailplane
  B7: 'hi_perf',     // UAV / drone
};

// ─── Primary resolution function ─────────────────────────────────────────────
/**
 * Resolve a flight object to a shape key using three-tier lookup, matching the
 * logic from dump1090-fa's getBaseMarker().
 *
 * @param {object} flight - flight data object from the API
 * @returns {string} shape key (key of SHAPES)
 */
function resolveShape(flight) {
  const typeCode = flight.aircraft_type;
  const category = flight.category;

  // Tier 1: exact ICAO type designator match
  if (typeCode) {
    const upper = String(typeCode).toUpperCase().trim();
    if (TYPE_DESIGNATOR_MAP[upper]) return TYPE_DESIGNATOR_MAP[upper];

    // Tier 2: type description fallback (match on first 3 chars → e.g. L2J, L1P)
    // We use heuristics on the ICAO type code prefix family
    const prefix3 = upper.slice(0, 3);
    if (TYPE_DESCRIPTION_MAP[prefix3]) return TYPE_DESCRIPTION_MAP[prefix3];
  }

  // Tier 3: ADS-B emitter category code
  if (category && CATEGORY_MAP[category]) return CATEGORY_MAP[category];

  return 'unknown';
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * getSvgForFlight(flight, fillColor, strokeColor)
 *
 * Returns the full SVG string for the aircraft marker, with colors injected.
 *
 * @param {object} flight      - flight object (needs .aircraft_type, .category)
 * @param {string} fillColor   - CSS color string for the main body fill
 * @param {string} strokeColor - CSS color string for the outline / detail
 * @returns {string} ready-to-embed SVG HTML string
 */
export function getSvgForFlight(flight, fillColor = 'currentColor', strokeColor = 'currentColor') {
  const shapeKey = resolveShape(flight);
  const template = SHAPES[shapeKey] || SHAPES.unknown;
  return renderSvg(template, fillColor, strokeColor);
}

/**
 * getShapeKey(flight) — returns the resolved shape name string.
 * Useful for debugging / display in the UI.
 */
export function getShapeKey(flight) {
  return resolveShape(flight);
}

// Export the full shapes map for advanced use (e.g. legend rendering).
export { SHAPES };
