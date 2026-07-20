// Entry point. Decides, BEFORE any heavy code loads, whether this device gets the
// game or the "desktop only" gate. The two paths are dynamic imports so Vite
// code-splits them: a touch device fetches gate.js (a few KB) and NEVER downloads
// the three.js bundle or the ~68 MB of 3D assets that main.js pulls in. Desktop
// fetches main.js exactly as before.

// Capability-based detection — deliberately NOT user-agent sniffing, which both
// mis-blocks touchscreen laptops and mis-passes modern iPads. A phone/tablet has a
// coarse primary pointer and no hover; a touch laptop keeps a fine pointer + hover.
function wantsGate() {
  const params = new URLSearchParams(location.search);
  // explicit overrides + the "enter anyway" flag (set for the rest of the session)
  if (params.has('desktop') || params.has('nogate')) return false;
  // headless perf/screenshot tooling always drives desktop Chrome with these params
  if (params.has('skipintro') || params.has('newgame') || params.has('menu')) return false;
  try { if (sessionStorage.getItem('inalco.entered') === '1') return false; } catch (_) {}

  const mm = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);
  const coarse = mm('(pointer: coarse)');
  const noHover = mm('(hover: none)');
  const touchPoints = navigator.maxTouchPoints || 0;
  // iPadOS 13+ reports as desktop Safari ("MacIntel"/"Macintosh") but exposes touch
  const iPadOS = /Mac/.test(navigator.platform || '') && touchPoints > 1;
  return (coarse && noHover) || iPadOS;
}

if (wantsGate()) {
  import('./gate.js').then((m) => m.showGate({
    // "enter anyway" — honour the choice, remember it for the session, load the game
    onEnter() {
      try { sessionStorage.setItem('inalco.entered', '1'); } catch (_) {}
      import('./main.js');
    },
  }));
} else {
  import('./main.js');
}
