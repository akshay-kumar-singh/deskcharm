import { BLACK, WHITE, circle, ellipse, evenly, fill, fillAll, fillShifted, gray, radial, stroke } from "../lib/canvas.js";
import { add, dist, easeOutCubic, lerp, mul, sub, unit } from "../lib/geometry.js";
import { rand } from "../lib/random.js";
import { Silk } from "./common.js";

// Web blast, as in the Mac app's WebBlast.swift. Spider-Man's answer to being
// thrown about: a web ball at the screen that flashes on impact and spreads
// into a web across all of it, holds for five seconds, then falls away.
//
// It is only paint on a click-through overlay: clicks, keys and focus all go
// to whatever is beneath as usual. While the web holds still the overlay stops
// redrawing, so for most of its five seconds nothing is drawn.

const FLIGHT_TIME = 0.2;        // web ball from his hand to the glass
const SPREAD_TIME = 0.45;       // web racing out past the screen edges
const FLASH_TIME = 0.35;
const LET_GO_TIME = 0.25;       // strand from his hand fading once it lands
const LIFETIME = 5.0;           // from the shot to the web gone
const FADE_TIME = 0.7;

export class WebBlast {
  constructor({ size, centre, hand, push, sound, finish, rng = Math.random }) {
    Object.assign(this, { size, centre, hand, push, sound, finish });
    const corners = [{ x: 0, y: 0 }, { x: size.width, y: 0 }, { x: 0, y: size.height }, { x: size.width, y: size.height }];
    this.reach = Math.max(...corners.map(c => dist(centre, c)));
    [this.spokes, this.rings] = weave(centre, this.reach, rng);
    this.start = null;
    this.hit = this.held = this.fading = this.ended = false;
    /** While set, the web holds still and the overlay needn't redraw until then. */
    this.heldUntil = null;
  }

  render(ctx, now) {
    if (this.start === null) {
      this.start = now;
      this.push(mul(unit(sub(this.hand(), this.centre)), 160));
      this.sound("thwipHeavy");
    }
    const t = now - this.start;
    this.advance(t);
    this.draw(ctx, t);
  }

  advance(t) {
    if (!this.hit && t >= FLIGHT_TIME) {
      this.hit = true;
      this.sound("blast");
    }
    // Once the impact has played out, stop redrawing until it is time to let go.
    const settled = FLIGHT_TIME + Math.max(SPREAD_TIME, FLASH_TIME, LET_GO_TIME) + 0.05;
    if (!this.held && t >= settled && t < LIFETIME - FADE_TIME) {
      this.held = true;
      this.heldUntil = this.start + LIFETIME - FADE_TIME;
    }
    if (!this.fading && t >= LIFETIME - FADE_TIME) {
      this.fading = true;
      this.sound("unweb");
    }
    if (!this.ended && t >= LIFETIME) {
      this.ended = true;
      this.finish();
    }
  }

  draw(ctx, t) {
    const c = this.centre;
    // The strand from his hand: in flight, then fading once it has landed.
    if (t < FLIGHT_TIME + LET_GO_TIME) {
      const h = this.hand();
      ctx.save();
      if (t < FLIGHT_TIME) {
        const u = t / FLIGHT_TIME;
        const head = lerp(h, c, easeOutCubic(u));
        Silk.strand(ctx, h, head, dist(h, c) * 0.08 * Math.sin(Math.PI * u), 1.5);
        Silk.head(ctx, head, 7);
      } else {
        ctx.globalAlpha = 1 - (t - FLIGHT_TIME) / LET_GO_TIME;
        Silk.strand(ctx, h, c, 0, 1.5);
      }
      ctx.restore();
    }
    if (t < FLIGHT_TIME) return;

    const fade = t > LIFETIME - FADE_TIME ? (t - (LIFETIME - FADE_TIME)) / FADE_TIME : 0;
    ctx.save();
    ctx.globalAlpha = 1 - fade;
    // Drifts toward the viewer as it lets go.
    const drift = 1 + 0.06 * fade;
    ctx.translate(c.x, c.y);
    ctx.scale(drift, drift);
    ctx.translate(-c.x, -c.y);
    // Spreads out from where it hit rather than appearing all at once.
    const r = Math.max(1, this.reach * easeOutCubic((t - FLIGHT_TIME) / SPREAD_TIME));
    ctx.clip(circle(c, r));

    // A faint frosting, thickest at the hub, so it reads as webbed glass.
    fillAll(ctx, radial(ctx, c, 0, this.reach, evenly([WHITE(0.22), WHITE(0.04)])), this.size);
    for (const [path, width] of [[this.rings, 1.2], [this.spokes, 1.8]]) {
      stroke(ctx, path, BLACK(0.2), width + 1.8, "round");
      stroke(ctx, path, gray(0.97, 0.92), width, "round");
    }
    this.drawHub(ctx);
    ctx.restore();

    const f = (t - FLIGHT_TIME) / FLASH_TIME;
    if (f < 1) fillAll(ctx, WHITE(0.5 * (1 - f) ** 2), this.size);
  }

  /** The splat where the ball hit: a lumpy blob rather than a clean disc. */
  drawHub(ctx) {
    const c = this.centre;
    const blob = ellipse(c.x - 14, c.y - 14, 28, 28);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * 2 * Math.PI + 0.4;
      const d = 11 + 5 * Math.sin(i * 1.9);
      const r = 6 + 3 * Math.cos(i * 2.3);
      const p = add(c, mul({ x: Math.cos(a), y: Math.sin(a) }, d));
      blob.addPath(ellipse(p.x - r, p.y - r, 2 * r, 2 * r));
    }
    fill(ctx, blob, BLACK(0.18));
    fillShifted(ctx, blob, 0, -1, Silk.color);
  }
}

/**
 * An orb web: spokes out past the screen corners and threads between them on
 * rings spaced wider toward the edge. Woven once per blast, with fresh
 * randomness, so no two look alike.
 */
function weave(c, reach, rng) {
  const count = 20;
  const dirs = Array.from({ length: count }, (_, i) => {
    const a = (i + rand(rng, -0.3, 0.3)) / count * 2 * Math.PI;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
  const spokes = new Path2D();
  for (const d of dirs) {
    spokes.moveTo(c.x, c.y);
    spokes.lineTo(c.x + d.x * reach * 1.05, c.y + d.y * reach * 1.05);
  }
  const rings = new Path2D();
  for (let r = 24; r < reach * 1.05; r *= 1.3) {
    // Each spoke meets the ring at its own slightly different radius.
    const radii = dirs.map(() => r * rand(rng, 0.93, 1.07));
    for (let i = 0; i < count; i++) {
      if (rng() <= 0.06) continue;                       // a few snapped threads
      const j = (i + 1) % count;
      const p = add(c, mul(dirs[i], radii[i])), q = add(c, mul(dirs[j], radii[j]));
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      // Threads sag toward the hub between spokes, as real ones do.
      const ctl = add(c, mul(sub(mid, c), 0.9));
      rings.moveTo(p.x, p.y);
      rings.quadraticCurveTo(ctl.x, ctl.y, q.x, q.y);
    }
  }
  return [spokes, rings];
}
