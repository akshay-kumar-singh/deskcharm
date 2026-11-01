import { hangOf, powersOf, usesPower } from "../../shared/charms.js";
import { Powers } from "../effects/powers.js";
import { RopeSim } from "../sim/rope.js";
import { ShakeMeter } from "../sim/shake.js";
import { SoundFX } from "../sound/sfx.js";
import { drawChain, drawCharm } from "./draw.js";
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
}

await apply(state);
api.onState(apply);
sounds.prepare();
// The Hulk takes a moment to get ready; do it now if he might be wanted.
if (Object.values(powersOf(state.charm)).includes("hulk")) setTimeout(() => powers.warmHulk(), 1500);

// The window takes clicks only while the pointer is over the charm, or while
// it's held; everywhere else they fall through to whatever is underneath.
let pointer = null, held = null, ignoring = true;
window.addEventListener("mousemove", e => { pointer = { x: e.clientX, y: e.clientY }; });
document.documentElement.addEventListener("mouseleave", () => { pointer = null; });

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

function frame(ms) {
  const now = ms / 1000;
  fit();
  configure();
  sim.advance(now);
  trail.record(sim.tip, sim.charmRotation, now);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  drawChain(ctx, sim);
  if (image) {
    const ghosts = usesPower(powersOf(state.charm), "spiderMan") ? trail.ghosts() : [];
    drawCharm(ctx, image, charm.art(), hangOf(state.charm), sim.tip, sim.charmRotation, ghosts, dpr);
  }

  updateClickThrough();
  overlay.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// For tests: lets a harness set off powers and check on the charm.
window.__deskcharm = { sim, powers, overlay, charm, get state() { return state; }, get image() { return image; } };
