import AppKit
import SwiftUI

// MARK: - Venom
//
// Two effects called up from the Venom charm, drawn on click-through overlays
// like the others: the tongue (double-click: it lashes out, sticks to the
// front window and reels it into his mouth, which swallows it) and the
// symbiote (manhandle him: black tendrils crawl out of the charm and all over
// the screen, then are sucked back in).

enum VenomGear {
    static func supports(_ charm: String) -> Bool { charm == "Venom" }

    /// Where the tongue lashes from, as a fraction of the artwork: the curl
    /// of the one already hanging out of his mouth, so it seems to shoot out
    /// from there. A custom charm's lower middle.
    static func mouth(of charm: String) -> CGPoint {
        supports(charm) ? CGPoint(x: 0.31, y: 0.465) : CGPoint(x: 0.5, y: 0.72)
    }

    /// The tongue's half-width at its root, as a fraction of the charm's
    /// height: his own is slight against the whole of him, a sticker's is
    /// drawn bolder.
    static func tongueWidth(of charm: String) -> CGFloat { supports(charm) ? 0.022 : 0.04 }
}

/// Calls the effects up at the charm and owns the overlays they are drawn in.
final class VenomController {
    private let charm: NSWindow
    private let sim: RopeSim
    private let settings: CharmSettings

    private let tongueHost = NSHostingView(rootView: TongueLashView(lash: nil))
    private let tongueOverlay: NSWindow
    private var lash: TongueLash?

    private let crawlHost = NSHostingView(rootView: SymbioteCrawlView(crawl: nil))
    private let crawlOverlay: NSWindow
    private var crawl: SymbioteCrawl?

    init(charm: NSWindow, sim: RopeSim, settings: CharmSettings) {
        self.charm = charm
        self.sim = sim
        self.settings = settings
        tongueOverlay = Overlay.make(tongueHost)
        crawlOverlay = Overlay.make(crawlHost)
    }

    // MARK: Tongue

    func lashWindow() {
        guard lash == nil, let screen = charm.screen ?? NSScreen.main else { return }
        let area = screen.frame
        let name = settings.charm
        let mouth = { [unowned self] in self.artPoint(VenomGear.mouth(of: name), name, area) }
        let target = WebTarget.find(in: area)
        let k = settings.kickScale
        let lash = TongueLash(target: target, aim: WebTarget.aim(at: target, from: mouth(), in: area), mouth: mouth,
                              width: max(4, settings.charmHeight * VenomGear.tongueWidth(of: name)),
                              push: { [weak self] v in self?.sim.impulse(v * k) },
                              sound: { SoundFX.shared.play($0) },
                              finish: { [weak self] in DispatchQueue.main.async { self?.endLash() } })
        self.lash = lash
        target?.standIn(on: screen) { [weak lash] image, isSnapshot in
            lash?.standInArrived(image, isSnapshot: isSnapshot)
        }
        tongueHost.rootView = TongueLashView(lash: lash)
        Overlay.show(tongueOverlay, on: area, below: charm)
    }

    private func endLash() {
        tongueOverlay.orderOut(nil)
        tongueHost.rootView = TongueLashView(lash: nil)
        lash = nil
    }

    // MARK: Symbiote

    func unleashSymbiote() {
        guard crawl == nil, let screen = charm.screen ?? NSScreen.main else { return }
        let area = screen.frame
        let origin = artPoint(CGPoint(x: 0.5, y: 0.55), settings.charm, area)
        var rng = SystemRandomNumberGenerator()
        let plan = Symbiote(size: area.size, from: origin, using: &rng)
        let k = settings.kickScale
        let crawl = SymbioteCrawl(plan: plan,
                                  push: { [weak self] v in self?.sim.impulse(v * k) },
                                  sound: { SoundFX.shared.play($0) },
                                  finish: { [weak self] in DispatchQueue.main.async { self?.endCrawl() } })
        self.crawl = crawl
        crawlHost.rootView = SymbioteCrawlView(crawl: crawl)
        Overlay.show(crawlOverlay, on: area, below: charm)
    }

