import { WHITE, circle, evenly, fill, fillAll, radial, roundRect, stroke, tone } from "../lib/canvas.js";
import { clamp, dist, easeOutBack, easeOutCubic, mul, offset, sub, unit, add } from "../lib/geometry.js";
import { rand, randInt, coin } from "../lib/random.js";
import { Pour } from "../sim/pour.js";
import { bolt, flash, jag, LINGER } from "../sim/storm.js";
import { Genie, Lightning, StandIn, Takedown } from "./common.js";

// Thor's strike, as in the Mac app's ThorStrike.swift. Double-clicking the
// Thor charm calls the sky down on the front window: the light drops, a bolt
// comes out of the cloud into its title bar, and the window, hung with arcing
// electricity, is drawn into the charm along a crackling line of lightning,
// like Mjolnir being called back to the hand. It goes in a flash, and the
// window is minimised beneath its stand-in, as with the web yank.

// Impulses on the charm, in points per second before chain-length scaling.
const RECOIL = 150, IMPACT = 280;
const GATHER_TIME = 0.25;               // the sky closing in before the bolt
const TUG_TIME = 0.16, TUG_PULL = 18, FLASH_TIME = 0.45, CLEAR_TIME = 0.5;

export class ThorStrike {
  /** `home` is the charm's centre, live, and `homeSize` how big it's drawn. */
  constructor({ target, aim, screen, home, homeSize, push, sound, finish, rng = Math.random }) {
    Object.assign(this, { target, aim, home, homeSize, push, sound, finish, rng });
    this.takedown = target ? new Takedown(target) : null;
    this.towardHome = unit(sub(home(), aim));
    this.bolt = bolt(GATHER_TIME, aim, screen, false, rng);
    this.pourTime = 0.7;
    this.genie = null;
    this.start = null;
    this.landed = this.pulled = this.stowed = this.dropped = null;
    this.ended = false;
    /** Arcs are redrawn thirty times a second, not every frame, so they crackle rather than shimmer. */
    this.arcs = { step: -1, window: [], line: [] };
  }

  standInArrived(image, isSnapshot) {
    this.takedown?.arrived(image, isSnapshot);
    if (image && this.target) {
      this.genie = new Genie(image, this.target.frame, Pour.runsSideways(this.target.frame, this.home()));
    }
  }

  render(ctx, now) {
    if (this.start === null) { this.start = now; this.begin(); }
    const t = now - this.start;
    this.advance(t);
    this.draw(ctx, t);
  }

  begin() {
    this.pourTime = clamp(0.55 + dist(this.home(), this.aim) / 4000, 0.6, 0.85);
  }

  advance(t) {
    if (this.landed === null && t >= GATHER_TIME) {
      this.landed = GATHER_TIME;
      if (!this.target) this.dropped = this.landed;
      this.sound("thunder");
      // The charm flinches as the bolt lands.
      this.push(mul({ x: this.towardHome.x >= 0 ? -1 : 1, y: -0.4 }, RECOIL));
    }
    // Pull only once the real window has gone, or the stand-in would go and
    // leave the original sitting there.
    if (this.landed !== null && this.pulled === null && this.dropped === null && this.takedown) {
      const outcome = this.takedown.advance(t, this.landed);
      if (outcome === "gone") { this.pulled = t; this.sound("crackle"); }
      if (outcome === "failed") this.dropped = t;
    }
    if (this.pulled !== null && this.stowed === null && t >= this.pulled + TUG_TIME + this.pourTime) {
      this.stowed = this.pulled + TUG_TIME + this.pourTime;
      this.push(mul(this.towardHome, IMPACT));
      this.sound("zap");
    }
    const over = this.over;
    if (over !== null && !this.ended && t >= over + CLEAR_TIME) {
      this.ended = true;
      this.finish();
    }
  }

  /** When the sky starts to clear: just after the flash, or just after a miss. */
  get over() {
    if (this.stowed !== null) return this.stowed + 0.15;
    return this.dropped !== null ? this.dropped + 0.25 : null;
  }

  poured(t) {
    if (this.pulled === null) return 0;
    return clamp((t - this.pulled - TUG_TIME) / this.pourTime);
  }

  /** The window shudders under the strike, then jerks toward the charm as the line takes up. */
  tug(t) {
    if (this.pulled !== null && t >= this.pulled) {
      return mul(this.towardHome, TUG_PULL * easeOutBack(Math.min(1, (t - this.pulled) / TUG_TIME)));
    }
    if (this.landed === null || t < this.landed) return { x: 0, y: 0 };
    const u = t - this.landed;
    const shake = Math.exp(-u * 3) * Math.sin(u * 120);
    return { x: 4 * shake, y: 2 * Math.sin(u * 97) * Math.exp(-u * 3) };
  }

  pouring(t) {
    if (!this.target) return null;
    const tug = this.tug(t);
    return new Pour(offset(this.target.frame, tug.x, tug.y), this.home(),
      this.genie?.columns ?? Pour.runsSideways(this.target.frame, this.home()));
  }

