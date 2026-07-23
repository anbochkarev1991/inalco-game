import * as THREE from 'three';
import { PAL, TUNE, LAYOUT } from './config.js';
import { Colliders } from './colliders.js';
import { GameAudio } from './audio.js';
import { UI } from './ui.js';
import { createPostFX } from './postfx.js';
import { preloadAssets } from './assets.js';
import { buildWorld } from './world.js';
import { buildBuildings } from './mansion.js';
import { buildNPCs, preloadNpcTextures } from './npcs.js';
import { Player } from './player.js';
import { Director, preloadMonsterTextures } from './enemies.js';
import { Dialog } from './dialog.js';
import { Story, PHOTO_CAPTIONS } from './story.js';
import { createNight } from './night.js';
import { buildVignettes } from './vignettes.js';
import { buildReveals } from './reveals.js';
import { buildRevisit } from './revisit.js';
import { save } from './save.js';
import { journal } from './journal.js';
import { buildMenu } from './menu.js';
import { buildJournalUI } from './journalui.js';
import { buildOptionsUI } from './optionsui.js';
import { quality } from './quality.js';

const params = new URLSearchParams(location.search);
// ?skipintro / ?newgame → auto-start a fresh run (skip menu + cutscene); the
// former keeps the headless tests working. ?menu → open the menu immediately.
const SKIP_INTRO = params.has('skipintro') || params.has('newgame');
const AUTO_START = params.has('skipintro') || params.has('newgame');
const SHOW_MENU = params.has('menu');

// the journal (photos + notes) persists across sessions — load it before play
journal.load();

