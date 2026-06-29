// ── utils/bbox.js ─────────────────────────────────────────────────────────────
// Bounding-box helpers — port of Python bbox.py + helpers from airlabs.py
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validate and round a bounding box to 5dp. Throws an HTTP-style error object
 * (with .status and .message) on validation failure so Express routes can
 * propagate it cleanly.
 *
 * @param {number} lamin
 * @param {number} lomin
 * @param {number} lamax
 * @param {number} lomax
 * @param {number} maxArea
 * @returns {[number, number, number, number]}
 */
export function normalizeBbox(lamin, lomin, lamax, lomax, maxArea) {
  if (lamin < -90 || lamin > 90 || lamax < -90 || lamax > 90)
    throw httpErr(422, 'Latitude must be between -90 and 90.');
  if (lomin < -180 || lomin > 180 || lomax < -180 || lomax > 180)
    throw httpErr(422, 'Longitude must be between -180 and 180.');
  if (lamin >= lamax)
    throw httpErr(422, 'lamin must be less than lamax.');
  if (lomin >= lomax)
    throw httpErr(422, 'lomin must be less than lomax.');

  const area = (lamax - lamin) * (lomax - lomin);
  // Only enforce area limit if maxArea is set and is a reasonable limit (< 65000 = worldwide)
  if (maxArea && maxArea < 65000 && area > maxArea)
    throw httpErr(422, `Bounding box is too large. Max area is ${maxArea} square degrees.`);

  return [r5(lamin), r5(lomin), r5(lamax), r5(lomax)];
}

/**
 * Clamp a requested bbox to the default bbox. Returns the default bbox if the
 * intersection is degenerate (no overlap).
 *
 * @param {[number,number,number,number]} bbox
 * @param {[number,number,number,number]} defaultBbox
 * @returns {[number,number,number,number]}
 */
export function clampToDefaultBbox(bbox, defaultBbox) {
  const [lamin, lomin, lamax, lomax] = bbox;
  const [dLamin, dLomin, dLamax, dLomax] = defaultBbox;
  const clamped = [
    Math.max(lamin, dLamin),
    Math.max(lomin, dLomin),
    Math.min(lamax, dLamax),
    Math.min(lomax, dLomax),
  ];
  if (clamped[0] >= clamped[2] || clamped[1] >= clamped[3]) return defaultBbox;
  return clamped;
}

/**
 * Build a bounding box `margin` degrees around a lat/lon, clamped to defaultBbox.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {[number,number,number,number]} defaultBbox
 * @param {number} margin
 * @returns {[number,number,number,number]}
 */
export function smallBbox(latitude, longitude, defaultBbox, margin = 1.0) {
  const [dLamin, dLomin, dLamax, dLomax] = defaultBbox;
  const lamin = Math.max(dLamin, latitude - margin);
  const lomin = Math.max(dLomin, longitude - margin);
  const lamax = Math.min(dLamax, latitude + margin);
  const lomax = Math.min(dLomax, longitude + margin);
  if (lamin >= lamax || lomin >= lomax) return defaultBbox;
  return [r5(lamin), r5(lomin), r5(lamax), r5(lomax)];
}

// ── internals ─────────────────────────────────────────────────────────────────

function r5(n) { return Math.round(n * 100000) / 100000; }

export function httpErr(status, message) {
  const err = new Error(message);
  err.status = status;
  err.detail = message;
  return err;
}
