
(function() {
    const ship = (pl) => fetch('http://localhost:5001/ingest', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(pl)
    }).catch(() => {});
    const log = (pl) => chrome.storage.local.get(['log'], d => {
        const lines = (d.log || '').split('\n').filter(Boolean);
        lines.push(JSON.stringify(pl));
        if (lines.length > 200) lines.shift();
        chrome.storage.local.set({log: lines.join('\n')});
    });
    const send = (pl) => { log(pl); ship(pl); };

    // ---- WebSocket frame interceptor injected into page -----------------
    function injectWSTap(){
        const s = document.createElement('script');
        s.textContent = '(' + function(){
            const NativeWS = window.WebSocket;
            window.WebSocket = function(url, proto){
                const ws = new NativeWS(url, proto);
                ws.addEventListener('message', ev => {
                    try{
                        const frame = JSON.parse(ev.data);
                        if(Array.isArray(frame) && frame.length >= 5){
                            const [, , topic, event, payload] = frame;
                            window.postMessage({kind:'ws_event', topic, event, payload}, '*');
                        }
                    }catch{}
                });
                return ws;
            };
            window.WebSocket.prototype = NativeWS.prototype;
        } + ')();';
        document.documentElement.appendChild(s);
        s.remove();
    }
    injectWSTap();

    window.addEventListener('message', e => {
        if(e.source === window && e.data && e.data.kind){
            chrome.runtime.sendMessage(e.data);
        }
    });

    // __NEXT_DATA__
    const nextEl = document.getElementById('__NEXT_DATA__');
    if (nextEl) {
        try {
            const data = JSON.parse(nextEl.textContent);
            send({kind:'next_data', data});
            const items = data?.props?.pageProps?.items || data?.props?.pageProps?.live?.items;
            if (Array.isArray(items) && items.length) send({kind:'items', items});
        } catch(e) {}
    }

    // Open Graph meta
    const og = Array.from(document.querySelectorAll('meta[property^="og:"]')).map(m => {
        return {k: m.getAttribute('property'), v: m.getAttribute('content')};
    });
    if (og.length) send({kind:'open_graph', og});

    // m3u8 in inline scripts
    const m3u8Pattern = /https?:\/\/[^\s'"\\]+?\.m3u8/g;
    const m3u8 = [...new Set(
        Array.from(document.scripts).flatMap(s => {
            const matches = (s.textContent || '').match(m3u8Pattern);
            return matches || [];
        })
    )];
    if (m3u8.length) send({kind:'m3u8', m3u8});
})();
