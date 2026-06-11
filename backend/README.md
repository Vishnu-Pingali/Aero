# Aero Ops Intelligence Backend

FastAPI backend for real-time aviation situational awareness using AirLabs live flight data plus AviationWeather SIGMET GeoJSON and US METAR observations.

## Run locally

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open the dashboard at `http://127.0.0.1:8000/dashboard`.

Open API docs at `http://127.0.0.1:8000/docs`.

## Credentials

AirLabs credentials are loaded automatically from `backend/credentials/credentials.json`. If that file is not present, the app falls back to the repository root `credentials.json`.

For local runs, keep credentials in `backend/credentials/credentials.json` or set `AIRLABS_API_KEY` in `backend/.env`.

Expected shape:

```json
{
  "airlabs_api_key": "your-api-key"
}
```

## Endpoints

- `GET /health`
- `GET /api/flights`
- `GET /api/flights/region?lamin=24&lomin=-125&lamax=50&lomax=-66`
- `GET /api/flights/altitude?min_alt=10000&max_alt=40000`
- `GET /api/weather/sigmets`
- `GET /api/weather/metars?ids=KJFK,KLAX,KORD,KATL,KDFW,KDEN,KSFO,KMIA`

`/api/flights` uses the configured US bounding box instead of a global AirLabs request. This avoids expensive API calls and keeps polling smooth.

## Frontend

The included `frontend/code.html` talks to `http://127.0.0.1:8000` by default. Set a different backend URL before the page loads with:

```html
<script>window.AERO_API_BASE = "https://your-api.example.com";</script>
```
