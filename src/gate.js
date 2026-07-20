// The mobile / touch "desktop only" gate. Self-contained: it injects its own
// styles + DOM, runs a TV-signal-degradation effect (visual + audio), and offers
// a way back (copy the link for later) plus an honest "enter anyway" escape hatch.
//
// The conceit: you were told this is a desktop investigation. Stay on this screen
// and the signal starts to rot — stable for the first ~20 s, then a slow climb into
// static that plateaus at an oppressive-but-legible peak. Never a strobe (seizure-
// safe), never harsh, and fully quieted for prefers-reduced-motion.

// ----------------------------------------------------------------- config
// Repoint this at whatever you actually want the "follow" button to open. Since the
// game ships from GitHub Pages, the repo is a fine target too, e.g.
//   'https://github.com/anbochkarev1991/inalco-game'
const FOLLOW_URL = 'https://anbochkarev1991.itch.io/inalco'; // TODO: set to your real itch.io (or GitHub) page
const FOLLOW_LABEL = 'FOLLOW ON ITCH.IO';

const STABLE = 20;   // seconds the signal holds before it begins to degrade
const RAMP = 45;     // seconds from first degradation to the capped peak

export function showGate({ onEnter } = {}) {
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  injectStyle();
  const root = buildDOM();
  document.body.appendChild(root);

  const audio = createAudio(reduced);
  const noise = createNoise(root.querySelector('.mg-noise'));
  const scan = root.querySelector('.mg-scan');
  const wordmark = root.querySelector('.mg-wordmark');

  // ------------------------------------------------------------- effect loop
  let elapsed = 0, last = performance.now(), raf = 0, frame = 0;

  function computeIntensity(t) {
    let i = (t - STABLE) / RAMP;
    i = Math.max(0, Math.min(1, i));
    i = i * i * (3 - 2 * i);             // smoothstep — no hard onset
    if (reduced) i = Math.min(i, 0.26);  // gentle ceiling when motion is unwelcome
    return i;
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += dt;                       // advances only while visible (see visibility)
    frame++;

    const i = computeIntensity(elapsed);
    noise.render(i, elapsed, frame, reduced);
    audio.setLevel(i);

    // the content degrades with the signal; the CTA stays crisp (it lives above the
    // canvas). Faintly legible at peak — bright text punches through the static.
    scan.style.opacity = String(0.12 + i * 0.5);
    if (!reduced) {
      const j = i * 3.2;                 // chromatic-aberration split grows with decay
      const jitter = (Math.random() - 0.5) * i * 5;
      wordmark.style.textShadow =
        `${-j}px 0 rgba(177,58,46,.8), ${j}px 0 rgba(159,216,255,.8), 0 0 30px rgba(159,216,255,.2)`;
      wordmark.style.transform = `translateX(${jitter.toFixed(2)}px)`;
      wordmark.style.opacity = String(1 - i * 0.55 + (Math.random() < i * 0.06 ? -0.35 : 0));
    }
  }
  raf = requestAnimationFrame(loop);

  // ------------------------------------------------------------- audio unlock
  // Browsers block audio until a user gesture; arm on the first touch/click/key.
  const unlock = () => audio.unlock();
  const gestureEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];
  gestureEvents.forEach((e) => window.addEventListener(e, unlock, { once: true, passive: true }));

  // ------------------------------------------------------------- tab visibility
  // Don't cook the battery in a backgrounded tab, and don't count hidden time as
  // "staying" — pause the loop + audio, resume cleanly.
  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf); raf = 0;
      audio.suspend();
    } else if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
      audio.resume();
    }
  };
  document.addEventListener('visibilitychange', onVis);

  // ------------------------------------------------------------- teardown
  function teardown() {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    gestureEvents.forEach((e) => window.removeEventListener(e, unlock));
    audio.close();
    root.remove();
    const st = document.getElementById('mg-style');
    if (st) st.remove();
  }

  // ------------------------------------------------------------- buttons
  const cleanUrl = location.origin + location.pathname; // the shareable game URL
  const copyBtn = root.querySelector('#mg-copy');
  copyBtn.addEventListener('click', async () => {
    audio.unlock();
    let ok = false;
    try { await navigator.clipboard.writeText(cleanUrl); ok = true; } catch (_) {}
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = cleanUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    copyBtn.textContent = ok ? 'LINK COPIED ✓' : cleanUrl;
    clearTimeout(copyBtn._t);
    copyBtn._t = setTimeout(() => { copyBtn.textContent = 'COPY LINK'; }, 2400);
  });

  const enterBtn = root.querySelector('#mg-enter');
  enterBtn.addEventListener('click', () => {
    teardown();
    if (onEnter) onEnter();
  });

  return { teardown };
}

