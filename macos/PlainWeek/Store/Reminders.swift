import AppKit
import Foundation
import UserNotifications

/// Native notifications for tasks with a time ("Dentist at 14:00"), a set
/// number of minutes before, with Mark as Done and Snooze buttons. Planned
/// from local data only, so they work offline; rescheduled after every change.
@MainActor
final class Reminders: NSObject, UNUserNotificationCenterDelegate {
    static let leadKey = "reminderLeadMinutes"
    /// Off, at the time, or minutes before.
    static let leadChoices = [-1, 0, 5, 10, 15, 30, 60]
    static let category = "plainweek.task"
    static let prefix = "plainweek.reminder."

    struct Planned: Equatable {
        var id: String
        var taskId: String
        var title: String
        var body: String
        var fireDate: Date
    }

    private let store: TaskStore
    private var pending: DispatchWorkItem?
    /// Tasks completed from a notification while the app is busy.
    var onComplete: ((String) -> Void)?

    init(store: TaskStore) {
        self.store = store
        super.init()
    }

    /// Minutes before a task's time; nil when reminders are off.
    static var leadMinutes: Int? {
        let value = UserDefaults.standard.object(forKey: leadKey) as? Int ?? 5
        return value < 0 ? nil : value
    }

    /// Which reminders to schedule: timed, unfinished tasks from `now` over
    /// the next `days`, at most `limit` (macOS keeps 64 per app). `lead` is
    /// the Settings default (nil: off); a task's own `remind` wins (-1: off).
    static func plan(store: TaskStore, now: Date, lead: Int?, days: Int = 7, limit: Int = 60,
                     calendar: Calendar = .current) -> [Planned] {
        let today = DateKey.local(now, calendar: calendar)
        let end = DateKey.addDays(today, days)
        var result: [Planned] = []
        for (day, items) in store.days(from: today, to: end) {
            for item in items where !item.task.done {
                guard let time = item.task.time, let lead = item.task.remind ?? lead, lead >= 0 else { continue }
                let parts = time.split(separator: ":").compactMap { Int($0) }
                guard parts.count == 2,
                      let at = calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: DateKey.localDate(day, calendar: calendar))
                else { continue }
                let fire = at.addingTimeInterval(TimeInterval(-lead * 60))
                guard fire > now else { continue }
                let body = lead == 0 ? "Now · \(time)" : "In \(lead) min · \(time)"
                result.append(Planned(id: prefix + item.id, taskId: item.id, title: item.task.text, body: body, fireDate: fire))
            }
        }
        return Array(result.sorted { $0.fireDate < $1.fireDate }.prefix(limit))
    }

    func start() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let done = UNNotificationAction(identifier: "done", title: "Mark as Done")
        let snooze = UNNotificationAction(identifier: "snooze", title: "Snooze 10 min")
        center.setNotificationCategories([UNNotificationCategory(identifier: Self.category, actions: [done, snooze], intentIdentifiers: [])])
        // Ask at launch: without it macOS drops every notification, the
        // timer's included. Only the first launch shows the prompt.
        requestPermission()
    }

    /// What macOS allows Plain Week, for Settings.
    enum Permission: Equatable { case unknown, allowed, silent, denied }

    static func permission() async -> Permission {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined: return .unknown
        case .denied: return .denied
        default: return settings.soundSetting == .enabled ? .allowed : .silent
        }
    }

    /// System Settings › Notifications › Plain Week.
    static func openSystemSettings() {
        let id = Bundle.main.bundleIdentifier ?? "app.plainweek.mac"
        if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)") {
            NSWorkspace.shared.open(url)
        }
    }

    /// Asks for permission (at launch, and when reminders are turned on).
    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
            Task { @MainActor in self.reschedule() }
        }
    }

    /// Debounced: replaces every planned reminder after data changes.
    func scheduleSoon() {
        pending?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.reschedule() }
        pending = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
    }

    func reschedule() {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ours = requests.map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
            Task { @MainActor in
                center.removePendingNotificationRequests(withIdentifiers: ours)
                for planned in Self.plan(store: self.store, now: Date(), lead: Self.leadMinutes) {
                    self.add(planned)
                }
            }
        }
    }

    private func add(_ planned: Planned, sound: Bool = true) {
        let content = UNMutableNotificationContent()
        content.title = planned.title
        content.body = planned.body
        content.categoryIdentifier = Self.category
        content.userInfo = ["taskId": planned.taskId]
        if sound { content.sound = .default }
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: planned.fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: planned.id, content: content, trigger: trigger))
    }

    /// A notification now (the Pomodoro phase changes, a day finished).
    static func notify(_ title: String, _ body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    // MARK: UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content
        let taskId = info.userInfo["taskId"] as? String
        let action = response.actionIdentifier
        let title = info.title
        Task { @MainActor in
            defer { completionHandler() }
            guard let taskId else { return }
            switch action {
            case "done":
                if self.store.item(taskId)?.task.done == false { self.onComplete?(taskId) }
            case "snooze":
                self.add(Planned(id: Self.prefix + taskId + ".snooze", taskId: taskId, title: title,
                                 body: "Snoozed", fireDate: Date().addingTimeInterval(600)))
            default:
                TimerActions.showPlanner()
            }
        }
    }
}
