// b3 · Places that change on revisit.
//
// The small world is one-way no longer. As the night deepens (night.phase) and
// after key beats, the house and grounds QUIETLY CHANGE while Ana is away from
// them — a cleared room is not the same room when she comes back. Each change:
//   1) requires she has been in the zone at least once (so she knew the old
//      state), 2) fires exactly ONCE, 3) is applied while she is AWAY from the
//      zone (never a morph in view), 4) is discovered on RETURN. Most are silent;
//      a couple earn a sparse Ana line. The reward is catching it yourself.
//
// PERF / WARM-UP: every NEW mesh + material this file makes (the two chalk-drawing
// variants) is built HERE, in buildRevisit(), which main.js calls BEFORE
// warmUpRenderer() — so their shaders compile behind the title screen. The other
// changes toggle meshes that already exist (doors, the piano, b1's front salt, a
// hidden story scrap, a corridor painting). update() does only a few distance
// tests per frame and allocates nothing.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from './config.js';
import { CELLAR, canvasTexture } from './world.js';

// A child's chalk drawing on stone: a tall woman by the water holding a small
// faceless hand (matches the cellarNote lore). The "grown" variant has gained a
// SECOND faceless child and a tally — six, the sixth struck out ("i asked six").
function chalkTex(grown) {
  return canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(226,228,220,0.9)';
    c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';

    // waterline, low across the wall
    c.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = H * 0.84 + Math.sin(x * 0.05) * 5;
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();

    // the tall woman (unnaturally long body), left of centre
    const wx = W * 0.34, wy = H * 0.24;
    c.beginPath(); c.arc(wx, wy, 12, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(wx, wy + 12); c.lineTo(wx, H * 0.7); c.stroke();
    c.beginPath(); c.moveTo(wx, wy + 24); c.lineTo(wx - 22, wy + 56); c.stroke();
    c.beginPath(); c.moveTo(wx, wy + 24); c.lineTo(wx + 24, wy + 62); c.stroke();
    c.beginPath(); c.moveTo(wx, H * 0.7); c.lineTo(wx - 16, H * 0.82); c.stroke();
    c.beginPath(); c.moveTo(wx, H * 0.7); c.lineTo(wx + 16, H * 0.82); c.stroke();

    // a small faceless child — two black circles for eyes are the only face
    const child = (cx, cy, s = 1) => {
      c.beginPath(); c.arc(cx, cy, 8 * s, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 8 * s); c.lineTo(cx, cy + 42 * s); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 16 * s); c.lineTo(cx - 11 * s, cy + 34 * s); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 16 * s); c.lineTo(cx + 11 * s, cy + 34 * s); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 42 * s); c.lineTo(cx - 8 * s, cy + 52 * s); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 42 * s); c.lineTo(cx + 8 * s, cy + 52 * s); c.stroke();
      c.save(); c.fillStyle = 'rgba(6,6,9,0.92)';
      c.beginPath(); c.arc(cx - 3 * s, cy - 1, 2.6 * s, 0, 7); c.fill();
      c.beginPath(); c.arc(cx + 3 * s, cy - 1, 2.6 * s, 0, 7); c.fill();
      c.restore();
    };
    child(wx + 36, wy + 54, 1);

    if (grown) {
      // a second little one has been added, off to the side
      child(W * 0.74, H * 0.5, 0.9);
      // and a tally, kept the way she keeps count: six, the sixth crossed through
      c.lineWidth = 4;
      const tx = W * 0.62, ty = H * 0.12;
      for (let i = 0; i < 5; i++) {
        c.beginPath(); c.moveTo(tx + i * 10, ty); c.lineTo(tx + i * 10, ty + 24); c.stroke();
      }
      c.beginPath(); c.moveTo(tx - 8, ty + 24); c.lineTo(tx + 48, ty - 4); c.stroke();
    }
  }, 256, 220);
}

