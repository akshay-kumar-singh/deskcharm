import Foundation
import CoreGraphics

// MARK: - Geometry helpers

extension CGPoint {
    static func + (a: CGPoint, b: CGVector) -> CGPoint { CGPoint(x: a.x + b.dx, y: a.y + b.dy) }
    static func - (a: CGPoint, b: CGPoint) -> CGVector { CGVector(dx: a.x - b.x, dy: a.y - b.y) }
    func dist(_ o: CGPoint) -> CGFloat { hypot(x - o.x, y - o.y) }
}

extension CGVector {
    static func * (v: CGVector, s: CGFloat) -> CGVector { CGVector(dx: v.dx * s, dy: v.dy * s) }
}

// MARK: - Rope simulation
//
// Position-based dynamics: Verlet integration plus distance constraints solved
// iteratively. Constraints are weighted by inverse mass, which is what lets a
// heavy charm hang off a light chain without the chain stretching.

final class RopeSim {
    struct Node { var p: CGPoint; var old: CGPoint }

    private(set) var nodes: [Node] = []
    private(set) var anchor: CGPoint = .zero
    private(set) var segLen: CGFloat = 16
    private var invMass: [CGFloat] = []

    // Tuned for how a desk toy should read, not for literal physical scale.
    // Over a 240pt chain this gives a period near 2.6s — about a playground
    // swing — and a decay that stays visible for roughly twenty seconds.
    var gravity: CGFloat = 1400
    var damping: CGFloat = 0.9995
    var iterations = 24
    var charmMass: CGFloat = 3.5
    var breeze: CGFloat = 1.0

    /// Resistance to folding. Distance constraints alone let the chain buckle
    /// back on itself the moment it goes slack, which reads as the charm
    /// jerking rather than swinging. Real links cannot hinge that sharply.
    var bendStiffness: CGFloat = 0.25
    private let straightness: CGFloat = 0.96

    private(set) var grabbed = false
    private var grabTarget: CGPoint = .zero
    private var grabOffset: CGVector = .zero

    /// How hard the charm chases the pointer. Deliberately a soft pull rather
    /// than a hard pin: the lag is what gives a release its throw velocity.
    /// Pinning the node each substep destroys that velocity, because the pin
    /// stops moving between pointer events while the sim keeps stepping.
    private let grabFollow: CGFloat = 0.06

    private(set) var tipAngle: CGFloat = 0
    private let angleFollow: CGFloat = 0.12

    private var lastTime: TimeInterval = 0
    private var accumulator: Double = 0
    private var clock: Double = 0

    func reset(anchor: CGPoint, count: Int, segLen: CGFloat) {
        self.anchor = anchor
        self.segLen = segLen
        nodes = (0..<count).map { i in
            let p = CGPoint(x: anchor.x, y: anchor.y + CGFloat(i) * segLen)
            return Node(p: p, old: p)
        }
        // Node 0 is pinned to the ceiling; the last node carries the charm.
        invMass = (0..<count).map { i in
            if i == 0 { return 0 }
            return i == count - 1 ? 1 / charmMass : 1
        }
        tipAngle = 0
        grabbed = false
    }

    /// Driven from the display clock, stepped at a fixed rate so the constraint
    /// solver stays stable regardless of frame timing.
    func advance(to date: Date) {
        let now = date.timeIntervalSinceReferenceDate
        guard lastTime != 0 else { lastTime = now; return }
        var dt = now - lastTime
        lastTime = now
        // Clamp after a stall so the rope doesn't explode, and refuse negative
        // steps outright — a backwards clock must not unwind the simulation.
        dt = max(0, min(dt, 0.05))
        accumulator += dt
        let fixed = 1.0 / 240.0
        var guardCount = 0
        while accumulator >= fixed && guardCount < 32 {
            step(dt: fixed)
            accumulator -= fixed
            guardCount += 1
        }
    }

