// ── routes/flights.js ────────────────────────────────────────────────────────
// Port of Python backend/app/routes/flights.py
// Handles all /api/flights routes including the SSE stream.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { readJson } from '../utils/jsonStore.js';
import { airportCoords } from '../utils/airports.js';

const router = Router();

// ── Helper: read from flights_cache.json ──────────────────────────────────────

async function flightsFromCache(flightsCachePath, maxAgeSeconds = 360) {
  const data = await readJson(flightsCachePath);
  if (!data || typeof data !== 'object') return null;

  const fetchedAtStr = data.fetched_at;
  if (fetchedAtStr) {
    try {
      const age = (Date.now() - new Date(fetchedAtStr).getTime()) / 1000;
      if (age > maxAgeSeconds) {
        console.info(`[flights] flights_cache.json is ${Math.round(age)}s old — bypassing cache`);
        return null;
      }
    } catch { /* malformed timestamp — fall through */ }
  }

  try {
    const flights = (data.flights ?? []);
    return {
      source:      'json_cache',
      source_time: data.source_time ?? null,
      fetched_at:  data.fetched_at  ?? null,
      count:       flights.length,
      bbox:        data.bbox ?? [24, -125, 50, -66],
      flights,
    };
  } catch (err) {
    console.warn(`[flights] Failed to deserialise flights_cache.json: ${err.message}`);
    return null;
  }
}


// ── GET /api/flights ──────────────────────────────────────────────────────────

router.get('/api/flights', async (req, res, next) => {
  try {
    const { airlabsService, flightsCachePath, settings } = req.app.locals;
    const maxAge = (settings?.airlabsCacheTtlSeconds ?? 300) + 60;
    const cached = await flightsFromCache(flightsCachePath, maxAge);
    if (cached) return res.json(cached);

    try {
      const result = await airlabsService.getDefaultFlights();
      res.json(result);
    } catch (apiErr) {
      console.warn(`[flights] Live fetch failed: ${apiErr.message}. Attempting expired cache fallback.`);
      const fallback = await flightsFromCache(flightsCachePath, Infinity);
      if (fallback) {
        fallback.source = 'json_cache_expired_fallback';
        return res.json(fallback);
      }
      throw apiErr;
    }
  } catch (err) {
    next(err);
  }
});

// ── GET /api/flights/region ───────────────────────────────────────────────────

router.get('/api/flights/region', async (req, res, next) => {
  try {
    const { airlabsService, flightsCachePath, settings } = req.app.locals;
    const { lamin, lomin, lamax, lomax } = req.query;

    if ([lamin, lomin, lamax, lomax].some(v => v == null)) {
      return res.status(422).json({ detail: 'lamin, lomin, lamax, lomax are required query params.' });
    }

    const latMin = parseFloat(lamin);
    const lonMin = parseFloat(lomin);
    const latMax = parseFloat(lamax);
    const lonMax = parseFloat(lomax);

    if (isNaN(latMin) || isNaN(lonMin) || isNaN(latMax) || isNaN(lonMax)) {
      return res.status(422).json({ detail: 'lamin, lomin, lamax, lomax must be valid numbers.' });
    }
    if (latMin < -90 || latMin > 90 || latMax < -90 || latMax > 90) {
      return res.status(422).json({ detail: 'Latitude values must be between -90 and 90.' });
    }
    if (lonMin < -180 || lonMin > 180 || lonMax < -180 || lonMax > 180) {
      return res.status(422).json({ detail: 'Longitude values must be between -180 and 180.' });
    }
    if (latMin >= latMax) {
      return res.status(422).json({ detail: 'lamin must be less than lamax.' });
    }
    if (lonMin >= lonMax) {
      return res.status(422).json({ detail: 'lomin must be less than lomax.' });
    }

    // Serve from JSON cache first (if within TTL)
    const maxAge = (settings?.airlabsCacheTtlSeconds ?? 300) + 60;
    const cached = await flightsFromCache(flightsCachePath, maxAge);
    if (cached) return res.json(cached);

    try {
      const result = await airlabsService.getRegionFlights(latMin, lonMin, latMax, lonMax);
      res.json(result);
    } catch (apiErr) {
      console.warn(`[flights] Region live fetch failed: ${apiErr.message}. Attempting expired cache fallback.`);
      const fallback = await flightsFromCache(flightsCachePath, Infinity);
      if (fallback) {
        fallback.source = 'json_cache_expired_fallback';
        return res.json(fallback);
      }
      throw apiErr;
    }
  } catch (err) {
    next(err);
  }
});

// ── GET /api/flights/altitude ─────────────────────────────────────────────────

