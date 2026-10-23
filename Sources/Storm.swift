import Foundation
import CoreGraphics

// MARK: - Storm plan
//
// Everything a thunderstorm does, worked out up front from a few random
// numbers, so drawing a frame is only lookups. No AppKit or SwiftUI here, so
// the tests can run a storm headless.

struct Storm {
    struct Bolt {
        let time: Double                // seconds in that it strikes
        let trunk: [CGPoint]            // cloud to ground
        let forks: [[CGPoint]]          // branches off the trunk
        let ground: CGPoint
        let charm: Bool                 // whether it is the one that hits the charm
    }

    struct Cloud {
        let x: CGFloat                  // centre, as a fraction of the width
        let y: CGFloat                  // centre, points down from the top
        let radius: CGFloat
        let drift: CGFloat              // sideways, points per second
        let shade: Double               // 0 dark ... 1 lighter
    }

    struct Drop {
        let x: CGFloat
        let phase: CGFloat              // 0..<1 of the way down at the start
        let speed: CGFloat              // points per second
        let length: CGFloat
        let depth: CGFloat              // 0 far ... 1 near
    }

    let size: CGSize
    let duration: Double
    let bolts: [Bolt]
    let clouds: [Cloud]
    let drops: [Drop]                   // far to near, which is also the draw order

    /// Rain slants this much sideways for each point it falls.
    static let slant: CGFloat = 0.22
    /// How long a bolt lingers, and how long it takes thunder to follow it.
    static let linger = 0.32
    static let thunderLag = 0.28
    static let reference = CGSize(width: 1512, height: 982)

    /// `charm` is where the last bolt lands, if there is somewhere to aim it.
    init<R: RandomNumberGenerator>(size: CGSize, charm: CGPoint?, using rng: inout R) {
        self.size = size
        duration = 5.0
        let scale = size.width / Self.reference.width
        let pace = size.height / Self.reference.height

        clouds = (0..<18).map { k in
            let u = (CGFloat(k) + .random(in: 0...1, using: &rng)) / 18
            return Cloud(x: u * 1.3 - 0.15, y: .random(in: -20...(0.07 * size.height), using: &rng),
                         radius: scale * .random(in: 150...290, using: &rng),
                         drift: scale * .random(in: 6...22, using: &rng),
                         shade: .random(in: 0...1, using: &rng))
        }

        let count = Int(950 * size.width * size.height / (Self.reference.width * Self.reference.height))
        drops = (0..<max(count, 1)).map { _ in
            let depth = pow(CGFloat.random(in: 0...1, using: &rng), 1.4)
            return Drop(x: .random(in: -0.25...1.0, using: &rng) * size.width,
                        phase: .random(in: 0..<1, using: &rng),
                        speed: pace * (1300 + 1100 * depth) * .random(in: 0.9...1.1, using: &rng),
                        length: scale * (14 + 30 * depth), depth: depth)
        }.sorted { $0.depth < $1.depth }

        // Spread over the storm, the last at the charm, with room for its
        // flash to die away before the storm does.
        let times = [0.55, 1.2, 1.85, 2.45, 3.1].map { $0 + Double.random(in: -0.08...0.08, using: &rng) }
        var bolts: [Bolt] = []
        for (k, time) in times.enumerated() {
            let last = k == times.count - 1
            let ground = last ? (charm ?? Storm.groundPoint(size, &rng))
                              : Storm.groundPoint(size, &rng)
            bolts.append(Storm.bolt(at: time, to: ground, size: size, charm: last && charm != nil, using: &rng))
        }
        self.bolts = bolts
    }

    static func groundPoint<R: RandomNumberGenerator>(_ size: CGSize, _ rng: inout R) -> CGPoint {
        CGPoint(x: .random(in: 0.08...0.92, using: &rng) * size.width,
                y: .random(in: 0.55...0.95, using: &rng) * size.height)
    }

