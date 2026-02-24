const stateBadge = document.getElementById('stateBadge');
const hint = document.getElementById('hint');
const toggleBtn = document.getElementById('toggleBtn');
const summaryBtn = document.getElementById('summaryBtn');
const resultEl = document.getElementById('result');

const STORAGE_KEYS = {
  enabled: 'bridgeEnabled'
};

function render({ enabled, connected }) {
  const on = !!enabled;
  stateBadge.textContent = on ? (connected ? 'ON' : 'ON*') : 'OFF';
  stateBadge.className = `badge ${on ? 'on' : 'off'}`;
  toggleBtn.textContent = on ? 'Disable' : 'Enable';

  if (on && !connected) {
    hint.textContent = '已启用，正在重连...';
  } else if (on && connected) {
    hint.textContent = '已连接 relay';
  } else {
    hint.textContent = '已禁用（请在 Options 配置 endpoint）';
  }

  summaryBtn.disabled = true;
  resultEl.textContent = 'endpoint 请在 Options 页面查看与配置';
}

async function getBridgeStatus() {
  const saved = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const enabled = saved[STORAGE_KEYS.enabled] === true;

  let connected = false;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'bridge:status' });
    connected = !!res?.connected;
  } catch {}

  return { enabled, connected };
}

async function refresh() {
  const state = await getBridgeStatus();
  render(state);
}

toggleBtn.addEventListener('click', async () => {
  const state = await getBridgeStatus();
  const nextEnabled = !state.enabled;
  try {
    await chrome.runtime.sendMessage({ type: 'bridge:set-config', enabled: nextEnabled });
  } catch {
    await chrome.storage.local.set({ [STORAGE_KEYS.enabled]: nextEnabled });
  }
  await refresh();
});

summaryBtn.addEventListener('click', async () => {
  resultEl.textContent = '新版协议不使用 popup 抓取摘要，请通过服务端 /client.html 查看状态与日志。';
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE_KEYS.enabled]) {
    refresh().catch(() => {});
  }
});

refresh().catch((err) => {
  hint.textContent = `初始化失败: ${String(err)}`;
});
