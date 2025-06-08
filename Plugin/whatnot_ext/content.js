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
  // ws_tap.js is injected by background.js using chrome.scripting

  /* ---------- Relay page → extension ---------- */
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    // direct posts from ws_tap.js fallback (if any)
    if (e.data.kind) {
      chrome.runtime.sendMessage(e.data);
    }
    // wrapped posts from ws_tap.js injected in MAIN world
    else if (e.data.__WHATNOT_SNIFFER__ && e.data.payload && e.data.payload.kind) {
      chrome.runtime.sendMessage(e.data.payload);
    }
  });

  // re-run scrape() whenever background tells us to
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.kind === 'refresh') scrape();
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

      // 3a) Live bids
      const bidSel = '[data-testid="current-bid" i], .current-bid';
      Array.from(document.querySelectorAll(bidSel)).forEach(el => {
        if (!el.dataset.sniffed) {
          el.dataset.sniffed = '1';
          send({
            kind: 'ws_event',
            event: 'new_bid',
            payload: { amount: el.textContent.trim() }
          });
        }
      });

      // 3b) Sales (when an item sells, page inserts .sale-price)
      const saleSel = '[data-testid="sale-price" i], .sale-price';
      Array.from(document.querySelectorAll(saleSel)).forEach(el => {
        if (!el.dataset.sniffed) {
          el.dataset.sniffed = '1';
          // find the parent item card to get the item name
          const card = el.closest('[data-testid^="item" i], .ItemCard, .item-card');
          const nameNode = card?.querySelector('[data-testid*="title" i], .title, h2, h3');
          const itemName = nameNode?.textContent.trim() || '—';
          send({
            kind: 'ws_event',
            event: 'sold',
            payload: {
              price: parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0,
              item: { name: itemName }
            }
          });
        }
      });
    } catch (err) {
      console.error('[Whatnot-Sniffer] scrape error', err);
    }
  }

  function update() {
    scrape();
  }

  /* ---------- initialise + observe ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scrape);
  } else {
    scrape();
  }
  new MutationObserver(scrape)
    .observe(document.documentElement, { childList: true, subtree: true });

  // poll every second to catch rapid updates
  setInterval(scrape, 1000);
})();