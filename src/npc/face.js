import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../world.js';
import { livingSkinDetail, drownedFlesh, hairClump, beardClump } from './textures.js';
import { bakeAO } from './pipeline.js';

// FACE / HAIR library (v2) for the NPC overhaul. STANDALONE — does not touch
// shared.js. It re-implements the head trio (headGeo / faceTex / makeHead) with
// stronger sculpting, a crisper 512px painted face, a drowned variant, and real
// clump-card hair, while preserving the FROZEN runtime contract of shared.js
// makeHead exactly:
//   makeHead(opts) -> { head, skull }
//     head  : THREE.Group (skull mesh + ears + scalp hair + real neck)
//     skull : the face Mesh, so skull.material is the face material
//     head.userData.setFace(state)  state ∈ neutral|blink|talk|talkBlink
//     head.userData.blinkOff        per-person blink stagger
//
// THE HARD CONSTRAINT (proven in materials.js): under the player torch
// (SpotLight intensity 115, decay 2, ACESFilmic @ 1.07) even a black
// MeshStandard blows to cream because of the dielectric specular glaze. So the
// face uses a MeshPhysicalMaterial with specularIntensity dropped (living ~0.35,
// drowned 0). All surface richness rides on normal + roughness maps and baked
// vertex AO — never extra triangles. Hair that must stay dark point-blank is
// UNLIT (MeshBasicMaterial).

// SphereGeometry lays +z (the face direction) at u=0.25, so every feature below
// is painted around x = W*0.25, and the sculpt in headGeo pushes features only
// on the +z hemisphere so the paint and the relief line up.

