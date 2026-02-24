import type { RelayMetrics } from '../types.js';

export function renderMetricsCards(metrics: RelayMetrics): string {
  return `clients_online=${metrics.clientsOnline}\ntabs_active=${metrics.tabsActive}\nws_connections=${metrics.wsConnections}`;
}
