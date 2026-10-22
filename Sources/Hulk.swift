import AppKit
import SceneKit
import SwiftUI

// MARK: - The Hulk's smashes
//
// Two effects called up from the Hulk charm, drawn on click-through overlays
// like the others: the smash (double-click: the Hulk, in 3D, smashes the front
// window about and throws it into the charm, HulkSlam.swift) and the wall
// smash (manhandle him: the screen punched in like concrete, WallSmash.swift).

/// The Hulk's pictures and model, from the bundle's Effects folder.
enum HulkGear {
    static func supports(_ charm: String) -> Bool { charm == "Hulk" }

    /// The Hulk in 3D, loaded once and drawn once out of sight. It takes a
    /// moment, so it's started early.
    static let rig: HulkRig? = Bundle.main.resourceURL.flatMap { folder in
        let rig = HulkRig(url: folder.appendingPathComponent("Effects/HulkModel.glb"), skin: EffectArt.load("HulkSkin"))
        rig.map(HulkSlam.warmUp)
        return rig
    }
    /// Rough concrete, for the wall he smashes.
    static let concrete = EffectArt.load("Concrete")
}

/// The Hulk in 3D: a rigged glTF model (a CC0 giant, repainted), posed from
/// its own animations, his torso turned and his right arm steered by
/// two-bone IK to wherever his hand has to be.
final class HulkRig {
    let root: SCNNode
    /// Toe to crown when standing, and how far his toes are below the
    /// model's origin then, in model units.
    let height: Float
    let toeDepth: Float
    /// His right arm's reach, shoulder to wrist, in model units.
    let reach: Float

    private let model: GLTFModel
    private let shoulder: SCNNode, elbow: SCNNode, hand: SCNNode, spine: SCNNode
    private let toes: [SCNNode]
    /// The joints turned on top of the animations, as they are at rest, so
    /// each pose starts from scratch even where a clip doesn't move them.
    private let rest: [(SCNNode, simd_quatf)]

    init?(url: URL, skin: CGImage?) {
        guard let model = GLTFModel(url: url, texture: skin) else { return nil }
        func bone(_ name: String) -> SCNNode? { model.names[name].map { model.nodes[$0] } }
        guard let shoulder = bone("mixamorigRightArm"), let elbow = bone("mixamorigRightForeArm"),
              let hand = bone("mixamorigRightHand"), let spine = bone("mixamorigSpine1"),
              let head = bone("mixamorigHead"), let leftToe = bone("mixamorigLeftToeBase"),
              let rightToe = bone("mixamorigRightToeBase"), model.clips["idle"] != nil, model.clips["Jump Slam"] != nil
        else { return nil }
        self.model = model
        root = model.root
        self.shoulder = shoulder
        self.elbow = elbow
        self.hand = hand
        self.spine = spine
        toes = [leftToe, rightToe]
        rest = [spine, shoulder, elbow, hand].map { ($0, $0.simdOrientation) }
        model.pose(model.clips["idle"]!, at: 0)
        let toeY = min(leftToe.simdWorldPosition.y, rightToe.simdWorldPosition.y)
        // The head bone sits at the base of the skull; the crown is a little above.
        height = (head.simdWorldPosition.y - toeY) * 1.12
        toeDepth = -toeY
        reach = simd_distance(shoulder.simdWorldPosition, elbow.simdWorldPosition)
            + simd_distance(elbow.simdWorldPosition, hand.simdWorldPosition)
    }

    /// Poses him as one of his animations has him, `t` seconds in.
    func pose(_ clip: String, at t: Float) {
        for (node, q) in rest { node.simdOrientation = q }
        if let c = model.clips[clip] { model.pose(c, at: t) }
    }

    /// Poses him part way from one pose toward another, by `mix`, 0 to 1.
    func pose(_ clip: String, at t: Float, toward other: String, at u: Float, mix: Float) {
        for (node, q) in rest { node.simdOrientation = q }
        guard let a = model.clips[clip] else { return }
        if let b = model.clips[other], mix > 0 { model.pose(a, at: t, b, at: u, mix: min(mix, 1)) } else { model.pose(a, at: t) }
    }

    /// Turns his upper body toward one side and leans it over, in radians.
    func twist(_ yaw: Float, lean: Float) {
        spine.simdWorldOrientation = simd_quatf(angle: lean, axis: SIMD3(0, 0, 1))
            * simd_quatf(angle: yaw, axis: SIMD3(0, 1, 0)) * spine.simdWorldOrientation
    }

