import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, TUNE, LAYOUT, PATHS } from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// deterministic pseudo-random
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- terrain fn
const PADS = [LAYOUT.house, LAYOUT.kiosk, LAYOUT.shed, LAYOUT.green, LAYOUT.boathouse];

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp01(t);
  const x = ax + dx * t, z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

function distToPaths(x, z) {
  let d = 1e9;
  for (const path of PATHS)
    for (let i = 0; i < path.length - 1; i++)
      d = Math.min(d, distToSeg(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]));
  return d;
}

export function groundHeight(x, z) {
  let h =
    2.0 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 + 0.4) +
    1.15 * Math.sin(x * 0.043 + z * 0.031 + 2.0) +
    0.45 * Math.sin(x * 0.089 - z * 0.071) +
    2.55;
  h += Math.max(0, (-z - 62) * 0.11);                 // climb to the north
  h += Math.max(0, (Math.abs(x) - 72) * 0.06);        // valley walls east/west
  const shore = smoothstep(LAYOUT.shoreZ - 10, LAYOUT.shoreZ + 15, z);
  h = lerp(h, -3.6, shore);
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    h = lerp(h, p.y, 1 - smoothstep(p.r * 0.55, p.r, d));
  }
  // the jetty deck
  if (Math.abs(x - LAYOUT.dock.x) < 1.5 && z > 57.0 && z < 79.5) h = Math.max(h, 0.55);
  // NOTE: the cellar is no longer carved into this heightfield — the 2.5 m grid
  // is far too coarse to represent a 3 m sunken stair (it bridged right over it,
  // which read as "the entrance is buried"). Instead a clean grid-aligned HOLE is
  // punched in the terrain mesh (see below) and mansion.js fills it with a built
  // stone stairwell + door the player rides via a floor override.
  return h;
}

// world-space footprint of the cellar; kept in sync with mansion.js.
// The ROOM sits UNDER the rear-east of the house (below the walkable main floor).
// The STAIR is a built stone flight inside a sunken areaway in the rear yard,
// descending TOWARD the house to a wooden cellar door. HOLE is the rectangle of
// terrain faces removed so the stairwell is never covered — it is aligned to the
// terrain grid (x,z multiples of 2.5) so the cut edges land exactly on grid lines.
export const CELLAR = {
  roomMinX: 1.5, roomMaxX: 7.5, roomMinZ: -20.5, roomMaxZ: -14.5,
  stairMinX: 3.5, stairMaxX: 6.5, stairTopZ: -25.0, stairBotZ: -20.5,
  doorMinX: 4.3, doorMaxX: 5.7,                         // the cellar door opening
  hole: { minX: 2.5, maxX: 7.5, minZ: -25.0, maxZ: -20.0 },
  floorY: -0.4,                                         // dug deeper so a full-height door + lintel fits under the house floor
};

// ------------------------------------------------------------------- helpers
export function canvasTexture(draw, w = 512, h = 256) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A physical sign board. Text is baked into the FRONT face at a resolution that
// keeps letters a fixed WORLD size (capH / titleCapH, in metres) regardless of
// the board's width, and vertically centred as one measured block. The board has
// real thickness with plain dark-wood back/edges, so it never vanishes when seen
// from behind (old single-sided planes did). Front face is +z, as before.
export function makeSign(lines, opts = {}) {
  const {
    w = 2.2, h = 1.1, bg = '#4a3a28', fg = '#ded5b8', title = null,
    capH = 0.055, titleCapH = 0.10, thickness = 0.05,
  } = opts;
  const ppm = Math.min(360, 1024 / w);                     // px/metre; keep canvas <= 1024 wide
  const W = Math.round(w * ppm), H = Math.round(h * ppm);
  const bodyPx = Math.max(10, Math.round(capH * ppm));
  const titlePx = Math.round(titleCapH * ppm);
  const lineH = Math.round(bodyPx * 1.35);
  const tex = canvasTexture((c) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = Math.max(4, Math.round(H * 0.03));
    c.strokeRect(5, 5, W - 10, H - 10);
    for (let i = 0; i < 900; i++) {                        // wood grain noise
      c.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      c.fillRect(Math.random() * W, Math.random() * H, Math.random() * 24, 1.5);
    }
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const titleBlock = title ? Math.round(titlePx * 1.5) : 0;
    const blockH = titleBlock + lines.length * lineH;      // total text height
    let y = Math.round((H - blockH) / 2 + (title ? titlePx : bodyPx));
    if (title) {
      c.font = `700 ${titlePx}px Georgia`;
      c.fillText(title, W / 2, y); y += titleBlock;
    }
    c.font = `400 ${bodyPx}px "Courier New", monospace`;
    for (const ln of lines) { c.fillText(ln, W / 2, y); y += lineH; }
  }, W, H);
  const boardMat = new THREE.MeshLambertMaterial({ map: tex });
  const woodMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(bg).multiplyScalar(0.6) });
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z. Front (+z) = text; rest = wood.
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, thickness),
    [woodMat, woodMat, woodMat, woodMat, boardMat, woodMat]
  );
  return mesh;
}

// ------------------------------------------------- procedural material library
const texCache = {};
function cachedTex(key, w, h, draw) {
  if (!texCache[key]) {
    const t = canvasTexture(draw, w, h);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache[key] = t;
  }
  return texCache[key];
}

// ---- shared wind: a single uTime uniform drives a cheap vertex-shader sway on
// grass and foliage cards. Displacement scales with local height so blade/leaf
// tips move while bases stay planted; per-instance phase comes from the
// instance's world position (instanceMatrix translation).
const windTime = { value: 0 };
function applyWind(mat, amp, hMax) {
  const A = amp.toFixed(3), Az = (amp * 0.6).toFixed(3), HM = hMax.toFixed(2);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wseed = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
      #else
        vec2 wseed = vec2(0.0);
      #endif
      float wph = wseed.x * 0.35 + wseed.y * 0.42;
      float wh = min(max(position.y, 0.0), ${HM});
      float wsw = sin(uWindTime * 1.1 + wph) + 0.4 * sin(uWindTime * 2.3 + wph * 1.7);
      transformed.x += wsw * wh * ${A};
      transformed.z += cos(uWindTime * 0.9 + wph * 1.3) * wh * ${Az};
      `);
  };
  mat.customProgramCacheKey = () => 'veg-wind-' + A + '-' + HM;
}

// Forest-floor albedo: a warm-neutral base (vertex colors tint it grass/soil/
// path) carrying dense turf speckle, soil flecks, scattered pebbles and fallen
// needle/leaf litter. Multiplies with the terrain vertex colors.
export function groundDetailTex() {
  return cachedTex('ground', 512, 512, (c, W, H) => {
    c.fillStyle = '#bab9ad'; c.fillRect(0, 0, W, H);
    // broad tonal blotches: patches of mud vs mossier turf
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 40 + Math.random() * 130;
      const g = c.createRadialGradient(x, y, 4, x, y, r);
      const dark = Math.random() > 0.5;
      const col = dark ? '66,60,46' : '138,146,110';
      g.addColorStop(0, `rgba(${col},${(dark ? 0.03 : 0.05) + Math.random() * 0.08})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // fine turf: thousands of tiny green-ish blades so bare ground reads as grass
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const a = Math.random() * Math.PI * 2, l = 2 + Math.random() * 6;
      const g1 = 88 + Math.random() * 78;
      c.strokeStyle = `rgba(${(g1 * 0.6) | 0},${g1 | 0},${(g1 * 0.5) | 0},${0.09 + Math.random() * 0.17})`;
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    // dark soil flecks
    for (let i = 0; i < 2200; i++) {
      c.fillStyle = `rgba(34,29,21,${0.05 + Math.random() * 0.12})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // pebbles: lit crown + shaded rim
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * W, y = Math.random() * H, rx = 2 + Math.random() * 6, ry = rx * (0.6 + Math.random() * 0.4);
      const t = 0.55 + Math.random() * 0.45;
      const g = c.createRadialGradient(x - rx * 0.3, y - ry * 0.3, 0.5, x, y, rx);
      g.addColorStop(0, `rgba(${(196 * t) | 0},${(190 * t) | 0},${(172 * t) | 0},0.9)`);
      g.addColorStop(1, `rgba(${(118 * t) | 0},${(112 * t) | 0},${(100 * t) | 0},0.45)`);
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, Math.random() * 3, 0, 7); c.fill();
      c.strokeStyle = 'rgba(18,16,12,.28)'; c.lineWidth = 0.7; c.stroke();
    }
    // litter: thin brown needles / twigs
    for (let i = 0; i < 460; i++) {
      const x = Math.random() * W, y = Math.random() * H, a = Math.random() * Math.PI * 2, l = 6 + Math.random() * 18;
      c.strokeStyle = `rgba(${(88 + Math.random() * 44) | 0},${(62 + Math.random() * 30) | 0},${(36 + Math.random() * 20) | 0},${0.1 + Math.random() * 0.18})`;
      c.lineWidth = 0.8 + Math.random();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
  });
}

// Grayscale height for the ground bumpMap: rolling lumps, raised pebbles,
// recessed cracks + fine grain. Gives the flashlit ground real per-pixel relief.
export function groundBumpTex() {
  return cachedTex('groundBump', 512, 512, (c, W, H) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 24; i++) {   // gentle, wide undulation (no hard dark discs)
      const x = Math.random() * W, y = Math.random() * H, r = 60 + Math.random() * 120;
      const g = c.createRadialGradient(x, y, 2, x, y, r);
      const up = Math.random() > 0.5;
      g.addColorStop(0, up ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 320; i++) {              // raised pebbles
      const x = Math.random() * W, y = Math.random() * H, r = 2 + Math.random() * 6;
      const g = c.createRadialGradient(x, y, 0.5, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.65, 'rgba(160,160,160,0.4)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    for (let i = 0; i < 1100; i++) {             // recessed cracks / divots
      c.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.2})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 3);
    }
    for (let i = 0; i < 3400; i++) {             // fine grain
      const x = Math.random() * W, y = Math.random() * H, a = Math.random() * Math.PI * 2, l = 2 + Math.random() * 5;
      const b = Math.random() > 0.5 ? 210 : 46;
      c.strokeStyle = `rgba(${b},${b},${b},0.06)`;
      c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
  });
}

export function plasterTex() {
  return cachedTex('plaster', 256, 256, (c, W, H) => {
    c.fillStyle = '#f5f4ee'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 2400; i++) {
      c.fillStyle = `rgba(90,88,78,${0.03 + Math.random() * 0.05})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
    }
    for (let i = 0; i < 10; i++) {          // weather streaks
      c.fillStyle = 'rgba(70,72,64,.045)';
      c.fillRect(Math.random() * W, 0, 2 + Math.random() * 6, H);
    }
    for (let i = 0; i < 5; i++) {           // hairline cracks
      c.strokeStyle = 'rgba(50,48,42,.14)'; c.lineWidth = 1;
      c.beginPath();
      let x = Math.random() * W, y = Math.random() * H * 0.4;
      c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 26; y += 12 + Math.random() * 22; c.lineTo(x, y); }
      c.stroke();
    }
  });
}

