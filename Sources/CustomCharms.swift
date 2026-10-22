import AppKit
import ImageIO
import UniformTypeIdentifiers

// MARK: - Powers
//
// Each power is a pair of effects, one for a double-click and one for being
// thrown about hard. The built-in charms have their own hero's pair; a custom
// charm can take any hero's double-click and any hero's shake.

enum Power: String, Codable, CaseIterable {
    case spiderMan, batman, hulk

    var doubleClickTitle: String {
        switch self {
        case .spiderMan: "Spider-Man: web yank"
        case .batman: "Batman: grapple tow"
        case .hulk: "Hulk: window smash"
        }
    }

    var shakeTitle: String {
        switch self {
        case .spiderMan: "Spider-Man: web blast"
        case .batman: "Batman: bat swarm"
        case .hulk: "Hulk: wall smash"
        }
    }
}

/// What a charm does when double-clicked and when thrown about hard.
struct CharmPowers {
    var doubleClick: Power?
    var shake: Power?

    var any: Bool { doubleClick != nil || shake != nil }
    func uses(_ p: Power) -> Bool { doubleClick == p || shake == p }

    static func of(_ charm: String) -> CharmPowers {
        if let c = CustomCharms.shared.charm(charm) { return CharmPowers(doubleClick: c.doubleClick, shake: c.shake) }
        let own: Power? = WebHands.supports(charm) ? .spiderMan
            : BatGear.supports(charm) ? .batman
            : HulkGear.supports(charm) ? .hulk : nil
        return CharmPowers(doubleClick: own, shake: own)
    }
}

// MARK: - Custom charms

/// A charm made from the user's own picture.
struct CustomCharm: Codable {
    let id: String
    var name: String
    var doubleClick: Power?
    var shake: Power?
    var attachX: Double
    var attachY: Double

    /// Its name among the charms, kept apart from the built-ins' file names.
    var key: String { "custom-\(id)" }
    var attach: CGPoint { CGPoint(x: attachX, y: attachY) }
}

/// The user's charms: a sticker PNG apiece and a list of them, in
/// ~/Library/Application Support/DeskCharm/Charms.
final class CustomCharms {
    static let shared = CustomCharms()

    private(set) var all: [CustomCharm] = []
    private let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("DeskCharm/Charms", isDirectory: true)
    private var list: URL { folder.appendingPathComponent("charms.json") }

    private init() {
        if let data = try? Data(contentsOf: list),
           let saved = try? JSONDecoder().decode([CustomCharm].self, from: data) {
            all = saved
        }
    }

    func charm(_ key: String) -> CustomCharm? { all.first { $0.key == key } }
    func imageURL(_ c: CustomCharm) -> URL { folder.appendingPathComponent("\(c.id).png") }

    func add(_ image: CGImage, name: String, attach: CGPoint, doubleClick: Power?, shake: Power?) throws -> CustomCharm {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let c = CustomCharm(id: UUID().uuidString, name: name, doubleClick: doubleClick, shake: shake,
                            attachX: Double(attach.x), attachY: Double(attach.y))
        guard let out = CGImageDestinationCreateWithURL(imageURL(c) as CFURL, UTType.png.identifier as CFString, 1, nil)
        else { throw CocoaError(.fileWriteUnknown) }
        CGImageDestinationAddImage(out, image, nil)
        guard CGImageDestinationFinalize(out) else { throw CocoaError(.fileWriteUnknown) }
        all.append(c)
        try save()
        return c
    }

    func update(_ key: String, _ change: (inout CustomCharm) -> Void) {
        guard let i = all.firstIndex(where: { $0.key == key }) else { return }
        change(&all[i])
        try? save()
    }

    func remove(_ key: String) {
        guard let c = charm(key) else { return }
        try? FileManager.default.removeItem(at: imageURL(c))
        all.removeAll { $0.key == key }
        try? save()
    }

    private func save() throws {
        try JSONEncoder().encode(all).write(to: list, options: .atomic)
    }
}
