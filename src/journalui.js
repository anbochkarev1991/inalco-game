// The journal overlay: a tabbed view of developed polaroids and the notes the
// player has read, rendered from the `journal` store. Openable from the pause
// screen and the main menu. Clicking a photo opens a browsable lightbox for a
// closer look. Pure presentation — no game state.

import { journal } from './journal.js';

export function buildJournalUI({ onBack }) {
  const $ = (id) => document.getElementById(id);
  const screen = $('journal-screen');
  const body = $('journal-body');
  const back = $('journal-back');
  const tabs = [...screen.querySelectorAll('.jtab')];

  // lightbox (enlarged single-photo view, layered above the journal screen)
  const lb = $('jlightbox');
  const lbImg = $('jlb-img');
  const lbCap = $('jlb-cap');
  const lbCount = $('jlb-count');
  const lbPrev = $('jlb-prev');
  const lbNext = $('jlb-next');
  const lbClose = $('jlb-close');
  const lbZoomIn = $('jlb-zoomin');
  const lbZoomOut = $('jlb-zoomout');
  const lbZoomReset = $('jlb-zoomreset');

  let tab = 'photos';
  let order = [];      // photos in display (newest-first) order — indexes the lightbox
  let lbIndex = -1;    // -1 = lightbox closed

  // zoom/pan state for the enlarged photo
  const Z_MIN = 1, Z_MAX = 5, Z_STEP = 1.35;
  let zoom = 1, panX = 0, panY = 0;
  let dragging = false, dragMoved = false, dragSX = 0, dragSY = 0, dragPX = 0, dragPY = 0;

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() {
    tabs.forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    if (tab === 'photos') {
      order = journal.photos.slice().reverse();   // newest first
      body.innerHTML = order.length
        ? `<div class="jphotos">${order.map((p, i) => `
            <button class="jphoto" data-i="${i}" aria-label="Open photograph">
              <img src="${p.dataUrl}" alt="" />
              <figcaption>${esc(p.caption)}</figcaption>
            </button>`).join('')}</div>`
        : `<div class="jempty">No photographs yet. Left-click to raise the camera — what develops is kept here.</div>`;
      body.querySelectorAll('.jphoto').forEach((el) =>
        el.addEventListener('click', () => openLightbox(+el.dataset.i)));
    } else {
      const ns = journal.notes;
      body.innerHTML = ns.length
        ? `<div class="jnotes">${ns.slice().reverse().map((n) => `
            <article class="jnote">
              <div class="jnote-kind">${esc(n.kind)}</div>
              <h3 class="jnote-title">${esc(n.title)}</h3>
              <div class="jnote-body">${esc(n.body)}</div>
            </article>`).join('')}</div>`
        : `<div class="jempty">Nothing read yet. Notes you find are kept here to re-read.</div>`;
    }
  }

  // --- lightbox ---
  function applyTransform() {
    lbImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    lbImg.classList.toggle('zoomed', zoom > 1.001);
  }
  // keep the (scaled) image covering its frame — pan is bounded to the overflow
  function clampPan() {
    const maxX = lbImg.clientWidth * (zoom - 1) / 2;
    const maxY = lbImg.clientHeight * (zoom - 1) / 2;
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }
  function resetZoom() { zoom = 1; panX = 0; panY = 0; applyTransform(); }
  // Zoom toward a target level, keeping the point under (clientX,clientY) fixed.
  // With no focal point given, zooms about the centre.
  function zoomTo(z, clientX, clientY) {
    const z1 = Math.max(Z_MIN, Math.min(Z_MAX, z));
    const box = lbImg.parentElement.getBoundingClientRect();   // .jlb-photo (untransformed)
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    if (clientX == null) { clientX = cx; clientY = cy; }
    const z0 = zoom;
    const ox = (clientX - cx - panX) / z0, oy = (clientY - cy - panY) / z0;
    zoom = z1;
    panX += ox * (z0 - z1);
    panY += oy * (z0 - z1);
    if (zoom <= 1.001) { zoom = 1; panX = 0; panY = 0; }
    else clampPan();
    applyTransform();
  }

  function showPhoto() {
    const p = order[lbIndex];
    if (!p) return;
    resetZoom();               // each photo opens at the fitted size
    lbImg.src = p.dataUrl;
    lbCap.textContent = p.caption || '';
    const many = order.length > 1;
    lbCount.textContent = many ? `${lbIndex + 1} / ${order.length}` : '';
    lbPrev.style.display = many ? '' : 'none';
    lbNext.style.display = many ? '' : 'none';
  }
  function openLightbox(i) {
    if (i < 0 || i >= order.length) return;
    lbIndex = i;
    showPhoto();
    lb.classList.add('on');
  }
  function closeLightbox() {
    if (lbIndex < 0) return;
    lbIndex = -1;
    resetZoom();
    lb.classList.remove('on');
    lbImg.removeAttribute('src');   // release the (large) data URL
  }
  function step(d) {
    if (lbIndex < 0 || order.length === 0) return;
    lbIndex = (lbIndex + d + order.length) % order.length;
    showPhoto();
  }

  tabs.forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));
  back.addEventListener('click', () => onBack?.());

  lbPrev.addEventListener('click', () => step(-1));
  lbNext.addEventListener('click', () => step(1));
  lbClose.addEventListener('click', closeLightbox);
  lb.addEventListener('click', (e) => {
    if (dragMoved) { dragMoved = false; return; }   // a pan drag, not a dismiss
    if (e.target === lb) closeLightbox();            // click the backdrop to dismiss
  });

  // --- zoom / pan ---
  lbZoomIn.addEventListener('click', () => zoomTo(zoom * Z_STEP));
  lbZoomOut.addEventListener('click', () => zoomTo(zoom / Z_STEP));
  lbZoomReset.addEventListener('click', resetZoom);

  // wheel zooms toward the cursor; preventDefault stops the journal behind it scrolling
  lb.addEventListener('wheel', (e) => {
    if (lbIndex < 0) return;
    e.preventDefault();
    zoomTo(zoom * (e.deltaY < 0 ? Z_STEP : 1 / Z_STEP), e.clientX, e.clientY);
  }, { passive: false });

  // double-click toggles between fit and a close-up under the cursor
  lbImg.addEventListener('dblclick', (e) => {
    if (zoom > 1) resetZoom(); else zoomTo(2.5, e.clientX, e.clientY);
  });

  // drag to pan while zoomed in
  lbImg.addEventListener('mousedown', (e) => {
    if (zoom <= 1) return;
    dragging = true; dragMoved = false;
    dragSX = e.clientX; dragSY = e.clientY; dragPX = panX; dragPY = panY;
    lbImg.classList.add('grabbing');
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    dragMoved = true;
    panX = dragPX + (e.clientX - dragSX);
    panY = dragPY + (e.clientY - dragSY);
    clampPan(); applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; lbImg.classList.remove('grabbing');
  });

  // Capture phase so we intercept before main.js's window keydown (which would
  // otherwise close the whole journal on Esc). Only acts while a photo is enlarged.
  window.addEventListener('keydown', (e) => {
    if (lbIndex < 0) return;
    if (e.code === 'Escape') closeLightbox();
    else if (e.code === 'ArrowLeft') step(-1);
    else if (e.code === 'ArrowRight') step(1);
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomTo(zoom * Z_STEP);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomTo(zoom / Z_STEP);
    else if (e.code === 'Digit0' || e.code === 'Numpad0') resetZoom();
    else return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  return {
    show() { render(); screen.classList.add('on'); },
    hide() { closeLightbox(); screen.classList.remove('on'); },
  };
}
