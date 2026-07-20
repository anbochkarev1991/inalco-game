// Main menu controller. Owns the #menu-screen DOM: a Continue button (only when
// a checkpoint exists), Begin (new game), and Options. Hands the actual
// game-start / restore back to main.js via callbacks so this stays UI-only.

import { save } from './save.js';

export function buildMenu({ onNewGame, onContinue }) {
  const $ = (id) => document.getElementById(id);
  const screen = $('menu-screen');
  const btnContinue = $('menu-continue');
  const btnNew = $('menu-new');
  const contInfo = $('menu-continue-info');

  btnContinue.addEventListener('click', () => onContinue?.());
  btnNew.addEventListener('click', () => onNewGame?.());

  function refresh() {
    const s = save.summary();
    if (s) {
      btnContinue.style.display = '';
      btnNew.textContent = 'NEW GAME';
      contInfo.textContent = `where you left off — ${s.objective} · evidence ${s.evidence}/6`;
    } else {
      btnContinue.style.display = 'none';
      btnNew.textContent = 'BEGIN';
      contInfo.textContent = '';
    }
  }

  return {
    show() { refresh(); screen.classList.add('on'); },
    hide() { screen.classList.remove('on'); },
    refresh,
  };
}
