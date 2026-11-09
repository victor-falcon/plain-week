import Foundation
import Observation

/// A timer for working on one task: a stopwatch or Pomodoro. Started from a
/// day's ▶ (its next unfinished task) or a task row's ▶; shown in the floating
/// mini window and the menu bar. Focus time goes to the `TimeLog`.
@Observable
final class FocusTimer {
    /// A plain stopwatch, or Pomodoro: focus and break phases that switch on
    /// their own (lengths in Settings).
    enum Mode: String, CaseIterable, Identifiable {
        case stopwatch, pomodoro
        var id: String { rawValue }
        var label: String { self == .stopwatch ? "Stopwatch" : "Pomodoro" }
    }

    enum Phase { case work, rest }

    static let modeKey = "timerMode"
    static let workMinutesKey = "pomodoroWorkMinutes"
    static let breakMinutesKey = "pomodoroBreakMinutes"

    /// The task being timed (a row or occurrence id; it follows the task when
    /// its id changes, as an occurrence's does on its first change).
    private(set) var taskId: String?
    /// The day the task was started from: completing it moves on to that
    /// day's next unfinished task.
    private(set) var day: String?
    private(set) var isRunning = false
    private(set) var mode: Mode = .stopwatch
    private(set) var phase: Phase = .work
    /// Seconds counted before the current run started (in this phase).
    private(set) var accumulated: TimeInterval = 0
    private(set) var runningSince: Date?

    @ObservationIgnored var now: () -> Date = Date.init
    /// Called with work time to record: task, seconds, when it started.
    @ObservationIgnored var onLog: ((String, TimeInterval, Date) -> Void)?
    /// Called when a Pomodoro phase ends, with the phase that ended.
    @ObservationIgnored var onPhaseEnd: ((Phase) -> Void)?
    @ObservationIgnored private var logged: TimeInterval = 0
    @ObservationIgnored private var segmentStart: Date?
    @ObservationIgnored private var ticker: Timer?

    var isActive: Bool { taskId != nil }

    var workLength: TimeInterval { minutes(Self.workMinutesKey, default: 25) * 60 }
    var breakLength: TimeInterval { minutes(Self.breakMinutesKey, default: 5) * 60 }
    var phaseLength: TimeInterval { phase == .work ? workLength : breakLength }

    private func minutes(_ key: String, default value: Double) -> Double {
        let stored = UserDefaults.standard.double(forKey: key)
        return stored > 0 ? stored : value
    }

    /// Seconds on the clock at `date` (in the current phase).
    func elapsed(at date: Date? = nil) -> TimeInterval {
        let reference = date ?? now()
        guard let runningSince else { return accumulated }
        return accumulated + max(0, reference.timeIntervalSince(runningSince))
    }

    /// Pomodoro: seconds left in the phase.
    func remaining(at date: Date? = nil) -> TimeInterval { max(0, phaseLength - elapsed(at: date)) }

    /// What the clock shows: time spent (stopwatch) or time left (Pomodoro).
    func display(at date: Date? = nil) -> TimeInterval { mode == .pomodoro ? remaining(at: date) : elapsed(at: date) }

    /// Starts timing `taskId` from zero, in the mode chosen in Settings.
    func start(_ taskId: String, day: String?, mode: Mode? = nil) {
        flush()
        self.taskId = taskId
        self.day = day
        self.mode = mode ?? Mode(rawValue: UserDefaults.standard.string(forKey: Self.modeKey) ?? "") ?? .stopwatch
        phase = .work
        accumulated = 0
        logged = 0
        runningSince = now()
        segmentStart = runningSince
        isRunning = true
        startTicker()
    }

    func pause() {
        guard isRunning else { return }
        flush()
        accumulated = elapsed()
        runningSince = nil
        isRunning = false
    }

    func resume() {
        guard !isRunning, taskId != nil else { return }
        runningSince = now()
        segmentStart = runningSince
        isRunning = true
        startTicker()
    }

    func toggle() { isRunning ? pause() : resume() }

    /// Follows the task to a new id without touching the clock.
    func follow(_ id: String) { taskId = id }

    func stop() {
        flush()
        ticker?.invalidate()
        ticker = nil
        taskId = nil
        day = nil
        phase = .work
        accumulated = 0
        logged = 0
        runningSince = nil
        isRunning = false
    }

    /// Checks the Pomodoro clock: at the end of a phase, records the focus
    /// time, switches phase and starts it from zero. Runs every second.
    func tick() {
        guard mode == .pomodoro, isRunning, elapsed() >= phaseLength else { return }
        let ended = phase
        flush()
        phase = ended == .work ? .rest : .work
        accumulated = 0
        logged = 0
        runningSince = now()
        segmentStart = runningSince
        onPhaseEnd?(ended)
    }

    /// Hands the focus time not yet recorded to `onLog` (breaks are not work).
    private func flush() {
        guard let taskId else { return }
        let total = elapsed()
        let new = total - logged
        if phase == .work, new >= 1 { onLog?(taskId, new, segmentStart ?? now()) }
        logged = total
        segmentStart = now()
    }

    private func startTicker() {
        guard ticker == nil else { return }
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
    }

    /// "12:34", or "1:02:03" past an hour.
    static func format(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded(.up))
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
