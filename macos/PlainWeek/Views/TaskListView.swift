import AppKit
import SwiftUI

/// One list (a day or Someday): its tasks, the new-task row right after them
/// and empty ruled rows up to `minRows`. Someday flows through `columns`
/// columns, top to bottom, then left to right. A day keeps its completed
/// tasks below the new-task row, in an Archive section that folds (closed
/// until asked for).
struct TaskListView: View {
    var listKey: String
    /// nil for Someday.
    var date: String?
    var items: [PlannerItem]
    var minRows: Int
    var columns = 1
    var focus: FocusState<String?>.Binding
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager

    private enum Slot: Hashable {
        case task(Int), new, archive, empty(Int)
    }

    /// A slot with a lasting identity: a task row is its task, not its place
    /// in the list, so a row that changes place (ticked into the Archive,
    /// moved, re-sorted) travels there instead of swapping its contents.
    private struct Entry: Identifiable {
        var id: String
        var slot: Slot
    }

    private func entries(_ slots: some Sequence<Slot>) -> [Entry] {
        slots.map { slot in
            switch slot {
            case let .task(index): Entry(id: "task-" + items[index].id, slot: slot)
            case .new: Entry(id: "new", slot: slot)
            case .archive: Entry(id: "archive", slot: slot)
            case let .empty(index): Entry(id: "empty-\(index)", slot: slot)
            }
        }
    }

    /// A day's completed tasks go to its Archive; the Backlog shows its own in place.
    private func archived(_ item: PlannerItem) -> Bool { date != nil && item.task.done }
    private var archiveCount: Int { items.filter(archived).count }
    private var archiveOpen: Bool { date.map(planner.archiveExpanded) ?? false }

    var body: some View {
        let slots = makeSlots()
        if columns == 1 {
            VStack(spacing: 0) { ForEach(entries(slots)) { slotView($0.slot) } }
        } else {
            let perColumn = Int((Double(slots.count) / Double(columns)).rounded(.up))
            HStack(alignment: .top, spacing: 16) {
                ForEach(0..<columns, id: \.self) { column in
                    VStack(spacing: 0) {
                        ForEach(entries(slots.dropFirst(column * perColumn).prefix(perColumn))) { slotView($0.slot) }
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                }
            }
        }
    }

    /// The tasks as shown: open ones, then the day's Archive.
    private var visualOrder: [String] {
        items.filter { !archived($0) }.map(\.id) + items.filter(archived).map(\.id)
    }

    private func makeSlots() -> [Slot] {
        var slots: [Slot] = items.indices.filter { !archived(items[$0]) }.map { .task($0) }
        slots.append(.new)
        if archiveCount > 0 {
            slots.append(.archive)
            if archiveOpen { slots += items.indices.filter { archived(items[$0]) }.map { .task($0) } }
        }
        let total = max(slots.count, minRows * columns)
        let rounded = columns == 1 ? total : Int((Double(total) / Double(columns)).rounded(.up)) * columns
        for i in slots.count..<rounded { slots.append(.empty(i)) }
        return slots
    }

    @ViewBuilder
    private func slotView(_ slot: Slot) -> some View {
        switch slot {
        case let .task(index):
            TaskRow(item: items[index], listDate: date, onDrop: { id, below in drop(id, at: below ? index + 1 : index) },
                    isCursor: date.map { planner.cursor == Cursor(day: $0, index: index) } ?? false,
                    listKey: listKey, listOrder: visualOrder)
                // A hairline between tasks (not above the first).
                .overlay(alignment: .top) {
                    if index != items.firstIndex(where: { !archived($0) }) { Rectangle().fill(Theme.border).frame(height: 1).padding(.horizontal, 6).allowsHitTesting(false) }
                }
        case .new:
            NewTaskRow(listKey: listKey, date: date, focus: focus, afterId: items.last { !archived($0) }?.id)
                .dropDestination(for: String.self) { ids, _ in
                    guard let id = ids.first else { return false }
                    drop(id, at: items.count)
                    return true
                }
        case .archive:
            if let date { ArchiveHeader(count: archiveCount, expanded: archiveOpen) {
                withAnimation(Motion.standard) { planner.toggleArchive(date) }
            } }
        case .empty:
            RuledRow()
                .contentShape(Rectangle())
                .onTapGesture { focus.wrappedValue = listKey }
                .stripPanGesture()
                .dropDestination(for: String.self) { ids, _ in
                    guard let id = ids.first else { return false }
                    drop(id, at: items.count)
                    return true
                }
        }
    }

    /// Drops `id` at display index `index`. Days show timed tasks first, so
    /// only untimed tasks are positional there: the neighbours handed to the
    /// store are the closest untimed tasks around the drop point.
    private func drop(_ id: String, at index: Int) {
        let positional: (PlannerItem) -> Bool = { date == nil || $0.task.time == nil }
        let others = items.enumerated().filter { $0.element.id != id }
        let after = others.last { $0.offset < index && positional($0.element) }?.element.id
        let before = others.first { $0.offset >= index && positional($0.element) }?.element.id
        store.perform("Move Task", undoManager: undoManager) {
            _ = store.move(id, to: date, afterId: after, beforeId: before)
        }
    }
}

/// "Archive 3 ›" under a day's tasks: folds the completed ones in and out.
struct ArchiveHeader: View {
    var count: Int
    var expanded: Bool
    var toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 6) {
                Image(systemName: "archivebox")
                    .font(.system(size: 11, weight: .semibold))
                Text("Archive")
                    .font(.system(size: 12, weight: .semibold))
                Text("\(count)")
                    .font(.system(size: 12, weight: .medium).monospacedDigit())
                    .opacity(0.7)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(.system(size: 10, weight: .bold))
                    .rotationEffect(.degrees(expanded ? 90 : 0))
            }
            .foregroundStyle(Theme.mutedForeground)
            .padding(.horizontal, 8)
            .frame(height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .padding(.top, 6)
        .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1).padding(.horizontal, 6).padding(.top, 6) }
        .help(expanded ? "Hide the completed tasks" : "Show the \(count) completed \(count == 1 ? "task" : "tasks")")
        .accessibilityLabel("Archive, \(count) completed")
        .accessibilityValue(expanded ? "Expanded" : "Collapsed")
    }
}

