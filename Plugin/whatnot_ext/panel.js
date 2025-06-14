/* panel.js — UI controller for Whatnot Sniffer side‑panel (v0.5.3)
   Renders live auction stats and lets the user begin tracking or save the log.
   The panel already opens via the toolbar icon (open_panel_on_action_click),
   so we *do not* call chrome.sidePanel.open() from here. */

/* ---------- parsing helpers ---------- */
function parseInfo(lines){
  let host='\u2014', title='\u2014';
  lines.forEach(l => {
    try {
      const j = JSON.parse(l);
      if (j.kind==='api' && j.url.includes('/lives/') && j.json.page){
        host  = j.json.page.hostUsername || host;
        title = j.json.page.title        || title;
      }
      if (j.kind==='ws_event' && j.event==='livestream_update'){
        host  = j.payload.hostUsername || host;
        title = j.payload.title        || title;
      }
    } catch {}
  });
  return { host, title };
}

function parseBreakCounts(lines){
  const map = {};
  lines.forEach(l => {
    try {
      const j = JSON.parse(l);
      if (j.kind==='ws_event' && j.event==='break_updated'){
        const t = j.payload.title;
        const sold  = parseInt(j.payload.filled_break_spots) || 0;
        const total = parseInt(j.payload.total_break_spots)  || 0;
        if (t) map[t] = { sold, total };
      }
    } catch {}
  });
  return map;
}

function parseItems(lines){
  const items=[];
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='items' && Array.isArray(j.items)){
      j.items.forEach(it=>{
        const name=it.name||it.title||JSON.stringify(it);
        if(!items.includes(name)) items.push(name);
      });
    }
    if(j.kind==='ws_event'&&j.event==='product_added'){
      const name=j.payload?.product?.name;
      if(name && !items.includes(name)) items.push(name);
    }
    if(j.kind==='ws_event'&&j.event==='product_updated'){
      const name=j.payload?.product?.name;
      if(name && !items.includes(name)) items.push(name);
    }
  }catch(e){}});
  return items;
}

function parseBids(lines){
  const bids=[];
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if (j.kind==='ws_event' && j.event==='bid'){
      const a=parseFloat(j.payload.amount);
      if(!isNaN(a)){
        bids.push({ amount:a, bidder:j.payload.bidder||'\u2014' });
      }
    }
  }catch{} });
  return bids;
}


function parseViewers(lines){
  let count = 0;
  lines.forEach(l => {
    try {
      const j = JSON.parse(l);
      if (j.kind === 'api' && j.url?.includes('/viewers')) {
        count = j.json?.viewer_count || j.json?.count || count;
      }
      if (j.kind === 'ws_event' && j.event === 'livestream_view_count_updated') {
        count = j.payload?.viewCount || count;
      }
      if (j.kind==='ws_event' && j.event==='livestream_update'){
        const v=j.payload?.activeViewers;
        if(typeof v==='number') count=v;
      }
    } catch (e) {}
  });
  return count;
}


function viewerHistory(lines){
  const arr=[];
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='api' && j.url?.includes('/viewers')){
      const c=j.json?.viewer_count||j.json?.count;
      if(typeof c==='number') arr.push(c);
    }
  }catch(e){}});
  return arr;
}

function totalRevenue(lines){
  let sum=0;
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='sale'){
      const p=parseFloat(j.sale?.price||j.sale?.amount);
      if(!isNaN(p)) sum+=p;
    }else if(j.kind==='ws_event' && j.event==='sold'){
      const p=parseFloat(j.payload?.price||j.payload?.amount);
      if(!isNaN(p)) sum+=p;
    }
  }catch(e){}});
  return sum;
}

function parseSales(lines){
  const sales=[];
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if (j.kind==='ws_event' && j.event==='sold'){
      const name  = j.payload.item.name || '\u2014';
      const price = parseFloat(j.payload.price) || 0;
      const buyer = j.payload.buyer || '\u2014';
      sales.push({ name, price, buyer });
    }
  }catch{} });
  return sales;
}

