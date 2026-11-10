import SwiftUI

/// The planner: a sidebar with the Backlog and the Done list, and the main
/// area with a large header over a strip of full-height day cards (scrolling
/// sideways through the past and future). Minimal, type-led and soft-cornered,
/// in Apple's idiom.
struct PlannerView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(TimeLog.self) private var timeLog
    @Environment(\.undoManager) private var undoManager
    @FocusState private var focusedList: String?

    private var dialogOpen: Bool { planner.openTask != nil || planner.showReview || planner.showPalette }

    /// A New Task dialog closed without a title leaves nothing behind.
    private func dropEmptyDraft() {
        guard let id = planner.draftId else { return }
        planner.draftId = nil
        guard let task = store.item(id)?.task,
              task.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if task.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, task.subtasks.isEmpty {
            store.delete(id)
        } else {
            store.update(id, TaskPatch(text: "Untitled"))
        }
    }

    var body: some View {
        @Bindable var planner = planner
        HStack(spacing: 0) {
            if planner.showSidebar {
                PlannerSidebar(focus: $focusedList)
                    .frame(width: Theme.sidebarWidth)
                    .sidebarSurface()
                    .transition(Motion.slide(.leading))
                Rectangle().fill(Theme.border).frame(width: 1)
            }
            PlannerMain(focus: $focusedList)
                .background(Theme.background)
        }
        // Title bar icons, level with the traffic lights, as in Mail or Notes:
        // the sidebar button just right of the lights; Backlog and New Task at
        // the sidebar's right edge, or (sidebar hidden) in the same row,
        // followed by the week arrows.
        .overlay(alignment: .topLeading) { TitleBarIcons() }
        .animation(Motion.structural, value: planner.showSidebar)
        .ignoresSafeArea(.container, edges: .top)
        .overlay(alignment: .bottom) { ToastView() }
        // A narrow window closes the sidebar; widening it brings the sidebar back.
        .onGeometryChange(for: Bool.self) { $0.size.width < PlannerModel.sidebarMinWindowWidth } action: { narrow in
            withAnimation(Motion.structural) { planner.adaptSidebar(narrow: narrow) }
        }
        // An open dialog (task, review, palette) blurs the planner behind it.
        .blur(radius: dialogOpen && !Motion.reduceTransparency ? 8 : 0)
        .animation(Motion.standard, value: dialogOpen)
        .sheet(item: $planner.openTask, onDismiss: dropEmptyDraft) { open in
            TaskDetailView(taskId: open.id, focusTags: open.focusTags)
        }
        .sheet(isPresented: $planner.showReview) { WeeklyReview(timeLog: timeLog) }
        .sheet(isPresented: $planner.showPalette) { CommandPaletteView() }
        .closesDialogOnOutsideClick(isOpen: dialogOpen) {
            planner.openTask = nil
            planner.showReview = false
            planner.showPalette = false
        }
        .onChange(of: planner.focusRequest) { _, request in
            guard let request else { return }
            if request == DataTransfer.somedayKey { planner.showSidebar = true }
            focusedList = request
            planner.focusRequest = nil
        }
    }
}

/// The header over the day strip, filling the window's height.
struct PlannerMain: View {
    var focus: FocusState<String?>.Binding
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(FocusTimer.self) private var timer
    @Environment(\.undoManager) private var undoManager
    @FocusState private var keyboardFocus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            PlannerHeader()
            DayStrip(focus: focus)
                .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, 28)
        // Room for the window controls over the hidden title bar.
        .padding(.top, 40)
        .padding(.bottom, 24)
        // Vim keys while nothing else takes the keyboard (see KeyboardNav).
        .focusable()
        .focused($keyboardFocus)
        // No ring around the whole planner; its buttons show their own.
        .focusEffectDisabled()
        .onKeyPress(phases: .down) { press in
            // Typing in a field (a new task, a rename) is never a planner key.
            if NSApp.keyWindow?.firstResponder is NSText { return .ignored }
            // "#" needs ⌥ on some keyboards (French, Swiss, …).
            guard press.modifiers.isDisjoint(with: [.command, .control, .option])
                  || (press.characters == "#" && press.modifiers.isDisjoint(with: [.command, .control])) else { return .ignored }
            let key = press.key == .escape ? "\u{1B}" : press.key == .return ? "\r" : press.characters
            return withAnimation(Motion.standard) {
                KeyboardNav.handle(key, store: store, planner: planner, timer: timer, undoManager: undoManager)
            } ? .handled : .ignored
        }
        .onAppear { keyboardFocus = true }
        // Back to the planner keys after typing, a sheet or the palette.
        .onChange(of: focus.wrappedValue) { _, list in if list == nil { keyboardFocus = true } }
        .onChange(of: planner.openTask) { _, open in if open == nil { keyboardFocus = true } }
        .onChange(of: planner.showPalette) { _, shown in if !shown { keyboardFocus = true } }
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
                    .foregroundStyle(planner.showsToday ? Theme.foreground : Theme.mutedForeground)
                    // A word, not a number: cross-fade rather than roll its letters.
                    .contentTransition(.opacity)
                    // A narrow window shrinks the month rather than the controls.
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text("\(Format.year(thursday))  ·  Week \(DateKey.isoWeekNumber(thursday))")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
                    .lineLimit(1)
            }
            .layoutPriority(1)
            Spacer(minLength: 0)
            // The full controls when they fit beside the month; in a narrow
            // window the compact ones: the timer without its task title and
            // Focus as an icon. Neither ever wraps or squeezes its labels.
            ViewThatFits(in: .horizontal) {
                controls(compact: false)
                controls(compact: true)
            }
            .padding(.bottom, 8)
            .animation(Motion.standard, value: planner.showsToday)
            .animation(Motion.standard, value: planner.filter)
        }
    }

    private func controls(compact: Bool) -> some View {
        HStack(spacing: 8) {
            ProjectPill()
            FilterPill()
            TimerPill(compact: compact)
            FocusButton(compact: compact)
            if !planner.showsToday {
                Button("Today", action: planner.goToToday)
                    .buttonStyle(PillButtonStyle())
                    .help("Current week (⌘T)")
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
            HStack(spacing: 0) {
                WeekButton(systemImage: "chevron.backward", help: "Previous week (⌘[)", offset: -7, action: planner.previousWeek)
                Divider().frame(height: 16)
                WeekButton(systemImage: "chevron.forward", help: "Next week (⌘])", offset: 7, action: planner.nextWeek)
            }
            .background(Capsule().fill(Theme.card))
            .overlay(Capsule().strokeBorder(Theme.border))
        }
        .fixedSize()
    }
}

