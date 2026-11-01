import { WHITE, circle, evenly, fill, gray, radial, rgba, stroke, strokeShifted } from "../lib/canvas.js";
import { add, clamp, dist, easeOutBack, easeOutCubic, lerp, midX, midY, mul, offset, quad, sub, unit } from "../lib/geometry.js";
import { Pour } from "../sim/pour.js";
import { Genie, StandIn, Takedown } from "./common.js";

// Bat tow, as in the Mac app's BatTow.swift. Double-clicking the Batman charm
// sends out a stream of bats from behind it and fires a grapple into the front
// window's title bar. The bats reach the window as the grapple bites and
// circle it; then the window is poured down the grapple into the charm, like a
// genie into its lamp, while the bats' ring slides across to circle the charm
// instead. It goes in a flash, and the bats dive in after it.
//
// As with the web yank, what is poured is a stand-in for the window, which is
// minimised beneath it once it is covered.

// Impulses on the charm, in points per second before chain-length scaling.
const LAUNCH = 110, IMPACT = 260;
const FIRE_TIME = 0.42;                 // the bats are well on their way first
const TUG_TIME = 0.16, TUG_PULL = 18, RETRACT_TIME = 0.24, FLASH_TIME = 0.4, PUFF_TIME = 0.35;
// The stream sets off just after the double-click and reaches the window as
// the grapple bites; it dives home at the flash.
const STREAM_START = 0.08, STREAM_REACH = 0.45, STREAM_RETURN = 0.55;
const RING_SPIN = 0.85;                 // turns a second round the window
const GOLD = [0.93, 0.78, 0.45];

export class BatTow {
  /** `home` is the charm's centre, live, and `homeSize` how big it's drawn: the bats circle it and the bursts are sized to show round it. */
  constructor({ target, aim, home, homeSize, bats, batBody, batAspect, push, sound, finish }) {
    Object.assign(this, { target, aim, home, homeSize, bats, batBody, batAspect, push, sound, finish });
    this.shootTime = 0.2;
    this.pourTime = 0.7;
    this.takedown = target ? new Takedown(target) : null;
    this.genie = null;
    this.start = null;
    this.flocked = false;
    this.landed = this.pulled = this.stowed = this.dropped = this.arrived = null;
    this.ended = false;
    /** One bat of the stream: how far behind the leader it flies, and its look. */
    this.stream = Array.from({ length: 14 }, (_, i) => {
      const size = ((i * 7) % 5) / 4;
      return { lag: i * 0.032, span: 46 + 20 * size, beat: ((i * 5) % 7) / 7 };
    });
    // The bats join the ring on the charm's side of the window and go round
    // over the top of it first.
    const charm = home();
    this.towardHome = unit(sub(charm, aim));
    const frame = target?.frame ?? { x: aim.x - 60, y: aim.y - 40, width: 120, height: 80 };
    this.entryAngle = Math.atan2((charm.y - midY(frame)) / (frame.height / 2 + 36), (charm.x - midX(frame)) / (frame.width / 2 + 44));
    this.spinSign = aim.x <= charm.x ? -1 : 1;
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
    const d = dist(this.home(), this.aim);
    this.shootTime = clamp(d / 2400, 0.16, 0.32);
    this.pourTime = clamp(0.55 + d / 4000, 0.6, 0.85);
    // The charm is jolted away from the window as the bats burst out from behind it.
    this.push(mul({ x: this.towardHome.x >= 0 ? 1 : -1, y: -0.3 }, LAUNCH));
  }

