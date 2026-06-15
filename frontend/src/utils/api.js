// ─── API base URL ─────────────────────────────────────────────────────────────
const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1"]);
export const API_BASE =
  window.AERO_API_BASE ||
  (LOCAL_HOSTS.has(window.location.hostname) ? "http://127.0.0.1:8000" : "https://aero-o7ph.onrender.com");

// Polling is driven by the backend scheduler — the frontend no longer needs POLL_MS.
// Kept as a fallback constant in case SSE is unavailable.
export const POLL_MS = 600_000; // 10 minutes (fallback only)
export const US_CENTER = [39.5, -98.35];
export const US_ZOOM = 5;
export const US_BBOX = { lamin: 24, lomin: -125, lamax: 50, lomax: -66 };
export const MAX_CLIENT_BBOX_AREA = 1800;
export const US_METAR_STATIONS = "KJFK,KLAX,KORD,KATL,KDFW,KDEN,KSFO,KMIA";

// SSE endpoint for real-time flight refresh events from the backend scheduler
export const SSE_URL = `${API_BASE}/api/flights/stream`;

// ─── URL builders ─────────────────────────────────────────────────────────────
export function flightsUrl(map) {
  let bbox = US_BBOX;
  if (map && typeof map.getBounds === "function") {
    try {
      const b = map.getBounds();
      const south = Math.max(US_BBOX.lamin, b.getSouth());
      const west = Math.max(US_BBOX.lomin, b.getWest());
      const north = Math.min(US_BBOX.lamax, b.getNorth());
      const east = Math.min(US_BBOX.lomax, b.getEast());
      const area = (north - south) * (east - west);
      if (south < north && west < east && area <= MAX_CLIENT_BBOX_AREA) {
        bbox = { lamin: south.toFixed(5), lomin: west.toFixed(5), lamax: north.toFixed(5), lomax: east.toFixed(5) };
      }
    } catch (e) {
      console.warn("Failed to get map bounds, using fallback:", e);
    }
  }
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
