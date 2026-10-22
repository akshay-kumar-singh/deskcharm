import Foundation
import simd

// MARK: - Cloth
//
// A window as a flexible sheet, swung about by one edge so that it whips and
// flops, and slammed into the floor so that it splats against it and springs
// back. It lives in the plane of the screen — seen face on, a sheet slammed
// flat onto a floor would vanish edge-on — in points, y up. No AppKit or
// SceneKit here, so it can be tested headless.
//
// Bent in its own plane, a sheet has to stretch round the outside of the
// curve and squash on the inside, so a grid of particles tied rigidly to its
// neighbours won't bend at all, and one tied loosely is taffy when swung. So
// it's a grid stepped with Verlet integration like the charm's chain, kept in
// shape by shape matching — strips of it, overlapping, each pulled back toward
// the nearest turn of their shape at rest — with its middle row held to its
// length and the rest let stretch or squash only so far. It bends and wobbles
// like a rubber mat, and never crumples or pulls out long.

final class Cloth {
    let columns: Int
    let rows: Int
    private(set) var points: [SIMD2<Float>]
    private var old: [SIMD2<Float>]
    private var held: [Int: SIMD2<Float>] = [:]
    private var heldFrom: [Int: SIMD2<Float>] = [:]
    private var grips: [Int: SIMD2<Float>] = [:]

    /// A strip of whole columns, and where its points sit at rest.
    private struct Strip {
        let members: [Int]
        let shape: [SIMD2<Float>]
    }
    private var strips: [Strip] = []
    /// How many strips each point is in.
    private var shares: [Float]

    /// Neighbours along a row or down a column, and how far apart they may get.
    private struct Link {
        let a: Int, b: Int
        let shortest: Float, longest: Float
    }
    private var links: [Link] = []
    private let spacing: Float

    var gravity: Float = 2400
    var floor: Float = 0
    var walls: ClosedRange<Float> = -.greatestFiniteMagnitude...(.greatestFiniteMagnitude)
    var damping: Float = 0.997
    /// How hard it springs back into shape each step, 0 to 1.
    var stiffness: Float = 0.3
    var iterations = 6

    /// Points striking the floor since this was last emptied, and how hard.
    var landings: [(at: SIMD2<Float>, speed: Float)] = []

    private let step: Float = 1 / 240
    private var accumulator: Double = 0
    /// What a held point counts for, against a free one, in finding a
    /// strip's turn: held, the strip goes where the fist turns it.
    private let grip: Float = 40

    /// A sheet `width` by `height`, `columns` by `rows` points, laid flat
    /// with its top left at `topLeft`. Row 0 is the top edge.
    init(columns: Int, rows: Int, width: Float, height: Float, topLeft: SIMD2<Float>) {
        self.columns = columns
        self.rows = rows
        let dx = width / Float(columns - 1), dy = height / Float(rows - 1)
        spacing = dx
        points = (0..<(columns * rows)).map { i in topLeft + SIMD2(Float(i % columns) * dx, -Float(i / columns) * dy) }
        old = points
        shares = Array(repeating: 0, count: points.count)
        // Strips four columns wide, every two: each overlaps the next by half.
        var first = 0
        while true {
            let last = min(first + 3, columns - 1)
            let members = (0..<rows).flatMap { r in (first...last).map { r * columns + $0 } }
            strips.append(Strip(members: members, shape: members.map { points[$0] }))
            for i in members { shares[i] += 1 }
            if last == columns - 1 { break }
            first += 2
        }
        for r in 0..<rows {
            for c in 0..<columns {
                let i = r * columns + c
                if c + 1 < columns {
                    // Away from the middle, a row may give by up to a quarter.
                    let give: Float = r == rows / 2 ? 0 : 0.25
                    links.append(Link(a: i, b: i + 1, shortest: dx * (1 - give), longest: dx * (1 + give)))
                }
                if r + 1 < rows { links.append(Link(a: i, b: i + columns, shortest: dy * 0.9, longest: dy * 1.1)) }
                // Across each square both ways, so it can't shear over flat.
                if c + 1 < columns, r + 1 < rows {
                    let d = (dx * dx + dy * dy).squareRoot()
                    links.append(Link(a: i, b: i + columns + 1, shortest: d * 0.88, longest: d * 1.12))
                    links.append(Link(a: i + 1, b: i + columns, shortest: d * 0.88, longest: d * 1.12))
                }
            }
        }
    }

    func index(_ column: Int, _ row: Int) -> Int { row * columns + column }

    /// Moves every point to where `place` says, at rest there.
    func place(_ place: (_ column: Int, _ row: Int) -> SIMD2<Float>) {
        for i in points.indices { points[i] = place(i % columns, i / columns) }
        old = points
    }

