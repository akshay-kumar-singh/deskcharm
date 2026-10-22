import AppKit
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Making a custom charm
//
// A small window from the menu bar: pick or drop a picture, see it made into a
// sticker, name it and give it a power for a double-click and one for a shake.

final class CharmMakerModel: ObservableObject {
    @Published private(set) var sticker: Sticker.Made?
    @Published private(set) var working = false
    @Published private(set) var source: URL?
    @Published var failure: String?
    @Published var cutOut = true { didSet { remake() } }
    @Published var name = ""
    @Published var doubleClick: Power? = .spiderMan
    @Published var shake: Power? = .batman

    private var generation = 0

    func load(_ url: URL) {
        source = url
        name = url.deletingPathExtension().lastPathComponent
        remake()
    }

    /// Made off the main thread; a newer picture or setting outdates a
    /// sticker still being made.
    private func remake() {
        guard let source else { return }
        generation += 1
        let g = generation, cut = cutOut
        working = true
        failure = nil
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let made = Result { try Sticker.make(from: source, cutOut: cut) }
            DispatchQueue.main.async { [weak self] in
                guard let self, g == self.generation else { return }
                self.working = false
                switch made {
                case .success(let s):
                    self.sticker = s
                    if cut && !s.cutOut { self.failure = "No subject found to cut out, so the whole picture is used." }
                case .failure(let e):
                    self.sticker = nil
                    self.failure = e.localizedDescription
                }
            }
        }
    }
}

struct CharmMakerView: View {
    @ObservedObject var model: CharmMakerModel
    var onCancel: () -> Void
    var onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            preview
            HStack {
                Button(model.source == nil ? "Choose Image…" : "Choose Another…", action: choose)
                Spacer()
                Toggle("Cut out the subject", isOn: $model.cutOut)
            }
            if let failure = model.failure {
                Text(failure).font(.callout).foregroundStyle(.secondary)
            }
            Form {
                TextField("Name", text: $model.name)
                Picker("On double-click", selection: $model.doubleClick) {
                    Text("Nothing").tag(Power?.none)
                    ForEach(Power.allCases, id: \.self) { Text($0.doubleClickTitle).tag(Power?.some($0)) }
                }
                Picker("On shake", selection: $model.shake) {
                    Text("Nothing").tag(Power?.none)
                    ForEach(Power.allCases, id: \.self) { Text($0.shakeTitle).tag(Power?.some($0)) }
                }
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel).keyboardShortcut(.cancelAction)
                Button("Add Charm", action: onAdd)
                    .keyboardShortcut(.defaultAction)
                    .disabled(model.sticker == nil || model.working)
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.secondary.opacity(0.12))
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.secondary.opacity(0.4), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
            if let sticker = model.sticker {
                Image(decorative: sticker.image, scale: 1)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .shadow(color: .black.opacity(0.3), radius: 8, y: 5)
                    .padding(24)
                    .opacity(model.working ? 0.4 : 1)
            } else if !model.working {
                VStack(spacing: 6) {
                    Image(systemName: "photo.badge.plus").font(.system(size: 30))
                    Text("Drop a picture here, or choose one")
                }
                .foregroundStyle(.secondary)
            }
            if model.working { ProgressView() }
        }
        .frame(height: 280)
        .dropDestination(for: URL.self) { urls, _ in
            guard let url = urls.first else { return false }
            model.load(url)
            return true
        }
    }

    private func choose() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url { model.load(url) }
    }
}
