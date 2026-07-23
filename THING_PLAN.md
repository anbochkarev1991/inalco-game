# THING_PLAN — the upstairs mass → a Carpenter-class amalgam

> **STATUS: COMPLETE (2026-07-23).** All tasks T0–T14 shipped and verified
> (play.mjs green, two headless behavior probes, perf: dock 8.3 ms unchanged,
> load +0.36 s, tri budget 123.9k ≤ 140k). Mid-build user directives folded in:
> no straight silhouette lines; sculpted-flesh faces only (the painted makeHead
> read as alien and was removed); the ENTRY-LURCH "run first" beat; the
> convulsion + photo-difference on flash; the hidden-but-rumored design (note,
> ceiling stain, stair drag-marks). Gallery: `_screenshots/thing/`, sound
> WAVs: `_screenshots/thing/audio/`.

Reference: **John Carpenter's *The Thing* (1982)**. Target: replace the flattened
icosahedron blob in the upstairs east-wing bedroom with a detailed, reactive,
genuinely frightening set-piece that pushes the engine's real capabilities —
and is emphatically **not a big ball**.

Scope is CONCENTRATED: one creature, one room, its sounds, its photo payoff, and
one foreshadow downstairs. No new enemies, no new quests, no new mechanics
outside this room.

---

## 1. Why the current thing fails

