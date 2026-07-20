// Ambient vignettes: brief, unprompted, atmospheric events that make the world
// feel alive and haunted independent of the player. A scheduler seeds their
// frequency on the Night-Engine tide (peaks → more often, lulls → rare), never
// steps on dialog/notes/real threat, and never runs two at once. The visuals
// are cheap and mostly silent — a fleeting dark shape plus a sound carries each.
//
// WARM-UP: every mesh here is built at init (hidden, visible=false) and added to
// the scene BEFORE main.js calls warmUpRenderer(), so their shaders compile
// behind the title screen instead of freezing the first time one appears.
//
// The silhouette figures are unlit MeshBasicMaterial (near-black): the intensity
// ~115 flashlight can't blow them white at any range. One shared geometry +
// material is reused across every silhouette vignette (only one runs at a time).

import * as THREE from 'three';
import { LAYOUT } from './config.js';
import { canvasTexture } from './world.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ---- a humanoid silhouette on an alpha map (white shape → tinted near-black by
// the material colour, so fog can still lift distant ones toward the fog tone).
function silhouetteTex() {
  return canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#ffffff';
    const cx = W / 2;
    // torso + legs as one tapering body
    c.beginPath();
    c.moveTo(cx - W * 0.30, H * 0.30);              // left shoulder
    c.quadraticCurveTo(cx - W * 0.34, H * 0.46, cx - W * 0.20, H * 0.60); // side to hip
    c.lineTo(cx - W * 0.19, H * 0.99);              // left outer leg
    c.lineTo(cx - W * 0.03, H * 0.99);              // left inner leg
    c.lineTo(cx - W * 0.02, H * 0.66);
    c.lineTo(cx + W * 0.02, H * 0.66);
    c.lineTo(cx + W * 0.03, H * 0.99);              // right inner leg
    c.lineTo(cx + W * 0.19, H * 0.99);              // right outer leg
    c.quadraticCurveTo(cx + W * 0.34, H * 0.46, cx + W * 0.30, H * 0.30); // hip to shoulder
    c.closePath();
    c.fill();
    // neck + head
    c.fillRect(cx - W * 0.07, H * 0.22, W * 0.14, H * 0.09);
    c.beginPath();
    c.ellipse(cx, H * 0.16, W * 0.15, H * 0.085, 0, 0, 7);
    c.fill();
    // a faint feather so the cutout edge isn't a hard blade
    c.globalAlpha = 0.35;
    c.lineWidth = 3; c.strokeStyle = '#ffffff';
    c.stroke();
    c.globalAlpha = 1;
  }, 96, 224);
}

// ---- a bare wet footprint (heel + ball + toe stabs) on an alpha map.
function footprintTex() {
  return canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(W * 0.5, H * 0.72, W * 0.26, H * 0.20, 0, 0, 7); c.fill();   // heel
    c.beginPath(); c.ellipse(W * 0.5, H * 0.40, W * 0.30, H * 0.17, 0, 0, 7); c.fill();   // ball
    for (let i = 0; i < 5; i++) {                                                          // toes
      const tx = W * (0.30 + i * 0.10), ty = H * (0.20 - Math.abs(i - 2) * 0.02);
      c.beginPath(); c.ellipse(tx, ty, W * 0.05, H * 0.045, 0, 0, 7); c.fill();
    }
  }, 48, 72);
}

