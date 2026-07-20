# INALCO — Teaser v2 Director's Treatment

*Screenshot-only · ≤ 60 s · goal: the viewer finishes thinking "I need to know what this game is."*

---

## 1. Brutal critique of v1

What v1 did well: the grade, grain, letterbox, serif captions, Didot title, and the
procedural score are genuinely premium. Keep all of that. But as a **conversion tool** it fails:

1. **It's a mixtape, not an argument.** Every shot is 4–6 s with the same crossfade. Even
   pacing = slideshow. No acceleration, no held silence, no rhythm the body can feel.
2. **The hook is abstract text on black.** "The lake keeps what drowns" is a great line, but
   opening cold on a title card asks for patience the viewer hasn't agreed to give yet.
3. **The one thing that makes this game different is buried.** The camera-as-weapon —
   *a photograph disproves the dead* — is delivered as two near-identical white flashes with
   two monsters and two captions. The viewer sees "monster, monster," not a **mechanic**. This
   is the single biggest miss. If someone can't tell this apart from any other Unity horror
   asset-flip, they won't wishlist.
4. **No climax.** Two flashes back-to-back is a checklist, not a peak. There's no single image
   the trailer is *built around*.
5. **The personal stake is a throwaway.** "My sister went into the water" flies by in the
   middle and is never paid off. That sentence is the emotional engine of the whole game and
   it's treated like a caption.
6. **The ending is a full stop.** A tidy title card closes the door. A teaser should end on an
   open question that makes you lean in.
7. **Rufino's line — the thesis — is spent too early**, over a cozy fire, before we've earned it.

**Design thesis for v2:** stop *showing screenshots* and start *making an argument* in three
sentences — (a) something is wrong with this lake, (b) the dead come back and you can't kill
them, (c) so you fight them **with a camera, and the photograph shows you a truth worse than
what you saw.** Pay it off with the sister. End on a question.

---

## 2. Emotional curve

```
tension
  ^                                              ┌─CLIMAX─┐
  |                                       ┌──────┘        └─┐
  |                          ┌────────────┘   (silence)     └──┐  ┌─button
  |             ┌────────────┘                                  └──┘
  |   ┌─────────┘                                                   (question)
  └───┴──────────┴───────────┴──────────────┴─────────┴───────────┴──────────> time
     RULE        ISOLATION    WRONGNESS       MECHANIC   DREAD       STAKE+END
    0────────11──────────21──────────32.6────36──flash──42──────49──────55────60
```

Five movements, each with a different shot length, so pace itself tells the story:
long contemplative holds → shorter unsettled cuts → a fast charge → **a hard drop to
silence** → one long final push.

---

## 3. Second-by-second storyboard + editing instructions

Times are absolute seconds. **Move** = Ken-Burns on the still. **Trans** = how the shot
*enters*. All stills are the ones in `press/teaser-src/`.