function summarise(items,sales,bids,viewers,revenue){
  const pct = items.length ? ((sales.length/items.length)*100).toFixed(1)+'%' : '—';
  const maxBid = bids.length ? Math.max(...bids.map(b=>b.amount)) : 0;
  return `Items: ${items.length}  Sales: ${sales.length}  Viewers: ${viewers}\n`+
         `Highest bid: ${maxBid}  Revenue: $${revenue.toFixed(2)}\n`+
         `Sell-through: ${pct}\n`+
         `Last update: ${new Date().toLocaleTimeString()}`;
}

function downloadLog(logStr){
  const blob = new Blob([logStr], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const fname = `whatnot_auction_${Date.now()}.json`;
  chrome.downloads.download({url, filename: fname, saveAs: true});
}

/* ---------- main update loop ---------- */
function update(){
  chrome.storage.local.get(['log'], d=>{
    const lines = (d.log||'').split('\n').filter(Boolean);

    const { host, title } = parseInfo(lines);
    document.getElementById('hostName').textContent   = host;
    document.getElementById('streamTitle').textContent= title;

    const items    = parseItems(lines);
    const sales    = parseSales(lines);
    const breakMap = parseBreakCounts(lines);

    Object.keys(breakMap).forEach(t=>{
      if (!items.includes(t)) items.push(t);
    });

    const counts = {};
    items.forEach(i=>{ counts[i] = breakMap[i]?.sold||0; });
    sales.forEach(s=>{ if(counts[s.name]!=null) counts[s.name]++; });

    document.getElementById('tblItems').innerHTML =
      items.length
        ? items.map(i=>`<tr><td>${i}</td><td>${counts[i]}</td></tr>`).join('')
        : '<tr><td colspan="2">No items yet…</td></tr>';

    const remaining = Object.values(breakMap).reduce((sum,b)=>sum+(b.total-b.sold), items.length?0:0);
    document.getElementById('remaining').textContent = `Items Remaining: ${remaining}`;

    document.getElementById('tblSales').innerHTML =
      sales.length
        ? sales.map(s=>`<tr><td>${s.name}</td><td>${s.buyer}</td><td>$${s.price.toFixed(2)}</td></tr>`).join('')
        : '<tr><td colspan="3">No sales yet…</td></tr>';
    const avg = sales.length
      ? (sales.reduce((sum,s)=>sum+s.price,0)/sales.length).toFixed(2)
      : '0.00';
    document.getElementById('avgPrice').textContent = `Average Sale Price: $${avg}`;

    const bids = parseBids(lines);
    document.getElementById('tblBids').innerHTML =
      bids.length
        ? bids.map(b=>`<tr><td>$${b.amount.toFixed(2)}</td><td>${b.bidder}</td></tr>`).join('')
        : '<tr><td colspan="2">No bids yet…</td></tr>';

    const viewers = parseViewers(lines);
    document.getElementById('viewerCount').textContent = viewers;

    const dbg = lines.slice(-200).reverse().map(l => {
      try { const j = JSON.parse(l); return `[${j.kind}] ${j.event || j.topic || j.url || ''}`; }
      catch { return l; }
    }).join('\n');
    document.getElementById('debug').textContent = dbg;

    document.getElementById('summary').textContent =
      summarise(items, sales, bids, viewers, totalRevenue(lines));
  });
}

chrome.storage.onChanged.addListener(c=>{ if(c.log) update(); });
update();

// ensure the panel re-renders at least once per second
setInterval(update, 1000);

/* ---------- Track & Save buttons ---------- */

document.getElementById('startBtn').addEventListener('click', () => {
  // clear old session data immediately
  chrome.storage.local.set({ log: '' });
  const url = document.getElementById('auctionUrl').value.trim();
  const statusEl = document.getElementById('status');

  const openAndTrack = (tab) => {
    chrome.storage.local.set({ trackedTab: tab.id });
    // panel already open — no chrome.sidePanel.open() needed
  };

  if (url) {
    chrome.tabs.create({ url }, (tab) => {
      openAndTrack(tab);
      statusEl.textContent = 'Opening ' + url + ' …';
    });
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        openAndTrack(tabs[0]);
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