/// The day's Calendar events (when turned on in Settings): quiet grey rows
/// above the tasks, all-day ones first, read-only.
struct DayEvents: View {
    var date: String
    @Environment(CalendarEvents.self) private var calendar

    var body: some View {
        let events = calendar.events(on: date)
        if !events.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(events) { event in
                    HStack(spacing: 8) {
                        Rectangle().fill(Theme.mutedForeground.opacity(0.5)).frame(width: 2, height: 14)
                        Text(event.title).font(.system(size: 12, weight: .medium)).lineLimit(1)
                        Spacer(minLength: 4)
                        Text(event.time ?? "all day").font(.system(size: 11).monospacedDigit())
                    }
                    .foregroundStyle(Theme.mutedForeground)
                    .padding(.horizontal, 6)
                    .frame(height: 24)
                    .help(event.title)
                }
            }
            .padding(.bottom, 6)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Calendar: " + events.map { "\($0.title) \($0.time ?? "all day")" }.joined(separator: ", "))
        }
    }
}

/// A thin bar across the top of a day card: the share of its tasks done.
struct DayProgressBar: View {
    var date: String
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        let progress = store.progress(on: date, filter: planner.filter)
        let fraction = progress.total == 0 ? 0 : CGFloat(progress.done) / CGFloat(progress.total)
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.border)
                Capsule()
                    .fill(Theme.foreground)
                    .frame(width: proxy.size.width * fraction)
                    .animation(Motion.structural, value: fraction)
            }
        }
        .frame(height: 4)
        .opacity(progress.total == 0 ? 0.5 : 1)
        .help(progress.total == 0 ? "No tasks" : "\(progress.done) of \(progress.total) done")
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(progress.done) of \(progress.total) done")
    }
}

/// ▶ in a day's header: starts the timer on its next unfinished task.
struct DayPlayButton: View {
    var date: String
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(FocusTimer.self) private var timer

    var body: some View {
        let next = store.openTasks(on: date, filter: planner.filter).first
        Button {
            TimerActions.startDay(date, store: store, planner: planner, timer: timer)
        } label: {
            Image(systemName: "play.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(next == nil ? Theme.mutedForeground.opacity(0.4) : Theme.background)
                .frame(width: 26, height: 26)
                .background(Circle().fill(next == nil ? Theme.border : Theme.foreground))
        }
        .buttonStyle(.pressable)
        .disabled(next == nil)
        .help(next.map { "Start the timer on “\($0.task.text)”" } ?? "Nothing left to do on this day")
        .accessibilityLabel(next.map { "Start the timer on \($0.task.text)" } ?? "Nothing left to do on \(Format.weekdayDate(date))")
    }
}

/// "▶ Start <task>" at the bottom of a day card, shown while the pointer is
/// over the day or the day is selected: starts the timer on its next
/// unfinished task. A day with nothing left shows no button.
struct DayStartButton: View {
    var date: String
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(FocusTimer.self) private var timer

    var body: some View {
        if let next = store.openTasks(on: date, filter: planner.filter).first {
            Button {
                TimerActions.startDay(date, store: store, planner: planner, timer: timer)
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 10, weight: .bold))
                    Text("Start")
                    Text(next.task.text)
                        .fontWeight(.regular)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .opacity(0.7)
                }
                .frame(maxWidth: 240)
                .fixedSize(horizontal: true, vertical: false)
            }
            .buttonStyle(MonoPrimaryButtonStyle())
            .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
            .help("Start the timer on “\(next.task.text)”")
            .accessibilityLabel("Start the timer on \(next.task.text)")
        }
    }
}

