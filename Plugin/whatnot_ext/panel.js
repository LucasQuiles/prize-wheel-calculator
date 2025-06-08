function parseItems(lines){
  const items=[];
  lines.forEach(l=>{try{const j=JSON.parse(l);if(j.kind==='items'&&Array.isArray(j.items)){
    j.items.forEach(it=>{items.push(it.name||it.title||JSON.stringify(it));});
  }}catch{}});
  return items;
}

function parseBids(lines){
  const bids=[];
  lines.forEach(l=>{try{const j=JSON.parse(l);if(j.kind==='ws_event'&&j.event==='bid'){const a=parseFloat(j.payload?.amount||j.payload?.bid_amount);if(!isNaN(a))bids.push(a);}}catch{}});
  return bids;
}

function parseViewers(lines){
  let count=0;
  lines.forEach(l=>{try{const j=JSON.parse(l);if(j.kind==='api'&&j.url.includes('/viewers')){count=j.json?.viewer_count||j.json?.count||count;}}catch{}});
  return count;
}

function totalRevenue(lines){
  let sum=0;
  lines.forEach(l=>{try{const j=JSON.parse(l);if(j.kind==='sale'){const p=parseFloat(j.sale?.price||j.sale?.amount);if(!isNaN(p))sum+=p;}else if(j.kind==='ws_event'&&j.event==='sold'){const p=parseFloat(j.payload?.price||j.payload?.amount);if(!isNaN(p))sum+=p;}}catch{}});
  return sum;
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

function summarise(items, sales, bids, viewers, revenue){
  const pct = items.length ? ((sales.length/items.length)*100).toFixed(1)+'%' : '—';
  const maxBid = bids.length ? Math.max(...bids) : 0;
  return `\nItems: ${items.length}  Sales: ${sales.length}  Viewers: ${viewers}\nHighest bid: ${maxBid}  Revenue: $${revenue.toFixed(2)}\nSell-through: ${pct}\nLast update: ${new Date().toLocaleTimeString()}`.trim();
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
    document.getElementById('tblItems').innerHTML = items.length ? items.map(i=>`<tr><td>${i}</td></tr>`).join('') : '<tr><td>No items yet…</td></tr>';
    const sales = parseSales(lines);
    document.getElementById('tblSales').innerHTML = sales.length ? sales.map(s=>`<tr><td>${s}</td></tr>`).join('') : '<tr><td>No sales yet…</td></tr>';
    const bids = parseBids(lines);
    const viewers = parseViewers(lines);
    const revenue = totalRevenue(lines);

    // live debug feed (newest first)
    const dbg = lines.slice(-200).reverse().map(l=>{
      try{
        const j=JSON.parse(l);
        return `[${j.kind}] ${j.event||j.topic||j.url||''}`;
      }catch{return l;}
    }).join('\n');
    document.getElementById('debug').textContent = dbg;

    // live debug feed (newest first)
    const dbg = lines.slice(-20).reverse().map(l=>{
      try{
        const j=JSON.parse(l);
        return `[${j.kind}] ${j.event||j.topic||j.url||''}`;
      }catch{return l;}
    }).join('\n');
    document.getElementById('debug').textContent = dbg;

    // summary
    document.getElementById('summary').textContent = summarise(items, sales, bids, viewers, revenue);
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
