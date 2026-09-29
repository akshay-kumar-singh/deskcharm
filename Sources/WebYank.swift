import AppKit
import SwiftUI
import ScreenCaptureKit

// MARK: - Web yank
//
// Double-clicking a Spider-Man charm fires a web at the front window, yanks it
// across the screen into his hand and hides its app.
//
// Another process's window can't be animated from outside it, so the flight
// uses a stand-in: a ScreenCaptureKit snapshot when Screen Recording has been
// granted, otherwise a card carrying the app's icon. The app is hidden beneath
// the stand-in once it covers the window, so only one copy is ever on screen.
//
// The app is hidden rather than its window minimised. Minimising another app's
// window needs Accessibility, and the system then plays its own genie into the
// Dock on top of this animation.

// MARK: Target

/// The window the web goes for, in overlay coordinates.
struct WebTarget {
    let app: NSRunningApplication
    let windowID: CGWindowID
    let frame: CGRect

    /// The front window of the active app, or failing that the front window of
    /// any app. The Finder desktop has no window of its own, and while it is
    /// active the window on top is the one the user is looking at.
    static func find(in area: CGRect) -> WebTarget? {
        guard let primary = NSScreen.screens.first?.frame else { return nil }
        let me = ProcessInfo.processInfo.processIdentifier
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
        // Window bounds are y-down from the top of the primary display.
        let top = primary.maxY - area.maxY
        let visible = CGRect(origin: .zero, size: area.size)
        let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                              kCGNullWindowID) as? [[String: Any]] ?? []
        var found: [WebTarget] = []
        for w in info {
            guard (w[kCGWindowLayer as String] as? Int) == 0,
                  let pid = w[kCGWindowOwnerPID as String] as? pid_t, pid != me,
                  (w[kCGWindowAlpha as String] as? Double ?? 0) > 0.05,
                  let id = w[kCGWindowNumber as String] as? CGWindowID,
                  let dict = w[kCGWindowBounds as String] as? NSDictionary,
                  let bounds = CGRect(dictionaryRepresentation: dict as CFDictionary),
                  bounds.width >= 80, bounds.height >= 60,
                  let app = NSRunningApplication(processIdentifier: pid)
            else { continue }
            let frame = bounds.offsetBy(dx: -area.minX, dy: -top)
            guard frame.intersects(visible) else { continue }
            found.append(WebTarget(app: app, windowID: id, frame: frame))
        }
        return found.first { $0.app.processIdentifier == front } ?? found.first
    }

    var isOnScreen: Bool {
        let info = CGWindowListCopyWindowInfo(.optionIncludingWindow, windowID) as? [[String: Any]]
        return info?.first?[kCGWindowIsOnscreen as String] as? Bool ?? false
    }
}

// MARK: Snapshot

enum WindowSnapshot {
    static var allowed: Bool { CGPreflightScreenCaptureAccess() }

    /// The window's own pixels, without its shadow. Nil without Screen
    /// Recording permission, or if the window has gone.
    static func capture(_ id: CGWindowID) async -> CGImage? {
        guard allowed else { return nil }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            guard let window = content.windows.first(where: { $0.windowID == id }) else { return nil }
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let config = SCStreamConfiguration()
            let scale = CGFloat(filter.pointPixelScale)
            config.width = Int(filter.contentRect.width * scale)
            config.height = Int(filter.contentRect.height * scale)
            config.showsCursor = false
            config.ignoreShadowsSingleWindow = true
            config.captureResolution = .best
            return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        } catch {
            return nil
        }
    }
}

// MARK: Card

