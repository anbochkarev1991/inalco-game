// Voice-audition harness. Renders each monsterVoice() one-shot OFFLINE to a
// mono 16-bit WAV a human can actually play, and prints loudness / duration /
// brightness stats so we can tune voices objectively (we can't hear them).
//
// Reusable for E2..E6: pass any list of shots. Needs the dev server on :5173.
//
//   OUT_DIR=/path/to/out node scripts/voiceshots.mjs
//   OUT_DIR=/path SHOTS=/path/to/shots.json node scripts/voiceshots.mjs
//
// Shot format (one per WAV):
//   { "name": "testigo-breath-1", "kind": "testigo", "pan": 0,
//     "opts": { "pin": 1 },              // opts passed straight to monsterVoice
//     "dur": 2.5 }                       // offline render length, seconds
//
// opts.variant ('breath' | 'gurgle' | 'click' | 'pinned') is a dev-only hook the
// testigo branch honors to FORCE a variant for auditioning; the game never sets
// it, so per-call randomization is unaffected in play.
//
// Stats per shot:
//   peak    dBFS  — absolute peak of the clip
//   rms     dBFS  — RMS over the WHOLE clip
//   eRMS    dBFS  — RMS over just the energy region (>-50 dB rel. peak)
//   eDur    s     — duration of that energy region (first→last loud sample)
//   zcr     Hz    — zero-crossing rate over the energy region (brightness proxy)

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT_DIR ?? './voiceshots-out';
fs.mkdirSync(OUT, { recursive: true });

const DEFAULT_SHOTS = [
  { name: 'testigo-breath-1', kind: 'testigo', pan: 0, opts: {}, dur: 2.6 },
  { name: 'testigo-breath-2', kind: 'testigo', pan: 0, opts: {}, dur: 2.6 },
  { name: 'testigo-gurgle', kind: 'testigo', pan: 0, opts: { variant: 'gurgle' }, dur: 1.8 },
  { name: 'testigo-click', kind: 'testigo', pan: 0, opts: { variant: 'click' }, dur: 1.2 },
  { name: 'testigo-pinned', kind: 'testigo', pan: 0, opts: { pin: 1 }, dur: 2.2 },
];

const SHOTS = process.env.SHOTS
  ? JSON.parse(fs.readFileSync(process.env.SHOTS, 'utf8'))
  : DEFAULT_SHOTS;

// --- WAV encoder (mono, 16-bit PCM, 44-byte header) ------------------------
function writeWav(file, int16Buf, sampleRate) {
  const dataLen = int16Buf.length;              // bytes
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);                 // fmt chunk size
  header.writeUInt16LE(1, 20);                  // PCM
  header.writeUInt16LE(1, 22);                  // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);     // byte rate (mono, 2 bytes/sample)
  header.writeUInt16LE(2, 32);                  // block align
  header.writeUInt16LE(16, 34);                 // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  fs.writeFileSync(file, Buffer.concat([header, int16Buf]));
}

