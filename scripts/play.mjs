// Functional test: drive real inputs and assert core mechanics work end-to-end.
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT_DIR;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

await page.goto('http://localhost:5173/?skipintro', { waitUntil: 'networkidle0' });
// the title stays on PREPARING… while shaders warm up; clicks before that are ignored
await page.waitForFunction(
  `document.getElementById('title-start')?.textContent === 'CLICK TO BEGIN'`, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(640, 400);
await page.waitForFunction('window.__niebla !== undefined', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 600));

const results = {};
const key = async (code, ms = 350) => {
  await page.keyboard.down(codeToKey(code));
  await new Promise((r) => setTimeout(r, ms));
  await page.keyboard.up(codeToKey(code));
};
function codeToKey(c) { return c; }

// 1) movement: face north (the game spawns you facing the lake), press W,
// expect to walk off the dock
const before = await page.evaluate('(() => { const g = __niebla; g.player.yaw = 0; return { x: g.player.pos.x, z: g.player.pos.z }; })()');
await page.keyboard.down('w');
await new Promise((r) => setTimeout(r, 900));
await page.keyboard.up('w');
const after = await page.evaluate('({x: __niebla.player.pos.x, z: __niebla.player.pos.z})');
results.movement = { before, after, moved: Math.hypot(after.x - before.x, after.z - before.z) > 1.5 };

// 1b) strafe/forward at a rotated yaw — regression test for the inverted-controls bug.
// yaw = -PI/2 faces +x (camDir = (-sin(yaw), 0, -cos(yaw)) = (1, 0, 0)); W must move +x.
const rotBefore = await page.evaluate('(() => { const g = __niebla; g.player.pos.set(0,0,30); g.player.yaw = -Math.PI/2; g.player.vel.set(0,0,0); return g.player.pos.x; })()');
await page.keyboard.down('w');
await new Promise((r) => setTimeout(r, 800));
await page.keyboard.up('w');
const rotAfter = await page.evaluate('__niebla.player.pos.x');
results.movementRotated = { from: rotBefore, to: +rotAfter.toFixed(2), correctDirection: rotAfter - rotBefore > 1.5 };

// 2) flashlight toggle (starts ON after intro → F turns it off)
const flashBefore = await page.evaluate('__niebla.player.flashOn');
await page.keyboard.press('f');
await new Promise((r) => setTimeout(r, 150));
const flashAfter = await page.evaluate('__niebla.player.flashOn');
await page.keyboard.press('f');   // back on
results.flashlight = { startsOn: flashBefore, toggles: flashAfter !== flashBefore };

// 2b) sprint: distance over 0.8s walking vs running (open ground, facing north)
const walkD = await (async () => {
  await page.evaluate('(() => { const g = __niebla; g.player.pos.set(0,0,40); g.player.yaw = 0; g.player.vel.set(0,0,0); })()');
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 800));
  await page.keyboard.up('w');
  return page.evaluate('40 - __niebla.player.pos.z');
})();
const runD = await (async () => {
  await page.evaluate('(() => { const g = __niebla; g.player.pos.set(0,0,40); g.player.yaw = 0; g.player.vel.set(0,0,0); g.player.stamina = 7; })()');
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await new Promise((r) => setTimeout(r, 800));
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  return page.evaluate('40 - __niebla.player.pos.z');
})();
results.sprint = { walk: +walkD.toFixed(2), run: +runD.toFixed(2), faster: runD > walkD * 1.4 };

// 2c) real E-press pickup: stand at the ticket stub, face it, press E
await page.evaluate('(() => { const g = __niebla; g.player.pos.set(-0.7, 0, 75.2); g.player.yaw = Math.PI; g.player.pitch = -0.5; g.player.vel.set(0,0,0); })()');
await new Promise((r) => setTimeout(r, 400));
const promptShown = await page.evaluate('document.getElementById("prompt").textContent');
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 300));
const noteOpenedByE = await page.evaluate('__niebla.story.ui.noteOpen');
await page.keyboard.press('e');   // close it
await new Promise((r) => setTimeout(r, 300));
const evidenceCounted = await page.evaluate('__niebla.story.evidence');
results.interactE = { promptShown, noteOpenedByE, evidenceCounted };