/// While a timer runs: the task and clock in the header; a click minimizes
/// the planner back to the mini window (only one of the two shows at a time).
struct TimerPill: View {
    /// Without the task's title, for a narrow window.
    var compact = false
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(FocusTimer.self) private var timer

    var body: some View {
        if timer.isActive, let item = timer.taskId.flatMap({ store.item($0) }) {
            Button {
                TimerActions.showMiniTimer(store: store, planner: planner, timer: timer)
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: timer.isRunning ? "timer" : "pause.fill")
                    if !compact { Text(item.task.text).lineLimit(1).frame(maxWidth: 160) }
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Text(FocusTimer.format(timer.display(at: context.date))).monospacedDigit()
                    }
                }
            }
            .buttonStyle(PillButtonStyle(active: false))
            .help(compact ? "Minimize to the mini timer: \(item.task.text)" : "Minimize to the mini timer")
            Button { TimerActions.stop(timer: timer) } label: {
                Image(systemName: "stop.fill").font(.system(size: 11, weight: .bold))
            }
            .buttonStyle(PillButtonStyle(active: false))
            .help("Stop the timer")
            .accessibilityLabel("Stop the timer")
        }
    }
}

/// Shows or hides the sidebar (also ⌃⌘S): a quiet icon, like Mail's and Notes'.
/// The icons in the window's title bar row.
struct TitleBarIcons: View {
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        ZStack(alignment: .topLeading) {
            HStack(spacing: 6) {
                TitleBarButton(systemImage: "sidebar.left",
                               help: planner.showSidebar ? "Hide Sidebar (⌃⌘S)" : "Show Sidebar (⌃⌘S)") {
                    withAnimation(Motion.structural) { planner.showSidebar.toggle() }
                }
                if !planner.showSidebar {
                    taskButtons
                    TitleBarButton(systemImage: "chevron.backward", help: "Previous Week (⌘[)", action: planner.previousWeek)
                    TitleBarButton(systemImage: "chevron.forward", help: "Next Week (⌘])", action: planner.nextWeek)
                }
            }
            .padding(.leading, 78)
            if planner.showSidebar {
                HStack(spacing: 6) { taskButtons }
                    .frame(width: Theme.sidebarWidth - 12, alignment: .trailing)
                    .transition(.opacity)
            }
        }
        .padding(.top, 6)
        .animation(Motion.structural, value: planner.showSidebar)
    }

    @Environment(TaskStore.self) private var store
    @Environment(\.openSettings) private var openSettings

    @ViewBuilder private var taskButtons: some View {
        TitleBarButton(systemImage: "tray", help: "Show the Backlog") {
            withAnimation(Motion.structural) {
                planner.showSidebar = true
                planner.backlogExpanded = true
            }
        }
        // A new task for today, straight into its dialog (title, notes, time,
        // place…). ⌘N still adds one inline in today's list.
        TitleBarButton(systemImage: "square.and.pencil", help: "New Task") {
            planner.goToToday()
            planner.openDraft(store.create(text: "", date: planner.today, project: planner.projectId))
        }
        FilterButton()
        TitleBarButton(systemImage: "gearshape", help: "Settings (⌘,)") { openSettings() }
    }
}

/// A plain title bar icon: grey, darker with a soft square on hover.
struct TitleBarButton: View {
    var systemImage: String
    var help: String
    var action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(hovering ? Theme.foreground : Theme.mutedForeground)
                .frame(width: 30, height: 26)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(hovering ? Theme.hover : .clear))
                .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .onHover { hovering = $0 }
        .animation(Motion.quick, value: hovering)
        .help(help)
        .accessibilityLabel(help)
    }
}

/// Turns focus mode on and off: everything but today is blurred.
struct FocusButton: View {
    /// The icon alone, for a narrow window.
    var compact = false
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        Button {
            withAnimation(Motion.structural) { planner.toggleFocusMode() }
        } label: {
            Group {
                if compact {
                    Label("Focus", systemImage: planner.focusMode ? "scope" : "circle.dashed").labelStyle(.iconOnly)
                } else {
                    Label("Focus", systemImage: planner.focusMode ? "scope" : "circle.dashed").labelStyle(.titleAndIcon)
                }
            }
                .foregroundStyle(planner.focusMode ? Theme.background : Theme.foreground)
        }
        .buttonStyle(PillButtonStyle(active: planner.focusMode))
        .help(planner.focusMode ? "Turn off focus mode (⇧⌘F)" : "Focus on one day: the selected one, else today (⇧⌘F)")
    }
}

/// Blurs and fades a card in focus mode; hovering it brings it back into view.
struct FocusBlur: ViewModifier {
    var blurred: Bool
    @State private var peeking = false