// ------------------------------------------------------------------- set up
const app = document.getElementById('app');
// MSAA is fixed at renderer construction, so the quality tier must be consulted
// BEFORE this call. Only a persisted manual LOW turns it off (reload-only lever);
// auto/unknown/other tiers keep it on, exactly as today.
const renderer = new THREE.WebGLRenderer({ antialias: quality.initialAntialias(), powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.07;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(71, window.innerWidth / window.innerHeight, 0.08, 900);

// real 3D assets load before the world is built (title screen shows progress).
// STEP 16: the three preloads are mutually independent — each writes to its own
// private cache (assets → GLTF Map, monster → skinTex, NPC → NPCTEX) and shares
// no in-memory state, so they run CONCURRENTLY via Promise.all instead of back-
// to-back awaits. The only ordering requirement is that ALL of them finish before
// the world / NPCs / rigs build below (monster skin maps must be in place before
// a rig builds — the old first-spawn freeze; NPC wool maps before their bodies),
// which Promise.all still guarantees. The 28 GLTF models are the bulk of the wait,
// so they keep driving the visible n/total progress count.
// ---------- boot loading screen ----------
// #loader (index.html) is painted before any JS runs, so instead of a black
// rectangle the player sees the wordmark + a progress bar from the first frame.
// We drive its bar/status through the preload + warm-up, then fade it out.
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderStatus = document.getElementById('loader-status');
function setLoader(msg, frac) {
  if (loaderStatus && msg != null) loaderStatus.textContent = msg;
  if (typeof frac === 'number' && loaderFill) {
    loaderFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }
}
// The shader warm-up below reports no progress and would otherwise leave a full,
// static bar for several seconds — which reads as "frozen". Keep the fill slowly
// creeping toward (but never reaching) full over a long ease, so the wait stays
// alive until warm-up finishes and the whole screen fades. The always-sweeping
// shimmer (CSS) covers us even if the main thread stalls mid-compile.
function trickleLoader(msg) {
  if (loaderStatus && msg != null) loaderStatus.textContent = msg;
  if (!loaderFill) return;
  loaderFill.style.transition = 'width 9s linear';   // steady climb across the reserved span
  void loaderFill.offsetWidth;                        // commit the current width first
  loaderFill.style.width = '97%';
}
function hideLoader() {
  if (!loaderEl || loaderEl.classList.contains('gone')) return;
  loaderEl.classList.add('gone');
  setTimeout(() => { loaderEl.style.display = 'none'; }, 800);
}

const startEl = document.getElementById('title-start');
startEl.textContent = 'LOADING…';
setLoader('entering the fog', 0.03);
await Promise.all([
  // reserve the top ~22% of the bar for the shader warm-up that follows, so the
  // preload doesn't hit 100% and then appear to hang while warm-up runs — the
  // reserved span is where the bar visibly creeps during "preparing the night".
  preloadAssets((n, total) => {
    startEl.textContent = `LOADING ${n}/${total}`;
    setLoader(`raising the estancia · ${n}/${total}`, total ? (n / total) * 0.78 : 0.03);
  }),
  preloadMonsterTextures(),
  preloadNpcTextures(),
]);

const colliders = new Colliders();
const audio = new GameAudio();
const ui = new UI();
const world = buildWorld(scene, colliders);
const buildings = buildBuildings(scene, colliders);
const npcs = buildNPCs(scene, colliders);
const player = new Player(camera, scene, colliders, world.groundHeight, audio);
player.floorOverride = buildings.floorAt;   // multi-level: under-house cellar + the walkable second floor
// the upstairs mirror renders an "Anna" proxy on layer 2; let the flashlight reach her there
for (const L of [player.spot, player.handGlow, player.burst]) L?.layers?.enable(2);
const dialog = new Dialog(audio);
const fxpipe = createPostFX(renderer, scene, camera);
const fx = fxpipe.fx;

let pendingPolaroid = null;
let pendingReveal = null;       // b2: a photo-only reveal awaiting capture (see reveals.js)
let gameOverText = null;

// The credits roll shown after the ending narrative (see ui.showEnding). Author
// + how the game was made; scrolls up the screen, then returns to the main menu.
const CREDITS_HTML = `
  <h3>INALCO</h3>
  <div class="fin">a survival-horror experiment</div>

  <div class="role">written · designed · directed</div>
  <div class="name">Anton Bochkarev</div>

  <div class="rule"></div>

  <div class="role">made in collaboration with</div>
  <div class="name">Claude · Anthropic</div>
  <div class="blurb">This game is an experiment: an entire survival-horror world —
    its fog, its lake, and the Returned who wait in it — designed and built in
    conversation with an AI. Every system here began as a question and an answer.</div>

  <div class="rule"></div>

  <div class="role">built with</div>
  <div class="name">three.js · Web Audio · vanilla JavaScript</div>

  <div class="rule"></div>

  <div class="blurb">Thank you for spending a night on the lake.</div>
  <div class="fin">The lake keeps what it is given.<br>Give it nothing.</div>
`;

// a3: front-window gathering posts. When the generator is on, ambient Returned
// that aren't chasing drift up to the lit front windows and stand here, facing
// the house, at the edge of the light ("the lights bring them up to the
// windows... they stand exactly where the light ends"). x's match a2's front
// windows; z sits just OUTSIDE the 0.9 m wall standoff so a figure can reach it
// (never inside the house) and reads as a dark shape against the warm glow.
const WINDOW_POST_Z = LAYOUT.house.z + 7.7;   // front wall face ≈ z −7.25; posts ≈ 0.95 m in front
const windowPosts = [-8.5, -4.5, 5.5, 10].map((wx) => ({ x: LAYOUT.house.x + wx, z: WINDOW_POST_Z }));
let _massSeen = 0;   // staged one-time reactions to the breathing thing upstairs
// persistent ctx handed to buildings.update each frame for the upstairs thing
// (fields refreshed in place — no per-frame allocation)
const thingCtx = {
  playerPos: null, camDir: new THREE.Vector3(), upstairs: false,
  // the thing's scripted beats land here (see thething.js)
  onEvent: (name) => {
    if (name === 'lurch') {
      // the ENTRY LURCH — the "RUN" beat: it heaved toward the door. Loud,
      // hurting, unmistakable. (Proper massChorus voice lands at T11.)
      _massSeen = Math.max(_massSeen, 2);
      ui.say('ANA', 'It moved. It moved AT me— out. OUT—', 3.6);
      fx.glitch = Math.max(fx.glitch, 0.95);
      fx.damage = Math.max(fx.damage, 0.5);
      player.fearDrain(1.0, 9);                   // a sharp one-time composure hit
      audio.massCut();                            // the breath stops DEAD...
      audio.massScream(0, 0.35);                  // ...half a second, then the heave's voice
    } else if (name === 'shift') {
      // it repositioned while unobserved — a wet cue, no fanfare
      fx.glitch = Math.max(fx.glitch, 0.18);
      audio.massShift(0.2);
    }
  },
};

const director = new Director(scene, colliders, world.groundHeight, audio, {
  getPlayer: () => ({ pos: player.pos, dir: player.camDir(), flashOn: player.flashOn }),
  insideHouse: (x, z) => buildings.insideHouse(x, z),
  insideHouseM: (x, z, m) => buildings.insideHouseM(x, z, m),
  houseCenter: buildings.houseCenter,
  isPowered: () => buildings.isPowered(),
  windowPosts,
  onWatched: () => ui.say('ANA', 'They came up to the windows. Standing right at the edge of the light. Looking in at me.', 4.5),
  onHit: (dmg, pos) => {
    if (player.hit(dmg, pos)) {
      fx.damage = 1;
      fx.glitch = Math.max(fx.glitch, 0.9);
    }
  },
  onFirstPhoto: (kind) => { pendingPolaroid = kind; },
  onScare: () => story.onScareResolved(),
  onDissolve: () => {
    fx.flash = Math.max(fx.flash, 0.4);
    ui.say('ANA', 'It couldn’t hold itself together in front of the picture. Teo was right. It argues — and it can lose.', 4.2);
  },
  safeSpots: () => story.safeSpots(),
});

const story = new Story({
  scene, ui, audio, player, director, world, buildings, npcs, dialog, fx,
  onGameOver: (win, text) => { gameOverText = text; endSequence(); },
});

// the Night Engine: a continuous tide of dread the world breathes to. It
// drives Director pressure, fog density, the ambient audio floor and the sky
// veil, and its .tide / .phase are read by downstream systems via __niebla.
const night = createNight();
// c1: the story reads the night's phase to frame the escape around first light
// (the boat "crosses at first light") without owning the clock. Attached post-
// construction because night is created after the Story above.
story.night = night;

// Ambient vignettes: brief, unprompted, haunted events (a figure in a lit
// window, the far piano, a silhouette on the dock, a scream + fire flare, wet
// footprints, a shape at the treeline). Seeded on the night tide, gated to live
// PLAY only, never two at once. Built HERE — before warmUpRenderer() below — so
// its silhouette/footprint materials compile behind the title screen.
const vignettes = buildVignettes(scene, {
  world, buildings, npcs, audio, player, ui, camera, night, director,
});

// b2 · Camera as a lens of discovery: things visible ONLY in the polaroid — a
// figure in an "empty" window, a word in a fogged pane, a face in the shallows,
// figures at the crew camp and Delfina's grave. Every mesh is built HERE (hidden)
// BEFORE warmUpRenderer() below, so its shader compiles behind the title screen.
// Wired into the flash path: a real photo aimed at a spot surfaces it for the one
// flash-washed frame the polaroid captures, then it is hidden again.
const reveals = buildReveals(scene, { world, buildings, npcs, camera, ui });

// b3 · Places that change on revisit: as the night deepens and after key beats,
// the house & grounds quietly change while Ana is away — a door now ajar, the
// cellar drawing grown, the front salt scuffed, the piano lid up, a new scrap, a
// crooked portrait — so returning is unsettling and pays off. Its two chalk
// meshes are built HERE (one hidden), BEFORE warmUpRenderer() below, so their
// shaders compile behind the title screen; everything else toggles meshes that
// already exist. Ticked in the sim loop; changes apply only while she is away
// from the zone (never a morph in view) and each fires exactly once.
const revisit = buildRevisit(scene, { world, buildings, night, ui, audio, player, story });

// context the cellar girl needs to hunt Ana (movement + contact damage)
const girlCtx = {
  playerPos: player.pos,
  onHit: (dmg, pos) => { if (player.hit(dmg, pos)) { fx.damage = 1; fx.glitch = Math.max(fx.glitch, 0.9); } },
  audio,
};

// ------------------------------------------------- shader/pipeline warm-up
// Every material's shader compiles — and the driver builds its pipeline —
// the first time it is drawn. Left to gameplay, that is a second-long freeze
// the first time a Rumor manifests on screen, and shorter ones on entering
// each interior. Pay all of it here, behind the title screen, instead.
async function warmUpRenderer() {
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const rigs = ['testigo', 'doble', 'archivero'].map((k, i) =>
    director.spawn(k, camera.position.x + (i - 1) * 2, camera.position.z - 6));
  for (const e of rigs) e.group.scale.set(1, 1, 1);   // skip the manifest rise

  const saved = [];
  scene.traverse((o) => {
    saved.push([o, o.frustumCulled, o.visible]);
    o.frustumCulled = false;
    o.visible = true;
  });
  try {
    await renderer.compileAsync(scene, camera);
  } catch (e) { /* the draw below still compiles whatever this missed */ }
  fx.flash = 0.4; fx.glitch = 0.4; fx.staticVis = 0.4; fx.damage = 0.2;
  fxpipe.render(1 / 60, 0);      // draw everything once, postfx included
  await nextFrame();
  for (const [o, fc, v] of saved) { o.frustumCulled = fc; o.visible = v; }
  fx.flash = 0; fx.glitch = 0; fx.staticVis = 0; fx.damage = 0;
  for (const e of rigs) director.despawn(e);
}
startEl.textContent = 'PREPARING…';
trickleLoader('preparing the night');
try { await warmUpRenderer(); } catch (e) { console.warn('warm-up skipped:', e); }
startEl.textContent = 'CLICK TO BEGIN';
// warm-up is done and the rigs are despawned — lift the black fader that hid the
// building scene so the title screen becomes visible (auto-start clears it too),
// and fade out the boot loading screen that sat above it.
ui.fade(false);
hideLoader();

// Adaptive quality (TIER LE). Wire the sole shadow caster (player's flashlight
// spot) + the renderer into world so shadows can be scaled, then resolve/apply
// the active tier. At HIGH this is a no-op — every lever already matches the boot
// state, so a capable machine renders byte-identically to today. `applyResize`
// re-runs the resize path after any pixel-ratio change so postfx stays in sync.
world.attachRenderer(renderer, player.spot);
quality.init({ renderer, scene, camera, world, fxpipe, applyResize });

// ---------------------------------------------------------------- input
const input = { f: false, b: false, l: false, r: false, run: false, e: false };
let state = 'TITLE';   // TITLE | MENU | INTRO | PLAY | PAUSE | DEAD | END
let contextLost = false;   // WebGL context dropped (backgrounded tab / GPU reset) — see below
let overlay = null;    // null | 'options' | 'journal' (shown over MENU or PAUSE)
let introT = 0;
let introFired = new Set();
let holdItem = null, holdT = 0, holdConsumed = false;
let flashHintT = 26;
let raiseHintN = 3;     // times left to hint "hold right-click to raise the camera"
const SAVE_EVERY = 20;      // periodic autosave cadence (s of live play)
let saveT = SAVE_EVERY;

const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  // an open options/journal overlay: Esc backs out to whatever is underneath
  if (overlay) { if (e.code === 'Escape') closeOverlay(); return; }
  // the finale: any key fast-forwards the current credits phase (never freezes)
  if (state === 'END') { ui.endAdvance(); return; }
  const k = KEYMAP[e.code];
  if (k) input[k] = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;

  // dialog captures input first
  if (dialog.open) {
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') dialog.advance();
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
    if (digit !== undefined) dialog.choose(digit);
    return;
  }

  if (e.code === 'KeyE') {
    input.e = true;
    if (ui.noteOpen) { ui.closeNote(); return; }
    if (state === 'DEAD') { reviveFromDeath(); return; }
    if (state === 'PLAY') {
      const hit = story.currentInteract(player.pos, player.camDir());
      const holdS = hit && (typeof hit.item.hold === 'function' ? hit.item.hold() : hit.item.hold);
      if (hit && !holdS) story.interact(hit.item);
    }
  }
  if (e.code === 'KeyF' && state === 'PLAY' && !ui.noteOpen) {
    player.toggleFlashlight();
    world.setFlashlight(player.flashOn);
  }
  if (state === 'INTRO' && (e.code === 'Space' || e.code === 'Enter')) skipIntro();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
  // releasing E re-arms a hold: a completed hold (e.g. the generator toggle)
  // won't fire again until the player lets go and presses again
  if (e.code === 'KeyE') { input.e = false; holdConsumed = false; }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement && (state === 'PLAY' || state === 'INTRO'))
    player.look(e.movementX, e.movementY);
});

