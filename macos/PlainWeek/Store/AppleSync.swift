import EventKit
import Foundation
import Observation

/// What a task looks like in Reminders, and back: the parts that sync.
struct ReminderFields: Equatable {
    var title: String
    var notes: String
    var done: Bool
    /// 'YYYY-MM-DD', nil for the Backlog (no due date).
    var date: String?
    /// 'HH:mm', nil for a whole-day reminder.
    var time: String?

    init(title: String, notes: String, done: Bool, date: String?, time: String?) {
        self.title = title
        self.notes = notes
        self.done = done
        self.date = date
        self.time = date == nil ? nil : time
    }

    init(task: PlainTask) {
        self.init(title: task.text, notes: task.notes, done: task.done, date: task.date, time: task.time)
    }

    /// Due date parts for EventKit (a time only when the task has one).
    var dueComponents: DateComponents? {
        guard let date else { return nil }
        let p = DateKey.parts(date)
        var c = DateComponents(year: p.year, month: p.month, day: p.day)
        if let time {
            let t = time.split(separator: ":").compactMap { Int($0) }
            if t.count == 2 { c.hour = t[0]; c.minute = t[1] }
        }
        return c
    }

    static func from(due: DateComponents?, title: String, notes: String?, done: Bool) -> ReminderFields {
        var date: String?
        var time: String?
        if let due, let y = due.year, let m = due.month, let d = due.day {
            date = DateKey.make(y, m, d)
            if let h = due.hour, let min = due.minute { time = String(format: "%02d:%02d", h, min) }
        }
        return ReminderFields(title: title, notes: notes ?? "", done: done, date: date, time: time)
    }
}

/// Links between tasks and Reminders or Calendar items: the task id travels in
/// the item's URL, so any Mac (with folder sync) finds the same item.
enum TaskLink {
    static func url(_ taskId: String) -> URL { URL(string: "plainweek://task/\(taskId)")! }

    static func taskId(_ url: URL?) -> String? {
        guard let url, url.scheme == "plainweek", url.host == "task" else { return nil }
        let id = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return id.isEmpty ? nil : id
    }
}

/// Mirrors tasks to a "Plain Week" list in Reminders, both ways, so the week
/// is on iPhone and Apple Watch through iCloud Reminders. Plain tasks and
/// changed occurrences (exception rows) mirror; recurring series do not,
/// since Reminders repeats differently. Last write wins: a reminder edited
/// after the task updates the task, and the other way round.
@MainActor
@Observable
final class RemindersMirror {
    static let enabledKey = "mirrorReminders"
    static let listName = "Plain Week"

    @ObservationIgnored private let store: TaskStore
    @ObservationIgnored private let eventStore = EKEventStore()
    @ObservationIgnored private var pending: DispatchWorkItem?
    @ObservationIgnored private var observer: NSObjectProtocol?
    @ObservationIgnored private var syncing = false

    init(store: TaskStore) { self.store = store }

    private(set) var isEnabled = UserDefaults.standard.bool(forKey: RemindersMirror.enabledKey)
    private(set) var authorized = EKEventStore.authorizationStatus(for: .reminder) == .fullAccess
    private(set) var lastSync: Date?

