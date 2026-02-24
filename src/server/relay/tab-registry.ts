import type { TabState, TabStatus } from '../types.js';

export class TabRegistry {
  private readonly tabs = new Map<string, TabState>();
  key(clientId: string, tabId: string): string { return `${clientId}:${tabId}`; }

  upsertTab(clientId: string, tabId: string, tabMeta: Partial<TabState>, now: number): TabState {
    const k = this.key(clientId, tabId);
    const prev = this.tabs.get(k);
    const next: TabState = {
      ...(prev ?? { clientId, tabId, status: 'active', url: '', title: '', lastSeen: now, updatedAt: now }),
      ...tabMeta,
      clientId,
      tabId,
      status: (tabMeta.status ?? prev?.status ?? 'active') as TabStatus,
      lastSeen: now,
      updatedAt: now
    };
    this.tabs.set(k, next);
    return next;
  }

  markTabsStaleByClient(clientId: string, now: number): void {
    for (const tab of this.tabs.values()) if (tab.clientId === clientId && tab.status === 'active') { tab.status = 'stale'; tab.lastSeen = now; }
  }

  removeActiveTabsByClient(clientId: string, now: number): void {
    for (const tab of this.tabs.values()) if (tab.clientId === clientId && (tab.status === 'active' || tab.status === 'stale')) { tab.status = 'stale_expired'; tab.updatedAt = now; }
  }

  closeTab(clientId: string, tabId: string, now: number): void {
    const tab = this.tabs.get(this.key(clientId, tabId));
    if (tab) { tab.status = 'closed'; tab.updatedAt = now; tab.lastSeen = now; }
  }

  gcExpiredTabs(now: number, ttlMs: number): number {
    let deleted = 0;
    for (const [k, t] of this.tabs) {
      if ((t.status === 'closed' || t.status === 'stale_expired') && now - t.updatedAt > ttlMs) {
        this.tabs.delete(k); deleted += 1;
      }
    }
    return deleted;
  }

  listByClient(clientId: string): TabState[] { return [...this.tabs.values()].filter(t => t.clientId === clientId); }
  list(): TabState[] { return [...this.tabs.values()]; }
  exportTabSnapshot(): TabState[] { return this.list(); }
  importTabSnapshot(tabs: TabState[]): void { for (const t of tabs) this.tabs.set(this.key(t.clientId, t.tabId), { ...t, status: t.status === 'active' ? 'stale' : t.status }); }
}
