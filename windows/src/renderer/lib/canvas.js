// Small helpers over CanvasRenderingContext2D, so the drawing code ported
// from SwiftUI's GraphicsContext reads much as it did. Every helper sets the
// state it needs: canvas state otherwise leaks from one call to the next.

/** A colour from 0…1 channels, as SwiftUI's Color(red:green:blue:).opacity(a). */
export const rgba = (r, g, b, a = 1) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
export const gray = (w, a = 1) => rgba(w, w, w, a);
export const BLACK = (a = 1) => rgba(0, 0, 0, a);
export const WHITE = (a = 1) => rgba(1, 1, 1, a);

/** A copy of a colour at another opacity: colours are kept as [r, g, b] 0…1. */
export const tone = (c, a = 1) => rgba(c[0], c[1], c[2], a);

export function stroke(ctx, path, style, width, cap = "butt", join = "miter") {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = join;
  ctx.stroke(path);
}

export function fill(ctx, path, style) {
  ctx.fillStyle = style;
  ctx.fill(path);
}

export function ellipse(x, y, w, h) {
  const p = new Path2D();
  p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
  return p;
}

export const circle = (c, r) => ellipse(c.x - r, c.y - r, 2 * r, 2 * r);

/** An open line through the points. */
export function polyline(points, path = new Path2D()) {
  if (!points.length) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);
  return path;
}

/** A closed outline through the points. */
export function polygon(points, path = new Path2D()) {
  polyline(points, path);
  if (points.length) path.closePath();
  return path;
}

export function rectPath(r) {
  const p = new Path2D();
  p.rect(r.x, r.y, r.width, r.height);
  return p;
}

export function roundRect(r, radius) {
  const p = new Path2D();
  p.roundRect(r.x, r.y, r.width, r.height, Math.max(0, Math.min(radius, Math.abs(r.width) / 2, Math.abs(r.height) / 2)));
  return p;
}

/** Strokes `path` shifted by (dx, dy), as SwiftUI's path.offsetBy. */
export function strokeShifted(ctx, path, dx, dy, style, width, cap, join) {
  ctx.save();
  ctx.translate(dx, dy);
  stroke(ctx, path, style, width, cap, join);
  ctx.restore();
}

export function fillShifted(ctx, path, dx, dy, style) {
  ctx.save();
  ctx.translate(dx, dy);
  fill(ctx, path, style);
  ctx.restore();
}

/** A radial gradient from `stops`: [[offset 0…1, css colour], …]. */
export function radial(ctx, centre, r0, r1, stops) {
  const g = ctx.createRadialGradient(centre.x, centre.y, r0, centre.x, centre.y, Math.max(r1, 0.001));
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  return g;
}

/** Colours spread evenly, as SwiftUI's Gradient(colors:). */
export function evenly(colours) {
  return colours.map((c, i) => [colours.length > 1 ? i / (colours.length - 1) : 0, c]);
}

export function linear(ctx, from, to, stops) {
  const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  return g;
}

/** Fills everything in sight, as SwiftUI's fill of the whole canvas. */
export function fillAll(ctx, style, size) {
  ctx.fillStyle = style;
  ctx.fillRect(-50, -50, size.width + 100, size.height + 100);
}
