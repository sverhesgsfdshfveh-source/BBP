import { Router } from 'express';
import type { RelayContext } from './types.js';

export function makeClientsRoute(ctx: RelayContext): Router {
  const router = Router();
  router.get('/clients', (_req, res) => {
    res.json({ clients: ctx.clientRegistry.list() });
  });
  return router;
}
