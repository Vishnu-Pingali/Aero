import { createContext, useContext, useReducer, useCallback } from "react";

// ─── Altitude band presets ─────────────────────────────────────────────────────
export const ALT_BANDS = {
  all: { label: "ALL", min: 0, max: Infinity, icon: "layers" },
  ground: { label: "GND", min: -1, max: 1000, icon: "flight_land" },
  low: { label: "<10K", min: 0, max: 10000, icon: "arrow_cool_down" },
  mid: { label: "10–35K", min: 10000, max: 35000, icon: "flight" },
  high: { label: ">35K", min: 35000, max: 99999, icon: "flight_takeoff" },
};

// ─── Airline filter presets ─────────────────────────────────────────────────────
// These are the ONLY airlines tracked in this system.
export const AIRLINE_FILTERS = [
  // icaoPrefixes includes both ICAO callsign prefix AND IATA code, since AirLabs can return either
  { id: "IGO",  label: "IndiGo",   icaoPrefixes: ["IGO", "6E"],        flag: "🇮🇳", color: "#1a73e8" },
  { id: "DLH",  label: "Lufthansa", icaoPrefixes: ["DLH", "LHA", "LH"], flag: "🇩🇪", color: "#00a3e0" },
  { id: "SWA",  label: "Southwest", icaoPrefixes: ["SWA", "WN"],        flag: "🇺🇸", color: "#f04e37" },
];

// Keep REGIONS exported (empty) for backward compat with any import that still references it
export const REGIONS = {};


// ─── Initial state ─────────────────────────────────────────────────────────────
const initialState = {
  flights: [],
  connection: "CONNECTING",    // "CONNECTING" | "SYNCING" | "LIVE" | "DEGRADED"
  lastUpdated: null,
  dataAge: null,               // ISO timestamp from backend fetched_at (backend-driven)
  selectedIcao: null,
  activeRoute: null,           // { aircraft, points }
  sigmets: [],
  sigmetsVisible: true,
  radarVisible: false,
  metarData: null,
  toasts: [],
  showLabels: false,
  lockView: false,
  tileLayer: "dark",           // "dark" | "satellite" | "terrain"
  searchQuery: "",
  phaseFilter: "all",          // "all" | "climb" | "descend" | "cruise" | "ground"
  altBand: "all",              // "all" | "ground" | "low" | "mid" | "high"
  region: "all",
  isFetching: false,
  showEmergencyModal: false,
  theme: "dark",               // "dark" | "light"
  flightTrails: {},            // { icao24: [ { lat, lon, ts }, ... ] }
  // All 3 airlines selected by default — user can deselect to hide
  selectedAirlines: ["IGO", "DLH", "SWA"],
  selectedScheduledRoute: null,
};


// Helper to extend active route with new live positions in real time
function extendActiveRoute(activeRoute, newFlight) {
  if (!activeRoute || !activeRoute.points) return activeRoute;
  const { aircraft, points } = activeRoute;

  // Find the current point
  const currentIdx = points.findIndex(p => p.type === 'current');
  if (currentIdx === -1) return activeRoute;

  const currentPt = points[currentIdx];

  // Check if position has changed
  const positionChanged = currentPt.latitude !== newFlight.latitude || currentPt.longitude !== newFlight.longitude;

  if (!positionChanged) {
    // Just update the aircraft details (speed, altitude, etc.) and the current point without adding a new waypoint
    const newPoints = [...points];
    newPoints[currentIdx] = {
      ...currentPt,
      latitude: newFlight.latitude,
      longitude: newFlight.longitude,
    };
    return {
      ...activeRoute,
      aircraft: { ...aircraft, ...newFlight },
      points: newPoints,
    };
  }

  // Position changed! Create a new waypoint from the old current position
  const oldCurrentAsWaypoint = {
    type: 'waypoint',
    label: `WPT_LIVE_${Date.now()}`,
    latitude: currentPt.latitude,
    longitude: currentPt.longitude,
  };

  // Insert the old position into the points array right before the 'current' point
  const newPoints = [...points];
  newPoints.splice(currentIdx, 0, oldCurrentAsWaypoint);

  // Update the 'current' point to the new position
  // Note: since we did a splice, the index of 'current' has shifted by +1
  const newCurrentIdx = currentIdx + 1;
  newPoints[newCurrentIdx] = {
    ...newPoints[newCurrentIdx],
    latitude: newFlight.latitude,
    longitude: newFlight.longitude,
  };

  return {
    ...activeRoute,
    aircraft: { ...aircraft, ...newFlight },
    points: newPoints,
  };
}


