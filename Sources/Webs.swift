import AppKit
import SwiftUI

// MARK: - Spider-Man's webs
//
// Two effects fired from his hands onto screen-sized, click-through overlays:
// the yank (double-click: pull the front window into his hand, WebYank.swift)
// and the blast (manhandle him: web over the whole screen, WebBlast.swift).

/// Where each Spider-Man charm's hands are, as fractions of its artwork.
enum WebHands {
    static let points: [String: [CGPoint]] = [
        "Spider-Man": [CGPoint(x: 0.50, y: 0.28)],              // clasped on the rope
        "Spider-Man-Swinging": [CGPoint(x: 0.30, y: 0.20),      // raised fist
                                CGPoint(x: 0.95, y: 0.66)]      // open hand
    ]

    static func supports(_ charm: String) -> Bool { points[charm] != nil }
}

/// A web strand: a pale core over a dark underlay, so it reads on light and
/// dark backgrounds alike, with two fibres twisting round it so it reads as
/// spun silk rather than a line.
enum Silk {
    static let color = Color(white: 0.97)

    static func strand(_ ctx: inout GraphicsContext, from a: CGPoint, to b: CGPoint,
                       bow: CGFloat, weight: CGFloat = 1) {
        let v = b - a
        let len = hypot(v.dx, v.dy)
        guard len > 1 else { return }
        let n = CGVector(dx: -v.dy / len, dy: v.dx / len)
        let ctl = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) + n * bow
        var core = Path()
        core.move(to: a)
        core.addQuadCurve(to: b, control: ctl)
        ctx.stroke(core, with: .color(.black.opacity(0.22)),
                   style: StrokeStyle(lineWidth: 3.6 * weight, lineCap: .round))
        ctx.stroke(core, with: .color(color), style: StrokeStyle(lineWidth: 1.6 * weight, lineCap: .round))

        let steps = max(8, Int(len / 8))
        for phase in [0.0, Double.pi] {
            var fibre = Path()
            for i in 0...steps {
                let s = CGFloat(i) / CGFloat(steps)
                let pinch = min(1, s * 8, (1 - s) * 8)
                let twist = CGFloat(sin(Double(s * len) / 7 + phase)) * 1.6 * weight * pinch
                let q = quad(a, ctl, b, s) + n * twist
                if i == 0 { fibre.move(to: q) } else { fibre.addLine(to: q) }
            }
            ctx.stroke(fibre, with: .color(.white.opacity(0.75)), lineWidth: 0.7 * weight)
        }
    }

    /// The blob of web at the leading end of a strand in flight.
    static func head(_ ctx: inout GraphicsContext, at p: CGPoint, radius r: CGFloat = 3.4) {
        let blob = Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
        ctx.stroke(blob, with: .color(.black.opacity(0.22)), lineWidth: 2)
        ctx.fill(blob, with: .color(color))
    }
}

/// Aims both effects from his hands and owns the overlays they are drawn in.
final class WebController {
    private let charm: NSWindow
    private let sim: RopeSim
    private let settings: CharmSettings

    private let yankHost = NSHostingView(rootView: WebShotView(shot: nil))
    private let yankOverlay: NSWindow
    private var shot: WebShot?

    private let blastHost = NSHostingView(rootView: WebBlastView(blast: nil))
    private let blastOverlay: NSWindow
    private var spread: WebBlast?

