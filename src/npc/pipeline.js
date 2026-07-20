import * as THREE from 'three';
import { Sculpt, polygonize, taubinSmooth, displace, cylinderUVs } from '../monstermesh.js';

// Reusable geometry/texture pipeline helpers for the NPC rebuild. The design
// constraint is ZERO added runtime cost: garments get their surface richness
// from normal maps, roughness maps and baked vertex ambient occlusion — all
// free at draw time — rather than from extra triangles. These helpers produce
// exactly those free-detail assets.

// --------------------------------------------------------------- sculptShell
// A cloth-tuned sculpt→mesh: like shared.js `sculptMesh`, but with FEWER Taubin
// iterations (default 1) so garment folds survive the smoothing pass, plus an
// optional bake of concavity AO into the vertex colours.
//
// NOTE: to see baked AO, the mesh material must set `vertexColors: true`
// (pass `ao` here AND give `material` vertex colours — see bakeAO).
export function sculptShell(build, material, {
  domain, res = 96, taubin = 1, noise = [0.004, 5, 0.002, 22],
  uvH = 1.4, uRep = 5, vRep = 6, seed = 1, ao = null,
} = {}) {
  const S = new Sculpt();
  build(S);
  const geo = polygonize(S, domain, res);
  taubinSmooth(geo, taubin);
  displace(geo, noise[0], noise[1], noise[2], noise[3], seed);
  cylinderUVs(geo, uvH, uRep, vRep);
  if (ao) bakeAO(geo, ao === true ? {} : ao);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// -------------------------------------------------------------------- bakeAO
// Cheap cavity/concavity ambient occlusion baked to per-vertex colours — NO
// raycasting, so it costs a handful of adjacency passes at build time and
// nothing at runtime. The occlusion signal is purely local geometry: a vertex
// whose neighbours sit above its tangent plane is in a valley/socket and reads
// darker; a vertex on a ridge/bump is unoccluded.
//
// NOTE: the AO is written into the geometry's `color` attribute, so the mesh
// material MUST set `vertexColors: true` for it to be visible. Any pre-existing
// vertex colour is multiplied (AO darkens the dye), not overwritten.
export function bakeAO(geo, { strength = 1.6, spread = 2, aoMin = 0.35, smooth = 2 } = {}) {
  geo.computeVertexNormals();                       // AO needs fresh normals
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const idx = geo.getIndex().array;
  const count = pos.count;

  // vertex adjacency from the index (same pattern as taubinSmooth)
  const nbr = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b);
  }

  // raw per-vertex concavity: average over neighbours j of
  // dot(normalize(pos[j] - pos[v]), n_v). Positive ⇒ neighbours lie in the
  // outward-normal half-space ⇒ v sits in a hollow ⇒ more occluded.
  let conc = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
    const nx = nor.getX(v), ny = nor.getY(v), nz = nor.getZ(v);
    let sum = 0, m = 0;
    for (const j of nbr[v]) {
      let dx = pos.getX(j) - vx, dy = pos.getY(j) - vy, dz = pos.getZ(j) - vz;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-9) continue;
      sum += (dx * nx + dy * ny + dz * nz) / len;
      m++;
    }
    conc[v] = m ? sum / m : 0;
  }

  // spread the concavity over the surface so AO fills whole folds, not 1-rings
  for (let it = 0; it < spread; it++) {
    const next = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      let sum = conc[v], m = 1;
      for (const j of nbr[v]) { sum += conc[j]; m++; }
      next[v] = sum / m;
    }
    conc = next;
  }

  // map concavity → AO multiplier, clamped so nothing goes fully black
  let ao = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    ao[v] = Math.min(1, Math.max(aoMin, 1 - strength * Math.max(0, conc[v])));
  }

  // a couple of smoothing passes on the AO itself for soft, believable falloff
  for (let it = 0; it < smooth; it++) {
    const next = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      let sum = ao[v], m = 1;
      for (const j of nbr[v]) { sum += ao[j]; m++; }
      next[v] = sum / m;
    }
    ao = next;
  }

  // write into the color attribute (multiply into an existing one if present)
  const existing = geo.getAttribute('color');
  const col = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    const a = ao[v];
    if (existing) {
      col[v * 3] = existing.getX(v) * a;
      col[v * 3 + 1] = existing.getY(v) * a;
      col[v * 3 + 2] = existing.getZ(v) * a;
    } else {
      col[v * 3] = a; col[v * 3 + 1] = a; col[v * 3 + 2] = a;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// -------------------------------------------------------------- heightToNormalTex
// Turn a grayscale height field painted by `drawFn` into a tangent-space normal
// map. Free surface detail: the mesh keeps its triangle count, the lighting gets
// the wrinkles/weave. Follows the canvasTexture pattern in world.js for how the
// texture is wrapped/anisotropic, but the colour space is LINEAR — normal maps
// are data, NOT sRGB, so tex.colorSpace = THREE.NoColorSpace.
export function heightToNormalTex(drawFn, W, H, strength = 2) {
  // paint the height field
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sctx = src.getContext('2d');
  drawFn(sctx, W, H);
  const data = sctx.getImageData(0, 0, W, H).data;

  // grayscale height read (red channel), with clamped edge sampling
  const sample = (x, y) => {
    const cx = x < 0 ? 0 : x >= W ? W - 1 : x;
    const cy = y < 0 ? 0 : y >= H ? H - 1 : y;
    return data[(cy * W + cx) * 4] / 255;
  };

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const outImg = octx.createImageData(W, H);
  const od = outImg.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tl = sample(x - 1, y - 1), tc = sample(x, y - 1), tr = sample(x + 1, y - 1);
      const ml = sample(x - 1, y), mr = sample(x + 1, y);
      const bl = sample(x - 1, y + 1), bc = sample(x, y + 1), br = sample(x + 1, y + 1);
      // Sobel gradients of height
      const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      // tangent-space normal, packed into RGB
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * W + x) * 4;
      od[i] = (nx * 0.5 + 0.5) * 255;
      od[i + 1] = (ny * 0.5 + 0.5) * 255;
      od[i + 2] = (nz * 0.5 + 0.5) * 255;
      od[i + 3] = 255;
    }
  }
  octx.putImageData(outImg, 0, 0);

  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;   // linear: normal maps are NOT sRGB
  return tex;
}
