export type RelayEventType = 'tab_open' | 'tab_update' | 'tab_close' | 'heartbeat' | 'tab_snapshot' | 'hello' | 'execute_in_tab_result';

export interface HelloMessage { type: 'hello'; clientId: string; version: string; ts: number; }
export interface HeartbeatMessage { type: 'heartbeat'; clientId: string; ts: number; }

export interface TabEventMessage {
  type: 'tab_open' | 'tab_update' | 'tab_close';
  clientId: string;
  tabId: string;
  windowId?: number;
  url?: string;
  title?: string;
  ts: number;
}

export interface TabSnapshotMessage {
  type: 'tab_snapshot';
  clientId: string;
  tabs: Array<{ tabId: string; windowId?: number; url: string; title: string }>;
  ts: number;
}

export interface ExecuteInTabResultMessage {
  type: 'execute_in_tab_result';
  clientId: string;
  requestId: string;
  ok: boolean;
  action?: string;
  tabId?: string;
  data?: unknown;
  error?: { code?: string; message?: string; reason?: string };
  meta?: Record<string, unknown>;
  ts: number;
}

export type RelayIncomingMessage = HelloMessage | HeartbeatMessage | TabEventMessage | TabSnapshotMessage | ExecuteInTabResultMessage;
