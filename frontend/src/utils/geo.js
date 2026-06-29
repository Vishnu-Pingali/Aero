// ─── Number helpers ───────────────────────────────────────────────────────────
export function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "--";
}

// ─── Bearing / geodesic ───────────────────────────────────────────────────────
export function bearingTo(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const φ1 = lat1 * toR, φ2 = lat2 * toR;
  const Δλ = (lon2 - lon1) * toR;
  const x = Math.sin(Δλ) * Math.cos(φ2);
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

export function flightBearing(flight) {
  const { destination_latitude: dLat, destination_longitude: dLon } = flight;
  if (dLat != null && dLon != null) {
    return bearingTo(flight.latitude, flight.longitude, dLat, dLon);
  }
  if (Number.isFinite(flight.heading) && flight.heading !== 0) {
    return flight.heading;
  }
  const { origin_latitude: oLat, origin_longitude: oLon } = flight;
  if (oLat != null && oLon != null) {
    return bearingTo(oLat, oLon, flight.latitude, flight.longitude);
  }
  return 0;
}

const toRad = (d) => d * Math.PI / 180;
const toDeg = (r) => r * 180 / Math.PI;

export function geodesicSegment(lat1, lon1, lat2, lon2, steps = 80) {
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

// ─── Great-circle distance (km) ───────────────────────────────────────────────
export function gcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1), Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Cross-track distance (km deviation from planned track) ────────────────────
export function crossTrackDistance(latVal, lonVal, lat1, lon1, lat2, lon2) {
  const R = 6371;
  const d13 = gcDistance(lat1, lon1, latVal, lonVal);
  const angularDist = d13 / R;
  const bear13 = toRad(bearingTo(lat1, lon1, latVal, lonVal));
  const bear12 = toRad(bearingTo(lat1, lon1, lat2, lon2));
  
  const xt = Math.asin(Math.sin(angularDist) * Math.sin(bear13 - bear12)) * R;
  return Math.abs(xt);
}


// ─── Route progress % ─────────────────────────────────────────────────────────
export function routeProgress(aircraft) {
  const { origin_latitude: oLat, origin_longitude: oLon,
          destination_latitude: dLat, destination_longitude: dLon,
          latitude, longitude } = aircraft;
  if (oLat == null || oLon == null || dLat == null || dLon == null) return null;
  const total = gcDistance(oLat, oLon, dLat, dLon);
  const flown = gcDistance(oLat, oLon, latitude, longitude);
  if (total < 1) return null;
  return Math.min(100, Math.round((flown / total) * 100));
}

// ─── Flight phase ─────────────────────────────────────────────────────────────
export function flightPhase(flight) {
  if (flight.on_ground) return "ground";
  const vs = flight.vertical_rate_fpm;
  if (vs != null && vs > 200)  return "climb";
  if (vs != null && vs < -200) return "descend";
  return "cruise";
}

export const PHASE_COLORS = {
  climb:   { color: "var(--color-phase-climb)",   glow: "var(--glow-climb)"   },
  descend: { color: "var(--color-phase-descend)", glow: "var(--glow-descend)"  },
  cruise:  { color: "var(--color-phase-cruise)",  glow: "var(--glow-cruise)"    },
  ground:  { color: "var(--color-phase-ground)",  glow: "var(--glow-ground)"   },
};

// ─── SIGMET helpers ───────────────────────────────────────────────────────────
export function normalizeSigmetSeverity(properties = {}) {
  const value = properties.severity;
  if (typeof value === "number") {
    if (value >= 6) return "extreme";
    if (value >= 4) return "severe";
    if (value >= 2) return "moderate";
    return "advisory";
  }
  if (typeof value === "string" && value.trim()) {
    const l = value.toLowerCase();
    if (["extreme", "severe", "moderate", "advisory"].includes(l)) return l;
  }
  const text = JSON.stringify(properties).toUpperCase();
  if (text.includes("EXTREME")) return "extreme";
  if (text.includes("SEV") || text.includes("CONV") || text.includes("ASH")) return "severe";
  if (text.includes("MOD")) return "moderate";
  return "advisory";
}

export function extractHazards(feature) {
  const text = JSON.stringify(feature.properties || {}).toLowerCase();
  const hazards = [];
  if (text.includes("thunderstorm") || text.includes("convective") || text.includes(" ts ")) hazards.push("Thunderstorm");
  if (text.includes("fog")) hazards.push("Fog");
  if (text.includes("hail")) hazards.push("Hail");
  if (text.includes("icing") || text.includes(" ice ")) hazards.push("Icing");
  if (text.includes("turbulence") || text.includes("turb")) hazards.push("Turbulence");
  if (text.includes("ash") || text.includes("volcanic")) hazards.push("Volcanic ash");
  if (text.includes("dust")) hazards.push("Dust");
  return hazards;
}

export const US_BBOX_CONST = { lamin: 24, lomin: -125, lamax: 50, lomax: -66 };

export function featureIntersectsUsBbox(feature) {
  const coords = [];
  collectCoords(feature.geometry?.coordinates, coords);
  return coords.some(([lon, lat]) =>
    lat >= US_BBOX_CONST.lamin && lat <= US_BBOX_CONST.lamax &&
    lon >= US_BBOX_CONST.lomin && lon <= US_BBOX_CONST.lomax
  );
}

function collectCoords(value, out) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") { out.push(value); return; }
  value.forEach((c) => collectCoords(c, out));
}
