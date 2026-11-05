import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Makes art/, the charm and effect art this app ships, from the repo's own
// Charms/hd and Effects, which the Mac app uses as they are. The copies are
// smaller, which is most of what this app's installer can shed:
//  - charms as WebP, no taller than 860px (a Huge charm, 340pt, at 250%);
//  - the concrete and the Hulk's skin as WebP; the bats are tiny and stay PNG;
//  - the Hulk's model without what this app never uses: the texture it
//    carries, which HulkSkin replaces, and every animation but two.
// Needs cwebp (brew install webp). Run with: node scripts/make-art.mjs

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.join(root, "..");
const out = path.join(root, "art");
const MAX_CHARM_HEIGHT = 860;
const HULK_CLIPS = ["idle", "Jump Slam"];

const webp = (from, to, ...args) => execFileSync("cwebp", ["-quiet", "-m", "6", ...args, from, "-o", to]);
const pngHeight = file => fs.readFileSync(file).readUInt32BE(20);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "Charms"), { recursive: true });
fs.mkdirSync(path.join(out, "Effects"), { recursive: true });

const charms = path.join(repo, "Charms", "hd");
for (const file of fs.readdirSync(charms).filter(f => f.endsWith(".png"))) {
  const from = path.join(charms, file);
  const resize = pngHeight(from) > MAX_CHARM_HEIGHT ? ["-resize", "0", String(MAX_CHARM_HEIGHT)] : [];
  webp(from, path.join(out, "Charms", file.replace(/\.png$/, ".webp")), "-q", "90", "-alpha_q", "100", ...resize);
}

const effects = path.join(repo, "Effects");
for (const file of fs.readdirSync(effects).filter(f => /^Bat-\d\.png$/.test(f))) fs.copyFileSync(path.join(effects, file), path.join(out, "Effects", file));
webp(path.join(effects, "Concrete.jpg"), path.join(out, "Effects", "Concrete.webp"), "-q", "82");
webp(path.join(effects, "HulkSkin.png"), path.join(out, "Effects", "HulkSkin.webp"), "-q", "90");
fs.writeFileSync(path.join(out, "Effects", "HulkModel.glb"), slimGlb(fs.readFileSync(path.join(effects, "HulkModel.glb")), HULK_CLIPS));
fs.writeFileSync(path.join(out, "Effects", "CREDITS.md"), fs.readFileSync(path.join(effects, "CREDITS.md"), "utf8") + `
## In the Windows app

Its copies are smaller: the charms, Concrete and HulkSkin are WebP, and
HulkModel.glb is without its own texture and its animations other than
${HULK_CLIPS.map(c => `"${c}"`).join(" and ")}. Made by windows/scripts/make-art.mjs.
`);

for (const dir of ["Charms", "Effects"]) {
  const files = fs.readdirSync(path.join(out, dir));
  const size = files.reduce((sum, f) => sum + fs.statSync(path.join(out, dir, f)).size, 0);
  console.log(`art/${dir}: ${files.length} files, ${(size / 1e6).toFixed(2)} MB`);
}

/**
 * A GLB without its images and textures, and with only the animations named:
 * the accessors and buffer views nothing uses any more are dropped and the
 * binary chunk packed again.
 */
function slimGlb(glb, keepClips) {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = glb.subarray(28 + jsonLength, 28 + jsonLength + glb.readUInt32LE(20 + jsonLength));

  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.pbrMetallicRoughness?.baseColorTexture;
    delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
    for (const t of ["normalTexture", "occlusionTexture", "emissiveTexture"]) delete m[t];
  }
  json.animations = (json.animations ?? []).filter(a => keepClips.includes(a.name));

  // Every reference to an accessor, so they can be renumbered once the unused are gone.
  const refs = [];
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      for (const k of Object.keys(p.attributes)) refs.push([p.attributes, k]);
      if (p.indices != null) refs.push([p, "indices"]);
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) refs.push([t, k]);
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices != null) refs.push([skin, "inverseBindMatrices"]);
  for (const a of json.animations) for (const s of a.samplers) refs.push([s, "input"], [s, "output"]);

  const accessorMap = new Map();
  const accessors = [];
  for (const [holder, key] of refs) {
    const old = holder[key];
    if (!accessorMap.has(old)) { accessorMap.set(old, accessors.length); accessors.push(json.accessors[old]); }
    holder[key] = accessorMap.get(old);
  }

  // The buffer views those accessors read, copied into a fresh binary chunk, each on a 4-byte boundary.
  const viewMap = new Map();
  const views = [];
  const chunks = [];
  let offset = 0;
  const keepView = old => {
    if (viewMap.has(old)) return viewMap.get(old);
    const view = { ...json.bufferViews[old] };
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    view.buffer = 0;
    view.byteOffset = offset;
    chunks.push(bytes);
    offset += bytes.length;
    viewMap.set(old, views.length);
    views.push(view);
    return viewMap.get(old);
  };
  for (const a of accessors) {
    if (a.bufferView != null) a.bufferView = keepView(a.bufferView);
    if (a.sparse) {
      a.sparse.indices.bufferView = keepView(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = keepView(a.sparse.values.bufferView);
    }
  }
  json.accessors = accessors;
  json.bufferViews = views;
  const newBin = Buffer.concat([...chunks, Buffer.alloc((4 - (offset % 4)) % 4)]);
  json.buffers = [{ byteLength: newBin.length }];

  let text = Buffer.from(JSON.stringify(json), "utf8");
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + newBin.length, 8);
  const chunkHeader = (length, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(length, 0);
    h.write(type, 4, "ascii");
    return h;
  };
  return Buffer.concat([header, chunkHeader(text.length, "JSON"), text, chunkHeader(newBin.length, "BIN\0"), newBin]);
}
