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

const shot = async (name, js, settle = 1100) => {
  await page.evaluate(js);
  await new Promise(r => setTimeout(r, settle));
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

await shot('n1-campfire', `(() => { const g = __niebla; g.player.pos.set(16.2, 0, 55.2); g.player.yaw = 0.12; g.player.pitch = -0.06; })()`);
await shot('n2-dialog', `(() => { const g = __niebla; g.story.talkTo('rufino'); })()`, 1600);
await page.evaluate('__niebla.dialog.close()');
await shot('n3-mara', `(() => { const g = __niebla; g.player.pos.set(33.8, 0, -26.4); g.player.yaw = -Math.PI/2 + 0.15; g.player.pitch = -0.12; })()`);
await shot('n4-eliseo', `(() => { const g = __niebla; g.player.pos.set(15.4, 0, -16.4); g.player.yaw = -Math.PI + 0.5; g.player.pitch = -0.02; })()`);
await browser.close();
console.log('ok');
