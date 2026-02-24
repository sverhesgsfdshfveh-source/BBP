import { executeApiAction } from '../extension/v2/api_executor.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createFakeDom() {
  const button = {
    tagName: 'BUTTON',
    innerText: 'Submit',
    textContent: 'Submit',
    clickCalled: false,
    focus() {},
    click() { this.clickCalled = true; }
  };

  const input = {
    tagName: 'INPUT',
    value: '',
    focus() {},
    dispatchEvent() {}
  };

  const link = {
    getAttribute(name) {
      if (name === 'href') return 'https://example.com/path';
      return null;
    }
  };

  const nodesBySelector = new Map([
    ['#btn', button],
    ['#name', input],
    ['a.primary', link]
  ]);

  globalThis.location = { href: 'https://example.com/form' };
  globalThis.document = {
    title: 'Fake Page',
    body: {
      innerText: 'hello world body text'
    },
    querySelector(selector) {
      return nodesBySelector.get(selector) || null;
    },
    querySelectorAll(selector) {
      if (selector === 'button, a, input, textarea, [role="button"], [contenteditable="true"], [contenteditable=""], [tabindex]') {
        return [button, input];
      }
      if (selector === 'a.primary') return [link];
      return [];
    }
  };

  globalThis.Event = class {
    constructor(type) {
      this.type = type;
    }
  };

  return { button, input };
}

function installFakeChrome() {
  const tab = { id: 88, windowId: 5, url: 'https://example.com/form', title: 'Fake Page' };
  globalThis.chrome = {
    tabs: {
      async get(id) {
        if (id !== 88) throw new Error('not found');
        return tab;
      },
      async create(opts) {
        return { id: 99, windowId: opts.windowId ?? 5, url: opts.url, title: 'New' };
      },
      async update() {
        return {};
      },
      async remove() {
        return;
      },
      async captureVisibleTab() {
        return 'data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh';
      }
    },
    windows: {
      async update() {
        return {};
      }
    },
    scripting: {
      async executeScript({ func, args }) {
        const result = await func(...args);
        return [{ result }];
      }
    }
  };
}

const ERROR_CODES = {
  invalidParams: 'invalid_params',
  tabNotFound: 'tab_not_found',
  timeout: 'timeout',
  protectedPage: 'protected_page',
  scriptRuntimeError: 'script_runtime_error',
  internalError: 'internal_error',
  unsupportedAction: 'unsupported_action'
};

createFakeDom();
installFakeChrome();

const clickRes = await executeApiAction({
  action: 'clickSelector',
  tabId: 88,
  params: { selector: '#btn' },
  timeoutMs: 800
}, ERROR_CODES);
assert(clickRes.ok && clickRes.data.clicked === true, 'clickSelector failed');

const typeRes = await executeApiAction({
  action: 'typeSelector',
  tabId: 88,
  params: { selector: '#name', text: 'Alice' },
  timeoutMs: 800
}, ERROR_CODES);
assert(typeRes.ok && typeRes.data.typed === true && typeRes.data.length === 5, 'typeSelector failed');

const shotRes = await executeApiAction({
  action: 'screenshotTab',
  tabId: 88,
  params: { format: 'png' },
  timeoutMs: 800
}, ERROR_CODES);
assert(shotRes.ok, 'screenshotTab failed');
assert(shotRes.data.imageBase64 === 'ZmFrZS1pbWFnZS1kYXRh', 'screenshotTab base64 mismatch');
assert(shotRes.data.url === 'https://example.com/form', 'screenshotTab url mismatch');
assert(shotRes.data.title === 'Fake Page', 'screenshotTab title mismatch');

console.log('local-action-smoke ok', {
  click: clickRes.data.clicked,
  typedLength: typeRes.data.length,
  screenshotBytes: shotRes.data.imageBase64.length
});
