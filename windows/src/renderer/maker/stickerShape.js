// Measures a sticker from its alpha, one byte a pixel, rows top first, as in
// the Mac app's StickerShape.swift: the box to trim it to, and where its chain
// should fix on.

/** The smallest box holding everything more than faintly opaque, or null. */
export function opaqueBounds(alpha, width, height, threshold = 8) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Where the chain fixes on, as a fraction of the sticker: the highest solid
 * point near the line its weight balances on, so it hangs from the top of the
 * subject, not from an empty corner or down in a notch.
 */
export function attachPoint(alpha, width, height) {
  let sum = 0, weight = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const a = alpha[row + x];
      sum += a * x;
      weight += a;
    }
  }
  const centre = weight > 0 ? sum / weight : width / 2;
  const band = Math.max(1, Math.trunc(width * 0.15));
  const from = Math.max(0, Math.trunc(centre) - band), to = Math.min(width - 1, Math.trunc(centre) + band);
  let best = null;
  for (let x = from; x <= to; x++) {
    let y = 0;
    while (y < height && alpha[y * width + x] < 128) y++;
    if (y === height) continue;
    if (best && (y > best.y || (y === best.y && Math.abs(x - centre) >= Math.abs(best.x - centre)))) continue;
    best = { x, y };
  }
  if (!best) return { x: 0.5, y: 0 };
  return { x: (best.x + 0.5) / width, y: best.y / height };
}
