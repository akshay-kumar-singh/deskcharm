import { BLACK, ellipse, polyline, rgba, stroke } from "../lib/canvas.js";

// Drawing the chain and the charm, as CharmView.render in the Mac app's main.swift.

const GOLD = ["rgb(252,224,158)", "rgb(217,168,74)", "rgb(250,217,143)"];
const LINK = rgba(0.93, 0.78, 0.45, 0.9);
const HOOK = rgba(0.78, 0.60, 0.26);
// The charm's drop shadow, as the Mac app's: black at 34%, a blur of 11, 7pt down.
const SHADOW = { alpha: 0.34, blur: 11, drop: 7 };

/** How far past the art its shadow can reach, in points: its drop and the blur's spread. */
export const SHADOW_REACH = SHADOW.drop + SHADOW.blur * 1.5;

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
  const { body, shadow, pad } = spritesFor(image, art, dpr);
  for (const g of ghosts) {
    ctx.save();
    ctx.globalAlpha = g.opacity;
    ctx.translate(g.tip.x, g.tip.y);
    ctx.rotate(g.angle + hang.tilt);
    ctx.drawImage(body, art.x, art.y, art.width, art.height);
    ctx.restore();
  }
  // The shadow falls straight down, whichever way the charm is turned.
  ctx.save();
  ctx.translate(tip.x, tip.y + SHADOW.drop);
  ctx.rotate(turn + hang.tilt);
  ctx.drawImage(shadow, art.x - pad, art.y - pad, art.width + 2 * pad, art.height + 2 * pad);
  ctx.restore();
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(turn + hang.tilt);
  ctx.drawImage(body, art.x, art.y, art.width, art.height);
  ctx.restore();
}

// The charm is drawn from two pictures made once for each art, size and
// screen density, and kept: the art scaled to the size it's drawn at, and its
// shadow already blurred. Drawn straight from the full-size art with a canvas
// shadow, both were done again on every frame, most of what a frame cost.
const sprites = new WeakMap();

function spritesFor(image, art, dpr) {
  const key = `${art.width}x${art.height}@${dpr}`;
  const kept = sprites.get(image);
  if (kept?.key === key) return kept;
  const w = Math.max(1, Math.round(art.width * dpr)), h = Math.max(1, Math.round(art.height * dpr));
  const body = new OffscreenCanvas(w, h), b = body.getContext("2d");
  b.imageSmoothingQuality = "high";
  b.drawImage(image, 0, 0, w, h);

  // The art's outline in translucent black, blurred as a canvas shadow is:
  // a Gaussian whose deviation is half the shadow's blur.
  const sigma = (SHADOW.blur / 2) * dpr, pad = Math.ceil(sigma * 3);
  const outline = new OffscreenCanvas(w, h), o = outline.getContext("2d");
  o.drawImage(body, 0, 0);
  o.globalCompositeOperation = "source-in";
  o.fillStyle = BLACK(SHADOW.alpha);
  o.fillRect(0, 0, w, h);
  const shadow = new OffscreenCanvas(w + 2 * pad, h + 2 * pad), s = shadow.getContext("2d");
  s.filter = `blur(${sigma}px)`;
  s.drawImage(outline, pad, pad);

  const made = { key, body, shadow, pad: pad / dpr };
  sprites.set(image, made);
  return made;
}
