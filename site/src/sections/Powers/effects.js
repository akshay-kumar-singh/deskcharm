import { easeIn, easeInOut, easeOut, lerp, span } from "../../lib/math.js";
import { bolt, cracks, forked, sagLine, spray } from "./geometry.js";
import { createPainter } from "./paint.js";

// Lightning flashes hard, dips, flares again, then is gone.
const flash = dt => dt < 0 ? 0 : dt < 0.06 ? 1 : dt < 0.11 ? 0.35 : dt < 0.18 ? 0.9 : Math.max(0, 0.9 - (dt - 0.18) * 3.5);

// Every power's two moves, drawn on a W × H stage through g. Each runs
// init(s) once, then frame(t, s) every frame until dur. fly and setWin move
// the window (see stage.js).
export function createEffects({ g, W, H, fly, setWin }) {
  const { bat, drawBolt, drawCracks, glow, tint, strand, tongue, drops, popText } = createPainter(g, W, H);

  return {
    spider: {
      dbl: { dur: 1.7,
        frame(t, s) {
          const shoot = easeOut(span(t, 0, 0.28)), pull = easeIn(span(t, 0.42, 1.25));
          const map = fly(s, pull, { r: pull * 0.5 });
          const end = map(s.G);
          if (t < 1.25) {
            const tip = { x: lerp(s.C.x, end.x, shoot), y: lerp(s.C.y, end.y, shoot) };
            strand(sagLine(s.C, tip, 18 * (1 - shoot) + 4 * (1 - pull)), "rgba(255,255,255,0.96)", 1.8);
            if (shoot >= 1) {
              const k = 12 * (1 - pull * 0.8);
              for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; strand([[end.x, end.y], [end.x + Math.cos(a) * k, end.y + Math.sin(a) * k]], "#fff", 1.2); }
            }
          }
          const pf = span(t, 1.22, 1.7);
          if (pf > 0 && pf < 1) { g.strokeStyle = `rgba(255,255,255,${1 - pf})`; g.lineWidth = 2; g.beginPath(); g.arc(s.C.x, s.C.y, 8 + pf * 34, 0, Math.PI * 2); g.stroke(); }
        } },
      shake: { dur: 4.2,
        init(s) {
          const r = s.r; s.O = { x: W * (0.42 + r() * 0.12), y: H * (0.45 + r() * 0.1) };
          s.spokes = Array.from({ length: 16 }, (_, i) => (i + (r() - 0.5) * 0.5) / 16 * Math.PI * 2);
          s.maxR = Math.hypot(W, H) * 0.62;
        },
        frame(t, s) {
          const R = easeOut(span(t, 0.65, 1.25)) * s.maxR;
          g.save(); g.globalAlpha = 1 - span(t, 3.6, 4.2);
          const dir = a => [Math.cos(a), Math.sin(a)];
          for (const a of s.spokes) { const [c, n] = dir(a); strand([[s.O.x, s.O.y], [s.O.x + c * R, s.O.y + n * R]], "rgba(255,255,255,0.92)", 1.3); }
          for (let rr = 18; rr < R; rr += 24 + rr * 0.08) {
            const pts = [];
            s.spokes.forEach((a, i) => {
              const b = s.spokes[(i + 1) % 16] + (i === 15 ? Math.PI * 2 : 0), [c1, n1] = dir(a);
              if (!i) pts.push([s.O.x + c1 * rr, s.O.y + n1 * rr]);
              const [c2, n2] = dir(b);
              for (let k = 1; k <= 4; k++) {
                const u = k / 4, sag = 1 - 0.12 * Math.sin(u * Math.PI);
                const x = lerp(c1, c2, u), y = lerp(n1, n2, u), L = Math.hypot(x, y);
                pts.push([s.O.x + x / L * rr * sag, s.O.y + y / L * rr * sag]);
              }
            });
            strand(pts, "rgba(255,255,255,0.85)", 1.1);
          }
          g.restore();
          tint("rgba(255,255,255,A)", 0.8 * (1 - span(t, 0.6, 0.95)) * (t > 0.6 ? 1 : 0));
        } },
    },
    bat: {
      dbl: { dur: 2.4,
        init(s) { s.bats = Array.from({ length: 14 }, (_, i) => ({ d: i * 0.045, a0: s.r() * Math.PI * 2, f: 24 + s.r() * 10 })); },
        frame(t, s) {
          const pour = easeIn(span(t, 1.0, 1.75));
          const map = fly(s, pour, { sx: lerp(1, 0.02, pour ** 0.6), sy: lerp(1, 0.04, pour) });
          const G = map(s.G), wc = map(s.wc);
          const shoot = easeOut(span(t, 0.12, 0.45));
          if (t > 0.12 && t < 1.78) {
            const tip = { x: lerp(s.C.x, G.x, shoot), y: lerp(s.C.y, G.y, shoot) };
            strand([[s.C.x, s.C.y], [tip.x, tip.y]], "#9aa0a8", 2.6);
            const a = Math.atan2(tip.y - s.C.y, tip.x - s.C.x);
            g.save(); g.translate(tip.x, tip.y); g.rotate(a); g.fillStyle = "#2a2d33";
            g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -6); g.lineTo(-1, 0); g.lineTo(-4, 6); g.closePath(); g.fill(); g.restore();
          }
          const rx = s.B.w * 0.55 * lerp(1, 0.1, pour) + 16, ry = rx * 0.32;
          const ring = th => ({ x: wc.x + Math.cos(th) * rx, y: wc.y + Math.sin(th) * ry });
          for (const b of s.bats) {
            const tau = t - b.d; if (tau < 0 || tau > 2.05) continue;
            let p, sc = 9;
            if (tau < 0.55) { const q = ring(b.a0); const u = easeInOut(tau / 0.55); p = { x: lerp(s.C.x, q.x, u), y: lerp(s.C.y, q.y, u) - Math.sin(u * Math.PI) * 30 }; }
            else if (tau < 1.78) p = ring(b.a0 + (tau - 0.55) * 6);
            else { const q = ring(b.a0 + 1.23 * 6), u = easeIn((tau - 1.78) / 0.27); p = { x: lerp(q.x, s.C.x, u), y: lerp(q.y, s.C.y, u) }; sc *= 1 - u * 0.8; }
            bat(p.x, p.y, sc, Math.sin(tau * b.f));
          }
          glow(s.C.x, s.C.y, 60, "rgba(255,226,140,A)", 1 - span(t, 1.75, 2.15) - (t < 1.75 ? 1 : 0));
        } },
      shake: { dur: 4.0,
        init(s) {
          const r = s.r, n = Math.round(W * H / 2600);
          s.bats = Array.from({ length: n }, () => {
            const y0 = H + 20 + r() * H * 0.9, v = (y0 + 40) / (2.2 + r() * 1.0);
            return { x: r() * W, y0, v, sz: 8 + r() * 14, f: 22 + r() * 14, ph: r() * 9 };
          });
        },
        frame(t, s) {
          const tt = t - 0.5; if (tt < 0) return;
          for (const b of s.bats) {
            const y = b.y0 - tt * b.v; if (y < -30 || y > H + 30) continue;
            bat(b.x + Math.sin(tt * 3 + b.ph) * 14, y, b.sz, Math.sin(tt * b.f + b.ph), Math.sin(tt * 2 + b.ph) * 0.2, "rgba(18,17,24,0.92)");
          }
        } },
    },
    hulk: {
      dbl: { dur: 3.0,
        init(s) {
          const r = s.r, fy = H * 0.86, lift = { cx: W * 0.5, cy: H * 0.36, s: 0.72, sy: 0.92, r: 0 };
          const slam = side => ({ cx: W * (side < 0 ? 0.3 : 0.66), cy: fy - s.B.h * 0.72 * 0.4 / 2, s: 0.72, sy: 0.4, r: side * 0.22 });
          s.keys = [[0, { cx: s.wc.x, cy: s.wc.y, s: 1, sy: 1, r: 0 }], [0.35, { ...lift, cy: s.wc.y - H * 0.08, s: 0.9, r: -0.08 }]];
          s.impacts = [];
          [0.75, 1.15, 1.55, 1.95].forEach((ti, i) => {
            const side = i % 2 ? 1 : -1;
            if (i) s.keys.push([ti - 0.2, lift, easeOut]);
            s.keys.push([ti, slam(side), easeIn]);
            const x = W * (side < 0 ? 0.3 : 0.66);
            s.impacts.push({ t: ti, x, y: fy, cr: cracks(r, x, fy, 6, 70 + r() * 40, Math.PI * 1.05, Math.PI * 1.95), dust: spray(r, x, fy, 18, 140, 4, 0.8, 80) });
          });
          s.keys.push([2.2, { cx: W * 0.42, cy: H * 0.5, s: 0.6, sy: 0.9, r: -0.4 }, easeOut]);
          s.keys.push([2.55, { cx: s.C.x, cy: s.C.y, s: 0.03, sy: 1, r: 1.6 }, easeIn]);
        },
        frame(t, s) {
          tint("rgba(80,170,60,A)", 0.28 * (1 - span(t, 0, 0.45)));
          let pose = s.keys[s.keys.length - 1][1];
          for (let i = 1; i < s.keys.length; i++) {
            const [t1, b, e] = s.keys[i], [t0, a] = s.keys[i - 1];
            if (t <= t1) { const u = (e || easeInOut)(span(t, t0, t1)), o = {}; for (const k in b) o[k] = lerp(a[k], b[k], u); pose = o; break; }
          }
          setWin({ x: pose.cx - s.wc.x, y: pose.cy - s.wc.y, r: pose.r, sx: pose.s, sy: pose.s * pose.sy, o: t > 2.53 ? 0 : 1 });
          for (const im of s.impacts) {
            const dt = t - im.t; if (dt < 0) continue;
            drawCracks(im.cr, Math.min(1, dt / 0.12), `rgba(30,24,18,${0.85 * (1 - span(t, 2.6, 3.0))})`);
            drops(im.dust, im.t, t, "rgba(120,110,95,0.8)", 300);
            if (dt < 0.3) s.shake(10 * (1 - dt / 0.3));
          }
          popText("SMASH!", W * 0.5, H * 0.22, span(t, 0.75, 1.75), "#7ed957");
          glow(s.C.x, s.C.y, 70, "rgba(120,230,90,A)", t > 2.55 ? 1 - span(t, 2.55, 2.95) : 0);
        } },
      shake: { dur: 4.0,
        init(s) {
          const r = s.r;
          s.hits = [[0.25, 0.4], [0.52, 0.27], [0.5, 0.72]].map(([fx, fy], i) => {
            const x = W * fx, y = H * fy, R = Math.min(W, H) * (0.07 + r() * 0.02);
            const rim = Array.from({ length: 13 }, (_, k) => { const a = k / 13 * Math.PI * 2, q = R * (0.75 + r() * 0.45); return [x + Math.cos(a) * q, y + Math.sin(a) * q]; });
            const chunks = Array.from({ length: 12 }, () => { const a = r() * Math.PI * 2, v = 120 + r() * 220; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, s: 3 + r() * 5, rot: r() * 6, vr: (r() - 0.5) * 14 }; });
            return { t: 0.6 + i * 0.32, x, y, R, rim, cr: cracks(r, x, y, 8, Math.max(W, H) * 0.32), chunks, dust: spray(r, x, y, 20, 90, 6, 1.1, 30) };
          });
        },
        frame(t, s) {
          const fall = span(t, 3.0, 3.8);
          for (const h of s.hits) {
            const dt = t - h.t; if (dt < 0) continue;
            if (dt < 0.35) s.shake(14 * (1 - dt / 0.35));
            g.save(); g.globalAlpha = 1 - fall; g.translate(0, fall * fall * 120);
            drawCracks(h.cr, easeOut(Math.min(1, dt / 0.3)), "rgba(28,22,18,0.8)");
            const path = () => { g.beginPath(); h.rim.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
            g.save(); g.translate(h.x, h.y); g.scale(1.45, 1.45); g.translate(-h.x, -h.y); path(); g.fillStyle = "rgba(196,186,170,0.6)"; g.fill(); g.restore();
            path(); const gr = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.R * 1.2);
            gr.addColorStop(0, "#1b1714"); gr.addColorStop(0.7, "#4a433b"); gr.addColorStop(1, "#7a7063");
            g.fillStyle = gr; g.fill(); g.lineWidth = 3; g.strokeStyle = "#cfc4b3"; g.stroke();
            g.restore();
            g.fillStyle = "#6f6558";
            for (const c of h.chunks) {
              if (dt > 1.4) break;
              g.save(); g.translate(c.x + c.vx * dt, c.y + c.vy * dt + 700 * dt * dt / 2); g.rotate(c.rot + c.vr * dt);
              g.fillRect(-c.s / 2, -c.s / 2, c.s, c.s * 0.7); g.restore();
            }
            drops(h.dust, h.t, t, "rgba(205,195,180,0.7)", 40);
          }
        } },
    },
    thor: {
      dbl: { dur: 2.5,
        init(s) { s.strike = forked(s.r, s.G.x + (s.r() - 0.5) * W * 0.2, 0, s.G.x, s.G.y); },
        frame(t, s) {
          const dark = span(t, 0, 0.3) * (1 - span(t, 2.0, 2.5));
          tint("rgba(10,14,40,A)", 0.5 * dark);
          drawBolt(s.strike, flash(t - 0.35), 2.8);
          tint("rgba(220,230,255,A)", 0.3 * flash(t - 0.35));
          const shud = t > 0.38 && t < 1.0 ? 1 : 0;
          const pull = easeIn(span(t, 1.0, 1.9));
          const map = fly(s, pull, { jx: shud * (Math.random() - 0.5) * 6, jy: shud * (Math.random() - 0.5) * 4 });
          if (t > 0.38 && t < 1.9) {
            const tl = map({ x: s.B.x, y: s.B.y }), br = map({ x: s.B.x + s.B.w, y: s.B.y + s.B.h });
            const edge = () => { const k = Math.random() * 4 | 0, u = Math.random(); return k === 0 ? [lerp(tl.x, br.x, u), tl.y] : k === 1 ? [br.x, lerp(tl.y, br.y, u)] : k === 2 ? [lerp(tl.x, br.x, u), br.y] : [tl.x, lerp(tl.y, br.y, u)]; };
            for (let i = 0; i < 3; i++) { const [ax, ay] = edge(), a = Math.random() * 6.28, L = 14 + Math.random() * 22; drawBolt([bolt(Math.random, ax, ay, ax + Math.cos(a) * L, ay + Math.sin(a) * L, 0.4)], 0.9, 1.2); }
          }
          if (t > 1.0 && t < 1.9) { const e = map(s.G); drawBolt([bolt(Math.random, s.C.x, s.C.y, e.x, e.y, 0.18)], 0.95, 2); }
          glow(s.C.x, s.C.y, 80, "rgba(150,190,255,A)", t > 1.9 ? 1 - span(t, 1.9, 2.3) : 0);
        } },
      shake: { dur: 4.4,
        init(s) {
          const r = s.r;
          s.rain = Array.from({ length: Math.round(W * H / 1500) }, () => ({ x: r() * W, y: r() * H, v: 700 + r() * 300, l: 10 + r() * 10 }));
          s.bolts = [0.9, 1.55, 2.15, 2.8].map(tt => { const x = r() * W; return { t: tt, b: forked(r, x, 0, x + (r() - 0.5) * W * 0.3, H * (0.55 + r() * 0.4)) }; });
          s.last = { t: 3.45, b: forked(r, s.C.x + (r() - 0.5) * 80, 0, s.C.x, s.C.y) };
        },
        frame(t, s) {
          const sky = span(t, 0.35, 0.8) * (1 - span(t, 3.8, 4.4));
          tint("rgba(8,12,30,A)", 0.62 * sky);
          g.save(); g.strokeStyle = `rgba(200,215,255,${0.5 * sky})`; g.lineWidth = 1; g.beginPath();
          for (const d of s.rain) {
            const y = (d.y + t * d.v) % (H + 40) - 20, x = (d.x + (t * d.v) * 0.22) % (W + 40) - 20;
            g.moveTo(x, y); g.lineTo(x + d.l * 0.22, y + d.l);
          }
          g.stroke(); g.restore();
          let f = 0;
          for (const b of [...s.bolts, s.last]) { const a = flash(t - b.t); drawBolt(b.b, a * sky, 2.4); f = Math.max(f, a); }
          tint("rgba(225,232,255,A)", 0.3 * f * sky);
          if (t >= s.last.t && !s.jolted) { s.jolted = 1; s.wobble(); }
        } },
    },
    venom: {
      dbl: { dur: 2.2,
        init(s) { s.splash = spray(s.r, s.G.x, s.G.y, 12, 120, 2.6, 0.5); s.goo = spray(s.r, s.C.x, s.C.y, 16, 160, 3.2, 0.7, 60); },
        frame(t, s) {
          const shoot = easeOut(span(t, 0, 0.32)), reel = easeIn(span(t, 0.55, 1.6));
          const wob = 1 + 0.1 * Math.sin(t * 34) * (1 - reel) * (reel > 0 ? 1 : 0);
          const map = fly(s, reel, { sx: lerp(1, 0.03, reel) * wob, sy: lerp(1, 0.03, reel) / wob });
          const E = map(s.G);
          if (t < 1.62) {
            const tip = { x: lerp(s.C.x, E.x, shoot), y: lerp(s.C.y, E.y, shoot) };
            const amp = t < 0.35 ? 16 : t < 0.55 ? 3 * Math.sin(t * 60) : 4;
            tongue(s.C, tip, amp, t);
          }
          drops(s.splash, 0.32, t, "rgba(235,240,230,0.9)", 400);
          drops(s.goo, 1.6, t, "rgba(14,14,18,0.95)", 700);
        } },
      shake: { dur: 4.6,
        init(s) {
          const r = s.r;
          s.tend = Array.from({ length: 13 }, (_, i) => {
            const a = lerp(-0.25, Math.PI + 0.25, (i + r() * 0.6) / 13);
            const dx = Math.cos(a), dy = Math.sin(a);
            const toEdge = Math.min(dx > 0 ? (W - s.C.x) / dx : dx < 0 ? -s.C.x / dx : 1e9, dy > 0 ? (H - s.C.y) / dy : 1e9);
            return { a, L: Math.min(toEdge, Math.hypot(W, H)) * (0.75 + r() * 0.3), w: 11 + r() * 8, ph: r() * 6, d: r() * 0.35, bend: (r() - 0.5) * 0.5 };
          });
        },
        frame(t, s) {
          const back = easeIn(span(t, 3.5, 4.4));
          const centre = (k, u, reach) => {
            const L = k.L * reach, a = k.a + k.bend * u;
            const nx = -Math.sin(a), ny = Math.cos(a);
            const off = Math.sin(u * 7 - t * 6 + k.ph) * 12 * u + Math.sin(u * Math.PI * 1.3 + k.ph) * L * 0.12;
            return [s.C.x + Math.cos(a) * L * u + nx * off, s.C.y + Math.sin(a) * L * u + ny * off];
          };
          const reachOf = k => easeOut(span(t, 0.5 + k.d, 2.4 + k.d)) * (1 - back);
          // Goo strung between neighbours.
          g.strokeStyle = "rgba(12,12,16,0.85)"; g.lineWidth = 2;
          for (let i = 0; i < s.tend.length - 1; i++) {
            const a = s.tend[i], b = s.tend[i + 1], ra = reachOf(a), rb = reachOf(b);
            if (ra < 0.35 || rb < 0.35) continue;
            const [x1, y1] = centre(a, 0.3, ra), [x2, y2] = centre(b, 0.32, rb);
            if (Math.hypot(x2 - x1, y2 - y1) > 90) continue;
            g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 26, x2, y2); g.stroke();
          }
          for (const k of s.tend) {
            const reach = reachOf(k); if (reach < 0.02) continue;
            const n = 28, left = [], right = [], mid = [];
            const pulse = (t * 0.7 + k.ph) % 1;
            for (let i = 0; i <= n; i++) {
              const u = i / n, [x, y] = centre(k, u, reach), [x2, y2] = centre(k, Math.min(1, u + 0.01), reach);
              const L = Math.hypot(x2 - x, y2 - y) || 1, nx = -(y2 - y) / L, ny = (x2 - x) / L;
              const w = k.w * lerp(1, 0.6, u) * (1 + 0.3 * Math.exp(-((u - pulse) ** 2) / 0.004)) / 2;
              left.push([x + nx * w, y + ny * w]); right.push([x - nx * w, y - ny * w]); mid.push([x + nx * w * 0.45, y + ny * w * 0.45]);
            }
            g.beginPath(); [...left, ...right.reverse()].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
            g.fillStyle = "#0b0b10"; g.fill();
            const [hx, hy] = centre(k, 1, reach);
            g.beginPath(); g.ellipse(hx, hy, k.w * 0.75, k.w * 0.62, k.a, 0, Math.PI * 2); g.fill();
            g.beginPath(); mid.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
            g.strokeStyle = "rgba(170,180,220,0.28)"; g.lineWidth = 1.6; g.stroke();
            g.beginPath(); g.ellipse(hx - 2, hy - 3, k.w * 0.22, k.w * 0.12, k.a, 0, Math.PI * 2); g.fillStyle = "rgba(220,225,255,0.5)"; g.fill();
          }
          const pool = span(t, 0.35, 0.8) * (1 - span(t, 4.1, 4.6));
          if (pool > 0) { g.beginPath(); g.ellipse(s.C.x, s.C.y + 6, 34 * pool, 24 * pool, 0, 0, Math.PI * 2); g.fillStyle = "#0b0b10"; g.fill(); }
        } },
    },
  };
}
