# INALCO — Menu, Naming & Interface Overhaul (Implementation Plan)

Status: **✅ IMPLEMENTED (2026-07-12).** Built directly (not via sub-agents) because the tasks
share `main.js` / `index.html` / `ui.js` heavily. All headless tests green (`npm run play` →
`errors:[]`; a dedicated menu/save/continue round-trip verified). Difficulty levels were dropped
per the user (the night tide already escalates the curve). A **save/resume** system and **menu
ambient music** were added on top of the original plan — see §A (Save & Resume) and §B (Menu music).

**FINAL SCOPE (after user trims):** a menu (**Begin / Continue**), a **journal** (photos + notes),
an upgraded **pause menu** (Resume / Journal / Restart Night / Main Menu), **save & resume**, and
**menu ambient music**. Two originally-planned features were **cut by the user mid-build and fully
reverted**: **character naming** ("too many text variations") and the **Options screen** ("get rid
of options too"). The hero is always "Ana"; brightness/sensitivity/volume revert to their original
hardcoded defaults.

Original plan retained below for reference. Deviations from it:
- **Difficulty** (old Phase A / §4 table): **removed** — the tide provides the curve.
- **Character naming** (old T2/T3): **cut & reverted** — no `{HERO}` token, no name entry.
- **Options screen** (old T8): **cut & reverted** — `src/options.js` + `src/settings.js` deleted.
- **Save & Resume**: **added** (`src/save.js`, `src/journal.js`, serialize/restore across
  player/story/buildings, autosave triggers, a Continue button). Storage analysis in §A.
- **Menu ambient music**: **added** (`audio.menuMusic()`). See §B.
- New modules that shipped: `src/save.js`, `src/journal.js`, `src/menu.js`, `src/journalui.js`.

---

## §A. Save & Resume — storage choice + what's restored

**Question the user raised:** sessionStorage vs localStorage vs IndexedDB for saving progress in a
back-endless browser game?

**Decision — localStorage.** Reasoning:
- **sessionStorage** is cleared when the tab closes → useless for "interrupt for a while." Rejected.
- **localStorage** survives tab close / refresh, is synchronous, trivially JSON-serializable, and
  the whole snapshot (player transform, ~25 story flags, door/power state, capped photo album) is a
  few KB — far under the ~5 MB budget. Synchronous writes are a non-issue at this size. **Chosen.**
- **IndexedDB** only earns its async complexity for large binary blobs (a big uncapped photo/video
  album). We sidestep it by keeping the photo album as **capped, downscaled 240×190 JPEG thumbnails**
  (`journal.js`, cap 24) so it fits comfortably in localStorage. Documented as the upgrade path if
  the album ever needs to grow unbounded.

**Keys:** `inalco.settings` (name + options), `inalco.journal` (photos + notes, auto-persisted),
`inalco.save` (versioned checkpoint).

**When it saves (autosave, no manual save button):** on pause, on tab-hide (`visibilitychange`),
on `beforeunload`, and every 20 s of live play. The menu's **Continue** appears whenever a valid
checkpoint exists and shows "where you left off — <objective> · evidence N/6".

**What Continue restores** (verified round-trip): player position/orientation, composure, stamina,
bonuses, flashlight; evidence count + current objective; all quest-routing flags (met NPCs, Rufino/
Mara/Eliseo quest stages, girl state); collected items (hidden + not re-counted); and the durable
world effects are **replayed** — generator power (lights/hum/pressure), Mara's relocation by fate,
the boat chain, doors (open/locked). Journal photos + notes persist independently.

**Known, deliberate limitations** (transient state re-derives; documented so no one thinks it's a
bug): live enemies aren't saved (they re-spawn from pressure), the night tide re-ramps rather than
restoring exactly, one-time `revisit.js` environmental morphs aren't tracked, and a fully-dissolved
cellar girl isn't force-hidden (rare save point; she won't re-provoke). **New Game / Restart Night**
clear the checkpoint + journal via `?newgame`; **Main Menu** saves then reopens the menu via `?menu`.

## §B. Menu ambient music

`audio.menuMusic(on)` — a fully-synthesized (no files, per house style) slow D-minor drone pad: a
low cluster (D2/A2/D3/F3 + a faint D4 shimmer) under a lowpass that breathes (two slow LFOs on
cutoff + amplitude) with per-voice detune drift so it never sits still. Fades in when the menu opens
(on the first user gesture, after `audio.ensure()`), fades out on Begin/Continue. Master volume from
the Options slider applies to it.

---

