import { executeReadActionInTab, validateReadActionParams } from './v0/read_executor.js';
import { executeRunJsInTab, RUNJS_FALLBACK_ERROR_CODES, validateRunJsParams } from './v1/runjs_executor.js';
import { executeApiAction, validateApiActionParams } from './v2/api_executor.js';

const DEFAULT_ENDPOINT = '';
const STORAGE_KEYS = {
  endpoint: 'relayEndpoint',
  clientId: 'clientId',
  armed: 'bridgeArmed',
  executionEnabled: 'executionEnabled',
  executionAllowlist: 'executionAllowlist',
  executionCapabilities: 'executionCapabilities'
};
const DEFAULT_EXECUTION_CAPABILITIES = {
  read: true,
  runJs: false
};
const HEARTBEAT_MS = 15000;
const SNAPSHOT_DEBOUNCE_MS = 300;
const MAX_BACKOFF_MS = 30000;

const ERROR_CODES = {
  executionDisabled: 'execution_disabled',
  clientNotFound: 'client_not_found',
  tabNotFound: 'tab_not_found',
  domainNotAllowed: 'domain_not_allowed',
  capabilityDenied: 'capability_denied',
  invalidParams: 'invalid_params',
  timeout: 'timeout',
  protectedPage: 'protected_page',
  scriptRuntimeError: 'script_runtime_error',
  unsupportedAction: 'unsupported_action',
  unsupportedFallbackAction: 'unsupported_fallback_action',
  internalError: 'internal_error',
  superModeDisabled: 'super_mode_disabled'
};

const ACTION_CAPABILITY_MAP = {
  extractText: 'read',
  extractLinks: 'read',
  querySelectorText: 'read',
  runJs: 'runJs',
  openTab: 'read',
  focusTab: 'read',
  closeTab: 'read',
  click: 'read',
  type: 'read',
  clickSelector: 'read',
  typeSelector: 'read',
  waitForSelector: 'read',
  waitForText: 'read',
  querySelectorAttr: 'read',
  screenshotTab: 'read'
};

const V0_READ_ACTIONS = new Set(['extractText', 'extractLinks', 'querySelectorText']);
const V2_API_ACTIONS = new Set([
  'openTab',
  'focusTab',
  'closeTab',
  'click',
  'type',
  'clickSelector',
  'typeSelector',
  'waitForSelector',
  'waitForText',
  'querySelectorAttr',
  'screenshotTab'
]);
const FALLBACK_ACTIONS = new Set([...V0_READ_ACTIONS, ...V2_API_ACTIONS]);
const EXECUTION_MODES = new Set(['runJs', 'api', 'auto']);

let ws = null;
let clientId = null;
let endpoint = DEFAULT_ENDPOINT;
let armed = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let snapshotTimer = null;

let executionEnabled = true;
let executionAllowlist = [];
let executionCapabilities = { ...DEFAULT_EXECUTION_CAPABILITIES };

let storePromise = null;

function createWebLocalStorageAdapter() {
  return {
    __type: 'web-localStorage',
    async get(defaults = {}) {
      const out = { ...defaults };
      try {
        const raw = localStorage.getItem('browserBridgePlusOptions');
        if (raw) return { ...out, ...JSON.parse(raw) };
      } catch {}
      return out;
    },
    async set(values = {}) {
      try {
        const raw = localStorage.getItem('browserBridgePlusOptions');
        const curr = raw ? JSON.parse(raw) : {};
        localStorage.setItem('browserBridgePlusOptions', JSON.stringify({ ...curr, ...values }));
      } catch {}
    }
  };
}

async function getStore() {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    try {
      await chrome.storage.sync.get({ __probe: true });
      return chrome.storage.sync;
    } catch {}
    try {
      await chrome.storage.local.get({ __probe: true });
      return chrome.storage.local;
    } catch {}
    return createWebLocalStorageAdapter();
  })();
  return storePromise;
}

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
    send({ type: 'tab_snapshot', tabs: tabs.filter((t) => t.id != null).map(normalizeTab) });
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
  heartbeatTimer = setInterval(() => send({ type: 'heartbeat' }), HEARTBEAT_MS);
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
  return base + Math.floor(Math.random() * 300);
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
  if (!armed) return;
  clearReconnectTimer();
  const delay = calcBackoffMs(reconnectAttempts);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (armed) connect();
  }, delay);
}

