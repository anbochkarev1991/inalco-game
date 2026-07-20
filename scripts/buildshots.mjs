// Before/after screenshots of every building & sign, from fixed viewpoints, for
// eyeballing the buildings overhaul. Needs the dev server on :5173.
//   OUT_DIR=_screenshots/buildings/after node scripts/buildshots.mjs
// Add NIGHT=1 to also capture the house at night with the Returned massing in the
// yard (to judge see-through windows).
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT_DIR ?? './_screenshots/buildings';
const NIGHT = !!process.env.NIGHT;
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[ERR]', e.message));
await page.goto('http://localhost:5173/?skipintro&calm', { waitUntil: 'networkidle0' });
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(640, 400);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 500));

// [name, x, y, z, yaw, pitch, flashOn, extraJS]
const SHOTS = [
  ['house-front',    1,   0,   2,   0,        0.02, true,  ''],
  ['house-front-in', 1,   0,  -10,  Math.PI,  0.0,  true,  ''],
  ['house-corridor', 0,   0,  -9,   Math.PI,  0.0,  true,  ''],
  ['house-sitting',  -6,  0,  -11,  -Math.PI/2, 0.0, true, ''],
  ['house-bedroom',  9.5, 0,  -16,  Math.PI/2,  0.0, true, ''],
  ['house-rear',     0,   0,  -26,  Math.PI,  0.03, true,  ''],
  ['house-side-E',   18,  0,  -14, -Math.PI/2, 0.0, true,  ''],
  ['cellar-foot',    5,   0,  -20,  Math.PI,  -0.1, true,  ''],
  ['cellar-room',    4.5, 0,  -17,  Math.PI,  0.0,  true,  ''],
  ['kiosk',          7,   0,   34, -Math.PI/2, 0.1, true,  ''],
  ['ferry-sign',    -1,   0,   70,  Math.PI,  0.05, true,  ''],
  ['plaque',         3.4, 0,   1,   0,        0.05, true,  ''],
  ['boathouse-slip',-46,  0,   58,  0,        0.0,  true,  ''],
  ['boathouse-door',-53,  0,   57, -Math.PI/2, 0.0, true,  ''],
  ['boat-detail',   -45.5,0,   62,  Math.PI+0.02, -0.04, true, ''],
];

// STUDIO=1 adds a soft fill light at the camera so geometry is judgeable; omit it
// for the true in-game (flashlight-only) look.
const STUDIO = !!process.env.STUDIO;
const place = async (x, y, z, yaw, pitch, flashOn, extra) => {
  await page.evaluate(`(() => {
    const g = __niebla;
    g.player.pos.set(${x}, ${y}, ${z});
    g.player.yaw = ${yaw}; g.player.pitch = ${pitch};
    g.player.vel.set(0,0,0);
    g.player.flashOn = ${flashOn}; g.player.flashCharge = 1;
    const old = g.scene.getObjectByName('buildstudio'); if (old) g.scene.remove(old);
    if (${STUDIO}) {
      const L = new g.THREE.PointLight(0xfff2e0, 26, 0, 1.9);
      L.position.set(${x} + 1.0, 2.4, ${z} + 1.0); L.name = 'buildstudio';
      g.scene.add(L);
    }
    ${extra}
  })()`);
};

for (const [name, x, y, z, yaw, pitch, flash, extra] of SHOTS) {
  await place(x, y, z, yaw, pitch, flash, extra);
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
}

if (NIGHT) {
  // The Returned massing just outside chosen windows, judged from a dark room
  // with the FLASHLIGHT OFF so moonlit silhouettes read through the glass.
  // [name, playerX, playerZ, yaw] — each looks straight at a window with a
  // monster planted just outside it.
  const views = [
    ['night-front-in', -4.5, -11, Math.PI],       // sitting room -> front window x=-4.5
    ['night-side-in',   9,   -10.5, -Math.PI / 2], // bedroom -> east window (world z=-10.5)
    ['night-rear-in',  -4,   -11.5, 0],            // dining -> back window x=-4
  ];
  await page.evaluate(`(() => {
    const g = __niebla;
    g.director.clearAll();
    // plant the Returned just OUTSIDE the target windows (world coords)
    const spots = [
      [-4.5,-5.0],[5,-5.0],[-9,-5.5],            // front yard, at the front windows
      [14,-10.5],[14,-17.5],                     // east side, at the two bedroom windows
      [-4,-22.5],[4,-22.5],[-9.5,-22.5],         // rear yard, at the back windows
    ];
    const kinds = ['testigo','doble','archivero'];
    spots.forEach((s,i) => { const e = g.director.spawn(kinds[i%3], s[0], s[1]); if (e) { e.state='chase'; e.stateT=1; } });
  })()`);
  for (const [name, x, z, yaw] of views) {
    await place(x, 0, z, yaw, 0.0, false, '');    // flashlight OFF
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(name);
  }
}

await browser.close();
console.log('done ->', OUT);
