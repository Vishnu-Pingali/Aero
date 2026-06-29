// ── utils/jsonStore.js ────────────────────────────────────────────────────────
// Atomic JSON read/write helpers for the on-disk flight/aircraft cache.
// Port of Python backend/app/utils/json_store.py
//
// All writes use a write-then-rename pattern to prevent partial/corrupt files.
// Per-file mutexes prevent concurrent write interleaving.
// ──────────────────────────────────────────────────────────────────────────────
import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { Mutex } from 'async-mutex';

// One Mutex per file path — keys are absolute path strings
const _locks = new Map();

function _lockFor(filePath) {
  if (!_locks.has(filePath)) _locks.set(filePath, new Mutex());
  return _locks.get(filePath);
}

/**
 * Read and parse a JSON file. Returns null if missing or unreadable.
 * @param {string} filePath  Absolute path
 * @returns {Promise<any|null>}
 */
export async function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const text = await readFile(filePath, 'utf-8');
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[jsonStore] readJson failed for ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Atomically write `data` as JSON to `filePath` (write to .tmp → rename).
 * @param {string} filePath
 * @param {any}    data
 */
export async function writeJson(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  const mutex = _lockFor(filePath);
  await mutex.runExclusive(async () => {
    try {
      await writeFile(tmp, JSON.stringify(data), 'utf-8');
      await rename(tmp, filePath);
    } catch (err) {
      console.error(`[jsonStore] writeJson failed for ${filePath}: ${err.message}`);
      throw err;
    }
  });
}

/**
 * Insert or overwrite a single aircraft record in the aircraft JSON cache.
 * File stores an object keyed by lowercase ICAO24, each entry has `cached_at`.
 *
 * @param {string} filePath
 * @param {string} icao24
 * @param {object} aircraftData
 */
export async function upsertAircraft(filePath, icao24, aircraftData) {
  const mutex = _lockFor(filePath);
  await mutex.runExclusive(async () => {
    let existing = {};
    if (existsSync(filePath)) {
      try {
        existing = JSON.parse(await readFile(filePath, 'utf-8'));
      } catch {
        existing = {};
      }
    }

    existing[icao24.toLowerCase()] = {
      ...aircraftData,
      cached_at: new Date().toISOString(),
    };

    await mkdir(dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    try {
      await writeFile(tmp, JSON.stringify(existing), 'utf-8');
      await rename(tmp, filePath);
    } catch (err) {
      console.error(`[jsonStore] upsertAircraft failed for ${filePath}: ${err.message}`);
      throw err;
    }
  });
}

/**
 * Return a cached aircraft record if it exists and is not stale.
 * Returns null if missing, ICAO24 not found, or older than maxAgeSeconds.
 *
 * @param {string} filePath
 * @param {string} icao24
 * @param {number} maxAgeSeconds
 * @returns {Promise<object|null>}
 */
export async function getAircraft(filePath, icao24, maxAgeSeconds = 600) {
  const data = await readJson(filePath);
  if (!data || typeof data !== 'object') return null;
  const record = data[icao24.toLowerCase()];
  if (!record || typeof record !== 'object') return null;

  const cachedAt = record.cached_at;
  if (cachedAt) {
    try {
      const age = (Date.now() - new Date(cachedAt).getTime()) / 1000;
      if (age > maxAgeSeconds) return null;
    } catch {
      // malformed timestamp — treat as valid to avoid re-fetch loop
    }
  }
  return record;
}