    func body(content: Content) -> some View {
        let hidden = blurred && !peeking
        content
            // Reduce Transparency: fade only, no blur.
            .blur(radius: hidden && !Motion.reduceTransparency ? 7 : 0)
            .opacity(hidden ? 0.35 : 1)
            .saturation(hidden ? 0.4 : 1)
            .onHover { peeking = $0 }
            .animation(Motion.structural, value: hidden)
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
        // Three steps: at rest, under the pointer, pressed.
        Hovering { hovering in
            configuration.label
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(height: 34)
                .background(Capsule().fill(active ? Theme.foreground : Theme.card))
                .background(Capsule().fill(Theme.background))
                .overlay(Capsule().fill(active ? .clear : configuration.isPressed ? Theme.pressed : hovering ? Theme.hover : .clear))
                .overlay(Capsule().strokeBorder(active ? .clear : Theme.border))
                .opacity(active && configuration.isPressed ? 0.75 : active && hovering ? 0.88 : 1)
                .contentShape(Capsule())
        }
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
        .buttonStyle(.pressable)
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

/// The days as one horizontal strip: as many whole day cards as fit at
/// `PlannerModel.minCardWidth` or wider (at most seven) fill the width, and the
/// strip scrolls through earlier and later days, snapping to day edges. A trackpad
/// swipes it, a mouse wheel over it steps a day per notch, and dragging a day
/// header or empty space pans it. `planner.weekStart` is the first visible day,
/// so the header and the week buttons follow the scroll and move it.
struct DayStrip: View {
    var focus: FocusState<String?>.Binding
    @Environment(CalendarEvents.self) private var calendar
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
            .frame(height: 620)
        } else {
            scrollingStrip
        }
    }

    private func card(_ day: String) -> some View {
        DayColumn(date: day, items: planner.filter.apply(store.days(from: day, to: day)[day] ?? []), focus: focus)
    }

