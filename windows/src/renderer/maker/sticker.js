import { attachPoint, opaqueBounds } from "./stickerShape.js";

// Turns a picture into a die-cut sticker, as the Mac app's Sticker.swift: the
// subject ringed with a white border and a faint rim, trimmed to fit, and
// measured for where its chain fixes on.
//
// Windows has nothing like the Mac's Vision to lift a subject off its
// background, so a picture that already has a transparent background (a PNG
// cut out in Paint, say) keeps its shape, and any other becomes a rounded card.

/** The long side a picture is worked at, and the most a sticker keeps: twice the largest charm, so it stays sharp. */
const WORK_SIDE = 1400;
const KEEP_SIDE = 760;

function canvas(width, height) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

/** Whether a fair part of the picture is see-through: then it's already cut out. */
function cutOut(picture) {
  const { data } = picture.getContext("2d").getImageData(0, 0, picture.width, picture.height);
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) clear++;
  return clear > picture.width * picture.height * 0.01;
}

/** The whole picture with its corners rounded off. */
function card(picture) {
  const out = canvas(picture.width, picture.height);
  const ctx = out.getContext("2d");
  const corners = new Path2D();
  corners.roundRect(0, 0, picture.width, picture.height, 0.08 * Math.min(picture.width, picture.height));
  ctx.clip(corners);
  ctx.drawImage(picture, 0, 0);
  return out;
}

/** The picture's shape grown outward by `r`, in one colour: the border behind it. */
function silhouette(body, r, colour, pad) {
  const shape = canvas(body.width, body.height);
  const s = shape.getContext("2d");
  s.drawImage(body, 0, 0);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = colour;
  s.fillRect(0, 0, shape.width, shape.height);
  const out = canvas(body.width + 2 * pad, body.height + 2 * pad);
  const o = out.getContext("2d");
  // Grown by stamping the shape all round a disc of radius r.
  for (const ring of [1, 0.75, 0.5, 0.25]) {
    const rr = r * ring;
    const steps = Math.max(8, Math.ceil(2 * Math.PI * rr / 1.5));
    for (let k = 0; k < steps; k++) {
      const a = k / steps * 2 * Math.PI;
      o.drawImage(shape, pad + rr * Math.cos(a), pad + rr * Math.sin(a));
    }
  }
  o.drawImage(shape, pad, pad);
  return out;
}

function alphaOf(c) {
  const { data } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  const alpha = new Uint8Array(c.width * c.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

/**
 * The sticker made from `blob`: {canvas, attach, cutOut}, where `attach` is
 * where the chain fixes on as a fraction of it, and `cutOut` whether the
 * picture's own shape was kept.
 */
export async function makeSticker(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file couldn't be read as a picture.");
  }
  const scale = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
  const picture = canvas(Math.floor(bitmap.width * scale), Math.floor(bitmap.height * scale));
  const p = picture.getContext("2d", { willReadFrequently: true });
  p.imageSmoothingQuality = "high";
  p.drawImage(bitmap, 0, 0, picture.width, picture.height);

  const lifted = cutOut(picture);
  const body = lifted ? picture : card(picture);
  const border = Math.max(6, 0.028 * Math.max(body.width, body.height));
  const pad = Math.ceil(border * 2);
  const white = silhouette(body, border, "#ffffff", pad);
  const rim = silhouette(body, border + Math.max(1.5, border * 0.07), "#000000", pad);

  const full = canvas(body.width + 2 * pad, body.height + 2 * pad);
  const f = full.getContext("2d", { willReadFrequently: true });
  f.filter = "blur(0.7px)";
  f.globalAlpha = 0.16;
  f.drawImage(rim, 0, 0);
  f.globalAlpha = 1;
  f.drawImage(white, 0, 0);
  f.filter = "none";
  f.drawImage(body, pad, pad);

  // Cut to what's opaque, brought down to the size kept, and measured for where the chain goes.
  const box = opaqueBounds(alphaOf(full), full.width, full.height);
  if (!box) throw new Error("There's nothing in that picture to make a sticker of.");
  const k = Math.min(1, KEEP_SIDE / Math.max(box.width, box.height));
  const kept = canvas(box.width * k, box.height * k);
  const c = kept.getContext("2d", { willReadFrequently: true });
  c.imageSmoothingQuality = "high";
  c.drawImage(full, box.x, box.y, box.width, box.height, 0, 0, kept.width, kept.height);
  return { canvas: kept, attach: attachPoint(alphaOf(kept), kept.width, kept.height), cutOut: lifted };
}
