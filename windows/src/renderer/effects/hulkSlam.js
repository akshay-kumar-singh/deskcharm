import * as THREE from "three";
import { BLACK, circle, evenly, fill, radial, rectPath, rgba, stroke, gray, WHITE } from "../lib/canvas.js";
import { clamp, easeInOut, easeOutCubic, smoothstep } from "../lib/geometry.js";
import { rand } from "../lib/random.js";
import { Cloth } from "../sim/cloth.js";
import { CrackWeb } from "../sim/cracks.js";
import { Crater } from "../sim/rubble.js";
import { ConcreteArt, StandIn, Takedown } from "./common.js";
import { DUST } from "./wallSmash.js";

// Hulk smash, as in the Mac app's HulkSlam.swift. Double-clicking the Hulk charm
// brings in the Hulk, in 3D. He drops in at the bottom of the screen with a
// landing that cracks the floor, reaches up and rips the front window out of
// its place by one edge, and smashes it into the floor, left, right, left,
// right — the way he dealt with Loki — the window whipping and splatting like a
// rubber mat. Then he hurls it into the charm, where it's minimised, and leaps
// away.
//
// What he swings is the window's stand-in, with the window minimised beneath
// it. He is a rigged model posed from his own animations, crouching into each
// slam and leaning after it, his right arm steered by IK (rig.js); the window
// is a Cloth, and its landings are what set off each impact.
//
// The scene is in points, y up from the bottom of the screen, seen through an
// orthographic camera, so a point in it sits right over the same point of the
// overlay's 2D drawing: behind him, the window still in its place, the cracks
// in the floor and his shadow; in front, the dust and the flying concrete.

const COLUMNS = 14;
/** The sheet is never shown much bigger than this, so its texture is kept to it. */
const TEXTURE_SIDE = 1600;
const TOP = Math.PI / 2;
const LEFT = Math.PI * 1.22;            // down to his right, screen left
const RIGHT = -Math.PI * 0.22;          // over his head and down the other side

const DROP_TIME = 0.45, LAND_TIME = 0.8, REACH_TIME = 0.2, YANK_TIME = 0.3;
const SWINGS = 5, FIRST_SWING = 0.3, SWING_TIME = 0.42, HOLD_TIME = 0.12;
const WIND_TIME = 0.32, FLING_TIME = 0.14, FLY_TIME = 0.6, PUFF_TIME = 0.35;
const ROAR_TIME = 1.0, CROUCH_TIME = 0.22, LEAP_TIME = 0.45;
const GREEN = [0.55, 0.95, 0.35];

/** Lit from above and to one side, and filled from the other: the camera, lights and ambient every slam uses. */
export function makeStage(screen) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-screen.width / 2, screen.width / 2, screen.height / 2, -screen.height / 2, 1, 6000);
  camera.position.set(screen.width / 2, screen.height / 2, 3000);
  scene.add(camera);
  for (const [x, y, intensity] of [[-0.55, -0.45, 2.6], [-0.2, 0.9, 0.9]]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    // A SceneKit light shines down its node's -z, turned by its euler angles.
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(x, y, 0, "XYZ"));
    light.position.copy(dir.multiplyScalar(-1000));
    light.target.position.set(0, 0, 0);
    scene.add(light, light.target);
  }
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  return { scene, camera };
}

