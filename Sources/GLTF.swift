import SceneKit
import simd

// MARK: - glTF
//
// Just enough of glTF 2.0 to bring in one skinned, textured character from a
// .glb: its node tree, its mesh and skin, and its animations as keyframes to
// sample by hand. SceneKit reads USD but not glTF.

struct GLTFModel {
    struct Clip {
        enum Path { case translation, rotation, scale }

        struct Channel {
            let node: Int
            let path: Path
            let times: [Float]
            let values: [SIMD4<Float>]
        }

        let duration: Float
        let channels: [Channel]
    }

    let root: SCNNode
    let nodes: [SCNNode]                // by glTF index
    let names: [String: Int]
    let mesh: SCNNode
    let clips: [String: Clip]

    /// `texture` stands in for the file's own base colour texture.
    init?(url: URL, texture: CGImage? = nil) {
        guard let data = try? Data(contentsOf: url), data.count > 20,
              let json = Self.chunk(data, at: 12), json.type == 0x4E4F_534A,
              let doc = try? JSONSerialization.jsonObject(with: json.body) as? [String: Any],
              let bin = Self.chunk(data, at: 20 + json.body.count), bin.type == 0x004E_4942
        else { return nil }
        let reader = Reader(doc: doc, bin: bin.body)
        let specs = doc["nodes"] as? [[String: Any]] ?? []

        let nodes = specs.map { spec -> SCNNode in
            let node = SCNNode()
            node.name = spec["name"] as? String
            if let m = spec["matrix"] as? [Double], m.count == 16 {
                node.simdTransform = float4x4(columns: (SIMD4(m[0...3].map(Float.init)), SIMD4(m[4...7].map(Float.init)),
                                                        SIMD4(m[8...11].map(Float.init)), SIMD4(m[12...15].map(Float.init))))
            } else {
                if let t = spec["translation"] as? [Double] { node.simdPosition = SIMD3(t.map(Float.init)) }
                if let r = spec["rotation"] as? [Double] { node.simdOrientation = simd_quatf(vector: SIMD4(r.map(Float.init))) }
                if let s = spec["scale"] as? [Double] { node.simdScale = SIMD3(s.map(Float.init)) }
            }
            return node
        }
        for (i, spec) in specs.enumerated() {
            for child in spec["children"] as? [Int] ?? [] { nodes[i].addChildNode(nodes[child]) }
        }
        self.nodes = nodes
        names = Dictionary(specs.enumerated().compactMap { i, s in (s["name"] as? String).map { ($0, i) } }) { a, _ in a }
        root = SCNNode()
        let scene = (doc["scenes"] as? [[String: Any]])?.first?["nodes"] as? [Int] ?? []
        for i in scene { root.addChildNode(nodes[i]) }

        guard let meshIndex = specs.firstIndex(where: { $0["mesh"] != nil && $0["skin"] != nil }),
              let meshSpec = (doc["meshes"] as? [[String: Any]])?[specs[meshIndex]["mesh"] as? Int ?? 0],
              let primitive = (meshSpec["primitives"] as? [[String: Any]])?.first,
              let attributes = primitive["attributes"] as? [String: Int],
              let position = attributes["POSITION"], let indices = primitive["indices"] as? Int,
              let skin = (doc["skins"] as? [[String: Any]])?[specs[meshIndex]["skin"] as? Int ?? 0],
              let joints = skin["joints"] as? [Int]
        else { return nil }
        let mesh = nodes[meshIndex]
        self.mesh = mesh

        let count = reader.count(position)
        var sources = [Self.source(reader.floats(position), .vertex, 3)]
        if let n = attributes["NORMAL"] { sources.append(Self.source(reader.floats(n), .normal, 3)) }
        if let uv = attributes["TEXCOORD_0"] { sources.append(Self.source(reader.floats(uv), .texcoord, 2)) }
        let index = reader.ints(indices).map(UInt32.init)
        let element = SCNGeometryElement(data: index.withUnsafeBufferPointer { Data(buffer: $0) },
                                         primitiveType: .triangles, primitiveCount: index.count / 3, bytesPerIndex: 4)
        let geometry = SCNGeometry(sources: sources, elements: [element])
        let material = SCNMaterial()
        material.diffuse.contents = texture ?? reader.image(doc, primitive["material"] as? Int)
        material.lightingModel = .physicallyBased
        material.roughness.contents = 0.75
        material.metalness.contents = 0.0
        geometry.materials = [material]

        let weights = Self.source(reader.floats(attributes["WEIGHTS_0"] ?? 0), .boneWeights, 4)
        let boneIndex = reader.ints(attributes["JOINTS_0"] ?? 0).map(UInt16.init)
        let boneIndices = SCNGeometrySource(data: boneIndex.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .boneIndices,
                                            vectorCount: count, usesFloatComponents: false, componentsPerVector: 4,
                                            bytesPerComponent: 2, dataOffset: 0, dataStride: 8)
        let inverse = reader.floats(skin["inverseBindMatrices"] as? Int ?? 0)
        let binds = joints.indices.map { j -> NSValue in
            let m = Array(inverse[(j * 16)..<(j * 16 + 16)])
            let f = float4x4(columns: (SIMD4(m[0...3]), SIMD4(m[4...7]), SIMD4(m[8...11]), SIMD4(m[12...15])))
            return NSValue(scnMatrix4: SCNMatrix4(f))
        }
        let skinner = SCNSkinner(baseGeometry: geometry, bones: joints.map { nodes[$0] }, boneInverseBindTransforms: binds,
                                 boneWeights: weights, boneIndices: boneIndices)
        mesh.geometry = geometry
        mesh.skinner = skinner

        var clips: [String: Clip] = [:]
        for animation in doc["animations"] as? [[String: Any]] ?? [] {
            let samplers = animation["samplers"] as? [[String: Any]] ?? []
            var channels: [Clip.Channel] = []
            for channel in animation["channels"] as? [[String: Any]] ?? [] {
                guard let target = channel["target"] as? [String: Any], let node = target["node"] as? Int,
                      let sampler = channel["sampler"] as? Int, sampler < samplers.count,
                      let input = samplers[sampler]["input"] as? Int, let output = samplers[sampler]["output"] as? Int
                else { continue }
                let path: Clip.Path
                switch target["path"] as? String {
                case "translation": path = .translation
                case "rotation": path = .rotation
                case "scale": path = .scale
                default: continue
                }
                let width = path == .rotation ? 4 : 3
                let flat = reader.floats(output)
                let values = stride(from: 0, to: flat.count - width + 1, by: width).map { k in
                    SIMD4(flat[k], flat[k + 1], flat[k + 2], width == 4 ? flat[k + 3] : 0)
                }
                channels.append(Clip.Channel(node: node, path: path, times: reader.floats(input), values: values))
            }
            let duration = channels.compactMap(\.times.last).max() ?? 0
            clips[animation["name"] as? String ?? "\(clips.count)"] = Clip(duration: duration, channels: channels)
        }
        self.clips = clips
    }