    func setEnabled(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: Self.enabledKey)
        isEnabled = on
        guard on else { return }
        eventStore.requestFullAccessToReminders { granted, _ in
            Task { @MainActor in
                self.authorized = granted
                self.start()
                self.syncNow()
            }
        }
    }

    func start() {
        guard isEnabled, observer == nil else { return }
        observer = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: eventStore, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.scheduleSoon() }
        }
    }

    func scheduleSoon() {
        guard isEnabled, authorized else { return }
        pending?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.syncNow() }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    /// The "Plain Week" list, created in the default account (iCloud) if needed.
    private func list() -> EKCalendar? {
        if let existing = eventStore.calendars(for: .reminder).first(where: { $0.title == Self.listName }) { return existing }
        guard let source = eventStore.defaultCalendarForNewReminders()?.source ?? eventStore.sources.first(where: { $0.sourceType == .local }) else { return nil }
        let list = EKCalendar(for: .reminder, eventStore: eventStore)
        list.title = Self.listName
        list.source = source
        do { try eventStore.saveCalendar(list, commit: true) } catch { return nil }
        return list
    }

    func syncNow() {
        guard isEnabled, authorized, !syncing, let list = list() else { return }
        syncing = true
        let predicate = eventStore.predicateForReminders(in: [list])
        eventStore.fetchReminders(matching: predicate) { reminders in
            let items = reminders ?? []
            Task { @MainActor in
                self.reconcile(items, list: list)
                self.syncing = false
            }
        }
    }

    /// Which tasks mirror: live plain tasks and exception rows, done ones too.
    private var mirrored: [PlainTask] {
        store.allRows.filter { $0.recurrence == nil && ($0.series_id == nil || $0.isException) }
    }

    private func reconcile(_ reminders: [EKReminder], list: EKCalendar) {
        var byTask: [String: EKReminder] = [:]
        var unlinked: [EKReminder] = []
        var dirty = false
        for reminder in reminders {
            guard let id = TaskLink.taskId(reminder.url) else { unlinked.append(reminder); continue }
            // Two Macs that added the same task at once: keep one reminder.
            if byTask[id] != nil { try? eventStore.remove(reminder, commit: false); dirty = true } else { byTask[id] = reminder }
        }

        // New reminders made on another device become tasks.
        for reminder in unlinked where !reminder.isCompleted {
            let fields = ReminderFields.from(due: reminder.dueDateComponents, title: reminder.title ?? "", notes: reminder.notes, done: false)
            guard !fields.title.isEmpty else { continue }
            let id = store.create(text: fields.title, date: fields.date, time: fields.time, notes: fields.notes)
            reminder.url = TaskLink.url(id)
            try? eventStore.save(reminder, commit: false)
            dirty = true
        }

        for task in mirrored {
            let reminder = byTask.removeValue(forKey: task.id)
            if task.isDeleted {
                if let reminder { try? eventStore.remove(reminder, commit: false); dirty = true }
                continue
            }
            guard let reminder else {
                write(ReminderFields(task: task), to: EKReminder(eventStore: eventStore), id: task.id, list: list)
                dirty = true
                continue
            }
            let theirs = ReminderFields.from(due: reminder.dueDateComponents, title: reminder.title ?? "", notes: reminder.notes, done: reminder.isCompleted)
            let ours = ReminderFields(task: task)
            guard theirs != ours else { continue }
            let taskTime = Clock.parse(task.updated_at) ?? .distantPast
            let reminderTime = reminder.lastModifiedDate ?? .distantPast
            if reminderTime > taskTime {
                apply(theirs, to: task)
            } else {
                write(ours, to: reminder, id: task.id, list: list)
                dirty = true
            }
        }

        // Reminders whose task is gone here (deleted) go too.
        for (id, reminder) in byTask where store.rows[id] == nil || store.rows[id]?.isDeleted == true {
            try? eventStore.remove(reminder, commit: false)
            dirty = true
        }
        // Commit only real changes: a commit fires EKEventStoreChanged again.
        if dirty { try? eventStore.commit() }
        lastSync = Date()
    }

    private func write(_ fields: ReminderFields, to reminder: EKReminder, id: String, list: EKCalendar) {
        reminder.calendar = list
        reminder.title = fields.title
        reminder.notes = fields.notes.isEmpty ? nil : fields.notes
        reminder.isCompleted = fields.done
        reminder.dueDateComponents = fields.dueComponents
        reminder.url = TaskLink.url(id)
        try? eventStore.save(reminder, commit: false)
    }

    /// A newer edit made in Reminders comes into the task.
    private func apply(_ fields: ReminderFields, to task: PlainTask) {
        var id = task.id
        if fields.date != task.date { id = store.move(id, to: fields.date) ?? id }
        let patch = TaskPatch(text: fields.title.isEmpty ? nil : fields.title,
                              done: fields.done != task.done ? fields.done : nil,
                              time: fields.time != task.time ? .some(fields.time) : nil,
                              notes: fields.notes != task.notes ? fields.notes : nil)
        store.update(id, patch)
    }
}

/// Puts tasks with a time into a "Plain Week" calendar in Calendar (30-minute
/// events from a day ago to a month ahead), so they sit beside meetings and
/// reach the iPhone through iCloud Calendar. One-way: Plain Week is the source.
@MainActor
@Observable
final class CalendarPublisher {
    static let enabledKey = "publishToCalendar"
    static let calendarName = "Plain Week"
    static let minutes = 30

