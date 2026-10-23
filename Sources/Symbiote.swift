import Foundation
import CoreGraphics

// MARK: - Symbiote crawl plan
//
// Where every tendril of the symbiote reaches and when its crawl gets to each
// point along it, worked out up front from a few random numbers, so a frame
// only decides how much of each to draw and how it writhes. Tendrils lunge out
// of the charm — fat, glossy, blunt-headed, the way it reaches in the films,
// not the fine branching of roots — forking now and then, and strings of goo
// stretch between neighbours. No AppKit or SwiftUI here, so the tests can grow
// one headless.

struct Symbiote {
    struct Tendril {
        let points: [CGPoint]
        let times: [Double]         // when the crawl reaches each point, seconds in
        let widths: [CGFloat]       // its thickness there, points
        /// The tendril and point it forked from; nil for one straight out of the charm.
        let parent: (tendril: Int, point: Int)?
        /// Where it is in its writhing, so no two thrash in step.
        let phase: Double
    }

    /// A string of goo stretched between two tendrils that crawled close together.
    struct Strand {
        let a: (tendril: Int, point: Int)
        let b: (tendril: Int, point: Int)
    }

    let size: CGSize
    let origin: CGPoint
    let tendrils: [Tendril]         // in the order they set off: every fork after its parent
    let strands: [Strand]
    let spread: Double              // when the last head stops crawling

    /// Spacing of the points along a tendril, points.
    static let step: CGFloat = 8
    static let maxTendrils = 70
    static let maxStrands = 110
    /// How far apart two tendrils can be for a string of goo to span them.
    static let strandReach: ClosedRange<CGFloat> = 34...80
    /// The screen it's tuned on. Bigger screens get thicker, faster tendrils
    /// rather than more of them, so every display is reached in the same time.
    static let reference = CGSize(width: 1512, height: 982)
    /// Roughly how long the crawl takes to reach across the screen.
    static let crawlTime = 1.8

    private struct Bud {
        var at: CGPoint
        var heading: CGFloat        // radians, y-down: π/2 is straight down
        var width: CGFloat
        var reach: CGFloat
        var time: Double
        var speed: CGFloat          // points per second, between lunges and pauses
        var parent: (tendril: Int, point: Int)?
    }

    init<R: RandomNumberGenerator>(size: CGSize, from origin: CGPoint, using rng: inout R) {
        self.size = size
        self.origin = origin
        let diagonal = hypot(size.width, size.height)
        let scale = min(max(diagonal / hypot(Self.reference.width, Self.reference.height), 0.7), 1.8)
        let bounds = CGRect(origin: .zero, size: size).insetBy(dx: -30, dy: -30)

        // The main tendrils lunge out of the charm, a little past level on
        // each side and mostly down, since it hangs at the top.
        var buds: [Bud] = []
        let mains = 18
        for i in 0..<mains {
            let a = -0.4 + (.pi + 0.8) * (CGFloat(i) + 0.5 + .random(in: -0.35...0.35, using: &rng)) / CGFloat(mains)
            buds.append(Bud(at: origin, heading: a, width: 26 * scale * .random(in: 0.75...1.2, using: &rng),
                            reach: diagonal * .random(in: 0.6...1.0, using: &rng),
                            time: .random(in: 0...0.15, using: &rng),
                            speed: 1.25 * diagonal / CGFloat(Self.crawlTime) * .random(in: 0.85...1.15, using: &rng),
                            parent: nil))
        }

        var tendrils: [Tendril] = []
        var next = 0
        while next < buds.count {
            let bud = buds[next]
            next += 1
            let index = tendrils.count
            var p = bud.at, heading = bud.heading, curl: CGFloat = 0, t = bud.time
            var points = [p], times = [t], widths = [bud.width]
            var travelled: CGFloat = 0
            let lunge = Double.random(in: 0..<(2 * .pi), using: &rng)
            while travelled < bud.reach {
                // A slow, sweeping turn: it reaches, it doesn't wander.
                curl = min(max(curl + .random(in: -0.02...0.02, using: &rng), -0.035), 0.035)
                heading += curl
                p = CGPoint(x: p.x + cos(heading) * Self.step, y: p.y + sin(heading) * Self.step)
                guard bounds.contains(p) else { break }
                travelled += Self.step
                let s = travelled / bud.reach
                // It lunges and pauses: fast through each surge, slow between.
                let surge = pow(max(0, sin(Double(travelled) / 75 + lunge)), 2)
                t += Double(Self.step / (bud.speed * CGFloat(0.45 + 1.6 * surge)))
                // Thick the whole way, ending blunt rather than in a point.
                let w = max(8 * scale, bud.width * (1 - 0.45 * s))
                points.append(p); times.append(t); widths.append(w)

                if w > 12 * scale, buds.count < Self.maxTendrils, Double.random(in: 0..<1, using: &rng) < 0.014 {
                    let side: CGFloat = Bool.random(using: &rng) ? 1 : -1
                    buds.append(Bud(at: p, heading: heading + side * .random(in: 0.4...0.9, using: &rng),
                                    width: w * .random(in: 0.6...0.8, using: &rng),
                                    reach: (bud.reach - travelled) * .random(in: 0.4...0.75, using: &rng) + 100 * scale,
                                    time: t, speed: bud.speed * .random(in: 0.85...1.05, using: &rng),
                                    parent: (index, points.count - 1)))
                }
            }
            tendrils.append(Tendril(points: points, times: times, widths: widths, parent: bud.parent,
                                    phase: .random(in: 0..<(2 * .pi), using: &rng)))
        }
        self.tendrils = tendrils
        spread = tendrils.map { $0.times.last ?? 0 }.max() ?? 0

        // Strings of goo: from points a little way along each tendril to the
        // nearest point of another that crawled within reach. Tendrils taken
        // in no order, so the strings don't all go to the first few.
        var strands: [Strand] = []
        search: for i in tendrils.indices.shuffled(using: &rng) {
            let a = tendrils[i]
            for j in stride(from: 4, to: a.points.count, by: 7) where Bool.random(using: &rng) {
                var best: (tendril: Int, point: Int, d: CGFloat)?
                for (k, b) in tendrils.enumerated() where k != i {
                    for (m, q) in b.points.enumerated() where m >= 4 {
                        let d = a.points[j].dist(q)
                        if Self.strandReach.contains(d), d < (best?.d ?? .infinity) { best = (k, m, d) }
                    }
                }
                if let best { strands.append(Strand(a: (i, j), b: (best.tendril, best.point))) }
                if strands.count >= Self.maxStrands { break search }
            }
        }
        self.strands = strands
    }
}
