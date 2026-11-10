import Foundation

/// The planner's keyboard cursor, vim style like the web app: a task (day and
/// position) the keys act on. Hidden until a key is pressed.
struct Cursor: Equatable {
    var day: String
    var index: Int
}

/// What the planner keys do, as one function over the models so it can be
/// tested: j k ↓ ↑ tasks, h l ← → days, H L weeks, t today, ↩ o open,
/// x Space mark as done, d d delete, a i n add, p timer, f flag, 0–3
/// priority, # tags (opens the task at its tags), / palette, Esc hide.
@MainActor
enum KeyboardNav {
    /// Returns whether the key was used.
    @discardableResult
    static func handle(_ key: String, store: TaskStore, planner: PlannerModel, timer: FocusTimer,
                       undoManager: UndoManager?, now: Date = Date()) -> Bool {
        let pendingDelete = planner.pendingDeleteAt.map { now.timeIntervalSince($0) < 1 } ?? false
        if key != "d" { planner.pendingDeleteAt = nil }

        // Escape and the palette work without a cursor.
        switch key {
        case "\u{1B}": planner.cursor = nil; return true
        case "/": planner.showPalette = true; return true
        default: break
        }

        var cursor = planner.cursor ?? Cursor(day: planner.showsToday ? planner.today : planner.weekStart, index: 0)
        let starting = planner.cursor == nil
        let items = { (day: String) in store.days(from: day, to: day)[day] ?? [] }

        switch key {
        case "j", KeyCode.down:
            if !starting { cursor.index = min(cursor.index + 1, max(items(cursor.day).count - 1, 0)) }
        case "k", KeyCode.up:
            if !starting { cursor.index = max(cursor.index - 1, 0) }
        case "h", KeyCode.left:
            if !starting { cursor = moveDay(cursor, by: -1, items: items) }
        case "l", KeyCode.right:
            if !starting { cursor = moveDay(cursor, by: 1, items: items) }
        case "H": cursor = moveDay(cursor, by: -7, items: items)
        case "L": cursor = moveDay(cursor, by: 7, items: items)
        case "t": cursor = Cursor(day: planner.today, index: 0)
        case "\r", "o":
            if let item = items(cursor.day)[safe: cursor.index] { planner.open(item.id) }
        case "x", " ":
            if let item = items(cursor.day)[safe: cursor.index] {
                store.perform(item.task.done ? "Mark as Not Done" : "Mark as Done", undoManager: undoManager) { _ = store.toggleDone(item.id) }
            }
        case "d":
            if pendingDelete, let item = items(cursor.day)[safe: cursor.index] {
                store.perform("Delete Task", undoManager: undoManager) { store.delete(item.id) }
                planner.show("Task deleted.", canUndo: true)
                planner.pendingDeleteAt = nil
                cursor.index = max(0, min(cursor.index, items(cursor.day).count - 1))
            } else {
                planner.pendingDeleteAt = now
            }
        case "a", "i", "n":
            planner.focusRequest = cursor.day
        case "f":
            if let item = items(cursor.day)[safe: cursor.index] {
                let on = !item.task.flagged
                store.perform(on ? "Flag" : "Unflag", undoManager: undoManager) { store.update(item.id, TaskPatch(flagged: on)) }
            }
        case "0", "1", "2", "3":
            if let item = items(cursor.day)[safe: cursor.index], let priority = TaskPriority(rawValue: Int(key)!), priority != item.task.priority {
                store.perform("Set Priority", undoManager: undoManager) { store.update(item.id, TaskPatch(priority: priority)) }
            }
        case "#":
            if let item = items(cursor.day)[safe: cursor.index] { planner.openTask = OpenTask(id: item.id, focusTags: true) }
        case "p":
            if let item = items(cursor.day)[safe: cursor.index], !item.task.done {
                TimerActions.start(item.id, day: cursor.day, store: store, planner: planner, timer: timer)
            }
        default:
            return false
        }
        planner.cursor = cursor
        keepVisible(cursor.day, planner: planner)
        return true
    }

    private static func moveDay(_ cursor: Cursor, by days: Int, items: (String) -> [PlannerItem]) -> Cursor {
        let day = DateKey.addDays(cursor.day, days)
        return Cursor(day: day, index: min(cursor.index, max(items(day).count - 1, 0)))
    }

    /// Scrolls the strip just enough to show the cursor's day.
    private static func keepVisible(_ day: String, planner: PlannerModel) {
        let last = DateKey.addDays(planner.weekStart, planner.visibleCount - 1)
        if day < planner.weekStart { planner.scroll(by: DateKey.daysBetween(planner.weekStart, day)) }
        if day > last { planner.scroll(by: DateKey.daysBetween(last, day)) }
    }

    /// Arrow keys as `KeyPress.characters` reports them.
    enum KeyCode {
        static let up = "\u{F700}", down = "\u{F701}", left = "\u{F702}", right = "\u{F703}"
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
