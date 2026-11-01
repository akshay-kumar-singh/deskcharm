import { add, clamp, maxX, mul, sub, unit } from "../lib/geometry.js";

// The window the double-click powers go for, as in the Mac app's WebTarget.
// It comes from the main process: {id, frame (in overlay points), hide(),
// standIn()}, where hide() minimises it and answers whether it has gone.

/**
 * Where a line sent from `h` should land: the title bar, at the point nearest
 * `h` but kept to its middle half so the window hangs from somewhere near its
 * centre. With nothing to aim at, a shot toward the middle of the screen that
 * comes back empty. `area` is the overlay's size.
 */
export function aimAt(target, h, area) {
  let p;
  if (target) {
    const f = target.frame;
    p = { x: Math.min(Math.max(h.x, f.x + f.width * 0.25), maxX(f) - f.width * 0.25), y: f.y + Math.min(18, f.height * 0.1) };
  } else {
    p = add(h, mul(unit(sub({ x: area.width / 2, y: area.height * 0.6 }, h)), 280));
  }
  return { x: clamp(p.x, 8, area.width - 8), y: clamp(p.y, 8, area.height - 8) };
}
