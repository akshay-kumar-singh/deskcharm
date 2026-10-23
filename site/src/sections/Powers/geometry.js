import { lerp } from "../../lib/math.js";

// Shapes for the effects to draw, worked out once from a seeded random r.

// A bolt cut by midpoint displacement: split each segment, knock its middle
// sideways, repeat six times.
export function bolt(r, ax, ay, bx, by, rough = 0.22) {
  let pts = [[ax, ay], [bx, by]], d = Math.hypot(bx - ax, by - ay) * rough;
  for (let k = 0; k < 6; k++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], L = Math.hypot(x2 - x1, y2 - y1) || 1, o = (r() - 0.5) * d;
      next.push(pts[i], [(x1 + x2) / 2 - (y2 - y1) / L * o, (y1 + y2) / 2 + (x2 - x1) / L * o]);
    }
    next.push(pts[pts.length - 1]); pts = next; d *= 0.55;
  }
  return pts;
}

// A bolt with two forks off its middle.
export function forked(r, ax, ay, bx, by) {
  const main = bolt(r, ax, ay, bx, by), out = [main];
  for (let f = 0; f < 2; f++) {
    const [x, y] = main[Math.floor(main.length * (0.3 + r() * 0.4))];
    const a = Math.atan2(by - ay, bx - ax) + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5), L = Math.hypot(bx - ax, by - ay) * (0.2 + r() * 0.25);
    out.push(bolt(r, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L));
  }
  return out;
}

// n cracks running out from x, y between angles a0 and a1, forking now and then.
export function cracks(r, x, y, n, len, a0 = 0, a1 = Math.PI * 2) {
  const out = [];
  const grow = (x, y, a, len, w, depth) => {
    const pts = [[x, y]]; let d = 0;
    while (d < len) {
      const st = 7 + r() * 9; a += (r() - 0.5) * (r() < 0.2 ? 0.9 : 0.25);
      x += Math.cos(a) * st; y += Math.sin(a) * st; d += st; pts.push([x, y]);
      if (depth < 2 && r() < 0.1) grow(x, y, a + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5), (len - d) * 0.6, w * 0.6, depth + 1);
    }
    out.push({ pts, w });
  };
  for (let i = 0; i < n; i++) grow(x, y, a0 + (a1 - a0) * (i + r() * 0.7) / n, len * (0.6 + r() * 0.5), 2.2, 0);
  return out;
}

// A line from a to b that sags in the middle.
export function sagLine(a, b, sag, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) { const u = i / n; out.push([lerp(a.x, b.x, u), lerp(a.y, b.y, u) + Math.sin(u * Math.PI) * sag]); }
  return out;
}

// n particles thrown out from x, y, for drops() to draw.
export const spray = (r, x, y, n, sp, size, life = 0.6, up = 0) => Array.from({ length: n }, () => {
  const a = r() * Math.PI * 2, v = sp * (0.4 + r() * 0.8);
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, r: size * (0.5 + r()), life: life * (0.6 + r() * 0.6) };
});