    private func endCrawl() {
        crawlOverlay.orderOut(nil)
        crawlHost.rootView = SymbioteCrawlView(crawl: nil)
        crawl = nil
    }

    private func artPoint(_ u: CGPoint, _ name: String, _ area: CGRect) -> CGPoint {
        Overlay.point(settings.artPoint(u, of: name, sim: sim), from: charm, in: area)
    }
}

// MARK: - Tongue

/// Venom's tongue: thick at the root, tapering to a rounded tip, glossy, and
/// writhing in a wave that runs along it.
enum Tongue {
    static let flesh = Color(red: 0.86, green: 0.25, blue: 0.38)
    static let shade = Color(red: 0.40, green: 0.03, blue: 0.12)

    /// `width` is its half-width at the root; `writhe` how far the wave
    /// throws it from side to side, in points; `tip` how much its end has
    /// flattened out against something it has stuck to.
    static func draw(_ ctx: inout GraphicsContext, from a: CGPoint, to b: CGPoint, width: CGFloat,
                     writhe: CGFloat, bow: CGFloat, t: Double, tip: CGFloat = 1) {
        let v = b - a
        let len = hypot(v.dx, v.dy)
        guard len > 2 else { return }
        let n = CGVector(dx: -v.dy / len, dy: v.dx / len)
        let ctl = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) + n * bow
        let count = max(12, Int(len / 9))
        let centre = (0...count).map { i -> CGPoint in
            let s = CGFloat(i) / CGFloat(count)
            let wave = writhe * CGFloat(sin(Double(s * len) / 40 - t * 16)) * sin(.pi * s)
            return quad(a, ctl, b, s) + n * wave
        }
        var left: [CGPoint] = [], right: [CGPoint] = [], half: [CGFloat] = []
        for (i, p) in centre.enumerated() {
            let d = unit(centre[min(i + 1, count)] - centre[max(i - 1, 0)])
            let s = CGFloat(i) / CGFloat(count)
            let w = width * (1 - 0.35 * s) * (1 + (tip - 1) * pow(s, 6))
            half.append(w)
            left.append(p + CGVector(dx: -d.dy, dy: d.dx) * w)
            right.append(p + CGVector(dx: d.dy, dy: -d.dx) * w)
        }
        var shape = Path()
        shape.move(to: left[0])
        for p in left.dropFirst() { shape.addLine(to: p) }
        // Round the end off: half a circle from one side to the other, round the front.
        let end = centre[count], ahead = unit(centre[count] - centre[count - 1])
        let side = CGVector(dx: -ahead.dy, dy: ahead.dx)
        for k in 1..<12 {
            let a = Double.pi * Double(k) / 12
            shape.addLine(to: end + side * (half[count] * CGFloat(cos(a))) + ahead * (half[count] * CGFloat(sin(a))))
        }
        for p in right.reversed() { shape.addLine(to: p) }
        shape.closeSubpath()

        ctx.stroke(shape, with: .color(shade.opacity(0.9)), lineWidth: 2.4)
        ctx.fill(shape, with: .color(flesh))
        var groove = Path()
        groove.addLines(centre)
        ctx.stroke(groove, with: .color(shade.opacity(0.35)), style: StrokeStyle(lineWidth: 1.2, lineCap: .round))
        // A wet highlight down one side.
        var shine = Path()
        shine.addLines(zip(centre, left).map { c, l in lerp(c, l, 0.45) })
        ctx.stroke(shine, with: .color(.white.opacity(0.4)),
                   style: StrokeStyle(lineWidth: max(1, width * 0.3), lineCap: .round))
    }
}

/// One lash of the tongue, from shooting it out to the gulp, driven by the
/// overlay's frame clock. Stages run in order: shoot, stick, cover (the
/// stand-in goes up over the window and its app is hidden), reel in, gulp. A
/// miss, or an app that won't hide, drops out after it sticks and the tongue
/// snaps back.
final class TongueLash {
    private struct Pose {
        var at: CGPoint
        var scale: CGFloat
        var tilt: CGFloat
        var alpha: CGFloat
    }

