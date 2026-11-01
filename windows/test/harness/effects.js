// Plays one power against a pretend desktop — a wallpaper, a window in front,
// and the charm hanging top right — steps it frame by frame to a moment, and
// leaves that frame on screen for the harness to capture. URL parameters:
// ?effect=webShot&t=0.8 (seconds in).
import * as THREE from "three";
import { hangOf, tongueWidth, venomMouth, webHands } from "/src/shared/charms.js";
import { BatSwarm } from "/src/renderer/effects/batSwarm.js";
import { BatTow } from "/src/renderer/effects/batTow.js";
import { concreteTiles } from "/src/renderer/effects/common.js";
import { loadHulkRig } from "/src/renderer/effects/hulk/rig.js";
import { HulkSlam } from "/src/renderer/effects/hulkSlam.js";
import { SymbioteCrawl } from "/src/renderer/effects/symbioteCrawl.js";
import { aimAt } from "/src/renderer/effects/target.js";
import { ThorStorm } from "/src/renderer/effects/thorStorm.js";
import { ThorStrike } from "/src/renderer/effects/thorStrike.js";
import { TongueLash } from "/src/renderer/effects/tongueLash.js";
import { WallSmash } from "/src/renderer/effects/wallSmash.js";
import { WebBlast } from "/src/renderer/effects/webBlast.js";
import { WebShot } from "/src/renderer/effects/webShot.js";
import { seeded } from "/src/renderer/lib/random.js";
import { Storm } from "/src/renderer/sim/storm.js";
import { Swarm } from "/src/renderer/sim/swarm.js";
import { Symbiote } from "/src/renderer/sim/symbiote.js";

const params = new URLSearchParams(location.search);
const name = params.get("effect");
const at = Number(params.get("t") ?? 1);
const W = 1512, H = 982;
const area = { width: W, height: H };
const layers = ["back", "gl", "front"].map(id => document.getElementById(id));
for (const c of layers) { c.width = W; c.height = H; c.style.width = `${W}px`; c.style.height = `${H}px`; }
const back = layers[0].getContext("2d"), front = layers[2].getContext("2d");

const CHARM_OF = { webShot: "Spider-Man", webBlast: "Spider-Man", batTow: "Bat-Man", batSwarm: "Bat-Man", hulkSlam: "Hulk",
  wallSmash: "Hulk", tongueLash: "Venom", symbiote: "Venom", thorStrike: "Thor", thorStorm: "Thor" };
const key = CHARM_OF[name];

async function bitmap(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return createImageBitmap(await r.blob());
}

const charmImage = await bitmap(`/charms/${key}.png`);
const height = 200, aspect = charmImage.width / charmImage.height;
const hang = hangOf({ key });
const tip = { x: 1180, y: 244 };
function artPoint(u) {
  const w = height * aspect, art = { x: -hang.attach.x * w, y: -hang.attach.y * height - 1 };
  const px = art.x + u.x * w, py = art.y + u.y * height, c = Math.cos(hang.tilt), s = Math.sin(hang.tilt);
  return { x: tip.x + px * c - py * s, y: tip.y + px * s + py * c };
}

const pushes = [], sounds = [];
const push = v => pushes.push(v);
const sound = s => sounds.push(s);
let finished = false;
const finish = () => { finished = true; };

// The window in front: drawn by the "desktop" until it's minimised.
const frame = { x: 360, y: 230, width: 760, height: 470 };
let minimised = false;
const target = { id: "w", frame, title: "Quarterly report - Word", hide: async () => { minimised = true; return true; } };
const window_ = paintWindow(frame);

function paintWindow(f) {
  const c = document.createElement("canvas");
  c.width = f.width; c.height = f.height;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, f.width, f.height);
  g.fillStyle = "#2b579a"; g.fillRect(0, 0, f.width, 34);
  g.fillStyle = "#ffffff"; g.font = "13px sans-serif"; g.fillText("Quarterly report - Word", 14, 22);
  g.fillStyle = "#d8d8d8";
  for (let i = 0; i < 14; i++) g.fillRect(48, 70 + i * 26, (i % 4 === 3 ? 0.45 : 0.85) * (f.width - 96), 9);
  g.fillStyle = "#f3c9a8"; g.fillRect(f.width - 230, 100, 170, 120);
  return c;
}

