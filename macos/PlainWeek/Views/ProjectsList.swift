import SwiftUI

extension TaskStore {
    /// Puts a task in `project` (nil: none). A repeating task moves as a
    /// whole series. Returns the id that stands for the item now.
    @discardableResult
    func setProject(_ item: PlannerItem, _ project: String?) -> String? {
        if let seriesId = item.seriesId {
            update(seriesId, TaskPatch(project: .some(project)))
            return item.id
        }
        return update(item.id, TaskPatch(project: .some(project)))
    }
}

/// A project's color as a dot (grey for "no color").
struct ProjectDot: View {
    var color: TaskColor
    var size: CGFloat = 9

    var body: some View {
        Circle()
            .fill(Theme.pill(color)?.background ?? Theme.mutedForeground.opacity(0.45))
            .frame(width: size, height: size)
    }
}

/// The sidebar's Projects: "All tasks", then each project with its open
/// tasks. Clicking one shows its own week, Backlog and Done; new tasks go
/// into it. Right-click a project to rename, recolor, reorder or delete it.
struct ProjectsSection: View {
    @State private var hovered: String?
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    private var projects: ProjectStore { AppModel.shared.projects }

    @State private var adding = false
    @State private var newName = ""
    @State private var renaming: String?
    @State private var renameText = ""
    @State private var deleting: Project?
    @FocusState private var fieldFocused: Bool

    var body: some View {
        @Bindable var planner = planner
        let open = openCounts()
        AccordionSection(title: "Projects", systemImage: "folder", count: 0, expanded: $planner.projectsExpanded) {
            VStack(alignment: .leading, spacing: 1) {
                row(id: nil, name: "All tasks", color: nil, count: 0)
                ForEach(projects.projects) { project in
                    if renaming == project.id {
                        nameField(text: $renameText, prompt: project.name) {
                            if !projects.rename(project.id, to: renameText) { planner.show("A project needs a new name of its own.") }
                            renaming = nil
                        } cancel: { renaming = nil }
                    } else {
                        row(id: project.id, name: project.name, color: project.color, count: open[project.id] ?? 0)
                            .contextMenu { menu(project) }
                    }
                }
                if adding {
                    nameField(text: $newName, prompt: "Project name") {
                        if let id = projects.create(name: newName) { select(id) }
                        newName = ""
                        adding = false
                    } cancel: { newName = ""; adding = false }
                }
            }
        } accessory: {
            Button {
                newName = ""
                adding = true
                planner.projectsExpanded = true
            } label: {
                Image(systemName: "plus").font(.system(size: 12, weight: .semibold))
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
                    .padding(-8)
            }
            .buttonStyle(.pressable)
            .foregroundStyle(Theme.mutedForeground)
            .help("New Project")
            .accessibilityLabel("New Project")
        }
        .alert(deleting.map { "Delete “\($0.name)”?" } ?? "", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Delete", role: .destructive) { if let deleting { delete(deleting) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Its tasks stay, without a project.")
        }
    }

    /// Open (not done) tasks per project id, every live row counted once.
    private func openCounts() -> [String: Int] {
        var counts: [String: Int] = [:]
        for task in store.allRows where !task.isDeleted && !task.done && task.series_id == nil {
            counts[task.project_id ?? "", default: 0] += 1
        }
        return counts
    }

    /// The row under the pointer ("All tasks" has no id of its own).
    private static let allKey = "all-tasks"

    private func row(id: String?, name: String, color: TaskColor?, count: Int) -> some View {
        let selected = planner.projectId == id
        return Button { select(id) } label: {
            HStack(spacing: 9) {
                if let color {
                    ProjectDot(color: color).frame(width: 14)
                } else {
                    Image(systemName: "square.stack").font(.system(size: 11, weight: .semibold)).frame(width: 14)
                }
                Text(name).lineLimit(1)
                Spacer(minLength: 4)
                if count > 0, id != nil {
                    Text("\(count)").font(.system(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(Theme.mutedForeground)
                }
            }
            .font(.system(size: 13, weight: selected ? .semibold : .regular))
            .padding(.horizontal, 8)
            .frame(height: 28)
            .background(RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(selected ? Theme.pressed : hovered == (id ?? Self.allKey) ? Theme.hover : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .onHover { inside in
            let key = id ?? Self.allKey
            if inside { hovered = key } else if hovered == key { hovered = nil }
        }
        .animation(Motion.quick, value: hovered)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .help(id == nil ? "Show every task" : "Show the week of \(name)")
    }

    private func nameField(text: Binding<String>, prompt: String, commit: @escaping () -> Void, cancel: @escaping () -> Void) -> some View {
        TextField(prompt, text: text)
            // The app's own field: borderless text on a themed surface.
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .padding(.horizontal, 8)
            .frame(height: 28)
            .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Theme.background))
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Theme.border))
            .focused($fieldFocused)
            .onSubmit(commit)
            .onExitCommand(perform: cancel)
            .onAppear { fieldFocused = true }
            .onChange(of: fieldFocused) { _, focused in if !focused { cancel() } }
            .padding(.vertical, 2)
    }

    @ViewBuilder
    private func menu(_ project: Project) -> some View {
        Button("Rename…") { renameText = project.name; renaming = project.id }
        Menu("Color") {
            ForEach(TaskColor.allCases) { color in
                Button { projects.setColor(project.id, color) } label: {
                    Label { Text(color.label) } icon: { Image(nsImage: swatchImage(color, selected: color == project.color)) }
                }
            }
        }
        Divider()
        Button("Move Up") { projects.move(project.id, by: -1) }
            .disabled(projects.projects.first?.id == project.id)
        Button("Move Down") { projects.move(project.id, by: 1) }
            .disabled(projects.projects.last?.id == project.id)
        Divider()
        Button("Delete Project…") { deleting = project }
    }

    private func select(_ id: String?) {
        withAnimation(Motion.standard) { planner.projectId = id }
    }

    private func delete(_ project: Project) {
        if planner.projectId == project.id { select(nil) }
        store.perform("Delete Project", undoManager: TimerActions.mainWindow?.undoManager) {
            for task in store.allRows where task.project_id == project.id && !task.isDeleted {
                store.update(task.id, TaskPatch(project: .some(nil)))
            }
        }
        projects.delete(project.id)
        planner.show("Deleted “\(project.name)”. Its tasks are in All tasks.")
    }
}

/// In the header while a project is shown: its name, and ✕ back to every task.
struct ProjectPill: View {
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        if let project = AppModel.shared.projects.project(planner.projectId) {
            Button {
                withAnimation(Motion.standard) { planner.projectId = nil }
            } label: {
                HStack(spacing: 6) {
                    ProjectDot(color: project.color)
                    Text(project.name).lineLimit(1).frame(maxWidth: 160)
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.mutedForeground)
                }
            }
            .buttonStyle(PillButtonStyle())
            .help("Showing \(project.name). Click to show every task.")
        }
    }
}

/// Moving a task to a project: the right-click menu and the task sheet.
struct ProjectMenuItems: View {
    var current: String?
    var choose: (String?) -> Void

    var body: some View {
        let projects = AppModel.shared.projects.projects
        Toggle("No Project", isOn: Binding(get: { current == nil }, set: { _ in choose(nil) }))
        if !projects.isEmpty { Divider() }
        ForEach(projects) { project in
            Toggle(isOn: Binding(get: { current == project.id }, set: { _ in choose(project.id) })) {
                Label { Text(project.name) } icon: { Image(nsImage: swatchImage(project.color, selected: false)) }
            }
        }
    }
}
