// Random numbers come from an `rng`: a function returning [0, 1). Math.random
// in the app; seeded in the tests, so they see the same storm every run.

/** Mulberry32: small, fast and well spread, for seeded runs. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from lo to hi, as Swift's .random(in: lo...hi). */
export const rand = (rng, lo, hi) => lo + (hi - lo) * rng();
/** A whole number from lo to hi, both included. */
export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const coin = rng => rng() < 0.5;

export function shuffled(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
