# Buildings & Signage Overhaul — Atomic Implementation Plan

Survival-horror game (Three.js, Vite). Goal: fix the buildings and all in-world
writing so they read as real, lived-in architecture, add see-through windows so
the Returned are visible massing around the house, and fix the broken cellar
door, boathouse door, and boat — **without regressing the current frame budget**.

This plan is written to be executed by focused **work packages ("subagents")**,
one atomic task at a time. Per the personal workflow, each task = **one feature
branch** (`git`, sequential, no parallel worktrees). The packaging by subject is
so each stream *could* be delegated to a subagent; run them in the dependency
order in §10.

> Prereq note: the working directory is **not currently a git repo**. Before any
> task, `git init` (or confirm the intended repo) so the branch-per-task workflow
> applies. No code has been changed yet — this is a plan only.

---

## 0. What's actually wrong (evidence, with file:line)

Verified by reading the source, not guessed.

### Signs — text/plate "floating," font too big
- `makeSign()` bakes text **into** the board's canvas texture on a single
  `PlaneGeometry` — text and board are one plane, so the *board* floats, not a
  separate text layer. `src/world.js:88-111`.
- Body font is a **hard-coded `26px` on a 512px canvas**, so physical letter
  size scales with the board's `w`: plaque (`w=1.5`) ≈ 0.076 m cap-height, kiosk
  (`w=2.6`) ≈ 0.132 m — inconsistent and oversized. Title auto-fits to ≤46px.
  `src/world.js:100,103`.
- Vertical layout uses **absolute pixel offsets** (`y=66`, `+52`, `+34`) that
  ignore the canvas height, so on short boards text clusters in the top and the
  bottom third is blank. `src/world.js:98-104`.
- Boards are mounted **above** their supports:
  - **Plaque** — post top at `ground+1.3`, board center at `ground+1.75`; the
    board overlaps the post by ~2.5 cm and appears to hover over a thin stick.
    `src/mansion.js:911-921`.
  - **Kiosk sign** — local `y=2.9`, `h=1.25` (spans 2.275–3.525) while the roof
    is at `y≈2.36` → the sign floats **above the roofline**. `src/mansion.js:948-953`, roof `931`.
  - **Ferry sign** — board top (2.575) pokes above the post top (2.35). `src/world.js:1157-1168`.
- Signs use a default single-sided material → **invisible from behind**. `src/world.js:106-109`.
- Good reference pattern already in repo: headstone engraving is a *separate*
  text plane offset +0.003 m off the slab with proportional fonts. `src/story.js:1243-1294`.

### Main house — "no windows, should be transparent, see monsters gather"
- Exterior walls are **solid opaque `BoxGeometry`** boxes; **no openings are cut**.
  `src/mansion.js:381-402` (data-driven `wallSpec`).
- There ARE 7 decorative windows, but they're appliqué glued in front of the
  intact wall and use **`mat.glass` = opaque** `0x1d2b32` (no `transparent`/`opacity`).
  You cannot see through them either way. `src/mansion.js:462-489`, material `24`.
- A transparent glass material already exists (`mat.paneGlass`, opacity 0.12,
  DoubleSide) but is used **only by the greenhouse**. `src/mansion.js:27,1047-1068`.
- **Consequence:** transparent glass alone is NOT enough — the solid wall box
  behind the pane still occludes. Real holes must be cut. (See §4, S2.)
- Interior is decently propped but the shell is plain: flat plaster boxes, one
  flat floor plane, one flat ceiling plane, no baseboards/trim/window reveals;
  bedroom "mirror" is a flat non-reflective plane. `src/mansion.js:553-770`.

### Cellar — "door is half its real height, you go underground, weird"
- Room walls are `wallH=2.0`, ceiling `ceilY=1.95`, floor `y=0`; doorway lintel
  spans y 1.65–1.95 → clear opening only ~1.65 m tall. `src/mansion.js:785-806`.
- Cellar door leaf is **`h=1.6`** (only 74% of the standard 2.16 house door),
  base at y=0 → top at y=1.6, which is **0.5 m below grade** (ground = 2.1).
  `src/mansion.js:849-852`.
- Descent is a real ramp via `player.floorOverride`, through an **open sunken
  areaway** whose retaining walls rise to 2.4 m. You physically drop into a pit
  *before* reaching the stunted, half-buried door — hence "half height, still go
  underground." `src/mansion.js:812-880`, wired `src/main.js:65`.

