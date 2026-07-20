import * as THREE from 'three';
import { sculptMesh, NPCTEX } from './shared.js';
import { sculptShell } from './pipeline.js';
import { clothMat, skinMatV2 } from './materials.js';
import { andeanStripe } from './textures.js';
import { makeHead } from './face.js';
import { makeHand, makeHat, makeMate } from './parts.js';

// ============================================================================
// RUFINO — the old Patagonian fire-keeper. Seated on a log, wrapped in a wool
// poncho, cradling a mate. Rebuilt for the torch-lit survival-horror look.
//
// LOCAL FRAME (frozen so buildNPCs placement still works): group origin sits on
// the seat-log top; +z is forward (toward the fire/lake), +y up. Boots touch the
// ground at y ~= -0.06, the buttocks rest on the log at y ~= 0.28, the head/neck
// emerge from the poncho collar and the head anchor lives at y ~= 1.30.
//
// The visible body is TWO sculpted masses + props:
//   1. legs   — from the knees down only (dark trousers + boots peeking at the
//               hem). Everything above the hem is HIDDEN, so it isn't modelled:
//               no round knees/lap dome past the poncho line (the old "balls").
//   2. poncho — a SEPARATE wool garment shell that IS the whole torso+lap volume
//               (so no torso geometry is wasted under it). Deep vertical folds
//               (fat ridge prims + carved valleys survive the smoothing), a
//               straight fringed hem across both knees, a neck slit, baked
//               vertex-AO in the fold valleys, and a woven boucle-wool material
//               over a dark rust dye so the weave reads in the beam.
//
// ANTI-BLOOM: skin -> skinMatV2 (low-specular physical). The Andean hem band is
// UNLIT (MeshBasic) so its saturated stripes read at distance and never blow at
// point-blank. The poncho wool carries the CC0 boucle normal/rough maps over a
// dark rust dye, but on a MeshPhysical with a TUNED-LOW specularIntensity rather
// than a plain clothMat/MeshStandard: under this torch (SpotLight 115 / decay 2)
// it is the fixed dielectric specular GLAZE that washes a lit surface to WHITE at
// point-blank — verified here, a dark-dye clothMat still blew cream at ~0.9 m.
// Dropping the specular (the same trick woodMat/steelMat/skinMatV2/makeHat all
// use) keeps the surface reading as coloured rust wool point-blank instead of a
// white blob, while a little specular is left in so the weave still catches the
// beam at 3 m. Detail rides on maps + baked AO, never on extra triangles.
// ============================================================================