export function planksTex(hex) {
  return cachedTex('planks' + hex, 256, 256, (c, W, H) => {
    const base = new THREE.Color(hex);
    const boards = 6, bw = W / boards;
    for (let b = 0; b < boards; b++) {
      const shade = 0.82 + Math.random() * 0.36;
      c.fillStyle = `rgb(${base.r * 255 * shade | 0},${base.g * 255 * shade | 0},${base.b * 255 * shade | 0})`;
      c.fillRect(b * bw, 0, bw, H);
      for (let i = 0; i < 26; i++) {         // grain
        c.fillStyle = `rgba(20,12,6,${0.05 + Math.random() * 0.08})`;
        c.fillRect(b * bw + 2 + Math.random() * (bw - 4), Math.random() * H, 1 + Math.random() * 2, 10 + Math.random() * 60);
      }
      c.fillStyle = 'rgba(0,0,0,.5)';
      c.fillRect(b * bw, 0, 2, H);            // board gap
      c.fillStyle = 'rgba(255,230,190,.06)';
      c.fillRect(b * bw + 2, 0, 2, H);        // catch-light edge
      for (const ny of [0.12, 0.88]) {        // nails
        c.fillStyle = 'rgba(15,12,10,.6)';
        c.beginPath(); c.arc(b * bw + bw / 2, ny * H + (Math.random() - 0.5) * 8, 1.6, 0, 7); c.fill();
      }
    }
  });
}

export function shinglesTex() {
  return cachedTex('shingles', 256, 256, (c, W, H) => {
    c.fillStyle = '#343a40'; c.fillRect(0, 0, W, H);
    const rh = 32, sw = 42;
    for (let y = 0; y < H; y += rh) {
      const off = (y / rh) % 2 ? sw / 2 : 0;
      for (let x = -sw; x < W + sw; x += sw) {
        const shade = 0.78 + Math.random() * 0.4;
        c.fillStyle = `rgb(${52 * shade | 0},${58 * shade | 0},${66 * shade | 0})`;
        c.fillRect(x + off + 1, y + 1, sw - 2, rh - 2);
        c.fillStyle = 'rgba(0,0,0,.4)';
        c.fillRect(x + off, y + rh - 3, sw, 3);   // shadow under the course
      }
    }
  });
}

export function stoneTex() {
  return cachedTex('stone', 256, 256, (c, W, H) => {
    c.fillStyle = '#4a4e4a'; c.fillRect(0, 0, W, H);   // grout
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const rx = 14 + Math.random() * 26, ry = 10 + Math.random() * 16;
      const shade = 0.8 + Math.random() * 0.5;
      c.fillStyle = `rgb(${125 * shade | 0},${128 * shade | 0},${124 * shade | 0})`;
      c.beginPath(); c.ellipse(x, y, rx, ry, Math.random() * 3, 0, 7); c.fill();
      c.strokeStyle = 'rgba(20,22,20,.4)'; c.lineWidth = 2;
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,.05)';
      c.beginPath(); c.ellipse(x - rx * 0.2, y - ry * 0.3, rx * 0.5, ry * 0.4, 0, 0, 7); c.fill();
    }
  });
}

// Natural weathered granite: mineral speckle, hairline cracks, and patches of
// lichen/moss. Near-white so it multiplies with the rock's vertex colours.
export function rockTex() {
  return cachedTex('rock', 256, 256, (c, W, H) => {
    c.fillStyle = '#8b8f8c'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {                     // broad tonal banding
      const g = c.createLinearGradient(0, 0, W, H);
      const a = 0.04 + Math.random() * 0.05;
      g.addColorStop(0, `rgba(120,124,118,${a})`); g.addColorStop(1, 'rgba(150,152,146,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 5200; i++) {                  // mineral grains
      const v = Math.random();
      const b = v > 0.6 ? 200 + Math.random() * 45 : 60 + Math.random() * 70;
      c.fillStyle = `rgba(${b | 0},${(b * 0.99) | 0},${(b * 0.93) | 0},${0.12 + Math.random() * 0.22})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
    }
    for (let i = 0; i < 22; i++) {                    // cracks / fractures
      c.strokeStyle = `rgba(24,26,24,${0.2 + Math.random() * 0.3})`;
      c.lineWidth = 0.7 + Math.random() * 1.4;
      c.beginPath();
      let x = Math.random() * W, y = Math.random() * H;
      c.moveTo(x, y);
      const steps = 3 + (Math.random() * 4 | 0);
      for (let k = 0; k < steps; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; c.lineTo(x, y); }
      c.stroke();
    }
    for (let i = 0; i < 26; i++) {                    // lichen / moss blotches
      const x = Math.random() * W, y = Math.random() * H, r = 6 + Math.random() * 26;
      const g = c.createRadialGradient(x, y, 1, x, y, r);
      const moss = Math.random() > 0.4 ? '108,120,74' : '150,150,120';
      g.addColorStop(0, `rgba(${moss},${0.14 + Math.random() * 0.2})`); g.addColorStop(1, `rgba(${moss},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
  });
}

// Grayscale relief for the rock bumpMap: coarse grain plus recessed cracks.
export function rockBumpTex() {
  return cachedTex('rockBump', 256, 256, (c, W, H) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 4200; i++) {                  // grain
      const b = Math.random() > 0.5 ? 200 : 55;
      c.fillStyle = `rgba(${b},${b},${b},0.1)`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 22; i++) {                    // deep cracks (dark = recessed)
      c.strokeStyle = `rgba(0,0,0,${0.35 + Math.random() * 0.35})`;
      c.lineWidth = 1 + Math.random() * 2.5;
      c.beginPath();
      let x = Math.random() * W, y = Math.random() * H;
      c.moveTo(x, y);
      const steps = 3 + (Math.random() * 4 | 0);
      for (let k = 0; k < steps; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; c.lineTo(x, y); }
      c.stroke();
    }
  });
}

export function barkTex() {
  return cachedTex('bark', 128, 256, (c, W, H) => {
    c.fillStyle = '#cfc9bf'; c.fillRect(0, 0, W, H);   // near-white: multiplies with vertex color
    for (let i = 0; i < 60; i++) {                     // vertical bark fissures
      const x = Math.random() * W, w = 1 + Math.random() * 3, l = 30 + Math.random() * 140;
      const y = Math.random() * H;
      c.fillStyle = `rgba(40,26,18,${0.15 + Math.random() * 0.25})`;
      c.fillRect(x, y, w, l);
      c.fillStyle = 'rgba(255,240,220,.10)';
      c.fillRect(x + w, y, 1, l);
    }
    for (let i = 0; i < 10; i++) {                     // peeling patches (arrayán!)
      c.fillStyle = `rgba(255,225,190,${0.1 + Math.random() * 0.12})`;
      const x = Math.random() * W, y = Math.random() * H;
      c.beginPath(); c.ellipse(x, y, 4 + Math.random() * 9, 10 + Math.random() * 24, 0, 0, 7); c.fill();
    }
  });
}

// Broadleaf cluster (arrayán / bushes): a soft dark underlay fills the gaps so
// the card reads as a dense clump of small leaves, ragged at the edges.
export function leafTex() {
  return cachedTex('leaf', 192, 192, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const ug = c.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, W * 0.5);
    ug.addColorStop(0, 'rgba(26,44,32,0.6)');
    ug.addColorStop(0.7, 'rgba(26,44,32,0.26)');
    ug.addColorStop(1, 'rgba(26,44,32,0)');
    c.fillStyle = ug; c.fillRect(0, 0, W, H);
    const cols = ['#3d5844', '#2c4434', '#4c6a50', '#243828', '#55704f', '#5f7b52'];
    for (let i = 0; i < 330; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.55) * W * 0.46;
      const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r;
      c.save(); c.translate(x, y); c.rotate(Math.random() * Math.PI);
      c.fillStyle = Math.random() > 0.93 ? '#6e5238' : cols[(Math.random() * cols.length) | 0];
      c.globalAlpha = 0.7 + Math.random() * 0.3;
      c.beginPath(); c.ellipse(0, 0, 2.4 + Math.random() * 4.2, 4.4 + Math.random() * 6.5, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(184,204,152,0.12)'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(0, -5); c.lineTo(0, 5); c.stroke();
      c.restore();
    }
    c.globalAlpha = 1;
  });
}

