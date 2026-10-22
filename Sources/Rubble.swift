import Foundation
import CoreGraphics

// MARK: - Smashed concrete
//
// What a blow leaves in a concrete wall: a crater with a jagged rim, chips
// knocked off round it, cracks running away from it that fork and thin as
// they go, and chunks thrown out. Geometry only, so it can be tested headless.

struct Crater {
    /// A crack's path, and how wide it is where it starts; it thins to a
    /// hairline by its end.
    struct Crack {
        let points: [CGPoint]
        let width: CGFloat
    }

    /// A piece of concrete knocked loose: its outline about its own middle,
    /// where that middle starts, and how it's sent flying.
    struct Chunk {
        let outline: [CGPoint]
        let start: CGPoint
        let velocity: CGVector
        let spin: Double
        let shade: Double           // lighter or darker than the wall, 0.7...1.2
    }

    /// Pulls every falling piece down, in points per second per second.
    static let gravity: CGFloat = 2400

    let centre: CGPoint
    let radius: CGFloat
    let rim: [CGPoint]
    let chips: [[CGPoint]]
    let cracks: [Crack]
    /// Thrown out by the blow.
    let thrown: [Chunk]
    /// The crater itself and its chips, for when it crumbles away.
    let crumbs: [Chunk]

    init<R: RandomNumberGenerator>(centre: CGPoint, radius: CGFloat, bounds: CGRect, using rng: inout R) {
        self.centre = centre
        self.radius = radius
        let corners = Int.random(in: 18...24, using: &rng)
        let rim = (0..<corners).map { i -> CGPoint in
            let a = (Double(i) + .random(in: -0.3...0.3, using: &rng)) / Double(corners) * 2 * .pi
            let r = radius * .random(in: 0.72...1.12, using: &rng)
            return CGPoint(x: centre.x + r * CGFloat(cos(a)), y: centre.y + r * CGFloat(sin(a)))
        }
        // A broad ring of the wall's face knocked off round the crater.
        let chips = (0..<Int.random(in: 12...18, using: &rng)).map { _ -> [CGPoint] in
            let a = Double.random(in: 0..<(2 * .pi), using: &rng)
            let d = radius * .random(in: 0.95...1.75, using: &rng)
            let at = CGPoint(x: centre.x + d * CGFloat(cos(a)), y: centre.y + d * CGFloat(sin(a)))
            return Self.lump(at: at, size: .random(in: 8...24, using: &rng), corners: .random(in: 3...5, using: &rng), using: &rng)
        }
        self.rim = rim
        self.chips = chips

        // Cracks run outward from the rim in straight-ish runs with sharp
        // kinks, as concrete breaks, forking now and then, each branch
        // thinner than what it left; they stop once they've thinned to
        // nothing or run off the screen.
        let diagonal = (bounds.width * bounds.width + bounds.height * bounds.height).squareRoot()
        let room = bounds.insetBy(dx: -40, dy: -40)
        var growing: [(at: CGPoint, heading: Double, width: CGFloat, thinning: CGFloat, depth: Int)] = []
        let main = Int.random(in: 7...10, using: &rng)
        for j in 0..<main {
            let heading = (Double(j) + .random(in: -0.35...0.35, using: &rng)) / Double(main) * 2 * .pi
            let at = CGPoint(x: centre.x + radius * 0.9 * CGFloat(cos(heading)), y: centre.y + radius * 0.9 * CGFloat(sin(heading)))
            let width = CGFloat.random(in: 4...6, using: &rng)
            growing.append((at, heading, width, width / (diagonal * .random(in: 0.5...1.0, using: &rng)), 0))
        }
        var cracks: [Crack] = []
        while let seed = growing.popLast() {
            var points = [seed.at], at = seed.at, heading = seed.heading, width = seed.width
            while width > 0.6, room.contains(at), points.count < 90 {
                let step = CGFloat.random(in: 18...38, using: &rng)
                // Holds its line, kinking now and then, and keeps leaning away from the blow.
                let away = atan2(Double(at.y - centre.y), Double(at.x - centre.x))
                let kink = Double.random(in: 0...1, using: &rng) < 0.3 ? Double.random(in: -0.45...0.45, using: &rng) : 0
                heading += kink + .random(in: -0.08...0.08, using: &rng) + 0.12 * remainder(away - heading, 2 * .pi)
                at = CGPoint(x: at.x + step * CGFloat(cos(heading)), y: at.y + step * CGFloat(sin(heading)))
                points.append(at)
                width -= step * seed.thinning
                if seed.depth < 2, width > 1.4, Double.random(in: 0...1, using: &rng) < 0.07 {
                    let fork = Double.random(in: 0.5...1.0, using: &rng) * (Bool.random(using: &rng) ? 1 : -1)
                    growing.append((at, heading + fork, width * 0.55, seed.thinning * 1.4, seed.depth + 1))
                }
            }
            if points.count > 1 { cracks.append(Crack(points: points, width: seed.width)) }
        }
        self.cracks = cracks

        thrown = (0..<Int.random(in: 18...28, using: &rng)).map { _ in
            let a = Double.random(in: 0..<(2 * .pi), using: &rng)
            let speed = CGFloat.random(in: 220...700, using: &rng)
            let from = CGPoint(x: centre.x + radius * 0.5 * CGFloat(cos(a)), y: centre.y + radius * 0.5 * CGFloat(sin(a)))
            return Chunk(outline: Self.lump(at: .zero, size: .random(in: 4...15, using: &rng), corners: .random(in: 5...7, using: &rng), using: &rng),
                         start: from, velocity: CGVector(dx: speed * CGFloat(cos(a)), dy: speed * CGFloat(sin(a)) - 250),
                         spin: .random(in: -7...7, using: &rng), shade: .random(in: 0.7...1.2, using: &rng))
        }

        // The crater breaks up into wedges, inner and outer, and its chips go too.
        var crumbs: [Chunk] = []
        for i in rim.indices {
            let a = rim[i], b = rim[(i + 1) % rim.count]
            let mid = { (p: CGPoint, q: CGPoint) in CGPoint(x: (p.x + q.x) / 2, y: (p.y + q.y) / 2) }
            for piece in [[centre, mid(centre, a), mid(centre, b)], [mid(centre, a), a, b, mid(centre, b)]] {
                crumbs.append(Self.loose(piece, push: 90, using: &rng))
            }
        }
        for chip in chips { crumbs.append(Self.loose(chip, push: 60, using: &rng)) }
        self.crumbs = crumbs
    }

