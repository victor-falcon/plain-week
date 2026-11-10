import SwiftUI

/// The command palette (⌘K): type to find a command, a day ("fri", "31 dec")
/// or a task by its title or notes; ↑ ↓ choose, Return runs, Esc closes.
enum Palette {
    enum Command: String, CaseIterable {
        case today = "Go to Today", previousWeek = "Previous Week", nextWeek = "Next Week"
        case newTask = "New Task Today", quickAdd = "Quick Add (⌥Space)"
        case review = "Weekly Review", focus = "Toggle Focus Mode", sidebar = "Toggle Sidebar"
        case exportTasks = "Export Tasks…", importTasks = "Import Tasks…", backups = "Show Backups in Finder"

        var icon: String {
            switch self {
            case .today: "sun.max"
            case .previousWeek: "chevron.backward"
            case .nextWeek: "chevron.forward"
            case .newTask, .quickAdd: "plus"
            case .review: "chart.bar"
            case .focus: "scope"
            case .sidebar: "sidebar.left"
            case .exportTasks: "square.and.arrow.up"
            case .importTasks: "square.and.arrow.down"
            case .backups: "clock.arrow.circlepath"
            }
        }
    }

    enum Target: Hashable {
        case command(Command)
        case day(String)
        case task(String)
    }

    struct Entry: Identifiable, Hashable {
        var target: Target
        var title: String
        var subtitle: String
        var icon: String
        var id: Target { target }
    }

    /// Results for `query`: commands, then a day it names, then tasks.
    static func results(_ query: String, store: TaskStore, today: String, limit: Int = 12) -> [Entry] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        var entries: [Entry] = Command.allCases
            .filter { q.isEmpty || $0.rawValue.lowercased().contains(q) }
            .map { Entry(target: .command($0), title: $0.rawValue, subtitle: "Command", icon: $0.icon) }
        guard !q.isEmpty else { return entries }

        if case let .day(day) = QuickAdd.parse(q + " x", today: today).date {
            entries.insert(Entry(target: .day(day), title: Format.fullDate(day), subtitle: "Show this day", icon: "calendar"), at: 0)
        }
        let tasks = store.rows.values
            .filter { !$0.isDeleted && $0.recurrence == nil && ($0.text.lowercased().contains(q) || $0.notes.lowercased().contains(q)) }
            .sorted { ($0.done ? 1 : 0, $0.date ?? "9999") < ($1.done ? 1 : 0, $1.date ?? "9999") }
            .prefix(limit)
            .map { task in
                Entry(target: .task(task.id), title: task.text,
                      subtitle: (task.date.map { DoneList.dayLabel($0, today: today) } ?? "Backlog") + (task.done ? " · done" : ""),
                      icon: task.done ? "checkmark.circle" : "circle")
            }
        entries += tasks
        return Array(entries.prefix(limit + 4))
    }
}

struct CommandPaletteView: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var selection = 0
    @FocusState private var focused: Bool

    var body: some View {
        let entries = Palette.results(query, store: store, today: planner.today)
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.mutedForeground)
                TextField("", text: $query, prompt: Text("Search tasks, days and commands"))
                    .textFieldStyle(.plain)
                    .font(.system(size: 18, weight: .medium))
                    .focused($focused)
                    .onSubmit { if entries.indices.contains(selection) { run(entries[selection]) } }
                    .onKeyPress(.downArrow) { selection = min(selection + 1, entries.count - 1); return .handled }
                    .onKeyPress(.upArrow) { selection = max(selection - 1, 0); return .handled }
                    .onChange(of: query) { selection = 0 }
            }
            .padding(.horizontal, 18)
            .frame(height: 56)
            Rectangle().fill(Theme.border).frame(height: 1)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                            row(entry, selected: index == selection)
                                .id(index)
                                .onTapGesture { run(entry) }
                                .onHover { if $0 { selection = index } }
                        }
                        if entries.isEmpty {
                            Text("Nothing matches “\(query)”.").font(.system(size: 13)).foregroundStyle(Theme.mutedForeground).padding(20)
                        }
                    }
                    .padding(8)
                }
                .onChange(of: selection) { _, index in proxy.scrollTo(index) }
            }
            .frame(height: 340)
        }
        .frame(width: 560)
        .background(Theme.background)
        .onAppear { focused = true }
        .onExitCommand { dismiss() }
    }

    private func row(_ entry: Palette.Entry, selected: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: entry.icon)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 22)
                .foregroundStyle(selected ? Theme.background : Theme.mutedForeground)
            Text(entry.title).font(.system(size: 14, weight: .medium)).lineLimit(1)
            Spacer()
            Text(entry.subtitle).font(.system(size: 12)).foregroundStyle(selected ? Theme.background.opacity(0.7) : Theme.mutedForeground)
        }
        .foregroundStyle(selected ? Theme.background : Theme.foreground)
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(RoundedRectangle(cornerRadius: Theme.rowRadius, style: .continuous).fill(selected ? Theme.foreground : .clear))
        .contentShape(Rectangle())
    }

    private func run(_ entry: Palette.Entry) {
        dismiss()
        DispatchQueue.main.async { Palette.perform(entry.target, store: store, planner: planner) }
    }
}

extension Palette {
    @MainActor
    static func perform(_ target: Target, store: TaskStore, planner: PlannerModel) {
        switch target {
        case let .day(day):
            withAnimation(Motion.structural) { planner.reveal(day) }
        case let .task(id):
            if let date = store.item(id)?.task.date { planner.reveal(date) }
            planner.open(id)
        case let .command(command):
            switch command {
            case .today: planner.goToToday()
            case .previousWeek: planner.previousWeek()
            case .nextWeek: planner.nextWeek()
            case .newTask:
                planner.goToToday()
                planner.focusRequest = planner.today
            case .quickAdd: QuickCapture.shared.show()
            case .review: planner.showReview = true
            case .focus: withAnimation(Motion.structural) { planner.toggleFocusMode() }
            case .sidebar: withAnimation(Motion.structural) { planner.showSidebar.toggle() }
            case .exportTasks: DataTransfer.export(store, planner: planner)
            case .importTasks: DataTransfer.import(into: store, planner: planner)
            case .backups: if let folder = Backups.folder() { NSWorkspace.shared.open(folder) }
            }
        }
    }
}