    /// Poses the skeleton as `clip` has it `t` seconds in.
    func pose(_ clip: Clip, at t: Float) {
        for c in clip.channels where !c.times.isEmpty { set(c, Self.sample(c, at: t)) }
    }

    /// Poses the skeleton part way between two of its poses: `a` at `ta`,
    /// mixed toward `b` at `tb` by `w`, 0 to 1.
    func pose(_ a: Clip, at ta: Float, _ b: Clip, at tb: Float, mix w: Float) {
        var others: [Int: SIMD4<Float>] = [:]
        for c in b.channels where !c.times.isEmpty { others[Self.key(c)] = Self.sample(c, at: tb) }
        for c in a.channels where !c.times.isEmpty {
            var v = Self.sample(c, at: ta)
            if let u = others[Self.key(c)] {
                v = c.path == .rotation ? simd_slerp(simd_quatf(vector: v), simd_quatf(vector: u), w).vector
                                        : simd_mix(v, u, SIMD4(repeating: w))
            }
            set(c, v)
        }
    }

    private func set(_ c: Clip.Channel, _ v: SIMD4<Float>) {
        let node = nodes[c.node]
        switch c.path {
        case .translation: node.simdPosition = v[SIMD3(0, 1, 2)]
        case .scale: node.simdScale = v[SIMD3(0, 1, 2)]
        case .rotation: node.simdOrientation = simd_quatf(vector: v)
        }
    }

    private static func key(_ c: Clip.Channel) -> Int {
        switch c.path {
        case .translation: return c.node * 3
        case .rotation: return c.node * 3 + 1
        case .scale: return c.node * 3 + 2
        }
    }

    private static func sample(_ c: Clip.Channel, at t: Float) -> SIMD4<Float> {
        let t = min(max(t, c.times[0]), c.times[c.times.count - 1])
        var lo = 0, hi = c.times.count - 1
        while hi - lo > 1 {
            let mid = (lo + hi) / 2
            if c.times[mid] <= t { lo = mid } else { hi = mid }
        }
        let span = c.times[hi] - c.times[lo]
        let u = span > 0 ? (t - c.times[lo]) / span : 0
        let a = c.values[lo], b = c.values[hi]
        return c.path == .rotation ? simd_slerp(simd_quatf(vector: a), simd_quatf(vector: b), u).vector
                                   : simd_mix(a, b, SIMD4(repeating: u))
    }

