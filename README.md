# Aero Ops Intelligence

Real-time aviation situational awareness dashboard. The project features a choice of backends (Python FastAPI or Node.js Express) querying live AirLabs position data and AviationWeather.gov METAR/SIGMET services, paired with an interactive React + Vite + Tailwind CSS map dashboard.

---

## Architecture & Features

### 1. Dual Backend Support
You can run either backend; both expose a unified API for the frontend and keep a cached state to prevent rate-limiting the upstream APIs:
- **Node.js Express Backend (`backend-node/`)**: A clean ES module implementation with standard Express routing, asynchronous file operations, and robust Server-Sent Events (SSE) broadcasting.
- **Python FastAPI Backend (`backend/`)**: A Python-based alternative with typed Pydantic responses, dependency injection, and in-memory caching.

### 2. Frontend Dashboard (`frontend/`)
An interactive React + Vite single-page application styled with Tailwind CSS, Outfit typography, and Leaflet Maps:
- **FlightRadar24-Style trails**: Renders continuous, historical ADS-B position trails (up to 1,000 points) on a canvas layer with smooth HSL color gradients (cyan for new positions fading to deep blue for historical ones) and a dual-stroke glow.
- **Dynamic Filtering**: A slider to dynamically filter visible flights by altitude.
- **Sidebar Details & Route Loaders**: Select any flight to view detailed aircraft statistics and origin/destination route waypoints.
- **Weather Layers**: Renders SIGMET GeoJSON hazard polygons and METAR weather reports for major US airport hubs (KJFK, KLAX, KORD, KATL, KDFW, KDEN, KSFO, KMIA).

---

## Project Structure

```text
Aero/
├── backend/            # Python FastAPI Backend
│   ├── app/            # FastAPI source (main.py, routes, config, services)
│   ├── credentials/    # AirLabs credentials storage
│   └── requirements.txt
├── backend-node/       # Node.js Express Backend (recommended)
│   ├── src/            # Express source (server.js, app.js, routes, services)
│   ├── credentials/    # AirLabs credentials storage
│   └── package.json
├── frontend/           # React + Vite + Leaflet Frontend
│   ├── src/            # React source code (components, hooks, store, utils)
│   ├── index.html      # Leaflet map container mount
│   └── package.json
├── credentials.json    # Root fallback AirLabs credentials
└── setup-node-backend.ps1  # Helper script to swap backend folder names
```

---

## Setup & Running Locally

### 1. Configure Credentials
The backends require an **AirLabs API key** for flight data. Create a `credentials.json` file in either `backend-node/credentials/` or `backend/credentials/` (or at the repository root `credentials.json` as a fallback):

```json
{
  "airlabs_api_key": "YOUR_AIRLABS_API_KEY"
}
```

Alternatively, set the `AIRLABS_API_KEY` environment variable in your `.env` file.

---

### 2. Running the Node.js Backend (Recommended)
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

### 3. Running the Python Backend (Alternative)
1. Navigate to the Python backend directory:
   ```powershell
   cd backend
   ```
2. Set up a virtual environment and activate it:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Start the FastAPI development server:
   ```powershell
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

---

### 4. Running the React Frontend
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

Both backends expose the following REST endpoints:

- `GET /health`: Basic health check.
- `GET /api/flights`: Returns cached flights matching the default US bounding box.
- `GET /api/flights/region`: Query flights for a custom bounding box (requires `lamin`, `lomin`, `lamax`, `lomax`).
- `GET /api/flights/altitude`: Filter flights by `min_alt` and `max_alt` query parameters.
- `GET /api/flights/aircraft/:icao24/route`: Returns origin, destination, and current coordinates for a specific flight.
- `GET /api/flights/stream`: Server-Sent Events (SSE) connection that clients subscribe to for receiving real-time `'refresh'` notifications when the backend cache is updated.
- `GET /api/weather/sigmets`: Live weather advisory GeoJSON polygons from AviationWeather.gov.
- `GET /api/weather/metars`: Meteorological airport observations for default stations.
