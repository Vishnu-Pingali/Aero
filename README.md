# Aero Ops Intelligence

Real-time aviation situational awareness prototype for India-focused flight tracking. The project now includes a production-structured FastAPI backend, live OpenSky aircraft integration, AviationWeather SIGMET and METAR weather data, and a Leaflet dashboard frontend.

## What Has Been Built

- FastAPI backend under `backend/app`
- OpenSky OAuth2 client-credentials authentication
- Automatic OpenSky token refresh before expiry
- Async HTTP calls with `httpx.AsyncClient`
- Short-lived in-memory caching with `aiocache`
- Duplicate request prevention for cached upstream calls
- India-first bounded aircraft polling instead of global OpenSky requests
- Typed Pydantic responses for flights and weather
- AviationWeather SIGMET GeoJSON integration
- AviationWeather METAR weather integration
- Leaflet map dashboard served from FastAPI at `/dashboard`
- Live aircraft marker updates every 5 seconds
- Rotating aircraft icons based on heading
- Aircraft popup cards with speed, altitude, heading, and vertical rate
- Altitude filter slider
- Live aircraft sidebar list
- SIGMET weather polygon overlay
- India METAR weather card showing wind, visibility, temperature, altimeter, and flight category
- Swagger/OpenAPI docs at `/docs`

## Current Region

The system is configured for India by default.

Default flight bounding box:

```text
lamin=6
lomin=68
lamax=37.5
lomax=97.5
```

Default METAR stations:

```text
VIDP  Delhi
VABB  Mumbai
VOBL  Bengaluru
VOMM  Chennai
VOHS  Hyderabad
VECC  Kolkata
VAAH  Ahmedabad
```

## Project Structure

```text
Aero/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── auth/
│   │   ├── cache/
│   │   ├── config/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   ├── credentials/
│   │   └── credentials.json
│   ├── requirements.txt
│   ├── .env
│   └── README.md
├── frontend/
│   ├── code.html
│   ├── DESIGN.md
│   └── screen.png
└── credentials.json
```

## Run Locally

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Then open:

```text
http://127.0.0.1:8000/dashboard
```

API docs:

```text
http://127.0.0.1:8000/docs
```

## Deployment

The repo is prepared for a split deployment:

- Backend: Render web service using `render.yaml`
- Frontend: Vercel static deployment using `vercel.json`

Backend production environment variables:

```text
OPENSKY_CLIENT_ID=your-opensky-api-client-id
OPENSKY_CLIENT_SECRET=your-opensky-api-client-secret
ENVIRONMENT=production
LOG_LEVEL=INFO
```

The Vercel frontend routes `/api/*` to:

```text
https://aero-api.onrender.com
```

If Render gives the backend a different URL, update `vercel.json` and redeploy Vercel.

## API Endpoints

```text
GET /health
GET /
GET /dashboard
GET /api/flights
GET /api/flights/region?lamin=6&lomin=68&lamax=37.5&lomax=97.5
GET /api/flights/altitude?min_alt=10000&max_alt=40000
GET /api/weather/sigmets
GET /api/weather/metars?ids=VIDP,VABB,VOBL,VOMM,VOHS,VECC,VAAH
```

## Credentials

OpenSky credentials are loaded automatically from:

```text
backend/credentials/credentials.json
```

If missing, the backend falls back to:

```text
credentials.json
```

Expected format:

```json
{
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret"
}
```

For production, use `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` environment variables instead of uploading credential JSON files.

## Verified So Far

- FastAPI app imports successfully
- Python source compiles
- `/health` returns OK
- `/dashboard` serves the frontend
- OpenSky OAuth token flow works
- India region flight endpoint returned live aircraft
- Indian METAR endpoint returned live observations
- SIGMET endpoint returned live GeoJSON
- Frontend is wired to backend APIs

## Notes

- The dashboard polls aircraft every 5 seconds.
- Weather data is cached for 60 seconds.
- OpenSky flight responses are cached briefly to smooth polling.
- The backend intentionally avoids global OpenSky calls and uses bounding boxes for performance and rate-limit safety.
