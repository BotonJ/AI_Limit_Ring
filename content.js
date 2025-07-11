// Limit Ring v2.3 - content.js (Pin button fix & native UI)

const STORAGE_KEY = 'limitRingState_v2';
const STORAGE_POS_KEY = 'limitRingWindowPos_v2';
let platformConfig = null;
const PLATFORM_CONFIG = {
    'gpt': {
        platformId: 'gpt-4',
        sendButtonSelector: 'button[data-testid="send-button"]',
        textareaSelector: '#prompt-textarea',
    },
    'gemini': {
        platformId: 'gemini-pro',
        textareaSelector: 'div[contenteditable="true"][role="textbox"]',
        sendButtonSelector: 'button.send-button',
    }
};

// --- 1. 初始化 ---
function initialize() {
    if (window.location.hostname.includes('chatgpt.com')) {
        platformConfig = PLATFORM_CONFIG['gpt'];
    } else if (window.location.hostname.includes('gemini.google.com')) {
        platformConfig = PLATFORM_CONFIG['gemini'];
    } else {
        return;
    }
    
    console.log(`Limit Ring [v2.3] 已在 ${platformConfig.platformId} 页面加载。`);
    
    const readyInterval = setInterval(() => {
        if (document.querySelector('main')) {
            clearInterval(readyInterval);
            main();
        }
    }, 1000);
}
// --- 2. 主函数 ---
function main() {
    const container = createFloatingWindow();
    setupDrag(container, container.querySelector('#lr-header'));
    setupMinimize(container, container.querySelector('#lr-minimize-btn'));
    setupTabs(container);
    // 计数功能暂时由 content.js 直接触发，后续可改为更精准的后台确认模式
    setupSendListeners(); 
    setupPinListener(); 

    // 首次加载数据并渲染
    chrome.storage.local.get(STORAGE_KEY, (data) => {
        if (data[STORAGE_KEY]) {
            renderAll(container, data[STORAGE_KEY]);
        }
    });   
}
// --- 3. UI创建与渲染 ---
function createFloatingWindow() {
    const oldContainer = document.getElementById('lr-container');
    if (oldContainer) oldContainer.remove();

    const container = document.createElement('div');
    container.id = 'lr-container';
    container.innerHTML = `
        <div id="lr-header">
            <span class="lr-title">Limit Ring</span>
            <button id="lr-minimize-btn" title="最小化">—</button>
        </div>
        <div id="lr-body">
            <div class="lr-tabs">
                <button class="lr-tab-button active" data-tab="status">状态</button>
                <button class="lr-tab-button" data-tab="pin">Pin</button>
            </div>
            <div id="lr-statusContent" class="lr-tab-content active"></div>
            <div id="lr-pinContent" class="lr-tab-content">
                <ul id="lr-pinList"></ul>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    chrome.storage.local.get(STORAGE_POS_KEY, (data) => {
        if (data[STORAGE_POS_KEY]) {
            container.style.top = data[STORAGE_POS_KEY].top;
            container.style.left = data[STORAGE_POS_KEY].left;
            if (data[STORAGE_POS_KEY].minimized) {
                container.classList.add('minimized');
            }
        }
    });
    
    return container;
}

// ✅ 新增：接收来自background的刷新指令
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'refreshUI') {
        console.log(`接收到UI刷新指令，原因: ${message.reason}`);
        const container = document.getElementById('lr-container');
        if (container) {
            // 从存储中获取最新数据并重新渲染
            chrome.storage.local.get(STORAGE_KEY, (data) => {
                if (data[STORAGE_KEY]) {
                    renderAll(container, data[STORAGE_KEY]);
                }
            });
        }
    }
});

function renderAll(container, state) {
    if (!container || !state) return;
    renderStatus(container.querySelector('#lr-statusContent'), state);
    renderPins(container.querySelector('#lr-pinList'), state.pins);
}

function renderStatus(statusContainer, state) {
    statusContainer.innerHTML = '';
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

        const cardHTML = `<div class="lr-status-card">...</div>`; // (代码与上一版相同，省略)
        statusContainer.innerHTML += `
            <div class="lr-status-card">
                <div class="lr-platform-name">${platformConfig.name}</div>
                <div class="lr-ring-container">
                    <div class="lr-ring-background"></div>
                    <div class="lr-ring-progress" style="--progress: ${ratio}"></div>
                    <div class="lr-ring-text">${platformState.count} / ${platformConfig.limit}</div>
                </div>
                <div class="lr-time-remaining">重置倒计时: ${hours}h ${minutes}m</div>
            </div>`;
    }
}

function renderPins(pinList, pins) {
    pinList.innerHTML = '';
    if (!pins || pins.length === 0) {
        pinList.innerHTML = '<li class="lr-pin-item empty">没有被钉选的信息。</li>';
        return;
    }
    
    [...pins].reverse().forEach(pin => {
        const li = document.createElement('li');
        li.className = 'lr-pin-item';
        li.innerHTML = `
            <div class="lr-pin-text">${escapeHTML(pin.text)}</div>
            <div class="lr-pin-source">from: ${pin.source}</div>
        `;
        pinList.appendChild(li);
    });
}

// --- 4. 交互逻辑 ---
function setupDrag(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;

    handle.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - element.offsetLeft;
        offsetY = e.clientY - element.offsetTop;
        document.onmousemove = onMouseMove;
        document.onmouseup = onMouseUp;
        handle.style.cursor = 'grabbing';
    };

    function onMouseMove(e) {
        if (!isDragging) return;
        let newTop = e.clientY - offsetY;
        let newLeft = e.clientX - offsetX;
        const maxTop = window.innerHeight - element.offsetHeight;
        const maxLeft = window.innerWidth - element.offsetWidth;
        element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
        element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
    }

    function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        document.onmousemove = null;
        document.onmouseup = null;
        handle.style.cursor = 'move';
        chrome.storage.local.set({ [STORAGE_POS_KEY]: { top: element.style.top, left: element.style.left, minimized: element.classList.contains('minimized') } });
    }
}

function setupMinimize(element, button) {
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        element.classList.toggle('minimized');
        const isMinimized = element.classList.contains('minimized');
        chrome.storage.local.get(STORAGE_POS_KEY, (data) => {
            let state = data[STORAGE_POS_KEY] || { top: element.style.top, left: element.style.left };
            state.minimized = isMinimized;
            chrome.storage.local.set({ [STORAGE_POS_KEY]: state });
        });
    });
    
    const header = element.querySelector('#lr-header');
    header.addEventListener('click', () => {
        if (element.classList.contains('minimized')) {
            element.classList.remove('minimized');
            chrome.storage.local.get(STORAGE_POS_KEY, (data) => {
                let state = data[STORAGE_POS_KEY];
                state.minimized = false;
                chrome.storage.local.set({ [STORAGE_POS_KEY]: state });
            });
        }
    });
}

function setupTabs(container) {
    const tabButtons = container.querySelectorAll('.lr-tab-button');
    const tabContents = container.querySelectorAll('.lr-tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const targetTab = button.dataset.tab;
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === `lr-${targetTab}Content`);
            });
        });
    });
}

function setupSendListeners() {
    document.body.addEventListener('click', (e) => {
        if (e.target.closest(platformConfig.sendButtonSelector)) {
            chrome.runtime.sendMessage({ type: 'incrementCount', platform: platformConfig.platformId });
        }
    }, true);
}

// --- 修正后的Pin监听逻辑 ---
function setupPinListener() {
    let pinButton = null;
    document.addEventListener('mouseup', (e) => {
        if (pinButton) {
            pinButton.remove();
            pinButton = null;
        }

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        // 检查是否选中了有效文本
        if (selectedText.length > 5) {
            const range = selection.getRangeAt(0);
            
            // 检查选中区域是否在我们自己的插件UI内部，如果是则不显示Pin按钮
            const pluginContainer = document.getElementById('lr-container');
            if (pluginContainer && pluginContainer.contains(range.commonAncestorContainer)) {
                return;
            }

            const rect = range.getBoundingClientRect();

            pinButton = document.createElement('button');
            pinButton.id = 'limit-ring-pin-button';
            pinButton.textContent = '📌 Pin';
            document.body.appendChild(pinButton);
            
            pinButton.style.top = `${window.scrollY + rect.bottom + 5}px`;
            pinButton.style.left = `${window.scrollX + rect.right - pinButton.offsetWidth / 2}px`;

            pinButton.onclick = (event) => {
                event.stopPropagation();
                chrome.runtime.sendMessage({
                    type: 'pinMessage',
                    text: selectedText,
                    source: platformConfig.platformId
                });
                pinButton.remove();
                pinButton = null;
            };
        }
    });
}

function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// --- 启动脚本 ---
initialize();