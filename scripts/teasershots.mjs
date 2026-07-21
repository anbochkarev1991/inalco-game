// High-resolution (2560x1600) re-capture of the exact teaser stills, straight
// from the game with the HUD hidden — replaces the upscaled 1280 archive PNGs so
// the trailer is crisp. Needs the dev server on :5173.  Output: press/teaser-hires/
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'press/teaser-hires');
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 2560, H = 1600;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--mute-audio', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[ERR]', e.message));
await page.goto('http://localhost:5173/?skipintro&calm', { waitUntil: 'networkidle0' });
await page.waitForFunction(`document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise(r => setTimeout(r, 300));
await page.mouse.click(W / 2, H / 2);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise(r => setTimeout(r, 600));
// clean canvas: no objective / subtitle / flash HUD / fader
await page.evaluate(`document.getElementById('ui').style.display='none';
  try{ const g=window.__niebla; g.renderer.setPixelRatio(Math.max(1.5, window.devicePixelRatio||1)); g.renderer.setSize(innerWidth, innerHeight, false); }catch(e){}`);

// each shot: JS that positions the camera / spawns+poses / sets fog, then settle(ms)
const SHOTS = [
  ['sign', `g.world.setFogLevel&&g.world.setFogLevel(0.15); g.player.pos.set(-1,0,70); g.player.yaw=Math.PI; g.player.pitch=0.05; g.player.flashOn=true; g.world.setFlashlight(true);`, 1400],
  ['shore', `g.world.setFogLevel&&g.world.setFogLevel(0.25); g.player.pos.set(26,0,50); g.player.yaw=-0.95; g.player.pitch=-0.03; g.player.flashOn=true; g.world.setFlashlight(true);`, 1400],
  ['estancia', `g.player.pos.set(1.2,0,6); g.player.yaw=0; g.player.pitch=0.03; g.player.flashOn=true; g.world.setFlashlight(true);`, 1400],
  ['corridor', `g.story.startPower&&g.story.startPower(); g.player.pos.set(0,0,-9); g.player.yaw=0; g.player.pitch=-0.02; g.player.flashOn=true; g.world.setFlashlight(true);`, 2200],
  ['draft', `g.director.clearAll(); g.world.setFogLevel&&g.world.setFogLevel(0.3); g.player.pos.set(0,0,30); g.player.yaw=0; g.player.pitch=0.05; g.player.flashOn=true; g.player.flashCharge=1; g.world.setFlashlight(true); const e=g.director.spawn('doble',0,25.8); e.group.scale.set(1,1,1); e.state='chase'; e.stateT=1;`, 1500],
  ['congregation', `g.director.clearAll(); g.world.setFogLevel&&g.world.setFogLevel(0.35); g.player.pos.set(0,0,30); g.player.yaw=0; g.player.pitch=0.14; g.player.flashOn=true; g.player.flashCharge=1; g.world.setFlashlight(true); const e=g.director.spawn('archivero',0,26); e.group.scale.set(1,1,1); e.state='guard'; e.stateT=1; e.home&&e.home.copy(e.pos);`, 1700],
  ['leanfar', `g.director.clearAll(); g.world.setFogLevel&&g.world.setFogLevel(0.7); g.player.pos.set(0,0,30); g.player.yaw=0; g.player.pitch=0.04; g.player.flashOn=true; g.player.flashCharge=1; g.world.setFlashlight(true); const e=g.director.spawn('testigo',0,22); e.group.scale.set(1,1,1); e.state='chase'; e.stateT=1; e.lastSeen&&e.lastSeen.copy(g.player.pos); e._pin=1;`, 1500],
  ['veil', `g.director.clearAll(); g.world.setFogLevel&&g.world.setFogLevel(0.92); g.player.pos.set(0,0,30); g.player.yaw=0.05; g.player.pitch=0.05; g.player.flashOn=true; g.player.flashCharge=1; g.world.setFlashlight(true); const e=g.director.spawn('testigo',0.5,24.6); e.group.scale.set(1,1,1); e.state='chase'; e.stateT=1; e._pin=1;`, 1500],
  ['her', `g.director.clearAll(); g.world.setFogLevel&&g.world.setFogLevel(0.85); g.player.pos.set(0,0,30); g.player.yaw=-0.06; g.player.pitch=0.03; g.player.flashOn=true; g.player.flashCharge=1; g.world.setFlashlight(true); const e=g.director.spawn('archivero',-0.6,23); e.group.scale.set(1,1,1); e.state='guard'; e.stateT=1; e.home&&e.home.copy(e.pos);`, 1600],
  ['fire', `g.director.clearAll(); g.world.setFogLevel&&g.world.setFogLevel(0.2); g.player.flashOn=false; g.world.setFlashlight(false); g.player.pos.set(16.2,0,55.2); g.player.yaw=0.12; g.player.pitch=-0.06;`, 1600],
];

async function shoot(key, js, settle) {
  await page.evaluate(`(() => { const g=window.__niebla; const THREE=g.THREE; ${js} })()`);
  await new Promise(r => setTimeout(r, settle));
  await page.screenshot({ path: join(OUT, key + '.png') });
  console.log(key);
}
for (const [k, js, s] of SHOTS) await shoot(k, js, s);

// ---- the cellar girl: ride the stair (flips cellarLevel), then aim from the doorway ----
await page.evaluate(`(() => { const g=window.__niebla; g.director.clearAll(); g.world.setFogLevel&&g.world.setFogLevel(0.1);
  g.player.flashOn=true; g.world.setFlashlight(true); g.player.pos.set(5.0, g.player.pos.y, -20.8); })()`);
await new Promise(r => setTimeout(r, 1200));
await page.evaluate(`(() => { const g=window.__niebla; g.player.pos.set(4.6, g.player.pos.y, -20.1); })()`);
await new Promise(r => setTimeout(r, 800));
await page.evaluate(`(() => { const g=window.__niebla, THREE=g.THREE; const gr=g.buildings.cellar.girl.group;
  const p=new THREE.Vector3(); gr.getWorldPosition(p); const cam=g.camera.position;
  const dx=p.x-cam.x, dz=p.z-cam.z, horiz=Math.hypot(dx,dz);
  g.player.yaw=Math.atan2(-dx,-dz); g.player.pitch=Math.atan2((p.y+1.15)-cam.y, horiz); })()`);
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: join(OUT, 'child.png') });
console.log('child');

await browser.close();
console.log('done -> press/teaser-hires/');
