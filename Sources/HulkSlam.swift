import SceneKit
import SwiftUI

// MARK: - Hulk smash
//
// Double-clicking the Hulk charm brings in the Hulk, in 3D. He drops in at the
// bottom of the screen with a landing that cracks the floor, reaches up and
// rips the front window out of its place by one edge, and smashes it into the
// floor, left, right, left, right — the way he dealt with Loki — the window
// whipping and splatting like a rubber mat. Then he hurls it into the charm,
// where it's minimised, and leaps away.
//
// What he swings is the window's stand-in, with the app hidden beneath it, as
// for the web yank (WebYank.swift has the reasons). He is a rigged model posed
// from his own animations, crouching into each slam and leaning after it, his
// right arm steered by IK (HulkRig, Hulk.swift); the window is a Cloth, and its
// landings are what set off each impact.
//
// The scene is in points, y up from the bottom of the screen, seen through an
// orthographic camera, so a point in it sits right over the same point of the
// overlay's 2D drawing: behind him, the window still in its place, the cracks
// in the floor and his shadow; in front, the dust and the flying concrete.

final class HulkSlam {
    let scene = SCNScene()
    let camera = SCNNode()

    private let target: WebTarget?
    private var takedown: Takedown?
    private let rig: HulkRig
    private let concrete: Image?
    private let body = SCNNode()
    private let windowNode = SCNNode()
    private let material = SCNMaterial()
    private let screen: CGSize
    private let floor: Float
    /// His height, and his arm's reach, in points.
    private let tall: Float
    private let reach: Float
    private let middle: Float
    private let home: () -> CGPoint
    private let homeRadius: CGFloat
    private let push: (CGVector) -> Void
    private let sound: (SoundFX.Effect) -> Void
    private let finish: () -> Void

    // The window as cloth, held by the middle of its left edge.
    private let columns = 14
    private let rows: Int
    private let sheet: SIMD2<Float>
    private var cloth: Cloth?
    private var picture: CGImage?
    private var dents: [CrackWeb] = []
    private var uvs: SCNGeometrySource?
    private var faces: SCNGeometryElement?
    /// The sheet is never shown much bigger than this, so its texture is
    /// kept to it: cracking a full Retina snapshot took frames.
    private let textureSide: CGFloat = 1600
    private let painter = DispatchQueue(label: "local.deskcharm.hulk-paint", qos: .userInteractive)
    /// The GPU the scene is drawn on. The sheet's textures are made on it off
    /// the main thread: handed a picture, SceneKit turns it into one itself
    /// while it draws, and holds up the frame doing it.
    let device = MTLCreateSystemDefaultDevice()
    private lazy var uploads = device?.makeCommandQueue()

    // His swing: round a point over his right shoulder, which goes where he does.
    private var arcCentre = SIMD2<Float>(0, 0)
    private var handDepth: Float = 0
    private var arcRadius: Float { 0.95 * reach }
    private let top = Float.pi / 2
    private let left = Float.pi * 1.22          // down to his right, screen left
    private let right = -Float.pi * 0.22        // over his head and down the other side

    private let dropTime = 0.45
    private let landTime = 0.8
    private let reachTime = 0.2
    private let yankTime = 0.3
    private let swings = 5
    private let firstSwing = 0.3
    private let swingTime = 0.42
    private let holdTime = 0.12
    private let windTime = 0.32
    private let flingTime = 0.14
    private let flyTime = 0.6
    private let puffTime = 0.35
    private let roarTime = 1.0
    private let crouchTime = 0.22
    private let leapTime = 0.45

    private var start: Date?
    private var stepped: Date?
    private var now = 0.0
    private var before = -1.0
    private var landed = false
    private var gone: Double?
    private var failed: Double?
    private var grabbed: Double?
    private var grabFrom = SIMD3<Float>(0, 0, 0)
    private var grip = SIMD3<Float>(0, 0, 0)
    private var swingStarts: [Double] = []
    private var winding: Double?
    private var released: Double?
    private var releasedAt = SIMD3<Float>(0, 0, 0)
    private var arrived: Double?
    private var roaring: Double?
    private var leaving: Double?
    private var ended = false
    private var shaken = CGVector.zero

    /// A hard landing on the floor, his or the window's: cracks running off
    /// from it and concrete thrown up.
    private struct Impact {
        let time: Double
        let at: CGPoint
        let reach: CGFloat
        let cracks: [(path: Path, width: CGFloat)]
        let chunks: [Crater.Chunk]
    }
    private var impacts: [Impact] = []

