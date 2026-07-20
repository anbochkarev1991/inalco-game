import * as THREE from 'three';
import { canvasTexture } from '../world.js';
import { Sculpt, polygonize, taubinSmooth, displace, cylinderUVs } from '../monstermesh.js';

// Shared NPC construction helpers. Bodies are sculpted as one continuous
// signed-distance mass — limbs, torso and draped cloth smooth-blended and
// polygonized by marching cubes, then Taubin-smoothed and noise-folded — so a
// person reads as grown, not assembled from capsules. Faces stay in
// hat-shadow; firelight and posture do the acting.

export function std(color, rough = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

// --------------------------------------------------------------- cloth/skin
// Real CC0 wool weaves (PolyHaven): normal + roughness carry the fibre, the
// material colour does the dye. Loaded before the NPCs build so the shader is
// warm by the title screen (same reason the monster skin maps preload).

export const NPCTEX = {};
export function npcTextures() { return NPCTEX; }

export async function preloadNpcTextures() {
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb = false) => {
    const t = await loader.loadAsync(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  try {
    const [bn, br, hn, hr, hd, sn] = await Promise.all([
      load('assets/textures/wool_boucle_nor_gl.jpg'),
      load('assets/textures/wool_boucle_rough.jpg'),
      load('assets/textures/poly_wool_herringbone_nor_gl.jpg'),
      load('assets/textures/poly_wool_herringbone_rough.jpg'),
      load('assets/textures/poly_wool_herringbone_diff.jpg', true),
      load('assets/textures/skin_nor.jpg'),
    ]);
    Object.assign(NPCTEX, {
      boucleNor: bn, boucleRough: br,
      herringNor: hn, herringRough: hr, herringDiff: hd,
      skinNor: sn,
    });
  } catch {
    // offline: materials fall back to flat-shaded wool colours
  }
}

export function clothMat({ color, map, nor, rough, roughness = 0.96, normalScale = 1.0 }) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  if (map) m.map = map;                    // woven albedo (greyish) × colour = dyed fibre
  if (nor) { m.normalMap = nor; m.normalScale = new THREE.Vector2(normalScale, normalScale); }
  if (rough) m.roughnessMap = rough;
  return m;
}

export function skinMat(color, rough = 0.74) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  if (NPCTEX.skinNor) { m.normalMap = NPCTEX.skinNor; m.normalScale = new THREE.Vector2(0.32, 0.32); }
  return m;
}

