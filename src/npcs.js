import * as THREE from 'three';
import { LAYOUT } from './config.js';
import { canvasTexture, groundHeight } from './world.js';
import { spawn } from './assets.js';
import { buildRufino } from './npc/rufino.js';
import { buildMara, buildMaraWalker, poseMaraWalk } from './npc/mara.js';
import { buildEliseo } from './npc/eliseo.js';
import { preloadNpcTextures, npcTextures, std } from './npc/shared.js';
import { woodMat } from './npc/materials.js';
import { campStone } from './npc/textures.js';

// Re-exports so existing import sites elsewhere keep working unchanged:
// - main.js imports { buildNPCs, preloadNpcTextures }
// - mansion.js imports { buildCellarGirl }
export { buildCellarGirl } from './npc/girl.js';
export { preloadNpcTextures, npcTextures };

// The living (and the probably-living). Bodies are sculpted as one continuous
// signed-distance mass — limbs, torso and draped cloth smooth-blended and
// polygonized by marching cubes, then Taubin-smoothed and noise-folded — so a
// person reads as grown, not assembled from capsules. Faces stay in
// hat-shadow; firelight and posture do the acting.

// Overheard "barks" — short, state-reactive lines a living NPC says when the
// player passes after the world has changed (power on, fog running high, a
// Returned nearby). NOT dialogue trees: single subtitles in each character's
// established voice. English only, serious register. Kept module-scope so
// selecting one allocates nothing per frame.
const BARKS = {
  rufino: {
    power: ['You lit the house. Now everything on the water knows where you are. …Stay near the fire when you can.'],
    enemy: ['Something came up off the beach. Don’t run for the dark — run for the light.',
      'Keep the fire between you and the water. It doesn’t like being seen clearly.'],
    tide: ['Fog’s up thick tonight. The lake is remembering loud. Keep your name to yourself.',
      'Night like this, the water gets greedy. Warm your hands while they’re still yours.'],
  },
  mara: {
    enemy: ['It’s here. Right there. Don’t move fast — fast is what they follow.',
      'That’s not the wind. Don’t look at it too long. Looking is remembering.'],
    tide: ['The fog’s getting thicker. It comes up off the water. Eight days I’ve watched it do this.',
      'It’s louder tonight — the lake. Can’t you hear how much it’s remembering?'],
  },
  eliseo: {
    tide: ['The lake is loud tonight, señorita. It is calling names down by the water. Do not answer, even in your own head.',
      'Hear it? The water, remembering out loud. On nights like this the dead come closest to the shore.'],
    enemy: ['One of hers is walking. Keep the little camera up. And do not say its name — a name is how they find the way in.'],
    linger: ['The old arrayán has held the ones who could not rest since ’44. She holds them still. It is the kindest work there is.',
      'The dead do not answer, and that is a mercy. It is the ones who answer back you must fear.'],
  },
};

