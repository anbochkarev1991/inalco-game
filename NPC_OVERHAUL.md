# INALCO — NPC Overhaul Plan (v2: max fidelity, zero perf cost, atomic agents)

**Goal:** push every character to the very limit of what the procedural pipeline can do — so they read as real people (and one real drowned child), not blobs — **without moving the steady-state performance needle at all**, and with the work split into the smallest, most focused sub-agent units that a clean result allows.

**Approach (approved):** *deepen the existing procedural SDF / marching-cubes pipeline.* No engine rewrite, no imported rigged humans. Every integration stays: dialog, face-mimic, head-tracking, barks, flash/dissolve, seated/kneeling poses, offline runtime, warm-up-before-first-draw.

**Three governing directives (from the user):**
1. **Deepen as far as possible** — max out this approach.
2. **Zero performance impact** — see the Performance Doctrine (§2A). This is a *hard* constraint, not a budget to spend.
3. **Atomic sub-agents** — the smallest coherent mandate per agent, each independently verifiable (§3).

---

## 1. Grounded diagnosis (from current renders)

Reference shots this session (`_screenshots/` + scratchpad): `n1-campfire`, `n2-dialog` (Rufino), `n3-mara`, `n4-eliseo`, `girl-new`, `girl-new-2`.

| NPC | Looks like now | Root causes |
|---|---|---|
| **Rufino** | Smooth rust poncho *blob* + two bulges at the lower front ("giant balls"); campfire stones/logs blow pure white. | Poncho+skin one over-smoothed mass; folds (r≈0.024) melt in Taubin; lap-hem/knees dome past the hem; wool weave never reads (UV scale/brightness); fire light + torch overexpose low-rough stone/wood. |
| **Cellar girl** | Smooth white *bowling pin*; blooms pure white under the torch. | **Skin and "dress" share one flesh material — no actual clothing**; lit `MeshStandard` skin blows white at point-blank 115-torch; head scaled 0.85 → tiny; body cone over-smoothed to a vase; neck long *and* featureless; hair = a few cylinders. |
| **Mara** | Featureless dark charcoal huddle; one visible eye. | Body+jacket one smooth mass; herringbone maps don't read; head too deep in hood; face unlit. |
| **Eliseo** | Smooth olive *traffic-cone* + hat. | Coat one smooth A-line cone; folds/placket/belt melt; arms baked out of sight; boots hidden; weave doesn't read. |

**Common cause:** over-smoothed SDF masses, clothing not separated from skin, texture UVs too coarse to read, lit surfaces bloom under the torch. **All four are fixable within the approach** — the fix is *detail density*, and detail density is exactly what we can add for free in texture space.

---

## 2. Design doctrine

### 2A. Performance Doctrine — "detail is free only in texture space"

The steady-state cost of an NPC is driven by **resident triangles**, **draw calls**, **shadow-caster tris**, and **shader/fill cost** — *not* by how detailed the albedo/normal/roughness/AO maps are. Runtime baseline today: ~8.3 ms/frame, ~102 draw calls, ~0.93 M tris, DPR ≤ 1.25, living NPCs ~174 K tris. **These numbers may not regress.**

Therefore the whole overhaul is built on this hierarchy — spend the top freely, never touch the bottom:

- **FREE at runtime (spend lavishly):**
  - **Normal maps** — carry weave, wrinkles, pores, wood grain, wet ripples. Generate at load from canvas height fields. *This is where 80 % of the new realism comes from.*
  - **Roughness maps** — damp patches, worn sheen, dry vs wet cloth; the single biggest weapon against the flashlight blow-out.
  - **Albedo (map) detail** — dye variation, dirt, waterline stains, stubble, blush; painted on canvas.
  - **Baked ambient occlusion** — into a canvas **AO map** and/or **vertex colours** at load. NPC bodies are baked/static, so AO is a one-time cost and a massive realism gain (contact shadows in fold valleys, under the chin, in the hood). Zero runtime cost.
  - **Vertex-colour tinting** — grime gradients, rim darkening, sunburn — computed once at build.
