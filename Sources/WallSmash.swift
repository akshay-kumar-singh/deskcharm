import SwiftUI

// MARK: - Wall smash
//
// The Hulk's answer to being thrown about: three blows at the screen as if it
// were a concrete wall. Each leaves a crater, knocks chips off round it, sends
// cracks forking away across the screen, and throws out chunks and dust. It
// holds a moment, then the craters crumble and fall out and the dust clears.
//
// Paint only, on a click-through overlay, like the web blast: clicks, keys and
// focus all go to whatever is beneath. While it holds, the frame clock stops.

final class WallSmash: ObservableObject {
    /// True while the wall holds still, which pauses the overlay's frame clock.
    @Published private(set) var holding = false

    private struct Blow {
        let time: Double
        let crater: Crater
        let rim: Path
        let pit: Path
        let chips: Path
        let reach: CGFloat
        /// The cracks as a path per width, so each width is one stroke.
        let cracks: [(path: Path, width: CGFloat)]
        /// Puffs of dust: which way each goes, and how far.
        let dust: [(heading: Double, reach: CGFloat)]
    }

    private let size: CGSize
    private let concrete: Image
    private let blows: [Blow]
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    private let spreadTime = 0.2        // cracks racing out from a blow
    private let flashTime = 0.16
    private let shakeTime = 0.45
    private let dustTime = 1.5
    private let flyTime = 1.3           // chunks thrown out by a blow
    private let crumbleAt = 3.3         // seconds in when the craters give way
    private let crumbleTime = 1.3

    private var start: Date?
    private var struck = 0
    private var held = false
    private var crumbled = false
    private var ended = false

