
chrome.webRequest.onCompleted.addListener(
  (d) => {
    if (/api\\.whatnot\\.com\\/v1\\/lives/.test(d.url)) {
      fetch(d.url)
        .then(r => r.json())
        .then(j => fetch('http://localhost:5001/ingest', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'api',url:d.url,json:j})}))
        .catch(() => {});
    }
  },
  {urls: ["https://api.whatnot.com/*"]}
);

chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.url.startsWith('wss://')) {
      fetch('http://localhost:5001/ingest', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'ws',url:d.url})});
    }
  },
  {urls: ["wss://*/*"]}
);
