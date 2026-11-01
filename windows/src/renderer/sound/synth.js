// Sound effects, as in the Mac app's Sounds.swift: synthesised once at launch
// rather than shipped as recordings. A thwip or a splat is little more than
// filtered noise with a falling pitch. Each sound is a Float32Array of mono
// samples at RATE.

export const RATE = 44100;

export const EFFECTS = [
  "thwip", "thwipHeavy", "splat", "whoosh", "pop", "reel", "blast", "unweb",
  "clank", "flutter", "flock", "zap",
  "roar", "slam", "crash", "rubble",
  "lash", "slurp", "gulp", "hiss", "ooze",
  "thunder", "rain", "crackle",
];

export function render(effect) {
  switch (effect) {
    case "thwip": return thwip(1, 11);
    case "thwipHeavy": return thwip(0.72, 12);
    case "splat": return splat(21);
    case "whoosh": return whoosh(0.55, 31);
    case "pop": return pop(41);
    case "reel": return sweep(0.22, 900, 3000, 3, 0.35, 51);
    case "blast": return blast(61);
    case "unweb": return sweep(0.6, 2200, 420, 2.5, 0.3, 71);
    case "clank": return clank(91);
    case "flutter": return flutter(2.6, 101);
    case "flock": return flutter(1.8, 111);
    case "zap": return zap(121);
    case "roar": return roar(131);
    case "slam": return slam(141);
    case "crash": return crash(151);
    case "rubble": return rubble(1.3, 161);
    case "lash": return thwip(0.42, 171);
    case "slurp": return slurp(0.5, 181);
    case "gulp": return gulp(191);
    case "hiss": return hiss(201);
    case "ooze": return ooze(1.9, 211);
    case "thunder": return thunder(171);
    case "rain": return rain(5.2, 181);
    case "crackle": return crackle(0.95, 191);
    default: return new Float32Array(0);
  }
}

// Building blocks.

/** Samples `f` over time, then scales to `peak` and fades the last few milliseconds so nothing ends on a click. */
function shape(seconds, peak, f) {
  const n = Math.trunc(seconds * RATE);
  const s = new Float32Array(n);
  let top = 0;
  for (let i = 0; i < n; i++) {
    s[i] = f(i / RATE);
    top = Math.max(top, Math.abs(s[i]));
  }
  if (top <= 0) return s;
  const fade = Math.min(n, Math.trunc(0.003 * RATE));
  for (let i = 0; i < n; i++) {
    s[i] *= peak / top;
    const left = n - 1 - i;
    if (left < fade) s[i] *= left / fade;
  }
  return s;
}

/** Exponential glide from `a` to `b` over `over` seconds, then held. */
const glide = (a, b, t, over) => a * Math.pow(b / a, Math.min(Math.max(t, 0) / over, 1));

/** Linear attack into an exponential decay. */
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** Seeded white noise, so every launch sounds the same. */
function noise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) / (1 << 23) - 1;
  };
}

/** Zavalishin's topology-preserving state-variable filter. It stays stable while its cutoff sweeps, which is most of what these sounds do. */
function svf() {
  let ic1 = 0, ic2 = 0;
  const out = { low: 0, band: 0, high: 0 };
  return (x, cutoff, q) => {
    const g = Math.tan(Math.PI * Math.min(cutoff, RATE * 0.45) / RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out.low = v2; out.band = v1; out.high = x - k * v1 - v2;
    return out;
  };
}

// The sounds.

/** The tongue reeling a window in: wet, bubbling suction, rising. */
function slurp(d, seed) {
  const n = noise(seed), suck = svf(), wet = svf();
  return shape(d, 0.6, t => {
    const x = n();
    const bubble = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 26);
    const s = suck(x, glide(450, 1900, t, d), 5).band * bubble;
    const drip = wet(Math.abs(x) > 0.993 ? x * 5 : 0, 1400, 4).band;
    return (s + 0.5 * drip) * Math.sin(Math.PI * t / d);
  });
}

