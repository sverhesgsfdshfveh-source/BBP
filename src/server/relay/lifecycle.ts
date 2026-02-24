import { ClientRegistry } from './client-registry.js';
import { ConnectionManager } from './connection-manager.js';
import { TabRegistry } from './tab-registry.js';
import { Counters } from '../metrics/counters.js';

export function handleWsClose(connectionManager: ConnectionManager, clientRegistry: ClientRegistry, tabRegistry: TabRegistry, counters: Counters, connId: string, code: number, now: number, graceMs: number): void {
  counters.markWsClose(code);
  const conn = connectionManager.unregisterConnection(connId);
  if (!conn) return;
  clientRegistry.markClientOfflineGrace(conn.clientId, now, graceMs);
  tabRegistry.markTabsStaleByClient(conn.clientId, now);
}

export function onGraceTimeoutTick(clientRegistry: ClientRegistry, tabRegistry: TabRegistry, counters: Counters, now: number): void {
  for (const client of clientRegistry.list()) {
    const before = client.status;
    clientRegistry.expireClientIfDeadlinePassed(client.clientId, now);
    const after = clientRegistry.get(client.clientId)?.status;
    if (before !== 'offline_expired' && after === 'offline_expired') {
      counters.graceExpireTotal += 1;
      tabRegistry.removeActiveTabsByClient(client.clientId, now);
    }
  }
}