    private var scrollingStrip: some View {
        let center = anchor ?? planner.weekStart
        let days = (-Self.reach...Self.reach).map { DateKey.addDays(center, $0) }
        return ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: Self.spacing) {
                ForEach(days, id: \.self) { day in
                    card(day)
                        .containerRelativeFrame(.horizontal, count: planner.visibleCount, spacing: Self.spacing)
                        .containerRelativeFrame(.vertical)
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
            let count = PlannerModel.visibleCount(for: width, spacing: Self.spacing)
            if planner.visibleCount != count {
                // Resizing never pushes today off screen if it was showing.
                let keepToday = planner.showsToday
                planner.visibleCount = count
                if keepToday, !planner.showsToday { planner.weekStart = planner.today }
            }
            pan.step = (width + Self.spacing) / CGFloat(count)
        }
        .onHover { hovering = $0 }
        .onChange(of: planner.weekStart, initial: true) { _, day in calendar.prepare(around: day) }
        .onAppear {
            anchor = planner.weekStart
            position = planner.weekStart
            pan.onCommit = { days in withAnimation(Motion.structural) { planner.scroll(by: days) } }
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
            withAnimation(Motion.structural) { position = day }
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
            withAnimation(Motion.structural) { planner.scroll(by: delta < 0 ? 1 : -1) }
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
        withAnimation(Motion.structural) { offset = 0 }
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

/// A full-height rounded day card: a large day number with the weekday in
/// small caps (today's number sits in an accent circle, like Calendar), then
/// its tasks. Empty space below them adds a task; a long list scrolls inside
/// the card. Clicking the header selects the day for the Done list.
struct DayColumn: View {
    var date: String
    var items: [PlannerItem]
    var focus: FocusState<String?>.Binding
    /// On its own in the day panel: the planner's focus mode never blurs it.
    var standalone = false
    @Environment(PlannerModel.self) private var planner
    @Environment(\.staticDayStrip) private var staticStrip
    /// Rows that fit the card's height, so its empty space is all clickable.
    @State private var fillRows = 9
    @State private var hovering = false

    var body: some View {
        let isToday = date == planner.today
        let isWeekend = DateKey.isoWeekday(date) >= 6
        let isSelected = planner.selectedDay == date
        let blurred = !standalone && planner.isBlurred(date)
        VStack(alignment: .leading, spacing: 8) {
            DayProgressBar(date: date)
                .padding(.horizontal, 6)
            HStack(alignment: .center, spacing: 8) {
                Text("\(DateKey.dayOfMonth(date))")
                    .font(Theme.heading)
                    .tracking(-0.6)
                    .monospacedDigit()
                    // No disc behind today: it reads by its full-strength
                    // number and weekday (other days' weekdays are grey).
                    .foregroundStyle(isWeekend && !isToday ? Theme.mutedForeground : Theme.foreground)
                    .frame(minHeight: 40)
                Text(Format.weekday(date).uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(isToday ? Theme.plannerAccent : Theme.mutedForeground)
                PlannedTotal(date: date)
                Spacer(minLength: 0)
                if isSelected {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.plannerAccent)
                        .help("Selected: Done shows this day")
                }
                DayPlayButton(date: date)
            }
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
            .onTapGesture { withAnimation(Motion.standard) { planner.select(date) } }
            .pressDim()
            .stripPanGesture()
            .help(isSelected ? "Click to show every done task" : "Click to show this day's done tasks")
            .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)

            if staticStrip {
                TaskListView(listKey: date, date: date, items: items, minRows: 9, focus: focus)
                Spacer(minLength: 0)
            } else {
                ScrollView(.vertical) {
                    DayEvents(date: date)
                    TaskListView(listKey: date, date: date, items: items, minRows: fillRows, focus: focus)
                }
                .scrollIndicators(.automatic)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                    fillRows = max(1, Int(height / Theme.rowHeight))
                }
                // The start button, for the day under the pointer and the
                // selected day; never while typing a new task in this day. It
                // sits in the list's bottom inset, so a long day's last rows
                // (and its Archive) scroll clear of it rather than under it.
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if (hovering || isSelected) && !blurred && focus.wrappedValue != date {
                        DayStartButton(date: date)
                            .padding(.top, 6)
                            .padding(.bottom, 8)
                            .frame(maxWidth: .infinity)
                            .transition(Motion.slide(.bottom))
                    }
                }
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(8)
        .padding(.top, 4)
        .background(
            RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                .fill(isToday ? Theme.todayTint : isWeekend ? Theme.weekendCard : Theme.weekdayCard)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                .strokeBorder(isSelected ? Theme.selectedDayBorder : isToday ? Theme.plannerAccent.opacity(0.3) : Theme.border,
                              lineWidth: isSelected ? 2 : 1)
        )
        .onHover { hovering = $0 }
        .animation(Motion.standard, value: (hovering || isSelected) && focus.wrappedValue != date)
        .frame(maxWidth: .infinity)
        .focusBlur(blurred)
        // In focus mode, a click anywhere in a blurred day focuses it.
        .simultaneousGesture(TapGesture().onEnded {
            if blurred { withAnimation(Motion.structural) { planner.focusDay(date) } }
        })
    }
}

/// The time a day's unfinished tasks are planned to take (their durations),
/// shown beside its weekday when any task has one.
struct PlannedTotal: View {
    var date: String
    @Environment(TaskStore.self) private var store

    var body: some View {
        let minutes = store.plannedMinutes(on: date)
        if minutes > 0 {
            Text(TaskTiming.short(minutes))
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundStyle(minutes > 8 * 60 ? Theme.foreground : Theme.mutedForeground)
                .help(minutes > 8 * 60 ? "Planned: \(TaskTiming.short(minutes)), more than a working day" : "Planned: \(TaskTiming.short(minutes))")
                .accessibilityLabel("Planned \(TaskTiming.short(minutes))")
        }
    }
}

/// The sidebar: the Backlog (tasks without a date, the web app's Someday) and
/// the Done list as accordion sections, each as tall as its content and
/// scrolling together, over a foldable month calendar pinned at the bottom. Done follows the
/// selected day or, with none, shows every completed task, grouped by day.
struct PlannerSidebar: View {
    var focus: FocusState<String?>.Binding
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        @Bindable var planner = planner
        let backlog = planner.filter.apply(store.someday(weekStart: DateKey.startOfWeek(planner.weekStart), today: planner.today))
        let done = planner.filter.apply(store.doneTasks(on: planner.selectedDay))
        VStack(spacing: 0) {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 12) {
                // Filter first, then the projects, the Backlog and Done, a hairline between them.
                AccordionSection(title: "Filter", systemImage: planner.filter.isActive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle",
                                 count: 0, expanded: $planner.filterExpanded) {
                    FilterControls()
                        .padding(.horizontal, 6)
                        .padding(.top, 4)
                } accessory: {
                    if planner.filter.isActive {
                        Button("Clear") { withAnimation(Motion.standard) { planner.filter = TaskFilter() } }
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.mutedForeground)
                            .padding(.horizontal, 6)
                            .frame(height: 28)
                            .contentShape(Rectangle())
                            .padding(.vertical, -6)
                            .buttonStyle(.pressable)
                            .help("Show every task")
                    }
                }

                SidebarSectionLine()

                ProjectsSection()

                SidebarSectionLine()

                AccordionSection(title: "Backlog", systemImage: "tray",
                                 count: backlog.filter { !$0.task.done }.count, expanded: $planner.backlogExpanded) {
                    TaskListView(listKey: DataTransfer.somedayKey, date: nil, items: backlog, minRows: 1, focus: focus)
                }

                SidebarSectionLine()

                AccordionSection(title: "Done", systemImage: "checkmark.circle",
                                 count: done.count, expanded: $planner.doneExpanded) {
                    DoneList(items: done, grouped: planner.selectedDay == nil, day: planner.selectedDay)
                } accessory: {
                    if let day = planner.selectedDay {
                        Button {
                            withAnimation(Motion.standard) { planner.selectedDay = nil }
                        } label: {
                            HStack(spacing: 4) {
                                Text(DoneList.dayLabel(day, today: planner.today))
                                Image(systemName: "xmark.circle.fill")
                            }
                            .font(.system(size: 11, weight: .semibold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Theme.plannerAccent.opacity(0.12)))
                            .foregroundStyle(Theme.plannerAccent)
                        }
                        .buttonStyle(.pressable)
                        .help("Show every done task")
                    } else {
                        Text("All days")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.mutedForeground)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 40)
            .padding(.bottom, 16)
        }
        .scrollIndicators(.automatic)

            CalendarDrawer()
        }
    }
}

