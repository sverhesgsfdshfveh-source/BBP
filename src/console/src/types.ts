export interface RelayMetrics {
  clientsOnline: number;
  tabsActive: number;
  wsConnections: number;
}

export interface RelayClientView {
  clientId: string;
  status: 'online' | 'offline_grace' | 'offline_expired';
  lastSeen: number;
}

export interface RelayTabView {
  clientId: string;
  tabId: string;
  status: 'active' | 'stale' | 'closed' | 'stale_expired';
  title: string;
  url: string;
  lastSeen: number;
}
