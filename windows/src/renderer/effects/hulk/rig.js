import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// The Hulk in 3D, as in the Mac app's HulkRig (Hulk.swift): a rigged glTF model
// (a CC0 giant, repainted), posed from its own animations, his torso turned and
// his right arm steered by two-bone IK to wherever his hand has to be. Poses
// are sampled by hand, as the Mac app does, rather than played: each frame
// asks for one clip at one moment, or two mixed.

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/** Loads the model and skin; the skin replaces the model's own texture. */
export async function loadHulkRig(modelUrl, skinUrl) {
  const [gltf, skin] = await Promise.all([
    new GLTFLoader().loadAsync(modelUrl),
    new THREE.TextureLoader().loadAsync(skinUrl),
  ]);
  skin.flipY = false;                          // glTF texture coordinates run top down
  skin.colorSpace = THREE.SRGBColorSpace;
  skin.anisotropy = 4;
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.75, metalness: 0 });
    o.frustumCulled = false;                   // skinned: its bounds don't follow the pose
  });
  return new HulkRig(gltf.scene, gltf.animations);
}

/** A clip as channels to sample: which node, which property, and its keys. */
function channels(clip, root) {
  return clip.tracks.map(track => {
    const dot = track.name.lastIndexOf(".");
    const node = root.getObjectByName(track.name.slice(0, dot));
    const path = track.name.slice(dot + 1);          // position, quaternion or scale
    return node ? { node, path, times: track.times, values: track.values, width: path === "quaternion" ? 4 : 3 } : null;
  }).filter(Boolean);
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

/** A channel's value at `t`, clamped to its keys: linear, or slerped for turns. Written into `out`. */
function sample(c, t, out) {
  const times = c.times, n = times.length;
  t = Math.min(Math.max(t, times[0]), times[n - 1]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const span = times[hi] - times[lo];
  const u = span > 0 ? (t - times[lo]) / span : 0;
  const w = c.width, v = c.values;
  if (w === 4) {
    qa.fromArray(v, lo * 4);
    qb.fromArray(v, hi * 4);
    qa.slerp(qb, u);
    out[0] = qa.x; out[1] = qa.y; out[2] = qa.z; out[3] = qa.w;
  } else {
    for (let k = 0; k < 3; k++) out[k] = v[lo * 3 + k] + (v[hi * 3 + k] - v[lo * 3 + k]) * u;
  }
  return out;
}

function set(c, v) {
  if (c.path === "quaternion") c.node.quaternion.set(v[0], v[1], v[2], v[3]).normalize();
  else c.node[c.path].set(v[0], v[1], v[2]);
}

const world = (node, out = new THREE.Vector3()) => node.getWorldPosition(out);

/** Turns `node` so its world orientation becomes `q`, keeping its parent where it is. */
function setWorldQuaternion(node, q) {
  const parent = node.parent ? node.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  node.quaternion.copy(parent.invert().multiply(q));
  node.updateMatrixWorld(true);
}

export class HulkRig {
  constructor(root, animations) {
    this.root = root;
    const bone = name => {
      const b = root.getObjectByName(name);
      if (!b) throw new Error(`The Hulk model has no ${name}`);
      return b;
    };
    this.shoulder = bone("mixamorigRightArm");
    this.elbow = bone("mixamorigRightForeArm");
    this.hand = bone("mixamorigRightHand");
    this.spine = bone("mixamorigSpine1");
    const head = bone("mixamorigHead");
    this.toes = [bone("mixamorigLeftToeBase"), bone("mixamorigRightToeBase")];
    this.clips = new Map(animations.map(c => [c.name, channels(c, root)]));
    if (!this.clips.has("idle") || !this.clips.has("Jump Slam")) throw new Error("The Hulk model is missing its animations");
    // The joints turned on top of the animations, as they are at rest, so each
    // pose starts from scratch even where a clip doesn't move them.
    this.rest = [this.spine, this.shoulder, this.elbow, this.hand].map(n => [n, n.quaternion.clone()]);
    this.scratch = new Float64Array(4);
    this.other = new Float64Array(4);

    this.pose("idle", 0);
    const toeY = Math.min(...this.toes.map(t => world(t).y));
    // The head bone sits at the base of the skull; the crown is a little above.
    /** Toe to crown when standing, in model units. */
    this.height = (world(head).y - toeY) * 1.12;
    this.toeDepth = -toeY;
    /** His right arm's reach, shoulder to wrist, in model units. */
    this.reach = world(this.shoulder).distanceTo(world(this.elbow)) + world(this.elbow).distanceTo(world(this.hand));
  }

  /** Poses him as `clip` has him `t` seconds in, or part way from that toward `other` at `u`, by `mix`, 0 to 1. */
  pose(clip, t, other = null, u = 0, mix = 0) {
    for (const [node, q] of this.rest) node.quaternion.copy(q);
    const a = this.clips.get(clip);
    if (!a) return;
    const b = other && mix > 0 ? this.clips.get(other) : null;
    if (!b) {
      for (const c of a) set(c, sample(c, t, this.scratch));
    } else {
      const w = Math.min(mix, 1);
      const others = new Map(b.map(c => [c.node.uuid + c.path, c]));
      for (const c of a) {
        const v = sample(c, t, this.scratch);
        const match = others.get(c.node.uuid + c.path);
        if (match) {
          const o = sample(match, u, this.other);
          if (c.width === 4) {
            qa.set(v[0], v[1], v[2], v[3]).slerp(qb.set(o[0], o[1], o[2], o[3]), w);
            v[0] = qa.x; v[1] = qa.y; v[2] = qa.z; v[3] = qa.w;
          } else {
            for (let k = 0; k < 3; k++) v[k] += (o[k] - v[k]) * w;
          }
        }
        set(c, v);
      }
    }
    this.root.updateMatrixWorld(true);
  }

  /** Turns his upper body toward one side and leans it over, in radians. */
  twist(yaw, lean) {
    const now = this.spine.getWorldQuaternion(new THREE.Quaternion());
    const turn = new THREE.Quaternion().setFromAxisAngle(Z, lean).multiply(new THREE.Quaternion().setFromAxisAngle(Y, yaw));
    setWorldQuaternion(this.spine, turn.multiply(now));
  }

  /**
   * Bends his right arm to put his hand at `target`, elbow toward `bend`, both
   * in world space. Out of reach, the arm points straight at it.
   */
  reachTo(target, bend) {
    const s = world(this.shoulder), e = world(this.elbow), h = world(this.hand);
    const upper = s.distanceTo(e), lower = e.distanceTo(h);
    const offset = target.clone().sub(s);
    const d = Math.min(Math.max(offset.length(), Math.abs(upper - lower) + 0.001), (upper + lower) * 0.999);
    const along = offset.normalize();
    // Law of cosines: how far along the line to the elbow, and how far out.
    const a = (upper * upper - lower * lower + d * d) / (2 * d);
    const out = Math.sqrt(Math.max(0, upper * upper - a * a));
    let pole = bend.clone().sub(along.clone().multiplyScalar(bend.dot(along)));
    if (pole.length() < 0.0001) pole = new THREE.Vector3(0, -1, 0).sub(along.clone().multiplyScalar(along.y));
    const elbowAt = s.clone().add(along.clone().multiplyScalar(a)).add(pole.normalize().multiplyScalar(out));
    this.turn(this.shoulder, e.clone().sub(s), elbowAt.clone().sub(s));
    const elbowNow = world(this.elbow);
    this.turn(this.elbow, world(this.hand).sub(elbowNow), s.clone().add(along.multiplyScalar(d)).sub(elbowNow));
  }

  get handPosition() { return world(this.hand); }
  get shoulderPosition() { return world(this.shoulder); }
  get lowestToe() { return Math.min(...this.toes.map(t => world(t).y)); }

  turn(node, a, b) {
    if (a.length() <= 0.0001 || b.length() <= 0.0001) return;
    const q = new THREE.Quaternion().setFromUnitVectors(a.normalize(), b.normalize());
    setWorldQuaternion(node, q.multiply(node.getWorldQuaternion(new THREE.Quaternion())));
  }
}

export { X, Y, Z };
