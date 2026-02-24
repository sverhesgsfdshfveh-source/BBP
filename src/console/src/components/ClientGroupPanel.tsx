import type { RelayClientView, RelayTabView } from '../types.js';
import { renderTabList } from './TabList.js';

export function renderClientGroupPanel(client: RelayClientView, tabs: RelayTabView[]): string {
  return `client=${client.clientId} status=${client.status} lastSeen=${new Date(client.lastSeen).toISOString()}\n${renderTabList(tabs)}`;
}
