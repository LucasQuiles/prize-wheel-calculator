
(function() {
    const ship = (pl) => fetch('http://localhost:5001/ingest', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(pl)
    }).catch(() => {});
    const log = (pl) => chrome.storage.local.get(['log'], d => {
        const lines = (d.log || '').split('\n').filter(Boolean);
        lines.push(JSON.stringify(pl));
        if (lines.length > 20) lines.shift();
        chrome.storage.local.set({log: lines.join('\n')});
    });
    const send = (pl) => { log(pl); ship(pl); };

    // __NEXT_DATA__
    const nextEl = document.getElementById('__NEXT_DATA__');
    if (nextEl) {
        try { send({kind:'next_data', data: JSON.parse(nextEl.textContent)}); } catch(e) {}
    }

    // Open Graph meta
    const og = Array.from(document.querySelectorAll('meta[property^="og:"]')).map(m => {
        return {k: m.getAttribute('property'), v: m.getAttribute('content')};
    });
    if (og.length) send({kind:'open_graph', og});

    // m3u8 in inline scripts
    const m3u8 = [...new Set(Array.from(document.scripts).flatMap(s => (s.textContent||'').match(/https?:\\/\\/[^'\" ]+\\.m3u8/g)||[]))];
    if (m3u8.length) send({kind:'m3u8', m3u8});
})();
