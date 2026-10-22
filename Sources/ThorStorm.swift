import SwiftUI

// MARK: - Thunderstorm
//
// Thor's answer to being thrown about: the sky closes in over the screen,
// rain sheets down, and lightning forks out of the cloud — the last bolt
// straight into the charm, which is jolted by it — with thunder rolling in
// behind each flash.
//
// Like the web blast it is only paint on a click-through overlay: clicks,
// keys and focus all go to whatever is beneath as usual.

final class ThorStorm {
    private let plan: Storm
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    private var start: Date?
    private var struck = 0                  // bolts whose flash has gone off
    private var thundered = 0               // bolts whose thunder has arrived
    private var ended = false


    init(plan: Storm, push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.plan = plan
        self.push = push
        self.sound = sound
        self.finish = finish
    }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil {
            start = date
            sound(.rain)
        }
        let t = date.timeIntervalSince(start ?? date)
        cues(t)
        if !ended, t >= plan.duration {
            ended = true
            finish()
        }
        draw(&ctx, t)
    }

    /// Thunder follows each flash a moment later, as sound does; the bolt
    /// that hits the charm shoves it as it lands.
    private func cues(_ t: Double) {
        while struck < plan.bolts.count, t >= plan.bolts[struck].time {
            if plan.bolts[struck].charm { push(CGVector(dx: .random(in: -1...1) * 320, dy: 170)) }
            struck += 1
        }
        while thundered < plan.bolts.count, t >= plan.bolts[thundered].time + Storm.thunderLag {
            sound(.thunder)
            thundered += 1
        }
    }

    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        let size = plan.size
        let gloom = plan.gloom(at: t)
        let flash = plan.flash(at: t)
        let screen = CGRect(origin: .zero, size: size)

        ctx.fill(Path(screen), with: .color(Lightning.night.opacity(0.58 * gloom)))
        clouds(&ctx, t, gloom: gloom, flash: flash)
        rain(&ctx, t, gloom: gloom, flash: flash)
        for bolt in plan.bolts { strike(&ctx, bolt, at: t) }
        if flash > 0 { ctx.fill(Path(screen), with: .color(Lightning.glow.opacity(0.3 * flash))) }
    }

    /// A bank of soft dark puffs along the top, lit from within when it flashes.
    private func clouds(_ ctx: inout GraphicsContext, _ t: Double, gloom: Double, flash: Double) {
        let w = plan.size.width
        for c in plan.clouds {
            let x = (c.x * w + c.drift * CGFloat(t) + 0.15 * w).truncatingRemainder(dividingBy: 1.3 * w) - 0.15 * w
            let tone = 0.07 + 0.1 * c.shade + 0.5 * flash
            let body = Color(red: tone * 0.9, green: tone, blue: min(1, tone * 1.3 + 0.04))
            let at = CGPoint(x: x, y: c.y)
            ctx.fill(Path(ellipseIn: CGRect(x: at.x - c.radius, y: at.y - c.radius * 0.7,
                                            width: 2 * c.radius, height: 1.4 * c.radius)),
                     with: .radialGradient(Gradient(colors: [body.opacity(0.95 * gloom), body.opacity(0)]),
                                           center: at, startRadius: 0, endRadius: c.radius))
        }
    }

    /// Three bands of drops by depth, each one stroke, the near ones longer,
    /// brighter and heavier.
    private func rain(_ ctx: inout GraphicsContext, _ t: Double, gloom: Double, flash: Double) {
        guard gloom > 0.01 else { return }
        var bands = [Path(), Path(), Path()]
        for d in plan.drops {
            let p = plan.position(d, at: t)
            let band = min(2, Int(d.depth * 3))
            bands[band].move(to: p)
            bands[band].addLine(to: CGPoint(x: p.x - Storm.slant * d.length, y: p.y - d.length))
        }
        let lit = 0.25 * flash
        for (k, path) in bands.enumerated() {
            ctx.stroke(path, with: .color(Color(white: 0.78 + lit, opacity: (0.22 + 0.16 * Double(k)) * gloom)),
                       style: StrokeStyle(lineWidth: 1 + 0.5 * CGFloat(k), lineCap: .round))
        }
    }

    /// A bolt for as long as it lingers, flickering with the flash.
    private func strike(_ ctx: inout GraphicsContext, _ bolt: Storm.Bolt, at t: Double) {
        let u = t - bolt.time
        guard u >= 0, u < Storm.linger else { return }
        let a = Storm.flash(u)
        guard a > 0 else { return }
        Lightning.draw(&ctx, trunk: bolt.trunk, forks: bolt.forks, ground: bolt.ground, alpha: a,
                       heavy: bolt.charm ? 1.3 : 1)
    }
}

// MARK: Overlay

struct ThorStormView: View {
    let storm: ThorStorm?

    var body: some View {
        if let storm {
            TimelineView(.animation) { timeline in
                Canvas { ctx, _ in storm.render(&ctx, at: timeline.date) }
            }
            .drawingGroup()
        }
    }
}