    private let target: WebTarget?
    private let aim: CGPoint
    private let mouth: () -> CGPoint
    private let width: CGFloat
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void
    private var takedown: Takedown?

    private var shootTime = 0.22
    private let reelTime = 0.5
    private let snapBackTime = 0.25
    private let gulpTime = 0.45

    private var start: Date?
    private var stuck: Double?
    private var reeled: Double?
    private var swallowed: Double?
    private var dropped: Double?
    private var ended = false
    /// Goo flung out by the gulp: direction, speed and size of each drop.
    private let spatter: [(CGVector, CGFloat, CGFloat)] = (0..<12).map { i in
        let a = Double(i) / 12 * 2 * .pi + .random(in: -0.2...0.2)
        return (CGVector(dx: cos(a), dy: sin(a)), .random(in: 140...320), .random(in: 2.5...5))
    }

    init(target: WebTarget?, aim: CGPoint, mouth: @escaping () -> CGPoint, width: CGFloat,
         push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.target = target
        self.aim = aim
        self.mouth = mouth
        self.width = width
        self.push = push
        self.sound = sound
        self.finish = finish
        takedown = target.map(Takedown.init)
    }

    func standInArrived(_ image: CGImage?, isSnapshot: Bool) {
        takedown?.arrived(image, isSnapshot: isSnapshot)
    }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil { start = date; begin() }
        let t = date.timeIntervalSince(start ?? date)
        advance(t)
        draw(&ctx, t)
    }

    private func begin() {
        let m = mouth()
        shootTime = min(max(Double(m.dist(aim)) / 2800, 0.14), 0.3)
        push(unit(m - aim) * 130)
        sound(.lash)
    }

    private func advance(_ t: Double) {
        if stuck == nil, t >= shootTime {
            stuck = shootTime
            if target == nil { dropped = shootTime }
            sound(target == nil ? .reel : .splat)
        }
        if let s = stuck, reeled == nil, dropped == nil, var down = takedown {
            let outcome = down.advance(t, since: s)
            takedown = down
            switch outcome {
            case .gone:
                reeled = t
                push(unit(mouth() - aim) * 280)
                sound(.slurp)
            case .failed:
                dropped = t
                sound(.reel)
            case nil:
                break
            }
        }
        if let r = reeled, swallowed == nil, t >= r + reelTime {
            swallowed = r + reelTime
            // The window's weight landing in his mouth.
            push(unit(mouth() - aim) * 240)
            sound(.gulp)
        }
        let done = swallowed.map { t >= $0 + gulpTime } ?? dropped.map { t >= $0 + snapBackTime } ?? false
        if done && !ended {
            ended = true
            finish()
        }
    }

    /// Where the window hangs off the tongue: stuck in place while its app is
    /// hidden, then reeled in faster and faster, wobbling as it shrinks into
    /// his mouth.
    private func pose(_ t: Double, _ m: CGPoint) -> Pose {
        guard let r = reeled else { return Pose(at: aim, scale: 1, tilt: 0, alpha: 1) }
        let u = CGFloat(min(1, (t - r) / reelTime))
        let f = u * u
        return Pose(at: lerp(aim, m, f),
                    scale: 1 - 0.97 * pow(f, 0.7),
                    tilt: 0.14 * sin(u * .pi * 3) * (1 - u),
                    alpha: f < 0.85 ? 1 : (1 - f) / 0.15)
    }

    // MARK: Drawing

    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        let m = mouth()

        if let s = stuck, let target, let down = takedown, dropped == nil, swallowed == nil {
            var c = ctx
            apply(pose(t, m), to: &c)
            if let image = down.standIn, down.covered != nil {
                StandIn.draw(&c, image, in: target.frame.offsetBy(dx: -aim.x, dy: -aim.y), fade: down.cover(t))
            }
            drawSlime(&c, grow: CGFloat(easeOutBack(min(1, (t - s) / 0.2))), age: t - s)
        }

        if swallowed == nil {
            let len = m.dist(aim)
            if let d = dropped {
                let u = CGFloat(min(1, (t - d) / snapBackTime))
                Tongue.draw(&ctx, from: m, to: lerp(aim, m, u * u * u), width: width, writhe: 10 * (1 - u),
                            bow: len * 0.05 * sin(.pi * u), t: t)
            } else if stuck == nil {
                let u = t / shootTime
                Tongue.draw(&ctx, from: m, to: lerp(m, aim, CGFloat(easeOutCubic(u))), width: width,
                            writhe: 18 * CGFloat(1 - u) + 5, bow: len * 0.12 * CGFloat(sin(.pi * u)), t: t)
            } else {
                // Twitching where it's stuck, then pulled taut as it reels in.
                let since = t - (reeled ?? stuck ?? t)
                let twitch = 6 * CGFloat(exp(-since * 6))
                Tongue.draw(&ctx, from: m, to: pose(t, m).at, width: width,
                            writhe: reeled == nil ? 3 + twitch : 2 + twitch, bow: 0, t: t, tip: 1.5)
            }
        }

        if let s = swallowed, t - s < gulpTime {
            drawGulp(&ctx, at: m, (t - s) / gulpTime)
        }
    }

    private func apply(_ p: Pose, to c: inout GraphicsContext) {
        c.translateBy(x: p.at.x, y: p.at.y)
        c.rotate(by: .radians(Double(p.tilt)))
        c.scaleBy(x: p.scale, y: p.scale)
        c.opacity *= Double(p.alpha)
    }

    /// Slaver where the tongue stuck, drawn in the window's own coordinates
    /// so it travels and shrinks with it, with drips running down the glass.
    private func drawSlime(_ c: inout GraphicsContext, grow: CGFloat, age: Double) {
        guard grow > 0.01 else { return }
        let goo = Color(red: 0.78, green: 0.22, blue: 0.34).opacity(0.75)
        let r = 22 * grow
        var blob = Path(ellipseIn: CGRect(x: -r * 1.3, y: -r * 0.8, width: r * 2.6, height: r * 1.6))
        for (dx, dy, s) in [(-1.1, 0.4, 0.45), (1.0, 0.5, 0.4), (0.2, -0.7, 0.35)] as [(CGFloat, CGFloat, CGFloat)] {
            blob.addEllipse(in: CGRect(x: dx * r - s * r, y: dy * r - s * r, width: 2 * s * r, height: 2 * s * r))
        }
        // Drips that run down and slow as they go.
        let run = CGFloat(min(age, 1.2)) * 46
        for (x, length) in [(-14.0, 1.0), (9.0, 0.7), (20.0, 0.45)] as [(CGFloat, CGFloat)] {
            let l = run * length
            guard l > 2 else { continue }
            blob.addRoundedRect(in: CGRect(x: x * grow - 2.5, y: 0, width: 5, height: r * 0.6 + l),
                                cornerSize: CGSize(width: 2.5, height: 2.5))
            blob.addEllipse(in: CGRect(x: x * grow - 4, y: r * 0.6 + l - 4, width: 8, height: 8))
        }
        c.fill(blob, with: .color(goo))
        c.fill(Path(ellipseIn: CGRect(x: -r * 0.7, y: -r * 0.55, width: r * 0.7, height: r * 0.35)),
               with: .color(.white.opacity(0.45)))
    }

    /// The gulp: black goo spattered out of his mouth and falling away.
    private func drawGulp(_ ctx: inout GraphicsContext, at p: CGPoint, _ u: Double) {
        let time = CGFloat(u * gulpTime)
        let fade = Double(1 - u)
        for (dir, speed, size) in spatter {
            let at = p + dir * (speed * time) + CGVector(dx: 0, dy: 900 * time * time)
            let r = size * (1 - 0.4 * CGFloat(u))
            let drop = Path(ellipseIn: CGRect(x: at.x - r, y: at.y - r, width: 2 * r, height: 2 * r))
            ctx.fill(drop, with: .color(Color(white: 0.03).opacity(fade)))
            ctx.fill(Path(ellipseIn: CGRect(x: at.x - r * 0.5, y: at.y - r * 0.6, width: r * 0.6, height: r * 0.5)),
                     with: .color(.white.opacity(0.5 * fade)))
        }
    }
}

