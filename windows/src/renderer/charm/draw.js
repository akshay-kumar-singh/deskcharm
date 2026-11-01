import { BLACK, ellipse, polyline, rgba, stroke } from "../lib/canvas.js";

// Drawing the chain and the charm, as CharmView.render in the Mac app's main.swift.

const GOLD = ["rgb(252,224,158)", "rgb(217,168,74)", "rgb(250,217,143)"];
const LINK = rgba(0.93, 0.78, 0.45, 0.9);
const HOOK = rgba(0.78, 0.60, 0.26);

/** The chain from its hook to the charm, as metal: a shadowed underlay, a gold core and its links. */
export function drawChain(ctx, sim) {
  const pts = sim.nodes.map(n => n.p);
  if (pts.length < 2) return;
  const chain = polyline(pts);
  // Dark underlay reads as the shadowed side of the links.
  stroke(ctx, chain, BLACK(0.28), 5, "round", "round");
  const tip = pts[pts.length - 1];
  const gold = ctx.createLinearGradient(pts[0].x, pts[0].y, tip.x, tip.y);
  GOLD.forEach((c, i) => gold.addColorStop(i / 2, c));
  stroke(ctx, chain, gold, 3.4, "round", "round");
  // Individual links, so the chain reads as metal rather than a cord.
  const links = new Path2D();
  pts.forEach((p, i) => {
    if (i % 2 !== 0 || i === 0) return;
    links.addPath(ellipse(p.x - 2.6, p.y - 1.9, 5.2, 3.8));
  });
  stroke(ctx, links, LINK, 1.1);
  // Ceiling hook.
  stroke(ctx, ellipse(sim.anchor.x - 5, sim.anchor.y - 3, 10, 10), HOOK, 2.6);
}

/**
 * The charm's art, pinned at the chain's tip and turned with it. `art` is its
 * frame about the tip before turning; `ghosts`, Spider-Man's afterimages.
 */
export function drawCharm(ctx, image, art, hang, tip, turn, ghosts, dpr) {
  for (const g of ghosts) {
    ctx.save();
    ctx.globalAlpha = g.opacity;
    ctx.translate(g.tip.x, g.tip.y);
    ctx.rotate(g.angle + hang.tilt);
    ctx.drawImage(image, art.x, art.y, art.width, art.height);
    ctx.restore();
  }
  ctx.save();
  // Canvas shadows aren't scaled with the drawing, so they're given in device pixels.
  ctx.shadowColor = BLACK(0.34);
  ctx.shadowBlur = 11 * dpr;
  ctx.shadowOffsetY = 7 * dpr;
  ctx.translate(tip.x, tip.y);
  ctx.rotate(turn + hang.tilt);
  ctx.drawImage(image, art.x, art.y, art.width, art.height);
  ctx.restore();
}
