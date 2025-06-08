/* panel.js — UI controller for Whatnot Sniffer side‑panel (v0.5.3)
   Renders live auction stats and lets the user begin tracking or save the log.
   The panel already opens via the toolbar icon (open_panel_on_action_click),
   so we *do not* call chrome.sidePanel.open() from here. */

/* ---------- parsing helpers ---------- */
function parseItems(lines){
  const items=[];
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='items' && Array.isArray(j.items)){
      j.items.forEach(it=>items.push(it.name||it.title||JSON.stringify(it)));
    }
  }catch(e){}});
  return items;
}

function parseBids(lines){
  const bids = [];
  lines.forEach(l => {
    try {
      const j = JSON.parse(l);
      if (j.kind === 'ws_event' && (j.event === 'bid' || j.event === 'new_bid')) {
        const a = parseFloat(j.payload?.amount || j.payload?.bid_amount);
        if (!isNaN(a)) bids.push(a);
      }
    } catch (e) {}
  });
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
  const sales = [];
  lines.forEach(l => {
    try {
      const j = JSON.parse(l);
      if (j.kind === 'sale' ||
          (j.kind === 'ws_event' &&
           (j.event === 'sold' || j.event === 'payment_succeeded'))) {
        const s = j.sale || j.payload;
        // (1) Name: could be in item, product or top-level
        const name = s?.item?.name
                   || s?.item?.title
                   || s?.product?.name
                   || s?.product?.title
                   || s?.name
                   || '—';
        // (2) Price: try price, amount, soldPrice.amount or soldPriceCents
        const rawPrice = s?.price
                      ?? s?.amount
                      ?? (s?.soldPrice?.amount)
                      ?? (typeof s?.soldPriceCents === 'number'
                          ? s.soldPriceCents/100
                          : undefined);
        const price = parseFloat(rawPrice) || 0;
        // (3) Buyer: could live in buyer, bidder, user or purchaserUser
        const buyer = s?.buyer?.username
                   || s?.bidder?.username
                   || s?.user?.username
                   || s?.purchaserUser?.username
                   || '—';
        sales.push({ name, price, buyer });
      }
    } catch (e) {}
  });
  return sales;
}

function summarise(items,sales,bids,viewers,revenue){
  const pct = items.length ? ((sales.length/items.length)*100).toFixed(1)+'%' : '—';
  const maxBid = bids.length ? Math.max(...bids) : 0;
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
    const log = d.log || '';
    const lines = log.split('\n').filter(Boolean);

    // hide raw JSON—handled via debug feed
    document.getElementById('log').textContent = '';

    // items table
    const items = parseItems(lines);
    document.getElementById('tblItems').innerHTML = items.length ?
      items.map(i=>`<tr><td>${i}</td></tr>`).join('') :
      '<tr><td>No items yet…</td></tr>';

    // sales table
    const sales = parseSales(lines);
    document.getElementById('tblSales').innerHTML = sales.length
      ? sales.map(s =>
          `<tr>
             <td>${s.name}</td>
             <td>${s.buyer}</td>
             <td>$${s.price.toFixed(2)}</td>
           </tr>`
        ).join('')
      : '<tr><td colspan="3">No sales yet…</td></tr>';

    // update average price
    const avg = sales.length
      ? (sales.reduce((sum, s) => sum + s.price, 0) / sales.length).toFixed(2)
      : '0.00';
    document.getElementById('avgPrice').textContent = `Average Sale Price: $${avg}`;

    // derived stats
    const bids = parseBids(lines);
    const viewers = parseViewers(lines);
    const viewerHist = viewerHistory(lines);
    const revenue = totalRevenue(lines);

    // bids table
    document.getElementById('tblBids').innerHTML = bids.length ?
      bids.map(b=>`<tr><td>${b}</td></tr>`).join('') :
      '<tr><td>No bids yet…</td></tr>';

    // viewers table
    document.getElementById('tblViewers').innerHTML = viewerHist.length ?
      viewerHist.map(v=>`<tr><td>${v}</td></tr>`).join('') :
      '<tr><td>No viewer data…</td></tr>';

    // debug feed (newest first)
    const dbg = lines.slice(-200).reverse().map(l=>{
      try{
        const j=JSON.parse(l);
        return `[${j.kind}] ${j.event||j.topic||j.url||''}`;
      }catch(e){return l;}
    }).join('\n');
    document.getElementById('debug').textContent = dbg;

    // summary line
    document.getElementById('summaryText').textContent = summarise(items,sales,bids,viewers,revenue);
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
