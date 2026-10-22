import SwiftUI

// MARK: - Bat tow
//
// Double-clicking the Batman charm sends out a stream of bats from behind it
// and fires a grapple into the front window's title bar. The bats reach the
// window as the grapple bites and circle it; then the window is poured down
// the grapple into the charm, like a genie into its lamp, while the bats'
// ring slides across to circle the charm instead. It goes in a flash, and the
// bats dive in after it.
//
// As with the web yank, what is poured is a stand-in for the window — another
// app's window can't be moved from outside it — and the app is hidden beneath
// the stand-in once it is covered. WebYank.swift has the reasons.

/// One double-click, driven by the overlay's frame clock. Stages run in order:
/// fire, land, cover (stand-in goes up over the window), pour (app hidden,
/// window drawn into the charm), flash, home. A miss, or an app that refuses
/// to hide, reels the grapple back in and the bats come home empty.
final class BatTow {
    /// One bat of the stream: how far behind the leader it flies, and its look.
    private struct StreamBat {
        let lag: Double
        let span: CGFloat
        let beat: Double
    }

    private enum Leg { case out, round, home }

    private struct Flight {
        let at: CGPoint
        let leg: Leg
        let depth: CGFloat          // on the ring: -1 behind what it circles ... 1 in front
        let scale: CGFloat
        let alpha: CGFloat
    }

    private let target: WebTarget?
    private let aim: CGPoint
    private let home: () -> CGPoint
    private let homeSize: CGSize
    private let towardHome: CGVector
    private let bats: [Image]
    private let batBody: CGPoint
    private let batAspect: CGFloat
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    // Impulses on the charm, in points per second before chain-length scaling.
    private let launch: CGFloat = 110
    private let impact: CGFloat = 260

    private let fireTime = 0.42                // the bats are well on their way first
    private var shootTime = 0.2
    private var pourTime = 0.7
    private let tugTime = 0.16
    private let tugPull: CGFloat = 18
    private let retractTime = 0.24
    private let flashTime = 0.4
    private let puffTime = 0.35

    // The stream sets off just after the double-click and reaches the window
    // as the grapple bites; it dives home at the flash.
    private let streamStart = 0.08
    private let streamReach = 0.45
    private let streamReturn = 0.55
    private let ringSpin = 0.85                 // turns a second round the window
    private let stream: [StreamBat]
    private let entryAngle: Double
    private let spinSign: Double

    private var takedown: Takedown?
    private var genie: Genie?

    private var start: Date?
    private var flocked = false
    private var landed: Double?
    private var pulled: Double?
    private var stowed: Double?
    private var dropped: Double?
    private var arrived: Double?
    private var ended = false

    /// `home` is the charm's centre, live, and `homeSize` how big it's drawn:
    /// the bats circle it and the bursts are sized to show round it.
    init(target: WebTarget?, aim: CGPoint, home: @escaping () -> CGPoint, homeSize: CGSize,
         bats: [Image], batBody: CGPoint, batAspect: CGFloat,
         push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.target = target
        self.aim = aim
        self.home = home
        self.homeSize = homeSize
        self.bats = bats
        self.batBody = batBody
        self.batAspect = batAspect
        self.push = push
        self.sound = sound
        self.finish = finish
        takedown = target.map(Takedown.init)
        stream = (0..<14).map { i -> StreamBat in
            let size = CGFloat((i * 7) % 5) / 4
            return StreamBat(lag: Double(i) * 0.032, span: 46 + 20 * size, beat: Double((i * 5) % 7) / 7)
        }
        // The bats join the ring on the charm's side of the window and go
        // round over the top of it first.
        let charm = home()
        towardHome = unit(charm - aim)
        let frame = target?.frame ?? CGRect(x: aim.x - 60, y: aim.y - 40, width: 120, height: 80)
        entryAngle = atan2(Double((charm.y - frame.midY) / (frame.height / 2 + 36)),
                           Double((charm.x - frame.midX) / (frame.width / 2 + 44)))
        spinSign = aim.x <= charm.x ? -1 : 1
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
        shootTime = min(max(d / 2400, 0.16), 0.32)
        pourTime = min(max(0.55 + d / 4000, 0.6), 0.85)
        // The charm is jolted away from the window as the bats burst out from behind it.
        push(CGVector(dx: towardHome.dx >= 0 ? 1 : -1, dy: -0.3) * launch)
    }

