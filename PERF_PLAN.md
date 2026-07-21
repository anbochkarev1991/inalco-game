# Performance Plan — smoothness & freeze elimination

**Goal:** remove hitches and raise frame-time headroom **without changing a single
pixel of the visuals or one beat of gameplay**. Every step below is behavior-neutral:
it changes *how* work is done, never *what* the player sees or how the game plays.

Each step is **atomic and independently shippable** — one branch, one subagent, one
verification pass. Steps that touch the same file are marked and must be done
**sequentially** (this repo is worked one-task-per-branch anyway).

---

## Measured baseline (real GPU, `npm run perf`, ANGLE/Metal, 1280×800)

| Scenario | avg | worst frames | verdict |
|---|---|---|---|
| baseline (dock) | 8.3 ms | 10 / 10 / 13 | healthy |
| **spawn 3 kinds in view** | 12.4 ms | 29 / 36 / **102** | **visible stutter on manifest** |
| **flash + expose** | 17.3 ms | 49 / **367** / **403** | **~0.4 s freeze — the worst hitch** |
| dissolve (2nd flash) | 9.2 ms | 12 / 13 / 13 | fine |
| enter house | 9.7 ms | 12 / 12 / 12 | fine |
| power on | 9.9 ms | 12 / 13 / 14 | fine |
| boathouse interior | 13.2 ms | 16 / 16 / 25 | minor |
| greenhouse | 8.4 ms | 13 / 14 / 15 | fine |
| **realistic walk** | — | **77** | **occasional GC-class hitch** |
| load + preload + warmup | 15,693 ms | (one-time) | long, but a load screen |

A frame > ~24 ms drops below 40 fps and reads as a stutter; > 50 ms reads as a freeze.
The three real problems are **event spikes**, not steady frame rate:

> **Calibration note (after Step 1, warm run on a fast machine):** absolute frame
> times are strongly machine- and warmth-dependent. The table above was a **cold** first
> run — which is what a player hits on *first encounter* (the worst moment for a freeze).
> A warm run on fast hardware measures lower: flash+expose 49–81 ms, spawn 38 ms,
> **take photo (full album) 44 ms** (serializes ~3.1 MB every shot), **long walk GC tail
> 67 ms**, single photo 14–18 ms, finale churn 12 ms. Both regimes matter: cold/first-
> encounter and slower player hardware push these back toward the 100–400 ms range, so the
> fixes below target the *cause* (synchronous heavy work on the render thread), which
> improves both. Compare each step against the `PERFJSON` line the harness now emits.

1. **Taking a photo freezes for 300–400 ms** — and photography is the core mechanic.
   Root cause: on a successful flash, `frame()` synchronously runs
   `canvas.toDataURL('image/jpeg')` **and** `journal.save()`, which
   `JSON.stringify`s the *entire base64 photo album* (up to 24 × ~15 KB) and does a
   **synchronous `localStorage.setItem`** — every single shot, worse as the album fills.
   (main.js:689–724 → journal.js:26–58)
2. **Manifestation stutters ~100 ms** — every `spawn()` rebuilds a rig
   (`SkeletonUtils.clone` + material clones + `map.clone()` + `makeDrips()` fresh
   geometry & 4 materials), so the GPU uploads new buffers/textures on first draw.
   (enemies.js:897–965)
3. **Steady GC pressure** produces the ~77 ms walk hitch — many small per-frame
   allocations across the update fan-out (enemies, director ctx, colliders, npcs
   faces, doors, player, story).

### What is already optimal — do NOT "fix" these (guard against churn)
- `world.js` / `night.js`: hot paths use pre-allocated scratch objects, zero per-frame
  alloc; water & foliage animate via a **single shader uniform**, not CPU vertex writes.
- `audio.js`: the per-frame `update()` creates **no** AudioNodes/buffers — it only
  ramps params on persistent nodes; one-shots reuse a shared noise buffer and self-stop.
- `mansion.js` `insideHouse`/`insideHouseM`: trivial inline AABB tests (no alloc).
- NPC `setFace`: dirty-checked, swaps pre-baked textures only on state change.
- Marching-cubes rig build + shader warm-up already run at load, not during play.

---

## Shared verification protocol (every step must pass this)