function desktop(ctx) {
  const wall = ctx.createLinearGradient(0, 0, W, H);
  wall.addColorStop(0, "#4f5f9c"); wall.addColorStop(0.4, "#7c72b0"); wall.addColorStop(0.75, "#c98e9b"); wall.addColorStop(1, "#f0b78f");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(24,24,28,0.82)"; ctx.fillRect(0, H - 48, W, 48);    // the taskbar
  if (!minimised) ctx.drawImage(window_, frame.x, frame.y);
}

function drawCharm(ctx) {
  ctx.strokeStyle = "#d9a84a"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(tip.x, 4); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  const w = height * aspect;
  ctx.save();
  ctx.translate(tip.x, tip.y); ctx.rotate(hang.tilt);
  ctx.drawImage(charmImage, -hang.attach.x * w, -hang.attach.y * height - 1, w, height);
  ctx.restore();
}

const rng = seeded(5);
const centre = () => artPoint({ x: 0.5, y: 0.5 });
const homeSize = { width: height * aspect, height };
let effect, three = null;

switch (name) {
  case "webShot": {
    const hand = () => artPoint(webHands(key)[0]);
    effect = new WebShot({ target, aim: aimAt(target, hand(), area), hand, push, sound, finish });
    break;
  }
  case "webBlast": {
    const c = { x: W * 0.5 + (tip.x - W * 0.5) * 0.25, y: H * 0.45 };
    effect = new WebBlast({ size: area, centre: c, hand: () => artPoint(webHands(key)[0]), push, sound, finish, rng });
    break;
  }
  case "batTow": case "batSwarm": {
    const bats = await Promise.all([1, 2, 3, 4, 5, 6].map(i => bitmap(`/effects/Bat-${i}.png`)));
    const batAspect = bats[0].height / bats[0].width;
    effect = name === "batTow"
      ? new BatTow({ target, aim: aimAt(target, centre(), area), home: centre, homeSize, bats, batBody: { x: 0.5, y: 0.58 }, batAspect, push, sound, finish })
      : new BatSwarm({ plan: new Swarm(area, 0.34, batAspect, rng), frames: bats, body: { x: 0.5, y: 0.58 }, push, sound, finish, rng });
    break;
  }
  case "hulkSlam": {
    const rig = await loadHulkRig("/effects/HulkModel.glb", "/effects/HulkSkin.png");
    const renderer = new THREE.WebGLRenderer({ canvas: layers[1], alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(W, H, false);
    three = renderer;
    effect = new HulkSlam({ target, screen: area, floor: 48, rig, renderer, concrete: concreteTiles(await bitmap("/effects/Concrete.jpg")),
      home: centre, homeRadius: height * aspect / 2, push, sound, finish, rng });
    break;
  }
  case "wallSmash":
    effect = new WallSmash({ size: area, concrete: concreteTiles(await bitmap("/effects/Concrete.jpg")), push, sound, finish, rng });
    break;
  case "tongueLash": {
    const mouth = () => artPoint(venomMouth(key));
    effect = new TongueLash({ target, aim: aimAt(target, mouth(), area), mouth, width: Math.max(4, height * tongueWidth(key)), push, sound, finish, rng });
    break;
  }
  case "symbiote":
    effect = new SymbioteCrawl({ plan: new Symbiote(area, artPoint({ x: 0.5, y: 0.55 }), rng), push, sound, finish });
    break;
  case "thorStrike":
    effect = new ThorStrike({ target, aim: aimAt(target, centre(), area), screen: area, home: centre, homeSize, push, sound, finish, rng });
    break;
  case "thorStorm":
    effect = new ThorStorm({ plan: new Storm(area, centre(), rng), push, sound, finish, rng });
    break;
  default:
    throw new Error(`no such effect: ${name}`);
}

let frames = 0;
for (let now = 0; now <= at + 1e-9 && !finished; now += 1 / 60) {
  for (const ctx of [back, front]) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); }
  desktop(back);
  if (effect.render3D) {
    effect.step(now);
    effect.drawBehind(back);
    effect.render3D();
    effect.drawFront(front);
  } else {
    effect.render(front, now);
  }
  drawCharm(front);
  if (frames === 0) effect.standInArrived?.(window_, true);
  frames++;
  await new Promise(r => setTimeout(r, 0));
}
three?.render?.bind(three);
document.title = `done ${frames} frames, ${pushes.length} pushes, sounds: ${sounds.join(" ")}${finished ? ", finished" : ""}`;
