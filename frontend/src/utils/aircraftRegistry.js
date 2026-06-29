// ─── utils/aircraftRegistry.js ────────────────────────────────────────────────
// Aircraft type icon registry.
//
// Contains:
//   AIRCRAFT_SVGS   — map of category key → SVG string (top-down silhouettes)
//   AIRCRAFT_MAP    — configurable registry mapping ICAO prefixes → category keys
//   getAircraftCategory(typeCode) — resolves any ICAO type code to a category
//
// To add a new aircraft type, only edit AIRCRAFT_MAP. No rendering logic changes needed.
// ──────────────────────────────────────────────────────────────────────────────

// ─── SVG Silhouettes ──────────────────────────────────────────────────────────
// All icons are top-down silhouettes at 64×64 viewBox for sharp rendering.
// currentColor is used so CSS can control the fill color.

export const AIRCRAFT_SVGS = {

  // ── Boeing 737 ──────────────────────────────────────────────────────────────
  // Narrowbody twin-jet: swept wings with winglets, slim fuselage
  b737: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Fuselage -->
    <ellipse cx="32" cy="32" rx="3.2" ry="26" fill="currentColor"/>
    <!-- Nose cone -->
    <ellipse cx="32" cy="8" rx="2.2" ry="3.5" fill="currentColor"/>
    <!-- Main swept wings -->
    <path d="M31 28 L5 42 L6 45 L30.5 34 Z" fill="currentColor"/>
    <path d="M33 28 L59 42 L58 45 L33.5 34 Z" fill="currentColor"/>
    <!-- Wing leading edge curve -->
    <path d="M31 27 Q18 30 5 42" fill="none" stroke="currentColor" stroke-width="0.3"/>
    <path d="M33 27 Q46 30 59 42" fill="none" stroke="currentColor" stroke-width="0.3"/>
    <!-- Winglets (small upturn at tips) -->
    <rect x="4.2" y="41" width="2.2" height="1.2" rx="0.5" fill="currentColor"/>
    <rect x="57.6" y="41" width="2.2" height="1.2" rx="0.5" fill="currentColor"/>
    <!-- Engines (two, under wing) -->
    <ellipse cx="18" cy="39" rx="2.5" ry="1.2" fill="currentColor"/>
    <ellipse cx="46" cy="39" rx="2.5" ry="1.2" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 55 L18 58.5 L18.5 60 L30.5 57 Z" fill="currentColor"/>
    <path d="M34 55 L46 58.5 L45.5 60 L33.5 57 Z" fill="currentColor"/>
    <!-- Vertical stabilizer -->
    <ellipse cx="32" cy="57" rx="1.6" ry="3" fill="currentColor"/>
  </svg>`,

  // ── Boeing 747 ──────────────────────────────────────────────────────────────
  // Quad-engine jumbo jet: four engines under long swept wings, wide body
  b747: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Fuselage (wide) -->
    <ellipse cx="32" cy="32" rx="4" ry="27" fill="currentColor"/>
    <!-- Upper deck hump (characteristic 747 feature) -->
    <ellipse cx="32" cy="16" rx="3" ry="7" fill="currentColor"/>
    <!-- Nose -->
    <ellipse cx="32" cy="7" rx="2.5" ry="3" fill="currentColor"/>
    <!-- Long swept wings -->
    <path d="M30.5 25 L2 44 L3.5 47 L30 36 Z" fill="currentColor"/>
    <path d="M33.5 25 L62 44 L60.5 47 L34 36 Z" fill="currentColor"/>
    <!-- Four engines (two per wing) -->
    <ellipse cx="14" cy="42" rx="2.2" ry="1.1" fill="currentColor"/>
    <ellipse cx="22" cy="39.5" rx="2.2" ry="1.1" fill="currentColor"/>
    <ellipse cx="42" cy="39.5" rx="2.2" ry="1.1" fill="currentColor"/>
    <ellipse cx="50" cy="42" rx="2.2" ry="1.1" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 55 L16 59 L16.5 61 L30.5 57 Z" fill="currentColor"/>
    <path d="M34 55 L48 59 L47.5 61 L33.5 57 Z" fill="currentColor"/>
    <!-- Vertical tail -->
    <ellipse cx="32" cy="57" rx="1.8" ry="3.5" fill="currentColor"/>
  </svg>`,

  // ── Boeing 777 ──────────────────────────────────────────────────────────────
  // Large twin-engine widebody: very long fuselage, massive swept wings
  b777: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Long wide fuselage -->
    <ellipse cx="32" cy="32" rx="3.8" ry="28" fill="currentColor"/>
    <!-- Nose -->
    <ellipse cx="32" cy="6" rx="2.5" ry="3" fill="currentColor"/>
    <!-- Very long swept wings -->
    <path d="M30 26 L1 45 L2.5 48 L30 38 Z" fill="currentColor"/>
    <path d="M34 26 L63 45 L61.5 48 L34 38 Z" fill="currentColor"/>
    <!-- Large engines (two, far out on wings) -->
    <ellipse cx="13" cy="43" rx="3" ry="1.4" fill="currentColor"/>
    <ellipse cx="51" cy="43" rx="3" ry="1.4" fill="currentColor"/>
    <!-- Raked wingtips -->
    <path d="M1.5 45.5 L0 47 L2.5 48.5 Z" fill="currentColor"/>
    <path d="M62.5 45.5 L64 47 L61.5 48.5 Z" fill="currentColor"/>
    <!-- Stabilizer -->
    <path d="M30 54 L17 58.5 L17.5 60.5 L30.5 56.5 Z" fill="currentColor"/>
    <path d="M34 54 L47 58.5 L46.5 60.5 L33.5 56.5 Z" fill="currentColor"/>
    <ellipse cx="32" cy="57" rx="1.8" ry="3.5" fill="currentColor"/>
  </svg>`,

  // ── Boeing 787 Dreamliner ────────────────────────────────────────────────────
  // Widebody: distinctive raked composite wingtips, efficient twin engines
  b787: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Fuselage -->
    <ellipse cx="32" cy="32" rx="3.5" ry="27" fill="currentColor"/>
    <!-- Nose (slightly more pointed) -->
    <path d="M30 7 Q32 3 34 7 L34 10 L30 10 Z" fill="currentColor"/>
    <!-- Swept composite wings with curved leading edge -->
    <path d="M30.5 24 Q16 28 2.5 44 L4 47 L30 37 Z" fill="currentColor"/>
    <path d="M33.5 24 Q48 28 61.5 44 L60 47 L34 37 Z" fill="currentColor"/>
    <!-- Raked swept wingtips (key 787 feature) -->
    <path d="M2.5 44 L0.5 46.5 L2 48 L4 47 Z" fill="currentColor"/>
    <path d="M61.5 44 L63.5 46.5 L62 48 L60 47 Z" fill="currentColor"/>
    <!-- Engines -->
    <ellipse cx="14.5" cy="42" rx="2.8" ry="1.2" fill="currentColor"/>
    <ellipse cx="49.5" cy="42" rx="2.8" ry="1.2" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 54 L18 58.5 L18.5 60.5 L30.5 56.5 Z" fill="currentColor"/>
    <path d="M34 54 L46 58.5 L45.5 60.5 L33.5 56.5 Z" fill="currentColor"/>
    <ellipse cx="32" cy="57" rx="1.8" ry="3.5" fill="currentColor"/>
  </svg>`,

  // ── Airbus A320 Family ────────────────────────────────────────────────────────
  // Narrowbody: twin underwing engines, sharklet wingtips, rounder nose
  a320: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Fuselage (slightly wider than 737) -->
    <ellipse cx="32" cy="32" rx="3.4" ry="26" fill="currentColor"/>
    <!-- Rounder Airbus nose -->
    <ellipse cx="32" cy="8" rx="2.8" ry="3.5" fill="currentColor"/>
    <!-- Swept wings -->
    <path d="M30.5 27 L5.5 41 L6.5 44.5 L30.5 35.5 Z" fill="currentColor"/>
    <path d="M33.5 27 L58.5 41 L57.5 44.5 L33.5 35.5 Z" fill="currentColor"/>
    <!-- Sharklets (vertical wingtip devices — A320 characteristic) -->
    <rect x="4.8" y="40.5" width="2.2" height="1.4" rx="0.5" fill="currentColor"/>
    <rect x="57" y="40.5" width="2.2" height="1.4" rx="0.5" fill="currentColor"/>
    <!-- CFM/IAE engines -->
    <ellipse cx="18.5" cy="39" rx="2.5" ry="1.2" fill="currentColor"/>
    <ellipse cx="45.5" cy="39" rx="2.5" ry="1.2" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 55 L19 58.5 L19.5 60" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M34 55 L45 58.5 L44.5 60" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="32" cy="57" rx="1.6" ry="3" fill="currentColor"/>
  </svg>`,

  // ── Airbus A330 ───────────────────────────────────────────────────────────────
  // Widebody twin-jet: long wings, two large underwing engines
  a330: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Wide fuselage -->
    <ellipse cx="32" cy="32" rx="3.8" ry="27" fill="currentColor"/>
    <!-- Nose -->
    <ellipse cx="32" cy="7" rx="2.6" ry="3.2" fill="currentColor"/>
    <!-- Long swept wings -->
    <path d="M30.5 25 L3 43 L4.5 46.5 L30 37 Z" fill="currentColor"/>
    <path d="M33.5 25 L61 43 L59.5 46.5 L34 37 Z" fill="currentColor"/>
    <!-- Winglets -->
    <path d="M3 43 L1 45.5 L2.5 46.5 L4.5 46.5 Z" fill="currentColor"/>
    <path d="M61 43 L63 45.5 L61.5 46.5 L59.5 46.5 Z" fill="currentColor"/>
    <!-- Two large engines -->
    <ellipse cx="15" cy="41.5" rx="2.8" ry="1.3" fill="currentColor"/>
    <ellipse cx="49" cy="41.5" rx="2.8" ry="1.3" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 54 L17 58.5 L17.5 60.5 L30.5 56 Z" fill="currentColor"/>
    <path d="M34 54 L47 58.5 L46.5 60.5 L33.5 56 Z" fill="currentColor"/>
    <ellipse cx="32" cy="57" rx="1.8" ry="3.5" fill="currentColor"/>
  </svg>`,

  // ── Airbus A350 ───────────────────────────────────────────────────────────────
  // Advanced widebody: curved shark-like nose, curved sharklet winglets
  a350: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Slender long fuselage -->
    <ellipse cx="32" cy="32" rx="3.6" ry="28" fill="currentColor"/>
    <!-- Pointed aerodynamic nose -->
    <path d="M30.5 5 Q32 2 33.5 5 L33.5 9 L30.5 9 Z" fill="currentColor"/>
    <!-- Highly swept wings with curved leading edge -->
    <path d="M30.5 23 Q16 27 2 44 L3.5 47.5 L30 37 Z" fill="currentColor"/>
    <path d="M33.5 23 Q48 27 62 44 L60.5 47.5 L34 37 Z" fill="currentColor"/>
    <!-- Curved sharklet winglets (tall, angled back) -->
    <path d="M2 44 L0 47 L1 48.5 L3.5 47.5 Z" fill="currentColor"/>
    <path d="M62 44 L64 47 L63 48.5 L60.5 47.5 Z" fill="currentColor"/>
    <!-- Rolls-Royce Trent XWB engines -->
    <ellipse cx="14" cy="43" rx="2.8" ry="1.3" fill="currentColor"/>
    <ellipse cx="50" cy="43" rx="2.8" ry="1.3" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 55 L17.5 59 L18 61 L30.5 57 Z" fill="currentColor"/>
    <path d="M34 55 L46.5 59 L46 61 L33.5 57 Z" fill="currentColor"/>
    <ellipse cx="32" cy="57" rx="1.8" ry="3.5" fill="currentColor"/>
  </svg>`,

  // ── Airbus A380 ───────────────────────────────────────────────────────────────
  // Super-jumbo: massively wide fuselage, four engines, very broad wingspan
  a380: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Very wide double-deck fuselage -->
    <ellipse cx="32" cy="32" rx="5" ry="26" fill="currentColor"/>
    <!-- Rounded Airbus nose -->
    <ellipse cx="32" cy="8" rx="4" ry="4" fill="currentColor"/>
    <!-- Enormously wide swept wings -->
    <path d="M30 26 L1 43 L2 47 L30 38 Z" fill="currentColor"/>
    <path d="M34 26 L63 43 L62 47 L34 38 Z" fill="currentColor"/>
    <!-- Four engines (two pairs per wing) -->
    <ellipse cx="11.5" cy="42.5" rx="2.2" ry="1.1" fill="currentColor"/>
    <ellipse cx="20" cy="40" rx="2.2" ry="1.1" fill="currentColor"/>
    <ellipse cx="44" cy="40" rx="2.2" ry="1.1" fill="currentColor"/>
    <ellipse cx="52.5" cy="42.5" rx="2.2" ry="1.1" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 54 L15 59 L15.5 61 L30.5 56 Z" fill="currentColor"/>
    <path d="M34 54 L49 59 L48.5 61 L33.5 56 Z" fill="currentColor"/>
    <!-- Large vertical tail -->
    <ellipse cx="32" cy="57.5" rx="2.5" ry="4" fill="currentColor"/>
  </svg>`,

  // ── Embraer E-Jets / ERJ ──────────────────────────────────────────────────────
  // Regional jet: slim fuselage, underwing engines, T-tail on some variants
  embraer: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Slim fuselage -->
    <ellipse cx="32" cy="32" rx="2.6" ry="25" fill="currentColor"/>
    <!-- Pointed nose -->
    <path d="M30.8 8 Q32 4.5 33.2 8 L33 12 L31 12 Z" fill="currentColor"/>
    <!-- Moderately swept wings -->
    <path d="M31 28 L8 41 L9 44 L31 36 Z" fill="currentColor"/>
    <path d="M33 28 L56 41 L55 44 L33 36 Z" fill="currentColor"/>
    <!-- Underwing engines (closer to fuselage than mainliners) -->
    <ellipse cx="19" cy="40" rx="2.2" ry="1.1" fill="currentColor"/>
    <ellipse cx="45" cy="40" rx="2.2" ry="1.1" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30.5 54 L20 58 L20.5 60 L31 56 Z" fill="currentColor"/>
    <path d="M33.5 54 L44 58 L43.5 60 L33 56 Z" fill="currentColor"/>
    <ellipse cx="32" cy="57" rx="1.4" ry="3" fill="currentColor"/>
  </svg>`,

  // ── Bombardier CRJ ───────────────────────────────────────────────────────────
  // Regional jet: very slim fuselage, REAR-mounted engines, T-tail
  crj: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Very slim fuselage -->
    <ellipse cx="32" cy="32" rx="2.2" ry="25" fill="currentColor"/>
    <!-- Pointed nose -->
    <path d="M31 8 Q32 5 33 8 L33 11 L31 11 Z" fill="currentColor"/>
    <!-- Swept mid-mounted wings (further aft than mainliners) -->
    <path d="M31 32 L9 44 L10 47 L31 39 Z" fill="currentColor"/>
    <path d="M33 32 L55 44 L54 47 L33 39 Z" fill="currentColor"/>
    <!-- REAR-MOUNTED engines (defining CRJ feature) -->
    <ellipse cx="27" cy="49" rx="2.2" ry="1" fill="currentColor"/>
    <ellipse cx="37" cy="49" rx="2.2" ry="1" fill="currentColor"/>
    <!-- T-TAIL horizontal stabilizer (high on vertical tail) -->
    <path d="M29.5 53 L20 56 L20.5 57.5 L30 55 Z" fill="currentColor"/>
    <path d="M34.5 53 L44 56 L43.5 57.5 L34 55 Z" fill="currentColor"/>
    <!-- Tall vertical tail -->
    <path d="M31.5 45 L30 58 L34 58 L32.5 45 Z" fill="currentColor"/>
  </svg>`,

  // ── ATR 42/72 Turboprop ──────────────────────────────────────────────────────
  // High-wing twin turboprop: straight wings on top, prop discs at engines
  atr: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Fuselage -->
    <ellipse cx="32" cy="32" rx="3" ry="25" fill="currentColor"/>
    <!-- Rounded nose -->
    <ellipse cx="32" cy="9" rx="2.5" ry="3.5" fill="currentColor"/>
    <!-- High, straight (not swept) wings -->
    <path d="M31 27 L5 30 L5 33 L31 31 Z" fill="currentColor"/>
    <path d="M33 27 L59 30 L59 33 L33 31 Z" fill="currentColor"/>
    <!-- Turboprop engine nacelles -->
    <ellipse cx="16.5" cy="31" rx="2.8" ry="1.3" fill="currentColor"/>
    <ellipse cx="47.5" cy="31" rx="2.8" ry="1.3" fill="currentColor"/>
    <!-- Propeller discs (thin ovals showing rotation) -->
    <ellipse cx="13" cy="31" rx="1" ry="5" fill="currentColor" opacity="0.5"/>
    <ellipse cx="51" cy="31" rx="1" ry="5" fill="currentColor" opacity="0.5"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 53 L19 57 L19.5 59 L30.5 55 Z" fill="currentColor"/>
    <path d="M34 53 L45 57 L44.5 59 L33.5 55 Z" fill="currentColor"/>
    <ellipse cx="32" cy="56" rx="1.5" ry="3" fill="currentColor"/>
  </svg>`,

  // ── General Aviation (Single-engine) ─────────────────────────────────────────
  // Light aircraft: single nose propeller, straight or slightly tapered wings
  ga: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Fuselage (shorter, stubbier) -->
    <ellipse cx="32" cy="35" rx="2.5" ry="20" fill="currentColor"/>
    <!-- Nose -->
    <ellipse cx="32" cy="17" rx="2" ry="3" fill="currentColor"/>
    <!-- Propeller disc -->
    <ellipse cx="32" cy="14" rx="1" ry="7" fill="currentColor" opacity="0.55"/>
    <line x1="32" y1="7" x2="32" y2="21" stroke="currentColor" stroke-width="0.8"/>
    <!-- Straight high wings -->
    <path d="M30.5 31 L8 33 L8 36 L30.5 34 Z" fill="currentColor"/>
    <path d="M33.5 31 L56 33 L56 36 L33.5 34 Z" fill="currentColor"/>
    <!-- Short horizontal stabilizer -->
    <path d="M30 51 L21 54 L21.5 56 L30.5 53 Z" fill="currentColor"/>
    <path d="M34 51 L43 54 L42.5 56 L33.5 53 Z" fill="currentColor"/>
    <ellipse cx="32" cy="54" rx="1.3" ry="2.5" fill="currentColor"/>
  </svg>`,

  // ── Helicopter ───────────────────────────────────────────────────────────────
  // Top-down view: main rotor disc, fuselage pod, tail boom, tail rotor
  helicopter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Main rotor disc (spinning blades) -->
    <ellipse cx="32" cy="30" rx="26" ry="3.5" fill="currentColor" opacity="0.35"/>
    <ellipse cx="32" cy="30" rx="3.5" ry="26" fill="currentColor" opacity="0.35"/>
    <!-- Rotor hub -->
    <circle cx="32" cy="30" r="2.5" fill="currentColor"/>
    <!-- Fuselage pod (wide at front, tapering) -->
    <ellipse cx="32" cy="36" rx="6" ry="10" fill="currentColor"/>
    <!-- Nose window area -->
    <ellipse cx="32" cy="27.5" rx="3.5" ry="3.5" fill="currentColor"/>
    <!-- Tail boom -->
    <rect x="31" y="44" width="2" height="14" rx="1" fill="currentColor"/>
    <!-- Tail rotor (side-mounted) -->
    <ellipse cx="32" cy="57" rx="5" ry="1.2" fill="currentColor" opacity="0.5"/>
    <circle cx="32" cy="57" r="1.2" fill="currentColor"/>
    <!-- Skids -->
    <path d="M26 43 L26 48" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M38 43 L38 48" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M23.5 46.5 L28.5 46.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M35.5 46.5 L40.5 46.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  // ── Cargo Aircraft (Heavy) ────────────────────────────────────────────────────
  // Large high-wing cargo: characteristic upswept tail, four engines, boxy fuselage
  cargo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Wide boxy fuselage -->
    <rect x="28.5" y="6" width="7" height="50" rx="3" fill="currentColor"/>
    <!-- High swept wings (longer span) -->
    <path d="M30 25 L1.5 40 L2.5 44 L30 35 Z" fill="currentColor"/>
    <path d="M34 25 L62.5 40 L61.5 44 L34 35 Z" fill="currentColor"/>
    <!-- Four engines -->
    <ellipse cx="12" cy="40.5" rx="2.5" ry="1.2" fill="currentColor"/>
    <ellipse cx="21.5" cy="37.5" rx="2.5" ry="1.2" fill="currentColor"/>
    <ellipse cx="42.5" cy="37.5" rx="2.5" ry="1.2" fill="currentColor"/>
    <ellipse cx="52" cy="40.5" rx="2.5" ry="1.2" fill="currentColor"/>
    <!-- Upswept tail section -->
    <path d="M29.5 50 L27 56 L29.5 58 L32 56 L34.5 58 L37 56 L34.5 50 Z" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 53 L17 57 L17.5 59.5 L30.5 55 Z" fill="currentColor"/>
    <path d="M34 53 L47 57 L46.5 59.5 L33.5 55 Z" fill="currentColor"/>
    <ellipse cx="32" cy="57" rx="2" ry="3.5" fill="currentColor"/>
  </svg>`,

  // ── Military Fighter ──────────────────────────────────────────────────────────
  // Fighter jet: delta/swept wings, twin tail fins, sleek fuselage
  military: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Sleek tapered fuselage -->
    <path d="M31 4 Q32 2 33 4 L35 48 L32 52 L29 48 Z" fill="currentColor"/>
    <!-- Delta/swept wings (large, starting mid-forward) -->
    <path d="M32 18 L3 52 L12 52 L32 35 Z" fill="currentColor"/>
    <path d="M32 18 L61 52 L52 52 L32 35 Z" fill="currentColor"/>
    <!-- Twin vertical tail fins -->
    <ellipse cx="26" cy="48" rx="1.8" ry="4" fill="currentColor"/>
    <ellipse cx="38" cy="48" rx="1.8" ry="4" fill="currentColor"/>
    <!-- Canards (small forward wings, e.g. F/A-18, Eurofighter style) -->
    <path d="M32 22 L20 29 L21 31 L32 26 Z" fill="currentColor"/>
    <path d="M32 22 L44 29 L43 31 L32 26 Z" fill="currentColor"/>
    <!-- Engine nozzles at tail -->
    <circle cx="29" cy="50" r="1.5" fill="currentColor" opacity="0.7"/>
    <circle cx="35" cy="50" r="1.5" fill="currentColor" opacity="0.7"/>
  </svg>`,

  // ── Default Jet (Fallback) ─────────────────────────────────────────────────────
  // Generic twin-engine airliner — used for unmatched jet types
  default_jet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <!-- Fuselage -->
    <ellipse cx="32" cy="32" rx="3" ry="26" fill="currentColor"/>
    <!-- Nose -->
    <ellipse cx="32" cy="8" rx="2.2" ry="3.5" fill="currentColor"/>
    <!-- Swept wings -->
    <path d="M31 28 L5 42 L6 45 L31 35 Z" fill="currentColor"/>
    <path d="M33 28 L59 42 L58 45 L33 35 Z" fill="currentColor"/>
    <!-- Engines -->
    <ellipse cx="18" cy="40" rx="2.5" ry="1.2" fill="currentColor"/>
    <ellipse cx="46" cy="40" rx="2.5" ry="1.2" fill="currentColor"/>
    <!-- Horizontal stabilizer -->
    <path d="M30 55 L19 59 L19.5 61 L30.5 57 Z" fill="currentColor"/>
    <path d="M34 55 L45 59 L44.5 61 L33.5 57 Z" fill="currentColor"/>
    <ellipse cx="32" cy="57" rx="1.6" ry="3" fill="currentColor"/>
  </svg>`,

  // ── Generic (ultimate fallback) ───────────────────────────────────────────────
  generic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="aircraft-svg">
    <path d="M32 4 C31 4 30 8 30 16 L6 30 L6 36 L30 28 L30 46 L24 50 L24 56 L32 53 L40 56 L40 50 L34 46 L34 28 L58 36 L58 30 L34 16 C34 8 33 4 32 4 Z" fill="currentColor"/>
  </svg>`,
};


