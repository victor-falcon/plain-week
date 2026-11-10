import Foundation
import Observation

/// Which rows a change to a recurring task touches.
enum ChangeScope { case this, future }

/// The fields `update` may change; nil leaves a field alone.
struct TaskPatch {
    var text: String?
    var done: Bool?
    var color: TaskColor?
    /// `.some(nil)` clears the time.
    var time: String??
    /// `.some(nil)` clears it.
    var duration: Int??
    var remind: Int??
    /// `.some(nil)` clears the place.
    var location: String??
    var tags: [String]?
    var flagged: Bool?
    var priority: TaskPriority?
    /// `.some(nil)` takes it out of its project.
    var project: String??
    var notes: String?
    var subtasks: [Subtask]?
}

/// The local database: the only source of truth for the UI. Every action is a
/// synchronous local write persisted to a JSON file; nothing waits on a network.
/// Mirrors the web app's repository (`lib/db/tasks.ts`).
@Observable
final class TaskStore {
    private(set) var rows: [String: PlainTask] = [:]
    /// Bumped on every write, so views can cheaply observe changes.
    private(set) var revision = 0

    @ObservationIgnored private let fileURL: URL?
    @ObservationIgnored private var undoLog: [String: PlainTask?]?

    init(fileURL: URL? = TaskStore.defaultFileURL()) {
        self.fileURL = fileURL
        load()
    }