  /** How dark the sky is, 0 to 1. */
  sky(t) {
    const x = Math.min(t / GATHER_TIME, 1);
    const closing = x * x * (3 - 2 * x);
    const over = this.over;
    if (over === null) return closing;
    return closing * (1 - clamp((t - over) / CLEAR_TIME));
  }

  draw(ctx, t) {
    const origin = this.home();
    const screen = { width: 1e5, height: 1e5 };
    fillAll(ctx, tone(Lightning.night, 0.42 * this.sky(t)), screen);

    // A flicker in the cloud just before the bolt.
    if (t > 0.1 && t < 0.16) fillAll(ctx, tone(Lightning.glow, 0.1), screen);

    const strength = this.landed !== null ? flash(t - this.landed) : 0;
    const attached = this.landed !== null && this.dropped === null && this.stowed === null;
    if (attached) {
      this.drawWindow(ctx, t);
      const pour = this.pouring(t);
      if (pour) {
        if (strength > 0) fill(ctx, roundRect(pour.window, 10), tone(Lightning.glow, 0.5 * strength));
        this.refreshArcs(t, pour.window, origin, this.pulled === null ? null : pour.point(add(this.aim, this.tug(t)), this.poured(t)));
        this.drawArcs(ctx);
      }
    }

    if (this.landed !== null && t - this.landed < LINGER) {
      const a = flash(t - this.landed);
      if (a > 0) {
        Lightning.draw(ctx, this.bolt.trunk, this.bolt.forks, this.aim, a);
        fillAll(ctx, tone(Lightning.glow, 0.25 * a), screen);
      }
    }

    if (this.stowed !== null && t - this.stowed < FLASH_TIME) this.drawFlash(ctx, origin, (t - this.stowed) / FLASH_TIME);
  }

  drawWindow(ctx, t) {
    const down = this.takedown, pour = this.pouring(t);
    if (!down || down.covered === null || !this.genie || !pour) return;
    const u = this.poured(t), fade = down.cover(t);
    if (u < 0.25) {
      ctx.save();
      ctx.globalAlpha *= fade * (1 - u / 0.25);
      StandIn.shadow(ctx, pour.window);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha *= fade;
    this.genie.draw(ctx, pour, u);
    ctx.restore();
  }

  /** Electricity jumping about the window until the pull begins, and then a line of lightning from the charm to where the window is gripped. */
  refreshArcs(t, window, origin, grip) {
    const step = Math.trunc(t * 30);
    if (step === this.arcs.step) return;
    const rng = this.rng;
    const edgePoint = () => {
      const along = rand(rng, 0, 1);
      switch (randInt(rng, 0, 3)) {
        case 0: return { x: window.x + along * window.width, y: window.y };
        case 1: return { x: window.x + along * window.width, y: window.y + window.height };
        case 2: return { x: window.x, y: window.y + along * window.height };
        default: return { x: window.x + window.width, y: window.y + along * window.height };
      }
    };
    // Arcs leap across the window, and out from its edge into the air.
    const onWindow = [];
    for (let i = 0; i < (grip === null ? 6 : 0); i++) {
      const a = edgePoint();
      const b = coin(rng) ? edgePoint() : { x: a.x + rand(rng, -70, 70), y: a.y + rand(rng, -70, 70) };
      onWindow.push(jag(a, b, 0.18, 4, rng));
    }
    const line = [];
    if (grip) {
      line.push(jag(origin, grip, 0.07, 6, rng));
      line.push(jag(origin, grip, 0.12, 5, rng));
    }
    this.arcs = { step, window: onWindow, line };
  }

  drawArcs(ctx) {
    Lightning.crackle(ctx, this.arcs.window, 0.9, 1.5);
    if (this.arcs.line.length) {
      Lightning.crackle(ctx, [this.arcs.line[0]], 1, 3);
      Lightning.crackle(ctx, [this.arcs.line[1]], 0.7, 1.5);
    }
  }

  /** The window gone into the charm: a blue-white flash, a shock ring and forks of lightning, bursting out from behind it. */
  drawFlash(ctx, p, u) {
    const reach = Math.max(this.homeSize.width, this.homeSize.height) / 2;
    const e = easeOutCubic(u), fade = 1 - u;
    const glow = reach * (0.3 + 1.0 * e);
    fill(ctx, circle(p, glow), radial(ctx, p, 0, glow, evenly([
      WHITE(0.95 * fade), tone(Lightning.glow, 0.6 * fade), tone(Lightning.glow, 0)])));
    stroke(ctx, circle(p, reach * (0.4 + 1.3 * e)), WHITE(0.75 * fade), 3 * fade + 0.5);
    const forks = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 2 * Math.PI + rand(this.rng, -0.2, 0.2);
      const to = { x: p.x + Math.cos(a) * reach * (0.9 + 1.5 * e), y: p.y + Math.sin(a) * reach * (0.9 + 1.5 * e) };
      forks.push(jag(p, to, 0.2, 3, this.rng));
    }
    Lightning.crackle(ctx, forks, fade, 2);
  }
}
