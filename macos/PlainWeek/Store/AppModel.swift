import AppKit
import Foundation

/// The objects every part of the app shares: the planner window, the menu bar,
/// the quick capture panel, notifications and Siri / Shortcuts all act on the
/// same store, planner and timer.
@MainActor
final class AppModel {
    static let shared = AppModel()

    let store: TaskStore
    let planner = PlannerModel()
    let timer = FocusTimer()
    let timeLog: TimeLog
    let calendar = CalendarEvents()
    let reminders: Reminders
    private var launched = false

    private init() {
        store = TaskStore(fileURL: Self.dataFileURL)
        timeLog = TimeLog(fileURL: Self.dataFileURL.flatMap { $0.deletingLastPathComponent().appendingPathComponent("time.json") })
        reminders = Reminders(store: store)
    }

    /// Debug builds can point at another file with `PLAINWEEK_DATA_FILE` (a
    /// name in the app's temporary directory), so snapshots never touch real data.
    static var dataFileURL: URL? {
        #if DEBUG
        if let name = ProcessInfo.processInfo.environment["PLAINWEEK_DATA_FILE"] {
            return URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(name)
        }
        #endif
        return TaskStore.defaultFileURL()
    }

    /// Debug snapshots run beside the real app: they leave notifications,
    /// backups and the global hotkey alone.
    static var isSnapshot: Bool {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        return env["PLAINWEEK_DATA_FILE"] != nil || env["XCTestConfigurationFilePath"] != nil
        #else
        return false
        #endif
    }

    /// Once, when the planner window first appears.
    func launch() {
        guard !launched else { return }
        launched = true
        let store = store, planner = planner, timeLog = timeLog
        planner.onDayChange = { today in
            store.carryOverIfEnabled(today: today, planner: planner)
            if !Self.isSnapshot { Backups.runIfNeeded(store: store, today: today) }
        }
        planner.startClock()
        store.carryOverIfEnabled(today: planner.today, planner: planner)

        timer.onLog = { taskId, seconds, start in timeLog.add(taskId, seconds: seconds, start: start) }
        timer.onPhaseEnd = { ended in
            Reminders.notify(ended == .work ? "Time for a break" : "Back to focus",
                             ended == .work ? "Focus session done. Rest a few minutes." : "Break over.")
        }

        guard !Self.isSnapshot else { return }
        Backups.runIfNeeded(store: store, today: planner.today)
        reminders.onComplete = { [weak self] id in self?.complete(id) }
        reminders.start()
        store.onSave = { [weak self] in self?.reminders.scheduleSoon() }
        QuickCapture.shared.registerHotKey()
    }

    /// Marks a task done from outside the window (notification, menu bar).
    func complete(_ id: String) {
        let undo = TimerActions.mainWindow?.undoManager
        store.perform("Mark as Done", undoManager: undo) { _ = store.toggleDone(id) }
    }
}
