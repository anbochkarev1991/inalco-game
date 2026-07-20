// Portraits of all three Returned, in several behavioral states — for
// eyeballing appearance/animation work. Needs the dev server on :5173.
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT_DIR ?? './undefined';
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

// studio: a work light for judging the sculpt, not the in-game look
const STUDIO = `const L = new g.THREE.PointLight(0xfff2e0, 50, 0, 2);
  L.position.set(g.player.pos.x + 1.2, 2.6, g.player.pos.z - 1.5);
  L.name = 'studio'; g.scene.add(L);
  const old = g.scene.getObjectByName('studio');`;

// [name, kind, monster offset (dx, dz from player), extra setup, settle ms]
const SHOTS = [
  ['studio-testigo', 'testigo', 0, -3.2, `${STUDIO} g.player.pitch = 0.28; e.state="chase"; e.stateT=1; e._pin=1`, 900],
  ['studio-doble', 'doble', 0, -2.6, `${STUDIO} g.player.pitch = 0.1; e.state="chase"; e.stateT=1`, 900],
  ['studio-archivero', 'archivero', 0, -3.4, `${STUDIO} g.player.pitch = 0.22; e.state="guard"; e.stateT=1; e.home.copy(e.pos)`, 1100],
  ['testigo-close', 'testigo', 0, -3.6, 'e.state="chase"; e.stateT=1; e._pin=1; e._pinHeld=0.2', 900],
  ['testigo-chase', 'testigo', 0, -6, 'e.state="chase"; e.stateT=1; e.lastSeen.copy(g.player.pos)', 1100],
  ['doble-standing', 'doble', 0, -4.2, 'e.state="chase"; e.stateT=1', 1200],
  // lights out: beyond 7.5m in the dark it counts as unobserved, so it crawls
  ['doble-crawl', 'doble', 0, -11, 'g.player.flashOn = false; e.state="chase"; e.stateT=1; e.flank=0', 280],
  ['archivero-close', 'archivero', 0, -4, 'e.state="guard"; e.stateT=1; e.home.copy(e.pos)', 1400],
  ['manifest', 'testigo', 0, -4.5, '', 600],
  ['stagger', 'testigo', 0, -4.5, 'e.state="chase"; e.stateT=1; setTimeout(() => g.director.flash(g.camera.position, g.player.camDir()), 600)', 1100],
  ['dissolve', 'doble', 0, -4.5, 'e.exposure=1; setTimeout(() => g.director.flash(g.camera.position, g.player.camDir()), 500)', 950],
];

for (const [name, kind, dx, dz, extra, settle] of SHOTS) {
  await page.evaluate(`(() => {
    const g = __niebla;
    g.director.clearAll();
    const stale = g.scene.getObjectByName('studio');
    if (stale) g.scene.remove(stale);
    g.player.pos.set(0, 0, 30); g.player.yaw = 0; g.player.pitch = 0.06;
    g.player.vel.set(0,0,0); g.player.flashOn = true; g.player.flashCharge = 1;
    const e = g.director.spawn('${kind}', ${dx}, ${30 + dz});
    ${extra ? `e.group.scale.set(1,1,1); ${extra};` : ''}
  })()`);
  await new Promise((r) => setTimeout(r, settle));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name);
}
await browser.close();
console.log('done');