// build a continuous mesh from an SDF sculpt: polygonize → smooth → fold → UV
export function sculptMesh(build, material, {
  domain, res = 104, noise = [0.006, 5, 0.003, 22], uvH = 1.6, uRep = 5, vRep = 6, seed = 1,
}) {
  const S = new Sculpt();
  build(S);
  const geo = polygonize(S, domain, res);
  taubinSmooth(geo, 3);
  displace(geo, noise[0], noise[1], noise[2], noise[3], seed);
  cylinderUVs(geo, uvH, uRep, vRep);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// a loose fist / hand — a knuckled, flattened ellipsoid in skin
export function makeHand(mat, r = 0.05, squash = [1.05, 0.82, 1.25]) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const kn = 1 + 0.16 * Math.max(0, Math.sin((z / r) * 3.4)) * Math.max(0, z);  // knuckle ridge (+z)
    p.setXYZ(i, x * squash[0], y * squash[1] * kn, z * squash[2]);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------------ face
// Heads keep the painted 256px face (eyes/brows/weathering). SphereGeometry
// puts +z (the face direction) at u=0.25, so features are painted there.

export function faceTex(opts) {
  const {
    skin = '#8a6a52', beard = null, brows = '#3a2f26', age = 0.4, blush = 0.15,
    iris = '#3a2a1c', seed = 1, eyesClosed = false, mouthOpen = 0,
  } = opts;
  // seeded rng so freckles/beard/hair are IDENTICAL across expression variants
  // (only the eyes/mouth change) — otherwise swapping textures flickers
  let sd = (seed * 2654435761) >>> 0;
  const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  return canvasTexture((c, W, H) => {
    c.fillStyle = skin; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) {
      c.fillStyle = `rgba(${rnd() > 0.5 ? '60,38,26' : '255,222,192'},${0.02 + rnd() * 0.04})`;
      c.beginPath(); c.arc(rnd() * W, rnd() * H, 1 + rnd() * 4, 0, 7); c.fill();
    }
    const fx = W * 0.25, fy = H * 0.44, eyeDX = W * 0.052;
    for (const s of [-1, 1]) {
      const g = c.createRadialGradient(fx + s * W * 0.1, fy + 6, 2, fx + s * W * 0.1, fy + 6, 26);
      g.addColorStop(0, 'rgba(70,44,30,.16)'); g.addColorStop(1, 'rgba(70,44,30,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    for (const s of [-1, 1]) {
      const ex = fx + s * eyeDX, ey = fy;
      const sg = c.createRadialGradient(ex, ey, 1, ex, ey, 13);
      sg.addColorStop(0, 'rgba(38,24,18,.4)'); sg.addColorStop(1, 'rgba(38,24,18,0)');
      c.fillStyle = sg; c.fillRect(ex - 14, ey - 12, 28, 24);
      if (eyesClosed) {
        // a lowered lid: soft skin fold + a lash line curving down
        c.fillStyle = 'rgba(120,86,62,.28)';
        c.beginPath(); c.ellipse(ex, ey - 1, 6, 3, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(38,22,16,.8)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(ex - 6, ey - 0.5); c.quadraticCurveTo(ex, ey + 2.4, ex + 6, ey - 0.5); c.stroke();
      } else {
        c.fillStyle = '#cfc4b2';
        c.beginPath(); c.ellipse(ex, ey, 5.6, 3.4, 0, 0, 7); c.fill();
        c.fillStyle = iris;
        c.beginPath(); c.arc(ex + s * 0.6, ey, 2.7, 0, 7); c.fill();
        c.fillStyle = '#120d0a';
        c.beginPath(); c.arc(ex + s * 0.6, ey, 1.3, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,252,244,.9)';
        c.beginPath(); c.arc(ex + s * 0.6 - 1, ey - 1.1, 0.8, 0, 7); c.fill();
        c.strokeStyle = 'rgba(40,24,18,.8)'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(ex - 6, ey - 2.2); c.quadraticCurveTo(ex, ey - 4.6, ex + 6, ey - 2); c.stroke();
      }
      c.strokeStyle = brows; c.lineWidth = 1.2;
      for (let i = 0; i < 11; i++) {
        const bx = ex - 7 + i * 1.4;
        const by = ey - 8.5 - Math.sin((i / 10) * Math.PI) * 2.4 + age * 1.5;
        c.beginPath(); c.moveTo(bx, by + 2); c.lineTo(bx + 1.1, by - 1.6); c.stroke();
      }
      if (age > 0.3) {
        c.strokeStyle = 'rgba(50,32,24,.4)'; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(ex - 6, ey + 5.4); c.quadraticCurveTo(ex, ey + 7.6, ex + 6, ey + 5.2); c.stroke();
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.moveTo(ex + s * 8.4, ey - 2 + i * 2.4);
          c.lineTo(ex + s * (11.5 + i), ey - 3 + i * 3.2);
          c.stroke();
        }
      }
    }
    if (age > 0.5) {
      c.strokeStyle = 'rgba(56,36,26,.3)'; c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(fx - 14, fy - 17 - i * 4);
        c.quadraticCurveTo(fx, fy - 20 - i * 4, fx + 14, fy - 17 - i * 4);
        c.stroke();
      }
    }
    c.fillStyle = 'rgba(58,34,24,.2)';
    c.beginPath(); c.ellipse(fx - 2.6, fy + 8, 1.6, 6, 0.15, 0, 7); c.fill();
    c.beginPath(); c.ellipse(fx + 2.6, fy + 8, 1.6, 6, -0.15, 0, 7); c.fill();
    c.fillStyle = 'rgba(30,18,14,.55)';
    c.beginPath(); c.ellipse(fx - 2.2, fy + 13.4, 1.3, 0.9, 0.3, 0, 7); c.fill();
    c.beginPath(); c.ellipse(fx + 2.2, fy + 13.4, 1.3, 0.9, -0.3, 0, 7); c.fill();
    c.strokeStyle = `rgba(58,36,26,${0.2 + age * 0.25})`; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(fx - 4.4, fy + 12); c.quadraticCurveTo(fx - 7.4, fy + 17, fx - 5.6, fy + 21); c.stroke();
    c.beginPath(); c.moveTo(fx + 4.4, fy + 12); c.quadraticCurveTo(fx + 7.4, fy + 17, fx + 5.6, fy + 21); c.stroke();
    if (mouthOpen > 0) {
      // parted mouth: dark interior + a hint of teeth, lips ringing it
      const oh = 1.4 + mouthOpen * 2.6;   // opening height grows with amount
      c.fillStyle = 'rgba(26,14,12,.92)';
      c.beginPath(); c.ellipse(fx, fy + 20.2, 4.4, oh, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(206,196,182,.5)';
      c.beginPath(); c.ellipse(fx, fy + 20.2 - oh * 0.55, 3.6, 0.9, 0, 0, Math.PI); c.fill();
      c.strokeStyle = 'rgba(112,58,48,.8)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(fx, fy + 20.2, 5, oh + 0.9, 0, 0, 7); c.stroke();
    } else {
      c.fillStyle = 'rgba(120,62,52,.75)';
      c.beginPath(); c.ellipse(fx, fy + 19.6, 6, 1.7, 0, 0, Math.PI); c.fill();
      c.strokeStyle = 'rgba(40,22,18,.85)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(fx - 6, fy + 19); c.quadraticCurveTo(fx, fy + 20.6 - age * 2, fx + 6, fy + 19); c.stroke();
      c.fillStyle = 'rgba(150,84,70,.5)';
      c.beginPath(); c.ellipse(fx, fy + 22, 4.6, 1.5, 0, 0, Math.PI); c.fill();
    }
    c.fillStyle = `rgba(160,60,40,${blush})`;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(fx + s * 11, fy + 9, 5.5, 3.6, 0, 0, 7); c.fill(); }
    if (beard) {
      for (let i = 0; i < 520; i++) {
        const a = rnd() * Math.PI;
        const rr = 9 + rnd() * 11;
        const bx = fx + Math.cos(a) * rr * 1.5;
        const by = fy + 15 + Math.sin(a) * rr * 0.85;
        if (by < fy + 12) continue;
        c.strokeStyle = `rgba(${rnd() > 0.4 ? '205,200,190' : '150,144,132'},${0.25 + rnd() * 0.3})`;
        c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + (rnd() - 0.5) * 2, by + 2.6 + rnd() * 2); c.stroke();
      }
    }
    c.fillStyle = 'rgba(30,22,16,.55)';
    c.fillRect(W * 0.45, 0, W * 0.55, H * 0.6);
    c.fillStyle = 'rgba(28,20,15,.4)';
    c.fillRect(0, 0, W, H * 0.16);
  }, 256, 256);
}