/// The calendar at the bottom of the sidebar, under a divider with a grab
/// handle; clicking the handle folds it away or brings it back (remembered).
struct CalendarDrawer: View {
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(Motion.standard) { planner.calendarExpanded.toggle() }
            } label: {
                ZStack {
                    Rectangle().fill(Theme.border).frame(height: 1)
                    Capsule()
                        .fill(Theme.mutedForeground.opacity(0.35))
                        .frame(width: 28, height: 4)
                }
                .frame(height: 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressable)
            .padding(.horizontal, 14)
            .help(planner.calendarExpanded ? "Hide the calendar" : "Show the calendar")
            .accessibilityLabel(planner.calendarExpanded ? "Hide the calendar" : "Show the calendar")

            if planner.calendarExpanded {
                MiniCalendar()
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                    .padding(.bottom, 14)
                    .transition(Motion.slide(.bottom))
            } else {
                Button {
                    withAnimation(Motion.standard) { planner.calendarExpanded = true }
                } label: {
                    Label(Format.monthYear(planner.headerDay), systemImage: "calendar")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
            }
        }
        .clipped()
    }
}

/// A collapsible sidebar section: a large title with an icon, a quiet count,
/// an optional accessory and a chevron; clicking the title folds it.
struct AccordionSection<Content: View, Accessory: View>: View {
    var title: String
    var systemImage: String
    var count: Int
    @Binding var expanded: Bool
    @ViewBuilder var content: Content
    @ViewBuilder var accessory: Accessory

    init(title: String, systemImage: String, count: Int, expanded: Binding<Bool>,
         @ViewBuilder content: () -> Content, @ViewBuilder accessory: () -> Accessory = { EmptyView() }) {
        self.title = title
        self.systemImage = systemImage
        self.count = count
        _expanded = expanded
        self.content = content()
        self.accessory = accessory()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Button {
                    withAnimation(Motion.standard) { expanded.toggle() }
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: systemImage)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.mutedForeground)
                        // The same size as the calendar's month below it.
                        Text(title)
                            .font(.system(size: 15, weight: .semibold))
                        if count > 0 {
                            Text("\(count)")
                                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
                .help(expanded ? "Collapse \(title)" : "Expand \(title)")
                .accessibilityAddTraits(.isHeader)
                .accessibilityValue(expanded ? "Expanded" : "Collapsed")
                if expanded { accessory }
                // The chevron sits at the right edge of every section, in line.
                Button {
                    withAnimation(Motion.standard) { expanded.toggle() }
                } label: {
                    Image(systemName: "chevron.forward")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.mutedForeground)
                        .rotationEffect(.degrees(expanded ? 90 : 0))
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                        .padding(-5)
                }
                .buttonStyle(.pressable)
                .accessibilityHidden(true)
            }
            .padding(.leading, 6)
            .padding(.trailing, 2)

            if expanded {
                content
                    .padding(.horizontal, 4)
                    .transition(Motion.slide(.top))
            }
        }
        .clipped()
    }
}

/// A month calendar in Apple's style: the month centred between ‹ ›,
/// weekday initials from Monday, weekends and other months' days in grey,
/// today in a red circle and the selected day ringed. Clicking a date shows
/// that day in the strip and selects it; clicking the month goes to today.
/// A mark under a date shows a day with something on it: a filled dot while
/// tasks are left to do, a small ring when all its tasks are done or it only has
/// Calendar events.
struct MiniCalendar: View {
    /// What a day holds, for its dot.
    enum Mark { case open, quiet }

    @Environment(PlannerModel.self) private var planner
    @Environment(TaskStore.self) private var store
    @Environment(CalendarEvents.self) private var calendar
    /// The first day of the month on display.
    @State private var month: String?

    private static let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
    /// Today: a black circle (white in dark mode), like the rest of the mono UI.

    var body: some View {
        let shown = month ?? Self.firstOfMonth(planner.headerDay)
        let start = DateKey.startOfWeek(shown)
        let days = (0..<42).map { DateKey.addDays(start, $0) }
        let monthNumber = DateKey.parts(shown).month
        let tasks = store.days(from: days[0], to: days[41])

        VStack(spacing: 8) {
            HStack {
                Button { move(-1, from: shown) } label: {
                    Image(systemName: "chevron.backward").frame(width: 28, height: 28).contentShape(Rectangle())
                }
                .help("Previous month")
                Spacer()
                Button {
                    month = nil
                    withAnimation(Motion.structural) { planner.reveal(planner.today) }
                } label: {
                    Text(Format.monthYear(shown)).font(.system(size: 15, weight: .semibold))
                }
                .help("Go to today")
                Spacer()
                Button { move(1, from: shown) } label: {
                    Image(systemName: "chevron.forward").frame(width: 28, height: 28).contentShape(Rectangle())
                }
                .help("Next month")
            }
            .buttonStyle(.pressable)
            .font(.system(size: 14, weight: .regular))
            .foregroundStyle(Theme.mutedForeground)

            LazyVGrid(columns: Self.columns, spacing: 4) {
                ForEach(1...7, id: \.self) { weekday in
                    Text(Format.weekdayName(weekday).prefix(1))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(height: 20)
                }
                ForEach(days, id: \.self) { day in
                    dayCell(day, inMonth: DateKey.parts(day).month == monthNumber, items: tasks[day] ?? [])
                }
            }
        }
        // Follow the strip into another month, unless the user browsed away.
        .onChange(of: Self.firstOfMonth(planner.headerDay)) { _, first in
            withAnimation(Motion.standard) { month = first }
        }
    }

