// Screenshot the neutral face-viewer page (faceview.html) at front / 34 / profile.
// Isolates head SHAPE from game pose/lighting/occlusion. PREFIX + BASE_URL env.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '_screenshots/faces';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PRE = process.env.PREFIX || 'view';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1200, height: 520 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

for (const angle of ['front', '34', 'profile']) {
  await page.goto(`${BASE}/faceview.html?angle=${angle}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__faceReady === true', { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/${PRE}-${angle}.png` });
}
console.log(JSON.stringify({ errs }));
await browser.close();
