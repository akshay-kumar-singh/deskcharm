import { maxX, maxY, midX, midY } from "../lib/geometry.js";

// Pouring a window, as in the Mac app's Pour.swift. The Batman charm takes a
// window the way a genie goes into its lamp. The window is cut into strips
// across the line to the charm; the strips nearest it pinch in toward that
// line and go first, the far ones follow, and all of them are squeezed thin
// on the way in.

/** How far into the pour the far side of the window sets off. */
const LAG = 0.5;

export class Pour {
  /**
   * Strips stand side by side when the pour runs sideways (`columns`), and are
   * stacked when it runs up or down.
   */
  constructor(window, into, columns) {
    this.window = window;
    this.into = into;
    this.columns = columns;
    // Along the pour and across it.
    this.a0 = columns ? window.x : window.y;
    this.a1 = columns ? maxX(window) : maxY(window);
    this.c0 = columns ? window.y : window.x;
    this.c1 = columns ? maxY(window) : maxX(window);
    this.pa = columns ? into.x : into.y;
    this.pc = columns ? into.y : into.x;
  }

  static runsSideways(window, p) {
    return Math.abs(p.x - midX(window)) >= Math.abs(p.y - midY(window));
  }

  /**
   * Strip `j` of `n`, `u` of the way through the pour (0 untouched, 1 all
   * gone), and how opaque it is: strips fade as they reach the charm.
   */
  strip(j, n, u) {
    const lo = this.a0 + (this.a1 - this.a0) * j / n;
    const hi = this.a0 + (this.a1 - this.a0) * (j + 1) / n;
    const mid = (lo + hi) / 2;
    // A hair of overlap, or the seams between strips show as faint lines.
    const s0 = Math.min(this.placed(lo, u), this.placed(hi, u)) - 0.5;
    const s1 = Math.max(this.placed(lo, u), this.placed(hi, u)) + 0.5;
    const k = this.pinch(mid, u);
    const t0 = this.c0 + (this.pc - this.c0) * k, t1 = this.c1 + (this.pc - this.c1) * k;
    const rect = this.columns ? { x: s0, y: t0, width: s1 - s0, height: t1 - t0 }
                              : { x: t0, y: s0, width: t1 - t0, height: s1 - s0 };
    const e = this.progress(mid, u);
    return { rect, opacity: e > 0.9 ? (1 - e) / 0.1 : 1 };
  }

  /** Where a point of the window, such as the grapple's grip, has been carried. */
  point(q, u) {
    const a = this.columns ? q.x : q.y, c = this.columns ? q.y : q.x;
    const along = this.placed(a, u), across = c + (this.pc - c) * this.pinch(a, u);
    return this.columns ? { x: along, y: across } : { x: across, y: along };
  }

  /** 0 on the side nearest the charm, 1 on the far side. */
  far(a) {
    const near = this.pa >= (this.a0 + this.a1) / 2 ? this.a1 : this.a0;
    return Math.abs(near - a) / Math.max(1, this.a1 - this.a0);
  }

  /** 0 → 1 as this part of the window is drawn in, quickening as it goes. */
  progress(a, u) {
    const x = Math.min(Math.max((u - LAG * this.far(a)) / (1 - LAG), 0), 1);
    return x * x;
  }

  placed(a, u) {
    return a + (this.pa - a) * this.progress(a, u);
  }

  /**
   * How far each part is squeezed toward the line: the near side necks in at
   * once, before it moves, and everything is squeezed ever thinner on the way
   * in, to nothing just as it gets there.
   */
  pinch(a, u) {
    const neck = (1 - this.far(a)) * 0.3 * Math.min(1, u * 5);
    const left = 1 - this.progress(a, u);
    return 1 - left * left * (1 - neck);
  }
}
