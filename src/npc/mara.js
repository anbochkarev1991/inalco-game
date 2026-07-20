import * as THREE from 'three';
import { NPCTEX } from './shared.js';
import { sculptShell } from './pipeline.js';
import { Sculpt, buildSkinnedRig } from '../monstermesh.js';
import { skinMatV2, steelMat } from './materials.js';
import { makeHead } from './face.js';
import { makeHand, makeHeadlamp } from './parts.js';

// -------------------------------------------------------------- jacketMat
// The field jacket wears the CC0 herringbone (NPCTEX.herring*), but on a
// specular-DROPPED MeshPhysicalMaterial rather than the library clothMat.
// WHY: clothMat is a MeshStandardMaterial, and — proven in materials.js and
// confirmed in the point-blank capture here — the dielectric specular glaze of
// a MeshStandard blows CREAM under the 115 cd torch no matter how dark the
// albedo, so a clothMat jacket cannot pass the "no white blowout point-blank"
// gate. This mirrors the library's own anti-bloom fix (drownedSkinMat /
// garmentDarkMat / makeHat all drop specularIntensity): the same herringbone
// maps dye a dark teal, the normal + roughness maps keep the weave reading in
// the beam, and the near-zero specular means the surface can't glaze white.
// vertexColors carries the shell's baked fold-AO. Textures are CLONED before
// their repeat is set so the shared CC0 maps are never mutated.
function jacketMat(color, { repeat = [1.4, 1.5], normalScale = 1.25, specular = 0.08, vertexColors = true } = {}) {
  const clone = (t) => {
    if (!t) return null;
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.99, metalness: 0, specularIntensity: specular, vertexColors,
  });
  const mp = clone(NPCTEX.herringDiff), nr = clone(NPCTEX.herringNor), rg = clone(NPCTEX.herringRough);
  if (mp) m.map = mp;
  if (nr) { m.normalMap = nr; m.normalScale = new THREE.Vector2(normalScale, normalScale); }
  if (rg) m.roughnessMap = rg;
  return m;
}

