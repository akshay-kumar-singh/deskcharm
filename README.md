# DeskCharm

A charm that hangs off the top of your screen on a gold chain and swings with
real physics. Built for this machine only.

## Run

```bash
./build.sh          # compile + bundle
open DeskCharm.app  # run
```

It lives in the menu bar as `✦` — no Dock icon, no window chrome.

## Use

- **Drag the charm** to swing it. Let go and it carries momentum, then settles.
- **Double-click Spider-Man** (either Spider-Man charm) and he webs the front
  window, yanks it into his hand and hides its app. Bring it back from the Dock
  or with ⌘-Tab.
- **Throw Spider-Man about hard** for a couple of seconds and he webs the whole
  screen: a flash, then a web across everything for five seconds. It's paint
  only — clicks, typing and focus carry on underneath as normal.
- Spider-Man leaves **afterimages** when he moves fast.
- **Double-click Batman** and a stream of bats pours out from behind the
  charm as it fires a grapple into the front window. The bats reach the window
  as the grapple bites and circle it; then the window is poured down the
  grapple into the charm like a genie into its lamp, the bats' ring sliding
  across to circle the charm, and it goes in a flash. The bats dive in after
  it. The app is hidden, as with the web yank.
- **Throw Batman about hard** and a swarm of bats bursts up from the bottom of
  the screen, all but covering it, and is gone over the top in three and a
  half seconds. Paint only, like the web blast.
- **Double-click the Hulk** and the Hulk, in 3D, drops in at the bottom of
  the screen, cracking the floor, reaches up and rips the front window out of
  its place by one edge, and smashes it into the floor left, right, left,
  right — the way he dealt with Loki — the window flopping like a rubber mat
  and cracking with every slam. Then he hurls it into the charm, where it's
  minimised, and leaps away. The app is hidden, as with the web yank.
- **Throw the Hulk about hard** and three blows punch into the screen as if it
  were a concrete wall: craters, cracks forking across it, chunks and dust
  thrown out. It holds a moment, then the craters crumble away. Paint only.
- **Make your own charm**: `✦` → **Charm** → **New Custom Charm…**. Choose or
  drop in a picture and it's made into a sticker — the subject cut out, with
  a white die-cut border. Name it, then give it any hero's double-click power
  and any hero's shake power: Spider-Man's web yank on a double-click and
  Batman's bat swarm on a shake, say. While it's selected, **On Double-Click**
  and **On Shake** in the menu change its powers, and **Remove** deletes it.
- **Menu bar `✦`** → pick charm, size, chain length, screen position, and (with
  Spider-Man, Batman or the Hulk) turn **Sound Effects** on or off.
- **Quit** from the same menu.

The window is large and transparent, but only accepts clicks while the pointer
is actually over the charm — everything else passes through to what's beneath.
It never takes focus, so the app you were using stays the one in front.

## Web yank

Another app's window can't be moved from outside it, so what flies is a
stand-in, and the app is hidden underneath it the moment it's covered. With
Screen Recording allowed, the stand-in is a snapshot of the real window;
without it, a card with the app's icon and name. Turn it on from
`✦` → **Allow Window Snapshots…** (shown while Spider-Man, Batman or the Hulk
is selected), then relaunch. Because the build is ad-hoc signed, macOS treats every rebuild as a
new app and the permission has to be granted again.

The app is hidden (⌘-H) rather than its window minimised. Minimising another
app's window needs Accessibility, and macOS then plays its own genie into the
Dock over the top of the pull. Hiding a full-screen app also leaves its Space,
so the pull plays during the system's Space transition.

## Web blast

Set off by sustained hard dragging, not by moving the charm about: pointer
travel fills a bucket that drains at 700 pt/s and overflows at 2400 pt, so a
slow drag or a single fling never gets there. The web is drawn on a
click-through overlay that never takes focus, and once it has spread its frame
clock is paused — measured live, it adds no CPU while it holds.

## Bat tow

The web yank's machinery with a different rig: the same window, stand-in and
hiding, but the line is a steel grapple fired from the emblem. The overlay
sits beneath the charm, so the grapple, the window and the flash all seem to
go in and out from behind it.

The window goes like a genie into a lamp: the stand-in is cut into a strip
every 6 pt across the line to the charm, the near strips neck in and go first,
the far ones follow, and each is squeezed to nothing just as it reaches the
charm, which is when the flash goes off. The bats fly one path a beat apart,
so they read as a ribbon: out from behind the charm, round the window on a
tilted ring (passing behind it and in front), the ring sliding across to round
the charm as the window pours into it, and in on the flash. Every cue is tied
to a stage rather than a clock — flutter, clank as the claw bites, whoosh, zap,
pop. With no window to go for, the grapple comes back empty and the bats come
home anyway.

