import axios from 'axios';

export class OpenSkyService {
  /**
   * @param {import('../config.js').default} settings
   * @param {import('axios').AxiosInstance} client
   * @param {import('../cache/manager.js').CacheManager} cache
   */
  constructor(settings, client, cache) {
    this._settings = settings;
    this._client = client;
    this._cache = cache;
  }

  /**
   * Fetch historical flown waypoints for an aircraft by its ICAO24 transponder code.
   */
  async fetchFlightPath(icao24, originLat = null, originLon = null) {
    if (!icao24) return [];

    const cacheKey = `opensky:track:${icao24.toLowerCase()}`;
    // Cache tracks for 3 minutes to avoid hammering OpenSky's API
    return this._cache.getOrSet(cacheKey, 180, () => this._fetchLiveTrack(icao24.toLowerCase(), originLat, originLon));
  }

  async _fetchLiveTrack(icao24, originLat = null, originLon = null) {
    // Current time in seconds for the flight interval
    const nowSec = Math.floor(Date.now() / 1000);
    const url = `https://opensky-network.org/api/tracks/all?icao24=${encodeURIComponent(icao24)}&time=${nowSec}`;

    try {
      console.log(`[OpenSky] Requesting track for aircraft ${icao24.toUpperCase()}...`);
      
      const config = {
        headers: {
          Accept: 'application/json',
        },
      };

      // Support OpenSky authentication via settings if configured
      if (this._settings.opensky && this._settings.opensky.username && this._settings.opensky.password) {
        config.auth = {
          username: this._settings.opensky.username,
          password: this._settings.opensky.password,
        };
      }

      const response = await this._client.get(url, config);
      const { path } = response.data;

      if (!Array.isArray(path) || path.length === 0) {
        console.log(`[OpenSky] No track points returned for ${icao24.toUpperCase()}.`);
        return [];
      }

      console.log(`[OpenSky] Retrieved ${path.length} track points for ${icao24.toUpperCase()}.`);

      // Sort path chronologically (ascending by timestamp pt[0])
      const sortedPath = [...path].sort((a, b) => {
        const timeA = a[0] != null ? Number(a[0]) : 0;
        const timeB = b[0] != null ? Number(b[0]) : 0;
        return timeA - timeB;
      });

      // Filter track to only include the current flight segment by walking backwards
      let startIndex = 0;
      for (let i = sortedPath.length - 1; i > 0; i--) {
        const curr = sortedPath[i];
        const prev = sortedPath[i - 1];

        // 1. Time gap check (more than 30 minutes / 1800 seconds)
        if (curr[0] != null && prev[0] != null && (curr[0] - prev[0]) > 1800) {
          startIndex = i;
          break;
        }

        // 2. Ground status check
        if (prev[5] === true || String(prev[5]).toLowerCase() === 'true' || prev[5] === 1) {
          startIndex = i;
          break;
        }

        // 3. Distance to origin check (within 15 km)
        if (originLat != null && originLon != null && prev[1] != null && prev[2] != null) {
          const dist = getDistanceKm(
            parseFloat(prev[1]),
            parseFloat(prev[2]),
            parseFloat(originLat),
            parseFloat(originLon)
          );
          if (dist < 15) {
            startIndex = i;
            break;
          }
        }
      }

      const currentSegment = sortedPath.slice(startIndex);
      console.log(`[OpenSky] Filtered current segment to ${currentSegment.length} of ${sortedPath.length} points for ${icao24.toUpperCase()}.`);

      // Downsample to max 50 points to prevent high overhead
      const waypoints = [];
      const step = Math.max(1, Math.floor(currentSegment.length / 50));
      
      for (let i = 0; i < currentSegment.length; i += step) {
        const pt = currentSegment[i];
        if (pt[1] != null && pt[2] != null) {
          waypoints.push({
            type: 'waypoint',
            label: `WPT${waypoints.length + 1}`,
            latitude: parseFloat(pt[1]),
            longitude: parseFloat(pt[2]),
          });
        }
      }
      
      // Ensure the last point is included
      const lastPt = currentSegment[currentSegment.length - 1];
      if (currentSegment.length > 1 && (currentSegment.length - 1) % step !== 0 && lastPt[1] != null && lastPt[2] != null) {
        waypoints.push({
          type: 'waypoint',
          label: `WPT${waypoints.length + 1}`,
          latitude: parseFloat(lastPt[1]),
          longitude: parseFloat(lastPt[2]),
        });
      }

      return waypoints;
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      console.warn(`[OpenSky] Track request failed for ${icao24.toUpperCase()}:`, detail);
      return [];
    }
  }
}

/**
 * Great-circle distance helper (Haversine formula) in kilometers.
 */
export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