    private func advance(_ t: Double) {
        if !flocked, t >= streamStart, !bats.isEmpty {
            flocked = true
            sound(.flock)
        }
        if landed == nil, t >= fireTime + shootTime {
            landed = fireTime + shootTime
            if target == nil { dropped = landed }
            sound(target == nil ? .reel : .clank)
        }
        // Pour only once the real window has gone, or the stand-in would go
        // and leave the original sitting there.
        if let l = landed, pulled == nil, dropped == nil {
            switch takedown?.advance(t, since: l) {
            case .gone: pulled = t; sound(.whoosh)
            case .failed: dropped = t; sound(.reel)
            case nil: break
            }
        }
        if let p = pulled, stowed == nil, t >= p + tugTime + pourTime {
            stowed = p + tugTime + pourTime
            // The charm takes the window's weight as it goes in.
            push(towardHome * impact)
            sound(.zap)
        }
        if let back = streamBack, arrived == nil, t >= back + streamReturn {
            arrived = back + streamReturn
            sound(.pop)
        }
        let streamHome = bats.isEmpty || streamBack.map { t >= $0 + streamReturn + (stream.last?.lag ?? 0) } ?? false
        if let a = arrived, !ended, t >= a + puffTime, streamHome {
            ended = true
            finish()
        }
    }

    // MARK: Poses

    /// How much of the window has been poured in, 0 → 1.
    private func poured(_ t: Double) -> CGFloat {
        guard let p = pulled else { return 0 }
        return CGFloat(min(max((t - p - tugTime) / pourTime, 0), 1))
    }

    /// The window's jerk toward the charm as the grapple first takes up.
    private func tug(_ t: Double) -> CGVector {
        guard let p = pulled, t >= p else { return .zero }
        return towardHome * (tugPull * CGFloat(easeOutBack(min(1, (t - p) / tugTime))))
    }

    private func pouring(_ t: Double) -> Pour? {
        guard let target else { return nil }
        let tug = tug(t)
        return Pour(window: target.frame.offsetBy(dx: tug.dx, dy: tug.dy), into: home(),
                    columns: genie?.columns ?? Pour.runsSideways(from: target.frame, to: home()))
    }

    // MARK: The stream

    /// When the bats turn for home: at the flash, or once the grapple is
    /// back after a miss.
    private var streamBack: Double? { stowed ?? dropped.map { $0 + retractTime } }

    /// The ring the bats fly at time `t`: round the window with room to spare,
    /// sliding across to round the charm as the window is poured into it.
    private func ring(_ t: Double) -> (centre: CGPoint, radii: CGSize) {
        let tug = tug(t)
        let r = (target?.frame ?? CGRect(x: aim.x - 60, y: aim.y - 40, width: 120, height: 80))
            .offsetBy(dx: tug.dx, dy: tug.dy)
        let u = poured(t)
        let round = CGSize(width: homeSize.width / 2 + 40, height: homeSize.height / 2 + 34)
        return (lerp(CGPoint(x: r.midX, y: r.midY), home(), u),
                CGSize(width: (r.width / 2 + 44) * (1 - u) + round.width * u,
                       height: (r.height / 2 + 36) * (1 - u) + round.height * u))
    }

