// ── services/airlabs.js ───────────────────────────────────────────────────────
// AirLabsService — full port of Python backend/app/services/airlabs.py
// ──────────────────────────────────────────────────────────────────────────────

import { airportCoords } from '../utils/airports.js';
import { clampToDefaultBbox, normalizeBbox, smallBbox, httpErr } from '../utils/bbox.js';
import { getAircraft, upsertAircraft } from '../utils/jsonStore.js';
import { appendFileSync } from 'fs';
import { getDistanceKm } from './opensky.js';

// Simple LRU-style in-process cache for airport coord lookups (avoids repeated
// dict lookups for common airports like JFK across a large batch).
const _airportCoordsCache = new Map();
function cachedAirportCoords(iata) {
  if (!iata) return null;
  const key = iata.toUpperCase();
  if (_airportCoordsCache.has(key)) return _airportCoordsCache.get(key);
  const result = airportCoords(key);
  _airportCoordsCache.set(key, result);
  return result;
}

export class AirLabsService {
  /**
   * @param {import('../config.js').default} settings
   * @param {import('axios').AxiosInstance}  client
   * @param {import('../cache/manager.js').CacheManager} cache
   * @param {import('./opensky.js').OpenSkyService} [openskyService]
   */
  constructor(settings, client, cache, openskyService = null) {
    this._settings         = settings;
    this._client           = client;
    this._cache            = cache;
    this._openskyService   = openskyService;
    this._lastRequestAt    = 0;   // ms since epoch
    this._requestLock      = false;
    this._requestLockQueue = [];
    this._trackHistory     = new Map();
    this._lastSeen         = new Map();
  }

  get apiKeyConfigured() { return Boolean(this._apiKey ?? this._settings.airlabsApiKey); }

  // Lazily load API key (mirrors Python _load_api_key)
  get _apiKey() { return this._settings.airlabsApiKey; }

  // ── Public API ──────────────────────────────────────────────────────────────

  async getDefaultFlights() {
    return this.getRegionFlights(...this._settings.defaultBbox);
  }

  async getRegionFlights(lamin, lomin, lamax, lomax) {
    const bbox = clampToDefaultBbox([lamin, lomin, lamax, lomax], this._settings.defaultBbox);
    const normBbox = normalizeBbox(...bbox, this._settings.maxBboxAreaDegrees);
    const key = `airlabs:flights:${normBbox}`;
    return this._cache.getOrSet(
      key,
      this._settings.airlabsCacheTtlSeconds,
      () => this._fetchFlights(normBbox),
    );
  }

  /**
   * Locate an aircraft by ICAO24, progressively widening the search bbox.
   * Checks aircraft_cache.json first.
   * If the found aircraft is missing aircraft_type, queries the AirLabs aircraft
   * database to enrich it (result is cached for 30 days).
   */
  async getAircraftNear(icao24, latitude, longitude, aircraftCachePath = null) {
    const normalizedIcao = icao24.toLowerCase();

    // ── JSON aircraft cache ──
    if (aircraftCachePath) {
      const cached = await getAircraft(aircraftCachePath, normalizedIcao, 600);
      if (cached) {
        try {
          const { cached_at: _drop, ...rest } = cached;
          console.debug(`[AirLabs] aircraft ${icao24.toUpperCase()} served from JSON cache`);
          return rest;
        } catch (e) {
          console.warn(`[AirLabs] aircraft cache deserialise failed for ${icao24}: ${e.message}`);
        }
      }
    }

    // ── Live fetch (progressively wider bboxes) ──
    for (const margin of [1.0, 3.0]) {
      const bbox = smallBbox(latitude, longitude, this._settings.defaultBbox, margin);
      const response = await this._fetchFlights(bbox, false);
      const match = response.flights.find(f => f.icao24 === normalizedIcao);
      if (match) {
        const enriched = await this._enrichAircraftType(match);
        if (aircraftCachePath) {
          try { await upsertAircraft(aircraftCachePath, normalizedIcao, enriched); } catch { /* ignore */ }
        }
        return enriched;
      }
    }

    // Final fallback: full default region
    const response = await this._fetchFlights(this._settings.defaultBbox, false);
    const match = response.flights.find(f => f.icao24 === normalizedIcao);
    if (match) {
      const enriched = await this._enrichAircraftType(match);
      if (aircraftCachePath) {
        try { await upsertAircraft(aircraftCachePath, normalizedIcao, enriched); } catch { /* ignore */ }
      }
      return enriched;
    }

    throw httpErr(
      404,
      `Aircraft ${icao24.toUpperCase()} was not found in the current AirLabs feed. ` +
      'It may have landed or be outside the monitored region.',
    );
  }

