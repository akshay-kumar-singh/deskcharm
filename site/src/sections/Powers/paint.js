import { easeOut, lerp } from "../../lib/math.js";

// Drawing helpers for the effects, on a W × H canvas through g.
export function createPainter(g, W, H) {
  function bat(x, y, s, flap, rot = 0, col = "#15141b") {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s * (0.45 + 0.55 * Math.abs(flap)));
    g.beginPath();
    for (const side of [1, -1]) {
      g.moveTo(0, -0.1); g.lineTo(0.09 * side, -0.32); g.lineTo(0.15 * side, -0.12);
      g.quadraticCurveTo(0.5 * side, -0.32, 1 * side, -0.42); g.quadraticCurveTo(0.86 * side, -0.05, 0.78 * side, 0.12);
      g.quadraticCurveTo(0.62 * side, -0.02, 0.5 * side, 0.18); g.quadraticCurveTo(0.34 * side, 0.02, 0.18 * side, 0.32);
      g.lineTo(0, 0.42); g.closePath();
    }
    g.fillStyle = col; g.fill(); g.restore();
  }
  function drawBolt(b, a, w = 2.2) {
    if (a <= 0) return;
    g.save(); g.lineJoin = g.lineCap = "round";
    b.forEach((pts, k) => {
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      const lw = k ? w * 0.55 : w;
      g.strokeStyle = `rgba(150,180,255,${a * 0.45})`; g.lineWidth = lw * 5; g.stroke();
      g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = lw; g.stroke();
    });
    g.restore();
  }
  function drawCracks(list, p, col) {
    g.save(); g.lineJoin = g.lineCap = "round"; g.strokeStyle = col;
    for (const c of list) {
      const n = Math.max(2, Math.ceil(c.pts.length * p));
      g.beginPath(); for (let i = 0; i < n && i < c.pts.length; i++) i ? g.lineTo(...c.pts[i]) : g.moveTo(...c.pts[i]);
      g.lineWidth = c.w; g.stroke();
    }
    g.restore();
  }
  function glow(x, y, rad, col, a) {
    if (a <= 0) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.35, col.replace("A", a * 0.8)); gr.addColorStop(1, col.replace("A", 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  function tint(col, a) { if (a > 0) { g.fillStyle = col.replace("A", a); g.fillRect(0, 0, W, H); } }
  // A strand drawn twice so it reads on both light and dark wallpaper.
  function strand(pts, col, w) {
    g.save(); g.lineCap = "round"; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = w + 1.6; g.stroke();
    g.strokeStyle = col; g.lineWidth = w; g.stroke(); g.restore();
  }
  function tongue(M, E, amp, t, w0 = 9) {
    const n = 26, L = Math.hypot(E.x - M.x, E.y - M.y) || 1, nx = -(E.y - M.y) / L, ny = (E.x - M.x) / L;
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, off = Math.sin(u * Math.PI * 2.4 - t * 16) * amp * Math.sin(u * Math.PI);
      const x = lerp(M.x, E.x, u) + nx * off, y = lerp(M.y, E.y, u) + ny * off, w = lerp(w0, w0 * 0.55, u);
      left.push([x + nx * w / 2, y + ny * w / 2]); right.push([x - nx * w / 2, y - ny * w / 2]);
    }
    g.beginPath(); [...left, ...right.reverse()].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    const gr = g.createLinearGradient(M.x, M.y, E.x, E.y); gr.addColorStop(0, "#7d1a33"); gr.addColorStop(1, "#d2506b");
    g.fillStyle = gr; g.fill(); g.strokeStyle = "rgba(40,0,12,0.55)"; g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.ellipse(E.x, E.y, w0 * 0.6, w0 * 0.5, 0, 0, Math.PI * 2); g.fillStyle = "#d2506b"; g.fill();
  }
  function drops(list, t0, t, col, grav = 600) {
    const dt = t - t0; if (dt < 0) return;
    g.fillStyle = col;
    for (const d of list) {
      const a = 1 - dt / d.life; if (a <= 0) continue;
      g.globalAlpha = a; g.beginPath(); g.arc(d.x + d.vx * dt, d.y + d.vy * dt + grav * dt * dt / 2, d.r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  function popText(text, x, y, p, col) {
    if (p <= 0 || p >= 1) return;
    const sc = p < 0.2 ? easeOut(p / 0.2) * 1.15 : 1.15 - (p - 0.2) * 0.2, a = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
    g.save(); g.translate(x, y); g.rotate(-0.12); g.scale(sc, sc); g.globalAlpha = a;
    g.font = `italic 800 ${Math.round(W * 0.075)}px "Inter Tight", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 7; g.strokeStyle = "#15120c"; g.lineJoin = "round"; g.strokeText(text, 0, 0);
    g.fillStyle = col; g.fillText(text, 0, 0); g.restore();
  }

  return { bat, drawBolt, drawCracks, glow, tint, strand, tongue, drops, popText };
}
