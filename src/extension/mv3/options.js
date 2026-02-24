const STORAGE_KEYS = {
  endpoint: 'relayEndpoint',
  clientId: 'clientId',
  enabled: 'bridgeEnabled'
};
const DEFAULT_ENDPOINT = '';

const endpointInput = document.getElementById('endpoint');
const enabledInput = document.getElementById('enabled');
const clientIdEl = document.getElementById('clientId');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

async function load() {
  const saved = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  endpointInput.value = saved[STORAGE_KEYS.endpoint] || DEFAULT_ENDPOINT;
  enabledInput.checked = saved[STORAGE_KEYS.enabled] === true;
  clientIdEl.textContent = saved[STORAGE_KEYS.clientId] || '(pending...)';
}

function setStatus(text, ok = true) {
  statusEl.textContent = text;
  statusEl.style.color = ok ? '#0a7a31' : '#b00020';
}

saveBtn.addEventListener('click', async () => {
  const endpoint = endpointInput.value.trim() || DEFAULT_ENDPOINT;
  const enabled = !!enabledInput.checked;

  if (enabled && !/^wss?:\/\//i.test(endpoint)) {
    setStatus('启用前请先填写 ws:// 或 wss:// endpoint', false);
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.endpoint]: endpoint,
    [STORAGE_KEYS.enabled]: enabled
  });

  setStatus('已保存，扩展会自动重连。');
});

load().catch((err) => setStatus(`Failed to load options: ${String(err)}`, false));
