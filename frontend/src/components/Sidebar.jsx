import { useState, useEffect } from "react";
import { useStore, ALT_BANDS, AIRLINE_FILTERS } from "../store/AppStore";
import { flightPhase, PHASE_COLORS, routeProgress, gcDistance, crossTrackDistance } from "../utils/geo";
import { filterFlights } from "../utils/filters";
import { useFocusFlight } from "../hooks/useFlights";
import { FlipBoard } from "./FlipBoard";
import { API_BASE } from "../utils/api";

const PHASE_FILTERS = ["all", "climb", "descend", "cruise", "ground"];
const PHASE_LABELS  = { all: "ALL", climb: "▲ CLIMB", descend: "▼ DESCEND", cruise: "→ CRUISE", ground: "⬛ GND" };

export default function Sidebar() {
  const { state, dispatch } = useStore();
  const focusFlight = useFocusFlight();

  const visibleFlights = filterFlights(state.flights, {
    altBand: state.altBand,
    searchQuery: state.searchQuery,
    phaseFilter: state.phaseFilter,
    selectedAirlines: state.selectedAirlines,
    selectedIcao: state.selectedIcao,
  });

  return (
    <aside className="w-[390px] max-w-[42vw] h-full bg-surface-container-low/90 backdrop-blur-3xl border-l border-on-surface/10 flex flex-col z-[900] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

        {/* ── Search ── */}
        <section className="flex flex-col gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder="Callsign, ICAO, or route (e.g. JFK)…"
              value={state.searchQuery}
              onChange={(e) => dispatch({ type: "SET_SEARCH", query: e.target.value })}
              className="w-full glass-panel rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono text-primary
                         placeholder:text-on-surface-variant focus:outline-none focus:border-primary/40 bg-transparent"
            />
          </div>

          {/* Phase filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {PHASE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => dispatch({ type: "SET_PHASE_FILTER", filter: f })}
                className={`px-3 py-1 rounded-full text-[10px] font-mono border transition-all ${
                  state.phaseFilter === f
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "text-on-surface-variant border-on-surface/10 hover:border-primary/20 hover:text-primary"
                }`}
              >
                {PHASE_LABELS[f]}
              </button>
            ))}
          </div>
        </section>

        {/* ── Altitude band buttons ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-on-surface-variant tracking-widest">ALTITUDE FILTER</h3>
            <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-1 rounded">
              {visibleFlights.length.toLocaleString()} LIVE
            </span>
          </div>

          {/* Avg altitude indicator */}
          {visibleFlights.length > 0 && (() => {
            const alts = visibleFlights.map((f) => f.altitude_ft).filter(Number.isFinite);
            const avg  = alts.length ? Math.round(alts.reduce((a, b) => a + b, 0) / alts.length) : null;
            return avg != null ? (
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-on-surface-variant">AVG ALTITUDE</span>
                <span className="text-tertiary-fixed">{avg.toLocaleString()} FT</span>
              </div>
            ) : null;
          })()}

          {/* Band buttons grid */}
          <div className="grid grid-cols-5 gap-1.5">
            {Object.entries(ALT_BANDS).map(([key, band]) => (
              <button
                key={key}
                onClick={() => dispatch({ type: "SET_ALT_BAND", band: key })}
                className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl border font-mono text-[9px] transition-all ${
                  state.altBand === key
                    ? "bg-primary/20 text-primary border-primary/50 shadow-[0_0_12px_rgba(0,242,255,0.15)]"
                    : "text-on-surface-variant border-on-surface/10 hover:border-primary/25 hover:text-primary hover:bg-on-surface/5"
                }`}
              >
                <span className="material-symbols-outlined text-base">{band.icon}</span>
                <span className="tracking-wide">{band.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Airline Filter ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-on-surface-variant tracking-widest">AIRLINE FILTER</h3>
            {/* Show which airline is active, or ALL */}
            <span className="font-mono text-[9px] text-primary bg-primary/10 px-2 py-0.5 rounded">
              {state.selectedAirlines.length === AIRLINE_FILTERS.length
                ? "ALL AIRLINES"
                : state.selectedAirlines.length === 1
                  ? (AIRLINE_FILTERS.find(a => a.id === state.selectedAirlines[0])?.label || "1 ACTIVE").toUpperCase()
                  : `${state.selectedAirlines.length} ACTIVE`}
            </span>
          </div>

          {/* ALL button */}
          <button
            onClick={() => dispatch({ type: "SET_AIRLINES", airlines: ["IGO", "DLH", "SWA"] })}
            className={`w-full py-2 rounded-xl border font-mono text-[10px] tracking-widest transition-all ${
              state.selectedAirlines.length === AIRLINE_FILTERS.length
                ? "bg-primary/15 text-primary border-primary/40 shadow-[0_0_12px_rgba(0,242,255,0.1)]"
                : "text-on-surface-variant border-on-surface/10 hover:border-primary/25 hover:text-primary"
            }`}
          >
            ✈ ALL AIRLINES
          </button>

          {/* Individual airline cards — exclusive selection */}
          <div className="flex flex-col gap-2">
            {AIRLINE_FILTERS.map((airline) => {
              const isExclusivelySelected =
                state.selectedAirlines.length === 1 &&
                state.selectedAirlines[0] === airline.id;

              return (
                <button
                  key={airline.id}
                  onClick={() => {
                    // Clicking the already-exclusively-selected airline resets to ALL
                    if (isExclusivelySelected) {
                      dispatch({ type: "SET_AIRLINES", airlines: ["IGO", "DLH", "SWA"] });
                    } else {
                      // Exclusive: show ONLY this airline
                      dispatch({ type: "SET_AIRLINES", airlines: [airline.id] });
                    }
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border font-mono text-xs transition-all ${
                    isExclusivelySelected
                      ? "border-[2px] shadow-[0_0_20px_rgba(0,0,0,0.4)]"
                      : state.selectedAirlines.includes(airline.id)
                        ? "border opacity-70"
                        : "text-on-surface-variant border-on-surface/10 hover:border-on-surface/30 opacity-40"
                  }`}
                  style={
                    isExclusivelySelected
                      ? { borderColor: airline.color, background: `${airline.color}22`, color: airline.color }
                      : state.selectedAirlines.includes(airline.id)
                        ? { borderColor: `${airline.color}50`, color: airline.color }
                        : {}
                  }
                >
                  <span className="text-lg leading-none">{airline.flag}</span>
                  <div className="flex flex-col items-start flex-1">
                    <span className="font-semibold tracking-wide text-[11px]">{airline.label}</span>
                    <span className="text-[9px] opacity-70">{airline.icaoPrefixes.join(" / ")}</span>
                  </div>
                  {/* Selection indicator */}
                  {isExclusivelySelected ? (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse"
                      style={{ backgroundColor: airline.color, boxShadow: `0 0 10px ${airline.color}` }}
                    />
                  ) : (
                    <div className="w-3 h-3 rounded-full flex-shrink-0 border border-current opacity-40" />
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-center text-[9px] font-mono text-on-surface-variant opacity-60">
            Click airline to show only its flights · Click again to reset
          </p>
        </section>

        {/* ── Environmental conditions ── */}
        <WeatherPanel />

        {/* ── Route Planner ── */}
        <RoutePlannerPanel />

        {/* ── Active route panel ── */}
        {state.activeRoute && <RoutePanel />}

        {/* ── Aircraft list ── */}
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-mono text-on-surface-variant tracking-widest">LIVE AIRCRAFT</h3>
          <div className="grid gap-2">
            {visibleFlights.slice(0, 20).map((flight) => {
              const phase = flightPhase(flight);
              const { color } = PHASE_COLORS[phase];
              const isSelected = state.selectedIcao === flight.icao24;
              const dep = flight.origin_iata || flight.origin_icao;
              const arr = flight.destination_iata || flight.destination_icao;

              return (
                <button
                  key={flight.icao24}
                  data-icao={flight.icao24}
                  onClick={() => focusFlight(flight.icao24)}
                  className={`glass-panel rounded-lg p-3 text-left hover:border-primary/40 transition-all ${isSelected ? "aircraft-card-selected" : ""}`}
                >
                  <div className="flex justify-between gap-3 items-center">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                      />
                      <span className="font-display text-primary text-sm">
                        {flight.callsign || flight.icao24.toUpperCase()}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-tertiary-fixed">
                      {flight.velocity_kts != null ? Math.round(flight.velocity_kts) : "--"} KT
                    </span>
                  </div>

                  <div className="mt-1 flex justify-between font-mono text-xs text-on-surface-variant">
                    <span>{flight.country || "Unknown"}</span>
                    <span>{flight.altitude_ft != null ? Math.round(flight.altitude_ft).toLocaleString() : "--"} FT</span>
                  </div>

                  {dep && arr && (
                    <div className="mt-1 font-mono text-[10px] text-primary-container/70 tracking-wider">
                      {dep} → {arr}
                    </div>
                  )}
                </button>
              );
            })}

            {visibleFlights.length > 20 && (
              <p className="text-center text-xs font-mono text-on-surface-variant py-2">
                +{(visibleFlights.length - 20).toLocaleString()} more — refine filters or zoom in
              </p>
            )}
            {visibleFlights.length === 0 && state.flights.length > 0 && (
              <div className="text-center py-6">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant block mb-2">filter_list_off</span>
                <p className="text-xs font-mono text-on-surface-variant">No flights match current filters</p>
                <button
                  onClick={() => {
                    dispatch({ type: "SET_ALT_BAND", band: "all" });
                    dispatch({ type: "SET_PHASE_FILTER", filter: "all" });
                    dispatch({ type: "SET_SEARCH", query: "" });
                    dispatch({ type: "SET_AIRLINES", airlines: ["IGO", "DLH", "SWA"] });
                  }}
                  className="mt-2 text-xs font-mono text-primary hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </section>

      </div>
    </aside>
  );
}

// ─── WeatherPanel ─────────────────────────────────────────────────────────────
function WeatherPanel() {
  const { state } = useStore();
  const report = state.metarData;
  const sigmets = state.sigmets;

  const windDir = Number.isFinite(report?.wind_direction_deg) ? `${report.wind_direction_deg}°` : "VRB";
  const windSpd = Number.isFinite(report?.wind_speed_kt)      ? `${report.wind_speed_kt} KT`   : "--";
  const gust    = Number.isFinite(report?.wind_gust_kt)       ? ` G${report.wind_gust_kt}`     : "";

  const catColor = {
    VFR: "text-tertiary-fixed", MVFR: "text-secondary",
    IFR: "text-error",          LIFR: "text-red-400",
  }[report?.flight_category] || "text-on-surface-variant";

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-xs font-mono text-on-surface-variant tracking-widest">ENVIRONMENTAL CONDITIONS</h3>
      <div className="glass-panel p-5 rounded-xl">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-secondary text-3xl">thunderstorm</span>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-display text-primary">SIGMET Monitor</div>
            <div className="text-xs text-on-surface-variant truncate">
              {report ? `METAR ${report.station || ""}` : "Awaiting METAR data"}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <Row label="Wind"         value={`${windDir} / ${windSpd}${gust}`} />
          <Row label="Visibility"   value={report?.visibility_sm != null ? `${report.visibility_sm} SM` : "--"} />
          <Row label="Temp"         value={report?.temperature_c != null ? `${report.temperature_c}°C` : "--"} />
          <Row label="Altimeter"    value={report?.altimeter_in_hg != null ? `${report.altimeter_in_hg.toFixed(2)} IN` : "--"} />
          <Row label="Category"     value={<span className={catColor}>{report?.flight_category || "--"}</span>} />
          <Row label="Active SIGMETs" value={
            <span className={sigmets.length ? "text-error" : "text-tertiary-fixed"}>{sigmets.length}</span>
          } />
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="font-mono text-xs text-primary">{value}</span>
    </div>
  );
}

// ─── RoutePlannerPanel ────────────────────────────────────────────────────────
function RoutePlannerPanel() {
  const { dispatch, addToast } = useStore();
  const [depIata, setDepIata] = useState("");
  const [arrIata, setArrIata] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    const dep = depIata.trim().toUpperCase();
    const arr = arrIata.trim().toUpperCase();
    if (!dep || !arr || dep.length < 3 || arr.length < 3) {
      addToast({ kind: "warning", message: "Enter valid 3-letter IATA codes for both airports." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/routes?dep_iata=${encodeURIComponent(dep)}&arr_iata=${encodeURIComponent(arr)}`);
      if (!res.ok) throw new Error(`Routes API ${res.status}`);
      const data = await res.json();
      if (!data.routes || data.routes.length === 0) {
        addToast({ kind: "info", message: `No scheduled routes found for ${dep} → ${arr}` });
        return;
      }
      dispatch({
        type: "SET_SCHEDULED_ROUTE",
        route: {
          dep_iata: dep,
          arr_iata: arr,
          dep_coords: data.dep_coords || null,
          arr_coords: data.arr_coords || null,
          route: data.routes[0],
          allRoutes: data.routes,
        },
      });
      addToast({ kind: "success", message: `Found ${data.count} route(s) for ${dep} → ${arr}` });
    } catch (err) {
      addToast({ kind: "error", message: `Route lookup failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-mono text-on-surface-variant tracking-widest">ROUTE PLANNER</h3>
      <form onSubmit={handleSearch} className="glass-panel rounded-xl p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="DEP (e.g. JFK)"
            value={depIata}
            onChange={(e) => setDepIata(e.target.value)}
            maxLength={4}
            className="flex-1 bg-transparent border border-on-surface/10 rounded-lg px-3 py-2 text-xs font-mono text-primary placeholder:text-on-surface-variant focus:outline-none focus:border-primary/40 uppercase"
          />
          <span className="flex items-center text-on-surface-variant text-xs">→</span>
          <input
            type="text"
            placeholder="ARR (e.g. LAX)"
            value={arrIata}
            onChange={(e) => setArrIata(e.target.value)}
            maxLength={4}
            className="flex-1 bg-transparent border border-on-surface/10 rounded-lg px-3 py-2 text-xs font-mono text-primary placeholder:text-on-surface-variant focus:outline-none focus:border-primary/40 uppercase"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary text-xs font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search Routes"}
        </button>
      </form>
    </section>
  );
}


// ─── RoutePanel ───────────────────────────────────────────────────────────────
function RoutePanel() {
  const { state, dispatch } = useStore();
  const route = state.activeRoute;

  const [destMetar, setDestMetar] = useState(null);
  const [loadingMetar, setLoadingMetar] = useState(false);

  const aircraft = route?.aircraft;
  const points = route?.points;
  const origin = points?.find((p) => p.type === "origin");
  const dest   = points?.find((p) => p.type === "destination");
  const progress = aircraft ? routeProgress(aircraft) : null;

  useEffect(() => {
    if (!dest?.label) {
      setDestMetar(null);
      return;
    }
    const queryCode = dest.label.length === 3 ? "K" + dest.label : dest.label;
    setLoadingMetar(true);
    fetch(`${API_BASE}/api/weather/metars?ids=${queryCode}`)
      .then((res) => res.json())
      .then((data) => {
        setDestMetar(data.observations?.[0] || null);
      })
      .catch(() => setDestMetar(null))
      .finally(() => setLoadingMetar(false));
  }, [dest?.label]);

  if (!route) return null;

  const originIata = origin?.label?.toUpperCase();
  const destIata = dest?.label?.toUpperCase();

  // Find live coordinate updates for aircraft from flights state
  const flight = state.flights.find((f) => f.icao24 === aircraft.icao24);
  const currentLat = flight ? flight.latitude : aircraft.latitude;
  const currentLon = flight ? flight.longitude : aircraft.longitude;

  let deviation = 0;
  let distRemaining = null;
  let hasDeviationAlert = false;
  let deviationText = "Normal (<10 km)";
  let deviationColorClass = "text-tertiary-fixed";

  if (origin && dest) {
    deviation = crossTrackDistance(
      currentLat,
      currentLon,
      origin.latitude,
      origin.longitude,
      dest.latitude,
      dest.longitude
    );
    distRemaining = gcDistance(currentLat, currentLon, dest.latitude, dest.longitude);

    if (deviation >= 50) {
      deviationText = `Major Deviation (${Math.round(deviation)} km)`;
      deviationColorClass = "text-error";
      hasDeviationAlert = true;
    } else if (deviation >= 10) {
      deviationText = `Minor Deviation (${Math.round(deviation)} km)`;
      deviationColorClass = "text-secondary";
      hasDeviationAlert = true;
    }
  }

  function getDelayRisk() {
    let score = 0;
    let reasons = [];

    if (destMetar) {
      const cat = destMetar.flight_category || "VFR";
      if (cat === "LIFR") {
        score += 4;
        reasons.push("Low Instrument Flight Rules (LIFR) at destination");
      } else if (cat === "IFR") {
        score += 3;
        reasons.push("Instrument Flight Rules (IFR) conditions");
      } else if (cat === "MVFR") {
        score += 1.5;
        reasons.push("Marginal Visual Flight Rules (MVFR) conditions");
      }

      const speed = destMetar.wind_speed_kt ?? 0;
      if (speed > 25) {
        score += 3;
        reasons.push(`High surface winds at destination (${speed} kts)`);
      } else if (speed > 15) {
        score += 1.5;
        reasons.push(`Moderate surface winds at destination (${speed} kts)`);
      }

      const vis = destMetar.visibility_sm ?? 10;
      if (vis < 2) {
        score += 3;
        reasons.push(`Low visibility at destination (${vis} SM)`);
      } else if (vis < 5) {
        score += 1.5;
        reasons.push(`Moderate visibility at destination (${vis} SM)`);
      }
    }

    if (deviation != null && deviation > 30) {
      score += 2;
      reasons.push("Significant flight path route deviation");
    }

    let risk = "LOW";
    let color = "text-tertiary-fixed";
    if (score >= 5) {
      risk = "HIGH";
      color = "text-error";
    } else if (score >= 2) {
      risk = "MODERATE";
      color = "text-[#ffca7a]";
    }

    return { risk, color, reasons };
  }

  const delayInfo = getDelayRisk();

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-mono text-on-surface-variant tracking-widest">ACTIVE ROUTE</h3>
      <div className="glass-panel rounded-xl p-4 flex flex-col gap-3">

        {/* Airport timeline */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#ffca7a] shadow-[0_0_8px_#ffca7a]" />
            <div className="w-0.5 h-8 bg-primary-container/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-tertiary-fixed shadow-[0_0_8px_#62ff96] border-2 border-background" />
            <div className="w-0.5 h-8 bg-primary-container/40" />
            <div className="w-3 h-3 rounded-full bg-[#ffca7a] shadow-[0_0_8px_#ffca7a]" />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div>
              <FlipBoard text={origin?.label || "---"} lettersCount={3} className="text-sm font-semibold" />
              <div className="text-xs text-on-surface-variant truncate">{aircraft.origin_name || "Origin Airport"}</div>
            </div>
            <div className="flex justify-center">
              <span className="inline-block bg-primary/10 px-2 py-1 rounded-full">
                <FlipBoard text={aircraft.callsign || aircraft.icao24?.toUpperCase() || ""} lettersCount={7} className="text-[10px] font-bold" />
              </span>
            </div>
            <div className="text-right">
              <FlipBoard text={dest?.label || "---"} lettersCount={3} className="justify-end text-sm font-semibold" />
              <div className="text-xs text-on-surface-variant truncate">{aircraft.destination_name || "Destination Airport"}</div>
            </div>
          </div>
        </div>

        {/* Flashing deviation alert banner */}
        {hasDeviationAlert && (
          <div className="bg-error/15 border border-error/30 rounded-lg p-3 flex items-center gap-2 animate-pulse mb-1">
            <span className="material-symbols-outlined text-error text-sm">warning</span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-display font-bold text-error tracking-wider uppercase">ROUTE DEVIATION DETECTED</div>
              <div className="text-[9px] font-mono text-on-surface-variant">The aircraft has deviated {Math.round(deviation)} km from the planned great-circle path.</div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {progress != null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[10px] font-mono text-on-surface-variant">
              <span>ROUTE PROGRESS</span>
              <span className="text-tertiary-fixed font-semibold">{progress}% FLOWN</span>
            </div>
            <div className="h-2 rounded-full bg-on-surface/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, #ffca7a, #00f2ff, #62ff96)",
                }}
              />
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-on-surface/5">
          <StatCell label="ALT FT"   value={aircraft.altitude_ft != null ? aircraft.altitude_ft.toLocaleString() : "--"} />
          <StatCell label="SPEED KT" value={aircraft.velocity_kts != null ? aircraft.velocity_kts : "--"} />
          <StatCell label="HDG DEG"  value={aircraft.heading != null ? Math.round(aircraft.heading) : "--"} />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-on-surface/5">
          <StatCell label="REMAIN KM" value={distRemaining != null ? Math.round(distRemaining).toLocaleString() : "--"} />
          <StatCell label="DEV KM" value={deviation != null ? Math.round(deviation).toLocaleString() : "--"} />
          <StatCell
            label="DEV STATUS"
            value={<span className={`${deviationColorClass} font-bold text-[10px]`}>{deviation >= 10 ? (deviation >= 50 ? "MAJOR" : "MINOR") : "NORMAL"}</span>}
          />
        </div>


        {/* Delay Predictor Panel */}
        <div className="glass-panel rounded-lg p-3 flex flex-col gap-1 border border-on-surface/5">
          <div className="flex justify-between items-center text-[10px] font-mono text-on-surface-variant">
            <span>DELAY RISK INDEX</span>
            <span className={`${delayInfo.color} font-bold animate-pulse`}>{delayInfo.risk}</span>
          </div>
          {delayInfo.reasons.length > 0 ? (
            <div className="text-[9px] text-on-surface-variant flex flex-col gap-0.5 mt-1 border-t border-on-surface/5 pt-1">
              {delayInfo.reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[9px] text-tertiary-fixed mt-1">✓ No active weather or flight path risks detected.</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => dispatch({ type: "TOGGLE_LOCK_VIEW" })}
            className={`w-full text-[11px] font-mono py-1.5 rounded-lg border transition-all ${
              state.lockView
                ? "bg-primary/20 text-primary border-primary/40"
                : "text-on-surface-variant border-on-surface/10 hover:border-primary/20 hover:text-primary"
            }`}
          >
            {state.lockView ? "🔒 LOCKED" : "🔓 LOCK VIEW"}
          </button>
          <button
            onClick={() => dispatch({ type: "CLEAR_ROUTE" })}
            className="w-full text-[11px] font-mono text-on-surface-variant hover:text-error transition-colors
                       py-1.5 rounded-lg border border-on-surface/10 hover:border-error/30"
          >
            ✕ Clear Route
          </button>
        </div>
      </div>
    </section>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="text-center">
      <div className="font-mono text-xs text-primary">{value}</div>
      <div className="text-[9px] font-mono text-on-surface-variant mt-0.5">{label}</div>
    </div>
  );
}
