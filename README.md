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
- **Menu bar `✦`** → pick charm, size, chain length, screen position.
- **Quit** from the same menu.

The window is large and transparent, but only accepts clicks while the pointer
is actually over the charm — everything else passes through to what's beneath.

## Test

```bash
./test.sh
```

Eight headless checks on the rope solver: that it hangs vertical, doesn't
stretch, swings through centre when released, damps to rest, tilts along the
chain, and survives the app being suspended. No display needed.

## Layout

```
Sources/RopeSim.swift   Verlet solver — no AppKit, so it's testable headless
Sources/main.swift      rendering, window, menu bar
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
