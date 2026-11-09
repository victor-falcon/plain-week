import SwiftUI

/// The planner: a large header, the days as a strip of rounded cards (seven
/// visible, scrolling sideways through the past and future), and Someday below.
/// Minimal, type-led and soft-cornered, in Apple's idiom.
struct PlannerView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @FocusState private var focusedList: String?

    var body: some View {
        @Bindable var planner = planner
        let someday = store.someday(weekStart: DateKey.startOfWeek(planner.weekStart), today: planner.today)

        ScrollView(.vertical) {
            PlannerContent(someday: someday, focus: $focusedList)
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
    var someday: [PlannerItem]
    var focus: FocusState<String?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 36) {
            PlannerHeader()
            DayStrip(focus: focus)
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
        let thursday = planner.headerDay
        HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(Format.month(thursday))
                    .font(Theme.display)
                    .tracking(-1.8)
                    .foregroundStyle(planner.showsToday ? Theme.foreground : Theme.plannerAccent)
                    .contentTransition(.numericText())
                Text("\(Format.year(thursday))  ·  Week \(DateKey.isoWeekNumber(thursday))")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
            }
            Spacer()
            HStack(spacing: 8) {
                FocusButton()
                if !planner.showsToday {
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
            .animation(.snappy(duration: 0.2), value: planner.showsToday)
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

/// The days as one horizontal strip: seven cards fill the width and the strip
/// scrolls through earlier and later days, snapping to day edges. A trackpad
/// swipes it, a mouse wheel over it steps a day per notch, and dragging a day
/// header or empty space pans it. `planner.weekStart` is the first visible day,
/// so the header and the week buttons follow the scroll and move it.
struct DayStrip: View {
    var focus: FocusState<String?>.Binding
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.staticDayStrip) private var staticStrip
    @State private var anchor: String?
    @State private var position: String?
    @State private var pan = StripPan()
    @State private var wheelMonitor: Any?
    @State private var hovering = false

    /// Days rendered either side of the anchor (lazily); the anchor moves when
    /// the strip gets near either end, so it never runs out.
    private static let reach = 400
    static let spacing: CGFloat = 12

    var body: some View {
        if staticStrip {
            // Headless snapshots: ImageRenderer cannot draw a ScrollView.
            HStack(alignment: .top, spacing: Self.spacing) {
                ForEach(planner.days, id: \.self) { day in card(day).frame(maxWidth: .infinity) }
            }
        } else {
            scrollingStrip
        }
    }

    private func card(_ day: String) -> some View {
        DayColumn(date: day, items: store.days(from: day, to: day)[day] ?? [], minRows: 9, focus: focus)
    }

    private var scrollingStrip: some View {
        let center = anchor ?? planner.weekStart
        let days = (-Self.reach...Self.reach).map { DateKey.addDays(center, $0) }
        return ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: Self.spacing) {
                ForEach(days, id: \.self) { day in
                    card(day)
                        .containerRelativeFrame(.horizontal, count: PlannerModel.visibleDays, spacing: Self.spacing)
                        .id(day)
                }
            }
            .scrollTargetLayout()
            .offset(x: pan.offset)
        }
        .scrollIndicators(.never)
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $position, anchor: .leading)
        .environment(\.stripPan, pan)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            pan.step = (width + Self.spacing) / CGFloat(PlannerModel.visibleDays)
        }
        .onHover { hovering = $0 }
        .onAppear {
            anchor = planner.weekStart
            position = planner.weekStart
            pan.onCommit = { days in withAnimation(.smooth(duration: 0.35)) { planner.scroll(by: days) } }
            installWheelMonitor()
        }
        .onDisappear(perform: removeWheelMonitor)
        // A scroll moves the first visible day...
        .onChange(of: position) { _, day in
            guard let day, day != planner.weekStart else { return }
            planner.weekStart = day
        }
        // ...and the buttons, "Today", the wheel and drags move the scroll.
        .onChange(of: planner.weekStart) { _, day in
            if let anchor, abs(DateKey.daysBetween(anchor, day)) > Self.reach - 60 {
                self.anchor = day
                position = day
                return
            }
            guard position != day else { return }
            withAnimation(.smooth(duration: 0.35)) { position = day }
        }
    }

    /// A mouse wheel (not a trackpad) over the strip steps one day per notch:
    /// down or right goes forward, up or left back.
    private func installWheelMonitor() {
        guard wheelMonitor == nil else { return }
        wheelMonitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
            guard hovering, !event.hasPreciseScrollingDeltas else { return event }
            let dx = event.scrollingDeltaX, dy = event.scrollingDeltaY
            let delta = abs(dx) > abs(dy) ? dx : dy
            guard delta != 0 else { return event }
            withAnimation(.smooth(duration: 0.25)) { planner.scroll(by: delta < 0 ? 1 : -1) }
            return nil
        }
    }

    private func removeWheelMonitor() {
        if let wheelMonitor { NSEvent.removeMonitor(wheelMonitor) }
        wheelMonitor = nil
    }
}

/// Click-and-drag panning of the day strip. Day headers and empty rows report
/// their horizontal drags here; the strip follows the pointer and, on release,
/// moves by the nearest whole number of days (with a flick carrying further).
@Observable
final class StripPan {
    var offset: CGFloat = 0
    @ObservationIgnored var step: CGFloat = 160
    @ObservationIgnored var onCommit: ((Int) -> Void)?

    func changed(_ value: DragGesture.Value) {
        offset = value.translation.width
    }

    func ended(_ value: DragGesture.Value) {
        let travel = value.predictedEndTranslation.width
        let days = step > 0 ? Int((-travel / step).rounded()) : 0
        withAnimation(.smooth(duration: 0.3)) { offset = 0 }
        onCommit?(max(-28, min(28, days)))
    }
}

private struct StripPanKey: EnvironmentKey { static let defaultValue: StripPan? = nil }
private struct StaticDayStripKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    var stripPan: StripPan? {
        get { self[StripPanKey.self] }
        set { self[StripPanKey.self] = newValue }
    }

    /// Draws the seven visible days without a ScrollView (headless snapshots).
    var staticDayStrip: Bool {
        get { self[StaticDayStripKey.self] }
        set { self[StaticDayStripKey.self] = newValue }
    }
}

/// Lets a view pan the day strip by dragging sideways (when inside one).
struct StripPanGesture: ViewModifier {
    @Environment(\.stripPan) private var pan

    func body(content: Content) -> some View {
        if let pan {
            content.simultaneousGesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        pan.changed(value)
                    }
                    .onEnded { value in pan.ended(value) }
            )
        } else {
            content
        }
    }
}

extension View {
    func stripPanGesture() -> some View { modifier(StripPanGesture()) }
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
            .contentShape(Rectangle())
            .stripPanGesture()
            TaskListView(listKey: date, date: date, items: items, minRows: minRows, focus: focus)
            Spacer(minLength: 0)
        }
        // Cards line up at the same height; a long list grows its own card.
        .frame(minHeight: 48 + CGFloat(minRows) * Theme.rowHeight, alignment: .top)
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
