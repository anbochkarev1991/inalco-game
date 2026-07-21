// Adaptive quality manager (TIER LE, Step LE-1).
//
// Owns a single active render tier and the GPU levers that scale it. The HIGH
// tier reproduces *exactly* today's settings, so a capable machine is never
// touched; MEDIUM and LOW trade look for fill-rate/pass-count on weak hardware.
//
//   pixel ratio   HIGH min(dpr,1.25) · MEDIUM 1.0 · LOW 0.75
//   shadows       HIGH PCFSoft/1024  · MEDIUM 512  · LOW off
//   bloom         HIGH full res      · MEDIUM half · LOW off (pass skipped)
//   MSAA          HIGH/MEDIUM on     · LOW off (reload-only — set at renderer build)
//   fog sprites   HIGH 70            · MEDIUM 45   · LOW 20
//   fog density   HIGH ×1.0          · MEDIUM ×0.9 · LOW ×0.8
//   dust motes    HIGH 300           · MEDIUM 200  · LOW 100
//
// Everything except MSAA applies LIVE and idempotently. apply() only invokes a
// lever's setter when the value actually changes, so:
//   • applying HIGH over the boot state calls NOTHING → byte-identical to today;
//   • a live tier switch touches only the deltas → no mass shader recompile.
//
// Mode is persisted under `inalco.quality` as { mode } where mode is one of
// 'auto' | 'low' | 'medium' | 'high'. 'auto' resolves through detect() (a
// conservative startup probe that defaults to HIGH). The LE-2 governor is the
// real safety net, so detect() only downshifts on strong weak-hardware signals.

const LS_KEY = 'inalco.quality';
const MODES = ['auto', 'low', 'medium', 'high'];

// The lever table. pixelRatio is a function so HIGH tracks the live devicePixelRatio.
const TIERS = {
  high: {
    pixelRatio: () => Math.min(window.devicePixelRatio || 1, 1.25),
    shadows: true, shadowMapSize: 1024,
    bloom: true, bloomRes: 1.0,
    antialias: true,
    fogSprites: 70, fogDensity: 1.0,
    motes: 300,
  },
  medium: {
    pixelRatio: () => 1.0,
    shadows: true, shadowMapSize: 512,
    bloom: true, bloomRes: 0.5,
    antialias: true,
    fogSprites: 45, fogDensity: 0.9,
    motes: 200,
  },
  low: {
    pixelRatio: () => 0.75,
    shadows: false, shadowMapSize: 512,
    bloom: false, bloomRes: 0.5,
    antialias: false,
    fogSprites: 20, fogDensity: 0.8,
    motes: 100,
  },
};

// ------------------------------------------------------------------ persistence
// Storage shape: { mode, hint? }. `mode` is the persisted mode (LE-1). `hint` is
// the LE-2 governor's settled auto tier — a *start hint* only, written WITHOUT
// leaving auto, so a machine the governor drove down starts there next launch
// while auto stays armed. Manual modes persist EXACTLY { mode } (unchanged from
// LE-1): switching to a manual tier drops any stale hint.
function readState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (e) { return {}; }
}
function readMode() {
  const m = readState().mode;
  return MODES.includes(m) ? m : 'auto';
}
function readHint() {
  const h = readState().hint;
  return TIERS[h] ? h : null;
}
function writeMode(mode) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ mode })); } catch (e) { /* private mode */ }
}
// Governor start-hint: persist the settled tier while keeping mode = 'auto'.
function writeHint(tier) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ mode: 'auto', hint: tier })); } catch (e) { /* private mode */ }
}

// --------------------------------------------------------------- startup probe
// CONSERVATIVE by design: default HIGH; only step down on strong weak-hardware
// signals. The LE-2 frame-time governor is the real safety net, so we would
// rather start a borderline machine at HIGH and let the governor settle it than
// wrongly downgrade a capable one here.
//
// NOTE: software rasterizers (SwiftShader / llvmpipe) are deliberately NOT
// treated as weak. They only appear as a driverless fallback or when a headless
// test harness forces them (this repo's screenshot harnesses launch Chrome with
// --enable-unsafe-swiftshader on otherwise-fast machines); flagging them would
// both silently drop those harnesses off the HIGH reference look and count as an
// "aggressive downgrade" of a capable host. A real machine that is genuinely too
// slow — software-rendered or not — is caught by the LE-2 governor at runtime.
function detect() {
  try {
    const cores = navigator.hardwareConcurrency || 8;
    let gpu = '';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();   // release the probe context so it doesn't linger
    }
    // A dual-core (or worse) machine is the clearest hardware weak signal.
    if (cores <= 2) return 'low';
    // Genuinely old integrated / mobile GPUs — narrow markers so no modern part
    // (and no SwiftShader/Metal/ANGLE test string) matches by accident.
    const oldGpu = /\bgma\b|mali-4\d\d|mali-t6|powervr sgx|adreno [23]\d\d\b|geforce (8|9)\d{2}\b|hd graphics (2000|3000|4000)\b/.test(gpu);
    if (oldGpu) return 'medium';
    return 'high';
  } catch (e) {
    return 'high';
  }
}

