import SwiftUI

/// The task sheet (the web app's task dialog): toolbar (date, time, delete,
/// repeat, color, more), title with the complete check, notes and subtasks.
/// Every edit is written to the local store as it happens; no save button.
struct TaskDetailView: View {
    @State var taskId: String
    @Environment(TaskStore.self) private var store
    @Environment(TimeLog.self) private var timeLog
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var notes = ""
    @State private var newSubtask = ""
    @State private var loaded = false
    @State private var picker: Picker?
    @State private var pendingScope: ScopeAction?
    @State private var pendingRule: PendingRule?
    @State private var notesFocusTick = 0
    @State private var notesFocused = false
    @FocusState private var focusedField: Field?

    private enum Picker { case date, time, location, repeating, color }
    private enum Field: Hashable { case title, notes, newSubtask, subtask(String) }

    private struct PendingRule: Identifiable {
        let id = UUID()
        var rule: Recurrence?
    }

    /// Starts with the cursor in the tags field.
    var focusTags = false
    @State private var tagsFocusTick = 0
    /// Wider and taller, for writing longer notes; remembered.
    @AppStorage("taskSheetExpanded") private var expanded = false
    /// The list of keyboard shortcuts, out of the trailing edge.
    @State private var showShortcuts = false

    init(taskId: String, focusTags: Bool = false) {
        _taskId = State(initialValue: taskId)
        self.focusTags = focusTags
    }

    var body: some View {
        Group {
            if let item = store.item(taskId) {
                content(item)
            } else {
                Text("This task no longer exists.")
                    .foregroundStyle(Theme.mutedForeground)
                    .padding(40)
            }
        }
        .frame(width: (expanded ? 880 : 560) + (showShortcuts ? ShortcutsPanel.width : 0))
        .background(Theme.background)
        .clipped()
        .animation(Motion.standard, value: expanded)
        .animation(Motion.standard, value: showShortcuts)
    }

    /// The action's current keys, for tooltips and menus.
    private func keys(_ action: ShortcutAction) -> String { Shortcuts.shared.label(action) }

    private var actions: TaskActions { TaskActions(store: store, planner: planner, undoManager: undoManager) }

    private func follow(_ id: String?) { if let id { taskId = id } }

    @ViewBuilder
    private func content(_ item: PlannerItem) -> some View {
        let task = item.task
        VStack(alignment: .leading, spacing: 20) {
            toolbar(item)
            details(item)

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                TextField("Untitled", text: $title, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(Theme.title)
                    .tracking(-0.9)
                    .strikethrough(task.done)
                    .foregroundStyle(task.done ? Theme.mutedForeground : Theme.foreground)
                    .focused($focusedField, equals: .title)
                    .onSubmit { notesFocusTick += 1 }
                    .onChange(of: title) { _, value in
                        let text = value.replacingOccurrences(of: "\n", with: " ")
                        guard loaded, !text.trimmingCharacters(in: .whitespaces).isEmpty, text != store.item(taskId)?.task.text else { return }
                        follow(store.update(taskId, TaskPatch(text: text)))
                    }
                Button {
                    follow(store.perform(task.done ? "Mark as Not Done" : "Mark as Done", undoManager: undoManager) {
                        store.toggleDone(taskId)
                    })
                } label: {
                    Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 24))
                        .foregroundStyle(task.done ? Theme.plannerAccent : Theme.mutedForeground.opacity(0.6))
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.pressable)
                .help(task.done ? "Mark as not done" : "Mark as done")
            }

            TagEditor(tags: task.tags, suggestions: Tags.all(in: store), focusTick: tagsFocusTick) { tags in
                follow(store.perform("Change Tags", undoManager: undoManager) { store.update(taskId, TaskPatch(tags: tags)) })
            }

