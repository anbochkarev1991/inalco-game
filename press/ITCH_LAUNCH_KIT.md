# INALCO — itch.io Launch Kit

Copy-paste-ready fields for the itch.io "Create a new project" form, plus a
teaser trailer script. The full store-page body lives in [`../STORE_PAGE.md`](../STORE_PAGE.md).

---

## Project fields (paste directly)

**Title**
```
INALCO
```

**Short description / tagline** (itch.io "Short description or tagline" — keep under ~120 chars)
```
The lake gives back what it takes. A survival-horror night where your camera flash is the only weapon the dead fear.
```

**Classification:** Games
**Kind of project:** HTML (playable in browser) — upload the built `dist/` as a zip, mark it "This file will be played in the browser."
**Release status:** Released (or In development, your call)
**Pricing:** Free — with a "Support this game" / name-your-price donation button. (Horror shorts do well as free-with-tips; a $2–3 minimum also works.)

**Genre (dropdown):** Survival
**Also tag as (Tags — itch.io allows up to 10):**
```
horror, survival-horror, atmospheric, first-person, psychological-horror, singleplayer, procedural-generation, threejs, story-rich, dark
```

**Custom noun (the "A ___ game" line):** `survival-horror`

**Community:** Comments (on)
**Visibility & access:** Draft until you're ready, then Public.

---

## Cover & banner images

itch.io uses two images. Both are already prepped in this `press/` folder — you
may want to crop/scale in Preview to the exact sizes below.

| Slot | itch.io recommended size | Suggested source |
|---|---|---|
| **Cover image** (thumbnail on browse/search) | **630 × 500** | `04-the-draft.jpg` (creature-in-beam sells the genre) or `01-estancia.jpg` (mood/place) |
| **Banner / header** (top of the page) | **960 × 250** (wide crop) | `02-shore-beam.jpg` (letterbox the beam-on-beach shot) |
| **Screenshots** (page gallery, in this order) | native 1280 × 800 | `01-estancia`, `02-shore-beam`, `04-the-draft`, `03-rufino-fire`, `06-the-cellar`, `07-the-congregation`, `05-the-half-seen` |

> Tip: the burned-in HUD ("REACH THE ESTANCIA", the subtitle captions) reads as
> intentional style and actually *helps* — leave it in the gallery shots.

---

## Screenshot captions (paste under each gallery image)

1. **01-estancia** — "The house has stood empty since 1943. Someone still tends it. They just don't live in it."
2. **02-shore-beam** — "A fire on the beach. Fires mean people. Please, *please* mean people."
3. **04-the-draft** — "That is NOT a hiker."
4. **03-rufino-fire** — "Walk to the fire. Don't run. The Returned can't hold their shape in open flame."
5. **06-the-cellar** — "Cold. Colder than outside. And there is someone down here — small, sitting very still."
6. **07-the-congregation** — "FRAME 03 — I count too many hands. All of them are folded. It is being patient."
7. **05-the-half-seen** — "FRAME 01 — it held still for the flash. Subjects do not do that."

---

## 60-second teaser trailer — shot list & script

Built to be cut entirely from in-game footage (or from the animated HTML teaser
in this repo — see below). Aspect 16:9, target 60 s. Sound design carries it;
almost no on-screen text.

