import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../src/server/relay/client-registry.js';
import { TabRegistry } from '../../src/server/relay/tab-registry.js';

describe('restart recovery', () => {
  it('imports snapshot as offline/stale and can reactivate', () => {
    const c = new ClientRegistry();
    const t = new TabRegistry();
    c.importClientSnapshot([{ clientId: 'c1', status: 'online', lastSeen: 1 }]);
    t.importTabSnapshot([{ clientId: 'c1', tabId: 't1', status: 'active', url: 'u', title: 't', lastSeen: 1, updatedAt: 1 }]);
    expect(c.get('c1')?.status).toBe('offline_expired');
    expect(t.listByClient('c1')[0].status).toBe('stale');
    c.markClientOnline('c1', 'conn2', 2);
    t.upsertTab('c1', 't1', { status: 'active' }, 2);
    expect(c.get('c1')?.status).toBe('online');
    expect(t.listByClient('c1')[0].status).toBe('active');
  });
});
