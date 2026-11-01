import { BLACK, circle, ellipse, fill, fillAll, polygon, polyline, radial, rgba, stroke, tone } from "../lib/canvas.js";
import { add, dist, easeOutCubic, lerp, mul, sub, unit } from "../lib/geometry.js";
import { STEP } from "../sim/symbiote.js";

// Symbiote crawl, as in the Mac app's Venom.swift. The symbiote let loose, the
// way it moves in the films: a pool of it wells out of the charm, and fat,
// glossy tendrils lunge out of that and across the screen, thrashing as they
// go, blunt heads reaching, strings of goo stretching between them. It holds,
// still writhing, then is sucked back into the charm, heads first. Paint only.

const HOLD_TIME = 1.6, RETREAT_TIME = 0.8;
const INK = rgba(0.02, 0.02, 0.035);
const SHEEN = [0.72, 0.8, 1];

export class SymbioteCrawl {
  constructor({ plan, push, sound, finish }) {
    Object.assign(this, { plan, push, sound, finish });
    const s = plan.size;
    /** The furthest corner from where it came out. */
    this.reach = Math.max(...[{ x: 0, y: 0 }, { x: s.width, y: 0 }, { x: 0, y: s.height }, { x: s.width, y: s.height }]
      .map(c => dist(plan.origin, c)));
    this.start = null;
    this.retreating = this.ended = false;
  }

  get lifetime() { return this.plan.spread + HOLD_TIME + RETREAT_TIME; }

  render(ctx, now) {
    if (this.start === null) {
      this.start = now;
      this.push({ x: 0, y: -260 });
      this.sound("hiss");
      this.sound("ooze");
    }
    const t = now - this.start;
    this.advance(t);
    this.draw(ctx, this.crawled(t), t);
  }

  advance(t) {
    if (!this.retreating && t >= this.plan.spread + HOLD_TIME) {
      this.retreating = true;
      this.sound("slurp");
    }
    if (!this.ended && t >= this.lifetime) {
      this.ended = true;
      // All of it slapping back into the charm at once.
      this.push({ x: 0, y: 320 });
      this.sound("gulp");
      this.finish();
    }
  }

  /**
   * How far into its crawl the symbiote has got: growing, held at full spread,
   * then wound back so it retreats along its own paths, the heads going first
   * and faster as it's sucked in.
   */
  crawled(t) {
    const back = t - this.plan.spread - HOLD_TIME;
    if (back <= 0) return Math.min(t, this.plan.spread);
    const u = Math.min(1, back / RETREAT_TIME);
    return this.plan.spread * (1 - u * u);
  }

  draw(ctx, crawled, t) {
    const plan = this.plan;
    if (plan.spread <= 0 || crawled <= 0) return;
    const o = plan.origin;
    const progress = crawled / plan.spread;

    // The shadow it casts over the screen as it spreads, thickest at the charm, breathing.
    const r = Math.max(1, this.reach * 1.05 * progress * (1 + 0.04 * Math.sin(t * 3)));
    fillAll(ctx, radial(ctx, o, 0, r, [[0, BLACK(0.36)], [0.8, BLACK(0.16)], [1, BLACK(0)]]), plan.size);

    // Every tendril as it is this frame. Forks come after their parents, so
    // each can be carried with the point it forked from.
    const limbs = new Array(plan.tendrils.length).fill(null);
    const moved = new Array(plan.tendrils.length).fill(null);
    plan.tendrils.forEach((tendril, k) => {
      let carry = { x: 0, y: 0 };
      if (tendril.parent) {
        const { tendril: i, point: j } = tendril.parent;
        const parent = moved[i];
        if (parent && j < parent.length) carry = sub(parent[j], plan.tendrils[i].points[j]);
      }
      const limb = this.body(k, crawled, t, carry);
      if (!limb) return;
      limbs[k] = limb;
      moved[k] = limb.centre;
    });

    // Strings of goo between neighbours, behind them: sagging, and stretched thin in the middle.
    for (const strand of plan.strands) {
      const a = moved[strand.a.tendril], b = moved[strand.b.tendril];
      if (!a || strand.a.point >= a.length || !b || strand.b.point >= b.length) continue;
      const p = a[strand.a.point], q = b[strand.b.point];
      // Drooping under its own weight, and swaying.
      const sag = 0.45 * dist(p, q) * (1 + 0.2 * Math.sin(t * 4 + strand.a.point));
      const string = new Path2D();
      string.moveTo(p.x, p.y);
      string.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 + sag, q.x, q.y);
      // Thick where it clings, drawn out thin between.
      stroke(ctx, string, INK, 2.2, "round");
      for (const [end, toward] of [[p, q], [q, p]]) {
        const d = unit(sub(toward, end));
        for (const [along, rad] of [[0, 5], [6, 3.2]]) {
          fill(ctx, circle({ x: end.x + d.x * along, y: end.y + d.y * along + along * 0.5 }, rad), INK);
        }
      }
    }

    // The tendrils: glossy black bodies with blunt, swollen heads.
    for (const limb of limbs) if (limb) drawLimb(ctx, limb);

