function parseItems(lines){
  const items=[];
  lines.forEach(l=>{try{const j=JSON.parse(l);if(j.kind==='items'&&Array.isArray(j.items)){
    j.items.forEach(it=>{items.push(it.name||it.title||JSON.stringify(it));});
  }}catch{}});
  return items;
}

function parseSales(lines){
  const sales=[];
  lines.forEach(l=>{
    try{
      const j=JSON.parse(l);
      if(j.kind==='sale'){
        const s=j.sale;
        const name=s?.item?.name||s?.item?.title||'';
        sales.push(name||JSON.stringify(s));
      }else if(j.kind==='ws_event' && j.event==='sold'){
        const name=j.payload?.item?.name||j.payload?.item?.title||'Sold event';
        sales.push(name);
      }
    }catch{}
  });
  return sales;
}

function summarise(items, sales){
  const pct = items.length ? ((sales.length/items.length)*100).toFixed(1)+'%' : '—';
  return `\nItems found : ${items.length}\nSold items  : ${sales.length}\nSell-through: ${pct}\nLast update : ${new Date().toLocaleTimeString()}`.trim();
}

function downloadLog(logStr){
  const blob = new Blob([logStr], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const fname = `whatnot_auction_${Date.now()}.json`;
  chrome.downloads.download({url, filename: fname, saveAs: true});
}

function update(){
  chrome.storage.local.get(['log'], d=>{
    const log = d.log || '';
    const lines = log.split('\n').filter(Boolean);

    // raw log
    document.getElementById('log').textContent = log || 'No data yet…';

    // computed lists
    const items = parseItems(lines);
    document.getElementById('items').innerHTML = items.length ? items.map(i=>`<div>${i}</div>`).join('') : 'No items yet…';
    const sales = parseSales(lines);
    document.getElementById('sales').innerHTML = sales.length ? sales.map(s=>`<div>${s}</div>`).join('') : 'No sales yet…';

    // live debug feed (newest first)
    const dbg = lines.slice(-20).reverse().map(l=>{
      try{
        const j=JSON.parse(l);
        return `[${j.kind}] ${j.event||j.topic||j.url||''}`;
      }catch{return l;}
    }).join('\n');
    document.getElementById('debug').textContent = dbg;

    // summary
    document.getElementById('summary').textContent = summarise(items, sales);
  });
}

chrome.storage.onChanged.addListener(c=>{if(c.log)update();});
update();

document.getElementById('startBtn').addEventListener('click', () => {
  const url = document.getElementById('auctionUrl').value.trim();
  const statusEl = document.getElementById('status');

  const openPanel = (tab) => {
    chrome.storage.local.set({ trackedTab: tab.id });
    if (chrome.sidePanel?.open) chrome.sidePanel.open({ tabId: tab.id });
  };

  if (url) {
    chrome.tabs.create({ url }, (tab) => {
      openPanel(tab);
      statusEl.textContent = 'Opening ' + url + ' …';
    });
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        openPanel(tabs[0]);
        statusEl.textContent = 'Tracking active tab: ' + tabs[0].url;
      } else {
        statusEl.textContent = 'No active tab to track.';
      }
    });
  }
});

document.getElementById('saveBtn').addEventListener('click', () => {
  chrome.storage.local.get(['log'], d => downloadLog(d.log || '[]'));
});
