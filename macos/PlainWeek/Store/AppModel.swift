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
    let folderSync: FolderSync
    let remindersMirror: RemindersMirror
    let calendarPublisher: CalendarPublisher
    let lock: AppLock
    private var launched = false

    private init() {
        store = TaskStore(fileURL: Self.dataFileURL)
        timeLog = TimeLog(fileURL: Self.dataFileURL.flatMap { $0.deletingLastPathComponent().appendingPathComponent("time.json") })
        reminders = Reminders(store: store)
        folderSync = FolderSync(store: store)
        remindersMirror = RemindersMirror(store: store)
        calendarPublisher = CalendarPublisher(store: store)
        lock = AppLock(fileURL: Self.dataFileURL.flatMap { $0.deletingLastPathComponent().appendingPathComponent("lock.json") })
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
            if !Self.isSnapshot {
                Backups.runIfNeeded(store: store, today: today)
                Cleanup.run(store: store, today: today, keepDays: Cleanup.keepDays)
                // The calendar's month ahead moves with the day.
                AppModel.shared.calendarPublisher.scheduleSoon()
            }
        }
        planner.startClock()
        // Locking closes every sheet that shows tasks (they are windows of
        // their own, above the lock screen).
        lock.onLock = {
            planner.openTask = nil
            planner.showReview = false
            planner.showPalette = false
            NSApp.keyWindow?.makeFirstResponder(nil)
        }
        lock.start()
        store.carryOverIfEnabled(today: planner.today, planner: planner)

        timer.onLog = { taskId, seconds, start, finished in timeLog.add(taskId, seconds: seconds, start: start, pomodoro: finished) }
        timer.onPhaseEnd = { [timer] ended in
            let next = timer.autoStart ? "" : " Press play when you are ready."
            switch ended {
            case .work where timer.phase == .longRest:
                Reminders.notify("Time for a long break", "\(timer.sessionsPerCycle) focus sessions done. Rest a while.\(next)")
            case .work:
                Reminders.notify("Time for a break", "Session \(timer.sessionsInCycle) of \(timer.sessionsPerCycle) done.\(next)")
            case .rest, .longRest:
                Reminders.notify("Back to focus", "Break over.\(next)")
            }
        }

        guard !Self.isSnapshot else { return }
        Welcome.runIfNeeded(store: store, today: planner.today)
        Backups.runIfNeeded(store: store, today: planner.today)
        Cleanup.run(store: store, today: planner.today, keepDays: Cleanup.keepDays)
        reminders.onComplete = { [weak self] id in self?.complete(id) }
        reminders.start()
        store.onSave = { [weak self] in
            guard let self else { return }
            reminders.scheduleSoon()
            folderSync.scheduleSoon()
            remindersMirror.scheduleSoon()
            calendarPublisher.scheduleSoon()
        }
        folderSync.start()
        remindersMirror.start()
        syncAll()
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in AppModel.shared.syncAll() }
        }
        QuickCapture.shared.registerHotKey()
        // Back as it was: the day panel reopens if it was open at quit.
        if UserDefaults.standard.bool(forKey: DayPanel.openKey) {
            DispatchQueue.main.async { DayPanel.shared.show() }
        }
    }

    /// Pulls and pushes every sync that is on: at launch, when the app comes
    /// to the front, and (debounced) after each local change.
    func syncAll() {
        folderSync.syncNow()
        remindersMirror.syncNow()
        calendarPublisher.syncNow()
    }

    /// Marks a task done from outside the window (notification, menu bar).
    func complete(_ id: String) {
        let undo = TimerActions.mainWindow?.undoManager
        store.perform("Mark as Done", undoManager: undo) { _ = store.toggleDone(id) }
    }
}
