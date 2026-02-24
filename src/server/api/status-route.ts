import { Router } from 'express';
import { buildRelayHealthSummary } from '../metrics/health.js';
import type { RelayContext } from './types.js';

export function makeStatusRoute(ctx: RelayContext): Router {
  const router = Router();
  router.get('/status', (_req, res) => {
    const metrics = ctx.getMetrics();
    res.json(buildRelayHealthSummary(metrics, ctx.counters));
  });
  router.get('/healthz', (_req, res) => {
    res.json({ ok: true, port: ctx.port });
  });
  return router;
}
