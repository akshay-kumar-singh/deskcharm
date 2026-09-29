import Foundation
import CoreGraphics

// Headless checks on the rope solver: that the chain holds together, and that
// the swing reads the way a real one does — graceful period, momentum carried
// through a release, and amplitude that bleeds off gradually.

var failures = 0
func check(_ label: String, _ cond: Bool, _ detail: String = "") {
    print("  \(cond ? "PASS" : "FAIL")  \(label)\(detail.isEmpty ? "" : "  [\(detail)]")")
    if !cond { failures += 1 }
}

let hz = 240.0
var clock = Date(timeIntervalSinceReferenceDate: 0)

func settle(_ sim: RopeSim, seconds: Double) {
    sim.advance(to: clock)
    for _ in 0..<Int(seconds * hz) {
        clock = clock.addingTimeInterval(1 / hz)
        sim.advance(to: clock)
    }
}

/// Moves the pointer over time the way a hand would, rather than teleporting it.
func drag(_ sim: RopeSim, from a: CGPoint, to b: CGPoint, seconds: Double) {
    sim.grab(a)
    let steps = Int(seconds * hz)
    for k in 0..<steps {
        let f = CGFloat(k + 1) / CGFloat(steps)
        sim.grab(CGPoint(x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f))
        clock = clock.addingTimeInterval(1 / hz)
        sim.advance(to: clock)
    }
}

func makeSim(breeze: CGFloat = 0) -> RopeSim {
    let s = RopeSim()
    s.breeze = breeze
    s.reset(anchor: anchor, count: segs + 1, segLen: ropeLen / CGFloat(segs))
    return s
}

let anchor = CGPoint(x: 280, y: 4)
let ropeLen: CGFloat = 240
let segs = 22

// --- Structural ------------------------------------------------------------

let a = makeSim()
settle(a, seconds: 12)
check("hangs vertical at rest", abs(a.tip.x - anchor.x) < 1.0,
      String(format: "x drift %.3f pt", abs(a.tip.x - anchor.x)))

let stretch = abs(a.tip.dist(anchor) - ropeLen) / ropeLen * 100
check("chain does not stretch under the charm", stretch < 2.0,
      String(format: "%.2f%% off nominal", stretch))

var worst: CGFloat = 0
for i in 0..<(a.nodes.count - 1) {
    worst = max(worst, abs(a.nodes[i].p.dist(a.nodes[i+1].p) - a.segLen))
}
check("segment lengths hold", worst < 0.5, String(format: "worst %.4f pt", worst))
check("hangs upright at rest", abs(a.tipAngle) < 0.02,
      String(format: "%.4f rad", Double(abs(a.tipAngle))))

// --- Clicking must not move the charm --------------------------------------
// The charm is drawn downward from the tip, so grabbing must preserve the
// offset between tip and pointer or a plain click yanks it up to the cursor.

let b = makeSim()
settle(b, seconds: 6)
let restTip = b.tip
b.grab(CGPoint(x: restTip.x + 30, y: restTip.y + 90))   // click low on the charm
settle(b, seconds: 0.25)
let jump = b.tip.dist(restTip)
b.release()
check("a click does not teleport the charm", jump < 2.0,
      String(format: "moved %.2f pt", jump))

// --- Release must carry momentum -------------------------------------------

let c = makeSim()
settle(c, seconds: 6)
drag(c, from: c.tip, to: CGPoint(x: anchor.x + 150, y: anchor.y + 190), seconds: 0.45)
let releaseX = c.tip.x
c.release()

var travelled: CGFloat = 0
var crossed = false
for _ in 0..<Int(2.5 * hz) {
    clock = clock.addingTimeInterval(1 / hz)
    c.advance(to: clock)
    travelled = max(travelled, abs(c.tip.x - releaseX))
    if c.tip.x < anchor.x - 20 { crossed = true }
}
check("release carries momentum", travelled > 60,
      String(format: "moved %.0f pt after release", travelled))
check("swings through and past centre", crossed)

// --- Period must be graceful, not frantic ----------------------------------

let d = makeSim()
settle(d, seconds: 6)
drag(d, from: d.tip, to: CGPoint(x: anchor.x + 160, y: anchor.y + 180), seconds: 0.5)
d.release()

