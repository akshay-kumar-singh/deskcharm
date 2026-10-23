// Each charm's art size, and where its chain is fixed as a fraction of the
// art and how far it's turned to hang from there (CharmHang in main.swift).
// The art in public/charms is Charms/hd resized to 560 px and saved as WebP.
const ART = [
  { id: "Spider-Man", name: "Spider-Man", w: 1068, h: 1660, power: "spider" },
  { id: "Bat-Man", name: "Batman", w: 994, h: 650, power: "bat" },
  { id: "Hulk", name: "The Hulk", w: 944, h: 1086, power: "hulk" },
  { id: "Thor", name: "Thor", w: 1024, h: 1466, attach: [0.097, 0], tilt: -0.25, power: "thor" },
  { id: "Venom", name: "Venom", w: 736, h: 1459, attach: [0.169, 0.002], tilt: 0.393, power: "venom" },
  { id: "Spider-Man-Swinging", name: "Spider-Man, swinging", w: 978, h: 1760, attach: [0.012, 0.003], tilt: 0.46, power: "spider" },
  { id: "Iron-Man", name: "Iron Man", w: 738, h: 1172 },
  { id: "Captain-America", name: "Captain America", w: 984, h: 1112 },
  { id: "Super-Man", name: "Superman", w: 964, h: 938 },
  { id: "Wonder-Women", name: "Wonder Woman", w: 852, h: 784 },
  { id: "Flash", name: "The Flash", w: 540, h: 1362 },
  { id: "Green-Lantern", name: "Green Lantern", w: 754, h: 952 },
];

export const CHARMS = ART.map(c => ({ attach: [0.5, 0], tilt: 0, ...c, src: `charms/${c.id}.webp` }));
export const byId = id => CHARMS.find(c => c.id === id);

// A charm's art drawn at size S, set by area.
export function dims(c, S) { const k = S / Math.sqrt(c.w * c.h); return [c.w * k, c.h * k]; }

// The art loaded as an Image, for drawing on a canvas.
const images = new Map();
export function charmImage(c) {
  if (!images.has(c.id)) { const img = new Image(); img.src = c.src; images.set(c.id, img); }
  return images.get(c.id);
}

export const POWERS = {
  spider: { charm: "Spider-Man", name: "Spider-Man", sub: "Your friendly neighbourhood window remover.",
    dbl: ["Web yank", "A web shoots out, sticks to the window you're in and yanks it into his hand. The app hides as it arrives."],
    shake: ["Web blast", "Throw him about hard for a couple of seconds and a web spreads across your whole screen for five seconds, with a flash."] },
  bat: { charm: "Bat-Man", name: "Batman", sub: "Prepared for every window.",
    dbl: ["Bat tow", "A grapple fires into the front window and a stream of bats pours out to circle it. Then the window pours down the line into the charm, like a genie into its lamp."],
    shake: ["Bat swarm", "Thousands of bats burst up from the bottom of the screen, all but cover it, and are gone over the top in three and a half seconds."] },
  hulk: { charm: "Hulk", name: "The Hulk", sub: "Puny window.",
    dbl: ["Hulk smash", "The Hulk drops in, in 3D, rips the window out by one edge and slams it into the floor, left, right, left, right. Then he hurls it into the charm."],
    shake: ["Wall smash", "Three blows punch into your screen as if it were concrete: craters, cracks forking across it, chunks and dust. Then it crumbles away."] },
  thor: { charm: "Thor", name: "Thor", sub: "Bring me that window.",
    dbl: ["Mjolnir recall", "The sky closes in and lightning strikes the window's title bar. Crawling with electricity, the window is called back into the charm along a bolt of lightning."],
    shake: ["Thunderstorm", "The sky darkens, rain sheets down and forked lightning flashes, with thunder rolling in behind. The last bolt goes straight into the charm."] },
  venom: { charm: "Venom", name: "Venom", sub: "We are hungry.",
    dbl: ["Tongue grab", "His tongue lashes out, sticks to the window in a splash of slaver and reels it in, faster and faster, into his mouth. Gulp."],
    shake: ["Symbiote", "Glossy black tendrils lunge out of a pool welling from the charm and thrash across your screen, then get sucked back in, heads first."] },
};