/** A window swallowed: a throaty drop in pitch, then a smaller second gulp. */
function gulp(seed) {
  const n = noise(seed), throat = svf();
  let phase = 0;
  return shape(0.42, 0.8, t => {
    const second = t >= 0.2;
    const u = second ? t - 0.2 : t;
    phase += 2 * Math.PI * glide(second ? 160 : 240, second ? 70 : 85, u, 0.1) / RATE;
    const body = (Math.sin(phase) + 0.3 * Math.sin(2 * phase)) * env(u, 0.004, second ? 0.04 : 0.06);
    const wet = throat(n(), glide(900, 300, u, 0.08), 3).band * env(u, 0.002, 0.03);
    return (body + 0.5 * wet) * (second ? 0.6 : 1);
  });
}

/** Venom's snarl as the symbiote breaks loose: a long hiss over a low, rattling growl. */
function hiss(seed) {
  const n = noise(seed), air = svf(), throat = svf();
  let phase = 0;
  const d = 1.1;
  return shape(d, 0.7, t => {
    const x = n();
    const h = air(x, glide(5200, 2600, t, d), 0.8).high;
    phase += 2 * Math.PI * (62 + 8 * Math.sin(t * 31)) / RATE;
    let buzz = 0;
    for (let k = 1; k <= 7; k++) buzz += Math.sin(k * phase) / k;
    const growl = throat(Math.tanh(3 * buzz) * (0.7 + 0.3 * x), 600, 1.8).band;
    const level = Math.min(1, t / 0.08) * Math.min(1, (d - t) / 0.5);
    return (0.7 * h + 1.1 * growl) * level;
  });
}

/** The symbiote crawling over the glass: thick, gurgling, squelching goo. */
function ooze(d, seed) {
  const n = noise(seed), gurgle = svf(), body = svf();
  return shape(d, 0.5, t => {
    const x = n();
    const fc = 320 + 230 * Math.sin(t * 23) * Math.sin(t * 7.3) + 90 * Math.sin(t * 61);
    const g = gurgle(x, fc, 7).band;
    const rumble = body(x, 140, 0.9).low;
    const level = Math.min(1, t / 0.25) * Math.min(1, (d - t) / 0.6);
    return (g + 1.4 * rumble) * level;
  });
}

/** The Hulk's roar: a ragged growl of clipped harmonics, its pitch heaving, through a throat of shifting formants, over rasping breath. */
function roar(seed) {
  const n = noise(seed), low = svf(), high = svf(), breath = svf();
  let phase = 0;
  const d = 1.25;
  return shape(d, 0.8, t => {
    const u = t / d;
    phase += 2 * Math.PI * (92 + 30 * Math.sin(Math.PI * u) + 9 * Math.sin(t * 37)) / RATE;
    let buzz = 0;
    for (let k = 1; k <= 9; k++) buzz += Math.sin(k * phase) / k;
    const rough = Math.tanh(2.6 * buzz) * (0.8 + 0.2 * n());
    const throat = low(rough, 520 + 300 * Math.sin(Math.PI * u), 2.2).band + 0.7 * high(rough, 1300 + 500 * u, 3).band;
    const rasp = breath(n(), 900, 0.8).band;
    const level = Math.min(1, t / 0.06) * Math.min(1, (d - t) / 0.35);
    return (1.6 * throat + 0.5 * rasp) * level;
  });
}

/** A window slammed into the floor: a deep boom, a crunch, and debris. */
function slam(seed) {
  const n = noise(seed), crunch = svf(), debris = svf();
  let boom = 0;
  return shape(0.5, 0.85, t => {
    boom += 2 * Math.PI * glide(75, 32, t, 0.12) / RATE;
    const x = n();
    const hit = crunch(x, glide(3000, 400, t, 0.08), 0.9).low * env(t, 0.001, 0.05);
    const bits = debris(Math.abs(x) > 0.985 ? x * 5 : 0, 2500, 2).band * env(t - 0.02, 0.01, 0.12);
    return 1.3 * Math.sin(boom) * env(t, 0.001, 0.12) + 0.9 * hit + 0.4 * bits;
  });
}

