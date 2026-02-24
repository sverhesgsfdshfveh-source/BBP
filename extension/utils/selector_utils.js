export function findElementBySelectorOrText(selector, text) {
  if (typeof selector === 'string' && selector.trim()) {
    const node = document.querySelector(selector.trim());
    if (node) return node;
  }

  if (typeof text === 'string' && text.trim()) {
    const normalized = text.trim();
    const candidates = Array.from(document.querySelectorAll('button, a, input, textarea, [role="button"], [contenteditable="true"], [contenteditable=""], [tabindex]'));
    const exact = candidates.find((el) => (el.innerText || el.textContent || '').trim() === normalized);
    if (exact) return exact;
    const fuzzy = candidates.find((el) => (el.innerText || el.textContent || '').trim().includes(normalized));
    if (fuzzy) return fuzzy;
  }

  return null;
}

export function ensureFocusable(el) {
  try {
    if (typeof el.focus === 'function') el.focus();
  } catch {}
}

export function setInputValue(el, value) {
  const tag = (el?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el?.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  return false;
}
