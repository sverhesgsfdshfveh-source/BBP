import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { parseRelayEvent, validateHello } from './ws-protocol.js';
import type { RelayContext } from '../api/types.js';
import { applyTabEvent, reconcileFromSnapshot } from '../relay/reconcile.js';
import { handleWsClose } from '../relay/lifecycle.js';

export function mountWsServer(server: Server, ctx: RelayContext, graceMs: number): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    const connId = randomUUID();
    let helloDone = false;
    let clientId = '';

    ws.on('message', (raw) => {
      const now = Date.now();
      const msg = parseRelayEvent(raw.toString());
      if (!helloDone) {
        const valid = validateHello(msg);
        if (!valid.ok) {
          ws.close(1008, valid.reason);
          return;
        }
        helloDone = true;
        clientId = msg.clientId;
        ctx.connectionManager.registerConnection(connId, clientId, {
          sendJson: (payload: unknown) => {
            if (ws.readyState !== WebSocket.OPEN) return false;
            ws.send(JSON.stringify(payload));
            return true;
          }
        }, now);
        const wasInGrace = ctx.clientRegistry.get(clientId)?.status === 'offline_grace';
        if (ctx.clientRegistry.detectClientIdConflict(clientId, connId)) {
          ctx.counters.clientIdConflictTotal += 1;
        }
        ctx.clientRegistry.resolveConflict(clientId, connId, now);
        if (wasInGrace) ctx.counters.graceReconnectHitTotal += 1;
        return;
      }

      if (msg.type === 'tab_snapshot') {
        reconcileFromSnapshot(ctx.tabRegistry, clientId, msg.tabs, now);
      } else if (msg.type === 'tab_open' || msg.type === 'tab_update' || msg.type === 'tab_close') {
        applyTabEvent(ctx.tabRegistry, clientId, msg, now);
      } else if (msg.type === 'heartbeat') {
        ctx.clientRegistry.upsertClient(clientId, {}, now);
      } else if (msg.type === 'execute_in_tab_result') {
        ctx.executeInTabBroker.resolveResult({
          type: 'execute_in_tab_result',
          requestId: msg.requestId,
          ok: msg.ok,
          action: msg.action,
          tabId: msg.tabId,
          data: msg.data,
          error: msg.error,
          meta: msg.meta
        });
      }
    });

    ws.on('close', (code) => {
      handleWsClose(ctx.connectionManager, ctx.clientRegistry, ctx.tabRegistry, ctx.counters, connId, code, Date.now(), graceMs);
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    // 兼容旧扩展：ws://host/?type=browser
    const isLegacyRoot = url.startsWith('/?type=browser') || url === '/';
    const isNewPath = url.startsWith('/ws');
    if (!isLegacyRoot && !isNewPath) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  return wss;
}