    init(size: CGSize, concrete: CGImage, push: @escaping (CGVector) -> Void,
         sound: @escaping (SoundFX.Effect) -> Void, finish: @escaping () -> Void) {
        self.size = size
        self.concrete = Image(decorative: concrete, scale: 1)
        self.push = push
        self.sound = sound
        self.finish = finish
        var rng = SystemRandomNumberGenerator()
        // Spread over the screen so that between them they smash all of it.
        let spots = [CGPoint(x: 0.3, y: 0.42), CGPoint(x: 0.72, y: 0.6), CGPoint(x: 0.52, y: 0.27)]
        let bounds = CGRect(origin: .zero, size: size)
        let radius = min(max(min(size.width, size.height) * 0.11, 64), 140)
        let corners = [CGPoint.zero, CGPoint(x: size.width, y: 0),
                       CGPoint(x: 0, y: size.height), CGPoint(x: size.width, y: size.height)]
        blows = spots.enumerated().map { i, s in
            let at = CGPoint(x: (s.x + .random(in: -0.05...0.05, using: &rng)) * size.width,
                             y: (s.y + .random(in: -0.05...0.05, using: &rng)) * size.height)
            let crater = Crater(centre: at, radius: radius * .random(in: 0.85...1.15, using: &rng), bounds: bounds, using: &rng)
            let pit = crater.rim.map { q in
                CGPoint(x: at.x + (q.x - at.x) * .random(in: 0.38...0.55, using: &rng),
                        y: at.y + (q.y - at.y) * .random(in: 0.38...0.55, using: &rng))
            }
            return Blow(time: Double(i) * 0.34, crater: crater, rim: ConcreteArt.outline(crater.rim), pit: ConcreteArt.outline(pit),
                        chips: crater.chips.reduce(into: Path()) { $0.addPath(ConcreteArt.outline($1)) },
                        reach: corners.map { at.dist($0) }.max() ?? 1, cracks: ConcreteArt.tapered(crater.cracks),
                        dust: (0..<11).map { _ in (.random(in: 0..<(2 * .pi), using: &rng), .random(in: 0.6...1.2, using: &rng)) })
        }
    }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil { start = date }
        let t = date.timeIntervalSince(start ?? date)
        advance(t)
        draw(&ctx, t)
    }

    private func advance(_ t: Double) {
        while struck < blows.count, t >= blows[struck].time {
            push(CGVector(dx: .random(in: -1...1) * 170, dy: -60))
            sound(.crash)
            struck += 1
        }
        // Once the dust and the chunks have settled, stop the clock until the
        // craters give way. The last frame stays on screen meanwhile.
        let settled = (blows.last?.time ?? 0) + max(dustTime, flyTime, shakeTime) + 0.05
        if !held, t >= settled, t < crumbleAt {
            held = true
            let resume = crumbleAt - t
            // Published outside the view update that is running this.
            DispatchQueue.main.async { [weak self] in self?.holding = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + resume) { [weak self] in self?.holding = false }
        }
        if !crumbled, t >= crumbleAt {
            crumbled = true
            sound(.rubble)
        }
        if !ended, t >= crumbleAt + crumbleTime {
            ended = true
            finish()
        }
    }

    // MARK: Drawing

    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        var c = ctx
        let s = shake(t)
        c.translateBy(x: s.dx, y: s.dy)
        let fade = t < crumbleAt ? 1 : max(0, 1 - (t - crumbleAt) / 0.6)
        for b in blows where t >= b.time { drawCracks(&c, b, t, fade: fade) }
        for b in blows where t >= b.time {
            if t < crumbleAt {
                drawCrater(&c, b, t)
            } else {
                drawPieces(&c, b.crater.crumbs, after: t - crumbleAt, fadeAfter: 0.5)
            }
        }
        for b in blows where t >= b.time && t - b.time < flyTime {
            drawPieces(&c, b.crater.thrown, after: t - b.time, fadeAfter: 0.8)
        }
        for b in blows where t >= b.time { drawDust(&c, b, t) }
        for b in blows where t >= b.time && t - b.time < flashTime {
            let u = (t - b.time) / flashTime
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white.opacity(0.22 * (1 - u) * (1 - u))))
        }
    }

    /// Cracks racing out from where the blow landed: dark, with a lit lip.
    private func drawCracks(_ ctx: inout GraphicsContext, _ b: Blow, _ t: Double, fade: Double) {
        guard fade > 0 else { return }
        let r = max(1, b.reach * CGFloat(easeOutCubic((t - b.time) / spreadTime)))
        var c = ctx
        c.clip(to: Path(ellipseIn: CGRect(x: b.crater.centre.x - r, y: b.crater.centre.y - r, width: 2 * r, height: 2 * r)))
        ConcreteArt.stroke(&c, b.cracks, fade: fade)
    }

    /// The crater: bare concrete, deep in the middle and shadowed on the side
    /// the light comes from, with chips knocked off round its lip.
    private func drawCrater(_ ctx: inout GraphicsContext, _ b: Blow, _ t: Double) {
        let p = b.crater.centre, r = b.crater.radius
        var c = ctx
        // Punched in: it bursts open in a few frames.
        let open = CGFloat(easeOutBack(min(1, (t - b.time) / 0.1)))
        c.translateBy(x: p.x, y: p.y)
        c.scaleBy(x: open, y: open)
        c.translateBy(x: -p.x, y: -p.y)
        c.fill(b.chips, with: .tiledImage(concrete, scale: 0.4))
        c.fill(b.chips, with: .color(.white.opacity(0.14)))
        c.stroke(b.chips, with: .color(.black.opacity(0.5)), lineWidth: 1)
        c.fill(b.rim, with: .tiledImage(concrete, scale: 0.45))
        c.fill(b.rim, with: .linearGradient(Gradient(colors: [.black.opacity(0.55), .black.opacity(0.1), .white.opacity(0.12)]),
                                            startPoint: CGPoint(x: p.x - r, y: p.y - r), endPoint: CGPoint(x: p.x + r, y: p.y + r)))
        c.fill(b.rim, with: .radialGradient(Gradient(colors: [.black.opacity(0.6), .black.opacity(0.18), .black.opacity(0)]),
                                            center: p, startRadius: 0, endRadius: r * 1.05))
        c.stroke(b.rim.offsetBy(dx: -1, dy: -1.4), with: .color(.white.opacity(0.4)), lineWidth: 1.4)
        c.stroke(b.rim, with: .color(Color(white: 0.08).opacity(0.85)), lineWidth: 1.6)
        // The pit where the fist went in: deeper, with its own broken lip.
        c.fill(b.pit, with: .tiledImage(concrete, scale: 0.3))
        c.fill(b.pit, with: .radialGradient(Gradient(colors: [.black.opacity(0.85), .black.opacity(0.5)]),
                                            center: p, startRadius: 0, endRadius: r * 0.5))
        c.stroke(b.pit.offsetBy(dx: 0.8, dy: 1.2), with: .color(.white.opacity(0.3)), lineWidth: 1.2)
        c.stroke(b.pit, with: .color(.black.opacity(0.7)), lineWidth: 1.2)
    }

    /// Loose concrete tumbling down under gravity, each piece shaded on its own.
    private func drawPieces(_ ctx: inout GraphicsContext, _ pieces: [Crater.Chunk], after τ: Double, fadeAfter: Double) {
        let alpha = τ < fadeAfter ? 1 : max(0, 1 - (τ - fadeAfter) / 0.5)
        guard alpha > 0 else { return }
        for piece in pieces {
            let at = Crater.position(of: piece, after: τ)
            guard at.y < size.height + 40 else { continue }
            var c = ctx
            c.opacity = alpha
            ConcreteArt.draw(&c, piece, at: at, turned: piece.spin * τ, concrete: concrete)
        }
    }

    /// Dust thrown off by the blow, billowing out and settling; and again,
    /// once the crater crumbles.
    private func drawDust(_ ctx: inout GraphicsContext, _ b: Blow, _ t: Double) {
        let dust = Color(red: 0.72, green: 0.68, blue: 0.62)
        for since in [t - b.time, t - crumbleAt] where since >= 0 && since < dustTime {
            let u = since / dustTime
            let e = CGFloat(easeOutCubic(u))
            for puff in b.dust {
                let d = CGVector(dx: cos(puff.heading), dy: sin(puff.heading))
                let p = b.crater.centre + d * ((20 + 150 * e) * puff.reach) + CGVector(dx: 0, dy: -30 * e)
                let r = (28 + 120 * e) * puff.reach
                ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                         with: .radialGradient(Gradient(colors: [dust.opacity(0.42 * pow(1 - u, 1.3)), dust.opacity(0)]),
                                               center: p, startRadius: 0, endRadius: r))
            }
        }
    }

    private func shake(_ t: Double) -> CGVector {
        var v = CGVector.zero
        for b in blows where t >= b.time && t - b.time < shakeTime {
            let u = t - b.time
            let a = 13 * exp(-u / 0.1)
            v.dx += CGFloat(a * sin(u * 72))
            v.dy += CGFloat(a * cos(u * 59))
        }
        return v
    }
}

