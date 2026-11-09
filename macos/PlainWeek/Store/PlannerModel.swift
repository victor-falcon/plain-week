import AppKit
import Foundation
import Observation

/// A short message with an optional Undo, like the web app's Sonner toasts.
struct Toast: Identifiable, Equatable {
    let id = UUID()
    var message: String
    var canUndo: Bool
}

/// Opened task in the detail sheet; its id may change (an occurrence turning
/// into an exception row), so the sheet follows `id`.
struct OpenTask: Identifiable, Equatable {
    let sheetId = UUID()
    var id: String
}

/// UI state of the planner window: today, the shown week, the open task, the
/// toast. "Today" is re-read on a timer, on wake and on activation, so the
/// planner never stays on yesterday after the lid was closed.
@Observable
final class PlannerModel {
    private(set) var today: String
    var weekStart: String
    var openTask: OpenTask?
    var toast: Toast?
    /// The list whose new-task row should take focus (⌘N, after an action).
    var focusRequest: String?

    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored var onDayChange: ((String) -> Void)?

    static let carryOverKey = "carryOver"

    init(today: String = DateKey.local()) {
        self.today = today
        weekStart = DateKey.startOfWeek(today)
    }

    var isCurrentWeek: Bool { weekStart == DateKey.startOfWeek(today) }
    var days: [String] { DateKey.week(weekStart) }

    func goToToday() { weekStart = DateKey.startOfWeek(today) }
    func previousWeek() { weekStart = DateKey.addDays(weekStart, -7) }
    func nextWeek() { weekStart = DateKey.addDays(weekStart, 7) }

    func open(_ id: String) { openTask = OpenTask(id: id) }

    func show(_ message: String, canUndo: Bool = false) {
        toast = Toast(message: message, canUndo: canUndo)
        toastTask?.cancel()
        toastTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.toast = nil
        }
    }

    func startClock() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in self?.refreshToday() }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.refreshToday()
        })
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.refreshToday()
        })
    }

    func refreshToday() {
        let now = DateKey.local()
        guard now != today else { return }
        let followWeek = isCurrentWeek
        today = now
        if followWeek { goToToday() }
        onDayChange?(now)
    }

    static var carryOverEnabled: Bool {
        UserDefaults.standard.object(forKey: carryOverKey) as? Bool ?? true
    }
}

extension TaskStore {
    /// Runs carry over when the setting is on, with one quiet toast.
    func carryOverIfEnabled(today: String, planner: PlannerModel) {
        guard PlannerModel.carryOverEnabled else { return }
        let moved = carryOver(today: today)
        if moved > 0 {
            planner.show("Moved \(moved) unfinished \(moved == 1 ? "task" : "tasks") to today")
        }
    }
}
