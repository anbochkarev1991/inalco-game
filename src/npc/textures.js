import * as THREE from 'three';
import { canvasTexture } from '../world.js';
import { heightToNormalTex } from './pipeline.js';

// Procedural TEXTURE library for the NPC overhaul. Everything here is painted
// to a canvas at load (no downloads, no lazy runtime work) and CACHED as a
// module singleton so a texture is built at most once and shared by every NPC.
//
// THE CONSTRAINT these textures are engineered around: the player torch is a
// SpotLight(intensity 115, decay 2) under ACESFilmic tonemapping — point-blank
// it blows any bright lit surface to white. So albedo maps here stay GREYISH
// and fairly dark (the material colour dyes them down further), the detail
// lives in the NORMAL and ROUGHNESS maps (free at draw time), and wet/soaked
// zones darken the roughness so the beam reads them as damp matter, not lamps.
//
// Colour-space discipline (three.js): albedo maps are sRGB (canvasTexture sets
// that); roughness maps are DATA → linear (NoColorSpace); normal maps come from
// heightToNormalTex which already tags them linear. Helpers below enforce it.

// ------------------------------------------------------------------ helpers
// sRGB albedo canvas texture, tiling.
function albedoTex(draw, w, h) {
  const t = canvasTexture(draw, w, h);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// linear DATA canvas texture (roughness / masks), tiling.
function dataTex(draw, w, h) {
  const t = canvasTexture(draw, w, h);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// small seeded PRNG so every rebuild (there is only one, but still) is stable
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ------------------------------------------------------------ nightgownLinen
// A period child's nightgown/shift. Damp off-white→grey linen weave with a
// soaked waterline stain baked into the bottom (the hem that dragged in the
// lake), subtle vertical fold shading, and a roughness map that goes DARKER
// (glossier/wetter) toward that hem. Albedo is deliberately kept dark-greyish
// so the torch dyes it to damp cloth, never a bright bloom.
//
// Repeat note: use with repeat NULL / [1,1] (or horizontal-only like [2,1]) so
// the baked waterline hem stays at the bottom instead of tiling up the shift.
let _nightgown = null;
export function nightgownLinen() {
  if (_nightgown) return _nightgown;
  const W = 512, H = 512;
  // roughness→brightness of a linen thread (higher = drier = rougher = brighter map)
  const map = albedoTex((c) => {
    const r = rng(41);
    // base damp linen — a dull greyed bone, kept dark
    c.fillStyle = '#585349'; c.fillRect(0, 0, W, H);
    // broad tonal blotches so it isn't a flat sheet
    for (let i = 0; i < 60; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 2, r() * W, r() * H, 40 + r() * 90);
      const v = r() > 0.5 ? '108,102,90' : '58,55,49';
      g.addColorStop(0, `rgba(${v},${0.05 + r() * 0.09})`);
      g.addColorStop(1, `rgba(${v},0)`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // linen WEAVE: warp (vertical) + weft (horizontal) threads, lighter than gaps
    c.globalAlpha = 0.5;
    for (let x = 0; x < W; x += 3) {
      c.fillStyle = (x % 6 === 0) ? 'rgba(120,114,100,0.6)' : 'rgba(40,38,33,0.5)';
      c.fillRect(x, 0, 1.4, H);
    }
    for (let y = 0; y < H; y += 3) {
      c.fillStyle = (y % 6 === 0) ? 'rgba(118,112,99,0.55)' : 'rgba(42,40,34,0.45)';
      c.fillRect(0, y, W, 1.4);
    }
    c.globalAlpha = 1;
    // slubs / thread flecks
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(${r() > 0.5 ? '150,144,128' : '30,28,24'},${r() * 0.22})`;
      c.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
    }
    // vertical FOLD shading — soft darker bands where the shift gathers
    for (let i = 0; i < 7; i++) {
      const fx = (i / 7) * W + (r() - 0.5) * 30;
      const g = c.createLinearGradient(fx - 22, 0, fx + 22, 0);
      g.addColorStop(0, 'rgba(24,22,18,0)');
      g.addColorStop(0.5, `rgba(24,22,18,${0.14 + r() * 0.12})`);
      g.addColorStop(1, 'rgba(24,22,18,0)');
      c.fillStyle = g; c.fillRect(fx - 22, 0, 44, H);
    }
    // SOAKED HEM: a waterline gradient in the bottom ~40%, darkest at the very
    // bottom, with a defined tide edge where the wet cloth meets the dry.
    const hemTop = H * 0.6;
    const hg = c.createLinearGradient(0, hemTop, 0, H);
    hg.addColorStop(0, 'rgba(18,20,20,0)');
    hg.addColorStop(0.35, 'rgba(20,22,22,0.28)');
    hg.addColorStop(1, 'rgba(10,12,13,0.66)');
    c.fillStyle = hg; c.fillRect(0, hemTop, W, H - hemTop);
    // the tide line itself — a slightly darker, wavering band
    c.strokeStyle = 'rgba(8,10,11,0.4)'; c.lineWidth = 3;
    c.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = hemTop + 6 + Math.sin(x * 0.05) * 5 + (r() - 0.5) * 4;
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    // dirty grey stain mottle in the soaked zone
    for (let i = 0; i < 40; i++) {
      const y = hemTop + r() * (H - hemTop);
      c.fillStyle = `rgba(30,34,34,${0.08 + r() * 0.12})`;
      c.beginPath(); c.ellipse(r() * W, y, 8 + r() * 22, 4 + r() * 10, r() * 3, 0, 7); c.fill();
    }
  }, W, H);

  const normal = heightToNormalTex((c) => {
    const r = rng(41);
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    // weave height: crossing threads sit proud of the gaps
    for (let x = 0; x < W; x += 3) {
      c.fillStyle = (x % 6 === 0) ? 'rgba(210,210,210,0.55)' : 'rgba(60,60,60,0.5)';
      c.fillRect(x, 0, 1.4, H);
    }
    for (let y = 0; y < H; y += 3) {
      c.fillStyle = (y % 6 === 0) ? 'rgba(205,205,205,0.5)' : 'rgba(64,64,64,0.45)';
      c.fillRect(0, y, W, 1.4);
    }
    // fold ridges (broad)
    for (let i = 0; i < 7; i++) {
      const fx = (i / 7) * W + (r() - 0.5) * 30;
      const g = c.createLinearGradient(fx - 26, 0, fx + 26, 0);
      g.addColorStop(0, 'rgba(128,128,128,0)');
      g.addColorStop(0.5, 'rgba(178,178,178,0.5)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      c.fillStyle = g; c.fillRect(fx - 26, 0, 52, H);
    }
  }, W, H, 1.7);

  const rough = dataTex((c) => {
    const r = rng(41);
    // dry linen is quite rough/matte → bright base
    c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, W, H);
    // weave micro-variation
    for (let i = 0; i < 1400; i++) {
      const v = 150 + Math.floor(r() * 90);
      c.fillStyle = `rgba(${v},${v},${v},${r() * 0.5})`;
      c.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
    // soaked hem = wet = GLOSSIER = darker roughness toward the bottom
    const hemTop = H * 0.55;
    const g = c.createLinearGradient(0, hemTop, 0, H);
    g.addColorStop(0, 'rgba(70,70,70,0)');
    g.addColorStop(0.4, 'rgba(60,60,60,0.4)');
    g.addColorStop(1, 'rgba(40,40,40,0.85)');
    c.fillStyle = g; c.fillRect(0, hemTop, W, H - hemTop);
  }, W, H);

  _nightgown = { map, normal, rough };
  return _nightgown;
}

// ------------------------------------------------------------- drownedFlesh
// Waterlogged child skin. A pale grey-green greyish albedo (so material colour
// can dye it dark without killing the mottle) carrying bruise blotches, blue-
// grey vein webs, faint waterline bands and pore speckle — the same intent as
// enemies.fleshTex, but a touch paler and younger. Kept greyish so the torch
// point-blank reads wet flesh, not white.
let _drowned = null;
export function drownedFlesh() {
  if (_drowned) return _drowned;
  const W = 256, H = 256;
  const map = albedoTex((c) => {
    const r = rng(17);
    // grey-green base — greyish detail map; the material colour + killed specular
    // keep it dark under the torch. Mid-toned so the mottle still reads.
    c.fillStyle = '#6b7266'; c.fillRect(0, 0, W, H);
    // faint waterline bands — been in and out of the lake
    for (let i = 0; i < 6; i++) {
      const y = r() * H;
      const g = c.createLinearGradient(0, y - 7, 0, y + 7);
      g.addColorStop(0, 'rgba(70,84,78,0)');
      g.addColorStop(0.5, `rgba(56,70,66,${0.14 + r() * 0.16})`);
      g.addColorStop(1, 'rgba(70,84,78,0)');
      c.fillStyle = g; c.fillRect(0, y - 7, W, 14);
    }
    // bruise mottling: waterlogged pale, bruise green-grey, sallow yellow-grey
    for (let i = 0; i < 120; i++) {
      const q = r();
      const col = q > 0.72 ? '138,146,130' : q > 0.42 ? '74,94,82' : '96,90,66';
      c.fillStyle = `rgba(${col},${0.14 + r() * 0.28})`;
      c.beginPath();
      c.ellipse(r() * W, r() * H, 3 + r() * 15, 2 + r() * 9, r() * 3, 0, 7); c.fill();
    }
    // bluish bruise pools (deeper)
    for (let i = 0; i < 16; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 1, r() * W, r() * H, 10 + r() * 22);
      g.addColorStop(0, `rgba(54,66,84,${0.16 + r() * 0.18})`);
      g.addColorStop(1, 'rgba(54,66,84,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // blue-grey vein threads
    for (let i = 0; i < 34; i++) {
      c.strokeStyle = `rgba(${r() > 0.5 ? '58,72,92' : '44,54,60'},${0.24 + r() * 0.3})`;
      c.lineWidth = 0.7 + r() * 0.7;
      c.beginPath();
      let x = r() * W, y = r() * H; c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 24; y += (r() - 0.5) * 24; c.lineTo(x, y); }
      c.stroke();
    }
    // pore speckle
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(${r() > 0.5 ? '150,154,142' : '40,46,44'},${r() * 0.26})`;
      c.fillRect(r() * W, r() * H, 1, 1);
    }
  }, W, H);

  const normal = heightToNormalTex((c) => {
    const r = rng(17);
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    // pores as tiny pits
    for (let i = 0; i < 1600; i++) {
      const v = r() > 0.5 ? 40 + r() * 30 : 170 + r() * 50;
      c.fillStyle = `rgba(${v},${v},${v},${0.3 + r() * 0.4})`;
      c.beginPath(); c.arc(r() * W, r() * H, 0.6 + r() * 1.3, 0, 7); c.fill();
    }
    // slack, waterlogged wrinkles
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = `rgba(${r() > 0.5 ? '60,60,60' : '175,175,175'},0.5)`;
      c.lineWidth = 0.8 + r() * 1.2;
      c.beginPath();
      let x = r() * W, y = r() * H; c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 18; c.lineTo(x, y); }
      c.stroke();
    }
  }, W, H, 1.3);

  const rough = dataTex((c) => {
    const r = rng(17);
    // waterlogged skin is fairly glossy (wet) → mid roughness base
    c.fillStyle = '#8a8a8a'; c.fillRect(0, 0, W, H);
    // wet sheen patches (glossier = darker)
    for (let i = 0; i < 70; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 1, r() * W, r() * H, 8 + r() * 20);
      g.addColorStop(0, `rgba(40,40,40,${0.3 + r() * 0.4})`);
      g.addColorStop(1, 'rgba(40,40,40,0)');
      c.fillStyle = g; c.beginPath();
      c.ellipse(r() * W, r() * H, 8 + r() * 18, 5 + r() * 12, r() * 3, 0, 7); c.fill();
    }
    // drier flecks
    for (let i = 0; i < 300; i++) {
      c.fillStyle = `rgba(210,210,210,${r() * 0.3})`;
      c.fillRect(r() * W, r() * H, 1, 1);
    }
  }, W, H);

  _drowned = { map, normal, rough };
  return _drowned;
}

