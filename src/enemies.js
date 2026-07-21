import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { PAL, TUNE, LAYOUT } from './config.js';
import { canvasTexture } from './world.js';
import { buildMonsterRig } from './monstermesh.js';
import { heightToNormalTex } from './npc/pipeline.js';
import { hairClump } from './npc/textures.js';
export { preloadMonsterTextures } from './monstermesh.js';

// The Returned. The lake keeps what it drowns, and days later gives it back —
// rebuilt from the memories of whoever still grieves them, blurry wherever
// memory is. You cannot outrun them. A photograph is a memory that can't
// blur: two flashes, and the copy loses the argument with what it actually is.
//
//   testigo   — THE HALF-SEEN: rebuilt from a single glimpse; mostly posture
//               and wet hair. Being looked at pins it — observation is the
//               only detail it has. It lunges when you can't hold the look.
//   doble     — THE DRAFT: the lake's practice copy of the still-living. It
//               cannot yet do "being watched" — that part of you is
//               unfinished. Off-camera it covers ground on all fours.
//   archivero — THE CONGREGATION: the oldest Returned, remade so many times it
//               is a composite of everyone's dead — a tall, water-smoothed
//               column of fused faces, every mouth open mid-hymn. It sings; it
//               does not chase — it rises, roots, and waits to be seen.

const KINDS = {
  //                                                         fps: stop-motion pose rate (D2: nudged up so the eased pose-blend reads more fluid while a faint step remains)
  //                                                         knock: metres a flash throws it (negative = it arrives CLOSER)
  testigo: { h: 2.75, walk: 1.1, chase: 3.4, sight: 15, sightLit: 27, stagger: 2.6, exposures: 2, fps: 11, knock: 1.7 },
  doble: { h: 1.8, walk: 0, chase: 5.6, sight: 21, sightLit: 21, stagger: 4.2, exposures: 2, fps: 13, knock: -0.9 },
  // F4 · THE CONGREGATION does not chase — it rises, roots, and ATTENDS. h → the
  // real F1 sculpt height (3.0). `chase` is a glacial creep, not a run (~17× slower
  // than a walking Ana at 3.05 m/s) — it can only ever shrink the gap by a hair, and
  // a tether (see chase state) keeps it a landmark. `sight`/`sightLit` are raised so
  // it notices from FAR and turns its column of faces to her (the dread is a distant
  // pillar slowly orienting to you). `walk` is minimal — it barely drifts from where
  // it rose. `stagger` long + `knock` tiny: a rooted mass that flinches slow and hardly
  // budges when flashed. exposures 3 (needs three photos); fps 8 (F3 cadence, untouched).
  archivero: { h: 3.0, walk: 0.22, chase: 0.18, sight: 24, sightLit: 28, stagger: 5.5, exposures: 3, fps: 8, knock: 0.35 },
};

function smearTexture(kind) {
  return canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.42;
    const rx = kind === 'doble' ? 34 : 22, ry = kind === 'doble' ? 26 : 34;
    for (let i = 0; i < 14; i++) {
      const off = (i - 7) * (kind === 'doble' ? 5.5 : 3.2);
      const a = 0.16 * (1 - Math.abs(i - 7) / 8);
      const g = c.createRadialGradient(cx + off, cy, 2, cx + off, cy, Math.max(rx, ry));
      g.addColorStop(0, `rgba(186,180,168,${a * 1.5})`);
      g.addColorStop(0.55, `rgba(140,134,122,${a})`);
      g.addColorStop(1, 'rgba(80,76,70,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(cx + off, cy, rx, ry, 0, 0, 7); c.fill();
    }
    // the face runs: soft vertical streaks bleeding downward
    for (let i = 0; i < 9; i++) {
      const sx = cx + (Math.random() - 0.5) * rx * 1.6;
      const l = 18 + Math.random() * 42;
      const grad = c.createLinearGradient(sx, cy, sx, cy + l);
      grad.addColorStop(0, `rgba(150,146,136,${0.1 + Math.random() * 0.12})`);
      grad.addColorStop(1, 'rgba(150,146,136,0)');
      c.fillStyle = grad;
      c.fillRect(sx - 1, cy, 2 + Math.random() * 2, l);
    }
    // a dark open place where a mouth should be — but the doble is an UNFINISHED
    // copy the lake hasn't given a mouth: its lower face stays blank/unformed,
    // agreeing with the mouthless sculpt.
    if (kind !== 'doble') {
      const g2 = c.createRadialGradient(cx, cy + 6, 1, cx, cy + 6, 17);
      g2.addColorStop(0, 'rgba(5,5,9,.9)'); g2.addColorStop(1, 'rgba(5,5,9,0)');
      c.fillStyle = g2;
      c.beginPath(); c.ellipse(cx, cy + 6, 14, 20, 0, 0, 7); c.fill();
    }
    // eye shadows, uneven — memory keeps the stare, not the eyes
    for (const s of [-1, 1]) {
      const g3 = c.createRadialGradient(cx + s * 12, cy - 8, 1, cx + s * 12, cy - 8, 9);
      g3.addColorStop(0, `rgba(8,8,14,${0.55 + Math.random() * 0.25})`);
      g3.addColorStop(1, 'rgba(8,8,14,0)');
      c.fillStyle = g3;
      c.beginPath(); c.ellipse(cx + s * 12, cy - 8, 8, 6 + Math.random() * 3, 0, 0, 7); c.fill();
    }
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(200,196,186,${Math.random() * 0.09})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 10, 1);
    }
  }, 128, 128);
}

const smearTex = {};

// B5 · a soft ROUND catch-light for the eyes — a radial white dot, transparent
// at the rim — so a flat plane mapped with it reads as a wet glint, not a flat
// glowing rectangle. `sharp` tightens the falloff for the tiny hot CORE (which
// is additively blended and can just tip past the bloom threshold = a wet
// spark); the wide gentle one is the surrounding HALO, also reused (as a soft
// alpha) for the near-black socket recess so its rim fades instead of ending in
// a hard square. Cached + shared (never mutated per-frame → no clone needed).
function glintTexture(sharp) {
  return canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, W / 2);
    if (sharp) {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }, 64, 64);
}
const glintTex = {};   // { core, halo } — built lazily on first buildRig

// -------------------------------------------------------------------- rigs