    /// Where a piece is `τ` seconds after it comes loose.
    static func position(of chunk: Chunk, after τ: Double) -> CGPoint {
        let t = CGFloat(max(0, τ))
        return CGPoint(x: chunk.start.x + chunk.velocity.dx * t,
                       y: chunk.start.y + chunk.velocity.dy * t + 0.5 * gravity * t * t)
    }

    /// A rough lump of concrete round `at`.
    private static func lump<R: RandomNumberGenerator>(at: CGPoint, size: CGFloat, corners: Int, using rng: inout R) -> [CGPoint] {
        (0..<corners).map { i in
            let a = (Double(i) + .random(in: -0.25...0.25, using: &rng)) / Double(corners) * 2 * .pi
            let r = size * .random(in: 0.6...1.0, using: &rng)
            return CGPoint(x: at.x + r * CGFloat(cos(a)), y: at.y + r * CGFloat(sin(a)))
        }
    }

    /// An outline, recentred on its own middle, set loose with a nudge outward.
    private static func loose<R: RandomNumberGenerator>(_ outline: [CGPoint], push: CGFloat, using rng: inout R) -> Chunk {
        let middle = CGPoint(x: outline.map(\.x).reduce(0, +) / CGFloat(outline.count),
                             y: outline.map(\.y).reduce(0, +) / CGFloat(outline.count))
        let a = Double.random(in: 0..<(2 * .pi), using: &rng)
        return Chunk(outline: outline.map { CGPoint(x: $0.x - middle.x, y: $0.y - middle.y) }, start: middle,
                     velocity: CGVector(dx: push * CGFloat(cos(a)), dy: push * CGFloat(sin(a)) - 60),
                     spin: .random(in: -3...3, using: &rng), shade: .random(in: 0.7...1.2, using: &rng))
    }
}
