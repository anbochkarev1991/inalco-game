// b2 · Camera as a lens of discovery.
//
// The fiction: "a photograph is a memory that can't blur" — the camera sees what
// is really there. Certain places hold something the naked eye can't find; it
// surfaces only when Ana PHOTOGRAPHS them. She frames an empty window, a stretch
// of shore, a cold camp — and the developed polaroid holds a figure, a face, a
// word that wasn't there when she looked.
//
// HOW IT WORKS (timing is the whole trick):
//   - Every reveal mesh is built here at init, HIDDEN (visible=false), and added
//     to the scene BEFORE main.js runs warmUpRenderer() — so its shader compiles
//     behind the title screen (this game's whole perf history is killing
//     first-draw compiles).
//   - On a real photo (player.tryFlash() succeeded) that did NOT hit an enemy,
//     main.js calls tryReveal(camPos, camDir). If the shot is aimed at an unfired
//     reveal within range + view cone, the reveal is ARMED (its mesh stays hidden)
//     and the descriptor is returned.
//   - The mesh stays hidden through the normal on-screen render, so the live world
//     never shows it. Then, in the end-of-frame capture block, main.js surfaces it
//     (showActive), re-renders at a LOW flash exposure into the not-yet-presented
//     canvas — legible, unlike the ~0.8 flash white-out — grabs that framebuffer
//     for the polaroid, then hides it (hideActive) and re-renders reveal-free so
//     the frame actually shown to the player has no figure in it.
//   - Net: the figure lives only in the developed photo, never in the live world.
//     Each spot fires exactly ONCE; afterward photos there are ordinary.
//
// All figures are unlit MeshBasicMaterial: the ~115-intensity flashlight can't
// blow them white, and PALE bodies read as bright shapes against the night.

import * as THREE from 'three';
import { LAYOUT } from './config.js';
import { canvasTexture } from './world.js';

// ------------------------------------------------------------------ textures

// A pale, water-logged human form on an alpha map: bright body (so it survives
// the flash frame as a light shape) with dark eye hollows + mouth to seat a face.
function paleFigureTex() {
  return canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cx = W / 2;
    // body fill: a cold vertical gradient, brightest at the head
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(214,224,226,0.96)');
    g.addColorStop(0.5, 'rgba(178,190,193,0.9)');
    g.addColorStop(1, 'rgba(120,132,136,0.72)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(cx - W * 0.30, H * 0.30);
    c.quadraticCurveTo(cx - W * 0.34, H * 0.46, cx - W * 0.20, H * 0.60);
    c.lineTo(cx - W * 0.19, H * 0.99);
    c.lineTo(cx - W * 0.03, H * 0.99);
    c.lineTo(cx - W * 0.02, H * 0.66);
    c.lineTo(cx + W * 0.02, H * 0.66);
    c.lineTo(cx + W * 0.03, H * 0.99);
    c.lineTo(cx + W * 0.19, H * 0.99);
    c.quadraticCurveTo(cx + W * 0.34, H * 0.46, cx + W * 0.30, H * 0.30);
    c.closePath();
    c.fill();
    // neck + head
    c.fillRect(cx - W * 0.07, H * 0.22, W * 0.14, H * 0.09);
    c.beginPath();
    c.ellipse(cx, H * 0.155, W * 0.155, H * 0.09, 0, 0, 7);
    c.fill();
    // a drowned face: dark eye hollows + a slack mouth
    c.fillStyle = 'rgba(18,22,26,0.82)';
    c.beginPath(); c.ellipse(cx - W * 0.06, H * 0.15, W * 0.045, H * 0.03, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(cx + W * 0.06, H * 0.15, W * 0.045, H * 0.03, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(16,20,24,0.6)';
    c.beginPath(); c.ellipse(cx, H * 0.205, W * 0.04, H * 0.022, 0, 0, 7); c.fill();
    // wet hair strands framing the face
    c.strokeStyle = 'rgba(150,162,166,0.5)'; c.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      c.beginPath();
      c.moveTo(cx + i * W * 0.045, H * 0.085);
      c.quadraticCurveTo(cx + i * W * 0.06, H * 0.18, cx + i * W * 0.05, H * 0.26);
      c.stroke();
    }
  }, 96, 224);
}