// --------------------------------------------------------- livingSkinDetail
// AUGMENT (not replace) NPCTEX.skinNor for the living NPCs' faces/hands: a
// subtle pore + fine-wrinkle normal plus a roughness map that varies so the
// beam finds micro-relief instead of a plastic sheen. No albedo — the painted
// face texture and material colour own the colour.
let _livingSkin = null;
export function livingSkinDetail() {
  if (_livingSkin) return _livingSkin;
  const W = 256, H = 256;
  const normal = heightToNormalTex((c) => {
    const r = rng(53);
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    // fine pores
    for (let i = 0; i < 2200; i++) {
      const v = r() > 0.5 ? 46 + r() * 26 : 168 + r() * 44;
      c.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.3})`;
      c.beginPath(); c.arc(r() * W, r() * H, 0.5 + r() * 1.0, 0, 7); c.fill();
    }
    // fine wrinkle creases
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = `rgba(${r() > 0.5 ? '70,70,70' : '165,165,165'},0.4)`;
      c.lineWidth = 0.6 + r() * 0.8;
      c.beginPath();
      let x = r() * W, y = r() * H; c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 26; y += (r() - 0.5) * 14; c.lineTo(x, y); }
      c.stroke();
    }
  }, W, H, 0.9);

  const rough = dataTex((c) => {
    const r = rng(53);
    // skin base ~0.7 roughness
    c.fillStyle = '#b4b4b4'; c.fillRect(0, 0, W, H);
    // oilier (glossier) zones — darker blotches
    for (let i = 0; i < 60; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 1, r() * W, r() * H, 10 + r() * 26);
      g.addColorStop(0, `rgba(120,120,120,${0.18 + r() * 0.22})`);
      g.addColorStop(1, 'rgba(120,120,120,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // pore speckle in roughness
    for (let i = 0; i < 700; i++) {
      c.fillStyle = `rgba(210,210,210,${r() * 0.28})`;
      c.fillRect(r() * W, r() * H, 1, 1);
    }
  }, W, H);

  _livingSkin = { normal, rough };
  return _livingSkin;
}

// ----------------------------------------------------------------- hairClump
// A vertical hank of hair strands as an ALPHA SILHOUETTE (transparent between
// strands) plus a strand-direction normal. The returned `map` is a full RGBA
// texture: coloured strands over a transparent gap, so it can be used directly
// as `.map` (with transparent:true) AND as its own `.alphaMap`.
//   wet  → darker, glossier, clumped strands + a wet highlight streak
//   grey → grey/white strands (old hair, beard)
// Cached per (wet,grey) combination.
const _hairCache = {};
export function hairClump({ wet = false, grey = false } = {}) {
  const key = `${wet ? 1 : 0}${grey ? 1 : 0}`;
  if (_hairCache[key]) return _hairCache[key];
  const W = 256, H = 512;
  const r = rng(71 + (wet ? 5 : 0) + (grey ? 11 : 0));
  const strands = wet ? 26 : 44;                       // wet clumps into fewer, thicker locks
  const baseCol = grey ? [150, 146, 138] : (wet ? [22, 20, 18] : [38, 30, 22]);
  const hiCol = grey ? [205, 202, 194] : (wet ? [70, 66, 60] : [96, 80, 60]);

  const map = albedoTex((c) => {
    c.clearRect(0, 0, W, H);                            // transparent gaps
    for (let i = 0; i < strands; i++) {
      const x0 = (i / strands) * W + (r() - 0.5) * 6;
      const w = (wet ? 4 : 2.4) + r() * (wet ? 5 : 3);
      const wob = 8 + r() * 18;
      const phase = r() * 6.28;
      const col = r() > 0.5 ? baseCol : baseCol.map((v) => Math.max(0, v - 6));
      c.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.85 + r() * 0.15})`;
      c.lineWidth = w;
      c.beginPath();
      for (let y = -10; y <= H + 10; y += 12) {
        const x = x0 + Math.sin(y * 0.012 + phase) * wob;
        y <= -10 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
      // a lit sheen down the middle of the lock (wet = brighter, sharper)
      c.strokeStyle = `rgba(${hiCol[0]},${hiCol[1]},${hiCol[2]},${wet ? 0.5 : 0.28})`;
      c.lineWidth = Math.max(0.8, w * (wet ? 0.4 : 0.3));
      c.beginPath();
      for (let y = -10; y <= H + 10; y += 12) {
        const x = x0 + Math.sin(y * 0.012 + phase) * wob - w * 0.18;
        y <= -10 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    // a few loose flyaway wisps
    for (let i = 0; i < 30; i++) {
      c.strokeStyle = `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},${0.2 + r() * 0.3})`;
      c.lineWidth = 0.7;
      const x0 = r() * W, y0 = r() * H, len = 20 + r() * 60;
      c.beginPath(); c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + (r() - 0.5) * 20, y0 + len * 0.5, x0 + (r() - 0.5) * 30, y0 + len);
      c.stroke();
    }
  }, W, H);

  const normal = heightToNormalTex((c) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < strands; i++) {
      const x0 = (i / strands) * W + (r() - 0.5) * 6;
      const w = (wet ? 4 : 2.4) + r() * (wet ? 5 : 3);
      const wob = 8 + r() * 18;
      const phase = r() * 6.28;
      // strand body raised, edges falling — paint a bright core, dark rims
      c.strokeStyle = 'rgba(70,70,70,0.6)'; c.lineWidth = w + 2;
      c.beginPath();
      for (let y = -10; y <= H + 10; y += 12) {
        const x = x0 + Math.sin(y * 0.012 + phase) * wob;
        y <= -10 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
      c.strokeStyle = 'rgba(210,210,210,0.8)'; c.lineWidth = Math.max(1, w * 0.5);
      c.beginPath();
      for (let y = -10; y <= H + 10; y += 12) {
        const x = x0 + Math.sin(y * 0.012 + phase) * wob;
        y <= -10 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
  }, W, H, 1.4);

  const bundle = { map, normal };
  _hairCache[key] = bundle;
  return bundle;
}
// convenience: a grey, tighter beard hank
export function beardClump() { return hairClump({ wet: false, grey: true }); }

// ------------------------------------------------------------------ wornWood
// Weathered timber for the spade shaft, logs, stakes: dark, straight grain,
// splits and knots. sRGB albedo dark enough to stay wood under the torch.
let _wood = null;
export function wornWood() {
  if (_wood) return _wood;
  const W = 256, H = 512;
  const map = albedoTex((c) => {
    const r = rng(29);
    c.fillStyle = '#3a2c1e'; c.fillRect(0, 0, W, H);
    // long vertical grain streaks
    for (let i = 0; i < 260; i++) {
      const x = r() * W;
      const q = r();
      const col = q > 0.7 ? '92,70,46' : q > 0.4 ? '46,34,22' : '26,19,12';
      c.strokeStyle = `rgba(${col},${0.2 + r() * 0.4})`;
      c.lineWidth = 0.6 + r() * 2.4;
      c.beginPath();
      let xx = x;
      for (let y = 0; y <= H; y += 22) { xx += (r() - 0.5) * 3; y === 0 ? c.moveTo(xx, y) : c.lineTo(xx, y); }
      c.stroke();
    }
    // knots
    for (let i = 0; i < 4; i++) {
      const kx = r() * W, ky = r() * H, kr = 6 + r() * 12;
      for (let ring = kr; ring > 0; ring -= 1.6) {
        c.strokeStyle = `rgba(20,14,8,${0.1 + r() * 0.14})`;
        c.lineWidth = 1;
        c.beginPath(); c.ellipse(kx, ky, ring, ring * 1.5, 0, 0, 7); c.stroke();
      }
    }
    // dark splits/cracks
    for (let i = 0; i < 10; i++) {
      c.strokeStyle = `rgba(8,5,3,${0.4 + r() * 0.4})`;
      c.lineWidth = 0.8 + r() * 1.4;
      let xx = r() * W, yy = r() * H;
      c.beginPath(); c.moveTo(xx, yy);
      for (let k = 0; k < 8; k++) { xx += (r() - 0.5) * 5; yy += 14 + r() * 20; c.lineTo(xx, yy); }
      c.stroke();
    }
  }, W, H);

  const normal = heightToNormalTex((c) => {
    const r = rng(29);
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 220; i++) {
      const x = r() * W;
      c.strokeStyle = r() > 0.5 ? 'rgba(180,180,180,0.4)' : 'rgba(60,60,60,0.4)';
      c.lineWidth = 0.6 + r() * 2.2;
      let xx = x;
      c.beginPath();
      for (let y = 0; y <= H; y += 22) { xx += (r() - 0.5) * 3; y === 0 ? c.moveTo(xx, y) : c.lineTo(xx, y); }
      c.stroke();
    }
    // cracks cut deep (dark)
    for (let i = 0; i < 10; i++) {
      c.strokeStyle = 'rgba(20,20,20,0.9)'; c.lineWidth = 1 + r() * 1.6;
      let xx = r() * W, yy = r() * H;
      c.beginPath(); c.moveTo(xx, yy);
      for (let k = 0; k < 8; k++) { xx += (r() - 0.5) * 5; yy += 14 + r() * 20; c.lineTo(xx, yy); }
      c.stroke();
    }
  }, W, H, 2.0);

  const rough = dataTex((c) => {
    const r = rng(29);
    c.fillStyle = '#e0e0e0'; c.fillRect(0, 0, W, H);         // weathered = very rough
    for (let i = 0; i < 400; i++) {
      const v = 150 + Math.floor(r() * 100);
      c.strokeStyle = `rgba(${v},${v},${v},${r() * 0.5})`;
      c.lineWidth = 0.6 + r() * 2;
      let xx = r() * W;
      c.beginPath();
      for (let y = 0; y <= H; y += 26) { xx += (r() - 0.5) * 3; y === 0 ? c.moveTo(xx, y) : c.lineTo(xx, y); }
      c.stroke();
    }
  }, W, H);

  _wood = { map, normal, rough };
  return _wood;
}