### Boathouse door — "working weird"
- West wall `[-4.5, 0.9, 0.18, 5.2]` covers local z −1.7…3.5; building depth is 7
  (z −3.5…3.5) → the doorway **gap is 1.8 m** but the **door is only 1.1 m**,
  leaving a permanent ~0.65 m open slot beside the leaf. `src/mansion.js:1101-1110,1163`.
- **No header/lintel** above the door: wall is solid y 0.9–3.6, door top at 3.06
  → ~0.54 m see-through gap above. No side jamb either.

### Boat — "not a boat at all, looks super weird"
- Hull is a **plain box** `1.7×0.55×3.6`; prow is a **4-sided `ConeGeometry`**
  (a square pyramid) rotated/squashed; material is flat grey-blue `0x5a6a72`.
  Reads as a grey crate with a pyramid nose. `src/mansion.js:1138-1152`.
- Sits half-submerged (hull center y≈0.68 over slip water y=0.35). Seats are thin
  floating boards; "outboard" is a box + cylinder.

### Performance context (guardrails you must not regress)
- `pixelRatio` capped at **1.25**; MSAA on; ACES tone-map. `src/main.js:36-42`.
- **Exactly one shadow-casting light** — the player's 1024² flashlight spot,
  re-rendered every frame over all `castShadow` geometry. The moon casts none.
  `src/player.js:39-44`. Adding buildings inflates that single shadow pass.
- Buildings are **hundreds of unmerged `MeshStandard` meshes**, each
  `castShadow=true; receiveShadow=true` (`box()`/`cyl()` at `src/mansion.js:30-42`).
- **`mergeGeometries` is imported at `src/mansion.js:2` but never used** — the
  single highest-leverage, on-pattern optimization available.
- Perf harness: `npm run perf` (ANGLE-Metal headless), **40 ms/frame hitch
  threshold**, includes house/boathouse/greenhouse scenarios. No triangle/draw
  gate — regress against frame time only. Baseline in `_screenshots/PERF_BASELINE.json`
  (scene ~1.74 M tris, 896 meshes, steady ~8.3 ms).
- Foliage already uses `InstancedMesh` + merged geo; frustum-culling disabled on
  dynamic objects; shader warm-up hides first-sight recompiles.

---

## 1. Design principles (apply to every task)

1. **Reuse shared materials** — extend the `mat` dict (`src/mansion.js:13-28`);
   never `new Material()` per mesh in a loop.
2. **Merge static, same-material sub-meshes** with `mergeGeometries` before adding
   to the scene. This is the antidote to every "I added N boxes" perf worry.
3. **No new shadow-casting lights.** Set `castShadow=false` on small interior
   detail and anything that can't fall inside the 23 m flashlight cone; keep
   `receiveShadow` where surfaces are lit.
4. **English-only text** on all signs (already true — keep it; no Spanish flavor
   lines). Matches the project's English-only UI rule.
5. **Art direction:** weathered lake-house 1940s; muted palette from `PAL`
   (`src/config.js:3-33`). Wood = `PAL.wood/woodDark`, plaster `PAL.houseWall`.
6. **Verify visually, headlessly** — every task ends with a before/after shot via
   the harness in §8 and, for anything with colliders/floors, an `npm run play`
   pass. Keep `npm run perf` green.
7. **Atomic** — one concern per task/branch; if a task grows a second concern,
   split it.

---

## 2. Subagent / work-package map

| Pkg | Owner theme | Tasks | Depends on |
|-----|-------------|-------|-----------|
| **S0** | Foundations & tooling | T0.1–T0.4 | — |
| **S1** | Signage & text | T1.1–T1.4 | T0.1 |
| **S2** | House exterior: real windows + transparency | T2.1–T2.5 | T0.2, T0.3 |
| **S3** | House interior detailing | T3.1–T3.4 | T0.3 (T2.1 for reveals) |
| **S4** | Cellar: door height + descent readability | T4.1–T4.5 | — |
| **S5** | Boathouse structure & door | T5.1–T5.4 | T0.2 (opt.) |
| **S6** | The boat rebuild | T6.1–T6.5 | — |
| **S7** | Performance integration & regression | T7.1–T7.4 | all |

Recommended execution order in §10. S0 lands first (unblocks S1/S2/S3). S4, S5,
S6 are independent and can be sequenced in any order. S7 is the closeout.

---

## 3. S0 — Foundations & tooling