    /// `floor` is how far above the bottom of the screen he stands (clear of
    /// the Dock); `home` is the charm's centre, live, in overlay points.
    init(target: WebTarget?, screen: CGSize, floor: CGFloat, rig: HulkRig, concrete: CGImage?,
         home: @escaping () -> CGPoint, homeRadius: CGFloat, push: @escaping (CGVector) -> Void,
         sound: @escaping (SoundFX.Effect) -> Void, finish: @escaping () -> Void) {
        self.target = target
        self.screen = screen
        self.floor = Float(floor)
        self.rig = rig
        self.concrete = concrete.map { Image(decorative: $0, scale: 1) }
        self.home = home
        self.homeRadius = homeRadius
        self.push = push
        self.sound = sound
        self.finish = finish
        takedown = target.map(Takedown.init)

        let visible = Float(screen.height) - self.floor
        tall = min(max(visible * 0.46, 240), 470)
        let scale = tall / rig.height
        reach = rig.reach * scale
        let window = target?.frame.size ?? CGSize(width: 600, height: 400)
        let length = min(Float(window.width), tall * 0.85)
        sheet = SIMD2(length, length * Float(window.height / max(window.width, 1)))
        // An odd number of rows, so the one held to its length runs down the middle.
        rows = max(5, Int((Float(columns - 1) * sheet.y / sheet.x).rounded()) + 1) | 1

        body.simdScale = SIMD3(repeating: scale)
        rig.root.removeFromParentNode()
        body.addChildNode(rig.root)
        scene.rootNode.addChildNode(body)
        // Stood with his right shoulder under the window's left edge, there to
        // reach up for, and room either side to swing it.
        rig.pose("idle", at: 0)
        let shoulder = rig.shoulderPosition.x - body.simdPosition.x
        let room = reach + length + 20
        let wanted = Float(target.map { $0.frame.minX } ?? screen.width / 2) - shoulder
        middle = Float(screen.width) < 2 * room ? Float(screen.width) / 2 : min(max(wanted, room), Float(screen.width) - room)
        body.simdPosition = SIMD3(middle, Float(screen.height) + tall, 0)

        let cam = SCNCamera()
        cam.usesOrthographicProjection = true
        cam.orthographicScale = Double(screen.height / 2)
        cam.zNear = 1
        cam.zFar = 6000
        camera.camera = cam
        camera.simdPosition = SIMD3(Float(screen.width / 2), Float(screen.height / 2), 3000)
        scene.rootNode.addChildNode(camera)
        Self.light(scene)
        Self.dress(material)
        scene.rootNode.addChildNode(windowNode)
    }

    /// Lit from above and to one side, and filled from the other.
    private static func light(_ scene: SCNScene) {
        for (angles, intensity) in [(SIMD3<Float>(-0.55, -0.45, 0), 1300.0), (SIMD3<Float>(-0.2, 0.9, 0), 380.0)] {
            let light = SCNNode()
            light.light = SCNLight()
            light.light?.type = .directional
            light.light?.intensity = CGFloat(intensity)
            light.simdEulerAngles = angles
            scene.rootNode.addChildNode(light)
        }
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 380
        scene.rootNode.addChildNode(ambient)
    }

    /// The sheet shows the window as it is, unlit, from either side.
    private static func dress(_ material: SCNMaterial) {
        material.lightingModel = .constant
        material.isDoubleSided = true
        material.diffuse.mipFilter = .linear
    }

    /// Draws him and a sheet once, out of sight, so that SceneKit has built
    /// its shaders before the first double-click needs them: built then, the
    /// first time ever, they held up his entrance by a fifth of a second.
    static func warmUp(_ rig: HulkRig) {
        guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue(),
              let painted = CGContext(data: nil, width: 4, height: 4, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return }
        let scene = SCNScene()
        light(scene)
        let camera = SCNNode()
        camera.camera = SCNCamera()
        camera.camera?.usesOrthographicProjection = true
        camera.camera?.orthographicScale = 4
        camera.simdPosition = SIMD3(0, 1, 20)
        scene.rootNode.addChildNode(camera)
        scene.rootNode.addChildNode(rig.root)
        let material = SCNMaterial()
        dress(material)
        material.diffuse.contents = texture(painted, on: device, queue)
        let corners = [CGPoint(x: 0, y: 0), CGPoint(x: 1, y: 0), CGPoint(x: 0, y: 1), CGPoint(x: 1, y: 1)]
        let sheet = SCNGeometry(sources: [SCNGeometrySource(vertices: corners.map { SCNVector3($0.x, -$0.y, 5) }),
                                          SCNGeometrySource(textureCoordinates: corners)],
                                elements: [SCNGeometryElement(indices: [UInt16(0), 2, 1, 1, 2, 3], primitiveType: .triangles)])
        sheet.materials = [material]
        scene.rootNode.addChildNode(SCNNode(geometry: sheet))
        let renderer = SCNRenderer(device: device, options: nil)
        renderer.scene = scene
        renderer.pointOfView = camera
        _ = renderer.snapshot(atTime: 0, with: CGSize(width: 64, height: 64), antialiasingMode: .multisampling4X)
        rig.root.removeFromParentNode()
    }

