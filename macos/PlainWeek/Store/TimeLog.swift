import Foundation
import Observation

/// Time worked on tasks, from the focus timer. Local to this Mac (it is not
/// part of the task contract and never syncs), saved next to the tasks as
/// `time.json`.
@Observable
final class TimeLog {
    struct Session: Codable, Hashable {
        var taskId: String
        /// When the session started.
        var start: Date
        var seconds: TimeInterval
    }

    private(set) var sessions: [Session] = []
    @ObservationIgnored private let fileURL: URL?

    init(fileURL: URL?) {
        self.fileURL = fileURL
        if let fileURL, let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([Session].self, from: data) {
            sessions = saved
        }
    }

    /// Records `seconds` on `taskId` (ignores anything under a second).
    func add(_ taskId: String, seconds: TimeInterval, start: Date) {
        guard seconds >= 1 else { return }
        sessions.append(Session(taskId: taskId, start: start, seconds: seconds.rounded()))
        save()
    }

    /// Moves recorded time to a task's new id (an occurrence that became a row).
    func rename(_ old: String, to new: String) {
        guard old != new, sessions.contains(where: { $0.taskId == old }) else { return }
        for i in sessions.indices where sessions[i].taskId == old { sessions[i].taskId = new }
        save()
    }

    func total(for taskId: String) -> TimeInterval {
        sessions.filter { $0.taskId == taskId }.reduce(0) { $0 + $1.seconds }
    }

    /// Time worked on a local calendar day.
    func total(on day: String, calendar: Calendar = .current) -> TimeInterval {
        sessions.filter { DateKey.local($0.start, calendar: calendar) == day }.reduce(0) { $0 + $1.seconds }
    }

    private func save() {
        guard let fileURL, let data = try? JSONEncoder().encode(sessions) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    /// "1h 20m", "45m", "under a minute".
    static func format(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds / 60)
        if minutes == 0 { return seconds > 0 ? "under a minute" : "0m" }
        let h = minutes / 60, m = minutes % 60
        return h > 0 ? (m > 0 ? "\(h)h \(m)m" : "\(h)h") : "\(m)m"
    }
}