    // The pool welling out of the charm, its edge heaving.
    const pool = (30 + 80 * easeOutCubic(Math.min(1, progress * 1.6))) * Math.sqrt(progress);
    const edge = [];
    for (let i = 0; i <= 60; i++) {
      const a = i / 60 * 2 * Math.PI;
      const wobble = 0.12 * Math.sin(3 * a + t * 2.2) + 0.07 * Math.sin(5 * a - t * 3.1 + 1) + 0.05 * Math.sin(9 * a + t * 4.3);
      edge.push({ x: o.x + Math.cos(a) * pool * (1 + wobble), y: o.y + Math.sin(a) * pool * (1 + wobble) });
    }
    const poolPath = polygon(edge);
    fill(ctx, poolPath, INK);
    stroke(ctx, poolPath, tone(SHEEN, 0.16), 1.5);
    // Light sliding over its surface as it churns.
    for (let i = 0; i < 3; i++) {
      const a = t * (0.6 + 0.3 * i) + i * 2.1;
      const c = { x: o.x + Math.cos(a) * pool * 0.45, y: o.y + Math.sin(a) * 0.6 * pool * 0.45 };
      const s = pool * (0.22 - 0.05 * i);
      fill(ctx, ellipse(c.x - s, c.y - s * 0.4, 2 * s, s * 0.8), tone(SHEEN, 0.14));
    }
  }

  /**
   * A tendril as it is this frame: its centre line bent by a wave running out
   * along it that throws its head about most, carried with the point of
   * whatever it forked from so a fork stays on it, and its thickness pulsing;
   * null if it hasn't set off yet.
   */
  body(k, crawled, t, carry) {
    const tendril = this.plan.tendrils[k];
    if (!(tendril.times[0] < crawled)) return null;
    let end = 0;
    while (end + 1 < tendril.times.length && tendril.times[end + 1] <= crawled) end++;
    const points = tendril.points.slice(0, end + 1);
    const widths = tendril.widths.slice(0, end + 1);
    const crawling = end + 1 < tendril.points.length;
    if (crawling) {
      const f = (crawled - tendril.times[end]) / (tendril.times[end + 1] - tendril.times[end]);
      points.push(lerp(tendril.points[end], tendril.points[end + 1], f));
      widths.push(tendril.widths[end + 1]);
    }
    if (points.length <= 1) return null;

    const count = points.length;
    const length = (count - 1) * STEP;
    const centre = [], pulsed = [];
    points.forEach((p, n) => {
      const along = n * STEP;
      const d = unit(sub(points[Math.min(n + 1, count - 1)], points[Math.max(n - 1, 0)]));
      // Still where it leaves the charm or its parent, thrashing harder toward
      // its head, and the head casting about on top of that.
      const rooted = Math.min(1, along / 110);
      const toHead = length > 0 ? along / length : 0;
      const wave = Math.sin(along / 65 - t * 5.5 + tendril.phase);
      const cast = Math.sin(t * 7.3 + tendril.phase * 1.7) * Math.max(0, toHead - 0.7) / 0.3;
      const thrash = wave * rooted * (5 + 12 * toHead) + cast * 9;
      centre.push(add(add(p, carry), mul({ x: -d.y, y: d.x }, thrash)));
      // Bulges pumping out along it.
      pulsed.push(widths[n] * (1 + 0.16 * Math.sin(along / 38 - t * 6.5 + tendril.phase)));
    });
    return { centre, widths: pulsed, crawling };
  }
}

/**
 * Outlines a tendril from its centre line and fills it: a glossy black body,
 * a faint cool rim, a highlight down one side, and a blunt head swollen a
 * little wider than the neck behind it.
 */
function drawLimb(ctx, limb) {
  const c = limb.centre, count = c.length;
  const left = [], right = [], shine = [];
  for (let n = 0; n < count; n++) {
    const d = unit(sub(c[Math.min(n + 1, count - 1)], c[Math.max(n - 1, 0)]));
    const side = { x: -d.y, y: d.x };
    // The last few points swell into the head.
    const swell = n >= count - 3 ? 1.25 : 1;
    const half = limb.widths[n] / 2 * swell;
    left.push(add(c[n], mul(side, half)));
    right.push(add(c[n], mul(side, -half)));
    shine.push(add(c[n], mul(side, half * 0.45)));
  }
  // Round the head off: half a circle from one side to the other, round the front.
  const head = c[count - 1], ahead = unit(sub(c[count - 1], c[count - 2]));
  const side = { x: -ahead.y, y: ahead.x };
  const r = limb.widths[count - 1] / 2 * 1.25;
  const cap = [];
  for (let k = 1; k < 12; k++) {
    const a = Math.PI * k / 12;
    cap.push(add(add(head, mul(side, r * Math.cos(a))), mul(ahead, r * Math.sin(a))));
  }
  const shape = polygon([...left, ...cap, ...right.reverse()]);

  stroke(ctx, shape, tone(SHEEN, 0.14), 1.2);
  fill(ctx, shape, INK);
  // A swelling where it leaves its parent, so a fork grows out of it rather than meeting it at a corner.
  fill(ctx, circle(c[0], limb.widths[0] * 0.65), INK);
  stroke(ctx, polyline(shine), tone(SHEEN, 0.32), Math.max(1.2, limb.widths[0] * 0.09), "round", "round");
  // A glint on the head as it reaches.
  const g = add(add(head, mul(side, r * 0.35)), mul(ahead, r * -0.1));
  fill(ctx, ellipse(g.x - r * 0.25, g.y - r * 0.18, r * 0.5, r * 0.36), tone(SHEEN, limb.crawling ? 0.4 : 0.25));
}
