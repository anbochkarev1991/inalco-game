// Mostly-2D collision world: axis-aligned boxes + circles on the XZ plane, with
// an optional vertical band per box so the under-house cellar can pass beneath
// the house's walls/furniture (which live one storey up). A box with the default
// [-Inf, +Inf] band behaves exactly like the old flat collider.

// resolve() writes its result into one of these reusable scratch objects and
// returns it, so the once-per-frame player solve and the several per-frame enemy
// solves allocate nothing (was a fresh {x,z} every call). A small RING — not a
// single shared object — because a caller may legitimately hold a result across
// a couple of *nested* resolve() calls before reading it: the enemy detour probe
// keeps its `solved` while calling resolve() twice more to pick a tangent, then
// reads `solved`. Cycling through 8 slots (>> the max nesting depth of 2) means a
// held result is never clobbered under its owner. Callers that consume the result
// immediately (every other call site) are unaffected. A caller may still pass an
// explicit `out` to fully decouple a result from the ring.
const _ring = [
  { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 },
  { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 },
];
let _ringI = 0;

export class Colliders {
  constructor() {
    this.boxes = [];
    this.circles = [];
  }

  addBox(cx, cz, w, d, opts = {}) {
    const b = {
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      yBottom: opts.yBottom ?? -Infinity,   // vertical band this box occupies
      yTop: opts.yTop ?? Infinity,
      enabled: true,
      blocksSight: opts.blocksSight ?? false,
      tag: opts.tag ?? '',
    };
    this.boxes.push(b);
    return b;
  }

  addCircle(x, z, r) {
    const c = { x, z, r, enabled: true };
    this.circles.push(c);
    return c;
  }

  // Push a moving circle (x,z,r) out of everything. Two relaxation passes.
  // [moverBot, moverTop] is the mover's vertical extent (feet..head); a box is
  // skipped when its band doesn't overlap it — so a cellar-level player slips
  // under the house walls, while everyone at ground level is blocked as before.
  resolve(x, z, r, moverBot = -Infinity, moverTop = Infinity, out = _ring[_ringI++ & 7]) {
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.boxes) {
        if (!b.enabled) continue;
        if (moverTop <= b.yBottom || moverBot >= b.yTop) continue;
        const nx = Math.max(b.minX, Math.min(x, b.maxX));
        const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
        let dx = x - nx, dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            x = nx + (dx / d) * r;
            z = nz + (dz / d) * r;
          } else {
            // Center inside the box: push out via the smallest overlap axis.
            const pushL = x - b.minX + r, pushR = b.maxX - x + r;
            const pushU = z - b.minZ + r, pushD = b.maxZ - z + r;
            const m = Math.min(pushL, pushR, pushU, pushD);
            if (m === pushL) x = b.minX - r;
            else if (m === pushR) x = b.maxX + r;
            else if (m === pushU) z = b.minZ - r;
            else z = b.maxZ + r;
          }
        }
      }
      for (const c of this.circles) {
        if (!c.enabled) continue;
        const dx = x - c.x, dz = z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = c.x + (dx / d) * rr;
          z = c.z + (dz / d) * rr;
        }
      }
    }
    out.x = x; out.z = z;
    return out;
  }

  // Line-of-sight vs sight-blocking boxes only (building walls).
  losClear(x0, z0, x1, z1) {
    for (const b of this.boxes) {
      if (!b.enabled || !b.blocksSight) continue;
      if (segIntersectsAABB(x0, z0, x1, z1, b)) return false;
    }
    return true;
  }
}

function segIntersectsAABB(x0, z0, x1, z1, b) {
  const dx = x1 - x0, dz = z1 - z0;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < b.minX || x0 > b.maxX) return false;
  } else {
    let t1 = (b.minX - x0) / dx, t2 = (b.maxX - x0) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < b.minZ || z0 > b.maxZ) return false;
  } else {
    let t1 = (b.minZ - z0) / dz, t2 = (b.maxZ - z0) / dz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
