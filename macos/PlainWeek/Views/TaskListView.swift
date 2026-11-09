import AppKit
import SwiftUI

/// One list (a day or Someday): its tasks, the new-task row right after them
/// and empty ruled rows up to `minRows`. Someday flows through `columns`
/// columns, top to bottom, then left to right.
struct TaskListView: View {
    var listKey: String
    /// nil for Someday.
    var date: String?
    var items: [PlannerItem]
    var minRows: Int
    var columns = 1
    var focus: FocusState<String?>.Binding
    @Environment(TaskStore.self) private var store
    @Environment(\.undoManager) private var undoManager

    private enum Slot: Hashable {
        case task(Int), new, empty(Int)
    }

    var body: some View {
        let slots = makeSlots()
        if columns == 1 {
            VStack(spacing: 0) { ForEach(slots, id: \.self, content: slotView) }
        } else {
            let perColumn = Int((Double(slots.count) / Double(columns)).rounded(.up))
            HStack(alignment: .top, spacing: 16) {
                ForEach(0..<columns, id: \.self) { column in
                    VStack(spacing: 0) {
                        ForEach(Array(slots.dropFirst(column * perColumn).prefix(perColumn)), id: \.self, content: slotView)
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                }
            }
        }
    }

    private func makeSlots() -> [Slot] {
        var slots: [Slot] = items.indices.map { .task($0) }
        slots.append(.new)
        let total = max(slots.count, minRows * columns)
        let rounded = columns == 1 ? total : Int((Double(total) / Double(columns)).rounded(.up)) * columns
        for i in slots.count..<rounded { slots.append(.empty(i)) }
        return slots
    }

    @ViewBuilder
    private func slotView(_ slot: Slot) -> some View {
        switch slot {
        case let .task(index):
            TaskRow(item: items[index], listDate: date, onDrop: { id, below in drop(id, at: below ? index + 1 : index) })
        case .new:
            NewTaskRow(listKey: listKey, date: date, focus: focus, afterId: items.last?.id)
                .dropDestination(for: String.self) { ids, _ in
                    guard let id = ids.first else { return false }
                    drop(id, at: items.count)
                    return true
                }
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
                .font(.system(size: 13.5))
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
        .animation(.easeOut(duration: 0.15), value: isFocused)
        .animation(.easeOut(duration: 0.1), value: hovering)
        .animation(.easeOut(duration: 0.12), value: quick)
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
            let id = store.create(text: quick.text, date: target, time: quick.time, color: quick.color ?? .none)
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
            notes.append(landed.map { "Added to \(Format.weekdayDate($0))" } ?? "Added to Someday")
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
            case .someday: chip("Someday", "tray")
            case .list: EmptyView()
            }
            if let time = quick.time { chip(time, "clock") }
            if let spec = quick.repeatSpec { chip(spec.label, "repeat") }
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
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @State private var hovering = false
    @State private var dropLine: Bool?
    @State private var pendingScope: ScopeAction?
    @State private var rowHeight = Theme.rowHeight

    var body: some View {
        let task = item.task
        HStack(alignment: .top, spacing: 8) {
            // A round checkbox at the start, like Reminders, carrying the
            // task's color on its border.
            Button {
                withAnimation(.snappy(duration: 0.2)) {
                    store.perform(task.done ? "Mark Not Done" : "Complete Task", undoManager: undoManager) {
                        _ = store.toggleDone(item.id)
                    }
                }
            } label: {
                TaskCheckbox(color: task.color, done: task.done, emphasized: hovering)
            }
            .buttonStyle(.plain)
            .help(task.done ? "Mark as not done" : "Complete")

            if item.isRecurring, let series = store.series(of: item), let rule = series.recurrence {
                Image(systemName: "repeat")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
                    .padding(.top, 3)
                    .help(RecurrenceEngine.summary(rule))
            }
            TaskLabel(text: task.text, color: task.color, done: task.done, lines: 2, pill: false)
            Spacer(minLength: 4)
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
                .fill(hovering ? Theme.hover : .clear)
        )
        .overlay(alignment: dropLine == true ? .bottom : .top) {
            if dropLine != nil { Capsule().fill(Theme.plannerAccent).frame(height: 2).padding(.horizontal, 4) }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { rowHeight = $0 }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.1), value: hovering)
        .onTapGesture { planner.open(item.id) }
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

/// Quiet markers at the end of a row: a notes icon when the task has a
/// description, and a checklist with "done/total" when it has subtasks.
struct TaskMarkers: View {
    var task: PlainTask

    var body: some View {
        let hasNotes = !task.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let total = task.subtasks.count
        let finished = task.subtasks.filter(\.done).count
        if hasNotes || total > 0 {
            HStack(spacing: 6) {
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
            .font(.system(size: 13.5))
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
        planner.show(date.map { "Moved to \(Format.weekdayDate($0))." } ?? "Moved to Someday.", canUndo: true)
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
        Divider()
        Button("Tomorrow") { actions.tomorrow(item) }
        Button("Next Week") { actions.nextWeek(item) }
        if item.task.date != nil {
            Button("Someday") { actions.move(item, to: nil) }
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