/// An empty row: blank space that adds a task when clicked.
struct RuledRow: View {
    var body: some View {
        Color.clear.frame(height: Theme.rowHeight)
    }
}

/// The row that adds a task. Enter creates it and keeps focus here (now right
/// below the new task); ⌘↩ creates it and opens it; Esc leaves; leaving with
/// text also creates it. Besides the web app's leading "31 Dec" and "17:30",
/// it reads `QuickAdd` words ("tomorrow call Joao @11:30 #yellow daily") and
/// previews what it understood at the end of the row while typing.
struct NewTaskRow: View {
    var listKey: String
    var date: String?
    var focus: FocusState<String?>.Binding
    var afterId: String?
    @State private var text = ""
    @State private var hovering = false
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager

    private var isFocused: Bool { focus.wrappedValue == listKey }

    var body: some View {
        let quick = QuickAdd.parse(text, today: planner.today)
        HStack(spacing: 8) {
            Image(systemName: "plus")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.mutedForeground)
                .frame(width: 18)
                .opacity(isFocused || hovering ? 1 : 0)
            TextField("", text: $text, prompt: Text(prompt).foregroundStyle(Theme.mutedForeground.opacity(0.7)))
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .focused(focus, equals: listKey)
                .onSubmit { commit() }
                .onKeyPress(.return, phases: .down) { press in
                    guard press.modifiers.contains(.command) else { return .ignored }
                    commit(open: true)
                    return .handled
                }
                .onExitCommand {
                    text = ""
                    focus.wrappedValue = nil
                }
                .onChange(of: isFocused) { _, focused in
                    if !focused { commit() }
                }
            if isFocused, quick.hasExtras, !text.isEmpty {
                QuickPreview(quick: quick, listDate: date, today: planner.today)
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, 6)
        .frame(height: Theme.rowHeight)
        .background {
            RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                .fill(isFocused ? Theme.background : hovering ? Theme.hover : .clear)
                .shadow(color: .black.opacity(isFocused ? 0.08 : 0), radius: 8, y: 2)
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .onTapGesture { focus.wrappedValue = listKey }
        .animation(Motion.quick, value: isFocused)
        .animation(Motion.quick, value: hovering)
        .animation(Motion.quick, value: quick)
    }

    private var prompt: String {
        guard isFocused || hovering else { return "" }
        return isFocused ? "New task · tomorrow @9:30 #green daily" : "New task"
    }

    private func commit(open: Bool = false) {
        let quick = QuickAdd.parse(text, today: planner.today)
        guard !quick.text.isEmpty else { text = ""; return }
        let target = quick.targetDate(listDate: date, today: planner.today)
        var newId: String?
        var rule: Recurrence?
        store.perform("New Task", undoManager: undoManager) {
            let id = store.create(text: quick.text, date: target, time: quick.time, duration: quick.duration, location: quick.location, tags: quick.tags, priority: quick.priority, color: quick.color ?? .none, project: planner.projectId)
            newId = id
            if let spec = quick.repeatSpec, let anchor = target {
                rule = spec.rule(anchor: anchor)
                newId = (try? store.setRecurrence(id, rule)) ?? id
            }
        }
        text = ""

        // Say where it went when that is not the list it was typed in.
        var notes: [String] = []
        let landed = newId.flatMap { store.item($0)?.task.date } ?? target
        if landed != date {
            notes.append(landed.map { "Added to \(Format.weekdayDate($0))" } ?? "Added to Backlog")
        }
        if let rule { notes.append("repeats \(RecurrenceEngine.summary(rule).lowercased())") }
        if !notes.isEmpty {
            planner.show(notes.joined(separator: ", ").prefix(1).uppercased() + notes.joined(separator: ", ").dropFirst(), canUndo: true)
        }
        if open, let newId { planner.open(newId) }
    }
}

/// What a new-task row understood, as quiet chips at its end.
struct QuickPreview: View {
    var quick: QuickTask
    var listDate: String?
    var today: String