    private func circling(_ t: Double) -> Flight {
        let (c, r) = ring(t)
        let φ = entryAngle + spinSign * ringSpin * 2 * .pi * (t - streamStart - streamReach)
        let depth = CGFloat(sin(φ))
        return Flight(at: CGPoint(x: c.x + r.width * CGFloat(cos(φ)), y: c.y + r.height * CGFloat(sin(φ))),
                      leg: .round, depth: depth, scale: 1 + 0.14 * depth, alpha: 1 - 0.15 * max(0, -depth))
    }

    /// Where the stream's leader is at time `t`: out from behind the charm to
    /// the window, round it as it's poured away, then home into the charm.
    /// Each bat flies the same path a little later, so the stream is a ribbon.
    private func leader(_ t: Double) -> Flight? {
        guard t >= streamStart else { return nil }
        if let back = streamBack, t >= back {
            let w = (t - back) / streamReturn
            guard w < 1 else { return nil }
            let from = circling(back).at, to = home()
            let lift = CGPoint(x: (from.x + to.x) / 2, y: min(from.y, to.y) - 140)
            let e = CGFloat(w * w)
            return Flight(at: quad(from, lift, to, e), leg: .home, depth: 1, scale: 1 - 0.65 * e,
                          alpha: w < 0.8 ? 1 : CGFloat((1 - w) / 0.2))
        }
        let v = CGFloat((t - streamStart) / streamReach)
        guard v < 1 else { return circling(t) }
        // Curves out to meet the ring already flying along it.
        let r = ring(streamStart + streamReach).radii
        let entry = circling(streamStart + streamReach).at
        let along = unit(CGVector(dx: -r.width * CGFloat(sin(entryAngle)), dy: r.height * CGFloat(cos(entryAngle))) * CGFloat(spinSign))
        let from = home()
        let bend = entry + along * (-0.5 * from.dist(entry))
        return Flight(at: quad(from, bend, entry, v), leg: .out, depth: -1, scale: 0.55 + 0.45 * v, alpha: min(1, v * 6))
    }

    // MARK: Drawing

    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        let origin = home()
        let line = unit(aim - origin)
        let flights = stream.compactMap { b -> (StreamBat, Flight, CGFloat)? in
            guard let f = leader(t - b.lag) else { return nil }
            // Leans into the way it's heading.
            let before = leader(t - b.lag - 1.0 / 60)?.at ?? f.at
            return (b, f, min(max((f.at.x - before.x) * 60 / 1800, -0.7), 0.7))
        }

        drawBats(&ctx, t, flights.filter { $0.1.leg == .out || ($0.1.leg == .round && $0.1.depth < 0) })

        let attached = landed != nil && dropped == nil && stowed == nil
        if attached { drawWindow(&ctx, t) }
        let grip = attached ? (pouring(t)?.point(aim + tug(t), at: poured(t)) ?? aim) : aim
        if attached { drawClaw(&ctx, at: grip, along: line, open: 1) }

        drawBats(&ctx, t, flights.filter { $0.1.leg == .round && $0.1.depth >= 0 })
        drawBats(&ctx, t, flights.filter { $0.1.leg == .home })

        // The cable, from the charm to the claw. The charm hangs over this
        // overlay, so it seems to come from behind it.
        if t >= fireTime, stowed == nil, streamBack.map({ t < $0 }) ?? true {
            let len = origin.dist(aim)
            if let d = dropped {
                let u = min(1, (t - d) / retractTime)
                let end = lerp(aim, origin, CGFloat(u * u * u))
                drawCable(&ctx, from: origin, to: end, bow: len * 0.05 * CGFloat(sin(.pi * u)), glow: 0)
                drawClaw(&ctx, at: end, along: line, open: 0)
            } else if landed == nil {
                let u = (t - fireTime) / shootTime
                let end = lerp(origin, aim, CGFloat(easeOutCubic(u)))
                drawCable(&ctx, from: origin, to: end, bow: len * 0.06 * CGFloat(sin(.pi * u)), glow: 0)
                drawClaw(&ctx, at: end, along: line, open: 0)
            } else {
                // Twangs when the claw bites, and again as it takes up;
                // glows while it pours the window in.
                let since = t - (pulled ?? landed ?? t)
                var glow = 0.0
                if let p = pulled { glow = min(1, (t - p) / 0.1) * (0.7 + 0.3 * sin(t * 45)) }
                let twang = sin(since * 60) * exp(-since * 12)
                drawCable(&ctx, from: origin, to: grip, bow: 4 * CGFloat(twang), glow: CGFloat(glow))
            }
        }

