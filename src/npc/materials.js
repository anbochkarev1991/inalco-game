import * as THREE from 'three';
import { NPCTEX } from './shared.js';
import {
  nightgownLinen, drownedFlesh, livingSkinDetail,
  mattedSteel, wornWood,
} from './textures.js';

// Material FACTORY functions for the NPC overhaul. Every material here is tuned
// against ONE fact: the player torch is a SpotLight(intensity 115, decay 2)
// under ACESFilmic tonemapping @ exposure 1.07. Point-blank it blows a bright
// lit MeshStandard/Lambert surface to pure white. So the rules are:
//   - dark albedo (colour AND/OR map) that dominates the tone,
//   - strong roughness maps (kill the specular bloom),
//   - metalness 0 for everything organic,
//   - anything that MUST stay black at point-blank uses MeshBasic (unlit).
// Detail (weave, pores, folds) rides on normal + roughness maps and baked
// vertex-AO — all free at draw time.

// clone a texture only when it needs its own repeat, so we never mutate a
// shared/CC0 texture that other NPCs reuse. Colour-space + wrap survive clone.
function withRepeat(tex, repeat) {
  if (!tex || !repeat) return tex || null;
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------- clothMat
// General cloth material — used both with the CC0 wool maps (passed in from
// NPCTEX) and with the procedural maps here. Fixes over the old shared.clothMat:
//  (1) if `repeat` is given, each provided texture is CLONED before its .repeat
//      is set (never mutate a shared texture);
//  (2) dark `color` expected (multiplies the greyish woven albedo down);
//  (3) high `roughness` (0.9–1.0) multiplies the roughness map so cloth never
//      shines;
//  (4) `vertexColors` support so baked AO (bakeAO → geometry.color) shows.
export function clothMat({
  color, map = null, normal = null, rough = null, repeat = null,
  roughness = 0.95, normalScale = 1.0, vertexColors = false,
}) {
  // MeshPhysical (a MeshStandard superset) so specularIntensity can drop the
  // dielectric specular glaze that otherwise washes any dyed cloth to cream
  // under the 115-intensity torch at close range. Low but non-zero so the weave
  // still catches the beam at 3 m.
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness, metalness: 0, vertexColors, specularIntensity: 0.12,
  });
  const mp = withRepeat(map, repeat);
  const nr = withRepeat(normal, repeat);
  const rg = withRepeat(rough, repeat);
  if (mp) m.map = mp;                                   // greyish weave × dark colour = dyed fibre
  if (nr) { m.normalMap = nr; m.normalScale = new THREE.Vector2(normalScale, normalScale); }
  if (rg) m.roughnessMap = rg;
  return m;
}

// ----------------------------------------------------------------- skinMatV2
// Living-NPC skin. NPCTEX.skinNor carries the coarse pore/wrinkle normal;
// livingSkinDetail() adds the roughness variation so the beam finds micro-
// relief instead of a plastic sheen. normalScale kept low so mid-distance
// doesn't bloom but pores still read in the beam up close.
export function skinMatV2(color, { rough = 0.72, detail = true, vertexColors = false } = {}) {
  const det = detail ? livingSkinDetail() : null;
  // MeshPhysical so specularIntensity can drop the plastic specular glaze the
  // torch otherwise bakes over a face at close range (the old "lamp" look). The
  // diffuse still brightens up close — a living face SHOULD read bright in the
  // beam — but the normalScale is kept low so mid-distance holds pore relief
  // instead of blooming to a featureless white.
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: rough, metalness: 0, specularIntensity: 0.4, vertexColors,
  });
  // coarse skin normal from the CC0 map, falling back to the procedural one offline
  const nor = NPCTEX.skinNor || (det && det.normal) || null;
  if (nor) { m.normalMap = nor; m.normalScale = new THREE.Vector2(0.3, 0.3); }
  if (det) m.roughnessMap = det.rough;
  return m;
}

