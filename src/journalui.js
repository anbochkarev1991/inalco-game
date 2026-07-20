// The journal overlay: a tabbed view of developed polaroids and the notes the
// player has read, rendered from the `journal` store. Openable from the pause
// screen. Pure presentation — no game state.

import { journal } from './journal.js';

export function buildJournalUI({ onBack }) {
  const $ = (id) => document.getElementById(id);
  const screen = $('journal-screen');
  const body = $('journal-body');
  const back = $('journal-back');
  const tabs = [...screen.querySelectorAll('.jtab')];
  let tab = 'photos';

  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function render() {
    tabs.forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    if (tab === 'photos') {
      const ph = journal.photos;
      body.innerHTML = ph.length
        ? `<div class="jphotos">${ph.slice().reverse().map((p) => `
            <figure class="jphoto">
              <img src="${p.dataUrl}" alt="" />
              <figcaption>${esc(p.caption)}</figcaption>
            </figure>`).join('')}</div>`
        : `<div class="jempty">No photographs yet. Left-click to raise the camera — what develops is kept here.</div>`;
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

  tabs.forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));
  back.addEventListener('click', () => onBack?.());

  return {
    show() { render(); screen.classList.add('on'); },
    hide() { screen.classList.remove('on'); },
  };
}
