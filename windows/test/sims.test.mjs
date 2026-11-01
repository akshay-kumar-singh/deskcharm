// The Mac app's headless physics checks (Tests/main.swift), run against the
// JavaScript ports: same scenarios, same thresholds. Seeds differ (the RNG
// isn't the same), so the random plans are other storms and swarms, held to
// the same standards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RopeSim } from "../src/renderer/sim/rope.js";
import { ShakeMeter } from "../src/renderer/sim/shake.js";
import { Swarm } from "../src/renderer/sim/swarm.js";
import { Pour } from "../src/renderer/sim/pour.js";
import { CrackWeb, polygonContains } from "../src/renderer/sim/cracks.js";
import { Crater } from "../src/renderer/sim/rubble.js";
import { Cloth } from "../src/renderer/sim/cloth.js";
import { Symbiote, STEP, MAX_TENDRILS, STRAND_REACH } from "../src/renderer/sim/symbiote.js";
import { Storm, LINGER, flash } from "../src/renderer/sim/storm.js";
import { opaqueBounds, attachPoint } from "../src/renderer/maker/stickerShape.js";
import { seeded } from "../src/renderer/lib/random.js";

const hz = 240;
const anchor = { x: 280, y: 4 };
const ropeLen = 240, segs = 22;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let clock = 0;

