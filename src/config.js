// Palette + tuning + world layout. Single source of truth.

export const PAL = {
  fog: 0x141f26,
  skyZenith: 0x060b10,
  skyHorizon: 0x24363f,
  moon: 0xe8f2f2,
  moonDirColor: 0x7e97a6,
  ambient: 0x35434c,
  ground: 0x39463c,
  groundDark: 0x2b362e,
  path: 0x5b4f3d,
  sand: 0x54524184,
  rock: 0x474e50,
  lakeDeep: 0x0a141a,
  lakeShallow: 0x14262e,
  arrTrunk: 0xa15c33,
  arrLeaf: 0x2b4034,
  pineLeaf: 0x1f3229,
  pineTrunk: 0x39302a,
  houseWall: 0xccd1c6,
  shutter: 0x2c4839,
  roof: 0x2c3237,
  stone: 0x585d5a,
  wood: 0x6d5339,
  woodDark: 0x453424,
  warm: 0xffb46b,
  warmDim: 0xd98f4f,
  ghost: 0x9fd8ff,
  enemy: 0x0a0c11,
  paper: 0xe4dcc2,
  glass: 0x1d2b32,
};

export const TUNE = {
  eyeHeight: 1.62,
  walkSpeed: 3.05,
  runSpeed: 5.7,
  staminaMax: 7.0,          // seconds of sprint
  fogDensity: 0.021,
  camFar: 260,
  flashRecharge: 6.0,       // seconds
  flashRange: 15,
  flashCos: Math.cos((34 * Math.PI) / 180),
  composureMax: 100,
  hitDamage: 30,
  auraDps: 2.4,             // per enemy within auraRange
  auraRange: 4.5,
  regenDelay: 4.0,
  regenRate: 7.0,
  staticRange: 24,          // distance at which static starts
  interactRange: 2.6,
};

// World layout: +z is SOUTH, toward the lake. Water level y = 0.
export const LAYOUT = {
  house:     { x: 0,   z: -14, y: 2.1,  r: 26 },
  kiosk:     { x: 13,  z: 34,  y: 1.15, r: 7 },
  shed:      { x: -30, z: -38, y: 2.3,  r: 8 },
  green:     { x: 34,  z: -26, y: 2.1,  r: 9 },
  boathouse: { x: -46, z: 60,  y: 0.9,  r: 11 },
  dock:      { x: 0,   z: 66 },
  camp:      { x: 17,  z: 51.5 },     // Rufino's live fire (a safe hearth)
  crewCamp:  { x: 37,  z: 52.5 },     // b1: the drowned crew's ABANDONED camp — ~20 m east along the shore, off Rufino's fire, tucked by the treeline
  cemetery:  { x: -8,  z: -85 },     // b1: the old graves, high in the north pines, out of the water's hearing
  shoreZ: 56,
  bounds: { minX: -120, maxX: 120, minZ: -120, maxZ: 92 },
};

// Paths as polylines for terrain coloring/flattening.
export const PATHS = [
  [ [0, 58], [0, 30], [0.6, 6], [1, -6.2] ],            // dock -> house front door
  [ [0.4, 31], [7, 32.5], [10.4, 33.6] ],               // fork -> kiosk
  [ [-1.6, -10], [-14, -22], [-27, -34.5] ],            // house -> shed
  [ [2.4, -12], [16, -19], [30.5, -24.5] ],             // house -> greenhouse
  [ [0, 54], [-14, 57], [-30, 58.5], [-41.5, 59.5] ],   // shore path -> boathouse
];
