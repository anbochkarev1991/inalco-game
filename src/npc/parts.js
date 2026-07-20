import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../world.js';
import { steelMat, woodMat } from './materials.js';
import { heightToNormalTex, bakeAO } from './pipeline.js';

// HANDS / HATS / PROPS library (v2) for the NPC overhaul. STANDALONE — does not
// touch shared.js. Everything obeys the same torch rule as materials.js:
// lit surfaces use dropped specularIntensity, steel is matte (never chrome),
// and detail rides on normal/roughness maps + baked vertex AO, not triangles.

// small linear DATA (roughness) canvas texture
function dataTex(draw, w, h) {
  const t = canvasTexture(draw, w, h);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------ makeHand
// v2 hand: a palm with four separated fingers + an opposed thumb, merged into a
// single geometry so it is one draw call and takes baked AO in the clefts (each
// digit's rounded root/knuckle reads as a valley). Keeps the (mat, r) positional
// signature. Reads as a hand — not a knuckled ball — at 2–3 m.
//   opts: { spread=1, curl=0.35, ao=true }
export function makeHand(mat, r = 0.05, opts = {}) {
  const { spread = 1, curl = 0.28, ao = true } = opts;
  const parts = [];

  // palm — a flat, roughly rectangular slab (squashed + tapered sphere) so from
  // any side it reads as a palm, not a ball: wide, thin front-back, with a flat
  // knuckle line the fingers grow straight out of.
  const palm = new THREE.SphereGeometry(r, 16, 12);
  {
    const p = palm.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ty = (y / r + 1) * 0.5;                     // 0 bottom → 1 top (knuckles)
      x *= 1.42 * (0.8 + 0.2 * ty);                     // broad, narrowing to the wrist
      let ny = y * 1.42;
      if (ty > 0.8) ny = r * 1.42 * 0.8 + (y - r * 0.6) * 0.4;   // flatten the knuckle line
      p.setXYZ(i, x, ny, z * 0.38);                     // very flat front-back
    }
    palm.computeVertexNormals();
  }
  parts.push(palm);
  const knuckleY = r * 1.15;                            // fingers grow from the flat top

  // a finger: a thin capsule, curled slightly forward and splayed out.
  const finger = (kx, len, rad, curlAmt, splay) => {
    const g = new THREE.CapsuleGeometry(rad, len, 4, 8);
    g.translate(0, len / 2 + rad, 0);                   // base at the origin, tip up +Y
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-curlAmt));   // curl toward the palm (+z)
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(splay));      // splay out from centre
    g.translate(kx, knuckleY, r * 0.02);                          // rooted into the knuckle line
    return g;
  };

  // four fingers, graded length, spaced so the gaps between them read
  const fw = r * 0.26;                                                // slim fingers → clear clefts
  const lens = [r * 1.2, r * 1.5, r * 1.42, r * 1.05];               // index..little
  const xs = [-1.15, -0.4, 0.38, 1.12].map((u) => u * r * 0.5 * spread);
  for (let i = 0; i < 4; i++) {
    const splay = Math.sign(xs[i]) * (0.08 + Math.abs(xs[i]) / r * 0.12);
    parts.push(finger(xs[i], lens[i], fw, curl, splay));
  }

  // thumb — thicker, opposed low on the side, angled across toward the palm
  {
    const g = new THREE.CapsuleGeometry(r * 0.34, r * 0.9, 4, 8);
    g.translate(0, r * 0.9 / 2 + r * 0.34, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(1.15));         // out to the side
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.55));        // forward toward the palm
    g.translate(-r * 1.15, -r * 0.2, r * 0.12);
    parts.push(g);
  }

  const geo = mergeGeometries(parts, false);
  geo.computeVertexNormals();
  if (ao) bakeAO(geo, { strength: 1.5, spread: 2, aoMin: 0.5 });

  // clone the material so AO (vertexColors) shows without mutating a shared
  // material the caller may reuse; ease the specular so a close torch doesn't
  // blow the whole hand to a featureless white slab.
  const m = mat ? mat.clone() : new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.8 });
  if (ao) { m.vertexColors = true; }
  if (m.specularIntensity !== undefined) m.specularIntensity = Math.min(m.specularIntensity, 0.14);
  if ('color' in m && m.color) m.color.multiplyScalar(0.72);
  m.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  return mesh;
}

