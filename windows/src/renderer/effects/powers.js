import { tongueWidth, venomMouth, webHands } from "../../shared/charms.js";
import { dist } from "../lib/geometry.js";
import { Storm } from "../sim/storm.js";
import { Swarm } from "../sim/swarm.js";
import { Symbiote } from "../sim/symbiote.js";
import { BatSwarm } from "./batSwarm.js";
import { BatTow } from "./batTow.js";
import { concreteTiles } from "./common.js";
import { loadHulkRig } from "./hulk/rig.js";
import { HulkSlam, makeSheet, makeStage } from "./hulkSlam.js";
import { SymbioteCrawl } from "./symbioteCrawl.js";
import { aimAt } from "./target.js";
import { ThorStorm } from "./thorStorm.js";
import { ThorStrike } from "./thorStrike.js";
import { TongueLash } from "./tongueLash.js";
import { WallSmash } from "./wallSmash.js";
import { WebBlast } from "./webBlast.js";
import { WebShot } from "./webShot.js";

// Calls the powers up at the charm, as the Mac app's WebController,
// BatController, HulkController, VenomController and ThorController do: aims
// them, finds the window a double-click goes for and fetches its stand-in, and
// plays each effect on the overlay. Each power plays one at a time.

/** Where a bat's body sits in its frames, and how much of a frame a bat covers over a wingbeat. */
const BAT_BODY = { x: 0.5, y: 0.58 };
const BAT_FILL = 0.34;
const CENTRE = { x: 0.5, y: 0.5 };

/** The effects' pictures and the Hulk, loaded when first wanted and kept. */
class Art {
  constructor(base) {
    this.base = base;
    this.cache = new Map();
  }

  once(key, load) {
    if (!this.cache.has(key)) this.cache.set(key, load().catch(e => { this.cache.delete(key); throw e; }));
    return this.cache.get(key);
  }

  image(name) {
    return this.once(name, async () => {
      const response = await fetch(this.base + name);
      if (!response.ok) throw new Error(`${name}: ${response.status}`);
      return createImageBitmap(await response.blob());
    });
  }

  /** One wingbeat of a bat seen face on: wings raised, sweeping down, back up. */
  bats() { return this.once("bats", () => Promise.all([1, 2, 3, 4, 5, 6].map(i => this.image(`Bat-${i}.png`)))); }
  concrete() { return this.once("concrete", async () => concreteTiles(await this.image("Concrete.jpg"))); }
  hulk() { return this.once("hulk", () => loadHulkRig(this.base + "HulkModel.glb", this.base + "HulkSkin.png")); }
}

export class Powers {
  /** `charm` gives the live charm: key, height, aspect, kickScale, artPoint(u) and toOverlay(p). */
  constructor({ api, overlay, sim, charm, sounds, effectsUrl }) {
    Object.assign(this, { api, overlay, sim, charm, sounds });
    this.art = new Art(effectsUrl);
    this.running = new Set();
  }

  doubleClick(power) {
    ({ spiderMan: () => this.yank(), batman: () => this.tow(), hulk: () => this.smash(),
       venom: () => this.lash(), thor: () => this.strike() })[power]?.();
  }

  shake(power) {
    ({ spiderMan: () => this.blast(), batman: () => this.swarm(), hulk: () => this.wall(),
       venom: () => this.symbiote(), thor: () => this.storm() })[power]?.();
  }

  // What every effect is given.

  push = v => {
    const k = this.charm.kickScale;
    this.sim.impulse({ x: v.x * k, y: v.y * k });
  };

  sound = name => this.sounds.play(name);

  /** A point of the charm's art, as a fraction of it, where it is now, in overlay points. */
  point(u) { return this.charm.toOverlay(this.charm.artPoint(u)); }

  get homeSize() { return { width: this.charm.height * this.charm.aspect, height: this.charm.height }; }

  /** Live position of whichever hand starts out nearer `target`; the choice is fixed so the web doesn't jump hands mid-flight. */
  nearestHand(hands, target) {
    let best = 0;
    hands.forEach((h, i) => { if (dist(this.point(h), target) < dist(this.point(hands[best]), target)) best = i; });
    return () => this.point(hands[best]);
  }