var crossings: [Double] = []
var prevSide = (d.tip.x - anchor.x) > 0
var elapsed = 0.0
for _ in 0..<Int(12 * hz) {
    clock = clock.addingTimeInterval(1 / hz)
    elapsed += 1 / hz
    d.advance(to: clock)
    let side = (d.tip.x - anchor.x) > 0
    if side != prevSide { crossings.append(elapsed); prevSide = side }
}
var period = 0.0
if crossings.count >= 3 {
    let gaps = zip(crossings.dropFirst(), crossings).map { $0 - $1 }
    period = (gaps.reduce(0, +) / Double(gaps.count)) * 2   // half-swings -> full
}
check("swing period is graceful", period > 1.8 && period < 3.6,
      String(format: "%.2f s over %d crossings", period, crossings.count))

// --- Decay must be gradual, not abrupt -------------------------------------
// The old build shed ~76% of its velocity per second and died in about two
// seconds. Amplitude is sampled in two windows and compared.

let e = makeSim()
settle(e, seconds: 6)
drag(e, from: e.tip, to: CGPoint(x: anchor.x + 160, y: anchor.y + 180), seconds: 0.5)
e.release()

func amplitude(_ sim: RopeSim, seconds: Double) -> CGFloat {
    var peak: CGFloat = 0
    for _ in 0..<Int(seconds * hz) {
        clock = clock.addingTimeInterval(1 / hz)
        sim.advance(to: clock)
        peak = max(peak, abs(sim.tip.x - anchor.x))
    }
    return peak
}

let early = amplitude(e, seconds: 3)
let later = amplitude(e, seconds: 3)
let retained = later / max(early, 0.001)
check("decays gradually, not abruptly", retained > 0.45 && retained < 0.96,
      String(format: "%.0f%% of amplitude kept after 3s", retained * 100))

check("still swinging visibly after 6s", later > 20,
      String(format: "%.0f pt amplitude", later))

// --- But it must eventually rest -------------------------------------------

settle(e, seconds: 60)
check("comes to rest eventually", abs(e.tip.x - anchor.x) < 3.0,
      String(format: "residual %.3f pt", abs(e.tip.x - anchor.x)))

// --- Charm orientation ------------------------------------------------------

let f = makeSim()
settle(f, seconds: 6)
drag(f, from: f.tip, to: CGPoint(x: anchor.x + 170, y: anchor.y + 150), seconds: 0.5)
check("tilts into the swing", f.tipAngle > 0.1,
      String(format: "%.3f rad", Double(f.tipAngle)))
f.release()

// --- The drawn charm must hang in line with its chain ----------------------
// The charm is drawn rotated by charmRotation. Turning "straight down" by it
// must point along the last links; with the sign wrong it points as far the
// other way, and the charm kinks against the chain at every swing. The first
// moments after the kick are skipped: the chain jumps there and the charm's
// deliberate rotational lag takes a few hundredths of a second to catch up.

let q = makeSim()
settle(q, seconds: 6)
q.kick(angle: 0.6)
settle(q, seconds: 0.15)
var worstKink = 0.0
for _ in 0..<Int(2 * hz) {
    clock = clock.addingTimeInterval(1 / hz)
    q.advance(to: clock)
    let base = q.nodes[q.nodes.count - 4].p
    let along = atan2(Double(q.tip.x - base.x), Double(q.tip.y - base.y))
    let down = CGPoint(x: 0, y: 1).applying(CGAffineTransform(rotationAngle: q.charmRotation))
    worstKink = max(worstKink, abs(atan2(Double(down.x), Double(down.y)) - along))
}
// Lag keeps it up to ~0.17 rad behind at the fastest point of the swing; the
// wrong sign is out by ~1.45.
check("charm hangs in line with the chain", worstKink < 0.3,
      String(format: "worst %.3f rad off the chain", worstKink))

// --- Chain must stay taut and never buckle ---------------------------------
// The original solver had distance constraints only, so the chain folded back
// on itself the moment it went slack: measured end-to-end length collapsed
// from 240pt to 14pt mid-swing and the motion became chaotic.

let h = makeSim()
settle(h, seconds: 6)
h.kick(angle: 0.7)