// ─── Configurable Aircraft Category Registry ──────────────────────────────────
// Map from ICAO aircraft type code prefix → category key (from AIRCRAFT_SVGS).
//
// Rules are evaluated top-to-bottom and the first match wins.
// Add new entries here without touching any rendering code.
//
// Format: { pattern: RegExp | string, category: string }
// ──────────────────────────────────────────────────────────────────────────────

export const AIRCRAFT_MAP = [
  // ── Helicopters (detect early, specific patterns) ──
  { pattern: /^(H60|SH60|HH60|MH60|UH60)/, category: "helicopter" },      // Black Hawk family
  { pattern: /^(H64|AH64)/, category: "helicopter" },                       // Apache
  { pattern: /^(H53|CH53|MH53|SH53)/, category: "helicopter" },            // Sea Stallion
  { pattern: /^(H65|HH65|MH65)/, category: "helicopter" },                 // Dolphin
  { pattern: /^(R22|R44|R66)/, category: "helicopter" },                   // Robinson
  { pattern: /^(B06|B407|B412|B427|B429)/, category: "helicopter" },      // Bell
  { pattern: /^(EC1[35]|EC120|EC130|EC135|EC145|EC155|EC175|EC225|EC725)/, category: "helicopter" },
  { pattern: /^(AS3[35]|AS355|AS365)/, category: "helicopter" },           // Aérospatiale
  { pattern: /^(AW1[3-9][0-9]|AW[0-9]{3})/, category: "helicopter" },    // AgustaWestland
  { pattern: /^(MI8|MI17|MI171|MI26|MI28|KA2[56]|KA28|KA32)/, category: "helicopter" },
  { pattern: /^(S70|S76|S92)/, category: "helicopter" },                   // Sikorsky
  { pattern: /^(NH90|CH47|UH72)/, category: "helicopter" },

  // ── Military Aircraft ──
  { pattern: /^(F15|F16|F18|F22|F35|F117|F4[^5-9])/, category: "military" },
  { pattern: /^(A10|A6[^0]|AV8|EF2[0-9])/, category: "military" },
  { pattern: /^(B1|B2[^7]|B52|B[0-9]{1}[A-Z]?)$/, category: "military" }, // bombers (B1, B2, B52)
  { pattern: /^(E3|E8|E[0-9]?[A-Z]?[0-9]*)$/, category: "military" },
  { pattern: /^(MQ[0-9]|RQ[0-9]|UAV)/, category: "military" },
  { pattern: /^(P8|P3|P-8|P-3)/, category: "military" },
  { pattern: /^(C130|C17|C5[AM]?|C141|C160|C27|C295|CN235)/, category: "cargo" },

  // ── Cargo (civil) ──
  { pattern: /^(B74[24F]|B74[RS])/, category: "b747" },                   // 747 Freighters still look like 747
  { pattern: /^(AN2|AN12|AN24|AN26|AN28|AN32|AN72|AN124|AN225)/, category: "cargo" },
  { pattern: /^(IL76|IL86|IL96|IL114)/, category: "cargo" },

  // ── Super Jumbo ──
  { pattern: /^A38[0-9]/, category: "a380" },                              // A380, A389

  // ── Boeing 747 ──
  { pattern: /^B74[0-9LRQSPCMPF]/, category: "b747" },
  { pattern: /^B741|B742|B743|B744|B748/, category: "b747" },

  // ── Boeing 777 ──
  { pattern: /^B77[0-9WELRX]/, category: "b777" },
  { pattern: /^B77L|B77W|B77X/, category: "b777" },

  // ── Boeing 787 Dreamliner ──
  { pattern: /^B78[7-9][0-9A-Z]?/, category: "b787" },
  { pattern: /^B789|B788|B787/, category: "b787" },

  // ── Airbus A350 ──
  { pattern: /^A35[0-9]/, category: "a350" },

  // ── Airbus A330 / A340 ──
  { pattern: /^A3(3[0-9]|4[0-9])/, category: "a330" },
  { pattern: /^A330|A332|A333|A338|A339|A340|A342|A343|A345|A346/, category: "a330" },

  // ── Boeing 737 (all series) ──
  { pattern: /^B73[0-9SMPC]/, category: "b737" },
  { pattern: /^B731|B732|B733|B734|B735|B736|B737|B738|B739|B73J|B73Q|B73X/, category: "b737" },

  // ── Airbus A320 Family ──
  { pattern: /^A(31[89]|32[0-1NQRSX])/, category: "a320" },
  { pattern: /^A318|A319|A320|A321/, category: "a320" },

  // ── Airbus A220 (formerly Bombardier CSeries) ──
  { pattern: /^A(21[0-9]|22[0-9])/, category: "a320" },
  { pattern: /^CS(1|3)00/, category: "a320" },

  // ── Boeing 757 / 767 (widebodies treated as default_jet) ──
  { pattern: /^B75[0-9]/, category: "default_jet" },
  { pattern: /^B76[0-9]/, category: "default_jet" },

  // ── Embraer ──
  { pattern: /^E(170|175|190|195|19[0-5]|1[6-9][0-9])/, category: "embraer" },
  { pattern: /^E(ERJ|145|135|140|120)/, category: "embraer" },
  { pattern: /^ERJ[0-9]/, category: "embraer" },
  { pattern: /^E[0-9]{3}[A-Z]?$/, category: "embraer" },

  // ── Bombardier CRJ ──
  { pattern: /^CRJ/, category: "crj" },
  { pattern: /^CL(60|65|84|85|86|87|88)/, category: "crj" },
  { pattern: /^CR[0-9]/, category: "crj" },

  // ── Turboprops ──
  { pattern: /^AT(42|43|44|45|46|72|73|74|75|76|7[0-9])/, category: "atr" },
  { pattern: /^DH8[A-D]?/, category: "atr" },                             // DHC-8 Dash 8
  { pattern: /^Q[234][0-9][0-9]/, category: "atr" },                      // Q200/300/400
  { pattern: /^SF3|SF34/, category: "atr" },                              // Saab 340
  { pattern: /^JS4|JS31|JS32|JS41/, category: "atr" },                   // Jetstream
  { pattern: /^F27|F50|F60|FK7/, category: "atr" },                      // Fokker turboprops
  { pattern: /^SWM|SWI/, category: "atr" },
  { pattern: /^BE1[0-9]|BE20|BE30/, category: "atr" },                   // Beechcraft King Air
  { pattern: /^PC12|PC24/, category: "atr" },                            // Pilatus
  { pattern: /^MA60|MA600/, category: "atr" },

  // ── General Aviation ──
  { pattern: /^C1[0-9][0-9]|C172|C182|C208|C310|C340|C402|C404|C414|C421|C441|C500|C550|C560|C680|C750/, category: "ga" },
  { pattern: /^PA[0-9]{2}/, category: "ga" },                            // Piper
  { pattern: /^SR2[0-9]|SR22/, category: "ga" },                        // Cirrus
  { pattern: /^DA4[0-9]|DA62/, category: "ga" },                         // Diamond
  { pattern: /^TBM[0-9]/, category: "ga" },                             // TBM series (turboprop GA)
  { pattern: /^BE[3-9][0-9]/, category: "ga" },                         // Beechcraft piston
  { pattern: /^M20[A-Z]?/, category: "ga" },                            // Mooney
  { pattern: /^DR40|CAP2|CAP1/, category: "ga" },                       // Robin, CAP

  // ── Default Jet (catch-all for unmatched jets) ──
  { pattern: /^[A-Z][0-9]/, category: "default_jet" },                   // Any letter+number not matched above
  { pattern: /^[0-9]/, category: "default_jet" },
];


