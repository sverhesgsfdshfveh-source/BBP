import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../src/server/relay/client-registry.js';

describe('client id conflict', () => {
  it('detects and resolves by last-write-wins', () => {
    const c = new ClientRegistry();
    c.markClientOnline('same', 'conn-old', 1);
    expect(c.detectClientIdConflict('same', 'conn-new')).toBe(true);
    c.resolveConflict('same', 'conn-new', 2);
    expect(c.get('same')?.connId).toBe('conn-new');
  });
});