### T0.1 — Rewrite `makeSign()` for correct font size & centering
**File:** `src/world.js:88-111`.
**Change:**
- Add opts `capH` (desired physical cap-height of body text in metres, default
  **0.05**) and `titleCapH` (default **0.08**). Derive font px from world size so
  size is consistent regardless of `w`:
  `bodyPx = Math.round((capH / h) * canvasH)` where `canvasH = round(512*h/w)`.
  (Equivalently `capH/w*512` against canvas width.) Result: ~0.05 m letters on
  every board instead of 0.076–0.132 m.
- Replace absolute-pixel vertical layout with **measured centering**: compute the
  total block height (title line + `lines.length` body lines at their line-height)
  and start `y` so the block is vertically centered in `H` (mirror the no-title
  branch's `H/2` logic for both branches).
- Make the board legible from both sides: set the mesh material `side:
  THREE.DoubleSide` **and** give the board real thickness by returning a thin
  `BoxGeometry(w, h, 0.05)` with the texture on front+back (or add a plain-wood
  back plane). A sign with no back currently vanishes when viewed from behind.
- Keep the wood-grain noise and border; keep API back-compatible (existing
  callers pass `lines`, `opts`).
**Acceptance:** every existing sign renders with uniform ~0.05 m text, vertically
centered, readable from behind. **Perf:** none (same 1 draw call per sign, now a
thin box). **Verify:** shots of plaque/kiosk/ferry (§8).

### T0.2 — Transparent window glass material + wall-opening helper
**File:** `src/mansion.js` (near `mat` dict `13-28`).
**Change:**
- Add `mat.winGlass = new THREE.MeshStandardMaterial({ color: 0x0e1a1f,
  roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.28,
  depthWrite: false, side: THREE.DoubleSide })`. Dark, glassy, see-through both
  ways. (Do **not** reuse the opaque `mat.glass`.)
- Add a helper `wallWithWindows(house, cx, cz, w, d, opts)` that emits a wall with
  real rectangular holes: given the wall's run axis (x for front/back where `w`
  is length & `d` thickness; z for sides where `d` is length & `w` thickness) and
  a list of openings `{u, ow, sill, head}` (u = center along the run axis, ow =
  opening width, sill/head = y-range), it produces **left pier / right pier /
  under-sill panel / over-head panel** boxes that share `mat.plaster`, pushes them
  to an array for merging (T0.3), and adds colliders per §4-note below.
**Colliders/LOS gotcha (critical):** `losClear()` is purely 2D and **ignores y**
(`src/colliders.js:78-84`). So the sill panel and header panel, though physically
below/above the opening, would still block 2D sight if `blocksSight:true`.
Therefore: **piers → `blocksSight:true`; sill & header panels → `blocksSight:false`**,
and add a low physical (non-sight) collider only for the sill so the player can't
walk through the low part. This is what lets you *see* the Returned through the
opening while the wall around it still blocks sight.
**Acceptance:** helper cuts a real hole; `losClear` returns true across an
opening, false across a pier. **Perf:** 4 boxes/window, but merged in T0.3 → net
neutral. **Verify:** unit-eyeball with one test window before S2 rolls it out.

### T0.3 — Static-merge utility for buildings (activate the dead import)
**File:** `src/mansion.js` (uses `mergeGeometries` already imported at line 2).
**Change:**
- Add `mergeInto(target, geos, material, {castShadow=true, receiveShadow=true})`
  that merges same-material `BufferGeometry` list into one `Mesh` and adds it to
  `target`. Prefer building each structure's static, same-material sub-meshes into
  arrays and merging per material group (plaster, wood, stone, shingle…), matching
  the established `world.js` pattern (`src/world.js:571,1138`).
- This task **provides the utility**; each stream applies it to its own building
  (T2.5, T3.4, T5.4, T6.5, and T7.1 sweeps the rest). Do **not** refactor all
  buildings here — keep it atomic.
**Acceptance:** utility merges N same-material boxes into 1 mesh/1 draw call with
identical visuals. **Perf:** strictly reduces draw calls & shadow-pass cost.
**Verify:** `npm run perf` unchanged or better on the house scenario.

### T0.4 — `scripts/buildshots.mjs` before/after harness
**File:** new `scripts/buildshots.mjs` (+ `"buildshots"` npm script), modeled on
`scripts/monstershots.mjs`.
**Change:** launch headless Chrome, `?skipintro&calm`, click to begin, then for
each viewpoint in the table below set `__niebla.player.pos/yaw/pitch/flashOn` and
screenshot into `_screenshots/buildings/<name>.png`. Include a `NIGHT_ENEMIES`
mode that spawns 3 of a Returned kind in the yard so window visibility can be
judged. Access `__niebla.buildings`, `.world` for state (power on/off).

