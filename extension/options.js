const STORAGE_KEYS = {
  endpoint: 'relayEndpoint',
  clientId: 'clientId',
  enabled: 'bridgeEnabled',
  executionEnabled: 'executionEnabled',
  executionAllowlist: 'executionAllowlist',
  executionCapabilities: 'executionCapabilities'
};
const DEFAULT_ENDPOINT = '';
const DEFAULT_EXECUTION_CAPABILITIES = {
  read: true,
  runJs: false
};

const endpointInput = document.getElementById('endpoint');
const enabledInput = document.getElementById('enabled');
const clientIdEl = document.getElementById('clientId');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

const executionEnabledInput = document.getElementById('executionEnabled');
const allowlistInput = document.getElementById('allowlist');
const capabilityReadInput = document.getElementById('capRead');
const capabilityRunJsInput = document.getElementById('capRunJs');

function setStatus(text, ok = true) {
  statusEl.textContent = text;
  statusEl.style.color = ok ? '#0a7a31' : '#b00020';
}

function parseAllowlist(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
}

function formatAllowlist(items) {
  if (!Array.isArray(items)) return '';
  return items.map((i) => String(i || '').trim()).filter(Boolean).join('\n');
}

function normalizeCapabilities(input) {
  return {
    ...DEFAULT_EXECUTION_CAPABILITIES,
    ...(input && typeof input === 'object' ? input : {})
  };
}

async function loadFromWorkerStatus() {
  try {
    const st = await chrome.runtime.sendMessage({ type: 'bridge:status' });
    if (st && typeof st === 'object') {
      endpointInput.value = st.endpoint || '';
      enabledInput.checked = st.enabled === true;
      clientIdEl.textContent = st.clientId || '(pending...)';

      executionEnabledInput.checked = st.executionEnabled !== false;
      allowlistInput.value = formatAllowlist(st.executionAllowlist || []);
      const caps = normalizeCapabilities(st.executionCapabilities);
      capabilityReadInput.checked = caps.read === true;
      capabilityRunJsInput.checked = caps.runJs === true;
      return true;
    }
  } catch {}
  return false;
}

async function load() {
  const ok = await loadFromWorkerStatus();
  if (!ok) {
    endpointInput.value = DEFAULT_ENDPOINT;
    enabledInput.checked = false;
    clientIdEl.textContent = '(pending...)';

    executionEnabledInput.checked = true;
    allowlistInput.value = '';
    const caps = DEFAULT_EXECUTION_CAPABILITIES;
    capabilityReadInput.checked = caps.read;
    capabilityRunJsInput.checked = caps.runJs;
  }
}

saveBtn.addEventListener('click', async () => {
  const endpoint = endpointInput.value.trim() || DEFAULT_ENDPOINT;
  const enabled = !!enabledInput.checked;

  if (enabled && !/^wss?:\/\//i.test(endpoint)) {
    setStatus('启用前请先填写 ws:// 或 wss:// endpoint', false);
    return;
  }

  const executionEnabled = executionEnabledInput.checked !== false;
  const executionAllowlist = parseAllowlist(allowlistInput.value);
  const executionCapabilities = {
    read: capabilityReadInput.checked === true,
    runJs: capabilityRunJsInput.checked === true
  };

  if (!executionCapabilities.read) {
    setStatus('注意：关闭 read 后，v0 execute-in-tab 的只读动作会全部被拒绝。', false);
  }

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'bridge:set-config',
      endpoint,
      enabled,
      executionEnabled,
      executionAllowlist,
      executionCapabilities
    });
    if (!res?.ok) {
      setStatus(`保存失败: ${res?.error || 'unknown'}`, false);
      return;
    }

    endpointInput.value = res.endpoint || '';
    enabledInput.checked = res.enabled === true;
    clientIdEl.textContent = res.clientId || '(pending...)';

    executionEnabledInput.checked = res.executionEnabled !== false;
    allowlistInput.value = formatAllowlist(res.executionAllowlist || []);

    const caps = normalizeCapabilities(res.executionCapabilities);
    capabilityReadInput.checked = caps.read === true;
    capabilityRunJsInput.checked = caps.runJs === true;

    setStatus('已保存，扩展会自动重连。');
  } catch (err) {
    setStatus(`保存失败: ${String(err)}`, false);
  }
});

load().catch((err) => setStatus(`加载失败: ${String(err)}`, false));
