// ── services/weather.js ───────────────────────────────────────────────────────
// WeatherService — port of Python backend/app/services/weather.py
// Fetches SIGMETs and METARs from aviationweather.gov and caches them.
// ──────────────────────────────────────────────────────────────────────────────

import { httpErr } from '../utils/bbox.js';

export class WeatherService {
  /**
   * @param {import('../config.js').default} settings
   * @param {import('axios').AxiosInstance}  client
   * @param {import('../cache/manager.js').CacheManager} cache
   */
  constructor(settings, client, cache) {
    this._settings = settings;
    this._client   = client;
    this._cache    = cache;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async getSigmets() {
    return this._cache.getOrSet(
      'weather:sigmets',
      this._settings.weatherCacheTtlSeconds,
      () => this._fetchSigmets(),
    );
  }

  async getMetars(ids) {
    const stationIds = normalizeStationIds(ids);
    const key = `weather:metars:${stationIds.join(',')}`;
    return this._cache.getOrSet(
      key,
      this._settings.weatherCacheTtlSeconds,
      () => this._fetchMetars(stationIds),
    );
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  async _fetchSigmets() {
    const urls = [
      this._settings.weatherSigmetUrl,
      this._settings.weatherIsigmetUrl,
    ];

    const requests = urls.map(url =>
      this._client.get(url, {
        params: { format: 'geojson' },
        headers: {
          'User-Agent': this._settings.userAgent,
          Accept: 'application/geo+json, application/json',
        },
      }).catch(err => {
        if (err.response) {
          const status = err.response.status;
          if (status === 429) {
            throw httpErr(429, 'AviationWeather rate limit reached; retry shortly.');
          }
          console.warn(`[WeatherService] SIGMET request failed for ${url}: ${status}`);
          return { status, data: null };
        }
        console.warn(`[WeatherService] SIGMET request timed out/failed for ${url}: ${err.message}`);
        return { status: 504, data: null };
      })
    );

    const responses = await Promise.all(requests);

    // Merge features from successful responses
    let mergedFeatures = [];
    for (const res of responses) {
      if (res && res.data && Array.isArray(res.data.features)) {
        mergedFeatures.push(...res.data.features);
      }
    }

    const parsedSigmets = mergedFeatures.map(parseSigmet);
    const geojson = {
      type: 'FeatureCollection',
      features: mergedFeatures,
    };

    return {
      source: 'aviationweather.gov (domestic + international)',
      count: parsedSigmets.length,
      geojson,
      sigmets: parsedSigmets,
    };
  }

  async _fetchMetars(ids) {
    let response;
    try {
      response = await this._client.get(this._settings.weatherMetarUrl, {
        params: { ids: ids.join(','), format: 'json' },
        headers: {
          'User-Agent': this._settings.userAgent,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        if (status === 429) throw httpErr(429, 'AviationWeather rate limit reached; retry shortly.');
        console.warn(`[WeatherService] METAR request failed: ${status}`);
        throw httpErr(502, 'AviationWeather METAR request failed.');
      }
      throw httpErr(504, 'AviationWeather timed out or is unreachable.');
    }

    if (response.status === 204) return { source: 'aviationweather.gov', count: 0, observations: [] };

    const payload = response.data;
    const rows = Array.isArray(payload) ? payload : (payload.data ?? []);
    const observations = rows.filter(r => r && typeof r === 'object').map(parseMetar);
    return { source: 'aviationweather.gov', count: observations.length, observations };
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function parseSigmet(feature) {
  const properties = feature.properties ?? {};
  const sigmetType =
    properties.hazard ??
    properties.hazardType ??
    properties.type ??
    properties.airSigmetType ??
    null;
  const rawText =
    properties.rawAirSigmet ??
    properties.rawText ??
    properties.raw_text ??
    properties.text ??
    null;
  const severity = inferSeverity(sigmetType, rawText ?? '');
  return {
    id:         properties.id ?? properties.airSigmetId ?? feature.id ?? null,
    type:       sigmetType,
    severity,
    raw_text:   rawText,
    geometry:   feature.geometry ?? null,
    properties,
  };
}

function parseMetar(row) {
  return {
    station:             row.icaoId ?? row.station_id ?? row.id ?? 'UNKNOWN',
    observed:            observedTime(row.obsTime ?? row.observation_time ?? row.reportTime),
    raw_text:            row.rawOb ?? row.raw_text ?? row.raw ?? null,
    flight_category:     row.fltCat ?? row.flight_category ?? null,
    latitude:            floatOrNull(row.lat ?? row.latitude),
    longitude:           floatOrNull(row.lon ?? row.longitude),
    temperature_c:       floatOrNull(row.temp ?? row.temp_c),
    dewpoint_c:          floatOrNull(row.dewp ?? row.dewpoint_c),
    wind_direction_deg:  intOrNull(row.wdir ?? row.wind_dir_degrees),
    wind_speed_kt:       intOrNull(row.wspd ?? row.wind_speed_kt),
    wind_gust_kt:        intOrNull(row.wgst ?? row.wind_gust_kt),
    visibility_sm:       floatOrNull(row.visib ?? row.visibility_statute_mi),
    altimeter_in_hg:     altimeterInHg(row.altim ?? row.altim_in_hg),
    clouds:              Array.isArray(row.clouds) ? row.clouds : [],
  };
}

function normalizeStationIds(ids) {
  const unique = [];
  const seen = new Set();
  for (const id of ids) {
    const cleaned = id.trim().toUpperCase();
    if (cleaned && /^[A-Z0-9]{3,4}$/.test(cleaned) && !seen.has(cleaned)) {
      unique.push(cleaned);
      seen.add(cleaned);
    }
  }
  if (unique.length === 0) return ['KJFK', 'KLAX', 'KORD', 'KATL', 'KDFW', 'KDEN', 'KSFO', 'KMIA'];
  return unique.slice(0, 12);
}

function observedTime(value) {
  if (value == null) return null;
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  return String(value);
}

function inferSeverity(sigmetType, rawText) {
  const val = `${sigmetType ?? ''} ${rawText}`.toUpperCase();
  if (val.includes('EXTREME')) return 'extreme';
  if (val.includes('SEV') || val.includes('CONV') || val.includes('VOLCANIC') || val.includes('ASH'))
    return 'severe';
  if (val.includes('MOD')) return 'moderate';
  return 'advisory';
}

function floatOrNull(value) {
  if (typeof value === 'string' && value.endsWith('+')) value = value.slice(0, -1);
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function intOrNull(value) {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function altimeterInHg(value) {
  const alt = floatOrNull(value);
  if (alt === null) return null;
  if (alt > 100) return Math.round(alt * 0.0295299830714 * 100) / 100;
  return alt;
}