    var body: some View {
        HStack(spacing: 6) {
            switch quick.date {
            case let .day(day): chip(day == today ? "Today" : Format.weekdayDate(day), "calendar")
            case .someday: chip("Backlog", "tray")
            case .list: EmptyView()
            }
            if let time = quick.time { chip(time, "clock") }
            if let duration = quick.duration { chip(TaskTiming.short(duration), "hourglass") }
            if let spec = quick.repeatSpec { chip(spec.label, "repeat") }
            if quick.priority != .none { chip(quick.priority.label, "exclamationmark") }
            ForEach(quick.tags, id: \.self) { chip("#" + $0, "number") }
            if let place = quick.location { chip(place.count > 22 ? String(place.prefix(21)) + "…" : place, "mappin") }
            if let color = quick.color { TaskCheckbox(color: color, done: false, size: 12).help(color.label) }
        }
        .fixedSize()
    }

    private func chip(_ text: String, _ icon: String) -> some View {
        Label(text, systemImage: icon)
            .labelStyle(.titleAndIcon)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Theme.mutedForeground)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(Theme.hover))
    }
}

/// One task: time pill, repeat icon, text (in a pill when colored) and the
/// complete check, shown on hover and when done. Click opens the task, right
/// click the menu; it can be dragged onto any row or list.
struct TaskRow: View {
    var item: PlannerItem
    var listDate: String?
    var onDrop: (String, Bool) -> Void
    /// The keyboard cursor is on this row.
    var isCursor = false
    /// The list it is shown in, and that list's order: Shift-click on a
    /// checkbox sets every task from the last one clicked to this one.
    var listKey: String?
    var listOrder: [String] = []
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @State private var hovering = false
    @State private var dropLine: Bool?
    @State private var pendingScope: ScopeAction?
    @State private var rowHeight = Theme.rowHeight
    /// The check burst's progress (0 at rest); the task is marked done when it ends.
    @State private var burst = 0.0
    /// Counts bursts, so one that was cancelled does not tick the task.
    @State private var burstRun = 0
    /// The mouse button is down on the row.
    @State private var pressed = false
    @Environment(FocusTimer.self) private var timer

    /// The title as a row shows it: a trailing " · Project" is left out when
    /// the task belongs to that project, since the line below (or the
    /// project's own view) already says it.
    static func displayTitle(_ text: String, project: String?) -> String {
        guard let project, !project.isEmpty else { return text }
        let suffix = " · " + project
        guard text.count > suffix.count, text.lowercased().hasSuffix(suffix.lowercased()) else { return text }
        let title = String(text.dropLast(suffix.count)).trimmingCharacters(in: .whitespaces)
        return title.isEmpty ? text : title
    }

