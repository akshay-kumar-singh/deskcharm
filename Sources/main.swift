import AppKit
import SwiftUI

// MARK: - Frame tracer
//
// Enabled only when DESKCHARM_TRACE names an output path. Records the wall
// clock and charm position of every rendered frame so frame pacing and the
// swing trajectory can be measured from the real app rather than guessed at.

final class Tracer {
    static let shared = Tracer()
    let path = ProcessInfo.processInfo.environment["DESKCHARM_TRACE"]
    var active: Bool { path != nil }
    private var samples: [(Double, Double, Double)] = []
    private let start = Date()

    func record(_ tip: CGPoint) {
        guard active else { return }
        samples.append((Date().timeIntervalSince(start), Double(tip.x), Double(tip.y)))
    }

    func dump() {
        guard let path else { return }
        let body = samples.map { String(format: "%.6f,%.4f,%.4f", $0.0, $0.1, $0.2) }
                          .joined(separator: "\n")
        try? ("t,x,y\n" + body).write(toFile: path, atomically: true, encoding: .utf8)
    }
}

// MARK: - Charm assets

final class CharmStore {
    static let shared = CharmStore()

    private(set) var names: [String] = []
    private var images: [String: Image] = [:]
    private var aspects: [String: CGFloat] = [:]

    private init() {
        guard let dir = Bundle.main.resourceURL?.appendingPathComponent("Charms"),
              let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
        else { return }
        for f in files where f.pathExtension.lowercased() == "png" {
            guard let ns = NSImage(contentsOf: f) else { continue }
            let key = f.deletingPathExtension().lastPathComponent
            images[key] = Image(nsImage: ns).interpolation(.high).antialiased(true)
            aspects[key] = ns.size.height > 0 ? ns.size.width / ns.size.height : 0.6
            names.append(key)
        }
        names.sort()
    }

    func image(_ n: String) -> Image? { images[n] }
    func aspect(_ n: String) -> CGFloat { aspects[n] ?? 0.6 }
}

/// Pictures the charms' effects are drawn with, from the bundle's Effects
/// folder: PNGs, or JPEGs for photos such as textures. Decoded as they load,
/// not on first draw, which stalled an effect's first frame by a good 30ms.
enum EffectArt {
    static func load(_ name: String) -> CGImage? {
        guard let folder = Bundle.main.resourceURL?.appendingPathComponent("Effects") else { return nil }
        for kind in ["png", "jpg"] {
            if let source = CGImageSourceCreateWithURL(folder.appendingPathComponent("\(name).\(kind)") as CFURL, nil),
               let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) {
                return image
            }
        }
        return nil
    }
}

/// Where each charm's chain is fixed, as a fraction of its artwork, and how
/// far the artwork is turned from upright to hang from there. Most hang
/// upright from the middle of their top edge.
struct CharmHang {
    let attach: CGPoint
    let tilt: CGFloat                       // radians, clockwise on screen

    private static let custom: [String: CharmHang] = [
        // From the loose end of his web, turned so his weight sits straight
        // under it: the web then leads down from the chain into his fist.
        "Spider-Man-Swinging": CharmHang(attach: CGPoint(x: 0.012, y: 0.003), tilt: 0.46)
    ]

    static func of(_ charm: String) -> CharmHang {
        custom[charm] ?? CharmHang(attach: CGPoint(x: 0.5, y: 0), tilt: 0)
    }

    /// The artwork's frame around the chain's tip, before it is turned. It
    /// sits a point higher than the attach point so the chain runs into it.
    func rect(width w: CGFloat, height h: CGFloat) -> CGRect {
        CGRect(x: -attach.x * w, y: -attach.y * h - 1, width: w, height: h)
    }

    /// Carries that frame onto the view: pinned at the tip, turned with the
    /// chain. Drawing, hit-testing and aiming the webs all go through this.
    func placement(tip: CGPoint, turn: CGFloat) -> CGAffineTransform {
        CGAffineTransform(translationX: tip.x, y: tip.y).rotated(by: turn + tilt)
    }
}

// MARK: - Settings

final class CharmSettings: ObservableObject {
    @Published var charm: String { didSet { d.set(charm, forKey: "charm") } }
    @Published var charmHeight: CGFloat { didSet { d.set(charmHeight, forKey: "charmHeight") } }
    @Published var ropeLength: CGFloat { didSet { d.set(ropeLength, forKey: "ropeLength") } }
    @Published var sounds: Bool { didSet { d.set(sounds, forKey: "sounds") } }

    private let d = UserDefaults.standard

