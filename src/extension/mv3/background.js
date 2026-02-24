const DEFAULT_ENDPOINT = '';
const STORAGE_KEYS = {
  endpoint: 'relayEndpoint',
  clientId: 'clientId',
  enabled: 'bridgeEnabled'
};
const HEARTBEAT_MS = 15000;
const SNAPSHOT_DEBOUNCE_MS = 300;
const MAX_BACKOFF_MS = 30000;

let ws = null;
let clientId = null;
let endpoint = DEFAULT_ENDPOINT;
let enabled = true;
let reconnectAttempts = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let snapshotTimer = null;

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTab(tab) {
  return {
    tabId: String(tab.id ?? ''),
    windowId: tab.windowId,
    url: tab.url ?? '',
    title: tab.title ?? ''
  };
}

function send(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !clientId) return;
  ws.send(JSON.stringify({ ...payload, clientId, ts: Date.now() }));
}

async function sendSnapshot() {
  try {
    const tabs = await chrome.tabs.query({});
    send({
      type: 'tab_snapshot',
      tabs: tabs.filter((t) => t.id != null).map(normalizeTab)
    });
  } catch (err) {
    console.warn('[bridge-plus] sendSnapshot failed', err);
  }
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    void sendSnapshot();
  }, SNAPSHOT_DEBOUNCE_MS);
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    send({ type: 'heartbeat' });
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function calcBackoffMs(attempt) {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * (2 ** attempt));
  const jitter = Math.floor(Math.random() * 300);
  return base + jitter;
}

function closeSocket() {
  if (!ws) return;
  try {
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    ws.close(1000, 'disabled');
  } catch {}
  ws = null;
}

function scheduleReconnect() {
  if (!enabled) return;
  clearReconnectTimer();
  const delay = calcBackoffMs(reconnectAttempts);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (!enabled || !isValidEndpoint(endpoint) || ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  try {
    ws = new WebSocket(endpoint);
  } catch (err) {
    console.warn('[bridge-plus] WebSocket construct failed', err);
    scheduleReconnect();
    return;
  }

  ws.onopen = async () => {
    reconnectAttempts = 0;
    send({ type: 'hello', version: chrome.runtime.getManifest().version });
    await sendSnapshot();
    startHeartbeat();
  };

  ws.onclose = () => {
    stopHeartbeat();
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose handles reconnect
  };
}

async function loadConfig() {
  const saved = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  endpoint = typeof saved[STORAGE_KEYS.endpoint] === 'string' ? saved[STORAGE_KEYS.endpoint].trim() : DEFAULT_ENDPOINT;
  enabled = saved[STORAGE_KEYS.enabled] === true;

  if (typeof saved[STORAGE_KEYS.clientId] === 'string' && saved[STORAGE_KEYS.clientId]) {
    clientId = saved[STORAGE_KEYS.clientId];
  } else {
    clientId = randomId();
    await chrome.storage.local.set({ [STORAGE_KEYS.clientId]: clientId });
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.endpoint]: endpoint,
    [STORAGE_KEYS.enabled]: enabled,
    [STORAGE_KEYS.clientId]: clientId
  });
}

function isValidEndpoint(v) {
  return typeof v === 'string' && /^wss?:\/\//i.test(v);
}

async function applySwitch(nextEnabled) {
  enabled = !!nextEnabled;
  await chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled });
  clearReconnectTimer();
  if (!enabled) {
    stopHeartbeat();
    closeSocket();
    return;
  }
  connect();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STORAGE_KEYS.endpoint]) {
    endpoint = (changes[STORAGE_KEYS.endpoint].newValue || '').trim();
    closeSocket();
    clearReconnectTimer();
    connect();
  }

  if (changes[STORAGE_KEYS.enabled]) {
    void applySwitch(changes[STORAGE_KEYS.enabled].newValue);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id == null) return;
  send({ type: 'tab_open', ...normalizeTab(tab) });
  scheduleSnapshot();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId == null) return;
  if (!changeInfo.url && !changeInfo.title && !changeInfo.status) return;
  send({ type: 'tab_update', ...normalizeTab(tab), tabId: String(tabId) });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  send({ type: 'tab_close', tabId: String(tabId), windowId: removeInfo?.windowId });
  scheduleSnapshot();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'bridge:status') {
    sendResponse({ clientId, endpoint, enabled, connected: ws?.readyState === WebSocket.OPEN });
    return true;
  }
  if (message.type === 'bridge:reconnect') {
    closeSocket();
    clearReconnectTimer();
    connect();
    sendResponse({ ok: true });
    return true;
  }
});

(async () => {
  await loadConfig();
  // 默认不自动连，必须用户在 options 显式配置 endpoint 并启用
  if (enabled && isValidEndpoint(endpoint)) connect();
})();
