// Cloth, as in the Mac app's Cloth.swift: a window as a flexible sheet, swung
// about by one edge so that it whips and flops, and slammed into the floor so
// that it splats against it and springs back. It lives in the plane of the
// screen, in points, y up.
//
// Bent in its own plane, a sheet has to stretch round the outside of the curve
// and squash on the inside, so it's a grid stepped with Verlet integration like
// the charm's chain, kept in shape by shape matching — strips of it,
// overlapping, each pulled back toward the nearest turn of their shape at rest
// — with its middle row held to its length and the rest let stretch or squash
// only so far. It bends and wobbles like a rubber mat, and never crumples or
// pulls out long.

const STEP = 1 / 240;
/** What a held point counts for, against a free one, in finding a strip's turn. */
const GRIP = 40;

export class Cloth {
  /** A sheet `width` by `height`, `columns` by `rows` points, its top left at `topLeft`. Row 0 is the top edge. */
  constructor(columns, rows, width, height, topLeft) {
    this.columns = columns;
    this.rows = rows;
    const n = columns * rows;
    const dx = width / (columns - 1), dy = height / (rows - 1);
    this.spacing = dx;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = topLeft.x + (i % columns) * dx;
      this.y[i] = topLeft.y - Math.floor(i / columns) * dy;
    }
    this.ox = Float64Array.from(this.x);
    this.oy = Float64Array.from(this.y);
    /** Pinned points: index → {x, y}; where they were pinned before; where they're going. */
    this.held = new Map();
    this.heldFrom = new Map();
    this.grips = new Map();

    this.gravity = 2400;
    this.floor = 0;
    this.walls = [-Infinity, Infinity];
    this.damping = 0.997;
    /** How hard it springs back into shape each step, 0 to 1. */
    this.stiffness = 0.3;
    this.iterations = 6;
    /** Points striking the floor since this was last emptied, and how hard. */
    this.landings = [];
    this.accumulator = 0;

    // Strips four columns wide, every two: each overlaps the next by half.
    this.strips = [];
    this.shares = new Float64Array(n);
    let first = 0;
    for (;;) {
      const last = Math.min(first + 3, columns - 1);
      const members = [];
      for (let r = 0; r < rows; r++) for (let c = first; c <= last; c++) members.push(r * columns + c);
      this.strips.push({ members, sx: members.map(i => this.x[i]), sy: members.map(i => this.y[i]) });
      for (const i of members) this.shares[i] += 1;
      if (last === columns - 1) break;
      first += 2;
    }