document.addEventListener('mousedown', (e) => {
  if (overlay) return;                              // options/journal have their own buttons
  if (state === 'END') { ui.endAdvance(); return; } // finale: click skips the current credits phase
  if (state === 'TITLE') { showMenu(); return; }    // title now leads to the menu
  if (state === 'MENU') return;                     // menu buttons handle their own clicks
  if (state === 'INTRO') { skipIntro(); return; }
  if (state === 'PAUSE') {
    // click empty space to resume, but never when a button/field was the target
    if (!e.target.closest('button, input, .jtab')) { audio.ensure(); requestLock(); }
    return;
  }
  if (state === 'PLAY' && document.pointerLockElement === renderer.domElement && !ui.noteOpen) {
    if (e.button === 2) { player.raiseCamera(true); return; }   // right-click: raise camera to the eye
    if (e.button !== 0) return;
    if (!player.aiming) {
      // the shutter only fires through the finder — nudge them to raise it first
      if (raiseHintN > 0) { ui.say('', '(hold right-click to raise the camera)', 2.6); raiseHintN--; }
      return;
    }
    if (player.tryFlash()) {
      ui.shutterBlink();
      fx.flash = Math.max(fx.flash, 0.85);
      const hits = director.flash(player.camera.position, player.camDir());
      buildings.cellar.girl.flash(player.camera.position, player.camDir());
      // the thing upstairs: photographing it triggers the in-place convulsion
      // (it NEVER leaves its spot); diminishing response — it learns the flash
      const convulsed = buildings.thing
        ? buildings.thing.flash(player.camera.position, player.camDir()) : 0;
      if (convulsed) {
        fx.glitch = Math.max(fx.glitch, 0.4 + 0.5 * convulsed);
        fx.damage = Math.max(fx.damage, 0.35 * convulsed);
        if (convulsed > 0.3) audio.massScream(0);   // the many-throated in-place scream
      }
      if (hits.length) {
        // an actual enemy photo wins and makes its own polaroid (onFirstPhoto)
        if (!story.firstPhotoDone) {
          story.firstPhotoDone = true;
          ui.say('ANA', 'It shows more than I saw through the lens. Wet. Wrong. Patient.', 3.4);
        }
      } else {
        // b2: no enemy hit — did she photograph one of the hidden reveal spots?
        // If so it surfaces for this one flash-washed frame; the capture at the
        // end of frame() grabs it into the polaroid, then hideActive() clears it.
        const rev = reveals.tryReveal(player.camera.position, player.camDir());
        if (rev) pendingReveal = rev;
      }
    }
  }
});

