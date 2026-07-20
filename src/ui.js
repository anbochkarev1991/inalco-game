const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.els = {
      hud: $('hud'), objEs: $('objective-es'), objEn: $('objective-en'), evidence: $('evidence'),
      objSide: $('objective-side'),
      flashpip: $('flashpip'), prompt: $('prompt'), subtitle: $('subtitle'),
      note: $('note'), noteKind: $('note-kind'), noteTitle: $('note-title'), noteBody: $('note-body'),
      polaroid: $('polaroid'),
      title: $('title-screen'), pause: $('pause-screen'), death: $('death-screen'), end: $('end-screen'),
      endText: $('end-text'), endTitle: $('end-title'), endHint: $('end-hint'),
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

  // ---------- screens ----------
  hideTitle() { this.els.title.classList.remove('on'); }
  showPause(on) { this.els.pause.classList.toggle('on', on); }
  showDeath(line) {
    this.els.death.querySelector('.line').textContent = line;
    this.els.death.classList.add('on');
  }
  hideDeath() { this.els.death.classList.remove('on'); }

  showEnding(text, onTyped) {
    this.els.end.classList.add('on');
    const el = this.els.endText;
    el.textContent = '';
    let i = 0;
    const step = () => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i < text.length) {
        this._twTimer = setTimeout(step, text[i - 1] === '\n' ? 420 : 26);
      } else {
        this.els.endTitle.classList.add('on');
        this.els.endHint.classList.add('on');
        onTyped?.();
      }
    };
    step();
  }

  fade(black, slow = true) {
    this.els.fader.style.transition = slow ? 'opacity 1.6s' : 'opacity .12s';
    this.els.fader.classList.toggle('clear', !black);
  }
  setFadeWhite(white) { this.els.fader.classList.toggle('white', white); }

  // ---------- per-frame ----------
  update(dt) {
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
