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
            HStack(alignment: .top, spacing: 24) {
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

/// An empty ruled row.
struct RuledRow: View {
    var body: some View {
        Color.clear
            .frame(height: Theme.rowHeight - 1)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1).offset(y: 1) }
            .padding(.bottom, 1)
    }
}

/// The row that adds a task. Enter creates it and keeps focus here (now right
/// below the new task); Esc leaves; leaving with text also creates it. A
/// leading time and/or "DD MMM" date are read like on the web.
struct NewTaskRow: View {
    var listKey: String
    var date: String?
    var focus: FocusState<String?>.Binding
    var afterId: String?
    @State private var text = ""
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager

    private var isFocused: Bool { focus.wrappedValue == listKey }

    var body: some View {
        TextField("", text: $text)
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .focused(focus, equals: listKey)
            .onSubmit(commit)
            .onExitCommand {
                text = ""
                focus.wrappedValue = nil
            }
            .onChange(of: isFocused) { _, focused in
                if !focused { commit() }
            }
            .padding(.horizontal, isFocused ? 8 : 0)
            .frame(height: Theme.rowHeight - 1)
            .background {
                if isFocused {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Theme.background)
                        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                        .padding(.horizontal, -4)
                }
            }
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1).offset(y: 1) }
            .padding(.bottom, 1)
            .contentShape(Rectangle())
            .onTapGesture { focus.wrappedValue = listKey }
            .animation(.easeOut(duration: 0.12), value: isFocused)
    }

    private func commit() {
        let parsed = SmartInput.parse(text, today: planner.today)
        guard !parsed.text.isEmpty else { text = ""; return }
        let target = parsed.date ?? date
        store.perform("New Task", undoManager: undoManager) {
            if target == date {
                store.create(text: parsed.text, date: target, time: parsed.time, afterId: nil)
            } else {
                store.create(text: parsed.text, date: target, time: parsed.time)
            }
        }
        text = ""
        if target != date, let target {
            planner.show("Added to \(Format.weekdayDate(target))", canUndo: true)
        }
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

    var body: some View {
        let task = item.task
        HStack(spacing: 4) {
            if let time = task.time {
                Text(time)
                    .font(.system(size: 11).monospacedDigit())
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .overlay(Capsule().strokeBorder(lineWidth: 1))
            }
            if item.isRecurring, let series = store.series(of: item), let rule = series.recurrence {
                Image(systemName: "repeat")
                    .font(.system(size: 10))
                    .opacity(0.7)
                    .help(RecurrenceEngine.summary(rule))
            }
            TaskLabel(text: task.text, color: task.color, done: task.done)
            Spacer(minLength: 4)
            if hovering || task.done {
                Button {
                    store.perform(task.done ? "Mark Not Done" : "Complete Task", undoManager: undoManager) {
                        _ = store.toggleDone(item.id)
                    }
                } label: {
                    Image(systemName: task.done ? "checkmark.circle.fill" : "checkmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(task.done ? Theme.mutedForeground : Theme.foreground)
                        .frame(width: 24, height: 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(task.done ? "Mark as not done" : "Complete")
            }
        }
        .foregroundStyle(task.done ? Theme.mutedForeground : Theme.foreground)
        .frame(height: Theme.rowHeight - 1)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1).offset(y: 1) }
        .padding(.bottom, 1)
        .overlay(alignment: dropLine == true ? .bottom : .top) {
            if dropLine != nil { Rectangle().fill(Theme.primary).frame(height: 2) }
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .onTapGesture { planner.open(item.id) }
        .draggable(item.id) {
            TaskLabel(text: task.text, color: task.color, done: task.done)
                .padding(8)
                .background(Theme.background, in: RoundedRectangle(cornerRadius: 6))
        }
        .dropDestination(for: String.self) { ids, location in
            dropLine = nil
            guard let id = ids.first else { return false }
            onDrop(id, location.y > Theme.rowHeight / 2)
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

/// The task text; a colored task gets a pill that fades when done.
struct TaskLabel: View {
    var text: String
    var color: TaskColor
    var done: Bool

    var body: some View {
        let label = Text(text)
            .font(.system(size: 13))
            .strikethrough(done)
            .lineLimit(1)
            .truncationMode(.tail)
        if let pill = Theme.pill(color) {
            label
                .foregroundStyle(pill.text)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(pill.background))
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
