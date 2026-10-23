import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins
import Vision

/// Turns a picture into a die-cut sticker: the subject lifted off its
/// background by Vision, ringed with a white border and a faint rim, trimmed
/// to fit. With no subject to lift, or asked not to, the whole picture is used
/// as a rounded card. Slow enough (a few hundred ms) to keep off the main thread.
enum Sticker {
    struct Made {
        let image: CGImage
        let attach: CGPoint         // where the chain fixes on, as a fraction of it
        let cutOut: Bool            // whether a subject was lifted out
    }

    enum Failure: LocalizedError {
        case unreadable, empty
        var errorDescription: String? {
            switch self {
            case .unreadable: "That file couldn't be read as a picture."
            case .empty: "There's nothing in that picture to make a sticker of."
            }
        }
    }

    private static let context = CIContext()
    /// The long side a picture is worked at, and the most a sticker keeps:
    /// twice the largest charm, so it stays sharp on a Retina screen.
    private static let workSide: CGFloat = 1400
    private static let keepSide: CGFloat = 760

    static func make(from url: URL, cutOut: Bool) throws -> Made {
        guard var picture = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]),
              picture.extent.width >= 1, picture.extent.height >= 1
        else { throw Failure.unreadable }
        let scale = min(1, workSide / max(picture.extent.width, picture.extent.height))
        if scale < 1 {
            picture = picture.applyingFilter("CILanczosScaleTransform",
                                             parameters: [kCIInputScaleKey: scale, kCIInputAspectRatioKey: 1])
        }
        picture = picture.transformed(by: CGAffineTransform(translationX: -picture.extent.minX, y: -picture.extent.minY))
        picture = picture.cropped(to: CGRect(x: 0, y: 0, width: floor(picture.extent.width), height: floor(picture.extent.height)))

        let lifted = cutOut ? lift(picture) : nil
        let body = lifted ?? card(picture)
        let border = max(6, 0.028 * max(body.extent.width, body.extent.height))
        let canvas = body.extent.insetBy(dx: -border * 2, dy: -border * 2)
        let padded = body.composited(over: CIImage(color: .clear).cropped(to: canvas))
        let white = silhouette(padded, grow: border, color: CIVector(x: 1, y: 1, z: 1, w: 1))
        let rim = silhouette(padded, grow: border + max(1.5, border * 0.07), color: CIVector(x: 0, y: 0, z: 0, w: 0.16))
        let sticker = body.composited(over: white).composited(over: rim).cropped(to: canvas)
        guard let full = context.createCGImage(sticker, from: canvas) else { throw Failure.unreadable }
        return try trimmed(full, cutOut: lifted != nil)
    }

    /// The picture's subjects, everything else made clear; nil if Vision finds none.
    private static func lift(_ picture: CIImage) -> CIImage? {
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(ciImage: picture)
        guard (try? handler.perform([request])) != nil,
              let found = request.results?.first, !found.allInstances.isEmpty,
              let mask = try? found.generateScaledMaskForImage(forInstances: found.allInstances, from: handler)
        else { return nil }
        return picture.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: CIImage.empty(),
            kCIInputMaskImageKey: CIImage(cvPixelBuffer: mask)
        ])
    }

    /// The whole picture with its corners rounded off.
    private static func card(_ picture: CIImage) -> CIImage {
        let corners = CIFilter.roundedRectangleGenerator()
        corners.extent = picture.extent
        corners.radius = Float(0.08 * min(picture.extent.width, picture.extent.height))
        corners.color = .white
        return picture.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: CIImage.empty(),
            kCIInputMaskImageKey: corners.outputImage ?? picture
        ])
    }

    /// The image's shape grown outward by `r`, filled with one colour: the
    /// border behind it. `color` is unpremultiplied, its alpha a strength.
    private static func silhouette(_ image: CIImage, grow r: CGFloat, color: CIVector) -> CIImage {
        let zero = CIVector(x: 0, y: 0, z: 0, w: 0)
        return image
            .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: r])
            .applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": zero, "inputGVector": zero, "inputBVector": zero,
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: color.w),
                "inputBiasVector": CIVector(x: color.x, y: color.y, z: color.z, w: 0)
            ])
            .applyingGaussianBlur(sigma: 0.7)
            .cropped(to: image.extent)
    }

    /// Cut to what's opaque, brought down to the size kept, and measured for
    /// where the chain goes.
    private static func trimmed(_ image: CGImage, cutOut: Bool) throws -> Made {
        guard let alpha = alphaChannel(image),
              let box = StickerShape.bounds(alpha: alpha, width: image.width, height: image.height),
              let cropped = image.cropping(to: box)
        else { throw Failure.empty }
        let s = min(1, keepSide / CGFloat(max(cropped.width, cropped.height)))
        let w = max(1, Int((CGFloat(cropped.width) * s).rounded())), h = max(1, Int((CGFloat(cropped.height) * s).rounded()))
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { throw Failure.empty }
        ctx.interpolationQuality = .high
        ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let kept = ctx.makeImage(), let keptAlpha = alphaChannel(kept) else { throw Failure.empty }
        return Made(image: kept, attach: StickerShape.attach(alpha: keptAlpha, width: w, height: h), cutOut: cutOut)
    }

    /// One alpha byte a pixel, rows top first.
    private static func alphaChannel(_ image: CGImage) -> [UInt8]? {
        let w = image.width, h = image.height
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        let drawn = rgba.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drawn else { return nil }
        return stride(from: 3, to: rgba.count, by: 4).map { rgba[$0] }
    }
}
