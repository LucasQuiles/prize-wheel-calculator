// REST JSON for /v1/lives/*
const ship = (pl) =>
  fetch('http://localhost:5001/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pl),
  }).catch(() => {});

const log = (pl) =>
  chrome.storage.local.get(['log'], (d) => {
    const lines = (d.log || '').split('\n').filter(Boolean);
    lines.push(JSON.stringify(pl));
    if (lines.length > 20) lines.shift();
    chrome.storage.local.set({ log: lines.join('\n') });
  });

const send = (pl) => {
  log(pl);
  ship(pl);
};

/* --------------------------------------------------------------------------
   Side-panel tracking
   -------------------------------------------------------------------------- */
let trackedTabId = null;

chrome.storage.local.get(['trackedTab'], (d) => {
  trackedTabId = d.trackedTab || null;
});

chrome.storage.onChanged.addListener((ch) => {
  if (ch.trackedTab) trackedTabId = ch.trackedTab.newValue;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === trackedTabId && changeInfo.status === 'complete') {
    chrome.sidePanel?.open?.({ tabId });
  }
});

/* Open panel on extension install / startup */
function enablePanelOnClick() {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(enablePanelOnClick);
chrome.runtime.onStartup.addListener(enablePanelOnClick);

/* --------------------------------------------------------------------------
   Network listeners
   -------------------------------------------------------------------------- */

// REST responses for /v1/lives/*
chrome.webRequest.onCompleted.addListener(
  (d) => {
    if (d.url.includes('/v1/lives/')) {
      fetch(d.url)
        .then((r) => r.json())
        .then((j) => {
          send({ kind: 'api', url: d.url, json: j });
          if (Array.isArray(j.items)) send({ kind: 'items', items: j.items });
          if (j.event && j.event.toString().includes('sold'))
            send({ kind: 'sale', sale: j });
        })
        .catch(() => {});
    }
  },
  { urls: ['https://api.whatnot.com/*'], types: ['xmlhttprequest'] }
);

// WebSocket upgrade URLs
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.type === 'websocket') {
      send({ kind: 'ws', url: d.url });
    }
  },
  { urls: ['<all_urls>'], types: ['websocket'] }
);
