// REST JSON for /v1/lives/*
const ship = (pl) => fetch('http://localhost:5001/ingest', {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(pl)
}).catch(() => {});
const log = (pl) => chrome.storage.local.get(['log'], d => {
  const lines = (d.log || '').split('\n').filter(Boolean);
  lines.push(JSON.stringify(pl));
  if (lines.length > 20) lines.shift();
  chrome.storage.local.set({log: lines.join('\n')});
});
const send = (pl) => { log(pl); ship(pl); };

chrome.webRequest.onCompleted.addListener(
  (d) => {
    if (/\/v1\/lives\/|\/items|\/products|\/purchases/.test(d.url)) {
      fetch(d.url)
        .then(r => r.json())
        .then(j => {
          send({kind:'api', url:d.url, json:j});
          if (Array.isArray(j.items)) send({kind:'items', items:j.items});
          if (Array.isArray(j.products)) send({kind:'items', items:j.products});
          if (d.url.includes('/purchases') || d.url.includes('/orders') || (j.event && j.event.toString().includes('sold'))){
            send({kind:'sale', sale:j});
          }
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

// reopen side panel on icon click
chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel?.open && tab.id) chrome.sidePanel.open({ tabId: tab.id });
});

// show panel again when returning to tracked tab
chrome.tabs.onActivated.addListener((info) => {
  chrome.storage.local.get(['trackedTab'], (d) => {
    if (info.tabId === d.trackedTab && chrome.sidePanel?.open) {
      chrome.sidePanel.open({ tabId: info.tabId });
    }
  });
});