    static func defaultFileURL() -> URL? {
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = support.appendingPathComponent("Plain Week", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("tasks.json")
    }

    // MARK: Persistence

    private func load() {
        guard let fileURL, let data = try? Data(contentsOf: fileURL),
              let tasks = try? JSONDecoder().decode([PlainTask].self, from: data) else { return }
        rows = Dictionary(tasks.map { ($0.id, $0) }, uniquingKeysWith: { a, b in a.updated_at >= b.updated_at ? a : b })
    }

    /// Called after every save (reminders and widgets follow the data).
    @ObservationIgnored var onSave: (() -> Void)?

    private func save() {
        revision += 1
        defer { onSave?() }
        guard let fileURL else { return }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let sorted = rows.values.sorted { $0.id < $1.id }
        if let data = try? encoder.encode(sorted) { try? data.write(to: fileURL, options: .atomic) }
    }

    /// Writes a row with a fresh `updated_at`, recording what it replaced for undo.
    private func write(_ task: PlainTask) {
        var task = task
        task.updated_at = Clock.nextTimestamp()
        if undoLog != nil, undoLog![task.id] == nil { undoLog![task.id] = .some(rows[task.id]) }
        rows[task.id] = task
        if undoLog == nil { save() }
    }

    // MARK: Undo

    /// Runs `body` as one undoable action registered with `undoManager`.
    @discardableResult
    func perform<T>(_ name: String, undoManager: UndoManager?, _ body: () throws -> T) rethrows -> T {
        let outer = undoLog
        undoLog = [:]
        defer {
            let log = undoLog ?? [:]
            undoLog = outer
            save()
            if let undoManager, !log.isEmpty {
                undoManager.registerUndo(withTarget: self) { store in
                    store.perform(name, undoManager: undoManager) { store.revert(log) }
                }
                undoManager.setActionName(name)
            }
        }
        return try body()
    }

    /// Puts back every row the logged changes overwrote. A created row is
    /// deleted, except an exception, which goes back to its series' content.
    private func revert(_ log: [String: PlainTask?]) {
        for (id, previous) in log {
            if let previous {
                write(previous)
            } else if var created = rows[id] {
                if created.isException, let seriesId = created.series_id, let series = rows[seriesId], !series.isDeleted,
                   let occurrence = created.occurrence_date {
                    var restored = RecurrenceEngine.makeOccurrence(series, date: occurrence).task
                    restored.id = created.id
                    restored.created_at = created.created_at
                    write(restored)
                } else {
                    created.deleted_at = Clock.nextTimestamp()
                    write(created)
                }
            }
        }
    }

    // MARK: Queries

    private var liveRows: [PlainTask] { rows.values.filter { !$0.isDeleted } }

    /// Items dated in the range: plain rows and exceptions, plus occurrences.
    func items(from start: String, to end: String) -> [PlannerItem] {
        var result: [PlannerItem] = []
        var exceptionsBySeries: [String: [PlainTask]] = [:]
        var seriesRows: [PlainTask] = []
        for row in rows.values {
            if row.isSeries { if !row.isDeleted { seriesRows.append(row) }; continue }
            if let seriesId = row.series_id, row.occurrence_date != nil, rows[seriesId].map({ !$0.isDeleted }) == true {
                exceptionsBySeries[seriesId, default: []].append(row)
                continue
            }
            guard !row.isDeleted, let date = row.date, date >= start, date <= end else { continue }
            result.append(RecurrenceEngine.item(for: row))
        }
        for series in seriesRows {
            result += RecurrenceEngine.expand(series: series, exceptions: exceptionsBySeries[series.id] ?? [], from: start, to: end)
        }
        return result
    }

    /// The seven days from `weekStart`, timed tasks first.
    func week(_ weekStart: String) -> [String: [PlannerItem]] {
        let days = DateKey.week(weekStart)
        var map = Dictionary(uniqueKeysWithValues: days.map { ($0, [PlannerItem]()) })
        for item in items(from: days[0], to: days[6]) {
            if let date = item.task.date { map[date]?.append(item) }
        }
        for key in days { map[key]?.sort(by: Self.dayOrder) }
        return map
    }

    /// Every day from `start` to `end` (inclusive), timed tasks first.
    func days(from start: String, to end: String) -> [String: [PlannerItem]] {
        var map: [String: [PlannerItem]] = [:]
        for item in items(from: start, to: end) {
            if let date = item.task.date { map[date, default: []].append(item) }
        }
        for key in map.keys { map[key]?.sort(by: Self.dayOrder) }
        return map
    }

    /// Completed tasks, most recently completed first: those of one day, or
    /// with `day` nil every completed task (Backlog included). Occurrences are
    /// never done; a completed occurrence is its exception row.
    func doneTasks(on day: String? = nil) -> [PlannerItem] {
        let rows = liveRows.filter { task in
            guard task.done, task.recurrence == nil else { return false }
            if let day { return task.date == day }
            return true
        }
        return rows
            .sorted { ($0.done_at ?? "") != ($1.done_at ?? "") ? ($0.done_at ?? "") > ($1.done_at ?? "") : $0.id < $1.id }
            .map { RecurrenceEngine.item(for: $0) }
    }

    /// Someday, without tasks done before the archive week.
    func someday(weekStart: String, today: String) -> [PlannerItem] {
        let current = DateKey.startOfWeek(today)
        let cutoff = DateKey.localDate(min(weekStart, current))
        return somedayRows()
            .filter { task in
                guard task.done else { return true }
                guard let doneAt = task.done_at.flatMap(Clock.parse) else { return false }
                return doneAt >= cutoff
            }
            .map { PlannerItem(task: $0, kind: $0.isException ? .exception : .task) }
    }

    private func somedayRows() -> [PlainTask] {
        liveRows.filter { $0.date == nil && $0.recurrence == nil }.sorted(by: Self.somedayOrder)
    }

    /// One list in position order (the repository's order, used for placing).
    private func positionalList(_ date: String?) -> [PlannerItem] {
        guard let date else { return somedayRows().map { RecurrenceEngine.item(for: $0) } }
        return items(from: date, to: date).sorted { Self.taskOrder($0.task, $1.task) }
    }

    static func taskOrder(_ a: PlainTask, _ b: PlainTask) -> Bool {
        a.position != b.position ? a.position < b.position : a.id < b.id
    }

    static func dayOrder(_ a: PlannerItem, _ b: PlannerItem) -> Bool {
        // Completed tasks go to the bottom of the day (its Archive).
        if a.task.done != b.task.done { return !a.task.done }
        switch (a.task.time, b.task.time) {
        case let (x?, y?) where x != y: return x < y
        case (.some, nil): return true
        case (nil, .some): return false
        default: return taskOrder(a.task, b.task)
        }
    }

    static func somedayOrder(_ a: PlainTask, _ b: PlainTask) -> Bool {
        let ca = a.someday_column ?? 0, cb = b.someday_column ?? 0
        return ca != cb ? ca < cb : taskOrder(a, b)
    }

    /// Resolves a row id or an occurrence id to what it stands for now.
    func item(_ id: String) -> PlannerItem? {
        if let row = rows[id] {
            guard !row.isDeleted else { return nil }
            if row.isException, let seriesId = row.series_id, let date = row.occurrence_date,
               let winner = winningException(seriesId, date), winner.id != row.id { return nil }
            return RecurrenceEngine.item(for: row)
        }
        guard let parsed = RecurrenceEngine.parseOccurrenceId(id) else { return nil }
        if let exception = winningException(parsed.seriesId, parsed.date) {
            return exception.isDeleted ? nil : PlannerItem(task: exception, kind: .exception)
        }
        guard let series = rows[parsed.seriesId], !series.isDeleted, series.isSeries,
              RecurrenceEngine.expand(series: series, exceptions: [], from: parsed.date, to: parsed.date).isEmpty == false
        else { return nil }
        return RecurrenceEngine.makeOccurrence(series, date: parsed.date)
    }

    func series(of item: PlannerItem) -> PlainTask? {
        guard let seriesId = item.seriesId, let series = rows[seriesId], !series.isDeleted else { return nil }
        return series
    }

    /// Whether a change can apply to "only this" or "this and all future".
    func asksScope(_ item: PlannerItem) -> Bool {
        item.kind == .occurrence || (item.kind == .exception && series(of: item) != nil)
    }

    /// Whether the item is its series' first occurrence (a change applies to all).
    func isFirstOccurrence(_ item: PlannerItem) -> Bool {
        guard let series = series(of: item), let date = item.occurrenceDate else { return false }
        return RecurrenceEngine.startsSeries(series, date: date)
    }

    private func winningException(_ seriesId: String, _ date: String) -> PlainTask? {
        let candidates = rows.values.filter { $0.series_id == seriesId && $0.occurrence_date == date }
        return RecurrenceEngine.winningExceptions(candidates)[date]
    }

    var isEmpty: Bool { liveRows.isEmpty }

    // MARK: Placement

    private func placement(date: String?, afterId: String?, beforeId: String?, excluding id: String?) -> (column: Int?, position: String) {
        let list = positionalList(date).filter { $0.id != id && $0.rowKey != id }
        let index: (String?) -> Int? = { target in
            guard let target else { return nil }
            return list.firstIndex { $0.id == target || $0.rowKey == target }
        }
        var lowerIndex: Int?, upperIndex: Int?
        if let a = index(afterId) {
            lowerIndex = a
            upperIndex = index(beforeId) ?? (a + 1 < list.count ? a + 1 : nil)
        } else if let b = index(beforeId) {
            upperIndex = b
            lowerIndex = b > 0 ? b - 1 : nil
        } else {
            lowerIndex = list.isEmpty ? nil : list.count - 1
        }
        let lower = lowerIndex.map { list[$0].task }
        let upper = upperIndex.map { list[$0].task }

        guard date == nil else {
            return (nil, FractionalIndex.positionBetween(lower?.position, upper?.position))
        }
        // Someday: a (column, position) pair between the neighbours.
        if let lower {
            let column = lower.someday_column ?? 0
            let bound = (upper?.someday_column ?? 0) == column ? upper?.position : nil
            return (column, FractionalIndex.positionBetween(lower.position, bound))
        }
        if let upper { return (upper.someday_column ?? 0, FractionalIndex.positionBetween(nil, upper.position)) }
        return (0, FractionalIndex.positionBetween(nil, nil))
    }

    // MARK: Mutations

    @discardableResult
    func create(text: String, date: String?, time: String? = nil, duration: Int? = nil, location: String? = nil,
                tags: [String] = [], flagged: Bool = false, priority: TaskPriority = .none, color: TaskColor = .none,
                afterId: String? = nil, beforeId: String? = nil, notes: String = "", subtasks: [Subtask] = [],
                project: String? = nil) -> String {
        let place = placement(date: date, afterId: afterId, beforeId: beforeId, excluding: nil)
        let now = Clock.nextTimestamp()
        let task = PlainTask(id: Clock.uuidV7(), text: text, date: date, someday_column: place.column,
                             position: place.position, color: color, time: time, duration: duration, location: location,
                             tags: Tags.clean(tags), flagged: flagged, priority: priority, project_id: project, notes: notes,
                             subtasks: subtasks, created_at: now, updated_at: now)
        write(task)
        return task.id
    }

    /// Turns an occurrence into an exception row (or returns the row).
    private func materialize(_ item: PlannerItem) -> PlainTask {
        guard item.kind == .occurrence else { return rows[item.task.id] ?? item.task }
        var row = item.task
        row.id = Clock.uuidV7()
        row.created_at = Clock.nextTimestamp()
        return row
    }

    private func apply(_ patch: TaskPatch, to task: inout PlainTask, allowDone: Bool = true) {
        if let text = patch.text { task.text = text }
        if let color = patch.color { task.color = color }
        if let time = patch.time { task.time = time }
        if let duration = patch.duration { task.duration = duration }
        if let remind = patch.remind { task.remind = remind }
        if let location = patch.location { task.location = location.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0.trimmingCharacters(in: .whitespacesAndNewlines) } }
        if let tags = patch.tags { task.tags = Tags.clean(tags) }
        if let flagged = patch.flagged { task.flagged = flagged }
        if let priority = patch.priority { task.priority = priority }
        if let project = patch.project { task.project_id = project }
        if let notes = patch.notes { task.notes = notes }
        if let subtasks = patch.subtasks { task.subtasks = subtasks }
        if allowDone, let done = patch.done, done != task.done {
            task.done = done
            task.done_at = done ? Clock.nextTimestamp() : nil
        }
    }

