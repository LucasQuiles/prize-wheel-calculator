// content.js — CSP‑safe Whatnot Sniffer content script (v0.6.1)
// Injected at document_start, relays WebSocket frames from page → extension → panel

(() => {
  /* ---------- transport helpers ---------- */
  const log = (pl) => chrome.storage.local.get(['log'], (d = {}) => {
    const lines = (d.log || '').split('\n').filter(Boolean);
    lines.push(JSON.stringify(pl));
    if (lines.length > 200) lines.shift();
    chrome.storage.local.set({ log: lines.join('\n') });
  });
  const send = (pl) => {
    log(pl);
  };

  /* ---------- inject ws_tap.js for WebSocket tapping ---------- */
  function injectWSTap() {
    if (window.__WS_TAP_INJECTED__) return;
    window.__WS_TAP_INJECTED__ = true;
    const s = document.createElement('script');
    s.textContent = `(() => {
      const O = window.WebSocket;
      window.WebSocket = function(u, p){
        const ws = new O(u, p);
        ws.addEventListener('message', e => {
          window.postMessage({kind:'ws_event', data:e.data}, '*');
        });
        return ws;
      };
    })();`;
    (document.documentElement || document.head || document.body).appendChild(s);
  }
  injectWSTap();

  /* ---------- Relay page → extension ---------- */
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.kind) {
      chrome.runtime.sendMessage(e.data);
    }
  });

  /* ---------- scraping logic ---------- */
  function scrape() {
    try {
      // 1. __NEXT_DATA__ (SSR payload)
      const nextEl = document.getElementById('__NEXT_DATA__');
      if (nextEl && !nextEl.dataset.sniffed) {
        nextEl.dataset.sniffed = '1';
        try {
          const data = JSON.parse(nextEl.textContent);
          send({ kind: 'next_data', data });
          const items = data?.props?.pageProps?.items || data?.props?.pageProps?.live?.items;
          if (Array.isArray(items) && items.length) send({ kind: 'items', items });
        } catch (e) {}
      }

      // 2. Item cards in DOM
      const cardSel = '[data-testid^="item" i],[data-test^="item" i],.ItemCard,.item-card';
      const itemNodes = Array.from(document.querySelectorAll(cardSel));
      if (itemNodes.length) {
        const domItems = itemNodes.map((el) => {
          const nameNode = el.querySelector('[data-testid*="title" i], .title, h2, h3');
          return {
            id: el.getAttribute('data-testid') || el.id || undefined,
            name: (nameNode || el).textContent.trim(),
            price: (el.querySelector('[data-testid$="price" i], .price') || {}).textContent?.trim(),
          };
        });
        send({ kind: 'items', items: domItems });
      }

      // 3. Bid / sold prices in DOM
      const priceSel = '[data-testid="current-bid" i],.current-bid,.sale-price';
      Array.from(document.querySelectorAll(priceSel)).forEach((el) => {
        if (!el.dataset.sniffed) {
          el.dataset.sniffed = '1';
          // Emit as ws_event so panel.parseBids sees it
          send({ kind: 'ws_event', event: 'bid', payload: { amount: el.textContent.trim() } });
        }
      });
    } catch (err) {
      console.error('[Whatnot-Sniffer] scrape error', err);
    }
  }

  /* ---------- initialise + observe ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scrape);
  } else {
    scrape();
  }
  const mo = new MutationObserver(scrape);
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();