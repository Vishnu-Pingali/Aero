# Aero Ops Intelligence Backend

FastAPI backend for real-time aviation situational awareness using OpenSky live state vectors plus AviationWeather SIGMET GeoJSON and METAR observations.

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

OpenSky credentials are loaded automatically from `backend/credentials/credentials.json`. If that file is not present, the app falls back to the repository root `credentials.json`.

For production deployments, set `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` environment variables instead of uploading JSON credentials.

Expected shape:

```json
{
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret"
}
```

## Endpoints

- `GET /health`
- `GET /api/flights`
- `GET /api/flights/region?lamin=6&lomin=68&lamax=37.5&lomax=97.5`
- `GET /api/flights/altitude?min_alt=10000&max_alt=40000`
- `GET /api/weather/sigmets`
- `GET /api/weather/metars?ids=VIDP,VABB,VOBL,VOMM,VOHS,VECC,VAAH`

`/api/flights` uses the configured India bounding box instead of a global OpenSky request. This avoids expensive API calls and keeps polling smooth.

## Frontend

The included `frontend/code.html` talks to `http://127.0.0.1:8000` by default. Set a different backend URL before the page loads with:

```html
<script>window.AERO_API_BASE = "https://your-api.example.com";</script>
```