/// Stands in for a window there is no snapshot of: a blank window wearing its
/// app's icon and name. Drawn once, off the main thread, so the flight only
/// ever moves a finished image — drawn live, the icon and text re-rasterised
/// at every new scale and the first shot stalled for tens of milliseconds.
enum StandInCard {
    static func render(size: CGSize, scale: CGFloat, icon: NSImage?, name: String,
                       appearance: NSAppearance) async -> CGImage? {
        let w = Int(size.width * scale), h = Int(size.height * scale)
        guard w > 0, h > 0,
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                                      | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return nil }
        // Points, y-down, matching the window it stands in for.
        ctx.translateBy(x: 0, y: CGFloat(h))
        ctx.scaleBy(x: scale, y: -scale)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: true)
        appearance.performAsCurrentDrawingAppearance {
            let r = CGRect(origin: .zero, size: size)
            let shape = NSBezierPath(roundedRect: r.insetBy(dx: 0.5, dy: 0.5), xRadius: 12, yRadius: 12)
            NSColor.windowBackgroundColor.setFill()
            shape.fill()
            let lights = [NSColor(srgbRed: 1.0, green: 0.37, blue: 0.34, alpha: 1),
                          NSColor(srgbRed: 1.0, green: 0.74, blue: 0.18, alpha: 1),
                          NSColor(srgbRed: 0.16, green: 0.79, blue: 0.25, alpha: 1)]
            for (i, color) in lights.enumerated() {
                color.setFill()
                NSBezierPath(ovalIn: CGRect(x: 14 + CGFloat(i) * 20, y: 12, width: 12, height: 12)).fill()
            }
            let side = min(128, size.width * 0.35, size.height * 0.35)
            icon?.draw(in: CGRect(x: r.midX - side / 2, y: r.midY - side / 2 - 12, width: side, height: side),
                       from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
            let label = NSAttributedString(string: name, attributes: [
                .font: NSFont.systemFont(ofSize: 15, weight: .semibold),
                .foregroundColor: NSColor.secondaryLabelColor
            ])
            let labelSize = label.size()
            label.draw(at: CGPoint(x: r.midX - labelSize.width / 2, y: r.midY + side / 2 - 4))
            NSColor.labelColor.withAlphaComponent(0.12).setStroke()
            shape.lineWidth = 1
            shape.stroke()
        }
        NSGraphicsContext.restoreGraphicsState()
        return ctx.makeImage()
    }
}

// MARK: Shot

/// One web shot, from firing to the catch, driven by the overlay's frame clock.
/// Stages run in order: shoot, land, cover (stand-in goes up over the window),
/// pull (app hidden, window yanked), catch. A miss, or an app that refuses to
/// hide, drops out after landing and reels the web back in.
final class WebShot {
    private struct Pose {
        var at: CGPoint
        var scale: CGFloat
        var tilt: CGFloat
        var alpha: CGFloat
    }

    private let target: WebTarget?
    private let aim: CGPoint
    private let hand: () -> CGPoint
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    // Impulses on the charm, in points per second before chain-length scaling.
    private let recoil: CGFloat = 120
    private let yank: CGFloat = 300
    private let catchKick: CGFloat = 220

    private var shootTime = 0.2
    private var flyTime = 0.4
    private let tugTime = 0.14
    private let tugPull: CGFloat = 16
    private let retractTime = 0.22
    private let puffTime = 0.35
    /// How long to hold the web on the window waiting for its stand-in.
    private let standInPatience = 0.45
    /// How long to wait for the app to hide before giving up on the pull.
    private let hidePatience = 0.5

    private var standIn: Image?
    private var standInSettled = false
    private var coverLead = 0.06

    private var start: Date?
    private var landed: Double?
    private var covered: Double?
    private var hideSent: Double?
    private var pulled: Double?
    private var caught: Double?
    private var dropped: Double?
    private var ended = false

    init(target: WebTarget?, aim: CGPoint, hand: @escaping () -> CGPoint,
         push: @escaping (CGVector) -> Void, sound: @escaping (SoundFX.Effect) -> Void,
         finish: @escaping () -> Void) {
        self.target = target
        self.aim = aim
        self.hand = hand
        self.push = push
        self.sound = sound
        self.finish = finish
    }

    /// A snapshot is a pixel-exact double and can swap in almost at once; a
    /// card is plainly not the window, so it fades in over it instead.
    func standInArrived(_ image: CGImage?, isSnapshot: Bool) {
        standIn = image.map { Image(decorative: $0, scale: 1) }
        coverLead = isSnapshot ? 0.06 : 0.14
        standInSettled = true
    }

    func render(_ ctx: inout GraphicsContext, at date: Date) {
        if start == nil { start = date; begin() }
        let t = date.timeIntervalSince(start ?? date)
        advance(t)
        draw(&ctx, t)
    }

    private func begin() {
        let h = hand()
        let d = Double(h.dist(aim))
        shootTime = min(max(d / 2600, 0.14), 0.3)
        flyTime = min(max(0.3 + d / 5000, 0.34), 0.5)
        push(unit(h - aim) * recoil)
        sound(.thwip)
    }

