import WebSocket from 'ws';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8787';
const wsUrl = process.env.WS_URL || 'ws://127.0.0.1:8787/?type=browser';
const clientId = `smoke-${Date.now()}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

function send(ws, payload) {
  ws.send(JSON.stringify({ ...payload, clientId, ts: Date.now() }));
}

const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});

send(ws, { type: 'hello', version: 'smoke' });
send(ws, {
  type: 'tab_snapshot',
  tabs: [
    { tabId: 't-1', windowId: 1, url: 'https://example.com', title: 'Example' }
  ]
});
await sleep(200);

let status = await getJson('/api/status');
if (status.metrics.clientsOnline < 1 || status.metrics.tabsActive < 1) {
  throw new Error(`unexpected initial metrics: ${JSON.stringify(status.metrics)}`);
}

send(ws, { type: 'tab_update', tabId: 't-1', windowId: 1, url: 'https://example.org', title: 'Example Org' });
send(ws, { type: 'tab_open', tabId: 't-2', windowId: 1, url: 'https://openai.com', title: 'OpenAI' });
await sleep(200);

let tabsResp = await getJson(`/api/tabs?clientId=${encodeURIComponent(clientId)}`);
if (!tabsResp.tabs.find((t) => t.tabId === 't-2')) {
  throw new Error('tab_open not reflected in /api/tabs');
}

send(ws, { type: 'tab_close', tabId: 't-2', windowId: 1 });
send(ws, { type: 'heartbeat' });
await sleep(200);

tabsResp = await getJson(`/api/tabs?clientId=${encodeURIComponent(clientId)}`);
if (tabsResp.tabs.find((t) => t.tabId === 't-2' && t.status === 'active')) {
  throw new Error('tab_close not reflected in /api/tabs');
}

status = await getJson('/api/status');
const clientsResp = await getJson('/api/clients');
const onlineClient = clientsResp.clients.find((c) => c.clientId === clientId && c.status === 'online');
if (!onlineClient) {
  throw new Error(`client ${clientId} not online`);
}

console.log('smoke ok', {
  clientId,
  metrics: status.metrics,
  activeTabsForClient: tabsResp.tabs.filter((t) => t.status === 'active').length
});

ws.close(1000, 'done');