    /// Returns the id that now stands for the item.
    @discardableResult
    func update(_ id: String, _ patch: TaskPatch, scope: ChangeScope = .this) -> String? {
        guard let item = item(id) else { return nil }
        if item.kind == .task || item.kind == .series || !asksScope(item) {
            var row = materialize(item)
            apply(patch, to: &row, allowDone: item.kind != .series)
            write(row)
            return row.id
        }
        if scope == .this {
            var row = materialize(item)
            apply(patch, to: &row)
            write(row)
            return row.id
        }
        return splitFuture(item) { content in
            self.apply(patch, to: &content, allowDone: false)
        }
    }

    @discardableResult
    func toggleDone(_ id: String) -> String? {
        guard let item = item(id) else { return nil }
        return update(id, TaskPatch(done: !item.task.done), scope: .this)
    }

    /// Splits a series at the item's date: the old one ends the day before and
    /// a new one, with `edit` applied to this item's content, starts there.
    /// Returns the id of the new series' occurrence on that date.
    private func splitFuture(_ item: PlannerItem, newRule: Recurrence? = nil, edit: (inout PlainTask) -> Void) -> String? {
        guard var series = series(of: item), let date = item.occurrenceDate, let rule = series.recurrence else { return nil }
        if RecurrenceEngine.startsSeries(series, date: date) {
            edit(&series)
            if let newRule { series.recurrence = newRule; series.date = date }
            write(series)
            // The edited item itself, if it was an exception, takes the edit too.
            if item.kind == .exception, var row = rows[item.task.id] { edit(&row); write(row) }
            return self.item(RecurrenceEngine.occurrenceId(series.id, date))?.id ?? series.id
        }
        var old = series
        old.recurrence?.until = DateKey.addDays(date, -1)
        write(old)
        tombstoneExceptions(of: series.id, from: date)

        var content = item.task
        edit(&content)
        let now = Clock.nextTimestamp()
        var next = content
        next.id = Clock.uuidV7()
        next.date = date
        next.someday_column = nil
        next.done = false
        next.done_at = nil
        next.series_id = nil
        next.occurrence_date = nil
        next.recurrence = newRule ?? Recurrence(type: rule.type, every: rule.every, weekdays: rule.weekdays, day: rule.day, until: rule.until)
        next.created_at = now
        next.deleted_at = nil
        write(next)
        return self.item(RecurrenceEngine.occurrenceId(next.id, date))?.id ?? next.id
    }

