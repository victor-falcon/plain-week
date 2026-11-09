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
    /// The day picked by clicking its header; the Done section shows its
    /// completed tasks, or every completed task when nil.
    var selectedDay: String?
    /// The Backlog and Done sidebar (remembered across launches).
    var showSidebar: Bool = UserDefaults.standard.object(forKey: "showSidebar") as? Bool ?? true {
        didSet { UserDefaults.standard.set(showSidebar, forKey: "showSidebar") }
    }

    /// Selects a day, or clears the selection when it is already selected.
    func select(_ day: String) { selectedDay = selectedDay == day ? nil : day }
    /// Focus mode: every day but today is blurred (remembered across launches).
    var focusMode: Bool = UserDefaults.standard.bool(forKey: PlannerModel.focusModeKey) {
        didSet { UserDefaults.standard.set(focusMode, forKey: Self.focusModeKey) }
    }

    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored var onDayChange: ((String) -> Void)?

    static let carryOverKey = "carryOver"
    static let focusModeKey = "focusMode"

    /// Turns focus mode on or off; turning it on shows the current week, where
    /// today is.
    func toggleFocusMode() {
        focusMode.toggle()
        if focusMode { goToToday() }
    }

    /// Whether a day (or Someday, `nil`) is blurred by focus mode.
    func isBlurred(_ date: String?) -> Bool { focusMode && date != today }

    init(today: String = DateKey.local()) {
        self.today = today
        weekStart = DateKey.startOfWeek(today)
    }

    /// The days scroll freely, so `weekStart` is the first (leftmost) visible
    /// day; it is a Monday after "Today" or a week jump, any day after a scroll.
    static let maxVisibleDays = 7
    /// Day cards are never narrower than this; a window too narrow for seven
    /// shows fewer and scrolls to the rest.
    static let minCardWidth: CGFloat = 400

    /// How many whole days fit the window (1 to 7), set by the day strip.
    var visibleCount = PlannerModel.maxVisibleDays

    /// How many cards of at least `minCardWidth` fit in `width`.
    static func visibleCount(for width: CGFloat, spacing: CGFloat) -> Int {
        guard width > 0 else { return maxVisibleDays }
        return max(1, min(maxVisibleDays, Int((width + spacing) / (minCardWidth + spacing))))
    }

    /// Whether today is one of the days on screen.
    var showsToday: Bool { today >= weekStart && today <= DateKey.addDays(weekStart, visibleCount - 1) }
    var days: [String] { (0..<visibleCount).map { DateKey.addDays(weekStart, $0) } }
    /// The day the header names (month, week number): the middle visible day.
    var headerDay: String { DateKey.addDays(weekStart, visibleCount / 2) }

    /// Shows the current week from Monday when a whole week fits, otherwise
    /// starts at today so it is always on screen.
    func goToToday() {
        weekStart = visibleCount == Self.maxVisibleDays ? DateKey.startOfWeek(today) : today
    }
    func previousWeek() { weekStart = DateKey.addDays(weekStart, -7) }
    func nextWeek() { weekStart = DateKey.addDays(weekStart, 7) }
    /// Moves the visible days by `days` (scroll wheel, drag).
    func scroll(by days: Int) { if days != 0 { weekStart = DateKey.addDays(weekStart, days) } }

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
        let followWeek = showsToday
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