            ZStack(alignment: .topLeading) {
                if notes.isEmpty {
                    Text("Add some extra notes here…")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.mutedForeground)
                        .padding(.top, 2)
                        .padding(.leading, 4)
                        .allowsHitTesting(false)
                }
                NotesEditor(text: $notes, focusTick: notesFocusTick) { focused in
                    withAnimation(Motion.quick) { notesFocused = focused }
                }
                .frame(minHeight: expanded ? 360 : 90, maxHeight: expanded ? 640 : 260)
                .onChange(of: notes) { _, value in
                    guard loaded, value != store.item(taskId)?.task.notes else { return }
                    follow(store.update(taskId, TaskPatch(notes: value)))
                }
            }

            subtasks(task)

            let tracked = timeLog.total(for: taskId)
            if tracked > 0 {
                Label("\(TimeLog.format(tracked)) focused on this task", systemImage: "timer")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.mutedForeground)
            }

            shortcutFooter
        }
        .padding(28)
        // The shortcuts list takes its own column on the trailing side.
        .padding(.trailing, showShortcuts ? ShortcutsPanel.width : 0)
        .overlay(alignment: .trailing) {
            if showShortcuts {
                ShortcutsPanel { showShortcuts = false }
                    .transition(Motion.slide(.trailing))
            }
        }
        .background { sheetShortcuts(item) }
        // The Mac's Delete key, when no text field is taking it.
        .onDeleteCommand {
            if store.asksScope(item) { pendingScope = .delete } else {
                actions.delete(item)
                dismiss()
            }
        }
        .onAppear {
            title = task.text
            notes = task.notes
            // A new task from the title bar starts with its name.
            if task.text.isEmpty { DispatchQueue.main.async { focusedField = .title } }
            if focusTags { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { tagsFocusTick += 1 } }
            #if DEBUG
            // Debug captures: PLAINWEEK_SNAPSHOT_PICKER=repeat|color|date|time opens that popover.
            switch ProcessInfo.processInfo.environment["PLAINWEEK_SNAPSHOT_PICKER"] {
            case "repeat": DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { picker = .repeating }
            case "color": DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { picker = .color }
            case "date": DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { picker = .date }
            case "time": DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { picker = .time }
            case "location": DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { picker = .location }
            default: break
            }
            #endif
            DispatchQueue.main.async { loaded = true }
        }
        .onDisappear(perform: addSubtask)
        .scopePrompt($pendingScope, item: item) { id in
            if let id { follow(id) } else { dismiss() }
        }
        .confirmationDialog(pendingRule?.rule == nil ? "Stop repeating" : "Change repeat",
                            isPresented: Binding(get: { pendingRule != nil }, set: { if !$0 { pendingRule = nil } }),
                            presenting: pendingRule) { pending in
            Button("Only This Task") { applyRule(pending.rule, scope: .this) }
            Button("This and All Future") { applyRule(pending.rule, scope: .future) }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: Toolbar

    @ViewBuilder
    private func toolbar(_ item: PlannerItem) -> some View {
        let task = item.task
        HStack(spacing: 6) {
            Button {
                picker = .date
            } label: {
                Image(systemName: "calendar")
            }
            .buttonStyle(ToolbarButtonStyle(active: picker == .date))
            .disabled(item.kind == .series)
            .popover(isPresented: pickerBinding(.date), arrowEdge: .bottom) { datePicker(item) }
            .help("Date (\(keys(.date)))")

            Button {
                picker = .time
            } label: {
                Image(systemName: "clock")
            }
            .buttonStyle(ToolbarButtonStyle(active: picker == .time))
            .popover(isPresented: pickerBinding(.time), arrowEdge: .bottom) { timePicker(task) }
            .help("Time (\(keys(.time)))")

            Button {
                picker = .location
            } label: {
                Image(systemName: "mappin.and.ellipse")
            }
            .buttonStyle(ToolbarButtonStyle(active: picker == .location))
            .popover(isPresented: pickerBinding(.location), arrowEdge: .bottom) {
                LocationPicker(current: task.location) { place in
                    picker = nil
                    guard place != task.location else { return }
                    follow(store.perform(place == nil ? "Clear Location" : "Set Location", undoManager: undoManager) {
                        store.update(taskId, TaskPatch(location: .some(place)))
                    })
                }
            }
            .help(task.location.map { "Location: \($0)" } ?? "Location (\(keys(.location)))")

            Menu {
                ForEach(TaskPriority.allCases) { priority in
                    Toggle(isOn: Binding(get: { task.priority == priority }, set: { _ in setPriority(priority) })) {
                        Text(priority == .none ? priority.label : "\(priority.label)  \(priority.marks)")
                    }
                }
            } label: {
                if task.priority == .none {
                    Image(systemName: "exclamationmark")
                } else {
                    Text(task.priority.marks).fontWeight(.bold)
                }
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .frame(minWidth: 28, minHeight: 28)
            .background(Circle().fill(task.priority == .none ? .clear : Theme.hover))
            .help("Priority: \(task.priority.label) (⌥⌘0–3)")
            .accessibilityLabel("Priority: \(task.priority.label)")

            Button { setFlag(!task.flagged) } label: {
                Image(systemName: task.flagged ? "flag.fill" : "flag")
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(ToolbarButtonStyle(active: task.flagged))
            .help(task.flagged ? "Unflag (\(keys(.flag)))" : "Flag (\(keys(.flag)))")

            Spacer()

            Button {
                if store.asksScope(item) { pendingScope = .delete } else {
                    actions.delete(item)
                    dismiss()
                }
            } label: { Image(systemName: "trash") }
                .buttonStyle(ToolbarButtonStyle(active: false))
                .help("Delete (⌫, or \(keys(.delete)) while typing)")

            Button {
                picker = .repeating
            } label: { Image(systemName: "repeat") }
                .buttonStyle(ToolbarButtonStyle(active: picker == .repeating || item.isRecurring))
                .disabled(task.date == nil)
                .popover(isPresented: pickerBinding(.repeating), arrowEdge: .bottom) {
                    RepeatPicker(item: item, series: store.series(of: item), isFirst: !store.asksScope(item) || store.isFirstOccurrence(item)) { rule in
                        picker = nil
                        if store.asksScope(item), !store.isFirstOccurrence(item) {
                            pendingRule = PendingRule(rule: rule)
                        } else {
                            applyRule(rule, scope: .future)
                        }
                    }
                }
                .help((store.series(of: item)?.recurrence.map { "Repeat: \(RecurrenceEngine.summary($0))" } ?? "Repeat") + " (\(keys(.repeating)))")

            Button {
                picker = .color
            } label: { ColorSwatch(color: task.color, size: 14) }
                .buttonStyle(ToolbarButtonStyle(active: picker == .color))
                .popover(isPresented: pickerBinding(.color), arrowEdge: .bottom) { colorPicker(item) }
                .help("Color (\(keys(.color)))")

            Menu {
                Button("Tomorrow  \(keys(.tomorrow))") { follow(actions.tomorrow(item)) }
                Button("Next Week  \(keys(.nextWeek))") { follow(actions.nextWeek(item)) }
                Button("Backlog  \(keys(.backlog))") { follow(actions.move(item, to: nil)) }
                    .disabled(task.date == nil)
                Divider()
                Button("Duplicate  \(keys(.duplicate))") { actions.duplicate(item) }
            } label: { Image(systemName: "ellipsis") }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .help("More")

            Button { expanded.toggle() } label: {
                Image(systemName: expanded ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
            }
            .buttonStyle(ToolbarButtonStyle(active: expanded))
            .help(expanded ? "Smaller (\(keys(.expand)))" : "Larger, for longer notes (\(keys(.expand)))")
            .accessibilityLabel(expanded ? "Make the window smaller" : "Make the window larger")

            Button("Done") { dismiss() }
                .keyboardShortcut(.cancelAction)
                .buttonStyle(PillButtonStyle())
                .padding(.leading, 6)
        }
        .font(.system(size: 13))
    }

    private func setPriority(_ priority: TaskPriority) {
        guard store.item(taskId)?.task.priority != priority else { return }
        follow(store.perform("Set Priority", undoManager: undoManager) { store.update(taskId, TaskPatch(priority: priority)) })
    }

    private func setFlag(_ on: Bool) {
        follow(store.perform(on ? "Flag" : "Unflag", undoManager: undoManager) { store.update(taskId, TaskPatch(flagged: on)) })
    }

    /// What is set, in words, between the toolbar's icons and the title:
    /// date, time and length, repeat, place, priority, flag. Each opens its
    /// picker.
    @ViewBuilder
    private func details(_ item: PlannerItem) -> some View {
        let task = item.task
        FlowLayout(spacing: 6) {
            detailChip(task.date.map(Format.fullDate) ?? "Backlog", "calendar", help: "Date (\(keys(.date)))") {
                if item.kind != .series { picker = .date }
            }
            projectChip(item)
            if let time = task.time {
                let label = task.duration.map { "\(time) · \(TaskTiming.short($0))" } ?? time
                detailChip(label, "clock", help: "Time (\(keys(.time)))") { picker = .time }
            }
            if let rule = store.series(of: item)?.recurrence {
                detailChip(RecurrenceEngine.summary(rule), "repeat", help: "Repeat (\(keys(.repeating)))") { picker = .repeating }
            }
            if let place = task.location {
                detailChip(Place.short(place, max: 40), "mappin.and.ellipse", help: "\(place) (\(keys(.location)))") { picker = .location }
            }
            if task.priority != .none {
                Menu {
                    ForEach(TaskPriority.allCases) { priority in
                        Button(priority == .none ? "No Priority" : "\(priority.label)  \(priority.marks)") { setPriority(priority) }
                    }
                } label: {
                    Text("\(task.priority.marks) \(task.priority.label)")
                        .font(.system(size: 12, weight: .medium))
                }
                .menuStyle(.button)
                .buttonStyle(DetailChipStyle())
                .menuIndicator(.hidden)
                .fixedSize()
                .help("Priority (⌥⌘0–3)")
            }
            if task.flagged {
                detailChip("Flagged", "flag.fill", tint: Theme.checkbox(task.color)?.ring, help: "Unflag (\(keys(.flag)))") { setFlag(false) }
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// `tint` colors the icon alone (the flag takes the task's color).
    /// The task's project (or "No Project"), a menu to move it.
    private func projectChip(_ item: PlannerItem) -> some View {
        let project = AppModel.shared.projects.project(item.task.project_id)
        return Menu {
            ProjectMenuItems(current: item.task.project_id) { id in
                follow(store.perform("Move to Project", undoManager: undoManager) { store.setProject(item, id) })
            }
        } label: {
            HStack(spacing: 5) {
                if let project { ProjectDot(color: project.color, size: 8) } else { Image(systemName: "folder").font(.system(size: 11, weight: .medium)) }
                Text(project?.name ?? "No Project").lineLimit(1)
            }
            .font(.system(size: 12, weight: .medium))
        }
        .menuStyle(.button)
        .buttonStyle(DetailChipStyle())
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Project")
    }

    private func detailChip(_ text: String, _ icon: String, tint: Color? = nil, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 11, weight: .medium))
                    .foregroundStyle(tint.map { AnyShapeStyle($0) } ?? AnyShapeStyle(.foreground))
                Text(text).lineLimit(1)
            }
            .font(.system(size: 12, weight: .medium))
        }
        .buttonStyle(DetailChipStyle())
        .help(help)
    }

    private func pickerBinding(_ which: Picker) -> Binding<Bool> {
        Binding(get: { picker == which }, set: { if !$0, picker == which { picker = nil } })
    }

    private func datePicker(_ item: PlannerItem) -> some View {
        VStack(spacing: 10) {
            QuickEntryField(prompt: "tomorrow, fri, next week, 31 dec, backlog…",
                            hint: "Try “tomorrow”, “fri”, “31 dec” or “backlog”.") { typed in
                let probe = QuickAdd.parse(typed + " x", today: planner.today)
                switch probe.date {
                case let .day(day):
                    picker = nil
                    if day != item.task.date {
                        follow(store.perform("Move Task", undoManager: undoManager) { store.move(item.id, to: day) })
                    }
                    return true
                case .someday:
                    picker = nil
                    follow(store.perform("Move Task", undoManager: undoManager) { store.move(item.id, to: nil) })
                    return true
                case .list:
                    return false
                }
            }
            // The same month calendar as the sidebar's.
            MonthPicker(selected: item.task.date, today: planner.today) { key in
                picker = nil
                guard key != item.task.date else { return }
                follow(store.perform("Move Task", undoManager: undoManager) { store.move(item.id, to: key) })
            }
            Button("Backlog") {
                picker = nil
                follow(store.perform("Move Task", undoManager: undoManager) { store.move(item.id, to: nil) })
            }
            .buttonStyle(PillButtonStyle())
            .disabled(item.task.date == nil)
        }
        .padding(14)
        .frame(width: 280)
        .background(Theme.background)
    }

    private func timePicker(_ task: PlainTask) -> some View {
        let current = task.time ?? "09:00"
        let parts = current.split(separator: ":").compactMap { Int($0) }
        let date = Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: Date())!
        return VStack(alignment: .leading, spacing: 10) {
            QuickEntryField(prompt: "9, 9:30, 5pm, 17:45…", hint: "Try “9”, “9:30”, “5pm” or “17:45”.") { typed in
                let word = typed.hasPrefix("@") ? typed : "@" + typed.replacingOccurrences(of: " ", with: "")
                guard let time = QuickAdd.parseTime(word) else { return false }
                picker = nil
                follow(store.perform("Set Time", undoManager: undoManager) { store.update(taskId, TaskPatch(time: .some(time))) })
                return true
            }
            HStack {
            DatePicker("Time", selection: Binding(get: { date }, set: { value in
                let c = Calendar.current.dateComponents([.hour, .minute], from: value)
                let time = String(format: "%02d:%02d", c.hour!, c.minute!)
                follow(store.update(taskId, TaskPatch(time: .some(time))))
            }), displayedComponents: .hourAndMinute)
            .labelsHidden()
            .environment(\.locale, Locale(identifier: "en_GB"))
            Button("Clear") {
                picker = nil
                follow(store.perform("Clear Time", undoManager: undoManager) { store.update(taskId, TaskPatch(time: .some(nil))) })
            }
            .disabled(task.time == nil)
            .keyboardShortcut(.delete, modifiers: [.command])
            }
            if task.time != nil {
                Divider()
                // How long it takes (its Calendar event and the day's total)
                // and when to be reminded, for this task only.
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                    GridRow {
                        Text("Takes").foregroundStyle(Theme.mutedForeground)
                        SwiftUI.Picker("Takes", selection: Binding(get: { task.duration ?? 0 }, set: { minutes in
                            follow(store.perform("Set Duration", undoManager: undoManager) {
                                store.update(taskId, TaskPatch(duration: .some(minutes == 0 ? nil : minutes)))
                            })
                        })) {
                            ForEach(TaskTiming.durations, id: \.self) { Text(TaskTiming.durationLabel($0)).tag($0) }
                        }
                        .labelsHidden()
                        .fixedSize()
                    }
                    GridRow {
                        Text("Remind").foregroundStyle(Theme.mutedForeground)
                        SwiftUI.Picker("Remind", selection: Binding(get: { task.remind ?? TaskTiming.followSettings }, set: { minutes in
                            follow(store.perform("Set Reminder", undoManager: undoManager) {
                                store.update(taskId, TaskPatch(remind: .some(minutes == TaskTiming.followSettings ? nil : minutes)))
                            })
                        })) {
                            ForEach(TaskTiming.reminders, id: \.self) { Text(TaskTiming.reminderLabel($0)).tag($0) }
                        }
                        .labelsHidden()
                        .fixedSize()
                    }
                }
                .font(.system(size: 13))
            }
        }
        .padding(12)
    }

    /// One key per color in picker order: 1–9, then 0 and -.
    private static let colorKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"]

    private func colorPicker(_ item: PlannerItem) -> some View {
        HStack(spacing: 8) {
            ForEach(Array(TaskColor.allCases.enumerated()), id: \.element) { index, color in
                Button {
                    picker = nil
                    if store.asksScope(item) { pendingScope = .color(color) } else { follow(actions.color(item, color)) }
                } label: {
                    VStack(spacing: 4) {
                        ColorSwatch(color: color, selected: color == item.task.color, size: 22)
                        Text(Self.colorKeys[index]).font(.system(size: 10, weight: .medium)).foregroundStyle(Theme.mutedForeground)
                    }
                }
                    .buttonStyle(.pressable)
                    .keyboardShortcut(KeyEquivalent(Character(Self.colorKeys[index])), modifiers: [])
                    .help("\(color.label) (\(Self.colorKeys[index]))")
            }
        }
        .padding(12)
    }

    // MARK: Keyboard

    /// The sheet's keys, all with ⌘ so they work while typing in the title,
    /// notes or a subtask. Hidden buttons carry them.
    @ViewBuilder
    private func sheetShortcuts(_ item: PlannerItem) -> some View {
        let task = item.task
        Group {
            Button("Date") { picker = .date }
                .shortcut(.date)
                .disabled(item.kind == .series)
            Button("Time") { picker = .time }
                .shortcut(.time)
            Button("Location") { picker = .location }
                .shortcut(.location)
            Button("Expand") { expanded.toggle() }
                .shortcut(.expand)
            Button("Shortcuts") { showShortcuts.toggle() }
                .shortcut(.shortcuts)
            Button("Tags") { tagsFocusTick += 1 }
                .shortcut(.tags)
            Button("Flag") { setFlag(!task.flagged) }
                .shortcut(.flag)
            ForEach(TaskPriority.allCases) { priority in
                Button(priority.label) { setPriority(priority) }
                    .keyboardShortcut(KeyEquivalent(Character(String(priority.rawValue))), modifiers: [.command, .option])
            }
            Button("Repeat") { picker = .repeating }
                .shortcut(.repeating)
                .disabled(task.date == nil)
            Button("Color") { picker = .color }
                .shortcut(.color)
            Button("Mark as Done") {
                follow(store.perform(task.done ? "Mark as Not Done" : "Mark as Done", undoManager: undoManager) { store.toggleDone(taskId) })
            }
            .shortcut(.done)
            Button("Delete") {
                if store.asksScope(item) { pendingScope = .delete } else {
                    actions.delete(item)
                    dismiss()
                }
            }
            .shortcut(.delete)
            Button("Tomorrow") { follow(actions.tomorrow(item)) }
                .shortcut(.tomorrow)
            Button("Next Week") { follow(actions.nextWeek(item)) }
                .shortcut(.nextWeek)
            Button("Backlog") { follow(actions.move(item, to: nil)) }
                .shortcut(.backlog)
                .disabled(task.date == nil)
            Button("Duplicate") { actions.duplicate(item) }
                .shortcut(.duplicate)
        }
        // Keys only: Tab never lands on these invisible buttons.
        .focusable(false)
        .opacity(0)
        .frame(width: 0, height: 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// The keyboard button in the bottom-right corner: opens the list of shortcuts.
    private var shortcutFooter: some View {
        HStack {
            Spacer()
            Button { showShortcuts.toggle() } label: { Image(systemName: "keyboard") }
                .buttonStyle(ToolbarButtonStyle(active: showShortcuts))
                .font(.system(size: 13))
                .help(showShortcuts ? "Hide the keyboard shortcuts (\(keys(.shortcuts)))" : "Keyboard shortcuts (\(keys(.shortcuts)))")
                .accessibilityLabel(showShortcuts ? "Hide the keyboard shortcuts" : "Show the keyboard shortcuts")
        }
    }

    private func applyRule(_ rule: Recurrence?, scope: ChangeScope) {
        do {
            let id = try store.perform(rule == nil ? "Stop Repeating" : "Repeat", undoManager: undoManager) {
                try store.setRecurrence(taskId, rule, scope: scope)
            }
            follow(id)
            if let id, let date = store.item(id)?.task.date, date != store.item(taskId)?.task.date {
                planner.show("Starts on \(Format.fullDate(date)).")
            }
        } catch {
            planner.show(error.localizedDescription)
        }
    }

    // MARK: Subtasks

    @ViewBuilder
    private func subtasks(_ task: PlainTask) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(task.subtasks) { subtask in
                SubtaskRow(subtask: subtask) { updated in
                    setSubtasks { list in
                        if let i = list.firstIndex(where: { $0.id == subtask.id }) { list[i] = updated }
                    }
                } onDelete: {
                    setSubtasks { $0.removeAll { $0.id == subtask.id } }
                } onSubmit: {
                    focusedField = .newSubtask
                }
            }
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .foregroundStyle(Theme.mutedForeground)
                    .frame(width: 16)
                TextField("Add subtask…", text: $newSubtask)
                    .textFieldStyle(.plain)
                    .focused($focusedField, equals: .newSubtask)
                    .onSubmit {
                        addSubtask()
                        focusedField = .newSubtask
                    }
                    .onChange(of: focusedField) { old, _ in if old == .newSubtask { addSubtask() } }
            }
            .padding(.vertical, 4)
        }
    }

    private func addSubtask() {
        let text = newSubtask.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        newSubtask = ""
        setSubtasks { $0.append(Subtask(id: Clock.uuidV7(), text: text, done: false)) }
    }

    private func setSubtasks(_ change: (inout [Subtask]) -> Void) {
        guard var list = store.item(taskId)?.task.subtasks else { return }
        change(&list)
        follow(store.update(taskId, TaskPatch(subtasks: list)))
    }
}