  /**
   * Return a route with origin → current → destination waypoints.
   */
  async getAircraftRoute(icao24, latitude, longitude, aircraftCachePath = null) {
    let aircraft = await this.getAircraftNear(icao24, latitude, longitude, aircraftCachePath);

    if (aircraft.callsign) {
      const cacheKey = `airlabs:route:callsign:${aircraft.callsign.toUpperCase()}`;
      const routeData = await this._cache.getOrSet(
        cacheKey,
        86400, // cache for 24 hours
        () => this._fetchRoute(aircraft.callsign),
      );

      if (routeData) {
        if (routeData.dep_iata && !aircraft.origin_iata) aircraft.origin_iata = routeData.dep_iata.toUpperCase();
        if (routeData.dep_icao && !aircraft.origin_icao) aircraft.origin_icao = routeData.dep_icao.toUpperCase();
        if (routeData.arr_iata && !aircraft.destination_iata) aircraft.destination_iata = routeData.arr_iata.toUpperCase();
        if (routeData.arr_icao && !aircraft.destination_icao) aircraft.destination_icao = routeData.arr_icao.toUpperCase();
        if (routeData.flight_number && !aircraft.flight_number) aircraft.flight_number = routeData.flight_number;
        if (routeData.airline_iata && !aircraft.airline_iata) aircraft.airline_iata = routeData.airline_iata.toUpperCase();
        if (routeData.airline_icao && !aircraft.airline_icao) aircraft.airline_icao = routeData.airline_icao.toUpperCase();
        if (routeData.duration && !aircraft.duration_min) aircraft.duration_min = routeData.duration;
        if (routeData.aircraft_icao && !aircraft.aircraft_type) aircraft.aircraft_type = routeData.aircraft_icao.toUpperCase();
      }
    }

    aircraft = await this._hydrateRouteAirports(aircraft);

    let waypoints = [];
    if (this._openskyService) {
      try {
        waypoints = await this._openskyService.fetchFlightPath(
          icao24,
          aircraft.origin_latitude,
          aircraft.origin_longitude
        );
      } catch (err) {
        console.warn(`[AirLabs] OpenSky failed to fetch track for ${icao24}: ${err.message}`);
      }
    }

    // Check for route reversal (swapped origin/destination) using actual track data
    if (waypoints && waypoints.length > 0) {
      if (
        aircraft.origin_latitude != null &&
        aircraft.origin_longitude != null &&
        aircraft.destination_latitude != null &&
        aircraft.destination_longitude != null
      ) {
        const startPt = waypoints[0];
        const distToOrigin = getDistanceKm(startPt.latitude, startPt.longitude, aircraft.origin_latitude, aircraft.origin_longitude);
        const distToDest = getDistanceKm(startPt.latitude, startPt.longitude, aircraft.destination_latitude, aircraft.destination_longitude);

        if (distToDest < distToOrigin) {
          console.log(`[AirLabs] Route reversal detected for ${aircraft.callsign || aircraft.icao24}. Swapping origin and destination.`);
          
          const temp = {
            iata: aircraft.origin_iata,
            icao: aircraft.origin_icao,
            name: aircraft.origin_name,
            lat: aircraft.origin_latitude,
            lon: aircraft.origin_longitude,
          };

          aircraft.origin_iata = aircraft.destination_iata;
          aircraft.origin_icao = aircraft.destination_icao;
          aircraft.origin_name = aircraft.destination_name;
          aircraft.origin_latitude = aircraft.destination_latitude;
          aircraft.origin_longitude = aircraft.destination_longitude;

          aircraft.destination_iata = temp.iata;
          aircraft.destination_icao = temp.icao;
          aircraft.destination_name = temp.name;
          aircraft.destination_latitude = temp.lat;
          aircraft.destination_longitude = temp.lon;
        }
      }
    }

    if (aircraftCachePath) {
      try { await upsertAircraft(aircraftCachePath, icao24.toLowerCase(), aircraft); } catch { /* ignore */ }
    }

    let points = [];
    if (waypoints && waypoints.length > 0) {
      const current = {
        type:      'current',
        label:     aircraft.callsign ?? aircraft.icao24.toUpperCase(),
        latitude:  aircraft.latitude,
        longitude: aircraft.longitude,
      };

      if (aircraft.origin_latitude != null && aircraft.origin_longitude != null) {
        const origin = {
          type:      'origin',
          label:     aircraft.origin_iata ?? aircraft.origin_icao ?? 'Origin',
          latitude:  aircraft.origin_latitude,
          longitude: aircraft.origin_longitude,
        };
        points.push(origin);
      }

      points.push(...waypoints);
      points.push(current);

      if (aircraft.destination_latitude != null && aircraft.destination_longitude != null) {
        const dest = {
          type:      'destination',
          label:     aircraft.destination_iata ?? aircraft.destination_icao ?? 'Destination',
          latitude:  aircraft.destination_latitude,
          longitude: aircraft.destination_longitude,
        };
        points.push(dest);
      }
    } else {
      points = routePoints(aircraft);
    }

    if (points.length < 2) {
      throw httpErr(404, 'No origin or destination airport coordinates are available for this flight.');
    }
    return { aircraft, points };
  }