// push vertices along their normals by a position-hash — smooth shapes turn
// into knotted, grown-wrong flesh
function organic(geo, amp, freq = 7) {
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h =
      Math.sin(x * freq + y * 3.1) * Math.sin(y * freq * 0.83 + 4.2) * Math.sin(z * freq * 1.21 + 1.7) * 0.65 +
      Math.sin((x + y) * freq * 2.3) * Math.sin(z * freq * 1.9 + 0.4) * 0.35;
    const k = h * amp;
    p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Drowned-flesh textures, ported from npc/textures.drownedFlesh so each kind
// gets its OWN palette (that one is a single cached singleton). Bases stay
// DARK/greyish — near the material colour — so nothing glows under the 115 cd
// torch; the mottle, bruise pools, vein webs and waterlines ride on top.
// heightToNormalTex (shared with the NPCs) bakes a painted pore/wrinkle height
// field into the per-kind waterlogged normal. All canvas — offline-safe, never
// loads a file that could be missing.

// small seeded PRNG so every kind's texture is stable across rebuilds
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// per-kind palette. doble (The Draft) is a fresh copy of the still-living —
// palest, waxiest, LEAST bruised, finer skin. testigo (The Half-Seen) is long
// drowned — grey-green, the MOST bruise pools / veins / waterlines, eroded
// skin. archivero is older/greyer (a full redesign is pending, so it's kept
// sensible rather than lavish — just not regressed).
const FLESH = {
  doble: {
    // The Draft — a fresh, UNFINISHED copy of the still-living: smooth waxy
    // clay, not skin. Very even tone, barely any mottle, NO bruise pools, NO
    // vein webs (a fresh copy has no decay), barely a waterline. The porcelain
    // translucency lives in the MATERIAL (SSS + soft clearcoat), not in painted
    // decay; the flesh map only carries a faint, unformed tonal breath.
    seed: 21, base: '#1c1e24',
    mottle: 34, mottleA: 0.05, mottleD: 0.07,               // faint, even tone only
    cols: ['96,98,101', '86,87,88', '104,103,98'],          // tight waxy greys, one warm — no bruise/dark
    pools: 0, poolCol: '52,56,64', poolA: 0.08, poolD: 0.10, // no bruise pools
    veins: 0, veinCols: ['46,52,62', '18,20,26'], veinA: 0.15, veinD: 0.18,  // NO vein webs
    waterlines: 1, bands: '48,50,54',                       // barely in and out of the lake
    pores: 70,                                              // few specks — smooth
    nStrength: 0.6, nPores: 1000, nPoreR: 0.7, nWrink: 4, nWrinkW: 0.6,   // very smooth, unformed
  },
  testigo: {
    seed: 13, base: '#11161a',
    mottle: 150, mottleA: 0.16, mottleD: 0.32,
    cols: ['72,82,84', '46,60,54', '58,60,44', '18,20,26'],  // grey / bruise-green / sallow / dark
    pools: 22, poolCol: '50,60,82', poolA: 0.16, poolD: 0.20,
    veins: 44, veinCols: ['44,56,70', '10,12,16'], veinA: 0.22, veinD: 0.30,
    waterlines: 7, bands: '40,50,54',
    pores: 260,
    nStrength: 1.4, nPores: 1600, nPoreR: 1.5, nWrink: 26, nWrinkW: 1.4,   // pore pits + slack wrinkles
  },
  archivero: {
    seed: 31, base: '#141518',
    mottle: 110, mottleA: 0.13, mottleD: 0.26,
    cols: ['66,70,74', '46,50,50', '20,20,24'],
    pools: 12, poolCol: '48,52,60', poolA: 0.11, poolD: 0.15,
    veins: 30, veinCols: ['42,48,58', '12,14,18'], veinA: 0.20, veinD: 0.24,
    waterlines: 4, bands: '42,46,50',
    pores: 240,
    nStrength: 1.2, nPores: 1700, nPoreR: 1.4, nWrink: 20, nWrinkW: 1.2,
  },
};

const fleshTexC = {};
function fleshTex(kind) {
  if (!fleshTexC[kind]) {
    const F = FLESH[kind] ?? FLESH.testigo;
    fleshTexC[kind] = canvasTexture((c, W, H) => {
      const r = rng(F.seed);
      c.fillStyle = F.base; c.fillRect(0, 0, W, H);
      // waterline bands — in and out of the lake many times
      for (let i = 0; i < F.waterlines; i++) {
        const y = r() * H;
        const g = c.createLinearGradient(0, y - 7, 0, y + 7);
        g.addColorStop(0, `rgba(${F.bands},0)`);
        g.addColorStop(0.5, `rgba(${F.bands},${0.12 + r() * 0.14})`);
        g.addColorStop(1, `rgba(${F.bands},0)`);
        c.fillStyle = g; c.fillRect(0, y - 7, W, 14);
      }
      // mottled sick patches: waterlogged pale, bruise-green, sallow, dark
      for (let i = 0; i < F.mottle; i++) {
        const col = F.cols[(r() * F.cols.length) | 0];
        c.fillStyle = `rgba(${col},${F.mottleA + r() * F.mottleD})`;
        c.beginPath();
        c.ellipse(r() * W, r() * H, 3 + r() * 15, 2 + r() * 9, r() * 3, 0, 7);
        c.fill();
      }
      // bluish bruise pools (radial, deeper) — the drowned bruise that won't heal
      for (let i = 0; i < F.pools; i++) {
        const px = r() * W, py = r() * H;
        const g = c.createRadialGradient(px, py, 1, px, py, 10 + r() * 22);
        g.addColorStop(0, `rgba(${F.poolCol},${F.poolA + r() * F.poolD})`);
        g.addColorStop(1, `rgba(${F.poolCol},0)`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      // vein webs
      for (let i = 0; i < F.veins; i++) {
        const col = F.veinCols[r() > 0.5 ? 0 : 1];
        c.strokeStyle = `rgba(${col},${F.veinA + r() * F.veinD})`;
        c.lineWidth = 0.7 + r() * 0.6;
        c.beginPath();
        let x = r() * W, y = r() * H; c.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 26; y += (r() - 0.5) * 26; c.lineTo(x, y); }
        c.stroke();
      }
      // pore speckle
      for (let i = 0; i < F.pores; i++) {
        c.fillStyle = `rgba(${r() > 0.5 ? '78,84,92' : '6,7,10'},${r() * 0.24})`;
        c.fillRect(r() * W, r() * H, 1, 1);
      }
      // doble — no decay to paint; instead lay a whisper of a porcelain wash
      // and a few broad clay-smoothing sweeps (a tool drawn across soft wax) so
      // the hide reads as an even, UNFORMED copy rather than skin. Kept faint +
      // dark so it never glows under the 115 cd torch.
      if (kind === 'doble') {
        c.fillStyle = 'rgba(74,76,80,0.05)';                 // even porcelain lift
        c.fillRect(0, 0, W, H);
        for (let i = 0; i < 6; i++) {                        // soft smoothed clay striations
          const y = r() * H, h = 30 + r() * 60;
          const g = c.createLinearGradient(0, y - h, 0, y + h);
          g.addColorStop(0, 'rgba(98,99,102,0)');
          g.addColorStop(0.5, `rgba(98,99,102,${0.02 + r() * 0.03})`);
          g.addColorStop(1, 'rgba(98,99,102,0)');
          c.fillStyle = g;
          c.save();
          c.translate(W / 2, H / 2); c.rotate((r() - 0.5) * 0.5); c.translate(-W / 2, -H / 2);
          c.fillRect(-W * 0.2, y - h, W * 1.4, h * 2);
          c.restore();
        }
      }
    }, 256, 256);
  }
  return fleshTexC[kind];
}

// per-kind wet-sheen roughness: glossier (darker) damp blotches so the beam
// finds the still-draining zones, drier flecks brighter. DATA → linear (a
// roughness map is not sRGB), matching npc/textures' colour-space discipline.
const roughTexC = {};
function roughTex(kind) {
  if (!roughTexC[kind]) {
    const F = FLESH[kind] ?? FLESH.testigo;
    const sheen = kind === 'doble' ? 26 : kind === 'archivero' ? 68 : 84;  // doble smoothest/most even wax; testigo wettest/most patchy
    const t = canvasTexture((c, W, H) => {
      const r = rng(F.seed + 7);
      c.fillStyle = '#bcbcbc'; c.fillRect(0, 0, W, H);       // damp-skin base
      for (let i = 0; i < sheen; i++) {
        const px = r() * W, py = r() * H;
        const g = c.createRadialGradient(px, py, 1, px, py, 8 + r() * 20);
        g.addColorStop(0, `rgba(38,38,38,${0.3 + r() * 0.42})`);   // wet = glossier = darker
        g.addColorStop(1, 'rgba(38,38,38,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < 300; i++) {   // drier flecks
        c.fillStyle = `rgba(220,220,220,${r() * 0.3})`;
        c.fillRect(r() * W, r() * H, 1, 1);
      }
    }, 128, 128);
    t.colorSpace = THREE.NoColorSpace;
    roughTexC[kind] = t;
  }
  return roughTexC[kind];
}

// per-kind waterlogged-skin normal: pore pits + slack wrinkles baked from a
// painted height field. testigo is the most eroded; the doble is finer/smoother
// (an unfinished copy). heightToNormalTex tags the result linear for us.
const normalTexC = {};
function normalTex(kind) {
  if (!normalTexC[kind]) {
    const F = FLESH[kind] ?? FLESH.testigo;
    normalTexC[kind] = heightToNormalTex((c, W, H) => {
      const r = rng(F.seed + 3);
      c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
      // pores as tiny pits/bumps
      for (let i = 0; i < F.nPores; i++) {
        const v = r() > 0.5 ? 40 + r() * 30 : 170 + r() * 50;
        c.fillStyle = `rgba(${v},${v},${v},${0.28 + r() * 0.38})`;
        c.beginPath(); c.arc(r() * W, r() * H, 0.5 + r() * F.nPoreR, 0, 7); c.fill();
      }
      // slack, waterlogged wrinkles
      for (let i = 0; i < F.nWrink; i++) {
        c.strokeStyle = `rgba(${r() > 0.5 ? '60,60,60' : '175,175,175'},0.5)`;
        c.lineWidth = 0.6 + r() * F.nWrinkW;
        c.beginPath();
        let x = r() * W, y = r() * H; c.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 18; c.lineTo(x, y); }
        c.stroke();
      }
    }, 256, 256, F.nStrength);
  }
  return normalTexC[kind];
}

function capsule(r, len, mat, pivot = 'top', amp = 0.34) {
  const g = new THREE.CapsuleGeometry(r, len, 6, 12);
  g.translate(0, pivot === 'top' ? -len / 2 : len / 2, 0);
  organic(g, r * amp, 6 + Math.random() * 3);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

// -------------------------------------------------- secondary motion (D1)
// Reusable spring-damper for overlap / follow-through: cloth, hair, breath,
// flesh jiggle, crawl bob — anything that should LAG a driven target and then
// OVERSHOOT and settle when the target stops. A driven damped harmonic
// oscillator integrated with SEMI-IMPLICIT (symplectic) Euler — velocity is
// stepped first, then position — which stays stable for stiff springs at the
// loop's fixed dt clamp (dt <= 0.05). Allocation-free: every variant mutates a
// caller-owned state object and news nothing per call.
//
//   k     stiffness  — higher = snappier / pulls to target faster
//   damp  damping    — higher = calmer; UNDERdamped (damp < 2*sqrt(k)) is what
//                      gives the trailing wobble + overshoot we want here
// Defaults: ~1.2 Hz, damping ratio ~0.39 (lightly underdamped).
const SPRING_K = 55, SPRING_DAMP = 5.5;
// D2 · pose-blend layer. Each stop-motion tick still SNAPS a new target pose,
// but instead of hard-holding it, the locomotion limbs EASE (smoothstep) from
// the previous pose toward the new one over BLEND_FRAC of the tick interval,
// then HOLD the remainder — that residual hold is the faint step we keep. 1.0
// would be fully-smooth keyframe interpolation (too lifelike); ~0.62 softens
// the snap while leaving a perceptible cadence. The head-yaw snap and finger
// twitch are NOT routed through this — they stay snappy.
const BLEND_FRAC = 0.62;
// C4 · doble crawl<->stand transition. A flip no longer teleports the pose: a
// sprung progress `t01` (0 = full crawl, 1 = full stand) bridges the two so the
// body reads as a real torso RISING / COLLAPSING through intermediate poses. The
// spring (D1 springScalar, driven toward the 0/1 goal) IS the easing — its
// ease-in / overshoot / settle shape the ramp, so no extra smoothstep is layered
// on t01. UP (rear-up): stiff + lightly underdamped → a fast (~0.15 s to upright)
// startling snap with a slight over-extend that settles back onto the standing
// tell. DOWN (drop): a touch softer + looser → a quick collapse to all fours.
const T01_UP_K = 240, T01_UP_DAMP = 15;   // ω≈15.5, ζ≈0.48 → ~18% overshoot, first-upright ≈0.15 s
const T01_DN_K = 230, T01_DN_DAMP = 17;   // ω≈15.2, ζ≈0.56 → quick collapse, small settle
// scalar linear blend of a crawl-pose channel (c) and a stand-pose channel (s)
// by eased progress e. Module-level so the per-frame pose mix allocates nothing.
const poseLerp = (c, s, e) => c + (s - c) * e;
// scalar variant. state = { x, v }; reads/writes state.x (pos), state.v (vel).
function springScalar(s, target, dt, k = SPRING_K, damp = SPRING_DAMP) {
  s.v += (k * (target - s.x) - damp * s.v) * dt;
  s.x += s.v * dt;
  return s.x;
}
// 3-component variant. pos & vel are THREE.Vector3 (or any {x,y,z}); target is
// {x,y,z}. Each axis is an independent scalar spring sharing k/damp.
function springVec3(pos, vel, target, dt, k = SPRING_K, damp = SPRING_DAMP) {
  vel.x += (k * (target.x - pos.x) - damp * vel.x) * dt;
  vel.y += (k * (target.y - pos.y) - damp * vel.y) * dt;
  vel.z += (k * (target.z - pos.z) - damp * vel.z) * dt;
  pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
  return pos;
}
// scratch reused every frame by the tatter drive — never allocated per call
const _tatTarget = new THREE.Vector3();
// B2 · testigo hair (the P.hairs curtain). Its own spring scratch + tuning, so
// the wet curtain trails/swings and PARTS on a lunge on the smooth per-frame
// layer (poseIndependent), same approach as the tatters. Reused every frame.
const _hairTarget = new THREE.Vector3();
const HAIR_STREAM = 0.5;    // linear speed → curtain trails BACKWARD (rotation.x)
const HAIR_SWING = 0.07;    // angular velocity → sideways swing (rotation.z)
const HAIR_LIFT = 0.8;      // part-on-lunge: front strands swing back off the face
const HAIR_SPREAD = 0.5;    // part-on-lunge: front strands sweep OUTWARD (yaw)

// B5 · eyeshine/socket. `_toMe` is reused every frame for the torch-facing dot
// (no per-frame alloc). SOCKET_DARK is the near-black recess opacity — always
// on (a dark hollow regardless of the beam), only fading on death.
const _toMe = new THREE.Vector3();
const SOCKET_DARK = 0.92;

// Step 6 · AI-path scratch vectors — reused every frame, never allocated per call
// (same pattern as _tatTarget/_hairTarget/_toMe above). SIMULTANEITY AUDIT: within a
// single Rumor.update() call, `_toPlayer` is live for the ENTIRE call (it is read by
// updateDemo() and animate() too), so nothing else ever aliases it. `_move` and
// `_face` can both be live at the same time (wander-threshold, abduct: moveDir + a
// distinct faceDir), so they are separate scratches. `_move2` holds the detour-rotated
// move direction while the pre-detour value (which faceDir may alias in gather) stays
// in `_move`. `_observed` is local to observed() and never overlaps _move/_face/_face2.
const _observed = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _move = new THREE.Vector3();
const _face = new THREE.Vector3();
const _move2 = new THREE.Vector3();
// The chase-move solve is READ (this.pos = solved) only after the stuck-detour
// probe below may call resolve() twice more, so it can't use colliders' shared
// scratch (that probe would clobber it). It gets its own out object instead.
const _solvedMove = { x: 0, z: 0 };

// B4 · testigo finger reach/grasp. A single sprung "grasp" scalar drives every
// finger on the smooth poseIndependent layer, coordinated with the SAME _lunge
// beat as the hair-part (B2) so the lunge reads as one intent: hair back + hands
// clenching at you. Grasp sign: −=splay/open (reach), 0=neutral (idle), +=clench
// (grab). The single-segment worm-fingers articulate at the wrist base on 2 axes
// — rotation.x = curl(+)/extend(−), rotation.z = spread(splay)/converge(clench),
// fanned by each finger's own local x so both hands open/close symmetrically. The
// spring is underdamped, so a lunge clench SNAPS past its target then settles (a
// grab). A per-finger Taylor-delay off the master velocity ripples the close so
// the fingers don't move as one rigid block. Idle twitch rides on top, smaller.
const GRASP_K = 100, GRASP_DAMP = 9;   // damping ratio ~0.45 → snappy, ~20% overshoot
const GRASP_BASE_X = 0.18;   // finger rest pitch (matches buildRig)
const GRASP_CURL_X = 0.85;   // clench: forward/inward bend per unit grasp (rotation.x)
const GRASP_EXT_X = 0.45;    // splay: straighten/extend per unit open (rotation.x)
const GRASP_SPREAD = 0.55;   // splay: outer fingers fan OUTWARD (rotation.z)
const GRASP_CONVERGE = 0.4;  // clench: fingers converge to centre (rotation.z)
const GRASP_REACH = -0.8;    // reach target while chasing (hands opening to take hold)
const GRASP_CLENCH = 1.0;    // lunge target (the grab)
const GRASP_PIN = 0.42;      // pinned: held half-curl (+ a faster tremor, scaled by _pin)

// F3 · the Drowned Choir-Column's PERISTALTIC SWELL. A travelling bulge climbs
// the vertical bone chain (hips→spine→seg1→seg2→neck→head): each segment's
// RADIAL scale (x/z) pulses ±SWELL_RADIAL around 1 with a per-segment phase LAG
// (SEG_LAG) so the bulge visibly migrates UP the column, and a positive-biased
// vertical stretch (SWELL_Y at the crest) stretches that segment's skinned faces
// — so the carved singing mouths GAPE open in sequence as the bulge passes (a
// "Mexican wave" of singing mouths). Amplitudes are modest so the fused surface
// stays coherent (no ballooning / no pinching shut). The phase advances with
// time and a touch faster with movement (it heaves as it glides). A gentle
// sea-organ lateral undulation (SWAY) and a sprung whole-column LEAN toward the
// player ride on top. All state is per-instance (lazy) → no per-frame alloc.
const SWELL_SPEED = 1.7;     // rad/s the bulge climbs on its own
const SWELL_MOVE = 1.1;      // extra rad/s scaled by movement
const SEG_LAG = 1.05;        // per-segment phase lag → ~one bulge on the column at a time
const SWELL_RADIAL = 0.10;   // ± radial (x/z) scale of the pulse (the bulge)
const SWELL_Y = 0.15;        // vertical stretch AT THE CREST (opens the mouths); crest-only, never pinches
const SWELL_SWAY = 0.03;     // sea-organ lateral undulation (rad), phase-lagged up the chain
const SWELL_HEAD = 0.6;      // the top face swells LESS (its billboards/eyeshine ride the head bone)
const ARCH_LEAN = 0.15;      // max whole-column lean toward the player (rad, distributed up the chain)
const ARCH_LEAN_RANGE = 16;  // metres within which it attends / leans toward her
const ARCH_LEAN_K = 26, ARCH_LEAN_DAMP = 8;   // slow, gentle, well-damped attend (ζ≈0.78)
// F4 · how far the rooted column may CREEP from where it began attending (the
// spot it rooted when it first noticed her). Beyond this it simply HOLDS and
// keeps facing her — it is a landmark of dread, never a runner that follows.
const ARCH_TETHER = 3.5;
const ARCH_CREEP_MIN = 1.5;  // stop creeping once this close — it never climbs onto her

// E1 · per-monster utterance scheduler tuning. UTTER_RANGE: audible range (m)
// beyond which a Returned never voices. UTTER_MIN_GAP: global min gap (s) between
// ANY two monster utterances (anti-cacophony). UTTER_MAX_VOICES: only the nearest
// few active Returned may voice, so a crowd reads as a few voices, not a wall.
const UTTER_RANGE = 28;
const UTTER_MIN_GAP = 0.35;
const UTTER_MAX_VOICES = 3;

// where the face sits on each sculpted skull, in head-bone local space
const FACE = {
  testigo: { smearZ: 0.2, smearY: 0.06, eyeX: 0.058, eyeY: 0.085, eyeZ: 0.15, hairY: 0.17, hairR: 0.115 },
  doble: { smearZ: 0.15, smearY: 0.03, eyeX: 0.046, eyeY: 0.04, eyeZ: 0.115 },
  // the top face of the Choir-Column sits on the head bone, facing +z
  archivero: { smearZ: 0.17, smearY: 0.05, eyeX: 0.075, eyeY: 0.055, eyeZ: 0.15 },
};

function buildRig(kind) {
  const spec = KINDS[kind];
  const isArch = kind === 'archivero';
  const isDoble = kind === 'doble';

  // mottled, drowned hide over the sculpted body; per-kind PROCEDURAL
  // waterlogged-skin normal + wet-sheen roughness maps let the beam find pores
  // and damp patches. The Draft is paler, waxier and finer-skinned — it is
  // fresh, and it is a copy of someone still alive; the Half-Seen is long
  // drowned and the most eroded.
  const nScale = isDoble ? 0.34 : isArch ? 0.6 : 0.72;   // doble smoothest (unformed wax); pores read up close, no mid-distance bloom
  // MeshPhysical, not MeshStandard: the 115 cd torch (decay 2) bakes a flat
  // dielectric SPECULAR glaze (F0≈0.04) over a MeshStandard surface that blows
  // the torso to a chalky white band at point-blank, regardless of the dark
  // albedo. Dropping `specularIntensity` near-off kills that broad wash; a thin
  // `clearcoat` then re-adds a TIGHT wet-film highlight — the "just came out of
  // the lake" sheen the old material only faked with roughness blotches. Draft
  // (doble) is freshest → wettest/highest clearcoat; the archivero is oldest and
  // driest → lowest. Hooks preserved for the controller: transparent+opacity for
  // the dissolve fade, emissive (cool) @ intensity 0 for the flash-burn flare.
  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: fleshTex(kind),
    normalMap: normalTex(kind), normalScale: new THREE.Vector2(nScale, nScale),
    roughnessMap: roughTex(kind),
    color: isDoble ? 0xd3d6da : isArch ? 0x9ea3a8 : 0xbfc3c8,
    // the roughness map multiplies this — too low and they read as chrome
    roughness: isDoble ? 0.8 : isArch ? 0.95 : 0.88,
    metalness: 0,
    specularIntensity: 0.12,       // kill the torch's broad white specular glaze
    clearcoat: isDoble ? 0.5 : isArch ? 0.34 : 0.45,        // thin wet film (doble: soft wax coat, not wet glisten)
    clearcoatRoughness: isDoble ? 0.5 : isArch ? 0.45 : 0.4, // wetter = tighter sheen; doble broadened → soft candle-wax sheen
    transparent: true, opacity: 1,
    emissive: 0xcfe0ec, emissiveIntensity: 0,
  });
  // A3 — fake subsurface translucency + directional lividity, injected on TOP
  // of the MeshPhysical maps above (see src/world.js applyWind for the
  // onBeforeCompile string-injection precedent). The injected GLSL is IDENTICAL
  // across kinds — only the uniform VALUES differ — so the three bodies still
  // share one compiled program (no customProgramCacheKey needed). cloneRig()
  // clones the material, which re-runs this and mints fresh per-clone uniforms.
  //   SSS  : thin/edge flesh (fingers, jaw, silhouette) bleeds a soft waxy
  //          light — GATED by the direct light already on the pixel, so it only
  //          reads WHERE THE TORCH LANDS and never glows in the dark. Drowned
  //          scatter is cool grey-green, palest on the fresh Draft.
  //   livid: a subtle cool cyan-purple shift low on the body (and on the
  //          separately-meshed extremities, whose local y sits near 0) — pooled
  //          blood / cyanosis. Height comes from object-space position.y, which
  //          a shader has and the vertical-tiling cylinder UVs did not (A2).
  const sssCol = new THREE.Color(isDoble ? 0xc2c1b8 : isArch ? 0xa6b0a9 : 0x8fa39a);  // doble: warm porcelain wax (away from testigo's green)
  const sssStr = isDoble ? 0.85 : isArch ? 0.5 : 0.62;                                 // doble: a touch more translucency
  const lividCol = new THREE.Color(isDoble ? 0x2a2d31 : isArch ? 0x24303a : 0x222c38);  // doble: near-neutral wax shadow, not blue cyanosis (a fresh copy has no pooled blood)
  const bodyH = spec.h;
  bodyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSSSCol = { value: sssCol };
    shader.uniforms.uSSSStr = { value: sssStr };
    shader.uniforms.uLividCol = { value: lividCol };
    shader.uniforms.uBodyH = { value: bodyH };
    // vertex — carry bind-pose object-space height (feet≈0 … head≈uBodyH)
    shader.vertexShader = 'varying float vObjY;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vObjY = position.y;`);
    shader.fragmentShader = 'varying float vObjY;\n' +
      'uniform vec3 uSSSCol;\nuniform float uSSSStr;\nuniform vec3 uLividCol;\nuniform float uBodyH;\n' +
      shader.fragmentShader
        // lividity — after the flesh mottle is in diffuseColor: shift the lower
        // body ~40% toward livid, fading to untouched by mid-torso (subtle hint)
        .replace('#include <map_fragment>',
          `#include <map_fragment>
          float lv = smoothstep(uBodyH * 0.02, uBodyH * 0.5, vObjY);
          diffuseColor.rgb = mix(mix(uLividCol, diffuseColor.rgb, 0.6), diffuseColor.rgb, lv);`)
        // translucency — after direct lighting lands in reflectedLight: a
        // Fresnel-thinness rim, MULTIPLIED by how much torch is on the pixel so
        // dark/backlit flesh stays dark. rim (not fwidth curvature) carries it —
        // the noise-displaced hide would sparkle under a curvature term.
        .replace('#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 2.5);
          float lit = dot(reflectedLight.directDiffuse, vec3(0.3333));
          reflectedLight.directDiffuse += uSSSCol * lit * rim * uSSSStr;`);
  };
  const ghostMat = new THREE.MeshBasicMaterial({
    color: PAL.ghost, transparent: true, opacity: 0.035,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tatterMat = new THREE.MeshStandardMaterial({
    color: 0x080a0d, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, transparent: true,
  });

  const group = new THREE.Group();
  const P = {
    bodyMat, ghostMat, tatterMat,
    tatters: [], papers: [], hairs: [], fingers: [], xheads: [], hands: [],
    mats: [bodyMat, tatterMat],
  };

  // ---- the body: one continuous sculpted, skinned mesh. The bones carry
  // the same names/roles the old pivot groups had, so the whole behavior
  // and stop-motion layer below poses them unchanged.
  const { mesh: body, bones } = buildMonsterRig(kind, bodyMat);
  group.add(body);
  P.body = body;
  P.hips = bones.hips; P.hipY = bones.hips.position.y;
  P.spine = bones.spine; P.neck = bones.neck; P.head = bones.head;
  // F3 · the archivero's chain segments between spine and neck. Undefined for
  // testigo/doble (they have no seg bones) → guarded on use. Needed so the
  // peristaltic swell can drive the FULL vertical chain (hips→…→head).
  P.seg1 = bones.seg1; P.seg2 = bones.seg2;
  P.shoulders = [bones.sh0, bones.sh1].filter(Boolean);
  P.elbows = [bones.el0, bones.el1].filter(Boolean);
  P.wrists = [bones.wr0, bones.wr1].filter(Boolean);
  P.hipsJ = [bones.hj0, bones.hj1].filter(Boolean);
  P.knees = [bones.kn0, bones.kn1].filter(Boolean);
  const spine = P.spine, head = P.head;
  const F = FACE[kind];

  // F1 · the Drowned Choir-Column has no congregation extras — no folded hands,
  // no fused sub-heads, no orbiting cards. It is one continuous pillar of faces
  // driven by the hips/spine/seg/neck/head chain, so P.xheads/P.hands stay empty
  // (the isArch animate loops over them simply no-op until F3 drives the swell).
  if (!isArch) {
    // ghost torso follows the animation from inside the rig
    const ghostTorso = capsule(0.22, 0.38, ghostMat, 'bottom');
    ghostTorso.position.y = 0.36; ghostTorso.scale.set(1.07, 1.04, 0.82);
    ghostTorso.castShadow = false;
    spine.add(ghostTorso);
    P.ghostTorso = ghostTorso;
  }

  // ghost head aura hugs the sculpted skull
  const ghostHead = new THREE.Mesh(
    organic(new THREE.IcosahedronGeometry(isArch ? 0.125 : isDoble ? 0.12 : 0.15, 2), 0.02, 11),
    ghostMat);
  ghostHead.scale.set(0.95, 1.4, 1.12);
  ghostHead.position.set(0, 0.05, 0.02);
  ghostHead.castShadow = false;
  head.add(ghostHead);
  P.ghostHead = ghostHead;

  // the blur is now a veil over a real sculpted face, not a lamp in place
  // of one — faint enough that the sockets and the open jaw read through it
  if (!smearTex[kind]) smearTex[kind] = smearTexture(kind);
  const smearSize = (isArch ? 0.38 : isDoble ? 0.68 : 0.5) * 1.0;
  const smear = new THREE.Mesh(
    new THREE.PlaneGeometry(smearSize, smearSize * 1.25),
    new THREE.MeshBasicMaterial({ map: smearTex[kind], transparent: true, depthWrite: false, opacity: isDoble ? 0.55 : 0.4 })
  );
  smear.material.userData.base = smear.material.opacity;
  smear.position.set(0, F.smearY, F.smearZ);
  head.add(smear);
  P.smear = smear;
  const smear2 = new THREE.Mesh(smear.geometry, new THREE.MeshBasicMaterial({
    map: smearTex[kind], transparent: true, depthWrite: false, opacity: 0.12,
    blending: THREE.AdditiveBlending,
  }));
  smear2.position.set(0, F.smearY, F.smearZ + 0.02);
  head.add(smear2);
  P.smear2 = smear2;

  // B5 · wet eyeshine. Two elements per eye: a TIGHT hot CORE (m_eyes) and a
  // fainter wider HALO (m_eyeHalo), both round radial-dot textures (not flat
  // squares) and ADDITIVELY blended so the beam reads as light caught on a wet
  // eye. The core is small + bright + cold so its centre can just tip past the
  // UnrealBloomPass threshold (0.96) → a subtle wet spark, not a headlight.
  // Behind them (testigo only) a near-black unlit SOCKET recess (m_socket),
  // sized bigger than the glint and set slightly deeper, so the eye reads as a
  // wet point at the bottom of an empty hollow. Both glints are opacity-driven
  // from the torch-facing dot in poseIndependent(); shared across testigo +
  // archivero (the doble is guarded off there). Colour stays cold (~0xd8e8f0).
  if (!glintTex.core) { glintTex.core = glintTexture(true); glintTex.halo = glintTexture(false); }
  const isTest = kind === 'testigo';
  const eyeMat = new THREE.MeshBasicMaterial({
    color: 0xecf3f8, map: glintTex.core, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const eyeHaloMat = new THREE.MeshBasicMaterial({
    color: 0xbcd4e4, map: glintTex.halo, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const socketMat = isTest ? new THREE.MeshBasicMaterial({
    color: 0x05060b, map: glintTex.halo, transparent: true, opacity: SOCKET_DARK, depthWrite: false,
  }) : null;
  const CORE = isArch ? 0.017 : 0.02;   // tight hot core
  const HALO = CORE * 2.6;              // soft surround
  const SOCK = CORE * 3.6;              // dark hollow, bigger than the glint
  for (const s of [-1, 1]) {
    if (socketMat) {
      const sk = new THREE.Mesh(new THREE.PlaneGeometry(SOCK, SOCK * 1.15), socketMat);
      sk.position.set(s * F.eyeX, F.eyeY - 0.004, F.eyeZ - 0.022);   // set BEHIND the glint
      head.add(sk);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(HALO, HALO), eyeHaloMat);
    halo.position.set(s * F.eyeX, F.eyeY, F.eyeZ + 0.001);
    head.add(halo);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(CORE, CORE), eyeMat);
    core.position.set(s * F.eyeX, F.eyeY, F.eyeZ + 0.003);   // deepest catch-light, at the front
    head.add(core);
  }
  P.eyeMat = eyeMat;
  P.eyeHaloMat = eyeHaloMat;
  P.socketMat = socketMat;

  // B5 · a small dark MAW in the sculpted mouth carve (testigo only) — the jaw
  // is sculpted (no bone to animate), so this soft near-black blob deepens the
  // dropped-open mouth and gives the pinned tremor something to quiver/part.
  // Shares m_socket (fades with the sockets on death). Local maw carve sits at
  // world [0,2.53,0.2] → head-local ≈ [0,-0.065,0.13]; seated just inside.
  if (socketMat) {
    const maw = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.066), socketMat);
    maw.position.set(0, -0.062, 0.118);
    maw.userData.baseY = maw.position.y;
    head.add(maw);
    P.maw = maw;
  }

  // wet hair, hanging over what would have been the face. Its OWN material
  // (not the shared tatterMat): translucent wet-hair cards textured with the
  // hairClump alpha silhouette — coloured strands over transparent gaps, so
  // the carved sockets read THROUGH the curtain (memory keeps the stare, not
  // the eyes). MeshPhysical + low specularIntensity (A1 lesson) so the torch
  // can't blow it to a white flag; a thin clearcoat gives the wet sheen.
  if (kind === 'testigo') {
    const { map: hairMap, normal: hairNormal } = hairClump({ wet: true });
    const hairMat = new THREE.MeshPhysicalMaterial({
      map: hairMap,
      normalMap: hairNormal,
      color: 0x64626a,                 // dark hair — the map already carries the tone
      roughness: 0.5,                  // low-ish → a wet sheen
      metalness: 0,
      specularIntensity: 0.15,         // kill the broad white torch specular
      clearcoat: 0.5,                  // thin wet film catches the beam
      clearcoatRoughness: 0.38,        // slightly rougher → a streak, not a chrome band
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      opacity: 1,
    });
    P.hairMat = hairMat;               // named m_hair in rigTemplate → cloned + faded

    // one strand card: rooted near the crown, hanging from its top (geometry
    // translated so it drapes down -y), fanned outward on the front arc. `yaw`
    // is stored because cloneRig re-derives eulers from the quaternion and can
    // pick the flipped form (same reason as the tatters); B2 reads ph/amp/yaw.
    const addStrand = (a, rMul, w, l) => {
      const strand = new THREE.Mesh(new THREE.PlaneGeometry(w, l), hairMat);
      strand.geometry.translate(0, -l / 2, 0);
      const rr = F.hairR + Math.random() * 0.03;
      const hyaw = a + (Math.random() - 0.5) * 0.5;
      strand.position.set(Math.sin(a) * rr, F.hairY, Math.cos(a) * rr * rMul);
      strand.rotation.y = hyaw;
      strand.userData = { isHair: 1, ph: Math.random() * 9, amp: 0.06 + Math.random() * 0.1, yaw: hyaw };
      head.add(strand);
      P.hairs.push(strand);
    };

    // layer 1 — dense front curtain: many thin overlapping wisps fanned across
    // the front arc so gaps read as depth, not a paddle.
    const frontN = 15;
    for (let i = 0; i < frontN; i++) {
      const a = -0.95 + (i / (frontN - 1)) * 1.9;
      addStrand(a, 1.15, 0.026 + Math.random() * 0.03, 0.42 + Math.random() * 0.24);
    }
    // layer 2 — sparser, wider locks around the whole head for volume/depth
    // (a few longer over the nape, a couple more over the face at a new offset).
    const backN = 9;
    for (let i = 0; i < backN; i++) {
      const front = Math.random() < 0.4;
      const a = front
        ? -0.8 + Math.random() * 1.6
        : Math.PI * (0.55 + Math.random() * 0.9) * (Math.random() < 0.5 ? 1 : -1);
      addStrand(a, front ? 1.1 : 1, 0.05 + Math.random() * 0.045, (front ? 0.36 : 0.3) + Math.random() * 0.26);
    }
  }

  // ---- fingers: long thin worms of them, riding the wrist bones (the
  // sculpted hand ends at the palm). The Draft's left hand is a fused
  // mitten — the lake hasn't read that part of you yet.
  for (let side = 0; side < P.wrists.length; side++) {
    const s = side === 0 ? -1 : 1;
    if (isDoble && s < 0) continue;
    const fingerN = 4;
    for (let f = 0; f < fingerN; f++) {
      const fl = (kind === 'testigo' ? 0.2 : 0.13) + (f === 1 || f === 2 ? 0.05 : 0);
      const finger = capsule(0.011, fl, bodyMat);
      finger.position.set(s * (-0.035 + f * 0.023), -0.1, 0.01);
      finger.rotation.x = 0.18;
      finger.userData = { isFinger: 1, fi: f + (s < 0 ? 0 : 4), ph: Math.random() * 9 };
      P.wrists[side].add(finger);
      P.fingers.push(finger);
    }
  }

  // ---- hanging tatters (a shroud that remembers being a coat). The Draft
  // wears none: the lake copied a body, not a wardrobe
  const tatterCount = isArch ? 0 : isDoble ? 0 : 9;   // F1 · the Choir-Column wears no shroud
  const tatY = isArch ? 0.8 : 0.74;   // shoulder height, local to the spine bone
  for (let i = 0; i < tatterCount; i++) {
    const w = 0.07 + Math.random() * 0.08;
    const l = 0.5 + Math.random() * 0.7;
    const t = new THREE.Mesh(new THREE.PlaneGeometry(w, l), tatterMat);
    t.geometry.translate(0, -l / 2, 0);
    const a = Math.random() * Math.PI * 2;
    const rr = isArch ? 0.42 : 0.24;
    t.position.set(Math.cos(a) * rr, tatY - 0.05 - Math.random() * 0.2, Math.sin(a) * rr * 0.7);
    t.rotation.y = a + Math.PI / 2;
    // store the yaw: cloning re-derives eulers from the quaternion and can
    // pick the (x+π, z+π) form, which flips "hanging down" into "sticking
    // up" once the animation overwrites rotation.x alone
    t.userData = { ph: Math.random() * 9, amp: 0.1 + Math.random() * 0.14, yaw: a + Math.PI / 2 };
    spine.add(t);
    P.tatters.push(t);
  }

  // ---- the water it arrives through: a ripple where it stands up
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.72, 28),
    new THREE.MeshBasicMaterial({
      color: PAL.ghost, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.04;
  group.add(ripple);
  P.ripple = ripple;

  return { group, P };
}

// The feet sheen circle and the two splash rings are NEVER mutated per instance
// (only their per-mesh scale and per-material opacity animate). Share one
// geometry each across every Returned, so a spawn allocates no new geometry for
// them and the GPU never re-uploads these buffers on first draw. The animated
// line buffer below stays per-instance (its positions are rewritten each frame).
const SHEEN_GEO = new THREE.CircleGeometry(0.52, 24);
const RING_GEO = new THREE.RingGeometry(0.34, 0.4, 20);

// per-instance run-off — water still sheeting down it, never finished draining.
// Rivulets are motion-stretched LineSegments (top+bottom vert per streak) that
// run down the body and wander so they follow its contour; a faint wet sheen +
// occasional splash ring pool at the feet where it stands in the sodden ground.
function makeDrips(h) {
  const N = 32;
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(N * 2 * 3);   // 2 verts (top, bottom) per rivulet
  const data = [];
  for (let i = 0; i < N; i++) {
    const d = {
      x: (Math.random() - 0.5) * 0.42, z: (Math.random() - 0.5) * 0.34,
      y: 0.2 + Math.random() * h * 0.85, v: 0.7 + Math.random() * 0.9,
      wf: 0.6 + Math.random() * 1.5,          // wander frequency
      wph: Math.random() * Math.PI * 2,       // wander phase
      wa: 0.014 + Math.random() * 0.03,       // wander amplitude (contour follow)
      len: 0.05 + Math.random() * 0.05,       // resting streak length
    };
    data.push(d);
    const o = i * 6;
    arr[o] = d.x; arr[o + 1] = d.y; arr[o + 2] = d.z;               // top
    arr[o + 3] = d.x; arr[o + 4] = d.y - d.len; arr[o + 5] = d.z;   // bottom
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x9fb6c4, transparent: true, opacity: 0.34, depthWrite: false,
  });
  const pts = new THREE.LineSegments(geo, mat);
  pts.frustumCulled = false;

  // ---- feet: wet sheen on the sodden ground + a couple of pooled splash rings
  const feet = new THREE.Group();
  feet.frustumCulled = false;
  const sheen = new THREE.Mesh(
    SHEEN_GEO,
    new THREE.MeshBasicMaterial({
      color: 0x9fb6c4, transparent: true, opacity: 0.05, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.y = 0.02;
  feet.add(sheen);
  const rings = [];
  for (let r = 0; r < 2; r++) {
    const ring = new THREE.Mesh(
      RING_GEO,
      new THREE.MeshBasicMaterial({
        color: 0x9fb6c4, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    ring.userData = { t: 0, dur: 0 };   // dur>0 while an expanding splash is live
    feet.add(ring);
    rings.push(ring);
  }

  return { pts, data, attr: geo.getAttribute('position'), mat, h, feet, sheen, rings };
}

// ---- rig templates: building a rig displaces dozens of geometries, which
// caused a visible hitch on every spawn. Build each kind ONCE, then clone —
// geometry is shared, materials are cloned per instance for the dying fade.
const RIG_TEMPLATES = {};

export function warmRigTemplates() {
  for (const kind of Object.keys(KINDS)) rigTemplate(kind);
}

function rigTemplate(kind) {
  if (RIG_TEMPLATES[kind]) return RIG_TEMPLATES[kind];
  const t = buildRig(kind);
  const P = t.P;
  P.hips.name = 'hips'; P.spine.name = 'spine'; P.neck.name = 'neck'; P.head.name = 'head';
  if (P.seg1) P.seg1.name = 'seg1';   // F3 · so cloneRig's switch re-collects them
  if (P.seg2) P.seg2.name = 'seg2';
  P.shoulders.forEach((o, i) => { o.name = 'sh' + i; });
  P.elbows.forEach((o, i) => { o.name = 'el' + i; });
  P.hipsJ.forEach((o, i) => { o.name = 'hj' + i; });
  P.knees.forEach((o, i) => { o.name = 'kn' + i; });
  P.smear.name = 'smear'; P.smear2.name = 'smear2'; P.ripple.name = 'ripple';
  if (P.ghostTorso) P.ghostTorso.name = 'ghostT';
  P.bodyMat.name = 'm_body'; P.tatterMat.name = 'm_tatter'; P.ghostMat.name = 'm_ghost';
  P.smear.material.name = 'm_smear'; P.smear2.material.name = 'm_smear2';
  P.ripple.material.name = 'm_ripple';
  P.eyeMat.name = 'm_eyes';
  if (P.eyeHaloMat) P.eyeHaloMat.name = 'm_eyeHalo';
  if (P.socketMat) P.socketMat.name = 'm_socket';
  if (P.maw) P.maw.name = 'maw';
  if (P.hairMat) P.hairMat.name = 'm_hair';
  if (P.shroudMat) P.shroudMat.name = 'm_shroud';
  for (const tt of P.tatters) tt.userData.isTatter = 1;
  for (const pp of P.papers) pp.userData.isPaper = 1;
  if (P.papers[0]) P.papers[0].material.name = 'm_paper';
  if (P.xheads[0]) {
    const xs = P.xheads.flatMap((h) => h.children).find((o) => o.userData?.isXSmear);
    if (xs) xs.material.name = 'm_xsmear';
  }
  RIG_TEMPLATES[kind] = t;
  return t;
}

function cloneRig(kind) {
  const tpl = rigTemplate(kind);
  // SkeletonUtils.clone: a plain .clone(true) would leave the SkinnedMesh
  // bound to the TEMPLATE's skeleton — every instance would strike the
  // template's pose. This rebinds the clone to its own cloned bones.
  const group = cloneSkeleton(tpl.group);
  const P = {
    shoulders: [], elbows: [], hipsJ: [], knees: [],
    tatters: [], papers: [], hairs: [], fingers: [], xheads: [], hands: [],
    mats: [], hipY: tpl.P.hipY,
  };
  const mclones = {};
  group.traverse((o) => {
    if (o.isMesh && o.material?.name?.startsWith('m_')) {
      const k = o.material.name;
      if (!mclones[k]) mclones[k] = o.material.clone();
      o.material = mclones[k];
    }
    if (o.userData?.isTatter) P.tatters.push(o);
    if (o.userData?.isPaper) P.papers.push(o);
    if (o.userData?.isHair) P.hairs.push(o);
    if (o.userData?.isFinger) P.fingers.push(o);
    if (o.userData?.isXHead) P.xheads.push(o);
    if (o.userData?.isHands) P.hands.push(o);
    switch (o.name) {
      case 'hips': P.hips = o; break;
      case 'spine': P.spine = o; break;
      case 'seg1': P.seg1 = o; break;
      case 'seg2': P.seg2 = o; break;
      case 'neck': P.neck = o; break;
      case 'head': P.head = o; break;
      case 'sh0': P.shoulders[0] = o; break;
      case 'sh1': P.shoulders[1] = o; break;
      case 'el0': P.elbows[0] = o; break;
      case 'el1': P.elbows[1] = o; break;
      case 'hj0': P.hipsJ[0] = o; break;
      case 'hj1': P.hipsJ[1] = o; break;
      case 'kn0': P.knees[0] = o; break;
      case 'kn1': P.knees[1] = o; break;
      case 'smear': P.smear = o; break;
      case 'smear2': P.smear2 = o; break;
      case 'ripple': P.ripple = o; break;
      case 'ghostT': P.ghostTorso = o; break;
      case 'maw': P.maw = o; break;
    }
  });
  P.bodyMat = mclones['m_body'];
  P.eyeMat = mclones['m_eyes'];
  // B5 · transparent, opacity-driven per instance → must ride the clone list
  P.eyeHaloMat = mclones['m_eyeHalo'];
  P.socketMat = mclones['m_socket'];   // undefined for non-testigo (guarded on use)
  P.hairMat = mclones['m_hair'];
  // m_hair joins the fade list so the wet curtain dissolves with the body on death
  P.mats = ['m_body', 'm_tatter', 'm_paper', 'm_shroud', 'm_hair'].map((k) => mclones[k]).filter(Boolean);
  // each instance jitters its own face — clone the smear textures so the
  // misregistration is per-copy, not shared by the whole species
  for (const k of ['m_smear', 'm_smear2', 'm_xsmear']) {
    if (mclones[k]?.map) { mclones[k].map = mclones[k].map.clone(); mclones[k].map.needsUpdate = true; }
  }
  P.smearMats = ['m_smear', 'm_smear2', 'm_xsmear'].map((k) => mclones[k]).filter(Boolean);
  // per-instance wrongness: nothing rebuilt from memory comes out even
  P.shoulders[0]?.scale.setScalar(0.92 + Math.random() * 0.22);
  P.shoulders[1]?.scale.setScalar(0.98 + Math.random() * 0.3);
  P.hipsJ[0]?.scale.setScalar(0.95 + Math.random() * 0.1);
  P.hipsJ[1]?.scale.setScalar(0.93 + Math.random() * 0.1);
  P.spine.rotation.z = (Math.random() - 0.5) * 0.16;
  P.headTilt = 0.18 + Math.random() * 0.2;
  // droplets are per-instance (their geometry is mutated every frame)
  P.drips = makeDrips(KINDS[kind].h);
  group.add(P.drips.pts);
  if (P.drips.feet) group.add(P.drips.feet);
  return { group, P };
}

let nextId = 1;

class Rumor {
  constructor(kind, x, z, opts = {}) {
    this.id = nextId++;
    this.kind = kind;
    this.spec = KINDS[kind];
    const { group, P } = cloneRig(kind);
    this.group = group;
    this.P = P;
    // D2 · pose-blend channels: the locomotion DOF written by the pose if/else
    // in animate(). Built ONCE here (bones are already cloned) so the per-frame
    // apply-step never allocates. Guarded so archivero — which has no
    // arm/leg bones — simply contributes fewer channels (hips/spine/neck only).
    // NOTE: head, xheads and fingers are deliberately excluded so their snaps
    // stay snappy.
    this._blendChans = [];
    const addCh = (o, k) => { if (o) this._blendChans.push({ o, k }); };
    addCh(P.hips?.position, 'y');
    addCh(P.hips?.rotation, 'z');
    addCh(P.spine?.rotation, 'x');
    addCh(P.neck?.rotation, 'x');
    for (const sh of P.shoulders) { addCh(sh?.rotation, 'x'); addCh(sh?.rotation, 'z'); }
    for (const el of P.elbows) addCh(el?.rotation, 'x');
    for (const hj of P.hipsJ) addCh(hj?.rotation, 'x');
    for (const kn of P.knees) addCh(kn?.rotation, 'x');
    const nCh = this._blendChans.length;
    this._prevPose = new Float64Array(nCh);
    this._targetPose = new Float64Array(nCh);
    this._blendT = 0;
    this._blendDur = (1 / this.spec.fps) * BLEND_FRAC;   // seconds of easing per tick
    this._blendActive = false;   // set every frame in animate() from the state
    this._blendPrimed = false;   // first ticked pose (or a crawl<->stand flip) snaps
    // C4 · sprung crawl<->stand transition progress (0 crawl, 1 stand). Spawn is
    // always 'manifest' → standing, so x starts at 1; effect states pin it to the
    // goal (no transition) and normal states spring it. State on the instance so
    // the per-frame driver never allocates.
    this._t01 = { x: 1, v: 0 };
    this.pos = new THREE.Vector3(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
    // F4 · the archivero's ROOT: the spot it plants itself when it starts
    // attending (set in startChase). Its glacial creep is tethered here so it
    // never strays far from where it rose — a landmark, not a pursuer. Reused
    // (copied), never re-allocated per frame.
    this._root = new THREE.Vector3(x, 0, z);
    this.guard = opts.guard ?? false;
    this.scripted = opts.scripted ?? false;
    this.allowHouse = opts.allowHouse ?? false;
    // an ABDUCTOR ignores Ana and hunts a prey NPC (Mara). It reaches for the
    // prey's live position, harms only the prey (not Ana), and is dissolved by
    // the camera like any Returned. Set by Director.spawnAbductor.
    this.abduct = opts.abduct ?? false;
    this.prey = opts.prey ?? null;
    this.state = 'manifest';
    this.stateT = 0;
    this.wanderTarget = null;
    // a3 — ambient world behavior (all gated so they never touch an active chase)
    this.postIndex = -1;      // claimed lit-window post while gathering, else -1
    this._atPost = false;     // arrived and holding at the window
    this.loiterT = 0;         // standing-at-the-tideline pause timer
    this.threshT = 0;         // shelter-threshold linger timer (negative = cooldown)
    this._shoreTgt = false;   // the current wander target was pulled toward the shore
    this.lastSeen = new THREE.Vector3(x, 0, z);
    this.lostT = 0;
    this.exposure = 0;
    this.stuck = 0;
    this.detour = 0;
    this.detourSign = 1;
    this.touchCd = 0;
    this.screamed = false;
    this.anim = Math.random() * 10;
    this.gait = Math.random() * 6;
    this.walkAmp = 0;
    this.headYaw = 0;
    // D1 · secondary-motion drive for the tatters (read in poseIndependent):
    // current linear speed, and previous yaw so we can derive angular velocity
    // (change in group.rotation.y per frame). Tatter spring state itself lives
    // per-tatter in userData so it survives cloneRig.
    this._speedNow = 0;
    this._prevYaw = 0;
    this.dying = 0;
    this.flashBurn = 0;
    this.flank = (this.id % 2 ? 1 : -1);       // which side it circles from
    this.glitchT = 3 + Math.random() * 4;
    // E1 · per-monster utterance countdown (s). Randomized initial delay so
    // freshly-spawned Returned don't all voice at once. Reset per fire in
    // updateUtter to a closeness/agitation-scaled random interval.
    this._utterT = 2 + Math.random() * 6;
    this._pin = 0;                             // how pinned the Half-Seen is
    this._pinHeld = 0;
    this._hTremZ = 0; this._hTremX = 0;        // B5 · applied head-tremor delta (self-cancelled per frame)
    this._lunge = 0;
    this._seen = false;
    // C3 · "wrong-stillness" micro-settle for the WATCHED-standing doble. Its
    // default is DEAD still (the B3 tell — it does not breathe, it does not
    // sway); this does NOT reintroduce that. After an unnaturally long,
    // randomized hold it fires ONE tiny, isolated, SPRUNG adjustment a living
    // body would never delay that long, then freezes again. State lives here so
    // the per-frame driver in poseIndependent never allocates. See that block.
    this._settleT = -1;              // countdown to next settle; <0 = lazy-init on first standing frame
    this._settleActive = false;      // a settle is currently playing out (only ever one → never overlaps)
    this._settle = { x: 0, v: 0 };   // shared sprung scalar, reused (springScalar, D1)
    this._settleType = -1;           // which micro-motion is playing; also "last", to avoid repeats
    this._settleK = 60; this._settleDamp = 7;   // spring tuning for the ACTIVE settle
    this._settleSide = 0;            // shoulder side / finger index for the active settle
    this._settleAge = 0;             // seconds the active settle has run (so it can't end on frame 1)
    // production hold range (s): deliberately long so a settle reads as "a beat
    // too late," not fidgeting. Tests may override to force settles quickly.
    this._settleHoldMin = 3.5; this._settleHoldMax = 7.5;
    // c4 · teaching sighting: a distant, one-time, non-lethal demonstration of
    // this kind's tell. It never chases, never reaches Ana, stays well beyond
    // the 4.5 m fear aura, and is immune to the flash so the lesson can't be
    // cut short. Set true by Director.spawnDemo.
    this.demo = opts.demo ?? false;
    this.demoExpire = false;                   // Director despawns it when true
    this.demoStop = this.demo
      ? (kind === 'doble' ? 8.5 : kind === 'archivero' ? 7.5 : 0)   // metres it will not come inside
      : 0;
    this.demoMaxLife = 16;                      // seconds before it leaves regardless
    this._demoEverSeen = false;
    this._awayT = 0;
    group.position.copy(this.pos);
    group.scale.y = 0.001;
  }

  observed(ctx) {
    const toMe = _observed.subVectors(this.pos, ctx.playerPos);
    const d = toMe.length();
    if (d > 40) return false;
    toMe.normalize();
    if (toMe.dot(ctx.playerDir) < 0.83) return false;
    if (!(ctx.flashOn ? d < 34 : d < 7.5)) return false;
    return ctx.colliders.losClear(ctx.playerPos.x, ctx.playerPos.z, this.pos.x, this.pos.z);
  }

  // can it perceive the player right now?
  canSee(ctx, dist) {
    const range = ctx.flashOn ? this.spec.sightLit : Math.max(this.spec.sight * 0.55, 8);
    if (dist > range) return false;
    return ctx.colliders.losClear(this.pos.x, this.pos.z, ctx.playerPos.x, ctx.playerPos.z);
  }

  update(dt, ctx) {
    const t = (this.anim += dt);
    this.stateT += dt;
    this.touchCd = Math.max(0, this.touchCd - dt);
    const spec = this.spec;
    const toPlayer = _toPlayer.subVectors(ctx.playerPos, this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const playerHidden = ctx.playerInHouse() && !this.allowHouse;
    this._seen = this.observed(ctx);

    if (this.demo) { this.updateDemo(dt, ctx, toPlayer, dist); return; }

    let moveSpeed = 0;
    let moveDir = null;
    let faceDir = null;

    switch (this.state) {
      case 'manifest': {
        const k = Math.min(1, this.stateT / 1.3);
        const e = 1 - Math.pow(1 - k, 3);
        this.group.scale.y = Math.max(0.001, e);
        if (this.kind === 'archivero') {
          // F3 · a RISING REEF: the column surfaces STRAIGHT up out of the water
          // — a thin spire that thickens as it breaches, no humanoid crouch. It
          // grows from the base (group pivot at the waterline); the upper chain
          // UNFURLS on the animation layer (driven in the swell block so the tick
          // base doesn't clobber it), so the head lifts last as it clears.
          this.group.scale.x = this.group.scale.z = 0.4 + e * 0.6;
          this.P.spine.rotation.x = 0.03;
        } else {
          this.group.scale.x = this.group.scale.z = 0.6 + e * 0.4;
          // it stands up out of a crouch, out of the wet ground
          this.P.spine.rotation.x = (1 - e) * 1.1;
        }
        this.P.ripple.scale.setScalar(0.4 + e * 1.3);
        this.P.ripple.material.opacity = 0.26 * (1 - e);
        if (k >= 1) {
          this.P.ripple.material.opacity = 0;
          this.setState(this.guard ? 'guard' : 'wander');
        }
        break;
      }
      case 'wander': {
        // yield instantly to a visible player — perception is unchanged
        if (!playerHidden && this.canSee(ctx, dist)) { this.startChase(ctx); break; }
        // a3-3: patient at a shelter threshold. A wanderer that reaches a
        // hearth/lantern doesn't merely get shoved past — it stops at the edge
        // of the light and stands facing in, waiting, before it drifts off.
        if (this.threshT >= 0) {
          let sp = null, spd = 1e9;
          for (const s of ctx.safeSpots) {
            const d = Math.hypot(this.pos.x - s.x, this.pos.z - s.z);
            if (d < s.r + 1.0 && d < spd) { sp = s; spd = d; }
          }
          if (sp) {
            const inv = 1 / (spd || 1);
            const ux = (this.pos.x - sp.x) * inv, uz = (this.pos.z - sp.z) * inv;
            const edge = sp.r + 0.4;                       // hold just outside the boundary
            const toEdge = _move.set(sp.x + ux * edge - this.pos.x, 0, sp.z + uz * edge - this.pos.z);
            if (toEdge.length() > 0.3) { moveDir = toEdge.normalize(); moveSpeed = spec.walk * 0.7; }
            faceDir = _face.set(sp.x - this.pos.x, 0, sp.z - this.pos.z);   // face the fire/player
            this.threshT += dt;
            if (this.threshT > 6.5 + (this.id % 4)) {
              this.threshT = -7;   // negative = cooldown before it lingers again
              // step back off, radially away from the light, before it circles in again
              this.wanderTarget = new THREE.Vector3(sp.x + ux * (sp.r + 6), 0, sp.z + uz * (sp.r + 6));
            }
            break;
          }
        } else {
          this.threshT = Math.min(0, this.threshT + dt);   // count the cooldown back up to 0
        }
        // a3-1: a powered house draws the idle Returned up to its lit windows
        if (ctx.isPowered && !this.guard && !this.scripted && ctx.claimPost &&
          Math.hypot(this.pos.x - ctx.houseCenter.x, this.pos.z - ctx.houseCenter.z) < 42) {
          if (ctx.claimPost(this)) { this.setState('gather'); break; }
        }
        // a3-2: reached the shore band — stand a while and look out over the
        // water that keeps calling the drowned back
        if (this.loiterT > 0) {
          this.loiterT -= dt;
          moveSpeed = 0;
          faceDir = _face.set(Math.sin(t * 0.4) * 0.15, 0, 1);   // face the lake (+z, south)
          break;
        }
        if (!this.wanderTarget || this.stateT > 9 || this.pos.distanceTo(this.wanderTarget) < 1.2) {
          if (this._shoreTgt && this.wanderTarget && this.pos.distanceTo(this.wanderTarget) < 1.6) {
            this.loiterT = 2.5 + Math.random() * 3;
            this._shoreTgt = false;
          }
          this.pickWanderTarget(ctx);
          this.stateT = 0;
        }
        moveDir = _move.subVectors(this.wanderTarget, this.pos).normalize();
        moveSpeed = spec.walk;
        break;
      }
      case 'gather': {
        // power gone, or this isn't an ambient wanderer → release and resume
        if (!ctx.isPowered || this.guard || this.scripted) {
          ctx.releasePost?.(this);
          this.setState(playerHidden ? 'lurk' : 'wander');
          break;
        }
        // the player in the open outranks the windows: chase the instant it's seen
        if (!playerHidden && this.canSee(ctx, dist)) {
          ctx.releasePost?.(this); this.startChase(ctx); break;
        }
        const post = ctx.claimPost?.(this);
        if (!post) { this.setState(playerHidden ? 'lurk' : 'wander'); break; }
        const toPost = _move.set(post.x - this.pos.x, 0, post.z - this.pos.z);
        const dP = toPost.length();
        this._atPost = dP <= 0.7;
        if (!this._atPost) {
          moveDir = toPost.normalize();
          moveSpeed = spec.walk;
          faceDir = moveDir;
        } else {
          // standing at the edge of the light, facing the house, holding it —
          // a slow sway and the odd micro-adjust; the head still tracks you on
          // its own, up in the animation layer
          moveSpeed = 0;
          const sway = Math.sin(t * 0.5 + this.id) * 0.13;
          faceDir = _face.set(sway, 0, ctx.houseCenter.z - this.pos.z);   // face the house (north)
        }
        break;
      }
      case 'guard': {
        const a = t * 0.25;
        const gx = this.home.x + Math.cos(a) * 2.2, gz = this.home.z + Math.sin(a) * 2.2;
        moveDir = _move.set(gx - this.pos.x, 0, gz - this.pos.z);
        if (moveDir.lengthSq() > 0.05) moveDir.normalize(); else moveDir = null;
        moveSpeed = spec.walk;
        // the congregation faces you long before it moves — it is waiting
        // to be recognized
        if (this.kind === 'archivero' && dist < 20 &&
          ctx.colliders.losClear(this.pos.x, this.pos.z, ctx.playerPos.x, ctx.playerPos.z)) faceDir = toPlayer;
        if (!playerHidden && dist < (ctx.flashOn ? spec.sightLit : spec.sight)) this.startChase(ctx);
        break;
      }
      case 'chase': {
        if (playerHidden) { this.setState('lurk'); break; }
        // sight memory: break line of sight (or kill your light and keep
        // your distance) long enough and it loses you
        if (this.canSee(ctx, dist)) {
          this.lastSeen.copy(ctx.playerPos);
          this.lostT = 0;
        } else {
          this.lostT += dt;
          // the congregation is patient; the others give up sooner
          if (this.lostT > (this.kind === 'archivero' ? 6 : 2.2)) { this.setState('search'); break; }
        }
        const target = this.lostT > 0 ? this.lastSeen : ctx.playerPos;
        const toTarget = _move.set(target.x - this.pos.x, 0, target.z - this.pos.z);
        const dT = toTarget.length();
        // approach off-axis: chasers come around your flank, not up the beam
        if (dT > 7 && this.kind !== 'archivero') {
          const side = Math.min(4.5, dT * 0.35) * this.flank;
          toTarget.x += (-toTarget.z / dT) * side;
          toTarget.z += (toTarget.x / dT) * side;
        }
        if (this.kind === 'doble') {
          // it cannot yet do "being watched"
          if (this._seen) {
            moveSpeed = 0;
          } else if (dT > 0.2) {
            moveDir = toTarget.normalize();
            // close in and it stops pretending to pace itself
            moveSpeed = spec.chase * (dist < 9 ? 1.3 : 1);
          }
        } else if (this.kind === 'testigo') {
          // being looked at pins it — for a while. Pressure builds under the
          // stare, and when it breaks, it breaks toward you.
          if (this._seen && dist > 3.2 && this._lunge <= 0) {
            this._pin = Math.min(1.2, this._pin + dt * 2.4);
            this._pinHeld += dt;
            if (this._pinHeld > 2.2 + Math.random()) {
              this._pinHeld = 0; this._pin = 0; this._lunge = 1.0;
            }
          } else {
            this._pin = Math.max(0, this._pin - dt * 3);
            this._pinHeld = Math.max(0, this._pinHeld - dt * 2);
          }
          this._lunge -= dt;
          if (dT > 0.2) {
            moveDir = toTarget.normalize();
            if (this._lunge > 0) moveSpeed = spec.chase * 1.9;
            else if (this._pin > 0.2) moveSpeed = 0;
            else {
              const surge = 0.35 + Math.pow(Math.abs(Math.sin(t * 0.85)), 3) * 1.5;
              moveSpeed = spec.chase * surge * (this._seen ? 1 : 1.25);
            }
          }
        } else if (this.kind === 'archivero') {
          // F4 · THE CONGREGATION does not pursue. Where the others would run
          // her down, it ROOTS and ATTENDS — it has already turned its column
          // of faces to her (faceDir below) and it sings/leans (the F3 swell).
          // It may only CREEP glacially toward her (spec.chase ≈ 0.18 m/s, ~17×
          // slower than a walking Ana), and only while it hasn't strayed past
          // ARCH_TETHER from where it rooted — beyond that it simply HOLDS, a
          // landmark waiting to be recognized. Its danger is presence: the
          // fear-aura and touch bite only if SHE closes onto IT. It never
          // closes onto her.
          const strayed = Math.hypot(this.pos.x - this._root.x, this.pos.z - this._root.z);
          if (dT > ARCH_CREEP_MIN && strayed < ARCH_TETHER) {
            moveDir = toTarget.normalize();
            moveSpeed = spec.chase;
          }
          // else: rooted — still, only its faces and lean keep attending her
        } else if (dT > 0.2) {
          moveDir = toTarget.normalize();
          moveSpeed = spec.chase;
        }
        faceDir = toPlayer;
        if (dist > (this.kind === 'doble' ? 46 : 36)) this.setState(this.guard ? 'guard' : 'wander');
        break;
      }
      case 'search': {
        // go to where it last saw you, cast around, give up
        const toLast = _move.set(this.lastSeen.x - this.pos.x, 0, this.lastSeen.z - this.pos.z);
        if (toLast.length() > 1.4 && this.stateT < 8) {
          moveDir = toLast.normalize();
          moveSpeed = spec.walk * 1.6 || 1.2;
        } else {
          faceDir = _face.set(Math.sin(t * 0.7), 0, Math.cos(t * 0.7));
          if (this.stateT > 6.5) this.setState(this.guard ? 'guard' : 'wander');
        }
        if (!playerHidden && this.canSee(ctx, dist)) this.startChase(ctx);
        break;
      }
      case 'lurk': {
        // you're indoors: it circles, loses conviction, drifts away
        if (!playerHidden) { this.startChase(ctx); break; }
        // a3-1: a powered shelter's own light draws them up to the windows to
        // look in, instead of blindly circling the walls
        if (ctx.isPowered && !this.guard && ctx.claimPost && ctx.claimPost(this)) {
          this.setState('gather'); break;
        }
        const hc = ctx.houseCenter;
        const ang = Math.atan2(this.pos.z - hc.z, this.pos.x - hc.x) + dt * 0.22;
        const rad = 15.5;
        const tx = hc.x + Math.cos(ang) * rad, tz = hc.z + Math.sin(ang) * rad;
        moveDir = _move.set(tx - this.pos.x, 0, tz - this.pos.z);
        if (moveDir.lengthSq() > 0.04) moveDir.normalize(); else moveDir = null;
        moveSpeed = spec.walk * 1.1 || 0.9;
        faceDir = toPlayer;
        if (this.stateT > 14) this.setState('retreat');
        break;
      }
      case 'retreat': {
        if (!this._away) {
          const a = Math.random() * Math.PI * 2;
          this._away = new THREE.Vector3(this.pos.x + Math.cos(a) * 50, 0, this.pos.z + Math.sin(a) * 50);
        }
        moveDir = _move.subVectors(this._away, this.pos).normalize();
        moveSpeed = spec.walk * 1.4 || 1.1;
        if (!playerHidden && this.canSee(ctx, dist)) { this._away = null; this.startChase(ctx); }
        break;
      }
      case 'abduct': {
        // hunt the prey NPC (Mara), not Ana. Approach at a slow, dread pace and
        // then LOOM over her — the story's rescue timer decides her fate, so the
        // player gets a fair window to photograph it. The flash is the only thing
        // that saves her: enough exposures dissolve it via the normal
        // exposeToFlash path. Being near it does nothing.
        if (!this.prey) { this.setState('wander'); break; }
        const toPrey = _move.set(this.prey.x - this.pos.x, 0, this.prey.z - this.pos.z);
        const pd = toPrey.length();
        faceDir = _face.copy(toPrey);   // un-normalized copy (was toPrey.clone()) — kept live while _move is normalized below
        if (pd > 1.3) { moveDir = toPrey.normalize(); moveSpeed = 1.7; }
        break;
      }
      case 'stagger': {
        moveSpeed = 0;
        // an abductor staggered by a flash goes back to reaching for Mara, not
        // after Ana (the normal chase target)
        if (this.stateT > spec.stagger) this.setState(this.abduct ? 'abduct' : 'chase');
        break;
      }
      case 'dying': {
        moveSpeed = 0;
        this.dying = Math.min(1, this.stateT / 0.95);
        const k = this.dying;
        // it loses the argument: stretched into a vertical smear, white-hot
        // at the middle of the correction, then nothing
        this.group.scale.set(Math.max(0.02, 1 - k), 1 + k * 1.9, Math.max(0.02, 1 - k));
        this.group.position.y = this.pos.y + k * 1.1;
        for (const m of this.P.mats) m.opacity = 1 - k;
        this.P.bodyMat.emissiveIntensity = k * (1 - k) * 5;
        for (const m of this.P.smearMats) m.opacity = Math.max(0, (m.userData.base ?? 0.3) * (1 - k * 1.4));
        this.P.drips.mat.opacity = 0.3 * (1 - k);
        break;
      }
    }

    if (this.scripted && this.state !== 'manifest' && this.state !== 'dying') {
      moveDir = _move.copy(toPlayer).normalize();   // was toPlayer.clone().normalize(); faceDir keeps the un-normalized toPlayer (_toPlayer)
      moveSpeed = 1.15;
      faceDir = toPlayer;
    }

    // misregistration: when it is close, chasing, and not pinned by your
    // eyes, the image sometimes lands a step to one side of where it was
    if (this.state === 'chase' && !this._seen && dist > 5 && dist < 26 &&
      this.kind !== 'archivero') {
      this.glitchT -= dt;
      if (this.glitchT <= 0) {
        this.glitchT = 2.5 + Math.random() * 4;
        const px = -toPlayer.z / Math.max(dist, 1e-3), pz = toPlayer.x / Math.max(dist, 1e-3);
        const step = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.35);
        const solved = ctx.colliders.resolve(this.pos.x + px * step, this.pos.z + pz * step, 0.5);
        if (ctx.ground(solved.x, solved.z) > -0.1) { this.pos.x = solved.x; this.pos.z = solved.z; }
      }
    }

    // ---- movement + obstacle handling
    let speedNow = 0;
    if (moveDir && moveSpeed > 0) {
      // firelight and lanterns repel them — hearths are old technology
      for (const sp of ctx.safeSpots) {
        const dx = this.pos.x - sp.x, dz = this.pos.z - sp.z;
        const d = Math.hypot(dx, dz);
        if (d < sp.r && d > 1e-3) {
          const push = (1 - d / sp.r) * 2.2;
          moveDir.x += (dx / d) * push;
          moveDir.z += (dz / d) * push;
          moveDir.normalize();
        }
      }
      if (this.detour > 0) {
        this.detour -= dt;
        const a = Math.PI / 2.6 * this.detourSign;
        const cs = Math.cos(a), sn = Math.sin(a);
        // rotate into a SEPARATE scratch so a faceDir that aliases moveDir (gather at
        // the window) keeps its pre-detour value, exactly as the old `new Vector3` did
        moveDir = _move2.set(moveDir.x * cs - moveDir.z * sn, 0, moveDir.x * sn + moveDir.z * cs);
      }
      let nx = this.pos.x + moveDir.x * moveSpeed * dt;
      let nz = this.pos.z + moveDir.z * moveSpeed * dt;
      // never wade, never phase into the house (0.9m standoff from its walls)
      if (ctx.ground(nx, nz) < -0.1 || (!this.allowHouse && ctx.insideHouseM(nx, nz, 0.9))) {
        nx = this.pos.x; nz = this.pos.z; this.stuck += dt * 2;
      }
      const solved = ctx.colliders.resolve(nx, nz, 0.5, -Infinity, Infinity, _solvedMove);
      const movedSq = (solved.x - this.pos.x) ** 2 + (solved.z - this.pos.z) ** 2;
      const wantSq = (moveSpeed * dt) ** 2;
      if (movedSq < wantSq * 0.2) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
      if (this.stuck > 0.45) {
        this.stuck = 0;
        // probe both tangents, walk the clearer one
        const probe = (sign) => {
          const a = Math.PI / 2 * sign;
          const dx = moveDir.x * Math.cos(a) - moveDir.z * Math.sin(a);
          const dz = moveDir.x * Math.sin(a) + moveDir.z * Math.cos(a);
          const r = ctx.colliders.resolve(this.pos.x + dx * 1.2, this.pos.z + dz * 1.2, 0.5);
          return (r.x - this.pos.x) ** 2 + (r.z - this.pos.z) ** 2;
        };
        this.detourSign = probe(1) >= probe(-1) ? 1 : -1;
        this.detour = 0.7 + Math.random() * 0.6;
      }
      speedNow = Math.sqrt(movedSq) / Math.max(dt, 1e-4);
      this.pos.x = solved.x; this.pos.z = solved.z;
      if (!faceDir) faceDir = moveDir;
    }
    this.pos.y = ctx.ground(this.pos.x, this.pos.z);
    if (this.state !== 'dying') this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    else { this.group.position.x = this.pos.x; this.group.position.z = this.pos.z; }

    if (faceDir && faceDir.lengthSq() > 0.001) {
      const targetYaw = Math.atan2(faceDir.x, faceDir.z);
      let dy = targetYaw - this.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.group.rotation.y += dy * Math.min(1, dt * 5);
    }

    this.animate(dt, t, ctx, toPlayer, dist, speedNow);

    // E1 · per-monster procedural voice, gated by proximity + state (see method)
    this.updateUtter(dt, ctx, dist);

    // ---- touch (abductors harm only their prey, handled in the abduct state)
    if (!this.abduct && dist < 1.25 && this.touchCd <= 0 &&
      this.state !== 'manifest' && this.state !== 'stagger' && this.state !== 'dying') {
      this.touchCd = 1.6;
      ctx.onTouch(this);
    }
  }

  // E1 · per-monster utterance SCHEDULER. Decrement this enemy's countdown; when
  // it fires, if the Returned is AUDIBLE (within UTTER_RANGE) and in an
  // active/present state, ask the Director to voice it (ctx.onUtter), then reset to
  // a RANDOMIZED interval that scales with closeness + agitation — chase-close is
  // frequent, idle-far is rare — so it is never rigidly periodic. manifest / dying
  // / stagger stay silent (they own their sounds / are being corrected); demo
  // Returned never reach here (update early-returns). Allocation-free: the timer is
  // a scalar; the Director adds the global min-gap + nearest-only cap.
  updateUtter(dt, ctx, dist) {
    this._utterT -= dt;
    if (this._utterT > 0) return;
    const st = this.state;
    const active = st === 'wander' || st === 'chase' || st === 'guard' ||
      st === 'lurk' || st === 'search' || st === 'gather' || st === 'retreat' || st === 'abduct';
    if (!active || dist > UTTER_RANGE) {
      // out of range or in a silent state → no voice; re-check again soon (cheap)
      this._utterT = 1.5 + Math.random() * 2;
      return;
    }
    // E2 · carry the Half-Seen's stare-pressure so the voice dispatcher can pick
    // the pinned rattle. Harmless for other kinds (their _pin/_lunge stay 0).
    ctx.onUtter?.(this, { dist, state: st, pin: this._pin, lunge: this._lunge });
    // cadence: chasing is agitated (short band); closeness shortens the gap further,
    // distance stretches it out. chase-close ~1.5–4.5 s; idle/wander-far ~10–15 s.
    const near = 1 - dist / UTTER_RANGE;                    // 0 far … 1 point-blank
    const chasing = st === 'chase' || st === 'abduct';
    const min = chasing ? 1.5 : 4;
    const span = chasing ? 3 : 5;                           // random jitter on top of min
    const stretch = (1 - near) * (chasing ? 3 : 6);         // farther = longer gaps
    this._utterT = min + stretch + Math.random() * span;
  }

  startChase(ctx) {
    this.setState('chase');
    this.lastSeen.copy(ctx.playerPos);
    this.lostT = 0;
    // F4 · plant the archivero's tether where it stands as it begins to attend
    this._root.copy(this.pos);
    if (!this.screamed) { this.screamed = true; ctx.onScream(this); }
  }

  // c4 · TEACHING SIGHTING. A distant, one-time, non-lethal demonstration of a
  // single Returned's tell. It rises from the wet ground, performs ONLY its
  // tell, and then leaves — it never chases, never touches Ana, and is kept far
  // enough away that its fear aura never bites. Managed one-per-kind by story.js.
  updateDemo(dt, ctx, toPlayer, dist) {
    const rise = Math.min(1, this.stateT / 1.3);
    const e = 1 - Math.pow(1 - rise, 3);
    this.group.scale.y = Math.max(0.001, e);
    this.group.scale.x = this.group.scale.z = 0.6 + e * 0.4;
    if (rise < 1) {
      this.P.ripple.scale.setScalar(0.4 + e * 1.3);
      this.P.ripple.material.opacity = 0.26 * (1 - e);
    } else {
      this.P.ripple.material.opacity = 0;
      if (this.state === 'manifest') this.state = 'demo';
    }

    const seen = this._seen;
    let moveDir = null, moveSpeed = 0;
    if (rise >= 1) {
      if (this.kind === 'doble') {
        // THE DRAFT: perfectly still while watched; closes the gap ONLY off-camera.
        // Scripted to stop short and vanish before it could ever reach her.
        if (!seen && dist > this.demoStop) { moveDir = toPlayer; moveSpeed = 1.3; }
        if (dist <= this.demoStop) this.demoExpire = true;
      } else if (this.kind === 'archivero') {
        // THE CONGREGATION: never advances. It waits to be seen. Gone before she arrives.
        if (dist < this.demoStop) this.demoExpire = true;
      } else {
        // THE HALF-SEEN: holds under her gaze, then slips off the instant she
        // looks away — but only once she's had a proper look at it.
        if (seen) { this._demoEverSeen = true; this._awayT = 0; }
        else if (this._demoEverSeen) {
          this._awayT += dt;
          if (this._awayT > 0.5) this.demoExpire = true;
        }
      }
    }

    if (moveDir && moveSpeed > 0) {
      // demo path skips the state switch, so `_move` is free here; must not alias
      // `_toPlayer` (moveDir) which is still read below for the facing yaw
      const dir = _move.set(moveDir.x, 0, moveDir.z);
      if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        let nx = this.pos.x + dir.x * moveSpeed * dt;
        let nz = this.pos.z + dir.z * moveSpeed * dt;
        if (ctx.ground(nx, nz) < -0.1 || ctx.insideHouseM(nx, nz, 0.9)) { nx = this.pos.x; nz = this.pos.z; }
        const solved = ctx.colliders.resolve(nx, nz, 0.5);
        this.pos.x = solved.x; this.pos.z = solved.z;
      }
    }
    this.pos.y = ctx.ground(this.pos.x, this.pos.z);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);

    // it always faces Ana
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    let dy = targetYaw - this.group.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.group.rotation.y += dy * Math.min(1, dt * 4);

    if (this.stateT > this.demoMaxLife) this.demoExpire = true;

    this.animate(dt, this.anim, ctx, toPlayer, dist, 0);
  }

  // ------------------------------------------------------------- animation
  animate(dt, t, ctx, toPlayer, dist, speedNow) {
    const P = this.P;
    this._speedNow = speedNow;   // D1: hand the SMOOTH tatter layer the live speed
    const chase = this.state === 'chase';
    const isArch = this.kind === 'archivero';
    const isDoble = this.kind === 'doble';
    // the Draft crawls only while unwatched; caught by your eyes it stands
    // up into somebody's silhouette and holds it, perfectly, wrongly still
    const standing = isDoble && (this._seen || this.state === 'stagger' || (!chase && this.state !== 'search'));
    const crawl = isDoble && !standing;
    // B3 · stash the watched-still flag so poseIndependent() can suppress the
    // breath/footfall-jiggle for the doble whose stillness is the tell.
    this._standing = standing;

    // D2 · only the normal locomotion states route the limbs through the eased
    // pose-blend. manifest (the rise), dying (the vertical smear) and stagger
    // (the recoil) keep their own direct/decaying animation — blending would
    // smear it — so they pose directly, exactly as before.
    this._blendActive = this.state !== 'manifest' && this.state !== 'dying' && this.state !== 'stagger';

    // C4 · advance the crawl<->stand transition EVERY frame (animate() is the
    // per-frame entry). A flip no longer teleports the pose: t01 springs toward
    // its goal (1 stand / 0 crawl) so the torso RISES / COLLAPSES through real
    // intermediate poses. UP is a fast, slightly-overshooting rear-up; DOWN a
    // quick, looser drop. Effect states (manifest/dying/stagger) pose directly,
    // so t01 is PINNED to the endpoint there — those states stay unchanged.
    const t01goal = standing ? 1 : 0;
    if (isDoble) {
      if (!this._blendActive) { this._t01.x = t01goal; this._t01.v = 0; }
      else springScalar(this._t01, t01goal, dt, t01goal ? T01_UP_K : T01_DN_K, t01goal ? T01_UP_DAMP : T01_DN_DAMP);
    }
    // mid-transition the pose must ride the SMOOTH t01 ramp, not the stepped pose
    // clock — force a fresh tick every frame and snap the blend straight onto the
    // mix (no D2 lag layered on the spring). Settled at an endpoint → normal cadence.
    const transitioning = isDoble && this._blendActive && Math.abs(this._t01.x - t01goal) > 0.002;

    // STOP-MOTION: limbs update at a per-kind pose rate and hold between
    // frames, while the body glides smoothly — the mismatch is the horror
    this._gaitAcc = (this._gaitAcc ?? 0) + speedNow * dt;
    this._smT = (this._smT ?? Math.random() * 0.1) + dt;
    const STEP = 1 / this.spec.fps;
    // dropped frames: sometimes the puppet holds a pose a beat too long,
    // then arrives further along than it should
    if (this._hold > 0 && this._smT >= STEP) { this._hold--; this._smT = 0; }
    const tickPose = this._smT >= STEP || !this._posed || transitioning;
    if (!tickPose) {
      this.poseIndependent(dt, t, ctx, toPlayer, dist, chase);
      return;
    }
    this._smT %= STEP;
    this._posed = true;
    if (Math.random() < 0.07 && this.state !== 'stagger') this._hold = 1 + (Math.random() < 0.3 ? 1 : 0);

    this.gait += this._gaitAcc * (crawl ? 4.6 : isArch ? 1.9 : 2.3);
    this._gaitAcc = 0;
    const jit = () => (Math.random() - 0.5) * 0.055;   // per-frame puppet error
    const ph = this.gait;
    const targetAmp = Math.min(1, speedNow / (this.spec.chase * 0.7 + 0.3));
    this.walkAmp += (targetAmp - this.walkAmp) * Math.min(1, STEP * 6);
    const amp = this.walkAmp;

    const sw = Math.sin(ph) + jit(), swb = Math.sin(ph + Math.PI) + jit();

    // D2 · snapshot the limbs as they are NOW (the previous, held pose). The
    // pose if/else below overwrites them with this tick's fresh TARGET, which
    // we capture — and then restore the bones to prev — just before
    // poseIndependent(), so its per-frame apply-step eases prev -> target.
    if (this._blendActive) this._readPose(this._prevPose);

    if (isArch) {
      // F3 · the Drowned Choir-Column doesn't walk — it SINGS and SWELLS. The
      // peristaltic swell wave, sea-organ undulation and lean toward the player
      // all run CONTINUOUSLY on the smooth poseIndependent layer (below), driven
      // mostly by bone SCALE (never a blend channel) so the travelling bulge is
      // never stepped/eased by the 8 fps pose clock. This tick only lays a stable
      // NEUTRAL base for the eased blend channels (hips.y / hips.z / spine.x /
      // neck.x); the smooth layer composes the living motion on top. (P.hands and
      // P.xheads are empty since F1 — the column is one continuous pillar.)
      P.hips.position.y = 0.01;
      P.spine.rotation.x = 0.03;
      P.hips.rotation.z = 0;
      P.neck.rotation.x = -0.05;
    } else if (isDoble) {
      // C4 · crawl<->stand BRIDGE. Compute BOTH the full crawl (t01=0) and full
      // stand (t01=1) target poses for every shared bone, then write the eased
      // blend by t01 so a flip reads as a torso rising / collapsing through real
      // intermediate poses — spine straightening, hips rising, arms coming off
      // the forelegs to the sides, neck un-craning — not a teleport. At e=0 this
      // is byte-for-byte the old C2 crawl pose (incl. the dist-graded neck crane,
      // folded in as cNeckX); at e=1 it is byte-for-byte the old C3 stand pose.
      // The t01 spring supplies the ease + a slight over-extend/settle at the top,
      // so no extra smoothstep is layered on. Endpoint values are untouched.
      const e = Math.max(-0.25, Math.min(1.25, this._t01.x));   // spring may over-extend slightly at the top; bound it
      // ---- crawl targets (was the `crawl` branch): fast WRONG quadruped scuttle.
      // Diagonal gait; sw>0 = the pull half of a foreleg's cycle (hand planted,
      // dragging the body forward = weight). Lateral spine wave + neck strain-
      // tremor still ride the smooth poseIndependent layer, scaled by (1-t01).
      const plant0 = Math.max(0, sw), plant1 = Math.max(0, swb);
      const cHipY = P.hipY * 0.6 + Math.abs(Math.sin(ph * 2)) * 0.075 * amp;   // low crouch + vertical bob
      const cHipZ = Math.sin(ph) * 0.13 * amp;                                 // once-per-stride side roll
      const cSpineX = 1.06 + Math.sin(ph * 2 + 0.5) * 0.17 * amp;              // hunch↔extend flex wave
      const cNeckX = dist < 14                                                 // dist-graded crane (was the post-block override)
        ? -1.4 - Math.min(1, (14 - dist) / 12) * 0.22                          // -1.4 → ~-1.62 near contact
        : dist < 22 ? -0.85 - ((22 - dist) / 8) * 0.55 : -0.85;               // -0.85 → -1.4 approaching
      const cSh0X = -2.0 + sw * 0.85 * amp, cSh1X = -2.0 + swb * 0.85 * amp;   // forelegs reach→plant→pull
      const cSh0Z = 0.06 + plant0 * 0.3 * amp, cSh1Z = -0.06 - plant1 * 0.3 * amp;  // scapula spread on plant
      const cEl0 = -0.25 - plant0 * 0.6 * amp, cEl1 = -0.25 - plant1 * 0.6 * amp;   // elbow compress on plant
      const cHj0 = -1.15 + swb * 0.75 * amp, cHj1 = -1.15 + sw * 0.75 * amp;   // hindlegs diagonal gather/push
      const cKn0 = 1.5 + Math.max(0, swb) * 0.45 * amp, cKn1 = 1.5 + Math.max(0, sw) * 0.45 * amp;
      // ---- stand targets (was the `standing` branch): upright, neutral, arms at
      // its sides. A person standing in the fog. It does not breathe or sway.
      const sHipY = P.hipY, sHipZ = 0, sSpineX = 0.04, sNeckX = -0.06;
      const sSh0X = 0.05, sSh0Z = 0.06, sSh1X = -0.03, sSh1Z = -0.05;
      const sEl0 = -0.08, sEl1 = -0.1, sHj0 = 0.02, sHj1 = -0.02, sKn0 = 0.03, sKn1 = 0.03;
      // ---- blend crawl → stand by eased t01 (endpoints exact at e=0 / e=1)
      P.hips.position.y = poseLerp(cHipY, sHipY, e);
      P.hips.rotation.z = poseLerp(cHipZ, sHipZ, e);
      P.spine.rotation.x = poseLerp(cSpineX, sSpineX, e);
      P.neck.rotation.x = poseLerp(cNeckX, sNeckX, e);
      P.shoulders[0].rotation.x = poseLerp(cSh0X, sSh0X, e); P.shoulders[0].rotation.z = poseLerp(cSh0Z, sSh0Z, e);
      P.shoulders[1].rotation.x = poseLerp(cSh1X, sSh1X, e); P.shoulders[1].rotation.z = poseLerp(cSh1Z, sSh1Z, e);
      P.elbows[0].rotation.x = poseLerp(cEl0, sEl0, e);
      P.elbows[1].rotation.x = poseLerp(cEl1, sEl1, e);
      P.hipsJ[0].rotation.x = poseLerp(cHj0, sHj0, e);
      P.hipsJ[1].rotation.x = poseLerp(cHj1, sHj1, e);
      P.knees[0].rotation.x = poseLerp(cKn0, sKn0, e);
      P.knees[1].rotation.x = poseLerp(cKn1, sKn1, e);
    } else {
      const pinned = this.kind === 'testigo' && this._pin > 0.2 && chase;
      const lunging = this.kind === 'testigo' && this._lunge > 0 && chase;
      const lean = lunging ? 0.55 : chase ? 0.34 : 0.06;
      P.spine.rotation.x = lean;   // B3: breath moved to the smooth poseIndependent layer
      P.hips.position.y = P.hipY - Math.abs(Math.sin(ph)) * 0.06 * amp;
      P.hips.rotation.z = Math.sin(ph) * 0.05 * amp;
      P.hipsJ[0].rotation.x = sw * 0.6 * amp;
      P.hipsJ[1].rotation.x = swb * 0.6 * amp;
      P.knees[0].rotation.x = Math.max(0, Math.sin(ph - 0.7)) * 0.85 * amp;
      P.knees[1].rotation.x = Math.max(0, Math.sin(ph + Math.PI - 0.7)) * 0.85 * amp;
      if (pinned) {
        // pinned mid-reach by your stare: leaning at you, arms half-raised,
        // trembling with the effort of being seen
        const tr = () => (Math.random() - 0.5) * 0.16 * this._pin;
        P.spine.rotation.x = 0.42 + tr() * 0.4;
        P.shoulders[0].rotation.x = -0.9 + tr();
        P.shoulders[1].rotation.x = -1.05 + tr();
        P.shoulders[0].rotation.z = 0.18; P.shoulders[1].rotation.z = -0.22;
        P.elbows[0].rotation.x = -0.5 + tr();
        P.elbows[1].rotation.x = -0.4 + tr();
      } else if (this.kind === 'testigo' && chase) {
        // arms rise to reach
        P.shoulders[0].rotation.x = -1.25 + Math.sin(t * 8.5) * 0.08;
        P.shoulders[1].rotation.x = -1.32 - Math.sin(t * 7.7) * 0.08;
        P.shoulders[0].rotation.z = 0.1; P.shoulders[1].rotation.z = -0.12;
        P.elbows[0].rotation.x = -0.28;
        P.elbows[1].rotation.x = -0.22;
      } else {
        P.shoulders[0].rotation.x = swb * 0.42 * amp;
        P.shoulders[1].rotation.x = sw * 0.42 * amp;
        P.shoulders[0].rotation.z = 0.08; P.shoulders[1].rotation.z = -0.08;
        P.elbows[0].rotation.x = -0.22 - Math.max(0, swb) * 0.3 * amp;
        P.elbows[1].rotation.x = -0.22 - Math.max(0, sw) * 0.3 * amp;
      }
      P.neck.rotation.x = -0.12;
    }

    // long fingers worry at the air on the puppet clock. The TESTIGO's fingers
    // are driven separately on the SMOOTH poseIndependent layer (B4: a sprung
    // reach/grasp coordinated with _lunge/_pin); only the doble/archivero keep
    // this plain stop-motion twitch, unchanged.
    if (this.kind !== 'testigo') {
      for (const f of P.fingers) {
        const u = f.userData;
        const twitch = chase || this.state === 'stagger' ? 0.2 : 0.07;
        f.rotation.x = 0.18 + Math.sin(t * 11 + u.ph + u.fi) * twitch + jit();
      }
    }

    // stagger recoil pose
    if (this.state === 'stagger') {
      const k = Math.max(0, 1 - this.stateT * 1.6);
      P.spine.rotation.x = -0.45 * k + 0.05;
      if (P.shoulders.length) {
        P.shoulders[0].rotation.x = -2.5 * k;
        P.shoulders[1].rotation.x = -2.4 * k;
        P.elbows[0].rotation.x = -1.4 * k;
        P.elbows[1].rotation.x = -1.5 * k;
      }
      // the congregation recoils as one — every face would turn to you at once.
      // F1's choir-column has no separate xheads, so this sweep no-ops (P.xheads
      // is empty); the whole-column yaw snap below turns its faces instead.
      if (isArch && k > 0.1) {
        const targetYaw = Math.atan2(toPlayer.x, toPlayer.z) - this.group.rotation.y;
        const y = Math.max(-1.2, Math.min(1.2, Math.atan2(Math.sin(targetYaw), Math.cos(targetYaw))));
        for (const xh of P.xheads) { xh.rotation.y = y; xh.userData.yaw = y; xh.userData.nt = t + 2 + Math.random() * 2; }
      }
    }

    // head SNAPS toward you in discrete jerks — never smoothly
    if (dist < 30) {
      const targetYaw = Math.atan2(toPlayer.x, toPlayer.z) - this.group.rotation.y;
      const delta = Math.atan2(Math.sin(targetYaw), Math.cos(targetYaw));
      const clamped = Math.max(-1.15, Math.min(1.15, delta));
      this.headYaw += (clamped - this.headYaw) * (Math.random() < 0.25 ? 1 : 0.5);
    } else {
      this.headYaw *= 0.7;
    }
    P.head.rotation.y = this.headYaw + jit() * 0.6;
    P.head.rotation.z = P.headTilt + Math.sin(t * 0.31) * 0.1 +
      (this.kind === 'testigo' && this._pin > 0.2 ? Math.sin(t * 0.9) * 0.3 : 0);
    // B5 · the stepped layer just wrote a CLEAN head.z base (no tremor). Zero the
    // tremor bookkeeping so poseIndependent()'s idempotent per-frame delta doesn't
    // over-subtract on this tick (the fine tremor is re-added there every frame).
    this._hTremZ = 0;
    // C2/C4 · the crawling doble wrenches its head up to keep its face on you,
    // craning HARDER the closer it gets. That dist-graded crane is now computed
    // as cNeckX inside the doble mix branch above and blended with the standing
    // neck by t01 (so it un-cranes as the body rears up), instead of a separate
    // post-pass override here. poseIndependent() still layers the fine strain-
    // tremor on top when close, scaled down as t01 rises.

    // B2 · the hair (like the tatters, D1) now moves on the SMOOTH per-frame
    // layer in poseIndependent — spring-driven trail/swing + part-on-lunge —
    // instead of stepping on the 6-11 fps stop-motion clock. See the drive there.

    // D2 · the locomotion pose is now fully written (INCLUDING the crawl neck
    // crane, folded into the doble mix above). Capture it as the blend TARGET,
    // then restore the limbs to prev; poseIndependent()'s apply-step eases
    // prev -> target from here. The head-yaw snap and finger twitch written
    // above are NOT channels, so they hold their snapped values untouched. The first primed tick (spawn) shows the target
    // immediately instead of blending in from a stale pose. C4 · WHILE the doble
    // is mid crawl<->stand transition we snap prev->target every frame too, so
    // the eased t01 ramp drives the pose with no D2 lag stacked on the spring.
    if (this._blendActive) {
      this._readPose(this._targetPose);
      if (!this._blendPrimed || transitioning) {
        this._prevPose.set(this._targetPose);
        this._blendPrimed = true;
        this._blendT = this._blendDur;   // fully advanced: apply-step lands on target
      } else {
        this._writePose(this._prevPose);
        this._blendT = 0;
      }
    }

    this.poseIndependent(dt, t, ctx, toPlayer, dist, chase);
  }

  // D2 · read/write the locomotion DOF into/out of a preallocated scalar array.
  _readPose(out) {
    const ch = this._blendChans;
    for (let i = 0; i < ch.length; i++) out[i] = ch[i].o[ch[i].k];
  }
  _writePose(src) {
    const ch = this._blendChans;
    for (let i = 0; i < ch.length; i++) ch[i].o[ch[i].k] = src[i];
  }

  // effects that stay smooth while the limbs hold their held pose
  poseIndependent(dt, t, ctx, toPlayer, dist, chase) {
    const P = this.P;

    // D2 · advance + apply the eased pose-blend EVERY frame (this runs on both
    // ticked and held frames, since animate() calls poseIndependent() in both
    // paths). The limbs ease prev -> target over _blendDur (= BLEND_FRAC of the
    // tick interval), then HOLD once b saturates — the residual hold is the
    // faint step. Skipped for manifest/dying/stagger (they pose directly).
    if (this._blendActive) {
      this._blendT += dt;
      const b = this._blendDur > 0 ? Math.min(1, this._blendT / this._blendDur) : 1;
      const e = b * b * (3 - 2 * b);   // smoothstep
      const ch = this._blendChans, pv = this._prevPose, tg = this._targetPose;
      for (let i = 0; i < ch.length; i++) ch[i].o[ch[i].k] = pv[i] + (tg[i] - pv[i]) * e;
    }

    // ---- B3 · body secondary motion: footfall flesh-jiggle + breathing.
    // ADDITIVE on top of the eased D2 pose — must run AFTER the blend-apply
    // above or the blend overwrites it. Track the blended hip height every
    // frame (unconditionally) so the footfall driver has a continuous vertical
    // velocity even across a crawl<->stand pose flip.
    const isArch = this.kind === 'archivero';
    const isDoble = this.kind === 'doble';
    // C2 · sculpted base twist of the spine (set once in buildRig). Captured
    // before the crawl wave below ever writes spine.z, so the wave rides on it
    // and the standing/effect states can relax cleanly back to it.
    if (isDoble && this._spineZBase === undefined) this._spineZBase = P.spine.rotation.z;
    const hipY = P.hips.position.y;
    const hipVel = (hipY - (this._hipYPrev ?? hipY)) / Math.max(dt, 1e-4);
    this._hipYPrev = hipY;
    // Suppressed for: the archivero (its own glide branch), the watched-standing
    // doble (its dead-stillness IS the tell — "it does not breathe, it does not
    // sway"), and the effect states (manifest/dying/stagger pose directly, so
    // _blendActive is false there and they keep their own animation).
    if (this._blendActive && !isArch && !(isDoble && this._standing)) {
      const move = Math.min(1, (this._speedNow || 0) / (this.spec.chase * 0.7 + 0.3));
      // footfall flesh-jiggle: a lightly-damped spring on a spine-pitch offset,
      // kicked by the hip's vertical velocity — the emaciated torso lags each
      // footfall, overshoots and settles. Scaled by speed → ~0 when standing.
      if (!this._jiggle) this._jiggle = { x: 0, v: 0 };
      springScalar(this._jiggle, -hipVel * 0.5 * move, dt, 90, 8);
      P.spine.rotation.x += this._jiggle.x;
      // breathing: a slow diaphragm cycle. Chest (spine) rises/falls, a subtle
      // clavicle/shoulder rise and a tiny hip settle; the neck counter-rotates
      // so the head stays level (no head bob). Barely perceptible — a life cue.
      const br = Math.sin(t * 1.45);
      P.spine.rotation.x += br * 0.032;
      P.neck.rotation.x -= br * 0.012;
      if (P.shoulders[0]) P.shoulders[0].rotation.x += br * 0.014;
      if (P.shoulders[1]) P.shoulders[1].rotation.x += br * 0.014;
      P.hips.position.y += br * 0.006;
    }

    // ---- F3 · the Drowned Choir-Column's PERISTALTIC SWELL + attend/LEAN. Runs
    // every frame on this smooth layer (the column has no stop-motion walk to
    // preserve) AFTER the blend-apply, so it composes on the eased blend base. A
    // travelling radial bulge climbs the chain and vertically stretches each
    // segment's faces so the carved mouths GAPE in sequence; a gentle sea-organ
    // undulation and a sprung lean toward Ana ride on top. Relaxed during
    // stagger/dying so it never fights the recoil / vertical smear into a
    // grotesque shape (see the SWELL_* constants + note up top).
    if (isArch) {
      if (!this._archChain) this._archChain = [P.hips, P.spine, P.seg1, P.seg2, P.neck, P.head];
      // swell amplitude by state: full while alive; faded out for the recoil;
      // off while dissolving (the group is being stretched into the vertical
      // smear); gentle-ramping while the reef is still rising from the water.
      let swellAmt = 1;
      if (this.state === 'dying') swellAmt = 0;
      else if (this.state === 'stagger') swellAmt = Math.max(0, 1 - this.stateT * 2.2);
      else if (this.state === 'manifest') swellAmt = Math.min(1, this.stateT / 1.3) * 0.5;
      // the wave phase climbs with time, a touch faster as it glides
      const move = Math.min(1, (this._speedNow || 0) / (this.spec.walk + 0.3));
      this._swellPh = (this._swellPh ?? Math.random() * 6.28) + dt * (SWELL_SPEED + move * SWELL_MOVE);
      const chain = this._archChain;
      for (let i = 0; i < chain.length; i++) {
        const b = chain[i];
        if (!b) continue;
        const segAmp = (i === chain.length - 1 ? SWELL_HEAD : 1) * swellAmt;
        const s = Math.sin(this._swellPh - i * SEG_LAG);       // per-segment phase LAG → bulge climbs
        const crest = s > 0 ? s : 0;                           // stretch only at the crest, never pinch shut
        b.scale.x = b.scale.z = 1 + SWELL_RADIAL * s * segAmp; // radial pulse — the bulge
        b.scale.y = 1 + SWELL_Y * crest * segAmp;              // vertical stretch → mouths gape as it passes
      }
      // sea-organ undulation + attend/LEAN toward the player, ONLY in the live
      // locomotion states (manifest/stagger/dying pose directly and must stay a
      // straight column). spine.x / neck.x are eased blend channels → we += on
      // them; seg1/seg2/neck.z are ours alone → set absolutely (base 0 + lean +
      // sway). spine.z keeps its per-instance sculpt twist untouched.
      if (this._blendActive) {
        let leanX = 0, leanZ = 0;
        if (dist < ARCH_LEAN_RANGE &&
          ctx.colliders.losClear(this.pos.x, this.pos.z, ctx.playerPos.x, ctx.playerPos.z)) {
          const localA = Math.atan2(toPlayer.x, toPlayer.z) - this.group.rotation.y;
          const g = ARCH_LEAN * Math.max(0, 1 - dist / ARCH_LEAN_RANGE);
          leanX = Math.cos(localA) * g;    // +rot.x tips the top toward +z (forward, toward her when facing)
          leanZ = -Math.sin(localA) * g;   // tip sideways toward her bearing (−rot.z tips top toward +x)
        }
        if (!this._archLeanX) { this._archLeanX = { x: 0, v: 0 }; this._archLeanZ = { x: 0, v: 0 }; }
        const lx = springScalar(this._archLeanX, leanX, dt, ARCH_LEAN_K, ARCH_LEAN_DAMP);
        const lz = springScalar(this._archLeanZ, leanZ, dt, ARCH_LEAN_K, ARCH_LEAN_DAMP);
        // travelling lateral undulation, phase-lagged up the chain (inlined — no
        // per-frame closure alloc). Slower than the swell so it reads as a sway.
        const swb = this._swellPh * 0.55, sf = SEG_LAG * 0.7, swA = SWELL_SWAY * swellAmt;
        P.spine.rotation.x += lx * 0.28;                       // eased blend channel → +=
        if (P.seg1) { P.seg1.rotation.x = lx * 0.24; P.seg1.rotation.z = lz * 0.24 + Math.sin(swb - sf) * swA; }
        if (P.seg2) { P.seg2.rotation.x = lx * 0.24; P.seg2.rotation.z = lz * 0.24 + Math.sin(swb - 2 * sf) * swA; }
        P.neck.rotation.x += lx * 0.24;                        // eased blend channel → +=
        P.neck.rotation.z = lz * 0.24 + Math.sin(swb - 3 * sf) * swA;   // ours alone → absolute
      } else if (this.state === 'manifest') {
        // rising reef: the upper chain is bowed under the water and UNFURLS
        // upright as it breaches — the head lifts last. `fold` (1→0) decays as
        // the rise (e) completes; the head bows forward then straightens.
        const fold = Math.pow(1 - Math.min(1, this.stateT / 1.3), 3);
        if (P.seg1) { P.seg1.rotation.x = fold * 0.20; P.seg1.rotation.z = 0; }
        if (P.seg2) { P.seg2.rotation.x = fold * 0.26; P.seg2.rotation.z = 0; }
        P.neck.rotation.x = -0.05 + fold * 0.40;
        P.neck.rotation.z = 0;
        if (this._archLeanX) { this._archLeanX.x = 0; this._archLeanX.v = 0; this._archLeanZ.x = 0; this._archLeanZ.v = 0; }
      } else if (this._archLeanX) {
        // stagger/dying: bleed the lean + our absolute channels back toward
        // neutral so the recoil / vertical smear runs on a straight column.
        this._archLeanX.x *= 0.85; this._archLeanX.v = 0;
        this._archLeanZ.x *= 0.85; this._archLeanZ.v = 0;
        if (P.seg1) { P.seg1.rotation.x *= 0.82; P.seg1.rotation.z *= 0.82; }
        if (P.seg2) { P.seg2.rotation.x *= 0.82; P.seg2.rotation.z *= 0.82; }
        P.neck.rotation.z *= 0.82;
      }
    }

    // ---- C3 · the watched-standing doble's "wrong-stillness" micro-settle.
    // The DEFAULT is dead still (B3: it does not breathe, it does not sway) —
    // this does NOT bring that back. Instead, after an unnaturally long,
    // randomized hold, it makes ONE tiny, isolated, SPRUNG adjustment a living
    // body would never delay that long — a finger settling, a shoulder dropping
    // a hair, a slow weight-shift, a too-late micro head-tilt — then freezes
    // again. The lateness + isolation is the horror, not fidgeting. Only ONE
    // plays at a time (never overlaps), the hold is re-randomized each time
    // (never rhythmic), and each event picks a DIFFERENT channel than the last
    // (so repeated watching never shows the same tic). Runs on this smooth
    // layer AFTER the blend-apply above, so the blend-channel settles (shoulder
    // .z / hips.z) ride as a clean per-frame += (the blend re-lays the base
    // each frame); the finger.z / head.x channels are ours alone (animate never
    // writes them) so they're driven absolutely. Reuses springScalar (D1); all
    // state is on the instance (no per-frame alloc). Gated to the doble whose
    // stillness is the tell — never crawling, never testigo/archivero. C4 · also
    // gated to FULLY standing (t01 has reached the top): the micro-settles only
    // begin once the rear-up has completed, never mid-transition.
    if (isDoble && this._standing && this._blendActive && this._t01.x > 0.995) {
      const S = this._settle;
      if (this._settleActive) {
        // play it out: a velocity-kicked spring relaxing back to 0 — it rises
        // off still, crests, then settles back to still. One bump, no rhythm.
        const s = springScalar(S, 0, dt, this._settleK, this._settleDamp);
        this._settleAge += dt;
        switch (this._settleType) {
          case 0:  // a shoulder / clavicle drops a hair and settles (blend chan → +=)
            if (P.shoulders[this._settleSide]) P.shoulders[this._settleSide].rotation.z += s;
            break;
          case 1:  // a tiny hip / weight-shift, a little heavier & slower (blend chan → +=)
            P.hips.rotation.z += s;
            break;
          case 2:  // one finger settles a hair sideways (finger.z is ours alone → absolute)
            if (P.fingers[this._settleSide]) P.fingers[this._settleSide].rotation.z = s;
            break;
          case 3:  // a single micro head-tilt that returns TOO slowly (head.x is ours alone)
            P.head.rotation.x = s;
            break;
        }
        // back to still (and it ran long enough not to end on frame 1): zero the
        // absolute channels cleanly (blend channels self-reset next frame), then
        // schedule the next long, dead-still hold with fresh randomness.
        if (this._settleAge > 0.12 && Math.abs(s) < 0.0015 && Math.abs(S.v) < 0.01) {
          if (this._settleType === 2 && P.fingers[this._settleSide]) P.fingers[this._settleSide].rotation.z = 0;
          else if (this._settleType === 3) P.head.rotation.x = 0;
          this._settleActive = false;
          this._settleT = this._settleHoldMin + Math.random() * (this._settleHoldMax - this._settleHoldMin);
        }
      } else {
        // the dead-still hold. Lazy-init the first (also long) interval, count down.
        if (this._settleT < 0) this._settleT = this._settleHoldMin + Math.random() * (this._settleHoldMax - this._settleHoldMin);
        this._settleT -= dt;
        if (this._settleT <= 0) {
          // fire ONE settle. Pick a micro-motion DIFFERENT from last time so
          // repeated observation never shows the same tic. Kick the spring's
          // velocity (target stays 0) → rise-then-settle. Per-type k/damp give
          // each its own feel; the head's low k + gentle damp make it return
          // too slowly. Signs randomized so direction varies too.
          const N = 4, sgn = Math.random() < 0.5 ? -1 : 1;
          this._settleType = (this._settleType + 1 + Math.floor(Math.random() * (N - 1))) % N;
          S.x = 0;
          if (this._settleType === 0)      { this._settleSide = Math.random() < 0.5 ? 0 : 1; this._settleK = 60; this._settleDamp = 7.0; S.v = sgn * (0.42 + Math.random() * 0.16); }
          else if (this._settleType === 1) { this._settleK = 46; this._settleDamp = 7.2; S.v = sgn * (0.28 + Math.random() * 0.12); }
          else if (this._settleType === 2) { this._settleSide = Math.floor(Math.random() * (P.fingers.length || 1)); this._settleK = 95; this._settleDamp = 7.5; S.v = sgn * (0.9 + Math.random() * 0.4); }
          else                             { this._settleK = 18; this._settleDamp = 3.6; S.v = sgn * (0.22 + Math.random() * 0.08); }
          this._settleActive = true;
          this._settleAge = 0;
        }
      }
    } else if (isDoble && (this._settleActive || this._settleType >= 0)) {
      // left watched-standing (now crawling / an effect state): abandon any
      // in-flight settle and clear the absolute channels so the crawl never
      // inherits an offset, and reset the timer so the next stand-up holds fresh.
      if (this._settleType === 2 && P.fingers[this._settleSide]) P.fingers[this._settleSide].rotation.z = 0;
      else if (this._settleType === 3) P.head.rotation.x = 0;
      this._settleActive = false;
      this._settle.x = 0; this._settle.v = 0;
      this._settleT = -1;
      this._settleType = -1;
    }

    // ---- C2 · the Draft's crawl: secondary motion the 13 fps stepped pose can't
    // carry smoothly, on the smooth per-frame layer. A LATERAL wave ripples down
    // the back (sprung → it snakes + settles with flesh-weight, D1), and the neck
    // STRAINS harder with a fine tremble as it forces its face up toward you. The
    // stepped layer wrote a clean eased base for both this frame, so += / = is
    // clean here. C4 · gated by the crawl WEIGHT (1 - t01) and scaled by it, so
    // this secondary motion fades out as the body rears up and is byte-for-byte
    // the old crawl at full crawl (t01=0 → crawlAmt=1). The watched-standing
    // doble and the effect states (manifest/dying/stagger) never enter this arm.
    const crawlAmt = Math.max(0, Math.min(1, 1 - this._t01.x));   // 1 = full crawl, 0 = fully standing
    if (isDoble && this._blendActive && crawlAmt > 0.002) {
      const gph = this.gait, gamp = this.walkAmp;
      const sp = Math.min(1, (this._speedNow || 0) / (this.spec.chase * 0.7 + 0.3));
      // travelling lateral wave: a sprung target phase-lagged behind the hip roll
      // so the back SNAKES rather than swinging as a plank. The underdamped spring
      // adds the lag/overshoot/settle that gives the fast gait weight (item 1 + 5).
      if (!this._crawlZ) this._crawlZ = { x: this._spineZBase || 0, v: 0 };
      const zTgt = (this._spineZBase || 0) + Math.sin(gph - 0.9) * 0.12 * gamp * sp * crawlAmt;
      springScalar(this._crawlZ, zTgt, dt, 68, 6.5);
      P.spine.rotation.z = this._crawlZ.x;
      // neck strain: the effort of keeping its eyes on you. -= drives it further
      // back/up over the eased base, with a fine tremble, scaled by closeness and
      // by the crawl weight (it un-strains as the neck un-cranes on the way up).
      if (dist < 18) {
        const s = Math.min(1, (18 - dist) / 12) * crawlAmt;
        P.neck.rotation.x -= (Math.abs(Math.sin(t * 12.5)) * 0.055 + (Math.random() - 0.5) * 0.03) * s;
      }
    } else if (isDoble && this._crawlZ) {
      // stood up / not crawling: ease the lateral wave back to the sculpted base
      // twist so the standing tell stays perfectly, wrongly still.
      P.spine.rotation.z += ((this._spineZBase || 0) - P.spine.rotation.z) * Math.min(1, dt * 8);
      this._crawlZ.x = P.spine.rotation.z; this._crawlZ.v = 0;
    }

    const stillCopy = this.kind === 'doble' && this._seen && chase;   // unnaturally still

    // ---- tatters (D1): secondary motion on the SMOOTH per-frame layer.
    // Spring-damper target = body motion: linear speed tips the cloth BACKWARD
    // (it trails / lags while moving), and angular velocity (change in yaw)
    // swings it OUT to the side on a turn, then overshoots and settles when the
    // turn stops. The idle flutter sine rides on top, smaller, so a standing
    // monster's cloth still breathes. doble has 0 tatters — loop just no-ops.
    let dyaw = this.group.rotation.y - this._prevYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));         // wrap to [-pi, pi]
    this._prevYaw = this.group.rotation.y;
    const angVel = dyaw / Math.max(dt, 1e-4);
    const tilt = Math.min(1, (this._speedNow || 0) / (this.spec.chase * 0.7 + 0.3)) * 0.5;
    const roll = Math.max(-0.7, Math.min(0.7, angVel * 0.08));
    _tatTarget.set(tilt, 0, roll);
    for (const tat of P.tatters) {
      const u = tat.userData;
      if (!u.sp) { u.sp = new THREE.Vector3(); u.sv = new THREE.Vector3(); }
      springVec3(u.sp, u.sv, _tatTarget, dt);
      // idle breath, smaller than before now that the spring carries the swing
      const flutter = Math.sin(t * 2.1 + u.ph) * u.amp * 0.55;
      // FULL rotation with the stored yaw (cloning re-derives eulers from the
      // quaternion and can flip "hanging down" into "sticking up" — see buildRig)
      tat.rotation.set(u.sp.x + flutter, u.yaw, u.sp.z);
    }

    // ---- hair (B2): the testigo's wet curtain, driven exactly like the tatters
    // above. Spring-damper target = body motion: linear speed trails it BACKWARD
    // (rotation.x, streaming off the face), angular velocity swings it sideways
    // (rotation.z), with overshoot/settle when motion stops. On a LUNGE a sprung
    // `part` climbs toward 1 and the front (face-covering) strands PART — swing
    // back (lift) + sweep OUTWARD from centre (yaw) — uncovering the carved face
    // + sockets for that horror beat, then fall closed as `part` settles to 0.
    // The idle flutter (per-strand ph/amp) rides on top so a standing testigo's
    // hair still drifts. doble/archivero have no P.hairs → this whole block
    // no-ops. FULL rotation with the stored yaw (see the tatter/buildRig note).
    if (P.hairs.length) {
      const streamX = Math.min(1, (this._speedNow || 0) / 3) * HAIR_STREAM;
      const swingZ = Math.max(-0.6, Math.min(0.6, angVel * HAIR_SWING));
      _hairTarget.set(streamX, 0, swingZ);
      if (!this._hairPart) this._hairPart = { x: 0, v: 0 };
      const partTgt = (this.kind === 'testigo' && this._lunge > 0) ? 1 : 0;
      const part = springScalar(this._hairPart, partTgt, dt);
      for (const h of P.hairs) {
        const u = h.userData;
        if (!u.hsp) {
          u.hsp = new THREE.Vector3(); u.hsv = new THREE.Vector3();
          // front strands cover the face and part on a lunge; the nape barely/not at all
          u.front = Math.cos(u.yaw) > 0.15 ? 1 : 0;
          // side to sweep toward; centre strands still pick a deterministic side
          u.side = Math.sin(u.yaw);
          if (Math.abs(u.side) < 0.2) u.side = (u.yaw >= 0 ? 1 : -1) * 0.2;
        }
        springVec3(u.hsp, u.hsv, _hairTarget, dt);
        const flutter = Math.sin(t * 2.4 + u.ph) * u.amp * 0.6;   // idle drift
        const lift = u.front * part * HAIR_LIFT;                  // swing back off the face
        const spread = u.front * u.side * part * HAIR_SPREAD;     // fan outward from centre
        h.rotation.set(u.hsp.x + flutter + lift, u.yaw + spread, u.hsp.z);
      }
    }

    // ---- B4 · testigo finger reach/grasp (see the GRASP_* constants + note up
    // top). Gated to the testigo — the reaching chaser with _lunge/_pin; the
    // doble/archivero fingers keep their plain stop-motion twitch back in
    // animate(). Driven here on the smooth layer so the clench springs (snap +
    // overshoot + settle) and ripples across the fingers.
    if (this.kind === 'testigo' && P.fingers.length) {
      // grasp intent target: SPLAY to reach while chasing, CLENCH on a lunge, a
      // trembling half-curl while PINNED. 0 (relax toward idle) otherwise —
      // including stagger/dying, which aren't 'chase', so no grab is forced there.
      let graspTgt = 0;
      if (chase) {
        if (this._lunge > 0) graspTgt = GRASP_CLENCH;
        else if (this._pin > 0.2) graspTgt = GRASP_PIN;
        else graspTgt = GRASP_REACH;
      }
      if (!this._grasp) this._grasp = { x: 0, v: 0 };
      const g = springScalar(this._grasp, graspTgt, dt, GRASP_K, GRASP_DAMP);
      const gv = this._grasp.v;
      const pin = this._pin;
      const trembling = chase && pin > 0.2 && this._lunge <= 0;
      // idle worry-twitch: the same sine as before but smaller, eased down as the
      // grasp engages so intent reads cleanly (full amplitude when relaxed).
      const twAmp = 0.07 * (1 - 0.5 * Math.min(1, Math.abs(g)));
      for (const f of P.fingers) {
        const u = f.userData;
        // per-finger constants, lazy (no per-frame alloc): outward-fan factor from
        // the finger's own local x (mirror-correct on both hands), and a ripple
        // latency by within-hand index so they close in a quick wave, not a block.
        if (u.fanN === undefined) {
          u.fanN = f.position.x / 0.035;       // ≈[-1..1] across a hand, +=outward
          u.lag = (u.fi % 4) * 0.018;          // ripple delay by finger index
        }
        // Taylor-delay the master by this finger's latency → a trailing ripple
        // that self-cancels at rest (gv→0). Clamp so a fast transient can't
        // over-bend the finger through the palm/body.
        let gf = g - gv * u.lag;
        if (gf > 1.5) gf = 1.5; else if (gf < -1) gf = -1;
        const curl = gf > 0 ? gf : 0;
        const ext = gf < 0 ? -gf : 0;
        let rx = GRASP_BASE_X + curl * GRASP_CURL_X - ext * GRASP_EXT_X
               + Math.sin(t * 11 + u.ph + u.fi) * twAmp
               + (Math.random() - 0.5) * 0.02;   // faint puppet error
        let rz = u.fanN * (ext * GRASP_SPREAD - curl * GRASP_CONVERGE);
        if (trembling) {
          // pinned: a faster tremor — the effort of being seen — scaled by _pin
          rx += Math.sin(t * 27 + u.fi * 1.7) * 0.05 * pin + (Math.random() - 0.5) * 0.03 * pin;
          rz += Math.cos(t * 31 + u.fi) * 0.045 * pin;
        }
        f.rotation.x = rx;
        f.rotation.z = rz;
      }
    }

    // ---- B5 · pinned head/jaw tremor (testigo). There is NO jaw bone (the jaw
    // is sculpted into the head), so the whole HEAD trembles with the effort of
    // being seen — a FINE high-frequency shiver LAYERED on the slow pin wobble
    // the stepped layer already writes (it must not fight it). Driven on the
    // smooth per-frame layer (the 11 fps stepped clock would alias it into a
    // judder). Applied as a self-cancelling per-frame delta: we undo last
    // frame's tremor, then re-add this frame's — so it composes cleanly whether
    // the stepped layer re-set head.z this tick (it zeroes _hTremZ after) or is
    // holding. head.x is ours alone (nothing else writes it). Scaled by _pin and
    // relaxed off outside the pinned chase — stagger/dying aren't 'chase', so no
    // tremor there. The little dark maw quivers/parts a hair with the same effort.
    const tremActive = this.kind === 'testigo' && chase && this._pin > 0.2 && this._lunge <= 0
      ? (1 - this.dying) : 0;
    P.head.rotation.z -= (this._hTremZ || 0);
    P.head.rotation.x -= (this._hTremX || 0);
    let hz = 0, hx = 0;
    if (tremActive > 0) {
      const a = this._pin * tremActive;
      hz = (Math.sin(t * 34) + Math.sin(t * 51 + 1.3)) * 0.01 * a + (Math.random() - 0.5) * 0.012 * a;
      hx = (Math.sin(t * 39 + 0.7) + Math.sin(t * 61)) * 0.008 * a + (Math.random() - 0.5) * 0.01 * a;
    }
    this._hTremZ = hz; this._hTremX = hx;
    P.head.rotation.z += hz;
    P.head.rotation.x += hx;
    if (P.maw) {
      if (P.maw.userData.baseY === undefined) P.maw.userData.baseY = P.maw.position.y;
      const open = tremActive > 0 ? this._pin * tremActive : 0;
      P.maw.scale.y = 1 + open * 0.18 + hx * 5;                 // parts a hair, quivering
      P.maw.position.y = P.maw.userData.baseY - open * 0.006 + hz * 0.25;
    }

    // afterimage face — and the face itself refuses to register in place
    P.smear2.position.x = Math.sin(t * 2.4) * 0.05 + (Math.random() < dt * 4 ? (Math.random() - 0.5) * 0.12 : 0);
    P.smear2.material.opacity = (0.06 + Math.abs(Math.sin(t * 1.2)) * 0.07 + (chase ? 0.07 : 0)) * (1 - this.dying);
    if (!stillCopy && Math.random() < dt * 7) {
      for (const m of P.smearMats) {
        if (!m.map) continue;
        m.map.offset.x = (Math.random() - 0.5) * 0.06;
        m.map.offset.y = (Math.random() - 0.5) * 0.045;
      }
    }
    if (P.ghostTorso) P.ghostTorso.material.opacity = (0.028 + (chase ? 0.025 : 0)) * (1 - this.dying);

    // twitch — the image is misregistered. The Draft, watched, doesn't
    // twitch at all: real bodies are never that quiet
    if (stillCopy) {
      this.group.rotation.z = 0;
    } else {
      const twitchAmp = chase ? 0.1 : 0.04;
      const twitch = (Math.random() < dt * (chase ? 6 : 2.5)) ? twitchAmp : 0;
      this.group.rotation.z = Math.sin(t * 0.9) * 0.015 + (Math.random() - 0.5) * twitch;
    }

    // the white instant of the flash, fading off the skin
    this.flashBurn = Math.max(0, this.flashBurn - dt * 2.2);
    if (this.state !== 'dying') {
      P.bodyMat.emissiveIntensity = this.flashBurn * this.flashBurn * 2.4;
    }

    // B5 · wet eyeshine answers the flashlight. `shine` from the torch-facing
    // dot (unchanged tracking) drives a HOT core + a fainter HALO; the dark
    // socket recess is always present (a hollow, beam or not) and only fades on
    // death. When the beam isn't on the face, shine→0 → the glints go dark: no
    // glowing planes floating in the night. `_toMe` is reused (no per-frame alloc).
    let shine = 0;
    if (ctx.flashOn && this.kind !== 'doble' && dist < 32) {
      _toMe.subVectors(this.pos, ctx.playerPos).normalize();
      shine = Math.max(0, (_toMe.dot(ctx.playerDir) - 0.8) * 5) * Math.max(0, 1 - dist / 32);
    }
    const eyeK = Math.min(1, dt * 6);
    const lit = shine * (1 - this.dying);
    const coreTgt = Math.min(1.15, lit * 1.5);   // small but bright: a wet spark that can just bloom
    P.eyeMat.opacity += (coreTgt - P.eyeMat.opacity) * eyeK;                   // hot core (can bloom)
    if (P.eyeHaloMat) P.eyeHaloMat.opacity += (lit * 0.6 - P.eyeHaloMat.opacity) * eyeK;   // soft surround
    if (P.socketMat) P.socketMat.opacity = SOCKET_DARK * (1 - this.dying);     // deep dark hollow

    // lake water, still running off it — rivulets streaking down the body
    const D = P.drips;
    const rate = this.state === 'manifest' ? 3.4 : 1;
    const dyingNow = this.state === 'dying';
    const arr = D.attr.array;
    for (let i = 0; i < D.data.length; i++) {
      const d = D.data[i];
      if (dyingNow) d.y += d.v * dt * 2.2;   // the water goes back up, the lake takes it
      else d.y -= d.v * dt * rate;
      if (d.y < 0.02 || d.y > D.h * 1.1) {
        d.y = 0.25 + Math.random() * D.h * 0.8;
        d.x = (Math.random() - 0.5) * 0.42;
        d.z = (Math.random() - 0.5) * 0.34;
      }
      // motion-stretched: streak elongates with speed (heavier while manifesting)
      const len = Math.min(0.4, d.len + d.v * rate * 0.085);
      // slow horizontal wander, bottom lagging the top so the streak curves and
      // reads as following the body's contour rather than a ruler-straight line
      const wTop = Math.sin(t * d.wf + d.wph) * d.wa;
      const wBot = Math.sin(t * d.wf + d.wph - 0.6) * d.wa;
      const o = i * 6;
      arr[o] = d.x + wTop; arr[o + 1] = d.y; arr[o + 2] = d.z;                     // head
      arr[o + 3] = d.x + wBot; arr[o + 4] = d.y - len; arr[o + 5] = d.z;           // trailing tail
    }
    D.attr.needsUpdate = true;

    // feet: a faint wet sheen breathing on the sodden ground, with the odd
    // small splash ring sheeting off (heavier on arrival, gone once it dissolves)
    if (D.feet) {
      const wet = (this.state === 'manifest' ? 1.8 : 1) * (1 - this.dying);
      D.sheen.material.opacity = 0.055 * wet * (0.8 + 0.2 * Math.sin(t * 1.4));
      for (const ring of D.rings) {
        const u = ring.userData;
        if (u.dur <= 0) {
          if (!dyingNow && Math.random() < dt * (this.state === 'manifest' ? 1.7 : 0.5)) {
            u.dur = 0.9 + Math.random() * 0.5; u.t = 0;
          }
        } else {
          u.t += dt;
          const k = u.t / u.dur;
          if (k >= 1) { u.dur = 0; ring.material.opacity = 0; ring.scale.setScalar(1); }
          else {
            ring.scale.setScalar(0.5 + k * 1.9);
            ring.material.opacity = 0.13 * (1 - k) * (1 - this.dying);
          }
        }
      }
    }

    // paper storm
    for (const p of P.papers) {
      const u = p.userData;
      u.a += dt * u.sp * (this.state === 'stagger' || this.state === 'dying' ? 3 : 1);
      const r = u.r * (this.state === 'dying' ? 1 + this.dying * 2.5 : this.state === 'stagger' ? 1.35 : 1);
      p.position.set(Math.cos(u.a) * r, u.y + Math.sin(t * 2 + u.a * 3) * 0.15, Math.sin(u.a) * r);
      p.rotation.set(u.a * 2, u.a, u.a * 0.7);
    }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  // a3-2: pick a new wander target, biased part of the time toward the shore
  // band (on land, just north of the waterline) so ambient figures drift back
  // to the water's edge over time — the drowned drawn back to the lake
  pickWanderTarget(ctx) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
    let tx = this.pos.x + Math.cos(a) * r;
    let tz = this.pos.z + Math.sin(a) * r;
    this._shoreTgt = false;
    if (!this.guard && Math.random() < 0.5) {
      const band = LAYOUT.shoreZ - 1.5 - Math.random() * 2.5;   // ~52..54.5, still land
      const bz = tz + (band - tz) * (0.5 + Math.random() * 0.4);
      if (ctx.ground(tx, bz) > 0.2) { tz = bz; this._shoreTgt = true; }
    }
    this.wanderTarget = new THREE.Vector3(tx, 0, tz);
  }

  exposeToFlash(fromPos) {
    // c4: a teaching demo is a pure observation — a flash passes through it, so
    // the lesson is never cut short by the player photographing it.
    if (this.state === 'manifest' || this.state === 'dying' || this.demo) return 'none';
    this.exposure++;
    this.flashBurn = 1;   // for one white instant it is confronted with the record
    // most are thrown back out of the light. The Draft is not: it is closer
    // in the photo than it was when you took it.
    const away = new THREE.Vector3(this.pos.x - fromPos.x, 0, this.pos.z - fromPos.z);
    const d = away.length();
    away.normalize();
    const knock = this.spec.knock;
    if (knock > 0 || d + knock > 1.6) this.pos.addScaledVector(away, knock);
    if (this.exposure >= this.spec.exposures) {
      this.setState('dying');
      return 'dissolved';
    }
    this.setState('stagger');
    return 'staggered';
  }
}

// ambient-spawn lookup tables, now read at a FLOAT pressure so cadence and
// crowd size slide smoothly with the tide instead of snapping between steps.
// At an integer pressure with tide 0 these return the old exact values.
const CAPS = [0, 1, 2, 3];         // how many ambient Returned may stand at once (kept low: exploration, not a shooting gallery)
const INTERVAL = [99, 40, 30, 14]; // seconds between manifestation attempts (lengthened so the grounds stay mostly empty)
function lerpTable(tbl, x) {
  const i = Math.max(0, Math.min(tbl.length - 2, Math.floor(x)));
  const f = Math.max(0, Math.min(1, x - i));
  return tbl[i] + (tbl[i + 1] - tbl[i]) * f;
}

export class Director {
  constructor(scene, colliders, ground, audio, hooks) {
    this.scene = scene;
    this.colliders = colliders;
    this.ground = ground;
    this.audio = audio;
    this.hooks = hooks;   // { getPlayer, insideHouse, insideHouseM, houseCenter, onHit, onFirstPhoto, onScare, onDissolve }
    this.enemies = [];
    this.pressure = 0;      // story floor (integer, set by beats) — the tension FLOOR
    this.tide = 0;          // 0..1 living dread from the Night Engine, set each frame
    this.tideGain = 1.1;    // how much a full tide lifts effective pressure above the floor (slower early ramp)
    this.poweredBonus = 0;  // c3: extra effective pressure while the house is lit (the generator "calls" them)
    this.spawnT = 4;
    // BAL: a kind may only manifest as a LETHAL ambient Returned once its
    // non-lethal teaching sighting has begun (story.beginTeaching flips these).
    // Fallback: setPhase() unlocks any still-untaught kind once the teaching
    // window has closed, so the late night can still escalate.
    this.taught = { testigo: false, doble: false, archivero: false };
    this.nightPhase = 0;    // 0..1 night progress, fed from main.js (teaching-window fallback)
    this.dripT = 1;
    this._lastUtterAt = -1e9;   // E1 · time of the last monster utterance (global min-gap)
    this.photoSeen = new Set();
    this.dissolveSeen = false;
    this.spawnFocus = null;
    this.suppressSpawns = false;   // story sets this during controlled episodes (Mara's escort)
    // a3: lit-window gathering posts (fed from main.js), a claim per post so the
    // Returned spread across the windows instead of stacking on one
    this.windowPosts = (hooks.windowPosts ?? []).map((p) => ({ x: p.x, z: p.z }));
    this.postTakenBy = new Array(this.windowPosts.length).fill(null);
    this._claimPostBound = (e) => this._claimPost(e);
    this._releasePostBound = (e) => this._releasePost(e);
    // Step 5 · bind the four ctx handlers ONCE (mirrors _claimPostBound above) and
    // build `ctx` ONCE; update() only mutates its data fields each frame, so there is
    // no per-frame closure/object allocation. Handlers read the live player through
    // this.ctx.playerPos (set = pl.pos every frame) and the frame time via this._time,
    // which the original closures captured as `pl`/`time` — behaviour is identical.
    this._time = 0;
    this._playerInHouseBound = () => this.hooks.insideHouse(this.ctx.playerPos.x, this.ctx.playerPos.z);
    this._onTouchBound = (e) => {
      if (e.scripted) { this.despawnScripted(e); return; }
      this.hooks.onHit(TUNE.hitDamage, e.pos);
    };
    this._onScreamBound = (e) => {
      const pan = Math.max(-1, Math.min(1, (e.pos.x - this.ctx.playerPos.x) / 30));
      this.audio.scream(pan, e.kind);
    };
    this._onUtterBound = (e, o) => {
      if (this._time - this._lastUtterAt < UTTER_MIN_GAP) return;
      let closer = 0;
      const ppos = this.ctx.playerPos;
      for (const other of this.enemies) {
        if (other === e || other.state === 'manifest' || other.state === 'dying') continue;
        if (other.pos.distanceTo(ppos) < o.dist && ++closer >= UTTER_MAX_VOICES) break;
      }
      if (closer >= UTTER_MAX_VOICES) return;
      const pan = Math.max(-1, Math.min(1, (e.pos.x - ppos.x) / 30));
      const intensity = Math.max(0.3, 1 - o.dist / (UTTER_RANGE + 6));
      this._lastUtterAt = this._time;
      this.audio.monsterVoice?.(e.kind, pan, { dist: o.dist, state: o.state, intensity, pin: o.pin, lunge: o.lunge });
    };
    // constant fields set once; the mutable data fields (playerPos/playerDir/flashOn/
    // safeSpots/isPowered) are refreshed each frame in update(). windowPosts never
    // changes after construction, so claimPost is bound once here too.
    this.ctx = {
      playerPos: null,
      playerDir: null,
      flashOn: false,
      colliders: this.colliders,
      ground: this.ground,
      insideHouse: this.hooks.insideHouse,
      insideHouseM: this.hooks.insideHouseM,
      playerInHouse: this._playerInHouseBound,
      houseCenter: this.hooks.houseCenter,
      safeSpots: [],
      isPowered: false,
      claimPost: this.windowPosts.length ? this._claimPostBound : null,
      releasePost: this._releasePostBound,
      onTouch: this._onTouchBound,
      onScream: this._onScreamBound,
      onUtter: this._onUtterBound,
    };
    this.watchedCd = 0;
    this.calm = new URLSearchParams(location.search).has('calm');
    warmRigTemplates();          // pay the geometry cost at load, not mid-chase
  }

  // a3: claim the nearest free window post for this Returned (keeps a held one)
  _claimPost(e) {
    if (e.postIndex >= 0 && this.postTakenBy[e.postIndex] === e.id) return this.windowPosts[e.postIndex];
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.windowPosts.length; i++) {
      if (this.postTakenBy[i] != null && this.postTakenBy[i] !== e.id) continue;
      const p = this.windowPosts[i];
      const d = (p.x - e.pos.x) ** 2 + (p.z - e.pos.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    this.postTakenBy[best] = e.id;
    e.postIndex = best;
    return this.windowPosts[best];
  }

  _releasePost(e) {
    if (e.postIndex >= 0 && this.postTakenBy[e.postIndex] === e.id) this.postTakenBy[e.postIndex] = null;
    e.postIndex = -1;
    e._atPost = false;
  }

  setPressure(n) { this.pressure = n; }        // story beats set the floor
  setSpawnFocus(p) { this.spawnFocus = p; }
  // the Night Engine feeds the tide here every frame (0..1)
  setTide(t) { this.tide = t < 0 ? 0 : t > 1 ? 1 : t; }
  // BAL: the Night Engine also feeds the night phase (0..1) so the ambient
  // gate knows when the teaching window has closed and can unlock late kinds.
  setPhase(p) {
    this.nightPhase = p < 0 ? 0 : p > 1 ? 1 : p;
    // once the teaching window is past (see story _teachReady, phase < 0.42),
    // any kind never taught is unlocked so the escalation isn't locked out.
    if (this.nightPhase >= 0.45) { this.taught.testigo = true; this.taught.doble = true; this.taught.archivero = true; }
  }
  // c3: the story sets a powered bonus while the generator runs (0 when dark).
  // Additive to effPressure — it does NOT touch the setPressure/setTide floors
  // a1/c1 own; killing the lights drops it straight back to 0.
  setPoweredBonus(v) { this.poweredBonus = v > 0 ? v : 0; }
  // effective pressure = story floor + the living tide + the powered bonus,
  // a smooth float 0..3
  effPressure() {
    const e = this.pressure + this.tide * this.tideGain + this.poweredBonus;
    return e < 0 ? 0 : e > 3 ? 3 : e;
  }

  activeCount() {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) { const e = this.enemies[i]; if (!e.scripted && e.state !== 'dying') n++; }
    return n;
  }

  spawn(kind, x, z, opts = {}) {
    const e = new Rumor(kind, x, z, opts);
    e.pos.y = this.ground(x, z);
    this.scene.add(e.group);
    this.enemies.push(e);
    const pl = this.hooks.getPlayer();
    const pan = Math.max(-1, Math.min(1, (x - pl.pos.x) / 30));
    this.audio.manifest(pan);
    return e;
  }

  spawnGuard(kind, x, z) {
    if (this.calm) return null;
    return this.spawn(kind, x, z, { guard: true });
  }

  spawnScripted(x, z) {
    const e = this.spawn('testigo', x, z, { scripted: true, allowHouse: true });
    e.group.scale.y = 1; e.state = 'chase'; e.stateT = 0;
    return e;
  }

  // c4: a distant, non-lethal teaching demo of one kind's tell. Reuses the
  // existing rig (warm-up safe); ?calm suppresses it like every other Returned.
  spawnDemo(kind, x, z) {
    if (this.calm) return null;
    return this.spawn(kind, x, z, { demo: true });
  }

  // A scripted ambusher that hunts an NPC (Mara), not Ana. Skips the manifest
  // rise (like spawnScripted) and goes straight for its prey; the flash dissolves
  // it normally. NOT ?calm-gated — it's a consequence of the player's own choice
  // (keeping the tape), the same way the cellar girl's attack fires regardless.
  spawnAbductor(kind, x, z, prey) {
    const e = this.spawn(kind, x, z, { abduct: true, prey });
    e.group.scale.y = 1; e.state = 'abduct'; e.stateT = 0;
    return e;
  }

  despawn(e) {
    this._releasePost(e);            // a3: free its window post for another
    this.scene.remove(e.group);
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  clearAll() {
    for (const e of [...this.enemies]) this.despawn(e);
  }

  nearestDist() {
    const pl = this.hooks.getPlayer();
    let d = 1e9;
    for (const e of this.enemies) {
      if (e.state === 'manifest' || e.state === 'dying') continue;
      d = Math.min(d, e.pos.distanceTo(pl.pos));
    }
    return d;
  }

  chasingCount() {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].state === 'chase') n++;
    return n;
  }

  flash(camPos, camDir) {
    const hits = [];
    // camDir is constant across the loop — flatten the beam direction ONCE (was
    // recomputed per enemy). Backwards index loop: despawnScripted() splices the
    // array mid-loop, so a copy is no longer needed to stay splice-safe.
    const flat = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const to = new THREE.Vector3(e.pos.x - camPos.x, 0, e.pos.z - camPos.z);
      const d = to.length();
      if (d > TUNE.flashRange) continue;
      to.normalize();
      if (to.dot(flat) < TUNE.flashCos && d > 2.2) continue;
      if (e.scripted) {
        this.despawnScripted(e);
        hits.push(e.kind);
        continue;
      }
      const result = e.exposeToFlash(camPos);
      if (result === 'none') continue;
      hits.push(e.kind);
      if (result === 'dissolved') {
        this.audio.manifest(0);
        if (!this.dissolveSeen) { this.dissolveSeen = true; this.hooks.onDissolve?.(e.kind); }
      }
      if (!this.photoSeen.has(e.kind)) {
        this.photoSeen.add(e.kind);
        this.hooks.onFirstPhoto?.(e.kind);
      }
    }
    return hits;
  }

  despawnScripted(e) {
    this.despawn(e);
    this.hooks.onScare?.();
  }

  update(dt, time) {
    const pl = this.hooks.getPlayer();
    const safeSpots = this.hooks.safeSpots?.() ?? [];
    // Step 5 · reuse the single ctx built in the constructor; only its per-frame data
    // fields are refreshed here. The four handlers + all constant fields were bound
    // once. this._time feeds the onUtter min-gap that used the captured `time`.
    this._time = time;
    const ctx = this.ctx;
    ctx.playerPos = pl.pos;
    ctx.playerDir = pl.dir;
    ctx.flashOn = pl.flashOn;
    ctx.safeSpots = safeSpots;
    // a3: the lit-window gathering behavior, only live while the house is powered
    ctx.isPowered = this.hooks.isPowered ? this.hooks.isPowered() : false;

    // backwards index loop: splice-safe (despawn/despawnScripted splice this.enemies)
    // with zero per-frame array copy.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, ctx);
      if (e.state === 'dying' && e.dying >= 1) { this.despawn(e); continue; }
      if (e.demo && e.demoExpire) { this.despawn(e); continue; }   // c4: the lesson is over
      if (e.scripted && (e.stateT > 10 || e.pos.distanceTo(pl.pos) < 2.6)) {
        this.despawnScripted(e);
        continue;
      }
      if (!e.scripted && !e.guard && !e.abduct && e.pos.distanceTo(pl.pos) > 85) this.despawn(e);
      if (e.state === 'retreat' && e.pos.distanceTo(pl.pos) > 42) this.despawn(e);
    }

    // a3: a rare acknowledgement when the powered house has drawn watchers up
    // to its windows while Ana is inside looking out
    this.watchedCd = Math.max(0, this.watchedCd - dt);
    if (this.watchedCd <= 0 && this.hooks.onWatched && ctx.isPowered &&
      this.hooks.insideHouse(pl.pos.x, pl.pos.z)) {
      let atWindows = 0;
      for (const e of this.enemies) if (e.state === 'gather' && e._atPost) atWindows++;
      if (atWindows >= 2) { this.watchedCd = 80; this.hooks.onWatched(atWindows); }
    }

    // wet, close: you hear the lake dripping off something you can't place
    let nd = 1e9, ndx = 0;
    for (const e of this.enemies) {
      if (e.state === 'manifest' || e.state === 'dying') continue;
      const d = e.pos.distanceTo(pl.pos);
      if (d < nd) { nd = d; ndx = e.pos.x - pl.pos.x; }
    }
    if (nd < 10) {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 0.35 + Math.random() * 1.5 * (nd / 10 + 0.3);
        this.audio.drip?.(Math.max(-1, Math.min(1, ndx / 12)));
      }
    }

    // separation
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i], b = this.enemies[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.2 && d2 > 1e-4) {
          const d = Math.sqrt(d2), push = (1.1 - d) * 0.5;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }

    // ambient spawning — driven by the effective (tide-blended) pressure, so
    // the grounds ebb and flow even at a fixed story beat. Story floor 0 with
    // a low tide still yields caps 0 → nothing manifests (early game / ?calm).
    // suppressSpawns is set by the story for controlled episodes (Mara's escort)
    // so a scripted one-at-a-time threat isn't buried under ambient Returned.
    if (this.calm || this.suppressSpawns) return;
    const eff = this.effPressure();
    if (eff <= 0) return;
    // floor the cap so the low tide has a genuine dead zone (caps<1 → none),
    // rather than trickling a lone Returned in during the quietest lulls.
    const caps = Math.floor(lerpTable(CAPS, eff));
    const interval = lerpTable(INTERVAL, eff);
    const effInt = Math.round(eff);   // for the kind mix, so the roster escalates with the tide too
    if (caps <= 0) return;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.activeCount() < caps) {
      this.spawnT = interval * (0.7 + Math.random() * 0.6);
      // BAL · never pile on: if the player is already being chased, don't add a
      // second monster (the cadence is reset above, so nothing arrives the
      // instant this chase ends either).
      if (this.chasingCount() >= 1) return;
      // BAL · teaching gate: only kinds whose non-lethal first sighting has
      // begun may manifest as a lethal ambient Returned. Untaught → skip.
      if (!this.taught.testigo && !this.taught.doble && !this.taught.archivero) return;
      const focus = this.spawnFocus ?? pl.pos;
      for (let tries = 0; tries < 14; tries++) {
        // with the short flashlight they can manifest just past the beam. The
        // behind-the-player bias is now rare (0.15) so most spawns are NOT dead
        // behind you, and the radius is beyond sightLit so a spawn can't be
        // inside the beam and insta-chase.
        let a;
        if (!this.spawnFocus && pl.dir && Math.random() < 0.15) {
          a = Math.atan2(-pl.dir.x, -pl.dir.z) + (Math.random() - 0.5) * 2.2;
        } else {
          a = Math.random() * Math.PI * 2;
        }
        const r = this.spawnFocus ? 13 + Math.random() * 16 : 28 + Math.random() * 14;
        const x = focus.x + Math.sin(a) * r, z = focus.z + Math.cos(a) * r;
        if (this.ground(x, z) < 0.15) continue;
        if (this.hooks.insideHouseM(x, z, 2)) continue;
        if (pl.pos.distanceTo(new THREE.Vector3(x, 0, z)) < 14) continue;
        if (safeSpots.some((sp) => Math.hypot(x - sp.x, z - sp.z) < sp.r + 5)) continue;
        let kind = 'testigo';
        if (effInt >= 2) {
          const roll = Math.random();
          kind = roll < 0.45 ? 'testigo' : roll < 0.8 ? 'doble' : 'archivero';
        }
        if (effInt >= 3) kind = Math.random() < 0.55 ? 'doble' : 'testigo';
        // BAL · rolled an untaught kind → skip THIS cycle rather than swap it for
        // a taught one (keeps the grounds sparse and honours the teaching order).
        if (!this.taught[kind]) break;
        this.spawn(kind, x, z);
        break;
      }
    }
  }
}