private struct SubtaskRow: View {
    var subtask: Subtask
    var onChange: (Subtask) -> Void
    var onDelete: () -> Void
    var onSubmit: () -> Void
    @State private var text = ""
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 10) {
            Button {
                var updated = subtask
                updated.done.toggle()
                onChange(updated)
            } label: {
                Image(systemName: subtask.done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(subtask.done ? Theme.plannerAccent : Theme.mutedForeground)
                    .frame(width: 16)
            }
            .buttonStyle(.pressable)
            TextField("", text: $text)
                .textFieldStyle(.plain)
                .strikethrough(subtask.done)
                .foregroundStyle(subtask.done ? Theme.mutedForeground : Theme.foreground)
                .onSubmit(onSubmit)
                .onChange(of: text) { _, value in
                    guard value != subtask.text, !value.isEmpty else { return }
                    var updated = subtask
                    updated.text = value
                    onChange(updated)
                }
            Button(action: onDelete) {
                Image(systemName: "xmark").font(.system(size: 11))
            }
            .buttonStyle(.pressable)
            .foregroundStyle(Theme.mutedForeground)
            .opacity(hovering ? 1 : 0)
            .help("Delete subtask")
        }
        .padding(.vertical, 4)
        .onHover { hovering = $0 }
        .onAppear { text = subtask.text }
    }
}

