import { ClientRegistry } from '../relay/client-registry.js';
import { TabRegistry } from '../relay/tab-registry.js';
import { ConnectionManager } from '../relay/connection-manager.js';
import { Counters } from '../metrics/counters.js';
import { ExecuteInTabBroker } from '../relay/execute-in-tab-broker.js';
import type { RelayMetrics } from '../types.js';

export interface RelayContext {
  port: number;
  clientRegistry: ClientRegistry;
  tabRegistry: TabRegistry;
  connectionManager: ConnectionManager;
  counters: Counters;
  executeInTabBroker: ExecuteInTabBroker;
  getMetrics: () => RelayMetrics;
}
