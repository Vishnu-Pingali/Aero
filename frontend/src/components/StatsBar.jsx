import { useMemo } from "react";
import { useStore } from "../store/AppStore";
import { flightPhase } from "../utils/geo";
import { filterFlights } from "../utils/filters";

export default function StatsBar() {
  const { state } = useStore();

  const stats = useMemo(() => {
    const flights = filterFlights(state.flights, {
      altBand: state.altBand,
      searchQuery: state.searchQuery,
      phaseFilter: state.phaseFilter,
      region: state.region,
      selectedIcao: state.selectedIcao,
    });
    if (!flights.length) return null;


    let climbCount = 0, descendCount = 0, cruiseCount = 0, groundCount = 0;
    let maxAlt = -Infinity, maxAltFlight = null;
    let maxSpd = -Infinity, maxSpdFlight = null;

    for (const f of flights) {
      const phase = flightPhase(f);
      if (phase === "climb")   climbCount++;
      if (phase === "descend") descendCount++;
      if (phase === "cruise")  cruiseCount++;
      if (phase === "ground")  groundCount++;
      if (f.altitude_ft != null && f.altitude_ft > maxAlt)   { maxAlt = f.altitude_ft; maxAltFlight = f; }
      if (f.velocity_kts != null && f.velocity_kts > maxSpd) { maxSpd = f.velocity_kts; maxSpdFlight = f; }
    }

    return { climbCount, descendCount, cruiseCount, groundCount, maxAltFlight, maxSpdFlight, maxAlt, maxSpd, total: flights.length };
  }, [state.flights, state.altBand, state.searchQuery, state.phaseFilter, state.region, state.selectedIcao]);

  if (!stats) return null;

  return (
    <div className="fixed top-16 left-0 w-full z-[990] bg-surface-container-low/80 backdrop-blur-lg border-b border-on-surface/5 px-gutter h-9 flex items-center gap-6 overflow-x-auto scrollbar-none">
      {/* Total */}
      <Stat label="TOTAL" value={stats.total.toLocaleString()} color="text-primary" />
      <div className="h-4 w-px bg-on-surface/10" />
      {/* Phase breakdown */}
      <Stat label="▲" value={stats.climbCount} color="text-phase-climb" title="Climbing" />
      <Stat label="▼" value={stats.descendCount} color="text-phase-descend" title="Descending" />
      <Stat label="→" value={stats.cruiseCount} color="text-phase-cruise" title="Cruising" />
      <Stat label="⬛" value={stats.groundCount} color="text-phase-ground" title="On Ground" />
      <div className="h-4 w-px bg-on-surface/10" />
      {/* Highest */}
      {stats.maxAltFlight && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-on-surface-variant">HIGHEST</span>
          <span className="text-primary">{stats.maxAltFlight.callsign || stats.maxAltFlight.icao24.toUpperCase()}</span>
          <span className="text-tertiary-fixed">{Math.round(stats.maxAlt).toLocaleString()} FT</span>
        </div>
      )}
      <div className="h-4 w-px bg-on-surface/10" />
      {/* Fastest */}
      {stats.maxSpdFlight && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-on-surface-variant">FASTEST</span>
          <span className="text-primary">{stats.maxSpdFlight.callsign || stats.maxSpdFlight.icao24.toUpperCase()}</span>
          <span className="text-secondary">{Math.round(stats.maxSpd)} KT</span>
        </div>
      )}
      <div className="h-4 w-px bg-on-surface/10" />
      {/* SIGMETs */}
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="text-on-surface-variant">SIGMETS</span>
        <span className={state.sigmets.length ? "text-error" : "text-tertiary-fixed"}>
          {state.sigmets.length}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, color, title }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0" title={title}>
      <span className={`${color} stat-count`}>{label}</span>
      <span className={`${color} font-semibold stat-count`}>{value}</span>
    </div>
  );
}