// ============================================================ Mara Vidal
// The sleepless producer, gone to ground in the greenhouse. She sits on the
// floor HUGGING HER KNEES, hood up, a dead brow-lamp still strapped on. The
// read has to be unambiguous at torch range: a frightened woman folded into a
// field jacket — hood framing a living, tired face, two DISTINCT knees drawn
// to the chest with a cleft between them, shins and boots below, and both arms
// wrapped round to clasp in front.
//
// Structure (why it's built this way):
//   * the JACKET is one cloth-tuned sculptShell (folds survive, fold-AO baked
//     to vertex colours) so hood/shoulders/wrapped-arms/knees/shins read as a
//     garment, not a smooth boulder;
//   * the FACE is a real makeHead — lifted clear of the hood so both eyes and
//     the nose read — with the OFF headlamp parented to it;
//   * the HANDS are makeHand, clasped in front over the shins.
// Everything is static/baked: the game update() only rotates + breathes the
// group and rotates the head (lift-when-near, brittle sway, over-the-shoulder
// startle). The local frame is unchanged from the previous Mara: origin on the
// ground between the boots, +z forward, so buildNPCs placement / relocate hold.
//
// TORCH RULE (SpotLight 115 / decay 2, ACESFilmic @ 1.07): a lit MeshStandard
// blows cream point-blank, so the jacket rides on jacketMat below (the CC0
// herringbone on a specular-dropped MeshPhysical — DARK teal dyeing the greyish
// weave down, strong roughMap, tuned repeat so the weave still READS in the
// beam without glazing white), the skin on the specular-dropped skinMatV2, and
// the lamp lens is unlit black.
export function buildMara() {
  const g = new THREE.Group();

  const skinTone = '#c08a68';                       // warm, alive — not a corpse
  const skin = skinMatV2(skinTone, { rough: 0.74 });

  // dark teal field jacket: the CC0 herringbone map (greyish) is DYED down by
  // the dark colour, its normal + roughness carry the weave, and vertexColors
  // lets the baked fold-AO deepen the valleys. repeat tuned so a herringbone
  // grain still reads at ~3 m without turning to noise.
  const jacket = jacketMat(0x2b4446, { repeat: [1.4, 1.5], normalScale: 1.35, specular: 0.09 });

  // ----------------------------------------------------------- jacket shell
  // One continuous garment mass. Blend radii (k) are kept LOW where two forms
  // must stay separate (the two knees, the shin gap) and higher where cloth
  // should flow (back → hood). A carve down the centre keeps the knee cleft
  // from smoothing shut.
  const shell = sculptShell((S) => {
    // seat + pelvis + hunched back, leaning forward over the drawn-up knees
    S.sph(null, [0, 0.22, -0.07], 0.18, { s: [1.12, 0.82, 1.02], k: 0.09 });        // seat on the floor
    S.cap(null, [0, 0.27, -0.08], [0, 0.48, -0.04], 0.155, { k: 0.09 });            // lower back
    S.cap(null, [0, 0.48, -0.04], [0, 0.71, 0.03], 0.15, { k: 0.09 });              // upper back (hunched fwd)
    // hunched shoulders wrapping up around the neck
    S.cap(null, [-0.15, 0.72, 0.02], [0.15, 0.72, 0.02], 0.095, { k: 0.07 });       // rounded shoulder line
    S.sph(null, [-0.155, 0.72, 0.03], 0.10, { k: 0.05 });
    S.sph(null, [0.155, 0.72, 0.03], 0.10, { k: 0.05 });

    // hood: a dome over/behind the head with a drape down the back, then the
    // FRONT carved open so the face sits in a real opening (the leftover rim is
    // the hood edge framing her face).
    S.sph(null, [0, 0.91, -0.03], 0.175, { s: [1.05, 1.08, 1.06], k: 0.06 });       // hood crown
    S.cap(null, [0, 0.88, -0.06], [0, 0.62, -0.11], 0.13, { k: 0.08 });             // hood drape down the back
    S.carve([0, 0.885, 0.17], 0.125, { k: 0.05 });                                  // face opening
    S.carve([0, 0.985, 0.19], 0.075, { k: 0.03 });                                  // open the top rim

    // turned collar — a soft raised band around the throat, brought up under
    // the chin so it swallows the neck (no bare throat blowing white in the beam)
    S.sph(null, [0, 0.80, 0.085], 0.072, { k: 0.05 });
    S.sph(null, [-0.09, 0.80, 0.055], 0.062, { k: 0.05 });
    S.sph(null, [0.09, 0.80, 0.055], 0.062, { k: 0.05 });
    S.cap(null, [-0.06, 0.815, 0.075], [0.06, 0.815, 0.075], 0.05, { k: 0.05 });

    for (const s of [-1, 1]) {
      // thigh up to a DISTINCT knee (low k so the knee stays a knee)
      S.cap(null, [s * 0.09, 0.30, 0.05], [s * 0.135, 0.55, 0.27], 0.10, { k: 0.05 });
      S.sph(null, [s * 0.15, 0.60, 0.33], 0.107, { k: 0.03 });                       // knee cap
      // shin down to the boot — set out so there's a clear gap between the shins
      S.cap(null, [s * 0.14, 0.57, 0.35], [s * 0.15, 0.075, 0.45], 0.079, { k: 0.04 });
      // boot
      S.cap(null, [s * 0.15, 0.07, 0.43], [s * 0.15, 0.05, 0.58], 0.073, { s: [0.95, 0.72, 1.15], k: 0.05 });
      // arm wrapped over the outside of the knee, forearm to the front-centre clasp
      S.cap(null, [s * 0.15, 0.70, 0.05], [s * 0.185, 0.52, 0.28], 0.062, { k: 0.05 });
      S.cap(null, [s * 0.185, 0.52, 0.29], [s * 0.045, 0.475, 0.43], 0.058, { k: 0.05 });
      // rolled sleeve cuff bulge where the forearm ends over the shin
      S.sph(null, [s * 0.06, 0.475, 0.43], 0.062, { k: 0.035 });
    }

    // carve a vertical cleft between the two knees so they never fuse into one
    S.carveCap([0, 0.46, 0.30], [0, 0.66, 0.37], 0.052, { k: 0.03 });
  }, jacket, {
    domain: { cx: 0, cy: 0.5, cz: 0.16, hx: 0.42, hy: 0.62, hz: 0.46 },
    res: 84, taubin: 1, noise: [0.006, 5, 0.003, 21],
    uvH: 1.4, uRep: 2, vRep: 3, seed: 11, ao: true,
  });
  g.add(shell);

  // ------------------------------------------------------ zip / placket
  // A field-jacket front: a proud fabric placket up the throat with a steel
  // zip line and a pull. Sits high (above the drawn-up knees) so it reads.
  const placketMat = jacketMat(0x14201f, { repeat: [1, 3], normalScale: 1.0, specular: 0.06, vertexColors: false });
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.19, 0.02), placketMat);
  placket.position.set(0, 0.70, 0.115);
  placket.rotation.x = -0.18;
  placket.castShadow = true;
  g.add(placket);
  // zip coil: a thin DARK matte line (steel would blow white point-blank) with
  // only a small steel pull tab left to catch a realistic glint in the beam
  const coilMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0f0f, roughness: 0.9, metalness: 0.1, specularIntensity: 0.05 });
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.18, 0.008), coilMat);
  zip.position.set(0, 0.70, 0.127);
  zip.rotation.x = -0.18;
  g.add(zip);
  const pull = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.008), steelMat());
  pull.position.set(0, 0.635, 0.132);
  pull.rotation.x = -0.18;
  g.add(pull);

  // --------------------------------------------------------------- head
  // Lifted clear of the hood so BOTH eyes + the nose read. Warm, tired living
  // face (age 0.25 → dark under-eyes without wrinkles). The game eases
  // head.rotation.x between ~0.08 (you're near) and ~0.7 (folded away); the
  // opening + this rest pitch keep the face visible across that range.
  const { head } = makeHead({
    skinTone, age: 0.25, iris: '#4a3324', hair: 0x241a12,
    hairStyle: 'scalp', neckLen: 0.085,
    // a younger woman: softer, narrower jaw, lighter brow, a smaller nose
    shape: { faceLength: 1.02, jawWidth: 0.88, browHeavy: 0.75, noseLen: 0.9 },
    ruddy: 0.08,   // pale, cool, tired — not weathered
  });
  head.position.set(0, 0.90, 0.075);
  head.rotation.x = 0.42;                            // wary, head a little down at rest
  g.add(head);

  // dead brow headlamp (OFF), parented to the head so it lifts with her —
  // strapped across the FOREHEAD, above the brow, lens facing out (+z)
  const lamp = makeHeadlamp();
  lamp.position.set(0, 0.086, 0.075);
  lamp.rotation.x = -0.25;                          // tip the lens down her sightline
  lamp.scale.setScalar(0.82);
  head.add(lamp);

  // -------------------------------------------------------------- hands
  // Clasped in front over the tops of the shins where the forearms meet:
  // knuckles up, fingers curling down and interlocked (a self-holding grip),
  // not an open upturned palm.
  const clasp = new THREE.Group();
  clasp.position.set(0, 0.50, 0.44);
  clasp.rotation.x = 2.55;                            // fingers rolled down over the shins, backs up
  const hL = makeHand(skin, 0.048, { spread: 0.7, curl: 0.7 });
  hL.position.set(-0.022, 0, 0.006);
  hL.rotation.z = 0.35;
  clasp.add(hL);
  const hR = makeHand(skin, 0.048, { spread: 0.7, curl: 0.7 });
  hR.position.set(0.026, 0.004, -0.01);
  hR.rotation.y = Math.PI;                            // opposed hand, interlocked over the left
  hR.rotation.z = 0.35;
  clasp.add(hR);
  g.add(clasp);

  return { group: g, head };
}