// ------------------------------------------------------------------- singleton
let _refs = null;       // { renderer, scene, camera, world, fxpipe, applyResize }
let _mode = 'auto';     // persisted mode
let _active = 'high';   // currently applied tier name
// The levers we've actually pushed to the scene. Initialised in init() to the
// live boot state so applying HIGH is a genuine no-op (parity with pre-change).
let _applied = null;

function apply(name) {
  const t = TIERS[name] || TIERS.high;
  _active = TIERS[name] ? name : 'high';
  if (!_refs || !_applied) return;   // levers plumb through init(); nothing to do pre-init
  const { renderer, world, fxpipe, applyResize } = _refs;

  // pixel ratio — resize the composer to match so postfx/polaroid stay aligned
  const pr = t.pixelRatio();
  if (pr !== _applied.pixelRatio) {
    renderer.setPixelRatio(pr);
    _applied.pixelRatio = pr;
    if (typeof applyResize === 'function') applyResize();
  }

  // shadows: stop the pass (renderer.shadowMap.enabled) + the caster's castShadow.
  // No material.needsUpdate en masse — the recompile, if any, is lazy + one-time.
  if (t.shadows !== _applied.shadows) {
    world.setShadows(t.shadows);
    _applied.shadows = t.shadows;
  }
  if (t.shadowMapSize !== _applied.shadowMapSize) {
    world.setShadowMapSize(t.shadowMapSize);
    _applied.shadowMapSize = t.shadowMapSize;
  }

  // bloom: toggle the pass + its internal resolution (no scene-material recompile)
  if (t.bloom !== _applied.bloom || t.bloomRes !== _applied.bloomRes) {
    fxpipe.setBloom(t.bloom, t.bloomRes);
    _applied.bloom = t.bloom;
    _applied.bloomRes = t.bloomRes;
  }

  // fog: reuse existing sprites (toggle .visible) + scale the scene fog density
  if (t.fogSprites !== _applied.fogSprites) {
    world.setFogSpriteCount(t.fogSprites);
    _applied.fogSprites = t.fogSprites;
  }
  if (t.fogDensity !== _applied.fogDensity) {
    world.setFogDensityScale(t.fogDensity);
    _applied.fogDensity = t.fogDensity;
  }

  // dust motes: clamp the Points draw range to cut additive-overdraw fill cost
  // (never rebuilds geometry). HIGH matches the boot state (300) → never called.
  if (t.motes !== _applied.motes) {
    world.setMoteCount(t.motes);
    _applied.motes = t.motes;
  }
}

// =============================================================== LE-2 governor
// A frame-time governor that, ONLY in auto mode, steps the tier DOWN one notch
// when the machine is *sustainably* struggling, with strong hysteresis so it can
// never oscillate. This is what makes a weak PC smooth without the player ever
// touching Options.
//
// It measures wall-clock frame time itself (performance.now() between calls) so
// it sees real stalls — main's `dt` is clamped at 0.05 s and would hide them.
//
// Robustness against spurious downgrades (a 200 ms spawn/GC spike must NOT trip
// it) comes from three layers:
//   1. anomaly rejection — single frames > GOV_ANOMALY_MS are ignored entirely,
//      so first-manifest / GC / tab-resume spikes never enter the mean;
//   2. a spike-diluting rolling mean (time-weighted EMA, ~1 s constant) — a lone
//      slow frame barely moves it;
//   3. a sustain requirement — the mean must stay slow for GOV_SUSTAIN_S before
//      any action.
// After any switch a cooldown ignores the governor and the window is reset, so it
// cannot chain-downshift or flip-flop.
//
// UPSHIFT IS INTENTIONALLY OMITTED (downshift-only). Climbing back into heavier
// settings mid-game risks exactly the stutter this tier exists to prevent, and
// the win (a marginally nicer look after conditions improve) is not worth a
// re-introduced hitch. A player who wants more can pick a manual tier in Options.
const GOV_SLOW_MS = 24;      // rolling-mean frame time above this ≈ <42 fps → "slow"
const GOV_ANOMALY_MS = 150;  // a single frame longer than this is a spike, not slowness — ignore it
const GOV_TAU_MS = 1000;     // EMA time constant (~1 s): a rolling mean that dilutes one-off spikes
const GOV_SUSTAIN_S = 2.0;   // the mean must stay slow this long before stepping down
const GOV_COOLDOWN_S = 5.0;  // after any switch, ignore the governor this long (anti-oscillation)
const TIER_ORDER = ['low', 'medium', 'high'];   // downshift walks toward index 0

