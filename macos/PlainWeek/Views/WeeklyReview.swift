import SwiftUI

/// The weekly review (Go › Weekly Review, ⇧⌘R): the shown week at a glance
/// (done and time per day) and its unfinished tasks, each moved on with one
/// click: today, next week, the Backlog, or done. All undoable.
struct WeeklyReview: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @Environment(\.dismiss) private var dismiss
    var timeLog: TimeLog

    var body: some View {
        let monday = DateKey.startOfWeek(planner.weekStart)
        let days = DateKey.week(monday)
        let week = store.days(from: days[0], to: days[6])
        let all = days.flatMap { week[$0] ?? [] }
        let open = all.filter { !$0.task.done && !$0.isRecurring }
        let doneCount = all.filter(\.task.done).count
        let tracked = days.reduce(0) { $0 + timeLog.total(on: $1) }
        let pomodoros = days.reduce(0) { $0 + timeLog.pomodoros(on: $1) }

        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Weekly Review").font(Theme.title).tracking(-0.9)
                    Text("Week \(DateKey.isoWeekNumber(monday))  ·  \(Format.shortDate(days[0])) – \(Format.shortDate(days[6]))")
                        .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.mutedForeground)
                }
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                    .buttonStyle(PillButtonStyle())
            }

            HStack(spacing: 10) {
                stat("\(doneCount)", "done")
                stat("\(open.count)", "open")
                stat(TimeLog.format(tracked), "focused")
                if pomodoros > 0 { stat("\(pomodoros)", pomodoros == 1 ? "session" : "sessions") }
            }

            // Done per day, as small bars.
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(days, id: \.self) { day in
                    let p = store.progress(on: day)
                    VStack(spacing: 6) {
                        GeometryReader { proxy in
                            VStack(spacing: 0) {
                                Spacer(minLength: 0)
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(Theme.foreground)
                                    .frame(height: p.total == 0 ? 2 : max(2, proxy.size.height * CGFloat(p.done) / CGFloat(max(p.total, 1))))
                            }
                            .frame(maxWidth: .infinity)
                            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(Theme.hover))
                        }
                        .frame(height: 56)
                        Text(Format.weekday(day).prefix(1)).font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(day == planner.today ? Theme.foreground : Theme.mutedForeground)
                    }
                    .help("\(Format.weekdayDate(day)): \(p.done) of \(p.total) done, \(TimeLog.format(timeLog.total(on: day))) focused, \(timeLog.pomodoros(on: day)) Pomodoro sessions")
                }
            }

            Rectangle().fill(Theme.border).frame(height: 1)

            HStack {
                Text(open.isEmpty ? "Everything this week is done." : "Still open")
                    .font(.system(size: 15, weight: .bold))
                Spacer()
                if !open.isEmpty {
                    Button("Move All to Next Week") {
                        store.perform("Move to Next Week", undoManager: undoManager) {
                            for item in open { _ = store.move(item.id, to: DateKey.addDays(item.task.date ?? monday, 7)) }
                        }
                        planner.show("Moved \(open.count) to next week.", canUndo: true)
                    }
                    .buttonStyle(MonoPrimaryButtonStyle())
                }
            }

            ScrollView {
                VStack(spacing: 2) {
                    ForEach(open) { item in openRow(item) }
                }
            }
            .frame(maxHeight: 300)
        }
        .padding(28)
        .frame(width: 560)
        .background(Theme.background)
        .focusEffectDisabled()
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(Theme.heading).tracking(-0.6).monospacedDigit()
            Text(label.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(0.8).foregroundStyle(Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).fill(Theme.hover))
    }

    private func openRow(_ item: PlannerItem) -> some View {
        HStack(spacing: 10) {
            TaskCheckbox(color: item.task.color, done: false, size: 15)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.task.text).font(.system(size: 14)).lineLimit(1)
                Text(item.task.date.map { DoneList.dayLabel($0, today: planner.today) } ?? "Backlog")
                    .font(.system(size: 11)).foregroundStyle(Theme.mutedForeground)
            }
            Spacer(minLength: 8)
            action("Today", "sun.max") { store.move(item.id, to: planner.today) }
            action("Next week", "arrow.right") { store.move(item.id, to: DateKey.addDays(item.task.date ?? planner.today, 7)) }
            action("Backlog", "tray") { store.move(item.id, to: nil) }
            action("Mark as done", "checkmark") { store.toggleDone(item.id) }
        }
        .padding(.horizontal, 8)
        .frame(height: 44)
        .background(RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous).fill(Theme.hover.opacity(0.5)))
    }

    private func action(_ name: String, _ icon: String, _ run: @escaping () -> String?) -> some View {
        Button {
            withAnimation(Motion.standard) {
                _ = store.perform(name == "Mark as done" ? "Mark as Done" : "Move Task", undoManager: undoManager) { run() }
            }
        } label: {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .frame(width: 28, height: 28)
                .background(Circle().fill(Theme.background))
                .overlay(Circle().strokeBorder(Theme.border))
        }
        .buttonStyle(.pressable)
        .help(name)
    }
}
