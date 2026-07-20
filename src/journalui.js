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

  let tab = 'photos';
  let order = [];      // photos in display (newest-first) order — indexes the lightbox
  let lbIndex = -1;    // -1 = lightbox closed

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
  function showPhoto() {
    const p = order[lbIndex];
    if (!p) return;
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
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });  // click backdrop to dismiss

  // Capture phase so we intercept before main.js's window keydown (which would
  // otherwise close the whole journal on Esc). Only acts while a photo is enlarged.
  window.addEventListener('keydown', (e) => {
    if (lbIndex < 0) return;
    if (e.code === 'Escape') closeLightbox();
    else if (e.code === 'ArrowLeft') step(-1);
    else if (e.code === 'ArrowRight') step(1);
    else return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  return {
    show() { render(); screen.classList.add('on'); },
    hide() { closeLightbox(); screen.classList.remove('on'); },
  };
}
