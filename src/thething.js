import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sculpt, buildSkinnedRig } from './monstermesh.js';
import { bakeAO, heightToNormalTex } from './npc/pipeline.js';
import { makeHand } from './npc/parts.js';

// THE UNFINISHED — the thing in the upstairs east-wing bedroom. The lake's
// failed drafts: several Returned begun and abandoned, fused into one mass
// that grew here. One continuous SDF-sculpted SkinnedMesh (same pipeline as
// the monsters), a low asymmetric sprawl pooled across the floor and climbing
// the east wall, with human anatomy surfacing from it. ALL faces are sculpted
// from the mass's own flesh (a separate painted head read as alien — user
// call, 2026-07-23): domes with bored-in sockets and mouths, each riding its
// own bone so it can turn, plugged with unlit near-black inserts so the
// hollows stay holes under a point-blank torch.
//
// Behavior grammar (deliberately NOT stop-motion — that's the Returned's):
//   · two free-running breaths that never sync (mass + ribcage)
//   · faces drift idly; within ~8 m they SLOWLY track the player
//   · watched (REGARDED) → everything freezes except the breaths
//   · look away ≥0.7 s → ONE wet reposition (faces snap elsewhere, the arm
//     re-plants, the wall flap lean changes), then stillness again
//   · ENTRY LURCH, once per upstairs visit: first sight from the doorway →
//     the whole mass heaves toward the door, faces snapping to the player —
//     the "RUN" beat; it then settles and never pursues
//
// Local frame (group placed at the room floor, NO rotation):
//   +x → the east wall (interior face MEASURED at local x +1.65)
//   -x → the doorway lane (the player approaches from -x)
//   ±z → along the wall; -z is toward the stone chimney breast, whose south
//        face sits at local z ≈ -1.25 (the north lobes PRESS against it)
//   y0 → the floorboards
// Full plan: THING_PLAN.md.

