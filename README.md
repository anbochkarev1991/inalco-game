# INALCO — the lake gives back what it takes

A small first-person survival-horror game for the browser. Patagonia, Lake
Nahuel Huapi, off a point where something old lives in the deep water. It
isn't malicious. It collects. And it gives back what it drowns.

You are Ana Reyes, a photographer. Nine days ago her sister Lucía, a sound
tech on a documentary shoot, left a garbled voicemail from Inalco and then
went silent. The police say the crew left. Ana takes the last ferry out with
her camera to find out what actually happened. She misses the return.

The enemies are **the Returned** — the drowned, walking back out of the lake,
rebuilt from the imperfect memories of whoever still grieves them. Blurry
wherever memory is. You cannot fight them. Your only weapon is your
**camera flash**: a photograph is a memory that can't blur, and confronted
with an exact record of what it is, a Returned loses the argument with itself.

Everything is procedural — no downloaded assets. Three.js + WebAudio.

## ▶ Play

**[Play in your browser →](https://anbochkarev1991.github.io/inalco-game/)**

No install needed. Desktop browser + mouse/keyboard, headphones recommended.
The build deploys automatically from `main` via GitHub Pages.

## Run it locally

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173). Headphones recommended.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | move |
| Mouse | look |
| Shift | run (limited stamina) |
| E | interact / read / hold-E for the generator |
| F | flashlight (on by default) |
| Left click | camera flash (staggers the Returned, 6s recharge) |
| Esc | pause |

## Goal

Get inside the estancia, fuel and start the generator, find the boathouse key,
unchain the boat, escape. Optional: collect all 6 pieces of **proof** — they
pick the main ending (*WHAT THE LAKE KEEPS* vs *WHAT THE LAKE GIVES BACK*).

## The people

You are not alone out here. Three of them will talk — dialogue choices
(keys **1–3**) and side quests change the epilogue:

- **Rufino**, the kiosk keeper, at a campfire on the east beach. Third
  generation of the arrangement that keeps this shore safe. His fire is
  shelter — the Returned won't come near it.
- **Mara Vidal**, the missing fifth member of the documentary crew, hiding in
  the greenhouse, eight days without sleep. What you decide about her master
  tape matters.
- **Don Eliseo**, the gardener by the old arrayán. Do what he asks. Consider
  what you promise.

## Surviving

- Watch the radio static: the louder it gets, the less alone you are.
- One camera flash staggers a Returned. **Two flashes disprove it.**
- Break line of sight (or kill your flashlight and keep your distance) and they
  lose you — then they search where they last saw you.
- The house and the campfire are shelter. They will circle, lose conviction, leave.
- The Draft only moves when you are not looking at it.

## Debug flags

- `?skipintro` — skip the opening sequence
- `?calm` — no enemies (sightseeing mode)

They combine: `http://localhost:5173/?skipintro&calm`

## Dev scripts (headless Chrome)

With the dev server running:

```bash
OUT_DIR=/tmp node scripts/smoke.mjs   # screenshot tour of key viewpoints
OUT_DIR=/tmp node scripts/play.mjs    # drives inputs, asserts core mechanics
```