    func standInArrived(_ image: CGImage?, isSnapshot: Bool) {
        takedown?.arrived(image, isSnapshot: isSnapshot)
        picture = image
        repaint()
    }

    /// Gives the shared model back once the effect is over.
    func tearDown() {
        rig.root.removeFromParentNode()
    }

    /// What shows behind him and the window he swings.
    func renderBehind(_ ctx: inout GraphicsContext, at date: Date) {
        step(date)
        drawBehind(&ctx, now)
    }

    /// What shows in front of them.
    func render(_ ctx: inout GraphicsContext, at date: Date) {
        step(date)
        drawFront(&ctx, now)
    }

    /// Moves everything on to `date`, once a frame however many layers ask.
    private func step(_ date: Date) {
        guard date != stepped else { return }
        stepped = date
        if start == nil {
            start = date
            sound(.roar)
        }
        let t = date.timeIntervalSince(start ?? date)
        before = now
        now = t
        advance(t)
        poseHulk(t)
        moveWindow(t, t - before)
        shaken = shake(t)
        camera.simdPosition = SIMD3(Float(screen.width / 2 - shaken.dx), Float(screen.height / 2 + shaken.dy), 3000)
    }

    // MARK: Story

    private func advance(_ t: Double) {
        func passing(_ x: Double?) -> Bool { x.map { before < $0 && $0 <= t } ?? false }
        if target == nil, failed == nil { failed = 0 }
        if gone == nil, failed == nil {
            switch takedown?.advance(t, since: 0) {
            case .gone: gone = t
            case .failed: failed = t
            case nil: break
            }
        }
        if !landed, t >= dropTime {
            landed = true
            impact(at: CGPoint(x: CGFloat(middle), y: screen.height - CGFloat(floor)), time: dropTime, size: 150, kick: 120)
        }
        if grabbed == nil, let g = gone, t >= max(dropTime + 0.45, g) {
            grabbed = t
            grabFrom = rig.handPosition
            // As far up the window's left edge as he can reach.
            let shoulder = rig.shoulderPosition
            let edge = target.map { scenePoint(CGPoint(x: $0.frame.minX + 6, y: $0.frame.midY)) } ?? SIMD2(shoulder.x, shoulder.y + reach)
            var out = SIMD3(edge.x, edge.y, shoulder.z + 0.3 * reach) - shoulder
            if simd_length(out) > reach * 0.98 { out = simd_normalize(out) * reach * 0.98 }
            grip = shoulder + out
            var s = t + reachTime + yankTime
            for i in 0..<swings {
                swingStarts.append(s)
                s += (i == 0 ? firstSwing : swingTime) + holdTime
            }
            winding = s
        }
        if passing(grabbed.map { $0 + reachTime }) { sound(.whoosh) }
        if passing(winding) { sound(.roar) }
        if let w = winding, released == nil, t >= w + windTime + flingTime {
            released = w + windTime + flingTime
            releasedAt = rig.handPosition
            let toward = simd_normalize(scenePoint(home()) - SIMD2(releasedAt.x, releasedAt.y))
            cloth?.release(velocity: toward * 1500 + SIMD2(0, 300))
            sound(.whoosh)
        }
        if let r = released, arrived == nil, t >= r + flyTime {
            arrived = r + flyTime
            push(CGVector(dx: 260, dy: -40))
            sound(.pop)
        }
        // With nothing to smash he just roars, and goes.
        if roaring == nil, let f = failed, t >= max(dropTime + landTime * 0.6, f) {
            roaring = max(dropTime + landTime * 0.6, f)
            sound(.roar)
        }
        if leaving == nil {
            if let r = released, t >= r + 0.25 { leaving = r + 0.25 }
            if let r = roaring, t >= r + roarTime { leaving = r + roarTime }
        }
        let windowDone = released == nil ? failed != nil : arrived.map { t >= $0 + puffTime } ?? false
        if !ended, windowDone, let l = leaving, t >= l + crouchTime + leapTime {
            ended = true
            finish()
        }
    }