  /**
   * Plays one effect of kind `kind`, unless one is playing already. `make`
   * gets {info, area, finish} and, for a double-click, the window it goes for
   * (or null), and returns the effect; `after` cleans up once it's over.
   */
  async play(kind, make, { window = false, after } = {}) {
    if (this.running.has(kind)) return;
    this.running.add(kind);
    try {
      const info = await this.overlay.open();
      const area = { width: info.bounds.width, height: info.bounds.height };
      const found = window ? await this.api.findTarget() : null;
      const target = found ? { ...found, hide: () => this.api.hideTarget(found) } : null;
      const extras = await make.prepare?.();
      const effect = this.overlay.play(
        finish => make({ info, area, target, finish, ...extras }),
        e => { this.running.delete(kind); after?.(e); });
      if (target) {
        this.standIn(found, info.scaleFactor)
          .then(s => effect.standInArrived(s?.image ?? null, s?.isSnapshot ?? false))
          .catch(e => { this.api.log("no stand-in:", String(e)); effect.standInArrived(null, false); });
      }
    } catch (e) {
      this.running.delete(kind);
      this.api.log(`${kind} couldn't start:`, String(e?.stack ?? e));
    }
  }

  /** The window's double: a snapshot of it, or a card with its app's icon and name. */
  async standIn(found, scale) {
    const s = await this.api.standIn(found);
    if (s?.pixels) {
      const pixels = new Uint8ClampedArray(s.pixels.buffer, s.pixels.byteOffset, s.pixels.byteLength);
      return { image: await createImageBitmap(new ImageData(pixels, s.width, s.height)), isSnapshot: true };
    }
    if (s?.card) return { image: await card(found.frame, s.card, scale), isSnapshot: false };
    return null;
  }

  // Spider-Man.

  yank() {
    const make = ({ area, target, finish }) => {
      const hands = webHands(this.charm.key);
      const hand = this.nearestHand(hands, aimAt(target, this.charm.toOverlay(this.sim.tip), area));
      return new WebShot({ target, aim: aimAt(target, hand(), area), hand, push: this.push, sound: this.sound, finish });
    };
    this.play("yank", make, { window: true });
  }

  blast() {
    this.play("blast", ({ area, finish }) => {
      // Lands a little off-centre toward him, like something thrown at the glass.
      const tip = this.charm.toOverlay(this.sim.tip);
      const centre = { x: area.width * 0.5 + (tip.x - area.width * 0.5) * 0.25, y: area.height * 0.45 };
      return new WebBlast({ size: area, centre, hand: this.nearestHand(webHands(this.charm.key), centre),
        push: this.push, sound: this.sound, finish });
    });
  }

  // Batman.

  tow() {
    const make = ({ area, target, finish, bats }) => new BatTow({
      target, aim: aimAt(target, this.point(CENTRE), area), home: () => this.point(CENTRE), homeSize: this.homeSize,
      bats, batBody: BAT_BODY, batAspect: bats[0].height / bats[0].width, push: this.push, sound: this.sound, finish,
    });
    make.prepare = async () => ({ bats: await this.art.bats() });
    this.play("tow", make, { window: true });
  }

  swarm() {
    const make = ({ area, finish, bats }) => new BatSwarm({
      plan: new Swarm(area, BAT_FILL, bats[0].height / bats[0].width, Math.random), frames: bats, body: BAT_BODY,
      push: this.push, sound: this.sound, finish,
    });
    make.prepare = async () => ({ bats: await this.art.bats() });
    this.play("swarm", make);
  }

  // The Hulk.

  smash() {
    const make = ({ info, area, target, finish, rig, concrete }) => {
      // He stands on the floor, clear of the taskbar.
      const b = info.bounds, w = info.workArea;
      const floor = Math.max(0, b.y + b.height - (w.y + w.height));
      return new HulkSlam({
        target, screen: area, floor, rig, renderer: this.overlay.renderer3D(), concrete,
        home: () => this.point(CENTRE), homeRadius: this.charm.height * this.charm.aspect / 2,
        push: this.push, sound: this.sound, finish,
      });
    };
    make.prepare = async () => ({ rig: await this.art.hulk(), concrete: await this.art.concrete() });
    this.play("smash", make, { window: true, after: slam => slam.tearDown() });
  }

