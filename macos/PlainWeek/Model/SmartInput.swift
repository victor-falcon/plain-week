import Foundation

/// What a new-task row was given (the web app's `lib/planner/smart-*.ts`):
/// a leading "DD MMM" date and a leading 24-hour time, in either order.
struct ParsedNewTask: Equatable {
    var text: String
    var date: String?
    var time: String?
}

enum SmartInput {
    /// Month numbers by lowercase English and Spanish name.
    static let months: [String: Int] = [
        "jan": 1, "january": 1, "ene": 1, "enero": 1,
        "feb": 2, "february": 2, "febrero": 2,
        "mar": 3, "march": 3, "marzo": 3,
        "apr": 4, "april": 4, "abr": 4, "abril": 4,
        "may": 5, "mayo": 5,
        "jun": 6, "june": 6, "junio": 6,
        "jul": 7, "july": 7, "julio": 7,
        "aug": 8, "august": 8, "ago": 8, "agosto": 8,
        "sep": 9, "sept": 9, "september": 9, "septiembre": 9, "setiembre": 9,
        "oct": 10, "october": 10, "octubre": 10,
        "nov": 11, "november": 11, "noviembre": 11,
        "dec": 12, "december": 12, "dic": 12, "diciembre": 12,
    ]

    private static let leadingTime = try! NSRegularExpression(pattern: #"^(\d{1,2}):(\d{2})\s+(\S.*)$"#, options: [.dotMatchesLineSeparators])
    private static let leadingDate = try! NSRegularExpression(pattern: #"^(\d{1,2})\s+(\p{L}+)\.?\s+(\S.*)$"#, options: [.dotMatchesLineSeparators])

    private static func groups(_ regex: NSRegularExpression, _ text: String) -> [String]? {
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, range: range) else { return nil }
        return (1..<match.numberOfRanges).map { String(text[Range(match.range(at: $0), in: text)!]) }
    }

    /// "17:30 Gym" → time 17:30, text "Gym". An invalid time stays in the text.
    static func parseTime(_ input: String) -> (text: String, time: String?) {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let g = groups(leadingTime, text), let h = Int(g[0]), let m = Int(g[1]), h <= 23, m <= 59 else {
            return (text, nil)
        }
        return (g[2].trimmingCharacters(in: .whitespacesAndNewlines), String(format: "%02d:%@", h, g[1]))
    }

    /// "31 Dec Gym" → the next 31 December on or after `today`, text "Gym".
    static func parseDate(_ input: String, today: String) -> (text: String, date: String?) {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let g = groups(leadingDate, text), let day = Int(g[0]), day >= 1,
              let month = months[g[1].lowercased()] else { return (text, nil) }
        let year = DateKey.parts(today).year
        for offset in 0...8 {
            let candidate = year + offset
            guard DateKey.daysInMonth(year: candidate, month: month) >= day else { continue }
            let key = DateKey.make(candidate, month, day)
            if key >= today { return (g[2].trimmingCharacters(in: .whitespacesAndNewlines), key) }
        }
        return (text, nil)
    }

    static func parse(_ input: String, today: String) -> ParsedNewTask {
        var result = ParsedNewTask(text: input.trimmingCharacters(in: .whitespacesAndNewlines))
        for _ in 0..<2 {
            if result.date == nil { (result.text, result.date) = parseDate(result.text, today: today) }
            if result.time == nil { (result.text, result.time) = parseTime(result.text) }
        }
        return result
    }
}

/// Date labels.
enum Format {
    private static func formatter(_ template: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.setLocalizedDateFormatFromTemplate(template)
        return f
    }

    private static let monthYear = formatter("MMMM yyyy")
    private static let weekdayShort = formatter("EEE")
    private static let dayMonth = formatter("d MMM")
    private static let full = formatter("EEE d MMM yyyy")
    private static let weekdayDay = formatter("EEE d MMM")

    static func monthYear(_ key: String) -> String { monthYear.string(from: DateKey.localDate(key)) }
    private static let monthOnly = formatter("MMMM")
    static func month(_ key: String) -> String { monthOnly.string(from: DateKey.localDate(key)) }
    static func year(_ key: String) -> String { String(DateKey.parts(key).year) }
    static func weekday(_ key: String) -> String { weekdayShort.string(from: DateKey.localDate(key)) }
    static func shortDate(_ key: String) -> String { dayMonth.string(from: DateKey.localDate(key)) }
    static func fullDate(_ key: String) -> String { full.string(from: DateKey.localDate(key)) }
    static func weekdayDate(_ key: String) -> String { weekdayDay.string(from: DateKey.localDate(key)) }

    /// "Mon" for ISO weekday 1.
    static func weekdayName(_ iso: Int, long: Bool = false) -> String {
        let monday = "2026-10-12"
        let key = DateKey.addDays(monday, iso - 1)
        return long ? formatter("EEEE").string(from: DateKey.localDate(key)) : weekday(key)
    }

    /// "12 Oct" for a day header.
    static func dayHeader(_ key: String) -> String { shortDate(key) }
}