    /// Bends his right arm to put his hand at `target`, elbow toward `bend`,
    /// both in world space. Out of reach, the arm points straight at it.
    func reach(to target: SIMD3<Float>, bend: SIMD3<Float>) {
        let s = shoulder.simdWorldPosition, e = elbow.simdWorldPosition, h = hand.simdWorldPosition
        let upper = simd_distance(s, e), lower = simd_distance(e, h)
        let offset = target - s
        let d = min(max(simd_length(offset), abs(upper - lower) + 0.001), (upper + lower) * 0.999)
        let along = simd_normalize(offset)
        // Law of cosines: how far along the line to the elbow, and how far out.
        let a = (upper * upper - lower * lower + d * d) / (2 * d)
        let out = (max(0, upper * upper - a * a)).squareRoot()
        var pole = bend - along * simd_dot(bend, along)
        if simd_length(pole) < 0.0001 { pole = SIMD3(0, -1, 0) - along * along.y }
        let elbowAt = s + along * a + simd_normalize(pole) * out
        turn(shoulder, from: e - s, to: elbowAt - s)
        turn(elbow, from: hand.simdWorldPosition - elbow.simdWorldPosition, to: s + along * d - elbow.simdWorldPosition)
    }

    var handPosition: SIMD3<Float> { hand.simdWorldPosition }
    var shoulderPosition: SIMD3<Float> { shoulder.simdWorldPosition }
    var lowestToe: Float { toes.map(\.simdWorldPosition.y).min() ?? 0 }

    private func turn(_ node: SCNNode, from a: SIMD3<Float>, to b: SIMD3<Float>) {
        guard simd_length(a) > 0.0001, simd_length(b) > 0.0001 else { return }
        node.simdWorldOrientation = simd_quatf(from: simd_normalize(a), to: simd_normalize(b)) * node.simdWorldOrientation
    }
}

/// Calls the smashes up at the charm and owns the overlays they are drawn in.
final class HulkController {
    private let charm: NSWindow
    private let sim: RopeSim
    private let settings: CharmSettings

    private let slamHost = NSHostingView(rootView: HulkSlamView(slam: nil))
    private let slamOverlay: NSWindow
    private var slam: HulkSlam?

    private let wallHost = NSHostingView(rootView: WallSmashView(smash: nil))
    private let wallOverlay: NSWindow
    private var wall: WallSmash?

    init(charm: NSWindow, sim: RopeSim, settings: CharmSettings) {
        self.charm = charm
        self.sim = sim
        self.settings = settings
        slamOverlay = Overlay.make(slamHost)
        wallOverlay = Overlay.make(wallHost)
        // Loaded off the main thread now, not as a stall on the first double-click.
        DispatchQueue.global(qos: .utility).async { _ = HulkGear.rig }
    }

    // MARK: Smash

    func smashWindow() {
        guard slam == nil, let rig = HulkGear.rig,
              let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        let target = WebTarget.find(in: area)
        let k = settings.kickScale
        let slam = HulkSlam(target: target, screen: area.size, floor: screen.visibleFrame.minY - area.minY, rig: rig,
                            concrete: HulkGear.concrete, home: { [unowned self] in self.charmCentre(area) },
                            homeRadius: settings.charmHeight * CharmStore.shared.aspect(settings.charm) / 2,
                            push: { [weak self] v in self?.sim.impulse(v * k) },
                            sound: { SoundFX.shared.play($0) },
                            finish: { [weak self] in DispatchQueue.main.async { self?.endSlam() } })
        self.slam = slam
        target?.standIn(on: screen) { [weak slam] image, isSnapshot in
            slam?.standInArrived(image, isSnapshot: isSnapshot)
        }
        slamHost.rootView = HulkSlamView(slam: slam)
        Overlay.show(slamOverlay, on: area, below: charm)
    }

    private func endSlam() {
        slamOverlay.orderOut(nil)
        slamHost.rootView = HulkSlamView(slam: nil)
        slam?.tearDown()
        slam = nil
    }

    private func charmCentre(_ area: CGRect) -> CGPoint {
        Overlay.point(settings.artPoint(CGPoint(x: 0.5, y: 0.5), of: settings.charm, sim: sim), from: charm, in: area)
    }

    // MARK: Wall smash

    func smashScreen() {
        guard wall == nil, let concrete = HulkGear.concrete,
              let screen = charm.screen ?? NSScreen.main
        else { return }
        let area = screen.frame
        let k = settings.kickScale
        let wall = WallSmash(size: area.size, concrete: concrete,
                             push: { [weak self] v in self?.sim.impulse(v * k) },
                             sound: { SoundFX.shared.play($0) },
                             finish: { [weak self] in DispatchQueue.main.async { self?.endWall() } })
        self.wall = wall
        wallHost.rootView = WallSmashView(smash: wall)
        Overlay.show(wallOverlay, on: area, below: charm)
    }

    private func endWall() {
        wallOverlay.orderOut(nil)
        wallHost.rootView = WallSmashView(smash: nil)
        wall = nil
    }
}