    /** Neighbours along a row or down a column, and how far apart they may get. */
    this.links = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const i = r * columns + c;
        if (c + 1 < columns) {
          // Away from the middle, a row may give by up to a quarter.
          const give = r === Math.floor(rows / 2) ? 0 : 0.25;
          this.links.push([i, i + 1, dx * (1 - give), dx * (1 + give)]);
        }
        if (r + 1 < rows) this.links.push([i, i + columns, dy * 0.9, dy * 1.1]);
        // Across each square both ways, so it can't shear over flat.
        if (c + 1 < columns && r + 1 < rows) {
          const d = Math.hypot(dx, dy);
          this.links.push([i, i + columns + 1, d * 0.88, d * 1.12]);
          this.links.push([i + 1, i + columns, d * 0.88, d * 1.12]);
        }
      }
    }
  }

  get count() { return this.x.length; }
  index(column, row) { return row * this.columns + column; }
  point(i) { return { x: this.x[i], y: this.y[i] }; }
  get points() { return Array.from({ length: this.count }, (_, i) => this.point(i)); }

  /** Moves every point to where `place(column, row)` says, at rest there. */
  place(place) {
    for (let i = 0; i < this.count; i++) {
      const p = place(i % this.columns, Math.floor(i / this.columns));
      this.x[i] = this.ox[i] = p.x;
      this.y[i] = this.oy[i] = p.y;
    }
  }

  /**
   * Pins points where something holds them, from the next advance on; the
   * rest hang off them. A grip that moves is moved there smoothly over the
   * steps of that advance, not jumped, which would jolt the sheet.
   */
  hold(grips) {
    this.heldFrom = this.held.size === 0 ? new Map(grips) : new Map(this.held);
    this.grips = new Map(grips);
    if (this.held.size === 0) this.held = new Map(grips);
  }

  /** Lets go, sending the whole sheet off at `velocity` points a second. */
  release(velocity) {
    this.held = new Map();
    this.grips = new Map();
    for (let i = 0; i < this.count; i++) {
      this.ox[i] = this.x[i] - velocity.x * STEP;
      this.oy[i] = this.y[i] - velocity.y * STEP;
    }
  }

  /** Advances by `dt` seconds in fixed steps, so the solve stays stable however the frames fall. */
  advance(dt) {
    this.accumulator += Math.min(Math.max(dt, 0), 0.05);
    const steps = Math.floor(this.accumulator / STEP);
    for (let k = 0; k < steps; k++) {
      if (this.grips.size) {
        const u = (k + 1) / steps;
        const held = new Map();
        for (const [i, to] of this.grips) {
          const from = this.heldFrom.get(i) ?? to;
          held.set(i, { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u });
        }
        this.held = held;
      }
      this.tick();
      this.accumulator -= STEP;
    }
  }

  tick() {
    const { x, y, ox, oy, held } = this;
    const g = -this.gravity * STEP * STEP;
    for (let i = 0; i < this.count; i++) {
      const grip = held.get(i);
      if (grip) {
        ox[i] = x[i]; oy[i] = y[i];
        x[i] = grip.x; y[i] = grip.y;
        continue;
      }
      const vx = (x[i] - ox[i]) * this.damping, vy = (y[i] - oy[i]) * this.damping;
      ox[i] = x[i]; oy[i] = y[i];
      x[i] += vx;
      y[i] += vy + g;
    }
    this.reshape();
    for (let it = 0; it < this.iterations; it++) {
      for (const [a, b, shortest, longest] of this.links) {
        const ddx = x[b] - x[a], ddy = y[b] - y[a];
        const d = Math.hypot(ddx, ddy);
        if (d <= 0.0001 || (d >= shortest && d <= longest)) continue;
        const fa = held.has(a) ? 0 : 1, fb = held.has(b) ? 0 : 1;
        if (fa + fb === 0) continue;
        const to = Math.min(Math.max(d, shortest), longest);
        const k = (d - to) / d / (fa + fb);
        x[a] += ddx * k * fa; y[a] += ddy * k * fa;
        x[b] -= ddx * k * fb; y[b] -= ddy * k * fb;
      }
      this.collide();
    }
    // However hard it's swung, the middle row can't pull out long: worked out
    // along from the fist, each column brought back in to its place.
    const middle = Math.floor(this.rows / 2) * this.columns;
    for (let c = 1; c < this.columns; c++) {
      if (held.has(middle + c)) continue;
      const ax = x[middle + c - 1], ay = y[middle + c - 1], bx = x[middle + c], by = y[middle + c];
      const d = Math.hypot(ax - bx, ay - by);
      if (d <= this.spacing) continue;
      const k = (d - this.spacing) / d;
      const sx = (ax - bx) * k, sy = (ay - by) * k;
      for (let r = 0; r < this.rows; r++) {
        const i = r * this.columns + c;
        if (held.has(i)) continue;
        x[i] += sx; y[i] += sy;
      }
    }
    this.collide();
  }

  /**
   * Each strip's best fit of its shape at rest — about its middle, turned by
   * whatever angle lines its points up best — and every point pulled toward
   * where the strips it's in would have it.
   */
  reshape() {
    const { x, y, held } = this;
    const gx = new Float64Array(this.count), gy = new Float64Array(this.count);
    for (const strip of this.strips) {
      let mx = 0, my = 0, rx = 0, ry = 0, mass = 0;
      strip.members.forEach((i, j) => {
        const m = held.has(i) ? GRIP : 1;
        mx += x[i] * m; my += y[i] * m;
        rx += strip.sx[j] * m; ry += strip.sy[j] * m;
        mass += m;
      });
      mx /= mass; my /= mass; rx /= mass; ry /= mass;
      let along = 0, across = 0;
      strip.members.forEach((i, j) => {
        const m = held.has(i) ? GRIP : 1;
        const px = x[i] - mx, py = y[i] - my, qx = strip.sx[j] - rx, qy = strip.sy[j] - ry;
        along += m * (qx * px + qy * py);
        across += m * (qx * py - qy * px);
      });
      const size = Math.hypot(along, across);
      const c = size > 0 ? along / size : 1, s = size > 0 ? across / size : 0;
      strip.members.forEach((i, j) => {
        const qx = strip.sx[j] - rx, qy = strip.sy[j] - ry;
        gx[i] += mx + c * qx - s * qy;
        gy[i] += my + s * qx + c * qy;
      });
    }
    for (let i = 0; i < this.count; i++) {
      if (held.has(i)) continue;
      x[i] += (gx[i] / this.shares[i] - x[i]) * this.stiffness;
      y[i] += (gy[i] / this.shares[i] - y[i]) * this.stiffness;
    }
  }

  /** The floor stops it dead, scrubbing off most of its slide; the screen's sides keep it on screen. */
  collide() {
    const { x, y, ox, oy, held } = this;
    const [lo, hi] = this.walls;
    for (let i = 0; i < this.count; i++) {
      if (held.has(i)) continue;
      if (y[i] < this.floor) {
        const speed = (oy[i] - y[i]) / STEP;
        if (speed > 60) this.landings.push({ at: { x: x[i], y: this.floor }, speed });
        y[i] = this.floor;
        oy[i] = this.floor;
        ox[i] = x[i] - (x[i] - ox[i]) * 0.5;
      }
      if (x[i] < lo || x[i] > hi) {
        x[i] = Math.min(Math.max(x[i], lo), hi);
        ox[i] = x[i];
      }
    }
  }
}