// ------------------------------------------------------------------ hat maps
// felt = fine speckled nap; straw = woven horizontal/diagonal plait. Cached.
let _feltMaps = null, _strawMaps = null;
function feltMaps() {
  if (_feltMaps) return _feltMaps;
  const W = 256, H = 256;
  let s0 = 7;
  const R = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
  // greyish albedo so `color` dyes it dark (like clothMat): the felt then lands
  // as a lit dark shift with nap tonal variation, not a flat blown-white dome.
  const map = canvasTexture((c) => {
    c.fillStyle = '#6e6e72'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) {
      const g = c.createRadialGradient(R() * W, R() * H, 2, R() * W, R() * H, 20 + R() * 60);
      const v = R() > 0.5 ? '150,150,156' : '40,40,44';
      g.addColorStop(0, `rgba(${v},${0.06 + R() * 0.12})`); g.addColorStop(1, `rgba(${v},0)`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 4000; i++) {                     // nap speckle
      const v = 80 + Math.floor(R() * 90);
      c.fillStyle = `rgba(${v},${v},${v + 3},${R() * 0.4})`;
      c.fillRect(R() * W, R() * H, 1, 1);
    }
  }, W, H);
  const normal = heightToNormalTex((c) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    let s = 7;
    const rr = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 6000; i++) {                     // dense felt nap
      const v = rr() > 0.5 ? 55 + rr() * 45 : 160 + rr() * 70;
      c.fillStyle = `rgba(${v},${v},${v},0.5)`;
      c.fillRect(rr() * W, rr() * H, 1 + rr(), 1 + rr());
    }
    for (let i = 0; i < 40; i++) {                       // pressed creases / fibres
      c.strokeStyle = rr() > 0.5 ? 'rgba(190,190,190,0.4)' : 'rgba(60,60,60,0.4)';
      c.lineWidth = 0.8 + rr() * 1.4;
      const x0 = rr() * W, y0 = rr() * H, a = rr() * 6.28, len = 20 + rr() * 60;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); c.stroke();
    }
  }, W, H, 1.9);
  const rough = dataTex((c) => {
    c.fillStyle = '#e0e0e0'; c.fillRect(0, 0, W, H);     // felt is very matte
    let s = 13;
    const rr = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 2000; i++) {
      const v = 180 + Math.floor(rr() * 70);
      c.fillStyle = `rgba(${v},${v},${v},${rr() * 0.5})`;
      c.fillRect(rr() * W, rr() * H, 1 + rr() * 2, 1 + rr() * 2);
    }
  }, W, H);
  _feltMaps = { map, normal, rough };
  return _feltMaps;
}
function strawMaps() {
  if (_strawMaps) return _strawMaps;
  const W = 256, H = 256;
  let s0 = 23;
  const R = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
  // woven straw albedo — warm tan bands, kept greyish/mid so the beam doesn't
  // wash it out.
  const map = canvasTexture((c) => {
    c.fillStyle = '#9a7d46'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) {
      for (let x = 0; x < W; x += 14) {
        const off = ((y / 8) % 2) * 7;
        const v = 120 + Math.floor(R() * 60);
        c.fillStyle = `rgba(${v + 40},${v + 10},${v - 40},0.8)`;
        c.beginPath(); c.ellipse(x + off + 6, y + 4, 6, 3, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(60,44,20,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x + off, y); c.lineTo(x + off, y + 8); c.stroke();
      }
    }
  }, W, H);
  const normal = heightToNormalTex((c) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) {
      for (let x = 0; x < W; x += 14) {
        const off = ((y / 8) % 2) * 7;
        c.fillStyle = 'rgba(210,210,210,0.7)';
        c.beginPath(); c.ellipse(x + off + 6, y + 4, 6, 3, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(50,50,50,0.6)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x + off, y); c.lineTo(x + off, y + 8); c.stroke();
      }
    }
  }, W, H, 1.6);
  const rough = dataTex((c) => {
    c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) {
      c.fillStyle = 'rgba(90,90,90,0.4)';
      c.fillRect(0, y + 6, W, 2);
    }
  }, W, H);
  _strawMaps = { map, normal, rough };
  return _strawMaps;
}