    struct Planned: Equatable {
        var key: String
        var title: String
        var start: Date
        var notes: String
    }

    @ObservationIgnored private let store: TaskStore
    @ObservationIgnored private let eventStore = EKEventStore()
    @ObservationIgnored private var pending: DispatchWorkItem?

    init(store: TaskStore) { self.store = store }

    private(set) var isEnabled = UserDefaults.standard.bool(forKey: CalendarPublisher.enabledKey)
    private(set) var authorized = EKEventStore.authorizationStatus(for: .event) == .fullAccess

    func setEnabled(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: Self.enabledKey)
        isEnabled = on
        guard on else { removeAll(); return }
        eventStore.requestFullAccessToEvents { granted, _ in
            Task { @MainActor in
                self.authorized = granted
                if granted { self.syncNow() }
            }
        }
    }

    /// The events to have: unfinished timed tasks (occurrences included).
    static func plan(store: TaskStore, today: String, calendar: Calendar = .current) -> [Planned] {
        let start = DateKey.addDays(today, -1), end = DateKey.addDays(today, 31)
        var result: [Planned] = []
        for (day, items) in store.days(from: start, to: end) {
            for item in items where !item.task.done {
                guard let time = item.task.time else { continue }
                let t = time.split(separator: ":").compactMap { Int($0) }
                guard t.count == 2, let at = calendar.date(bySettingHour: t[0], minute: t[1], second: 0, of: DateKey.localDate(day, calendar: calendar)) else { continue }
                result.append(Planned(key: item.rowKey, title: item.task.text, start: at, notes: item.task.notes))
            }
        }
        return result.sorted { $0.start < $1.start }
    }

    func scheduleSoon() {
        guard isEnabled else { return }
        pending?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.syncNow() }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    private func calendar(create: Bool) -> EKCalendar? {
        if let existing = eventStore.calendars(for: .event).first(where: { $0.title == Self.calendarName }) { return existing }
        guard create, let source = eventStore.defaultCalendarForNewEvents?.source ?? eventStore.sources.first(where: { $0.sourceType == .local }) else { return nil }
        let cal = EKCalendar(for: .event, eventStore: eventStore)
        cal.title = Self.calendarName
        cal.source = source
        do { try eventStore.saveCalendar(cal, commit: true) } catch { return nil }
        return cal
    }

    func syncNow() {
        guard isEnabled, EKEventStore.authorizationStatus(for: .event) == .fullAccess, let cal = calendar(create: true) else { return }
        let today = DateKey.local()
        let planned = Self.plan(store: store, today: today)
        let from = DateKey.localDate(DateKey.addDays(today, -2)), to = DateKey.localDate(DateKey.addDays(today, 33))
        let existing = eventStore.events(matching: eventStore.predicateForEvents(withStart: from, end: to, calendars: [cal]))
        var byKey: [String: EKEvent] = [:]
        var dirty = false
        for event in existing {
            if let key = TaskLink.taskId(event.url), byKey[key] == nil { byKey[key] = event } else { try? eventStore.remove(event, span: .thisEvent, commit: false); dirty = true }
        }
        for item in planned {
            let event = byKey.removeValue(forKey: item.key) ?? EKEvent(eventStore: eventStore)
            let end = item.start.addingTimeInterval(TimeInterval(Self.minutes * 60))
            if event.title == item.title, event.startDate == item.start, event.endDate == end, (event.notes ?? "") == item.notes, event.calendar == cal { continue }
            event.calendar = cal
            event.title = item.title
            event.startDate = item.start
            event.endDate = end
            event.notes = item.notes.isEmpty ? nil : item.notes
            event.url = TaskLink.url(item.key)
            try? eventStore.save(event, span: .thisEvent, commit: false)
            dirty = true
        }
        // Done, moved away or deleted: no event any more.
        for event in byKey.values { try? eventStore.remove(event, span: .thisEvent, commit: false); dirty = true }
        if dirty { try? eventStore.commit() }
    }

    private func removeAll() {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess, let cal = calendar(create: false) else { return }
        try? eventStore.removeCalendar(cal, commit: true)
    }
}
