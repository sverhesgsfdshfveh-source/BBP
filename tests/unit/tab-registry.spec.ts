import { describe, expect, it } from 'vitest';
import { TabRegistry } from '../../src/server/relay/tab-registry.js';

describe('tab-registry', () => {
  it('marks stale and keeps active counts consistent', () => {
    const t = new TabRegistry();
    t.upsertTab('c1', 't1', { title: 'A', url: 'u' }, 1);
    t.upsertTab('c1', 't2', { title: 'B', url: 'u2' }, 1);
    expect(t.list().filter((x) => x.status === 'active').length).toBe(2);
    t.markTabsStaleByClient('c1', 2);
    expect(t.list().filter((x) => x.status === 'stale').length).toBe(2);
  });
});