    var body: some View {
        let task = item.task
        let taskProject = AppModel.shared.projects.project(task.project_id)
        HStack(alignment: .top, spacing: 8) {
            // A round checkbox at the start, like Reminders, carrying the
            // task's color on its border.
            Button {
                let shift = NSEvent.modifierFlags.contains(.shift)
                if !shift, !task.done, !Motion.reduceMotion {
                    celebrate()
                } else {
                    withAnimation(Motion.standard) { checkboxClicked(shift: shift) }
                }
            } label: {
                TaskCheckbox(color: task.color, done: task.done || burst > 0, emphasized: hovering)
                    .checkBurst(burst)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
                    .padding(.horizontal, -6)
                    .padding(.vertical, -6)
            }
            .buttonStyle(.pressable)
            .help(task.done ? "Mark as not done (Shift-click: every task from the last one clicked)" : "Mark as done (Shift-click: every task from the last one clicked)")
            // VoiceOver: a checkbox named after the task.
            .accessibilityLabel(task.text)
            .accessibilityValue(task.done ? "Done" : "Not done")
            .accessibilityAddTraits(.isToggle)
            .accessibilityHint(task.done ? "Marks it as not done" : "Marks it as done")

            if item.isRecurring, let series = store.series(of: item), let rule = series.recurrence {
                Image(systemName: "repeat")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
                    .padding(.top, 3)
                    .help(RecurrenceEngine.summary(rule))
                    .accessibilityLabel("Repeats \(RecurrenceEngine.summary(rule))")
            }
            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    // Priority as in Reminders: !, !! or !!! before the text.
                    if task.priority != .none {
                        Text(task.priority.marks)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(task.done ? Theme.mutedForeground : Theme.foreground)
                            .accessibilityLabel("\(task.priority.label) priority")
                    }
                    TaskLabel(text: Self.displayTitle(task.text, project: taskProject?.name), color: task.color, done: task.done, lines: 2, pill: false)
                }
                // In All tasks, the project it belongs to, then its tags as quiet chips.
                let project = planner.projectId == nil ? taskProject : nil
                if project != nil || !task.tags.isEmpty {
                    HStack(spacing: 6) {
                        if let project {
                            HStack(spacing: 5) {
                                ProjectDot(color: project.color, size: 7)
                                Text(project.name)
                                    .truncationMode(.tail)
                            }
                            .layoutPriority(1)
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Project: \(project.name)")
                        }
                        ForEach(task.tags.prefix(3), id: \.self) { tag in
                            Text(tag)
                                .font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 6)
                                .frame(height: 17)
                                .background(Capsule().fill(Theme.secondary))
                                .fixedSize()
                                .accessibilityLabel("Tag: \(tag)")
                        }
                        if task.tags.count > 3 {
                            Text("+\(task.tags.count - 3)")
                                .font(.system(size: 11, weight: .medium))
                                .fixedSize()
                                .accessibilityLabel("\(task.tags.count - 3) more tags")
                        }
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
                    .lineLimit(1)
                    .opacity(task.done ? 0.7 : 1)
                }
            }
            Spacer(minLength: 4)
            if timer.taskId == item.id {
                // The task being timed: ■ stops it (as in zistemo).
                Button {
                    TimerActions.stop(timer: timer)
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(Theme.background)
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(Theme.foreground))
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                        .padding(-4)
                }
                .buttonStyle(.pressable)
                .help("Stop the timer")
                .accessibilityLabel("Stop the timer on \(task.text)")
            } else if hovering, !task.done {
                Button {
                    TimerActions.start(item.id, day: task.date, store: store, planner: planner, timer: timer)
                } label: {
                    Image(systemName: "play.fill")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Theme.background)
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(Theme.foreground))
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                        .padding(-4)
                }
                .buttonStyle(.pressable)
                .help("Start the timer")
                .accessibilityLabel("Start the timer on \(task.text)")
                .transition(.opacity)
            }
            TaskMarkers(task: task)
                .padding(.top, 2)
            if let time = task.time {
                Text(time)
                    .font(.system(size: 12, weight: .medium).monospacedDigit())
                    .foregroundStyle(Theme.mutedForeground)
                    .padding(.top, 1)
            }
        }
        .foregroundStyle(task.done ? Theme.mutedForeground : Theme.foreground)
        .padding(.horizontal, 6)
        .padding(.vertical, 7)
        .frame(minHeight: Theme.rowHeight)
        .background(
            RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous)
                .fill(pressed ? Theme.pressed : hovering || isCursor ? Theme.hover : .clear)
        )
        .overlay(alignment: .leading) {
            if isCursor { Capsule().fill(Theme.foreground).frame(width: 3).padding(.vertical, 10).offset(x: -2) }
        }
        .overlay(alignment: dropLine == true ? .bottom : .top) {
            if dropLine != nil { Capsule().fill(Theme.plannerAccent).frame(height: 2).padding(.horizontal, 4) }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { rowHeight = $0 }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .animation(Motion.quick, value: hovering)
        .animation(Motion.quick, value: pressed)
        .onTapGesture { planner.open(item.id) }
        // Feedback on mouse-down, before the click opens the task.
        .onPressChange { pressed = $0 }
        .draggable(item.id) {
            TaskLabel(text: task.text, color: task.color, done: task.done, pill: false)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Theme.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .dropDestination(for: String.self) { ids, location in
            dropLine = nil
            guard let id = ids.first else { return false }
            onDrop(id, location.y > rowHeight / 2)
            return true
        } isTargeted: { targeted in
            if !targeted { dropLine = nil }
        }
        .onContinuousHover { phase in
            if case .ended = phase { hovering = false }
        }
        .contextMenu { TaskMenu(item: item, pendingScope: $pendingScope) }
        .scopePrompt($pendingScope, item: item)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(task.text + (item.isRecurring ? " (repeats)" : "") + (task.done ? ", done" : ""))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { planner.open(item.id) }
    }
}