// ------------------------------------------------------------------ faceTex
// A painted face at 512px (v1 was 256). Keeps EVERY v1 option working
// (skin, beard, brows, age, blush, iris, seed, eyesClosed, mouthOpen) and adds
// drowned=false. Improvements: cornea highlight + lower lid + iris depth +
// lashes, an age-scaled wrinkle field, fuller lips. drowned:true paints a
// waterlogged pale grey-green child face with blue-grey lips, deep sunken dark
// sockets and a wet sheen (the roughness/normal maps supply the actual gloss).
export function faceTex(opts) {
  const {
    skin = '#8a6a52', beard = null, brows = '#3a2f26', age = 0.4, blush = 0.15,
    iris = '#3a2a1c', seed = 1, eyesClosed = false, mouthOpen = 0, drowned = false,
    ruddy = 0.35,   // weathering: warm nose/cheek flush + broken capillaries (0 = pale/cool)
  } = opts;
  // seeded rng so freckles/beard/mottle are IDENTICAL across expression variants
  // (only eyes/mouth change) — otherwise swapping textures flickers.
  let sd = (seed * 2654435761) >>> 0;
  const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };

  // drowned children read young: no age wrinkles, faint brows, cool lips
  const A = drowned ? 0.0 : age;
  const baseSkin = drowned ? '#7c847b' : skin;      // mid grey-green; the dark material colour dyes it down under the torch
  const lipCol = drowned ? '150,158,158' : '150,84,70';
  const lipLine = drowned ? '70,80,84' : '40,22,18';
  const scleraCol = drowned ? '#9aa093' : '#d3c9b7';

  return canvasTexture((c, W, H) => {
    const k = W / 256;                              // scale so v1 pixel math maps to 512
    // --- base skin ------------------------------------------------------
    c.fillStyle = baseSkin; c.fillRect(0, 0, W, H);
    // freckle / pore mottle
    const speck = drowned ? 520 : 700;
    for (let i = 0; i < speck; i++) {
      const dk = drowned
        ? (rnd() > 0.5 ? '70,84,74' : '150,156,140')       // green-grey mottle
        : (rnd() > 0.5 ? '60,38,26' : '255,222,192');
      c.fillStyle = `rgba(${dk},${0.02 + rnd() * (drowned ? 0.07 : 0.045)})`;
      c.beginPath(); c.arc(rnd() * W, rnd() * H, (1 + rnd() * 4) * k * 0.6, 0, 7); c.fill();
    }
    // drowned: bruise pools + waterline bands + vein web
    if (drowned) {
      for (let i = 0; i < 12; i++) {
        const g = c.createRadialGradient(rnd() * W, rnd() * H, 1, rnd() * W, rnd() * H, (10 + rnd() * 26) * k);
        g.addColorStop(0, `rgba(54,66,84,${0.12 + rnd() * 0.16})`); g.addColorStop(1, 'rgba(54,66,84,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      c.lineWidth = 0.8 * k;
      for (let i = 0; i < 22; i++) {
        c.strokeStyle = `rgba(${rnd() > 0.5 ? '58,72,92' : '44,54,60'},${0.16 + rnd() * 0.22})`;
        let x = rnd() * W, y = rnd() * H; c.beginPath(); c.moveTo(x, y);
        for (let kk = 0; kk < 5; kk++) { x += (rnd() - 0.5) * 22 * k; y += (rnd() - 0.5) * 22 * k; c.lineTo(x, y); }
        c.stroke();
      }
    }

    const fx = W * 0.25, fy = H * 0.44, eyeDX = W * 0.052;

    // --- skin tone variation (living) -----------------------------------
    // Warmth through the mid-face, a cooler jaw, ruddy nose/cheeks with broken
    // capillaries, and age spots — so the skin isn't one flat colour. Kept
    // subtle so the torch can't wash it out (all reds, no bright highlights).
    if (!drowned) {
      // warm flush over the nose + cheeks (vascular)
      const flush = c.createRadialGradient(fx, fy + 9 * k, 3 * k, fx, fy + 9 * k, 26 * k);
      flush.addColorStop(0, `rgba(188,92,66,${0.08 + ruddy * 0.13})`);
      flush.addColorStop(1, 'rgba(188,92,66,0)');
      c.fillStyle = flush; c.fillRect(0, 0, W, H);
      // redder nose tip + ala
      const tip = c.createRadialGradient(fx, fy + 13 * k, 1, fx, fy + 13 * k, 7 * k);
      tip.addColorStop(0, `rgba(176,82,60,${0.14 + ruddy * 0.22})`);
      tip.addColorStop(1, 'rgba(176,82,60,0)');
      c.fillStyle = tip; c.fillRect(0, 0, W, H);
      // cooler, slightly desaturated lower jaw / chin
      const cool = c.createLinearGradient(0, fy + 18 * k, 0, fy + 40 * k);
      cool.addColorStop(0, 'rgba(116,118,130,0)');
      cool.addColorStop(1, 'rgba(108,114,128,0.10)');
      c.fillStyle = cool; c.fillRect(0, fy + 18 * k, W, H);
      // broken capillaries on nose/cheeks for weathered (ruddy) faces
      if (ruddy > 0.4) {
        c.lineWidth = 0.6 * k;
        for (let i = 0; i < Math.round(ruddy * 38); i++) {
          let x = fx + (rnd() - 0.5) * 26 * k, y = fy + 6 * k + (rnd() - 0.3) * 12 * k;
          c.strokeStyle = `rgba(168,68,52,${0.16 + rnd() * 0.20})`;
          c.beginPath(); c.moveTo(x, y);
          for (let j = 0; j < 3; j++) { x += (rnd() - 0.5) * 4 * k; y += (rnd() - 0.5) * 4 * k; c.lineTo(x, y); }
          c.stroke();
        }
      }
      // age / liver spots (older faces): irregular brown blots, upper face
      const spots = Math.round(A * 20);
      for (let i = 0; i < spots; i++) {
        const bx = rnd() * W, by = rnd() * (fy + 6 * k);
        c.fillStyle = `rgba(${rnd() > 0.5 ? '96,64,38' : '120,86,52'},${0.09 + rnd() * 0.13})`;
        c.beginPath(); c.ellipse(bx, by, (1.3 + rnd() * 2.2) * k, (0.9 + rnd() * 1.6) * k, rnd() * 3, 0, 7); c.fill();
      }
    }

    // --- broad eye-socket shading (both eyes) ---------------------------
    for (const s of [-1, 1]) {
      const g = c.createRadialGradient(fx + s * W * 0.1, fy + 6 * k, 2, fx + s * W * 0.1, fy + 6 * k, 26 * k);
      const a = drowned ? 0.34 : 0.16;
      g.addColorStop(0, `rgba(52,34,26,${a})`); g.addColorStop(1, 'rgba(52,34,26,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }

    // --- eyes -----------------------------------------------------------
    for (const s of [-1, 1]) {
      const ex = fx + s * eyeDX, ey = fy;

      if (drowned) {
        // a deep sunken hollow — the eye is lost in shadow (hollow-eyed child)
        const sg = c.createRadialGradient(ex, ey, 1, ex, ey, 12 * k);
        sg.addColorStop(0, 'rgba(6,9,10,0.96)');
        sg.addColorStop(0.6, 'rgba(10,15,16,0.8)');
        sg.addColorStop(1, 'rgba(20,28,28,0)');
        c.fillStyle = sg;
        c.beginPath(); c.ellipse(ex, ey, 7 * k, 5.4 * k, 0, 0, 7); c.fill();
        if (!eyesClosed) {
          // a dull, dead glint deep in the socket
          c.fillStyle = 'rgba(70,78,78,0.5)';
          c.beginPath(); c.arc(ex + s * 0.6 * k, ey + 0.6 * k, 1.5 * k, 0, 7); c.fill();
          c.fillStyle = 'rgba(120,128,126,0.35)';
          c.beginPath(); c.arc(ex - 0.8 * k, ey - 0.8 * k, 0.7 * k, 0, 7); c.fill();
        } else {
          c.strokeStyle = 'rgba(30,40,42,.7)'; c.lineWidth = 1.6 * k;
          c.beginPath(); c.moveTo(ex - 6 * k, ey - 0.5 * k); c.quadraticCurveTo(ex, ey + 2.6 * k, ex + 6 * k, ey - 0.5 * k); c.stroke();
        }
      } else if (eyesClosed) {
        // lowered lid: soft fold + a lash line curving down
        c.fillStyle = 'rgba(120,86,62,.30)';
        c.beginPath(); c.ellipse(ex, ey - 1 * k, 6.4 * k, 3.2 * k, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(38,22,16,.85)'; c.lineWidth = 1.7 * k;
        c.beginPath(); c.moveTo(ex - 6.4 * k, ey - 0.5 * k); c.quadraticCurveTo(ex, ey + 2.6 * k, ex + 6.4 * k, ey - 0.5 * k); c.stroke();
        // lash tips flicking down
        c.lineWidth = 1 * k;
        for (let i = 0; i < 5; i++) {
          const lx = ex - 5 * k + i * 2.5 * k;
          c.beginPath(); c.moveTo(lx, ey + 1.6 * k); c.lineTo(lx + 0.6 * k, ey + 3.4 * k); c.stroke();
        }
      } else {
        // A smaller, deeper-set adult eye — the old one was a big anime almond
        // with twin glints and an eyeliner lash line ("doll"). eyeLash scales the
        // lashes (Phase 5 can raise it for Mara, drop it for the men).
        const eyeLash = 1;
        // upper-lid crease shadow (sits the eye INTO the socket)
        c.fillStyle = 'rgba(46,30,22,.26)';
        c.beginPath(); c.ellipse(ex, ey - 3.0 * k, 6 * k, 2.5 * k, 0, Math.PI, 0); c.fill();
        // sclera (not pure white — cornea sheen does the wet look)
        c.fillStyle = scleraCol;
        c.beginPath(); c.ellipse(ex, ey, 5.1 * k, 2.9 * k, 0, 0, 7); c.fill();
        // inner-corner shadow + outer canthus
        c.fillStyle = 'rgba(70,44,34,.35)';
        c.beginPath(); c.ellipse(ex - s * 4.5 * k, ey + 0.3 * k, 1.5 * k, 1.7 * k, 0, 0, 7); c.fill();
        // iris with depth: dark limbal ring, lit lower rim
        const ix = ex + s * 0.5 * k;
        const ig = c.createRadialGradient(ix, ey - 0.5 * k, 0.4, ix, ey, 2.7 * k);
        ig.addColorStop(0, iris);
        ig.addColorStop(0.7, iris);
        ig.addColorStop(1, 'rgba(20,12,8,0.9)');
        c.fillStyle = ig;
        c.beginPath(); c.arc(ix, ey, 2.55 * k, 0, 7); c.fill();
        c.strokeStyle = 'rgba(18,10,6,0.7)'; c.lineWidth = 0.7 * k;
        c.beginPath(); c.arc(ix, ey, 2.55 * k, 0, 7); c.stroke();
        // pupil
        c.fillStyle = '#0a0706';
        c.beginPath(); c.arc(ix, ey, 1.2 * k, 0, 7); c.fill();
        // a single soft catch-light (upper-inner), not two glossy dots
        c.fillStyle = 'rgba(250,248,242,.78)';
        c.beginPath(); c.arc(ix - 0.9 * k, ey - 1.0 * k, 0.7 * k, 0, 7); c.fill();
        // lower lid: a soft lit rim under the eye
        c.strokeStyle = 'rgba(150,110,84,.45)'; c.lineWidth = 1.0 * k;
        c.beginPath(); c.moveTo(ex - 4.6 * k, ey + 2.7 * k); c.quadraticCurveTo(ex, ey + 3.8 * k, ex + 4.6 * k, ey + 2.7 * k); c.stroke();
        // upper lash line: a soft brown liner, thinner (not black eyeliner)
        c.strokeStyle = 'rgba(46,30,20,.8)'; c.lineWidth = 1.5 * k;
        c.beginPath(); c.moveTo(ex - 5.1 * k, ey - 1.9 * k); c.quadraticCurveTo(ex, ey - 3.5 * k, ex + 5.1 * k, ey - 1.8 * k); c.stroke();
        // a few short lashes (scaled by eyeLash)
        c.lineWidth = 0.8 * k;
        for (let i = 0; i < 5; i++) {
          const t = i / 4, lx = ex - 4.4 * k + t * 8.8 * k;
          const ly = ey - 2.8 * k - Math.sin(t * Math.PI) * 0.9 * k;
          c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + s * 0.6 * k, ly - 1.3 * k * eyeLash); c.stroke();
        }
      }

      // brows (faint for drowned/young)
      c.strokeStyle = drowned ? 'rgba(78,84,78,.5)' : brows; c.lineWidth = (drowned ? 0.9 : 1.3) * k;
      for (let i = 0; i < 11; i++) {
        const bx = ex - 7 * k + i * 1.4 * k;
        const by = ey - 8.8 * k - Math.sin((i / 10) * Math.PI) * 2.6 * k + A * 1.6 * k;
        c.beginPath(); c.moveTo(bx, by + 2 * k); c.lineTo(bx + 1.1 * k, by - 1.6 * k); c.stroke();
      }
      // crow's-feet + under-eye creases scale with age
      if (A > 0.3) {
        c.strokeStyle = 'rgba(50,32,24,.4)'; c.lineWidth = 0.9 * k;
        c.beginPath(); c.moveTo(ex - 6 * k, ey + 5.6 * k); c.quadraticCurveTo(ex, ey + 7.8 * k, ex + 6 * k, ey + 5.4 * k); c.stroke();
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.moveTo(ex + s * 8.4 * k, ey - 2 * k + i * 2.4 * k);
          c.lineTo(ex + s * (11.5 + i) * k, ey - 3 * k + i * 3.2 * k);
          c.stroke();
        }
      }
    }

    // --- forehead wrinkles (age) ----------------------------------------
    if (A > 0.5) {
      c.strokeStyle = 'rgba(56,36,26,.3)'; c.lineWidth = 1 * k;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(fx - 14 * k, fy - 17 * k - i * 4 * k);
        c.quadraticCurveTo(fx, fy - 20 * k - i * 4 * k, fx + 14 * k, fy - 17 * k - i * 4 * k);
        c.stroke();
      }
    }

    // --- nose: bridge highlight, side shadows, nostrils, tip ------------
    // lit bridge
    const bg = c.createLinearGradient(fx - 3 * k, 0, fx + 3 * k, 0);
    bg.addColorStop(0, 'rgba(255,236,210,0)');
    bg.addColorStop(0.5, `rgba(255,236,210,${drowned ? 0.05 : 0.14})`);
    bg.addColorStop(1, 'rgba(255,236,210,0)');
    c.fillStyle = bg; c.fillRect(fx - 3 * k, fy - 6 * k, 6 * k, 20 * k);
    // side shadows
    c.fillStyle = `rgba(58,34,24,${drowned ? 0.28 : 0.2})`;
    c.beginPath(); c.ellipse(fx - 2.8 * k, fy + 8 * k, 1.7 * k, 6.4 * k, 0.15, 0, 7); c.fill();
    c.beginPath(); c.ellipse(fx + 2.8 * k, fy + 8 * k, 1.7 * k, 6.4 * k, -0.15, 0, 7); c.fill();
    // tip shading
    c.fillStyle = `rgba(40,24,18,${drowned ? 0.3 : 0.22})`;
    c.beginPath(); c.ellipse(fx, fy + 13.4 * k, 3.4 * k, 2.2 * k, 0, 0, 7); c.fill();
    // nostrils
    c.fillStyle = `rgba(24,14,11,${drowned ? 0.7 : 0.6})`;
    c.beginPath(); c.ellipse(fx - 2.3 * k, fy + 13.6 * k, 1.4 * k, 1.0 * k, 0.3, 0, 7); c.fill();
    c.beginPath(); c.ellipse(fx + 2.3 * k, fy + 13.6 * k, 1.4 * k, 1.0 * k, -0.3, 0, 7); c.fill();
    // ala creases
    c.strokeStyle = `rgba(58,36,26,${0.2 + A * 0.25})`; c.lineWidth = 1.1 * k;
    c.beginPath(); c.moveTo(fx - 4.4 * k, fy + 12 * k); c.quadraticCurveTo(fx - 7.6 * k, fy + 17 * k, fx - 5.6 * k, fy + 21 * k); c.stroke();
    c.beginPath(); c.moveTo(fx + 4.4 * k, fy + 12 * k); c.quadraticCurveTo(fx + 7.6 * k, fy + 17 * k, fx + 5.6 * k, fy + 21 * k); c.stroke();
    // nasolabial folds (age)
    if (A > 0.4) {
      c.strokeStyle = `rgba(52,32,24,${0.18 + A * 0.2})`; c.lineWidth = 1.1 * k;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(fx + s * 4 * k, fy + 15 * k);
        c.quadraticCurveTo(fx + s * 9 * k, fy + 20 * k, fx + s * 8 * k, fy + 26 * k);
        c.stroke();
      }
    }

    // --- mouth ----------------------------------------------------------
    // A real lip shape, NOT two flat stacked ellipses (the old "duck bill").
    // Narrower than the nose is wide, dropped lower on the face (longer
    // philtrum), with a cupid's bow, a fuller lower lip and dark corners
    // (commissures) — the corners are what make it read as a mouth, not a bill.
    const mw = 4.3 * k;                 // lip half-width (was ~6k)
    const mcy = fy + 21.2 * k;          // seam baseline, dropped (was 19.2k)
    if (mouthOpen > 0) {
      const oh = (1.0 + mouthOpen * 1.9) * k;   // modest jaw-drop (was 1.6 + 2.8)
      const ow = 3.3 * k;                        // narrow (was 4.6k)
      // dark inner mouth, slightly biased downward (jaw drops, not the whole hole)
      c.fillStyle = 'rgba(20,10,10,.95)';
      c.beginPath(); c.ellipse(fx, mcy + oh * 0.35, ow, oh, 0, 0, 7); c.fill();
      // faint upper-teeth hint (living only)
      if (!drowned) {
        c.fillStyle = 'rgba(198,190,176,.4)';
        c.beginPath(); c.ellipse(fx, mcy + oh * 0.35 - oh * 0.55, ow * 0.78, 0.8 * k, 0, 0, Math.PI); c.fill();
      }
      // lips ringing the opening
      c.strokeStyle = `rgba(${lipCol},.8)`; c.lineWidth = 2 * k;
      c.beginPath(); c.ellipse(fx, mcy + oh * 0.35, ow + 0.8 * k, oh + 1 * k, 0, 0, 7); c.stroke();
      c.strokeStyle = `rgba(${lipLine},.5)`; c.lineWidth = 1 * k;
      c.beginPath(); c.ellipse(fx, mcy + oh * 0.35, ow + 0.8 * k, oh + 1 * k, 0, 0, 7); c.stroke();
    } else {
      // philtrum: two faint vertical ridges from the nose base to the lip
      c.strokeStyle = 'rgba(58,36,26,.14)'; c.lineWidth = 0.9 * k;
      c.beginPath(); c.moveTo(fx - 1.1 * k, fy + 15 * k); c.lineTo(fx - 0.85 * k, mcy - 1.6 * k); c.stroke();
      c.beginPath(); c.moveTo(fx + 1.1 * k, fy + 15 * k); c.lineTo(fx + 0.85 * k, mcy - 1.6 * k); c.stroke();
      // lower lip: a soft, fuller pillow below the seam
      c.fillStyle = `rgba(${lipCol},.5)`;
      c.beginPath();
      c.moveTo(fx - mw * 0.82, mcy + 0.4 * k);
      c.quadraticCurveTo(fx, mcy + 3.4 * k, fx + mw * 0.82, mcy + 0.4 * k);
      c.quadraticCurveTo(fx, mcy + 1.5 * k, fx - mw * 0.82, mcy + 0.4 * k);
      c.fill();
      // lower-lip lit rim
      c.strokeStyle = `rgba(255,225,210,${drowned ? 0.06 : 0.24})`; c.lineWidth = 1 * k;
      c.beginPath(); c.moveTo(fx - mw * 0.55, mcy + 2.4 * k); c.quadraticCurveTo(fx, mcy + 3.2 * k, fx + mw * 0.55, mcy + 2.4 * k); c.stroke();
      // upper lip with a cupid's bow (two peaks + a central notch)
      c.fillStyle = `rgba(${lipCol},.58)`;
      c.beginPath();
      c.moveTo(fx - mw, mcy + 0.2 * k);
      c.quadraticCurveTo(fx - mw * 0.55, mcy - 1.8 * k, fx - mw * 0.18, mcy - 0.7 * k);  // left peak
      c.quadraticCurveTo(fx, mcy - 1.4 * k, fx + mw * 0.18, mcy - 0.7 * k);              // central notch
      c.quadraticCurveTo(fx + mw * 0.55, mcy - 1.8 * k, fx + mw, mcy + 0.2 * k);         // right peak
      c.quadraticCurveTo(fx, mcy + 0.9 * k, fx - mw, mcy + 0.2 * k);                     // close along the seam
      c.fill();
      // the lip seam — corners turned slightly DOWN (tired, not smiling)
      c.strokeStyle = `rgba(${lipLine},.8)`; c.lineWidth = 1.4 * k;
      c.beginPath();
      c.moveTo(fx - mw, mcy - 0.2 * k);
      c.quadraticCurveTo(fx, mcy + (1.1 - A * 1.2) * k, fx + mw, mcy - 0.2 * k);
      c.stroke();
      // dark corners (commissures) — the key tell that it's a mouth
      c.fillStyle = 'rgba(28,15,12,.5)';
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(fx + s * mw, mcy + 0.1 * k, 1.0 * k, 1.3 * k, 0, 0, 7); c.fill(); }
    }

    // --- cheeks / blush -------------------------------------------------
    if (drowned) {
      // sallow hollow cheeks rather than blush
      c.fillStyle = 'rgba(46,58,52,.22)';
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(fx + s * 11 * k, fy + 11 * k, 5.5 * k, 4.4 * k, 0, 0, 7); c.fill(); }
    } else {
      // soft diffuse cheek warmth (a radial, not two hard doll-blush circles)
      for (const s of [-1, 1]) {
        const bl = c.createRadialGradient(fx + s * 11 * k, fy + 9 * k, 1, fx + s * 11 * k, fy + 9 * k, 9 * k);
        bl.addColorStop(0, `rgba(168,72,52,${blush * 0.85})`);
        bl.addColorStop(1, 'rgba(168,72,52,0)');
        c.fillStyle = bl; c.fillRect(0, 0, W, H);
      }
    }

    // --- painted beard shadow (grounds the geometric beard cards) -------
    if (beard) {
      for (let i = 0; i < 620; i++) {
        const a = rnd() * Math.PI;
        const rr = (9 + rnd() * 11) * k;
        const bx = fx + Math.cos(a) * rr * 1.5;
        const by = fy + 15 * k + Math.sin(a) * rr * 0.85;
        if (by < fy + 12 * k) continue;
        c.strokeStyle = `rgba(${rnd() > 0.4 ? '205,200,190' : '150,144,132'},${0.22 + rnd() * 0.3})`;
        c.lineWidth = 0.8 * k;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + (rnd() - 0.5) * 2 * k, by + (2.6 + rnd() * 2) * k); c.stroke();
      }
    }

    // --- hairline + back-of-head shadow (hair covers these) -------------
    // A SOFT radial vignette over the hair-covered back-crown so any scalp gap
    // reads as shadow, not a bright bald patch — no hard rectangle (the old
    // fillRect block showed a crisp dark square once the hair cap got shorter).
    const backG = c.createRadialGradient(W * 0.78, H * 0.04, 2, W * 0.78, H * 0.04, W * 0.34);
    backG.addColorStop(0, 'rgba(26,18,13,.5)');
    backG.addColorStop(1, 'rgba(26,18,13,0)');
    c.fillStyle = backG; c.fillRect(0, 0, W, H * 0.6);
    const crownG = c.createLinearGradient(0, 0, 0, H * 0.15);
    crownG.addColorStop(0, 'rgba(26,18,13,.4)');
    crownG.addColorStop(1, 'rgba(26,18,13,0)');
    c.fillStyle = crownG; c.fillRect(0, 0, W, H * 0.15);      // crown, feathered down
  }, 512, 512);
}

