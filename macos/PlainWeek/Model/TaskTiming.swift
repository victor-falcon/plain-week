import Foundation

/// Durations and per-task reminders: the choices and how they read.
enum TaskTiming {
    /// 0 stands for "not set" in pickers.
    static let durations = [0, 15, 30, 45, 60, 90, 120, 180, 240]
    /// A tag for "as in Settings" (`remind == nil`).
    static let followSettings = -2
    static let reminders = [followSettings, -1, 0, 5, 10, 15, 30, 60, 120]

    static func durationLabel(_ minutes: Int) -> String {
        minutes == 0 ? "Not set" : short(minutes)
    }

    static func reminderLabel(_ minutes: Int) -> String {
        switch minutes {
        case followSettings: "As in Settings"
        case -1: "Off"
        case 0: "At the time"
        default: "\(short(minutes)) before"
        }
    }

    /// "45m", "1h", "1h 30m".
    static func short(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m)m" }
        return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    }
}

extension TaskStore {
    /// Planned minutes on a day: the durations of its unfinished tasks.
    func plannedMinutes(on day: String) -> Int {
        (days(from: day, to: day)[day] ?? []).filter { !$0.task.done }.compactMap(\.task.duration).reduce(0, +)
    }
}
