# Aircraft Marker System Enhancement Plan

Enhance the aircraft marker system so that tracked aircraft display an icon matching their actual aircraft type (or closest silhouette) instead of a generic airplane icon.

## User Review Required

We are introducing:
1. A new backend lookup mechanism in `AirLabsService` that queries the AirLabs `/aircraft` database API when `aircraft_type` is missing from the live feed.
2. A 30-day cache for database lookups in the backend cache manager, plus local persistence in `aircraft_cache.json`.
3. A new frontend registry file [aircraftRegistry.js](file:///v:/BUP/frontend/src/utils/aircraftRegistry.js) containing SVG silhouettes for 16 specific aircraft categories and mapping rules.
4. Updates to `MapView.jsx` to import and use the registry, ensuring smooth rendering, rotation, and scaling.

> [!IMPORTANT]
> The backend changes will require an active AirLabs API key to fetch database records for unknown aircraft. If no key is configured, the system will gracefully fall back to the generic airplane icon without error.

## Open Questions

None at this stage. The requirements are clear and can be implemented cleanly using the existing architecture.

## Proposed Changes

---

### Component: Backend Lookup & Caching

We will add a database lookup helper to query the AirLabs `/aircraft` database for aircraft details when they are not provided by the live feed.

#### [MODIFY] [airlabs.js](file:///v:/BUP/backend-node/src/services/airlabs.js)
- Add `_fetchAircraftDatabase(icao24)` to query `/aircraft` by ICAO24 hex code.
- Cache results in `_cache` for 30 days (since aircraft types rarely change).
- In `getAircraftNear`, if the matched aircraft from the live feed is missing `aircraft_type`, perform the database lookup to populate it before caching and returning the aircraft.

---

### Component: Frontend Icon Registry & Configurable Mapping

We will create a new registry file containing high-quality top-down SVG silhouettes and mapping rules.

#### [NEW] [aircraftRegistry.js](file:///v:/BUP/frontend/src/utils/aircraftRegistry.js)
- Define SVG path strings for all 16 requested categories:
  1. **Boeing 737**: Twin-engine narrowbody, distinct swept wings.
  2. **Boeing 747**: Quad-engine jumbo, iconic swept wings with four engines.
  3. **Boeing 777**: Large twin-engine widebody, long fuselage, long wingspan.
  4. **Boeing 787 Dreamliner**: Elegant widebody, swept-back wings with curved raked wingtips.
  5. **Airbus A320 Family**: Twin-engine narrowbody, wingtip fences/sharklets.
  6. **Airbus A330**: Medium-to-large twin-engine widebody.
  7. **Airbus A350**: Advanced widebody, curved winglets, aerodynamic nose.
  8. **Airbus A380**: Massive quad-engine double-decker, very wide wingspan.
  9. **Embraer Regional Jets**: E-Jets/ERJ style regional jets.
  10. **Bombardier CRJ**: Slender regional jet with rear-mounted engines and T-tail.
  11. **ATR 42 / ATR 72**: High-wing twin-turboprop with straight wings.
  12. **General Aviation Aircraft**: Single propeller nose, straight wings (e.g. Cessna).
  13. **Helicopters**: Top-down rotor blades and fuselage.
  14. **Cargo Aircraft**: Heavy high-wing transporters (e.g. C-17, Antonov style).
  15. **Military Aircraft**: Fighter jet silhouette with swept delta wings / twin tail.
  16. **Default Jet**: Standard twin-jet fallback.
  17. **Generic**: Standard Leaflet/Aero fallback.
- Export `AIRCRAFT_MAP` (mapping ICAO codes/prefixes to categories).
- Export `getAircraftCategory(typeCode)` to resolve any ICAO type code to one of the 16 categories.

---

### Component: Dynamic Map Marker Rendering

We will update the map view to use the new registry.

#### [MODIFY] [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx)
- Import `getAircraftCategory` and the SVG library from `aircraftRegistry.js`.
- Remove the inline `AIRCRAFT_SVGS` and `getAircraftCategory` code to avoid duplication and keep the file clean.
- Ensure `markerHtml` uses the imported registry.

## Verification Plan

### Automated Tests
- Run `npm run build` in the `frontend` directory to ensure no compilation errors.
- Run backend tests to ensure `AirLabsService` functions correctly.

### Manual Verification
- Select an aircraft on the map and verify that the correct silhouette is displayed.
- Test with known ICAO codes (e.g., `B738` -> Boeing 737, `A388` -> Airbus A380, `C172` -> General Aviation, `H60` -> Helicopter).
- Test with an unknown/missing type code and verify it uses the fallback icon.
- Verify that rotation, scaling, and popups function perfectly.