// Conifer branch spray: needles fanning forward-and-out from a central twig,
// over a soft dark underlay. Cards are elongated so they read as drooping
// branches, not flat blobs.
export function needleTex() {
  return cachedTex('needle', 256, 160, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cols = ['#223a29', '#1a2f21', '#2f4a34', '#243d29', '#38553b', '#43613f'];
    const spineY = H * 0.5, x0 = 12, x1 = W - 10;
    for (let i = 0; i < 44; i++) {            // dark underlay along the twig
      const t = Math.random(), x = x0 + t * (x1 - x0);
      const r = 10 + Math.random() * 22 * (1 - t * 0.5);
      const g = c.createRadialGradient(x, spineY, 1, x, spineY, r);
      g.addColorStop(0, 'rgba(20,34,24,0.5)'); g.addColorStop(1, 'rgba(20,34,24,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, spineY, r, 0, 7); c.fill();
    }
    for (let s = 0; s < 72; s++) {            // needles
      const t = s / 72, sx = x0 + t * (x1 - x0);
      const nl = 34 * (1 - t * 0.55) + 6, per = 4;
      for (let k = 0; k < per; k++) {
        const splay = (k < per / 2 ? -1 : 1) * (0.3 + Math.random() * 0.78);
        const ex = sx + Math.cos(splay) * nl * (0.7 + Math.random() * 0.5);
        const ey = spineY + Math.sin(splay) * nl;
        c.strokeStyle = cols[(Math.random() * cols.length) | 0];
        c.globalAlpha = 0.72 + Math.random() * 0.28;
        c.lineWidth = 1 + Math.random() * 1.3;
        c.beginPath(); c.moveTo(sx, spineY); c.lineTo(ex, ey); c.stroke();
      }
    }
    c.globalAlpha = 1;
  });
}

// A dense tuft of tapered blades rooted at the bottom edge (v=1 → ground).
export function grassTex() {
  return cachedTex('grass', 256, 256, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cols = ['#3c5a40', '#31492f', '#4d6a4c', '#41603f', '#5a7a4e', '#496a3c'];
    const dry = ['#7d7a45', '#8a7c48', '#6f6a3c'];
    for (let i = 0; i < 72; i++) {
      const x0 = 10 + Math.random() * (W - 20);
      const bh = 95 + Math.random() * 150;
      const lean = (Math.random() - 0.5) * 95;
      const isDry = Math.random() > 0.83;
      const col = isDry ? dry[(Math.random() * dry.length) | 0] : cols[(Math.random() * cols.length) | 0];
      const bw = 3 + Math.random() * 4;
      const tipx = x0 + lean, tipy = H - bh;
      const midx = x0 + lean * 0.4, midy = H - bh * 0.55;
      c.fillStyle = col;
      c.globalAlpha = 0.78 + Math.random() * 0.22;
      c.beginPath();
      c.moveTo(x0 - bw / 2, H);
      c.quadraticCurveTo(midx - bw * 0.3, midy, tipx, tipy);
      c.quadraticCurveTo(midx + bw * 0.3, midy, x0 + bw / 2, H);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(202,222,172,0.1)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x0, H); c.quadraticCurveTo(midx, midy, tipx, tipy); c.stroke();
    }
    c.globalAlpha = 1;
  });
}

export function fogTex() {
  return cachedTex('fogpuff', 128, 128, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(200,214,220,.55)');
    g.addColorStop(0.5, 'rgba(190,205,212,.22)');
    g.addColorStop(1, 'rgba(190,205,212,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
}

export function beamTex() {
  // canvas y=0 maps to v=1 (cone apex, at the lamp): strong there, gone at the far base
  return cachedTex('beam', 64, 256, (c, W, H) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,244,224,.5)');
    g.addColorStop(0.35, 'rgba(255,244,224,.18)');
    g.addColorStop(0.7, 'rgba(255,244,224,.05)');
    g.addColorStop(1, 'rgba(255,244,224,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
}

export function shutterTex() {
  return cachedTex('shutter', 128, 256, (c, W, H) => {
    c.fillStyle = '#2c4839'; c.fillRect(0, 0, W, H);
    for (let y = 10; y < H - 10; y += 13) {   // louver slats
      c.fillStyle = 'rgba(0,0,0,.38)'; c.fillRect(8, y, W - 16, 5);
      c.fillStyle = 'rgba(190,220,200,.10)'; c.fillRect(8, y + 5, W - 16, 2);
    }
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 6;
    c.strokeRect(3, 3, W - 6, H - 6);
  });
}

// displace vertices radially by a position-hash (crack-free on non-indexed geometry)
function displace(geo, amp, freq = 2.6) {
  const p = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const h =
      Math.sin(v.x * freq + 1.7) * Math.sin(v.y * freq * 1.31 + 4.2) * Math.sin(v.z * freq * 0.77 + 2.1) * 0.6 +
      Math.sin(v.x * freq * 3.7) * Math.sin(v.z * freq * 3.1) * 0.4;
    v.multiplyScalar(1 + h * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function vertColored(geo, hex, jitter = 0) {
  // Normalize to non-indexed so heterogeneous parts (indexed cylinders +
  // non-indexed icosahedra) can be merged without attribute mismatch.
  if (geo.index) geo = geo.toNonIndexed();
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = 1 + (Math.random() - 0.5) * jitter;
    arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function xform(geo, px, py, pz, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(s, s, s)
  );
  geo.applyMatrix4(m);
  return geo;
}

// -------------------------------------------------------------------- trees
// Trees are built as PARTS (trunk / solid foliage / alpha leaf-cards) so each
// part gets the right material; all parts of one instance share a matrix.

function leafCardsGeo(rand, count, cx, cy, cz, spreadXZ, spreadY, size) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    const w = size * (0.8 + rand() * 0.6);
    const card = new THREE.PlaneGeometry(w, w * (0.75 + rand() * 0.4));
    xform(card,
      cx + (rand() - 0.5) * spreadXZ,
      cy + (rand() - 0.5) * spreadY,
      cz + (rand() - 0.5) * spreadXZ,
      (rand() - 0.5) * 1.2, rand() * Math.PI * 2, (rand() - 0.5) * 1.2);
    cards.push(card);
  }
  return mergeGeometries(cards);
}

function buildArrayan(rand) {
  const trunkParts = [], coreParts = [];
  let x = 0, y = 0, z = 0;
  let dirA = rand() * Math.PI * 2;
  let tilt = 0.1 + rand() * 0.22;
  const tip = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    const len = 1.15 - i * 0.15;
    const r0 = 0.17 * (1 - i * 0.19);
    const r1 = Math.max(0.035, 0.17 * (1 - (i + 1) * 0.19));
    const seg = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
    seg.translate(0, len / 2, 0);
    const e = new THREE.Euler(Math.sin(dirA) * tilt, 0, Math.cos(dirA) * tilt);
    seg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
    seg.translate(x, y, z);
    trunkParts.push(vertColored(seg, i < 2 ? PAL.arrTrunk : 0xc27b4a, 0.2));
    tip.set(0, len, 0).applyEuler(e);
    x += tip.x; y += tip.y; z += tip.z;
    dirA += (rand() - 0.5) * 1.3;
    tilt += (rand() - 0.5) * 0.24;
  }
  // root flare
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const root = new THREE.CylinderGeometry(0.03, 0.1, 0.55, 5, 1);
    xform(root, Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17, Math.cos(a) * 0.85, 0, -Math.sin(a) * 0.85);
    trunkParts.push(vertColored(root, PAL.arrTrunk, 0.2));
  }
  // a few forking branches climbing into the crown + small dark inner masses
  const up = new THREE.Vector3(0, 1, 0);
  const crownPts = [];
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2, reach = 0.6 + rand() * 1.5;
    const bx = x + Math.cos(a) * reach, by = y + 0.3 + rand() * 1.1, bz = z + Math.sin(a) * reach;
    crownPts.push([bx, by, bz]);
    const from = new THREE.Vector3(x * 0.85, y * 0.9, z * 0.85);
    const d = new THREE.Vector3(bx, by, bz).sub(from);
    const br = new THREE.CylinderGeometry(0.02, 0.06, d.length(), 5, 1);
    br.translate(0, d.length() / 2, 0);
    br.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize())));
    br.translate(from.x, from.y, from.z);
    trunkParts.push(vertColored(br, i < 3 ? PAL.arrTrunk : 0xc27b4a, 0.2));
  }
  for (let i = 0; i < 2; i++) {                          // small dark interior mass
    const r = 0.45 + rand() * 0.3;
    const b = displace(new THREE.IcosahedronGeometry(r, 1), 0.3, 2.4 + rand());
    b.translate(x + (rand() - 0.5) * 1.2, y + 0.5 + rand() * 0.7, z + (rand() - 0.5) * 1.2);
    coreParts.push(vertColored(b, 0x1a2a20, 0.25));
  }
  // dense broadleaf crown: leaf cards over the whole canopy volume + at the
  // branch tips, so it reads as foliage rather than a lollipop sphere
  const cardParts = [leafCardsGeo(rand, 26, x, y + 0.75, z, 3.1, 2.4, 1.7)];
  for (const [bx, by, bz] of crownPts)
    cardParts.push(leafCardsGeo(rand, 5, bx, by + 0.2, bz, 1.3, 1.0, 1.2));
  return {
    trunk: mergeGeometries(trunkParts),
    core: mergeGeometries(coreParts),
    cards: mergeGeometries(cardParts),
  };
}

