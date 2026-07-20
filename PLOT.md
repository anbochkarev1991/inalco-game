# INALCO — Narrative Redesign: "What the Lake Gives Back"

This document is the complete plot bible and implementation spec. The old plot (satirical
"Rumors" / debunking-podcast comedy) is fully replaced. **No gameplay code changes** — this is
a rewrite of every user-facing string, mapped 1:1 onto existing mechanics.

---

## 1. Tone bible

Influences: Stephen King (grief, ordinary protagonist, a community's buried arrangement),
Lovecraft (an old, indifferent thing in deep water), Clive Barker (the flesh-wrongness of the
returned dead), Dean Koontz (propulsion, a personal stake), James Herbert (cold physical
detail).

Rules:
- **Zero jokes.** No meta-humor, no merch gags, no "the fog poses", no gnome named Rolando,
  no dishwasher-safe irony. Delete all of it.
- Gallows understatement is allowed **only** from Rufino, sparingly, and it must never defuse
  a scare — it should deepen one.
- Ana's lines are those of a frightened, competent adult with a reason to be here. She talks
  to herself the way people alone in the dark actually do: short, practical, cracking slowly.
- Horror is specific and physical: wet hair eight days after a drowning, a face smooth where
  detail was forgotten, a voice that gets the name right and the breathing wrong.
- The prose register is literary but lean. Courier notes read like real documents. Nothing
  winks at the player.

---

## 2. The mythology (the clever core — everything hangs on this)

Lake Nahuel Huapi off Inalco point is glacier-cut, cold, and very deep. Something old lives
in the deep water. It is not malicious. It **collects** — it keeps what drowns. And it is
generous in the way of things that do not understand people: **it gives back.**

Days after a drowning at Inalco, the lake returns the drowned — walking out of the water at
night, in fog. But the lake has never seen a living person, only remembered ones: it rebuilds
the dead **from the memories of those who grieve them**. Memory is imperfect. The Returned
are blurry, wrong-jointed, smooth where no one ever really looked. They seek out the people
who remember them, because those memories are the scaffolding they are built on — and being
near one, it *reads* you (the whisper within 9 m; the composure drain is it thumbing through
your memories).

**Why the camera flash works** (this justifies the core mechanic): a photograph is a memory
that cannot blur. Flash a Returned and for one white instant it is confronted with an exact
record of what it actually is. The image and the thing cannot both be true. Twice, and the
copy loses the argument with itself and comes apart. *"You can't stop them. You can
disprove them."* — Rufino.

**The fog** is the lake remembering out loud. The Returned can only walk when the fog is up.
No boat crosses in fog — not superstition, policy.

**Fire** is for the living: the Returned were rebuilt from bedside memories, lamplight and
grief; open firelight is a context they were never remembered in, and they cannot hold their
shape in it (mechanic: campfire / lantern safe zones).

**The rule**: never answer when the water calls your name. It will get the name right. It
will get the voice right. It is the inside it can't do.

### Backstory layers (revealed through documents, oldest → newest)

- **1943** — Bustillo builds the house for the Aldao family. Their daughter **Delfina, 9,**
  drowns off the point the first winter. Three weeks later she comes back. Her mother opens
  the door. By the following spring the entire family has been taken and given back, one by
  one. The house has stood empty since. Locals keep the grounds anyway — that is the
  **arrangement**: shore fires on fog nights, salt at the thresholds, no burials within sound
  of the water, and no one answers the lake.
- **1944–present** — Eliseo's family has kept the grounds for three generations. The
  gardener's log spans eighty years in three hands (see PROOF 6).
- **The Hitler rumor** — kept as one bitter brushstroke only: the house is famous for a
  stupid lie, and the lie is what keeps bringing cameras. The lake doesn't care why people
  come to the water. Only that they come.
- **9 days ago** — a documentary crew of five arrives to film the myth: director Iván Roque,
  producer **Mara Vidal**, camera op Teo, a drone op (fired day 1 — the lucky one), and sound
  tech **Lucía Reyes — Ana's sister**. Day 5: a night shoot on the water for the network;
  Lucía goes under. Day 7: Lucía comes back. The crew, not knowing the rules, is taken one by
  one. Mara survives because she stopped sleeping and stopped answering.

### Protagonist

**Ana Reyes**, professional photographer (justifies the camera, the flash, the polaroid
captions). Nine days ago her sister Lucía left a garbled voicemail from Inalco — *"the fog
does something to the sound, call me back"* — then nothing. The police say the crew left.
Ana takes the last ferry out with her camera. She misses the return. The intro is played
absolutely straight.

The evidence counter (6 items) becomes **PROOF** — the documents that, assembled, prove what
this place does. The stakes: with enough proof Ana *knows*; with too little she only *hopes* —
and hope is what the lake uses. See §7 (endings).

### The finale twist (what holds the player to the end)

While the boat engine catches (existing 20 s mechanic), the fog makes its last argument:
**Lucía is standing at the end of the dock, calling Ana's name.** Whether Ana survives this
is decided by what the player found — knowledge is the only weapon that matters in the end.

---

## 3. The enemies (internal keys `testigo` / `doble` / `archivero` stay — display names change)

All three are **the Returned**. `PHOTO_CAPTIONS` display names:

- **`testigo` → "THE HALF-SEEN"** (lunges, then freezes when observed): a Returned rebuilt
  from a single glimpse — someone nobody ever really looked at, so it is mostly posture and
  wet hair. Being looked at pins it: observation is the only detail it has.
  Caption: `FRAME 01 — it held still for the flash. Subjects do not do that.`
- **`doble` → "THE DRAFT"** (only moves off-camera): not one of the dead — the lake's
  **practice copies of the still-living**, made from what it has read out of you already. It
  cannot yet do "being watched"; that part of you is unfinished. (This is why Mara needs her
  badge — see §5.)
  Caption: `FRAME 02 — it was closer in this photo than it was when I took it.`
- **`archivero` → "THE CONGREGATION"** (slow, guards objectives, takes 3 exposures): the
  oldest Returned — remade so many times across eighty years it is a composite of everyone's
  dead. It does not chase. It stands near what you need and waits to be recognized by
  someone. Anyone.
  Caption: `FRAME 03 — I count too many hands. All of them are folded. It is being patient.`

Comment header in `enemies.js` rewritten to match (the Returned; rebuilt from grief;
photographs disprove them).

---

## 4. Full document spec — all 17 notes (`NOTES` in story.js)

Keys, positions, meshes, and `evidence` flags are unchanged. `kind` strings change:
`EXHIBIT n/6` → **`PROOF n/6`**. Content briefs below; the writer expands each into the
final note body in the established Courier document register. Bodies marked **[EXACT]**
should be used nearly verbatim (they are load-bearing).

1. **`schedule`** (dock sign, repeatable) — timetable, then stamped: `NO CROSSINGS IN FOG.
   NO EXCEPTIONS.` and handwritten beneath: `do not wait on the dock after dark. — R.`
2. **`stub`** (PROOF 1/6) — **Lucía's outbound ferry ticket**, dated nine days ago, return
   leg unused. On the back, in her handwriting, sound-tech notes: hydrophone pass at 22:00 —
   *"there's something on the low channel. under the boat. it's wide."* Establishes the
   sister and the hook in the first two minutes.
3. **`kioskNote`** — Rufino's note, straight: kiosk closed; spare key to the big house under
   the garden gnome ("paint's gone; he outlasted four owners"); *"if the fog comes up while
   you're on the grounds, my fire is on the east beach. Walk to it, don't run. And whatever
   you hear from the waterline — it isn't what it says it is. — R."*
4. **`mug`** (PROOF 2/6) — an enamel mug from the crew's camp kit, ring of dried mate,
   **"L.R."** in nail polish on the base. Lucía's. Ana's pickup line reacts (see §6).
5. **`callsheet`** (porch) — HUNTING THE FÜHRER, S07E01, **Day 1**. Mundane logistics, five
   crew names listed (Roque, Vidal, Teo, drone op, **L. Reyes — sound**). One wrong line:
   the drone op swears the fog moved against the wind; Roque fired him and put him on the
   morning ferry. *(He is the only one who left.)*
6. **`hallNote`** — **Day 3.** Audio trouble: a voice under every take, on every channel,
   too low to make out. *"Teo says pipes. Pipes don't wait for you to stop talking."*
7. **`bedNote`** — **Day 5**, hours before the drowning. The network wants *something*.
   Roque schedules a night shoot on the water. *"Lucía says the low channel is a voice and
   she can get it clean from the boat. Iván says God loves a night shoot. Ratings."*
8. **`deed`** (PROOF 3/6) — property deed, 1943, Aldao family; **1944 addendum**: transfer
   to a groundskeeping trust for one peso, with covenants — a fire to be kept on the shore
   on fog nights; salt at every threshold; **no interments within sound of the water**; and
   the last covenant in a shaking hand: *"no member of this family is to be admitted to the
   property after March. Not one of us. Regardless of what we say."*
9. **`archiveLetter`** — from the regional archive, typed, courteous, terrifying **[EXACT
   in spirit]**: *"Regarding your enquiry: the Aldao family did not emigrate in 1944. There
   is no record of them after that March. There are five death certificates. There are no
   bodies attached to any of them. This office no longer certifies drownings at Inalco.
   Please do not write to us again."*
10. **`groceries`** (PROOF 4/6) — caretaker's list, 1962: candles, thread, salt, salt,
    coarse salt — then, in a different pencil at the bottom: *"it learned the fence. fire
    only now."*
11. **`manual`** (shed) — generator manual, `DO NOT RUN THE GENERATOR AFTER DARK` — crossed
    out by the crew: *"we need the lights."* Under that, later, smaller: *"the lights bring
    them up to the windows. they stand exactly where the light ends. measure it. — T."*
12. **`bill`** (PROOF 5/6) — **Prefectura Naval incident report, 8 days ago** (replaces the
    utility bill; same paper mesh): REYES, L., 31, lost from a hired boat at 23:40; search
    36 hours; then the stamp `CASE CLOSED — SUBJECT SEEN ASHORE`, with the keeper's typed
    remark: *"subject observed walking ashore 03:10, declined assistance, walked toward the
    house."* Ana's pickup line: nobody walks ashore after thirty-six hours in that water
    (see §6).
13. **`diary`** (PROOF 6/6, book, greenhouse) — **the gardener's log, eighty years, three
    hands.** Excerpts: 1944, first rules, first hand. 1981, second hand, an entry that stops
    mid-word — and the third hand resumes **the next day**: *"Papa came to the window last
    night. I did not open."* Final entry, current, third hand **[EXACT]**: *"Five new ones
    this week. The young one with the recorder stands at the tideline all night, looking at
    the house. She is waiting for someone. God help whoever she is waiting for."*
14. **`greenNote`** — the crew's last note, **Day 8(?)**, greenhouse. Terror, no jokes:
    call sheet says five, the writer counts two. Iván answered the water yesterday — walked
    in up to the collar, talking to it like it was a person. And the mechanic, taught
    diegetically **[EXACT in spirit]**: *"If you find this — the flash. Teo worked it out
    before they took him back: a photograph is a memory that can't blur. TWO FLASHES. It
    argues with itself. You have to win the argument."*
15. **`bhInventory`** (boathouse) — inventory, straight; boat chained **by order of the
    Prefectura pending the search**; key held by the caretaker — study desk, main house.
    Last line: *"if you must take the boat at night: do not cut the engine for anything you
    see on the water. Anything. — R."*
16. **`finalNote`** (THE LAST PAGE) — **Lucía's sound log, Day 5**, hours before the water.
    Warm, alive, her voice on paper. She mentions Ana: *"Ana would love this fog. She'd
    shoot it for a week and complain the whole time."* Then the low-channel transcription
    attempt **[EXACT in spirit]**: *"it isn't language. it's too many languages. it's every
    voice this lake has kept, all at once. — it knows my name. it says my name in Mamá's
    voice."* Ana's reaction line after closing it (see §6). This is the gut of the game.
17. **`plaque`** — historical plaque, straight: Bustillo, 1943, fine example of lake
    architecture. One etched line, added unofficially, that locals never removed:
    *"The house has done nothing. It is the water."*

---

## 5. NPCs — same tree structure, every node rewritten

**HARD CONSTRAINT:** in `RUFINO_TREE`, `MARA_TREE`, `ELISEO_TREE`, keep every node key,
choice count, choice order, `next` / `end` / `effect` exactly as-is. The headless test
(`scripts/play.mjs`) walks these trees by keypress. Only `who` and `text` and choice
`label` strings change. NPC display names in `npcs.js` stay (`RUFINO`, `MARA VIDAL`,
`DON ELISEO`).

### RUFINO — the fire-keeper
Kiosk owner; third generation of the arrangement. His older brother **Nicanor** drowned in
'81 and came back; twelve-year-old Rufino was the one who didn't open the door. His parents
did. He keeps the fire the way other men keep a promise. Voice: flat, kind, unhurried; the
understatement of a man who has been right about something terrible his whole life.
- `first`: he already knows why a woman with a camera came alone on the last ferry.
- `what`/`how` nodes carry the mythology: the lake gives back what drowns, rebuilt from
  the mourners' memory — *"That's why they're blurry, señorita. Nobody remembers anybody
  right."* — and the camera rule: *"You can't stop them. You can disprove them. Twice."*
- `quest` (thermos, unchanged flags): he lent his thermos to "the girl hiding in the glass
  house" — the one the fog hasn't taken *because she's stopped sleeping, and you can't read
  a book that won't hold still."*
- `thermos`/`thermos2` (his promised "truth", the game's thesis, **[EXACT in spirit]**):
  *"Whatever calls your name from the water tonight — and tonight it will — it gets the
  name right. It gets the voice right. It's the inside it can't do. You knew her inside.
  Hold on to that, and don't answer."* (He says *her*. He knows.)

### MARA VIDAL — the survivor
Producer; eight days without real sleep; brittle, fast, guilt-eaten. **She scheduled the
night shoot** — the network needed *something*, and Lucía could get the voice clean from
the boat. Every death is on her spreadsheet and she knows it. She knew Lucía; when she
learns Ana's surname (Ana's `podcast` choice-label becomes *"I'm Ana. Ana Reyes — Lucía's
sister."*), it should land like a blow (`podcast` node text = her reaction to the name).
- The **tape**: the camera was rolling when Lucía went under — and still rolling two nights
  later when she walked back out. Both are on the master tape. The tape is warm. Tape
  should not be warm.
- Tape stance nodes (destroy / take / none) become genuinely hard: destroying it means
  burning the only footage of Lucía alive; taking it means Ana will watch it, and watching
  is remembering, and **remembering is what feeds them the scaffolding**.
- The **badge** quest, reframed dark: on day 8 Mara met herself on the lawn, and the other
  one walked like her but stood too still. The badge — her name, her face, laminated — is
  how she tells which one she is when she wakes. She will not cross the grounds without it.
- `badgeBack` and fate nodes (`doBurn`/`doTake`/`doKeep`) rewritten to match; `atFire`:
  the tape burned green — *"seven weeks of her, gone. It's the kindest thing I've ever
  done. I hate it."*

### DON ELISEO — the keeper of the log
The gardener; third hand of the log. Old, precise, unafraid in the way of a man who has
kept the same appointment for fifty years. The **arrayán** grows over **Delfina Aldao's
grave** — the family buried her a second time in '44 when they understood, inside the sound
of the water, which is why the covenant exists. The TV crew wired the tree to a stake for a
lighting rig. The dead girl kept her side of the arrangement for eighty years; she should
not be in wire. (Quest unchanged: cut the wire.)
- `promise` node (flags unchanged: `silence` / `tell` / none): the promise becomes the
  finale's dramatic setup **[EXACT in spirit]**: silence = *"When you are on the water and
  it calls you — and it will call you in her voice — you do not answer. You do not look
  back. Promise me the not-looking."* / tell = *"Then tell her mother she drowned. Drowned
  only. The rest of it dies with the ones who saw it."*

---

## 6. Ana's spoken lines, objectives, triggers, deaths, endings

### Intro (`INTRO_SCRIPT` in main.js, same beat timing)
1. `Lake Nahuel Huapi, Patagonia. The last ferry of the day.`
2. Ana: nine days since Lucía's voicemail; the police say the crew left; crews don't leave
   their sound tech's ticket on the dock. She's here with the camera because it's the only
   thing she knows how to point at the dark.
3. Ana: `One night. Photograph everything, find someone who'll talk, take the 18:45 back.`
4. (horn) The ferry is leaving early — **before the scheduled time** — and the ferryman is
   looking at the fog, not at her, as he goes.
5. `He saw the fog and he ran. Whatever everyone here knows, nobody waited to tell me.`

### Key beats (same trigger/item hooks, new lines — briefs)
- First static trigger: her recorder picking up a voice when it isn't on — *it's Lucía's
  recorder* (she carries it now). Chilling, personal.
- Gnome/key: no jokes. A garden gnome with the paint weathered off; the key beneath it;
  the scream in the fog right after (existing scare hook) gets a straight reaction.
- Front door / house lines: the famous house, aggressively ordinary, and the wrongness of
  a piano in tune (existing piano hook: *someone keeps it tuned; the note said nobody has
  lived here since 1944*).
- Power-on line: the lights come on and the fog leans in — see `manual` note ("they stand
  where the light ends").
- `onDissolve` (main.js): `It couldn't hold itself together in front of the picture. Teo
  was right. It argues — and it can lose.`
- First-photo line (main.js): the polaroid shows more than she saw — wet, wrong, patient.
- Boat/finale lines: straight dread; during the engine timer the objective text stays
  mechanical while the subtitles carry the fear.
- Death screen: `SIGNAL LOST` → **`THE FOG CLOSES`**; `[E] TAKE TWO` → **`[E] GET UP`**.
- `DEATH_LINES` (4, rewritten): e.g. *"The fog sets you down gently. It has had eighty
  years of practice."* / *"Somewhere, someone who loves you begins remembering you very
  clearly. That is all it needs."* / *"The search will be suspended after thirty-six
  hours."* / *"You will be given back. You will be almost right."*

### Endings (`endingText()` — same structure: main block by evidence ≥5, then epilogue
blocks from the same flags)

Header: `EPISODE 43 — ...` is gone. Replace with a quiet title card style:
`INALCO — NIGHT OF THE 6TH — ANA REYES` (photographer's contact-sheet framing).

- **≥5 proofs — "WHAT THE LAKE KEEPS"** (the earned ending): as the boat pulls out, Lucía
  is at the end of the dock, exactly as remembered, calling Ana's name — and Ana has read
  the deed, the report, the log. She knows the rule. She looks at it **through the camera
  instead of her eyes** and takes one photograph. The flash shows what is actually standing
  there: tall, patient, still dripping after eight days. She does not turn the boat. Final
  lines: grief, but clean — she gets to mourn a sister instead of feeding a memory to the
  lake. She keeps the photograph. No one will ever believe it. That was never the point.
- **<5 proofs — "WHAT THE LAKE GIVES BACK"** (the damnation ending): Ana hears her name.
  She didn't find enough. She doesn't *know* — she only hopes, and hope is the door.
  The engine has caught, and she turns the boat around. Final lines **[EXACT in spirit]**:
  *"The lake is generous. The lake gives everything back. Ask it for your sister and it
  will give you your sister, as well as it remembers her. And it remembers you better
  every minute."* Fade.

Epilogue blocks (same flags): Mara burned the tape / carries it (the bag is warm; watching
is remembering) / holds it undecided / was left in the greenhouse (the call sheet counts to
four, then quietly back to five). Eliseo's promise kept: silence = Ana never answers, and
somewhere a wire scar heals over Delfina's tree; tell = a mother is told "drowned, only."
Rufino's fire still burning as she clears the point — one raised hand; the fire-keeper's
watch goes on. The final footer line (replaces the Nazi joke): **`The lake keeps what it
is given. Give it nothing.`**

---

## 7. UI / meta text (index.html, ui.js, README.md)

- `<title>` + title screen: `INALCO` stays; subtitle `a Patagonian ghost story` →
  **`the lake gives back what it takes`**; place line stays; `HEADPHONES RECOMMENDED` stays.
- Pause screen hint `(rumors hate scrutiny)` → `(two flashes disproves one of them)`.
- Death screen per §6. End screen title `INALCO` stays.
- README.md: rewrite the description/premise sections to the new plot (keep run/test docs).

---

## 8. Implementation constraints (for the implementing model)

1. **Strings only.** Do not change any identifier, node key, item id, position, flag,
   effect wiring, timing, `hold` duration, evidence flag, mesh, or function signature.
   `EV_TOTAL`, quest state machines, `entry`-selection logic in `talkTo` — untouched.
2. Dialogue trees: same node keys, same choice counts and order, same `next`/`end`/`effect`.
3. Internal enemy kinds `testigo`/`doble`/`archivero` stay as keys everywhere.
4. All text English-only (established project rule); Spanish proper nouns and "señorita"
   flavor in NPC speech are fine.
5. Update stale comments that reference the old plot (top of enemies.js, npcs.js, story.js).
6. Files to touch: `src/story.js`, `src/main.js`, `index.html`, `README.md`, plus comment
   headers in `src/enemies.js`. Nothing else.
7. Verify with: `npm run dev` + `node scripts/play.mjs` (all existing assertions must pass),
   and a grep sweep confirming no leftovers: `Rolando`, `podcast`, `Episode 43`, `EXHIBIT`,
   `rumors hate scrutiny`, `No Nazis`, `MY GRANDPA SAW`, `honey`, `TAKE TWO`.