function isValidEndpoint(v) {
  return typeof v === 'string' && /^wss?:\/\//i.test(v);
}

function normalizeAllowlist(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
}

function matchHostRule(hostname, rule) {
  if (!rule) return false;
  if (rule === '*' || rule === 'all') return true;
  if (rule.startsWith('*.')) {
    const base = rule.slice(2);
    return hostname === base || hostname.endsWith(`.${base}`);
  }
  return hostname === rule;
}

function isDomainAllowed(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = (url.hostname || '').toLowerCase();
    if (!hostname) return false;
    if (executionAllowlist.length === 0) return false;
    return executionAllowlist.some((rule) => matchHostRule(hostname, rule));
  } catch {
    return false;
  }
}

function isProtectedTabUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return true;
  const lower = urlString.toLowerCase();
  return (
    lower.startsWith('chrome://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('about:') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('devtools://') ||
    lower.startsWith('view-source:') ||
    lower.startsWith('moz-extension://')
  );
}

function structuredError(code, message, reason) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(reason ? { reason } : {})
    }
  };
}

function parsePositiveNumber(v) {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseExecutePayload(raw) {
  const action = raw?.action;
  const tabIdRaw = raw?.tabId;
  const params = raw?.params && typeof raw.params === 'object' ? raw.params : {};
  const timeoutRaw = raw?.timeoutMs;
  const modeRaw = raw?.mode;

  if (!action || typeof action !== 'string') {
    return { error: structuredError(ERROR_CODES.invalidParams, 'action is required', 'invalid_action') };
  }

  const tabId = Number(tabIdRaw);
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { error: structuredError(ERROR_CODES.invalidParams, 'tabId must be a non-negative integer', 'invalid_tab_id') };
  }

  const timeoutParsed = parsePositiveNumber(timeoutRaw);
  if (timeoutRaw != null && timeoutParsed == null) {
    return { error: structuredError(ERROR_CODES.invalidParams, 'timeoutMs must be a positive number', 'invalid_timeout') };
  }

  const mode = typeof modeRaw === 'string' ? modeRaw : undefined;

  return {
    value: {
      action,
      tabId,
      params,
      timeoutMs: timeoutParsed || 8000,
      mode
    }
  };
}

function computeResultBytes(data) {
  try {
    return new TextEncoder().encode(JSON.stringify(data || {})).length;
  } catch {
    return 0;
  }
}

function buildExecuteResultEnvelope(req, startedAt, payload) {
  const durationMs = Date.now() - startedAt;
  const base = {
    type: 'execute_in_tab_result',
    requestId: req.requestId,
    action: req.action,
    tabId: String(req.tabId),
    durationMs
  };

  if (payload.ok) {
    return {
      ...base,
      ok: true,
      data: payload.data,
      meta: {
        action: req.action,
        tabId: String(req.tabId),
        durationMs,
        resultBytes: computeResultBytes(payload.data),
        ...(payload.meta || {})
      }
    };
  }

  return {
    ...base,
    ok: false,
    error: payload.error,
    meta: {
      action: req.action,
      tabId: String(req.tabId),
      durationMs,
      ...(payload.meta || {})
    }
  };
}

