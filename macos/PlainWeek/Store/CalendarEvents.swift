import EventKit
import Foundation
import Observation

/// Events from the Mac's Calendar, read-only, shown in each day card so tasks
/// can be planned around meetings. Off until turned on in Settings, which
/// asks macOS for access.
@MainActor
@Observable
final class CalendarEvents {
    struct Event: Identifiable, Hashable {
        var id: String
        var title: String
        /// "09:30", or nil for an all-day event.
        var time: String?
        var start: Date
    }

    static let enabledKey = "showCalendarEvents"

    private(set) var byDay: [String: [Event]] = [:]
    private(set) var authorized = false
    @ObservationIgnored private let eventStore = EKEventStore()
    @ObservationIgnored private var loadedRange: (String, String)?
    @ObservationIgnored private var observer: NSObjectProtocol?

    var enabled: Bool { UserDefaults.standard.bool(forKey: Self.enabledKey) }

    init() {
        authorized = Self.hasAccess
        observer = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: eventStore, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reload() }
        }
    }

    private static var hasAccess: Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(macOS 14, *) { return status == .fullAccess }
        return status == .authorized
    }

    /// Turns the feature on or off; turning it on asks for access once.
    func setEnabled(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: Self.enabledKey)
        guard on else { byDay = [:]; return }
        if authorized { reload(); return }
        eventStore.requestFullAccessToEvents { granted, _ in
            Task { @MainActor in
                self.authorized = granted
                self.reload()
            }
        }
    }

    /// The events of a day (from what `prepare` loaded).
    func events(on day: String) -> [Event] {
        guard enabled, authorized else { return [] }
        return byDay[day] ?? []
    }

    /// Loads a few weeks around `day` unless they are loaded already. Called
    /// when the strip moves, never while drawing.
    func prepare(around day: String) {
        guard enabled, authorized else { return }
        if let range = loadedRange, day >= DateKey.addDays(range.0, 7), day <= DateKey.addDays(range.1, -7) { return }
        load(around: day)
    }

    private func reload() {
        guard let range = loadedRange else { load(around: DateKey.local()); return }
        load(from: range.0, to: range.1)
    }

    private func load(around day: String) {
        load(from: DateKey.addDays(DateKey.startOfWeek(day), -14), to: DateKey.addDays(DateKey.startOfWeek(day), 34))
    }

    private func load(from start: String, to end: String) {
        loadedRange = (start, end)
        guard enabled, authorized else { byDay = [:]; return }
        let predicate = eventStore.predicateForEvents(withStart: DateKey.localDate(start), end: DateKey.localDate(DateKey.addDays(end, 1)),
                                                      calendars: eventStore.calendars(for: .event).filter { $0.title != CalendarPublisher.calendarName })
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.dateFormat = "HH:mm"
        var map: [String: [Event]] = [:]
        for event in eventStore.events(matching: predicate) {
            let day = DateKey.local(event.startDate)
            map[day, default: []].append(Event(id: event.eventIdentifier ?? UUID().uuidString, title: event.title ?? "Event",
                                               time: event.isAllDay ? nil : formatter.string(from: event.startDate), start: event.startDate))
        }
        for key in map.keys {
            map[key]?.sort { ($0.time == nil ? 0 : 1, $0.start) < ($1.time == nil ? 0 : 1, $1.start) }
        }
        byDay = map
    }
}
