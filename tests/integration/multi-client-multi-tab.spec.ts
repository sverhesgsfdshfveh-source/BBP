import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../src/server/relay/client-registry.js';
import { TabRegistry } from '../../src/server/relay/tab-registry.js';

describe('multi client multi tab', () => {
  it('aggregates active tabs as attach count', () => {
    const c = new ClientRegistry();
    const t = new TabRegistry();
    c.markClientOnline('a', '1', 1);
    c.markClientOnline('b', '2', 1);
    t.upsertTab('a', 'a1', { title: 'a1', url: 'u' }, 1);
    t.upsertTab('a', 'a2', { title: 'a2', url: 'u' }, 1);
    t.upsertTab('b', 'b1', { title: 'b1', url: 'u' }, 1);
    expect(t.list().filter((x) => x.status === 'active').length).toBe(3);
  });
});
