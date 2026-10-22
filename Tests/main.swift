import Foundation
import CoreGraphics
import simd

// Headless checks on the rope solver: that the chain holds together, and that
// the swing reads the way a real one does — graceful period, momentum carried
// through a release, and amplitude that bleeds off gradually. Then the shake
// meter, and the bat swarm's flight plan.

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

// --- The bat swarm goes bottom to top and all but covers the screen ---------
// Flown on a laptop-sized screen with the real sprite's proportions. Every bat
// must come up from out of sight below and be gone over the top by the end.
// At the peak the wings on screen must add up to well over the screen: they
// overlap, and 1.36x measured as 74% of the pixels covered in a real render.

var swarmRNG = SplitMix64(seed: 7)
let screen = CGSize(width: 1512, height: 982)
let batFill: CGFloat = 0.34, batAspect: CGFloat = 0.557
let swarm = Swarm(size: screen, fill: batFill, aspect: batAspect, using: &swarmRNG)
var risesThrough = true
var climbs = true
for b in swarm.bats {
    let first = swarm.pose(b, at: b.start)
    let gone = swarm.pose(b, at: swarm.duration + 0.01)
    risesThrough = risesThrough && (first.map { $0.at.y > screen.height } ?? false) && gone == nil
    for t in stride(from: b.start, to: swarm.duration, by: 0.05) {
        guard let p = swarm.pose(b, at: t) else { continue }
        climbs = climbs && abs(p.heading + .pi / 2) < .pi / 3       // within 60° of straight up
    }
}
check("every bat comes up from below and is gone over the top", risesThrough,
      "\(swarm.bats.count) bats")
check("bats head upward the whole way", climbs)

var peak: CGFloat = 0
var peakAt = 0.0
for t in stride(from: 0, through: swarm.duration, by: 0.02) {
    var area: CGFloat = 0
    for b in swarm.bats {
        guard let p = swarm.pose(b, at: t),
              p.at.x >= 0, p.at.x <= screen.width, p.at.y >= 0, p.at.y <= screen.height else { continue }
        area += batFill * b.span * b.span * batAspect
    }
    if area > peak { peak = area; peakAt = t }
}
let peakCover = peak / (screen.width * screen.height)
check("at its peak the swarm all but covers the screen", peakCover > 1.2,
      String(format: "wings %.2fx the screen at %.2f s", peakCover, peakAt))
check("the swarm is over in a few seconds", swarm.duration < 4,
      String(format: "%.2f s", swarm.duration))

// --- The Batman charm pours a window in, near side first --------------------
// Like a genie into its lamp: whole at the start, all of it gone in at the
// end, the side nearest the charm leading, and never folding over itself.

let pourFrom = CGRect(x: 200, y: 150, width: 800, height: 520)
let charmCentre = CGPoint(x: 1250, y: 520)
let pour = Pour(window: pourFrom, into: charmCentre, columns: Pour.runsSideways(from: pourFrom, to: charmCentre))
let strips = 48
let whole = (0..<strips).map { pour.strip($0, of: strips, at: 0) }
let startsWhole = whole.allSatisfy { $0.opacity == 1 && abs($0.rect.minY - pourFrom.minY) < 0.01 && abs($0.rect.maxY - pourFrom.maxY) < 0.01 }
    && abs(whole[0].rect.minX - pourFrom.minX) < 1 && abs(whole[strips - 1].rect.maxX - pourFrom.maxX) < 1
check("a pour starts as the whole window", startsWhole)
let pouredIn = (0..<strips).map { pour.strip($0, of: strips, at: 1) }
check("a pour ends with all of it in the charm",
      pouredIn.allSatisfy { $0.opacity < 0.01 && abs($0.rect.midX - charmCentre.x) < 1 && $0.rect.height < 0.5 })
// The near side is in by just past halfway, while the far side has barely moved.
let halfway = (0..<strips).map { pour.strip($0, of: strips, at: 0.55) }
check("the side nearest the charm goes first",
      halfway[strips - 1].opacity < 0.01 && halfway[0].opacity == 1)