struct TongueLashView: View {
    let lash: TongueLash?

    var body: some View {
        if let lash {
            TimelineView(.animation) { timeline in
                Canvas { ctx, _ in lash.render(&ctx, at: timeline.date) }
            }
            .drawingGroup()
        }
    }
}

// MARK: - Symbiote crawl

/// The symbiote let loose, the way it moves in the films: a pool of it wells
/// out of the charm, and fat, glossy tendrils lunge out of that and across
/// the screen, thrashing as they go, blunt heads reaching, strings of goo
/// stretching between them. It holds, still writhing, then is sucked back
/// into the charm, heads first. Paint only, like the web blast.
final class SymbioteCrawl {
    private let plan: Symbiote
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    private let holdTime = 1.6
    private let retreatTime = 0.8
    private let reach: CGFloat              // furthest corner from where it came out

    private var start: Date?
    private var retreating = false
    private var ended = false

    private static let ink = Color(red: 0.02, green: 0.02, blue: 0.035)
    private static let sheen = Color(red: 0.72, green: 0.8, blue: 1)

    init(plan: Symbiote, push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.plan = plan
        self.push = push
        self.sound = sound
        self.finish = finish
        let s = plan.size
        reach = [CGPoint.zero, CGPoint(x: s.width, y: 0), CGPoint(x: 0, y: s.height), CGPoint(x: s.width, y: s.height)]
            .map { plan.origin.dist($0) }.max() ?? 1
    }

