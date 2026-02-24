import type { TabSnapshotMessage } from '../shared/protocol.js';

export async function collectActiveTabs(): Promise<TabSnapshotMessage['tabs']> {
  return [];
}

export async function sendTabSnapshot(send: (msg: unknown) => void, clientId: string): Promise<void> {
  const tabs = await collectActiveTabs();
  const message: TabSnapshotMessage = { type: 'tab_snapshot', clientId, tabs, ts: Date.now() };
  send(message);
}