  async getAltitudeFiltered(minAlt, maxAlt, bbox = null) {
    if (minAlt != null && maxAlt != null && minAlt > maxAlt) {
      throw httpErr(422, 'min_alt must be less than max_alt.');
    }
    const response = bbox == null
      ? await this.getDefaultFlights()
      : await this.getRegionFlights(...bbox);
    const flights = response.flights.filter(f => {
      if (f.altitude_ft == null) return false;
      if (minAlt != null && f.altitude_ft < minAlt) return false;
      if (maxAlt != null && f.altitude_ft > maxAlt) return false;
      return true;
    });
    return { ...response, count: flights.length, flights };
  }

  async probeLiveData() {
    const start = Date.now();
    const bbox = this._settings.defaultBbox;
    try {
      const response = await this._fetchFlights(bbox);
      return {
        ok:              true,
        elapsed_seconds: (Date.now() - start) / 1000,
        bbox,
        count:           response.count,
        source_time:     response.source_time,
        api_key_configured: Boolean(this._apiKey),
      };
    } catch (err) {
      return {
        ok:              false,
        elapsed_seconds: (Date.now() - start) / 1000,
        bbox,
        error_type:      err.constructor?.name,
        error:           err.message,
        api_key_configured: Boolean(this._apiKey),
      };
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _updateTrackHistory(flights) {
    const now = Math.floor(Date.now() / 1000);
    const activeIcaos = new Set();

    for (const flight of flights) {
      const icao = flight.icao24.toLowerCase();
      activeIcaos.add(icao);

      if (flight.latitude != null && flight.longitude != null) {
        if (!this._trackHistory.has(icao)) {
          this._trackHistory.set(icao, []);
        }
        const history = this._trackHistory.get(icao);
        const last = history[history.length - 1];
        if (!last || last.lat !== flight.latitude || last.lon !== flight.longitude) {
          history.push({
            lat: flight.latitude,
            lon: flight.longitude,
            altitude: flight.altitude_ft || 0,
            heading: flight.heading || 0,
            timestamp: now,
            ts: now * 1000
          });

          // Limit history points (keep last 1000, minimum requirement is 500)
          if (history.length > 1000) {
            history.shift();
          }
        }
      }
    }

    // Clean up inactive flights (older than 15 minutes of inactivity)
    for (const icao of activeIcaos) {
      this._lastSeen.set(icao, now);
    }
    for (const icao of this._trackHistory.keys()) {
      const lastSeenTime = this._lastSeen.get(icao) || 0;
      if (now - lastSeenTime > 900) {
        this._trackHistory.delete(icao);
        this._lastSeen.delete(icao);
      }
    }
  }

  async _fetchFlights(bbox, respectInterval = true) {
    if (!this._apiKey) {
      throw httpErr(503, 'AirLabs API key is not configured.');
    }
    if (respectInterval) await this._respectMinInterval();

    const url = `${this._settings.airlabsBaseUrl.replace(/\/$/, '')}/flights`;

    let response;
    try {
      response = await this._client.get(
        url,
        {
          params: { api_key: this._apiKey, bbox: bbox.join(',') },
          headers: { Accept: 'application/json' },
        },
      );
      let rawDataStr = JSON.stringify(response.data);
      if (this._apiKey) {
        rawDataStr = rawDataStr.split(this._apiKey).join('[REDACTED]');
      }

      const logMsg = `\n--- SUCCESS DIAGNOSTICS ---\nTimestamp: ${new Date().toISOString()}\nAPI URL: ${url}\nBBOX: ${JSON.stringify(bbox)}\nHTTP Status: ${response.status}\nHeaders: ${JSON.stringify(response.headers)}\nRaw Response: ${rawDataStr.slice(0, 1000)}\nResponse Count: ${response.data?.response?.length || 0}\nError: ${JSON.stringify(response.data?.error)}\n---------------------------\n`;
      try { appendFileSync('v:\\BUP\\backend-node\\data\\diagnostics.log', logMsg); } catch (e) {}

      if (this._settings.environment !== 'production') {
        console.debug(`[AirLabs] Successful fetch. Count=${response.data?.response?.length || 0}`);
      }
    } catch (err) {
      let errDataStr = err.response ? JSON.stringify(err.response.data) : err.message;
      if (this._apiKey) {
        errDataStr = errDataStr.split(this._apiKey).join('[REDACTED]');
      }

      const errLogMsg = `\n--- ERROR DIAGNOSTICS ---\nTimestamp: ${new Date().toISOString()}\nAPI URL: ${url}\nBBOX: ${JSON.stringify(bbox)}\nHTTP Status: ${err.response ? err.response.status : 'No Response'}\nHeaders: ${err.response ? JSON.stringify(err.response.headers) : 'N/A'}\nRaw Response (Error): ${errDataStr.slice(0, 1000)}\n-------------------------\n`;
      try { appendFileSync('v:\\BUP\\backend-node\\data\\diagnostics.log', errLogMsg); } catch (e) {}

      if (err.response) {
        const status = err.response.status;
        console.error(`[AirLabs] API request failed with status ${status}. Details: ${errDataStr.slice(0, 200)}`);

        if (status === 429) throw httpErr(429, 'AirLabs rate limit reached; retry shortly.');
        if (status >= 500) throw httpErr(502, 'AirLabs service is temporarily unavailable.');
        throw httpErr(502, 'AirLabs flights request failed.');
      }
      console.error(`[AirLabs] Fetch Error: ${err.message}`);
      throw httpErr(504, 'AirLabs timed out or is unreachable.');
    }

    const payload = response.data;

    // Check for API-returned errors inside 200 OK responses
    if (payload && payload.error) {
      const errMsg = payload.error.message || 'Unknown AirLabs API error';
      throw httpErr(400, `AirLabs API Error: ${errMsg}`);
    }

    const rows = flightRows(payload);
    const flights = rows.map(parseAircraft).filter(Boolean).slice(0, this._settings.maxAircraftReturned);

    // Update the track history
    this._updateTrackHistory(flights);

    // Attach trails to the flight objects
    const flightsWithTrails = flights.map(f => ({
      ...f,
      trail: this._trackHistory.get(f.icao24.toLowerCase()) || []
    }));

    return {
      source:      'airlabs',
      source_time: sourceTime(payload),
      fetched_at:  null,
      count:       flightsWithTrails.length,
      bbox,
      flights:     flightsWithTrails,
    };
  }

  async _hydrateRouteAirports(aircraft) {
    const updates = {};

    // ── Origin ──────────────────────────────────────────────────────────────
    const originLocal = aircraft.origin_iata ? cachedAirportCoords(aircraft.origin_iata) : null;
    if (aircraft.origin_latitude == null || aircraft.origin_longitude == null) {
      if (originLocal) {
        const [lat, lon, name] = originLocal;
        updates.origin_latitude  = lat;
        updates.origin_longitude = lon;
        if (!aircraft.origin_name) updates.origin_name = name;
      } else {
        const api = await this._airportFor(aircraft.origin_iata, aircraft.origin_icao);
        if (api) Object.assign(updates, airportUpdates(api, 'origin', aircraft));
      }
    } else if (!aircraft.origin_name && originLocal) {
      updates.origin_name = originLocal[2];
    }

    // ── Destination ─────────────────────────────────────────────────────────
    const destLocal = aircraft.destination_iata ? cachedAirportCoords(aircraft.destination_iata) : null;
    if (aircraft.destination_latitude == null || aircraft.destination_longitude == null) {
      if (destLocal) {
        const [lat, lon, name] = destLocal;
        updates.destination_latitude  = lat;
        updates.destination_longitude = lon;
        if (!aircraft.destination_name) updates.destination_name = name;
      } else {
        const api = await this._airportFor(aircraft.destination_iata, aircraft.destination_icao);
        if (api) Object.assign(updates, airportUpdates(api, 'destination', aircraft));
      }
    } else if (!aircraft.destination_name && destLocal) {
      updates.destination_name = destLocal[2];
    }

    return Object.keys(updates).length ? { ...aircraft, ...updates } : aircraft;
  }

  async _airportFor(iata, icao) {
    for (const [codeType, code] of [['iata_code', iata], ['icao_code', icao]]) {
      if (!code) continue;
      const key = `airlabs:airport:${codeType}:${code.toUpperCase()}`;
      const airport = await this._cache.getOrSet(
        key,
        86400,
        () => this._fetchAirport(codeType, code),
      );
      if (airport) return airport;
    }
    return null;
  }

  async _fetchAirport(codeType, code) {
    if (!this._apiKey) throw httpErr(503, 'AirLabs API key is not configured.');
    try {
      const response = await this._client.get(
        `${this._settings.airlabsBaseUrl.replace(/\/$/, '')}/airports`,
        {
          params: { api_key: this._apiKey, [codeType]: code.toUpperCase() },
          headers: { Accept: 'application/json' },
        },
      );
      const rows = responseRows(response.data);
      return rows[0] ?? null;
    } catch (err) {
      if (err.response) {
        console.warn(`[AirLabs] airport request failed: ${err.response.status}`);
        return null;
      }
      return null;
    }
  }

  async _fetchRoute(callsign) {
    if (!this._apiKey) throw httpErr(503, 'AirLabs API key is not configured.');
    try {
      const response = await this._client.get(
        `${this._settings.airlabsBaseUrl.replace(/\/$/, '')}/routes`,
        {
          params: { api_key: this._apiKey, flight_icao: callsign.toUpperCase() },
          headers: { Accept: 'application/json' },
        },
      );
      const rows = responseRows(response.data);
      if (rows && rows.length > 0) return rows[0];

      // Fallback: try with flight_iata if flight_icao didn't find the route
      const responseIata = await this._client.get(
        `${this._settings.airlabsBaseUrl.replace(/\/$/, '')}/routes`,
        {
          params: { api_key: this._apiKey, flight_iata: callsign.toUpperCase() },
          headers: { Accept: 'application/json' },
        },
      );
      const rowsIata = responseRows(responseIata.data);
      return rowsIata[0] ?? null;
    } catch (err) {
      console.warn(`[AirLabs] route fetch failed for ${callsign}: ${err.message}`);
      return null;
    }
  }

  async getScheduledRoutes(depIata, arrIata) {
    if (!this._apiKey) throw httpErr(503, 'AirLabs API key is not configured.');

    const key = `airlabs:routes:${depIata.toUpperCase()}:${arrIata.toUpperCase()}`;
    return this._cache.getOrSet(
      key,
      86400, // 24 hours TTL
      async () => {
        try {
          const response = await this._client.get(
            `${this._settings.airlabsBaseUrl.replace(/\/$/, '')}/routes`,
            {
              params: {
                api_key: this._apiKey,
                dep_iata: depIata.toUpperCase(),
                arr_iata: arrIata.toUpperCase(),
              },
              headers: { Accept: 'application/json' },
            }
          );
          const rows = responseRows(response.data);
          return {
            source: 'airlabs_routes',
            count: rows.length,
            routes: rows,
          };
        } catch (err) {
          console.warn(`[AirLabs] routes fetch failed for ${depIata}->${arrIata}: ${err.message}`);
          throw httpErr(502, 'Failed to fetch scheduled routes from AirLabs.');
        }
      }
    );
  }

  /** Rate-limiter: ensure at least `airlabsMinRequestIntervalMs` between fetches. */
  _respectMinInterval() {
    return new Promise((resolve) => {
      const elapsed  = Date.now() - this._lastRequestAt;
      const waitFor  = this._settings.airlabsMinRequestIntervalMs - elapsed;
      if (waitFor <= 0) {
        this._lastRequestAt = Date.now();
        resolve();
      } else {
        setTimeout(() => {
          this._lastRequestAt = Date.now();
          resolve();
        }, waitFor);
      }
    });
  }

  /**
   * If the aircraft object is missing `aircraft_type`, query the AirLabs
   * /aircraft database endpoint by ICAO24 hex code and enrich it.
   * Results are cached for 30 days (aircraft types never change).
   *
   * Falls back silently — never throws.
   *
   * @param {object} aircraft
   * @returns {Promise<object>} aircraft (possibly enriched with aircraft_type)
   */
  async _enrichAircraftType(aircraft) {
    if (aircraft.aircraft_type) return aircraft; // already known
    if (!aircraft.icao24) return aircraft;

    try {
      const dbRecord = await this._fetchAircraftDatabase(aircraft.icao24);
      if (dbRecord) {
        const type = dbRecord.aircraft_icao ?? dbRecord.iata_code ?? dbRecord.aircraft_type ?? null;
        const regNum = dbRecord.reg_number ?? dbRecord.registration ?? null;
        return {
          ...aircraft,
          aircraft_type: type ? String(type).toUpperCase() : aircraft.aircraft_type,
          reg_number:    aircraft.reg_number ?? regNum,
        };
      }
    } catch (err) {
      console.debug(`[AirLabs] aircraft type enrichment failed for ${aircraft.icao24}: ${err.message}`);
    }
    return aircraft;
  }

  /**
   * Query the AirLabs /aircraft database endpoint for detailed aircraft
   * information including aircraft type/model. Results cached for 30 days.
   *
   * @param {string} icao24  lowercase hex ICAO24 address
   * @returns {Promise<object|null>}
   */
  async _fetchAircraftDatabase(icao24) {
    if (!this._apiKey) return null;
    const hex = icao24.toLowerCase();
    const cacheKey = `airlabs:aircraft_db:${hex}`;
    const TTL_30_DAYS = 30 * 24 * 3600;

    return this._cache.getOrSet(
      cacheKey,
      TTL_30_DAYS,
      async () => {
        try {
          const response = await this._client.get(
            `${this._settings.airlabsBaseUrl.replace(/\/$/, '')}/aircraft`,
            {
              params: { api_key: this._apiKey, hex },
              headers: { Accept: 'application/json' },
              timeout: 8000,
            },
          );
          const rows = responseRows(response.data);
          if (rows && rows.length > 0) {
            console.debug(`[AirLabs] aircraft DB hit for ${hex.toUpperCase()}: type=${rows[0].aircraft_icao ?? rows[0].iata_code ?? 'unknown'}`);
            return rows[0];
          }
          return null;
        } catch (err) {
          // Network/API errors are non-fatal; just return null so rendering falls back to generic
          if (err.response) {
            console.debug(`[AirLabs] aircraft DB request failed for ${hex}: HTTP ${err.response.status}`);
          } else {
            console.debug(`[AirLabs] aircraft DB request error for ${hex}: ${err.message}`);
          }
          return null;
        }
      }
    );
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function airportUpdates(api, role, aircraft) {
  const updates = {};
  const lat  = floatOrNull(api.lat  ?? api.latitude);
  const lon  = floatOrNull(api.lng  ?? api.lon ?? api.longitude);
  const name = api.name;
  const iata = api.iata_code;
  const icao = api.icao_code;

  if (lat  != null && aircraft[`${role}_latitude`]  == null) updates[`${role}_latitude`]  = lat;
  if (lon  != null && aircraft[`${role}_longitude`] == null) updates[`${role}_longitude`] = lon;
  if (name && !aircraft[`${role}_name`]) updates[`${role}_name`] = name;
  if (iata && !aircraft[`${role}_iata`]) updates[`${role}_iata`] = String(iata).toUpperCase();
  if (icao && !aircraft[`${role}_icao`]) updates[`${role}_icao`] = String(icao).toUpperCase();
  return updates;
}

function routePoints(aircraft) {
  const points = [];

  const current = {
    type:      'current',
    label:     aircraft.callsign ?? aircraft.icao24.toUpperCase(),
    latitude:  aircraft.latitude,
    longitude: aircraft.longitude,
  };

  if (aircraft.origin_latitude != null && aircraft.origin_longitude != null) {
    const origin = {
      type:      'origin',
      label:     aircraft.origin_iata ?? aircraft.origin_icao ?? 'Origin',
      latitude:  aircraft.origin_latitude,
      longitude: aircraft.origin_longitude,
    };
    if (!coordsEqual(origin, current)) points.push(origin);
  }

  points.push(current);

  if (aircraft.destination_latitude != null && aircraft.destination_longitude != null) {
    const dest = {
      type:      'destination',
      label:     aircraft.destination_iata ?? aircraft.destination_icao ?? 'Destination',
      latitude:  aircraft.destination_latitude,
      longitude: aircraft.destination_longitude,
    };
    if (!coordsEqual(dest, current)) points.push(dest);
  }

  return points;
}

function coordsEqual(a, b, tol = 0.01) {
  return Math.abs(a.latitude - b.latitude) < tol && Math.abs(a.longitude - b.longitude) < tol;
}

function flightRows(payload) {
  return responseRows(payload);
}

function responseRows(payload) {
  if (Array.isArray(payload)) return payload.filter(r => r && typeof r === 'object');
  if (!payload || typeof payload !== 'object') return [];
  const response = payload.response;
  if (Array.isArray(response)) return response.filter(r => r && typeof r === 'object');
  if (response && typeof response === 'object') {
    const flights = response.flights ?? response.data;
    if (Array.isArray(flights)) return flights.filter(r => r && typeof r === 'object');
    return [response];
  }
  const data = payload.data;
  if (Array.isArray(data)) return data.filter(r => r && typeof r === 'object');
  if (data && typeof data === 'object') return [data];
  return [];
}

function sourceTime(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const req = payload.request;
  if (req && typeof req === 'object') {
    const t = intOrNull(req.timestamp ?? req.time);
    if (t != null) return t;
  }
  return intOrNull(payload.timestamp ?? payload.time);
}

function parseAircraft(row) {
  const latitude  = floatOrNull(row.lat  ?? row.latitude);
  const longitude = floatOrNull(row.lng  ?? row.lon ?? row.longitude);
  const icao24    = row.hex ?? row.icao24 ?? row.aircraft_icao ?? row.reg_number;
  if (!icao24 || latitude == null || longitude == null) return null;

  const altitude_m        = floatOrNull(row.alt ?? row.altitude);
  const speed_kmh         = floatOrNull(row.speed ?? row.ground_speed);
  const vertical_rate_mps = floatOrNull(row.v_speed ?? row.vertical_speed);
  const callsign          = row.flight_icao ?? row.flight_iata ?? row.flight_number ?? row.callsign;
  const origin_iata       = (row.dep_iata ?? row.departure_iata ?? row.origin_iata)?.toUpperCase() ?? null;
  const origin_icao       = (row.dep_icao ?? row.departure_icao ?? row.origin_icao)?.toUpperCase() ?? null;
  const destination_iata  = (row.arr_iata ?? row.arrival_iata ?? row.destination_iata)?.toUpperCase() ?? null;
  const destination_icao  = (row.arr_icao ?? row.arrival_icao ?? row.destination_icao)?.toUpperCase() ?? null;

  const oCoords = origin_iata      ? cachedAirportCoords(origin_iata)      : null;
  const dCoords = destination_iata ? cachedAirportCoords(destination_iata) : null;

  return {
    icao24:               String(icao24).toLowerCase(),
    callsign:             callsign ? String(callsign).trim() : null,
    latitude,
    longitude,
    altitude_m,
    altitude_ft:          altitude_m != null ? Math.round(altitude_m * 3.28084) : null,
    velocity_mps:         speed_kmh  != null ? Math.round(speed_kmh / 3.6 * 100) / 100 : null,
    velocity_kts:         speed_kmh  != null ? Math.round(speed_kmh / 1.852) : null,
    heading:              floatOrNull(row.dir ?? row.heading),
    vertical_rate_mps,
    vertical_rate_fpm:    vertical_rate_mps != null ? Math.round(vertical_rate_mps * 196.85) : null,
    country:              row.flag ?? row.country ?? null,
    on_ground:            ['landed', 'ground', 'scheduled'].includes(String(row.status ?? '').toLowerCase()),
    origin_iata,
    origin_icao,
    origin_name:          row.dep_name ?? row.departure_name ?? row.origin_name ?? null,
    origin_latitude:      floatOrNull(row.dep_lat ?? row.departure_lat ?? row.origin_latitude) ?? (oCoords ? oCoords[0] : null),
    origin_longitude:     floatOrNull(row.dep_lng ?? row.dep_lon ?? row.departure_lng ?? row.origin_longitude) ?? (oCoords ? oCoords[1] : null),
    destination_iata,
    destination_icao,
    destination_name:     row.arr_name ?? row.arrival_name ?? row.destination_name ?? null,
    destination_latitude: floatOrNull(row.arr_lat ?? row.arrival_lat ?? row.destination_latitude) ?? (dCoords ? dCoords[0] : null),
    destination_longitude:floatOrNull(row.arr_lng ?? row.arr_lon ?? row.arrival_lng ?? row.destination_longitude) ?? (dCoords ? dCoords[1] : null),
    aircraft_type:        row.aircraft_icao ?? row.aircraft_type ?? row.model ?? null,
    reg_number:           row.reg_number ?? null,
  };
}

function floatOrNull(value) {
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function intOrNull(value) {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}
