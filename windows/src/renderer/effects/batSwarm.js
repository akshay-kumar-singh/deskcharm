import { rand } from "../lib/random.js";

// Bat swarm, as in the Mac app's BatSwarm.swift. Batman's answer to being
// thrown about: a swarm of bats bursts up from the bottom of the screen, all
// but blotting it out, and is gone over the top. Only paint, like the web
// blast.

export class BatSwarm {
  /** `frames` are the wingbeat sprites; `body` the bat's body, as a fraction of a frame. */
  constructor({ plan, frames, body, push, sound, finish, rng = Math.random }) {
    Object.assign(this, { plan, frames, body, push, sound, finish, rng });
    this.start = null;
    this.ended = false;
  }

  render(ctx, now) {
    if (this.start === null) {
      this.start = now;
      // The charm is buffeted as the swarm goes up past it.
      this.push({ x: rand(this.rng, -1, 1) * 140, y: -90 });
      this.sound("flutter");
    }
    const t = now - this.start;
    if (!this.ended && t >= this.plan.duration) {
      this.ended = true;
      this.finish();
    }
    this.draw(ctx, t);
  }

  /**
   * Hundreds of bats a frame, so each sets the context's transform outright
   * rather than saving and restoring it.
   */
  draw(ctx, t) {
    const frames = this.frames;
    if (!frames.length) return;
    const base = ctx.getTransform();
    const { plan, body } = this;
    for (const b of plan.bats) {
      const p = plan.pose(b, t);
      if (!p) continue;
      const w = b.span, h = b.span * plan.aspect;
      // Seen face on, so drawn upright, leaning into the way it's veering.
      const lean = (p.heading + Math.PI / 2) * 0.7;
      const cos = Math.cos(lean), sin = Math.sin(lean);
      ctx.setTransform(
        base.a * cos + base.c * sin, base.b * cos + base.d * sin,
        -base.a * sin + base.c * cos, -base.b * sin + base.d * cos,
        base.a * p.at.x + base.c * p.at.y + base.e, base.b * p.at.x + base.d * p.at.y + base.f);
      // Far bats are a little paler, as if seen through more air.
      ctx.globalAlpha = 0.62 + 0.38 * b.depth;
      ctx.drawImage(frames[Math.trunc(p.beat * frames.length) % frames.length], -body.x * w, -body.y * h, w, h);
    }
    ctx.setTransform(base);
    ctx.globalAlpha = 1;
  }
}
