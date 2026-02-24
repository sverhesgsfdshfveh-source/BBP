import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../src/server/relay/client-registry.js';
import { TabRegistry } from '../../src/server/relay/tab-registry.js';
import { ConnectionManager } from '../../src/server/relay/connection-manager.js';
import { Counters } from '../../src/server/metrics/counters.js';
import { handleWsClose, onGraceTimeoutTick } from '../../src/server/relay/lifecycle.js';

describe('reconnect-1001', () => {
  it('grace reconnection flow works within 90s', () => {
    const c = new ClientRegistry();
    const t = new TabRegistry();
    const m = new ConnectionManager();
    const counters = new Counters();
    const now = 0;
    m.registerConnection('conn1', 'client1', {}, now);
    c.markClientOnline('client1', 'conn1', now);
    t.upsertTab('client1', 'tab1', { title: 'T', url: 'u' }, now);

    handleWsClose(m, c, t, counters, 'conn1', 1001, 1, 90_000);
    expect(c.get('client1')?.status).toBe('offline_grace');
    c.markClientOnline('client1', 'conn2', 30_000);
    counters.graceReconnectHitTotal += 1;
    onGraceTimeoutTick(c, t, counters, 90_001);
    expect(c.get('client1')?.status).toBe('online');
  });
});