function buildPine(rand) {
  const h = 6.5 + rand() * 3.5;
  const trunk = new THREE.CylinderGeometry(0.07, 0.26, h, 7, 1);
  trunk.translate(0, h / 2, 0);
  const trunkG = vertColored(trunk, PAL.pineTrunk, 0.22);

  // a single ragged dark cone as the inner shadow mass so the canopy isn't
  // see-through; the silhouette itself is made by the needle branches
  const cone = displace(new THREE.ConeGeometry(1.15, h * 0.74, 8, 3), 0.16, 3.0);
  cone.translate(0, h * 0.52, 0);
  const core = vertColored(cone, 0x162419, 0.2);

  // needle-spray branch cards arranged in whorls: wide, drooping at the bottom,
  // shrinking to a crown tuft. Each branch is a separate card, so the outline
  // is broken and irregular rather than a smooth geometric cone.
  const cards = [];
  const base = h * 0.22, top = h * 0.99, tiers = 10;
  for (let ti = 0; ti < tiers; ti++) {
    const tt = ti / (tiers - 1);
    const y = base + tt * (top - base);
    const rad = 2.2 * (1 - tt * 0.82) + 0.16;
    const perTier = Math.max(3, Math.round(7 * (1 - tt * 0.55)));
    for (let b = 0; b < perTier; b++) {
      const a = (b / perTier) * Math.PI * 2 + rand() * 0.7 + ti * 0.8;
      const len = rad * (0.95 + rand() * 0.55);
      const card = new THREE.PlaneGeometry(len, len * 0.6);
      card.translate(len * 0.5, 0, 0);           // inner edge at the trunk
      const droop = 0.3 + rand() * 0.35 - tt * 0.15;
      xform(card, 0, y, 0, (rand() - 0.5) * 0.35, a, -droop);
      cards.push(card);
    }
  }
  const crown = new THREE.PlaneGeometry(1.0, 1.3);
  crown.translate(0, 0.55, 0);
  xform(crown, 0, top - 0.35, 0, 0, rand() * 6.28, 0);
  cards.push(crown);

  return { trunk: trunkG, core, needles: mergeGeometries(cards) };
}

function buildBush(rand) {
  const lobes = [];
  const nl = 2 + (rand() * 2 | 0);
  for (let i = 0; i < nl; i++) {
    const r = 0.26 + rand() * 0.26;
    const b = displace(new THREE.IcosahedronGeometry(r, 1), 0.3, 3);
    b.translate((rand() - 0.5) * 0.7, r * 0.55 + rand() * 0.2, (rand() - 0.5) * 0.7);
    lobes.push(vertColored(b, 0x1c2e23, 0.3));
  }
  const cards = leafCardsGeo(rand, 13, 0, 0.44, 0, 1.15, 0.7, 0.9);
  return { core: mergeGeometries(lobes), cards };
}

// A tuft: a fan of tapered-blade cards rooted at the ground (pivot at the base
// so the wind sway pivots there and the tips catch the breeze).
function buildGrass(rand) {
  const cards = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const w = 0.42 + rand() * 0.28, hgt = 0.44 + rand() * 0.32;
    const ry = (i / n) * Math.PI + rand() * 0.5;
    const card = new THREE.PlaneGeometry(w, hgt);
    card.translate(0, hgt / 2, 0);
    xform(card, (rand() - 0.5) * 0.26, 0.0, (rand() - 0.5) * 0.26,
      (rand() - 0.5) * 0.14, ry, (rand() - 0.5) * 0.14);
    cards.push(card);
  }
  return { cards: mergeGeometries(cards) };
}

// Vertex-colour a rock: near-white base (so the granite map shows through) with
// grain jitter, moss greening the upward faces, and crevices reading darker.
function colorRock(geo) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
  const moss = new THREE.Color(0x66713f), c = new THREE.Color();
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const up = Math.max(0, nrm.getY(i));
    const mossK = Math.pow(up, 2.2) * (0.35 + Math.random() * 0.5);   // moss favours flat tops
    // dark slate base so the flashlit stone doesn't read as pale concrete;
    // downward faces darken (crevice occlusion)
    const shade = 0.5 + 0.22 * up;
    c.setRGB(shade, shade * 1.02, shade).lerp(moss, mossK * 0.5);
    c.multiplyScalar(0.82 + Math.random() * 0.36);    // mineral grain jitter
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// An irregular half-buried boulder: a strongly, multi-octave-displaced core with
// a couple of smaller lumps fused on, so it reads as jagged weathered stone
// rather than a smooth faceted ball.
function buildRock(rand) {
  const parts = [];
  const core = displace(new THREE.IcosahedronGeometry(0.8, 2), 0.42, 1.6);
  displace(core, 0.2, 3.1);                           // mid crags
  displace(core, 0.1, 6.2);                           // fine chips
  core.scale(1, 0.82 + rand() * 0.16, 1);             // upright-ish boulder
  parts.push(core);
  const nl = 2 + (rand() * 2 | 0);
  for (let i = 0; i < nl; i++) {
    const r = 0.3 + rand() * 0.28;
    const lump = displace(new THREE.IcosahedronGeometry(r, 2), 0.4, 2.9);
    displace(lump, 0.14, 6.0);
    const a = rand() * Math.PI * 2, d = 0.4 + rand() * 0.4;
    lump.scale(1, 0.85, 1);
    lump.translate(Math.cos(a) * d, -0.05 + rand() * 0.28, Math.sin(a) * d);
    parts.push(lump);
  }
  return colorRock(mergeGeometries(parts));
}

// materials shared by vegetation parts
function vegMaterials() {
  const trunkMat = new THREE.MeshLambertMaterial({
    vertexColors: true, map: barkTex(), bumpMap: barkTex(), bumpScale: 0.05,
  });
  const coreMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const cardMat = new THREE.MeshLambertMaterial({
    map: leafTex(), alphaTest: 0.42, side: THREE.DoubleSide,
  });
  const needleMat = new THREE.MeshLambertMaterial({
    map: needleTex(), alphaTest: 0.4, side: THREE.DoubleSide,
  });
  const grassMat = new THREE.MeshLambertMaterial({
    map: grassTex(), alphaTest: 0.36, side: THREE.DoubleSide,
  });
  const rockMat = new THREE.MeshLambertMaterial({
    vertexColors: true, map: rockTex(), bumpMap: rockBumpTex(), bumpScale: 0.09,
  });
  applyWind(cardMat, 0.03, 3.5);       // leaf canopies sway; tips move most
  applyWind(needleMat, 0.03, 3.5);
  applyWind(grassMat, 0.14, 1.0);      // blades sway more relative to height
  return { trunkMat, coreMat, cardMat, needleMat, grassMat, rockMat };
}

// Scatter a multi-part template: one InstancedMesh per part, shared matrices.
function scatterParts(scene, colliders, parts, opts) {
  const { count, place, sMin, sMax, collide, rand, sink = 0, tint = null, shadows = true } = opts;
  const meshes = parts.map((p) => {
    const m = new THREE.InstancedMesh(p.geo, p.mat, count);
    m.castShadow = shadows && p.shadow !== false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    if (p.mat.alphaTest > 0) {
      m.customDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking, map: p.mat.map, alphaTest: p.mat.alphaTest,
      });
    }
    return m;
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const tintC = new THREE.Color();
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 60) {
    const p = place();
    if (!p) continue;
    const s = sMin + rand() * (sMax - sMin);
    q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0));
    v.set(p.x, p.y - sink * s, p.z);
    sc.set(s, s * (0.9 + rand() * 0.25), s);
    m4.compose(v, q, sc);
    for (const m of meshes) m.setMatrixAt(placed, m4);
    if (tint) {
      const k = 0.78 + rand() * 0.4;
      tintC.setRGB(k, k * (0.94 + rand() * 0.12), k);
      for (const m of meshes) if (m.material.alphaTest > 0) m.setColorAt(placed, tintC);
    }
    if (collide && colliders) colliders.addCircle(p.x, p.z, collide * s);
    placed++;
  }
  for (const m of meshes) {
    m.count = placed;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
  }
  return meshes;
}

