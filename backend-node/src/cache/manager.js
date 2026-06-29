// ── cache/manager.js ──────────────────────────────────────────────────────────
// Port of Python backend/app/cache/manager.py
// In-memory cache backed by node-cache with per-key async mutex to prevent
// stampedes (same double-checked locking pattern as the Python version).
// ──────────────────────────────────────────────────────────────────────────────
import NodeCache from 'node-cache';
import { Mutex } from 'async-mutex';

export class CacheManager {
  constructor() {
    // useClones:false — values are already plain JS objects, no need to clone
    this._cache = new NodeCache({ useClones: false });
    
    // key → { mutex: Mutex, refCount: number, lastKnownGood: * }
    // We store metadata including lastKnownGood value directly here to support stale-on-error caching,
    // which operates even after node-cache has evicted/expired the key.
    this._store = new Map();
  }

  /**
   * Return cached value for `key` if it exists and is not expired; otherwise
   * call `factory()`, store the result with the given TTL (seconds), and return it.
   * If `factory()` throws an error, it falls back to the last known good cached value.
   *
   * @param {string}   key
   * @param {number}   ttlSeconds
   * @param {() => Promise<*>} factory
   * @returns {Promise<*>}
   */
  async getOrSet(key, ttlSeconds, factory) {
    const hit = this._cache.get(key);
    if (hit !== undefined) return hit;

    // Acquire lock entry with reference counting
    let entry = this._store.get(key);
    if (!entry) {
      // LRU-style prune to prevent Map size from growing unbounded
      if (this._store.size >= 1000) {
        for (const [k, e] of this._store.entries()) {
          if (e.refCount === 0) {
            this._store.delete(k);
            break;
          }
        }
      }
      entry = { mutex: new Mutex(), refCount: 0, lastKnownGood: undefined };
      this._store.set(key, entry);
    }
    entry.refCount++;

    try {
      return await entry.mutex.runExclusive(async () => {
        // Double-check cache hit after locking
        const hit2 = this._cache.get(key);
        if (hit2 !== undefined) return hit2;

        try {
          const value = await factory();
          this._cache.set(key, value, ttlSeconds);
          entry.lastKnownGood = value; // Preserve last known good value
          return value;
        } catch (err) {
          // If factory refresh fails, immediately check for stale fallback value
          if (entry.lastKnownGood !== undefined) {
            console.warn(`[CacheManager] Factory failed for key "${key}": ${err.message}. Serving stale fallback cache.`);
            return entry.lastKnownGood;
          }
          throw err;
        }
      });
    } finally {
      // Decrement reference count and delete entry from Map if unused and has no stale cache to preserve
      entry.refCount--;
      if (entry.refCount === 0 && entry.lastKnownGood === undefined) {
        if (this._store.get(key) === entry) {
          this._store.delete(key);
        }
      }
    }
  }
}
