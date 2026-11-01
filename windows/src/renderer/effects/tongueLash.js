import { WHITE, circle, ellipse, fill, gray, polygon, polyline, rgba, stroke, tone } from "../lib/canvas.js";
import { add, clamp, dist, easeOutBack, easeOutCubic, lerp, mul, offset, quad, sub, unit } from "../lib/geometry.js";
import { rand } from "../lib/random.js";
import { StandIn, Takedown } from "./common.js";

// Venom's tongue, as in the Mac app's Venom.swift. Double-click: it lashes out,
// sticks to the front window and reels it into his mouth, which swallows it.
// Stages run in order: shoot, stick, cover (the stand-in goes up over the
// window and it's minimised), reel in, gulp. A miss, or a window that won't
// minimise, drops out after it sticks and the tongue snaps back.

const REEL_TIME = 0.5, SNAP_BACK_TIME = 0.25, GULP_TIME = 0.45;
const FLESH = [0.86, 0.25, 0.38];
const SHADE = [0.40, 0.03, 0.12];

/**
 * Venom's tongue: thick at the root, tapering to a rounded tip, glossy, and
 * writhing in a wave that runs along it. `width` is its half-width at the
 * root; `writhe` how far the wave throws it from side to side; `tip` how much
 * its end has flattened out against something it has stuck to.
 */
export function drawTongue(ctx, a, b, width, writhe, bow, t, tip = 1) {
  const v = sub(b, a);
  const len = Math.hypot(v.x, v.y);
  if (len <= 2) return;
  const n = { x: -v.y / len, y: v.x / len };
  const ctl = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, mul(n, bow));
  const count = Math.max(12, Math.trunc(len / 9));
  const centre = Array.from({ length: count + 1 }, (_, i) => {
    const s = i / count;
    const wave = writhe * Math.sin(s * len / 40 - t * 16) * Math.sin(Math.PI * s);
    return add(quad(a, ctl, b, s), mul(n, wave));
  });
  const left = [], right = [], half = [];
  centre.forEach((p, i) => {
    const d = unit(sub(centre[Math.min(i + 1, count)], centre[Math.max(i - 1, 0)]));
    const s = i / count;
    const w = width * (1 - 0.35 * s) * (1 + (tip - 1) * s ** 6);
    half.push(w);
    left.push(add(p, mul({ x: -d.y, y: d.x }, w)));
    right.push(add(p, mul({ x: d.y, y: -d.x }, w)));
  });
  // Round the end off: half a circle from one side to the other, round the front.
  const end = centre[count], ahead = unit(sub(centre[count], centre[count - 1]));
  const side = { x: -ahead.y, y: ahead.x };
  const cap = [];
  for (let k = 1; k < 12; k++) {
    const ang = Math.PI * k / 12;
    cap.push(add(add(end, mul(side, half[count] * Math.cos(ang))), mul(ahead, half[count] * Math.sin(ang))));
  }
  const shape = polygon([...left, ...cap, ...right.reverse()]);

  stroke(ctx, shape, tone(SHADE, 0.9), 2.4);
  fill(ctx, shape, tone(FLESH));
  stroke(ctx, polyline(centre), tone(SHADE, 0.35), 1.2, "round");
  // A wet highlight down one side.
  stroke(ctx, polyline(centre.map((c, i) => lerp(c, left[i], 0.45))), WHITE(0.4), Math.max(1, width * 0.3), "round");
}

export class TongueLash {
  constructor({ target, aim, mouth, width, push, sound, finish, rng = Math.random }) {
    Object.assign(this, { target, aim, mouth, width, push, sound, finish });
    this.takedown = target ? new Takedown(target) : null;
    this.shootTime = 0.22;
    this.start = null;
    this.stuck = this.reeled = this.swallowed = this.dropped = null;
    this.ended = false;
    /** Goo flung out by the gulp: direction, speed and size of each drop. */
    this.spatter = Array.from({ length: 12 }, (_, i) => {
      const a = i / 12 * 2 * Math.PI + rand(rng, -0.2, 0.2);
      return [{ x: Math.cos(a), y: Math.sin(a) }, rand(rng, 140, 320), rand(rng, 2.5, 5)];
    });
  }

  standInArrived(image, isSnapshot) {
    this.takedown?.arrived(image, isSnapshot);
  }

  render(ctx, now) {
    if (this.start === null) { this.start = now; this.begin(); }
    const t = now - this.start;
    this.advance(t);
    this.draw(ctx, t);
  }

  begin() {
    const m = this.mouth();
    this.shootTime = clamp(dist(m, this.aim) / 2800, 0.14, 0.3);
    this.push(mul(unit(sub(m, this.aim)), 130));
    this.sound("lash");
  }