/// A round checkbox whose border carries the task color (grey for none). Done,
/// it fills with that color (the accent for none) and shows a check.
struct TaskCheckbox: View {
    var color: TaskColor
    var done: Bool
    var emphasized = false
    var size: CGFloat = 16

    var body: some View {
        let shade = Theme.checkbox(color)
        let ring = shade?.ring ?? (emphasized ? Theme.foreground.opacity(0.55) : Theme.mutedForeground.opacity(0.55))
        ZStack {
            if done {
                Circle().fill(shade?.ring ?? Theme.plannerAccent)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.55, weight: .bold))
                    .foregroundStyle(shade?.check ?? Theme.background)
            } else {
                Circle().strokeBorder(ring, lineWidth: shade == nil ? 1.25 : 2)
            }
        }
        .frame(width: size, height: size)
        .opacity(done && shade != nil ? 0.8 : 1)
        .contentShape(Circle())
        .padding(.top, 1)
        .accessibilityLabel(done ? "Done" : "Not done")
    }
}

/// The burst played when a task is ticked: the checkbox pops away, a circle
/// swells and hollows into a thinning ring, then seven pairs of dots fly out while the checkbox springs back, done, with a slight
/// overshoot. `progress` runs from 0 to 1 (linear); every part reads its own
/// window of it. Draw it centered on the checkbox, `size` being the
/// checkbox's diameter; it never takes clicks. One color, the foreground:
/// black in light mode, white in dark mode.
struct CheckBurst: View, Animatable {
    var progress: Double
    var size: CGFloat

    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    /// The whole burst, in seconds.
    static let duration = 0.6

    private static let color = Theme.foreground

    /// Where `progress` sits between `start` and `end`, clamped to 0...1.
    private func phase(_ start: Double, _ end: Double) -> Double {
        min(max((progress - start) / (end - start), 0), 1)
    }

