import Foundation

/// 'YYYY-MM-DD' calendar-day keys with UTC arithmetic, so time zones and DST
/// never shift a day (the web app's `lib/recurrence/dates.ts`).
enum DateKey {
    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    static func make(_ year: Int, _ month: Int, _ day: Int) -> String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    static func parts(_ key: String) -> (year: Int, month: Int, day: Int) {
        let p = key.split(separator: "-").map { Int($0) ?? 0 }
        return (p[0], p[1], p[2])
    }

    /// Midnight UTC of the key.
    static func utcDate(_ key: String) -> Date {
        let p = parts(key)
        return utc.date(from: DateComponents(year: p.year, month: p.month, day: p.day))!
    }

    static func fromUTC(_ date: Date) -> String {
        let c = utc.dateComponents([.year, .month, .day], from: date)
        return make(c.year!, c.month!, c.day!)
    }

    /// The local calendar day of `date`.
    static func local(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return make(c.year!, c.month!, c.day!)
    }

    /// Local midnight of the key (for display with `DateFormatter`s).
    static func localDate(_ key: String, calendar: Calendar = .current) -> Date {
        let p = parts(key)
        return calendar.date(from: DateComponents(year: p.year, month: p.month, day: p.day))!
    }

    static func addDays(_ key: String, _ days: Int) -> String {
        fromUTC(utc.date(byAdding: .day, value: days, to: utcDate(key))!)
    }

    static func daysBetween(_ from: String, _ to: String) -> Int {
        utc.dateComponents([.day], from: utcDate(from), to: utcDate(to)).day!
    }

    /// 1 = Monday … 7 = Sunday.
    static func isoWeekday(_ key: String) -> Int {
        let weekday = utc.component(.weekday, from: utcDate(key)) // 1 = Sunday
        return weekday == 1 ? 7 : weekday - 1
    }

    static func dayOfMonth(_ key: String) -> Int { parts(key).day }

    static func daysInMonth(year: Int, month: Int) -> Int {
        let date = utc.date(from: DateComponents(year: year, month: month, day: 1))!
        return utc.range(of: .day, in: .month, for: date)!.count
    }

    /// The Monday of the week containing `key`.
    static func startOfWeek(_ key: String) -> String {
        addDays(key, -(isoWeekday(key) - 1))
    }

    /// The seven keys from `weekStart`.
    static func week(_ weekStart: String) -> [String] {
        (0..<7).map { addDays(weekStart, $0) }
    }

    /// ISO 8601 week number of the week containing `key`.
    static func isoWeekNumber(_ key: String) -> Int {
        let thursday = addDays(startOfWeek(key), 3)
        let p = parts(thursday)
        let dayOfYear = daysBetween(make(p.year, 1, 1), thursday)
        return dayOfYear / 7 + 1
    }
}

/// Timestamps and ids, as the web app writes them.
enum Clock {
    private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    private static var lastMillis: Int64 = 0

    /// ISO-8601 UTC with milliseconds, strictly increasing within this process,
    /// so a local change always beats the version it replaces.
    static func nextTimestamp(now: Date = Date()) -> String {
        var millis = Int64((now.timeIntervalSince1970 * 1000).rounded(.down))
        if millis <= lastMillis { millis = lastMillis + 1 }
        lastMillis = millis
        return formatter.string(from: Date(timeIntervalSince1970: Double(millis) / 1000))
    }

    static func parse(_ timestamp: String) -> Date? { formatter.date(from: timestamp) }

    /// UUID v7: 48-bit Unix milliseconds, version 7, RFC 4122 variant.
    static func uuidV7(now: Date = Date()) -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        for i in 0..<16 { bytes[i] = UInt8.random(in: 0...255) }
        let millis = UInt64(now.timeIntervalSince1970 * 1000)
        for i in 0..<6 { bytes[i] = UInt8((millis >> (8 * (5 - UInt64(i)))) & 0xFF) }
        bytes[6] = (bytes[6] & 0x0F) | 0x70
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let chars = Array(hex)
        return [0..<8, 8..<12, 12..<16, 16..<20, 20..<32].map { String(chars[$0]) }.joined(separator: "-")
    }
}