    // MARK: Reading

    private static func chunk(_ data: Data, at offset: Int) -> (type: UInt32, body: Data)? {
        guard offset + 8 <= data.count else { return nil }
        let length = Int(data.loadLE(offset)), type = data.loadLE(offset + 4)
        guard offset + 8 + length <= data.count else { return nil }
        return (type, data.subdata(in: (offset + 8)..<(offset + 8 + length)))
    }

    private static func source(_ floats: [Float], _ semantic: SCNGeometrySource.Semantic, _ width: Int) -> SCNGeometrySource {
        SCNGeometrySource(data: floats.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: semantic,
                          vectorCount: floats.count / width, usesFloatComponents: true, componentsPerVector: width,
                          bytesPerComponent: 4, dataOffset: 0, dataStride: width * 4)
    }

    private struct Reader {
        let bin: Data
        private let accessors: [[String: Any]]
        private let views: [[String: Any]]

        /// The tables are bridged once here: bridging them on every read took
        /// the better part of a second over the animations' few hundred channels.
        init(doc: [String: Any], bin: Data) {
            self.bin = bin
            accessors = doc["accessors"] as? [[String: Any]] ?? []
            views = doc["bufferViews"] as? [[String: Any]] ?? []
        }

        private func accessor(_ i: Int) -> (data: Data, start: Int, stride: Int, count: Int, width: Int, kind: Int, normalized: Bool) {
            let a = accessors[i]
            let width = ["SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16][a["type"] as? String ?? ""] ?? 1
            let kind = a["componentType"] as? Int ?? 5126
            let size = [5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4][kind] ?? 4
            let view = views[a["bufferView"] as? Int ?? 0]
            let start = (view["byteOffset"] as? Int ?? 0) + (a["byteOffset"] as? Int ?? 0)
            return (bin, start, view["byteStride"] as? Int ?? width * size, a["count"] as? Int ?? 0, width, kind,
                    a["normalized"] as? Bool ?? false)
        }

        func count(_ i: Int) -> Int { accessor(i).count }

        func floats(_ i: Int) -> [Float] {
            let a = accessor(i)
            let n = a.count * a.width
            var out = [Float](repeating: 0, count: n)
            a.data.withUnsafeBytes { raw in
                for e in 0..<a.count {
                    let at = a.start + e * a.stride
                    for k in 0..<a.width {
                        switch a.kind {
                        case 5126: out[e * a.width + k] = raw.loadUnaligned(fromByteOffset: at + k * 4, as: Float.self)
                        case 5121: out[e * a.width + k] = Float(raw[at + k]) / (a.normalized ? 255 : 1)
                        case 5123: out[e * a.width + k] = Float(raw.loadUnaligned(fromByteOffset: at + k * 2, as: UInt16.self)) / (a.normalized ? 65535 : 1)
                        default: break
                        }
                    }
                }
            }
            return out
        }

        func ints(_ i: Int) -> [Int] {
            let a = accessor(i)
            var out = [Int](repeating: 0, count: a.count * a.width)
            a.data.withUnsafeBytes { raw in
                for e in 0..<a.count {
                    let at = a.start + e * a.stride
                    for k in 0..<a.width {
                        switch a.kind {
                        case 5121: out[e * a.width + k] = Int(raw[at + k])
                        case 5123: out[e * a.width + k] = Int(raw.loadUnaligned(fromByteOffset: at + k * 2, as: UInt16.self))
                        case 5125: out[e * a.width + k] = Int(raw.loadUnaligned(fromByteOffset: at + k * 4, as: UInt32.self))
                        default: break
                        }
                    }
                }
            }
            return out
        }

        func image(_ doc: [String: Any], _ material: Int?) -> NSImage? {
            guard let material, let mats = doc["materials"] as? [[String: Any]], material < mats.count,
                  let pbr = mats[material]["pbrMetallicRoughness"] as? [String: Any],
                  let texture = (pbr["baseColorTexture"] as? [String: Any])?["index"] as? Int,
                  let source = (doc["textures"] as? [[String: Any]])?[texture]["source"] as? Int,
                  let view = (doc["images"] as? [[String: Any]])?[source]["bufferView"] as? Int, view < views.count
            else { return nil }
            let start = views[view]["byteOffset"] as? Int ?? 0
            return NSImage(data: bin.subdata(in: start..<(start + (views[view]["byteLength"] as? Int ?? 0))))
        }
    }
}

private extension Data {
    func loadLE(_ offset: Int) -> UInt32 {
        withUnsafeBytes { UInt32(littleEndian: $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self)) }
    }
}
