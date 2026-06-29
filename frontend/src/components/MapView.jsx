import { useEffect, useRef, useCallback, useState } from "react";
/* global L — loaded via CDN in index.html */
import { useStore } from "../store/AppStore";
import { useFlightPolling, useFocusFlight } from "../hooks/useFlights";
import { flightBearing, flightPhase, PHASE_COLORS, geodesicSegment,
         normalizeSigmetSeverity, extractHazards, crossTrackDistance, gcDistance } from "../utils/geo";
import { filterFlights } from "../utils/filters";
import { US_CENTER, US_ZOOM, POLL_MS, API_BASE } from "../utils/api";
import { REGIONS, AIRLINE_FILTERS } from "../store/AppStore";
import { getSvgForFlight } from "../utils/aircraftRegistry";

// ─── Tile layer configs ────────────────────────────────────────────────────────
const TILE_LAYERS = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    opts: { maxZoom: 19, subdomains: "abcd", noWrap: true },
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    opts: { maxZoom: 19, subdomains: "abcd", noWrap: true },
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    opts: { maxZoom: 19, noWrap: true },
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    opts: { maxZoom: 17, subdomains: "abc", noWrap: true },
  },
};

// ─── Marker HTML factory ───────────────────────────────────────────────────────
// SVGs and category mapping are managed in ../utils/aircraftRegistry.js
// Add new aircraft types there without modifying this file.

function markerHtml(flight, showLabel, isSelected) {
  const bearing = flightBearing(flight);
  const phase = flightPhase(flight);
  const { color } = PHASE_COLORS[phase];
  
  const markerColor = isSelected ? "var(--color-aircraft-selected)" : "var(--color-aircraft)";
  const markerGlow = isSelected ? "var(--color-aircraft-selected)" : "var(--color-aircraft-glow)";
  
  const label = showLabel
    ? `<div class="aircraft-marker-label" style="--marker-color:${markerColor}">${flight.callsign || flight.icao24.toUpperCase()}</div>`
    : "";

  const scale = isSelected ? "scale(1.35)" : "scale(1)";
  const border = isSelected ? `border: 2px solid var(--selected-aircraft); border-radius: 50%; box-shadow: 0 0 14px ${markerColor}, 0 0 6px ${markerColor}` : "";

  // getSvgForFlight handles all category detection and fallback internally
  const svgHtml = getSvgForFlight(flight, isSelected ? "#ffffff" : "var(--color-aircraft-stroke)", markerColor);

  return `
    <div style="position:relative;width:40px;height:40px;transform:${scale};transition:transform 0.2s;z-index:${isSelected ? 1000 : 1}">
      <div class="aircraft-marker" style="--marker-color:${markerColor};--marker-glow:${markerGlow};--heading:${bearing}deg;${border}">
        ${svgHtml}
      </div>
      ${label}
    </div>`;
}

function popupHtml(flight, activeRoute = null, selectedIcao = null) {
  const phase = flightPhase(flight);
  const { color } = PHASE_COLORS[phase];
  const phaseLabel = { climb: "▲ CLIMBING", descend: "▼ DESCENDING", cruise: "→ CRUISING", ground: "⬛ ON GROUND" }[phase];

  let routeHtml = "";
  if (selectedIcao === flight.icao24) {
    if (activeRoute && activeRoute.aircraft?.icao24 === flight.icao24) {
      const { aircraft, points } = activeRoute;
      const originPt = points.find(p => p.type === "origin");
      const destPt = points.find(p => p.type === "destination");
      
      let deviationText = "Normal (<10 km)";
      let deviationColor = "var(--color-phase-climb)";
      
      if (originPt && destPt) {
        const dev = crossTrackDistance(
          flight.latitude,
          flight.longitude,
          originPt.latitude,
          originPt.longitude,
          destPt.latitude,
          destPt.longitude
        );
        if (dev >= 50) {
          deviationText = `Major Deviation (${Math.round(dev)} km)`;
          deviationColor = "var(--color-error)";
        } else if (dev >= 10) {
          deviationText = `Minor Deviation (${Math.round(dev)} km)`;
          deviationColor = "var(--color-secondary)";
        }
      }

      const distRemaining = destPt
        ? `${Math.round(gcDistance(flight.latitude, flight.longitude, destPt.latitude, destPt.longitude)).toLocaleString()} km`
        : "--";

      const flightNum = aircraft.flight_number ? `${aircraft.airline_iata || ""}${aircraft.flight_number}` : (aircraft.callsign || "--");
      const originLabel = originPt ? `${originPt.label} (${aircraft.origin_name || "Origin"})` : "--";
      const destLabel = destPt ? `${destPt.label} (${aircraft.destination_name || "Destination"})` : "--";

      routeHtml = `
        <div style="border-top:1px solid var(--glass-border);padding-top:8px;margin-top:8px;display:grid;grid-template-columns:100px 1fr;gap:4px 12px">
          <span style="color:var(--color-on-surface-variant)">FLIGHT NUM</span><span style="color:var(--color-primary);font-weight:bold">${flightNum}</span>
          <span style="color:var(--color-on-surface-variant)">ORIGIN</span><span style="color:var(--color-primary);text-overflow:ellipsis;overflow:hidden;white-space:nowrap" title="${originLabel}">${originLabel}</span>
          <span style="color:var(--color-on-surface-variant)">DESTINATION</span><span style="color:var(--color-primary);text-overflow:ellipsis;overflow:hidden;white-space:nowrap" title="${destLabel}">${destLabel}</span>
          <span style="color:var(--color-on-surface-variant)">DIST REMAIN</span><span style="color:var(--color-primary);font-weight:bold">${distRemaining}</span>
          <span style="color:var(--color-on-surface-variant)">DEV STATUS</span><span style="color:${deviationColor};font-weight:bold">${deviationText}</span>
        </div>
      `;
    } else {
      routeHtml = `
        <div style="border-top:1px solid var(--glass-border);padding-top:8px;margin-top:8px;color:var(--color-primary-container);display:flex;align-items:center;gap:6px">
          <span class="material-symbols-outlined text-sm radar-spinning">sync</span>
          <span style="font-size:9px">Loading route data...</span>
        </div>
      `;
    }
  }

  return `
    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--color-on-surface);min-width:240px">
      <div style="font-family:Geist,sans-serif;font-size:16px;color:var(--color-primary);margin-bottom:4px">
        ${flight.callsign || flight.icao24.toUpperCase()}
      </div>
      <div style="color:var(--color-on-surface-variant);font-size:10px;margin-bottom:8px">
        ${flight.icao24.toUpperCase()} | ${flight.aircraft_type || "Unknown Type"} | ${flight.country || "Unknown"}
      </div>
      <div style="display:inline-block;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};font-size:9px;margin-bottom:10px;border:1px solid ${color}55">
        ${phaseLabel}
      </div>
      <div style="display:grid;grid-template-columns:100px 1fr;gap:4px 12px">
        <span style="color:var(--color-on-surface-variant)">ALTITUDE</span><span style="color:var(--color-primary);font-weight:bold">${flight.altitude_ft != null ? Math.round(flight.altitude_ft).toLocaleString() : "--"} FT</span>
        <span style="color:var(--color-on-surface-variant)">GROUND SPEED</span><span style="color:var(--color-primary);font-weight:bold">${flight.velocity_kts != null ? Math.round(flight.velocity_kts) : "--"} KT</span>
        <span style="color:var(--color-on-surface-variant)">HEADING</span><span style="color:var(--color-primary);font-weight:bold">${flight.heading != null ? Math.round(flight.heading) : "--"}°</span>
      </div>
      ${routeHtml}
    </div>`;
}

