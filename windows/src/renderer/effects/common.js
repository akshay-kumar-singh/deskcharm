import { BLACK, WHITE, circle, fill, gray, polygon, polyline, radial, roundRect, stroke, strokeShifted, tone } from "../lib/canvas.js";
import { add, mul, quad, sub } from "../lib/geometry.js";

// Pieces several effects share, as in the Mac app's Webs.swift, WebYank.swift,
// Lightning.swift and WallSmash.swift.

/**
 * A web strand: a pale core over a dark underlay, so it reads on light and
 * dark backgrounds alike, with two fibres twisting round it so it reads as
 * spun silk rather than a line.
 */
export const Silk = {
  color: gray(0.97),

  strand(ctx, a, b, bow, weight = 1) {
    const v = sub(b, a);
    const len = Math.hypot(v.x, v.y);
    if (len <= 1) return;
    const n = { x: -v.y / len, y: v.x / len };
    const ctl = add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, mul(n, bow));
    const core = new Path2D();
    core.moveTo(a.x, a.y);
    core.quadraticCurveTo(ctl.x, ctl.y, b.x, b.y);
    stroke(ctx, core, BLACK(0.22), 3.6 * weight, "round");
    stroke(ctx, core, Silk.color, 1.6 * weight, "round");

    const steps = Math.max(8, Math.trunc(len / 8));
    for (const phase of [0, Math.PI]) {
      const fibre = new Path2D();
      for (let i = 0; i <= steps; i++) {
        const s = i / steps;
        const pinch = Math.min(1, s * 8, (1 - s) * 8);
        const twist = Math.sin(s * len / 7 + phase) * 1.6 * weight * pinch;
        const q = add(quad(a, ctl, b, s), mul(n, twist));
        if (i === 0) fibre.moveTo(q.x, q.y); else fibre.lineTo(q.x, q.y);
      }
      stroke(ctx, fibre, WHITE(0.75), 0.7 * weight);
    }
  },

  /** The blob of web at the leading end of a strand in flight. */
  head(ctx, p, r = 3.4) {
    const blob = circle(p, r);
    stroke(ctx, blob, BLACK(0.22), 2);
    fill(ctx, blob, Silk.color);
  },
};

/** How round a stand-in's corners are: a Windows 11 window's. */
const CORNER = 8;

/** A window's double on screen, over a drop shadow like a real window's. */
export const StandIn = {
  draw(ctx, image, r, fade) {
    ctx.save();
    ctx.globalAlpha *= fade;
    StandIn.shadow(ctx, r);
    ctx.clip(roundRect(r, CORNER));
    ctx.drawImage(image, r.x, r.y, r.width, r.height);
    ctx.restore();
  },

  /**
   * Concentric outlines rather than a blur: blurring the shadow of a
   * full-size window means recomputing millions of pixels every frame.
   */
  shadow(ctx, r) {
    for (let i = 0; i < 10; i++) {
      const d = 1.25 + i * 2.5;
      const ring = { x: r.x - d, y: r.y - d + 6, width: r.width + 2 * d, height: r.height + 2 * d };
      const fall = 1 - i / 10;
      stroke(ctx, roundRect(ring, CORNER + d), BLACK(0.14 * fall * fall), 2.6);
    }
  },
};

/**
 * Getting a window out of the way so its stand-in can be thrown about: cover
 * it with the stand-in, hide (minimise) it once the cover has shown for a few
 * frames, then wait until the window has really gone. Hiding is a call to the
 * main process, so it's asked once and its answer waited for.
 */
export class Takedown {
  constructor(target) {
    this.target = target;
    this.standIn = null;
    this.covered = null;
    this.settled = false;
    this.lead = 0.06;
    this.hideSent = null;
    this.hidden = undefined;             // the answer: true gone, false not
    this.done = false;
    // How long to wait for the stand-in, and then for the window to go.
    this.patience = 0.45;
    this.hidePatience = 0.6;
  }

  /** A snapshot is a pixel-exact double and can swap in almost at once; a card is plainly not the window, so it fades in over it instead. */
  arrived(image, isSnapshot) {
    this.standIn = image;
    this.lead = isSnapshot ? 0.06 : 0.14;
    this.settled = true;
  }

  /** Steps it along at `t`, having started at `begun`. Says once, "gone" or "failed". */
  advance(t, begun) {
    if (this.done || t < begun) return null;
    if (this.covered === null) {
      if (!this.settled && t < begun + this.patience) return null;
      // Without a double to move, hiding the window would just blink it out.
      if (!this.standIn) { this.done = true; return "failed"; }
      this.covered = t;
    }
    if (this.hideSent === null && t >= this.covered + this.lead) {
      this.hideSent = t;
      this.target.hide().then(gone => { this.hidden = gone; }, () => { this.hidden = false; });
    }
    if (this.hideSent !== null) {
      if (this.hidden === true) { this.done = true; return "gone"; }
      if (this.hidden === false || t >= this.hideSent + this.hidePatience) {
        this.done = true;
        this.standIn = null;
        return "failed";
      }
    }
    return null;
  }

  /** The stand-in fading up over the window. */
  cover(t) {
    return this.covered === null ? 0 : Math.min(1, (t - this.covered) / this.lead);
  }
}

/** A stand-in cut into strips across the way it will be poured (see Pour), so that a frame only places them. */
export class Genie {
  /** `size` is the window's in points: a strip every few of them keeps the funnel's edges smooth. */
  constructor(image, size, columns) {
    this.image = image;
    this.columns = columns;
    const n = Math.min(Math.max(Math.trunc((columns ? size.width : size.height) / 6), 32), 160);
    const length = columns ? image.width : image.height;
    this.strips = Array.from({ length: n }, (_, j) => {
      const a = Math.floor(length * j / n), b = Math.floor(length * (j + 1) / n);
      return [a, Math.max(1, b - a)];
    });
  }

