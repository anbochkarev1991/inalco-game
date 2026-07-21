import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT, TUNE } from './config.js';
import { canvasTexture } from './world.js';
import { spawn } from './assets.js';
import { journal } from './journal.js';

// ----------------------------------------------------------- written content

const EV_TOTAL = 6;

// Mara's walk routes (Part B). Authored waypoints from the greenhouse to each
// destination so she never wades into the lake or clips a wall — no nav-mesh,
// the same way the Returned steer without pathfinding; validated on-terrain
// (all points dry). The greenhouse door is on its WEST wall (x≈30, z≈-26); both
// routes leave through it and only THEN turn, so she never crosses a wall.
// On the boathouse walk she is a target the WHOLE way: a Returned reaches for
// her repeatedly, ONE at a time, up to MARA_ESCORT_MAX for the episode — with
// the ambient Returned suppressed so a new player isn't overwhelmed.
const MARA_ESCORT_MAX = 5;
const MARA_ROUTE_BOAT = [
  { x: 34, z: -26 },     // [0] centre aisle, heading for the west door
  { x: 30, z: -26 },     // [1] the west door gap
  { x: 27, z: -25 },     // [2] just outside the greenhouse
  { x: 24, z: -20 },
  { x: 10, z: 4 },
  { x: -6, z: 26 },
  { x: -26, z: 46 },
  { x: LAYOUT.boathouse.x + 3.0, z: LAYOUT.boathouse.z - 2.6 },   // boathouse walkway
];
const MARA_ROUTE_FIRE = [
  { x: 34, z: -26 },     // centre aisle
  { x: 30, z: -26 },     // west door
  { x: 27, z: -25 },     // outside
  { x: 22, z: -6 },
  { x: 18, z: 20 },
  { x: 17, z: 44 },
  { x: LAYOUT.camp.x, z: LAYOUT.camp.z + 1.35 },                  // Rufino's south log
];

export const PHOTO_CAPTIONS = {
  testigo: 'FRAME 01 — "THE HALF-SEEN". It held still for the flash. Subjects do not do that.',
  doble: 'FRAME 02 — "THE DRAFT". It was closer in this photo than it was when I took it.',
  archivero: 'FRAME 03 — "THE CONGREGATION". I count too many faces. Every mouth is open, mid-hymn. It is being patient.',
};

const DEATH_LINES = [
  'The fog sets you down gently. It has had eighty years of practice.',
  'Somewhere, someone who loves you begins remembering you very clearly. That is all it needs.',
  'The search will be suspended after thirty-six hours.',
  'You will be given back. You will be almost right.',
];

const NOTES = {
  schedule: {
    kind: 'DOCK SIGN', title: 'INALCO TOURS — timetable',
    body: 'dep. 9:00 · 13:00 · 18:45\n\nNO CROSSINGS IN FOG. NO EXCEPTIONS.\n\ndo not wait on the dock after dark.\n— R.',
  },
  stub: {
    kind: 'PROOF 1/6', title: 'Lucía’s ferry ticket. Return leg unused.',
    body: 'INALCO TOURS — round trip.\nOutbound: nine days ago. Return: 18:45. Seat 4. Unused.\n\nOn the back, in her handwriting — sound-tech notes:\n\nhydrophone pass, 22:00. there’s something on the low channel. under the boat. it’s wide.',
    evidence: true,
  },
  kioskNote: {
    kind: 'KIOSK NOTE', title: 'Taped to the counter',
    body: 'Gone to town. Back Tuesday.\n\nSpare key to the big house: under the gnome. Paint’s gone off him — he’s outlasted four owners.\n\nIf the fog comes up while you’re on the grounds, my fire is on the east beach. Walk to it. Don’t run.\n\nAnd whatever you hear from the waterline — it isn’t what it says it is.\n— R.',
  },
  mug: {
    kind: 'PROOF 2/6', title: 'Camp mug',
    body: 'White enamel mug, chipped at the rim. A ring of dried mate stains the inside.\n\nScratched into the base, in nail polish: L.R.\n\nIt still smells faintly of yerba.',
    evidence: true,
  },
  callsheet: {
    kind: 'FOUND NOTE', title: 'Call sheet — Day 1',
    body: 'HUNTING THE FÜHRER — S07E01\n"THE LAKE HOUSE OF SECRETS(?)"\n\nCrew, Day 1:\nIván Roque — director\nMara Vidal — producer\nTeo — camera\n[drone op] — aerial\nL. Reyes — sound\n\nB-roll of the lake, the jetty, the shutters. Drone op swears the fog moved against the wind on the last pass — nobody backs him up. Iván puts him on the morning ferry.\n\nFour of us left on the point tonight.',
  },
  hallNote: {
    kind: 'FOUND NOTE', title: 'Production notes — Day 3',
    body: 'Audio problem. Every take, every channel — under the dialogue, low, just at the edge of make-out.\n\nLucía’s pulled it forward in three different mixes. Still can’t tell if it’s a word.\n\nTeo says pipes. Pipes don’t wait for you to stop talking.',
  },
  bedNote: {
    kind: 'FOUND NOTE', title: 'Production notes — Day 5',
    body: 'Nothing usable in four days. Network wants SOMETHING by the ratings meeting.\n\nLucía says the low channel is a voice, and she can get it clean if she’s over the water instead of on the shore. Iván likes that. Iván likes anything that sounds like a plan.\n\nNight shoot. The boat. Tonight.',
  },
  deed: {
    kind: 'PROOF 3/6', title: 'Property deed, 1943',
    body: 'Estancia Inalco. Bustillo, architect. Aldao family, owners.\n\n1944 ADDENDUM — transfer of the property to a groundskeeping trust, consideration: one peso. Covenants attached:\n\n— a fire to be kept on the shore on every night of fog\n— salt laid at every threshold of the house\n— no interments within sound of the water\n\nAnd, in a hand that does not match the rest, pressed hard enough to tear the page:\n\n"no member of this family is to be admitted to the property after March. Not one of us. Regardless of what we say."',
    evidence: true,
  },
  archiveLetter: {
    kind: 'LETTER', title: 'From the regional archive',
    body: 'Regarding your enquiry:\n\nThe Aldao family did not emigrate in 1944. There is no record of them after that March. There are five death certificates. There are no bodies attached to any of them.\n\nThis office no longer certifies drownings at Inalco.\n\nPlease do not write to us again.\n\n— Regional Archive, Bariloche',
  },
  groceries: {
    kind: 'PROOF 4/6', title: 'Caretaker’s list, 1962',
    body: '— candles\n— thread\n— salt\n— salt\n— coarse salt\n\nIn a different pencil, pressed lighter, at the bottom:\n\nit learned the fence. fire only now.',
    evidence: true,
  },
  manual: {
    kind: 'FOUND NOTE', title: 'Generator manual + crew note',
    body: 'Manual, page 12:\nDO NOT RUN THE GENERATOR AFTER DARK.\n\nCrossed out. In marker, underneath:\nwe need the lights.\n\nBelow that, later, smaller, in pencil:\n\nthe lights bring them up to the windows. they stand exactly where the light ends. measure it.\n— T.',
  },
  bill: {
    kind: 'PROOF 5/6', title: 'Incident report, Prefectura Naval',
    body: 'REYES, Lucía — 31. Lost from a hired boat, 23:40, eight nights ago. Search conducted, 36 hours, negative.\n\nSTATUS: CASE CLOSED — SUBJECT SEEN ASHORE\n\nKeeper’s remark, typed:\n\n"subject observed walking ashore 03:10, declined assistance, walked toward the house."',
    evidence: true,
  },
  diary: {
    kind: 'PROOF 6/6', title: 'Gardener’s log, three hands',
    body: '1944, first hand:\nThe rules, so my son will not have to learn them the way I did. Fire on fog nights. Salt at every door. Never answer the water.\n\n1981, second hand:\nPapa came to the win—\n\n[the hand stops here. resumes the next day, a third hand:]\n\nPapa came to the window last night. I did not open.\n\nCurrent, third hand:\nFive new ones this week. The young one with the recorder stands at the tideline all night, looking at the house. She is waiting for someone.\n\nGod help whoever she is waiting for.',
    evidence: true,
  },
  greenNote: {
    kind: 'FOUND NOTE', title: 'Production notes — Day 8(?)',
    body: 'Day 8. Maybe 9. The call sheet says five. I count two, and one of us is me.\n\nIván answered the water yesterday. Walked in up to the collar, talking to it like it was a person giving notes.\n\nIf you find this — the flash. Teo worked it out before they took him back: a photograph is a memory that can’t blur. TWO FLASHES. It argues with itself.\n\nYou have to win the argument.',
  },
  bhInventory: {
    kind: 'FOUND NOTE', title: 'Boathouse inventory',
    body: 'Inventory, winter season:\n\n— 1 boat (chained by order of the Prefectura, pending the search)\n— 2 oars\n— 1 chain\n— life vests: 2\n— keys: with the caretaker, study desk, main house\n\nIf you must take the boat at night: do not cut the engine for anything you see on the water. Anything.\n— R.',
  },
  finalNote: {
    kind: 'THE LAST PAGE', title: 'Lucía’s sound log — Day 5',
    body: 'Getting good tape tonight, finally. The fog does something to the low end — everything sounds like it’s underwater before it even gets wet.\n\nAna would love this fog. She’d shoot it for a week and complain the whole time.\n\nTried to transcribe the low channel again. Giving up on "voice" as a word for it:\n\nit isn’t language. it’s too many languages. it’s every voice this lake has kept, all at once.\n\nit knows my name.\n\nit says my name in Mamá’s voice.',
  },
  plaque: {
    kind: 'HISTORICAL PLAQUE', title: 'ESTANCIA INALCO',
    body: 'Designed by Alejandro Bustillo, 1943.\n\nA fine example of Patagonian lake architecture.\n\nScratched beneath the plate, unofficial, never removed:\n\n"The house has done nothing. It is the water."',
  },
  sittingNote: {
    kind: 'FOUND NOTE', title: 'Production notes — Day 4',
    body: 'Teo swears he hears a kid crying in the walls at night. Low, hitching, never stops for breath.\n\nWe walked every room with the boom. Nothing on tape where he pointed. Everything on tape everywhere else.\n\nMara found a door behind the house nobody remembered. Goes down. We are not going down.',
  },
  corridorNote: {
    kind: 'FOUND NOTE', title: 'Scrap, pinned to the hall',
    body: 'I counted the rooms three times and got a different number each time. I am tired. That is all this is.\n\nThe hallway is longer at night. That is also all this is.\n\nDon’t use the back door after dark. — M.',
  },
  pantryNote: {
    kind: 'FOUND NOTE', title: 'Caretaker’s reminder',
    body: 'Salt across every threshold before the fog. The back door twice — it forgets.\n\nThe little one in the cellar is not to be spoken to. She will ask you to. She will make it very easy.\n\nAnswer nothing. Keep your questions to yourself. She keeps count of theirs.',
  },
  cellarNote: {
    kind: 'CHALK ON STONE', title: 'A child’s hand, on the cellar wall',
    body: 'a drawing: a tall woman by the water, holding a small hand. the small figure has no face, only two black circles for eyes.\n\nunder it, in an adult’s hand, pressed hard:\n\nSHE ASKS. DON’T LET HER GET TO FIVE.\n\nnearer the floor, chalk almost gone:\n\ni asked six. i’m sorry.',
  },
  // ---- b1: unmarked discovery notes (NOT evidence — like sittingNote) ----
  campNote: {
    kind: 'FOUND NOTE', title: 'A page in Lucía’s sleeping bag',
    body: 'We set the tents on the east beach, by the old man’s fire. He wouldn’t come near our camp. Said we’d pitched it too close to the water, and he wasn’t going to stand around and watch.\n\nTeo leaves the camera running on the tripod all night now. Says the tape shows things standing just past our light that none of us saw standing there. Says he’d rather it watched than us.\n\nThe red light’s still on. It’s been on for days.\n\nI keep the recorder in the bag with me. Ana gave it to me. When it gets bad I press play and it’s just her, complaining about the cold. It helps.',
  },
  graveNote: {
    kind: 'GRAVESTONE', title: 'DELFINA ALDAO — 1934–1944',
    body: 'The stone is half-swallowed by the arrayán’s roots. The tree has grown around it, the way you hold onto something you were told never to let go of.\n\nCarved beneath the dates:\ntaken by the water, given back, laid down a second time.\n\nA caretaker’s plate, screwed to the back, in a careful old hand:\n\n"We buried her here in the spring of ’44 — the second time — before we understood. Too near the water. She did not stay down.\n\nAfter her, we laid the others up the hill, out of the lake’s hearing, and they have kept. Let no one be buried within sound of it again. That is the whole of the rule, and the reason for it."',
  },
  cemeteryNote: {
    kind: 'WEATHERED MARKER', title: 'On the hill, above the fog',
    body: 'A dozen stones lean among the pines, well above the waterline. The dates cluster in a single year: 1944. Aldao. Aldao. Aldao — a whole family — and, later, the hands that kept the grounds after them.\n\nAn iron marker, rust-scabbed, still legible:\n\n"Here, and no lower. The dead keep better out of the lake’s hearing. We come up the hill to grieve, and we go back down before dark.\n— the keepers of Inalco"\n\nSomeone carried them all the way up here to bury them where the water couldn’t reach in and remember them.\n\nIt worked. These ones stayed where they were put.',
  },
  // ---- b3: a scrap that appears in a room you already cleared, later in the night
  hallScrap: {
    kind: 'A LOOSE PAGE', title: 'Face-up on the table — it was not here before',
    body: 'A page, squared to the table edge. This room was empty on the first pass through it. I would have seen it.\n\nThe crew’s block capitals — the ones they slated shots with. But the pencil hasn’t set. It smears under a thumb.\n\nIT COUNTED THE ROOMS WITH YOU.\nIT LIKES THAT YOU CAME BACK.\n\nBeneath, pressed nearly through the paper:\n\ndon’t leave anything here you would want given back.',
  },
};

// -------------------------------------------------------------------- meshes

function paperMesh(tint = 0xd8d2bc) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.3),
    new THREE.MeshLambertMaterial({ color: tint, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI;
  return m;
}
function mugMesh() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 10),
    new THREE.MeshLambertMaterial({ color: 0xd9d4c8 }));
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10),
    new THREE.MeshLambertMaterial({ color: 0x2a1e16 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.056;
  g.add(cup, top);
  return g;
}
function bookMesh() {
  return new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
}
function fuelCanMesh() {
  return spawn('metal_jerrycan', { ry: 0.6 });
}
function thermosMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 10),
    new THREE.MeshStandardMaterial({ color: 0x2e5a3c, roughness: 0.5, metalness: 0.4 }));
  body.position.y = 0.12;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.048, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0x9aa39b, roughness: 0.4, metalness: 0.6 }));
  cup.position.y = 0.26;
  g.add(body, cup);
  return g;
}
function badgeMesh() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.13),
    new THREE.MeshLambertMaterial({ color: 0xd8d4c8 }));
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.2),
    new THREE.MeshLambertMaterial({ color: 0x8a3030 }));
  strap.position.set(0, 0.002, -0.14);
  g.add(card, strap);
  return g;
}

