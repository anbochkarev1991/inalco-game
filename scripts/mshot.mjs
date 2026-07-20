import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT_DIR;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[ERR]', e.message));
await page.goto('http://localhost:5173/?skipintro&calm', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
await page.mouse.click(640, 400);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await page.evaluate(`(() => { const g = __niebla; g.player.pos.set(0, 0, 20); g.player.yaw = 0; g.player.pitch = 0;
  const e = g.director.spawn('testigo', 0, 13.5); e.group.scale.y = 1; e.state = 'chase'; e.stateT = 1; e.lastSeen.set(0,0,20); })()`);
await new Promise(r => setTimeout(r, 1600));
await page.screenshot({ path: `${OUT}/m1-testigo.png` });
// kiosk shine check
await page.evaluate(`(() => { const g = __niebla; g.director.clearAll(); g.player.pos.set(9.2, 0, 34); g.player.yaw = -Math.PI/2; g.player.pitch = -0.05; })()`);
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/m2-kiosk-shine.png` });
await browser.close();
console.log('ok');