  advance(t) {
    if (!this.flocked && t >= STREAM_START && this.bats.length) {
      this.flocked = true;
      this.sound("flock");
    }
    if (this.landed === null && t >= FIRE_TIME + this.shootTime) {
      this.landed = FIRE_TIME + this.shootTime;
      if (!this.target) this.dropped = this.landed;
      this.sound(this.target ? "clank" : "reel");
    }
    // Pour only once the real window has gone, or the stand-in would go and
    // leave the original sitting there.
    if (this.landed !== null && this.pulled === null && this.dropped === null && this.takedown) {
      const outcome = this.takedown.advance(t, this.landed);
      if (outcome === "gone") { this.pulled = t; this.sound("whoosh"); }
      if (outcome === "failed") { this.dropped = t; this.sound("reel"); }
    }
    if (this.pulled !== null && this.stowed === null && t >= this.pulled + TUG_TIME + this.pourTime) {
      this.stowed = this.pulled + TUG_TIME + this.pourTime;
      // The charm takes the window's weight as it goes in.
      this.push(mul(this.towardHome, IMPACT));
      this.sound("zap");
    }
    const back = this.streamBack;
    if (back !== null && this.arrived === null && t >= back + STREAM_RETURN) {
      this.arrived = back + STREAM_RETURN;
      this.sound("pop");
    }
    const lastLag = this.stream[this.stream.length - 1].lag;
    const streamHome = !this.bats.length || (back !== null && t >= back + STREAM_RETURN + lastLag);
    if (this.arrived !== null && !this.ended && t >= this.arrived + PUFF_TIME && streamHome) {
      this.ended = true;
      this.finish();
    }
  }

  // Poses.

  /** How much of the window has been poured in, 0 → 1. */
  poured(t) {
    if (this.pulled === null) return 0;
    return clamp((t - this.pulled - TUG_TIME) / this.pourTime);
  }

  /** The window's jerk toward the charm as the grapple first takes up. */
  tug(t) {
    if (this.pulled === null || t < this.pulled) return { x: 0, y: 0 };
    return mul(this.towardHome, TUG_PULL * easeOutBack(Math.min(1, (t - this.pulled) / TUG_TIME)));
  }

  pouring(t) {
    if (!this.target) return null;
    const tug = this.tug(t);
    return new Pour(offset(this.target.frame, tug.x, tug.y), this.home(),
      this.genie?.columns ?? Pour.runsSideways(this.target.frame, this.home()));
  }

  /** When the bats turn for home: at the flash, or once the grapple is back after a miss. */
  get streamBack() {
    return this.stowed ?? (this.dropped !== null ? this.dropped + RETRACT_TIME : null);
  }

  /** The ring the bats fly at `t`: round the window with room to spare, sliding across to round the charm as the window is poured into it. */
  ring(t) {
    const tug = this.tug(t);
    const r = offset(this.target?.frame ?? { x: this.aim.x - 60, y: this.aim.y - 40, width: 120, height: 80 }, tug.x, tug.y);
    const u = this.poured(t);
    const round = { width: this.homeSize.width / 2 + 40, height: this.homeSize.height / 2 + 34 };
    return {
      centre: lerp({ x: midX(r), y: midY(r) }, this.home(), u),
      radii: { width: (r.width / 2 + 44) * (1 - u) + round.width * u, height: (r.height / 2 + 36) * (1 - u) + round.height * u },
    };
  }

  circling(t) {
    const { centre: c, radii: r } = this.ring(t);
    const φ = this.entryAngle + this.spinSign * RING_SPIN * 2 * Math.PI * (t - STREAM_START - STREAM_REACH);
    const depth = Math.sin(φ);
    return {
      at: { x: c.x + r.width * Math.cos(φ), y: c.y + r.height * Math.sin(φ) },
      leg: "round", depth, scale: 1 + 0.14 * depth, alpha: 1 - 0.15 * Math.max(0, -depth),
    };
  }