// a sculpted head: nose, brow ridge, sockets, cheekbones, jaw, chin
export function headGeo(r) {
  const g = new THREE.SphereGeometry(r, 30, 24);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  const e = (q) => Math.exp(-q);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).divideScalar(r);
    const front = Math.max(0, v.z);
    let k = 0;
    k += e((v.x / 0.15) ** 2 + ((v.y + 0.14) / 0.24) ** 2) * 0.36 * front * front;   // nose
    k += e(((v.y - 0.34) / 0.13) ** 2) * 0.05 * front;                                // brow ridge
    k -= e(((Math.abs(v.x) - 0.32) / 0.15) ** 2 + ((v.y - 0.18) / 0.15) ** 2) * 0.09 * front; // sockets
    k += e(((Math.abs(v.x) - 0.52) / 0.2) ** 2 + ((v.y + 0.02) / 0.2) ** 2) * 0.05 * front;   // cheekbones
    k += e((v.x / 0.18) ** 2 + ((v.y + 0.66) / 0.2) ** 2) * 0.14 * front;             // chin
    const jaw = Math.max(0, -v.y);
    const sx = 1 - jaw * 0.24;
    const sz = 1 - jaw * 0.08;
    p.setXYZ(i, v.x * r * sx, v.y * r * 1.08, v.z * r * sz * (1 + k));
  }
  g.computeVertexNormals();
  return g;
}

