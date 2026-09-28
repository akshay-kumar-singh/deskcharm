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

// MARK: - Settings

final class CharmSettings: ObservableObject {
    @Published var charm: String { didSet { d.set(charm, forKey: "charm") } }
    @Published var charmHeight: CGFloat { didSet { d.set(charmHeight, forKey: "charmHeight") } }
    @Published var ropeLength: CGFloat { didSet { d.set(ropeLength, forKey: "ropeLength") } }

    private let d = UserDefaults.standard

    init() {
        let fallback = CharmStore.shared.names.first(where: { $0.contains("Iron") })
            ?? CharmStore.shared.names.first ?? ""
        charm = d.string(forKey: "charm").flatMap { CharmStore.shared.names.contains($0) ? $0 : nil } ?? fallback
        let h = d.double(forKey: "charmHeight")
        charmHeight = h > 0 ? CGFloat(h) : 200
        let r = d.double(forKey: "ropeLength")
        ropeLength = r > 0 ? CGFloat(r) : 240
    }
}

// MARK: - View

struct CharmView: View {
    @ObservedObject var settings: CharmSettings
    let sim: RopeSim

    private let segments = 22

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                configure(size: size)
                sim.advance(to: timeline.date)
                Tracer.shared.record(sim.tip)
                render(&ctx)
            }
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { sim.grab($0.location) }
                .onEnded { _ in sim.release() }
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
        let w = h * CharmStore.shared.aspect(settings.charm)

        var c = ctx
        c.addFilter(.shadow(color: .black.opacity(0.34), radius: 11, x: 0, y: 7))
        c.translateBy(x: sim.tip.x, y: sim.tip.y)
        c.rotate(by: .radians(Double(sim.tipAngle)))
        c.draw(img, in: CGRect(x: -w / 2, y: -1, width: w, height: h))
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var statusItem: NSStatusItem!
    private var hitTimer: Timer?
    private let sim = RopeSim()
    private var settings: CharmSettings!

    private let winW: CGFloat = 560
    private let winH: CGFloat = 820

    func applicationDidFinishLaunching(_ note: Notification) {
        NSApp.setActivationPolicy(.accessory)
        settings = CharmSettings()

        guard let screen = NSScreen.main else { return }
        let f = screen.visibleFrame
        let origin = CGPoint(x: f.maxX - winW - 40, y: screen.frame.maxY - winH)

        window = NSWindow(contentRect: NSRect(origin: origin, size: CGSize(width: winW, height: winH)),
                          styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        window.ignoresMouseEvents = true
        window.contentView = NSHostingView(rootView: CharmView(settings: settings, sim: sim))
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
        let w = h * CharmStore.shared.aspect(settings.charm)
        let box = CGRect(x: sim.tip.x - w / 2 - 12, y: sim.tip.y - 12, width: w + 24, height: h + 24)
        let inside = box.contains(local)
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
