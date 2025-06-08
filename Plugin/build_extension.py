# build_extension.py
"""
Scaffolds (and overwrites with --force) a Chrome Manifest V3 extension that
sniffs Whatnot livestream data in *your logged‑in browser* and ships each
payload to a local HTTP endpoint.

════════════════════════════════════════════════════════════════════════════
USAGE
-----
    # generate ./whatnot_ext (creates or overwrites)
    python build_extension.py --force

    # explicit output folder
    python build_extension.py ~/dev/whatnot_ext --force

Then load the folder in Chrome:
  1. chrome://extensions → enable **Developer mode**
  2. “Load unpacked” → select the folder
  3. Visit a Whatnot live URL while logged in (Google OAuth)

The extension forwards:
  • __NEXT_DATA__ JSON
  • all og:* meta tags
  • any .m3u8 URLs found in inline JS
  • every completed REST call under /v1/lives/** (full JSON)
  • every WebSocket upgrade URL (kind ="ws")

Edit LOCAL_ENDPOINT below if you want to POST elsewhere.
════════════════════════════════════════════════════════════════════════════
"""
import argparse
import json
import os
import shutil
import sys
from pathlib import Path

LOCAL_ENDPOINT = "http://localhost:5001/ingest"  # 🔁 change sink if desired

# ────────────────────────────── Extension files ─────────────────────────────

MANIFEST: dict = {
    "manifest_version": 3,
    "name": "Whatnot Live Sniffer",
    "version": "0.4",
    "permissions": ["storage", "webRequest", "activeTab"],
    # MV3 host_permissions must be http/https only
    "host_permissions": ["https://www.whatnot.com/*"],
    "background": {"service_worker": "background.js"},
    "content_scripts": [
        {
            "matches": ["https://www.whatnot.com/live/*"],
            "js": ["content.js"],
            "run_at": "document_idle"
        }
    ],
    "action": {
        "default_popup": "popup.html",
        "default_title": "Whatnot Sniffer"
    },
    "side_panel": {"default_path": "panel.html"}
}

# Content script — executes in the livestream tab
CONTENT_JS = rf"""
(() => {{
  const ship = (pl) => fetch('{LOCAL_ENDPOINT}', {{
    method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(pl)
  }}).catch(() => {{}});

  // __NEXT_DATA__
  const nd = document.getElementById('__NEXT_DATA__');
  if (nd) try {{ ship({{kind:'next_data', data: JSON.parse(nd.textContent)}}); }} catch{{}}

  // Open Graph meta
  const og = [...document.querySelectorAll('meta[property^="og:"]')].map(m=>({{k:m.getAttribute('property'),v:m.getAttribute('content')}}));
  if (og.length) ship({{kind:'open_graph', og}});

  // m3u8 URLs inside inline scripts
  const m3u8Pattern = /https?:\\/\\/[^\\s'"\\\\]+?\\.m3u8/g;
  const m3u8 = [...new Set(
    [...document.scripts].flatMap(s => {
      const m = (s.textContent || '').match(m3u8Pattern);
      return m || [];
    })
  )];
  if (m3u8.length) ship({{kind:'m3u8', m3u8}});
}})();
"""

# Background service‑worker — passive network observer
BACKGROUND_JS = rf"""
// REST JSON for /v1/lives/*
chrome.webRequest.onCompleted.addListener(
  (d) => {{
    if (d.url.includes('/v1/lives/')) {{
      fetch(d.url)
        .then(r=>r.json())
        .then(j=>fetch('{LOCAL_ENDPOINT}', {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{kind:'api',url:d.url,json:j}})}}))
        .catch(()=>{{}});
    }}
  }},
  {{urls:["https://api.whatnot.com/*"], types:["xmlhttprequest"]}}
);

// WebSocket upgrades (URL only — no message body interception)
chrome.webRequest.onBeforeRequest.addListener(
  (d)=>{{
    if(d.type==='websocket'){{
      fetch('{LOCAL_ENDPOINT}', {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{kind:'ws',url:d.url}})}});
    }}
  }},
  {{urls:["<all_urls>"], types:["websocket"]}}
);
"""

POPUP_HTML = """<!DOCTYPE html>
<html>
  <head>
    <meta charset='utf-8'>
    <style>
      body{font:13px sans-serif;width:300px;padding:8px}
      input[type=text]{width:100%;box-sizing:border-box;margin-bottom:6px}
      button{width:100%;margin-bottom:6px}
      #status{margin-bottom:6px;font-size:12px}
      pre{font-size:11px;white-space:pre-wrap}
    </style>
  </head>
  <body>
    <h3>Whatnot Sniffer</h3>
    <input id='auctionUrl' type='text' placeholder='Auction URL'>
    <button id='startBtn'>Start</button>
    <div id='status'></div>
    <pre id='preview'></pre>
    <pre id='log'></pre>
    <script src='popup.js'></script>
  </body>
</html>"""

