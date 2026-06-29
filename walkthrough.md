# Consolidated Walkthrough - Advanced Premium Flight Tracker

We have successfully engineered and integrated a suite of visuals, performance optimizations, and feature extensions to transform this into a state-of-the-art premium flight intelligence dashboard.

---

## 1. Flight Scheduler Idle Suspend & Active Interval (API Cost Saver)
* **Default Active Frequency**: Changed background polling from 10 minutes to **5 minutes** for real-time map accuracy while active.
* **Idle Suspend on Inactivity**:
  * The backend `SSEBroadcaster` now registers connection count change callback hooks.
  * If the active client count remains at `0` for more than **10 minutes**, the background `FlightScheduler` automatically clears its intervals and suspends all API requests, preserving AirLabs quota.
  * The moment any client opens the map stream, the scheduler wakes up, immediately triggers a fresh AirLabs data pull, and resumes the active 5-minute interval.
* **API Route Cache Tuning**: Refactored the route endpoint to serve cached flight and airport details for up to 24 hours, and OpenSky tracks for 3 minutes, entirely protecting the system from redundant third-party calls when different users on different PCs click the same flight.
* **Frontend Route Guard**: Local duplicate clicks on the currently focused flight are guarded in `useFocusFlight` and intercepted, skipping duplicate network requests.

---

## 2. Advanced Premium Visuals & Performance Extensions

