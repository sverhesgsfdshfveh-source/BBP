import { describe, expect, it } from 'vitest';
import { TabRegistry } from '../../src/server/relay/tab-registry.js';
import { reconcileFromSnapshot } from '../../src/server/relay/reconcile.js';

describe('reconcile', () => {
  it('upserts from snapshot and closes missing tabs', () => {
    const t = new TabRegistry();
    t.upsertTab('c1', 'old', { url: 'x', title: 'x', status: 'active' }, 1);
    reconcileFromSnapshot(t, 'c1', [{ tabId: 'new', url: 'n', title: 'n' }], 2);
    expect(t.listByClient('c1').find((x) => x.tabId === 'new')?.status).toBe('active');
    expect(t.listByClient('c1').find((x) => x.tabId === 'old')?.status).toBe('closed');
  });
});