// releasing right-click lowers the camera (window-level so a release outside the
// canvas still counts)
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) player.raiseCamera(false);
});
// wheel zooms the lens while the camera is raised
window.addEventListener('wheel', (e) => {
  if (state === 'PLAY' && player.aiming) {
    e.preventDefault();
    player.zoomBy(e.deltaY < 0 ? 0.45 : -0.45);
  }
}, { passive: false });
// right-click is a game control, not a context menu
window.addEventListener('contextmenu', (e) => e.preventDefault());

function requestLock() {
  try {
    const p = renderer.domElement.requestPointerLock?.();
    p?.catch?.(() => {});    // Chrome enforces a cooldown after Esc; retry on next click
  } catch (e) { /* ignore */ }
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && state === 'PAUSE') { state = 'PLAY'; ui.showPause(false); }
  else if (!locked && state === 'PLAY') {
    player.raiseCamera(false);   // never leave the finder up over the pause screen
    state = 'PAUSE'; refreshPauseMeta(); ui.showPause(true);
    saveCheckpoint();     // pausing is a natural save point
  }
});

// The resize path — also re-run by quality.apply() after a pixel-ratio change so
// the renderer buffer + composer + polaroid capture stay in sync. Declared as a
// function so it's hoisted for the quality.init() call above.
function applyResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  fxpipe.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', applyResize);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveCheckpoint(); journal.flush(); if (audio.ctx) audio.ctx.suspend().catch(() => {}); }
  else {
    if (audio.ctx) audio.ctx.resume().catch(() => {});
    // a context loss that arrived while we were backgrounded was deferred (see
    // below) — now that the player is looking again, do the reload.
    if (needsReloadOnReturn) { needsReloadOnReturn = false; recoverFromContextLoss(); }
  }
});
// tab close / refresh: last-chance checkpoint so "interrupt for a while" survives
window.addEventListener('beforeunload', () => { saveCheckpoint(); journal.flush(); });

// ------------------------------------------------- WebGL context loss / restore
// Backgrounding a tab for a while, a laptop sleeping, or GPU-memory pressure
// (this game holds a lot of procedural GPU state) can make the browser drop the
// WebGL context. When that happens the canvas freezes on its last frame and, as
// verified in testing, the postfx EffectComposer does NOT visually recover on the
// browser's own restore event — it comes back transparent — so the game looks
// frozen and input feels dead until a manual reload. That is exactly the "switch
// away / idle → nothing works until I reload" report.
//
// The only reliable recovery for our pipeline is a clean rebuild via reload. We
// preventDefault (so the browser keeps the surface alive), stop rendering, persist
// a checkpoint, and reload into a resume so the player lands back where they were
// (see resumeGame + boot routing) — never all the way back at the jetty. A loop
// guard stops a genuinely broken GPU from reloading forever.
let needsReloadOnReturn = false;
let ctxReloadRecent = false;
try {
  const at = +sessionStorage.getItem('inalco.ctxReloadAt') || 0;
  ctxReloadRecent = at > 0 && (Date.now() - at < 12000);
} catch (_) {}

function recoverFromContextLoss() {
  // markPlaying() already set the "interrupted" marker when the run went live, so
  // the reload resumes the checkpoint (never the jetty) if — and only if — a run
  // was actually in progress. We just record the reload time for the loop guard.
  try { saveCheckpoint(); journal.flush(); } catch (_) {}
  try { sessionStorage.setItem('inalco.ctxReloadAt', String(Date.now())); } catch (_) {}
  if (loaderEl) {                                         // reuse the boot screen as a "restoring" veil
    loaderEl.style.display = '';
    loaderEl.classList.remove('gone');
    if (loaderStatus) loaderStatus.textContent = 'restoring graphics';
  }
  location.reload();
}

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();       // required, else the context is gone for good
  contextLost = true;       // frame() stops drawing into the dead context
  if (ctxReloadRecent) {
    // we already reloaded for a context loss moments ago and it happened again —
    // don't loop. Leave a clear, one-click way out instead of a black screen.
    if (loaderEl) {
      loaderEl.style.display = '';
      loaderEl.classList.remove('gone');
      loaderEl.style.cursor = 'pointer';
      if (loaderStatus) loaderStatus.textContent = 'graphics lost — click to reload';
      loaderEl.addEventListener('click', () => {
        try { sessionStorage.removeItem('inalco.ctxReloadAt'); } catch (_) {}
        recoverFromContextLoss();
      }, { once: true });
    }
    return;
  }
  // reload now if the player is watching; otherwise wait until they return so we
  // don't reload (and possibly re-lose) a throttled background tab.
  if (!document.hidden) recoverFromContextLoss();
  else needsReloadOnReturn = true;
}, false);

// If we survive a stretch of real play after a context-loss reload, forget the
// recent-reload guard so a much-later loss is treated as fresh (auto-recovers).
setTimeout(() => { try { sessionStorage.removeItem('inalco.ctxReloadAt'); } catch (_) {} }, 15000);

// ---------------------------------------------------------------- states

// The menu controllers (built once; callbacks defined below are hoisted).
const menu = buildMenu({
  onNewGame: () => { save.clear(); journal.clear(); beginGame(null); },
  onContinue: () => beginGame(save.read()),
});
const journalUI = buildJournalUI({ onBack: closeOverlay });
const optionsUI = buildOptionsUI({ onBack: closeOverlay });

