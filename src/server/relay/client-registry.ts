import type { ClientState } from '../types.js';

export class ClientRegistry {
  private readonly clients = new Map<string, ClientState>();

  upsertClient(clientId: string, patch: Partial<ClientState>, now: number): ClientState {
    const prev = this.clients.get(clientId);
    const next: ClientState = {
      ...(prev ?? { clientId, status: 'online', lastSeen: now }),
      ...patch,
      clientId,
      lastSeen: now
    };
    this.clients.set(clientId, next);
    return next;
  }

  markClientOfflineGrace(clientId: string, now: number, graceMs: number): ClientState | undefined {
    const c = this.clients.get(clientId);
    if (!c) return undefined;
    c.status = 'offline_grace';
    c.graceDeadline = now + graceMs;
    c.lastSeen = now;
    c.connId = undefined;
    return c;
  }

  markClientOnline(clientId: string, connId: string, now: number): ClientState {
    return this.upsertClient(clientId, { status: 'online', connId, connectedAt: now, graceDeadline: undefined, expiredAt: undefined }, now);
  }

  expireClientIfDeadlinePassed(clientId: string, now: number): ClientState | undefined {
    const c = this.clients.get(clientId);
    if (!c) return undefined;
    if (c.status === 'offline_grace' && c.graceDeadline && now >= c.graceDeadline) {
      c.status = 'offline_expired';
      c.expiredAt = now;
    }
    return c;
  }

  gcExpiredClients(now: number, ttlMs: number): number {
    let deleted = 0;
    for (const [id, c] of this.clients) {
      if (c.status === 'offline_expired' && c.expiredAt && now - c.expiredAt > ttlMs) {
        this.clients.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  detectClientIdConflict(clientId: string, connId: string): boolean {
    const c = this.clients.get(clientId);
    return !!c?.connId && c.connId !== connId;
  }

  resolveConflict(clientId: string, connId: string, now: number): ClientState {
    return this.markClientOnline(clientId, connId, now);
  }

  get(clientId: string): ClientState | undefined { return this.clients.get(clientId); }
  list(): ClientState[] { return [...this.clients.values()]; }
  exportClientSnapshot(): ClientState[] { return this.list(); }

  importClientSnapshot(clients: ClientState[]): void {
    for (const c of clients) {
      this.clients.set(c.clientId, { ...c, status: c.status === 'online' ? 'offline_expired' : c.status, connId: undefined });
    }
  }
}
