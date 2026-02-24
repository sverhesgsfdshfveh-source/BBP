import type { RelayMetrics } from '../types.js';
import { Counters } from './counters.js';

export function buildRelayHealthSummary(metrics: RelayMetrics, counters: Counters) {
  return {
    metrics,
    wsCloseByCode: counters.wsCloseTotal,
    graceReconnectHitTotal: counters.graceReconnectHitTotal,
    graceExpireTotal: counters.graceExpireTotal,
    clientIdConflictTotal: counters.clientIdConflictTotal
  };
}