// ─── getAircraftCategory ──────────────────────────────────────────────────────
/**
 * Resolve an ICAO aircraft type code to a category key from AIRCRAFT_SVGS.
 * Falls back to "generic" for null/empty/unrecognised codes.
 *
 * @param {string|null|undefined} typeCode  - ICAO type code, e.g. "B738", "A320", "H60"
 * @returns {string} category key (one of the keys in AIRCRAFT_SVGS)
 */
export function getAircraftCategory(typeCode) {
  if (!typeCode) return "generic";
  const code = String(typeCode).toUpperCase().trim();
  if (!code) return "generic";

  for (const { pattern, category } of AIRCRAFT_MAP) {
    if (typeof pattern === "string") {
      if (code.startsWith(pattern)) return category;
    } else if (pattern instanceof RegExp) {
      if (pattern.test(code)) return category;
    }
  }

  return "generic";
}


// ─── getSvgForFlight ─────────────────────────────────────────────────────────
/**
 * Convenience helper: given a flight object, return the SVG HTML string.
 *
 * @param {object} flight  - flight object with optional `aircraft_type` field
 * @returns {string} SVG HTML string
 */
export function getSvgForFlight(flight) {
  const category = getAircraftCategory(flight?.aircraft_type);
  return AIRCRAFT_SVGS[category] ?? AIRCRAFT_SVGS.generic;
}
