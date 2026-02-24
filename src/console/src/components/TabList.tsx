import type { RelayTabView } from '../types.js';

export function renderTabList(tabs: RelayTabView[]): string {
  return tabs.map((t) => `- [${t.status}] ${t.tabId} ${t.title} (${t.url}) lastSeen=${new Date(t.lastSeen).toISOString()}`).join('\n');
}