- **NEUTRAL (must stay flat — offset any addition):**
  - **Triangles.** A new garment *shell* adds tris → **remove the geometry it hides** (torso under the poncho/coat, body under the dress) and/or drop that body part's marching-cubes `res` so the *net* is flat. Model only what the camera can see.
  - **Draw calls.** A few more meshes per NPC is acceptable *only* if total draw calls stay ≈ baseline; merge static sub-meshes that share a material (`BufferGeometryUtils.mergeGeometries`) where it helps.
  - **Shadow casters.** One lean shadow-casting mesh per NPC; strands/cards/fringe/props `castShadow=false` (proven pattern).
- **ACCEPTABLE to grow:** **load time** (all builds are behind the `PREPARING…` title) and **texture memory** (not the bottleneck at DPR 1.25). Warm-up compiles every new material before first draw.

**Concrete gates (measured, not asserted):**
- `scripts/perf.mjs` after ≈ before: steady frame time within noise (~8.3 ms), **no new frames > 40 ms**.
- Resident triangle count and draw-call count for the NPC set **≤ today's baseline** (capture both before Phase 1 and after Phase 2; report the delta).
- Load stays behind the title (swiftshader dev ≲ 4 s acceptable; real-GPU load unaffected materially).

### 2B. Look rules (paid for over 17 rounds — do not relearn)
1. **Flashlight blow-out rule.** Torch = `SpotLight` intensity **115**, decay **2**; point-blank it blows any lit `MeshStandard`/`Lambert` to white.
   - Must-stay-dark surfaces (girl's dress & hair, dark hair caps) → **`MeshBasicMaterial`** near-black, *or* very-dark `MeshStandard` with a **dark albedo map** that dominates.
   - Lit skin/cloth → **dark albedo map + roughnessMap**, base `roughness` 0.85–1.0 (multiplies the map), dark base colour. Never a bright flat base with normal+rough only.
2. **Separate clothing from skin** — distinct meshes, distinct materials, never a shared colour.
3. **Folds survive smoothing** — model folds as large-radius ridges (r ≥ 0.045) *and* carved `smax` valleys between broad panels; fewer Taubin iterations on garment shells. A fold must be a real dip, not a hairline.
4. **Texture scale must read** — set map `.repeat` / UV `uRep,vRep` so weave tiles ~2–4 cm at 3 m. Verify **in the beam**, not ambient.
5. **Proportions & neck** — heads not dwarfed; a real neck to the collar; silhouette reads as a person at 3–5 m in the beam.

### 2C. Integration invariants (freeze these)
- **APIs:** `buildNPCs(scene,colliders)` → `{list, campfire, wireTree, byId, update, driveFaces, reactBarks}`; each rig → `{group, head, …}` with `head.userData.setFace(state)` + `blinkOff`; `mara.relocate(x,z,yaw)`; `buildCellarGirl()` → `{group, head, mats}`; `makeGirl` controller (`flash, update, reset, dead, active, pos, mode, startAttack, cry, capacity`); `preloadNpcTextures()`, `npcTextures()`.
- **Bodies baked; only `group`+`head` animate.** New garment/hair/AO detail is static. Keep the 4 expression variants + `setFace` + `blinkOff`.
- **All NPC materials built at load (before `warmUpRenderer`)** — never lazily at runtime.
- **New image textures** → add to `scripts/fetch-assets.mjs`, load in `preloadNpcTextures()`, await before build. **Strongly prefer canvas-generated maps** (no download; this is the existing pattern and keeps us offline). This overhaul requires **no** new downloads.
- **`monstermesh.js` edits additive only** — `enemies.js`/monster output must stay byte-identical (`npm run monstershots` diff).
- **English only.**

---

## 3. Atomic sub-agent plan & dependency graph

Not a git repo → no worktrees → **parallel agents must own disjoint files.** We get atomicity *and* safe parallelism by giving each foundation concern **its own new module file**, so `shared.js` becomes a thin barrel. Each unit below is one sub-agent with one deliverable and its own verification.

```
LAYER 0 — Foundation
  F0  Module refactor            owns: npcs.js (→ src/npc/* barrel)        [behaviour-neutral]  ─┐ parallel
  F1  Pipeline additions         owns: monstermesh.js (additive)                                ─┘
        └─ garment-shell path, parameterized taubin, AO-bake, normal-from-heightfield
  F2  Texture generators         owns: src/npc/textures.js (NEW)      depends: F0
        └─ canvas weaves, drowned-flesh, skin-detail, hair, wood/steel, +normal/AO bakers
  F3  Material library           owns: src/npc/materials.js (NEW)     depends: F1,F2
        └─ clothMat v2, skinMat v2, drownedSkinMat, garment/steel/wood mats, anti-bloom
  F4  Face + hair pipeline       owns: src/npc/face.js (NEW)          depends: F2,F3   ─┐ parallel
  F5  Hands, hats, props         owns: src/npc/parts.js (NEW)         depends: F3      ─┘
  F6  Barrel + preload wiring    owns: src/npc/shared.js (NEW)        depends: F2..F5  [tiny, glue]

LAYER 1 — Per-NPC rebuilds (ALL PARALLEL, each owns one character file)   depends: F0,F3,F4,F5,F6
  N1  Rufino   owns: src/npc/rufino.js
  N2  Mara     owns: src/npc/mara.js
  N3  Eliseo   owns: src/npc/eliseo.js
  N4  Girl     owns: src/npc/girl.js  +  makeGirl controller block in mansion.js  (girl-exclusive)

LAYER 2 — Integration & proof (sequential/parallel as noted)              depends: N1..N4
  I1  Scene, placement & lighting  owns: npcs.js orchestrator + postfx.js (fire tuning)
  I2  Verification harness         owns: scripts/npcshot.mjs + package.json   (parallel to I1)
  I3  Test / perf / memory         read-only + memory                          (after I1,I2)
```

Within-layer file ownership never overlaps, so every layer's units run in parallel except where a `depends:` arrow forces order. Foundation is the only serial stretch (F0∥F1 → F2 → F3 → F4∥F5 → F6); it is the quality-critical base, so it goes first and is gated hard.

**Atomicity rule for every agent:** one file (or one character), one written spec, one self-contained verification (render its own before/after and, where relevant, run `play.mjs`). No agent "also fixes" something outside its mandate — it files a note instead.

---

## 4. LAYER 0 — Foundation (atomic units)

### F0 · Module refactor — `npcs.js` → `src/npc/*` (behaviour-neutral)
Move `buildRufino/Mara/Eliseo`, `buildCellarGirl`, and every helper into `src/npc/` files (created empty/stub here; filled by later units). `npcs.js` stays the **barrel + orchestrator**: `buildNPCs`, `BARKS`, all scene/placement code, and **re-exports** `buildCellarGirl`, `preloadNpcTextures`, `npcTextures` so `main.js` & `mansion.js` imports are unchanged. **Gate:** `play.mjs` green (`errors:[]`); `npcshot` NPCs visually identical to baseline.

### F1 · Pipeline additions — `monstermesh.js` (additive only)
- `sculptShell(build, mat, opts)` (or `shell:true`) — cloth-tuned SDF→MC: 1–2 Taubin iters, optional thin wall / `DoubleSide`.
- `taubinSmooth(geo, iters, {lambda, mu})` — expose params (defaults unchanged).
- `bakeAO(geo, {samples, radius})` — vertex-colour AO by hemispherical ray/normal occlusion against the mesh's own prims (cheap approximation ok); returns geo with `color` attribute. One-time.
- `heightToNormalTex(canvasFn, size, strength)` — build a tangent-space normal map from a grayscale canvas. The workhorse for weave/wrinkle/pore/grain.
- **Gate:** `monstershots` byte-identical; a throwaway shot exercises each new helper.

### F2 · Texture generators — `src/npc/textures.js` (NEW; canvas, cached)
All procedural maps (albedo + matching **normal** via F1 + optional **AO/rough**), each a cached module singleton:
- **Cloth:** `ponchoWeave` (Andean boucle + stripe band), `herringboneTwill` (coats/jacket), `wetLinen`/`nightgownLinen` (girl's shift, with waterline stain + damp sheen rough map).
- **Skin:** `livingSkin` (pores, fine wrinkle, subtle blush — normal+rough), `drownedFlesh` (waterlogged pallor, bruise mottle, veins, waterline — dark albedo + normal + rough; mirror `enemies.fleshTex` intent).
- **Hair:** `hairStrandAlpha` (clump card w/ alpha + strand normal), beard variant.
- **Props/scene:** `wornWood` (spade shaft, logs, stakes), `mattedSteel` (spade blade, wire, mate rim — must not chrome), `campStone` (dark, rough — for the blow-out fix).
- **Gate:** a swatch sheet render shows each map tiling correctly + its normal responding to a moving light.

### F3 · Material library — `src/npc/materials.js` (NEW)
- `clothMat({tex, color, repeat, roughMap, normalScale})` — sets `.repeat` on all maps; dark base; `roughness` 0.9–1.0.
- `skinMat` v2 — living skin map+normal+rough, tuned so mid-distance doesn't bloom.
- `drownedSkinMat` — dark flesh map+normal+rough, dark base ≈0x3f4038, `roughness` 0.9, `emissive` white @0 for flash-burn.
- `garmentDarkMat` — the girl's dress: `MeshBasic` near-black *or* very-dark `MeshStandard`+dark map (anti-bloom, chosen by point-blank test).
- `steelMat`, `woodMat` — matte, roughness-mapped (no chrome).
- **Gate:** point-blank torch test — drowned skin stays flesh; dress/dark surfaces stay dark; steel doesn't chrome.

### F4 · Face + hair pipeline — `src/npc/face.js` (NEW)
- `makeHead` v2 — larger skull, stronger `headGeo` sculpt (nose/brow/cheek/jaw/ears), real neck to collar, **AO baked** (eye sockets, under nose/jaw), **512px** `faceTex`.
- `faceTex` v2 — crisp eyes (cornea, catchlight, lower lid, iris depth, lashes), stronger brows, age-scaled wrinkle field, **paint→normal** micro-relief; **drowned variant** (pallor, blue-grey lips, sunken dark sockets, wet sheen). Keep the 4 expression variants + `setFace` + `blinkOff` contract.
- `makeHair({style})` — layered overlapping clump cards (alpha + strand normal), styles: `scalp`, `beardFull`, `stubble`, `wetCurtain`; near-black unlit where it must stay dark.
- **Gate:** a face reads eyes/nose/mouth at 4 m in the beam; drowned face reads as a drowned child; hair reads as hair, not spikes; point-blank hair stays dark.

### F5 · Hands, hats, props — `src/npc/parts.js` (NEW)
- `makeHand` v2 — sculpted separated fingers + thumb (or a convincing glove-hand), skin material, AO in the finger clefts.
- `makeHat` v2 — felt & straw variants: sweat-band, brim warp, weave/straw normal.
- Props: `makeMate` (flattened gourd cup, steel rim, angled bombilla), `makeSpade` (worn shaft, D-grip, matte steel blade), `makeHeadlamp` (Mara, off).
- **Gate:** each part renders correctly in isolation at 3 m in the beam.

### F6 · Barrel + preload wiring — `src/npc/shared.js` (NEW)
Thin re-export of F2–F5 + `preloadNpcTextures`/`npcTextures`/`flameTex`. Confirm `main.js` awaits `preloadNpcTextures` before build; add any new image loads (expected: none). **Gate:** `play.mjs` green.

---

## 5. LAYER 1 — Per-NPC rebuilds (4 parallel atomic agents)

Each: rewrite **only** its character file, same return shape, use Layer-0 helpers, obey §2A (offset any tri increase by deleting hidden body geometry / lowering covered-part `res`), render its own before/after (ambient + flashlit + **point-blank**), and — for the girl — drive flash/dissolve.

### N1 · Rufino — `src/npc/rufino.js`
- **Kill the "balls":** rebuild seated legs so knees tuck (not dome forward past the hem); buttocks on the log; boots peek at the hem.
- **Poncho = separate wool shell** (F1 shell path): shoulders→lap, **straight fringed hem** across both knees, deep vertical folds (ridge prims + carved valleys), neck slit, an Andean **stripe band**. Material: `ponchoWeave` × dark rust, roughMap, `.repeat` tuned; **normal-mapped weave** + **baked AO** in the fold valleys. Delete the torso geometry the poncho hides (tri offset).
- **Head/face:** `makeHead` v2 weathered (age~0.7) + `beardFull` grey stubble; felt hat v2, tipped.
- **Hands + mate:** `makeHand` v2 (one on the gourd, one resting) + `makeMate`.
- **Preserve** breathing / sip-bow / warm-lean / water-glance (act on `group`+`head`). Return `{group, head, mate}`.
- **Accept:** old man in a woven poncho at 3 m; no protruding balls; weave + fold AO read; face readable in dialog framing; tris ≤ baseline.

### N2 · Mara — `src/npc/mara.js`
- **Structure:** separate the **field-jacket shell** so hood, shoulders, wrapped arms, and **two distinct knees** (cleft between) + shins/feet read.
- **Jacket:** `herringboneTwill` × dark teal, `.repeat` tuned, normal + rough + **baked AO** (hood cavity, arm folds); front **zip/placket**, turned collar, hood opening framing the face, sleeve cuffs over the shins.
- **Face/head:** raise the head so **both** eyes+nose read; alive warm tone, tired (dark under-eyes) via `faceTex` v2; temple hair; brow **headlamp** prop (off).
- **Hands:** `makeHand` v2 clasped over the shins.
- **Preserve** head-lift-on-approach, brittle sway, shoulder-check. Keep `list` entry + `relocate` (Phase 2 owns placement). Return `{group, head}`.
- **Accept:** frightened woman in a hooded jacket hugging her knees; face readable; weave + AO read; tris ≤ baseline.

### N3 · Eliseo — `src/npc/eliseo.js`
- **Structure:** a coat that reads as a coat — open front **placket + buttons**, **belt** cinch at the waist, turned-up **collar**, deep vertical folds, hem breaking over **visible boots**; arms forward on the spade so they read front & ¾.
- **Coat shell:** `herringboneTwill` × dark olive, `.repeat` tuned, normal + rough + **baked AO** (plackets, belt shadow, fold valleys). Delete hidden torso geometry.
- **Face/head:** very old (age~0.95), deep wrinkle field, full **white beard** (`beardFull`), ears, neck; straw hat v2, bowed.
- **Hands + spade:** two `makeHand` v2 stacked on the shaft; `makeSpade` (matte steel blade).
- **Preserve** working rock, head-track near, glance up at the tree. Return `{group, head}`.
- **Accept:** stooped old man in a work coat on a spade; arms/boots/beard visible; weave + AO read; tris ≤ baseline.

### N4 · Cellar girl — `src/npc/girl.js` + `makeGirl` in `mansion.js`
- **Proportions:** drop the 0.85 head scale → child-proportioned; the long neck stays (the scare) but rebuilt as a *real* neck (nape/throat) so it reads **wrong**, not bottle-shaped.
- **Dress = NEW separate garment** (she has none today): period **nightgown/shift** shell + `garmentDarkMat` (**anti-bloom**) — collar, short sleeves, **soaked clinging hem** pooling on the floor, folds, waterline stain via `wetLinen` map + damp roughMap; normal-mapped cloth; baked AO in the folds.
- **Skin:** `drownedSkinMat` on face/neck/hands (torch reads wet flesh, not a lamp). Keep the **unlit `MeshBasic` black eye-voids**.
- **Face:** `faceTex` drowned variant — waterlogged pallor, blue-grey lips, hollow sockets, wet sheen; keep `setFace` hook (idle only).
- **Hair:** `makeHair('wetCurtain')` — flat dark clumps framing the face + hanging past the shoulders, unlit near-black, dripping tips.
- **Controller (`makeGirl`, `mansion.js`):** keep all behaviour; extend the `mats` set so **dress + hair + skin** all take the flash-burn (guard `if(m.emissive)`) and the dissolve fade (`transparent/opacity` on the unlit ones too). Verify flash→burn, 5 flashes→dissolve→gone.
- **Preserve** `buildCellarGirl()` → `{group, head, mats}`; controller API. 
- **Accept:** from the doorway (~3 m) an unmistakable **kneeling drowned girl in a wet nightgown**, hollow eyes, wrong-long neck; point-blank the dress/hair/eyes stay dark (bare skin may bloom — acceptable); flash/dissolve verified; tris ≤ baseline.

---

## 6. LAYER 2 — Integration & proof

### I1 · Scene, placement & lighting — `npcs.js` orchestrator + `postfx.js`
- Drop in the new builds; tune each `group` position/rotation/scale/ground-anchor; **rotate Rufino ¾ to the approach** so his face reads while he stays by the fire.
- **Campfire blow-out fix:** lower `fireLight` intensity / raise decay so stones/logs stop overexposing; swap ring stones + seat logs to `campStone`/`woodMat` (dark, rough, normal-mapped); tone the additive flame sprite opacity.
- Greenhouse (Mara) & arrayán (Eliseo): ensure faces catch enough light to read at dialog distance without blooming; tune the tree-lantern glow. Cellar (girl): confirm the guttering bulb + stair spill light her; verify anti-bloom holds.
- **Gate:** all three scenes read; nothing over/under-exposed.

### I2 · Verification harness — `scripts/npcshot.mjs` + `package.json` (parallel to I1)
- Reframe to shoot each NPC **from the front at ~3 m**; add **flashlit** and **point-blank** variants per NPC; write all to `_screenshots/`. Add npm script `npcshots` (npm scripts are allowlisted). 
- **Gate:** produces the full before/after set for the user.

### I3 · Test / perf / memory (after I1, I2)
- `play.mjs` green (`errors:[]`); `perf.mjs` — steady frame time within noise, no frames > 40 ms; capture NPC **tri + draw-call delta vs baseline** and confirm ≤ 0.
- Append a Round-19 note to `niebla-game.md` (overhaul summary + new gotchas: shell path, AO bake, texture-space doctrine).

---

## 7. Verification (every character, every time)

Judge on **three** renders — ambient flatters, the beam is the truth, point-blank always blooms bare skin:
1. **Ambient/flood** — silhouette & proportion.
2. **Flashlit ~3 m** — the real in-game look; weave, folds, AO, face must read here.
3. **Point-blank flashlit** — must-stay-dark surfaces (girl dress/hair/eyes, dark hair) do **not** blow white.

Headless recipe: dev on `:5173`; click only after title = `CLICK TO BEGIN`; `?skipintro&calm`; settle-poll `camera.y`; relocate the NPC group in front of the camera (camera forward is `−sin/−cos`); aim pitch at the `Box3` centre. Chrome `/Applications/Google Chrome.app/...`, `--enable-unsafe-swiftshader`. Ship-gate per layer: `play.mjs` `errors:[]`.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Perf regresses (tris/draw calls). | §2A doctrine: detail in texture-space; delete hidden body geometry under garments; drop covered-part `res`; merge same-material sub-meshes; measure before/after with `perf.mjs`, gate on ≤ baseline. |
| Module refactor breaks imports. | F0 barrel re-exports old symbols; `play.mjs` gate before Layer 1. |
| Parallel agents clobber a file. | Strict one-file-per-agent ownership (§3); Foundation freezes shared modules before Layer 1; only the Girl agent touches `mansion.js`. |
| New material recompiles at first sight → freeze. | All NPC materials built at load, before `warmUpRenderer`. |
| Girl still reads as a lamp. | Dress + hair unlit near-black; skin uses drowned flesh **map**; explicit point-blank gate. |
| Monster output drifts. | `monstermesh.js` additive only; `monstershots` diff identical. |
| AO bake too slow at load. | Cheap approximation, one-time, behind the title; cap samples; cache per-geometry. |

---

## 9. Dispatch order

1. **F0 ∥ F1** → **F2** → **F3** → **F4 ∥ F5** → **F6.** Gate: `play.mjs` green, `monstershots` identical, swatch/face/part shots pass.
2. **N1 ∥ N2 ∥ N3 ∥ N4** (parallel). Gate: each character's 3 verification shots + girl flash/dissolve.
3. **I1 ∥ I2** → **I3.** Gate: scenes read; `play.mjs` green; `perf.mjs` tri/draw-call/frame-time delta ≤ 0; before/after shot set delivered; memory updated.