// A drowned face seen from above, just under the surface: pale oval, black eye
// pits, parted mouth, hair fanning out in the water.
function faceTex() {
  return canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.52;
    // hair haloing out into the water first (so the face sits over it)
    c.strokeStyle = 'rgba(96,108,110,0.42)'; c.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * W * 0.2, cy + Math.sin(a) * H * 0.22);
      c.lineTo(cx + Math.cos(a) * W * (0.34 + Math.random() * 0.1),
        cy + Math.sin(a) * H * (0.36 + Math.random() * 0.1));
      c.stroke();
    }
    // the face
    const g = c.createRadialGradient(cx, cy, 4, cx, cy, W * 0.3);
    g.addColorStop(0, 'rgba(206,216,216,0.95)');
    g.addColorStop(0.7, 'rgba(168,180,182,0.85)');
    g.addColorStop(1, 'rgba(120,132,134,0.2)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, cy, W * 0.22, H * 0.28, 0, 0, 7); c.fill();
    // eyes — open, black, looking up
    c.fillStyle = 'rgba(10,12,16,0.9)';
    c.beginPath(); c.ellipse(cx - W * 0.085, cy - H * 0.06, W * 0.05, H * 0.045, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(cx + W * 0.085, cy - H * 0.06, W * 0.05, H * 0.045, 0, 0, 7); c.fill();
    // nose shadow + parted mouth
    c.fillStyle = 'rgba(70,80,84,0.55)';
    c.fillRect(cx - W * 0.012, cy - H * 0.02, W * 0.024, H * 0.09);
    c.fillStyle = 'rgba(14,16,20,0.7)';
    c.beginPath(); c.ellipse(cx, cy + H * 0.14, W * 0.06, H * 0.03, 0, 0, 7); c.fill();
  }, 128, 160);
}

// A word written from the INSIDE in the condensation of a fogged pane: bright
// finger-cleared strokes on dark misted glass, with drips. Space-separated tokens
// stack on their own lines so the letters stay big and legible in a tiny polaroid.
function paneTex(word) {
  const lines = word.split(' ');
  return canvasTexture((c, W, H) => {
    // dark, misted glass base
    c.fillStyle = '#0c1418'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 3200; i++) {                        // condensation speckle
      const v = 40 + Math.random() * 60;
      c.fillStyle = `rgba(${v},${v + 8},${v + 10},${0.05 + Math.random() * 0.09})`;
      c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // the word, wiped clear — bright, slightly smeared, mirrored because it is
    // written from behind the glass (the photo reads it the right way round for us)
    c.save();
    c.translate(W, 0); c.scale(-1, 1);
    c.fillStyle = 'rgba(232,239,240,0.96)';
    c.font = `700 96px Georgia`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(214,228,232,0.85)'; c.shadowBlur = 14;
    const step = H / (lines.length + 1);
    lines.forEach((ln, i) => c.fillText(ln, W / 2, step * (i + 1)));
    c.restore();
    // drips running down from the letters
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(214,226,230,0.55)'; c.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const x = W * (0.14 + Math.random() * 0.72);
      c.beginPath();
      c.moveTo(x, H * (0.35 + Math.random() * 0.4));
      c.lineTo(x + (Math.random() - 0.5) * 8, H * (0.65 + Math.random() * 0.33));
      c.stroke();
    }
  }, 420, 320);
}

// ------------------------------------------------------------------ builder

