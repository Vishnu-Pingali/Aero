import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/AppStore";
import { flightsUrl, API_BASE, SSE_URL, POLL_MS, US_METAR_STATIONS } from "../utils/api";
import { extractHazards } from "../utils/geo";

// ─── useFlightPolling ─────────────────────────────────────────────────────────
export function useFlightPolling(map) {
  const { state, dispatch, addToast } = useStore();
  const aborterRef = useRef(null);
  const inFlightRef = useRef(false);
  const sseRef = useRef(null);
  const sseReconnectTimer = useRef(null);
  const prevSigmetCount = useRef(0);

  // ─── fetchFlights ───────────────────────────────────────────────────────────
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

        // Record the backend's data freshness timestamp if present
        if (payload.fetched_at) {
          dispatch({ type: "SET_DATA_AGE", fetchedAt: payload.fetched_at });
        }
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

  // ─── SSE connection ─────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    // Clean up any existing connection
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    clearTimeout(sseReconnectTimer.current);

    const es = new EventSource(SSE_URL);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "refresh") {
          // Backend just refreshed — pull the latest data
          console.debug(`[SSE] refresh received — ${msg.count} flights, fetched_at=${msg.fetched_at}`);
          if (msg.fetched_at) {
            dispatch({ type: "SET_DATA_AGE", fetchedAt: msg.fetched_at });
          }
          fetchFlights(true);
        }
        // "ping" and "connected" messages are silently ignored
      } catch (e) {
        console.warn("[SSE] Failed to parse message:", event.data);
      }
    };

    es.onerror = () => {
      console.warn("[SSE] Connection lost — reconnecting in 5 s…");
      es.close();
      sseRef.current = null;
      // Reconnect after 5 seconds
      sseReconnectTimer.current = setTimeout(connectSSE, 5_000);
    };
  }, [fetchFlights, dispatch]);

  // ─── fetchSigmets ───────────────────────────────────────────────────────────
  const fetchSigmets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/weather/sigmets`);
      if (!res.ok) throw new Error(`SIGMET API ${res.status}`);
      const payload = await res.json();
      const features = payload.geojson?.features || [];
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

  // ─── fetchMetars ────────────────────────────────────────────────────────────
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

  // ─── Startup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map === undefined) return;

    let fallbackTimer = null;
    let sigmetTimer = null;
    let metarTimer = null;
    let isSuspended = false;

    function startTimersAndSSE() {
      if (isSuspended) return;
      console.log("[Visibility] Tab is active. Starting/resuming SSE stream and background timers.");

      // Fetch immediately
      fetchFlights(true);
      fetchSigmets();
      fetchMetars();

      connectSSE();

      // Clear any pre-existing timers just in case
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (sigmetTimer) clearInterval(sigmetTimer);
      if (metarTimer) clearInterval(metarTimer);

      fallbackTimer = setInterval(() => {
        if (!sseRef.current || sseRef.current.readyState === EventSource.CLOSED) {
          console.warn("[fallback] SSE not connected — polling manually");
          fetchFlights(false);
        }
      }, POLL_MS);

      sigmetTimer = setInterval(fetchSigmets, 60_000);
      metarTimer = setInterval(fetchMetars, 60_000);
    }

    function stopTimersAndSSE() {
      console.log("[Visibility] Tab is hidden. Suspending SSE stream and background timers.");
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
      if (sigmetTimer) { clearInterval(sigmetTimer); sigmetTimer = null; }
      if (metarTimer) { clearInterval(metarTimer); metarTimer = null; }

      clearTimeout(sseReconnectTimer.current);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      aborterRef.current?.abort();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        isSuspended = true;
        stopTimersAndSSE();
      } else {
        isSuspended = false;
        startTimersAndSSE();
      }
    }

    // Initial startup
    startTimersAndSSE();

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      isSuspended = true;
      stopTimersAndSSE();
    };
  }, [map, fetchFlights, fetchSigmets, fetchMetars, connectSSE]);

  return { fetchFlights, fetchSigmets, fetchMetars };
}

// ─── useFocusFlight ───────────────────────────────────────────────────────────
export function useFocusFlight() {
  const { state, dispatch, addToast } = useStore();

  return useCallback(
    async (icao24, markerLatLng = null) => {
      let flight = state.flights.find((f) => f.icao24 === icao24);
      if (!flight) return;

      // Skip fetching if this flight is already selected and its route is loaded
      if (
        state.selectedIcao === icao24 &&
        state.activeRoute &&
        state.activeRoute.aircraft?.icao24 === icao24
      ) {
        console.debug(`[useFocusFlight] route already loaded for ${icao24}, skipping fetch`);
        return;
      }

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
    [state.flights, state.selectedIcao, state.activeRoute, dispatch, addToast]
  );
}
