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
- **Menu bar `✦`** → pick charm, size, chain length, screen position, and (with
  a Spider-Man) turn **Sound Effects** on or off.
- **Quit** from the same menu.

The window is large and transparent, but only accepts clicks while the pointer
is actually over the charm — everything else passes through to what's beneath.
It never takes focus, so the app you were using stays the one in front.

## Web yank

Another app's window can't be moved from outside it, so what flies is a
stand-in, and the app is hidden underneath it the moment it's covered. With
Screen Recording allowed, the stand-in is a snapshot of the real window;
without it, a card with the app's icon and name. Turn it on from
`✦` → **Allow Window Snapshots…** (shown while a Spider-Man is selected), then
relaunch. Because the build is ad-hoc signed, macOS treats every rebuild as a
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
the app being suspended. Also that only hard shaking sets off the web blast.
No display needed.

## Layout

```
Sources/RopeSim.swift   Verlet solver — no AppKit, so it's testable headless
Sources/main.swift      rendering, window, menu bar
Sources/Webs.swift      Spider-Man's hands, web strands, overlays, aiming
Sources/WebYank.swift   double-click: pull the front window into his hand
Sources/WebBlast.swift  manhandled: web over the whole screen
Sources/Shake.swift     tells manhandling from ordinary dragging
Sources/Sounds.swift    synthesised sound effects
Tests/main.swift        physics checks
Charms/                 extracted art at native resolution
Charms/hd/              2x Lanczos + unsharp — what ships in the bundle
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

The code here is mine and carries no such restriction.
