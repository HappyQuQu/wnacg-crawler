// ── 常量 ────────────────────────────────────────────────────────────
const WS_URL = `ws://${location.host}/ws/progress`;
const API = '/api';

// ── 状态 ────────────────────────────────────────────────────────────
let ws = null;
let wsRetry = 0;
const tasks = {};          // { manga_id: TaskCard }
let navHistory = [];       // 浏览历史（真实 wnacg URL）
let histIdx = -1;
let _navigating = false;   // 是否由 navigate() 主动触发，避免 onload 重复入栈

// ── DOM 引用 ─────────────────────────────────────────────────────────
const frame = document.getElementById('browser-frame');
const urlInput = document.getElementById('url-input');
const loading = document.getElementById('browser-loading');
const taskList = document.getElementById('task-list');
const emptyHint = document.getElementById('empty-hint');
const wsStatus = document.getElementById('ws-status');

// ── WebSocket ────────────────────────────────────────────────────────
function connectWS() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        wsStatus.textContent = '🟢 已连接';
        wsStatus.className = 'ws-badge connected';
        wsRetry = 0;
        // 心跳
        setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
    };

    ws.onclose = () => {
        wsStatus.textContent = '⚪ 未连接';
        wsStatus.className = 'ws-badge disconnected';
        const delay = Math.min(3000 * (++wsRetry), 30000);
        setTimeout(connectWS, delay);
    };

    ws.onmessage = ({ data }) => {
        try {
            const msg = JSON.parse(data);
            handleProgress(msg);
        } catch (_) { }
    };
}

function handleProgress(msg) {
    const { manga_id, stage, progress, total, message } = msg;
    if (!manga_id) return;

    if (!tasks[manga_id]) addTaskCard(manga_id, null, 'running');

    const card = tasks[manga_id];
    if (!card) return;

    switch (stage) {
        case 'info':
            card.setStatus('running');
            card.setDetail('获取漫画信息...');
            break;
        case 'download':
            card.setStatus('running');
            if (typeof progress === 'number' && typeof total === 'number') {
                card.setProgress(progress, total);
            }
            break;
        case 'zip':
            card.setDetail('打包中...');
            break;
        case 'done':
            card.setStatus('done');
            card.setProgress(100, 100);
            card.setDetail('✅ 下载完成');
            break;
        case 'error':
            card.setStatus('error');
            card.setDetail(`❌ ${message || '未知错误'}`);
            break;
    }
}

// ── 任务卡片 ─────────────────────────────────────────────────────────
class TaskCard {
    constructor(mangaId, name, status) {
        this.id = mangaId;
        this.el = this._render(mangaId, name, status);
        this._fill = this.el.querySelector('.task-progress-fill');
        this._ptext = this.el.querySelector('.task-progress-text');
        this._badge = this.el.querySelector('.task-status-badge');
        this._name = this.el.querySelector('.task-name');
        this._detail = this.el.querySelector('.task-detail');
    }

    _render(id, name, status) {
        const div = document.createElement('div');
        div.className = 'task-card';
        div.id = `task-card-${id}`;
        div.innerHTML = `
      <div class="task-card-header">
        <div>
          <div class="task-manga-id">ID: ${id}</div>
          <div class="task-name">${name || '获取中...'}</div>
        </div>
        <span class="task-status-badge status-${status}">${statusLabel(status)}</span>
      </div>
      <div class="task-detail" style="font-size:12px;color:#8892b0;margin-bottom:4px;"></div>
      <div class="task-progress-bar">
        <div class="task-progress-fill"></div>
      </div>
      <div class="task-progress-text">--</div>
      <div class="task-actions">
        <button class="btn-danger" data-id="${id}" data-action="remove">移除</button>
      </div>
    `;
        div.querySelector('[data-action="remove"]').onclick = () => this.remove();
        return div;
    }

    setStatus(status) {
        this._badge.className = `task-status-badge status-${status}`;
        this._badge.textContent = statusLabel(status);
    }

    setProgress(current, total) {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        this._fill.style.width = pct + '%';
        this._ptext.textContent = `${current} / ${total} (${pct}%)`;
    }

    setName(name) { this._name.textContent = name; }
    setDetail(text) { this._detail.textContent = text; }

    remove() {
        fetch(`${API}/tasks/${this.id}`, { method: 'DELETE' }).catch(() => { });
        this.el.remove();
        delete tasks[this.id];
        updateEmpty();
    }
}

function statusLabel(s) {
    return { queued: '排队中', running: '下载中', done: '完成', error: '失败' }[s] || s;
}

function addTaskCard(mangaId, name, status = 'queued') {
    if (tasks[mangaId]) return;
    const card = new TaskCard(mangaId, name, status);
    tasks[mangaId] = card;
    emptyHint.classList.add('hidden');
    taskList.appendChild(card.el);
    return card;
}

function updateEmpty() {
    if (Object.keys(tasks).length === 0) {
        emptyHint.classList.remove('hidden');
    }
}