    var body: some View {
        let radius = size * 0.85
        // The circle: grows (0–0.25), then hollows (0.25–0.42).
        let grow = 1 - pow(1 - phase(0, 0.25), 2)
        let hollow = phase(0.25, 0.42)
        let outer = radius * grow
        let ring = outer * (1 - hollow)
        // The dots: appear on the ring (0.3), fly out (ease out) and shrink to nothing.
        let fly = 1 - pow(1 - phase(0.3, 0.9), 3)
        let fade = phase(0.55, 1)
        let distance = radius * (1 + 0.55 * fly)

        ZStack {
            if ring > 0.1 {
                Circle()
                    .strokeBorder(Self.color, lineWidth: ring)
                    .frame(width: outer * 2, height: outer * 2)
            }
            if progress >= 0.3 && fade < 1 {
                ForEach(0..<7, id: \.self) { index in
                    let angle = Double(index) / 7 * 2 * .pi - .pi / 2
                    dot(diameter: size * 0.24 * (1 - fade), angle: angle, distance: distance)
                    dot(diameter: size * 0.14 * (1 - fade), angle: angle + 0.3, distance: distance * 0.92)
                }
            }
        }
        .frame(width: size * 4, height: size * 4)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func dot(diameter: CGFloat, angle: Double, distance: CGFloat) -> some View {
        Circle()
            .fill(Self.color)
            .frame(width: diameter, height: diameter)
            .offset(x: cos(angle) * distance, y: sin(angle) * distance)
    }

    /// The checkbox's scale along the burst: gone at once, back from 0.35 as
    /// a small dot that overshoots to 1.15 and settles at 1.
    static func checkboxScale(_ progress: Double) -> CGFloat {
        switch progress {
        case ..<0.08: return 1 - progress / 0.08
        case ..<0.35: return 0
        case ..<0.65: return 0.3 + 0.85 * (1 - pow(1 - (progress - 0.35) / 0.3, 2))
        case ..<0.85: return 1.15 - 0.15 * ((progress - 0.65) / 0.2)
        default: return 1
        }
    }
}

/// Drives `CheckBurst` and the checkbox's scale from one animated value.
private struct CheckBurstEffect: ViewModifier, Animatable {
    var progress: Double
    var size: CGFloat
    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(progress > 0 && progress < 1 ? CheckBurst.checkboxScale(progress) : 1)
            .background { if progress > 0 && progress < 1 { CheckBurst(progress: progress, size: size) } }
    }
}

extension View {
    /// Plays the check burst around this checkbox while `progress` animates from 0 to 1.
    func checkBurst(_ progress: Double, size: CGFloat = 16) -> some View {
        modifier(CheckBurstEffect(progress: progress, size: size))
    }
}

/// Quiet markers at the end of a row: a notes icon when the task has a
/// description, and a checklist with "done/total" when it has subtasks.
struct TaskMarkers: View {
    var task: PlainTask

    var body: some View {
        let hasNotes = !task.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let total = task.subtasks.count
        let finished = task.subtasks.filter(\.done).count
        if hasNotes || total > 0 || task.location != nil || task.flagged {
            HStack(spacing: 6) {
                if task.flagged {
                    // The flag takes the task's color, like its checkbox.
                    Image(systemName: "flag.fill")
                        .foregroundStyle(Theme.checkbox(task.color)?.ring ?? Theme.foreground)
                        .help("Flagged")
                        .accessibilityLabel("Flagged")
                }
                if let place = task.location {
                    // Opens the place in Maps; the row itself opens the task.
                    Button { Place.open(place) } label: {
                        Image(systemName: "mappin.and.ellipse").contentShape(Rectangle())
                    }
                    .buttonStyle(.pressable)
                    .help("\(place) (click to open in Maps)")
                    .accessibilityLabel("Open \(place) in Maps")
                }
                if hasNotes {
                    Image(systemName: "text.alignleft")
                        .help("Has notes")
                        .accessibilityLabel("Has notes")
                }
                if total > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "checklist")
                        Text("\(finished)/\(total)").monospacedDigit()
                    }
                    .foregroundStyle(finished == total ? Theme.plannerAccent : Theme.mutedForeground)
                    .help("\(finished) of \(total) subtasks done")
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(finished) of \(total) subtasks done")
                }
            }
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Theme.mutedForeground)
            .fixedSize()
        }
    }
}

/// The task text; a colored task gets a pill that fades when done.
struct TaskLabel: View {
    var text: String
    var color: TaskColor
    var done: Bool
    /// Long titles wrap to this many lines in the narrow day cards.
    var lines = 1
    /// A colored background behind the text; rows show the color on their
    /// checkbox instead.
    var pill = true

    var body: some View {
        let label = Text(text)
            .font(.system(size: 14))
            .strikethrough(done)
            .lineLimit(lines)
            .fixedSize(horizontal: false, vertical: true)
            .truncationMode(.tail)
        if pill, let pill = Theme.pill(color) {
            label
                .foregroundStyle(pill.text)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(pill.background))
                .opacity(done ? 0.5 : 1)
        } else {
            label
        }
    }
}

/// A change waiting for "Only this task" or "This and all future".
enum ScopeAction: Identifiable {
    case color(TaskColor), delete
    var id: String {
        switch self {
        case let .color(color): "color-\(color.rawValue)"
        case .delete: "delete"
        }
    }
}

