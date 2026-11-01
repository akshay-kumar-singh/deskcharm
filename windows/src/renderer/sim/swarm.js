import { rand } from "../lib/random.js";

// Swarm flight plan, as in the Mac app's Swarm.swift: where every bat in a
// swarm is at any moment, worked out up front from a few random numbers each,
// so drawing a frame is only lookups.

/**
 * Bats are added until their wings, laid side by side, would cover the screen
 * this many times over. They overlap and come and go, so that leaves it mostly
 * but not wholly blotted out at the peak.
 */
const COVER = 1.75;
const MAX_BATS = 3200;
/**
 * The screen the swarm is tuned on. Bigger screens get bigger, faster bats
 * rather than more of them, so every display gets the same swarm in the same time.
 */
const REFERENCE = { width: 1512, height: 982 };
/** Most set off in the first part of this, so they rise as a wave. */
const BURST = 1.0;

export class Swarm {
  /**
   * `fill` is how much of its sprite's box a bat covers, averaged over a
   * wingbeat; `aspect` is the sprite's height over its width.
   */
  constructor(size, fill, aspect, rng) {
    this.size = size;
    this.aspect = aspect;
    const budget = COVER * size.width * size.height;
    const diagonal = Math.sqrt(1 + aspect * aspect);
    const scale = Math.min(Math.max(Math.sqrt(size.width * size.height / (REFERENCE.width * REFERENCE.height)), 0.8), 1.8);
    const pace = size.height / REFERENCE.height;
    const bats = [];
    let area = 0;
    while (area < budget && bats.length < MAX_BATS) {
      // A few swoop right past the viewer; the rest are mostly far and small.
      const near = rng() < 0.03;
      const depth = near ? 1 : rand(rng, 0, 1) ** 1.6;
      const span = scale * (near ? rand(rng, 150, 230) : 24 + 86 * depth);
      const climb = pace * (near ? rand(rng, 1300, 1700) : (420 + 620 * depth) * rand(rng, 0.88, 1.12));
      const x = rand(rng, -0.04, 1.04) * size.width;
      // Fanning outward as they rise, like a burst rather than a column.
      const drift = pace * ((x / size.width - 0.5) * 140 + rand(rng, -70, 70));
      bats.push({
        start: BURST * rand(rng, 0, 1) ** 1.25,
        x, drift, climb,
        sway: (5 + 20 * depth) * rand(rng, 0.6, 1.4),
        swayRate: rand(rng, 4.5, 8.5),
        swayPhase: rand(rng, 0, 2 * Math.PI),
        wingbeat: (13 - 5 * depth) * rand(rng, 0.85, 1.15),
        beatPhase: rand(rng, 0, 1),
        span, reach: span * diagonal / 2, depth,
      });
      area += fill * span * span * aspect;
    }
    // Far to near, which is also the draw order.
    this.bats = bats.sort((a, b) => a.depth - b.depth || a.span - b.span);
    this.duration = Math.max(0, ...bats.map(b => b.start + (size.height + 2 * b.reach) / b.climb));
  }

  /** Where bat `b` is at `t`: {at, heading, beat}, or null before it sets off and once it's gone over the top. */
  pose(b, t) {
    const u = t - b.start;
    if (u < 0) return null;
    // Sets off just out of sight below the bottom edge.
    const y = this.size.height + b.reach - b.climb * u;
    if (y <= -b.reach) return null;
    const a = b.swayRate * u + b.swayPhase;
    const x = b.x + b.drift * u + b.sway * Math.sin(a);
    const vx = b.drift + b.sway * b.swayRate * Math.cos(a);
    return { at: { x, y }, heading: Math.atan2(-b.climb, vx), beat: (b.beatPhase + b.wingbeat * u) % 1 };
  }
}
