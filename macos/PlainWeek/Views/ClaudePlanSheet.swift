import SwiftUI

/// "Plan a project with Claude": you describe a goal, Claude proposes a
/// project and its tasks (each with notes, steps and a day), you untick or
/// rename what you don't want, and Create makes the project. Nothing is
/// created before that.
struct ClaudePlanSheet: View {
    @Environment(TaskStore.self) private var store
    @Environment(PlannerModel.self) private var planner
    @Environment(\.undoManager) private var undoManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openSettings) private var openSettings
    private var claude: ClaudeAssistant { AppModel.shared.claude }

    enum Start: String, CaseIterable, Identifiable {
        case today, tomorrow, nextMonday
        var id: String { rawValue }
        var label: String {
            switch self {
            case .today: "Today"
            case .tomorrow: "Tomorrow"
            case .nextMonday: "Next Monday"
            }
        }

        func day(from today: String) -> String {
            switch self {
            case .today: today
            case .tomorrow: DateKey.addDays(today, 1)
            case .nextMonday: DateKey.addDays(DateKey.startOfWeek(today), 7)
            }
        }
    }

    @State private var goal = ""
    @State private var start = Start.today
    @State private var plan: ClaudeClient.Plan?
    @State private var planning = false
    @State private var error: String?
    @State private var task: Task<Void, Never>?
    @FocusState private var goalFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header
            if let plan {
                review(plan)
            } else {
                compose
            }
            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            footer
        }
        .padding(28)
        .frame(width: 620)
        .background(Theme.background)
        .onAppear { goalFocused = true }
        .onDisappear { task?.cancel() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(plan == nil ? "Plan a Project" : "Review the Plan").font(Theme.title).tracking(-0.9)
            Text(plan == nil
                ? "Describe what you want to get done. Claude proposes the tasks; nothing is created until you say so."
                : "Untick what you don't want, rename the project if you like, then create it.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Goal

    private var compose: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .topLeading) {
                if goal.isEmpty {
                    Text("Launch the new online shop for Robin by December 15: product photos, texts, payment, shipping…")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.mutedForeground)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 10)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $goal)
                    .font(.system(size: 14))
                    .scrollContentBackground(.hidden)
                    .focused($goalFocused)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 10)
                    .disabled(planning)
            }
            .frame(height: 150)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.card))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))

            HStack(spacing: 10) {
                Text("Start").font(.system(size: 13, weight: .medium))
                Picker("Start", selection: $start) {
                    ForEach(Start.allCases) { Text($0.label).tag($0) }
                }
                .labelsHidden()
                .pickerStyle(.segmented)
                .fixedSize()
                .disabled(planning)
                Spacer()
            }
        }
    }

    // MARK: Review

    private func review(_ plan: ClaudeClient.Plan) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Project name", text: Binding(get: { self.plan?.project ?? "" }, set: { self.plan?.project = $0 }))
                .textFieldStyle(.plain)
                .font(.system(size: 18, weight: .semibold))
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.card))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.border))

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(plan.tasks.enumerated()), id: \.element.id) { index, task in
                        if index > 0 { Rectangle().fill(Theme.border).frame(height: 1) }
                        row(task, index: index)
                    }
                }
            }
            .frame(height: 340)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.card))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
        }
    }

    private func row(_ task: ClaudeClient.PlannedTask, index: Int) -> some View {
        Button {
            self.plan?.tasks[index].include.toggle()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: task.include ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 17))
                    .foregroundStyle(task.include ? Theme.foreground : Theme.mutedForeground.opacity(0.6))
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(task.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(task.include ? Theme.foreground : Theme.mutedForeground)
                            .strikethrough(!task.include)
                        Spacer(minLength: 8)
                        Text("\(Format.weekday(task.date)) \(Format.shortDate(task.date))")
                            .font(.system(size: 12, weight: .medium).monospacedDigit())
                            .foregroundStyle(Theme.mutedForeground)
                    }
                    if !task.notes.isEmpty {
                        Text(task.notes)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.mutedForeground)
                            .lineLimit(2)
                    }
                    if !task.subtasks.isEmpty {
                        Label("\(task.subtasks.count) \(task.subtasks.count == 1 ? "step" : "steps")", systemImage: "checklist")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.mutedForeground)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(task.include ? .isSelected : [])
    }

    // MARK: Footer

    private var footer: some View {
        HStack(spacing: 10) {
            if planning {
                ProgressView().controlSize(.small)
                Text("Claude is planning… this can take a minute.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.mutedForeground)
            } else if !claude.hasKey {
                Button("Add API Key…") {
                    SettingsView.show(.claude)
                    openSettings()
                }
                .buttonStyle(PillButtonStyle())
            } else if plan != nil {
                Button("Change Goal") { plan = nil; error = nil }
                    .buttonStyle(PillButtonStyle())
            }
            Spacer()
            Button("Cancel") {
                task?.cancel()
                dismiss()
            }
            .keyboardShortcut(.cancelAction)
            .buttonStyle(PillButtonStyle())
            if let plan {
                let count = plan.tasks.filter(\.include).count
                Button("Create Project (\(count))") { create(plan) }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(MonoPrimaryButtonStyle())
                    .disabled(count == 0)
            } else {
                Button("Plan with Claude", action: makePlan)
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(MonoPrimaryButtonStyle())
                    .disabled(planning || !claude.hasKey || goal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .help("Plan with Claude (⌘↩)")
            }
        }
    }

    private func makePlan() {
        let goal = goal.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !goal.isEmpty else { return }
        planning = true
        error = nil
        let today = planner.today
        let first = start.day(from: today)
        task = Task {
            do {
                let result = try await claude.plan(goal: goal, start: first, today: today)
                if !Task.isCancelled { plan = result }
            } catch is CancellationError {
            } catch let failure as URLError where failure.code == .cancelled {
            } catch {
                self.error = error.localizedDescription
            }
            planning = false
        }
    }

    private func create(_ plan: ClaudeClient.Plan) {
        guard let id = ClaudeAssistant.create(plan, store: store, projects: AppModel.shared.projects, undoManager: undoManager) else {
            error = "The project could not be created."
            return
        }
        let count = plan.tasks.filter(\.include).count
        withAnimation(Motion.standard) {
            planner.projectsExpanded = true
            planner.projectId = id
        }
        planner.show("Created “\(AppModel.shared.projects.project(id)?.name ?? plan.project)” with \(count) \(count == 1 ? "task" : "tasks").")
        dismiss()
    }
}
