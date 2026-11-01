import { coin, rand, shuffled } from "../lib/random.js";

// Symbiote crawl plan, as in the Mac app's Symbiote.swift: where every
// tendril reaches and when its crawl gets to each point along it, worked out
// up front from a few random numbers, so a frame only decides how much of
// each to draw and how it writhes. Tendrils lunge out of the charm — fat,
// glossy, blunt-headed, the way it reaches in the films, not the fine
// branching of roots — forking now and then, and strings of goo stretch
// between neighbours.

/** Spacing of the points along a tendril, points. */
export const STEP = 8;
export const MAX_TENDRILS = 70;
const MAX_STRANDS = 110;
/** How far apart two tendrils can be for a string of goo to span them. */
export const STRAND_REACH = [34, 80];
/** The screen it's tuned on. Bigger screens get thicker, faster tendrils rather than more of them. */
const REFERENCE = { width: 1512, height: 982 };
/** Roughly how long the crawl takes to reach across the screen. */
const CRAWL_TIME = 1.8;

export class Symbiote {
  constructor(size, origin, rng) {
    this.size = size;
    this.origin = origin;
    const diagonal = Math.hypot(size.width, size.height);
    const scale = Math.min(Math.max(diagonal / Math.hypot(REFERENCE.width, REFERENCE.height), 0.7), 1.8);
    const inBounds = p => p.x >= -30 && p.x <= size.width + 30 && p.y >= -30 && p.y <= size.height + 30;

    // The main tendrils lunge out of the charm, a little past level on each
    // side and mostly down, since it hangs at the top.
    const buds = [];
    const mains = 18;
    for (let i = 0; i < mains; i++) {
      const a = -0.4 + (Math.PI + 0.8) * (i + 0.5 + rand(rng, -0.35, 0.35)) / mains;
      buds.push({
        at: origin, heading: a, width: 26 * scale * rand(rng, 0.75, 1.2),
        reach: diagonal * rand(rng, 0.6, 1.0), time: rand(rng, 0, 0.15),
        speed: 1.25 * diagonal / CRAWL_TIME * rand(rng, 0.85, 1.15), parent: null,
      });
    }

    /** In the order they set off: every fork after its parent. */
    const tendrils = [];
    for (let next = 0; next < buds.length; next++) {
      const bud = buds[next];
      const index = tendrils.length;
      let p = bud.at, heading = bud.heading, curl = 0, t = bud.time;
      const points = [p], times = [t], widths = [bud.width];
      let travelled = 0;
      const lunge = rand(rng, 0, 2 * Math.PI);
      while (travelled < bud.reach) {
        // A slow, sweeping turn: it reaches, it doesn't wander.
        curl = Math.min(Math.max(curl + rand(rng, -0.02, 0.02), -0.035), 0.035);
        heading += curl;
        p = { x: p.x + Math.cos(heading) * STEP, y: p.y + Math.sin(heading) * STEP };
        if (!inBounds(p)) break;
        travelled += STEP;
        const s = travelled / bud.reach;
        // It lunges and pauses: fast through each surge, slow between.
        const surge = Math.max(0, Math.sin(travelled / 75 + lunge)) ** 2;
        t += STEP / (bud.speed * (0.45 + 1.6 * surge));
        // Thick the whole way, ending blunt rather than in a point.
        const w = Math.max(8 * scale, bud.width * (1 - 0.45 * s));
        points.push(p); times.push(t); widths.push(w);

        if (w > 12 * scale && buds.length < MAX_TENDRILS && rng() < 0.014) {
          const side = coin(rng) ? 1 : -1;
          buds.push({
            at: p, heading: heading + side * rand(rng, 0.4, 0.9), width: w * rand(rng, 0.6, 0.8),
            reach: (bud.reach - travelled) * rand(rng, 0.4, 0.75) + 100 * scale,
            time: t, speed: bud.speed * rand(rng, 0.85, 1.05), parent: { tendril: index, point: points.length - 1 },
          });
        }
      }
      tendrils.push({ points, times, widths, parent: bud.parent, phase: rand(rng, 0, 2 * Math.PI) });
    }
    this.tendrils = tendrils;
    /** When the last head stops crawling. */
    this.spread = Math.max(0, ...tendrils.map(t => t.times[t.times.length - 1] ?? 0));

    // Strings of goo: from points a little way along each tendril to the
    // nearest point of another that crawled within reach. Tendrils taken in
    // no order, so the strings don't all go to the first few.
    const strands = [];
    const [near, far] = STRAND_REACH;
    search: for (const i of shuffled(tendrils.map((_, k) => k), rng)) {
      const a = tendrils[i];
      for (let j = 4; j < a.points.length; j += 7) {
        if (!coin(rng)) continue;
        let best = null;
        tendrils.forEach((b, k) => {
          if (k === i) return;
          b.points.forEach((q, m) => {
            if (m < 4) return;
            const d = Math.hypot(a.points[j].x - q.x, a.points[j].y - q.y);
            if (d >= near && d <= far && d < (best?.d ?? Infinity)) best = { tendril: k, point: m, d };
          });
        });
        if (best) strands.push({ a: { tendril: i, point: j }, b: { tendril: best.tendril, point: best.point } });
        if (strands.length >= MAX_STRANDS) break search;
      }
    }
    this.strands = strands;
  }
}
