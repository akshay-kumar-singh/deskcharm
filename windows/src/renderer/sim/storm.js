import { coin, rand } from "../lib/random.js";

// Storm plan, as in the Mac app's Storm.swift: everything a thunderstorm does,
// worked out up front from a few random numbers, so drawing a frame is only
// lookups.

/** Rain slants this much sideways for each point it falls. */
export const SLANT = 0.22;
/** How long a bolt lingers, and how long it takes thunder to follow it. */
export const LINGER = 0.32;
export const THUNDER_LAG = 0.28;
const REFERENCE = { width: 1512, height: 982 };

export class Storm {
  /** `charm` is where the last bolt lands, if there is somewhere to aim it. */
  constructor(size, charm, rng) {
    this.size = size;
    this.duration = 5.0;
    const scale = size.width / REFERENCE.width;
    const pace = size.height / REFERENCE.height;

    this.clouds = Array.from({ length: 18 }, (_, k) => {
      const u = (k + rand(rng, 0, 1)) / 18;
      return {
        x: u * 1.3 - 0.15, y: rand(rng, -20, 0.07 * size.height),
        radius: scale * rand(rng, 150, 290), drift: scale * rand(rng, 6, 22), shade: rand(rng, 0, 1),
      };
    });

    const count = Math.trunc(950 * size.width * size.height / (REFERENCE.width * REFERENCE.height));
    /** Far to near, which is also the draw order. */
    this.drops = Array.from({ length: Math.max(count, 1) }, () => {
      const depth = rand(rng, 0, 1) ** 1.4;
      return {
        x: rand(rng, -0.25, 1.0) * size.width, phase: rand(rng, 0, 1),
        speed: pace * (1300 + 1100 * depth) * rand(rng, 0.9, 1.1),
        length: scale * (14 + 30 * depth), depth,
      };
    }).sort((a, b) => a.depth - b.depth);

    // Spread over the storm, the last at the charm, with room for its flash
    // to die away before the storm does.
    const times = [0.55, 1.2, 1.85, 2.45, 3.1].map(t => t + rand(rng, -0.08, 0.08));
    this.bolts = times.map((time, k) => {
      const last = k === times.length - 1;
      const ground = last ? (charm ?? groundPoint(size, rng)) : groundPoint(size, rng);
      return bolt(time, ground, size, last && charm != null, rng);
    });
  }

  /**
   * How much of the storm's gloom is on the screen, 0 to 1: the sky closes in
   * over the first moments and opens again at the end.
   */
  gloom(t) {
    const rise = Math.min(Math.max(t / 0.6, 0), 1), fall = Math.min(Math.max((this.duration - t) / 1.1, 0), 1);
    return rise * rise * (3 - 2 * rise) * fall * fall * (3 - 2 * fall);
  }

  /** The brightest flash on the screen at `t`, from any bolt. */
  flash(t) {
    return Math.max(0, ...this.bolts.map(b => flash(t - b.time)));
  }

  /**
   * Where a drop is at `t`. It wraps from the bottom back to the top, so a
   * drop is always somewhere, and slants as it falls.
   */
  position(d, t) {
    const span = this.size.height + 2 * d.length;
    const y = (d.phase * span + d.speed * t) % span - d.length;
    // The slant carries drops right, so they start left of the screen to fill
    // it; wrapped sideways so none drift off for good.
    const lane = this.size.width * 1.25;
    const x = (d.x + SLANT * y + 0.25 * this.size.width) % lane;
    return { x: (x < 0 ? x + lane : x) - 0.25 * this.size.width, y };
  }
}

export function groundPoint(size, rng) {
  return { x: rand(rng, 0.08, 0.92) * size.width, y: rand(rng, 0.55, 0.95) * size.height };
}

/**
 * A bolt by midpoint displacement: each segment is split and its middle
 * knocked sideways by less each time, which gives the jagged line with kinks
 * at every scale that lightning has. Forks leave the trunk lower down and head
 * the same way, thinner and shorter.
 */
export function bolt(time, ground, size, charm, rng) {
  const top = { x: ground.x + rand(rng, -0.18, 0.18) * size.width, y: -20 };
  const trunk = jag(top, ground, 0.2, 6, rng);
  const forks = [];
  for (let k = Math.trunc(trunk.length / 5); k < trunk.length - 2; k += 4) {
    if (rng() >= 0.7) continue;
    const from = trunk[k];
    const side = coin(rng) ? 1 : -1;
    const length = rand(rng, 0.08, 0.22) * size.height;
    const to = { x: from.x + side * length * rand(rng, 0.35, 0.8), y: Math.min(from.y + length, size.height) };
    forks.push(jag(from, to, 0.25, 4, rng));
  }
  return { time, trunk, forks, ground, charm };
}

export function jag(a, b, spread, depth, rng) {
  if (depth <= 0) return [a, b];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / Math.max(length, 1), ny = (b.x - a.x) / Math.max(length, 1);
  const off = rand(rng, -1, 1) * spread * length;
  const mid = { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off };
  return jag(a, mid, spread, depth - 1, rng).concat(jag(mid, b, spread, depth - 1, rng).slice(1));
}

/**
 * A bolt's flash, 0 to 1, `u` seconds after it strikes: a hard first flash, a
 * dip, a second flash, then a fall away. It is what makes a strike read as
 * lightning rather than a line being drawn.
 */
export function flash(u) {
  if (u < 0) return 0;
  if (u < 0.07) return 1;
  if (u < 0.12) return 0.25;
  if (u < 0.2) return 0.85;
  return Math.max(0, 0.55 * Math.exp(-(u - 0.2) / 0.1) - 0.02);
}