let flameTexCache = null;
function flameTex() {
  if (!flameTexCache) {
    flameTexCache = canvasTexture((c, W, H) => {
      const g = c.createRadialGradient(W / 2, H * 0.72, 2, W / 2, H * 0.6, W * 0.5);
      g.addColorStop(0, 'rgba(255,225,150,.95)');
      g.addColorStop(0.35, 'rgba(255,150,60,.55)');
      g.addColorStop(0.75, 'rgba(200,70,20,.16)');
      g.addColorStop(1, 'rgba(120,40,10,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(W / 2, H * 0.62, W * 0.34, H * 0.44, 0, 0, 7); c.fill();
    }, 64, 96);
  }
  return flameTexCache;
}

// ================================================================ buildNPCs
export function buildNPCs(scene, colliders) {
  const list = [];

  // ---------- Rufino's camp: east beach
  const CAMP = LAYOUT.camp;
  const campY = groundHeight(CAMP.x, CAMP.z);
  const camp = new THREE.Group();
  camp.position.set(CAMP.x, campY, CAMP.z);
  scene.add(camp);
  // stone ring + logs. Dark, matte, roughness-mapped, low specular so the
  // 115-intensity torch + fire don't blow the ring to a white slab (the old
  // "overexposed campfire" look). Detail is in the normal/rough maps.
  const cs = campStone();
  const stoneMat = new THREE.MeshPhysicalMaterial({
    color: 0x33352f, roughness: 1.0, metalness: 0, specularIntensity: 0.08,
  });
  if (cs.map) stoneMat.map = cs.map;
  if (cs.normal) stoneMat.normalMap = cs.normal;
  if (cs.rough) stoneMat.roughnessMap = cs.rough;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11 + Math.random() * 0.05, 1), stoneMat);
    st.position.set(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5);
    st.castShadow = true;
    camp.add(st);
  }
  const logMat = woodMat();            // dark worn wood, matte, torch-proof
  for (const [rx, rz, ry] of [[0.1, 0, 0.4], [-0.08, 0.06, -0.7]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 7), logMat);
    log.position.set(rx, 0.12, rz);
    log.rotation.set(Math.PI / 2 + 0.2, ry, 0);
    camp.add(log);
  }
  // seat logs
  const seatLog = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 8), logMat);
  seatLog.rotation.z = Math.PI / 2;
  seatLog.position.set(0, 0.16, 1.35);
  seatLog.castShadow = true;
  camp.add(seatLog);
  const seatLog2 = seatLog.clone();
  seatLog2.position.set(-1.5, 0.16, -0.3);
  seatLog2.rotation.y = Math.PI / 2.3;
  camp.add(seatLog2);
  colliders.addCircle(CAMP.x, CAMP.z, 0.55);
  colliders.addCircle(CAMP.x, CAMP.z + 1.35, 0.4);
  // flames
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75),
      new THREE.MeshBasicMaterial({
        map: flameTex(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
    f.position.set(0, 0.42, 0);
    f.rotation.y = (i / 3) * Math.PI;
    camp.add(f);
    flames.push(f);
  }
  const fireLight = new THREE.PointLight(0xff9a4a, 2.2, 11, 2.0);
  fireLight.position.set(CAMP.x, campY + 0.7, CAMP.z);
  scene.add(fireLight);
  // smoke
  const smokeMat = new THREE.SpriteMaterial({
    map: flameTex(), color: 0x333336, transparent: true, opacity: 0.16, depthWrite: false,
  });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.scale.set(1.4, 2.2, 1);
  smoke.position.set(CAMP.x, campY + 1.9, CAMP.z);
  scene.add(smoke);

  // Rufino sits on the west log, in profile to anyone coming up from the dock
  const rufino = buildRufino();
  const rufX = CAMP.x - 1.5, rufZ = CAMP.z - 0.3;
  // anchor to the seat-log top (a child of camp at campY), so he rests ON it
  rufino.group.position.set(rufX, campY + 0.08, rufZ);
  rufino.group.rotation.y = Math.PI / 2 + 0.2;   // facing the fire (east)
  scene.add(rufino.group);
  colliders.addCircle(rufX, rufZ, 0.35);
  list.push({ id: 'rufino', name: 'RUFINO', x: rufX, z: rufZ, rig: rufino });

  // ---------- Mara: hiding in the greenhouse, east end
  const MARA = { x: 37.0, z: -26.6 };
  const maraY = groundHeight(MARA.x, MARA.z);
  const mara = buildMara();                        // the seated huddle (greenhouse)
  mara.group.position.set(MARA.x, maraY, MARA.z);
  mara.group.rotation.y = -Math.PI / 2 - 0.3;      // back to the east glass, facing in
  scene.add(mara.group);
  // the standing/walking body — built HERE (before warmUpRenderer, so its shaders
  // compile behind the title) and kept hidden until she stands up to travel.
  const maraWalker = buildMaraWalker();
  maraWalker.group.visible = false;
  scene.add(maraWalker.group);
  // her static obstacle circle while she's huddled in the greenhouse; disabled
  // the moment she stands to walk (she's no longer a fixed prop).
  const maraCircle = colliders.addCircle(MARA.x, MARA.z, 0.35);

  const WALK_SPEED = 1.6;             // m/s — a brisk, purposeful pace (keeps the escort short)
  const PHASE_PER_M = 4.4;            // gait radians advanced per metre travelled (cadence scales with speed)
  const maraNpc = {
    id: 'mara', name: 'MARA VIDAL', x: MARA.x, z: MARA.z, rig: mara, walker: maraWalker,
    _seated: true, _walking: false, _paused: false, _route: null, _wp: 0, _phase: 0, _amp: 0,
    _onArrive: null, _onWaypoint: null, _settle: 'standing', _finalYaw: null,
    get walking() { return this._walking; },
    // hold her in place mid-route (something has her) / let her carry on
    pauseWalk() { this._paused = true; },
    resumeWalk() { this._paused = false; },
    _activeGroup() { return this._seated ? mara.group : maraWalker.group; },
    // swap the visible rig, carrying pose/place across (stand up / sit down)
    _showWalker() {
      if (!this._seated) return;
      maraWalker.group.position.copy(mara.group.position);
      maraWalker.group.rotation.y = mara.group.rotation.y;
      maraWalker.group.visible = true; mara.group.visible = false;
      this._seated = false;
    },
    _showSeated() {
      if (this._seated) return;
      mara.group.position.copy(maraWalker.group.position);
      mara.group.rotation.y = maraWalker.group.rotation.y;
      mara.group.visible = true; maraWalker.group.visible = false;
      this._seated = true;
    },
    relocate(x, z, yaw) {
      this.x = x; this.z = z;
      const grp = this._activeGroup();
      grp.position.set(x, groundHeight(x, z), z);
      grp.rotation.y = yaw;
    },
    // Stand up and walk an authored waypoint route. opts:
    //   settle:'seated'|'standing' — the pose she lands in; finalYaw — heading on
    //   arrival; onArrive(npc); onWaypoint(i) — fired as each waypoint is reached
    //   (the story arms the ambush off this).
    walkTo(route, opts = {}) {
      if (!route || !route.length) return;
      this._route = route; this._wp = 0; this._walking = true; this._phase = 0; this._amp = 0; this._stuckT = 0;
      this._settle = opts.settle || 'standing';
      this._finalYaw = opts.finalYaw ?? null;
      this._onArrive = opts.onArrive || null;
      this._onWaypoint = opts.onWaypoint || null;
      maraCircle.enabled = false;      // she's walking now, not a fixed obstacle
      this._showWalker();
    },
    // taken by the lake — remove her from the world entirely
    hide() { mara.group.visible = false; maraWalker.group.visible = false; this._walking = false; },
    _arrive() {
      this._walking = false; this._amp = 0;
      poseMaraWalk(maraWalker.bones, 0, 0);
      if (this._settle === 'seated') this._showSeated();
      if (this._finalYaw != null) this._activeGroup().rotation.y = this._finalYaw;
      const cb = this._onArrive; this._onArrive = null; this._onWaypoint = null;
      if (cb) cb(this);
    },
  };
  list.push(maraNpc);

  // ---------- Eliseo + the old arrayán with the wire
  const TREE = { x: 19.5, z: -11.5 };
  const treeY = groundHeight(TREE.x, TREE.z);
  const old = new THREE.Group();
  old.position.set(TREE.x, treeY - 0.15, TREE.z);
  scene.add(old);
  // arrayán bark: reddish, but MeshPhysical with low specular so the 115-torch
  // doesn't glaze the smooth trunk to a bright orange blob beside Eliseo.
  const barkMat = new THREE.MeshPhysicalMaterial({ color: 0x854a2b, roughness: 0.92, metalness: 0, specularIntensity: 0.1 });
  let tx = 0, tz = 0, ty = 0, tiltA = 0.5;
  for (let i = 0; i < 4; i++) {
    const len = 1.6 - i * 0.2;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * (1 - i * 0.18) + 0.05, 0.4 * (1 - i * 0.18) + 0.05, len, 9), barkMat);
    const e = new THREE.Euler(Math.sin(tiltA) * 0.16, 0, Math.cos(tiltA) * 0.16);
    seg.position.set(tx, ty + len / 2, tz);
    seg.rotation.copy(e);
    seg.castShadow = true;
    old.add(seg);
    const tip = new THREE.Vector3(0, len, 0).applyEuler(e);
    tx += tip.x; ty += tip.y; tz += tip.z;
    tiltA += 0.9;
  }
  // canopy of dark lobes
  const lobeMat = std(0x22362a, 0.95);
  for (let i = 0; i < 6; i++) {
    const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.6, 1), lobeMat);
    lobe.position.set(tx + (Math.random() - 0.5) * 2.4, ty + 0.8 + Math.random() * 1.2, tz + (Math.random() - 0.5) * 2.4);
    lobe.castShadow = true;
    old.add(lobe);
  }
  colliders.addCircle(TREE.x, TREE.z, 0.55);
  // the wire: a garrote of fence wire + stake
  const wireGroup = new THREE.Group();
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x777a70, roughness: 0.35, metalness: 0.85 });
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 20), wireMat);
  loop.rotation.x = Math.PI / 2 - 0.1;
  loop.position.y = 1.25;
  const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.7, 5), wireMat);
  strand.position.set(0.8, 0.75, 0.3);
  strand.rotation.z = 0.95;
  const stake = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), std(0x4a4034, 0.9));
  stake.position.set(1.5, 0.2, 0.55);
  wireGroup.add(loop, strand, stake);
  old.add(wireGroup);

  const eliseo = buildEliseo();
  eliseo.group.position.set(TREE.x - 1.9, groundHeight(TREE.x - 1.9, TREE.z - 1.2), TREE.z - 1.2);
  eliseo.group.rotation.y = 0.7;
  scene.add(eliseo.group);
  colliders.addCircle(TREE.x - 1.9, TREE.z - 1.2, 0.35);
  list.push({ id: 'eliseo', name: 'DON ELISEO', x: TREE.x - 1.9, z: TREE.z - 1.2, rig: eliseo });
  // his lantern, hung on the low branch
  const lanternModel = spawn('Lantern_01', { x: TREE.x - 1.1, y: treeY + 1.92, z: TREE.z - 0.7, s: 0.5 });
  scene.add(lanternModel);
  const lanternGlow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc478 }));
  lanternGlow.position.set(TREE.x - 1.1, treeY + 2.1, TREE.z - 0.7);
  scene.add(lanternGlow);
  const lanternLight = new THREE.PointLight(0xffb46b, 2.4, 9, 1.8);
  lanternLight.position.copy(lanternGlow.position);
  scene.add(lanternLight);

  // ------------------------------------------------------------------- api
  let t0 = 0;

  // ---- state-reactive bark bookkeeping (see reactBarks) ----
  const barkCD = { rufino: 14, mara: 16, eliseo: 18 };   // per-NPC cooldown timers (s), staggered
  const barkFlip = { rufino: 0, mara: 0, eliseo: 0 };    // rotate through line variants
  let prevPowered = false;   // edge-detect the generator
  let armPowered = false;    // latched "you lit the house" until Rufino remarks on it
  let highTide = false;      // sustained "the fog is running high" (hysteresis)
  const pickBark = (id, key) => {
    const arr = BARKS[id][key];
    const line = arr[barkFlip[id] % arr.length];
    barkFlip[id] += 1;
    return line;
  };

  return {
    list,
    campfire: { x: CAMP.x, z: CAMP.z, light: fireLight },
    wireTree: {
      x: TREE.x, z: TREE.z, y: treeY + 1.25,
      removed: false,
      removeWire() { this.removed = true; wireGroup.visible = false; },
    },
    byId(id) { return list.find((n) => n.id === id); },
    update(dt, time, playerPos) {
      t0 = time;
      // fire flicker
      fireLight.intensity = 1.75 + Math.sin(time * 11) * 0.35 + Math.sin(time * 23.7) * 0.22;
      for (const [i, f] of flames.entries()) {
        f.scale.y = 1 + Math.sin(time * 9 + i * 2.1) * 0.18;
        f.scale.x = 1 + Math.sin(time * 7.3 + i) * 0.1;
        f.rotation.y += dt * 0.6;
      }
      smoke.position.y = groundHeight(CAMP.x, CAMP.z) + 1.9 + Math.sin(time * 0.5) * 0.2;
      smoke.material.opacity = 0.1 + Math.abs(Math.sin(time * 0.23)) * 0.08;

      // Rufino: he keeps the fire the way his fathers did. Slow breathing, an
      // occasional deep bow to sip the mate, a warming lean into the flames,
      // and a periodic slow watch of the water — the vigil of a man who has
      // kept this fire his whole life. (group + head transforms only)
      const r = rufino;
      r.group.scale.y = 1 + Math.sin(time * 1.1) * 0.008;                    // breath
      const sip = Math.max(0, Math.sin(time * 0.19 + 1.1) - 0.9) * 6;         // occasional deep bow to the mate
      const warm = (Math.sin(time * 0.11) * 0.5 + 0.5) * 0.06;               // slow lean into the warmth
      r.head.rotation.x = -0.12 + sip * 0.17 + warm;
      r.group.position.x = rufX + warm * 0.7;                                // ease the body a touch toward the fire (+x/east)
      // glance toward the water (+z, the lake) then back to the fire, ~every 70 s
      const wantWater = Math.sin(time * 0.09 + 2.0) > 0.8 ? -0.8 : 0;
      r.head.rotation.y += (wantWater - r.head.rotation.y) * Math.min(1, dt * 1.5);

      // Mara: three modes — WALKING a route, HUDDLED in the greenhouse, or
      // STANDING idle where a walk left her (e.g. by the boat).
      const mNpc = list.find((n) => n.id === 'mara');
      if (mNpc._walking && mNpc._paused) {
        // ---- held in place, terrified, while something has her: no travel,
        // a fast panicked breath, face wrenched back toward the threat/player
        poseMaraWalk(maraWalker.bones, 0, 0);
        maraWalker.group.scale.y = 1 + Math.abs(Math.sin(time * 6)) * 0.025;
        const look = Math.max(-0.7, Math.min(0.7,
          Math.atan2(playerPos.x - mNpc.x, playerPos.z - mNpc.z) - maraWalker.group.rotation.y));
        maraWalker.head.rotation.y += (look - maraWalker.head.rotation.y) * Math.min(1, dt * 5);
      } else if (mNpc._walking) {
        // ---- travel the authored waypoint route, striding, facing her heading
        const route = mNpc._route;
        const tgt = route[mNpc._wp];
        let dx = tgt.x - mNpc.x, dz = tgt.z - mNpc.z;
        const d = Math.hypot(dx, dz) || 1e-6;
        const step = WALK_SPEED * dt;
        if (d <= Math.max(step, 0.5)) {
          mNpc.x = tgt.x; mNpc.z = tgt.z;
          maraWalker.group.position.set(mNpc.x, groundHeight(mNpc.x, mNpc.z), mNpc.z);
          const reached = mNpc._wp;
          mNpc._wp++;
          if (mNpc._onWaypoint) mNpc._onWaypoint(reached);
          if (mNpc._wp >= route.length) mNpc._arrive();
        } else {
          dx /= d; dz /= d;
          // step, then push out of walls/props so she can't clip through them
          const px = mNpc.x, pz = mNpc.z;
          const solved = colliders.resolve(px + dx * step, pz + dz * step, 0.32);
          mNpc.x = solved.x; mNpc.z = solved.z;
          // if a wall blocks her for a beat, skip to the next waypoint so she
          // never stalls forever (authored routes are clear; this is a safety)
          if (Math.hypot(mNpc.x - px, mNpc.z - pz) < step * 0.35) mNpc._stuckT += dt;
          else mNpc._stuckT = 0;
          if (mNpc._stuckT > 1.2) {
            mNpc._stuckT = 0;
            const reached = mNpc._wp; mNpc._wp++;
            if (mNpc._onWaypoint) mNpc._onWaypoint(reached);
            if (mNpc._wp >= route.length) { mNpc._arrive(); return; }
          }
          maraWalker.group.position.set(mNpc.x, groundHeight(mNpc.x, mNpc.z), mNpc.z);
          // +z is forward, so the heading that points down the travel dir is atan2(dx,dz)
          const wantYaw = Math.atan2(dx, dz);
          const cur = maraWalker.group.rotation.y;
          const dy = Math.atan2(Math.sin(wantYaw - cur), Math.cos(wantYaw - cur));
          maraWalker.group.rotation.y = cur + dy * Math.min(1, dt * 4);
          mNpc._phase += step * PHASE_PER_M;
          mNpc._amp += (1 - mNpc._amp) * Math.min(1, dt * 3);
          poseMaraWalk(maraWalker.bones, mNpc._phase, mNpc._amp);
          maraWalker.group.scale.y = 1 + Math.sin(time * 1.1) * 0.006;
          // she keeps a nervous half-glance toward you as she moves
          const look = Math.max(-0.6, Math.min(0.6,
            Math.atan2(playerPos.x - mNpc.x, playerPos.z - mNpc.z) - maraWalker.group.rotation.y));
          maraWalker.head.rotation.y += (look * 0.5 - maraWalker.head.rotation.y) * Math.min(1, dt * 2);
        }
      } else if (mNpc._seated) {
        // ---- greenhouse huddle: eight days without sleep. Lifts her head when
        // you're close; the rest is nerves — a brittle sway and an over-the-
        // shoulder check toward the dark that keeps breaking her stillness.
        const m = mara;
        const dm = Math.hypot(playerPos.x - mNpc.x, playerPos.z - mNpc.z);
        const headUp = dm < 3.4 ? 0.08 : 0.7;
        m.head.rotation.x += (headUp - m.head.rotation.x) * Math.min(1, dt * 2.5);
        m.group.rotation.z = Math.sin(time * 1.7) * 0.010 + Math.sin(time * 0.83 + 1.3) * 0.006;
        const chk = (time * 0.09 + 0.2) % 1;
        const startle = chk < 0.09 ? Math.sin((chk / 0.09) * Math.PI) : 0;    // 0→1→0 pulse
        m.head.rotation.y += (startle * 0.85 - m.head.rotation.y) * Math.min(1, dt * 7);
      } else {
        // ---- standing idle where the walk left her (e.g. at the boathouse)
        poseMaraWalk(maraWalker.bones, 0, 0);
        maraWalker.group.scale.y = 1 + Math.sin(time * 1.1) * 0.007;          // breath
        const dm = Math.hypot(playerPos.x - mNpc.x, playerPos.z - mNpc.z);
        const look = dm < 6 ? Math.max(-0.6, Math.min(0.6,
          Math.atan2(playerPos.x - mNpc.x, playerPos.z - mNpc.z) - maraWalker.group.rotation.y)) : 0;
        maraWalker.head.rotation.y += (look - maraWalker.head.rotation.y) * Math.min(1, dt * 1.8);
        maraWalker.head.rotation.x += (0.05 - maraWalker.head.rotation.x) * Math.min(1, dt * 1.5);
      }

      // Eliseo: absorbed in the soil. He turns his head to you when near, but
      // otherwise rocks slowly over his work, head down, with an occasional
      // slow glance up at the old arrayán.
      const e = eliseo;
      const eNpc = list.find((n) => n.id === 'eliseo');
      const de = Math.hypot(playerPos.x - eNpc.x, playerPos.z - eNpc.z);
      if (de < 7) {
        const yaw = Math.atan2(playerPos.x - eNpc.x, playerPos.z - eNpc.z) - e.group.rotation.y;
        const cl = Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(yaw), Math.cos(yaw))));
        e.head.rotation.y += (cl - e.head.rotation.y) * Math.min(1, dt * 1.6);
      } else {
        e.head.rotation.y *= 1 - Math.min(1, dt * 1.5);
      }
      e.group.scale.y = 1 + Math.sin(time * 0.9) * 0.006;                     // breath
      e.group.rotation.z = Math.sin(time * 0.62 + 0.4) * 0.02;                // slow working rock
      // head pitch: down at the soil, an occasional glance up at the tree, or
      // level to meet your eyes when you're right beside him
      const glanceUp = Math.sin(time * 0.05 + 1.7) > 0.85;
      const wantPitch = de < 4.5 ? 0.04 : (glanceUp ? -0.03 : 0.30);
      e.head.rotation.x += (wantPitch - e.head.rotation.x) * Math.min(1, dt * 1.2);
    },
    // facial mimic — runs EVERY frame (even while a dialog is open and the sim
    // is paused): everyone blinks, and whoever's line is being typed talks
    driveFaces(time, dialog) {
      let talkId = null;
      if (dialog && dialog.open && dialog._typing) {
        const who = dialog.node && dialog.node.who;
        if (who === 'RUFINO') talkId = 'rufino';
        else if (who === 'MARA VIDAL') talkId = 'mara';
        else if (who === 'DON ELISEO') talkId = 'eliseo';
      }
      // Mara's talking head is whichever rig is currently shown (huddle vs walker)
      const maraRig = maraNpc._seated ? mara : maraWalker;
      for (const [rig, id] of [[rufino, 'rufino'], [maraRig, 'mara'], [eliseo, 'eliseo']]) {
        const sf = rig.head.userData.setFace;
        if (!sf) continue;
        const off = rig.head.userData.blinkOff || 0;
        const blinking = ((time + off) % 4.2) < 0.13;         // a short blink every ~4s
        const talking = id === talkId;
        const mouth = talking && Math.sin(time * 13 + off * 3) > -0.2;
        sf(talking
          ? (blinking ? 'talkBlink' : (mouth ? 'talk' : 'neutral'))
          : (blinking ? 'blink' : 'neutral'));
      }
    },

    // State-reactive barks: short overheard lines when the player passes a
    // (met) NPC after the world has changed — power on, fog running high, a
    // Returned nearby. Call once per PLAY frame from the loop. These COMPLEMENT
    // the dialogue trees and never touch quests/items/evidence. Gated so they
    // never interrupt a dialog, a note, or another line, and per-NPC cooldowns
    // (40–70 s) keep them sparse. ctx: { ui, dt, playerPos, powered, tide,
    // nearestEnemyDist, dialogOpen, met }.
    reactBarks(ctx) {
      const { ui, dt, playerPos } = ctx;

      // edge-detect power → latch "you lit the house" until Rufino remarks
      if (ctx.powered && !prevPowered) armPowered = true;
      prevPowered = !!ctx.powered;
      // sustained high-tide state (hysteresis so it doesn't chatter at the edge)
      if (ctx.tide > 0.5) highTide = true;
      else if (ctx.tide < 0.35) highTide = false;

      // tick cooldowns every frame (proximity is checked below)
      barkCD.rufino -= dt; barkCD.mara -= dt; barkCD.eliseo -= dt;

      // never interrupt a dialog, a note, or another subtitle already on screen
      if (ctx.dialogOpen || ui.noteOpen || ui.subtitleBusy()) return;

      const near = ctx.nearestEnemyDist;
      for (const n of list) {
        if (barkCD[n.id] > 0) continue;
        if (ctx.met && !ctx.met[n.id]) continue;                 // only after you've met them
        if (Math.hypot(playerPos.x - n.x, playerPos.z - n.z) > 6) continue;
        let line = null;
        if (n.id === 'rufino') {
          if (armPowered) { line = pickBark('rufino', 'power'); armPowered = false; }
          else if (near < 12) line = pickBark('rufino', 'enemy');
          else if (highTide) line = pickBark('rufino', 'tide');
        } else if (n.id === 'mara') {
          if (near < 14) line = pickBark('mara', 'enemy');
          else if (highTide) line = pickBark('mara', 'tide');
        } else if (n.id === 'eliseo') {
          if (highTide) line = pickBark('eliseo', 'tide');
          else if (near < 14) line = pickBark('eliseo', 'enemy');
          else line = pickBark('eliseo', 'linger');            // when you simply linger
        }
        if (line) {
          ui.say(n.name, line, 5.6);
          barkCD[n.id] = 40 + Math.random() * 30;               // 40–70 s
          return;                                                // one bark at a time
        }
      }
    },
  };
}