var minLen: CGFloat = .greatestFiniteMagnitude
var halfPeriods: [Double] = []
var tautSide = (h.tip.x - anchor.x) > 0
var elapsed2 = 0.0
var lastCross = 0.0
for _ in 0..<Int(10 * hz) {
    clock = clock.addingTimeInterval(1 / hz)
    elapsed2 += 1 / hz
    h.advance(to: clock)
    minLen = min(minLen, h.tip.dist(anchor))
    let side = (h.tip.x - anchor.x) > 0
    if side != tautSide {
        if lastCross > 0 { halfPeriods.append(elapsed2 - lastCross) }
        lastCross = elapsed2
        tautSide = side
    }
}
check("chain stays taut through a swing", minLen > ropeLen * 0.9,
      String(format: "shortest %.1f pt of %.0f", minLen, ropeLen))

// Chaotic motion shows up as half-swings of wildly differing duration.
var spread = 0.0
if halfPeriods.count >= 4 {
    let m = halfPeriods.reduce(0, +) / Double(halfPeriods.count)
    let varsum = halfPeriods.map { ($0 - m) * ($0 - m) }.reduce(0, +)
    spread = (varsum / Double(halfPeriods.count)).squareRoot() / m
}
check("swing period stays consistent", halfPeriods.count >= 4 && spread < 0.06,
      String(format: "%.1f%% spread over %d half-swings", spread * 100, halfPeriods.count))

// --- Slack must resolve gracefully -----------------------------------------
// Dragging the charm up toward the anchor is the case that used to kink it.

let k = makeSim()
settle(k, seconds: 6)
drag(k, from: k.tip, to: CGPoint(x: anchor.x + 20, y: anchor.y + 70), seconds: 0.5)
k.release()
settle(k, seconds: 5)
let recovered = abs(k.tip.dist(anchor) - ropeLen)
check("recovers from slack without kinking", recovered < 8,
      String(format: "%.2f pt off nominal", recovered))

// --- Impulse must swing it, not stretch it ---------------------------------
// The web yank shoves the charm instead of dragging it. A push along the chain
// can't be taken up by the links, so it must come out as swing, not length.

let m = makeSim()
settle(m, seconds: 6)
m.impulse(CGVector(dx: 300, dy: -200))
var reach: CGFloat = 0
var longest: CGFloat = 0
for _ in 0..<Int(1.5 * hz) {
    clock = clock.addingTimeInterval(1 / hz)
    m.advance(to: clock)
    reach = max(reach, m.tip.x - anchor.x)
    longest = max(longest, m.tip.dist(anchor))
}
check("an impulse sets it swinging", reach > 40, String(format: "reached %.0f pt", reach))
check("an impulse does not stretch the chain", longest < ropeLen * 1.02,
      String(format: "longest %.1f pt of %.0f", longest, ropeLen))

// --- Only manhandling sets off the web blast -------------------------------
// Moving the charm about normally must never trigger it; throwing it about
// hard for a second or two must.

/// Feeds the meter a pointer path sampled at 120 Hz; returns seconds to trigger.
func shakeTrigger(seconds: Double, _ path: (Double) -> CGPoint) -> Double? {
    let meter = ShakeMeter()
    let start = Date(timeIntervalSinceReferenceDate: 0)
    for i in 0...Int(seconds * 120) {
        let t = Double(i) / 120
        if meter.drag(to: path(t), at: start.addingTimeInterval(t)) { return t }
    }
    return nil
}

let slowDrag = shakeTrigger(seconds: 8) { CGPoint(x: 280 + 400 * sin($0 * 0.9), y: 300) }   // ~360 pt/s peak
check("a slow drag never sets it off", slowDrag == nil)
let fling = shakeTrigger(seconds: 1) { CGPoint(x: 280 + min($0, 0.25) * 4000, y: 300) }   // 1000 pt in 0.25s
check("a single fling doesn't set it off", fling == nil)
let shaking = shakeTrigger(seconds: 4) { CGPoint(x: 280 + 150 * sin($0 * 2 * .pi * 3), y: 300) }
check("hard shaking sets it off", shaking.map { $0 < 3 } ?? false,
      shaking.map { String(format: "after %.2f s", $0) } ?? "never")

// --- Robustness -------------------------------------------------------------

let g = makeSim(breeze: 1)
g.advance(to: clock)
clock = clock.addingTimeInterval(9.0)        // app suspended
g.advance(to: clock)
let sane = g.tip.x.isFinite && g.tip.y.isFinite && g.tip.dist(anchor) < ropeLen * 1.5
check("survives a 9s stall", sane, String(format: "tip %.0f pt from anchor", g.tip.dist(anchor)))

print(failures == 0 ? "\nAll physics checks passed." : "\n\(failures) check(s) FAILED.")
exit(failures == 0 ? 0 : 1)
