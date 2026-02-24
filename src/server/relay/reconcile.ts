import { TabRegistry } from './tab-registry.js';
import type { TabEventMessage, TabSnapshotMessage } from '../../extension/shared/protocol.js';

export function reconcileFromSnapshot(tabRegistry: TabRegistry, clientId: string, snapshotTabs: TabSnapshotMessage['tabs'], now: number): void {
  const alive = new Set(snapshotTabs.map((t) => t.tabId));
  for (const tab of snapshotTabs) {
    tabRegistry.upsertTab(clientId, tab.tabId, { url: tab.url, title: tab.title, windowId: tab.windowId, status: 'active' }, now);
  }
  for (const existing of tabRegistry.listByClient(clientId)) {
    if (!alive.has(existing.tabId) && (existing.status === 'active' || existing.status === 'stale')) {
      tabRegistry.closeTab(clientId, existing.tabId, now);
    }
  }
}

export function applyTabEvent(tabRegistry: TabRegistry, clientId: string, event: TabEventMessage, now: number): void {
  if (event.type === 'tab_close') {
    tabRegistry.closeTab(clientId, event.tabId, now);
    return;
  }
  tabRegistry.upsertTab(clientId, event.tabId, {
    url: event.url ?? '',
    title: event.title ?? '',
    windowId: event.windowId,
    status: 'active'
  }, now);
}