1. **Dev server up:** `npm run dev` (serves `:5173`).
2. **Perf gate:** `npm run perf` before and after. The step's **targeted metric must
   improve**, and **no other metric may regress beyond noise (±1 ms avg, ±3 ms worst)**.
3. **Visual/behavior parity:** run the relevant existing screenshot harness and confirm
   the frames are visually identical to `_screenshots/`:
   - enemy changes → `npm run monstershots`
   - NPC/face changes → `npm run npcshots`
   - building/interior changes → `npm run buildshots`
   - anything else / general → `npm run play` (walkthrough smoke) + `npm run smoke`
4. **No console errors** in the perf run (`[PAGEERROR]` / `PERF` lines are surfaced).
5. A step that cannot demonstrate improvement on the harness is **not done** — extend
   the harness (Step 1) rather than merging on faith.

---

## STEP 1 — Extend the perf harness to isolate the real freezes *(do first)*

**Why:** the two worst hitches (photo capture, full-album save, finale objective churn)
are not isolated by the current `perf.mjs`, so later steps can't prove they fixed them.
**Touches:** `scripts/perf.mjs` only. **Depends on:** nothing.

**Change:** add measured steps to `scripts/perf.mjs`:
- `take photo (empty album)` — clear journal, spawn one enemy in view, trigger the real
  mousedown flash path (or call the same capture code), measure the frame.
- `take photo (full album)` — pre-seed `journal` with 24 dummy photos, then shoot; this
  reproduces the worst case.
- `finale objective churn` — drive `story` into the boat-finale branch (or call
  `story.setObjective` with changing text ~1×/s for 5 s) and measure.
- `long walk GC (30 s)` — extend the existing walk to 30 s and report **p99 + worst**,
  not just avg, so GC hitches show.
- Emit results as a JSON blob (in addition to the table) so before/after diffs are exact.

**Acceptance:** harness runs green and prints the new rows with today's (bad) numbers,
establishing the target baseline for Steps 2–4.
**Risk:** none (test-only). **Rollback:** revert the script.

---

## TIER 1 — Kill the measured freezes (highest impact)

### STEP 2 — Move photo persistence off the render frame *(the #1 fix)*

**Why:** the 300–400 ms photo freeze. **Touches:** `main.js` (capture block 689–724),
`journal.js`. **Depends on:** Step 1.

**Changes (all behavior-preserving — same photo, same album, same persistence):**
1. **Split storage keys.** Persist photos under their own key, separate from
   `notes`/`objectives`. Then `addObjective`/`addNote` no longer stringify the base64
   album — objective changes stop dragging ~360 KB through `JSON.stringify` +
   `localStorage`. (journal.js: keep one `state`, but `save()` writes photos and
   meta to two keys, and only re-serializes the part that changed.)
2. **Debounce + defer `save()`.** Coalesce writes and run them off the frame via
   `requestIdleCallback` (fallback `setTimeout(…, 0)`). Multiple `addObjective` calls in
   the same second collapse to one idle write. Data written is byte-identical; only the
   *timing* moves off the render tick. Flush synchronously on `visibilitychange`/
   `beforeunload` so nothing is lost on tab close.
3. **Get the JPEG encode off the frame.** Replace synchronous
   `canvas.toDataURL('image/jpeg', 0.7)` with async `canvas.toBlob(...)` →
   `FileReader`/`URL.createObjectURL`, and hand the polaroid + journal the result in the
   idle callback. The on-screen polaroid can show the raw canvas immediately; the
   data-URL is only needed for the album, which is async anyway. Same image bytes.

**Acceptance:** `take photo (empty album)` and `take photo (full album)` both < 16 ms
worst; the developed polaroid still appears at the same moment and looks identical; a
reload still shows the album (persistence intact). **Risk:** medium (persistence + async
ordering) — keep the synchronous flush-on-unload path. **Rollback:** revert both files.

### STEP 3 — Pool / pre-warm enemy rigs to remove the spawn hitch

**Why:** the 102 ms manifest stutter. **Touches:** `enemies.js` (`spawn`/`despawn`,
`cloneRig`, `makeDrips`). **Depends on:** nothing (but same file as Steps 6, 10 — sequence them).

