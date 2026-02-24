import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../src/server/relay/client-registry.js';

describe('client-registry', () => {
  it('online -> grace -> expired', () => {
    const r = new ClientRegistry();
    const now = 1000;
    r.markClientOnline('c1', 'conn1', now);
    expect(r.get('c1')?.status).toBe('online');
    r.markClientOfflineGrace('c1', now + 1, 90_000);
    expect(r.get('c1')?.status).toBe('offline_grace');
    r.expireClientIfDeadlinePassed('c1', now + 90_002);
    expect(r.get('c1')?.status).toBe('offline_expired');
  });
});
