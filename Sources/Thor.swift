import AppKit
import SwiftUI

// MARK: - Thor's storm
//
// Two effects called up from the Thor charm, drawn on click-through overlays
// like the others: the strike (double-click: lightning into the front window,
// which is drawn into the charm along an arc, ThorStrike.swift) and the
// thunderstorm (manhandle him: rain, lightning and thunder over the whole
// screen, the last bolt into the charm, ThorStorm.swift).

enum ThorGear {
    static func supports(_ charm: String) -> Bool { charm == "Thor" }
}

/// Calls the storm up at the charm and owns the overlay it is drawn in.
final class ThorController {
    private let charm: NSWindow
    private let sim: RopeSim
    private let settings: CharmSettings

    private let strikeHost = NSHostingView(rootView: ThorStrikeView(strike: nil))
    private let strikeOverlay: NSWindow
    private var strike: ThorStrike?

    private let stormHost = NSHostingView(rootView: ThorStormView(storm: nil))
    private let stormOverlay: NSWindow
    private var storm: ThorStorm?

    init(charm: NSWindow, sim: RopeSim, settings: CharmSettings) {
        self.charm = charm
        self.sim = sim
        self.settings = settings
        strikeOverlay = Overlay.make(strikeHost)
        stormOverlay = Overlay.make(stormHost)
    }

    // MARK: Strike

    func strikeWindow() {
        guard strike == nil, let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        let target = WebTarget.find(in: area)
        let centre = emblem(area)
        let k = settings.kickScale
        let strike = ThorStrike(target: target, aim: WebTarget.aim(at: target, from: centre, in: area),
                                screen: area.size, home: { [unowned self] in self.emblem(area) },
                                homeSize: CGSize(width: settings.charmHeight * CharmStore.shared.aspect(settings.charm),
                                                 height: settings.charmHeight),
                                push: { [weak self] v in self?.sim.impulse(v * k) },
                                sound: { SoundFX.shared.play($0) },
                                finish: { [weak self] in DispatchQueue.main.async { self?.endStrike() } })
        self.strike = strike
        target?.standIn(on: screen) { [weak strike] image, isSnapshot in
            strike?.standInArrived(image, isSnapshot: isSnapshot)
        }
        strikeHost.rootView = ThorStrikeView(strike: strike)
        Overlay.show(strikeOverlay, on: area, below: charm)
    }

    private func endStrike() {
        strikeOverlay.orderOut(nil)
        strikeHost.rootView = ThorStrikeView(strike: nil)
        strike = nil
    }

    // MARK: Storm

    func callStorm() {
        guard storm == nil, let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        var rng = SystemRandomNumberGenerator()
        // The last bolt goes for the charm, wherever it is swinging just now.
        let target = emblem(area)
        let k = settings.kickScale
        let storm = ThorStorm(plan: Storm(size: area.size, charm: target, using: &rng),
                              push: { [weak self] v in self?.sim.impulse(v * k) },
                              sound: { SoundFX.shared.play($0) },
                              finish: { [weak self] in DispatchQueue.main.async { self?.endStorm() } })
        self.storm = storm
        stormHost.rootView = ThorStormView(storm: storm)
        Overlay.show(stormOverlay, on: area, below: charm)
    }

    private func endStorm() {
        stormOverlay.orderOut(nil)
        stormHost.rootView = ThorStormView(storm: nil)
        storm = nil
    }

    /// The charm's centre, where it is now.
    private func emblem(_ area: CGRect) -> CGPoint {
        Overlay.point(settings.artPoint(CGPoint(x: 0.5, y: 0.5), of: settings.charm, sim: sim), from: charm, in: area)
    }
}