// ------------------------------------------------------------------ makeHat
// v2 felt / straw hat: domed crown, curved brim (with a subtle warp), a
// sweat-band inside the crown base, and a weave/felt normal+roughness map. Kept
// torch-safe (MeshPhysical, dropped specularIntensity). Keeps every v1 param.
export function makeHat({
  color = 0x2a2a2a, brimR = 0.29, crownR = 0.12, crownH = 0.15,
  droop = 0.02, rough = 0.9, straw = false,
} = {}) {
  const hat = new THREE.Group();
  const maps = straw ? strawMaps() : feltMaps();
  // felt: the caller's dark colour DYES the greyish felt map down (like clothMat)
  // so it lands as a lit dark shift, not a blown-white dome. straw: the woven
  // tan map carries the colour, so tint near-white.
  const albedo = straw ? 0xd8d2c4 : color;
  const mat = new THREE.MeshPhysicalMaterial({
    color: albedo,
    map: maps.map,
    normalMap: maps.normal,
    roughnessMap: maps.rough,
    normalScale: new THREE.Vector2(straw ? 1.0 : 0.9, straw ? 1.0 : 0.9),
    roughness: rough,
    metalness: 0,
    // felt must stay dark under the point-blank torch — kill the dielectric
    // glaze (same trick as the drowned skin/garment): near-zero specular so the
    // dark albedo's diffuse lands at felt-grey, not a blown-white dome.
    specularIntensity: straw ? 0.3 : 0.05,
    side: THREE.DoubleSide,
  });

  // brim: a shallow lathe bowl so the edge curves down, then warped a touch so
  // it isn't a perfect circle.
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(t * brimR, -droop * t * t));
  }
  const brim = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat);
  brim.rotation.x = Math.PI;                            // bowl opens down
  {
    const p = brim.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const rr = Math.hypot(x, z);
      if (rr > brimR * 0.5) {                           // warp the outer brim only
        const a = Math.atan2(z, x);
        p.setY(i, p.getY(i) + Math.sin(a * 2) * 0.018 * (rr / brimR));
      }
    }
    p.needsUpdate = true;
    brim.geometry.computeVertexNormals();
  }
  brim.castShadow = true;
  brim.receiveShadow = true;
  hat.add(brim);

  // crown wall + domed top
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(crownR * 0.9, crownR, crownH, 24, 3, true), mat);
  crown.position.y = crownH / 2;
  crown.castShadow = true;
  hat.add(crown);
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(crownR * 0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  top.position.y = crownH;
  top.scale.y = 0.62;
  top.castShadow = true;
  hat.add(top);

  // hat band (darker ribbon around the crown base)
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(crownR * 0.97, 0.016, 8, 28),
    new THREE.MeshPhysicalMaterial({ color: 0x241c16, roughness: 0.85, metalness: 0, specularIntensity: 0.2 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.02;
  hat.add(band);

  // sweat-band: a thin ring just inside the crown opening (visible when tipped)
  const sweat = new THREE.Mesh(
    new THREE.CylinderGeometry(crownR * 0.98, crownR * 0.98, 0.022, 24, 1, true),
    new THREE.MeshPhysicalMaterial({ color: straw ? 0x5a4326 : 0x3a2c1e, roughness: 0.7, metalness: 0, specularIntensity: 0.2, side: THREE.DoubleSide }));
  sweat.position.y = 0.006;
  hat.add(sweat);

  return hat;
}

// ------------------------------------------------------------------ makeMate
// A yerba-mate set: a flattened gourd cup with a metal rim and an angled
// bombilla straw. Dark gourd (woodMat), matte steel rim + straw (steelMat).
// Sized ~0.05–0.11 m. Returns a Group (cup upright, straw leaning out).
export function makeMate() {
  const g = new THREE.Group();
  const gourdM = woodMat();
  gourdM.color = new THREE.Color(0x2e2013);            // dark cured gourd

  // gourd body — a squashed sphere, open (flattened) top
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 16), gourdM);
  body.scale.set(1, 1.12, 1);
  body.position.y = 0.05;
  body.castShadow = true;
  g.add(body);
  // a slight foot so it sits
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.012, 14), gourdM);
  foot.position.y = 0.006;
  g.add(foot);

  const steel = steelMat();
  // metal rim around the mouth
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 8, 22), steel);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.098;
  rim.castShadow = true;
  g.add(rim);

  // bombilla straw — a thin steel tube angled out of the cup with a flared
  // filter foot at the bottom and a mouthpiece bend at the top
  const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, 8), steel);
  bomb.position.set(0.02, 0.1, 0.01);
  bomb.rotation.z = 0.5;
  bomb.rotation.x = -0.15;
  bomb.castShadow = true;
  g.add(bomb);
  const filter = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), steel);
  filter.scale.set(1, 0.6, 1);
  filter.position.set(-0.006, 0.052, 0.004);
  g.add(filter);

  return g;
}