    private func advance(_ t: Double) {
        if landed == nil, t >= shootTime {
            landed = shootTime
            if target == nil { dropped = shootTime }
            sound(target == nil ? .reel : .splat)
        }
        if let l = landed, target != nil, covered == nil, dropped == nil,
           standInSettled || t >= l + standInPatience {
            // Without a double to fly, hiding the app would just blink it out.
            if standIn != nil { covered = t } else { dropped = t }
        }
        // Hide only once the stand-in has been on screen for a few frames, so
        // the window never blinks out before its double has replaced it.
        if let c = covered, let target, hideSent == nil, t >= c + coverLead {
            // hide()'s result can't be trusted — on macOS 26 it reports false
            // for apps it hides perfectly well — so watch the window instead.
            _ = target.app.hide()
            hideSent = t
        }
        // Pull only once the real window has gone, or the stand-in would fly
        // off and leave the original sitting there.
        if let h = hideSent, let target, pulled == nil, dropped == nil {
            if !target.isOnScreen {
                pulled = t
                push(unit(hand() - aim) * yank)
                sound(.whoosh)
            } else if t >= h + hidePatience {
                standIn = nil
                dropped = t
                sound(.reel)
            }
        }
        if let p = pulled, caught == nil, t >= p + tugTime + flyTime {
            caught = p + tugTime + flyTime
            push(unit(hand() - aim) * catchKick)
            sound(.pop)
        }
        let done = caught.map { t >= $0 + puffTime } ?? dropped.map { t >= $0 + retractTime } ?? false
        if done && !ended {
            ended = true
            finish()
        }
    }

    /// Where the window hangs off the web: pinned while the app is hidden, a
    /// short tug toward the hand, then an accelerating flight that shrinks it
    /// into his fist.
    private func pose(_ t: Double, _ h: CGPoint) -> Pose {
        guard let p = pulled else { return Pose(at: aim, scale: 1, tilt: 0, alpha: 1) }
        let dir = unit(h - aim)
        let u = t - p
        if u < tugTime {
            let k = CGFloat(easeOutBack(max(0, u) / tugTime))
            return Pose(at: aim + dir * (tugPull * k), scale: 1, tilt: 0, alpha: 1)
        }
        let f = CGFloat(min(1, (u - tugTime) / flyTime))
        return Pose(at: lerp(aim + dir * tugPull, h, f * f),
                    scale: 1 - 0.96 * pow(f, 0.8),
                    tilt: dir.dx * 0.2 * sin(.pi * f),
                    alpha: f < 0.8 ? 1 : (1 - f) / 0.2)
    }

    // MARK: Drawing

    private func draw(_ ctx: inout GraphicsContext, _ t: Double) {
        let h = hand()

        if let l = landed, let target, dropped == nil, caught == nil {
            let rect = target.frame.offsetBy(dx: -aim.x, dy: -aim.y)
            let now = pose(t, h)
            // Two fading afterimages once it is moving fast enough to smear.
            if standIn != nil, let p = pulled, t - p > tugTime + flyTime * 0.25 {
                for (lag, alpha) in [(0.16, 0.1), (0.08, 0.22)] {
                    var c = ctx
                    apply(pose(t - lag * flyTime, h), to: &c)
                    c.opacity *= alpha
                    drawStandIn(&c, rect, fade: 1)
                }
            }
            var c = ctx
            apply(now, to: &c)
            if let cover = covered {
                drawStandIn(&c, rect, fade: CGFloat(min(1, (t - cover) / coverLead)))
            }
            drawSplat(&c, grow: CGFloat(easeOutBack(min(1, (t - l) / 0.18))))
        }

        if caught == nil {
            var end: CGPoint
            var bow: CGFloat = 0
            let len = h.dist(aim)
            if let d = dropped {
                let u = min(1, (t - d) / retractTime)
                end = lerp(aim, h, CGFloat(u * u * u))
                bow = len * 0.06 * CGFloat(sin(.pi * u))
            } else if landed == nil {
                let u = t / shootTime
                end = lerp(h, aim, CGFloat(easeOutCubic(u)))
                bow = len * 0.1 * CGFloat(sin(.pi * u))
            } else {
                end = pose(t, h).at
                // The strand twangs when it hits, and again when he yanks.
                let since = t - (pulled ?? landed ?? t)
                bow = 5 * CGFloat(sin(since * 70) * exp(-since * 14))
            }
            Silk.strand(&ctx, from: h, to: end, bow: bow)
            if landed == nil || dropped != nil { Silk.head(&ctx, at: end) }
        }

        if let c = caught, t - c < puffTime {
            drawPuff(&ctx, at: h, (t - c) / puffTime)
        }
    }

