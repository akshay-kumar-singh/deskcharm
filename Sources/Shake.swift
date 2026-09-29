import Foundation
import CoreGraphics

/// Tells manhandling from dragging. Pointer travel fills a bucket that drains
/// at a steady rate, so only hard, sustained throwing about fills it: a long
/// slow drag or a single fling drains about as fast as it fills.
final class ShakeMeter {
    var capacity: CGFloat = 2400
    var drain: CGFloat = 700            // points per second

    private var level: CGFloat = 0
    private var last: (at: CGPoint, time: Date)?

    /// Feeds one pointer sample. True when the bucket overflows, after which
    /// it starts again from empty.
    func drag(to p: CGPoint, at time: Date) -> Bool {
        defer { last = (p, time) }
        guard let l = last else { return false }
        let dt = CGFloat(max(0, time.timeIntervalSince(l.time)))
        level = max(0, level - drain * dt) + l.at.dist(p)
        guard level >= capacity else { return false }
        level = 0
        return true
    }

    func release() {
        level = 0
        last = nil
    }
}