    private func tombstoneExceptions(of seriesId: String, from date: String? = nil, keeping keep: String? = nil) {
        for row in rows.values where row.series_id == seriesId && !row.isDeleted && row.id != keep {
            if let date, let occurrence = row.occurrence_date, occurrence < date { continue }
            var dead = row
            dead.deleted_at = Clock.nextTimestamp()
            write(dead)
        }
    }

    func delete(_ id: String, scope: ChangeScope = .this) {
        guard let item = item(id) else { return }
        if item.kind == .series {
            tombstoneExceptions(of: item.task.id)
            var row = item.task
            row.deleted_at = Clock.nextTimestamp()
            write(row)
            return
        }
        if scope == .future, asksScope(item), let series = series(of: item), let date = item.occurrenceDate {
            if RecurrenceEngine.startsSeries(series, date: date) {
                delete(series.id)
            } else {
                var old = series
                old.recurrence?.until = DateKey.addDays(date, -1)
                write(old)
                tombstoneExceptions(of: series.id, from: date)
            }
            return
        }
        var row = materialize(item)
        row.deleted_at = Clock.nextTimestamp()
        write(row)
    }

    @discardableResult
    func move(_ id: String, to date: String?, afterId: String? = nil, beforeId: String? = nil) -> String? {
        guard let item = item(id), item.kind != .series else { return nil }
        let place = placement(date: date, afterId: afterId, beforeId: beforeId, excluding: item.id)
        var row = materialize(item)
        if row.date == date, row.position == place.position, row.someday_column == place.column { return row.id }
        row.date = date
        row.someday_column = place.column
        row.position = place.position
        write(row)
        return row.id
    }

