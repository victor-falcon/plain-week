import AppIntents
import Foundation

/// Shortcuts and Siri: add a task (with the same natural typing as a new-task
/// row), list today's tasks, start the timer on the next one.
struct AddTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Task"
    static let description = IntentDescription("Adds a task to Plain Week. Words like “tomorrow”, “@9:30”, “#red” or “daily” set its day, time, color and repeat.")

    @Parameter(title: "Task", requestValueDialog: "What should I add?")
    var text: String

    static var parameterSummary: some ParameterSummary { Summary("Add \(\.$text) to Plain Week") }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let model = AppModel.shared
        let today = model.planner.today
        let quick = QuickAdd.parse(text, today: today)
        guard !quick.text.isEmpty else { return .result(dialog: "There was nothing to add.") }
        let target = quick.targetDate(listDate: today, today: today)
        model.store.perform("New Task", undoManager: nil) {
            let id = model.store.create(text: quick.text, date: target, time: quick.time, duration: quick.duration, color: quick.color ?? .none)
            if let spec = quick.repeatSpec, let anchor = target { _ = try? model.store.setRecurrence(id, spec.rule(anchor: anchor)) }
        }
        let place = target.map { DoneList.dayLabel($0, today: today).lowercased() } ?? "the backlog"
        return .result(dialog: "Added “\(quick.text)” to \(place).")
    }
}

struct TodayTasksIntent: AppIntent {
    static let title: LocalizedStringResource = "Show Today’s Tasks"
    static let description = IntentDescription("Lists today’s unfinished tasks in Plain Week.")

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[String]> & ProvidesDialog {
        let model = AppModel.shared
        if model.lock.isLocked { return .result(value: [], dialog: "Plain Week is locked.") }
        let open = model.store.openTasks(on: model.planner.today)
        let lines = open.map { ($0.task.time.map { "\($0) " } ?? "") + $0.task.text }
        let dialog: IntentDialog = lines.isEmpty ? "Nothing left for today." : "\(lines.count) left today: \(lines.joined(separator: ", "))."
        return .result(value: lines, dialog: dialog)
    }
}

struct StartTimerIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Timer on Next Task"
    static let description = IntentDescription("Starts the Plain Week timer on today’s next unfinished task.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let model = AppModel.shared
        let today = model.planner.today
        guard let next = model.store.openTasks(on: today).first else { return .result(dialog: "Nothing left for today.") }
        if model.lock.isLocked {
            TimerActions.start(next.id, day: today, store: model.store, planner: model.planner, timer: model.timer)
            return .result(dialog: "Timer started.")
        }
        TimerActions.start(next.id, day: today, store: model.store, planner: model.planner, timer: model.timer)
        return .result(dialog: "Timer started on “\(next.task.text)”.")
    }
}

struct PlainWeekShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddTaskIntent(), phrases: ["Add a task in \(.applicationName)", "New \(.applicationName) task"],
                    shortTitle: "Add Task", systemImageName: "plus.circle")
        AppShortcut(intent: TodayTasksIntent(), phrases: ["What’s left today in \(.applicationName)", "Show my \(.applicationName) tasks"],
                    shortTitle: "Today’s Tasks", systemImageName: "checklist")
        AppShortcut(intent: StartTimerIntent(), phrases: ["Start a \(.applicationName) timer", "Focus with \(.applicationName)"],
                    shortTitle: "Start Timer", systemImageName: "timer")
    }
}
