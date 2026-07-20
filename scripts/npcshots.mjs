// Front-facing, flashlit portrait shots of every NPC — the real in-game look.
// Places the player in front of each NPC (from live scene data), flashlight on,
// pitched at the head. Renders a portrait + a point-blank (anti-bloom check) per
// NPC, the cellar girl, and a campfire wide. OUT_DIR env sets the output dir.
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT_DIR || '_screenshots';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?skipintro&calm', { waitUntil: 'networkidle0' });
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(640, 400);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 800));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// aim yaw+pitch at the NPC head from the live camera position, then shoot
async function aimAndShoot(name, id, extraSleep = 0) {
  await page.evaluate(`(() => {
    const g = window.__niebla, THREE = g.THREE;
    const npc = g.npcs.byId('${id}');
    const head = new THREE.Vector3(); npc.rig.head.getWorldPosition(head);
    const cam = g.camera.position;
    const dx = head.x - cam.x, dz = head.z - cam.z;
    const horiz = Math.hypot(dx, dz) || 1e-3;
    g.player.yaw = Math.atan2(-dx, -dz);      // face the head
    g.player.pitch = Math.atan2(head.y - cam.y, horiz);
  })()`);
  await sleep(450 + extraSleep);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// stand in front (auto: along the NPC's facing) at distance d
async function portraitAuto(name, id, d) {
  await page.evaluate(`(() => {
    const g = window.__niebla, THREE = g.THREE;
    g.player.flashOn = true;
    const grp = g.npcs.byId('${id}').rig.group;
    const N = new THREE.Vector3(); grp.getWorldPosition(N);
    const ry = grp.rotation.y;
    g.player.pos.set(N.x + Math.sin(ry) * ${d}, g.player.pos.y, N.z + Math.cos(ry) * ${d});
    g.player.pitch = 0;
  })()`);
  await sleep(1100);
  await aimAndShoot(name, id);
}

// stand at an explicit spot (for NPCs with occluders / trees in the facing dir)
async function portraitAt(name, id, cx, cz) {
  await page.evaluate(`(() => {
    const g = window.__niebla; g.player.flashOn = true;
    g.player.pos.set(${cx}, g.player.pos.y, ${cz}); g.player.pitch = 0;
  })()`);
  await sleep(1100);
  await aimAndShoot(name, id);
}

// Rufino faces open ground → auto front works
await portraitAuto('final-rufino', 'rufino', 2.7);
await portraitAuto('final-rufino-close', 'rufino', 1.2);
// Mara is behind a potting bench → approach from the greenhouse-entry side
await portraitAt('final-mara', 'mara', 34.1, -25.6);
await portraitAt('final-mara-close', 'mara', 35.4, -26.0);
// Eliseo faces the wired tree → shoot 3/4 from the south so the trunk is to the side
await portraitAt('final-eliseo', 'eliseo', 17.9, -15.8);
await portraitAt('final-eliseo-close', 'eliseo', 17.8, -14.6);

// ---- the cellar girl: ride the stair to flip cellarLevel, then stand in the doorway
await page.evaluate(`(() => {
  const g = window.__niebla; g.player.flashOn = true;
  g.player.pos.set(5.0, g.player.pos.y, -20.8);       // on the stair (flips cellarLevel true)
})()`);
await sleep(900);
await page.evaluate(`(() => {
  const g = window.__niebla; g.player.pos.set(4.5, g.player.pos.y, -20.2); // just inside the room
})()`);
await sleep(900);
await page.evaluate(`(() => {
  const g = window.__niebla, THREE = g.THREE;
  const gr = g.buildings.cellar.girl.group;
  const head = new THREE.Vector3(); (g.buildings.cellar.girl.group.getObjectByProperty('isGroup', true) || gr);
  const p = new THREE.Vector3(); gr.getWorldPosition(p);
  const cam = g.camera.position;
  const dx = p.x - cam.x, dz = p.z - cam.z; const horiz = Math.hypot(dx, dz) || 1e-3;
  g.player.yaw = Math.atan2(-dx, -dz);
  g.player.pitch = Math.atan2((p.y + 1.15) - cam.y, horiz);
})()`);
await sleep(500);
await page.screenshot({ path: `${OUT}/final-girl.png` });
// point-blank on the girl
await page.evaluate(`(() => { const g = window.__niebla; g.player.pos.set(4.5, g.player.pos.y, -18.9); })()`);
await sleep(700);
await page.evaluate(`(() => {
  const g = window.__niebla, THREE = g.THREE;
  const gr = g.buildings.cellar.girl.group; const p = new THREE.Vector3(); gr.getWorldPosition(p);
  const cam = g.camera.position; const dx = p.x - cam.x, dz = p.z - cam.z; const horiz = Math.hypot(dx, dz) || 1e-3;
  g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = Math.atan2((p.y + 1.25) - cam.y, horiz);
})()`);
await sleep(500);
await page.screenshot({ path: `${OUT}/final-girl-close.png` });

// campfire wide (blow-out fix)
await page.evaluate(`(() => { const g = window.__niebla; g.player.flashOn = true;
  g.player.pos.set(16.2, 0, 55.2); g.player.yaw = 0.12; g.player.pitch = -0.06; })()`);
await sleep(1000);
await page.screenshot({ path: `${OUT}/final-campfire.png` });

console.log(JSON.stringify({ errs }));
await browser.close();
