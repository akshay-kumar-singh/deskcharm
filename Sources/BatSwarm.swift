import SwiftUI

// MARK: - Bat swarm
//
// Batman's answer to being thrown about: a swarm of bats bursts up from the
// bottom of the screen, all but blotting it out, and is gone over the top.
//
// Like the web blast it is only paint on a click-through overlay: clicks,
// keys and focus all go to whatever is beneath as usual.

final class BatSwarm {
    private let plan: Swarm
    private let frames: [Image]
    private let body: CGPoint               // the bat's body, as a fraction of a frame
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    private var start: Date?
    private var ended = false

    init(plan: Swarm, frames: [Image], body: CGPoint,
         push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.plan = plan
        self.frames = frames
        self.body = body
        self.push = push
        self.sound = sound
        self.finish = finish
    }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil {
            start = date
            // The charm is buffeted as the swarm goes up past it.
            push(CGVector(dx: .random(in: -1...1) * 140, dy: -90))
            sound(.flutter)
        }
        let t = date.timeIntervalSince(start ?? date)
        if !ended, t >= plan.duration {
            ended = true
            finish()
        }
        draw(&ctx, t)
    }

    /// Hundreds of bats a frame, so each sets the context's transform outright
    /// and draws an image resolved once per frame, rather than copying the
    /// context and resolving per bat.
    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        guard !frames.isEmpty else { return }
        let sprites = frames.map { ctx.resolve($0) }
        let base = ctx.transform
        for b in plan.bats {
            guard let p = plan.pose(b, at: t) else { continue }
            let w = b.span, h = b.span * plan.aspect
            // Seen face on, so drawn upright, leaning into the way it's veering.
            let lean = (p.heading + .pi / 2) * 0.7
            ctx.transform = CGAffineTransform(translationX: p.at.x, y: p.at.y).rotated(by: lean).concatenating(base)
            // Far bats are a little paler, as if seen through more air.
            ctx.opacity = Double(0.62 + 0.38 * b.depth)
            ctx.draw(sprites[Int(p.beat * Double(sprites.count)) % sprites.count],
                     in: CGRect(x: -body.x * w, y: -body.y * h, width: w, height: h))
        }
        ctx.transform = base
        ctx.opacity = 1
    }
}

// MARK: Overlay

struct BatSwarmView: View {
    let swarm: BatSwarm?

    var body: some View {
        if let swarm {
            TimelineView(.animation) { timeline in
                Canvas { ctx, _ in swarm.render(&ctx, at: timeline.date) }
            }
            .drawingGroup()
        }
    }
}
