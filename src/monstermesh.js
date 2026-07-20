import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Sculpted bodies for the Returned. Each monster is modeled as a signed
// distance field — capsules, spheres and cones smooth-blended (smin) into
// one continuous mass, with sockets/maws carved out (smax) — polygonized by
// marching cubes into a single seamless mesh, then Taubin-smoothed, noise-
// displaced, cylinder-UV'd and auto-skinned to a small bone skeleton so the
// existing stop-motion animation code can pose it. No assembled primitives:
// silhouettes read as grown, not built.

// ------------------------------------------------------------------- SDF

function smin(a, b, k) {
  const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

// distance to capsule segment a-b radius r, with anisotropic scale s about
// the segment midpoint (approximate SDF: divide space, multiply min scale)
function capDist(px, py, pz, P) {
  if (P.s) {
    const inv = P.sInv, m = P.mid;
    px = m[0] + (px - m[0]) * inv[0];
    py = m[1] + (py - m[1]) * inv[1];
    pz = m[2] + (pz - m[2]) * inv[2];
  }
  const ax = P.a[0], ay = P.a[1], az = P.a[2];
  let bx = P.b[0] - ax, by = P.b[1] - ay, bz = P.b[2] - az;
  let dx = px - ax, dy = py - ay, dz = pz - az;
  const bb = bx * bx + by * by + bz * bz;
  let h = bb > 1e-9 ? (dx * bx + dy * by + dz * bz) / bb : 0;
  h = Math.min(1, Math.max(0, h));
  dx -= bx * h; dy -= by * h; dz -= bz * h;
  return (Math.sqrt(dx * dx + dy * dy + dz * dz) - P.r) * P.sMin;
}

// vertical rounded cone: base center c radius r1, radius r2 at height h (iq)
function coneDist(px, py, pz, P) {
  const qx = Math.hypot(px - P.c[0], pz - P.c[2]);
  const qy = py - P.c[1];
  const b = (P.r1 - P.r2) / P.h;
  const a = Math.sqrt(1 - b * b);
  const k = qx * -b + qy * a;
  if (k < 0) return Math.hypot(qx, qy) - P.r1;
  if (k > a * P.h) return Math.hypot(qx, qy - P.h) - P.r2;
  return qx * a + qy * b - P.r1;
}

function primDist(px, py, pz, P) {
  return P.cone ? coneDist(px, py, pz, P) : capDist(px, py, pz, P);
}

export class Sculpt {
  constructor() { this.prims = []; this.carves = []; }
  _mk(bone, a, b, r, o = {}) {
    const P = {
      a, b, r, bone, k: o.k ?? 0.07,
      s: o.s ?? null, sMin: 1, mid: null, sInv: null,
    };
    if (P.s) {
      P.sMin = Math.min(...P.s);
      P.mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      P.sInv = [1 / P.s[0], 1 / P.s[1], 1 / P.s[2]];
    }
    return P;
  }
  // blended union — flesh
  cap(bone, a, b, r, o) { this.prims.push(this._mk(bone, a, b, r, o)); return this; }
  sph(bone, c, r, o) { return this.cap(bone, c, c, r, o); }
  cone(bone, c, r1, r2, h, o = {}) {
    this.prims.push({ cone: true, c, r1, r2, h, bone, k: o.k ?? 0.09 });
    return this;
  }
  // blended subtraction — sockets, maws, hollows
  carve(c, r, o = {}) {
    this.carves.push(this._mk(null, c, c, r, { ...o, k: o.k ?? 0.04 }));
    return this;
  }
  carveCap(a, b, r, o = {}) {
    this.carves.push(this._mk(null, a, b, r, { ...o, k: o.k ?? 0.04 }));
    return this;
  }
}

function primBounds(P, pad) {
  if (P.cone) {
    const r = Math.max(P.r1, P.r2) + pad;
    return [P.c[0] - r, P.c[1] - pad, P.c[2] - r, P.c[0] + r, P.c[1] + P.h + pad, P.c[2] + r];
  }
  const grow = P.r * (P.s ? Math.max(...P.s) : 1) + pad;
  return [
    Math.min(P.a[0], P.b[0]) - grow, Math.min(P.a[1], P.b[1]) - grow, Math.min(P.a[2], P.b[2]) - grow,
    Math.max(P.a[0], P.b[0]) + grow, Math.max(P.a[1], P.b[1]) + grow, Math.max(P.a[2], P.b[2]) + grow,
  ];
}

// ------------------------------------------------- field → mesh extraction

export function polygonize(sculpt, domain, res) {
  const { cx, cy, cz, hx, hy, hz } = domain;
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 400000);
  const size = mc.size, size2 = mc.size2, half = mc.halfsize;
  const field = new Float32Array(size * size * size).fill(1e3);

  const toCell = (m, c, h) => Math.round(((m - c) / h) * half + half);
  const clampC = (v) => Math.max(1, Math.min(size - 2, v));
  const cellX = new Float32Array(size), cellY = new Float32Array(size), cellZ = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const f = (i - half) / half;
    cellX[i] = f * hx + cx; cellY[i] = f * hy + cy; cellZ[i] = f * hz + cz;
  }
  const apply = (P, op) => {
    const pad = (P.k ?? 0.05) + 0.03;
    const B = primBounds(P, pad);
    const x0 = clampC(toCell(B[0], cx, hx)), x1 = clampC(toCell(B[3], cx, hx));
    const y0 = clampC(toCell(B[1], cy, hy)), y1 = clampC(toCell(B[4], cy, hy));
    const z0 = clampC(toCell(B[2], cz, hz)), z1 = clampC(toCell(B[5], cz, hz));
    for (let z = z0; z <= z1; z++) {
      const mz = cellZ[z], zOff = z * size2;
      for (let y = y0; y <= y1; y++) {
        const my = cellY[y], yOff = zOff + y * size;
        for (let x = x0; x <= x1; x++) {
          const i = yOff + x;
          const d = primDist(cellX[x], my, mz, P);
          field[i] = op(field[i], d, P.k);
        }
      }
    }
  };
  for (const P of sculpt.prims) apply(P, (f, d, k) => smin(f, d, k));
  for (const P of sculpt.carves) apply(P, (f, d, k) => -smin(-f, d, k));   // smax(f, -d)

  for (let i = 0; i < field.length; i++) mc.field[i] = -field[i];
  mc.isolation = 0;
  mc.update();

  const n = mc.count * 3;
  const pos = new Float32Array(n);
  for (let i = 0; i < mc.count; i++) {
    pos[i * 3] = mc.positionArray[i * 3] * hx + cx;
    pos[i * 3 + 1] = mc.positionArray[i * 3 + 1] * hy + cy;
    pos[i * 3 + 2] = mc.positionArray[i * 3 + 2] * hz + cz;
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo = BufferGeometryUtils.mergeVertices(geo, 1e-4);
  mc.geometry.dispose();
  return geo;
}