async function handleExecuteInTab(raw) {
  const startedAt = Date.now();
  const parsed = parseExecutePayload(raw);

  if (parsed.error) {
    return buildExecuteResultEnvelope(
      {
        requestId: raw?.requestId,
        action: String(raw?.action || ''),
        tabId: raw?.tabId ?? ''
      },
      startedAt,
      parsed.error
    );
  }

  const req = {
    requestId: raw?.requestId,
    action: parsed.value.action,
    tabId: parsed.value.tabId,
    params: parsed.value.params,
    timeoutMs: parsed.value.timeoutMs,
    mode: parsed.value.mode
  };

  if (!executionEnabled) {
    return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.executionDisabled, 'Execution is disabled by client options', 'execution_off'));
  }

  const capability = ACTION_CAPABILITY_MAP[req.action];
  if (!capability) {
    return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.unsupportedAction, `unsupported action: ${req.action}`, 'unsupported_action'));
  }
  if (executionCapabilities[capability] !== true) {
    if (req.action === 'runJs') {
      return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.superModeDisabled, 'Super mode (runJs) is disabled by client options', 'super_off'));
    }
    return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.capabilityDenied, `Capability ${capability} is disabled by client options`, 'capability_off'));
  }

  let actionParamError = null;
  if (V0_READ_ACTIONS.has(req.action)) {
    actionParamError = validateReadActionParams(req.action, req.params, ERROR_CODES);
  } else if (req.action === 'runJs') {
    actionParamError = validateRunJsParams(req.params, ERROR_CODES);
  } else if (V2_API_ACTIONS.has(req.action)) {
    actionParamError = validateApiActionParams(req.action, req.params, ERROR_CODES);
  } else {
    actionParamError = structuredError(ERROR_CODES.unsupportedAction, `unsupported action: ${req.action}`, 'unsupported_action');
  }

  if (actionParamError) {
    return buildExecuteResultEnvelope(req, startedAt, actionParamError);
  }

  let tab;
  try {
    tab = await chrome.tabs.get(req.tabId);
  } catch {
    return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.tabNotFound, `Tab ${req.tabId} not found`, 'missing_tab'));
  }

  if (!tab) {
    return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.tabNotFound, `Tab ${req.tabId} not found`, 'missing_tab'));
  }

  if (isProtectedTabUrl(tab.url || '')) {
    return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.protectedPage, 'Protected browser page cannot be executed', 'protected_scheme'));
  }

  if (!isDomainAllowed(tab.url || '')) {
    return buildExecuteResultEnvelope(req, startedAt, structuredError(ERROR_CODES.domainNotAllowed, `Domain is not in execution allowlist: ${tab.url || ''}`, 'allowlist_miss'));
  }

  const result = await routeExecuteAction(req);
  return buildExecuteResultEnvelope(req, startedAt, result);
}

function shouldFallback(error) {
  const code = error?.code;
  return RUNJS_FALLBACK_ERROR_CODES.has(code);
}

async function executeFallbackAction(baseReq, fallbackAction, fallbackParams) {
  if (V0_READ_ACTIONS.has(fallbackAction)) {
    return executeReadActionInTab({
      tabId: baseReq.tabId,
      action: fallbackAction,
      params: fallbackParams,
      timeoutMs: baseReq.timeoutMs,
      ERROR_CODES
    });
  }

  return executeApiAction({
    ...baseReq,
    action: fallbackAction,
    params: fallbackParams
  }, ERROR_CODES);
}

function validateFallbackActionParams(fallbackAction, fallbackParams) {
  if (V0_READ_ACTIONS.has(fallbackAction)) {
    return validateReadActionParams(fallbackAction, fallbackParams, ERROR_CODES);
  }

  return validateApiActionParams(fallbackAction, fallbackParams, ERROR_CODES);
}

