// background.js — MV3 service-worker for Whatnot Sniffer (v0.6.1)
// --------------------------------------------------------------
// • Injects a WebSocket tap (ws_tap.js) into every Whatnot page *before*
//   the first socket opens (document_start / MAIN world)
// • Captures API fetches for items, bids, sales, viewers via webRequest
// • Logs WebSocket upgrades (optional) so you can verify the socket URL
// • Stores the last 200 events in chrome.storage for the side-panel
// • Opens the side-panel whenever the toolbar icon is clicked (user gesture)

/* ---------- helpers ---------- */

const log = (pl) => chrome.storage.local.get(['log'], (d = {}) => {
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
    // match lives metadata, items/products lists, purchases/orders, bids, viewers
    if (/\/v1\/lives\/|\/items|\/products|\/purchases|\/orders|\/bids|\/viewers/.test(d.url)) {
      fetch(d.url, { credentials: 'include' })
        .then((r) => r.json())
        .then((j) => {
          send({ kind: 'api', url: d.url, json: j });
          if (Array.isArray(j.items)) send({ kind: 'items', items: j.items });
          if (Array.isArray(j.products)) send({ kind: 'items', items: j.products });
          if (d.url.includes('/purchases') || d.url.includes('/orders') ||
              (j.event && String(j.event).toLowerCase().includes('sold'))) {
            send({ kind: 'sale', sale: j });
          }
        })
        .catch(() => { /* ignore JSON parse errors */ });
    }
  },
  {
    urls: [
      'https://api.whatnot.com/v1/lives/*',
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

/* ---------- Toolbar icon opens the side-panel (user-gesture) ---------- */
chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel?.open && tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Re-inject WebSocket tap and notify content script on each navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' &&
      tab.url?.startsWith('https://www.whatnot.com/')) {
    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      files: ['ws_tap.js']
    }).catch(() => {});
    // trigger content.js to re-scrape & repaint immediately on each navigation
    chrome.tabs.sendMessage(tabId, { kind: 'refresh' });
  }
});


/* ---------- Relay messages from content-script ---------- */
chrome.runtime.onMessage.addListener((pl) => send(pl));
