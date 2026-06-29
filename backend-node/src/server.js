// ── server.js ─────────────────────────────────────────────────────────────────
// Entry point — initialises services, starts the scheduler, and begins
// listening on the configured port.
// Port of Python main.py lifespan + uvicorn startup.
// ──────────────────────────────────────────────────────────────────────────────
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

import settings          from './config.js';
import { createApp }     from './app.js';
import { CacheManager }  from './cache/manager.js';
import { AirLabsService }   from './services/airlabs.js';
import { WeatherService }   from './services/weather.js';
import { OpenSkyService }   from './services/opensky.js';
import { SSEBroadcaster, FlightScheduler } from './services/scheduler.js';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR  = resolve(__dirname, '..');
const DATA_DIR     = resolve(BACKEND_DIR, 'data');

const FLIGHTS_CACHE_PATH  = resolve(DATA_DIR, 'flights_cache.json');
const AIRCRAFT_CACHE_PATH = resolve(DATA_DIR, 'aircraft_cache.json');

// ── HTTP client (shared across services) ─────────────────────────────────────
const httpClient = axios.create({
  timeout: Math.max(settings.airlabsTimeoutMs, settings.weatherTimeoutMs),
  headers: { 'User-Agent': settings.userAgent },
});

const cache             = new CacheManager();
const broadcaster       = new SSEBroadcaster();
const openskyService    = new OpenSkyService(settings, httpClient, cache);
const airlabsService    = new AirLabsService(settings, httpClient, cache, openskyService);
const weatherService    = new WeatherService(settings, httpClient, cache);

// ── Background flight scheduler ───────────────────────────────────────────────
const scheduler = new FlightScheduler({
  airlabsService,
  cachePath:       FLIGHTS_CACHE_PATH,
  intervalSeconds: settings.airlabsCacheTtlSeconds,
  broadcaster,
});

// ── Express app ───────────────────────────────────────────────────────────────
const app = createApp({
  airlabsService,
  weatherService,
  sseBroadcaster:    broadcaster,
  flightsCachePath:  FLIGHTS_CACHE_PATH,
  aircraftCachePath: AIRCRAFT_CACHE_PATH,
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(settings.port, '127.0.0.1', () => {
  console.info(`\n🚀  ${settings.appName} v${settings.appVersion}`);
  console.info(`   Listening on http://127.0.0.1:${settings.port}`);
  console.info(`   Environment : ${settings.environment}`);
  console.info(`   AirLabs key : ${settings.airlabsApiKey ? 'configured' : 'NOT configured'}`);
  console.info(`   Cache TTL   : ${settings.airlabsCacheTtlSeconds}s\n`);

  // Start scheduler AFTER server is listening
  scheduler.start();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.info(`\n[server] received ${signal} — shutting down…`);
  scheduler.stop();
  server.close(() => {
    console.info('[server] HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
