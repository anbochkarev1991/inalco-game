import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// CC0 models from PolyHaven, fetched into the repo by scripts/fetch-assets.mjs.
// Real-world metric scale.

const MODELS = [
  'Sofa_01', 'ArmChair_01', 'Rockingchair_01', 'WoodenTable_01', 'WoodenTable_02',
  'painted_wooden_chair_01', 'GothicCabinet_01', 'GothicBed_01', 'ClassicNightstand_01',
  'painted_wooden_cabinet', 'brass_candleholders', 'ceramic_pot', 'Camera_01', 'brass_pot_01',
  'wooden_crate_01', 'wooden_crate_02', 'barrel_03', 'lifebuoy',
  'metal_jerrycan', 'old_military_crate', 'metal_toolbox', 'Lantern_01',
  'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'planter_box_01',
  'fern_02', 'garden_gnome',
];

const cache = new Map();

export async function preloadAssets(onProgress) {
  const loader = new GLTFLoader();
  let n = 0;
  await Promise.all(MODELS.map((slug) => new Promise((resolve) => {
    loader.load(
      `assets/models/${slug}/${slug}.gltf`,
      (g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material?.map) o.material.map.anisotropy = 4;
          }
        });
        cache.set(slug, g.scene);
        onProgress?.(++n, MODELS.length);
        resolve();
      },
      undefined,
      (e) => { console.warn('asset failed:', slug, e?.message ?? e); onProgress?.(++n, MODELS.length); resolve(); }
    );
  })));
}

export function hasAsset(slug) { return cache.has(slug); }

// Clone an asset (geometry/materials shared). Returns an empty group if missing
// so callers never crash on a failed download.
export function spawn(slug, { x = 0, y = 0, z = 0, ry = 0, s = 1 } = {}) {
  const src = cache.get(slug);
  const m = src ? src.clone(true) : new THREE.Group();
  m.position.set(x, y, z);
  m.rotation.y = ry;
  if (s !== 1) m.scale.setScalar(s);
  return m;
}