// Taubin smoothing (λ|μ pairs) — melts marching-cube stairs without
// shrinking the thin limbs the way plain Laplacian would
export function taubinSmooth(geo, iterations = 3, { lambda = 0.5, mu = -0.53 } = {}) {
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex().array;
  const count = pos.count;
  const nbr = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b);
  }
  const src = pos.array;
  let cur = Float32Array.from(src);
  let nxt = new Float32Array(src.length);
  const pass = (lambda) => {
    for (let i = 0; i < count; i++) {
      let ax = 0, ay = 0, az = 0;
      const N = nbr[i];
      for (const j of N) { ax += cur[j * 3]; ay += cur[j * 3 + 1]; az += cur[j * 3 + 2]; }
      const m = N.size || 1;
      nxt[i * 3] = cur[i * 3] + lambda * (ax / m - cur[i * 3]);
      nxt[i * 3 + 1] = cur[i * 3 + 1] + lambda * (ay / m - cur[i * 3 + 1]);
      nxt[i * 3 + 2] = cur[i * 3 + 2] + lambda * (az / m - cur[i * 3 + 2]);
    }
    [cur, nxt] = [nxt, cur];
  };
  for (let it = 0; it < iterations; it++) { pass(lambda); pass(mu); }
  src.set(cur);
  pos.needsUpdate = true;
}

