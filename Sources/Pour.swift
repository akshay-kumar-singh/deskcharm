import CoreGraphics

// MARK: - Pouring a window
//
// The Batman charm takes a window the way a genie goes into its lamp. The
// window is cut into strips across the line to the charm; the strips nearest
// it pinch in toward that line and go first, the far ones follow, and all of
// them are squeezed thin on the way in. Geometry only, so it can be tested
// headless.

struct Pour {
    let window: CGRect
    let into: CGPoint
    /// Strips stand side by side when the pour runs sideways, and are stacked
    /// when it runs up or down.
    let columns: Bool

    /// How far into the pour the far side of the window sets off.
    static let lag: CGFloat = 0.5

    static func runsSideways(from window: CGRect, to p: CGPoint) -> Bool {
        abs(p.x - window.midX) >= abs(p.y - window.midY)
    }

    /// Strip `j` of `n`, `u` of the way through the pour (0 untouched, 1 all
    /// gone), and how opaque it is: strips fade as they reach the car.
    func strip(_ j: Int, of n: Int, at u: CGFloat) -> (rect: CGRect, opacity: CGFloat) {
        let lo = a0 + (a1 - a0) * CGFloat(j) / CGFloat(n)
        let hi = a0 + (a1 - a0) * CGFloat(j + 1) / CGFloat(n)
        let mid = (lo + hi) / 2
        // A hair of overlap, or the seams between strips show as faint lines.
        let s0 = min(placed(lo, u), placed(hi, u)) - 0.5, s1 = max(placed(lo, u), placed(hi, u)) + 0.5
        let k = pinch(mid, u)
        let t0 = c0 + (pc - c0) * k, t1 = c1 + (pc - c1) * k
        let rect = columns ? CGRect(x: s0, y: t0, width: s1 - s0, height: t1 - t0)
                           : CGRect(x: t0, y: s0, width: t1 - t0, height: s1 - s0)
        let e = progress(mid, u)
        return (rect, e > 0.9 ? (1 - e) / 0.1 : 1)
    }

    /// Where a point of the window, such as the grapple's grip, has been carried.
    func point(_ q: CGPoint, at u: CGFloat) -> CGPoint {
        let a = columns ? q.x : q.y, c = columns ? q.y : q.x
        let along = placed(a, u), across = c + (pc - c) * pinch(a, u)
        return columns ? CGPoint(x: along, y: across) : CGPoint(x: across, y: along)
    }

    // Along the pour and across it.
    private var a0: CGFloat { columns ? window.minX : window.minY }
    private var a1: CGFloat { columns ? window.maxX : window.maxY }
    private var c0: CGFloat { columns ? window.minY : window.minX }
    private var c1: CGFloat { columns ? window.maxY : window.maxX }
    private var pa: CGFloat { columns ? into.x : into.y }
    private var pc: CGFloat { columns ? into.y : into.x }

    /// 0 on the side nearest the car, 1 on the far side.
    private func far(_ a: CGFloat) -> CGFloat {
        let near = pa >= (a0 + a1) / 2 ? a1 : a0
        return abs(near - a) / max(1, a1 - a0)
    }

    /// 0 → 1 as this part of the window is drawn in, quickening as it goes.
    private func progress(_ a: CGFloat, _ u: CGFloat) -> CGFloat {
        let x = min(max((u - Self.lag * far(a)) / (1 - Self.lag), 0), 1)
        return x * x
    }

    private func placed(_ a: CGFloat, _ u: CGFloat) -> CGFloat {
        a + (pa - a) * progress(a, u)
    }

    /// How far each part is squeezed toward the line: the near side necks in
    /// at once, before it moves, and everything is squeezed ever thinner on
    /// the way in, to nothing just as it gets there.
    private func pinch(_ a: CGFloat, _ u: CGFloat) -> CGFloat {
        let neck = (1 - far(a)) * 0.3 * min(1, u * 5)
        let left = 1 - progress(a, u)
        return 1 - left * left * (1 - neck)
    }
}