    /// Pins points where something holds them, from the next advance on;
    /// the rest hang off them. A grip that moves is moved there smoothly
    /// over the steps of that advance, not jumped, which would jolt the sheet.
    func hold(_ grips: [Int: SIMD2<Float>]) {
        heldFrom = held.isEmpty ? grips : held
        self.grips = grips
        if held.isEmpty { held = grips }
    }

    /// Lets go, sending the whole sheet off at `velocity` points a second.
    func release(velocity: SIMD2<Float>) {
        held = [:]
        grips = [:]
        for i in points.indices { old[i] = points[i] - velocity * step }
    }

    /// Advances by `dt` in fixed steps, so the solve stays stable however
    /// the frames fall.
    func advance(_ dt: Double) {
        accumulator += min(max(dt, 0), 0.05)
        let steps = Int(accumulator / Double(step))
        for k in 0..<steps {
            if !grips.isEmpty {
                let u = Float(k + 1) / Float(steps)
                held = grips.reduce(into: [:]) { $0[$1.key] = simd_mix(heldFrom[$1.key] ?? $1.value, $1.value, SIMD2(repeating: u)) }
            }
            tick()
            accumulator -= Double(step)
        }
    }

    private func tick() {
        let g = SIMD2<Float>(0, -gravity * step * step)
        for i in points.indices {
            if let grip = held[i] {
                old[i] = points[i]
                points[i] = grip
                continue
            }
            let v = (points[i] - old[i]) * damping
            old[i] = points[i]
            points[i] += v + g
        }
        reshape()
        for _ in 0..<iterations {
            for l in links {
                let pa = points[l.a], pb = points[l.b]
                let d = simd_distance(pa, pb)
                guard d > 0.0001, d < l.shortest || d > l.longest else { continue }
                let fa: Float = held[l.a] == nil ? 1 : 0, fb: Float = held[l.b] == nil ? 1 : 0
                guard fa + fb > 0 else { continue }
                let to = min(max(d, l.shortest), l.longest)
                let shift = (pb - pa) * ((d - to) / d / (fa + fb))
                points[l.a] += shift * fa
                points[l.b] -= shift * fb
            }
            collide()
        }
        // However hard it's swung, the middle row can't pull out long: worked
        // out along from the fist, each column brought back in to its place.
        let middle = rows / 2 * columns
        for c in 1..<columns where held[middle + c] == nil {
            let a = points[middle + c - 1], b = points[middle + c]
            let d = simd_distance(a, b)
            guard d > spacing else { continue }
            let shift = (a - b) * ((d - spacing) / d)
            for r in 0..<rows where held[r * columns + c] == nil { points[r * columns + c] += shift }
        }
        collide()
    }

    /// Each strip's best fit of its shape at rest — about its middle, turned
    /// by whatever angle lines its points up best — and every point pulled
    /// toward where the strips it's in would have it.
    private func reshape() {
        var goals = [SIMD2<Float>](repeating: SIMD2(0, 0), count: points.count)
        for strip in strips {
            var middle = SIMD2<Float>(0, 0), restMiddle = SIMD2<Float>(0, 0), mass: Float = 0
            for (j, i) in strip.members.enumerated() {
                let m = held[i] == nil ? 1 : grip
                middle += points[i] * m
                restMiddle += strip.shape[j] * m
                mass += m
            }
            middle /= mass
            restMiddle /= mass
            var along: Float = 0, across: Float = 0
            for (j, i) in strip.members.enumerated() {
                let m = held[i] == nil ? 1 : grip
                let p = points[i] - middle, q = strip.shape[j] - restMiddle
                along += m * (q.x * p.x + q.y * p.y)
                across += m * (q.x * p.y - q.y * p.x)
            }
            let size = (along * along + across * across).squareRoot()
            let c = size > 0 ? along / size : 1, s = size > 0 ? across / size : 0
            for (j, i) in strip.members.enumerated() {
                let q = strip.shape[j] - restMiddle
                goals[i] += middle + SIMD2(c * q.x - s * q.y, s * q.x + c * q.y)
            }
        }
        for i in points.indices where held[i] == nil {
            points[i] += (goals[i] / shares[i] - points[i]) * stiffness
        }
    }

    /// The floor stops it dead, scrubbing off most of its slide; the
    /// screen's sides keep it on screen.
    private func collide() {
        for i in points.indices where held[i] == nil {
            if points[i].y < floor {
                let speed = (old[i].y - points[i].y) / step
                if speed > 60 { landings.append((SIMD2(points[i].x, floor), speed)) }
                points[i].y = floor
                old[i].y = floor
                old[i].x = points[i].x - (points[i].x - old[i].x) * 0.5
            }
            if !walls.contains(points[i].x) {
                points[i].x = min(max(points[i].x, walls.lowerBound), walls.upperBound)
                old[i].x = points[i].x
            }
        }
    }
}
