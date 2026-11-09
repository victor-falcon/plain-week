import SwiftUI

/// The planner: header, the week (Monday to Friday, then Saturday over Sunday)
/// and Someday below, following the web app's layout (docs/style.md).
struct PlannerView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @FocusState private var focusedList: String?

    var body: some View {
        @Bindable var planner = planner
        let week = store.week(planner.weekStart)
        let someday = store.someday(weekStart: planner.weekStart, today: planner.today)

        ScrollView {
            PlannerContent(week: week, someday: someday, focus: $focusedList)
        }
        .background(Theme.background)
        .overlay(alignment: .bottom) { ToastView() }
        .sheet(item: $planner.openTask) { open in
            TaskDetailView(taskId: open.id)
        }
        .onChange(of: planner.focusRequest) { _, request in
            guard let request else { return }
            focusedList = request
            planner.focusRequest = nil
        }
    }
}

/// Header, week and Someday (the scrolling content of the planner).
struct PlannerContent: View {
    var week: [String: [PlannerItem]]
    var someday: [PlannerItem]
    var focus: FocusState<String?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 40) {
            PlannerHeader()
            WeekGrid(week: week, focus: focus)
            SomedaySection(items: someday, focus: focus)
        }
        .padding(.horizontal, 24)
        .padding(.top, 20)
        .padding(.bottom, 48)
    }
}

struct PlannerHeader: View {
    @Environment(PlannerModel.self) private var planner
    @Environment(TaskStore.self) private var store
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        let thursday = DateKey.addDays(planner.weekStart, 3)
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Button(action: planner.goToToday) {
                Text(Format.monthYear(thursday))
                    .font(.system(size: 36, weight: .bold))
                    .tracking(-1.2)
                    .foregroundStyle(planner.isCurrentWeek ? Theme.foreground : Theme.plannerAccent)
            }
            .buttonStyle(.plain)
            .help("Current week (⌘T)")
            Text("W\(DateKey.isoWeekNumber(planner.weekStart))")
                .font(.system(size: 36, weight: .bold))
                .tracking(-1.2)
                .foregroundStyle(Theme.mutedForeground.opacity(0.5))
            Spacer()
            WeekButton(systemImage: "chevron.left", help: "Previous week (⌘[)", offset: -7, action: planner.previousWeek)
            WeekButton(systemImage: "chevron.right", help: "Next week (⌘])", offset: 7, action: planner.nextWeek)
        }
    }
}

/// A round week button. Dropping a task on it moves the task a week back or
/// forward (the web app's drag edge zones).
struct WeekButton: View {
    var systemImage: String
    var help: String
    var offset: Int
    var action: () -> Void
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @State private var targeted = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .frame(width: 40, height: 40)
                .background(Circle().fill(targeted ? Theme.foreground.opacity(0.15) : Theme.secondary))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help(help)
        .dropDestination(for: String.self) { ids, _ in
            guard let id = ids.first, let item = store.item(id) else { return false }
            let base = item.task.date ?? planner.weekStart
            let date = DateKey.addDays(base, offset)
            store.perform("Move Task", undoManager: undoManager) { _ = store.move(id, to: date) }
            planner.show("Moved to \(Format.weekdayDate(date)).", canUndo: true)
            return true
        } isTargeted: { targeted = $0 }
    }
}

/// The seven days side by side, Monday to Sunday, each with the same number
/// of ruled rows.
struct WeekGrid: View {
    var week: [String: [PlannerItem]]
    var focus: FocusState<String?>.Binding
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        HStack(alignment: .top, spacing: 20) {
            ForEach(planner.days, id: \.self) { day in
                DayColumn(date: day, items: week[day] ?? [], minRows: 10, focus: focus)
            }
        }
    }
}

struct DayColumn: View {
    var date: String
    var items: [PlannerItem]
    var minRows: Int
    var focus: FocusState<String?>.Binding
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        let isToday = date == planner.today
        let isWeekend = DateKey.isoWeekday(date) >= 6
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(Format.dayHeader(date))
                    .font(.system(size: 15, weight: .bold))
                    .tracking(-0.3)
                    .foregroundStyle(isToday ? Theme.plannerAccent : isWeekend ? Theme.mutedForeground.opacity(0.7) : Theme.foreground)
                Spacer()
                Text(Format.weekday(date))
                    .font(.system(size: 15))
                    .foregroundStyle(isToday ? Theme.plannerAccentMuted : Theme.mutedForeground.opacity(isWeekend ? 0.5 : 0.7))
            }
            .frame(height: Theme.rowHeight - 2, alignment: .bottom)
            .padding(.bottom, 10)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(isToday ? Theme.plannerAccent : isWeekend ? Theme.mutedForeground.opacity(0.25) : Theme.foreground)
                    .frame(height: 2)
            }
            TaskListView(listKey: date, date: date, items: items, minRows: minRows, focus: focus)
        }
        .background(alignment: .top) {
            if isToday {
                UnevenRoundedRectangle(topLeadingRadius: 8, topTrailingRadius: 8)
                    .fill(Theme.todayTint)
                    .padding(.horizontal, -10)
                    .padding(.top, -10)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

struct SomedaySection: View {
    var items: [PlannerItem]
    var focus: FocusState<String?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Someday")
                .font(.system(size: 15, weight: .bold))
                .tracking(-0.3)
                .frame(height: Theme.rowHeight - 2, alignment: .bottom)
                .padding(.bottom, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.foreground).frame(height: 2) }
            TaskListView(listKey: DataTransfer.somedayKey, date: nil, items: items, minRows: 2, columns: 3, focus: focus)
        }
    }
}

struct ToastView: View {
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        if let toast = planner.toast {
            HStack(spacing: 14) {
                Text(toast.message).font(.callout)
                if toast.canUndo, undoManager?.canUndo == true {
                    Button("Undo") {
                        undoManager?.undo()
                        planner.toast = nil
                    }
                    .buttonStyle(.borderless)
                    .fontWeight(.semibold)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.border))
            .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
            .padding(.bottom, 24)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .id(toast.id)
        }
    }
}