**Changes:**
1. **Share static geometry.** `makeDrips()` (enemies.js:799–853) builds a
   `CircleGeometry` + 2 `RingGeometry` per spawn that are never mutated — hoist these to
   module-level shared constants. Keep per-instance only the animated line buffer +
   materials. (enemies.js:826–841)
2. **Rig pool.** On `despawn()`, instead of dropping the rig, hide it and return it to a
   per-kind free-list; `spawn()` pulls from the pool and resets transform/state before
   `scene.add`. Pre-fill the pool during `warmUpRenderer()` (which already spawns one of
   each kind) so the *first* live manifest of each kind reuses a warm rig — no
   `SkeletonUtils.clone`, no `map.clone()`+`needsUpdate`, no fresh geometry upload mid-play.
   Cap the pool at the ambient `CAPS` max (3) + a couple of scripted; over-cap spawns fall
   back to the current clone path (rare).

**Acceptance:** `spawn 3 kinds in view` worst < 20 ms; monstershots visually identical
(same rig, same drips, same per-instance face smear offset — verify the smear still
varies per instance, since that relied on `map.clone()`; if pooling loses the variation,
pre-clone a small set of offset variants during warm-up). **Risk:** medium (state reset
correctness on reuse). **Rollback:** revert to per-spawn `cloneRig`.

### STEP 4 — Guard finale objective updates

**Why:** the boat finale calls `setObjective` **every frame** (story.js:2170,2172) with
text that changes each second → string + object alloc every frame and (pre-Step 2) a
localStorage write each second at the climax. **Touches:** `story.js`. **Depends on:**
Step 2 (which already de-fangs the storage half).

**Change:** track `this._lastBoatLeft` (and near/away state) and only call
`setObjective` when the displayed value actually changes. Identical on-screen text,
just not re-issued 60×/s. **Acceptance:** `finale objective churn` < 16 ms worst, no
per-frame allocation in the finale branch; objective text updates look identical.
**Risk:** low. **Rollback:** revert the guard.

---

## TIER LE — Low-end / older-hardware scaling *(added on user request — high priority)*

A weak PC (playtester report, 2026-07-20) freezes and runs badly. The freeze fixes above
help every machine, but a weak GPU's real bottleneck is **fill rate and pass count**, which
the current settings ignore: pixel ratio up to **1.25×** (56% more pixels than native),
**MSAA**, **PCF-soft shadow maps** (a second scene pass), a **4-pass composer incl. UnrealBloom**
(~10 blur passes), and **70 transparent fog sprites** (heavy overdraw).

**Approved strategy:** *auto-adaptive quality + a manual Low/Medium/High override in Options.*
Capable machines keep today's exact look; only a struggling machine scales down. This is the
one sanctioned exception to "no visual change" — and it applies **only** on hardware that
would otherwise stutter. Quality levers, by tier:

| Lever | HIGH (today) | MEDIUM | LOW |
|---|---|---|---|
| pixel ratio | min(dpr, 1.25) | 1.0 | 0.75 |
| shadows | PCFSoft, full map | smaller map / PCF | **off** |
| bloom (UnrealBloom) | full res | half res | **off (skip pass)** |
| MSAA (`antialias`) | on | on | off *(needs reload)* |
| fog sprites | 70 | ~45 | ~20 |
| fog density / far | 100% | ~90% | ~80% |

MSAA is fixed at `WebGLRenderer` construction, so it can only change on reload — tie it to the
saved/detected tier and note "restart to apply" in the menu for that one lever. Everything else
applies live.

### STEP LE-0 — Harness: emulate a weak machine (CDP CPU throttle) *(do first in this tier)*
**Touches:** `scripts/perf.mjs`. Add a throttled pass using CDP
`Emulation.setCPUThrottlingRate` (e.g. 4× and 6×) to reproduce the weak-CPU experience, and a
hook to force a quality tier for A/B once LE-1 lands. Establishes the weak-HW baseline the rest
of the tier is measured against (GPU can't be throttled directly, but pixel-ratio wins scale
linearly with pixel count and are reasoned from that). **Acceptance:** prints a `throttled 6x`
battery + `PERFJSON`; documents today's (bad) throttled numbers.