/** A fist into concrete: a deep boom, a heavy crunch, grit spraying, and chunks clattering after. */
function crash(seed) {
  const n = noise(seed), crunch = svf(), grit = svf(), clatter = svf();
  let boom = 0;
  return shape(0.9, 0.9, t => {
    boom += 2 * Math.PI * glide(62, 28, t, 0.18) / RATE;
    const x = n();
    const hit = crunch(x, glide(2400, 260, t, 0.12), 0.8).low * env(t, 0.001, 0.09);
    const sand = grit(x, 3200, 0.6).band * env(t, 0.004, 0.25);
    const bits = clatter(Math.abs(x) > 0.982 ? x * 5 : 0, 1400, 2.5).band * env(t - 0.03, 0.01, 0.3);
    return 1.4 * Math.sin(boom) * env(t, 0.001, 0.2) + hit + 0.35 * sand + 0.6 * bits;
  });
}

/** Smashed concrete falling away: a low rumble under a clatter of chunks landing, thinning out as it goes. */
function rubble(d, seed) {
  const n = noise(seed), rumbleF = svf(), knock = svf();
  let next = 0, from = -1, pitch = 600, level = 0;
  return shape(d, 0.6, t => {
    const x = n();
    if (t >= next) {
      from = t;
      pitch = 300 + 900 * Math.abs(n());
      level = 0.4 + 0.6 * Math.abs(n());
      next = t + (0.02 + 0.07 * Math.abs(n())) * (1 + 2 * t / d);
    }
    const clack = knock(x, pitch, 4).band * env(t - from, 0.001, 0.03) * level;
    const low = rumbleF(x, 160, 0.7).low;
    const fade = Math.min(1, (d - t) / (0.6 * d));
    return (1.6 * clack + 0.7 * low) * fade;
  });
}

/** A window gone into the Batman charm: a bright zip diving in pitch over a glassy chime and a soft thump. */
function zap(seed) {
  const n = noise(seed), zip = svf();
  let thump = 0;
  return shape(0.5, 0.6, t => {
    const z = zip(n(), glide(5200, 700, t, 0.18), 6).band * env(t, 0.002, 0.07);
    const chime = (Math.sin(2 * Math.PI * 1860 * t) + 0.6 * Math.sin(2 * Math.PI * 2790 * t) + 0.35 * Math.sin(2 * Math.PI * 4170 * t))
      * env(t, 0.001, 0.16);
    thump += 2 * Math.PI * glide(120, 55, t, 0.08) / RATE;
    return 1.3 * z + 0.25 * chime + 0.7 * Math.sin(thump) * env(t, 0.001, 0.06);
  });
}

/** The grapple biting: a hard tick, a few inharmonic metal partials ringing down fast, and a low knock. */
function clank(seed) {
  const n = noise(seed), tick = svf();
  let knock = 0;
  const partials = [[540, 0.11, 1], [1290, 0.07, 0.7], [2230, 0.045, 0.5], [3570, 0.03, 0.35]];
  return shape(0.32, 0.7, t => {
    let ring = 0;
    for (const [f, decay, lv] of partials) ring += lv * Math.sin(2 * Math.PI * f * t) * env(t, 0.0005, decay);
    knock += 2 * Math.PI * glide(140, 60, t, 0.05) / RATE;
    return 0.5 * ring + 0.8 * Math.sin(knock) * env(t, 0.001, 0.04)
      + 0.7 * tick(n(), 4000, 0.7).high * env(t, 0.0003, 0.003);
  });
}

/**
 * A swarm going past: rustling wings — noise chopped by a dozen wingbeats
 * drifting in and out of step — and the air they move, swelling and passing,
 * with squeaks dotted through it.
 */