function translateSigmetToEnglish(rawText) {
  if (!rawText) return "";

  const STATE_LAKE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
    ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
    LM: "Lake Michigan", LH: "Lake Huron", LS: "Lake Superior", LO: "Lake Ontario", LE: "Lake Erie"
  };

  const VOR_NAMES = {
    BAE: "Barre-Montpelier",
    GRR: "Grand Rapids",
    IIU: "Louisville",
    COU: "Columbia",
    IRK: "Kirksville",
    PMM: "Pullman",
    TTH: "Terre Haute",
    BUM: "Butler",
    DSM: "Des Moines",
    RWF: "Redwood Falls",
    HLC: "Hill City",
    BFF: "Scottsbluff",
    CYS: "Cheyenne",
    PUB: "Pueblo",
    ALS: "Alamosa",
    CHE: "Cherokee",
    CHI: "Chicago",
    STL: "St. Louis",
    MKC: "Kansas City",
    MSP: "Minneapolis",
    ORD: "Chicago O'Hare",
    MDW: "Chicago Midway",
    DFW: "Dallas-Fort Worth",
    DEN: "Denver",
    ATL: "Atlanta",
    LAX: "Los Angeles",
    JFK: "New York JFK",
    LGA: "New York LaGuardia",
    EWR: "Newark",
    SFO: "San Francisco",
    SEA: "Seattle",
    MIA: "Miami",
    PHX: "Phoenix",
    IAH: "Houston",
    BOS: "Boston",
    DTW: "Detroit",
    PHL: "Philadelphia",
    CLT: "Charlotte",
    DCA: "Washington Reagan",
    IAD: "Washington Dulles",
    SAN: "San Diego",
    TPA: "Tampa",
    MCO: "Orlando",
    SLC: "Salt Lake City",
    CVG: "Cincinnati",
    CLE: "Cleveland",
    PIT: "Pittsburgh",
    IND: "Indianapolis",
    MEM: "Memphis",
    BNA: "Nashville",
    MKE: "Milwaukee",
    OKC: "Oklahoma City",
    TUL: "Tulsa",
    ABQ: "Albuquerque",
    ELP: "El Paso",
    AMA: "Amarillo",
    LBB: "Lubbock",
    MAF: "Midland",
    SJT: "San Angelo",
    ABI: "Abilene",
    SPS: "Wichita Falls",
    AUS: "Austin",
    SAT: "San Antonio",
    CRP: "Corpus Christi",
    HOU: "Houston Hobby",
    GLS: "Galveston",
    BPT: "Beaumont",
    LCH: "Lake Charles",
    LFT: "Lafayette",
    MSY: "New Orleans",
    MOB: "Mobile",
    GPT: "Gulfport",
    PNS: "Pensacola",
    TLH: "Tallahassee",
    JAX: "Jacksonville",
    DAB: "Daytona Beach",
    MLB: "Melbourne",
    PBI: "West Palm Beach",
    FLL: "Fort Lauderdale",
    EYW: "Key West",
    APF: "Naples",
    RSW: "Fort Myers",
    SRQ: "Sarasota",
    PIE: "St. Petersburg",
    GNV: "Gainesville",
    SAV: "Savannah",
    CHS: "Charleston",
    MYR: "Myrtle Beach",
    ILM: "Wilmington",
    FAY: "Fayetteville",
    RDU: "Raleigh-Durham",
    GSO: "Greensboro",
    AVL: "Asheville",
    TRI: "Bristol/Tri-Cities",
    TYS: "Knoxville",
    CHA: "Chattanooga",
    HSV: "Huntsville",
    BHM: "Birmingham",
    MGM: "Montgomery",
    CSG: "Columbus",
    MCN: "Macon",
    AGS: "Augusta",
    CAE: "Columbia",
    FLO: "Florence",
    CRE: "Grand Strand",
    EWN: "New Bern",
    ISO: "Kinston",
    PGV: "Greenville",
    ECG: "Elizabeth City",
    ORF: "Norfolk",
    PHF: "Newport News",
    RIC: "Richmond",
    CHO: "Charlottesville",
    LYH: "Lynchburg",
    ROA: "Roanoke",
    DAN: "Danville",
    BLF: "Bluefield",
    BKW: "Beckley",
    CRW: "Charleston",
    HTS: "Huntington",
    PKB: "Parkersburg",
    CKB: "Clarksburg",
    MGW: "Morgantown",
    LBE: "Latrobe",
    AGC: "Allegheny",
    JST: "Johnstown",
    AOO: "Altoona",
    UNV: "State College",
    IPT: "Williamsport",
    AVP: "Wilkes-Barre",
    ABE: "Allentown",
    RDG: "Reading",
    LNS: "Lancaster",
    MDT: "Harrisburg",
    THV: "York",
    ILG: "Wilmington",
    ACY: "Atlantic City",
    WRI: "Wrightstown",
    TTN: "Trenton",
    BLI: "Bellingham",
    PAE: "Everett",
    BFI: "Boeing Field",
    OLM: "Olympia",
    HQM: "Hoquiam",
    AST: "Astoria",
    PDX: "Portland",
    SLE: "Salem",
    EUG: "Eugene",
    OTH: "North Bend",
    RBG: "Roseburg",
    MFR: "Medford",
    LMT: "Klamath Falls",
    RDM: "Redmond",
    DLS: "The Dalles",
    YKM: "Yakima",
    ELN: "Ellensburg",
    EAT: "Wenatchee",
    GEG: "Spokane",
    SFF: "Felts Field",
    COE: "Coeur d'Alene",
    PUW: "Pullman",
    LWS: "Lewiston",
    ALW: "Walla Walla",
    PDT: "Pendleton",
    BOI: "Boise",
    MAN: "Nampa",
    PIH: "Pocatello",
    IDA: "Idaho Falls",
    SUN: "Hailey",
    TWF: "Twin Falls",
    EKO: "Elko",
    WMC: "Winnemucca",
    LOL: "Lovelock",
    RNO: "Reno",
    CXP: "Carson City",
    TVL: "Lake Tahoe",
    TRK: "Truckee",
    BIH: "Bishop",
    FAT: "Fresno",
    VIS: "Visalia",
    BFL: "Bakersfield",
    SBP: "San Luis Obispo",
    SMX: "Santa Maria",
    SBA: "Santa Barbara",
    OXR: "Oxnard",
    BUR: "Burbank",
    VNY: "Van Nuys",
    SMO: "Santa Monica",
    LGB: "Long Beach",
    SNA: "John Wayne",
    CRQ: "Carlsbad",
    MYF: "Montgomery Field",
    SEE: "Gillespie Field",
    SDM: "Brown Field",
    IPL: "Imperial",
    BLH: "Blythe",
    NXP: "Twentynine Palms",
    PSP: "Palm Springs",
    UDD: "Bermuda Dunes",
    TRM: "Thermal",
    EED: "Needles",
    IFP: "Bullhead City",
    IGM: "Kingman",
    PGA: "Page",
    FLG: "Flagstaff",
    GCN: "Grand Canyon",
    SEZ: "Sedona",
    PRC: "Prescott",
    CGZ: "Casa Grande",
    FFZ: "Falcon Field",
    CHD: "Chandler",
    IWA: "Phoenix-Mesa",
    AZA: "Phoenix-Mesa Gateway",
    TUS: "Tucson",
    RYN: "Ryan Field",
    DMA: "Davis-Monthan",
    OLS: "Nogales",
    FHU: "Fort Huachuca",
    SAD: "Safford",
    DMN: "Deming",
    LAS: "Las Vegas",
    VGT: "North Las Vegas",
    HND: "Henderson",
    BVU: "Boulder City",
    IGB: "Imlay",
    BTY: "Beatty",
    TPH: "Tonopah",
    OAL: "Coaldale",
    HVE: "Hanksville",
    PUC: "Price",
    VEL: "Vernal",
    CNY: "Moab",
    SGU: "St. George",
    CDC: "Cedar City",
    MIL: "Milford",
    DTA: "Delta",
    ENV: "Wendover",
    TVY: "Tooele",
    OGD: "Ogden",
    PVU: "Provo",
    EVW: "Evanston",
    RKS: "Rock Springs",
    CPR: "Casper",
    RIW: "Riverton",
    LND: "Lander",
    WRL: "Worland",
    COD: "Cody",
    SHR: "Sheridan",
    GCC: "Gillette",
    BYG: "Buffalo",
    CYS: "Cheyenne",
    LAR: "Laramie",
    RWL: "Rawlins",
    SAA: "Shively",
    DGW: "Douglas",
    TOR: "Torrington",
    SNY: "Sidney",
    AIA: "Alliance",
    CDR: "Chadron",
    MHN: "Mullen",
    LBF: "North Platte",
    BBW: "Broken Bow",
    GRI: "Grand Island",
    EAR: "Kearney",
    LXN: "Lexington",
    IML: "Imperial",
    MCK: "McCook",
    RSL: "Russell",
    HYS: "Hays",
    SLN: "Salina",
    ICT: "Wichita",
    IAB: "McConnell AFB",
    AAO: "Colonel James Jabara",
    BEC: "Beech Factory",
    CEA: "Cessna Aircraft Field",
    FOE: "Topeka Forbes",
    TOP: "Topeka Philip Billard",
    MHK: "Manhattan",
    EMP: "Emporia",
    CNU: "Chanute",
    PTS: "Pittsburg",
    JLN: "Joplin",
    SGF: "Springfield",
    BBG: "Branson",
    PLK: "Point Lookout",
    HRO: "Harrison",
    BPK: "Baxter County",
    FYV: "Fayetteville",
    XNA: "Northwest Arkansas",
    ROG: "Rogers",
    VBT: "Bentonville",
    ASG: "Springdale",
    FSM: "Fort Smith",
    HOT: "Hot Springs",
    LIT: "Little Rock",
    ORK: "Jacksonville",
    ADF: "Dexter B. Florence",
    PBF: "Pine Bluff",
    LLQ: "McGehee",
    ELD: "El Dorado",
    TXK: "Texarkana",
    SHV: "Shreveport",
    DTN: "Shreveport Downtown",
    BAD: "Barksdale AFB",
    IER: "Natchitoches",
    AEX: "Alexandria",
    ESF: "Esler Regional",
    HEZ: "Natchez",
    MCB: "McComb",
    BTR: "Baton Rouge",
    HDC: "Hammond",
    HUM: "Houma",
    NEW: "Lakefront",
    NBG: "New Orleans NAS",
    ASD: "Slidell",
    PQL: "Pascagoula",
    BIX: "Keesler AFB",
    HBG: "Hattiesburg",
    PIB: "Hattiesburg-Laurel",
    NMM: "Meridian NAS",
    GTR: "Golden Triangle",
    UBS: "Columbus",
    CBM: "Columbus AFB",
    TUP: "Tupelo",
    CRX: "Corinth",
    MSL: "Muscle Shoals",
    DCU: "Decatur",
    HUA: "Redstone AAF",
    MDQ: "Huntsville Executive",
    GAD: "Gadsden",
    ANB: "Anniston",
    PLR: "Pell City",
    EET: "Alabaster",
    TCL: "Tuscaloosa",
    SEM: "Craig Field",
    MXF: "Maxwell AFB",
    TOI: "Troy",
    EUF: "Eufaula",
    DHN: "Dothan",
    OZR: "Cairns AAF",
    LOR: "Lowe AAF",
    HEY: "Hanchey AAF",
    MGE: "Dobbins ARB",
    FTY: "Fulton County",
    PDK: "DeKalb-Peachtree",
    FFC: "Peachtree City",
    CCO: "Newnan-Coweta",
    LGC: "LaGrange",
    LSF: "Lawson AAF",
    WRB: "Robins AFB",
    PXE: "Perry-Houston",
    VLD: "Valdosta",
    VAD: "Moody AFB",
    ABY: "Albany",
    TMA: "Tifton",
    PIM: "Pine Mountain",
  };

  const DIRECTIONS = {
    N: "North",
    NNE: "North-Northeast",
    NE: "Northeast",
    ENE: "East-Northeast",
    E: "East",
    ESE: "East-Southeast",
    SE: "Southeast",
    SSE: "South-Southeast",
    S: "South",
    SSW: "South-Southwest",
    SW: "Southwest",
    WSW: "West-Southwest",
    W: "West",
    WNW: "West-Northwest",
    NW: "Northwest",
    NNW: "North-Northwest"
  };

  const REGION_NAMES = {
    SLCN: "Salt Lake City",
    SFO: "San Francisco",
    CHI: "Chicago",
    DFW: "Dallas-Fort Worth",
    MIA: "Miami",
    BOS: "Boston"
  };

  function getDayOrdinal(dayStr) {
    const day = parseInt(dayStr, 10);
    if (isNaN(day)) return dayStr;
    if (day > 3 && day < 21) return day + "th";
    switch (day % 10) {
      case 1:  return day + "st";
      case 2:  return day + "nd";
      case 3:  return day + "rd";
      default: return day + "th";
    }
  }

  function formatStateList(statesStr) {
    const codes = statesStr.split(/\s+/).map(c => c.toUpperCase());
    const names = codes.map(c => STATE_LAKE_NAMES[c] || c);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + " and " + names[1];
    return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
  }

  let txt = rawText;

  // 1. Header parsing (supports convective and region-wise WS style headers)
  const headerRegex = /^(?:WSUS\d+\s+)?([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})\s+SIG[A-Z]\s+(CONVECTIVE\s+)?SIGMET\s+(\w+)\s+VALID\s+UNTIL\s+(\d{2})(\d{2})Z/i;
  const headerWS = /^(?:WSUS\d+\s+)?([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})\s+([A-Z]{4})\s+WS\s+\d{6}\s+SIGMET\s+(\w+)\s+(\d+)/i;
  
  let headerText = "";
  const matchWS = txt.match(headerWS);
  const matchSig = txt.match(headerRegex);

  if (matchWS) {
    const center = matchWS[1];
    const day = matchWS[2];
    const hr = matchWS[3];
    const min = matchWS[4];
    const reg = matchWS[5];
    const name = matchWS[6];
    const num = matchWS[7];
    
    const dayOrdinal = getDayOrdinal(day);
    const regionName = REGION_NAMES[reg] ? `${REGION_NAMES[reg]} (${reg})` : reg;
    headerText = `SIGMET ${name} ${num} (issued by ${center} for ${regionName} at ${hr}:${min} UTC on the ${dayOrdinal}).\n\n`;
    
    txt = txt.substring(matchWS[0].length).trim();
  } else if (matchSig) {
    const center = matchSig[1];
    const day = matchSig[2];
    const hr = matchSig[3];
    const min = matchSig[4];
    const isConvective = matchSig[5] ? "Convective " : "";
    const sigmetNum = matchSig[6];
    const validHr = matchSig[7];
    const validMin = matchSig[8];
    
    const dayOrdinal = getDayOrdinal(day);
    headerText = `${isConvective}SIGMET ${sigmetNum} (issued by ${center} at ${hr}:${min} UTC on the ${dayOrdinal}, valid until ${validHr}:${validMin} UTC).\n\n`;
    
    txt = txt.substring(matchSig[0].length).trim();
  } else {
    // Fallback cleanup
    txt = txt.replace(/^(WSUS\d+\s+\w+\s+\d{6}\s+SIG[A-Z]\s+)?CONVECTIVE\s+SIGMET\s+(\w+)\s+/i, "Convective SIGMET $2: ");
  }

  // 2. Parse general valid time (handles VALID UNTIL 110936 or VALID UNTIL 0855Z)
  txt = txt.replace(/VALID\s+UNTIL\s+(\d{2})?(\d{2})(\d{2})Z?/gi, (match, day, hr, min) => {
    if (day) {
      return `valid until ${hr}:${min} UTC on the ${getDayOrdinal(day)}`;
    }
    return `valid until ${hr}:${min} UTC`;
  });

  // 3. Affected states extraction
  const statesFromRegex = /^([A-Z\s]{2,})\s+FROM\b/i;
  const statesFromMatch = txt.match(statesFromRegex);
  if (statesFromMatch) {
    const statesList = formatStateList(statesFromMatch[1].trim());
    txt = txt.replace(statesFromRegex, `Affected areas: ${statesList}.\n\nArea Boundary: From `);
  }

  // 4. Replace hyphens between VORs or coordinates with " to " BEFORE coordinate matching
  txt = txt.replace(/([A-Z])\-(\d+)/gi, "$1 to $2");
  txt = txt.replace(/([A-Z])\-([A-Z])/gi, "$1 to $2");

  // 5. Coordinate point translation (keep code unexpanded here to expand once at the end)
  const coordRegex = /(\d+)(NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW|NE|NW|SE|SW|N|S|E|W)\s*([A-Z])\s*([A-Z])\s*([A-Z])\b/gi;
  txt = txt.replace(coordRegex, (match, dist, dir, l1, l2, l3) => {
    const vor = (l1 + l2 + l3).toUpperCase();
    const dirName = DIRECTIONS[dir] || dir;
    return `${dist} miles ${dirName} of ${vor}`;
  });

  // 6. Standalone VOR names loop (translates CYS -> Cheyenne (CYS))
  for (const [code, name] of Object.entries(VOR_NAMES)) {
    // Avoid expanding VOR codes that are already inside parentheses, e.g. (CYS) or ( CYS)
    const r = new RegExp(`(?<!\\(\\s*)\\b${code}\\b`, "g");
    txt = txt.replace(r, `${name} (${code})`);
  }

  // 7. SIGMET specific state references (e.g. SIGMET CO -> SIGMET for Colorado)
  txt = txt.replace(/\bSIGMET\s+([A-Z]{2})\b/gi, (match, stateCode) => {
    const s = stateCode.toUpperCase();
    return `SIGMET for ${STATE_LAKE_NAMES[s] || s}`;
  });

  // 8. Weather conditions translation
  txt = txt.replace(/\bAREA\s+TS\b/gi, ".\n\nAn area of thunderstorms");
  txt = txt.replace(/\bLINE\s+TS\b/gi, ".\n\nA line of thunderstorms");
  txt = txt.replace(/MOV\s+FROM\s+(\d{3})(\d{2,3})KTS?/gi, "moving from $1° at $2 knots");
  
  // Cloud/Storm tops and heights
  txt = txt.replace(/T\s*OPS\s+ABV\s+FL(\d{3})/gi, (m, p1) => {
    const alt = (parseInt(p1) * 100).toLocaleString();
    return `with storm tops above flight level ${p1} (${alt} feet)`;
  });
  txt = txt.replace(/T\s*OPS\s+TO\s+FL(\d{3})/gi, (m, p1) => {
    const alt = (parseInt(p1) * 100).toLocaleString();
    return `with storm tops up to flight level ${p1} (${alt} feet)`;
  });
  txt = txt.replace(/TOPS\s+ABV\s+FL(\d{3})/gi, (m, p1) => {
    const alt = (parseInt(p1) * 100).toLocaleString();
    return `with cloud tops above flight level ${p1} (${alt} feet)`;
  });
  txt = txt.replace(/TOPS\s+TO\s+FL(\d{3})/gi, (m, p1) => {
    const alt = (parseInt(p1) * 100).toLocaleString();
    return `with cloud tops up to flight level ${p1} (${alt} feet)`;
  });
  txt = txt.replace(/FL(\d{3})/gi, (m, p1) => {
    const alt = (parseInt(p1) * 100).toLocaleString();
    return `flight level ${p1} (${alt} feet)`;
  });

  // Other hazards and abbreviations
  txt = txt.replace(/\bOCNL\b/gi, "occasional");
  txt = txt.replace(/\bBLW\b/gi, "below");
  // Translate mountain wave activity (handles raw MTN WV ACT as well as auto-expanded Waco (ACT))
  txt = txt.replace(/\bMTN\s+WV\s+(?:Waco\s+\(ACT\)|ACT)\b/gi, "mountain wave activity");
  txt = txt.replace(/\bMTN\s+WV\b/gi, "mountain wave");
  txt = txt.replace(/\bRPTD\s+BY\s+ACFT\.?/gi, "reported by aircraft.");
  txt = txt.replace(/\bCONDS\s+CONTG\s+BYD\b/gi, "conditions continuing beyond");
  txt = txt.replace(/\bSEV\s+TURB\b/gi, "severe turbulence");
  txt = txt.replace(/\bSEV\s+ICE\b/gi, "severe icing");
  txt = txt.replace(/\bFRZLVL\b/gi, "freezing level");
  // Translate weather block Zulu times (e.g. 0936Z -> 09:36 UTC)
  txt = txt.replace(/\b(\d{2})(\d{2})Z\b/gi, "$1:$2 UTC");

  // 9. Outlook validation
  txt = txt.replace(/OUTLOOK\s+VALID\s+(\d{2})(\d{2})(\d{2})\-(\d{2})(\d{2})(\d{2})/gi, (match, d1, h1, m1, d2, h2, m2) => {
    const day1 = getDayOrdinal(d1);
    const day2 = getDayOrdinal(d2);
    if (d1 === d2) {
      return `Outlook valid on the ${day1} from ${h1}:${m1} UTC to ${h2}:${m2} UTC`;
    } else {
      return `Outlook valid from ${h1}:${m1} UTC on the ${day1} to ${h2}:${m2} UTC on the ${day2}`;
    }
  });

  // Area numbering in outlook
  txt = txt.replace(/AREA\s+(\d+)\s*\.\.\.\s*FROM/gi, "\n\nArea $1: From ");

  // Expected advisories
  txt = txt.replace(/WST\s+ISSUANCES\s+EXPD\.?/gi, "Convective SIGMET (WST) issuances are expected.");

  // Storm prediction center reference
  txt = txt.replace(/REFER\s+TO\s+MOST\s+RECENT\s+ACUS\d+\s+KWNS\s+FROM\s+STORM\s+PREDICTION\s+CENTER\s+FOR\s+SYNOPSIS\s+AND\s+METEOROLOGICAL\s+DETAILS\.?/gi, 
    "Refer to the latest Storm Prediction Center (ACUS01 KWNS) report for full synopsis and meteorological details.");

  // Prepend the formatted header
  txt = headerText + txt;

  // 10. Post-processing cleanup
  // Clean up double-wrapped VOR names like "Cheyenne (Cheyenne (CYS))" -> "Cheyenne (CYS)"
  txt = txt.replace(/\b([A-Za-z0-9\s\-]+)\s*\(\s*\1\s*\(\s*([A-Z]{3})\s*\)\s*\)/gi, "$1 ($2)");
  // Replace multiple spaces
  txt = txt.replace(/[ \t]+/g, " ");
  // Remove spaces before periods or commas
  txt = txt.replace(/\s+([.,])/g, "$1");
  // Clean up duplicate periods
  txt = txt.replace(/\.{2,}/g, ".");
  // Ensure a space after periods/commas if followed by alphanumeric
  txt = txt.replace(/([.,])([A-Za-z0-9])/g, "$1 $2");
  // Trim each line
  txt = txt.split('\n').map(line => line.trim()).join('\n');
  // Remove consecutive empty lines (limit to max 2 newlines)
  txt = txt.replace(/\n{3,}/g, "\n\n");

  return txt.trim();
}

