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
    if(j.kind==='ws_event' && (j.event==='bid' || j.event==='new_bid')){
      const a=parseFloat(j.payload.amount||j.payload.price||j.payload.nextBidPrice?.amount);
      const bidder=j.payload.highestBidder?.username||j.payload.bidder||'\u2014';
      const ts=parseInt(j.payload.timestamp||j.payload.product?.timestamp);
      if(!isNaN(a)){
        bids.push({ amount:a, bidder, timestamp:ts||Date.now() });
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
    if(j.kind==='ws_event' && j.event==='livestream_view_count_updated'){
      const c=j.payload?.viewCount;
      if(typeof c==='number') arr.push(c);
    }
    if(j.kind==='ws_event' && j.event==='livestream_update'){
      const c=j.payload?.activeViewers;
      if(typeof c==='number') arr.push(c);
    }
  }catch(e){}});
  return arr;
}

function parseReactions(lines){
  let gauge={};
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='ws_event' && j.event==='reactions'){
      if(j.payload?.reactionTypeToGauge) gauge=j.payload.reactionTypeToGauge;
    }
  }catch{}});
  return gauge;
}

function parseGiveaways(lines){
  let count=0;
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='ws_event' && j.event==='giveaway_entry_count_updated'){
      const c=parseInt(j.payload?.entryCount);
      if(!isNaN(c)) count=c;
    }
  }catch{}});
  return count;
}

function parseSpinResults(lines){
  const res={};
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='ws_event' && j.event==='randomizer_result_event'){
      const r=j.payload?.result;
      if(r) res[r]=(res[r]||0)+1;
    }
  }catch{}});
  return res;
}

function bidVelocity(bids){
  if(bids.length<2) return 0;
  const now=Math.max(...bids.map(b=>b.timestamp||0));
  const recent=bids.filter(b=>b.timestamp>=now-10000);
  return recent.length/10;
}

function avgBid(bids){
  if(!bids.length) return 0;
  return bids.reduce((s,b)=>s+b.amount,0)/bids.length;
}

function rpm(sales){
  if(sales.length<2) return 0;
  const first=Math.min(...sales.map(s=>s.timestamp||0));
  const last=Math.max(...sales.map(s=>s.timestamp||first));
  const minutes=(last-first)/60000;
  if(minutes<=0) return 0;
  const total=sales.reduce((s,c)=>s+c.price,0);
  return total/minutes;
}

function auctionDurations(lines){
  const map={};
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='ws_event'){
      if(j.event==='auction_started'){
        const id=j.payload?.product?.id;
        if(id) map[id]={start:j.payload?.timestamp||Date.now()};
      }
      if(j.event==='auction_ended'){
        const id=j.payload?.product?.id;
        if(id) (map[id]=map[id]||{}).end=j.payload?.product?.auctionEndTime||Date.now();
      }
    }
  }catch{}});
  const durs=Object.values(map).filter(x=>x.start&&x.end).map(x=>(x.end-x.start)/1000);
  return {
    perItem:durs,
    avg:durs.length?durs.reduce((s,c)=>s+c,0)/durs.length:0,
    lotsPerHour:durs.length?3600/(durs.reduce((s,c)=>s+c,0)/durs.length):0
  };
}

function topBuyers(lines,n=5){
  const spend={};
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='ws_event'&&j.event==='payment_succeeded'){
      const user=j.payload?.purchaserUser?.username||'—';
      const price=(j.payload?.soldPrice?.amount||j.payload?.product?.soldPriceCents)/100;
      if(price>0) spend[user]=(spend[user]||0)+price;
    }
  }catch{}});
  return Object.entries(spend)
          .sort((a,b)=>b[1]-a[1])
          .slice(0,n);
}

function breakVelocity(lines){
  const hist={};
  lines.forEach(l=>{try{
    const j=JSON.parse(l);
    if(j.kind==='ws_event'&&j.event==='break_updated'){
      const t=j.payload.title;
      if(t){
        (hist[t]=hist[t]||[]).push({
          t:j.payload.timestamp||Date.now(),
          f:parseInt(j.payload.filled_break_spots),
          tot:parseInt(j.payload.total_break_spots)
        });
      }
    }
  }catch{}});
  const eta={};
  Object.entries(hist).forEach(([t,arr])=>{
    if(arr.length<2) return;
    const dF=arr[arr.length-1].f-arr[0].f;
    const dT=(arr[arr.length-1].t-arr[0].t)/60000;
    const vel=dF/dT;
    const left=arr[arr.length-1].tot-arr[arr.length-1].f;
    eta[t]=vel>0?left/vel:Infinity;
  });
  return eta;
}

