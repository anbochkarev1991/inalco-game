import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { PAL, LAYOUT, TUNE } from './config.js';
import { canvasTexture, makeSign, plasterTex, planksTex, shinglesTex, stoneTex, shutterTex, CELLAR } from './world.js';
import { spawn } from './assets.js';
import { buildCellarGirl } from './npcs.js';
import { makeHead } from './npc/face.js';
import { makeHat } from './npc/parts.js';
import { buildTheThing } from './thething.js';

// A simple standing "Anna" — the photographer we play — for the upstairs mirror's
// live reflection. Reuses the NPC face/hat builders so she doesn't read as crude
// primitives. Built facing +z; feet at y=0. Rendered ONLY by the mirror (layer 2).
function buildAnnaProxy() {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.93, metalness: 0 });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.92, 8), coat); legs.position.y = 0.5; g.add(legs);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.72, 10), coat); torso.position.y = 1.16; g.add(torso);
  const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 3, 8), coat); sh.rotation.z = Math.PI / 2; sh.position.y = 1.46; g.add(sh);
  for (const sx of [-1, 1]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.52, 3, 6), coat); a.position.set(sx * 0.24, 1.16, 0.03); a.rotation.x = 0.12; g.add(a); }
  const { head } = makeHead({ skinTone: '#9c7c62', age: 0.3, iris: '#41352a', hair: 0x2a2018, hairStyle: 'scalp', neckLen: 0.09, shape: { faceLength: 1.0, jawWidth: 0.9, browHeavy: 0.8, noseLen: 0.95 }, ruddy: 0.1 });
  head.position.set(0, 1.6, 0.03); g.add(head);
  const hat = makeHat({ color: 0x2b2620, brimR: 0.25, crownR: 0.11, crownH: 0.14 }); hat.position.set(0, 1.72, 0.03); g.add(hat);
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 })); cam.position.set(0, 1.18, 0.24); g.add(cam);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0x0a0a0a })); lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.18, 0.29); g.add(lens);
  return g;
}

const HX = LAYOUT.house.x, HZ = LAYOUT.house.z, FY = LAYOUT.house.y; // floor Y
const WALL_H = 3.2;

