import { ALT_BANDS, AIRLINE_FILTERS } from "../store/AppStore";
import { flightPhase } from "./geo";

/**
 * Returns the airline ID for a flight based on its callsign prefix.
 * Returns null if no match is found.
 */
export function detectAirline(flight) {
  const cs = (flight.callsign || "").toUpperCase().trim();
  if (!cs) return null;
  for (const airline of AIRLINE_FILTERS) {
    for (const prefix of airline.icaoPrefixes) {
      if (cs.startsWith(prefix)) return airline.id;
    }
  }
  return null;
}

/**
 * Central flight filtering — shared between MapView and Sidebar.
 * Filters by: selectedAirlines (required), altBand, searchQuery, phaseFilter.
 */
export function filterFlights(flights, { altBand = "all", searchQuery = "", phaseFilter = "all", selectedAirlines = [], selectedIcao = null } = {}) {
  if (selectedIcao) {
    return flights.filter((f) => f.icao24 === selectedIcao);
  }

  const band = ALT_BANDS[altBand] || ALT_BANDS.all;
  const q = searchQuery.toLowerCase().trim();

  return flights.filter((f) => {
    // Airline filter — REQUIRED: only show flights from selected airlines
    if (selectedAirlines.length > 0) {
      const airlineId = detectAirline(f);
      if (!airlineId || !selectedAirlines.includes(airlineId)) return false;
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