let markerTex = null;
function makeMarker(warm) {
  if (!markerTex) {
    markerTex = canvasTexture((c, W, H) => {
      const g = c.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(255,252,244,1)');
      g.addColorStop(0.35, 'rgba(255,250,235,.4)');
      g.addColorStop(1, 'rgba(255,248,230,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }, 64, 64);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: markerTex, color: warm ? 0xffe6b8 : 0xbfe0e8,
    transparent: true, opacity: 0.1, depthWrite: false,
  }));
  s.scale.setScalar(0.16);
  return s;
}

// ----------------------------------------------------------- dialogue trees
// Effects receive the Story instance and mutate quest flags directly.

const RUFINO_TREE = {
  first: {
    who: 'RUFINO',
    text: 'Sit down before you fall down. You look like the fog’s been reading you — that’s not a figure of speech, by the way.',
    effect: (s) => { s.met.rufino = true; },
    choices: [
      { label: 'You’re... real? A person?', next: 'real' },
      { label: 'You’re the kiosk man. Your gnome had my house key.', next: 'gnome' },
      { label: '(say nothing. warm your hands.)', next: 'quiet' },
    ],
  },
  real: { who: 'RUFINO', text: 'Real as unpaid taxes. Rufino. Third generation keeping this kiosk, third generation keeping that fire lit on fog nights. It’s not the interesting part of the job. It’s the part that matters.', next: 'fog' },
  gnome: { who: 'RUFINO', text: 'Bought him thirty years ago. Paint wore off before I did. He’s outlasted four owners of that house, and he’ll outlast you and me both. That’s not nothing, out here.', next: 'fog' },
  quiet: { who: 'RUFINO', text: '...Good instinct. Talk feeds it. Fire doesn’t.', next: 'fog' },
  fog: {
    who: 'RUFINO',
    text: 'You want to ask about what walks in the fog. Most people are too polite to. You didn’t come all this way to be polite.',
    choices: [
      { label: 'What are they?', next: 'what' },
      { label: 'How do I stop them?', next: 'how' },
      { label: 'I’m fine. Nothing followed me.', next: 'followed' },
    ],
  },
  what: { who: 'RUFINO', text: 'The lake keeps what it drowns. Days later it gives it back — walks it right up onto the beach. But the lake never met a living person, señorita. Only remembered ones. It builds them out of whoever’s still grieving. That’s why they’re blurry. Nobody remembers anybody right.', next: 'how' },
  how: { who: 'RUFINO', text: 'You can’t stop them. You can disprove them. A photograph is a memory that can’t blur — flash one, and for one second it has to look at exactly what it is. Do it twice and it loses that argument with itself.', next: 'quest' },
  followed: {
    who: 'RUFINO', text: 'The fog behind you disagrees with that, señorita.',
    effect: (s) => { s.staticSpike = Math.max(s.staticSpike, 0.7); s.fx.glitch = Math.max(s.fx.glitch, 0.4); },
    next: 'quest',
  },
  quest: {
    who: 'RUFINO',
    text: 'Do an old man a favor. My thermos — green, dented, more sentimental than it has any right to be. I lent it to the girl hiding in the glass house down there. Bring it back and I’ll owe you a truth.',
    choices: [
      { label: 'The girl in the greenhouse? Someone’s ALIVE in there?', next: 'alive', effect: (s) => s.startRufinoQuest() },
      { label: 'I’ll get your thermos.', next: 'deal', effect: (s) => s.startRufinoQuest() },
      { label: 'I don’t run errands.', next: 'noerrand' },
    ],
  },
  alive: { who: 'RUFINO', text: 'Alive. Hasn’t slept in eight days, and it hasn’t taken her, so I’m not about to tell her to stop. Won’t touch the mate I left her — too busy reading the same page over and over. Can’t read a book that won’t hold still, I suppose. My fire’s here when it gets loud out there.', end: true },
  deal: { who: 'RUFINO', text: 'Good. The fire’s here when it gets loud out there. It doesn’t ask questions, and neither do I, mostly.', end: true },
  noerrand: { who: 'RUFINO', text: 'Fair enough. The offer stands, same as the thermos — wherever she left it.', end: true },
  // return visits
  remind: { who: 'RUFINO', text: 'Greenhouse. Green thermos. The girl who won’t sleep. In that order, or any order.', end: true },
  thermos: {
    who: 'RUFINO',
    text: 'There it is. Dent’s still in it. Sit down a second — you earned the truth I promised. Whatever calls your name off the water tonight, and it will, it gets the name right. It gets the voice right.',
    effect: (s) => s.finishRufinoQuest(),
    next: 'thermos2',
  },
  thermos2: {
    who: 'RUFINO',
    text: 'It’s the inside it can’t do. You knew her inside — the way she laughed before she finished the joke, the dumb things she was afraid of. Hold on to that, and don’t answer. Here — proper mate. Steadies the hands.',
    choices: [
      { label: 'That’s it? That’s the truth?', next: 'thatsit' },
      { label: 'Thank you, Rufino.', next: 'thanks' },
    ],
  },
  thatsit: { who: 'RUFINO', text: 'That’s the one nobody prints.', end: true },
  thanks: { who: 'RUFINO', text: 'Kiosk reopens Tuesday. Come by — I’ll have the fire going either way.', end: true },
  idle: { who: 'RUFINO', text: 'Fire’s warm. Fog’s patient. We’re still here, more or less.', end: true },
  maraAtFire: { who: 'RUFINO', text: 'She chose the fire. Wisest thing anyone off that crew has done all week. Drink your mate, both of you.', end: true },
};

const MARA_TREE = {
  first: {
    who: 'MARA VIDAL',
    text: '(a headlamp clicks. dead.) Don’t say her name. Don’t say the house’s name either — I don’t know which one it’s listening for. That’s rule one.',
    effect: (s) => { s.met.mara = true; },
    choices: [
      { label: 'Rule one according to whom?', next: 'rules' },
      { label: 'I’m Ana. Ana Reyes — Lucía’s sister.', next: 'podcast' },
      { label: '(whisper) You’re the fifth crew member.', next: 'fifth' },
    ],
  },
  rules: { who: 'MARA VIDAL', text: 'According to eight days without sleep, and four coworkers who aren’t answering anymore.', next: 'tape' },
  podcast: { who: 'MARA VIDAL', text: '(she goes very still.) Reyes. ...Lucía talked about you. Said her sister would hate this fog and photograph it anyway. God. You look like her when you swallow.', next: 'tape' },
  fifth: { who: 'MARA VIDAL', text: 'Fifth of five, technically. The call sheet still says five. Every morning I cross my own name off it, and every morning it’s back.', next: 'tape' },
  tape: {
    who: 'MARA VIDAL',
    text: 'I kept the master tape. The camera was rolling when Lucía went under. It was still rolling two nights later, when she walked back out. Both of those are on the same reel, in my bag, and the bag is WARM, Ana. Tape should not be warm.',
    choices: [
      { label: 'Destroy it. Tonight. All of it.', next: 'stanceD', effect: (s) => { s.tapeStance = 'destroy'; } },
      { label: 'Give it to me. It’s evidence.', next: 'stanceT', effect: (s) => { s.tapeStance = 'take'; } },
      { label: 'Decide later. First: why are you still HERE?', next: 'stanceN', effect: (s) => { s.tapeStance = 'none'; } },
    ],
  },
  stanceD: { who: 'MARA VIDAL', text: 'Destroy it. The only footage of her alive... okay. Okay. You’re right. It goes in a fire.', next: 'badge' },
  stanceT: { who: 'MARA VIDAL', text: 'Take it, and you’ll watch it. Watching is remembering, and remembering is exactly what feeds them. ...But fine. Your risk, not mine.', next: 'badge' },
  stanceN: { who: 'MARA VIDAL', text: 'Because out there it’s FOG, and in here it’s only humidity. Humidity I can manage. I’m from Buenos Aires.', next: 'badge' },
  badge: {
    who: 'MARA VIDAL',
    text: 'I’m not crossing that lawn without knowing which one I am. Day eight, I met myself out there — walked like me, stood too still. My crew badge is in the prop crate, generator shed. Bring my name back and I’ll believe I’m the original.',
    effect: (s) => s.startMaraQuest(),
    next: null, end: true,
  },
  remind: { who: 'MARA VIDAL', text: 'Shed. Prop crate. My name, my face, laminated. Please. Without it I’m just whoever’s left standing.', end: true },
  badgeBack: {
    who: 'MARA VIDAL',
    text: '(she clips the badge on and stands. the height of a person seems to surprise her.) Mara Vidal. Production. Right. That’s me. Now — the tape. Tell me what to do with it, so I hear it in someone else’s voice.',
    choices: [
      { label: 'Burn it. Rufino keeps a fire on the beach.', next: 'doBurn', effect: (s) => s.resolveMara('destroyed') },
      { label: 'Hand it over. I’ll bury it in an archive.', next: 'doTake', effect: (s) => s.resolveMara('taken') },
      { label: 'Keep it. Just get to the boathouse and wait.', next: 'doKeep', effect: (s) => s.resolveMara('kept') },
    ],
  },
  doBurn: { who: 'MARA VIDAL', text: 'Fire. I always know where the light is — it’s the one thing this job was good for. If you hear anything in it, don’t look. It’s not screaming. It’s just burning.', end: true },
  doTake: { who: 'MARA VIDAL', text: 'It’s yours. If your bag gets warm, throw it in the lake and don’t stop to explain yourself. I’ll wait by the boat.', end: true },
  doKeep: { who: 'MARA VIDAL', text: 'Boathouse. Boat. Waiting. Three words with no fog in them. I can work with three words.', end: true },
  atFire: { who: 'MARA VIDAL', text: 'It burned green, did you see? Seven weeks of her, gone in about a minute. It’s the kindest thing I’ve ever done. I hate it.', end: true },
  atBoat: { who: 'MARA VIDAL', text: 'I counted the planks twice. Forty planks. A good, boring number. Say the word and we go.', end: true },
};

const ELISEO_TREE = {
  first: {
    who: 'DON ELISEO',
    text: 'Mind the roots. She’s old, this one. Older than the lie they tell about this house, older than me — and I stopped counting governments.',
    effect: (s) => { s.met.eliseo = true; },
    choices: [
      { label: 'You garden... at night?', next: 'night' },
      { label: 'You know what the fog is.', next: 'fog' },
      { label: 'Sir, there are THINGS out here—', next: 'things' },
    ],
  },
  night: { who: 'DON ELISEO', text: 'The fog waters better than any hose. And the dark doesn’t gawk. Gardens hate being gawked at.', next: 'fog' },
  fog: { who: 'DON ELISEO', text: 'The fog is the lake, remembering out loud, señorita. It’s been remembering this house since ’44. Some years louder than others.', next: 'quest' },
  things: { who: 'DON ELISEO', text: 'There are. They don’t chase what they don’t need. Speak less, and keep that little camera pointed where you’re looking.', next: 'quest' },
  quest: {
    who: 'DON ELISEO',
    text: 'One of that television crew wired my arrayán to a stake for his lighting rig. "Set dressing," he called it. That tree has kept her side of an agreement for eighty years. She shouldn’t be standing in wire because of it. My hands can’t cut it anymore. Yours can.',
    choices: [
      { label: 'I’ll cut it.', next: 'yes', effect: (s) => s.startEliseoQuest() },
      { label: 'It’s… a tree.', next: 'tree', effect: (s) => s.startEliseoQuest() },
    ],
  },
  yes: { who: 'DON ELISEO', text: 'The shears hang by my lantern. She’ll remember you. They remember longer than we do.', end: true },
  tree: { who: 'DON ELISEO', text: 'So is the mast of every boat that ever carried anyone home. Cut the wire.', end: true },
  remind: { who: 'DON ELISEO', text: 'The wire, when you can. She’s patient. I’m less.', end: true },
  cut: {
    who: 'DON ELISEO',
    text: '(he lays a palm on the trunk) There. Breathe, vieja. ...You did a quiet thing tonight, señorita. Quiet things are the only ones the fog can’t eat.',
    next: 'promise',
  },
  promise: {
    who: 'DON ELISEO',
    text: 'Now promise me one thing. Whichever you can actually keep.',
    choices: [
      { label: 'When I leave, I’ll never speak of this place again.', next: 'silence', effect: (s) => s.setPromise('silence') },
      { label: 'I’ll tell everyone the TRUTH about it.', next: 'tell', effect: (s) => s.setPromise('tell') },
      { label: 'I don’t make promises.', next: 'nopromise' },
    ],
  },
  silence: { who: 'DON ELISEO', text: 'Good. But that is not the promise that matters tonight. When you are on the water and it calls you — and it will call you in her voice — you do not answer. You do not look back. Promise me the not-looking.', end: true },
  tell: { who: 'DON ELISEO', text: 'Tell it, then, if you must. But tell her mother she drowned. Drowned, only. The rest of it dies with the ones who saw it.', end: true },
  nopromise: { who: 'DON ELISEO', text: 'Honest. The fog likes honest less than silence, and more than stories.', end: true },
  idle: { who: 'DON ELISEO', text: 'The lantern stays lit till morning. So will you, I think.', end: true },
};

// The girl in the cellar. Every question is answered the same — she cries.
// Ask a fifth and she stops crying. (The reply node shows the death line and
// exposes no choices once s.girlAttackPending is set, so [E] closes it and
// the onClose hook wakes her.)
const GIRL_TREE = {
  menu: {
    who: 'THE GIRL',
    text: (s) => s.girlQuestions === 0
      ? '(She is sitting in the middle of the room. Her neck is far too long for a child, and it turns toward you before the rest of her does. Her eyes are black all the way to the back.)'
      : '(She waits, wet-faced, for the next one. There is room in her for a great many questions.)',
    choices: [
      { label: 'Who are you?', next: 'reply', effect: (s) => s.askGirl() },
      { label: 'Are you Lucía? Did you know her?', next: 'reply', effect: (s) => s.askGirl() },
      { label: 'How do I get out of here?', next: 'reply', effect: (s) => s.askGirl() },
      { label: '(say nothing — back away)', next: null },
    ],
  },
  reply: {
    who: 'THE GIRL',
    effect: (s) => {
      if (s.girlAttackPending && !s._girlWailed) {
        s._girlWailed = true;
        s.audio.childWail();
        s.fx.glitch = Math.max(s.fx.glitch, 0.85);
        s.fx.staticVis = Math.max(s.fx.staticVis, 0.5);
      }
    },
    text: (s) => s.girlAttackPending ? 'And now you will die.' : s.cryLine(),
    choices: [
      { label: '(ask her something else)', next: 'menu', if: (s) => !s.girlAttackPending },
      { label: '(that’s enough — back away)', next: null, if: (s) => !s.girlAttackPending },
    ],
  },
};

// c2 · lakeward probe directions for placing the "answer the water" trap at the
// water's edge in front of Ana (all +z-biased, toward the lake). Module const so
// the eligibility check never allocates in the loop.
const WATER_DIRS = [[0, 1], [0.4, 0.92], [-0.4, 0.92], [0.7, 0.71], [-0.7, 0.71]];

// ================================================================== the Story

export class Story {
  constructor(ctx) {
    // ctx: { scene, ui, audio, player, director, world, buildings, npcs, dialog, fx, onGameOver(win,text) }
    Object.assign(this, ctx);
    this.evidence = 0;
    this.hasHouseKey = false;
    this.hasBoatKey = false;
    this.powerOn = false;
    // c3: the generator is a real, reversible trade-off. Running it lights the
    // house (see + unlock the drawer) but lifts the Director's effective
    // pressure, biases ambient spawns to the lit house and (via a3) draws
    // watchers to the windows. Holding E again kills it and the relief returns.
    this._everPowered = false;                 // has she ever lit the house? (gates the one-time line)
    this._poweredBonus = 0.7;                   // extra effective pressure while lit
    this._powerFocus = new THREE.Vector3(LAYOUT.house.x, 0, LAYOUT.house.z);  // spawns bias to the house while lit
    this.boatStarted = false;
    this.boatProgress = 0;
    this.boatNeed = 20;
    this._lastBoatLeft = null;   // last countdown value shown; null = force first "engine is catching" issue
    this._boatAway = false;      // whether "get back to the boat" is currently the shown message
    this.over = false;
    this.staticSpike = 0;
    this.checkpoint = new THREE.Vector3(0, 0, 77.2);
    this.items = [];
    this._markerItems = [];              // items that own a pulsing marker (built in addItem)
    this._bestInteract = { item: null, label: null };  // reused by currentInteract — no per-frame literal
    this._maraNpc = null;                // cached Mara NPC ref (resolved once in update)
    this._maraWasWalking = false;        // tracks Mara's walk→idle edge for the anchor sync
    this.triggers = [];
    this.holding = null;
    this.holdT = 0;
    this.pianoTimer = null;
    this.scareArmed = false;
    this.scareDone = false;
    this._wasInScareZone = true;
    this.firstPhotoDone = false;
    this.enemySeenLine = false;
    this._deathIdx = 0;

    // c4 · teach the Returned. Three staged, survivable first sightings — one
    // per kind — each naming that kind's tell, early enough to build mastery.
    // Every sighting is gated behind hasHouseKey (which the headless play-test
    // never sets), so they can NEVER fire during the test's spawn/flash/damage/
    // boat assertions. Kept to the early, mostly pre-power game (see _teachReady).
    this._teachDone = { testigo: false, doble: false, archivero: false };
    this._teach = null;   // the active sighting: { kind, enemy, t, tell, hint, gone }

    // people & quests
    this.met = { rufino: false, mara: false, eliseo: false };
    this.hasFuel = false;
    this.fueled = false;
    this.rufinoQuest = 0;       // 0 none, 1 asked, 2 done
    this.hasThermos = false;
    this.rufinoBond = false;
    this.tapeStance = null;     // 'destroy' | 'take' | 'none'
    this.maraQuest = 0;         // 0 none, 1 badge asked, 2 resolved
    this.hasBadge = false;
    this.maraFate = null;       // 'destroyed' | 'taken' | 'kept' | (null = left)
    this.tookTape = false;
    // the shore ambush on her boathouse-bound walk (Part B). Orthogonal to the
    // tape fate: null = no ambush (fire fate / unresolved), true = saved,
    // false = taken by the lake.
    this.maraSurvived = null;
    this._escort = null;    // { active, count, max, enemy, timer, LIMIT, cooldown, savedObj }
    this.eliseoQuest = 0;       // 0 none, 1 asked, 2 cut
    this.eliseoPromise = null;  // 'silence' | 'tell'

    // c2 · "don't answer the water". At the night's danger peak, near the
    // waterline, the lake calls Ana's name in a loved voice. Answering (a
    // deliberate [E] press or wading to the water's edge) is a trap; resisting
    // (looking away / walking off / just holding still) is safe and steadying.
    this.answeredWater = false;   // did she ever answer? → a mark on her ending
    this.resistedWater = 0;       // how many calls she refused
    this._wcActive = false;       // is a call live right now?
    this._wcT = 0;                // seconds left in the live call
    this._wcSecond = null;        // countdown to the second, nearer utterance
    this._wcCd = 40;              // cooldown before another call may fire
    this._wcCount = 0;            // calls fired this night (capped, kept rare)
    this._wcSrc = new THREE.Vector3();   // the water's-edge point the voice comes from
    this._finaleCallDone = false; // the atmospheric last call during the crossing

    // the cellar girl
    this.girlQuestions = 0;         // how many she's been asked
    this.girlLimit = 5;             // the fifth is one too many
    this.girlAttackPending = false;
    this.girlAttackStarted = false;
    this.girlResolved = false;
    this._girlWailed = false;
    this._cryIdx = 0;

    this.buildItems();
    this.buildTriggers();
    this.setObjective('Reach the estancia', 'follow the path from the dock');
  }

  setObjective(main, sub) { this.ui.setObjective(main, sub); this._obj = { main, sub }; journal.addObjective(main, sub); }

  // ---- checkpoint save/restore (see save.js). serialize() returns the flat
  // progress flags; restore() sets them and REPLAYS the durable world effects
  // (power, Mara's relocation, the boat chain, collected items) so the resumed
  // world matches. Transient things (live enemies, in-flight dialogue) are not
  // saved — they re-derive from pressure on the next tick.
  serialize() {
    return {
      evidence: this.evidence,
      obj: this._obj || null,
      firstPhotoDone: this.firstPhotoDone,
      met: { ...this.met },
      powerOn: this.powerOn, _everPowered: this._everPowered,
      hasFuel: this.hasFuel, fueled: this.fueled,
      rufinoQuest: this.rufinoQuest, rufinoBond: this.rufinoBond, hasThermos: this.hasThermos, _rufinoFireLine: this._rufinoFireLine,
      maraQuest: this.maraQuest, maraFate: this.maraFate, hasBadge: this.hasBadge, tookTape: this.tookTape, maraSurvived: this.maraSurvived,
      eliseoQuest: this.eliseoQuest, eliseoPromise: this.eliseoPromise,
      girlQuestions: this.girlQuestions, girlAttackPending: this.girlAttackPending,
      girlAttackStarted: this.girlAttackStarted, girlResolved: this.girlResolved,
      boatStarted: this.boatStarted, scareDone: this.scareDone,
      items: this.items.filter((it) => it.taken || it._counted).map((it) => ({ id: it.id, taken: !!it.taken, counted: !!it._counted })),
    };
  }

  restore(d) {
    if (!d) return;
    const b = (v) => !!v, n = (v) => v | 0;
    this.firstPhotoDone = b(d.firstPhotoDone);
    this.hasFuel = b(d.hasFuel); this.fueled = b(d.fueled);
    this.rufinoQuest = n(d.rufinoQuest); this.rufinoBond = b(d.rufinoBond); this.hasThermos = b(d.hasThermos); this._rufinoFireLine = b(d._rufinoFireLine);
    this.maraQuest = n(d.maraQuest); this.maraFate = d.maraFate ?? null; this.hasBadge = b(d.hasBadge); this.tookTape = b(d.tookTape); this.maraSurvived = d.maraSurvived ?? null;
    this.eliseoQuest = n(d.eliseoQuest); this.eliseoPromise = d.eliseoPromise ?? null;
    this.girlQuestions = n(d.girlQuestions); this.girlAttackPending = b(d.girlAttackPending); this.girlAttackStarted = b(d.girlAttackStarted); this.girlResolved = b(d.girlResolved);
    this.boatStarted = b(d.boatStarted); this.scareDone = b(d.scareDone);
    this._everPowered = b(d._everPowered);
    if (d.met) this.met = { rufino: b(d.met.rufino), mara: b(d.met.mara), eliseo: b(d.met.eliseo) };

    this.evidence = n(d.evidence);
    this.ui.setEvidence(this.evidence, EV_TOTAL);

    // collected items: hide meshes + mark counted so they neither respawn nor recount
    if (Array.isArray(d.items)) {
      const byId = {}; for (const it of this.items) byId[it.id] = it;
      for (const rec of d.items) {
        const it = byId[rec.id]; if (!it) continue;
        if (rec.counted) it._counted = true;
        if (rec.taken) { it.taken = true; it.mesh && this.scene.remove(it.mesh); it._marker && this.scene.remove(it._marker); }
      }
    }

    // --- replay the durable world effects ---
    if (d.powerOn) {
      this.powerOn = true; this._everPowered = true;
      this.buildings.setPower(true);
      this.audio.setGenerator(true);
      if (this._poweredBonus != null) this.director.setPoweredBonus?.(this._poweredBonus);
      if (!this.boatStarted) this.director.setSpawnFocus?.(this._powerFocus);
    }
    // restore a sensible tension floor for how far in we are
    const floor = d.powerOn || this.boatStarted ? 2 : this.evidence >= 1 ? 1 : 0;
    if (this.director.pressure < floor) this.director.setPressure(floor);

    if (this.maraQuest === 2 && this.maraFate) {
      // treat any walk as COMPLETE on load — snap her to the destination (the
      // live walk/ambush is transient and not restored, like live enemies).
      const npc = this.npcs.byId('mara');
      if (this.maraSurvived === false) {
        npc.hide();                                   // taken by the lake
      } else if (this.maraFate === 'destroyed') {
        npc.relocate(LAYOUT.camp.x, LAYOUT.camp.z + 1.35, Math.PI);   // seated at the fire
      } else {
        npc._showWalker();                            // stand her by the boat
        npc.relocate(LAYOUT.boathouse.x + 3.0, LAYOUT.boathouse.z - 2.6, 0);
      }
      if (this._maraItem) { this._maraItem.x = npc.x; this._maraItem.z = npc.z; this._maraItem.y = this.world.groundHeight(npc.x, npc.z) + 1.0; }
    }
    if (this.eliseoPromise && this.npcs.wireTree && !this.npcs.wireTree.removed) this.npcs.wireTree.removeWire();
    if (this.boatStarted) this.buildings.boatChain.hide();

    if (d.obj?.main) this.setObjective(d.obj.main, d.obj.sub);
    this.updateSide?.();
  }

  // ------------------------------------------------------------ people/quests
  safeSpots() {
    const spots = [{ x: this.npcs.campfire.x, z: this.npcs.campfire.z, r: 9 }];
    const e = this.npcs.byId('eliseo');
    spots.push({ x: e.x, z: e.z, r: 7 });
    return spots;
  }

  talkTo(id) {
    if (this.dialog.open) return;
    this.ui.clearSubs();
    this.ui.prompt(null);
    let tree, entry;
    if (id === 'rufino') {
      tree = RUFINO_TREE;
      if (!this.met.rufino) entry = 'first';
      else if (this.rufinoQuest === 1 && this.hasThermos) entry = 'thermos';
      else if (this.rufinoQuest === 1) entry = 'remind';
      else if (this.rufinoQuest === 0) entry = 'quest';
      else if (this.maraFate === 'destroyed' && !this._rufinoFireLine) { this._rufinoFireLine = true; entry = 'maraAtFire'; }
      else entry = 'idle';
    } else if (id === 'mara') {
      tree = MARA_TREE;
      if (!this.met.mara) entry = 'first';
      else if (this.maraQuest === 1 && this.hasBadge) entry = 'badgeBack';
      else if (this.maraQuest === 1) entry = 'remind';
      else if (this.maraQuest === 2) entry = this.maraFate === 'destroyed' ? 'atFire' : 'atBoat';
      else entry = 'tape';
    } else if (id === 'girl') {
      this.dialog.start(GIRL_TREE, 'menu', this, () => {
        this.updateSide();
        if (this.girlAttackPending && !this.girlAttackStarted) this.startGirlAttack();
      });
      return;
    } else {
      tree = ELISEO_TREE;
      if (!this.met.eliseo) entry = 'first';
      else if (this.eliseoQuest === 2) entry = 'cut';
      else if (this.eliseoQuest === 1 && !this.npcs.wireTree.removed) entry = 'remind';
      else if (this.eliseoQuest === 0) entry = 'quest';
      else entry = 'idle';
    }
    this.dialog.start(tree, entry, this, () => this.updateSide());
  }

  // ------------------------------------------------------------ the girl
  cryLine() {
    const lines = [
      '(She only cries. The sound is too low for her size, and it does not stop to breathe.)',
      '(Weeping — the same three notes, over and over, the way a tape loops.)',
      '(She cries harder. Water runs from the black of her eyes. It is not the colour of tears.)',
      '(Crying. Under it, just at the edge of hearing, something keeps a count.)',
    ];
    return lines[this._cryIdx++ % lines.length];
  }

  askGirl() {
    this.girlQuestions++;
    if (this.girlQuestions >= this.girlLimit) {
      this.girlAttackPending = true;
    } else {
      this.audio.childCry();
      this.fx.glitch = Math.max(this.fx.glitch, 0.2 + this.girlQuestions * 0.08);
    }
  }

  startGirlAttack() {
    if (this.girlAttackStarted) return;
    this.girlAttackStarted = true;
    this.buildings.cellar.girl.startAttack();
    this.fx.glitch = Math.max(this.fx.glitch, 1);
    this.fx.flash = Math.max(this.fx.flash, 0.3);
    this._savedObj = { es: this.ui.els.objEs.textContent, en: this.ui.els.objEn.textContent };
    this.ui.say('ANA', 'No — no no no. The camera. USE THE CAMERA — keep flashing her!', 3.6);
    this.setObjective('The girl is awake', 'flash her — five times — until she can’t hold together');
  }

  startRufinoQuest() { if (this.rufinoQuest === 0) this.rufinoQuest = 1; this.updateSide(); }
  finishRufinoQuest() {
    this.rufinoQuest = 2;
    this.rufinoBond = true;
    this.hasThermos = false;
    this.player.maxBonus += 10;
    this.audio.pickup();
    this.updateSide();
  }
  startMaraQuest() { this.maraQuest = 1; this.updateSide(); }
  resolveMara(fate) {
    this.maraQuest = 2;
    this.maraFate = fate;
    this.hasBadge = false;
    this.tookTape = fate === 'taken';
    const npc = this.npcs.byId('mara');
    // She stands and WALKS now — no teleport. Burning the tape sends her to
    // Rufino's fire (a safe hearth: no escort threat). Keeping/taking it sends
    // her across the exposed shore to the boathouse as an ESCORT: she is a
    // target the whole way, one Returned at a time, ambient spawns suppressed.
    if (fate === 'destroyed') {
      npc.walkTo(MARA_ROUTE_FIRE, { settle: 'seated', finalYaw: Math.PI });
    } else {
      this._escort = {
        active: true, count: 0, max: MARA_ESCORT_MAX, enemy: null,
        timer: 0, LIMIT: 18, cooldown: 6, savedObj: this._obj ? { ...this._obj } : null,
      };
      // clear whatever was already chasing and hold ambient spawns for the
      // episode, so a new player faces one clean threat at a time, not a mob.
      this.director.clearAll();
      this.director.suppressSpawns = true;
      npc.walkTo(MARA_ROUTE_BOAT, { settle: 'standing', finalYaw: 0 });
      this.setObjective('Get Mara to the boat', 'keep your camera ready — the flash is all that saves her');
    }
    if (fate === 'taken') {
      this.staticSpike = Math.max(this.staticSpike, 0.8);
      this.fx.glitch = Math.max(this.fx.glitch, 0.5);
      this.ui.say('', '(the bag on your shoulder is slightly warm)', 3.4);
    }
    this.updateSide();
  }

  // Called each PLAY frame while the escort is live (from update()): spawn the
  // next attacker after a cooldown, watch the live attack for rescue/failure,
  // and finish the episode when she reaches the boat.
  _escortUpdate(dt, playerPos) {
    const esc = this._escort;
    if (!esc || !esc.active) return;
    const npc = this.npcs.byId('mara');
    if (esc.enemy) {
      // an attack is live: the ONLY rescue is photographing the Returned until it
      // dissolves. Ana's mere presence does nothing — being close can't save Mara.
      esc.timer += dt;
      const gone = esc.enemy.state === 'dying' || !this.director.enemies.includes(esc.enemy);
      if (gone) this._maraAttackerBeaten();
      else if (esc.timer > esc.LIMIT) this.loseMara();
    } else if (!npc.walking) {
      this.finishEscort();                              // she made it to the boat
    } else if (!npc._paused && esc.count < esc.max) {
      // between attacks, once she's clear of the greenhouse, the next reaches for her
      esc.cooldown -= dt;
      const clearOfGreenhouse = Math.hypot(npc.x - LAYOUT.green.x, npc.z - LAYOUT.green.z) > 6;
      if (esc.cooldown <= 0 && clearOfGreenhouse) this._spawnMaraAttacker();
    }
  }

  _spawnMaraAttacker() {
    const esc = this._escort;
    const npc = this.npcs.byId('mara');
    esc.count++;
    npc.pauseWalk();                                    // she stops, caught
    // Spawn the Returned WELL BACK from her (was ~5 m, right on top of her): 10–13 m
    // out on her open flank + a few metres behind, so it's ~11–14 m away and the
    // player sees it coming out of the fog with time to raise the camera. Placed on
    // the side AWAY from the greenhouse and clamped off the water, so it always lands
    // on open shore in view — never inside the glasshouse or out on the lake.
    let hx = -1, hz = 0;                                // her heading down the route
    const tgt = npc._route && npc._route[npc._wp];
    if (tgt) { hx = tgt.x - npc.x; hz = tgt.z - npc.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl; }
    let px = -hz, pz = hx;                              // perpendicular — her flank
    if (px * (npc.x - LAYOUT.green.x) + pz * (npc.z - LAYOUT.green.z) < 0) { px = -px; pz = -pz; }  // the open side
    const outr = 10 + Math.random() * 3, back = 2 + Math.random() * 3;
    const bx = npc.x + px * outr - hx * back;
    let bz = npc.z + pz * outr - hz * back;
    bz = Math.min(bz, LAYOUT.shoreZ - 3);              // keep it off the water
    esc.enemy = this.director.spawnAbductor('doble', bx, bz, npc);
    esc.timer = 0;
    this.audio.scream(0, 'doble');
    this.fx.glitch = Math.max(this.fx.glitch, 0.5);
    this.staticSpike = Math.max(this.staticSpike, 0.55);
    const lines = ['Ana — ANA — get it OFF me—!', 'It’s here, it’s right here—!', 'Don’t let it — please—!', 'Behind me — BEHIND me—!'];
    this.ui.say('MARA VIDAL', lines[(esc.count - 1) % lines.length], 3.2);
    this.setObjective('Something has Mara', 'flash it until it dissolves — before it takes her');
  }

  // one attacker driven off — she walks on; the next may come after a cooldown
  _maraAttackerBeaten() {
    const esc = this._escort;
    if (esc.enemy && this.director.enemies.includes(esc.enemy) && esc.enemy.state !== 'dying') this.director.despawn(esc.enemy);
    esc.enemy = null;
    esc.cooldown = 11 + Math.random() * 4;              // walk a while before the next
    const npc = this.npcs.byId('mara');
    npc.resumeWalk();
    this.player.composure = Math.min(TUNE.composureMax + this.player.maxBonus, this.player.composure + 6);
    this.staticSpike = Math.max(0, this.staticSpike - 0.2);
    this.audio.pickup();
    this.ui.say('MARA VIDAL', esc.count >= esc.max
      ? 'That’s — I think that’s all of them. Keep going, keep going.'
      : 'Gone. Keep that camera up — there may be more.', 3.2);
    this.setObjective('Get Mara to the boat', 'keep your camera ready — the flash is all that saves her');
    this.updateSide();
  }

  // she reached the boat untaken → the escort is won
  finishEscort() {
    const esc = this._escort;
    if (!esc || !esc.active) return;
    esc.active = false;
    this.director.suppressSpawns = false;
    this.maraSurvived = true;
    // bringing her through steadies Ana: a lasting lift + a heal
    this.player.maxBonus += 12;
    this.player.composure = Math.min(TUNE.composureMax + this.player.maxBonus, this.player.composure + 12);
    this.audio.pickup();
    this.ui.say('MARA VIDAL', 'We made it. You didn’t leave me out there. I won’t forget that.', 4.2);
    if (esc.savedObj) this.setObjective(esc.savedObj.main, esc.savedObj.sub);
    else this.setObjective('Reach the boathouse', 'ready the boat — cross at first light');
    this.updateSide();
  }

  loseMara() {
    const esc = this._escort;
    if (!esc || !esc.active) return;
    esc.active = false;
    if (esc.enemy) { if (this.director.enemies.includes(esc.enemy)) this.director.despawn(esc.enemy); esc.enemy = null; }
    this.director.suppressSpawns = false;
    this.maraSurvived = false;
    const npc = this.npcs.byId('mara');
    npc.hide();                                         // taken by the lake
    this.player.composure = Math.max(8, this.player.composure - 22);
    this.staticSpike = Math.max(this.staticSpike, 0.95);
    this.fx.glitch = Math.max(this.fx.glitch, 0.9);
    this.audio.scream(0, 'doble');
    this.ui.say('', '(Mara’s headlamp hits the shingle, still lit. The beach is empty.)', 4.4);
    if (esc.savedObj) this.setObjective(esc.savedObj.main, esc.savedObj.sub);
    else this.setObjective('Get to the boat', 'the flash came too late — go, before first light');
    this.updateSide();
  }
  startEliseoQuest() { if (this.eliseoQuest === 0) this.eliseoQuest = 1; this.updateSide(); }
  setPromise(p) {
    this.eliseoPromise = p;
    this.eliseoQuest = 3;
    this.player.maxBonus += p === 'silence' ? 15 : 8;
    this.player.regenBonus = 1.35;
    this.audio.pickup();
    this.updateSide();
  }

  updateSide() {
    const side = [];
    if (this.rufinoQuest === 1) side.push(this.hasThermos ? 'return Rufino’s thermos' : 'Rufino: the green thermos (greenhouse)');
    if (this.maraQuest === 1) side.push(this.hasBadge ? 'bring Mara her badge' : 'Mara: her crew badge (the shed)');
    if (this.eliseoQuest === 1 && !this.npcs.wireTree.removed) side.push('Eliseo: cut the wire on the old arrayán');
    if (this.eliseoQuest === 2) side.push('tell Eliseo the tree is free');
    this.ui.setSide(side.length ? '◦ ' + side.slice(0, 2).join('  ·  ') : '');
  }

  addItem(def) {
    if (def.mesh) {
      def.mesh.position.set(def.x, def.y, def.z);
      this.scene.add(def.mesh);
    }
    if (def.marker !== false) {
      def._marker = makeMarker(def.evidence);
      def._marker.position.set(def.x, def.y + 0.12, def.z);
      this.scene.add(def._marker);
      this._markerItems.push(def);       // only these get swept for marker pulsing
    }
    def.taken = false;
    this.items.push(def);
    return def;
  }

  readNote(noteKey, def) {
    const n = NOTES[noteKey];
    this.audio.paper();
    journal.addNote(n);            // keep every read note in the journal to re-read
    this.ui.showNote(n, () => {
      this.audio.paper();
      if (n.evidence && def && !def._counted) {
        def._counted = true;
        this.evidence++;
        this.ui.setEvidence(this.evidence, EV_TOTAL);
        this.audio.pickup();
        if (this.evidence === 1)
          this.ui.say('ANA', 'One piece of proof. Keep going — I need to actually know, not just hope.');
        if (this.evidence === EV_TOTAL) {
          this.ui.say('ANA', 'Six proofs. I know what this place does now. So what, exactly, keeps standing in the treeline?');
        }
      }
    });
  }

  pickupNote(def, noteKey) {
    def.taken = true;
    def.mesh && this.scene.remove(def.mesh);
    def._marker && this.scene.remove(def._marker);
    this.readNote(noteKey, def);
  }

  // ------------------------------------------------------------------- items
  buildItems() {
    const A = this.buildings.anchors;

    // dock: schedule sign (re-readable) + ticket stub
    this.addItem({
      id: 'schedule', x: -1.05, z: 74.2, y: 2.0, label: 'read the sign',
      marker: false, radius: 2.4,
      action: () => this.readNote('schedule'),
      repeatable: true,
    });
    this.addItem({
      id: 'stub', x: -0.75, z: 76.4, y: 1.44, evidence: true,
      label: 'PROOF: ferry ticket stub', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'stub'),
    });

    // kiosk
    this.addItem({
      id: 'kioskNote', x: A.kioskNote.x, z: A.kioskNote.z, y: A.kioskNote.y,
      marker: false,
      label: 'read the note', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'kioskNote'),
    });
    this.addItem({
      id: 'mug', x: A.mug.x, z: A.mug.z, y: A.mug.y, evidence: true,
      label: 'PROOF: the mug', mesh: mugMesh(),
      action: (d) => this.pickupNote(d, 'mug'),
    });
    this.addItem({
      id: 'gnome', x: A.gnome.x, z: A.gnome.z, y: A.gnome.y, marker: false, radius: 2.2,
      label: () => this.hasHouseKey ? 'the gnome' : 'check under the gnome',
      action: () => {
        if (this.hasHouseKey) { this.ui.say('ANA', 'The gnome keeps his secret. I already have it.'); return; }
        this.hasHouseKey = true;
        this.audio.key();
        this.ui.say('ANA', 'Paint’s gone off him, and he’s still got a house key taped under his hat. Small mercies.');
        this.setObjective('Get inside the house', 'the front door, up the path');
        this.checkpoint.set(10.5, 0, 33);
        // BAL · defuse the key's pressure jump. Raising the floor to 1 keeps the
        // later escalation, but on its own it USED to let a lethal ambient wave
        // arrive ~4 s later (the leftover spawnT) — reading as "it attacked me
        // for taking the key". Two guards now prevent that: (1) reset the spawn
        // cadence to a full interval so the first ambient attempt is ~40 s away,
        // and (2) the teaching gate means testigo can't manifest lethally until
        // its first-sighting has played anyway. The old +2600 ms scream/glitch
        // scare is removed for the same reason (it read as an attack right after
        // the key); the owner can restore a gentler ambient cue if desired.
        if (this.director.pressure < 1) {
          this.director.setPressure(1);
          this.director.spawnT = 40;
        }
      },
      repeatable: true,
    });

    // plaque
    this.addItem({
      id: 'plaque', x: A.plaque.x, z: A.plaque.z, y: A.plaque.y, marker: false, radius: 2.4,
      label: 'read the plaque',
      action: () => this.readNote('plaque'),
      repeatable: true,
    });

    // porch call sheet
    this.addItem({
      id: 'callsheet', x: 2.7, z: -5.6, y: LAYOUT.house.y + 0.02,
      marker: false,
      label: 'read the call sheet', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'callsheet'),
    });

    // front door
    this.addItem({
      id: 'frontDoor', x: 1, z: -7.5, y: LAYOUT.house.y + 1.1, marker: false, radius: 2.2,
      label: () => this.buildings.doors.front.locked
        ? 'the front door'
        : (this.buildings.doors.front.open ? 'close the door' : 'open the door'),
      action: () => {
        const door = this.buildings.doors.front;
        if (door.locked) {
          if (this.hasHouseKey) {
            door.locked = false;
            this.audio.unlock(); this.audio.doorCreak();
            door.setOpen(true);
            this.ui.say('ANA', 'The famous house. It looks... aggressively normal.');
          } else {
            this.audio.switchClick();
            this.ui.say('ANA', 'Locked. Of course it is. Who keeps a key to a house nobody’s lived in for eighty years? ...The kiosk man. The kiosk man does.');
            this.setObjective('Locked — find a key', 'try the souvenir kiosk');
          }
        } else {
          door.setOpen(!door.open);
          this.audio.doorCreak();
        }
      },
      repeatable: true,
    });

    // shed door
    this.addItem({
      id: 'shedDoor', x: LAYOUT.shed.x, z: LAYOUT.shed.z + 1.5, y: LAYOUT.shed.y + 1.1,
      marker: false, radius: 2.0,
      label: () => this.buildings.doors.shed.open ? 'close the door' : 'open the door',
      action: () => {
        const d = this.buildings.doors.shed;
        d.setOpen(!d.open); this.audio.doorCreak();
      },
      repeatable: true,
    });

    // back door — out to the rear yard and the cellar stair
    this.addItem({
      id: 'backDoor', x: LAYOUT.house.x, z: LAYOUT.house.z - 6.5, y: LAYOUT.house.y + 1.1,
      marker: false, radius: 2.0,
      label: () => this.buildings.doors.back.open ? 'close the back door' : 'open the back door',
      action: () => {
        const d = this.buildings.doors.back;
        d.setOpen(!d.open); this.audio.doorCreak();
        if (!this._backLine) {
          this._backLine = true;
          this.ui.say('ANA', 'A door nobody drew on any plan. It goes down. ...Of course it goes down.', 4);
        }
      },
      repeatable: true,
    });

    // --- the cellar
    const A2 = this.buildings.anchors;
    // the cellar door at the foot of the areaway stair
    this.addItem({
      id: 'cellarDoor', x: A2.cellarDoor.x, z: A2.cellarDoor.z, y: A2.cellarDoor.y,
      marker: false, radius: 2.0,
      label: () => this.buildings.doors.cellar.open ? 'close the cellar door' : 'open the cellar door',
      action: () => {
        const d = this.buildings.doors.cellar;
        d.setOpen(!d.open); this.audio.doorCreak();
      },
      repeatable: true,
    });
    this.addItem({
      id: 'cellarNote', x: A2.cellarNote.x, z: A2.cellarNote.z, y: A2.cellarNote.y,
      marker: false, radius: 1.9,
      label: 'chalk on the wall',
      action: () => this.readNote('cellarNote'),
      repeatable: true,
    });
    this.addItem({
      id: 'talkGirl', x: A2.girl.x, z: A2.girl.z, y: A2.girl.y,
      marker: false, radius: 2.6, repeatable: true,
      // only when you're actually down in the cellar — not through the kitchen floor
      available: () => this.buildings.cellar.playerBelow && !this.girlAttackStarted && !this.buildings.cellar.girl.dead,
      label: () => this.girlQuestions >= this.girlLimit - 1 ? '…ask her' : 'the girl',
      action: () => this.talkTo('girl'),
    });

    // generator: dry tank → fetch fuel → fill → pull-start
    this.addItem({
      id: 'generator', x: A.generator.x, z: A.generator.z, y: A.generator.y,
      marker: false, radius: 2.2,
      // c3: once fueled it's a hold-to-toggle — start it, or shut a running one down
      hold: () => (this.powerOn ? 2.6 : this.fueled ? 2.6 : this.hasFuel ? 2.0 : 0),
      label: () => this.powerOn ? 'shut down the generator (hold E)'
        : this.fueled ? 'start the generator (hold E)'
          : this.hasFuel ? 'fuel the generator (hold E)'
            : 'the generator — tank is dry',
      action: () => {
        if (this.powerOn) { this.stopPower(); return; }
        if (!this.fueled && !this.hasFuel) {
          this.audio.switchClick();
          this.ui.say('ANA', 'Dry. Bone dry, of course. There was a jerry can in the boathouse, by the slip.', 4.2);
          this.setObjective('Find fuel — the boathouse', 'a jerry can, west along the shore');
          return;
        }
        if (!this.fueled) {
          this.fueled = true;
          this.hasFuel = false;
          this.audio.drawer();
          this.ui.say('ANA', 'Glug, glug. Okay. Now the cord, and we find out together if this was a mistake.', 3.6);
          this.setObjective('Start the generator', 'hold E — brace yourself');
          return;
        }
        this.startPower();
      },
      repeatable: true,
    });
    // the jerry can, waiting in the boathouse
    this.addItem({
      id: 'fuelCan', x: LAYOUT.boathouse.x + 0.6, z: LAYOUT.boathouse.z - 2.6,
      y: LAYOUT.boathouse.y + 0.1, evidence: false,
      label: 'take the jerry can', mesh: fuelCanMesh(),
      action: (d) => {
        d.taken = true;
        d.mesh && this.scene.remove(d.mesh);
        d._marker && this.scene.remove(d._marker);
        this.hasFuel = true;
        this.audio.pickup();
        this.ui.say('ANA', 'Half a can. Enough, if the generator behaves.', 3.4);
        if (!this.powerOn) this.setObjective('Fuel the generator', 'back to the shed');
      },
    });
    this.addItem({
      id: 'manual', x: A.shedBenchA.x, z: A.shedBenchA.z, y: A.shedBenchA.y,
      marker: false,
      label: 'read the manual', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'manual'),
    });
    this.addItem({
      id: 'bill', x: A.shedBenchB.x, z: A.shedBenchB.z, y: A.shedBenchB.y, evidence: true,
      label: 'PROOF: the incident report', mesh: paperMesh(0xc9c0a4),
      action: (d) => this.pickupNote(d, 'bill'),
    });

    // house interior notes
    this.addItem({
      id: 'hallNote', x: A.hallNote.x, z: A.hallNote.z, y: A.hallNote.y,
      marker: false,
      label: 'read the notes', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'hallNote'),
    });
    this.addItem({
      id: 'deed', x: A.deed.x, z: A.deed.z, y: A.deed.y, evidence: true,
      label: 'PROOF: the deed', mesh: paperMesh(0xd0c6a8),
      action: (d) => this.pickupNote(d, 'deed'),
    });
    this.addItem({
      id: 'archiveLetter', x: A.archiveLetter.x, z: A.archiveLetter.z, y: A.archiveLetter.y,
      marker: false,
      label: 'read the letter', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'archiveLetter'),
    });
    // extra found notes, scattered through the new rooms
    this.addItem({
      id: 'sittingNote', x: A.sittingNote.x, z: A.sittingNote.z, y: A.sittingNote.y,
      marker: false,
      label: 'read the notes', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'sittingNote'),
    });
    this.addItem({
      id: 'corridorNote', x: A.corridorNote.x, z: A.corridorNote.z, y: A.corridorNote.y,
      marker: false,
      label: 'read the scrap', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'corridorNote'),
    });
    this.addItem({
      id: 'pantryNote', x: A.pantryNote.x, z: A.pantryNote.z, y: A.pantryNote.y,
      marker: false,
      label: 'read the reminder', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'pantryNote'),
    });
    this.addItem({
      id: 'groceries', x: A.kitchenNote.x, z: A.kitchenNote.z, y: A.kitchenNote.y, evidence: true,
      label: 'PROOF: caretaker’s list, 1962', mesh: paperMesh(0xd6cdb2),
      action: (d) => this.pickupNote(d, 'groceries'),
    });
    this.addItem({
      id: 'bedNote', x: A.bedNote.x, z: A.bedNote.z, y: A.bedNote.y,
      marker: false,
      label: 'read the notes', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'bedNote'),
    });

    // piano — lift/close the lid; it answers back
    this.addItem({
      id: 'piano', x: A.piano.x, z: A.piano.z, y: A.piano.y, marker: false, radius: 1.9,
      label: () => this.buildings.piano.open ? 'close the piano' : 'open the piano',
      action: () => {
        this.buildings.piano.toggle();
        this.audio.pianoPlink();
        if (!this._pianoLine) {
          this._pianoLine = true;
          this.ui.say('ANA', 'A piano, in a house nobody’s lived in for eighty years — perfectly in tune. Someone keeps it that way. Nope. Moving on.');
        }
      },
      repeatable: true,
    });

    // study drawer (boathouse key)
    this.addItem({
      id: 'drawer', x: A.drawer.x, z: A.drawer.z, y: A.drawer.y, radius: 2.0,
      label: () => this.hasBoatKey ? 'empty'
        : this.powerOn ? 'open the drawer'
          : 'a locked drawer (too dark to pick)',
      action: () => {
        if (this.hasBoatKey) return;
        if (!this.powerOn) {
          this.ui.say('ANA', 'A little lock. Can’t even see the keyhole. Power first, burglary later.');
          return;
        }
        this.hasBoatKey = true;
        this.audio.drawer(); this.audio.key();
        this.ui.say('ANA', 'A key labeled BOATS. Fine. If the ferry won’t take me, I’ll take the boat — the second this fog goes down and the light comes up.');
        this.setObjective('Reach the boathouse', 'ready the boat — cross at first light');
        this.checkpoint.set(1, 0, -4.6);
      },
      repeatable: true,
    });

    // greenhouse
    this.addItem({
      id: 'diary', x: A.diary.x, z: A.diary.z, y: A.diary.y, evidence: true,
      label: 'PROOF: the gardener’s log', mesh: bookMesh(),
      action: (d) => this.pickupNote(d, 'diary'),
    });
    this.addItem({
      id: 'greenNote', x: A.diary.x + 4.2, z: A.diary.z - 2.2, y: A.diary.y,
      marker: false,
      label: 'read the notes', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'greenNote'),
    });

    // boathouse door — never locked; the CHAIN is the lock
    this.addItem({
      id: 'bhDoor', x: LAYOUT.boathouse.x - 4.5, z: LAYOUT.boathouse.z - 2.9,
      y: LAYOUT.boathouse.y + 1.1, marker: false, radius: 2.0,
      label: () => this.buildings.doors.boathouse.open ? 'close the door' : 'open the door',
      action: () => {
        const d = this.buildings.doors.boathouse;
        d.setOpen(!d.open);
        this.audio.doorCreak();
        if (!this._bhLine) {
          this._bhLine = true;
          this.ui.say('ANA', 'A boathouse. If nobody lives here, somebody sure keeps the hinges oiled.', 3.6);
          // c1: frame the escape around first light — no crossing in this fog
          setTimeout(() => this.ui.say('ANA', 'The sign on the dock wasn’t a superstition. No boat crosses in fog this thick — I’d row in circles until the water took me. So I get it ready, and I last until first light. The fog goes down with the dark. It has to.', 6.4), 3800);
        }
      },
      repeatable: true,
    });

    // boathouse inventory note (on the workbench)
    this.addItem({
      id: 'bhInventory', x: A.bhInventory.x, z: A.bhInventory.z, y: A.bhInventory.y,
      marker: false,
      label: 'read the inventory', mesh: paperMesh(),
      action: (d) => this.pickupNote(d, 'bhInventory'),
    });

    // final note
    this.addItem({
      id: 'finalNote', x: A.finalNote.x, z: A.finalNote.z, y: A.finalNote.y,
      label: 'the last page', mesh: paperMesh(0xbfb69a),
      action: (d) => {
        this.pickupNote(d, 'finalNote');
        this.ui.say('ANA', 'She knew it was listening. She kept recording anyway.', 4.5);
      },
    });

    // ---------------- people, and the things they want
    const gh = this.world.groundHeight;
    const rn = this.npcs.byId('rufino');
    this.addItem({
      id: 'talkRufino', x: rn.x, z: rn.z, y: gh(rn.x, rn.z) + 1.1,
      marker: false, radius: 2.6, repeatable: true,
      label: () => this.met.rufino ? 'talk to Rufino' : 'talk to the man by the fire',
      action: () => this.talkTo('rufino'),
    });
    const mn = this.npcs.byId('mara');
    this._maraItem = this.addItem({
      id: 'talkMara', x: mn.x, z: mn.z, y: gh(mn.x, mn.z) + 1.0,
      marker: false, radius: 2.4, repeatable: true,
      // can't chat while she's walking or being attacked (or once she's taken)
      available: () => {
        // not while she's walking/escorting or being attacked, nor once taken
        if (this.npcs.byId('mara').walking) return false;
        return this.maraSurvived !== false;
      },
      label: () => this.met.mara ? 'talk to Mara' : 'talk to the... person?',
      action: () => this.talkTo('mara'),
    });
    const en = this.npcs.byId('eliseo');
    this.addItem({
      id: 'talkEliseo', x: en.x, z: en.z, y: gh(en.x, en.z) + 1.3,
      marker: false, radius: 2.6, repeatable: true,
      label: () => this.met.eliseo ? 'talk to Don Eliseo' : 'talk to the old man',
      action: () => this.talkTo('eliseo'),
    });
    // Rufino's thermos, on a greenhouse bench near Mara
    this.addItem({
      id: 'thermos', x: LAYOUT.green.x + 2.6, z: LAYOUT.green.z - 1.05,
      y: LAYOUT.green.y + 0.9,
      label: 'a green, dented thermos', mesh: thermosMesh(),
      action: (d) => {
        d.taken = true;
        d.mesh && this.scene.remove(d.mesh);
        d._marker && this.scene.remove(d._marker);
        this.hasThermos = true;
        this.audio.pickup();
        this.ui.say('ANA', this.rufinoQuest === 1
          ? 'Green, dented, sentimental. One thermos, rescued.'
          : 'Someone’s thermos. Not mine. ...I’m taking it anyway, it feels important.', 3.6);
        this.updateSide();
      },
    });
    // Mara's crew badge, on the shed prop crate
    this.addItem({
      id: 'badge', x: LAYOUT.shed.x - 1.45, z: LAYOUT.shed.z + 0.4,
      y: LAYOUT.shed.y + 0.56,
      label: 'a crew badge on a lanyard', mesh: badgeMesh(),
      action: (d) => {
        d.taken = true;
        d.mesh && this.scene.remove(d.mesh);
        d._marker && this.scene.remove(d._marker);
        this.hasBadge = true;
        this.audio.pickup();
        this.ui.say('ANA', '"M. VIDAL — PRODUCTION." Laminated. Whoever she used to be, this proves it.', 3.4);
        this.updateSide();
      },
    });
    // the wire strangling the old arrayán
    this.addItem({
      id: 'wire', x: this.npcs.wireTree.x, z: this.npcs.wireTree.z, y: this.npcs.wireTree.y,
      marker: false, radius: 2.2, repeatable: true,
      available: () => !this.npcs.wireTree.removed,
      label: () => this.eliseoQuest >= 1 ? 'cut the wire' : 'fence wire, garroting the tree',
      action: () => {
        if (this.eliseoQuest < 1) {
          this.ui.say('ANA', 'Someone’s wired this tree to a stake. Years ago, by the rust on it.', 3.4);
          return;
        }
        this.npcs.wireTree.removeWire();
        this.eliseoQuest = 2;
        this.audio.key();
        this.ui.say('', '(the wire gives. the tree doesn’t thank you. it just breathes easier.)', 3.8);
        this.updateSide();
      },
    });

    // the boat — chained until you find the key
    this.addItem({
      id: 'boat', x: A.boat.x, z: A.boat.z, y: A.boat.y, marker: false, radius: 2.6,
      label: () => this.boatStarted ? null
        : this.hasBoatKey ? 'start the boat'
          : 'the boat — chained',
      action: () => {
        if (this.boatStarted) return;
        if (!this.hasBoatKey) {
          this.audio.switchClick();
          this.ui.say('ANA', 'Chained and padlocked. The note said the key lives in the study desk. Back into the famous house, then.', 4.4);
          return;
        }
        this.buildings.boatChain.hide();
        this.audio.unlock();
        this.startFinale();
      },
      repeatable: true,
    });

    // c2 · the "answer the water" temptation. Interactable ONLY while a call is
    // live; its position is set to the water's edge the voice comes from (in
    // _startWaterCall). Facing that point shows "[E] …answer her"; pressing it is
    // a DELIBERATE answer, and the trap. No marker, never shown otherwise.
    this._answerItem = this.addItem({
      id: 'answerWater', x: 0, z: 60, y: 0, marker: false, radius: 8, repeatable: true,
      available: () => this._wcActive === true,
      label: '…answer her',
      action: () => this.answerWaterCall(false),
    });

    // b3 (revisit): a page that is NOT present on the first pass through the
    // sitting room. The revisit controller reveals its mesh and flips _scrapReady
    // once the night has deepened and you have left this room and come back.
    // Non-evidence, unmarked — the reward is catching that the room changed.
    this._scrapReady = false;
    this._scrapItem = this.addItem({
      id: 'hallScrap',
      x: LAYOUT.house.x - 8.7, z: LAYOUT.house.z + 5.0, y: LAYOUT.house.y + 0.47,
      marker: false, radius: 1.9,
      label: 'a page that wasn’t here before', mesh: paperMesh(0xcac2a6),
      available: () => this._scrapReady === true,
      action: (d) => this.pickupNote(d, 'hallScrap'),
    });
    this._scrapItem.mesh.visible = false;

    // b1: the unmarked discoveries that reward wandering off the path
    this.buildDiscoveries();
  }

  // -------------------------------------------------------- b1 · discoveries
  // Optional, UNMARKED content that populates the empty 80% of the map. Every
  // mesh/material below is created HERE, in the Story constructor's buildItems
  // (which runs before warmUpRenderer() in main.js), so their shaders compile
  // behind the title screen. Everything is grounded with world.groundHeight.
  buildDiscoveries() {
    const scene = this.scene;
    const gh = this.world.groundHeight;
    const ground = (x, z, o = 0) => gh(x, z) + o;
    const place = (mesh, x, z, o = 0, ry = 0) => {
      mesh.position.set(x, ground(x, z, o), z);
      mesh.rotation.y += ry;
      scene.add(mesh);
      return mesh;
    };

    // ---- shared materials (new shaders → must exist before warm-up) ----
    const saltTex = canvasTexture((c, W, H) => {
      c.fillStyle = '#e6e3d8'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) {
        const v = Math.random() > 0.5 ? 255 : 150;
        c.fillStyle = `rgba(${v},${v},${(v * 0.96) | 0},${0.25 + Math.random() * 0.5})`;
        c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    }, 128, 32);
    const saltMat = new THREE.MeshLambertMaterial({ color: 0xeceadf, map: saltTex });
    const tarpTex = canvasTexture((c, W, H) => {
      c.fillStyle = '#5f5e46'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = `rgba(20,20,14,${0.03 + Math.random() * 0.07})`;
        c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
      }
      for (let i = 0; i < 6; i++) {   // damp streaks
        c.fillStyle = 'rgba(30,34,28,.10)'; c.fillRect(Math.random() * W, 0, 2 + Math.random() * 5, H);
      }
    }, 128, 128);
    const tarpMat = new THREE.MeshLambertMaterial({ map: tarpTex, color: 0x8f8d70, side: THREE.DoubleSide });
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x74766d, flatShading: true });
    const charMat = new THREE.MeshLambertMaterial({ color: 0x191612 });
    const ashMat = new THREE.MeshBasicMaterial({ color: 0x27231f });
    const bagMat = new THREE.MeshLambertMaterial({ color: 0x8a5a34 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2416, transparent: true, opacity: 0.9, depthWrite: false });
    const engraveMat = (lines) => new THREE.MeshBasicMaterial({
      map: canvasTexture((c, W, H) => {
        c.clearRect(0, 0, W, H);
        c.fillStyle = 'rgba(34,33,28,0.9)'; c.textAlign = 'center';
        let y = H * 0.34;
        for (const ln of lines) {
          c.font = `700 ${ln.length > 10 ? 20 : 26}px Georgia`;
          c.fillText(ln, W / 2, y); y += H * 0.2;
        }
      }, 160, 200),
      transparent: true, color: 0x1e1c18,
    });

    // ---- reusable prop builders ----
    const slumpTent = (x, z, ry, collapse) => {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.98, 1.25, 4, 1), tarpMat);
      t.castShadow = true;
      t.scale.set(1.3, 0.56 - collapse * 0.22, 1.0);
      const halfH = (1.25 * (0.56 - collapse * 0.22)) / 2;
      place(t, x, z, halfH - 0.06, Math.PI / 4 + ry);
      t.rotation.z = collapse * 0.5;   // sag to one side
      return t;
    };
    const deadFirepit = (cx, cz) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + Math.random() * 0.04, 1), stoneMat);
        place(st, cx + Math.cos(a) * 0.5, cz + Math.sin(a) * 0.5, 0.04);
      }
      const ash = new THREE.Mesh(new THREE.CircleGeometry(0.44, 16), ashMat);
      ash.rotation.x = -Math.PI / 2;
      place(ash, cx, cz, 0.02);
      for (const [ox, oz, rz] of [[0, 0.05, 0.4], [0.06, -0.05, -0.7]]) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 6), charMat);
        log.rotation.set(Math.PI / 2 + 0.12, rz, 0);
        place(log, cx + ox, cz + oz, 0.07);
      }
    };
    const headstone = (x, z, ry, tilt, w = 0.42, h = 0.6, lines = null) => {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.09), stoneMat);
      slab.position.y = h / 2; slab.castShadow = true;
      g.add(slab);
      if (lines) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.82), engraveMat(lines));
        face.position.set(0, h * 0.52, 0.048);
        g.add(face);
      }
      place(g, x, z, 0, ry);
      g.rotation.z = tilt;   // leaning
      return g;
    };
    const wallSeg = (x, z, len, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.38, 0.22), stoneMat);
      m.castShadow = true;
      place(m, x, z, 0.15, ry);
      return m;
    };

    // ============================================================ 1) the camp
    // The drowned crew's camp — ~20 m east of Rufino's fire, tucked against the
    // treeline at the shoreline (LAYOUT.crewCamp, its own anchor so it never
    // sits on top of Rufino's safe hearth). Where the crew — and Lucía — stayed.
    const cam = LAYOUT.crewCamp;
    // solid props get a small circle collider so Ana bumps into them instead of
    // walking through — the whole camp then reads as real, physical debris.
    const col = this.director.colliders;
    const solid = (x, z, r) => col.addCircle(x, z, r);
    slumpTent(cam.x + 4.2, cam.z - 2.0, 0.5, 0.15);      // tent 1
    solid(cam.x + 4.2, cam.z - 2.0, 0.78);
    slumpTent(cam.x + 8.0, cam.z - 1.4, -0.6, 0.55);     // tent 2, more collapsed
    solid(cam.x + 8.0, cam.z - 1.4, 0.78);
    slumpTent(cam.x + 5.6, cam.z - 5.2, 0.3, 0.05);      // tent 3 — Lucía's
    solid(cam.x + 5.6, cam.z - 5.2, 0.78);
    deadFirepit(cam.x + 6.0, cam.z - 3.0);               // the crew's own cold fire
    solid(cam.x + 6.0, cam.z - 3.0, 0.5);
    // Lucía's sleeping bag, half out of tent 3 (soft — no collider, and the
    // campNote rests here, so keep it freely reachable)
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.86, 4, 8), bagMat);
    bag.rotation.z = Math.PI / 2; bag.scale.y = 0.65; bag.castShadow = true;
    place(bag, cam.x + 5.9, cam.z - 4.6, 0.2, 0.3);
    // scattered gear (committed CC0 models)
    place(spawn('wooden_crate_01', { s: 1 }), cam.x + 9.0, cam.z - 3.0, 0, 0.4);
    solid(cam.x + 9.0, cam.z - 3.0, 0.45);
    place(spawn('old_military_crate', { s: 1 }), cam.x + 8.5, cam.z - 4.2, 0, -0.5);
    solid(cam.x + 8.5, cam.z - 4.2, 0.5);   // the dead lantern below shares this collider
    place(spawn('metal_toolbox', { s: 1 }), cam.x + 7.4, cam.z - 5.1, 0, 0.9);
    solid(cam.x + 7.4, cam.z - 5.1, 0.34);
    place(spawn('barrel_03', { s: 1 }), cam.x + 3.2, cam.z - 3.6, 0, 0);
    solid(cam.x + 3.2, cam.z - 3.6, 0.4);
    place(spawn('Lantern_01', { s: 0.5 }), cam.x + 8.5, cam.z - 4.2, 0.42, 0.2);  // dead lantern on the crate
    // Teo's camera rig on a tripod — still recording. Faces back at the empty camp.
    {
      const rigX = cam.x + 7.0, rigZ = cam.z + 0.4;
      const tri = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 1.28, 5), woodMat);
        leg.position.set(Math.cos(a) * 0.24, 0.6, Math.sin(a) * 0.24);
        leg.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
        leg.castShadow = true;
        tri.add(leg);
      }
      const headMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8),
        new THREE.MeshLambertMaterial({ color: 0x2a2a2c }));
      headMesh.position.y = 1.22;
      tri.add(headMesh);
      const camModel = spawn('Camera_01', { s: 1.4 });
      camModel.position.set(0, 1.28, 0);
      camModel.rotation.y = -Math.PI / 2;
      tri.add(camModel);
      // the recording light — a faint red dot, unlit so it stays red in the torch
      const rec = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), redMat);
      rec.position.set(0.09, 1.3, 0.09);
      tri.add(rec);
      this._camRecLight = rec;
      place(tri, rigX, rigZ, 0, Math.atan2(cam.x + 5.5 - rigX, cam.z - 3.0 - rigZ));
      solid(rigX, rigZ, 0.33);   // Teo's tripod is solid — don't ghost through the recording camera
    }
    // the flavor note in Lucía's sleeping bag (UNMARKED, non-evidence)
    this.addItem({
      id: 'campNote', x: cam.x + 6.1, z: cam.z - 4.7, y: ground(cam.x + 6.1, cam.z - 4.7, 0.3),
      marker: false, radius: 2.2,
      label: 'a page in the sleeping bag', mesh: paperMesh(0xcfc8b2),
      action: (d) => this.pickupNote(d, 'campNote'),
    });

    // =================================================== 2) Delfina's grave
    // At the old arrayán Eliseo keeps (npcs.wireTree). The tree grows over her.
    {
      const w = this.npcs.wireTree;
      const gx = w.x + 0.95, gz = w.z - 1.35;
      headstone(gx, gz, 0.6, 0.16, 0.4, 0.56,
        ['DELFINA', 'ALDAO', '1934 – 1944']);
      // a low mound of earth + roots half-swallowing the stone
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x3a3226 }));
      mound.scale.set(1.1, 0.4, 1.0);
      place(mound, gx, gz, -0.02);
      this.addItem({
        id: 'graveNote', x: gx, z: gz, y: ground(gx, gz, 0.4),
        marker: false, radius: 2.2, repeatable: true,
        label: 'read the headstone',
        action: () => this.readNote('graveNote'),
      });
    }

    // ================================================== 3) the salt line
    // The deed's covenant: "salt laid at every threshold." Thin, flat, walkable —
    // never blocks a door. Front laid clean; the back door's line scuffed and
    // broken ("the back door twice, it forgets").
    {
      const saltStrip = (x, z, w, y, ry = 0, d = 0.15) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.028, d), saltMat);
        m.position.set(x, y, z); m.rotation.y = ry;
        m.receiveShadow = true;
        scene.add(m);
        return m;
      };
      const HY = LAYOUT.house.y;
      // front threshold (world z ≈ −7.48), on top of the stone sill: one clean line.
      // b3: held as a reference so the revisit system can swap it, later in the
      // night, for a scuffed/broken variant — the covenant failing behind your back.
      this._frontSalt = saltStrip(1.0, -7.46, 1.34, HY + 0.09);
      // that broken variant: the same line kicked into gapped clumps with grains
      // dragged off it. Built now (hidden) so its material warms behind the title
      // screen; the revisit controller shows it — and hides the clean line — once.
      this._frontSaltBroken = new THREE.Group();
      for (const [ox, ow, orr] of [[-0.52, 0.30, 0.06], [0.06, 0.20, 0.5], [0.5, 0.26, -0.32]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(ow, 0.026, 0.12), saltMat);
        seg.position.set(1.0 + ox, HY + 0.092, -7.46 + (Math.random() - 0.5) * 0.05);
        seg.rotation.y = orr;
        this._frontSaltBroken.add(seg);
      }
      for (let i = 0; i < 6; i++) {   // grains kicked clear of the line
        const gr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), saltMat);
        gr.position.set(1.0 + (Math.random() - 0.5) * 1.25, HY + 0.09, -7.6 + (Math.random() - 0.5) * 0.4);
        this._frontSaltBroken.add(gr);
      }
      this._frontSaltBroken.visible = false;
      scene.add(this._frontSaltBroken);
      // back threshold (world z ≈ −20.5): broken into two scuffed halves + a
      // kicked smear, the covenant's weak point
      const byY = ground(0, -20.5, 0.03);
      saltStrip(-0.4, -20.5, 0.44, byY);
      saltStrip(0.42, -20.5, 0.34, byY);
      saltStrip(0.18, -20.28, 0.3, byY + 0.002, 0.5, 0.1);   // scuffed offset, as if stepped through
    }

    // ================================================= 4) the north cemetery
    // High in the pines, out of the water's hearing — the graves they DID make,
    // the payoff for walking into the empty north forest. A proper enclosed
    // family plot: a low rusted iron railing with spear-tipped pickets and a
    // gate you walk through, orderly rows of Aldao headstones facing the gate,
    // a family monument at the head, and the ruin of an older stone wall behind.
    {
      const C = LAYOUT.cemetery;
      const zS = C.z + 3.7;                 // south run — the side Ana approaches; holds the gate
      const zN = C.z - 3.7;                 // north run — uphill
      const xW = C.x - 4.4, xE = C.x + 4.4; // east/west runs
      const xGL = C.x - 0.85, xGR = C.x + 0.85; // the gate opening

      // ---- the wrought-iron railing (one merged mesh, faceted rusted iron) ----
      const ironMat = new THREE.MeshLambertMaterial({ color: 0x2c2823, flatShading: true });
      const ironGeos = [];
      // a spear-tipped vertical picket, grounded to the local slope
      const picket = (x, z, h = 0.6, lean = 0) => {
        const y0 = gh(x, z);
        const bar = new THREE.BoxGeometry(0.034, h, 0.034);
        if (lean) bar.rotateZ(lean);
        bar.translate(x, y0 + h / 2, z);
        ironGeos.push(bar);
        const tip = new THREE.ConeGeometry(0.03, 0.11, 4);
        if (lean) tip.rotateZ(lean);
        tip.translate(x, y0 + h + 0.05, z);
        ironGeos.push(tip);
      };
      // fill a straight run with pickets + a top & bottom rail that hug the slope
      const railRun = (ax, az, bx, bz, h = 0.6) => {
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(2, Math.round(len / 0.34));
        const dx = (bx - ax) / n, dz = (bz - az) / n;
        const ang = Math.atan2(dz, dx);
        for (let i = 0; i <= n; i++) {
          if (i > 0 && i < n && Math.random() < 0.06) continue;   // an occasional lost picket
          picket(ax + dx * i, az + dz * i, h + (Math.random() - 0.5) * 0.05,
            Math.random() < 0.12 ? (Math.random() - 0.5) * 0.2 : 0);
        }
        for (const rh of [h * 0.85, 0.14]) {                       // top & bottom rails
          for (let i = 0; i < n; i++) {
            const x0 = ax + dx * i, z0 = az + dz * i, mx = x0 + dx / 2, mz = z0 + dz / 2;
            const seg = new THREE.BoxGeometry(Math.hypot(dx, dz) + 0.02, 0.03, 0.045);
            seg.rotateY(-ang);
            seg.translate(mx, gh(mx, mz) + rh, mz);
            ironGeos.push(seg);
          }
        }
      };
      // a corner / gate post, taller with a ball finial (collider added by caller)
      const post = (x, z, h = 1.0) => {
        const y0 = gh(x, z);
        const col = new THREE.BoxGeometry(0.09, h, 0.09); col.translate(x, y0 + h / 2, z);
        const cap = new THREE.BoxGeometry(0.13, 0.05, 0.13); cap.translate(x, y0 + h + 0.025, z);
        const ball = new THREE.SphereGeometry(0.05, 8, 6); ball.translate(x, y0 + h + 0.1, z);
        ironGeos.push(col, cap, ball);
      };
      railRun(xW, zN, xE, zN);              // north (uphill)
      railRun(xW, zN, xW, zS);              // west
      railRun(xE, zN, xE, zS);              // east
      railRun(xW, zS, xGL, zS);             // south, left of the gate
      railRun(xGR, zS, xE, zS);             // south, right of the gate
      post(xW, zN); post(xE, zN); post(xW, zS); post(xE, zS);      // four corners
      post(xGL, zS, 1.16); post(xGR, zS, 1.16);                    // gate posts, taller

      // the gate arch — a shallow iron curve spanning the posts
      {
        const top = 1.16, apex = 0.42, yL = gh(xGL, zS), yR = gh(xGR, zS), segs = 7;
        const at = (t) => [xGL + (xGR - xGL) * t, (yL + (yR - yL) * t) + top + Math.sin(t * Math.PI) * apex];
        for (let i = 0; i < segs; i++) {
          const [x0, y0] = at(i / segs), [x1, y1] = at((i + 1) / segs);
          const seg = new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.02, 0.04, 0.04);
          seg.rotateZ(Math.atan2(y1 - y0, x1 - x0));
          seg.translate((x0 + x1) / 2, (y0 + y1) / 2, zS);
          ironGeos.push(seg);
        }
        // a chain dropping from the apex for the dead lantern
        const chain = new THREE.CylinderGeometry(0.006, 0.006, 0.32, 4);
        chain.translate(C.x, gh(C.x, zS) + top + apex - 0.16, zS);
        ironGeos.push(chain);
      }

      // two gate leaves in the opening — one hanging ajar into the plot, one shut.
      // dir (±1) mirrors via the x-translations, never geometry.scale(), so the
      // normals stay outward (a negative scale would flip winding → inside-out).
      const gateLeaf = (hingeX, dir, swing) => {
        const y0 = gh(hingeX, zS), W = xGR - xGL - 0.06, H = 0.94, parts = [];
        for (const off of [0.02, W - 0.02]) {                      // side stiles
          const s = new THREE.BoxGeometry(0.03, H, 0.03); s.translate(off * dir, H / 2, 0); parts.push(s);
        }
        for (const rh of [H - 0.08, 0.12]) {                       // rails
          const r = new THREE.BoxGeometry(W, 0.028, 0.036); r.translate((W / 2) * dir, rh, 0); parts.push(r);
        }
        for (let i = 1; i <= 3; i++) {                             // inner pickets + tips
          const off = (W * i) / 4;
          const p = new THREE.BoxGeometry(0.026, H - 0.16, 0.026); p.translate(off * dir, (H - 0.16) / 2 + 0.06, 0); parts.push(p);
          const t = new THREE.ConeGeometry(0.026, 0.08, 4); t.translate(off * dir, H - 0.02, 0); parts.push(t);
        }
        for (const g of parts) {                                   // swing about the hinge, then place
          g.rotateY(swing * dir);
          g.translate(hingeX, y0, zS);
          ironGeos.push(g);
        }
      };
      gateLeaf(xGL, 1, 0.78);      // left leaf, swung open into the plot
      gateLeaf(xGR, -1, 0.05);     // right leaf, all but shut

      const iron = new THREE.Mesh(mergeGeometries(ironGeos, false), ironMat);
      for (const g of ironGeos) g.dispose();
      iron.castShadow = true;
      scene.add(iron);

      // railing colliders (thin walls; the gate opening is left free to walk through)
      col.addBox((xW + xGL) / 2, zS, xGL - xW, 0.2);   // south left
      col.addBox((xGR + xE) / 2, zS, xE - xGR, 0.2);   // south right
      col.addBox(C.x, zN, xE - xW, 0.2);               // north
      col.addBox(xW, C.z, 0.2, zS - zN);               // west
      col.addBox(xE, C.z, 0.2, zS - zN);               // east
      solid(xGL, zS, 0.13); solid(xGR, zS, 0.13);      // gate posts

      // the dead lantern hung under the arch (no light — the keepers are long gone)
      place(spawn('Lantern_01', { s: 0.5 }), C.x, zS, 0.96, 0);

      // ---- the family monument at the head of the plot (readable, non-evidence) ----
      const gx = C.x, gz = C.z - 2.5;
      {
        const mon = new THREE.Group();
        const box = (w, h, d, y) => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
          b.position.y = y; b.castShadow = true; mon.add(b); return b;
        };
        box(1.0, 0.2, 1.0, 0.1);           // base step
        box(0.74, 0.18, 0.74, 0.29);       // second step
        box(0.46, 0.82, 0.46, 0.79);       // pedestal
        box(0.14, 0.66, 0.14, 1.53);       // cross — upright
        box(0.46, 0.14, 0.14, 1.62);       // cross — arms
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5),
          engraveMat(['INALCO', '·', 'ALDAO', '1944']));
        plate.position.set(0, 0.86, 0.235);
        mon.add(plate);
        place(mon, gx, gz, 0, 0.02);
        solid(gx, gz, 0.62);
        this.addItem({
          id: 'cemeteryNote', x: gx, z: gz, y: ground(gx, gz, 0.9),
          marker: false, radius: 2.8, repeatable: true,
          label: 'read the family monument',
          action: () => this.readNote('cemeteryNote'),
        });
      }

      // ---- orderly rows of Aldao headstones, all facing the gate (south) ----
      const epitaphs = [
        ['ALDAO', '1944'], ['M. ALDAO', '1944'], ['R. ALDAO', '1943'], null,
        ['ALDAO', '1944'], ['C. ALDAO', '1944'], null, ['ALDAO', '·'],
      ];
      let ei = 0;
      const graveMound = (x, z) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: 0x35301f }));
        m.scale.set(0.98, 0.26, 1.5);
        place(m, x, z, -0.03);
      };
      for (const rz of [C.z - 0.9, C.z + 0.7]) {          // two tidy rows
        for (const rx of [-2.9, -1.55, 1.55, 2.9]) {      // aisle kept clear up the middle
          const ry = (Math.random() - 0.5) * 0.08, tilt = (Math.random() - 0.5) * 0.14;
          headstone(C.x + rx, rz, ry, tilt, 0.36 + Math.random() * 0.08, 0.5 + Math.random() * 0.16,
            epitaphs[ei % epitaphs.length]);
          if (Math.random() < 0.5) graveMound(C.x + rx, rz + 0.75);   // mound at the foot
          ei++;
        }
      }

      // ---- older graves at the edges: two leaning wooden crosses ----
      const woodCross = (x, z, ry, tilt) => {
        const g = new THREE.Group();
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), woodMat);
        v.position.y = 0.36; v.castShadow = true; g.add(v);
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), woodMat);
        h.position.y = 0.52; g.add(h);
        place(g, x, z, 0, ry); g.rotation.z = tilt;
      };
      woodCross(C.x + 3.4, C.z - 1.9, -0.2, 0.12);
      woodCross(C.x - 3.5, C.z - 2.2, 0.25, -0.1);

      // ---- a small unmarked child's stone, set apart in the near corner ----
      headstone(C.x - 3.3, C.z + 2.3, 0.1, 0.05, 0.24, 0.3);
      graveMound(C.x - 3.3, C.z + 2.9);
      // a wilted bouquet laid at it — dark stems, faded petals
      {
        const g = new THREE.Group();
        const stemMat = new THREE.MeshLambertMaterial({ color: 0x3a3a2a });
        const petMat = new THREE.MeshLambertMaterial({ color: 0x6b3a44 });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.22, 4), stemMat);
          stem.position.set(Math.cos(a) * 0.03, 0.1, Math.sin(a) * 0.03);
          stem.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5); g.add(stem);
          const pet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), petMat);
          pet.position.set(Math.cos(a) * 0.08, 0.19, Math.sin(a) * 0.08); g.add(pet);
        }
        place(g, C.x - 3.0, C.z + 2.55, 0, Math.random() * Math.PI);
      }

      // ---- a burnt-out votive candle at the foot of the monument ----
      {
        const g = new THREE.Group();
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10),
          new THREE.MeshLambertMaterial({ color: 0x20302f, transparent: true, opacity: 0.5 }));
        jar.position.y = 0.05; g.add(jar);
        const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 8),
          new THREE.MeshLambertMaterial({ color: 0xcfc7b0 }));
        wax.position.y = 0.03; g.add(wax);
        const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 4), charMat);
        wick.position.y = 0.065; g.add(wick);
        place(g, gx + 0.5, gz + 0.75, 0);
      }

      // ---- a stone bench inside the gate, worn to face the monument ----
      {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.34), stoneMat);
        seat.position.y = 0.42; seat.castShadow = true; g.add(seat);
        for (const ox of [-0.44, 0.44]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.28), stoneMat);
          leg.position.set(ox, 0.2, 0); g.add(leg);
        }
        place(g, C.x + 2.6, C.z + 2.4, 0);
        solid(C.x + 2.6, C.z + 2.4, 0.55);
      }

      // ---- the ruin of the ORIGINAL wall behind the iron, uphill (older care) ----
      wallSeg(C.x - 2.2, zN - 0.8, 1.4, 0.06);
      wallSeg(C.x - 0.7, zN - 0.95, 1.3, -0.04);
      // (gap — the old wall is collapsed in the middle)
      wallSeg(C.x + 2.0, zN - 0.8, 1.2, 0.08);
    }
  }

  // ----------------------------------------------------------------- events
  startPower() {
    if (this.powerOn) return;
    const firstTime = !this._everPowered;
    this._everPowered = true;
    this.powerOn = true;
    this.buildings.setPower(true);
    this.audio.setGenerator(true);
    this.audio.switchClick();
    // c3: turn the heat up while she's lit — more/faster spawns, and the
    // ambient Returned bias toward the lit house (a3 then walks them up to the
    // windows). All of it drops the instant she kills the lights (stopPower).
    this.director.setPoweredBonus(this._poweredBonus);
    if (!this.boatStarted) this.director.setSpawnFocus(this._powerFocus);
    if (firstTime) {
      this.ui.say('ANA', 'Light. Now I can see — and so can everything else. I can kill it again whenever I’ve had enough of being the brightest thing on this shore.', 5.5);
      this.setObjective('Find the boathouse key', 'the study drawer, in the house');
      this.checkpoint.set(1, 0, -4.6);
      this.director.setPressure(2);
      this.scareArmed = !this.scareDone;
      // archivists take up posts near what's left to find
      setTimeout(() => {
        this.director.spawnGuard('archivero', LAYOUT.green.x - 7, LAYOUT.green.z + 5);
        this.director.spawnGuard('archivero', -18, 42);
      }, 5000);
      // the piano has opinions
      this.pianoTimer = 42;
    } else {
      this.ui.say('ANA', 'Lights on again. Loud, bright, watched — but at least I can see the lock. Kill it again the second I have what I came for.', 4.6);
      if (!this.boatStarted && this.director.pressure < 2) this.director.setPressure(2);
    }
  }

  // c3: hold E on a running generator to shut it down. The house goes dark and
  // quieter — the powered bonus and the house spawn-focus drop, the window-
  // watchers disperse (a3 reads isPowered() every frame), and a Returned that
  // has cornered her in the dark house loses conviction faster. She can restart
  // it whenever she needs the light again — her call.
  stopPower() {
    if (!this.powerOn) return;
    this.powerOn = false;
    this.buildings.setPower(false);
    this.audio.setGenerator(false);
    this.audio.switchClick();
    this.director.setPoweredBonus(0);
    if (!this.boatStarted) this.director.setSpawnFocus(null);
    this.ui.say('ANA', 'Dark again. Blind — but so is it. Let the shore forget where I am for a while.', 4.4);
  }

  startFinale() {
    this.boatStarted = true;
    this._lastBoatLeft = null; this._boatAway = false;   // fresh trackers each time the finale is entered
    this.checkpoint.set(LAYOUT.boathouse.x - 6, 0, LAYOUT.boathouse.z - 3);
    this.audio.boatSputter();
    this.buildings.lantern.mat.color.setHex(0xffb46b);
    this.buildings.lantern.light.intensity = 5;
    this.ui.say('ANA', 'Come on, catch. The fog’s down and the sky’s going grey — this is the crossing. Get me off this lake before the light’s all the way up.', 5);
    this.director.setPressure(3);
    this.director.setSpawnFocus(new THREE.Vector3(LAYOUT.boathouse.x, 0, LAYOUT.boathouse.z - 8));
  }

  triggerScare() {
    this.scareDone = true;
    this.scareArmed = false;
    const A = this.buildings.anchors;
    this.director.spawnScripted(A.scareSpawn.x, A.scareSpawn.z);
    this.fx.glitch = 1;
    this.fx.staticVis = Math.max(this.fx.staticVis, 0.5);
    this.audio.scream(0, 'testigo');
  }

  onScareResolved() {
    this.fx.glitch = Math.max(this.fx.glitch, 0.9);
    this.fx.flash = Math.max(this.fx.flash, 0.35);
    this.ui.say('ANA', 'I hate this house.', 2.4);
  }

  // ------------------------------------------------- c2 · don't answer the water
  // Is Ana at the water's edge / on the jetty (voice range)? Cheap; no gates.
  _nearWater(p) {
    const onJetty = Math.abs(p.x - LAYOUT.dock.x) < 1.7 && p.z > 56.5 && p.z < 80;
    if (onJetty) return true;
    return p.z > LAYOUT.shoreZ - 4 && this.world.groundHeight(p.x, p.z) < 1.2;
  }

  // May a call fire right now? Gated HARD to the danger peak and the waterline so
  // it can never fire in the low-tide early game (the play-test runs at phase≈0).
  _waterEligible(p) {
    if (!this.night) return false;
    if (this.boatStarted || this.over || this.girlAttackStarted) return false;
    if (this.night.tide <= 0.52) return false;    // danger PEAK only (c1 arc ~0.5–0.7)
    if (this.night.phase < 0.28) return false;    // never near the start of the night
    if (this.director.chasingCount() > 0) return false;   // not mid-chase
    if (!this._nearWater(p)) return false;
    // fire = safety: the lake will not call over a hearth
    for (const s of this.safeSpots()) if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) return false;
    return true;
  }

  // Find the walkable water's-edge point in front of her to place the voice/trap.
  // Probes lakeward and keeps the farthest walkable cell before deep water; null
  // if there is no reachable edge (she is already in the water's mouth — skip).
  _waterSpawnPoint(p) {
    const gh = this.world.groundHeight;
    let best = null;
    for (const [dx, dz] of WATER_DIRS) {
      let last = null;
      for (let r = 2.4; r <= 6.5; r += 0.7) {
        const x = p.x + dx * r, z = p.z + dz * r;
        const g = gh(x, z);
        if (g < -0.7) break;                       // deep water past here
        if (g > -0.25 && g < 1.4) last = { x, z, r };
      }
      if (last && (!best || last.r > best.r)) best = last;
    }
    return best;
  }

  _startWaterCall(src) {
    this._wcActive = true;
    this._wcT = 6.2;
    this._wcSecond = 3.0;
    this._wcCount++;
    this._wcCd = 85 + Math.random() * 60;   // keep calls rare — a couple a night
    this._wcSrc.set(src.x, this.world.groundHeight(src.x, src.z), src.z);
    // steer the answer interactable to the water's edge the voice comes from
    if (this._answerItem) {
      this._answerItem.x = this._wcSrc.x;
      this._answerItem.z = this._wcSrc.z;
      this._answerItem.y = this._wcSrc.y + 1.0;
    }
    // the pull: a whisper/water swell and a breath of static, no chase (yet)
    this.staticSpike = Math.max(this.staticSpike, 0.5);
    this.fx.glitch = Math.max(this.fx.glitch, 0.22);
    const pan = Math.max(-1, Math.min(1, (this._wcSrc.x - this.player.pos.x) / 20));
    this.audio.nameCall(pan);
    if (this._wcCount % 2 === 1)
      this.ui.say('', '(Out on the water, close now, a voice says your name — Lucía’s voice, exactly Lucía’s voice.)', 4.6);
    else
      this.ui.say('', '(A voice says your name off the water, in Mamá’s voice, from a kitchen a thousand kilometres and twenty years from here.)', 4.6);
  }

  // ANSWERING = the trap: a Returned surges up out of the shallows, a hard scare
  // and composure hit — but never the killing blow, and she can flash or flee it.
  answerWaterCall(byWading) {
    if (!this._wcActive) return;
    this._wcActive = false;
    this._wcSecond = null;
    this.answeredWater = true;
    this.director.spawnScripted(this._wcSrc.x, this._wcSrc.z);
    // hard hit, clamped so it can never be the death blow itself
    this.player.composure = Math.max(12, this.player.composure - 32);
    this.player._regenWait = TUNE.regenDelay;
    this.fx.damage = 1;
    this.fx.glitch = Math.max(this.fx.glitch, 0.95);
    this.fx.flash = Math.max(this.fx.flash, 0.3);
    this.staticSpike = Math.max(this.staticSpike, 0.9);
    const pan = Math.max(-1, Math.min(1, (this._wcSrc.x - this.player.pos.x) / 20));
    this.audio.scream(pan, 'doble');
    this.ui.clearSubs();
    this.ui.say('ANA', byWading
      ? 'The water’s at my knees — when did I — that is NOT her. That was never her. Back. Get back.'
      : 'I answered. God help me, I answered — and that face coming up out of the lake is not hers. Move.', 4.6);
  }

  // RESISTING = the default, safe path: look away, walk off, or just hold. Small
  // composure reward + a permanent steadying of the nerves, and Ana's resolve.
  _resolveWaterResist(early) {
    if (!this._wcActive) return;
    this._wcActive = false;
    this._wcSecond = null;
    this.resistedWater++;
    const max = TUNE.composureMax + this.player.maxBonus;
    this.player.composure = Math.min(max, this.player.composure + 22);
    this.player.maxBonus += this.resistedWater === 1 ? 5 : 2;
    this.audio.pickup();
    this.staticSpike = Math.max(0, this.staticSpike - 0.3);
    if (this.resistedWater === 1)
      this.ui.say('ANA', 'I don’t answer. I don’t look back. Whatever that is, it can wear her voice — not her. That’s the part it can never do.', 5);
    else
      this.ui.say('ANA', early ? 'Keep walking. Eyes on the path, not the water.' : 'Not her. I know the trick now. I don’t answer.', 3.4);
  }

  _waterUpdate(dt, p) {
    if (!this.night) return;
    if (this._wcActive) {
      this._wcT -= dt;
      if (this._wcSecond != null) {
        this._wcSecond -= dt;
        if (this._wcSecond <= 0) {
          this._wcSecond = null;
          const pan = Math.max(-1, Math.min(1, (this._wcSrc.x - p.x) / 20));
          this.audio.nameCall(pan);
          this.staticSpike = Math.max(this.staticSpike, 0.45);
        }
      }
      const dSrc = Math.hypot(p.x - this._wcSrc.x, p.z - this._wcSrc.z);
      if (dSrc < 1.6) { this.answerWaterCall(true); return; }            // waded in = answered
      if (!this._nearWater(p) || dSrc > 9) { this._resolveWaterResist(true); return; }  // walked away = resisted
      if (this._wcT <= 0) this._resolveWaterResist(false);              // held out = resisted
      return;
    }
    // not active — maybe begin one (rare, roll-gated)
    this._wcCd -= dt;
    if (this._wcCd <= 0 && this._wcCount < 3 && this._waterEligible(p)) {
      if (Math.random() < 0.5) {
        const src = this._waterSpawnPoint(p);
        if (src) this._startWaterCall(src);
        else this._wcCd = 5;      // no reachable edge here; retry shortly
      } else {
        this._wcCd = 5 + Math.random() * 6;
      }
    }
  }

  // --------------------------------------------------------------- triggers
  buildTriggers() {
    const T = this.triggers;
    T.push({
      test: (p) => p.z < 48,
      fire: () => {
        this.fx.staticVis = 0.4;
        this.staticSpike = 0.9;
        this.ui.say('ANA', 'The recorder’s picking something up. Lucía’s recorder — I only carry it for luck. It isn’t even on.', 4);
      },
    });
    T.push({
      test: (p) => Math.hypot(p.x - 1, p.z + 5) < 4,
      fire: () => this.ui.say('ANA', 'Shutters, lakefront, twelve rooms. Famous for absolutely nothing that happened here.', 4),
    });
    T.push({
      test: (p) => p.z > 44 && p.z < 60 && p.x > 6,
      fire: () => this.ui.say('ANA', 'A fire on the beach. Fires mean people. Please, PLEASE mean people.', 3.8),
    });
    T.push({
      test: (p) => Math.hypot(p.x - LAYOUT.green.x, p.z - LAYOUT.green.z) < 7 && !this.met.mara,
      fire: () => this.ui.say('ANA', 'There is someone sitting in the greenhouse. Sitting is fine. Sitting is what people do.', 4),
    });
    T.push({
      test: (p) => this.buildings.insideHouse(p.x, p.z),
      fire: () => {
        this.ui.say('ANA', 'Hello? ...Photographer. Mostly harmless.', 3.2);
        setTimeout(() => {
          if (!this.powerOn) {
            this.ui.say('ANA', 'Breaker’s dead. There was a shed out back — a generator, if this place is honest.', 4.2);
            this.setObjective('No power — start the generator', 'the shed, behind the house');
          }
        }, 3600);
      },
    });
    // hallway scare: on entering the foyer zone after power on
    T.push({
      repeat: true,
      test: (p) => {
        const inZone = p.x > -0.2 && p.x < 3.6 && p.z > -19 && p.z < -9 && this.buildings.insideHouse(p.x, p.z);
        const fire = inZone && !this._wasInScareZone && this.scareArmed;
        this._wasInScareZone = inZone;
        return fire;
      },
      fire: () => this.triggerScare(),
    });
    // descending into the cellar (only once actually down there — the footprint
    // is shared with the kitchen a storey above)
    T.push({
      test: (p) => this.buildings.cellar.playerBelow,
      fire: () => {
        this.staticSpike = Math.max(this.staticSpike, 0.6);
        this.ui.say('ANA', '(cold. colder than outside. and there is someone down here — small, sitting very still.)', 4.4);
      },
    });

    // ---- b1: sparse acknowledgements for reaching each unmarked discovery ----
    const cam = LAYOUT.crewCamp;
    T.push({   // the drowned crew's camp
      test: (p) => Math.hypot(p.x - (cam.x + 6), p.z - (cam.z - 3.5)) < 5,
      fire: () => this.ui.say('ANA', 'Their camp. Tents still up, gear still out — like they walked off between takes. And that camera’s recording. Red light. Nobody’s touched it in days.', 5.4),
    });
    T.push({   // Delfina's grave under the arrayán
      test: (p) => Math.hypot(p.x - (this.npcs.wireTree.x + 0.95), p.z - (this.npcs.wireTree.z - 1.35)) < 2.6,
      fire: () => this.ui.say('ANA', 'There’s a stone under the roots. A child — nineteen forty-four. This is what Eliseo keeps. Not a tree. A grave.', 5),
    });
    T.push({   // the north cemetery — the "why is this out here… oh" beat
      test: (p) => Math.hypot(p.x - LAYOUT.cemetery.x, p.z - LAYOUT.cemetery.z) < 6,
      fire: () => this.ui.say('ANA', 'Headstones. Out here, in the middle of the trees, halfway up the hill. ...Of course. As far from the water as anyone could carry them.', 5.2),
    });
    T.push({   // first notice of the salt at the threshold
      test: (p) => Math.hypot(p.x - 1, p.z + 7.4) < 1.9,
      fire: () => this.ui.say('ANA', 'Salt. Poured across the doorway in a line. Someone still tends this house. They just don’t live in it.', 4.4),
    });

    // ---- c4: teaching sightings — one per Returned, each names its tell. All
    // three are gated on hasHouseKey (never set by the play-test) via
    // _teachReady, so none can fire during the test's spawn/flash/damage windows.
    // repeat:true so a sighting that can't place a clear demo yet simply retries
    // next frame; the real one-time gate is _teachDone[kind] in beginTeaching.
    T.push({   // THE HALF-SEEN — first approach to the house (pre-power)
      repeat: true,
      test: (p) => this._teachReady('testigo') &&
        p.z > -2 && p.z < 16 && Math.abs(p.x) < 15,
      fire: () => this.beginTeaching('testigo'),
    });
    T.push({   // THE DRAFT — first approach to the greenhouse
      repeat: true,
      test: (p) => this._teachReady('doble') &&
        Math.hypot(p.x - LAYOUT.green.x, p.z - LAYOUT.green.z) < 12,
      fire: () => this.beginTeaching('doble'),
    });
    T.push({   // THE CONGREGATION — first approach to the shed / generator (pre-power)
      repeat: true,
      test: (p) => this._teachReady('archivero') &&
        Math.hypot(p.x - LAYOUT.shed.x, p.z - LAYOUT.shed.z) < 12,
      fire: () => this.beginTeaching('archivero'),
    });
  }

  // c4: is a first sighting of `kind` allowed to fire right now? hasHouseKey is
  // the hard test-safety gate (play.mjs never picks up the key). The night is
  // kept early so ambient pressure stays low around the lesson; the Half-Seen
  // and Congregation are held to the dark (both are naturally reached before the
  // generator), while the Draft (greenhouse) may be met after power, so it isn't.
  _teachReady(kind) {
    if (!this.hasHouseKey || this.over) return false;
    if (this._teach || this._teachDone[kind]) return false;
    if (this.night && this.night.phase >= 0.42) return false;   // the early night, before the tide's danger peak
    if (kind !== 'doble' && this.powerOn) return false;
    return true;
  }

  // c4: a clear, distant point ahead of Ana for a demo to rise on — tried
  // straight ahead first, then fanned out to dodge the lake and any building.
  _teachSpot(dist) {
    const p = this.player.pos, d = this.player.camDir();
    const gh = this.world.groundHeight, col = this.director.colliders;
    for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.5]) {
      const cs = Math.cos(a), sn = Math.sin(a);
      const hx = d.x * cs - d.z * sn, hz = d.x * sn + d.z * cs;
      const x = p.x + hx * dist, z = p.z + hz * dist;
      if (gh(x, z) < 0.2) continue;                        // not in the lake
      if (this.buildings.insideHouseM(x, z, 2)) continue;  // not inside the house
      const s = col.resolve(x, z, 0.5);                    // not inside any building/collider
      if (Math.hypot(s.x - x, s.z - z) > 0.4) continue;
      if (Math.hypot(x - p.x, z - p.z) < 9) continue;      // well beyond the 4.5 m fear aura
      return { x, z };
    }
    return null;
  }

  // c4: begin a first sighting. Bails (without consuming the one-time flag) if a
  // sighting is already playing or no clear ground is found — repeat:true retries.
  beginTeaching(kind) {
    if (!this._teachReady(kind)) return;
    const dist = kind === 'testigo' ? 20 : kind === 'doble' ? 17 : 16;
    const spot = this._teachSpot(dist);
    if (!spot) return;
    const enemy = this.director.spawnDemo(kind, spot.x, spot.z);
    if (!enemy) return;
    this._teachDone[kind] = true;
    // BAL: the lesson has begun — this kind may now manifest as a lethal ambient
    // Returned (the Director gates ambient spawns on these flags). Lethal ones of
    // a kind only appear AFTER the player has been shown its tell.
    this.director.taught[kind] = true;
    this._teach = { kind, enemy, t: 0, tell: false, hint: false, gone: false };
    this.audio.drip?.(0);
    const open = {
      testigo: 'Wait — something on the lawn. Don’t move.',
      doble: 'There’s a figure out there. Standing perfectly still.',
      archivero: 'Something’s standing by the shed. Tall as a pillar. It hasn’t moved.',
    }[kind];
    this.ui.say('ANA', open, 3);
  }

  // c4: run the active sighting — tell line, danger hint, and a closing beat as
  // it leaves. dt-timed (so it never advances behind an open note), one live at
  // a time. Non-lethal is enforced entirely in enemies.js (updateDemo).
  _teachingUpdate(dt) {
    const tc = this._teach;
    if (!tc) return;
    tc.t += dt;
    const gone = !this.director.enemies.includes(tc.enemy);

    if (!tc.tell && tc.t > 1.6) {
      tc.tell = true;
      this.ui.say('ANA', {
        testigo: 'It stopped the second I looked at it — held completely still. Subjects don’t do that; people flinch, they breathe. The looking is what pins it. The moment I look away, it moves. Keep it in frame.',
        doble: 'It doesn’t move while I’m watching it. Not a muscle. But every time I glance away it’s closer than it was. ...Don’t look away from that one. Not for a second.',
        archivero: 'It isn’t coming for me. It’s just... waiting to be seen. Too many faces, and every mouth open on the same hymn. It has all night, and it knows I don’t.',
      }[tc.kind], 6.5);
    }

    if (!tc.hint && tc.t > 8.5 && !gone) {
      if (tc.kind === 'testigo') {
        tc.hint = true;
        this.ui.say('ANA', 'And I can’t hold the stare forever. The longer I look, the more it feels like it’s winding up to move. Look, then look away — don’t make a contest of it.', 5.5);
      } else if (tc.kind === 'archivero') {
        tc.hint = true;
        this.ui.say('ANA', 'One flash won’t settle that one. It’s too many people at once — it’ll take three photographs to lose the argument.', 5);
      }
    }

    if (gone) {
      if (!tc.gone && tc.t > 1.5) {
        tc.gone = true;
        this.ui.say('ANA', {
          testigo: 'Gone. I looked away for half a second and the lawn was empty. ...The next one, I photograph. Two flashes.',
          doble: 'Gone — or it decided it was close enough for now. That one lives at the edge of your eye. Never turn your back on it.',
          archivero: 'It let me pass. It’ll be standing right there when I come back for the generator. It can afford to wait. I can’t.',
        }[tc.kind], 5);
      }
      this._teach = null;
    }
  }

  // ------------------------------------------------------------ interaction
  currentInteract(playerPos, camDir) {
    if (this.over) return null;
    const best = this._bestInteract;     // reused object — callers consume it within the frame
    let found = false, bestScore = 1e9;
    for (const it of this.items) {
      if (it.taken) continue;
      if (it.available && !it.available()) continue;
      const r = it.radius ?? TUNE.interactRange;
      const dx = it.x - playerPos.x, dz = it.z - playerPos.z;
      // squared-distance range test first — only sqrt the in-range survivors
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      const d = Math.sqrt(d2);
      const dy = Math.abs(it.y - (playerPos.y + 1.4));
      if (dy > 2.2) continue;
      // facing: strict at range, lenient point-blank — but never something behind you
      const dot = d > 1e-4 ? (dx / d) * camDir.x + (dz / d) * camDir.z : 1;
      if (dot < (d > 0.9 ? 0.25 : -0.35)) continue;
      const label = typeof it.label === 'function' ? it.label() : it.label;
      if (!label) continue;
      // prefer what you're looking at over what you're merely near
      const score = d * (1.35 - Math.max(0, dot) * 0.5);
      if (score < bestScore) { bestScore = score; best.item = it; best.label = label; found = true; }
    }
    return found ? best : null;
  }

  interact(item) {
    const holdS = typeof item.hold === 'function' ? item.hold() : item.hold;
    if (holdS) return;          // handled by the hold-E logic
    item.action(item);
    if (!item.repeatable) item.taken = true;
  }

  // ------------------------------------------------------------------ update
  update(dt, playerPos) {
    // triggers
    for (const t of this.triggers) {
      if (t.fired && !t.repeat) continue;
      if (t.test(playerPos)) {
        t.fired = true;
        t.fire();
      }
    }

    // Part B · Mara's walk + the shore ambush. Keep the "talk to Mara" anchor
    // pinned to her live position, and while a Returned has her, watch for the
    // rescue: photographing it until it dissolves → saved; timer out → taken.
    // Proximity does nothing — only the flash can pull her out of it.
    const mNpc = this._maraNpc || (this._maraNpc = this.npcs.byId('mara'));
    // Mara's anchor only needs re-pinning while she moves; when idle her position
    // is constant so the cached anchor already matches. Recompute during her walk
    // plus the one frame she stops (to capture her final resting spot). Non-walk
    // repositions (load/restore) sync the anchor directly in their own path.
    if (this._maraItem && this.maraSurvived !== false && mNpc && (mNpc.walking || this._maraWasWalking)) {
      this._maraItem.x = mNpc.x; this._maraItem.z = mNpc.z;
      this._maraItem.y = this.world.groundHeight(mNpc.x, mNpc.z) + 1.0;
    }
    this._maraWasWalking = !!(mNpc && mNpc.walking);
    this._escortUpdate(dt, playerPos);

    // c2 · the lake calls Ana's name at the danger peak near the waterline.
    // Runs every frame (self-gated); the play-test runs at low tide so it stays
    // silent there. Never during dialog/notes (this.update itself is sim-gated).
    this._waterUpdate(dt, playerPos);

    // c4 · advance any active teaching sighting (tell/hint/exit lines).
    this._teachingUpdate(dt);

    // b1: Teo's camera recording light — a brief red blink every ~1.6 s (cheap,
    // no new system; the material is unlit so it stays red under the torch)
    if (this._camRecLight) {
      const on = (performance.now() * 0.001) % 1.6 < 0.14;
      this._camRecLight.material.opacity = on ? 0.95 : 0.1;
    }

    // markers: a faint breath, not a beacon. Sweep only items that own a marker.
    const tt = performance.now() * 0.003;
    for (let i = 0; i < this._markerItems.length; i++) {
      const it = this._markerItems[i];
      if (it._marker && !it.taken)
        it._marker.material.opacity = 0.045 + (Math.sin(tt + it.x) * 0.5 + 0.5) * 0.09;
    }

    // piano incident
    if (this.pianoTimer != null) {
      this.pianoTimer -= dt;
      if (this.pianoTimer <= 0) {
        this.pianoTimer = null;
        if (this.buildings.insideHouse(playerPos.x, playerPos.z)) {
          this.audio.pianoPlink();
          setTimeout(() => this.audio.pianoPlink(), 700);
          this.fx.glitch = Math.max(this.fx.glitch, 0.5);
          this.ui.say('', '(the piano disagrees with something)', 3);
        }
      }
    }

    // enemy first-seen line
    if (!this.enemySeenLine && this.director.chasingCount() > 0 && this.director.nearestDist() < 24) {
      this.enemySeenLine = true;
      this.ui.say('ANA', 'That is NOT a hiker.', 2.8);
    }

    // the girl: she's come apart under five flashes
    if (this.girlAttackStarted && !this.girlResolved && this.buildings.cellar.girl.dead) {
      this.girlResolved = true;
      this.fx.flash = Math.max(this.fx.flash, 0.5);
      this.ui.say('ANA', 'Gone. She came apart like a photograph left in the rain. ...I am not asking anyone anything, ever again.', 4.8);
      if (this._savedObj) this.setObjective(this._savedObj.es, this._savedObj.en);
    }

    // c1 · first light approaches. As the night's phase climbs toward dawn the
    // fog is visibly thinning (world.setFogLevel burns it off with the dawn) and
    // the water becomes crossable — the felt finish line. One-time acknowledgement,
    // and a nudge on the objective if she is still working toward the boat.
    if (this.night && !this._firstLightLine && this.night.phase > 0.82) {
      this._firstLightLine = true;
      this.ui.say('ANA', 'The fog’s going down. I can see the far shore — grey, but there, for the first time all night. First light. The water will carry a boat now. Whatever I still mean to do here, I do it before the sun’s all the way up.', 6.4);
    }

    // c2 · the lake's LAST call, from the dock during the crossing (Lucía). Pure
    // atmosphere: no spawn, no damage — winning never depends on it. Gated on a
    // late phase so it can never fire in the play-test (which finishes at phase≈0).
    if (this.boatStarted && !this._finaleCallDone && this.night && this.night.phase > 0.5) {
      this._finaleCallT = (this._finaleCallT ?? 5) - dt;
      if (this._finaleCallT <= 0) {
        this._finaleCallDone = true;
        this.audio.nameCall(-0.55);
        this.ui.say('', '(Far behind you, from the dock, her voice calls your name once across the water. You keep your eyes on the grey line of the far shore.)', 5.4);
      }
    }

    // finale
    if (this.boatStarted && !this.over) {
      const A = this.buildings.anchors;
      const d = Math.hypot(playerPos.x - A.boat.x, playerPos.z - A.boat.z);
      if (d < 4.2) {
        this.boatProgress += dt;
        if ((this._sputT = (this._sputT ?? 0) - dt) <= 0) {
          this._sputT = 2.2;
          this.audio.boatSputter();
        }
        const left = Math.ceil(this.boatNeed - this.boatProgress);
        // Only re-issue when the shown value actually changes (was 60x/s). journal
        // already dedupes, but this avoids the per-frame string + object garbage.
        if (left !== this._lastBoatLeft) {
          this.setObjective(`The engine is catching... ${left}s`, 'stay close to the boat');
          this._lastBoatLeft = left;
        }
        this._boatAway = false;
      } else {
        if (!this._boatAway) {
          this.setObjective('Get back to the boat!', 'the engine dies without you');
          this._boatAway = true;
          this._lastBoatLeft = null;   // re-issue the countdown on return even if `left` is unchanged
        }
      }
      if (this.boatProgress >= this.boatNeed) {
        this.over = true;
        this.audio.setBoat(true);
        this.onGameOver(true, this.endingText());
      }
    }
  }

  endingText() {
    const n = this.evidence;
    const truth = n >= 5;
    let s = 'INALCO — FIRST LIGHT — ANA REYES\n\n';
    // c1: the escape pays off the "cross at first light" promise — the fog that
    // ran high in the dark hours has finally let the water go.
    s += 'The fog came up with the dark and it is going down with it.\nGrey light on the water, at last. The lake lets a boat cross\nnow — so I go.\n\n';
    if (truth) {
      s += 'Lucía is at the end of the dock. Exactly as I remember\nher — down to the collar of the jacket she left on the\nferry nine days ago. She is calling my name.\n\n';
      s += 'I know the rule now. I read the deed, the report, the\nlog. I know what this is.\n\n';
      s += 'So I look at her through the camera instead of my\neyes, and I take one photograph.\n\n';
      s += 'The flash shows what is actually standing on the dock:\ntall, patient, still dripping after eight days in that\nwater.\n\n';
      s += 'I don’t turn the boat around.\n\n';
      s += 'I get to grieve my sister now, instead of feeding the\nlake a memory of one. I keep the photograph. No one\nwill ever believe it. That was never the point.\n\n';
      s += `PROOF ${n}/6 — ENDING: "WHAT THE LAKE KEEPS"`;
    } else {
      s += 'I hear her. At the end of the dock, calling my name —\nLucía’s voice, Lucía’s shape in the fog.\n\n';
      s += 'I didn’t find enough. I don’t know. I only hope. And\nhope is the door this place has been waiting for me\nto open.\n\n';
      s += 'The engine catches. I turn the boat around.\n\n';
      s += 'The lake is generous. The lake gives everything back.\nAsk it for your sister and it will give you your sister,\nas well as it remembers her.\n\n';
      s += 'And it remembers you better every minute.\n\n';
      s += `PROOF ${n}/6 — ENDING: "WHAT THE LAKE GIVES BACK"`;
    }

    // ---- the people you met (or didn't)
    const ep = [];
    if (this.met.mara) {
      if (this.maraSurvived === false) {
        // she was taken on the shore path, walking to the boat
        ep.push('The thing on the shore reached Mara before your flash could.' +
          (this.maraFate === 'taken'
            ? ' The tape\nwent into the water with her — warm for a moment, then\nnot.'
            : ' Her headlamp\nis still up on the shingle somewhere, burning down to\nnothing.') +
          '\nThe call sheet on the porch counts to four now. It will\nnot hold there.');
      } else {
        // if the walk was ambushed and you pulled her out of it, say so
        const saved = this.maraSurvived === true
          ? '\nShe only reached the boat because you put the camera\nbetween her and the water. She hasn’t stopped shaking,\nand she hasn’t let go of your sleeve.'
          : '';
        if (this.maraFate === 'destroyed')
          ep.push('On the beach, Mara Vidal fed the tape to Rufino’s fire.\nIt burned green — seven weeks of Lucía alive, gone in\nabout a minute. Mara said it was the kindest thing\nshe’s done. She wasn’t wrong.');
        else if (this.maraFate === 'taken')
          ep.push('The master tape rides in your bag. It is warm.' +
            (truth ? '\nYou know what’s on it now, and you know better than\nto watch. Watching is remembering. It can wait. It is\npatient.' : '\nSomeday you’ll watch it, because you’ll want to see\nher move again. That is exactly what it is counting on.') + saved);
        else if (this.maraFate === 'kept')
          ep.push('Mara rides the bow with the tape in her lap, still deciding.\nSome cuts you can only make in daylight.' + saved);
        else
          ep.push('You left Mara in the greenhouse, still awake. The call\nsheet counts to four, then — quietly, hopefully — back\nup to five.');
      }
    } else {
      ep.push('(In the greenhouse, a call sheet keeps counting to four.)');
    }
    if (this.eliseoPromise === 'silence')
      ep.push((this.answeredWater
        ? 'You made the promise that mattered — and once tonight\nyou broke it, for a step and a half toward a voice in\nthe water, before you tore yourself back. It was enough\nof a lean for the lake to feel.'
        : 'You keep the promise that mattered. When the water\ncalled your name tonight, you didn’t answer, and you\ndidn’t look back.') +
        '\nSomewhere behind you, a wire scar heals over. Arrayanes\nremember longer than people do.');
    else if (this.eliseoPromise === 'tell')
      ep.push('You’ll tell her mother she drowned. Drowned, only. The\nrest of it dies with the ones who saw it — same as\nEliseo asked.\nThe arrayán keeps growing around her, the way it always has.');
    else if (this.eliseoQuest >= 2)
      ep.push('The old arrayán breathes without the wire, whatever\nelse did or didn’t happen tonight.');
    if (this.rufinoBond)
      ep.push('Rufino’s fire was still burning as you cleared the\npoint. He raised one hand and didn’t call out —\nfire-keepers learn not to shout across water.\nThe kiosk reopens Tuesday. The watch goes on, same as\nit has for three generations.');
    if (!this.met.rufino && !this.met.mara && !this.met.eliseo)
      ep.push('No one saw you leave. On this lake, that is its own kind of story.');

    // c2 · the water. The silence-promise block above already speaks to it; for
    // every other run, record whether Ana answered the lake or held against it.
    if (this.eliseoPromise !== 'silence') {
      if (this.answeredWater)
        ep.push('Once tonight the water called in a voice you loved, and\nyou took a step toward it before you knew you had. The\nlake felt you lean. It keeps that — the way it keeps\neverything — and it will wear that voice again, by darker\nwater, on a night you have let this one become a story.');
      else if (this.resistedWater > 0)
        ep.push('The water called your name in her voice, and called it\nagain, and every time you kept your eyes on the far shore\nand your feet on the wood. It never got the one thing off\nyou it cannot build for itself. You carry all of yourself\noff this lake.');
    }

    s += '\n\n· · ·\n\n' + ep.join('\n\n');

    s += '\n\n─────────────────────────────\nThe lake keeps what it is given. Give it nothing.';
    return s;
  }

  deathLine() {
    const l = DEATH_LINES[this._deathIdx % DEATH_LINES.length];
    this._deathIdx++;
    return l;
  }

  respawn(player) {
    this.director.clearAll();
    this.director.setSpawnFocus(this.boatStarted ? new THREE.Vector3(LAYOUT.boathouse.x, 0, LAYOUT.boathouse.z - 8) : null);
    // if the girl was mid-hunt, send her back to her chair; the encounter re-arms
    const g = this.buildings.cellar?.girl;
    if (g && !g.dead && this.girlAttackStarted) {
      g.reset();
      this.girlAttackStarted = false;
      this.girlAttackPending = false;
      this._girlWailed = false;
      this.girlQuestions = 0;
    }
    // c2: drop any live water-call so it doesn't resolve against the respawn point
    this._wcActive = false;
    this._wcSecond = null;
    this._wcCd = Math.max(this._wcCd, 20);
    player.pos.set(this.checkpoint.x, 0, this.checkpoint.z);
    player.composure = TUNE.composureMax;
    player.vel.set(0, 0, 0);
    player.dead = false;
  }
}