// shared materials — Standard, rough and matte: surfaces respond to the
// flashlight like real matter, and nothing sparkles
const mat = {
  plaster: new THREE.MeshStandardMaterial({ color: PAL.houseWall, map: plasterTex(), roughness: 0.96, metalness: 0 }),
  plasterIn: new THREE.MeshStandardMaterial({ color: 0xb5b9ac, map: plasterTex(), roughness: 0.96, metalness: 0 }),
  stone: new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.95, metalness: 0 }),
  roof: new THREE.MeshStandardMaterial({ color: PAL.roof, roughness: 0.9, metalness: 0, flatShading: true }),
  shingle: new THREE.MeshStandardMaterial({ map: shinglesTex(), roughness: 0.92, metalness: 0 }),
  shutter: new THREE.MeshStandardMaterial({ map: shutterTex(), roughness: 0.85, metalness: 0 }),
  greenWood: new THREE.MeshStandardMaterial({ color: 0x35503f, roughness: 0.8, metalness: 0 }),   // Bustillo green trim: posts, beams, bargeboards, fascia
  wood: new THREE.MeshStandardMaterial({ color: PAL.wood, roughness: 0.86, metalness: 0 }),
  woodDark: new THREE.MeshStandardMaterial({ color: PAL.woodDark, roughness: 0.86, metalness: 0 }),
  plank: new THREE.MeshStandardMaterial({ map: planksTex(0x6d5339), roughness: 0.85, metalness: 0 }),
  plankDark: new THREE.MeshStandardMaterial({ map: planksTex(0x453424), roughness: 0.85, metalness: 0 }),
  // weathered wood-plank cladding for the house walls — the real Inalco is clad in
  // old boards, not render. Silvered grey-tan so it stays pale/eerie against the forest.
  plankWall: new THREE.MeshStandardMaterial({ map: (() => { const t = planksTex(0xa39a88); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })(), roughness: 0.9, metalness: 0 }),
  glass: new THREE.MeshStandardMaterial({ color: PAL.glass, roughness: 0.14, metalness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x565c60, roughness: 0.42, metalness: 0.8, flatShading: true }),
  white: new THREE.MeshStandardMaterial({ color: 0x7f867f, roughness: 0.92, metalness: 0 }),
  paneGlass: new THREE.MeshStandardMaterial({ color: 0xbfd4d8, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  // see-through house window glazing: dark, glassy, transparent both ways so the
  // Returned are visible massing in the yard through the cut wall openings.
  winGlass: new THREE.MeshStandardMaterial({ color: 0x0e1a1f, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }),
};

function box(w, h, d, m, x, y, z, ry = 0, rx = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
// A translated box BufferGeometry (geometry-space), for batching into a single
// merged mesh — the perf antidote to "I added N boxes".
function boxGeo(w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.rotateX(rx), g.rotateY(ry), g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
// Merge same-material geometries into one Mesh and add it to target. Only ever
// pass STATIC, same-material sub-meshes; leave doors/props/lights separate.
function mergeInto(target, geos, material, { castShadow = true, receiveShadow = true } = {}) {
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
  target.add(mesh);
  return mesh;
}
function cyl(r0, r1, h, m, x, y, z, seg = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// blurry portrait paintings — every portrait here is blurry, of course
function paintingTexture(seed) {
  return canvasTexture((c, W, H) => {
    const r = (n) => { seed = (seed * 9301 + 49297) % 233280; return (seed / 233280) * n; };
    c.fillStyle = `rgb(${34 + r(20) | 0},${28 + r(14) | 0},${20 + r(10) | 0})`;
    c.fillRect(0, 0, W, H);
    const fx = W / 2 + r(30) - 15, fy = H * 0.42;
    const g = c.createRadialGradient(fx, fy, 8, fx, fy, 66);
    g.addColorStop(0, 'rgba(190,168,138,.85)'); g.addColorStop(0.55, 'rgba(120,100,80,.4)'); g.addColorStop(1, 'rgba(60,50,40,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(fx, fy, 44, 60, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(30,26,22,.8)';
    c.fillRect(W * 0.2, H * 0.62, W * 0.6, H * 0.34);   // dark clothes
    // horizontal smear
    for (let i = 0; i < 26; i++) {
      const y = r(H);
      const img = c.getImageData(0, y, W, 2);
      c.putImageData(img, r(24) - 12, y);
    }
    c.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < 60; i++) c.fillRect(r(W), r(H), r(3), r(20));
  }, 128, 160);
}
function painting(x, y, z, ry, seed, s = 1) {
  const g = new THREE.Group();
  const frame = box(0.94 * s, 1.18 * s, 0.06, mat.woodDark, 0, 0, 0);
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8 * s, 1.04 * s),
    new THREE.MeshLambertMaterial({ map: paintingTexture(seed) })
  );
  art.position.z = 0.035;
  g.add(frame, art);
  g.position.set(x, y, z); g.rotation.y = ry;
  return g;
}

// old stone, stained. Dark red drips, spatter, a dragged handprint or two, and
// a word scratched into the wall by someone who had a lot of time down here.
// The cellar walls: cold, damp, mould-eaten cut stone. Instead of a regular
// brick grid on a flat fill (which read like a child's drawing), the stones are
// laid in irregular courses of jittered size and shade, seamed with near-black
// damp mortar, then bled over with water stains, mould, seep and sparse old
// blood. A matching relief map (drawCellarBump) is generated from the SAME block
// layout so the failing bulb throws real shadow into the joints.
function drawCellarAlbedo(c, W, H, blocks) {
  // near-black damp mortar shows through the gaps between stones
  c.fillStyle = '#10140e'; c.fillRect(0, 0, W, H);
  // broad tonal blotches so the wall never reads as one flat colour
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 50 + Math.random() * 150;
    const g = c.createRadialGradient(x, y, 1, x, y, r);
    const col = Math.random() > 0.5 ? '10,16,11' : '44,56,42';
    g.addColorStop(0, `rgba(${col},${0.16 + Math.random() * 0.2})`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // irregular cold-green stones with a carved top-light / bottom-shadow
  for (const b of blocks) {
    const bx = b.x + 2, by = b.y + 2, bw = b.w - 4, bh = b.h - 4;
    const g = (44 + Math.random() * 18) * b.shade;      // green-dominant, per-stone
    c.fillStyle = `rgb(${(g * 0.72) | 0},${g | 0},${(g * 0.76) | 0})`;
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = 'rgba(150,175,140,0.05)'; c.fillRect(bx, by, bw, 2);        // catch-light
    c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(bx, by + bh - 2, bw, 2);     // drop shadow
    for (let s = 0; s < 22; s++) {                       // pitting / mineral speckle
      const v = Math.random();
      const t = v > 0.72 ? 80 + Math.random() * 45 : 18 + Math.random() * 26;
      c.fillStyle = `rgba(${(t * 0.8) | 0},${t | 0},${(t * 0.72) | 0},${0.1 + Math.random() * 0.18})`;
      c.fillRect(bx + Math.random() * bw, by + Math.random() * bh, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }
  // water bleeding straight down from the ceiling line
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * W, w = 6 + Math.random() * 26, len = 80 + Math.random() * 260;
    const g = c.createLinearGradient(x, 0, x, len);
    g.addColorStop(0, 'rgba(8,14,10,0.5)'); g.addColorStop(1, 'rgba(8,14,10,0)');
    c.fillStyle = g; c.fillRect(x - w / 2, 0, w, len);
  }
  // mould / mildew blotches, biased low and toward the joints
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W, y = H * (0.3 + Math.random() * 0.7), r = 8 + Math.random() * 40;
    const g = c.createRadialGradient(x, y, 1, x, y, r);
    const moss = Math.random() > 0.55 ? '104,126,52' : '58,80,44';   // sickly vs deep moss
    g.addColorStop(0, `rgba(${moss},${0.12 + Math.random() * 0.22})`);
    g.addColorStop(0.6, `rgba(${moss},${0.05 + Math.random() * 0.1})`);
    g.addColorStop(1, `rgba(${moss},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // dark damp rising off the floor
  const seep = c.createLinearGradient(0, H, 0, H * 0.55);
  seep.addColorStop(0, 'rgba(6,10,7,0.7)'); seep.addColorStop(1, 'rgba(6,10,7,0)');
  c.fillStyle = seep; c.fillRect(0, H * 0.55, W, H * 0.45);
  // sparse, old, oxidised blood — dread, not decoration
  const blood = (a) => `rgba(${64 + Math.random() * 22 | 0},${10 + Math.random() * 8 | 0},${8 + Math.random() * 6 | 0},${a})`;
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * W, y0 = Math.random() * H * 0.5, len = 30 + Math.random() * 120;
    c.strokeStyle = blood(0.35 + Math.random() * 0.3); c.lineWidth = 1.5 + Math.random() * 4;
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x + (Math.random() - 0.5) * 10, y0 + len); c.stroke();
  }
  for (let i = 0; i < 70; i++) {
    c.fillStyle = blood(0.2 + Math.random() * 0.35);
    c.beginPath(); c.arc(Math.random() * W, Math.random() * H, Math.random() * 2.5 + 0.4, 0, 7); c.fill();
  }
  // clawed gouges scored into the stone (replacing the old lettered word)
  for (let gset = 0; gset < 3; gset++) {
    const ox = W * (0.1 + Math.random() * 0.7), oy = H * (0.2 + Math.random() * 0.5);
    const ang = -0.5 + Math.random() * 0.4, dx = Math.sin(ang) * 40, dy = Math.cos(ang) * 40;
    for (let k = 0; k < 4; k++) {
      const sx = ox + k * 7, sy = oy;
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.4;               // dark groove
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + dx, sy + dy); c.stroke();
      c.strokeStyle = `rgba(150,165,140,${0.12 + Math.random() * 0.1})`;  // pale scored edge
      c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(sx + 1, sy); c.lineTo(sx + 1 + dx, sy + dy); c.stroke();
    }
  }
  // damp darkening toward the edges
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
}

// Grayscale relief for the wall bumpMap, drawn from the SAME block layout as the
// albedo so joints, proud faces and pitting line up: mortar recessed (dark),
// stone faces proud (light), with a lit top edge and shadowed sides.
function drawCellarBump(c, W, H, blocks) {
  c.fillStyle = '#242424'; c.fillRect(0, 0, W, H);      // deep mortar = recessed
  for (const b of blocks) {
    const bx = b.x + 2, by = b.y + 2, bw = b.w - 4, bh = b.h - 4;
    const face = 140 + (b.shade - 1) * 40;
    c.fillStyle = `rgb(${face | 0},${face | 0},${face | 0})`;
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(bx, by, bw, 2);       // proud top edge
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx, by + bh - 2, bw, 2);    // recessed bottom
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(bx, by, 2, bh);             // recessed side
    for (let s = 0; s < 30; s++) {                                          // surface pitting
      const v = Math.random() > 0.5 ? 205 : 70;
      c.fillStyle = `rgba(${v},${v},${v},0.14)`;
      c.fillRect(bx + Math.random() * bw, by + Math.random() * bh, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }
}

// Build (once) the shared block layout and both textures for the cellar walls.
let _cellarWall = null;
function cellarWallTextures() {
  if (_cellarWall) return _cellarWall;
  const W = 512, H = 512, blocks = [];
  for (let y = -8; y < H + 8;) {                          // irregular courses...
    const rh = 30 + Math.random() * 26;
    for (let x = -Math.random() * 70; x < W;) {           // ...of jittered stones
      const bw = 40 + Math.random() * 80;
      blocks.push({ x, y, w: bw, h: rh, shade: 0.72 + Math.random() * 0.56 });
      x += bw - 3 + Math.random() * 6;
    }
    y += rh - 3 + Math.random() * 6;
  }
  const map = canvasTexture((c) => drawCellarAlbedo(c, W, H, blocks), W, H);
  const bump = canvasTexture((c) => drawCellarBump(c, W, H, blocks), W, H);
  for (const t of [map, bump]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _cellarWall = { map, bump };
  return _cellarWall;
}

// The cellar girl's behaviour controller. The MESH — a sculpted, painted-face
// drowned child with an unnaturally long neck — is built by buildCellarGirl()
// in npcs.js with the same SDF/marching-cubes pipeline the living NPCs use, so
// she reads as a real person, not assembled primitives. Here we only drive her:
// idle weeping with the head bowed and lolling, a lurch-and-chase attack, the
// camera flash, and the dissolve.
function makeGirl(x, z, ground, canRoam, homeYaw = 0) {
  const { group: root, head, mats } = buildCellarGirl();
  for (const m of mats) if (m.emissive) m.emissive.setHex(0xffffff);   // white flash-burn (intensity 0 at rest)
  root.position.set(x, ground(x, z), z);
  root.rotation.y = homeYaw;

  const worldPos = new THREE.Vector3();
  const camFlat = new THREE.Vector3();
  const toGirl = new THREE.Vector3();
  const setBurn = (v) => { for (const m of mats) if (m.emissive) m.emissiveIntensity = v; };
  const setFade = (o) => { for (const m of mats) { m.transparent = o < 1; m.opacity = o; } };

  const ctrl = {
    group: root, mode: 'idle', flashes: 0, capacity: 5,
    _t: 0, _rise: 0, _stag: 0, _flashBurn: 0, _cryT: 0, _facing: 0, _hitCd: 0,
    get pos() { return root.position; },
    get dead() { return this.mode === 'gone'; },
    get active() { return this.mode === 'attack' || this.mode === 'dying'; },

    cry() { this._cryT = 1.4; },                       // a shudder of weeping

    startAttack() {
      if (this.mode === 'attack' || this.mode === 'dying' || this.mode === 'gone') return;
      this.mode = 'attack'; this._flashBurn = 0.4;
    },

    reset() {
      this.mode = 'idle'; this.flashes = 0; this._rise = 0; this._stag = 0; this._cryT = 0; this._flashBurn = 0;
      root.position.set(x, ground(x, z), z); root.rotation.set(0, homeYaw, 0); root.scale.setScalar(1); root.visible = true;
      head.rotation.set(0, 0, 0);
      setFade(1); setBurn(0);
    },

    // camera flash: only bites while she's coming for you
    flash(camPos, camDir) {
      if (this.mode !== 'attack') return false;
      root.getWorldPosition(worldPos);
      const d = Math.hypot(worldPos.x - camPos.x, worldPos.z - camPos.z);
      if (d > TUNE.flashRange) return false;
      toGirl.set(worldPos.x - camPos.x, 0, worldPos.z - camPos.z).normalize();
      camFlat.set(camDir.x, 0, camDir.z).normalize();
      if (toGirl.dot(camFlat) < TUNE.flashCos && d > 2.0) return false;
      this.flashes++; this._flashBurn = 1; this._stag = 1.1;
      const kb = 2.2;                                   // flung back from the record of what she is
      root.position.x -= toGirl.x * kb; root.position.z -= toGirl.z * kb;
      if (this.flashes >= this.capacity) { this.mode = 'dying'; this._t = 0; }
      return true;
    },

    update(dt, t, ctx) {
      if (this.mode === 'gone') return;
      this._t += dt;
      this._hitCd = Math.max(0, this._hitCd - dt);
      this._cryT = Math.max(0, this._cryT - dt);
      this._flashBurn = Math.max(0, this._flashBurn - dt * 2.2);
      this._stag = Math.max(0, this._stag - dt);

      const target = (this.mode === 'attack' || this.mode === 'dying') ? 1 : 0;
      this._rise += (target - this._rise) * Math.min(1, dt * 3.5);

      // ---- movement while hunting
      if (this.mode === 'attack' && ctx?.playerPos) {
        const p = ctx.playerPos;
        const dx = p.x - root.position.x, dz = p.z - root.position.z;
        const d = Math.hypot(dx, dz) || 1e-3;
        this._facing = Math.atan2(dx, dz);
        const inReach = !canRoam || canRoam(root.position.x, root.position.z);
        if (this._stag <= 0 && inReach) {
          const step = Math.min(2.6 * dt, Math.max(0, d - 0.9));
          root.position.x += (dx / d) * step; root.position.z += (dz / d) * step;
        }
        root.position.y += (ground(root.position.x, root.position.z) - root.position.y) * Math.min(1, dt * 8);
        if (d < 1.5 && this._hitCd <= 0 && this._stag <= 0) {
          this._hitCd = 1.2; ctx.onHit?.(15, root.position); ctx.audio?.hitSting?.();
        }
      } else if (this.mode !== 'dying') {
        root.position.y += (ground(root.position.x, root.position.z) - root.position.y) * Math.min(1, dt * 8);
      }
      // face the player when roused, otherwise face the doorway
      const wantYaw = this.mode === 'attack' ? this._facing : homeYaw;
      let dy = wantYaw - root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.y += dy * Math.min(1, dt * (this.mode === 'attack' ? 5 : 1.5));

      // ---- pose: head bows + lolls while weeping; rears up and the body lurches
      // forward toward Ana on the attack. (The long neck is baked into the mesh.)
      const r = this._rise;
      const cry = this._cryT > 0 ? Math.sin(t * 22) * 0.02 : 0;
      root.rotation.x = 0.05 * (1 - r) + 0.16 * r + cry * 0.3;          // hunch → lurch
      head.rotation.x = (0.34 + Math.sin(t * 0.6) * 0.06) * (1 - r) - 0.3 * r;
      head.rotation.z = (Math.sin(t * 0.45) * 0.15 + 0.05) * (1 - r) + Math.sin(t * 3) * 0.03 * r;
      if (this.mode !== 'dying') root.scale.setScalar(1 + 0.05 * r);
      if (this._cryT > 0) root.position.y += Math.sin(t * 24) * 0.01;

      setBurn(this._flashBurn * this._flashBurn * 2.4);

      // ---- dissolving: fade, and stretch thin upward as it lets go
      if (this.mode === 'dying') {
        const k = Math.min(1, this._t / 1.0);
        setFade(1 - k);
        root.scale.set(1 - k * 0.25, 1 + k * 1.1, 1 - k * 0.25);
        root.position.y += dt * 0.6;
        if (k >= 1) { this.mode = 'gone'; root.visible = false; }
      }
    },
  };
  ctrl.reset();
  return ctrl;
}

function makeDoor(scene, colliders, { x, z, y, w = 1.16, h = 2.16, axis = 'x', swing = 1, locked = false, name = 'door' }) {
  // axis: direction the wall runs. hinge at one end of the opening.
  const group = new THREE.Group();
  const leaf = box(axis === 'x' ? w : 0.09, h, axis === 'x' ? 0.09 : w, mat.woodDark,
    axis === 'x' ? w / 2 : 0, h / 2, axis === 'x' ? 0 : w / 2);
  // panel detail + handle
  const panel = box(axis === 'x' ? w * 0.72 : 0.05, h * 0.6, axis === 'x' ? 0.05 : w * 0.72, mat.wood,
    axis === 'x' ? w / 2 : 0.055, h * 0.52, axis === 'x' ? 0.055 : w / 2);
  const knob = cyl(0.035, 0.035, 0.09, mat.metal,
    axis === 'x' ? w * 0.82 : 0.09, h * 0.48, axis === 'x' ? 0.09 : w * 0.82, 6);
  knob.rotation.x = Math.PI / 2;
  group.add(leaf, panel, knob);
  const hx = axis === 'x' ? x - w / 2 : x;
  const hz = axis === 'x' ? z : z - w / 2;
  group.position.set(hx, y, hz);
  scene.add(group);
  const collider = colliders.addBox(x, z, axis === 'x' ? w : 0.3, axis === 'x' ? 0.3 : w, { blocksSight: true, tag: name });
  return {
    group, collider, locked, name,
    open: false, t: 0, target: 0, swing,
    axis, cx: x, cz: z,
    setOpen(v) { this.open = v; this.target = v ? 1 : 0; },
    update(dt) {
      this.t += (this.target - this.t) * Math.min(1, dt * 3.2);
      group.rotation.y = this.t * 1.92 * this.swing;
      this.collider.enabled = this.t < 0.25;
    },
  };
}

// An upright piano with a top lid that lifts on the hinge, a keyboard with real
// black-key grouping, a music desk, pedals — and a bench in front to sit at.
// Returns the group, the hinged lid pivot, and an update() to animate the lid.
function buildPiano() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x241610, roughness: 0.46, metalness: 0.0 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b0f0a, roughness: 0.5, metalness: 0.0 });
  const feltMat = new THREE.MeshStandardMaterial({ color: 0x4a1018, roughness: 0.95, metalness: 0.0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7736, roughness: 0.34, metalness: 0.75 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xe9e3d2, roughness: 0.58, metalness: 0.0 });
  const ebony = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.5, metalness: 0.0 });

  const W = 1.5, H = 1.16, D = 0.6;         // front faces +z; back (-z) to the wall
  const body = box(W, H, D, bodyMat, 0, H / 2, -0.12); g.add(body);
  // recessed front panels (upper decorative, lower key-cover)
  g.add(box(W * 0.88, 0.44, 0.05, panelMat, 0, 0.98, 0.17));
  g.add(box(W * 0.88, 0.34, 0.05, panelMat, 0, 0.42, 0.17));
  // keybed shelf + cheek blocks
  g.add(box(W * 0.96, 0.1, 0.36, bodyMat, 0, 0.72, 0.24));
  for (const sx of [-1, 1]) g.add(box(0.09, 0.16, 0.36, bodyMat, sx * W * 0.46, 0.82, 0.24));
  // white keys as one slab, then the black keys in their 2-3 groups
  const kW = W * 0.84;
  g.add(box(kW, 0.045, 0.24, ivory, 0, 0.8, 0.30));
  const octaves = 2, whitePer = 7, nWhite = octaves * whitePer;
  const wStep = kW / nWhite;
  const blackAfter = [0, 1, 3, 4, 5];       // black keys sit after these white indices in an octave
  for (let o = 0; o < octaves; o++) {
    for (const b of blackAfter) {
      const wi = o * whitePer + b;
      const bx = -kW / 2 + (wi + 1) * wStep;
      g.add(box(wStep * 0.56, 0.05, 0.15, ebony, bx, 0.83, 0.265));
    }
  }
  // music desk (angled sheet rest) rising behind the keys
  const desk = box(W * 0.8, 0.34, 0.03, panelMat, 0, 1.02, 0.16); desk.rotation.x = -0.32; g.add(desk);
  // three brass pedals in a lyre at the foot
  g.add(box(0.16, 0.24, 0.06, bodyMat, 0, 0.12, 0.24));
  for (const px of [-0.09, 0, 0.09]) g.add(box(0.05, 0.02, 0.12, brass, px, 0.09, 0.30));
  // candle sconces (unlit brass) on the front face
  for (const sx of [-1, 1]) g.add(cyl(0.015, 0.015, 0.12, brass, sx * 0.55, 1.16, 0.2, 6));

  // hinged top lid — pivots at the back top edge, lifts to reveal the strings
  const lid = new THREE.Group();
  lid.position.set(0, H, -0.12 - D / 2);            // hinge at the back-top edge
  const lidBoard = box(W, 0.05, D, bodyMat, 0, 0, D / 2);
  lid.add(lidBoard); g.add(lid);
  // interior revealed under the lid: felt-backed pin block, tuning pins, strings
  g.add(box(W * 0.92, 0.03, D * 0.82, feltMat, 0, H - 0.04, -0.12));
  for (let i = 0; i < 14; i++)
    g.add(cyl(0.008, 0.008, 0.05, brass, -W * 0.42 + i * (W * 0.84 / 13), H - 0.005, -0.26, 5));
  for (let i = 0; i < 5; i++) {
    const s = cyl(0.004, 0.004, D * 0.72, brass, -W * 0.3 + i * (W * 0.15), H - 0.02, -0.12, 4);
    s.rotation.x = Math.PI / 2;
    g.add(s);
  }

  // the bench, in front, angled square to the keys
  const bench = new THREE.Group();
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x2c1c12, roughness: 0.6, metalness: 0.0 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x3c2a1c, roughness: 0.85, metalness: 0.0 });
  bench.add(box(0.92, 0.06, 0.38, benchMat, 0, 0.47, 0));
  bench.add(box(0.86, 0.06, 0.32, cushion, 0, 0.51, 0));
  for (const [lx, lz] of [[-0.4, -0.14], [0.4, -0.14], [-0.4, 0.14], [0.4, 0.14]])
    bench.add(box(0.06, 0.46, 0.06, benchMat, lx, 0.23, lz));
  bench.position.set(0, 0, 0.86);
  g.add(bench);

  let t = 0, target = 0;
  return {
    group: g,
    toggle() { target = target > 0.5 ? 0 : 1; },
    get open() { return target > 0.5; },
    update(dt) {
      t += (target - t) * Math.min(1, dt * 3.0);
      lid.rotation.x = -t * 1.15;                     // lift the front of the lid up and back
    },
  };
}

export function buildBuildings(scene, colliders) {
  const doors = {};
  const anchors = {};
  const lamps = [];        // {light, bulbMat, base}
  const breathers = [];    // { update(dt, t, ctx) } — the upstairs thing that breathes
  let thing = null;        // the Unfinished (upstairs set-piece) — exposed for main.js/harness hooks
  let updateMirror = () => {};   // per-frame: drive the upstairs mirror's live reflection
  const glowPlanes = [];   // glow materials (opacity flicker)
  const glowMeshes = [];   // the glow meshes themselves (visibility toggled with power)
  let power = false;

  // House walls + furniture live one storey above the under-house cellar, so
  // their colliders only occupy the band from (just below) the main floor up.
  // That lets a player down in the cellar walk beneath them; anyone at house
  // level (head well above the floor) is still blocked exactly as before.
  const HOUSE_COLLIDER_FLOOR = FY + 0.2;
  // Two walkable storeys now. Interior colliders (partitions + furniture) are capped
  // at the ground ceiling so they don't also block the upstairs; EXTERIOR walls pass
  // yTop:Infinity so they block both floors. The upstairs deck sits at UPPER_FLOOR_Y.
  const STOREY_RISE = 3.25;                       // local height climbed from ground to upstairs
  const UPPER_FLOOR_Y = FY + STOREY_RISE;         // world Y of the upstairs walking surface
  const GROUND_CEIL_Y = FY + 3.1;                 // interior colliders stop just under the upstairs deck
  const UP_CEIL = 5.95;                           // local upstairs ceiling height
  // stairwell footprint (LOCAL x,z) — shared by the ground-ceiling hole, the upstairs
  // deck hole, the staircase, and the floor override so they all line up exactly.
  const STAIR = { x0: 0.3, x1: 1.9, zBot: 4.6, zTop: -1.0 };
  const cbox = (lx, lz, w, d, sight = true, yTop = GROUND_CEIL_Y) =>
    colliders.addBox(HX + lx, HZ + lz, w, d, { blocksSight: sight, yBottom: HOUSE_COLLIDER_FLOOR, yTop });
  // an upstairs collider: occupies the band from the upper deck up
  const ucbox = (lx, lz, w, d, sight = true) =>
    colliders.addBox(HX + lx, HZ + lz, w, d, { blocksSight: sight, yBottom: UPPER_FLOOR_Y - 0.1 });

  const house = new THREE.Group();
  house.position.set(HX, FY, HZ);
  scene.add(house);

  // ------------------------------------------------------------- house shell
  // A denser, maze-like plan. A central hall/corridor spine (x -2..2) runs the
  // full depth from the front door to a back door; rooms open off it, with a
  // few doors between rooms so circulation loops rather than dead-ends.
  //   Sitting Room (W-front) · Dining Hall (W-back) · Study (E-front) ·
  //   Pantry (E-mid) · Kitchen (E-back) · Bedroom (E wing)
  // The exterior shell is built with REAL window openings cut into it (piers +
  // sill + header around each hole) so the Returned are visible massing in the
  // yard through the glass — a transparent pane on a solid wall would show
  // nothing. Interior partitions stay solid. All static wall geometry is merged
  // per material (one draw call each) to keep the added holes perf-neutral.
  const WIN = { ow: 1.0, sill: 0.9, head: 2.35, yc: 1.625, fh: 1.5 };
  // the lake (front) windows are taller — a galleried elevation facing the water,
  // like the real Inalco. Sill stays above the stone plinth; head lifts near the
  // eave. Height only — X centres are unchanged, so the see-through / photo /
  // window-gathering logic (all keyed to X) is untouched.
  const WINF = { sill: 0.95, head: 2.82 };
  // second-storey windows — real cut openings (measured from the upper wall base, WALL_H)
  const WINU = { sill: 0.95, head: 2.4 };
  const winFrontL = [-9, -4.5], winFrontR = [5, 9.5];   // centres along wall run axis (local)
  const winBackL = [-9.5, -4], winBackR = [4, 9.5];
  const winWest = [3.5], winEast = [-3.5, 3.5];   // NW opening dropped: the rear-west wing (below) covers that wall

  const extGeos = [];   // thick exterior shell -> mat.plaster
  const intGeos = [];   // thin partitions      -> mat.plasterIn

  // one exterior wall segment with rectangular window openings cut out. Piers get
  // sight-blocking colliders; the opening column blocks walking but CLEARS sight
  // (losClear is 2D, so sill/header panels must not block sight — see colliders.js).
  // Build one pierced exterior wall. baseY/wallH let it serve either storey; the
  // second storey passes useCol=false (the ground perimeter colliders are already
  // full-height) and its own geo bucket.
  const exteriorWall = (cx, cz, w, d, us, sill = WIN.sill, head = WIN.head, baseY = 0, wallH = WALL_H, useCol = true, bucket = extGeos) => {
    const alongX = w >= d;
    const len = alongX ? w : d, thick = alongX ? d : w;
    const c0 = (alongX ? cx : cz) - len / 2, c1 = c0 + len;
    const addPier = (a, b) => {
      if (b - a < 1e-3) return;
      const pc = (a + b) / 2, pw = b - a;
      if (alongX) { bucket.push(boxGeo(pw, wallH, thick, pc, baseY + wallH / 2, cz)); if (useCol) cbox(pc, cz, pw, thick, true, Infinity); }
      else        { bucket.push(boxGeo(thick, wallH, pw, cx, baseY + wallH / 2, pc)); if (useCol) cbox(cx, pc, thick, pw, true, Infinity); }
    };
    let cursor = c0;
    const overH = wallH - head;
    for (const u of [...us].sort((a, b) => a - b)) {
      addPier(cursor, u - WIN.ow / 2);
      if (alongX) {
        bucket.push(boxGeo(WIN.ow, sill, thick, u, baseY + sill / 2, cz));                 // under-sill
        if (overH > 0.01) bucket.push(boxGeo(WIN.ow, overH, thick, u, baseY + head + overH / 2, cz)); // header
        if (useCol) cbox(u, cz, WIN.ow, thick, false, Infinity);
      } else {
        bucket.push(boxGeo(thick, sill, WIN.ow, cx, baseY + sill / 2, u));
        if (overH > 0.01) bucket.push(boxGeo(thick, overH, WIN.ow, cx, baseY + head + overH / 2, u));
        if (useCol) cbox(cx, u, thick, WIN.ow, false, Infinity);
      }
      cursor = u + WIN.ow / 2;
    }
    addPier(cursor, c1);
  };
  exteriorWall(-5.8, 6.5, 12.4, 0.5, winFrontL, WINF.sill, WINF.head);   // front (lake) gallery — taller
  exteriorWall(6.8, 6.5, 10.4, 0.5, winFrontR, WINF.sill, WINF.head);
  exteriorWall(-6.35, -6.5, 11.3, 0.5, winBackL);       // back, door gap x -0.7..0.7
  exteriorWall(6.35, -6.5, 11.3, 0.5, winBackR);
  exteriorWall(-12, 0, 0.5, 13.5, winWest);             // west side
  exteriorWall(12, 0, 0.5, 13.5, winEast);              // east side

  const partitions = [
    // W1 — west partition (spine | Sitting/Dining), doors z 3.2..4.6 & -2.8..-1.4
    [-2, 5.55, 0.28, 1.9], [-2, 0.9, 0.28, 4.6], [-2, -4.65, 0.28, 3.7],
    // W2 — east partition (spine | Study/Pantry/Kitchen). The staircase runs up this
    // side of the corridor on BOTH floors, so its rail would block the study (z 3.2..4.6)
    // and pantry (z -0.7..0.7) corridor doors — sealed here; only the KITCHEN door
    // (z -3.2..-4.6) opens to the corridor. Study & pantry are reached via kitchen + bedroom.
    [2, 1.65, 0.28, 9.7], [2, -5.55, 0.28, 1.9],
    // west cross-wall (Sitting | Dining), door x -7..-5.6
    [-9.5, 0.5, 5, 0.28], [-3.8, 0.5, 3.6, 0.28],
    // east cross-walls: Study|Pantry (solid) and Pantry|Kitchen (door x 4.3..5.5)
    [4.6, 2, 5.2, 0.28],
    [3.15, -1, 2.3, 0.28], [6.35, -1, 1.7, 0.28],
    // Bedroom wall x=7.2, doors z 3.4..4.8 (Study) & -5..-3.6 (Kitchen)
    [7.2, 5.65, 0.28, 1.7], [7.2, -0.1, 0.28, 7.0], [7.2, -5.75, 0.28, 1.5],
  ];
  for (const [cx, cz, w, d] of partitions) {
    intGeos.push(boxGeo(w, WALL_H, d, cx, WALL_H / 2, cz));
    cbox(cx, cz, w, d);
  }
  // lintels above the two exterior doors (folded into the plaster merge)
  extGeos.push(boxGeo(1.6, WALL_H - 2.16, 0.5, 1, 2.16 + (WALL_H - 2.16) / 2, 6.5));
  extGeos.push(boxGeo(1.5, WALL_H - 2.16, 0.5, 0, 2.16 + (WALL_H - 2.16) / 2, -6.5));
  mergeInto(house, extGeos, mat.plankWall);   // exterior ground shell — weathered wood cladding
  mergeInto(house, intGeos, mat.plasterIn);

  // --- skirting boards + a picture rail lift the plain plaster shell. Thin wood
  // trim, all merged into one mesh (perf-neutral). Skirting is a slightly-oversize
  // collar at each wall base; the rail runs high, clear of the window heads.
  const trimGeos = [];
  const baseH = 0.14, railH = 0.06, railY = WALL_H - 0.42;
  const trimWall = (cx, cz, w, d) => {
    trimGeos.push(boxGeo(w + 0.05, baseH, d + 0.05, cx, baseH / 2 + 0.01, cz));   // skirting
    trimGeos.push(boxGeo(w + 0.04, railH, d + 0.04, cx, railY, cz));              // picture rail
  };
  for (const [cx, cz, w, d] of partitions) trimWall(cx, cz, w, d);
  trimWall(0, 6.28, 23.4, 0.06);    // front inner perimeter
  trimWall(0, -6.28, 23.4, 0.06);   // back inner
  trimWall(-11.78, 0, 0.06, 12.9);  // west inner
  trimWall(11.78, 0, 0.06, 12.9);   // east inner
  mergeInto(house, trimGeos, mat.woodDark);

  // window placements: [wx, wz, ry] derived from the opening centres above
  const WINDOWS = [];
  for (const u of [...winFrontL, ...winFrontR]) WINDOWS.push([u, 6.5, 0, WINF.sill, WINF.head]);
  for (const u of [...winBackL, ...winBackR]) WINDOWS.push([u, -6.5, Math.PI]);
  for (const u of winWest) WINDOWS.push([-12, u, -Math.PI / 2]);
  for (const u of winEast) WINDOWS.push([12, u, Math.PI / 2]);
  // second-storey window row (real openings, see-through into the walkable upstairs)
  for (const u of [-9, -4.5, 5, 9.5]) WINDOWS.push([u, 6.5, 0, WINU.sill, WINU.head, WALL_H]);
  for (const u of [-9.5, -4, 4, 9.5]) WINDOWS.push([u, -6.5, Math.PI, WINU.sill, WINU.head, WALL_H]);
  WINDOWS.push([-12, 3.5, -Math.PI / 2, WINU.sill, WINU.head, WALL_H]);
  for (const u of [-3.5, 3.5]) WINDOWS.push([12, u, Math.PI / 2, WINU.sill, WINU.head, WALL_H]);

  // floor
  const floorTex = canvasTexture((c, W, H) => {
    c.fillStyle = '#5d4630'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 21) {
      c.fillStyle = `rgba(20,12,6,${0.5 + Math.random() * 0.3})`;
      c.fillRect(0, y, W, 2);
      c.fillStyle = `rgba(255,220,170,0.05)`;
      c.fillRect(0, y + 3, W, 5);
    }
    for (let i = 0; i < 500; i++) {
      c.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      c.fillRect(Math.random() * W, Math.random() * H, Math.random() * 40, 1);
    }
  }, 256, 256);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(7, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 13), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02;
  floor.receiveShadow = true;
  house.add(floor);
  // ground ceiling — built in four panels around a stairwell hole so the staircase
  // can rise through it to the second floor (the hole matches STAIR exactly).
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0x8f948a, side: THREE.DoubleSide });
  const ceilPanel = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ceilMat);
    m.rotation.x = Math.PI / 2; m.position.set((x0 + x1) / 2, WALL_H, (z0 + z1) / 2);
    house.add(m);
  };
  ceilPanel(-12, 12, STAIR.zBot, 6.5);
  ceilPanel(-12, 12, -6.5, STAIR.zTop);
  ceilPanel(-12, STAIR.x0, STAIR.zTop, STAIR.zBot);
  ceilPanel(STAIR.x1, 12, STAIR.zTop, STAIR.zBot);
  for (const bx of [-9.5, -6.5, -3.5]) house.add(box(0.16, 0.22, 12.6, mat.woodDark, bx, WALL_H - 0.11, 0));

  // ------------------------------------------------------------- Inalco shell
  // Pushed toward the REAL Residencia Inalco (Bustillo, 1943): a tall, austere
  // TWO-STOREY block under a massive brooding roof — pale render, a subtle stone
  // base, a regular grid of tall lake windows in two rows, gabled dormers, and big
  // stone chimneys. The interior stays ONE walkable floor (ceiling at WALL_H); the
  // upper storey is a facade band above the ceiling with dark/false windows — the
  // two-storey LOOK without a real upstairs. All new static geometry is merged per
  // material (mergeInto calls after the wing) so the extra mass adds no draw calls.
  const stoneGeos = [], shingleGeos = [], capGeos = [], greenGeos = [], rafterGeos = [], stuccoGeos = [], whiteGeos = [], glassGeos = [], shutterGeos = [];
  const matStucco = (() => {   // same weathered planks on the gables/dormers; ShapeGeometry UVs are in metres, so tune the repeat for ~0.4 m boards
    const t = mat.plankWall.map.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.42, 0.18); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  })();
  const EXT_H = 6.2;                          // exterior eave (two storeys); interior ceiling stays WALL_H

  // upper storey walls (WALL_H..EXT_H) with REAL window openings, matching the ground
  // storey — so the second-floor windows are see-through from inside, not fake panels.
  // No new colliders (the ground perimeter is already full-height); geometry → plank.
  const uH = EXT_H - WALL_H;
  exteriorWall(-5.8, 6.5, 12.4, 0.5, [-9, -4.5], WINU.sill, WINU.head, WALL_H, uH, false, stuccoGeos);   // front-left (balcony doorway gap 0.4..1.6)
  exteriorWall(6.8, 6.5, 10.4, 0.5, [5, 9.5], WINU.sill, WINU.head, WALL_H, uH, false, stuccoGeos);      // front-right
  exteriorWall(0, -6.5, 24, 0.5, [-9.5, -4, 4, 9.5], WINU.sill, WINU.head, WALL_H, uH, false, stuccoGeos); // back
  exteriorWall(-12, 0, 0.5, 13.5, [3.5], WINU.sill, WINU.head, WALL_H, uH, false, stuccoGeos);           // west (wing covers the north bay)
  exteriorWall(12, 0, 0.5, 13.5, [-3.5, 3.5], WINU.sill, WINU.head, WALL_H, uH, false, stuccoGeos);      // east
  // lintel over the central balcony doorway (the gap 0.4..1.6 stays open onto the balcony)
  { const dHead = STOREY_RISE + 2.0; stuccoGeos.push(boxGeo(1.2, EXT_H - dHead, 0.5, 1.0, (dHead + EXT_H) / 2, 6.5)); }

  // massive steep roof (~44°) springing from the TALL eave — it broods over the
  // whole house. halfD is the wall half-depth, so the eave sits on the wall top.
  const eave = EXT_H, rise = 6.4, halfD = 6.5;
  const slant = Math.hypot(halfD, rise), ang = Math.atan2(rise, halfD);
  const ridgeY = eave + rise, roofX = 26.4, slabD = slant + 1.7;
  shingleGeos.push(boxGeo(roofX, 0.2, slabD, 0, eave + rise / 2, halfD / 2, 0, ang));
  shingleGeos.push(boxGeo(roofX, 0.2, slabD, 0, eave + rise / 2, -halfD / 2, 0, -ang));
  capGeos.push(boxGeo(roofX + 0.3, 0.16, 0.5, 0, ridgeY + 0.03, 0));                // ridge cap
  for (const sx of [-1, 1]) {                                                       // tall stucco gable ends
    const shape = new THREE.Shape();
    shape.moveTo(-6.6, 0); shape.lineTo(6.6, 0); shape.lineTo(0, rise);
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), matStucco);
    gable.rotation.y = sx * Math.PI / 2;
    gable.position.set(sx * 11.98, eave, 0);
    house.add(gable);
  }
  // deep eaves in DARK weathered wood (no bright trim — believable roof edge). Fascia
  // caps the front/back overhangs; bargeboards sit at the true gable rake edge so they
  // cover the shingle slab edges (no white/green lines along the roof).
  rafterGeos.push(boxGeo(roofX, 0.34, 0.18, 0, eave - 0.5, halfD + 0.52));
  rafterGeos.push(boxGeo(roofX, 0.34, 0.18, 0, eave - 0.5, -halfD - 0.52));
  for (const sx of [-1, 1]) {
    rafterGeos.push(boxGeo(0.18, 0.36, slant + 0.7, sx * 13.05, eave + rise / 2, halfD / 2, 0, ang));
    rafterGeos.push(boxGeo(0.18, 0.36, slant + 0.7, sx * 13.05, eave + rise / 2, -halfD / 2, 0, -ang));
  }

  // subtle grey-stone base (a low plinth) — pale render dominates the tall walls,
  // as on the real Inalco (stone reads at the foundation and chimneys, not all over).
  for (const [cx, cz, w, d] of [
    [-6.1, 6.62, 12.8, 0.58], [7.1, 6.62, 10.8, 0.58],     // front, door gap x 0.3..1.7
    [-6.65, -6.62, 11.7, 0.58], [6.65, -6.62, 11.7, 0.58],
    [-12.12, 0, 0.58, 13.8], [12.12, 0, 0.58, 13.8],
  ])
    stoneGeos.push(boxGeo(w, 0.72, d, cx, 0.36, cz));

  // tall tapered stone chimneys, stepping in as they rise past the ridge (ridgeY ≈ 12.6).
  const addChimney = (cx, cz, s, top) => {
    const b0 = 3.0, b1 = b0 + (top - b0) * 0.55, b2 = top - 0.35;
    stoneGeos.push(boxGeo(1.6 * s, b1 - b0, 1.45 * s, cx, (b0 + b1) / 2, cz));
    stoneGeos.push(boxGeo(1.25 * s, b2 - b1, 1.15 * s, cx, (b1 + b2) / 2, cz));
    stoneGeos.push(boxGeo(1.45 * s, 0.32, 1.35 * s, cx, b2 + 0.16, cz));            // cap
  };
  addChimney(-9.6, 0, 1.05, 13.7);
  addChimney(10.4, -2.2, 0.85, 12.9);

  // (the upper-storey windows are now REAL cut openings built with exteriorWall above,
  //  and their see-through joinery is added to the WINDOWS list — no fake panels.)

  const addDormer = (dx, s = 1) => {
    const dep = 1.5, faceZ = halfD + 0.28 * s, baseY = eave - 0.15, bodyH = 1.15 * s + 0.15, cz = faceZ - dep / 2;
    stuccoGeos.push(boxGeo(1.4 * s, bodyH, dep, dx, baseY + bodyH / 2, cz));        // dormer body straddling the slope
    const dH = 0.75 * s + 0.1, dR = 0.55 * s, dS = Math.hypot(dH, dR), dA = Math.atan2(dR, dH), topY = baseY + bodyH;
    shingleGeos.push(boxGeo(dS + 0.2, 0.1, dep + 0.3, dx - dH / 2, topY + dR / 2, cz, 0, 0, dA));
    shingleGeos.push(boxGeo(dS + 0.2, 0.1, dep + 0.3, dx + dH / 2, topY + dR / 2, cz, 0, 0, -dA));
    const ds = new THREE.Shape(); ds.moveTo(-dH, 0); ds.lineTo(dH, 0); ds.lineTo(0, dR);
    const dg = new THREE.Mesh(new THREE.ShapeGeometry(ds), matStucco); dg.position.set(dx, topY, faceZ + 0.02); house.add(dg);
    glassGeos.push(boxGeo(0.62 * s, 0.85 * s, 0.05, dx, baseY + bodyH * 0.55, faceZ + 0.02));
    rafterGeos.push(boxGeo(0.12, 0.92 * s, 0.06, dx - 0.42 * s, baseY + bodyH * 0.55, faceZ + 0.01));   // dark dormer-window jambs
    rafterGeos.push(boxGeo(0.12, 0.92 * s, 0.06, dx + 0.42 * s, baseY + bodyH * 0.55, faceZ + 0.01));
  };
  addDormer(-7); addDormer(7); addDormer(1, 1.35);               // flanking pair + a bigger central dormer over the entry

  // window joinery set INTO each cut opening (WINDOWS built above): an OPEN frame
  // (4 rails, not a solid box — a solid box would replug the hole), transparent
  // glazing, muntins, sill, header, shutters, and a warm glow plane lit only when
  // powered (dim enough to still see out/in).
  const railT = 0.1, fw = WIN.ow + 0.12, ft = 0.16;
  for (const [wx, wz, ry, wSill = WIN.sill, wHead = WIN.head, wBase = 0] of WINDOWS) {
    const g = new THREE.Group();
    const fh = wHead - wSill + 0.05, yc = wBase + (wSill + wHead) / 2;   // per-window; wBase lifts the upper row
    g.position.set(wx, yc, wz); g.rotation.y = ry;
    const gh = wHead - wSill;                              // glazed height
    const frameTop = box(fw, railT, ft, mat.woodDark, 0, fh / 2 - railT / 2, 0);
    const frameBot = box(fw, railT, ft, mat.woodDark, 0, -fh / 2 + railT / 2, 0);
    const frameL = box(railT, fh, ft, mat.woodDark, -fw / 2 + railT / 2, 0, 0);
    const frameR = box(railT, fh, ft, mat.woodDark, fw / 2 - railT / 2, 0, 0);
    const glassP = new THREE.Mesh(new THREE.PlaneGeometry(fw - railT, fh - railT), mat.winGlass);
    const cross1 = box(0.05, fh - railT, 0.04, mat.white, 0, 0, 0.02);
    const cross2 = box(fw - railT, 0.05, 0.04, mat.white, 0, 0, 0.02);
    const sill = box(fw + 0.24, 0.09, 0.32, mat.white, 0, -fh / 2 - 0.03, 0.05);
    const header = box(fw + 0.24, 0.13, 0.26, mat.white, 0, fh / 2 + 0.05, 0.04);
    const shL = box(0.44, fh, 0.06, mat.shutter, -fw / 2 - 0.24, 0, 0.11);
    const shR = box(0.44, fh, 0.06, mat.shutter, fw / 2 + 0.24, 0, 0.11);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(fw - railT, gh),
      new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, opacity: 0.4 }));
    glow.position.z = -0.06; glow.visible = false;         // interior side; doesn't block the view
    glowPlanes.push(glow.material);
    glowMeshes.push(glow);
    glow.userData.isGlow = true;
    g.add(frameTop, frameBot, frameL, frameR, glassP, cross1, cross2, sill, header, shL, shR, glow);
    house.add(g);
  }

  // lakeside entry — a stone terrace + a covered gabled porch projecting toward
  // the water (Bustillo's signature cross-gable), replacing the old white-columned
  // colonial porch. Stone/roof/timber all feed the same merge buckets.
  const txMin = -2.4, txMax = 4.4, tzIn = 6.55, tzOut = 10.0;
  const tW = txMax - txMin, tCx = (txMin + txMax) / 2, tD = tzOut - tzIn, tCz = (tzIn + tzOut) / 2;
  stoneGeos.push(boxGeo(tW + 0.5, 0.26, tD + 0.2, tCx, -0.06, tCz));             // flagstone deck (top ≈ 0.07, walkable)
  const gapL = tCx - 1.05, gapR = tCx + 1.05;                                    // central step gap, on the door axis
  stoneGeos.push(boxGeo(0.34, 0.66, tD, txMin, 0.33, tCz));                      // west parapet
  stoneGeos.push(boxGeo(0.34, 0.66, tD, txMax, 0.33, tCz));                      // east parapet
  stoneGeos.push(boxGeo(gapL - txMin, 0.66, 0.34, (txMin + gapL) / 2, 0.33, tzOut));
  stoneGeos.push(boxGeo(txMax - gapR, 0.66, 0.34, (gapR + txMax) / 2, 0.33, tzOut));
  stoneGeos.push(boxGeo(2.3, 0.18, 0.6, tCx, -0.12, tzOut + 0.4));               // step tread 1
  stoneGeos.push(boxGeo(2.3, 0.18, 0.6, tCx, -0.30, tzOut + 0.95));              // step tread 2
  cbox(txMin, tCz, 0.34, tD, false); cbox(txMax, tCz, 0.34, tD, false);
  cbox((txMin + gapL) / 2, tzOut, gapL - txMin, 0.34, false);
  cbox((gapR + txMax) / 2, tzOut, txMax - gapR, 0.34, false);
  // square green timber posts + a beam ring
  const postH = STOREY_RISE - 0.05;   // posts rise to carry the balcony at the upstairs floor level
  for (const [px, pz] of [[txMin + 0.28, tzIn + 0.35], [txMax - 0.28, tzIn + 0.35], [txMin + 0.28, tzOut - 0.35], [txMax - 0.28, tzOut - 0.35]]) {
    greenGeos.push(boxGeo(0.18, postH, 0.18, px, postH / 2, pz));
    cbox(px, pz, 0.26, 0.26, false);
  }
  greenGeos.push(boxGeo(tW - 0.4, 0.2, 0.16, tCx, postH, tzIn + 0.35));
  greenGeos.push(boxGeo(tW - 0.4, 0.2, 0.16, tCx, postH, tzOut - 0.35));
  greenGeos.push(boxGeo(0.16, 0.2, tD - 0.7, txMin + 0.28, postH, tCz));
  greenGeos.push(boxGeo(0.16, 0.2, tD - 0.7, txMax - 0.28, postH, tCz));
  // the entrance canopy doubles as the first-floor lake BALCONY (the real Inalco
  // has a bedroom balcony over the water). Flat deck on the porch posts + green rail
  // + a central upper French door onto it.
  const balY = STOREY_RISE;                                                         // balcony deck flush with the upstairs floor
  shingleGeos.push(boxGeo(tW + 0.5, 0.16, tD + 0.4, tCx, balY - 0.08, tCz + 0.1));  // deck / entrance canopy (top at the upstairs level)
  greenGeos.push(boxGeo(tW + 0.5, 0.1, 0.14, tCx, balY + 0.08, tzOut + 0.2));       // deck fascia
  const rTop = balY + 0.98;
  for (const [mx, mz, lx, lz] of [
    [tCx, tzOut, tW, 0], [txMin, (tzIn + 0.3 + tzOut) / 2, 0, tzOut - tzIn - 0.3], [txMax, (tzIn + 0.3 + tzOut) / 2, 0, tzOut - tzIn - 0.3],
  ]) {
    greenGeos.push(boxGeo(lx + 0.12, 0.09, lz + 0.12, mx, rTop, mz));               // balcony top rail
    greenGeos.push(boxGeo(lx + 0.12, 0.07, lz + 0.12, mx, balY + 0.5, mz));         // mid rail
  }
  for (let bx = txMin + 0.2; bx <= txMax - 0.2; bx += 0.42) greenGeos.push(boxGeo(0.05, 0.95, 0.05, bx, balY + 0.5, tzOut));
  for (const px of [txMin, txMax]) greenGeos.push(boxGeo(0.1, 0.98, 0.1, px, balY + 0.5, tzOut));
  // the central French doorway onto the balcony is now a real opening (carved in the
  // upper band, below) — leave just the timber jambs + head as its frame, no glass.
  rafterGeos.push(boxGeo(0.1, 2.05, 0.1, tCx - 0.62, balY + 1.05, 6.84));
  rafterGeos.push(boxGeo(0.1, 2.05, 0.1, tCx + 0.62, balY + 1.05, 6.84));
  rafterGeos.push(boxGeo(1.34, 0.1, 0.1, tCx, balY + 2.05, 6.84));

  // porch light — a lantern hung from the porch ceiling, on a visible rod.
  // (previously a bare low-poly sphere floated unsupported above the door: it
  // read as a strange grey orb half-blocking the doorway — gone now.)
  // a wall sconce beside the door — bracket + glass housing, nothing floating
  const porchLantern = new THREE.Group();
  porchLantern.position.set(2.35, 0, 6.78);                                // on the plaster, right of the door
  porchLantern.add(box(0.12, 0.2, 0.06, mat.metal, 0, 2.15, 0));           // back plate
  porchLantern.add(cyl(0.012, 0.012, 0.16, mat.metal, 0, 2.2, 0.09, 4));   // arm out from the wall
  porchLantern.children[1].rotation.x = Math.PI / 2;
  porchLantern.add(spawn('Lantern_01', { x: 0, y: 1.95, z: 0.16, s: 0.42 }));
  const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x201a12 }));
  porchBulb.position.set(0, 2.05, 0.16);                                    // core, inside the housing
  porchLantern.add(porchBulb);
  house.add(porchLantern);
  const porchLight = new THREE.PointLight(PAL.warm, 0, 9, 1.8);
  porchLight.position.set(2.2, 2.1, 7.0);
  house.add(porchLight);
  lamps.push({ light: porchLight, bulbMat: porchBulb.material, base: 3, warmup: 0 });

  // front door + a proper timber frame and threshold so the opening reads as a
  // doorway, not a raw gap in the plaster
  const doorFrameM = mat.woodDark;
  house.add(box(0.13, 2.36, 0.62, doorFrameM, 0.35, 1.18, 6.5));           // left jamb
  house.add(box(0.13, 2.36, 0.62, doorFrameM, 1.65, 1.18, 6.5));           // right jamb
  house.add(box(1.56, 0.16, 0.62, doorFrameM, 1.0, 2.28, 6.5));            // head casing
  house.add(box(1.5, 0.07, 0.44, mat.stone, 1.0, 0.035, 6.52));           // stone threshold
  doors.front = makeDoor(scene, colliders, { x: HX + 1, z: HZ + 6.5, y: FY, axis: 'x', swing: -1, locked: true, name: 'front' });
  doors.front.collider.yTop = GROUND_CEIL_Y;   // ground-only, so it never blocks the upstairs balcony doorway above it

  // back door — opens to the rear yard and the cellar stair
  house.add(box(0.13, 2.36, 0.6, doorFrameM, -0.75, 1.18, -6.5));
  house.add(box(0.13, 2.36, 0.6, doorFrameM, 0.75, 1.18, -6.5));
  house.add(box(1.5, 0.16, 0.6, doorFrameM, 0, 2.28, -6.5));
  house.add(box(1.42, 0.07, 0.44, mat.stone, 0, 0.035, -6.52));
  doors.back = makeDoor(scene, colliders, { x: HX, z: HZ - 6.5, y: FY, axis: 'x', swing: 1, locked: false, name: 'back' });

  // ---- rear-west service wing: a lower, closed stone volume that gives the house
  // Inalco's sprawling L-plan silhouette. No interior (solid massing — cheap), so
  // it reads as a wing from the yard; colliders sit on its three outer walls.
  {
    const xo = -16.6, xi = -12.0, zn = -6.6, zs = -1.0;
    const w = xi - xo, cx = (xo + xi) / 2, d = zs - zn, cz = (zn + zs) / 2;
    const wEave = 2.55, wStone = 1.45;
    for (const [wx, wz, ww, wd] of [[cx, zn, w, 0.42], [cx, zs, w, 0.42], [xo, cz, 0.42, d + 0.42]]) {
      stoneGeos.push(boxGeo(ww, wStone, wd, wx, wStone / 2, wz));                 // stone base
      stuccoGeos.push(boxGeo(ww, wEave - wStone, wd, wx, (wEave + wStone) / 2, wz)); // stucco upper
      cbox(wx, wz, ww, wd);
    }
    const wRise = 1.95, wHalf = d / 2 + 0.35;                                     // steep gable, ridge along X
    const wSlant = Math.hypot(wHalf, wRise), wAng = Math.atan2(wRise, wHalf);
    shingleGeos.push(boxGeo(w + 1.0, 0.16, wSlant + 0.4, cx, wEave + wRise / 2, cz + wHalf / 2, 0, wAng));
    shingleGeos.push(boxGeo(w + 1.0, 0.16, wSlant + 0.4, cx, wEave + wRise / 2, cz - wHalf / 2, 0, -wAng));
    capGeos.push(boxGeo(w + 1.2, 0.13, 0.4, cx, wEave + wRise + 0.02, cz));
    const wshp = new THREE.Shape(); wshp.moveTo(-wHalf, 0); wshp.lineTo(wHalf, 0); wshp.lineTo(0, wRise);
    const wg = new THREE.Mesh(new THREE.ShapeGeometry(wshp), matStucco);
    wg.rotation.y = -Math.PI / 2; wg.position.set(xo - 0.02, wEave, cz); house.add(wg);   // west gable to the yard
    greenGeos.push(boxGeo(0.13, 0.14, wSlant + 0.3, xo - 0.05, wEave + wRise / 2, cz + wHalf / 2, wAng));
    greenGeos.push(boxGeo(0.13, 0.14, wSlant + 0.3, xo - 0.05, wEave + wRise / 2, cz - wHalf / 2, -wAng));
    // one shuttered blind window for character (opaque — the wing has no interior)
    house.add(box(0.66, 0.9, 0.06, mat.glass, xo - 0.06, 1.55, cz));
    house.add(box(0.22, 0.94, 0.05, mat.shutter, xo - 0.09, 1.55, cz - 0.44));
    house.add(box(0.22, 0.94, 0.05, mat.shutter, xo - 0.09, 1.55, cz + 0.44));
  }

  // flush the per-material merge buckets → one mesh each (the whole reshape adds
  // zero draw calls beyond these six, all static and shadow-casting).
  mergeInto(house, stoneGeos, mat.stone);
  mergeInto(house, shingleGeos, mat.shingle);
  mergeInto(house, capGeos, mat.roof);
  mergeInto(house, greenGeos, mat.greenWood);
  mergeInto(house, rafterGeos, mat.woodDark);
  mergeInto(house, stuccoGeos, mat.plankWall);   // upper-storey band + wing — same wood cladding
  mergeInto(house, whiteGeos, mat.white);
  mergeInto(house, glassGeos, mat.glass);
  mergeInto(house, shutterGeos, mat.shutter);

  // ------------------------------------------------------------ house rooms
  const addLamp = (lx, lz, intensity = 9, dist = 11) => {
    const g = new THREE.Group();
    g.position.set(lx, WALL_H - 0.02, lz);
    const cord = cyl(0.015, 0.015, 0.42, mat.metal, 0, -0.21, 0, 4);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 8, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x3a4238, side: THREE.DoubleSide }));
    shade.position.y = -0.5;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x201a12 }));
    bulb.position.y = -0.58;
    g.add(cord, shade, bulb);
    house.add(g);
    const light = new THREE.PointLight(PAL.warm, 0, dist, 1.6);
    light.position.set(lx, WALL_H - 0.75, lz);
    house.add(light);
    lamps.push({ light, bulbMat: bulb.material, base: intensity, warmup: 0 });
  };
  addLamp(-7, 3.4, 5, 10);     // sitting room
  addLamp(-7, -3, 5, 11);      // dining hall
  addLamp(0, 4.2, 3.5, 8);     // corridor, front
  addLamp(0, -3.6, 3, 8);      // corridor, back
  addLamp(4.6, 4.3, 4, 8);     // study
  addLamp(4.6, 0.5, 3.5, 7);   // pantry
  addLamp(4.6, -4, 4, 8);      // kitchen
  addLamp(9.6, 2, 4, 8);       // bedroom, front
  addLamp(9.6, -3.6, 4, 8);    // bedroom, back

  // shared little makers --------------------------------------------------
  const shelfUnit = (g, x, z, ry, tint = [0x7a6a4a, 0x5a6a5a, 0x6a5a6a]) => {
    const s = new THREE.Group();
    for (const sy of [0.5, 0.95, 1.4, 1.85]) s.add(box(1.5, 0.04, 0.34, mat.wood, 0, sy, 0));
    s.add(box(0.05, 1.9, 0.34, mat.woodDark, -0.72, 0.95, 0));
    s.add(box(0.05, 1.9, 0.34, mat.woodDark, 0.72, 0.95, 0));
    for (let i = 0; i < 12; i++) {
      const jar = cyl(0.055, 0.07, 0.16 + (i % 3) * 0.06,
        new THREE.MeshLambertMaterial({ color: tint[i % 3] }),
        -0.58 + (i % 4) * 0.38, [0.62, 1.07, 1.52, 1.97][(i / 4) | 0], 0, 7);
      s.add(jar);
    }
    s.position.set(x, 0, z); s.rotation.y = ry;
    house.add(s);
  };
  const dresser = (x, z, ry) => { house.add(spawn('painted_wooden_cabinet', { x, z, ry })); };

  // === SITTING ROOM (west-front): the parlour ===========================
  const sit = new THREE.Group(); house.add(sit);
  // fireplace on the west wall
  const fp = new THREE.Group();
  fp.add(box(2.2, 2.4, 0.7, mat.stone, 0, 1.2, 0));
  fp.add(box(1.7, 0.16, 0.9, mat.stone, 0, 1.06, 0.12));
  const fpHole = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.85), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  fpHole.position.set(0, 0.55, 0.36);
  fp.add(fpHole);
  fp.position.set(-11.5, 0, 3.6); fp.rotation.y = Math.PI / 2;
  sit.add(fp);
  cbox(-11.4, 3.6, 0.9, 2.3, false);
  sit.add(spawn('Sofa_01', { x: -8.6, z: 3.6, ry: -Math.PI / 2 }));       // faces the fire
  cbox(-8.5, 3.6, 1.1, 2.3, false);
  sit.add(spawn('ArmChair_01', { x: -6.6, z: 2.0, ry: 2.2 }));
  cbox(-6.6, 2.0, 0.95, 0.95, false);
  sit.add(spawn('Rockingchair_01', { x: -6.4, z: 5.2, ry: -2.5 }));
  cbox(-6.4, 5.2, 0.9, 0.9, false);
  // low table between the seats, with the crew's abandoned camera
  sit.add(box(1.1, 0.07, 0.7, mat.wood, -8.4, 0.42, 5.0));
  for (const [dx, dz] of [[-0.45, -0.28], [0.45, -0.28], [-0.45, 0.28], [0.45, 0.28]])
    sit.add(box(0.06, 0.42, 0.06, mat.woodDark, -8.4 + dx, 0.21, 5.0 + dz));
  sit.add(spawn('Camera_01', { x: -8.4, y: 0.46, z: 5.0, ry: 0.8 }));
  cbox(-8.4, 5.0, 1.2, 0.8, false);
  sit.add(spawn('ceramic_pot', { x: -11.2, z: 6.0 }));
  dresser(-4.2, 6.0, Math.PI);                                            // against front wall
  sit.add(spawn('brass_candleholders', { x: -4.2, y: 1.18, z: 6.0, ry: 0.4 }));
  cbox(-4.2, 6.05, 1.4, 0.6, false);
  const rug1 = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), new THREE.MeshLambertMaterial({ color: 0x4a2f2a }));
  rug1.rotation.x = -Math.PI / 2; rug1.position.set(-7.8, 0.03, 3.9); rug1.receiveShadow = true;
  sit.add(rug1);
  house.add(painting(-11.72, 1.85, 1.6, Math.PI / 2, 23));
  house.add(painting(-6.4, 1.9, 6.32, 0, 7, 1.05));
  anchors.sittingNote = { x: HX - 4.2, z: HZ + 5.85, y: FY + 1.32 };      // on the dresser

  // === DINING HALL (west-back) ==========================================
  const dine = new THREE.Group(); house.add(dine);
  dine.add(spawn('WoodenTable_01', { x: -6.5, z: -3, ry: 0.05, s: 1.3 }));
  cbox(-6.5, -3, 2.6, 1.1, false);
  for (const [cx2, cz2, r] of [[-7.7, -4.05, 0.35], [-5.3, -4.1, -0.3], [-7.1, -1.9, 2.9], [-5.0, -2.0, 3.4]])
    dine.add(spawn('painted_wooden_chair_01', { x: cx2, z: cz2, ry: r }));
  // piano, SW corner — its front (keys + bench) faces into the room (+z)
  const piano = buildPiano();
  piano.group.position.set(-9.9, 0, -5.7);
  dine.add(piano.group);
  cbox(-9.9, -5.85, 1.7, 0.9, false);        // the cabinet
  cbox(-9.9, -4.84, 1.0, 0.5, false);        // the bench
  anchors.piano = { x: HX - 9.9, z: HZ - 5.0, y: FY + 1.0, label: 'the piano' };
  // cabinets on the back wall
  house.add(spawn('GothicCabinet_01', { x: -3.6, z: -5.95 }));
  house.add(spawn('painted_wooden_cabinet', { x: -6.8, z: -5.95 }));
  house.add(spawn('brass_pot_01', { x: -6.6, y: 1.18, z: -5.95 }));
  cbox(-3.6, -6.05, 1.6, 0.6, false); cbox(-6.8, -6.05, 1.4, 0.6, false);
  house.add(painting(-11.72, 1.85, -3.4, Math.PI / 2, 41));
  anchors.hallNote = { x: HX - 6.5, z: HZ - 3.0, y: FY + 0.73 };          // on the dining table

  // === CENTRAL CORRIDOR / FOYER (the spine) =============================
  // coat rack by the front door
  const coat = new THREE.Group();
  coat.add(cyl(0.035, 0.05, 1.8, mat.woodDark, 0, 0.9, 0, 5));
  for (let i = 0; i < 3; i++)
    coat.add(box(0.3, 0.03, 0.03, mat.woodDark, 0.1, 1.55 - i * 0.12, 0, i * 2.1));
  const coatCloth = box(0.42, 0.9, 0.2, new THREE.MeshLambertMaterial({ color: 0x2e3236 }), 0.12, 1.05, 0.06);
  coatCloth.rotation.z = 0.06; coat.add(coatCloth);
  coat.position.set(-1.5, 0, 5.4); house.add(coat);
  // console table — moved to the foyer's WEST side so it no longer sits in front of
  // the staircase (it used to partially block the way up).
  house.add(box(1.3, 0.06, 0.42, mat.wood, -1.3, 0.82, 5.0));
  for (const dx of [-0.55, 0.55]) house.add(box(0.06, 0.8, 0.06, mat.woodDark, -1.3 + dx, 0.4, 5.0));
  // b3: kept as a reference — the revisit system knocks it crooked on a later
  // return, once the house has had a chance to shift behind your back.
  const corridorPainting = painting(1.7, 1.7, 5.2, -Math.PI / 2, 57, 0.7);
  house.add(corridorPainting);
  cbox(-1.3, 5.0, 1.3, 0.5, false);   // console collider (moved off the stair approach)
  // a long runner down the hall
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 10), new THREE.MeshLambertMaterial({ color: 0x3c2b30 }));
  runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.03, -0.5); runner.receiveShadow = true;
  house.add(runner);
  // a tall case clock against W1, back of the hall
  const clock = new THREE.Group();
  clock.add(box(0.5, 2.0, 0.34, mat.woodDark, 0, 1.0, 0));
  clock.add(box(0.36, 0.36, 0.05, new THREE.MeshLambertMaterial({ color: 0xd9d0b4 }), 0, 1.72, 0.18));
  clock.position.set(-1.72, 0, -3.6); house.add(clock);
  cbox(-1.72, -3.6, 0.5, 0.4, false);
  anchors.corridorNote = { x: HX - 1.3, z: HZ + 5.0, y: FY + 0.86 };      // on the console (foyer, west side)
  anchors.scareSpawn = { x: HX + 0.6, z: HZ - 5.6 };
  anchors.foyer = { x: HX + 0.6, z: HZ + 3.2 };

  // === STUDY (east-front) ===============================================
  const study = new THREE.Group(); house.add(study);
  study.add(spawn('WoodenTable_02', { x: 5.5, z: 4.75, s: 1.9 }));
  study.add(box(0.5, 0.14, 0.6, mat.wood, 5.9, 0.66, 4.85));              // the drawer
  cbox(5.5, 4.85, 1.1, 0.95, false);
  study.add(spawn('painted_wooden_chair_01', { x: 5.3, z: 3.8, ry: Math.PI + 0.35 }));
  study.add(box(0.4, 0.16, 0.34, mat.metal, 5.35, 0.87, 4.8));            // typewriter
  study.add(box(0.34, 0.05, 0.06, new THREE.MeshLambertMaterial({ color: 0xd9d4c2 }), 5.35, 0.97, 4.67, 0, -0.4));
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), new THREE.MeshLambertMaterial({ color: 0xd8d2bc }));
    p.rotation.x = -Math.PI / 2; p.rotation.z = Math.random() * 0.9;
    p.position.set(5.66 + i * 0.1, 0.815 + i * 0.003, 4.95 - i * 0.08);
    study.add(p);
  }
  // globe
  const globe = new THREE.Group();
  globe.add(cyl(0.16, 0.2, 0.06, mat.woodDark, 0, 0.03, 0, 8));
  globe.add(cyl(0.02, 0.02, 0.5, mat.woodDark, 0, 0.3, 0, 5));
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3f5666, flatShading: true })));
  globe.children[2].position.y = 0.62;
  globe.position.set(6.9, 0, 5.9); study.add(globe);
  // bookshelves against the front wall
  shelfUnit(study, 3.3, 6.05, Math.PI, [0x5a4632, 0x6a5638, 0x473528]);
  cbox(3.3, 6.05, 1.5, 0.4, false);
  dresser(2.6, 5.3, Math.PI / 2);                                         // west wall, north of the door
  study.add(spawn('ceramic_pot', { x: 2.6, y: 1.18, z: 5.3, ry: 0.3 }));
  cbox(2.55, 5.3, 0.6, 1.0, false);
  house.add(painting(7.06, 1.85, 1.0, -Math.PI / 2, 71, 0.9));   // on the solid wall, not the doorway
  anchors.deed = { x: HX + 5.66, z: HZ + 4.95, y: FY + 0.83 };
  anchors.drawer = { x: HX + 5.9, z: HZ + 4.88, y: FY + 0.7, label: 'the desk drawer' };

  // === PANTRY (east-mid): shelves and stores ============================
  const pantry = new THREE.Group(); house.add(pantry);
  shelfUnit(pantry, 6.9, 0.5, -Math.PI / 2);                               // east wall
  cbox(6.95, 0.5, 0.4, 1.5, false);
  shelfUnit(pantry, 4.4, 1.72, 0, [0x6a5a4a, 0x4a5a4a, 0x5a4a3a]);         // south wall (clear of the door)
  cbox(4.4, 1.75, 1.5, 0.4, false);
  pantry.add(spawn('wooden_crate_01', { x: 6.3, z: 1.45, ry: 0.3 }));
  pantry.add(spawn('wooden_crate_02', { x: 6.4, z: 0.4, ry: -0.5 }));
  pantry.add(spawn('barrel_03', { x: 2.6, z: 1.5 }));
  pantry.add(spawn('brass_pot_01', { x: 3.6, z: 1.55 }));                 // on the floor by the shelf
  cbox(6.3, 1.0, 1.0, 1.7, false); colliders.addCircle(HX + 2.6, HZ + 1.5, 0.34);
  anchors.archiveLetter = { x: HX + 6.7, z: HZ + 0.5, y: FY + 0.98 };     // on the east shelf
  anchors.pantryNote = { x: HX + 4.4, z: HZ + 1.7, y: FY + 0.98 };        // on the south shelf

  // === KITCHEN (east-back) ==============================================
  const kitchen = new THREE.Group(); house.add(kitchen);
  kitchen.add(box(4.6, 0.9, 0.62, mat.wood, 4.7, 0.45, -6.05));           // counter back
  kitchen.add(box(0.62, 0.9, 1.5, mat.wood, 2.65, 0.45, -5.45));          // counter side (clears the door)
  kitchen.add(box(0.8, 0.86, 0.66, mat.metal, 6.2, 0.43, -6.02));         // stove
  for (let i = 0; i < 4; i++)
    kitchen.add(cyl(0.09, 0.09, 0.03, new THREE.MeshLambertMaterial({ color: 0x14161a }), 6.0 + (i % 2) * 0.36, 0.885, -6.2 + ((i / 2) | 0) * 0.3, 8));
  cbox(4.7, -6.0, 4.6, 0.8, false); cbox(2.65, -5.45, 0.7, 1.5, false);
  kitchen.add(box(2.2, 0.05, 0.28, mat.wood, 5.0, 1.8, -6.28));           // wall shelf
  for (let i = 0; i < 6; i++)
    kitchen.add(cyl(0.07, 0.08, 0.2 + (i % 2) * 0.08, new THREE.MeshLambertMaterial({ color: [0x7a6a4a, 0x5a6a5a, 0x6a5a6a][i % 3] }), 4.1 + i * 0.35, 1.95, -6.28, 7));
  kitchen.add(spawn('brass_pot_01', { x: 6.05, y: 0.98, z: -6.05 }));
  kitchen.add(spawn('ceramic_pot', { x: 3.6, y: 0.98, z: -6.0 }));
  kitchen.add(spawn('wooden_crate_01', { x: 2.9, z: -1.9, ry: 0.4 }));
  // kitchen table
  kitchen.add(box(1.3, 0.07, 0.95, mat.wood, 5.2, 0.74, -3.0));
  for (const [dx, dz] of [[-0.55, -0.38], [0.55, -0.38], [-0.55, 0.38], [0.55, 0.38]])
    kitchen.add(box(0.07, 0.72, 0.07, mat.woodDark, 5.2 + dx, 0.36, -3.0 + dz));
  kitchen.add(spawn('painted_wooden_chair_01', { x: 5.2, z: -2.1, ry: 0 }));
  cbox(5.2, -3.0, 1.4, 1.1, false);
  anchors.kitchenNote = { x: HX + 5.2, z: HZ - 3.0, y: FY + 0.79 };

  // === BEDROOM (east wing) ==============================================
  house.add(spawn('GothicBed_01', { x: 10.5, z: -3.3, ry: Math.PI / 2 }));
  cbox(10.6, -3.4, 1.7, 2.4, false);
  house.add(spawn('ClassicNightstand_01', { x: 9.2, z: -4.9, ry: 0.15 }));
  cbox(9.25, -4.8, 0.6, 0.5, false);
  house.add(spawn('brass_candleholders', { x: 9.2, y: 0.72, z: -4.9 }));
  dresser(8.9, 5.85, Math.PI);
  house.add(spawn('painted_wooden_cabinet', { x: 11.4, z: 5.85, ry: Math.PI }));
  cbox(8.9, 5.9, 1.4, 0.7, false); cbox(11.4, 5.9, 1.4, 0.7, false);
  house.add(spawn('potted_plant_04', { x: 8.3, z: 3.5 }));
  house.add(spawn('wooden_crate_02', { x: 11.4, z: -5.7, ry: 0.4 }));     // a packed trunk
  house.add(spawn('Rockingchair_01', { x: 8.6, z: 1.4, ry: 1.9 }));
  cbox(8.6, 1.4, 0.9, 0.9, false);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x39444c, emissive: 0x0a0e12 }));
  mirror.position.set(11.86, 1.6, -0.5); mirror.rotation.y = -Math.PI / 2;
  house.add(mirror);
  house.add(painting(11.86, 1.85, -2.6, -Math.PI / 2, 89, 0.95));
  anchors.bedNote = { x: HX + 9.2, z: HZ - 4.8, y: FY + 0.72 };

  // =====================================================================
  //  THE CELLAR — a room UNDER the rear-east of the house, reached by an open
  //  stone stair off to the side of the rear yard that descends TOWARD the
  //  house. The room sits below the walkable kitchen floor: the player is put
  //  onto it by a floor override (cellarLevel), and its wall colliders only
  //  switch on while you're actually down there.
  // =====================================================================
  const C = CELLAR;
  const cel = new THREE.Group(); scene.add(cel);
  const cw = cellarWallTextures();
  const bloodMat = new THREE.MeshStandardMaterial({
    map: cw.map, bumpMap: cw.bump, bumpScale: 0.05,
    color: 0xd6ded0,                                   // faint cool-green wash over the stone
    roughness: 0.99, metalness: 0,
  });
  cw.map.repeat.set(1.7, 1.0); cw.bump.repeat.set(1.7, 1.0);
  const celStone = new THREE.MeshStandardMaterial({ map: stoneTex(), color: 0x4c5546, roughness: 0.97, metalness: 0 });
  const wallB = (w, h, d, x, y, z) => { cel.add(box(w, h, d, bloodMat, x, y, z)); };
  const rCx = (C.roomMinX + C.roomMaxX) / 2, rCz = (C.roomMinZ + C.roomMaxZ) / 2;
  const rW = C.roomMaxX - C.roomMinX, rD = C.roomMaxZ - C.roomMinZ;
  const ceilY = 1.95;                                  // ceiling below the main floor (2.12)
  const wallH = ceilY - C.floorY;                      // walls span the deeper floor up to the ceiling
  const wallCy = C.floorY + wallH / 2;
  const doorTopY = C.floorY + 2.0;                     // a full-height (2.0m) cellar door
  const gapMinX = C.doorMinX, gapMaxX = C.doorMaxX;    // opening for the cellar door
  wallB(0.2, wallH, rD + 0.2, C.roomMinX - 0.1, wallCy, rCz);       // west
  wallB(0.2, wallH, rD + 0.2, C.roomMaxX + 0.1, wallCy, rCz);       // east
  wallB(rW + 0.4, wallH, 0.2, rCx, wallCy, C.roomMaxZ + 0.1);       // back (houseward)
  // front wall (at the back-wall line) with the doorway onto the stair
  wallB((gapMinX - C.roomMinX) + 0.1, wallH, 0.2, (C.roomMinX + gapMinX) / 2, wallCy, C.roomMinZ);
  wallB((C.roomMaxX - gapMaxX) + 0.1, wallH, 0.2, (gapMaxX + C.roomMaxX) / 2, wallCy, C.roomMinZ);
  wallB(gapMaxX - gapMinX + 0.3, ceilY - doorTopY, 0.2, (gapMinX + gapMaxX) / 2, (doorTopY + ceilY) / 2, C.roomMinZ); // lintel above the door
  cel.add(box(rW + 0.6, 0.12, rD + 0.6, celStone, rCx, ceilY, rCz));   // ceiling
  cel.add(box(rW + 0.6, 0.12, rD + 0.6, celStone, rCx, C.floorY - 0.06, rCz));   // floor slab
  const roomColliders = [
    colliders.addBox(C.roomMinX - 0.1, rCz, 0.2, rD, { blocksSight: true }),
    colliders.addBox(C.roomMaxX + 0.1, rCz, 0.2, rD, { blocksSight: true }),
    colliders.addBox(rCx, C.roomMaxZ + 0.1, rW, 0.2, { blocksSight: true }),
    colliders.addBox((C.roomMinX + gapMinX) / 2, C.roomMinZ, gapMinX - C.roomMinX, 0.2, { blocksSight: true }),
    colliders.addBox((gapMaxX + C.roomMaxX) / 2, C.roomMinZ, C.roomMaxX - gapMaxX, 0.2, { blocksSight: true }),
  ];
  roomColliders.forEach((c) => (c.enabled = false));   // off until the player is down there
  // a blood pool spreading from under her
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.3, 22),
    new THREE.MeshStandardMaterial({ color: 0x2a0806, roughness: 0.5, metalness: 0 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(rCx, C.floorY + 0.02, rCz + 0.3); cel.add(pool);

  // === the sunken areaway + built stone stair, descending toward the house ===
  // The terrain has a clean punched hole here (world.js); we fill it with stone
  // so the descent reads as a real stairwell instead of a buried pit, ending at
  // a wooden cellar door. The player rides the built ramp via the floor override.
  const HH = C.hole, celTopY = FY;                     // areaway top = ground level
  const sCx = (C.stairMinX + C.stairMaxX) / 2, stairW = C.stairMaxX - C.stairMinX;
  const stairY = (z) => {                              // built ramp height the player rides
    let t = (z - C.stairTopZ) / (C.stairBotZ - C.stairTopZ);
    t = Math.max(0, Math.min(1, t));
    return celTopY + (C.floorY - celTopY) * t;
  };
  const areawayMidZ = (HH.minZ + C.stairBotZ) / 2, areawayD = C.stairBotZ - HH.minZ;
  // side retaining walls fill the hole's west/east strips and rise to a low kerb
  // above ground, so no raw terrain edge or void shows from any angle
  const areawayTop = celTopY + 0.3;                    // low kerb just above grade
  for (const [wx, ww] of [
    [(HH.minX + C.stairMinX) / 2, C.stairMinX - HH.minX],
    [(HH.maxX + C.stairMaxX) / 2, HH.maxX - C.stairMaxX],
  ]) {
    cel.add(box(ww, areawayTop - C.floorY, areawayD, celStone, wx, (areawayTop + C.floorY) / 2, areawayMidZ));
    colliders.addBox(wx, areawayMidZ, ww, areawayD, { blocksSight: true });
  }
  // built steps down to the door; the top step overhangs the terrain lip
  const nSteps = 11;
  for (let i = 0; i < nSteps; i++) {
    const f = (i + 0.5) / nSteps;
    const zc = C.stairTopZ + f * (C.stairBotZ - C.stairTopZ);
    const yt = celTopY + f * (C.floorY - celTopY);
    const depth = (C.stairBotZ - C.stairTopZ) / nSteps + 0.06;
    const zAdj = i === 0 ? zc - 0.18 : zc;
    const dAdj = i === 0 ? depth + 0.4 : depth;
    cel.add(box(stairW, 0.18, dAdj, celStone, sCx, yt - 0.09, zAdj));
  }
  // low kerb posts framing the mouth at ground level
  for (const sx of [C.stairMinX + 0.15, C.stairMaxX - 0.15])
    cel.add(box(0.3, 0.5, 0.4, celStone, sx, celTopY + 0.1, C.stairTopZ + 0.2));
  // the cellar door — a low heavy timber door in the stone doorway at the foot;
  // the room's front wall (built above) already frames it
  doors.cellar = makeDoor(scene, colliders, {
    x: (C.doorMinX + C.doorMaxX) / 2, z: C.roomMinZ, y: C.floorY,
    w: C.doorMaxX - C.doorMinX, h: 2.0, axis: 'x', swing: 1, locked: false, name: 'cellar',
  });
  // a timber frame so the opening reads as a real doorway at the stair foot
  const cdMid = (C.doorMinX + C.doorMaxX) / 2, cdW = C.doorMaxX - C.doorMinX;
  cel.add(box(0.12, doorTopY - C.floorY, 0.34, mat.woodDark, C.doorMinX - 0.06, (C.floorY + doorTopY) / 2, C.roomMinZ)); // left jamb
  cel.add(box(0.12, doorTopY - C.floorY, 0.34, mat.woodDark, C.doorMaxX + 0.06, (C.floorY + doorTopY) / 2, C.roomMinZ)); // right jamb
  cel.add(box(cdW + 0.36, 0.14, 0.34, mat.woodDark, cdMid, doorTopY + 0.05, C.roomMinZ));                                // head casing
  cel.add(box(cdW + 0.2, 0.06, 0.3, celStone, cdMid, C.floorY + 0.03, C.roomMinZ));                                      // stone threshold

  // failing bulb over her + a colder spill down the stair
  const celBulbMat = new THREE.MeshBasicMaterial({ color: 0x3a2c1e });
  const celBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), celBulbMat);
  celBulb.position.set(rCx, ceilY - 0.14, rCz); cel.add(celBulb);
  cel.add(cyl(0.006, 0.006, 0.16, mat.metal, rCx, ceilY - 0.05, rCz, 4));
  const celLight = new THREE.PointLight(0xb98a52, 2.6, 7, 2.2);
  celLight.position.set(rCx, ceilY - 0.3, rCz); scene.add(celLight);
  const stairLight = new THREE.PointLight(0x5a6e7a, 1.3, 7, 1.8);       // cold spill down the stair
  stairLight.position.set(sCx, 1.5, C.stairBotZ - 0.2); scene.add(stairLight);

  // --- floor override / level tracking ------------------------------------
  const inStairFP = (x, z) => x > C.stairMinX && x < C.stairMaxX && z > C.stairTopZ && z < C.stairBotZ;
  const inRoomFP = (x, z) => x > C.roomMinX && x < C.roomMaxX && z > C.roomMinZ && z < C.roomMaxZ;
  let cellarLevel = false;
  const floorAt = (x, z) => {
    if (inStairFP(x, z)) {
      const ry = stairY(z);                            // built stair ramp height
      if (ry < 1.2) cellarLevel = true; else if (ry > 1.7) cellarLevel = false;
      return ry;                                       // ride the built stair
    }
    if (inRoomFP(x, z)) return cellarLevel ? C.floorY : null;
    cellarLevel = false;                               // left the cellar entirely
    return null;
  };
  // the girl always stands on the cellar floor (ramp on the stair, 0 in the room)
  const cellarFloorFor = (x, z) => (inStairFP(x, z) ? stairY(z) : C.floorY);
  const canRoam = (x, z) => inRoomFP(x, z) || inStairFP(x, z);

  // the girl, in the middle of the room, facing the doorway/stair
  const girl = makeGirl(rCx, rCz, cellarFloorFor, canRoam, Math.PI);
  scene.add(girl.group);

  anchors.girl = { x: rCx, z: rCz, y: 1.5, label: 'the girl' };
  anchors.cellarNote = { x: C.roomMaxX - 0.5, z: C.roomMaxZ - 0.5, y: 0.9 };
  anchors.cellarStairTop = { x: sCx, z: C.stairTopZ + 0.5 };
  anchors.cellarDoor = { x: (C.doorMinX + C.doorMaxX) / 2, z: C.roomMinZ, y: 1.0 };

  const cellar = {
    girl, floorAt,
    // true only once the player has actually descended to cellar level — the
    // room footprint alone is shared with the kitchen one storey up, so the
    // girl must not be reachable/audible from up there.
    get playerBelow() { return cellarLevel; },
    insideCellar: (x, z) => inRoomFP(x, z) || (x > C.stairMinX - 0.4 && x < C.stairMaxX + 0.4 && z > C.stairTopZ - 0.4 && z < C.stairBotZ + 0.4),
    update(dt, t, ctx) {
      const fl = 0.55 + 0.45 * Math.sin(t * 9 + Math.sin(t * 2.3) * 3) + (Math.sin(t * 0.7) > 0.9 ? -0.6 : 0);
      celLight.intensity = 2.6 * Math.max(0.15, fl);
      celBulbMat.color.setHex(0x3a2c1e).multiplyScalar(Math.max(0.4, fl));
      for (const c of roomColliders) c.enabled = cellarLevel;   // walls only while you're down there
      girl.update(dt, t, ctx);
    },
  };

  // house interior test (+m: expanded margin so enemies keep a standoff)
  const insideHouse = (x, z) => Math.abs(x - HX) < 12.2 && Math.abs(z - HZ) < 6.7;
  const insideHouseM = (x, z, m = 0) => Math.abs(x - HX) < 12.2 + m && Math.abs(z - HZ) < 6.7 + m;

  // ============================ SECOND FLOOR ============================
  // The exterior grew a storey, so make it walkable. A staircase climbs from the
  // front hall to an upper floor that mirrors the ground plan (bare bedrooms) and
  // opens onto the lake balcony; one room holds the thing that breathes. Physics
  // rides the same floor-override the cellar uses.
  {
    const deckY = STOREY_RISE;                          // local top of the upstairs floor
    const upFloorGeos = [], upWallGeos = [], upStepGeos = [], upTrimGeos = [];
    // upstairs deck = interior footprint minus the stairwell hole (4 strips)
    const IX0 = -11.9, IX1 = 11.9, IZ0 = -6.4, IZ1 = 6.4, dT = 0.18;
    const deckBox = (x0, x1, z0, z1) => { if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return; upFloorGeos.push(boxGeo(x1 - x0, dT, z1 - z0, (x0 + x1) / 2, deckY - dT / 2, (z0 + z1) / 2)); };
    deckBox(IX0, IX1, STAIR.zBot, IZ1);                 // front strip (lake side)
    deckBox(IX0, IX1, IZ0, STAIR.zTop);                 // back strip
    deckBox(IX0, STAIR.x0, STAIR.zTop, STAIR.zBot);     // west of the well
    deckBox(STAIR.x1, IX1, STAIR.zTop, STAIR.zBot);     // east of the well
    mergeInto(house, upFloorGeos, mat.wood);

    // upstairs partitions mirror the (already stair-sealed) ground plan + upper colliders
    const upWH = UP_CEIL - deckY;
    const upperPartitions = partitions;   // same sealed layout as the ground floor (study/pantry corridor doors closed)
    for (const [cx, cz, w, d] of upperPartitions) {
      upWallGeos.push(boxGeo(w, upWH, d, cx, deckY + upWH / 2, cz));
      ucbox(cx, cz, w, d);
    }
    mergeInto(house, upWallGeos, mat.plasterIn);

    // upstairs ceiling
    const upC = new THREE.Mesh(new THREE.PlaneGeometry(24, 13), ceilMat);
    upC.rotation.x = Math.PI / 2; upC.position.y = UP_CEIL; house.add(upC);

    // the staircase (corridor, against W2): bottom z=zBot at ground → top z=zTop upstairs
    const sx0 = STAIR.x0 + 0.12, sx1 = STAIR.x1 - 0.12, steps = 14;
    const run = STAIR.zBot - STAIR.zTop;
    for (let i = 0; i < steps; i++) {
      const zc = STAIR.zBot - run * (i + 0.5) / steps, topY = deckY * (i + 1) / steps;
      upStepGeos.push(boxGeo(sx1 - sx0, topY, run / steps + 0.02, (sx0 + sx1) / 2, topY / 2, zc));
    }
    mergeInto(house, upStepGeos, mat.plankDark);

    // rail colliders: full-height sides so you can't step off the stair; an upstairs
    // rail across the well's south edge (you arrive at the north/top edge).
    const midZ = (STAIR.zTop + STAIR.zBot) / 2;
    colliders.addBox(HX + STAIR.x0, HZ + midZ, 0.12, run + 0.1, { yBottom: HOUSE_COLLIDER_FLOOR, yTop: Infinity });
    colliders.addBox(HX + STAIR.x1, HZ + midZ, 0.12, run + 0.1, { yBottom: HOUSE_COLLIDER_FLOOR, yTop: Infinity });
    ucbox((STAIR.x0 + STAIR.x1) / 2, STAIR.zBot, STAIR.x1 - STAIR.x0, 0.12, false);
    // green rails: sloped along the stair + horizontal around the well
    const railLen = Math.hypot(run, deckY), railAng = Math.atan2(deckY, run);
    upTrimGeos.push(boxGeo(0.08, 0.85, railLen + 0.2, STAIR.x0 + 0.04, deckY / 2 + 0.82, midZ, 0, railAng, 0));
    upTrimGeos.push(boxGeo(0.08, 0.85, railLen + 0.2, STAIR.x1 - 0.04, deckY / 2 + 0.82, midZ, 0, railAng, 0));
    upTrimGeos.push(boxGeo(STAIR.x1 - STAIR.x0 + 0.1, 0.08, 0.08, (STAIR.x0 + STAIR.x1) / 2, deckY + 0.88, STAIR.zBot));
    upTrimGeos.push(boxGeo(0.08, 0.08, run, STAIR.x0, deckY + 0.88, midZ));
    upTrimGeos.push(boxGeo(0.08, 0.08, run, STAIR.x1, deckY + 0.88, midZ));
    mergeInto(house, upTrimGeos, mat.greenWood);

    // powered ceiling lamps upstairs (light with the generator, via the lamps array)
    for (const [lx, lz] of [[-7, 3.5], [-7, -3.5], [9.8, -3]]) {   // 3 lamps (kept lean for weak hardware)
      const lg = new THREE.Group(); lg.position.set(lx, UP_CEIL - 0.02, lz);
      lg.add(cyl(0.015, 0.015, 0.42, mat.metal, 0, -0.21, 0, 4));
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0x3a4238, side: THREE.DoubleSide })); shade.position.y = -0.5;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x201a12 })); bulb.position.y = -0.58;
      lg.add(shade, bulb); house.add(lg);
      const light = new THREE.PointLight(PAL.warm, 0, 9, 1.9); light.position.set(lx, UP_CEIL - 0.55, lz); house.add(light);
      lamps.push({ light, bulbMat: bulb.material, base: 3.5, warmup: 0 });
    }

    // a bare upstairs bedroom (east wing) + THE UNFINISHED (see THING_PLAN.md)
    house.add(spawn('GothicBed_01', { x: 10.4, y: deckY, z: -4.4, ry: Math.PI / 2 }));
    ucbox(10.5, -4.5, 1.7, 2.2, false);
    thing = buildTheThing();
    // South of the east chimney breast (stone shaft x 9.72..11.08, z -2.82..-1.59):
    // the north lobes pile against its stone; the wall-climb sits on clear wall.
    thing.group.position.set(10.1, deckY, -0.35);       // sculpt's y0 = the boards; local +x = the east wall
    house.add(thing.group);
    ucbox(10.35, -0.3, 2.7, 3.3, false);                // the body; leaves a ~1.8 m lane west of it
    ucbox(8.85, -0.95, 0.7, 0.7, false);                // the planted arm/hand (so you can't wade through it)
    breathers.push(thing);
    anchors.breather = { x: HX + 10.1, z: HZ - 0.35, y: FY + deckY + 0.8 };

    // ---- the room it is claiming (THING_PLAN §2.8) --------------------------
    // A soaked stain under the mass, dark vein-cords crawling around the
    // chimney breast toward the bed and up the east wall — and, on the GROUND
    // floor below, the bulging ceiling stain + hanging strands that plant the
    // rumor before anyone climbs the stairs.
    const stainTex = canvasTexture((g, W, H) => {
      g.clearRect(0, 0, W, H);
      const blot = (x, y, r, a) => {
        const gr = g.createRadialGradient(x, y, r * 0.1, x, y, r);
        gr.addColorStop(0, `rgba(18,10,14,${a})`);
        gr.addColorStop(0.7, `rgba(26,16,20,${a * 0.55})`);
        gr.addColorStop(1, 'rgba(26,16,20,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      blot(128, 118, 95, 0.9);
      for (let i = 0; i < 14; i++)
        blot(128 + (Math.sin(i * 2.71) * 78), 118 + (Math.cos(i * 1.93) * 66), 18 + (i * 7) % 30, 0.5);
      // drip fingers wandering off the main body
      g.strokeStyle = 'rgba(20,12,16,0.55)'; g.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        let x = 128 + Math.sin(i * 2.1) * 60, y = 118 + Math.cos(i * 1.4) * 55;
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += Math.sin(i * 3.7 + s) * 9; y += 12 + (s % 3) * 4; g.lineTo(x, y); }
        g.stroke();
      }
    }, 256, 256);
    const stainMat = new THREE.MeshLambertMaterial({ map: stainTex, transparent: true, depthWrite: false });
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.2), stainMat);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(10.1, deckY + 0.006, -0.35);
    house.add(stain);

    // vein-cords: merged tubes; floor runs go AROUND the chimney's west side
    const veinMat = new THREE.MeshLambertMaterial({ color: 0x241a20 });
    const veinGeos = [];
    const vein = (pts, r) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      veinGeos.push(new THREE.TubeGeometry(curve, 16, r, 5, false));
    };
    vein([[9.5, deckY + 0.02, -0.7], [9.25, deckY + 0.015, -1.6], [9.3, deckY + 0.012, -2.5], [9.8, deckY + 0.012, -3.3], [10.15, deckY + 0.02, -3.6]], 0.028);
    vein([[9.7, deckY + 0.02, -0.95], [9.45, deckY + 0.012, -1.9], [9.6, deckY + 0.01, -2.9], [10.0, deckY + 0.015, -3.42]], 0.02);
    vein([[10.6, deckY + 0.02, -1.55], [10.9, deckY + 0.012, -2.0], [11.1, deckY + 0.01, -2.4]], 0.016);
    vein([[11.68, deckY + 0.25, -0.9], [11.71, deckY + 0.9, -1.1], [11.73, deckY + 1.6, -1.0], [11.73, deckY + 2.1, -0.75]], 0.022);
    vein([[11.68, deckY + 0.3, 0.5], [11.72, deckY + 0.8, 0.7], [11.73, deckY + 1.3, 0.65]], 0.016);
    const veins = new THREE.Mesh(mergeGeometries(veinGeos, false), veinMat);
    veins.castShadow = false;
    house.add(veins);

    // below, on the ground-floor bedroom ceiling: the swollen stain it rests
    // on, and a few strands that have found their way through the boards.
    // NOTE: the visible ceiling from below is the DECK UNDERSIDE (deckY - dT),
    // not GROUND_CEIL_Y (a world-space collider constant).
    const ceilLocalY = deckY - dT - 0.012;
    const under = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.5), stainMat);
    under.rotation.x = Math.PI / 2;                       // faces DOWN into the room
    under.position.set(10.1, ceilLocalY, -0.35);
    house.add(under);
    const strandGeos = [];
    for (const [sx, sz, len] of [[9.6, -0.9, 0.42], [10.4, 0.2, 0.3], [10.8, -1.1, 0.5], [9.9, 0.6, 0.24], [10.3, -0.5, 0.36]]) {
      const gg = new THREE.CylinderGeometry(0.008, 0.016, len, 5);
      gg.translate(sx, ceilLocalY - 0.008 - len / 2, sz);
      strandGeos.push(gg);
    }
    const strands = new THREE.Mesh(mergeGeometries(strandGeos, false), veinMat);
    strands.castShadow = false;
    house.add(strands);
    // the caretaker's dropped warning, on the boards beneath the stain
    anchors.thingNote = { x: HX + 9.4, z: HZ - 0.3, y: FY + 0.06 };

    // furnish the other upstairs rooms so they read as real (shuttered bedrooms + stores)
    const up = (name, x, z, ry = 0) => house.add(spawn(name, { x, y: deckY, z, ry }));
    up('GothicBed_01', -8.6, 3.4, -Math.PI / 2); ucbox(-8.7, 3.4, 2.2, 1.7, false);        // W-front bedroom
    up('ClassicNightstand_01', -10.7, 4.7, 0.4); ucbox(-10.7, 4.7, 0.6, 0.5, false);
    up('painted_wooden_cabinet', -3.4, 5.95, Math.PI); ucbox(-3.4, 5.95, 1.4, 0.6, false);
    up('GothicBed_01', -6.5, -3.4, 0.05); ucbox(-6.5, -3.5, 1.7, 2.4, false);              // W-back bedroom
    up('Rockingchair_01', -3.4, -2.0, 1.9); ucbox(-3.4, -2.0, 0.9, 0.9, false);
    up('wooden_crate_01', -9.4, -5.5, 0.3); ucbox(-9.4, -5.5, 1.0, 1.0, false);
    up('WoodenTable_02', 5.4, 5.2, 0); ucbox(5.4, 5.2, 1.1, 0.9, false);                   // E-front study/room
    up('painted_wooden_chair_01', 5.3, 3.9, Math.PI); ucbox(5.3, 3.9, 0.6, 0.6, false);
    up('wooden_crate_02', 4.3, -3.0, 0.4); ucbox(4.3, -3.0, 0.9, 0.9, false);              // E-back store
    up('ClassicNightstand_01', 8.9, -5.3, 0.1); ucbox(8.9, -5.3, 0.6, 0.5, false);         // E-wing (bed + the mass)

    // --- a REAL mirror (THREE.Reflector) on the west wall, holding a LIVE reflection
    // of Anna that reacts as you move. The "Anna" proxy lives on layer 2 — the
    // first-person camera never renders it, but the mirror's own camera does, so you
    // see yourself in the glass. The reflector only renders when you're near (perf). ---
    const mmX = -11.66, mmY = deckY + 1.15, mmZ = 1.0, gw = 0.86, gh = 1.7, frameM = mat.woodDark;
    const mirror = new Reflector(new THREE.PlaneGeometry(gw, gh), { color: 0x5a5f63, textureWidth: 256, textureHeight: 256 });   // low-res render target — cheap
    mirror.position.set(mmX, mmY, mmZ); mirror.rotation.y = Math.PI / 2;   // glass faces +x, into the room
    mirror.camera.layers.enable(2);          // the reflection ALSO renders the Anna proxy (layer 2)
    mirror.visible = false;                  // gated on by proximity — no render cost otherwise
    house.add(mirror);
    // wood frame around the glass (in the mirror's plane: spans y and z)
    const fx = -11.72;
    house.add(box(0.12, 0.1, gw + 0.22, frameM, fx, mmY + gh / 2 + 0.05, mmZ));   // top
    house.add(box(0.12, 0.1, gw + 0.22, frameM, fx, mmY - gh / 2 - 0.05, mmZ));   // bottom
    house.add(box(0.12, gh + 0.2, 0.1, frameM, fx, mmY, mmZ - gw / 2 - 0.05));    // near side (−z)
    house.add(box(0.12, gh + 0.2, 0.1, frameM, fx, mmY, mmZ + gw / 2 + 0.05));    // far side (+z)
    ucbox(-11.82, 1.0, 0.35, 1.2, false);
    // the reflected Anna — reused NPC face/hat so she doesn't read as crude blocks
    const anna = buildAnnaProxy();
    anna.traverse((o) => o.layers.set(2));   // only the mirror's camera sees her
    anna.visible = false;
    scene.add(anna);
    const mmWX = HX + mmX, mmWZ = HZ + mmZ;
    let litForMirror = false, mirrorOn = false;
    updateMirror = (px, pz, py, pyaw) => {
      // only render the reflection when upstairs AND near AND roughly facing the mirror
      // (its normal is -x, toward the room). Hysteresis stops it flickering at the edge.
      const d = Math.hypot(px - mmWX, pz - mmWZ), upstairs = py > 4;
      const facing = Math.sin(pyaw) > 0.25;   // player's view turned toward -x (the glass on the west wall)
      if (!mirrorOn && upstairs && d < 5.5 && facing) mirrorOn = true;
      else if (mirrorOn && (!upstairs || d > 8 || !facing)) mirrorOn = false;
      mirror.visible = mirrorOn; anna.visible = mirrorOn;
      if (mirrorOn) {
        anna.position.set(px, py, pz); anna.rotation.y = pyaw + Math.PI;   // stand where you stand, face your facing
        if (!litForMirror) { litForMirror = true; scene.traverse((o) => { if (o.isLight) o.layers.enable(2); }); }  // let the lights reach her (layer 2), once
      }
    };
  }

  // combined floor override: the upstairs stair/deck/balcony first, else cellar/ground.
  // Like the cellar, it tracks level by the stair ramp height (not the raw camera Y).
  let upperLevel = false;
  const houseFloorAt = (x, z) => {
    const lx = x - HX, lz = z - HZ;
    if (lx > STAIR.x0 && lx < STAIR.x1 && lz > STAIR.zTop && lz < STAIR.zBot) {
      const ry = FY + STOREY_RISE * Math.max(0, Math.min(1, (STAIR.zBot - lz) / (STAIR.zBot - STAIR.zTop)));
      if (ry > UPPER_FLOOR_Y - 1.0) upperLevel = true; else if (ry < FY + 1.0) upperLevel = false;
      return ry;                                        // ride the stair
    }
    if (upperLevel) {
      const inInterior = lx > -12 && lx < 12 && lz > -6.5 && lz < 6.5;
      const inBalcony = lx > txMin - 0.15 && lx < txMax + 0.15 && lz > 6.4 && lz < 10.2;
      if (inInterior || inBalcony) return UPPER_FLOOR_Y;
    }
    return cellar.floorAt(x, z);                        // ground / cellar
  };

  // historical plaque by the path
  const plaque = makeSign(
    ['designed by A. Bustillo, c.1943', 'a fine example of lake architecture', '"the house has done nothing. it is the water."'],
    { title: 'ESTANCIA INALCO', w: 1.5, h: 0.95, bg: '#41525a', fg: '#cfd8ce' }
  );
  // mounted on TWO posts at reading height — the board rests on its posts instead
  // of hovering above a single stick
  const plqX = HX + 3.4, plqZ = HZ + 11.5, plqGY = groundYAt(plqX, plqZ);
  const plqCy = plqGY + 1.2;                                   // board centre (reading height)
  for (const dx of [-0.62, 0.62])
    scene.add(cyl(0.05, 0.06, 1.75, mat.woodDark, plqX + dx, plqGY + 0.875, plqZ - 0.05, 6));
  plaque.position.set(plqX, plqCy, plqZ);
  plaque.rotation.y = -0.12;                                   // face the path (toward the dock approach)
  scene.add(plaque);
  anchors.plaque = { x: plqX, z: plqZ, y: plqCy };

  // ------------------------------------------------------------------ kiosk
  const K = LAYOUT.kiosk;
  const kiosk = new THREE.Group();
  kiosk.position.set(K.x, K.y, K.z);
  scene.add(kiosk);
  kiosk.add(box(0.14, 2.3, 2.6, mat.plank, 1.5, 1.15, 0));             // back wall (east)
  kiosk.add(box(3.0, 2.3, 0.14, mat.plank, 0, 1.15, -1.25));           // side
  kiosk.add(box(3.0, 2.3, 0.14, mat.plank, 0, 1.15, 1.25));            // side
  kiosk.add(box(3.4, 0.14, 3.0, mat.roof, 0, 2.36, 0, 0, 0, 0.1));     // roof
  kiosk.add(box(0.16, 1.02, 2.6, mat.woodDark, -1.45, 0.51, 0));       // counter front
  kiosk.add(box(0.5, 0.07, 2.7, mat.wood, -1.4, 1.05, 0));             // counter top
  // shelves with merch
  kiosk.add(box(0.3, 0.05, 2.3, mat.wood, 1.25, 1.5, 0));
  kiosk.add(box(0.3, 0.05, 2.3, mat.wood, 1.25, 1.9, 0));
  for (let i = 0; i < 7; i++) {
    const mug = cyl(0.06, 0.05, 0.12, new THREE.MeshLambertMaterial({ color: [0xa89078, 0x8798a0, 0xa07878][i % 3] }), 1.25, 1.56, -1 + i * 0.33, 8);
    kiosk.add(mug);
  }
  for (let i = 0; i < 5; i++) {
    const pc = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22),
      new THREE.MeshLambertMaterial({ color: 0xc9c2ae }));
    pc.position.set(1.24, 1.98 + Math.random() * 0.04, -0.8 + i * 0.4);
    pc.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    kiosk.add(pc);
  }
  const kioskSign = makeSign(
    ['souvenirs · mate · ferry schedule', 'ask about the house — everyone does', 'closed after dark'],
    { title: 'INALCO KIOSK', w: 2.5, h: 0.72, bg: '#5a3b28', fg: '#e8ddc0' }
  );
  // a fascia board across the top of the serving window, under the eave (roof 2.36)
  kioskSign.position.set(-1.5, 1.94, 0); kioskSign.rotation.y = -Math.PI / 2;
  kiosk.add(kioskSign);
  colliders.addBox(K.x + 0.25, K.z, 3.2, 2.7, { blocksSight: true });
  anchors.mug = { x: K.x - 1.35, z: K.z - 0.4, y: K.y + 1.12 };
  anchors.kioskNote = { x: K.x - 1.35, z: K.z + 0.55, y: K.y + 1.1 };

  // garden gnome, paint weathered off — the spare house key waits under him
  const gy = groundYAt(K.x - 1.7, K.z - 2.1);
  const gnome = spawn('garden_gnome', { x: K.x - 1.7, y: gy, z: K.z - 2.1, ry: -0.7 });
  scene.add(gnome);
  anchors.gnome = { x: K.x - 1.7, z: K.z - 2.1, y: gy + 0.4, label: 'the gnome' };

  // ------------------------------------------------------------------- shed
  const S = LAYOUT.shed;
  const shed = new THREE.Group();
  shed.position.set(S.x, S.y, S.z);
  scene.add(shed);
  const shedWalls = [
    [0, -1.5, 4.2, 0.16], [-2.1, 0, 0.16, 3.2], [2.1, 0, 0.16, 3.2],
    [-1.35, 1.5, 1.5, 0.16], [1.35, 1.5, 1.5, 0.16],   // front, door gap in middle
  ];
  for (const [cx, cz, w, d] of shedWalls) {
    shed.add(box(w, 2.4, d, mat.plank, cx, 1.2, cz));
    colliders.addBox(S.x + cx, S.z + cz, w, d, { blocksSight: true });
  }
  shed.add(box(4.8, 0.12, 4.0, mat.roof, 0, 2.55, 0, 0, 0.1));
  shed.add(box(4.2, 0.06, 3.2, new THREE.MeshLambertMaterial({ color: 0x4c4438 }), 0, 0.03, 0));
  doors.shed = makeDoor(scene, colliders, { x: S.x, z: S.z + 1.5, y: S.y, w: 1.1, axis: 'x', swing: 1, locked: false, name: 'shed' });
  // generator
  const gen = new THREE.Group();
  gen.add(box(1.15, 0.75, 0.7, new THREE.MeshLambertMaterial({ color: 0x3f5544, flatShading: true }), 0, 0.45, 0));
  gen.add(cyl(0.1, 0.1, 0.5, mat.metal, -0.35, 0.95, 0, 7));
  gen.children[1].rotation.z = Math.PI / 2;
  gen.add(box(0.2, 0.06, 0.12, mat.metal, 0.42, 0.86, 0.2));
  const genLight = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0x3a1410 }));
  genLight.position.set(0.45, 0.7, 0.36);
  gen.add(genLight);
  gen.position.set(0, 0.08, -0.55);
  shed.add(gen);
  colliders.addBox(S.x, S.z - 0.55, 1.3, 0.85, { blocksSight: false });
  // drums + the prop crate (Mara's badge sits on it)
  shed.add(spawn('barrel_03', { x: -1.5, z: -0.75 }));
  colliders.addCircle(S.x - 1.5, S.z - 0.75, 0.34);
  shed.add(spawn('wooden_crate_02', { x: -1.45, z: 0.42, ry: 0.3 }));
  colliders.addCircle(S.x - 1.45, S.z + 0.42, 0.34);
  shed.add(spawn('metal_toolbox', { x: 1.15, y: 0.92, z: -0.75, ry: -0.4 }));
  // workbench along the east wall — papers go ON it, not in mid-air
  shed.add(box(1.1, 0.06, 2.2, mat.wood, 1.4, 0.88, -0.1));
  for (const [lx, lz] of [[1.0, -1.0], [1.8, -1.0], [1.0, 0.8], [1.8, 0.8]])
    shed.add(box(0.07, 0.86, 0.07, mat.woodDark, lx, 0.44, lz));
  shed.add(box(0.3, 0.14, 0.2, mat.metal, 1.7, 0.98, -0.8));      // an old vise, roughly
  colliders.addBox(S.x + 1.4, S.z - 0.1, 1.2, 2.3, { blocksSight: false });
  anchors.shedBenchA = { x: S.x + 1.35, z: S.z - 0.55, y: S.y + 0.94 };
  anchors.shedBenchB = { x: S.x + 1.45, z: S.z + 0.45, y: S.y + 0.94 };

  const shedBulbMat = new THREE.MeshBasicMaterial({ color: 0x201a12 });
  const shedBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 6), shedBulbMat);
  shedBulb.position.set(0, 2.25, 0);
  shed.add(shedBulb);
  const shedLight = new THREE.PointLight(PAL.warm, 0, 7, 1.8);
  shedLight.position.set(S.x, S.y + 2.1, S.z);
  scene.add(shedLight);
  lamps.push({ light: shedLight, bulbMat: shedBulbMat, base: 4, warmup: 0 });
  anchors.generator = { x: S.x, z: S.z - 0.4, y: S.y + 0.8, label: 'the generator' };
  anchors.shedNote = { x: S.x + 1.5, z: S.z - 1.1, y: S.y + 1.0 };

  // -------------------------------------------------------------- greenhouse
  const G = LAYOUT.green;
  const green = new THREE.Group();
  green.position.set(G.x, G.y, G.z);
  scene.add(green);
  const gw = 8, gd = 4, gh = 2.1, ridgeH = 3.0;
  // frame posts
  for (const px of [-gw / 2, -gw / 6, gw / 6, gw / 2])
    for (const pz of [-gd / 2, gd / 2])
      green.add(box(0.09, gh, 0.09, mat.white, px, gh / 2, pz));
  green.add(box(gw, 0.09, 0.09, mat.white, 0, gh, -gd / 2));
  green.add(box(gw, 0.09, 0.09, mat.white, 0, gh, gd / 2));
  green.add(box(gw, 0.09, 0.09, mat.white, 0, ridgeH, 0));
  // gable rakes so the ridge beam doesn't end in mid-air
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rakeLen = Math.hypot(gd / 2, ridgeH - gh);
      const rake = box(0.07, 0.07, rakeLen, mat.white,
        sx * gw / 2, (gh + ridgeH) / 2, sz * gd / 4, 0, sz * Math.atan2(ridgeH - gh, gd / 2));
      green.add(rake);
    }
  }
  // glass walls (a couple of panes broken)
  let paneI = 0;
  for (const pz of [-gd / 2, gd / 2]) {
    for (let i = 0; i < 6; i++) {
      paneI++;
      if (paneI === 4 || paneI === 9) continue;   // broken
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(gw / 6 - 0.06, gh - 0.1), mat.paneGlass);
      pane.position.set(-gw / 2 + gw / 12 + i * (gw / 6), gh / 2, pz);
      green.add(pane);
    }
  }
  // glass roof
  for (const s of [-1, 1]) {
    const slantL = Math.hypot(gd / 2, ridgeH - gh);
    const roofPane = new THREE.Mesh(new THREE.PlaneGeometry(gw, slantL), mat.paneGlass);
    roofPane.position.set(0, (gh + ridgeH) / 2, s * gd / 4);
    roofPane.rotation.x = s > 0 ? -Math.PI / 2 + Math.atan2(ridgeH - gh, gd / 2) : Math.PI / 2 - Math.atan2(ridgeH - gh, gd / 2);
    green.add(roofPane);
  }
  // end walls with door gap on west
  green.add(box(0.09, gh, gd, mat.white, gw / 2, gh / 2, 0));
  const gPaneE = new THREE.Mesh(new THREE.PlaneGeometry(gd - 0.1, gh - 0.1), mat.paneGlass);
  gPaneE.rotation.y = Math.PI / 2; gPaneE.position.set(gw / 2 - 0.02, gh / 2, 0);
  green.add(gPaneE);
  green.add(box(0.09, gh, 1.2, mat.white, -gw / 2, gh / 2, -1.4));
  green.add(box(0.09, gh, 1.2, mat.white, -gw / 2, gh / 2, 1.4));
  // one fallen pane leaning inside
  const fallen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), mat.paneGlass);
  fallen.position.set(-1.2, 0.7, -0.8); fallen.rotation.set(0.9, 0.4, 0.2);
  green.add(fallen);
  // colliders: glass walls block movement, not sight
  colliders.addBox(G.x, G.z - gd / 2, gw, 0.2);
  colliders.addBox(G.x, G.z + gd / 2, gw, 0.2);
  colliders.addBox(G.x + gw / 2, G.z, 0.2, gd);
  colliders.addBox(G.x - gw / 2, G.z - 1.4, 0.2, 1.3);
  colliders.addBox(G.x - gw / 2, G.z + 1.4, 0.2, 1.3);
  // benches crowded with real plants
  const potKinds = ['potted_plant_01', 'potted_plant_02', 'potted_plant_04'];
  for (const [bi, bz] of [-1.1, 1.1].entries()) {
    green.add(box(6.6, 0.07, 0.8, mat.wood, 0.4, 0.75, bz));
    for (const [i, [lx2, lz2]] of [[-2.6, 0], [-1.3, 0.1], [0, -0.1], [1.3, 0], [2.6, 0.1]].entries()) {
      green.add(spawn(potKinds[(i + bi) % 3], {
        x: 0.4 + lx2, y: 0.79, z: bz + lz2, ry: Math.random() * Math.PI * 2,
      }));
    }
    colliders.addBox(G.x + 0.4, G.z + bz, 6.7, 0.9, { blocksSight: false });
  }
  // ground level: ferns in the corners, planter boxes along the south glass
  green.add(spawn('fern_02', { x: 2.9, z: -1.5 }));
  green.add(spawn('fern_02', { x: -3.1, z: 1.35, ry: 1.9 }));
  green.add(spawn('planter_box_01', { x: -1.4, z: 1.62, ry: 0.05 }));
  green.add(spawn('planter_box_01', { x: 1.6, z: 1.62, ry: -0.08 }));
  green.add(spawn('ceramic_pot', { x: 3.4, z: 1.5 }));
  anchors.diary = { x: G.x - 1.8, z: G.z + 1.1, y: G.y + 0.80 };

  // --------------------------------------------------------------- boathouse
  const B = LAYOUT.boathouse;
  const bh = new THREE.Group();
  bh.position.set(B.x, B.y, B.z);
  scene.add(bh);
  const bw = 9, bd = 7, bwh = 2.7;
  const bWalls = [
    [0, -bd / 2, bw, 0.18],                                   // north (shore side)
    [-bw / 2, 0.575, 0.18, 5.85],                             // west wall — opening sized to the door (z -3.5..-2.35)
    [bw / 2, 0, 0.18, bd],                                    // east
  ];
  for (const [cx, cz, w, d] of bWalls) {
    bh.add(box(w, bwh, d, mat.plankDark, cx, bwh / 2, cz));
    colliders.addBox(B.x + cx, B.z + cz, w, d, { blocksSight: true });
  }
  // gable roof
  const bRise = 1.6, bSlant = Math.hypot(bd / 2 + 0.4, bRise), bAng = Math.atan2(bRise, bd / 2 + 0.4);
  bh.add(box(bw + 1, 0.14, bSlant + 0.2, mat.roof, 0, bwh + bRise / 2, (bd / 4 + 0.1), 0, bAng));
  bh.add(box(bw + 1, 0.14, bSlant + 0.2, mat.roof, 0, bwh + bRise / 2, -(bd / 4 + 0.1), 0, -bAng));
  for (const sz of [-1, 1]) {
    const shp = new THREE.Shape();
    shp.moveTo(-bd / 2, 0); shp.lineTo(bd / 2, 0); shp.lineTo(0, bRise);
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(shp),
      new THREE.MeshLambertMaterial({ map: planksTex(0x453424), side: THREE.DoubleSide }));
    gable.rotation.y = sz * Math.PI / 2;
    gable.position.set(sz * (bw / 2 - 0.01), bwh, 0);
    bh.add(gable);
  }
  // Continuous plank floor: the old slip has been decked over now the boat moors
  // out on the open lake, so the boathouse is a dry shelter with a solid, gapless
  // floor (no buried water plane, no recessed hole).
  bh.add(box(bw - 0.3, 0.12, bd - 0.2, mat.wood, 0, 0.02, 0));
  // a low sill across the mouth so you don't step off into the lake
  colliders.addBox(B.x, B.z + 3.6, 4.2, 0.3);   // south opening (the mouth)
  // the boat — a small weathered wooden skiff (rowboat), replacing the old box +
  // pyramid. The hull is a custom skin lofted through tapering cross-sections:
  // pointed bow (+z), flat transom stern (-z), and an OPEN interior you can see
  // into. A merged set of floorboards/thwarts/rails + a pair of oarlocks (to
  // match the oars on the wall) finish it.
  const boat = new THREE.Group();
  const boatWood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.82, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const railWood = new THREE.MeshStandardMaterial({ color: 0x4f371f, roughness: 0.8, metalness: 0 });
  // [z, halfBeam, keelY] from stern (-z) to bow (+z); gunwale (top) sits at y=0
  const secs = [
    [-1.75, 0.58, -0.40], [-1.1, 0.70, -0.46], [-0.3, 0.75, -0.50],
    [0.5, 0.70, -0.48], [1.15, 0.52, -0.42], [1.6, 0.30, -0.34], [1.9, 0.05, -0.24],
  ];
  const ringOf = (hb, ky, z) => [
    [-hb, 0, z], [-hb * 0.8, ky * 0.5, z], [-hb * 0.4, ky * 0.9, z], [0, ky, z],
    [hb * 0.4, ky * 0.9, z], [hb * 0.8, ky * 0.5, z], [hb, 0, z],
  ];
  const rings = secs.map(([z, hb, ky]) => ringOf(hb, ky, z));
  const N = 7, pos = [];
  const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let s = 0; s < rings.length - 1; s++) {
    const r0 = rings[s], r1 = rings[s + 1];
    for (let i = 0; i < N - 1; i++) { tri(r0[i], r1[i], r1[i + 1]); tri(r0[i], r1[i + 1], r0[i + 1]); }
  }
  const stern = rings[0], sc = [0, -0.20, stern[0][2]];       // transom cap (fan to stern top-centre)
  for (let i = 0; i < N - 1; i++) tri(stern[i], sc, stern[i + 1]);
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, boatWood);
  hull.castShadow = true; hull.receiveShadow = true;
  boat.add(hull);
  // floorboards, two thwarts (seats), a small foredeck, and the gunwale rails —
  // all merged into one mesh
  const woodGeos = [
    boxGeo(0.2, 0.03, 2.0, -0.22, -0.40, -0.1), boxGeo(0.2, 0.03, 2.0, 0, -0.41, -0.1), boxGeo(0.2, 0.03, 2.0, 0.22, -0.40, -0.1),
    boxGeo(1.30, 0.05, 0.26, 0, -0.12, -0.6), boxGeo(1.32, 0.05, 0.26, 0, -0.12, 0.4),   // thwarts
    boxGeo(0.5, 0.04, 0.5, 0, -0.05, 1.5),                                               // foredeck
  ];
  for (const idx of [0, 6]) {                                 // port & starboard gunwale rails
    const curve = new THREE.CatmullRomCurve3(rings.map((r) => new THREE.Vector3(r[idx][0], r[idx][1] + 0.01, r[idx][2])));
    woodGeos.push(new THREE.TubeGeometry(curve, 22, 0.038, 5, false));
  }
  mergeInto(boat, woodGeos, railWood);
  for (const sx of [-1, 1]) boat.add(cyl(0.02, 0.02, 0.12, mat.metal, sx * 0.72, 0.06, 0.05, 6));  // oarlocks
  // Float the skiff on the OPEN LAKE south of the boathouse mouth, clear of the
  // raised boathouse pad (terrain there is ~-0.5, well below the hull). Water
  // level is y=0: keel ~0.15 under, gunwale ~0.35 above — it reads as a real
  // moored boat with no height juggling. The boathouse stays — shelter and gas.
  boat.position.set(-46, 0.35, 68);
  boat.rotation.y = -0.25;                                                 // bow angled out toward the lake
  scene.add(boat);
  // hanging lantern (real one; the small core sphere carries the finale glow)
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0x241c12 });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lanternMat);
  lantern.position.set(0, bwh - 0.52, -1);
  bh.add(lantern);
  bh.add(spawn('Lantern_01', { x: 0, y: bwh - 0.72, z: -1, s: 0.55 }));
  const lanternLight = new THREE.PointLight(0xffa050, 0, 8, 1.8);
  lanternLight.position.set(B.x, B.y + bwh - 0.5, B.z - 1);
  scene.add(lanternLight);
  // the boathouse itself is open — it's the BOAT that's locked down
  doors.boathouse = makeDoor(scene, colliders, { x: B.x - bw / 2, z: B.z - 2.9, y: B.y, w: 1.1, axis: 'z', swing: -1, locked: false, name: 'boathouse' });
  // frame the doorway so it no longer reads as a raw slot: a header fills the gap
  // above the leaf (door 2.16 tall in a 2.7 wall), plus jamb casings each side.
  bh.add(box(0.2, bwh - 2.16, 1.2, mat.plankDark, -bw / 2, 2.16 + (bwh - 2.16) / 2, -2.9));   // header/lintel
  bh.add(box(0.22, 2.16, 0.12, mat.woodDark, -bw / 2, 1.08, -2.28));                           // south jamb casing
  bh.add(box(0.22, 2.16, 0.12, mat.woodDark, -bw / 2, 1.08, -3.5));                            // hinge-side jamb casing

  // --- interior: things worth poking through
  // workbench along the east wall
  bh.add(box(0.85, 0.07, 3.0, mat.wood, 3.55, 0.78, 0.5));
  for (const [lx, lz] of [[3.25, -0.85], [3.85, -0.85], [3.25, 1.85], [3.85, 1.85]])
    bh.add(box(0.07, 0.76, 0.07, mat.woodDark, lx, 0.4, lz));
  colliders.addBox(B.x + 3.55, B.z + 0.5, 0.95, 3.1, { blocksSight: false });
  // the clutter a boathouse earns over decades
  bh.add(spawn('metal_toolbox', { x: 3.55, y: 0.82, z: -0.4, ry: 0.25 }));
  // barrels tucked against the north wall, EAST of the jerry can (local ~0.6,-2.6) so
  // they never block the west door → fuel-can path (they used to sit in the doorway,
  // making the can unreachable).
  bh.add(spawn('barrel_03', { x: 1.6, z: -3.05 }));
  bh.add(spawn('barrel_03', { x: 2.3, z: -3.0, ry: 1.2 }));
  colliders.addCircle(B.x + 1.95, B.z - 3.05, 0.5);
  bh.add(spawn('wooden_crate_01', { x: 3.6, z: -2.75, ry: 0.15 }));
  bh.add(spawn('wooden_crate_02', { x: 3.55, y: 0.52, z: -2.7, ry: 0.5 }));
  bh.add(spawn('old_military_crate', { x: -3.4, z: 1.9, ry: -0.2 }));
  colliders.addBox(B.x - 3.4, B.z + 1.9, 1.1, 0.7, { blocksSight: false });
  // Hung FLAT on the west wall. The model's ring lies in its XY plane with the
  // flat faces along ±Z (thickness ~0.155 in Z), so it must be turned about Y —
  // NOT Z — to face into the room; a Z-turn only spins it in place and leaves
  // ~0.42 m of ring punching straight through the wall. Pulled proud of the wall
  // inner face (x -4.41) and placed clear of the life vests below it.
  const buoy = spawn('lifebuoy', { x: -4.30, y: 1.7, z: 1.6 });
  buoy.rotation.y = Math.PI / 2;   // ring faces +x, into the boathouse
  bh.add(buoy);
  // oars leaning on the north wall
  for (const [lx, rz] of [[-1.0, 0.22], [-1.35, 0.3]]) {
    const oar = cyl(0.028, 0.028, 2.7, mat.wood, lx, 1.32, -3.28, 5);
    oar.rotation.z = rz; oar.rotation.x = -0.08;
    bh.add(oar);
    const blade = box(0.16, 0.5, 0.04, mat.wood, lx + Math.sin(rz) * 1.32, 2.6, -3.32);
    blade.rotation.z = rz;
    bh.add(blade);
  }
  // life vests on the west wall
  for (const [lz, r] of [[-0.6, 0.1], [0.35, -0.14]]) {
    const vest = box(0.2, 0.62, 0.46, new THREE.MeshLambertMaterial({ color: 0x9c5a28 }), -4.32, 1.55, lz, 0, 0, r);
    bh.add(vest);
  }
  // coiled rope on the north walkway
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 14),
    new THREE.MeshLambertMaterial({ color: 0x8a7a5a }));
  rope.rotation.x = -Math.PI / 2; rope.position.set(1.6, 0.13, -2.7);
  rope.castShadow = true;
  bh.add(rope);

  // --- the chain: boat stern to a cleat, with padlock
  const chainMat = new THREE.MeshLambertMaterial({ color: 0x3a3d40, flatShading: true });
  const chain = new THREE.Group();
  const link = (ax, ay, az, bx, by, bz) => {
    const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = d.length();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, len, 5), chainMat);
    c.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    c.castShadow = true;
    return c;
  };
  // world-space now: boat stern (~-45.6, 0.4, 66.3) back to a cleat on the east
  // walkway at the boathouse mouth, with the padlock that keeps you ashore.
  chain.add(link(-45.6, 0.4, 66.3, -44.9, 0.18, 64.7));           // sagging mooring line
  chain.add(link(-44.9, 0.18, 64.7, -44.0, 0.82, 63.4));         // up to the cleat
  chain.add(box(0.16, 0.09, 0.16, mat.metal, -44.0, 0.9, 63.4));  // cleat on the walkway
  chain.add(box(0.11, 0.15, 0.05, new THREE.MeshLambertMaterial({ color: 0x776a2f }), -44.2, 0.66, 63.6)); // padlock
  scene.add(chain);
  const boatChain = { group: chain, hide() { chain.visible = false; } };

  anchors.boat = { x: -46, z: 63.2, y: 0.6, label: 'the boat' };
  anchors.finalNote = { x: B.x + 3.55, z: B.z + 1.2, y: B.y + 0.83 };
  anchors.bhInventory = { x: B.x + 3.55, z: B.z - 0.2, y: B.y + 0.83 };
  anchors.boathouseDoorOutside = { x: B.x - bw / 2 - 1.2, z: B.z - 2.9 };

  // ---------------------------------------------------------------- power
  function setPower(on) {
    power = on;
    for (const l of lamps) l.warmup = 0;
    for (const m of glowPlanes) { /* toggled in update for flicker-on */ }
  }

  // All doors exist by now; cache the value list so update() doesn't rebuild it every frame.
  const doorList = Object.values(doors);

  let t = 0;
  function update(dt, ctx) {
    t += dt;
    for (const d of doorList) d.update(dt);
    piano.update(dt);
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      if (power) {
        l.warmup = Math.min(1, l.warmup + dt * (0.5 + i * 0.13));
        const flicker =
          0.86 + 0.14 * Math.sin(t * 11 + i * 7.3) * Math.sin(t * 3.7 + i * 2.9) +
          (Math.sin(t * 0.6 + i) > 0.985 ? -0.5 : 0);
        l.light.intensity = l.base * l.warmup * Math.max(0.25, flicker);
        l.bulbMat.color.setHex(0xffd9a0).multiplyScalar(Math.max(0.3, flicker));
      } else {
        l.light.intensity = 0;
        l.bulbMat.color.setHex(0x201a12);
      }
    }
    for (const b of breathers) b.update(dt, t, ctx);   // the upstairs thing (ctx: player pos/dir, upstairs flag)
    for (const g of glowPlanes) g.opacity = power ? 0.75 + Math.sin(t * 9.1) * 0.08 : 0;
    // window glow visibility — toggle the collected glow meshes directly instead
    // of walking the whole mansion scene graph (+ allocating a closure) each frame
    for (const g of glowMeshes) g.visible = power;
  }

  // ---- checkpoint save/restore: power, door open/lock states, piano, chain ----
  function serialize() {
    const doorState = {};
    for (const [k, d] of Object.entries(doors)) doorState[k] = { open: !!d.open, locked: !!d.locked };
    return { power, doors: doorState, pianoOpen: piano.open, chainHidden: !boatChain.group.visible };
  }
  function restore(s) {
    if (!s) return;
    if (s.power && !power) setPower(true);
    if (s.doors) {
      for (const [k, ds] of Object.entries(s.doors)) {
        const d = doors[k]; if (!d) continue;
        d.locked = !!ds.locked;
        d.setOpen(!!ds.open); d.t = ds.open ? 1 : 0;   // snap to state, skip the swing
      }
    }
    if (s.pianoOpen && !piano.open) piano.toggle();
    if (s.chainHidden) boatChain.hide();
  }

  return {
    doors, anchors, setPower, update, insideHouse, insideHouseM,
    floorAt: houseFloorAt,                    // cellar + upstairs, in one override
    updateMirror,                             // per-frame: drive the upstairs live mirror
    houseCenter: { x: HX, z: HZ },
    isPowered: () => power,
    lantern: { mat: lanternMat, light: lanternLight },
    boatChain, cellar, piano, thing,
    paintings: { corridor: corridorPainting },
    serialize, restore,
  };
}

// local import to avoid a cycle: world owns the height function
import { groundHeight as groundYAt } from './world.js';