var folds = false
for step in 1..<40 {
    let s = (0..<strips).map { pour.strip($0, of: strips, at: CGFloat(step) / 40).rect.midX }
    folds = folds || zip(s, s.dropFirst()).contains { $0 > $1 + 0.01 }
}
check("a pour never folds over itself", !folds)
check("the grip goes in with the window", pour.point(CGPoint(x: 600, y: 168), at: 1).dist(charmCentre) < 0.5)

// --- A web of cracks breaks glass right across -------------------------------
// The Hulk's blows crack the window from under his feet. A web must reach
// everything within its reach, its shards fitting together with no holes and
// its rays never crossing.

var crackRNG = SplitMix64(seed: 11)
let blow = CGPoint(x: 460, y: 410)
let corners = [CGPoint.zero, CGPoint(x: screen.width, y: 0), CGPoint(x: 0, y: screen.height),
               CGPoint(x: screen.width, y: screen.height)]
let web = CrackWeb(centre: blow, reach: corners.map { blow.dist($0) }.max()!, using: &crackRNG)
let pieces = web.shards
check("a blow cracks the glass out to every corner",
      corners.map { CGPoint(x: min(max($0.x, 1), screen.width - 1), y: min(max($0.y, 1), screen.height - 1)) }
          .allSatisfy { c in pieces.contains { contains($0, c) } })
var holes = 0
for gx in stride(from: 5.0, to: Double(screen.width), by: 37) {
    for gy in stride(from: 5.0, to: Double(screen.height), by: 37) {
        let p = CGPoint(x: gx, y: gy)
        if !pieces.contains(where: { contains($0, p) }) { holes += 1 }
    }
}
check("its shards fit together with no holes", holes == 0, "\(pieces.count) shards, \(holes) gaps")
var raysCross = false
for k in 1..<web.rays[0].count {
    let turns = web.rays.map { atan2(Double($0[k].y - blow.y), Double($0[k].x - blow.x)) }
    let steps = zip(turns, turns.dropFirst() + [turns[0]]).map { b, a -> Double in
        var d = a - b
        while d < 0 { d += 2 * .pi }
        return d
    }
    raysCross = raysCross || abs(steps.reduce(0, +) - 2 * .pi) > 0.001
}
check("its cracks never cross", !raysCross)

// --- A blow smashes the wall ------------------------------------------------
// Each wall-smash blow must leave a crater round where it landed, cracks that
// fork and run a good way across the screen, and every piece it knocks loose,
// thrown out or crumbling, fallen clear of the screen in the 1.3 s it's given.

var rubbleRNG = SplitMix64(seed: 21)
let crater = Crater(centre: CGPoint(x: 460, y: 220), radius: 74, bounds: CGRect(origin: .zero, size: screen), using: &rubbleRNG)
check("a blow leaves a crater round where it landed", contains(crater.rim, crater.centre))
let farthest = crater.cracks.flatMap(\.points).map { $0.dist(crater.centre) }.max() ?? 0
let diagonal = (screen.width * screen.width + screen.height * screen.height).squareRoot()
check("its cracks run a good way across the screen", farthest > diagonal * 0.4,
      String(format: "%.0f pt of a %.0f pt diagonal", farthest, diagonal))
check("its cracks fork as they go", crater.cracks.count > 12, "\(crater.cracks.count) cracks")
check("everything it knocks loose falls clear of the screen",
      (crater.thrown + crater.crumbs).allSatisfy { Crater.position(of: $0, after: 1.3).y > screen.height })

// --- A window swung like cloth ----------------------------------------------
// The sheet the Hulk smashes about: held by the middle of one edge it must
// stay in his fist and hold out from it like a rubber mat, not hang like a rag;
// swung down hard it must slam onto the floor without going through it, and
// say how hard, without pulling out long or folding over; let go, it must fly
// off at the speed it was thrown.