### A. Gradient Flowing Flight Trails
* **Files:** [index.css](file:///v:/BUP/frontend/src/index.css) and [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx)
  * Overrode Leaflet's canvas renderer behavior for focused flight lines using a dedicated SVG renderer instance.
  * Styled the active route segments with a custom CSS dash-offset flow animation (`flow-trail`) and neon cyan drop-shadow glow filter that moves dynamically along the flight's trajectory.

### B. Retro Mechanical Flip-Boards
* **File:** [FlipBoard.jsx](file:///v:/BUP/frontend/src/components/FlipBoard.jsx)
  * Designed a custom retro airport split-flap display card utilizing CSS 3D perspectives and transitions.
  * Integrated Flip-Boards inside [Sidebar.jsx](file:///v:/BUP/frontend/src/components/Sidebar.jsx) to flip character-by-character when the focused Callsign, Origin Airport, or Destination Airport changes.

### C. Leaflet Canvas Polyline Rendering
* **File:** [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx)
  * Enabled `preferCanvas: true` to render weather SIGMET regions, bounds indicators, and radar layers on an HTML5 canvas context, maximizing performance and eliminating DOM footprint during rapid zoom/pan events.

### D. Background Tab Inactivity Sleep
* **File:** [useFlights.js](file:///v:/BUP/frontend/src/hooks/useFlights.js)
  * Hooked into the browser's **Page Visibility API** (`visibilitychange`). 
  * When the browser tab is minimized or out of focus, it automatically pauses the SSE EventSource and clears the weather polling intervals.
  * Re-entering the tab immediately triggers a sync and restarts the active listeners, saving CPU and server bandwidth.

### E. Web Worker for Geo-Calculations
* **File:** [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx)
  * Created an inline Web Worker that offloads the mathematical calculation of geodesic polyline segments (up to 5,000 coordinate points for trajectories with numerous waypoints) to a background thread, keeping the main React render thread responsive.

### F. Destination Weather Delay Risk Predictor
* **File:** [Sidebar.jsx](file:///v:/BUP/frontend/src/components/Sidebar.jsx)
  * Implemented an algorithm that fetches destination METAR weather on selection and computes a dynamic **Delay Risk Index** (LOW, MODERATE, HIGH) based on:
    * Destination visibility (< 5 SM increases risk).
    * Surface wind speeds (> 15 kts increases risk).
    * Flight category (IFR and LIFR conditions increase risk).
    * Aircraft course deviation (Major/Minor deviations).
  * Lists specific delay risk factors inside the focused card.

---

## 3. Production Hardening Updates
* **Security Headers & Limiters (`app.js`):** Manual Helmet-equivalent headers are now set globally. JSON parsing bodies are restricted to `10kb` to protect against DoS attacks.
* **Error Masking:** In production environment mode, 500 error stack traces are kept hidden from clients.
* **Cache Lock Leak Cleanup & Stale Fallbacks (`cache/manager.js`):** Lock entries reference counts are decremented to `0` and pruned dynamically. Stale-on-error behavior guarantees that client requests receive last known cached observations if external APIs time out or hit rate limits.
* **API Route Fallbacks & Query Sanitization (`flights.js`):** Invalid float conversions, bounds bounds, or formatted ICAO transponders are rejected with HTTP 422. If the live AirLabs API throws, the expired disk cache falls back as `json_cache_expired_fallback`.
* **Credential Masking (`airlabs.js`):** API keys are scrubbed and redacted from stdout/stderr and diagnostics.

---

## 4. Premium Zoom and Heading Behavior Enhancements

### A. True North SVG Aircraft Bearing Markers
* **Files:** [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx) and [index.css](file:///v:/BUP/frontend/src/index.css)
  * Replaced the standard Google Material Symbols `flight` font icon (which renders at a ~45° natural offset) with a custom inline SVG airplane.
  * The SVG geometry is precisely crafted to point true north (0°) naturally.
  * Rotation is applied directly using `rotate(bearing)` via standard CSS Custom Properties, ensuring the aircraft points exactly in its current direction of travel with zero angle error.

### B. Airline Auto-Zoom
* **File:** [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx)
  * Selecting a specific airline filter automatically pans and zooms the map (`fitBounds`) to wrap around all currently visible flights operated by that carrier.

### C. Low-Zoom Performance Gate & Hiding Overlay
* **File:** [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx)
  * At a zoom level of `< 4`, flight markers are dynamically hidden to prevent clutter and keep UI performance fluid.
  * Added a premium glassmorphic HUD notification badge at the bottom-center reading "ZOOM IN TO SEE FLIGHTS" to guide the user.

### E. Aircraft-Type Specific Icons
* **File:** [MapView.jsx](file:///v:/BUP/frontend/src/components/MapView.jsx)
  * Designed custom high-fidelity SVG paths for distinct aircraft categories:
    * **Narrowbody Jets** (e.g. 737, A320)
    * **Widebody Jets** (e.g. 777, 787, A330, A350)
    * **Jumbo Jets / Super Heavy** (e.g. 747, A380)
    * **Regional Jets** (e.g. CRJ, Embraer ERJ/E-Jets) with rear twin-engines and T-tails
    * **Turboprops** (e.g. ATR 42/72, Q400) with straight wings and underwing props
    * **Helicopters** with main rotor blades and tail rotors
    * **Light General Aviation** (e.g. Cessna, Piper) with single nose-props and straight wings
    * **Generic Airplane** fallback
  * Built a matching utility `getAircraftCategory` that maps raw ICAO aircraft type codes (like `B738`, `B789`, `A321`, `E170`, `AT76`, etc.) to the respective categories using regex pattern matchers.
  * Dynamically renders matched premium vector icons on the Leaflet canvas map, rotating them exactly according to their bearing.

---

## 5. Verification Results
1. **Inactivity Sleep**: Open browser tab, wait, then minimize tab. Verify in console logs that background polling and SSE disconnects instantly, and reconnects immediately on tab reopen.
2. **Flow Trails**: Verify the remaining route segment has a neon cyan pulse animation flowing towards the destination.
3. **Mechanical Flip-Boards**: Click between different flights; observe the text cards flipping character-by-character.
4. **Delay Predictor**: Select a flight heading to an IFR/windy airport. Check the dynamic delay risk score and listed reasons.
5. **QA Test Suite (22/22 Passing)**: Run `node qa_test_suite.js` to verify all REST endpoints, query parameters injection sanitization, DoS size limit blockades, multiple parallel SSE connections, and graceful SIGINT teardown.
6. **Aircraft Heading Accuracy**: Observe active flight markers on the 2D map. Cross-reference their visual rotation with the flight status heading to confirm that the aircraft point exactly in their true bearing direction.
7. **Filters and Zoom Gates**: Zoom out past level 4 and verify markers disappear and the guidance overlay appears. Click an airline filter and verify the map auto-zooms to focus on that carrier's aircraft.
8. **Aircraft-Type Icons**: Verify that different plane categories render unique icons based on their model code (e.g., CRJ regional jet displays a T-tail, B747 quad-jet jumbo displays four engine dots, turboprops show straight wings).