async function routeExecuteAction(req) {
  if (V0_READ_ACTIONS.has(req.action)) {
    return {
      ...await executeReadActionInTab({
        tabId: req.tabId,
        action: req.action,
        params: req.params,
        timeoutMs: req.timeoutMs,
        ERROR_CODES
      }),
      meta: { modeUsed: 'api', fallbackUsed: false }
    };
  }

  if (V2_API_ACTIONS.has(req.action)) {
    return {
      ...await executeApiAction(req, ERROR_CODES),
      meta: { modeUsed: 'api', fallbackUsed: false }
    };
  }

  const mode = EXECUTION_MODES.has(req.mode) ? req.mode : 'runJs';

  if (mode === 'runJs') {
    return {
      ...await executeRunJsInTab({
        tabId: req.tabId,
        code: req.params.code,
        timeoutMs: req.timeoutMs,
        ERROR_CODES
      }),
      meta: { modeUsed: 'runJs', fallbackUsed: false }
    };
  }

  if (mode === 'api') {
    const fallbackAction = typeof req.params.fallbackAction === 'string' ? req.params.fallbackAction : '';
    if (!fallbackAction) {
      return {
        ...structuredError(ERROR_CODES.invalidParams, 'runJs mode=api requires params.fallbackAction', 'missing_fallback_action'),
        meta: { modeUsed: 'api', fallbackUsed: false }
      };
    }

    if (!FALLBACK_ACTIONS.has(fallbackAction)) {
      return {
        ...structuredError(ERROR_CODES.unsupportedFallbackAction, `unsupported fallback action: ${fallbackAction}`, 'unsupported_fallback_action'),
        meta: { modeUsed: 'api', fallbackUsed: false }
      };
    }

    const fallbackParams = (req.params.fallbackParams && typeof req.params.fallbackParams === 'object' && !Array.isArray(req.params.fallbackParams))
      ? req.params.fallbackParams
      : {};
    const fallbackParamError = validateFallbackActionParams(fallbackAction, fallbackParams);
    if (fallbackParamError) {
      return { ...fallbackParamError, meta: { modeUsed: 'api', fallbackUsed: false } };
    }

    return {
      ...await executeFallbackAction(req, fallbackAction, fallbackParams),
      meta: { modeUsed: 'api', fallbackUsed: false }
    };
  }

  const runJsResult = await executeRunJsInTab({
    tabId: req.tabId,
    code: req.params.code,
    timeoutMs: req.timeoutMs,
    ERROR_CODES
  });

  if (runJsResult.ok || !shouldFallback(runJsResult.error)) {
    return { ...runJsResult, meta: { modeUsed: 'runJs', fallbackUsed: false } };
  }

  const fallbackAction = typeof req.params.fallbackAction === 'string' ? req.params.fallbackAction : '';
  if (!fallbackAction) {
    return { ...runJsResult, meta: { modeUsed: 'runJs', fallbackUsed: false } };
  }

  if (!FALLBACK_ACTIONS.has(fallbackAction)) {
    return {
      ...runJsResult,
      meta: {
        modeUsed: 'runJs',
        fallbackUsed: false,
        fallbackAction,
        runJsError: runJsResult.error,
        fallbackError: {
          code: ERROR_CODES.unsupportedFallbackAction,
          reason: 'unsupported_fallback_action'
        }
      }
    };
  }

  const fallbackParams = (req.params.fallbackParams && typeof req.params.fallbackParams === 'object' && !Array.isArray(req.params.fallbackParams))
    ? req.params.fallbackParams
    : {};
  const fallbackParamError = validateFallbackActionParams(fallbackAction, fallbackParams);
  if (fallbackParamError) {
    return {
      ...runJsResult,
      meta: {
        modeUsed: 'runJs',
        fallbackUsed: false,
        fallbackAction,
        runJsError: runJsResult.error,
        fallbackError: fallbackParamError.error
      }
    };
  }

  const fallbackResult = await executeFallbackAction(req, fallbackAction, fallbackParams);
  return {
    ...fallbackResult,
    meta: {
      modeUsed: 'api',
      fallbackUsed: true,
      fallbackAction,
      runJsError: runJsResult.error
    }
  };
}

function connect() {
  if (!armed || !isValidEndpoint(endpoint) || ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

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

  ws.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data || '{}'));
    } catch {
      return;
    }

    if (!message || typeof message !== 'object') return;
    const type = message.type;
    if (type !== 'execute_in_tab' && type !== 'executeInTab') return;

    void handleExecuteInTab(message)
      .then((response) => send(response))
      .catch((err) => {
        send({
          type: 'execute_in_tab_result',
          requestId: message?.requestId,
          action: message?.action,
          tabId: String(message?.tabId || ''),
          ok: false,
          error: {
            code: ERROR_CODES.internalError,
            message: String(err?.message || err || 'internal error'),
            reason: 'handler_failed'
          },
          meta: {
            action: message?.action,
            tabId: String(message?.tabId || ''),
            durationMs: 0
          }
        });
      });
  };

  ws.onclose = () => {
    stopHeartbeat();
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {};
}

async function loadConfig() {
  const store = await getStore();
  const saved = await store.get({
    [STORAGE_KEYS.endpoint]: DEFAULT_ENDPOINT,
    [STORAGE_KEYS.armed]: false,
    [STORAGE_KEYS.clientId]: '',
    [STORAGE_KEYS.executionEnabled]: true,
    [STORAGE_KEYS.executionAllowlist]: [],
    [STORAGE_KEYS.executionCapabilities]: { ...DEFAULT_EXECUTION_CAPABILITIES }
  });

  endpoint = typeof saved[STORAGE_KEYS.endpoint] === 'string' ? saved[STORAGE_KEYS.endpoint].trim() : DEFAULT_ENDPOINT;
  armed = saved[STORAGE_KEYS.armed] === true;

  if (typeof saved[STORAGE_KEYS.clientId] === 'string' && saved[STORAGE_KEYS.clientId]) {
    clientId = saved[STORAGE_KEYS.clientId];
  } else {
    clientId = randomId();
  }

  executionEnabled = saved[STORAGE_KEYS.executionEnabled] !== false;
  executionAllowlist = normalizeAllowlist(saved[STORAGE_KEYS.executionAllowlist]);
  executionCapabilities = {
    ...DEFAULT_EXECUTION_CAPABILITIES,
    ...(saved[STORAGE_KEYS.executionCapabilities] || {})
  };

  await store.set({
    [STORAGE_KEYS.endpoint]: endpoint,
    [STORAGE_KEYS.armed]: armed,
    [STORAGE_KEYS.clientId]: clientId,
    [STORAGE_KEYS.executionEnabled]: executionEnabled,
    [STORAGE_KEYS.executionAllowlist]: executionAllowlist,
    [STORAGE_KEYS.executionCapabilities]: executionCapabilities
  });
}

