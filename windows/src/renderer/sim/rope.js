// Rope simulation, as in the Mac app's RopeSim.swift.
//
// Position-based dynamics: Verlet integration plus distance constraints solved
// iteratively. Constraints are weighted by inverse mass, which is what lets a
// heavy charm hang off a light chain without the chain stretching.

export class RopeSim {
  constructor() {
    /** Each node's position and where it was a step ago: {p: {x, y}, old: {x, y}}. */
    this.nodes = [];
    this.anchor = { x: 0, y: 0 };
    this.segLen = 16;
    this.invMass = [];

    // Tuned for how a desk toy should read, not for literal physical scale.
    // Over a 240pt chain this gives a period near 2.6s — about a playground
    // swing — and a decay that stays visible for roughly twenty seconds.
    this.gravity = 1400;
    this.damping = 0.9995;
    this.iterations = 24;
    this.charmMass = 3.5;
    this.breeze = 1;

    // Resistance to folding. Distance constraints alone let the chain buckle
    // back on itself the moment it goes slack, which reads as the charm
    // jerking rather than swinging. Real links cannot hinge that sharply.
    this.bendStiffness = 0.25;
    this.straightness = 0.96;

    this.grabbed = false;
    this.grabTarget = { x: 0, y: 0 };
    this.grabOffset = { x: 0, y: 0 };
    // How hard the charm chases the pointer. Deliberately a soft pull rather
    // than a hard pin: the lag is what gives a release its throw velocity.
    this.grabFollow = 0.06;

    this.tipAngle = 0;
    this.angleFollow = 0.12;

    this.lastTime = null;
    this.accumulator = 0;
    this.clock = 0;
    this.fixedStep = 1 / 240;
  }

  reset(anchor, count, segLen) {
    this.anchor = { x: anchor.x, y: anchor.y };
    this.segLen = segLen;
    this.nodes = [];
    for (let i = 0; i < count; i++) {
      const p = { x: anchor.x, y: anchor.y + i * segLen };
      this.nodes.push({ p, old: { x: p.x, y: p.y } });
    }
    // Node 0 is pinned to the ceiling; the last node carries the charm.
    this.invMass = this.nodes.map((_, i) => (i === 0 ? 0 : i === count - 1 ? 1 / this.charmMass : 1));
    this.tipAngle = 0;
    this.grabbed = false;
  }

  /**
   * Driven from the display clock, in seconds, stepped at a fixed rate so the
   * constraint solver stays stable regardless of frame timing.
   */
  advance(now) {
    if (this.lastTime === null) { this.lastTime = now; return; }
    let dt = now - this.lastTime;
    this.lastTime = now;
    // Clamp after a stall so the rope doesn't explode, and refuse negative
    // steps outright — a backwards clock must not unwind the simulation.
    dt = Math.max(0, Math.min(dt, 0.05));
    this.accumulator += dt;
    let guardCount = 0;
    while (this.accumulator >= this.fixedStep && guardCount < 32) {
      this.step(this.fixedStep);
      this.accumulator -= this.fixedStep;
      guardCount++;
    }
  }

  step(dt) {
    const nodes = this.nodes;
    if (nodes.length <= 1) return;
    this.clock += dt;
    const dt2 = dt * dt;
    const last = nodes.length - 1;

    // Two detuned sines read as air movement rather than a loop.
    const wind = (Math.sin(this.clock * 0.53) * 0.6 + Math.sin(this.clock * 0.17) * 0.4) * 55 * this.breeze;

    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      const vx = (n.p.x - n.old.x) * this.damping, vy = (n.p.y - n.old.y) * this.damping;
      n.old.x = n.p.x;
      n.old.y = n.p.y;
      // Gravity is an acceleration, so every node gets the same amount.
      // The charm's weight belongs in the constraint solve, not here.
      n.p.x += vx + wind * dt2;
      n.p.y += vy + this.gravity * dt2;
    }

    // Dragging pulls the charm toward the pointer rather than pinning it,
    // so momentum accumulates in the Verlet state and survives release.
    if (this.grabbed) {
      const n = nodes[last];
      n.p.x += (this.grabTarget.x - n.p.x) * this.grabFollow;
      n.p.y += (this.grabTarget.y - n.p.y) * this.grabFollow;
    }