| name | player pos (x,y,z) | yaw | looking at |
|------|--------------------|-----|-----------|
| house-front | (1, 0, 2) | 0 | front façade + porch (wall z≈−7.5) |
| house-front-in | (1, 0, −10) | π | front windows from inside |
| house-rear | (0, 0, −26) | π | back door + areaway mouth |
| house-side-E | (18, 0, −14) | −π/2 | east side windows |
| cellar-foot | (5, 0, −20) | π | cellar door at stair foot |
| cellar-room | (4.5, 0, −17) | π | door from inside the room |
| kiosk | (7, 0, 34) | −π/2 | kiosk sign on the storefront |
| ferry-sign | (−1, 0, 70) | π | jetty schedule sign |
| plaque | (3.4, 0, 1) | 0 | historical plaque |
| boathouse-slip | (−46, 0, 67) | 0 | slip mouth + boat + door |
| boathouse-door | (−53, 0, 57) | −π/2 | west door from outside |
| boat-detail | (−46, 0, 65) | 0 | boat close-up |

**Acceptance:** one command produces the full gallery. **Perf:** n/a (tooling).

---

## 4. S2 — House exterior: real windows & see-through glass

> The headline feature. **T2.1 (cut holes) is mandatory** — transparent glass on a
> solid wall shows nothing. Depends on T0.2 + T0.3.

### T2.1 — Cut real openings in the exterior walls
**File:** `src/mansion.js:381-402` (`wallSpec` build loop) and window list `463-467`.
**Change:** for each wall segment that hosts a window, replace the solid `box()`
+ `cbox()` with `wallWithWindows()` (T0.2), passing the openings for that segment.
Standard opening: `ow=1.0`, `sill=0.9`, `head=2.3` (eye-height band 0.9–2.3, so a
1.62 m eye sees straight out). Keep exterior wall thickness (0.5) and material.
Apply to front, back, and both side walls. Route pier/sill/header geos into the
plaster merge array (T2.5).
**Acceptance:** standing inside, `losClear(playerXZ, yardXZ)` is true through each
window; a box placed in the yard is visible through the hole. **Perf:** +3 boxes
per window pre-merge, **0 net** after T2.5. **Verify:** `house-front-in`,
`house-side-E` shots; `NIGHT_ENEMIES` shows silhouettes through glass.

### T2.2 — Swap window glazing to transparent, keep the joinery
**File:** `src/mansion.js:468-488` (window group loop).
**Change:** change `glassP` material from `mat.glass` → `mat.winGlass` (T0.2).
Keep frame, muntins (`cross1/cross2`), sill, header, shutters. Move the glass
plane to sit **in** the new opening (flush with wall mid-thickness) rather than
0.075 m proud of a solid wall. Keep the powered "glow" plane but move it just
inside the glass so lit rooms still bloom warm at night; it must not fully occlude
the view (opacity already 0.85 — drop to ~0.4 so you can see in past it, or hide
it when the player is outside and enemies are near).
**Acceptance:** you can see the interior from outside and the yard from inside;
glass still reads as glass (reflective sheen, dark tint). **Perf:** transparent
panes add sorting cost — keep count modest (≤ ~14) and non-overlapping. **Verify:**
`house-front`, `house-front-in`.

### T2.3 — Add windows for all-around coverage
**File:** `src/mansion.js:463-467` (window list) + matching openings in T2.1.
**Change:** the current 7 windows skew to the front. Add openings so **every
outside wall the Returned can approach has an eye-height window**: +2 on the back
wall, +1 more on the east side, +2 on the west side (west currently has none).
Target ~11–13 windows total, spaced to cover the yard arcs where enemies gather
(front path, rear areaway yard, both flanks). Align new windows to fall between
interior partitions so the sightline actually reaches outside (don't put a window
where an interior wall sits 0.3 m behind it — check `wallSpec` partition x/z).
**Acceptance:** from a slow interior turn you can see all four approaches.
**Perf:** covered by T2.5 merge. **Verify:** 360° interior shot sequence.

### T2.4 — Night visibility & LOS behavior check
**File:** verification + light tuning only (`src/mansion.js` lamps, `src/night.js`).
**Change:** confirm the moonlit exterior is bright enough that unlit monster
silhouettes read through the glass against the sky/yard, and the dark interior
doesn't wash them out. If needed, nudge the moon `DirectionalLight`/hemisphere
(`src/world.js:827-832`) intensity a hair — **do not** enable moon shadows.
**Behavior gotcha:** cutting LOS holes means enemies can now *see the player*
through windows too (AI uses `losClear`). Verify this doesn't make the house
trivially unsafe or spawn pop-in through glass; if the standoff margin
(`insideHouseM`, `src/mansion.js:908-909`) needs a tweak so they mass *outside*
windows rather than clip them, do it here (small, reversible).
**Acceptance:** `NIGHT_ENEMIES` gallery shows the Returned clearly gathered
outside, visible through multiple windows, no pathing glitch. **Perf:** neutral.

