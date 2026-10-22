import SwiftUI

// MARK: - Thor's strike
//
// Double-clicking the Thor charm calls the sky down on the front window: the
// light drops, a bolt comes out of the cloud into its title bar, and the
// window, hung with arcing electricity, is drawn into the charm along a
// crackling line of lightning, like Mjolnir being called back to the hand. It
// goes in a flash, and the app is hidden, as with the web yank.
//
// As there, what is pulled is a stand-in for the window, and the app is
// hidden beneath it once it is covered. WebYank.swift has the reasons.

/// One double-click, driven by the overlay's frame clock. Stages run in order:
/// gather, strike (the bolt lands and the stand-in goes up over the window),
/// pull (app hidden, window drawn into the charm), flash, clear. A miss, or an
/// app that refuses to hide, lets the bolt fall on nothing and the sky clear.
final class ThorStrike {
    private let target: WebTarget?
    private let aim: CGPoint
    private let home: () -> CGPoint
    private let homeSize: CGSize
    private let towardHome: CGVector
    private let bolt: Storm.Bolt
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    // Impulses on the charm, in points per second before chain-length scaling.
    private let recoil: CGFloat = 150
    private let impact: CGFloat = 280

    private let gatherTime = 0.25               // the sky closing in before the bolt
    private var pourTime = 0.7
    private let tugTime = 0.16
    private let tugPull: CGFloat = 18
    private let flashTime = 0.45
    private let clearTime = 0.5

    private var takedown: Takedown?
    private var genie: Genie?

    private var start: Date?
    private var landed: Double?
    private var pulled: Double?
    private var stowed: Double?
    private var dropped: Double?
    private var ended = false

    /// Arcs are redrawn thirty times a second, not every frame, so they
    /// crackle rather than shimmer.
    private var arcs: (step: Int, window: [[CGPoint]], line: [[CGPoint]]) = (-1, [], [])

    /// `home` is the charm's centre, live, and `homeSize` how big it's drawn.
    init(target: WebTarget?, aim: CGPoint, screen: CGSize, home: @escaping () -> CGPoint, homeSize: CGSize,
         push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.target = target
        self.aim = aim
        self.home = home
        self.homeSize = homeSize
        self.push = push
        self.sound = sound
        self.finish = finish
        takedown = target.map(Takedown.init)
        towardHome = unit(home() - aim)
        var rng = SystemRandomNumberGenerator()
        bolt = Storm.bolt(at: gatherTime, to: aim, size: screen, charm: false, using: &rng)
    }