/// Smashed concrete as it's drawn, here and where the Hulk's slams land.
enum ConcreteArt {
    static func outline(_ points: [CGPoint]) -> Path {
        var path = Path()
        path.addLines(points)
        path.closeSubpath()
        return path
    }

    /// A crack thins steadily along its length, so it is cut into pieces,
    /// each drawn at the width it has there, gathered into a few widths.
    static func tapered(_ cracks: [Crater.Crack]) -> [(path: Path, width: CGFloat)] {
        let widths: [CGFloat] = [5, 4, 3.2, 2.5, 1.9, 1.4, 1, 0.7]
        var paths = [Path](repeating: Path(), count: widths.count)
        for crack in cracks {
            let n = crack.points.count - 1
            for i in 0..<n {
                let w = crack.width * (1 - CGFloat(i) / CGFloat(max(n, 1))) + 0.6
                let k = widths.firstIndex { $0 <= w } ?? widths.count - 1
                paths[k].move(to: crack.points[i])
                paths[k].addLine(to: crack.points[i + 1])
            }
        }
        return zip(paths, widths).map { ($0, $1) }.filter { !$0.0.isEmpty }
    }

    /// Cracks: dark, with a lit lip.
    static func stroke(_ c: inout GraphicsContext, _ cracks: [(path: Path, width: CGFloat)], fade: Double) {
        for (path, width) in cracks {
            c.stroke(path, with: .color(Color(white: 0.07).opacity(0.75 * fade)),
                     style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            c.stroke(path.offsetBy(dx: 0.7, dy: 0.9), with: .color(.white.opacity(0.3 * fade)),
                     style: StrokeStyle(lineWidth: max(0.5, width * 0.4), lineCap: .round, lineJoin: .round))
        }
    }

    /// A loose piece at `at`, turned, shaded on its own.
    static func draw(_ ctx: inout GraphicsContext, _ piece: Crater.Chunk, at: CGPoint, turned: Double, concrete: Image) {
        var c = ctx
        c.translateBy(x: at.x, y: at.y)
        c.rotate(by: .radians(turned))
        let outline = outline(piece.outline)
        c.fill(outline, with: .tiledImage(concrete, scale: 0.4))
        c.fill(outline, with: .color(piece.shade < 1 ? .black.opacity(0.55 * (1 - piece.shade))
                                                   : .white.opacity(0.5 * (piece.shade - 1))))
        c.stroke(outline, with: .color(.black.opacity(0.45)), lineWidth: 0.8)
    }
}

// MARK: Overlay

struct WallSmashView: View {
    let smash: WallSmash?

    var body: some View {
        if let smash { WallSmashCanvas(smash: smash) }
    }
}

private struct WallSmashCanvas: View {
    @ObservedObject var smash: WallSmash

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: smash.holding)) { timeline in
            Canvas { ctx, _ in smash.render(&ctx, at: timeline.date) }
        }
        .drawingGroup()
    }
}