// grown-wrong skin: broad lumps + fine grain pushed along the normal
export function displace(geo, lumpAmp, lumpFreq, fineAmp, fineFreq, seed = 0) {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const n3 = (x, y, z, f, s) =>
    Math.sin(x * f + s) * Math.sin(y * f * 0.83 + s * 1.7 + 4.2) * Math.sin(z * f * 1.21 + 1.7 + s * 0.37);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = n3(x, y, z, lumpFreq, seed) * lumpAmp +
      n3(x, y, z, fineFreq, seed + 9) * fineAmp +
      Math.abs(n3(x, y, z, lumpFreq * 2.1, seed + 4)) * lumpAmp * 0.5;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  pos.needsUpdate = true;
}

export function cylinderUVs(geo, height, uRep = 2.5, vRep = 2.2) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (Math.atan2(pos.getX(i), pos.getZ(i)) / (Math.PI * 2) + 0.5) * uRep;
    uv[i * 2 + 1] = (pos.getY(i) / height) * vRep;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// -------------------------------------------------------------- skinning

function skinToBones(geo, sculpt, boneNames) {
  const pos = geo.getAttribute('position');
  const byBone = new Map();
  for (const P of sculpt.prims) {
    if (!P.bone) continue;
    if (!byBone.has(P.bone)) byBone.set(P.bone, []);
    byBone.get(P.bone).push(P);
  }
  const boneIdx = new Map(boneNames.map((n, i) => [n, i]));
  const entries = [...byBone.entries()].map(([name, prims]) => [boneIdx.get(name), prims]);
  const sIdx = new Uint16Array(pos.count * 4);
  const sWgt = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let b0 = 0, d0 = 1e9, b1 = 0, d1 = 1e9;
    for (const [bi, prims] of entries) {
      let d = 1e9;
      for (const P of prims) d = Math.min(d, primDist(x, y, z, P));
      d = Math.max(d, 0);
      if (d < d0) { b1 = b0; d1 = d0; b0 = bi; d0 = d; }
      else if (d < d1) { b1 = bi; d1 = d; }
    }
    const w0 = 1 / Math.pow(d0 + 0.02, 3), w1 = 1 / Math.pow(d1 + 0.02, 3);
    const sum = w0 + w1;
    sIdx[i * 4] = b0; sIdx[i * 4 + 1] = b1;
    sWgt[i * 4] = w0 / sum; sWgt[i * 4 + 1] = w1 / sum;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sWgt, 4));
}

// --------------------------------------------------------- per-kind sculpts

// bone spec: [name, parentName|null, worldX, worldY, worldZ]
// The sculpt IS the rest pose: arms straight down, legs straight, spine up.

