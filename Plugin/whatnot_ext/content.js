
(function() {
    const ship = (pl) => fetch('http://localhost:5001/ingest', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(pl)
    }).catch(() => {});

    // __NEXT_DATA__
    const nextEl = document.getElementById('__NEXT_DATA__');
    if (nextEl) {
        try { ship({kind:'next_data', data: JSON.parse(nextEl.textContent)}); } catch(e) {}
    }

    // Open Graph meta
    const og = Array.from(document.querySelectorAll('meta[property^="og:"]')).map(m => {
        return {k: m.getAttribute('property'), v: m.getAttribute('content')};
    });
    if (og.length) ship({kind:'open_graph', og});

    // m3u8 in inline scripts
    const m3u8 = [...new Set(Array.from(document.scripts).flatMap(s => (s.textContent||'').match(/https?:\\/\\/[^'\" ]+\\.m3u8/g)||[]))];
    if (m3u8.length) ship({kind:'m3u8', m3u8});
})();