### T2.5 — Merge segmented walls
**File:** `src/mansion.js` wall build.
**Change:** apply T0.3 `mergeInto` to all plaster wall pieces (piers/sills/headers
+ solid segments) into one merged plaster mesh (+ one `plasterIn` mesh for
partitions). Colliders stay per-box (unchanged).
**Acceptance:** house exterior wall draw calls ≤ pre-change count despite the
holes. **Perf:** strictly ≤ baseline. **Verify:** `npm run perf` house scenario.

---

## 5. S1 — Signage & text

> Depends on T0.1 (font/centering/double-sided fixed there). These tasks fix
> *mounting* so boards sit on their supports.

### T1.1 — Remount the historical plaque on its post
**File:** `src/mansion.js:911-921`.
**Change:** either (a) give it **two posts** flanking the board (a proper roadside
plaque) with the board's bottom edge resting at post-top, or (b) keep one post but
lower the board so it substantially overlaps the post and add a small bracket/
frame so it clearly mounts. Set board center so `boardBottom == postTop` (with
T0.1's thin box the board has depth to attach). Recompute from `groundYAt`.
**Acceptance:** board visibly fixed to its support, no hover gap; readable both
sides. **Verify:** `plaque` shot. **Perf:** +1 post mesh max; merge with S7.

### T1.2 — Drop the kiosk sign onto the storefront
**File:** `src/mansion.js:948-953` (roof `931`).
**Change:** lower `kioskSign` from local `y=2.9` to sit as a **fascia/header board
across the counter opening** (roughly `y≈2.15`, just under the roof eave at 2.36),
mounted flat against the front, so it reads as shop signage rather than floating
above the roof. Reduce `h` if needed so it doesn't overlap the roof. Keep
`rotation.y=-π/2`.
**Acceptance:** sign sits on the stall, under the eave. **Verify:** `kiosk` shot.

### T1.3 — Seat the ferry schedule sign on its post
**File:** `src/world.js:1157-1168`.
**Change:** lower `sched` so its center aligns with the post's upper third and its
top no longer overshoots the post top (2.35); add a short cross-batten behind the
board or a second post so a 1.7 m board isn't held by one thin stick. Keep the
slight yaw.
**Acceptance:** board mounted, not top-heavy/floating. **Verify:** `ferry-sign`.

### T1.4 — Sign/label audit
**File:** search `src/` for `makeSign(`, canvas-text drawers, `.label` anchors.
**Change:** confirm no other sign floats; headstone engraving (`src/story.js:1281-1294`)
is already correct — leave it. Confirm all sign copy is English. Fix any stragglers
found with the same mounting rule.
**Acceptance:** grep-complete list, all seated & English. **Verify:** spot shots.

---

## 6. S4 — Cellar: full-height door & readable descent

> Self-contained but touches shared constants + several dependents. Do it as one
> connected sequence (T4.1→T4.5) since the numbers interlock.

### T4.1 — Deepen the room for real headroom
**File:** `src/world.js:69-75` (`CELLAR`), `src/mansion.js:785-806`.
**Change:** lower `CELLAR.floorY` from `0.0` to **`-0.4`** (dig the room ~0.4 m
deeper) so the room is ~2.35 m tall (floor −0.4 → ceiling ~1.95) and a normal door
fits under a proper lintel. Update the room wall `wallH`/positions and the floor
slab & ceiling y to the new floor. Keep the ceiling just below the house floor
(2.12).
**Acceptance:** room is stand-up height with a lintel above a full door.
**Dependents to update (in this task):** blood `pool` y (`src/mansion.js:810`),
`celBulb`/`celLight`/`stairLight` y (`854-862`). **Verify:** `cellar-room` shot.

### T4.2 — Full-height cellar door + a real doorframe
**File:** `src/mansion.js:849-852`.
**Change:** raise the cellar door `h` from `1.6` to **`~2.0`** (base at new
`floorY`), and add jambs + head casing + stone threshold around it exactly like
the house doors (`src/mansion.js:537-543`). Make the lintel (`796`) sit just above
the taller door.
**Acceptance:** the door is a normal, full-height door in a framed opening — not a
stunted hatch. **Verify:** `cellar-foot`, `cellar-room`.

### T4.3 — Reframe the areaway so it reads as stairs-to-a-door
**File:** `src/mansion.js:812-846` (areaway/steps), `864-880` (`stairY`, floorAt).
**Change:** the core weirdness is dropping into an open pit before the door.
Reframe so the descent reads as a stairwell leading down to a doorway in a wall:
- Recompute `stairY()` and the `nSteps` ramp for the new bottom `floorY=-0.4`
  (bottom step meets the threshold; keep tread depth natural).
- Face the areaway side walls with stone and add a **head-height stone surround /
  arched doorway at the foot** so the door sits in a wall, and (optionally) a
  slanted bulkhead/lip at grade so you enter a *stair down to a door*, not a bare
  hole. Keep it open-air (matches the current design) but framed.
- Keep the top kerb posts (`844-846`).
**Acceptance:** walking down reads as descending a stair to a cellar door; no
"half-buried door in a pit." **Verify:** `npm run play` descent (below) + shots.

### T4.4 — Fix all descent dependents
**File:** `src/mansion.js:864-905`, `src/main.js:65`.
**Change:** update `cellarFloorFor`, the `cellarLevel` thresholds (`ry<1.2 /
>1.7` in `floorAt` — rescale to the new ramp range), `roomColliders` y-bands if
any, the girl's spawn floor (`makeGirl` at `883`), anchors (`886-889`), and the
`serialize`/`restore` snap (`1260-1277`) so a saved cellar state still restores.
**Acceptance:** player rides the ramp smoothly to the new floor; the girl stands
on the floor; save/load in the cellar is stable. **Verify:** `npm run play` — add
a check that teleporting into the stair footprint and stepping decreases
`player.pos.y` to ≈ `floorY`, and `buildings...playerBelow` flips true.

### T4.5 — Cellar regression
**Change:** `npm run play` (movement/interaction), `npm run smoke`, cellar shots,
`npm run perf`.
**Acceptance:** no console errors, descent works, frame time within budget.

---

## 7. S5 — Boathouse structure & door

### T5.1 — Match the doorway gap to the door
**File:** `src/mansion.js:1101-1110` (west wall), `1163` (door).
**Change:** the west wall leaves a 1.8 m gap for a 1.1 m door. Either extend the
west wall southward so the opening is **~1.25 m** (door 1.1 + clearance), or widen
the door to fill the gap. Recommended: resize the wall (change the `[-bw/2, 0.9,
0.18, 5.2]` segment) so the opening equals door width + ~0.15 m; add a short wall
stub on the south side of the door if needed. Keep the north shore wall.
**Acceptance:** no permanent open slot beside the closed door. **Verify:**
`boathouse-door`.

### T5.2 — Add header/lintel + jambs over the door
**File:** `src/mansion.js` near `1163`.
**Change:** add a header box filling the gap above the door (door top 3.06 → wall
top 3.6) and side jamb(s), matching the house-door frame treatment, so you can't
see through above/beside the leaf. Use `mat.plankDark`/`mat.woodDark`.
**Acceptance:** framed opening, no see-through gaps. **Verify:** `boathouse-door`.

### T5.3 — Verify swing/hinge & collider alignment
**File:** `src/mansion.js:1163`, `makeDoor` `247-275`.
**Change:** confirm `axis:'z', swing:-1` hinges on the correct (north) side and
swings clear of the wall/slip without clipping; flip `swing` or hinge end if it
opens into geometry. Confirm the door collider (`263`) lines up with the resized
opening and that `collider.enabled` toggling reads right.
**Acceptance:** door opens smoothly the sensible way, collider matches. **Verify:**
`npm run play` open/close (the boathouse door interaction is `src/story.js:1039-1056`).

### T5.4 — Merge boathouse statics
**File:** `src/mansion.js:1096-1202`.
**Change:** apply T0.3 to the boathouse's static plank/roof/walkway meshes by
material. Leave the door (animated) and props separate.
**Acceptance:** fewer draw calls, identical look. **Verify:** `npm run perf`
boathouse scenario ≤ baseline.

---

## 8. S6 — The boat rebuild

> Replace the box+pyramid with a believable weathered wooden skiff. Keep it a
> small number of merged meshes.

### T6.1 — New hull (tapered, hollow, pointed bow, transom stern)
**File:** `src/mansion.js:1138-1152`.
**Change:** remove the `box` hull + 4-sided `ConeGeometry` prow. Build a proper
hull that a player can see *into*:
- Bottom: a tapered plank (wider amidships, narrowing toward bow/stern).
- Two side planks (strakes) angled outward from the keel, **converging to a point
  at the bow** and meeting a small flat **transom** at the stern — no pyramid.
- Recommended construction (perf-safe, no new deps): a hand-built
  `BufferGeometry` for the hull shell, **or** `ExtrudeGeometry`/`LatheGeometry` of
  a hull cross-section, **or** a few shaped boxes/planks rotated to form the V and
  taper. Whichever is chosen, the interior must be open (hollow) so the floor and
  thwarts are visible.
- Material: warm weathered wood via `planksTex()` on a `MeshStandard` (share with
  a new `mat.boat` or reuse `mat.plank`). Optional painted waterline stripe.
**Acceptance:** silhouette reads unmistakably as a rowboat/skiff from all angles;
no grey crate, no pyramid nose. **Verify:** `boat-detail`.

### T6.2 — Interior detailing
**File:** same block.
**Change:** add a floorboard/rib set across the hull bottom, **two thwart seats**
at realistic height spanning the beam, gunwale rails along both tops, and
oarlocks on the gunwales matching the two oars already leaning on the north wall
(`src/mansion.js:1183-1191`). Keep it low-poly.
**Acceptance:** interior looks like a real boat you could sit in. **Verify:**
`boat-detail` top-down-ish angle.

### T6.3 — Outboard vs rowboat decision + material
**File:** same block (`1148-1149`).
**Change:** the current "outboard" (box + cylinder) is crude. Either (a) reshape
it into a small motor (cowling + shaft + skeg/prop) if a motor is wanted, or (b)
drop it and commit to a rowboat consistent with the wall oars/oarlocks. Given the
oars on the wall, **rowboat is the cleaner read** — recommend removing the box
motor and keeping the tiller-less skiff, or a tiny neat outboard if the story
needs an engine. Confirm with story intent (boat is the finale escape, chained
until `hasBoatKey`, `src/story.js:1150-1168`).
**Acceptance:** the propulsion reads intentionally, not like a stray box.

### T6.4 — Seat the boat at the waterline (+ optional bob)
**File:** `src/mansion.js:1150`.
**Change:** raise `boat.position.y` so the hull floats at the slip waterline
(bottom just below slip water y=0.35, gunwale above) instead of half-submerged.
Optional: a cheap `Math.sin(t)` bob/roll in the buildings `update()`
(`src/mansion.js:1236-1257`) — tiny amplitude, no physics.
**Acceptance:** boat sits on the water naturally; if bobbing, it's subtle and
cheap. **Verify:** `boathouse-slip`.

### T6.5 — Merge boat statics; keep chain attachment
**File:** `src/mansion.js:1138-1221`.
**Change:** merge the hull/seat/rail geometry by material into ≤3 meshes. Ensure
the stern point the chain attaches to (`chain` link endpoints, `1216-1219`) still
lands on the new transom; adjust link coords if the stern moved. `boatChain.hide()`
for the finale must still work.
**Acceptance:** chain still runs stern→cleat and hides at finale; few draw calls.
**Verify:** `boathouse-slip`, and story finale smoke if available.

---

## 9. S3 — House interior detailing

> Lower priority than windows but addresses "some parts of interior are very
> basic." Depends on T0.3 (merge); window reveals depend on T2.1.

### T3.1 — Trim & moldings
**File:** `src/mansion.js:553-770` (rooms).
**Change:** add thin **baseboards** along the base of interior walls, simple
**crown/ceiling trim**, and **door casings** on interior doorways (reuse the house
door-frame recipe). All shared-material thin boxes, merged (T3.4).
**Acceptance:** rooms read finished, not like bare plaster boxes. **Verify:**
`house-corridor`-style interior shots.

### T3.2 — Window reveals & interior sills
**File:** `src/mansion.js` interior + the cut openings from T2.1.
**Change:** add interior reveals (the thickness faces of the cut hole) and a wood
sill inside each window so the new openings read properly from within. Merge.
**Acceptance:** windows look built-in from inside. **Verify:** `house-front-in`.

### T3.3 — Upgrade the "very basic" spots
**File:** `src/mansion.js` per room.
**Change:** targeted richness where it's flattest: a real **reflective-ish mirror**
in the bedroom (currently a flat plane `src/mansion.js` bedroom block — use an
envmap-ish or at least a darker glass + frame), a fuller **fireplace** (mantel
detail, hearth stones, ash), corridor **wainscoting**, a few **wall hooks/pictures
and a rug or two** where rooms are empty. Reuse `spawn()` GLB props where they fit
(`src/assets.js`). Keep it atmospheric and sparse — horror, not clutter.
**Acceptance:** the flattest rooms gain depth without perf cost. **Verify:** room
shots, `npm run perf`.

### T3.4 — Merge interior trim
**File:** `src/mansion.js`.
**Change:** apply T0.3 to all the new static trim by material.
**Acceptance:** interior draw calls near pre-change. **Verify:** `npm run perf`.

---

## 10. S7 — Performance integration & regression (closeout)

### T7.1 — Merge sweep + shadow-flag audit
- Apply `mergeInto` (T0.3) to any building statics not already merged by their
  stream (kiosk, shed already "more or less okay" — light touch; greenhouse
  glass; dock area if cheap).
- Set `castShadow=false` on small interior detail and anything that can't intersect
  the 23 m flashlight cone; keep `receiveShadow` on lit surfaces.
- Do **not** add shadow lights; do **not** copy the enemy `despawn` pattern (it
  leaks GPU — `src/enemies.js:1663-1668`); if any building spawns/disposes, call
  `dispose()`.

### T7.2 — Frame-time gate
- `npm run perf`; require **no frames > 40 ms** across all scenarios (house,
  boathouse, greenhouse, walk). Compare worst-3 to `PERF_BASELINE.json`.

### T7.3 — Functional regression
- `npm run play` (movement, doors, flashlight, interactions) and `npm run smoke`
  (screenshots) pass with no `pageerror`/console errors.

### T7.4 — Final before/after gallery
- `npm run buildshots` for the full `_screenshots/buildings/` set incl.
  `NIGHT_ENEMIES`; eyeball against this plan's acceptance criteria.

---

## 11. Dependency graph & ordering

```
S0.T0.1 ─────────────► S1 (T1.1..T1.4)
S0.T0.2 ─┐
S0.T0.3 ─┼──────────► S2 (T2.1→T2.2→T2.3→T2.4→T2.5)
         └──────────► S3 (needs T2.1 for reveals; T0.3 for merge)
S4 (T4.1→T4.2→T4.3→T4.4→T4.5)   ── independent
S5 (T5.1→T5.2→T5.3→T5.4)        ── independent (T0.2 optional)
S6 (T6.1→T6.2→T6.3→T6.4→T6.5)   ── independent
                    all ──────► S7 (T7.1→T7.4)
```

**Suggested sequential branch order** (honors one-task-per-branch): T0.1 → T0.2 →
T0.3 → T0.4 → **S2** (windows: the marquee feature) → **S6** (boat) → **S5**
(boathouse door) → **S4** (cellar) → **S1** (signs) → **S3** (interior) → **S7**
(perf closeout). Reorder S1/S3/S4/S5/S6 freely; keep S0 first and S7 last.

---

## 12. Risks & rollback

| Risk | Mitigation |
|------|-----------|
| Cut windows let enemies see/path through the house (LOS change) | T2.4 verifies; tune `insideHouseM` standoff; sill/header panels `blocksSight:false` only, piers block sight |
| Cellar floor change breaks descent/save | T4.4 updates every dependent + save/restore; `npm run play` gate in T4.5 |
| Transparent panes add overdraw | cap window count, `depthWrite:false`, non-overlapping; perf gate T7.2 |
| Wall segmentation balloons draw calls | mandatory merge (T2.5); perf gate |
| Boat hull geometry gets heavy | keep low-poly, merge (T6.5); perf gate |
| Merging hides a needed dynamic object | only merge **static** same-material meshes; leave doors/props/lights separate |

Each task is one branch → rollback = discard the branch. No task modifies another
stream's files beyond the shared `mat` dict and helpers added in S0.

---

## 13. Definition of done

- Every sign: uniform ~0.05 m text, vertically centered, readable both sides,
  mounted on its support (no floating boards). English only.
- House: real window openings on all four approaches with transparent glazing;
  the Returned are clearly visible massing outside through the glass at night,
  from inside and outside.
- Interior: trimmed, window reveals, upgraded flat spots — atmospheric, not empty.
- Cellar: full-height door in a framed opening; descent reads as a stair down to a
  door, not a drop into a pit; save/load stable.
- Boathouse: door opening matches the door, framed with header/jambs, swings
  correctly; no see-through gaps.
- Boat: a believable weathered wooden skiff sitting on the water; chain/finale
  intact.
- `npm run perf` green (no frame > 40 ms); `npm run play` + `npm run smoke` pass;
  `_screenshots/buildings/` before/after gallery captured.
```