function thingSpec() {
  const S = new Sculpt();

  // ---- floor pool: NOT one clean shape — many small overlapping pools with
  // a fingered, spilled-liquid edge, plus separated droplets past the rim and
  // concave bites, so no stretch of the perimeter runs straight.
  S.cap('root', [0.5, 0.03, -1.0], [0.3, 0.05, -0.2], 0.42, { s: [1.35, 0.28, 1.2], k: 0.2 });
  S.cap('root', [0.1, 0.04, 0.3], [0.0, 0.03, 0.9], 0.40, { s: [1.4, 0.26, 1.15], k: 0.2 });
  S.sph('root', [-0.72, 0.03, 0.55], 0.30, { s: [1.5, 0.24, 1.2], k: 0.18 });
  S.sph('root', [-0.92, 0.02, -0.18], 0.26, { s: [1.4, 0.22, 1.3], k: 0.16 });
  S.sph('root', [0.42, 0.03, 1.42], 0.30, { s: [1.25, 0.24, 1.35], k: 0.17 });
  S.sph('root', [1.08, 0.03, 0.55], 0.34, { s: [1.3, 0.26, 1.2], k: 0.18 });
  S.sph('root', [-0.55, 0.04, -0.95], 0.28, { s: [1.35, 0.25, 1.15], k: 0.17 });
  // droplets — small pools that broke off the rim
  S.sph('root', [-1.22, 0.02, 0.88], 0.11, { s: [1.5, 0.3, 1.2], k: 0.05 });
  S.sph('root', [-0.24, 0.02, 1.66], 0.10, { s: [1.4, 0.3, 1.3], k: 0.05 });
  S.sph('root', [1.34, 0.02, 1.28], 0.09, { s: [1.3, 0.3, 1.4], k: 0.04 });
  S.sph('root', [-1.28, 0.02, -0.72], 0.09, { s: [1.5, 0.3, 1.2], k: 0.04 });
  // bites — concave notches eaten into the rim. They bite from ABOVE the
  // skirt (y ≥ 0.09): a carve that reaches the floor plane severs the thin
  // shell and leaves knife-edge shards flapping at the rim.
  S.carveCap([-0.92, 0.10, 0.27], [-0.76, 0.10, 0.30], 0.09, { k: 0.04 });
  S.carveCap([0.72, 0.09, 1.38], [0.9, 0.09, 1.52], 0.10, { k: 0.045 });
  S.carveCap([-0.15, 0.09, -1.3], [0.02, 0.09, -1.42], 0.10, { k: 0.045 });

  // ---- main lobe (breathA): the deep-breathing body of the sprawl, long
  // axis along the wall, thicker toward +z, sagging asymmetrically.
  S.cap('breathA', [0.55, 0.30, -0.45], [0.25, 0.36, 0.65], 0.55, { s: [1.1, 0.54, 1.25], k: 0.18 });
  S.sph('breathA', [-0.10, 0.24, 1.20], 0.44, { s: [1.2, 0.55, 0.85], k: 0.16 });  // south pod (short in z — the big face sits proud of it)
  S.sph('breathA', [0.80, 0.30, 1.05], 0.30, { s: [1.0, 0.7, 1.0], k: 0.14 });     // sag against the wall corner

  // ---- north pod: a separate low drift that ran into the chimney breast
  // and piled up against the stone — a squashed welt along its south face,
  // connected by a thin waist (the carve below keeps the domes apart).
  S.sph('root', [0.45, 0.18, -0.95], 0.40, { s: [1.25, 0.50, 1.05], k: 0.15 });
  S.cap('root', [-0.1, 0.18, -1.14], [1.0, 0.20, -1.18], 0.26, { s: [1.1, 0.45, 0.85], k: 0.13 });

  // ---- the wall-climb: flattened sheets PLASTERED against the east wall,
  // rising to uneven heights like wet paper stuck to the boards, with a torn
  // lip peeling off at the very top. Sheet centres sit at ~1.60 so the mc
  // surface (pulled in by smoothing) lands ON the wall plane, not inside it.
  S.cap('wallFlap', [1.62, 0.50, -0.55], [1.60, 1.30, -0.30], 0.30, { s: [0.30, 1.0, 1.3], k: 0.13 });
  S.cap('wallFlap', [1.63, 0.40, 0.30], [1.61, 0.95, 0.12], 0.26, { s: [0.30, 0.9, 1.25], k: 0.13 });
  S.cap('wallFlap', [1.60, 1.28, -0.66], [1.44, 1.46, -0.80], 0.15, { s: [0.5, 0.7, 1.15], k: 0.1 });  // torn peeling lip
  S.cap('root', [1.56, 0.16, 0.9], [1.60, 0.3, -1.1], 0.24, { s: [0.55, 0.55, 1.3], k: 0.16 });  // wall-base welt

  // ---- the ribcage hump (breathB): a half-submerged human torso lying on
  // its back, chest arched out of the mass; breathes on its OWN rhythm.
  // Intercostal grooves carve across the crown so the ridges READ as ribs.
  S.cap('breathB', [-0.18, 0.42, -0.28], [-0.24, 0.52, 0.45], 0.34, { s: [0.85, 0.70, 1.0], k: 0.10 });
  S.sph('breathB', [-0.32, 0.50, 0.62], 0.20, { s: [0.95, 0.7, 0.9], k: 0.08 });   // shoulder knot at its head end
  S.cap('breathB', [-0.44, 0.60, 0.52], [-0.20, 0.64, 0.58], 0.035, { k: 0.03 });  // a clavicle line
  S.carveCap([-0.46, 0.66, -0.14], [0.02, 0.70, -0.10], 0.045, { k: 0.028 });
  S.carveCap([-0.47, 0.68, 0.02], [0.03, 0.72, 0.06], 0.045, { k: 0.028 });
  S.carveCap([-0.46, 0.68, 0.18], [0.02, 0.72, 0.22], 0.045, { k: 0.028 });
  S.carveCap([-0.44, 0.66, 0.34], [0.0, 0.70, 0.38], 0.045, { k: 0.028 });

  // ---- the seam: a closed mouth-line low on the west flank, lips as welts
  // riding jawU/jawL bones — it parts millimetres with the ribcage breath and
  // GAPES in the flash convulsion (T9), baring the teeth strung inside.
  S.cap('jawU', [-0.50, 0.34, -0.02], [-0.36, 0.32, 0.40], 0.055, { s: [0.85, 0.55, 1], k: 0.05 });
  S.cap('jawL', [-0.52, 0.22, -0.02], [-0.38, 0.20, 0.40], 0.055, { s: [0.85, 0.55, 1], k: 0.05 });
  S.carveCap([-0.54, 0.28, -0.02], [-0.40, 0.26, 0.40], 0.05, { k: 0.022 });   // the dark channel between the lips

  // ---- the hand under the skin: a palm and four finger ridges pressing from
  // INSIDE the wall sheet (own bone — it tents outward when you crowd it).
  S.sph('push', [1.52, 0.72, -0.42], 0.085, { s: [0.55, 1.1, 0.95], k: 0.05 });
  S.cap('push', [1.50, 0.80, -0.34], [1.49, 0.90, -0.31], 0.036, { k: 0.03 });
  S.cap('push', [1.50, 0.81, -0.42], [1.49, 0.93, -0.42], 0.038, { k: 0.03 });
  S.cap('push', [1.50, 0.80, -0.50], [1.49, 0.91, -0.53], 0.036, { k: 0.03 });
  S.cap('push', [1.51, 0.74, -0.55], [1.50, 0.80, -0.60], 0.034, { k: 0.03 });  // the thumb, sideways

  // ---- the arm: emerges from the doorway side, elbow raised in a real bend,
  // and plants a hand on the boards toward the lane — the first thing the
  // torch finds.
  S.cap('root', [-0.58, 0.32, -0.28], [-0.98, 0.26, -0.52], 0.22, { k: 0.13 });          // shoulder root, broad
  S.cap('sh', [-0.98, 0.26, -0.52], [-1.16, 0.40, -0.72], 0.092, { k: 0.05 });           // upper arm UP to the elbow
  S.cap('el', [-1.16, 0.40, -0.72], [-1.46, 0.07, -0.56], 0.072, { k: 0.045 });          // forearm, down to the boards
  S.sph('wr', [-1.54, 0.045, -0.50], 0.085, { s: [1.35, 0.42, 1.5], k: 0.05 });          // placeholder palm (real hand at T6)

  // ================= THE FACES — all flesh-of-the-mass ====================
  // Every face: a proud dome (the plane MUST clear the host lobe or the
  // carves cut invisible interior), features ≥3 mc cells so Taubin+displace
  // can't blur them, sockets/mouths BORED IN (carveCap along the view axis),
  // and unlit void plugs added in buildTheThing.

  // FACE S — larger than life, pushing through the south pod, facing +z at
  // whoever stands at the far end of the room. Mid-scream.
  S.sph('faceS', [-0.10, 0.42, 1.42], 0.30, { s: [1.1, 1.2, 0.85], k: 0.08 });                     // the face mass
  S.cap('faceS', [-0.10, 0.12, 1.52], [-0.10, 0.26, 1.62], 0.10, { s: [0.75, 1, 0.7], k: 0.05 });  // dropped chin
  S.cap('faceS', [-0.24, 0.62, 1.60], [0.04, 0.62, 1.62], 0.075, { s: [1, 0.6, 0.7], k: 0.04 });   // brow shelf
  S.cap('faceS', [-0.10, 0.55, 1.66], [-0.10, 0.40, 1.70], 0.055, { s: [0.7, 1, 0.7], k: 0.04 });  // nose ridge
  S.carveCap([-0.235, 0.50, 1.74], [-0.245, 0.47, 1.42], 0.10, { k: 0.03 });    // eye socket L (bored IN, angled down)
  S.carveCap([0.055, 0.51, 1.75], [0.065, 0.48, 1.43], 0.10, { k: 0.03 });      // eye socket R
  S.carveCap([-0.10, 0.30, 1.80], [-0.10, 0.26, 1.44], 0.095, { k: 0.032 });    // mouth: a deep dark bore, agape

  // FACE W — head-and-a-bit scale, surfacing past the ribcage's shoulder
  // knot, facing -x: the first face the torch finds from the doorway.
  S.sph('faceW', [-0.46, 0.52, 0.85], 0.20, { s: [0.85, 1.05, 0.95], k: 0.07 });                   // dome
  S.cap('faceW', [-0.62, 0.63, 0.76], [-0.62, 0.63, 0.94], 0.05, { s: [0.7, 0.65, 1], k: 0.04 });  // brow
  S.cap('faceW', [-0.66, 0.56, 0.85], [-0.64, 0.46, 0.85], 0.05, { k: 0.04 });                     // nose
  S.cap('faceW', [-0.60, 0.30, 0.85], [-0.58, 0.24, 0.85], 0.06, { k: 0.045 });                    // chin
  S.carveCap([-0.72, 0.585, 0.755], [-0.50, 0.565, 0.76], 0.065, { k: 0.026 });  // socket L
  S.carveCap([-0.72, 0.575, 0.945], [-0.50, 0.56, 0.94], 0.065, { k: 0.026 });   // socket R
  S.carveCap([-0.74, 0.385, 0.85], [-0.46, 0.365, 0.85], 0.075, { k: 0.03 });    // mouth, agape toward the door

  // FACE WALL — smaller, pushing OUT of the climbing sheet into the room,
  // one socket only (the other side never resolved — fused smooth).
  S.sph('faceWall', [1.54, 0.98, -0.42], 0.15, { s: [0.72, 1.05, 0.95], k: 0.06 });
  S.sph('faceWall', [1.44, 0.95, -0.42], 0.045, { k: 0.035 });                    // nose bump
  S.carveCap([1.36, 1.03, -0.50], [1.56, 1.02, -0.50], 0.06, { k: 0.025 });       // the one socket
  S.carveCap([1.34, 0.84, -0.40], [1.60, 0.84, -0.40], 0.065, { k: 0.028 });      // mouth bore

  // FACE C — squashed into the chimney welt, staring STRAIGHT UP at the
  // ceiling, mouth open. The torch from above falls into its voids.
  S.sph('faceC', [0.62, 0.24, -1.00], 0.15, { s: [1.05, 0.75, 0.95], k: 0.06 });
  S.sph('faceC', [0.62, 0.33, -0.97], 0.04, { k: 0.03 });                         // nose
  S.carveCap([0.52, 0.42, -1.06], [0.52, 0.22, -1.06], 0.055, { k: 0.025 });      // socket L (bored down)
  S.carveCap([0.72, 0.42, -0.96], [0.72, 0.24, -0.96], 0.055, { k: 0.025 });      // socket R
  S.carveCap([0.60, 0.42, -0.86], [0.62, 0.20, -0.88], 0.07, { k: 0.03 });        // mouth, gaping at the ceiling

  // ---- odd bulges: the wrong arithmetic — lumps where nothing should be.
  S.sph('breathA', [0.15, 0.62, -0.85], 0.20, { s: [1.0, 0.9, 1.0], k: 0.11 });
  S.sph('root', [0.95, 0.14, 1.55], 0.20, { s: [1.3, 0.5, 1.2], k: 0.12 });
  S.sph('breathA', [0.62, 0.55, 0.15], 0.16, { s: [0.9, 1.1, 0.85], k: 0.1 });  // knuckle row on the main lobe
  S.sph('breathA', [0.48, 0.50, 0.48], 0.13, { s: [0.95, 1.05, 0.9], k: 0.09 });
  S.sph('root', [1.15, 0.28, -0.72], 0.17, { s: [1.0, 0.8, 1.1], k: 0.11 });    // wedged against the wall base

  // ---- carves: break every dome. A deep waist between main lobe and the
  // north pod, a sag between wall flap and south pod, an undercut at the
  // ribcage so the chest reads as emerging, not embossed.
  S.carve([-0.35, 0.72, -0.78], 0.36, { k: 0.10 });
  S.carve([0.95, 0.92, 0.72], 0.42, { k: 0.10 });
  S.carve([0.05, 0.60, 1.02], 0.28, { k: 0.09 });   // split the south dome off the main lobe
  S.carveCap([-0.35, 0.0, -0.85], [0.35, 0.0, -0.78], 0.15, { k: 0.06 });   // floor gap under the waist

  return {
    bones: [
      ['root', null, 0, 0.1, 0],
      ['breathA', 'root', 0.35, 0.34, 0.30],
      ['breathB', 'root', -0.18, 0.52, 0.10],
      ['wallFlap', 'root', 1.58, 0.85, -0.25],
      ['sh', 'root', -0.98, 0.26, -0.52],
      ['el', 'sh', -1.16, 0.40, -0.72],
      ['wr', 'el', -1.46, 0.07, -0.56],
      ['faceS', 'root', -0.10, 0.42, 1.42],
      ['faceW', 'root', -0.48, 0.50, 0.85],
      ['faceWall', 'wallFlap', 1.56, 0.95, -0.40],
      ['faceC', 'root', 0.62, 0.26, -1.00],
      ['jawU', 'breathB', -0.44, 0.33, 0.19],
      ['jawL', 'breathB', -0.46, 0.21, 0.19],
      ['push', 'wallFlap', 1.52, 0.78, -0.44],
    ],
    sculpt: S,
    height: 1.7,
    domain: { cx: 0.05, cy: 0.78, cz: 0.0, hx: 1.85, hy: 1.05, hz: 1.95 },
    res: 132,
    noise: [0.07, 2.6, 0.02, 9.0],
    seed: 17.3,
  };
}

