const stateBadge = document.getElementById('stateBadge');
const hint = document.getElementById('hint');
const summaryBtn = document.getElementById('summaryBtn');
const resultEl = document.getElementById('result');

function render({ state, connected }) {
  const normalized = state === 'on' || state === 'connecting' ? state : 'off';
  const on = normalized !== 'off';
  stateBadge.textContent = normalized === 'on' ? 'ON' : (normalized === 'connecting' ? 'ON*' : 'OFF');
  stateBadge.className = `badge ${on ? 'on' : 'off'}`;

  if (normalized === 'connecting') {
    hint.textContent = '连接中，正在重连...';
  } else if (normalized === 'on' && connected) {
    hint.textContent = '已连接 relay';
  } else {
    hint.textContent = 'OFF：请在 Options 页面保存配置后启动连接';
  }

  summaryBtn.disabled = true;
  resultEl.textContent = 'endpoint 请在 Options 页面查看与配置';
}

async function getBridgeStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'bridge:status' });
    return {
      state: res?.state,
      connected: !!res?.connected
    };
  } catch {
    return { state: 'off', connected: false };
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