  /**
   * Where the stream's leader is at `t`: out from behind the charm to the
   * window, round it as it's poured away, then home into the charm. Each bat
   * flies the same path a little later, so the stream is a ribbon.
   */
  leader(t) {
    if (t < STREAM_START) return null;
    const back = this.streamBack;
    if (back !== null && t >= back) {
      const w = (t - back) / STREAM_RETURN;
      if (w >= 1) return null;
      const from = this.circling(back).at, to = this.home();
      const lift = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 140 };
      const e = w * w;
      return { at: quad(from, lift, to, e), leg: "home", depth: 1, scale: 1 - 0.65 * e, alpha: w < 0.8 ? 1 : (1 - w) / 0.2 };
    }
    const v = (t - STREAM_START) / STREAM_REACH;
    if (v >= 1) return this.circling(t);
    // Curves out to meet the ring already flying along it.
    const r = this.ring(STREAM_START + STREAM_REACH).radii;
    const entry = this.circling(STREAM_START + STREAM_REACH).at;
    const along = unit(mul({ x: -r.width * Math.sin(this.entryAngle), y: r.height * Math.cos(this.entryAngle) }, this.spinSign));
    const from = this.home();
    const bend = add(entry, mul(along, -0.5 * dist(from, entry)));
    return { at: quad(from, bend, entry, v), leg: "out", depth: -1, scale: 0.55 + 0.45 * v, alpha: Math.min(1, v * 6) };
  }

  // Drawing.

  draw(ctx, t) {
    const origin = this.home();
    const line = unit(sub(this.aim, origin));
    const flights = [];
    for (const b of this.stream) {
      const f = this.leader(t - b.lag);
      if (!f) continue;
      // Leans into the way it's heading.
      const before = this.leader(t - b.lag - 1 / 60)?.at ?? f.at;
      flights.push([b, f, clamp((f.at.x - before.x) * 60 / 1800, -0.7, 0.7)]);
    }

    this.drawBats(ctx, t, flights.filter(([, f]) => f.leg === "out" || (f.leg === "round" && f.depth < 0)));

    const attached = this.landed !== null && this.dropped === null && this.stowed === null;
    if (attached) this.drawWindow(ctx, t);
    const grip = attached ? (this.pouring(t)?.point(add(this.aim, this.tug(t)), this.poured(t)) ?? this.aim) : this.aim;
    if (attached) drawClaw(ctx, grip, line, 1);

    this.drawBats(ctx, t, flights.filter(([, f]) => f.leg === "round" && f.depth >= 0));
    this.drawBats(ctx, t, flights.filter(([, f]) => f.leg === "home"));

    // The cable, from the charm to the claw. The charm hangs over this
    // overlay, so it seems to come from behind it.
    const back = this.streamBack;
    if (t >= FIRE_TIME && this.stowed === null && (back === null || t < back)) {
      const len = dist(origin, this.aim);
      if (this.dropped !== null) {
        const u = Math.min(1, (t - this.dropped) / RETRACT_TIME);
        const end = lerp(this.aim, origin, u * u * u);
        drawCable(ctx, origin, end, len * 0.05 * Math.sin(Math.PI * u), 0);
        drawClaw(ctx, end, line, 0);
      } else if (this.landed === null) {
        const u = (t - FIRE_TIME) / this.shootTime;
        const end = lerp(origin, this.aim, easeOutCubic(u));
        drawCable(ctx, origin, end, len * 0.06 * Math.sin(Math.PI * u), 0);
        drawClaw(ctx, end, line, 0);
      } else {
        // Twangs when the claw bites, and again as it takes up; glows while it pours the window in.
        const since = t - (this.pulled ?? this.landed ?? t);
        let glow = 0;
        if (this.pulled !== null) glow = Math.min(1, (t - this.pulled) / 0.1) * (0.7 + 0.3 * Math.sin(t * 45));
        const twang = Math.sin(since * 60) * Math.exp(-since * 12);
        drawCable(ctx, origin, grip, 4 * twang, glow);
      }
    }

    if (this.stowed !== null && t - this.stowed < FLASH_TIME) this.drawFlash(ctx, origin, (t - this.stowed) / FLASH_TIME);
    if (this.arrived !== null && t - this.arrived < PUFF_TIME) this.drawPuff(ctx, origin, (t - this.arrived) / PUFF_TIME);
  }

  /** The stand-in, strip by strip, as it's poured into the charm. Until the pour starts the strips lie just as the window did. */
  drawWindow(ctx, t) {
    const down = this.takedown;
    const pour = this.pouring(t);
    if (!down || down.covered === null || !this.genie || !pour) return;
    const u = this.poured(t);
    const fade = down.cover(t);
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

  drawBats(ctx, t, flights) {
    if (!this.bats.length || !flights.length) return;
    const frames = this.bats;
    for (const [b, f, lean] of flights) {
      const w = b.span * f.scale, h = w * this.batAspect;
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.translate(f.at.x, f.at.y);
      ctx.rotate(lean);
      ctx.drawImage(frames[Math.trunc((t * 11 + b.beat) * frames.length) % frames.length],
        -this.batBody.x * w, -this.batBody.y * h, w, h);
      ctx.restore();
    }
  }

  /** The window gone into the charm: a white-gold flash, a shock ring and sparks, bursting out from behind it. */
  drawFlash(ctx, p, u) {
    const reach = Math.max(this.homeSize.width, this.homeSize.height) / 2;
    const e = easeOutCubic(u), fade = 1 - u;
    const glow = reach * (0.3 + 0.9 * e);
    fill(ctx, circle(p, glow), radial(ctx, p, 0, glow, evenly([
      WHITE(0.95 * fade), rgba(1, 0.85, 0.45, 0.55 * fade), rgba(1, 0.8, 0.4, 0)])));
    const ring = reach * (0.4 + 1.2 * e);
    stroke(ctx, circle(p, ring), WHITE(0.75 * fade), 3 * fade + 0.5);
    const sparks = new Path2D();
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * 2 * Math.PI + 0.35 * Math.sin(i * 1.7);
      const d = { x: Math.cos(a), y: Math.sin(a) };
      const jitter = 1 + 0.35 * Math.sin(i * 2.9);
      const r0 = reach * (0.5 + 0.6 * e) * jitter, r1 = reach * (0.7 + 1.0 * e) * jitter;
      sparks.moveTo(p.x + d.x * r0, p.y + d.y * r0);
      sparks.lineTo(p.x + d.x * r1, p.y + d.y * r1);
    }
    stroke(ctx, sparks, rgba(1, 0.88, 0.5, fade), 2.2 * fade + 0.4, "round");
  }

  /** A ring and rays of gold, like the emblem's rim, as the bats get home. */
  drawPuff(ctx, p, u) {
    const e = easeOutCubic(u), fade = 1 - u;
    const r = Math.max(this.homeSize.width, this.homeSize.height) / 2 * (0.7 + 0.55 * e);
    stroke(ctx, circle(p, r), rgba(...GOLD, 0.85 * fade), 3 * fade + 0.5);
    const rays = new Path2D();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 2 * Math.PI + 0.15;
      const d = { x: Math.cos(a), y: Math.sin(a) };
      rays.moveTo(p.x + d.x * (r + 10), p.y + d.y * (r + 10));
      rays.lineTo(p.x + d.x * (r + 18 + 26 * e), p.y + d.y * (r + 18 + 26 * e));
    }
    stroke(ctx, rays, rgba(...GOLD, 0.9 * fade), 2.2, "round");
  }
}

