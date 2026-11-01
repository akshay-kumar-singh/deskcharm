// What every charm is and does, shared by the main process (the tray menu) and
// the charm window. As in the Mac app's main.swift (CharmHang), Webs.swift
// (WebHands), Venom.swift (VenomGear) and CustomCharms.swift (Power).

/** Each power is a pair of effects: one for a double-click, one for being thrown about hard. */
export const POWERS = ["spiderMan", "batman", "hulk", "venom", "thor"];

export const DOUBLE_CLICK_TITLES = {
  spiderMan: "Spider-Man: web yank",
  batman: "Batman: grapple tow",
  hulk: "Hulk: window smash",
  venom: "Venom: tongue grab",
  thor: "Thor: lightning strike",
};

export const SHAKE_TITLES = {
  spiderMan: "Spider-Man: web blast",
  batman: "Batman: bat swarm",
  hulk: "Hulk: wall smash",
  venom: "Venom: symbiote crawl",
  thor: "Thor: thunderstorm",
};

/** The built-in charms' own hero, by file name. */
const OWN = {
  "Spider-Man": "spiderMan", "Spider-Man-Swinging": "spiderMan",
  "Bat-Man": "batman", "Hulk": "hulk", "Venom": "venom", "Thor": "thor",
};

/** What `charm` does when double-clicked and when thrown about. `charm` is {key, custom?}. */
export function powersOf(charm) {
  if (charm?.custom) return { doubleClick: charm.custom.doubleClick ?? null, shake: charm.custom.shake ?? null };
  const own = OWN[charm?.key] ?? null;
  return { doubleClick: own, shake: own };
}

export const hasPowers = p => p.doubleClick !== null || p.shake !== null;
export const usesPower = (p, power) => p.doubleClick === power || p.shake === power;

/**
 * Where each charm's chain is fixed, as a fraction of its artwork, and how far
 * the artwork is turned from upright to hang from there (radians, clockwise on
 * screen). Most hang upright from the middle of their top edge.
 */
const HANG = {
  // From the loose end of his web, turned so his weight sits straight under
  // it: the web then leads down from the chain into his fist.
  "Spider-Man-Swinging": { attach: { x: 0.012, y: 0.003 }, tilt: 0.46 },
  // From the tip of his raised claw, turned so his weight hangs under it.
  "Venom": { attach: { x: 0.169, y: 0.002 }, tilt: 0.393 },
  // From the top of the rope he hangs on, turned so his weight sits nearly
  // under it and the rope runs up the chain.
  "Thor": { attach: { x: 0.097, y: 0 }, tilt: -0.25 },
};

export function hangOf(charm) {
  // A sticker hangs from the top of its subject, found when it was made.
  if (charm?.custom) return { attach: { x: charm.custom.attachX, y: charm.custom.attachY }, tilt: 0 };
  return HANG[charm?.key] ?? { attach: { x: 0.5, y: 0 }, tilt: 0 };
}

/** Where each Spider-Man charm's hands are, as fractions of its artwork; a custom charm's webs leave from its middle, a little high. */
const HANDS = {
  "Spider-Man": [{ x: 0.50, y: 0.28 }],                         // clasped on the rope
  "Spider-Man-Swinging": [{ x: 0.30, y: 0.20 }, { x: 0.95, y: 0.66 }],  // raised fist, open hand
};
export const webHands = key => HANDS[key] ?? [{ x: 0.5, y: 0.42 }];

/** Where Venom's tongue lashes from: the curl of the one already hanging out of his mouth. A custom charm's lower middle. */
export const venomMouth = key => (key === "Venom" ? { x: 0.31, y: 0.465 } : { x: 0.5, y: 0.72 });
/** The tongue's half-width at its root, as a fraction of the charm's height: his own is slight, a sticker's bolder. */
export const tongueWidth = key => (key === "Venom" ? 0.022 : 0.04);

export const SIZES = [["Small", 140], ["Medium", 200], ["Large", 270], ["Huge", 340]];
export const CHAINS = [["Short", 150], ["Medium", 240], ["Long", 340], ["Very long", 440]];
export const POSITIONS = [["Left", 0], ["Centre", 0.5], ["Right", 1]];

/** A built-in charm's name in the menu: its file name, spaced out. */
export const titleOf = key => key.replace(/-/g, " ");