function testigoSpec() {
  // THE HALF-SEEN — 2.75m of posture: emaciated, ribs and vertebrae under
  // the skin, arms that reach its knees, a dropped-open jaw.
  const bones = [
    ['hips', null, 0, 1.375, 0],
    ['spine', 'hips', 0, 1.375, 0],
    ['neck', 'spine', 0, 2.295, 0.05],
    ['head', 'neck', 0, 2.595, 0.07],
    ['sh0', 'spine', -0.27, 2.115, -0.02],
    ['sh1', 'spine', 0.27, 2.15, -0.02],
    ['el0', 'sh0', -0.27, 1.395, -0.02],
    ['el1', 'sh1', 0.27, 1.375, -0.02],
    ['wr0', 'el0', -0.27, 0.655, -0.01],
    ['wr1', 'el1', 0.28, 0.615, -0.01],
    ['hj0', 'hips', -0.13, 1.375, 0],
    ['hj1', 'hips', 0.13, 1.375, 0],
    ['kn0', 'hj0', -0.14, 0.756, 0],
    ['kn1', 'hj1', 0.13, 0.756, 0],
  ];
  const S = new Sculpt();
  S.cap('hips', [0, 1.3, 0], [0, 1.43, 0], 0.145, { s: [1, 1, 0.8] })
    .cap('spine', [0, 1.45, -0.01], [0, 1.72, -0.05], 0.105, { s: [1, 1, 0.72] })
    .cap('spine', [0, 1.74, -0.03], [0, 2.06, -0.06], 0.15, { s: [1, 1, 0.66] })
    // clavicles and blades — the parts a glimpse remembers
    .cap('spine', [-0.1, 2.02, -0.12], [-0.21, 2.12, -0.09], 0.035, { k: 0.045 })
    .cap('spine', [0.1, 2.04, -0.12], [0.21, 2.15, -0.09], 0.035, { k: 0.045 })
    .cap('spine', [-0.03, 2.1, 0.03], [-0.2, 2.12, -0.01], 0.02, { k: 0.035 })
    .cap('spine', [0.03, 2.12, 0.03], [0.2, 2.15, -0.01], 0.02, { k: 0.035 })
    .sph('sh0', [-0.27, 2.115, -0.02], 0.072)
    .sph('sh1', [0.27, 2.15, -0.02], 0.075)
    .cap('neck', [0, 2.1, 0.0], [0, 2.5, 0.08], 0.042, { k: 0.05 });
  // ribs — thin ridges wrapped on the chest front
  for (const y of [1.8, 1.88, 1.96]) {
    S.cap('spine', [-0.1, y, 0.045], [0, y - 0.02, 0.06], 0.016, { k: 0.028 });
    S.cap('spine', [0, y - 0.02, 0.06], [0.1, y, 0.045], 0.016, { k: 0.028 });
  }
  // vertebrae down the bent back
  for (let i = 0; i < 5; i++) S.sph('spine', [0, 1.52 + i * 0.13, -0.1 - i * 0.008], 0.026, { k: 0.032 });
  // skull: dome + occiput + brow, cheeks hollowed, sockets carved, jaw open
  S.sph('head', [0, 2.66, 0.09], 0.148, { s: [0.85, 1.26, 1.0], k: 0.05 })
    .sph('head', [0, 2.7, 0.0], 0.09, { k: 0.05 })
    .cap('head', [-0.055, 2.71, 0.2], [0.055, 2.71, 0.2], 0.026, { k: 0.03 })
    .cap('head', [0, 2.5, 0.12], [0, 2.46, 0.18], 0.036, { k: 0.03 })     // dropped jaw
    .carve([-0.058, 2.68, 0.21], 0.032, { k: 0.02 })
    .carve([0.058, 2.68, 0.21], 0.032, { k: 0.02 })
    .carve([-0.105, 2.6, 0.15], 0.048, { k: 0.045 })
    .carve([0.105, 2.6, 0.15], 0.048, { k: 0.045 })
    .carve([0, 2.53, 0.2], 0.04, { k: 0.02 })                             // the maw
    .carve([0, 1.62, 0.1], 0.085, { k: 0.05 });                           // sunken gut
  // arms — too long, knobbed elbows, flat too-big hands
  for (const s of [-1, 1]) {
    const sh = s < 0 ? 'sh0' : 'sh1', el = s < 0 ? 'el0' : 'el1', wr = s < 0 ? 'wr0' : 'wr1';
    const shY = s < 0 ? 2.115 : 2.15, elY = s < 0 ? 1.395 : 1.375, wrY = s < 0 ? 0.655 : 0.615;
    const wx = s * 0.27 + (s > 0 ? 0.01 : 0);
    S.cap(sh, [s * 0.27, shY, -0.02], [s * 0.27, elY, -0.02], 0.046)
      .sph(el, [s * 0.27, elY, -0.02], 0.052)
      .cap(el, [s * 0.27, elY, -0.02], [wx, wrY, -0.01], 0.036)
      .cap(wr, [wx, wrY, -0.01], [wx, wrY - 0.1, 0.0], 0.046, { s: [0.72, 1, 0.5], k: 0.04 });
  }
  // legs — thin shanks, heavy knees, long bare feet
  for (const s of [-1, 1]) {
    const hj = s < 0 ? 'hj0' : 'hj1', kn = s < 0 ? 'kn0' : 'kn1';
    const kx = s < 0 ? -0.14 : 0.13;
    S.cap(hj, [s * 0.13, 1.375, 0], [kx, 0.756, 0], 0.066)
      .sph(kn, [kx, 0.756, 0.01], 0.058)
      .cap(kn, [kx, 0.756, 0], [kx, 0.14, -0.01], 0.044)
      .sph(kn, [kx, 0.1, -0.03], 0.048)
      .cap(kn, [kx, 0.07, 0.02], [kx, 0.055, 0.2], 0.036, { s: [0.85, 0.6, 1], k: 0.04 });
  }
  return {
    bones, sculpt: S, height: 2.85,
    domain: { cx: 0, cy: 1.44, cz: 0, hx: 0.62, hy: 1.52, hz: 0.55 },
    res: 144, noise: [0.02, 4.5, 0.006, 26],
  };
}

