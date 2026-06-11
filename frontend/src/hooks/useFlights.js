import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/AppStore";
import { flightsUrl, API_BASE, POLL_MS, US_METAR_STATIONS } from "../utils/api";
import { featureIntersectsUsBbox, extractHazards } from "../utils/geo";

// ─── useFlightPolling ─────────────────────────────────────────────────────────
export function useFlightPolling(map) {
  const { state, dispatch, addToast } = useStore();
  const aborterRef = useRef(null);
  const inFlightRef = useRef(false);
  const timerRef = useRef(null);
  const prevSigmetCount = useRef(0);

  const fetchFlights = useCallback(
    async (force = false) => {
      if (inFlightRef.current && !force) return;
      inFlightRef.current = true;
      aborterRef.current?.abort();
      aborterRef.current = new AbortController();

      dispatch({ type: "SET_CONNECTION", value: "SYNCING" });
      dispatch({ type: "SET_FETCHING", value: true });

      const url = flightsUrl(map);
      if (!url) { inFlightRef.current = false; return; }

      try {
        const res = await fetch(url, { signal: aborterRef.current.signal });
        if (!res.ok) throw new Error(`Flight API ${res.status}`);
        const payload = await res.json();
        dispatch({ type: "SET_FLIGHTS", flights: payload.flights || [] });
        dispatch({ type: "SET_CONNECTION", value: "LIVE" });
      } catch (err) {
        if (err.name !== "AbortError") {
          dispatch({ type: "SET_CONNECTION", value: "DEGRADED" });
          dispatch({ type: "SET_FETCHING", value: false });
          addToast({ kind: "error", message: `Flight feed degraded: ${err.message}` });
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [dispatch, addToast, map]
  );

  const fetchSigmets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/weather/sigmets`);
      if (!res.ok) throw new Error(`SIGMET API ${res.status}`);
      const payload = await res.json();
      const features = (payload.geojson?.features || []).filter(featureIntersectsUsBbox);
      dispatch({ type: "SET_SIGMETS", sigmets: features });

      if (features.length > prevSigmetCount.current && prevSigmetCount.current > 0) {
        const newCount = features.length - prevSigmetCount.current;
        const hazards = [...new Set(features.flatMap(extractHazards))];
        addToast({
          kind: "warning",
          message: `${newCount} new SIGMET${newCount > 1 ? "s" : ""} detected — ${hazards.slice(0, 2).join(", ")}`,
        });
      }
      prevSigmetCount.current = features.length;
    } catch (err) {
      console.error("SIGMET fetch failed:", err);
    }
  }, [dispatch, addToast]);

  const fetchMetars = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/weather/metars?ids=${US_METAR_STATIONS}`);
      if (!res.ok) throw new Error(`METAR API ${res.status}`);
      const payload = await res.json();
      const report = (payload.observations || [])[0];
      dispatch({ type: "SET_METAR", data: report || null });
    } catch (err) {
      console.error("METAR fetch failed:", err);
    }
  }, [dispatch]);

  // Start polling
  useEffect(() => {
    // Wait for Leaflet map to finish loading
    if (!map) {
      return;
    }

    fetchFlights(true);
    fetchSigmets();
    fetchMetars();

    timerRef.current = setInterval(() => fetchFlights(false), POLL_MS);
    const sigmetTimer = setInterval(fetchSigmets, 60_000);
    const metarTimer  = setInterval(fetchMetars,  60_000);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(sigmetTimer);
      clearInterval(metarTimer);
      aborterRef.current?.abort();
    };
  }, [map, fetchFlights, fetchSigmets, fetchMetars]);

  return { fetchFlights, fetchSigmets, fetchMetars };
}

// ─── useFocusFlight ───────────────────────────────────────────────────────────
export function useFocusFlight() {
  const { state, dispatch, addToast } = useStore();

  return useCallback(
    async (icao24, markerLatLng = null) => {
      let flight = state.flights.find((f) => f.icao24 === icao24);
      if (!flight) return;

      dispatch({ type: "SET_SELECTED_ICAO", icao: icao24 });

      const lat = markerLatLng?.lat ?? flight.latitude;
      const lon = markerLatLng?.lng ?? flight.longitude;

      try {
        const { aircraftRouteUrl } = await import("../utils/api");
        const res = await fetch(aircraftRouteUrl(icao24, lat, lon));
        if (!res.ok) throw new Error(`Route API ${res.status}`);
        const route = await res.json();
        dispatch({ type: "MERGE_FLIGHT", flight: route.aircraft });
        dispatch({ type: "SET_ACTIVE_ROUTE", route });
        addToast({ kind: "success", message: `Route loaded for ${route.aircraft.callsign || icao24.toUpperCase()}` });
      } catch (err) {
        console.warn("Route fetch failed:", err.message);
        dispatch({ type: "SET_ACTIVE_ROUTE", route: null });
        addToast({
          kind: err.message.includes("404") ? "info" : "error",
          message: err.message.includes("404")
            ? `No route data for ${flight.callsign || icao24.toUpperCase()}`
            : `Route unavailable: ${err.message}`,
        });
      }
    },
    [state.flights, dispatch, addToast]
  );
}
