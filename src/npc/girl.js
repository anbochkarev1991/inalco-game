import * as THREE from 'three';
import { sculptMesh } from './shared.js';
import { sculptShell } from './pipeline.js';
import { drownedSkinMat, garmentDarkMat } from './materials.js';
import { makeHead } from './face.js';

// The cellar girl — a drowned child, kneeling on the cellar floor. Rebuilt on
// the frozen v2 NPC library so she finally reads as a REAL child in a REAL
// garment instead of a smooth white bowling-pin:
//
//   • a SEPARATE period nightgown SHELL (garmentDarkMat — MeshBasic/UNLIT) with
//     a collar, short sleeves, gathered folds and a soaked hem pooling on the
//     floor. Being unlit it stays a dark damp grey even when the 115 cd torch is
//     point-blank — the old "too white / no clothes" bloom is gone.
//   • thin drowned FLESH under it (drownedSkinMat — killed-specular MeshPhysical)
//     for only what shows: the long neck, the folded forearms and clasped hands.
//   • a waterlogged child's FACE (makeHead drowned:true, wetCurtain hair) with
//     hollow black eye-voids, on an unnaturally LONG but anatomically-real neck
//     (nape/throat/tendons) — the neck is the scare, so it reads WRONG, not like
//     a bottle.
//
// Local frame: y = 0 is the floor (the group is dropped onto the cellar floor by
// makeGirl), +z is forward (she faces the doorway). Returns { group, head, mats }
// — head is the rotatable makeHead group; mats is EVERY material in the rig so
// the controller's flash-burn (emissive on the lit flesh) and dissolve (opacity
// on every part, lit and unlit) both reach the whole figure.
export function buildCellarGirl() {
  const g = new THREE.Group();

  // ---- the nightgown: a separate UNLIT cloth shell -------------------------
  // Built as one continuous SDF (skirt → bodice → collar → short sleeves) so it
  // drapes as a single garment, then baked fold-AO into the vertex colours.
  const dressMat = garmentDarkMat({ color: 0x59554b, vertexColors: true });
  const dress = sculptShell((S) => {
    // skirt: flares from the waist down to a hem pooled on the floor
    S.cone(null, [0, 0.0, 0.04], 0.32, 0.145, 0.46, { k: 0.10 });
    // fabric pooled/spread on the floor around her knees
    S.sph(null, [0, 0.03, 0.16], 0.2, { s: [1.35, 0.4, 1.25], k: 0.09 });
    S.sph(null, [0, 0.05, -0.13], 0.17, { s: [1.2, 0.42, 1.0], k: 0.09 });
    // the kneeling knees pushing the skirt forward (a clear lap, not a cone)
    S.sph(null, [-0.11, 0.17, 0.26], 0.13, { k: 0.08 });
    S.sph(null, [0.11, 0.17, 0.26], 0.13, { k: 0.08 });
    // bodice over the torso, slightly flattened front-to-back
    S.cap(null, [0, 0.42, 0.02], [0, 0.8, 0.03], 0.14, { s: [1.02, 1, 0.82], k: 0.09 });
    // a rolled collar at the throat, opened so the neck rises through it
    S.sph(null, [0, 0.81, 0.02], 0.085, { s: [1.1, 0.9, 1.0], k: 0.06 });
    S.carve([0, 0.9, 0.02], 0.056, { k: 0.03 });
    // short puffed sleeves capping the shoulders down to the elbow
    for (const s of [-1, 1]) {
      S.sph(null, [s * 0.13, 0.79, 0.03], 0.075, { k: 0.06 });
      S.cap(null, [s * 0.12, 0.78, 0.03], [s * 0.16, 0.6, 0.09], 0.062, { k: 0.06 });
    }
    // gathered vertical folds down the skirt — proud ridges so the gown reads
    // as gathered cloth, not a smooth bell (relief also lives in the linen
    // albedo + baked AO so it survives the torch)
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.5;
      S.cap(null,
        [Math.cos(a) * 0.3, 0.02, 0.07 + Math.sin(a) * 0.27],
        [Math.cos(a) * 0.14, 0.44, 0.04 + Math.sin(a) * 0.13], 0.032, { k: 0.04 });
    }
  }, dressMat, {
    domain: { cx: 0, cy: 0.44, cz: 0.08, hx: 0.42, hy: 0.52, hz: 0.42 },
    res: 50, taubin: 1, noise: [0.004, 6, 0.0022, 24], uvH: 1.0, uRep: 2, vRep: 1, seed: 12,
    ao: { strength: 1.7, spread: 2, aoMin: 0.4 },
  });
  g.add(dress);

  // ---- the drowned flesh under the gown: neck + folded arms + hands --------
  // Only what actually shows below/through the nightgown, to hold the triangle
  // budget. One continuous mass so the arms grow out of the shoulders and the
  // long neck rises from a real (if hidden) chest.
  const skinMat = drownedSkinMat();
  const body = sculptMesh((S) => {
    // hidden chest — anchors the neck and the arms (buried under the bodice)
    S.cap(null, [0, 0.64, 0.02], [0, 0.8, 0.03], 0.1, { s: [1.05, 1, 0.82], k: 0.09 });
    S.sph(null, [-0.11, 0.8, 0.03], 0.05); S.sph(null, [0.11, 0.8, 0.03], 0.05);   // shoulders
    // THE LONG NECK — thin and far too long, wide base tapering to a narrow
    // throat under the jaw. Thin + long reads WRONG (a stretched neck), not a
    // fat bottle. The throat lump + tendons make it anatomically real, so the
    // wrongness is the length.
    S.cone(null, [0, 0.79, 0.005], 0.062, 0.036, 0.5, { k: 0.08 });
    S.sph(null, [0, 1.02, 0.05], 0.032, { s: [0.85, 1.35, 0.85], k: 0.06 });        // throat / larynx pushed forward
    for (const s of [-1, 1]) {                                                       // sterno tendons: reads as a real strained neck
      S.cap(null, [s * 0.026, 1.18, 0.02], [s * 0.05, 0.82, 0.05], 0.014, { k: 0.05 });
    }
    for (const s of [-1, 1]) {                                                       // thin arms folded into the lap
      S.cap(null, [s * 0.11, 0.79, 0.03], [s * 0.15, 0.6, 0.09], 0.038, { k: 0.05 });   // upper arm
      S.cap(null, [s * 0.15, 0.59, 0.1], [s * 0.05, 0.5, 0.23], 0.032, { k: 0.05 });     // forearm to the lap
      S.sph(null, [s * 0.045, 0.49, 0.25], 0.037, { k: 0.04 });                          // hand
    }
    S.sph(null, [0, 0.485, 0.255], 0.03, { k: 0.04 });                               // hands clasped together
  }, skinMat, {
    domain: { cx: 0, cy: 0.88, cz: 0.1, hx: 0.24, hy: 0.46, hz: 0.26 },
    res: 56, noise: [0.005, 6, 0.0025, 22], uvH: 1.4, uRep: 4, vRep: 6, seed: 9,
  });
  g.add(body);

  // ---- the drowned child's head, on the long neck --------------------------
  const { head, skull } = makeHead({
    skinTone: '#5a6058', beard: null, age: 0.05, iris: '#10130f',
    hair: 0x0a0b0a, neckLen: 0.06, drowned: true, hairStyle: 'wetCurtain', ao: true,
  });
  head.scale.setScalar(0.94);           // child-proportioned — NOT the old tiny head
  head.position.set(0, 1.35, 0.015);
  g.add(head);

  // hollow black eye-voids over the painted sockets: UNLIT MeshBasic so they
  // stay pitch black even when the point-blank torch blows the skin — she reads
  // as hollow-eyed through any bloom, never a featureless blob.
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x030403, transparent: true, opacity: 1 });
  for (const s of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), voidMat);
    socket.position.set(s * 0.037, 0.02, 0.088);
    socket.scale.set(1.2, 1.45, 0.55);
    head.add(socket);
  }

  // ---- collect EVERY material so the controller reaches the whole figure ----
  // flash-burn sets emissive on the lit flesh (drowned skin/face/ears/neck);
  // MeshBasic parts (gown, hair, eye-voids) have no `emissive` and are skipped by
  // the controller's `if (m.emissive)` guard — but they DO fade on the dissolve.
  const mats = [];
  const seen = new Set();
  g.traverse((o) => {
    if (o.isMesh && o.material && !seen.has(o.material)) {
      seen.add(o.material);
      mats.push(o.material);
    }
  });

  return { group: g, head, mats };
}
