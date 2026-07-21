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

// every measured step records into `results` so we can emit a machine-readable
// JSON summary at the end (exact before/after diffs across perf runs).
const results = [];
// `record`/`step` push into whatever `recordTarget` currently points at. The
// unthrottled battery below fills `results`; the LE-0 throttled battery at the
// end re-points this at a separate array so both sets are emitted independently.
let recordTarget = results;
const stats = (frames) => {
  const f = frames.filter((x) => x > 0).sort((a, b) => a - b);
  const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
  const p99 = f.length ? f[Math.min(f.length - 1, Math.ceil(f.length * 0.99) - 1)] : 0;
  const worst = f.length ? f[f.length - 1] : 0;
  return { f, avg, p99, worst };
};
const record = (label, avg, p99, worst) =>
  recordTarget.push({ label, avg: +avg.toFixed(1), p99: +p99.toFixed(1), worst: +worst.toFixed(1) });

const step = async (label, js, settle = 2.5) => {
  await page.evaluate(`(() => {
    window.__perf.label = ${JSON.stringify(label)};
    window.__perf.frames.length = 0;
    ${js}
  })()`);
  await idle(settle);
  const { f, avg, p99, worst } = stats(await page.evaluate('window.__perf.frames.slice()'));
  console.log(`${label.padEnd(28)} avg ${avg.toFixed(1)}ms  worst ${f.slice(-3).map((x) => x.toFixed(0)).join('/')}ms`);
  record(label, avg, p99, worst);
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

// --- photo capture: the #1 freeze. Reproduce main.js's EXACT synchronous
// capture work at the production 480x380 canvas size (main.js:799-808):
// drawImage off the WebGL canvas -> toDataURL jpeg 0.7 -> journal.addPhoto ->
// save() = JSON.stringify(whole album) + synchronous localStorage.setItem. The
// watchdog's next rAF delta absorbs the hitch.
// CAVEAT: the renderer runs with preserveDrawingBuffer=false, so a drawImage
// off the WebGL canvas outside its own render frame reads a cleared (black)
// buffer -> the *captured* photo is a tiny JPEG. That only shrinks THIS shot's
// data-URL; the toDataURL encode cost is pixel-count bound (content-independent)
// so it is measured faithfully, and the full-album cost below is driven by the
// 24 realistic noise seeds, not by this one shot.
const CAPTURE = `
  const g = window.__niebla;
  const src = g.renderer.domElement;
  const cv = document.createElement('canvas'); cv.width = 480; cv.height = 380;
  const c2 = cv.getContext('2d');
  const s = Math.min(src.width / cv.width, src.height / cv.height) * 0.7;
  c2.drawImage(src, (src.width - cv.width*s)/2, (src.height - cv.height*s)/2, cv.width*s, cv.height*s, 0,0, cv.width, cv.height);
  const dataUrl = cv.toDataURL('image/jpeg', 0.7);
  g.journal.addPhoto({ dataUrl, caption: 'perf test', kind: 'testigo' });
`;

// A: one shot into an empty album.
await step('take photo (empty album)', `window.__niebla.journal.clear();` + CAPTURE);

// B: one shot into a FULL album (24 photos) — the worst case. Pre-seed in a
// SEPARATE unmeasured evaluate so the 24 seeding save()s don't pollute the
// measured window; seed with real 480x380 noise JPEGs (~130 KB each -> a ~3.1 MB
// serialized album, matching a full production PHOTO_CAP=24 album) so the
// stringify + localStorage cost is the real thing.
await page.evaluate(() => {
  const g = window.__niebla;
  window.__perf.label = 'seed full album (unmeasured)';   // so the seeding block's frame isn't misattributed to the previous step
  g.journal.clear();
  const cv = document.createElement('canvas'); cv.width = 480; cv.height = 380;
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(480, 380);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255;
    img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
  }
  c2.putImageData(img, 0, 0);
  const noiseUrl = cv.toDataURL('image/jpeg', 0.7);
  for (let k = 0; k < 24; k++) g.journal.addPhoto({ dataUrl: noiseUrl, caption: 'seed ' + k, kind: 'testigo' });
});
await step('take photo (full album)', CAPTURE);

