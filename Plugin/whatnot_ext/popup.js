
function updateLogDisplay(logStr) {
  const logEl = document.getElementById('log');
  const previewEl = document.getElementById('preview');
  logEl.textContent = logStr || 'No data yet…';
  if (logStr) {
    const lines = logStr.split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    if (last) {
      try {
        previewEl.textContent = JSON.stringify(JSON.parse(last), null, 2);
      } catch {
        previewEl.textContent = last;
      }
    }
  }
}

chrome.storage.local.get(['log'], (d) => {
  updateLogDisplay(d.log || '');
});
chrome.storage.onChanged.addListener((c) => {
  if (c.log) updateLogDisplay(c.log.newValue);
});

document.getElementById('startBtn').addEventListener('click', () => {
  const url = document.getElementById('auctionUrl').value.trim();
  const statusEl = document.getElementById('status');
  if (url) {
    chrome.tabs.create({ url });
    statusEl.textContent = 'Opening ' + url + ' …';
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        statusEl.textContent = 'Tracking active tab: ' + tabs[0].url;
      } else {
        statusEl.textContent = 'No active tab to track.';
      }
    });
  }
});
