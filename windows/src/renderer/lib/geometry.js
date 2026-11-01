// Points, vectors and rectangles as plain objects: {x, y} and
// {x, y, width, height}, y down, in screen points (CSS pixels).

export const point = (x, y) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (v, s) => ({ x: v.x * s, y: v.y * s });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const length = v => Math.hypot(v.x, v.y);

export function unit(v) {
  const l = Math.hypot(v.x, v.y);
  return l > 0.0001 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 1 };
}

export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp = (x, lo = 0, hi = 1) => Math.min(Math.max(x, lo), hi);

/** A point `s` of the way along a quadratic curve from a to b, bent toward c. */
export function quad(a, c, b, s) {
  const r = 1 - s;
  return { x: r * r * a.x + 2 * r * s * c.x + s * s * b.x, y: r * r * a.y + 2 * r * s * c.y + s * s * b.y };
}

export function easeOutCubic(x) {
  const r = 1 - clamp(x);
  return 1 - r * r * r;
}

/** Overshoots slightly before settling, which reads as impact. */
export function easeOutBack(x) {
  x = clamp(x);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

export function easeInOut(x) {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function smoothstep(x) {
  x = clamp(x);
  return x * x * (3 - 2 * x);
}

/** IEEE remainder, as Swift's remainder(): a less the nearest multiple of b. */
export const remainder = (a, b) => a - b * Math.round(a / b);

// Rectangles.
export const rect = (x, y, width, height) => ({ x, y, width, height });
export const maxX = r => r.x + r.width;
export const maxY = r => r.y + r.height;
export const midX = r => r.x + r.width / 2;
export const midY = r => r.y + r.height / 2;
export const offset = (r, dx, dy) => ({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });
export const inset = (r, dx, dy) => ({ x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy });
export const contains = (r, p) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
export const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