function flutter(d, seed) {
  const n = noise(seed), wings = svf(), air = svf();
  const beats = Array.from({ length: 12 }, () => ({ rate: 9 + 7 * Math.abs(n()), phase: n() * Math.PI }));
  let squeakAt = 0.08, squeakFrom = 0, squeakPitch = 6000, squeakPhase = 0;
  return shape(d, 0.6, t => {
    const x = n();
    let flap = 0;
    for (const b of beats) flap += Math.abs(Math.sin(2 * Math.PI * b.rate * t + b.phase));
    const rustle = wings(x, 1500, 0.9).band * Math.pow(flap / beats.length, 2.5);
    const gust = air(x, 500, 0.7).low;
    if (t >= squeakAt) {
      squeakFrom = t;
      squeakPitch = 5200 + 2600 * Math.abs(n());
      squeakAt = t + 0.06 + 0.14 * Math.abs(n());
    }
    const s = t - squeakFrom;
    squeakPhase += 2 * Math.PI * glide(squeakPitch, squeakPitch * 0.6, s, 0.035) / RATE;
    const squeak = s < 0.04 ? Math.sin(squeakPhase) * env(s, 0.004, 0.012) : 0;
    const swell = Math.min(1, t / 0.3) * Math.min(1, (d - t) / 1.0);
    return (1.2 * rustle + 0.5 * gust + 0.12 * squeak) * swell;
  });
}

/** The shot: a breath of hiss, then resonant noise whose pitch drops — the drop is what turns a hiss into a zip — over a faint falling whistle. */
function thwip(p, seed) {
  const n = noise(seed), hissF = svf(), zip = svf();
  let phase = 0;
  return shape(0.22, 0.8, t => {
    const x = n();
    const th = hissF(x, 3200 * p, 0.7).high * env(t, 0.002, 0.022);
    const w = zip(x, glide(4800 * p, 1000 * p, t - 0.008, 0.13), 7).band * (t < 0.008 ? 0 : env(t - 0.008, 0.01, 0.05));
    phase += 2 * Math.PI * glide(2600 * p, 800 * p, t, 0.12) / RATE;
    const whistle = Math.sin(phase) * env(t, 0.004, 0.035);
    return 0.45 * th + 1.6 * w + 0.12 * whistle;
  });
}

/** The web sticking: a muffled burst closing down fast, a low thump, and sparse crackle for the wet, tacky part. */
function splat(seed) {
  const n = noise(seed), body = svf(), wet = svf();
  let phase = 0;
  return shape(0.28, 0.75, t => {
    const x = n();
    const mush = body(x, glide(2600, 220, t, 0.09), 1.1).low * env(t, 0.002, 0.06);
    const crack = wet(Math.abs(x) > 0.992 ? x * 6 : 0, 1800, 3).band * env(t, 0.001, 0.07);
    phase += 2 * Math.PI * glide(150, 50, t, 0.07) / RATE;
    const thump = Math.sin(phase) * env(t, 0.001, 0.045);
    return mush + 0.6 * crack + 0.9 * thump;
  });
}

/** The pull: air rising in pitch and swelling as the window rushes in, cut off at the catch. */
function whoosh(d, seed) {
  const n = noise(seed), low = svf(), high = svf();
  return shape(d, 0.55, t => {
    const x = n();
    const fc = glide(320, 2600, t, d * 0.9);
    const air = low(x, fc, 1.6).band + 0.5 * high(x, fc * 1.7, 2.2).band;
    const u = t / d;
    return air * (u < 0.88 ? Math.pow(u / 0.88, 1.6) : (1 - u) / 0.12);
  });
}

/** The catch: a short dropping blip over a soft thud, with a tick on top. */
function pop(seed) {
  const n = noise(seed), tick = svf();
  let blip = 0, sub = 0;
  return shape(0.14, 0.7, t => {
    blip += 2 * Math.PI * glide(680, 300, t, 0.05) / RATE;
    sub += 2 * Math.PI * glide(170, 80, t, 0.06) / RATE;
    return Math.sin(blip) * env(t, 0.001, 0.028)
      + 0.8 * Math.sin(sub) * env(t, 0.001, 0.05)
      + 0.6 * tick(n(), 5000, 0.7).high * env(t, 0.0005, 0.004);
  });
}

