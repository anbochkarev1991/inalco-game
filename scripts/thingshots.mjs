// Portraits of THE UNFINISHED — the thing in the upstairs east-wing bedroom
// (see THING_PLAN.md). Rides the staircase footprint first so the mansion's
// floor override flips to the upper storey (same trick as the cellar recipe),
// then frames the sculpt from the doorway lane / point-blank at the hand /
// side-on along the wall, in flashlight-only AND flood light.
//   GAME_URL=http://localhost:5173/?skipintro&calm OUT_DIR=_screenshots/thing node scripts/thingshots.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.GAME_URL ?? 'http://localhost:5173/?skipintro&calm';
const OUT = process.env.OUT_DIR ?? '_screenshots/thing';
const ONLY = process.env.ONLY ?? null;          // substring filter on shot names
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=metal', '--mute-audio', '--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[ERR]', e.message));
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(700, 450);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 600));

// report the sculpt budget up front
const tris = await page.evaluate('__niebla.buildings.thing?.tris ?? -1');
console.log(`thing tris: ${tris}${tris > 140000 ? '  ⚠ OVER BUDGET (>140k)' : ''}`);

// ride the stair so the floor override flips `upperLevel` true, then settle
async function goUpstairs() {
  await page.evaluate(`(() => {
    const g = __niebla;
    g.player.pos.set(1.1, 5.2, -14.6);   // inside the stairwell footprint, near the top
    g.player.vel.set(0, 0, 0);
  })()`);
  await new Promise((r) => setTimeout(r, 500));   // frames: floorAt rides the stair → upperLevel=true
}

// interior studio lighting (the upstairs room is windowless-dark without power)
const flood = (on) => `(() => {
  const g = __niebla, T = g.THREE, s = g.scene;
  for (const n of ['thingfill1','thingfill2','thingamb']) { const o = s.getObjectByName(n); if (o) s.remove(o); }
  if (${on ? 'true' : 'false'}) {
    const p1 = new T.PointLight(0xe8eeff, 42, 0, 1.6); p1.position.set(8.4, 7.5, -15.0); p1.name='thingfill1'; s.add(p1);
    const p2 = new T.PointLight(0xffe9cc, 22, 0, 1.6); p2.position.set(10.5, 7.3, -18.2); p2.name='thingfill2'; s.add(p2);
    const a = new T.AmbientLight(0x8894a8, 0.85); a.name='thingamb'; s.add(a);
  }
})()`;

// [name, camX, camZ, targetX, targetY, targetZ, floodOn]
// camY is always the deck (feet 5.35); world: room x 7.2..11.9, thing at
// (10.1, -14.35), chimney breast just north of it (z -16.8..-15.6)
const EYE = 1.62, DECK = 5.35;
const SHOTS = [
  ['01-doorway-torch',  7.5, -14.35, 10.2, 6.0, -14.35, false], // the first-sight read down the lane
  ['02-doorway-flood',  7.5, -14.35, 10.2, 6.0, -14.35, true],  // same framing, geometry judgment
  ['03-hand-close',     8.1, -13.1,   8.7, 5.6, -14.9, false],  // point-blank at the planted arm
  ['04-hand-flood',     8.1, -13.1,   8.7, 5.6, -14.9, true],
  ['05-along-wall',     9.2, -11.2,  10.7, 6.1, -14.8, true],   // down the long axis: pods + wall-climb + chimney
  ['06-south-3q',       8.0, -12.0,  10.4, 5.9, -14.8, true],   // 3/4 from the south corner
  ['07-above-plan',     8.6, -14.35, 10.3, 5.4, -14.35, true],  // high 3/4 (sprawl footprint)
  ['08-face-torch',     8.55, -12.9,  9.5, 5.9, -13.5, false],  // face W (door-facing sculpted face), torch
  ['09-face-flood',     8.55, -12.9,  9.5, 5.9, -13.5, true],
  ['10-skull-torch',   10.0, -11.4,  10.0, 5.85, -12.85, false], // the sculpted screaming face, from the south
  ['11-skull-flood',   10.0, -11.4,  10.0, 5.85, -12.85, true],
  ['12-under-ceiling',  8.6, -13.2,  10.1, 5.2, -14.3, false],   // ground floor: the stain + strands overhead (torch)
  ['13-room-dressed',   7.9, -11.6,  10.6, 5.8, -15.0, true],    // wide: stain, veins to the bed, wall cords
];

await goUpstairs();
let downstairs = false;
for (const [name, cx, cz, tx, ty, tz, fl] of SHOTS) {
  if (ONLY && !name.includes(ONLY)) continue;
  // ground-floor shots must ride the stair DOWN first (the floor-override
  // latch `upperLevel` stays true until the stair ramp drops below FY+1)
  const wantDown = name.includes('under');
  if (wantDown && !downstairs) {
    await page.evaluate(`(() => { const g = __niebla; g.player.pos.set(1.1, 2.4, -9.8); g.player.vel.set(0,0,0); })()`);
    await new Promise((r) => setTimeout(r, 500));
    downstairs = true;
  } else if (!wantDown && downstairs) {
    await goUpstairs();
    downstairs = false;
  }
  const cy = wantDown ? 2.1 : name === '07-above-plan' ? DECK + 0.9 : DECK;   // the plan shot stands "taller"
  const dx = tx - cx, dz = tz - cz;
  const yaw = Math.atan2(-dx, -dz);              // camDir forward = (-sin yaw, -cos yaw)
  const pitch = Math.atan2(ty - (cy + EYE), Math.hypot(dx, dz));
  await page.evaluate(`(() => {
    const g = __niebla;
    g.player.pos.set(${cx}, ${cy}, ${cz});
    g.player.yaw = ${yaw}; g.player.pitch = ${pitch};
    g.player.vel.set(0, 0, 0);
    g.player.flashOn = ${fl ? 'false' : 'true'};
    ${flood(fl)};
  })()`);
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
}

await browser.close();
console.log('done ->', OUT);