// C: finale objective churn — the boat finale calls story.setObjective every
// frame with text that changes each second, so journal.addObjective -> save()
// fires on each second tick (t0 captured once so `left` actually decreases and
// isn't deduped away). Drive it for ~5 s.
await step('finale objective churn', `
  const g = window.__niebla;
  const t0 = performance.now();
  const loop = () => {
    const el = performance.now() - t0;
    if (el > 5000) return;
    const left = Math.ceil(20 - el / 1000);
    g.story.setObjective('The engine is catching... ' + left + 's', 'stay close to the boat');
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
`, 5.5);

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

// D: long walk GC (30 s). Walk (KeyW) + pan for 30 s. GC-class hitches live in
// the TAIL, so this metric reports p99 + worst, not just avg. Clear enemies and
// pin composure to keep this a pure locomotion/world/npc/door/player/story GC
// probe — otherwise a lingering enemy's fear aura drains composure to 0 over
// 30 s, firing onGameOver -> a page reload that wipes the frame recorder.
await page.evaluate(`(() => {
  const g = window.__niebla;
  window.__perf.label = 'long walk GC (30s)';
  g.director.clearAll();
  g.player.composure = 100;
  g.player.pos.set(0, 0, 45); g.player.yaw = 0;
  window.__perf.frames.length = 0;
  window.__pan = setInterval(() => {
    g.player.look((Math.random() - 0.45) * 28, (Math.random() - 0.5) * 8);
    g.player.composure = 100;   // no fear-death navigation mid-measurement
  }, 50);
})()`);
await key('KeyW', true);
await idle(30);
await key('KeyW', false);
await page.evaluate('clearInterval(window.__pan)');
{
  const { avg, p99, worst } = stats(await page.evaluate('window.__perf.frames.slice()'));
  console.log(`${'long walk GC (30s)'.padEnd(28)} avg ${avg.toFixed(1)}ms  p99 ${p99.toFixed(0)}ms  worst ${worst.toFixed(0)}ms`);
  record('long walk GC (30s)', avg, p99, worst);
}

console.log(stalls === 0 ? 'CLEAN: no frames >40ms anywhere' : `${stalls} frames >40ms (listed above)`);
// machine-readable summary: every step's {label, avg, p99, worst} for exact
// before/after diffs across perf runs.
console.log('PERFJSON ' + JSON.stringify(results));

// ===========================================================================
// STEP LE-0 — weak-machine emulation via CDP CPU throttle.
// The battery above ran UNTHROTTLED (real perf on this Mac's GPU) and its
// PERFJSON is unchanged. To document the weak-PC baseline the rest of TIER LE
// is measured against, re-run a focused subset under Chrome DevTools 6x CPU
// throttling. Load/preload/warmup are NEVER throttled — that would blow the
// 30s goto / CLICK-TO-BEGIN timeouts — so throttling starts only HERE, with the
// game fully up. Under 6x each frame is ~6x slower, so every step's `settle`
// and any wait budget is inflated (~x2) to still reach steady state, and every
// scenario is wrapped in try/catch so one slow scenario can't abort the run.
const throttledResults = [];
recordTarget = throttledResults;

// Optional forward-compat tier hook: LE-1 will add src/quality.js exposing
// window.__niebla.quality.setTier. Until then this is a no-op. If present,
// honor PERF_TIER (low|medium|high) so a future A/B can force a tier here.
const perfTier = process.env.PERF_TIER;
const hasQuality = await page.evaluate('!!(window.__niebla && window.__niebla.quality && window.__niebla.quality.setTier)');
if (hasQuality) {
  const tier = perfTier || 'current';
  if (perfTier) await page.evaluate(`window.__niebla.quality.setTier(${JSON.stringify(perfTier)})`);
  console.log(`quality module present — forcing tier: ${tier}`);
} else {
  console.log('quality module not present — running at current tier');
}

