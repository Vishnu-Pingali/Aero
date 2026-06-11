import { useStore, ALT_BANDS, REGIONS } from "../store/AppStore";
import { flightPhase, PHASE_COLORS, routeProgress } from "../utils/geo";
import { filterFlights } from "../utils/filters";
import { useFocusFlight } from "../hooks/useFlights";

const PHASE_FILTERS = ["all", "climb", "descend", "cruise", "ground"];
const PHASE_LABELS  = { all: "ALL", climb: "▲ CLIMB", descend: "▼ DESCEND", cruise: "→ CRUISE", ground: "⬛ GND" };

export default function Sidebar() {
  const { state, dispatch } = useStore();
  const focusFlight = useFocusFlight();

  const visibleFlights = filterFlights(state.flights, {
    altBand: state.altBand,
    searchQuery: state.searchQuery,
    phaseFilter: state.phaseFilter,
    region: state.region,
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

        {/* ── Region filter buttons ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-on-surface-variant tracking-widest">REGION FILTER</h3>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(REGIONS).map(([key, reg]) => (
              <button
                key={key}
                onClick={() => dispatch({ type: "SET_REGION", region: key })}
                className={`py-2 px-1 rounded-xl border font-mono text-[9px] transition-all text-center ${
                  state.region === key
                    ? "bg-primary/20 text-primary border-primary/50 shadow-[0_0_12px_rgba(0,242,255,0.15)]"
                    : "text-on-surface-variant border-on-surface/10 hover:border-primary/25 hover:text-primary hover:bg-on-surface/5"
                }`}
              >
                <span className="tracking-wide font-semibold">{reg.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Environmental conditions ── */}
        <WeatherPanel />

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

// ─── RoutePanel ───────────────────────────────────────────────────────────────
function RoutePanel() {
  const { state, dispatch } = useStore();
  const route = state.activeRoute;
  if (!route) return null;

  const { aircraft, points } = route;
  const origin = points.find((p) => p.type === "origin");
  const dest   = points.find((p) => p.type === "destination");
  const progress = routeProgress(aircraft);

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
              <div className="font-mono text-sm text-[#ffca7a]">{origin?.label || "---"}</div>
              <div className="text-xs text-on-surface-variant truncate">{aircraft.origin_name || "Origin Airport"}</div>
            </div>
            <div className="text-center">
              <span className="font-display text-primary text-xs bg-primary/10 px-2 py-0.5 rounded-full">
                {aircraft.callsign || aircraft.icao24?.toUpperCase()}
              </span>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-[#ffca7a]">{dest?.label || "---"}</div>
              <div className="text-xs text-on-surface-variant truncate">{aircraft.destination_name || "Destination Airport"}</div>
            </div>
          </div>
        </div>

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

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => dispatch({ type: "TOGGLE_LOCK_VIEW" })}
            className={`flex-1 text-xs font-mono py-1.5 rounded-lg border transition-all ${
              state.lockView
                ? "bg-primary/20 text-primary border-primary/40"
                : "text-on-surface-variant border-on-surface/10 hover:border-primary/20 hover:text-primary"
            }`}
          >
            {state.lockView ? "🔒 LOCKED" : "🔓 LOCK VIEW"}
          </button>
          <button
            onClick={() => dispatch({ type: "CLEAR_ROUTE" })}
            className="flex-1 text-xs font-mono text-on-surface-variant hover:text-error transition-colors
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