let _headSeed = 3;
export function makeHead({ skinTone, beard, age, iris, hair = 0x1a140d, neckLen = 0.2 }) {
  const head = new THREE.Group();
  const seed = (_headSeed += 7);
  const base = { skin: skinTone, beard, age, iris, seed };
  // four expression variants — swapped at runtime for blinking / speaking
  const faces = {
    neutral: faceTex(base),
    blink: faceTex({ ...base, eyesClosed: true }),
    talk: faceTex({ ...base, mouthOpen: 1 }),
    talkBlink: faceTex({ ...base, eyesClosed: true, mouthOpen: 1 }),
  };
  const mat = new THREE.MeshStandardMaterial({ map: faces.neutral, roughness: 0.74, metalness: 0 });
  if (NPCTEX.skinNor) { mat.normalMap = NPCTEX.skinNor; mat.normalScale = new THREE.Vector2(0.25, 0.25); }
  const skull = new THREE.Mesh(headGeo(0.112), mat);
  skull.castShadow = true;
  head.add(skull);
  const earMat = skinMat(skinTone, 0.8);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), earMat);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(s * 0.105, -0.005, 0);
    head.add(ear);
  }
  // scalp hair — a dark cap over the crown and back so the skull isn't bald
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });
  const scalp = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 12, 0, Math.PI * 2, 0, 1.35), hairMat);
  scalp.position.set(0, 0.012, -0.012);
  scalp.scale.set(1, 1, 1.04);
  head.add(scalp);
  // a real neck reaching down to the collar so the head doesn't sit in the shoulders
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.066, neckLen, 12), skinMat(skinTone, 0.78));
  neck.position.y = -0.075 - neckLen / 2;
  neck.castShadow = true;
  head.add(neck);
  // expression control (set each frame from update)
  let cur = 'neutral';
  head.userData.setFace = (state) => {
    const t = faces[state] || faces.neutral;
    if (cur !== state) { mat.map = t; cur = state; }
  };
  head.userData.blinkOff = (seed % 100) / 100 * 4;   // stagger blinks per person
  return { head, skull };
}

// felt / straw hat — a domed crown with a dent and a curved, thick brim
export function makeHat({ color, brimR = 0.29, crownR = 0.12, crownH = 0.15, droop = 0.02, rough = 0.9 }) {
  const hat = new THREE.Group();
  const mat = std(color, rough);
  // brim: a shallow lathe bowl so the edge curves down
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const rr = t * brimR;
    pts.push(new THREE.Vector2(rr, -droop * t * t));
  }
  const brim = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat);
  brim.rotation.x = Math.PI;               // bowl opens down
  brim.material.side = THREE.DoubleSide;
  brim.castShadow = true;
  hat.add(brim);
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(crownR * 0.86, crownR, crownH, 20, 3, true), mat);
  crown.position.y = crownH / 2;
  crown.castShadow = true;
  hat.add(crown);
  const top = new THREE.Mesh(new THREE.SphereGeometry(crownR * 0.86, 20, 10, 0, Math.PI * 2, 0, 1.5), mat);
  top.position.y = crownH;
  top.scale.y = 0.5;
  hat.add(top);
  // hat band
  const band = new THREE.Mesh(new THREE.TorusGeometry(crownR * 0.94, 0.014, 6, 20), std(0x2a2018, 0.9));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.016;
  hat.add(band);
  return hat;
}
