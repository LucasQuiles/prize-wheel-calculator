function parseItems(lines){
  const items=[];
  lines.forEach(l=>{try{const j=JSON.parse(l);if(j.kind==='items'&&Array.isArray(j.items)){
    j.items.forEach(it=>{items.push(it.name||it.title||JSON.stringify(it));});
  }}catch{}});
  return items;
}
function update(){
  chrome.storage.local.get(['log'], d=>{
    const log=d.log||'';
    const lines=log.split('\n').filter(Boolean);
    document.getElementById('log').textContent=log||'No data yet…';
    const items=parseItems(lines);
    document.getElementById('items').innerHTML=items.length?items.map(i=>`<div>${i}</div>`).join(''):'No items yet…';
  });
}
chrome.storage.onChanged.addListener(c=>{if(c.log)update();});
update();
