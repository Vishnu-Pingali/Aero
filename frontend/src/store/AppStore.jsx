import { createContext, useContext, useReducer, useCallback } from "react";

// ─── Altitude band presets ─────────────────────────────────────────────────────
export const ALT_BANDS = {
  all: { label: "ALL", min: 0, max: Infinity, icon: "layers" },
  ground: { label: "GND", min: -1, max: 1000, icon: "flight_land" },
  low: { label: "<10K", min: 0, max: 10000, icon: "arrow_cool_down" },
  mid: { label: "10–35K", min: 10000, max: 35000, icon: "flight" },
  high: { label: ">35K", min: 35000, max: 99999, icon: "flight_takeoff" },
};

// ─── Region presets ────────────────────────────────────────────────────────────
export const REGIONS = {
  all: { label: "US-ALL", lomin: -125, lomax: -66, center: [39.5, -98.35], zoom: 5 },
  west: { label: "WEST", lomin: -125, lomax: -103, center: [38.0, -114.0], zoom: 5.5 },
  central: { label: "CENTRAL", lomin: -103, lomax: -87, center: [38.0, -95.0], zoom: 5.5 },
  east: { label: "EAST", lomin: -87, lomax: -66, center: [38.0, -76.5], zoom: 5.5 },
};

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
  region: "all",               // "all" | "west" | "central" | "east"
  viewMode: "2d",              // "2d" | "3d"
  isFetching: false,
  showEmergencyModal: false,
  theme: "dark",               // "dark" | "light"
};


// ─── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "SET_FLIGHTS":
      return { ...state, flights: action.flights, lastUpdated: new Date(), isFetching: false };
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
      return { ...state, flights };
    }
    case "SET_SELECTED_ICAO":
      return { ...state, selectedIcao: action.icao };
    case "SET_ACTIVE_ROUTE":
      return { ...state, activeRoute: action.route };
    case "CLEAR_ROUTE":
      return { ...state, activeRoute: null, selectedIcao: null };
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
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.mode };
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