    /// A hard landing — his, or the window's: cracks in the floor, concrete
    /// and dust thrown up, the screen and the charm jolted, and a dent in the
    /// window if it was that.
    private func impact(at p: CGPoint, time: Double, size: CGFloat, kick: CGFloat, window: Bool = false) {
        var rng = SystemRandomNumberGenerator()
        let area = CGRect(x: p.x - 2.4 * size, y: p.y - 2 * size, width: 4.8 * size, height: 2 * size)
        let crater = Crater(centre: p, radius: size * 0.2, bounds: area, using: &rng)
        // Finer than a wall's, and only those that run up into view.
        let cracks = crater.cracks.filter { $0.points.contains { $0.y < p.y - 12 } }
            .map { Crater.Crack(points: $0.points, width: $0.width * 0.6) }
        // Thrown up off the floor, never down into it.
        let chunks = crater.thrown.map { c in
            Crater.Chunk(outline: c.outline, start: CGPoint(x: c.start.x, y: min(c.start.y, p.y - 3)),
                         velocity: CGVector(dx: c.velocity.dx * 0.7, dy: -abs(c.velocity.dy) - 260), spin: c.spin, shade: c.shade)
        }
        impacts.append(Impact(time: time, at: p, reach: size * 2.6, cracks: ConcreteArt.tapered(cracks), chunks: chunks))
        push(CGVector(dx: (impacts.count % 2 == 0 ? 1 : -1) * kick, dy: -40))
        sound(.slam)
        guard window, let picture else { return }
        // The far edge is what hits the floor.
        let size = textureSize(picture)
        dents.append(CrackWeb(centre: CGPoint(x: size.width * .random(in: 0.72...0.95, using: &rng),
                                              y: size.height * .random(in: 0.2...0.8, using: &rng)),
                              reach: max(size.width, size.height) * 0.32, using: &rng))
        repaint()
    }

    private func textureSize(_ image: CGImage) -> CGSize {
        let w = CGFloat(image.width), h = CGFloat(image.height)
        let k = min(1, textureSide / max(w, h))
        return CGSize(width: (w * k).rounded(), height: (h * k).rounded())
    }

    /// Paints the sheet's texture, cracks and all, off the main thread; it
    /// lands a frame or so later.
    private func repaint() {
        guard let picture else { return }
        let size = textureSize(picture), dents = dents, material = material, device = device, uploads = uploads
        painter.async {
            guard let painted = Self.cracked(picture, dents, size: size) else { return }
            let texture: Any? = device.flatMap { d in uploads.flatMap { Self.texture(painted, on: d, $0) } } ?? painted.makeImage()
            DispatchQueue.main.async { material.diffuse.contents = texture }
        }
    }