// ----------------------------------------------------------------- noise
// A chunky low-res static field scaled up over the screen (cheap even on weak GPUs),
// plus a slow rolling h-sync bar and occasional horizontal tears as it decays. The
// small source buffer is reused frame to frame so we don't churn the GC.
function createNoise(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  const NW = 200;                        // source width; height tracks aspect
  let NH = 120, src = null, sctx = null, simg = null;

  function makeSource() {
    src = document.createElement('canvas');
    src.width = NW; src.height = NH;
    sctx = src.getContext('2d');
    simg = sctx.createImageData(NW, NH);
  }
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    const dpr = 1;                       // static is coarse by design — 1x is plenty
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    NH = Math.max(2, Math.round(NW * (H / Math.max(1, W))));
    makeSource();
    ctx.imageSmoothingEnabled = false;   // keep the CRT chunkiness
  }
  resize();
  window.addEventListener('resize', resize);

  function refill() {
    const d = simg.data;
    for (let p = 0; p < d.length; p += 4) {
      const v = (Math.random() * 255) | 0;
      d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
    }
    sctx.putImageData(simg, 0, 0);
  }

  function render(i, elapsed, frame, reduced) {
    const cw = canvas.width, ch = canvas.height;
    // during the stable phase barely touch it — a faint "signal present" hum only
    if (i > 0.02 || frame % 6 === 0) refill();

    ctx.clearRect(0, 0, cw, ch);
    ctx.globalAlpha = 0.05 + i * 0.82;   // capped so the message stays faintly legible
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, NW, NH, 0, 0, cw, ch);

    if (!reduced && i > 0.28) {
      // horizontal tears — brief, small, more likely as decay deepens
      const tears = Math.random() < i * 0.5 ? 1 + ((Math.random() * 2) | 0) : 0;
      for (let k = 0; k < tears; k++) {
        const y = Math.random() * ch;
        const bh = ch * (0.015 + Math.random() * 0.05);
        const dx = (Math.random() * 2 - 1) * cw * 0.12 * i;
        const sy = (y / ch) * NH, sh = (bh / ch) * NH;
        ctx.drawImage(src, 0, sy, NW, sh, dx, y, cw, bh);
      }
      // slow rolling h-sync bar (gentle, seizure-safe)
      const barH = ch * 0.16;
      const y = ((elapsed * 42) % (ch + barH)) - barH;
      const g = ctx.createLinearGradient(0, y, 0, y + barH);
      g.addColorStop(0, 'rgba(207,214,210,0)');
      g.addColorStop(0.5, `rgba(207,214,210,${(i * 0.16).toFixed(3)})`);
      g.addColorStop(1, 'rgba(207,214,210,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, y, cw, barH);
    }
    ctx.globalAlpha = 1;
  }

  return { render };
}

// ----------------------------------------------------------------- audio
// A low-passed white-noise hiss whose level tracks the decay intensity. Silent until
// a gesture unlocks it (autoplay policy), gentler ceiling under reduced-motion.
function createAudio(reduced) {
  let ctx = null, src = null, gain = null;
  const peak = reduced ? 0.05 : 0.17;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 4200;
    gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
    src.start();
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setLevel(i) { if (ctx && gain) gain.gain.setTargetAtTime(peak * i, ctx.currentTime, 0.25); },
    suspend() { try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (_) {} },
    resume() { try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (_) {} },
    close() { try { if (src) src.stop(); if (ctx) ctx.close(); } catch (_) {} },
  };
}

// ----------------------------------------------------------------- DOM + style
function buildDOM() {
  const root = document.createElement('div');
  root.id = 'mg';
  root.className = 'mg';
  root.innerHTML = `
    <div class="mg-bg"></div>
    <div class="mg-fog"></div>
    <div class="mg-content">
      <div class="mg-eyebrow">INALCO · FIELD ARCHIVE</div>
      <div class="mg-wordmark">INALCO</div>
      <div class="mg-rule"></div>
      <p class="mg-msg">This investigation was made for a <b>desktop terminal</b> —
        keyboard, mouse, and a steady hand on the shutter. The mobile expedition kit
        is still being assembled.</p>
      <p class="mg-sub">Return to a computer to continue. The lake will keep.</p>
    </div>
    <canvas class="mg-noise"></canvas>
    <div class="mg-scan"></div>
    <div class="mg-vig"></div>
    <div class="mg-cta">
      <button class="mg-btn" id="mg-copy" type="button">COPY LINK</button>
      <a class="mg-btn mg-link" id="mg-itch" href="${FOLLOW_URL}" target="_blank" rel="noopener">${FOLLOW_LABEL}</a>
      <button class="mg-btn mg-ghost" id="mg-enter" type="button">ENTER ANYWAY · CONTROLS MAY NOT WORK</button>
    </div>`;
  return root;
}

