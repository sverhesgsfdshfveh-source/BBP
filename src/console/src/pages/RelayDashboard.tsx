import { useRelayState } from '../hooks/useRelayState.js';
import { renderMetricsCards } from '../components/MetricsCards.js';
import { renderClientGroupPanel } from '../components/ClientGroupPanel.js';

export async function renderRelayDashboard(baseUrl?: string): Promise<string> {
  const state = await useRelayState(baseUrl);
  const parts = [renderMetricsCards(state.metrics)];
  for (const g of state.groups) {
    parts.push(renderClientGroupPanel(g.client, g.tabs));
  }
  return parts.join('\n\n');
}