function dobleSpec() {
  // THE DRAFT — a person-shaped copy, smooth and a little too soft, with an
  // unfinished face (no mouth) and a left hand the lake hasn't read yet.
  const bones = [
    ['hips', null, 0, 0.94, 0],
    ['spine', 'hips', 0, 0.94, 0],
    ['neck', 'spine', 0, 1.55, 0.02],
    ['head', 'neck', 0, 1.72, 0.03],
    ['sh0', 'spine', -0.2, 1.47, -0.01],
    ['sh1', 'spine', 0.2, 1.47, -0.01],
    ['el0', 'sh0', -0.21, 1.14, -0.01],
    ['el1', 'sh1', 0.21, 1.14, -0.01],
    ['wr0', 'el0', -0.215, 0.85, -0.01],
    ['wr1', 'el1', 0.215, 0.85, -0.01],
    ['hj0', 'hips', -0.105, 0.94, 0],
    ['hj1', 'hips', 0.105, 0.94, 0],
    ['kn0', 'hj0', -0.105, 0.53, 0],
    ['kn1', 'hj1', 0.105, 0.53, 0],
  ];
  const S = new Sculpt();
  S.cap('hips', [0, 0.87, 0], [0, 1.0, 0], 0.135, { s: [1, 1, 0.85] })
    .cap('spine', [0, 1.0, 0], [0, 1.2, -0.01], 0.12, { s: [1, 1, 0.8] })
    .cap('spine', [0, 1.22, -0.01], [0, 1.43, -0.02], 0.14, { s: [1, 1, 0.75] })
    .sph('sh0', [-0.2, 1.47, -0.01], 0.068)
    .sph('sh1', [0.2, 1.47, -0.01], 0.068)
    .cap('neck', [0, 1.43, 0.0], [0, 1.63, 0.03], 0.05, { k: 0.05 })
    // a head with almost no face on it
    .sph('head', [0, 1.74, 0.04], 0.115, { s: [0.88, 1.22, 1.0], k: 0.05 })
    .sph('head', [0, 1.77, -0.02], 0.08, { k: 0.05 })
    .sph('head', [0, 1.65, 0.11], 0.038, { k: 0.04 })                     // chin, mouthless
    .carve([-0.046, 1.76, 0.135], 0.026, { k: 0.03 })
    .carve([0.046, 1.76, 0.135], 0.026, { k: 0.03 });
  for (const s of [-1, 1]) {
    const sh = s < 0 ? 'sh0' : 'sh1', el = s < 0 ? 'el0' : 'el1', wr = s < 0 ? 'wr0' : 'wr1';
    S.cap(sh, [s * 0.2, 1.47, -0.01], [s * 0.21, 1.14, -0.01], 0.042)
      .sph(el, [s * 0.21, 1.14, -0.01], 0.045)
      .cap(el, [s * 0.21, 1.14, -0.01], [s * 0.215, 0.85, -0.01], 0.036);
    if (s > 0) S.cap(wr, [0.215, 0.85, -0.01], [0.215, 0.76, 0.0], 0.04, { s: [0.72, 1, 0.5], k: 0.04 });
    else S.sph(wr, [-0.215, 0.79, -0.01], 0.055, { s: [0.75, 1.2, 0.6], k: 0.05 });  // the mitten
  }
  for (const s of [-1, 1]) {
    const hj = s < 0 ? 'hj0' : 'hj1', kn = s < 0 ? 'kn0' : 'kn1';
    S.cap(hj, [s * 0.105, 0.94, 0], [s * 0.105, 0.53, 0], 0.072)
      .sph(kn, [s * 0.105, 0.53, 0.01], 0.052)
      .cap(kn, [s * 0.105, 0.53, 0], [s * 0.105, 0.11, -0.01], 0.046)
      .sph(kn, [s * 0.105, 0.08, -0.025], 0.042)
      .cap(kn, [s * 0.105, 0.055, 0.02], [s * 0.105, 0.045, 0.16], 0.034, { s: [0.85, 0.6, 1], k: 0.04 });
  }
  return {
    bones, sculpt: S, height: 1.88,
    domain: { cx: 0, cy: 0.92, cz: 0, hx: 0.42, hy: 0.98, hz: 0.42 },
    res: 128, noise: [0.011, 3.5, 0.0045, 22],
  };
}

