import Foundation

/// A daily JSON backup in the export format (`plain-week-YYYY-MM-DD.json`) in
/// the app's Application Support folder, keeping the last 14 days.
enum Backups {
    static let enabledKey = "dailyBackups"
    static let keep = 14

    static var enabled: Bool { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }

    static func folder() -> URL? {
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = support.appendingPathComponent("Plain Week/Backups", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func fileName(_ day: String) -> String { "plain-week-\(day).json" }

    /// Writes today's backup once (when there are tasks) and prunes old ones.
    @discardableResult
    static func runIfNeeded(store: TaskStore, today: String, folder: URL? = Backups.folder(),
                            appVersion: String = DataTransfer.appVersion, force: Bool = false) -> URL? {
        guard force || enabled, let folder else { return nil }
        let url = folder.appendingPathComponent(fileName(today))
        guard force || !FileManager.default.fileExists(atPath: url.path) else { return nil }
        let file = store.exportFile(appVersion: appVersion)
        guard !file.tasks.isEmpty else { return nil }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(file), (try? data.write(to: url, options: .atomic)) != nil else { return nil }
        prune(folder)
        return url
    }

    /// Keeps the newest `keep` backups (names sort by date).
    static func prune(_ folder: URL) {
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        let backups = files.filter { $0.lastPathComponent.hasPrefix("plain-week-") && $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent > $1.lastPathComponent }
        for old in backups.dropFirst(keep) { try? FileManager.default.removeItem(at: old) }
    }
}
