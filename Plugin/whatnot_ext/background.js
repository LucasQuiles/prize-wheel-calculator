// background.js — MV3 service-worker for Whatnot Sniffer (v0.6.1)
// --------------------------------------------------------------
// • Injects a WebSocket tap (ws_tap.js) into every Whatnot page *before*
//   the first socket opens (document_start / MAIN world)
// • Captures API fetches for items, bids, sales, viewers via webRequest
// • Logs WebSocket upgrades (optional) so you can verify the socket URL
// • Stores the last 200 events in chrome.storage for the side-panel
//   and ships them to the optional localhost ingest endpoint
// • Opens the side-panel whenever the toolbar icon is clicked (user gesture)

/* ---------- helpers ---------- */
const ship = (pl) => fetch('http://localhost:5001/ingest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(pl)
}).catch(() => { /* ignore if server is down */ });

const log = (pl) => chrome.storage.local.get(['log'], (d = {}) => {
  const lines = (d.log || '').split('\n').filter(Boolean);
  lines.push(JSON.stringify(pl));
  if (lines.length > 200) lines.shift();
  chrome.storage.local.set({ log: lines.join('\n') });
});

const send = (pl) => {
  log(pl);
  ship(pl);
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
  { urls: ['https://api.whatnot.com/*'], types: ['xmlhttprequest', 'fetch'] }
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

/* ---------- Inject WebSocket patch into Whatnot pages ---------- */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url?.startsWith('https://www.whatnot.com/')) {
    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      files: ['ws_tap.js']
    })
    .catch(() => {
      // ignore failures (e.g. non-matching frame or missing file)
    });
  }
});

/* ---------- Relay messages from content-script ---------- */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.kind) {
    send(msg);
  }
  // Return false so the SW can go idle
  return false;
});
