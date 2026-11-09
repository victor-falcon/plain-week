import Foundation

/// Natural typing in a new-task row, on top of the leading "DD MMM" date and
/// "HH:mm" time the web app reads (`SmartInput`). Words anywhere in the text:
///
/// - Date: `today`, `tomorrow` (`tmr`), `backlog` (or `someday`), a weekday (`fri`, `friday`:
///   the next one, today counts), `next week` (next Monday).
/// - Time: `@11:30`, `@9`, `@9am`, `@5:15pm`.
/// - Color: any color name (`#yellow`, `#red`, `#orange`, …) plus `#blue`,
///   `#purple`, `#violet`, `#gray` and `#none`.
/// - Repeat: `daily`, `weekly`, `monthly`, `weekdays`, `weekends`, `every day`,
///   `every 3 days`, `every week`, `every month`, `every weekday`,
///   `every mon`, `every mon, wed and fri`.
///
/// Recognised words leave the text; the last date wins. If nothing would be
/// left, the input is kept as typed.
struct QuickTask: Equatable {
    enum DateChoice: Equatable {
        /// Keep the list the row belongs to.
        case list
        case day(String)
        case someday
    }

    var text: String
    var date: DateChoice = .list
    var time: String?
    var color: TaskColor?
    /// A rule without its anchor; `rule(anchor:)` completes it.
    var repeatSpec: RepeatSpec?

    enum RepeatSpec: Equatable {
        case daily(Int)
        /// Weekdays; empty means the anchor's own weekday.
        case weekly([Int])
        /// The anchor's day of the month.
        case monthly

        func rule(anchor: String) -> Recurrence {
            switch self {
            case let .daily(every): .daily(every: every)
            case let .weekly(days): .weekly(days.isEmpty ? [DateKey.isoWeekday(anchor)] : days)
            case .monthly: .monthly(day: DateKey.dayOfMonth(anchor))
            }
        }

        var label: String {
            switch self {
            case let .daily(every): every == 1 ? "Daily" : "Every \(every) days"
            case let .weekly(days):
                days.isEmpty ? "Weekly" : days == [1, 2, 3, 4, 5] ? "Weekdays"
                    : "Every " + days.map { Format.weekdayName($0) }.joined(separator: ", ")
            case .monthly: "Monthly"
            }
        }
    }

    /// The day the task lands on: its own date, else the list's (Someday when
    /// nil). A repeating task needs a date, so Someday then means today.
    func targetDate(listDate: String?, today: String) -> String? {
        switch date {
        case let .day(day): return day
        case .someday: return repeatSpec == nil ? nil : today
        case .list: return listDate ?? (repeatSpec == nil ? nil : today)
        }
    }

    /// Whether anything besides the text was recognised.
    var hasExtras: Bool { date != .list || time != nil || color != nil || repeatSpec != nil }
}

enum QuickAdd {
    static let weekdays: [String: Int] = [
        "mon": 1, "monday": 1, "tue": 2, "tues": 2, "tuesday": 2, "wed": 3, "wednesday": 3,
        "thu": 4, "thur": 4, "thurs": 4, "thursday": 4, "fri": 5, "friday": 5,
        "sat": 6, "saturday": 6, "sun": 7, "sunday": 7,
    ]

    static let colors: [String: TaskColor] = {
        var map = Dictionary(uniqueKeysWithValues: TaskColor.allCases.map { ($0.rawValue, $0) })
        map["blue"] = .cornflower
        map["purple"] = .lilac
        map["violet"] = .lilac
        map["gray"] = .grey
        return map
    }()