/** The screen being webbed: a bigger, longer splat with a deep thump and a bright sheet of hiss for the flash. */
function blast(seed) {
  const n = noise(seed), body = svf(), wet = svf(), sheet = svf();
  let phase = 0;
  return shape(1.1, 0.85, t => {
    const x = n();
    const mush = body(x, glide(5200, 300, t, 0.35), 0.9).low * env(t, 0.003, 0.22);
    const crack = wet(Math.abs(x) > 0.99 ? x * 6 : 0, 2200, 2.5).band * env(t, 0.005, 0.25);
    const h = sheet(x, 4000, 0.7).high * env(t, 0.004, 0.12);
    phase += 2 * Math.PI * glide(95, 38, t, 0.25) / RATE;
    const thump = Math.sin(phase) * env(t, 0.002, 0.16);
    return mush + 0.6 * crack + 0.25 * h + 1.1 * thump;
  });
}

/**
 * Thunder: a sharp crack of high noise, a deep boom, then a long rumble rolling
 * on as the sound comes back off the clouds, in swells that each die a little
 * lower than the last.
 */
function thunder(seed) {
  const n = noise(seed), crack = svf(), roll = svf(), deep = svf();
  let boom = 0;
  const d = 3.4;
  const swells = [];
  for (let k = 0; k < 7; k++) {
    const jitter = 0.15 * Math.abs(n());
    swells.push([0.08 + 0.4 * k + jitter, 0.9 - 0.11 * k]);
  }
  return shape(d, 0.9, t => {
    const x = n();
    const snap = crack(x, glide(6500, 900, t, 0.12), 0.8).high * env(t, 0.0005, 0.035);
    boom += 2 * Math.PI * glide(78, 34, t, 0.35) / RATE;
    let rumble = 0;
    for (const [at, level] of swells) if (t >= at) rumble += level * env(t - at, 0.09, 0.34);
    const body = roll(x, glide(520, 130, t, d), 0.7).low;
    const sub = deep(x, 70, 0.8).low;
    const tail = Math.min(1, (d - t) / 0.8);
    return (0.7 * snap + 1.2 * Math.sin(boom) * env(t, 0.002, 0.3) + (2.4 * body + 4 * sub) * rumble) * tail;
  });
}

/** Steady rain: a wide hiss of noise with a softer patter in the mids, swelling in as the sky closes and out as it clears. */
function rain(d, seed) {
  const n = noise(seed), hissF = svf(), patter = svf();
  return shape(d, 0.4, t => {
    const x = n();
    const spray = hissF(x, 5200, 0.6).high;
    const drops = patter(Math.abs(x) > 0.93 ? x * 3 : 0, 2400, 1.2).band;
    const swell = Math.min(1, t / 0.7) * Math.min(1, (d - t) / 1.2);
    return (0.8 * spray + 0.9 * drops) * swell;
  });
}

/** Electricity arcing: sharp random snaps of high noise, thick and quick, over a thin buzz, swelling in as the charge builds. */
function crackle(d, seed) {
  const n = noise(seed), snap = svf(), buzz = svf();
  let next = 0, from = -1, level = 0;
  return shape(d, 0.6, t => {
    const x = n();
    if (t >= next) {
      from = t;
      level = 0.4 + 0.6 * Math.abs(n());
      next = t + 0.008 + 0.045 * Math.abs(n());
    }
    const spark = snap(x, 4200, 0.7).high * env(t - from, 0.0004, 0.006) * level;
    const hum = buzz(x, 1700, 3).band * 0.12;
    const swell = Math.min(1, 0.35 + t / 0.3) * Math.min(1, (d - t) / 0.2);
    return (2 * spark + hum) * swell;
  });
}

/** A soft zip of resonant noise gliding between two pitches, used for the web reeling back in and for letting go of the screen. */
function sweep(d, a, b, q, peak, seed) {
  const n = noise(seed), filter = svf();
  return shape(d, peak, t => {
    const s = Math.sin(Math.PI * t / d);
    return filter(n(), glide(a, b, t, d), q).band * s * s;
  });
}