## Hulk smash

The same window, stand-in and hiding again. The Hulk is a rigged 3D model, read
from a .glb by a small glTF loader (`GLTF.swift`) into SceneKit and posed by
hand from his own animations: he crouches into each slam by blending his idle
pose toward the landing of his jump-slam, leans and turns after the window, and
his right arm is steered by two-bone IK to wherever his hand has to be on the
swing. The scene is in points under an orthographic camera, so it lines up
exactly with the 2D layers drawn behind it — the window still in its place, the
cracks in the floor, his shadow — and in front of it, the dust and the flying
concrete.

The window is a sheet (`Cloth.swift`): a grid stepped with Verlet integration
at 240 Hz and kept in shape by shape matching over overlapping strips, its
middle row held to its length and the rest let stretch or squash by a quarter,
so it bends and wobbles like a rubber mat but never crumples or pulls out long.
He holds it by the middle of its left edge and the sheet's own physics decide
where it hits the floor — one slam a swing, five swings — each with cracks
running up from it (`Rubble.swift`), chunks and dust thrown up, the screen and
the charm jolted, and a crack drawn into the window's texture so it bends with
the sheet. Then a wind-up, the throw, and a burst of gamma green as it goes into
the charm.

SceneKit builds its shaders the first time it draws something, and the first
time ever that held up his entrance by a tenth to a fifth of a second, so he's
drawn once out of sight at launch. The window's textures are made on the GPU
off the main thread: handed a picture, SceneKit converts it as it draws, and
every slam cost a dropped frame. Measured live: ~0.8 ms a frame, a steady 60
fps, on screen 10–40 ms after the double-click.

## Wall smash

Three blows, each a crater (`Rubble.swift`): a jagged rim round a dark pit,
both cut from a photo of rough concrete and shaded as if sunk into the screen,
with a ring of the wall's face chipped off round it. Its cracks run out in
straight runs with sharp kinks, forking now and then, thinning to hairlines as
they cross the screen. Chunks fly out under gravity and dust billows and
settles. While it holds the frame clock is paused; then each crater breaks
into wedges that fall away. Measured live: ~0.5 ms of drawing a frame.

## Bat swarm

The flight of every bat is worked out when the swarm starts, so a frame is
only lookups and draws. Bats are added until their wings would cover the
screen 1.75 times over; overlapping and coming and going, that leaves 74% of
it covered at the peak, measured from renders. Bigger screens get bigger,
faster bats rather than more of them, so every display gets the same swarm in
the same time. Measured live: ~2,800 bats, 1.3 ms of drawing a frame, a steady
60 fps.

## Custom charms

The sticker is made with Vision's foreground-instance mask (`Sticker.swift`):
every subject it finds is lifted off the background, the shape grown outward
for a white border and a little further for a faint rim so it reads on a white
desktop too, and the whole trimmed and kept at no more than 760 px on its long
side. A picture with no subject Vision can find, or with **Cut out the
subject** off, becomes a rounded card. The first cut-out after launch takes
about 3 s while Vision loads its model; after that, under 150 ms.

The chain is fixed to the highest solid point near the line the sticker's
weight balances on (`StickerShape.swift`), so it hangs from the top of a head,
not an empty corner or the notch between two. Spider-Man's webs leave from the
sticker's middle.

Stickers and their settings live in
`~/Library/Application Support/DeskCharm/Charms/` — a PNG apiece and
`charms.json` — not in the app bundle, so they survive a rebuild.

## Sound

Every effect is synthesised at launch from filtered noise and pitch sweeps —
there are no audio files. Playback runs on its own queue through an audio
engine that pauses when idle; NSSound was dropped because each play blocked
the main thread for 12–116 ms and cost a frame of animation.

## Test

```bash
./test.sh
```

Headless checks on the rope solver: that it hangs vertical, doesn't stretch,
swings through centre when released, damps to rest, tilts along the chain,
draws in line with the chain, takes a shove without stretching, and survives
the app being suspended. Also that only hard shaking sets off the web blast,
and that the bat swarm rises from out of sight below, heads upward the whole
way, is gone over the top, and all but covers the screen at its peak; and that
the tow's pour starts as the whole window, goes near side first, never folds
over itself and ends with all of it in the charm; that a web of cracks reaches
everything in its reach, in shards that fit with no gaps and cracks that never
cross; and that a blow to the wall leaves a crater round where it landed,
cracks that fork and run well across the screen, and nothing left on screen
once its pieces have fallen; and that the Hulk's sheet stays in his fist and
holds out from it like a mat, not a rag, and swung down slams into the floor
without going through it, pulling out long or folding over, then flies off as
thrown; and that a sticker is trimmed to what's opaque and hangs from the top
of its subject, not down in a notch. No display needed.