// ------------------------------------------------------------------ makeSpade
// A garden spade ~1.2 m tall: worn wooden shaft (woodMat), a D-grip at the top,
// a matte steel blade at the bottom (steelMat — deliberately NOT chrome).
// Returns a Group with the blade at the bottom, shaft up the +y axis.
export function makeSpade() {
  const g = new THREE.Group();
  const wood = woodMat();
  const steel = steelMat();

  // shaft
  const shaftLen = 0.82;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, shaftLen, 12), wood);
  shaft.position.y = 0.34 + shaftLen / 2;              // sits above the blade socket
  shaft.castShadow = true;
  g.add(shaft);

  // D-grip at the top: two short uprights + a cross handle (torus arc)
  const gripY = 0.34 + shaftLen;
  for (const s of [-1, 1]) {
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.11, 8), wood);
    up.position.set(s * 0.035, gripY + 0.055, 0);
    up.rotation.z = -s * 0.18;
    up.castShadow = true;
    g.add(up);
  }
  const dgrip = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 8, 18, Math.PI), wood);
  dgrip.position.set(0, gripY + 0.11, 0);
  dgrip.castShadow = true;
  g.add(dgrip);
  // the split where the shaft splits into the D (a small wedge block)
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.05, 8), wood);
  yoke.position.set(0, gripY + 0.01, 0);
  g.add(yoke);

  // blade socket (steel collar) then the blade
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.026, 0.07, 10), steel);
  socket.position.y = 0.33;
  socket.castShadow = true;
  g.add(socket);

  // blade — a slightly dished, tapered plate. Build from a box, taper the
  // bottom to a rounded digging edge, dish it, and bevel.
  const blade = new THREE.BoxGeometry(0.17, 0.26, 0.012, 6, 10, 1);
  {
    const p = blade.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ty = (y + 0.13) / 0.26;                    // 0 at bottom → 1 at top
      const taper = 0.55 + 0.45 * ty;                  // narrower toward the digging edge
      let ny = y;
      if (ty < 0.12) ny = -0.13 + (0.13 + y) * 0.5;    // round the very bottom edge in
      const dish = -0.012 * (1 - (x / 0.085) ** 2) * (z > 0 ? 1 : 0.3);   // concave front
      p.setXYZ(i, x * taper, ny, z + dish);
    }
    blade.computeVertexNormals();
  }
  const bladeMesh = new THREE.Mesh(blade, steel);
  bladeMesh.position.y = 0.18;
  bladeMesh.castShadow = true;
  bladeMesh.receiveShadow = true;
  g.add(bladeMesh);

  return g;
}

// ------------------------------------------------------------------ makeHeadlamp
// A small brow headlamp, switched OFF: an elastic band arc, a housing box and a
// dark (unlit) lens. ~0.06 m. Returns a Group meant to sit on the brow, lens
// facing +z. Off = the lens is a near-black glass disc, no emissive.
export function makeHeadlamp() {
  const g = new THREE.Group();
  // dark rubber/plastic; near-zero specular so the torch can't glaze it white.
  const bandMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, roughness: 0.92, metalness: 0, specularIntensity: 0.04 });
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0x17191d, roughness: 0.75, metalness: 0.05, specularIntensity: 0.06 });

  // elastic band — a HORIZONTAL arc wrapping the front of the brow (ring around
  // Y, front half only)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 10, 32, Math.PI * 1.2), bandMat);
  band.rotation.x = Math.PI / 2;                        // lay the ring flat (around +Y)
  band.rotation.z = Math.PI * 0.4;                      // centre the open arc at the back
  band.castShadow = true;
  g.add(band);

  // housing — a rounded box on the front of the band
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.02, 2, 2, 2), shellMat);
  housing.position.set(0, 0, 0.05);
  housing.castShadow = true;
  g.add(housing);
  // a small battery/switch box behind
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.01), shellMat);
  sw.position.set(0.012, 0.006, 0.05);
  g.add(sw);

  // reflector bezel + dark lens (OFF — unlit near-black glass, no emissive)
  const bezel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.011, 0.008, 16), shellMat);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.set(0, 0, 0.06);
  g.add(bezel);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.011, 18),
    new THREE.MeshBasicMaterial({ color: 0x060708 }));   // unlit: stays black even in the beam
  lens.position.set(0, 0, 0.0645);
  g.add(lens);

  return g;
}
