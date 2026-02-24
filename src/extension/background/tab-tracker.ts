export interface TrackedTab { tabId: string; title: string; url: string; windowId?: number }

export class TabTracker {
  private readonly tabs = new Map<string, TrackedTab>();
  upsert(tab: TrackedTab): void { this.tabs.set(tab.tabId, tab); }
  remove(tabId: string): void { this.tabs.delete(tabId); }
  snapshot(): TrackedTab[] { return [...this.tabs.values()]; }
}
