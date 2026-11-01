import { ellipse, fill, fillAll, gray, radial, rgba, stroke, tone, evenly } from "../lib/canvas.js";
import { rand } from "../lib/random.js";
import { flash, LINGER, SLANT, THUNDER_LAG } from "../sim/storm.js";
import { Lightning } from "./common.js";

// Thunderstorm, as in the Mac app's ThorStorm.swift. Thor's answer to being
// thrown about: the sky closes in over the screen, rain sheets down, and
// lightning forks out of the cloud — the last bolt straight into the charm,
// which is jolted by it — with thunder rolling in behind each flash. Paint only.

export class ThorStorm {
  constructor({ plan, push, sound, finish, rng = Math.random }) {
    Object.assign(this, { plan, push, sound, finish, rng });
    this.start = null;
    this.struck = 0;                    // bolts whose flash has gone off
    this.thundered = 0;                 // bolts whose thunder has arrived
    this.ended = false;
  }

  render(ctx, now) {
    if (this.start === null) {
      this.start = now;
      this.sound("rain");
    }
    const t = now - this.start;
    this.cues(t);
    if (!this.ended && t >= this.plan.duration) {
      this.ended = true;
      this.finish();
    }
    this.draw(ctx, t);
  }

  /** Thunder follows each flash a moment later, as sound does; the bolt that hits the charm shoves it as it lands. */
  cues(t) {
    const bolts = this.plan.bolts;
    while (this.struck < bolts.length && t >= bolts[this.struck].time) {
      if (bolts[this.struck].charm) this.push({ x: rand(this.rng, -1, 1) * 320, y: 170 });
      this.struck++;
    }
    while (this.thundered < bolts.length && t >= bolts[this.thundered].time + THUNDER_LAG) {
      this.sound("thunder");
      this.thundered++;
    }
  }

  draw(ctx, t) {
    const plan = this.plan, size = plan.size;
    const gloom = plan.gloom(t), lit = plan.flash(t);
    fillAll(ctx, tone(Lightning.night, 0.58 * gloom), size);
    this.clouds(ctx, t, gloom, lit);
    this.rain(ctx, t, gloom, lit);
    for (const b of plan.bolts) this.strike(ctx, b, t);
    if (lit > 0) fillAll(ctx, tone(Lightning.glow, 0.3 * lit), size);
  }

  /** A bank of soft dark puffs along the top, lit from within when it flashes. */
  clouds(ctx, t, gloom, lit) {
    const w = this.plan.size.width;
    for (const c of this.plan.clouds) {
      const x = (c.x * w + c.drift * t + 0.15 * w) % (1.3 * w) - 0.15 * w;
      const toneLevel = 0.07 + 0.1 * c.shade + 0.5 * lit;
      const body = [toneLevel * 0.9, toneLevel, Math.min(1, toneLevel * 1.3 + 0.04)];
      const at = { x, y: c.y };
      fill(ctx, ellipse(at.x - c.radius, at.y - c.radius * 0.7, 2 * c.radius, 1.4 * c.radius),
        radial(ctx, at, 0, c.radius, evenly([rgba(...body, 0.95 * gloom), rgba(...body, 0)])));
    }
  }

  /** Three bands of drops by depth, each one stroke, the near ones longer, brighter and heavier. */
  rain(ctx, t, gloom, lit) {
    if (gloom <= 0.01) return;
    const bands = [new Path2D(), new Path2D(), new Path2D()];
    for (const d of this.plan.drops) {
      const p = this.plan.position(d, t);
      const band = Math.min(2, Math.trunc(d.depth * 3));
      bands[band].moveTo(p.x, p.y);
      bands[band].lineTo(p.x - SLANT * d.length, p.y - d.length);
    }
    const light = 0.25 * lit;
    bands.forEach((path, k) => {
      stroke(ctx, path, gray(Math.min(1, 0.78 + light), (0.22 + 0.16 * k) * gloom), 1 + 0.5 * k, "round");
    });
  }

  /** A bolt for as long as it lingers, flickering with the flash. */
  strike(ctx, b, t) {
    const u = t - b.time;
    if (u < 0 || u >= LINGER) return;
    const a = flash(u);
    if (a <= 0) return;
    Lightning.draw(ctx, b.trunk, b.forks, b.ground, a, b.charm ? 1.3 : 1);
  }
}