// --- render one shot offline inside the page -------------------------------
// Returns { stats, b64 (Int16 PCM little-endian), sr, variant, threw }.
async function renderInPage(page, shot) {
  return page.evaluate(async (shot) => {
    const A = window.__niebla.audio;
    if (!A || !A.ok) return { error: 'audio not ready (A.ok false)' };
    const sr = A.ctx.sampleRate;
    const len = Math.max(1, Math.ceil(sr * shot.dur));
    const offline = new OfflineAudioContext(1, len, sr);

    const savedCtx = A.ctx, savedMaster = A.master;
    let threw = null;
    try {
      A.ctx = offline;
      const m = offline.createGain();
      m.gain.value = 1;                          // unity master → isolated levels
      m.connect(offline.destination);
      A.master = m;
      try {
        A.monsterVoice(shot.kind, shot.pan ?? 0, shot.opts ?? {});
      } catch (e) {
        threw = (e && (e.stack || e.message)) || String(e);
      }
    } finally {
      A.ctx = savedCtx;                          // nodes already scheduled on offline graph
      A.master = savedMaster;
    }

    const variant = A._lastVoiceVariant ?? null;
    const buf = await offline.startRendering();
    const d = buf.getChannelData(0);
    const n = d.length;

    // stats
    let peak = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sumSq += d[i] * d[i];
    }
    const rms = Math.sqrt(sumSq / n);

    // energy region: first→last sample above -50 dB relative to peak
    const thr = peak * Math.pow(10, -50 / 20);
    let first = -1, last = -1;
    for (let i = 0; i < n; i++) {
      if (Math.abs(d[i]) > thr) { if (first < 0) first = i; last = i; }
    }
    let eDur = 0, eRms = 0, zcr = 0;
    if (first >= 0) {
      let eSum = 0, cross = 0;
      for (let i = first; i <= last; i++) {
        eSum += d[i] * d[i];
        if (i > first && ((d[i] >= 0) !== (d[i - 1] >= 0))) cross++;
      }
      const eLen = last - first + 1;
      eDur = eLen / sr;
      eRms = Math.sqrt(eSum / eLen);
      zcr = eDur > 0 ? cross / eDur : 0;         // crossings per second
    }

    // Float32 → Int16 PCM → base64
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      let s = Math.max(-1, Math.min(1, d[i]));
      pcm[i] = s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0;
    }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return {
      sr, variant, threw,
      b64: btoa(bin),
      stats: { peak, rms, eRms, eDur, zcr, samples: n },
    };
  }, shot);
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmtDb = (x) => (x === -Infinity ? '  -inf' : x.toFixed(1).padStart(6));

// --- puppeteer setup (mirrors monstershots.mjs) ----------------------------
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,800'],
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
await page.waitForFunction('window.__niebla.audio && window.__niebla.audio.ok === true', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 300));

const rows = [];
for (const shot of SHOTS) {
  // For a bare {} testigo shot named *breath*, re-render until the random branch
  // actually lands on 'breath' (so the deliverable WAV is a breath, not a fluke
  // gurgle/click). Forced-variant / other shots render once.
  const wantBreath = shot.kind === 'testigo'
    && /breath/i.test(shot.name)
    && !(shot.opts && shot.opts.variant);
  let res = null;
  for (let tries = 0; tries < 16; tries++) {
    res = await renderInPage(page, shot);
    if (res.error) break;
    if (!wantBreath || res.variant === 'breath') break;
  }

  if (!res || res.error) {
    console.log(`[ERR] ${shot.name}: ${res ? res.error : 'no result'}`);
    rows.push({ name: shot.name, bad: res ? res.error : 'no result' });
    continue;
  }
  if (res.threw) {
    console.log(`[ERR] ${shot.name} threw inside monsterVoice:\n${res.threw}`);
    rows.push({ name: shot.name, bad: 'threw (see above)' });
    continue;
  }

  const int16 = Buffer.from(res.b64, 'base64');
  const file = path.join(OUT, `${shot.name}.wav`);
  writeWav(file, int16, res.sr);

  const s = res.stats;
  rows.push({
    name: shot.name,
    variant: res.variant ?? '-',
    peak: db(s.peak),
    rms: db(s.rms),
    eRms: db(s.eRms),
    eDur: s.eDur,
    zcr: s.zcr,
    file,
  });
}

await browser.close();

// --- report ----------------------------------------------------------------
console.log(`\nOUT_DIR = ${OUT}  (sample rate from live ctx)\n`);
const head = `${'name'.padEnd(20)} ${'variant'.padEnd(8)} ${'peak'.padStart(6)} ${'rms'.padStart(6)} ${'eRMS'.padStart(6)}  ${'eDur'.padStart(6)}  ${'zcr(Hz)'.padStart(8)}`;
console.log(head);
console.log('-'.repeat(head.length));
for (const r of rows) {
  if (r.bad) { console.log(`${r.name.padEnd(20)} ${r.bad}`); continue; }
  console.log(
    `${r.name.padEnd(20)} ${String(r.variant).padEnd(8)} ` +
    `${fmtDb(r.peak)} ${fmtDb(r.rms)} ${fmtDb(r.eRms)}  ` +
    `${r.eDur.toFixed(3).padStart(6)}  ${Math.round(r.zcr).toString().padStart(8)}`);
}
console.log('\ndone');