  draw(ctx, pour, u) {
    const n = this.strips.length, img = this.image;
    for (let j = 0; j < n; j++) {
      const { rect, opacity } = pour.strip(j, n, u);
      if (opacity <= 0.01 || rect.width <= 0.1 || rect.height <= 0.1) continue;
      const [a, len] = this.strips[j];
      ctx.save();
      ctx.globalAlpha *= opacity;
      if (this.columns) ctx.drawImage(img, a, 0, len, img.height, rect.x, rect.y, rect.width, rect.height);
      else ctx.drawImage(img, 0, a, img.width, len, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    }
  }
}

/**
 * Lightning, shared by the storm's bolts and the strike on a window: a wide
 * cold glow under a bright body under a white-hot core.
 */
export const Lightning = {
  glow: [0.55, 0.7, 1],
  night: [0.03, 0.05, 0.12],

  /** A bolt with its forks, at brightness `a`. `heavy` fattens it; `ground`, where there is one, gets a splash of light. */
  draw(ctx, trunkPoints, forkLines, ground, a, heavy = 1) {
    const trunk = polyline(trunkPoints);
    const forks = new Path2D();
    for (const f of forkLines) polyline(f, forks);
    const glow = Lightning.glow;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    stroke(ctx, trunk, tone(glow, 0.16 * a), 34 * heavy, "round", "round");
    stroke(ctx, forks, tone(glow, 0.12 * a), 16, "round", "round");
    stroke(ctx, trunk, tone(glow, 0.4 * a), 12 * heavy, "round", "round");
    stroke(ctx, forks, tone(glow, 0.35 * a), 5, "round", "round");
    ctx.restore();
    stroke(ctx, forks, WHITE(0.85 * a), 1.6, "round", "round");
    stroke(ctx, trunk, WHITE(a), 3.6 * heavy, "round", "round");
    if (!ground) return;
    const r = 130 * heavy;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    fill(ctx, circle(ground, r), radial(ctx, ground, 0, r, [[0, tone(glow, 0.7 * a)], [1, tone(glow, 0)]]));
    ctx.restore();
  },

  /** Short-lived arcs of electricity: thin, bright and quickly redrawn. */
  crackle(ctx, lines, a, width) {
    const path = new Path2D();
    for (const l of lines) polyline(l, path);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    stroke(ctx, path, tone(Lightning.glow, 0.35 * a), width * 4.5, "round", "round");
    ctx.restore();
    stroke(ctx, path, WHITE(a), width, "round", "round");
  },
};

/** Smashed concrete as it's drawn, by the wall smash and where the Hulk's slams land. */
export const ConcreteArt = {
  outline: points => polygon(points),

  /**
   * A crack thins steadily along its length, so it is cut into pieces, each
   * drawn at the width it has there, gathered into a few widths.
   */
  tapered(cracks) {
    const widths = [5, 4, 3.2, 2.5, 1.9, 1.4, 1, 0.7];
    const paths = widths.map(() => ({ path: new Path2D(), used: false }));
    for (const crack of cracks) {
      const n = crack.points.length - 1;
      for (let i = 0; i < n; i++) {
        const w = crack.width * (1 - i / Math.max(n, 1)) + 0.6;
        let k = widths.findIndex(x => x <= w);
        if (k < 0) k = widths.length - 1;
        paths[k].path.moveTo(crack.points[i].x, crack.points[i].y);
        paths[k].path.lineTo(crack.points[i + 1].x, crack.points[i + 1].y);
        paths[k].used = true;
      }
    }
    return paths.map((p, k) => ({ path: p.path, width: widths[k], used: p.used })).filter(p => p.used);
  },

  /** Cracks: dark, with a lit lip. */
  stroke(ctx, cracks, fade) {
    for (const { path, width } of cracks) {
      stroke(ctx, path, gray(0.07, 0.75 * fade), width, "round", "round");
      strokeShifted(ctx, path, 0.7, 0.9, WHITE(0.3 * fade), Math.max(0.5, width * 0.4), "round", "round");
    }
  },

  /** A loose piece at `at`, turned, shaded on its own. `concrete` is a tile pattern maker (see concreteTiles). */
  draw(ctx, piece, at, turned, concrete) {
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(turned);
    const outline = polygon(piece.outline);
    if (concrete) fill(ctx, outline, concrete(ctx, 0.4));
    fill(ctx, outline, piece.shade < 1 ? BLACK(0.55 * (1 - piece.shade)) : WHITE(0.5 * (piece.shade - 1)));
    stroke(ctx, outline, BLACK(0.45), 0.8);
    ctx.restore();
  },
};

/**
 * Rough concrete as a fill: the picture tiled at `scale`, as SwiftUI's
 * .tiledImage. Patterns belong to a context, so they're made per context and
 * kept.
 */
export function concreteTiles(image) {
  const made = new Map();
  return (ctx, scale) => {
    const key = scale;
    let byContext = made.get(ctx);
    if (!byContext) { byContext = new Map(); made.set(ctx, byContext); }
    let pattern = byContext.get(key);
    if (!pattern) {
      pattern = ctx.createPattern(image, "repeat");
      pattern.setTransform(new DOMMatrix().scaleSelf(scale, scale));
      byContext.set(key, pattern);
    }
    return pattern;
  };
}