### STEP LE-1 — Quality manager + renderer/postfx/world levers + startup probe
**Touches:** new `src/quality.js`; `main.js` (wire after renderer/postfx/world built);
`postfx.js` (bloom enable/res + expose a setter); `world.js` (fog-sprite count + density scale
setters). Build a module owning the current tier, a `tiers` table (above), `setTier()`/`getTier()`,
localStorage persistence, and a conservative **startup probe** (GPU renderer string via
`WEBGL_debug_renderer_info`, `navigator.hardwareConcurrency`, `devicePixelRatio`) that picks a
safe initial tier. Applying a tier must be **idempotent and live** (except MSAA). Default mode =
Auto (see LE-2). **Acceptance:** forcing LOW via `__niebla` measurably cuts frame time under the
LE-0 throttle with the game still fully playable; HIGH is pixel-identical to pre-change (diff a
still). Bloom-off/shadow-off look different **only** at LOW, by design.

### STEP LE-2 — Auto-adaptive frame-time governor
**Touches:** `main.js` (or `quality.js`). Track a rolling mean frame time; when sustained slow
(> ~24 ms ≈ <42 fps for ~2 s) **step the tier down one notch**; strong hysteresis so it never
oscillates; only auto-**downshift** (optional very-conservative upshift after long sustained
headroom). Active only in Auto mode; persists the settled tier as the next-launch start.
**Acceptance:** under LE-0's 6× throttle the governor drops to a smooth tier within a couple of
seconds and then holds steady (no flip-flopping); disabled the instant the player picks a manual tier.

### STEP LE-3 — Options-menu quality selector
**Touches:** the Options overlay (`index.html` + its handler in `main.js`/`menu.js`),
`quality.js`. Add an **Auto / Low / Medium / High** control; wire to `quality.setTier` / Auto;
persist; reflect the currently-active auto tier as a hint. Note "restart to apply" beside the
MSAA-affected choice. **Acceptance:** picking a level changes quality live (except MSAA), survives
reload, and disables the auto-governor; matches the existing options-menu styling.

---

## TIER 2 — Remove steady per-frame GC pressure (the walk hitch + overall smoothness)

These are individually small but collectively cause the ~77 ms GC pause. Each is a
clean cache-once / scratch-vector / index-loop refactor with **no behavioral change**.

### STEP 5 — Director.update: stop allocating a ctx object + closures + array copy every frame

**Why & where:** `enemies.js:2591–2633`. **Touches:** `enemies.js` (sequence vs 3/6/10).
- Build the `ctx` object **once** in the constructor; each frame mutate its
  `playerPos/playerDir/flashOn/isPowered/safeSpots` fields.
- Bind the four handlers (`playerInHouse`, `onTouch`, `onScream`, `onUtter`,
  lines 2599/2606/2610/2618) **once** in the constructor, like `_claimPostBound` already is.
- Replace `for (const e of [...this.enemies])` (2633) with a **backwards index loop**
  (splice-safe, zero copy).
- Replace `chasingCount()`'s `.filter(...).length` (2551) with a plain counting loop.

**Acceptance:** no per-frame allocation in `Director.update`/`chasingCount`; walk p99
improves; identical AI behavior. **Risk:** low. **Rollback:** revert.

### STEP 6 — Per-enemy scratch vectors (kill `new THREE.Vector3` in the AI path)

**Why & where:** ~3–5 `Vector3` allocated per enemy per frame — `observed()` (1097),
`update()` toPlayer (1118), state-machine move/face vectors (1207/1267/1409/…),
`.clone()` at 1381/1409. **Touches:** `enemies.js` (sequence vs 3/5/10).

**Change:** use module-level scratch `Vector3`s (the file already does this for
`_tatTarget`/`_hairTarget`/`_toMe`) — assign components in place instead of `new`; for
the two `.clone()` cases, normalize a scratch copy. Behavior identical (values consumed
within the same call). **Acceptance:** no `new Vector3` per frame in the enemy update
path (grep the hot functions); chase/wander/gather behavior unchanged in monstershots +
play. **Risk:** low–medium (must not alias two scratches that are live simultaneously —
audit each state case). **Rollback:** revert.

### STEP 7 — colliders.js: reusable out-param + kill swap-array alloc (+ optional spatial grid)

