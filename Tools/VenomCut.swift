import AppKit
import CoreImage
import Vision

// Cuts the Venom charm out of its picture: him crouched on a bridge with his
// claw raised, against the sky. Vision's subject mask takes him off the
// background cleanly, so it's that, trimmed to him.
//
//   swiftc -O Tools/VenomCut.swift -o build/venom-cut && build/venom-cut Charms/Venom-source.jpg Charms
//
// writes Charms/Venom.png and Charms/hd/Venom.png. The picture is big enough
// for the largest charm as it is, so the two are the same. It also prints
// where he hangs from — the tip of his raised claw — and the tilt that puts
// his weight straight under it, for CharmHang in main.swift.

let args = CommandLine.arguments
guard args.count == 3 else { fatalError("usage: venom-cut source.jpg charms-folder") }
let source = URL(fileURLWithPath: args[1]), folder = args[2]

guard let picture = CIImage(contentsOf: source, options: [.applyOrientationProperty: true]) else {
    fatalError("can't read \(args[1])")
}
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: picture)
try handler.perform([request])
guard let found = request.results?.first, !found.allInstances.isEmpty else { fatalError("no subject found") }
let mask = CIImage(cvPixelBuffer: try found.generateScaledMaskForImage(forInstances: found.allInstances, from: handler))
let cut = picture.applyingFilter("CIBlendWithMask", parameters: [
    kCIInputBackgroundImageKey: CIImage.empty(), kCIInputMaskImageKey: mask
])
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
let whole = CIContext().createCGImage(cut, from: picture.extent, format: .RGBA8, colorSpace: sRGB)!

// Alpha, rows top first, to trim by and to find where he hangs from.
let w = whole.width, h = whole.height
var rgba = [UInt8](repeating: 0, count: w * h * 4)
rgba.withUnsafeMutableBytes { buf in
    CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: sRGB,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        .draw(whole, in: CGRect(x: 0, y: 0, width: w, height: h))
}
func alpha(_ x: Int, _ y: Int) -> UInt8 { rgba[(y * w + x) * 4 + 3] }

var box = (minX: w, minY: h, maxX: -1, maxY: -1)
for y in 0..<h { for x in 0..<w where alpha(x, y) > 8 {
    box = (min(box.minX, x), min(box.minY, y), max(box.maxX, x), max(box.maxY, y))
} }
let trim = CGRect(x: box.minX, y: box.minY, width: box.maxX - box.minX + 1, height: box.maxY - box.minY + 1)
let trimmed = whole.cropping(to: trim)!

func write(_ image: CGImage, _ path: String) {
    let out = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(out, image, nil)
    CGImageDestinationFinalize(out)
    print("wrote \(path) \(image.width)x\(image.height)")
}
write(trimmed, "\(folder)/Venom.png")
write(trimmed, "\(folder)/hd/Venom.png")

// The tip of his raised claw is the highest solid point; his weight is the
// alpha-weighted middle of him. Both as fractions of the trimmed picture.
let tw = Double(trim.width), th = Double(trim.height)
var claw: (x: Int, y: Int)?
search: for y in box.minY...box.maxY {
    for x in box.minX...box.maxX where alpha(x, y) >= 128 { claw = (x, y); break search }
}
var sx = 0.0, sy = 0.0, sum = 0.0
for y in box.minY...box.maxY { for x in box.minX...box.maxX {
    let a = Double(alpha(x, y)); sx += a * Double(x); sy += a * Double(y); sum += a
} }
let hang = (x: (Double(claw!.x - box.minX) + 0.5) / tw, y: Double(claw!.y - box.minY) / th)
let weight = (x: (sx / sum - Double(box.minX)) / tw, y: (sy / sum - Double(box.minY)) / th)
// Turned clockwise by this, the line from the claw to his weight hangs straight down.
let tilt = atan2((weight.x - hang.x) * tw, (weight.y - hang.y) * th)
print(String(format: "hangs from %.3f, %.3f; weight at %.3f, %.3f; tilt %.3f rad", hang.x, hang.y, weight.x, weight.y, tilt))
