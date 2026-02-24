import { executeRunJsInTab, RUNJS_FALLBACK_ERROR_CODES } from '../extension/v1/runjs_executor.js';
import { executeApiAction } from '../extension/v2/api_executor.js';
import { executeReadActionInTab } from '../extension/v0/read_executor.js';

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

const V0_READ_ACTIONS = new Set(['extractText', 'extractLinks', 'querySelectorText']);
const V2_API_ACTIONS = new Set(['openTab', 'focusTab', 'closeTab', 'click', 'type', 'clickSelector', 'typeSelector', 'waitForSelector', 'waitForText', 'querySelectorAttr', 'screenshotTab']);
const FALLBACK_ACTIONS = new Set([...V0_READ_ACTIONS, ...V2_API_ACTIONS]);

function shouldFallback(error) {
  return RUNJS_FALLBACK_ERROR_CODES.has(error?.code);
}

function assert(c, msg) {
  if (!c) throw new Error(msg);
}

function createDom() {
  const btn = { tagName: 'BUTTON', innerText: 'Go', textContent: 'Go', click() {}, focus() {}, getAttribute(name) { return name === 'id' ? 'go' : null; } };
  globalThis.location = { href: 'https://example.com' };
  globalThis.document = {
    title: 'Demo',
    body: { innerText: 'hello world' },
    querySelector(sel) {
      if (sel === '#go') return btn;
      return null;
    },
    querySelectorAll() { return [btn]; }
  };
  globalThis.Event = class { constructor(type) { this.type = type; } };
}

function installChrome() {
  globalThis.chrome = {
    tabs: {
      async get(id) {
        if (id !== 1) throw new Error('not found');
        return { id: 1, windowId: 1, url: 'https://example.com', title: 'Demo' };
      },
      async captureVisibleTab() {
        return 'data:image/png;base64,ZmFrZQ==';
      },
      async create(opts) { return { id: 2, windowId: 1, url: opts.url, title: 'New' }; },
      async update() { return {}; },
      async remove() { return; }
    },
    windows: { async update() { return {}; } },
    scripting: {
      async executeScript({ func, args }) {
        const result = await func(...args);
        return [{ result }];
      }
    }
  };
}

async function executeFallbackAction(baseReq, fallbackAction, fallbackParams) {
  if (V0_READ_ACTIONS.has(fallbackAction)) {
    return executeReadActionInTab({ tabId: baseReq.tabId, action: fallbackAction, params: fallbackParams, timeoutMs: baseReq.timeoutMs, ERROR_CODES });
  }
  return executeApiAction({ ...baseReq, action: fallbackAction, params: fallbackParams }, ERROR_CODES);
}

async function route(req) {
  if (req.mode === 'runJs') {
    return executeRunJsInTab({ tabId: req.tabId, code: req.params.code, timeoutMs: req.timeoutMs, ERROR_CODES });
  }

  if (req.mode === 'api') {
    assert(FALLBACK_ACTIONS.has(req.params.fallbackAction), 'mode=api fallbackAction required in smoke');
    return executeFallbackAction(req, req.params.fallbackAction, req.params.fallbackParams || {});
  }

  const runJsResult = await executeRunJsInTab({ tabId: req.tabId, code: req.params.code, timeoutMs: req.timeoutMs, ERROR_CODES });
  if (runJsResult.ok || !shouldFallback(runJsResult.error)) return runJsResult;
  return executeFallbackAction(req, req.params.fallbackAction, req.params.fallbackParams || {});
}

createDom();
installChrome();

const runJsOk = await route({
  tabId: 1,
  timeoutMs: 300,
  mode: 'runJs',
  params: { code: 'return 7 * 6;' }
});
assert(runJsOk.ok && runJsOk.data.value === 42, 'mode=runJs failed');

const apiOk = await route({
  tabId: 1,
  timeoutMs: 300,
  mode: 'api',
  params: {
    fallbackAction: 'querySelectorAttr',
    fallbackParams: { selector: '#go', attr: 'id' }
  }
});
assert(apiOk.ok, 'mode=api failed');

const autoOk = await route({
  tabId: 1,
  timeoutMs: 300,
  mode: 'auto',
  params: {
    code: 'throw new Error("boom")',
    fallbackAction: 'screenshotTab',
    fallbackParams: { format: 'png' }
  }
});
assert(autoOk.ok && autoOk.data.imageBase64, 'mode=auto fallback failed');

const clientA = { read: true, runJs: true };
const clientB = { read: true, runJs: false };

const shotA = clientA.read ? await executeApiAction({ action: 'screenshotTab', tabId: 1, params: { format: 'png' }, timeoutMs: 300 }, ERROR_CODES) : { ok: false };
const shotB = clientB.read ? await executeApiAction({ action: 'screenshotTab', tabId: 1, params: { format: 'png' }, timeoutMs: 300 }, ERROR_CODES) : { ok: false };
assert(shotA.ok && shotB.ok, 'screenshot dual-client scenario failed');

console.log('three-mode-smoke ok', {
  runJs: runJsOk.ok,
  api: apiOk.ok,
  auto: autoOk.ok,
  screenshotClientA: shotA.ok,
  screenshotClientB: shotB.ok
});
