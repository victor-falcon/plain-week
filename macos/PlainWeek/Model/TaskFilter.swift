import Foundation

/// What the planner shows (the filter button in the title bar): tasks with
/// any of the chosen tags, any of the chosen priorities, and only flagged
/// ones if asked. Every part left empty lets everything through; the parts
/// combine (a tag AND a priority AND flagged).
struct TaskFilter: Equatable {
    var tags: Set<String> = []
    var priorities: Set<TaskPriority> = []
    var flaggedOnly = false

    var isActive: Bool { !tags.isEmpty || !priorities.isEmpty || flaggedOnly }

    func matches(_ task: PlainTask) -> Bool {
        if flaggedOnly, !task.flagged { return false }
        if !priorities.isEmpty, !priorities.contains(task.priority) { return false }
        if !tags.isEmpty, tags.isDisjoint(with: task.tags) { return false }
        return true
    }

    func apply(_ items: [PlannerItem]) -> [PlannerItem] {
        isActive ? items.filter { matches($0.task) } : items
    }

    /// "Flagged · !!! · #work", for the header pill.
    var summary: String {
        var parts: [String] = []
        if flaggedOnly { parts.append("Flagged") }
        parts += priorities.sorted { $0.rawValue > $1.rawValue }.map { $0 == .none ? "No priority" : $0.marks }
        parts += tags.sorted().map { "#" + $0 }
        return parts.joined(separator: " · ")
    }
}
