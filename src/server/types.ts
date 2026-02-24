export type ClientStatus = 'online' | 'offline_grace' | 'offline_expired';
export type TabStatus = 'active' | 'stale' | 'closed' | 'stale_expired';

export interface ConnectionState {
  connId: string;
  clientId: string;
  connectedAt: number;
  meta?: Record<string, unknown>;
  sendJson?: (payload: unknown) => boolean;
}

export interface ClientState {
  clientId: string;
  status: ClientStatus;
  lastSeen: number;
  graceDeadline?: number;
  connId?: string;
  connectedAt?: number;
  meta?: Record<string, unknown>;
  expiredAt?: number;
}

export interface TabState {
  clientId: string;
  tabId: string;
  status: TabStatus;
  url: string;
  title: string;
  windowId?: number;
  lastSeen: number;
  updatedAt: number;
}

export interface RelayMetrics {
  clientsOnline: number;
  tabsActive: number;
  wsConnections: number;
}

export interface RelaySnapshot {
  version: number;
  savedAt: number;
  clients: ClientState[];
  tabs: TabState[];
}