/// The shared task actions (context menu, detail sheet): moves with a toast
/// and Undo, duplicate, color and delete.
struct TaskActions {
    var store: TaskStore
    var planner: PlannerModel
    var undoManager: UndoManager?

    @discardableResult
    func move(_ item: PlannerItem, to date: String?) -> String? {
        let id = store.perform("Move Task", undoManager: undoManager) { store.move(item.id, to: date) }
        planner.show(date.map { "Moved to \(Format.weekdayDate($0))." } ?? "Moved to Backlog.", canUndo: true)
        return id
    }

    func tomorrow(_ item: PlannerItem) -> String? {
        move(item, to: DateKey.addDays(item.task.date ?? planner.today, 1))
    }

    func nextWeek(_ item: PlannerItem) -> String? {
        move(item, to: DateKey.addDays(item.task.date ?? planner.today, 7))
    }

    func duplicate(_ item: PlannerItem) {
        store.perform("Duplicate Task", undoManager: undoManager) { _ = store.duplicate(item.id) }
        planner.show("Task duplicated.", canUndo: true)
    }

    @discardableResult
    func color(_ item: PlannerItem, _ color: TaskColor, scope: ChangeScope = .this) -> String? {
        store.perform("Change Color", undoManager: undoManager) { store.update(item.id, TaskPatch(color: color), scope: scope) }
    }

    @discardableResult
    func priority(_ item: PlannerItem, _ priority: TaskPriority) -> String? {
        store.perform("Set Priority", undoManager: undoManager) { store.update(item.id, TaskPatch(priority: priority)) }
    }

    @discardableResult
    func flag(_ item: PlannerItem, _ on: Bool) -> String? {
        store.perform(on ? "Flag" : "Unflag", undoManager: undoManager) { store.update(item.id, TaskPatch(flagged: on)) }
    }

    @discardableResult
    func project(_ item: PlannerItem, _ project: String?) -> String? {
        let id = store.perform("Move to Project", undoManager: undoManager) { store.setProject(item, project) }
        // Out of the project being shown: say where it went.
        if let shown = planner.projectId, project != shown {
            planner.show("Moved to \(AppModel.shared.projects.project(project)?.name ?? "No Project").", canUndo: true)
        }
        return id
    }

    func delete(_ item: PlannerItem, scope: ChangeScope = .this) {
        store.perform("Delete Task", undoManager: undoManager) { store.delete(item.id, scope: scope) }
        planner.show("Task deleted.", canUndo: true)
    }
}

struct TaskMenu: View {
    var item: PlannerItem
    @Binding var pendingScope: ScopeAction?
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        let actions = TaskActions(store: store, planner: planner, undoManager: undoManager)
        let asks = store.asksScope(item)
        Menu("Color") {
            ForEach(TaskColor.allCases) { color in
                Button {
                    if asks { pendingScope = .color(color) } else { actions.color(item, color) }
                } label: {
                    Label { Text(color.label) } icon: { Image(nsImage: swatchImage(color, selected: color == item.task.color)) }
                }
            }
        }
        Menu("Priority") {
            ForEach(TaskPriority.allCases) { priority in
                Toggle(isOn: Binding(get: { item.task.priority == priority }, set: { _ in actions.priority(item, priority) })) {
                    Text(priority == .none ? priority.label : "\(priority.label)  \(priority.marks)")
                }
            }
        }
        Button(item.task.flagged ? "Unflag" : "Flag") { actions.flag(item, !item.task.flagged) }
        Menu("Project") {
            ProjectMenuItems(current: item.task.project_id) { actions.project(item, $0) }
        }
        Divider()
        if item.task.date != planner.today {
            Button("Today") { actions.move(item, to: planner.today) }
        }
        Button("Tomorrow") { actions.tomorrow(item) }
        Button("Next Week") { actions.nextWeek(item) }
        // Any day in the coming two weeks, by name.
        Menu("Move to") {
            ForEach(0..<14, id: \.self) { offset in
                let day = DateKey.addDays(planner.today, offset)
                if day != item.task.date {
                    Button(offset == 0 ? "Today" : offset == 1 ? "Tomorrow" : Format.weekdayDate(day)) { actions.move(item, to: day) }
                }
            }
        }
        if item.task.date != nil {
            Button("Backlog") { actions.move(item, to: nil) }
        }
        Divider()
        Button("Duplicate") { actions.duplicate(item) }
        Divider()
        Button("Delete", role: .destructive) {
            if asks { pendingScope = .delete } else { actions.delete(item) }
        }
    }
}