/** The window as a sheet: a grid of points, the stand-in on it, shown as it is, unlit, from either side. */
export function makeSheet(columns, rows) {
  const n = columns * rows;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[2 * i] = (i % columns) / (columns - 1);
    uv[2 * i + 1] = Math.floor(i / columns) / (rows - 1);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const index = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const a = r * columns + c, b = a + 1, d = a + columns, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

export class HulkSlam {
  /**
   * `floor` is how far above the bottom of the screen he stands (clear of the
   * taskbar); `home` is the charm's centre, live, in overlay points.
   * `renderer` is the overlay's WebGL renderer; `concrete(ctx, scale)` its tiles.
   */
  constructor({ target, screen, floor, rig, renderer, concrete, home, homeRadius, push, sound, finish, rng = Math.random }) {
    Object.assign(this, { target, screen, floor, rig, renderer, concrete, home, homeRadius, push, sound, finish, rng });
    this.takedown = target ? new Takedown(target) : null;

    const visible = screen.height - floor;
    /** His height, and his arm's reach, in points. */
    this.tall = clamp(visible * 0.46, 240, 470);
    const scale = this.tall / rig.height;
    this.reach = rig.reach * scale;
    const window = target?.frame ?? { width: 600, height: 400 };
    const length = Math.min(window.width, this.tall * 0.85);
    this.sheet = { x: length, y: length * window.height / Math.max(window.width, 1) };
    // An odd number of rows, so the one held to its length runs down the middle.
    this.rows = Math.max(5, Math.round((COLUMNS - 1) * this.sheet.y / this.sheet.x) + 1) | 1;

    const { scene, camera } = makeStage(screen);
    this.scene = scene;
    this.camera = camera;
    this.body = new THREE.Group();
    this.body.scale.setScalar(scale);
    this.body.add(rig.root);
    scene.add(this.body);
    // Stood with his right shoulder under the window's left edge, there to
    // reach up for, and room either side to swing it.
    rig.pose("idle", 0);
    const shoulder = rig.shoulderPosition.x - this.body.position.x;
    const room = this.reach + length + 20;
    const wanted = (target ? target.frame.x : screen.width / 2) - shoulder;
    this.middle = screen.width < 2 * room ? screen.width / 2 : clamp(wanted, room, screen.width - room);
    this.body.position.set(this.middle, screen.height + this.tall, 0);

    this.sheetMesh = makeSheet(COLUMNS, this.rows);
    scene.add(this.sheetMesh);
    this.texture = null;
    this.picture = null;
    this.dents = [];
    this.cloth = null;

    // His swing: round a point over his right shoulder, which goes where he does.
    this.arcCentre = { x: 0, y: 0 };
    this.handDepth = 0;

    this.start = null;
    this.now = 0;
    this.before = -1;
    this.landed = false;
    this.gone = this.failed = this.grabbed = this.winding = this.released = this.arrived = this.roaring = this.leaving = null;
    this.grabFrom = new THREE.Vector3();
    this.grip = new THREE.Vector3();
    this.releasedAt = new THREE.Vector3();
    this.swingStarts = [];
    this.ended = false;
    this.shaken = { x: 0, y: 0 };
    /** Hard landings on the floor, his or the window's. */
    this.impacts = [];
  }

  get arcRadius() { return 0.95 * this.reach; }
  get floorLine() { return this.screen.height - this.floor; }
  scenePoint(p) { return { x: p.x, y: this.screen.height - p.y }; }

  standInArrived(image, isSnapshot) {
    this.takedown?.arrived(image, isSnapshot);
    this.picture = image;
    this.repaint();
  }

  /** Gives the shared model back once the effect is over. */
  tearDown() {
    this.body.remove(this.rig.root);
    this.texture?.dispose();
    this.sheetMesh.geometry.dispose();
    this.sheetMesh.material.dispose();
  }

  /** Moves everything on to `now`, once a frame, before any layer draws. */
  step(now) {
    if (this.start === null) {
      this.start = now;
      this.sound("roar");
    }
    const t = now - this.start;
    this.before = this.now;
    this.now = t;
    this.advance(t);
    this.poseHulk(t);
    this.moveWindow(t, t - this.before);
    this.shaken = this.shake(t);
    this.camera.position.set(this.screen.width / 2 - this.shaken.x, this.screen.height / 2 + this.shaken.y, 3000);
  }

  render3D() {
    this.renderer.render(this.scene, this.camera);
  }

  // Story.

  advance(t) {
    const passing = x => x !== null && this.before < x && x <= t;
    if (!this.target && this.failed === null) this.failed = 0;
    if (this.gone === null && this.failed === null && this.takedown) {
      const outcome = this.takedown.advance(t, 0);
      if (outcome === "gone") this.gone = t;
      if (outcome === "failed") this.failed = t;
    }
    if (!this.landed && t >= DROP_TIME) {
      this.landed = true;
      this.impact({ x: this.middle, y: this.floorLine }, DROP_TIME, 150, 120);
    }
    if (this.grabbed === null && this.gone !== null && t >= Math.max(DROP_TIME + 0.45, this.gone)) {
      this.grabbed = t;
      this.grabFrom.copy(this.rig.handPosition);
      // As far up the window's left edge as he can reach.
      const shoulder = this.rig.shoulderPosition;
      const edge = this.target
        ? this.scenePoint({ x: this.target.frame.x + 6, y: this.target.frame.y + this.target.frame.height / 2 })
        : { x: shoulder.x, y: shoulder.y + this.reach };
      const out = new THREE.Vector3(edge.x, edge.y, shoulder.z + 0.3 * this.reach).sub(shoulder);
      if (out.length() > this.reach * 0.98) out.setLength(this.reach * 0.98);
      this.grip.copy(shoulder).add(out);
      let s = t + REACH_TIME + YANK_TIME;
      for (let i = 0; i < SWINGS; i++) {
        this.swingStarts.push(s);
        s += (i === 0 ? FIRST_SWING : SWING_TIME) + HOLD_TIME;
      }
      this.winding = s;
    }
    if (passing(this.grabbed !== null ? this.grabbed + REACH_TIME : null)) this.sound("whoosh");
    if (passing(this.winding)) this.sound("roar");
    if (this.winding !== null && this.released === null && t >= this.winding + WIND_TIME + FLING_TIME) {
      this.released = this.winding + WIND_TIME + FLING_TIME;
      this.releasedAt.copy(this.rig.handPosition);
      const to = this.scenePoint(this.home());
      const dx = to.x - this.releasedAt.x, dy = to.y - this.releasedAt.y, l = Math.hypot(dx, dy) || 1;
      this.cloth?.release({ x: dx / l * 1500, y: dy / l * 1500 + 300 });
      this.sound("whoosh");
    }
    if (this.released !== null && this.arrived === null && t >= this.released + FLY_TIME) {
      this.arrived = this.released + FLY_TIME;
      this.push({ x: 260, y: -40 });
      this.sound("pop");
    }
    // With nothing to smash he just roars, and goes.
    if (this.roaring === null && this.failed !== null && t >= Math.max(DROP_TIME + LAND_TIME * 0.6, this.failed)) {
      this.roaring = Math.max(DROP_TIME + LAND_TIME * 0.6, this.failed);
      this.sound("roar");
    }
    if (this.leaving === null) {
      if (this.released !== null && t >= this.released + 0.25) this.leaving = this.released + 0.25;
      if (this.roaring !== null && t >= this.roaring + ROAR_TIME) this.leaving = this.roaring + ROAR_TIME;
    }
    const windowDone = this.released === null ? this.failed !== null : (this.arrived !== null && t >= this.arrived + PUFF_TIME);
    if (!this.ended && windowDone && this.leaving !== null && t >= this.leaving + CROUCH_TIME + LEAP_TIME) {
      this.ended = true;
      this.finish();
    }
  }

  /**
   * A hard landing — his, or the window's: cracks in the floor, concrete and
   * dust thrown up, the screen and the charm jolted, and a dent in the window
   * if it was that.
   */
  impact(p, time, size, kick, isWindow = false) {
    const rng = this.rng;
    const area = { x: p.x - 2.4 * size, y: p.y - 2 * size, width: 4.8 * size, height: 2 * size };
    const crater = new Crater(p, size * 0.2, area, rng);
    // Finer than a wall's, and only those that run up into view.
    const cracks = crater.cracks.filter(c => c.points.some(q => q.y < p.y - 12)).map(c => ({ points: c.points, width: c.width * 0.6 }));
    // Thrown up off the floor, never down into it.
    const chunks = crater.thrown.map(c => ({
      outline: c.outline, start: { x: c.start.x, y: Math.min(c.start.y, p.y - 3) },
      velocity: { x: c.velocity.x * 0.7, y: -Math.abs(c.velocity.y) - 260 }, spin: c.spin, shade: c.shade,
    }));
    this.impacts.push({ time, at: p, reach: size * 2.6, cracks: ConcreteArt.tapered(cracks), chunks });
    this.push({ x: (this.impacts.length % 2 === 0 ? 1 : -1) * kick, y: -40 });
    this.sound("slam");
    if (!isWindow || !this.picture) return;
    // The far edge is what hits the floor.
    const tex = this.textureSize(this.picture);
    this.dents.push(new CrackWeb({ x: tex.width * rand(rng, 0.72, 0.95), y: tex.height * rand(rng, 0.2, 0.8) },
      Math.max(tex.width, tex.height) * 0.32, rng));
    this.repaint();
  }

  textureSize(image) {
    const k = Math.min(1, TEXTURE_SIDE / Math.max(image.width, image.height));
    return { width: Math.round(image.width * k), height: Math.round(image.height * k) };
  }

  /** Paints the sheet's texture, cracks and all, each its rays and its rings only near the middle, so they bend with the sheet. */
  repaint() {
    if (!this.picture) return;
    const size = this.textureSize(this.picture);
    const canvas = this.textureCanvas ?? (this.textureCanvas = document.createElement("canvas"));
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.picture, 0, 0, size.width, size.height);
    const unit = Math.max(size.width, size.height) / 900;
    for (const web of this.dents) {
      const path = new Path2D();
      for (const ray of web.rays) {
        path.moveTo(ray[0].x, ray[0].y);
        for (const p of ray.slice(1)) path.lineTo(p.x, p.y);
      }
      for (const { ray: j, corner: k } of web.rings) {
        if (k > 3) continue;
        const a = web.rays[j][k], b = web.rays[(j + 1) % web.rays.length][k];
        path.moveTo(a.x, a.y);
        path.lineTo(b.x, b.y);
      }
      stroke(ctx, path, gray(0.1, 0.6), 2.6 * unit, "round", "round");
      ctx.save();
      ctx.translate(unit, unit);
      stroke(ctx, path, WHITE(0.8), 1.1 * unit, "round", "round");
      ctx.restore();
    }
    if (!this.texture) {
      this.texture = new THREE.CanvasTexture(canvas);
      this.texture.flipY = false;
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 4;
      this.sheetMesh.material.map = this.texture;
      this.sheetMesh.material.needsUpdate = true;
    }
    this.texture.needsUpdate = true;
  }

  // Him.

  poseHulk(t) {
    const rig = this.rig;
    const idle = t % 4;
    if (t < DROP_TIME) {
      // Falls in out of the sky, arms up.
      rig.pose("Jump Slam", 3.1);
      const u = t / DROP_TIME;
      this.standToes(this.screen.height + 60 + (this.floor - this.screen.height - 60) * u * u);
      return;
    }
    if (this.leaving !== null && t >= this.leaving) {
      const u = t - this.leaving;
      if (u < CROUCH_TIME) {
        rig.pose("idle", idle, "Jump Slam", 6.0 + 0.35 * u / CROUCH_TIME, u / 0.08);
        this.standToes(this.floor);
      } else {
        rig.pose("Jump Slam", 6.55);
        const v = Math.min(1, (u - CROUCH_TIME) / LEAP_TIME);
        this.standToes(this.floor + (this.screen.height + 500) * v ** 1.6);
      }
      return;
    }
    if (this.roaring !== null && t >= this.roaring) {
      // The roar out of his animation, beating his chest.
      rig.pose("idle", idle, "Jump Slam", 4.6 + (t - this.roaring), (t - this.roaring) / 0.15);
      this.standToes(this.floor);
      return;
    }
    const since = t - DROP_TIME;
    const angle = this.swingAngle(t);
    if (since < LAND_TIME) {
      // Up out of the landing.
      rig.pose("Jump Slam", 3.5 + since, "idle", idle, smoothstep((since - 0.25) / 0.5));
    } else {
      rig.pose("idle", idle, "Jump Slam", 3.62, this.crouch(t, angle));
    }
    this.standToes(this.floor);
    if (this.grabbed === null) return;
    const side = this.lean(t, angle);
    rig.twist(0.35 * side, -0.45 * side);
    const shoulder = rig.shoulderPosition;
    this.arcCentre = { x: shoulder.x, y: shoulder.y + 0.1 * this.reach };
    this.handDepth = shoulder.z + 0.3 * this.reach;
    const hand = this.handTarget(t, angle);
    if (hand) rig.reachTo(hand, new THREE.Vector3(-1, -0.5, -0.4));
  }

  /** Where round his swing his hand is, while he's swinging. */
  swingAngle(t) {
    const first = this.swingStarts[0];
    if (first === undefined || t < first || (this.winding !== null && t >= this.winding)) return null;
    let angle = TOP;
    this.swingStarts.forEach((s, i) => {
      if (t < s) return;
      const d = i === 0 ? FIRST_SWING : SWING_TIME;
      const from = i === 0 ? TOP : (i % 2 === 1 ? LEFT : RIGHT);
      const to = i % 2 === 0 ? LEFT : RIGHT;
      // Slow off the top, fast into the floor.
      angle = from + (to - from) * Math.min(1, (t - s) / d) ** 1.8;
    });
    return angle;
  }

  /** How far down into the slam he's crouched, 0 to 1: deepest as the window hits the floor, standing tall to throw it, bent after it. */
  crouch(t, angle) {
    const deepest = 0.75;
    if (angle !== null) return deepest * clamp((1 - Math.sin(angle)) / (1 - Math.sin(LEFT)));
    const w = this.winding;
    if (w === null || t < w) return 0;
    if (t < w + WIND_TIME) return deepest * (1 - easeInOut((t - w) / WIND_TIME));
    if (t < w + WIND_TIME + FLING_TIME) return 0.4 * (t - w - WIND_TIME) / FLING_TIME;
    return 0.4 * Math.max(0, 1 - (t - w - WIND_TIME - FLING_TIME) / 0.3);
  }

  /** Which way he leans and turns, -1 to 1, screen left to right: into each slam, back from the charm and then toward it for the throw. */
  lean(t, angle) {
    if (angle !== null) return Math.cos(angle);
    const w = this.winding;
    if (w === null || t < w) return 0;
    const toward = this.scenePoint(this.home()).x > this.middle ? 1 : -1;
    if (t < w + WIND_TIME) return -0.8 * toward * easeInOut((t - w) / WIND_TIME);
    if (t < w + WIND_TIME + FLING_TIME) return toward * (-0.8 + 1.6 * (t - w - WIND_TIME) / FLING_TIME);
    return 0.8 * toward * Math.max(0, 1 - (t - w - WIND_TIME - FLING_TIME) / 0.3);
  }

  /** Where his right hand is going: up to the window's edge, down with it, round the arc for each slam, back and over to throw it, then his own. */
  handTarget(t, angle) {
    const g = this.grabbed;
    if (g === null) return null;
    const onArc = a => new THREE.Vector3(this.arcCentre.x + this.arcRadius * Math.cos(a), this.arcCentre.y + this.arcRadius * Math.sin(a), this.handDepth);
    if (t < g + REACH_TIME) return this.grabFrom.clone().lerp(this.grip, easeInOut((t - g) / REACH_TIME));
    if (t < g + REACH_TIME + YANK_TIME) return this.grip.clone().lerp(onArc(TOP), easeInOut((t - g - REACH_TIME) / YANK_TIME));
    if (this.released !== null && t >= this.released) {
      const u = (t - this.released) / 0.25;
      return u < 1 ? this.releasedAt.clone().lerp(this.rig.handPosition, u) : null;
    }
    const w = this.winding;
    if (w !== null && t >= w) {
      // Back on the side away from the charm, then hard toward it.
      const to = this.scenePoint(this.home());
      const dx = to.x - this.arcCentre.x, dy = to.y - this.arcCentre.y, l = Math.hypot(dx, dy) || 1;
      const toward = { x: dx / l, y: dy / l };
      const back = new THREE.Vector3(this.arcCentre.x - toward.x * this.arcRadius * 0.8, this.arcCentre.y + this.arcRadius * 0.55, this.handDepth);
      const fore = new THREE.Vector3(this.arcCentre.x + toward.x * this.arcRadius, this.arcCentre.y + toward.y * this.arcRadius, this.handDepth);
      const from = onArc(SWINGS % 2 === 1 ? LEFT : RIGHT);
      if (t < w + WIND_TIME) return from.lerp(back, easeInOut((t - w) / WIND_TIME));
      return back.lerp(fore, Math.min(1, (t - w - WIND_TIME) / FLING_TIME));
    }
    return onArc(angle ?? TOP);
  }

  standToes(y) {
    this.body.position.x = this.middle;
    this.body.updateMatrixWorld(true);
    this.body.position.y += y - this.rig.lowestToe;
    this.body.updateMatrixWorld(true);
  }

  // The window.

  /** Until he has hold of it the window is flat in its place, and drawn in 2D like any other stand-in; from then on it's the sheet, in 3D. */
  moveWindow(t, dt) {
    const g = this.grabbed;
    if (!this.target || g === null || t < g + REACH_TIME) { this.sheetMesh.visible = false; return; }
    const hand = this.rig.handPosition;
    const fist = { x: hand.x, y: hand.y };
    const n = COLUMNS * this.rows;
    const xs = new Float64Array(n), ys = new Float64Array(n);
    const yank = t - g - REACH_TIME;
    if (yank < YANK_TIME) {
      // Ripped out of its place and down into his fist, shrinking; it comes out from behind him on the way.
      const f = this.target.frame;
      const v = easeInOut(yank / YANK_TIME);
      for (let i = 0; i < n; i++) {
        const flatX = f.x + f.width * (i % COLUMNS) / (COLUMNS - 1);
        const flatY = this.screen.height - (f.y + f.height * Math.floor(i / COLUMNS) / (this.rows - 1));
        const hung = this.hanging(i, fist);
        xs[i] = flatX + (hung.x - flatX) * v;
        ys[i] = flatY + (hung.y - flatY) * v;
      }
      this.sheetMesh.position.z = v < 0.5 ? -1500 : 1500;
    } else {
      this.sheetMesh.position.z = 1500;
      const cloth = this.cloth ?? this.makeCloth(fist);
      if (this.released === null) cloth.hold(this.grips(fist));
      cloth.advance(dt);
      const hits = cloth.landings;
      cloth.landings = [];
      // One a swing: the sheet slaps down twice as it lands, and a throw isn't a slam.
      if (this.winding === null || t < this.winding) {
        const hit = hits.reduce((best, h) => (!best || h.speed > best.speed ? h : best), null);
        const lastTime = this.impacts.length ? this.impacts[this.impacts.length - 1].time : -1;
        if (hit && hit.speed > 650 && t - lastTime > 0.3) {
          this.impact({ x: hit.at.x, y: this.floorLine }, t, 100, 110, true);
        }
      }
      xs.set(cloth.x);
      ys.set(cloth.y);
      if (this.released !== null && t >= this.released) {
        // Thrown, it shrinks away into the charm as it flies.
        const to = this.scenePoint(this.home());
        const s = Math.min(1, (t - this.released) / FLY_TIME) ** 1.6;
        for (let i = 0; i < n; i++) {
          xs[i] = to.x + (xs[i] - to.x) * (1 - s);
          ys[i] = to.y + (ys[i] - to.y) * (1 - s);
        }
        if (t >= this.released + FLY_TIME) { this.sheetMesh.visible = false; return; }
      }
    }
    const position = this.sheetMesh.geometry.attributes.position;
    for (let i = 0; i < n; i++) position.setXYZ(i, xs[i], ys[i], 0);
    position.needsUpdate = true;
    this.sheetMesh.visible = !!this.texture;
  }

  /** The sheet's spacing at rest. */
  get spacing() { return { x: this.sheet.x / (COLUMNS - 1), y: this.sheet.y / (this.rows - 1) }; }

  /** Where point `i` hangs from his fist, the sheet held out along his swing's radius: the middle of its left edge in his hand. */
  hanging(i, hand) {
    let rx = hand.x - this.arcCentre.x, ry = hand.y - this.arcCentre.y + 0.001;
    const l = Math.hypot(rx, ry) || 1;
    rx /= l; ry /= l;
    const down = { x: ry, y: -rx };
    const c = i % COLUMNS, r = Math.floor(i / COLUMNS) - Math.floor(this.rows / 2);
    const sp = this.spacing;
    return { x: hand.x + rx * c * sp.x + down.x * r * sp.y, y: hand.y + ry * c * sp.x + down.y * r * sp.y };
  }

  grips(hand) {
    const mid = Math.floor(this.rows / 2);
    return new Map([mid - 1, mid, mid + 1].map(r => [r * COLUMNS, this.hanging(r * COLUMNS, hand)]));
  }

  makeCloth(hand) {
    const cloth = new Cloth(COLUMNS, this.rows, this.sheet.x, this.sheet.y, { x: 0, y: 0 });
    cloth.floor = this.floor;
    cloth.walls = [0, this.screen.width];
    cloth.place((c, r) => this.hanging(r * COLUMNS + c, hand));
    this.cloth = cloth;
    return cloth;
  }

  // Drawing.

  shake(t) {
    const v = { x: 0, y: 0 };
    this.impacts.forEach((impact, i) => {
      if (t < impact.time || t - impact.time >= 0.4) return;
      const u = t - impact.time;
      const a = (i === 0 ? 13 : 9) * Math.exp(-u / 0.09);
      v.x += a * Math.sin(u * 80);
      v.y += a * Math.cos(u * 63);
    });
    return v;
  }

  /** The window in its place until he has it, the cracks he leaves in the floor, and his shadow on it. */
  drawBehind(ctx) {
    const t = this.now;
    const down = this.takedown;
    if (this.failed === null && (this.grabbed === null || t < this.grabbed + REACH_TIME) && this.target && down?.standIn) {
      // Held still while the real window might still be under it.
      ctx.save();
      if (this.gone !== null) ctx.translate(this.shaken.x, this.shaken.y);
      StandIn.draw(ctx, down.standIn, this.target.frame, down.cover(t));
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.shaken.x, this.shaken.y);
    const fade = this.leaving !== null ? Math.max(0, 1 - (t - this.leaving) / (CROUCH_TIME + LEAP_TIME)) : 1;
    ctx.save();
    ctx.clip(rectPath({ x: -40, y: -40, width: this.screen.width + 80, height: this.floorLine + 40 }));
    for (const impact of this.impacts) {
      if (t < impact.time) continue;
      // Racing out from where it landed.
      const r = Math.max(1, impact.reach * easeOutCubic((t - impact.time) / 0.15));
      ctx.save();
      ctx.clip(circle(impact.at, r));
      ConcreteArt.stroke(ctx, impact.cracks, fade);
      ctx.restore();
    }
    ctx.restore();
    const height = this.rig.lowestToe - this.floor;
    const near = Math.max(0, 1 - height / 300);
    if (near > 0) {
      const w = this.tall * 0.36 * (0.6 + 0.4 * near);
      ctx.translate(this.middle, this.floorLine);
      ctx.scale(1, 0.14);
      fill(ctx, circle({ x: 0, y: 0 }, w), radial(ctx, { x: 0, y: 0 }, 0, w, evenly([BLACK(0.4 * near), BLACK(0)])));
    }
    ctx.restore();
  }

  /** Dust and concrete thrown up by each landing, and the burst as the window goes into the charm. */
  drawFront(ctx) {
    const t = this.now;
    ctx.save();
    ctx.translate(this.shaken.x, this.shaken.y);
    for (const impact of this.impacts) {
      if (t < impact.time || t - impact.time >= 1.2) continue;
      const since = t - impact.time;
      if (since < 0.7) {
        const u = since / 0.7, e = easeOutCubic(u);
        const size = impact.reach / 2.6;
        for (let n = 0; n < 9; n++) {
          const a = Math.PI * (1.02 + 0.96 * n / 8);
          const p = { x: impact.at.x + Math.cos(a) * size * (0.1 + 0.9 * e), y: impact.at.y + Math.sin(a) * 0.6 * size * (0.1 + 0.9 * e) };
          const r = size * (0.16 + 0.42 * e);
          fill(ctx, circle(p, r), radial(ctx, p, 0, r, evenly([rgba(...DUST, 0.7 * (1 - u) ** 1.4), rgba(...DUST, 0)])));
        }
      }
      if (!this.concrete) continue;
      ctx.save();
      ctx.clip(rectPath({ x: -40, y: -400, width: this.screen.width + 80, height: this.floorLine + 400 }));
      ctx.globalAlpha = since < 0.9 ? 1 : 1 - (since - 0.9) / 0.3;
      for (const chunk of impact.chunks) {
        const p = Crater.position(chunk, since);
        if (p.y >= this.floorLine + 20) continue;
        ConcreteArt.draw(ctx, chunk, p, chunk.spin * since, this.concrete);
      }
      ctx.restore();
    }
    if (this.arrived !== null && t - this.arrived < PUFF_TIME) this.drawBurst(ctx, this.home(), (t - this.arrived) / PUFF_TIME);
    ctx.restore();
  }

  /** A ring and rays of gamma green as the window goes into the charm. The charm hangs over this overlay, so it bursts out from behind it. */
  drawBurst(ctx, p, u) {
    const e = easeOutCubic(u), fade = 1 - u;
    const r = this.homeRadius * (0.7 + 0.55 * e);
    stroke(ctx, circle(p, r), rgba(...GREEN, 0.85 * fade), 3 * fade + 0.5);
    const rays = new Path2D();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 2 * Math.PI + 0.15;
      const d = { x: Math.cos(a), y: Math.sin(a) };
      rays.moveTo(p.x + d.x * (r + 10), p.y + d.y * (r + 10));
      rays.lineTo(p.x + d.x * (r + 18 + 26 * e), p.y + d.y * (r + 18 + 26 * e));
    }
    stroke(ctx, rays, rgba(...GREEN, 0.9 * fade), 2.2, "round");
  }
}