func sheet() -> Cloth {
    let c = Cloth(columns: 14, rows: 9, width: 340, height: 212, topLeft: SIMD2(400, 700))
    c.floor = 100
    return c
}
let held = [3, 4, 5].map { $0 * 14 }
/// The fist, at `at`, the sheet leaving it along `toward`, as the Hulk holds it.
func grips(_ at: SIMD2<Float>, toward: SIMD2<Float> = SIMD2(1, 0)) -> [Int: SIMD2<Float>] {
    let d = simd_normalize(toward), down = SIMD2(d.y, -d.x)
    var out: [Int: SIMD2<Float>] = [:]
    for (k, i) in held.enumerated() { out[i] = at + down * (Float(k - 1) * 26.5) }
    return out
}
/// How long its middle row is, against how long it was.
func middleLength(_ c: Cloth) -> Float {
    (0..<13).reduce(Float(0)) { $0 + simd_distance(c.points[4 * 14 + $1], c.points[4 * 14 + $1 + 1]) } / 340
}
/// Whether any column of it has crossed the next.
func folded(_ c: Cloth) -> Bool {
    func cross(_ u: SIMD2<Float>, _ v: SIMD2<Float>) -> Float { u.x * v.y - u.y * v.x }
    return (0..<13).contains { col in
        let a0 = c.points[col], a1 = c.points[8 * 14 + col], b0 = c.points[col + 1], b1 = c.points[8 * 14 + col + 1]
        return cross(a1 - a0, b0 - a0) * cross(a1 - a0, b1 - a0) < 0 && cross(b1 - b0, a0 - b0) * cross(b1 - b0, a1 - b0) < 0
    }
}

let mat = sheet()
let fist = SIMD2<Float>(400, 594)
mat.hold(grips(fist))
for _ in 0..<240 { mat.advance(1.0 / 60) }
let tip = mat.points[4 * 14 + 13]
check("a held sheet stays in the fist", held.allSatisfy { simd_distance(mat.points[$0], grips(fist)[$0]!) < 0.01 })
check("and holds out from it like a mat, not a rag", tip.x > fist.x + 280 && tip.y < fist.y - 10,
      String(format: "far edge %.0f pt out, %.0f pt down", tip.x - fist.x, fist.y - tip.y))

// Over his shoulder and down, the way he swings it, the fist turning with the
// swing, from held straight up over his head as he has it when he starts.
let centre = SIMD2<Float>(700, 450)
let swung = sheet()
let overhead = centre + SIMD2(0, 120)
swung.place { col, row in overhead + SIMD2(0, Float(col) * 340 / 13) + SIMD2(Float(row - 4) * 26.5, 0) }
var throughFloor = false, everFolded = false
var hardest: Float = 0, longestMiddle: Float = 0
for k in 0..<90 {
    let u = min(1, Float(k + 1) / 25)
    let a = Float.pi / 2 + (Float.pi * 1.22 - Float.pi / 2) * pow(u, 1.8)
    let hand = centre + 120 * SIMD2(cos(a), sin(a))
    swung.hold(grips(hand, toward: hand - centre))
    swung.advance(1.0 / 60)
    throughFloor = throughFloor || swung.points.contains { $0.y < swung.floor - 0.001 }
    everFolded = everFolded || folded(swung)
    longestMiddle = max(longestMiddle, middleLength(swung))
    hardest = max(hardest, swung.landings.map(\.speed).max() ?? 0)
    swung.landings.removeAll()
}
check("swung down, it slams into the floor", hardest > 900, String(format: "%.0f pt/s", hardest))
check("and never goes through it", !throughFloor)
check("nor pulls out long doing it", longestMiddle < 1.01, String(format: "up to %.1f%% long", (longestMiddle - 1) * 100))
check("nor folds over itself", !everFolded)

let thrown = sheet()
thrown.hold(grips(fist))
thrown.advance(1.0 / 60)
let before = thrown.points.reduce(SIMD2<Float>(0, 0), +) / Float(thrown.points.count)
thrown.release(velocity: SIMD2(1500, 300))
for _ in 0..<6 { thrown.advance(1.0 / 60) }
let flown = thrown.points.reduce(SIMD2<Float>(0, 0), +) / Float(thrown.points.count) - before
check("let go, it flies off as thrown", abs(flown.x - 150) < 15, String(format: "%.0f pt in 0.1 s", flown.x))

