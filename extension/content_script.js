(() => {
  if (window.__BROWSER_BRIDGE_LOADED__) return;
  window.__BROWSER_BRIDGE_LOADED__ = true;

  let attached = false;
  let highlightNode = null;

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectVisibleTextSnippet(maxLen = 2500) {
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const parts = [];
    let len = 0;

    while (walker.nextNode() && len < maxLen) {
      const node = walker.currentNode;
      const text = (node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;
      parts.push(text);
      len += text.length + 1;
    }

    return parts.join(" ").slice(0, maxLen);
  }

  function collectLinks(limit = 30) {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const links = [];
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.href;
      const text = (a.innerText || a.textContent || "").trim().replace(/\s+/g, " ");
      if (!href) continue;
      links.push({ text: text.slice(0, 120), href });
      if (links.length >= limit) break;
    }
    return links;
  }

  function captureSummary() {
    return {
      title: document.title || "",
      url: location.href,
      snippet: collectVisibleTextSnippet(),
      links: collectLinks(),
      selection: (window.getSelection()?.toString() || "").trim().slice(0, 1000)
    };
  }

  function removeHighlight() {
    if (highlightNode && highlightNode.parentNode) {
      highlightNode.parentNode.removeChild(highlightNode);
    }
    highlightNode = null;
  }

  function highlightSelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: "element not found" };
    const rect = el.getBoundingClientRect();

    removeHighlight();
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = `${Math.max(0, rect.left - 2)}px`;
    overlay.style.top = `${Math.max(0, rect.top - 2)}px`;
    overlay.style.width = `${rect.width + 4}px`;
    overlay.style.height = `${rect.height + 4}px`;
    overlay.style.border = "2px solid #ef4444";
    overlay.style.borderRadius = "6px";
    overlay.style.boxShadow = "0 0 0 99999px rgba(239,68,68,0.06)";
    overlay.style.zIndex = "2147483647";
    overlay.style.pointerEvents = "none";

    document.documentElement.appendChild(overlay);
    highlightNode = overlay;
    setTimeout(removeHighlight, 2500);
    return { ok: true };
  }

  function scrollToSelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: "element not found" };
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    return { ok: true };
  }

  function clickSelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: "element not found" };
    if (typeof el.click === "function") {
      el.click();
      return { ok: true };
    }
    return { ok: false, error: "element not clickable" };
  }

  function readSelection() {
    const text = (window.getSelection()?.toString() || "").trim();
    return { ok: true, selection: text.slice(0, 4000) };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "BRIDGE_ATTACH") {
      attached = true;
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "BRIDGE_DETACH") {
      attached = false;
      removeHighlight();
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "GET_PAGE_SUMMARY") {
      if (!attached) {
        sendResponse({ ok: false, error: "not attached" });
        return;
      }
      sendResponse({ ok: true, summary: captureSummary() });
      return;
    }

    if (msg?.type === "RUN_ACTION") {
      if (!attached) {
        sendResponse({ ok: false, error: "not attached" });
        return;
      }
      const action = msg.action;
      const args = msg.args || {};

      let result;
      if (action === "highlight") result = highlightSelector(args.selector || "");
      else if (action === "scrollToSelector") result = scrollToSelector(args.selector || "");
      else if (action === "clickSelector") result = clickSelector(args.selector || "");
      else if (action === "readSelection") result = readSelection();
      else result = { ok: false, error: "unknown action" };

      sendResponse(result);
      return;
    }
  });
})();
