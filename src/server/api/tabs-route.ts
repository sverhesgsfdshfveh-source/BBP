import { Router } from 'express';
import type { RelayContext } from './types.js';

export function makeTabsRoute(ctx: RelayContext): Router {
  const router = Router();
  router.get('/tabs', (req, res) => {
    const clientId = req.query.clientId as string | undefined;
    const tabs = clientId ? ctx.tabRegistry.listByClient(clientId) : ctx.tabRegistry.list();
    res.json({ tabs });
  });
  return router;
}
