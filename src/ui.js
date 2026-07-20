const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.els = {
      hud: $('hud'), objEs: $('objective-es'), objEn: $('objective-en'), evidence: $('evidence'),
      objSide: $('objective-side'),
      flashpip: $('flashpip'), prompt: $('prompt'), subtitle: $('subtitle'),
      note: $('note'), noteKind: $('note-kind'), noteTitle: $('note-title'), noteBody: $('note-body'),
      polaroid: $('polaroid'),
      viewfinder: $('viewfinder'), vfReticle: $('vf-reticle'),
      vfReady: $('vf-ready'), vfZoom: $('vf-zoom'), vfFrames: $('vf-frames'), vfShutter: $('vf-shutter'),
      title: $('title-screen'), pause: $('pause-screen'), death: $('death-screen'), end: $('end-screen'),
      endText: $('end-text'), endTitle: $('end-title'), endHint: $('end-hint'),
      endNarrative: $('end-narrative'), endCredits: $('end-credits'),
      fader: $('fader'),
    };
    this.subQueue = [];
    this.subT = 0;
    this.noteOpen = false;
    this._noteClose = null;
    this._polT = 0;
    this._twTimer = null;
  }

  // ---------- HUD ----------
  showHud(on) { this.els.hud.classList.toggle('on', on); }
  setObjective(es, en) {
    this.els.objEs.textContent = es || '';
    this.els.objEn.textContent = en || '';
  }
  setEvidence(n, total) {
    this.els.evidence.innerHTML = n > 0 ? `EVIDENCE <b>${n}</b>/${total}` : '';
  }
  setSide(text) { this.els.objSide.textContent = text || ''; }
  flashPip(charge, visible) {
    const el = this.els.flashpip;
    el.classList.toggle('on', visible);
    el.classList.toggle('ready', charge >= 1);
    el.textContent = charge >= 1 ? 'FLASH ◉ READY' : `FLASH ◌ ${Math.floor(charge * 100)}%`;
  }
  prompt(text) {
    const el = this.els.prompt;
    if (text) { el.textContent = text; el.classList.add('on'); }
    else el.classList.remove('on');
  }

  // ---------- subtitles ----------
  say(who, text, dur = 3.6) { this.subQueue.push({ who, text, dur }); }
  // is a line on screen or waiting? used so overheard NPC barks never stack on
  // or interrupt another subtitle.
  subtitleBusy() { return this.subT > 0 || this.subQueue.length > 0; }
  clearSubs() { this.subQueue.length = 0; this.subT = 0; this.els.subtitle.classList.remove('on'); }

  // ---------- note modal ----------
  showNote({ kind, title, body }, onClose) {
    this.noteOpen = true;
    this._noteClose = onClose;
    this.els.noteKind.textContent = kind;
    this.els.noteTitle.textContent = title;
    this.els.noteBody.textContent = body;
    this.els.note.classList.add('on');
  }
  closeNote() {
    if (!this.noteOpen) return;
    this.noteOpen = false;
    this.els.note.classList.remove('on');
    const cb = this._noteClose; this._noteClose = null;
    cb?.();
  }

  // ---------- polaroid ----------
  polaroid(dataUrl, caption) {
    const el = this.els.polaroid;
    el.querySelector('img').src = dataUrl;
    el.querySelector('.cap').textContent = caption;
    el.classList.add('on');
    this._polT = 7.5;
  }

  // ---------- camera viewfinder ----------
  // Driven every frame from the player's aim state. `aim` (0..1) fades the whole
  // finder in as the camera comes to the eye; the reticle "focuses" (tightens),
  // and turns green once the shutter is charged.
  viewfinder({ aim = 0, zoom = 1, charge = 1, frames = 0, active = false } = {}) {
    const vf = this.els.viewfinder;
    if (!vf) return;
    const show = active && aim > 0.012;
    vf.style.opacity = show ? Math.min(1, aim * 1.5).toFixed(3) : '0';
    if (this.els.vfReticle) {
      const sc = 1.18 - 0.18 * aim;           // eases from loose to locked focus
      this.els.vfReticle.style.transform = `translate(-50%,-50%) scale(${sc.toFixed(3)})`;
      this.els.vfReticle.classList.toggle('ready', charge >= 1);
    }
    if (this.els.vfReady) {
      const ready = charge >= 1;
      this.els.vfReady.textContent = ready ? 'FLASH ● READY' : `CHARGING · ${Math.floor(charge * 100)}%`;
      this.els.vfReady.classList.toggle('ready', ready);
    }
    if (this.els.vfZoom) this.els.vfZoom.textContent = `${zoom.toFixed(1)}×`;
    if (this.els.vfFrames) this.els.vfFrames.textContent = String(frames).padStart(3, '0');
  }
  // a quick SLR mirror-slap when the shutter fires
  shutterBlink() {
    const s = this.els.vfShutter;
    if (!s) return;
    s.classList.remove('fire');
    void s.offsetWidth;      // reflow so the animation restarts every shot
    s.classList.add('fire');
  }

  // ---------- screens ----------
  hideTitle() { this.els.title.classList.remove('on'); }
  showPause(on) { this.els.pause.classList.toggle('on', on); }
  showDeath(line) {
    this.els.death.querySelector('.line').textContent = line;
    this.els.death.classList.add('on');
  }
  hideDeath() { this.els.death.classList.remove('on'); }

  // The finale runs in three self-advancing phases so it never freezes:
  //   'typing'  — the narrative ending types out (info about THIS ending)
  //   'hold'    — the ending title fades in; a short dwell
  //   'credits' — the author/credits column scrolls up the screen (driven in
  //               update()); when it clears the top, onComplete fires → main menu
  // A keypress/click (main.js → endAdvance) fast-forwards whichever phase is live.
  showEnding(text, creditsHtml, onComplete) {
    const els = this.els;
    els.end.classList.add('on');
    els.endNarrative.classList.remove('gone');
    els.endTitle.classList.remove('on');
    els.endCredits.classList.remove('on');
    els.endCredits.style.transform = '';
    els.endCredits.innerHTML = creditsHtml || '';
    els.endHint.classList.remove('on');
    els.endText.textContent = '';
    this._endText = text;
    this._onEndComplete = onComplete;
    this._endPhase = 'typing';

    let i = 0;
    const step = () => {
      i += 1;
      els.endText.textContent = text.slice(0, i);
      if (i < text.length) this._twTimer = setTimeout(step, text[i - 1] === '\n' ? 420 : 26);
      else this._endTyped();
    };
    step();
  }

  _endTyped() {
    if (this._endPhase !== 'typing') return;
    this._endPhase = 'hold';
    clearTimeout(this._twTimer);
    this.els.endText.textContent = this._endText;
    this.els.endTitle.classList.add('on');
    this.els.endHint.textContent = 'press any key to continue';
    this.els.endHint.classList.add('on');
    this._twTimer = setTimeout(() => this._startCredits(), 4600);
  }

  _startCredits() {
    if (this._endPhase !== 'hold') return;
    this._endPhase = 'credits';
    clearTimeout(this._twTimer);
    const els = this.els;
    els.endNarrative.classList.add('gone');   // fade the narrative out
    els.endCredits.classList.add('on');        // fade the credits column in
    els.endHint.textContent = 'press any key for the menu';
    // Roll from just below the fold until the whole column has cleared the top.
    // Speed is derived from the travel so the roll lasts ~a fixed span regardless
    // of how tall the credits are (with a floor so short rolls aren't glacial).
    const vh = window.innerHeight || 800;
    const h = els.endCredits.offsetHeight || vh;
    this._creditPos = vh * 0.96;
    this._creditEnd = -(h + vh * 0.18);
    this._creditSpeed = Math.max(46, (this._creditPos - this._creditEnd) / 30);
    els.endCredits.style.transform = `translateY(${this._creditPos}px)`;
  }

  _endComplete() {
    if (this._endPhase === 'done') return;
    this._endPhase = 'done';
    clearTimeout(this._twTimer);
    const cb = this._onEndComplete; this._onEndComplete = null;
    cb?.();
  }

  // Skip/fast-forward the current finale phase (any key or click on the end screen).
  endAdvance() {
    if (this._endPhase === 'typing') this._endTyped();
    else if (this._endPhase === 'hold') this._startCredits();
    else if (this._endPhase === 'credits') this._endComplete();
  }

  hideEnding() {
    clearTimeout(this._twTimer);
    this._endPhase = 'done';
    const els = this.els;
    els.end.classList.remove('on');
    els.endNarrative.classList.remove('gone');
    els.endTitle.classList.remove('on');
    els.endCredits.classList.remove('on');
    els.endCredits.style.transform = '';
    els.endHint.classList.remove('on');
  }

  fade(black, slow = true) {
    this.els.fader.style.transition = slow ? 'opacity 1.6s' : 'opacity .12s';
    this.els.fader.classList.toggle('clear', !black);
  }
  setFadeWhite(white) { this.els.fader.classList.toggle('white', white); }

  // ---------- per-frame ----------
  update(dt) {
    // finale credits roll: scroll the column up until it clears the top, then
    // hand control back (→ main menu). Runs even while the sim is paused.
    if (this._endPhase === 'credits') {
      this._creditPos -= this._creditSpeed * dt;
      this.els.endCredits.style.transform = `translateY(${this._creditPos}px)`;
      if (this._creditPos <= this._creditEnd) this._endComplete();
    }
    if (this._polT > 0) {
      this._polT -= dt;
      if (this._polT <= 0) this.els.polaroid.classList.remove('on');
    }
    const sub = this.els.subtitle;
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) sub.classList.remove('on');
    } else if (this.subQueue.length) {
      const s = this.subQueue.shift();
      sub.innerHTML = (s.who ? `<span class="who">${s.who}</span>` : '') + s.text;
      sub.classList.add('on');
      this.subT = s.dur;
    }
  }
}
