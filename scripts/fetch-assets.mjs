// Download curated CC0 models (PolyHaven, 1k) into public/assets/models/
// so the game runs fully offline. Idempotent: skips files that exist.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../public/assets/models');

const SLUGS = [
  // house
  'Sofa_01', 'ArmChair_01', 'Rockingchair_01', 'WoodenTable_01', 'WoodenTable_02',
  'painted_wooden_chair_01', 'GothicCabinet_01', 'GothicBed_01', 'ClassicNightstand_01',
  'painted_wooden_cabinet', 'decorative_book_set_01', 'brass_candleholders',
  'ceramic_pot', 'Camera_01', 'brass_pot_01',
  // boathouse + shed
  'wooden_crate_01', 'wooden_crate_02', 'Barrel_01', 'barrel_03', 'lifebuoy',
  'metal_jerrycan', 'old_military_crate', 'metal_toolbox', 'Lantern_01',
  // greenhouse + garden
  'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'planter_box_01',
  'fern_02', 'garden_gnome',
];

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function download(url, dest) {
  if (fs.existsSync(dest)) return 'cached';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return 'ok';
}

let done = 0;
for (const slug of SLUGS) {
  try {
    const files = await getJSON(`https://api.polyhaven.com/files/${slug}`);
    const g = files.gltf?.['1k']?.gltf ?? files.gltf?.[Object.keys(files.gltf)[0]]?.gltf;
    if (!g?.url) { console.log(`SKIP ${slug}: no gltf`); continue; }
    const base = g.url.slice(0, g.url.lastIndexOf('/'));
    const dir = path.join(OUT, slug);
    const gltfPath = path.join(dir, `${slug}.gltf`);
    // fetch the gltf JSON, then its referenced bin + textures
    const r = await fetch(g.url);
    if (!r.ok) throw new Error(`${r.status} ${g.url}`);
    const gltfText = await r.text();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(gltfPath, gltfText);
    const doc = JSON.parse(gltfText);
    // textures live on a different CDN path than the gltf's relative refs —
    // build a basename -> url map from the whole files JSON
    const urlByName = {};
    (function walk(o) {
      if (o && typeof o === 'object') {
        if (typeof o.url === 'string') urlByName[o.url.split('/').pop()] = o.url;
        for (const v of Object.values(o)) walk(v);
      }
    })(files);
    const refs = [
      ...(doc.buffers ?? []).map((b) => b.uri),
      ...(doc.images ?? []).map((i) => i.uri),
    ].filter((u) => u && !u.startsWith('data:'));
    for (const ref of refs) {
      const name = ref.split('/').pop();
      const url = urlByName[name] ?? `${base}/${ref}`;
      await download(url, path.join(dir, ref));
    }
    done++;
    console.log(`OK  ${slug} (+${refs.length} files)`);
  } catch (e) {
    console.log(`FAIL ${slug}: ${e.message}`);
  }
}
console.log(`\n${done}/${SLUGS.length} models ready in public/assets/models`);

// monster skin detail (CC0, PolyHaven leather_white): wrinkled normal +
// roughness maps draped over the sculpted Returned bodies
const TEX = path.resolve(import.meta.dirname, '../public/assets/textures');
const PH_TEX = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k';
const TEXTURES = [
  ['skin_nor.jpg', `${PH_TEX}/leather_white/leather_white_nor_gl_1k.jpg`],
  ['skin_rough.jpg', `${PH_TEX}/leather_white/leather_white_rough_1k.jpg`],
  // NPC garments: real CC0 wool weaves (normal/rough carry the fibre; the
  // material colour dyes them) — poncho = bouclé, coats/jacket = herringbone
  ['wool_boucle_nor_gl.jpg', `${PH_TEX}/wool_boucle/wool_boucle_nor_gl_1k.jpg`],
  ['wool_boucle_rough.jpg', `${PH_TEX}/wool_boucle/wool_boucle_rough_1k.jpg`],
  ['poly_wool_herringbone_nor_gl.jpg', `${PH_TEX}/poly_wool_herringbone/poly_wool_herringbone_nor_gl_1k.jpg`],
  ['poly_wool_herringbone_rough.jpg', `${PH_TEX}/poly_wool_herringbone/poly_wool_herringbone_rough_1k.jpg`],
  ['poly_wool_herringbone_diff.jpg', `${PH_TEX}/poly_wool_herringbone/poly_wool_herringbone_diff_1k.jpg`],
];
for (const [name, url] of TEXTURES) {
  try {
    console.log(`TEX ${name}: ${await download(url, path.join(TEX, name))}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
  }
}