export function buildReveals(scene, ctx) {
  const { world, buildings, npcs, camera, ui } = ctx;
  const gh = world.groundHeight;
  const HX = LAYOUT.house.x, HZ = LAYOUT.house.z;

  // shared materials — one figure map reused across the standing figures, so
  // only one figure shader ever compiles (all are unlit / near-identical).
  const figMat = new THREE.MeshBasicMaterial({
    map: paleFigureTex(), transparent: true, opacity: 0.96,
    alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: true, fog: true,
  });
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTex(), transparent: true, opacity: 0.95,
    alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: true,
  });
  const paneMat = new THREE.MeshBasicMaterial({
    map: paneTex("DON'T ANSWER"), transparent: true, opacity: 0.96,
    alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: true, fog: true,
  });

  // a standing figure plane, pivoted at the feet so it grounds cleanly
  const figGeo = new THREE.PlaneGeometry(0.9, 1.78);
  figGeo.translate(0, 1.78 / 2, 0);

  const figure = (x, z, ry = 0, scale = 1) => {
    const m = new THREE.Mesh(figGeo, figMat);
    m.position.set(x, gh(x, z), z);
    m.rotation.y = ry;
    m.scale.setScalar(scale);
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    return m;
  };

  // the reveal registry. Each: id, the hidden mesh, an aim gate (range + view
  // cone), a one-time Ana line and a polaroid caption.
  const list = [];
  const add = (def) => { def.fired = false; list.push(def); return def; };

  // --- 1) a pale figure at an "empty" front window (leftmost pane) --------
  // The glass is at world z ≈ -7.25; the figure stands just at it, distinct from
  // a2's ghost planes (z -7.05) and a3's physical gatherers (z -6.3).
  {
    const x = HX - 8.5, z = HZ + 6.8;     // z ≈ -7.2, right at the glass, facing the lawn
    add({
      id: 'window', mesh: figure(x, z, 0, 1.32), x, z, range: 17, cos: 0.7,
      caption: 'FRAME — "AT THE GLASS". Someone is standing in that room. The room I photographed because it was empty.',
      line: 'The room was empty. I looked twice, through the lens and over it. ...The picture doesn’t agree with me.',
    });
  }

  // --- 2) a word in the condensation of another pane (rightmost) ----------
  {
    const x = HX + 10, z = HZ + 6.8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.04), paneMat);
    m.position.set(x, gh(x, z) + 1.5, z);    // window-height, facing the lawn
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    add({
      id: 'pane', mesh: m, x, z, range: 17, cos: 0.72,
      caption: 'FRAME — "THE PANE". Two words, in the condensation, written from the inside. I did not write them.',
      line: 'Clean glass when I framed it. In the photo there’s writing in the mist, from the inside — DON’T ANSWER.',
    });
  }

  // --- 3) a drowned face in the shallows off the jetty --------------------
  {
    const x = 0, z = 81.5;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.38), faceMat);
    m.rotation.x = -Math.PI / 2;             // lie flat, face turned up out of the water
    m.rotation.z = Math.PI;                  // crown pointing away from the jetty
    m.position.set(x, 0.06, z);              // just at the surface (water level y=0)
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    add({
      id: 'tideline', mesh: m, x, z, range: 15, cos: 0.55,
      caption: 'FRAME — "THE SHALLOWS". A face, just under the surface. Looking up. At the boat I came in on.',
      line: 'There was nothing in the water. The flash found a face in it, turned up toward me. Nothing there. In the photo, a face.',
    });
  }

  // --- 4) a figure standing in the drowned crew's camp -------------------
  {
    const cam = LAYOUT.crewCamp;
    const x = cam.x + 6, z = cam.z - 3.4;    // among the tents (see story.buildDiscoveries)
    add({
      id: 'camp', mesh: figure(x, z, 0, 1.3), x, z, range: 15, cos: 0.62,
      caption: 'FRAME — "THE CAMP". A figure between the tents, perfectly still. The camp was empty. I walked through it.',
      line: 'I walked through that camp. Nobody. There’s someone standing between the tents in the shot, holding very still.',
    });
  }

  // --- 5) a small one at Delfina's grave ---------------------------------
  {
    const w = npcs.wireTree;
    const x = w.x + 0.95, z = w.z - 1.35;    // the headstone under the arrayán
    add({
      id: 'grave', mesh: figure(x, z, 0, 0.92), x, z, range: 11, cos: 0.6,
      caption: 'FRAME — "THE STONE". A small one, standing at the grave. Facing the camera, the way children do.',
      line: 'The grave was alone when I framed it. In the picture a child stands beside the stone. Small. Patient.',
    });
  }

  // -------------------------------------------------------------- runtime
  let active = null;

  return {
    meshes: list.map((r) => r.mesh),

    // Called from the mousedown flash path AFTER an enemy-hit check has failed.
    // If the shot is aimed at an unfired reveal in range + cone, arm it and return
    // the descriptor (with .caption). The mesh is NOT surfaced here — it stays
    // hidden through the normal on-screen render, so nothing shows in the live
    // world. main.js surfaces it only for the off-present capture render.
    tryReveal(camPos, camDir) {
      const fx = camDir.x, fz = camDir.z;
      const fl = Math.hypot(fx, fz) || 1;
      let best = null, bestDot = -2;
      for (const r of list) {
        if (r.fired) continue;
        const dx = r.x - camPos.x, dz = r.z - camPos.z;
        const d = Math.hypot(dx, dz);
        if (d > r.range) continue;
        const dot = (dx * fx + dz * fz) / (d * fl || 1);
        if (dot < r.cos) continue;           // outside the view cone → not framed
        if (dot > bestDot) { bestDot = dot; best = r; }   // most-centered wins
      }
      if (!best) return null;
      best.fired = true;
      active = best;
      if (ui && best.line) ui.say('ANA', best.line, 4.8);
      return best;
    },

    // main.js pairs these around the capture: showActive() surfaces the armed mesh
    // for a re-render into the (not-yet-presented) canvas at a low exposure so the
    // figure reads in the photo; hideActive() then clears it so the presented
    // frame — and every frame after — stays reveal-free.
    showActive() { if (active) active.mesh.visible = true; },
    hideActive() { if (active) { active.mesh.visible = false; active = null; } },

    // No-op: the flow is deterministic (arm in mousedown → show/capture/hide in the
    // end-of-frame capture block). Nothing to animate. Kept for interface symmetry.
    update() {},
  };
}