    private func dayCell(_ day: String, inMonth: Bool, items: [PlannerItem]) -> some View {
        let open = items.filter { !$0.task.done }.count
        // Events are known for the weeks around the strip (what the day cards loaded).
        let events = calendar.events(on: day).count
        let mark: Mark? = open > 0 ? .open : items.isEmpty && events == 0 ? nil : .quiet
        let isToday = day == planner.today
        let isSelected = day == planner.selectedDay
        let isWeekend = DateKey.isoWeekday(day) >= 6
        let color: Color = isToday ? Theme.background
            : !inMonth ? Theme.mutedForeground.opacity(0.45)
            : isWeekend ? Theme.mutedForeground
            : Theme.foreground.opacity(0.85)
        let summary = Self.summary(open: open, done: items.count - open, events: events)
        return Button {
            withAnimation(Motion.structural) { planner.reveal(day) }
        } label: {
            VStack(spacing: 1) {
                Text("\(DateKey.dayOfMonth(day))")
                    .font(.system(size: 14, weight: isToday ? .bold : .medium).monospacedDigit())
                    .foregroundStyle(color)
                    .frame(width: 26, height: 26)
                    .background {
                        if isToday {
                            Circle().fill(Theme.foreground)
                        } else if isSelected {
                            Circle().strokeBorder(Theme.foreground.opacity(0.35), lineWidth: 1.5)
                        }
                    }
                // Filled: tasks to do. A ring: all done, or only events (a
                // shape, so the two do not differ by shade alone).
                ZStack {
                    if mark == .open {
                        Circle().fill(Theme.foreground)
                    } else {
                        Circle().strokeBorder(Theme.mutedForeground, lineWidth: 1)
                    }
                }
                .frame(width: 5, height: 5)
                .opacity(mark == nil ? 0 : inMonth ? 1 : 0.45)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .help(summary.isEmpty ? Format.fullDate(day) : "\(Format.fullDate(day)): \(summary)")
        .accessibilityLabel(summary.isEmpty ? Format.fullDate(day) : "\(Format.fullDate(day)), \(summary)")
    }

    /// "2 to do, 1 done, 3 events", leaving out what the day does not have.
    static func summary(open: Int, done: Int, events: Int) -> String {
        var parts: [String] = []
        if open > 0 { parts.append("\(open) to do") }
        if done > 0 { parts.append("\(done) done") }
        if events > 0 { parts.append(events == 1 ? "1 event" : "\(events) events") }
        return parts.joined(separator: ", ")
    }

    private func move(_ months: Int, from first: String) {
        let p = DateKey.parts(first)
        var year = p.year, monthNumber = p.month + months
        if monthNumber > 12 { monthNumber = 1; year += 1 }
        if monthNumber < 1 { monthNumber = 12; year -= 1 }
        withAnimation(Motion.standard) { month = DateKey.make(year, monthNumber, 1) }
    }

    static func firstOfMonth(_ day: String) -> String {
        let p = DateKey.parts(day)
        return DateKey.make(p.year, p.month, 1)
    }
}

/// A month calendar for choosing a date, drawn like the sidebar's: the month
/// between ‹ ›, weekday initials from Monday, weekends and other months'
/// days in grey, today in a filled circle and the current date ringed.
/// Clicking the month goes back to today's month.
struct MonthPicker: View {
    /// The date chosen now, if any.
    var selected: String?
    var today: String
    var onPick: (String) -> Void
    /// The first day of the month on display.
    @State private var month: String?

    private static let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)

    var body: some View {
        let shown = month ?? MiniCalendar.firstOfMonth(selected ?? today)
        let start = DateKey.startOfWeek(shown)
        let monthNumber = DateKey.parts(shown).month

        VStack(spacing: 8) {
            HStack {
                Button { move(-1, from: shown) } label: {
                    Image(systemName: "chevron.backward").frame(width: 28, height: 28).contentShape(Rectangle())
                }
                .help("Previous month")
                .accessibilityLabel("Previous month")
                Spacer()
                Button { withAnimation(Motion.standard) { month = MiniCalendar.firstOfMonth(today) } } label: {
                    Text(Format.monthYear(shown)).font(.system(size: 15, weight: .semibold))
                }
                .help("Show this month")
                Spacer()
                Button { move(1, from: shown) } label: {
                    Image(systemName: "chevron.forward").frame(width: 28, height: 28).contentShape(Rectangle())
                }
                .help("Next month")
                .accessibilityLabel("Next month")
            }
            .buttonStyle(.pressable)
            .font(.system(size: 14, weight: .regular))
            .foregroundStyle(Theme.mutedForeground)

            LazyVGrid(columns: Self.columns, spacing: 4) {
                ForEach(1...7, id: \.self) { weekday in
                    Text(Format.weekdayName(weekday).prefix(1))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.mutedForeground)
                        .frame(height: 20)
                }
                ForEach((0..<42).map { DateKey.addDays(start, $0) }, id: \.self) { day in
                    cell(day, inMonth: DateKey.parts(day).month == monthNumber)
                }
            }
        }
    }

