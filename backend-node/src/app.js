// ── app.js ────────────────────────────────────────────────────────────────────
// Express application factory — port of Python main.py (app wiring layer).
// Services are passed in from server.js and attached to app.locals.
// ──────────────────────────────────────────────────────────────────────────────
import express from 'express';
import cors    from 'cors';

import healthRouter  from './routes/health.js';
import flightsRouter from './routes/flights.js';
import weatherRouter from './routes/weather.js';

import settings from './config.js';

/**
 * @param {{
 *   airlabsService:   import('./services/airlabs.js').AirLabsService,
 *   weatherService:   import('./services/weather.js').WeatherService,
 *   sseBroadcaster:   import('./services/scheduler.js').SSEBroadcaster,
 *   flightsCachePath: string,
 *   aircraftCachePath:string,
 * }} services
 */
export function createApp(services) {
  const app = express();

  // ── Attach services to app.locals so routes can access them ─────────────────
  Object.assign(app.locals, { settings, ...services });

  // ── Custom Security Headers (Manual Helmet Equivalent) ──────────────────────
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self' http://127.0.0.1:8000 ws://127.0.0.1:8000; frame-ancestors 'none';");
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  // ── CORS ─────────────────────────────────────────────────────────────────────
  app.use(cors({
    origin(origin, cb) {
      // In production, strictly require the origin to be in settings.corsOrigins
      if (settings.environment === 'production') {
        if (settings.corsOrigins.includes(origin)) {
          return cb(null, true);
        }
        return cb(new Error('CORS Policy: Origin not allowed.'), false);
      }

      // In development, also allow localhost/127.0.0.1 and requests with no origin (e.g., curl)
      if (!origin) return cb(null, true);
      if (settings.corsOrigins.includes(origin)) return cb(null, true);
      if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return cb(null, true);

      cb(new Error('CORS Policy: Origin not allowed.'), false);
    },
    credentials:   true,
    methods:       ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── Body parsing (Request size limit restricted to 10kb) ──────────────────────
  app.use(express.json({ limit: '10kb' }));

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.use(healthRouter);
  app.use(flightsRouter);
  app.use(weatherRouter);

  // ── Root endpoint ─────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      status:  'ok',
      name:    settings.appName,
      version: settings.appVersion,
      docs:    null,
      endpoints: {
        flights:  '/api/flights',
        region:   '/api/flights/region?lamin=33&lomin=-119&lamax=35&lomax=-117',
        altitude: '/api/flights/altitude?min_alt=10000&max_alt=40000',
        stream:   '/api/flights/stream',
        sigmets:  '/api/weather/sigmets',
      },
    });
  });

  app.get('/dashboard', (_req, res) => {
    res.json({ message: 'Use the Vite dev server at http://localhost:5173 for the React frontend.' });
  });

  // ── Error handler ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    let detail = err.detail ?? err.message ?? 'Internal server error';
    
    // Mask internal error details and stack traces in production environment
    if (status >= 500) {
      console.error('[app] Unhandled error:', err);
      if (settings.environment === 'production') {
        detail = 'Internal server error';
      }
    }
    res.status(status).json({ detail });
  });

  return app;
}
