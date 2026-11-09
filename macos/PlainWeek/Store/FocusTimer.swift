import Foundation
import Observation

/// A stopwatch for working on one task. Started from a day's ▶ (its next
/// unfinished task) or a task row's ▶; shown in the floating mini window.
/// Nothing is stored: the timer lives while the app runs.
@Observable
final class FocusTimer {
    /// The task being timed (a row or occurrence id; it follows the task when
    /// its id changes, as an occurrence's does on its first change).
    private(set) var taskId: String?
    /// The day the task was started from: completing it moves on to that
    /// day's next unfinished task.
    private(set) var day: String?
    private(set) var isRunning = false
    /// Seconds counted before the current run started.
    private(set) var accumulated: TimeInterval = 0
    private(set) var runningSince: Date?

    @ObservationIgnored var now: () -> Date = Date.init

    var isActive: Bool { taskId != nil }

    /// Seconds on the clock at `date`.
    func elapsed(at date: Date? = nil) -> TimeInterval {
        let reference = date ?? now()
        guard let runningSince else { return accumulated }
        return accumulated + max(0, reference.timeIntervalSince(runningSince))
    }

    /// Starts timing `taskId` from zero.
    func start(_ taskId: String, day: String?) {
        self.taskId = taskId
        self.day = day
        accumulated = 0
        runningSince = now()
        isRunning = true
    }

    func pause() {
        guard isRunning else { return }
        accumulated = elapsed()
        runningSince = nil
        isRunning = false
    }

    func resume() {
        guard !isRunning, taskId != nil else { return }
        runningSince = now()
        isRunning = true
    }

    func toggle() { isRunning ? pause() : resume() }

    /// Follows the task to a new id without touching the clock.
    func follow(_ id: String) { taskId = id }

    func stop() {
        taskId = nil
        day = nil
        accumulated = 0
        runningSince = nil
        isRunning = false
    }

    /// "12:34", or "1:02:03" past an hour.
    static func format(_ seconds: TimeInterval) -> String {
        let total = Int(seconds)
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
    }
}

extension TaskStore {
    /// The day's unfinished tasks in display order (timed first).
    func openTasks(on day: String) -> [PlannerItem] {
        (days(from: day, to: day)[day] ?? []).filter { !$0.task.done }
    }

    /// Done and total tasks of a day, for its progress bar.
    func progress(on day: String) -> (done: Int, total: Int) {
        let items = days(from: day, to: day)[day] ?? []
        return (items.filter(\.task.done).count, items.count)
    }
}
