// Headless smoke test: load the game, click through, teleport to viewpoints, screenshot.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.env.OUT_DIR;
const URL = process.env.GAME_URL ?? 'http://localhost:5173/?skipintro';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--window-size=1280,800', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}\n${e.stack || ''}`));
page.on('requestfailed', (r) => logs.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`));

const dump = () => fs.writeFileSync(`${OUT}/console.log`, logs.join('\n') || '(no console output)');

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  // the title stays on PREPARING… while shaders warm up; clicks before that are ignored
  await page.waitForFunction(
    `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${OUT}/01-title.png` });

  await page.mouse.click(640, 400);
  await new Promise((r) => setTimeout(r, 2800));
  await page.screenshot({ path: `${OUT}/02-dock-lake.png` });

  // wait for the debug handle
  await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });

  const shot = async (name, js, settle = 1300) => {
    await page.evaluate(js);
    await new Promise((r) => setTimeout(r, settle));
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };

  await shot('03-jetty-shore', `(() => { const g = window.__niebla; g.player.yaw = 0; g.player.pitch = 0.02; })()`);
  await shot('04-house-front', `(() => { const g = window.__niebla; g.player.pos.set(1.2, 0, 6); g.player.yaw = 0; g.player.pitch = 0; g.player.flashOn = true; g.world.setFlashlight(true); })()`);
  await shot('05-kiosk', `(() => { const g = window.__niebla; g.player.pos.set(8.5, 0, 34); g.player.yaw = -Math.PI/2; g.player.pitch = 0; })()`);
  await shot('06-hall-dark', `(() => { const g = window.__niebla; g.player.flashOn = true; g.world.setFlashlight(true); g.player.pos.set(-3, 0, -14); g.player.yaw = -Math.PI/2; g.player.pitch = -0.05; })()`);
  await shot('07-hall-lit', `(() => { const g = window.__niebla; g.player.flashOn = false; g.world.setFlashlight(false); g.story.startPower(); g.player.pos.set(-1, 0, -13); g.player.yaw = -Math.PI/2 - 0.2; g.player.pitch = -0.02; })()`, 2200);
  await shot('08-study', `(() => { const g = window.__niebla; g.player.pos.set(5.5, 0, -12.5); g.player.yaw = Math.PI; g.player.pitch = -0.1; })()`);
  await shot('09-house-lit-outside', `(() => { const g = window.__niebla; g.player.pos.set(2, 0, 5); g.player.yaw = 0.15; g.player.pitch = 0.05; })()`);
  await shot('10-testigo', `(() => { const g = window.__niebla; g.player.pos.set(0, 0, 20); g.player.yaw = 0; g.player.flashOn = true; g.director.spawn('testigo', 0, 12); })()`, 2200);
  await shot('11-doble-archivero', `(() => { const g = window.__niebla; g.director.spawn('doble', -3, 13); g.director.spawn('archivero', 4, 12); })()`, 2200);
  await shot('12-boathouse', `(() => { const g = window.__niebla; g.director.clearAll(); g.player.pos.set(-52, 0, 56); g.player.yaw = -2.2; g.player.pitch = 0; })()`);
  await shot('13-greenhouse', `(() => { const g = window.__niebla; g.player.pos.set(27, 0, -26); g.player.yaw = -Math.PI/2 - 0.3; g.player.pitch = 0; })()`);
  await shot('14-beam-path', `(() => { const g = window.__niebla; g.player.pos.set(0, 0, 42); g.player.yaw = 0; g.player.pitch = 0; g.player.flashOn = true; g.world.setFlashlight(true); })()`);
  await shot('15-veg-close', `(() => { const g = window.__niebla; g.player.pos.set(18, 0, 22); g.player.yaw = Math.PI/4; g.player.pitch = -0.08; })()`);
  await shot('16-boathouse-inside', `(() => { const g = window.__niebla; g.buildings.doors.boathouse.setOpen(true); g.player.pos.set(-49.4, 0, 57.6); g.player.yaw = -2.6; g.player.pitch = -0.15; })()`);

  dump();
  console.log('DONE OK');
} catch (e) {
  dump();
  console.log('SMOKE FAILED:', e.message);
  console.log('--- first logs ---');
  console.log(logs.slice(0, 30).join('\n'));
} finally {
  await browser.close();
}
