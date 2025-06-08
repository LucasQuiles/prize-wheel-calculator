
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
    if (d.url.includes('/v1/lives/')) {
      fetch(d.url)
        .then(r => r.json())
        .then(j => send({kind:'api',url:d.url,json:j}))
        .catch(() => {});
    }
  },
  {urls: ["https://api.whatnot.com/*"], types: ["xmlhttprequest"]}
);

// WebSocket upgrade URLs
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.type === 'websocket') {
      send({kind:'ws',url:d.url});
    }
  },
  {urls: ["<all_urls>"], types: ["websocket"]}
);
