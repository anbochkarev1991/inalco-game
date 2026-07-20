// Fully procedural WebAudio: no audio files. Wind, lake, radio static, drones,
// screams, footsteps, machines — all synthesized.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ok = false;
    this._hb = 0;
  }

  ensure() {
    if (this.ok) { this.ctx.resume().catch(() => {}); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      const master = ctx.createGain(); master.gain.value = 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 5;
      master.connect(comp); comp.connect(ctx.destination);
      this.master = master;

      this.noiseBuf = this._makeNoise(4);

      // --- wind: two band-passed noise layers, gusting ---
      this.wind = this._loopNoise(420, 3.5, 0.0);
      this.wind2 = this._loopNoise(160, 2.2, 0.0);
      this._gust = 0;

      // --- lake lapping: low-passed noise, pulsed in update ---
      this.lake = this._loopNoise(220, 1.4, 0.0);
      this.lake.filter.type = 'lowpass';
      this._lapT = 0;

      // --- radio static: the signature ---
      this.static = this._loopNoise(3200, 0.7, 0.0);
      this.static.filter.type = 'highpass';
      this._crackleT = 0;

      // --- whispering: formant-filtered noise, audible only when they're close ---
      this.whisper1 = this._loopNoise(520, 11, 0.0);
      this.whisper2 = this._loopNoise(980, 13, 0.0);
      this._whisperEnv = 0;

      // --- campfire: low rumble + random pops ---
      this.fire = this._loopNoise(240, 1.1, 0.0);
      this.fire.filter.type = 'lowpass';
      this._firePopT = 0;

      // --- night insects: a quiet cricket shimmer + steady field hiss. Its
      // ABSENCE is the scare — main.js ducks it to silence when a Returned is
      // near/manifesting or the tide spikes, then lets it fade back in during
      // lulls. Built ONCE here as a looped graph; only its master gain is
      // ramped each frame (never a node per frame).
      const insGain = ctx.createGain(); insGain.gain.value = 0.0; insGain.connect(master);
      this.insectsGain = insGain;
      // bright cricket trill: bandpassed noise pulsed by a hardware-rate LFO
      const insHiSrc = ctx.createBufferSource();
      insHiSrc.buffer = this.noiseBuf; insHiSrc.loop = true; insHiSrc.playbackRate.value = 1.5;
      const insHiFilt = ctx.createBiquadFilter();
      insHiFilt.type = 'bandpass'; insHiFilt.frequency.value = 4800; insHiFilt.Q.value = 9;
      const insHiTrem = ctx.createGain(); insHiTrem.gain.value = 0.55;
      const insLFO = ctx.createOscillator(); insLFO.type = 'sine'; insLFO.frequency.value = 6.7;
      const insLFODepth = ctx.createGain(); insLFODepth.gain.value = 0.5;
      insLFO.connect(insLFODepth); insLFODepth.connect(insHiTrem.gain);   // additive tremolo
      insHiSrc.connect(insHiFilt); insHiFilt.connect(insHiTrem); insHiTrem.connect(insGain);
      insHiSrc.start(0, Math.random() * 3); insLFO.start();
      // steady night-field hiss beneath the trill
      const insLoSrc = ctx.createBufferSource();
      insLoSrc.buffer = this.noiseBuf; insLoSrc.loop = true;
      const insLoFilt = ctx.createBiquadFilter();
      insLoFilt.type = 'bandpass'; insLoFilt.frequency.value = 2500; insLoFilt.Q.value = 3;
      const insLoGain = ctx.createGain(); insLoGain.gain.value = 0.4;
      insLoSrc.connect(insLoFilt); insLoFilt.connect(insLoGain); insLoGain.connect(insGain);
      insLoSrc.start(0, Math.random() * 3);
      this._insectNodes = { insHiSrc, insLoSrc, insLFO };   // keep refs alive
      this._insectsCur = 0;

      // --- dread drone: detuned low cluster ---
      const droneGain = ctx.createGain(); droneGain.gain.value = 0.0;
      droneGain.connect(master);
      this.droneGain = droneGain;
      this.droneOscs = [55, 55.7, 82.4, 110.5].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sine' : 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = i < 2 ? 0.5 : 0.16;
        o.connect(g); g.connect(droneGain); o.start();
        return o;
      });

      // --- generator hum (off) ---
      const genGain = ctx.createGain(); genGain.gain.value = 0; genGain.connect(master);
      const genOsc = ctx.createOscillator(); genOsc.type = 'square'; genOsc.frequency.value = 48;
      const genFilt = ctx.createBiquadFilter(); genFilt.type = 'lowpass'; genFilt.frequency.value = 240;
      genOsc.connect(genFilt); genFilt.connect(genGain); genOsc.start();
      this.genGain = genGain; this.genOsc = genOsc; this.genOn = false;

      // --- boat engine (off) ---
      const boatGain = ctx.createGain(); boatGain.gain.value = 0; boatGain.connect(master);
      const boatOsc = ctx.createOscillator(); boatOsc.type = 'sawtooth'; boatOsc.frequency.value = 38;
      const boatFilt = ctx.createBiquadFilter(); boatFilt.type = 'lowpass'; boatFilt.frequency.value = 300;
      boatOsc.connect(boatFilt); boatFilt.connect(boatGain); boatOsc.start();
      this.boatGain = boatGain; this.boatOsc = boatOsc;

      this.ok = true;
    } catch (e) {
      console.warn('Audio unavailable:', e);
    }
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;       // slightly pink
      d[i] = w * 0.6 + last * 3.2;
    }
    return buf;
  }

  _loopNoise(freq, Q, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = Q;
    const g = ctx.createGain(); g.gain.value = gain;
    const pan = ctx.createStereoPanner();
    src.connect(filter); filter.connect(g); g.connect(pan); pan.connect(this.master);
    src.start(0, Math.random() * 3);
    return { src, filter, gain: g, pan };
  }

  // One-shot helpers -------------------------------------------------------

  _tone(freq, dur, { type = 'sine', gain = 0.2, glideTo = null, pan = 0, attack = 0.01, delay = 0 } = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _burst(dur, freq, Q, gain, { pan = 0, type = 'bandpass', delay = 0, glideTo = null } = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.loop = true; src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = Q;
    if (glideTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.master);
    src.start(t0, Math.random() * 3); src.stop(t0 + dur + 0.05);
  }

  // Game events ------------------------------------------------------------

  footstep(surface) {
    if (!this.ok) return;
    const v = 0.85 + Math.random() * 0.3;
    if (surface === 'wood') {
      this._burst(0.09, 330 * v, 2.5, 0.14);
      this._tone(95 * v, 0.1, { type: 'sine', gain: 0.08 });
    } else if (surface === 'interior') {
      this._burst(0.08, 240 * v, 2, 0.10);
      this._tone(70 * v, 0.09, { type: 'sine', gain: 0.05 });
    } else {
      this._burst(0.11, 150 * v, 0.9, 0.09);
    }
  }

  flash() {
    // a real camera: mechanical shutter clack, xenon pop, then the
    // capacitor starts its long climb back
    this._burst(0.012, 2600, 3.5, 0.5, { type: 'bandpass' });          // shutter open
    this._burst(0.016, 1400, 2.5, 0.42, { delay: 0.05 });              // shutter close
    this._tone(62, 0.11, { type: 'sine', gain: 0.5 });                 // xenon thump
    this._burst(0.04, 6500, 0.4, 0.3, { type: 'highpass' });           // broadband crack
    this._tone(2800, 0.35, { gain: 0.016, glideTo: 2200 });            // tube ring-down
    this._tone(240, 5.4, { gain: 0.011, glideTo: 3300, attack: 2.6 }); // capacitor whine, rising
  }
  rechargeDone() {
    this._tone(3400, 0.05, { gain: 0.022 });
    this._burst(0.012, 3000, 4, 0.06, { delay: 0.06 });                // ready click
  }
  pickup() { this._tone(620, 0.3, { gain: 0.07 }); this._tone(930, 0.42, { gain: 0.05, delay: 0.05 }); }
  paper() { this._burst(0.16, 2600, 0.6, 0.09, { type: 'highpass' }); this._burst(0.1, 1800, 0.8, 0.06, { delay: 0.1 }); }
  key() { for (let i = 0; i < 3; i++) this._tone(2400 + Math.random() * 900, 0.05, { gain: 0.05, delay: i * 0.06 }); }
  doorCreak() { this._tone(210, 0.9, { type: 'sawtooth', gain: 0.035, glideTo: 150 }); this._burst(0.5, 500, 4, 0.04); }
  unlock() { this._tone(320, 0.06, { type: 'square', gain: 0.07 }); this._tone(240, 0.08, { type: 'square', gain: 0.08, delay: 0.09 }); }
  switchClick() { this._tone(900, 0.03, { type: 'square', gain: 0.08 }); }
  // bringing the camera up to / down from the eye: a soft strap-and-body shift
  cameraRaise() {
    this._burst(0.13, 780, 0.7, 0.05, { type: 'lowpass' });
    this._tone(210, 0.07, { type: 'sine', gain: 0.045, delay: 0.02 });
  }
  cameraLower() { this._burst(0.11, 620, 0.7, 0.04, { type: 'lowpass' }); }
  drawer() { this._burst(0.3, 350, 2, 0.1, { glideTo: 220 }); }
  uiClick() { this._tone(660, 0.04, { gain: 0.05 }); }
  dialogBlip() { this._tone(430 + Math.random() * 60, 0.03, { gain: 0.018 }); }

  horn() {
    this._tone(98, 2.6, { type: 'triangle', gain: 0.16, attack: 0.4 });
    this._tone(147, 2.6, { type: 'triangle', gain: 0.1, attack: 0.4 });
    this._tone(196, 2.4, { type: 'sine', gain: 0.05, attack: 0.5 });
  }

  pianoPlink() {
    const notes = [220, 233.1, 261.6, 311.1, 349.2];
    const f = notes[(Math.random() * notes.length) | 0];
    this._tone(f, 1.6, { type: 'triangle', gain: 0.12 });
    this._tone(f * 2.01, 1.2, { type: 'sine', gain: 0.04 });
  }

  owl(pan = 0) {
    // a distant two-note hoot — the peace indicator. Soft-attacked low sine
    // with a faint overtone: "hoo … hoo-hoo". main.js only fires it when calm.
    const base = 300 + Math.random() * 44;
    this._tone(base, 0.55, { type: 'sine', gain: 0.075, attack: 0.13, glideTo: base * 0.92, pan });
    this._tone(base * 2, 0.5, { type: 'sine', gain: 0.014, attack: 0.13, glideTo: base * 1.84, pan });
    this._tone(base * 0.97, 0.42, { type: 'sine', gain: 0.07, attack: 0.1, glideTo: base * 0.9, pan, delay: 0.72 });
    this._tone(base * 0.94, 0.5, { type: 'sine', gain: 0.07, attack: 0.1, glideTo: base * 0.88, pan, delay: 1.16 });
  }

  teros(pan = 0) {
    // southern lapwing alarm — sharp metallic "teru-teru-teru". The birds
    // panic before you see the thing; main.js fires it at mid range as an
    // early warning, never a siren.
    const n = 5 + ((Math.random() * 3) | 0);
    const base = 1500 + Math.random() * 320;
    for (let i = 0; i < n; i++) {
      const d = i * 0.125;
      this._tone(base * (0.9 + Math.random() * 0.2), 0.07, { type: 'square', gain: 0.055, glideTo: base * 1.5, attack: 0.004, pan, delay: d });
      this._burst(0.05, 3200 + Math.random() * 800, 6, 0.045, { type: 'bandpass', pan, delay: d });
    }
  }

  drip(pan = 0) {
    // a single drop of lake water hitting the ground, too close
    const f = 800 + Math.random() * 1100;
    this._tone(f, 0.05 + Math.random() * 0.04, { gain: 0.028 + Math.random() * 0.02, glideTo: f * 0.5, pan });
    this._burst(0.02, 3000 + Math.random() * 1500, 4, 0.02, { pan, delay: 0.01 });
  }

  manifest(pan = 0) {
    this._burst(1.4, 900, 0.5, 0.12, { pan, glideTo: 2400 });
    this._tone(66, 1.6, { type: 'sine', gain: 0.12, attack: 0.9, pan });
  }

  // c2 · the lake says your name. A formant-shaped "A-na" in a loved voice: a
  // sawtooth glottal buzz through three parallel formant bandpasses, articulated
  // A → (n) → a. It is deliberately WRONG — the pitch sags a touch flat and too
  // slow, the way a memory of a voice is almost right. No speech samples: pure
  // synthesis. Used by the "don't answer the water" call.
  nameCall(pan = 0) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime, master = this.master;
    const pn = ctx.createStereoPanner(); pn.pan.value = pan; pn.connect(master);
    const out = ctx.createGain(); out.gain.value = 1; out.connect(pn);

    // glottal source — a low, motherly buzz that sags flat as it lands (too slow)
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    const f0 = 172;
    src.frequency.setValueAtTime(f0 * 1.02, t0);
    src.frequency.linearRampToValueAtTime(f0 * 0.93, t0 + 1.55);

    // three formant bandpasses in parallel = one vowel
    const mkF = (freq, q, g) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      src.connect(f); f.connect(gg); gg.connect(out);
      return f;
    };
    const F1 = mkF(700, 7, 1.0);
    const F2 = mkF(1100, 9, 0.5);
    mkF(2550, 10, 0.12);

    // articulate the word on F1/F2: open "A", a nasal "n" dip, open "a"
    const artic = (F, a, n, a2) => {
      F.frequency.setValueAtTime(a, t0);
      F.frequency.setValueAtTime(a, t0 + 0.5);
      F.frequency.linearRampToValueAtTime(n, t0 + 0.72);
      F.frequency.linearRampToValueAtTime(a2, t0 + 0.98);
    };
    artic(F1, 700, 300, 690);
    artic(F2, 1100, 900, 1080);

    // two-syllable amplitude envelope with a soft nasal trough between
    const g = out.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(0.11, t0 + 0.16);    // "Ah"
    g.exponentialRampToValueAtTime(0.05, t0 + 0.68);    // into "n" (dip)
    g.exponentialRampToValueAtTime(0.095, t0 + 0.95);   // "na"
    g.exponentialRampToValueAtTime(0.0001, t0 + 1.65);
    src.start(t0); src.stop(t0 + 1.75);

    // a faint breath riding the word — air, not tone
    const br = ctx.createBufferSource(); br.buffer = this.noiseBuf; br.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1500; bf.Q.value = 0.7;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t0);
    bg.gain.linearRampToValueAtTime(0.014, t0 + 0.2);
    bg.gain.linearRampToValueAtTime(0.002, t0 + 0.7);
    bg.gain.linearRampToValueAtTime(0.010, t0 + 1.0);
    bg.gain.linearRampToValueAtTime(0.0001, t0 + 1.6);
    br.connect(bf); bf.connect(bg); bg.connect(pn);
    br.start(t0, Math.random() * 3); br.stop(t0 + 1.75);

    // the water's weight under the voice
    this._tone(52, 1.4, { type: 'sine', gain: 0.05, attack: 0.3, pan });
  }

  scream(pan, kind) {
    // shaped noise, not synths — the lake has no vocal cords, only pressure
    if (kind === 'doble') {
      for (let i = 0; i < 4; i++)
        this._burst(0.055, 1600 + i * 480, 9, 0.3, { pan, delay: i * 0.055, glideTo: 3600 });
      this._tone(46, 0.55, { type: 'sine', gain: 0.26, pan });
      this._burst(0.5, 5200, 0.6, 0.12, { type: 'highpass', pan, delay: 0.2 });
    } else if (kind === 'archivero') {
      this._burst(1.7, 340, 2.6, 0.42, { pan, glideTo: 82 });
      this._burst(1.0, 150, 1.4, 0.3, { pan, delay: 0.25, glideTo: 60 });
      this._tone(36, 1.5, { type: 'sine', gain: 0.3, pan, attack: 0.35 });
    } else {
      this._burst(0.9, 650, 6, 0.42, { pan, glideTo: 3100 });           // rising shriek
      for (let i = 0; i < 3; i++)
        this._burst(0.07, 2500, 10, 0.3, { pan, delay: 0.6 + i * 0.09 }); // stutter
      this._tone(56, 0.75, { type: 'sine', gain: 0.28, pan });
      this._burst(0.7, 300, 0.7, 0.18, { pan, delay: 0.15, glideTo: 140 }); // chest rasp
    }
  }

  // E2 · the testigo ("The Half-Seen") — a drowned throat. Core of its voice set:
  // a labored breath built as bandpassed noise (a broad breath band that glides
  // with the air + a low resonant throat formant = the water sitting in it),
  // shaped by a breath envelope and fluttered by a fast LFO so the air comes
  // through wet and RAGGED. `wet` scales the throat resonance; `rattle` scales the
  // flutter depth (decoupled so the pinned inhale can be DRY yet still rattle);
  // `band` shifts the whole breath up/down (a gurgle sits low). inhale swells late
  // and draws the filter up; exhale hits early and empties downward. Every param
  // is jittered per call so no two breaths are identical. One-shot, self-stopping;
  // routes through this.master like every other voice.
  _wetBreath(pan = 0, { inhale = false, dur = 1.6, gain = 0.8, rate = 24, wet = 0.55, rattle = null, band = 1 } = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const rt = rattle == null ? wet * 0.5 : rattle;

    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;

    // AIRY breath band — a BROAD, bright "hhhh" in the ~500–2500 Hz region. Low Q
    // passes a wide slice of noise so it reads as AIR, not a tone. Draws UP on an
    // inhale, empties DOWN on an exhale, but stays in the airy region either way.
    const air = ctx.createBiquadFilter(); air.type = 'bandpass';
    const a0 = (inhale ? 850 + Math.random() * 220 : 1500 + Math.random() * 320) * band;
    const a1 = (inhale ? 1900 + Math.random() * 420 : 820 + Math.random() * 220) * band;
    air.frequency.setValueAtTime(Math.max(60, a0), t0);
    air.frequency.exponentialRampToValueAtTime(Math.max(60, a1), t0 + dur);
    air.Q.value = 0.5 + Math.random() * 0.35;               // broad → energetic + airy
    const airG = ctx.createGain(); airG.gain.value = 1.0;

    // WET throat formant sitting UNDER the air — a low resonant ring = the water
    // in the throat (its level scaled by `wet`).
    const th = ctx.createBiquadFilter(); th.type = 'bandpass';
    th.frequency.value = (180 + Math.random() * 120) * band; th.Q.value = 3.5 + Math.random() * 2.5;
    const thG = ctx.createGain(); thG.gain.value = 0.75 * wet;

    // RATTLE — flutter the amplitude with a fast LFO for waterlogged raggedness.
    // Bounded so it NEVER nulls the signal: gain rides in [1-depth .. 1].
    const depth = Math.min(0.7, rt);
    const rat = ctx.createGain(); rat.gain.value = 1 - depth * 0.5;   // midpoint
    const lfo = ctx.createOscillator(); lfo.type = 'sawtooth';
    lfo.frequency.value = rate * (0.85 + Math.random() * 0.3);
    const lfoD = ctx.createGain(); lfoD.gain.value = depth * 0.5;
    lfo.connect(lfoD); lfoD.connect(rat.gain);

    // ENVELOPE — a real, sustained breath: swell in, brief hold, taper out (NOT a
    // puff). Inhale swells slower/later; exhale opens sooner then rides out.
    const env = ctx.createGain();
    const atk = inhale ? dur * 0.55 : dur * 0.30;
    const hold = dur * 0.16;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + atk);        // swell in
    env.gain.linearRampToValueAtTime(gain * 0.9, t0 + atk + hold);  // hold
    env.gain.linearRampToValueAtTime(0.0001, t0 + dur);      // taper out

    const p = ctx.createStereoPanner(); p.pan.value = pan;

    src.connect(air); air.connect(airG); airG.connect(rat);
    src.connect(th); th.connect(thG); thG.connect(rat);
    rat.connect(env); env.connect(p); p.connect(this.master);

    src.start(t0, Math.random() * 3); src.stop(t0 + dur + 0.05);
    lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  }

  // Shared formant "voice" (E3/E4): a sawtooth glottal source through parallel
  // bandpass formants (one vowel), summed into `dest`. Returns { osc, formants }
  // so the CALLER drives the pitch/articulation and owns osc.start/stop — that
  // way it composes for one-voice (the doble mimic) or many-voice (the archivero
  // choir) utterances. Mirrors nameCall's formant bank; allocates only per call.
  _glottalVowel(dest, formantSpecs) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const formants = formantSpecs.map(([freq, q, g]) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      osc.connect(f); f.connect(gg); gg.connect(dest);
      return f;
    });
    return { osc, formants };
  }

  // E3 · the Draft's MIMIC — a mangled half-word. The nameCall formant approach
  // (sawtooth glottal → parallel formant bandpasses) but WRONG: the pitch sags
  // flat and slows as it dies, the vowel slumps from one target toward another
  // and never lands, so it reads as an almost-right voice that isn't. Short, soft;
  // a faint breath rides it so it's a voice, not a tone. One-shot, self-stopping.
  _dobleMimic(pan = 0, I = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime, master = this.master;
    const pn = ctx.createStereoPanner(); pn.pan.value = pan; pn.connect(master);
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(pn);
    const dur = 0.5 + Math.random() * 0.45;

    // WRONG vowel: pick a start + end vowel (F1,F2) and slump between them
    const V = [[720, 1150], [560, 1820], [500, 900], [360, 760], [320, 2100]];
    const ai = (Math.random() * V.length) | 0;
    const a = V[ai], b = V[(ai + 2 + ((Math.random() * (V.length - 2)) | 0)) % V.length];

    const { osc, formants } = this._glottalVowel(out, [
      [a[0], 8, 1.0], [a[1], 10, 0.5], [2550, 11, 0.1],
    ]);
    // glottal pitch: a living register that sags flat + slows as it lands
    const f0 = 150 + Math.random() * 55;
    osc.frequency.setValueAtTime(f0 * (1.02 + Math.random() * 0.03), t0);
    osc.frequency.linearRampToValueAtTime(f0 * (0.84 + Math.random() * 0.05), t0 + dur);
    osc.detune.value = (Math.random() * 2 - 1) * 32;

    // articulate the half-word: hold the first vowel, then slump toward the
    // second TOO slowly across the back half, never resolving
    const [F1, F2] = formants;
    const morph = (F, s, e) => {
      F.frequency.setValueAtTime(s, t0);
      F.frequency.setValueAtTime(s, t0 + dur * 0.35);
      F.frequency.linearRampToValueAtTime(e, t0 + dur * 0.95);
    };
    morph(F1, a[0], b[0]); morph(F2, a[1], b[1]);

    // amplitude: soft attack, a mid slump (a consonant that isn't), a small
    // second lift, then an unresolved tail
    const g = out.gain, pk = (2.6 + Math.random() * 0.5) * I;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(pk, t0 + 0.09);
    g.exponentialRampToValueAtTime(pk * 0.4, t0 + dur * 0.45);
    g.exponentialRampToValueAtTime(pk * 0.7, t0 + dur * 0.68);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.05);

    // a faint breath riding the word — air, not tone
    const br = ctx.createBufferSource(); br.buffer = this.noiseBuf; br.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t0);
    bg.gain.linearRampToValueAtTime(0.02 * I, t0 + 0.12);
    bg.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    br.connect(bf); bf.connect(bg); bg.connect(pn);
    br.start(t0, Math.random() * 3); br.stop(t0 + dur + 0.05);

    // the weight of the body under the voice
    this._tone(50 + Math.random() * 12, dur * 0.7, { type: 'sine', gain: 0.05 * I, attack: 0.12, pan });
  }

  // E3 · the Draft's DRAG — a low, dry-ish body scraping on all fours: lowpassed
  // noise that grinds lower as it settles, punctuated by a couple of discrete
  // SCUFFS (limbs catching), a faint low weight beneath it. One-shot, self-stopping.
  _dobleDrag(pan = 0, I = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime, master = this.master;
    const dur = 0.55 + Math.random() * 0.5;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.55 + Math.random() * 0.4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520 + Math.random() * 180, t0);
    lp.frequency.linearRampToValueAtTime(230, t0 + dur);
    lp.Q.value = 0.7;
    const env = ctx.createGain();
    const base = (0.95 + Math.random() * 0.15) * I;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(base, t0 + dur * 0.18);
    // 2–3 scuffs at strictly-increasing times (a body catching + dragging on)
    const scuffs = 2 + ((Math.random() * 2) | 0);
    const seg = (dur * 0.72) / scuffs;
    let tPrev = t0 + dur * 0.18;
    for (let i = 0; i < scuffs; i++) {
      const c = t0 + dur * 0.2 + seg * (i + 0.5) + (Math.random() - 0.5) * seg * 0.3;
      const dipT = Math.min(t0 + dur * 0.9, Math.max(tPrev + 0.02, c));
      const upT = Math.min(t0 + dur * 0.95, dipT + dur * 0.08);
      env.gain.linearRampToValueAtTime(base * (0.4 + Math.random() * 0.2), dipT);
      env.gain.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.15), upT);
      tPrev = upT;
    }
    env.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(lp); lp.connect(env); env.connect(p); p.connect(master);
    src.start(t0, Math.random() * 3); src.stop(t0 + dur + 0.05);
    // the weight of it
    this._tone(46 + Math.random() * 12, dur * 0.7, { type: 'sine', gain: 0.06 * I, attack: 0.12, pan });
  }

  // E4 · the archivero ("The Drowned Choir-Column") — a COLUMN of drowned faces
  // singing as one. 3–4 detuned formant voices (sawtooth glottal → formant
  // bandpasses, per nameCall) on a slow sustained vowel, pitched to a WRONG /
  // dissonant cluster (a semitone / minor-third / tritone stack), each sagging +
  // detuned so they beat and shimmer against each other — a choir that isn't
  // quite together. Slow attack + release = a swell of voices; a low resonant
  // weight sits beneath it. Cluster / vowel / timing randomized per call. A single
  // swelling one-shot that FULLY stops — no always-on drone, no node accumulation.
  _archiveroChoir(pan = 0, I = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, t0 = ctx.currentTime, master = this.master;
    const pn = ctx.createStereoPanner(); pn.pan.value = pan; pn.connect(master);
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(pn);

    const dur = 3.4 + Math.random() * 1.6;
    const n = 3 + ((Math.random() * 2) | 0);          // 3–4 voices
    const root = 88 + Math.random() * 40;             // low, resonant
    const CL = [[0, 1, 3, 6], [0, 1, 4, 6], [0, 2, 3, 8], [0, 1, 6, 7]];
    const semis = CL[(Math.random() * CL.length) | 0];
    const VW = [[650, 1100], [520, 900], [430, 820], [600, 1020]];
    const [f1, f2] = VW[(Math.random() * VW.length) | 0];

    for (let i = 0; i < n; i++) {
      const vg = ctx.createGain(); vg.gain.value = 0.85 / n; vg.connect(out);
      const { osc } = this._glottalVowel(vg, [
        [f1 * (0.97 + Math.random() * 0.06), 7, 1.0],
        [f2 * (0.97 + Math.random() * 0.06), 9, 0.5],
        [2500, 10, 0.1],
      ]);
      const f0 = root * Math.pow(2, semis[i] / 12);
      osc.frequency.setValueAtTime(f0 * (1.005 + Math.random() * 0.01), t0);
      osc.frequency.linearRampToValueAtTime(f0 * (0.965 + Math.random() * 0.02), t0 + dur);  // sags flat
      osc.detune.value = (Math.random() * 2 - 1) * 16;
      osc.start(t0); osc.stop(t0 + dur + 0.1);
    }

    // swell: slow attack, gentle sustain, slow release — a rising column of voices
    const g = out.gain, pk = (3.9 + Math.random() * 0.7) * I;
    const atk = dur * (0.38 + Math.random() * 0.08);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(pk, t0 + atk);
    g.exponentialRampToValueAtTime(pk * 0.88, t0 + dur * 0.72);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);

    // the water's weight beneath the column
    this._tone(root * 0.5, dur, { type: 'sine', gain: 0.09 * I, attack: atk, pan });
  }

  // E1 · per-monster utterance DISPATCHER. Each active Returned periodically emits
  // a randomized, spatialized vocalization (scheduled + gated in enemies.js; the
  // Director computes pan/intensity and calls this). Routes to a per-kind one-shot
  // built from _tone/_burst, so everything runs through this.master and respects
  // setMasterVolume. opts carries { dist, state, intensity } for later tasks;
  // intensity (distance-based, from the Director) scales the placeholder gain.
  //
  // ROUGH PLACEHOLDERS — deliberately unpolished. E2 (testigo breath), E3 (doble
  // click), E4 (archivero choir) REPLACE these; the human listens later to judge
  // quality. Pitch/length are randomized per call so repeats vary.
  monsterVoice(kind, pan = 0, opts = {}) {
    if (!this.ok) return;
    const I = opts.intensity ?? 1;
    if (kind === 'doble') {
      // E3 · "The Draft" — the lake's fresh copy of a LIVING person, mimicking a
      // voice WRONGLY. Its horror is near-SILENCE: a real body standing/being
      // watched is quiet, so when standing it rarely voices and only faintly;
      // when crawling unwatched (opts.state chase/search — the crawl states) it is
      // more vocal — a mangled half-word (primary) or a wet body-drag. opts.variant
      // ('mimic'|'drag') is a dev/audition hook (scripts/voiceshots.mjs) that
      // FORCES a branch; the game never sets it, so play randomization is unchanged.
      const forced = opts.variant ?? null;
      const st = opts.state;
      const crawling = st === 'chase' || st === 'search';   // unwatched, on all fours
      if (forced === 'drag') { this._lastVoiceVariant = 'drag'; this._dobleDrag(pan, I); }
      else if (forced === 'mimic') { this._lastVoiceVariant = 'mimic'; this._dobleMimic(pan, I); }
      else if (crawling) {
        if (Math.random() < 0.7) { this._lastVoiceVariant = 'mimic'; this._dobleMimic(pan, I); }
        else { this._lastVoiceVariant = 'drag'; this._dobleDrag(pan, I); }
      } else {
        // watched / standing: nearly silent — usually nothing, rarely a faint half-word
        if (Math.random() < 0.35) { this._lastVoiceVariant = 'mimic'; this._dobleMimic(pan, I * 0.5); }
        else this._lastVoiceVariant = 'silent';
      }
    } else if (kind === 'archivero') {
      // E4 · "The Drowned Choir-Column" — it SINGS. A layered, out-of-phase,
      // dissonant hymn that swells and fades: see _archiveroChoir.
      this._lastVoiceVariant = 'choir';
      this._archiveroChoir(pan, I);
    } else if (kind === 'testigo') {
      // E2 · "The Half-Seen" — a long-drowned throat. Three voices, selected by
      // stare-pressure: PINNED (_pin high, or mid-lunge) → a dry, strained,
      // rising RATTLE-inhale (the effort of being seen). Otherwise a wet ragged
      // BREATH ~72% of the time, an occasional throat GURGLE / wet click ~28%.
      // opts.variant ('breath'|'gurgle'|'click'|'pinned') is a dev/audition hook
      // (scripts/voiceshots.mjs) that FORCES a branch; the game never sets it, so
      // per-call randomization is unchanged in play.
      const pin = opts.pin ?? 0, lunge = opts.lunge ?? 0;
      const forced = opts.variant ?? null;
      const pinned = forced === 'pinned' || (!forced && (pin > 0.6 || lunge > 0.5));
      let variant;
      if (pinned) variant = 'pinned';
      else if (forced) variant = forced;
      else if (Math.random() < 0.72) variant = 'breath';
      else if (Math.random() < 0.6) variant = 'gurgle';
      else variant = 'click';
      this._lastVoiceVariant = variant;

      if (variant === 'pinned') {
        // DRY, tight, tense, RISING rattle-inhale + a strained reed + bright
        // drawn-air hiss — the effort of being seen. Distinct from the breath:
        // less wet, faster/deeper flutter, band pushed up, everything climbing.
        const dur = 1.3 + Math.random() * 0.5;
        this._wetBreath(pan, {
          inhale: true, dur, gain: (1.55 + Math.random() * 0.4) * I,
          rate: 34 + Math.random() * 14, wet: 0.14, rattle: 0.58, band: 1.5,
        });
        const s0 = 130 + Math.random() * 40;                     // strained reed, rising
        this._tone(s0, dur * 0.9, { type: 'sawtooth', gain: 0.09 * I, glideTo: s0 * (1.6 + Math.random() * 0.5), attack: dur * 0.45, pan });
        this._burst(dur * 0.85, 2600 + Math.random() * 1000, 1.0, 0.22 * I, { type: 'highpass', pan, glideTo: 4000 }); // thin, bright drawn air
      } else if (variant === 'breath') {
        // WET ragged breath — mostly exhale, sometimes a drawn inhale; a low
        // close chest weight sits under the airy "hhhh".
        const inh = Math.random() < 0.4;
        this._wetBreath(pan, {
          inhale: inh, dur: 1.5 + Math.random() * 0.6, gain: (1.6 + Math.random() * 0.4) * I,
          rate: 20 + Math.random() * 10, wet: 0.5 + Math.random() * 0.2, rattle: 0.26 + Math.random() * 0.12,
        });
        this._tone(48 + Math.random() * 14, 1.0 + Math.random() * 0.4, { type: 'sine', gain: 0.14 * I, attack: 0.3, pan });
      } else if (variant === 'gurgle') {
        // throat GURGLE — a low, very wet, waterlogged catch + discrete bubbles
        this._wetBreath(pan, {
          inhale: false, dur: 0.9 + Math.random() * 0.5, gain: (1.6 + Math.random() * 0.4) * I,
          rate: 12 + Math.random() * 8, wet: 0.9, rattle: 0.55, band: 0.5,
        });
        const n = 3 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const bf = 90 + Math.random() * 110;
          this._tone(bf, 0.06 + Math.random() * 0.05, { type: 'sine', gain: 0.16 * I, glideTo: bf * 0.55, pan, delay: i * (0.06 + Math.random() * 0.07) });
        }
      } else {
        // wet CLICK / glottal catch — a short, sharp wet snap, a low pop, a wet
        // tail. Percussive and brief by design, but clearly audible + distinct.
        this._burst(0.06 + Math.random() * 0.03, 800 + Math.random() * 600, 2.5, 1.5 * I, { pan, glideTo: 320 });
        this._tone(70 + Math.random() * 34, 0.16, { type: 'sine', gain: 0.6 * I, glideTo: 46, pan, delay: 0.03 });
        this._burst(0.09, 1600 + Math.random() * 700, 2, 0.3 * I, { type: 'bandpass', pan, delay: 0.02, glideTo: 700 });
      }
    } else {
      // fallback for any other kind — a short, wet, breathy exhale
      const dur = 0.3 + Math.random() * 0.32;
      const f = 360 + Math.random() * 200;
      this._burst(dur, f, 1.1, 0.10 * I, { pan, glideTo: f * 0.55 });
    }
  }

  childCry(pan = 0) {
    // a small, wet, hitching sob — pitch-bent noise, not a synth
    this._burst(0.5, 700, 5, 0.12, { pan, glideTo: 480 });
    this._burst(0.28, 900, 7, 0.09, { pan, delay: 0.5, glideTo: 620 });
    this._tone(300, 0.5, { type: 'sine', gain: 0.05, pan, glideTo: 250, delay: 0.1 });
  }

  childWail(pan = 0) {
    // the crying breaks into something that was never a child
    this._burst(1.1, 620, 6, 0.34, { pan, glideTo: 1600 });
    this._burst(0.9, 220, 2, 0.3, { pan, delay: 0.2, glideTo: 70 });
    this._tone(40, 1.3, { type: 'sine', gain: 0.3, pan, attack: 0.2 });
    for (let i = 0; i < 3; i++) this._burst(0.08, 2400, 9, 0.22, { pan, delay: 0.7 + i * 0.1 });
  }

  hitSting() {
    this._burst(0.09, 2800, 1, 0.35, { type: 'highpass' });
    this._burst(0.4, 500, 1.2, 0.3, { glideTo: 120 });
    this._tone(48, 0.4, { type: 'sine', gain: 0.35 });
  }

  deathWash() {
    this._burst(2.6, 400, 0.4, 0.3, { glideTo: 4200, type: 'bandpass' });
    this._tone(52, 3, { type: 'sine', gain: 0.2, attack: 0.6 });
  }

  boatSputter() {
    for (let i = 0; i < 4; i++)
      this._tone(46 + Math.random() * 14, 0.12, { type: 'sawtooth', gain: 0.12, delay: i * 0.16, glideTo: 30 });
    this._burst(0.5, 300, 1, 0.09);
  }

  setBoat(on) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.boatGain.gain.cancelScheduledValues(t);
    this.boatGain.gain.linearRampToValueAtTime(on ? 0.16 : 0, t + 0.4);
  }

  setGenerator(on) {
    this.genOn = on;
    if (this.ok && on) { this._burst(0.7, 200, 1, 0.2, { glideTo: 500 }); this._tone(38, 0.8, { type: 'square', gain: 0.15, glideTo: 48 }); }
  }

  // Menu ambient music — a slow, evolving D-minor drone pad. Fully synthesized
  // (no files), on-theme dread: a low cluster under a filter that breathes, with
  // per-voice detune drift so it never sits still. Built lazily on first use and
  // left alive (near-silent when faded out) since the menu is short-lived.
  menuMusic(on) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on) {
      if (!this._menu) {
        const base = ctx.createGain(); base.gain.value = 0.0001;   // fade envelope
        const trem = ctx.createGain(); trem.gain.value = 1.0;      // breathing
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.6;
        base.connect(trem); trem.connect(lp); lp.connect(this.master);

        const swLFO = ctx.createOscillator(); swLFO.type = 'sine'; swLFO.frequency.value = 0.045;
        const swDepth = ctx.createGain(); swDepth.gain.value = 260;
        swLFO.connect(swDepth); swDepth.connect(lp.frequency); swLFO.start();

        const trLFO = ctx.createOscillator(); trLFO.type = 'sine'; trLFO.frequency.value = 0.07;
        const trDepth = ctx.createGain(); trDepth.gain.value = 0.18;
        trLFO.connect(trDepth); trDepth.connect(trem.gain); trLFO.start();

        const voices = [
          { f: 73.42, type: 'sine', g: 0.5 },       // D2
          { f: 110.0, type: 'sine', g: 0.34 },      // A2
          { f: 146.83, type: 'triangle', g: 0.26 }, // D3
          { f: 174.61, type: 'triangle', g: 0.2 },  // F3 (minor third)
          { f: 293.66, type: 'sine', g: 0.06 },     // D4 shimmer
        ];
        const oscs = voices.map((v, i) => {
          const o = ctx.createOscillator(); o.type = v.type; o.frequency.value = v.f * (1 + (i - 2) * 0.0009);
          const g = ctx.createGain(); g.gain.value = v.g;
          const dLFO = ctx.createOscillator(); dLFO.type = 'sine'; dLFO.frequency.value = 0.03 + i * 0.007;
          const dDepth = ctx.createGain(); dDepth.gain.value = 0.12 + i * 0.03;   // cents of detune drift
          dLFO.connect(dDepth); dDepth.connect(o.detune); dLFO.start();
          o.connect(g); g.connect(base); o.start();
          return o;
        });
        this._menu = { base };
      }
      this._menu.base.gain.cancelScheduledValues(t);
      this._menu.base.gain.setTargetAtTime(0.12, t, 1.4);      // fade in
    } else if (this._menu) {
      this._menu.base.gain.cancelScheduledValues(t);
      this._menu.base.gain.setTargetAtTime(0.0001, t, 0.8);    // fade out
    }
  }

  // Continuous update ------------------------------------------------------

  update(dt, p) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const set = (param, v, tc = 0.25) => param.setTargetAtTime(v, t, tc);

    // wind with slow gust cycles
    this._gust += dt;
    const gust = 0.6 + 0.4 * Math.sin(this._gust * 0.23) * Math.sin(this._gust * 0.071 + 2);
    set(this.wind.gain.gain, 0.055 * p.wind * gust, 0.6);
    set(this.wind2.gain.gain, 0.075 * p.wind * (1.25 - gust * 0.5), 0.8);
    this.wind.pan.pan.value = Math.sin(this._gust * 0.1) * 0.5;

    // lake laps
    this._lapT += dt;
    const lap = Math.max(0, Math.sin(this._lapT * 2.2)) ** 3 * 0.5 + 0.5;
    set(this.lake.gain.gain, 0.11 * p.lake * lap, 0.15);

    // night insects — a quiet living bed whose SILENCE warns of the Returned.
    // Fast ramp to silence when danger nears (p.insects drops), slow fade back
    // in during lulls, so the cut reads as "something is here". Only the master
    // gain is touched; the graph itself was built once in ensure().
    const insTarget = 0.05 * (p.insects ?? 0);
    const insTc = insTarget < this._insectsCur ? 0.45 : 2.2;   // fast cut, slow return
    this._insectsCur = insTarget;
    set(this.insectsGain.gain, insTarget, insTc);

    // campfire — rumble + pops when near
    const fireLvl = p.fire ?? 0;
    set(this.fire.gain.gain, 0.14 * fireLvl, 0.3);
    if (fireLvl > 0.05) {
      this._firePopT -= dt;
      if (this._firePopT <= 0) {
        this._firePopT = 0.15 + Math.random() * 0.8;
        this._burst(0.03 + Math.random() * 0.04, 900 + Math.random() * 1800, 1.5, 0.08 * fireLvl);
      }
    }

    // whispering — syllable-like flutter, panned wide
    const wLvl = p.whisper ?? 0;
    this._whisperEnv += dt * (4 + Math.random() * 7);
    const syllable = Math.max(0, Math.sin(this._whisperEnv)) * (Math.random() > 0.3 ? 1 : 0.15);
    set(this.whisper1.gain.gain, 0.07 * wLvl * syllable, 0.05);
    set(this.whisper2.gain.gain, 0.045 * wLvl * (1 - syllable * 0.6), 0.05);
    this.whisper1.pan.pan.value = Math.sin(this._gust * 0.9) * 0.7;
    this.whisper2.pan.pan.value = -Math.sin(this._gust * 0.7) * 0.7;
    if (wLvl > 0.05) {
      this.whisper1.filter.frequency.value = 420 + Math.random() * 300;
      this.whisper2.filter.frequency.value = 850 + Math.random() * 500;
    }

    // radio static + crackle impulses
    set(this.static.gain.gain, 0.4 * p.static, 0.07);
    if (p.static > 0.06) {
      this._crackleT -= dt;
      if (this._crackleT <= 0) {
        this._crackleT = 0.04 + Math.random() * 0.3 * (1.1 - p.static);
        this._burst(0.02 + Math.random() * 0.03, 2500 + Math.random() * 3000, 1, 0.1 * p.static + 0.04, { type: 'highpass' });
      }
    }

    set(this.droneGain.gain, 0.16 * p.drone, 1.2);
    set(this.genGain.gain, this.genOn ? 0.1 * p.genProximity : 0, 0.3);

    // heartbeat
    if (p.heartbeat > 0) {
      this._hb -= dt;
      if (this._hb <= 0) {
        this._hb = 60 / (62 + p.heartbeat * 55);
        this._tone(58, 0.1, { type: 'sine', gain: 0.22 });
        this._tone(46, 0.09, { type: 'sine', gain: 0.16, delay: 0.14 });
      }
    }
  }
}
