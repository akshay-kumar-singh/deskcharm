import { BLACK, circle, fill, gray, stroke } from "../lib/canvas.js";
import { add, clamp, dist, easeOutBack, easeOutCubic, lerp, mul, offset, sub, unit } from "../lib/geometry.js";
import { Silk, StandIn } from "./common.js";

// Web yank, as in the Mac app's WebYank.swift. Double-clicking a Spider-Man
// charm fires a web at the front window, yanks it across the screen into his
// hand and minimises it.
//
// Another program's window can't be animated from outside it, so the flight
// uses a stand-in: a snapshot of the window, or a card with its app's icon.
// The window is minimised beneath the stand-in once it covers it, so only one
// copy is ever on screen.
//
// One shot, from firing to the catch, driven by the overlay's frame clock.
// Stages run in order: shoot, land, cover (the stand-in goes up over the
// window), pull (window minimised, stand-in yanked), catch. A miss, or a window
// that won't minimise, drops out after landing and reels the web back in.

// Impulses on the charm, in points per second before chain-length scaling.
const RECOIL = 120, YANK = 300, CATCH_KICK = 220;
const TUG_TIME = 0.14, TUG_PULL = 16, RETRACT_TIME = 0.22, PUFF_TIME = 0.35;
/** How long to hold the web on the window waiting for its stand-in. */
const STAND_IN_PATIENCE = 0.45;
/** How long to wait for the window to minimise before giving up on the pull. */
const HIDE_PATIENCE = 0.6;

export class WebShot {
  /** `hand` is the live hand the web leaves from, in overlay points. */
  constructor({ target, aim, hand, push, sound, finish }) {
    Object.assign(this, { target, aim, hand, push, sound, finish });
    this.shootTime = 0.2;
    this.flyTime = 0.4;
    this.standIn = null;
    this.standInSettled = false;
    this.coverLead = 0.06;
    this.start = null;
    this.landed = this.covered = this.hideSent = this.pulled = this.caught = this.dropped = null;
    this.hidden = undefined;
    this.ended = false;
  }

  /** A snapshot is a pixel-exact double and can swap in almost at once; a card is plainly not the window, so it fades in over it instead. */
  standInArrived(image, isSnapshot) {
    this.standIn = image;
    this.coverLead = isSnapshot ? 0.06 : 0.14;
    this.standInSettled = true;
  }

  render(ctx, now) {
    if (this.start === null) { this.start = now; this.begin(); }
    const t = now - this.start;
    this.advance(t);
    this.draw(ctx, t);
  }

  begin() {
    const h = this.hand();
    const d = dist(h, this.aim);
    this.shootTime = clamp(d / 2600, 0.14, 0.3);
    this.flyTime = clamp(0.3 + d / 5000, 0.34, 0.5);
    this.push(mul(unit(sub(h, this.aim)), RECOIL));
    this.sound("thwip");
  }

  advance(t) {
    if (this.landed === null && t >= this.shootTime) {
      this.landed = this.shootTime;
      if (!this.target) this.dropped = this.shootTime;
      this.sound(this.target ? "splat" : "reel");
    }
    if (this.landed !== null && this.target && this.covered === null && this.dropped === null
        && (this.standInSettled || t >= this.landed + STAND_IN_PATIENCE)) {
      // Without a double to fly, minimising would just blink the window out.
      if (this.standIn) this.covered = t; else this.dropped = t;
    }
    // Minimise only once the stand-in has been on screen for a few frames, so
    // the window never blinks out before its double has replaced it.
    if (this.covered !== null && this.target && this.hideSent === null && t >= this.covered + this.coverLead) {
      this.hideSent = t;
      this.target.hide().then(gone => { this.hidden = gone; }, () => { this.hidden = false; });
    }
    // Pull only once the real window has gone, or the stand-in would fly off
    // and leave the original sitting there.
    if (this.hideSent !== null && this.target && this.pulled === null && this.dropped === null) {
      if (this.hidden === true) {
        this.pulled = t;
        this.push(mul(unit(sub(this.hand(), this.aim)), YANK));
        this.sound("whoosh");
      } else if (this.hidden === false || t >= this.hideSent + HIDE_PATIENCE) {
        this.standIn = null;
        this.dropped = t;
        this.sound("reel");
      }
    }
    if (this.pulled !== null && this.caught === null && t >= this.pulled + TUG_TIME + this.flyTime) {
      this.caught = this.pulled + TUG_TIME + this.flyTime;
      this.push(mul(unit(sub(this.hand(), this.aim)), CATCH_KICK));
      this.sound("pop");
    }
    const done = this.caught !== null ? t >= this.caught + PUFF_TIME
      : this.dropped !== null ? t >= this.dropped + RETRACT_TIME : false;
    if (done && !this.ended) {
      this.ended = true;
      this.finish();
    }
  }

