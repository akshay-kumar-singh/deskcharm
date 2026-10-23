import AppKit

// Draws the app icon: the ✦ from the menu bar as a cut-gold charm, swinging on
// a gold chain from a hook at the top of a midnight-blue tile — the charm as
// it hangs off the top of the screen, mid-swing.
//
//   swiftc -O Tools/AppIcon.swift -o build/app-icon && build/app-icon Tools/AppIcon.iconset && iconutil -c icns Tools/AppIcon.iconset -o Tools/AppIcon.icns
//
// writes every size macOS asks for into the iconset; build.sh bundles the
// .icns made from it.

let args = CommandLine.arguments
guard args.count == 2 else { fatalError("usage: app-icon output.iconset") }
let folder = args[1]
try? FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)

// Everything below is laid out on Apple's 1024 grid, y down from the top.
let gold = (light: NSColor(red: 1.00, green: 0.90, blue: 0.60, alpha: 1),
            mid: NSColor(red: 0.85, green: 0.66, blue: 0.30, alpha: 1),     // the hook's gold in main.swift, a touch brighter
            deep: NSColor(red: 0.55, green: 0.38, blue: 0.12, alpha: 1))
let hook = CGPoint(x: 512, y: 196)
let swing = -0.24                 // radians off plumb, swinging out to the right
let reach: CGFloat = 470          // hook to the charm's centre
let outer: CGFloat = 196, inner: CGFloat = 54

func along(_ d: CGFloat) -> CGPoint {
    CGPoint(x: hook.x - d * CGFloat(sin(swing)), y: hook.y + d * CGFloat(cos(swing)))
}

