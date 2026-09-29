import SwiftUI

// MARK: - Web blast
//
// Spider-Man's answer to being thrown about: a web ball at the screen that
// flashes on impact and spreads into a web across all of it, holds for five
// seconds, then falls away.
//
// It is only paint on a click-through overlay: clicks, keys and focus all go
// to whatever is beneath as usual. While the web holds still the overlay's
// frame clock is paused, so for most of its five seconds nothing is redrawn.

final class WebBlast: ObservableObject {
    /// True while the web holds still, which pauses the overlay's frame clock.
    @Published private(set) var holding = false

    private let size: CGSize
    private let centre: CGPoint
    private let hand: () -> CGPoint
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    private let flightTime = 0.2        // web ball from his hand to the glass
    private let spreadTime = 0.45       // web racing out past the screen edges
    private let flashTime = 0.35
    private let letGoTime = 0.25        // strand from his hand fading once it lands
    private let lifetime = 5.0          // from the shot to the web gone
    private let fadeTime = 0.7

    private let reach: CGFloat
    private let spokes: Path
    private let rings: Path

    private var start: Date?
    private var hit = false
    private var held = false
    private var fading = false
    private var ended = false

    init(size: CGSize, centre: CGPoint, hand: @escaping () -> CGPoint,
         push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.size = size
        self.centre = centre
        self.hand = hand
        self.push = push
        self.sound = sound
        self.finish = finish
        let corners = [CGPoint.zero, CGPoint(x: size.width, y: 0),
                       CGPoint(x: 0, y: size.height), CGPoint(x: size.width, y: size.height)]
        reach = corners.map { centre.dist($0) }.max() ?? 1
        (spokes, rings) = Self.weave(centre: centre, reach: reach)
    }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil {
            start = date
            push(unit(hand() - centre) * 160)
            sound(.thwipHeavy)
        }
        let t = date.timeIntervalSince(start ?? date)
        advance(t)
        draw(&ctx, t)
    }

    private func advance(_ t: Double) {
        if !hit, t >= flightTime {
            hit = true
            sound(.blast)
        }
        // Once the impact has played out, stop the clock until it is time to
        // let go. The last frame stays on screen untouched in the meantime.
        let settled = flightTime + max(spreadTime, flashTime, letGoTime) + 0.05
        if !held, t >= settled, t < lifetime - fadeTime {
            held = true
            let resume = lifetime - fadeTime - t
            // Published outside the view update that is running this.
            DispatchQueue.main.async { [weak self] in self?.holding = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + resume) { [weak self] in self?.holding = false }
        }
        if !fading, t >= lifetime - fadeTime {
            fading = true
            sound(.unweb)
        }
        if !ended, t >= lifetime {
            ended = true
            finish()
        }
    }

    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        // The strand from his hand: in flight, then fading once it has landed.
        if t < flightTime + letGoTime {
            let h = hand()
            var c = ctx
            if t < flightTime {
                let u = t / flightTime
                let head = lerp(h, centre, CGFloat(easeOutCubic(u)))
                Silk.strand(&c, from: h, to: head, bow: h.dist(centre) * 0.08 * CGFloat(sin(.pi * u)), weight: 1.5)
                Silk.head(&c, at: head, radius: 7)
            } else {
                c.opacity = 1 - (t - flightTime) / letGoTime
                Silk.strand(&c, from: h, to: centre, bow: 0, weight: 1.5)
            }
        }
        guard t >= flightTime else { return }

        let fade = t > lifetime - fadeTime ? CGFloat((t - (lifetime - fadeTime)) / fadeTime) : 0
        var c = ctx
        c.opacity = Double(1 - fade)
        // Drifts toward the viewer as it lets go.
        let drift = 1 + 0.06 * fade
        c.translateBy(x: centre.x, y: centre.y)
        c.scaleBy(x: drift, y: drift)
        c.translateBy(x: -centre.x, y: -centre.y)
        // Spreads out from where it hit rather than appearing all at once.
        let r = max(1, reach * CGFloat(easeOutCubic((t - flightTime) / spreadTime)))
        c.clip(to: Path(ellipseIn: CGRect(x: centre.x - r, y: centre.y - r, width: 2 * r, height: 2 * r)))

        // A faint frosting, thickest at the hub, so it reads as webbed glass.
        c.fill(Path(CGRect(origin: .zero, size: size)),
               with: .radialGradient(Gradient(colors: [.white.opacity(0.22), .white.opacity(0.04)]),
                                     center: centre, startRadius: 0, endRadius: reach))
        for (path, width) in [(rings, 1.2), (spokes, 1.8)] as [(Path, CGFloat)] {
            c.stroke(path, with: .color(.black.opacity(0.2)), style: StrokeStyle(lineWidth: width + 1.8, lineCap: .round))
            c.stroke(path, with: .color(Silk.color.opacity(0.92)), style: StrokeStyle(lineWidth: width, lineCap: .round))
        }
        drawHub(&c)

        let f = (t - flightTime) / flashTime
        if f < 1 {
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white.opacity(0.5 * pow(1 - f, 2))))
        }
    }

    /// The splat where the ball hit: a lumpy blob rather than a clean disc.
    private func drawHub(_ c: inout GraphicsContext) {
        var blob = Path(ellipseIn: CGRect(x: centre.x - 14, y: centre.y - 14, width: 28, height: 28))
        for i in 0..<7 {
            let a = Double(i) / 7 * 2 * .pi + 0.4
            let d = 11 + 5 * CGFloat(sin(Double(i) * 1.9))
            let r = 6 + 3 * CGFloat(cos(Double(i) * 2.3))
            let p = centre + CGVector(dx: cos(a), dy: sin(a)) * d
            blob.addEllipse(in: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
        }
        c.fill(blob, with: .color(.black.opacity(0.18)))
        c.fill(blob.offsetBy(dx: 0, dy: -1), with: .color(Silk.color))
    }

    /// An orb web: spokes out past the screen corners and threads between
    /// them on rings spaced wider toward the edge. Woven once per blast, with
    /// fresh randomness, so no two look alike.
    private static func weave(centre c: CGPoint, reach: CGFloat) -> (Path, Path) {
        let count = 20
        let dirs = (0..<count).map { i -> CGVector in
            let a = (Double(i) + .random(in: -0.3...0.3)) / Double(count) * 2 * .pi
            return CGVector(dx: cos(a), dy: sin(a))
        }
        var spokes = Path()
        for d in dirs {
            spokes.move(to: c)
            spokes.addLine(to: c + d * (reach * 1.05))
        }
        var rings = Path()
        var r: CGFloat = 24
        while r < reach * 1.05 {
            // Each spoke meets the ring at its own slightly different radius.
            let radii = dirs.map { _ in r * .random(in: 0.93...1.07) }
            for i in 0..<count where Double.random(in: 0...1) > 0.06 {   // a few snapped threads
                let j = (i + 1) % count
                let p = c + dirs[i] * radii[i], q = c + dirs[j] * radii[j]
                let mid = CGPoint(x: (p.x + q.x) / 2, y: (p.y + q.y) / 2)
                // Threads sag toward the hub between spokes, as real ones do.
                rings.move(to: p)
                rings.addQuadCurve(to: q, control: c + (mid - c) * 0.9)
            }
            r *= 1.3
        }
        return (spokes, rings)
    }
}

// MARK: Overlay

struct WebBlastView: View {
    let blast: WebBlast?

    var body: some View {
        if let blast { BlastCanvas(blast: blast) }
    }
}

private struct BlastCanvas: View {
    @ObservedObject var blast: WebBlast

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: blast.holding)) { timeline in
            Canvas { ctx, _ in blast.render(&ctx, at: timeline.date) }
        }
        .drawingGroup()
    }
}