    init() {
        let fallback = CharmStore.shared.names.first(where: { $0.contains("Iron") })
            ?? CharmStore.shared.names.first ?? ""
        charm = d.string(forKey: "charm").flatMap { CharmStore.shared.names.contains($0) ? $0 : nil } ?? fallback
        let h = d.double(forKey: "charmHeight")
        charmHeight = h > 0 ? CGFloat(h) : 200
        let r = d.double(forKey: "ropeLength")
        ropeLength = r > 0 ? CGFloat(r) : 240
        sounds = d.object(forKey: "sounds") as? Bool ?? true
    }

    /// A velocity kick swings a long chain further than a short one, so kicks
    /// are scaled by this to give much the same swing at every chain length.
    var kickScale: CGFloat { sqrt(240 / max(ropeLength, 1)) }

    /// Where a point of a charm's artwork, given as a fraction of it, is drawn
    /// right now in the charm window. Mirrors the draw in CharmView.render.
    func artPoint(_ u: CGPoint, of charm: String, sim: RopeSim) -> CGPoint {
        let hang = CharmHang.of(charm)
        let art = hang.rect(width: charmHeight * CharmStore.shared.aspect(charm), height: charmHeight)
        return CGPoint(x: art.minX + u.x * art.width, y: art.minY + u.y * art.height)
            .applying(hang.placement(tip: sim.tip, turn: sim.charmRotation))
    }

    /// Whether the charm does anything when double-clicked or thrown about.
    var hasGadgets: Bool { WebHands.supports(charm) || BatGear.supports(charm) || HulkGear.supports(charm) }
}

// MARK: - View

/// Tells a double-click from a drag. The drag gesture sees every press, so
/// clicks are recognised on release: a press that barely moved is a click, and
/// two close together in time and place are a double-click.
final class ClickTracker {
    private var last: (time: Date, at: CGPoint)?

    func release(_ v: DragGesture.Value) -> Bool {
        guard hypot(v.translation.width, v.translation.height) < 5 else { last = nil; return false }
        if let l = last, v.time.timeIntervalSince(l.time) < NSEvent.doubleClickInterval, l.at.dist(v.location) < 10 {
            last = nil
            return true
        }
        last = (v.time, v.location)
        return false
    }
}

/// Recent charm poses, replayed faintly behind Spider-Man as afterimages when
/// he moves fast enough to smear, and not at all while he just sways.
final class Trail {
    private var poses: [(time: TimeInterval, tip: CGPoint, angle: CGFloat)] = []
    private let lags: [Double] = [0.16, 0.12, 0.08, 0.04]           // oldest first, drawn underneath
    private let strength: [Double] = [0.08, 0.15, 0.25, 0.38]

    func record(_ tip: CGPoint, _ angle: CGFloat, at date: Date) {
        let now = date.timeIntervalSinceReferenceDate
        poses.append((now, tip, angle))
        poses.removeAll { now - $0.time > 0.25 }
    }

    /// Faded by age, and all together by how fast he is moving now: nothing
    /// below a brisk swing, full strength by a hard throw.
    func ghosts() -> [(tip: CGPoint, angle: CGFloat, opacity: Double)] {
        guard let now = poses.last, let before = pose(at: now.time - 0.05) else { return [] }
        let speed = Double(now.tip.dist(before.tip)) / 0.05
        let s = min(max((speed - 220) / 600, 0), 1)
        guard s > 0 else { return [] }
        return zip(lags, strength).compactMap { lag, a in
            pose(at: now.time - lag).map { ($0.tip, $0.angle, a * s) }
        }
    }

    private func pose(at time: TimeInterval) -> (time: TimeInterval, tip: CGPoint, angle: CGFloat)? {
        poses.last { $0.time <= time }
    }
}

struct CharmView: View {
    @ObservedObject var settings: CharmSettings
    let sim: RopeSim
    var onDoubleClick: () -> Void = {}
    var onManhandled: () -> Void = {}

