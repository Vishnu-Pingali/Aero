import { httpErr } from '../utils/bbox.js';

export class AutorouterService {
  /**
   * @param {import('../config.js').default} settings
   * @param {import('axios').AxiosInstance} client
   * @param {import('../cache/manager.js').CacheManager} cache
   */
  constructor(settings, client, cache) {
    this._settings = settings;
    this._client = client;
    this._cache = cache;
    this._cachedToken = null;
    this._tokenExpiry = 0; // Epoch time in ms
  }

  get credentialsConfigured() {
    return Boolean(
      this._settings.autorouter &&
      this._settings.autorouter.clientId &&
      this._settings.autorouter.clientSecret
    );
  }

  async _getToken() {
    if (!this.credentialsConfigured) {
      throw new Error('Autorouter credentials are not configured.');
    }

    const now = Date.now();
    // Cache token and reuse if valid (give 30s buffer)
    if (this._cachedToken && this._tokenExpiry > now + 30000) {
      return this._cachedToken;
    }

    const { clientId, clientSecret } = this._settings.autorouter;
    const url = 'https://api.autorouter.aero/v1.0/oauth2/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    try {
      console.log('[Autorouter] Requesting access token...');
      const response = await this._client.post(url, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new Error('Access token not found in oauth response.');
      }

      this._cachedToken = access_token;
      const ttlMs = (expires_in ? parseInt(expires_in, 10) : 3600) * 1000;
      this._tokenExpiry = Date.now() + ttlMs;

      console.log('[Autorouter] Access token retrieved successfully.');
      return this._cachedToken;
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error('[Autorouter] Authentication failed:', detail);
      throw new Error(`Autorouter Authentication failed: ${err.message}`);
    }
  }

  /**
   * Fetch waypoint coordinates for a route between departure and arrival ICAO.
   */
  async fetchRouteWaypoints(originIcao, destinationIcao) {
    if (!originIcao || !destinationIcao) {
      return [];
    }

    const key = `autorouter:route:${originIcao.toUpperCase()}:${destinationIcao.toUpperCase()}`;
    // Cache generated routes for 6 hours (21600 seconds)
    return this._cache.getOrSet(key, 21600, () =>
      this._generateAndPollRoute(originIcao.toUpperCase(), destinationIcao.toUpperCase())
    );
  }

  async _generateAndPollRoute(originIcao, destinationIcao) {
    const token = await this._getToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // 1. Submit routing request
    const routerUrl = 'https://api.autorouter.aero/v1.0/router';
    const requestBody = {
      departure: originIcao,
      destination: destinationIcao,
      aircraftid: 0,
      departuretime: new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    console.log(`[Autorouter] Generating route from ${originIcao} to ${destinationIcao}...`);
    let routeId;
    try {
      const response = await this._client.post(routerUrl, requestBody, { headers });
      routeId = response.data.id ?? response.data.route_id ?? response.data.routeId;
      if (!routeId) {
        throw new Error('No route ID returned from router endpoint.');
      }
      console.log(`[Autorouter] Route request submitted. Route ID: ${routeId}`);
    } catch (err) {
      const detail = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error('[Autorouter] Route generation request failed:', detail);
      throw new Error(`Autorouter route request failed: ${err.message}`);
    }

    // 2. Poll progress via longpoll PUT request
    const longpollUrl = `https://api.autorouter.aero/v1.0/router/${encodeURIComponent(routeId)}/longpoll`;
    
    // We poll in a loop up to 8 seconds max duration.
    const pollMaxDurationMs = 8000;
    const pollIntervalMs = 1000;
    const start = Date.now();
    let waypoints = [];

    while (Date.now() - start < pollMaxDurationMs) {
      try {
        console.log(`[Autorouter] Long polling for Route ID ${routeId}...`);
        const response = await this._client.put(longpollUrl, {}, { headers, timeout: 5000 });
        
        const commands = Array.isArray(response.data) ? response.data : [response.data].filter(Boolean);
        let quitReceived = false;
        
        for (const cmd of commands) {
          if (!cmd || typeof cmd !== 'object') continue;

          console.log(`[Autorouter] Polled command received: ${cmd.cmdname}`);

          if (cmd.error) {
            console.warn(`[Autorouter] Error in polling command: ${cmd.error}`);
          }

          if (cmd.cmdname === 'solution' || cmd.cmdname === 'fpl') {
            const fplObj = cmd.fpl;
            if (fplObj && typeof fplObj === 'object') {
              const rawWps = fplObj.waypoints ?? fplObj.crossing ?? fplObj.crossings;
              if (Array.isArray(rawWps) && rawWps.length > 0) {
                waypoints = this._parseWaypointsList(rawWps);
              }
            }
          }

          if (cmd.cmdname === 'quit') {
            quitReceived = true;
          }
        }

        if (waypoints.length > 0) {
          console.log(`[Autorouter] Successfully resolved ${waypoints.length} waypoints.`);
          break;
        }

        if (quitReceived) {
          console.log('[Autorouter] Session terminated (received quit).');
          break;
        }

      } catch (err) {
        console.warn(`[Autorouter] Longpoll error: ${err.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Clean up/close session on the server if possible
    try {
      await this._client.delete(`https://api.autorouter.aero/v1.0/router/${encodeURIComponent(routeId)}`, { headers });
    } catch (e) {}

    if (waypoints.length === 0) {
      throw new Error(`Could not resolve waypoints for route ${originIcao} -> ${destinationIcao} within timeout.`);
    }

    return waypoints;
  }

  _parseWaypointsList(rawWps) {
    const list = [];
    for (const wp of rawWps) {
      if (!wp || typeof wp !== 'object') continue;
      const lat = wp.lat ?? wp.latitude ?? wp.coordlatdeg ?? wp.arplatdeg ?? wp.latdeg;
      const lon = wp.lon ?? wp.longitude ?? wp.coordlondeg ?? wp.arplondeg ?? wp.londeg ?? wp.lng;
      const label = wp.name ?? wp.ident ?? wp.icao ?? wp.label;
      if (lat != null && lon != null && label) {
        list.push({
          type: 'waypoint',
          label: String(label).toUpperCase(),
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
        });
      }
    }
    return list;
  }
}
