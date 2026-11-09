import SwiftUI

/// The planner: a large header, the week as seven rounded day cards in one row,
/// and Someday below. Minimal, type-led and soft-cornered, in Apple's idiom.
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
        .scrollIndicators(.automatic)
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
        VStack(alignment: .leading, spacing: 36) {
            PlannerHeader()
            WeekGrid(week: week, focus: focus)
            SomedaySection(items: someday, focus: focus)
        }
        .padding(.horizontal, 32)
        // Room for the window controls over the hidden title bar.
        .padding(.top, 44)
        .padding(.bottom, 56)
    }
}

/// "November" in large bold type, "2026 · Week 46" quietly below it, and the
/// week controls on the right.
struct PlannerHeader: View {
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        let thursday = DateKey.addDays(planner.weekStart, 3)
        HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(Format.month(thursday))
                    .font(Theme.display)
                    .tracking(-1.8)
                    .foregroundStyle(planner.isCurrentWeek ? Theme.foreground : Theme.plannerAccent)
                    .contentTransition(.numericText())
                Text("\(Format.year(thursday))  ·  Week \(DateKey.isoWeekNumber(planner.weekStart))")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
            }
            Spacer()
            HStack(spacing: 8) {
                FocusButton()
                if !planner.isCurrentWeek {
                    Button("Today", action: planner.goToToday)
                        .buttonStyle(PillButtonStyle())
                        .help("Current week (⌘T)")
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
                HStack(spacing: 0) {
                    WeekButton(systemImage: "chevron.left", help: "Previous week (⌘[)", offset: -7, action: planner.previousWeek)
                    Divider().frame(height: 16)
                    WeekButton(systemImage: "chevron.right", help: "Next week (⌘])", offset: 7, action: planner.nextWeek)
                }
                .background(Capsule().fill(Theme.card))
                .overlay(Capsule().strokeBorder(Theme.border))
            }
            .padding(.bottom, 8)
            .animation(.snappy(duration: 0.2), value: planner.isCurrentWeek)
        }
    }
}

/// Turns focus mode on and off: everything but today is blurred.
struct FocusButton: View {
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        Button {
            withAnimation(.smooth(duration: 0.35)) { planner.toggleFocusMode() }
        } label: {
            Label("Focus", systemImage: planner.focusMode ? "scope" : "circle.dashed")
                .labelStyle(.titleAndIcon)
                .foregroundStyle(planner.focusMode ? Theme.background : Theme.foreground)
        }
        .buttonStyle(PillButtonStyle(active: planner.focusMode))
        .help(planner.focusMode ? "Turn off focus mode (⇧⌘F)" : "Focus on today (⇧⌘F)")
    }
}

/// Blurs and fades a card in focus mode; hovering it brings it back into view.
struct FocusBlur: ViewModifier {
    var blurred: Bool
    @State private var peeking = false

    func body(content: Content) -> some View {
        let hidden = blurred && !peeking
        content
            .blur(radius: hidden ? 7 : 0)
            .opacity(hidden ? 0.35 : 1)
            .saturation(hidden ? 0.4 : 1)
            .onHover { peeking = $0 }
            .animation(.smooth(duration: 0.3), value: hidden)
            .accessibilityHint(blurred ? "Hidden by focus mode" : "")
    }
}

extension View {
    func focusBlur(_ blurred: Bool) -> some View { modifier(FocusBlur(blurred: blurred)) }
}

/// A capsule text button.
struct PillButtonStyle: ButtonStyle {
    /// Filled with the foreground color while on.
    var active = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 14)
            .frame(height: 34)
            .background(Capsule().fill(active ? Theme.foreground : configuration.isPressed ? Theme.hover : Theme.card))
            .overlay(Capsule().strokeBorder(active ? .clear : Theme.border))
            .contentShape(Capsule())
    }
}

/// One half of the week control. Dropping a task on it moves the task a week
/// back or forward (the web app's drag edge zones).
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
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 40, height: 34)
                .background(Capsule().fill(targeted ? Theme.hover : .clear))
                .contentShape(Rectangle())
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

/// The seven days side by side, Monday to Sunday.
struct WeekGrid: View {
    var week: [String: [PlannerItem]]
    var focus: FocusState<String?>.Binding
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        // Every card as tall as the tallest one, so the row ends level.
        HStack(alignment: .top, spacing: 12) {
            ForEach(planner.days, id: \.self) { day in
                DayColumn(date: day, items: week[day] ?? [], minRows: 9, focus: focus)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// A rounded day card: the weekday in small caps over a large day number
/// (today's number sits in an accent circle, like Calendar), then its tasks.
struct DayColumn: View {
    var date: String
    var items: [PlannerItem]
    var minRows: Int
    var focus: FocusState<String?>.Binding
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        let isToday = date == planner.today
        let isWeekend = DateKey.isoWeekday(date) >= 6
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                Text("\(DateKey.dayOfMonth(date))")
                    .font(.system(size: 26, weight: .bold))
                    .tracking(-0.8)
                    .monospacedDigit()
                    .foregroundStyle(isToday ? Theme.background : isWeekend ? Theme.mutedForeground : Theme.foreground)
                    .frame(minWidth: 40, minHeight: 40)
                    .background { if isToday { Circle().fill(Theme.plannerAccent) } }
                Text(Format.weekday(date).uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(isToday ? Theme.plannerAccent : Theme.mutedForeground)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 6)
            TaskListView(listKey: date, date: date, items: items, minRows: minRows, focus: focus)
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(8)
        .padding(.top, 4)
        .background(
            RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                .fill(isToday ? Theme.todayTint : Theme.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                .strokeBorder(isToday ? Theme.plannerAccent.opacity(0.25) : Theme.border)
        )
        .frame(maxWidth: .infinity)
        .focusBlur(planner.isBlurred(date))
    }
}

struct SomedaySection: View {
    var items: [PlannerItem]
    var focus: FocusState<String?>.Binding
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Someday")
                .font(.system(size: 28, weight: .bold))
                .tracking(-0.8)
                .padding(.leading, 4)
            TaskListView(listKey: DataTransfer.somedayKey, date: nil, items: items, minRows: 3, columns: 3, focus: focus)
                .padding(8)
                .background(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous).fill(Theme.card))
                .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous).strokeBorder(Theme.border))
        }
        .focusBlur(planner.isBlurred(nil))
    }
}

struct ToastView: View {
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        if let toast = planner.toast {
            HStack(spacing: 14) {
                Text(toast.message).font(.system(size: 13, weight: .medium))
                if toast.canUndo, undoManager?.canUndo == true {
                    Button("Undo") {
                        undoManager?.undo()
                        planner.toast = nil
                    }
                    .buttonStyle(.borderless)
                    .fontWeight(.semibold)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .background(.regularMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.border))
            .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
            .padding(.bottom, 28)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .id(toast.id)
        }
    }
}
