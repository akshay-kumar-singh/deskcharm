import { BLACK, WHITE, circle, evenly, fill, fillAll, gray, linear, radial, rgba, stroke, strokeShifted } from "../lib/canvas.js";
import { dist, easeOutBack, easeOutCubic } from "../lib/geometry.js";
import { rand } from "../lib/random.js";
import { Crater } from "../sim/rubble.js";
import { ConcreteArt } from "./common.js";

// Wall smash, as in the Mac app's WallSmash.swift. The Hulk's answer to being
// thrown about: three blows at the screen as if it were a concrete wall. Each
// leaves a crater, knocks chips off round it, sends cracks forking away across
// the screen, and throws out chunks and dust. It holds a moment, then the
// craters crumble and fall out and the dust clears. Paint only.

const SPREAD_TIME = 0.2;        // cracks racing out from a blow
const FLASH_TIME = 0.16;
const SHAKE_TIME = 0.45;
const DUST_TIME = 1.5;
const FLY_TIME = 1.3;           // chunks thrown out by a blow
const CRUMBLE_AT = 3.3;         // seconds in when the craters give way
const CRUMBLE_TIME = 1.3;
export const DUST = [0.72, 0.68, 0.62];

export class WallSmash {
  /** `concrete(ctx, scale)` gives the wall's tiled texture as a fill. */
  constructor({ size, concrete, push, sound, finish, rng = Math.random }) {
    Object.assign(this, { size, concrete, push, sound, finish, rng });
    // Spread over the screen so that between them they smash all of it.
    const spots = [{ x: 0.3, y: 0.42 }, { x: 0.72, y: 0.6 }, { x: 0.52, y: 0.27 }];
    const bounds = { x: 0, y: 0, width: size.width, height: size.height };
    const radius = Math.min(Math.max(Math.min(size.width, size.height) * 0.11, 64), 140);
    const corners = [{ x: 0, y: 0 }, { x: size.width, y: 0 }, { x: 0, y: size.height }, { x: size.width, y: size.height }];
    this.blows = spots.map((s, i) => {
      const at = { x: (s.x + rand(rng, -0.05, 0.05)) * size.width, y: (s.y + rand(rng, -0.05, 0.05)) * size.height };
      const crater = new Crater(at, radius * rand(rng, 0.85, 1.15), bounds, rng);
      const pit = crater.rim.map(q => ({ x: at.x + (q.x - at.x) * rand(rng, 0.38, 0.55), y: at.y + (q.y - at.y) * rand(rng, 0.38, 0.55) }));
      const chips = new Path2D();
      for (const chip of crater.chips) chips.addPath(ConcreteArt.outline(chip));
      return {
        time: i * 0.34, crater, rim: ConcreteArt.outline(crater.rim), pit: ConcreteArt.outline(pit), chips,
        reach: Math.max(...corners.map(c => dist(at, c))), cracks: ConcreteArt.tapered(crater.cracks),
        dust: Array.from({ length: 11 }, () => [rand(rng, 0, 2 * Math.PI), rand(rng, 0.6, 1.2)]),
      };
    });
    this.start = null;
    this.struck = 0;
    this.held = this.crumbled = this.ended = false;
    this.heldUntil = null;
  }

  render(ctx, now) {
    if (this.start === null) this.start = now;
    const t = now - this.start;
    this.advance(t);
    this.draw(ctx, t);
  }

  advance(t) {
    while (this.struck < this.blows.length && t >= this.blows[this.struck].time) {
      this.push({ x: rand(this.rng, -1, 1) * 170, y: -60 });
      this.sound("crash");
      this.struck++;
    }
    // Once the dust and the chunks have settled, stop redrawing until the craters give way.
    const settled = this.blows[this.blows.length - 1].time + Math.max(DUST_TIME, FLY_TIME, SHAKE_TIME) + 0.05;
    if (!this.held && t >= settled && t < CRUMBLE_AT) {
      this.held = true;
      this.heldUntil = this.start + CRUMBLE_AT;
    }
    if (!this.crumbled && t >= CRUMBLE_AT) {
      this.crumbled = true;
      this.sound("rubble");
    }
    if (!this.ended && t >= CRUMBLE_AT + CRUMBLE_TIME) {
      this.ended = true;
      this.finish();
    }
  }