// -------------------------------------------------------------- drownedSkinMat
// The cellar girl's skin. drownedFlesh() map+normal+rough over a DARK base.
//
// The point-blank torch (115 cd, decay 2) is so strong that a normal
// MeshStandard surface blows to white even with a black albedo — the culprit is
// the dielectric SPECULAR glaze (F0≈0.04), which the swatch confirmed washes the
// whole sphere cream regardless of colour. So this is a MeshPhysicalMaterial
// with `specularIntensity: 0` (kills that glaze) plus a very dark albedo; the
// DIFFUSE term then lands at flesh-grey instead of blooming, and the normal map
// still gives wet relief in the beam. Verified: reads as wet flesh at 1 m, not
// white. Hooks the controller uses:
//   emissive white @ emissiveIntensity 0  → flash-burn flare (bump intensity)
//   transparent:true, opacity 1           → dissolve fade (drop opacity)
export function drownedSkinMat({ vertexColors = false } = {}) {
  const t = drownedFlesh();
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x33352d,
    map: t.map,
    normalMap: t.normal,
    roughnessMap: t.rough,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.92,
    metalness: 0,
    specularIntensity: 0,          // kill the torch's white specular glaze
    emissive: 0xffffff,
    emissiveIntensity: 0,          // flash-burn hook
    transparent: true,             // dissolve hook
    opacity: 1,
    vertexColors,
  });
  return m;
}

// -------------------------------------------------------------- garmentDarkMat
// The girl's nightgown — engineered to STAY DARK at point-blank.
//
// CHOICE: MeshBasicMaterial (unlit), NOT a dark MeshStandard. The swatch proved
// this decisively: under the 115 cd torch at 1 m, EVEN A PURE-BLACK MeshStandard
// sphere blows to bright cream — the dielectric specular glaze plus the sheer
// irradiance overwhelm any albedo, so no "very dark MeshStandard" can stay dark
// (the point-blank capture of the MeshStandard variant was a blown-out cream
// grid). MeshBasic ignores the torch entirely: it renders its albedo verbatim
// at every distance, so it is genuinely torch-proof. Fold relief is preserved
// WITHOUT lighting: the nightgownLinen albedo bakes in vertical fold shading +
// the soaked-hem gradient, and `vertexColors` lets the mesh's baked AO deepen
// the fold valleys. The result reads as a dark damp shift with fold detail that
// never blooms.
//
// Hooks: `transparent:true` is exposed for the dissolve fade. There is NO
// emissive on a MeshBasicMaterial — the flash-burn controller MUST guard with
// `if (m.emissive)` (m.emissive is undefined here) and simply skip the flare on
// the gown, or drive the flare via the girl's skin/other lit parts instead.
// NOTE on `color`: because this is UNLIT, the final pixel is literally
// color × map × vertexAO. The linen map is greyish (~mid) and AO darkens the
// valleys, so `color` is the direct albedo knob. The default lands the shift at
// a dark damp grey (folds/hem legible, never blooming); pass a lower `color`
// for a blacker gown.
export function garmentDarkMat({ map = null, color = 0x6a655c, vertexColors = false } = {}) {
  const t = nightgownLinen();
  const m = new THREE.MeshBasicMaterial({
    color,
    map: map || t.map,             // dark linen weave + baked folds + soaked hem
    transparent: true,             // dissolve hook
    opacity: 1,
    vertexColors,
  });
  return m;
}

// ------------------------------------------------------------------- steelMat
// Old matte steel (spade blade, mate rim, wire). Low-ish metalness so it catches
// a dim glint on the scratches but never reads as chrome; high roughness holds
// the highlight down under the torch.
export function steelMat() {
  const t = mattedSteel();
  return new THREE.MeshPhysicalMaterial({
    color: 0x3c4044,               // darker so the beam doesn't wash it silver
    map: t.map,
    normalMap: t.normal,
    roughnessMap: t.rough,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.72,               // higher = matte, spreads the highlight thin
    metalness: 0.3,                // a little metal for a dim glint, not chrome
    specularIntensity: 0.5,        // half the dielectric glaze so it isn't glossy
  });
}

// -------------------------------------------------------------------- woodMat
// Weathered timber (spade shaft, logs, stakes). Fully matte, non-metal.
export function woodMat() {
  const t = wornWood();
  // MeshPhysical (a MeshStandard superset) so specularIntensity can drop the
  // dielectric glaze that the torch otherwise washes over even a rough, dark
  // surface — weathered timber is near-specular-free anyway.
  return new THREE.MeshPhysicalMaterial({
    color: 0x4a3720,               // dark timber so the beam doesn't wash it pale
    map: t.map,
    normalMap: t.normal,
    roughnessMap: t.rough,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.92,
    metalness: 0,
    specularIntensity: 0.2,
  });
}