// ================================================================== buildWorld
export function buildWorld(scene, colliders) {
  const rand = mulberry(20260706);
  scene.fog = new THREE.FogExp2(PAL.fog, TUNE.fogDensity);
  scene.background = new THREE.Color(PAL.fog);

  // ---- lights
  const moonDirV = new THREE.Vector3(0.3, 0.45, 0.84).normalize();
  const dir = new THREE.DirectionalLight(PAL.moonDirColor, 0.55);
  dir.position.copy(moonDirV.clone().multiplyScalar(120));
  scene.add(dir);
  const ambientLight = new THREE.AmbientLight(PAL.ambient, 0.28);
  scene.add(ambientLight);
  scene.add(new THREE.HemisphereLight(0x2c3d47, 0x151d18, 0.34));

  // ---- sky dome
  const skyUniforms = {
    top: { value: new THREE.Color(PAL.skyZenith) },
    bottom: { value: new THREE.Color(PAL.skyHorizon) },
    uMoonDir: { value: moonDirV },
    uTime: { value: 0 },
    uVeil: { value: 1.0 },   // Night-Engine tide nudges the cloud veil a touch at peaks
    // c1 · dawn: a warm first-light band that swells on the lake horizon as the
    // night's phase → 1. Driven by world.setNightPhase; 0 all night, then builds.
    uDawn: { value: 0 },
    uDawnDir: { value: new THREE.Vector3(0.15, 0, 1).normalize() },  // over the lake (south, +z)
    uDawnCol: { value: new THREE.Color(0x8a6650) },                  // muted warm ash — first light
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: skyUniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top, bottom, uMoonDir, uDawnDir, uDawnCol; uniform float uTime, uVeil, uDawn; varying vec3 vDir;
        float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float vnoise(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
        }
        float fbm(vec2 p){ return vnoise(p)*0.55 + vnoise(p*2.17+7.3)*0.28 + vnoise(p*4.4+3.1)*0.17; }
        // twinkling star points in a hashed grid; uv should be a low-distortion sky mapping
        vec3 stars(vec2 uv, float scale, float thresh, float bright){
          vec2 sp = uv * scale;
          vec2 cell = floor(sp);
          float rnd = hash(cell);
          vec2 off = vec2(hash(cell + 1.7), hash(cell + 9.3)) * 0.6 + 0.2;
          float d = length(fract(sp) - off);
          float size = 0.015 + 0.028 * hash(cell + 4.1);
          float core = smoothstep(size, size * 0.15, d) * step(thresh, rnd);
          float tw = 0.55 + 0.45 * sin(uTime * (0.3 + hash(cell + 2.2) * 1.4) + rnd * 41.0);
          vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.92, 0.80), step(0.82, hash(cell + 6.6)));
          return core * tw * bright * tint;
        }
        void main(){
          float t = smoothstep(-0.04, 0.42, vDir.y);
          vec3 col = mix(bottom, top, t);
          // horizon glow, strongest under the moon's azimuth
          vec2 azV = normalize(vDir.xz + 1e-5), azM = normalize(uMoonDir.xz);
          float az = max(dot(azV, azM), 0.0);
          float hg = pow(1.0 - clamp(vDir.y, 0.0, 1.0), 6.0);
          col += vec3(0.05, 0.075, 0.085) * hg * (0.35 + 0.65 * az * az * az);
          // stars on an octahedral mapping (even density, no horizon smearing)
          vec2 uv = vDir.xz / (abs(vDir.x) + abs(vDir.y) + abs(vDir.z));
          float horizonFade = smoothstep(0.03, 0.28, vDir.y);
          float moonMask = 1.0 - smoothstep(0.965, 0.996, dot(vDir, uMoonDir));
          vec3 st = stars(uv, 23.0, 0.90, 1.1) + stars(uv + 3.7, 47.0, 0.86, 0.45);
          // thin high clouds drift past and swallow stars
          float veil = smoothstep(0.45, 0.85, fbm(uv * 2.4 + vec2(uTime * 0.006, uTime * 0.004)));
          vec3 cloudCol = mix(bottom, top, 0.4) + vec3(0.020, 0.028, 0.032) * (0.4 + 0.6 * az);
          col = mix(col, cloudCol, veil * 0.35 * uVeil * smoothstep(0.02, 0.30, vDir.y));
          // stars fade out as first light comes up
          col += st * horizonFade * moonMask * (1.0 - veil * 0.85) * (1.0 - uDawn * 0.9);
          // c1 · dawn: a warm glow swelling on the horizon toward first light,
          // strongest along the dawn azimuth (over the lake), plus a gentle lift
          // of the whole low sky. Zero all night; builds only as phase → 1.
          vec2 azD = normalize(uDawnDir.xz);
          float azd = max(dot(azV, azD), 0.0);
          float hband = pow(1.0 - clamp(vDir.y, 0.0, 1.0), 3.5);
          float dawnGlow = hband * (0.30 + 0.70 * azd * azd);
          col = mix(col, uDawnCol, uDawn * dawnGlow * 0.75);
          col += uDawnCol * uDawn * 0.05 * smoothstep(0.55, -0.05, vDir.y);
          // dither the gradient so it doesn't band
          col += (hash(gl_FragCoord.xy * 0.7) - 0.5) * 0.008;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // ---- moon (textured disc + halo, bloom-hot)
  const moonPos = moonDirV.clone().multiplyScalar(700);
  const moonTex = canvasTexture((c, W, H) => {
    const cx = W / 2, cy = H / 2, R = W / 2;
    const base = c.createRadialGradient(cx - R * 0.28, cy - R * 0.22, R * 0.1, cx, cy, R);
    base.addColorStop(0, '#fdfff6'); base.addColorStop(0.7, '#e9f0e6');
    base.addColorStop(0.93, '#c6d2cb'); base.addColorStop(1, '#a9b8b2');
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    const mare = (x, y, rx, ry, rot, a) => {
      c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, ry / rx);
      const g = c.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
      g.addColorStop(0, `rgba(97,113,116,${a})`); g.addColorStop(1, 'rgba(97,113,116,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
    };
    mare(W * 0.38, H * 0.33, 48, 36, 0.5, 0.62); mare(W * 0.63, H * 0.30, 34, 26, -0.3, 0.54);
    mare(W * 0.56, H * 0.57, 54, 40, 0.2, 0.48); mare(W * 0.30, H * 0.62, 30, 24, 0.9, 0.44);
    mare(W * 0.70, H * 0.52, 26, 22, 0.4, 0.40);
    const mrand = mulberry(77);
    for (let i = 0; i < 30; i++) {
      const a = mrand() * Math.PI * 2, r = Math.sqrt(mrand()) * R * 0.85;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, cr = 2 + mrand() * 7;
      const g = c.createRadialGradient(x - cr * 0.3, y - cr * 0.3, cr * 0.1, x, y, cr);
      g.addColorStop(0, 'rgba(72,86,90,0.34)'); g.addColorStop(0.75, 'rgba(122,136,136,0.15)'); g.addColorStop(1, 'rgba(235,242,238,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, cr, 0, 7); c.fill();
      c.strokeStyle = 'rgba(242,250,246,0.22)'; c.lineWidth = 0.8;
      c.beginPath(); c.arc(x, y, cr * 0.9, 0, 7); c.stroke();
    }
  }, 256, 256);
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(26, 48),
    new THREE.MeshBasicMaterial({ map: moonTex, color: new THREE.Color(PAL.moon).multiplyScalar(2.2), fog: false })
  );
  moon.position.copy(moonPos); moon.lookAt(0, 0, 0); moon.rotateZ(0.6);
  scene.add(moon);
  const haloTex = canvasTexture((c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(220,238,240,.55)'); g.addColorStop(0.4, 'rgba(190,215,225,.12)'); g.addColorStop(1, 'rgba(190,215,225,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, 256, 256);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false })
  );
  halo.position.copy(moonPos.clone().multiplyScalar(0.985)); halo.lookAt(0, 0, 0);
  scene.add(halo);

  // ---- mountain silhouettes (beyond the fog, pre-tinted)
  function ridge(dist, height, tint, seedOff, rot = 0) {
    const pts = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const x = (i / N - 0.5) * 1700;
      const y =
        Math.sin(i * 0.7 + seedOff) * 0.35 + Math.sin(i * 0.23 + seedOff * 2.1) * 0.75 +
        Math.sin(i * 1.7 + seedOff * 0.7) * 0.14;
      pts.push(new THREE.Vector2(x, Math.max(0.02, 0.55 + y * 0.45) * height));
    }
    const shape = new THREE.Shape();
    shape.moveTo(-850, -40);
    for (const p of pts) shape.lineTo(p.x, p.y);
    shape.lineTo(850, -40);
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: tint, fog: false })
    );
    mesh.position.set(Math.sin(rot) * dist, -8, Math.cos(rot) * dist);
    mesh.rotation.y = rot + Math.PI;
    scene.add(mesh);
  }
  const horizonC = new THREE.Color(PAL.skyHorizon);
  ridge(620, 150, horizonC.clone().multiplyScalar(0.82), 1.7, 0.15);        // across the lake
  ridge(500, 105, horizonC.clone().multiplyScalar(0.66), 4.2, -0.2);
  ridge(560, 130, horizonC.clone().multiplyScalar(0.74), 8.9, Math.PI * 0.55); // east
  ridge(560, 140, horizonC.clone().multiplyScalar(0.7), 6.3, -Math.PI * 0.5);  // west

  // ---- terrain
  const SIZE = 420, SEG = 168;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const pos = tGeo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(PAL.ground), cGrassD = new THREE.Color(PAL.groundDark),
    cPath = new THREE.Color(PAL.path), cRock = new THREE.Color(PAL.rock),
    cSand = new THREE.Color(0x4c4a3c), cBed = new THREE.Color(0x131a17);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const slope = Math.abs(groundHeight(x + 1.3, z) - h) + Math.abs(groundHeight(x, z + 1.3) - h);
    const mott = 0.82 + 0.36 * Math.abs(Math.sin(x * 0.31 + z * 0.17) * Math.sin(x * 0.05 - z * 0.11));
    tmp.copy(cGrass).lerp(cGrassD, clamp01(Math.sin(x * 0.083 + 1) * Math.sin(z * 0.071) * 0.5 + 0.5)).multiplyScalar(mott);
    tmp.lerp(cRock, smoothstep(0.55, 1.3, slope));
    if (z > LAYOUT.shoreZ - 9) tmp.lerp(cSand, smoothstep(LAYOUT.shoreZ - 9, LAYOUT.shoreZ - 1, z));
    if (h < 0.25) tmp.lerp(cBed, smoothstep(0.25, -1.2, h));
    const pd = distToPaths(x, z);
    if (pd < 2.6 && h > 0.1) tmp.lerp(cPath, (1 - smoothstep(1.1, 2.6, pd)) * 0.85);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // punch the cellar-areaway hole: drop every terrain triangle whose centroid
  // falls inside the (grid-aligned) hole rect, so the mesh has a clean square
  // opening the built stairwell shows through — no more terrain bridging over it.
  {
    const H = CELLAR.hole;
    const src = tGeo.index.array;
    const kept = [];
    for (let f = 0; f < src.length; f += 3) {
      const a = src[f], b = src[f + 1], c = src[f + 2];
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (cx > H.minX && cx < H.maxX && cz > H.minZ && cz < H.maxZ) continue; // remove
      kept.push(a, b, c);
    }
    tGeo.setIndex(kept);
  }
  tGeo.computeVertexNormals();
  const groundMap = groundDetailTex().clone();
  groundMap.repeat.set(120, 120);
  groundMap.needsUpdate = true;
  // bump repeats at a different scale than the albedo so neither the colour nor
  // the relief locks into an obvious tiling grid; gives the flashlit ground
  // real per-pixel bumpiness (pebbles, divots) instead of a flat sheet
  const groundBump = groundBumpTex().clone();
  groundBump.colorSpace = THREE.NoColorSpace;
  groundBump.repeat.set(72, 72);
  groundBump.needsUpdate = true;
  const terrain = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({
    vertexColors: true, map: groundMap, bumpMap: groundBump, bumpScale: 0.4,
  }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- lake
  const lakeUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(PAL.lakeDeep) },
    uShallow: { value: new THREE.Color(PAL.lakeShallow) },
    uFog: { value: new THREE.Color(PAL.fog) },
    uFogD: { value: TUNE.fogDensity },
    uMoonDir: { value: moonDirV },
    uMoonCol: { value: new THREE.Color(0xbfd8de) },
    uSky: { value: new THREE.Color(PAL.skyHorizon) },
    uCam: { value: new THREE.Vector3() },
    // c1 · the lake catches the first grey light as dawn builds (phase → 1)
    uDawn: { value: 0 },
    uDawnCol: { value: new THREE.Color(0x6f7a80) },   // pale cool grey — first light on water
  };
  const lake = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: lakeUniforms,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `
        uniform float uTime, uFogD, uDawn;
        uniform vec3 uDeep, uShallow, uFog, uMoonDir, uMoonCol, uCam, uSky, uDawnCol;
        varying vec3 vW;
        float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float vnoise(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
        }
        void main(){
          float t = uTime;
          vec2 p = vW.xz;
          float dist = length(uCam - vW);
          float att = exp(-dist * 0.012);   // fine chop fades with distance so the far lake stays calm
          // layered directional waves: slope = sum A*k*cos(dot(p,k)+w*t)
          vec2 g = vec2(0.0);
          g += vec2(0.30, 0.17)  * cos(dot(p, vec2(0.30, 0.17))  + t * 0.90) * 0.14;
          g += vec2(-0.11, 0.24) * cos(dot(p, vec2(-0.11, 0.24)) + t * 0.55) * 0.17;
          g += vec2(0.050, 0.041)* cos(dot(p, vec2(0.050, 0.041))+ t * 0.30) * 0.80;
          g += (vec2(0.85, 0.48) * cos(dot(p, vec2(0.85, 0.48))  + t * 1.90) * 0.040
              + vec2(-0.55, 0.74)* cos(dot(p, vec2(-0.55, 0.74)) + t * 1.55) * 0.034) * att;
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
          n.xz += (vnoise(p * 1.7 + vec2(t * 0.22, -t * 0.18)) - 0.5) * 0.05 * att;
          n = normalize(n);
          vec3 vDir = normalize(uCam - vW);
          // fresnel reflects the night sky; grazing angles pick up the horizon color
          float fres = pow(1.0 - max(dot(vDir, n), 0.0), 4.0);
          vec3 col = mix(uDeep, uSky, 0.08 + 0.80 * fres);
          // slow drifting patches of slightly lighter water
          float drift = vnoise(p * 0.05 + vec2(t * 0.020, -t * 0.014));
          col = mix(col, uShallow, drift * 0.30);
          // moon path: broad sheen + animated glints + bloom-hot core
          vec3 hv = normalize(vDir + normalize(uMoonDir));
          vec3 nS = normalize(vec3(n.x * 2.7, 1.0, n.z * 0.55));
          float facing = max(dot(nS, hv), 0.0);
          float glint = vnoise(p * 4.6 + vec2(t * 0.9, -t * 0.7)) * vnoise(p * 6.3 - vec2(t * 0.6, t * 0.8));
          float streak = pow(facing, 24.0) * 0.07
                       + pow(facing, 300.0) * (0.25 + 2.6 * smoothstep(0.34, 0.60, glint))
                       + pow(max(dot(n, hv), 0.0), 900.0) * 2.2;
          col += uMoonCol * streak;
          // c1 · first grey light greys the water toward dawn (before the fog mix)
          col = mix(col, uDawnCol, uDawn * (0.10 + 0.14 * fres));
          float f = 1.0 - exp(-pow(dist * uFogD, 2.0));
          col = mix(col, uFog, min(f, 0.93));
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, 0, 300);
  scene.add(lake);

  // ---- the jetty
  const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const dockParts = [];
  for (let i = 0; i < 36; i++) {
    const z = 57.6 + i * 0.62;
    const plank = new THREE.BoxGeometry(2.7, 0.09, 0.5);
    xform(plank, (rand() - 0.5) * 0.05, 0.52 + (rand() - 0.5) * 0.03, z, 0, (rand() - 0.5) * 0.04, 0);
    dockParts.push(vertColored(plank, rand() > 0.5 ? PAL.wood : PAL.woodDark, 0.18));
  }
  for (let i = 0; i < 7; i++) {
    for (const sx of [-1.25, 1.25]) {
      const post = new THREE.CylinderGeometry(0.09, 0.11, 2.4, 5);
      xform(post, sx, -0.4, 58.5 + i * 3.4, (rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06);
      dockParts.push(vertColored(post, PAL.woodDark, 0.2));
    }
  }
  // stringers
  for (const sx of [-1.15, 1.15]) {
    const st = new THREE.BoxGeometry(0.14, 0.14, 22.4);
    xform(st, sx, 0.42, 68.6);
    dockParts.push(vertColored(st, PAL.woodDark, 0.1));
  }
  const dock = new THREE.Mesh(mergeGeometries(dockParts), woodMat);
  dock.castShadow = true; dock.receiveShadow = true;
  scene.add(dock);
  colliders.addBox(-1.55, 68.5, 0.5, 22.5);   // dock edge rails (invisible)
  colliders.addBox(1.55, 68.5, 0.5, 22.5);
  colliders.addBox(0, 79.6, 3.4, 0.5);        // end of the jetty

  // crates on the dock
  const crateMat = new THREE.MeshLambertMaterial({ map: planksTex(0x7a5c3e) });
  const crateG = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const crate1 = new THREE.Mesh(crateG, crateMat);
  crate1.position.set(-0.75, 0.97, 76.4); crate1.rotation.y = 0.4;
  crate1.castShadow = true;
  scene.add(crate1);
  const crate2 = crate1.clone(); crate2.position.set(0.8, 0.97, 77.1); crate2.rotation.y = -0.2; crate2.scale.setScalar(0.75);
  scene.add(crate2);
  colliders.addBox(-0.75, 76.4, 0.9, 0.9);
  colliders.addBox(0.8, 77.1, 0.7, 0.7);

  // ferry schedule sign on the jetty
  const sched = makeSign(
    ['dep 9:00 · 13:00 · 18:45', 'if there is fog, there is no boat', '(if a LOT of fog — hide)'],
    { title: 'INALCO TOURS', w: 1.7, h: 1.05 }
  );
  // two posts flanking the board at reading height, so it no longer top-heavily
  // overshoots a single stick
  const fsX = -1.05, fsZ = 74.2, fsBase = 0.5;
  const postMat = new THREE.MeshLambertMaterial({ color: PAL.woodDark });
  for (const dx of [-0.58, 0.58]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), postMat);
    p.position.set(fsX + dx, fsBase + 0.75, fsZ + 0.05);
    p.castShadow = true;
    scene.add(p);
  }
  sched.position.set(fsX, fsBase + 0.85, fsZ); sched.rotation.y = Math.PI + 0.15;
  scene.add(sched);

  // ---- forests
  const inWater = (x, z) => groundHeight(x, z) < 0.2;
  // Rufino's fire clearing (a trampled hearth). The drowned crew's camp is no
  // longer co-located here, so this can be tighter — the ground it used to share
  // re-vegetates and no bald patch is left where the camp used to be.
  const nearCamp = (x, z, r = 8) => Math.hypot(x - LAYOUT.camp.x, z - LAYOUT.camp.z) < r;
  // the drowned crew's abandoned camp (b1), now ~20 m east along the shore: keep
  // it clear so trunks/reeds don't spear the tents, gear and recording camera
  const nearCrewCamp = (x, z, r = 11) => Math.hypot(x - LAYOUT.crewCamp.x, z - LAYOUT.crewCamp.z) < r;
  // a clearing high in the north pines for the old cemetery (b1) so the enclosed
  // plot — iron railing, headstones, monument and the ruined outer wall — isn't
  // speared by trunks. Widened when the graveyard was fenced & enlarged.
  const nearCemetery = (x, z, r = 10.5) => Math.hypot(x - LAYOUT.cemetery.x, z - LAYOUT.cemetery.z) < r;
  const nearPads = (x, z, extra = 2.5) =>
    PADS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + extra) || nearCamp(x, z) || nearCrewCamp(x, z) || nearCemetery(x, z);
  const tooSteep = (x, z, lim = 0.5) => {
    const h = groundHeight(x, z);
    return Math.abs(groundHeight(x + 0.7, z) - h) > lim || Math.abs(groundHeight(x, z + 0.7) - h) > lim;
  };
  const B = LAYOUT.bounds;
  const veg = vegMaterials();

  const arr = buildArrayan(rand);
  scatterParts(scene, colliders, [
    { geo: arr.trunk, mat: veg.trunkMat },
    { geo: arr.core, mat: veg.coreMat },
    { geo: arr.cards, mat: veg.cardMat, shadow: false },
  ], {
    count: 130, sMin: 0.8, sMax: 1.6, collide: 0.32, rand, sink: 0.22, tint: true,
    place: () => {
      const grove = rand() > 0.45 ? { x: 27, z: 16, r: 42 } : { x: -32, z: 16, r: 36 };
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * grove.r;
      const x = grove.x + Math.cos(a) * r, z = grove.z + Math.sin(a) * r;
      if (x < B.minX || x > B.maxX || z < B.minZ || z > LAYOUT.shoreZ - 4) return null;
      if (inWater(x, z) || nearPads(x, z) || distToPaths(x, z) < 3) return null;
      return { x, y: groundHeight(x, z), z };
    },
  });

  const pine = buildPine(rand);
  const pineParts = [
    { geo: pine.trunk, mat: veg.trunkMat },
    { geo: pine.core, mat: veg.coreMat },
    { geo: pine.needles, mat: veg.needleMat, shadow: false },
  ];
  scatterParts(scene, colliders, pineParts, {
    count: 210, sMin: 0.8, sMax: 1.6, collide: 0.34, rand, sink: 0.25, tint: true,
    place: () => {
      const x = B.minX + rand() * (B.maxX - B.minX);
      const z = B.minZ + rand() * (LAYOUT.shoreZ - 6 - B.minZ);
      const northBias = clamp01((-z + 30) / 100);
      if (rand() > 0.25 + northBias * 0.75) return null;
      if (inWater(x, z) || nearPads(x, z) || distToPaths(x, z) < 3.2) return null;
      return { x, y: groundHeight(x, z), z };
    },
  });

  // perimeter tree wall (hides the edge of the world)
  scatterParts(scene, null, pineParts, {
    count: 150, sMin: 1.5, sMax: 2.4, collide: 0, rand, sink: 0.4, shadows: false,
    place: () => {
      const side = rand();
      let x, z;
      if (side < 0.4) { x = B.minX - 4 - rand() * 22; z = B.minZ + rand() * (LAYOUT.shoreZ - B.minZ); }
      else if (side < 0.8) { x = B.maxX + 4 + rand() * 22; z = B.minZ + rand() * (LAYOUT.shoreZ - B.minZ); }
      else { x = B.minX + rand() * (B.maxX - B.minX); z = B.minZ - 4 - rand() * 26; }
      if (inWater(x, z)) return null;
      return { x, y: groundHeight(x, z), z };
    },
  });

  // bushes: leafy clumps along paths, walls and the treeline
  const bush = buildBush(rand);
  scatterParts(scene, null, [
    { geo: bush.core, mat: veg.coreMat },
    { geo: bush.cards, mat: veg.cardMat, shadow: false },
  ], {
    count: 170, sMin: 0.7, sMax: 1.6, collide: 0, rand, sink: 0.12, tint: true,
    place: () => {
      const x = B.minX + rand() * (B.maxX - B.minX);
      const z = B.minZ + rand() * (LAYOUT.shoreZ - 2 - B.minZ);
      if (inWater(x, z) || nearPads(x, z, 0.5) || tooSteep(x, z)) return null;
      const pd = distToPaths(x, z);
      if (pd < 2.0) return null;
      if (pd > 7 && rand() > 0.4) return null;    // bias toward path edges where you'll see them
      return { x, y: groundHeight(x, z), z };
    },
  });

  // rocks: craggy, mossy, half-buried boulders (textured + bump-mapped stone)
  const rockGeo = buildRock(rand);
  scatterParts(scene, colliders, [{ geo: rockGeo, mat: veg.rockMat }], {
    count: 100, sMin: 0.45, sMax: 2.1, collide: 0.55, rand, sink: 0.3,
    place: () => {
      const x = B.minX + rand() * (B.maxX - B.minX);
      const z = B.minZ + rand() * (LAYOUT.shoreZ + 4 - B.minZ);
      if (nearPads(x, z, 1) || distToPaths(x, z) < 2.2) return null;
      const y = groundHeight(x, z);
      if (y < -0.6) return null;
      return { x, y, z };
    },
  });

  // grass: dense tufts of alpha blade-cards covering the open ground (the
  // grassy ground texture carries the rest of the coverage between tufts)
  const grass = buildGrass(rand);
  scatterParts(scene, null, [{ geo: grass.cards, mat: veg.grassMat, shadow: false }], {
    count: 6500, sMin: 0.7, sMax: 1.5, collide: 0, rand, sink: 0.05, tint: true, shadows: false,
    place: () => {
      const x = B.minX + rand() * (B.maxX - B.minX);
      const z = B.minZ + rand() * (LAYOUT.shoreZ - 2 - B.minZ);
      if (inWater(x, z) || nearPads(x, z, -1) || distToPaths(x, z) < 1.0 || tooSteep(x, z, 0.55)) return null;
      return { x, y: groundHeight(x, z), z };
    },
  });

  // reeds by the shore
  const reedParts = [];
  for (let i = 0; i < 5; i++) {
    const r = new THREE.CylinderGeometry(0.012, 0.025, 1.1 + rand() * 0.5, 3);
    xform(r, (rand() - 0.5) * 0.5, 0.55, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.24, 0, (rand() - 0.5) * 0.24);
    reedParts.push(vertColored(r, 0x4a5238, 0.3));
  }
  const reedGeo = mergeGeometries(reedParts);
  scatterParts(scene, null, [{ geo: reedGeo, mat: veg.coreMat }], {
    count: 90, sMin: 0.8, sMax: 1.4, collide: 0, rand, sink: 0.1,
    place: () => {
      const x = B.minX + rand() * (B.maxX - B.minX);
      const z = LAYOUT.shoreZ - 4 + rand() * 9;
      const y = groundHeight(x, z);
      if (y < -0.8 || y > 0.7) return null;
      if (Math.abs(x - LAYOUT.dock.x) < 3 || Math.hypot(x - LAYOUT.boathouse.x, z - LAYOUT.boathouse.z) < 12) return null;
      if (nearCamp(x, z, 8) || nearCrewCamp(x, z, 9)) return null;
      return { x, y: Math.max(y, -0.15), z };
    },
  });

  // ---- world bounds
  colliders.addBox(0, B.minZ - 6, (B.maxX - B.minX) + 60, 12);
  colliders.addBox(0, B.maxZ + 6, (B.maxX - B.minX) + 60, 12);
  colliders.addBox(B.minX - 6, 0, 12, (B.maxZ - B.minZ) + 60);
  colliders.addBox(B.maxX + 6, 0, 12, (B.maxZ - B.minZ) + 60);

  // ---- dust motes (fine drifting dust, brighter in the flashlight beam)
  const moteTex = canvasTexture((c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    // tight soft core, fully transparent well before the edge (no hard quad)
    g.addColorStop(0, 'rgba(255,251,242,0.9)');
    g.addColorStop(0.28, 'rgba(255,251,242,0.16)');
    g.addColorStop(0.6, 'rgba(255,251,242,0.02)');
    g.addColorStop(1, 'rgba(255,251,242,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }, 64, 64);
  const MOTES = 300, RANGE = 12;
  const mPos = new Float32Array(MOTES * 3), mVel = [];
  for (let i = 0; i < MOTES; i++) {
    mPos[i * 3] = (Math.random() - 0.5) * RANGE * 2;
    mPos[i * 3 + 1] = Math.random() * 5;
    mPos[i * 3 + 2] = (Math.random() - 0.5) * RANGE * 2;
    mVel.push(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.12));
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  const MOTE_OFF = 0.03, MOTE_ON = 0.08;
  const moteMat = new THREE.PointsMaterial({
    size: 0.022, map: moteTex, transparent: true, opacity: MOTE_OFF,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0x8f9a96,
    sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // ---- drifting fog banks: recycled into a ring around the player so the
  // fog never "runs out" no matter where you walk
  const FOG_BANK_BASE = 0.085;   // resting sprite opacity; the tide breathes around it
  const fogMat = new THREE.SpriteMaterial({
    map: fogTex(), transparent: true, opacity: FOG_BANK_BASE, depthWrite: false, fog: true,
  });
  const fogBanks = [];
  const placeBank = (s, px, pz, anywhere) => {
    const a = Math.random() * Math.PI * 2;
    const r = anywhere ? Math.random() * 55 : 24 + Math.random() * 34;
    const x = px + Math.cos(a) * r, z = Math.min(pz + Math.sin(a) * r, LAYOUT.shoreZ + 24);
    const gy = Math.max(groundHeight(x, z), -0.2);
    const w = 9 + Math.random() * 13;
    s.scale.set(w, w * 0.36, 1);
    const baseY = gy + 1.0 + Math.random() * 0.9;
    s.position.set(x, baseY, z);
    const ud = s.userData;                          // mutate in place — no new literal per recycle
    ud.vx = 0.1 + Math.random() * 0.2; ud.ph = Math.random() * 9; ud.baseY = baseY;
  };
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(fogMat);
    placeBank(s, 0, 30, true);
    fogBanks.push(s);
    scene.add(s);
  }

  // c1 · night-arc → sky. Reused scratch so setNightPhase allocates nothing per
  // frame. dawnAmt is the shared 0..1 first-light factor; setFogLevel reads it to
  // burn the fog off as the light comes up.
  const _baseHorizon = new THREE.Color(PAL.skyHorizon);
  const _dawnHorizon = new THREE.Color(0x59504a);   // low sky warms/lightens at dawn
  const _baseZenith = new THREE.Color(PAL.skyZenith);
  const _dawnZenith = new THREE.Color(0x141e2a);     // zenith greys up a touch
  const _baseAmbient = new THREE.Color(PAL.ambient);
  const _dawnAmbient = new THREE.Color(0x4c463f);    // the world takes the first grey light
  const _baseMoonCol = new THREE.Color(PAL.moon).multiplyScalar(2.2);
  const _lightDir = new THREE.Vector3();
  let dawnAmt = 0;
  let _lastPh = -1;   // last phase applied by setNightPhase; used to skip sub-pixel recomputes

  // adaptive-quality (LE-1) state. Defaults reproduce today's look exactly:
  // full fog density, and no renderer/shadow-light attached until main wires it.
  let _renderer = null;        // set via attachRenderer — needed to stop the shadow pass
  let _shadowLight = null;     // the sole shadow caster (player's flashlight spot)
  let _fogDensityScale = 1;    // multiplies the density setFogLevel computes
  let _lastTide = 0;           // last tide fed to setFogLevel (for live re-apply)

  const api = {
    groundHeight,
    distToPaths,
    moonDir: moonDirV,
    setFlashlight(on) { moteMat.opacity = on ? MOTE_ON : MOTE_OFF; },
    // c1 · the night's PHASE (0..1, monotonic) drives the visible sky so the
    // player can always read how deep into the night they are and SEE dawn
    // coming — the moon IS the clock. The moon rides high early and sinks toward
    // the horizon as the night ends; from phase ≈ 0.7 a warm dawn glow builds on
    // the lake horizon, the stars/veil fade, the moon pales, and the world takes
    // first light. Called each sim frame; no per-frame allocation.
    setNightPhase(phase) {
      const ph = phase < 0 ? 0 : phase > 1 ? 1 : phase;
      // The moon advances only a sub-pixel arc per frame, yet this recomputes the
      // whole arc (normalize + two lookAt + rotateZ) and ~4 colour lerps. Skip when
      // the phase hasn't moved enough to shift a pixel or an 8-bit colour step; the
      // skipped delta is below one screen pixel of moon travel / one 1/255 colour
      // step (verified by night-phase timelapse). First call (_lastPh<0) always runs.
      if (_lastPh >= 0 && Math.abs(ph - _lastPh) < 1e-4) return;
      _lastPh = ph;
      // the moon arc: altitude high → grazing the horizon; azimuth drifts from
      // over the lake toward the west as it sets.
      const alt = lerp(0.95, 0.05, smoothstep(0.0, 1.0, ph));
      const az = lerp(0.34, -1.15, ph);
      const cy = Math.cos(alt);
      moonDirV.set(cy * Math.sin(az), Math.sin(alt), cy * Math.cos(az)).normalize();
      moon.position.copy(moonDirV).multiplyScalar(700); moon.lookAt(0, 0, 0); moon.rotateZ(0.6);
      halo.position.copy(moonDirV).multiplyScalar(690); halo.lookAt(0, 0, 0);
      // keep the shadow-casting moonlight from grazing flat along the ground when
      // the moon is near the horizon (would give broken, kilometre-long shadows).
      const altL = Math.max(alt, 0.18);
      _lightDir.set(Math.cos(altL) * Math.sin(az), Math.sin(altL), Math.cos(altL) * Math.cos(az));
      dir.position.copy(_lightDir).multiplyScalar(120);

      const dawn = smoothstep(0.70, 1.0, ph);
      dawnAmt = dawn;
      skyUniforms.uDawn.value = dawn;
      lakeUniforms.uDawn.value = dawn;
      skyUniforms.bottom.value.copy(_baseHorizon).lerp(_dawnHorizon, dawn);
      skyUniforms.top.value.copy(_baseZenith).lerp(_dawnZenith, dawn * 0.8);
      moon.material.color.copy(_baseMoonCol).multiplyScalar(1 - 0.55 * dawn);
      halo.material.opacity = 1 - 0.85 * dawn;
      ambientLight.color.copy(_baseAmbient).lerp(_dawnAmbient, dawn);
      ambientLight.intensity = 0.28 + 0.16 * dawn;
      dir.intensity = 0.55 * (1 - 0.35 * dawn);
    },
    // the fog breathes with the Night-Engine tide (0..1): scene fog thickens at
    // peaks and thins in lulls, the drifting banks fatten with it, and the sky's
    // cloud veil takes a subtle nudge. A ±modulation around the base look — the
    // caller drives it each sim frame; left alone it holds steady (e.g. paused).
    // c1: dawn ALSO burns the fog off (dawnAmt), so the water is visibly
    // crossable as first light arrives — the diegetic "the fog is thinning" beat.
    setFogLevel(tide) {
      const t = tide < 0 ? 0 : tide > 1 ? 1 : tide;
      _lastTide = t;
      const clear = 1 - 0.55 * dawnAmt;
      // LE-1: _fogDensityScale is 1.0 at HIGH (unchanged); MEDIUM/LOW thin the fog.
      scene.fog.density = TUNE.fogDensity * (0.9 + 0.5 * t) * clear * _fogDensityScale;
      fogMat.opacity = FOG_BANK_BASE * (0.85 + 0.7 * t) * clear;
      skyUniforms.uVeil.value = (0.9 + 0.45 * t) * (1 - 0.7 * dawnAmt);
    },
    // ---- adaptive-quality levers (LE-1). Additive: untouched at HIGH.
    // main wires the renderer + the sole shadow-casting light (player's spot) so
    // shadows can be scaled without world owning either.
    attachRenderer(renderer, shadowLight) {
      _renderer = renderer || null;
      _shadowLight = shadowLight || null;
    },
    // Shadow OFF: stop the render pass (renderer.shadowMap.enabled=false makes
    // WebGLShadowMap.render early-return) AND clear the caster's castShadow. No
    // material.needsUpdate en masse — any reprogram is lazy + one-time, not a
    // forced mass recompile.
    setShadows(enabled) {
      if (_renderer) _renderer.shadowMap.enabled = !!enabled;
      if (_shadowLight) _shadowLight.castShadow = !!enabled;
    },
    // Resize the shadow map: set mapSize then drop the baked map so three rebuilds
    // it at the new size on the next shadow render. mapSize is not a shader define,
    // so this costs no material recompile.
    setShadowMapSize(n) {
      if (!_shadowLight) return;
      _shadowLight.shadow.mapSize.set(n, n);
      if (_shadowLight.shadow.map) {
        _shadowLight.shadow.map.dispose();
        _shadowLight.shadow.map = null;
      }
    },
    // Scale down how many of the fog banks draw. Reuses the existing sprites —
    // just toggles .visible; positions still advance in update() so raising the
    // count again shows already-placed banks (never rebuilds geometry).
    setFogSpriteCount(n) {
      const k = Math.max(0, Math.min(fogBanks.length, n | 0));
      for (let i = 0; i < fogBanks.length; i++) fogBanks[i].visible = i < k;
    },
    // Multiply the scene fog density by a tier scale (1.0 / 0.9 / 0.8). Re-applies
    // immediately from the last tide so a tier switch takes effect even if the sim
    // is paused and setFogLevel isn't ticking.
    setFogDensityScale(scale) {
      _fogDensityScale = scale > 0 ? scale : 1;
      const clear = 1 - 0.55 * dawnAmt;
      scene.fog.density = TUNE.fogDensity * (0.9 + 0.5 * _lastTide) * clear * _fogDensityScale;
    },
    // Scale down how many dust motes DRAW — the motes are additive/transparent
    // Points, so on a weak GPU their fill-rate overdraw is a real cost. Clamp the
    // geometry's draw range instead of rebuilding/disposing anything; positions
    // still advance in update() for all MOTES, so raising the count again shows
    // current drift. HIGH = MOTES (all 300, which is also the geometry's default
    // draw range) → apply() never calls this at HIGH, so the beam is pixel-
    // identical to today; MEDIUM/LOW draw fewer.
    setMoteCount(n) {
      const k = Math.max(0, Math.min(MOTES, n | 0));
      moteGeo.setDrawRange(0, k);
    },
    update(dt, time, playerPos) {
      skyUniforms.uTime.value = time;
      lakeUniforms.uTime.value = time;
      lakeUniforms.uCam.value.copy(playerPos);
      windTime.value = time;
      for (let i = 0; i < fogBanks.length; i++) {   // indexed loop: no iterator alloc
        const s = fogBanks[i], ud = s.userData;
        s.position.x += ud.vx * dt;
        s.position.y = ud.baseY + Math.sin(time * 0.14 + ud.ph) * 0.35;
        const dx = s.position.x - playerPos.x, dz = s.position.z - playerPos.z;
        if (dx * dx + dz * dz > 68 * 68) placeBank(s, playerPos.x, playerPos.z, false);
      }
      motes.position.set(playerPos.x, playerPos.y - 1, playerPos.z);
      const a = moteGeo.getAttribute('position');
      const arr = a.array;                          // index the backing Float32Array directly
      for (let i = 0; i < MOTES; i++) {
        const b = i * 3, v = mVel[i];
        let x = arr[b] + v.x * dt, y = arr[b + 1] + v.y * dt, z = arr[b + 2] + v.z * dt;
        if (x > RANGE) x = -RANGE; if (x < -RANGE) x = RANGE;
        if (z > RANGE) z = -RANGE; if (z < -RANGE) z = RANGE;
        if (y > 5) y = 0; if (y < 0) y = 5;
        arr[b] = x; arr[b + 1] = y; arr[b + 2] = z;
      }
      a.needsUpdate = true;
    },
  };
  return api;
}
