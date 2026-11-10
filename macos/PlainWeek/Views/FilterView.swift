import SwiftUI

/// The title bar's filter: a popover to show only flagged tasks, some
/// priorities or some tags, across the days, the Backlog and Done.
struct FilterButton: View {
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        @Bindable var planner = planner
        TitleBarButton(systemImage: planner.filter.isActive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle",
                       help: planner.filter.isActive ? "Filter: \(planner.filter.summary) (⇧⌘L)" : "Filter by tag, priority or flag (⇧⌘L)") {
            planner.showFilter.toggle()
        }
        .popover(isPresented: $planner.showFilter, arrowEdge: .bottom) { FilterPopover() }
    }
}

struct FilterPopover: View {
    @Environment(PlannerModel.self) private var planner
    @Environment(TaskStore.self) private var store

    var body: some View {
        @Bindable var planner = planner
        let tags = Tags.all(in: store)
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Show").font(.system(size: 13, weight: .semibold))
                Spacer()
                Button("Clear") { withAnimation(Motion.standard) { planner.filter = TaskFilter() } }
                    .buttonStyle(PillButtonStyle())
                    .disabled(!planner.filter.isActive)
            }

            Toggle(isOn: $planner.filter.flaggedOnly.animation(Motion.standard)) {
                Label("Flagged only", systemImage: "flag.fill")
            }
            .toggleStyle(.checkbox)

            VStack(alignment: .leading, spacing: 6) {
                Text("Priority").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.mutedForeground)
                HStack(spacing: 6) {
                    ForEach([TaskPriority.high, .medium, .low, .none]) { priority in
                        chip(priority == .none ? "None" : "\(priority.marks) \(priority.label)",
                             on: planner.filter.priorities.contains(priority)) {
                            planner.filter.priorities.formSymmetricDifference([priority])
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Tags").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.mutedForeground)
                if tags.isEmpty {
                    Text("No tags yet: add them in a task, or type #tag in a new one.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    FlowLayout(spacing: 6) {
                        ForEach(tags, id: \.self) { tag in
                            chip("#" + tag, on: planner.filter.tags.contains(tag)) {
                                planner.filter.tags.formSymmetricDifference([tag])
                            }
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(width: 300)
    }

    private func chip(_ text: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button { withAnimation(Motion.standard) { action() } } label: {
            Text(text)
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 9)
                .frame(height: 24)
                .foregroundStyle(on ? Theme.background : Theme.foreground)
                .background(Capsule().fill(on ? Theme.foreground : Theme.hover))
                .contentShape(Capsule())
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

/// In the header while a filter is on: what it shows, and × to clear it, so
/// tasks never seem to vanish.
struct FilterPill: View {
    @Environment(PlannerModel.self) private var planner

    var body: some View {
        if planner.filter.isActive {
            Button { withAnimation(Motion.standard) { planner.filter = TaskFilter() } } label: {
                HStack(spacing: 5) {
                    Image(systemName: "line.3.horizontal.decrease")
                    Text(planner.filter.summary).lineLimit(1)
                    Image(systemName: "xmark.circle.fill").opacity(0.6)
                }
                .frame(maxWidth: 260)
                .fixedSize()
            }
            .buttonStyle(PillButtonStyle())
            .help("Showing only \(planner.filter.summary). Click to show every task.")
            .transition(.opacity.combined(with: .scale(scale: 0.9)))
        }
    }
}
