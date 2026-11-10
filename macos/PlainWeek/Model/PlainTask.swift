import Foundation

/// The eleven task colors, identical to the web app's `TASK_COLORS`.
enum TaskColor: String, Codable, CaseIterable, Identifiable {
    case none, pink, yellow, black, grey, cornflower, mango, green, lilac, red, orange

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: "No color"
        default: rawValue.prefix(1).uppercased() + rawValue.dropFirst()
        }
    }
}

/// How much a task matters, as in Reminders: shown as !, !! or !!! before
/// its text.
enum TaskPriority: Int, Codable, CaseIterable, Identifiable {
    case none = 0, low = 1, medium = 2, high = 3

    var id: Int { rawValue }
    var label: String {
        switch self {
        case .none: "None"
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        }
    }
    /// "!", "!!", "!!!" (empty for none).
    var marks: String { String(repeating: "!", count: rawValue) }
}

struct Subtask: Codable, Hashable, Identifiable {
    var id: String
    var text: String
    var done: Bool
}

/// A repeat rule, with exactly the wire shape of the web app:
/// `{ type: 'daily', every }`, `{ type: 'weekly', weekdays }` or
/// `{ type: 'monthly', day }`, each with an optional `until`.
struct Recurrence: Codable, Hashable {
    enum Kind: String, Codable { case daily, weekly, monthly }

    var type: Kind
    var every: Int?
    /// ISO weekdays, 1 = Monday … 7 = Sunday.
    var weekdays: [Int]?
    var day: Int?
    /// Inclusive end, 'YYYY-MM-DD'.
    var until: String?

    static func daily(every: Int, until: String? = nil) -> Recurrence {
        Recurrence(type: .daily, every: every, until: until)
    }

    static func weekly(_ weekdays: [Int], until: String? = nil) -> Recurrence {
        Recurrence(type: .weekly, weekdays: weekdays, until: until)
    }

    static func monthly(day: Int, until: String? = nil) -> Recurrence {
        Recurrence(type: .monthly, day: day, until: until)
    }
}

/// A task row. Same fields, names (`snake_case` on the wire) and semantics as
/// the web app's `Task` (docs/architecture.md, "Data model: Task").
struct PlainTask: Codable, Hashable, Identifiable {
    var id: String
    var text: String
    /// 'YYYY-MM-DD', or nil for Someday.
    var date: String?
    var someday_column: Int?
    var position: String
    var done: Bool
    var done_at: String?
    var color: TaskColor
    /// 'HH:mm'.
    var time: String?
    /// Planned minutes, for a task with a time (its Calendar event's length
    /// and the day's planned total). nil: not set.
    var duration: Int?
    /// Minutes before the time to remind; nil follows Settings, -1 is off.
    var remind: Int?
    /// Where it happens ("12 rue de la Gare, Luxembourg"), as typed or picked
    /// from Maps. nil: no place.
    var location: String?
    /// Lowercase words without "#", in the order added.
    var tags: [String]
    var flagged: Bool
    var priority: TaskPriority
    /// The project it belongs to (`Project.id`); nil: none. macOS app only:
    /// the web app has no projects and ignores the key.
    var project_id: String?
    var notes: String
    var subtasks: [Subtask]
    var recurrence: Recurrence?
    var series_id: String?
    var occurrence_date: String?
    var created_at: String
    var updated_at: String
    var deleted_at: String?

    enum CodingKeys: String, CodingKey {
        case id, text, date, someday_column, position, done, done_at, color, time, duration, remind, location, tags, flagged, priority, project_id, notes, subtasks,
             recurrence, series_id, occurrence_date, created_at, updated_at, deleted_at
    }