POPUP_JS = """
function updateLogDisplay(logStr){
  const log=document.getElementById('log');
  const prev=document.getElementById('preview');
  log.textContent=logStr||'No data yet…';
  if(logStr){
    const lines=logStr.split('\n').filter(Boolean);
    const last=lines[lines.length-1];
    if(last){
      try{prev.textContent=JSON.stringify(JSON.parse(last),null,2);}catch{prev.textContent=last;}
    }
  }
}
chrome.storage.local.get(['log'],d=>{updateLogDisplay(d.log||'');});
chrome.storage.onChanged.addListener(c=>{if(c.log)updateLogDisplay(c.log.newValue);});
document.getElementById('startBtn').addEventListener('click',()=>{
  const url=document.getElementById('auctionUrl').value.trim();
  const stat=document.getElementById('status');
  if(url){
    chrome.tabs.create({url},tab=>{if(chrome.sidePanel?.open)chrome.sidePanel.open({tabId:tab.id});});
    stat.textContent='Opening '+url+' …';
  }else{
    chrome.tabs.query({active:true,currentWindow:true},tabs=>{
      if(tabs[0]&&tabs[0].url){
        stat.textContent='Tracking active tab: '+tabs[0].url;
        if(chrome.sidePanel?.open)chrome.sidePanel.open({tabId:tabs[0].id});
      }else{
        stat.textContent='No active tab to track.';
      }
    });
  }
});
"""

PANEL_HTML = """<!DOCTYPE html>
<html><head><meta charset='utf-8'>
<style>body{font:13px sans-serif;width:320px;padding:8px}#items{margin-bottom:8px}pre{font-size:11px;white-space:pre-wrap}</style>
</head><body>
<h3>Whatnot Sniffer Panel</h3>
<div id='items'>No items yet…</div>
<pre id='log'></pre>
<script src='panel.js'></script>
</body></html>"""

PANEL_JS = """
function parseItems(lines){
  const items=[];
  lines.forEach(l=>{try{const j=JSON.parse(l);if(j.kind==='items'&&Array.isArray(j.items)){j.items.forEach(it=>{items.push(it.name||it.title||JSON.stringify(it));});}}catch{}});
  return items;
}
function update(){
  chrome.storage.local.get(['log'],d=>{
    const log=d.log||'';
    const lines=log.split('\n').filter(Boolean);
    document.getElementById('log').textContent=log||'No data yet…';
    const items=parseItems(lines);
    document.getElementById('items').innerHTML=items.length?items.map(i=>`<div>${i}</div>`).join(''):'No items yet…';
  });
}
chrome.storage.onChanged.addListener(c=>{if(c.log)update();});
update();
"""

SERVER_SNIPPET = """# minimal Flask receiver
from flask import Flask, request, jsonify
app = Flask(__name__)

@app.route('/ingest', methods=['POST'])
def ingest():
    payload = request.get_json()
    print(payload.get('kind'), payload.get('url', '')[:80])
    return jsonify(ok=True)

if __name__ == '__main__':
    app.run(port=5001)
"""

# ───────────────────────── Scaffolding helpers ─────────────────────────

def _write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')


def scaffold(out_dir: Path, force: bool):
    if out_dir.exists() and force:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    _write(out_dir/"manifest.json", json.dumps(MANIFEST, indent=2))
    _write(out_dir/"content.js", CONTENT_JS)
    _write(out_dir/"background.js", BACKGROUND_JS)
    _write(out_dir/"popup.html", POPUP_HTML)
    _write(out_dir/"popup.js", POPUP_JS)
    _write(out_dir/"panel.html", PANEL_HTML)
    _write(out_dir/"panel.js", PANEL_JS)
    _write(out_dir/"server_snippet.py", SERVER_SNIPPET)
    print(f"✅ Extension scaffolded to {out_dir}\n→ chrome://extensions → Load unpacked (Developer mode)")


def main():
    ap = argparse.ArgumentParser("Generate or overwrite Whatnot sniffer extension")
    ap.add_argument("path", nargs="?", default="./whatnot_ext", help="Output folder [default ./whatnot_ext]")
    ap.add_argument("--force", action="store_true", help="Overwrite existing folder")
    args = ap.parse_args()

    scaffold(Path(os.path.expanduser(args.path)).resolve(), force=args.force)


if __name__ == "__main__":
    main()