    private var lifetime: Double { plan.spread + holdTime + retreatTime }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil {
            start = date
            push(CGVector(dx: 0, dy: -260))
            sound(.hiss)
            sound(.ooze)
        }
        let t = date.timeIntervalSince(start ?? date)
        advance(t)
        draw(&ctx, crawled(t), t)
    }

    private func advance(_ t: Double) {
        if !retreating, t >= plan.spread + holdTime {
            retreating = true
            sound(.slurp)
        }
        if !ended, t >= lifetime {
            ended = true
            // All of it slapping back into the charm at once.
            push(CGVector(dx: 0, dy: 320))
            sound(.gulp)
            finish()
        }
    }

    /// How far into its crawl the symbiote has got: growing, held at full
    /// spread, then wound back so it retreats along its own paths, the heads
    /// going first and faster as it's sucked in.
    private func crawled(_ t: Double) -> Double {
        let back = t - plan.spread - holdTime
        guard back > 0 else { return min(t, plan.spread) }
        let u = min(1, back / retreatTime)
        return plan.spread * (1 - u * u)
    }

    /// One tendril as it is this frame: its centre line, thrashing, and its
    /// thickness along it, pulsing.
    private struct Limb {
        var centre: [CGPoint]
        var widths: [CGFloat]
        var crawling: Bool
    }

    private func draw(_ ctx: inout GraphicsContext, _ crawled: Double, _ t: Double) {
        guard plan.spread > 0, crawled > 0 else { return }
        let o = plan.origin
        let progress = CGFloat(crawled / plan.spread)

        // The shadow it casts over the screen as it spreads, thickest at the
        // charm, breathing.
        let r = max(1, reach * 1.05 * progress * (1 + 0.04 * CGFloat(sin(t * 3))))
        ctx.fill(Path(CGRect(origin: .zero, size: plan.size)),
                 with: .radialGradient(Gradient(stops: [.init(color: .black.opacity(0.36), location: 0),
                                                        .init(color: .black.opacity(0.16), location: 0.8),
                                                        .init(color: .black.opacity(0), location: 1)]),
                                       center: o, startRadius: 0, endRadius: r))

        // Every tendril as it is this frame. Forks come after their parents,
        // so each can be carried with the point it forked from.
        var limbs: [Limb?] = Array(repeating: nil, count: plan.tendrils.count)
        var moved: [[CGPoint]?] = Array(repeating: nil, count: plan.tendrils.count)
        for k in plan.tendrils.indices {
            var carry = CGVector.zero
            if let (i, j) = plan.tendrils[k].parent, let parent = moved[i], j < parent.count {
                carry = parent[j] - plan.tendrils[i].points[j]
            }
            guard let l = body(k, crawled, t, carry) else { continue }
            limbs[k] = l
            moved[k] = l.centre
        }

        // Strings of goo between neighbours, behind them: sagging, and
        // stretched thin in the middle.
        for strand in plan.strands {
            guard let a = moved[strand.a.tendril], strand.a.point < a.count,
                  let b = moved[strand.b.tendril], strand.b.point < b.count else { continue }
            let p = a[strand.a.point], q = b[strand.b.point]
            // Drooping under its own weight, and swaying.
            let sag = 0.45 * p.dist(q) * (1 + 0.2 * CGFloat(sin(t * 4 + Double(strand.a.point))))
            var string = Path()
            string.move(to: p)
            string.addQuadCurve(to: q, control: CGPoint(x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 + sag))
            // Thick where it clings, drawn out thin between.
            ctx.stroke(string, with: .color(Self.ink), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
            for (end, toward) in [(p, q), (q, p)] {
                let d = unit(toward - end)
                for (along, r) in [(CGFloat(0), CGFloat(5)), (6, 3.2)] {
                    let c = end + d * along + CGVector(dx: 0, dy: along * 0.5)
                    ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)), with: .color(Self.ink))
                }
            }
        }

        // The tendrils: glossy black bodies with blunt, swollen heads.
        for limb in limbs.compactMap({ $0 }) {
            drawLimb(&ctx, limb)
        }

        // The pool welling out of the charm, its edge heaving.
        let pool = (30 + 80 * CGFloat(easeOutCubic(Double(min(1, progress * 1.6))))) * progress.squareRoot()
        var edge = Path()
        for i in 0...60 {
            let a = Double(i) / 60 * 2 * .pi
            let wobble = 0.12 * sin(3 * a + t * 2.2) + 0.07 * sin(5 * a - t * 3.1 + 1) + 0.05 * sin(9 * a + t * 4.3)
            let p = o + CGVector(dx: cos(a), dy: sin(a)) * (pool * CGFloat(1 + wobble))
            if i == 0 { edge.move(to: p) } else { edge.addLine(to: p) }
        }
        edge.closeSubpath()
        ctx.fill(edge, with: .color(Self.ink))
        ctx.stroke(edge, with: .color(Self.sheen.opacity(0.16)), lineWidth: 1.5)
        // Light sliding over its surface as it churns.
        for i in 0..<3 {
            let a = t * (0.6 + 0.3 * Double(i)) + Double(i) * 2.1
            let c = o + CGVector(dx: cos(a), dy: sin(a) * 0.6) * (pool * 0.45)
            let s = pool * (0.22 - 0.05 * CGFloat(i))
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - s, y: c.y - s * 0.4, width: 2 * s, height: s * 0.8)),
                     with: .color(Self.sheen.opacity(0.14)))
        }
    }

    /// A tendril as it is this frame: its centre line bent by a wave running
    /// out along it that throws its head about most, carried with the point of
    /// whatever it forked from so a fork stays on it, and its thickness
    /// pulsing; nil if it hasn't set off yet.
    private func body(_ k: Int, _ crawled: Double, _ t: Double, _ carry: CGVector) -> Limb? {
        let tendril = plan.tendrils[k]
        guard let first = tendril.times.first, first < crawled else { return nil }
        var end = 0
        while end + 1 < tendril.times.count, tendril.times[end + 1] <= crawled { end += 1 }
        var points = Array(tendril.points[0...end])
        var widths = Array(tendril.widths[0...end])
        let crawling = end + 1 < tendril.points.count
        if crawling {
            let f = CGFloat((crawled - tendril.times[end]) / (tendril.times[end + 1] - tendril.times[end]))
            points.append(lerp(tendril.points[end], tendril.points[end + 1], f))
            widths.append(tendril.widths[end + 1])
        }
        guard points.count > 1 else { return nil }

        let count = points.count
        let length = CGFloat(count - 1) * Symbiote.step
        var centre: [CGPoint] = [], pulsed: [CGFloat] = []
        for (n, p) in points.enumerated() {
            let along = CGFloat(n) * Symbiote.step
            let d = unit(points[min(n + 1, count - 1)] - points[max(n - 1, 0)])
            // Still where it leaves the charm or its parent, thrashing harder
            // toward its head, and the head casting about on top of that.
            let rooted = min(1, along / 110)
            let toHead = length > 0 ? along / length : 0
            let wave = CGFloat(sin(Double(along) / 65 - t * 5.5 + tendril.phase))
            let cast = CGFloat(sin(t * 7.3 + tendril.phase * 1.7)) * max(0, toHead - 0.7) / 0.3
            let thrash = wave * rooted * (5 + 12 * toHead) + cast * 9
            centre.append(p + carry + CGVector(dx: -d.dy, dy: d.dx) * thrash)
            // Bulges pumping out along it.
            pulsed.append(widths[n] * (1 + 0.16 * CGFloat(sin(Double(along) / 38 - t * 6.5 + tendril.phase))))
        }
        return Limb(centre: centre, widths: pulsed, crawling: crawling)
    }

    /// Outlines a tendril from its centre line and fills it: a glossy black
    /// body, a faint cool rim, a highlight down one side, and a blunt head
    /// swollen a little wider than the neck behind it.
    private func drawLimb(_ ctx: inout GraphicsContext, _ limb: Limb) {
        let c = limb.centre, count = c.count
        var left: [CGPoint] = [], right: [CGPoint] = [], shine: [CGPoint] = []
        for n in 0..<count {
            let d = unit(c[min(n + 1, count - 1)] - c[max(n - 1, 0)])
            let side = CGVector(dx: -d.dy, dy: d.dx)
            // The last few points swell into the head.
            let swell: CGFloat = n >= count - 3 ? 1.25 : 1
            let half = limb.widths[n] / 2 * swell
            left.append(c[n] + side * half)
            right.append(c[n] + side * -half)
            shine.append(c[n] + side * (half * 0.45))
        }
        var shape = Path()
        shape.move(to: left[0])
        for p in left.dropFirst() { shape.addLine(to: p) }
        // Round the head off: half a circle from one side to the other, round the front.
        let head = c[count - 1], ahead = unit(c[count - 1] - c[count - 2])
        let side = CGVector(dx: -ahead.dy, dy: ahead.dx)
        let r = limb.widths[count - 1] / 2 * 1.25
        for k in 1..<12 {
            let a = Double.pi * Double(k) / 12
            let across = side * (r * CGFloat(cos(a))), forward = ahead * (r * CGFloat(sin(a)))
            shape.addLine(to: head + across + forward)
        }
        for p in right.reversed() { shape.addLine(to: p) }
        shape.closeSubpath()

        ctx.stroke(shape, with: .color(Self.sheen.opacity(0.14)), lineWidth: 1.2)
        ctx.fill(shape, with: .color(Self.ink))
        // A swelling where it leaves its parent, so a fork grows out of it
        // rather than meeting it at a corner.
        let root = limb.widths[0] * 0.65
        ctx.fill(Path(ellipseIn: CGRect(x: c[0].x - root, y: c[0].y - root, width: 2 * root, height: 2 * root)),
                 with: .color(Self.ink))
        var highlight = Path()
        highlight.addLines(shine)
        ctx.stroke(highlight, with: .color(Self.sheen.opacity(0.32)),
                   style: StrokeStyle(lineWidth: max(1.2, limb.widths[0] * 0.09), lineCap: .round, lineJoin: .round))
        // A glint on the head as it reaches.
        let g = head + side * (r * 0.35) + ahead * (r * -0.1)
        ctx.fill(Path(ellipseIn: CGRect(x: g.x - r * 0.25, y: g.y - r * 0.18, width: r * 0.5, height: r * 0.36)),
                 with: .color(Self.sheen.opacity(limb.crawling ? 0.4 : 0.25)))
    }
}

struct SymbioteCrawlView: View {
    let crawl: SymbioteCrawl?

    var body: some View {
        if let crawl {
            TimelineView(.animation) { timeline in
                Canvas { ctx, _ in crawl.render(&ctx, at: timeline.date) }
            }
            .drawingGroup()
        }
    }
}
