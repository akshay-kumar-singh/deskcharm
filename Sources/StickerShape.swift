import Foundation
import CoreGraphics

/// Measures a sticker from its alpha, one byte a pixel, rows top first: the
/// box to trim it to, and where its chain should fix on. No AppKit, so it's
/// testable headless.
enum StickerShape {
    /// The smallest box holding everything more than faintly opaque.
    static func bounds(alpha: [UInt8], width: Int, height: Int, threshold: UInt8 = 8) -> CGRect? {
        var minX = width, minY = height, maxX = -1, maxY = -1
        for y in 0..<height {
            let row = y * width
            for x in 0..<width where alpha[row + x] > threshold {
                minX = min(minX, x); maxX = max(maxX, x)
                minY = min(minY, y); maxY = max(maxY, y)
            }
        }
        guard maxX >= 0 else { return nil }
        return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
    }

    /// Where the chain fixes on, as a fraction of the sticker: the highest
    /// solid point near the line its weight balances on, so it hangs from the
    /// top of the subject, not from an empty corner or down in a notch.
    static func attach(alpha: [UInt8], width: Int, height: Int) -> CGPoint {
        var sum = 0.0, weight = 0.0
        for y in 0..<height {
            let row = y * width
            for x in 0..<width {
                let a = Double(alpha[row + x])
                sum += a * Double(x)
                weight += a
            }
        }
        let centre = weight > 0 ? sum / weight : Double(width) / 2
        let band = max(1, Int(Double(width) * 0.15))
        let from = max(0, Int(centre) - band), to = min(width - 1, Int(centre) + band)
        var best: (x: Int, y: Int)?
        for x in from...to {
            guard let y = (0..<height).first(where: { alpha[$0 * width + x] >= 128 }) else { continue }
            if let b = best, y > b.y || (y == b.y && abs(Double(x) - centre) >= abs(Double(b.x) - centre)) { continue }
            best = (x, y)
        }
        guard let best else { return CGPoint(x: 0.5, y: 0) }
        return CGPoint(x: (Double(best.x) + 0.5) / Double(width), y: Double(best.y) / Double(height))
    }
}