function reactionsCount(lines){
  const gauge=parseReactions(lines);
  return Object.values(gauge).reduce((s,v)=>s+(parseFloat(v)||0),0);
}

function drawSparkline(canvas, arr){
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(arr.length<2) return;
  const max=Math.max(...arr);
  const min=Math.min(...arr);
  const scale=v=>{
    if(max===min) return canvas.height/2;
    return canvas.height-((v-min)/(max-min))*canvas.height;
  };
  ctx.beginPath();
  ctx.moveTo(0,scale(arr[0]));
  arr.slice(1).forEach((v,i)=>{
    ctx.lineTo((i/(arr.length-1))*canvas.width, scale(v));
  });
  ctx.strokeStyle='#00f';
  ctx.stroke();
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
  lines.forEach(l=>{
    try{
      const j = JSON.parse(l);

      // (1) Synthetic sale packets from background.js
      if(j.kind === 'sale'){
        const price = parseFloat(j.sale?.price || j.sale?.amount);
        if(!isNaN(price)){
          sales.push({
            name: j.sale?.item?.name || j.sale?.product?.name || '\u2014',
            price,
            buyer: j.sale?.buyer ?? j.sale?.purchaserUser?.username ?? '\u2014',
            timestamp: j.sale?.timestamp ?? Date.now()
          });
        }
      }

      // (2) Native WS events
      if(j.kind==='ws_event' && (j.event==='sold' || j.event==='payment_succeeded')){
        const p = j.payload || {};
        const price = (p.product?.soldPriceCents ?? p.priceCents ?? p.price ?? p.amount)/100;
        sales.push({
          name: p.product?.name || p.item?.name || '\u2014',
          price: isNaN(price)?0:price,
          buyer: p.purchaserUser?.username || p.buyer || '\u2014',
          timestamp: p.timestamp || p.product?.timestamp || Date.now()
        });
      }
    }catch{}
  });
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
    const reactions= parseReactions(lines);
    const giveCnt  = parseGiveaways(lines);
    const spinRes  = parseSpinResults(lines);
    const dur      = auctionDurations(lines);
    const etaMap   = breakVelocity(lines);
    const spinRows = Object.entries(spinRes)
        .map(([res, n]) => `${res}: ${n}`)
        .join(' | ');
    document.getElementById('spinStats').textContent = spinRows || '\u2014';
    document.getElementById('lotSpeed').textContent =
      `Lots/hr: ${dur.lotsPerHour.toFixed(1)} (avg ${dur.avg.toFixed(0)}\u202fs)`;
    document.getElementById('breakEta').textContent =
      Object.entries(etaMap).map(([t,m])=>`${t}: ${m<1?'<1':m.toFixed(1)}\u202fmin`).join(' | ') || '\u2014';

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

    document.getElementById('tblBreaks').innerHTML =
      Object.keys(breakMap).length
        ? Object.entries(breakMap).map(([t,b])=>`<tr><td>${t}</td><td>${b.sold}/${b.total}</td></tr>`).join('')
        : '<tr><td colspan="2">No lots yet…</td></tr>';

    let remaining = 0;
    if(Object.keys(breakMap).length){
      remaining = Object.values(breakMap)
        .reduce((sum,b)=>sum + (b.total - b.sold), 0);
    }else{
      remaining = items.length - sales.length;
    }
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

    document.getElementById('bidVelocity').textContent = `Bids/sec: ${bidVelocity(bids).toFixed(2)}`;
    document.getElementById('avgBid').textContent = `Avg bid: $${avgBid(bids).toFixed(2)}`;

    document.getElementById('rpm').textContent = `RPM: $${rpm(sales).toFixed(2)}`;

    const viewers = parseViewers(lines);
    document.getElementById('viewerCount').textContent = viewers;

    const hist = viewerHistory(lines);
    const canvas = document.getElementById('viewersSparkline');
    if(canvas && canvas.getContext){
      drawSparkline(canvas, hist.slice(-50));
    }

    const eng = ((bids.length + reactionsCount(lines)) / Math.max(viewers,1) * 100).toFixed(1);
    document.getElementById('engIndex').textContent = `Engagement: ${eng}%`;

    document.getElementById('topBuyers').textContent =
      topBuyers(lines).map(([u$,amt])=>`${u$} \u0024${amt.toFixed(0)}`).join(' | ') || '\u2014';

    document.getElementById('giveawayCount').textContent = `Entries: ${giveCnt}`;
    document.getElementById('reactionGauge').innerHTML =
      Object.entries(reactions)
            .map(([k,v])=>`<div>${k}: ${(v*100).toFixed(1)}%</div>`)
            .join('');

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