// pause-screen buttons
const pauseBtn = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
pauseBtn('pause-resume', () => requestLock());
pauseBtn('pause-journal', () => openOverlay('journal'));
pauseBtn('pause-options', () => openOverlay('options'));
pauseBtn('pause-restart', () => { saveCheckpoint(); save.clear(); journal.clear(); location.href = location.pathname + '?newgame'; });
pauseBtn('pause-menu', () => { saveCheckpoint(); location.href = location.pathname + '?menu'; });

// the journal + options are also reachable from the main menu; Back returns to
// whichever screen is underneath (menu or pause) — see overlayUnder below.
document.getElementById('menu-journal')?.addEventListener('click', () => openOverlay('journal'));
document.getElementById('menu-options')?.addEventListener('click', () => openOverlay('options'));

let overlayUnder = null;    // 'menu' | 'pause' — which screen the overlay is covering

function openOverlay(which) {
  overlay = which;
  // Hide the screen underneath so the journal is its OWN full screen rather than
  // an opaque layer composited over the menu / pause (which could bleed through
  // or leave the menu on top of the journal's Back button in some browsers).
  overlayUnder = (state === 'PAUSE') ? 'pause' : 'menu';
  if (overlayUnder === 'pause') ui.showPause(false); else menu.hide();
  if (which === 'journal') journalUI.show();
  else if (which === 'options') optionsUI.show();
}
function closeOverlay() {
  const wasOpen = overlay !== null;
  journalUI.hide();
  optionsUI.hide();
  overlay = null;
  // Backing out of the journal restores the screen it was covering. Guarded on
  // wasOpen so the defensive closeOverlay() calls in showMenu/beginGame — which
  // run when nothing is open — never re-show a screen behind the game.
  if (wasOpen) {
    if (overlayUnder === 'pause') ui.showPause(true);
    else if (overlayUnder === 'menu') menu.show();
  }
  overlayUnder = null;
}

function refreshPauseMeta() {
  const ob = document.getElementById('pause-obj');
  if (ob) ob.textContent = story._obj?.main || '';
}

// Show the title → main menu. First user gesture, so unlock audio + start the
// menu's ambient bed here.
function showMenu() {
  state = 'MENU';
  clearPlaying();       // sitting on the menu is not an interrupted run
  audio.ensure();
  audio.menuMusic(true);
  ui.fade(false);       // ensure the black fader is lifted so the menu is visible
  ui.hideTitle();
  ui.showPause(false);
  closeOverlay();
  menu.show();
}

// Mark / clear "this tab is mid-run". Kept in sessionStorage: it survives a
// reload and Chrome's tab-discard-and-restore (both of which otherwise dump the
// player back on the title screen — the "returns to the start" report), but is
// gone on a genuinely fresh tab, which should still open on the title. Boot
// routing reads it to resume the checkpoint instead of showing the title.
function markPlaying() { try { sessionStorage.setItem('inalco.interrupted', '1'); } catch (_) {} }
function clearPlaying() { try { sessionStorage.removeItem('inalco.interrupted'); } catch (_) {} }

// Assemble + persist a checkpoint (see save.js). Only during a live run.
function saveCheckpoint() {
  if ((state !== 'PLAY' && state !== 'PAUSE') || player.dead) return;
  save.write({
    savedAt: Date.now(),
    objective: story._obj || null,
    evidence: story.evidence,
    player: player.serialize(),
    story: story.serialize(),
    buildings: buildings.serialize ? buildings.serialize() : null,
  });
}

// Restore a checkpoint onto the freshly-built world.
function applySnapshot(snap) {
  if (!snap) return;
  buildings.restore?.(snap.buildings);
  story.restore?.(snap.story);
  player.restore?.(snap.player);
  world.setFlashlight(player.flashOn);
}

// Enter the game. snap=null → fresh run (intro unless auto-skip). snap set →
// restore and drop straight into PLAY (the intro is only for a first arrival).
function beginGame(snap = null) {
  audio.ensure();
  audio.menuMusic(false);
  menu.hide();
  closeOverlay();
  ui.hideTitle();
  ui.showPause(false);
  ui.fade(false);
  saveT = SAVE_EVERY;   // arm periodic autosave

  if (snap) {
    applySnapshot(snap);
    requestLock();
    for (const [, fn] of INTRO_SCRIPT) introFired.add(fn);   // never replay the cutscene
    state = 'PLAY';
    markPlaying();
    player.frozen = false;
    world.setFlashlight(player.flashOn);
    ui.showHud(true);
    ui.setSide?.('');
    ui.say('ANA', 'Back where I left it. The night hasn’t moved on without me.', 3.4);
    return;
  }

  requestLock();
  if (SKIP_INTRO) { skipIntro(); return; }
  state = 'INTRO';
  introT = 0;
  player.frozen = false;    // may look around, cannot move (input gated by state)
}

const INTRO_SCRIPT = [
  [0.8, () => ui.say('', 'Lake Nahuel Huapi, Patagonia. The last ferry of the day.', 3.6)],
  [4.8, () => { audio.horn(); ui.say('ANA', 'Nine days since Lucía’s voicemail. Police say the crew left — but crews don’t leave their sound tech’s ticket on the dock. I brought the camera. It’s the only thing I know how to point at the dark.', 5); }],
  [10.6, () => ui.say('ANA', 'One night. Photograph everything, find someone who’ll talk, take the 18:45 back.', 3.4)],
  [14.6, () => { audio.horn(); ui.say('ANA', '...Wait. That’s early. He’s not due out till 18:45—', 3.2); }],
  [18.4, () => ui.say('ANA', 'He saw the fog and he ran. Whatever everyone here knows, nobody waited to tell me.', 3.4)],
  [22.2, () => finishIntro()],
];

function skipIntro() {
  ui.clearSubs();
  for (const [, fn] of INTRO_SCRIPT) introFired.add(fn);
  finishIntro();
}

function finishIntro() {
  if (state === 'PLAY') return;
  state = 'PLAY';
  markPlaying();
  player.frozen = false;
  player.flashOn = true;
  world.setFlashlight(true);
  ui.showHud(true);
  ui.say('', '(the shore is behind you — the house is up the path)', 4);
}

