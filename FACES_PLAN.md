# FACES_PLAN — human-looking heads for Mara, Rufino & Eliseo

## STATUS (2026-07-19)
Done: **Phase 0** (portrait + neutral model-viewer harness), **Phase 1** (oval
skull + occiput + jaw/chin, no more ball), **Phase 2** (mouth setback + repainted
cupid's-bow lips → duck bill gone; nose is a separate feature), **Phase 3**
(eyes shrunk, de-dolled), **Phase 4** (per-character skin: `ruddy` weathering +
broken capillaries + age spots, diffuse cheek flush instead of doll circles),
**Phase 5** (per-character shapes → three distinct people). Hats/hood/headlamp/
hair all re-fitted and verified in-game (Phase 6 partial). Key learning: strong
feature RELIEF (a big nose/chin, `front` instead of `front²`) reads as a
*snout/monster* — the doll→human win is PROPORTIONS + the repainted mouth, with
only gentle, localized relief.

**Profile polish (done):** the muzzle persisted because the `headGeo` feature
bumps were centred ~0.3 too LOW in v.y — the "chin" sat under the jaw and the
mouth-setback missed the lips. `faceTex` paints onto the sphere UVs at
**eyes ≈ v.y +0.19, nose tip +0.03, mouth −0.09, chin −0.28** (CanvasTexture
flipY: canvas-top → sphere +Y pole). Re-centring the geo bumps to those
latitudes fixed the profile (nose forward, mouth set back, chin forward) AND
tightened the front. Also smoothed the hairline (no squared temple notch).

Remaining/optional: a point-blank torch-bloom pass (pre-existing, not
face-specific — faces overexpose only when the camera is right on top of them).

### How to iterate (harness)
- `npm run dev` then `BASE_URL=http://localhost:<port> node scripts/faceview.mjs`
  → neutral studio shots of the three BARE heads (`_screenshots/faces/<PREFIX>-{front,34,profile}.png`).
  Page is `faceview.html` (`?studio=1` for top light, `?beard=1` to show beards).
- `... node scripts/faceshots.mjs` → the real in-game look (front/34/profile per NPC).
- Per-character skull dials live in each `src/npc/<id>.js` `makeHead({ shape: … })`
  call; the shared builder is `src/npc/face.js` (`headGeo` / `faceTex` / `makeHair`).

---


Goal (user's words): the three survivor NPCs currently read as *"two round faces
with duck-like mouths… too unnatural even for our game."* Make them look like
**real human faces — simple, but not like (cheap) dolls.** Keep the game's
stylized, low-poly, torch-lit art direction; do **not** chase photoreal.

Name mapping (so we're aligned):

| User said | In code            | File                | Notes                          |
|-----------|--------------------|---------------------|--------------------------------|
| Mara      | `mara` / MARA VIDAL| `src/npc/mara.js`   | younger woman, tired, `age 0.25` |
| Ruffalo   | `rufino` / RUFINO  | `src/npc/rufino.js` | weathered fisherman, full beard, `age 0.72` |
| Enezea    | `eliseo` / DON ELISEO | `src/npc/eliseo.js` | very old, gaunt, `age 0.95`  |

## The one insight that makes this cheap to do

All three heads are built by the **same shared function**, `makeHead()` in
`src/npc/face.js`, which composes three sub-pieces:

- **`headGeo(r)`** — the skull geometry (a displaced `SphereGeometry`).
- **`faceTex(opts)`** — a **painted 512² canvas** for eyes/nose/mouth/brows,
  mapped onto the front (+z) hemisphere.
- **`makeHair()`** — clump-card hair/beard.

So **fix `makeHead` once and all three faces improve.** The only per-character
inputs today are `skinTone / beard / age / iris / hair / neckLen`. Part of this
plan is adding a few *shape* inputs so the three read as different **people**,
not three recolours of one doll.

## Root-cause diagnosis (why it reads doll/duck)

Grounded in the actual code, most→least impactful:

1. **Round skull.** `headGeo` (`face.js:297`) is `SphereGeometry(r,34,26)` with
   `sy=1.10` and a gentle linear jaw taper (`sx=1-jaw*0.26`). A human head is an
   **egg** — ~1.35–1.4× taller than wide, narrow temples, real occiput bulge at
   the back, a face on the *lower front*. A near-1:1 ball is the single biggest
   "doll" tell, and it only shows in profile/¾ (which is why nobody caught it —
   see Phase 0).
2. **Duck bill.** Two things compound:
   - *Geometry*: a wide, flat forward bulge — the "lower lip / mouth mound"
     Gaussian at `face.js:314` — spreads across the whole lower face.
   - *Paint*: the mouth is **two stacked horizontal ellipses + a seam**
     (`face.js:245-259`), too **wide** (upper lip 6k vs nose ~4.6k) and too
     **high** (short philtrum: nostrils at `fy+13.6k`, lip seam at `fy+19.2k`).
     Wide flat lips on a forward bulge = a bill.
3. **Cartoon "talk".** The talk state swaps in a big round open ellipse
   (`face.js:235-244`) — a quacking O rather than a small jaw-drop.
4. **Anime eyes.** Large sclera almonds (6.2k×3.7k), bright twin cornea
   catch-lights and a heavy black lash line (`face.js:127-167`) read as a doll,
   especially on the two old men.
5. **Uniform blush + identical proportions** across all three → they look like
   the same doll in different clothes.

## Locked decisions

- **Approach = reshape, don't replace.** Stay in the sphere + painted-texture
  pipeline. Reproportion the geometry, fix the mouth in *both* geometry and
  paint, calm the eyes, and add per-character shape params. This lands
  "human but stylized," preserves performance and the frozen runtime contract,
  and matches the rest of the game's low-poly look. (Rejected: full modeled
  head with geometric features — higher fidelity but clashes with the art
  direction, much more work, and endangers the frozen contract.)
- **Preserve the FROZEN contract** exactly (see `face.js` header): `makeHead()`
  → `{ head, skull }`; `head.userData.setFace(state)` with
  `neutral|blink|talk|talkBlink`; `head.userData.blinkOff`. New params are
  **additive with safe defaults**.
- **Keep it torch-proof.** Material stays `MeshPhysicalMaterial` with dropped
  `specularIntensity`; all new detail rides normal/roughness maps + baked AO,
  **no new triangles for detail** (the head is viewed at 1–4 m in fog).
- **Scope = the three living survivors.** The cellar girl shares `makeHead`
  (`drowned:true`); she must keep working but is *not* an aesthetic target.
  Geometry changes are gated so her drowned look is unaffected (or improved).
- **Phases 1 and 2 are developed together** — moving skull proportions shifts
  where the painted feature bands land, so `headGeo` and `faceTex` anchor
  constants (`fx`, `fy`, `my`, `eyeDX`) must be retuned in lockstep.

---

## Phases

### Phase 0 — Portrait harness & baseline (do first)
We currently only have **front + wide** shots (`_screenshots/npc-overhaul/`);
the round-skull problem is a **profile** problem, so we're flying blind.
- Extend `scripts/npcshots.mjs` with a **face-portrait mode**: move the camera
  to head height ~0.5–0.7 m away and shoot **front / ¾ / profile** for each of
  the three (+ a point-blank anti-bloom check).
- Capture `_screenshots/faces/before-*` as the baseline to diff every phase
  against.
- **Exit check:** we can see all three heads close-up from three angles.

### Phase 1 — Skull proportions (`headGeo`) — highest leverage
Turn the ball into a human ovoid. All in `face.js:297-324`:
- **Elongate vertically & narrow the width** → face height:width ≈ 1.35–1.4
  (raise `sy`, trim `sx` at the temples specifically, not uniformly).
- **Real occiput**: push the back (−z) hemisphere out so the *profile* is an egg,
  not a circle (currently only +z is displaced; add a gentle −z parietal/occiput
  term). Keep +z paint alignment intact.
- **Rebuild the jaw**: chin brought **forward + down**, a defined **gonial angle**
  (jaw corner), mandible narrower than the cheekbones — replace the single linear
  `sx=1-jaw*0.26` scale with a jaw that has a *plane and a corner*, not a shrunk
  sphere-bottom.
- **Cheekbones** slightly higher/stronger with an under-cheek hollow (tune the
  existing zygomatic + hollow Gaussians).
- **Seeded micro-asymmetry** (≤1–2%) so it's a person, not a symmetrical mould.
- **Gate by `drowned`** so the girl's gaunt look isn't distorted.
- **Exit check:** ¾ and profile read as a human skull; front silhouette is an
  oval, not a circle. No paint drift (retune with Phase 2).

### Phase 2 — Kill the duck bill (geometry + paint together)
*Geometry* (`face.js`):
- Replace the wide flat "mouth mound" (`:314`) with a **narrower upper-lip /
  maxilla roll** plus a **separate chin mound**, with a **mentolabial crease**
  between them, so the lower face has structure instead of one bulge.
- **Lengthen the philtrum** — drop the whole mouth band lower on the face.

*Paint* (`faceTex`, `face.js:233-259`):
- Redraw the **closed** mouth: a real **cupid's-bow** upper lip, **narrower**
  width (≈ nostril-width×1.5, down from 6k), **turned/shadowed corners**
  (commissures), a subtle lower-lip highlight — not two flat ellipses.
- Redraw the **open/talk** state (`:235-244`) as a **modest jaw-drop**: a small
  dark gap with the lower lip dropping, not a big round O. (Also make `blink`
  and `talkBlink` consistent with the new geometry.)
- Retune anchors `fx/fy/my` so lips sit at the correct human thirds.
- **Exit check:** front + ¾ show lips, not a bill; talk animation looks like
  speech, not a quack.

### Phase 3 — De-doll the eyes & brows (`faceTex`)
`face.js:93-187`:
- **Shrink** the eye almond and **sink it deeper** (lean on socket shadow +
  the Phase-1 socket geometry).
- **Kill the doll glaze**: one small, softer cornea catch-light; thinner,
  age-appropriate lash line — **men get sparse/no lashes**, Mara keeps modest.
- Smaller iris/pupil; realistic upper-lid fold; softer under-eye.
- **Reduce blush** (`:266-268`) to a faint warmth, not two round dots.
- **Exit check:** eyes read as set into a face, not painted onto a doll.

### Phase 4 — Skin & material realism pass
`faceTex` mottle + `livingSkinDetail`/material tuning:
- Tone variation instead of one flat skin: redder nose-tip/ears, cooler jaw,
  faint SSS-like warmth via the base color multiplier.
- Per-character skin character: Rufino ruddy/weathered, Eliseo leathery/old,
  Mara sallow/tired. Tune per `age`.
- **Exit check:** skin has life without blowing white under the torch (recheck
  the point-blank shot).

### Phase 5 — Per-character differentiation (make them 3 people)
Add **additive shape params** to `makeHead` (defaults = current look):
`faceLength`, `jawWidth`, `browHeavy`, `eyeSize`, `noseLen`, `cheekGaunt`.
- **Rufino**: broader, heavier jaw; strong brow; weathered.
- **Eliseo**: longer, gaunter, sunken cheeks/temples (`cheekGaunt` high),
  hooded brow — an old man's skull.
- **Mara**: smaller, softer, narrower jaw, slightly larger eyes.
- Wire the params in `mara.js:159`, `rufino.js:190`, `eliseo.js:175`.
- **Exit check:** silhouettes alone distinguish the three.

### Phase 6 — Reseat attachments & verify (integration)
Proportion changes move the crown, ears, jaw and neck, so head-local
attachments must follow. **This is the main integration risk.**
- **Hair** — `makeHair('scalp')` assumes a sphere `R=0.115`, `C=(0,0.008,-0.008)`
  (`face.js:393-418`); re-parameterize its rings to the new ovoid so the
  hairline/cap still fits.
- **Hats/hood/lamp** are parented at fixed head-local offsets:
  Rufino's felt hat (`rufino.js`), Eliseo's straw hat (`eliseo.js`), Mara's hood
  + dead **headlamp** (`mara.js`). Re-seat each after the skull grows taller.
- **Ears/neck** in `makeHead` (`:549-567`) — reposition to the new jaw/skull.
- Confirm **blink/talk** still swap correctly; confirm **no perf regression**
  (vertex count, draw calls — hair still merges to one mesh/bucket); confirm
  **girl (drowned)** still renders.
- Re-render the full portrait matrix, diff vs Phase-0 baseline, iterate numbers.
- **Exit check:** in-game (`npm run npcshots`) all three read as real, distinct
  people; nothing floating/clipping; no white blowout; girl unaffected.

---

## Risks & dependencies
- **Paint↔geometry coupling** — the painted feature bands (`fx,fy,my,eyeDX`) are
  tuned to today's sphere. Every proportion change needs a matching paint retune;
  hence Phases 1+2 co-developed against the Phase-0 harness.
- **Attachment drift** (Phase 6) — hats/hair/lamp/hood will float or clip if not
  reseated. Budget real time for this; it's where "looks broken" bugs hide.
- **Frozen contract** — do not change `makeHead`'s return shape or `setFace`
  states; new params additive only.
- **Torch blowout** — re-verify the point-blank anti-bloom shot after any
  material/color change.
- **Girl / drowned** — gate geometry changes so her look is preserved.

## Suggested order of execution
Phase 0 → **1+2 together** (the money phases) → 3 → 5 → 4 → 6, re-shooting
portraits after each. Phases 1+2 alone should already erase most of the
"round face + duck mouth" complaint; the rest is refinement toward "three
distinct, believable people."
