import Foundation
import CoreGraphics

// MARK: - Cracked glass
//
// The pattern a blow leaves in glass: cracks running out from where it landed,
// joined by rings of shorter cracks that sit tight and crushed at the centre
// and spread wider further out. The glass between them is the shards.
// Geometry only, so it can be tested headless.

struct CrackWeb {
    let centre: CGPoint
    /// Each ray's corners, from the centre outward. Neighbouring rays and
    /// rings share corners, so the shards fit together exactly.
    let rays: [[CGPoint]]
    /// The ring cracks: corner `corner` of ray `ray` to the same corner of
    /// the next ray round. A few are missing, as in real breaks.
    let rings: [(ray: Int, corner: Int)]
    /// How far the crushed glass round the centre goes.
    let crushed: CGFloat

    init<R: RandomNumberGenerator>(centre: CGPoint, reach: CGFloat, using rng: inout R) {
        self.centre = centre
        let n = Int.random(in: 16...22, using: &rng)
        let gap = 2 * Double.pi / Double(n)
        // Kept small enough that neighbouring rays never cross.
        let angles = (0..<n).map { Double($0) * gap + .random(in: -0.25...0.25, using: &rng) * gap }
        var radii: [CGFloat] = [0]
        var r = CGFloat.random(in: 9...14, using: &rng)
        while r < reach {
            radii.append(r)
            r *= .random(in: 1.32...1.62, using: &rng)
        }
        // Far enough out that, wobble and straight edges and all, the last
        // ring still clears everything within `reach`.
        radii.append(reach * 1.25)
        rays = angles.map { a in
            radii.indices.map { k -> CGPoint in
                guard k > 0 else { return centre }
                let turn = a + .random(in: -0.18...0.18, using: &rng) * gap
                let d = radii[k] * .random(in: 0.92...1.08, using: &rng)
                return CGPoint(x: centre.x + d * CGFloat(cos(turn)), y: centre.y + d * CGFloat(sin(turn)))
            }
        }
        var rings: [(ray: Int, corner: Int)] = []
        for k in 1..<(radii.count - 1) {
            for j in 0..<n where k <= 2 || Double.random(in: 0...1, using: &rng) < 0.82 {
                rings.append((j, k))
            }
        }
        self.rings = rings
        crushed = radii[min(2, radii.count - 1)]
    }

    /// The pieces of glass between the cracks, each a closed outline.
    var shards: [[CGPoint]] {
        var out: [[CGPoint]] = []
        for j in rays.indices {
            let a = rays[j], b = rays[(j + 1) % rays.count]
            for k in 0..<(a.count - 1) {
                out.append(k == 0 ? [a[0], a[1], b[1]] : [a[k], b[k], b[k + 1], a[k + 1]])
            }
        }
        return out
    }
}

/// Whether `p` lies inside the closed outline `poly` (even-odd rule).
func contains(_ poly: [CGPoint], _ p: CGPoint) -> Bool {
    var inside = false
    var j = poly.count - 1
    for i in poly.indices {
        let a = poly[i], b = poly[j]
        if (a.y > p.y) != (b.y > p.y), p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x {
            inside.toggle()
        }
        j = i
    }
    return inside
}
