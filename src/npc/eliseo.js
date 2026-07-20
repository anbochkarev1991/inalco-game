import * as THREE from 'three';
import { NPCTEX } from './shared.js';
import { sculptShell } from './pipeline.js';
import { clothMat, skinMatV2 } from './materials.js';
import { makeHead } from './face.js';
import { makeHand, makeHat, makeSpade } from './parts.js';

// DON ELISEO — the ancient gardener. STANDING, STOOPED over a spade planted in
// the soil, both hands stacked on the shaft. The old build read as a smooth
// olive traffic-cone; this rebuild grows an actual COAT: one continuous garment
// shell (torso + arms + flared skirt + turned-up collar) sculpted as a signed-
// distance mass, corrugated with deep vertical folds and cinched at the waist,
// with an open button placket down the front and a hem that breaks over visible
// boots. Detail rides on the CC0 herringbone maps + baked vertex AO (free at
// draw time), never on extra triangles.
//
// FROZEN CONTRACT: buildEliseo() -> { group, head }. head is the makeHead group
// (setFace/blinkOff, rotatable), positioned in group at ~1.70. The game update()
// only rotates/scales `group` (breath + working rock) and rotates `head`
// (head-track when near, pitch down at the soil, glance up at the tree). Local
// frame preserved from the previous file: y=0 is the ground (boots), coat to the
// ground, head ~1.70 — so buildNPCs placement holds.