/// A grey capsule in the task sheet's details line.
struct DetailChipStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Hovering { hovering in
            configuration.label
                .foregroundStyle(hovering ? Theme.foreground : Theme.mutedForeground)
                .padding(.horizontal, 9)
                .frame(height: 24)
                .background(Capsule().fill(configuration.isPressed ? Theme.foreground.opacity(0.16) : hovering ? Theme.pressed : Theme.hover))
                .contentShape(Capsule())
        }
    }
}

/// Round toolbar button; the one whose popover is open is filled.
struct ToolbarButtonStyle: ButtonStyle {
    var active: Bool
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        Hovering { hovering in
            configuration.label
                .padding(.horizontal, 9)
                .frame(minWidth: 30, minHeight: 30)
                .foregroundStyle(active ? Theme.background : Theme.foreground)
                .background(Capsule().fill(active ? Theme.foreground : configuration.isPressed ? Theme.pressed : hovering ? Theme.hover : .clear))
                .contentShape(Capsule())
                .opacity(!isEnabled ? 0.4 : active && configuration.isPressed ? 0.75 : active && hovering ? 0.88 : 1)
        }
    }
}

struct AnyLabelStyle: LabelStyle {
    private let make: (Configuration) -> AnyView
    init<S: LabelStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

/// A one-line field that takes focus when its popover opens; Return hands the
/// text to `onSubmit`, which returns whether it understood it (the field
/// shakes its prompt red otherwise).
struct QuickEntryField: View {
    var prompt: String
    /// Shown under the field when the text was not understood.
    var hint: String = ""
    var onSubmit: (String) -> Bool
    @State private var text = ""
    @State private var invalid = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
        TextField("", text: $text, prompt: Text(prompt))
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .padding(.horizontal, 10)
            .frame(height: 30)
            .background(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).fill(Theme.hover))
            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous)
                .strokeBorder(focused ? Theme.foreground.opacity(0.6) : Theme.border))
            .focused($focused)
            .onSubmit {
                let typed = text.trimmingCharacters(in: .whitespaces)
                guard !typed.isEmpty else { return }
                invalid = !onSubmit(typed)
            }
            .onChange(of: text) { invalid = false }
            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(invalid ? Theme.foreground : .clear, lineWidth: 2))
            .help(invalid ? "Not understood" : "")
            .frame(minWidth: 220)
            .onAppear { DispatchQueue.main.async { focused = true } }
            if invalid, !hint.isEmpty {
                Text(hint)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.mutedForeground)
                    .transition(.opacity)
            }
        }
        .animation(Motion.quick, value: invalid)
    }
}