// --- The thunderstorm: bolts that read as lightning, rain that fills the screen

var stormRNG = SplitMix64(seed: 11)
let stormScreen = CGSize(width: 1512, height: 982)
let hanging = CGPoint(x: 1100, y: 420)
let storm = Storm(size: stormScreen, charm: hanging, using: &stormRNG)

check("the storm has five bolts, in order", storm.bolts.count == 5
      && zip(storm.bolts, storm.bolts.dropFirst()).allSatisfy { $0.time < $1.time })
check("every bolt flashes and dies away before the storm does",
      storm.bolts.allSatisfy { $0.time + Storm.linger < storm.duration - 1 })
check("each bolt runs from above the screen to the ground",
      storm.bolts.allSatisfy { $0.trunk.first!.y < 0 && $0.trunk.last! == $0.ground })
/// How far a bolt strays from the straight line between its ends, at most.
func straying(_ b: Storm.Bolt) -> CGFloat {
    let a = b.trunk[0], z = b.trunk[b.trunk.count - 1]
    let len = hypot(z.x - a.x, z.y - a.y)
    var most: CGFloat = 0
    for p in b.trunk {
        let cross = (z.x - a.x) * (a.y - p.y) - (a.x - p.x) * (z.y - a.y)
        most = max(most, abs(cross) / len)
    }
    return most
}
check("a bolt is jagged, not a straight line", storm.bolts.allSatisfy { $0.trunk.count > 30 && straying($0) > 8 })
check("most bolts fork", storm.bolts.filter { !$0.forks.isEmpty }.count >= 4)
check("the last bolt lands on the charm", storm.bolts.last.map { $0.charm && $0.ground == hanging } ?? false)
check("and no other does", storm.bolts.dropLast().allSatisfy { !$0.charm })
let noCharm = Storm(size: stormScreen, charm: nil, using: &stormRNG)
check("with no charm to aim at, none claims to", noCharm.bolts.allSatisfy { !$0.charm })

check("it starts and ends under a clear sky", storm.gloom(at: 0) == 0 && storm.gloom(at: storm.duration) == 0)
check("and is fully dark in between", storm.gloom(at: storm.duration / 2) > 0.99)
check("a flash is hard, dips, then flares again",
      Storm.flash(0.02) == 1 && Storm.flash(0.09) < 0.4 && Storm.flash(0.15) > 0.7 && Storm.flash(0.6) == 0)
check("no flash before the first bolt", storm.flash(at: storm.bolts[0].time - 0.01) == 0)

var rainOnScreen = true
var rainLaps = true
for d in storm.drops {
    for t in stride(from: 0.0, through: storm.duration, by: 0.25) {
        let p = storm.position(d, at: t)
        rainOnScreen = rainOnScreen && p.x >= -0.25 * stormScreen.width - 1 && p.x <= stormScreen.width + 1
            && p.y >= -d.length - 1 && p.y <= stormScreen.height + d.length + 1
    }
    let a = storm.position(d, at: 0).y, b = storm.position(d, at: 0.1).y
    rainLaps = rainLaps && (b > a || b < a - stormScreen.height / 2)     // falling, or wrapped to the top
}
check("rain stays on the screen all storm", rainOnScreen, "\(storm.drops.count) drops")
check("and only ever falls", rainLaps)
var covered = Set<Int>()
for d in storm.drops { covered.insert(Int(storm.position(d, at: 2).x / 100)) }
check("it falls across the whole width", covered.count >= 14, "\(covered.count) columns of 100 pt")

// --- Robustness -------------------------------------------------------------

let g = makeSim(breeze: 1)
g.advance(to: clock)
clock = clock.addingTimeInterval(9.0)        // app suspended
g.advance(to: clock)
let sane = g.tip.x.isFinite && g.tip.y.isFinite && g.tip.dist(anchor) < ropeLen * 1.5
check("survives a 9s stall", sane, String(format: "tip %.0f pt from anchor", g.tip.dist(anchor)))

print(failures == 0 ? "\nAll physics checks passed." : "\n\(failures) check(s) FAILED.")
exit(failures == 0 ? 0 : 1)
