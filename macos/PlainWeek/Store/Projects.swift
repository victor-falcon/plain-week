import Foundation
import Observation

/// A project: a name and a color that tasks can belong to (one each, at
/// most). The planner shows every task, or one project's own week, Backlog
/// and Done. macOS app only; saved as `projects.json` next to the tasks and
/// synced between Macs like them (rows with tombstones, last write wins).
struct Project: Codable, Hashable, Identifiable {
    var id: String
    var name: String
    var color: TaskColor
    /// Fractional index: the order in the sidebar.
    var position: String
    var created_at: String
    var updated_at: String
    var deleted_at: String?

    var isDeleted: Bool { deleted_at != nil }
}

@Observable
final class ProjectStore {
    private var rows: [String: Project] = [:]
    @ObservationIgnored private let fileURL: URL?
    /// Called after every save (the Mac-to-Mac sync follows).
    @ObservationIgnored var onSave: (() -> Void)?

    init(fileURL: URL?) {
        self.fileURL = fileURL
        if let fileURL, let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([Project].self, from: data) {
            rows = Dictionary(saved.map { ($0.id, $0) }, uniquingKeysWith: { a, b in a.updated_at >= b.updated_at ? a : b })
        }
    }

    /// Live projects in sidebar order.
    var projects: [Project] {
        rows.values.filter { !$0.isDeleted }.sorted { ($0.position, $0.id) < ($1.position, $1.id) }
    }

    /// Every row, tombstones included (what a Mac writes for the others).
    var allRows: [Project] { rows.values.sorted { $0.id < $1.id } }

    /// A live project, or nil (unknown or deleted).
    func project(_ id: String?) -> Project? {
        guard let id, let row = rows[id], !row.isDeleted else { return nil }
        return row
    }

    /// Names are unique, ignoring case.
    func named(_ name: String) -> Project? {
        let key = Self.clean(name).lowercased()
        return projects.first { $0.name.lowercased() == key }
    }

    static func clean(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).split(whereSeparator: \.isNewline).joined(separator: " ")
    }

    // MARK: Changes

    /// Adds a project at the end (or returns the one with that name).
    @discardableResult
    func create(name: String, color: TaskColor = .none) -> String? {
        let name = Self.clean(name)
        guard !name.isEmpty else { return nil }
        if let existing = named(name) { return existing.id }
        let now = Clock.nextTimestamp()
        let project = Project(id: Clock.uuidV7(), name: String(name.prefix(80)), color: color,
                              position: FractionalIndex.positionBetween(projects.last?.position, nil),
                              created_at: now, updated_at: now)
        write(project)
        return project.id
    }

    /// The project with this name, created if needed (zistemo's projects).
    func findOrCreate(_ name: String) -> String? {
        named(name)?.id ?? create(name: name)
    }

    /// Returns false when the name is empty or taken by another project.
    @discardableResult
    func rename(_ id: String, to name: String) -> Bool {
        let name = Self.clean(name)
        guard var project = project(id), !name.isEmpty else { return false }
        if let other = named(name), other.id != id { return false }
        guard project.name != name else { return true }
        project.name = String(name.prefix(80))
        project.updated_at = Clock.nextTimestamp()
        write(project)
        return true
    }

    func setColor(_ id: String, _ color: TaskColor) {
        guard var project = project(id), project.color != color else { return }
        project.color = color
        project.updated_at = Clock.nextTimestamp()
        write(project)
    }

    /// Moves a project one place up (-1) or down (+1) in the sidebar.
    func move(_ id: String, by step: Int) {
        var list = projects
        guard let index = list.firstIndex(where: { $0.id == id }) else { return }
        let target = index + step
        guard list.indices.contains(target) else { return }
        var project = list.remove(at: index)
        list.insert(project, at: target)
        let before = target > 0 ? list[target - 1].position : nil
        let after = target + 1 < list.count ? list[target + 1].position : nil
        project.position = FractionalIndex.positionBetween(before, after)
        project.updated_at = Clock.nextTimestamp()
        write(project)
    }

    /// Tombstones the project (its tasks are taken out of it by the caller).
    func delete(_ id: String) {
        guard var project = project(id) else { return }
        let now = Clock.nextTimestamp()
        project.deleted_at = now
        project.updated_at = now
        write(project)
    }

    /// Takes in rows from another Mac or a backup: new ones, and newer
    /// versions of known ones. Returns how many changed.
    @discardableResult
    func merge(_ incoming: [Project]) -> Int {
        var changed = 0
        for row in incoming {
            if let local = rows[row.id], local.updated_at >= row.updated_at { continue }
            rows[row.id] = row
            changed += 1
        }
        if changed > 0 { save() }
        return changed
    }

    private func write(_ project: Project) {
        rows[project.id] = project
        save()
    }

    private func save() {
        defer { onSave?() }
        guard let fileURL, let data = try? JSONEncoder().encode(allRows) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