    /// A painting as a texture, mipmapped, ready to draw with.
    private static func texture(_ painted: CGContext, on device: MTLDevice, _ queue: MTLCommandQueue) -> MTLTexture? {
        guard let bytes = painted.data else { return nil }
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm_srgb, width: painted.width,
                                                         height: painted.height, mipmapped: true)
        d.usage = .shaderRead
        guard let texture = device.makeTexture(descriptor: d), let commands = queue.makeCommandBuffer(),
              let blit = commands.makeBlitCommandEncoder()
        else { return nil }
        texture.replace(region: MTLRegionMake2D(0, 0, painted.width, painted.height), mipmapLevel: 0,
                        withBytes: bytes, bytesPerRow: painted.bytesPerRow)
        blit.generateMipmaps(for: texture)
        blit.endEncoding()
        commands.commit()
        commands.waitUntilCompleted()
        return texture
    }

    // MARK: Him

    private func poseHulk(_ t: Double) {
        let idle = Float(t.truncatingRemainder(dividingBy: 4))
        if t < dropTime {
            // Falls in out of the sky, arms up.
            rig.pose("Jump Slam", at: 3.1)
            let u = Float(t / dropTime)
            standToes(at: Float(screen.height) + 60 + (floor - Float(screen.height) - 60) * u * u)
            return
        }
        if let l = leaving, t >= l {
            let u = Float(t - l)
            if u < Float(crouchTime) {
                rig.pose("idle", at: idle, toward: "Jump Slam", at: 6.0 + 0.35 * u / Float(crouchTime), mix: u / 0.08)
                standToes(at: floor)
            } else {
                rig.pose("Jump Slam", at: 6.55)
                let v = min(1, (u - Float(crouchTime)) / Float(leapTime))
                standToes(at: floor + (Float(screen.height) + 500) * pow(v, 1.6))
            }
            return
        }
        if let r = roaring, t >= r {
            // The roar out of his animation, beating his chest.
            rig.pose("idle", at: idle, toward: "Jump Slam", at: 4.6 + Float(t - r), mix: Float(t - r) / 0.15)
            standToes(at: floor)
            return
        }
        let since = Float(t - dropTime)
        let angle = swingAngle(t)
        if since < Float(landTime) {
            // Up out of the landing.
            rig.pose("Jump Slam", at: 3.5 + since, toward: "idle", at: idle, mix: smoothstep((since - 0.25) / 0.5))
        } else {
            rig.pose("idle", at: idle, toward: "Jump Slam", at: 3.62, mix: crouch(t, angle))
        }
        standToes(at: floor)
        guard grabbed != nil else { return }
        let side = lean(t, angle)
        rig.twist(0.35 * side, lean: -0.45 * side)
        let shoulder = rig.shoulderPosition
        arcCentre = SIMD2(shoulder.x, shoulder.y + 0.1 * reach)
        handDepth = shoulder.z + 0.3 * reach
        if let hand = handTarget(t, angle) { rig.reach(to: hand, bend: SIMD3(-1, -0.5, -0.4)) }
    }

    /// Where round his swing his hand is, while he's swinging.
    private func swingAngle(_ t: Double) -> Float? {
        guard let first = swingStarts.first, t >= first, winding.map({ t < $0 }) ?? true else { return nil }
        var angle = top
        for i in swingStarts.indices where t >= swingStarts[i] {
            let d = i == 0 ? firstSwing : swingTime
            let from = i == 0 ? top : (i % 2 == 1 ? left : right)
            let to = i % 2 == 0 ? left : right
            // Slow off the top, fast into the floor.
            angle = from + (to - from) * Float(pow(min(1, (t - swingStarts[i]) / d), 1.8))
        }
        return angle
    }

    /// How far down into the slam he's crouched, 0 to 1: deepest as the
    /// window hits the floor, standing tall to throw it, bent after it.
    private func crouch(_ t: Double, _ angle: Float?) -> Float {
        let deepest: Float = 0.75
        if let angle { return deepest * min(max((1 - sin(angle)) / (1 - sin(left)), 0), 1) }
        guard let w = winding, t >= w else { return 0 }
        if t < w + windTime { return deepest * (1 - Float(easeInOut((t - w) / windTime))) }
        if t < w + windTime + flingTime { return 0.4 * Float((t - w - windTime) / flingTime) }
        return 0.4 * max(0, 1 - Float((t - w - windTime - flingTime) / 0.3))
    }

    /// Which way he leans and turns, -1 to 1, screen left to right: into each
    /// slam, back from the charm and then toward it for the throw.
    private func lean(_ t: Double, _ angle: Float?) -> Float {
        if let angle { return cos(angle) }
        guard let w = winding, t >= w else { return 0 }
        let toward: Float = scenePoint(home()).x > middle ? 1 : -1
        if t < w + windTime { return -0.8 * toward * Float(easeInOut((t - w) / windTime)) }
        if t < w + windTime + flingTime { return toward * (-0.8 + 1.6 * Float((t - w - windTime) / flingTime)) }
        return 0.8 * toward * max(0, 1 - Float((t - w - windTime - flingTime) / 0.3))
    }

    /// Where his right hand is going: up to the window's edge, down with it,
    /// round the arc for each slam, back and over to throw it, then his own.
    private func handTarget(_ t: Double, _ angle: Float?) -> SIMD3<Float>? {
        guard let g = grabbed else { return nil }
        func onArc(_ a: Float) -> SIMD3<Float> {
            SIMD3(arcCentre.x + arcRadius * cos(a), arcCentre.y + arcRadius * sin(a), handDepth)
        }
        if t < g + reachTime {
            return simd_mix(grabFrom, grip, SIMD3(repeating: Float(easeInOut((t - g) / reachTime))))
        }
        if t < g + reachTime + yankTime {
            return simd_mix(grip, onArc(top), SIMD3(repeating: Float(easeInOut((t - g - reachTime) / yankTime))))
        }
        if let r = released, t >= r {
            let u = Float((t - r) / 0.25)
            return u < 1 ? simd_mix(releasedAt, rig.handPosition, SIMD3(repeating: u)) : nil
        }
        if let w = winding, t >= w {
            // Back on the side away from the charm, then hard toward it.
            let toward = simd_normalize(scenePoint(home()) - arcCentre)
            let back = SIMD3(arcCentre.x - toward.x * arcRadius * 0.8, arcCentre.y + arcRadius * 0.55, handDepth)
            let fore = SIMD3(arcCentre.x + toward.x * arcRadius, arcCentre.y + toward.y * arcRadius, handDepth)
            let from = onArc(swings % 2 == 1 ? left : right)
            if t < w + windTime { return simd_mix(from, back, SIMD3(repeating: Float(easeInOut((t - w) / windTime)))) }
            return simd_mix(back, fore, SIMD3(repeating: Float(min(1, (t - w - windTime) / flingTime))))
        }
        return onArc(angle ?? top)
    }

    private func standToes(at y: Float) {
        body.simdPosition.x = middle
        body.simdPosition.y += y - rig.lowestToe
    }

    // MARK: The window

    /// Until he has hold of it the window is flat in its place, and drawn in
    /// 2D like any other stand-in (see `drawBehind`); from then on it's the
    /// sheet, in 3D.
    private func moveWindow(_ t: Double, _ dt: Double) {
        guard let target, let g = grabbed, t >= g + reachTime else { windowNode.geometry = nil; return }
        let hand = SIMD2(rig.handPosition.x, rig.handPosition.y)
        var drawn: [SIMD2<Float>]
        let yank = t - g - reachTime
        if yank < yankTime {
            // Ripped out of its place and down into his fist, shrinking; it
            // comes out from behind him on the way.
            let f = target.frame
            let v = Float(easeInOut(yank / yankTime))
            drawn = (0..<(columns * rows)).map { i in
                let flat = SIMD2(Float(f.minX + f.width * CGFloat(i % columns) / CGFloat(columns - 1)),
                                 Float(screen.height - (f.minY + f.height * CGFloat(i / columns) / CGFloat(rows - 1))))
                return simd_mix(flat, hanging(i, from: hand), SIMD2(repeating: v))
            }
            windowNode.simdPosition.z = v < 0.5 ? -1500 : 1500
        } else {
            windowNode.simdPosition.z = 1500
            let cloth = self.cloth ?? makeCloth(from: hand)
            if released == nil { cloth.hold(grips(hand)) }
            cloth.advance(dt)
            let hits = cloth.landings
            cloth.landings.removeAll()
            // One a swing: the sheet slaps down twice as it lands, and a throw isn't a slam.
            if winding.map({ t < $0 }) ?? true, let hit = hits.max(by: { $0.speed < $1.speed }), hit.speed > 650,
               t - (impacts.last?.time ?? -1) > 0.3 {
                impact(at: CGPoint(x: CGFloat(hit.at.x), y: screen.height - CGFloat(floor)), time: t, size: 100, kick: 110, window: true)
            }
            drawn = cloth.points
            if let r = released, t >= r {
                // Thrown, it shrinks away into the charm as it flies.
                let to = scenePoint(home())
                let s = Float(pow(min(1, (t - r) / flyTime), 1.6))
                drawn = drawn.map { to + ($0 - to) * (1 - s) }
                if t >= r + flyTime { windowNode.geometry = nil; return }
            }
        }
        windowNode.geometry = geometry(drawn)
    }

    /// The sheet's spacing at rest.
    private var spacing: SIMD2<Float> { SIMD2(sheet.x / Float(columns - 1), sheet.y / Float(rows - 1)) }

    /// Where point `i` hangs from his fist, the sheet held out along his
    /// swing's radius: the middle of its left edge in his hand.
    private func hanging(_ i: Int, from hand: SIMD2<Float>) -> SIMD2<Float> {
        let radial = simd_normalize(hand - arcCentre + SIMD2(0, 0.001))
        let down = SIMD2(radial.y, -radial.x)
        let c = Float(i % columns), r = Float(i / columns) - Float(rows / 2)
        return hand + radial * (c * spacing.x) + down * (r * spacing.y)
    }

    private func grips(_ hand: SIMD2<Float>) -> [Int: SIMD2<Float>] {
        let mid = rows / 2
        return Dictionary(uniqueKeysWithValues: [mid - 1, mid, mid + 1].map { r in (r * columns, hanging(r * columns, from: hand)) })
    }

    private func makeCloth(from hand: SIMD2<Float>) -> Cloth {
        let cloth = Cloth(columns: columns, rows: rows, width: sheet.x, height: sheet.y, topLeft: .zero)
        cloth.floor = floor
        cloth.walls = 0...Float(screen.width)
        cloth.place { c, r in self.hanging(r * self.columns + c, from: hand) }
        self.cloth = cloth
        return cloth
    }

    private func geometry(_ points: [SIMD2<Float>]) -> SCNGeometry {
        if uvs == nil {
            uvs = SCNGeometrySource(textureCoordinates: (0..<(columns * rows)).map {
                CGPoint(x: CGFloat($0 % columns) / CGFloat(columns - 1), y: CGFloat($0 / columns) / CGFloat(rows - 1))
            })
            var index: [UInt16] = []
            for r in 0..<(rows - 1) {
                for c in 0..<(columns - 1) {
                    let a = UInt16(r * columns + c), b = a + 1, d = a + UInt16(columns), e = d + 1
                    index += [a, d, b, b, d, e]
                }
            }
            faces = SCNGeometryElement(indices: index, primitiveType: .triangles)
        }
        let vertices = SCNGeometrySource(vertices: points.map { SCNVector3(CGFloat($0.x), CGFloat($0.y), 0) })
        let g = SCNGeometry(sources: [vertices, uvs!], elements: [faces!])
        g.materials = [material]
        return g
    }

    private func scenePoint(_ p: CGPoint) -> SIMD2<Float> { SIMD2(Float(p.x), Float(screen.height - p.y)) }

    // MARK: Drawing

    private func shake(_ t: Double) -> CGVector {
        var v = CGVector.zero
        for (i, impact) in impacts.enumerated() where t >= impact.time && t - impact.time < 0.4 {
            let u = t - impact.time
            let a = (i == 0 ? 13 : 9) * exp(-u / 0.09)
            v.dx += CGFloat(a * sin(u * 80))
            v.dy += CGFloat(a * cos(u * 63))
        }
        return v
    }

    private var floorLine: CGFloat { screen.height - CGFloat(floor) }

    /// The window in its place until he has it, the cracks he leaves in the
    /// floor, and his shadow on it.
    private func drawBehind(_ ctx: inout GraphicsContext, _ t: Double) {
        var c = ctx
        c.translateBy(x: shaken.dx, y: shaken.dy)
        if failed == nil, grabbed.map({ t < $0 + reachTime }) ?? true, let target, let takedown, let image = takedown.standIn {
            // Held still while the real window might still be under it.
            var w = gone == nil ? ctx : c
            StandIn.draw(&w, image, in: target.frame, fade: takedown.cover(t))
        }
        let fade = leaving.map { max(0, 1 - (t - $0) / (crouchTime + leapTime)) } ?? 1
        var k = c
        k.clip(to: Path(CGRect(x: -40, y: -40, width: screen.width + 80, height: floorLine + 40)))
        for impact in impacts where t >= impact.time {
            // Racing out from where it landed.
            let r = max(1, impact.reach * CGFloat(easeOutCubic((t - impact.time) / 0.15)))
            var m = k
            m.clip(to: Path(ellipseIn: CGRect(x: impact.at.x - r, y: impact.at.y - r, width: 2 * r, height: 2 * r)))
            ConcreteArt.stroke(&m, impact.cracks, fade: fade)
        }
        let height = CGFloat(rig.lowestToe - floor)
        let near = max(0, 1 - height / 300)
        guard near > 0 else { return }
        var s = c
        let w = CGFloat(tall) * 0.36 * (0.6 + 0.4 * near)
        s.translateBy(x: CGFloat(middle), y: floorLine)
        s.scaleBy(x: 1, y: 0.14)
        s.fill(Path(ellipseIn: CGRect(x: -w, y: -w, width: 2 * w, height: 2 * w)),
               with: .radialGradient(Gradient(colors: [.black.opacity(0.4 * Double(near)), .black.opacity(0)]),
                                     center: .zero, startRadius: 0, endRadius: w))
    }

    /// Dust and concrete thrown up by each landing, and the burst as the
    /// window goes into the charm.
    private func drawFront(_ ctx: inout GraphicsContext, _ t: Double) {
        var c = ctx
        c.translateBy(x: shaken.dx, y: shaken.dy)
        let dust = Color(red: 0.72, green: 0.68, blue: 0.62)
        for impact in impacts where t >= impact.time && t - impact.time < 1.2 {
            let since = t - impact.time
            if since < 0.7 {
                let u = since / 0.7
                let e = CGFloat(easeOutCubic(u))
                let size = impact.reach / 2.6
                for n in 0..<9 {
                    let a = Double.pi * (1.02 + 0.96 * Double(n) / 8)
                    let p = impact.at + CGVector(dx: cos(a), dy: sin(a) * 0.6) * (size * (0.1 + 0.9 * e))
                    let r = size * (0.16 + 0.42 * e)
                    c.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                           with: .radialGradient(Gradient(colors: [dust.opacity(0.7 * pow(1 - u, 1.4)), dust.opacity(0)]),
                                                 center: p, startRadius: 0, endRadius: r))
                }
            }
            guard let concrete else { continue }
            var k = c
            k.clip(to: Path(CGRect(x: -40, y: -400, width: screen.width + 80, height: floorLine + 400)))
            k.opacity = since < 0.9 ? 1 : 1 - (since - 0.9) / 0.3
            for chunk in impact.chunks {
                let p = Crater.position(of: chunk, after: since)
                guard p.y < floorLine + 20 else { continue }
                ConcreteArt.draw(&k, chunk, at: p, turned: chunk.spin * since, concrete: concrete)
            }
        }
        if let a = arrived, t - a < puffTime { drawBurst(&c, at: home(), (t - a) / puffTime) }
    }

    /// A ring and rays of gamma green as the window goes into the charm.
    /// The charm hangs over this overlay, so it bursts out from behind it.
    private func drawBurst(_ ctx: inout GraphicsContext, at p: CGPoint, _ u: Double) {
        let green = Color(red: 0.55, green: 0.95, blue: 0.35)
        let e = CGFloat(easeOutCubic(u))
        let fade = CGFloat(1 - u)
        let r = homeRadius * (0.7 + 0.55 * e)
        ctx.stroke(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                   with: .color(green.opacity(0.85 * Double(fade))), lineWidth: 3 * fade + 0.5)
        var rays = Path()
        for i in 0..<12 {
            let a = Double(i) / 12 * 2 * .pi + 0.15
            let d = CGVector(dx: cos(a), dy: sin(a))
            rays.move(to: p + d * (r + 10))
            rays.addLine(to: p + d * (r + 18 + 26 * e))
        }
        ctx.stroke(rays, with: .color(green.opacity(0.9 * Double(fade))), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
    }

    /// The stand-in at `size`, with cracks drawn into it so they bend with the
    /// sheet: each its rays, and its rings only near the middle.
    private static func cracked(_ image: CGImage, _ webs: [CrackWeb], size: CGSize) -> CGContext? {
        let w = Int(size.width), h = Int(size.height)
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        // The webs are in image pixels, y down; the context is y up.
        ctx.translateBy(x: 0, y: CGFloat(h))
        ctx.scaleBy(x: 1, y: -1)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
        let unit = max(CGFloat(w), CGFloat(h)) / 900
        for web in webs {
            let path = CGMutablePath()
            for ray in web.rays {
                path.move(to: ray[0])
                for p in ray.dropFirst() { path.addLine(to: p) }
            }
            for (j, k) in web.rings where k <= 3 {
                path.move(to: web.rays[j][k])
                path.addLine(to: web.rays[(j + 1) % web.rays.count][k])
            }
            ctx.addPath(path)
            ctx.setStrokeColor(CGColor(gray: 0.1, alpha: 0.6))
            ctx.setLineWidth(2.6 * unit)
            ctx.strokePath()
            ctx.saveGState()
            ctx.translateBy(x: unit, y: unit)
            ctx.addPath(path)
            ctx.setStrokeColor(CGColor(gray: 1, alpha: 0.8))
            ctx.setLineWidth(1.1 * unit)
            ctx.strokePath()
            ctx.restoreGState()
        }
        return ctx
    }

    private func easeInOut(_ x: Double) -> Double {
        let x = min(max(x, 0), 1)
        return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
    }

    private func smoothstep(_ x: Float) -> Float {
        let x = min(max(x, 0), 1)
        return x * x * (3 - 2 * x)
    }
}

