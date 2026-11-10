import Foundation
import Observation

/// Sync between Macs through a folder the user picks, typically in iCloud
/// Drive. Every Mac writes its own file (`plain-week-sync-<device>.json`, all
/// rows with tombstones, so files never conflict) and merges the others' with
/// last-write-wins. Works without a developer team; CloudKit can replace the
/// transport later with the same merge.
@MainActor
@Observable
final class FolderSync {
    static let bookmarkKey = "syncFolderBookmark"
    static let deviceKey = "syncDeviceId"
    static let prefix = "plain-week-sync-"

    @ObservationIgnored private let store: TaskStore
    @ObservationIgnored private var pending: DispatchWorkItem?
    @ObservationIgnored private var timer: Timer?
    private(set) var lastSync: Date?
    /// The folder's path, for Settings (nil when sync is off).
    private(set) var folderPath: String?

    init(store: TaskStore) {
        self.store = store
        folderPath = folderURL?.path
    }

    static var deviceId: String {
        if let id = UserDefaults.standard.string(forKey: deviceKey) { return id }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: deviceKey)
        return id
    }

    var isEnabled: Bool { folderPath != nil }

    /// The chosen folder, from its security-scoped bookmark.
    var folderURL: URL? {
        guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else { return nil }
        var stale = false
        let url = try? URL(resolvingBookmarkData: data, options: [.withSecurityScope], relativeTo: nil, bookmarkDataIsStale: &stale)
        if stale, let url, let fresh = try? url.bookmarkData(options: [.withSecurityScope], includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(fresh, forKey: Self.bookmarkKey)
        }
        return url
    }

    /// Remembers `url` (from an open panel) and syncs at once.
    func choose(_ url: URL) throws {
        let data = try url.bookmarkData(options: [.withSecurityScope], includingResourceValuesForKeys: nil, relativeTo: nil)
        UserDefaults.standard.set(data, forKey: Self.bookmarkKey)
        folderPath = url.path
        start()
        syncNow()
    }

    func stop() {
        UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
        timer?.invalidate()
        timer = nil
        folderPath = nil
        lastSync = nil
    }

    /// Pulls every 30 seconds and when the app becomes active.
    func start() {
        guard isEnabled, timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.syncNow() }
        }
    }

    /// After local changes: write soon (debounced).
    func scheduleSoon() {
        guard isEnabled else { return }
        pending?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.syncNow() }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }

    func syncNow() {
        guard let folder = folderURL else { return }
        let scoped = folder.startAccessingSecurityScopedResource()
        defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
        Self.sync(store: store, folder: folder, device: Self.deviceId)
        lastSync = Date()
    }

    /// Merges the other devices' files into `store`, then writes this device's.
    /// Returns how many rows changed here.
    @discardableResult
    static func sync(store: TaskStore, folder: URL, device: String) -> Int {
        let fm = FileManager.default
        let own = prefix + device + ".json"
        var changed = 0
        let names = (try? fm.contentsOfDirectory(atPath: folder.path)) ?? []
        for name in names {
            // iCloud Drive keeps not-yet-downloaded files as ".name.icloud".
            if name.hasPrefix("." + prefix), name.hasSuffix(".icloud") {
                let real = String(name.dropFirst().dropLast(".icloud".count))
                try? fm.startDownloadingUbiquitousItem(at: folder.appendingPathComponent(real))
                continue
            }
            guard name.hasPrefix(prefix), name.hasSuffix(".json"), name != own,
                  let data = try? Data(contentsOf: folder.appendingPathComponent(name)),
                  let rows = try? JSONDecoder().decode([PlainTask].self, from: data) else { continue }
            changed += store.merge(rows)
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        if let data = try? encoder.encode(store.allRows) {
            try? data.write(to: folder.appendingPathComponent(own), options: .atomic)
        }
        return changed
    }
}