    const inv = this.invMass;
    const bendTarget = 2 * this.segLen * this.straightness;
    for (let k = 0; k < this.iterations; k++) {
      nodes[0].p.x = this.anchor.x; nodes[0].p.y = this.anchor.y;
      nodes[0].old.x = this.anchor.x; nodes[0].old.y = this.anchor.y;
      for (let i = 0; i < last; i++) {
        const a = nodes[i].p, b = nodes[i + 1].p;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d <= 0.0001) continue;
        const w1 = inv[i], w2 = inv[i + 1], wsum = w1 + w2;
        if (wsum <= 0) continue;
        const corr = (d - this.segLen) / d;
        const dx = (b.x - a.x) * corr, dy = (b.y - a.y) * corr;
        a.x += dx * (w1 / wsum); a.y += dy * (w1 / wsum);
        b.x -= dx * (w2 / wsum); b.y -= dy * (w2 / wsum);
      }

      // One-sided bending constraint: pushes apart links two steps apart
      // only when they fold inward, so the chain still hangs and curves
      // naturally but cannot kink.
      for (let i = 0; i < last - 1; i++) {
        const a = nodes[i].p, b = nodes[i + 2].p;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d <= 0.0001 || d >= bendTarget) continue;
        const w1 = inv[i], w2 = inv[i + 2], wsum = w1 + w2;
        if (wsum <= 0) continue;
        const corr = (d - bendTarget) / d * this.bendStiffness;
        const dx = (b.x - a.x) * corr, dy = (b.y - a.y) * corr;
        a.x += dx * (w1 / wsum); a.y += dy * (w1 / wsum);
        b.x -= dx * (w2 / wsum); b.y -= dy * (w2 / wsum);
      }
    }

    this.updateAngle();
  }

  // Measured across several links rather than the last one alone: a single
  // ~11pt segment is too short to give a steady reading and the charm jitters.
  // The follow term then adds a little rotational lag, like a real pendant.
  updateAngle() {
    const last = this.nodes.length - 1;
    const base = Math.max(0, last - 3);
    if (base >= last) return;
    const a = this.nodes[base].p, b = this.nodes[last].p;
    const raw = Math.atan2(b.x - a.x, b.y - a.y);
    let delta = raw - this.tipAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    this.tipAngle += delta * this.angleFollow;
  }

  get tip() {
    const n = this.nodes[this.nodes.length - 1];
    return n ? { x: n.p.x, y: n.p.y } : { x: this.anchor.x, y: this.anchor.y };
  }

  /**
   * The turn that lines the charm's artwork up with the chain when drawn in
   * y-down screen space. tipAngle runs from straight down toward +x, and on
   * a y-down screen that is a counter-clockwise turn, hence the sign.
   */
  get charmRotation() { return -this.tipAngle; }

  /** How fast the chain is moving: its fastest node over the last step, in points a second. */
  get speed() {
    let fastest = 0;
    for (const n of this.nodes) fastest = Math.max(fastest, Math.hypot(n.p.x - n.old.x, n.p.y - n.old.y));
    return fastest / this.fixedStep;
  }

  grab(p) {
    if (!this.grabbed) {
      this.grabbed = true;
      // Keep hold of the charm where it was actually picked up, so a click
      // never snaps its attach point to the pointer.
      const tip = this.tip;
      this.grabOffset = { x: tip.x - p.x, y: tip.y - p.y };
    }
    this.grabTarget = { x: p.x + this.grabOffset.x, y: p.y + this.grabOffset.y };
  }

  /**
   * Pulls the chain aside and lets go from rest, rotated rigidly about the
   * anchor: displacing nodes sideways at constant height would stretch the
   * chain and the solver would snap it back, injecting enormous energy.
   */
  kick(angle) {
    for (let i = 1; i < this.nodes.length; i++) {
      const d = i * this.segLen;
      const p = { x: this.anchor.x + Math.sin(angle) * d, y: this.anchor.y + Math.cos(angle) * d };
      this.nodes[i].p = p;
      this.nodes[i].old = { x: p.x, y: p.y };        // released from rest
    }
  }

  /**
   * Shoves the charm at `v` points per second. The push tapers toward the
   * ceiling so the chain swings from its anchor rather than translating
   * rigidly, and the constraint solve strips whatever part of it runs along
   * the chain, leaving only the part that can actually swing it.
   */
  impulse(v) {
    const n = this.nodes.length;
    if (n <= 1) return;
    const last = n - 1;
    for (let i = 1; i < n; i++) {
      // Verlet keeps velocity implicitly, as p - old per substep.
      const k = i / last * this.fixedStep;
      this.nodes[i].old.x -= v.x * k;
      this.nodes[i].old.y -= v.y * k;
    }
  }

  release() { this.grabbed = false; }
}