    private func step(dt: Double) {
        guard nodes.count > 1 else { return }
        clock += dt
        let dt2 = CGFloat(dt * dt)
        let last = nodes.count - 1

        // Two detuned sines read as air movement rather than a loop.
        let wind = CGFloat(sin(clock * 0.53) * 0.6 + sin(clock * 0.17) * 0.4) * 55 * breeze

        for i in 1..<nodes.count {
            var n = nodes[i]
            let vel = (n.p - n.old) * damping
            n.old = n.p
            // Gravity is an acceleration, so every node gets the same amount.
            // The charm's weight belongs in the constraint solve, not here.
            n.p = n.p + CGVector(dx: vel.dx + wind * dt2, dy: vel.dy + gravity * dt2)
            nodes[i] = n
        }

        // Dragging pulls the charm toward the pointer rather than pinning it,
        // so momentum accumulates in the Verlet state and survives release.
        if grabbed {
            var n = nodes[last]
            n.p = CGPoint(x: n.p.x + (grabTarget.x - n.p.x) * grabFollow,
                          y: n.p.y + (grabTarget.y - n.p.y) * grabFollow)
            nodes[last] = n
        }

        for _ in 0..<iterations {
            nodes[0].p = anchor
            nodes[0].old = anchor
            for i in 0..<last {
                let a = nodes[i].p, b = nodes[i + 1].p
                let d = a.dist(b)
                guard d > 0.0001 else { continue }
                let w1 = invMass[i], w2 = invMass[i + 1]
                let wsum = w1 + w2
                guard wsum > 0 else { continue }
                let corr = (d - segLen) / d
                let dx = (b.x - a.x) * corr, dy = (b.y - a.y) * corr
                nodes[i].p = CGPoint(x: a.x + dx * (w1 / wsum), y: a.y + dy * (w1 / wsum))
                nodes[i + 1].p = CGPoint(x: b.x - dx * (w2 / wsum), y: b.y - dy * (w2 / wsum))
            }

            // One-sided bending constraint: pushes apart links two steps apart
            // only when they fold inward, so the chain still hangs and curves
            // naturally but cannot kink.
            let bendTarget = 2 * segLen * straightness
            for i in 0..<(last - 1) {
                let a = nodes[i].p, b = nodes[i + 2].p
                let d = a.dist(b)
                guard d > 0.0001, d < bendTarget else { continue }
                let w1 = invMass[i], w2 = invMass[i + 2]
                let wsum = w1 + w2
                guard wsum > 0 else { continue }
                let corr = (d - bendTarget) / d * bendStiffness
                let dx = (b.x - a.x) * corr, dy = (b.y - a.y) * corr
                nodes[i].p = CGPoint(x: a.x + dx * (w1 / wsum), y: a.y + dy * (w1 / wsum))
                nodes[i + 2].p = CGPoint(x: b.x - dx * (w2 / wsum), y: b.y - dy * (w2 / wsum))
            }
        }

        updateAngle()
    }

    /// Measured across several links rather than the last one alone: a single
    /// ~11pt segment is too short to give a steady reading and the charm jitters.
    /// The follow term then adds a little rotational lag, like a real pendant.
    private func updateAngle() {
        let last = nodes.count - 1
        let base = max(0, last - 3)
        guard base < last else { return }
        let a = nodes[base].p, b = nodes[last].p
        let raw = atan2(b.x - a.x, b.y - a.y)
        var delta = raw - tipAngle
        while delta > .pi { delta -= 2 * .pi }
        while delta < -.pi { delta += 2 * .pi }
        tipAngle += delta * angleFollow
    }

    var tip: CGPoint { nodes.last?.p ?? anchor }

    func grab(_ p: CGPoint) {
        if !grabbed {
            grabbed = true
            // Keep hold of the charm where it was actually picked up, so a
            // click never snaps its attach point to the pointer.
            grabOffset = tip - p
        }
        grabTarget = CGPoint(x: p.x + grabOffset.dx, y: p.y + grabOffset.dy)
    }

    /// Pulls the chain aside and lets go from rest, proportional to depth —
    /// the same starting condition as a hand releasing the charm. Used by the
    /// trace build to start a swing with no pointer involved.
    func kick(angle: CGFloat) {
        guard nodes.count > 1 else { return }
        // Rotate the whole chain rigidly about the anchor. Displacing nodes
        // sideways at constant height instead would stretch the chain and the
        // constraint solver would snap it back, injecting enormous energy.
        for i in 1..<nodes.count {
            let d = CGFloat(i) * segLen
            let p = CGPoint(x: anchor.x + sin(angle) * d, y: anchor.y + cos(angle) * d)
            nodes[i].p = p
            nodes[i].old = p              // released from rest
        }
    }

    func release() { grabbed = false }
}