    private static let time = try! NSRegularExpression(pattern: #"^@(\d{1,2})(?::(\d{2}))?(am|pm)?$"#, options: [.caseInsensitive])

    /// Reads `input` typed into a list; `today` is 'YYYY-MM-DD'.
    static func parse(_ input: String, today: String) -> QuickTask {
        // The web app's leading "31 Dec" / "17:30" first.
        let smart = SmartInput.parse(input, today: today)
        var result = QuickTask(text: smart.text)
        if let date = smart.date { result.date = .day(date) }
        result.time = smart.time

        let words = smart.text.split(whereSeparator: \.isWhitespace).map(String.init)
        var kept: [String] = []
        var i = 0
        func word(_ index: Int) -> String? {
            index < words.count ? normalized(words[index]) : nil
        }

        while i < words.count {
            let raw = words[i]
            let w = normalized(raw)

            if raw.hasPrefix("#"), let color = colors[String(w.dropFirst())] {
                result.color = color
            } else if raw.hasPrefix("@"), let parsed = parseTime(raw) {
                result.time = parsed
            } else if w == "today" {
                result.date = .day(today)
            } else if w == "tomorrow" || w == "tmr" || w == "tmrw" {
                result.date = .day(DateKey.addDays(today, 1))
            } else if w == "someday" || w == "backlog" {
                result.date = .someday
            } else if w == "next", word(i + 1) == "week" {
                result.date = .day(DateKey.addDays(DateKey.startOfWeek(today), 7))
                i += 1
            } else if w == "daily" || w == "everyday" {
                result.repeatSpec = .daily(1)
            } else if w == "weekly" {
                result.repeatSpec = .weekly([])
            } else if w == "monthly" {
                result.repeatSpec = .monthly
            } else if w == "weekdays" {
                result.repeatSpec = .weekly([1, 2, 3, 4, 5])
            } else if w == "weekends" {
                result.repeatSpec = .weekly([6, 7])
            } else if w == "every", let (spec, used) = parseEvery(words, from: i + 1) {
                result.repeatSpec = spec
                i += used
            } else if let weekday = weekdays[w] {
                result.date = .day(nextDate(weekday: weekday, from: today))
            } else {
                kept.append(raw)
            }
            i += 1
        }

        let text = kept.joined(separator: " ")
        guard !text.isEmpty else {
            // Nothing left to name the task: keep what was typed.
            return QuickTask(text: input.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        result.text = text
        return result
    }

    /// Lowercased, without trailing punctuation ("fri," → "fri").
    private static func normalized(_ word: String) -> String {
        word.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ",.;"))
    }

    /// "@11:30", "@9", "@9am", "@5:15pm" → "HH:mm".
    static func parseTime(_ word: String) -> String? {
        let range = NSRange(word.startIndex..., in: word)
        guard let match = time.firstMatch(in: word, range: range) else { return nil }
        func group(_ n: Int) -> String? {
            Range(match.range(at: n), in: word).map { String(word[$0]) }
        }
        guard var hours = group(1).flatMap(Int.init) else { return nil }
        let minutes = group(2).flatMap(Int.init) ?? 0
        if let meridiem = group(3)?.lowercased() {
            guard (1...12).contains(hours) else { return nil }
            if meridiem == "pm", hours != 12 { hours += 12 }
            if meridiem == "am", hours == 12 { hours = 0 }
        }
        guard hours <= 23, minutes <= 59 else { return nil }
        return String(format: "%02d:%02d", hours, minutes)
    }

    /// What follows "every": returns the rule and how many words it used.
    private static func parseEvery(_ words: [String], from start: Int) -> (QuickTask.RepeatSpec, Int)? {
        guard start < words.count else { return nil }
        let first = normalized(words[start])
        switch first {
        case "day": return (.daily(1), 1)
        case "week": return (.weekly([]), 1)
        case "month": return (.monthly, 1)
        case "weekday": return (.weekly([1, 2, 3, 4, 5]), 1)
        default: break
        }
        if let n = Int(first), start + 1 < words.count, ["day", "days"].contains(normalized(words[start + 1])),
           (1...RecurrenceEngine.maxEveryDays).contains(n) {
            return (.daily(n), 2)
        }
        // "every mon", "every mon, wed and fri", "every mon,wed"
        var days: [Int] = []
        var used = 0
        var index = start
        while index < words.count {
            let parts = words[index].split(separator: ",").map { normalized(String($0)) }.filter { !$0.isEmpty }
            if parts == ["and"] || parts.isEmpty, !days.isEmpty {
                index += 1
                used += 1
                continue
            }
            let found = parts.compactMap { weekdays[$0] }
            guard !found.isEmpty, found.count == parts.count else { break }
            days += found
            index += 1
            used += 1
        }
        // A trailing "and" was not part of the list.
        if used > 0, normalized(words[start + used - 1]) == "and" { used -= 1 }
        guard !days.isEmpty else { return nil }
        return (.weekly(Array(Set(days)).sorted()), used)
    }

    /// The next date with this ISO weekday, on or after `today`.
    static func nextDate(weekday: Int, from today: String) -> String {
        let offset = (weekday - DateKey.isoWeekday(today) + 7) % 7
        return DateKey.addDays(today, offset)
    }
}