| # | Time | Visual | Audio / VO / on-screen text |
|---|---|---|---|
| 1 | 0:00–0:06 | **Black.** A single line of radio static rises. | SFX: hiss, a boat engine far off, water. Text fades in: *"The lake keeps what drowns."* |
| 2 | 0:06–0:12 | Slow push across the dark water toward the shore (`02-shore-beam`). Flashlight beam clicks on. | SFX: beam click, a wet footstep. Text: *"And it gives it back."* |
| 3 | 0:12–0:18 | The estancia rising out of the dark (`01-estancia`). | VO (Ana, quiet): *"Nine days ago my sister went into the water."* |
| 4 | 0:18–0:24 | The campfire, Rufino silhouetted (`03-rufino-fire`). | VO (Rufino): *"You can't stop them. You can disprove them."* |
| 5 | 0:24–0:30 | Whip to the path — the Draft standing in the beam (`04-the-draft`). Beam holds on it. | SFX: the crickets cut to silence. VO (Ana): *"That is not a hiker."* |
| 6 | 0:30–0:34 | **Camera-flash white-out.** Freeze on the Half-Seen mid-lunge (`05-the-half-seen`). | SFX: shutter clack ×2, xenon thump. Text: *"One flash staggers them."* |
| 7 | 0:34–0:38 | Second flash white-out → the Congregation dissolving (`07-the-congregation`). | SFX: rising capacitor whine → crack. Text: *"Two disprove them."* |
| 8 | 0:38–0:46 | Quick cuts: cellar (`06-the-cellar`), blood wall, black eyes in the beam. Building rhythm. | SFX: a child crying, a voice: *"A-na…"* VO (Ana): *"Don't answer. Whatever it says — don't answer."* |
| 9 | 0:46–0:52 | The beam sweeps to the dock. A figure at the far end. Dawn just starting to break the fog. | SFX: everything drops to a single held breath. |
| 10 | 0:52–0:57 | **Cut to black.** Title card: **INALCO**. Below: *the lake gives back what it takes.* | SFX: low D-minor drone (the menu theme). |
| 11 | 0:57–1:00 | itch.io URL / "Play free in your browser." Wordmark holds. | SFX: drone tail. |

**Music:** the game's own synthesized D-minor menu drone under the whole thing;
let it swell at shot 10. **No temp-track licensing needed — it's all in-engine.**

**Recording the real thing:** run `npm run dev`, play with `?skipintro`, and
screen-capture at 1280×800 / 60 fps (macOS: QuickTime → New Screen Recording, or
OBS). The moments above are all reachable in the first ten minutes of a run.

---

## The teaser (already rendered)

**`press/INALCO-teaser.mp4`** — a finished ~54-second trailer, **1280×720 · H.264 · 30 fps ·
stereo AAC**, cut from the shot list above with the game's own synthesized score
(D-minor drone, radio static, shutter clacks, capacitor whine, the waterline
name-call). Upload this directly as the itch.io page video. No editing required.

How it was made (so you can re-cut it):

- `press/teaser.template.html` — the animated teaser (author with `__IMG_x__` tokens).
  It is **seek-driven**: every frame is a pure function of time, so it renders
  deterministically.
- `npm run build-teaser` — inlines the images → `press/teaser.html` (open it in a
  browser to preview live, with sound) and `press/teaser.artifact.html`.
- `npm run render-teaser` — headless-captures each frame + renders the WebAudio
  score offline, then muxes with `ffmpeg` → `press/INALCO-teaser.mp4`.

To change timing, captions, or shots, edit the `SHOTS` array in the template,
run `build-teaser`, then `render-teaser` again. Tunables: resolution / fps are
at the top of `scripts/render-teaser.mjs`.

> An interactive HTML version was also published as a Claude artifact (press Play
> for sound) — handy for previewing, but the **MP4 is the file to upload.**

---

## Suggested launch checklist

- [ ] `npm run build`, zip the `dist/` folder, upload, tick "played in browser," set the embed to **1280 × 800** with fullscreen enabled.
- [ ] Cover 630×500, banner 960×250, 5–7 gallery screenshots with captions above.
- [ ] Paste the `STORE_PAGE.md` body into the page description.
- [ ] Upload `press/INALCO-teaser.mp4` as the featured page video (or the real gameplay cut once you shoot one).
- [ ] Tags (max 10), genre = Survival, price = free / name-your-price.
- [ ] Add a content warning: **body horror, a drowned child, sudden loud audio.**
- [ ] Devlog post #1 = the trailer + one paragraph on the camera-flash mechanic.
