import { ALT_BANDS, REGIONS } from "../store/AppStore";
import { flightPhase } from "./geo";

/**
 * Central flight filtering — shared between MapView, GlobeView and Sidebar.
 * Uses altBand preset + searchQuery + phaseFilter + region from state.
 */
export function filterFlights(flights, { altBand = "all", searchQuery = "", phaseFilter = "all", region = "all", selectedIcao = null } = {}) {
  if (selectedIcao) {
    return flights.filter((f) => f.icao24 === selectedIcao);
  }

  const band = ALT_BANDS[altBand] || ALT_BANDS.all;
  const reg  = REGIONS[region] || REGIONS.all;
  const q = searchQuery.toLowerCase().trim();

  return flights.filter((f) => {
    // Region filter
    if (region !== "all") {
      const lon = f.longitude;
      if (lon < reg.lomin || lon > reg.lomax) return false;
    }

    // Altitude band
    if (altBand !== "all") {
      if (altBand === "ground") {
        if (!f.on_ground && (f.altitude_ft == null || f.altitude_ft >= 1000)) return false;
      } else {
        if (f.altitude_ft == null) return altBand === "low"; // unknowns in "low"
        if (f.altitude_ft < band.min || f.altitude_ft >= band.max) return false;
      }
    }

    // Text search
    if (q) {
      const callsign = f.callsign?.toLowerCase() || "";
      const icao = f.icao24.toLowerCase();
      const origin = (f.origin_iata || f.origin_icao || "").toLowerCase();
      const dest   = (f.destination_iata || f.destination_icao || "").toLowerCase();
      if (!callsign.includes(q) && !icao.includes(q) && !origin.includes(q) && !dest.includes(q)) return false;
    }

    // Phase filter
    if (phaseFilter !== "all" && flightPhase(f) !== phaseFilter) return false;

    return true;
  });
}