export function buildRufino() {
  const g = new THREE.Group();

  const skinTone = '#8f6c52';
  const skin = skinMatV2(0x8f6c52, { rough: 0.78 });

  // --- materials ------------------------------------------------------------
  // Poncho wool: dark oxblood-rust dye over the CC0 boucle normal/rough maps, on
  // a MeshPhysical whose specularIntensity is dropped to a whisker (see the file
  // header for why plain clothMat/MeshStandard blows white point-blank). Roughness
  // pinned at 1.0 + the boucle rough map so it never shines; vertexColors lets the
  // baked fold-AO darken the valleys.
  const wool = new THREE.MeshPhysicalMaterial({
    color: 0x2c140c,
    roughness: 1.0,
    metalness: 0,
    specularIntensity: 0.1,       // just enough for the weave to catch the beam
    normalMap: NPCTEX.boucleNor || null,
    roughnessMap: NPCTEX.boucleRough || null,
    normalScale: new THREE.Vector2(1.7, 1.7),
    vertexColors: true,
  });
  // Trousers + boots: near-black herringbone wool, mostly in shadow under the hem.
  const dark = clothMat({
    color: 0x17140f,
    normal: NPCTEX.herringNor,
    rough: NPCTEX.herringRough,
    roughness: 0.98,
    normalScale: 0.9,
  });

  // ==========================================================================
  // 1. LEGS + BOOTS — knees TUCKED and dropped, nothing rounded protrudes past
  //    the poncho line. Only the shins + boots show below the hem.
  // ==========================================================================
  const legs = sculptMesh((S) => {
    for (const s of [-1, 1]) {
      // knee: pulled BACK (small z) and tucked under the drape, kept small
      S.sph(null, [s * 0.10, 0.30, 0.19], 0.068, { k: 0.06 });
      // shin dropping down + slightly forward toward the ankle (trouser)
      S.cap(null, [s * 0.10, 0.30, 0.20], [s * 0.115, 0.05, 0.30], 0.056, { k: 0.05 });
      // ankle
      S.cap(null, [s * 0.115, 0.10, 0.29], [s * 0.12, -0.01, 0.33], 0.05, { k: 0.05 });
      // boot: a flattened, forward-pointing foot on the ground
      S.cap(null, [s * 0.12, -0.03, 0.30], [s * 0.12, -0.05, 0.45], 0.056,
        { s: [1.0, 0.72, 1.28], k: 0.05 });
      // heel nub
      S.sph(null, [s * 0.12, -0.03, 0.27], 0.05, { s: [1, 0.8, 1], k: 0.05 });
    }
  }, dark, {
    domain: { cx: 0, cy: 0.14, cz: 0.29, hx: 0.26, hy: 0.36, hz: 0.28 },
    res: 52, noise: [0.004, 6, 0.002, 26], uvH: 0.7, uRep: 4, vRep: 5, seed: 7,
  });
  legs.name = 'legs';
  g.add(legs);

  // ==========================================================================
  // 2. PONCHO — a separate wool shell. Provides the whole torso+lap volume.
  // ==========================================================================
  const poncho = sculptShell((S) => {
    // ---- body volume UNDER the cloth (this replaces any torso mesh) --------
    // chest/back leaning a touch toward the fire (+z grows with y), flattened
    // front-to-back so it reads as a draped sheet, not a barrel.
    S.cap(null, [0, 0.50, 0.00], [0, 0.94, 0.07], 0.16, { s: [1.12, 1, 0.72], k: 0.10 });
    S.sph(null, [0, 0.42, 0.00], 0.16, { s: [1.15, 0.92, 0.78], k: 0.10 });   // seat/lap mass

    // ---- shoulders + yoke across the top (raised so little neck shows) -----
    S.sph(null, [-0.19, 1.04, 0.01], 0.10, { s: [1, 0.9, 0.95] });
    S.sph(null, [0.19, 1.04, 0.01], 0.10, { s: [1, 0.9, 0.95] });
    S.cap(null, [-0.19, 1.05, 0.01], [0.19, 1.05, 0.01], 0.095, { s: [1, 0.82, 0.95], k: 0.10 });

    // ---- upper arms UNDER the poncho (bulge toward the front where the hands
    //      emerge to hold the mate / rest on the lap) --------------------------
    S.cap(null, [-0.20, 1.00, 0.03], [-0.11, 0.72, 0.20], 0.075, { k: 0.08 });
    S.cap(null, [0.20, 1.00, 0.03], [0.12, 0.70, 0.22], 0.075, { k: 0.08 });

    // ---- FRONT drape: a row of fat vertical rolls = corrugated cloth folds --
    // r >= 0.055 so the folds survive marching-cubes + smoothing.
    const frontX = [-0.20, -0.12, -0.04, 0.04, 0.12, 0.20];
    for (const x of frontX) {
      S.cap(null, [x, 0.84, 0.15], [x * 1.06, 0.30, 0.25], 0.056, { k: 0.05 });
    }
    // straight horizontal HEM roll across both knees (unifies the roll-bottoms
    // into ONE straight fringed edge instead of two lobes)
    S.cap(null, [-0.24, 0.28, 0.25], [0.24, 0.28, 0.25], 0.058, { s: [1, 0.82, 0.72], k: 0.06 });

    // ---- BACK drape --------------------------------------------------------
    for (const x of [-0.17, -0.06, 0.06, 0.17]) {
      S.cap(null, [x, 0.92, -0.08], [x * 1.05, 0.42, -0.13], 0.052, { k: 0.05 });
    }
    S.cap(null, [-0.21, 0.40, -0.13], [0.21, 0.40, -0.13], 0.055, { s: [1, 0.82, 0.72], k: 0.06 }); // back hem

    // ---- SIDE drape connecting front to back over the arms -----------------
    for (const s of [-1, 1]) {
      S.cap(null, [s * 0.22, 0.96, 0.02], [s * 0.22, 0.52, -0.02], 0.07, { k: 0.07 });
    }

    // ---- collar rim standing up around the neck slit -----------------------
    S.cap(null, [-0.07, 1.11, 0.05], [0.07, 1.11, 0.05], 0.038, { k: 0.05 });
    S.cap(null, [-0.07, 1.10, -0.04], [0.07, 1.10, -0.04], 0.038, { k: 0.05 });
    S.sph(null, [-0.09, 1.09, 0.0], 0.04, { k: 0.05 });
    S.sph(null, [0.09, 1.09, 0.0], 0.04, { k: 0.05 });

    // ======================= CARVED FOLD VALLEYS ============================
    // grooves cut between the front rolls so the folds read DEEP (bite from the
    // front, at higher z, with a tight k so the valley stays crisp). Kept off
    // the centre line so no groove reads as a drip below the collar.
    for (const x of [-0.16, -0.08, 0.08, 0.16]) {
      S.carveCap([x, 0.82, 0.24], [x * 1.06, 0.31, 0.33], 0.032, { k: 0.03 });
    }
    // a couple of back valleys
    for (const x of [-0.11, 0.0, 0.11]) {
      S.carveCap([x, 0.86, -0.16], [x * 1.05, 0.44, -0.20], 0.03, { k: 0.03 });
    }
    // ---- NECK SLIT: open the head hole + a short front V ------------------
    S.carve([0, 1.14, 0.01], 0.05, { k: 0.03 });
    S.carveCap([0, 1.06, 0.06], [0, 1.18, 0.06], 0.026, { k: 0.025 });
  }, wool, {
    domain: { cx: 0, cy: 0.70, cz: 0.02, hx: 0.34, hy: 0.52, hz: 0.34 },
    res: 78, taubin: 1, noise: [0.006, 4, 0.003, 20], uvH: 1.4, uRep: 6, vRep: 7,
    seed: 3, ao: { strength: 1.9, spread: 2, aoMin: 0.34 },
  });
  poncho.name = 'poncho';
  g.add(poncho);

  // ---- Andean stripe band near the hem (UNLIT overlay) ---------------------
  // sample only the stripe band of the texture (its lower third -> texture
  // v 0..0.38) and run it around the front of the hem.
  const bandTex = andeanStripe().map.clone();
  bandTex.wrapS = THREE.RepeatWrapping;
  bandTex.wrapT = THREE.ClampToEdgeWrapping;
  bandTex.repeat.set(4, 0.38);
  bandTex.offset.set(0, 0);
  bandTex.needsUpdate = true;
  // arc CENTRED on the front (+z); the open gap sits at the back (theta 0 = +z
  // in three.js CylinderGeometry, so start the arc half a length before it).
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.265, 0.29, 0.08, 44, 1, true, -Math.PI * 0.72, Math.PI * 1.44),
    new THREE.MeshBasicMaterial({ map: bandTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }),
  );
  band.scale.set(1, 1, 1);
  band.position.set(0, 0.33, 0.06);
  band.name = 'band';
  g.add(band);

  // ==========================================================================
  // 3. HEAD + FELT HAT
  // ==========================================================================
  const { head } = makeHead({
    skinTone, beard: 'beardFull', age: 0.72, iris: '#4a3423',
    hair: 0x615a52, neckLen: 0.15, hairStyle: 'scalp',
    // a heavy-set weathered fisherman: broad jaw, strong brow, larger nose
    shape: { faceLength: 0.98, jawWidth: 1.22, browHeavy: 1.25, noseLen: 1.08 },
    ruddy: 0.85,   // sun- and wind-burned, broken capillaries
  });
  head.position.set(0, 1.28, 0.06);
  head.rotation.x = -0.12;
  g.add(head);

  const hat = makeHat({
    color: 0x211a13, brimR: 0.255, crownR: 0.116, crownH: 0.125, droop: 0.06, rough: 0.92,
  });
  hat.position.set(0, 0.10, -0.008);
  hat.rotation.set(-0.14, 0.06, 0.05);   // tipped forward + a rakish tilt
  head.add(hat);

  // ==========================================================================
  // 4. HANDS + MATE — right hand cups the mate at chest height (off-centre,
  //    tilted for a sip); left hand rests on the lap.
  // ==========================================================================
  const mate = makeMate();
  mate.position.set(0.10, 0.84, 0.33);
  mate.rotation.set(0.15, -0.2, -0.36);   // held at an angle, bombilla up toward the face
  mate.name = 'mate';
  g.add(mate);

  // right hand cupping the gourd: palm up (rotX ~ -pi/2), fingers curling up
  // and toward the body around the cup.
  const handR = makeHand(skin, 0.048, { curl: 0.7, spread: 0.85 });
  handR.position.set(0.10, 0.80, 0.34);
  handR.rotation.set(-1.5, -0.35, -0.35);
  handR.name = 'handR';
  g.add(handR);

  // left hand resting on the lap: palm down (rotX ~ +pi/2), fingers draping
  // forward over the knee.
  const handL = makeHand(skin, 0.048, { curl: 0.5, spread: 1 });
  handL.position.set(-0.14, 0.42, 0.30);
  handL.rotation.set(1.35, 0.15, 0.1);
  handL.name = 'handL';
  g.add(handL);

  return { group: g, head, mate };
}