function injectStyle() {
  if (document.getElementById('mg-style')) return;
  const s = document.createElement('style');
  s.id = 'mg-style';
  s.textContent = `
  .mg{ position:fixed; inset:0; z-index:99999; overflow:hidden; pointer-events:auto;
       font-family:Georgia,'Times New Roman',serif; color:var(--bone,#e6e1d3);
       -webkit-user-select:none; user-select:none; -webkit-tap-highlight-color:transparent; }
  .mg-bg{ position:absolute; inset:0;
    background:radial-gradient(120% 90% at 50% 110%, #0d1822 0%, #05080c 55%, #030407 100%); }
  .mg-fog{ position:absolute; inset:-20%;
    background:
      radial-gradient(45% 30% at 30% 60%, rgba(120,150,165,.10), transparent 70%),
      radial-gradient(50% 34% at 72% 44%, rgba(110,140,160,.08), transparent 70%),
      radial-gradient(38% 26% at 55% 75%, rgba(130,160,175,.07), transparent 70%);
    animation:fogdrift 26s ease-in-out infinite alternate; }
  .mg-content{ position:absolute; inset:0; z-index:1; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center;
    padding:calc(env(safe-area-inset-top) + 40px) 28px calc(env(safe-area-inset-bottom) + 190px); }
  .mg-eyebrow{ font-family:'Courier New',monospace; font-size:11px; letter-spacing:.34em;
    color:#5f6b6e; margin-bottom:22px; }
  .mg-wordmark{ font-size:min(17vw,92px); letter-spacing:.34em; text-indent:.34em; font-weight:400;
    color:#dfe6e4; text-shadow:0 0 30px rgba(159,216,255,.22), 0 4px 26px #000; will-change:transform,opacity; }
  .mg-rule{ width:46px; height:1px; background:rgba(230,225,211,.32); margin:26px 0; }
  .mg-msg{ width:min(460px,88vw); font-size:clamp(15px,4.4vw,18.5px); line-height:1.62;
    color:var(--bone,#e6e1d3); text-shadow:0 2px 10px rgba(0,0,0,.9); }
  .mg-msg b{ color:#fff; font-weight:400; }
  .mg-sub{ width:min(460px,88vw); margin-top:16px; font-style:italic; font-size:clamp(12px,3.6vw,15px);
    color:var(--bone-dim,#b9b3a4); text-shadow:0 2px 10px rgba(0,0,0,.9); }
  /* width/height are required: a <canvas> is a replaced element, so inset:0 alone
     leaves it at its intrinsic 300x150 instead of filling the screen. */
  .mg-noise{ position:absolute; inset:0; width:100%; height:100%; display:block;
    z-index:2; pointer-events:none; }
  .mg-scan{ position:absolute; inset:0; z-index:3; pointer-events:none; opacity:.12;
    background:repeating-linear-gradient(to bottom,
      rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,.28) 3px, rgba(0,0,0,0) 4px); }
  .mg-vig{ position:absolute; inset:0; z-index:3; pointer-events:none;
    box-shadow:inset 0 0 200px 44px rgba(0,0,0,.72); }
  .mg-cta{ position:absolute; left:0; right:0; bottom:0; z-index:4;
    display:flex; flex-direction:column; align-items:center; gap:12px;
    padding:18px 20px calc(env(safe-area-inset-bottom) + 24px); }
  .mg-btn{ pointer-events:auto; cursor:pointer; display:flex; align-items:center; justify-content:center;
    text-decoration:none; box-sizing:border-box; min-height:50px; width:min(340px,88vw);
    background:rgba(10,14,18,.62); color:var(--bone,#e6e1d3);
    font-family:'Courier New',monospace; font-size:13px; letter-spacing:.2em; text-transform:uppercase;
    padding:14px 20px; border:1px solid rgba(230,225,211,.32);
    transition:background .18s, border-color .18s, color .18s; }
  .mg-btn:active{ background:rgba(159,216,255,.14); border-color:rgba(230,225,211,.7); color:#fff; }
  .mg-ghost{ background:transparent; border-color:rgba(230,225,211,.16); color:#7d8a80;
    font-size:11px; letter-spacing:.16em; min-height:44px; }
  @media (prefers-reduced-motion: reduce){ .mg-fog{ animation:none; } }
  `;
  document.head.appendChild(s);
}
