import { lerp, rng } from "../../lib/math.js";
import { createEffects } from "./effects.js";

// Plays the powers on the demo desktop. Effects draw on the canvas over it,
// and the window, the screen (for shakes) and the toast are moved by setting
// their styles directly, once a frame. freezeAt holds every effect at that
// many seconds in, for checking.
export function createStage({ stage, screen, canvas: cv, win, slot, toast, power, freezeAt = null }) {
  const g = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1, run = null, restoreTimer = 0;

  function size() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
  }
  addEventListener("resize", size); size();

  function setWin(o = {}) {
    win.style.transform = `translate(${o.x || 0}px,${o.y || 0}px) rotate(${o.r || 0}rad) scale(${o.sx ?? o.s ?? 1},${o.sy ?? o.s ?? 1})`;
    win.style.opacity = o.o ?? 1;
  }
  function charmPoint() {
    const a = slot.querySelector("img").getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: a.left + a.width / 2 - s.left, y: a.top + a.height / 2 - s.top };
  }
  // Moves the window toward the charm: p 0..1, scale shrinking to nothing.
  // Returns where a point on the window has got to.
  function fly(s, p, o = {}) {
    const dx = (s.C.x - s.wc.x) * p, dy = (s.C.y - s.wc.y) * p;
    const sx = o.sx ?? lerp(1, 0.03, p), sy = o.sy ?? sx;
    setWin({ x: dx + (o.jx || 0), y: dy + (o.jy || 0), sx, sy, r: o.r || 0, o: p > 0.98 ? 0 : 1 });
    return pt => ({ x: s.wc.x + dx + (pt.x - s.wc.x) * sx + (o.jx || 0), y: s.wc.y + dy + (pt.y - s.wc.y) * sy + (o.jy || 0) });
  }

  function reset() {
    clearTimeout(restoreTimer); toast.classList.remove("on");
    win.style.transition = "none"; setWin(); screen.style.transform = "";
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  }
  function stop() {
    if (run) cancelAnimationFrame(run.raf);
    run = null; reset();
  }
  function wobble() {
    const h = slot.querySelector(".hanger"); if (!h) return;
    h.classList.remove("wobble"); void h.offsetWidth; h.classList.add("wobble");
  }
  function play(kind) {
    if (run) cancelAnimationFrame(run.raf);
    reset();
    const fx = createEffects({ g, W, H, fly, setWin })[power][kind];
    const B = { x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight };
    const s = { B, wc: { x: B.x + B.w / 2, y: B.y + B.h / 2 }, G: { x: B.x + B.w / 2, y: B.y + 13 }, C: charmPoint(), r: rng(1 + (Math.random() * 1e6 | 0)), wobble, shake: 0 };
    s.shake = m => { s.sh = Math.max(s.sh || 0, m); };
    fx.init?.(s);
    if (kind === "shake") wobble();
    const t0 = performance.now();
    const loop = now => {
      const t = freezeAt ?? (now - t0) / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      s.sh = 0;
      fx.frame(Math.min(t, fx.dur), s);
      screen.style.transform = s.sh ? `translate(${(Math.random() - 0.5) * s.sh}px,${(Math.random() - 0.5) * s.sh}px)` : "";
      if (t < fx.dur || freezeAt != null) run.raf = requestAnimationFrame(loop);
      else finish(kind);
    };
    run = { raf: requestAnimationFrame(loop) };
  }
  // A double-click hides the window's app, so it stays gone a moment, then
  // fades back for the next go.
  function finish(kind) {
    run = null; g.clearRect(0, 0, W, H); screen.style.transform = "";
    if (kind === "dbl") {
      toast.classList.add("on");
      restoreTimer = setTimeout(() => {
        toast.classList.remove("on"); setWin({ o: 0 });
        requestAnimationFrame(() => { win.style.transition = "opacity 0.45s ease"; win.style.opacity = 1; });
      }, 1500);
    } else reset();
  }

  return {
    // Switches to another power, stopping whatever is playing.
    select(p) { power = p; stop(); },
    play,
    running: () => run != null,
    destroy() { stop(); removeEventListener("resize", size); },
  };
}