    init(charm: NSWindow, sim: RopeSim, settings: CharmSettings) {
        self.charm = charm
        self.sim = sim
        self.settings = settings
        yankOverlay = Self.overlay(yankHost)
        blastOverlay = Self.overlay(blastHost)

        // A process's first window-list query takes ~60ms and later ones well
        // under 1ms. Pay it now, off the main thread, not as a stall at the
        // moment the first web leaves his hand.
        DispatchQueue.global(qos: .utility).async {
            _ = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID)
        }
    }

    /// Made once per effect and reused, rather than allocating a screen-sized
    /// window every time. Click-through and never key, so whatever is beneath
    /// carries on as if it weren't there.
    private static func overlay(_ content: NSView) -> NSWindow {
        let w = NSWindow(contentRect: .zero, styleMask: [.borderless], backing: .buffered, defer: false)
        w.isReleasedWhenClosed = false
        w.isOpaque = false
        w.backgroundColor = .clear
        w.hasShadow = false
        w.level = .floating
        w.ignoresMouseEvents = true
        w.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        w.contentView = content
        return w
    }

    // MARK: Yank

    func yank() {
        guard shot == nil,
              let hands = WebHands.points[settings.charm],
              let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        let target = WebTarget.find(in: area)
        let hand = nearestHand(hands, to: aimPoint(target, from: toOverlay(sim.tip, area), area), area)
        let k = kick
        let shot = WebShot(target: target, aim: aimPoint(target, from: hand(), area), hand: hand,
                           push: { [weak self] v in self?.sim.impulse(v * k) },
                           sound: { SoundFX.shared.play($0) },
                           finish: { [weak self] in DispatchQueue.main.async { self?.endYank() } })
        self.shot = shot
        if let target {
            // Made off the main thread while the web is in the air. The card
            // is only drawn when there is no snapshot to be had.
            let icon = target.app.icon, label = target.app.localizedName ?? ""
            let scale = screen.backingScaleFactor, appearance = NSApp.effectiveAppearance
            Task { @MainActor [weak shot] in
                let snapshot = await WindowSnapshot.capture(target.windowID)
                var image = snapshot
                if image == nil {
                    image = await StandInCard.render(size: target.frame.size, scale: scale, icon: icon,
                                                     name: label, appearance: appearance)
                }
                shot?.standInArrived(image, isSnapshot: snapshot != nil)
            }
        }
        yankHost.rootView = WebShotView(shot: shot)
        show(yankOverlay, on: area)
    }

    private func endYank() {
        yankOverlay.orderOut(nil)
        yankHost.rootView = WebShotView(shot: nil)
        shot = nil
    }

    /// The title bar, at the point nearest the hand but kept to its middle
    /// half so the window hangs from somewhere near its centre. With nothing
    /// to aim at, a shot toward the middle of the screen that comes back empty.
    private func aimPoint(_ target: WebTarget?, from h: CGPoint, _ area: CGRect) -> CGPoint {
        let p: CGPoint
        if let f = target?.frame {
            p = CGPoint(x: min(max(h.x, f.minX + f.width * 0.25), f.maxX - f.width * 0.25),
                        y: f.minY + min(18, f.height * 0.1))
        } else {
            p = h + unit(CGPoint(x: area.width / 2, y: area.height * 0.6) - h) * 280
        }
        return CGPoint(x: min(max(p.x, 8), area.width - 8), y: min(max(p.y, 8), area.height - 8))
    }

    // MARK: Blast

    func blast() {
        guard spread == nil,
              let hands = WebHands.points[settings.charm],
              let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        // Lands a little off-centre toward him, like something thrown at the glass.
        let tip = toOverlay(sim.tip, area)
        let centre = CGPoint(x: area.width * 0.5 + (tip.x - area.width * 0.5) * 0.25, y: area.height * 0.45)
        let k = kick
        let blast = WebBlast(size: area.size, centre: centre, hand: nearestHand(hands, to: centre, area),
                             push: { [weak self] v in self?.sim.impulse(v * k) },
                             sound: { SoundFX.shared.play($0) },
                             finish: { [weak self] in DispatchQueue.main.async { self?.endBlast() } })
        spread = blast
        blastHost.rootView = WebBlastView(blast: blast)
        show(blastOverlay, on: area)
    }

    private func endBlast() {
        blastOverlay.orderOut(nil)
        blastHost.rootView = WebBlastView(blast: nil)
        spread = nil
    }

    // MARK: Hands

    /// A velocity kick swings a long chain further than a short one, so it is
    /// scaled to give much the same swing at every chain length.
    private var kick: CGFloat { sqrt(240 / max(settings.ropeLength, 1)) }

    /// Live position of whichever hand starts out nearer `point`. The choice
    /// is fixed so the web doesn't jump hands mid-flight.
    private func nearestHand(_ hands: [CGPoint], to point: CGPoint, _ area: CGRect) -> () -> CGPoint {
        let name = settings.charm
        let index = hands.indices.min {
            handPoint(hands[$0], name, area).dist(point) < handPoint(hands[$1], name, area).dist(point)
        } ?? 0
        return { [unowned self] in self.handPoint(hands[index], name, area) }
    }

    /// Mirrors the charm's own draw transform in CharmView.render.
    private func handPoint(_ u: CGPoint, _ charm: String, _ area: CGRect) -> CGPoint {
        let h = settings.charmHeight
        let w = h * CharmStore.shared.aspect(charm)
        let off = CGPoint(x: (u.x - 0.5) * w, y: u.y * h - 1)
            .applying(CGAffineTransform(rotationAngle: sim.charmRotation))
        return toOverlay(CGPoint(x: sim.tip.x + off.x, y: sim.tip.y + off.y), area)
    }

    /// Charm-window coordinates to overlay coordinates. Both are y-down.
    private func toOverlay(_ p: CGPoint, _ area: CGRect) -> CGPoint {
        let f = charm.frame
        return CGPoint(x: f.minX - area.minX + p.x, y: area.maxY - f.maxY + p.y)
    }

    /// Beneath the charm: the webs leave from behind his fist rather than
    /// across it, and a window being pulled sat beneath him too.
    private func show(_ overlay: NSWindow, on area: CGRect) {
        overlay.setFrame(area, display: false)
        overlay.order(.below, relativeTo: charm.windowNumber)
    }
}

// MARK: - Motion helpers

func unit(_ v: CGVector) -> CGVector {
    let l = hypot(v.dx, v.dy)
    return l > 0.0001 ? CGVector(dx: v.dx / l, dy: v.dy / l) : CGVector(dx: 0, dy: 1)
}

func lerp(_ a: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
    CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
}

func quad(_ a: CGPoint, _ c: CGPoint, _ b: CGPoint, _ s: CGFloat) -> CGPoint {
    let r = 1 - s
    return CGPoint(x: r * r * a.x + 2 * r * s * c.x + s * s * b.x,
                   y: r * r * a.y + 2 * r * s * c.y + s * s * b.y)
}

func easeOutCubic(_ x: Double) -> Double {
    let r = 1 - min(max(x, 0), 1)
    return 1 - r * r * r
}

/// Overshoots slightly before settling, which reads as impact.
func easeOutBack(_ x: Double) -> Double {
    let x = min(max(x, 0), 1), c1 = 1.70158, c3 = c1 + 1
    return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2)
}
