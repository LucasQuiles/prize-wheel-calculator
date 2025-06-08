// ws_tap.js — injected in page context (MAIN world)
// Hooks WebSocket constructor to capture Whatnot Phoenix frames and relay
// them to the extension via window.postMessage. CSP‑safe because this file
// is loaded via chrome.scripting.executeScript or a <script src> tag.

(() => {
  if (window.__WHATNOT_WS_TAPPED__) return;
  window.__WHATNOT_WS_TAPPED__ = true;

  const NativeWS = window.WebSocket;

  window.WebSocket = function (url, proto) {
    const ws = new NativeWS(url, proto);

    ws.addEventListener('message', (ev) => {
      try {
        const frame = JSON.parse(ev.data);
        // Whatnot Phoenix frames: [null, ref, topic, event, payload]
        if (Array.isArray(frame) && frame.length >= 5) {
          const [, , topic, event, payload] = frame;
          window.postMessage(
            {
              __WHATNOT_SNIFFER__: true,
              payload: {
                kind: 'ws_event',
                event,
                topic,
                payload,
              },
            },
            '*'
          );
        }
      } catch {}
    });

    return ws;
  };

  window.WebSocket.prototype = NativeWS.prototype;
})();