    private let segments = 22
    private let clicks = ClickTracker()
    private let shake = ShakeMeter()
    private let trail = Trail()

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                configure(size: size)
                sim.advance(to: timeline.date)
                Tracer.shared.record(sim.tip)
                trail.record(sim.tip, sim.charmRotation, at: timeline.date)
                render(&ctx)
            }
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged {
                    sim.grab($0.location)
                    if shake.drag(to: $0.location, at: $0.time) { onManhandled() }
                }
                .onEnded {
                    sim.release()
                    shake.release()
                    if clicks.release($0) { onDoubleClick() }
                }
        )
    }

    private func configure(size: CGSize) {
        let anchor = CGPoint(x: size.width / 2, y: 4)
        let segLen = settings.ropeLength / CGFloat(segments)
        if sim.nodes.count != segments + 1 || abs(sim.segLen - segLen) > 0.01 || sim.anchor != anchor {
            sim.reset(anchor: anchor, count: segments + 1, segLen: segLen)
        }
    }

    private func render(_ ctx: inout GraphicsContext) {
        guard sim.nodes.count > 1 else { return }
        let pts = sim.nodes.map(\.p)

        var chain = Path()
        chain.move(to: pts[0])
        for p in pts.dropFirst() { chain.addLine(to: p) }

        // Dark underlay reads as the shadowed side of the links.
        ctx.stroke(chain, with: .color(.black.opacity(0.28)),
                   style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))

        let gold = Gradient(colors: [
            Color(red: 0.99, green: 0.88, blue: 0.62),
            Color(red: 0.85, green: 0.66, blue: 0.29),
            Color(red: 0.98, green: 0.85, blue: 0.56)
        ])
        ctx.stroke(chain,
                   with: .linearGradient(gold, startPoint: pts[0], endPoint: sim.tip),
                   style: StrokeStyle(lineWidth: 3.4, lineCap: .round, lineJoin: .round))

        // Individual links, so the chain reads as metal rather than a cord.
        for (i, p) in pts.enumerated() where i % 2 == 0 && i > 0 {
            let r = CGRect(x: p.x - 2.6, y: p.y - 1.9, width: 5.2, height: 3.8)
            ctx.stroke(Path(ellipseIn: r),
                       with: .color(Color(red: 0.93, green: 0.78, blue: 0.45).opacity(0.9)),
                       lineWidth: 1.1)
        }

        // Ceiling hook
        let hook = CGRect(x: sim.anchor.x - 5, y: sim.anchor.y - 3, width: 10, height: 10)
        ctx.stroke(Path(ellipseIn: hook),
                   with: .color(Color(red: 0.78, green: 0.60, blue: 0.26)), lineWidth: 2.6)

        guard let img = CharmStore.shared.image(settings.charm) else { return }
        let h = settings.charmHeight
        let hang = CharmHang.of(settings.charm)
        let art = hang.rect(width: h * CharmStore.shared.aspect(settings.charm), height: h)

        if WebHands.supports(settings.charm) {
            for ghost in trail.ghosts() {
                var g = ctx
                g.opacity = ghost.opacity
                g.concatenate(hang.placement(tip: ghost.tip, turn: ghost.angle))
                g.draw(img, in: art)
            }
        }

        var c = ctx
        c.addFilter(.shadow(color: .black.opacity(0.34), radius: 11, x: 0, y: 7))
        c.concatenate(hang.placement(tip: sim.tip, turn: sim.charmRotation))
        c.draw(img, in: art)
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSPanel!
    private var statusItem: NSStatusItem!
    private var hitTimer: Timer?
    private let sim = RopeSim()
    private var settings: CharmSettings!
    private var webs: WebController!
    private var bats: BatController!
    private var hulk: HulkController!

    private let winW: CGFloat = 560
    private let winH: CGFloat = 820

    func applicationDidFinishLaunching(_ note: Notification) {
        NSApp.setActivationPolicy(.accessory)
        settings = CharmSettings()

        guard let screen = NSScreen.main else { return }
        let f = screen.visibleFrame
        let origin = CGPoint(x: f.maxX - winW - 40, y: screen.frame.maxY - winH)

        // Non-activating, so handling the charm never takes focus from the app
        // in front — which is also the app Spider-Man's web goes after.
        window = NSPanel(contentRect: NSRect(origin: origin, size: CGSize(width: winW, height: winH)),
                         styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.hidesOnDeactivate = false
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        window.ignoresMouseEvents = true
        webs = WebController(charm: window, sim: sim, settings: settings)
        bats = BatController(charm: window, sim: sim, settings: settings)
        hulk = HulkController(charm: window, sim: sim, settings: settings)
        SoundFX.shared.enabled = settings.sounds
        // Each controller only answers for its own charms.
        window.contentView = NSHostingView(rootView: CharmView(
            settings: settings, sim: sim,
            onDoubleClick: { [weak self] in self?.webs.yank(); self?.bats.towWindow(); self?.hulk.smashWindow() },
            onManhandled: { [weak self] in self?.webs.blast(); self?.bats.releaseBats(); self?.hulk.smashScreen() }))
        window.orderFrontRegardless()

        buildMenu()

        // The window covers a large transparent area, so it only accepts clicks
        // while the pointer is actually over the charm; everything else falls
        // through to whatever is underneath.
        hitTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.updateHitRegion()
        }

        if Tracer.shared.active {
            // Let it settle, release it from one side, record the swing, quit.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                self?.sim.kick(angle: 0.7)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 14.0) {
                Tracer.shared.dump()
                NSApp.terminate(nil)
            }
        }
    }

    private func updateHitRegion() {
        guard let window else { return }
        if sim.grabbed { window.ignoresMouseEvents = false; return }
        let m = NSEvent.mouseLocation
        let wf = window.frame
        let local = CGPoint(x: m.x - wf.minX, y: wf.maxY - m.y)   // AppKit y-up -> view y-down
        let h = settings.charmHeight
        let hang = CharmHang.of(settings.charm)
        let art = hang.rect(width: h * CharmStore.shared.aspect(settings.charm), height: h)
        // Tested in the artwork's own frame, so the region turns with the charm.
        let p = local.applying(hang.placement(tip: sim.tip, turn: sim.charmRotation).inverted())
        let inside = art.insetBy(dx: -12, dy: -12).contains(p)
        if window.ignoresMouseEvents == inside { window.ignoresMouseEvents = !inside }
    }

    // MARK: Menu bar

    private func buildMenu() {
        if statusItem == nil {
            statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
            statusItem.button?.title = "✦"
        }
        let menu = NSMenu()

        let charms = NSMenu()
        for n in CharmStore.shared.names {
            let it = NSMenuItem(title: n.replacingOccurrences(of: "-", with: " "),
                                action: #selector(pickCharm(_:)), keyEquivalent: "")
            it.target = self
            it.representedObject = n
            it.state = (n == settings.charm) ? .on : .off
            charms.addItem(it)
        }
        let charmItem = NSMenuItem(title: "Charm", action: nil, keyEquivalent: "")
        charmItem.submenu = charms
        menu.addItem(charmItem)

        let sizes = NSMenu()
        for (label, v) in [("Small", 140.0), ("Medium", 200.0), ("Large", 270.0), ("Huge", 340.0)] {
            let it = NSMenuItem(title: label, action: #selector(pickSize(_:)), keyEquivalent: "")
            it.target = self
            it.representedObject = v
            it.state = abs(settings.charmHeight - CGFloat(v)) < 1 ? .on : .off
            sizes.addItem(it)
        }
        let sizeItem = NSMenuItem(title: "Size", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizes
        menu.addItem(sizeItem)

        let ropes = NSMenu()
        for (label, v) in [("Short", 150.0), ("Medium", 240.0), ("Long", 340.0), ("Very long", 440.0)] {
            let it = NSMenuItem(title: label, action: #selector(pickRope(_:)), keyEquivalent: "")
            it.target = self
            it.representedObject = v
            it.state = abs(settings.ropeLength - CGFloat(v)) < 1 ? .on : .off
            ropes.addItem(it)
        }
        let ropeItem = NSMenuItem(title: "Chain length", action: nil, keyEquivalent: "")
        ropeItem.submenu = ropes
        menu.addItem(ropeItem)

        let pos = NSMenu()
        for (label, v) in [("Left", 0.0), ("Centre", 0.5), ("Right", 1.0)] {
            let it = NSMenuItem(title: label, action: #selector(pickPosition(_:)), keyEquivalent: "")
            it.target = self
            it.representedObject = v
            pos.addItem(it)
        }
        let posItem = NSMenuItem(title: "Position", action: nil, keyEquivalent: "")
        posItem.submenu = pos
        menu.addItem(posItem)

        if settings.hasGadgets && !WindowSnapshot.allowed {
            let snap = NSMenuItem(title: "Allow Window Snapshots…", action: #selector(allowSnapshots), keyEquivalent: "")
            snap.target = self
            snap.toolTip = "Lets the web, the grapple or the Hulk take the real window instead of a card. Needs Screen Recording; takes effect after a relaunch."
            menu.addItem(snap)
        }
        if settings.hasGadgets {
            let sfx = NSMenuItem(title: "Sound Effects", action: #selector(toggleSounds), keyEquivalent: "")
            sfx.target = self
            sfx.state = settings.sounds ? .on : .off
            menu.addItem(sfx)
        }

        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit DeskCharm", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
        statusItem.menu = menu
    }

    @objc private func pickCharm(_ s: NSMenuItem) {
        guard let n = s.representedObject as? String else { return }
        settings.charm = n
        buildMenu()
    }

    @objc private func pickSize(_ s: NSMenuItem) {
        guard let v = s.representedObject as? Double else { return }
        settings.charmHeight = CGFloat(v)
        buildMenu()
    }

    @objc private func pickRope(_ s: NSMenuItem) {
        guard let v = s.representedObject as? Double else { return }
        settings.ropeLength = CGFloat(v)
        buildMenu()
    }

    @objc private func toggleSounds() {
        settings.sounds.toggle()
        SoundFX.shared.enabled = settings.sounds
        buildMenu()
    }

    /// The system asks at most once per build; after that the switch lives in
    /// System Settings, so open it there too.
    @objc private func allowSnapshots() {
        if !CGRequestScreenCaptureAccess(),
           let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func pickPosition(_ s: NSMenuItem) {
        guard let v = s.representedObject as? Double, let screen = NSScreen.main else { return }
        let f = screen.visibleFrame
        let x = f.minX + (f.width - winW) * CGFloat(v)
        window.setFrameOrigin(CGPoint(x: x, y: screen.frame.maxY - winH))
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