// ------------------------------------------------------------------ headGeo
// v2 sculpted skull: nose/brow/cheekbones/jaw/chin/ears pushed further than v1
// so a face reads at 3–4 m. Still a SphereGeometry base (so the painted-face
// UVs line up), displaced only on the +z hemisphere. Returns a BufferGeometry.
export function headGeo(r, shape = {}) {
  // shape lets each character deform the same base skull (Phase 5): all default
  // to 1 so an un-parameterised call reproduces the canonical head.
  const {
    faceLength = 1,   // vertical stretch of the whole head (>1 = longer face)
    jawWidth = 1,     // mandible width scale (>1 = heavier jaw, <1 = narrow)
    browHeavy = 1,    // brow-ridge overhang scale
    cheekGaunt = 0,   // 0 = full cheeks, 1 = sunken (old/gaunt)
    noseLen = 1,      // nose projection scale
  } = shape;
  const g = new THREE.SphereGeometry(r, 40, 30);   // a touch denser for the jaw/occiput curvature
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  const e = (q) => Math.exp(-q);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).divideScalar(r);
    const front = Math.max(0, v.z);
    const f2 = front * front;
    const back = Math.max(0, -v.z);
    // ---- +z feature relief — SUBTLE & localized. Each bump uses f2 (front²) so
    // it stays a discrete feature; an earlier pass used plain `front` at high
    // amplitude, which bulged the whole face forward into a snout ("monster").
    // The goal is a soft, human nose/chin — the doll→human win comes from the
    // PROPORTIONS below and the repainted mouth, NOT from strong relief.
    // Feature LATITUDES are calibrated to where faceTex actually paints them on
    // the sphere UVs (eyes ≈ v.y +0.19, nose tip +0.03, mouth −0.09, chin −0.28).
    // An earlier pass centred these ~0.3 too LOW, so the "chin" sat under the jaw
    // and the setback missed the lips — which is why the profile stayed a bill.
    let k = 0;
    k += e((v.x / 0.145) ** 2 + ((v.y - 0.03) / 0.13) ** 2) * 0.22 * noseLen * f2;        // nose (tip, aligned to the paint)
    k += e((v.x / 0.085) ** 2 + ((v.y - 0.13) / 0.12) ** 2) * 0.10 * noseLen * f2;        // nose bridge (up toward the brow)
    k += e(((v.y - 0.30) / 0.11) ** 2) * 0.09 * browHeavy * front;                        // brow ridge
    k -= e(((Math.abs(v.x) - 0.29) / 0.13) ** 2 + ((v.y - 0.19) / 0.12) ** 2) * 0.12 * front; // eye sockets (aligned to painted eyes)
    k += e(((Math.abs(v.x) - 0.47) / 0.19) ** 2 + ((v.y - 0.05) / 0.18) ** 2) * 0.06 * front;  // cheekbones
    k -= e(((Math.abs(v.x) - 0.27) / 0.15) ** 2 + ((v.y + 0.10) / 0.15) ** 2) * (0.04 + 0.09 * cheekGaunt) * front; // cheek hollow
    // human profile: nose forward, mouth set BACK under it, chin forward again
    k -= e((v.x / 0.32) ** 2 + ((v.y + 0.09) / 0.09) ** 2) * 0.13 * f2;                   // maxilla / mouth setback (aligned to the painted lips ≈ v.y −0.09)
    k += e((v.x / 0.16) ** 2 + ((v.y + 0.28) / 0.12) ** 2) * 0.17 * f2;                   // chin (forward + defined, just below the mouth — reads chin, not bill)
    k -= e((v.x / 0.18) ** 2 + ((v.y + 0.17) / 0.05) ** 2) * 0.03 * front;                // mentolabial crease (lip/chin break)

    // ---- egg profile: gentle occiput on the back (−z) ------------------------
    let z = v.z;
    if (v.z < 0) z = v.z * (1 + e(((v.y - 0.12) / 0.5) ** 2) * (0.09 + 0.04 * back));

    // ---- proportions: slim temples, tapered jaw, a touch taller (oval≠ball) --
    const jaw = Math.max(0, -v.y);
    const temple = e(((v.y - 0.22) / 0.28) ** 2);
    let sx = 0.89 - temple * 0.05 - jaw * (0.26 / jawWidth);
    sx += e(((v.y + 0.58) / 0.13) ** 2) * jaw * 0.06 * jawWidth;   // a little gonial (jaw-corner) width
    const sy = 1.15 * faceLength;                            // taller than wide → oval, not ball
    const sz = 1;                                            // no muzzle push (that read as a snout)
    let y = v.y;
    if (v.y < -0.5) y += (v.y + 0.5) * 0.08;                 // tiny chin drop only

    p.setXYZ(i, v.x * r * sx, y * r * sy, z * r * sz * (1 + k));
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ makeHair
// Layered overlapping hair as CLUMP CARDS (planes) textured with hairClump /
// beardClump (alpha silhouette + strand sheen). NOT a smooth dome, NOT loose
// cylinders. Dark hair is UNLIT (MeshBasicMaterial) so it stays dark under the
// point-blank torch; cards never cast shadows. Returns a THREE.Group ready to
// .add() onto a head (head-local units, skull radius ≈ 0.112).
//   style : 'scalp' | 'beardFull' | 'stubble' | 'wetCurtain'
export function makeHair({ style = 'scalp', color = 0x1a140d, wet = false, grey = false, faceLength = 1 } = {}) {
  const group = new THREE.Group();
  const bundle = grey ? beardClump() : hairClump({ wet, grey });
  // UNLIT so the torch can't blow it to white; the map carries tone+alpha, and
  // `color` gently tints it (lerped toward white so it never goes invisible).
  const tint = new THREE.Color(color).lerp(new THREE.Color(0xffffff), grey ? 0.3 : 0.34);

  // low alphaTest so each strand's soft edge survives → cards read as a mass,
  // not sparse wires; depthWrite on so the many overlapping cards sort cleanly.
  // Cards are COLLECTED (transform baked into the geometry) and merged per
  // material at the end, so a hair mass is 1 draw call per (opacity,alphaTest)
  // bucket instead of one per clump (dozens) — keeps the draw-call count flat.
  const matCache = new Map();
  const buckets = new Map();
  const cardMat = (opacity = 1, at = 0.12) => {
    const k = opacity + '|' + at;
    let m = matCache.get(k);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map: bundle.map, color: tint, transparent: true, alphaTest: at,
        opacity, depthWrite: true, side: THREE.DoubleSide,
      });
      matCache.set(k, m);
      buckets.set(m, []);
    }
    return m;
  };

  // place one clump card: rooted at `pos`, texture-top at the root, strands
  // hanging along -up. `out` is the outward face normal, `up` the root→crown
  // tangent (re-projected to be tangent to `out`). The card's world transform is
  // baked into its geometry so all cards of a material can merge into one mesh.
  const _rz = new THREE.Vector3(0, 0, 1);
  const addCard = (pos, out, up, w, h, mat, roll = 0) => {
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, -h / 2, 0);
    const o = out.clone().normalize();
    const u = up.clone().sub(o.clone().multiplyScalar(up.dot(o)));
    if (u.lengthSq() < 1e-6) u.set(0, 1, 0);
    u.normalize();
    const right = new THREE.Vector3().crossVectors(u, o).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, u, o));
    if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(_rz, roll));
    geo.applyMatrix4(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
    buckets.get(mat).push(geo);
  };

  const dirFrom = (polar, azim) => new THREE.Vector3(
    Math.sin(polar) * Math.sin(azim), Math.cos(polar), Math.sin(polar) * Math.cos(azim));
  // tangent pointing up-slope toward the crown; at the pole fall back to azimuth
  const crownUp = (dir, azim) => {
    const down = new THREE.Vector3(0, -1, 0);
    const flow = down.clone().sub(dir.clone().multiplyScalar(down.dot(dir)));
    if (flow.lengthSq() < 1e-6) flow.set(Math.sin(azim), 0, Math.cos(azim));
    return flow.normalize().negate();
  };

  let sd = (0x9e3779b1 ^ (style.length * 2654435761)) >>> 0;
  const rr = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };

  if (style === 'scalp') {
    // a shingled SHORT cap fitted to the OVOID skull (see headGeo). Each root is
    // scaled by the head's per-axis proportions so the hair sits ON the skull,
    // not proud of it, and the nape/sides are kept short so it reads as a neat
    // cap (two of the three wear hats over it) — not a straggly mop.
    const C = new THREE.Vector3(0, 0.01, -0.004);
    const S = new THREE.Vector3(0.90, 1.14 * faceLength, 1.03);   // MUST track headGeo sx/sy + occiput (incl. per-character faceLength)
    const R = 0.107;
    for (const layer of [0, 1]) {
      const rings = [0.3, 0.62, 0.94, 1.26, 1.5];        // polar angle from the crown
      for (const polar of rings) {
        const n = 9 + Math.round(polar * 9);
        for (let i = 0; i < n; i++) {
          const azim = (i / n) * Math.PI * 2 + (layer ? Math.PI / n : 0) + rr() * 0.2;
          const dir = dirFrom(polar, azim);
          const front = dir.z > 0.12, back = dir.z < -0.25;
          // clean cap: high hairline at the front (fringe), sweeping down the
          // sides and to the nape. A SMOOTH function of dir.z (not stepped
          // front/side/back zones) so the hairline has no squared temple notch.
          const lowY = 0.30 + Math.max(0, dir.z) * 0.40 + Math.min(0, dir.z) * 0.34;
          if (dir.y < lowY) continue;
          const root = new THREE.Vector3(dir.x * S.x, dir.y * S.y, dir.z * S.z)
            .multiplyScalar(R + layer * 0.005).add(C);
          const w = 0.05 + rr() * 0.022;
          const h = front ? 0.026 + rr() * 0.012                   // short fringe at the hairline
            : back ? 0.042 + polar * 0.018 + rr() * 0.014          // SHORT over the nape
              : 0.038 + rr() * 0.014;                              // short over the sides
          addCard(root, dir, crownUp(dir, azim), w, h, cardMat(), (rr() - 0.5) * 0.22);
        }
      }
    }
  } else if (style === 'wetCurtain') {
    // long wet hanks framing the face and hanging past the shoulders. Hang
    // straight down (gravity); front-centre left parted so the face shows.
    const R = 0.104, topY = 0.055;
    for (const layer of [0, 1]) {
      const n = 22;
      for (let i = 0; i < n; i++) {
        const azim = (i / n) * Math.PI * 2 + (layer ? Math.PI / n : 0);
        const dx = Math.sin(azim), dz = Math.cos(azim);  // dz>0 = front
        if (dz > 0.42 && Math.abs(dx) < 0.55) continue;  // part over the face
        const outH = new THREE.Vector3(dx, 0.12, dz).normalize();
        const front = dz > 0;
        const len = front ? 0.24 + Math.abs(dx) * 0.26 : 0.4 + rr() * 0.18;
        const pos = new THREE.Vector3(dx * R, topY, dz * R - 0.006 + layer * 0.004);
        const w = 0.06 + rr() * 0.03;
        addCard(pos, outH, new THREE.Vector3(0, 1, 0), w, len, cardMat(1, 0.1), dx * 0.12 + (rr() - 0.5) * 0.12);
      }
    }
    // crown cap so the top of the head isn't bald, and short temple locks
    for (let i = 0; i < 9; i++) {
      const azim = (i / 9) * Math.PI * 2;
      const dir = dirFrom(0.5 + rr() * 0.3, azim);
      if (dir.z > 0.25 && dir.y < 0.6) continue;
      const pos = dir.clone().multiplyScalar(0.112).add(new THREE.Vector3(0, 0.01, -0.005));
      addCard(pos, dir, crownUp(dir, azim), 0.06, 0.12, cardMat(1, 0.1), (rr() - 0.5) * 0.3);
    }
    for (const s of [-1, 1]) {
      const pos = new THREE.Vector3(s * 0.072, 0.055, 0.052);
      addCard(pos, new THREE.Vector3(s * 0.8, 0.1, 0.6), new THREE.Vector3(0, 1, 0), 0.045, 0.22, cardMat(1, 0.1), s * 0.18);
    }
  } else if (style === 'beardFull' || style === 'stubble') {
    // clumps along the jaw / chin, hanging down. stubble = short + low opacity.
    const shortB = style === 'stubble';
    const R = 0.104;
    const arcs = shortB ? [1.18, 1.5] : [1.02, 1.3, 1.58, 1.84];   // polar from crown → under the chin
    for (const polar of arcs) {
      const n = shortB ? 8 : 10;
      for (let i = 0; i < n; i++) {
        const azim = (i / (n - 1) - 0.5) * (shortB ? 1.5 : 2.0);   // front arc only (jaw)
        const dir = new THREE.Vector3(
          Math.sin(polar) * Math.sin(azim),
          Math.cos(polar),
          Math.max(0.25, Math.sin(polar) * Math.cos(azim)),
        ).normalize();
        if (dir.y > 0.06) continue;                       // below the mouth / along the jaw only
        const pos = dir.clone().multiplyScalar(R).add(new THREE.Vector3(0, -0.008, 0.004));
        const w = shortB ? 0.045 : 0.05 + rr() * 0.025;
        const h = shortB ? 0.028 + rr() * 0.015 : 0.06 + rr() * 0.05;
        addCard(pos, dir, new THREE.Vector3(0, 1, 0.5), w, h, cardMat(shortB ? 0.55 : 1, shortB ? 0.2 : 0.1), (rr() - 0.5) * 0.3);
      }
    }
  }

  // merge each material's collected cards into a single mesh (draw-call flat)
  for (const [mat, geos] of buckets) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = false;
    group.add(mesh);
  }
  return group;
}