// 2d) generator fuel chain: dry → jerry can → fuel (hold) → start (hold)
await page.evaluate('(() => { const g = __niebla; g.buildings.doors.shed.setOpen(true); g.player.pos.set(-30, 0, -37.2); g.player.yaw = 0; g.player.pitch = -0.3; g.player.vel.set(0,0,0); })()');
await new Promise((r) => setTimeout(r, 400));
const dryPrompt = await page.evaluate('document.getElementById("prompt").textContent');
await page.keyboard.press('e');   // instant: "tank is dry" line + objective
await new Promise((r) => setTimeout(r, 300));
const dryObjective = await page.evaluate('document.getElementById("objective-es").textContent');
await page.evaluate('__niebla.story.hasFuel = true');
await page.keyboard.down('e');    // hold: fuel it (2.0s)
await new Promise((r) => setTimeout(r, 2600));
await page.keyboard.up('e');
const fueled = await page.evaluate('__niebla.story.fueled');
await page.keyboard.down('e');    // hold: start it (2.6s)
await new Promise((r) => setTimeout(r, 3300));
await page.keyboard.up('e');
results.holdE = { dryPrompt, dryObjective, fueled, powered: await page.evaluate('__niebla.buildings.isPowered()') };
// undo power side effects for later steps
await page.evaluate('(() => { const g = __niebla; g.director.clearAll(); })()');

// 2e) NPC dialogue: full branch through Rufino's tree via real keys
await page.evaluate('(() => { const g = __niebla; g.player.pos.set(15.6, 0, 53.3); g.player.yaw = 0; g.player.pitch = -0.1; g.player.vel.set(0,0,0); })()');
await new Promise((r) => setTimeout(r, 500));
const npcPrompt = await page.evaluate('document.getElementById("prompt").textContent');
await page.keyboard.press('e');   // open dialog
await new Promise((r) => setTimeout(r, 300));
const dialogOpened = await page.evaluate('__niebla.dialog.open');
const step = async (key, ms = 700) => { await page.keyboard.press(key); await new Promise((r) => setTimeout(r, ms)); };
await step('e');        // finish typing
await step('1');        // "You're... real?"
await step('e');        // finish typing
await step('e');        // -> fog node
await step('e');        // finish typing
await step('2');        // "How do I stop them?"
await step('e'); await step('e');   // -> quest node
await step('e');        // finish typing
await step('2');        // "I'll get your thermos."
await step('e'); await step('e');   // close
const dialogState = await page.evaluate('({open: __niebla.dialog.open, met: __niebla.story.met.rufino, quest: __niebla.story.rufinoQuest, side: document.getElementById("objective-side").textContent})');
results.npcDialog = { npcPrompt, dialogOpened, ...dialogState };

// 3) flash staggers an enemy
const flashTest = await page.evaluate(() => {
  const g = window.__niebla;
  // put player and an enemy in a known spot, facing it
  g.player.pos.set(0, 0, 20); g.player.yaw = 0; g.player.pitch = 0;
  const e = g.director.spawn('testigo', 0, 12);
  e.group.scale.y = 1; e.state = 'wander'; e.stateT = 1;
  g.player.flashCharge = 1;
  return { spawned: true, enemyState: e.state, id: e.id };
});
await new Promise((r) => setTimeout(r, 400));
// fire flash by dispatching a real mousedown on the locked canvas — but pointerlock isn't active
// so call the same path the click handler uses:
const staggered = await page.evaluate(() => {
  const g = window.__niebla;
  const before = g.director.enemies.map((e) => e.state);
  const hits = g.director.flash(g.camera.position, g.player.camDir());
  const after = g.director.enemies.map((e) => e.state);
  return { hits, before, after };
});
results.flashStagger = { hits: staggered.hits, staggered: staggered.after.includes('stagger') };

// 3b) second flash dissolves it (scrutiny kills a rumor) — track by id,
// since ambient spawning may add unrelated enemies during the wait
const dissolved = await page.evaluate(() => {
  const g = window.__niebla;
  g.director.flash(g.camera.position, g.player.camDir());
  const dyingE = g.director.enemies.find((e) => e.state === 'dying');
  return { dying: !!dyingE, id: dyingE?.id ?? -1 };
});
await new Promise((r) => setTimeout(r, 1500));
const stillThere = await page.evaluate(`__niebla.director.enemies.some((e) => e.id === ${dissolved.id})`);
results.flashDissolve = { dying: dissolved.dying, removed: !stillThere };