**Why & where:** `resolve()` returns a fresh `{x,z}` **per call** (colliders.js:74) and
is called by the player **and every enemy** each frame; `losClear` runs per enemy per
frame; `[t1,t2] = [t2,t1]` (95,103) allocates a temp array inside the LOS inner loop.
**Touches:** `colliders.js`, and callers `player.js:207`, `enemies.js` (1423/1454/1465/1586).

**Change (two parts — split if desired):**
- **7a (small, do first):** `resolve()` writes into a passed-in scratch `{x,z}` (or two
  out-params) instead of returning a new object; swap `[t1,t2]` for a temp local. Update
  callers to pass a reused scratch. Zero behavior change.
- **7b (optional, bigger):** build a uniform-grid / cell bucket **once** at registration
  so `resolve`/`losClear` test only nearby boxes (>100 boxes today, 2 relaxation passes,
  every mover). The collision *math* is untouched — only which boxes are considered.
  Gate behind identical-result assertions in `play`/`smoke`.

**Acceptance:** no per-query alloc; player + enemy collision identical (walls still stop
you in the same places — verify with `play` and by walking the house perimeter in
buildshots). **Risk:** 7a low; 7b medium (correctness of the index). **Rollback:** revert.

### STEP 8 — mansion.js: drop the per-frame `house.traverse`, cache door list

**Why & where:** `house.traverse((o)=>{ if(o.userData.isGlow) o.visible=power; })`
(mansion.js:1399) walks **the entire mansion scene graph every frame** + allocates a
closure, purely to flip ~12 glow planes that only change when power toggles. Also
`Object.values(doors)` (1381) and `flames.entries()` allocate per frame. **Touches:**
`mansion.js`, `npcs.js` (flames is in npcs — see Step 9; keep mansion-only here).

**Change:** collect the glow **meshes** into an array at build time (next to the existing
`glowPlanes` at 577–578) and, on power change, `for (const g of glowMeshes) g.visible =
power;` — remove the traverse. Cache `const doorList = Object.values(doors)` once and
iterate it in `update`. **Acceptance:** window glow toggles identically on power on/off
(buildshots power-on frame matches); no per-frame traverse. **Risk:** low. **Rollback:** revert.

### STEP 9 — npcs.js: hoist face-loop array, drop per-frame `.find` closures, index flames

**Why & where:** `driveFaces` allocates a fresh array-of-arrays **every frame even while
paused** (npcs.js:449); `npcs.update` does two `list.find((n)=>...)` closures per frame
(339, 420) for refs already in scope; `flames.entries()` destructures per frame (315).
**Touches:** `npcs.js` (sequence vs Step 8 if that one also edits npcs — keep them
disjoint: Step 8 = mansion only, Step 9 = npcs only).

**Change:** hoist the rig/id list to a closure-scope constant (reassign only the
alternating `maraRig` slot); use the already-captured `maraNpc`/`eliseoNpc` references
instead of `find`; convert `flames.entries()` to an index loop. **Acceptance:** blink/
speak/walk-face behavior identical in npcshots + a talk-to-Mara pass in `play`. **Risk:**
low. **Rollback:** revert.

### STEP 10 — player.js: reuse movement/light/camDir vectors

**Why & where:** `player.update` allocates `right` (player.js:233) and `ld` (242) every
frame; `camDir()` (105) allocates via its default arg because main calls it with no
out-param each frame. **Touches:** `player.js`, `main.js` (one call site).

**Change:** preallocate `this._right`, `this._ld`, `this._camDir` in the constructor and
`.set(...)` them; have main.js pass a reused scratch to `player.camDir(scratch)` in the
per-frame interact-prompt call (vignettes.js already passes a scratch — good precedent).
**Acceptance:** movement + flashlight aim + interact targeting identical in `play`.
**Risk:** low. **Rollback:** revert.

### STEP 11 — world.js: dust-mote array access, night-phase throttle, fog-bank loop

**Why & where:** all in `world.update`/`setNightPhase`. **Touches:** `world.js`.
- **Dust motes (1468–1476):** ~2,100 `BufferAttribute` accessor calls/frame. Operate on
  the backing `Float32Array` directly (`mPos[i*3+…]`) and hoist the `getAttribute` call
  out of the loop; keep the single `needsUpdate = true`. Motes drift identically.