async function applyArmedState(nextArmed) {
  armed = !!nextArmed;
  const store = await getStore();
  await store.set({ [STORAGE_KEYS.armed]: armed });
  clearReconnectTimer();
  if (!armed) {
    stopHeartbeat();
    closeSocket();
    return;
  }
  connect();
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.endpoint]) {
    endpoint = (changes[STORAGE_KEYS.endpoint].newValue || '').trim();
    closeSocket();
    clearReconnectTimer();
    connect();
  }

  if (changes[STORAGE_KEYS.armed]) {
    void applyArmedState(changes[STORAGE_KEYS.armed].newValue);
  }

  if (changes[STORAGE_KEYS.executionEnabled]) {
    executionEnabled = changes[STORAGE_KEYS.executionEnabled].newValue !== false;
  }

  if (changes[STORAGE_KEYS.executionAllowlist]) {
    executionAllowlist = normalizeAllowlist(changes[STORAGE_KEYS.executionAllowlist].newValue);
  }

  if (changes[STORAGE_KEYS.executionCapabilities]) {
    executionCapabilities = {
      ...DEFAULT_EXECUTION_CAPABILITIES,
      ...(changes[STORAGE_KEYS.executionCapabilities].newValue || {})
    };
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id == null) return;
  send({ type: 'tab_update', ...normalizeTab(tab), tabId: String(tab.id) });
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

function getConnectionState() {
  if (!armed || !isValidEndpoint(endpoint)) return 'off';
  if (ws?.readyState === WebSocket.OPEN) return 'on';
  if (ws?.readyState === WebSocket.CONNECTING || reconnectTimer) return 'connecting';
  return 'off';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'bridge:status') {
    sendResponse({
      clientId,
      endpoint,
      connected: ws?.readyState === WebSocket.OPEN,
      state: getConnectionState(),
      executionEnabled,
      executionAllowlist,
      executionCapabilities
    });
    return true;
  }
  if (message.type === 'bridge:set-config') {
    const nextEndpoint = typeof message.endpoint === 'string' ? message.endpoint.trim() : endpoint;
    if (!isValidEndpoint(nextEndpoint)) {
      sendResponse({ ok: false, error: 'invalid endpoint: must start with ws:// or wss://' });
      return true;
    }
    endpoint = nextEndpoint;
    armed = true;

    const nextExecutionEnabled = message.executionEnabled !== false;
    const nextExecutionAllowlist = normalizeAllowlist(message.executionAllowlist);
    const nextExecutionCapabilities = {
      ...DEFAULT_EXECUTION_CAPABILITIES,
      ...(message.executionCapabilities || {})
    };

    executionEnabled = nextExecutionEnabled;
    executionAllowlist = nextExecutionAllowlist;
    executionCapabilities = nextExecutionCapabilities;

    (async () => {
      const store = await getStore();
      await store.set({
        [STORAGE_KEYS.endpoint]: endpoint,
        [STORAGE_KEYS.armed]: armed,
        [STORAGE_KEYS.clientId]: clientId || '',
        [STORAGE_KEYS.executionEnabled]: executionEnabled,
        [STORAGE_KEYS.executionAllowlist]: executionAllowlist,
        [STORAGE_KEYS.executionCapabilities]: executionCapabilities
      });
      closeSocket();
      clearReconnectTimer();
      if (armed && isValidEndpoint(endpoint)) connect();
      sendResponse({
        ok: true,
        endpoint,
        clientId,
        executionEnabled,
        executionAllowlist,
        executionCapabilities
      });
    })().catch((err) => sendResponse({ ok: false, error: String(err) }));
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
  if (armed && isValidEndpoint(endpoint)) connect();
})();
