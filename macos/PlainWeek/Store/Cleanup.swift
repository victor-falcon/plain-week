import Foundation

/// Clears old done tasks so the Done list and the file do not grow forever.
/// Settings › Data chooses how long done tasks stay (never by default).
/// Removed tasks become tombstones like any deletion, so other Macs follow.
enum Cleanup {
    static let keepDaysKey = "keepDoneDays"
    /// 0 keeps them forever.
    static let choices = [0, 30, 90, 365]

    static var keepDays: Int { UserDefaults.standard.integer(forKey: keepDaysKey) }

    static func label(_ days: Int) -> String {
        switch days {
        case 0: "Forever"
        case 365: "1 year"
        default: "\(days) days"
        }
    }

    /// Done plain tasks whose day (or, in the Backlog, the day they were
    /// done) is before `cutoff`. Repeating tasks and their days stay: removing
    /// a ticked day would bring it back unticked.
    static func candidates(store: TaskStore, cutoff: String) -> [String] {
        store.allRows.filter { row in
            guard row.done, !row.isDeleted, row.recurrence == nil, row.series_id == nil else { return false }
            let day = row.date ?? row.done_at.flatMap { Clock.parse($0) }.map { DateKey.local($0) }
            return day.map { $0 < cutoff } ?? false
        }
        .map(\.id)
    }

    /// Removes done tasks older than `keepDays` before `today`; returns how many.
    @discardableResult
    static func run(store: TaskStore, today: String, keepDays: Int) -> Int {
        guard keepDays > 0 else { return 0 }
        let ids = candidates(store: store, cutoff: DateKey.addDays(today, -keepDays))
        for id in ids { store.delete(id) }
        return ids.count
    }
}
