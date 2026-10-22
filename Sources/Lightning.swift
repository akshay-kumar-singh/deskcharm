import SwiftUI

// MARK: - Drawing lightning
//
// Shared by the storm's bolts and the strike on a window: a wide cold glow
// under a bright body under a white-hot core.

enum Lightning {
    static let glow = Color(red: 0.55, green: 0.7, blue: 1)
    static let night = Color(red: 0.03, green: 0.05, blue: 0.12)

    /// A bolt with its forks, at brightness `a`. `heavy` fattens it; `ground`,
    /// where there is one, gets a splash of light.
    static func draw(_ ctx: inout GraphicsContext, trunk points: [CGPoint], forks lines: [[CGPoint]],
                     ground: CGPoint?, alpha a: Double, heavy: CGFloat = 1) {
        var trunk = Path(), forks = Path()
        trunk.addLines(points)
        for f in lines { forks.addLines(f) }

        var halo = ctx
        halo.blendMode = .plusLighter
        let round = { (w: CGFloat) in StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round) }
        halo.stroke(trunk, with: .color(glow.opacity(0.16 * a)), style: round(34 * heavy))
        halo.stroke(forks, with: .color(glow.opacity(0.12 * a)), style: round(16))
        halo.stroke(trunk, with: .color(glow.opacity(0.4 * a)), style: round(12 * heavy))
        halo.stroke(forks, with: .color(glow.opacity(0.35 * a)), style: round(5))
        ctx.stroke(forks, with: .color(.white.opacity(0.85 * a)), style: round(1.6))
        ctx.stroke(trunk, with: .color(.white.opacity(a)), style: round(3.6 * heavy))

        guard let g = ground else { return }
        let r: CGFloat = 130 * heavy
        halo.fill(Path(ellipseIn: CGRect(x: g.x - r, y: g.y - r, width: 2 * r, height: 2 * r)),
                  with: .radialGradient(Gradient(colors: [glow.opacity(0.7 * a), glow.opacity(0)]),
                                        center: g, startRadius: 0, endRadius: r))
    }

    /// Short-lived arcs of electricity: thin, bright and quickly redrawn.
    static func crackle(_ ctx: inout GraphicsContext, _ lines: [[CGPoint]], alpha a: Double, width: CGFloat) {
        var path = Path()
        for l in lines { path.addLines(l) }
        var halo = ctx
        halo.blendMode = .plusLighter
        let round = { (w: CGFloat) in StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round) }
        halo.stroke(path, with: .color(glow.opacity(0.35 * a)), style: round(width * 4.5))
        ctx.stroke(path, with: .color(.white.opacity(a)), style: round(width))
    }
}
