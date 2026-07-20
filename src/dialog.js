// Branching dialogue runner. Trees are plain objects:
//   { id: { who, text|fn, effect?, choices?: [{label|fn, if?, next, effect?}], next?, end? } }
// The sim pauses while a dialog is open (main checks dialog.open).

const $ = (id) => document.getElementById(id);

export class Dialog {
  constructor(audio) {
    this.audio = audio;
    this.els = {
      root: $('dialog'), who: $('dialog-who'), text: $('dialog-text'),
      choices: $('dialog-choices'), hint: $('dialog-hint'),
    };
    this.open = false;
    this.tree = null;
    this.node = null;
    this.ctx = null;
    this._typeTimer = null;
    this._typing = false;
    this._full = '';
    this._visibleChoices = [];
    this.onClose = null;
  }

  start(tree, startId, ctx, onClose) {
    this.tree = tree;
    this.ctx = ctx;
    this.onClose = onClose ?? null;
    this.open = true;
    this.els.root.classList.add('on');
    this._enter(startId);
  }

  _enter(id) {
    const node = this.tree[id];
    if (!node) { this.close(); return; }
    this.node = node;
    node.effect?.(this.ctx);
    const text = typeof node.text === 'function' ? node.text(this.ctx) : node.text;
    this.els.who.textContent = node.who ?? '';
    this.els.choices.innerHTML = '';
    this.els.hint.textContent = '';
    this._full = text;
    this._typing = true;
    this.els.text.textContent = '';
    let i = 0;
    clearInterval(this._typeTimer);
    this._typeTimer = setInterval(() => {
      i += 2;
      this.els.text.textContent = this._full.slice(0, i);
      if (i % 14 === 0) this.audio.dialogBlip?.();
      if (i >= this._full.length) this._finishType();
    }, 18);
  }

  _finishType() {
    clearInterval(this._typeTimer);
    this._typing = false;
    this.els.text.textContent = this._full;
    const node = this.node;
    this._visibleChoices = (node.choices ?? []).filter((c) => !c.if || c.if(this.ctx));
    if (this._visibleChoices.length) {
      this.els.choices.innerHTML = this._visibleChoices
        .map((c, i) => {
          const label = typeof c.label === 'function' ? c.label(this.ctx) : c.label;
          return `<div class="ch" data-i="${i}"><b>${i + 1}.</b> ${label}</div>`;
        }).join('');
      this.els.hint.textContent = 'PRESS 1–' + this._visibleChoices.length;
      for (const el of this.els.choices.querySelectorAll('.ch')) {
        el.addEventListener('click', () => this.choose(+el.dataset.i));
      }
    } else {
      this.els.hint.textContent = node.end || !node.next ? '[E] CLOSE' : '[E] CONTINUE';
    }
  }

  advance() {
    if (!this.open) return;
    if (this._typing) { this._finishType(); return; }
    if (this._visibleChoices.length) return;    // must pick a number
    const node = this.node;
    if (node.end || !node.next) this.close();
    else this._enter(node.next);
  }

  choose(i) {
    if (!this.open || this._typing) return;
    const c = this._visibleChoices[i];
    if (!c) return;
    this.audio.uiClick?.();
    c.effect?.(this.ctx);
    if (c.next) this._enter(c.next);
    else this.close();
  }

  close() {
    clearInterval(this._typeTimer);
    this.open = false;
    this.els.root.classList.remove('on');
    const cb = this.onClose; this.onClose = null;
    cb?.();
  }
}