/// A colored circle for menus, where SwiftUI shapes are not drawn.
func swatchImage(_ color: TaskColor, selected: Bool) -> NSImage {
    let size = NSSize(width: 14, height: 14)
    let image = NSImage(size: size, flipped: false) { rect in
        let circle = NSBezierPath(ovalIn: rect.insetBy(dx: 1, dy: 1))
        if let pill = Theme.pill(color) {
            NSColor(pill.background).setFill()
            circle.fill()
        } else {
            NSColor.labelColor.withAlphaComponent(0.4).setStroke()
            circle.lineWidth = 1
            circle.stroke()
        }
        if selected {
            NSColor.labelColor.setStroke()
            let ring = NSBezierPath(ovalIn: rect.insetBy(dx: 0.5, dy: 0.5))
            ring.lineWidth = 1
            ring.stroke()
        }
        return true
    }
    image.isTemplate = false
    return image
}

extension View {
    /// Asks "Only this task" or "This and all future" for a recurring task.
    func scopePrompt(_ pending: Binding<ScopeAction?>, item: PlannerItem, onDone: ((String?) -> Void)? = nil) -> some View {
        modifier(ScopePrompt(pending: pending, item: item, onDone: onDone))
    }
}

private struct ScopePrompt: ViewModifier {
    @Binding var pending: ScopeAction?
    var item: PlannerItem
    var onDone: ((String?) -> Void)?
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager

    func body(content: Content) -> some View {
        content.confirmationDialog(title, isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }), presenting: pending) { action in
            Button("Only This Task") { run(action, .this) }
            Button("This and All Future") { run(action, .future) }
            Button("Cancel", role: .cancel) { pending = nil }
        }
    }

    private var title: String {
        if case .delete = pending { return "Delete repeating task" }
        return "Change repeating task"
    }

    private func run(_ action: ScopeAction, _ scope: ChangeScope) {
        let actions = TaskActions(store: store, planner: planner, undoManager: undoManager)
        switch action {
        case let .color(color): onDone?(actions.color(item, color, scope: scope))
        case .delete:
            actions.delete(item, scope: scope)
            onDone?(nil)
        }
        pending = nil
    }
}

extension TaskRow {
    /// Plays the check burst, then ticks the task: a day's done tasks leave
    /// for its Archive, so the row has to stay until the burst is over. A
    /// second click while it plays is a change of mind: the burst stops and
    /// the task stays as it was.
    func celebrate() {
        var reset = Transaction()
        reset.disablesAnimations = true
        burstRun += 1
        guard burst == 0 else {
            withTransaction(reset) { burst = 0 }
            return
        }
        let run = burstRun
        withAnimation(.linear(duration: CheckBurst.duration)) { burst = 1 }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(CheckBurst.duration))
            guard run == burstRun else { return }
            withTransaction(reset) { burst = 0 }
            if store.item(item.id)?.task.done == false {
                withAnimation(Motion.standard) { checkboxClicked(shift: false) }
            }
        }
    }

    /// A click ticks or unticks the task and remembers it. A Shift-click on
    /// another task of the same list gives every task between the two (both
    /// included) the state the first one got, as one undoable change.
    func checkboxClicked(shift: Bool) {
        if shift, let listKey, let anchor = planner.checkAnchor, anchor.listKey == listKey,
           anchor.id != item.id, let ids = anchor.range(to: item.id) {
            let done = store.item(anchor.id)?.task.done ?? true
            let count = store.perform(done ? "Mark as Done" : "Mark as Not Done", undoManager: undoManager) { store.setDone(ids, done) }
            if count > 0 { planner.show("\(count) \(count == 1 ? "task" : "tasks") marked as \(done ? "done" : "not done").", canUndo: true) }
            return
        }
        store.perform(item.task.done ? "Mark as Not Done" : "Mark as Done", undoManager: undoManager) {
            _ = store.toggleDone(item.id)
        }
        planner.checkAnchor = listKey.map { CheckAnchor(listKey: $0, id: item.id, order: listOrder) }
    }
}