## Layout

```
Sources/RopeSim.swift   Verlet solver — no AppKit, so it's testable headless
Sources/main.swift      rendering, window, menu bar
Sources/Webs.swift      Spider-Man's hands, web strands, overlays, aiming
Sources/WebYank.swift   double-click: pull the front window into his hand
Sources/WebBlast.swift  manhandled: web over the whole screen
Sources/Bats.swift      Batman's gadget pictures, overlays, aiming
Sources/BatTow.swift    double-click: grapple and bats pour the front window away
Sources/Pour.swift      the genie pour's geometry — no AppKit, testable headless
Sources/BatSwarm.swift  manhandled: bats up the whole screen
Sources/Swarm.swift     the swarm's flight plan — no AppKit, testable headless
Sources/Hulk.swift      the Hulk's model and how he's posed, overlays
Sources/HulkSlam.swift  double-click: the Hulk, in 3D, smashes the window into the charm
Sources/GLTF.swift      a skinned, animated .glb into SceneKit
Sources/Cloth.swift     the window as a rubbery sheet — no AppKit, testable headless
Sources/Cracks.swift    cracked-glass geometry — no AppKit, testable headless
Sources/WallSmash.swift manhandled: the screen punched in like concrete
Sources/Rubble.swift    smashed-concrete geometry — no AppKit, testable headless
Sources/Shake.swift     tells manhandling from ordinary dragging
Sources/Sounds.swift    synthesised sound effects
Sources/CustomCharms.swift  powers, and the user's own charms on disk
Sources/CharmMaker.swift    the New Custom Charm window
Sources/Sticker.swift       a picture into a die-cut sticker
Sources/StickerShape.swift  a sticker's trim and hang point — no AppKit, testable headless
Tests/main.swift        physics and swarm checks
Charms/                 extracted art at native resolution
Charms/hd/              2x Lanczos + unsharp — what ships in the bundle
Effects/                bat wingbeat frames, the Hulk's model and skin, concrete (CREDITS.md)
```

## Physics

Position-based dynamics: Verlet integration with distance constraints, stepped
at a fixed 240 Hz and solved over 24 iterations. Constraints are weighted by
inverse mass, so the charm (3.5x a link) drapes the chain instead of stretching
it. A one-sided bending constraint between every second link stops the chain
folding back on itself when it goes slack — without it the chain buckles and
the swing turns chaotic.

Tuned for how a desk toy should read rather than literal scale: gravity 1400
gives a 2.3s period, close to a playground swing, and damping of 0.9995 per
substep keeps ~92% of velocity per second, an 8.7s amplitude half-life.

Measured against an ideal damped sinusoid, the real app's trajectory fits to
within 2.1% of swing width.

Dragging applies a soft pull toward the pointer rather than pinning the charm
to it. The lag is deliberate — it is what loads a release with throw velocity.
Pinning per substep destroys that, because the pin sits still between pointer
events while the sim keeps stepping.

Charm angle is measured across four links and low-passed; a single ~11pt
segment is too short to read a steady angle from.

## Tracing

`DESKCHARM_TRACE=/path/out.csv ./DeskCharm.app/Contents/MacOS/DeskCharm` runs a
build that settles, releases the charm from 40 degrees, logs every rendered
frame's timestamp and charm position for 14s, then quits. Used to verify frame
pacing (60.0 fps, 0.55ms stdev) and to fit the trajectory against an ideal
pendulum.

## Artwork

Charm art is extracted from Hangly by sharancreatedthis, which marks it
"© 2026 sharancreatedthis, all rights reserved" and asks that it not be
redistributed or presented as someone else's work. The Marvel and DC designs
are also studio IP. This build is personal use on one machine — keep it off
public repos and out of any release.

The bat frames in `Effects/` are made from a public-domain silhouette from
Wikimedia Commons; the Hulk is a CC0 model from OpenGameArt, repainted; the
concrete is a CC0 texture from Poly Haven. `Effects/CREDITS.md` has the
sources and licences. The Hulk himself is Marvel's design, so the same
personal-use caution applies.

The code here is mine and carries no such restriction.