function archiveroSpec() {
  // THE DROWNED CHOIR-COLUMN — a tall, water-smoothed vertical PILLAR of fused
  // human faces and open singing mouths spiralling up one continuous mass: a
  // "singing reef" of everyone the lake has drowned, remade so many times it is
  // a composite of everyone's dead. No arms, no legs, no skirt. It rises from
  // the water; the mouths sing. The vertical bone chain (hips→spine→seg1→seg2→
  // neck→head, rooted at the base) is for F3's peristaltic swell wave — this
  // spec only defines it; the sculpt IS the rest pose.
  const bones = [
    ['hips', null, 0, 0, 0],
    ['spine', 'hips', 0, 0.72, 0],
    ['seg1', 'spine', 0, 1.28, -0.01],
    ['seg2', 'seg1', 0, 1.86, 0.01],
    ['neck', 'seg2', 0, 2.4, 0.03],
    ['head', 'neck', 0, 2.72, 0.14],
  ];
  const S = new Sculpt();
  // --- the column: a flat-based rounded cone rooted in the water, blended into
  // a tapering stack of capsule segments (generous k → one water-smoothed mass).
  // Kept NARROW so the fused faces stand proud of it. Each segment is skinned to
  // its own chain bone so the swell can travel up it.
  S.cone('hips', [0, 0.03, 0], 0.52, 0.36, 0.92, { k: 0.13 });
  S.cap('spine', [0, 0.72, 0.0], [0, 1.22, -0.02], 0.35, { k: 0.19 })
    .cap('seg1', [0, 1.2, -0.02], [0, 1.7, 0.0], 0.3, { k: 0.18 })
    .cap('seg2', [0, 1.68, 0.0], [0, 2.16, 0.02], 0.26, { k: 0.17 })
    .cap('neck', [0, 2.14, 0.02], [0, 2.52, 0.05], 0.22, { k: 0.16 })
    .cap('head', [0, 2.5, 0.08], [0, 2.82, 0.11], 0.2, { k: 0.15 })
    .sph('head', [0, 2.83, 0.1], 0.185, { k: 0.14 });
  // asymmetric swells → the reef undulates rather than tapering as a clean cone
  S.sph('spine', [0.1, 0.98, 0.12], 0.22, { k: 0.2 })
    .sph('seg1', [-0.12, 1.5, -0.04], 0.19, { k: 0.19 })
    .sph('seg2', [0.09, 2.0, 0.1], 0.16, { k: 0.17 });

  // --- faces fused into the column, spiralling up. Each is a skull ellipsoid
  // that PROUDLY EMERGES from the mass (its centre sits near the column surface
  // so its outer half bulges out), with two carved eye sockets and one carved
  // vertical singing mouth on its OUTWARD side. Variety: proud/formed, half-
  // submerged (only brow + open mouth), and upturned (singing skyward).
  const face = (y, a, bone, o = {}) => {
    const rf = o.rf ?? 0.17;
    const rc = o.rc ?? 0.24;                       // face-centre distance from the axis (≈ column radius)
    const ca = Math.cos(a), sa = Math.sin(a);
    const cx = ca * rc, cz = sa * rc;
    // outward normal (optionally tipped skyward) + horizontal lateral
    let ox = ca, oy = o.sky ?? 0, oz = sa;
    const ol = Math.hypot(ox, oy, oz); ox /= ol; oy /= ol; oz /= ol;
    const lx = -sa, lz = ca;
    // the skull/face ellipsoid, blended into the column (bigger k = half-sunk).
    // slightly WIDER than tall so a paired-eye face reads (not a nostril column)
    S.sph(bone, [cx, y, cz], rf, { s: o.s ?? [1.12, 1.18, 1.12], k: o.faceK ?? 0.09 });
    // two eye sockets, set well apart, cut into the outward face
    const eS = rf * (o.eS ?? 0.56), eU = rf * 0.28, eO = rf * 0.82, eR = o.eR ?? rf * 0.38;
    for (const sgn of [-1, 1]) {
      S.carve(
        [cx + lx * eS * sgn + ox * eO, y + eU + oy * eO, cz + lz * eS * sgn + oz * eO],
        eR, { k: 0.026 });
    }
    // open singing mouth — a tall oval slot below the eyes (raised for skyward)
    const mO = rf * 0.82, mH = rf * (o.mH ?? 0.44), mY = y - rf * (o.mDrop ?? 0.54);
    S.carveCap(
      [cx + ox * mO, mY - mH + oy * mO, cz + oz * mO],
      [cx + ox * mO, mY + mH + oy * mO, cz + oz * mO],
      o.mR ?? rf * 0.38, { k: 0.026 });
  };
  // a lone open mouth carved straight into the bare column between the faces
  const mouth = (y, a, rc, len, r) => {
    const ox = Math.cos(a), oz = Math.sin(a);
    S.carveCap([ox * rc, y - len, oz * rc], [ox * rc, y + len, oz * rc], r, { k: 0.028 });
  };

  // spiralling faces (azimuth advances with height). The TOP face is forced to
  // +z so the smear/eyeshine billboards on the head bone land on a real face.
  face(0.52, 2.6, 'hips', { rf: 0.18, rc: 0.4, faceK: 0.13 });                    // half-sunk, rising from the water
  face(0.98, 0.7, 'spine', { rf: 0.19, rc: 0.36 });                               // proud
  face(1.4, 3.2, 'seg1', { rf: 0.18, rc: 0.31 });                                 // proud
  face(1.82, 5.3, 'seg2', { rf: 0.15, rc: 0.24, faceK: 0.14 });                   // half-sunk, only brow + mouth
  face(2.16, 1.4, 'seg2', { rf: 0.16, rc: 0.25, sky: 0.55, mDrop: 0.14, mH: 0.46 }); // upturned, singing skyward
  face(2.47, 3.85, 'neck', { rf: 0.15, rc: 0.22, sky: 0.28 });                    // proud, tilted up
  face(2.72, Math.PI / 2, 'head', { rf: 0.18, rc: 0.15, faceK: 0.09, mDrop: 0.48 }); // the top face, facing forward

  // lone singing maws in the bare column
  mouth(0.76, 1.7, 0.34, 0.07, 0.05);
  mouth(1.6, 4.7, 0.29, 0.08, 0.05);
  mouth(2.28, 0.1, 0.24, 0.06, 0.045);

  return {
    bones, sculpt: S, height: 3.0,
    domain: { cx: 0, cy: 1.5, cz: 0.05, hx: 0.72, hy: 1.62, hz: 0.72 },
    res: 128, noise: [0.018, 3.0, 0.006, 22],
  };
}