| # | In–Out | Still | Camera move (Ken Burns) | Transition in | Text (see §5) | Sound (see §4/§6) |
|---|--------|-------|--------------------------|---------------|---------------|-------------------|
| — | 0.0–0.6 | *black* | — | — | — | boat engine **receding**, water, sub-bass fades up from nothing |
| 1 | 0.6–6.2 | `sign` (ferry sign) | slow push-in 1.03→1.13, drift up-left toward the fine print | fade **from black** (1.0 s) | C1 *"if there is a lot of fog — hide"* | engine gone by 4 s → just water + wind; single sub note |
| 2 | 6.2–11.2 | `shore` (beam on water) | push 1.06→1.15, slight downward drift onto black water | dissolve 0.9 s | C2 *"The lake keeps what it drowns."* | low glassy sine enters; water |
| 3 | 11.2–16.2 | `estancia` (house) | push 1.04→1.13 toward the one lit door | dissolve 0.9 s | C3 *"…and it gives it back."* | D-minor drone fades in; faint radio static |
| 4 | 16.2–21.0 | `corridor` (empty hall, black doorway) | slow dolly 1.05→1.16 down the corridor | dissolve 0.9 s | C4 *"Someone still keeps this house."* → C5 *"No one lives in it."* | a single drip; insects outside; static breathes |
| 5 | 21.0–25.6 | `leanfar` (distant wet figure) | **tilt up** the figure, 1.06→1.14 | hard **cut** | C6 *"My sister drowned in this water."* | **insects cut to silence** on the cut; sub swell |
| 6 | 25.6–29.2 | `draft` (figure in the beam) | push-in 1.05→1.16 | hard cut | C7 *"That is not a hiker."* (ANA) | wet sub-vocal breath; **low pulse begins** (~2 s apart) |
| 7 | 29.2–32.6 | `fire` (Rufino at the fire) | push 1.04→1.12 toward the flame | dissolve 0.7 s, **fade out to black** | C8 *"You can't stop them."* → C9 *"You can only disprove them."* (RUFINO) | fire crackle; pulse continues, quickening |
| — | 32.6–33.1 | *black (dip)* | — | — | — | one held breath of near-silence |
| 8 | 33.1–36.0 | `veil` (ghost in fog) **+ viewfinder HUD** | tight, faint handheld drift 1.08→1.12 | hard cut | C10 *"Hold still."* (ANA); HUD: *FLASH ● CHARGING* | **capacitor whine rises**, pulse accelerates, charging ring fills |
| 9 | 36.0–36.4 | **WHITE FLASH** | — | whiteout | — | **shutter ×2 + xenon thump + sub BOOM**, then cut |
| 10 | 36.4–42.0 | `draft` **as a developed Polaroid** | print settles: scale 1.00→1.05, rotate −2°→0° | resolves out of the white | C11 *"It was closer in the photo than when I took it."* | **DROP TO SILENCE** — only a high tinnitus ring + paper settle + one low note |
| 11 | 42.0–44.2 | `child` (small figure, blood wall) | push 1.05→1.14 | hard cut | C12 *"Some of them are small."* (ANA) | soft dissonant string **stab** |
| 12 | 44.2–49.4 | `congregation` (many hands / heads) | very slow push 1.03→1.12, fog parting | dissolve 0.9 s, **fade out to black** | C13 *"I count too many hands."* → C14 *"All of them are folded."* | **choir cluster** swells (the "congregation"), cloth/hands |
| — | 49.4–50.0 | *black (dip)* | — | — | — | choir tail decays into water |
| 13 | 50.0–55.2 | `her` (lone figure in fog) | very slow push 1.05→1.12 toward the figure | fade from black 1.0 s | C15 *"Nine days later —"* → C16 *"she walked back out."* | water; **the lake calls "A-na…"** at 52.0; a minor note begins to swell |
| 14 | 55.2–59.6 | **TITLE** `INALCO` | title resolves from black, letterspacing settles | fade in 1.4 s | C17 tagline *"the lake gives back what it takes"*; C18 button *"don't answer."* | final minor chord swells then decays; a last faint *"A-na…"* under the button |

**Total: 59.6 s.**

### Why this order converts
- **0–11 s (curiosity):** a mundane tour-boat sign whose fine print is a survival instruction,
  then a poetic rule about the lake. No monster. The viewer asks *"what happens in the fog?"*