router.get('/api/flights/altitude', async (req, res, next) => {
  try {
    const { airlabsService, flightsCachePath, settings } = req.app.locals;
    const { min_alt, max_alt, lamin, lomin, lamax, lomax } = req.query;

    const minAlt = min_alt != null ? parseInt(min_alt, 10) : null;
    const maxAlt = max_alt != null ? parseInt(max_alt, 10) : null;

    if (min_alt != null && (isNaN(minAlt) || minAlt < 0)) {
      return res.status(422).json({ detail: 'min_alt must be a non-negative integer.' });
    }
    if (max_alt != null && (isNaN(maxAlt) || maxAlt < 0)) {
      return res.status(422).json({ detail: 'max_alt must be a non-negative integer.' });
    }
    if (minAlt !== null && maxAlt !== null && minAlt > maxAlt) {
      return res.status(422).json({ detail: 'min_alt must be less than or equal to max_alt.' });
    }

    let bbox = null;
    const vals = [lamin, lomin, lamax, lomax].map(v => (v != null ? parseFloat(v) : null));
    if (vals.some(v => v !== null)) {
      if (vals.some(v => v === null || isNaN(v))) {
        return res.status(422).json({ detail: 'lamin, lomin, lamax, lomax must all be valid numbers if any are provided.' });
      }
      const [latMin, lonMin, latMax, lonMax] = vals;
      if (latMin < -90 || latMin > 90 || latMax < -90 || latMax > 90) {
        return res.status(422).json({ detail: 'Latitude values must be between -90 and 90.' });
      }
      if (lonMin < -180 || lonMin > 180 || lonMax < -180 || lonMax > 180) {
        return res.status(422).json({ detail: 'Longitude values must be between -180 and 180.' });
      }
      if (latMin >= latMax) {
        return res.status(422).json({ detail: 'lamin must be less than lamax.' });
      }
      if (lonMin >= lonMax) {
        return res.status(422).json({ detail: 'lomin must be less than lomax.' });
      }
      bbox = vals;
    }

    try {
      const result = await airlabsService.getAltitudeFiltered(minAlt, maxAlt, bbox);
      res.json(result);
    } catch (apiErr) {
      console.warn(`[flights] Altitude live fetch failed: ${apiErr.message}. Attempting expired cache fallback.`);
      const cached = await flightsFromCache(flightsCachePath, Infinity);
      if (cached) {
        const flights = cached.flights.filter(f => {
          if (f.altitude_ft == null) return false;
          if (minAlt !== null && f.altitude_ft < minAlt) return false;
          if (maxAlt !== null && f.altitude_ft > maxAlt) return false;
          return true;
        });
        return res.json({
          ...cached,
          source: 'json_cache_expired_fallback',
          count: flights.length,
          flights
        });
      }
      throw apiErr;
    }
  } catch (err) {
    next(err);
  }
});

// ── GET /api/flights/aircraft/:icao24 ─────────────────────────────────────────

router.get('/api/flights/aircraft/:icao24', async (req, res, next) => {
  try {
    const { airlabsService, aircraftCachePath } = req.app.locals;
    const { icao24 } = req.params;
    const { latitude, longitude } = req.query;

    if (!/^[a-fA-F0-9]{6}$/.test(icao24)) {
      return res.status(422).json({ detail: 'icao24 must be a 6-character hex string.' });
    }
    if (latitude == null || longitude == null) {
      return res.status(422).json({ detail: 'latitude and longitude are required query params.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(422).json({ detail: 'latitude and longitude must be valid numbers.' });
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(422).json({ detail: 'latitude must be between -90/90 and longitude between -180/180.' });
    }

    const result = await airlabsService.getAircraftNear(
      icao24, lat, lon, aircraftCachePath,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/flights/aircraft/:icao24/route ───────────────────────────────────

router.get('/api/flights/aircraft/:icao24/route', async (req, res, next) => {
  try {
    const { airlabsService, aircraftCachePath } = req.app.locals;
    const { icao24 } = req.params;
    const { latitude, longitude } = req.query;

    if (!/^[a-fA-F0-9]{6}$/.test(icao24)) {
      return res.status(422).json({ detail: 'icao24 must be a 6-character hex string.' });
    }
    if (latitude == null || longitude == null) {
      return res.status(422).json({ detail: 'latitude and longitude are required query params.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(422).json({ detail: 'latitude and longitude must be valid numbers.' });
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(422).json({ detail: 'latitude must be between -90/90 and longitude between -180/180.' });
    }

    const result = await airlabsService.getAircraftRoute(
      icao24, lat, lon, aircraftCachePath,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/routes ──────────────────────────────────────────────────────────

router.get('/api/routes', async (req, res, next) => {
  try {
    const { airlabsService } = req.app.locals;
    const { dep_iata, arr_iata } = req.query;

    if (!dep_iata || !arr_iata) {
      return res.status(422).json({ detail: 'dep_iata and arr_iata are required query parameters.' });
    }

    const dep = String(dep_iata).trim().toUpperCase();
    const arr = String(arr_iata).trim().toUpperCase();

    if (!/^[A-Z0-9]{3}$/.test(dep) || !/^[A-Z0-9]{3}$/.test(arr)) {
      return res.status(422).json({ detail: 'Airport codes must be 3-character alphanumeric strings.' });
    }

    const result = await airlabsService.getScheduledRoutes(dep, arr);
    
    // Enrich with airport coordinates and names if found
    const depData = airportCoords(dep);
    const arrData = airportCoords(arr);
    
    if (depData) {
      result.dep_coords = { lat: depData[0], lon: depData[1], name: depData[2] };
    }
    if (arrData) {
      result.arr_coords = { lat: arrData[0], lon: arrData[1], name: arrData[2] };
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/flights/stream (SSE) ─────────────────────────────────────────────

router.get('/api/flights/stream', (req, res) => {
  const { sseBroadcaster } = req.app.locals;

  // SSE headers
  res.set({
    'Content-Type':     'text/event-stream',
    'Cache-Control':    'no-cache',
    'X-Accel-Buffering':'no',
    Connection:         'keep-alive',
  });
  res.flushHeaders();

  // Immediate "connected" event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Register this client
  sseBroadcaster.subscribe(res);
  console.debug(`[SSE] client connected (total=${sseBroadcaster.clientCount})`);

  let cleaned = false;
  
  // Keep-alive ping every 15 s
  const pingInterval = setInterval(() => {
    if (res.destroyed || req.destroyed || !res.writable) {
      cleanup();
      return;
    }
    try {
      res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
    } catch {
      cleanup();
    }
  }, 15_000);

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(pingInterval);
    sseBroadcaster.unsubscribe(res);
    console.debug(`[SSE] client disconnected (total=${sseBroadcaster.clientCount})`);
  }

  req.on('close', cleanup);
  req.on('error', cleanup);
});

export default router;
