// Headless perf probe (real GPU via ANGLE Metal): frame times at baseline,
// across game events, and during a stretch of realistic play. Any frame
// >40ms is a visible hitch and gets reported. Needs the dev server on :5173.
import puppeteer from 'puppeteer-core';

const URL = process.env.GAME_URL ?? 'http://localhost:5173/?skipintro';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--window-size=1280,800', '--hide-scrollbars', '--mute-audio', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
let stalls = 0;
page.on('console', (m) => { if (m.text().startsWith('PERF')) { stalls++; console.log(' ', m.text()); } });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
console.log('load+preload+warmup:', Date.now() - t0, 'ms');
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(640, 400);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1500));

// stall watchdog + frame recorder
await page.evaluate(() => {
  const rec = (window.__perf = { frames: [], label: 'start' });
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const dt = now - last;
    rec.frames.push(dt);
    if (dt > 40) console.log(`PERF [${rec.label}] frame ${dt.toFixed(0)}ms`);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const idle = (s) => new Promise((r) => setTimeout(r, s * 1000));
const step = async (label, js, settle = 2.5) => {
  await page.evaluate(`(() => {
    window.__perf.label = ${JSON.stringify(label)};
    window.__perf.frames.length = 0;
    ${js}
  })()`);
  await idle(settle);
  const f = (await page.evaluate('window.__perf.frames.slice()')).filter((x) => x > 0).sort((a, b) => a - b);
  const avg = f.reduce((a, b) => a + b, 0) / f.length;
  console.log(`${label.padEnd(28)} avg ${avg.toFixed(1)}ms  worst ${f.slice(-3).map((x) => x.toFixed(0)).join('/')}ms`);
};
const key = (code, down) =>
  page.evaluate(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: '${code}' }))`);

await step('baseline (dock)', ``);
await step('spawn 3 kinds in view', `
  const g = window.__niebla;
  g.player.pos.set(0, 0, 20); g.player.yaw = 0; g.player.pitch = 0;
  g.director.spawn('testigo', 0, 12);
  g.director.spawn('doble', -3, 13);
  g.director.spawn('archivero', 4, 12);
`);
await step('flash + expose', `
  const g = window.__niebla;
  g.fx.flash = 0.85;
  g.director.flash(g.player.camera.position, g.player.camDir());
`);
await step('dissolve (2nd flash)', `
  const g = window.__niebla;
  g.fx.flash = 0.85;
  for (const e of [...g.director.enemies]) e.exposeToFlash(g.player.camera.position);
`);
await page.evaluate('window.__niebla.director.clearAll()');
await step('enter house', `
  const g = window.__niebla;
  g.player.pos.set(-3, 0, -14); g.player.yaw = -Math.PI / 2; g.player.pitch = 0;
`);
await step('power on', `window.__niebla.story.startPower()`);
await step('boathouse interior', `
  const g = window.__niebla;
  g.buildings.doors.boathouse.setOpen(true);
  g.player.pos.set(-49.4, 0, 57.6); g.player.yaw = -2.6; g.player.pitch = -0.15;
`);
await step('greenhouse', `
  const g = window.__niebla;
  g.player.pos.set(27, 0, -26); g.player.yaw = -Math.PI / 2 - 0.3;
`);

// realistic play: walk + pan for a while, meet a spawn mid-walk
await page.evaluate(`(() => {
  window.__perf.label = 'realistic walk';
  window.__niebla.player.pos.set(0, 0, 45); window.__niebla.player.yaw = 0;
  window.__pan = setInterval(() => window.__niebla.player.look((Math.random() - 0.45) * 28, (Math.random() - 0.5) * 8), 50);
})()`);
await key('KeyW', true);
await idle(8);
await page.evaluate(`(() => {
  const g = window.__niebla;
  window.__perf.label = 'spawn while walking';
  const p = g.player.pos, d = g.player.camDir();
  g.director.spawn('testigo', p.x + d.x * 22, p.z + d.z * 22);
})()`);
await idle(6);
await key('KeyW', false);
await page.evaluate('clearInterval(window.__pan)');

console.log(stalls === 0 ? 'CLEAN: no frames >40ms anywhere' : `${stalls} frames >40ms (listed above)`);
await browser.close();
