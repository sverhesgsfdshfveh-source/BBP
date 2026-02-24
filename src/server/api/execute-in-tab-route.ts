import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { RelayContext } from './types.js';

interface ExecuteInTabBody {
  clientId?: string;
  tabId?: string;
  action?: string;
  mode?: 'runJs' | 'api' | 'auto' | string;
  params?: unknown;
  timeoutMs?: number;
  requestId?: string;
}

export function makeExecuteInTabRoute(ctx: RelayContext): Router {
  const router = Router();

  router.post('/execute-in-tab', async (req, res) => {
    const body = (req.body ?? {}) as ExecuteInTabBody;
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const tabId = typeof body.tabId === 'string' ? body.tabId.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (!clientId || !tabId || !action) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'invalid_params',
          message: 'clientId/tabId/action are required'
        }
      });
    }

    const client = ctx.clientRegistry.get(clientId);
    if (!client || !client.connId) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'client_not_found',
          message: `client not found or offline: ${clientId}`
        }
      });
    }

    const tab = ctx.tabRegistry.listByClient(clientId).find((t) => t.tabId === tabId && t.status === 'active');
    if (!tab) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'tab_not_found',
          message: `tab not found: ${clientId}/${tabId}`
        }
      });
    }

    const conn = ctx.connectionManager.get(client.connId);
    const sendJson = conn?.meta?.sendJson;
    if (typeof sendJson !== 'function') {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'client_not_found',
          message: `client connection unavailable: ${clientId}`
        }
      });
    }

    const requestId = typeof body.requestId === 'string' && body.requestId.trim() ? body.requestId.trim() : randomUUID();
    const timeoutMs = Number.isFinite(body.timeoutMs) && Number(body.timeoutMs) > 0 ? Number(body.timeoutMs) : 8_000;

    try {
      const mode = typeof body.mode === 'string' ? body.mode.trim() : '';
      const sent = sendJson({
        type: 'execute_in_tab',
        requestId,
        tabId,
        action,
        ...(mode ? { mode } : {}),
        params: body.params ?? {},
        timeoutMs
      });
      if (!sent) {
        return res.status(404).json({
          ok: false,
          error: {
            code: 'client_not_found',
            message: `client connection unavailable: ${clientId}`
          }
        });
      }

      const result = await ctx.executeInTabBroker.waitForResult(requestId, timeoutMs);
      return res.json({ ok: result.ok, requestId, result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'timeout') {
        return res.status(504).json({
          ok: false,
          requestId,
          error: {
            code: 'timeout',
            message: `execute_in_tab timed out after ${timeoutMs}ms`
          }
        });
      }

      return res.status(500).json({
        ok: false,
        requestId,
        error: {
          code: 'internal_error',
          message: 'internal error'
        }
      });
    }
  });

  return router;
}