        if let s = stowed, t - s < flashTime {
            drawFlash(&ctx, at: origin, (t - s) / flashTime)
        }
        if let a = arrived, t - a < puffTime {
            drawPuff(&ctx, at: origin, (t - a) / puffTime)
        }
    }

    /// The stand-in, strip by strip, as it's poured into the charm. Until the
    /// pour starts the strips lie just as the window did.
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

    private func drawBats(_ ctx: inout GraphicsContext, _ t: Double, _ flights: [(StreamBat, Flight, CGFloat)]) {
        guard !bats.isEmpty, !flights.isEmpty else { return }
        let frames = bats.map { ctx.resolve($0) }
        for (b, f, lean) in flights {
            let w = b.span * f.scale, h = w * batAspect
            var c = ctx
            c.opacity = Double(f.alpha)
            c.translateBy(x: f.at.x, y: f.at.y)
            c.rotate(by: .radians(Double(lean)))
            c.draw(frames[Int((t * 11 + b.beat) * Double(frames.count)) % frames.count],
                   in: CGRect(x: -batBody.x * w, y: -batBody.y * h, width: w, height: h))
        }
    }

    /// Steel line: a pale halo so it reads on dark backgrounds, a dark core,
    /// and a glint down one side. While it pours a window in it glows.
    private func drawCable(_ ctx: inout GraphicsContext, from a: CGPoint, to b: CGPoint, bow: CGFloat, glow: CGFloat) {
        let v = b - a
        let len = hypot(v.dx, v.dy)
        guard len > 1 else { return }
        let n = CGVector(dx: -v.dy / len, dy: v.dx / len)
        var cable = Path()
        cable.move(to: a)
        cable.addQuadCurve(to: b, control: CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) + n * bow)
        if glow > 0.01 {
            ctx.stroke(cable, with: .color(Color(red: 1, green: 0.9, blue: 0.55).opacity(0.4 * Double(glow))),
                       style: StrokeStyle(lineWidth: 12, lineCap: .round))
            ctx.stroke(cable, with: .color(.white.opacity(0.7 * Double(glow))), style: StrokeStyle(lineWidth: 5, lineCap: .round))
        }
        ctx.stroke(cable, with: .color(.white.opacity(0.35)), style: StrokeStyle(lineWidth: 4, lineCap: .round))
        ctx.stroke(cable, with: .color(Color(white: 0.12)), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
        ctx.stroke(cable.offsetBy(dx: -n.dx * 0.6, dy: -n.dy * 0.6),
                   with: .color(.white.opacity(0.45)), style: StrokeStyle(lineWidth: 0.6, lineCap: .round))
    }

    /// The grapple: a hub and three hooked prongs leading along `dir`, folded
    /// in flight and sprung open once it has bitten.
    private func drawClaw(_ ctx: inout GraphicsContext, at p: CGPoint, along dir: CGVector, open: CGFloat) {
        let base = atan2(Double(dir.dy), Double(dir.dx))
        var hooks = Path()
        for side in [-1.0, 0, 1] {
            let a = base + side * (0.3 + 0.6 * Double(open))
            let d = CGVector(dx: cos(a), dy: sin(a))
            let tip = p + d * 13
            // Each prong curls back at the end, away from the middle one.
            let curl = a + (side == 0 ? 1 : side) * 2.3
            hooks.move(to: p)
            hooks.addLine(to: tip)
            hooks.addLine(to: tip + CGVector(dx: cos(curl), dy: sin(curl)) * 5.5)
        }
        let hub = Path(ellipseIn: CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8))
        ctx.stroke(hooks, with: .color(.white.opacity(0.4)),
                   style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
        ctx.stroke(hooks, with: .color(Color(white: 0.14)),
                   style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
        ctx.fill(hub, with: .color(Color(white: 0.14)))
        ctx.stroke(hub, with: .color(.white.opacity(0.45)), lineWidth: 0.8)
    }

    /// The window gone into the charm: a white-gold flash, a shock ring and
    /// sparks, bursting out from behind it.
    private func drawFlash(_ ctx: inout GraphicsContext, at p: CGPoint, _ u: Double) {
        let reach = max(homeSize.width, homeSize.height) / 2
        let e = CGFloat(easeOutCubic(u)), fade = 1 - u
        let glow = reach * (0.3 + 0.9 * e)
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - glow, y: p.y - glow, width: 2 * glow, height: 2 * glow)),
                 with: .radialGradient(Gradient(colors: [.white.opacity(0.95 * fade),
                                                         Color(red: 1, green: 0.85, blue: 0.45).opacity(0.55 * fade),
                                                         Color(red: 1, green: 0.8, blue: 0.4).opacity(0)]),
                                       center: p, startRadius: 0, endRadius: glow))
        let ring = reach * (0.4 + 1.2 * e)
        ctx.stroke(Path(ellipseIn: CGRect(x: p.x - ring, y: p.y - ring, width: 2 * ring, height: 2 * ring)),
                   with: .color(.white.opacity(0.75 * fade)), lineWidth: 3 * CGFloat(fade) + 0.5)
        var sparks = Path()
        for i in 0..<14 {
            let a = Double(i) / 14 * 2 * .pi + 0.35 * sin(Double(i) * 1.7)
            let d = CGVector(dx: cos(a), dy: sin(a))
            let jitter = 1 + 0.35 * CGFloat(sin(Double(i) * 2.9))
            sparks.move(to: p + d * (reach * (0.5 + 0.6 * e) * jitter))
            sparks.addLine(to: p + d * (reach * (0.7 + 1.0 * e) * jitter))
        }
        ctx.stroke(sparks, with: .color(Color(red: 1, green: 0.88, blue: 0.5).opacity(fade)),
                   style: StrokeStyle(lineWidth: 2.2 * CGFloat(fade) + 0.4, lineCap: .round))
    }

    /// A ring and rays of gold, like the emblem's rim, as the bats get home.
    private func drawPuff(_ ctx: inout GraphicsContext, at p: CGPoint, _ u: Double) {
        let gold = Color(red: 0.93, green: 0.78, blue: 0.45)
        let e = CGFloat(easeOutCubic(u))
        let fade = CGFloat(1 - u)
        let r = max(homeSize.width, homeSize.height) / 2 * (0.7 + 0.55 * e)
        ctx.stroke(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                   with: .color(gold.opacity(0.85 * Double(fade))), lineWidth: 3 * fade + 0.5)
        var rays = Path()
        for i in 0..<12 {
            let a = Double(i) / 12 * 2 * .pi + 0.15
            let d = CGVector(dx: cos(a), dy: sin(a))
            rays.move(to: p + d * (r + 10))
            rays.addLine(to: p + d * (r + 18 + 26 * e))
        }
        ctx.stroke(rays, with: .color(gold.opacity(0.9 * Double(fade))),
                   style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
    }
}

// MARK: Overlay

struct BatTowView: View {
    let tow: BatTow?

    var body: some View {
        if let tow {
            TimelineView(.animation) { timeline in
                Canvas { ctx, _ in tow.render(&ctx, at: timeline.date) }
            }
            // Rendered on the GPU: the canvas covers the whole screen.
            .drawingGroup()
        }
    }
}