// ---------------------------------------------------------------- mattedSteel
// Old matte steel for the spade blade, mate rim, wire: dark grey, scratched,
// pitted — NOT shiny. High roughness so the material reads as tired metal that
// only catches a dim glint on the scratches.
let _steel = null;
export function mattedSteel() {
  if (_steel) return _steel;
  const W = 256, H = 256;
  const map = albedoTex((c) => {
    const r = rng(89);
    c.fillStyle = '#4a4e52'; c.fillRect(0, 0, W, H);
    // tonal cloud (uneven tarnish)
    for (let i = 0; i < 50; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 2, r() * W, r() * H, 20 + r() * 60);
      const v = r() > 0.5 ? '96,100,104' : '40,42,45';
      g.addColorStop(0, `rgba(${v},${0.06 + r() * 0.12})`);
      g.addColorStop(1, `rgba(${v},0)`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // scratches (fine, brighter bare-metal lines)
    for (let i = 0; i < 120; i++) {
      c.strokeStyle = `rgba(150,156,162,${0.14 + r() * 0.3})`;
      c.lineWidth = 0.5 + r() * 0.9;
      const x0 = r() * W, y0 = r() * H, a = r() * 6.28, len = 8 + r() * 40;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); c.stroke();
    }
    // pitting / rust freckles
    for (let i = 0; i < 300; i++) {
      const q = r();
      c.fillStyle = q > 0.7 ? `rgba(70,48,32,${r() * 0.3})` : `rgba(20,22,24,${r() * 0.4})`;
      c.beginPath(); c.arc(r() * W, r() * H, 0.5 + r() * 1.6, 0, 7); c.fill();
    }
  }, W, H);

  const normal = heightToNormalTex((c) => {
    const r = rng(89);
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    // scratches as grooves
    for (let i = 0; i < 120; i++) {
      c.strokeStyle = r() > 0.5 ? 'rgba(60,60,60,0.5)' : 'rgba(200,200,200,0.5)';
      c.lineWidth = 0.5 + r() * 1;
      const x0 = r() * W, y0 = r() * H, a = r() * 6.28, len = 8 + r() * 40;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); c.stroke();
    }
    // shallow pits/dents
    for (let i = 0; i < 120; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 0.5, r() * W, r() * H, 2 + r() * 4);
      g.addColorStop(0, 'rgba(50,50,50,0.7)'); g.addColorStop(1, 'rgba(128,128,128,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  }, W, H, 1.2);

  const rough = dataTex((c) => {
    const r = rng(89);
    c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, W, H);         // matte metal
    // scratches slightly polished (darker/glossier)
    for (let i = 0; i < 120; i++) {
      c.strokeStyle = `rgba(80,80,80,${0.3 + r() * 0.4})`;
      c.lineWidth = 0.5 + r() * 1;
      const x0 = r() * W, y0 = r() * H, a = r() * 6.28, len = 8 + r() * 40;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); c.stroke();
    }
    // rough pitted patches (brighter)
    for (let i = 0; i < 60; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 1, r() * W, r() * H, 10 + r() * 22);
      g.addColorStop(0, `rgba(240,240,240,${0.2 + r() * 0.3})`);
      g.addColorStop(1, 'rgba(240,240,240,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  }, W, H);

  _steel = { map, normal, rough };
  return _steel;
}

// ----------------------------------------------------------------- campStone
// Dark rough granite for the fire-ring stones and seat logs (later used to fix
// the campfire blow-out): dark, matte, granite speckle + lichen patches.
let _stone = null;
export function campStone() {
  if (_stone) return _stone;
  const W = 256, H = 256;
  const map = albedoTex((c) => {
    const r = rng(101);
    c.fillStyle = '#33383a'; c.fillRect(0, 0, W, H);
    // broad mottle
    for (let i = 0; i < 60; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 2, r() * W, r() * H, 20 + r() * 70);
      const v = r() > 0.5 ? '64,70,72' : '22,26,28';
      g.addColorStop(0, `rgba(${v},${0.1 + r() * 0.16})`);
      g.addColorStop(1, `rgba(${v},0)`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // granite grain speckle (feldspar/quartz/biotite)
    for (let i = 0; i < 2600; i++) {
      const q = r();
      const col = q > 0.8 ? '150,150,146' : q > 0.55 ? '96,96,92' : q > 0.3 ? '40,44,46' : '14,16,18';
      c.fillStyle = `rgba(${col},${0.3 + r() * 0.5})`;
      c.fillRect(r() * W, r() * H, 1 + r() * 1.4, 1 + r() * 1.4);
    }
    // lichen patches — muted grey-green crust
    for (let i = 0; i < 16; i++) {
      const lx = r() * W, ly = r() * H, lr = 6 + r() * 20;
      for (let k = 0; k < 30; k++) {
        c.fillStyle = `rgba(${90 + r() * 40},${104 + r() * 40},${70 + r() * 30},${r() * 0.22})`;
        c.beginPath(); c.arc(lx + (r() - 0.5) * lr * 2, ly + (r() - 0.5) * lr * 2, 0.8 + r() * 2, 0, 7); c.fill();
      }
    }
  }, W, H);

  const normal = heightToNormalTex((c) => {
    const r = rng(101);
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    // bumpy grain
    for (let i = 0; i < 1400; i++) {
      const v = r() > 0.5 ? 40 + r() * 40 : 170 + r() * 50;
      c.fillStyle = `rgba(${v},${v},${v},${0.3 + r() * 0.4})`;
      c.beginPath(); c.arc(r() * W, r() * H, 0.8 + r() * 2.4, 0, 7); c.fill();
    }
    // a few deeper fissures
    for (let i = 0; i < 12; i++) {
      c.strokeStyle = 'rgba(40,40,40,0.7)'; c.lineWidth = 1 + r() * 2;
      let xx = r() * W, yy = r() * H;
      c.beginPath(); c.moveTo(xx, yy);
      for (let k = 0; k < 6; k++) { xx += (r() - 0.5) * 40; yy += (r() - 0.5) * 40; c.lineTo(xx, yy); }
      c.stroke();
    }
  }, W, H, 1.6);

  const rough = dataTex((c) => {
    const r = rng(101);
    c.fillStyle = '#dcdcdc'; c.fillRect(0, 0, W, H);        // matte stone
    for (let i = 0; i < 1600; i++) {
      const v = 150 + Math.floor(r() * 100);
      c.fillStyle = `rgba(${v},${v},${v},${r() * 0.5})`;
      c.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
  }, W, H);

  _stone = { map, normal, rough };
  return _stone;
}

// --------------------------------------------------------------- andeanStripe
// A horizontal Andean stripe band (sRGB) for the poncho hem. Transparent
// everywhere except a band of stripes near the bottom, so it can be OVERLAID on
// the poncho (use with transparent:true; drive alpha from this texture's own
// alpha via alphaMap, or as a second .map layer). Repeat horizontally to run
// the band around the hem.
let _andean = null;
export function andeanStripe() {
  if (_andean) return _andean;
  const W = 256, H = 128;
  const map = albedoTex((c) => {
    const r = rng(131);
    c.clearRect(0, 0, W, H);                               // transparent field
    // the band occupies the lower third (the hem)
    const bandTop = H * 0.62, bandH = H - bandTop;
    // Andean palette: dark madder red, ochre, cream, teal, black
    const cols = ['#6e2018', '#b06a1e', '#d9c39a', '#1f4a44', '#141210', '#8a2a1c'];
    let y = bandTop, i = 0;
    while (y < H) {
      const h = 3 + (i % 3) * 2 + r() * 3;
      c.fillStyle = cols[i % cols.length];
      c.fillRect(0, y, W, h + 0.6);
      y += h; i++;
    }
    // zig-zag / diamond motif on the widest cream stripe
    c.strokeStyle = '#6e2018'; c.lineWidth = 2;
    const zy = bandTop + bandH * 0.45;
    c.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const yy = zy + ((x / 16) % 2 === 0 ? -5 : 5);
      x === 0 ? c.moveTo(x, yy) : c.lineTo(x, yy);
    }
    c.stroke();
    // little diamonds
    c.fillStyle = '#1f4a44';
    for (let x = 8; x < W; x += 32) {
      c.beginPath();
      c.moveTo(x, zy - 4); c.lineTo(x + 5, zy); c.lineTo(x, zy + 4); c.lineTo(x - 5, zy);
      c.closePath(); c.fill();
    }
  }, W, H);

  _andean = { map };
  return _andean;
}
