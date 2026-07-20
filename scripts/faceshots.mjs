// Close-up FACE portraits of the three living survivors (mara / rufino / eliseo)
// from three angles — front, three-quarter, profile. The round-skull / duck-mouth
// problems only show in 3/4 + profile, which the existing npcshots.mjs never
// captures. OUT_DIR env sets the output dir (default _screenshots/faces).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT_DIR || '_screenshots/faces';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 900, height: 900 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const BASE = process.env.BASE_URL || 'http://localhost:5173';
await page.goto(`${BASE}/?skipintro&calm`, { waitUntil: 'networkidle0' });
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(450, 450);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 800));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Orbit the camera around an NPC's head at azimuth `a` (radians, relative to the
// way the NPC faces: 0 = dead front, +/- toward the sides), distance `d`, then
// aim yaw+pitch straight at the head and shoot. Camera stays at eye height and
// pitches to the face — the same framing the player gets in game.
async function faceShot(name, id, a, d) {
  // 1) place the camera by orbiting the head's horizontal position
  await page.evaluate(`(() => {
    const g = window.__niebla, THREE = g.THREE;
    g.player.flashOn = true;
    const npc = g.npcs.byId('${id}');
    const grp = npc.rig.group;
    const N = new THREE.Vector3(); grp.getWorldPosition(N);
    const ry = grp.rotation.y + (${a});
    g.player.pos.set(N.x + Math.sin(ry) * ${d}, g.player.pos.y, N.z + Math.cos(ry) * ${d});
  })()`);
  await sleep(700);   // let the camera follow player.pos for a frame
  // 2) aim at the head using the NOW-updated camera position, then shoot
  await page.evaluate(`(() => {
    const g = window.__niebla, THREE = g.THREE;
    const npc = g.npcs.byId('${id}');
    const head = new THREE.Vector3(); npc.rig.head.getWorldPosition(head);
    const cam = g.camera.position;
    const dx = head.x - cam.x, dz = head.z - cam.z;
    const horiz = Math.hypot(dx, dz) || 1e-3;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = Math.atan2(head.y - cam.y, horiz);
  })()`);
  await sleep(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const PRE = process.env.PREFIX || 'before';
// per-NPC close distance (Mara is seated & folded low → get in closer)
const DIST = { rufino: 0.95, mara: 0.72, eliseo: 0.95 };
for (const id of ['rufino', 'mara', 'eliseo']) {
  const d = DIST[id];
  await faceShot(`${PRE}-${id}-front`, id, 0.0, d);
  await faceShot(`${PRE}-${id}-34`, id, 0.7, d + 0.1);     // three-quarter
  await faceShot(`${PRE}-${id}-profile`, id, 1.45, d + 0.15); // near profile
}

console.log(JSON.stringify({ errs, out: OUT }));
await browser.close();
