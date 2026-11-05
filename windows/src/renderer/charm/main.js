import { hangOf, powersOf, usesPower } from "../../shared/charms.js";
import { Powers } from "../effects/powers.js";
import { RopeSim } from "../sim/rope.js";
import { ShakeMeter } from "../sim/shake.js";
import { SoundFX } from "../sound/sfx.js";
import { SHADOW_REACH, drawChain, drawCharm } from "./draw.js";
import { ClickTracker, Trail } from "./gestures.js";
import { Overlay } from "./overlay.js";

// The charm's page: the chain and charm, swinging on the rope simulation,
// drawn every frame; picked up, flung, double-clicked and manhandled; and the
// powers those set off, drawn on the overlay. As CharmView and AppDelegate in
// the Mac app's main.swift.

const api = window.deskcharm;
const SEGMENTS = 22;

window.addEventListener("error", e => api.log("error:", e.message, `${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", e => api.log("unhandled:", String(e.reason?.stack ?? e.reason)));

const canvas = document.getElementById("charm");
const ctx = canvas.getContext("2d");
const sim = new RopeSim();
const shake = new ShakeMeter();
const clicks = new ClickTracker();
const trail = new Trail();
const sounds = new SoundFX();
const overlay = new Overlay(api);

let state = await api.state();
let image = null, imageUrl = null;
let dpr = 1;
// The frame loop's: frames drawn, when the last was, what it covered, and the frame it waits for.
let frames = 0, lastDrawn = -Infinity, covered = null, timer = 0, waiting = false;

/** The charm as it is now, for drawing, hit-testing and aiming the powers. */
const charm = {
  get key() { return state.charm.key; },
  get height() { return state.settings.charmHeight; },
  get aspect() { return image ? image.width / image.height : 0.6; },
  /** A velocity kick swings a long chain further than a short one, so kicks are scaled to give much the same swing at every length. */
  get kickScale() { return Math.sqrt(240 / Math.max(state.settings.ropeLength, 1)); },

  /** The art's frame about the chain's tip, before it's turned; a point higher than the attach point so the chain runs into it. */
  art() {
    const h = this.height, w = h * this.aspect, a = hangOf(state.charm).attach;
    return { x: -a.x * w, y: -a.y * h - 1, width: w, height: h };
  },

  /** Where a point of the art, as a fraction of it, is drawn right now in this window. */
  artPoint(u) {
    const art = this.art();
    const px = art.x + u.x * art.width, py = art.y + u.y * art.height;
    const angle = sim.charmRotation + hangOf(state.charm).tilt;
    const c = Math.cos(angle), s = Math.sin(angle), tip = sim.tip;
    return { x: tip.x + px * c - py * s, y: tip.y + px * s + py * c };
  },

  /** This window's points to the overlay's. */
  toOverlay(p) {
    const b = state.charmBounds, o = overlay.info?.bounds ?? b;
    return { x: b.x - o.x + p.x, y: b.y - o.y + p.y };
  },

  /** Whether a point of this window is on the charm: tested in the art's own frame, so the region turns with it. */
  hit(p) {
    const tip = sim.tip, angle = -(sim.charmRotation + hangOf(state.charm).tilt);
    const dx = p.x - tip.x, dy = p.y - tip.y;
    const x = dx * Math.cos(angle) - dy * Math.sin(angle), y = dx * Math.sin(angle) + dy * Math.cos(angle);
    const art = this.art();
    return x >= art.x - 12 && x <= art.x + art.width + 12 && y >= art.y - 12 && y <= art.y + art.height + 12;
  },
};

const powers = new Powers({ api, overlay, sim, charm, sounds, effectsUrl: new URL("effects/", location.origin + "/").href });

async function apply(next) {
  state = next;
  sounds.enabled = state.settings.sounds;
  if (state.charm.url !== imageUrl) {
    imageUrl = state.charm.url;
    try {
      const img = new Image();
      img.src = imageUrl;
      await img.decode();
      if (imageUrl === state.charm.url) image = await createImageBitmap(img);
    } catch (e) {
      api.log("couldn't load the charm's art:", imageUrl, String(e));
    }
  }
  wake();
}

await apply(state);
api.onState(apply);
sounds.prepare();
// The Hulk takes a moment to get ready; do it now if he might be wanted.
if (Object.values(powersOf(state.charm)).includes("hulk")) setTimeout(() => powers.warmHulk(), 1500);

// The window takes clicks only while the pointer is over the charm, or while
// it's held; everywhere else they fall through to whatever is underneath.
// While they fall through the window hears nothing of the mouse, so the app
// says where the cursor is (watchCursor in main.js).
let pointer = null, held = null, ignoring = true;
window.addEventListener("mousemove", e => { pointer = { x: e.clientX, y: e.clientY }; });
document.documentElement.addEventListener("mouseleave", () => { pointer = null; });
api.onCursor(at => {
  if (held) return;                            // the window has the pointer itself while it's held
  pointer = at;
  updateClickThrough();
});

function updateClickThrough() {
  const ignore = !(held || (pointer && charm.hit(pointer)));
  if (ignore !== ignoring) {
    ignoring = ignore;
    api.setIgnoreMouse(ignore);
  }
}

canvas.addEventListener("pointerdown", e => {
  if (e.button !== 0) return;
  const p = { x: e.clientX, y: e.clientY };
  if (!charm.hit(p)) return;
  canvas.setPointerCapture(e.pointerId);
  held = { id: e.pointerId, from: p };
  sim.grab(p);
  shake.drag(p, e.timeStamp / 1000);
  wake();
});

canvas.addEventListener("pointermove", e => {
  pointer = { x: e.clientX, y: e.clientY };
  if (!held || e.pointerId !== held.id) return;
  sim.grab(pointer);
  if (shake.drag(pointer, e.timeStamp / 1000)) manhandled();
});

function letGo(e, cancelled) {
  if (!held || e.pointerId !== held.id) return;
  sim.release();
  shake.release();
  const at = { x: e.clientX, y: e.clientY };
  const moved = Math.hypot(at.x - held.from.x, at.y - held.from.y);
  held = null;
  if (!cancelled && clicks.release(moved, e.timeStamp / 1000, at)) doubleClicked();
}
canvas.addEventListener("pointerup", e => letGo(e, false));
canvas.addEventListener("pointercancel", e => letGo(e, true));

/** Each charm's powers decide which hero answers: its own, or for a custom charm whichever was picked for each. */
function doubleClicked() {
  const p = powersOf(state.charm).doubleClick;
  if (p) powers.doubleClick(p);
}

function manhandled() {
  const p = powersOf(state.charm).shake;
  if (p) powers.shake(p);
}

/** Sizes the canvas to the window, in device pixels for a sharp picture. */
function fit() {
  dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    covered = null;                            // resizing clears the canvas
  }
}

/** Hangs the chain from the middle of the top edge, as long as the menu says. */
function configure() {
  const anchor = { x: window.innerWidth / 2, y: 4 };
  const segLen = state.settings.ropeLength / SEGMENTS;
  if (sim.nodes.length !== SEGMENTS + 1 || Math.abs(sim.segLen - segLen) > 0.01 || sim.anchor.x !== anchor.x || sim.anchor.y !== anchor.y) {
    sim.reset(anchor, SEGMENTS + 1, segLen);
  }
}

// The frame loop. While something's going on the charm is drawn every
// display frame, up to 60 a second; while it only sways in the breeze, 25 a
// second, which looks no different at that speed and costs far less. The
// rope is stepped in real time either way, and only the part of the canvas
// the chain and charm cover, then and now, is cleared and drawn again.
const BUSY_FPS = 60, CALM_FPS = 25;
const CALM_SPEED = 20;                         // pt/s; the breeze alone never moves the chain past 8

function frame(ms) {
  waiting = false;
  timer = 0;
  const now = ms / 1000;
  fit();
  configure();
  sim.advance(now);
  trail.record(sim.tip, sim.charmRotation, now);
  const busy = !!held || overlay.moving(now) || sim.speed > CALM_SPEED;
  if (now - lastDrawn >= 1 / (busy ? BUSY_FPS : CALM_FPS) - 0.004) {
    lastDrawn = now;
    draw();
    overlay.frame(now);
  }
  updateClickThrough();
  if (busy) wake();
  else timer = setTimeout(() => frame(performance.now()), 1000 / CALM_FPS);
}

/** Back to drawing every display frame, as soon as something starts: a touch, a power, new art. */
function wake() {
  clearTimeout(timer);
  timer = 0;
  if (!waiting) {
    waiting = true;
    requestAnimationFrame(frame);
  }
}
overlay.onPlay = wake;

function draw() {
  frames++;
  const art = charm.art(), hang = hangOf(state.charm);
  const ghosts = image && usesPower(powersOf(state.charm), "spiderMan") ? trail.ghosts() : [];
  const box = coverage(art, hang, ghosts);
  const clear = covered ? union(covered, box) : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  covered = box;
  const x = Math.floor(clear.x * dpr) - 1, y = Math.floor(clear.y * dpr) - 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(x, y, Math.ceil((clear.x + clear.width) * dpr) + 1 - x, Math.ceil((clear.y + clear.height) * dpr) + 1 - y);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  drawChain(ctx, sim);
  if (image) drawCharm(ctx, image, art, hang, sim.tip, sim.charmRotation, ghosts, dpr);
}

/** What the chain and charm cover, in points: the chain and its hook, and the art and its shadow at every pose drawn. */
function coverage(art, hang, ghosts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const n of sim.nodes) add(n.p.x, n.p.y, 4);
  add(sim.anchor.x, sim.anchor.y, 8);
  const corners = [[art.x, art.y], [art.x + art.width, art.y], [art.x, art.y + art.height], [art.x + art.width, art.y + art.height]];
  for (const pose of [{ tip: sim.tip, angle: sim.charmRotation }, ...ghosts]) {
    const a = pose.angle + hang.tilt, c = Math.cos(a), s = Math.sin(a);
    for (const [u, v] of corners) add(pose.tip.x + u * c - v * s, pose.tip.y + u * s + v * c, SHADOW_REACH);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

wake();

// For tests: lets a harness set off powers and check on the charm.
window.__deskcharm = {
  sim, powers, overlay, charm,
  get state() { return state; }, get image() { return image; }, get frames() { return frames; },
  get ignoring() { return ignoring; },
};
