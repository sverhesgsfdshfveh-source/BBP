const stateBadge = document.getElementById('stateBadge');
const hint = document.getElementById('hint');
const summaryBtn = document.getElementById('summaryBtn');
const resultEl = document.getElementById('result');

function render({ enabled, connected }) {
  const on = !!enabled;
  stateBadge.textContent = on ? (connected ? 'ON' : 'ON*') : 'OFF';
  stateBadge.className = `badge ${on ? 'on' : 'off'}`;

  if (on && !connected) {
    hint.textContent = '已启用，正在重连...';
  } else if (on && connected) {
    hint.textContent = '已连接 relay';
  } else {
    hint.textContent = '请在 Options 页面配置 endpoint 与连接状态';
  }

  summaryBtn.disabled = true;
  resultEl.textContent = 'endpoint 请在 Options 页面查看与配置';
}

async function getBridgeStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'bridge:status' });
    return {
      enabled: !!res?.enabled,
      connected: !!res?.connected
    };
  } catch {
    return { enabled: false, connected: false };
  }
}

async function refresh() {
  const state = await getBridgeStatus();
  render(state);
}

summaryBtn.addEventListener('click', async () => {
  resultEl.textContent = '新版协议不使用 popup 抓取摘要，请通过服务端 /client.html 查看状态与日志。';
});

refresh().catch((err) => {
  hint.textContent = `初始化失败: ${String(err)}`;
});