- **`setNightPhase` (1415–1442):** the moon advances a sub-pixel arc per frame yet every
  frame runs `.normalize()`, two `lookAt`, a `rotateZ`, and ~4 Color lerps. Cache last
  phase and early-return when `|Δphase| < 1e-4` (or recompute every Nth frame). Visually
  identical (the skipped delta is below one pixel/one 8-bit color step).
- **Fog banks (1461–1466):** use an indexed `for` loop (avoid iterator objects) and
  mutate `s.userData` fields in place in `placeBank` instead of assigning a new object
  literal (1382). Same motion.

**Acceptance:** dust/fog/moon/dawn look identical across a night in `play` (spot-check a
few `_screenshots` times of day); no measurable regression. **Risk:** low–medium (the
phase early-return must not visibly stair-step the moon — verify a timelapse). **Rollback:** revert.

### STEP 12 — story.js: cheaper interact scan + marker list + Mara anchor

**Why & where:** `currentInteract` (2039–2055) runs every frame over **44 items** doing
a `Math.hypot` for each *before* the range test and allocating a `{item,label}` literal
on each nearer candidate; `story.update` sweeps all 44 for markers (2104–2108) and
resolves Mara's anchor + a heightfield sample every frame (2081–2084). **Touches:**
`story.js`.

**Change:** compare **squared** distance first (`dx*dx+dz*dz > r*r`) and only `sqrt`
survivors; reuse one preallocated `best` object (mutate fields). Build `this._markerItems`
once in `addItem` and iterate only those. Recompute Mara's anchor only when
`mara.walking`; cache the Mara reference (no per-frame `byId`). **Acceptance:** the exact
same interact prompt appears at the same range for every item (walk a `play` pass past
several interactables); markers pulse identically. **Risk:** low. **Rollback:** revert.

### STEP 13 — audio.js: drop the per-frame closure, pre-build the noise buffer at load

**Why & where:** `update()` allocates one arrow closure per frame (audio.js:768); the
4-second (~180 k-sample) `_makeNoise(4)` fill (22, 111–122) runs inside `ensure()` on the
click-to-start gesture — a one-time hitch at exactly the "player clicks Begin" moment.
**Touches:** `audio.js`, possibly `main.js` (to trigger buffer build during the load
screen). **Depends on:** nothing.

**Change:** call `param.setTargetAtTime(...)` directly at each site (or a small class
method taking `t`) instead of the per-frame `set` closure. Generate `noiseBuf` during the
loading screen on a suspended `AudioContext` (`createBuffer` works while suspended), then
just `ctx.resume()` on the gesture — identical bytes, identical sound, hitch removed from
the interactive moment. **Acceptance:** audio is unchanged by ear/graph; no alloc in
`update`; click-to-begin no longer spikes. **Risk:** low (AudioContext lifecycle — keep
the gesture-time `resume`). **Rollback:** revert. *(The optional node-pooling for
crackle/heartbeat bursts is deliberately out of scope — it's a bigger change for minor
gain; leave the one-shots as-is.)*

---

## TIER 3 — Baseline headroom (steady GPU cost; makes GC hitches less likely to drop frames)

### STEP 14 — Grade shader: replace the per-pixel Bayer loop

**Why & where:** the dither in `postfx.js` runs a 16-iteration loop with a branch **per
pixel** (postfx.js:33–43) to index a 4×4 matrix. **Touches:** `postfx.js` (fragment
shader only).

**Change:** compute the Bayer value with the standard branchless bit-math / `mat4`
constant lookup (or a tiny 4×4 const array indexed directly) — **identical dither
output**, far cheaper. **Acceptance:** rendered frames pixel-identical to before (diff a
still frame); baseline avg holds or improves. **Risk:** low (verify the values match the
existing matrix exactly). **Rollback:** revert.

### STEP 15 — Postfx pass audit (optional, measure-gated)

**Why:** the composer runs 4 full-screen passes every frame (Render → UnrealBloom →
Output → Grade). **Touches:** `postfx.js`.

