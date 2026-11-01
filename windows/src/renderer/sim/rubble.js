import { remainder } from "../lib/geometry.js";
import { coin, rand, randInt } from "../lib/random.js";

// Smashed concrete, as in the Mac app's Rubble.swift: what a blow leaves in a
// concrete wall. A crater with a jagged rim, chips knocked off round it,
// cracks running away from it that fork and thin as they go, and chunks
// thrown out.

/** Pulls every falling piece down, in points per second per second. */
export const GRAVITY = 2400;

export class Crater {
  constructor(centre, radius, bounds, rng) {
    this.centre = centre;
    this.radius = radius;
    const corners = randInt(rng, 18, 24);
    this.rim = Array.from({ length: corners }, (_, i) => {
      const a = (i + rand(rng, -0.3, 0.3)) / corners * 2 * Math.PI;
      const r = radius * rand(rng, 0.72, 1.12);
      return { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) };
    });
    // A broad ring of the wall's face knocked off round the crater.
    this.chips = Array.from({ length: randInt(rng, 12, 18) }, () => {
      const a = rand(rng, 0, 2 * Math.PI);
      const d = radius * rand(rng, 0.95, 1.75);
      const at = { x: centre.x + d * Math.cos(a), y: centre.y + d * Math.sin(a) };
      return lump(at, rand(rng, 8, 24), randInt(rng, 3, 5), rng);
    });

    // Cracks run outward from the rim in straight-ish runs with sharp kinks,
    // as concrete breaks, forking now and then, each branch thinner than what
    // it left; they stop once they've thinned to nothing or run off the screen.
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const room = { x: bounds.x - 40, y: bounds.y - 40, width: bounds.width + 80, height: bounds.height + 80 };
    const inRoom = p => p.x >= room.x && p.x <= room.x + room.width && p.y >= room.y && p.y <= room.y + room.height;
    const growing = [];
    const main = randInt(rng, 7, 10);
    for (let j = 0; j < main; j++) {
      const heading = (j + rand(rng, -0.35, 0.35)) / main * 2 * Math.PI;
      const at = { x: centre.x + radius * 0.9 * Math.cos(heading), y: centre.y + radius * 0.9 * Math.sin(heading) };
      const width = rand(rng, 4, 6);
      growing.push({ at, heading, width, thinning: width / (diagonal * rand(rng, 0.5, 1.0)), depth: 0 });
    }
    /** Each crack's path, and how wide it is where it starts; it thins to a hairline by its end. */
    this.cracks = [];
    while (growing.length) {
      const seed = growing.pop();
      const points = [seed.at];
      let at = seed.at, heading = seed.heading, width = seed.width;
      while (width > 0.6 && inRoom(at) && points.length < 90) {
        const step = rand(rng, 18, 38);
        // Holds its line, kinking now and then, and keeps leaning away from the blow.
        const away = Math.atan2(at.y - centre.y, at.x - centre.x);
        const kink = rng() < 0.3 ? rand(rng, -0.45, 0.45) : 0;
        heading += kink + rand(rng, -0.08, 0.08) + 0.12 * remainder(away - heading, 2 * Math.PI);
        at = { x: at.x + step * Math.cos(heading), y: at.y + step * Math.sin(heading) };
        points.push(at);
        width -= step * seed.thinning;
        if (seed.depth < 2 && width > 1.4 && rng() < 0.07) {
          const fork = rand(rng, 0.5, 1.0) * (coin(rng) ? 1 : -1);
          growing.push({ at, heading: heading + fork, width: width * 0.55, thinning: seed.thinning * 1.4, depth: seed.depth + 1 });
        }
      }
      if (points.length > 1) this.cracks.push({ points, width: seed.width });
    }

    /** Thrown out by the blow. */
    this.thrown = Array.from({ length: randInt(rng, 18, 28) }, () => {
      const a = rand(rng, 0, 2 * Math.PI);
      const speed = rand(rng, 220, 700);
      const from = { x: centre.x + radius * 0.5 * Math.cos(a), y: centre.y + radius * 0.5 * Math.sin(a) };
      return {
        outline: lump({ x: 0, y: 0 }, rand(rng, 4, 15), randInt(rng, 5, 7), rng),
        start: from, velocity: { x: speed * Math.cos(a), y: speed * Math.sin(a) - 250 },
        spin: rand(rng, -7, 7), shade: rand(rng, 0.7, 1.2),
      };
    });

    /** The crater itself and its chips, for when it crumbles away: wedges, inner and outer. */
    this.crumbs = [];
    const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    for (let i = 0; i < this.rim.length; i++) {
      const a = this.rim[i], b = this.rim[(i + 1) % this.rim.length];
      for (const piece of [[centre, mid(centre, a), mid(centre, b)], [mid(centre, a), a, b, mid(centre, b)]]) {
        this.crumbs.push(loose(piece, 90, rng));
      }
    }
    for (const chip of this.chips) this.crumbs.push(loose(chip, 60, rng));
  }

  /** Where a piece is `τ` seconds after it comes loose. */
  static position(chunk, τ) {
    const t = Math.max(0, τ);
    return { x: chunk.start.x + chunk.velocity.x * t, y: chunk.start.y + chunk.velocity.y * t + 0.5 * GRAVITY * t * t };
  }
}

/** A rough lump of concrete round `at`. */
function lump(at, size, corners, rng) {
  return Array.from({ length: corners }, (_, i) => {
    const a = (i + rand(rng, -0.25, 0.25)) / corners * 2 * Math.PI;
    const r = size * rand(rng, 0.6, 1.0);
    return { x: at.x + r * Math.cos(a), y: at.y + r * Math.sin(a) };
  });
}

/** An outline, recentred on its own middle, set loose with a nudge outward. */
function loose(outline, push, rng) {
  const middle = {
    x: outline.reduce((s, p) => s + p.x, 0) / outline.length,
    y: outline.reduce((s, p) => s + p.y, 0) / outline.length,
  };
  const a = rand(rng, 0, 2 * Math.PI);
  return {
    outline: outline.map(p => ({ x: p.x - middle.x, y: p.y - middle.y })), start: middle,
    velocity: { x: push * Math.cos(a), y: push * Math.sin(a) - 60 },
    spin: rand(rng, -3, 3), shade: rand(rng, 0.7, 1.2),
  };
}
