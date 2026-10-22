import Foundation
import CoreGraphics

// MARK: - Swarm flight plan
//
// Where every bat in a swarm is at any moment, worked out up front from a few
// random numbers each, so drawing a frame is only lookups. No AppKit or
// SwiftUI here, so the tests can fly a swarm headless.

struct Swarm {
    struct Bat {
        let start: Double           // seconds into the swarm that it sets off
        let x: CGFloat              // where it comes up from
        let drift: CGFloat          // sideways, points per second
        let climb: CGFloat          // upward, points per second
        let sway: CGFloat           // sideways weave, points
        let swayRate: Double        // radians per second
        let swayPhase: Double
        let wingbeat: Double        // beats per second
        let beatPhase: Double       // 0..<1
        let span: CGFloat           // wingspan as drawn, points
        let reach: CGFloat          // furthest its sprite reaches from its body, however it turns
        let depth: CGFloat          // 0 far ... 1 near
    }

    struct Pose {
        let at: CGPoint
        let heading: CGFloat        // radians, y-down: -π/2 is straight up
        let beat: Double            // 0..<1 through the wingbeat
    }

    let size: CGSize
    let aspect: CGFloat             // sprite height over width
    let bats: [Bat]                 // far to near, which is also the draw order
    let duration: Double

    /// Bats are added until their wings, laid side by side, would cover the
    /// screen `cover` times over. They overlap and come and go, so that
    /// leaves it mostly but not wholly blotted out at the peak.
    static let cover: CGFloat = 1.75
    static let maxBats = 3200
    /// The screen the swarm is tuned on. Bigger screens get bigger, faster
    /// bats rather than more of them, so every display gets the same swarm in
    /// the same time.
    static let reference = CGSize(width: 1512, height: 982)
    /// Most set off in the first part of this, so they rise as a wave.
    static let burst = 1.0

    /// `fill` is how much of its sprite's box a bat covers, averaged over a
    /// wingbeat; `aspect` is the sprite's height over its width.
    init<R: RandomNumberGenerator>(size: CGSize, fill: CGFloat, aspect: CGFloat, using rng: inout R) {
        self.size = size
        self.aspect = aspect
        let budget = Self.cover * size.width * size.height
        let diagonal = (1 + aspect * aspect).squareRoot()
        let scale = min(max((size.width * size.height / (Self.reference.width * Self.reference.height)).squareRoot(), 0.8), 1.8)
        let pace = size.height / Self.reference.height
        var bats: [Bat] = []
        var area: CGFloat = 0
        while area < budget && bats.count < Self.maxBats {
            // A few swoop right past the viewer; the rest are mostly far and small.
            let near = Double.random(in: 0..<1, using: &rng) < 0.03
            let depth: CGFloat = near ? 1 : pow(.random(in: 0...1, using: &rng), 1.6)
            let span = scale * (near ? .random(in: 150...230, using: &rng) : 24 + 86 * depth)
            let climb = pace * (near ? .random(in: 1300...1700, using: &rng)
                                     : (420 + 620 * depth) * .random(in: 0.88...1.12, using: &rng))
            let x = CGFloat.random(in: -0.04...1.04, using: &rng) * size.width
            // Fanning outward as they rise, like a burst rather than a column.
            let drift = pace * ((x / size.width - 0.5) * 140 + .random(in: -70...70, using: &rng))
            bats.append(Bat(start: Self.burst * pow(.random(in: 0...1, using: &rng), 1.25),
                            x: x, drift: drift, climb: climb,
                            sway: (5 + 20 * depth) * .random(in: 0.6...1.4, using: &rng),
                            swayRate: .random(in: 4.5...8.5, using: &rng),
                            swayPhase: .random(in: 0..<(2 * .pi), using: &rng),
                            wingbeat: Double(13 - 5 * depth) * .random(in: 0.85...1.15, using: &rng),
                            beatPhase: .random(in: 0..<1, using: &rng),
                            span: span, reach: span * diagonal / 2, depth: depth))
            area += fill * span * span * aspect
        }
        self.bats = bats.sorted { ($0.depth, $0.span) < ($1.depth, $1.span) }
        duration = bats.map { $0.start + Double((size.height + 2 * $0.reach) / $0.climb) }.max() ?? 0
    }

    /// Nil before it sets off and once it has gone over the top.
    func pose(_ b: Bat, at t: Double) -> Pose? {
        let u = t - b.start
        guard u >= 0 else { return nil }
        // Sets off just out of sight below the bottom edge.
        let y = size.height + b.reach - b.climb * CGFloat(u)
        guard y > -b.reach else { return nil }
        let a = b.swayRate * u + b.swayPhase
        let x = b.x + b.drift * CGFloat(u) + b.sway * CGFloat(sin(a))
        let vx = b.drift + b.sway * CGFloat(b.swayRate * cos(a))
        return Pose(at: CGPoint(x: x, y: y), heading: atan2(-b.climb, vx),
                    beat: (b.beatPhase + b.wingbeat * u).truncatingRemainder(dividingBy: 1))
    }
}

/// Seeded random numbers, so the tests fly the same swarm every run.
struct SplitMix64: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