  draw(ctx, t) {
    const s = this.shake(t);
    ctx.save();
    ctx.translate(s.x, s.y);
    const fade = t < CRUMBLE_AT ? 1 : Math.max(0, 1 - (t - CRUMBLE_AT) / 0.6);
    for (const b of this.blows) if (t >= b.time) this.drawCracks(ctx, b, t, fade);
    for (const b of this.blows) {
      if (t < b.time) continue;
      if (t < CRUMBLE_AT) this.drawCrater(ctx, b, t);
      else this.drawPieces(ctx, b.crater.crumbs, t - CRUMBLE_AT, 0.5);
    }
    for (const b of this.blows) if (t >= b.time && t - b.time < FLY_TIME) this.drawPieces(ctx, b.crater.thrown, t - b.time, 0.8);
    for (const b of this.blows) if (t >= b.time) this.drawDust(ctx, b, t);
    ctx.restore();
    for (const b of this.blows) {
      if (t >= b.time && t - b.time < FLASH_TIME) {
        const u = (t - b.time) / FLASH_TIME;
        fillAll(ctx, WHITE(0.22 * (1 - u) * (1 - u)), this.size);
      }
    }
  }

  /** Cracks racing out from where the blow landed: dark, with a lit lip. */
  drawCracks(ctx, b, t, fade) {
    if (fade <= 0) return;
    const r = Math.max(1, b.reach * easeOutCubic((t - b.time) / SPREAD_TIME));
    ctx.save();
    ctx.clip(circle(b.crater.centre, r));
    ConcreteArt.stroke(ctx, b.cracks, fade);
    ctx.restore();
  }

  /** The crater: bare concrete, deep in the middle and shadowed on the side the light comes from, with chips knocked off round its lip. */
  drawCrater(ctx, b, t) {
    const p = b.crater.centre, r = b.crater.radius;
    ctx.save();
    // Punched in: it bursts open in a few frames.
    const open = easeOutBack(Math.min(1, (t - b.time) / 0.1));
    ctx.translate(p.x, p.y);
    ctx.scale(open, open);
    ctx.translate(-p.x, -p.y);
    fill(ctx, b.chips, this.concrete(ctx, 0.4));
    fill(ctx, b.chips, WHITE(0.14));
    stroke(ctx, b.chips, BLACK(0.5), 1);
    fill(ctx, b.rim, this.concrete(ctx, 0.45));
    fill(ctx, b.rim, linear(ctx, { x: p.x - r, y: p.y - r }, { x: p.x + r, y: p.y + r }, evenly([BLACK(0.55), BLACK(0.1), WHITE(0.12)])));
    fill(ctx, b.rim, radial(ctx, p, 0, r * 1.05, evenly([BLACK(0.6), BLACK(0.18), BLACK(0)])));
    strokeShifted(ctx, b.rim, -1, -1.4, WHITE(0.4), 1.4);
    stroke(ctx, b.rim, gray(0.08, 0.85), 1.6);
    // The pit where the fist went in: deeper, with its own broken lip.
    fill(ctx, b.pit, this.concrete(ctx, 0.3));
    fill(ctx, b.pit, radial(ctx, p, 0, r * 0.5, evenly([BLACK(0.85), BLACK(0.5)])));
    strokeShifted(ctx, b.pit, 0.8, 1.2, WHITE(0.3), 1.2);
    stroke(ctx, b.pit, BLACK(0.7), 1.2);
    ctx.restore();
  }

  /** Loose concrete tumbling down under gravity, each piece shaded on its own. */
  drawPieces(ctx, pieces, τ, fadeAfter) {
    const alpha = τ < fadeAfter ? 1 : Math.max(0, 1 - (τ - fadeAfter) / 0.5);
    if (alpha <= 0) return;
    for (const piece of pieces) {
      const at = Crater.position(piece, τ);
      if (at.y >= this.size.height + 40) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ConcreteArt.draw(ctx, piece, at, piece.spin * τ, this.concrete);
      ctx.restore();
    }
  }

  /** Dust thrown off by the blow, billowing out and settling; and again, once the crater crumbles. */
  drawDust(ctx, b, t) {
    for (const since of [t - b.time, t - CRUMBLE_AT]) {
      if (since < 0 || since >= DUST_TIME) continue;
      const u = since / DUST_TIME;
      const e = easeOutCubic(u);
      for (const [heading, reach] of b.dust) {
        const d = { x: Math.cos(heading), y: Math.sin(heading) };
        const p = { x: b.crater.centre.x + d.x * (20 + 150 * e) * reach, y: b.crater.centre.y + d.y * (20 + 150 * e) * reach - 30 * e };
        const r = (28 + 120 * e) * reach;
        fill(ctx, circle(p, r), radial(ctx, p, 0, r, evenly([rgba(...DUST, 0.42 * (1 - u) ** 1.3), rgba(...DUST, 0)])));
      }
    }
  }

  shake(t) {
    const v = { x: 0, y: 0 };
    for (const b of this.blows) {
      if (t < b.time || t - b.time >= SHAKE_TIME) continue;
      const u = t - b.time;
      const a = 13 * Math.exp(-u / 0.1);
      v.x += a * Math.sin(u * 72);
      v.y += a * Math.cos(u * 59);
    }
    return v;
  }
}
