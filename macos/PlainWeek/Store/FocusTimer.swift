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

    enum Phase {
        case work, rest, longRest
        var isBreak: Bool { self != .work }
        var label: String { self == .work ? "FOCUS" : self == .rest ? "BREAK" : "LONG BREAK" }
    }

    static let modeKey = "timerMode"
    static let workMinutesKey = "pomodoroWorkMinutes"
    static let breakMinutesKey = "pomodoroBreakMinutes"
    static let longBreakMinutesKey = "pomodoroLongBreakMinutes"
    static let sessionsKey = "pomodoroSessionsBeforeLongBreak"
    static let autoStartKey = "pomodoroAutoStart"

    /// The task being timed (a row or occurrence id; it follows the task when
    /// its id changes, as an occurrence's does on its first change).
    private(set) var taskId: String?
    /// The day the task was started from: completing it moves on to that
    /// day's next unfinished task.
    private(set) var day: String?
    private(set) var isRunning = false
    private(set) var mode: Mode = .stopwatch
    private(set) var phase: Phase = .work
    /// Focus sessions finished since this timer started.
    private(set) var completedSessions = 0
    /// Seconds counted before the current run started (in this phase).
    private(set) var accumulated: TimeInterval = 0
    private(set) var runningSince: Date?

    @ObservationIgnored var now: () -> Date = Date.init
    /// Called with work time to record: task, seconds, when it started, and
    /// whether it finished a Pomodoro focus session.
    @ObservationIgnored var onLog: ((String, TimeInterval, Date, Bool) -> Void)?
    /// Called when a Pomodoro phase ends, with the phase that ended.
    @ObservationIgnored var onPhaseEnd: ((Phase) -> Void)?
    @ObservationIgnored private var logged: TimeInterval = 0
    @ObservationIgnored private var segmentStart: Date?
    @ObservationIgnored private var ticker: Timer?

    var isActive: Bool { taskId != nil }

    /// The clock as text, refreshed once a second while a timer is active.
    /// The menu bar shows this, since a TimelineView in a menu bar label
    /// re-renders its image every frame and can hang the main thread.
    private(set) var clockText = ""

    /// Pomodoro settings; read from Settings unless given (tests).
    struct Settings {
        var workMinutes: Double = 25
        var breakMinutes: Double = 5
        var longBreakMinutes: Double = 15
        var sessionsPerCycle = 4
        var autoStart = true
    }

    @ObservationIgnored var settingsOverride: Settings?

    var settings: Settings {
        if let settingsOverride { return settingsOverride }
        return Settings(workMinutes: minutes(Self.workMinutesKey, default: 25),
                        breakMinutes: minutes(Self.breakMinutesKey, default: 5),
                        longBreakMinutes: minutes(Self.longBreakMinutesKey, default: 15),
                        sessionsPerCycle: max(1, Int(minutes(Self.sessionsKey, default: 4))),
                        autoStart: UserDefaults.standard.object(forKey: Self.autoStartKey) as? Bool ?? true)
    }

    var workLength: TimeInterval { settings.workMinutes * 60 }
    var breakLength: TimeInterval { settings.breakMinutes * 60 }
    var longBreakLength: TimeInterval { settings.longBreakMinutes * 60 }
    /// Focus sessions per cycle; the last one is followed by a long break.
    var sessionsPerCycle: Int { settings.sessionsPerCycle }
    /// Start the next phase on its own, or wait for play.
    var autoStart: Bool { settings.autoStart }
    var phaseLength: TimeInterval {
        switch phase {
        case .work: workLength
        case .rest: breakLength
        case .longRest: longBreakLength
        }
    }

    /// Sessions done in the current cycle, for the ●●○○ dots (a long break
    /// shows the whole cycle done).
    var sessionsInCycle: Int {
        let done = completedSessions % sessionsPerCycle
        return phase == .longRest && done == 0 && completedSessions > 0 ? sessionsPerCycle : done
    }

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
        completedSessions = 0
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
        refreshClock()
    }

    func resume() {
        guard !isRunning, taskId != nil else { return }
        runningSince = now()
        segmentStart = runningSince
        isRunning = true
        startTicker()
    }

    func toggle() { isRunning ? pause() : resume() }

    /// Moves the clock to another task (the mini window's stack). The time so
    /// far is recorded on the task it was spent on. A Pomodoro phase carries
    /// on; a stopwatch starts again from zero. Running or paused stays as it was.
    func switchTask(to id: String) {
        guard let taskId, taskId != id else { return }
        flush()
        self.taskId = id
        if mode == .stopwatch {
            accumulated = 0
            logged = 0
            runningSince = isRunning ? now() : nil
        }
        refreshClock()
    }

    /// Follows the task to a new id without touching the clock.
    func follow(_ id: String) { taskId = id }

    func stop() {
        flush()
        ticker?.invalidate()
        ticker = nil
        taskId = nil
        day = nil
        phase = .work
        completedSessions = 0
        accumulated = 0
        logged = 0
        runningSince = nil
        isRunning = false
        refreshClock()
    }

    /// Checks the Pomodoro clock: at the end of a phase, records the focus
    /// time, moves to the next phase (a long break after every
    /// `sessionsPerCycle` focus sessions) and starts it from zero, or waits for
    /// play when auto-start is off. Runs every second.
    func tick() {
        defer { refreshClock() }
        guard mode == .pomodoro, isRunning, elapsed() >= phaseLength else { return }
        let ended = phase
        if ended == .work {
            completedSessions += 1
            flush(finishedSession: true)
            phase = completedSessions % sessionsPerCycle == 0 ? .longRest : .rest
        } else {
            flush()
            phase = .work
        }
        accumulated = 0
        logged = 0
        if autoStart {
            runningSince = now()
            segmentStart = runningSince
        } else {
            runningSince = nil
            isRunning = false
        }
        onPhaseEnd?(ended)
    }

    /// Skips the rest of the current phase (a break you do not need, or a
    /// focus session cut short, which does not count as finished).
    func skipPhase() {
        guard mode == .pomodoro, taskId != nil else { return }
        flush()
        phase = phase == .work ? .rest : .work
        accumulated = 0
        logged = 0
        runningSince = now()
        segmentStart = runningSince
        isRunning = true
        startTicker()
    }

    /// Hands the focus time not yet recorded to `onLog` (breaks are not work).
    private func flush(finishedSession: Bool = false) {
        guard let taskId else { return }
        let total = elapsed()
        let new = total - logged
        if phase == .work, new >= 1 || finishedSession { onLog?(taskId, max(new, 0), segmentStart ?? now(), finishedSession) }
        logged = total
        segmentStart = now()
    }

    private func refreshClock() {
        let text = taskId == nil ? "" : Self.format(display())
        if text != clockText { clockText = text }
    }

    private func startTicker() {
        refreshClock()
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