    func standInArrived(_ image: CGImage?, isSnapshot: Bool) {
        takedown?.arrived(image, isSnapshot: isSnapshot)
        if let image, let target {
            genie = Genie(image, size: target.frame.size, columns: Pour.runsSideways(from: target.frame, to: home()))
        }
    }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil { start = date; begin() }
        let t = date.timeIntervalSince(start ?? date)
        advance(t)
        draw(&ctx, t)
    }

    private func begin() {
        let d = Double(home().dist(aim))
        pourTime = min(max(0.55 + d / 4000, 0.6), 0.85)
    }

    private func advance(_ t: Double) {
        if landed == nil, t >= gatherTime {
            landed = gatherTime
            if target == nil { dropped = landed }
            sound(.thunder)
            // The charm flinches as the bolt lands.
            push(CGVector(dx: towardHome.dx >= 0 ? -1 : 1, dy: -0.4) * recoil)
        }
        // Pull only once the real window has gone, or the stand-in would go
        // and leave the original sitting there.
        if let l = landed, pulled == nil, dropped == nil {
            switch takedown?.advance(t, since: l) {
            case .gone: pulled = t; sound(.crackle)
            case .failed: dropped = t
            case nil: break
            }
        }
        if let p = pulled, stowed == nil, t >= p + tugTime + pourTime {
            stowed = p + tugTime + pourTime
            push(towardHome * impact)
            sound(.zap)
        }
        if let over = over, !ended, t >= over + clearTime {
            ended = true
            finish()
        }
    }

    /// When the sky starts to clear: just after the flash, or just after a miss.
    private var over: Double? { stowed.map { $0 + 0.15 } ?? dropped.map { $0 + 0.25 } }

    // MARK: Poses

    private func poured(_ t: Double) -> CGFloat {
        guard let p = pulled else { return 0 }
        return CGFloat(min(max((t - p - tugTime) / pourTime, 0), 1))
    }

    /// The window shudders under the strike, then jerks toward the charm as
    /// the line takes up.
    private func tug(_ t: Double) -> CGVector {
        if let p = pulled, t >= p {
            return towardHome * (tugPull * CGFloat(easeOutBack(min(1, (t - p) / tugTime))))
        }
        guard let l = landed, t >= l else { return .zero }
        let u = t - l
        let shake = CGFloat(exp(-u * 3) * sin(u * 120))
        return CGVector(dx: 4 * shake, dy: 2 * CGFloat(sin(u * 97)) * CGFloat(exp(-u * 3)))
    }

    private func pouring(_ t: Double) -> Pour? {
        guard let target else { return nil }
        let tug = tug(t)
        return Pour(window: target.frame.offsetBy(dx: tug.dx, dy: tug.dy), into: home(),
                    columns: genie?.columns ?? Pour.runsSideways(from: target.frame, to: home()))
    }

    /// How dark the sky is, 0 to 1.
    private func sky(_ t: Double) -> Double {
        let x = min(t / gatherTime, 1)
        let closing = x * x * (3 - 2 * x)
        guard let o = over else { return closing }
        return closing * (1 - min(max((t - o) / clearTime, 0), 1))
    }

    // MARK: Drawing

    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        let origin = home()
        let screen = CGRect(origin: .zero, size: CGSize(width: 1e5, height: 1e5))
        ctx.fill(Path(screen), with: .color(Lightning.night.opacity(0.42 * sky(t))))

        // A flicker in the cloud just before the bolt.
        if t > 0.1, t < 0.16 { ctx.fill(Path(screen), with: .color(Lightning.glow.opacity(0.1))) }

        let flash = landed.map { Storm.flash(t - $0) } ?? 0
        let attached = landed != nil && dropped == nil && stowed == nil
        if attached {
            drawWindow(&ctx, t)
            if let pour = pouring(t) {
                if flash > 0 {
                    ctx.fill(Path(roundedRect: pour.window, cornerRadius: 10),
                             with: .color(Lightning.glow.opacity(0.5 * flash)))
                }
                refreshArcs(t, window: pour.window, from: origin,
                            to: pulled == nil ? nil : pour.point(aim + tug(t), at: poured(t)))
                drawArcs(&ctx, t)
            }
        }

        if let l = landed, t - l < Storm.linger {
            let a = Storm.flash(t - l)
            if a > 0 {
                Lightning.draw(&ctx, trunk: bolt.trunk, forks: bolt.forks, ground: aim, alpha: a)
                ctx.fill(Path(screen), with: .color(Lightning.glow.opacity(0.25 * a)))
            }
        }

        if let s = stowed, t - s < flashTime { drawFlash(&ctx, at: origin, (t - s) / flashTime) }
    }

    private func drawWindow(_ ctx: inout GraphicsContext, _ t: Double) {
        guard let takedown, takedown.covered != nil, let genie, let pour = pouring(t) else { return }
        let u = poured(t)
        let fade = takedown.cover(t)
        if u < 0.25 {
            var c = ctx
            c.opacity *= Double(fade * (1 - u / 0.25))
            StandIn.shadow(&c, pour.window)
        }
        var c = ctx
        c.opacity *= Double(fade)
        genie.draw(&c, pour, at: u)
    }

    /// Electricity jumping about the window until the pull begins, and then a
    /// line of lightning from the charm to where the window is gripped.
    private func refreshArcs(_ t: Double, window: CGRect, from origin: CGPoint, to grip: CGPoint?) {
        let step = Int(t * 30)
        guard step != arcs.step else { return }
        var rng = SystemRandomNumberGenerator()
        func edgePoint() -> CGPoint {
            let along = CGFloat.random(in: 0...1, using: &rng)
            switch Int.random(in: 0..<4, using: &rng) {
            case 0: return CGPoint(x: window.minX + along * window.width, y: window.minY)
            case 1: return CGPoint(x: window.minX + along * window.width, y: window.maxY)
            case 2: return CGPoint(x: window.minX, y: window.minY + along * window.height)
            default: return CGPoint(x: window.maxX, y: window.minY + along * window.height)
            }
        }
        // Arcs leap across the window, and out from its edge into the air.
        var onWindow: [[CGPoint]] = []
        for _ in 0..<(grip == nil ? 6 : 0) {
            let a = edgePoint()
            let b = Bool.random(using: &rng)
                ? edgePoint()
                : CGPoint(x: a.x + .random(in: -70...70, using: &rng), y: a.y + .random(in: -70...70, using: &rng))
            onWindow.append(Storm.jag(from: a, to: b, spread: 0.18, depth: 4, using: &rng))
        }
        var line: [[CGPoint]] = []
        if let grip {
            line.append(Storm.jag(from: origin, to: grip, spread: 0.07, depth: 6, using: &rng))
            line.append(Storm.jag(from: origin, to: grip, spread: 0.12, depth: 5, using: &rng))
        }
        arcs = (step, onWindow, line)
    }

    private func drawArcs(_ ctx: inout GraphicsContext, _ t: Double) {
        Lightning.crackle(&ctx, arcs.window, alpha: 0.9, width: 1.5)
        if !arcs.line.isEmpty {
            Lightning.crackle(&ctx, [arcs.line[0]], alpha: 1, width: 3)
            Lightning.crackle(&ctx, [arcs.line[1]], alpha: 0.7, width: 1.5)
        }
    }

    /// The window gone into the charm: a blue-white flash, a shock ring and
    /// forks of lightning, bursting out from behind it.
    private func drawFlash(_ ctx: inout GraphicsContext, at p: CGPoint, _ u: Double) {
        let reach = max(homeSize.width, homeSize.height) / 2
        let e = CGFloat(easeOutCubic(u)), fade = 1 - u
        let glow = reach * (0.3 + 1.0 * e)
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - glow, y: p.y - glow, width: 2 * glow, height: 2 * glow)),
                 with: .radialGradient(Gradient(colors: [.white.opacity(0.95 * fade),
                                                         Lightning.glow.opacity(0.6 * fade),
                                                         Lightning.glow.opacity(0)]),
                                       center: p, startRadius: 0, endRadius: glow))
        let ring = reach * (0.4 + 1.3 * e)
        ctx.stroke(Path(ellipseIn: CGRect(x: p.x - ring, y: p.y - ring, width: 2 * ring, height: 2 * ring)),
                   with: .color(.white.opacity(0.75 * fade)), lineWidth: 3 * CGFloat(fade) + 0.5)
        var rng = SystemRandomNumberGenerator()
        var forks: [[CGPoint]] = []
        for i in 0..<9 {
            let a = Double(i) / 9 * 2 * .pi + .random(in: -0.2...0.2, using: &rng)
            let to = CGPoint(x: p.x + cos(a) * reach * (0.9 + 1.5 * e), y: p.y + sin(a) * reach * (0.9 + 1.5 * e))
            forks.append(Storm.jag(from: p, to: to, spread: 0.2, depth: 3, using: &rng))
        }
        Lightning.crackle(&ctx, forks, alpha: fade, width: 2)
    }
}

// MARK: Overlay

struct ThorStrikeView: View {
    let strike: ThorStrike?

    var body: some View {
        if let strike {
            TimelineView(.animation) { timeline in
                Canvas { ctx, _ in strike.render(&ctx, at: timeline.date) }
            }
            .drawingGroup()
        }
    }
}
