// Tells manhandling from dragging, as in the Mac app's Shake.swift. Pointer
// travel fills a bucket that drains at a steady rate, so only hard, sustained
// throwing about fills it: a long slow drag or a single fling drains about as
// fast as it fills.

export class ShakeMeter {
  constructor() {
    this.capacity = 2400;
    this.drain = 700;           // points per second
    this.level = 0;
    this.last = null;
  }

  /** Feeds one pointer sample (time in seconds). True when the bucket overflows, after which it starts again from empty. */
  drag(p, time) {
    const l = this.last;
    this.last = { at: p, time };
    if (!l) return false;
    const dt = Math.max(0, time - l.time);
    this.level = Math.max(0, this.level - this.drain * dt) + Math.hypot(p.x - l.at.x, p.y - l.at.y);
    if (this.level < this.capacity) return false;
    this.level = 0;
    return true;
  }

  release() {
    this.level = 0;
    this.last = null;
  }
}
