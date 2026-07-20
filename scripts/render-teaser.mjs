// Renders press/teaser.html to an MP4:
//   1. deterministic per-frame screenshots (seek → paint → capture) at 1280x720/30fps
//   2. offline-rendered WebAudio score → WAV
//   3. ffmpeg muxes frames + WAV → press/INALCO-teaser.mp4
// Usage: npm run render-teaser
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.env.OUT_DIR || join(root, 'press/.render');
const framesDir = join(scratch, 'frames');
const W = 1280, H = 720, FPS = 30;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

rmSync(scratch, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--force-device-scale-factor=1', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('file://' + join(root, 'press/teaser.html') + '?capture', { waitUntil: 'load' });
await page.evaluate(() => window.__teaser.ready);           // wait for image decode
const meta = await page.evaluate(() => ({ total: window.__teaser.total, fps: window.__teaser.fps }));
const fps = meta.fps || FPS;
const nFrames = Math.ceil(meta.total * fps);
console.log(`total ${meta.total.toFixed(1)}s → ${nFrames} frames @ ${fps}fps, ${W}x${H}`);

// ---- 1. audio (offline render → WAV) ----
console.log('rendering audio…');
const wavB64 = await page.evaluate(() => window.__renderAudioWav());
const wavPath = join(scratch, 'audio.wav');
writeFileSync(wavPath, Buffer.from(wavB64, 'base64'));

// ---- 2. deterministic frames ----
console.log('capturing frames…');
for (let i = 0; i < nFrames; i++) {
  const t = i / fps;
  await page.evaluate(async tt => {
    window.__teaser.seek(tt);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // commit + paint
  }, t);
  await page.screenshot({ path: join(framesDir, String(i).padStart(5, '0') + '.jpg'), quality: 92, type: 'jpeg' });
  if (i % 120 === 0) process.stdout.write(`  ${i}/${nFrames}\r`);
}
console.log(`  ${nFrames}/${nFrames} frames done`);
await browser.close();
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));

// ---- 3. mux ----
const out = join(root, 'press/INALCO-teaser.mp4');
console.log('encoding mp4…');
const args = [
  '-y',
  '-framerate', String(fps), '-start_number', '0', '-i', join(framesDir, '%05d.jpg'),
  '-i', wavPath,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
  '-c:a', 'aac', '-b:a', '192k',
  '-movflags', '+faststart', '-shortest', out,
];
const r = spawnSync(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
if (r.status !== 0) { console.error('ffmpeg failed'); process.exit(1); }

rmSync(scratch, { recursive: true, force: true });
console.log('\n✓ wrote', out);
