/* global Globe */
import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/AppStore";
import { flightPhase, PHASE_COLORS } from "../utils/geo";
import { filterFlights } from "../utils/filters";
import { useFocusFlight } from "../hooks/useFlights";
import { useFlightPolling } from "../hooks/useFlights";

// ─── Popup HTML for hover labels ───────────────────────────────────────────────
function makeLabel(f) {
  const phase = flightPhase(f);
  const { color } = PHASE_COLORS[phase];
  const phaseLabel = { climb: "▲ CLIMBING", descend: "▼ DESCENDING", cruise: "→ CRUISING", ground: "⬛ ON GROUND" }[phase];
  const dep = f.origin_iata || f.origin_icao || "";
  const arr = f.destination_iata || f.destination_icao || "";
  return `
    <div style="background:rgba(6,20,34,0.95);border:1px solid ${color}55;border-radius:10px;
                padding:10px 14px;font-family:'JetBrains Mono',monospace;color:#d6e4f7;
                font-size:11px;min-width:180px;box-shadow:0 0 20px ${color}33">
      <div style="font-family:Geist,sans-serif;font-size:15px;color:#e1fdff;margin-bottom:3px;font-weight:600">
        ${f.callsign || f.icao24.toUpperCase()}
      </div>
      <div style="color:#b9cacb;font-size:9px;margin-bottom:6px">
        ${f.icao24.toUpperCase()} · ${f.country || "Unknown"}
      </div>
      <div style="display:inline-block;padding:2px 8px;border-radius:99px;
                  background:${color}22;color:${color};font-size:9px;margin-bottom:8px;
                  border:1px solid ${color}44">
        ${phaseLabel}
      </div>
      ${dep && arr ? `<div style="color:#00f2ff;font-size:9px;margin-bottom:8px;letter-spacing:0.06em">${dep} → ${arr}</div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 14px">
        <span style="color:#b9cacb">ALT</span>
        <span style="color:${color}">${f.altitude_ft != null ? Math.round(f.altitude_ft).toLocaleString() : "—"} FT</span>
        <span style="color:#b9cacb">SPD</span>
        <span style="color:#00dbe7">${f.velocity_kts != null ? Math.round(f.velocity_kts) : "—"} KT</span>
        <span style="color:#b9cacb">HDG</span>
        <span style="color:#e1fdff">${f.heading != null ? Math.round(f.heading) + "°" : "—"}</span>
        <span style="color:#b9cacb">VS</span>
        <span style="color:${f.vertical_rate_fpm > 0 ? "#62ff96" : f.vertical_rate_fpm < 0 ? "#ffb4ab" : "#b9cacb"}">
          ${f.vertical_rate_fpm != null ? (f.vertical_rate_fpm > 0 ? "+" : "") + Math.round(f.vertical_rate_fpm).toLocaleString() : "—"} FPM
        </span>
      </div>
      <div style="margin-top:8px;font-size:9px;color:#b9cacb;text-align:center">Click to load route</div>
    </div>`;
}

// ─── GlobeView Component ───────────────────────────────────────────────────────
export default function GlobeView() {
  const { state, dispatch } = useStore();
  const containerRef  = useRef(null);
  const globeRef      = useRef(null);
  const focusFlight   = useFocusFlight();
  useFlightPolling(null);

  // ── Init globe ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || typeof Globe === "undefined") return;

    const globe = Globe()(containerRef.current)
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
      .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
      .backgroundImageUrl("https://unpkg.com/three-globe/example/img/night-sky.png")
      .showAtmosphere(true)
      .atmosphereColor("#00dbe7")
      .atmosphereAltitude(0.18)
      .width(containerRef.current.clientWidth)
      .height(containerRef.current.clientHeight);

    // Start focused on US
    globe.pointOfView({ lat: 39.5, lng: -98.35, altitude: 2.0 }, 0);

    globeRef.current = globe;

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current || !globeRef.current) return;
      globeRef.current
        .width(containerRef.current.clientWidth)
        .height(containerRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      // Globe.gl cleans itself up when the container is removed from DOM
    };
  }, []);

  // ── Update aircraft points ────────────────────────────────────────────────────
  useEffect(() => {
    if (!globeRef.current) return;

    const visible = filterFlights(state.flights, {
      altBand: state.altBand,
      searchQuery: state.searchQuery,
      phaseFilter: state.phaseFilter,
    });

    globeRef.current
      .pointsData(visible)
      .pointLat("latitude")
      .pointLng("longitude")
      .pointAltitude((f) =>
        f.altitude_ft != null ? Math.min(f.altitude_ft / 350000, 0.1) : 0.002
      )
      .pointColor((f) => {
        if (state.selectedIcao === f.icao24) return "#ffffff";
        return PHASE_COLORS[flightPhase(f)].color;
      })
      .pointRadius((f) => (state.selectedIcao === f.icao24 ? 0.08 : 0.025))
      .pointResolution(8)
      .pointLabel(makeLabel)
      .onPointClick((f) => {
        dispatch({ type: "SET_SELECTED_ICAO", icao: f.icao24 });
        focusFlight(f.icao24);
      })
      .onPointHover((f) => {
        containerRef.current.style.cursor = f ? "pointer" : "grab";
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.flights, state.selectedIcao, state.altBand, state.searchQuery, state.phaseFilter]);

  // ── Draw route arcs ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!globeRef.current) return;

    if (!state.activeRoute) {
      globeRef.current.arcsData([]);
      return;
    }

    const { points, aircraft } = state.activeRoute;
    const originPt  = points.find((p) => p.type === "origin");
    const currentPt = points.find((p) => p.type === "current");
    const destPt    = points.find((p) => p.type === "destination");

    const arcs = [];

    // Flown path — dim dashed
    if (originPt && currentPt) {
      arcs.push({
        startLat: originPt.latitude,  startLng: originPt.longitude,
        endLat:   currentPt.latitude, endLng:   currentPt.longitude,
        color: ["rgba(185,202,203,0.6)", "rgba(185,202,203,0.1)"],
        dashLen: 0.25, dashGap: 0.2, animTime: 0, stroke: 1.2,
        label: `Flown: ${originPt.label} → ${currentPt.label}`,
      });
    }

    // Remaining path — bright animated
    if (currentPt && destPt) {
      arcs.push({
        startLat: currentPt.latitude, startLng: currentPt.longitude,
        endLat:   destPt.latitude,   endLng:   destPt.longitude,
        color: ["rgba(0,242,255,0.9)", "rgba(98,255,150,0.7)"],
        dashLen: 0.4, dashGap: 0.15, animTime: 1200, stroke: 2,
        label: `Remaining: ${currentPt.label} → ${destPt.label}`,
      });
    }

    globeRef.current
      .arcsData(arcs)
      .arcStartLat("startLat").arcStartLng("startLng")
      .arcEndLat("endLat")   .arcEndLng("endLng")
      .arcColor("color")
      .arcDashLength("dashLen")
      .arcDashGap("dashGap")
      .arcDashAnimateTime("animTime")
      .arcStroke("stroke")
      .arcAltitudeAutoScale(0.35)
      .arcLabel("label");

    // ── Airport rings ──────────────────────────────────────────────────────────
    const rings = [];
    if (originPt)  rings.push({ lat: originPt.latitude,  lng: originPt.longitude,  color: "#ffca7a", maxR: 2, propagationSpeed: 2.5, repeatPeriod: 900 });
    if (destPt)    rings.push({ lat: destPt.latitude,    lng: destPt.longitude,    color: "#62ff96", maxR: 2, propagationSpeed: 2.5, repeatPeriod: 900 });
    if (currentPt) rings.push({ lat: currentPt.latitude, lng: currentPt.longitude, color: "#00f2ff", maxR: 1.5, propagationSpeed: 4,   repeatPeriod: 600 });

    globeRef.current
      .ringsData(rings)
      .ringLat("lat").ringLng("lng")
      .ringColor((r) => (t) => `${r.color}${Math.round((1 - t) * 255).toString(16).padStart(2, "0")}`)
      .ringMaxRadius("maxR")
      .ringPropagationSpeed("propagationSpeed")
      .ringRepeatPeriod("repeatPeriod");

    // ── Fly camera to selected aircraft ───────────────────────────────────────
    if (aircraft) {
      setTimeout(() => {
        globeRef.current?.pointOfView(
          { lat: aircraft.latitude, lng: aircraft.longitude, altitude: 1.2 },
          1500
        );
      }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeRoute]);

  return (
    <div className="relative flex-1 h-full overflow-hidden bg-background">
      {/* Globe container */}
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ cursor: "grab" }} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-[10]
                      bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(6,20,34,0.6)_100%)]" />

      {/* Globe Controls */}
      <div className="absolute left-6 bottom-6 z-[800] flex flex-col gap-3">
        <div className="glass-panel p-2 rounded-xl flex flex-col gap-1">
          {/* Reset view */}
          <button
            onClick={() => globeRef.current?.pointOfView({ lat: 39.5, lng: -98.35, altitude: 2.0 }, 800)}
            className="p-3 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all"
            title="Reset globe view to US"
          >
            <span className="material-symbols-outlined text-2xl">navigation</span>
          </button>
          {/* Zoom in */}
          <button
            onClick={() => {
              const pov = globeRef.current?.pointOfView();
              if (pov) globeRef.current.pointOfView({ ...pov, altitude: Math.max(0.3, pov.altitude * 0.6) }, 400);
            }}
            className="p-3 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all"
            title="Zoom in"
          >
            <span className="material-symbols-outlined text-2xl">add</span>
          </button>
          {/* Zoom out */}
          <button
            onClick={() => {
              const pov = globeRef.current?.pointOfView();
              if (pov) globeRef.current.pointOfView({ ...pov, altitude: Math.min(5, pov.altitude * 1.6) }, 400);
            }}
            className="p-3 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all"
            title="Zoom out"
          >
            <span className="material-symbols-outlined text-2xl">remove</span>
          </button>
        </div>

        {/* Flight count pill */}
        <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
          <span className="font-mono text-xs text-primary">
            {filterFlights(state.flights, { altBand: state.altBand, searchQuery: state.searchQuery, phaseFilter: state.phaseFilter }).length} LIVE
          </span>
        </div>
      </div>

      {/* Globe hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[800] pointer-events-none">
        <div className="glass-panel px-4 py-1.5 rounded-full font-mono text-[10px] text-on-surface-variant">
          Drag to rotate · Scroll to zoom · Click aircraft for route
        </div>
      </div>
    </div>
  );
}
