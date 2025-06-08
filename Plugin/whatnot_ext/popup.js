
chrome.storage.local.get(['log'], (d) => {
  document.getElementById('log').textContent = d.log || 'No data yet…';
});
chrome.storage.onChanged.addListener((c) => {
  if (c.log) document.getElementById('log').textContent = c.log.newValue;
});
