export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
// How far t is through a..b, as 0..1.
export const span = (t, a, b) => clamp((t - a) / (b - a));
export const easeIn = t => t * t * t, easeOut = t => 1 - (1 - t) ** 3;
export const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
// A seeded random number generator, 0..1.
export function rng(seed) { return () => (seed = seed * 16807 % 2147483647) / 2147483647; }