// ------------------------------------------------------------------ skin part
// A small lit skin material for ears / neck: MeshPhysical with specularIntensity
// dropped (torch-proof) and a procedural skin normal (never depends on the async
// CC0 map). Drowned parts use the drowned flesh normal over a dark base.
function skinPartMat(color, drowned) {
  const det = drowned ? drownedFlesh() : livingSkinDetail();
  const base = new THREE.Color(color);
  if (!drowned) base.multiplyScalar(0.8);          // keep the neck/ears from blowing white point-blank
  const m = new THREE.MeshPhysicalMaterial({
    color: base, roughness: drowned ? 0.9 : 0.78, metalness: 0,
    specularIntensity: drowned ? 0.0 : 0.28,
  });
  // drowned flesh carries a grey-green albedo map — using it (× the dark colour)
  // keeps the neck/ears as dark as the mapped face instead of blowing white.
  if (det.map) m.map = det.map;
  if (det.normal) { m.normalMap = det.normal; m.normalScale = new THREE.Vector2(drowned ? 0.7 : 0.3, drowned ? 0.7 : 0.3); }
  if (det.rough) m.roughnessMap = det.rough;
  return m;
}

// ------------------------------------------------------------------ makeHead
// v2 head, preserving the FROZEN shared.js contract. See file header.
let _headSeed = 3;
export function makeHead({
  skinTone, beard = null, age = 0.4, iris = '#3a2a1c', hair = 0x1a140d,
  neckLen = 0.2, drowned = false, hairStyle = drowned ? 'wetCurtain' : 'scalp', ao = true,
  shape = {},   // per-character skull deform (see headGeo): faceLength/jawWidth/browHeavy/cheekGaunt/noseLen
  ruddy = 0.35, // per-character skin weathering (see faceTex)
} = {}) {
  const head = new THREE.Group();
  const seed = (_headSeed += 7);
  const base = { skin: skinTone, beard, age, iris, seed, drowned, ruddy };

  // four expression variants — swapped at runtime for blinking / speaking
  const faces = {
    neutral: faceTex(base),
    blink: faceTex({ ...base, eyesClosed: true }),
    talk: faceTex({ ...base, mouthOpen: 1 }),
    talkBlink: faceTex({ ...base, eyesClosed: true, mouthOpen: 1 }),
  };

  // face material: MeshPhysical, specularIntensity dropped so the torch can't
  // glaze the face white. Detail from procedural normal/roughness maps + AO.
  const det = drowned ? drownedFlesh() : livingSkinDetail();
  const mat = new THREE.MeshPhysicalMaterial({
    map: faces.neutral,
    normalMap: det.normal,
    roughnessMap: det.rough,
    normalScale: new THREE.Vector2(drowned ? 0.85 : 0.3, drowned ? 0.85 : 0.3),
    // living: a mid multiplier over the painted skin so the face reads bright in
    // the beam but the torch can't wash the mid-tones (pores/creases) to a flat
    // white. drowned: a dark grey-green so the killed-specular diffuse lands at
    // wet flesh, not white, at point-blank.
    color: drowned ? 0x3e433a : 0xb4a692,
    roughness: drowned ? 0.9 : 0.76,
    metalness: 0,
    specularIntensity: drowned ? 0.0 : 0.22,
    vertexColors: true,                                 // baked AO rides here
  });

  const geo = headGeo(0.112, shape);
  if (ao) bakeAO(geo, { strength: 1.3, spread: 2, aoMin: 0.55 });
  const skull = new THREE.Mesh(geo, mat);
  skull.castShadow = true;
  head.add(skull);

  // ears
  const skinCol = drowned ? 0x454a40 : new THREE.Color(skinTone).getHex();
  const earMat = skinPartMat(skinCol, drowned);
  for (const s of [-1, 1]) {
    // smaller, flatter, tucked against the (now narrower) skull and set BACK
    // behind the midline where a real ear sits — not a disc bolted to the cheek
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), earMat);
    ear.scale.set(0.42, 0.95, 0.62);
    ear.position.set(s * 0.09, -0.004, -0.022);
    ear.rotation.y = -s * 0.35;                 // lie flatter along the skull
    ear.castShadow = true;
    head.add(ear);
  }

  // scalp hair via clump cards (beard too, if requested)
  const scalp = makeHair({ style: hairStyle, color: hair, wet: drowned, grey: false, faceLength: shape.faceLength || 1 });
  head.add(scalp);
  if (beard) head.add(makeHair({ style: beard === 'stubble' ? 'stubble' : 'beardFull', color: hair, grey: true }));

  // a real neck reaching down to the collar so the head doesn't sit in the shoulders
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.066, neckLen, 14), skinPartMat(skinCol, drowned));
  neck.position.y = -0.075 - neckLen / 2;
  neck.castShadow = true;
  head.add(neck);

  // expression control (set each frame from update) — FROZEN contract
  let cur = 'neutral';
  head.userData.setFace = (state) => {
    const t = faces[state] || faces.neutral;
    if (cur !== state) { mat.map = t; cur = state; }
  };
  head.userData.blinkOff = (seed % 100) / 100 * 4;      // stagger blinks per person

  return { head, skull };
}
