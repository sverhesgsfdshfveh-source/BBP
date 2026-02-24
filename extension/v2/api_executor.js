import { findElementBySelectorOrText, ensureFocusable, setInputValue } from '../utils/selector_utils.js';

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

function trimToMax(input, maxChars) {
  if (!maxChars) return input;
  return input.length > maxChars ? input.slice(0, maxChars) : input;
}

function createTimeoutPromise(timeoutMs, onTimeout) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(onTimeout()), timeoutMs);
  });
}

async function waitFor(checker, timeoutMs) {
  const startedAt = Date.now();
  const pollMs = 100;
  while (Date.now() - startedAt <= timeoutMs) {
    const hit = checker();
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}

async function executeDomAction(action, params, timeoutMs) {
  function safeText(v) {
    return typeof v === 'string' ? v : (v == null ? '' : String(v));
  }

  if (action === 'click' || action === 'clickSelector') {
    const target = findElementBySelectorOrText(params.selector, params.text);
    if (!target) {
      return { scriptError: { code: 'target_not_found', message: 'click target not found' } };
    }
    ensureFocusable(target);
    target.click();
    return {
      url: location.href,
      title: document.title,
      clicked: true,
      selector: params.selector || null,
      capturedAt: Date.now()
    };
  }

  if (action === 'type' || action === 'typeSelector') {
    const target = findElementBySelectorOrText(params.selector, params.text);
    if (!target) {
      return { scriptError: { code: 'target_not_found', message: 'type target not found' } };
    }
    const nextValueRaw = params.value ?? params.input ?? params.textValue ?? params.text ?? '';
    const currentValue = target?.isContentEditable ? (target.textContent || '') : (target?.value ?? '');
    const nextValue = params.append === true ? `${currentValue}${safeText(nextValueRaw)}` : safeText(nextValueRaw);
    const ok = setInputValue(target, nextValue);
    if (!ok) {
      return { scriptError: { code: 'target_not_editable', message: 'target is not editable' } };
    }
    return {
      url: location.href,
      title: document.title,
      typed: true,
      length: nextValue.length,
      capturedAt: Date.now()
    };
  }

  if (action === 'waitForSelector') {
    const selector = params.selector;
    const found = await waitFor(() => document.querySelector(selector), timeoutMs);
    if (!found) return { scriptError: { code: 'timeout', message: 'waitForSelector timeout' } };
    return {
      url: location.href,
      title: document.title,
      found: true,
      selector,
      capturedAt: Date.now()
    };
  }

  if (action === 'waitForText') {
    const text = safeText(params.text);
    const gone = params.gone === true;
    const matched = await waitFor(() => {
      const bodyText = (document.body?.innerText || document.body?.textContent || '');
      const hasText = bodyText.includes(text);
      if (gone ? !hasText : hasText) {
        return trimToMax(bodyText, 200);
      }
      return null;
    }, timeoutMs);

    if (!matched) return { scriptError: { code: 'timeout', message: 'waitForText timeout' } };
    return {
      url: location.href,
      title: document.title,
      matched: true,
      text,
      gone,
      snippet: matched,
      capturedAt: Date.now()
    };
  }

  if (action === 'querySelectorAttr') {
    const selector = params.selector;
    const attr = params.attr;
    const all = params.all === true;
    if (all) {
      const values = Array.from(document.querySelectorAll(selector)).map((node) => {
        const value = node.getAttribute(attr);
        return value == null ? null : String(value);
      });
      return {
        url: location.href,
        title: document.title,
        value: values,
        capturedAt: Date.now()
      };
    }

    const node = document.querySelector(selector);
    if (!node) {
      return { scriptError: { code: 'target_not_found', message: 'query target not found' } };
    }
    const value = node.getAttribute(attr);
    return {
      url: location.href,
      title: document.title,
      value: value == null ? null : String(value),
      capturedAt: Date.now()
    };
  }

  return { scriptError: { code: 'unsupported_action', message: `unsupported action: ${action}` } };
}

function mapScriptError(err, ERROR_CODES) {
  const msg = String(err?.message || err || 'script execution failed');
  const lower = msg.toLowerCase();
  if (lower.includes('cannot access') || lower.includes('chrome://') || lower.includes('missing host permission')) {
    return structuredError(ERROR_CODES.protectedPage, msg, 'inject_blocked');
  }
  return structuredError(ERROR_CODES.scriptRuntimeError, msg, 'execution_failed');
}

export function validateApiActionParams(action, params, ERROR_CODES) {
  if (action === 'openTab') {
    if (typeof params.url !== 'string' || !params.url.trim()) {
      return structuredError(ERROR_CODES.invalidParams, 'params.url is required', 'missing_url');
    }
    return null;
  }

  if (action === 'focusTab' || action === 'closeTab' || action === 'screenshotTab') {
    return null;
  }

  if (action === 'click' || action === 'clickSelector') {
    if (!(typeof params.selector === 'string' && params.selector.trim()) && !(typeof params.text === 'string' && params.text.trim())) {
      return structuredError(ERROR_CODES.invalidParams, 'params.selector or params.text is required', 'missing_target');
    }
    return null;
  }

  if (action === 'type' || action === 'typeSelector') {
    if (!(typeof params.selector === 'string' && params.selector.trim()) && !(typeof params.text === 'string' && params.text.trim())) {
      return structuredError(ERROR_CODES.invalidParams, 'params.selector or params.text is required', 'missing_target');
    }
    const value = params.value ?? params.input ?? params.textValue ?? params.text;
    if (value == null) {
      return structuredError(ERROR_CODES.invalidParams, 'type action requires text value', 'missing_value');
    }
    return null;
  }

  if (action === 'waitForSelector') {
    if (!(typeof params.selector === 'string' && params.selector.trim())) {
      return structuredError(ERROR_CODES.invalidParams, 'params.selector is required', 'missing_selector');
    }
    if (params.timeoutMs != null && parsePositiveNumber(params.timeoutMs) == null) {
      return structuredError(ERROR_CODES.invalidParams, 'params.timeoutMs must be positive number', 'invalid_timeout');
    }
    return null;
  }

  if (action === 'waitForText') {
    if (!(typeof params.text === 'string' && params.text.trim())) {
      return structuredError(ERROR_CODES.invalidParams, 'params.text is required', 'missing_text');
    }
    if (params.timeoutMs != null && parsePositiveNumber(params.timeoutMs) == null) {
      return structuredError(ERROR_CODES.invalidParams, 'params.timeoutMs must be positive number', 'invalid_timeout');
    }
    if (params.gone != null && typeof params.gone !== 'boolean') {
      return structuredError(ERROR_CODES.invalidParams, 'params.gone must be boolean', 'invalid_gone');
    }
    return null;
  }

  if (action === 'querySelectorAttr') {
    if (!(typeof params.selector === 'string' && params.selector.trim())) {
      return structuredError(ERROR_CODES.invalidParams, 'params.selector is required', 'missing_selector');
    }
    if (!(typeof params.attr === 'string' && params.attr.trim())) {
      return structuredError(ERROR_CODES.invalidParams, 'params.attr is required', 'missing_attr');
    }
    if (params.all != null && typeof params.all !== 'boolean') {
      return structuredError(ERROR_CODES.invalidParams, 'params.all must be boolean', 'invalid_all');
    }
    return null;
  }

  return structuredError(ERROR_CODES.unsupportedAction || ERROR_CODES.invalidParams, `unsupported action: ${action}`, 'unsupported_action');
}

async function executeDomActionInTab(tabId, action, params, timeoutMs, ERROR_CODES) {
  const scriptPromise = chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: executeDomAction,
    args: [action, params, timeoutMs]
  });

  const timeoutPromise = createTimeoutPromise(timeoutMs, () => structuredError(ERROR_CODES.timeout, `action timeout after ${timeoutMs}ms`, 'timeout'));

  try {
    const race = await Promise.race([scriptPromise, timeoutPromise]);
    if (race && race.ok === false && race.error?.code === ERROR_CODES.timeout) {
      return race;
    }

    const [injectionResult] = race;
    if (!injectionResult) {
      return structuredError(ERROR_CODES.internalError, 'empty script result', 'empty_result');
    }

    if (injectionResult.result?.scriptError) {
      const scriptCode = injectionResult.result.scriptError.code;
      if (scriptCode === 'timeout') {
        return structuredError(ERROR_CODES.timeout, injectionResult.result.scriptError.message || 'action timeout', 'timeout');
      }
      return structuredError(ERROR_CODES.scriptRuntimeError, injectionResult.result.scriptError.message || 'script runtime error', scriptCode || 'script_error');
    }

    return { ok: true, data: injectionResult.result };
  } catch (err) {
    return mapScriptError(err, ERROR_CODES);
  }
}

