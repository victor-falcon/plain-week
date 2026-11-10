import SwiftUI

/// The menu bar icon's label: a checklist, or the running clock.
struct MenuBarLabel: View {
    @Environment(FocusTimer.self) private var timer

    var body: some View {
        // No TimelineView here: the timer refreshes `clockText` once a second.
        if timer.isActive {
            Image(systemName: timer.isRunning ? "timer" : "pause.fill")
            Text(timer.clockText).monospacedDigit()
        } else {
            Image(systemName: "checklist")
        }
    }
}

/// The menu bar panel: today's progress and tasks (tick them or ▶ them), the
/// running timer, a quick-add field, and the way into the planner.
struct MenuBarView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(FocusTimer.self) private var timer
    @Environment(\.openWindow) private var openWindow
    @State private var text = ""

    var body: some View {
        if AppModel.shared.lock.isLocked {
            VStack(alignment: .leading, spacing: 12) {
                LockedNotice()
                Button("Unlock Plain Week…") { openPlanner() }
                    .buttonStyle(.pressable)
                    .font(.system(size: 12, weight: .semibold))
            }
            .padding(14)
            .frame(width: 320, alignment: .leading)
            .tint(Theme.foreground)
        } else {
            panel
        }
    }

    @ViewBuilder private var panel: some View {
        let today = planner.today
        let items = store.days(from: today, to: today)[today] ?? []
        let progress = store.progress(on: today)
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Today").font(.system(size: 15, weight: .bold))
                Text(Format.weekdayDate(today)).font(.system(size: 12)).foregroundStyle(Theme.mutedForeground)
                Spacer()
                Text("\(progress.done)/\(progress.total)").font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.mutedForeground)
            }
            DayProgressBar(date: today)

            if timer.isActive, let item = timer.taskId.flatMap({ store.item($0) }) {
                timerRow(item)
            }

            if items.isEmpty {
                Text("Nothing planned today.").font(.system(size: 13)).foregroundStyle(Theme.mutedForeground)
            } else {
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(items) { item in row(item, day: today) }
                    }
                }
                .frame(maxHeight: 280)
            }

            HStack(spacing: 8) {
                Image(systemName: "plus").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.mutedForeground)
                TextField("", text: $text, prompt: Text("Add to today…  (or ⌥Space anywhere)"))
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .onSubmit(add)
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).fill(Theme.hover))

            Divider()
            HStack {
                Button("Open Plain Week") { openPlanner() }
                Spacer()
                Button("Weekly Review") {
                    openPlanner()
                    planner.showReview = true
                }
            }
            .buttonStyle(.pressable)
            .font(.system(size: 12, weight: .semibold))
        }
        .padding(14)
        .frame(width: 320)
        .tint(Theme.foreground)
        .focusEffectDisabled()
    }

    private func row(_ item: PlannerItem, day: String) -> some View {
        HStack(spacing: 8) {
            Button { AppModel.shared.complete(item.id) } label: {
                TaskCheckbox(color: item.task.color, done: item.task.done, size: 15)
                    .frame(width: 24, height: 24).contentShape(Rectangle())
            }
            .help(item.task.done ? "Mark as not done" : "Mark as done")
            Text(item.task.text)
                .font(.system(size: 13))
                .strikethrough(item.task.done)
                .foregroundStyle(item.task.done ? Theme.mutedForeground : Theme.foreground)
                .lineLimit(1)
            Spacer(minLength: 4)
            if let time = item.task.time {
                Text(time).font(.system(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(Theme.mutedForeground)
            }
            if !item.task.done {
                Button {
                    TimerActions.start(item.id, day: day, store: store, planner: planner, timer: timer)
                } label: {
                    Image(systemName: "play.fill").font(.system(size: 8, weight: .bold))
                        .foregroundStyle(Theme.background)
                        .frame(width: 18, height: 18).background(Circle().fill(Theme.foreground))
                        .frame(width: 24, height: 24).contentShape(Rectangle())
                }
                .help("Start the timer")
            }
        }
        .buttonStyle(.pressable)
        .padding(.horizontal, 4)
        .frame(height: 30)
    }

    private func timerRow(_ item: PlannerItem) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                if timer.mode == .pomodoro {
                    PomodoroStatus()
                } else {
                    Text("TIMER").font(.system(size: 10, weight: .semibold)).tracking(0.8).foregroundStyle(Theme.mutedForeground)
                }
                Text(item.task.text).font(.system(size: 13, weight: .semibold)).lineLimit(1)
            }
            Spacer()
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(FocusTimer.format(timer.display(at: context.date)))
                    .font(.system(size: 15, weight: .bold).monospacedDigit())
            }
            Button { timer.toggle() } label: {
                Image(systemName: timer.isRunning ? "pause.fill" : "play.fill").font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.background).frame(width: 26, height: 26).background(Circle().fill(Theme.foreground))
            }
            Button { TimerActions.stop(timer: timer) } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.mutedForeground)
                    .frame(width: 24, height: 24).contentShape(Rectangle())
            }
        }
        .buttonStyle(.pressable)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).fill(Theme.hover))
    }

    private func add() {
        let quick = QuickAdd.parse(text, today: planner.today)
        guard !quick.text.isEmpty else { return }
        let target = quick.targetDate(listDate: planner.today, today: planner.today)
        store.perform("New Task", undoManager: TimerActions.mainWindow?.undoManager) {
            let id = store.create(text: quick.text, date: target, time: quick.time, duration: quick.duration, color: quick.color ?? .none)
            if let spec = quick.repeatSpec, let anchor = target { _ = try? store.setRecurrence(id, spec.rule(anchor: anchor)) }
        }
        text = ""
    }

    private func openPlanner() {
        if TimerActions.mainWindow == nil { openWindow(id: "planner") }
        TimerActions.showPlanner()
    }
}
