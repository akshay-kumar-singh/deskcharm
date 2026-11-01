import { rand, randInt } from "../lib/random.js";

// Cracked glass, as in the Mac app's Cracks.swift: the pattern a blow leaves
// in glass. Cracks run out from where it landed, joined by rings of shorter
// cracks that sit tight and crushed at the centre and spread wider further
// out. The glass between them is the shards.

export class CrackWeb {
  constructor(centre, reach, rng) {
    this.centre = centre;
    const n = randInt(rng, 16, 22);
    const gap = 2 * Math.PI / n;
    // Kept small enough that neighbouring rays never cross.
    const angles = Array.from({ length: n }, (_, i) => i * gap + rand(rng, -0.25, 0.25) * gap);
    const radii = [0];
    let r = rand(rng, 9, 14);
    while (r < reach) {
      radii.push(r);
      r *= rand(rng, 1.32, 1.62);
    }
    // Far enough out that, wobble and straight edges and all, the last ring
    // still clears everything within `reach`.
    radii.push(reach * 1.25);
    /** Each ray's corners, from the centre outward. Neighbouring rays and rings share corners. */
    this.rays = angles.map(a => radii.map((radius, k) => {
      if (k === 0) return { x: centre.x, y: centre.y };
      const turn = a + rand(rng, -0.18, 0.18) * gap;
      const d = radius * rand(rng, 0.92, 1.08);
      return { x: centre.x + d * Math.cos(turn), y: centre.y + d * Math.sin(turn) };
    }));
    /** The ring cracks: corner `corner` of ray `ray` to the same corner of the next ray round. */
    this.rings = [];
    for (let k = 1; k < radii.length - 1; k++) {
      for (let j = 0; j < n; j++) {
        if (k <= 2 || rng() < 0.82) this.rings.push({ ray: j, corner: k });
      }
    }
    /** How far the crushed glass round the centre goes. */
    this.crushed = radii[Math.min(2, radii.length - 1)];
  }

  /** The pieces of glass between the cracks, each a closed outline. */
  get shards() {
    const out = [];
    for (let j = 0; j < this.rays.length; j++) {
      const a = this.rays[j], b = this.rays[(j + 1) % this.rays.length];
      for (let k = 0; k < a.length - 1; k++) {
        out.push(k === 0 ? [a[0], a[1], b[1]] : [a[k], b[k], b[k + 1], a[k + 1]]);
      }
    }
    return out;
  }
}

/** Whether `p` lies inside the closed outline `poly` (even-odd rule). */
export function polygonContains(poly, p) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