export function buildRevisit(scene, ctx) {
  const { buildings, night, ui, player, story } = ctx;
  const HX = LAYOUT.house.x, HZ = LAYOUT.house.z, HY = LAYOUT.house.y;
  const dist = (p, x, z) => Math.hypot(p.x - x, p.z - z);

  // -------------------------------------------------- new meshes (pre-warm-up)
  // The cellar chalk, on the east wall by the cellarNote. Early state visible
  // from the start; the grown state hidden until a later cellar return.
  const chalkMat = (grown) => new THREE.MeshBasicMaterial({
    map: chalkTex(grown), transparent: true, opacity: grown ? 0.8 : 0.62,
    depthWrite: false, side: THREE.FrontSide,
  });
  const chalkGeo = new THREE.PlaneGeometry(1.7, 1.25);
  const chalkX = CELLAR.roomMaxX - 0.06;     // just off the inner face of the east wall
  const chalkEarly = new THREE.Mesh(chalkGeo, chalkMat(false));
  const chalkGrown = new THREE.Mesh(chalkGeo, chalkMat(true));
  for (const m of [chalkEarly, chalkGrown]) {
    m.position.set(chalkX, 1.12, -15.3);
    m.rotation.y = -Math.PI / 2;             // face -x, into the room
    m.renderOrder = 2;
    scene.add(m);
  }
  chalkGrown.visible = false;

  // Wet drag-marks up the staircase treads (the rumor of the thing upstairs,
  // THING_PLAN §2.8): three smeared treads + the landing, merged into one
  // hidden mesh. Surfaced by change 7 below while Ana is away.
  const dragTex = canvasTexture((c, W, H) => {
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 24 + (i % 3) * 6, w = 6 + (i % 4) * 3;
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(16,10,14,0)');
      grad.addColorStop(0.4, 'rgba(16,10,14,0.7)');
      grad.addColorStop(1, 'rgba(16,10,14,0.15)');
      c.fillStyle = grad;
      c.fillRect(x, 0, w, H);
    }
  }, 256, 128);
  const dragMat = new THREE.MeshLambertMaterial({ map: dragTex, transparent: true, depthWrite: false });
  const dragGeos = [];
  // stair: local x centre 1.1; tread tops from mansion's formula (house at 0,2.1,-14)
  for (const [wy, wz] of [[2.796, -10.4], [3.725, -12.0], [4.654, -13.6], [5.35, -15.25]]) {
    const gg = new THREE.PlaneGeometry(0.78, 0.52);
    gg.rotateX(-Math.PI / 2);
    gg.translate(1.1, wy + 0.012, wz);
    dragGeos.push(gg);
  }
  const dragMarks = new THREE.Mesh(mergeGeometries(dragGeos, false), dragMat);
  dragMarks.renderOrder = 2;
  dragMarks.visible = false;
  scene.add(dragMarks);

  // ------------------------------------------------------------ the changes
  // Each: inside(p) — is Ana in the zone; gate() — phase/flag threshold; apply()
  // — the one-time change (fired while away); notice?() — optional line on return.
  const changes = [
    {
      // 1) the front salt line, kicked apart. "The back door twice — it forgets";
      //    now the front forgets too, once the night is well underway.
      id: 'salt',
      inside: (p) => dist(p, 1.0, -7.5) < 4.0,
      gate: () => night.phase > 0.30,
      apply: () => { story._frontSalt.visible = false; story._frontSaltBroken.visible = true; },
      notice: () => ui.say('ANA', 'The salt at the front door — dragged apart. A gap kicked clean through the line. Something crossed it the easy way.', 4.6),
    },
    {
      // 2) the back door, closed or shut behind you, now stands ajar on return.
      id: 'backDoor',
      inside: (p) => dist(p, HX, HZ - 6.5) < 4.5,
      gate: () => night.phase > 0.40,
      apply: () => { buildings.doors.back.target = 0.42; },   // eased open a hand's width
    },
    {
      // 3) the cellar chalk has grown — another child, and a count up to six.
      id: 'chalk',
      inside: () => buildings.cellar.playerBelow,
      gate: () => night.phase > 0.40,
      apply: () => { chalkEarly.visible = false; chalkGrown.visible = true; },
      notice: () => ui.say('ANA', 'The drawing. There is more of it than there was. Another little one, off to the side. And a tally — six marks, and the sixth struck out.', 5.2),
    },
    {
      // 4) the piano lid, lowered when you left, is standing open on the strings.
      id: 'piano',
      inside: (p) => dist(p, HX - 9.9, HZ - 5.0) < 4.0,
      gate: () => night.phase > 0.55,
      apply: () => { if (!buildings.piano.open) buildings.piano.toggle(); },
    },
    {
      // 5) a page that was not on the sitting-room table appears there.
      id: 'scrap',
      inside: (p) => dist(p, HX - 8.0, HZ + 4.0) < 4.5,
      gate: () => night.phase > 0.45,
      apply: () => { story._scrapReady = true; story._scrapItem.mesh.visible = true; },
    },
    {
      // 6) the corridor portrait, square when you passed it, now hangs crooked.
      id: 'painting',
      inside: (p) => dist(p, HX + 1.7, HZ + 5.2) < 4.5,
      gate: () => night.phase > 0.50,
      apply: () => { buildings.paintings.corridor.rotation.z = 0.24; },
    },
    {
      // 7) wet drag-marks up the staircase, found on return — something went
      //    up (or came partway down) while she was elsewhere. The stairs start
      //    asking the question the caretaker's note plants.
      id: 'stairDrag',
      inside: (p) => dist(p, HX + 1.1, HZ + 2.0) < 4.5,
      gate: () => night.phase > 0.45,
      apply: () => { dragMarks.visible = true; },
      notice: () => ui.say('ANA', 'The stairs are wet. Dragged wet, in stripes, all the way up. That was not there when I passed.', 4.6),
    },
  ];

  function update(/* dt */) {
    const p = player.pos;
    for (const c of changes) {
      const inside = c.inside(p);
      if (inside) c.seen = true;
      if (!c.done) {
        // fire only once Ana knew the old state, has stepped away, and the night
        // has reached the change's threshold — so it is applied out of her sight
        if (c.seen && !inside && c.gate()) { c.apply(); c.done = true; }
      } else if (c.notice && !c.noticed && inside) {
        c.noticed = true; c.notice();
      }
    }
  }

  return {
    update,
    // for debugging from __niebla: which changes have fired
    get log() { return changes.map((c) => ({ id: c.id, seen: !!c.seen, done: !!c.done })); },
    // test hook: force a specific change to apply now (ignores away/gate checks)
    force(id) { const c = changes.find((x) => x.id === id); if (c && !c.done) { c.apply(); c.done = true; } },
  };
}