**Change (only if it profiles as free of visual change):** lower `UnrealBloomPass`
internal resolution (it's a soft glow — half-res is usually indistinguishable), and/or
fold `OutputPass` tone-mapping/color-space into the grade pass to save one full-screen
blit. **This step is gated:** ship it **only** if a side-by-side still frame is visually
identical *and* the perf harness shows a real baseline gain; otherwise abandon it.
**Acceptance:** baseline avg drops with zero visible change to bloom/grade. **Risk:**
medium (visual parity) — hence measure-gated. **Rollback:** revert.

---

## TIER 4 — Load time (optional, careful)

### STEP 16 — Trim the 15.7 s load without reintroducing in-play freezes

**Why:** a 15 s black-ish load screen is its own kind of frustration, but the warm-up is
what *prevents* in-play shader freezes — so this is delicate. **Touches:** `main.js`
(preload/warm-up ordering), possibly `assets.js`.

**Change (only what's provably safe):** run the independent preloads
(`preloadAssets` / `preloadMonsterTextures` / `preloadNpcTextures`) concurrently with
`Promise.all` instead of sequentially; keep `warmUpRenderer()` (do **not** cut the shader
compile — that's the anti-freeze insurance). Improve the progress text so the wait reads
as progress, not a hang. **Acceptance:** measurably shorter load; **`spawn`/`enter house`
worst frames must not regress** (proves warm-up still covers everything). **Risk:**
medium — never trade a shorter load for a returning in-play hitch. **Rollback:** revert.

---

## Suggested order & dependencies

**ALL STEPS COMPLETE (2026-07-21).** Status:
- ✅ Step 1 (harness), LE-0 (throttle harness)
- ✅ Step 2 (photo freeze), Step 4 (finale guard)
- ✅ LE-1/2/3 (quality manager, auto-governor, Options menu) — HIGH proven pixel-identical
- ✅ Step 3 (shared drip geometry — pooling deferred, see below)
- ✅ Steps 5,6 (enemies allocs), 7 (colliders), 8 (mansion), 9 (npcs), 10 (player), 11 (world), 12 (story), 13 (audio)
- ✅ Step 14 (branchless Bayer, pixel-identical)
- ✅ Step 16 (parallel preloads) + mote-count tier lever (extra)
- ⏸️ Step 15 (OutputPass merge) — audited, NOT pixel-identical (chromatic-aberration resamples after tone-map), correctly skipped.

### Final measured results (warm, fast machine — `npm run perf`)
| metric | before | after |
|---|---|---|
| take photo (full album) worst | 37–44 ms | **~13 ms** |
| finale churn worst | ~12 ms + per-frame GC | **~9.5 ms**, no per-frame alloc |
| long walk GC worst | 42–169 ms | **~31 ms** (p99 10 ms) |
| hot-path allocation | 2965 B/frame | **1657 B/frame (−44%)** |
| baseline / HIGH visuals | — | unchanged (pixel-identical) |
Weak-machine (6× CPU throttle): long-walk avg 50→44 ms; spawn worst −17%; plus the whole
adaptive-quality system that auto-scales GPU load on struggling hardware.

### Deferred (risky/large — future dedicated pass)
- **Enemy rig pooling** (bigger spawn-hitch fix): needs an exhaustively-correct state reset; a
  wrong reset corrupts a reused enemy. Shipped only the safe geometry-sharing win instead.
- **Instancing the ~800 procedural world/building meshes** (dock = ~1724 draw calls): a large
  world.js/mansion.js refactor with visual-parity risk. Repeated foliage is already instanced.
- **OutputPass→grade merge** (Step 15): not pixel-identical; skipped.
The adaptive-quality fill-rate levers cover weak GPUs safely without these.

**Same-file sequencing (must not run in parallel):**
`enemies.js` → Steps 3, 5, 6 (and 7's caller edits). `story.js` → Steps 4, 12.
`npcs.js` → Step 9 (keep Step 8 mansion-only). `main.js` → touched lightly by 2, 10, 13, 16.

**Definition of done for a step:** targeted metric improved on `npm run perf`, no metric
regressed beyond noise, the relevant screenshot harness matches `_screenshots/`, and no
console errors.

**Expected outcome:** photo capture and manifestation stop freezing (the two hitches a
player actually notices), the walk-time GC pause disappears, and baseline frame time
gains headroom — a game that "works perfectly and stays smooth," with visuals and
gameplay byte-for-byte unchanged.
