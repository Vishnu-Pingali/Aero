// ── config.js ─────────────────────────────────────────────────────────────────
// Port of Python backend/app/config/settings.py
// Reads .env (if present) and exposes a frozen settings object.
// ──────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, '..');
const REPO_DIR    = resolve(BACKEND_DIR, '..');

// Load .env from the backend root (same as Python's load_dotenv)
loadDotenv({ path: resolve(BACKEND_DIR, '.env') });

// ── helpers ───────────────────────────────────────────────────────────────────
function envStr(name, fallback = undefined) {
  const v = process.env[name];
  if (!v || !v.trim()) return fallback;
  return v.trim();
}

function envFloat(name, fallback) {
  const v = process.env[name];
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function envInt(name, fallback) {
  const v = process.env[name];
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function envPath(name, fallback) {
  const v = process.env[name];
  if (!v || !v.trim()) return fallback;
  return resolve(v.trim());
}

function corsOrigins() {
  const configured = process.env.CORS_ORIGINS;
  if (configured) {
    return configured.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [
    'null',
    'http://localhost',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ];
}

// ── Load API key from credentials files (mirrors _load_api_key in Python) ──
function loadApiKey() {
  const envKey = envStr('AIRLABS_API_KEY');
  if (envKey) return envKey;

  const paths = [
    envPath('AIRLABS_CREDENTIALS_PATH', resolve(BACKEND_DIR, 'credentials', 'credentials.json')),
    resolve(REPO_DIR, 'credentials.json'),
  ];

  for (const p of paths) {
    try {
      const payload = JSON.parse(readFileSync(p, 'utf-8'));
      for (const key of ['airlabs_api_key', 'api_key', 'key']) {
        const val = payload[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
      }
    } catch {
      // file missing or unreadable — continue
    }
  }
  return null;
}


// ── Load OpenSky credentials ──
function loadOpenSkyCredentials() {
  const envUser = envStr('OPENSKY_USERNAME');
  const envPass = envStr('OPENSKY_PASSWORD');
  if (envUser && envPass) return { username: envUser, password: envPass };

  const paths = [
    resolve(REPO_DIR, 'credentials.json'),
    resolve(BACKEND_DIR, 'credentials', 'credentials.json'),
  ];

  for (const p of paths) {
    try {
      const payload = JSON.parse(readFileSync(p, 'utf-8'));
      const username = payload.opensky_username ?? payload.openskyUsername;
      const password = payload.opensky_password ?? payload.openskyPassword;
      if (username && password) {
        return { username: username.trim(), password: password.trim() };
      }
    } catch {
      // file missing or unreadable — continue
    }
  }
  return { username: null, password: null };
}

// ── Settings object (immutable after creation) ────────────────────────────────
const settings = Object.freeze({
  appName:    'Aero Ops Intelligence API',
  appVersion: '1.0.0',
  environment: envStr('ENVIRONMENT', 'production'),
  logLevel:    envStr('LOG_LEVEL', 'info'),
  port:        envInt('PORT', 8000),

  airlabsApiKey:                  loadApiKey(),
  airlabsBaseUrl:                 envStr('AIRLABS_BASE_URL', 'https://airlabs.co/api/v9'),
  airlabsTimeoutMs:               envFloat('AIRLABS_TIMEOUT_SECONDS', 30) * 1000,
  airlabsCacheTtlSeconds:         envInt('AIRLABS_CACHE_TTL_SECONDS', 300),
  airlabsMinRequestIntervalMs:    envFloat('AIRLABS_MIN_REQUEST_INTERVAL_SECONDS', 300) * 1000,

  weatherSigmetUrl:          'https://aviationweather.gov/api/data/airsigmet',
  weatherIsigmetUrl:         'https://aviationweather.gov/api/data/isigmet',
  weatherMetarUrl:           'https://aviationweather.gov/api/data/metar',
  weatherCacheTtlSeconds:    envInt('WEATHER_CACHE_TTL_SECONDS', 60),
  weatherTimeoutMs:          envFloat('WEATHER_TIMEOUT_SECONDS', 20) * 1000,
  userAgent:                 'Aero-Ops-Intelligence/1.0 contact=local',

  opensky:                   loadOpenSkyCredentials(),

  // Default worldwide bounding box [lamin, lomin, lamax, lomax]
  defaultBbox: [-90.0, -180.0, 90.0, 180.0],
  maxBboxAreaDegrees: 65000.0,
  maxAircraftReturned: 5000,

  corsOrigins: corsOrigins(),
});

export default settings;