// Resume an interrupted run on boot (reload / tab-discard-restore / context-loss
// recovery). The world is already built, so we just restore the checkpoint and
// land on the PAUSE screen: a programmatic requestPointerLock without a fresh
// user gesture would be rejected, so we let the player's first click re-lock and
// drop into PLAY (pointerlockchange handles PAUSE→PLAY). This puts them back at
// their checkpoint — not the jetty — one click away from playing.
function resumeGame(snap) {
  applySnapshot(snap);
  for (const [, fn] of INTRO_SCRIPT) introFired.add(fn);   // never replay the cutscene
  ui.hideTitle();
  menu.hide();
  ui.fade(false);
  world.setFlashlight(player.flashOn);
  ui.showHud(true);
  player.frozen = false;
  saveT = SAVE_EVERY;
  markPlaying();
  state = 'PAUSE';
  refreshPauseMeta();
  ui.showPause(true);
}

function endSequence() {
  state = 'END';
  player.frozen = true;
  document.exitPointerLock?.();
  ui.prompt(null);
  ui.setFadeWhite(true);
  ui.fade(true);
  setTimeout(() => {
    ui.showEnding(gameOverText, CREDITS_HTML, endToMenu);
    ui.setFadeWhite(false);
    ui.fade(false);   // clear the fader so the ending screen shows through
  }, 2400);
}

// The credits finished (or the player skipped them). The game is won, so drop
// the checkpoint (nothing left to continue) and reload straight to the main
// menu. A full reload rebuilds a fresh world, so BEGIN/CONTINUE work correctly
// afterwards — the finale never freezes on the titles.
function endToMenu() {
  save.clear();
  location.href = location.pathname + '?menu';
}

let deathT = 0;
function startDeath() {
  if (player.dead) return;
  player.dead = true;
  player.raiseCamera(false);   // drop the camera if the shutter caught you mid-shot
  deathT = 0;
  audio.deathWash();
  fx.glitch = 1;
  fx.staticVis = 1;
}

function reviveFromDeath() {
  ui.hideDeath();
  ui.setFadeWhite(false);
  ui.fade(true, false);
  story.respawn(player);
  fx.staticVis = 0;
  fx.glitch = 0;
  state = 'PLAY';
  ui.say('ANA', '...Get up. Get up. You didn’t come this far to stop.', 3);
  setTimeout(() => ui.fade(false), 220);
}

// ------------------------------------------------------------ ambient audio
function ambienceParams(nd) {
  const p = player.pos;
  const inside = buildings.insideHouse(p.x, p.z);
  const shoreDist = Math.abs(p.z - LAYOUT.shoreZ);
  // the tide gives dread a proximity-independent floor: lulls feel safe, peaks
  // feel watched, even when nothing is near
  const tide = night.tide;
  const staticL = Math.min(1, Math.max(0, 1 - nd / TUNE.staticRange) ** 1.5 + (story.staticSpike ?? 0) + tide * 0.08);
  const chase = director.chasingCount() > 0 ? 0.55 : 0;
  const drone = Math.min(1, (director.pressure > 0 ? 0.22 : 0.06) + chase + Math.max(0, 1 - nd / 12) * 0.4 + tide * 0.18);
  const heartbeat = player.composure < 42 ? 1 - player.composure / 42 : 0;
  const genD = Math.hypot(p.x - LAYOUT.shed.x, p.z - LAYOUT.shed.z);

  // a4: is a Returned materializing close by? nearestDist() ignores manifest
  // state, so check it explicitly — a manifestation must silence the insects.
  let manifestNear = false;
  for (const e of director.enemies) {
    if (e.state === 'manifest' && e.pos.distanceTo(p) < 32) { manifestNear = true; break; }
  }
  // a4: the night-insect bed. Loud in calm/low tide, and CUTS to silence as a
  // Returned nears (<16 m = silent, >34 m = full), materializes, or gives chase,
  // or as the tide spikes — the silence itself is the warning. Muffled indoors.
  let insects = Math.max(0, 1 - tide * 1.7);
  insects *= Math.min(1, Math.max(0, (nd - 16) / 18));
  if (chase || manifestNear) insects = 0;
  if (inside) insects *= 0.45;

  // the thing that breathes upstairs: its wet bed bleeds through the house —
  // clearly audible in the upstairs corridor BEFORE the doorway (the rumor),
  // faint through the ground-floor ceiling below it. Gain rides the thing's
  // VISIBLE breath so ear and eye agree; pan follows the camera-right basis.
  let mass = 0, massPan = 0;
  const mb = buildings.anchors.breather;
  if (mb && buildings.thing) {
    const mdx = mb.x - p.x, mdz = mb.z - p.z;
    const md = Math.hypot(mdx, mdz);
    if (md < 15) {
      const upstairs = p.y > 4;
      const breath = 0.4 + 0.6 * buildings.thing.breathLevel();
      mass = (upstairs ? 0.55 : 0.16) * Math.max(0, 1 - md / 15) * breath;
      const cd = player.camDir();
      massPan = Math.max(-1, Math.min(1, (mdx * -cd.z + mdz * cd.x) / (md || 1))) * 0.8;
    }
  }

  return {
    wind: inside ? 0.3 : 1,
    lake: inside ? 0.05 : Math.max(0, 1 - shoreDist / 45),
    static: staticL,
    drone,
    heartbeat,
    whisper: Math.max(Math.max(0, 1 - nd / 9), tide * 0.15),
    genProximity: buildings.isPowered() ? Math.max(0, 1 - genD / 26) : 0,
    fire: Math.max(0, 1 - Math.hypot(p.x - npcs.campfire.x, p.z - npcs.campfire.z) / 14),
    insects,
    staticL,
    mass, massPan,
  };
}

function surfaceAt(p) {
  if (buildings.insideHouse(p.x, p.z)) return 'interior';
  if (Math.abs(p.x) < 1.5 && p.z > 57 && p.z < 80) return 'wood';
  if (Math.hypot(p.x - LAYOUT.boathouse.x, p.z - LAYOUT.boathouse.z) < 6.5) return 'wood';
  return 'grass';
}

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();
let time = 0;
let burnT = 90;
let owlT = 6 + Math.random() * 8;      // a4: owl-hoot cooldown (fires only when calm)
let terosT = 4 + Math.random() * 6;    // a4: teros-alarm cooldown (mid-range warning)