/** Steel line: a pale halo so it reads on dark backgrounds, a dark core, and a glint down one side. While it pours a window in it glows. */
function drawCable(ctx, a, b, bow, glow) {
  const v = sub(b, a);
  const len = Math.hypot(v.x, v.y);
  if (len <= 1) return;
  const n = { x: -v.y / len, y: v.x / len };
  const cable = new Path2D();
  const ctl = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, mul(n, bow));
  cable.moveTo(a.x, a.y);
  cable.quadraticCurveTo(ctl.x, ctl.y, b.x, b.y);
  if (glow > 0.01) {
    stroke(ctx, cable, rgba(1, 0.9, 0.55, 0.4 * glow), 12, "round");
    stroke(ctx, cable, WHITE(0.7 * glow), 5, "round");
  }
  stroke(ctx, cable, WHITE(0.35), 4, "round");
  stroke(ctx, cable, gray(0.12), 2.2, "round");
  strokeShifted(ctx, cable, -n.x * 0.6, -n.y * 0.6, WHITE(0.45), 0.6, "round");
}

/** The grapple: a hub and three hooked prongs leading along `dir`, folded in flight and sprung open once it has bitten. */
function drawClaw(ctx, p, dir, open) {
  const base = Math.atan2(dir.y, dir.x);
  const hooks = new Path2D();
  for (const side of [-1, 0, 1]) {
    const a = base + side * (0.3 + 0.6 * open);
    const tip = { x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13 };
    // Each prong curls back at the end, away from the middle one.
    const curl = a + (side === 0 ? 1 : side) * 2.3;
    hooks.moveTo(p.x, p.y);
    hooks.lineTo(tip.x, tip.y);
    hooks.lineTo(tip.x + Math.cos(curl) * 5.5, tip.y + Math.sin(curl) * 5.5);
  }
  const hub = circle(p, 4);
  stroke(ctx, hooks, WHITE(0.4), 4, "round", "round");
  stroke(ctx, hooks, gray(0.14), 2.2, "round", "round");
  fill(ctx, hub, gray(0.14));
  stroke(ctx, hub, WHITE(0.45), 0.8);
}