export function buildVignettes(scene, ctx) {
  const { world, buildings, npcs, audio, player, ui, camera, night, director } = ctx;

  const HX = LAYOUT.house.x, HZ = LAYOUT.house.z;
  const FRONT_WIN_Z = HZ + 6.52;                 // window centres (used to aim the pick)
  // the front wall's solid box spans local z 6.25..6.75, so a figure must stand
  // clearly SOUTH of that face (world z HZ+6.95) or the wall occludes it. It then
  // reads as a dark shape at the window against the pale, moonlit plaster.
  const FIGURE_Z = HZ + 6.95;
  const FRONT_WIN_X = [-8.5, -4.5, 5.5, 10];     // local == world x (HX = 0)
  const DOCK_END = { x: 0, z: 78.8 };

  // ----------------------------------------------------------- shared meshes
  // ONE silhouette (never two vignettes at once) reused by every figure event.
  const silMat = new THREE.MeshBasicMaterial({
    map: silhouetteTex(), color: 0x05060b, transparent: true, opacity: 0,
    alphaTest: 0.28, side: THREE.DoubleSide, depthWrite: true, fog: true,
  });
  const silGeo = new THREE.PlaneGeometry(0.9, 1.85);
  silGeo.translate(0, 1.85 / 2, 0);              // pivot at the feet, so it grounds cleanly
  const sil = new THREE.Mesh(silGeo, silMat);
  sil.frustumCulled = false;
  sil.visible = false;
  scene.add(sil);

  // wet-footprint trail: flat decals on the jetty deck, one shared fading material
  const footMat = new THREE.MeshBasicMaterial({
    map: footprintTex(), color: 0x0a0f14, transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const footGeo = new THREE.PlaneGeometry(0.24, 0.36);
  footGeo.rotateX(-Math.PI / 2);                 // lie flat on the deck
  const footGroup = new THREE.Group();
  const deckY = 0.62;
  for (let i = 0; i < 8; i++) {
    const fp = new THREE.Mesh(footGeo, footMat);
    const z = 76.5 - i * 1.9;                     // walking off the dock toward the land
    fp.position.set(i % 2 ? 0.34 : -0.34, deckY, z);
    fp.rotation.y = 0.15 + (i % 2 ? -0.2 : 0.2);
    footGroup.add(fp);
  }
  footGroup.visible = false;
  scene.add(footGroup);

  // ------------------------------------------------------------- scratch/util
  const _cd = new THREE.Vector3();
  const camDir = () => player.camDir(_cd);
  const dist2 = (x, z) => Math.hypot(x - player.pos.x, z - player.pos.z);

  // is the player's gaze pointing at (x,z)? returns the dot in [-1,1]
  const lookDot = (x, z) => {
    const cd = camDir();
    let dx = x - player.pos.x, dz = z - player.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    return (cd.x * dx + cd.z * dz) / l;
  };
  // stereo pan for a world point, from the player's facing
  const panFor = (x, z) => {
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    let dx = x - player.pos.x, dz = z - player.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    return clamp((rx * dx + rz * dz) / l, -1, 1);
  };
  const inside = () => buildings.insideHouse(player.pos.x, player.pos.z);
  const groundAt = (x, z) => world.groundHeight(x, z);

  // billboard the silhouette to face the camera on the Y axis (keeps it a wide
  // shape from any approach angle; window figures skip this and stay wall-flat)
  const faceCamera = (mesh) => {
    mesh.rotation.y = Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z);
  };

  // ---------------------------------------------------------------- library
  // Each vignette: feasible(), start() → true if it actually began, update(dt) →
  // true while running / false when finished (scheduler then cleans up).

  // 1) a dark figure at a lit front window, ~1.5 s, then gone.
  const windowFigure = {
    name: 'window',
    feasible() {
      if (!buildings.isPowered() || inside()) return false;
      const d = dist2(HX, HZ);
      if (d < 7 || d > 50) return false;
      if (player.pos.z < HZ + 5) return false;                // must be south of the front
      const cd = camDir();
      let dx = HX - player.pos.x, dz = HZ - player.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      return (cd.x * dx + cd.z * dz) / l > 0.1;                // house roughly in view
    },
    start() {
      // pick the front window most toward the player's gaze
      let bx = FRONT_WIN_X[0], best = -2;
      for (const wx of FRONT_WIN_X) {
        const ld = lookDot(HX + wx, FRONT_WIN_Z);
        if (ld > best) { best = ld; bx = wx; }
      }
      sil.position.set(HX + bx, groundAt(HX + bx, FIGURE_Z), FIGURE_Z);  // in front of the wall face
      sil.rotation.y = 0;                                      // wall-flat, facing the player
      sil.scale.set(0.95, 0.95, 0.95);
      sil.visible = true; silMat.opacity = 0;
      this.t = 0;
      return true;
    },
    update(dt) {
      this.t += dt;
      // fade in 0.25, hold, fade out 0.35 → ~1.7 s total
      silMat.opacity = this.t < 0.25 ? this.t / 0.25 : clamp((1.45 - this.t) / 0.35, 0, 0.9) * 0.9;
      if (this.t > 1.5) { sil.visible = false; return false; }
      return true;
    },
  };

  // 2) a figure at the far end of the jetty — only there while you are NOT
  // looking at it; gone the instant you look directly at it.
  const dockFigure = {
    name: 'dock',
    feasible() {
      if (inside()) return false;
      const d = dist2(DOCK_END.x, DOCK_END.z);
      if (d < 10 || d > 46) return false;
      if (player.pos.z > 77.5) return false;                  // player is past the end already
      return lookDot(DOCK_END.x, DOCK_END.z) < 0.55;          // appear off to the side
    },
    start() {
      sil.position.set(DOCK_END.x, groundAt(DOCK_END.x, DOCK_END.z), DOCK_END.z);
      sil.scale.set(1, 1.02, 1);
      faceCamera(sil);
      sil.visible = true; silMat.opacity = 0;
      this.t = 0;
      return true;
    },
    update(dt) {
      this.t += dt;
      if (lookDot(DOCK_END.x, DOCK_END.z) > 0.8) {            // caught looking → vanish now
        sil.visible = false; silMat.opacity = 0; return false;
      }
      faceCamera(sil);
      silMat.opacity = this.t < 0.35 ? (this.t / 0.35) * 0.95 : (this.t > 5.3 ? clamp((5.7 - this.t) / 0.4, 0, 0.95) : 0.95);
      if (this.t > 5.7) { sil.visible = false; return false; }
      return true;
    },
  };

  // 3) a shape at the treeline, mid-distance, briefly.
  const treeFigure = {
    name: 'treeline',
    feasible() { return !inside(); },
    start() {
      // mid-distance, roughly ahead of the player, on real ground (not water)
      let px = 0, pz = 0, ok = false;
      for (let tries = 0; tries < 5 && !ok; tries++) {
        const a = player.yaw + (Math.random() - 0.5) * 0.8;
        const d = 17 + Math.random() * 9;
        px = player.pos.x - Math.sin(a) * d;
        pz = player.pos.z - Math.cos(a) * d;
        if (groundAt(px, pz) > 0.35 && px > LAYOUT.bounds.minX + 4 && px < LAYOUT.bounds.maxX - 4) ok = true;
      }
      if (!ok) return false;
      sil.position.set(px, groundAt(px, pz), pz);
      sil.scale.set(1, 1, 1);
      faceCamera(sil);
      sil.visible = true; silMat.opacity = 0;
      this.t = 0;
      return true;
    },
    update(dt) {
      this.t += dt;
      silMat.opacity = this.t < 0.35 ? (this.t / 0.35) * 0.9 : clamp((1.75 - this.t) / 0.4, 0, 0.9);
      if (this.t > 1.75) { sil.visible = false; return false; }
      return true;
    },
  };

  // 4) a distant scream across the water + the campfire flares up.
  const screamFlare = {
    name: 'scream',
    feasible() { return !inside(); },
    start() {
      audio.scream?.(panFor(0, LAYOUT.shoreZ + 40), undefined);   // out on the lake, to the south
      if (Math.random() < 0.22)
        ui.say('ANA', 'Something screamed. Out on the water. It stopped like it was cut off.', 3.6);
      this.t = 0;
      return true;
    },
    update(dt) {
      this.t += dt;
      // add a decaying bump ON TOP of npcs.update's flicker (we run after it)
      const k = clamp(1 - this.t / 1.0, 0, 1);
      if (npcs.campfire?.light) npcs.campfire.light.intensity += 5.5 * k * k;
      return this.t < 1.1;
    },
  };

  // 5) wet footprints fade in on the jetty deck, then out.
  const footprints = {
    name: 'footprints',
    feasible() {
      if (inside()) return false;
      return Math.abs(player.pos.x) < 8 && player.pos.z > 48 && player.pos.z < 84;
    },
    start() {
      footGroup.visible = true; footMat.opacity = 0;
      audio.drip?.(panFor(0, 70));
      this.t = 0;
      return true;
    },
    update(dt) {
      this.t += dt;
      // in 0.6, hold, out 1.2 → ~4.3 s
      footMat.opacity = this.t < 0.6 ? (this.t / 0.6) * 0.7 : clamp((4.3 - this.t) / 1.2, 0, 0.7);
      if (this.t > 4.3) { footGroup.visible = false; return false; }
      return true;
    },
  };

  // 6) three piano notes drift from the house when you're outside and away.
  const farPiano = {
    name: 'piano',
    feasible() { return !inside() && dist2(HX, HZ) > 16; },
    start() {
      this.t = 0; this.notes = 0;
      this.nextAt = 0;
      this.talk = Math.random() < 0.28;
      return true;
    },
    update(dt) {
      this.t += dt;
      if (this.notes < 3 && this.t >= this.nextAt) {
        audio.pianoPlink?.();
        this.notes++;
        this.nextAt = this.t + 0.72 + Math.random() * 0.28;
        if (this.notes === 3 && this.talk)
          ui.say('', '(a piano, in the house — three notes, then nothing)', 3.6);
      }
      return this.t < 3.0;                                    // let the last note ring out
    },
  };

  const library = [windowFigure, dockFigure, treeFigure, screamFlare, footprints, farPiano];

  // ---------------------------------------------------------------- scheduler
  let active = null;
  let cooldown = 18;            // a calm opening — nothing fires for the first stretch
  let lastName = '';

  function tideNow() { return clamp(night?.tide ?? 0, 0, 1); }

  // is the world quiet enough to intrude? never over a real threat moment.
  function engaged() {
    if (director?.chasingCount && director.chasingCount() > 0) return false;
    if (director?.nearestDist && director.nearestDist() < 15) return false;
    return true;
  }

  function fire() {
    const tide = tideNow();
    const pool = library.filter((v) => v.feasible());
    if (!pool.length) return false;
    // avoid repeating the same one back-to-back when there's an alternative
    let choices = pool.length > 1 ? pool.filter((v) => v.name !== lastName) : pool;
    if (!choices.length) choices = pool;
    const pick = choices[(Math.random() * choices.length) | 0];
    if (!pick.start()) return false;
    active = pick; lastName = pick.name;
    // next gap: 24..48 s, tightened at high tide, loosened in the lulls
    cooldown = (26 + Math.random() * 22) * (1.2 - 0.6 * tide);
    return true;
  }

  return {
    // called only during live PLAY (main.js gates it), after npcs.update so the
    // fire-flare can stack on the campfire's own flicker.
    update(dt) {
      if (active) {
        let alive = false;
        try { alive = active.update(dt); } catch (e) { alive = false; }
        if (!alive) { active = null; }
        return;
      }
      if (!engaged()) { cooldown = Math.max(cooldown, 6); return; }
      cooldown -= dt;
      if (cooldown > 0) return;
      // once the gap has elapsed, roll each second — likelier at high tide
      const chance = 0.10 + 0.45 * tideNow();
      if (Math.random() < chance * dt) fire();
    },
    // debug: force a named vignette (or a random feasible one) from the console
    force(name) {
      if (active) { try { active.update(999); } catch (e) { /* end it */ } active = null; }
      sil.visible = false; footGroup.visible = false;
      const v = name ? library.find((x) => x.name === name) : null;
      if (v) { if (v.start()) { active = v; lastName = v.name; } return v ? v.name : null; }
      return fire() ? lastName : null;
    },
    get activeName() { return active?.name ?? null; },
  };
}