// ============================================================ Mara — WALKING
// The seated buildMara() above is a frozen huddle with no skeleton. When Mara
// stands (clips her badge on) and travels to the fire or the boathouse, she
// needs a body that can actually STRIDE — so this builds a standing Mara as a
// SKINNED continuous mesh, through the exact monster pipeline (Sculpt →
// buildSkinnedRig → SkinnedMesh + Bone hierarchy). One SkinnedMesh ⇒ one
// material, so the whole clothed body rides the jacket material; the face
// (makeHead), hands (makeHand) and dead headlamp are non-skinned children of
// the neck/wrist bones, so they ride the walk rigidly (the same way monster
// faces ride the body). The local frame matches the seated rig — origin on the
// ground between the feet, +z forward — so buildNPCs placement / relocate hold.
//
// The bone names match poseMaraWalk() below and the monster convention:
//   hips → spine → neck → head; sh/el/wr arms; hj/kn legs (feet skinned to kn).
export function buildMaraWalker() {
  const g = new THREE.Group();
  const skinTone = '#c08a68';
  const skin = skinMatV2(skinTone, { rough: 0.74 });
  // one body material — no vertexColors (buildSkinnedRig bakes no AO attribute)
  const jacket = jacketMat(0x2b4446, { repeat: [1.4, 2.0], normalScale: 1.3, specular: 0.09, vertexColors: false });

  // bone spec: [name, parent, worldX, worldY, worldZ] — the sculpt IS the rest
  // pose (upright, arms down, legs straight). A ~1.6 m woman, feet at the floor.
  const bones = [
    ['hips',  null,   0,      0.92, 0],
    ['spine', 'hips', 0,      1.12, -0.01],
    ['neck',  'spine',0,      1.42, 0.01],
    ['head',  'neck', 0,      1.52, 0.02],
    ['sh0',   'spine',-0.205, 1.37, 0],
    ['sh1',   'spine', 0.205, 1.37, 0],
    ['el0',   'sh0',  -0.265, 1.12, 0.01],
    ['el1',   'sh1',   0.265, 1.12, 0.01],
    ['wr0',   'el0',  -0.285, 0.87, 0.02],
    ['wr1',   'el1',   0.285, 0.87, 0.02],
    ['hj0',   'hips', -0.10,  0.90, 0],
    ['hj1',   'hips',  0.10,  0.90, 0],
    ['kn0',   'hj0',  -0.11,  0.49, 0.01],
    ['kn1',   'hj1',   0.11,  0.49, 0.01],
  ];

  const S = new Sculpt();
  // ---- torso: pelvis → hunched-forward jacket bulk → shoulder line. The torso
  // is kept NARROW in x so the arms hang clear of it with a real armpit gap.
  S.cap('hips',  [0, 0.84, 0],       [0, 1.00, 0],       0.15,  { s: [1.02, 1, 0.82] });
  S.cap('spine', [0, 1.00, -0.005],  [0, 1.34, -0.02],   0.15,  { s: [0.96, 1, 0.78] });
  S.cap('spine', [-0.185, 1.36, 0],  [0.185, 1.36, 0],   0.092, { k: 0.06 });   // shoulder line
  S.sph('sh0',   [-0.205, 1.36, 0],  0.086);
  S.sph('sh1',   [ 0.205, 1.36, 0],  0.086);
  // neck stub + a turned collar band swallowing the throat (no bare skin blowing white)
  S.cap('neck',  [0, 1.33, 0],       [0, 1.45, 0.01],    0.055, { k: 0.05 });
  S.sph('spine', [0, 1.325, 0.055],  0.072, { k: 0.05 });
  S.sph('spine', [-0.085, 1.325, 0.03], 0.06, { k: 0.05 });
  S.sph('spine', [ 0.085, 1.325, 0.03], 0.06, { k: 0.05 });

  for (const s of [-1, 1]) {
    const sh = s < 0 ? 'sh0' : 'sh1', el = s < 0 ? 'el0' : 'el1', wr = s < 0 ? 'wr0' : 'wr1';
    const hj = s < 0 ? 'hj0' : 'hj1', kn = s < 0 ? 'kn0' : 'kn1';
    // arm hangs OUT from the torso with a clear armpit gap so it reads as a
    // separate limb (not fused to the body) and its swing is visible. Low blend
    // k keeps the field from webbing the arm back into the torso.
    S.cap(sh, [s * 0.205, 1.35, 0],    [s * 0.265, 1.12, 0.01], 0.052, { k: 0.035 });   // upper arm, angled out
    S.sph(el, [s * 0.265, 1.12, 0.01], 0.048);
    S.cap(el, [s * 0.265, 1.12, 0.01], [s * 0.285, 0.87, 0.02], 0.045, { k: 0.035 });   // forearm
    S.cap(wr, [s * 0.285, 0.87, 0.02], [s * 0.285, 0.81, 0.03], 0.045, { s: [1, 1, 0.72], k: 0.03 });
    // leg: thigh (hip→knee), knee, shin (→ankle), boot
    S.cap(hj, [s * 0.10, 0.94, 0],     [s * 0.11, 0.50, 0.005], 0.088, { k: 0.055 });
    S.sph(kn, [s * 0.11, 0.49, 0.01],  0.072);
    S.cap(kn, [s * 0.11, 0.49, 0.005], [s * 0.11, 0.11, 0],     0.062, { k: 0.05 });
    S.cap(kn, [s * 0.11, 0.09, -0.02], [s * 0.11, 0.05, 0.14],  0.062, { s: [0.92, 0.72, 1.2], k: 0.04 });
  }
  // fill the crotch/seat so the two thighs join the pelvis cleanly
  S.cap('hips', [-0.09, 0.90, 0], [0.09, 0.90, 0], 0.10, { k: 0.07 });

  const { mesh, bones: b } = buildSkinnedRig({
    sculpt: S, bones, height: 1.62,
    domain: { cx: 0, cy: 0.82, cz: 0.02, hx: 0.42, hy: 0.9, hz: 0.42 },
    res: 84, noise: [0.006, 5, 0.003, 21], seed: 11,
  }, jacket);
  g.add(mesh);

  // -------- face: a real makeHead, riding the head bone so it bobs with the walk
  const { head } = makeHead({
    skinTone, age: 0.25, iris: '#4a3324', hair: 0x241a12,
    hairStyle: 'scalp', neckLen: 0.16,
    shape: { faceLength: 1.02, jawWidth: 0.88, browHeavy: 0.75, noseLen: 0.9 },
    ruddy: 0.08,
  });
  head.position.set(0, 0.03, 0.0);   // head bone is at y1.52 → face ~1.55
  b.head.add(head);

  // dead brow headlamp (OFF), parented to the head, as in the seated rig
  const lamp = makeHeadlamp();
  lamp.position.set(0, 0.086, 0.075);
  lamp.rotation.x = -0.25;
  lamp.scale.setScalar(0.82);
  head.add(lamp);

  // -------- hands hanging from the wrists (fingers pointing down)
  for (const [wrName, s] of [['wr0', -1], ['wr1', 1]]) {
    const hand = makeHand(skin, 0.046, { spread: 0.6, curl: 0.5 });
    hand.rotation.x = Math.PI;              // flip so fingers hang down
    hand.rotation.z = s * 0.15;
    hand.position.set(0, -0.045, 0.015);
    b[wrName].add(hand);
  }

  return { group: g, head, bones: b, mesh };
}

