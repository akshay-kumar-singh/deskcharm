import AppKit
import SwiftUI

// MARK: - Batman's gadgets
//
// Two effects called up from the bat emblem, drawn on click-through overlays
// like Spider-Man's: the tow (double-click: grapple the front window and pour
// it into the charm, BatTow.swift) and the swarm (manhandle it: bats up the
// whole screen, BatSwarm.swift).

/// The bat pictures the gadgets are drawn with, from the bundle's Effects
/// folder, and the points on them they work from, as fractions of a frame.
enum BatGear {
    static func supports(_ charm: String) -> Bool { charm == "Bat-Man" }

    /// One wingbeat of a bat seen face on: wings raised, sweeping down, back up.
    static let bats = (1...6).compactMap { EffectArt.load("Bat-\($0)") }
    static let batBody = CGPoint(x: 0.5, y: 0.58)       // where the body sits, the same in every frame
    static let batFill: CGFloat = 0.34                  // how much of its frame a bat covers, over a wingbeat
    static var batAspect: CGFloat { bats.first.map { CGFloat($0.height) / CGFloat($0.width) } ?? 0.557 }
}

/// Calls the gadgets up at the charm and owns the overlays they are drawn in.
final class BatController {
    private let charm: NSWindow
    private let sim: RopeSim
    private let settings: CharmSettings

    private let towHost = NSHostingView(rootView: BatTowView(tow: nil))
    private let towOverlay: NSWindow
    private var tow: BatTow?

    private let swarmHost = NSHostingView(rootView: BatSwarmView(swarm: nil))
    private let swarmOverlay: NSWindow
    private var swarm: BatSwarm?

    init(charm: NSWindow, sim: RopeSim, settings: CharmSettings) {
        self.charm = charm
        self.sim = sim
        self.settings = settings
        towOverlay = Overlay.make(towHost)
        swarmOverlay = Overlay.make(swarmHost)
    }

    // MARK: Tow

    func towWindow() {
        guard tow == nil, BatGear.supports(settings.charm),
              let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        let target = WebTarget.find(in: area)
        let centre = emblem(CGPoint(x: 0.5, y: 0.5), area)
        let k = settings.kickScale
        let tow = BatTow(target: target, aim: WebTarget.aim(at: target, from: centre, in: area),
                         home: { [unowned self] in self.emblem(CGPoint(x: 0.5, y: 0.5), area) },
                         homeSize: CGSize(width: settings.charmHeight * CharmStore.shared.aspect(settings.charm),
                                          height: settings.charmHeight),
                         bats: BatGear.bats.map { Image(decorative: $0, scale: 1) }, batBody: BatGear.batBody,
                         batAspect: BatGear.batAspect,
                         push: { [weak self] v in self?.sim.impulse(v * k) },
                         sound: { SoundFX.shared.play($0) },
                         finish: { [weak self] in DispatchQueue.main.async { self?.endTow() } })
        self.tow = tow
        target?.standIn(on: screen) { [weak tow] image, isSnapshot in
            tow?.standInArrived(image, isSnapshot: isSnapshot)
        }
        towHost.rootView = BatTowView(tow: tow)
        Overlay.show(towOverlay, on: area, below: charm)
    }

    private func endTow() {
        towOverlay.orderOut(nil)
        towHost.rootView = BatTowView(tow: nil)
        tow = nil
    }

    // MARK: Swarm

    func releaseBats() {
        guard swarm == nil, BatGear.supports(settings.charm), !BatGear.bats.isEmpty,
              let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        var rng = SystemRandomNumberGenerator()
        let plan = Swarm(size: area.size, fill: BatGear.batFill, aspect: BatGear.batAspect, using: &rng)
        let k = settings.kickScale
        let swarm = BatSwarm(plan: plan, frames: BatGear.bats.map { Image(decorative: $0, scale: 1) },
                             body: BatGear.batBody,
                             push: { [weak self] v in self?.sim.impulse(v * k) },
                             sound: { SoundFX.shared.play($0) },
                             finish: { [weak self] in DispatchQueue.main.async { self?.endSwarm() } })
        self.swarm = swarm
        swarmHost.rootView = BatSwarmView(swarm: swarm)
        Overlay.show(swarmOverlay, on: area, below: charm)
    }

    private func endSwarm() {
        swarmOverlay.orderOut(nil)
        swarmHost.rootView = BatSwarmView(swarm: nil)
        swarm = nil
    }

    /// A point of the emblem, as a fraction of its artwork, where it is now.
    private func emblem(_ u: CGPoint, _ area: CGRect) -> CGPoint {
        Overlay.point(settings.artPoint(u, of: settings.charm, sim: sim), from: charm, in: area)
    }
}