// ── 添加任务 ─────────────────────────────────────────────────────────
async function addTasks(raw) {
    const ids = raw.split(/[\n,，\s]+/).map(s => s.trim()).filter(Boolean);
    for (const id of ids) {
        if (!id) continue;
        addTaskCard(id, null, 'queued');
        try {
            await fetch(`${API}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manga_id: id }),
            });
        } catch (e) {
            console.error('添加任务失败', e);
        }
    }
}

document.getElementById('btn-add-task').onclick = () => {
    const val = document.getElementById('manga-id-input').value.trim();
    if (!val) return;
    addTasks(val);
    document.getElementById('manga-id-input').value = '';
};

// ── 从 iframe 接收 postMessage（下载按钮注入）─────────────────────
window.addEventListener('message', (e) => {
    if (e.data?.type === 'ADD_DOWNLOAD') {
        const id = String(e.data.manga_id).trim();
        if (id) addTasks(id);
    }
});

// ── 代理浏览器导航 ────────────────────────────────────────────────
function navigate(url, pushHistory = true) {
    loading.classList.remove('hidden');
    url = url.trim();

    // 如果是纯数字，认为是漫画 ID
    if (/^\d+$/.test(url)) {
        url = `https://www.wnacg.com/photos-index-page-1-aid-${url}.html`;
    }
    // 如果不含 http，自动加
    if (!url.startsWith('http')) {
        url = 'https://www.wnacg.com/' + url.replace(/^\//, '');
    }

    _navigating = true;
    frame.src = `/proxy?url=${encodeURIComponent(url)}`;
    urlInput.value = url;

    if (pushHistory) {
        histIdx++;
        navHistory = navHistory.slice(0, histIdx);
        navHistory.push(url);
    }
}

// iframe 每次加载完成：同步地址栏 + 历史
frame.onload = () => {
    loading.classList.add('hidden');
    try {
        const frameHref = frame.contentWindow.location.href;
        const parsed = new URL(frameHref);
        const actualUrl = parsed.searchParams.get('url');
        if (actualUrl) {
            urlInput.value = actualUrl;
            if (!_navigating) {
                // 用户点了 iframe 内链接，手动入栈
                histIdx++;
                navHistory = navHistory.slice(0, histIdx);
                navHistory.push(actualUrl);
            }
        }
    } catch (_) { /* 跨域或其他异常不处理 */ } finally {
        _navigating = false;
    }
};

document.getElementById('btn-go').onclick = () => navigate(urlInput.value);
document.getElementById('btn-home').onclick = () => navigate('https://www.wnacg.com/');
urlInput.addEventListener('keydown', e => e.key === 'Enter' && navigate(urlInput.value));

document.getElementById('btn-back').onclick = () => {
    if (histIdx > 0) {
        histIdx--;
        const prev = navHistory[histIdx];
        _navigating = true;
        frame.src = `/proxy?url=${encodeURIComponent(prev)}`;
        urlInput.value = prev;
    }
};

document.getElementById('btn-forward').onclick = () => {
    if (histIdx < navHistory.length - 1) {
        histIdx++;
        const next = navHistory[histIdx];
        _navigating = true;
        frame.src = `/proxy?url=${encodeURIComponent(next)}`;
        urlInput.value = next;
    }
};

// ── 拖拽分隔线 ───────────────────────────────────────────────────
const divider = document.getElementById('divider');
const browserPanel = document.getElementById('browser-panel');
const downloadPanel = document.getElementById('download-panel');

divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = browserPanel.offsetWidth;

    const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const total = browserPanel.parentElement.offsetWidth;
        const newW = Math.max(300, Math.min(startW + dx, total - 300));
        browserPanel.style.flex = `0 0 ${newW}px`;
        downloadPanel.style.flex = '1';
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
});

// ── 设置弹窗 ────────────────────────────────────────────────────────
const modal = document.getElementById('settings-modal');
const proxyFs = document.getElementById('proxy-fields');
const cfgProxy = document.getElementById('cfg-is-proxy');

document.getElementById('btn-settings').onclick = () => { loadConfig(); modal.classList.remove('hidden'); };
document.getElementById('btn-close-settings').onclick = () => modal.classList.add('hidden');
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

cfgProxy.onchange = () => {
    proxyFs.classList.toggle('hidden', !cfgProxy.checked);
};

async function loadConfig() {
    try {
        const res = await fetch(`${API}/config`);
        const cfg = await res.json();
        document.getElementById('cfg-max-thread').value = cfg.max_thread ?? 10;
        document.getElementById('cfg-is-zip').checked = cfg.is_zip ?? true;
        document.getElementById('cfg-is-proxy').checked = cfg.proxy?.is_proxy ?? false;
        document.getElementById('cfg-proxy-addr').value = cfg.proxy?.address ?? '127.0.0.1';
        document.getElementById('cfg-proxy-port').value = cfg.proxy?.port ?? 7890;
        proxyFs.classList.toggle('hidden', !cfg.proxy?.is_proxy);
    } catch (_) { }
}

document.getElementById('btn-save-settings').onclick = async () => {
    const cfg = {
        max_thread: parseInt(document.getElementById('cfg-max-thread').value) || 10,
        is_zip: document.getElementById('cfg-is-zip').checked,
        proxy: {
            is_proxy: document.getElementById('cfg-is-proxy').checked,
            address: document.getElementById('cfg-proxy-addr').value,
            port: parseInt(document.getElementById('cfg-proxy-port').value) || 7890,
        }
    };
    await fetch(`${API}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
    });
    modal.classList.add('hidden');
};

// ── 初始化 ──────────────────────────────────────────────────────────
connectWS();
navigate('https://www.wnacg.com/');

// 拉取已有任务（刷新页面后恢复）
fetch(`${API}/tasks`).then(r => r.json()).then(list => {
    list.forEach(t => addTaskCard(t.manga_id, t.name, t.status));
}).catch(() => { });