// Drive a walk cycle on the walker's bones. `phase` advances with distance
// travelled (radians); `amp` blends 0 (still standing idle) → 1 (full stride).
// Pure bone rotations + a hip bob — no allocation, safe to call every frame.
export function poseMaraWalk(b, phase, amp = 1) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const legA = 0.5 * amp, armA = 0.55 * amp;
  // legs alternate (left leg forward on +s). A POSITIVE hip rotation.x swings a
  // leg backward, so negate to put it forward.
  if (b.hj0) b.hj0.rotation.x = -s * legA;
  if (b.hj1) b.hj1.rotation.x = s * legA;
  // knees flex BACKWARD (positive rotation.x = shin swings behind, like a real
  // knee) — a small standing bend plus a swing-through bend while that leg is
  // travelling forward (c>0 for the left leg, c<0 for the right).
  if (b.kn0) b.kn0.rotation.x = (0.1 + Math.max(0, c) * 0.85) * amp;
  if (b.kn1) b.kn1.rotation.x = (0.1 + Math.max(0, -c) * 0.85) * amp;
  // arms counter-swing the legs (contralateral), elbows softly bent forward
  if (b.sh0) b.sh0.rotation.x = s * armA;
  if (b.sh1) b.sh1.rotation.x = -s * armA;
  if (b.el0) b.el0.rotation.x = -0.2 * amp;
  if (b.el1) b.el1.rotation.x = -0.2 * amp;
  // torso: a slight forward lean, a twice-per-stride vertical bob, a little sway
  if (b.hips) {
    b.hips.position.y = b.hips.userData.wy + Math.abs(s) * 0.02 * amp - 0.015 * amp;
    b.hips.rotation.z = s * 0.035 * amp;
  }
  if (b.spine) {
    b.spine.rotation.x = 0.07 * amp;
    b.spine.rotation.z = -s * 0.02 * amp;
  }
}
