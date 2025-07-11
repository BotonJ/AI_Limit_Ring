// Limit Ring v2.4 - background.js (with UI refresh message)

const USAGE_LIMITS = {
  'gpt-4': { limit: 40, window: 3 * 60 },
  'gemini-pro': { limit: 100, window: 24 * 60 }
};
const PIN_KEEP_TIME = 60;
const STORAGE_KEY = 'limitRingState_v2';

chrome.runtime.onInstalled.addListener(() => {
  console.log("Limit Ring 插件已安装 (v2.4)。");
  chrome.storage.local.set({
    [STORAGE_KEY]: {
      'gpt-4': { count: 0, start: Date.now() },
      'gemini-pro': { count: 0, start: Date.now() },
      'pins': []
    }
  });
  chrome.alarms.create('periodicCheck', { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'incrementCount') {
    handleIncrement(message.platform, sender.tab);
  } else if (message.type === 'pinMessage') {
    handlePinning(message.text, message.source, sender.tab);
  }
  // 返回true表示我们将异步发送响应
  return true; 
});

async function handleIncrement(platform, tab) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  let state = data[STORAGE_KEY];
  state[platform].count++;
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  // 通知UI刷新
  notifyUI(tab, 'countUpdated');
}

async function handlePinning(text, source, tab) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  let state = data[STORAGE_KEY];
  if (state.pins.length >= 5) {
    state.pins.shift();
  }
  state.pins.push({ text, source, timestamp: Date.now() });
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  // 通知UI刷新
  notifyUI(tab, 'pinAdded');
}

// ✅ 新增：主动通知函数
function notifyUI(tab, reason) {
    if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'refreshUI', reason: reason }, (response) => {
            if (chrome.runtime.lastError) {
                // 如果 content script 不存在或未响应，这里会捕获错误，可以忽略
                // console.log('无法发送消息到tab，可能页面未加载完成。');
            }
        });
    }
}
// --- 周期性检查：重置额度和清理过期的Pin ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodicCheck') {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    let state = data[STORAGE_KEY];
    const now = Date.now();
    let updated = false;

    // 检查并重置各平台额度
    for (const platform in USAGE_LIMITS) {
      const platformState = state[platform];
      const windowMillis = USAGE_LIMITS[platform].window * 60 * 1000;
      if (now - platformState.start >= windowMillis) {
        platformState.count = 0;
        platformState.start = now;
        updated = true;
        console.log(`[${platform}] 额度窗口已重置。`);
      }
    }
    
    // 清理过期的Pin
    const pinKeepMillis = PIN_KEEP_TIME * 60 * 1000;
    const originalPinCount = state.pins.length;
    state.pins = state.pins.filter(pin => (now - pin.timestamp) < pinKeepMillis);
    if (state.pins.length < originalPinCount) {
        updated = true;
        console.log(`已清理 ${originalPinCount - state.pins.length} 条过期Pin。`);
    }

    if (updated) {
      await chrome.storage.local.set({ [STORAGE_KEY]: state });
    }
  }
});