export function buildEliseo() {
  const g = new THREE.Group();
  const skinTone = '#8a6a52';
  const skin = skinMatV2(0x8a6a52, { rough: 0.8, detail: true });

  // dark-olive herringbone wool: the greyish CC0 weave map is dyed down by the
  // dark colour, roughMap kills the torch specular, vertexColors carries baked
  // AO (placket grooves, belt cinch, fold valleys, collar underside).
  const coatMat = clothMat({
    color: 0x161809,                     // very dark olive: raises the saturation ceiling so the point-blank
    map: NPCTEX.herringDiff, normal: NPCTEX.herringNor, rough: NPCTEX.herringRough, // torch can't wash the weave flat
    roughness: 1.0, normalScale: 2.2, vertexColors: true,   // strong relief → weave still reads in the beam
  });
  // dark leather (boots): near-zero specular so the point-blank torch can't
  // glaze it white. (Belt/buttons/buckle get their own tuned materials below.)
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x181310, roughness: 0.66, metalness: 0, specularIntensity: 0.14 });

  // ---------------------------------------------------------------- the coat
  // One shell: stooped torso, hunched upper back, forward-reaching arms, a
  // turned-up open collar and a flared, deeply folded skirt that ends mid-shin
  // and breaks over the boots.
  const FR = 0.76;                       // front/back squash factor (coat is wide, shallow)
  const coat = sculptShell((S) => {
    // ---- stooped torso (upper body pushed forward over the spade) ----
    S.sph(null, [0, 1.36, -0.03], 0.12, { s: [1.02, 0.95, 0.9], k: 0.1 });           // hunched upper back
    S.cap(null, [0, 0.88, 0.02], [0, 1.18, 0.08], 0.17, { s: [1.04, 1, FR], k: 0.1 });     // lower torso, leaning
    S.cap(null, [0, 1.18, 0.08], [0, 1.4, 0.12], 0.155, { s: [1.0, 1, 0.76], k: 0.09 });   // chest, narrower + forward
    // cinched waist (narrower than skirt below + chest above → the belt seat)
    S.cap(null, [0, 0.78, 0.03], [0, 0.88, 0.04], 0.145, { s: [1.02, 1, 0.8], k: 0.06 });
    // shoulders, rounded and dropped forward (a clear shoulder line, not a blob)
    S.sph(null, [-0.16, 1.41, 0.09], 0.082, { s: [1, 0.88, 0.95] });
    S.sph(null, [0.16, 1.41, 0.09], 0.082, { s: [1, 0.88, 0.95] });
    S.cap(null, [-0.15, 1.42, 0.09], [0.15, 1.42, 0.09], 0.082, { s: [1, 0.84, 0.85], k: 0.08 }); // yoke

    // ---- flared skirt (A-line to mid-shin, wide hem over the boots) ----
    S.cone(null, [0, 0.26, 0.03], 0.27, 0.145, 0.62, { k: 0.12 });                    // base=hem y0.26, top=waist y0.88

    // ---- arms: sleeves down close to the body, forearms angling in to the shaft ----
    for (const s of [-1, 1]) {
      S.cap(null, [s * 0.16, 1.4, 0.09], [s * 0.125, 1.16, 0.17], 0.058, { k: 0.05 }); // upper arm, hanging
      S.sph(null, [s * 0.125, 1.15, 0.18], 0.054);                                     // elbow
      S.cap(null, [s * 0.125, 1.15, 0.18], [s * 0.04, 1.03, 0.29], 0.047, { k: 0.045 }); // forearm to the shaft
      // an underarm crease so the sleeve reads as a separate arm (AO darkens it)
      S.carveCap([s * 0.135, 1.34, 0.06], [s * 0.11, 1.14, 0.12], 0.03, { k: 0.025 });
    }

    // ---- turned-up collar (wraps the back + sides, opens at the front) ----
    S.cap(null, [-0.09, 1.42, 0.0], [-0.115, 1.58, -0.03], 0.042, { k: 0.036 });      // left side, up
    S.cap(null, [0.09, 1.42, 0.0], [0.115, 1.58, -0.03], 0.042, { k: 0.036 });        // right side, up
    S.cap(null, [-0.09, 1.51, -0.04], [0.09, 1.51, -0.04], 0.048, { k: 0.042 });      // back band
    S.sph(null, [0, 1.55, -0.055], 0.05, { k: 0.038 });                               // back collar peak
    S.cap(null, [-0.02, 1.44, 0.16], [-0.135, 1.57, 0.03], 0.034, { k: 0.033 });      // left lapel folding open
    S.cap(null, [0.02, 1.44, 0.16], [0.135, 1.57, 0.03], 0.034, { k: 0.033 });        // right lapel folding open

    // ---- raised front placket (button band), off-centre so it clears the shaft ----
    S.cap(null, [-0.05, 0.34, 0.27], [-0.05, 1.34, 0.235], 0.037, { k: 0.038 });
    S.carveCap([-0.1, 0.36, 0.27], [-0.1, 1.28, 0.235], 0.024, { k: 0.022 });         // outer edge of the band
    S.carveCap([0.0, 0.36, 0.27], [0.0, 1.28, 0.235], 0.024, { k: 0.022 });           // the coat-front overlap

    // ---- deep vertical folds: ridge prims + carved valleys corrugate the drape ----
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.5;
      const cx = Math.sin(a), cz = Math.cos(a);
      const rB = 0.255, rT = 0.155;
      S.cap(null,
        [cx * rB, 0.3, 0.03 + cz * rB * FR], [cx * rT, 0.82, 0.03 + cz * rT * FR],
        0.05, { k: 0.045 });                                                          // fold ridge
    }
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.5 + Math.PI / N;
      const cx = Math.sin(a), cz = Math.cos(a);
      const rB = 0.265, rT = 0.165;
      S.carveCap(
        [cx * rB, 0.32, 0.03 + cz * rB * FR], [cx * rT, 0.8, 0.03 + cz * rT * FR],
        0.032, { k: 0.03 });                                                          // fold valley
    }
  }, coatMat, {
    domain: { cx: 0, cy: 0.84, cz: 0.08, hx: 0.4, hy: 0.74, hz: 0.3 },
    res: 66, taubin: 1, noise: [0.005, 5, 0.0028, 24], uvH: 1.5, uRep: 3, vRep: 4, seed: 5,
    ao: { strength: 1.9, spread: 2, aoMin: 0.4, smooth: 2 },
  });
  g.add(coat);

  // buttons down the off-centre placket — clear of the shaft (x<0), above the
  // hands (chest) and below the belt (skirt); a lighter tan that reads against
  // the dark olive.
  const btnMat = new THREE.MeshPhysicalMaterial({ color: 0x8a7550, roughness: 0.5, metalness: 0.02, specularIntensity: 0.3 });
  for (const y of [0.5, 0.66, 1.14, 1.26]) {
    const t = (y - 0.34) / 1.0;                          // follow the placket front z
    const z = 0.27 - t * 0.035 + 0.014;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.011, 12), btnMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(-0.05, y, z);
    btn.castShadow = true;
    g.add(btn);
  }

  // belt: a bold flattened band of worn brown leather cinching the waist below
  // the hands — contrasts the olive coat, reads across the front, proud at the sides
  const beltMat = new THREE.MeshPhysicalMaterial({ color: 0x2c2013, roughness: 0.6, metalness: 0, specularIntensity: 0.16 });
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 8, 30), beltMat);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, FR, 1);                              // match the coat's shallow front/back
  belt.position.set(0, 0.82, 0.04);
  belt.castShadow = true;
  g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.016),
    new THREE.MeshPhysicalMaterial({ color: 0x6a6258, roughness: 0.5, metalness: 0.3, specularIntensity: 0.4 }));
  buckle.position.set(-0.02, 0.82, 0.04 + 0.2 * FR + 0.006);
  buckle.castShadow = true;
  g.add(buckle);

  // ---------------------------------------------------------------- boots
  // heavy work boots — tall shaft the coat hem breaks over, foot forward (+z)
  for (const s of [-1, 1]) {
    const boot = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.26, 12), leather);
    shaft.position.y = 0.15;
    shaft.castShadow = true;
    boot.add(shaft);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), leather);
    foot.scale.set(0.9, 0.55, 1.75);                     // long toe forward (+z)
    foot.position.set(0, 0.032, 0.07);
    foot.castShadow = true;
    boot.add(foot);
    boot.position.set(s * 0.1, 0.0, 0.13);
    g.add(boot);
  }

  // ---------------------------------------------------------------- spade
  // planted in the soil, blade sunk a touch; both hands stacked on the shaft
  const spade = makeSpade();
  spade.position.set(0.0, -0.05, 0.34);
  spade.rotation.z = 0.02;
  g.add(spade);

  // two loose fists stacked on the shaft. makeHand's fingers curl around an axis
  // through the palm's local X; rotating the hand ~90° about Z aligns that wrap
  // axis with the vertical shaft, so the fingers fold around it instead of
  // fanning out sideways. curl closes the fist; spread kept low so it's compact.
  const h1 = makeHand(skin, 0.048, { curl: 0.95, spread: 0.3 });
  h1.position.set(0.015, 1.08, 0.325);
  h1.rotation.set(0.25, 0.1, 1.5);
  g.add(h1);
  const h2 = makeHand(skin, 0.047, { curl: 0.95, spread: 0.3 });
  h2.position.set(-0.015, 0.955, 0.335);
  h2.rotation.set(0.25, -0.1, 1.5);
  g.add(h2);

  // ---------------------------------------------------------------- head + hat
  const { head } = makeHead({
    skinTone, beard: 'beardFull', age: 0.95, iris: '#574f43',
    hair: 0xcfc7b6, hairStyle: 'scalp', neckLen: 0.14, ao: true,
    // a very old man: long, gaunt, sunken cheeks, a hooded brow
    shape: { faceLength: 1.09, jawWidth: 0.9, browHeavy: 1.15, cheekGaunt: 0.85, noseLen: 1.05 },
    ruddy: 0.4,   // leathery + age spots (age 0.95 drives the spots)
  });
  head.position.set(0, 1.7, 0.14);
  head.rotation.x = 0.24;                                // stooped, looking down at the soil
  g.add(head);

  const hat = makeHat({ straw: true, brimR: 0.3, crownR: 0.116, crownH: 0.11, droop: 0.07, rough: 0.95 });
  hat.position.set(0, 0.108, -0.005);
  hat.rotation.x = 0.06;                                 // bowed a touch forward
  head.add(hat);

  return { group: g, head };
}
