function parsePositiveNumber(v) {
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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

export function validateReadActionParams(action, params, ERROR_CODES) {
  if (action === 'extractText') {
    if (params.selector != null && typeof params.selector !== 'string') {
      return structuredError(ERROR_CODES.invalidParams, 'params.selector must be string', 'invalid_selector');
    }
    if (params.includeLinks != null && typeof params.includeLinks !== 'boolean') {
      return structuredError(ERROR_CODES.invalidParams, 'params.includeLinks must be boolean', 'invalid_include_links');
    }
    if (params.maxChars != null && parsePositiveNumber(params.maxChars) == null) {
      return structuredError(ERROR_CODES.invalidParams, 'params.maxChars must be positive number', 'invalid_max_chars');
    }
    return null;
  }

  if (action === 'extractLinks') {
    if (params.sameHostOnly != null && typeof params.sameHostOnly !== 'boolean') {
      return structuredError(ERROR_CODES.invalidParams, 'params.sameHostOnly must be boolean', 'invalid_same_host_only');
    }
    if (params.maxLinks != null && parsePositiveNumber(params.maxLinks) == null) {
      return structuredError(ERROR_CODES.invalidParams, 'params.maxLinks must be positive number', 'invalid_max_links');
    }
    return null;
  }

  if (action === 'querySelectorText') {
    if (typeof params.selector !== 'string' || !params.selector.trim()) {
      return structuredError(ERROR_CODES.invalidParams, 'params.selector is required', 'missing_selector');
    }
    if (params.all != null && typeof params.all !== 'boolean') {
      return structuredError(ERROR_CODES.invalidParams, 'params.all must be boolean', 'invalid_all');
    }
    if (params.maxChars != null && parsePositiveNumber(params.maxChars) == null) {
      return structuredError(ERROR_CODES.invalidParams, 'params.maxChars must be positive number', 'invalid_max_chars');
    }
    return null;
  }

  return structuredError(ERROR_CODES.invalidParams, `unsupported action: ${action}`, 'unsupported_action');
}

function executeReadAction(action, params) {
  function safeText(v) {
    return typeof v === 'string' ? v : (v == null ? '' : String(v));
  }

  function trimToMax(input, maxChars) {
    if (!maxChars) return input;
    return input.length > maxChars ? input.slice(0, maxChars) : input;
  }

  if (action === 'extractText') {
    const maxChars = params.maxChars != null ? Number(params.maxChars) : undefined;
    const includeLinks = params.includeLinks === true;
    const selector = typeof params.selector === 'string' && params.selector.trim() ? params.selector.trim() : null;
    const root = selector ? document.querySelector(selector) : document.body;
    if (!root) {
      return { scriptError: { code: 'selector_not_found', message: 'selector not found' } };
    }
    const text = trimToMax((root.innerText || '').trim(), maxChars);
    const links = includeLinks
      ? Array.from(root.querySelectorAll('a[href]')).map((a) => ({
          href: safeText(a.href),
          text: safeText(a.textContent).trim()
        }))
      : undefined;
    return {
      url: location.href,
      title: document.title,
      text,
      ...(includeLinks ? { links } : {}),
      capturedAt: Date.now()
    };
  }

  if (action === 'extractLinks') {
    const sameHostOnly = params.sameHostOnly === true;
    const maxLinks = params.maxLinks != null ? Number(params.maxLinks) : undefined;
    const host = location.host;
    let links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
      href: safeText(a.href),
      text: safeText(a.textContent).trim()
    }));
    if (sameHostOnly) {
      links = links.filter((l) => {
        try {
          return new URL(l.href).host === host;
        } catch {
          return false;
        }
      });
    }
    if (maxLinks && links.length > maxLinks) links = links.slice(0, maxLinks);
    return {
      url: location.href,
      title: document.title,
      links,
      capturedAt: Date.now()
    };
  }

  if (action === 'querySelectorText') {
    const selector = params.selector;
    const all = params.all === true;
    const maxChars = params.maxChars != null ? Number(params.maxChars) : undefined;

    if (all) {
      const values = Array.from(document.querySelectorAll(selector)).map((el) =>
        trimToMax((el.textContent || '').trim(), maxChars)
      );
      return {
        url: location.href,
        title: document.title,
        value: values,
        capturedAt: Date.now()
      };
    }

    const node = document.querySelector(selector);
    const value = node ? trimToMax((node.textContent || '').trim(), maxChars) : '';
    return {
      url: location.href,
      title: document.title,
      value,
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

export async function executeReadActionInTab({ tabId, action, params, timeoutMs, ERROR_CODES }) {
  const scriptPromise = chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: executeReadAction,
    args: [action, params]
  });

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(structuredError(ERROR_CODES.timeout, `action timeout after ${timeoutMs}ms`, 'timeout')), timeoutMs);
  });

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
      return structuredError(ERROR_CODES.scriptRuntimeError, injectionResult.result.scriptError.message || 'script runtime error', injectionResult.result.scriptError.code || 'script_error');
    }

    return { ok: true, data: injectionResult.result };
  } catch (err) {
    return mapScriptError(err, ERROR_CODES);
  }
}
