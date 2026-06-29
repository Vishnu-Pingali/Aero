# Aero Ops Intelligence

Real-time aviation situational awareness dashboard. The project features a Node.js Express backend querying live AirLabs position data and AviationWeather.gov METAR/SIGMET services, paired with an interactive React + Vite + Tailwind CSS map dashboard.

---

## Architecture & Features

### 1. Backend Service (`backend-node/`)
A clean ES module implementation with standard Express routing, asynchronous file operations, and robust Server-Sent Events (SSE) broadcasting:
- **Aircraft Metadata Enrichment:** Automated lookup of detailed aircraft models via the AirLabs database when the live feed lacks aircraft type information, with a persistent 30-day cache to avoid rate-limiting.
- **SSE Streams:** Clients subscribe to live cache refresh notifications.

### 2. Frontend Dashboard (`frontend/`)
An interactive React + Vite single-page application styled with Tailwind CSS, Outfit typography, and Leaflet Maps:
- **Authentic Aircraft Silhouettes:** Implements top-view aircraft silhouettes sourced from FlightAware's `dump1090-fa` (BSD-3-Clause). 
- **Premium Matt Gold Theme:** Aircraft markers are colored in a professional desaturated matt gold with bronze outlines, scaling and rotating dynamically based on telemetry.
- **Flight Trails:** Renders continuous, historical ADS-B position trails (up to 1,000 points) on a canvas layer with smooth HSL color gradients.
- **Dynamic Filtering:** A slider to dynamically filter visible flights by altitude.
- **Sidebar Details & Route Loaders:** Select any flight to view detailed aircraft statistics and origin/destination route waypoints.
- **Weather Layers:** Renders SIGMET GeoJSON hazard polygons and METAR weather reports for major US airport hubs (KJFK, KLAX, KORD, KATL, KDFW, KDEN, KSFO, KMIA).

---

## Project Structure

```text
Aero/
├── backend-node/       # Node.js Express Backend
├── frontend/           # React + Vite + Leaflet Frontend
├── credentials.json    # Root fallback AirLabs credentials
└── task.md             # Project task board
```

---

## Setup & Running Locally

### 1. Configure Credentials
The backend requires an **AirLabs API key** for flight data. Create a `credentials.json` file in `backend-node/credentials/` (or at the repository root `credentials.json` as a fallback):

```json
{
  "airlabs_api_key": "YOUR_AIRLABS_API_KEY"
}
```

Alternatively, set the `AIRLABS_API_KEY` environment variable in your `.env` file.

---

### 2. Running the Node.js Backend
1. Navigate to the Node.js backend directory:
   ```powershell
   cd backend-node
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Run the development server (configured to reload automatically):
   ```powershell
   npm run dev
   ```
   *The backend starts listening on `http://127.0.0.1:8000`.*

---

### 3. Running the React Frontend
1. Navigate to the frontend directory:
   ```powershell
   cd frontend
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Run the Vite development server:
   ```powershell
   npm run dev
   ```
4. Open the printed local URL (typically `http://localhost:5173`) in your browser to view the dashboard.

---

## Core API Endpoints

The backend exposes the following REST endpoints:

- `GET /health`: Basic health check.
- `GET /api/flights`: Returns cached flights matching the default US bounding box.
- `GET /api/flights/region`: Query flights for a custom bounding box (requires `lamin`, `lomin`, `lamax`, `lomax`).
- `GET /api/flights/altitude`: Filter flights by `min_alt` and `max_alt` query parameters.
- `GET /api/flights/aircraft/:icao24/route`: Returns origin, destination, and current coordinates for a specific flight.
- `GET /api/flights/stream`: Server-Sent Events (SSE) connection that clients subscribe to for receiving real-time `'refresh'` notifications when the backend cache is updated.
- `GET /api/weather/sigmets`: Live weather advisory GeoJSON polygons from AviationWeather.gov.
- `GET /api/weather/metars`: Meteorological airport observations for default stations.