const inlineWorkerCode = `
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;

  function geodesicSegment(lat1, lon1, lat2, lon2, steps = 80) {
    const φ1 = toRad(lat1), λ1 = toRad(lon1);
    const φ2 = toRad(lat2), λ2 = toRad(lon2);
    const Δφ = φ2 - φ1, Δλ = λ2 - λ1;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < 0.001) return [[lat1, lon1], [lat2, lon2]];
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      pts.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
    }
    return pts;
  }

  self.onmessage = function(e) {
    const { points } = e.data;
    if (!points) {
      self.postMessage({ plannedCoords: [], remArc: [] });
      return;
    }

    const originPt = points.find((p) => p.type === "origin");
    const currentPt = points.find((p) => p.type === "current");
    const destPt = points.find((p) => p.type === "destination");
    const waypointPts = points.filter((p) => p.type === "waypoint");

    let plannedCoords = [];
    if (originPt && currentPt) {
      const seq = [originPt, ...waypointPts, currentPt].filter(Boolean);
      for (let i = 0; i < seq.length - 1; i++) {
        plannedCoords.push(...geodesicSegment(seq[i].latitude, seq[i].longitude, seq[i + 1].latitude, seq[i + 1].longitude, 100));
      }
    }

    let remArc = [];
    if (currentPt && destPt) {
      remArc = geodesicSegment(currentPt.latitude, currentPt.longitude, destPt.latitude, destPt.longitude, 100);
    }

    self.postMessage({ plannedCoords, remArc });
  };
`;