    /// A bolt by midpoint displacement: each segment is split and its middle
    /// knocked sideways by less each time, which gives the jagged line with
    /// kinks at every scale that lightning has. Forks leave the trunk lower down
    /// and head the same way, thinner and shorter.
    static func bolt<R: RandomNumberGenerator>(at time: Double, to ground: CGPoint, size: CGSize,
                                                       charm: Bool, using rng: inout R) -> Bolt {
        let top = CGPoint(x: ground.x + .random(in: -0.18...0.18, using: &rng) * size.width, y: -20)
        let trunk = jag(from: top, to: ground, spread: 0.2, depth: 6, using: &rng)
        var forks: [[CGPoint]] = []
        for k in stride(from: trunk.count / 5, to: trunk.count - 2, by: 4) {
            guard Double.random(in: 0..<1, using: &rng) < 0.7 else { continue }
            let from = trunk[k]
            let side: CGFloat = Bool.random(using: &rng) ? 1 : -1
            let length = CGFloat.random(in: 0.08...0.22, using: &rng) * size.height
            let to = CGPoint(x: from.x + side * length * .random(in: 0.35...0.8, using: &rng),
                             y: min(from.y + length, size.height))
            forks.append(jag(from: from, to: to, spread: 0.25, depth: 4, using: &rng))
        }
        return Bolt(time: time, trunk: trunk, forks: forks, ground: ground, charm: charm)
    }

    static func jag<R: RandomNumberGenerator>(from a: CGPoint, to b: CGPoint, spread: CGFloat,
                                                      depth: Int, using rng: inout R) -> [CGPoint] {
        guard depth > 0 else { return [a, b] }
        let length = hypot(b.x - a.x, b.y - a.y)
        let normal = CGVector(dx: -(b.y - a.y) / max(length, 1), dy: (b.x - a.x) / max(length, 1))
        let off = CGFloat.random(in: -1...1, using: &rng) * spread * length
        let mid = CGPoint(x: (a.x + b.x) / 2 + normal.dx * off, y: (a.y + b.y) / 2 + normal.dy * off)
        let first = jag(from: a, to: mid, spread: spread, depth: depth - 1, using: &rng)
        return first + jag(from: mid, to: b, spread: spread, depth: depth - 1, using: &rng).dropFirst()
    }

    // MARK: Over time

    /// How much of the storm's gloom is on the screen, 0 to 1: the sky closes
    /// in over the first moments and opens again at the end.
    func gloom(at t: Double) -> Double {
        let rise = min(max(t / 0.6, 0), 1), fall = min(max((duration - t) / 1.1, 0), 1)
        return rise * rise * (3 - 2 * rise) * fall * fall * (3 - 2 * fall)
    }

    /// A bolt's flash, 0 to 1, `u` seconds after it strikes: a hard first
    /// flash, a dip, a second flash, then a fall away. It is what makes a
    /// strike read as lightning rather than a line being drawn.
    static func flash(_ u: Double) -> Double {
        guard u >= 0 else { return 0 }
        if u < 0.07 { return 1 }
        if u < 0.12 { return 0.25 }
        if u < 0.2 { return 0.85 }
        return max(0, 0.55 * exp(-(u - 0.2) / 0.1) - 0.02)
    }

    /// The brightest flash on the screen at `t`, from any bolt.
    func flash(at t: Double) -> Double {
        bolts.map { Self.flash(t - $0.time) }.max() ?? 0
    }

    /// Where a drop is at `t`. It wraps from the bottom back to the top, so a
    /// drop is always somewhere, and slants as it falls.
    func position(_ d: Drop, at t: Double) -> CGPoint {
        let span = size.height + 2 * d.length
        let y = (d.phase * span + d.speed * CGFloat(t)).truncatingRemainder(dividingBy: span) - d.length
        // The slant carries drops right, so they start left of the screen to
        // fill it; wrapped sideways so none drift off for good.
        let lane = size.width * 1.25
        let x = (d.x + Self.slant * y + 0.25 * size.width).truncatingRemainder(dividingBy: lane)
        return CGPoint(x: (x < 0 ? x + lane : x) - 0.25 * size.width, y: y)
    }
}
