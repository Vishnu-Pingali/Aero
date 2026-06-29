# Aero Ops Intelligence Frontend

A real-time React map dashboard built with Vite, Tailwind CSS, Leaflet, and standard ES modules. It communicates with the Aero Ops Intelligence backend to visualize active flights, weather hazards, and meteorological observations across the United States.

## Features

- **High-Performance Map Rendering**: Renders real-time flight markers using Leaflet and updates positions smoothly.
- **FlightRadar24-Style Trails**: Displays historical flight trails on a Canvas layer with a custom gradient (cyan at the current position fading to deep blue) and a glowing stroke effect.
- **Altitude Filtering**: Includes a slider to filter visible flights on the map dynamically.
- **Dynamic Weather Overlays**: Renders active SIGMET weather polygon warnings and METAR indicators.
- **Sidebar Panels**: Lists active aircraft and displays flight routes (origin to destination) when an aircraft is clicked.

## Getting Started

### Prerequisites
Make sure you have Node.js (version 18 or higher recommended) installed.

### Setup and Execution
1. Install package dependencies:
   ```powershell
   npm install
   ```
2. Start the Vite development server:
   ```powershell
   npm run dev
   ```
3. Open `http://localhost:5173` in your web browser.

## Project Structure

- `src/components/`: Modular UI widgets (e.g., `Header`, `MapView`, `Sidebar`, `ToastNotifications`).
- `src/hooks/`: Custom hooks for state orchestration (e.g., `useFlights` containing the SSE stream subscription).
- `src/store/`: `AppStore.jsx` managing central state via a clean React Context/Reducer system.
- `src/utils/`: Shared utilities (e.g., `api.js` for URL construction, `geo.js` for bounds calculations).
- `setup.ps1`: Helper PowerShell script to install dependencies, clean old prototype files, and start the development server.