    @discardableResult
    func duplicate(_ id: String) -> String? {
        guard let item = item(id) else { return nil }
        let source = materialize(item)
        if item.kind == .occurrence { write(source) }
        let place = placement(date: source.date, afterId: source.id, beforeId: nil, excluding: nil)
        let now = Clock.nextTimestamp()
        var copy = source
        copy.id = Clock.uuidV7()
        copy.someday_column = place.column
        copy.position = place.position
        copy.subtasks = source.subtasks.map { Subtask(id: Clock.uuidV7(), text: $0.text, done: $0.done) }
        copy.recurrence = nil
        copy.series_id = nil
        copy.occurrence_date = nil
        copy.created_at = now
        write(copy)
        return copy.id
    }

    /// Makes a task repeat, changes its rule or (nil) stops it repeating.
    @discardableResult
    func setRecurrence(_ id: String, _ rule: Recurrence?, scope: ChangeScope = .future) throws -> String? {
        guard let item = item(id) else { return nil }
        switch item.kind {
        case .task:
            guard let rule else { return id }
            guard let date = item.task.date else { throw RecurrenceEngine.RuleError.invalid("Backlog tasks cannot repeat.") }
            var row = item.task
            row.recurrence = try RecurrenceEngine.normalize(rule, anchor: date)
            write(row)
            return self.item(RecurrenceEngine.occurrenceId(row.id, date))?.id ?? row.id
        case .series:
            var row = item.task
            if let rule {
                row.recurrence = try RecurrenceEngine.normalize(rule, anchor: row.date!)
            } else {
                tombstoneExceptions(of: row.id)
                row.recurrence = nil
            }
            write(row)
            return row.id
        case .occurrence, .exception:
            guard let date = item.occurrenceDate else { return nil }
            let normalized = try rule.map { try RecurrenceEngine.normalize($0, anchor: date) }
            guard series(of: item) != nil else {
                // An exception whose series is gone acts like a plain task.
                var row = item.task
                row.series_id = nil
                row.occurrence_date = nil
                row.recurrence = normalized
                row.date = row.date ?? date
                write(row)
                return row.id
            }
            if scope == .future || isFirstOccurrence(item) {
                if let normalized { return splitFuture(item, newRule: normalized) { _ in } }
                return stopRepeating(item)
            }
            // Only this task: it leaves its series; a deleted exception hides its date.
            var hidden = materialize(item)
            let content = hidden
            hidden.deleted_at = Clock.nextTimestamp()
            write(hidden)
            let now = Clock.nextTimestamp()
            var own = content
            own.id = Clock.uuidV7()
            own.series_id = nil
            own.occurrence_date = nil
            own.recurrence = normalized
            own.date = content.date ?? date
            own.created_at = now
            own.deleted_at = nil
            write(own)
            if normalized != nil, let d = own.date { return self.item(RecurrenceEngine.occurrenceId(own.id, d))?.id ?? own.id }
            return own.id
        }
    }

    /// "This and all future" with no rule: the series ends the day before and
    /// this item becomes a plain task (an exception row keeps its id).
    private func stopRepeating(_ item: PlannerItem) -> String? {
        guard var series = series(of: item), let date = item.occurrenceDate else { return nil }
        var plain = materialize(item)
        plain.series_id = nil
        plain.occurrence_date = nil
        plain.recurrence = nil
        if RecurrenceEngine.startsSeries(series, date: date) {
            tombstoneExceptions(of: series.id, keeping: plain.id)
            series.deleted_at = Clock.nextTimestamp()
        } else {
            series.recurrence?.until = DateKey.addDays(date, -1)
            tombstoneExceptions(of: series.id, from: date, keeping: plain.id)
        }
        write(series)
        write(plain)
        return plain.id
    }