    init(
        id: String, text: String, date: String?, someday_column: Int?, position: String,
        done: Bool = false, done_at: String? = nil, color: TaskColor = .none, time: String? = nil,
        duration: Int? = nil, remind: Int? = nil, location: String? = nil, tags: [String] = [], flagged: Bool = false, priority: TaskPriority = .none, project_id: String? = nil, notes: String = "", subtasks: [Subtask] = [], recurrence: Recurrence? = nil,
        series_id: String? = nil, occurrence_date: String? = nil,
        created_at: String, updated_at: String, deleted_at: String? = nil
    ) {
        self.id = id
        self.text = text
        self.date = date
        self.someday_column = someday_column
        self.position = position
        self.done = done
        self.done_at = done_at
        self.color = color
        self.time = time
        self.duration = duration
        self.remind = remind
        self.location = location
        self.tags = tags
        self.flagged = flagged
        self.priority = priority
        self.project_id = project_id
        self.notes = notes
        self.subtasks = subtasks
        self.recurrence = recurrence
        self.series_id = series_id
        self.occurrence_date = occurrence_date
        self.created_at = created_at
        self.updated_at = updated_at
        self.deleted_at = deleted_at
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        text = try c.decode(String.self, forKey: .text)
        date = try c.decodeIfPresent(String.self, forKey: .date)
        someday_column = try c.decodeIfPresent(Int.self, forKey: .someday_column)
        position = try c.decode(String.self, forKey: .position)
        done = try c.decodeIfPresent(Bool.self, forKey: .done) ?? false
        done_at = try c.decodeIfPresent(String.self, forKey: .done_at)
        color = (try? c.decodeIfPresent(TaskColor.self, forKey: .color)) ?? TaskColor.none
        time = try c.decodeIfPresent(String.self, forKey: .time)
        duration = try c.decodeIfPresent(Int.self, forKey: .duration)
        remind = try c.decodeIfPresent(Int.self, forKey: .remind)
        location = try c.decodeIfPresent(String.self, forKey: .location)
        tags = (try? c.decodeIfPresent([String].self, forKey: .tags)) ?? []
        flagged = (try? c.decodeIfPresent(Bool.self, forKey: .flagged)) ?? false
        priority = (try? c.decodeIfPresent(TaskPriority.self, forKey: .priority)) ?? TaskPriority.none
        project_id = try c.decodeIfPresent(String.self, forKey: .project_id)
        notes = try c.decodeIfPresent(String.self, forKey: .notes) ?? ""
        subtasks = try c.decodeIfPresent([Subtask].self, forKey: .subtasks) ?? []
        recurrence = try c.decodeIfPresent(Recurrence.self, forKey: .recurrence)
        series_id = try c.decodeIfPresent(String.self, forKey: .series_id)
        occurrence_date = try c.decodeIfPresent(String.self, forKey: .occurrence_date)
        created_at = try c.decode(String.self, forKey: .created_at)
        updated_at = try c.decode(String.self, forKey: .updated_at)
        deleted_at = try c.decodeIfPresent(String.self, forKey: .deleted_at)
    }

    /// Writes every key, with explicit `null`s, like the web app's wire shape.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(text, forKey: .text)
        try c.encode(date, forKey: .date)
        try c.encode(someday_column, forKey: .someday_column)
        try c.encode(position, forKey: .position)
        try c.encode(done, forKey: .done)
        try c.encode(done_at, forKey: .done_at)
        try c.encode(color, forKey: .color)
        try c.encode(time, forKey: .time)
        try c.encode(duration, forKey: .duration)
        try c.encode(remind, forKey: .remind)
        try c.encode(location, forKey: .location)
        try c.encode(tags, forKey: .tags)
        try c.encode(flagged, forKey: .flagged)
        try c.encode(priority, forKey: .priority)
        try c.encode(project_id, forKey: .project_id)
        try c.encode(notes, forKey: .notes)
        try c.encode(subtasks, forKey: .subtasks)
        try c.encode(recurrence, forKey: .recurrence)
        try c.encode(series_id, forKey: .series_id)
        try c.encode(occurrence_date, forKey: .occurrence_date)
        try c.encode(created_at, forKey: .created_at)
        try c.encode(updated_at, forKey: .updated_at)
        try c.encode(deleted_at, forKey: .deleted_at)
    }

    var isDeleted: Bool { deleted_at != nil }
    var isSeries: Bool { recurrence != nil && date != nil }
    var isException: Bool { series_id != nil && occurrence_date != nil }
}

/// What the planner shows: a row, or an occurrence generated from a series.
struct PlannerItem: Identifiable, Hashable {
    enum Kind: Hashable { case task, occurrence, exception, series }

    var task: PlainTask
    var kind: Kind

    /// For occurrences `${seriesId}:${date}`, otherwise the row id.
    var id: String { task.id }

    var seriesId: String? {
        switch kind {
        case .occurrence, .exception: task.series_id
        case .series: task.id
        case .task: nil
        }
    }

    /// The generated date an occurrence or exception stands for.
    var occurrenceDate: String? { kind == .occurrence || kind == .exception ? task.occurrence_date : nil }

    /// Stable across an occurrence turning into an exception row.
    var rowKey: String {
        if let seriesId, let occurrenceDate, kind != .series { return "\(seriesId):\(occurrenceDate)" }
        return task.id
    }

    var isRecurring: Bool { kind != .task }
}

/// The JSON backup, identical to the web app's export file (plus the
/// macOS app's projects, which the web app ignores).
struct ExportFile: Codable {
    var format: String
    var version: Int
    var exported_at: String
    var app_version: String
    var tasks: [PlainTask]
    var projects: [Project]? = nil

    static let formatName = "plain-week"
    static let currentVersion = 1
}