function makeSim(breeze = 0) {
  const s = new RopeSim();
  s.breeze = breeze;
  s.reset(anchor, segs + 1, ropeLen / segs);
  return s;
}
function settle(sim, seconds) {
  sim.advance(clock);
  for (let i = 0; i < Math.trunc(seconds * hz); i++) { clock += 1 / hz; sim.advance(clock); }
}
/** Moves the pointer over time the way a hand would, rather than teleporting it. */
function drag(sim, a, b, seconds) {
  sim.grab(a);
  const steps = Math.trunc(seconds * hz);
  for (let k = 0; k < steps; k++) {
    const f = (k + 1) / steps;
    sim.grab({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    clock += 1 / hz;
    sim.advance(clock);
  }
}
function run(sim, seconds, each) {
  for (let i = 0; i < Math.trunc(seconds * hz); i++) { clock += 1 / hz; sim.advance(clock); each?.(); }
}

test("rope: hangs still, straight and unstretched", () => {
  const a = makeSim();
  settle(a, 12);
  assert.ok(Math.abs(a.tip.x - anchor.x) < 1, "hangs vertical at rest");
  assert.ok(Math.abs(dist(a.tip, anchor) - ropeLen) / ropeLen * 100 < 2, "chain does not stretch under the charm");
  let worst = 0;
  for (let i = 0; i < a.nodes.length - 1; i++) worst = Math.max(worst, Math.abs(dist(a.nodes[i].p, a.nodes[i + 1].p) - a.segLen));
  assert.ok(worst < 0.5, `segment lengths hold (worst ${worst})`);
  assert.ok(Math.abs(a.tipAngle) < 0.02, "hangs upright at rest");
});

test("rope: a click does not teleport the charm", () => {
  const b = makeSim();
  settle(b, 6);
  const rest = b.tip;
  b.grab({ x: rest.x + 30, y: rest.y + 90 });
  settle(b, 0.25);
  assert.ok(dist(b.tip, rest) < 2, `moved ${dist(b.tip, rest)}`);
});

test("rope: release carries momentum and swings through", () => {
  const c = makeSim();
  settle(c, 6);
  drag(c, c.tip, { x: anchor.x + 150, y: anchor.y + 190 }, 0.45);
  const releaseX = c.tip.x;
  c.release();
  let travelled = 0, crossed = false;
  run(c, 2.5, () => {
    travelled = Math.max(travelled, Math.abs(c.tip.x - releaseX));
    if (c.tip.x < anchor.x - 20) crossed = true;
  });
  assert.ok(travelled > 60, `moved ${travelled} after release`);
  assert.ok(crossed, "swings through and past centre");
});

test("rope: graceful period, gradual decay, eventual rest", () => {
  const d = makeSim();
  settle(d, 6);
  drag(d, d.tip, { x: anchor.x + 160, y: anchor.y + 180 }, 0.5);
  d.release();
  const crossings = [];
  let prev = d.tip.x - anchor.x > 0, elapsed = 0;
  run(d, 12, () => {
    elapsed += 1 / hz;
    const side = d.tip.x - anchor.x > 0;
    if (side !== prev) { crossings.push(elapsed); prev = side; }
  });
  const gaps = crossings.slice(1).map((c, i) => c - crossings[i]);
  const period = gaps.reduce((s, g) => s + g, 0) / gaps.length * 2;
  assert.ok(period > 1.8 && period < 3.6, `period ${period}`);

  const e = makeSim();
  settle(e, 6);
  drag(e, e.tip, { x: anchor.x + 160, y: anchor.y + 180 }, 0.5);
  e.release();
  const amplitude = seconds => { let peak = 0; run(e, seconds, () => { peak = Math.max(peak, Math.abs(e.tip.x - anchor.x)); }); return peak; };
  const early = amplitude(3), later = amplitude(3);
  const retained = later / Math.max(early, 0.001);
  assert.ok(retained > 0.45 && retained < 0.96, `kept ${retained}`);
  assert.ok(later > 20, `still swinging visibly after 6s: ${later}`);
  settle(e, 60);
  assert.ok(Math.abs(e.tip.x - anchor.x) < 3, "comes to rest eventually");
});

test("rope: tilts into the swing and hangs in line with the chain", () => {
  const f = makeSim();
  settle(f, 6);
  drag(f, f.tip, { x: anchor.x + 170, y: anchor.y + 150 }, 0.5);
  assert.ok(f.tipAngle > 0.1, `tilts into the swing: ${f.tipAngle}`);

  const q = makeSim();
  settle(q, 6);
  q.kick(0.6);
  settle(q, 0.15);
  let worstKink = 0;
  run(q, 2, () => {
    const base = q.nodes[q.nodes.length - 4].p;
    const along = Math.atan2(q.tip.x - base.x, q.tip.y - base.y);
    const r = q.charmRotation;
    const down = { x: -Math.sin(r), y: Math.cos(r) };           // (0, 1) turned by r
    worstKink = Math.max(worstKink, Math.abs(Math.atan2(down.x, down.y) - along));
  });
  assert.ok(worstKink < 0.3, `worst ${worstKink} rad off the chain`);
});

test("rope: stays taut, steady period, recovers from slack", () => {
  const h = makeSim();
  settle(h, 6);
  h.kick(0.7);
  let minLen = Infinity, side = h.tip.x - anchor.x > 0, elapsed = 0, lastCross = 0;
  const halves = [];
  run(h, 10, () => {
    elapsed += 1 / hz;
    minLen = Math.min(minLen, dist(h.tip, anchor));
    const s = h.tip.x - anchor.x > 0;
    if (s !== side) { if (lastCross > 0) halves.push(elapsed - lastCross); lastCross = elapsed; side = s; }
  });
  assert.ok(minLen > ropeLen * 0.9, `shortest ${minLen}`);
  const m = halves.reduce((s, x) => s + x, 0) / halves.length;
  const spread = Math.sqrt(halves.reduce((s, x) => s + (x - m) ** 2, 0) / halves.length) / m;
  assert.ok(halves.length >= 4 && spread < 0.06, `spread ${spread} over ${halves.length}`);

  const k = makeSim();
  settle(k, 6);
  drag(k, k.tip, { x: anchor.x + 20, y: anchor.y + 70 }, 0.5);
  k.release();
  settle(k, 5);
  assert.ok(Math.abs(dist(k.tip, anchor) - ropeLen) < 8, "recovers from slack without kinking");
});

test("rope: an impulse swings it without stretching it", () => {
  const m = makeSim();
  settle(m, 6);
  m.impulse({ x: 300, y: -200 });
  let reach = 0, longest = 0;
  run(m, 1.5, () => { reach = Math.max(reach, m.tip.x - anchor.x); longest = Math.max(longest, dist(m.tip, anchor)); });
  assert.ok(reach > 40, `reached ${reach}`);
  assert.ok(longest < ropeLen * 1.02, `longest ${longest}`);
});

test("rope: survives a 9s stall", () => {
  const g = makeSim(1);
  g.advance(clock);
  clock += 9;
  g.advance(clock);
  assert.ok(Number.isFinite(g.tip.x) && Number.isFinite(g.tip.y) && dist(g.tip, anchor) < ropeLen * 1.5);
});

test("shake: only manhandling sets it off", () => {
  const trigger = (seconds, path) => {
    const meter = new ShakeMeter();
    for (let i = 0; i <= Math.trunc(seconds * 120); i++) {
      const t = i / 120;
      if (meter.drag(path(t), t)) return t;
    }
    return null;
  };
  assert.equal(trigger(8, t => ({ x: 280 + 400 * Math.sin(t * 0.9), y: 300 })), null, "a slow drag never sets it off");
  assert.equal(trigger(1, t => ({ x: 280 + Math.min(t, 0.25) * 4000, y: 300 })), null, "a single fling doesn't set it off");
  const shaking = trigger(4, t => ({ x: 280 + 150 * Math.sin(t * 2 * Math.PI * 3), y: 300 }));
  assert.ok(shaking !== null && shaking < 3, `hard shaking sets it off: ${shaking}`);
});

const screen = { width: 1512, height: 982 };

test("swarm: bottom to top, all but covering the screen, in a few seconds", () => {
  const batFill = 0.34, batAspect = 0.557;
  const swarm = new Swarm(screen, batFill, batAspect, seeded(7));
  let risesThrough = true, climbs = true;
  for (const b of swarm.bats) {
    const first = swarm.pose(b, b.start), gone = swarm.pose(b, swarm.duration + 0.01);
    risesThrough &&= first !== null && first.at.y > screen.height && gone === null;
    for (let t = b.start; t < swarm.duration; t += 0.05) {
      const p = swarm.pose(b, t);
      if (p) climbs &&= Math.abs(p.heading + Math.PI / 2) < Math.PI / 3;
    }
  }
  assert.ok(risesThrough, "every bat comes up from below and is gone over the top");
  assert.ok(climbs, "bats head upward the whole way");
  let peak = 0;
  for (let t = 0; t <= swarm.duration; t += 0.02) {
    let area = 0;
    for (const b of swarm.bats) {
      const p = swarm.pose(b, t);
      if (!p || p.at.x < 0 || p.at.x > screen.width || p.at.y < 0 || p.at.y > screen.height) continue;
      area += batFill * b.span * b.span * batAspect;
    }
    peak = Math.max(peak, area);
  }
  assert.ok(peak / (screen.width * screen.height) > 1.2, `peak cover ${peak / (screen.width * screen.height)}`);
  assert.ok(swarm.duration < 4, `duration ${swarm.duration}`);
});

test("pour: whole, then all in, near side first, never folding", () => {
  const from = { x: 200, y: 150, width: 800, height: 520 };
  const charm = { x: 1250, y: 520 };
  const pour = new Pour(from, charm, Pour.runsSideways(from, charm));
  const n = 48;
  const whole = Array.from({ length: n }, (_, j) => pour.strip(j, n, 0));
  assert.ok(whole.every(s => s.opacity === 1 && Math.abs(s.rect.y - from.y) < 0.01 && Math.abs(s.rect.y + s.rect.height - 670) < 0.01)
    && Math.abs(whole[0].rect.x - from.x) < 1 && Math.abs(whole[n - 1].rect.x + whole[n - 1].rect.width - 1000) < 1, "starts whole");
  const gone = Array.from({ length: n }, (_, j) => pour.strip(j, n, 1));
  assert.ok(gone.every(s => s.opacity < 0.01 && Math.abs(s.rect.x + s.rect.width / 2 - charm.x) < 1 && s.rect.height < 0.5), "ends in the charm");
  const half = Array.from({ length: n }, (_, j) => pour.strip(j, n, 0.55));
  assert.ok(half[n - 1].opacity < 0.01 && half[0].opacity === 1, "near side first");
  let folds = false;
  for (let step = 1; step < 40; step++) {
    const mids = Array.from({ length: n }, (_, j) => { const r = pour.strip(j, n, step / 40).rect; return r.x + r.width / 2; });
    folds ||= mids.some((m, i) => i > 0 && mids[i - 1] > m + 0.01);
  }
  assert.ok(!folds, "never folds over itself");
  assert.ok(dist(pour.point({ x: 600, y: 168 }, 1), charm) < 0.5, "the grip goes in with the window");
});

test("cracks: a web reaches every corner, no holes, rays never cross", () => {
  const blow = { x: 460, y: 410 };
  const corners = [{ x: 0, y: 0 }, { x: screen.width, y: 0 }, { x: 0, y: screen.height }, { x: screen.width, y: screen.height }];
  const web = new CrackWeb(blow, Math.max(...corners.map(c => dist(blow, c))), seeded(11));
  const pieces = web.shards;
  const clampIn = c => ({ x: Math.min(Math.max(c.x, 1), screen.width - 1), y: Math.min(Math.max(c.y, 1), screen.height - 1) });
  assert.ok(corners.map(clampIn).every(c => pieces.some(s => polygonContains(s, c))), "out to every corner");
  let holes = 0;
  for (let gx = 5; gx < screen.width; gx += 37) {
    for (let gy = 5; gy < screen.height; gy += 37) if (!pieces.some(s => polygonContains(s, { x: gx, y: gy }))) holes++;
  }
  assert.equal(holes, 0, "shards fit together with no holes");
  let cross = false;
  for (let k = 1; k < web.rays[0].length; k++) {
    const turns = web.rays.map(r => Math.atan2(r[k].y - blow.y, r[k].x - blow.x));
    let total = 0;
    turns.forEach((b, i) => { let d = turns[(i + 1) % turns.length] - b; while (d < 0) d += 2 * Math.PI; total += d; });
    cross ||= Math.abs(total - 2 * Math.PI) > 0.001;
  }
  assert.ok(!cross, "its cracks never cross");
});

test("rubble: a crater, cracks across the screen, debris falls clear", () => {
  const crater = new Crater({ x: 460, y: 220 }, 74, { x: 0, y: 0, ...screen }, seeded(21));
  assert.ok(polygonContains(crater.rim, crater.centre), "a crater round where it landed");
  const farthest = Math.max(...crater.cracks.flatMap(c => c.points).map(p => dist(p, crater.centre)));
  assert.ok(farthest > Math.hypot(screen.width, screen.height) * 0.4, `cracks run ${farthest}`);
  assert.ok(crater.cracks.length > 12, `${crater.cracks.length} cracks`);
  assert.ok([...crater.thrown, ...crater.crumbs].every(c => Crater.position(c, 1.3).y > screen.height), "everything falls clear");
});

test("cloth: held out like a mat, slams the floor, flies when thrown", () => {
  const sheet = () => { const c = new Cloth(14, 9, 340, 212, { x: 400, y: 700 }); c.floor = 100; return c; };
  const held = [3, 4, 5].map(r => r * 14);
  const grips = (at, toward = { x: 1, y: 0 }) => {
    const l = Math.hypot(toward.x, toward.y), d = { x: toward.x / l, y: toward.y / l }, down = { x: d.y, y: -d.x };
    return new Map(held.map((i, k) => [i, { x: at.x + down.x * (k - 1) * 26.5, y: at.y + down.y * (k - 1) * 26.5 }]));
  };
  const mat = sheet(), fist = { x: 400, y: 594 };
  mat.hold(grips(fist));
  for (let i = 0; i < 240; i++) mat.advance(1 / 60);
  assert.ok(held.every(i => dist(mat.point(i), grips(fist).get(i)) < 0.01), "stays in the fist");
  const tip = mat.point(4 * 14 + 13);
  assert.ok(tip.x > fist.x + 280 && tip.y < fist.y - 10, `holds out like a mat: ${tip.x - fist.x} out, ${fist.y - tip.y} down`);

  const centre = { x: 700, y: 450 }, swung = sheet(), overhead = { x: centre.x, y: centre.y + 120 };
  swung.place((col, row) => ({ x: overhead.x + (row - 4) * 26.5, y: overhead.y + col * 340 / 13 }));
  const middleLength = c => { let s = 0; for (let k = 0; k < 13; k++) s += dist(c.point(4 * 14 + k), c.point(4 * 14 + k + 1)); return s / 340; };
  const cross = (u, v) => u.x * v.y - u.y * v.x, minus = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const folded = c => Array.from({ length: 13 }, (_, col) => col).some(col => {
    const a0 = c.point(col), a1 = c.point(8 * 14 + col), b0 = c.point(col + 1), b1 = c.point(8 * 14 + col + 1);
    return cross(minus(a1, a0), minus(b0, a0)) * cross(minus(a1, a0), minus(b1, a0)) < 0
      && cross(minus(b1, b0), minus(a0, b0)) * cross(minus(b1, b0), minus(a1, b0)) < 0;
  });
  let through = false, everFolded = false, hardest = 0, longest = 0;
  for (let k = 0; k < 90; k++) {
    const u = Math.min(1, (k + 1) / 25);
    const a = Math.PI / 2 + (Math.PI * 1.22 - Math.PI / 2) * u ** 1.8;
    const hand = { x: centre.x + 120 * Math.cos(a), y: centre.y + 120 * Math.sin(a) };
    swung.hold(grips(hand, minus(hand, centre)));
    swung.advance(1 / 60);
    through ||= swung.points.some(p => p.y < swung.floor - 0.001);
    everFolded ||= folded(swung);
    longest = Math.max(longest, middleLength(swung));
    hardest = Math.max(hardest, ...swung.landings.map(l => l.speed), 0);
    swung.landings = [];
  }
  assert.ok(hardest > 900, `slams into the floor at ${hardest}`);
  assert.ok(!through, "never goes through it");
  assert.ok(longest < 1.01, `middle up to ${longest}`);
  assert.ok(!everFolded, "nor folds over itself");

  const thrown = sheet();
  thrown.hold(grips(fist));
  thrown.advance(1 / 60);
  const mean = c => { const ps = c.points; return ps.reduce((s, p) => ({ x: s.x + p.x / ps.length, y: s.y + p.y / ps.length }), { x: 0, y: 0 }); };
  const before = mean(thrown);
  thrown.release({ x: 1500, y: 300 });
  for (let i = 0; i < 6; i++) thrown.advance(1 / 60);
  const flown = mean(thrown).x - before.x;
  assert.ok(Math.abs(flown - 150) < 15, `flies off as thrown: ${flown} in 0.1 s`);
});

test("sticker: trimmed to what's opaque, hung from the top of its subject", () => {
  const mask = (w, h, inside) => { const a = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = inside(x, y) ? 255 : 0; return a; };
  const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const blob = mask(200, 160, disc(90, 100, 40));
  assert.deepEqual(opaqueBounds(blob, 200, 160), { x: 50, y: 60, width: 81, height: 81 });
  assert.equal(opaqueBounds(mask(40, 40, () => false), 40, 40), null);
  const hung = attachPoint(blob, 200, 160);
  assert.ok(Math.abs(hung.x * 200 - 90.5) < 1.5 && Math.abs(hung.y * 160 - 60) < 1.5, `at ${hung.x * 200}, ${hung.y * 160}`);
  const pair = mask(200, 160, (x, y) => disc(70, 80, 40)(x, y) || disc(130, 80, 40)(x, y));
  assert.ok(Math.abs(attachPoint(pair, 200, 160).y * 160 - 40) < 2, "from a crown, not down in a notch");
});

test("symbiote: pours out of the charm and crawls all over the screen", () => {
  const charmAt = { x: 1180, y: 330 };
  const s = new Symbiote(screen, charmAt, seeded(31));
  let crawls = true, onScreen = true, grownFrom = true;
  s.tendrils.forEach((t, k) => {
    for (let i = 1; i < t.points.length; i++) crawls &&= t.times[i] > t.times[i - 1] && dist(t.points[i], t.points[i - 1]) <= STEP + 0.01;
    onScreen &&= t.points.every(p => p.x >= -31 && p.x <= screen.width + 31 && p.y >= -31 && p.y <= screen.height + 31);
    if (!t.parent) { grownFrom &&= t.points[0] === charmAt; return; }
    const parent = s.tendrils[t.parent.tendril];
    grownFrom &&= t.parent.tendril < k && parent.points[t.parent.point] === t.points[0] && parent.times[t.parent.point] === t.times[0];
  });
  assert.ok(grownFrom, "pours out of the charm");
  assert.ok(crawls, "crawls, never jumps");
  assert.ok(onScreen, "stays on the screen");
  const thinnest = Math.min(...s.tendrils.flatMap(t => t.widths));
  assert.ok(s.tendrils.length <= MAX_TENDRILS && thinnest >= 4, `${s.tendrils.length} tendrils, thinnest ${thinnest}`);
  assert.ok(s.strands.length > 0 && s.strands.every(st => {
    const d = dist(s.tendrils[st.a.tendril].points[st.a.point], s.tendrils[st.b.tendril].points[st.b.point]);
    return st.a.tendril !== st.b.tendril && d >= STRAND_REACH[0] && d <= STRAND_REACH[1];
  }), "strings of goo join neighbouring tendrils");
  // How much of the screen one crawl reaches swings a lot between draws (the
  // Mac test's 92% is one seed's): judged over twenty crawls instead.
  const reach = crawl => {
    const veins = crawl.tendrils.flatMap(t => t.points);
    let cells = 0, reached = 0;
    for (let x = 30; x < screen.width; x += 60) {
      for (let y = 30; y < screen.height; y += 60) { cells++; if (veins.some(v => Math.abs(v.x - x) < 90 && Math.abs(v.y - y) < 90)) reached++; }
    }
    return reached / cells;
  };
  const plans = Array.from({ length: 20 }, (_, k) => new Symbiote(screen, charmAt, seeded(100 + k)));
  const average = plans.reduce((sum, c) => sum + reach(c), 0) / plans.length;
  assert.ok(average > 0.85, `${Math.round(average * 100)}% reached on average`);
  assert.ok(plans.every(c => c.spread > 1 && c.spread < 2.8), "in a couple of seconds");
});

test("storm: bolts that read as lightning, rain that fills the screen", () => {
  const rng = seeded(11), hanging = { x: 1100, y: 420 };
  const storm = new Storm(screen, hanging, rng);
  const b = storm.bolts;
  assert.ok(b.length === 5 && b.every((x, i) => i === 0 || b[i - 1].time < x.time), "five bolts, in order");
  assert.ok(b.every(x => x.time + LINGER < storm.duration - 1), "each dies away before the storm does");
  assert.ok(b.every(x => x.trunk[0].y < 0 && x.trunk[x.trunk.length - 1] === x.ground), "above the screen to the ground");
  const straying = x => {
    const a = x.trunk[0], z = x.trunk[x.trunk.length - 1], len = dist(a, z);
    return Math.max(...x.trunk.map(p => Math.abs((z.x - a.x) * (a.y - p.y) - (a.x - p.x) * (z.y - a.y)) / len));
  };
  assert.ok(b.every(x => x.trunk.length > 30 && straying(x) > 8), "jagged, not a straight line");
  assert.ok(b.filter(x => x.forks.length).length >= 4, "most bolts fork");
  assert.ok(b[4].charm && b[4].ground === hanging, "the last bolt lands on the charm");
  assert.ok(b.slice(0, 4).every(x => !x.charm), "and no other does");
  assert.ok(new Storm(screen, null, rng).bolts.every(x => !x.charm), "with no charm, none claims to");
  assert.ok(storm.gloom(0) === 0 && storm.gloom(storm.duration) === 0, "starts and ends under a clear sky");
  assert.ok(storm.gloom(storm.duration / 2) > 0.99, "fully dark in between");
  assert.ok(flash(0.02) === 1 && flash(0.09) < 0.4 && flash(0.15) > 0.7 && flash(0.6) === 0, "hard, dips, flares again");
  assert.equal(storm.flash(b[0].time - 0.01), 0, "no flash before the first bolt");
  let onScreen = true, falls = true;
  for (const d of storm.drops) {
    for (let t = 0; t <= storm.duration; t += 0.25) {
      const p = storm.position(d, t);
      onScreen &&= p.x >= -0.25 * screen.width - 1 && p.x <= screen.width + 1 && p.y >= -d.length - 1 && p.y <= screen.height + d.length + 1;
    }
    const y0 = storm.position(d, 0).y, y1 = storm.position(d, 0.1).y;
    falls &&= y1 > y0 || y1 < y0 - screen.height / 2;
  }
  assert.ok(onScreen, "rain stays on the screen");
  assert.ok(falls, "and only ever falls");
  const columns = new Set(storm.drops.map(d => Math.trunc(storm.position(d, 2).x / 100)));
  assert.ok(columns.size >= 14, `${columns.size} columns`);
});