func draw(_ g: CGContext) {
    // The tile: a squircle-ish rounded square, night sky fading down.
    let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
    let shape = CGPath(roundedRect: tile, cornerWidth: 186, cornerHeight: 186, transform: nil)
    g.saveGState()
    g.setShadow(offset: CGSize(width: 0, height: 10), blur: 28, color: NSColor.black.withAlphaComponent(0.35).cgColor)
    g.addPath(shape); g.setFillColor(NSColor.black.cgColor); g.fillPath()
    g.restoreGState()
    g.saveGState()
    g.addPath(shape); g.clip()
    let sky = CGGradient(colorsSpace: nil, colors: [NSColor(red: 0.19, green: 0.21, blue: 0.38, alpha: 1).cgColor,
                                                    NSColor(red: 0.07, green: 0.08, blue: 0.16, alpha: 1).cgColor] as CFArray,
                         locations: [0, 1])!
    g.drawLinearGradient(sky, start: CGPoint(x: 512, y: 100), end: CGPoint(x: 512, y: 924), options: [])

    let centre = along(reach)

    // A warm glow behind the charm, as if it catches the lamp.
    let glow = CGGradient(colorsSpace: nil, colors: [gold.mid.withAlphaComponent(0.42).cgColor,
                                                     gold.mid.withAlphaComponent(0).cgColor] as CFArray,
                          locations: [0, 1])!
    g.drawRadialGradient(glow, startCenter: centre, startRadius: 0, endCenter: centre, endRadius: 330, options: [])

    // Faint arcs on the side it swung from.
    g.setLineCap(.round)
    for (i, r) in [reach - 64, reach + 64].enumerated() {
        g.setStrokeColor(NSColor.white.withAlphaComponent(i == 0 ? 0.18 : 0.12).cgColor)
        g.setLineWidth(10)
        let from = CGFloat.pi / 2 + CGFloat(swing) + 0.36, to = from + 0.26
        g.addArc(center: hook, radius: r, startAngle: from, endAngle: to, clockwise: false)
        g.strokePath()
    }

    // A few small sparkles in the sky.
    for (p, s) in [(CGPoint(x: 250, y: 330), 26.0), (CGPoint(x: 780, y: 270), 18.0), (CGPoint(x: 300, y: 720), 16.0)] {
        g.setFillColor(NSColor.white.withAlphaComponent(0.55).cgColor)
        g.addPath(star(at: p, outer: CGFloat(s), inner: CGFloat(s) * 0.28, turn: 0))
        g.fillPath()
    }
    g.restoreGState()

    // The ceiling hook, then the chain down to the charm's top point.
    g.setStrokeColor(gold.mid.cgColor)
    g.setLineWidth(14)
    g.strokeEllipse(in: CGRect(x: hook.x - 26, y: hook.y - 26 - 22, width: 52, height: 52))

    let top = reach - outer
    let pitch: CGFloat = 44
    var d: CGFloat = 4, n = 0
    while d < top - 8 {
        let p = along(d + pitch / 2)
        g.saveGState()
        g.translateBy(x: p.x, y: p.y)
        g.rotate(by: CGFloat(swing))
        let link = n % 2 == 0 ? CGRect(x: -17, y: -30, width: 34, height: 60)   // face on
                              : CGRect(x: -5, y: -30, width: 10, height: 60)     // edge on
        g.setShadow(offset: CGSize(width: 0, height: 3), blur: 4, color: NSColor.black.withAlphaComponent(0.4).cgColor)
        g.setStrokeColor((n % 2 == 0 ? gold.mid : gold.light).cgColor)
        g.setLineWidth(10)
        g.addPath(CGPath(roundedRect: link, cornerWidth: link.width / 2, cornerHeight: link.width / 2, transform: nil))
        g.strokePath()
        g.restoreGState()
        d += pitch; n += 1
    }

    // The charm: a four-pointed star cut into facets, lit from the top left.
    g.saveGState()
    g.setShadow(offset: CGSize(width: 0, height: 22), blur: 36, color: NSColor.black.withAlphaComponent(0.55).cgColor)
    g.addPath(star(at: centre, outer: outer, inner: inner, turn: CGFloat(swing)))
    g.setFillColor(gold.mid.cgColor)
    g.fillPath()
    g.restoreGState()

    for k in 0..<4 {
        let a = CGFloat(swing) + CGFloat(k) * .pi / 2 - .pi / 2
        let tip = CGPoint(x: centre.x + outer * cos(a), y: centre.y + outer * sin(a))
        for side in [-1.0, 1.0] {
            let b = a + CGFloat(side) * .pi / 4
            let notch = CGPoint(x: centre.x + inner * cos(b), y: centre.y + inner * sin(b))
            // Facets turned toward the top left catch the light.
            let facing = cos(a + CGFloat(side) * .pi / 8 + 3 * .pi / 4)
            let lit = 0.5 + 0.5 * facing
            g.beginPath()
            g.move(to: centre); g.addLine(to: tip); g.addLine(to: notch); g.closePath()
            g.setFillColor(blend(gold.deep, gold.light, lit).cgColor)
            g.fillPath()
        }
    }
}

func star(at c: CGPoint, outer: CGFloat, inner: CGFloat, turn: CGFloat) -> CGPath {
    let p = CGMutablePath()
    for i in 0..<8 {
        let a = turn + CGFloat(i) * .pi / 4 - .pi / 2
        let r = i % 2 == 0 ? outer : inner
        let pt = CGPoint(x: c.x + r * cos(a), y: c.y + r * sin(a))
        i == 0 ? p.move(to: pt) : p.addLine(to: pt)
    }
    p.closeSubpath()
    return p
}

func blend(_ a: NSColor, _ b: NSColor, _ t: CGFloat) -> NSColor {
    let a = a.usingColorSpace(.deviceRGB)!, b = b.usingColorSpace(.deviceRGB)!
    return NSColor(red: a.redComponent + (b.redComponent - a.redComponent) * t,
                   green: a.greenComponent + (b.greenComponent - a.greenComponent) * t,
                   blue: a.blueComponent + (b.blueComponent - a.blueComponent) * t, alpha: 1)
}

for (points, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
    let px = points * scale
    let g = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    g.interpolationQuality = .high
    let k = CGFloat(px) / 1024
    g.translateBy(x: 0, y: CGFloat(px))
    g.scaleBy(x: k, y: -k)
    draw(g)
    let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
    let rep = NSBitmapImageRep(cgImage: g.makeImage()!)
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(folder)/\(name)"))
}
print("wrote \(folder)")
