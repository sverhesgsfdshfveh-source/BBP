export const RUNJS_FALLBACK_ERROR_CODES = new Set([
  'script_runtime_error',
  'timeout',
  'protected_page'
]);

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

function mapScriptError(err, ERROR_CODES) {
  const msg = String(err?.message || err || 'script execution failed');
  const lower = msg.toLowerCase();
  if (lower.includes('cannot access') || lower.includes('chrome://') || lower.includes('missing host permission')) {
    return structuredError(ERROR_CODES.protectedPage, msg, 'inject_blocked');
  }
  return structuredError(ERROR_CODES.scriptRuntimeError, msg, 'execution_failed');
}

export function validateRunJsParams(params, ERROR_CODES) {
  if (typeof params.code !== 'string' || !params.code.trim()) {
    return structuredError(ERROR_CODES.invalidParams, 'params.code is required', 'missing_code');
  }
  if (params.fallbackAction != null && typeof params.fallbackAction !== 'string') {
    return structuredError(ERROR_CODES.invalidParams, 'params.fallbackAction must be string', 'invalid_fallback_action');
  }
  if (params.fallbackParams != null && (typeof params.fallbackParams !== 'object' || Array.isArray(params.fallbackParams))) {
    return structuredError(ERROR_CODES.invalidParams, 'params.fallbackParams must be object', 'invalid_fallback_params');
  }
  return null;
}

export async function executeRunJsInTab({ tabId, code, timeoutMs, ERROR_CODES }) {
  const runJs = async (codeText) => {
    try {
      const fn = new Function(codeText);
      const value = await fn();
      return { value };
    } catch (error) {
      return {
        scriptError: {
          code: 'runjs_error',
          message: String(error?.message || error || 'runJs failed')
        }
      };
    }
  };

  const scriptPromise = chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: runJs,
    args: [code]
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
      return structuredError(
        ERROR_CODES.scriptRuntimeError,
        injectionResult.result.scriptError.message || 'script runtime error',
        injectionResult.result.scriptError.code || 'script_error'
      );
    }

    return {
      ok: true,
      data: { value: injectionResult.result?.value }
    };
  } catch (err) {
    return mapScriptError(err, ERROR_CODES);
  }
}