function frame() {
  requestAnimationFrame(frame);
  // context dropped: keep the rAF alive but issue no GL calls — recoverFromContextLoss()
  // reloads to rebuild the pipeline (the composer never recovers in place).
  if (contextLost) return;
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  ui.update(dt);

  // camera viewfinder overlay — fades with the aim, shows lens/flash/frame readouts
  ui.viewfinder({
    aim: player.aimT, zoom: player.zoom, charge: player.flashCharge,
    frames: journal.photos.length,
    active: state === 'PLAY' && !ui.noteOpen && !dialog.open,
  });

  const simRunning = (state === 'PLAY' || state === 'INTRO') && !ui.noteOpen && !dialog.open;

  // NPC faces (blink / speak) animate even while a dialog pauses the sim
  npcs.driveFaces(time, dialog);
  // the cellar girl breathes/sways during dialogue; she only moves + strikes
  // once the sim is live (i.e. dialogue closed and she has been provoked)
  buildings.cellar.update(dt, time, simRunning ? girlCtx : null);

  if (state === 'INTRO') {
    introT += dt;
    for (const [t, fn] of INTRO_SCRIPT) {
      if (introT >= t && !introFired.has(fn)) { introFired.add(fn); fn(); }
    }
  }

  if (simRunning) {
    // LE-2 adaptive-quality governor: measures real (unclamped) frame time and,
    // in auto mode only, steps the tier down when the machine is sustainably
    // struggling. Called only on the play path so title/pause/dialog rAF gaps
    // are never mistaken for slowness. No-op in manual mode.
    quality.observeFrame();

    // advance the night's tide/phase (only while the sim runs, so pausing or
    // reading a note never drains the night), then let it drive the world
    night.update(dt, time);
    director.setTide(night.tide);
    director.setPhase(night.phase);     // BAL: teaching-gate fallback unlocks late kinds once the teaching window closes
    world.setNightPhase(night.phase);   // c1: moon tracks the sky, dawn glow builds → the finish line
    world.setFogLevel(night.tide);

    const liveInput = state === 'PLAY' ? input : { f: false, b: false, l: false, r: false, run: false };
    player.surface = surfaceAt(player.pos);
    player.update(dt, liveInput);
    thingCtx.playerPos = player.pos;
    player.camDir(thingCtx.camDir);
    thingCtx.upstairs = player.pos.y > 4 && !player.dead;
    thingCtx.tier = quality.getTier();
    buildings.update(dt, thingCtx);
    director.update(dt, time);
    story.update(dt, player.pos);
    revisit.update(dt);           // b3: apply staged one-time changes while Ana is away
    world.update(dt, time, player.camera.position);
    npcs.update(dt, time, player.pos);

    // the campfire is a hearth: composure returns beside it
    const fireD = Math.hypot(player.pos.x - npcs.campfire.x, player.pos.z - npcs.campfire.z);
    if (fireD < 4.5 && !player.dead) {
      player.composure = Math.min(100 + player.maxBonus, player.composure + 10 * dt);
    }

    // upstairs mirror: drive the live reflection of Ana (only renders when she's near)
    buildings.updateMirror(player.pos.x, player.pos.z, player.pos.y, player.yaw);

    // the thing that breathes upstairs — Ana reacts, terrified (each line fires once)
    const mb = buildings.anchors.breather;
    if (mb && player.pos.y > 4 && !player.dead) {
      const md = Math.hypot(player.pos.x - mb.x, player.pos.z - mb.z);
      if (_massSeen < 1 && md < 6.5) {
        _massSeen = 1;
        ui.say('ANA', 'Something in here is breathing. Slow. Wet. Two rhythms — more than one sleeper.', 4.4);
        fx.glitch = Math.max(fx.glitch, 0.4);
      } else if (_massSeen < 3 && md < 2.9) {
        _massSeen = 3;
        ui.say('ANA', 'It has faces. They turn to follow me. I have to get out, I have to get out—', 5.0);
        fx.glitch = Math.max(fx.glitch, 0.9);
      }
      // it feeds: standing close to it drains life, very slowly (≈6%/10s at the edge,
      // more the closer you are), with a creeping red pulse so you SEE it happening.
      if (md < 1.9) {
        const near = 1 - md / 1.9;                        // 0 at the edge → 1 at its centre
        player.fearDrain(dt, 0.4 + 0.6 * near);           // ~0.4..1.0 composure/sec (regen also pauses)
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.05);  // breath-synced
        fx.damage = Math.max(fx.damage, 0.14 + (0.12 + 0.14 * near) * pulse);
        if (md < 1.2) fx.glitch = Math.max(fx.glitch, 0.12 * near);
      }
    }

    // decay story static spike
    story.staticSpike = Math.max(0, (story.staticSpike ?? 0) - dt * 0.5);

    // fear aura
    for (const e of director.enemies) {
      const d = e.pos.distanceTo(player.pos);
      if (d < TUNE.auraRange && e.state !== 'manifest') player.fearDrain(dt, TUNE.auraDps);
    }

    // ambience
    const nd = director.nearestDist();
    const amb = ambienceParams(nd);
    audio.update(dt, amb);
    fx.staticVis = Math.max(fx.staticVis - dt * 1.5, amb.staticL * 0.55);
    if (nd < 5) fx.glitch = Math.max(fx.glitch, (1 - nd / 5) * 0.45);

    // film burn: an occasional one-frame hiccup
    burnT -= dt;
    if (burnT <= 0) {
      burnT = 70 + Math.random() * 80;
      fx.flash = Math.max(fx.flash, 0.16);
      fx.glitch = Math.max(fx.glitch, 0.5);
    }

    // interact prompt + hold logic
    if (state === 'PLAY') {
      // ambient vignettes tick here: PLAY-only (skips the intro), and after
      // npcs.update so the scream's fire-flare stacks on the campfire flicker
      vignettes.update(dt);

      // a5 · overheard NPC barks: short state-reactive lines when the player
      // passes a met NPC after the world has changed (power on, fog high, a
      // Returned near). Gated inside reactBarks to never interrupt dialog/notes.
      npcs.reactBarks({
        ui, dt,
        playerPos: player.pos,
        powered: buildings.isPowered(),
        tide: night.tide,
        nearestEnemyDist: nd,
        dialogOpen: dialog.open,
        met: story.met,
      });

      // a4 · living soundscape. Owl = the peace indicator: a sparse two-note
      // hoot only when things are truly calm (low tide, nothing near, no
      // chase). Teros (lapwing) alarm = the early warning: the birds panic
      // when a Returned is on the grounds at mid range (18–45 m) but not yet
      // chasing — before you see it. Both cooldown-gated so neither spams.
      const calm = night.tide < 0.34 && nd > 40 && director.chasingCount() === 0;
      owlT -= dt;
      if (calm && owlT <= 0) { audio.owl((Math.random() * 2 - 1) * 0.55); owlT = 9 + Math.random() * 11; }
      else if (!calm && owlT < 0) owlT = 4 + Math.random() * 5;   // hold off when calm breaks
      const midThreat = nd > 18 && nd < 45 && director.chasingCount() === 0;
      terosT -= dt;
      if (midThreat && terosT <= 0) { audio.teros((Math.random() * 2 - 1) * 0.5); terosT = 7 + Math.random() * 8; }
      else if (!midThreat && terosT < 0) terosT = 4 + Math.random() * 4;

      const hit = story.currentInteract(player.pos, player.camDir());
      const holdS = hit && hit.item.hold
        ? (typeof hit.item.hold === 'function' ? hit.item.hold() : hit.item.hold)
        : 0;
      if (hit && holdS) {
        if (input.e && !holdConsumed) {
          holdItem = hit.item;
          holdT += dt;
          const k = Math.min(1, holdT / holdS);
          ui.prompt(`${hit.label}  ${'▮'.repeat(Math.floor(k * 8)).padEnd(8, '▯')}`);
          if (k >= 1) { hit.item.action(hit.item); holdT = 0; holdItem = null; holdConsumed = true; }
        } else {
          holdT = 0;
          ui.prompt(`[E] ${hit.label}`);
        }
      } else {
        holdT = 0; holdItem = null;
        ui.prompt(hit ? `[E] ${hit.label}` : null);
      }

      // flashlight hint (only if they switched it off and wander in the dark)
      if (!player.flashOn && flashHintT > 0) {
        flashHintT -= dt;
        if (flashHintT <= 0) ui.say('', '(flashlight: [F])', 3);
      } else if (player.flashOn) {
        flashHintT = 26;
      }

      // death
      if (player.composure <= 0 && !player.dead) startDeath();

      // periodic checkpoint so an interrupted run resumes near where it was
      saveT -= dt;
      if (saveT <= 0) { saveT = SAVE_EVERY; saveCheckpoint(); }
    }

    ui.flashPip(player.flashCharge, state === 'PLAY' && player.aimT < 0.3);   // finder shows its own readout
    ui.setEvidence(story.evidence, 6);
  }

  // death sequence timing
  if (player.dead && state === 'PLAY') {
    deathT += dt;
    fx.glitch = 1;
    fx.staticVis = Math.min(1, deathT * 1.2);
    if (deathT > 1.3) {
      state = 'DEAD';
      ui.setFadeWhite(true);
      ui.fade(true, false);
      setTimeout(() => {
        ui.fade(false, false);
        ui.showDeath(story.deathLine());
      }, 300);
    }
  }

  fxpipe.render(dt, time);

  // polaroid capture: grab the frame right after it rendered. This handles both
  // an enemy photo (pendingPolaroid, keyed into PHOTO_CAPTIONS) and a b2 reveal
  // (pendingReveal — see the low-exposure re-render below). Whichever fired, the
  // caption + downsampled framebuffer become the developed polaroid.
  if (pendingPolaroid || pendingReveal) {
    const rev = pendingReveal; pendingReveal = null;
    const kind = pendingPolaroid; pendingPolaroid = null;
    const caption = rev ? rev.caption : PHOTO_CAPTIONS[kind];
    // b2: for a reveal, surface the hidden mesh and re-render at a LOW exposure so
    // the figure actually reads in the photo (the ~0.8 flash white-out that just
    // played on screen would bleach it out). This render draws into the canvas but
    // is never composited — the frame the player sees was the reveal-free one, and
    // we restore that below. Enemy photos keep the plain flash-frame capture.
    let savedFlash = 0;
    if (rev) {
      reveals.showActive();
      if (rev.id === 'mass') buildings.thing?.setPhotoForm();   // in the photo, the sockets have eyes
      savedFlash = fx.flash;
      fx.flash = 0.1;
      fxpipe.render(dt, time);
    }
    try {
      const src = renderer.domElement;
      const cv = document.createElement('canvas');
      cv.width = 768; cv.height = 608;   // captured big so the journal lightbox can enlarge + zoom crisply
      const c2 = cv.getContext('2d');
      const s = Math.min(src.width / cv.width, src.height / cv.height) * 0.7;
      c2.drawImage(src,
        (src.width - cv.width * s) / 2, (src.height - cv.height * s) / 2,
        cv.width * s, cv.height * s, 0, 0, cv.width, cv.height);
      const dataUrl = cv.toDataURL('image/jpeg', 0.7);
      ui.polaroid(dataUrl, caption);
      journal.addPhoto({ dataUrl, caption, kind });   // keep it in the journal album
      audio.pickup();
    } catch (e) { /* capture is a nicety */ }
    if (rev) {
      reveals.hideActive();          // gone for good — never shown live
      if (rev.id === 'mass') buildings.thing?.clearPhotoForm();
      fx.flash = savedFlash;
      fxpipe.render(dt, time);       // present a reveal-free frame (still flash-lit)
    }
  }
}

frame();

// boot routing: auto-start (tests / restart), open the menu directly (?menu),
// resume an interrupted run (reload / tab-discard / context-loss recovery), or
// wait on the title for the first click → showMenu().
let wasInterrupted = false;
try { wasInterrupted = sessionStorage.getItem('inalco.interrupted') === '1'; } catch (_) {}
if (AUTO_START) beginGame(null);
else if (SHOW_MENU) showMenu();
else if (wasInterrupted && save.exists()) resumeGame(save.read());
else clearPlaying();   // a genuinely fresh tab opens on the title, not a resume

// debug/testing handle
window.__niebla = { THREE, scene, camera, renderer, player, story, director, audio, world, buildings, npcs, dialog, fx, night, vignettes, reveals, revisit, save, journal, quality, beginGame, showMenu, saveCheckpoint, skipIntro, get state() { return state; } };