let _govLast = 0;       // performance.now() of the previous observed frame (0 = need a baseline)
let _govMean = 0;       // rolling-mean frame time, ms (0 = window empty / just reset)
let _govSlowFor = 0;    // seconds the mean has stayed continuously above GOV_SLOW_MS
let _govCooldown = 0;   // seconds left before the governor may act again

function govReset() { _govLast = 0; _govMean = 0; _govSlowFor = 0; _govCooldown = 0; }

// Called once per frame from main's play path. No-op unless mode === 'auto'.
function observeFrame() {
  if (_mode !== 'auto') { if (_govLast) govReset(); return; }   // manual → inert; keep window clean for re-arm

  const now = performance.now();
  if (!_govLast) { _govLast = now; return; }   // first frame in the window: no delta yet
  const raw = now - _govLast;
  _govLast = now;

  // during the post-switch cooldown, only run the clock down
  if (_govCooldown > 0) { _govCooldown -= raw / 1000; return; }

  // layer 1: a lone huge frame (spawn/GC spike, tab-resume gap) carries no info
  // about sustained speed — drop it so it can't tip the mean or the sustain timer.
  if (raw > GOV_ANOMALY_MS) return;

  // layer 2: time-weighted EMA (slow frames occupy more wall time → weigh more)
  const a = 1 - Math.exp(-raw / GOV_TAU_MS);
  _govMean = _govMean > 0 ? _govMean + a * (raw - _govMean) : raw;

  // layer 3: sustain — the mean must stay slow continuously
  if (_govMean > GOV_SLOW_MS) _govSlowFor += raw / 1000;
  else _govSlowFor = 0;

  if (_govSlowFor >= GOV_SUSTAIN_S) {
    const i = TIER_ORDER.indexOf(_active);
    if (i > 0) {
      const next = TIER_ORDER[i - 1];
      apply(next);            // live tier switch (recompile-free), mode stays 'auto'
      writeHint(next);        // persist as the next-launch start hint
      _govCooldown = GOV_COOLDOWN_S;   // arm hysteresis + reset the window
      _govMean = 0;
      _govSlowFor = 0;
    } else {
      _govSlowFor = 0;        // already at LOW: nothing lower — just hold, don't spin
    }
  }
}

export const quality = {
  TIERS,

  // Read BEFORE renderer creation (MSAA is fixed at WebGLRenderer construction).
  // Manual LOW turns MSAA off; so does a governor-confirmed weak machine (auto +
  // a persisted LOW hint) so a relaunch starts fully low. Everything else → on.
  initialAntialias() {
    const mode = readMode();
    if (mode === 'low') return false;
    if (mode === 'auto' && readHint() === 'low') return false;
    return true;
  },

  detect,

  // Wire the live objects, snapshot the boot state, then resolve + apply the
  // active tier. `applyResize` re-runs main's resize path (setSize + fxpipe.setSize).
  init(refs) {
    _refs = refs;
    const { renderer } = refs;
    _applied = {
      pixelRatio: renderer.getPixelRatio(),          // = min(dpr,1.25) at boot
      shadows: renderer.shadowMap.enabled,           // true today
      shadowMapSize: TIERS.high.shadowMapSize,       // 1024 (player.spot today)
      bloom: true, bloomRes: 1.0,                    // full-res UnrealBloom today
      fogSprites: TIERS.high.fogSprites,             // 70 today
      fogDensity: 1.0,
      motes: TIERS.high.motes,                       // 300 today (geometry default draw range)
    };
    _mode = readMode();
    // In auto, start from the governor's persisted hint if it has one (a known-
    // weak machine starts low immediately); otherwise the conservative probe.
    // The governor stays armed either way and can still adapt from here.
    apply(_mode === 'auto' ? (readHint() || detect()) : _mode);
  },

  // Manual tier: persist + apply live. Disables the LE-2 auto governor (mode≠auto).
  setTier(name) {
    if (!TIERS[name]) return;
    _mode = name;
    writeMode(name);
    apply(name);
    govReset();   // manual override wins — the governor is now inert
  },

  // Auto mode: persist + apply, then re-arm the governor from a clean window.
  // Other modes route to setTier.
  setMode(mode) {
    if (mode === 'auto') {
      _mode = 'auto';
      writeMode('auto');
      govReset();
      apply(readHint() || detect());
    } else {
      this.setTier(mode);
    }
  },

  // Apply a tier WITHOUT changing the persisted mode — for the LE-2 governor.
  apply,

  // LE-2: call once per frame from main's play path (see main.js frame()).
  observeFrame,

  getTier() { return _active; },
  getMode() { return _mode; },
  // Governor telemetry (read-only) — handy for the LE-2 verification traces.
  govState() { return { mean: _govMean, slowFor: _govSlowFor, cooldown: _govCooldown }; },
};
