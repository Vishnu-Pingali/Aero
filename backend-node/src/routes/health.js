// ── routes/health.js ─────────────────────────────────────────────────────────
// Port of Python backend/app/routes/health.py
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/health/config', (req, res) => {
  const { settings, airlabsService } = req.app.locals;
  res.json({
    status:                     'ok',
    environment:                settings.environment,
    airlabs_api_key_configured: airlabsService.apiKeyConfigured,
    airlabs_timeout_seconds:    settings.airlabsTimeoutMs / 1000,
    airlabs_cache_ttl_seconds:  settings.airlabsCacheTtlSeconds,
    default_bbox:               settings.defaultBbox,
  });
});

router.get('/health/airlabs', async (req, res, next) => {
  try {
    const result = await req.app.locals.airlabsService.probeLiveData();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