// ─── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "SET_FLIGHTS": {
      const now = Date.now();
      const updatedTrails = { ...state.flightTrails };
      const activeIcaos = new Set(action.flights.map(f => f.icao24.toLowerCase()));

      action.flights.forEach(f => {
        const icao = f.icao24.toLowerCase();
        if (f.trail && f.trail.length > 0) {
          updatedTrails[icao] = f.trail;
        } else {
          // Fallback to local tracking accumulation if backend doesn't supply trail
          const lat = f.latitude;
          const lon = f.longitude;
          if (lat == null || lon == null) return;

          const history = updatedTrails[icao] || [];
          const lastPt = history[history.length - 1];
          if (!lastPt || lastPt.lat !== lat || lastPt.lon !== lon) {
            updatedTrails[icao] = [
              ...history,
              {
                lat,
                lon,
                altitude: f.altitude_ft || 0,
                heading: f.heading || 0,
                timestamp: Math.floor(now / 1000),
                ts: now
              }
            ];
            // Keep a cap of 1000 points locally too
            if (updatedTrails[icao].length > 1000) {
              updatedTrails[icao].shift();
            }
          }
        }
      });

      // Cleanup trails of flights no longer active
      for (const icao in updatedTrails) {
        if (!activeIcaos.has(icao)) {
          delete updatedTrails[icao];
        }
      }

      // Extend active route with new live position if selected flight updated
      let updatedActiveRoute = state.activeRoute;
      if (state.selectedIcao && state.activeRoute && state.activeRoute.aircraft?.icao24 === state.selectedIcao) {
        const updatedFlight = action.flights.find(f => f.icao24 === state.selectedIcao);
        if (updatedFlight) {
          updatedActiveRoute = extendActiveRoute(state.activeRoute, updatedFlight);
        }
      }

      return {
        ...state,
        flights: action.flights,
        flightTrails: updatedTrails,
        activeRoute: updatedActiveRoute,
        lastUpdated: new Date(),
        isFetching: false
      };
    }
    case "SET_DATA_AGE":
      return { ...state, dataAge: action.fetchedAt };
    case "SET_CONNECTION":
      return { ...state, connection: action.value };
    case "SET_FETCHING":
      return { ...state, isFetching: action.value };
    case "MERGE_FLIGHT": {
      const idx = state.flights.findIndex((f) => f.icao24 === action.flight.icao24);
      const flights =
        idx >= 0
          ? state.flights.map((f, i) => (i === idx ? action.flight : f))
          : [action.flight, ...state.flights];

      const now = Date.now();
      const updatedTrails = { ...state.flightTrails };
      const icao = action.flight.icao24.toLowerCase();

      if (action.flight.trail && action.flight.trail.length > 0) {
        updatedTrails[icao] = action.flight.trail;
      } else {
        const lat = action.flight.latitude;
        const lon = action.flight.longitude;

        if (lat != null && lon != null) {
          const history = updatedTrails[icao] || [];
          const lastPt = history[history.length - 1];
          if (!lastPt || lastPt.lat !== lat || lastPt.lon !== lon) {
            updatedTrails[icao] = [
              ...history,
              {
                lat,
                lon,
                altitude: action.flight.altitude_ft || 0,
                heading: action.flight.heading || 0,
                timestamp: Math.floor(now / 1000),
                ts: now
              }
            ];
            if (updatedTrails[icao].length > 1000) {
              updatedTrails[icao].shift();
            }
          }
        }
      }

      // Extend active route with new live position if selected flight updated
      let updatedActiveRoute = state.activeRoute;
      if (state.selectedIcao && state.activeRoute && state.activeRoute.aircraft?.icao24 === state.selectedIcao && action.flight.icao24 === state.selectedIcao) {
        updatedActiveRoute = extendActiveRoute(state.activeRoute, action.flight);
      }

      return { ...state, flights, flightTrails: updatedTrails, activeRoute: updatedActiveRoute };
    }
    case "SET_SELECTED_ICAO":
      return { ...state, selectedIcao: action.icao, selectedScheduledRoute: null };
    case "SET_ACTIVE_ROUTE":
      return { ...state, activeRoute: action.route, selectedScheduledRoute: null };
    case "CLEAR_ROUTE":
      return { ...state, activeRoute: null, selectedIcao: null, selectedScheduledRoute: null };
    case "SET_SCHEDULED_ROUTE":
      return { ...state, selectedScheduledRoute: action.route };
    case "CLEAR_SCHEDULED_ROUTE":
      return { ...state, selectedScheduledRoute: null };
    case "SET_SIGMETS":
      return { ...state, sigmets: action.sigmets };
    case "TOGGLE_SIGMETS":
      return { ...state, sigmetsVisible: !state.sigmetsVisible };
    case "TOGGLE_RADAR":
      return { ...state, radarVisible: !state.radarVisible };
    case "SET_METAR":
      return { ...state, metarData: action.data };
    case "ADD_TOAST": {
      const id = Date.now() + Math.random();
      return { ...state, toasts: [...state.toasts, { id, ...action.toast }] };
    }
    case "REMOVE_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "TOGGLE_LABELS":
      return { ...state, showLabels: !state.showLabels };
    case "TOGGLE_LOCK_VIEW":
      return { ...state, lockView: !state.lockView };
    case "SET_TILE_LAYER":
      return { ...state, tileLayer: action.layer };
    case "SET_SEARCH":
      return { ...state, searchQuery: action.query };
    case "SET_PHASE_FILTER":
      return { ...state, phaseFilter: action.filter };
    case "SET_ALT_BAND":
      return { ...state, altBand: action.band };
    case "SET_REGION":
      return { ...state, region: action.region };
    case "TOGGLE_AIRLINE": {
      const already = state.selectedAirlines.includes(action.airline);
      const selectedAirlines = already
        ? state.selectedAirlines.filter((a) => a !== action.airline)
        : [...state.selectedAirlines, action.airline];
      return { ...state, selectedAirlines };
    }
    case "CLEAR_AIRLINES":
      return { ...state, selectedAirlines: [] };
    case "SET_AIRLINES":
      return { ...state, selectedAirlines: action.airlines };
    case "SET_VIEW_MODE":
      // View mode is deprecated (3D globe removed)
      return state;

    case "TOGGLE_EMERGENCY_MODAL":
      return { ...state, showEmergencyModal: !state.showEmergencyModal };
    case "TOGGLE_THEME": {
      const nextTheme = state.theme === "dark" ? "light" : "dark";
      let nextTileLayer = state.tileLayer;
      if (state.tileLayer === "dark" || state.tileLayer === "light") {
        nextTileLayer = nextTheme === "dark" ? "dark" : "light";
      }
      return { ...state, theme: nextTheme, tileLayer: nextTileLayer };
    }
    default:
      return state;
  }
}

// ─── Context ───────────────────────────────────────────────────────────────────
const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addToast = useCallback((toast) => {
    dispatch({ type: "ADD_TOAST", toast });
  }, []);

  return (
    <StoreContext.Provider value={{ state, dispatch, addToast }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
