import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeExecuteInTabRoute } from '../../src/server/api/execute-in-tab-route.js';
import { ClientRegistry } from '../../src/server/relay/client-registry.js';
import { TabRegistry } from '../../src/server/relay/tab-registry.js';
import { ConnectionManager } from '../../src/server/relay/connection-manager.js';
import { Counters } from '../../src/server/metrics/counters.js';
import { ExecuteInTabBroker } from '../../src/server/relay/execute-in-tab-broker.js';

function createApp() {
  const clientRegistry = new ClientRegistry();
  const tabRegistry = new TabRegistry();
  const connectionManager = new ConnectionManager();
  const counters = new Counters();
  const executeInTabBroker = new ExecuteInTabBroker();

  const app = express();
  app.use(express.json());
  app.use('/api', makeExecuteInTabRoute({
    port: 8787,
    clientRegistry,
    tabRegistry,
    connectionManager,
    counters,
    executeInTabBroker,
    getMetrics: () => ({ clientsOnline: 0, tabsActive: 0, wsConnections: 0 })
  }));

  return { app, clientRegistry, tabRegistry, connectionManager, executeInTabBroker };
}

describe('execute-in-tab route', () => {
  it('returns execute_in_tab_result on success', async () => {
    const { app, clientRegistry, tabRegistry, connectionManager, executeInTabBroker } = createApp();

    clientRegistry.markClientOnline('c1', 'conn-1', Date.now());
    tabRegistry.upsertTab('c1', '101', { status: 'active', title: 't', url: 'https://example.com' }, Date.now());

    connectionManager.registerConnection('conn-1', 'c1', {
      sendJson(payload: unknown) {
        const p = payload as { requestId: string; type: string };
        if (p.type === 'execute_in_tab') {
          setTimeout(() => {
            executeInTabBroker.resolveResult({
              type: 'execute_in_tab_result',
              requestId: p.requestId,
              ok: true,
              data: { value: 'ok' }
            });
          }, 0);
        }
        return true;
      }
    }, Date.now());

    const res = await request(app)
      .post('/api/execute-in-tab')
      .send({ clientId: 'c1', tabId: '101', action: 'extractText', params: {} })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.result.type).toBe('execute_in_tab_result');
    expect(res.body.result.ok).toBe(true);
    expect(res.body.result.data).toEqual({ value: 'ok' });
  });

  it('returns client_not_found when client missing', async () => {
    const { app } = createApp();

    const res = await request(app)
      .post('/api/execute-in-tab')
      .send({ clientId: 'nope', tabId: '1', action: 'extractText' })
      .expect(404);

    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('client_not_found');
  });

  it('returns timeout when extension does not answer in time', async () => {
    const { app, clientRegistry, tabRegistry, connectionManager } = createApp();

    clientRegistry.markClientOnline('c1', 'conn-1', Date.now());
    tabRegistry.upsertTab('c1', '101', { status: 'active', title: 't', url: 'https://example.com' }, Date.now());
    connectionManager.registerConnection('conn-1', 'c1', {
      sendJson() {
        return true;
      }
    }, Date.now());

    const res = await request(app)
      .post('/api/execute-in-tab')
      .send({ clientId: 'c1', tabId: '101', action: 'extractText', timeoutMs: 20 })
      .expect(504);

    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('timeout');
  });
});