// ---------------------------------------------------------------- the skin
// Procedural canvas maps in the sickly palette the flat mass established:
// bruise purple, bile green, raw red, infected pink, grey rot — painted as
// organic mottle with waterline bands and capillary webs, not vertex blends.

function ctx2d(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c.getContext('2d');
}

let _skinSeed = 40501;
const srnd = () => { _skinSeed = (_skinSeed * 9301 + 49297) % 233280; return _skinSeed / 233280; };

function fleshAlbedoTex() {
  const g = ctx2d(512, 512);
  g.fillStyle = '#655458'; g.fillRect(0, 0, 512, 512);
  // waterline bands — the tide marks of something that soaked a long time
  // (few, faint, broken — regular stripes read as contour lines)
  for (let b = 0; b < 4; b++) {
    const y0 = srnd() * 512;
    g.fillStyle = 'rgba(56,50,61,0.07)';
    for (let x = 0; x < 512; x += 9) {
      if (srnd() < 0.22) continue;                       // broken runs, not a ruled line
      g.fillRect(x, y0 + Math.sin(x * 0.045 + b * 2.1) * 11 + (srnd() - 0.5) * 6, 9, 8 + srnd() * 10);
    }
  }
  // large soft mottle in the sickly palette
  const PALETTE = ['#4a2545', '#55602a', '#6e2020', '#7c4054', '#3f3a41', '#5b4a2e'];
  for (let i = 0; i < 120; i++) {
    const x = srnd() * 512, y = srnd() * 512, r = 16 + srnd() * 58;
    const grad = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    const col = PALETTE[(i * 7) % PALETTE.length];
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.16 + srnd() * 0.22;
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  // capillary webs — thin branching burst vessels
  for (let v = 0; v < 42; v++) {
    let x = srnd() * 512, y = srnd() * 512;
    let a = srnd() * Math.PI * 2;
    g.strokeStyle = v % 3 ? 'rgba(124,40,48,0.30)' : 'rgba(147,52,60,0.35)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y);
    const steps = 14 + (srnd() * 30) | 0;
    for (let s = 0; s < steps; s++) {
      a += (srnd() - 0.5) * 1.1;
      x += Math.cos(a) * 3.4; y += Math.sin(a) * 3.4;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // pore speckle
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = i % 2 ? 'rgba(20,14,18,0.12)' : 'rgba(190,170,168,0.07)';
    g.fillRect(srnd() * 512, srnd() * 512, 1 + (srnd() < 0.2 ? 1 : 0), 1);
  }
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function fleshNormalTex() {
  // height field → Sobel normal (npc/pipeline.js): raised mottle welts,
  // raised vein cords, recessed pores and tide bands
  return heightToNormalTex((g, W, H) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const x = srnd() * W, y = srnd() * H, r = 12 + srnd() * 46;
      const grad = g.createRadialGradient(x, y, r * 0.1, x, y, r);
      grad.addColorStop(0, i % 4 ? 'rgba(178,178,178,0.5)' : 'rgba(96,96,96,0.5)');
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      g.globalAlpha = 0.5;
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    for (let v = 0; v < 46; v++) {                       // vein cords stand proud
      let x = srnd() * W, y = srnd() * H, a = srnd() * Math.PI * 2;
      g.strokeStyle = 'rgba(196,196,196,0.55)';
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0, n = 12 + (srnd() * 26) | 0; s < n; s++) {
        a += (srnd() - 0.5) * 1.0;
        x += Math.cos(a) * 3.6; y += Math.sin(a) * 3.6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 1600; i++) {                     // pores sink
      g.fillStyle = 'rgba(70,70,70,0.5)';
      g.fillRect(srnd() * W, srnd() * H, 1, 1);
    }
  }, 512, 512, 2.2);
}

function fleshRoughTex() {
  const g = ctx2d(256, 256);
  g.fillStyle = '#e2e2e2'; g.fillRect(0, 0, 256, 256);   // matte base (×1.0 material roughness)
  for (let i = 0; i < 26; i++) {                         // fresh wet runs — glossy vertical streaks
    const x = srnd() * 256, y0 = srnd() * 180, len = 30 + srnd() * 90, w = 2 + srnd() * 6;
    const grad = g.createLinearGradient(x, y0, x, y0 + len);
    grad.addColorStop(0, 'rgba(96,96,96,0.0)');
    grad.addColorStop(0.35, 'rgba(96,96,96,0.55)');
    grad.addColorStop(1, 'rgba(96,96,96,0.0)');
    g.fillStyle = grad;
    g.fillRect(x - w / 2, y0, w, len);
  }
  for (let i = 0; i < 60; i++) {                         // damp blotches
    const x = srnd() * 256, y = srnd() * 256, r = 8 + srnd() * 26;
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, 'rgba(140,140,140,0.4)');
    grad.addColorStop(1, 'rgba(140,140,140,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(g.canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildTheThing() {
  // The real skin (T4): MeshPhysical with killed broad specular + a thin wet
  // clearcoat (the monsters' anti-blowout recipe, enemies.js buildRig), the
  // sickly-palette albedo painted in texture space, and baked cavity AO in
  // vertex colors. Injected GLSL (below) adds torch-gated subsurface,
  // lividity, a slow peristalsis wave, and the traveling under-skin bulge.
  const skin = new THREE.MeshPhysicalMaterial({
    map: fleshAlbedoTex(),
    normalMap: fleshNormalTex(),
    roughnessMap: fleshRoughTex(),
    normalScale: new THREE.Vector2(0.75, 0.75),
    color: 0xc9c2c4,                 // near-white multiplier — the palette lives in the map
    roughness: 1.0,                  // the map carries it
    metalness: 0,
    specularIntensity: 0.12,         // kill the torch's broad white specular glaze
    clearcoat: 0.42,                 // thin lake-wet film
    clearcoatRoughness: 0.42,
    emissive: 0x190406, emissiveIntensity: 0.1,   // faint inner heat, pulsed with the breath
    vertexColors: true,              // baked cavity AO
  });
  const uBulgePos = new THREE.Vector3(0.3, 0.45, -0.2);
  skin.onBeforeCompile = (shader) => {
    shader.uniforms.uSSSCol = { value: new THREE.Color(0x8fa39a) };
    shader.uniforms.uSSSStr = { value: 0.55 };
    shader.uniforms.uLividCol = { value: new THREE.Color(0x232c36) };
    shader.uniforms.uBodyH = { value: 1.6 };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWaveAmp = { value: 0 };
    shader.uniforms.uBulgePos = { value: uBulgePos };
    shader.uniforms.uBulgeAmt = { value: 0 };
    shader.vertexShader = 'varying float vObjY;\nuniform float uTime;\nuniform float uWaveAmp;\nuniform vec3 uBulgePos;\nuniform float uBulgeAmt;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vObjY = position.y;
        // slow peristalsis — two crossing waves creep across the sprawl
        float thingWave = sin(position.z * 2.1 + uTime * 0.7) * sin(position.x * 1.7 - uTime * 0.53);
        vec3 thingDb = position - uBulgePos;
        float thingBulge = exp(-dot(thingDb, thingDb) * 18.0);
        transformed += objectNormal * (uWaveAmp * thingWave + uBulgeAmt * thingBulge);`);
    shader.fragmentShader = 'varying float vObjY;\n' +
      'uniform vec3 uSSSCol;\nuniform float uSSSStr;\nuniform vec3 uLividCol;\nuniform float uBodyH;\n' +
      shader.fragmentShader
        // lividity — pooled-blood shift low on the body (same block as the monsters)
        .replace('#include <map_fragment>',
          `#include <map_fragment>
          float lv = smoothstep(uBodyH * 0.02, uBodyH * 0.5, vObjY);
          diffuseColor.rgb = mix(mix(uLividCol, diffuseColor.rgb, 0.6), diffuseColor.rgb, lv);`)
        // torch-gated fake subsurface — waxy rim ONLY where the beam lands
        .replace('#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float rim = pow(1.0 - ndv, 2.5);
          float lit = dot(reflectedLight.directDiffuse, vec3(0.3333));
          reflectedLight.directDiffuse += uSSSCol * lit * rim * uSSSStr;`);
    skin.userData.shader = shader;
  };
  skin.customProgramCacheKey = () => 'unfinished-skin';
  const spec = thingSpec();
  const { mesh, bones, tris } = buildSkinnedRig(spec, skin);
  // gentle cavity shading only — a strong bake reads as a burnt/aubergine body
  bakeAO(mesh.geometry, { strength: 0.65, spread: 2, aoMin: 0.78 });

  // Always-resident set-piece: unlike the monsters we KEEP frustum culling
  // (buildSkinnedRig disables it) and hand-inflate the bounds to cover every
  // pose, so the ~110k skinned verts cost nothing while the room is off-screen.
  mesh.frustumCulled = true;
  mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.05, 0.8, -0.15), 3.4);

  const group = new THREE.Group();
  group.add(mesh);

  // ---- void plugs: unlit near-black inserts deep in every bored socket and
  // mouth (the cellar-girl eye trick) — carved hollows wash out under a
  // frontal torch, but MeshBasic black stays a hole in any light. Plugs are
  // MERGED into ONE mesh per face bone (draw-call budget), and each rides its
  // bone so the holes turn with the face. Each sits DEEP in its bore —
  // visible only through the opening (proud plugs read as black balls).
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x050304 });
  const PLUGS = {
    faceS: [
      [-0.245, 0.482, 1.52, 0.07, [1, 1, 0.55]],
      [0.062, 0.492, 1.53, 0.07, [1, 1, 0.55]],
      [-0.10, 0.268, 1.54, 0.09, [1, 1, 0.5]],
    ],
    faceW: [
      [-0.585, 0.578, 0.755, 0.047, [0.55, 1, 1]],
      [-0.585, 0.568, 0.945, 0.047, [0.55, 1, 1]],
      [-0.575, 0.375, 0.85, 0.058, [0.5, 1, 1]],
    ],
    faceWall: [
      [1.485, 1.025, -0.50, 0.042, [0.5, 1, 1]],
      [1.485, 0.84, -0.40, 0.052, [0.5, 1, 1]],
    ],
    faceC: [
      [0.52, 0.285, -1.06, 0.04, [1, 0.55, 1]],
      [0.72, 0.295, -0.96, 0.04, [1, 0.55, 1]],
      [0.61, 0.275, -0.87, 0.055, [1, 0.5, 1]],
    ],
    // deep inside the seam channel — a dark line until the jaws part
    jawU: [[-0.45, 0.27, 0.19, 0.16, [0.35, 0.28, 1.35]]],
  };
  for (const [boneName, list] of Object.entries(PLUGS)) {
    const b = bones[boneName];
    const geos = list.map(([x, y, z, r, sc]) => {
      const gg = new THREE.SphereGeometry(r, 10, 8);
      gg.scale(sc[0], sc[1], sc[2]);
      gg.translate(x - b.userData.wx, y - b.userData.wy, z - b.userData.wz);
      return gg;
    });
    const m = new THREE.Mesh(mergeGeometries(geos, false), voidMat);
    b.add(m);
  }

  // ---- the photo eyes: pale orbs seated just proud of the socket plugs,
  // INVISIBLE in the live world — surfaced only for the polaroid capture
  // render (reveals flow). In the photo, the sockets have eyes.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c2 });
  const EYES = {
    faceS: [[-0.245, 0.482, 1.565, 0.042], [0.062, 0.492, 1.575, 0.042]],
    faceW: [[-0.615, 0.578, 0.755, 0.028], [-0.615, 0.568, 0.945, 0.028]],
    faceWall: [[1.455, 1.025, -0.50, 0.025]],
    faceC: [[0.52, 0.325, -1.06, 0.024], [0.72, 0.335, -0.96, 0.024]],
  };
  const eyeMeshes = [];
  for (const [boneName, list] of Object.entries(EYES)) {
    const b = bones[boneName];
    const geos = list.map(([x, y, z, r]) => {
      const gg = new THREE.SphereGeometry(r, 10, 8);
      gg.translate(x - b.userData.wx, y - b.userData.wy, z - b.userData.wz);
      return gg;
    });
    const m = new THREE.Mesh(mergeGeometries(geos, false), eyeMat);
    m.visible = false;
    b.add(m);
    eyeMeshes.push(m);
  }

  // ---- teeth: two arcs of small wet cones strung inside the seam, riding
  // the jaw bones — hidden in the channel until the convulsion gapes it.
  const teethMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8ccb0, roughness: 0.5, metalness: 0,
    specularIntensity: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.35,
  });
  const seamA = new THREE.Vector3(-0.50, 0, -0.02), seamB = new THREE.Vector3(-0.36, 0, 0.40);
  const toothRow = (boneName, y, sign) => {
    const b = bones[boneName];
    const geos = [];
    for (let i = 0; i < 8; i++) {
      const s = 0.08 + (i / 7) * 0.84;
      const r = 0.010 + Math.abs(Math.sin(i * 2.6)) * 0.007;
      const h = 0.028 + Math.abs(Math.sin(i * 1.7 + 1)) * 0.02;
      const gg = new THREE.ConeGeometry(r, h, 6);
      if (sign < 0) gg.rotateX(Math.PI);                 // upper teeth hang point-down
      gg.rotateZ((Math.sin(i * 3.3) * 0.2));
      gg.translate(
        seamA.x + (seamB.x - seamA.x) * s - 0.015 - b.userData.wx,
        y + sign * h * 0.4 - b.userData.wy,
        seamA.z + (seamB.z - seamA.z) * s - b.userData.wz
      );
      geos.push(gg);
    }
    const m = new THREE.Mesh(mergeGeometries(geos, false), teethMat);
    m.castShadow = false;
    b.add(m);
  };
  toothRow('jawU', 0.315, -1);
  toothRow('jawL', 0.235, 1);

  // ---- the real hand at the end of the planted arm: makeHand in the SAME
  // skin material (it must read as of-the-flesh, not attached), a shade too
  // big, fingers toward the doorway, palm pressed to the boards.
  const hand = makeHand(skin, 0.07, { spread: 1.05, curl: 0.4 });
  hand.rotation.set(Math.PI / 2, 0, Math.PI / 2);        // fingers -x, palm down
  hand.position.set(-0.10, -0.015, 0.07);                // rides the wrist bone
  bones.wr.add(hand);

  // ---- sinew tendrils: taut low cords rooting the mass to the boards and
  // the chimney stone. They get their OWN material — the body skin has
  // vertexColors:true and TubeGeometry carries no color attribute (renders
  // black) — sharing the same albedo map so the flesh matches.
  const sinewMat = new THREE.MeshPhysicalMaterial({
    map: skin.map, color: 0xb4a8ab, roughness: 0.8, metalness: 0,
    specularIntensity: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.5,
  });
  const tendrilGeos = [];
  const cord = (pts, r) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1] - 0.1, p[2])));
    tendrilGeos.push(new THREE.TubeGeometry(curve, 14, r, 5, false));
  };
  // every cord starts INSIDE flesh and ends INSIDE floor/stone — no free ends
  cord([[-1.0, 0.14, 0.40], [-1.28, 0.07, 0.60], [-1.46, -0.02, 0.78]], 0.020);   // skirt → boards, SW
  cord([[-0.8, 0.18, -0.68], [-1.1, 0.09, -0.9], [-1.32, -0.02, -1.0]], 0.017);   // shoulder → boards, NW
  cord([[0.5, 0.3, -1.05], [0.72, 0.26, -1.22], [0.92, 0.18, -1.34]], 0.024);     // welt → chimney stone
  cord([[1.08, 0.24, -1.0], [1.28, 0.22, -1.18], [1.48, 0.16, -1.34]], 0.016);    // second stone anchor
  cord([[-0.88, 0.26, -0.44], [-1.04, 0.16, -0.5], [-1.2, 0.04, -0.54]], 0.014);  // armpit sinew bridge
  cord([[0.2, 0.1, 1.5], [-0.02, 0.06, 1.68], [-0.22, -0.02, 1.8]], 0.015);       // south rim → boards
  const tendrils = new THREE.Mesh(mergeGeometries(tendrilGeos, false), sinewMat);
  tendrils.castShadow = false;
  bones.root.add(tendrils);

  // ---- animation state -------------------------------------------------
  // Two free-running breath clocks that never sync, plus the face/observation
  // machine. All scratch objects are closure-level — zero per-frame allocs.
  let tA = 0, tB = Math.PI * 0.7, tAcc = 0;
  const DORMANT_TICK = 0.2;          // player not upstairs → 5 Hz, breath only

  // faces: rest = the direction the face points when unbothered (local)
  const FACES = [
    { b: bones.faceS, rest: new THREE.Vector3(0, 0.15, 1).normalize(), amp: 0.30, r1: 0.31, r2: 0.17 },
    { b: bones.faceW, rest: new THREE.Vector3(-1, 0.12, 0).normalize(), amp: 0.30, r1: 0.23, r2: 0.41 },
    { b: bones.faceWall, rest: new THREE.Vector3(-1, 0, -0.1).normalize(), amp: 0.22, r1: 0.17, r2: 0.29 },
    { b: bones.faceC, rest: new THREE.Vector3(0, 1, 0), amp: 0.25, r1: 0.37, r2: 0.13 },
  ];
  const _gpos = new THREE.Vector3(), _pl = new THREE.Vector3(), _look = new THREE.Vector3();
  const _tgt = new THREE.Vector3(), _axis = new THREE.Vector3(), _q = new THREE.Quaternion();

  let lurchDone = false, lurchT = -1;
  let regardT = 0, awayT = 0, wasRegarded = false, shiftCd = 0, shiftPending = false;
  let flapLean = 0;
  let convT = -1, convCd = 0, convCount = 0, convAmp = 1;   // the flash convulsion

  const jawUBaseY = bones.jawU.position.y, jawLBaseY = bones.jawL.position.y;
  const pushBaseX = bones.push.position.x;
  let pushAmt = 0, jawGape = 0;   // jawGape: 0 closed … 1 = the convulsion gape (T9)

  function applyBreath(d) {
    // breath deepens and quickens slightly as the player closes in
    const near = d < 8 ? 1 - d / 8 : 0;
    const bA = 0.5 + 0.5 * Math.sin(tA);
    const bB = 0.5 + 0.5 * Math.sin(tB);
    bones.breathA.scale.setScalar(1 + (0.050 + 0.02 * near) * bA);
    bones.breathB.scale.setScalar(1 + (0.085 + 0.03 * near) * bB);
    bones.wallFlap.rotation.z = flapLean + 0.012 * bA;
    skin.emissiveIntensity = 0.07 + 0.12 * bA;          // the inner heat rides the deep breath
    // the seam parts millimetres with the ribcage breath — and wide on jawGape
    bones.jawU.position.y = jawUBaseY + 0.0045 * bB + 0.085 * jawGape;
    bones.jawL.position.y = jawLBaseY - 0.0035 * bB - 0.065 * jawGape;
    bones.jawU.rotation.x = -0.25 * jawGape;
    bones.jawL.rotation.x = 0.2 * jawGape;
    return near;
  }

  // shader-side motion: peristalsis amplitude + the traveling under-skin
  // bulge (surfaces only when someone is close and NOT looking)
  let waveAmp = 0, bulgeAmt = 0;
  function driveShader(dt, t, near, looking) {
    const sh = skin.userData.shader;
    if (!sh) return;
    sh.uniforms.uTime.value = t;
    const waveTgt = near > 0 ? 0.008 + 0.006 * near : 0.004;
    waveAmp += (waveTgt - waveAmp) * Math.min(1, dt * 2);
    sh.uniforms.uWaveAmp.value = waveAmp;
    const bulgeTgt = (near > 0.25 && !looking) ? 0.05 + 0.04 * near : 0;
    bulgeAmt += (bulgeTgt - bulgeAmt) * Math.min(1, dt * 1.4);
    sh.uniforms.uBulgeAmt.value = bulgeAmt;
    uBulgePos.set(
      0.32 + 0.55 * Math.sin(t * 0.11 + 2.0),
      0.42,
      -0.25 + 0.85 * Math.sin(t * 0.073 + 0.6)
    );
  }

  // aim a face's rest direction at the player (clamped, slewed by k 0..1)
  function aimFace(f, k) {
    _tgt.copy(_pl);
    _tgt.x -= f.b.userData.wx; _tgt.y -= f.b.userData.wy; _tgt.z -= f.b.userData.wz;
    const len = _tgt.length();
    if (len < 1e-3) return;
    _tgt.divideScalar(len);
    _axis.crossVectors(f.rest, _tgt);
    const al = _axis.length();
    if (al < 1e-4) return;
    _axis.divideScalar(al);
    const ang = Math.min(Math.acos(THREE.MathUtils.clamp(f.rest.dot(_tgt), -1, 1)), f.amp);
    _q.setFromAxisAngle(_axis, ang);
    f.b.quaternion.slerp(_q, k);
  }

  function doShift() {
    // ONE wet reposition, executed while unobserved: parts are elsewhere
    // when the player looks back. Instant — no eased motion to catch.
    for (const f of FACES) {
      if (Math.random() < 0.7) {
        _axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        _q.setFromAxisAngle(_axis, Math.random() * f.amp * 0.8);
        f.b.quaternion.copy(_q);
      }
    }
    bones.el.rotation.y = (Math.random() - 0.5) * 0.24;   // the arm re-plants
    bones.wr.rotation.z = (Math.random() - 0.5) * 0.30;
    bones.sh.rotation.x = (Math.random() - 0.5) * 0.10;
    flapLean = (Math.random() - 0.5) * 0.10;              // the sheet leans differently
    tA += Math.random() * 1.5;                            // the breath catches
  }

  function doLurch(ctx) {
    lurchDone = true; lurchT = 0; shiftCd = 2.5;
    for (const f of FACES) aimFace(f, 1);                 // every face, at once
    ctx.onEvent?.('lurch');
  }

  let holdT = 0, nextHold = 26, surgeT = 0;   // held breaths — the deep breath CATCHES
  let drumT = -1, drumIn = 22;                // finger drum on the planted hand

  function update(dt, t, ctx) {
    // clocks always advance (the breath must not "pause" while away) — except
    // for the held-breath tell: every ~half minute the deep breath catches for
    // a couple of seconds (the bed goes silent with it), then surges to catch up
    nextHold -= dt;
    if (nextHold <= 0) { holdT = 2.0 + Math.random() * 1.4; nextHold = 22 + Math.random() * 18; surgeT = 1.4; }
    if (holdT > 0) holdT -= dt;
    else {
      const surge = surgeT > 0 ? (surgeT -= dt, 2.1) : 1;
      tA += dt * surge * (0.88 + 0.34 * Math.sin(t * 0.21));   // uneven, wrong
    }
    tB += dt * 2.3;

    // quality tier: on Low, skip the torch-shadow pass for the big mesh (its
    // only measurable cost); everything else is already throttled/culled
    if (ctx && ctx.tier) {
      const wantShadow = ctx.tier !== 'low';
      if (mesh.castShadow !== wantShadow) mesh.castShadow = wantShadow;
    }

    if (!ctx || !ctx.upstairs) {
      lurchDone = false;                                  // the lurch re-arms per visit
      regardT = 0; awayT = 0; wasRegarded = false;
      tAcc += dt;
      if (tAcc < DORMANT_TICK) return;                    // dormant: cheap 5 Hz tick
      tAcc = 0;
      applyBreath(99);
      return;
    }

    // player in group-local coords (the group is unrotated)
    group.getWorldPosition(_gpos);
    _pl.copy(ctx.playerPos).sub(_gpos);
    _pl.y += 1.5;                                         // aim at the eyes, not the boots
    const d = Math.hypot(_pl.x, _pl.z);

    // is the player LOOKING at it? (dot of camera dir against the line to it)
    _look.copy(_gpos).sub(ctx.playerPos);
    _look.y += 0.8;                                       // its heart height
    _look.normalize();
    const lookDot = ctx.camDir.dot(_look);
    const looking = lookDot > 0.55 && d < 6.0;

    // ---- ENTRY LURCH: first sight this visit → the RUN beat
    if (!lurchDone && d < 5.4 && lookDot > 0.25) doLurch(ctx);

    // ---- regard / look-away bookkeeping
    shiftCd -= dt;
    if (looking) {
      regardT += dt; awayT = 0;
      shiftPending = false;                     // looked back before it moved — nothing happened
      if (regardT > 0.6) wasRegarded = true;
    } else {
      awayT += dt;
      // once the look-away commits (0.7 s), a reposition is OWED; it executes
      // the moment the cooldown clears — still unobserved — and only once
      if (wasRegarded && awayT >= 0.7) { shiftPending = true; wasRegarded = false; }
      if (shiftPending && shiftCd <= 0 && d < 9) {
        doShift();
        shiftPending = false;
        shiftCd = 6 + Math.random() * 3;
        ctx.onEvent?.('shift');
      }
      if (awayT > 2) regardT = 0;
    }

    const near = applyBreath(d);
    driveShader(dt, t, near, looking);

    // ---- PRESSED: crowd it and the hand under the wall sheet tents outward
    // toward the room — this one moves even while watched (a threat display,
    // like the lurch, not a stealth reposition)
    const pushTgt = d < 2.2 ? 0.055 + 0.018 * Math.sin(t * 2.7) : 0.008;
    pushAmt += (pushTgt - pushAmt) * Math.min(1, dt * 2.2);
    bones.push.position.x = pushBaseX - pushAmt;

    // ---- faces: track slowly when unwatched; FREEZE while watched
    if (!looking && lurchT < 0) {
      const k = 1 - Math.exp(-dt * 1.1);                  // slow, patient slew
      for (const f of FACES) {
        if (d < 8) {
          aimFace(f, k);
        } else {
          // idle drift — barely-alive listening motion, per-face rhythm
          f.b.rotation.set(
            0.05 * Math.sin(t * f.r1 + f.r2 * 7),
            0.06 * Math.sin(t * f.r2 + f.r1 * 3),
            0.025 * Math.sin(t * (f.r1 + f.r2))
          );
        }
      }
      // the planted hand drums its fingers — a few soft taps, only unwatched
      drumIn -= dt;
      if (drumIn <= 0 && d < 8 && convT < 0) { drumT = 1.1; drumIn = 18 + Math.random() * 17; }
      if (drumT > 0) {
        drumT -= dt;
        const env = Math.min(1, drumT / 0.25) * Math.min(1, (1.1 - drumT) / 0.15);
        bones.wr.rotation.x = Math.abs(Math.sin((1.1 - drumT) * 17)) * 0.09 * env;
        if (drumT <= 0) bones.wr.rotation.x = 0;
      }
    }

    // ---- the lurch + convulsion envelopes (they share the root bone; both
    // play even while watched — they ARE the reactions)
    convCd -= dt;
    let a1 = 0, a2 = 0;
    if (lurchT >= 0) {
      lurchT += dt;
      a1 = lurchT < 0.14 ? lurchT / 0.14 : Math.exp(-(lurchT - 0.14) * 2.4);
      if (lurchT > 2.4) { lurchT = -1; a1 = 0; }
    }
    if (convT >= 0) {
      convT += dt;
      a2 = (convT < 0.1 ? convT / 0.1 : Math.exp(-(convT - 0.1) * 1.6)) * convAmp;
      jawGape = a2;                                       // the seam BARES its teeth
      // the arm slaps the boards once, at the start
      const slap = convT < 0.3 ? Math.sin((convT / 0.3) * Math.PI) : 0;
      bones.el.rotation.x = -0.28 * slap * convAmp;
      if (convT > 3) { convT = -1; jawGape = 0; a2 = 0; bones.el.rotation.x = 0; }
    }
    if (lurchT >= 0 || convT >= 0 || a1 > 0 || a2 > 0) {
      bones.root.rotation.z = 0.13 * a1;                  // lurch: tips toward the door
      bones.root.position.x = -0.14 * a1;
      bones.root.position.y = 0.06 * a2;                  // convulsion: arches up IN PLACE
      bones.root.rotation.x = -0.05 * a2;
      const s = 1 + 0.07 * a1 + 0.05 * a2;
      bones.root.scale.set(s, s * 1.03, s);
    } else if (bones.root.scale.x !== 1) {
      bones.root.rotation.set(0, 0, 0);
      bones.root.position.set(0, 0.1, 0);
      bones.root.scale.setScalar(1);
    }
    return near;
  }

  // did a camera flash catch it? Fired from the main.js shutter path. It
  // NEVER leaves its spot — the reaction is one in-place convulsion: the seam
  // gapes, the body arches, every face snaps to the lens. Diminishing on
  // repeat (60 s refractory; third time it only tightens — it has learned).
  function flash(camPos, camDir) {
    group.getWorldPosition(_gpos);
    _look.copy(_gpos).sub(camPos);
    _look.y += 0.8;
    const d = _look.length();
    if (d > 9.5) return 0;
    _look.divideScalar(d);
    if (camDir.dot(_look) < 0.45) return 0;
    _pl.copy(camPos).sub(_gpos);                          // faces aim at the lens (camPos is the eye)
    for (const f of FACES) aimFace(f, 1);
    if (convCd > 0 || convCount >= 2) {
      // learned: no spasm, just a slow deliberate tightening
      convCount++;
      if (convT < 0) { convT = 0; convAmp = 0.15; convCd = Math.max(convCd, 20); }
      return 0.15;
    }
    convCount++;
    convAmp = convCount === 1 ? 1 : 0.55;
    convT = 0; convCd = 60;
    return convAmp;
  }

  // photo-form: how it looks IN THE PHOTO (reveals capture render only) —
  // the sockets have eyes, and the under-skin swell is at full crest.
  function setPhotoForm() {
    for (const m of eyeMeshes) m.visible = true;
    const sh = skin.userData.shader;
    if (sh) sh.uniforms.uBulgeAmt.value = 0.12;
  }
  function clearPhotoForm() {
    for (const m of eyeMeshes) m.visible = false;
    const sh = skin.userData.shader;
    if (sh) sh.uniforms.uBulgeAmt.value = bulgeAmt;
  }

  return {
    group, update, bones, mesh, tris,
    flash, setPhotoForm, clearPhotoForm,
    breathLevel: () => 0.5 + 0.5 * Math.sin(tA),   // for the audio bed (T11)
    // headless-test hook: internals the harness can assert on
    debug: () => ({ lurchDone, lurchT, wasRegarded, shiftCd: +shiftCd.toFixed(2), flapLean: +flapLean.toFixed(3), convT: +convT.toFixed(2), convCount }),
  };
}