function normalizeCaptureFormat(format) {
  return String(format || 'png').toLowerCase() === 'jpeg' ? 'jpeg' : 'png';
}

function extractImageBase64(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return dataUrl;
  return dataUrl.slice(idx + 1);
}

export async function executeApiAction(req, ERROR_CODES) {
  if (req.action === 'openTab') {
    const url = typeof req.params.url === 'string' ? req.params.url.trim() : '';
    if (!url) return structuredError(ERROR_CODES.invalidParams, 'params.url is required', 'missing_url');
    try {
      const tab = await chrome.tabs.create({
        url,
        active: req.params.active !== false,
        ...(Number.isInteger(req.params.windowId) ? { windowId: req.params.windowId } : {})
      });
      return {
        ok: true,
        data: {
          tabId: String(tab.id),
          windowId: tab.windowId,
          url: tab.url || url,
          title: tab.title || ''
        }
      };
    } catch (err) {
      return structuredError(ERROR_CODES.internalError, String(err?.message || err || 'openTab failed'), 'open_tab_failed');
    }
  }

  if (req.action === 'focusTab') {
    if (!Number.isInteger(req.tabId)) return structuredError(ERROR_CODES.invalidParams, 'tabId is required', 'missing_tab_id');
    try {
      const tab = await chrome.tabs.get(req.tabId);
      if (!tab?.id) return structuredError(ERROR_CODES.tabNotFound, `Tab ${req.tabId} not found`, 'missing_tab');
      await chrome.tabs.update(req.tabId, { active: true });
      if (typeof tab.windowId === 'number') await chrome.windows.update(tab.windowId, { focused: true });
      return { ok: true, data: { tabId: String(req.tabId), active: true } };
    } catch {
      return structuredError(ERROR_CODES.tabNotFound, `Tab ${req.tabId} not found`, 'missing_tab');
    }
  }

  if (req.action === 'closeTab') {
    if (!Number.isInteger(req.tabId)) return structuredError(ERROR_CODES.invalidParams, 'tabId is required', 'missing_tab_id');
    try {
      await chrome.tabs.remove(req.tabId);
      return { ok: true, data: { tabId: String(req.tabId), closed: true } };
    } catch {
      return structuredError(ERROR_CODES.tabNotFound, `Tab ${req.tabId} not found`, 'missing_tab');
    }
  }

  if (req.action === 'screenshotTab') {
    if (!Number.isInteger(req.tabId)) return structuredError(ERROR_CODES.invalidParams, 'tabId is required', 'missing_tab_id');
    try {
      const tab = await chrome.tabs.get(req.tabId);
      if (!tab?.id) return structuredError(ERROR_CODES.tabNotFound, `Tab ${req.tabId} not found`, 'missing_tab');

      const format = normalizeCaptureFormat(req.params.format);
      const quality = format === 'jpeg' && Number.isFinite(Number(req.params.quality))
        ? Math.max(0, Math.min(100, Number(req.params.quality)))
        : undefined;

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format,
        ...(quality != null ? { quality } : {})
      });

      return {
        ok: true,
        data: {
          imageBase64: extractImageBase64(dataUrl),
          format,
          url: tab.url || '',
          title: tab.title || '',
          capturedAt: Date.now()
        }
      };
    } catch (err) {
      return structuredError(ERROR_CODES.internalError, String(err?.message || err || 'screenshotTab failed'), 'capture_failed');
    }
  }

  if (!Number.isInteger(req.tabId)) {
    return structuredError(ERROR_CODES.invalidParams, 'tabId is required for tab action', 'missing_tab_id');
  }

  const timeoutMs = parsePositiveNumber(req.params.timeoutMs ?? req.timeoutMs) || 8000;
  return executeDomActionInTab(req.tabId, req.action, req.params, timeoutMs, ERROR_CODES);
}
