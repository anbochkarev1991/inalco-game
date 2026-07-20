// Screenshots of the north cemetery from fixed viewpoints, for eyeballing the
// fence + graves overhaul. Needs the dev server on :5173.
//   STUDIO=1 OUT_DIR=_screenshots/cemetery node scripts/cemshots.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT_DIR ?? './_screenshots/cemetery';
const STUDIO = !!process.env.STUDIO;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[ERR]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await page.goto('http://localhost:5173/?skipintro&calm', { waitUntil: 'networkidle0' });
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(640, 400);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 12000 });
await new Promise((r) => setTimeout(r, 2000));

// cemetery centre is (-8, -85); +z is south (the approach), -z is uphill/north.
// [name, x, z, yaw, pitch]
const SHOTS = [
  ['approach',   -8,  -75,  0.0,  0.05],   // gate straight-on, from outside
  ['gate-angle', -3,  -76,  0.5,  0.03],   // 3/4 view: gate + east railing
  ['aisle',      -8,  -82,  0.0,  0.08],   // stood in the gate, looking up the aisle to the monument
  ['across',     -14, -80, -0.7,  0.02],   // across the plot: railing + rows of stones
  ['wide',        3,  -73,  0.5,  0.05],   // wider establishing shot from the SE
];

const place = async (x, z, yaw, pitch) => {
  await page.evaluate(`(() => {
    const g = __niebla;
    g.player.pos.set(${x}, 0, ${z});
    g.player.yaw = ${yaw}; g.player.pitch = ${pitch};
    g.player.vel.set(0,0,0);
    g.player.flashOn = true; g.player.flashCharge = 1;
    const old = g.scene.getObjectByName('cemstudio'); if (old) g.scene.remove(old);
    if (${STUDIO}) {
      const L = new g.THREE.PointLight(0xfff2e0, 60, 0, 1.7);
      L.position.set(${x}, 6.5, ${z} - 4); L.name = 'cemstudio';
      g.scene.add(L);
    }
  })()`);
};

for (const [name, x, z, yaw, pitch] of SHOTS) {
  await place(x, z, yaw, pitch);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
}

await browser.close();
console.log('done ->', OUT);