// ─── MapView Component ────────────────────────────────────────────────────────
export default function MapView() {
  const { state, dispatch } = useStore();
  const mapRef          = useRef(null);
  const mapInstanceRef  = useRef(null);
  const tileLayerRef    = useRef(null);
  const markersRef      = useRef(new Map());
  const sigmetLayerRef           = useRef(null);
  const routeLayerRef            = useRef(null);
  const radarLayerRef            = useRef(null);
  const scheduledRouteLayerRef   = useRef(null);
  const lockViewTimerRef = useRef(null);

  const focusFlight = useFocusFlight();
  const [mapReady, setMapReady] = useState(undefined);
  const [radarOpacity, setRadarOpacity] = useState(0.45);
  const [showLegend, setShowLegend] = useState(false);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [mapBounds, setMapBounds] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(3);
  const { fetchFlights } = useFlightPolling(mapReady);

  // Web Worker for asynchronous geodesic calculations
  const [routeCoords, setRouteCoords] = useState({ plannedCoords: [], remArc: [] });
  const geoWorkerRef = useRef(null);

  useEffect(() => {
    const blob = new Blob([inlineWorkerCode], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
      setRouteCoords(e.data);
    };

    geoWorkerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if (state.activeRoute && geoWorkerRef.current) {
      geoWorkerRef.current.postMessage({ points: state.activeRoute.points });
    } else {
      setRouteCoords({ plannedCoords: [], remArc: [] });
    }
  }, [state.activeRoute]);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const WORLD_BOUNDS = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));
    const map = L.map(mapRef.current, {
      zoomControl: false,
      preferCanvas: true,
      worldCopyJump: false,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1.0,
      minZoom: 2,
    }).setView([20, 0], 3);
    L.control.zoom({ position: "topright" }).addTo(map);
    const cfg = TILE_LAYERS.dark;
    tileLayerRef.current = L.tileLayer(cfg.url, cfg.opts).addTo(map);
    mapInstanceRef.current = map;
    setMapReady(map);
    setMapBounds(map.getBounds());

    const initialZoom = map.getZoom();
    setCurrentZoom(initialZoom);

    map.on("moveend", () => {
      dispatch({ type: "SET_FETCHING", value: false });
      setMapBounds(map.getBounds());
      setCurrentZoom(map.getZoom());
    });
    map.on("zoomend", () => {
      setCurrentZoom(map.getZoom());
    });
    map.on("click", () => dispatch({ type: "CLEAR_ROUTE" }));

    return () => map.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WorldWind 3D Globe logic removed


  // ── Tile layer switcher ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) { tileLayerRef.current.remove(); }
    const cfg = TILE_LAYERS[state.tileLayer] || TILE_LAYERS.dark;
    tileLayerRef.current = L.tileLayer(cfg.url, cfg.opts).addTo(map);
  }, [state.tileLayer]);

  // ── Auto-zoom to Selected Airline Region ────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !state.flights || state.flights.length === 0) return;

    // Filter flights belonging ONLY to the selected airlines
    const visible = filterFlights(state.flights, {
      altBand: state.altBand,
      searchQuery: state.searchQuery,
      phaseFilter: state.phaseFilter,
      selectedAirlines: state.selectedAirlines,
      selectedIcao: state.selectedIcao,
    });

    if (visible.length > 0 && state.selectedAirlines.length < AIRLINE_FILTERS.length) {
      const coords = visible.map(f => L.latLng(f.latitude, f.longitude));
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
    }
  }, [state.selectedAirlines]);

  // Region panning removed — worldwide mode, user pans manually


  // ── Marker animation helper ─────────────────────────────────────────────────
  const animateMarker = useCallback((marker, nextLatLng, durationMs = Math.min(POLL_MS * 0.9, 90_000)) => {
    const from = marker.getLatLng();
    const to = L.latLng(nextLatLng);
    const started = performance.now();
    cancelAnimationFrame(marker._aeroAnim);
    function step(now) {
      const p = Math.min((now - started) / durationMs, 1);
      const e = 1 - Math.pow(1 - p, 3);
      marker.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
      if (p < 1) marker._aeroAnim = requestAnimationFrame(step);
    }
    marker._aeroAnim = requestAnimationFrame(step);
  }, []);

  // ── Update markers ──────────────────────────────────────────────────────────
  // Minimum zoom level at which aircraft markers are visible.
  // Below this zoom the map is too zoomed-out for individual planes to be useful.
  const MARKER_MIN_ZOOM = 4;

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const { showLabels, selectedIcao } = state;

    // Hide all markers when zoomed out beyond the threshold
    if (currentZoom < MARKER_MIN_ZOOM) {
      for (const [icao, marker] of markersRef.current.entries()) {
        cancelAnimationFrame(marker._aeroAnim);
        marker.remove();
        markersRef.current.delete(icao);
      }
      return;
    }

    // Apply shared filters (altBand, search, phase, selectedAirlines, selectedIcao)
    const visible = filterFlights(state.flights, {
      altBand: state.altBand,
      searchQuery: state.searchQuery,
      phaseFilter: state.phaseFilter,
      selectedAirlines: state.selectedAirlines,
      selectedIcao: selectedIcao,
    });

    const active = new Set(visible.map((f) => f.icao24));

    for (const flight of visible) {
      const latlng = [flight.latitude, flight.longitude];
      const isSelected = selectedIcao === flight.icao24;
      const icon = L.divIcon({ html: markerHtml(flight, showLabels, isSelected), className: "", iconSize: [40, 40], iconAnchor: [20, 20] });
      
      // Update/Create marker
      const existing = markersRef.current.get(flight.icao24);
      if (existing) {
        animateMarker(existing, latlng);
        existing.setIcon(icon);
        existing.setPopupContent(popupHtml(flight, state.activeRoute, selectedIcao));
      } else {
        const marker = L.marker(latlng, { icon }).bindPopup(popupHtml(flight, state.activeRoute, selectedIcao));
        marker.on("click", () => {
          const ll = marker.getLatLng();
          focusFlight(flight.icao24, ll);
        });
        marker.addTo(map);
        markersRef.current.set(flight.icao24, marker);
      }
    }

    // Remove stale markers and trails
    for (const [icao, marker] of markersRef.current.entries()) {
      if (!active.has(icao)) {
        cancelAnimationFrame(marker._aeroAnim);
        marker.remove();
        markersRef.current.delete(icao);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.flights, state.showLabels, state.altBand, state.searchQuery, state.phaseFilter, state.selectedAirlines, state.selectedIcao, state.activeRoute, currentZoom]);



  // ── SIGMET layer ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (sigmetLayerRef.current) { sigmetLayerRef.current.remove(); sigmetLayerRef.current = null; }
    if (!state.sigmets.length) return;

    const geojson = { type: "FeatureCollection", features: state.sigmets };
    sigmetLayerRef.current = L.geoJSON(geojson, {
      style: (feature) => {
        const severity = normalizeSigmetSeverity(feature.properties);
        const colors = {
          extreme: "#ff3b30",  // Professional crimson warning
          severe: "#ff9500",   // Alert orange
          moderate: "#ffcc00", // Soft yellow
          advisory: "#5ac8fa", // Muted aviation blue for advisories
        };
        const color = colors[severity] || colors.advisory;
        
        const weight = { extreme: 2.0, severe: 1.5, moderate: 1.2, advisory: 1.0 }[severity] || 1.0;
        const opacity = { extreme: 0.7, severe: 0.5, moderate: 0.4, advisory: 0.25 }[severity] || 0.3;
        const fillOpacity = { extreme: 0.18, severe: 0.12, moderate: 0.08, advisory: 0.03 }[severity] || 0.05;

        return {
          className: `sigmet-${severity}`,
          color,
          fillColor: color,
          weight,
          opacity,
          fillOpacity,
          dashArray: severity === "advisory" ? "4 6" : null,
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const hazards = extractHazards(feature);
        const hazardText = hazards.length ? hazards.join(" • ") : props.hazard || props.airSigmetType || "SIGMET Advisory";
        const severity = normalizeSigmetSeverity(props);
        const rawText = props.rawAirSigmet || props.rawText || props.raw_text || "";
        
        const severityColors = { extreme: "#ff4f5e", severe: "#ff8a80", moderate: "#ffca7a", advisory: "#b8c3ff" };
        const color = severityColors[severity] || severityColors.advisory;

        const validFrom = props.validTimeFrom ? new Date(props.validTimeFrom).toISOString().slice(11, 16) + "Z" : "--";
        const validTo = props.validTimeTo ? new Date(props.validTimeTo).toISOString().slice(11, 16) + "Z" : "--";

        const popupContent = `
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--color-on-surface);min-width:240px;padding:2px">
            <div style="font-family:Geist,sans-serif;font-size:12px;color:#ffca7a;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:4px">
              <span class="material-symbols-outlined" style="font-size:14px;color:${color}">warning</span>
              <span>METEOROLOGICAL ADVISORY</span>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;border-top:1px solid var(--glass-border);padding-top:6px;margin-bottom:6px">
              <span style="color:var(--color-on-surface-variant)">HAZARD</span>
              <span style="color:var(--color-primary);text-align:right;font-weight:bold">${hazardText.toUpperCase()}</span>
              <span style="color:var(--color-on-surface-variant)">SEVERITY</span>
              <span style="color:${color};text-align:right;font-weight:bold">${severity.toUpperCase()}</span>
              <span style="color:var(--color-on-surface-variant)">VALID FROM</span>
              <span style="color:var(--color-primary);text-align:right">${validFrom}</span>
              <span style="color:var(--color-on-surface-variant)">VALID TO</span>
              <span style="color:var(--color-primary);text-align:right">${validTo}</span>
            </div>
            
            ${rawText ? `
              <div style="font-size:10px;color:var(--color-primary);border-top:1px dashed var(--glass-border);padding-top:6px;margin-bottom:6px;line-height:1.4;white-space:pre-wrap;font-family:monospace">
                ${rawText}
              </div>
            ` : ""}
          </div>
        `;
        layer.bindPopup(popupContent, { maxWidth: 280 });
      },
    });
    if (state.sigmetsVisible) sigmetLayerRef.current.addTo(map);
  }, [state.sigmets]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !sigmetLayerRef.current) return;
    if (state.sigmetsVisible) sigmetLayerRef.current.addTo(map);
    else sigmetLayerRef.current.remove();
  }, [state.sigmetsVisible]);

  // ── Nexrad radar layer ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (state.radarVisible) {
      if (!radarLayerRef.current) {
        radarLayerRef.current = L.tileLayer("https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png", {
          maxZoom: 19,
          opacity: radarOpacity,
          transparent: true,
          attribution: "IEM Nexrad"
        }).addTo(map);
      } else {
        radarLayerRef.current.setOpacity(radarOpacity);
      }
    } else {
      if (radarLayerRef.current) {
        radarLayerRef.current.remove();
        radarLayerRef.current = null;
      }
    }
  }, [state.radarVisible, radarOpacity]);

  // ── Scheduled Route overlay ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (scheduledRouteLayerRef.current) {
      scheduledRouteLayerRef.current.remove();
      scheduledRouteLayerRef.current = null;
    }
    const sr = state.selectedScheduledRoute;
    if (!sr) return;

    const lg = L.layerGroup().addTo(map);
    scheduledRouteLayerRef.current = lg;

    const dep = sr.dep_coords;
    const arr = sr.arr_coords;
    if (!dep || !arr) return;

    // Build geodesic arc from dep to arr
    const arcPts = geodesicSegment(dep.lat, dep.lon, arr.lat, arr.lon, 120);

    // Glow underline
    L.polyline(arcPts, {
      color: "#ff9f00", weight: 8, opacity: 0.10, interactive: false,
    }).addTo(lg);

    // Dashed amber route line
    L.polyline(arcPts, {
      color: "#ff9f00", weight: 2, opacity: 0.85,
      dashArray: "10 8", className: "scheduled-route-line", interactive: false,
    }).addTo(lg);

    // Airport badge helper
    function airportBadge(coord, code, name, emoji) {
      const icon = L.divIcon({
        className: "",
        iconSize: [60, 42],
        iconAnchor: [30, 38],
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="font-size:16px;filter:drop-shadow(0 0 5px #ff9f00)">${emoji}</div>
          <div style="font-size:9px;font-family:'JetBrains Mono',monospace;font-weight:700;
                      color:#ff9f00;white-space:nowrap;letter-spacing:0.05em;
                      text-shadow:0 0 8px #061422;background:rgba(6,20,34,0.85);
                      padding:1px 5px;border-radius:3px;border:1px solid rgba(255,159,0,0.4)">${code}</div>
        </div>`,
      });
      return L.marker([coord.lat, coord.lon], { icon })
        .bindTooltip(`<b style="color:#ff9f00">${code}</b><br><span style="font-size:10px">${name || code}</span>`, { sticky: false, direction: "top" });
    }

    airportBadge(dep, sr.dep_iata, dep.name, "🛫").addTo(lg);
    airportBadge(arr, sr.arr_iata, arr.name, "🛬").addTo(lg);

    // Mid-path label
    const mid = arcPts[Math.floor(arcPts.length / 2)];
    if (mid) {
      const flight = sr.route;
      const flightLabel = flight.flight_iata || flight.flight_icao || "–";
      const midIcon = L.divIcon({
        className: "",
        iconSize: [130, 22],
        iconAnchor: [65, 11],
        html: `<div style="font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;
                            color:#ff9f00;background:rgba(6,20,34,0.85);padding:2px 10px;
                            border-radius:99px;border:1px solid rgba(255,159,0,0.35);
                            text-align:center;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4)">
          ${sr.dep_iata} → ${sr.arr_iata} · ${flightLabel}
        </div>`,
      });
      L.marker(mid, { icon: midIcon, interactive: false }).addTo(lg);
    }

    // Fit the arc
    map.fitBounds(L.latLngBounds(arcPts), { padding: [90, 110], maxZoom: 6 });
  }, [state.selectedScheduledRoute]);

  // ── Route layer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }
    if (!state.activeRoute) return;

    const lg = L.layerGroup().addTo(map);
    routeLayerRef.current = lg;

    const svgRenderer = L.svg();

    const { points } = state.activeRoute;
    const originPt  = points.find((p) => p.type === "origin");
    const currentPt = points.find((p) => p.type === "current");
    const destPt    = points.find((p) => p.type === "destination");

    const air = state.activeRoute?.aircraft;
    const { plannedCoords, remArc } = routeCoords;

    // Planned/Flown Route: Dashed Gray Line + Hover Tooltip + Midpoint Label
    if (originPt && currentPt && plannedCoords && plannedCoords.length > 0) {
      const plannedPolyline = L.polyline(plannedCoords, {
        renderer: svgRenderer,
        color: "#9ca3af", // Gray dashed line representing flown track
        weight: 2.5,
        opacity: 0.75,
        dashArray: "6 6",
        className: "route-line-planned"
      }).addTo(lg);

      // Bind hover details tooltip
      const airlineStr = air?.airline_iata || "Unknown Airline";
      const flightStr = air?.flight_number ? `${air.airline_iata || ""}${air.flight_number}` : (air?.callsign || "Unknown Flight");
      const durationStr = air?.duration_min ? `${Math.floor(air.duration_min / 60)}h ${air.duration_min % 60}m` : "Unknown";
      const tooltipHtml = `
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:4px">
          <div style="color:#00f2ff;font-weight:bold;margin-bottom:4px">${flightStr} (${airlineStr})</div>
          <div style="color:var(--color-on-surface)">ROUTE: ${originPt.label} → ${destPt?.label || 'Destination'}</div>
          <div style="color:var(--color-on-surface-variant)">DEP: ${air?.origin_name || originPt.label}</div>
          <div style="color:var(--color-on-surface-variant)">ARR: ${air?.destination_name || destPt?.label || 'N/A'}</div>
          <div style="color:var(--color-on-surface-variant);margin-top:2px">EST DURATION: ${durationStr}</div>
        </div>
      `;
      plannedPolyline.bindTooltip(tooltipHtml, { sticky: true });

      // Route midpoint label
      const midCoord = plannedCoords[Math.floor(plannedCoords.length / 2)];
      if (midCoord && destPt) {
        const midIcon = L.divIcon({
          className: "",
          iconSize: [80, 24],
          iconAnchor: [40, 12],
          html: `
            <div class="glass-panel" style="font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:bold;
                        color:#ffca7a;border:1px solid rgba(255,202,122,0.3);
                        background:rgba(6,20,34,0.85);padding:2px 8px;border-radius:99px;
                        text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">
              ${originPt.label} → ${destPt.label}
            </div>
          `
        });
        L.marker(midCoord, { icon: midIcon, interactive: false }).addTo(lg);
      }
    }

    // Remaining segment (drawn in all modes to show direction to destination)
    if (currentPt && destPt && remArc && remArc.length > 0) {
      L.polyline(remArc, { renderer: svgRenderer, color: "#00f2ff", weight: 7, opacity: 0.15 }).addTo(lg);
      L.polyline(remArc, { renderer: svgRenderer, color: "#00f2ff", weight: 2.5, opacity: 0.95, dashArray: "14 8", className: "route-line-animated flow-trail" }).addTo(lg);
    }

    // Airport pins (rendered as custom badges, matching original styling structure)
    function airportMarker(pt, emoji) {
      const icon = L.divIcon({
        className: "",
        iconSize: [50, 42],
        iconAnchor: [25, 38],
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="font-size:18px;line-height:1;filter:drop-shadow(0 0 6px #ffca7a)">${emoji}</div>
          <div style="font-size:10px;font-family:'JetBrains Mono',monospace;font-weight:600;
                      color:#ffca7a;white-space:nowrap;letter-spacing:0.05em;
                      text-shadow:0 0 8px #061422,0 0 4px #061422;
                      background:rgba(6,20,34,0.82);padding:1px 5px;border-radius:3px;
                      border:1px solid rgba(255,202,122,0.4)">${pt.label}</div>
        </div>`,
      });
      return L.marker([pt.latitude, pt.longitude], { icon });
    }

    function setupAirportPopup(marker, pt, typeLabel) {
      const air = state.activeRoute?.aircraft;
      if (!air) return;
      const isOrigin = pt.type === "origin";
      const iata = isOrigin ? air.origin_iata : air.destination_iata;
      const icao = isOrigin ? air.origin_icao : air.destination_icao;
      const name = isOrigin ? air.origin_name : air.destination_name;
      const displayCode = [iata, icao].filter(Boolean).join(" / ");
      
      const popupContent = document.createElement("div");
      popupContent.style.minWidth = "220px";
      popupContent.style.padding = "2px";
      popupContent.style.color = "var(--color-on-surface)";

      popupContent.innerHTML = `
        <div style="font-family:Geist,sans-serif;font-size:12px;color:#ffca7a;font-weight:600;margin-bottom:3px">
          ${typeLabel}
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--color-primary);font-weight:600;margin-bottom:2px">
          ${displayCode}
        </div>
        <div style="font-family:Geist,sans-serif;color:var(--color-on-surface-variant);font-size:10px;margin-bottom:10px;line-height:1.3">
          ${name || "Airport details"}
        </div>
        <div class="airport-metar-loading" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--color-primary-container);display:flex;align-items:center;gap:6px">
          <span class="material-symbols-outlined text-sm radar-spinning">sync</span>
          <span>Loading METAR weather...</span>
        </div>
        <div class="airport-metar-details" style="display:none;font-family:'JetBrains Mono',monospace;font-size:10px;flex-direction:column;gap:6px;border-top:1px solid var(--glass-border);padding-top:8px">
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 280 });

      marker.on("popupopen", async () => {
        const queryCode = icao || (iata ? (iata.length === 3 ? "K" + iata : iata) : null);
        if (!queryCode) {
          const loadingDiv = popupContent.querySelector(".airport-metar-loading");
          if (loadingDiv) {
            loadingDiv.innerHTML = `<span style="color:var(--color-error)">Weather data unavailable</span>`;
          }
          return;
        }

        try {
          const res = await fetch(`${API_BASE}/api/weather/metars?ids=${queryCode}`);
          if (!res.ok) throw new Error(`Status ${res.status}`);
          const data = await res.json();
          const obs = data.observations?.[0];

          const detailsDiv = popupContent.querySelector(".airport-metar-details");
          const loadingDiv = popupContent.querySelector(".airport-metar-loading");

          if (!obs) {
            if (loadingDiv) {
              loadingDiv.innerHTML = `<span style="color:var(--color-on-surface-variant)">No recent METAR reports</span>`;
            }
            return;
          }

          const windDir = obs.wind_direction_deg != null ? `${obs.wind_direction_deg}°` : "VRB";
          const windSpd = obs.wind_speed_kt != null ? `${obs.wind_speed_kt} KT` : "--";
          const gust = obs.wind_gust_kt ? ` G${obs.wind_gust_kt}` : "";
          const temp = obs.temperature_c != null ? `${obs.temperature_c}°C` : "--";
          const vis = obs.visibility_sm != null ? `${obs.visibility_sm} SM` : "--";
          const alt = obs.altimeter_in_hg != null ? `${obs.altimeter_in_hg.toFixed(2)} IN` : "--";
          const cat = obs.flight_category || "VFR";

          const catColors = {
            VFR: "var(--color-phase-climb)",
            MVFR: "var(--color-phase-cruise)",
            IFR: "var(--color-phase-descend)",
            LIFR: "var(--color-error)"
          };
          const catColor = catColors[cat] || "var(--color-on-surface)";

          if (detailsDiv && loadingDiv) {
            detailsDiv.innerHTML = `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px">
                <span style="color:var(--color-on-surface-variant)">CATEGORY</span>
                <span style="color:${catColor};text-align:right;font-weight:bold">${cat}</span>
                <span style="color:var(--color-on-surface-variant)">WIND</span>
                <span style="color:var(--color-primary);text-align:right">${windDir} / ${windSpd}${gust}</span>
                <span style="color:var(--color-on-surface-variant)">TEMP</span>
                <span style="color:var(--color-primary);text-align:right">${temp}</span>
                <span style="color:var(--color-on-surface-variant)">VISIB</span>
                <span style="color:var(--color-primary);text-align:right">${vis}</span>
                <span style="color:var(--color-on-surface-variant)">ALTIMETER</span>
                <span style="color:var(--color-primary);text-align:right">${alt}</span>
              </div>
            `;
            loadingDiv.style.display = "none";
            detailsDiv.style.display = "flex";
          }
        } catch (e) {
          const loadingDiv = popupContent.querySelector(".airport-metar-loading");
          if (loadingDiv) {
            loadingDiv.innerHTML = `<span style="color:var(--color-error)">Weather fetch failed</span>`;
          }
        }
      });
    }

    if (originPt) {
      const marker = airportMarker(originPt, "🛫").addTo(lg);
      setupAirportPopup(marker, originPt, "ORIGIN AIRPORT");
    }
    if (destPt) {
      const marker = airportMarker(destPt, "🛬").addTo(lg);
      setupAirportPopup(marker, destPt, "DESTINATION AIRPORT");
    }
    if (currentPt) {
      L.circleMarker([currentPt.latitude, currentPt.longitude], { radius: 7, color: "#62ff96", fillColor: "#62ff96", fillOpacity: 1, weight: 2.5 })
        .bindTooltip(`✈ ${currentPt.label} (live)`, { permanent: false, direction: "top" })
        .addTo(lg);
    }

    // Fit bounds
    const allCoords = points.map((p) => [p.latitude, p.longitude]);
    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [90, 110], maxZoom: 7 });
    }
  }, [state.activeRoute, routeCoords]);

  // Trails removed — no trail rendering


  // ── Lock View — keep map centered on selected aircraft ──────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !state.lockView || !state.selectedIcao) return;
    clearInterval(lockViewTimerRef.current);
    lockViewTimerRef.current = setInterval(() => {
      const flight = state.flights.find((f) => f.icao24 === state.selectedIcao);
      const marker = markersRef.current.get(state.selectedIcao);
      if (marker) {
        const ll = marker.getLatLng();
        map.panTo(ll, { animate: true, duration: 0.5 });
      } else if (flight) {
        map.panTo([flight.latitude, flight.longitude], { animate: true, duration: 0.5 });
      }
    }, 3000);
    return () => clearInterval(lockViewTimerRef.current);
  }, [state.lockView, state.selectedIcao, state.flights]);

  // Calculate current deviation for active flight
  let currentDeviation = 0;
  let deviationActive = false;
  if (state.selectedIcao && state.activeRoute) {
    const flight = state.flights.find((f) => f.icao24 === state.selectedIcao);
    if (flight) {
      const originPt = state.activeRoute.points.find((p) => p.type === "origin");
      const destPt = state.activeRoute.points.find((p) => p.type === "destination");
      if (originPt && destPt) {
        currentDeviation = crossTrackDistance(
          flight.latitude,
          flight.longitude,
          originPt.latitude,
          originPt.longitude,
          destPt.latitude,
          destPt.longitude
        );
        deviationActive = currentDeviation >= 10;
      }
    }
  }

  // ── Map Controls ────────────────────────────────────────────────────────────
  return (
    <div className="relative flex-1 h-full overflow-hidden bg-background">
      {/* Leaflet container */}
      <div
        ref={mapRef}
        className="absolute inset-0 z-10"
      />

      {/* Vignette overlay */}
      <div className="absolute inset-0 pointer-events-none z-[420] bg-[radial-gradient(circle_at_center,transparent_0%,rgba(6,20,34,0.45)_100%)]" />

      {/* Zoom-in hint — shown when zoomed out too far for markers to appear */}
      {currentZoom < 4 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[800] pointer-events-none">
          <div className="glass-panel px-5 py-3 rounded-2xl border border-primary/20 flex items-center gap-3 shadow-2xl">
            <span className="material-symbols-outlined text-primary text-xl animate-pulse">zoom_in</span>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] text-primary tracking-widest font-semibold">ZOOM IN TO SEE FLIGHTS</span>
              <span className="font-mono text-[9px] text-on-surface-variant">Aircraft markers appear at zoom level 4+</span>
            </div>
          </div>
        </div>
      )}

      {/* Route deviation alert HUD */}
      {deviationActive && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[800] glass-panel px-4 py-2.5 rounded-xl border border-error/40 bg-error/15 flex items-center gap-2.5 shadow-lg animate-pulse">
          <span className="material-symbols-outlined text-error text-lg">warning</span>
          <div className="flex flex-col">
            <span className="font-display font-semibold text-[10px] text-error tracking-wider uppercase">ROUTE DEVIATION DETECTED</span>
            <span className="font-mono text-xs text-primary font-bold">DEVIATION: {Math.round(currentDeviation)} km</span>
          </div>
        </div>
      )}

      {/* Floating Route panel — shown when an aircraft is selected */}
      {state.selectedIcao && (
        <div className="absolute left-6 top-6 z-[800] flex flex-col gap-3 w-[220px] glass-panel p-4 rounded-xl shadow-2xl border border-on-surface/10 animate-fade-in">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-sm">route</span>
            <span className="font-display font-semibold text-[10px] text-primary tracking-widest">ROUTE DISPLAY</span>
          </div>
          <p className="font-mono text-[9px] text-on-surface-variant">
            Click an aircraft marker to load its planned route.
          </p>
        </div>
      )}

      {/* Tactical Control Console */}
      {!consoleExpanded ? (
        <button
          onClick={() => setConsoleExpanded(true)}
          className="absolute left-6 bottom-6 z-[800] w-12 h-12 rounded-xl glass-panel flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/40 transition-all shadow-lg active:scale-95"
          title="Open Tactical Console"
        >
          <span className="material-symbols-outlined text-2xl">settings_input_component</span>
          {state.sigmets.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error border border-background shadow-[0_0_6px_rgba(255,79,94,0.6)] animate-pulse" />
          )}
        </button>
      ) : (
        <div className="absolute left-6 bottom-6 z-[800] flex flex-col gap-3.5 w-[280px] glass-panel p-4 rounded-xl shadow-2xl border border-on-surface/10 animate-fade-in">
          <div className="flex justify-between items-center pb-2 border-b border-on-surface/10">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-sm animate-pulse">settings_input_component</span>
              <span className="font-display font-semibold text-[10px] text-primary tracking-widest">TACTICAL CONSOLE</span>
            </div>
            {/* Collapse button */}
            <button
              onClick={() => setConsoleExpanded(false)}
              className="text-on-surface-variant hover:text-primary p-0.5 rounded transition-colors flex items-center justify-center hover:bg-on-surface/5"
              title="Collapse console"
            >
              <span className="material-symbols-outlined text-sm leading-none">close</span>
            </button>
          </div>

          {/* Section: Base Layers */}
          <div className="flex flex-col gap-1.5">
            <div className="font-mono text-[9px] text-on-surface-variant tracking-wider uppercase">BASE CHART</div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: "dark", label: "DARK" },
                { id: "light", label: "LIGHT" },
                { id: "satellite", label: "SAT" },
                { id: "terrain", label: "TERR" }
              ].map((layer) => {
                const isSelected = state.tileLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    onClick={() => {
                      dispatch({ type: "SET_TILE_LAYER", layer: layer.id });
                      if (layer.id === "dark" && state.theme !== "dark") dispatch({ type: "TOGGLE_THEME" });
                      if (layer.id === "light" && state.theme !== "light") dispatch({ type: "TOGGLE_THEME" });
                    }}
                    className={`py-1.5 rounded text-[9px] font-mono border transition-all ${
                      isSelected
                        ? "bg-primary/20 text-primary border-primary/40 shadow-[0_0_8px_rgba(0,242,255,0.1)]"
                        : "text-on-surface-variant border-transparent hover:bg-on-surface/5"
                    }`}
                  >
                    {layer.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Cockpit Toggles */}
          <div className="flex flex-col gap-2.5 py-1.5 border-y border-on-surface/5">
            {/* Radar Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">grain</span>
                <span className="font-mono text-[10px] text-on-surface-variant">NEXRAD RADAR</span>
              </div>
              <label className="cockpit-switch">
                <input
                  id="toggle-radar"
                  type="checkbox"
                  className="cockpit-switch-input"
                  checked={state.radarVisible}
                  onChange={() => dispatch({ type: "TOGGLE_RADAR" })}
                />
                <div className="cockpit-switch-track">
                  <div className="cockpit-switch-lever"></div>
                </div>
                <div className="cockpit-switch-indicator"></div>
              </label>
            </div>

            {/* Radar Opacity Slider (visible only when radar is enabled) */}
            {state.radarVisible && (
              <div className="flex flex-col gap-1 pl-5 animate-fade-in">
                <div className="flex justify-between text-[8px] font-mono text-on-surface-variant">
                  <span>RADAR OPACITY</span>
                  <span>{Math.round(radarOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={radarOpacity}
                  onChange={(e) => setRadarOpacity(parseFloat(e.target.value))}
                  className="w-full h-1 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            )}

            {/* SIGMET Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">thunderstorm</span>
                <span className="font-mono text-[10px] text-on-surface-variant">SIGMET ADVISORIES</span>
              </div>
              <label className="cockpit-switch">
                <input
                  id="toggle-sigmets"
                  type="checkbox"
                  className="cockpit-switch-input"
                  checked={state.sigmetsVisible}
                  onChange={() => dispatch({ type: "TOGGLE_SIGMETS" })}
                />
                <div className="cockpit-switch-track">
                  <div className="cockpit-switch-lever"></div>
                </div>
                <div className="cockpit-switch-indicator"></div>
              </label>
            </div>

            {/* Callsign Label Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-on-surface-variant">label</span>
                <span className="font-mono text-[10px] text-on-surface-variant">CALLSIGN LABELS</span>
              </div>
              <label className="cockpit-switch">
                <input
                  type="checkbox"
                  className="cockpit-switch-input"
                  checked={state.showLabels}
                  onChange={() => dispatch({ type: "TOGGLE_LABELS" })}
                />
                <div className="cockpit-switch-track">
                  <div className="cockpit-switch-lever"></div>
                </div>
                <div className="cockpit-switch-indicator"></div>
              </label>
            </div>
          </div>

          {/* Section: Weather Legend (Collapsible) */}
          <div className="flex flex-col gap-1.5">
            <button 
              onClick={() => setShowLegend(!showLegend)}
              className="flex items-center justify-between font-mono text-[9px] text-on-surface-variant tracking-wider uppercase hover:text-primary transition-colors"
            >
              <span>WEATHER LEGEND</span>
              <span className="material-symbols-outlined text-xs leading-none">
                {showLegend ? "expand_less" : "expand_more"}
              </span>
            </button>
            
            {showLegend && (
              <div className="flex flex-col gap-2 pt-1 border-t border-on-surface/5 animate-fade-in">
                {/* METAR / Flight Category */}
                <div>
                  <div className="text-[8px] font-mono text-on-surface-variant mb-1 font-semibold">FLIGHT CATEGORIES (METAR)</div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: "VFR", label: "VFR", bg: "bg-tertiary-fixed/10 border-tertiary-fixed/30 text-tertiary-fixed" },
                      { id: "MVFR", label: "MVFR", bg: "bg-secondary/10 border-secondary/30 text-secondary" },
                      { id: "IFR", label: "IFR", bg: "bg-error/10 border-error/30 text-error" },
                      { id: "LIFR", label: "LIFR", bg: "bg-red-500/10 border-red-500/30 text-red-400" }
                    ].map((cat) => (
                      <div 
                        key={cat.id} 
                        className={`text-center py-0.5 rounded text-[8px] font-mono border font-semibold ${cat.bg}`}
                        title={cat.id}
                      >
                        {cat.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* SIGMET Severity */}
                <div>
                  <div className="text-[8px] font-mono text-on-surface-variant mb-1 font-semibold">SIGMET SEVERITY</div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: "adv", label: "ADVSY", bg: "bg-[#b8c3ff]/10 border-[#b8c3ff]/30 text-[#b8c3ff]" },
                      { id: "mod", label: "MOD", bg: "bg-[#ffca7a]/10 border-[#ffca7a]/30 text-[#ffca7a]" },
                      { id: "sev", label: "SEV", bg: "bg-[#ff8a80]/10 border-[#ff8a80]/30 text-[#ff8a80]" },
                      { id: "ext", label: "EXTR", bg: "bg-[#ff4f5e]/10 border-[#ff4f5e]/30 text-[#ff4f5e]" }
                    ].map((sev) => (
                      <div 
                        key={sev.id} 
                        className={`text-center py-0.5 rounded text-[8px] font-mono border font-semibold ${sev.bg}`}
                        title={sev.label}
                      >
                        {sev.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-on-surface/10">
            <button
              id="refresh-now"
              onClick={() => fetchFlights(true)}
              className="flex-1 py-1.5 rounded-lg border border-on-surface/10 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-1 text-[10px] font-mono text-on-surface-variant hover:text-primary"
              title="Refresh aircraft"
            >
              <span className={`material-symbols-outlined text-[14px] ${state.isFetching ? "radar-spinning" : ""}`}>radar</span>
              <span>SCAN</span>
            </button>
            <button
              id="locate-us"
              onClick={() => {
                mapInstanceRef.current?.setView(US_CENTER, US_ZOOM);
              }}
              className="flex-1 py-1.5 rounded-lg border border-on-surface/10 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-1 text-[10px] font-mono text-on-surface-variant hover:text-primary"
              title="US overview"
            >
              <span className="material-symbols-outlined text-[14px]">navigation</span>
              <span>CENTER</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
