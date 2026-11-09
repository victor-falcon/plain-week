import Foundation

/// Recurring tasks as pure functions (the web app's `lib/recurrence/expand.ts`):
/// a series row holds the rule, occurrences are generated for the dates on
/// screen, and exception rows override single occurrences.
enum RecurrenceEngine {
    static let maxEveryDays = 365

    static func occurrenceId(_ seriesId: String, _ date: String) -> String { "\(seriesId):\(date)" }

    static func parseOccurrenceId(_ id: String) -> (seriesId: String, date: String)? {
        guard id.count > 11 else { return nil }
        let date = String(id.suffix(10))
        let separator = id.index(id.endIndex, offsetBy: -11)
        guard id[separator] == ":", date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
        else { return nil }
        return (String(id[..<separator]), date)
    }

    static func item(for task: PlainTask) -> PlannerItem {
        if task.isSeries { return PlannerItem(task: task, kind: .series) }
        if task.isException { return PlannerItem(task: task, kind: .exception) }
        return PlannerItem(task: task, kind: .task)
    }

    enum RuleError: LocalizedError {
        case invalid(String)
        var errorDescription: String? { if case let .invalid(message) = self { message } else { nil } }
    }

    /// Validates a rule and puts it in canonical form, like `normalizeRecurrence`.
    static func normalize(_ rule: Recurrence, anchor: String) throws -> Recurrence {
        if let until = rule.until, until < anchor { throw RuleError.invalid("The end date is before the start.") }
        switch rule.type {
        case .daily:
            guard let every = rule.every, (1...maxEveryDays).contains(every) else {
                throw RuleError.invalid("Enter a number of days from 1 to 365.")
            }
            return .daily(every: every, until: rule.until)
        case .weekly:
            let days = Array(Set(rule.weekdays ?? [])).sorted()
            guard !days.isEmpty, days.allSatisfy({ (1...7).contains($0) }) else {
                throw RuleError.invalid("A weekly rule needs at least one weekday.")
            }
            return .weekly(days, until: rule.until)
        case .monthly:
            guard let day = rule.day, (1...31).contains(day) else {
                throw RuleError.invalid("A monthly rule needs a day from 1 to 31.")
            }
            return .monthly(day: day, until: rule.until)
        }
    }

    /// Whether `date` matches the rule, ignoring start and `until`.
    static func matches(_ rule: Recurrence, anchor: String, date: String) -> Bool {
        switch rule.type {
        case .daily:
            let days = DateKey.daysBetween(anchor, date)
            return days >= 0 && days % max(rule.every ?? 1, 1) == 0
        case .weekly:
            return (rule.weekdays ?? []).contains(DateKey.isoWeekday(date))
        case .monthly:
            let p = DateKey.parts(date)
            let last = DateKey.daysInMonth(year: p.year, month: p.month)
            return p.day == min(rule.day ?? 1, last)
        }
    }

    /// The first date on or after the anchor the rule matches (within 4 years).
    static func firstOccurrence(of series: PlainTask) -> String? {
        guard let rule = series.recurrence, let anchor = series.date else { return nil }
        var date = anchor
        for _ in 0..<(366 * 4) {
            if let until = rule.until, date > until { return nil }
            if matches(rule, anchor: anchor, date: date) { return date }
            date = DateKey.addDays(date, 1)
        }
        return nil
    }

    /// Whether `date` is on or before the series' first occurrence, so a change
    /// there applies to the whole series.
    static func startsSeries(_ series: PlainTask, date: String) -> Bool {
        guard let first = firstOccurrence(of: series) else { return true }
        return date <= first
    }

    /// Among duplicate exceptions for one occurrence, the newest wins, then the
    /// greater id (`winningException`).
    static func winningExceptions(_ exceptions: [PlainTask]) -> [String: PlainTask] {
        var winners: [String: PlainTask] = [:]
        for row in exceptions {
            guard let date = row.occurrence_date else { continue }
            if let current = winners[date] {
                if row.updated_at > current.updated_at || (row.updated_at == current.updated_at && row.id > current.id) {
                    winners[date] = row
                }
            } else {
                winners[date] = row
            }
        }
        return winners
    }

    static func makeOccurrence(_ series: PlainTask, date: String) -> PlannerItem {
        var task = series
        task.id = occurrenceId(series.id, date)
        task.date = date
        task.recurrence = nil
        task.series_id = series.id
        task.occurrence_date = date
        task.done = false
        task.done_at = nil
        return PlannerItem(task: task, kind: .occurrence)
    }

    /// Occurrences and live exceptions of a series dated in the range.
    static func expand(series: PlainTask, exceptions: [PlainTask], from rangeStart: String, to rangeEnd: String) -> [PlannerItem] {
        guard !series.isDeleted, let rule = series.recurrence, let anchor = series.date else { return [] }
        let winners = winningExceptions(exceptions)
        var items: [PlannerItem] = []
        var date = max(anchor, rangeStart)
        let last = min(rule.until ?? rangeEnd, rangeEnd)
        while date <= last {
            if matches(rule, anchor: anchor, date: date), winners[date] == nil {
                items.append(makeOccurrence(series, date: date))
            }
            date = DateKey.addDays(date, 1)
        }
        for row in winners.values where !row.isDeleted {
            if let d = row.date, d >= rangeStart, d <= rangeEnd {
                items.append(PlannerItem(task: row, kind: .exception))
            }
        }
        return items
    }

    /// "Every Mon, Wed", "Every day", "Monthly on day 31", plus ", until 31 Dec".
    static func summary(_ rule: Recurrence) -> String {
        var text: String
        switch rule.type {
        case .daily:
            let every = rule.every ?? 1
            text = every == 1 ? "Every day" : "Every \(every) days"
        case .weekly:
            let days = rule.weekdays ?? []
            text = days.count == 7 ? "Every day" : "Every " + days.map { Format.weekdayName($0) }.joined(separator: ", ")
        case .monthly:
            text = "Monthly on day \(rule.day ?? 1)"
        }
        if let until = rule.until { text += ", until \(Format.shortDate(until))" }
        return text
    }
}