// 3c) hiding: enemy chasing → player goes inside the house → enemy lurks/loses.
// (a3) With the generator still powered from step 2d, a sheltering Returned is
// drawn up to a lit window ('gather') instead of circling — still outside, still
// unable to reach the player inside, so this remains a valid shelter outcome.
const hideTest = await page.evaluate(() => {
  const g = window.__niebla;
  g.director.clearAll();
  g.player.pos.set(1, 0, -2);                   // just outside the front door
  const e = g.director.spawn('testigo', 1, 8);
  e.group.scale.y = 1; e.state = 'chase'; e.stateT = 1; e.lastSeen.copy(g.player.pos);
  // teleport indoors
  g.player.pos.set(-5, 0, -14);
  return e.id;
});
await new Promise((r) => setTimeout(r, 2500));
const hideResult = await page.evaluate(() => {
  const g = window.__niebla;
  const e = g.director.enemies[0];
  return e ? { state: e.state, insideHouse: g.buildings.insideHouse(e.pos.x, e.pos.z) } : { state: 'gone', insideHouse: false };
});
results.houseShelter = { state: hideResult.state, enemyStaysOut: !hideResult.insideHouse, lurksOrLeaves: ['lurk', 'retreat', 'wander', 'gather', 'gone'].includes(hideResult.state) };
await page.evaluate('__niebla.director.clearAll()');

// 4) composure drops on hit
const hitTest = await page.evaluate(() => {
  const g = window.__niebla;
  const c0 = g.player.composure;
  g.player.hit(30, new g.THREE.Vector3(0, 0, 10));
  return { before: c0, after: g.player.composure };
});
results.damage = { ...hitTest, dropped: hitTest.after < hitTest.before };

// 5) note open + close
await page.evaluate(() => { const g = window.__niebla; g.story.readNote('plaque'); });
await new Promise((r) => setTimeout(r, 250));
const noteOpen = await page.evaluate('__niebla.story.ui.noteOpen');
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 250));
const noteClosed = await page.evaluate('!__niebla.story.ui.noteOpen');
results.notes = { opened: noteOpen, closedWithE: noteClosed };

// 6) generator power
const power = await page.evaluate(() => {
  const g = window.__niebla; g.story.startPower();
  return { powered: g.buildings.isPowered() };
});
results.power = power;

// 7) death + revive
await page.evaluate(() => { const g = window.__niebla; g.player.composure = 0; });
await new Promise((r) => setTimeout(r, 2200));
const deadState = await page.evaluate('__niebla.state');
await page.keyboard.press('e');   // revive
await new Promise((r) => setTimeout(r, 800));
const aliveState = await page.evaluate('({state: __niebla.state, composure: __niebla.player.composure})');
results.deathRevive = { reachedDead: deadState === 'DEAD', revivedToPlay: aliveState.state === 'PLAY', composure: aliveState.composure };

// 8) boat win: collect all evidence, unlock, start boat, sit until win
const win = await page.evaluate(() => {
  const g = window.__niebla;
  g.story.evidence = 6;
  g.story.hasBoatKey = true;
  g.buildings.doors.boathouse.locked = false;
  g.director.clearAll();
  g.director.calm = true;   // no interruptions
  g.player.pos.set(g.buildings.anchors.boat.x, 0, g.buildings.anchors.boat.z);
  g.story.startFinale();
  g.story.boatProgress = g.story.boatNeed - 0.5;   // almost done
  return { started: g.story.boatStarted };
});
await new Promise((r) => setTimeout(r, 1500));
const ended = await page.evaluate('({state: __niebla.state, over: __niebla.story.over})');
results.boatWin = { started: win.started, ended: ended.state === 'END', over: ended.over };
await page.screenshot({ path: `${OUT}/play-ending.png` });

results.errors = errs;
console.log(JSON.stringify(results, null, 2));
await browser.close();
