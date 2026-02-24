import type { RelayClientView, RelayMetrics, RelayTabView } from '../types.js';

export async function useRelayState(baseUrl = 'http://localhost:8787/api'): Promise<{ metrics: RelayMetrics; groups: Array<{ client: RelayClientView; tabs: RelayTabView[] }> }> {
  const [statusRes, clientsRes, tabsRes] = await Promise.all([
    fetch(`${baseUrl}/status`).then((r) => r.json()),
    fetch(`${baseUrl}/clients`).then((r) => r.json()),
    fetch(`${baseUrl}/tabs`).then((r) => r.json())
  ]);

  const metrics = statusRes.metrics as RelayMetrics;
  const clients = clientsRes.clients as RelayClientView[];
  const tabs = tabsRes.tabs as RelayTabView[];

  return {
    metrics,
    groups: clients.map((client) => ({
      client,
      tabs: tabs.filter((t) => t.clientId === client.clientId)
    }))
  };
}
