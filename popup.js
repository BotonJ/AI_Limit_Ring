// Limit Ring v2.0 - popup.js

const STORAGE_KEY = 'limitRingState_v2';

document.addEventListener('DOMContentLoaded', () => {
    const statusTab = document.getElementById('statusTab');
    const pinTab = document.getElementById('pinTab');
    const statusContent = document.getElementById('statusContent');
    const pinContent = document.getElementById('pinContent');

    // Tab切换逻辑
    statusTab.addEventListener('click', () => {
        statusTab.classList.add('active');
        pinTab.classList.remove('active');
        statusContent.classList.add('active');
        pinContent.classList.remove('active');
    });

    pinTab.addEventListener('click', () => {
        pinTab.classList.add('active');
        statusTab.classList.remove('active');
        pinContent.classList.add('active');
        statusContent.classList.remove('active');
    });
    
    // 监听存储变化，实时更新UI
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes[STORAGE_KEY]) {
            renderAll();
        }
    });

    // 初始化渲染
    renderAll();
});

async function renderAll() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    if (!data[STORAGE_KEY]) return;
    
    const state = data[STORAGE_KEY];
    renderStatus(state);
    renderPins(state.pins);
}

function renderStatus(state) {
    const container = document.getElementById('statusContent');
    container.innerHTML = ''; // 清空旧内容

    // 假设的配置，后续可从配置中读取
    const configs = {
      'gpt-4': { limit: 40, window: 3 * 60, name: 'GPT-4' },
      'gemini-pro': { limit: 100, window: 24 * 60, name: 'Gemini Pro' }
    };
    
    for (const platform of ['gpt-4', 'gemini-pro']) {
        const platformState = state[platform];
        const platformConfig = configs[platform];
        if (!platformState || !platformConfig) continue;

        const ratio = Math.min(1, platformState.count / platformConfig.limit);
        const timeRemaining = Math.max(0, platformState.start + platformConfig.window * 60 * 1000 - Date.now());
        const hours = Math.floor(timeRemaining / 3600000);
        const minutes = Math.floor((timeRemaining % 3600000) / 60000);

        const card = document.createElement('div');
        card.className = 'status-card';
        card.innerHTML = `
            <div class="platform-name">${platformConfig.name}</div>
            <div class="ring-container">
                <div class="ring-background"></div>
                <div class="ring-progress" style="--progress: ${ratio}"></div>
                <div class="ring-text">${platformState.count} / ${platformConfig.limit}</div>
            </div>
            <div class="time-remaining">重置倒计时: ${hours}h ${minutes}m</div>
        `;
        container.appendChild(card);
    }
}

function renderPins(pins) {
    const list = document.getElementById('pinList');
    list.innerHTML = ''; // 清空旧内容
    
    if (pins.length === 0) {
        list.innerHTML = '<li>没有被钉选的信息。</li>';
        return;
    }

    // 从新到旧显示
    [...pins].reverse().forEach(pin => {
        const li = document.createElement('li');
        li.className = 'pin-item';
        li.innerHTML = `
            <div class="pin-text">${escapeHTML(pin.text)}</div>
            <div class="pin-source">from: ${pin.source}</div>
        `;
        list.appendChild(li);
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>"']/g, function(match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match];
    });
}