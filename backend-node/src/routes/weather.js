// ── routes/weather.js ────────────────────────────────────────────────────────
// Port of Python backend/app/routes/weather.py
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';

const router = Router();

router.get('/api/weather/sigmets', async (req, res, next) => {
  try {
    const result = await req.app.locals.weatherService.getSigmets();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/api/weather/metars', async (req, res, next) => {
  try {
    const idsParam = req.query.ids ?? 'KJFK,KLAX,KORD,KATL,KDFW,KDEN,KSFO,KMIA';
    const ids = String(idsParam).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    if (ids.length === 0) {
      return res.status(422).json({ detail: 'At least one airport identifier is required.' });
    }
    if (ids.some(id => !/^[A-Z0-9]{3,4}$/.test(id))) {
      return res.status(422).json({ detail: 'Airport identifiers must be 3 to 4 character alphanumeric strings.' });
    }

    const result = await req.app.locals.weatherService.getMetars(ids);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
