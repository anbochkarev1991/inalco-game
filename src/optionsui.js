// The options overlay: a small settings screen, currently a graphics-quality
// selector (Auto / Low / Medium / High) that drives the adaptive quality
// manager (src/quality.js). Openable from the pause screen and the main menu,
// mirroring the journal overlay. Pure presentation — it only reads/writes the
// quality module's public API.

import { quality } from './quality.js';

export function buildOptionsUI({ onBack }) {
  const $ = (id) => document.getElementById(id);
  const screen = $('options-screen');
  const back = $('options-back');
  const autoHint = $('options-auto-hint');
  const choices = [...screen.querySelectorAll('.opt-choice')];

  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  // Reflect the live quality state: highlight the active mode and, when AUTO,
  // show which tier the governor is currently running.
  function refresh() {
    const mode = quality.getMode();
    choices.forEach((b) => b.classList.toggle('on', b.dataset.q === mode));
    autoHint.textContent = mode === 'auto' ? `Auto — currently: ${cap(quality.getTier())}` : '';
  }

  choices.forEach((b) => b.addEventListener('click', () => {
    const q = b.dataset.q;
    if (q === 'auto') quality.setMode('auto');   // re-arm the governor
    else quality.setTier(q);                     // manual pick — disables the governor
    refresh();                                   // update highlight + auto hint
  }));
  back.addEventListener('click', () => onBack?.());

  return {
    show() { refresh(); screen.classList.add('on'); },
    hide() { screen.classList.remove('on'); },
  };
}