  /**
   * Where the window hangs off the web: pinned while it's minimised, a short
   * tug toward the hand, then an accelerating flight that shrinks it into his fist.
   */
  pose(t, h) {
    if (this.pulled === null) return { at: this.aim, scale: 1, tilt: 0, alpha: 1 };
    const dir = unit(sub(h, this.aim));
    const u = t - this.pulled;
    if (u < TUG_TIME) {
      const k = easeOutBack(Math.max(0, u) / TUG_TIME);
      return { at: add(this.aim, mul(dir, TUG_PULL * k)), scale: 1, tilt: 0, alpha: 1 };
    }
    const f = Math.min(1, (u - TUG_TIME) / this.flyTime);
    return {
      at: lerp(add(this.aim, mul(dir, TUG_PULL)), h, f * f),
      scale: 1 - 0.96 * f ** 0.8,
      tilt: dir.x * 0.2 * Math.sin(Math.PI * f),
      alpha: f < 0.8 ? 1 : (1 - f) / 0.2,
    };
  }

  draw(ctx, t) {
    const h = this.hand();

    if (this.landed !== null && this.target && this.dropped === null && this.caught === null) {
      const rect = offset(this.target.frame, -this.aim.x, -this.aim.y);
      // Two fading afterimages once it is moving fast enough to smear.
      if (this.standIn && this.pulled !== null && t - this.pulled > TUG_TIME + this.flyTime * 0.25) {
        for (const [lag, alpha] of [[0.16, 0.1], [0.08, 0.22]]) {
          ctx.save();
          apply(ctx, this.pose(t - lag * this.flyTime, h));
          ctx.globalAlpha *= alpha;
          StandIn.draw(ctx, this.standIn, rect, 1);
          ctx.restore();
        }
      }
      ctx.save();
      apply(ctx, this.pose(t, h));
      if (this.covered !== null && this.standIn) {
        StandIn.draw(ctx, this.standIn, rect, Math.min(1, (t - this.covered) / this.coverLead));
      }
      drawSplat(ctx, easeOutBack(Math.min(1, (t - this.landed) / 0.18)));
      ctx.restore();
    }

    if (this.caught === null) {
      let end, bow = 0;
      const len = dist(h, this.aim);
      if (this.dropped !== null) {
        const u = Math.min(1, (t - this.dropped) / RETRACT_TIME);
        end = lerp(this.aim, h, u * u * u);
        bow = len * 0.06 * Math.sin(Math.PI * u);
      } else if (this.landed === null) {
        const u = t / this.shootTime;
        end = lerp(h, this.aim, easeOutCubic(u));
        bow = len * 0.1 * Math.sin(Math.PI * u);
      } else {
        end = this.pose(t, h).at;
        // The strand twangs when it hits, and again when he yanks.
        const since = t - (this.pulled ?? this.landed ?? t);
        bow = 5 * Math.sin(since * 70) * Math.exp(-since * 14);
      }
      Silk.strand(ctx, h, end, bow);
      if (this.landed === null || this.dropped !== null) Silk.head(ctx, end);
    }

    if (this.caught !== null && t - this.caught < PUFF_TIME) drawPuff(ctx, h, (t - this.caught) / PUFF_TIME);
  }
}

function apply(ctx, p) {
  ctx.translate(p.at.x, p.at.y);
  ctx.rotate(p.tilt);
  ctx.scale(p.scale, p.scale);
  ctx.globalAlpha *= p.alpha;
}

/** A small orb web where the strand sticks, drawn in the window's own coordinates so it travels and shrinks with it. */
function drawSplat(ctx, grow) {
  if (grow <= 0.01) return;
  const spokes = 7;
  const web = new Path2D();
  const tips = [];
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * 2 * Math.PI + 0.35;
    const len = 30 * grow * (0.85 + 0.2 * Math.sin(i * 2.4));
    const tip = { x: Math.cos(a) * len, y: Math.sin(a) * len };
    web.moveTo(0, 0);
    web.lineTo(tip.x, tip.y);
    tips.push(tip);
  }
  for (const ring of [0.42, 0.78]) {
    for (let i = 0; i < spokes; i++) {
      const p = mul(tips[i], ring), q = mul(tips[(i + 1) % spokes], ring);
      // Threads sag toward the hub, as they do between real spokes.
      web.moveTo(p.x, p.y);
      web.quadraticCurveTo((p.x + q.x) * 0.42, (p.y + q.y) * 0.42, q.x, q.y);
    }
  }
  stroke(ctx, web, BLACK(0.25), 2.6, "round");
  stroke(ctx, web, Silk.color, 1.1, "round");
  fill(ctx, circle({ x: 0, y: 0 }, 4.5 * grow), Silk.color);
}

function drawPuff(ctx, p, u) {
  const e = easeOutCubic(u), fade = 1 - u;
  stroke(ctx, circle(p, 6 + 26 * e), gray(0.97, 0.8 * fade), 2 * fade + 0.4);
  const rays = new Path2D();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 2 * Math.PI + 0.2;
    const d = { x: Math.cos(a), y: Math.sin(a) };
    rays.moveTo(p.x + d.x * (10 + 18 * e), p.y + d.y * (10 + 18 * e));
    rays.lineTo(p.x + d.x * (16 + 30 * e), p.y + d.y * (16 + 30 * e));
  }
  stroke(ctx, rays, gray(0.97, 0.9 * fade), 1.6, "round");
}