- **11–21 s (loneliness / shouldn't be here):** a tended-but-abandoned house, an empty
  corridor ending in a black doorway. You are alone, and you are not the first.
- **21–32.6 s (wrongness):** an ambiguous distant figure while the line *"my sister drowned
  here"* lands — *is that her?* — then the recognition *"that is not a hiker,"* then the thesis
  *"you can't stop them, you can only disprove them."* Now the viewer needs to know: **how?**
- **32.6–42 s (the mechanic = the climax):** viewfinder → flash → **the photograph reveals the
  thing closer than it was.** This is the whole USP in one built-up, paid-off beat. The drop to
  silence on the photo is the memorable peak.
- **42–49 s (dread apex):** a small figure ("some of them are small"), then the patient,
  many-handed Congregation. Horror of *anticipation and wrongness*, never a jump scare.
- **50–60 s (stake + question):** a lone figure in the fog as *"nine days later — she walked
  back out"* pays off the sister. Title. Then a whispered **"don't answer"** as the lake says
  your name — the button that makes people sit forward and click *wishlist*.

---

## 4. Music progression (all synthesized in-engine, no licensing)

| Phase | Time | Music |
|---|---|---|
| **Void** | 0–11 | Sub-bass drone fades up from silence; a receding boat-engine tone dies out in the first 4 s; one distant high "glass" sine. Sparse, cold. |
| **Creep** | 11–21 | D-minor drone voices fade in (two detuned → slow beating); radio static breathes in and out. |
| **Pulse** | 21–32.6 | A muffled low **pulse** starts (~2 s) and **accelerates** toward the dip; a dissonant voice a tritone above the root grinds against it. Insects cut to silence at 21. |
| **Charge** | 33.1–36 | Capacitor **whine** rises in pitch; pulse quickens to ~0.6 s; everything crescendos. |
| **Impact → Silence** | 36–42 | Shutter + xenon thump + a felt **sub-boom** on the flash — then **everything cuts to near-silence**: a high tinnitus ring and one lonely low note under the photograph. *This contrast is the whole trailer's spine.* |
| **Congregation** | 42–49.4 | A soft dissonant **string stab** on the child cut, then a swelling **choral cluster** (detuned sustained voices) for the many-handed figure. |
| **Elegy** | 49.4–55 | Near-silence; water; a single minor note begins to swell under the final figure. |
| **Resolve** | 55–59.6 | A sustained **minor chord** blooms for the title, then decays to a tail. |

---

## 5. Text overlays (exact copy)

Short, spaced, and doing real work (mythology / stake / mechanic / rule) — never a wall to
read. Serif italic for Ana's voice; small letterspaced caps for attributions and the sign.

- **C1** `if there is a lot of fog —  hide` *(styled like the sign's fine print)*
- **C2** `The lake keeps what it drowns.`
- **C3** `…and it gives it back.`
- **C4** `Someone still keeps this house.`
- **C5** `No one lives in it.`
- **C6** `My sister drowned in this water.`
- **C7** `That is not a hiker.` — **ANA**
- **C8** `You can't stop them.` — **RUFINO**
- **C9** `You can only disprove them.` — **RUFINO**
- **C10** `Hold still.` — **ANA** *(small, beside the viewfinder)*
- **C11** `It was closer in the photo than when I took it.` *(handwritten under the Polaroid)*
- **C12** `Some of them are small.` — **ANA**
- **C13** `I count too many hands.`
- **C14** `All of them are folded.`
- **C15** `Nine days later —`
- **C16** `she walked back out.`
- **C17** `the lake gives back what it takes` *(tagline, on the title card)*
- **C18** `don't answer.` *(button, tiny, last frame)*

---

## 6. Sound-effect placement (cue sheet)

| Time | SFX |
|---|---|
| 0.0 | Boat engine receding (pitch-drop, fades by ~4 s) — "you've been left here" |
| 0–11 | Water lapping, low wind |
| 11–20 | Radio static breathing; a single drip in the corridor |
| **21.0** | **Insects cut to silence** (the game's real tell: silence = something near) |
| 25.6 | Wet sub-vocal breath |
| 20→36 | Accelerating low pulse |
| 29–32.6 | Fire crackle |
| 33–36 | Rising capacitor whine |
| **36.0** | **Shutter clack ×2 + xenon thump + sub-boom** |
| 36.4–42 | Tinnitus ring + photo-paper settle (over silence) |
| 42.0 | Dissonant string stab |
| 43.5–49 | Choral cluster + cloth/folded-hands texture |
| **52.0** | The lake calls **"A-na…"** (procedural two-tone voice) |
| 55–59.6 | Final minor chord |
| 58.6 | A last faint "A-na…" under **"don't answer."** |

---

## 7. Camera-movement recipes for stills

- **Push-in (dread build):** scale 1.04 → 1.13 over the shot, eased out (fast then settle).
  Used on the house, the fire, the Congregation. Never zoom past ~1.16 (upscaling shows).
- **Tilt-reveal (portrait creatures):** on `leanfar` start framed low and drift the image
  **down** so the camera appears to rise up the figure to the head — a slow reveal, not a cut.
- **Dolly (corridor):** straight push down the hall toward the black doorway; the vanishing
  point does the work.
- **Handheld micro-drift (viewfinder):** tiny, slightly irregular translate (±1 %) so the
  aim feels human and nervous while the flash charges.
- **Polaroid settle:** the print enters at scale 1.00 rotated −2°, settles to 1.05 / 0° — as
  if laid down and leaned into.
- **Rule:** every move is *slow and continuous*. No move reverses direction mid-shot; motion
  should feel inevitable, like being pulled toward the water.

---

## 8. The wishlist-maximizing final sequence (50–60 s)

1. **50.0** Fade from black to a lone figure standing in fog (`her`). Very slow push toward it.
2. **50.6** `Nine days later —` (pays off the sister planted at C6).
3. **52.0** The lake says **"A-na…"** — the figure is *her*, and it isn't.
4. **52.4** `she walked back out.` Hold on the figure as the line lands.
5. **55.2** Cut to black; **INALCO** resolves with the minor chord.
6. **56.6** `the lake gives back what it takes`.
7. **58.2** Under it, tiny: **`don't answer.`** + a final faint "A-na…", then cut to black.

The last thing the viewer hears is the lake using a name, and the last thing they read is an
instruction *not* to respond — a rule with an implied cost. That open loop ("what happens if
you answer?") is the click.

**CTA note:** swap the tagline line for your live store CTA at ship — e.g.
`WISHLIST ON STEAM` or `PLAY FREE · itch.io`. Keep it to one short line; don't crowd the tail.

---

*Implemented in `press/teaser.template.html` (seek-driven, deterministic). Build with
`npm run build-teaser`, render the MP4 with `npm run render-teaser` → `press/INALCO-teaser.mp4`.*
