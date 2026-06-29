// ─── API base URL ─────────────────────────────────────────────────────────────
const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1"]);
export const API_BASE =
  window.AERO_API_BASE ||
  (LOCAL_HOSTS.has(window.location.hostname) ? "http://127.0.0.1:8000" : "https://aero-o7ph.onrender.com");

export const POLL_MS = 300_000; // 5 minutes (fallback only)
export const WORLD_CENTER = [20, 0];
export const WORLD_ZOOM = 3;
export const WORLD_BBOX = { lamin: -90, lomin: -180, lamax: 90, lomax: 180 };
export const MAX_CLIENT_BBOX_AREA = 65000;
export const US_CENTER = WORLD_CENTER;  // kept for backward compat
export const US_ZOOM = WORLD_ZOOM;      // kept for backward compat
export const US_METAR_STATIONS = "KJFK,KLAX,KORD,KATL,KDFW,KDEN,KSFO,KMIA";

// SSE endpoint for real-time flight refresh events from the backend scheduler
export const SSE_URL = `${API_BASE}/api/flights/stream`;

// ─── URL builders ─────────────────────────────────────────────────────────────
export function flightsUrl(map) {
  // Always fetch from the worldwide bbox — filtering is done client-side by airline
  const bbox = WORLD_BBOX;
  return `${API_BASE}/api/flights/region?${new URLSearchParams({ ...bbox, t: Date.now() })}`;
}

export function aircraftUrl(flight) {
  return `${API_BASE}/api/flights/aircraft/${encodeURIComponent(flight.icao24)}?${new URLSearchParams({
    latitude: flight.latitude,
    longitude: flight.longitude,
    t: Date.now(),
  })}`;
}

export function aircraftRouteUrl(icao24, latitude, longitude) {
  return `${API_BASE}/api/flights/aircraft/${encodeURIComponent(icao24)}/route?${new URLSearchParams({
    latitude, longitude, t: Date.now(),
  })}`;
}
