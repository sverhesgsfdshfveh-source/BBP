import express from 'express';
import http from 'node:http';
import { config } from './config.js';
import { ConnectionManager } from './relay/connection-manager.js';
import { ClientRegistry } from './relay/client-registry.js';
import { TabRegistry } from './relay/tab-registry.js';
import { Counters } from './metrics/counters.js';
import { ExecuteInTabBroker } from './relay/execute-in-tab-broker.js';
import { makeStatusRoute } from './api/status-route.js';
import { makeClientsRoute } from './api/clients-route.js';
import { makeTabsRoute } from './api/tabs-route.js';
import { makeExecuteInTabRoute } from './api/execute-in-tab-route.js';
import { mountWsServer } from './transport/ws-server.js';
import { onGraceTimeoutTick } from './relay/lifecycle.js';
import { SnapshotStore } from './persistence/snapshot-store.js';
import type { RelaySnapshot } from './types.js';

const app = express();
const server = http.createServer(app);

const connectionManager = new ConnectionManager();
const clientRegistry = new ClientRegistry();
const tabRegistry = new TabRegistry();
const counters = new Counters();
const executeInTabBroker = new ExecuteInTabBroker();
const snapshotStore = new SnapshotStore(config.relay.snapshotPath, config.relay.snapshotFlushMs);

const getMetrics = () => ({
  clientsOnline: clientRegistry.list().filter((c) => c.status === 'online').length,
  tabsActive: tabRegistry.list().filter((t) => t.status === 'active').length,
  wsConnections: connectionManager.size()
});

const ctx = { port: config.port, connectionManager, clientRegistry, tabRegistry, counters, executeInTabBroker, getMetrics };

const loaded = await snapshotStore.loadSnapshot();
if (loaded) {
  clientRegistry.importClientSnapshot(loaded.clients);
  tabRegistry.importTabSnapshot(loaded.tabs);
}

app.use(express.json());
app.get('/', (_req, res) => res.redirect('/client.html'));
app.use(express.static('public'));

// 兼容旧扩展调用，避免 preflight 被 302/404 导致 CORS 报错
app.options('/api/ws-disconnect', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
});
app.post('/api/ws-disconnect', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true });
});

app.use('/api', makeStatusRoute(ctx));
app.use('/api', makeClientsRoute(ctx));
app.use('/api', makeTabsRoute(ctx));
app.use('/api', makeExecuteInTabRoute(ctx));

mountWsServer(server, ctx, config.relay.graceMs);

setInterval(() => {
  const now = Date.now();
  onGraceTimeoutTick(clientRegistry, tabRegistry, counters, now);
  clientRegistry.gcExpiredClients(now, config.relay.expiredClientTtlMs);
  tabRegistry.gcExpiredTabs(now, config.relay.expiredTabTtlMs);
  snapshotStore.scheduleDebouncedSave((): RelaySnapshot => ({ version: 1, savedAt: now, clients: clientRegistry.exportClientSnapshot(), tabs: tabRegistry.exportTabSnapshot() }));
}, 1000);

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[relay] listening on ${config.port}`);
});