    private func cell(_ day: String, inMonth: Bool) -> some View {
        let isToday = day == today
        let isSelected = day == selected
        let isWeekend = DateKey.isoWeekday(day) >= 6
        let color: Color = isToday ? Theme.background
            : !inMonth ? Theme.mutedForeground.opacity(0.45)
            : isWeekend ? Theme.mutedForeground
            : Theme.foreground.opacity(0.85)
        return Button { onPick(day) } label: {
            Text("\(DateKey.dayOfMonth(day))")
                .font(.system(size: 14, weight: isToday || isSelected ? .bold : .medium).monospacedDigit())
                .foregroundStyle(color)
                .frame(width: 28, height: 28)
                .background {
                    if isToday { Circle().fill(Theme.foreground) }
                }
                .overlay {
                    // The task's date is ringed (around today's disc too).
                    if isSelected { Circle().strokeBorder(Theme.foreground.opacity(isToday ? 1 : 0.45), lineWidth: 1.5).padding(isToday ? -3 : 0) }
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .help(Format.fullDate(day))
        .accessibilityLabel(Format.fullDate(day))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func move(_ months: Int, from first: String) {
        let p = DateKey.parts(first)
        var year = p.year, monthNumber = p.month + months
        if monthNumber > 12 { monthNumber = 1; year += 1 }
        if monthNumber < 1 { monthNumber = 12; year -= 1 }
        withAnimation(Motion.standard) { month = DateKey.make(year, monthNumber, 1) }
    }
}

/// The hairline between two sections of the sidebar.
struct SidebarSectionLine: View {
    var body: some View {
        Rectangle()
            .fill(Theme.border)
            .frame(height: 1)
            .padding(.horizontal, 6)
            .accessibilityHidden(true)
    }
}

/// Completed tasks: a flat list for one day, or grouped under day labels.
struct DoneList: View {
    var items: [PlannerItem]
    var grouped: Bool
    var day: String?
    @Environment(PlannerModel.self) private var planner

    /// "today", "yesterday", "tomorrow" or "on Tue 10 Nov", for sentences.
    static func relativeLabel(_ day: String, today: String) -> String {
        let label = dayLabel(day, today: today)
        return ["Today", "Yesterday", "Tomorrow"].contains(label) ? label.lowercased() : "on \(label)"
    }

    static func dayLabel(_ day: String?, today: String) -> String {
        guard let day else { return "Backlog" }
        if day == today { return "Today" }
        if day == DateKey.addDays(today, -1) { return "Yesterday" }
        if day == DateKey.addDays(today, 1) { return "Tomorrow" }
        return Format.weekdayDate(day)
    }

    var body: some View {
        if items.isEmpty {
            Text(day.map { "Nothing done \(Self.relativeLabel($0, today: planner.today)) yet." } ?? "Nothing done yet.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.mutedForeground)
                .padding(.horizontal, 6)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else if grouped {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(groups, id: \.label) { group in
                    Text(group.label.uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.8)
                        .foregroundStyle(Theme.mutedForeground)
                        .padding(.horizontal, 6)
                        .padding(.top, 10)
                        .padding(.bottom, 2)
                    ForEach(group.items) { item in row(item) }
                }
            }
        } else {
            LazyVStack(spacing: 0) {
                ForEach(items) { item in row(item) }
            }
        }
    }

    private func row(_ item: PlannerItem) -> some View {
        TaskRow(item: item, listDate: item.task.date, onDrop: { _, _ in })
    }

    /// Items grouped by the day they belong to, in completion order.
    private var groups: [(label: String, items: [PlannerItem])] {
        var order: [String] = []
        var map: [String: [PlannerItem]] = [:]
        for item in items {
            let label = Self.dayLabel(item.task.date, today: planner.today)
            if map[label] == nil { order.append(label) }
            map[label, default: []].append(item)
        }
        return order.map { ($0, map[$0]!) }
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
                    .buttonStyle(.pressable)
                    .fontWeight(.semibold)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .floatingMaterial(in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.border))
            .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
            .padding(.bottom, 28)
            .transition(Motion.slide(.bottom))
            .id(toast.id)
        }
    }
}