    /// Moves unfinished plain tasks from earlier days to the end of `today`.
    @discardableResult
    func carryOver(today: String) -> Int {
        let behind = liveRows
            .filter { !$0.done && $0.recurrence == nil && $0.series_id == nil && ($0.date.map { $0 < today } ?? false) }
            .sorted { $0.date! != $1.date! ? $0.date! < $1.date! : Self.taskOrder($0, $1) }
        var last = positionalList(today).last?.task.position
        for var task in behind {
            let position = FractionalIndex.positionBetween(last, nil)
            task.date = today
            task.position = position
            write(task)
            last = position
        }
        return behind.count
    }

    // MARK: Sync

    /// Merges rows from another device (the iCloud Drive folder) with
    /// last-write-wins, as the web app's sync does: a row is taken when it is
    /// new here or its `updated_at` is newer. Timestamps are kept as they are,
    /// so merging is idempotent. Returns how many rows changed.
    @discardableResult
    func merge(_ incoming: [PlainTask]) -> Int {
        var changed = 0
        for row in incoming {
            if let local = rows[row.id], local.updated_at >= row.updated_at { continue }
            rows[row.id] = row
            changed += 1
        }
        if changed > 0 { save() }
        return changed
    }

    /// Every row, tombstones included (what a device writes for the others).
    var allRows: [PlainTask] { rows.values.sorted { $0.id < $1.id } }

    // MARK: Import / export

    /// Every live row, and of each live series the winning exceptions, deleted
    /// ones included (they hide deleted occurrences), like `backupRows`.
    func exportFile(appVersion: String, projects: [Project] = []) -> ExportFile {
        var result: [PlainTask] = []
        var exceptions: [String: [PlainTask]] = [:]
        for row in rows.values {
            if let seriesId = row.series_id, let series = rows[seriesId], series.recurrence != nil {
                if !series.isDeleted { exceptions[seriesId, default: []].append(row) }
            } else if !row.isDeleted {
                result.append(row)
            }
        }
        for list in exceptions.values { result += RecurrenceEngine.winningExceptions(list).values }
        return ExportFile(format: ExportFile.formatName, version: ExportFile.currentVersion,
                          exported_at: Clock.nextTimestamp(), app_version: appVersion,
                          tasks: result.sorted { $0.id < $1.id },
                          projects: projects.isEmpty ? nil : projects)
    }

    enum ImportError: LocalizedError {
        case notPlainWeek, unsupportedVersion
        var errorDescription: String? {
            switch self {
            case .notPlainWeek: "This is not a Plain Week export file."
            case .unsupportedVersion: "This export was made by a newer version of Plain Week."
            }
        }
    }

    static func parseImport(_ data: Data) throws -> ExportFile {
        guard let file = try? JSONDecoder().decode(ExportFile.self, from: data), file.format == ExportFile.formatName else {
            throw ImportError.notPlainWeek
        }
        guard file.version <= ExportFile.currentVersion else { throw ImportError.unsupportedVersion }
        return file
    }

    /// Adds the file's tasks next to the existing ones, with new ids. Returns
    /// how many tasks the user will see added (plain tasks plus series).
    /// `projects` maps the file's project ids to this Mac's (others: none).
    @discardableResult
    func importTasks(_ file: ExportFile, projects: [String: String] = [:]) -> Int {
        var ids: [String: String] = [:]
        for task in file.tasks { ids[task.id] = Clock.uuidV7() }
        let seriesIds = Set(file.tasks.filter { $0.recurrence != nil && $0.deleted_at == nil }.map(\.id))
        var count = 0
        for task in file.tasks {
            var row = task
            row.id = ids[task.id]!
            row.subtasks = task.subtasks.map { Subtask(id: Clock.uuidV7(), text: $0.text, done: $0.done) }
            row.project_id = task.project_id.flatMap { projects[$0] }
            if let seriesId = task.series_id {
                if seriesIds.contains(seriesId) {
                    row.series_id = ids[seriesId]
                } else {
                    guard !task.isDeleted else { continue }
                    row.series_id = nil
                    row.occurrence_date = nil
                }
            } else if task.isDeleted {
                continue
            }
            if row.date == nil { row.recurrence = nil; row.someday_column = row.someday_column ?? 0 }
            if row.series_id == nil { count += 1 }
            write(row)
        }
        return count
    }
}