  advance(t) {
    if (this.stuck === null && t >= this.shootTime) {
      this.stuck = this.shootTime;
      if (!this.target) this.dropped = this.shootTime;
      this.sound(this.target ? "splat" : "reel");
    }
    if (this.stuck !== null && this.reeled === null && this.dropped === null && this.takedown) {
      const outcome = this.takedown.advance(t, this.stuck);
      if (outcome === "gone") {
        this.reeled = t;
        this.push(mul(unit(sub(this.mouth(), this.aim)), 280));
        this.sound("slurp");
      } else if (outcome === "failed") {
        this.dropped = t;
        this.sound("reel");
      }
    }
    if (this.reeled !== null && this.swallowed === null && t >= this.reeled + REEL_TIME) {
      this.swallowed = this.reeled + REEL_TIME;
      // The window's weight landing in his mouth.
      this.push(mul(unit(sub(this.mouth(), this.aim)), 240));
      this.sound("gulp");
    }
    const done = this.swallowed !== null ? t >= this.swallowed + GULP_TIME
      : this.dropped !== null ? t >= this.dropped + SNAP_BACK_TIME : false;
    if (done && !this.ended) {
      this.ended = true;
      this.finish();
    }
  }

  /** Where the window hangs off the tongue: stuck in place while it's minimised, then reeled in faster and faster, wobbling as it shrinks into his mouth. */
  pose(t, m) {
    if (this.reeled === null) return { at: this.aim, scale: 1, tilt: 0, alpha: 1 };
    const u = Math.min(1, (t - this.reeled) / REEL_TIME);
    const f = u * u;
    return {
      at: lerp(this.aim, m, f), scale: 1 - 0.97 * f ** 0.7,
      tilt: 0.14 * Math.sin(u * Math.PI * 3) * (1 - u), alpha: f < 0.85 ? 1 : (1 - f) / 0.15,
    };
  }

  draw(ctx, t) {
    const m = this.mouth();
    const down = this.takedown;

    if (this.stuck !== null && this.target && down && this.dropped === null && this.swallowed === null) {
      ctx.save();
      const p = this.pose(t, m);
      ctx.translate(p.at.x, p.at.y);
      ctx.rotate(p.tilt);
      ctx.scale(p.scale, p.scale);
      ctx.globalAlpha *= p.alpha;
      if (down.standIn && down.covered !== null) {
        StandIn.draw(ctx, down.standIn, offset(this.target.frame, -this.aim.x, -this.aim.y), down.cover(t));
      }
      drawSlime(ctx, easeOutBack(Math.min(1, (t - this.stuck) / 0.2)), t - this.stuck);
      ctx.restore();
    }

    if (this.swallowed === null) {
      const len = dist(m, this.aim);
      if (this.dropped !== null) {
        const u = Math.min(1, (t - this.dropped) / SNAP_BACK_TIME);
        drawTongue(ctx, m, lerp(this.aim, m, u * u * u), this.width, 10 * (1 - u), len * 0.05 * Math.sin(Math.PI * u), t);
      } else if (this.stuck === null) {
        const u = t / this.shootTime;
        drawTongue(ctx, m, lerp(m, this.aim, easeOutCubic(u)), this.width, 18 * (1 - u) + 5, len * 0.12 * Math.sin(Math.PI * u), t);
      } else {
        // Twitching where it's stuck, then pulled taut as it reels in.
        const since = t - (this.reeled ?? this.stuck ?? t);
        const twitch = 6 * Math.exp(-since * 6);
        drawTongue(ctx, m, this.pose(t, m).at, this.width, this.reeled === null ? 3 + twitch : 2 + twitch, 0, t, 1.5);
      }
    }

    if (this.swallowed !== null && t - this.swallowed < GULP_TIME) this.drawGulp(ctx, m, (t - this.swallowed) / GULP_TIME);
  }

  /** The gulp: black goo spattered out of his mouth and falling away. */
  drawGulp(ctx, p, u) {
    const time = u * GULP_TIME, fade = 1 - u;
    for (const [dir, speed, size] of this.spatter) {
      const at = { x: p.x + dir.x * speed * time, y: p.y + dir.y * speed * time + 900 * time * time };
      const r = size * (1 - 0.4 * u);
      fill(ctx, circle(at, r), gray(0.03, fade));
      fill(ctx, ellipse(at.x - r * 0.5, at.y - r * 0.6, r * 0.6, r * 0.5), WHITE(0.5 * fade));
    }
  }
}

/** Slaver where the tongue stuck, drawn in the window's own coordinates so it travels and shrinks with it, with drips running down the glass. */
function drawSlime(ctx, grow, age) {
  if (grow <= 0.01) return;
  const r = 22 * grow;
  const blob = ellipse(-r * 1.3, -r * 0.8, r * 2.6, r * 1.6);
  for (const [dx, dy, s] of [[-1.1, 0.4, 0.45], [1.0, 0.5, 0.4], [0.2, -0.7, 0.35]]) {
    blob.addPath(ellipse(dx * r - s * r, dy * r - s * r, 2 * s * r, 2 * s * r));
  }
  // Drips that run down and slow as they go.
  const run = Math.min(age, 1.2) * 46;
  for (const [x, length] of [[-14, 1.0], [9, 0.7], [20, 0.45]]) {
    const l = run * length;
    if (l <= 2) continue;
    const drip = new Path2D();
    drip.roundRect(x * grow - 2.5, 0, 5, r * 0.6 + l, 2.5);
    blob.addPath(drip);
    blob.addPath(ellipse(x * grow - 4, r * 0.6 + l - 4, 8, 8));
  }
  fill(ctx, blob, rgba(0.78, 0.22, 0.34, 0.75));
  fill(ctx, ellipse(-r * 0.7, -r * 0.55, r * 0.7, r * 0.35), WHITE(0.45));
}