// MARK: Overlay

struct HulkSlamView: View {
    let slam: HulkSlam?

    var body: some View {
        if let slam {
            TimelineView(.animation) { timeline in
                ZStack {
                    Canvas { ctx, _ in slam.renderBehind(&ctx, at: timeline.date) }
                    SceneLayer(scene: slam.scene, camera: slam.camera, device: slam.device)
                    Canvas { ctx, _ in slam.render(&ctx, at: timeline.date) }
                }
            }
        }
    }
}

/// SceneKit's view, see-through, so only the Hulk and the window show.
private struct SceneLayer: NSViewRepresentable {
    let scene: SCNScene
    let camera: SCNNode
    let device: MTLDevice?

    func makeNSView(context: Context) -> SCNView {
        var options: [String: Any] = [SCNView.Option.preferredRenderingAPI.rawValue: SCNRenderingAPI.metal.rawValue]
        if let device { options[SCNView.Option.preferredDevice.rawValue] = device }
        let view = SCNView(frame: .zero, options: options)
        view.backgroundColor = .clear
        view.antialiasingMode = .multisampling4X
        view.preferredFramesPerSecond = NSScreen.main?.maximumFramesPerSecond ?? 60
        view.rendersContinuously = true
        view.isPlaying = true
        view.wantsLayer = true
        view.layer?.isOpaque = false
        updateNSView(view, context: context)
        return view
    }

    func updateNSView(_ view: SCNView, context: Context) {
        if view.scene !== scene { view.scene = scene }
        if view.pointOfView !== camera { view.pointOfView = camera }
    }
}