const client = await page.target().createCDPSession();
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
console.log('--- throttled 6x (CDP Emulation.setCPUThrottlingRate) ------------');

// guarded wrapper around the shared step() so a slow/erroring scenario logs and
// continues instead of aborting the whole throttled run.
const tryStep = async (label, js, settle) => {
  try {
    await step(label, js, settle);
  } catch (e) {
    console.log(`${label.padEnd(28)} SKIPPED (${e.message})`);
  }
};

// settle x2 (throttled default 5s vs the 2.5s unthrottled default).
await tryStep('throttled 6x — baseline (dock)', `
  const g = window.__niebla;
  g.director.clearAll();
  g.player.pos.set(0, 0, 77.5); g.player.yaw = Math.PI; g.player.pitch = 0;
`, 5);

await tryStep('throttled 6x — spawn 3 kinds in view', `
  const g = window.__niebla;
  g.player.pos.set(0, 0, 20); g.player.yaw = 0; g.player.pitch = 0;
  g.director.spawn('testigo', 0, 12);
  g.director.spawn('doble', -3, 13);
  g.director.spawn('archivero', 4, 12);
`, 5);

await tryStep('throttled 6x — flash + expose', `
  const g = window.__niebla;
  g.fx.flash = 0.85;
  g.director.flash(g.player.camera.position, g.player.camDir());
`, 5);
await page.evaluate('window.__niebla.director.clearAll()').catch(() => {});

// re-seed a FULL 24-photo album (unmeasured) so the throttled photo shot pays
// the real stringify + localStorage cost, exactly like the unthrottled case.
try {
  await page.evaluate(() => {
    const g = window.__niebla;
    window.__perf.label = 'seed full album (unmeasured)';
    g.journal.clear();
    const cv = document.createElement('canvas'); cv.width = 480; cv.height = 380;
    const c2 = cv.getContext('2d');
    const img = c2.createImageData(480, 380);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255;
      img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    const noiseUrl = cv.toDataURL('image/jpeg', 0.7);
    for (let k = 0; k < 24; k++) g.journal.addPhoto({ dataUrl: noiseUrl, caption: 'seed ' + k, kind: 'testigo' });
  });
} catch (e) {
  console.log('throttled 6x — full-album seed SKIPPED (' + e.message + ')');
}
await tryStep('throttled 6x — take photo (full album)', CAPTURE, 5);

// long walk GC under throttle. 15s is enough at 6x to surface tail hitches;
// GC-class hitches live in the TAIL, so report p99 + worst (not just avg).
try {
  await page.evaluate(`(() => {
    const g = window.__niebla;
    window.__perf.label = 'throttled 6x — long walk GC (15s)';
    g.director.clearAll();
    g.player.composure = 100;
    g.player.pos.set(0, 0, 45); g.player.yaw = 0;
    window.__perf.frames.length = 0;
    window.__pan = setInterval(() => {
      g.player.look((Math.random() - 0.45) * 28, (Math.random() - 0.5) * 8);
      g.player.composure = 100;   // no fear-death navigation mid-measurement
    }, 50);
  })()`);
  await key('KeyW', true);
  await idle(15);
  await key('KeyW', false);
  await page.evaluate('clearInterval(window.__pan)');
  const { avg, p99, worst } = stats(await page.evaluate('window.__perf.frames.slice()'));
  console.log(`${'throttled 6x — long walk GC (15s)'.padEnd(28)} avg ${avg.toFixed(1)}ms  p99 ${p99.toFixed(0)}ms  worst ${worst.toFixed(0)}ms`);
  record('throttled 6x — long walk GC (15s)', avg, p99, worst);
} catch (e) {
  console.log('throttled 6x — long walk GC (15s) SKIPPED (' + e.message + ')');
  await page.evaluate('clearInterval(window.__pan)').catch(() => {});
}

// restore full CPU speed and tear down the CDP session before closing.
await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await client.detach().catch(() => {});
console.log('PERFJSON_THROTTLED ' + JSON.stringify(throttledResults));

await browser.close();
