// Telling a double-click from a drag, and the afterimages behind a fast
// Spider-Man, as in the Mac app's main.swift (ClickTracker, Trail).

/** How long apart two clicks can be and still make a double-click: Windows' own default. */
const DOUBLE_CLICK = 0.5;

/**
 * Clicks are recognised on release: a press that barely moved is a click, and
 * two close together in time and place are a double-click.
 */
export class ClickTracker {
  constructor() { this.last = null; }

  /** `moved` is how far the press travelled; times in seconds. True for a double-click. */
  release(moved, time, at) {
    if (moved >= 5) { this.last = null; return false; }
    const l = this.last;
    if (l && time - l.time < DOUBLE_CLICK && Math.hypot(at.x - l.at.x, at.y - l.at.y) < 10) {
      this.last = null;
      return true;
    }
    this.last = { time, at };
    return false;
  }
}

/**
 * Recent charm poses, replayed faintly behind Spider-Man as afterimages when
 * he moves fast enough to smear, and not at all while he just sways.
 */
export class Trail {
  constructor() {
    this.poses = [];
    this.lags = [0.16, 0.12, 0.08, 0.04];           // oldest first, drawn underneath
    this.strength = [0.08, 0.15, 0.25, 0.38];
  }

  record(tip, angle, now) {
    this.poses.push({ time: now, tip, angle });
    while (this.poses.length && now - this.poses[0].time > 0.25) this.poses.shift();
  }

  /** Faded by age, and all together by how fast he is moving now: nothing below a brisk swing, full strength by a hard throw. */
  ghosts() {
    const now = this.poses[this.poses.length - 1];
    const before = now && this.pose(now.time - 0.05);
    if (!now || !before) return [];
    const speed = Math.hypot(now.tip.x - before.tip.x, now.tip.y - before.tip.y) / 0.05;
    const s = Math.min(Math.max((speed - 220) / 600, 0), 1);
    if (s <= 0) return [];
    const out = [];
    this.lags.forEach((lag, i) => {
      const p = this.pose(now.time - lag);
      if (p) out.push({ tip: p.tip, angle: p.angle, opacity: this.strength[i] * s });
    });
    return out;
  }

  pose(time) {
    for (let i = this.poses.length - 1; i >= 0; i--) if (this.poses[i].time <= time) return this.poses[i];
    return null;
  }
}
