import Foundation

/// A first week to learn from: on the very first launch, with no tasks yet, a
/// few short tasks show how Plain Week works. They are ordinary tasks: tick or
/// delete them.
enum Welcome {
    static let doneKey = "welcomed"

    /// Adds the tasks once; never when there are tasks already.
    @discardableResult
    static func runIfNeeded(store: TaskStore, today: String) -> Bool {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: doneKey) else { return false }
        defaults.set(true, forKey: doneKey)
        guard store.allRows.isEmpty else { return false }
        add(to: store, today: today)
        return true
    }

    static func add(to store: TaskStore, today: String) {
        let tomorrow = DateKey.addDays(today, 1)
        store.create(text: "Welcome to Plain Week", date: today, color: .yellow, notes: """
        # A week on one page
        Each day is a card. Click a task to open it: notes like this one, **bold**, todo lines, a time and a color.

        - [x] Open a task
        - [ ] Tick it when it is done
        """)
        store.create(text: "Tick the circle when a task is done", date: today)
        store.create(text: "Press ▶ on a day to time its next task", date: today, time: "10:00", duration: 25, color: .cornflower)
        store.create(text: "Type “lunch with Sam tomorrow @12:30 for 1h #green” in a new task", date: today)
        store.create(text: "Drag a task to another day, or right-click it to move it", date: tomorrow)
        store.create(text: "Press ⌘K to search and jump anywhere", date: tomorrow)
        store.create(text: "Tasks without a date wait in the Backlog", date: nil)
    }
}
