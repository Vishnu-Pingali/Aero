// ── services/scheduler.js ─────────────────────────────────────────────────────
// Background flight scheduler + SSE broadcaster.
// Port of Python backend/app/services/scheduler.py
// ──────────────────────────────────────────────────────────────────────────────

import { writeJson } from '../utils/jsonStore.js';
import { appendFileSync } from 'fs';

// ── SSEBroadcaster ────────────────────────────────────────────────────────────
// Manages a set of active SSE response objects. When the scheduler fetches new
// flight data it calls broadcast() to push the event to every open connection.
// ─────────────────────────────────────────────────────────────────────────────

export class SSEBroadcaster {
  constructor() {
    /** @type {Set<import('express').Response>} */
    this._clients = new Set();
    this.onClientCountChange = null;
  }

  get clientCount() { return this._clients.size; }

  /**
   * Register a new SSE client (the Express `res` object).
   * @param {import('express').Response} res
   */
  subscribe(res) {
    this._clients.add(res);
    if (typeof this.onClientCountChange === 'function') {
      this.onClientCountChange(this.clientCount);
    }
  }

  /**
   * Remove an SSE client when its connection closes.
   * @param {import('express').Response} res
   */
  unsubscribe(res) {
    this._clients.delete(res);
    if (typeof this.onClientCountChange === 'function') {
      this.onClientCountChange(this.clientCount);
    }
  }

  /**
   * Push `message` (a fully-formatted SSE string, e.g. "data: {...}\n\n")
   * to every connected client. Dead connections are cleaned up automatically.
   * @param {string} message
   */
  broadcast(message) {
    const dead = [];
    for (const res of this._clients) {
      try {
        res.write(message);
      } catch {
        dead.push(res);
      }
    }
    for (const res of dead) this._clients.delete(res);
    if (dead.length > 0) {
      console.debug(`[SSEBroadcaster] dropped ${dead.length} closed connection(s)`);
      if (typeof this.onClientCountChange === 'function') {
        this.onClientCountChange(this.clientCount);
      }
    }
  }
}

// ── FlightScheduler ───────────────────────────────────────────────────────────
// Periodically fetches default-region flights, writes them to JSON cache, and
// broadcasts an SSE refresh event to all connected browsers.
// ─────────────────────────────────────────────────────────────────────────────

export class FlightScheduler {
  /**
   * @param {{
   *   airlabsService: import('./airlabs.js').AirLabsService,
   *   cachePath: string,
   *   intervalSeconds: number,
   *   broadcaster: SSEBroadcaster,
   * }} opts
   */
  constructor({ airlabsService, cachePath, intervalSeconds, broadcaster }) {
    this._service     = airlabsService;
    this._cachePath   = cachePath;
    this._intervalMs  = intervalSeconds * 1000;
    this._broadcaster = broadcaster;
    this._timer       = null;
    this._idleTimeout = null;
  }

  /** Start the scheduler: run immediately, then every intervalMs. */
  start() {
    console.info(
      `[FlightScheduler] started — interval=${this._intervalMs / 1000}s, cache=${this._cachePath}`,
    );

    // Register callback to react to SSE connection events
    this._broadcaster.onClientCountChange = (count) => this._handleClientCountChange(count);

    this._tick();                                  // immediate first run
    this._timer = setInterval(() => this._tick(), this._intervalMs);

    // Assess initial inactivity timeout setup (since client count starts at 0)
    this._handleClientCountChange(this._broadcaster.clientCount);
  }

  /** Stop the scheduler (call on server shutdown). */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
      this._idleTimeout = null;
    }
  }

  _handleClientCountChange(count) {
    if (count > 0) {
      if (this._idleTimeout) {
        console.info('[FlightScheduler] Activity detected. Cancelling scheduled suspend.');
        clearTimeout(this._idleTimeout);
        this._idleTimeout = null;
      }
      if (!this._timer) {
        this._resume();
      }
    } else {
      // count === 0
      if (this._timer && !this._idleTimeout) {
        console.info('[FlightScheduler] 0 clients connected. Scheduling suspend in 10 minutes.');
        this._idleTimeout = setTimeout(() => {
          this._pause();
        }, 10 * 60 * 1000); // 10 minutes
      }
    }
  }

  _pause() {
    console.info('[FlightScheduler] Pausing flight scheduler due to inactivity (0 clients for >10m).');
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._idleTimeout = null;
  }

  _resume() {
    console.info('[FlightScheduler] Active clients detected. Resuming flight scheduler.');
    this._tick();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), this._intervalMs);
  }

  async _tick() {
    const fetchedAt = new Date().toISOString();
    console.info('[FlightScheduler] fetching default-region flights…');
    try {
      const response = await this._service.getDefaultFlights();
      
      console.log("Flights Parsed:", response.flights.length);
      if (response.flights.length > 0) {
        console.log("Sample Flight:", response.flights[0]);
      }

      const schedulerLog = `\n--- SCHEDULER DIAGNOSTICS ---\nTimestamp: ${new Date().toISOString()}\nFlights Parsed: ${response.flights.length}\nSample Flight: ${response.flights.length > 0 ? JSON.stringify(response.flights[0]) : 'None'}\n-----------------------------\n`;
      try { appendFileSync('v:\\BUP\\backend-node\\data\\diagnostics.log', schedulerLog); } catch (e) {}

      const payload = {
        fetched_at:  fetchedAt,
        count:       response.count,
        bbox:        response.bbox,
        source_time: response.source_time,
        flights:     response.flights,
      };
      await writeJson(this._cachePath, payload);
      console.info(`[FlightScheduler] wrote ${response.count} flights to ${this._cachePath}`);

      // Broadcast SSE refresh to all connected browsers
      const msg = JSON.stringify({ type: 'refresh', count: response.count, fetched_at: fetchedAt });
      this._broadcaster.broadcast(`data: ${msg}\n\n`);
    } catch (err) {
      console.error(`[FlightScheduler] tick failed: ${err.message}`, err);
    }
  }
}
