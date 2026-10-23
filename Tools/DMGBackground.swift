import AppKit

// Draws the picture behind the installer window: the app on the left, the
// Applications folder on the right, a gold arrow between them saying to drag
// one onto the other, and a note on getting past Gatekeeper the first time.
//
//   swiftc -O Tools/DMGBackground.swift -o build/dmg-background && build/dmg-background Tools/DMG
//
// writes Tools/DMG/background.png and background@2x.png. package.sh lays the
// icons out to match: the window is 600 × 400 and the icons sit at
// (150, 200) and (450, 200), points from the top left.

let args = CommandLine.arguments
guard args.count == 2 else { fatalError("usage: dmg-background output-folder") }
let folder = args[1]

let size = CGSize(width: 600, height: 400)
let gold = NSColor(red: 0.78, green: 0.60, blue: 0.26, alpha: 1)

/// Text centred on a line, `y` points from the top.
func text(_ s: String, y: CGFloat, size: CGFloat, weight: NSFont.Weight, colour: NSColor) {
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: colour, .paragraphStyle: style,
    ]
    let str = NSAttributedString(string: s, attributes: attrs)
    let h = str.size().height
    str.draw(in: CGRect(x: 20, y: 400 - y - h / 2, width: 560, height: h))
}

func draw() {
    // A pale warm wash, lighter at the top.
    NSGradient(starting: NSColor(white: 0.99, alpha: 1), ending: NSColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1))!
        .draw(in: CGRect(origin: .zero, size: size), angle: -90)

    text("Drag DeskCharm into Applications", y: 58, size: 22, weight: .semibold, colour: NSColor(white: 0.15, alpha: 1))

    // The arrow, between where the two icons sit.
    let y = 400 - 200.0
    let shaft = NSBezierPath()
    shaft.move(to: CGPoint(x: 232, y: y))
    shaft.line(to: CGPoint(x: 356, y: y))
    shaft.lineWidth = 6
    shaft.lineCapStyle = .round
    gold.setStroke()
    shaft.stroke()
    let head = NSBezierPath()
    head.move(to: CGPoint(x: 372, y: y))
    head.line(to: CGPoint(x: 350, y: y + 15))
    head.line(to: CGPoint(x: 350, y: y - 15))
    head.close()
    gold.setFill()
    head.fill()

    let note = NSColor(white: 0.38, alpha: 1)
    text("Then open DeskCharm from Applications. It lives in the menu bar as ✦", y: 318, size: 13, weight: .regular, colour: note)
    text("If macOS won't open it: System Settings → Privacy & Security → Open Anyway", y: 342, size: 12, weight: .regular, colour: note)
}

for scale in [1, 2] {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width) * scale, pixelsHigh: Int(size.height) * scale,
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = size
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw()
    NSGraphicsContext.restoreGraphicsState()
    let name = scale == 1 ? "background.png" : "background@2x.png"
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(folder)/\(name)"))
}
print("wrote \(folder)/background.png and background@2x.png")