> **Changed from the first draft:** the **difficulty-level** feature was **dropped**. The night's
> tide already escalates crowd size and spawn cadence over the course of the run (Night Engine →
> `director.setTide` → `effPressure()` → `CAPS`/`INTERVAL`), so the game gets meaningfully harder
> toward the end on its own. A manual Easy/Medium/Hard selector would be redundant. This plan now
> covers the **menu, character naming, and the interface additions** only.

---

## 1. What the user asked for

1. A **menu** shown before the game starts.
2. In the menu, let the player **name the main character**.
3. **Further interface improvements** — with one hard constraint: **do NOT add a health/life bar**
   (the user likes that it's absent). Confirmed additions (see §3): Options/Settings screen, a
   photo journal, a notes/objective journal, and a pause-menu upgrade.

_(Difficulty levels: intentionally **not** included — the tide provides the curve.)_

---

## 2. Current state (verified against the code, 2026-07-11)

- **Boot / start flow** — `src/main.js`:
  - Module top-level `await`s asset + texture preloads, builds the world, runs
    `warmUpRenderer()`, then sets the title to `CLICK TO BEGIN`.
  - `let state = 'TITLE'` (`TITLE | INTRO | PLAY | PAUSE | DEAD | END`).
  - `mousedown` while `state==='TITLE'` calls `startGame()` → pointer-lock + `INTRO` →
    `finishIntro()` → `PLAY`. **Any click anywhere starts the game today.**
  - `?skipintro` (`SKIP_INTRO`) jumps straight past the cutscene.
- **Title screen** — `index.html` `#title-screen`: atmospheric `INALCO` wordmark, fog layer,
  subtitle, a `#title-start` line (`CLICK TO BEGIN`), a static `#title-controls` legend.
- **Pause screen** — `#pause-screen`: just "PAUSED" + a control legend; click resumes
  (`requestLock`). No buttons.
- **Character name** — `Ana Reyes`, searching for her sister `Lucía`:
  - Subtitle speaker chip: `ui.say('ANA', …)` in **46 places** across
    `story.js / main.js / vignettes.js / reveals.js`. Rendered by `UI.say()` / `UI.update()` in
    `src/ui.js` — **one templating point.**
  - Prose that addresses her by name inside NPC dialog: ~2 lines in `story.js`
    (`…should not be warm, Ana`; the player's own intro `I'm Ana. Ana Reyes — Lucía's sister.`).
  - `Reyes` (surname) and `Lucía` (sister) are load-bearing for the plot and stay fixed.
- **Options-relevant hooks** (for the settings screen):
  - Brightness → `renderer.toneMappingExposure` (base `1.07`, `main.js:30`).
  - Mouse sensitivity → the look constants in `player.look` (~`0.0023`, `player.js:74-78`).
  - Master volume → `audio.master.gain` already exists (`audio.js:16-20`).
- **Polaroids** already develop on capture (the capture block in `main.js` ~L551-568 calls
  `ui.polaroid(dataUrl, caption)`) — the raw material for the photo journal.
- **Notes** already render via `ui.showNote({kind,title,body})`; objectives via
  `ui.setObjective(...)` — the raw material for the notes journal.
- **No persistence** anywhere — `localStorage` is unused.
- **Test harness (must stay green):** `scripts/play.mjs` waits for `#title-start` to read
  `CLICK TO BEGIN`, then **clicks `(640,400)` to start**. A menu inserted between title and play
  breaks this unless `?skipintro` auto-starts with defaults (Task T6). `window.__niebla` is the
  debug handle; add menu/settings hooks to it for headless driving.
- **Shader constraint from prior rounds:** every material must compile during `warmUpRenderer()`
  behind the title or it freezes at first draw. The menu is pure DOM/CSS → **no shader cost.**

---

## 3. Design decisions (please confirm)

**D1 — Name scope.** ✅ **CONFIRMED (chip + NPC lines).** The chosen name replaces (a) the
subtitle speaker chip on every one of Ana's inner-monologue lines, and (b) the ~2 NPC lines that
address her directly. It does **not** touch the surname "Reyes" or the sister "Lucía". Default
name = `Ana` (blank input falls back to `Ana`). → Tasks **T2 + T3.**

**D2 — Persistence.** ✅ **CONFIRMED.** Remember the chosen name + options in `localStorage` so
the menu pre-fills next session. Delivered via `settings.save()/load()` (T1) + the Options screen
(T8).

**D3 — Further improvements in scope.** ✅ **CONFIRMED.** Options/Settings screen (T8), Photo
journal (T9), Notes/objective journal (T10), Pause-menu upgrade (T7). The rest of §7 stays backlog.

---

## 4. Target architecture

**`src/settings.js`** — new module, single source of truth for the player's chosen name + options,
read live and persisted:

```js
const state = { playerName: 'Ana', options: { brightness: 1.07, sensitivity: 1.0, volume: 0.85 } };

export const settings = {
  get playerName() { return state.playerName || 'Ana'; },
  set playerName(n) { state.playerName = (String(n||'').trim().slice(0,18)) || 'Ana'; },
  get heroLabel() { return this.playerName.toUpperCase(); },   // subtitle chip
  options: state.options,
  save() { try { localStorage.setItem('inalco.settings', JSON.stringify(state)); } catch(e){} },
  load() { try { Object.assign(state, JSON.parse(localStorage.getItem('inalco.settings')||'{}')); } catch(e){} },
};
```

**Consumers (read live):** `ui.js` (name chip), `dialog.js`/`story.js` (`{HERO}` token in prose),
`main.js`/`player.js`/`audio.js` (options setters).

**Menu** — new DOM in `index.html` (`#menu-screen`) + a small controller `src/menu.js`. New game
state `MENU`. Flow:

```
TITLE (CLICK TO BEGIN) ──click──▶ MENU ──[BEGIN]──▶ startGame() ──▶ INTRO ──▶ PLAY
                                   │
                                   ├─ name input (pre-filled from saved settings)
                                   ├─ OPTIONS  (T8)
                                   ├─ HOW TO PLAY  (backlog)
                                   └─ writes settings + settings.save()
```

`?skipintro` bypasses **both** the menu and the cutscene, auto-starting with saved/default
settings — this is what keeps `play.mjs` green (Task T6).

---

## 5. Risks & how each is handled

- **Headless tests** (`play.mjs` clicks to start) → `?skipintro` auto-starts past the menu with
  defaults; harness waits updated in T6. Expose `window.__niebla.beginGame()` + `settings` for
  headless driving.
- **Name breaking the plot** → surname/sister fixed; only the first-person chip + 2 direct-address
  lines are templated (D1).
- **No shader cost** — menu/options/journal are DOM/CSS; nothing new to warm up.
- **Pointer lock vs. typing** — the name `<input>` lives on a non-pointer-locked screen; game
  keybinds only read `input` during `PLAY`, so typing in the field can't move the player.
- **Options applied after construction** — brightness/sensitivity/volume apply via live setters
  (`renderer.toneMappingExposure`, `player.look` factor, `audio.master.gain`), so a menu made
  after module load takes effect without re-instantiating anything.

---

## 6. Atomic task breakdown (one sub-agent per task)

Each task lists **files**, **change**, **acceptance**, **test**. Do T1 first (everything imports
it). Tasks marked ∥ can run in parallel with their siblings.

### Phase A — Foundation + naming

**T1 — Create `src/settings.js`** (foundation).
- Files: **new** `src/settings.js`.
- Change: implement the module in §4 (name getter/setter with clamp-to-18/fallback-`Ana`,
  `heroLabel`, `options`, `save`/`load`).
- Acceptance: default `settings.playerName === 'Ana'`; blank/oversized names clamp; `save()`
  then `load()` round-trips through `localStorage`.
- Test: scratch node check or via `__niebla` in the browser console.
- Depends on: none.

**T2 ∥ — Templating the subtitle speaker chip** (`ui.js`).
- Files: `src/ui.js`.
- Change: in `say(who,text,dur)` (or `update()` where the chip renders), map the sentinel
  `who === 'ANA'` → `settings.heroLabel`. Import `settings`. Leave `''` (narrator) and other
  speakers (RUFINO, MARA VIDAL, DON ELISEO) untouched.
- Acceptance: name "Teo" makes every one of Ana's 46 inner-monologue lines show the chip **TEO**;
  other speakers unchanged; default still shows **ANA**.
- Test: set `settings.playerName='Teo'`, trigger any `ui.say('ANA', …)`, inspect `#subtitle .who`.
- Depends on: T1.

**T3 ∥ — Templating direct-address NPC prose** (`story.js`, `dialog.js`).
- Files: `src/story.js` (replace the ~2 literal "Ana" address strings with a `{HERO}` token),
  `src/dialog.js` (resolve `{HERO}` → `settings.playerName` when rendering a node's text/choices).
- Acceptance: with name "Teo", Mara's line reads "…should not be warm, Teo." and the player's
  self-intro reads "I'm Teo. Teo Reyes — Lucía's sister." Surname/sister preserved.
- Test: drive the Mara dialog headlessly; assert rendered text contains the chosen name.
- Depends on: T1.

### Phase B — The menu

**T4 — Menu markup + styling** (`index.html`).
- Files: `index.html`.
- Change: add a `#menu-screen` `.screen` in the same visual language as `#title-screen` (fog
  layer, `INALCO` wordmark, serif/Courier type, bone/cyan palette). Contents:
  - Name field: `<input id="menu-name" maxlength="18" placeholder="Ana">`.
  - `#menu-begin` "BEGIN" action; a "BACK" to the title.
  - Buttons/placeholders: **OPTIONS** (wires to T8), **HOW TO PLAY** (backlog).
  - Keyboard- and mouse-navigable; `pointer-events:auto` on the interactive controls (the `#ui`
    root is `pointer-events:none`).
- Acceptance: renders over the canvas, matches the horror aesthetic, responsive, does not capture
  pointer lock.
- Test: visual — `smoke.mjs` viewpoint or screenshot to `_screenshots/menu.png`.
- Depends on: none (wires up in T5).

**T5 — Menu controller + state wiring** (`src/menu.js` new, `src/main.js`).
- Files: **new** `src/menu.js`, `src/main.js`.
- Change:
  - `menu.js` exports `buildMenu({ onBegin })` that reads/writes `settings`, handles the name
    input, calls `settings.load()` on open (pre-fills last name — D2) and `settings.save()` on
    Begin.
  - `main.js`: add state `MENU`. After `warmUpRenderer()`, `CLICK TO BEGIN` now transitions
    `TITLE → MENU` (show menu), **not** straight to game. The old
    `mousedown → if(state==='TITLE') startGame()` becomes `→ showMenu()`. `#menu-begin` calls
    `startGame()`. Add `beginGame()` to `window.__niebla`. Ensure `mousedown` does nothing
    game-affecting while `state==='MENU'`.
- Acceptance: Title → click → Menu; enter name "Teo" → Begin → INTRO/PLAY with the name applied;
  ESC/pause still works.
- Test: manual; headless via `__niebla.beginGame()` after setting `settings`.
- Depends on: T1, T4. (Do after T2 so the name is already live in-game.)

### Phase C — Tests

**T6 — Keep headless tests green** (`scripts/play.mjs`, `scripts/smoke.mjs`, `main.js`).
- Files: `src/main.js`, `scripts/play.mjs`, `scripts/smoke.mjs`.
- Change: make `?skipintro` **also skip the menu**, auto-starting with saved/default settings
  (call `startGame()` directly at boot when `SKIP_INTRO`, bypassing `MENU`). Verify the existing
  `(640,400)` click becomes a harmless in-game flash and doesn't assert-fail; update comments/waits
  if needed.
- Acceptance: `npm run play` passes unchanged (movement, flash-stagger, damage, notes, power,
  death/revive, boat-win) with the menu present but skipped.
- Test: `npm run play` → green, `errors:[]`.
- Depends on: T5.

### Phase D — Interface additions

**T7 ∥ — Pause-menu upgrade** (`index.html`, `src/main.js`, `src/ui.js`).
- Files: `index.html` (`#pause-screen`), `src/ui.js`, `src/main.js`.
- Change: replace the bare "PAUSED" with buttons: **RESUME** (requestLock), **RESTART**
  (`location.reload()`), **MAIN MENU** (`location.reload()` — or `?menu` to reopen the menu),
  **OPTIONS** (opens T8), **JOURNAL** (opens T9/T10), and a read-out of the current **character
  name**. Keep click-to-resume as a fallback.
- Acceptance: pausing shows the options; each button works; name shown correctly.
- Test: manual.
- Depends on: T5 (for the "Main Menu" target). Build Options/Journal buttons as no-ops first if
  running before T8–T10.

**T8 — Options / Settings screen + persistence** (`index.html`, `src/settings.js`, new
`src/options.js`, `src/main.js`, `src/player.js`, `src/audio.js`).
- Files: `index.html` (`#options-screen`), `src/settings.js` (already has `state.options`),
  **new** `src/options.js` (controller), `src/main.js`, `src/player.js`, `src/audio.js`.
- Change: an Options overlay reachable from **both** the menu (T4/T5) and pause (T7), with
  live-applied, persisted controls:
  - **Brightness / gamma** → `renderer.toneMappingExposure` (base `1.07`, `main.js:30`). *Most
    valuable setting in a game this dark.* Expose a setter from `main.js`.
  - **Mouse sensitivity** → scale the look constants in `player.look` (~`0.0023`) by
    `settings.options.sensitivity`.
  - **Master volume** → `audio.master.gain.value` (`audio.js:16-20`); add `audio.setMasterVolume(v)`.
  - All controls write `settings.options` and call `settings.save()`; `settings.load()` on boot
    re-applies them (delivers **D2 persistence**).
- Acceptance: sliders change brightness/sensitivity/volume immediately and survive a reload;
  reachable from menu and pause; sane defaults.
- Test: manual; `smoke.mjs` screenshot; verify `localStorage['inalco.settings']`.
- Depends on: T1, T5, T7.

**T9 — Photo journal / polaroid gallery** (new `src/journal.js`, `src/main.js`, `index.html`,
`src/ui.js`).
- Files: **new** `src/journal.js`, `src/main.js` (capture block ~L551-568), `index.html`
  (`#journal-screen`), `src/ui.js`.
- Change: when a polaroid develops (`ui.polaroid(dataUrl, caption)` path in `main.js`), also push
  `{ dataUrl, caption, kind }` into a journal store (`src/journal.js`, capped). A **gallery
  overlay** (openable from pause, T7) shows the collected polaroids as a grid/pinboard with
  captions — progress feedback that fits the "camera as a lens of discovery" fantasy, **no health
  bar**. Optional: badge how many enemy kinds / reveal spots have been photographed.
- Acceptance: capturing photos adds them to the gallery; opening the journal shows them; empty
  state reads gracefully; capped (no memory leak).
- Test: headless — trigger a flash/reveal, assert the store grows; visual screenshot.
- Depends on: T7 (pause entry); the capture wiring is independent and can start on T1.

**T10 — Notes & objective journal** (shared `src/journal.js`, `src/story.js`, `src/ui.js`,
`index.html`).
- Files: `src/story.js` (record notes/objectives as seen), the shared journal store, `src/ui.js`
  (`showNote` path), `index.html` (`#journal-screen` tab), `src/main.js`.
- Change: when a note opens (`ui.showNote(...)`) record it into a collected log; when
  `ui.setObjective(...)` changes, append to an objective history. A **journal overlay** (same
  screen as T9, second tab) lets the player **re-read any found note** and see current + past
  objectives. Reuses existing content — no new writing.
- Acceptance: reading a note adds it to the log; the journal lists notes + objectives; re-opening
  a note shows its full body; no duplicates.
- Test: headless — open a note, assert it appears in the log; visual screenshot.
- Depends on: T7 (pause entry). Coordinate the shared `#journal-screen` / `src/journal.js` with
  T9 (one agent owns the shell; the other fills a tab).

---

## 7. Backlog (not scheduled — no health bar, ever)

1. **How-to-play / controls screen** in the menu (fold the static `#title-controls` legend into a
   proper panel).
2. **Accessibility**: reduce-motion toggle (dial down film-burn/glitch/head-bob), subtitle-size
   and subtitle-background toggles, toggle head-bob (`player.js`).
3. **Menu atmosphere**: lake/wind ambient bed behind the menu; camera-shutter SFX on Begin
   (needs `audio.ensure()` on first gesture — already the pattern).
4. **Diegetic danger feedback polish** (explicitly *not* a bar): tie the existing vignette /
   heartbeat / desaturation more tightly to composure so the screen "breathes" harder as Ana
   frays — the felt substitute for a health bar.
5. **Legacy bilingual IDs** — `#objective-es` / `#objective-en` and `UI.setObjective(es,en)` are
   pre-English-only leftovers; rename to `#objective` / `#objective-sub` (cosmetic).

---

## 8. Suggested execution order for sub-agents

```
T1 ─┬─ T2 ──────────── name chip live
    ├─ T3 ──────────── NPC prose ({HERO})
    └─ T4 ── T5 ── T6  menu + tests green
                   │
                   ├─ T7 (pause shell)   ── entry points for T8–T10
                   ├─ T8 (options + persist)
                   ├─ T9 (photo journal) ─┐
                   └─ T10 (notes journal)─┴─ share #journal-screen / src/journal.js
```

Recommended: **T1 first and alone** (everyone imports it), then fan out **T2 / T3 / T4** in
parallel, converge on **T5 → T6**. Build the **T7** pause shell next so T8–T10 have entry points;
then **T8 / T9 / T10** in parallel. Coordination note: one agent owns the shared `#journal-screen`
+ `src/journal.js` shell (T9) while **T10** fills the notes tab; **T8** and the journal both hang
off the **T7** pause menu, so land T7's buttons (no-ops first if needed) before wiring.
