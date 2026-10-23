import { CHARMS, charmImage, dims } from "../../data/charms.js";
import { reduceMotion } from "../../lib/motion.js";

// The hero's charm on a real chain, drawn on a canvas over the desk. A small
// version of the app's rope solver: Verlet integration with distance
// constraints at a fixed 240 Hz, the top link pinned under the menu bar, the
// charm 3.5x a link.
export function createChain(desk, cv, charm) {
  const g = cv.getContext("2d");
  const N = 12, MASS = 3.5, GRAVITY = 1400, DAMP = 0.9995, DT = 1 / 240, ITER = 20;
  let W = 0, H = 0, dpr = 1, seg = 10, S = 120, anchor = { x: 0, y: 0 }, pts = [], cur = charm;
  const listening = new AbortController(), on = { signal: listening.signal };
  CHARMS.forEach(charmImage); // so a newly picked charm can be drawn at once

  function layout() {
    const r = desk.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    anchor = { x: W * 0.68, y: 26 };
    seg = H * 0.2 / N;
    S = Math.min(W, H) * 0.34;
    if (!pts.length) {
      const a = reduceMotion ? 0 : -0.75;
      for (let i = 0; i <= N; i++) {
        const x = anchor.x + Math.sin(a) * seg * i, y = anchor.y + Math.cos(a) * seg * i;
        pts.push({ x, y, px: x, py: y, m: i === N ? MASS : 1 });
      }
    }
    pts[0].x = pts[0].px = anchor.x; pts[0].y = pts[0].py = anchor.y;
  }

  // The art's frame is pinned at the chain's tip and turned with the chain.
  function turn() { const c = pts[N], p = pts[N - 3]; return Math.atan2(c.y - p.y, c.x - p.x) - Math.PI / 2 + cur.tilt; }
  function hit(x, y) {
    const c = pts[N], a = -turn(), [w, h] = dims(cur, S);
    const dx = x - c.x, dy = y - c.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    return lx > -cur.attach[0] * w - 8 && lx < (1 - cur.attach[0]) * w + 8 && ly > -cur.attach[1] * h - 8 && ly < (1 - cur.attach[1]) * h + 8;
  }

  let drag = null;
  const at = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener("pointerdown", e => { const p = at(e); if (hit(p.x, p.y)) { drag = p; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; e.preventDefault(); } }, on);
  cv.addEventListener("pointermove", e => { const p = at(e); if (drag) drag = p; else cv.style.cursor = hit(p.x, p.y) ? "grab" : "default"; }, on);
  const release = () => { if (drag) cv.style.cursor = "grab"; drag = null; };
  cv.addEventListener("pointerup", release, on); cv.addEventListener("pointercancel", release, on);
  cv.style.touchAction = "pan-y";

  function step() {
    for (let i = 1; i <= N; i++) {
      const p = pts[i], vx = (p.x - p.px) * DAMP, vy = (p.y - p.py) * DAMP;
      p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + GRAVITY * DT * DT;
    }
    // A soft pull toward the pointer, not a pin: the lag is what loads a throw.
    if (drag) { const c = pts[N]; c.x += (drag.x - c.x) * 0.05; c.y += (drag.y - c.y) * 0.05; }
    for (let k = 0; k < ITER; k++) for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
      const wa = i === 0 ? 0 : 1 / a.m, wb = 1 / b.m, s = (d - seg) / d / (wa + wb);
      a.x += dx * s * wa; a.y += dy * s * wa; b.x -= dx * s * wb; b.y -= dy * s * wb;
    }
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.lineWidth = 1.8;
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1];
      g.save(); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2); g.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      g.beginPath(); g.ellipse(0, 0, seg * 0.62, i % 2 ? 1.2 : seg * 0.3, 0, 0, Math.PI * 2);
      g.strokeStyle = i % 2 ? "#a8823a" : "#ecc66d"; g.stroke(); g.restore();
    }
    const c = pts[N], [w, h] = dims(cur, S), img = charmImage(cur);
    g.save(); g.translate(c.x, c.y); g.rotate(turn());
    g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 16; g.shadowOffsetY = 10;
    if (img.complete) g.drawImage(img, -cur.attach[0] * w, -cur.attach[1] * h - 1, w, h);
    g.restore();
  }

  let last = performance.now(), acc = 0, visible = true, raf = 0;
  const seen = new IntersectionObserver(([e]) => visible = e.isIntersecting);
  seen.observe(desk);
  function frame(t) {
    acc += Math.min(0.05, (t - last) / 1000); last = t;
    if (visible) { while (acc >= DT) { step(); acc -= DT; } draw(); } else acc = 0;
    raf = requestAnimationFrame(frame);
  }
  addEventListener("resize", layout, on);
  layout(); raf = requestAnimationFrame(frame);

  return {
    setCharm(c) {
      cur = c;
      pts[N].px -= 7; // a nudge so the new charm arrives swinging
    },
    destroy() {
      cancelAnimationFrame(raf);
      seen.disconnect();
      listening.abort();
    },
  };
}
