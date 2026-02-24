import { describe, expect, it } from 'vitest';
import { renderMetricsCards } from '../../src/console/src/components/MetricsCards.js';

describe('dashboard metrics', () => {
  it('renders 3 metrics', () => {
    const s = renderMetricsCards({ clientsOnline: 2, tabsActive: 5, wsConnections: 3 });
    expect(s).toContain('clients_online=2');
    expect(s).toContain('tabs_active=5');
    expect(s).toContain('ws_connections=3');
  });
});