const SPECS = { testigo: testigoSpec, doble: dobleSpec, archivero: archiveroSpec };

// ------------------------------------------------------------ public API

// CC0 skin detail (PolyHaven leather_white): wrinkled normal + roughness.
// Preload before the first buildMonsterRig so materials never recompile.
const skinTex = { normal: null, rough: null };
export function skinTextures() { return skinTex; }

export async function preloadMonsterTextures() {
  const loader = new THREE.TextureLoader();
  const load = async (url) => {
    const t = await loader.loadAsync(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  try {
    [skinTex.normal, skinTex.rough] = await Promise.all([
      load('/assets/textures/skin_nor.jpg'),
      load('/assets/textures/skin_rough.jpg'),
    ]);
  } catch {
    // offline or missing files: the canvas flesh texture carries the look
  }
}

// General spec-driven skinned-rig builder. A spec is { sculpt, domain, res,
// noise:[lumpAmp,lumpFreq,fineAmp,fineFreq], height, bones, seed? } — the exact
// shape the per-kind monster specs already return (see testigoSpec). Factored
// out of buildMonsterRig so other continuous bodies (the walking Mara NPC) can
// be skinned through the identical path; monsters call it via buildMonsterRig
// with seed = kind.length*3.1, so their geometry is byte-for-byte unchanged.
export function buildSkinnedRig(spec, material) {
  const t0 = performance.now();
  const geo = polygonize(spec.sculpt, spec.domain, spec.res);
  taubinSmooth(geo, 3);
  const [lumpAmp, lumpFreq, fineAmp, fineFreq] = spec.noise;
  displace(geo, lumpAmp, lumpFreq, fineAmp, fineFreq, spec.seed ?? 0);
  cylinderUVs(geo, spec.height);
  geo.computeVertexNormals();

  const boneNames = spec.bones.map((b) => b[0]);
  skinToBones(geo, spec.sculpt, boneNames);

  const bones = {};
  const list = [];
  for (const [name, parent, x, y, z] of spec.bones) {
    const b = new THREE.Bone();
    b.name = name;
    if (parent) {
      const p = bones[parent];
      b.position.set(x - p.userData.wx, y - p.userData.wy, z - p.userData.wz);
      p.add(b);
    } else {
      b.position.set(x, y, z);
    }
    b.userData.wx = x; b.userData.wy = y; b.userData.wz = z;
    bones[name] = b;
    list.push(b);
  }

  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(list[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  mesh.castShadow = true;
  mesh.frustumCulled = false;    // skinned poses (the crawl) outrun the rest-pose bounds
  mesh.userData.buildMs = Math.round(performance.now() - t0);
  return { mesh, bones, tris: geo.getIndex().count / 3 };
}

export function buildMonsterRig(kind, material) {
  const spec = SPECS[kind]();
  spec.seed = kind.length * 3.1;   // preserve the original per-kind displace seed
  return buildSkinnedRig(spec, material);
}
