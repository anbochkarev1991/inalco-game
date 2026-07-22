// Exterior beauty/massing shots of the reshaped Inalco house. Auto-aims the
// player camera at a target point, boosts lighting + thins fog so the silhouette
// (steep roof, stone base, entry gable, chimneys, west wing) reads clearly.
//   GAME_URL=http://localhost:5174/?skipintro&calm OUT_DIR=_screenshots/mansion-new node scripts/mansionshots.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.GAME_URL ?? 'http://localhost:5174/?skipintro&calm';
const OUT = process.env.OUT_DIR ?? '_screenshots/mansion-new';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=metal', '--mute-audio', '--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[ERR]', e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[ERR]') || t.includes('Error')) console.log('[console]', t); });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(700, 450);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 600));

// bright, clear studio lighting for judging geometry (removed each shot, re-added)
const light = () => `(() => {
  const g = __niebla, T = g.THREE, s = g.scene;
  for (const n of ['massfill','massfill2','massamb']) { const o = s.getObjectByName(n); if (o) s.remove(o); }
  if (s.fog) s.fog.density = 0.0026;
  const d = new T.DirectionalLight(0xe6eeff, 2.7); d.position.set(30, 45, 40); d.name='massfill'; s.add(d);
  const d2 = new T.DirectionalLight(0x8496b0, 1.3); d2.position.set(-40, 25, -30); d2.name='massfill2'; s.add(d2);
  const a = new T.HemisphereLight(0xa6b6cc, 0x2c322c, 1.55); a.name='massamb'; s.add(a);
})()`;

// toggle the scattered vegetation (InstancedMesh trees/rocks/grass) so the side
// and rear elevations aren't hidden by the surrounding grove (buildings are plain
// Meshes, so they stay). Front/context shots keep the trees.
const trees = (off) => `(() => {
  __niebla.scene.traverse((o) => { if (o.isInstancedMesh) o.visible = ${off ? 'false' : 'true'}; });
})()`;

// [name, camX, camY(feet), camZ, targetX, targetY, targetZ, treesOff]
const EYE = 1.62;
const SHOTS = [
  ['01-lake-front',    1,  5,  21,    1, 6.0,  -9, false],  // straight two-storey lake elevation, in context
  ['02-entry-porch',   1,  3,   9,    1, 4.5,  -6, false],  // entrance + balcony + central dormer, close
  ['03-lake-3q',      20,  7,  15,   -2, 6.0, -13, false],  // front/lake 3-4 in context
  ['04-lake-3q-clear',20,  7,  15,   -2, 6.0, -13, true],   // same, grove hidden — clean massing
  ['05-west-3q',     -21,  7,  10,    0, 6.0, -12, true],   // porch/balcony + west end + wing shoulder
  ['06-west-end',    -26,  7,  -8,   -6, 6.0, -11, true],   // west gable + wing + west chimney breast
  ['07-east-end',     26,  7,  -8,    6, 6.0, -11, true],   // east gable + east chimney
  ['08-rear',          0,  8, -33,    0, 6.0, -15, true],   // rear two-storey elevation
  ['09-rear-NW',     -19,  9, -34,   -3, 6.0, -15, true],   // rear 3-4: wing + west chimney + dormers
  ['10-wing-close',  -24,  4,  -3,  -15, 2.5,  -4, true],   // close on the rear-west wing
];

for (const [name, cx, cy, cz, tx, ty, tz, treesOff] of SHOTS) {
  const dx = tx - cx, dz = tz - cz;
  const horiz = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);   // camDir forward = (-sin yaw, -cos yaw)
  const pitch = Math.atan2(ty - (cy + EYE), horiz);
  await page.evaluate(`(() => {
    const g = __niebla;
    g.player.pos.set(${cx}, ${cy}, ${cz});
    g.player.yaw = ${yaw}; g.player.pitch = ${pitch};
    g.player.vel.set(0,0,0);
    g.player.flashOn = false;
    ${trees(treesOff)};
    ${light()};
  })()`);
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
}

await browser.close();
console.log('done ->', OUT);
