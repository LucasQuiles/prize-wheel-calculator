// background.js — MV3 service-worker for Whatnot Sniffer (v0.6.2)
// --------------------------------------------------------------
// • Injects ws_tap.js into every Whatnot page before the first socket opens
// • Captures API requests (items, bids, purchases, viewers) via webRequest
// • Stores last 200 events in chrome.storage for the side-panel
// • Opens side-panel on toolbar-click (user gesture)

/* ---------- helpers ---------- */
const log = (pl) =>
  chrome.storage.local.get(['log'], (d = {}) => {
    const lines = (d.log || '').split('\n').filter(Boolean);
    lines.push(JSON.stringify(pl));
    if (lines.length > 200) lines.shift();
    chrome.storage.local.set({ log: lines.join('\n') });
  });

const send = (pl) => {
  log(pl);
};

/* ---------- lifecycle ---------- */
self.addEventListener('install', () => console.log('[Whatnot Sniffer] SW installed'));
self.addEventListener('activate', () => console.log('[Whatnot Sniffer] SW activated'));

/* ---------- API traffic capture ---------- */
chrome.webRequest.onCompleted.addListener(
  (d) => {
    if (/\/v1\/lives\/|\/items|\/products|\/purchases|\/orders|\/bids|\/viewers/.test(d.url)) {
      fetch(d.url, { credentials: 'include' })
        .then((r) => r.json())
        .then((j) => {
          send({ kind: 'api', url: d.url, json: j });
          if (Array.isArray(j.items))    send({ kind: 'items', items: j.items });
          if (Array.isArray(j.products)) send({ kind: 'items', items: j.products });
          if (j.event && String(j.event).toLowerCase().includes('sold')) {
            send({ kind: 'sale', sale: j });
          }
          const arr = Array.isArray(j)
            ? j
            : Array.isArray(j.purchases)
            ? j.purchases
            : null;
          if (arr) {
            arr.forEach((p) => send({ kind: 'sale', sale: p }));
          }
        })
        .catch(() => { /* ignore JSON parse errors */ });
    }
  },
  {
    urls: [
      'https://api.whatnot.com/v1/lives/*',
      'https://api.whatnot.com/v1/lives/*/purchases*',
      'https://api.whatnot.com/v1/lives/*/orders*',
      'https://api.whatnot.com/v1/lives/*/bids*',
      'https://api.whatnot.com/v1/lives/*/viewers*',
      'https://api.whatnot.com/v1/lives/*/products*'
    ],
    types: ['xmlhttprequest']
  }
);

/* ---------- WebSocket upgrade notifications (optional) ---------- */
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.type === 'websocket') {
      send({ kind: 'ws', url: d.url });
    }
  },
  { urls: ['<all_urls>'], types: ['websocket'] }
);

/* ---------- Toolbar icon opens the side-panel (user gesture) ---------- */
chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel?.open && tab.id) {
    chrome.storage.local.set({ log: '' });
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

/* ---------- Inject WebSocket tap + refresh on navigation ---------- */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url?.startsWith('https://www.whatnot.com/')) {
    chrome.scripting
      .executeScript({
        target: { tabId, allFrames: false },
        world: 'MAIN',
        files: ['ws_tap.js']
      })
      .catch(() => { /* ignore */ });
    chrome.tabs.sendMessage(tabId, { kind: 'refresh' });
  }
});

/* ---------- Relay messages from content-script ---------- */
chrome.runtime.onMessage.addListener((pl) => {
  send(pl);
});