`buildBreathingMass()` ([mansion.js:485-559](src/mansion.js#L485-L559)) is:

- **One convex dome** — a noise-displaced icosahedron squashed on Y. Whatever we
  paint on it, the silhouette says "ball". Silhouette is 90% of a monster read.
- **Abstract** — vertex-color blotches + two eyeball spheres. Nothing in it was
  ever a person. Carpenter's horror is the opposite: *specific, recognizable
  anatomy in wrong configurations*. A face is scary; a texture is not.
- **One rhythm** — a single sine breath on `scale`. Perfectly periodic motion
  reads as a screensaver, not a body.
- **Blind** — it doesn't know you exist. It never reacts to being watched,
  approached, or photographed. Horror needs the suspicion that *it noticed you*.
- **No payoff** — the game's signature mechanic (the camera shows the truth) is
  unused on the single weirdest object in the game.

What makes the Thing the right reference (design pillars, in priority order):

1. **It was people.** Human parts — faces, hands, a ribcage, hair — surfacing
   from undifferentiated flesh. The player must recognize anatomy before they
   can be horrified by its arrangement.
2. **Stillness ↔ violence.** It is almost inert for minutes, then moves once,
   wetly, decisively. No constant wobbling.
3. **Wrong arithmetic.** Two breathing rhythms that never sync. Too many of
   something, too few of something else. Left where right should be.
4. **Transitional flesh.** Sinew strands, membranes, a seam that could open.
   The body is a *process*, not a shape.
5. **It fits the lore.** The lake rebuilds the drowned from mourners' memories.
   This is where the drafts that didn't resolve ended up — several half-made
   Returned fused into one. A photograph (a memory that can't blur) shows what
   it really holds. Nothing new has to be invented; the plot bible already
   explains it.

---

## 2. Creature spec — "the Unfinished"

Room: upstairs east wing, local (10.1, deck, −1.7), house at (0,−14), i.e.
world ≈ (10.1, 5.9, −15.7). Doorway to the west, walk lane preserved
([mansion.js:1432-1441](src/mansion.js#L1432-L1441)).

### 2.1 Silhouette & massing (the anti-ball contract)

A **low asymmetric sprawl**, ~3.4 m wide × ~1.5 m tall at its highest point,
pooled across the floor **and climbing ~1.2 m up the east wall** in a peeling
flap, as if it slumped against the wall and kept growing. Long axis roughly
north-south along the wall. Hard acceptance criteria (checked by screenshot in
every task):

- From the doorway, width : height ≥ 2.5 : 1.
- No single convex lobe occupies more than ~40% of the silhouette.
- At least three distinct outline events read from the doorway: the wall-climb
  flap, the reaching arm, and the raised ribcage hump.

### 2.2 Anatomy (single fused mesh + ride-on parts)

Built as **ONE continuous SkinnedMesh** through the existing SDF pipeline
(`Sculpt` / `polygonize` / `taubinSmooth` / `displace` / `cylinderUVs` /
`buildSkinnedRig` — [monstermesh.js:55-540](src/monstermesh.js#L55-L540)), with
human-scale parts riding bones the way Mara's face/hands ride her skeleton
([npc/mara.js:279-303](src/npc/mara.js#L279-L303)):

1. **The arm.** A full human arm emerges elbow-first from the west side of the
   mass, forearm down, and a `makeHand` ([npc/parts.js](src/npc/parts.js)) hand
   pressed flat on the floorboards *toward the doorway lane* — the first thing
   the player's torch finds is a hand, and the eye follows it back into the
   mass. Bones `sh/el/wr`; the hand mesh rides `wr`. Idle: every 20-40 s the
   fingers give 3-5 slow drum-taps (wrist-roll + tick audio).
2. **The ribcage.** A half-submerged human torso — ribs and clavicles sculpted
   exactly like the testigo's ([monstermesh.js:248-322](src/monstermesh.js#L248-L322))
   — rising from the mass mid-body, **breathing on its own bone (`breathB`) at
   a different rate than the mass (`breathA`)**. The two rhythms never sync;
   this is the core "more than one sleeper" tell, delivered by animation, not
   text.
3. **The resolved face.** A real painted human head — `makeHead({drowned:true,
   eyesClosed})` ([npc/face.js:627-705](src/npc/face.js#L627-L705)) — sunk to
   the cheekbones into the mass near the wall flap, tilted wrong (~40° off any
   axis a resting head would take). Eyes CLOSED by default; a pre-rendered
   eyes-open variant is swapped in via the existing `setFace` map-swap
   machinery when triggered (§2.5). Wet-curtain hair (`makeHair`,
   [npc/face.js:450](src/npc/face.js#L450)) spills from its scalp across the
   mass and onto the floorboards (cards merged per material — the R19 draw-call
   gotcha).
4. **The half-emerged face.** A second face sculpted directly in the SDF using
   the archivero's `face()` technique ([monstermesh.js:379-469](src/monstermesh.js#L379-L469)):
   skull ellipsoid + socket carves + open-mouth carve, pushing *through* the
   surface elsewhere on the mass — mid-scream, skinned over, no eyes. Membrane
   over a scream.
5. **The hand under the skin.** A palm-with-fingers bulge sculpted just under
   the surface on the wall flap, skinned to its own `push` bone. In the PRESSED
   state the bone translates outward ~8 cm so the skin *tents over a pressing
   hand* — the pushing-through-latex gag, done with skinning (no runtime SDF).
6. **The seam.** A long horizontal seam across the front lobe — carved shut,
   with `jawU/jawL` bones on its lips. Idle: it parts millimetres with the
   breath. In the flash convulsion it GAPES ~30 cm, revealing a dark wet
   interior and two arcs of small teeth (merged cone geometry riding the jaw
   bones; off-white MeshPhysical, low `specularIntensity`, so the flash
   catches them).
7. **Sinew & roots.** 6-8 thin tapered tendrils (TubeGeometry along curves,
   merged into ≤2 draw calls) rooting the mass to floorboards and wall —
   static. Plus 2-3 *animated* strands on 2-bone chains that sway almost
   imperceptibly and snap taut in the convulsion. Water drips at the low edge
   via the existing `makeDrips` LineSegments technique
   ([enemies.js:822-848](src/enemies.js#L822-L848)).

**No eyeball spheres floating in sockets.** The current milky/dark pupil pair
is the "weird toy" read — delete. Eyes exist only as (a) the painted closed →
open face, and (b) dark carved sockets on the SDF face.

### 2.3 Skin & material

One `MeshPhysicalMaterial` on the body (the engine's proven anti-blowout
recipe — low `specularIntensity` ~0.25; the R19 rule that lit MeshStandard
always blooms white under the 115-cd torch):

- **Albedo**: a new 512-1024 px canvas texture in the `drownedFlesh` family
  ([npc/textures.js](src/npc/textures.js)) that keeps the current sickly
  palette the flat mass already established (bruise purple / bile green /
  raw red / infected pink / grey rot) but as *organic texture* — mottle,
  waterline bands, capillary webs — instead of smooth vertex blends.
  Vertex colors carry only baked cavity AO (`bakeAO`,
  [npc/pipeline.js](src/npc/pipeline.js)).
- **Normal**: `heightToNormalTex` Sobel bake from a painted height canvas —
  pores, stretch striae radiating from the seam and around emerging parts.
- **Roughness map**: broad matte skin with glistening LOW-roughness streaks
  (fresh wet paths below the seam and drip lines) + `clearcoat` ≈ 0.3.
- **Shader injection** (`onBeforeCompile`, precedent: monster subsurface at
  [enemies.js:536](src/enemies.js#L536), wind at [world.js:150](src/world.js#L150)):
  - reuse the torch-gated fake subsurface + lividity block (uniforms
    `uSSSCol/uSSSStr/uLividCol/uBodyH`) so the torch makes thin parts glow
    raw from inside;
  - add `uBulge` (vec3 local pos) + `uBulgeAmt`: a gaussian vertex swell that
    **travels under the skin** along an authored path — the "something moved
    beneath the surface" beat, costing one uniform update per frame;
  - add a very slow peristalsis wave (vertex, amplitude ~1 cm) gated to ~0
    when the player is not upstairs;
  - set `customProgramCacheKey` and make sure the material is in the scene
    before `warmUpRenderer` (mansion builds pre-warm-up, so it is — verify).

### 2.4 Motion language

Explicitly **NOT stop-motion** — that's the Returned's signature. The
Unfinished is smooth, slow, peristaltic… and only ever *repositions* when
unobserved. Layers:

- `breathA` (mass, ~0.14 Hz, deep) and `breathB` (ribcage, ~0.36 Hz, shallow)
  — free-running, never synced, with occasional held breaths (3-5 s of
  nothing, then a catch-up swell — silence as a scare).
- Spring-damper micro-twitches (`springScalar`/`springVec3`,
  [enemies.js:372-379](src/enemies.js#L372-L379)) on the arm, strands, wall
  flap — rare, small, decaying.
- The traveling `uBulge` surfacing (proximity-triggered, §2.5).
- Finger drum, seam millimetre-breathing, head micro-tilt.

### 2.5 Behavior state machine (the concentrated scare design)

The thing never moves from its spot and never attacks — it is a set-piece
whose threat is *attention*. States (hysteresis on all thresholds):

| State | Condition | Behavior |
|---|---|---|
| **DORMANT** | player not upstairs (`pos.y ≤ 4`) | breath bones only, ticked at ~5 Hz; shader waves off; strands static |
| **AWARE** | player upstairs | full-rate idle; breath deepens with proximity; the resolved face rotates a few degrees to *face the doorway you'll enter from* |
| **REGARDED** | in room, dist < 5, `lookDot > 0.55`, LOS clear | **everything stops except the two breaths.** After ~7 s of sustained watching, the resolved face's eyes OPEN (map swap + one soft wet sound + one-time Ana line). They stay open until the player leaves the floor |
| **SHIFT** | was REGARDED, then looked away (`lookDot < 0.15`) for > 0.7 s | ONE wet reposition while unseen: the arm re-plants 20-30 cm over, head tilt changes, a strand relocates, the bulge surfaces somewhere new — plus a panned wet-slide + floorboard creak. Cooldown 6-9 s. When the player looks back: stillness. This extends the game's established grammar (the Draft moves only unobserved) to a set-piece |
| **PRESSED** | dist < 1.9 | keeps the existing composure drain + breath-synced red `fx.damage` pulse ([main.js:849-871](src/main.js#L849-L871)); adds: the under-skin `push` hand tents outward on the player's side, breath rate climbs, the seam parts a few mm |
| **ENTRY LURCH** | first sight from the doorway (once per upstairs visit) | **the "RUN" beat (user directive 2026-07-23): the player's FIRST instinct on entering must be to flee.** The breath bed cuts to dead silence for ~0.5 s, then the whole mass HEAVES once toward the door — root-bone lurch + scale surge, the planted hand slaps the boards, a loud wet exhale-roar + floorboard groan, `fx.glitch`/`fx.damage` spike, a sharp one-time composure hit (~−8). Then it settles back to the two breaths and NEVER pursues — the player flees, realizes it stayed, and only then dares return. Re-arms when the player leaves the floor |
| **CONVULSION** | photographed in-cone within ~9 m | the big scripted scare, §2.6 |

Needs player context inside the mansion update: `buildings.update(dt)`
([main.js:833](src/main.js#L833)) grows an optional second arg
`{playerPos, camDir, upstairs}`; `breathers` change from `update(t)` to
`update(dt, t, ctx)` ([mansion.js:1908](src/mansion.js#L1908)). Backward
compatible — nothing else consumes breathers.

### 2.6 The flash convulsion + the photo payoff

**Convulsion** (live, ~1.4 s): triggered from the flash path in main.js (after
the enemy-hit and cellar-girl checks). Springs drive: root arches up ~15 cm,
the seam gapes with the teeth catching the flash burst, the arm hand slaps the
floor, animated strands snap taut, tendrils shiver; a layered 3-voice detuned
chorus scream (the drowned crew, `_glottalVowel` stack,
[audio.js:432](src/audio.js#L432)); `fx.glitch`/`fx.damage` spike. Then it
slumps and is *utterly still* for a 60 s refractory. Second flash: half
intensity. Third and later: only a slow tightening — it has learned the flash,
which is its own kind of awful (and prevents farming the scare).

**Photo payoff** (the polaroid, one-time): registered through the existing
reveals system (`add` at [reveals.js:194](src/reveals.js#L194), shown only
inside the capture block, [main.js:992-1027](src/main.js#L992-L1027)). In the
developed photo the mass has **more than it shows live**: two additional
drowned faces surfaced (extra `makeHead({drowned:true})` heads, unlit-dark per
the reveal pattern), a second arm, and the resolved face's eyes open even if
they were closed. Caption + one-time Ana line (§6). This is the game's thesis —
*the photograph remembers what the lake blurred* — landing on its strangest
object.

### 2.7 Sound (deliberately simple — per the standing "keep sound simple" steer)

- **One persistent bed**: two looping wet-breath layers (built once in
  `ensure()` like wind/lake beds, [audio.js:24-106](src/audio.js#L24-L106)) at
  the two breath rates, gain driven by a new `p.mass` proximity param +
  `p.massPan` in `audio.update` ([audio.js:788](src/audio.js#L788)); main.js
  computes proximity/pan from `anchors.breather` (pan recipe:
  [vignettes.js:126-131](src/vignettes.js#L126-L131)). Faintly audible through
  the floor in the ground-floor east bedroom (it's distance-based — free).
  The bed must be clearly audible in the upstairs corridor BEFORE the player
  reaches the doorway — the dread is loaded pre-entry so the ENTRY LURCH
  (§2.5) lands on a primed player. The bed also SUPPORTS the lurch: it cuts
  to silence for the half-second before the heave.
- **One-shots**: `massShift(pan)` (wet slide + wood creak), `massChorus(pan)`
  (the convulsion scream), `massTick(pan)` (finger drum). WAVs dropped once
  via `scripts/voiceshots.mjs` for a single optional listen — no per-task
  listening requests.

### 2.8 Room dressing, foreshadow & THE RUMOR (small, cheap, high-yield)

**Design stance (user, 2026-07-23): the thing stays optional and hidden — the
best scare is the one not everyone finds — but a hidden thing with NO hint is
a thing nobody knows they missed. So we plant a rumor of it, never a marker:**

- **Floor stain** under the mass: dark unlit canvas-texture decal plane.
- **Veins**: dark flattened ridges (merged box/tube geo + the vein texture)
  crawling from the mass across the floorboards, around the chimney breast,
  and up the wall — the room reads as being slowly claimed.
- **Downstairs foreshadow**: on the ground-floor bedroom ceiling directly
  below the mass — a bulging stain + 3-4 short hanging strands. The player
  sees the underside of the thing before ever climbing the stairs, and the
  breath bed is faintly audible there (T11). Payoff architecture for free.
- **The note** (non-evidence, no marker): a caretaker's scrap downstairs —
  "Do not sleep in the east room upstairs. It is not mould. It breathes at
  night. I no longer go up." Registered like sittingNote/pantryNote so it
  costs nothing mechanically but names the destination.
- **The revisit breadcrumb**: via the existing revisit.js one-time-changes
  system — after phase ~0.45, wet drag-marks appear on the staircase treads
  while the player is away. The house itself starts asking the question.
- **Never**: a quest objective, a map marker, or a story gate. The thing is
  found, told about, or missed — that's the legend loop working as intended.

---

## 3. Engine reuse map

| Need | Existing tech | Where |
|---|---|---|
| Fused continuous body | SDF `Sculpt`→`polygonize`→`taubinSmooth`→`displace`→`cylinderUVs` | [monstermesh.js:55-208](src/monstermesh.js#L55-L208) |
| Independent part motion in one mesh | `skinToBones` + `buildSkinnedRig` (bone spec `[name,parent,x,y,z]`, rest pose = sculpt) | [monstermesh.js:212-540](src/monstermesh.js#L212-L540) |
| Human faces (closed→open eyes) | `makeHead({drowned})` + `setFace` map swap; `faceTex({eyesClosed})` | [npc/face.js:37,627](src/npc/face.js#L627) |
| Hair on the mass/floor | `makeHair` clump cards (MERGE per material) | [npc/face.js:450](src/npc/face.js#L450) |
| Hands | `makeHand` riding a wrist bone | [npc/parts.js](src/npc/parts.js), pattern [npc/mara.js:279-303](src/npc/mara.js#L279-L303) |
| Sculpted screaming face | archivero `face()`/`mouth()` carve technique | [monstermesh.js:379-469](src/monstermesh.js#L379-L469) |
| Anti-blowout wet flesh | MeshPhysical + low `specularIntensity` + drowned-flesh canvas maps + `heightToNormalTex` + `bakeAO` | [npc/materials.js](src/npc/materials.js), [npc/pipeline.js](src/npc/pipeline.js) |
| Torch-gated subsurface/lividity + custom vertex motion | `onBeforeCompile` injection + `customProgramCacheKey` | [enemies.js:536](src/enemies.js#L536), [world.js:150](src/world.js#L150) |
| Secondary motion | `springScalar`/`springVec3` | [enemies.js:372-379](src/enemies.js#L372-L379) |
| Observed/unobserved grammar | `lookDot` gating (vignettes), doble's watched-stillness | [vignettes.js:200-203](src/vignettes.js#L200-L203) |
| Photo-only truth | reveals registry + capture-block show/hide | [reveals.js:194,273](src/reveals.js#L273), [main.js:992-1027](src/main.js#L992-L1027) |
| Drips | `makeDrips` LineSegments | [enemies.js:822-848](src/enemies.js#L822-L848) |
| Procedural audio beds/voices | `_loopNoise`, `_wetBreath`, `_glottalVowel`, `update(dt,p)` params | [audio.js:141-432,788](src/audio.js#L788) |
| Proximity fear/fx pulses | existing `_massSeen` block (rewrite, keep hooks) | [main.js:849-871](src/main.js#L849-L871) |
| Quality tiers | `quality.getTier()` + start hint; push levers on `apply()` | [quality.js:29-54,320](src/quality.js#L320) |

---

## 4. Task list (atomic, sequential, one subagent per task, review checkpoint after each)

Every task ends with: `npm run play` → `errors:[]`, `npm run thingshots`
review, and — where noted — `npm run perf` vs `_screenshots/PERF_BASELINE.json`.

- **T0 — Screenshot harness first.** `scripts/thingshots.mjs` + npm script
  `thingshots`: headless portraits from (a) the doorway lane, (b) point-blank
  at the hand, (c) side-on against the wall, (d) the downstairs ceiling stain —
  each in flashlight-only and flood light; plus state shots (dormant / aware /
  regarded / post-shift / convulsion peak) driven via `__niebla` hooks.
  Recipe: upstairs deck world Y = 5.35, room world ≈ (10.1,−15.7); teleport to
  the stair top, poll `camera.y` stable, then walk-place (the R12/R19 recipe);
  yaw sign gotcha: yaw 0 faces −z, π faces +z. Output `_screenshots/thing/`.
- **T1 — Module skeleton + swap-in.** New `src/thething.js`:
  `buildTheThing(quality)` → `{group, update(dt, t, ctx), flash(camPos,camDir),
  setTier(tier)}`. Phase 1 body: base SDF sprawl only (no parts), through
  `buildSkinnedRig` with just `root/breathA/breathB`. mansion.js: delete
  `buildBreathingMass`, import + place the new group (same anchor, adjust
  collider `ucbox` to the new footprint, keep the ≥1.4 m lane), plumb
  `breathers` → `update(dt, t, ctx)`; main.js: pass
  `{playerPos, camDir, upstairs}` into `buildings.update`. Old anchors key
  (`anchors.breather`) kept so main.js proximity block still works untouched.
- **T2 — Silhouette sculpt.** The full massing: wall-climb flap, asymmetric
  pods, long-axis sprawl, bed-ward taper. Tune domain (~{hx 1.7, hy 0.95,
  hz 1.55}) and res (~132). Verify the §2.1 anti-ball criteria in thingshots;
  record tri count (budget §5).
- **T3 — Full bone layout + skinning.** Bones: `root, breathA, breathB,
  wallFlap, sh, el, wr, push, faceBone, jawU, jawL, tA0,tA1, tB0,tB1, tC0,tC1`
  (~17, same order of magnitude as the monsters' 14). Tag every SDF prim with
  its bone; verify skin weights by wiggling each bone in a throwaway harness
  hook; `frustumCulled=false` (skinned poses outrun rest bounds).
- **T4 — Skin material.** Amalgam albedo/height→normal/roughness canvases,
  MeshPhysical low-spec + clearcoat, `bakeAO` vertex AO, `onBeforeCompile`
  (subsurface/lividity reuse + `uBulge` + peristalsis wave) with
  `customProgramCacheKey`. CONFIRM the material compiles during
  `warmUpRenderer` (mansion is built pre-warm-up; check no first-look hitch at
  the stair top — that's the exact moment a compile stall would land).
- **T5 — Embedded anatomy (SDF).** Ribcage/clavicle torso, the half-emerged
  screaming face (archivero technique), the under-skin palm bulge on `push`,
  the seam carve with lip geometry on `jawU/jawL`. Re-verify silhouette + tris.
- **T6 — Ride-on parts.** Drowned `makeHead` sunk to the cheekbones on
  `faceBone` (closed + open eye variants pre-rendered), merged wet hair +
  floor hair patch, `makeHand` on `wr` with the arm planted toward the lane,
  teeth arcs on the jaw bones, static sinew tendrils (≤2 draw calls), 2-3
  animated strands on their bone chains, `makeDrips` at the low edge.
  Unlit-dark (MeshBasic) for hair; count total draw calls (budget §5).
- **T7 — Idle animation layer.** Free-running dual breaths + held-breath
  events, spring micro-twitches, finger drum, seam mm-breathing, head
  micro-tilt; DORMANT throttle (5 Hz, breath only) and the
  upstairs/downstairs gate. Zero per-frame allocations (module-level scratch —
  the enemies.js pattern).
- **T8 — Observation state machine.** AWARE/REGARDED/SHIFT/PRESSED per §2.5
  with hysteresis; eyes-open event; misregistration re-plants (bone lerps over
  ~0.4 s while unobserved, instant-still on look-back); LOS via
  `colliders.losClear`. Rewrite the main.js `_massSeen` block: new staged
  lines (§6), same fx hooks, same fearDrain. Headless-verifiable via scripted
  yaw (look/look-away cycles) asserting pose deltas happen only unobserved.
- **T9 — Flash convulsion.** `thing.flash()` wired into the main.js flash path
  (after enemy + girl checks, before/with reveals); spring-driven arch + seam
  gape + strand snap + floor slap; refractory + diminishing response;
  `fx.glitch/damage` spikes. Verify via play-harness flash at the doorway.
- **T10 — Photo reveal.** Reveal id `'mass'` in reveals.js: overlay = 2 extra
  drowned heads + second arm + forced eyes-open, unlit per the reveal pattern;
  one-time caption + Ana line; confirm the overlay exists ONLY in the captured
  polaroid (live frame clean before and after) and that the journal stores it.
- **T11 — Audio.** The two-layer breath bed + `p.mass/p.massPan` plumb through
  `ambienceParams`; `massShift/massChorus/massTick` one-shots; audible-below
  check in the ground-floor bedroom; drop WAVs via voiceshots for one optional
  listen. No other sound work (standing steer: keep sound simple).
- **T12 — Room dressing + foreshadow.** Floor stain decal, floor/wall veins to
  bed + window, bed-frame drips, downstairs ceiling stain + hanging strands.
  All static merged geometry; verify the ground-floor bedroom read in
  thingshots (d).
- **T13 — Quality tiers + perf pass.** Low tier: build res ~104 (from the
  quality start-hint at load), animated strands static, `uBulgeAmt=0`,
  peristalsis off — breaths stay (they ARE the creature). Runtime downshift
  honored via `setTier`. Run `npm run perf` — steady-state must match
  baseline; add/verify a stair-top approach event so the first-look frame is
  measured. Confirm load-time MC build lands behind the title (~300-400 ms
  expected, like one monster).
- **T14 — Copy + integration sweep.** Final English-only pass on all new lines
  (§6); `npm run play` green; save/restore unaffected (the thing keeps no
  persistent state; reveal `fired` behaves like the other reveals); full
  thingshots gallery for user review; delete any throwaway probes.

Suggested checkpoint order for user review: after **T2** (silhouette — the
make-or-break call), **T6** (full anatomy portrait), **T8** (the watched/
unwatched behavior), **T9+T10** (the scare + the photo), **T13** (perf).

---

## 5. Budgets & constraints (hard)

- **Perf is a hard constraint** (weak-hardware goal): steady-state must not
  regress vs `_screenshots/PERF_BASELINE.json` (~8.3 ms). The thing is ONE
  always-resident instance:
  - Triangles: body ≤ 110 k (archivero res-128 ≈ 92 k — same ballpark),
    everything included ≤ 140 k. Low tier ≈ 60% of that.
  - Draw calls: ≤ 12 total (body 1, teeth 1, tendrils ≤2, hair ≤2, heads ~3,
    hands 1, decals/veins ≤2, drips 1).
  - Per-frame cost when downstairs ≈ zero (5 Hz breath tick, no shader waves);
    full animation only while upstairs.
  - No per-frame allocations anywhere in the update path.
- **No new downloaded assets** — procedural canvases + existing texture set
  only (the monster-overhaul constraint).
- **Load**: one more marching-cubes build behind the title; keep total load
  drift < 0.5 s.
- **English-only UI/copy** throughout.

---

## 6. Copy drafts (final wording at T14; short, no exposition)

- First sight (~5.5 m, replaces `_massSeen=1`): *"It's breathing. Two rhythms.
  More than one sleeper."*
- Close (< 2.9 m, replaces `_massSeen=2`): *"There's a hand. A whole arm. The
  fingers rest on the floor like they're waiting to be needed."*
- Eyes-open (one-time, REGARDED ≥ 7 s): *"The eyes were closed. They were
  closed."*
- Reveal caption: **"THE GUEST ROOM — TOO MANY OF THEM"**; Ana line: *"In the
  photo there are faces I never saw. One of them is smiling."*
- Downstairs stain flavour (optional, only if a line feels needed at T12):
  *"The ceiling is swollen. Something above is heavy, and patient."*

---

## 7. Risks & known gotchas (pre-answered)

- **Point-blank torch blowout**: lit MeshStandard always blooms white; use
  MeshPhysical + low `specularIntensity` for flesh, MeshBasic for hair/voids
  (R16/R19 rules).
- **First-draw compile stall**: every new material must be in the scene before
  `warmUpRenderer`, or the first look from the stair top hitches (R7). T4/T13
  verify explicitly.
- **makeHair draw-call explosion**: merge clump cards per material or meshes
  balloon 67→493 (R19). T6 counts calls.
- **Skinned mesh culling**: `frustumCulled=false` or poses vanish at screen
  edges.
- **Stop-motion identity**: the Returned own stop-motion; the Unfinished must
  stay smooth/peristaltic so it doesn't read as "monster #4". Its unobserved
  SHIFT is instant-still on look-back, not held frames.
- **The mirror**: the Reflector on the west wall renders the room live
  ([mansion.js:1456-1497](src/mansion.js#L1456-L1497)); the thing will appear
  in it when both gates are open — acceptable (and a free extra scare); the
  photo-reveal overlay only exists inside the capture render, where being in
  the mirror is also fine (it's "in the photo").
- **Headless verification quirks**: DOM overlays don't composite into
  `page.screenshot` with a live WebGL canvas (verify polaroid via journal
  state, not screenshots); teleports mis-ground the camera for a few frames —
  poll `camera.y`; yaw 0 faces −z.
- **Bone-scale breathing**: breath is bone scale on skinned regions — verify
  the seam/teeth ride the lips without gaps at max inhale (weld check in T5).

---

## 8. Definition of done

1. From the doorway, in torch light, the silhouette is an asymmetric sprawl
   with a human arm, a ribcage breathing off-rhythm, and something climbing the
   wall — the §2.1 criteria pass and nothing about it reads "ball".
2. It behaves: still when watched, changed when you look back, eyes that open
   if you stare, a hand that presses the skin when you crowd it, one terrible
   answer to the flash — each verified headlessly and by screenshot review.
3. The polaroid shows more than the room did.
4. `npm run play` errors:[]; `npm run perf` matches baseline; load drift
   < 0.5 s; quality Low still plays smoothly with the same creature identity.
5. All copy English-only; no state leaks into save files.
