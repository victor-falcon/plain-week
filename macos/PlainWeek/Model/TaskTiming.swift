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

/// Task tags: lowercase words, no "#", no repeats.
enum Tags {
    static func clean(_ tags: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for raw in tags {
            let tag = raw.trimmingCharacters(in: CharacterSet(charactersIn: "#").union(.whitespacesAndNewlines))
                .lowercased()
                .split(whereSeparator: \.isWhitespace).joined(separator: "-")
            guard !tag.isEmpty, tag.count <= 40, seen.insert(tag).inserted else { continue }
            result.append(tag)
        }
        return result
    }

    /// Every tag in use, most used first, for suggestions.
    static func all(in store: TaskStore) -> [String] {
        var counts: [String: Int] = [:]
        for row in store.allRows where !row.isDeleted {
            for tag in row.tags { counts[tag, default: 0] += 1 }
        }
        return counts.sorted { ($0.value, $1.key) > ($1.value, $0.key) }.map(\.key)
    }
}