    private func apply(_ p: Pose, to c: inout GraphicsContext) {
        c.translateBy(x: p.at.x, y: p.at.y)
        c.rotate(by: .radians(Double(p.tilt)))
        c.scaleBy(x: p.scale, y: p.scale)
        c.opacity *= Double(p.alpha)
    }

    private func drawStandIn(_ c: inout GraphicsContext, _ r: CGRect, fade: CGFloat) {
        guard let standIn else { return }
        var c = c
        c.opacity *= Double(fade)
        drawShadow(&c, r)
        c.draw(standIn, in: r)
    }

    /// Concentric outlines rather than a blur filter: blurring the shadow of a
    /// full-size window means recomputing millions of pixels every frame.
    private func drawShadow(_ c: inout GraphicsContext, _ r: CGRect) {
        for i in 0..<10 {
            let d = 1.25 + CGFloat(i) * 2.5
            let ring = r.insetBy(dx: -d, dy: -d).offsetBy(dx: 0, dy: 6)
            let fall = 1 - CGFloat(i) / 10
            c.stroke(Path(roundedRect: ring, cornerRadius: 12 + d, style: .continuous),
                     with: .color(.black.opacity(0.14 * fall * fall)), lineWidth: 2.6)
        }
    }

    /// A small orb web where the strand sticks, drawn in the window's own
    /// coordinates so it travels and shrinks with it.
    private func drawSplat(_ c: inout GraphicsContext, grow: CGFloat) {
        guard grow > 0.01 else { return }
        let spokes = 7
        var web = Path()
        var tips: [CGPoint] = []
        for i in 0..<spokes {
            let a = Double(i) / Double(spokes) * 2 * .pi + 0.35
            let len = 30 * grow * (0.85 + 0.2 * CGFloat(sin(Double(i) * 2.4)))
            let tip = CGPoint(x: CGFloat(cos(a)) * len, y: CGFloat(sin(a)) * len)
            web.move(to: .zero)
            web.addLine(to: tip)
            tips.append(tip)
        }
        for ring: CGFloat in [0.42, 0.78] {
            for i in 0..<spokes {
                let p = CGPoint(x: tips[i].x * ring, y: tips[i].y * ring)
                let q = CGPoint(x: tips[(i + 1) % spokes].x * ring, y: tips[(i + 1) % spokes].y * ring)
                // Threads sag toward the hub, as they do between real spokes.
                web.move(to: p)
                web.addQuadCurve(to: q, control: CGPoint(x: (p.x + q.x) * 0.42, y: (p.y + q.y) * 0.42))
            }
        }
        c.stroke(web, with: .color(.black.opacity(0.25)), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
        c.stroke(web, with: .color(Silk.color), style: StrokeStyle(lineWidth: 1.1, lineCap: .round))
        let r = 4.5 * grow
        c.fill(Path(ellipseIn: CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r)), with: .color(Silk.color))
    }

    private func drawPuff(_ ctx: inout GraphicsContext, at p: CGPoint, _ u: Double) {
        let e = CGFloat(easeOutCubic(u))
        let fade = CGFloat(1 - u)
        let r = 6 + 26 * e
        ctx.stroke(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                   with: .color(Silk.color.opacity(0.8 * Double(fade))), lineWidth: 2 * fade + 0.4)
        var rays = Path()
        for i in 0..<8 {
            let a = Double(i) / 8 * 2 * .pi + 0.2
            let d = CGVector(dx: cos(a), dy: sin(a))
            rays.move(to: p + d * (10 + 18 * e))
            rays.addLine(to: p + d * (16 + 30 * e))
        }
        ctx.stroke(rays, with: .color(Silk.color.opacity(0.9 * Double(fade))),
                   style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
    }
}

// MARK: Overlay

struct WebShotView: View {
    let shot: WebShot?

    var body: some View {
        if let shot {
            TimelineView(.animation) { timeline in
                Canvas { ctx, _ in shot.render(&ctx, at: timeline.date) }
            }
            // Rendered on the GPU: the canvas covers the whole screen and would
            // otherwise be re-rasterised on the CPU every frame.
            .drawingGroup()
        }
    }
}