  wall() {
    const make = ({ area, finish, concrete }) => new WallSmash({ size: area, concrete, push: this.push, sound: this.sound, finish });
    make.prepare = async () => ({ concrete: await this.art.concrete() });
    this.play("wall", make);
  }

  /**
   * Loads the Hulk and draws him once out of sight, so his shaders are built
   * before the first double-click needs them: built then, they hold up his
   * entrance.
   */
  async warmHulk() {
    try {
      const rig = await this.art.hulk();
      await this.overlay.ready;
      const renderer = this.overlay.renderer3D();
      const { scene, camera } = makeStage({ width: 64, height: 64 });
      const sheet = makeSheet(2, 2);
      scene.add(rig.root, sheet);
      renderer.compile(scene, camera);
      scene.remove(rig.root);
    } catch (e) {
      this.api.log("couldn't warm up the Hulk:", String(e?.stack ?? e));
    }
  }

  // Venom.

  lash() {
    const key = this.charm.key;
    const mouth = () => this.point(venomMouth(key));
    this.play("lash", ({ area, target, finish }) => new TongueLash({
      target, aim: aimAt(target, mouth(), area), mouth, width: Math.max(4, this.charm.height * tongueWidth(key)),
      push: this.push, sound: this.sound, finish,
    }), { window: true });
  }

  symbiote() {
    this.play("symbiote", ({ area, finish }) => new SymbioteCrawl({
      plan: new Symbiote(area, this.point({ x: 0.5, y: 0.55 }), Math.random), push: this.push, sound: this.sound, finish,
    }));
  }

  // Thor.

  strike() {
    this.play("strike", ({ area, target, finish }) => new ThorStrike({
      target, aim: aimAt(target, this.point(CENTRE), area), screen: area, home: () => this.point(CENTRE),
      homeSize: this.homeSize, push: this.push, sound: this.sound, finish,
    }), { window: true });
  }

  storm() {
    // The last bolt goes for the charm, wherever it is swinging just now.
    this.play("storm", ({ area, finish }) => new ThorStorm({
      plan: new Storm(area, this.point(CENTRE), Math.random), push: this.push, sound: this.sound, finish,
    }));
  }
}

/**
 * Stands in for a window there is no snapshot of: a blank window, Windows
 * style, wearing its app's icon and name. Drawn once, so the flight only ever
 * moves a finished picture.
 */
async function card(frame, { name, title, icon }, scale) {
  const w = Math.max(1, Math.round(frame.width * scale)), h = Math.max(1, Math.round(frame.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  const W = frame.width, H = frame.height;
  const shape = new Path2D();
  shape.roundRect(0.5, 0.5, W - 1, H - 1, 8);
  ctx.fillStyle = "#f9f9f9";
  ctx.fill(shape);
  // The title bar: its text, and minimise, maximise and close.
  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(1, 1, W - 2, 31);
  ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#1b1b1b";
  ctx.textBaseline = "middle";
  ctx.fillText(title.length > 80 ? `${title.slice(0, 77)}…` : title, 14, 17, Math.max(0, W - 170));
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 1;
  const cx = W - 23;
  ctx.beginPath();
  ctx.moveTo(cx - 5, 12); ctx.lineTo(cx + 5, 22);                 // close: ✕
  ctx.moveTo(cx - 5, 22); ctx.lineTo(cx + 5, 12);
  ctx.rect(cx - 46 - 5, 12, 10, 10);                               // maximise: ☐
  ctx.moveTo(cx - 92 - 5, 17); ctx.lineTo(cx - 92 + 5, 17);       // minimise: ─
  ctx.stroke();
  // The app's icon and name in the middle.
  const side = Math.min(96, W * 0.3, H * 0.3);
  if (icon) {
    const img = new Image();
    img.src = icon;
    try {
      await img.decode();
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, W / 2 - side / 2, H / 2 - side / 2 - 12, side, side);
    } catch { /* no icon, then */ }
  }
  ctx.font = "600 15px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "#5f5f5f";
  ctx.textAlign = "center";
  ctx.fillText(name, W / 2, H / 2 + side / 2 + 10, W - 40);
  ctx.strokeStyle = "rgba(0,0,0,0.14)";
  ctx.stroke(shape);
  return canvas;
}
